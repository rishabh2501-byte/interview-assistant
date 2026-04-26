// Central runtime config. Read ONCE at boot, validate required fields,
// export a typed object. Never read process.env elsewhere — import from
// here instead. Missing required values → crash fast with a helpful error.

require('dotenv').config();

function requireEnv(key) {
  const v = process.env[key];
  if (!v || String(v).trim() === '') {
    throw new Error(
      `Missing required env var ${key}. Copy .env.example to .env and fill in values.`
    );
  }
  return v;
}

function intEnv(key, fallback) {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) throw new Error(`Env ${key} must be an integer, got "${v}"`);
  return n;
}

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd   = NODE_ENV === 'production';

const config = {
  env: NODE_ENV,
  isProd,
  port: intEnv('PORT', 5000),

  // Frontend base URL — used to construct QR / pairing / callback links.
  // Must be reachable from the user's phone browser (LAN IP in dev).
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  // Public URL of THIS backend — used to construct absolute links (emails, etc.).
  // Optional in dev; in prod set this to your https API domain.
  publicBackendUrl: process.env.PUBLIC_BACKEND_URL || `http://localhost:${intEnv('PORT', 5000)}`,

  // CORS allow-list. Comma-separated list of exact origins OR regex strings.
  // Dev default: any localhost:* + FRONTEND_URL.
  extraCorsOrigins: (process.env.EXTRA_CORS_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean),

  db: {
    host:     process.env.DB_HOST || 'localhost',
    port:     intEnv('DB_PORT', 5432),
    database: requireEnv('DB_NAME'),
    user:     requireEnv('DB_USER'),
    password: process.env.DB_PASSWORD || '',
  },

  jwt: {
    secret: requireEnv('JWT_SECRET'),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  razorpay: {
    keyId:     process.env.RAZORPAY_KEY_ID     || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    enabled: !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
                && !process.env.RAZORPAY_KEY_ID.includes('placeholder')),
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    // Model defaults — override per-route with env for quick A/B.
    chatModel:   process.env.OPENAI_CHAT_MODEL   || 'gpt-4o-mini',
    visionModel: process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini',
  },

  // SMTP for transactional email (verify, password reset).
  // If SMTP_HOST (or SMTP_SERVICE) is unset, emails are NOT sent — the
  // link is logged to the server console instead. Good enough for dev.
  smtp: {
    service: process.env.SMTP_SERVICE || '', // e.g. "gmail" (uses nodemailer's built-in presets)
    host:    process.env.SMTP_HOST    || '',
    port:    intEnv('SMTP_PORT', 587),
    secure:  (process.env.SMTP_SECURE || '').toLowerCase() === 'true', // true for 465
    user:    process.env.SMTP_USER || '',
    pass:    process.env.SMTP_PASS || '',
    from:    process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@interview-assistant.local',
    appName: process.env.APP_NAME || 'Interview Assistant',
    get enabled() {
      return Boolean((this.service || this.host) && this.user && this.pass);
    },
  },

  uploads: {
    dir: process.env.UPLOAD_DIR || 'uploads',
    maxBytes: intEnv('MAX_FILE_SIZE', 10 * 1024 * 1024),
  },

  // Pricing / business knobs. These are overridable via env so admins can
  // tune without touching the seed SQL. The seed still owns the plan CATALOG;
  // these are cross-cutting policy values.
  business: {
    // Raw OpenAI cost per session (INR) — used for displaying margin in /admin.
    costPerSessionInr: intEnv('COST_PER_SESSION_INR', 20),
    // Minimum top-up validity in days when applied to an existing subscription.
    topupExtensionDays: intEnv('TOPUP_EXTENSION_DAYS', 180),
    // Grace period in seconds after a session starts during which a failure
    // does NOT consume quota (network glitch etc.).
    sessionStartGraceSec: intEnv('SESSION_START_GRACE_SEC', 30),
  },
};

// Validate pricing sanity
if (config.business.costPerSessionInr <= 0) {
  throw new Error('COST_PER_SESSION_INR must be > 0');
}

// Freeze to catch accidental mutation at runtime.
Object.freeze(config);
Object.freeze(config.db);
Object.freeze(config.jwt);
Object.freeze(config.razorpay);
Object.freeze(config.openai);
Object.freeze(config.smtp);
Object.freeze(config.uploads);
Object.freeze(config.business);

module.exports = config;
