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
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache TTL
const CACHE_CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes cache cleanup interval

// Connection state tracking
const connectionState = {
  isConnected: false,
  reconnectAttempts: 0,
  lastHeartbeat: Date.now(),
  isPipeActive: true,  // Track pipe state
  isShuttingDown: false  // Track shutdown state
};

// Simple in-memory cache implementation
interface CacheEntry<T> {
  value: T;
  timestamp: number;
  expiresAt: number;
}

class SimpleCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor(cleanupIntervalMs: number = CACHE_CLEANUP_INTERVAL_MS) {
    // Set up periodic cache cleanup
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, cleanupIntervalMs);

    // Ensure cleanup on process exit
    process.on('beforeExit', () => {
      clearInterval(this.cleanupInterval);
    });

    debugLog('Cache initialized with cleanup interval:', cleanupIntervalMs, 'ms');
  }

  // Get an item from cache
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if entry has expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    debugLog(`Cache hit for key: ${key}`);
    return entry.value as T;
  }

  // Set an item in cache with TTL
  set<T>(key: string, value: T, ttlMs: number = CACHE_TTL_MS): void {
    const now = Date.now();
    this.cache.set(key, {
      value,
      timestamp: now,
      expiresAt: now + ttlMs
    });
    debugLog(`Cached key: ${key}, expires in ${ttlMs}ms`);
  }

  // Remove an item from cache
  delete(key: string): void {
    this.cache.delete(key);
    debugLog(`Deleted cache key: ${key}`);
  }

  // Clear all cache entries
  clear(): void {
    this.cache.clear();
    debugLog('Cache cleared');
  }

  // Clean up expired entries
  cleanup(): void {
    const now = Date.now();
    let expiredCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      debugLog(`Cache cleanup: removed ${expiredCount} expired entries`);
    }
  }

  // Get cache stats
  getStats(): { size: number, oldestEntry: number | null, newestEntry: number | null } {
    let oldestTimestamp: number | null = null;
    let newestTimestamp: number | null = null;

    for (const entry of this.cache.values()) {
      if (oldestTimestamp === null || entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
      }

      if (newestTimestamp === null || entry.timestamp > newestTimestamp) {
        newestTimestamp = entry.timestamp;
      }
    }

    return {
      size: this.cache.size,
      oldestEntry: oldestTimestamp,
      newestEntry: newestTimestamp
    };
  }
}

// Initialize the cache
const cache = new SimpleCache();

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
      },
      'linear_manage_cycle': {
        description: 'Create, update, or get information about Linear cycles (sprints)',
        parameters: {
          action: {
            type: 'string',
            description: 'Action to perform: "create", "update", "get", or "list"',
            enum: ['create', 'update', 'get', 'list']
          },
          teamId: { type: 'string', description: 'Team ID to manage cycles for' },
          cycleId: { type: 'string', description: 'Cycle ID (required for update and get actions)' },
          name: { type: 'string', description: 'Cycle name (for create and update)' },
          startDate: { type: 'string', description: 'Start date in ISO format (for create and update)' },
          endDate: { type: 'string', description: 'End date in ISO format (for create and update)' },
          description: { type: 'string', description: 'Cycle description (for create and update)' }
        },
        required: ['action', 'teamId']
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
    limit: z.number().default(10).describe('Max results per page'),
    cursor: z.string().optional().describe('Pagination cursor for fetching next page'),
    sortBy: z.enum(['created', 'updated', 'priority', 'title']).optional().default('updated').describe('Field to sort by'),
    sortDirection: z.enum(['asc', 'desc']).optional().default('desc').describe('Sort direction')
  },
  async (params) => {
    try {
      debugLog('Searching issues with params:', params);

      // Determine sort order based on parameters
      const orderBy = determineIssueOrderBy(params.sortBy, params.sortDirection);

      // Build the query with pagination support
      const queryParams: any = {
        first: params.limit,
        filter: {
          ...(params.teamId && { team: { id: { eq: params.teamId } } }),
          ...(params.status && { state: { name: { eq: params.status } } }),
          ...(params.assigneeId && { assignee: { id: { eq: params.assigneeId } } }),
          ...(params.priority !== undefined && { priority: { eq: params.priority } })
        },
        ...(params.query && { search: params.query }),
        orderBy,
        ...(params.cursor && { after: params.cursor })
      };

      // Execute the query with timeout protection
      const issues = await withTimeout(
        linearClient.issues(queryParams),
        API_TIMEOUT_MS,
        'Searching issues'
      );

      debugLog(`Found ${issues.nodes.length} issues, hasNextPage: ${issues.pageInfo.hasNextPage}`);

      // Format the issues with more details
      const issueList = await Promise.all(
        issues.nodes.map(async (issue) => {
          const [state, assignee] = await Promise.all([
            issue.state ? withTimeout(issue.state, API_TIMEOUT_MS, `Fetching state for issue ${issue.id}`) : null,
            issue.assignee ? withTimeout(issue.assignee, API_TIMEOUT_MS, `Fetching assignee for issue ${issue.id}`) : null
          ]);

          const priorityLabel = getPriorityLabel(issue.priority);
          const assigneeInfo = assignee ? ` | Assignee: ${assignee.name}` : '';

          return `${issue.identifier}: ${issue.title}\n  Status: ${state?.name ?? 'No status'} | Priority: ${priorityLabel}${assigneeInfo}\n  Created: ${new Date(issue.createdAt).toLocaleString()} | Updated: ${new Date(issue.updatedAt).toLocaleString()}\n  URL: ${issue.url}`;
        })
      );

      // Build pagination information
      const paginationInfo = buildPaginationInfo(issues.pageInfo, params);

      // Combine results and pagination info
      const resultText = issueList.length > 0
        ? `${issueList.join('\n\n')}\n\n${paginationInfo}`
        : `No issues found matching your criteria.\n\n${paginationInfo}`;

      return {
        content: [{
          type: 'text',
          text: resultText
        }]
      };
    } catch (error) {
      handleError(error, 'Failed to search issues');
      throw error;
    }
  }
);

