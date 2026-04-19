const express = require('express');
const pool = require('../config/db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// GET /api/subscriptions/me - get current user's active subscription
router.get('/me', authMiddleware, async (req, res) => {
  const result = await pool.query(
    `SELECT s.*, p.name as plan_name, p.price, p.duration_days
     FROM subscriptions s
     JOIN plans p ON s.plan_id = p.id
     WHERE s.user_id = $1
     ORDER BY s.created_at DESC`,
    [req.user.id]
  );
  const active = result.rows.find((s) => s.status === 'ACTIVE' && new Date(s.end_date) > new Date());
  res.json({ subscriptions: result.rows, active_subscription: active || null });
});

module.exports = router;
