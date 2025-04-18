import {handleError} from './logging.js';

// Default timeout for API calls
export const API_TIMEOUT_MS = 30000; // 30 seconds

/**
 * Creates a promise that rejects after a specified timeout
 */
export function createTimeout(ms: number, message: string): Promise<never> {
    return new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${message}`)), ms)
    );
}

/**
 * Wraps a promise with a timeout
 * @param promise The promise to wrap
 * @param timeoutMs The timeout in milliseconds
 * @param context Context description for error reporting
 * @returns The result of the promise if it resolves before the timeout
 * @throws Error if the promise rejects or times out
 */
export async function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number = API_TIMEOUT_MS,
    context: string
): Promise<T> {
    try {
        const result = await Promise.race([
            promise,
            createTimeout(timeoutMs, context)
        ]) as T;
        return result;
    } catch (error: any) {
        if (error?.message?.includes('Timeout after')) {
            handleError(error, `Operation timed out: ${context}`);
        }
        throw error;
    }
}
