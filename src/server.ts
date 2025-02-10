import express from 'express';
import { LinearClient } from '@linear/sdk';

const app = express();
const port = 3000;

const linearClient = new LinearClient({
  apiKey: process.env.LINEAR_API_KEY,
});

app.get('/', async (req, res) => {
  try {
    const issues = await linearClient.issues();
    res.json(issues);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

app.listen(port, () => {
  console.log(`MCP server listening at http://localhost:${port}`);
});
