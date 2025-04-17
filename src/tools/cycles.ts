import {z} from 'zod';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {createCycle, getCycle, listCycles, updateCycle} from '../linear';
import {debugLog, handleError} from '../utils';

/**
 * Register cycle-related tools with the MCP server
 * @param server The MCP server instance
 */
export function registerCycleTools(server: McpServer): void {
    // Manage cycle tool
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
                    case 'create': {
                        const result = await createCycle(params);
                        return {
                            content: [{
                                type: "text" as const,
                                text: `Created cycle "${result.cycle.name}" for team ${result.team.name}\nID: ${result.cycle.id}\nStart: ${new Date(result.cycle.startsAt).toLocaleDateString()}\nEnd: ${new Date(result.cycle.endsAt).toLocaleDateString()}`
                            }]
                        };
                    }
                    case 'update': {
                        const result = await updateCycle(params);
                        return {
                            content: [{
                                type: "text" as const,
                                text: `Updated cycle "${result.cycle.name}" for team ${result.team?.name || 'Unknown'}\nID: ${result.cycle.id}\nStart: ${new Date(result.cycle.startsAt).toLocaleDateString()}\nEnd: ${new Date(result.cycle.endsAt).toLocaleDateString()}\nDescription: ${result.cycle.description || 'None'}`
                            }]
                        };
                    }
                    case 'get': {
                        const result = await getCycle(params);

                        // Format cycle details
                        const cycleDetails = [
                            `# Cycle: ${result.cycle.name}`,
                            `\n## Details`,
                            `Team: ${result.team?.name || 'Unknown'}`,
                            `ID: ${result.cycle.id}`,
                            `Start Date: ${new Date(result.cycle.startsAt).toLocaleDateString()}`,
                            `End Date: ${new Date(result.cycle.endsAt).toLocaleDateString()}`,
                            `Status: ${new Date() >= new Date(result.cycle.startsAt) && new Date() <= new Date(result.cycle.endsAt) ? 'Active' : 'Inactive'}${new Date() > new Date(result.cycle.endsAt) ? ' (Completed)' : ''}`,
                            `Progress: ${result.progressPercentage}% (${result.completedIssues.length}/${result.issues.length} issues completed)`,
                            `Description: ${result.cycle.description || 'None'}`,
                            `\n## Issues (${result.issues.length})`,
                        ].join('\n');

                        // Add issue list if there are any
                        let issuesList = '';
                        if (result.issues.length > 0) {
                            const formattedIssues = await Promise.all(
                                result.issues.map(async (issue) => {
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
                    case 'list': {
                        const result = await listCycles(params);

                        if (!result.cycles.length) {
                            return {
                                content: [{
                                    type: "text" as const,
                                    text: `No cycles found for team ${result.team.name}.`
                                }]
                            };
                        }

                        // Format the cycles list
                        const cyclesList = result.cycles.map(cycle => {
                            const now = new Date();
                            const startDate = new Date(cycle.startsAt);
                            const endDate = new Date(cycle.endsAt);
                            const status = (now >= startDate && now <= endDate) ? 'ACTIVE' : (now > endDate ? 'COMPLETED' : 'UPCOMING');
                            return `- ${cycle.name} (${status})\n  ID: ${cycle.id}\n  Period: ${new Date(cycle.startsAt).toLocaleDateString()} to ${new Date(cycle.endsAt).toLocaleDateString()}`;
                        }).join('\n\n');

                        return {
                            content: [{
                                type: "text" as const,
                                text: `# Cycles for Team: ${result.team.name}\n\n${cyclesList}`
                            }]
                        };
                    }
                    default:
                        throw new Error(`Unsupported action: ${params.action}`);
                }
            } catch (error) {
                handleError(error, `Failed to ${params.action} cycle`);
                throw error;
            }
        }
    );
}