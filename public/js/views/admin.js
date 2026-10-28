import { esc, icon, app, api, go, toast, errMsg, fmtDate, fmtDay, fmtPhone, dayKey, skeletons, empty, openFile, downloadCsv, t, avatar, stars, spinner, session, confirmSheet, promptSheet, SEV_LABEL, sevPill, resetCatalog, paginate, pager, resizeImage } from '../core.js';
import { shell, sectionHead, ikat } from '../ui.js';
import { lineChart, barChart, donut, kpi } from '../charts.js';
import { securityCard, changePassword, photoBlock, photoActions, accountActions } from './patient.js';

const STATUS = { NEW: 'Yangi', AI_DRAFTED: 'AI qoralama tayyor', ASSIGNED: 'Shifokorda', DIAGNOSED: 'Tashxis qo‘yildi', CLOSED: 'Yopilgan', CANCELLED: 'Bekor qilingan' };
const DOC = { VERIFIED: ['Tasdiqlangan', 'ok'], PENDING: ['Kutilmoqda', 'warn'], BLOCKED: ['Bloklangan', 'err'] };
const KIND = { SUPPORT: ['Texnik yordam', 'help', 'info'], COMPLAINT: ['Shikoyat', 'flag', 'err'], FEEDBACK: ['Taklif va fikr', 'smile', 'ok'] };
const TST = { OPEN: ['Ochiq', 'warn'], ANSWERED: ['Javob berilgan', 'info'], CLOSED: ['Yopilgan', ''] };
const ROLE = { PATIENT: 'Bemor', DOCTOR: 'Shifokor', ADMIN: 'Admin' };
export { KIND, TST };

function adminPage(title, loader, render, extra = {}) {
  const s = { data: null, error: '', page: 1, ...extra.state };
  const load = async () => { try { s.data = await loader(s); s.error = ''; } catch (e) { s.error = errMsg(e); } app.render(); };
  return {
    title,
    html: () => shell(s.error ? '<div class="alert err">' + icon('alert') + '<div>' + esc(s.error) + '</div></div>' : s.data === null ? skeletons(4) : render(s), { title: t(title), subtitle: extra.subtitle ? esc(t(extra.subtitle)) : '' }),
    bind(k, v) { s[k] = v; if (extra.onBind) extra.onBind(k, v, s, load); },
    on: { page(el) { s.page = Number(el.dataset.v); app.render(); window.scrollTo(0, 0); }, ...(extra.actions ? Object.fromEntries(Object.entries(extra.actions).map(([k, fn]) => [k, (el, e) => fn(el, s, load, e)])) : {}) },
    mount: load
  };
}

