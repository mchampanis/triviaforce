const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'data', 'triviaforce.db');
// Make sure the parent directory exists (works for both the default ./data
// and a mounted volume like /data when running in a container).
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    display_name TEXT NOT NULL,
    fingerprint TEXT,
    cookie_token TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_users_cookie ON users(cookie_token);
  CREATE INDEX IF NOT EXISTS idx_users_fingerprint ON users(fingerprint);

  CREATE TABLE IF NOT EXISTS quizzes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    question_image TEXT,
    answer_image TEXT,
    locked INTEGER NOT NULL DEFAULT 0,
    score INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER NOT NULL REFERENCES quizzes(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    question_number INTEGER NOT NULL CHECK (question_number >= 1 AND question_number <= 20),
    text TEXT NOT NULL,
    confidence TEXT NOT NULL CHECK (confidence IN ('guess', 'maybe', 'certain')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(quiz_id, user_id, question_number)
  );

  CREATE INDEX IF NOT EXISTS idx_answers_quiz ON answers(quiz_id);

  CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    answer_id INTEGER NOT NULL REFERENCES answers(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    direction INTEGER NOT NULL CHECK (direction IN (-1, 1)),
    UNIQUE(answer_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_votes_answer ON votes(answer_id);

  CREATE TABLE IF NOT EXISTS consensus (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER NOT NULL REFERENCES quizzes(id),
    question_number INTEGER NOT NULL CHECK (question_number >= 1 AND question_number <= 20),
    answer_text TEXT NOT NULL,
    is_correct INTEGER CHECK (is_correct IN (0, 1)),
    set_by_user_id INTEGER REFERENCES users(id),
    UNIQUE(quiz_id, question_number)
  );

  CREATE INDEX IF NOT EXISTS idx_consensus_quiz ON consensus(quiz_id);
`);

module.exports = db;
