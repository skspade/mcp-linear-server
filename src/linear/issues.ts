/**
 * Determine the order by clause for issue queries
 * @param sortBy Field to sort by
 * @param direction Sort direction
 * @returns The order by object
 */
export function determineIssueOrderBy(sortBy: string = 'updated', direction: string = 'desc') {
    const field = sortBy === 'created' ? 'createdAt' :
        sortBy === 'updated' ? 'updatedAt' :
            sortBy === 'priority' ? 'priority' :
                sortBy === 'title' ? 'title' : 'updatedAt';

    return {[field]: direction.toUpperCase()};
}

/**
 * Get a human-readable priority label
 * @param priority The priority number
 * @returns The priority label
 */
export function getPriorityLabel(priority: number | null): string {
    if (priority === null) return 'None';

    switch (priority) {
        case 0:
            return 'No priority';
        case 1:
            return 'Low';
        case 2:
            return 'Medium';
        case 3:
            return 'High';
        case 4:
            return 'Urgent';
        default:
            return `Unknown (${priority})`;
    }
}

/**
 * Build pagination information text
 * @param pageInfo The page info object
 * @param params The query parameters
 * @returns The pagination information text
 */
export function buildPaginationInfo(pageInfo: { hasNextPage: boolean, endCursor?: string }, params: any): string {
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