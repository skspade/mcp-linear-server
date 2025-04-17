import {getLinearClient} from './client';
import {API_TIMEOUT_MS, handleError, SimpleCache, withTimeout} from '../utils';

// Initialize cache
const cache = new SimpleCache();

/**
 * Get team by ID with cache support
 * @param teamId The team ID
 * @returns The team object
 * @throws Error if the team is not found
 */
export async function getTeamById(teamId: string): Promise<any> {
    const cacheKey = `team:${teamId}`;

    // Try to get from cache first
    const cachedTeam = cache.get<any>(cacheKey);
    if (cachedTeam) {
        return cachedTeam;
    }

    // Not in cache, fetch from API
    try {
        const team = await withTimeout(
            getLinearClient().team(teamId),
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

/**
 * Get team by key with cache support
 * @param teamKey The team key
 * @returns The team object
 * @throws Error if the team is not found
 */
export async function getTeamByKey(teamKey: string): Promise<any> {
    const cacheKey = `team:key:${teamKey}`;

    // Try to get from cache first
    const cachedTeam = cache.get<any>(cacheKey);
    if (cachedTeam) {
        return cachedTeam;
    }

    // Not in cache, fetch from API
    try {
        const teams = await withTimeout(
            getLinearClient().teams({
                filter: {key: {eq: teamKey}}
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

/**
 * Get all teams with cache support
 * @returns Array of team objects
 * @throws Error if the API call fails
 */
export async function getAllTeams(): Promise<any[]> {
    const cacheKey = 'teams:all';

    // Try to get from cache first
    const cachedTeams = cache.get<any[]>(cacheKey);
    if (cachedTeams) {
        return cachedTeams;
    }

    // Not in cache, fetch from API
    try {
        const teams = await withTimeout(
            getLinearClient().teams(),
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