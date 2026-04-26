// Electron runtime config. Resolved ONCE at startup and exported to
// both main and renderer processes. Precedence:
//   1. process.env.BACKEND_URL        (override, e.g. `BACKEND_URL=https://api.prod.com npm start`)
//   2. bundled JSON at <userData>/app-config.json
//   3. compiled defaults below (localhost, dev)
//
// The renderer imports this module via `require('../src/config')`
// (nodeIntegration = true) so the two processes agree on URLs.

const INTERNAL_CALLBACK_PORT = 7789;

function pickBackendUrl() {
  if (process.env.BACKEND_URL) return process.env.BACKEND_URL.replace(/\/$/, '');
  // Bundled config for distributed builds — optional. Read lazily so
  // we don't crash when packaging strips the file.
  try {
    // eslint-disable-next-line global-require
    const path = require('path');
    const fs = require('fs');
    const { app } = require('electron');
    const candidates = [
      app && app.getPath && path.join(app.getPath('userData'), 'app-config.json'),
      path.join(__dirname, '..', 'app-config.json'),
    ].filter(Boolean);
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (raw && typeof raw.backendUrl === 'string') return raw.backendUrl.replace(/\/$/, '');
      }
    }
  } catch (_) { /* ignore — fall through to default */ }
  return 'http://localhost:5000';
}

const backendUrl = pickBackendUrl();
const wsUrl = backendUrl
  .replace(/^http:\/\//, 'ws://')
  .replace(/^https:\/\//, 'wss://') + '/ws';

module.exports = {
  backendUrl,
  wsUrl,
  // API host/port for http.request() calls in main.js
  backendHost: new URL(backendUrl).hostname,
  backendPort: Number(new URL(backendUrl).port) || (backendUrl.startsWith('https') ? 443 : 80),
  backendProtocol: backendUrl.startsWith('https') ? 'https:' : 'http:',

  // Loopback port used by the local auth-callback / subscription-updated
  // HTTP server inside Electron. Not exposed externally.
  internalCallbackPort: INTERNAL_CALLBACK_PORT,

  // Frontend (web) ports Electron probes when constructing "Open browser"
  // links. Dev-only; prod uses the web app URL directly.
  devFrontendPorts: [5173, 5174, 5175, 3000],
};
