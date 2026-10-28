import { esc, icon, logo, initials, session, api, app, ago, poller, t, tServer, avatar, langSwitch, backBtn, presencePill } from './core.js';
import { SEGMENT_PATHS, BACK_MAP, SEGMENT_NAMES, PAIN_KINDS, painColor, anchorFor } from '/shared/clinical.js';
import { INJURY_GLYPH } from './body-map.js';

/* ---------------- national ornament (girih medallion) ---------------- */
// An eight-pointed star inside a ring of islimi petals — the motif of Samarkand and Bukhara tilework.
export function ornament(cls = '') {
  const petals = Array.from({ length: 16 }, (_, i) => '<path transform="rotate(' + (i * 22.5) + ')" d="M0 -92C9 -80 9 -66 0 -56C-9 -66 -9 -80 0 -92Z"/>').join('');
  const dots = Array.from({ length: 32 }, (_, i) => '<circle transform="rotate(' + (i * 11.25) + ')" cx="0" cy="-98" r="1.6"/>').join('');
  const star = (r) => { const p = []; for (let i = 0; i < 16; i++) { const a = (Math.PI / 8) * i - Math.PI / 2; const rr = i % 2 ? r * 0.72 : r; p.push((Math.cos(a) * rr).toFixed(1) + ',' + (Math.sin(a) * rr).toFixed(1)); } return '<polygon points="' + p.join(' ') + '"/>'; };
  return '<svg class="orn ' + cls + '" viewBox="-102 -102 204 204" aria-hidden="true"><g class="orn-spin">' +
    '<circle r="99" class="orn-ring"/><circle r="52" class="orn-ring thin"/>' + dots + '<g class="orn-petals">' + petals + '</g>' + star(50) + '<rect x="-30" y="-30" width="60" height="60"/><rect x="-30" y="-30" width="60" height="60" transform="rotate(45)"/>' + star(22) + '<circle r="8"/></g></svg>';
}
/** Thin ikat-like band in the national palette, used under headings. */
export const ikat = () => '<i class="ikat" aria-hidden="true"></i>';

