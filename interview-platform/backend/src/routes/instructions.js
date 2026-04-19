const express = require('express');
const pool = require('../config/db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// POST /api/instructions - save or update instruction
router.post('/', authMiddleware, async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'content is required' });

  const existing = await pool.query(
    'SELECT id FROM instructions WHERE user_id = $1',
    [req.user.id]
  );

  if (existing.rows.length > 0) {
    const result = await pool.query(
      `UPDATE instructions SET content = $1, updated_at = NOW()
       WHERE user_id = $2 RETURNING *`,
      [content, req.user.id]
    );
    return res.json({ message: 'Instructions updated', instruction: result.rows[0] });
  }

  const result = await pool.query(
    `INSERT INTO instructions (user_id, content) VALUES ($1, $2) RETURNING *`,
    [req.user.id, content]
  );
  res.status(201).json({ message: 'Instructions saved', instruction: result.rows[0] });
});

// GET /api/instructions
router.get('/', authMiddleware, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM instructions WHERE user_id = $1',
    [req.user.id]
  );
  res.json({ instruction: result.rows[0] || null });
});

// DELETE /api/instructions
router.delete('/', authMiddleware, async (req, res) => {
  await pool.query('DELETE FROM instructions WHERE user_id = $1', [req.user.id]);
  res.json({ message: 'Instructions deleted' });
});

module.exports = router;
