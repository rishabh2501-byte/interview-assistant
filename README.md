# Interview Assistant 🎯

A screen-share-invisible interview assistant that listens to your meetings and provides instant AI-powered answers.

## Features

- **🤖 AI Answer** - Get instant AI-generated answers based on meeting transcription
- **📸 Screenshot Analysis** - Capture and analyze screen content (coding problems, diagrams, etc.)
- **🎤 Audio Capture** - Continuous meeting audio transcription
- **👻 Invisible Mode** - Window is NOT visible during screen sharing

## Installation

```bash
# Install dependencies
npm install

# Start the application
npm start
```

## Usage

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + Shift + H` | Hide/Show the assistant |
| `Cmd/Ctrl + Shift + A` | Quick AI Answer |
| `Cmd/Ctrl + Shift + S` | Screenshot Analysis |

### Setup

1. Launch the app
2. Click **⚙️ Settings** 
3. Enter your OpenAI API Key
4. Click **Save**

### During Interview

1. Click **Capture Audio** to start listening
2. The app will transcribe the conversation in real-time
3. When you need an answer:
   - Click **AI Answer** for text-based response
   - Click **Screenshot Analysis** if there's a visual problem/question

## Requirements

- Node.js 18+
- OpenAI API Key (with access to GPT-4o and Whisper)
- macOS (for full screen-share invisibility)

## How It Stays Invisible

The app uses several techniques to remain invisible during screen sharing:
- `setContentProtection(true)` - Excludes window from screen capture
- `type: 'panel'` - Special window type not captured by most screen share tools
- `alwaysOnTop: 'screen-saver'` - Stays above all windows without being captured

## Tech Stack

- Electron
- OpenAI GPT-4o (answers & vision)
- OpenAI Whisper (transcription)
- Web Audio API

## License

MIT
