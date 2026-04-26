const express = require('express');
const pool = require('../config/db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// GET /api/plans?type=SUBSCRIPTION|TOPUP  (both if omitted)
// Returns only plans where is_active = TRUE. Sorted: subscriptions first, then top-ups, both cheap→expensive.
router.get('/', async (req, res) => {
  const { type } = req.query;
  const params = [];
  let where = 'WHERE is_active = TRUE';
  if (type === 'SUBSCRIPTION' || type === 'TOPUP') {
    params.push(type);
    where += ` AND plan_type = $${params.length}`;
  }
  const result = await pool.query(
    `SELECT id, name, price, duration_days, sessions_included, plan_type, description
       FROM plans
       ${where}
       ORDER BY (plan_type = 'TOPUP') ASC, price ASC`,
    params
  );
  res.json({ plans: result.rows });
});

// GET /api/plans/:id
router.get('/:id', async (req, res) => {
  const result = await pool.query('SELECT * FROM plans WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Plan not found' });
  res.json({ plan: result.rows[0] });
});

module.exports = router;