// Helper function to determine the order by clause for issue queries
function determineIssueOrderBy(sortBy: string = 'updated', direction: string = 'desc') {
  const field = sortBy === 'created' ? 'createdAt' :
                sortBy === 'updated' ? 'updatedAt' :
                sortBy === 'priority' ? 'priority' :
                sortBy === 'title' ? 'title' : 'updatedAt';

  return { [field]: direction.toUpperCase() };
}

// Helper function to get a human-readable priority label
function getPriorityLabel(priority: number | null): string {
  if (priority === null) return 'None';

  switch (priority) {
    case 0: return 'No priority';
    case 1: return 'Low';
    case 2: return 'Medium';
    case 3: return 'High';
    case 4: return 'Urgent';
    default: return `Unknown (${priority})`;
  }
}

// Helper function to build pagination information text
function buildPaginationInfo(pageInfo: { hasNextPage: boolean, endCursor?: string }, params: any): string {
  const paginationLines = ['## Pagination'];

  if (params.cursor) {
    paginationLines.push('Current page is based on the provided cursor.');
  } else {
    paginationLines.push('This is the first page of results.');
  }

  paginationLines.push(`Results per page: ${params.limit}`);

  if (pageInfo.hasNextPage && pageInfo.endCursor) {
    paginationLines.push(`\nTo see the next page, use cursor: ${pageInfo.endCursor}`);
    paginationLines.push('\nExample usage:');
    paginationLines.push('```');
    paginationLines.push(`linear_search_issues(query: "${params.query || ''}", teamId: "${params.teamId || ''}", cursor: "${pageInfo.endCursor}")`);
    paginationLines.push('```');
  } else {
    paginationLines.push('\nNo more pages available.');
  }

  return paginationLines.join('\n');
}

// Cache-enabled helper functions for frequently accessed data

// Get team by ID with cache support
async function getTeamById(teamId: string): Promise<any> {
  const cacheKey = `team:${teamId}`;

  // Try to get from cache first
  const cachedTeam = cache.get<any>(cacheKey);
  if (cachedTeam) {
    return cachedTeam;
  }

  // Not in cache, fetch from API
  try {
    const team = await withTimeout(
      linearClient.team(teamId),
      API_TIMEOUT_MS,
      `Fetching team ${teamId}`
    );

    if (team) {
      // Cache the result
      cache.set(cacheKey, team);
      return team;
    }

    throw new Error(`Team with ID ${teamId} not found`);
  } catch (error) {
    handleError(error, `Failed to fetch team ${teamId}`);
    throw error;
  }
}

// Get team by key with cache support
async function getTeamByKey(teamKey: string): Promise<any> {
  const cacheKey = `team:key:${teamKey}`;

  // Try to get from cache first
  const cachedTeam = cache.get<any>(cacheKey);
  if (cachedTeam) {
    return cachedTeam;
  }

  // Not in cache, fetch from API
  try {
    const teams = await withTimeout(
      linearClient.teams({
        filter: { key: { eq: teamKey } }
      }),
      API_TIMEOUT_MS,
      `Fetching team by key ${teamKey}`
    );

    if (teams.nodes.length > 0) {
      const team = teams.nodes[0];
      // Cache the result
      cache.set(cacheKey, team);
      // Also cache by ID for future lookups
      cache.set(`team:${team.id}`, team);
      return team;
    }

    throw new Error(`Team with key ${teamKey} not found`);
  } catch (error) {
    handleError(error, `Failed to fetch team by key ${teamKey}`);
    throw error;
  }
}

