// "Me" routes — aggregated user-facing state for the dashboard / header.
// Keeps the client on a single GET /api/me/usage call instead of N separate
// queries to figure out subscription + quota + current session.

const express = require('express');
const pool = require('../config/db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// GET /api/me/usage
// Returns:
//   subscription: { id, plan_name, plan_type, end_date, sessions_granted, sessions_used, remaining } | null
//   active_session: { id, title, start_time } | null  (a currently in-progress session, if any)
//   can_start_session: bool
router.get('/usage', authMiddleware, async (req, res) => {
  const userId = req.user.id;

  const subRes = await pool.query(
    `SELECT s.id, s.plan_id, s.sessions_granted, s.sessions_used,
            s.start_date, s.end_date, s.status,
            p.name AS plan_name, p.plan_type
       FROM subscriptions s
       JOIN plans p ON p.id = s.plan_id
      WHERE s.user_id = $1
        AND s.status = 'ACTIVE'
        AND s.end_date > NOW()
      ORDER BY s.end_date DESC
      LIMIT 1`,
    [userId]
  );

  const activeSessionRes = await pool.query(
    `SELECT id, title, start_time
       FROM sessions
      WHERE user_id = $1 AND status = 'ACTIVE'
      ORDER BY start_time DESC
      LIMIT 1`,
    [userId]
  );

  const sub = subRes.rows[0] || null;
  let subscription = null;
  let can_start = false;

  if (sub) {
    const remaining = sub.sessions_granted === 0
      ? null // unlimited / legacy
      : Math.max(0, sub.sessions_granted - sub.sessions_used);
    subscription = {
      id: sub.id,
      plan_name: sub.plan_name,
      plan_type: sub.plan_type,
      start_date: sub.start_date,
      end_date: sub.end_date,
      sessions_granted: sub.sessions_granted,
      sessions_used: sub.sessions_used,
      sessions_remaining: remaining,
    };
    can_start = remaining === null || remaining > 0;
  }

  res.json({
    user: { id: req.user.id, email: req.user.email, username: req.user.username },
    subscription,
    active_session: activeSessionRes.rows[0] || null,
    can_start_session: can_start,
  });
});

module.exports = router;
