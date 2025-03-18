# MCP Linear Server - Guidelines for Claude

## Build Commands
- `npm start` - Run server in production mode
- `npm run dev` - Run server with auto-reload (development)
- `npm run build` - Build TypeScript to JS
- `npm run lint` - Run ESLint to check code style
- `npm run test` - Run test suite
- `npm run inspect` - Inspect MCP server with inspector tool

## Code Style
- **Module System**: ES Modules (import/export)
- **Formatting**: TypeScript strict mode with consistent indentation
- **Types**: Always use explicit type annotations for functions and parameters
- **Error Handling**: Use try/catch blocks with the handleError utility
- **Promises**: Use async/await with timeout wrappers for API calls
- **Logging**: Use debugLog() for debug logs, console.error for errors
- **Environment**: Use zod for validating environment variables
- **Naming**: camelCase for variables/functions, PascalCase for classes/types

## Best Practices
- Validate all user input with zod schemas
- Handle all promise rejections explicitly
- Add proper error context and timestamps to error messages
- Follow Linear API documentation for request formatting
- Always include timeout handling for external API calls
- Use the withTimeout utility for promise operations