// Get all teams with cache support
async function getAllTeams(): Promise<any[]> {
  const cacheKey = 'teams:all';

  // Try to get from cache first
  const cachedTeams = cache.get<any[]>(cacheKey);
  if (cachedTeams) {
    return cachedTeams;
  }

  // Not in cache, fetch from API
  try {
    const teams = await withTimeout(
      linearClient.teams(),
      API_TIMEOUT_MS,
      'Fetching all teams'
    );

    // Cache the result
    cache.set(cacheKey, teams.nodes);

    // Also cache individual teams
    teams.nodes.forEach(team => {
      cache.set(`team:${team.id}`, team);
      cache.set(`team:key:${team.key}`, team);
    });

    return teams.nodes;
  } catch (error) {
    handleError(error, 'Failed to fetch all teams');
    throw error;
  }
}

// Get workflow states for a team with cache support
async function getWorkflowStatesForTeam(teamId: string): Promise<any[]> {
  const cacheKey = `workflowStates:team:${teamId}`;

  // Try to get from cache first
  const cachedStates = cache.get<any[]>(cacheKey);
  if (cachedStates) {
    return cachedStates;
  }

  // Not in cache, fetch from API
  try {
    const states = await withTimeout(
      linearClient.workflowStates({
        filter: { team: { id: { eq: teamId } } }
      }),
      API_TIMEOUT_MS,
      `Fetching workflow states for team ${teamId}`
    );

    // Cache the result
    cache.set(cacheKey, states.nodes);

    // Also cache individual states by name for this team
    states.nodes.forEach(state => {
      cache.set(`workflowState:team:${teamId}:name:${state.name}`, state);
    });

    return states.nodes;
  } catch (error) {
    handleError(error, `Failed to fetch workflow states for team ${teamId}`);
    throw error;
  }
}

