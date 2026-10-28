// MedAssist frontend core — tiny framework: API client with token refresh, hash router,
// string-template renderer with focus preservation, delegated events, toasts, dialogs, i18n helpers.
import { t, tServer, lang, setLang, locale, LANGS } from './i18n.js';
export { t, tServer, lang, LANGS, locale };

export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmtDate = (v) => { const d = new Date(v); return d.toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric' }) + ', ' + d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }); };
export const fmtDay = (v) => new Date(v).toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
export const fmtTime = (v) => new Date(v).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
// Browsers lack Uzbek month/weekday names (Chromium prints “M10”), so Uzbek dates are formatted by hand.
const UZ_MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const UZ_DAYS = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];
export const fmtDayLong = (v) => { const d = new Date(v); if (lang() === 'uz') { const w = UZ_DAYS[d.getDay()]; return w[0].toUpperCase() + w.slice(1) + ', ' + d.getDate() + '-' + UZ_MONTHS[d.getMonth()]; } return d.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' }); };
export const fmtMonthShort = (v) => { const d = new Date(v); return lang() === 'uz' ? UZ_MONTHS[d.getMonth()].slice(0, 3) : d.toLocaleDateString(locale(), { month: 'short' }).replace('.', ''); };
export const fmtMin = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
export const ago = (v) => { const m = Math.round((Date.now() - v) / 60000); if (m < 1) return t('hozirgina'); if (m < 60) return t('{n} daq oldin', { n: m }); const h = Math.round(m / 60); if (h < 24) return t('{n} soat oldin', { n: h }); const d = Math.round(h / 24); return d < 30 ? t('{n} kun oldin', { n: d }) : fmtDay(v); };
export const initials = (n) => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
export const fmtPhone = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.length === 12 ? '+' + d.slice(0, 3) + ' ' + d.slice(3, 5) + ' ' + d.slice(5, 8) + ' ' + d.slice(8, 10) + ' ' + d.slice(10) : p; };
export const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
export const fmtMoney = (n) => (n ? Number(n).toLocaleString('ru-RU').replace(/,/g, ' ') + ' ' + t('so‘m') : t('Bepul'));
export const dayKey = (v) => { const d = new Date(v); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

/* ---------------- icons (stroke, 24 grid) ---------------- */
const P = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  next: '<path d="M9 18l6-6-6-6"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  steth: '<path d="M6 3v6a5 5 0 0 0 10 0V3M11 14v2a5 5 0 0 0 10 0v-2"/><circle cx="21" cy="12" r="1.5"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 14h3v3M21 14v.01M14 21h7v-4"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10"/>',
  spark: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
  clip: '<path d="m21 11-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9"/>',
  pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3"/>',
  pill: '<rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="m8.5 8.5 7 7"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 6-7"/>',
  bars: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
  map: '<circle cx="12" cy="5" r="2.5"/><path d="M12 8v7M8 10h8M10 22l2-7 2 7"/>',
  pin: '<path d="M12 22s7-6.1 7-12a7 7 0 0 0-14 0c0 5.9 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  route: '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H16a3.5 3.5 0 0 0 0-7H8a3.5 3.5 0 0 1 0-7h7.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M10.6 5.1A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.4 3.3M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M3 3l18 18M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.3L3 16M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5M3 21v-5h5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  install: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M12 7v7M9 11l3 3 3-3M10 18h4"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  building: '<path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M2 21h20M8 7h4M8 11h4M8 15h4"/>',
  hospital: '<path d="M3 21V8l9-5 9 5v13M2 21h20M12 8v6M9 11h6M9 21v-4h6v4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>',
  brain: '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5h1a3 3 0 0 0 3-3V7a3 3 0 0 0-1-3z"/><path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5h-1a3 3 0 0 1-3-3V7a3 3 0 0 1 1-3z"/>',
  lungs: '<path d="M12 3v6"/><path d="M9 9c-2.2 0-4.5 2-4.5 6.5 0 3 1 6 3 6 2 0 2.5-2 2.5-4.5V9z"/><path d="M15 9c2.2 0 4.5 2 4.5 6.5 0 3-1 6-3 6-2 0-2.5-2-2.5-4.5V9z"/>',
  kidney: '<path d="M9.3 3c-3.2 0-5.3 3-5.3 7.5S5.7 20 9 21c1.1.3 2.1-.6 1.7-1.7-.8-2-2-3.6-2-5.8 0-2.3 1.4-3.5 3.3-3.5a3.5 3.5 0 1 0 0-7 4.6 4.6 0 0 0-2.7 1z"/>',
  bone: '<path d="M17 10c.7-.7 1.69 0 2.5 0a2.5 2.5 0 1 0 0-5 .5.5 0 0 1-.5-.5 2.5 2.5 0 1 0-5 0c0 .81.7 1.8 0 2.5l-7 7c-.7.7-1.69 0-2.5 0a2.5 2.5 0 0 0 0 5c.28 0 .5.22.5.5a2.5 2.5 0 1 0 5 0c0-.81-.7-1.8 0-2.5Z"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  flag: '<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/>',
  printer: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  door: '<path d="M3 21h18M5 21V3h11v18M14 12h.01"/>',
  play: '<path d="M6 4l14 8-14 8z"/>',
  wallet: '<path d="M20 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-4a2 2 0 0 0 0 4h4v3a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5"/>',
  trend: '<path d="M22 7l-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>',
  frown: '<circle cx="12" cy="12" r="9"/><path d="M16 16s-1.5-2-4-2-4 2-4 2M9 9h.01M15 9h.01"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  alarm: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M5 3 2 6M22 6l-3-3"/>',
  navigation: '<path d="m3 11 19-9-9 19-2-8z"/>'
};
export const icon = (name, size = 20, sw = 2) => '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + sw + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || '') + '</svg>';
// Purely decorative — the adjacent "MedAssist" text (or the link's own aria-label) already names the brand.
export const logoMark = (s = 34) => '<span class="logo-mark" style="width:' + s + 'px;height:' + s + 'px"><svg width="' + Math.round(s * 0.5) + '" height="' + Math.round(s * 0.5) + '" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" aria-hidden="true"><path d="M12 4v16M4 12h16"/></svg></span>';
export const logo = () => '<a class="logo" href="#/" aria-label="' + esc(t('MedAssist bosh sahifa')) + '">' + logoMark() + 'MedAssist</a>';

