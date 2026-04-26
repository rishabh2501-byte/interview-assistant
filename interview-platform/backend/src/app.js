require('express-async-errors');

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const jwt = require('jsonwebtoken');
const { WebSocketServer } = require('ws');

const config = require('./config');  // loads dotenv + validates env
const pair = require('./pair');

const authRoutes = require('./routes/auth');
const planRoutes = require('./routes/plans');
const paymentRoutes = require('./routes/payment');
const subscriptionRoutes = require('./routes/subscriptions');
const resumeRoutes = require('./routes/resume');
const instructionRoutes = require('./routes/instructions');
const sessionRoutes = require('./routes/sessions');
const reportRoutes = require('./routes/report');
const pairRoutes = require('./routes/pair');
const meRoutes = require('./routes/me');

const app = express();

// Ensure uploads directory exists
const uploadDir = config.uploads.dir;
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Middleware — CORS allow-list:
//   • Any http://localhost:<port>  (dev)
//   • Any http://<LAN-IP>:<port>   (dev, phone on same WiFi)
//   • FRONTEND_URL                 (explicit)
//   • EXTRA_CORS_ORIGINS (csv)     (production domains)
const LAN_ORIGIN = /^http:\/\/\d+\.\d+\.\d+\.\d+(?::\d+)?$/;
const LOCALHOST = /^http:\/\/localhost:\d+$/;
const allowedOrigin = (origin, callback) => {
  if (!origin) return callback(null, true);
  if (LOCALHOST.test(origin)) return callback(null, true);
  if (LAN_ORIGIN.test(origin)) return callback(null, true);
  if (origin === config.frontendUrl) return callback(null, true);
  if (config.extraCorsOrigins.includes(origin)) return callback(null, true);
  callback(new Error(`Not allowed by CORS: ${origin}`));
};
app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '..', uploadDir)));
// Routes
app.use('/api/auth', authRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/resume', resumeRoutes);
app.use('/api/instructions', instructionRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/report', reportRoutes);
app.use('/api/pair', pairRoutes);
app.use('/api/me', meRoutes);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// 404
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

// ─── HTTP + WebSocket server (dual-device relay) ─────────────────────────
const PORT = config.port;
const server = http.createServer(app);

// WS endpoint at /ws. First message from the client must be a hello:
//   desktop: { type:'hello', role:'desktop', token:'<JWT>' }
//   mobile:  { type:'hello', role:'mobile',  pairingToken:'<one-shot>' }
// After a successful hello, any subsequent message is relayed to the peer.
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  let helloed = false;
  const helloTimeout = setTimeout(() => {
    if (!helloed) try { ws.close(4000, 'hello timeout'); } catch (_) {}
  }, 10_000);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (!helloed) {
      if (msg.type !== 'hello') {
        pair.safeSend(ws, { type: 'error', error: 'expected hello first' });
        return ws.close(4000, 'expected hello');
      }
      if (msg.role === 'desktop') {
        try {
          const decoded = jwt.verify(msg.token, config.jwt.secret);
          pair.attach(decoded.id, 'desktop', ws);
          helloed = true;
          clearTimeout(helloTimeout);
        } catch {
          pair.safeSend(ws, { type: 'error', error: 'invalid token' });
          return ws.close(4001, 'invalid token');
        }
        return;
      }
      if (msg.role === 'mobile') {
        const userId = pair.resolvePairingToken(msg.pairingToken);
        if (!userId) {
          pair.safeSend(ws, { type: 'error', error: 'invalid or expired pairing token' });
          return ws.close(4002, 'bad pairing token');
        }
        pair.attach(userId, 'mobile', ws);
        helloed = true;
        clearTimeout(helloTimeout);
        return;
      }
      pair.safeSend(ws, { type: 'error', error: 'unknown role' });
      return ws.close(4003, 'unknown role');
    }

    // Post-hello: ignore reserved relay-control message types, pass through the rest.
    if (msg.type === 'ping') return pair.safeSend(ws, { type: 'pong' });
    pair.relay(ws, msg);
  });

  ws.on('close', () => {
    clearTimeout(helloTimeout);
    pair.detach(ws);
  });
  ws.on('error', () => {
    clearTimeout(helloTimeout);
    pair.detach(ws);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket relay ready on ws://localhost:${PORT}/ws`);
});

module.exports = app;
