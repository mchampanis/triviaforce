const express = require('express');
const db = require('../db');
const { requirePassphrase, resolveUser, requireUser } = require('../middleware/identity');

const router = express.Router();

// Get consensus for a quiz (with auto-population)
router.get('/quiz/:id', requirePassphrase, (req, res) => {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);
  if (!quiz) {
    return res.status(404).json({ error: 'Quiz not found' });
  }

  // Get existing consensus entries
  const existing = db.prepare(
    'SELECT * FROM consensus WHERE quiz_id = ? ORDER BY question_number'
  ).all(req.params.id);

  const consensusMap = {};
  existing.forEach(c => { consensusMap[c.question_number] = c; });

  // Auto-populate missing consensus from best answers
  // Ranking: confidence tier (certain > maybe > guess), then vote score
  // If there's a tie on both, don't pick -- leave it empty for the group to decide
  const bestAnswers = db.prepare(`
    SELECT
      a.question_number,
      a.text,
      COALESCE(SUM(v.direction), 0) as vote_score,
      CASE a.confidence
        WHEN 'certain' THEN 3
        WHEN 'maybe' THEN 2
        WHEN 'guess' THEN 1
      END as confidence_rank
    FROM answers a
    LEFT JOIN votes v ON v.answer_id = a.id
    WHERE a.quiz_id = ?
    GROUP BY a.id
    ORDER BY a.question_number, confidence_rank DESC, vote_score DESC, a.id ASC
  `).all(req.params.id);

  // Pick top answer per question only if there's a clear winner
  const autoConsensus = {};
  const grouped = {};
  bestAnswers.forEach(a => {
    if (!grouped[a.question_number]) grouped[a.question_number] = [];
    grouped[a.question_number].push(a);
  });
  function normalize(text) {
    return text.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
  }

  // Levenshtein distance for fuzzy matching
  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[m][n];
  }

  function isSimilar(a, b) {
    const na = normalize(a);
    const nb = normalize(b);
    if (na === nb) return true;
    const maxLen = Math.max(na.length, nb.length);
    if (maxLen === 0) return true;
    // For very short strings, Levenshtein is too coarse -- a single edit
    // represents too large a fraction. Require exact match instead.
    if (maxLen < 4) return false;
    const dist = levenshtein(na, nb);
    const similarity = 1 - dist / maxLen;
    return similarity >= 0.8;
  }

  for (const [qn, answers] of Object.entries(grouped)) {
    if (answers.length === 1) {
      autoConsensus[qn] = answers[0].text;
    } else if (answers.length > 1) {
      const top = answers[0];
      const second = answers[1];
      // If top answers are similar (fuzzy match), pick the first
      if (isSimilar(top.text, second.text)) {
        autoConsensus[qn] = top.text;
      // Otherwise, only auto-fill if there's a clear winner
      } else if (top.confidence_rank > second.confidence_rank || top.vote_score > second.vote_score) {
        autoConsensus[qn] = top.text;
      }
    }
  }

  // Build result: prefer manual consensus, fall back to auto
  const result = {};
  for (let i = 1; i <= 20; i++) {
    if (consensusMap[i]) {
      result[i] = {
        answerText: consensusMap[i].answer_text,
        isCorrect: consensusMap[i].is_correct,
        isManual: true
      };
    } else if (autoConsensus[i]) {
      result[i] = {
        answerText: autoConsensus[i],
        isCorrect: null,
        isManual: false
      };
    } else {
      result[i] = {
        answerText: '',
        isCorrect: null,
        isManual: false
      };
    }
  }

  res.json({ consensus: result });
});

// Set/override consensus answer for a question
router.put('/quiz/:id/:questionNumber', requirePassphrase, resolveUser, requireUser, (req, res) => {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);
  if (!quiz) {
    return res.status(404).json({ error: 'Quiz not found' });
  }
  if (quiz.locked) {
    return res.status(400).json({ error: 'Quiz is locked' });
  }

  const qn = parseInt(req.params.questionNumber, 10);
  if (!Number.isInteger(qn) || qn < 1 || qn > 20) {
    return res.status(400).json({ error: 'Invalid question number' });
  }

  const { answerText } = req.body;

  // Empty text = remove manual consensus override
  if (!answerText || !answerText.trim()) {
    db.prepare(
      'DELETE FROM consensus WHERE quiz_id = ? AND question_number = ?'
    ).run(req.params.id, qn);
    return res.json({ ok: true, deleted: true });
  }

  db.prepare(`
    INSERT INTO consensus (quiz_id, question_number, answer_text, set_by_user_id)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(quiz_id, question_number)
    DO UPDATE SET answer_text = excluded.answer_text, set_by_user_id = excluded.set_by_user_id, is_correct = NULL
  `).run(req.params.id, qn, answerText.trim(), req.user.id);

  res.json({ ok: true });
});

// Mark a consensus answer as correct or incorrect
router.put('/quiz/:id/:questionNumber/mark', requirePassphrase, resolveUser, requireUser, (req, res) => {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);
  if (!quiz) {
    return res.status(404).json({ error: 'Quiz not found' });
  }

  const qn = parseInt(req.params.questionNumber, 10);
  if (!Number.isInteger(qn) || qn < 1 || qn > 20) {
    return res.status(400).json({ error: 'Invalid question number' });
  }

  const { isCorrect } = req.body;
  if (isCorrect !== true && isCorrect !== false && isCorrect !== null) {
    return res.status(400).json({ error: 'isCorrect must be true, false, or null' });
  }

  // Ensure consensus row exists first
  const existing = db.prepare(
    'SELECT * FROM consensus WHERE quiz_id = ? AND question_number = ?'
  ).get(req.params.id, qn);

  if (!existing) {
    return res.status(400).json({ error: 'No consensus answer set for this question' });
  }

  db.prepare(
    'UPDATE consensus SET is_correct = ? WHERE quiz_id = ? AND question_number = ?'
  ).run(isCorrect === null ? null : (isCorrect ? 1 : 0), req.params.id, qn);

  res.json({ ok: true });
});

module.exports = router;