/* ---------------- API client ---------------- */
export class ApiError extends Error { constructor(status, message, errors) { super(message); this.status = status; this.errors = errors; } }
export const session = { token: null, user: null };
let refreshing = null;
const hint = { get: () => { try { return localStorage.getItem('ma-auth') === '1'; } catch { return true; } }, set: (v) => { try { if (v) localStorage.setItem('ma-auth', '1'); else localStorage.removeItem('ma-auth'); } catch { /* private mode */ } } };
export const markSignedIn = (v) => hint.set(v);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export async function refreshSession(force) {
  if (!force && !hint.get()) return false;
  if (!refreshing) {
    const attempt = () => fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'same-origin' });
    refreshing = (async () => {
      let r = await attempt();
      // Another tab may have rotated the token a moment ago — its fresh cookie is already ours, retry once.
      if (r.status === 401) { await wait(400); r = await attempt(); }
      if (!r.ok) throw new Error('no session');
      const j = await r.json(); session.token = j.accessToken; session.user = j.user; hint.set(true); return true;
    })()
      .catch(() => { session.token = null; session.user = null; hint.set(false); return false; })
      .finally(() => { setTimeout(() => { refreshing = null; }, 0); });
  }
  return refreshing;
}
export async function api(path, opts = {}) {
  const { method = 'GET', body, raw, headers = {}, blob = false } = opts;
  // A request never hangs forever: 30 s for JSON, 2 min for uploads.
  const timeoutMs = opts.timeout || (raw !== undefined ? 120000 : 30000);
  const send = () => fetch('/api/v1' + path, {
    method, credentials: 'same-origin', signal: AbortSignal.timeout(timeoutMs),
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(session.token ? { authorization: 'Bearer ' + session.token } : {}), ...headers },
    body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined
  });
  const net = (e) => new ApiError(0, e && (e.name === 'TimeoutError' || e.name === 'AbortError') ? t('Server javob bermadi. Birozdan keyin qayta urinib ko‘ring') : t('Internet aloqasi yo‘q. Tarmoqni tekshiring'));
  let r;
  try { r = await send(); } catch (e) { throw net(e); }
  if (r.status === 401 && session.token && !path.startsWith('/auth/')) {
    if (await refreshSession(true)) { try { r = await send(); } catch (e) { throw net(e); } }
    else { app.signedOut(); throw new ApiError(401, t('Sessiya tugadi. Qayta kiring')); }
  }
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new ApiError(r.status, tServer(j.message) || t('Xatolik yuz berdi ({n})', { n: r.status }), j.errors); }
  if (blob) return r.blob();
  const ct = r.headers.get('content-type') || '';
  return ct.includes('json') ? r.json() : null;
}
function saveBlob(b, filename) {
  const url = URL.createObjectURL(b);
  const a = document.createElement('a');
  a.href = url; a.download = filename || ''; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export async function downloadFile(path, filename) { saveBlob(await api(path, { blob: true }), filename); }
/** CSV with a BOM so Excel opens Cyrillic/Uzbek text correctly. */
export function downloadCsv(filename, rows) {
  const cell = (v) => { const s = v == null ? '' : String(v); return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  saveBlob(new Blob(['﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }), filename);
}
export async function openFile(path) {
  const w = window.open('', '_blank');
  try {
    const b = await api(path, { blob: true });
    const url = URL.createObjectURL(b);
    if (w) w.location.href = url; else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  } catch (e) { if (w) w.close(); throw e; }
}

/* ---------------- photos ---------------- */
// Doctor/admin photos are public and load directly. Patient photos need the bearer token, so they are fetched as blobs.
const photoCache = new Map();
export function avatar(p, opts = {}) {
  const size = opts.size || 40; const cls = 'avatar' + (opts.cls ? ' ' + opts.cls : '');
  const style = 'width:' + size + 'px;height:' + size + 'px;border-radius:' + Math.round(size * 0.32) + 'px;font-size:' + Math.round(size * 0.36) + 'px';
  const ini = esc(initials(p && p.fullName));
  if (!p || !p.photo || !p.id) return '<span class="' + cls + '" style="' + style + '">' + ini + '</span>';
  const url = '/api/v1/users/' + p.id + '/photo?v=' + p.photo;
  if (!opts.private) return '<span class="' + cls + ' has-photo" style="' + style + '"><img src="' + url + '" alt="" loading="lazy"></span>';
  const cached = photoCache.get(url);
  return '<span class="' + cls + ' has-photo" style="' + style + '">' + (cached ? '<img src="' + cached + '" alt="">' : '<img data-photo="' + p.id + '" data-v="' + p.photo + '" alt="">' + '<i class="ini">' + ini + '</i>') + '</span>';
}
function hydratePhotos(root) {
  root.querySelectorAll('img[data-photo]').forEach((img) => {
    const url = '/api/v1/users/' + img.dataset.photo + '/photo?v=' + img.dataset.v;
    if (photoCache.has(url)) { img.src = photoCache.get(url); img.removeAttribute('data-photo'); return; }
    if (img.dataset.loading) return;
    img.dataset.loading = '1';
    api('/users/' + img.dataset.photo + '/photo?v=' + img.dataset.v, { blob: true })
      .then((b) => { const u = URL.createObjectURL(b); photoCache.set(url, u); img.src = u; img.removeAttribute('data-photo'); const ini = img.nextElementSibling; if (ini) ini.remove(); })
      .catch(() => {});
  });
}
/** Resize an image file to a square-ish JPEG ≤ 640 px before upload. */
export function resizeImage(file, max = 640) {
  return new Promise((resolve, reject) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error(t('Rasmni o‘qib bo‘lmadi')))), 'image/jpeg', 0.86);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(t('Rasmni o‘qib bo‘lmadi'))); };
    img.src = url;
  });
}

