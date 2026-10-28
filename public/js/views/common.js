import { esc, icon, session, app, api, go, toast, errMsg, spinner, ago, fmtDate, skeletons, empty, t, tServer } from '../core.js';
import { shell, sectionHead, ikat, notif, notifIcon, notifHot, systemNotifications } from '../ui.js';
import { ticketRow, ticketDetail, KIND } from './admin.js';

/* ---------------- support: list + new ---------------- */
export function supportView(params) {
  const q = params.query || new URLSearchParams();
  const s = { items: null, doctors: [], form: q.get('new') ? { kind: q.get('kind') || 'SUPPORT', subject: '', content: '', aboutDoctorId: '', rating: 0 } : null, saving: false, error: '' };
  const load = async () => { s.items = await api('/tickets/my'); app.render(); };
  return {
    title: 'Yordam va shikoyat',
    html() {
      const f = s.form;
      const intro = '<div class="glass card lg support-hero"><div class="col g12"><h2>' + esc(t('Qanday yordam bera olamiz?')) + '</h2><p class="muted">' + esc(t('Administratorga yozing: texnik muammo, shikoyat yoki taklif. Javob shu yerda va bildirishnoma orqali keladi.')) + '</p>' +
        '<div class="row">' + Object.entries(KIND).map(([k, [l, ic, tone]]) => '<button class="btn kind-btn ' + tone + '" data-act="new" data-v="' + k + '">' + icon(ic, 18) + esc(t(l)) + '</button>').join('') + '</div></div>' +
        '<div class="support-faq col g6"><b class="sm">' + esc(t('Tez javoblar')) + '</b>' + [['SMS kod kelmayaptimi?', '2 daqiqa kuting va “Qayta yuborish”ni bosing. Raqam to‘g‘ri yozilganini tekshiring.'], ['Parolni unutdim', 'Kirish sahifasida “Parolni unutdingizmi?” orqali SMS kod bilan tiklang.'], ['Shoshilinch holat', 'Ilovani kutmang — darhol 103 ga qo‘ng‘iroq qiling.']].map(([qq, a]) => '<details class="mini-faq"><summary>' + esc(t(qq)) + '</summary><p class="sm muted">' + esc(t(a)) + '</p></details>').join('') + '</div></div>';
      const form = f ? '<div class="glass card lg col g12" id="tform"><div class="row between"><h3>' + esc(t('Yangi murojaat')) + ikat() + '</h3><button class="btn btn-ghost btn-sm" data-act="cancel">' + esc(t('Bekor qilish')) + '</button></div>' +
        '<div class="seg">' + Object.entries(KIND).map(([k, [l]]) => '<button data-act="kind" data-v="' + k + '" aria-pressed="' + (f.kind === k) + '">' + esc(t(l)) + '</button>').join('') + '</div>' +
        (f.kind === 'COMPLAINT' ? '<label class="field"><span>' + esc(t('Qaysi shifokor ustidan (ixtiyoriy)')) + '</span><select class="input" id="tdoc" data-bind="form.aboutDoctorId"><option value="">' + esc(t('Shifokor emas / umumiy')) + '</option>' + s.doctors.map((d) => '<option value="' + d.id + '"' + (String(f.aboutDoctorId) === String(d.id) ? ' selected' : '') + '>Dr. ' + esc(d.fullName) + ' · ' + esc(t(d.specialty)) + '</option>').join('') + '</select></label>' : '') +
        (f.kind === 'FEEDBACK' ? '<div class="field"><span>' + esc(t('Ilovaga bahoingiz')) + '</span><div class="rate-input">' + [1, 2, 3, 4, 5].map((n) => '<button class="' + (n <= f.rating ? 'on' : '') + '" data-act="rate" data-v="' + n + '" aria-label="' + n + '">' + icon('star', 28, 1.8) + '</button>').join('') + '</div></div>' : '') +
        '<label class="field"><span>' + esc(t('Mavzu')) + '</span><input class="input" id="tsub" data-bind="form.subject" maxlength="160" value="' + esc(f.subject) + '" placeholder="' + esc(t({ SUPPORT: 'Masalan: retsept PDF ochilmayapti', COMPLAINT: 'Masalan: javob juda kech keldi', FEEDBACK: 'Masalan: tungi rejim juda qulay' }[f.kind])) + '"></label>' +
        '<label class="field"><span>' + esc(t('Batafsil')) + '</span><textarea class="input" id="tcontent" data-bind="form.content" maxlength="4000" style="min-height:120px">' + esc(f.content) + '</textarea></label>' +
        (s.error ? '<div class="alert err sm">' + esc(s.error) + '</div>' : '') +
        '<button class="btn btn-primary btn-lg" data-act="submit"' + (s.saving ? ' disabled' : '') + '>' + (s.saving ? spinner() : icon('send', 18) + esc(t('Yuborish'))) + '</button></div>' : '';
      const list = s.items === null ? skeletons(2) : !s.items.length ? '<p class="sm muted">' + esc(t('Hali murojaat yubormagansiz.')) + '</p>' : '<div class="list">' + s.items.map((x, i) => ticketRow(x, '#/support/' + x.id, i)).join('') + '</div>';
      return shell('<div class="col g20" style="max-width:900px">' + intro + form + sectionHead(t('Mening murojaatlarim')) + list + '</div>', { title: t('Yordam va shikoyat'), subtitle: esc(t('Administrator bilan bog‘lanish')), back: app.homeFor(session.user) });
    },
    bind(k, v) { if (k.startsWith('form.')) s.form[k.slice(5)] = v; },
    on: {
      new(el) { s.form = { kind: el.dataset.v, subject: '', content: '', aboutDoctorId: '', rating: 0 }; s.error = ''; app.render(); setTimeout(() => { const n = document.getElementById('tform'); if (n) n.scrollIntoView({ behavior: 'smooth' }); }, 30); },
      kind(el) { s.form.kind = el.dataset.v; app.render(); },
      rate(el) { s.form.rating = Number(el.dataset.v); app.render(); },
      cancel() { s.form = null; app.render(); },
      async submit() {
        s.saving = true; s.error = ''; app.render();
        try { const tk = await api('/tickets', { method: 'POST', body: { kind: s.form.kind, subject: s.form.subject, content: s.form.content, aboutDoctorId: s.form.aboutDoctorId || null, rating: s.form.rating || null } }); toast(t('Murojaat yuborildi. Administrator tez orada javob beradi')); go('#/support/' + tk.id); }
        catch (e) { s.error = errMsg(e); s.saving = false; app.render(); }
      }
    },
    async mount() { await load(); api('/doctors').then((d) => { s.doctors = d; app.render(); }).catch(() => {}); }
  };
}
export const supportDetail = (params) => ticketDetail(params, false);