/* ---------------- body map ---------------- */
// sel: { code: {pain} } · act: action for clickable segments · open: highlighted code
// mode 'healthy': untouched segments glow mint ("everything is fine"), affected ones show pain colours.
// findings: optional [{code, label, value, unit, tone}] — pins a floating value bubble to each code's body point.
export function bodyMap({ view = 'front', sel = {}, open = null, act = null, width = 220, mode = 'normal', scan = false, findings = null }) {
  const injuries = [];
  const paths = Object.keys(SEGMENT_PATHS).map((k, i) => {
    const id = view === 'organs' ? (sel[k] ? k : (sel[BACK_MAP[k]] ? BACK_MAP[k] : k)) : view === 'front' ? k : BACK_MAP[k];
    const v = sel[id]; const on = open === id;
    const fill = v ? painColor(v.pain) : mode === 'healthy' ? 'url(#bm-healthy)' : mode === 'organs' ? 'url(#bm-ghost)' : 'url(#bm-tissue)';
    const cls = ['seg', v ? 'hurt' : '', on ? 'open' : '', act ? 'hit' : ''].filter(Boolean).join(' ');
    const attrs = act ? ' data-act="' + act + '" data-code="' + id + '" tabindex="0" role="button" aria-label="' + esc(t(SEGMENT_NAMES[id])) + (v ? ', ' + esc(t('og‘riq {n} dan 10', { n: v.pain })) : '') + '"' : '';
    if (v && v.kind && INJURY_GLYPH[v.kind]) { const pt = anchorFor(id, view); if (pt) injuries.push('<g class="bm-injury" transform="translate(' + pt[0] + ',' + pt[1] + ')"><title>' + esc(t(SEGMENT_NAMES[id])) + ' — ' + esc(t(PAIN_KINDS[v.kind] || v.kind)) + '</title><circle r="5.6" fill="#fff" stroke="' + painColor(v.pain) + '" stroke-width="1.4"/>' + INJURY_GLYPH[v.kind] + '</g>'); }
    return '<path class="' + cls + '" d="' + SEGMENT_PATHS[k] + '" style="fill:' + fill + ';--i:' + i + (v ? ';--pc:' + painColor(v.pain) : '') + '"' + attrs + '><title>' + esc(t(SEGMENT_NAMES[id])) + (v ? ' — ' + v.pain + '/10' : '') + '</title></path>';
  }).join('');
  const aura = Object.values(SEGMENT_PATHS).map((d) => '<path d="' + d + '"/>').join('');
  const marked = (findings || []).map((f) => ({ ...f, pt: anchorFor(f.code, view) })).filter((f) => f.pt);
  const marks = marked.map((f) => '<circle class="fdot t-' + (f.tone || 'info') + '" cx="' + f.pt[0] + '" cy="' + f.pt[1] + '" r="5"/>').join('');
  const viewLabel = view === 'front' ? 'Tana xaritasi, old tomoni' : view === 'organs' ? 'Tana xaritasi, ichki a’zolar' : 'Tana xaritasi, orqa tomoni';
  const svg = '<svg class="body-svg mode-' + mode + (act ? ' interactive' : '') + '" viewBox="0 -2 200 434" width="' + width + '" role="' + (act ? 'group' : 'img') + '" aria-label="' + esc(t(viewLabel)) + '">' +
    '<defs><linearGradient id="bm-tissue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--tissue-a)"/><stop offset="1" style="stop-color:var(--tissue-b)"/></linearGradient>' +
    '<linearGradient id="bm-healthy" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--ok-a)"/><stop offset="1" style="stop-color:var(--ok-b)"/></linearGradient>' +
    '<linearGradient id="bm-ghost" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--ghost-a)"/><stop offset="1" style="stop-color:var(--ghost-b)"/></linearGradient>' +
    '<filter id="bm-blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7"/></filter></defs>' +
    '<g class="bm-aura" filter="url(#bm-blur)">' + aura + '</g><g class="bm-segs">' + paths + '</g>' +
    (injuries.length ? '<g class="bm-injuries">' + injuries.join('') + '</g>' : '') +
    (scan || mode === 'healthy' ? '<rect class="bm-scan" x="20" y="0" width="160" height="26" rx="13"/>' : '') +
    (marks ? '<g class="bm-marks">' + marks + '</g>' : '') + '</svg>';
  if (!marked.length) return svg;
  const bubbles = layoutFindings(marked).map((f, i) => '<div class="finding ' + f.side + ' t-' + (f.tone || 'info') + '" style="--x:' + f.x + '%;--y:' + f.y + '%;--d:' + i + '">' + (f.icon ? '<span class="fi">' + icon(f.icon, 14, 2.4) + '</span>' : '') + '<span class="ft"><b>' + esc(String(f.value)) + esc(f.unit || '%') + '</b><span class="fl">' + esc(t(f.label)) + '</span></span></div>').join('');
  return '<div class="body-stage">' + svg + bubbles + '</div>';
}
// Places findings left/right of the body from their anchor point, nudging apart ones that would overlap vertically.
function layoutFindings(items) {
  const pts = items.map((f) => { const [x, y] = f.pt; const px = x / 200 * 100, py = y / 432 * 100; return { ...f, x: +px.toFixed(2), y: py, side: px < 50 ? 'l' : 'r' }; });
  ['l', 'r'].forEach((side) => {
    const g = pts.filter((p) => p.side === side).sort((a, b) => a.y - b.y);
    let prev = -999;
    g.forEach((p) => { if (p.y - prev < 11) p.y = prev + 11; prev = p.y; });
  });
  pts.forEach((p) => { p.y = +p.y.toFixed(2); });
  return pts;
}
/* ---------------- digital ID card ---------------- */
/** A government-ID-style card for the patient/doctor profile screen: photo, stacked label/value fields, a MED ASSIST security mark.
 * fields: [label, value, tone?] — tone 'warn' highlights a field (e.g. an allergy). qr: an inline <svg> string, scanned to re-read the same facts printed on the card. */
