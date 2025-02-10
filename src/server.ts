import express from 'express';
import { LinearClient } from '@linear/sdk';
import bodyParser from 'body-parser';

const app = express();
const port = 3000;

const linearClient = new LinearClient({
  apiKey: process.env.LINEAR_API_KEY,
});

app.use(bodyParser.json());

app.get('/', async (req, res) => {
  try {
    const issues = await linearClient.issues();
    res.json(issues);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/create-ticket', async (req, res) => {
  try {
    const { title, description } = req.body;
    const issue = await linearClient.issueCreate({ title, description });
    res.json(issue);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/ticket/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const issue = await linearClient.issue(id);
    res.json(issue);
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
