const db = require('../db');

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
  const passphrase = process.env.PASSPHRASE;
  if (!passphrase) {
    return res.status(500).json({ error: 'Server misconfigured: no passphrase set' });
  }
  if (cookies.tf_passphrase !== passphrase) {
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
  if (provided !== adminPassword) {
    return res.status(403).json({ error: 'Invalid admin password' });
  }
  next();
}

module.exports = { parseCookies, requirePassphrase, resolveUser, requireUser, requireAdmin };
