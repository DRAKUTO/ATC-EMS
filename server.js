// ============================================================
// ATLANTIC EMS — Local development static server
// Runs the site on http://localhost:3000 so it matches the
// Supabase Authentication -> URL Configuration -> Site URL.
//
// Usage:
//   npm start
//   node server.js
//
// It serves the static files (index.html, script.js, style.css,
// supabase.js, assets/, node_modules/@supabase/...) and handles
// the OAuth callback fragment (everything after "#") without
// touching the access token (fragments are never sent to a
// server — they stay in the browser and are read by supabase-js).
//
// SECURITY:
//   - GET/HEAD only (405 otherwise).
//   - Malformed percent-encoding -> 400, never a crash.
//   - Path traversal (../ and encoded variants) -> 403.
//   - Sensitive files (.env*, *.sql, *.db, dotfiles, etc.) -> 404.
//   - Security headers on every response (CSP, nosniff, etc.).
// ============================================================

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8'
};

const SUPABASE_ORIGIN = 'https://tumrzwermkicjuvzlisi.supabase.co';

// Content-Security-Policy tuned to the actual resources the site uses:
//   - scripts/CSS are self-hosted; inline onclick handlers exist, so
//     'unsafe-inline' is required for scripts and styles.
//   - images come from self, data: (SVG fallback), placehold.co
//     (pharmacy catalog), images.unsplash.com (testimonials) and the
//     Supabase storage origin (signed URLs).
//   - PDF previews are iframed from the Supabase storage origin.
//   - connections go to self + the Supabase API/storage origins.
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=(), usb=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://images.unsplash.com https://placehold.co " + SUPABASE_ORIGIN,
    "connect-src 'self' " + SUPABASE_ORIGIN + ' wss://' + 'tumrzwermkicjuvzlisi.supabase.co',
    "font-src 'self' data:",
    "frame-src " + SUPABASE_ORIGIN,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; ')
};

function contentType(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

// Files that must never be served by the web server.
const BLOCKED_EXT = new Set(['.sql', '.db', '.sqlite', '.sqlite3', '.log', '.pem', '.key', '.crt', '.env', '.yml', '.yaml']);
const BLOCKED_SEGMENTS = ['.git', '.svn', '.hg', '.env'];

function isBlocked(filePath) {
  const lower = filePath.toLowerCase();
  const segments = filePath.split(path.sep);
  for (const seg of segments) {
    const s = seg.toLowerCase();
    if (BLOCKED_SEGMENTS.indexOf(s) !== -1) return true;
    if (s.indexOf('.env') !== -1) return true;
    if (s !== '.' && s.charAt(0) === '.' && s.indexOf('.') === s.lastIndexOf('.') && s.length > 1) return true;
  }
  const ext = path.extname(lower);
  if (BLOCKED_EXT.has(ext)) return true;
  return false;
}

// Resolve a request path against the web root and verify it stays inside.
// Returns null when the path escapes the root or is blocked.
function safeResolve(urlPath) {
  const candidate = path.normalize(path.join(ROOT, urlPath));
  if (!candidate.startsWith(ROOT)) return null;
  if (isBlocked(candidate)) return null;
  return candidate;
}

function send(res, status, headers, body) {
  const all = Object.assign({}, SECURITY_HEADERS, headers);
  res.writeHead(status, all);
  res.end(body);
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) { send(res, 404, {}, 'Not Found'); return; }
    send(res, 200, { 'Content-Type': contentType(filePath) }, data);
  });
}

function sendHtml(res, htmlPath) {
  fs.readFile(htmlPath, (err, data) => {
    if (err) { send(res, 404, {}, 'Not Found'); return; }
    // no-cache for HTML so the browser always fetches the latest pages.
    send(res, 200, {
      'Content-Type': MIME['.html'],
      'Cache-Control': 'no-cache, must-revalidate'
    }, data);
  });
}

const server = http.createServer((req, res) => {
  // Only GET/HEAD are meaningful for a static server.
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, { 'Allow': 'GET, HEAD' }, 'Method Not Allowed');
    return;
  }

  // Only handle the request path — any "#access_token=..." fragment
  // is never included in req.url by the browser, so tokens are never
  // exposed to the server or logged.
  let urlPath;
  try {
    urlPath = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
  } catch (e) {
    // Malformed percent-encoding (e.g. /%zz): never crash the server.
    send(res, 400, {}, 'Bad Request');
    return;
  }
  if (urlPath === '/') urlPath = '/index.html';

  const hasExtension = path.extname(urlPath) !== '';

  if (hasExtension) {
    const filePath = safeResolve(urlPath);
    if (!filePath) {
      send(res, 403, {}, 'Forbidden');
      return;
    }
    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        send(res, 404, {}, 'Not Found');
        return;
      }
      sendFile(res, filePath);
    });
    return;
  }

  // Extensionless path -> try <path>.html first, then index.html (SPA-style).
  const htmlCandidate = safeResolve(urlPath + '.html');
  if (!htmlCandidate) {
    send(res, 403, {}, 'Forbidden');
    return;
  }
  fs.stat(htmlCandidate, (err, stats) => {
    if (!err && stats.isFile()) {
      sendHtml(res, htmlCandidate);
      return;
    }
    const fallback = safeResolve('/index.html');
    if (!fallback) {
      send(res, 403, {}, 'Forbidden');
      return;
    }
    sendHtml(res, fallback);
  });
});

server.listen(PORT, () => {
  console.log(`ATLANTIC EMS running at http://localhost:${PORT}`);
  console.log(`Site URL matches Supabase configuration: http://localhost:${PORT}`);
});
