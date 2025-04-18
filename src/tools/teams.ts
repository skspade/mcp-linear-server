import {z} from 'zod';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {getLinearClient} from '../linear/index.js';
import {API_TIMEOUT_MS, debugLog, handleError, withTimeout} from '../utils/index.js';

/**
 * Register team-related tools with the MCP server
 * @param server The MCP server instance
 */
export function registerTeamTools(server: McpServer): void {
    // Search teams tool
    server.tool(
        'linear_search_teams',
        {
            query: z.string().optional().describe('Optional text to search in team names')
        },
        async (params) => {
            try {
                debugLog('Searching teams with query:', params.query);

                const teams = await getLinearClient().teams({
                    ...(params.query && {filter: {name: {contains: params.query}}})
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
                    teams.nodes.map(async (team: any) => {
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

    // Sprint issues tool
    server.tool(
        'linear_sprint_issues',
        {
            teamId: z.string().describe('Team ID to get sprint issues for')
        },
        async (params) => {
            try {
                debugLog('Fetching current sprint issues for team:', params.teamId);

                // Get the team's current cycle (sprint)
                const team = await getLinearClient().team(params.teamId);
                const cycles = await getLinearClient().cycles({
                    filter: {
                        team: {id: {eq: params.teamId}},
                        isActive: {eq: true}
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
                const issues = await getLinearClient().issues({
                    filter: {
                        team: {id: {eq: params.teamId}},
                        cycle: {id: {eq: currentCycle.id}}
                    }
                });

                debugLog(`Found ${issues.nodes.length} issues in current sprint`);

                const issueList = await Promise.all(
                    issues.nodes.map(async (issue: any) => {
                        const state = await issue.state as { name: string } | null;
                        const assignee = await issue.assignee as { name: string } | null;
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

    // Filter sprint issues tool
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
                    getLinearClient().viewer,
                    API_TIMEOUT_MS,
                    'Fetching Linear user info'
                );
                debugLog('Current user:', viewer.id);

                // Get the team's current cycle (sprint) with timeout
                const cycles = await withTimeout(
                    getLinearClient().cycles({
                        filter: {
                            team: {id: {eq: params.teamId}},
                            isActive: {eq: true}
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
                    getLinearClient().issues({
                        filter: {
                            team: {id: {eq: params.teamId}},
                            cycle: {id: {eq: currentCycle.id}},
                            state: {name: {eq: params.status}},
                            assignee: {id: {eq: viewer.id}}
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
                    issues.nodes.map(async (issue: any) => {
                        const state = issue.state ? await withTimeout(
                            issue.state,
                            API_TIMEOUT_MS,
                            `Fetching state for issue ${issue.id}`
                        ) as { name: string } : null;
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
}
