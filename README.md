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
Search Linear issues with flexible filtering and pagination support:
- `query` (optional): Text to search in title/description
- `teamId` (optional): Filter by team
- `status` (optional): Filter by status
- `assigneeId` (optional): Filter by assignee
- `priority` (optional): Priority level (0-4)
- `limit` (optional, default: 10): Max results per page
- `cursor` (optional): Pagination cursor for fetching next page
- `sortBy` (optional, default: 'updated'): Field to sort by ('created', 'updated', 'priority', 'title')
- `sortDirection` (optional, default: 'desc'): Sort direction ('asc', 'desc')

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

### linear_get_issue_details
Get detailed information about a specific issue, including full description, comments, and metadata:
- `issueId` (required): Issue ID (e.g., "DATA-1284") to fetch details for

### linear_bulk_update_status
Update the status of multiple Linear issues at once:
- `issueIds` (required): List of issue IDs to update (e.g. ["ENG-123", "DATA-456"])
- `targetStatus` (required): Target status to set for all issues (e.g. "In Progress")

### linear_manage_cycle
Create, update, or get information about Linear cycles (sprints):
- `action` (required): Action to perform: "create", "update", "get", or "list"
- `teamId` (required): Team ID to manage cycles for
- `cycleId` (optional, required for update and get actions): Cycle ID
- `name` (optional, required for create): Cycle name
- `startDate` (optional, required for create): Start date in ISO format (YYYY-MM-DD)
- `endDate` (optional, required for create): End date in ISO format (YYYY-MM-DD)
- `description` (optional): Cycle description

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
- Features an in-memory caching system for improved performance
- Supports pagination for handling large result sets
- Implements batch processing for bulk operations

## Performance and Reliability

The server includes comprehensive features for performance and reliability:

### Caching System
- In-memory caching for frequently accessed data (teams, workflow states)
- Configurable TTL (Time To Live) for cache entries
- Automatic cleanup of expired cache entries
- Cache statistics available in debug mode

### Error Handling
- API timeout protection with configurable timeouts
- Automatic reconnection attempts on connection loss
- Detailed error logging with timestamps and context
- Graceful shutdown handling with cleanup
- Heartbeat monitoring for connection health

### Performance Optimizations
- Batch processing for bulk operations
- Pagination support for large result sets
- Parallel processing with Promise.all for concurrent operations
- Efficient data fetching with minimal API calls

## Dependencies

- `@linear/sdk`: Linear API client
- `@modelcontextprotocol/sdk`: MCP server implementation
- `zod`: Runtime type checking and validation
- `dotenv`: Environment variable management
- TypeScript and related development tools

For the complete list of dependencies, see `package.json`.

## Smithery Deployment

This server can be deployed on [Smithery.ai](https://smithery.ai) using the provided configuration files:

### Prerequisites

- A Smithery.ai account
- Your Linear API key

### Deployment Steps

1. Add this repository to Smithery or claim an existing server
2. Access the Deployments tab (authenticated owners only)
3. Configure the deployment with your Linear API key
4. Deploy the server

### Configuration Files

The repository includes two essential files for Smithery deployment:

1. **Dockerfile**: Defines the server build process
   - Uses Node.js 18 Alpine as the base image
   - Installs dependencies and builds the TypeScript code
   - Sets up the command to run the server

2. **smithery.yaml**: Defines the server startup configuration
   - Specifies the command to run the server
   - Defines the required configuration parameters (Linear API key)
   - Handles environment variable setup

### Testing Locally

You can test the Smithery configuration locally using the MCP Inspector:

```bash
# Build the Docker image
docker build -t linear-mcp-server .

# Run the container with your Linear API key
docker run -e LINEAR_API_KEY=your_api_key_here linear-mcp-server

# Or use the MCP Inspector
npm run inspect
```
