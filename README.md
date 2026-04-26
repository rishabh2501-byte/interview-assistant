# Interview Assistant

A screen-share-invisible AI interview assistant with a full SaaS stack: desktop app that listens to your meeting and streams senior-level answers — hidden from Zoom, Meet, and Teams — plus a web portal for signup, pricing, and a mobile "stealth receiver" so answers can appear on your phone instead of the interview screen.

**This repo contains 3 coordinated pieces:**

1. **Electron desktop app** (`@/Users/rishabh.rai/IdeaProjects/interview-assistants/src/`) — the floating AI assistant
2. **Backend API** (`@/Users/rishabh.rai/IdeaProjects/interview-assistants/interview-platform/backend/`) — Express + Postgres + WebSocket relay
3. **Web frontend** (`@/Users/rishabh.rai/IdeaProjects/interview-assistants/interview-platform/frontend/`) — React landing page, auth flows, dashboard, payments, mobile receiver

---

## 🚀 Quick start

**Full step-by-step setup is in [`SETUP.md`](./SETUP.md).** The short version:

```bash
# 1. Prereqs: Node 18+, PostgreSQL 14+

# 2. Install everything
npm install
( cd interview-platform/backend && npm install )
( cd interview-platform/frontend && npm install )

# 3. Database
createdb interview_platform
cd interview-platform/backend
psql -d interview_platform -f schema.sql
psql -d interview_platform -f migrations/001_session_quotas.sql
psql -d interview_platform -f migrations/002_email_verification.sql
psql -d interview_platform -f seed.sql

# 4. Backend env (REQUIRED — set DB creds, JWT_SECRET, OPENAI_API_KEY)
cp .env.example .env
# ...edit .env...

# 5. Run — 3 terminals
npm start                              # backend (terminal 1)
( cd ../frontend && npm run dev )      # frontend (terminal 2)
( cd ../.. && npm start )              # electron (terminal 3)
```

Open `http://localhost:5173` → sign in with `testuser@example.com` / `Test@123` → Pro plan with 10 sessions is ready.

Full details, troubleshooting, phone pairing, and Razorpay / SMTP setup all in **[`SETUP.md`](./SETUP.md)**.

---

## Requirements

