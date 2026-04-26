# Setup Guide

Full setup for a fresh clone. Follow top-to-bottom.

- [Prerequisites](#0-prerequisites)
- [Clone & install](#1-clone--install)
- [Database setup](#2-database-setup)
- [Backend env (REQUIRED)](#3-backend-env--required)
- [Frontend env (optional)](#4-frontend-env--optional)
- [Electron env (optional)](#5-electron-env--optional)
- [Run everything](#6-run-everything)
- [Verify](#7-verify)
- [Phone pairing setup](#8-phone-pairing-dual-device-mode)
- [Razorpay test payments](#9-razorpay-test-payments-optional)
- [SMTP / real emails](#10-smtp--real-emails-optional)
- [Common issues](#common-issues)

---

## 0. Prerequisites

| Tool | Version | Install (macOS) |
|---|---|---|
| Node.js | 18+ | [nodejs.org](https://nodejs.org) or `brew install node` |
| PostgreSQL | 14+ | `brew install postgresql@15 && brew services start postgresql@15` |
| Git | any | `brew install git` |

Verify:
```bash
node --version   # v18+ required
psql --version   # 14+ required
```

---

## 1. Clone & install

```bash
git clone <repo-url> interview-assistants
cd interview-assistants

# There are 3 node projects in this repo — each needs its own install.
npm install                                    # Electron desktop (root)
( cd interview-platform/backend && npm install )
( cd interview-platform/frontend && npm install )
```

---

## 2. Database setup

```bash
# Create the database (use your local postgres superuser)
createdb -U postgres interview_platform
# If that prompts for password and fails, try: createdb interview_platform

# Apply schema + all migrations + seed data
cd interview-platform/backend
psql -U postgres -d interview_platform -f schema.sql
psql -U postgres -d interview_platform -f migrations/001_session_quotas.sql
psql -U postgres -d interview_platform -f migrations/002_email_verification.sql
psql -U postgres -d interview_platform -f seed.sql
cd ../..
```

This gives you:

- 6 tables: `users`, `plans`, `subscriptions`, `payments`, `sessions`, `logs`, `resumes`, `instructions`
- 5 seeded plans: Starter (₹449/5), Pro (₹800/10), Ultra (₹1300/20), Top-up 5, Top-up 10
- A verified test user: `testuser@example.com` / `Test@123` — with a pre-active Pro subscription (10 sessions)

---

## 3. Backend env — REQUIRED

```bash
cd interview-platform/backend
cp .env.example .env
```

Open `.env` and edit the following **required** values:

| Variable | What to set | How |
|---|---|---|
| `DB_USER` | Your Postgres username | Default `postgres` or your macOS login (`whoami`) |
| `DB_PASSWORD` | Your Postgres password | Empty string `` if no password set |
| `JWT_SECRET` | Random 48-byte hex string | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `OPENAI_API_KEY` | Your OpenAI key | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) — **app needs this to answer questions** |
| `FRONTEND_URL` | For QR / pairing / CORS | `http://localhost:5173` for localhost-only; `http://<LAN_IP>:5173` if you want phone pairing |

Find your Mac's LAN IP for `FRONTEND_URL`:
```bash
ipconfig getifaddr en0
```

Everything else has sensible defaults — see [`.env.example`](./interview-platform/backend/.env.example) for the full list including optional Razorpay, SMTP, and pricing knobs.

---

## 4. Frontend env — optional

Only needed if the backend is NOT at `http://localhost:5000`. Local dev skips this entirely — Vite proxies `/api` → backend automatically.

For production deployments:
```bash
cd interview-platform/frontend
cp .env.example .env
# Edit:
# VITE_API_BASE_URL=https://api.yourdomain.com
# VITE_BACKEND_WS=wss://api.yourdomain.com/ws
```

---

## 5. Electron env — optional

By default the Electron app targets `http://localhost:5000`. To point it elsewhere (e.g. prod API):

**Option A — env at launch:**
```bash
BACKEND_URL=https://api.yourdomain.com npm start
```

**Option B — bundled JSON (for packaged apps):**

Create `app-config.json` at repo root:
```json
{ "backendUrl": "https://api.yourdomain.com" }
```

The Electron app reads this on every boot.

---

## 6. Run everything

Three separate terminals:

```bash
# Terminal 1 — Backend API + WebSocket relay
cd interview-platform/backend
npm start
# Expect:
#   Server running on http://localhost:5000
#   WebSocket relay ready on ws://localhost:5000/ws

# Terminal 2 — Frontend web app
cd interview-platform/frontend
npm run dev
# Expect:
#   ➜  Local:   http://localhost:5173/
#   ➜  Network: http://<LAN-IP>:5173/

# Terminal 3 — Electron desktop app (from repo root)
npm start
```

---

## 7. Verify

1. **Landing page**: open `http://localhost:5173/` → Home page with 3 pricing tiers.
2. **Login** as test user:
   - Email: `testuser@example.com`
   - Password: `Test@123`
3. **Dashboard** shows **Pro plan · 10/10 sessions remaining** with a green progress bar.
4. **Electron window** opens, login if needed with the same credentials — you'll see a floating assistant panel.

If all four check out, your setup is complete ✅

---

## 8. Phone pairing (dual-device mode)

Requires phone and Mac on the **same WiFi**.

1. Ensure `FRONTEND_URL` in backend `.env` is `http://<LAN_IP>:5173` (not `localhost`)
2. Ensure frontend runs with `--host 0.0.0.0` (already set in `package.json`)
3. In the Electron desktop app, click **⇆** (pair) button in the header
4. Scan the QR with your phone camera
5. Phone opens `/mobile?token=...` → "Paired with desktop" appears
6. Green dot lights up on the desktop header

**If phone can't load the URL**: macOS firewall may block it. Temporary disable:
```bash
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate off
# re-enable with --setglobalstate on after testing
```

---

## 9. Razorpay test payments — optional

Needed to test the payment flow (pricing pages, UPI checkout, subscription activation).

1. Sign up at [dashboard.razorpay.com](https://dashboard.razorpay.com)
2. Toggle **Test Mode** (top-right)
3. Settings → API Keys → **Generate Test Key**
4. Paste into backend `.env`:
   ```
   RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxxxxx
   RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
   ```
5. Restart backend (`npm start`)

**Test UPI credentials** (no real money):
- Success: UPI ID `success@razorpay`
- Failure: UPI ID `failure@razorpay`

---

## 10. SMTP / real emails — optional

With no SMTP configured, verification + password reset links are **logged to the backend terminal** instead of emailed. That's fine for dev.

For real emails, two easy paths:

### Gmail (easiest)

1. Enable 2-Factor Auth on your Gmail
2. Create an [App Password](https://myaccount.google.com/apppasswords) (16 chars)
3. In backend `.env`:
   ```
   SMTP_SERVICE=gmail
   SMTP_USER=youremail@gmail.com
   SMTP_PASS=xxxxxxxxxxxxxxxx
   SMTP_FROM=youremail@gmail.com
   ```

### SendGrid / Mailgun / Resend

```
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=SG.xxxxxxxxxxxxxxxxxxxxxx
SMTP_FROM=no-reply@yourdomain.com
```

Restart backend after changes.

---

## Common issues

### `EADDRINUSE: port 5000 already in use`
Something else is on port 5000. Kill it:
```bash
lsof -ti:5000 | xargs kill -9
```

### Phone shows "Waiting for desktop" forever
Desktop WebSocket isn't connected. Check Electron devtools (Cmd+Option+I) for `[dd] WS connected`. If missing:
- Restart the Electron app (Cmd+Q then `npm start`)
- Re-login to refresh the JWT

### Phone can't reach `http://<LAN_IP>:5173`
- Both devices on same WiFi? Check twice
- macOS firewall blocking? See [Phone pairing](#8-phone-pairing-dual-device-mode)
- Vite not listening on LAN? Terminal 2 output should show `Network: http://<LAN_IP>:5173` — if only `Local:`, restart `npm run dev`

### Database connection refused
PostgreSQL isn't running:
```bash
brew services start postgresql@15
```

### `Missing required env var JWT_SECRET`
Backend refuses to start without secrets. Check `.env` exists and has the required values listed in [section 3](#3-backend-env--required).

### "Payments not configured" when clicking Pay
Razorpay keys are still the placeholder values. Follow [section 9](#9-razorpay-test-payments--optional).

### Reset / verify email not arriving
SMTP is not configured — that's by design for dev. The link is printed in the **backend terminal**, inside a box:
```
───── EMAIL (not sent, SMTP disabled) ─────
To:      testuser@example.com
Subject: Reset your Interview Assistant password
Body: ...
  http://localhost:5173/reset-password?token=eyJ...
```
Copy and paste into your browser.

---

## Cloner's quick checklist

Before running, you must have done:

- [ ] Installed Node 18+, PostgreSQL 14+
- [ ] `npm install` in all three places (root, backend, frontend)
- [ ] Created `interview_platform` DB
- [ ] Ran `schema.sql` + both migrations + `seed.sql`
- [ ] Copied `backend/.env.example` → `backend/.env`
- [ ] Set `DB_USER` / `DB_PASSWORD` to match your local Postgres
- [ ] Set a real `JWT_SECRET`
- [ ] Set a real `OPENAI_API_KEY`
- [ ] Set `FRONTEND_URL` to LAN IP if doing phone pairing
- [ ] 3 terminals running (backend · frontend · electron)
- [ ] Logged in as test user → dashboard shows Pro plan with quota

If all boxes ticked and something's broken, check [Common issues](#common-issues) or open an issue.
