import fs from 'node:fs';
import path from 'node:path';
import { config, ROOT } from './config.js';

export class HttpError extends Error {
  constructor(status, message, errors) { super(message); this.status = status; this.errors = errors || null; }
}
export const bad = (msg, errors) => new HttpError(400, msg, errors);
export const forbidden = (msg) => new HttpError(403, msg || 'Ruxsat yo‘q');
export const notFound = (msg) => new HttpError(404, msg || 'Topilmadi');
export const conflict = (msg) => new HttpError(409, msg);

/* ---------- router ---------- */
export function createRouter(prefix) {
  const routes = [];
  const add = (method, pattern, ...args) => {
    const handler = args.find((a) => typeof a === 'function');
    const opts = Object.assign({}, ...args.filter((a) => a && typeof a === 'object'));
    const keys = [];
    const re = new RegExp('^' + prefix + pattern.replace(/\/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$');
    routes.push({ method, re, keys, opts, handler });
  };
  return {
    get: (p, ...a) => add('GET', p, ...a),
    post: (p, ...a) => add('POST', p, ...a),
    put: (p, ...a) => add('PUT', p, ...a),
    patch: (p, ...a) => add('PATCH', p, ...a),
    delete: (p, ...a) => add('DELETE', p, ...a),
    match(method, pathname) {
      let pathMatched = false;
      for (const r of routes) {
        const m = r.re.exec(pathname);
        if (!m) continue;
        pathMatched = true;
        if (r.method !== method) continue;
        const params = {};
        r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        return { route: r, params };
      }
      return pathMatched ? { methodNotAllowed: true } : null;
    }
  };
}

/* ---------- request helpers ---------- */
export function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'So‘rov hajmi juda katta')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
export function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((p) => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
export function clientIp(req) {
  // Behind our proxy the LAST entry is the one the proxy appended; earlier entries are client-supplied and spoofable.
  if (config.trustProxy) { const xf = req.headers['x-forwarded-for']; if (xf) { const parts = String(xf).split(',').map((x) => x.trim()).filter(Boolean); if (parts.length) return parts[parts.length - 1]; } }
  return req.socket.remoteAddress || '';
}

/* ---------- security headers ---------- */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'"
].join('; ');
export function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Camera: prescription QR scanner. Geolocation: nearby pharmacies and clinics.
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(self), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', CSP);
  if (config.isProd && config.publicUrl.startsWith('https://')) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

export function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}
export function sendError(res, status, message, errors) {
  sendJson(res, status, { timestamp: new Date().toISOString(), status, message, errors: errors || null });
}

/* ---------- rate limiting (in-memory sliding window) ---------- */
const buckets = new Map();
export function rateLimit(key, max, windowMs) {
  const t = Date.now();
  const arr = (buckets.get(key) || []).filter((x) => t - x < windowMs);
  if (arr.length >= max) { buckets.set(key, arr); return false; }
  arr.push(t); buckets.set(key, arr);
  return true;
}
setInterval(() => {
  const t = Date.now();
  for (const [k, arr] of buckets) { const keep = arr.filter((x) => t - x < 3600000); if (keep.length) buckets.set(k, keep); else buckets.delete(k); }
}, 600000).unref();

/* ---------- static files ---------- */
const PUBLIC_DIR = path.join(ROOT, 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2'
};
export function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return false; }
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return false;
  let st;
  try { st = fs.statSync(file); } catch { return false; }
  if (!st.isFile()) return false;
  const ext = path.extname(file).toLowerCase();
  if (rel === '/index.html') { sendIndex(req, res); return true; }
  const noCache = !config.isProd || ext === '.html' || rel === '/sw.js' || ext === '.webmanifest';
  const etag = 'W/"' + st.size.toString(16) + '-' + Math.floor(st.mtimeMs).toString(16) + '"';
  const headers = {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Cache-Control': noCache ? 'no-cache' : 'public, max-age=3600',
    ETag: etag
  };
  if (rel === '/sw.js') headers['Service-Worker-Allowed'] = '/';
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); res.end(); return true; }
  headers['Content-Length'] = st.size;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') { res.end(); return true; }
  fs.createReadStream(file).pipe(res);
  return true;
}

/* ---------- SEO: index with the real domain, robots.txt, sitemap.xml ---------- */
const attr = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let indexCache = null;
export function sendIndex(req, res, status = 200) {
  if (!indexCache || !config.isProd) {
    const verify = config.googleVerification ? '<meta name="google-site-verification" content="' + attr(config.googleVerification) + '">' : '';
    indexCache = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8').replace(/%PUBLIC_URL%/g, attr(config.publicUrl)).replace('%GOOGLE_VERIFY%', verify);
  }
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'Content-Length': Buffer.byteLength(indexCache) });
  res.end(req.method === 'HEAD' ? undefined : indexCache);
}
/** Serves /robots.txt and /sitemap.xml built from PUBLIC_URL. Returns true if handled. */
export function serveSeo(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  let body, type;
  if (pathname === '/robots.txt') {
    type = 'text/plain; charset=utf-8';
    body = 'User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ' + config.publicUrl + '/sitemap.xml\n';
  } else if (pathname === '/sitemap.xml') {
    type = 'application/xml; charset=utf-8';
    body = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>' + attr(config.publicUrl) + '/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n</urlset>\n';
  } else return false;
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=3600', 'Content-Length': Buffer.byteLength(body) });
  res.end(req.method === 'HEAD' ? undefined : body);
  return true;
}

/* ---------- validation helpers ---------- */
export const str = (v, { max = 500, min = 0, field = 'Maydon', required = false } = {}) => {
  const s = v == null ? '' : String(v).trim();
  if (required && !s) throw bad(field + ' majburiy');
  if (s.length < min) throw bad(field + ' kamida ' + min + ' belgi bo‘lishi kerak');
  if (s.length > max) throw bad(field + ' ' + max + ' belgidan oshmasin');
  return s;
};
export const intIn = (v, lo, hi, field) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < lo || n > hi) throw bad(field + ' ' + lo + '–' + hi + ' oralig‘ida butun son bo‘lishi kerak');
  return n;
};
export function normPhone(v) {
  const d = String(v || '').replace(/\D/g, '');
  const full = d.length === 9 ? '998' + d : d;
  if (!/^998\d{9}$/.test(full)) throw bad('Telefon raqam noto‘g‘ri. Namuna: +998 90 123 45 67');
  return full;
}
export function validPassword(p) {
  const s = String(p || '');
  if (s.length < 8 || s.length > 128) throw bad('Parol 8–128 belgidan iborat bo‘lishi kerak');
  if (!/[A-Za-z]/.test(s) || !/\d/.test(s)) throw bad('Parolda kamida bitta harf va bitta raqam bo‘lsin');
  return s;
}