/* ---------------- statistics ---------------- */
export const adminStats = () => adminPage('Statistika', () => api('/admin/stats'), (s) => {
  const d = s.data; const tt = d.totals; const sat = d.satisfaction;
  const aiTotal = ['APPROVED', 'MODIFIED', 'REJECTED'].reduce((a, k) => a + (d.ai[k] || 0), 0);
  const LV = { high: ['Muhim', 'err', 'alert'], medium: ['Diqqat', 'warn', 'alert'], low: ['Ma’lumot', 'info', 'info'] };
  const anomalies = '<div class="glass card col anomalies">' + sectionHead(t('Anomaliyalar va ogohlantirishlar'), '<span class="pill ' + (d.anomalies.some((a) => a.level === 'high') ? 'err' : d.anomalies.length ? 'warn' : 'ok') + '">' + d.anomalies.length + '</span>') +
    (d.anomalies.length ? d.anomalies.map((a, i) => '<a class="anomaly ' + a.level + '" style="--d:' + i + '" href="' + a.link + '"><span class="an-ic">' + icon(LV[a.level][2], 18) + '</span><span class="grow"><b class="sm">' + esc(t(a.title)) + '</b><span class="xs muted" style="display:block">' + esc(t(a.detail)) + '</span></span><span class="pill ' + LV[a.level][1] + '">' + esc(t(LV[a.level][0])) + '</span></a>').join('')
      : '<div class="calm">' + icon('shield', 22) + '<span class="sm">' + esc(t('Hammasi joyida — anomaliya topilmadi.')) + '</span></div>') + '</div>';
  const kpis = '<div class="grid g4 keep2">' + kpi(tt.consultations, t('Jami murojaatlar'), icon('chat', 18), 'tone-blue', '', '#/admin/queue') + kpi(tt.open, t('Hozir navbatda'), icon('list', 18), tt.open ? 'tone-amber' : '', '', '#/admin/queue?status=open') + kpi(tt.appointments, t('Klinikaga yozilishlar'), icon('calendar', 18), '', esc(t('bugun {n}', { n: tt.appointmentsToday }))) + kpi(tt.prescriptions, t('Retseptlar'), icon('qr', 18), '', esc(t('berilgan {n}', { n: tt.dispensed }))) +
    kpi(tt.patients, t('Bemorlar'), icon('users', 18), 'tone-mint') + kpi(tt.doctors, t('Faol shifokorlar'), icon('steth', 18), '', esc(t('onlayn {n}', { n: tt.onlineDoctors }))) + kpi(tt.pendingDoctors, t('Tekshiruvda'), icon('clock', 18), tt.pendingDoctors ? 'tone-amber' : '') + kpi(tt.openTickets, t('Ochiq murojaatlar'), icon('help', 18), tt.openTickets ? 'tone-coral' : '', esc(t('shikoyat (30 kun): {n}', { n: tt.complaints30 }))) + '</div>';
  const dl = d.daily30;
  const trend = '<div class="glass card col">' + sectionHead(t('So‘nggi 30 kun')) + lineChart({ labels: dl.consultations.map((x) => x.d), series: [{ label: 'Onlayn murojaatlar', color: 'var(--primary)', values: dl.consultations.map((x) => x.n) }, { label: 'Klinikadagi qabullar', color: 'var(--mint)', values: dl.appointments.map((x) => x.n) }], label: t('So‘nggi 30 kun') }) + '</div>';
  const regs = '<div class="glass card col">' + sectionHead(t('Ro‘yxatdan o‘tishlar')) + barChart({ labels: dl.patients.map((x) => x.d), series: [{ label: 'Bemorlar', color: 'var(--primary-2)', values: dl.patients.map((x) => x.n) }, { label: 'Shifokorlar', color: 'var(--amber)', values: dl.doctors.map((x) => x.n) }], stacked: true, height: 150, label: t('Ro‘yxatdan o‘tishlar') }) + '</div>';
  const appSat = (role) => { const x = sat.appByRole[role]; return '<div class="sat-row"><span class="sm">' + esc(t(role === 'PATIENT' ? 'Bemorlar ilovadan' : 'Shifokorlar ilovadan')) + '</span>' + (x ? '<span class="row nw" style="gap:6px">' + stars(x.avg, 14) + '<b>' + x.avg + '</b><span class="xs faint">(' + x.n + ')</span></span>' : '<span class="xs faint">' + esc(t('fikr yo‘q')) + '</span>') + '</div>'; };
  const satisfaction = '<div class="glass card col">' + sectionHead(t('Qoniqish darajasi')) +
    '<div class="sat-big"><div class="sat-face ' + (sat.doctorRating == null ? '' : sat.doctorRating >= 4 ? 'good' : sat.doctorRating >= 3 ? 'mid' : 'bad') + '">' + icon(sat.doctorRating != null && sat.doctorRating < 3 ? 'frown' : 'smile', 34) + '</div><div><b style="font-size:34px;line-height:1">' + (sat.doctorRating ?? '—') + '</b><div class="xs muted">' + esc(t('Bemorlarning shifokorlarga bahosi · {n} ta', { n: sat.reviews })) + '</div></div></div>' +
    '<div class="dist">' + [5, 4, 3, 2, 1].map((n) => { const c = sat.distribution[n - 1]; return '<div class="row nw sm" style="gap:8px"><span style="width:14px">' + n + '</span><div class="hbar grow"><i style="width:' + (100 * c / Math.max(1, sat.reviews)) + '%;background:' + (n >= 4 ? 'var(--mint)' : n === 3 ? 'var(--amber)' : 'var(--coral)') + '"></i></div><span class="faint" style="width:24px;text-align:right">' + c + '</span></div>'; }).join('') + '</div>' +
    '<div class="hr"></div>' + appSat('PATIENT') + appSat('DOCTOR') + '<div class="sat-row"><span class="sm">' + esc(t('Jami shikoyatlar')) + '</span><a class="b" href="#/admin/tickets">' + sat.complaints + '</a></div></div>';
  const sev = '<div class="glass card col">' + sectionHead(t('Xavf darajasi')) + donut([[SEV_LABEL.GREEN, d.bySeverity.GREEN || 0, 'var(--mint)'], [SEV_LABEL.YELLOW, d.bySeverity.YELLOW || 0, 'var(--amber)'], [SEV_LABEL.RED, d.bySeverity.RED || 0, 'var(--coral)']], { size: 130 }) + '</div>';
  const ai = '<div class="glass card col">' + sectionHead(t('AI qoralamalari')) + donut([['Tasdiqlandi', d.ai.APPROVED || 0, 'var(--mint)'], ['O‘zgartirildi', d.ai.MODIFIED || 0, 'var(--primary)'], ['Rad etildi', d.ai.REJECTED || 0, 'var(--coral)'], ['Kutilmoqda', d.ai.PENDING || 0, 'var(--ink-3)']], { size: 130, center: aiTotal ? Math.round(100 * (d.ai.APPROVED || 0) / aiTotal) + '%' : '—', sub: t('o‘zgarishsiz') }) + '</div>';
  const tick = '<div class="glass card col">' + sectionHead(t('Murojaatlar (yordam)')) + donut(Object.entries(KIND).map(([k, [l]]) => [l, d.tickets.byKind[k] || 0, { SUPPORT: 'var(--primary)', COMPLAINT: 'var(--coral)', FEEDBACK: 'var(--mint)' }[k]]), { size: 130 }) + '</div>';
  const specMax = Math.max(1, ...Object.values(d.bySpecialty));
  const spec = '<div class="glass card col">' + sectionHead(t('Mutaxassislik bo‘yicha')) + (Object.keys(d.bySpecialty).length ? Object.entries(d.bySpecialty).sort((a, b) => b[1] - a[1]).map(([k, n], i) => '<div class="hb-row" style="--d:' + i + '"><span class="sm">' + esc(t(k)) + '</span><div class="hbar"><i style="width:' + (100 * n / specMax) + '%;background:var(--grad)"></i></div><b class="sm">' + n + '</b></div>').join('') : '<p class="sm muted">' + esc(t('Ma’lumot yo‘q')) + '</p>') +
    '<div class="hr"></div>' + Object.entries(STATUS).map(([k, l]) => '<div class="row between sm"><span>' + esc(t(l)) + '</span><b>' + (d.byStatus[k] || 0) + '</b></div>').join('') + '</div>';
  const top = '<div class="glass card col">' + sectionHead(t('Eng faol shifokorlar')) + '<div class="table-wrap"><table class="t"><thead><tr><th>' + esc(t('Shifokor')) + '</th><th>' + esc(t('Onlayn')) + '</th><th>' + esc(t('Qabul')) + '</th><th>' + esc(t('Reyting')) + '</th><th>' + esc(t('Shikoyat')) + '</th></tr></thead><tbody>' +
    (d.topDoctors.length ? d.topDoctors.map((x) => '<tr><td><span class="row nw" style="gap:8px"><span class="dot-st ' + (x.online ? 'on' : '') + '"></span><b>' + esc(x.fullName) + '</b><span class="xs faint">' + esc(t(x.specialty)) + '</span></span></td><td>' + x.diagnoses + '</td><td>' + x.visits + '</td><td class="nowrap">' + (x.rating ? x.rating + ' ★ <span class="xs faint">(' + x.reviews + ')</span>' : '—') + '</td><td>' + (x.complaints ? '<span class="pill err">' + x.complaints + '</span>' : '0') + '</td></tr>').join('') : '<tr><td colspan="5" class="muted">' + esc(t('Ma’lumot yo‘q')) + '</td></tr>') + '</tbody></table></div></div>';
  return '<div class="col g20">' +
    (!d.aiConfigured ? '<div class="alert info">' + icon('spark') + '<div>' + esc(t('AI kaliti sozlanmagan — qoralamalar tibbiy qoidalar asosida tayyorlanmoqda. Claude’ni ulash uchun serverda ANTHROPIC_API_KEY ni bering.')) + '</div></div>' : '') +
    anomalies + kpis + '<div class="grid g2" style="align-items:start">' + trend + satisfaction + '</div>' + '<div class="grid g3" style="align-items:start">' + sev + ai + tick + '</div>' + '<div class="grid g2" style="align-items:start">' + regs + spec + '</div>' + top + '</div>';
}, { subtitle: 'Platforma ko‘rsatkichlari, anomaliyalar va qoniqish' });

/* ---------------- live queue ---------------- */
function fmtWait(ms) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
  return (hh ? hh + ':' + String(mm).padStart(2, '0') : String(mm)) + ':' + String(ss).padStart(2, '0');
}
export function adminQueue(params) {
  const q = (params && params.query) || new URLSearchParams();
  const s = { items: null, error: '', filter: q.get('status') === 'open' ? 'open' : 'all' };
  let poll = null;
  const load = async () => { try { s.items = await api('/admin/queue' + (s.filter === 'open' ? '?status=open' : '')); s.error = ''; } catch (e) { s.error = errMsg(e); } app.render(); };
  return {
    title: 'Navbat',
    html() {
      const body = s.error ? '<div class="alert err">' + icon('alert') + '<div>' + esc(s.error) + '</div></div>' : s.items === null ? skeletons(4) :
        '<div class="col g16"><div class="seg">' + [['open', 'Hozir navbatda'], ['all', 'Hammasi']].map(([v, l]) => '<button data-act="filter" data-v="' + v + '" aria-pressed="' + (s.filter === v) + '">' + esc(t(l)) + '</button>').join('') + '</div>' +
        (s.items.length ? '<div class="glass card col g2">' + s.items.map((x) => {
          const waitMs = x.open ? Date.now() - x.createdAt : x.waitedMs;
          const urgent = x.open && x.severity === 'RED';
          return '<div class="item queue-row' + (urgent ? ' urgent' : '') + '"><span class="tk-ic ' + (x.severity === 'RED' ? 'err' : x.severity === 'YELLOW' ? 'warn' : 'info') + '">' + icon(x.open ? 'clock' : 'check', 18) + '</span>' +
            '<span class="grow col" style="gap:2px"><span class="row between nw" style="gap:8px"><b class="ellipsis">' + esc(x.patientName) + '</b>' + sevPill(x.severity) + '</span>' +
            '<span class="sm muted ellipsis">' + esc(t(x.specialty)) + ' · ' + (x.doctorName ? 'Dr. ' + esc(x.doctorName) : esc(t('shifokor tayinlanmagan'))) + ' · ' + esc(t(STATUS[x.status])) + '</span>' +
            '<span class="xs faint">' + esc(t('Navbatga yozildi:')) + ' ' + fmtDate(x.createdAt) + '</span></span>' +
            '<span class="col" style="align-items:flex-end;gap:2px"><b class="nowrap mono' + (urgent ? ' urgent-time' : '') + '">' + fmtWait(waitMs) + '</b><span class="xs faint">' + esc(t(x.open ? 'kutmoqda' : 'yakunlangan')) + '</span></span></div>';
        }).join('') + '</div>' : empty('clock', t('Navbat bo‘sh')));
      return shell(body, { title: t('Navbat'), subtitle: esc(t('Har bir murojaatning kutish vaqti, soniyagacha')), back: '#/admin' });
    },
    on: { filter(el) { s.filter = el.dataset.v; s.items = null; app.render(); load(); } },
    async mount() { await load(); poll = setInterval(() => app.render(), 1000); },
    unmount() { clearInterval(poll); }
  };
}

