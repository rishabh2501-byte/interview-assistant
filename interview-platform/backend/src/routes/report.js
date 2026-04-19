const express = require('express');
const PDFDocument = require('pdfkit');
const pool = require('../config/db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// GET /api/report/:session_id/download?format=pdf|text
router.get('/:session_id/download', authMiddleware, async (req, res) => {
  const { format } = req.query;

  const sessionResult = await pool.query(
    'SELECT * FROM sessions WHERE id = $1 AND user_id = $2',
    [req.params.session_id, req.user.id]
  );
  if (sessionResult.rows.length === 0) {
    return res.status(404).json({ error: 'Session not found' });
  }
  const session = sessionResult.rows[0];

  const logsResult = await pool.query(
    'SELECT * FROM logs WHERE session_id = $1 ORDER BY created_at ASC',
    [req.params.session_id]
  );
  const logs = logsResult.rows;

  if (format === 'text') {
    let text = `INTERVIEW REPORT\n`;
    text += `================\n`;
    text += `Session: ${session.title}\n`;
    text += `Date: ${new Date(session.start_time).toLocaleString()}\n`;
    text += `User: ${req.user.username} (${req.user.email})\n\n`;

    logs.forEach((log, i) => {
      text += `Q${i + 1}: ${log.question}\n`;
      text += `A${i + 1}: ${log.answer || 'N/A'}\n\n`;
    });

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="report_${session.id}.txt"`);
    return res.send(text);
  }

  // Default: PDF
  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="report_${session.id}.pdf"`);
  doc.pipe(res);

  doc
    .fontSize(22)
    .font('Helvetica-Bold')
    .text('INTERVIEW REPORT', { align: 'center' })
    .moveDown(0.5);

  doc
    .fontSize(11)
    .font('Helvetica')
    .text(`Session: ${session.title}`)
    .text(`Date: ${new Date(session.start_time).toLocaleString()}`)
    .text(`Candidate: ${req.user.username} (${req.user.email})`)
    .moveDown(1);

  doc
    .moveTo(50, doc.y)
    .lineTo(550, doc.y)
    .stroke()
    .moveDown(0.5);

  logs.forEach((log, i) => {
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor('#1a56db')
      .text(`Q${i + 1}: ${log.question}`, { paragraphGap: 4 });

    doc
      .fontSize(11)
      .font('Helvetica')
      .fillColor('#111827')
      .text(`A: ${log.answer || 'N/A'}`, { paragraphGap: 6 })
      .moveDown(0.8);

    if (i < logs.length - 1) {
      doc
        .moveTo(50, doc.y)
        .lineTo(550, doc.y)
        .dash(3, { space: 3 })
        .stroke()
        .undash()
        .moveDown(0.5);
    }
  });

  doc.end();
});

// GET /api/report/:session_id/preview - JSON preview
router.get('/:session_id/preview', authMiddleware, async (req, res) => {
  const sessionResult = await pool.query(
    'SELECT * FROM sessions WHERE id = $1 AND user_id = $2',
    [req.params.session_id, req.user.id]
  );
  if (sessionResult.rows.length === 0) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const logsResult = await pool.query(
    'SELECT * FROM logs WHERE session_id = $1 ORDER BY created_at ASC',
    [req.params.session_id]
  );

  res.json({ session: sessionResult.rows[0], logs: logsResult.rows });
});

module.exports = router;
