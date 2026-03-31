const express = require('express');
const db = require('../db');
const { requirePassphrase, resolveUser, requireUser } = require('../middleware/identity');

const router = express.Router();

// Vote on an answer (toggle: same direction again removes the vote)
router.post('/:answerId', requirePassphrase, resolveUser, requireUser, (req, res) => {
  const answer = db.prepare(`
    SELECT a.*, q.locked FROM answers a JOIN quizzes q ON a.quiz_id = q.id WHERE a.id = ?
  `).get(req.params.answerId);

  if (!answer) {
    return res.status(404).json({ error: 'Answer not found' });
  }
  if (answer.locked) {
    return res.status(400).json({ error: 'Quiz is locked' });
  }
  if (answer.user_id === req.user.id) {
    return res.status(400).json({ error: 'Cannot vote on your own answer' });
  }

  const { direction } = req.body;
  if (direction !== 1 && direction !== -1) {
    return res.status(400).json({ error: 'Direction must be 1 or -1' });
  }

  const existing = db.prepare(
    'SELECT * FROM votes WHERE answer_id = ? AND user_id = ?'
  ).get(req.params.answerId, req.user.id);

  if (existing && existing.direction === direction) {
    // Toggle off
    db.prepare('DELETE FROM votes WHERE id = ?').run(existing.id);
    return res.json({ vote: 0 });
  }

  // Upsert
  db.prepare(`
    INSERT INTO votes (answer_id, user_id, direction)
    VALUES (?, ?, ?)
    ON CONFLICT(answer_id, user_id)
    DO UPDATE SET direction = excluded.direction
  `).run(req.params.answerId, req.user.id, direction);

  res.json({ vote: direction });
});

module.exports = router;
