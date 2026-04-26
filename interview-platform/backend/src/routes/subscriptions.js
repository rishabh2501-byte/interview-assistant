const express = require('express');
const pool = require('../config/db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// GET /api/subscriptions/me  — list all of user's subscriptions + the active one.
// Kept for backward compat (Electron main.js on boot); newer clients should
// use /api/me/usage which returns consolidated state.
router.get('/me', authMiddleware, async (req, res) => {
  const result = await pool.query(
    `SELECT s.id, s.plan_id, s.start_date, s.end_date, s.status, s.created_at,
            s.sessions_granted, s.sessions_used,
            p.name AS plan_name, p.price, p.duration_days,
            p.plan_type, p.sessions_included
       FROM subscriptions s
       JOIN plans p ON s.plan_id = p.id
      WHERE s.user_id = $1
      ORDER BY s.created_at DESC`,
    [req.user.id]
  );
  const active = result.rows.find(
    (s) => s.status === 'ACTIVE' && new Date(s.end_date) > new Date()
  );
  res.json({ subscriptions: result.rows, active_subscription: active || null });
});

module.exports = router;
