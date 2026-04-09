const express = require('express');
const db = require('../db');
const { requirePassphrase, resolveUser, requireUser } = require('../middleware/identity');

const router = express.Router();

// Get all answers for a quiz, grouped by question number
router.get('/quiz/:id', requirePassphrase, resolveUser, (req, res) => {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);
  if (!quiz) {
    return res.status(404).json({ error: 'Quiz not found' });
  }

  const answers = db.prepare(`
    SELECT
      a.id, a.question_number, a.text, a.confidence, a.user_id, a.updated_at,
      u.display_name,
      COALESCE(SUM(v.direction), 0) as vote_score
    FROM answers a
    JOIN users u ON a.user_id = u.id
    LEFT JOIN votes v ON v.answer_id = a.id
    WHERE a.quiz_id = ?
    GROUP BY a.id
    ORDER BY a.question_number, a.updated_at, a.id
  `).all(req.params.id);

  // Get current user's votes so we can show their vote state
  let userVotes = {};
  if (req.user) {
    const votes = db.prepare(`
      SELECT v.answer_id, v.direction
      FROM votes v
      JOIN answers a ON v.answer_id = a.id
      WHERE a.quiz_id = ? AND v.user_id = ?
    `).all(req.params.id, req.user.id);
    votes.forEach(v => { userVotes[v.answer_id] = v.direction; });
  }

  // Group by question number
  const grouped = {};
  for (let i = 1; i <= 20; i++) {
    grouped[i] = [];
  }
  answers.forEach(a => {
    grouped[a.question_number].push({
      ...a,
      userVote: userVotes[a.id] || 0
    });
  });

  res.json({ answers: grouped });
});

// Submit/update an answer
router.post('/quiz/:id', requirePassphrase, resolveUser, requireUser, (req, res) => {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);
  if (!quiz) {
    return res.status(404).json({ error: 'Quiz not found' });
  }
  if (quiz.locked) {
    return res.status(400).json({ error: 'Quiz is locked' });
  }

  const { questionNumber, text, confidence } = req.body;
  if (!Number.isInteger(questionNumber) || questionNumber < 1 || questionNumber > 20) {
    return res.status(400).json({ error: 'Invalid question number' });
  }
  // Empty text = delete the answer and its votes
  if (!text || !text.trim()) {
    const existing = db.prepare(
      'SELECT id FROM answers WHERE quiz_id = ? AND user_id = ? AND question_number = ?'
    ).get(req.params.id, req.user.id, questionNumber);
    if (existing) {
      db.prepare('DELETE FROM votes WHERE answer_id = ?').run(existing.id);
      db.prepare('DELETE FROM answers WHERE id = ?').run(existing.id);
    }
    return res.json({ ok: true, deleted: true });
  }

  if (!['guess', 'maybe', 'certain'].includes(confidence)) {
    return res.status(400).json({ error: 'Confidence must be guess, maybe, or certain' });
  }

  db.prepare(`
    INSERT INTO answers (quiz_id, user_id, question_number, text, confidence, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(quiz_id, user_id, question_number)
    DO UPDATE SET text = excluded.text, confidence = excluded.confidence, updated_at = datetime('now')
  `).run(req.params.id, req.user.id, questionNumber, text.trim(), confidence);

  res.json({ ok: true });
});

module.exports = router;