/* ---------------- doctors ---------------- */
export const adminDoctors = () => adminPage('Shifokorlar', () => api('/admin/doctors'), (s) => {
  if (!s.data.length) return empty('steth', t('Shifokorlar yo‘q'));
  const pg = paginate(s.filter ? s.data.filter((d) => d.status === s.filter) : s.data, s.page, 15); const list = pg.items;
  return '<div class="col"><div class="seg">' + [['', 'Barchasi'], ['PENDING', 'Kutilmoqda'], ['VERIFIED', 'Tasdiqlangan'], ['BLOCKED', 'Bloklangan']].map(([v, l]) => '<button data-act="filter" data-v="' + v + '" aria-pressed="' + ((s.filter || '') === v) + '">' + esc(t(l)) + ' <span class="faint">' + (v ? s.data.filter((d) => d.status === v).length : s.data.length) + '</span></button>').join('') + '</div>' +
    '<div class="glass card"><div class="table-wrap"><table class="t"><thead><tr><th>' + esc(t('Shifokor')) + '</th><th>' + esc(t('Mutaxassislik')) + '</th><th>' + esc(t('Litsenziya')) + '</th><th>' + esc(t('Klinika')) + '</th><th>' + esc(t('Reyting')) + '</th><th>' + esc(t('Holat')) + '</th><th></th></tr></thead><tbody>' +
    list.map((d) => '<tr><td><span class="row nw" style="gap:10px">' + avatar({ id: d.id, fullName: d.fullName, photo: d.photo }, { size: 36 }) + '<span><b>' + esc(d.fullName) + '</b><div class="xs faint">' + fmtPhone(d.phone) + ' · ' + fmtDay(d.createdAt) + '</div></span></span></td><td>' + esc(t(d.specialty)) + '<div class="xs faint">' + esc(t('{n} yil', { n: d.experienceYears })) + '</div></td>' +
      '<td><span class="b">' + esc(d.licenseNumber) + '</span>' + (d.licenseFileId ? '<br><button class="btn btn-ghost btn-sm" style="padding:0;min-height:28px" data-act="lic" data-id="' + d.licenseFileId + '">' + icon('eye', 15) + esc(t('Nusxani ko‘rish')) + '</button>' : '<div class="xs faint">' + esc(t('nusxa yuklanmagan')) + '</div>') + '</td>' +
      '<td class="sm">' + esc(d.clinicName || '—') + '<div class="xs faint">' + esc(d.clinicAddress || '') + '</div></td><td class="nowrap">' + (d.rating ? d.rating + ' ★' : '—') + '</td>' +
      '<td><span class="pill ' + DOC[d.status][1] + '">' + esc(t(DOC[d.status][0])) + '</span>' + (d.note ? '<div class="xs faint">' + esc(d.note) + '</div>' : '') + '</td>' +
      '<td><div class="row end nw">' + (d.status !== 'VERIFIED' ? '<button class="btn btn-mint btn-sm" data-act="setStatus" data-id="' + d.id + '" data-v="VERIFIED">' + esc(t('Tasdiqlash')) + '</button>' : '') + (d.status !== 'BLOCKED' ? '<button class="btn btn-danger btn-sm" data-act="setStatus" data-id="' + d.id + '" data-v="BLOCKED">' + esc(t('Bloklash')) + '</button>' : '') + '</div></td></tr>').join('') +
    '</tbody></table></div></div>' + pager(pg) + '<p class="sm muted">' + esc(t('Tasdiqlanmagan shifokor navbatni ko‘rmaydi, tashxis qo‘ya olmaydi va bemorlar ro‘yxatida chiqmaydi.')) + '</p></div>';
}, {
  subtitle: 'Litsenziyalarni tekshirish', state: { filter: '' },
  actions: {
    filter(el, s) { s.filter = el.dataset.v; s.page = 1; app.render(); },
    async setStatus(el, s, load) {
      let note = '';
      if (el.dataset.v === 'BLOCKED') { const r = await promptSheet({ title: t('Shifokorni bloklash'), label: t('Bloklash sababi (shifokorga ko‘rinadi)'), ok: t('Bloklash'), min: 3, danger: true }); if (r === null) return; note = r; }
      await api('/admin/doctors/' + el.dataset.id, { method: 'PATCH', body: { status: el.dataset.v, note } });
      toast(t(el.dataset.v === 'VERIFIED' ? 'Shifokor tasdiqlandi' : 'Shifokor bloklandi')); await load();
    },
    async lic(el) { await openFile('/attachments/' + el.dataset.id); }
  }
});

/* ---------------- users ---------------- */
export const adminUsers = () => {
  let tm = null;
  return adminPage('Foydalanuvchilar', (s) => api('/admin/users?q=' + encodeURIComponent(s.q || '') + (s.role ? '&role=' + s.role : '')), (s) =>
    '<div class="col"><div class="row"><div class="input-group grow" style="max-width:420px"><span class="prefix">' + icon('search', 18) + '</span><input class="input" type="search" id="q" data-bind="q" placeholder="' + esc(t('Ism yoki telefon')) + '" value="' + esc(s.q || '') + '"></div>' +
    '<div class="seg">' + [['', 'Barchasi'], ['PATIENT', 'Bemorlar'], ['DOCTOR', 'Shifokorlar'], ['ADMIN', 'Adminlar']].map(([v, l]) => '<button data-act="role" data-v="' + v + '" aria-pressed="' + ((s.role || '') === v) + '">' + esc(t(l)) + '</button>').join('') + '</div></div>' +
    '<div class="glass card"><div class="table-wrap"><table class="t"><thead><tr><th>' + esc(t('Ism')) + '</th><th>' + esc(t('Telefon')) + '</th><th>' + esc(t('Rol')) + '</th><th>' + esc(t('Ro‘yxatdan o‘tgan')) + '</th><th>' + esc(t('Faol')) + '</th></tr></thead><tbody>' +
    (s.data.length ? paginate(s.data, s.page, 20).items.map((u) => '<tr><td><span class="row nw" style="gap:10px">' + avatar({ id: u.id, fullName: u.fullName, photo: u.photo }, { size: 32, private: u.role === 'PATIENT' }) + '<b>' + esc(u.fullName) + '</b></span></td><td class="nowrap">' + fmtPhone(u.phone) + '</td><td>' + esc(t(ROLE[u.role])) + '</td><td>' + fmtDay(u.createdAt) + '</td><td><button class="switch" role="switch" aria-checked="' + u.isActive + '" aria-label="' + esc(u.fullName) + '" data-act="toggle" data-id="' + u.id + '" data-v="' + u.isActive + '"></button></td></tr>').join('') : '<tr><td colspan="5" class="muted">' + esc(t('Topilmadi')) + '</td></tr>') +
    '</tbody></table></div></div>' + pager(paginate(s.data, s.page, 20)) + '</div>', {
    subtitle: 'Akkauntlarni boshqarish', state: { q: '', role: '' },
    onBind(k, v, s, load) { if (k === 'q') { s.page = 1; clearTimeout(tm); tm = setTimeout(load, 300); } },
    actions: {
      async role(el, s, load) { s.role = el.dataset.v; s.page = 1; await load(); },
      async toggle(el, s, load) {
        const off = el.dataset.v === 'true';
        if (off && !(await confirmSheet({ title: t('Akkauntni o‘chirasizmi?'), text: t('Foydalanuvchi tizimdan chiqariladi va kira olmaydi.'), ok: t('O‘chirish'), danger: true }))) return;
        await api('/admin/users/' + el.dataset.id, { method: 'PATCH', body: { isActive: !off } }); toast(t('Saqlandi')); await load();
      }
    }
  });
};

