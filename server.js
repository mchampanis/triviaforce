const express = require('express');
const path = require('path');
const fs = require('fs');

// Load .env file if present (no dependency needed)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) return;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes (single or double)
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      // Strip inline comments (only when value is unquoted)
      const hashIdx = value.indexOf(' #');
      if (hashIdx !== -1) value = value.slice(0, hashIdx).trimEnd();
    }
    if (key) {
      process.env[key] = value;
    }
  });
}

const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure upload directory exists
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/quiz', require('./routes/quiz'));
app.use('/api/quizzes', require('./routes/quiz').listRouter);
app.use('/api/answers', require('./routes/answers'));
app.use('/api/votes', require('./routes/votes'));
app.use('/api/consensus', require('./routes/consensus'));

// SPA-style fallback: serve index.html for non-API, non-static routes
app.get('/archive', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'archive.html'));
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`TriviaForce running on http://localhost:${PORT}`);
});
