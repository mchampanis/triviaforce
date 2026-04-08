const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requirePassphrase, resolveUser, safeEqual, passphraseToken } = require('../middleware/identity');

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
  // Set passphrase cookie to an HMAC-derived token, not the raw passphrase.
  // requirePassphrase recomputes the same token and compares constant-time.
  res.setHeader('Set-Cookie', `tf_passphrase=${passphraseToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${COOKIE_SUFFIX}`);
  res.json({ ok: true });
});

// Identify user (set display name). Requires passphrase.
router.post('/identify', requirePassphrase, resolveUser, (req, res) => {
  const { displayName, fingerprint, claim } = req.body;
  if (!displayName || !displayName.trim()) {
    return res.status(400).json({ error: 'Display name required' });
  }
  const name = displayName.trim();

  // Check if user already exists by token
  if (req.user) {
    // Update display name if changed
    if (req.user.display_name !== name) {
      db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(name, req.user.id);
    }
    return res.json({ userId: req.user.id, displayName: name });
  }

  // Check if user exists by fingerprint
  if (fingerprint) {
    const existing = db.prepare('SELECT id, display_name, cookie_token FROM users WHERE fingerprint = ?').get(fingerprint);
    if (existing) {
      // Re-set their cookie
      res.setHeader('Set-Cookie', `tf_token=${existing.cookie_token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${COOKIE_SUFFIX}`);
      if (existing.display_name !== name) {
        db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(name, existing.id);
      }
      return res.json({ userId: existing.id, displayName: name });
    }
  }

  // Check if a user with this display name already exists (case-insensitive).
  // This handles the "started on desktop, switched to phone" case where the
  // second device has no shared cookie or fingerprint with the first.
  const nameMatch = db.prepare(
    'SELECT id, display_name, cookie_token FROM users WHERE LOWER(display_name) = LOWER(?)'
  ).get(name);
  if (nameMatch) {
    if (!claim) {
      // Ask the frontend to confirm with the user before adopting the identity.
      return res.json({ needsClaim: true, displayName: nameMatch.display_name });
    }
    // User confirmed -- adopt the existing identity on this device.
    res.setHeader('Set-Cookie', `tf_token=${nameMatch.cookie_token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${COOKIE_SUFFIX}`);
    if (fingerprint) {
      db.prepare('UPDATE users SET fingerprint = ? WHERE id = ?').run(fingerprint, nameMatch.id);
    }
    return res.json({ userId: nameMatch.id, displayName: nameMatch.display_name });
  }

  // Create new user
  const token = crypto.randomUUID();
  const result = db.prepare(
    'INSERT INTO users (display_name, fingerprint, cookie_token) VALUES (?, ?, ?)'
  ).run(name, fingerprint || null, token);

  res.setHeader('Set-Cookie', `tf_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${COOKIE_SUFFIX}`);
  res.json({ userId: result.lastInsertRowid, displayName: name });
});

// Check current auth status
router.get('/me', requirePassphrase, resolveUser, (req, res) => {
  if (req.user) {
    return res.json({ identified: true, userId: req.user.id, displayName: req.user.display_name });
  }
  res.json({ identified: false });
});

module.exports = router;
