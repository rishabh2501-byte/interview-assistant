const pool = require('../config/db');

// Guard for routes that require an active subscription.
// Also enforces session quota: if `options.requireQuota` is true, refuses
// when sessions_used >= sessions_granted. Legacy rows where
// sessions_granted = 0 are treated as unlimited (back-compat).
//
// Usage:
//   router.post('/start', auth, requireSubscription({ requireQuota: true }), ...)
//   router.get('/me',     auth, requireSubscription(),                      ...)
function requireSubscription(options = {}) {
  const { requireQuota = false } = options;

  return async function subscriptionMiddleware(req, res, next) {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT s.*, p.name AS plan_name, p.plan_type
         FROM subscriptions s
         JOIN plans p ON p.id = s.plan_id
        WHERE s.user_id = $1
          AND s.status = 'ACTIVE'
          AND s.end_date > NOW()
        ORDER BY s.end_date DESC
        LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(402).json({
        error: 'NO_ACTIVE_SUBSCRIPTION',
        message: 'No active subscription. Please purchase a plan to access AI features.',
      });
    }

    const sub = result.rows[0];

    if (requireQuota && sub.sessions_granted > 0 && sub.sessions_used >= sub.sessions_granted) {
      return res.status(402).json({
        error: 'QUOTA_EXHAUSTED',
        message: 'Session quota exhausted for your current plan. Buy a top-up or upgrade to continue.',
        quota: {
          granted: sub.sessions_granted,
          used: sub.sessions_used,
          remaining: 0,
        },
      });
    }

    req.subscription = sub;
    next();
  };
}

// Back-compat export: callers using the old default middleware get the
// non-quota variant, matching previous behaviour.
module.exports = requireSubscription();
module.exports.requireSubscription = requireSubscription;