/* ---------------- catalog (cached) ---------------- */
let catalogPromise = null;
export const catalog = () => (catalogPromise || (catalogPromise = api('/catalog').catch((e) => { catalogPromise = null; throw e; })));
export const resetCatalog = () => { catalogPromise = null; };

/* ---------------- toast ---------------- */
export function toast(msg, kind = 'ok') {
  let host = document.querySelector('.toast-host');
  if (!host) { host = document.createElement('div'); host.className = 'toast-host'; host.setAttribute('role', 'status'); host.setAttribute('aria-live', 'polite'); document.body.appendChild(host); }
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = icon(kind === 'err' ? 'alert' : kind === 'info' ? 'info' : 'check', 18) + '<span>' + esc(msg) + '</span>';
  host.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, kind === 'err' ? 4500 : 2800);
}
export const errMsg = (e) => (e && e.message) || t('Xatolik yuz berdi');

/* ---------------- dialogs (no native confirm/prompt) ---------------- */
function dialog(inner, onMount) {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.className = 'dlg-host';
    host.innerHTML = '<div class="overlay"></div><div class="sheet col g20" role="dialog" aria-modal="true"><div class="grab"></div>' + inner + '</div>';
    document.body.appendChild(host);
    const close = (v) => { host.classList.add('closing'); setTimeout(() => host.remove(), 180); document.removeEventListener('keydown', onKey, true); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(null); } };
    document.addEventListener('keydown', onKey, true);
    host.querySelector('.overlay').addEventListener('click', () => close(null));
    onMount(host, close);
  });
}
export function confirmSheet({ title, text = '', ok = t('Tasdiqlash'), cancel = t('Bekor qilish'), danger = false }) {
  return dialog('<h2 style="font-size:22px">' + esc(title) + '</h2>' + (text ? '<p class="muted">' + esc(text) + '</p>' : '') +
    '<div class="row end"><button class="btn btn-ghost" data-r="0">' + esc(cancel) + '</button><button class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" data-r="1">' + esc(ok) + '</button></div>',
  (host, close) => { host.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => close(b.dataset.r === '1'))); host.querySelector('[data-r="1"]').focus(); }).then((v) => !!v);
}
export function promptSheet({ title, text = '', label = '', placeholder = '', ok = t('Saqlash'), min = 0, danger = false, value = '' }) {
  return dialog('<h2 style="font-size:22px">' + esc(title) + '</h2>' + (text ? '<p class="muted sm">' + esc(text) + '</p>' : '') +
    '<label class="field"><span>' + esc(label) + '</span><textarea class="input" style="min-height:80px" placeholder="' + esc(placeholder) + '">' + esc(value) + '</textarea></label><div class="alert err sm" hidden></div>' +
    '<div class="row end"><button class="btn btn-ghost" data-r="0">' + esc(t('Bekor qilish')) + '</button><button class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" data-r="1">' + esc(ok) + '</button></div>',
  (host, close) => {
    const ta = host.querySelector('textarea'); const er = host.querySelector('.alert');
    ta.focus();
    host.querySelector('[data-r="0"]').addEventListener('click', () => close(null));
    host.querySelector('[data-r="1"]').addEventListener('click', () => { const v = ta.value.trim(); if (v.length < min) { er.hidden = false; er.textContent = t('Kamida {n} belgi yozing', { n: min }); return; } close(v); });
  });
}

