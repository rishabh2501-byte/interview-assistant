const express = require('express');
const multer = require('multer');
const path = require('path');
const pool = require('../config/db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, process.env.UPLOAD_DIR || 'uploads');
  },
  filename: (req, file, cb) => {
    const unique = `${req.user.id}_${Date.now()}${path.extname(file.originalname)}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760') },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only PDF, DOC, DOCX, TXT files are allowed'));
  },
});

// POST /api/resume/upload
router.post('/upload', authMiddleware, upload.single('resume'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const fileUrl = `/uploads/${req.file.filename}`;
  const result = await pool.query(
    `INSERT INTO resumes (user_id, file_name, file_url)
     VALUES ($1, $2, $3) RETURNING *`,
    [req.user.id, req.file.originalname, fileUrl]
  );

  res.status(201).json({ message: 'Resume uploaded successfully', resume: result.rows[0] });
});

// GET /api/resume - get all resumes for user
router.get('/', authMiddleware, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM resumes WHERE user_id = $1 ORDER BY uploaded_at DESC',
    [req.user.id]
  );
  res.json({ resumes: result.rows });
});

// DELETE /api/resume/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  const result = await pool.query(
    'DELETE FROM resumes WHERE id = $1 AND user_id = $2 RETURNING id',
    [req.params.id, req.user.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Resume not found' });
  res.json({ message: 'Resume deleted' });
});

module.exports = router;
