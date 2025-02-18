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

// Enable debug logging
const DEBUG = true;
function debugLog(...args: any[]) {
  if (DEBUG) {
    console.error('[DEBUG]', ...args);
  }
}

function handleError(error: any, context: string) {
  console.error(`[ERROR] ${context}:`, error);
  if (error?.response?.data) {
    console.error('API Response:', error.response.data);
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

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();

// Improve error handling for transport
transport.onerror = (error: any) => {
  handleError(error, 'Transport error');
  // Don't exit on transport errors, try to recover
};

// Add timeout handling
let timeoutHandler: NodeJS.Timeout;

// Handle graceful shutdown
const shutdown = async () => {
  debugLog('Shutting down gracefully...');
  if (timeoutHandler) {
    clearTimeout(timeoutHandler);
  }
  // Allow time for final messages to be sent
  await new Promise(resolve => setTimeout(resolve, 1000));
  process.exit(0);
};

// Update signal handlers
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Verify Linear API connection before starting server
try {
  debugLog('Verifying Linear API connection...');
  await linearClient.viewer;
  debugLog('Linear API connection verified');
} catch (error) {
  handleError(error, 'Failed to verify Linear API connection');
  process.exit(1);
}

// Connect to transport with initialization handling
try {
  debugLog('Connecting to MCP transport...');
  
  // Handle initialization and messages
  transport.onmessage = async (message: any) => {
    debugLog('Received message:', message);
    
    if (message?.method === 'initialize') {
      debugLog('Handling initialization request');
      transport.send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: '2024-11-05',
          serverInfo: {
            name: 'linear-mcp-server',
            version: '1.0.0'
          }
        }
      });
    }
    
    // Handle heartbeat messages
    if (message?.method === 'server/heartbeat') {
      debugLog('Received heartbeat request');
      transport.send({
        jsonrpc: '2.0',
        id: message.id,
        result: { alive: true }
      });
    }
    
    // Reset timeout on any message
    if (timeoutHandler) {
      clearTimeout(timeoutHandler);
    }
    
    // Set new timeout
    timeoutHandler = setTimeout(() => {
      debugLog('Connection idle, sending keepalive');
      try {
        transport.send({
          jsonrpc: '2.0',
          method: 'server/keepalive',
          params: { timestamp: new Date().toISOString() }
        });
      } catch (error) {
        handleError(error, 'Failed to send keepalive');
      }
    }, 30000); // Send keepalive every 30 seconds
  };

  await server.connect(transport);
  debugLog('MCP server connected and ready');
} catch (error) {
  handleError(error, 'Failed to connect MCP server');
  process.exit(1);
}

// Keep the process alive and handle errors
process.stdin.resume();
process.stdin.on('error', (error) => {
  handleError(error, 'stdin error');
});

process.stdout.on('error', (error) => {
  handleError(error, 'stdout error');
});