/* ---------------- theme ---------------- */
export const theme = {
  get: () => { try { return localStorage.getItem('ma-theme'); } catch { return null; } },
  isDark() { const v = this.get(); return v ? v === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; },
  toggle() { const next = this.isDark() ? 'light' : 'dark'; try { localStorage.setItem('ma-theme', next); } catch { /* private mode */ } this.apply(); app.render(); },
  apply() { document.documentElement.setAttribute('data-theme', this.isDark() ? 'dark' : 'light'); const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', this.isDark() ? '#060A16' : '#F2F6FC'); }
};

/* ---------------- app / router / renderer ---------------- */
const routes = [];
export function route(pattern, factory, opts = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ re, keys, factory, opts });
}
export const go = (hash) => { if (location.hash === hash) app.navigate(); else location.hash = hash; };
const afterRender = [];
export const onAfterRender = (fn) => afterRender.push(fn);

export const app = {
  root: null, view: null, renderQueued: false, depth: 0,
  homeFor(u) { return !u ? '#/' : u.role === 'PATIENT' ? '#/app' : u.role === 'DOCTOR' ? '#/doctor' : '#/admin'; },
  signedOut() { session.token = null; session.user = null; hint.set(false); if (!/^#\/(login|register|reset|verify|$)/.test(location.hash || '#/')) { rememberNext(); go('#/login'); } },
  /** After sign-in: the page the user originally asked for, if their role may open it. */
  takeNext(u) {
    let next = null; try { next = sessionStorage.getItem('ma-next'); sessionStorage.removeItem('ma-next'); } catch { /* private mode */ }
    if (!next) return this.homeFor(u);
    const p = next.slice(1).split('?')[0];
    const r = routes.find((x) => x.re.test(p));
    return r && (!r.opts.roles || r.opts.roles.includes(u.role)) ? next : this.homeFor(u);
  },
  async navigate() {
    this.depth++;
    const full = (location.hash || '#/').slice(1) || '/';
    const qi = full.indexOf('?');
    const path = qi >= 0 ? full.slice(0, qi) : full;
    let match = null; const params = { query: new URLSearchParams(qi >= 0 ? full.slice(qi + 1) : '') };
    // Real paths other than "/" do not exist in this hash-routed app: show the 404 page.
    const badPath = location.pathname !== '/' && location.pathname !== '/index.html';
    if (!badPath) for (const r of routes) { const m = r.re.exec(path); if (m) { match = r; r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); }); break; } }
    if (!match) match = routes.find((r) => r.opts.notFound);
    const { opts } = match;
    if (opts.roles && (!session.user || !opts.roles.includes(session.user.role))) { if (!session.user) rememberNext(); go(session.user ? this.homeFor(session.user) : '#/login'); return; }
    if (opts.guestOnly && session.user) { go(this.homeFor(session.user)); return; }
    if (this.view && this.view.unmount) this.view.unmount();
    this.view = match.factory(params);
    document.title = (this.view.title ? t(this.view.title) + ' — ' : '') + 'MedAssist';
    this.entering = true;
    this.render();
    this.entering = false;
    if (!opts.keepScroll) window.scrollTo(0, 0);
    if (this.view.mount) { try { await this.view.mount(); } catch (e) { toast(errMsg(e), 'err'); } }
  },
  render() {
    if (!this.view) return;
    const a = document.activeElement;
    const fid = a && a.id;
    let ss = null, se = null;
    try { if (a && 'selectionStart' in a) { ss = a.selectionStart; se = a.selectionEnd; } } catch { /* non-text input */ }
    const scrolls = {};
    this.root.querySelectorAll('[data-keep-scroll]').forEach((el) => { scrolls[el.id] = { top: el.scrollTop, atEnd: el.scrollHeight - el.scrollTop - el.clientHeight < 40 }; });
    this.root.innerHTML = this.view.html();
    // Page-enter animation only on navigation, not on every state re-render.
    const main = this.root.querySelector('.page');
    if (main) main.classList.toggle('enter', !!this.entering);
    if (fid) { const n = document.getElementById(fid); if (n && n !== document.activeElement) { n.focus({ preventScroll: true }); try { if (ss !== null) n.setSelectionRange(ss, se); } catch { /* ignore */ } } }
    this.root.querySelectorAll('[data-keep-scroll]').forEach((el) => { const s = scrolls[el.id]; el.scrollTop = !s || s.atEnd ? el.scrollHeight : s.top; });
    hydratePhotos(this.root);
    // An open dialog takes keyboard focus so screen-reader and keyboard users land inside it.
    const sheet = this.root.querySelector('.sheet[role="dialog"]');
    if (sheet && !sheet.contains(document.activeElement)) { const f = sheet.querySelector('button, input, select, textarea, [tabindex]'); if (f) f.focus({ preventScroll: true }); }
    for (const fn of afterRender) fn(this.root);
    if (this.view.after) this.view.after();
  },
  queue() { if (this.renderQueued) return; this.renderQueued = true; requestAnimationFrame(() => { this.renderQueued = false; this.render(); }); }
};

