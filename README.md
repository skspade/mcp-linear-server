# Linear MCP Integration Server

This server provides Linear integration capabilities through the Model Context Protocol (MCP). It allows AI models to interact with Linear for issue tracking and project management.

## Features

The server provides the following tools through the MCP interface:

### linear_create_issue
Creates a new Linear issue with the following parameters:
- `title` (required): Issue title
- `teamId` (required): Team ID to create issue in
- `description` (optional): Issue description (markdown supported)
- `priority` (optional): Priority level (0-4)
- `status` (optional): Initial status name

### linear_search_issues
Search Linear issues with flexible filtering:
- `query` (optional): Text to search in title/description
- `teamId` (optional): Filter by team
- `status` (optional): Filter by status
- `assigneeId` (optional): Filter by assignee
- `priority` (optional): Priority level (0-4)
- `limit` (optional, default: 10): Max results to return

### linear_sprint_issues
Get all issues in the current sprint/iteration:
- `teamId` (required): Team ID to get sprint issues for

### linear_search_teams
Search and retrieve Linear teams:
- `query` (optional): Text to search in team names

### linear_filter_sprint_issues
Filter current sprint issues by status and automatically filters to the current user:
- `teamId` (required): Team ID to get sprint issues for
- `status` (required): Status to filter by (e.g. "Pending Prod Release")

## Developer Setup

1. Get your Linear API key from Linear's settings > API section
2. Create a `.env` file in the project root:
```
LINEAR_API_KEY=your_api_key_here
```

3. Install dependencies:
```bash
npm install
```

4. Start the server:
```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start

# Build TypeScript
npm run build

# Run linter
npm run lint

# Run tests
npm run test

# Inspect MCP server
npm run inspect
```

## Technical Details

- Built with TypeScript and the Model Context Protocol SDK
- Uses Linear SDK for API interactions
- Includes error handling, rate limiting, and connection management
- Supports automatic reconnection with configurable retry attempts
- Implements heartbeat monitoring for connection health
- Provides detailed logging in debug mode

## Error Handling

The server includes comprehensive error handling:
- API timeout protection
- Automatic reconnection attempts on connection loss
- Detailed error logging with timestamps
- Graceful shutdown handling
- Heartbeat monitoring for connection health

## Dependencies

- `@linear/sdk`: Linear API client
- `@modelcontextprotocol/sdk`: MCP server implementation
- `zod`: Runtime type checking and validation
- `dotenv`: Environment variable management
- TypeScript and related development tools

For the complete list of dependencies, see `package.json`.
