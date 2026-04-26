const express = require('express');
const authMiddleware = require('../middleware/auth');
const config = require('../config');
const { createPairingToken } = require('../pair');

const router = express.Router();

// Desktop calls this (authenticated with JWT) to get a one-shot pairing
// token that the mobile browser will exchange over WS.
router.post('/token', authMiddleware, (req, res) => {
  const { token, expiresIn } = createPairingToken(req.user.id);
  res.json({
    pairingToken: token,
    expiresIn,
    mobileUrl: `${config.frontendUrl}/mobile?token=${encodeURIComponent(token)}`,
  });
});

module.exports = router;
