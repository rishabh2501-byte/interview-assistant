const express = require('express');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const pool = require('../config/db');
const config = require('../config');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

function getRazorpay() {
  if (!config.razorpay.enabled) {
    throw new Error('Razorpay keys not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env');
  }
  return new Razorpay({
    key_id: config.razorpay.keyId,
    key_secret: config.razorpay.keySecret,
  });
}

// POST /api/payment/create-order
router.post('/create-order', authMiddleware, async (req, res) => {
  const { plan_id } = req.body;
  if (!plan_id) return res.status(400).json({ error: 'plan_id is required' });

  const planResult = await pool.query('SELECT * FROM plans WHERE id = $1', [plan_id]);
  if (planResult.rows.length === 0) return res.status(404).json({ error: 'Plan not found' });

  const plan = planResult.rows[0];

  const options = {
    amount: plan.price,
    currency: 'INR',
    receipt: `receipt_${Date.now()}`,
    notes: { plan_id, user_id: req.user.id },
    payment_capture: 1,
  };

  const order = await getRazorpay().orders.create(options);

  await pool.query(
    `INSERT INTO payments (user_id, plan_id, razorpay_order_id, amount, status)
     VALUES ($1, $2, $3, $4, 'PENDING')`,
    [req.user.id, plan_id, order.id, plan.price]
  );

  res.json({
    order_id: order.id,
    amount: order.amount,
    currency: order.currency,
    key_id: config.razorpay.keyId,
    plan,
    user: req.user,
  });
});

// POST /api/payment/verify
// On success:
//   • SUBSCRIPTION plan → creates a new ACTIVE subscription row with
//     sessions_granted = plan.sessions_included and end_date = now + duration.
//   • TOPUP plan        → finds the user's most recent ACTIVE subscription
//     and ADDs sessions to its grant; extends end_date to max(current_end,
//     now + plan.duration_days). If no active sub, creates a standalone one
//     so the user doesn't lose the purchase.
// All writes happen in a single transaction so a partial state is impossible.
router.post('/verify', authMiddleware, async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan_id } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !plan_id) {
    return res.status(400).json({ error: 'All payment fields are required' });
  }

  const body = razorpay_order_id + '|' + razorpay_payment_id;
  const expectedSignature = crypto
    .createHmac('sha256', config.razorpay.keySecret)
    .update(body)
    .digest('hex');

  if (expectedSignature !== razorpay_signature) {
    await pool.query(
      `UPDATE payments SET status = 'FAILED' WHERE razorpay_order_id = $1`,
      [razorpay_order_id]
    );
    return res.status(400).json({ error: 'Payment signature verification failed' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE payments
         SET razorpay_payment_id = $1, razorpay_signature = $2, status = 'SUCCESS'
       WHERE razorpay_order_id = $3`,
      [razorpay_payment_id, razorpay_signature, razorpay_order_id]
    );

    const planResult = await client.query('SELECT * FROM plans WHERE id = $1', [plan_id]);
    if (planResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Plan not found' });
    }
    const plan = planResult.rows[0];
    const isTopup = plan.plan_type === 'TOPUP';

    let subscriptionRow;

    if (isTopup) {
      // Find user's most recent ACTIVE subscription
      const existing = await client.query(
        `SELECT * FROM subscriptions
          WHERE user_id = $1 AND status = 'ACTIVE' AND end_date > NOW()
          ORDER BY end_date DESC LIMIT 1`,
        [req.user.id]
      );

      if (existing.rows.length > 0) {
        // Add sessions + extend validity (max of current end_date or now+duration)
        const sub = existing.rows[0];
        const candidateEnd = new Date();
        candidateEnd.setDate(candidateEnd.getDate() + plan.duration_days);
        const newEnd = candidateEnd > new Date(sub.end_date) ? candidateEnd : sub.end_date;

        const updated = await client.query(
          `UPDATE subscriptions
              SET sessions_granted = sessions_granted + $1,
                  end_date = $2
            WHERE id = $3
          RETURNING *`,
          [plan.sessions_included, newEnd, sub.id]
        );
        subscriptionRow = updated.rows[0];
      } else {
        // No active sub: create one so the top-up purchase isn't lost.
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + plan.duration_days);
        const inserted = await client.query(
          `INSERT INTO subscriptions
             (user_id, plan_id, start_date, end_date, sessions_granted, sessions_used, status)
           VALUES ($1, $2, NOW(), $3, $4, 0, 'ACTIVE')
           RETURNING *`,
          [req.user.id, plan_id, endDate, plan.sessions_included]
        );
        subscriptionRow = inserted.rows[0];
      }
    } else {
      // SUBSCRIPTION: supersede any existing active subscription and start fresh.
      // (Could also stack — but fresh-start is simpler and matches user intent.)
      await client.query(
        `UPDATE subscriptions
            SET status = 'CANCELLED'
          WHERE user_id = $1 AND status = 'ACTIVE'`,
        [req.user.id]
      );

      const endDate = new Date();
      endDate.setDate(endDate.getDate() + plan.duration_days);
      const inserted = await client.query(
        `INSERT INTO subscriptions
           (user_id, plan_id, start_date, end_date, sessions_granted, sessions_used, status)
         VALUES ($1, $2, NOW(), $3, $4, 0, 'ACTIVE')
         RETURNING *`,
        [req.user.id, plan_id, endDate, plan.sessions_included]
      );
      subscriptionRow = inserted.rows[0];
    }

    await client.query('COMMIT');

    res.json({
      message: isTopup
        ? 'Top-up added. Sessions credited to your active subscription.'
        : 'Payment verified. Subscription activated.',
      subscription: {
        id: subscriptionRow.id,
        plan: plan.name,
        plan_type: plan.plan_type,
        start_date: subscriptionRow.start_date,
        end_date: subscriptionRow.end_date,
        sessions_granted: subscriptionRow.sessions_granted,
        sessions_used: subscriptionRow.sessions_used,
        status: subscriptionRow.status,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
});

// GET /api/payment/history
router.get('/history', authMiddleware, async (req, res) => {
  const result = await pool.query(
    `SELECT p.*, pl.name as plan_name
     FROM payments p
     LEFT JOIN plans pl ON p.plan_id = pl.id
     WHERE p.user_id = $1
     ORDER BY p.created_at DESC`,
    [req.user.id]
  );
  res.json({ payments: result.rows });
});

module.exports = router;
