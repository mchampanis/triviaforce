// Shared utilities for TriviaForce

// Fetch wrapper that handles JSON and errors
async function apiFetch(path, options = {}) {
  const isFormData = options.body instanceof FormData;

  // Merge headers: start with defaults, layer on caller's headers
  const headers = {};
  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }
  Object.assign(headers, options.headers);

  const fetchOptions = {
    credentials: 'same-origin',
    ...options,
    headers
  };

  const res = await fetch(path, fetchOptions);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `Request failed: ${res.status}`);
  }

  return data;
}

// Lightweight browser fingerprint (no external library)
function getFingerprint() {
  const parts = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency || 'unknown'
  ];

  // Canvas fingerprint
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('TriviaForce fingerprint', 2, 2);
    parts.push(canvas.toDataURL());
  } catch (e) {
    parts.push('no-canvas');
  }

  // Simple hash (djb2)
  const str = parts.join('|');
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

// HTML-escape a string for safe insertion (including attribute contexts)
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Show a toast notification
function showToast(message, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// Theme toggle (persisted in localStorage)
function initTheme() {
  const saved = localStorage.getItem('tf_theme');
  if (saved === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
  const btn = document.getElementById('themeToggle');
  if (btn) {
    updateThemeButton(btn);
    btn.addEventListener('click', () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('tf_theme', 'light');
      } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('tf_theme', 'dark');
      }
      updateThemeButton(btn);
    });
  }
}

function updateThemeButton(btn) {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  btn.textContent = isDark ? 'Light Theme' : 'Dark Theme';
}

document.addEventListener('DOMContentLoaded', initTheme);

// Check if user is authenticated (has passphrase cookie)
// Returns { identified, userId, displayName } on success,
// { identified: false, needsPassphrase: false } if passphrase ok but no identity,
// { identified: false, needsPassphrase: true } if passphrase missing/wrong.
async function checkAuth() {
  try {
    const data = await apiFetch('/api/auth/me');
    return { ...data, needsPassphrase: false };
  } catch (e) {
    return { identified: false, needsPassphrase: true };
  }
}