/* ---------------- medicines ---------------- */
const EMPTY_MED = { code: '', name: '', form: 'tabletka', strength: '', mg: '', unitDose: '', std: '', maxDaily: '', minAge: '0', preg: false, contraKeys: '', allergyKeys: '', se: '', ci: '', ai: false, photo: null };
const medPhotoUrl = (id, v) => '/api/v1/medicines/' + id + '/photo?v=' + v;
export const adminMedicines = () => adminPage('Dorilar va AI', () => api('/admin/medicines'), (s) => {
  const f = s.form;
  const form = f ? '<div class="glass card lg col g12 med-form" id="medform"><div class="row between"><h3>' + esc(t(f.id ? 'Dorini tahrirlash' : 'Yangi dori qo‘shish')) + ikat() + '</h3><button class="btn btn-ghost btn-sm" data-act="close">' + esc(t('Yopish')) + '</button></div>' +
    '<div class="grid g3">' + (f.id ? '' : '<label class="field"><span>' + esc(t('Kod (lotin, katta harf)')) + '</span><input class="input" id="m-code" data-bind="form.code" value="' + esc(f.code) + '" placeholder="NIMESULIDE_100"></label>') +
    '<label class="field"><span>' + esc(t('Nomi')) + '</span><input class="input" id="m-name" data-bind="form.name" value="' + esc(f.name) + '"></label>' +
    '<label class="field"><span>' + esc(t('Shakli')) + '</span><select class="input" id="m-form" data-bind="form.form">' + ['tabletka', 'kapsula', 'sirop', 'eritma', 'gel', 'malham', 'kukun', 'tomchi', 'sprey', 'ukol'].map((x) => '<option value="' + x + '"' + (f.form === x ? ' selected' : '') + '>' + esc(t(x)) + '</option>').join('') + '</select></label>' +
    '<label class="field"><span>' + esc(t('Kuchi (masalan 500 mg)')) + '</span><input class="input" id="m-str" data-bind="form.strength" value="' + esc(f.strength) + '"></label>' +
    '<label class="field"><span>' + esc(t('Bir dona, mg (tabletka uchun)')) + '</span><input class="input" id="m-mg" data-bind="form.mg" inputmode="decimal" value="' + esc(f.mg) + '"></label>' +
    '<label class="field"><span>' + esc(t('Maks. sutkalik doza, mg')) + '</span><input class="input" id="m-max" data-bind="form.maxDaily" inputmode="decimal" value="' + esc(f.maxDaily) + '"></label>' +
    '<label class="field"><span>' + esc(t('Bir martalik miqdor (mg bo‘lmasa)')) + '</span><input class="input" id="m-unit" data-bind="form.unitDose" value="' + esc(f.unitDose) + '" placeholder="' + esc(t('masalan: 1 paket')) + '"></label>' +
    '<label class="field"><span>' + esc(t('Minimal yosh')) + '</span><input class="input" id="m-age" data-bind="form.minAge" inputmode="numeric" value="' + esc(f.minAge) + '"></label></div>' +
    (f.id ? '<div class="field"><span>' + esc(t('Dori rasmi')) + '</span><div class="row nw" style="gap:12px;align-items:center">' +
      (f.photo ? '<img src="' + medPhotoUrl(f.id, f.photo) + '" alt="" class="med-photo-thumb">' : '<span class="med-photo-thumb empty">' + icon('pill', 24) + '</span>') +
      '<div class="row" style="gap:6px">' + (f.photoBusy ? spinner() : '<label class="btn btn-ghost btn-sm" style="cursor:pointer">' + icon('camera', 16) + esc(t(f.photo ? 'Almashtirish' : 'Rasm yuklash')) + '<input type="file" class="sr" data-file="medPhoto" accept="image/jpeg,image/png"></label>' +
      (f.photo ? '<button class="btn btn-ghost btn-sm" data-act="medPhotoDel">' + icon('trash', 16) + esc(t('O‘chirish')) + '</button>' : '')) + '</div></div></div>'
      : '<p class="sm muted">' + esc(t('Rasm qo‘yish uchun avval dorini saqlang')) + '</p>') +
    '<label class="field"><span>' + esc(t('Standart doza')) + '</span><input class="input" id="m-std" data-bind="form.std" value="' + esc(f.std) + '" placeholder="' + esc(t('500 mg, kuniga 3 marta')) + '"></label>' +
    '<div class="grid g2"><label class="field"><span>' + esc(t('Allergiya kalit so‘zlari (vergul bilan)')) + '</span><input class="input" id="m-al" data-bind="form.allergyKeys" value="' + esc(f.allergyKeys) + '"><small>' + esc(t('Bemor allergiyasida shu so‘z bo‘lsa, dori bloklanadi')) + '</small></label>' +
    '<label class="field"><span>' + esc(t('Zid kasalliklar kalitlari (vergul bilan)')) + '</span><input class="input" id="m-ck" data-bind="form.contraKeys" value="' + esc(f.contraKeys) + '"></label>' +
    '<label class="field"><span>' + esc(t('Nojo‘ya ta’sirlar (vergul bilan)')) + '</span><input class="input" id="m-se" data-bind="form.se" value="' + esc(f.se) + '"></label>' +
    '<label class="field"><span>' + esc(t('Qarshi ko‘rsatmalar (vergul bilan)')) + '</span><input class="input" id="m-ci" data-bind="form.ci" value="' + esc(f.ci) + '"></label></div>' +
    '<div class="row"><label class="check"><input type="checkbox" data-bind="form.preg"' + (f.preg ? ' checked' : '') + '>' + esc(t('Homiladorlikda mumkin')) + '</label><label class="check"><input type="checkbox" data-bind="form.ai"' + (f.ai ? ' checked' : '') + '>' + esc(t('AI tavsiya qila oladi')) + '</label></div>' +
    (s.formErr ? '<div class="alert err sm">' + icon('alert', 18) + '<div>' + esc(s.formErr) + '</div></div>' : '') +
    '<button class="btn btn-primary btn-lg" data-act="saveMed"' + (s.saving ? ' disabled' : '') + '>' + (s.saving ? spinner() : icon('check', 18, 2.6) + esc(t('Saqlash'))) + '</button></div>' : '';
  const q = (s.q || '').toLowerCase();
  const rows = s.data.filter((m) => !q || (m.name + ' ' + m.code).toLowerCase().includes(q));
  return '<div class="col g20"><div class="alert warn">' + icon('alert') + '<div>' + esc(t('Namunaviy dozalar. Ishga tushirishdan oldin rasmiy yo‘riqnoma bilan tekshiring. Antibiotiklar AI uchun yopiq bo‘lishi tavsiya etiladi.')) + '</div></div>' + form +
    '<div class="row between"><div class="input-group" style="max-width:360px;flex:1"><span class="prefix">' + icon('search', 18) + '</span><input class="input" type="search" id="mq" data-bind="q" placeholder="' + esc(t('Dori nomi')) + '" value="' + esc(s.q || '') + '"></div>' + (f ? '' : '<button class="btn btn-primary" data-act="add">' + icon('plus', 18) + esc(t('Yangi dori qo‘shish')) + '</button>') + '</div>' +
    '<div class="glass card"><div class="table-wrap"><table class="t"><thead><tr><th>' + esc(t('Dori')) + '</th><th>' + esc(t('Standart doza')) + '</th><th>' + esc(t('Maks. sutkalik')) + '</th><th>' + esc(t('Yosh')) + '</th><th>' + esc(t('Homiladorlik')) + '</th><th>' + esc(t('AI tavsiya qila oladi')) + '</th><th>' + esc(t('Faol')) + '</th><th></th></tr></thead><tbody>' +
    rows.map((m) => '<tr><td><span class="row nw" style="gap:10px">' + (m.photo ? '<img src="' + medPhotoUrl(m.id, m.photo) + '" alt="" class="med-photo-thumb sm">' : '<span class="med-photo-thumb empty sm">' + icon('pill', 16) + '</span>') + '<span><b>' + esc(m.name) + '</b><div class="xs faint">' + esc(t(m.form) + ' · ' + m.strength) + ' · ' + esc(m.code) + '</div></span></span></td><td class="sm">' + esc(m.std) + '</td><td>' + (m.maxDaily ? m.maxDaily + ' mg' : '—') + '</td><td>' + m.minAge + '+</td><td>' + (m.preg ? '<span class="pill ok">' + esc(t('Mumkin')) + '</span>' : '<span class="pill err">' + esc(t('Yo‘q')) + '</span>') + '</td>' +
      '<td><button class="switch" role="switch" aria-checked="' + m.ai + '" aria-label="' + esc(m.name) + ' AI" data-act="ai" data-id="' + m.id + '" data-v="' + m.ai + '"></button></td>' +
      '<td><button class="switch" role="switch" aria-checked="' + m.active + '" aria-label="' + esc(m.name) + '" data-act="active" data-id="' + m.id + '" data-v="' + m.active + '"></button></td><td><button class="icon-btn" data-act="edit" data-id="' + m.id + '" aria-label="' + esc(t('Tahrirlash')) + '">' + icon('edit', 16) + '</button></td></tr>').join('') +
    '</tbody></table></div></div></div>';
}, {
  subtitle: 'Formulyar va AI ruxsatlari', state: { form: null, formErr: '', saving: false, q: '' },
  onBind(k, v, s) { if (k.startsWith('form.')) s.form[k.slice(5)] = v; else if (k === 'q') app.queue(); },
  actions: {
    add(el, s) { s.form = { ...EMPTY_MED }; s.formErr = ''; app.render(); setTimeout(() => { const n = document.getElementById('medform'); if (n) n.scrollIntoView({ behavior: 'smooth' }); }, 30); },
    edit(el, s) { const m = s.data.find((x) => x.id === Number(el.dataset.id)); s.form = { id: m.id, code: m.code, name: m.name, form: m.form, strength: m.strength, mg: m.mg ?? '', unitDose: m.unitDose || '', std: m.std, maxDaily: m.maxDaily ?? '', minAge: String(m.minAge), preg: m.preg, contraKeys: m.contraKeys.join(', '), allergyKeys: m.allergyKeys.join(', '), se: m.se.join(', '), ci: m.ci.join(', '), ai: m.ai, photo: m.photo }; s.formErr = ''; app.render(); setTimeout(() => { const n = document.getElementById('medform'); if (n) n.scrollIntoView({ behavior: 'smooth' }); }, 30); },
    close(el, s) { s.form = null; app.render(); },
    async saveMed(el, s, load) {
      s.saving = true; s.formErr = ''; app.render();
      try {
        const f = s.form;
        if (f.id) await api('/admin/medicines/' + f.id, { method: 'PUT', body: f }); else await api('/admin/medicines', { method: 'POST', body: f });
        toast(t(f.id ? 'Dori yangilandi' : 'Yangi dori qo‘shildi')); s.form = null; resetCatalog(); await load();
      } catch (e) { s.formErr = errMsg(e); }
      s.saving = false; app.render();
    },
    async ai(el, s, load) { await api('/admin/medicines/' + el.dataset.id, { method: 'PATCH', body: { aiAllowed: el.dataset.v !== 'true' } }); toast(t('Saqlandi')); resetCatalog(); await load(); },
    async active(el, s, load) { await api('/admin/medicines/' + el.dataset.id, { method: 'PATCH', body: { isActive: el.dataset.v !== 'true' } }); toast(t('Saqlandi')); resetCatalog(); await load(); },
    async medPhoto(el, s, load) {
      const file = el.files && el.files[0]; el.value = '';
      if (!file || !s.form) return;
      if (!/^image\/(jpeg|png)$/.test(file.type)) { toast(t('Rasm jpg yoki png bo‘lishi kerak'), 'err'); return; }
      s.form.photoBusy = true; app.render();
      try {
        const blob = await resizeImage(file);
        const m = await api('/admin/medicines/' + s.form.id + '/photo', { method: 'POST', raw: blob, headers: { 'content-type': 'image/jpeg' } });
        s.form.photo = m.photo; toast(t('Rasm yangilandi')); resetCatalog(); await load();
      } finally { s.form.photoBusy = false; app.render(); }
    },
    async medPhotoDel(el, s, load) {
      if (!s.form || !(await confirmSheet({ title: t('Rasmni o‘chirasizmi?'), ok: t('O‘chirish'), danger: true }))) return;
      const m = await api('/admin/medicines/' + s.form.id + '/photo', { method: 'DELETE' });
      s.form.photo = m.photo; toast(t('Rasm o‘chirildi')); resetCatalog(); await load();
    }
  }
});

