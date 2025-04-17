import {getLinearClient} from './client';
import {API_TIMEOUT_MS, withTimeout} from '../utils';

/**
 * Create a new cycle
 * @param params Parameters for creating a cycle
 * @returns The created cycle
 * @throws Error if the cycle creation fails
 */
export async function createCycle(params: any) {
    // Verify the team exists
    const team = await withTimeout(
        getLinearClient().team(params.teamId),
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
        getLinearClient().createCycle(cycleData),
        API_TIMEOUT_MS,
        'Creating new cycle'
    );

    const cycle = await cycleResult.cycle;

    if (!cycle) {
        throw new Error('Cycle creation succeeded but returned no data');
    }

    return {cycle, team};
}

/**
 * Update an existing cycle
 * @param params Parameters for updating a cycle
 * @returns The updated cycle
 * @throws Error if the cycle update fails
 */
export async function updateCycle(params: any) {
    // Verify the cycle exists
    const cycle = await withTimeout(
        getLinearClient().cycle(params.cycleId),
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
        getLinearClient().updateCycle(params.cycleId, updateData),
        API_TIMEOUT_MS,
        'Updating cycle'
    );

    // Fetch the updated cycle
    const updatedCycle = await withTimeout(
        getLinearClient().cycle(params.cycleId),
        API_TIMEOUT_MS,
        'Fetching updated cycle'
    );

    const team = await updatedCycle.team;

    return {cycle: updatedCycle, team};
}

/**
 * Get cycle details
 * @param params Parameters for getting a cycle
 * @returns The cycle details
 * @throws Error if the cycle retrieval fails
 */
export async function getCycle(params: any) {
    // Fetch the cycle
    const cycle = await withTimeout(
        getLinearClient().cycle(params.cycleId),
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
            getLinearClient().issues({
                filter: {
                    cycle: {id: {eq: cycle.id}}
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

    return {cycle, team, issues: issues.nodes, completedIssues, progressPercentage};
}

/**
 * List cycles for a team
 * @param params Parameters for listing cycles
 * @returns The cycles for the team
 * @throws Error if the cycle listing fails
 */
export async function listCycles(params: any) {
    // Verify the team exists
    const team = await withTimeout(
        getLinearClient().team(params.teamId),
        API_TIMEOUT_MS,
        'Fetching team for cycle listing'
    );

    if (!team) {
        throw new Error(`Team with ID ${params.teamId} not found`);
    }

    // Fetch all cycles for the team
    const cycles = await withTimeout(
        getLinearClient().cycles({
            filter: {
                team: {id: {eq: params.teamId}}
            }
        }),
        API_TIMEOUT_MS,
        'Fetching team cycles'
    );

    // Sort cycles by start date (newest first)
    const sortedCycles = [...cycles.nodes].sort(
        (a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()
    );

    return {team, cycles: sortedCycles};
}