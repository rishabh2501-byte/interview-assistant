# Interview Assistant

A screen-share-invisible AI interview assistant. Listens to your meeting audio, transcribes it in real-time, and gives instant AI-powered answers — completely hidden from Zoom, Google Meet, and Teams screen sharing.

---

## Requirements

- **macOS** (Windows partially supported but invisibility is macOS-only)
- **Node.js 18+** → [nodejs.org](https://nodejs.org)
- **API Key** — at least one of:
  - **Groq** (FREE) → [console.groq.com](https://console.groq.com) — recommended, no credit card needed
  - **OpenAI** (Paid) → [platform.openai.com](https://platform.openai.com) — better screenshot analysis

---

## Setup (after cloning)

```bash
# 1. Install dependencies
npm install

# 2. Start the app
npm start
```

That's it. The app opens as a floating transparent panel on the right side of your screen.

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

## Tech Stack

- **Electron** — desktop app framework
- **Groq API** — free Whisper transcription + Llama chat/vision
- **OpenAI API** — GPT-4o for premium screenshot analysis
- **Ollama** — local offline models (optional)
- **Web Audio API** — real-time microphone capture

---

## How it stays invisible during screen sharing

- `setContentProtection(true)` — excludes window from all screen capture
- `alwaysOnTop: 'screen-saver'` — floats above everything without being captured
- `setVisibleOnAllWorkspaces(true)` — stays visible on all desktops/spaces

The assistant window **will not appear** in Zoom, Google Meet, Teams, or any other screen sharing tool.