/* ---------------- reviews ---------------- */
export const adminReviews = () => adminPage('Baholar va fikrlar', (s) => api('/admin/reviews' + (s.low ? '?filter=low' : '')), (s) => {
  const avg = s.data.length ? (s.data.reduce((a, r) => a + r.rating, 0) / s.data.length).toFixed(1) : '—';
  return '<div class="col"><div class="row between"><div class="seg"><button data-act="low" data-v="0" aria-pressed="' + !s.low + '">' + esc(t('Barchasi')) + '</button><button data-act="low" data-v="1" aria-pressed="' + !!s.low + '">' + icon('frown', 14) + esc(t('Past baholar (1–2)')) + '</button></div><span class="sm muted">' + esc(t('O‘rtacha: {a} · {n} ta', { a: avg, n: s.data.length })) + '</span></div>' +
    (s.data.length ? '<div class="col">' + paginate(s.data, s.page, 15).items.map((r, i) => '<article class="glass card col review-admin' + (r.rating <= 2 ? ' low' : '') + (r.hidden ? ' hidden-r' : '') + '" style="--d:' + i + '"><div class="row between nw"><span class="sm"><b>' + esc(r.patient) + '</b> → <b>Dr. ' + esc(r.doctor) + '</b></span>' + stars(r.rating, 15) + '</div>' + (r.comment ? '<p>' + esc(r.comment) + '</p>' : '<p class="sm faint">' + esc(t('Izohsiz')) + '</p>') +
      '<div class="row between"><span class="xs faint">' + fmtDate(r.createdAt) + '</span><button class="btn btn-ghost btn-sm" data-act="hide" data-id="' + r.id + '" data-v="' + !r.hidden + '">' + icon(r.hidden ? 'eye' : 'eyeOff', 15) + esc(t(r.hidden ? 'Ko‘rsatish' : 'Yashirish')) + '</button></div></article>').join('') + '</div>' + pager(paginate(s.data, s.page, 15)) : empty('star', t('Baholar yo‘q'))) + '</div>';
}, {
  subtitle: 'Bemorlar shifokorlardan qanchalik rozi', state: { low: false },
  actions: {
    async low(el, s, load) { s.low = el.dataset.v === '1'; s.page = 1; await load(); },
    async hide(el, s, load) { await api('/admin/reviews/' + el.dataset.id, { method: 'PATCH', body: { hidden: el.dataset.v === 'true' } }); toast(t('Saqlandi')); await load(); }
  }
});

