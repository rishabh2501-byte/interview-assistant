const express = require('express');
const pool = require('../config/db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// GET /api/plans - list all plans (public)
router.get('/', async (req, res) => {
  const result = await pool.query('SELECT * FROM plans ORDER BY price ASC');
  res.json({ plans: result.rows });
});

// GET /api/plans/:id
router.get('/:id', async (req, res) => {
  const result = await pool.query('SELECT * FROM plans WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Plan not found' });
  res.json({ plan: result.rows[0] });
});

module.exports = router;