- **macOS** (Windows partially supported but screen-share invisibility is macOS-only)
- **Node.js 18+** → [nodejs.org](https://nodejs.org)
- **PostgreSQL 14+** for the backend
- **OpenAI API key** → [platform.openai.com](https://platform.openai.com) — required for AI features

Optional:
- **Razorpay test keys** for payment flow → [dashboard.razorpay.com](https://dashboard.razorpay.com)
- **SMTP creds** (Gmail App Password / SendGrid / etc.) for real verification + reset emails
- **Groq key** / **Ollama** as free alternatives for some AI calls (see existing integration)

---

## First-time configuration

1. Click **⚙️ Settings** in the app
2. Paste your **Groq API key** (free) in the Groq Key field
3. Optionally paste your **OpenAI API key** — needed for best screenshot analysis (GPT-4o)
4. Select your **Role** (Java Developer, Backend, Frontend, etc.)
5. Optionally upload your **Resume PDF** or paste context about yourself
6. Click **Save**

### macOS Permissions (required)

Go to **System Settings → Privacy & Security** and enable:

| Permission | Why needed |
|---|---|
| **Microphone** | To transcribe interview audio |
| **Screen Recording** | To capture screenshots for analysis |

The app will prompt for these on first launch.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd + Enter` | Generate AI answer from transcription |
| `Cmd + Shift + Enter` | **Screenshot analysis** (best way — see below) |
| `Cmd + H` | Hide / Show the assistant window |
| `Cmd + N` | Stop listening |
| `Cmd + Arrow keys` | Move the window around |
| `Cmd + Shift + Up/Down` | Scroll AI response |

---

## How to use during an interview

### Audio Transcription
The app auto-starts listening when it opens. The interviewer's questions appear in the transcription box in real-time.

Press **`Cmd + Enter`** → AI answers the question as you (the candidate), in first person, using your selected role and resume context.

### Screenshot Analysis (for coding questions)

**Best method — global shortcut:**
1. Make sure the coding question is visible in your browser/IDE
2. Press **`Cmd + Shift + Enter`** — no need to click anything in the app
3. The app captures that exact window and solves the problem

**Button method:**
1. Click the **📸 Screenshot** button
2. A **3-second countdown** appears — switch to the window with the question during that time
3. The app captures and analyzes it

The screenshot answer uses:
- **GPT-4o** if you have an OpenAI key (best accuracy)
- **Groq Llama-4-Scout** if only Groq key (free, good enough)
- **Ollama** if running locally (fully offline)

---

## Free vs Paid limits

| | Groq (Free) | OpenAI (Paid) |
|---|---|---|
| Audio transcription | 7,200 sec/day (~2 hrs) | Pay per use |
| AI answers | ~14,400 requests/day | Pay per use |
| Screenshot analysis | ~14,400 requests/day | Pay per use (~$0.01/screenshot) |
| Daily reset | Midnight UTC (5:30 AM IST) | No reset needed |

**For a 3-hour interview session with 100 screenshots:** Groq handles it fine for screenshots and answers. For audio beyond 2 hours, enable **Local Whisper** in Settings (free, runs on your laptop, no limit).

---

## Optional: Ollama (fully offline, no API key)

If you want everything to run locally with no API keys:

```bash
# Install Ollama
brew install ollama

# Pull models
ollama pull mistral        # for AI answers
ollama pull llava          # for screenshot analysis

# Start Ollama
ollama serve
```

Then enable Ollama in Settings. The app auto-detects it on startup.

---

## Dual-device mode (stealth)

Pair your phone to the desktop app with a QR code — AI answers stream to your phone instead of the desktop screen. Completely off-camera.

- Click the **⇆** button in the desktop app's header → QR modal appears
- Scan with your phone (same WiFi required)
- Phone opens a mobile page showing live-streamed answers + tappable **Answer** / **Screenshot** buttons that trigger the desktop remotely
- Desktop output-mode toggle: **D** (desktop only) / **D+M** (both) / **M** (mobile only — desktop stays blank)

See the [Phone pairing section in SETUP.md](./SETUP.md#8-phone-pairing-dual-device-mode) for LAN configuration.

---

## Web portal

A companion web app handles signup, authentication, pricing, and the mobile receiver. Run it alongside the desktop app from `@/Users/rishabh.rai/IdeaProjects/interview-assistants/interview-platform/`.

- **`/`** — landing page with features + pricing (auto-redirects to dashboard if signed in)
- **`/login`** + **`/signup`** + **`/forgot-password`** + **`/reset-password`** + **`/verify-email`** — full auth flow
- **`/dashboard`** — subscription status, session quota progress, recent interviews, billing history
- **`/plans`** — monthly subscriptions (Starter / Pro / Ultra) and top-up packs
- **`/payment/:planId`** — Razorpay checkout, UPI-first
- **`/mobile?token=...`** — phone receiver for dual-device mode

---

## Tech Stack

**Desktop**
- **Electron** — floating, screen-share-invisible window
- **Web Audio API** — real-time microphone capture

**Backend** (`interview-platform/backend`)
- **Express** + **PostgreSQL** — REST API, user accounts, sessions, payments
- **ws** — WebSocket relay for dual-device sync
- **nodemailer** — transactional emails (verify, reset)
- **Razorpay** — UPI + cards + netbanking payments

**Frontend** (`interview-platform/frontend`)
- **React 18** + **React Router** + **Vite** + **Tailwind CSS** + **lucide-react** icons

**AI**
- **OpenAI** — GPT-4o + GPT-4o-mini (chat + vision)
- **Groq API** — free Whisper transcription + Llama fallback
- **Ollama** — local offline models (optional)

---

## How it stays invisible during screen sharing

- `setContentProtection(true)` — excludes window from all screen capture
- `alwaysOnTop: 'screen-saver'` — floats above everything without being captured
- `setVisibleOnAllWorkspaces(true)` — stays visible on all desktops/spaces

The assistant window **will not appear** in Zoom, Google Meet, Teams, or any other screen sharing tool.
