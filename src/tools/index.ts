import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';

// Export all tool registration functions from a single module
export * from './issues.js';
export * from './teams.js';
export * from './cycles.js';

/**
 * Register all tools with the MCP server
 * @param server The MCP server instance
 */
export async function registerAllTools(server: McpServer): Promise<void> {
    const issuesModule = await import('./issues.js');
    const teamsModule = await import('./teams.js');
    const cyclesModule = await import('./cycles.js');

    issuesModule.registerIssueTools(server);
    teamsModule.registerTeamTools(server);
    cyclesModule.registerCycleTools(server);
}
