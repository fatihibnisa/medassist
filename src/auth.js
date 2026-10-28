import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { config } from './config.js';
import { one, all, run, insert, now } from './db.js';
import { HttpError } from './http.js';

const scrypt = promisify(crypto.scrypt);
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

/* ---------- passwords (scrypt) ---------- */
export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return 'scrypt$' + salt.toString('hex') + '$' + Buffer.from(key).toString('hex');
}
export async function verifyPassword(pw, stored) {
  const [alg, saltHex, keyHex] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !saltHex || !keyHex) return false;
  const key = await scrypt(String(pw), Buffer.from(saltHex, 'hex'), 64, { N: 16384, r: 8, p: 1 });
  const expected = Buffer.from(keyHex, 'hex');
  return expected.length === key.length && crypto.timingSafeEqual(expected, Buffer.from(key));
}

/* ---------- JWT (HS256) ---------- */
export function signJwt(payload, ttlSec) {
  const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const iat = Math.floor(Date.now() / 1000);
  const body = b64u(JSON.stringify({ ...payload, iat, exp: iat + ttlSec }));
  const sig = b64u(crypto.createHmac('sha256', config.jwtSecret).update(header + '.' + body).digest());
  return header + '.' + body + '.' + sig;
}
export function verifyJwt(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const expected = crypto.createHmac('sha256', config.jwtSecret).update(parts[0] + '.' + parts[1]).digest();
  const got = Buffer.from(parts[2], 'base64url');
  if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!p.exp || p.exp < Math.floor(Date.now() / 1000)) return null;
    return p;
  } catch { return null; }
}

/* ---------- sessions ---------- */
const COOKIE = 'ma_rt';
// Secure follows PUBLIC_URL: an http:// URL (IP-only test server) must still get the cookie.
const secureCookie = () => config.publicUrl.startsWith('https://');
function refreshCookie(token, maxAgeSec) {
  return COOKIE + '=' + encodeURIComponent(token) + '; HttpOnly; Path=/api/v1/auth; SameSite=Strict; Max-Age=' + maxAgeSec + (secureCookie() ? '; Secure' : '');
}
export function issueSession(ctx, user) {
  const access = signJwt({ sub: user.id, role: user.role }, config.accessTtlMin * 60);
  const raw = crypto.randomBytes(48).toString('base64url');
  const maxAge = config.refreshTtlDays * 86400;
  insert('INSERT INTO refresh_tokens (user_id, token_hash, expires_at, created_at, user_agent) VALUES (?,?,?,?,?)',
    user.id, sha256(raw), now() + maxAge * 1000, now(), String(ctx.req.headers['user-agent'] || '').slice(0, 200));
  ctx.res.setHeader('Set-Cookie', refreshCookie(raw, maxAge));
  return access;
}
export function rotateSession(ctx) {
  const raw = ctx.cookies[COOKIE];
  if (!raw) throw new HttpError(401, 'Sessiya topilmadi');
  const row = one('SELECT * FROM refresh_tokens WHERE token_hash = ?', sha256(raw));
  // Two tabs refreshing at the same moment both send the old cookie. A token rotated seconds ago is
  // refused, but neither the family is revoked nor the cookie cleared: the other tab's fresh cookie must survive.
  if (row && row.revoked && row.revoked_at && now() - row.revoked_at < 10000) throw new HttpError(401, 'Sessiya yangilandi, qayta urinib ko‘ring');
  if (!row || row.revoked || row.expires_at < now()) {
    if (row && row.revoked) run('UPDATE refresh_tokens SET revoked = 1, revoked_at = COALESCE(revoked_at, ?) WHERE user_id = ?', now(), row.user_id); // reuse detected: revoke all
    ctx.res.setHeader('Set-Cookie', refreshCookie('', 0));
    throw new HttpError(401, 'Sessiya muddati tugagan, qayta kiring');
  }
  const user = one('SELECT * FROM users WHERE id = ?', row.user_id);
  if (!user || !user.is_active) throw new HttpError(401, 'Akkaunt faol emas');
  run('UPDATE refresh_tokens SET revoked = 1, revoked_at = ? WHERE id = ?', now(), row.id);
  return { user, access: issueSession(ctx, user) };
}
export function endSession(ctx) {
  const raw = ctx.cookies[COOKIE];
  if (raw) run('UPDATE refresh_tokens SET revoked = 1, revoked_at = COALESCE(revoked_at, ?) WHERE token_hash = ?', now(), sha256(raw));
  ctx.res.setHeader('Set-Cookie', refreshCookie('', 0));
}
export function authenticate(ctx) {
  const h = String(ctx.req.headers.authorization || '');
  if (!h.startsWith('Bearer ')) return null;
  const p = verifyJwt(h.slice(7));
  if (!p) return null;
  const u = one('SELECT id, role, full_name, phone, is_active FROM users WHERE id = ?', p.sub);
  if (!u || !u.is_active) return null;
  return u;
}

