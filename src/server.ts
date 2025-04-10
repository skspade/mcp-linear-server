import { LinearClient } from '@linear/sdk';
import { z } from 'zod';
import dotenv from 'dotenv';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

/*
 * IMPORTANT: MCP Integration Rule
 * ------------------------------
 * When adding new functionality to this server:
 * 1. Update the README.md file with the new endpoint details
 * 2. Include the endpoint in the "Instructing Claude" section
 * 3. Follow the existing format:
 *    ```http
 *    METHOD /endpoint
 *    ```
 *    Description and any required request body/parameters
 * 
 * This ensures Claude can be properly instructed about all available functionality.
 */

// Configuration constants
const DEBUG = true;
const API_TIMEOUT_MS = 30000; // Increased to 30 second timeout for API calls
const HEARTBEAT_INTERVAL_MS = 10000; // Reduced to 10 second heartbeat interval
const SHUTDOWN_GRACE_PERIOD_MS = 5000; // 5 second grace period for shutdown
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 2000;

// Connection state tracking
const connectionState = {
  isConnected: false,
  reconnectAttempts: 0,
  lastHeartbeat: Date.now(),
  isPipeActive: true,  // Track pipe state
  isShuttingDown: false  // Track shutdown state
};

// Utility to create a timeout promise
function createTimeout(ms: number, message: string) {
  return new Promise((_, reject) => 
    setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${message}`)), ms)
  );
}

// Utility to wrap promises with timeout
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, context: string): Promise<T> {
  try {
    const result = await Promise.race([
      promise,
      createTimeout(timeoutMs, context)
    ]) as T;
    return result;
  } catch (error: any) {
    if (error?.message?.includes('Timeout after')) {
      debugLog(`Operation timed out: ${context}`);
    }
    throw error;
  }
}

// Utility for batch processing
async function processBatch<T, R>(
  items: T[],
  batchSize: number,
  processFn: (item: T) => Promise<R>,
  onProgress?: (completed: number, total: number) => void
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (item) => {
        try {
          return await processFn(item);
        } catch (error) {
          handleError(error, `Batch process error for item: ${JSON.stringify(item)}`);
          throw error;
        }
      })
    );
    
    results.push(...batchResults);
    
    if (onProgress) {
      onProgress(Math.min(i + batchSize, items.length), items.length);
    }
  }
  
  return results;
}

function debugLog(...args: any[]) {
  if (DEBUG) {
    console.error(`[DEBUG][${new Date().toISOString()}]`, ...args);
  }
}

function handleError(error: any, context: string) {
  const timestamp = new Date().toISOString();
  console.error(`[ERROR][${timestamp}] ${context}:`, error);
  if (error?.response?.data) {
    console.error('API Response:', error.response.data);
  }
  // Log stack trace for unexpected errors
  if (error instanceof Error) {
    console.error('Stack trace:', error.stack);
  }
}

// Load environment variables
dotenv.config();
debugLog('Environment variables loaded');

// Validate environment variables
const envSchema = z.object({
  LINEAR_API_KEY: z.string().min(1),
});

const envValidation = envSchema.safeParse(process.env);
if (!envValidation.success) {
  console.error('Environment validation failed:', envValidation.error.errors);
  process.exit(1);
}
debugLog('Environment validation successful');

// Initialize Linear client with error handling
let linearClient: LinearClient;
try {
  linearClient = new LinearClient({
    apiKey: process.env.LINEAR_API_KEY,
  });
  debugLog('Linear client initialized');
} catch (error) {
  handleError(error, 'Failed to initialize Linear client');
  process.exit(1);
}

// Create the MCP server with explicit capabilities
const server = new McpServer({
  name: 'linear-mcp-server',
  version: '1.0.0',
  capabilities: {
    tools: {
      'linear_create_issue': {
        description: 'Create a new Linear issue',
        parameters: {
          title: { type: 'string', description: 'Issue title' },
          description: { type: 'string', description: 'Issue description (markdown supported)' },
          teamId: { type: 'string', description: 'Team ID to create issue in' },
          priority: { type: 'number', description: 'Priority level (0-4)', minimum: 0, maximum: 4 },
          status: { type: 'string', description: 'Initial status name' }
        },
        required: ['title', 'teamId']
      },
      'linear_bulk_update_status': {
        description: 'Update the status of multiple Linear issues at once',
        parameters: {
          issueIds: { 
            type: 'array', 
            items: { type: 'string' }, 
            description: 'List of issue IDs to update'
          },
          targetStatus: { 
            type: 'string', 
            description: 'Target status to set for all issues' 
          }
        },
        required: ['issueIds', 'targetStatus']
      },
      'linear_search_issues': {
        description: 'Search Linear issues with flexible filtering',
        parameters: {
          query: { type: 'string', description: 'Text to search in title/description' },
          teamId: { type: 'string', description: 'Filter by team' },
          status: { type: 'string', description: 'Filter by status' },
          assigneeId: { type: 'string', description: 'Filter by assignee' },
          priority: { type: 'number', description: 'Priority level (0-4)', minimum: 0, maximum: 4 },
          limit: { type: 'number', description: 'Max results', default: 10 }
        }
      },
      'linear_sprint_issues': {
        description: 'Get all issues in the current sprint/iteration',
        parameters: {
          teamId: { type: 'string', description: 'Team ID to get sprint issues for' }
        },
        required: ['teamId']
      },
      'linear_search_teams': {
        description: 'Search and retrieve Linear teams',
        parameters: {
          query: { type: 'string', description: 'Optional text to search in team names' }
        }
      },
      'linear_filter_sprint_issues': {
        description: 'Filter current sprint issues by status and optionally by assignee',
        parameters: {
          teamId: { type: 'string', description: 'Team ID to get sprint issues for' },
          status: { type: 'string', description: 'Status to filter by (e.g. "Pending Prod Release")' }
        },
        required: ['teamId', 'status']
      },
      'linear_get_issue_details': {
        description: 'Get detailed information about a specific issue, including full description',
        parameters: {
          issueId: { type: 'string', description: 'Issue ID (e.g., DATA-1284) to fetch details for' }
        },
        required: ['issueId']
      }
    }
  }
});
debugLog('MCP server created');

// Add Linear tools with improved error handling
server.tool(
  'linear_create_issue',
  {
    title: z.string().describe('Issue title'),
    description: z.string().optional().describe('Issue description (markdown supported)'),
    teamId: z.string().describe('Team ID to create issue in'),
    priority: z.number().min(0).max(4).optional().describe('Priority level (0-4)'),
    status: z.string().optional().describe('Initial status name')
  },
  async (params) => {
    try {
      debugLog('Creating issue with params:', params);
      const issueResult = await linearClient.createIssue(params);
      const issueData = await issueResult.issue;
      
      if (!issueData) {
        throw new Error('Issue creation succeeded but returned no data');
      }

      debugLog('Issue created successfully:', issueData.identifier);
      return {
        content: [{
          type: 'text',
          text: `Created issue ${issueData.identifier}: ${issueData.title}`
        }]
      };
    } catch (error) {
      handleError(error, 'Failed to create issue');
      throw error;
    }
  }
);

server.tool(
  'linear_search_issues',
  {
    query: z.string().optional().describe('Text to search in title/description'),
    teamId: z.string().optional().describe('Filter by team'),
    status: z.string().optional().describe('Filter by status'),
    assigneeId: z.string().optional().describe('Filter by assignee'),
    priority: z.number().min(0).max(4).optional().describe('Filter by priority'),
    limit: z.number().default(10).describe('Max results')
  },
  async (params) => {
    try {
      debugLog('Searching issues with params:', params);
      const issues = await linearClient.issues({
        first: params.limit,
        filter: {
          ...(params.teamId && { team: { id: { eq: params.teamId } } }),
          ...(params.status && { state: { name: { eq: params.status } } }),
          ...(params.assigneeId && { assignee: { id: { eq: params.assigneeId } } }),
          ...(params.priority !== undefined && { priority: { eq: params.priority } })
        },
        ...(params.query && { search: params.query })
      });

      debugLog(`Found ${issues.nodes.length} issues`);
      const issueList = await Promise.all(
        issues.nodes.map(async (issue) => {
          const state = await issue.state;
          return `${issue.identifier}: ${issue.title} (${state?.name ?? 'No status'})`;
        })
      );

      return {
        content: [{
          type: 'text',
          text: issueList.join('\n')
        }]
      };
    } catch (error) {
      handleError(error, 'Failed to search issues');
      throw error;
    }
  }
);

server.tool(
  'linear_sprint_issues',
  {
    teamId: z.string().describe('Team ID to get sprint issues for')
  },
  async (params) => {
    try {
      debugLog('Fetching current sprint issues for team:', params.teamId);
      
      // Get the team's current cycle (sprint)
      const team = await linearClient.team(params.teamId);
      const cycles = await linearClient.cycles({
        filter: {
          team: { id: { eq: params.teamId } },
          isActive: { eq: true }
        }
      });
      
      if (!cycles.nodes.length) {
        return {
          content: [{
            type: 'text',
            text: 'No active sprint found for this team.'
          }]
        };
      }

      const currentCycle = cycles.nodes[0];
      
      // Get all issues in the current cycle
      const issues = await linearClient.issues({
        filter: {
          team: { id: { eq: params.teamId } },
          cycle: { id: { eq: currentCycle.id } }
        }
      });

      debugLog(`Found ${issues.nodes.length} issues in current sprint`);

      const issueList = await Promise.all(
        issues.nodes.map(async (issue) => {
          const state = await issue.state;
          const assignee = await issue.assignee;
          return `${issue.identifier}: ${issue.title} (${state?.name ?? 'No status'})${assignee ? ` - Assigned to: ${assignee.name}` : ''}`;
        })
      );

      return {
        content: [{
          type: 'text',
          text: `Current Sprint: ${currentCycle.name}\nStart: ${new Date(currentCycle.startsAt).toLocaleDateString()}\nEnd: ${new Date(currentCycle.endsAt).toLocaleDateString()}\n\nIssues:\n${issueList.join('\n')}`
        }]
      };
    } catch (error) {
      handleError(error, 'Failed to fetch sprint issues');
      throw error;
    }
  }
);

server.tool(
  'linear_search_teams',
  {
    query: z.string().optional().describe('Optional text to search in team names')
  },
  async (params) => {
    try {
      debugLog('Searching teams with query:', params.query);
      
      const teams = await linearClient.teams({
        ...(params.query && { filter: { name: { contains: params.query } } })
      });

      if (!teams.nodes.length) {
        return {
          content: [{
            type: 'text',
            text: 'No teams found.'
          }]
        };
      }

      debugLog(`Found ${teams.nodes.length} teams`);

      const teamList = await Promise.all(
        teams.nodes.map(async (team) => {
          const activeMembers = await team.members();
          return `Team: ${team.name}\nID: ${team.id}\nKey: ${team.key}\nMembers: ${activeMembers.nodes.length}\n`;
        })
      );

      return {
        content: [{
          type: 'text',
          text: teamList.join('\n')
        }]
      };
    } catch (error) {
      handleError(error, 'Failed to search teams');
      throw error;
    }
  }
);

server.tool(
  'linear_filter_sprint_issues',
  {
    teamId: z.string().describe('Team ID to get sprint issues for'),
    status: z.string().describe('Status to filter by')
  },
  async (params) => {
    try {
      debugLog('Filtering sprint issues with params:', params);
      
      // Get current user info with timeout
      const viewer = await withTimeout(
        linearClient.viewer,
        API_TIMEOUT_MS,
        'Fetching Linear user info'
      );
      debugLog('Current user:', viewer.id);
      
      // Get the team's current cycle (sprint) with timeout
      const cycles = await withTimeout(
        linearClient.cycles({
          filter: {
            team: { id: { eq: params.teamId } },
            isActive: { eq: true }
          }
        }),
        API_TIMEOUT_MS,
        'Fetching active cycles'
      );
      
      if (!cycles.nodes.length) {
        return {
          content: [{
            type: 'text',
            text: 'No active sprint found for this team.'
          }]
        };
      }

      const currentCycle = cycles.nodes[0];
      
      // Get filtered issues in the current cycle with timeout
      const issues = await withTimeout(
        linearClient.issues({
          filter: {
            team: { id: { eq: params.teamId } },
            cycle: { id: { eq: currentCycle.id } },
            state: { name: { eq: params.status } },
            assignee: { id: { eq: viewer.id } }
          }
        }),
        API_TIMEOUT_MS,
        'Fetching filtered sprint issues'
      );

      debugLog(`Found ${issues.nodes.length} matching issues in current sprint`);

      if (issues.nodes.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `No issues found with status "${params.status}" assigned to you in the current sprint.`
          }]
        };
      }

      // Process issues with timeout protection for each issue's state fetch
      const issueList = await Promise.all(
        issues.nodes.map(async (issue) => {
          const state = issue.state ? await withTimeout(
            issue.state,
            API_TIMEOUT_MS,
            `Fetching state for issue ${issue.id}`
          ) : null;
          return `${issue.identifier}: ${issue.title}\n  Status: ${state?.name ?? 'No status'}\n  URL: ${issue.url}`;
        })
      );

      return {
        content: [{
          type: 'text',
          text: `Current Sprint: ${currentCycle.name}\nStart: ${new Date(currentCycle.startsAt).toLocaleDateString()}\nEnd: ${new Date(currentCycle.endsAt).toLocaleDateString()}\n\nYour Issues with Status "${params.status}":\n\n${issueList.join('\n\n')}`
        }]
      };
    } catch (error) {
      handleError(error, 'Failed to filter sprint issues');
      throw error;
    }
  }
);

// New tool to get detailed issue information including description
server.tool(
  'linear_get_issue_details',
  {
    issueId: z.string().describe('Issue ID (e.g., DATA-1284) to fetch details for')
  },
  async (params) => {
    try {
      debugLog('Fetching detailed information for issue:', params.issueId);
      
      // Parse team identifier and issue number from the issue ID
      const match = params.issueId.match(/^([A-Z]+)-(\d+)$/);
      if (!match) {
        throw new Error(`Invalid issue ID format: ${params.issueId}. Expected format: TEAM-NUMBER (e.g., DATA-1284)`);
      }
      
      const [_, teamKey, issueNumber] = match;
      
      // Find the team by key
      const teams = await linearClient.teams({
        filter: {
          key: { eq: teamKey }
        }
      });
      
      if (!teams.nodes.length) {
        throw new Error(`Team with key "${teamKey}" not found`);
      }
      
      const team = teams.nodes[0];
      
      // Find the issue by team and number
      const issues = await linearClient.issues({
        filter: {
          team: { id: { eq: team.id } },
          number: { eq: parseInt(issueNumber, 10) }
        }
      });
      
      if (!issues.nodes.length) {
        throw new Error(`Issue ${params.issueId} not found`);
      }
      
      const issue = issues.nodes[0];
      
      // Fetch related data with timeout protection
      const [state, assignee, labels, subscribers, creator, comments, attachments] = await Promise.all([
        issue.state ? withTimeout(issue.state, API_TIMEOUT_MS, `Fetching state for issue ${issue.id}`) : null,
        issue.assignee ? withTimeout(issue.assignee, API_TIMEOUT_MS, `Fetching assignee for issue ${issue.id}`) : null,
        withTimeout(issue.labels(), API_TIMEOUT_MS, `Fetching labels for issue ${issue.id}`),
        withTimeout(issue.subscribers(), API_TIMEOUT_MS, `Fetching subscribers for issue ${issue.id}`),
        issue.creator ? withTimeout(issue.creator, API_TIMEOUT_MS, `Fetching creator for issue ${issue.id}`) : null,
        withTimeout(issue.comments(), API_TIMEOUT_MS, `Fetching comments for issue ${issue.id}`),
        withTimeout(issue.attachments(), API_TIMEOUT_MS, `Fetching attachments for issue ${issue.id}`)
      ]);
      
      // Format labels
      const labelsList = labels.nodes.map(label => label.name).join(', ');
      
      // Format metadata section
      const metadata = [
        `ID: ${issue.identifier}`,
        `Title: ${issue.title}`,
        `Status: ${state?.name ?? 'No status'}`,
        `Priority: ${issue.priority !== null ? issue.priority : 'Not set'}`,
        `Assignee: ${assignee?.name ?? 'Unassigned'}`,
        `Creator: ${creator?.name ?? 'Unknown'}`,
        `Created: ${new Date(issue.createdAt).toLocaleString()}`,
        `Updated: ${new Date(issue.updatedAt).toLocaleString()}`,
        `Labels: ${labelsList || 'None'}`,
        `Subscribers: ${subscribers.nodes.length}`,
        `Attachments: ${attachments.nodes.length}`,
        `URL: ${issue.url}`
      ].join('\n');
      
      // Format full description
      const description = issue.description ? 
        `\n\n## Description\n\n${issue.description}` : 
        '\n\nNo description provided.';
      
      // Format comments section if there are any
      let commentsSection = '';
      if (comments.nodes.length > 0) {
        const commentsList = await Promise.all(
          comments.nodes.map(async (comment) => {
            const commentUser = await comment.user;
            return `### Comment by ${commentUser?.name ?? 'Unknown'} (${new Date(comment.createdAt).toLocaleString()})\n\n${comment.body}`;
          })
        );
        
        commentsSection = `\n\n## Comments (${comments.nodes.length})\n\n${commentsList.join('\n\n---\n\n')}`;
      }
      
      // Combine all sections
      const fullIssueDetails = `# Issue ${issue.identifier}\n\n## Metadata\n\n${metadata}${description}${commentsSection}`;
      
      return {
        content: [{
          type: 'text',
          text: fullIssueDetails
        }]
      };
    } catch (error) {
      handleError(error, 'Failed to fetch issue details');
      throw error;
    }
  }
);

