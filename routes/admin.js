const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { requirePassphrase, requireAdmin } = require('../middleware/identity');

const router = express.Router();
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(uploadDir, 'tmp');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}${ext}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

// Create a new quiz with question image
router.post('/quiz', requirePassphrase, requireAdmin, upload.single('questionImage'), (req, res) => {
  const { title } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Title required' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'Question image required' });
  }

  const result = db.prepare(
    'INSERT INTO quizzes (title) VALUES (?)'
  ).run(title.trim());

  const quizId = result.lastInsertRowid;

  // Move image to quiz-specific directory
  const quizDir = path.join(uploadDir, String(quizId));
  fs.mkdirSync(quizDir, { recursive: true });
  const filename = `questions${path.extname(req.file.originalname).toLowerCase() || '.jpg'}`;
  fs.renameSync(req.file.path, path.join(quizDir, filename));

  db.prepare('UPDATE quizzes SET question_image = ? WHERE id = ?').run(filename, quizId);

  res.json({ id: quizId, title: title.trim() });
});

// Upload answer image for an existing quiz
router.post('/quiz/:id/answers-image', requirePassphrase, requireAdmin, upload.single('answerImage'), (req, res) => {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);
  if (!quiz) {
    return res.status(404).json({ error: 'Quiz not found' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'Answer image required' });
  }

  const quizDir = path.join(uploadDir, String(quiz.id));
  fs.mkdirSync(quizDir, { recursive: true });
  const filename = `answers${path.extname(req.file.originalname).toLowerCase() || '.jpg'}`;
  fs.renameSync(req.file.path, path.join(quizDir, filename));

  db.prepare('UPDATE quizzes SET answer_image = ? WHERE id = ?').run(filename, quiz.id);

  res.json({ ok: true });
});

// Lock/archive a quiz
router.post('/quiz/:id/lock', requirePassphrase, requireAdmin, (req, res) => {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);
  if (!quiz) {
    return res.status(404).json({ error: 'Quiz not found' });
  }

  // Calculate score from consensus markings
  const marked = db.prepare(
    'SELECT COUNT(*) as total, SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct FROM consensus WHERE quiz_id = ? AND is_correct IS NOT NULL'
  ).get(quiz.id);

  const score = marked.correct || 0;
  db.prepare('UPDATE quizzes SET locked = 1, score = ? WHERE id = ?').run(score, quiz.id);

  res.json({ ok: true, score });
});

// Unlock a quiz (in case of mistakes)
router.post('/quiz/:id/unlock', requirePassphrase, requireAdmin, (req, res) => {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);
  if (!quiz) {
    return res.status(404).json({ error: 'Quiz not found' });
  }

  db.prepare('UPDATE quizzes SET locked = 0 WHERE id = ?').run(quiz.id);
  res.json({ ok: true });
});

// Delete a quiz and everything attached to it. Schema has FK references
// without ON DELETE CASCADE, so child rows are removed in order inside a
// transaction. Upload directory is wiped after the txn commits.
router.delete('/quiz/:id', requirePassphrase, requireAdmin, (req, res) => {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);
  if (!quiz) {
    return res.status(404).json({ error: 'Quiz not found' });
  }

  const txn = db.transaction(() => {
    db.prepare(
      'DELETE FROM votes WHERE answer_id IN (SELECT id FROM answers WHERE quiz_id = ?)'
    ).run(quiz.id);
    db.prepare('DELETE FROM answers WHERE quiz_id = ?').run(quiz.id);
    db.prepare('DELETE FROM consensus WHERE quiz_id = ?').run(quiz.id);
    db.prepare('DELETE FROM quizzes WHERE id = ?').run(quiz.id);
  });
  txn();

  const quizDir = path.join(uploadDir, String(quiz.id));
  fs.rmSync(quizDir, { recursive: true, force: true });

  res.json({ ok: true });
});

module.exports = router;
