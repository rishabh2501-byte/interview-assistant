// Dual-device relay hub.
// Keeps a per-user "room" with at most one desktop client and one mobile
// client, and forwards messages between them.
// Pairing flow:
//   1. Authenticated desktop client calls POST /api/pair/token
//      → backend issues a short-lived pairing token keyed to userId.
//   2. Desktop renders a QR containing `${FRONTEND_URL}/mobile?token=xxx`.
//   3. Mobile browser loads that URL, opens WS, sends
//      { type: 'hello', role: 'mobile', pairingToken: 'xxx' }.
//   4. Backend resolves pairing token → userId, attaches mobile to that room.
//   5. Desktop, already attached as role=desktop (JWT-auth), is notified via
//      { type: 'peer-joined', role: 'mobile' }.
// After pairing, any message from one side is forwarded to the other.

const crypto = require('crypto');

const PAIRING_TTL_MS = 5 * 60 * 1000; // 5 min window to scan the QR
const pairings = new Map();  // pairingToken → { userId, expires }
const rooms    = new Map();  // userId → { desktop: ws|null, mobile: ws|null }

function getRoom(userId) {
  if (!rooms.has(userId)) rooms.set(userId, { desktop: null, mobile: null });
  return rooms.get(userId);
}

function createPairingToken(userId) {
  // Sweep expired tokens opportunistically
  const now = Date.now();
  for (const [t, v] of pairings) if (v.expires < now) pairings.delete(t);

  const token = crypto.randomBytes(18).toString('base64url');
  pairings.set(token, { userId, expires: now + PAIRING_TTL_MS });
  return { token, expiresIn: PAIRING_TTL_MS / 1000 };
}

function resolvePairingToken(token) {
  const entry = pairings.get(token);
  if (!entry) return null;
  if (entry.expires < Date.now()) { pairings.delete(token); return null; }
  // One-shot: consume on resolve so a leaked token can't be reused.
  pairings.delete(token);
  return entry.userId;
}

// WebSocket.OPEN === 1 per spec; use literal 1 to avoid relying on instance
// having the OPEN constant (ws package: instances do inherit it, but hardcoding
// is safer and also guards against accidental undefined comparisons).
const WS_OPEN = 1;

function attach(userId, role, ws) {
  const room = getRoom(userId);
  // Replace any existing socket for this role (last-write-wins).
  const prev = room[role];
  if (prev && prev !== ws && prev.readyState === WS_OPEN) {
    try { prev.close(4001, 'replaced by newer connection'); } catch (_) {}
  }
  room[role] = ws;
  ws._userId = userId;
  ws._role   = role;

  // Notify the other side that a peer joined.
  const peer = role === 'desktop' ? room.mobile : room.desktop;
  const peerOpen = !!(peer && peer.readyState === WS_OPEN);
  console.log(`[pair] attach user=${userId} role=${role} peerOpen=${peerOpen}`);
  if (peerOpen) {
    safeSend(peer, { type: 'peer-joined', role });
  }
  // Confirm attachment to the just-joined side.
  safeSend(ws, { type: 'ready', role, peerConnected: peerOpen });
}

function detach(ws) {
  const userId = ws._userId;
  const role   = ws._role;
  if (!userId || !role) return;
  const room = rooms.get(userId);
  if (!room) return;
  if (room[role] === ws) room[role] = null;
  const peer = role === 'desktop' ? room.mobile : room.desktop;
  console.log(`[pair] detach user=${userId} role=${role}`);
  if (peer && peer.readyState === WS_OPEN) {
    safeSend(peer, { type: 'peer-left', role });
  }
  if (!room.desktop && !room.mobile) rooms.delete(userId);
}

function relay(fromWs, message) {
  const userId = fromWs._userId;
  const role   = fromWs._role;
  if (!userId || !role) return;
  const room = rooms.get(userId);
  if (!room) return;
  const peer = role === 'desktop' ? room.mobile : room.desktop;
  if (!peer || peer.readyState !== WS_OPEN) return;
  safeSend(peer, message);
}

function safeSend(ws, obj) {
  try { ws.send(JSON.stringify(obj)); } catch (_) {}
}

module.exports = {
  createPairingToken,
  resolvePairingToken,
  attach,
  detach,
  relay,
  safeSend,
  getRoom,
};