// Add bulk update status tool
server.tool(
  'linear_bulk_update_status',
  {
    issueIds: z.array(z.string()).describe('List of issue IDs to update'),
    targetStatus: z.string().describe('Target status to set for all issues')
  },
  async (params) => {
    try {
      debugLog('Bulk updating issues:', params.issueIds, 'to status:', params.targetStatus);
      
      const results = {
        successful: [] as string[],
        failed: [] as {id: string, reason: string}[]
      };
      
      // Process issues in batches of 5
      await processBatch(
        params.issueIds,
        5,
        async (issueId) => {
          try {
            // Parse team identifier and issue number
            const match = issueId.match(/^([A-Z]+)-(\d+)$/);
            if (!match) {
              results.failed.push({id: issueId, reason: 'Invalid format'});
              return;
            }
            
            const [_, teamKey, issueNumber] = match;
            
            // Find the team
            const teams = await linearClient.teams({
              filter: { key: { eq: teamKey } }
            });
            
            if (!teams.nodes.length) {
              results.failed.push({id: issueId, reason: `Team "${teamKey}" not found`});
              return;
            }
            
            // Find the issue
            const issues = await linearClient.issues({
              filter: {
                team: { id: { eq: teams.nodes[0].id } },
                number: { eq: parseInt(issueNumber, 10) }
              }
            });
            
            if (!issues.nodes.length) {
              results.failed.push({id: issueId, reason: 'Issue not found'});
              return;
            }
            
            // Find the target workflow state
            const states = await linearClient.workflowStates({
              filter: {
                team: { id: { eq: teams.nodes[0].id } },
                name: { eq: params.targetStatus }
              }
            });
            
            if (!states.nodes.length) {
              results.failed.push({
                id: issueId, 
                reason: `Status "${params.targetStatus}" not found for team ${teamKey}`
              });
              return;
            }
            
            // Update the issue
            await linearClient.updateIssue(issues.nodes[0].id, {
              stateId: states.nodes[0].id
            });
            
            results.successful.push(issueId);
          } catch (error) {
            handleError(error, `Failed to update issue ${issueId}`);
            results.failed.push({id: issueId, reason: 'API error'});
          }
        },
        (completed, total) => {
          debugLog(`Progress: ${completed}/${total} issues processed`);
        }
      );
      
      // Format response
      let responseText = '';
      
      if (results.successful.length > 0) {
        responseText += `## Successfully Updated (${results.successful.length})\n\n`;
        responseText += results.successful.join(', ');
        responseText += '\n\n';
      }
      
      if (results.failed.length > 0) {
        responseText += `## Failed Updates (${results.failed.length})\n\n`;
        results.failed.forEach(item => {
          responseText += `- ${item.id}: ${item.reason}\n`;
        });
      }
      
      return {
        content: [{
          type: 'text',
          text: responseText
        }]
      };
    } catch (error) {
      handleError(error, 'Failed to bulk update issues');
      throw error;
    }
  }
);

