const pool = require('../config/db');

const subscriptionMiddleware = async (req, res, next) => {
  const userId = req.user.id;

  const result = await pool.query(
    `SELECT * FROM subscriptions
     WHERE user_id = $1
       AND status = 'ACTIVE'
       AND end_date > NOW()
     ORDER BY end_date DESC
     LIMIT 1`,
    [userId]
  );

  if (result.rows.length === 0) {
    return res.status(403).json({
      error: 'No active subscription. Please purchase a plan to access AI features.',
    });
  }

  req.subscription = result.rows[0];
  next();
};

module.exports = subscriptionMiddleware;
