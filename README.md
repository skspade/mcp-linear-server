# MCP Server

This repository contains a local-only MCP server that connects to the Linear API using the Linear TypeScript SDK.

## Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)
- Linear API token

## Setup

1. Clone the repository:

   ```sh
   git clone https://github.com/githubnext/workspace-blank.git
   cd workspace-blank
   ```

2. Install dependencies:

   ```sh
   npm install
   ```

3. Create a `.env` file in the root directory and add your Linear API token:

   ```sh
   LINEAR_API_KEY=your_linear_api_token
   ```

## Running the Server

To start the MCP server, run the following command:

```sh
npm start
```

The server will be running at `http://localhost:3000`.

## Obtaining and Configuring the Linear API Token

To interact with the Linear API, you need to obtain an API token. Follow these steps to get your token:

1. Log in to your Linear account.
2. Go to the "Settings" page.
3. Navigate to the "API" section.
4. Click on "Create New Token" and provide a name for the token.
5. Copy the generated token and add it to your `.env` file as shown in the setup section.

Make sure to keep your API token secure and do not share it with others.

## Compatibility with Cline or Claude Desktop

To ensure compatibility with Cline or Claude Desktop, follow these steps:

1. Make sure you have the latest version of Cline or Claude Desktop installed on your machine.
2. Configure the MCP server to run locally on your machine as described in the setup and running sections above.
3. Ensure that the MCP server is running and accessible at `http://localhost:3000`.
4. In Cline or Claude Desktop, configure the application to connect to the MCP server at `http://localhost:3000`.
5. Test the connection and functionality to ensure everything is working as expected.