// Create and configure transport
const transport = new StdioServerTransport();

// Add pipe error handler
const handlePipeError = (error: any) => {
  if (error.code === 'EPIPE') {
    debugLog('Pipe closed by the other end');
    connectionState.isPipeActive = false;
    if (!connectionState.isShuttingDown) {
      shutdown();
    }
    return true;
  }
  return false;
};

transport.onerror = async (error: any) => {
  // Check for EPIPE first
  if (handlePipeError(error)) {
    return;
  }

  handleError(error, 'Transport error');
  if (!connectionState.isShuttingDown && connectionState.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    connectionState.reconnectAttempts++;
    debugLog(`Attempting reconnection (${connectionState.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
    setTimeout(async () => {
      try {
        if (!connectionState.isPipeActive) {
          debugLog('Pipe is closed, cannot reconnect');
          await shutdown();
          return;
        }
        await server.connect(transport);
        connectionState.isConnected = true;
        debugLog('Reconnection successful');
      } catch (reconnectError) {
        handleError(reconnectError, 'Reconnection failed');
        if (connectionState.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          debugLog('Max reconnection attempts reached, shutting down');
          await shutdown();
        }
      }
    }, RECONNECT_DELAY_MS);
  } else if (!connectionState.isShuttingDown) {
    debugLog('Max reconnection attempts reached or shutting down, initiating shutdown');
    await shutdown();
  }
};

transport.onmessage = async (message: any) => {
  try {
    debugLog('Received message:', message?.method);
    
    if (message?.method === 'initialize') {
      debugLog('Handling initialize request');
      connectionState.isConnected = true;
      connectionState.lastHeartbeat = Date.now();
    } else if (message?.method === 'initialized') {
      debugLog('Connection fully initialized');
      connectionState.isConnected = true;
    } else if (message?.method === 'server/heartbeat') {
      connectionState.lastHeartbeat = Date.now();
      debugLog('Heartbeat received');
    }

    // Set up heartbeat check
    const heartbeatCheck = setInterval(() => {
      const timeSinceLastHeartbeat = Date.now() - connectionState.lastHeartbeat;
      if (timeSinceLastHeartbeat > HEARTBEAT_INTERVAL_MS * 2) {
        debugLog('No heartbeat received, attempting reconnection');
        clearInterval(heartbeatCheck);
        if (transport && transport.onerror) {
          transport.onerror(new Error('Heartbeat timeout'));
        }
      }
    }, HEARTBEAT_INTERVAL_MS);

    // Clear heartbeat check on process exit
    process.on('beforeExit', () => {
      clearInterval(heartbeatCheck);
    });
  } catch (error) {
    handleError(error, 'Message handling error');
    throw error;
  }
};

// Handle graceful shutdown
const shutdown = async () => {
  if (connectionState.isShuttingDown) {
    debugLog('Shutdown already in progress');
    return;
  }
  
  connectionState.isShuttingDown = true;
  debugLog('Shutting down gracefully...');
  
  // Close transport
  try {
    if (connectionState.isPipeActive) {
      await transport.close();
      debugLog('Transport closed successfully');
    } else {
      debugLog('Transport already closed');
    }
  } catch (error) {
    if (!handlePipeError(error)) {
      handleError(error, 'Transport closure failed');
    }
  }
  
  // Give time for any pending operations to complete
  await new Promise(resolve => setTimeout(resolve, SHUTDOWN_GRACE_PERIOD_MS));
  process.exit(0);
};

// Update signal handlers
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Add global error handlers
process.on('uncaughtException', (error: Error) => {
  handleError(error, 'Uncaught Exception');
  shutdown();
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  shutdown();
});

// Verify Linear API connection before starting server
try {
  debugLog('Verifying Linear API connection...');
  await withTimeout(linearClient.viewer, API_TIMEOUT_MS, 'Linear API connection check');
  debugLog('Linear API connection verified');
} catch (error) {
  handleError(error, 'Failed to verify Linear API connection');
  process.exit(1);
}

// Connect to transport with initialization handling
try {
  debugLog('Connecting to MCP transport...');
  
  await server.connect(transport);
  
  debugLog('MCP server connected and ready');
} catch (error) {
  handleError(error, 'Failed to connect MCP server');
  process.exit(1);
}

// Keep the process alive and handle errors
process.stdin.resume();
process.stdin.on('error', (error) => {
  if (!handlePipeError(error)) {
    handleError(error, 'stdin error');
  }
});

process.stdout.on('error', (error) => {
  if (!handlePipeError(error)) {
    handleError(error, 'stdout error');
  }
});