// Get workflow state by name for a team with cache support
async function getWorkflowStateByName(teamId: string, stateName: string): Promise<any> {
  const cacheKey = `workflowState:team:${teamId}:name:${stateName}`;

  // Try to get from cache first
  const cachedState = cache.get<any>(cacheKey);
  if (cachedState) {
    return cachedState;
  }

  // Not in cache, try to get all states for this team (which will cache them individually)
  try {
    const states = await getWorkflowStatesForTeam(teamId);
    const state = states.find(s => s.name === stateName);

    if (state) {
      return state;
    }

    throw new Error(`Workflow state "${stateName}" not found for team ${teamId}`);
  } catch (error) {
    handleError(error, `Failed to fetch workflow state "${stateName}" for team ${teamId}`);
    throw error;
  }
}

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

            // Find the team using cache-enabled helper
            let team;
            try {
              team = await getTeamByKey(teamKey);
            } catch (error) {
              results.failed.push({id: issueId, reason: `Team "${teamKey}" not found`});
              return;
            }

            // Find the issue
            const issues = await withTimeout(
              linearClient.issues({
                filter: {
                  team: { id: { eq: team.id } },
                  number: { eq: parseInt(issueNumber, 10) }
                }
              }),
              API_TIMEOUT_MS,
              `Fetching issue ${issueId}`
            );

            if (!issues.nodes.length) {
              results.failed.push({id: issueId, reason: 'Issue not found'});
              return;
            }

            // Find the target workflow state using cache-enabled helper
            let workflowState;
            try {
              workflowState = await getWorkflowStateByName(team.id, params.targetStatus);
            } catch (error) {
              results.failed.push({
                id: issueId,
                reason: `Status "${params.targetStatus}" not found for team ${teamKey}`
              });
              return;
            }

            // Update the issue
            await withTimeout(
              linearClient.updateIssue(issues.nodes[0].id, {
                stateId: workflowState.id
              }),
              API_TIMEOUT_MS,
              `Updating issue ${issueId}`
            );

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

      // Add cache stats to the response in debug mode
      if (DEBUG) {
        const cacheStats = cache.getStats();
        responseText += `\n\n## Cache Statistics (Debug)\n`;
        responseText += `Cache size: ${cacheStats.size} entries\n`;
        if (cacheStats.oldestEntry) {
          responseText += `Oldest entry: ${new Date(cacheStats.oldestEntry).toLocaleString()}\n`;
        }
        if (cacheStats.newestEntry) {
          responseText += `Newest entry: ${new Date(cacheStats.newestEntry).toLocaleString()}\n`;
        }
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

// Add cycle management tool
server.tool(
  'linear_manage_cycle',
  {
    action: z.enum(['create', 'update', 'get', 'list']).describe('Action to perform'),
    teamId: z.string().describe('Team ID to manage cycles for'),
    cycleId: z.string().optional().describe('Cycle ID (required for update and get actions)'),
    name: z.string().optional().describe('Cycle name (for create and update)'),
    startDate: z.string().optional().describe('Start date in ISO format (for create and update)'),
    endDate: z.string().optional().describe('End date in ISO format (for create and update)'),
    description: z.string().optional().describe('Cycle description (for create and update)')
  },
  async (params) => {
    try {
      debugLog('Managing cycle with params:', params);

      // Validate parameters based on action
      if ((params.action === 'update' || params.action === 'get') && !params.cycleId) {
        throw new Error(`cycleId is required for ${params.action} action`);
      }

      if (params.action === 'create' && (!params.name || !params.startDate || !params.endDate)) {
        throw new Error('name, startDate, and endDate are required for create action');
      }

      if (params.action === 'update' && !params.cycleId) {
        throw new Error('cycleId is required for update action');
      }

      // Validate date formats if provided
      if (params.startDate && isNaN(Date.parse(params.startDate))) {
        throw new Error('Invalid startDate format. Use ISO format (YYYY-MM-DD)');
      }

      if (params.endDate && isNaN(Date.parse(params.endDate))) {
        throw new Error('Invalid endDate format. Use ISO format (YYYY-MM-DD)');
      }

      // Execute the requested action
      switch (params.action) {
        case 'create':
          return await createCycle(params);
        case 'update':
          return await updateCycle(params);
        case 'get':
          return await getCycle(params);
        case 'list':
          return await listCycles(params);
        default:
          throw new Error(`Unsupported action: ${params.action}`);
      }
    } catch (error) {
      handleError(error, `Failed to ${params.action} cycle`);
      throw error;
    }
  }
);

// Helper function to create a new cycle
async function createCycle(params: any) {
  // Verify the team exists
  const team = await withTimeout(
    linearClient.team(params.teamId),
    API_TIMEOUT_MS,
    'Fetching team for cycle creation'
  );

  if (!team) {
    throw new Error(`Team with ID ${params.teamId} not found`);
  }

  // Create the cycle
  const cycleData = {
    teamId: params.teamId,
    name: params.name,
    startsAt: new Date(params.startDate),
    endsAt: new Date(params.endDate),
    description: params.description || ''
  };

  const cycleResult = await withTimeout(
    linearClient.createCycle(cycleData),
    API_TIMEOUT_MS,
    'Creating new cycle'
  );

  const cycle = await cycleResult.cycle;

  if (!cycle) {
    throw new Error('Cycle creation succeeded but returned no data');
  }

  debugLog('Cycle created successfully:', cycle.id);

  return {
    content: [{
      type: "text" as const,
      text: `Created cycle "${cycle.name}" for team ${team.name}\nID: ${cycle.id}\nStart: ${new Date(cycle.startsAt).toLocaleDateString()}\nEnd: ${new Date(cycle.endsAt).toLocaleDateString()}`
    }]
  };
}

// Helper function to update an existing cycle
async function updateCycle(params: any) {
  // Verify the cycle exists
  const cycle = await withTimeout(
    linearClient.cycle(params.cycleId),
    API_TIMEOUT_MS,
    'Fetching cycle for update'
  );

  if (!cycle) {
    throw new Error(`Cycle with ID ${params.cycleId} not found`);
  }

  // Build update data with only provided fields
  const updateData: any = {};

  if (params.name) updateData.name = params.name;
  if (params.startDate) updateData.startsAt = new Date(params.startDate).toISOString();
  if (params.endDate) updateData.endsAt = new Date(params.endDate).toISOString();
  if (params.description !== undefined) updateData.description = params.description;

  // Update the cycle
  await withTimeout(
    linearClient.updateCycle(params.cycleId, updateData),
    API_TIMEOUT_MS,
    'Updating cycle'
  );

  // Fetch the updated cycle
  const updatedCycle = await withTimeout(
    linearClient.cycle(params.cycleId),
    API_TIMEOUT_MS,
    'Fetching updated cycle'
  );

  const team = await updatedCycle.team;

  return {
    content: [{
      type: "text" as const,
      text: `Updated cycle "${updatedCycle.name}" for team ${team?.name || 'Unknown'}\nID: ${updatedCycle.id}\nStart: ${new Date(updatedCycle.startsAt).toLocaleDateString()}\nEnd: ${new Date(updatedCycle.endsAt).toLocaleDateString()}\nDescription: ${updatedCycle.description || 'None'}`
    }]
  };
}

// Helper function to get cycle details
async function getCycle(params: any) {
  // Fetch the cycle
  const cycle = await withTimeout(
    linearClient.cycle(params.cycleId),
    API_TIMEOUT_MS,
    'Fetching cycle details'
  );

  if (!cycle) {
    throw new Error(`Cycle with ID ${params.cycleId} not found`);
  }

  // Fetch related data
  const [team, issues] = await Promise.all([
    cycle.team ? withTimeout(cycle.team, API_TIMEOUT_MS, 'Fetching cycle team') : Promise.resolve(null),
    withTimeout(
      linearClient.issues({
        filter: {
          cycle: { id: { eq: cycle.id } }
        }
      }),
      API_TIMEOUT_MS,
      'Fetching cycle issues'
    )
  ]);

  // Calculate cycle progress
  const completedIssues = issues.nodes.filter(issue => issue.completedAt !== null);
  const progressPercentage = issues.nodes.length > 0
    ? Math.round((completedIssues.length / issues.nodes.length) * 100)
    : 0;

  // Format cycle details
  const cycleDetails = [
    `# Cycle: ${cycle.name}`,
    `\n## Details`,
    `Team: ${team?.name || 'Unknown'}`,
    `ID: ${cycle.id}`,
    `Start Date: ${new Date(cycle.startsAt).toLocaleDateString()}`,
    `End Date: ${new Date(cycle.endsAt).toLocaleDateString()}`,
    `Status: ${new Date() >= new Date(cycle.startsAt) && new Date() <= new Date(cycle.endsAt) ? 'Active' : 'Inactive'}${new Date() > new Date(cycle.endsAt) ? ' (Completed)' : ''}`,
    `Progress: ${progressPercentage}% (${completedIssues.length}/${issues.nodes.length} issues completed)`,
    `Description: ${cycle.description || 'None'}`,
    `\n## Issues (${issues.nodes.length})`,
  ].join('\n');

  // Add issue list if there are any
  let issuesList = '';
  if (issues.nodes.length > 0) {
    const formattedIssues = await Promise.all(
      issues.nodes.map(async (issue) => {
        const state = await issue.state;
        const assignee = await issue.assignee;
        return `- ${issue.identifier}: ${issue.title} (${state?.name ?? 'No status'})${assignee ? ` - Assigned to: ${assignee.name}` : ''}`;
      })
    );

    issuesList = '\n\n' + formattedIssues.join('\n');
  } else {
    issuesList = '\n\nNo issues in this cycle.';
  }

  return {
    content: [{
      type: "text" as const,
      text: cycleDetails + issuesList
    }]
  };
}

// Helper function to list cycles for a team
async function listCycles(params: any) {
  // Verify the team exists
  const team = await withTimeout(
    linearClient.team(params.teamId),
    API_TIMEOUT_MS,
    'Fetching team for cycle listing'
  );

  if (!team) {
    throw new Error(`Team with ID ${params.teamId} not found`);
  }

  // Fetch all cycles for the team
  const cycles = await withTimeout(
    linearClient.cycles({
      filter: {
        team: { id: { eq: params.teamId } }
      }
    }),
    API_TIMEOUT_MS,
    'Fetching team cycles'
  );

  if (!cycles.nodes.length) {
    return {
      content: [{
        type: "text" as const,
        text: `No cycles found for team ${team.name}.`
      }]
    };
  }

  // Sort cycles by start date (newest first)
  const sortedCycles = [...cycles.nodes].sort(
    (a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()
  );

  // Format the cycles list
  const cyclesList = sortedCycles.map(cycle => {
    const now = new Date();
    const startDate = new Date(cycle.startsAt);
    const endDate = new Date(cycle.endsAt);
    const status = (now >= startDate && now <= endDate) ? 'ACTIVE' : (now > endDate ? 'COMPLETED' : 'UPCOMING');
    return `- ${cycle.name} (${status})\n  ID: ${cycle.id}\n  Period: ${new Date(cycle.startsAt).toLocaleDateString()} to ${new Date(cycle.endsAt).toLocaleDateString()}`;
  }).join('\n\n');

  return {
    content: [{
      type: "text" as const,
      text: `# Cycles for Team: ${team.name}\n\n${cyclesList}`
    }]
  };
}

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
