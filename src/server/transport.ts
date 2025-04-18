import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {debugLog, handleError} from '../utils/index.js';
import {HEARTBEAT_INTERVAL_MS, MAX_RECONNECT_ATTEMPTS, RECONNECT_DELAY_MS} from './config.js';
import {connectionState, handlePipeError, shutdown} from './connection.js';

/**
 * Configure and create the transport for the MCP server
 * @param server The MCP server instance
 * @returns The configured transport
 */
export function createTransport(server: McpServer): StdioServerTransport {
    const transport = new StdioServerTransport();

    // Configure error handler
    transport.onerror = async (error: any) => {
        // Check for EPIPE first
        if (handlePipeError(error)) {
            return;
        }

        handleError(error, 'Transport error');
        if (!connectionState.isShuttingDown && connectionState.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            connectionState.reconnectAttempts++;
            debugLog(`Attempting reconnection (${connectionState.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
            setTimeout(async () => {
                try {
                    if (!connectionState.isPipeActive) {
                        debugLog('Pipe is closed, cannot reconnect');
                        await shutdown();
                        return;
                    }
                    await server.connect(transport);
                    connectionState.isConnected = true;
                    debugLog('Reconnection successful');
                } catch (reconnectError) {
                    handleError(reconnectError, 'Reconnection failed');
                    if (connectionState.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                        debugLog('Max reconnection attempts reached, shutting down');
                        await shutdown();
                    }
                }
            }, RECONNECT_DELAY_MS);
        } else if (!connectionState.isShuttingDown) {
            debugLog('Max reconnection attempts reached or shutting down, initiating shutdown');
            await shutdown();
        }
    };

    // Configure message handler
    transport.onmessage = async (message: any) => {
        try {
            debugLog('Received message:', message?.method);

            if (message?.method === 'initialize') {
                debugLog('Handling initialize request');
                connectionState.isConnected = true;
                connectionState.lastHeartbeat = Date.now();
            } else if (message?.method === 'initialized') {
                debugLog('Connection fully initialized');
                connectionState.isConnected = true;
            } else if (message?.method === 'server/heartbeat') {
                connectionState.lastHeartbeat = Date.now();
                debugLog('Heartbeat received');
            }

            // Set up heartbeat check
            const heartbeatCheck = setInterval(() => {
                const timeSinceLastHeartbeat = Date.now() - connectionState.lastHeartbeat;
                if (timeSinceLastHeartbeat > HEARTBEAT_INTERVAL_MS * 2) {
                    debugLog('No heartbeat received, attempting reconnection');
                    clearInterval(heartbeatCheck);
                    if (transport && transport.onerror) {
                        transport.onerror(new Error('Heartbeat timeout'));
                    }
                }
            }, HEARTBEAT_INTERVAL_MS);

            // Clear heartbeat check on process exit
            process.on('beforeExit', () => {
                clearInterval(heartbeatCheck);
            });
        } catch (error) {
            handleError(error, 'Message handling error');
            throw error;
        }
    };

    return transport;
}

/**
 * Connect the server to the transport
 * @param server The MCP server instance
 * @param transport The transport instance
 */
export async function connectToTransport(
    server: McpServer,
    transport: StdioServerTransport
): Promise<void> {
    try {
        debugLog('Connecting to MCP transport...');
        await server.connect(transport);
        debugLog('MCP server connected and ready');
    } catch (error) {
        handleError(error, 'Failed to connect MCP server');
        throw error;
    }
}