// Delegated events: data-act="name" → view.on[name](el, event); data-bind="key" → view.bind(key, value, el, event)
function dispatch(name, el, e) {
  const v = app.view;
  const fn = (v && v.on && v.on[name]) || (globalActions[name]);
  if (!fn) return;
  // A button stays disabled while its async action runs: double clicks never send twice.
  if (busy.has(el)) return;
  const r = Promise.resolve(fn(el, e));
  if (el.tagName === 'BUTTON') { busy.add(el); el.setAttribute('aria-busy', 'true'); r.finally(() => { busy.delete(el); if (el.isConnected) el.removeAttribute('aria-busy'); }); }
  r.catch((err) => { console.error(err); toast(errMsg(err), 'err'); });
}
const busy = new WeakSet();
function rememberNext() { const h = location.hash; if (h && h !== '#/' && !/^#\/(login|register|reset)/.test(h)) { try { sessionStorage.setItem('ma-next', h); } catch { /* private mode */ } } }
const revealed = new Set();
export const globalActions = {
  theme: () => theme.toggle(),
  go: (el) => go(el.dataset.to),
  // history.back() only when the previous entry is inside the app; otherwise go to the parent page.
  back: (el) => { if (app.depth > 1 && el.dataset.hist !== 'no') history.back(); else go(el.dataset.to || app.homeFor(session.user)); },
  lang: (el) => { setLang(el.dataset.v); document.title = (app.view && app.view.title ? t(app.view.title) + ' — ' : '') + 'MedAssist'; app.render(); },
  pwToggle: (el) => { const id = el.dataset.for; if (revealed.has(id)) revealed.delete(id); else revealed.add(id); const inp = document.getElementById(id); if (inp) { inp.type = revealed.has(id) ? 'text' : 'password'; inp.focus(); } el.innerHTML = icon(revealed.has(id) ? 'eyeOff' : 'eye', 19); el.setAttribute('aria-label', t(revealed.has(id) ? 'Parolni yashirish' : 'Parolni ko‘rsatish')); el.setAttribute('aria-pressed', String(revealed.has(id))); },
  async logout() { try { await api('/auth/logout', { method: 'POST' }); } catch { /* ignore */ } session.token = null; session.user = null; hint.set(false); revealed.clear(); go('#/'); }
};
export function startApp(root) {
  app.root = root;
  setLang(lang());
  theme.apply();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!theme.get()) { theme.apply(); app.render(); } });
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    if (el.closest('.dlg-host')) return;
    if (el.tagName === 'A' && !el.dataset.act) return;
    if (el.type !== 'checkbox' && el.type !== 'file' && !el.dataset.native) e.preventDefault();
    dispatch(el.dataset.act, el, e);
  });
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('svg [data-act], [role="button"][data-act]')) { e.preventDefault(); dispatch(e.target.dataset.act, e.target, e); }
    if (e.key === 'Escape' && app.view && app.view.on && app.view.on.escape) app.view.on.escape();
    if (e.key === 'Enter' && e.target.matches('[data-enter]') && !e.shiftKey) { e.preventDefault(); dispatch(e.target.dataset.enter, e.target, e); }
  });
  const onBind = (e) => {
    const el = e.target;
    if (!el.dataset || !el.dataset.bind || !app.view || !app.view.bind) return;
    const val = el.type === 'checkbox' ? el.checked : el.value;
    app.view.bind(el.dataset.bind, val, el, e);
  };
  document.addEventListener('input', onBind);
  document.addEventListener('change', (e) => {
    if (e.target.type === 'file' && e.target.dataset.file) { dispatch(e.target.dataset.file, e.target, e); return; }
    onBind(e);
  });
  window.addEventListener('hashchange', () => app.navigate());
}

