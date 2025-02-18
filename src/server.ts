import express, { Request, Response, NextFunction } from 'express';
import { LinearClient } from '@linear/sdk';
import bodyParser from 'body-parser';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Validate environment variables
const envSchema = z.object({
  LINEAR_API_KEY: z.string().min(1),
  LINEAR_TEAM_ID: z.string().min(1),
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
    const issues = await linearClient.issues({
      first: 100,
      filter: {
        team: { id: { eq: process.env.LINEAR_TEAM_ID } }
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
    
    const issue = await linearClient.issueCreate({
      ...validatedData,
      teamId: process.env.LINEAR_TEAM_ID,
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