export function idCard(u, { role, title, fields = [], qr = '' }) {
  const idNo = (role === 'doctor' ? 'MA-SH-' : 'MA-BM-') + String(u.id).padStart(6, '0');
  const nameLabel = role === 'doctor' ? 'Ism-Sharif' : 'Bemor Ismi-Sharifi';
  const all = [[nameLabel, u.fullName], ...fields, ['Tibbiy ID №', idNo]].filter(([, v]) => v);
  return '<div class="id-card ' + role + '"><span class="id-corner"></span>' +
    '<div class="id-head"><span class="id-flag"><i></i><i></i><i></i></span><span class="id-title">' + esc(t(title)) + '</span></div>' +
    '<div class="id-body"><div class="id-photo-wrap">' + avatar(u, { size: 72, cls: 'id-photo' }) + '</div>' +
      '<div class="id-fields">' + all.map(([l, v, tone]) => '<div class="id-f' + (tone ? ' ' + tone : '') + '"><span class="id-l">' + esc(t(l)) + ':</span><b class="id-v">' + esc(v) + '</b></div>').join('') + '</div>' +
      (qr ? '<div class="id-badge">' + qr + '</div>' : '') + '</div>' +
    '<div class="id-foot"><span class="id-sign">' + esc(u.fullName) + '</span><span class="id-brand">' + icon('shield', 20, 2.2) + '<span>MED<br>ASSIST</span></span></div></div>';
}
/* ---------------- flat character illustration (home screen hero) ---------------- */
/** A friendly flat-style figure for the home screen: a doctor for the patient's hero, a patient for the doctor's hero. */
export function personIllustration(kind) {
  if (kind === 'patient') {
    return '<svg viewBox="0 0 200 240" class="person-ill" role="img" aria-label="' + esc(t('Bemor')) + '">' +
      '<path d="M72 46C70 28 84 14 100 14C116 14 130 28 128 46C122 34 112 29 100 29C88 29 78 34 72 46Z" fill="#2D3657"/>' +
      '<circle cx="100" cy="58" r="27" fill="#F2B38C"/>' +
      '<circle cx="91" cy="57" r="2.3" fill="#2D3657"/><circle cx="109" cy="57" r="2.3" fill="#2D3657"/>' +
      '<path d="M91 68C95 72 105 72 109 68" stroke="#9A5A42" stroke-width="2" fill="none" stroke-linecap="round"/>' +
      '<rect x="91" y="80" width="18" height="16" fill="#E3A077"/>' +
      '<path d="M38 238C41 188 55 150 84 136L100 152L116 136C145 150 159 188 162 238Z" fill="#2EC4A6"/>' +
      '<path d="M84 136L100 152L93 164Z" fill="#1E9D83"/><path d="M116 136L100 152L107 164Z" fill="#1E9D83"/>' +
      '<path d="M46 150C32 162 25 182 30 202C34 210 43 208 45 199C41 184 44 169 57 158Z" fill="#2EC4A6"/><circle cx="31" cy="206" r="10" fill="#F2B38C"/>' +
      '<path d="M154 150C168 162 175 182 170 202C166 210 157 208 155 199C159 184 156 169 143 158Z" fill="#2EC4A6"/><circle cx="169" cy="206" r="10" fill="#F2B38C"/>' +
      '<path d="M158 196C170 192 180 196 183 204C185 210 180 214 174 211C169 208 162 204 156 202Z" fill="#fff"/>' +
      '<path d="M18 220C14 218 12 213 15 209C18 206 23 208 24 213C24 217 22 220 18 220Z" fill="#F6625B" opacity=".9"/>' +
      '</svg>';
  }
  return '<svg viewBox="0 0 200 240" class="person-ill" role="img" aria-label="' + esc(t('Shifokor')) + '">' +
    '<path d="M70 45C68 25 85 10 100 10C115 10 132 25 130 45C125 32 113 26 100 26C87 26 75 32 70 45Z" fill="#1E2A4A"/>' +
    '<circle cx="100" cy="55" r="29" fill="#F2B38C"/>' +
    '<path d="M78 62C80 72 88 80 100 80C112 80 120 72 122 62C118 72 110 76 100 76C90 76 82 72 78 62Z" fill="#1E2A4A" opacity=".88"/>' +
    '<circle cx="90" cy="54" r="2.3" fill="#1E2A4A"/><circle cx="110" cy="54" r="2.3" fill="#1E2A4A"/>' +
    '<rect x="92" y="78" width="16" height="16" fill="#E3A077"/>' +
    '<path d="M40 238C42 188 55 150 85 135L100 150L115 135C145 150 158 188 160 238Z" fill="#fff"/>' +
    '<path d="M85 135L100 150L90 170Z" fill="#2D5BFF"/><path d="M115 135L100 150L110 170Z" fill="#2D5BFF"/>' +
    '<path d="M78 140C75 155 78 170 92 176M122 140C125 155 122 170 108 176" stroke="#2A3550" stroke-width="4" fill="none" stroke-linecap="round"/>' +
    '<circle cx="100" cy="180" r="8" fill="#2A3550"/><circle cx="100" cy="180" r="4" fill="#4A5578"/>' +
    '<path d="M45 150C30 160 22 180 28 200C32 208 40 206 42 198C38 182 42 168 55 158Z" fill="#fff"/><circle cx="30" cy="205" r="10" fill="#F2B38C"/>' +
    '<path d="M155 150C168 162 174 182 170 202C166 208 158 206 156 198C160 182 156 168 145 158Z" fill="#fff"/><circle cx="168" cy="205" r="10" fill="#F2B38C"/>' +
    '<rect x="150" y="195" width="34" height="42" rx="4" fill="#FFD9C7"/><rect x="156" y="203" width="22" height="3" rx="1.5" fill="#fff"/><rect x="156" y="211" width="22" height="3" rx="1.5" fill="#fff"/><rect x="156" y="219" width="14" height="3" rx="1.5" fill="#fff"/>' +
    '</svg>';
}
/** Body map on an ornamental stage, with room either side for floating finding bubbles. */
export const findStage = (inner, cls = '') => '<div class="map-stage find-stage ' + cls + '">' + ornament() + inner + '</div>';
export const painLegend = () => '<div class="legend"><span><i style="background:#EAB308"></i>1–2</span><span><i style="background:#F59E0B"></i>3–4</span><span><i style="background:#F97316"></i>5–7</span><span><i style="background:#EF4444"></i>8–10</span></div>';
export const selFrom = (segments) => Object.fromEntries((segments || []).map((s) => [s.code, s]));
/** Body map on an ornamental stage. */
export const mapStage = (inner, cls = '') => '<div class="map-stage ' + cls + '">' + ornament() + inner + '</div>';

