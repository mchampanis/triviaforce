// Checks /api/health on the deployed app.
// URL is read from DEPLOY_URL in .env so it does not leak into source control.

const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) return;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      const hashIdx = value.indexOf(' #');
      if (hashIdx !== -1) value = value.slice(0, hashIdx).trimEnd();
    }
    if (key && !(key in process.env)) process.env[key] = value;
  });
}

const url = process.env.DEPLOY_URL;
if (!url) {
  console.error('DEPLOY_URL is not set. Add it to .env (e.g. DEPLOY_URL=https://example.com).');
  process.exit(1);
}

fetch(url.replace(/\/$/, '') + '/api/health')
  .then(r => r.json())
  .then(d => console.log(JSON.stringify(d, null, 2)))
  .catch(err => {
    console.error('Health check failed:', err.message);
    process.exit(1);
  });
