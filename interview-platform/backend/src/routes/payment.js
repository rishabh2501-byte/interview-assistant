const express = require('express');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const pool = require('../config/db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

function getRazorpay() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay keys not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env');
  }
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
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
    key_id: process.env.RAZORPAY_KEY_ID,
    plan,
    user: req.user,
  });
});

// POST /api/payment/verify
router.post('/verify', authMiddleware, async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan_id } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !plan_id) {
    return res.status(400).json({ error: 'All payment fields are required' });
  }

  const body = razorpay_order_id + '|' + razorpay_payment_id;
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex');

  if (expectedSignature !== razorpay_signature) {
    await pool.query(
      `UPDATE payments SET status = 'FAILED' WHERE razorpay_order_id = $1`,
      [razorpay_order_id]
    );
    return res.status(400).json({ error: 'Payment signature verification failed' });
  }

  await pool.query(
    `UPDATE payments
     SET razorpay_payment_id = $1, razorpay_signature = $2, status = 'SUCCESS'
     WHERE razorpay_order_id = $3`,
    [razorpay_payment_id, razorpay_signature, razorpay_order_id]
  );

  const planResult = await pool.query('SELECT * FROM plans WHERE id = $1', [plan_id]);
  if (planResult.rows.length === 0) return res.status(404).json({ error: 'Plan not found' });
  const plan = planResult.rows[0];

  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + plan.duration_days);

  await pool.query(
    `INSERT INTO subscriptions (user_id, plan_id, start_date, end_date, status)
     VALUES ($1, $2, $3, $4, 'ACTIVE')`,
    [req.user.id, plan_id, startDate, endDate]
  );

  res.json({
    message: 'Payment verified. Subscription activated.',
    subscription: { plan: plan.name, start_date: startDate, end_date: endDate, status: 'ACTIVE' },
  });
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