/* ---------------- polling helper ---------------- */
export function poller(fn, ms) {
  let tm = null, stopped = false;
  const tick = async () => { if (stopped) return; if (!document.hidden) { try { await fn(); } catch { /* keep polling */ } } if (!stopped) tm = setTimeout(tick, ms); };
  tm = setTimeout(tick, ms);
  return () => { stopped = true; clearTimeout(tm); };
}

/* ---------------- shared UI fragments ---------------- */
export const SEV_LABEL = { GREEN: 'Yengil', YELLOW: 'O‘rtacha', RED: 'Shoshilinch' };
export const sevPill = (s) => '<span class="pill ' + s + '"><span class="dot"></span>' + esc(t(SEV_LABEL[s] || s)) + '</span>';
export const statusPill = (st) => {
  const map = { NEW: ['Navbatda', ''], AI_DRAFTED: ['Navbatda', ''], ASSIGNED: ['Shifokor ko‘rmoqda', 'info'], DIAGNOSED: ['Javob tayyor', 'ok'], CLOSED: ['Yopilgan', ''], CANCELLED: ['Bekor qilingan', ''] };
  const [label, cls] = map[st] || [st, ''];
  return '<span class="pill ' + cls + '">' + esc(t(label)) + '</span>';
};
export const APPT_STATUS = { BOOKED: ['Yozilgan', 'info'], ARRIVED: ['Keldi', 'warn'], IN_PROGRESS: ['Qabulda', 'warn'], DONE: ['Yakunlandi', 'ok'], CANCELLED: ['Bekor qilingan', 'err'], NO_SHOW: ['Kelmadi', 'err'] };
export const apptPill = (st) => '<span class="pill ' + (APPT_STATUS[st] || ['', ''])[1] + '">' + esc(t((APPT_STATUS[st] || [st])[0])) + '</span>';
export const PRESENCE_LABEL = { ONLINE: 'Onlayn', AT_WORK: 'Klinikada', OFFLINE: 'Mavjud emas' };
export const presencePill = (p) => '<span class="presence ' + p + '"><i></i>' + esc(t(PRESENCE_LABEL[p] || p)) + '</span>';
export const stars = (v, size = 15) => { const n = Math.round(Number(v) || 0); return '<span class="stars" aria-label="' + esc(t('{n} dan 5', { n: v || 0 })) + '">' + [1, 2, 3, 4, 5].map((i) => '<i class="' + (i <= n ? 'on' : '') + '">' + icon('star', size, 1.8) + '</i>').join('') + '</span>'; };
export const emergency = (text) => '<div class="emergency" role="alert">' + icon('alert', 26) + '<div class="t">' + esc(text || t('Bu belgilar xavfli bo‘lishi mumkin. Darhol tez yordamga qo‘ng‘iroq qiling.')) + '</div><a class="btn btn-emergency" href="tel:103">' + icon('phone', 18) + esc(t('103 ga qo‘ng‘iroq')) + '</a></div>';
export const spinner = () => '<span class="spin" aria-hidden="true"></span>';
export const skeletons = (n = 3) => Array.from({ length: n }, () => '<div class="skeleton"></div>').join('');
export const empty = (ic, title, sub = '', action = '') => '<div class="glass empty"><span class="ic">' + icon(ic, 28) + '</span><b>' + esc(title) + '</b>' + (sub ? '<span class="sm">' + esc(sub) + '</span>' : '') + action + '</div>';
/** Client-side paging: returns {items, page, pages} with page clamped to range. */
export function paginate(list, page, size = 20) {
  const pages = Math.max(1, Math.ceil((list || []).length / size));
  const p = Math.min(Math.max(1, page || 1), pages);
  return { items: (list || []).slice((p - 1) * size, p * size), page: p, pages, total: (list || []).length };
}
/** Pager bar; buttons dispatch data-act="page" with data-v = target page. */
export function pager(pg) {
  if (pg.pages <= 1) return '';
  const nums = [];
  for (let i = 1; i <= pg.pages; i++) if (i === 1 || i === pg.pages || Math.abs(i - pg.page) <= 1) nums.push(i); else if (nums[nums.length - 1] !== '…') nums.push('…');
  return '<nav class="pager" aria-label="' + esc(t('Sahifalar')) + '"><button class="icon-btn" data-act="page" data-v="' + (pg.page - 1) + '"' + (pg.page <= 1 ? ' disabled' : '') + ' aria-label="' + esc(t('Oldingi sahifa')) + '">' + icon('back', 18) + '</button>' +
    nums.map((n) => (n === '…' ? '<span class="faint">…</span>' : '<button class="pg' + (n === pg.page ? ' on' : '') + '" data-act="page" data-v="' + n + '"' + (n === pg.page ? ' aria-current="page"' : '') + '>' + n + '</button>')).join('') +
    '<button class="icon-btn" data-act="page" data-v="' + (pg.page + 1) + '"' + (pg.page >= pg.pages ? ' disabled' : '') + ' aria-label="' + esc(t('Keyingi sahifa')) + '">' + icon('next', 18) + '</button><span class="xs faint">' + esc(t('Jami: {n}', { n: pg.total })) + '</span></nav>';
}
/** Password input with a show/hide toggle. */
export function pwField({ id, label, value = '', auto = 'current-password', bind, hint: h = '', enter = '' }) {
  const shown = revealed.has(id);
  return '<label class="field"><span>' + esc(label) + '</span><div class="pw-wrap"><input class="input" id="' + id + '" type="' + (shown ? 'text' : 'password') + '" data-bind="' + (bind || id) + '"' + (enter ? ' data-enter="' + enter + '"' : '') + ' autocomplete="' + auto + '" value="' + esc(value) + '">' +
    '<button type="button" class="pw-eye" data-act="pwToggle" data-for="' + id + '" aria-pressed="' + shown + '" aria-label="' + esc(t(shown ? 'Parolni yashirish' : 'Parolni ko‘rsatish')) + '">' + icon(shown ? 'eyeOff' : 'eye', 19) + '</button></div>' + (h ? '<small>' + esc(h) + '</small>' : '') + '</label>';
}
export const langSwitch = (cls = '') => '<div class="seg lang-seg ' + cls + '" role="group" aria-label="' + esc(t('Til')) + '">' + LANGS.map(([k, s, full]) => '<button data-act="lang" data-v="' + k + '" aria-pressed="' + (lang() === k) + '" title="' + full + '">' + s + '</button>').join('') + '</div>';
/** Back button for page headers; uses history when there is one. */
export const backBtn = (to) => '<button class="icon-btn back-btn" data-act="back" data-to="' + esc(to) + '" aria-label="' + esc(t('Orqaga')) + '">' + icon('back', 20) + '</button>';
export const mapsUrl = (d) => (d.clinicLat && d.clinicLng ? 'https://yandex.uz/maps/?rtext=~' + d.clinicLat + ',' + d.clinicLng + '&rtt=auto' : 'https://yandex.uz/maps/?text=' + encodeURIComponent(d.clinicAddress || d.clinicName || ''));
export const gmapsUrl = (d) => (d.clinicLat && d.clinicLng ? 'https://www.google.com/maps/dir/?api=1&destination=' + d.clinicLat + ',' + d.clinicLng : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(d.clinicAddress || ''));