/* ---------------- tickets (support, complaints, feedback) ---------------- */
export const adminTickets = () => adminPage('Murojaat va shikoyatlar', (s) => api('/admin/tickets?' + (s.status ? 'status=' + s.status : '') + (s.kind ? '&kind=' + s.kind : '')), (s) =>
  '<div class="col"><div class="row"><div class="seg">' + [['', 'Barchasi'], ['OPEN', 'Ochiq'], ['ANSWERED', 'Javob berilgan'], ['CLOSED', 'Yopilgan']].map(([v, l]) => '<button data-act="st" data-v="' + v + '" aria-pressed="' + ((s.status || '') === v) + '">' + esc(t(l)) + '</button>').join('') + '</div>' +
  '<div class="seg">' + [['', 'Hammasi'], ['SUPPORT', 'Texnik yordam'], ['COMPLAINT', 'Shikoyat'], ['FEEDBACK', 'Taklif va fikr']].map(([v, l]) => '<button data-act="kind" data-v="' + v + '" aria-pressed="' + ((s.kind || '') === v) + '">' + esc(t(l)) + '</button>').join('') + '</div></div>' +
  (s.data.length ? '<div class="list">' + paginate(s.data, s.page, 15).items.map((x, i) => ticketRow(x, '#/admin/tickets/' + x.id, i, true)).join('') + '</div>' + pager(paginate(s.data, s.page, 15)) : empty('help', t('Murojaat yo‘q'))) + '</div>', {
  subtitle: 'Texnik yordam, shikoyatlar va takliflar', state: { status: 'OPEN', kind: '' },
  actions: { async st(el, s, load) { s.status = el.dataset.v; s.page = 1; await load(); }, async kind(el, s, load) { s.kind = el.dataset.v; s.page = 1; await load(); } }
});
export function ticketRow(x, href, i = 0, admin = false) {
  const k = KIND[x.kind];
  return '<button class="item ticket-row" style="--d:' + i + '" data-act="go" data-to="' + href + '"><span class="tk-ic ' + k[2] + '">' + icon(k[1], 18) + '</span><span class="grow col" style="gap:2px"><span class="row between nw"><b class="ellipsis">' + esc(x.subject) + '</b><span class="pill ' + TST[x.status][1] + '">' + esc(t(TST[x.status][0])) + '</span></span>' +
    '<span class="sm muted ellipsis">' + esc(x.lastMessage) + '</span><span class="xs faint">' + esc(t(k[0])) + (admin ? ' · ' + esc(x.user.fullName) + ' (' + esc(t(ROLE[x.user.role])) + ')' : '') + (x.aboutDoctor ? ' · Dr. ' + esc(x.aboutDoctor.fullName) : '') + (x.rating ? ' · ' + x.rating + '★' : '') + ' · ' + fmtDate(x.updatedAt) + '</span></span></button>';
}
export function ticketThread(tk, s, admin) {
  return '<div class="glass card col"><div class="row between nw top"><div class="col g6"><span class="pill ' + KIND[tk.kind][2] + '" style="align-self:flex-start">' + icon(KIND[tk.kind][1], 13) + esc(t(KIND[tk.kind][0])) + '</span><h2 style="font-size:22px">' + esc(tk.subject) + '</h2>' +
    '<span class="sm muted">' + (admin ? esc(tk.user.fullName) + ' · ' + esc(t(ROLE[tk.user.role])) + ' · ' + fmtPhone(tk.user.phone) + ' · ' : '') + fmtDate(tk.createdAt) + (tk.aboutDoctor ? ' · ' + esc(t('Shifokor:')) + ' Dr. ' + esc(tk.aboutDoctor.fullName) : '') + (tk.rating ? ' · ' + esc(t('Baho:')) + ' ' + tk.rating + '/5' : '') + '</span></div><span class="pill ' + TST[tk.status][1] + '">' + esc(t(TST[tk.status][0])) + '</span></div>' +
    '<div class="chat" id="tchat" data-keep-scroll>' + tk.messages.map((m) => '<div class="bubble ' + ((admin ? m.senderRole === 'ADMIN' : m.senderRole !== 'ADMIN') ? 'me' : '') + '">' + esc(m.content) + '<small>' + (m.senderRole === 'ADMIN' ? esc(t('Administrator')) : esc(m.senderName)) + ' · ' + fmtDate(m.createdAt) + '</small></div>').join('') + '</div>' +
    (tk.status !== 'CLOSED' ? '<div class="composer"><textarea class="input" id="treply" data-bind="reply" rows="2" placeholder="' + esc(t(admin ? 'Javob yozing…' : 'Xabar yozing…')) + '">' + esc(s.reply) + '</textarea><button class="btn btn-primary" data-act="reply"' + (s.sending ? ' disabled' : '') + ' aria-label="' + esc(t('Yuborish')) + '">' + (s.sending ? spinner() : icon('send', 18)) + '</button></div>' : '<p class="sm muted">' + esc(t('Murojaat yopilgan.')) + '</p>') +
    '<div class="row end">' + (tk.status !== 'CLOSED' ? '<button class="btn btn-ghost btn-sm" data-act="setTs" data-v="CLOSED">' + icon('check', 16) + esc(t('Murojaatni yopish')) + '</button>' : admin ? '<button class="btn btn-ghost btn-sm" data-act="setTs" data-v="OPEN">' + icon('refresh', 16) + esc(t('Qayta ochish')) + '</button>' : '') + '</div></div>';
}
export function ticketDetail(params, admin) {
  const s = { tk: null, reply: '', sending: false, error: '' };
  const back = admin ? '#/admin/tickets' : '#/support';
  const load = async () => { const tk = await api('/tickets/' + params.id); if (JSON.stringify(tk) !== JSON.stringify(s.tk)) { s.tk = tk; app.render(); } };
  let poll = null;
  return {
    title: 'Murojaat',
    html() { return shell('<div class="col g20" style="max-width:820px">' + (s.error ? '<div class="alert err">' + esc(s.error) + '</div>' : !s.tk ? skeletons(2) : ticketThread(s.tk, s, admin)) + '</div>', { title: t('Murojaat') + ' #' + params.id, back, active: back }); },
    bind(k, v) { s[k] = v; },
    on: {
      async reply() { const v = s.reply.trim(); if (!v) return; s.sending = true; app.render(); try { s.tk = await api('/tickets/' + params.id + '/messages', { method: 'POST', body: { content: v } }); s.reply = ''; toast(t('Yuborildi')); } finally { s.sending = false; app.render(); } },
      async setTs(el) { s.tk = await api('/tickets/' + params.id, { method: 'PATCH', body: { status: el.dataset.v } }); toast(t('Saqlandi')); app.render(); }
    },
    async mount() { try { await load(); } catch (e) { s.error = errMsg(e); app.render(); } poll = setInterval(() => load().catch(() => {}), 15000); },
    unmount() { clearInterval(poll); }
  };
}

