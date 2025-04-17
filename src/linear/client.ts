import {LinearClient} from '@linear/sdk';
import {z} from 'zod';
import dotenv from 'dotenv';
import {API_TIMEOUT_MS, handleError, withTimeout} from '../utils';

// Load environment variables
dotenv.config();

// Validate environment variables
const envSchema = z.object({
    LINEAR_API_KEY: z.string().min(1),
});

// Initialize and export the Linear client
let linearClient: LinearClient;

/**
 * Initialize the Linear client
 * @returns The initialized Linear client
 * @throws Error if initialization fails
 */
export function initializeLinearClient(): LinearClient {
    try {
        const envValidation = envSchema.safeParse(process.env);
        if (!envValidation.success) {
            console.error('Environment validation failed:', envValidation.error.errors);
            throw new Error('Environment validation failed');
        }

        linearClient = new LinearClient({
            apiKey: process.env.LINEAR_API_KEY,
        });

        return linearClient;
    } catch (error) {
        handleError(error, 'Failed to initialize Linear client');
        throw error;
    }
}

/**
 * Get the Linear client instance
 * @returns The Linear client instance
 * @throws Error if the client is not initialized
 */
export function getLinearClient(): LinearClient {
    if (!linearClient) {
        throw new Error('Linear client not initialized. Call initializeLinearClient() first.');
    }
    return linearClient;
}

/**
 * Verify the Linear API connection
 * @throws Error if the connection fails
 */
export async function verifyLinearApiConnection(): Promise<void> {
    try {
        await withTimeout(
            getLinearClient().viewer,
            API_TIMEOUT_MS,
            'Linear API connection check'
        );
    } catch (error) {
        handleError(error, 'Failed to verify Linear API connection');
        throw error;
    }
}