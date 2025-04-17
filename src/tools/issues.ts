import {z} from 'zod';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {
    buildPaginationInfo,
    determineIssueOrderBy,
    getLinearClient,
    getPriorityLabel,
    getTeamByKey,
    getWorkflowStateByName
} from '../linear';
import {API_TIMEOUT_MS, debugLog, handleError, processBatch, withTimeout} from '../utils';

/**
 * Register issue-related tools with the MCP server
 * @param server The MCP server instance
 */
export function registerIssueTools(server: McpServer): void {
    // Create issue tool
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
                const issueResult = await getLinearClient().createIssue(params);
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

    // Search issues tool
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
                        ...(params.teamId && {team: {id: {eq: params.teamId}}}),
                        ...(params.status && {state: {name: {eq: params.status}}}),
                        ...(params.assigneeId && {assignee: {id: {eq: params.assigneeId}}}),
                        ...(params.priority !== undefined && {priority: {eq: params.priority}})
                    },
                    ...(params.query && {search: params.query}),
                    orderBy,
                    ...(params.cursor && {after: params.cursor})
                };

                // Execute the query with timeout protection
                const issues = await withTimeout(
                    getLinearClient().issues(queryParams),
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

    // Get issue details tool
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
                const teams = await getLinearClient().teams({
                    filter: {
                        key: {eq: teamKey}
                    }
                });

                if (!teams.nodes.length) {
                    throw new Error(`Team with key "${teamKey}" not found`);
                }

                const team = teams.nodes[0];

                // Find the issue by team and number
                const issues = await getLinearClient().issues({
                    filter: {
                        team: {id: {eq: team.id}},
                        number: {eq: parseInt(issueNumber, 10)}
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

    // Bulk update status tool
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
                    failed: [] as { id: string, reason: string }[]
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
                                getLinearClient().issues({
                                    filter: {
                                        team: {id: {eq: team.id}},
                                        number: {eq: parseInt(issueNumber, 10)}
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
                                getLinearClient().updateIssue(issues.nodes[0].id, {
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
}