const express = require('express');
const db = require('../db');
const { requirePassphrase } = require('../middleware/identity');

const router = express.Router();
const listRouter = express.Router();

// Get the current (latest unlocked) quiz
router.get('/current', requirePassphrase, (req, res) => {
  const quiz = db.prepare(
    'SELECT * FROM quizzes WHERE locked = 0 ORDER BY created_at DESC LIMIT 1'
  ).get();

  if (!quiz) {
    return res.json({ quiz: null });
  }

  const participants = db.prepare(`
    SELECT DISTINCT u.id, u.display_name
    FROM answers a JOIN users u ON a.user_id = u.id
    WHERE a.quiz_id = ?
  `).all(quiz.id);

  res.json({ quiz: { ...quiz, participants } });
});

// Get a specific quiz
router.get('/:id', requirePassphrase, (req, res) => {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);
  if (!quiz) {
    return res.status(404).json({ error: 'Quiz not found' });
  }

  const participants = db.prepare(`
    SELECT DISTINCT u.id, u.display_name
    FROM answers a JOIN users u ON a.user_id = u.id
    WHERE a.quiz_id = ?
  `).all(quiz.id);

  res.json({ quiz: { ...quiz, participants } });
});

// List all quizzes (for archive)
listRouter.get('/', requirePassphrase, (req, res) => {
  const quizzes = db.prepare(
    'SELECT * FROM quizzes ORDER BY created_at DESC'
  ).all();

  // Attach participant counts
  const stmt = db.prepare(`
    SELECT COUNT(DISTINCT user_id) as count FROM answers WHERE quiz_id = ?
  `);

  const result = quizzes.map(q => ({
    ...q,
    participantCount: stmt.get(q.id).count
  }));

  res.json({ quizzes: result });
});

module.exports = router;
module.exports.listRouter = listRouter;
