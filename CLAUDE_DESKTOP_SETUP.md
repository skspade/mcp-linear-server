# Setting Up the Linear MCP Server with Claude Desktop

This guide will walk you through the process of setting up and using the Linear MCP (Model Context Protocol) server with Claude Desktop. This integration allows Claude to interact directly with your Linear workspace for issue tracking and project management.

## Prerequisites

Before you begin, make sure you have the following:

- [Claude Desktop](https://claude.ai/desktop) installed on your computer
- [Node.js](https://nodejs.org/) (latest LTS version recommended)
- A Linear account with API access
- Your Linear API key (available in Linear's settings > API section)

## Step 1: Clone and Set Up the MCP Linear Server

1. Clone the repository:
   ```bash
   git clone https://github.com/skspade/mcp-linear-server.git
   cd mcp-linear-server
   ```

2. Create a `.env` file in the project root with your Linear API key:
   ```
   LINEAR_API_KEY=your_api_key_here
   ```
   Replace `your_api_key_here` with your actual Linear API key.

3. Install dependencies:
   ```bash
   npm install
   ```

## Step 2: Configure Claude Desktop

Claude Desktop needs to be configured to connect to your MCP Linear server. This is done through a configuration file:

### Locate or Create the Configuration File

The configuration file location depends on your operating system:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

If the file doesn't exist, create it.

### Edit the Configuration File

Add the following content to the configuration file:

```json
{
  "mcp_servers": [
    {
      "name": "Linear MCP Server",
      "command": "node --import tsx /path/to/your/mcp-linear-server/src/server.ts",
      "working_directory": "/path/to/your/mcp-linear-server"
    }
  ]
}
```

Replace `/path/to/your/mcp-linear-server` with the actual path to where you cloned the repository.

### Alternative: Access Configuration Through Claude Desktop

You can also access the configuration file directly through Claude Desktop:

1. Open Claude Desktop
2. Click on the Claude icon in the menu bar (macOS) or system tray (Windows)
3. Select "Settings"
4. Go to the "Developer" tab
5. Click "Edit Config" to open the configuration file in your default text editor

## Step 3: Start Using the Integration

1. Start Claude Desktop
2. Begin a new conversation
3. Click on the "..." menu in the bottom right corner of the chat interface
4. Select "Connect to MCP Server" and choose "Linear MCP Server" from the list

You should now be connected to your Linear workspace through the MCP server.

## Available Linear Tools

Once connected, you can ask Claude to perform various Linear-related tasks:

### Creating Issues

Ask Claude to create new issues in your Linear workspace:

```
Create a Linear issue titled "Implement login feature" for the Engineering team with high priority
```

### Searching Issues

Search for issues with various filters:

```
Find all high-priority issues assigned to me in the current sprint
```

### Team Management

Get information about teams in your Linear workspace:

```
Show me all the teams in Linear
```

### Sprint/Cycle Management

Create or manage sprints (cycles) in Linear:

```
Create a new sprint called "Q4 Planning" starting next Monday and ending in two weeks
```

### Issue Details

Get detailed information about specific issues:

```
Show me the details for issue ENG-123 including comments
```

### Status Updates

Update the status of issues:

```
Move issues ENG-123 and DATA-456 to "In Progress" status
```

## Troubleshooting

If you encounter issues with the integration, try these troubleshooting steps:

### Connection Issues

- Make sure the server is running and the path in the configuration file is correct
- Check that your Linear API key is valid and has the necessary permissions
- Verify that the environment variables are properly set in the `.env` file

### Server Not Starting

- Check for error messages in the terminal where you started the MCP server
- Ensure Node.js is properly installed and up to date
- Verify that all dependencies are installed correctly

### Claude Not Recognizing the Server

- Restart both the server and Claude Desktop
- Check the configuration file for any syntax errors
- Make sure the paths in the configuration file are absolute paths

## Alternative: Using Smithery Deployment

If you prefer not to run the server locally, you can deploy it on [Smithery.ai](https://smithery.ai):

1. Create a Smithery.ai account
2. Add this repository to Smithery or claim an existing server
3. Configure the deployment with your Linear API key
4. Deploy the server
5. Use the Smithery URL in your Claude Desktop configuration

## Advanced Configuration

### Running in Development Mode

For development with auto-reload:

```bash
npm run dev
```

### Inspecting the MCP Server

For debugging and inspecting the server:

```bash
npm run inspect
```

### Building the TypeScript Code

If you need to build the TypeScript code:

```bash
npm run build
```

## Technical Details

The Linear MCP server provides the following features:

- Integration with Linear's API through the Linear SDK
- Error handling and reconnection logic
- Caching for improved performance
- Detailed logging for debugging
- Support for all major Linear operations

For more detailed information about the server's capabilities and implementation, refer to the [README.md](README.md) file in the repository.
