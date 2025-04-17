import dotenv from 'dotenv';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {connectToTransport, createTransport} from './server/transport';
import {setupGlobalErrorHandlers} from './server/connection';
import {registerAllTools} from './tools';
import {initializeLinearClient, verifyLinearApiConnection} from './linear';
import {debugLog, handleError} from './utils';

// Load environment variables from .env file
dotenv.config();

// Check for required environment variables
if (!process.env.LINEAR_API_KEY) {
    console.error('ERROR: LINEAR_API_KEY environment variable is required');
    process.exit(1);
}

async function startServer() {
    try {
        // Initialize Linear client
        debugLog('Initializing Linear client...');
        try {
            initializeLinearClient();
            await verifyLinearApiConnection();
            debugLog('Linear client initialized and connection verified');
        } catch (error) {
            handleError(error, 'Failed to initialize Linear client');
            process.exit(1);
        }

        // Create MCP server
        debugLog('Creating MCP server...');
        const server = new McpServer({
            name: 'linear-mcp-server',
            version: '1.0.0',
            capabilities: {
                tools: {
                    // Tool capabilities will be registered by registerAllTools
                }
            }
        });

        // Set up global error handlers
        setupGlobalErrorHandlers();

        // Register all tools with the server
        debugLog('Registering tools...');
        registerAllTools(server);

        // Create and configure transport
        debugLog('Creating transport...');
        const transport = createTransport(server);

        // Connect to transport
        debugLog('Connecting to transport...');
        await connectToTransport(server, transport);

        debugLog('Server started successfully');
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Start the server
startServer();