/* ---------------- reports ---------------- */
export function adminReports() {
  const s = { from: dayKey(Date.now() - 29 * 86400000), to: dayKey(Date.now()), rep: null, loading: false, error: '' };
  return {
    title: 'Hisobotlar',
    html() {
      const r = s.rep;
      const presets = [['7 kun', 6], ['30 kun', 29], ['90 kun', 89], ['1 yil', 364]];
      const form = '<div class="glass card col"><div class="row"><label class="field"><span>' + esc(t('Dan')) + '</span><input class="input" type="date" id="afrom" data-bind="from" max="' + dayKey(Date.now()) + '" value="' + s.from + '"></label><label class="field"><span>' + esc(t('Gacha')) + '</span><input class="input" type="date" id="ato" data-bind="to" min="' + s.from + '" max="' + dayKey(Date.now()) + '" value="' + s.to + '"></label>' +
        '<button class="btn btn-primary" style="align-self:flex-end" data-act="run"' + (s.loading ? ' disabled' : '') + '>' + (s.loading ? spinner() : icon('file', 18) + esc(t('Hisobotni tayyorlash'))) + '</button></div><div class="row" style="gap:6px">' + presets.map(([l, n]) => '<button class="chip" data-act="preset" data-v="' + n + '">' + esc(t(l)) + '</button>').join('') + '</div></div>';
      let body = '';
      if (r) {
        const tt = r.totals;
        body = '<div class="glass card lg col g20 report-doc"><div class="row between"><div><b class="lg">' + esc(t('MedAssist platformasi hisoboti')) + '</b><div class="sm muted">' + esc(fmtDay(r.from + 'T00:00')) + ' — ' + esc(fmtDay(r.to + 'T00:00')) + '</div></div><div class="row no-print"><button class="btn btn-sm" data-act="csv">' + icon('download', 16) + 'CSV (Excel)</button><button class="btn btn-sm" data-act="print">' + icon('printer', 16) + esc(t('Chop etish')) + '</button></div></div>' +
          '<div class="kv">' + [['Murojaatlar', tt.consultations], ['Tashxis qo‘yildi', tt.diagnosed], ['Retseptlar', tt.prescriptions], ['Dorixonada berildi', tt.dispensed], ['Klinikaga yozilish', tt.appointments], ['Qabul yakunlandi', tt.visitsDone], ['Yangi bemorlar', tt.newPatients], ['Yangi shifokorlar', tt.newDoctors], ['Baholar', tt.reviews + (tt.rating ? ' · ' + tt.rating + '★' : '')], ['Shikoyatlar', tt.complaints], ['Yordam murojaatlari', tt.tickets]].map(([l, v]) => '<div><span>' + esc(t(l)) + '</span><b>' + esc(v) + '</b></div>').join('') + '</div>' +
          lineChart({ labels: r.daily.map((x) => x.d), series: [{ label: 'Murojaatlar', color: 'var(--primary)', values: r.daily.map((x) => x.consultations) }, { label: 'Qabullar', color: 'var(--mint)', values: r.daily.map((x) => x.visits) }, { label: 'Ro‘yxatdan o‘tish', color: 'var(--amber)', values: r.daily.map((x) => x.registrations) }], label: t('Kunlik dinamika') }) +
          '<div class="grid g2"><div class="col"><h4>' + esc(t('Xavf darajasi')) + '</h4>' + donut([[SEV_LABEL.GREEN, r.bySeverity.GREEN || 0, 'var(--mint)'], [SEV_LABEL.YELLOW, r.bySeverity.YELLOW || 0, 'var(--amber)'], [SEV_LABEL.RED, r.bySeverity.RED || 0, 'var(--coral)']], { size: 120 }) + '</div>' +
          '<div class="col"><h4>' + esc(t('Mutaxassislik bo‘yicha')) + '</h4>' + (Object.keys(r.bySpecialty).length ? Object.entries(r.bySpecialty).sort((a, b) => b[1] - a[1]).map(([k, n]) => '<div class="row between sm"><span>' + esc(t(k)) + '</span><b>' + n + '</b></div>').join('') : '<p class="sm muted">—</p>') + '</div></div>' +
          '<h4>' + esc(t('Shifokorlar faoliyati')) + '</h4><div class="table-wrap"><table class="t"><thead><tr><th>' + esc(t('Shifokor')) + '</th><th>' + esc(t('Mutaxassislik')) + '</th><th>' + esc(t('Onlayn')) + '</th><th>' + esc(t('Qabul')) + '</th><th>' + esc(t('Kelmadi')) + '</th><th>' + esc(t('Reyting')) + '</th><th>' + esc(t('Shikoyat')) + '</th></tr></thead><tbody>' +
          r.doctors.map((x) => '<tr><td><b>' + esc(x.fullName) + '</b></td><td>' + esc(t(x.specialty)) + '</td><td>' + x.diagnoses + '</td><td>' + x.visits + '</td><td>' + x.noShow + '</td><td>' + (x.rating ?? '—') + '</td><td>' + (x.complaints ? '<span class="pill err">' + x.complaints + '</span>' : 0) + '</td></tr>').join('') + '</tbody></table></div>' +
          '<details class="glass faq"><summary>' + esc(t('Kunlik jadval')) + icon('plus', 18) + '</summary><div class="table-wrap" style="padding:0 16px 16px"><table class="t"><thead><tr><th>' + esc(t('Sana')) + '</th><th>' + esc(t('Murojaatlar')) + '</th><th>' + esc(t('Qabullar')) + '</th><th>' + esc(t('Ro‘yxatdan o‘tish')) + '</th></tr></thead><tbody>' + r.daily.map((x) => '<tr><td>' + esc(fmtDay(x.d + 'T00:00')) + '</td><td>' + x.consultations + '</td><td>' + x.visits + '</td><td>' + x.registrations + '</td></tr>').join('') + '</tbody></table></div></details></div>';
      }
      return shell('<div class="col g20">' + form + (s.error ? '<div class="alert err">' + esc(s.error) + '</div>' : '') + body + '</div>', { title: t('Hisobotlar'), subtitle: esc(t('Davr bo‘yicha platforma hisoboti')) });
    },
    bind(k, v) { s[k] = v; },
    on: {
      preset(el) { s.from = dayKey(Date.now() - Number(el.dataset.v) * 86400000); s.to = dayKey(Date.now()); app.render(); },
      async run() { s.loading = true; s.error = ''; app.render(); try { s.rep = await api('/admin/report?from=' + s.from + '&to=' + s.to); } catch (e) { s.error = errMsg(e); } s.loading = false; app.render(); },
      csv() {
        const r = s.rep; const tt = r.totals;
        downloadCsv('medassist-hisobot-' + r.from + '-' + r.to + '.csv', [[t('MedAssist platformasi hisoboti'), r.from + ' — ' + r.to], [],
          [t('Ko‘rsatkich'), t('Qiymat')], [t('Murojaatlar'), tt.consultations], [t('Tashxis qo‘yildi'), tt.diagnosed], [t('Retseptlar'), tt.prescriptions], [t('Dorixonada berildi'), tt.dispensed], [t('Klinikaga yozilish'), tt.appointments], [t('Qabul yakunlandi'), tt.visitsDone], [t('Yangi bemorlar'), tt.newPatients], [t('Yangi shifokorlar'), tt.newDoctors], [t('Baholar'), tt.reviews], [t('O‘rtacha baho'), tt.rating ?? ''], [t('Shikoyatlar'), tt.complaints], [],
          [t('Shifokorlar faoliyati')], [t('Shifokor'), t('Mutaxassislik'), t('Onlayn'), t('Qabul'), t('Kelmadi'), t('Reyting'), t('Shikoyat')], ...r.doctors.map((x) => [x.fullName, t(x.specialty), x.diagnoses, x.visits, x.noShow, x.rating ?? '', x.complaints]), [],
          [t('Kunlik jadval')], [t('Sana'), t('Murojaatlar'), t('Qabullar'), t('Ro‘yxatdan o‘tish')], ...r.daily.map((x) => [x.d, x.consultations, x.visits, x.registrations])]);
      },
      print() { window.print(); }
    }
  };
}

