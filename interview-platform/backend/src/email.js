// Transactional email service.
// When SMTP is configured (SMTP_HOST or SMTP_SERVICE + USER + PASS),
// emails are sent via nodemailer. Otherwise, we log the full intended
// email (including any action link) to the server console so dev flows
// still work end-to-end.
//
// All send* helpers:
//   • never throw — email failure must not break the user flow.
//   • return { delivered: bool, preview?: string, error?: string }.

const nodemailer = require('nodemailer');
const config = require('./config');

let transporter = null;

function getTransporter() {
  if (!config.smtp.enabled) return null;
  if (transporter) return transporter;
  const opts = config.smtp.service
    ? { service: config.smtp.service, auth: { user: config.smtp.user, pass: config.smtp.pass } }
    : {
        host:   config.smtp.host,
        port:   config.smtp.port,
        secure: config.smtp.secure,
        auth:   { user: config.smtp.user, pass: config.smtp.pass },
      };
  transporter = nodemailer.createTransport(opts);
  return transporter;
}

async function sendEmail({ to, subject, text, html }) {
  const tr = getTransporter();
  if (!tr) {
    // Dev fallback — dump to console so the user can click the link.
    console.log('\n───────────────────────── EMAIL (not sent, SMTP disabled) ─────────────────────────');
    console.log(`To:      ${to}`);
    console.log(`From:    ${config.smtp.from}`);
    console.log(`Subject: ${subject}`);
    console.log('Body:');
    console.log(text || '(html-only; see html payload)');
    console.log('────────────────────────────────────────────────────────────────────────────────────\n');
    return { delivered: false, preview: text };
  }
  try {
    const info = await tr.sendMail({
      from: `"${config.smtp.appName}" <${config.smtp.from}>`,
      to, subject, text, html,
    });
    console.log(`[email] sent → ${to} (id=${info.messageId})`);
    return { delivered: true };
  } catch (err) {
    console.error('[email] send failed:', err.message);
    return { delivered: false, error: err.message };
  }
}

// Branded HTML wrapper so dev/prod emails look consistent.
function wrapHtml(body) {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;color:#111;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.05);">
    <div style="padding:28px 28px 8px;font-size:13px;letter-spacing:0.08em;color:#666;text-transform:uppercase;">${escapeHtml(config.smtp.appName)}</div>
    <div style="padding:0 28px 28px;font-size:15px;line-height:1.6;">${body}</div>
    <div style="padding:16px 28px;background:#fafafa;border-top:1px solid #eee;font-size:11px;color:#999;">
      If you didn't request this, you can ignore this email.
    </div>
  </div>
</body></html>`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ─── High-level helpers ─────────────────────────────────────────────────
async function sendVerifyEmail({ to, username, link }) {
  const subject = `Verify your ${config.smtp.appName} account`;
  const text = `Hi ${username || ''},

Thanks for signing up for ${config.smtp.appName}! Please verify your email by clicking the link below:

${link}

This link expires in 24 hours.`;
  const html = wrapHtml(`
    <h2 style="margin:12px 0 16px;font-size:20px;">Verify your email</h2>
    <p>Hi ${escapeHtml(username || '')},</p>
    <p>Thanks for signing up for <b>${escapeHtml(config.smtp.appName)}</b>. Click the button below to confirm your email address.</p>
    <p style="margin:24px 0;"><a href="${link}" style="display:inline-block;padding:12px 20px;background:#0a0a0b;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;">Verify email</a></p>
    <p style="color:#666;font-size:13px;">Or copy this link:<br><span style="word-break:break-all;">${escapeHtml(link)}</span></p>
    <p style="color:#999;font-size:12px;">Expires in 24 hours.</p>
  `);
  return sendEmail({ to, subject, text, html });
}

async function sendPasswordResetEmail({ to, username, link }) {
  const subject = `Reset your ${config.smtp.appName} password`;
  const text = `Hi ${username || ''},

Someone requested a password reset for your ${config.smtp.appName} account. If this was you, click the link below to set a new password:

${link}

This link expires in 1 hour. If you didn't request this, you can safely ignore this email.`;
  const html = wrapHtml(`
    <h2 style="margin:12px 0 16px;font-size:20px;">Reset your password</h2>
    <p>Hi ${escapeHtml(username || '')},</p>
    <p>Click the button below to set a new password for your account.</p>
    <p style="margin:24px 0;"><a href="${link}" style="display:inline-block;padding:12px 20px;background:#0a0a0b;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;">Reset password</a></p>
    <p style="color:#666;font-size:13px;">Or copy this link:<br><span style="word-break:break-all;">${escapeHtml(link)}</span></p>
    <p style="color:#999;font-size:12px;">Expires in 1 hour. If you didn't request this, ignore this email.</p>
  `);
  return sendEmail({ to, subject, text, html });
}

module.exports = {
  sendEmail,
  sendVerifyEmail,
  sendPasswordResetEmail,
  isSmtpConfigured: () => !!getTransporter(),
};
