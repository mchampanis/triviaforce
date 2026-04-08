const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { parseCookies, requirePassphrase, resolveUser, safeEqual } = require('../middleware/identity');

const router = express.Router();

// Add `Secure` to cookies in production so they only travel over HTTPS.
// Local dev runs over plain http://localhost, so it's omitted there.
const COOKIE_SUFFIX = process.env.NODE_ENV === 'production' ? '; Secure' : '';

// Verify passphrase and set cookie
router.post('/passphrase', (req, res) => {
  const { passphrase } = req.body;
  const expected = process.env.PASSPHRASE;
  if (!expected) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }
  if (typeof passphrase !== 'string' || !safeEqual(passphrase, expected)) {
    return res.status(401).json({ error: 'Wrong passphrase' });
  }
  // Set passphrase cookie (long-lived, httpOnly)
  res.setHeader('Set-Cookie', `tf_passphrase=${encodeURIComponent(expected)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${COOKIE_SUFFIX}`);
  res.json({ ok: true });
});

// Identify user (set display name). Requires passphrase.
router.post('/identify', requirePassphrase, resolveUser, (req, res) => {
  const { displayName, fingerprint } = req.body;
  if (!displayName || !displayName.trim()) {
    return res.status(400).json({ error: 'Display name required' });
  }

  const cookies = parseCookies(req.headers.cookie);
  const existingToken = cookies.tf_token;

  // Check if user already exists by token
  if (req.user) {
    // Update display name if changed
    if (req.user.display_name !== displayName.trim()) {
      db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(displayName.trim(), req.user.id);
    }
    return res.json({ userId: req.user.id, displayName: displayName.trim() });
  }

  // Check if user exists by fingerprint
  if (fingerprint) {
    const existing = db.prepare('SELECT id, display_name, cookie_token FROM users WHERE fingerprint = ?').get(fingerprint);
    if (existing) {
      // Re-set their cookie
      res.setHeader('Set-Cookie', `tf_token=${existing.cookie_token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${COOKIE_SUFFIX}`);
      if (existing.display_name !== displayName.trim()) {
        db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(displayName.trim(), existing.id);
      }
      return res.json({ userId: existing.id, displayName: displayName.trim() });
    }
  }

  // Create new user
  const token = uuidv4();
  const result = db.prepare(
    'INSERT INTO users (display_name, fingerprint, cookie_token) VALUES (?, ?, ?)'
  ).run(displayName.trim(), fingerprint || null, token);

  res.setHeader('Set-Cookie', `tf_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${COOKIE_SUFFIX}`);
  res.json({ userId: result.lastInsertRowid, displayName: displayName.trim() });
});

// Check current auth status
router.get('/me', requirePassphrase, resolveUser, (req, res) => {
  if (req.user) {
    return res.json({ identified: true, userId: req.user.id, displayName: req.user.display_name });
  }
  res.json({ identified: false });
});

module.exports = router;
