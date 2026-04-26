const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const config = require('../config');
const authMiddleware = require('../middleware/auth');
const { sendVerifyEmail, sendPasswordResetEmail } = require('../email');

const router = express.Router();

// JWT helpers for single-use action tokens (verify, reset).
// We bind the reset token to the CURRENT password_hash — once the password
// changes, any outstanding reset links become invalid automatically.
function signActionToken(payload, expiresIn) {
  return jwt.sign(payload, config.jwt.secret, { expiresIn });
}
function verifyActionToken(token, expectedPurpose) {
  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    if (decoded.purpose !== expectedPurpose) return null;
    return decoded;
  } catch {
    return null;
  }
}

// Build an absolute frontend URL (e.g. "https://app.domain/reset-password?token=...")
function frontendLink(pathAndQuery) {
  const base = config.frontendUrl.replace(/\/$/, '');
  return `${base}${pathAndQuery.startsWith('/') ? '' : '/'}${pathAndQuery}`;
}

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'username, email, and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const existing = await pool.query(
    'SELECT id FROM users WHERE username = $1 OR email = $2',
    [username, email]
  );
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: 'Username or email already in use' });
  }

  const password_hash = await bcrypt.hash(password, 10);
  const result = await pool.query(
    `INSERT INTO users (username, email, password_hash)
     VALUES ($1, $2, $3) RETURNING id, username, email, created_at`,
    [username, email, password_hash]
  );

  const user = result.rows[0];
  const token = jwt.sign({ id: user.id }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });

  // Fire-and-forget verification email. Don't block signup on email delivery.
  const verifyToken = signActionToken({ id: user.id, purpose: 'verify-email' }, '24h');
  const verifyLink = frontendLink(`/verify-email?token=${encodeURIComponent(verifyToken)}`);
  sendVerifyEmail({ to: user.email, username: user.username, link: verifyLink })
    .catch(err => console.error('[signup] sendVerifyEmail error:', err.message));

  res.status(201).json({
    message: 'User registered successfully',
    token,
    user: { ...user, email_verified: false },
  });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  if (result.rows.length === 0) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const user = result.rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ id: user.id }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });

  res.json({
    message: 'Login successful',
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      email_verified: user.email_verified,
    },
  });
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  const r = await pool.query(
    'SELECT id, username, email, email_verified, created_at FROM users WHERE id = $1',
    [req.user.id]
  );
  res.json({ user: r.rows[0] || req.user });
});

// ───────────────────────────────────────────────────────────────────
// Email verification
// ───────────────────────────────────────────────────────────────────

// POST /api/auth/verify-email  { token }
// Exchanges a verify-email JWT for a DB flip. Idempotent: already-verified
// users get a 200 with { alreadyVerified: true }.
router.post('/verify-email', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'token is required' });

  const decoded = verifyActionToken(token, 'verify-email');
  if (!decoded) return res.status(400).json({ error: 'Invalid or expired verification link' });

  const r = await pool.query(
    `UPDATE users
        SET email_verified = TRUE
      WHERE id = $1
      RETURNING id, email, email_verified`,
    [decoded.id]
  );
  if (r.rowCount === 0) return res.status(404).json({ error: 'User not found' });
  res.json({ message: 'Email verified', user: r.rows[0] });
});

// POST /api/auth/resend-verification  [auth required]
// Re-issues the verification email. Rate limit would go here for prod.
router.post('/resend-verification', authMiddleware, async (req, res) => {
  const r = await pool.query(
    'SELECT id, email, username, email_verified FROM users WHERE id = $1',
    [req.user.id]
  );
  const user = r.rows[0];
  if (!user)                return res.status(404).json({ error: 'User not found' });
  if (user.email_verified)  return res.json({ message: 'Email already verified', alreadyVerified: true });

  const verifyToken = signActionToken({ id: user.id, purpose: 'verify-email' }, '24h');
  const link = frontendLink(`/verify-email?token=${encodeURIComponent(verifyToken)}`);
  await sendVerifyEmail({ to: user.email, username: user.username, link });
  res.json({ message: 'Verification email sent' });
});

// ───────────────────────────────────────────────────────────────────
// Password reset
// ───────────────────────────────────────────────────────────────────

// POST /api/auth/forgot-password  { email }
// Always returns 200 so an attacker can't probe which emails are registered.
// If the email exists, an action token is emailed (or console-logged in dev).
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email is required' });

  const r = await pool.query(
    'SELECT id, email, username, password_hash FROM users WHERE email = $1',
    [email]
  );
  const user = r.rows[0];

  if (user) {
    // Include a prefix of the current password_hash so the token auto-invalidates
    // as soon as the password is changed (or another reset is completed).
    const pwNonce = user.password_hash.slice(-12);
    const token = signActionToken(
      { id: user.id, purpose: 'reset-password', pwNonce },
      '1h'
    );
    const link = frontendLink(`/reset-password?token=${encodeURIComponent(token)}`);
    sendPasswordResetEmail({ to: user.email, username: user.username, link })
      .catch(err => console.error('[forgot] send error:', err.message));
  }

  res.json({
    message: 'If an account with that email exists, a reset link has been sent.',
  });
});

// POST /api/auth/reset-password  { token, password }
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'token and password are required' });
  if (password.length < 6)  return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const decoded = verifyActionToken(token, 'reset-password');
  if (!decoded) return res.status(400).json({ error: 'Invalid or expired reset link' });

  // Validate pwNonce against current password_hash — rejects tokens issued
  // before a previous reset completed.
  const ur = await pool.query('SELECT password_hash FROM users WHERE id = $1', [decoded.id]);
  const user = ur.rows[0];
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.password_hash.slice(-12) !== decoded.pwNonce) {
    return res.status(400).json({ error: 'This reset link has already been used' });
  }

  const newHash = await bcrypt.hash(password, 10);
  await pool.query(
    'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
    [newHash, decoded.id]
  );

  res.json({ message: 'Password reset successful. You can now log in.' });
});

module.exports = router;
