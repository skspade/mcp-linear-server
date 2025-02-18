import express, { Request, Response, NextFunction } from 'express';
import { LinearClient } from '@linear/sdk';
import bodyParser from 'body-parser';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

/*
 * IMPORTANT: MCP Integration Rule
 * ------------------------------
 * When adding new functionality to this server:
 * 1. Update the README.md file with the new endpoint details
 * 2. Include the endpoint in the "Instructing Claude" section
 * 3. Follow the existing format:
 *    ```http
 *    METHOD /endpoint
 *    ```
 *    Description and any required request body/parameters
 * 
 * This ensures Claude can be properly instructed about all available functionality.
 */

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Validate environment variables
const envSchema = z.object({
  LINEAR_API_KEY: z.string().min(1),
  LINEAR_TEAM_ID: z.string().min(1).optional(),
});

const envValidation = envSchema.safeParse(process.env);
if (!envValidation.success) {
  console.error('Environment validation failed:', envValidation.error.errors);
  process.exit(1);
}

const linearClient = new LinearClient({
  apiKey: process.env.LINEAR_API_KEY,
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});

// Middleware
app.use(bodyParser.json());
app.use(limiter);

// Input validation schemas
const createTicketSchema = z.object({
  title: z.string().min(1).max(256),
  description: z.string().min(1),
  priority: z.number().min(0).max(4).optional(),
  labels: z.array(z.string()).optional(),
});

// Error handler type
interface ApiError extends Error {
  status?: number;
  code?: string;
}

// Routes
app.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    let teamId = process.env.LINEAR_TEAM_ID;
    
    // If no team ID is provided, get the first team the user has access to
    if (!teamId) {
      const teams = await linearClient.teams();
      const firstTeam = teams.nodes[0];
      if (!firstTeam) {
        throw new Error('No teams found for this user');
      }
      teamId = firstTeam.id;
    }

    const issues = await linearClient.issues({
      first: 100,
      filter: {
        team: { id: { eq: teamId } }
      }
    });
    res.json(issues);
  } catch (error) {
    next(error);
  }
});

app.post('/create-ticket', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validatedData = createTicketSchema.parse(req.body);
    
    let teamId = process.env.LINEAR_TEAM_ID;
    
    // If no team ID is provided, get the first team the user has access to
    if (!teamId) {
      const teams = await linearClient.teams();
      const firstTeam = teams.nodes[0];
      if (!firstTeam) {
        throw new Error('No teams found for this user');
      }
      teamId = firstTeam.id;
    }

    const issue = await linearClient.createIssue({
      ...validatedData,
      teamId,
    });
    
    res.status(201).json(issue);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ 
        error: 'Validation error', 
        details: error.errors 
      });
      return;
    }
    next(error);
  }
});

app.get('/ticket/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const issue = await linearClient.issue(id);
    
    if (!issue) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }
    
    res.json(issue);
  } catch (error) {
    next(error);
  }
});

app.get('/current-sprint', async (req: Request, res: Response, next: NextFunction) => {
  try {
    let teamId = process.env.LINEAR_TEAM_ID;
    
    // If no team ID is provided, get the first team the user has access to
    if (!teamId) {
      const teams = await linearClient.teams();
      const firstTeam = teams.nodes[0];
      if (!firstTeam) {
        throw new Error('No teams found for this user');
      }
      teamId = firstTeam.id;
    }

    // Get active cycle for the team
    const team = await linearClient.team(teamId);
    const activeCycle = await team.activeCycle;
    
    if (!activeCycle) {
      res.status(404).json({ error: 'No active sprint found' });
      return;
    }

    // Get issues for the active cycle
    const issues = await linearClient.issues({
      first: 100,
      filter: {
        team: { id: { eq: teamId } },
        cycle: { id: { eq: activeCycle.id } }
      }
    });
    
    res.json({
      cycle: {
        id: activeCycle.id,
        name: activeCycle.name,
        startsAt: activeCycle.startsAt,
        endsAt: activeCycle.endsAt
      },
      issues: issues
    });
  } catch (error) {
    next(error);
  }
});

// Error handling middleware
app.use((err: ApiError, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  
  // Handle Linear API specific errors
  if (err.code === 'AUTHENTICATION_ERROR') {
    res.status(401).json({ error: 'Invalid Linear API key' });
    return;
  }
  
  if (err.code === 'NOT_FOUND') {
    res.status(404).json({ error: 'Resource not found' });
    return;
  }
  
  // Default error response
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

app.listen(port, () => {
  console.log(`MCP server listening at http://localhost:${port}`);
  console.log('Environment validation successful');
});