/* ---------------- notifications page ---------------- */
export function notificationsView() {
  const s = { items: null };
  const load = async () => { const r = await api('/notifications?limit=200'); s.items = r.items; app.render(); if (r.unread) { await api('/notifications/read-all', { method: 'POST' }); notif.unread = 0; } };
  return {
    title: 'Bildirishnomalar',
    html() {
      const on = systemNotifications.enabled();
      const groups = {};
      for (const n of s.items || []) { const d = new Date(n.createdAt); const k = d.toDateString() === new Date().toDateString() ? t('Bugun') : fmtDate(n.createdAt).split(',')[0]; (groups[k] = groups[k] || []).push(n); }
      const body = s.items === null ? skeletons(3) : !s.items.length ? empty('bell', t('Hozircha bildirishnoma yo‘q')) : Object.entries(groups).map(([k, arr]) => sectionHead(k) + '<div class="list">' + arr.map((n, i) => '<button class="item notif-item' + (n.isRead ? '' : ' unread') + '" style="--d:' + i + '" data-act="go" data-to="' + esc(n.link || app.homeFor(session.user)) + '"><span class="nic' + (notifHot(n.type) ? ' hot' : '') + '">' + icon(notifIcon(n.type), 18) + '</span><span class="grow"><span class="sm b" style="display:block">' + esc(tServer(n.content)) + '</span><span class="xs faint">' + ago(n.createdAt) + '</span></span>' + icon('next', 16) + '</button>').join('') + '</div>').join('');
      return shell('<div class="col g20" style="max-width:820px"><div class="glass card row between"><div class="row nw" style="gap:12px"><span class="ic-soft">' + icon('bell', 20) + '</span><div><b>' + esc(t('Brauzer bildirishnomalari')) + '</b><div class="sm muted">' + esc(t('Yangi xabar, javob va eslatmalar telefon ekranida chiqadi')) + '</div></div></div><button class="switch" role="switch" aria-checked="' + on + '" data-act="sys" aria-label="' + esc(t('Brauzer bildirishnomalari')) + '"></button></div>' + body + '</div>',
        { title: t('Bildirishnomalar'), back: app.homeFor(session.user) });
    },
    on: { async sys() { if (systemNotifications.enabled()) systemNotifications.disable(); else if (!(await systemNotifications.enable())) toast(t('Brauzer ruxsat bermadi. Sozlamalardan bildirishnomalarga ruxsat bering'), 'err'); app.render(); } },
    mount: load
  };
}