/* ---------------- audit ---------------- */
const ACTIONS = { LOGIN: 'Kirish', LOGIN_FAILED: 'Kirish xatosi', REGISTER: 'Ro‘yxatdan o‘tish', CONSULTATION_CREATE: 'Murojaat yaratildi', VIEW_PATIENT_CARD: 'Bemor kartasi ko‘rildi', CONSULTATION_ASSIGN: 'Murojaat olindi', AI_SUGGESTION: 'AI qoralama', AI_REJECT: 'AI rad etildi', DIAGNOSIS_CREATE: 'Tashxis qo‘yildi', PRESCRIPTION_CANCEL: 'Retsept bekor', PRESCRIPTION_PDF: 'PDF yuklandi', PRESCRIPTION_VERIFY: 'Retsept tekshirildi', PRESCRIPTION_DISPENSE: 'Dori berildi', DOCTOR_VERIFIED: 'Shifokor tasdiqlandi', DOCTOR_BLOCKED: 'Shifokor bloklandi', DOCTOR_PENDING: 'Qayta tekshiruvga', MEDICINE_UPDATE: 'Dori sozlamasi', MEDICINE_CREATE: 'Yangi dori', PASSWORD_RESET: 'Parol tiklandi', PASSWORD_CHANGE: 'Parol o‘zgardi', LICENSE_UPLOAD: 'Litsenziya yuklandi', ATTACHMENT_UPLOAD: 'Fayl yuklandi', CONSULTATION_CLOSE: 'Murojaat yopildi', PROFILE_UPDATE: 'Profil yangilandi', USER_ACTIVATE: 'Akkaunt yoqildi', USER_DEACTIVATE: 'Akkaunt o‘chirildi', APPOINTMENT_BOOK: 'Qabulga yozildi', APPOINTMENT_CANCEL: 'Qabul bekor qilindi', APPOINTMENT_DONE: 'Qabul yakunlandi', APPOINTMENT_IN_PROGRESS: 'Qabulga chaqirildi', APPOINTMENT_NO_SHOW: 'Kelmadi', APPOINTMENT_CANCELLED: 'Shifokor bekor qildi', APPOINTMENT_ARRIVED: 'Bemor keldi', REVIEW_CREATE: 'Baho qo‘yildi', REVIEW_HIDE: 'Baho yashirildi', REVIEW_SHOW: 'Baho ko‘rsatildi', TICKET_CREATE: 'Yordam murojaati', TICKET_CLOSED: 'Murojaat yopildi', TICKET_OPEN: 'Murojaat ochildi', TICKET_ANSWERED: 'Javob berildi', PHOTO_UPLOAD: 'Rasm yuklandi', DOCTOR_PROFILE_UPDATE: 'Shifokor profili', DOCTOR_SCHEDULE_UPDATE: 'Ish jadvali', DOCTOR_REPORT: 'Shifokor hisoboti', ADMIN_REPORT: 'Admin hisoboti', COURSE_START: 'Dori kursi boshlandi' };
export const adminAudit = () => adminPage('Audit jurnali', () => api('/admin/audit?limit=300'), (s) => {
  const q = (s.q || '').toLowerCase();
  const rows = s.data.filter((a) => !q || [a.userName, a.action, t(ACTIONS[a.action] || ''), a.detail, a.ip].join(' ').toLowerCase().includes(q));
  return '<div class="col"><div class="input-group" style="max-width:420px"><span class="prefix">' + icon('search', 18) + '</span><input class="input" type="search" id="aq" data-bind="q" placeholder="' + esc(t('Foydalanuvchi, amal yoki IP')) + '" value="' + esc(s.q || '') + '"></div>' +
    '<div class="glass card"><div class="table-wrap"><table class="t"><thead><tr><th>' + esc(t('Vaqt')) + '</th><th>' + esc(t('Foydalanuvchi')) + '</th><th>' + esc(t('Amal')) + '</th><th>' + esc(t('Obyekt')) + '</th><th>' + esc(t('Tafsilot')) + '</th><th>IP</th></tr></thead><tbody>' +
    (rows.length ? paginate(rows, s.page, 25).items.map((a) => '<tr><td class="sm nowrap">' + fmtDate(a.createdAt) + '</td><td class="sm">' + esc(a.userName || '—') + (a.userRole ? '<div class="xs faint">' + esc(t(ROLE[a.userRole])) + '</div>' : '') + '</td><td><span class="pill' + (a.action === 'LOGIN_FAILED' ? ' err' : '') + '">' + esc(t(ACTIONS[a.action] || a.action)) + '</span></td><td class="sm">' + esc(a.entity || '') + (a.entityId ? ' #' + a.entityId : '') + '</td><td class="sm muted">' + esc(a.detail || '') + '</td><td class="xs faint">' + esc(a.ip || '') + '</td></tr>').join('') : '<tr><td colspan="6" class="muted">' + esc(t('Jurnal bo‘sh')) + '</td></tr>') +
    '</tbody></table></div></div>' + pager(paginate(rows, s.page, 25)) + '</div>';
}, { subtitle: 'Kim, qachon, nima qildi', onBind(k, v, s) { if (k === 'q') { s.page = 1; app.queue(); } } });

/* ---------------- admin profile ---------------- */
const ADMIN_PROFILE_MENU = [
  ['personal', 'user', 'Shaxsiy ma’lumotlar', 'Ism va telefon'],
  ['security', 'lock', 'Xavfsizlik va sozlamalar', 'Parol, til, bildirishnoma, chiqish']
];
export function adminProfile(params = {}) {
  const section = params.section || 'menu';
  const f = { fullName: session.user.fullName, saving: false, current: '', next: '', pwSaving: false, photoBusy: false };
  return {
    title: 'Profil',
    html() {
      const u = session.user;
      if (section === 'security') return shell('<div class="col g20" style="max-width:640px">' + securityCard(f) + '</div>', { title: t('Xavfsizlik va sozlamalar'), back: '#/admin/profile' });
      if (section === 'personal') {
        return shell('<div class="glass card lg col g20" style="max-width:640px"><div class="col g20">' +
          '<label class="field"><span>' + esc(t('Ism va familiya')) + '</span><input class="input" id="fullName" data-bind="fullName" value="' + esc(f.fullName) + '"></label>' +
          '<label class="field"><span>' + esc(t('Telefon')) + '</span><input class="input" value="' + esc(fmtPhone(u.phone)) + '" disabled></label></div>' +
          '<button class="btn btn-primary btn-lg" data-act="save"' + (f.saving ? ' disabled' : '') + '>' + (f.saving ? spinner() : icon('check', 18, 2.6) + esc(t('Saqlash'))) + '</button>' +
          '<div class="well sm muted">' + esc(t('Administrator tibbiy yozuvlarni (tashxis, shikoyat matni, retsept tarkibi) ko‘ra olmaydi — bu bemorlar maxfiyligi uchun.')) + '</div></div>', { title: t('Shaxsiy ma’lumotlar'), back: '#/admin/profile' });
      }
      const rows = ADMIN_PROFILE_MENU.map(([key, ic, label, sub]) => '<a class="item" href="#/admin/profile/' + key + '">' + icon(ic, 20) + '<span class="grow"><b>' + esc(t(label)) + '</b><br><span class="sm muted">' + esc(t(sub)) + '</span></span>' + icon('next', 18) + '</a>').join('');
      return shell('<div class="col g20" style="max-width:640px"><div class="glass card lg col g20">' + photoBlock(u, f, false) +
        '<span class="pill info" style="align-self:flex-start">' + icon('shield', 13) + esc(t('Administrator')) + '</span></div><div class="col g12">' + rows + '</div></div>', { title: t('Profil'), subtitle: esc(t('Administrator')) });
    },
    bind(k, v) { f[k] = v; },
    on: {
      ...photoActions(f), ...accountActions(f),
      changePw: () => changePassword(f),
      async save() { f.saving = true; app.render(); try { session.user = await api('/me/basic', { method: 'PUT', body: { fullName: f.fullName } }); toast(t('Profil saqlandi')); go('#/admin/profile'); } finally { f.saving = false; app.render(); } }
    }
  };
}
