// Debug mode flag
const DEBUG = true;

/**
 * Logs debug information if debug mode is enabled
 */
export function debugLog(...args: any[]): void {
    if (DEBUG) {
        console.error(`[DEBUG][${new Date().toISOString()}]`, ...args);
    }
}

/**
 * Handles and logs errors with context
 */
export function handleError(error: any, context: string): void {
    const timestamp = new Date().toISOString();
    console.error(`[ERROR][${timestamp}] ${context}:`, error);
    if (error?.response?.data) {
        console.error('API Response:', error.response.data);
    }
    // Log stack trace for unexpected errors
    if (error instanceof Error) {
        console.error('Stack trace:', error.stack);
    }
}

/**
 * Get the debug mode status
 */
export function isDebugMode(): boolean {
    return DEBUG;
}