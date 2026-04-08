const crypto = require('crypto');
const db = require('../db');

// Constant-time string comparison; safe for length-mismatched inputs.
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// Opaque token derived from PASSPHRASE via HMAC. Stored in the auth cookie
// instead of the raw passphrase, so cookie disclosure does not reveal it.
// Stateless: every process computes the same value, no DB needed. Rotating
// PASSPHRASE invalidates all existing sessions automatically.
function passphraseToken() {
  const secret = process.env.PASSPHRASE || '';
  return crypto.createHmac('sha256', secret).update('tf_passphrase_v1').digest('hex');
}

// Parse cookies from header (no dependency needed for this simple case)
function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach(pair => {
    const [name, ...rest] = pair.trim().split('=');
    cookies[name] = decodeURIComponent(rest.join('='));
  });
  return cookies;
}

// Middleware: require valid passphrase cookie
function requirePassphrase(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  if (!process.env.PASSPHRASE) {
    return res.status(500).json({ error: 'Server misconfigured: no passphrase set' });
  }
  if (!safeEqual(cookies.tf_passphrase, passphraseToken())) {
    return res.status(401).json({ error: 'Invalid or missing passphrase' });
  }
  next();
}

// Middleware: resolve user from cookie token, attach to req.user
function resolveUser(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.tf_token;
  if (token) {
    const user = db.prepare('SELECT id, display_name FROM users WHERE cookie_token = ?').get(token);
    if (user) {
      req.user = user;
    }
  }
  next();
}

// Middleware: require identified user
function requireUser(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not identified. Please set your display name.' });
  }
  next();
}

// Middleware: require admin password
function requireAdmin(req, res, next) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return res.status(500).json({ error: 'Server misconfigured: no admin password set' });
  }
  const provided = req.headers['x-admin-key'];
  if (typeof provided !== 'string' || !safeEqual(provided, adminPassword)) {
    return res.status(403).json({ error: 'Invalid admin password' });
  }
  next();
}

module.exports = { parseCookies, requirePassphrase, resolveUser, requireUser, requireAdmin, safeEqual, passphraseToken };
