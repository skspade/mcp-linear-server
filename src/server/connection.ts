import {debugLog, handleError} from '../utils/index.js';
import {SHUTDOWN_GRACE_PERIOD_MS} from './config.js';

// Connection state tracking
export const connectionState = {
    isConnected: false,
    reconnectAttempts: 0,
    lastHeartbeat: Date.now(),
    isPipeActive: true,  // Track pipe state
    isShuttingDown: false  // Track shutdown state
};

/**
 * Handle pipe errors
 * @param error The error to handle
 * @returns true if the error was handled, false otherwise
 */
export function handlePipeError(error: any): boolean {
    if (error.code === 'EPIPE') {
        debugLog('Pipe closed by the other end');
        connectionState.isPipeActive = false;
        if (!connectionState.isShuttingDown) {
            shutdown();
        }
        return true;
    }
    return false;
}

/**
 * Handle graceful shutdown
 */
export const shutdown = async (): Promise<void> => {
    if (connectionState.isShuttingDown) {
        debugLog('Shutdown already in progress');
        return;
    }

    connectionState.isShuttingDown = true;
    debugLog('Shutting down gracefully...');

    // Give time for any pending operations to complete
    await new Promise(resolve => setTimeout(resolve, SHUTDOWN_GRACE_PERIOD_MS));
    process.exit(0);
};

/**
 * Setup global error handlers
 */
export function setupGlobalErrorHandlers(): void {
    // Update signal handlers
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Add global error handlers
    process.on('uncaughtException', (error: Error) => {
        handleError(error, 'Uncaught Exception');
        shutdown();
    });

    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
        shutdown();
    });

    // Handle stdin/stdout errors
    process.stdin.on('error', (error) => {
        if (!handlePipeError(error)) {
            handleError(error, 'stdin error');
        }
    });

    process.stdout.on('error', (error) => {
        if (!handlePipeError(error)) {
            handleError(error, 'stdout error');
        }
    });
}