/* ---------------- QR scanner (camera + image file) ---------------- */
// jsQR (Apache-2.0) is loaded on demand; BarcodeDetector is used when the browser has it.
let jsqrLoading = null;
const loadJsQR = () => jsqrLoading || (jsqrLoading = new Promise((res, rej) => { if (window.jsQR) return res(window.jsQR); const sc = document.createElement('script'); sc.src = '/vendor/jsQR.js'; sc.onload = () => res(window.jsQR); sc.onerror = () => { jsqrLoading = null; rej(new Error(t('Skaner kutubxonasi yuklanmadi'))); }; document.head.appendChild(sc); }));
/** Extracts the verify code from a scanned URL (…/#/verify/CODE) or plain text. */
export const codeFromScan = (text) => { const m = /verify\/([A-Za-z0-9-]{6,20})/.exec(text || ''); return (m ? m[1] : String(text || '').trim()).toUpperCase(); };

async function decodeCanvas(canvas) {
  if ('BarcodeDetector' in window) {
    try { const det = new window.BarcodeDetector({ formats: ['qr_code'] }); const r = await det.detect(canvas); if (r[0]) return r[0].rawValue; } catch { /* fall back to jsQR */ }
  }
  const jsQR = await loadJsQR();
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const r = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
  return r ? r.data : null;
}
export async function scanImageFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(t('Rasmni o‘qib bo‘lmadi'))); i.src = url; });
    const k = Math.min(1, 1200 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await decodeCanvas(c);
  } finally { URL.revokeObjectURL(url); }
}
/** Opens a full-screen camera scanner. Resolves with the decoded text or null. */
export function openScanner() {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.className = 'scanner-host';
    host.innerHTML = '<div class="scanner"><video playsinline muted></video><div class="scan-frame"><i></i><i></i><i></i><i></i><span class="scan-line"></span></div>' +
      '<div class="scanner-top"><b>' + esc(t('QR kodni ramkaga to‘g‘rilang')) + '</b><button class="icon-btn" aria-label="' + esc(t('Yopish')) + '">' + icon('x', 20) + '</button></div><div class="scanner-msg"></div></div>';
    document.body.appendChild(host);
    const video = host.querySelector('video'); const msg = host.querySelector('.scanner-msg');
    let stream = null, stopped = false;
    const canvas = document.createElement('canvas');
    const stop = (val) => { stopped = true; if (stream) stream.getTracks().forEach((tr) => tr.stop()); host.remove(); resolve(val); };
    host.querySelector('.icon-btn').addEventListener('click', () => stop(null));
    const onKey = (e) => { if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); stop(null); } };
    document.addEventListener('keydown', onKey);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { msg.textContent = t('Kamera faqat HTTPS orqali ishlaydi. QR kod rasmini yuklang yoki kodni qo‘lda kiriting.'); return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }).then(async (s) => {
      stream = s; video.srcObject = s; await video.play().catch(() => {});
      loadJsQR().catch(() => {});
      const tick = async () => {
        if (stopped) return;
        if (video.readyState >= 2 && video.videoWidth) {
          const k = Math.min(1, 720 / video.videoWidth);
          canvas.width = Math.round(video.videoWidth * k); canvas.height = Math.round(video.videoHeight * k);
          canvas.getContext('2d', { willReadFrequently: true }).drawImage(video, 0, 0, canvas.width, canvas.height);
          try { const r = await decodeCanvas(canvas); if (r) { if (navigator.vibrate) navigator.vibrate(80); document.removeEventListener('keydown', onKey); stop(r); return; } } catch { /* keep scanning */ }
        }
        setTimeout(tick, 220);
      };
      tick();
    }).catch((e) => { msg.textContent = e && e.name === 'NotAllowedError' ? t('Kameraga ruxsat berilmadi. Brauzer sozlamalaridan ruxsat bering.') : t('Kamerani ochib bo‘lmadi. QR kod rasmini yuklang yoki kodni qo‘lda kiriting.'); });
  });
}
