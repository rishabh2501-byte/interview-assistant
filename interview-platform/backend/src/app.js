require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const authRoutes = require('./routes/auth');
const planRoutes = require('./routes/plans');
const paymentRoutes = require('./routes/payment');
const subscriptionRoutes = require('./routes/subscriptions');
const resumeRoutes = require('./routes/resume');
const instructionRoutes = require('./routes/instructions');
const sessionRoutes = require('./routes/sessions');
const reportRoutes = require('./routes/report');

const app = express();

// Ensure uploads directory exists
const uploadDir = process.env.UPLOAD_DIR || 'uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Middleware
const allowedOrigin = (origin, callback) => {
  if (!origin || /^http:\/\/localhost:\d+$/.test(origin) || origin === process.env.FRONTEND_URL) {
    callback(null, true);
  } else {
    callback(new Error('Not allowed by CORS'));
  }
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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

module.exports = app;
