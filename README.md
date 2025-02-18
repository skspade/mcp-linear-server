# Linear MCP Integration Server

## Instructing Claude

Copy and paste the following to instruct Claude about this integration:

---

I have a Linear integration server running at http://localhost:3000 that you can use to manage Linear tickets. The server provides the following endpoints:

### List All Issues
```http
GET /
```
Returns all issues from the team.

### Get Current Sprint
```http
GET /current-sprint
```
Returns the active sprint/cycle details and all its tickets. The response includes:
- Cycle information (name, start date, end date)
- All tickets in the current sprint

### Create New Ticket
```http
POST /create-ticket
```
Creates a new Linear ticket. Required JSON body:
```json
{
    "title": "Your ticket title",
    "description": "Your ticket description",
    "priority": 0-4,           // optional
    "labels": ["label1"]       // optional
}
```

### Get Specific Ticket
```http
GET /ticket/:id
```
Returns details for a specific ticket by ID.

---

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
npm start
```

The server includes rate limiting (100 requests per 15 minutes) and proper error handling. Once you see "Environment validation successful" and "MCP server listening at http://localhost:3000", you can provide the above instructions to Claude.