/* ---------------- notifications (shared across shell) ---------------- */
export const notif = { unread: 0, items: [], open: false, stop: null, lastId: null };
const sysPref = { get: () => { try { return localStorage.getItem('ma-sysnotif') === '1'; } catch { return false; } }, set: (v) => { try { localStorage.setItem('ma-sysnotif', v ? '1' : '0'); } catch { /* private mode */ } } };
export const systemNotifications = {
  supported: () => 'Notification' in window,
  enabled: () => sysPref.get() && 'Notification' in window && Notification.permission === 'granted',
  async enable() { if (!('Notification' in window)) return false; const p = await Notification.requestPermission(); sysPref.set(p === 'granted'); return p === 'granted'; },
  disable() { sysPref.set(false); }
};
export async function showSystemNotification(title, body, link) {
  if (!systemNotifications.enabled()) return;
  try {
    const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
    if (reg) await reg.showNotification(title, { body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { link }, tag: link || undefined });
    else { const n = new Notification(title, { body, icon: '/icons/icon-192.png' }); n.onclick = () => { window.focus(); if (link) location.hash = link.replace(/^#/, ''); }; }
  } catch { /* notifications are best effort */ }
}
export async function loadNotifications() {
  if (!session.user) return;
  const r = await api('/notifications');
  const changed = r.unread !== notif.unread || JSON.stringify(r.items.slice(0, 5)) !== JSON.stringify(notif.items.slice(0, 5));
  if (notif.lastId !== null) for (const n of r.items.filter((x) => x.id > notif.lastId && !x.isRead).slice(0, 3).reverse()) showSystemNotification('MedAssist', n.content, n.link);
  notif.lastId = r.items.length ? r.items[0].id : notif.lastId || 0;
  notif.unread = r.unread; notif.items = r.items;
  if (changed) app.queue();
}
export function startNotifications() {
  if (notif.stop) return;
  loadNotifications().catch(() => {});
  notif.stop = poller(loadNotifications, 20000);
}
export function stopNotifications() { if (notif.stop) { notif.stop(); notif.stop = null; } notif.unread = 0; notif.items = []; notif.open = false; notif.lastId = null; }
const NOTIF_ICON = { MESSAGE: 'chat', RESULT: 'check', URGENT: 'alert', APPOINTMENT: 'calendar', REVIEW: 'star', SUPPORT: 'help', TICKET: 'help', COMPLAINT: 'flag', DISPENSED: 'pill', VERIFICATION: 'shield', NEW_CASE: 'steth', LOW_RATING: 'frown', RX_CANCELLED: 'x', ASSIGNED: 'steth' };
export const notifIcon = (type) => NOTIF_ICON[type] || 'bell';
export const notifHot = (type) => ['URGENT', 'RX_CANCELLED', 'COMPLAINT', 'LOW_RATING'].includes(type);
export const notifActions = {
  async notifToggle() {
    notif.open = !notif.open; drawer.open = false; app.render();
    if (notif.open && notif.unread) { await api('/notifications/read-all', { method: 'POST' }); notif.unread = 0; }
  },
  notifClose() { notif.open = false; app.render(); },
  notifGo(el) { notif.open = false; location.hash = el.dataset.to; },
  menuToggle() { drawer.open = !drawer.open; notif.open = false; app.render(); },
  menuClose() { drawer.open = false; app.render(); },
  menuGo(el) { drawer.open = false; location.hash = el.dataset.to; }
};
function notifPanel() {
  if (!notif.open) return '';
  return '<div class="overlay clear" data-act="notifClose"></div><div class="popover glass" role="dialog" aria-label="' + esc(t('Bildirishnomalar')) + '">' +
    '<div class="row between" style="padding:10px 12px"><h4>' + esc(t('Bildirishnomalar')) + '</h4><button class="btn btn-ghost btn-sm" data-act="notifGo" data-to="#/notifications">' + esc(t('Barchasi')) + '</button></div>' +
    (notif.items.length ? notif.items.slice(0, 12).map((n, i) => '<button class="item flat notif-row" style="--d:' + i + '" data-act="notifGo" data-to="' + esc(n.link || app.homeFor(session.user)) + '">' +
      '<span class="nic' + (notifHot(n.type) ? ' hot' : '') + '">' + icon(notifIcon(n.type), 16) + '</span>' +
      '<span class="grow"><span class="sm b" style="display:block">' + esc(tServer(n.content)) + '</span><span class="xs faint">' + ago(n.createdAt) + '</span></span></button>').join('')
      : '<div class="empty sm">' + esc(t('Hozircha bildirishnoma yo‘q')) + '</div>') + '</div>';
}

/* ---------------- shell ---------------- */
export const drawer = { open: false };
// [href, icon, label, short label, in mobile tab bar]
const NAV = {
  PATIENT: [['#/app', 'home', 'Bosh sahifa', 'Asosiy', 1], ['#/app/doctors', 'steth', 'Shifokor topish', 'Shifokorlar', 1], ['#/app/new', 'plus', 'Yangi murojaat', 'Yangi', 'fab'], ['#/app/meds', 'pill', 'Dorilarim', 'Dorilar', 1],
    ['#/app/history', 'list', 'Murojaatlarim', 'Tarix', 0], ['#/app/visits', 'calendar', 'Qabullarim', 'Qabullar', 0], ['#/app/nearby', 'pin', 'Yaqin atrofda', 'Yaqinda', 0], ['#/verify', 'scan', 'Retseptni tekshirish', 'Retsept', 0],
    ['#/support', 'help', 'Yordam va shikoyat', 'Yordam', 0], ['#/app/profile', 'user', 'Profil', 'Profil', 1]],
  DOCTOR: [['#/doctor', 'home', 'Bosh sahifa', 'Asosiy', 1], ['#/doctor/queue', 'list', 'Onlayn navbat', 'Navbat', 1], ['#/doctor/visits', 'calendar', 'Jonli qabul navbati', 'Qabullar', 1], ['#/doctor/schedule', 'clock', 'Ish jadvali', 'Jadval', 0],
    ['#/doctor/stats', 'bars', 'Statistika va hisobot', 'Statistika', 1], ['#/doctor/done', 'check', 'Yakunlanganlar', 'Tarix', 0], ['#/support', 'help', 'Texnik yordam', 'Yordam', 0], ['#/doctor/profile', 'user', 'Profil', 'Profil', 1]],
  ADMIN: [['#/admin', 'chart', 'Statistika', 'Statistika', 1], ['#/admin/tickets', 'help', 'Murojaat va shikoyatlar', 'Murojaat', 1], ['#/admin/doctors', 'steth', 'Shifokorlar', 'Shifokor', 1], ['#/admin/users', 'users', 'Foydalanuvchilar', 'Odamlar', 0],
    ['#/admin/reviews', 'star', 'Baholar va fikrlar', 'Baholar', 0], ['#/admin/medicines', 'pill', 'Dorilar va AI', 'Dorilar', 0], ['#/admin/reports', 'file', 'Hisobotlar', 'Hisobot', 1], ['#/admin/audit', 'shield', 'Audit jurnali', 'Audit', 0], ['#/admin/profile', 'user', 'Profil', 'Profil', 1]]
};
const roleName = { PATIENT: 'Bemor', DOCTOR: 'Shifokor', ADMIN: 'Administrator' };
const profileHref = { PATIENT: '#/app/profile', DOCTOR: '#/doctor/profile', ADMIN: '#/admin/profile' };

/** Wraps page content in the authenticated app shell. opts: {title, subtitle, back, actions, active} */
export function shell(content, opts = {}) {
  const u = session.user; if (!u) return content;
  const nav = NAV[u.role] || [];
  const active = opts.active || ('#' + (location.hash.slice(1).split('?')[0] || '/'));
  const isOn = (href) => active === href;
  const me = '<button class="me" data-act="go" data-to="' + profileHref[u.role] + '">' + avatar(u, { size: 40 }) + '<span class="grow"><span class="b sm ellipsis">' + esc(u.fullName) + '</span><span class="xs faint">' + esc(t(roleName[u.role])) + (u.doctor ? ' · ' + esc(t(u.doctor.specialty)) : '') + '</span>' + (u.doctor ? presencePill(u.doctor.presence) : '') + '</span></button>';
  const side = '<aside class="sidebar glass" aria-label="' + esc(t('Asosiy menyu')) + '">' + logo() + '<nav class="navlist">' +
    nav.map(([href, ic, label], i) => '<button class="navlink" style="--d:' + i + '" data-act="go" data-to="' + href + '"' + (isOn(href) ? ' aria-current="page"' : '') + '>' + icon(ic, 20) + '<span>' + esc(t(label)) + '</span></button>').join('') +
    '</nav><div class="side-foot">' + langSwitch('sm') + '<div class="row nw" style="gap:8px">' + me + '<button class="icon-btn" data-act="logout" aria-label="' + esc(t('Chiqish')) + '" title="' + esc(t('Chiqish')) + '">' + icon('out', 18) + '</button></div></div>' + ornament('side-orn') + '</aside>';
  const tabs = nav.filter((n) => n[4]);
  const tabbar = '<nav class="tabbar glass" aria-label="' + esc(t('Pastki menyu')) + '">' + tabs.map(([href, ic, label, short, kind]) => kind === 'fab'
    ? '<button class="fab" data-act="go" data-to="' + href + '" aria-label="' + esc(t(label)) + '">' + icon('plus', 26, 2.6) + '</button>'
    : '<button data-act="go" data-to="' + href + '"' + (isOn(href) ? ' aria-current="page"' : '') + '>' + icon(ic, 22) + '<span>' + esc(t(short)) + '</span></button>').join('') + '</nav>';
  const drawerHtml = drawer.open ? '<div class="overlay" data-act="menuClose"></div><aside class="drawer glass" role="dialog" aria-label="' + esc(t('Menyu')) + '"><div class="row between">' + logo() + '<button class="icon-btn" data-act="menuClose" aria-label="' + esc(t('Yopish')) + '">' + icon('x', 18) + '</button></div>' +
    '<nav class="navlist">' + nav.map(([href, ic, label], i) => '<button class="navlink" style="--d:' + i + '" data-act="menuGo" data-to="' + href + '"' + (isOn(href) ? ' aria-current="page"' : '') + '>' + icon(ic, 20) + '<span>' + esc(t(label)) + '</span></button>').join('') + '</nav>' +
    '<div class="side-foot">' + langSwitch() + '<div class="row nw" style="gap:8px">' + me + '<button class="icon-btn" data-act="logout" aria-label="' + esc(t('Chiqish')) + '">' + icon('out', 18) + '</button></div></div></aside>' : '';
  const top = '<header class="topbar">' + '<button class="icon-btn hide-desktop-flex" data-act="menuToggle" aria-label="' + esc(t('Menyu')) + '" aria-expanded="' + drawer.open + '">' + icon('menu', 20) + '</button>' + (opts.back ? backBtn(opts.back) : '') +
    '<div class="title"><h1>' + esc(opts.title || '') + '</h1>' + (opts.subtitle ? '<p class="muted sm">' + opts.subtitle + '</p>' : '') + '</div>' + (opts.actions || '') +
    '<span class="hide-sm-inline">' + langSwitch('sm top-lang') + '</span>' +
    '<div style="position:relative"><button class="icon-btn" data-act="notifToggle" aria-label="' + esc(t('Bildirishnomalar')) + (notif.unread ? ', ' + notif.unread : '') + '" aria-expanded="' + notif.open + '">' + icon('bell', 20) + (notif.unread ? '<span class="badge-dot">' + (notif.unread > 9 ? '9+' : notif.unread) + '</span>' : '') + '</button>' + notifPanel() + '</div>' +
    '<button class="icon-btn" data-act="theme" aria-label="' + esc(t('Mavzuni almashtirish')) + '">' + icon(document.documentElement.getAttribute('data-theme') === 'dark' ? 'sun' : 'moon', 20) + '</button></header>';
  return '<div class="mesh" aria-hidden="true"><i></i><i></i><i></i><i></i></div><div class="shell">' + side + '<main class="main" id="main">' + top + '<div class="page">' + content + '</div></main>' + tabbar + drawerHtml + '</div>';
}

/** Section header with the ikat accent. */
// h2: the first organizational heading under a page's single shell-rendered h1 (sections never nest deeper
// than h3 in this app, so starting here keeps every page's heading order unbroken).
export const sectionHead = (title, right = '') => '<div class="row between sec-head"><h2>' + esc(title) + ikat() + '</h2>' + right + '</div>';
export const initialsOf = initials;