/* ---------- OTP ---------- */
const OTP_TTL = 2 * 60 * 1000;
const otpHash = (phone, code) => sha256(config.jwtSecret + ':' + phone + ':' + code);
export function createOtp(phone, purpose) {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  run('UPDATE otp_codes SET consumed = 1 WHERE phone = ? AND purpose = ? AND consumed = 0', phone, purpose);
  insert('INSERT INTO otp_codes (phone, purpose, code_hash, expires_at, created_at) VALUES (?,?,?,?,?)', phone, purpose, otpHash(phone, code), now() + OTP_TTL, now());
  return code;
}
export function consumeOtp(phone, purpose, code) {
  const row = one('SELECT * FROM otp_codes WHERE phone = ? AND purpose = ? AND consumed = 0 ORDER BY id DESC LIMIT 1', phone, purpose);
  if (!row || row.expires_at < now()) throw new HttpError(400, 'Kod muddati o‘tgan. Yangi kod so‘rang');
  if (row.attempts >= 5) throw new HttpError(429, 'Urinishlar soni tugadi. Yangi kod so‘rang');
  if (otpHash(phone, String(code || '').trim()) !== row.code_hash) {
    run('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', row.id);
    throw new HttpError(400, 'Kod noto‘g‘ri');
  }
  run('UPDATE otp_codes SET consumed = 1 WHERE id = ?', row.id);
}

/* ---------- SMS ---------- */
let eskizToken = null, eskizTokenAt = 0;
async function eskizAuth() {
  if (eskizToken && Date.now() - eskizTokenAt < 20 * 86400000) return eskizToken;
  const fd = new FormData();
  fd.append('email', config.sms.eskizEmail); fd.append('password', config.sms.eskizPassword);
  const r = await fetch('https://notify.eskiz.uz/api/auth/login', { method: 'POST', body: fd, signal: AbortSignal.timeout(10000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.data || !j.data.token) throw new Error('Eskiz login xatosi: ' + r.status);
  eskizToken = j.data.token; eskizTokenAt = Date.now();
  return eskizToken;
}
export async function sendSms(phone, text) {
  if (config.sms.provider === 'eskiz') {
    const token = await eskizAuth();
    const fd = new FormData();
    fd.append('mobile_phone', phone); fd.append('message', text); fd.append('from', config.sms.eskizFrom);
    const r = await fetch('https://notify.eskiz.uz/api/message/sms/send', { method: 'POST', body: fd, headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(10000) });
    if (r.status === 401) { eskizToken = null; }
    if (!r.ok) throw new Error('Eskiz SMS xatosi: ' + r.status);
    return;
  }
  console.log('[sms:console] ' + phone + ' → ' + text);
}

/* ---------- audit + notifications ---------- */
export function audit(ctx, action, entity, entityId, detail) {
  try {
    insert('INSERT INTO audit_logs (user_id, action, entity, entity_id, detail, ip, created_at) VALUES (?,?,?,?,?,?,?)',
      ctx && ctx.user ? ctx.user.id : null, action, entity || null, entityId == null ? null : Number(entityId), detail ? String(detail).slice(0, 500) : null, ctx ? ctx.ip : null, now());
  } catch (e) { console.error('[audit]', e.message); }
}
export function notify(userId, type, content, link) {
  insert('INSERT INTO notifications (user_id, type, content, link, created_at) VALUES (?,?,?,?,?)', userId, type, content, link || null, now());
}
export function notifyAdmins(type, content, link) {
  for (const a of all("SELECT id FROM users WHERE role = 'ADMIN' AND is_active = 1")) notify(a.id, type, content, link);
}
