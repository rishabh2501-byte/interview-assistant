const express = require('express');
const { OpenAI } = require('openai');
const pool = require('../config/db');
const authMiddleware = require('../middleware/auth');
const subscriptionMiddleware = require('../middleware/subscription');

const router = express.Router();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// POST /api/sessions/start  [requires active subscription]
router.post('/start', authMiddleware, subscriptionMiddleware, async (req, res) => {
  const { title } = req.body;
  const result = await pool.query(
    `INSERT INTO sessions (user_id, title) VALUES ($1, $2) RETURNING *`,
    [req.user.id, title || 'Interview Session']
  );
  res.status(201).json({ message: 'Session started', session: result.rows[0] });
});

// POST /api/sessions/:id/ask  [requires active subscription]
router.post('/:id/ask', authMiddleware, subscriptionMiddleware, async (req, res) => {
  const { question } = req.body;
  if (!question) return res.status(400).json({ error: 'question is required' });

  const sessionResult = await pool.query(
    `SELECT * FROM sessions WHERE id = $1 AND user_id = $2 AND status = 'ACTIVE'`,
    [req.params.id, req.user.id]
  );
  if (sessionResult.rows.length === 0) {
    return res.status(404).json({ error: 'Active session not found' });
  }

  const instructionResult = await pool.query(
    'SELECT content FROM instructions WHERE user_id = $1',
    [req.user.id]
  );
  const userInstruction = instructionResult.rows[0]?.content || '';

  const resumeResult = await pool.query(
    'SELECT file_url FROM resumes WHERE user_id = $1 ORDER BY uploaded_at DESC LIMIT 1',
    [req.user.id]
  );
  const hasResume = resumeResult.rows.length > 0;

  const systemPrompt = [
    'You are an expert AI interview assistant helping a candidate prepare for technical and behavioral interviews.',
    'Provide clear, structured, and concise answers to interview questions.',
    userInstruction ? `User instructions: ${userInstruction}` : '',
    hasResume ? 'The candidate has uploaded their resume. Tailor responses to match their background.' : '',
  ]
    .filter(Boolean)
    .join('\n');

  const logHistory = await pool.query(
    'SELECT question, answer FROM logs WHERE session_id = $1 ORDER BY created_at ASC',
    [req.params.id]
  );

  const messages = [{ role: 'system', content: systemPrompt }];
  for (const log of logHistory.rows) {
    messages.push({ role: 'user', content: log.question });
    if (log.answer) messages.push({ role: 'assistant', content: log.answer });
  }
  messages.push({ role: 'user', content: question });

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    max_tokens: 1000,
    temperature: 0.7,
  });

  const answer = completion.choices[0]?.message?.content || 'No response generated';

  const logResult = await pool.query(
    `INSERT INTO logs (session_id, question, answer) VALUES ($1, $2, $3) RETURNING *`,
    [req.params.id, question, answer]
  );

  res.json({ question, answer, log: logResult.rows[0] });
});

// POST /api/sessions/:id/end
router.post('/:id/end', authMiddleware, async (req, res) => {
  const result = await pool.query(
    `UPDATE sessions
     SET status = 'ENDED', end_time = NOW()
     WHERE id = $1 AND user_id = $2 AND status = 'ACTIVE'
     RETURNING *`,
    [req.params.id, req.user.id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Active session not found' });
  }
  res.json({ message: 'Session ended', session: result.rows[0] });
});

// GET /api/sessions - list all sessions
router.get('/', authMiddleware, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM sessions WHERE user_id = $1 ORDER BY created_at DESC',
    [req.user.id]
  );
  res.json({ sessions: result.rows });
});

// GET /api/sessions/:id - get session with logs
router.get('/:id', authMiddleware, async (req, res) => {
  const sessionResult = await pool.query(
    'SELECT * FROM sessions WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (sessionResult.rows.length === 0) return res.status(404).json({ error: 'Session not found' });

  const logsResult = await pool.query(
    'SELECT * FROM logs WHERE session_id = $1 ORDER BY created_at ASC',
    [req.params.id]
  );

  res.json({ session: sessionResult.rows[0], logs: logsResult.rows });
});

module.exports = router;
