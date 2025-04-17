import {getLinearClient} from './client';
import {API_TIMEOUT_MS, handleError, SimpleCache, withTimeout} from '../utils';

// Initialize cache
const cache = new SimpleCache();

/**
 * Get workflow states for a team with cache support
 * @param teamId The team ID
 * @returns Array of workflow state objects
 * @throws Error if the API call fails
 */
export async function getWorkflowStatesForTeam(teamId: string): Promise<any[]> {
    const cacheKey = `workflowStates:team:${teamId}`;

    // Try to get from cache first
    const cachedStates = cache.get<any[]>(cacheKey);
    if (cachedStates) {
        return cachedStates;
    }

    // Not in cache, fetch from API
    try {
        const states = await withTimeout(
            getLinearClient().workflowStates({
                filter: {team: {id: {eq: teamId}}}
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

/**
 * Get workflow state by name for a team with cache support
 * @param teamId The team ID
 * @param stateName The state name
 * @returns The workflow state object
 * @throws Error if the state is not found
 */
export async function getWorkflowStateByName(teamId: string, stateName: string): Promise<any> {
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