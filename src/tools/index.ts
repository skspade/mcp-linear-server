import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';

// Export all tool registration functions from a single module
export * from './issues';
export * from './teams';
export * from './cycles';

/**
 * Register all tools with the MCP server
 * @param server The MCP server instance
 */
export function registerAllTools(server: McpServer): void {
    const {registerIssueTools} = require('./issues');
    const {registerTeamTools} = require('./teams');
    const {registerCycleTools} = require('./cycles');

    registerIssueTools(server);
    registerTeamTools(server);
    registerCycleTools(server);
}
