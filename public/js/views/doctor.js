import { esc, icon, session, app, api, go, toast, errMsg, spinner, fmtDate, fmtDay, fmtTime, fmtDayLong, ago, fmtPhone, fmtSize, fmtMoney, dayKey, sevPill, statusPill, apptPill, presencePill, stars, emergency, skeletons, empty, poller, downloadFile, downloadCsv, openFile, catalog, t, avatar, confirmSheet, promptSheet, PRESENCE_LABEL, APPT_STATUS, SEV_LABEL } from '../core.js';
import { shell, bodyMap, findStage, sectionHead, idCard, personIllustration } from '../ui.js';
import { chatBox, rxCard, securityCard, changePassword, photoBlock, photoActions, accountActions } from './patient.js';
import { barChart, donut, kpi } from '../charts.js';
import { SEGMENT_NAMES, PAIN_KINDS, DURATIONS, SYMPTOMS, DANGER_FLAGS, WEEKDAYS, painColor, safetyCheck, interactions, segmentSide, icdTitle, ICD_PATTERN } from '/shared/clinical.js';

const sideLabel = (code) => t({ front: 'old', back: 'orqa', both: '' }[segmentSide(code)]);
const segSummary = (segs, n = 2) => (segs || []).slice(0, n).map((x) => t(SEGMENT_NAMES[x.code]) + ' ' + x.pain + '/10').join(', ') + ((segs || []).length > n ? ' +' + (segs.length - n) : '');
const gender = (g) => t(g === 'F' ? 'Ayol' : 'Erkak');
const conf = (v) => { const n = Math.max(0, Math.min(1, Number(v) || 0)); return '<div class="row nw" style="gap:8px"><div class="conf"><i style="width:' + Math.round(n * 100) + '%"></i></div><span class="xs faint b">' + Math.round(n * 100) + '%</span></div>'; };

/* Verification gate: unverified doctors see their status and can upload a license. */
function gate(title) {
  const d = session.user.doctor;
  if (!d || d.status === 'VERIFIED') return null;
  const blocked = d.status === 'BLOCKED';
  return shell('<div class="glass card lg col g20 narrow" style="margin:0;align-items:flex-start">' +
    '<span class="avatar lg" style="background:' + (blocked ? 'var(--coral)' : 'var(--amber)') + '">' + icon(blocked ? 'lock' : 'clock', 28) + '</span>' +
    '<h2>' + esc(t(blocked ? 'Profil bloklangan' : 'Litsenziya tekshirilmoqda')) + '</h2>' +
    '<p class="muted">' + (blocked ? esc(t('Administrator profilingizni blokladi.')) + (d.note ? ' ' + esc(t('Izoh:')) + ' ' + esc(d.note) : '') : esc(t('Administrator litsenziyangizni ({n}) tekshirgach, bemorlar navbati ochiladi. Tasdiqlansa SMS keladi.', { n: d.licenseNumber })) + (d.note ? '<br><span class="sm">' + esc(d.note) + '</span>' : '')) + '</p>' +
    (!blocked ? '<div class="well col g6" style="width:100%"><b>' + esc(t('Litsenziya nusxasi')) + '</b><span class="sm muted">' + esc(t(d.licenseFileId ? 'Yuklangan ✓ — yangisini yuklasangiz almashtiriladi.' : 'Tekshiruvni tezlashtirish uchun litsenziya nusxasini yuklang (jpg, png, pdf · 10 MB gacha).')) + '</span>' +
      '<label class="btn" style="align-self:flex-start;cursor:pointer;margin-top:6px">' + icon('clip', 18) + esc(t(d.licenseFileId ? 'Qayta yuklash' : 'Fayl tanlash')) + '<input type="file" class="sr" data-file="license" accept="image/jpeg,image/png,application/pdf"></label></div>' : '') +
    '<div class="row"><button class="btn btn-ghost" data-act="recheck">' + icon('refresh', 18) + esc(t('Holatni yangilash')) + '</button><a class="btn btn-ghost" href="#/doctor/profile">' + icon('user', 18) + esc(t('Profilni to‘ldirish')) + '</a></div></div>', { title: t(title || 'Shifokor kabineti') });
}
const gateActions = {
  async license(el) {
    const f = el.files && el.files[0]; el.value = '';
    if (!f) return;
    if (f.size > 10 * 1048576) { toast(t('Fayl 10 MB dan katta'), 'err'); return; }
    session.user = await api('/me/license', { method: 'POST', raw: f, headers: { 'content-type': f.type || 'application/octet-stream', 'x-file-name': encodeURIComponent(f.name) } });
    toast(t('Litsenziya yuklandi')); app.render();
  },
  async recheck() { session.user = await api('/me'); app.navigate(); }
};
const presenceSwitch = (p) => '<div class="presence-switch" role="radiogroup" aria-label="' + esc(t('Holatim')) + '">' + ['ONLINE', 'AT_WORK', 'OFFLINE'].map((k) => '<button role="radio" class="ps ' + k + '" aria-checked="' + (p === k) + '" data-act="presence" data-v="' + k + '"><i></i><span><b>' + esc(t(PRESENCE_LABEL[k])) + '</b><small>' + esc(t({ ONLINE: 'Onlayn maslahatga tayyorman', AT_WORK: 'Klinikada qabul qilyapman', OFFLINE: 'Hozir ishlamayapman' }[k])) + '</small></span></button>').join('') + '</div>';
const presenceAction = async (el) => { session.user = await api('/doctor/presence', { method: 'PUT', body: { presence: el.dataset.v } }); toast(t('Holat: {s}', { s: t(PRESENCE_LABEL[el.dataset.v]) })); app.render(); };

/* ---------------- dashboard ---------------- */
export function doctorHome() {
  const s = { st: null, today: null, error: '' };
  let stop = null;
  const load = async () => {
    const [st, today] = await Promise.all([api('/doctor/stats?days=30'), api('/doctor/appointments')]);
    if (JSON.stringify([st, today]) !== JSON.stringify([s.st, s.today])) { s.st = st; s.today = today; app.render(); }
  };
  return {
    title: 'Bosh sahifa',
    html() {
      const g = gate(); if (g) return g;
      const u = session.user; const d = u.doctor; const st = s.st;
      const hour = new Date().getHours();
      const hero = '<section class="glass card lg doc-dash-hero"><div class="row nw top" style="gap:18px">' + avatar(u, { size: 72, cls: 'ring' }) + '<div class="grow col g6"><span class="eyebrow-soft">' + esc(t(hour < 12 ? 'Xayrli tong' : hour < 18 ? 'Xayrli kun' : 'Xayrli kech')) + ', Dr. ' + esc(u.fullName.split(' ')[0]) + '</span>' +
        '<h2>' + esc(t('Bugun {n} bemor sizni kutmoqda', { n: st ? st.today.waiting + st.today.visitsLeft : '…' })) + '</h2><span class="muted sm">' + esc(fmtDayLong(Date.now())) + ' · ' + esc(t(d.specialty)) + '</span></div>' +
        '<div class="hh-illust sm">' + personIllustration('patient') + '</div></div>' + presenceSwitch(d.presence) + '</section>';
      if (!st) return shell('<div class="col g20">' + hero + (s.error ? '<div class="alert err">' + esc(s.error) + '</div>' : skeletons(3)) + '</div>', { title: t('Bosh sahifa') });
      const kpis = '<div class="grid g4 keep2">' + kpi(st.today.waiting, t('Onlayn navbatda'), icon('list', 18), st.today.waiting ? 'tone-blue' : '') + kpi(st.today.visitsLeft, t('Bugungi qabullar (qolgan)'), icon('calendar', 18), '', esc(t('jami {n}', { n: st.today.visits }))) +
        kpi(st.today.diagnoses + st.today.done, t('Bugun yakunlandi'), icon('check', 18), 'tone-mint') + kpi(st.rating.avg ? st.rating.avg.toFixed(1) : '—', t('Reyting'), icon('star', 18), 'tone-amber', esc(t('{n} ta baho', { n: st.rating.count }))) + '</div>';
      const worry = '<div class="glass card col">' + sectionHead(t('Xavotirli bemorlar'), '<a class="sm b" href="#/doctor/queue">' + esc(t('Navbat')) + '</a>') +
        (st.worrying.length ? '<div class="col g6">' + st.worrying.map((c, i) => '<button class="item worry ' + c.severity + '" style="--d:' + i + '" data-act="go" data-to="#/doctor/c/' + c.id + '">' + avatar(c.patient, { size: 40, private: true }) + '<span class="grow col" style="gap:2px"><span class="row between nw"><b>' + esc(c.patient.fullName) + '</b>' + sevPill(c.severity) + '</span><span class="sm muted">' + esc((c.patient.age ?? '—') + ' ' + t('yosh') + ' · ' + segSummary(c.segments)) + '</span><span class="xs faint">' + esc(t(c.mine ? 'Sizda' : 'Navbatda')) + ' · ' + ago(c.createdAt) + '</span></span></button>').join('') + '</div>'
          : '<div class="calm">' + icon('smile', 22) + '<span class="sm">' + esc(t('Hozir xavotirli holat yo‘q. Ajoyib!')) + '</span></div>') + '</div>';
      const items = (s.today && s.today.items || []).filter((a) => a.status !== 'CANCELLED');
      const nextA = items.find((a) => ['BOOKED', 'ARRIVED'].includes(a.status));
      const visits = '<div class="glass card col">' + sectionHead(t('Bugungi jonli navbat'), '<a class="sm b" href="#/doctor/visits">' + esc(t('Boshqarish')) + '</a>') +
        (items.length ? items.slice(0, 6).map((a) => '<div class="visit-mini' + (a === nextA ? ' next' : '') + (a.status === 'IN_PROGRESS' ? ' now' : '') + '"><div class="vm-date"><b>' + a.queueNo + '</b><span>' + fmtTime(a.startAt) + '</span></div><div class="grow"><b class="sm">' + esc(a.patient.fullName) + '</b><div class="xs muted">' + esc(a.reason || a.segments.map((c) => t(SEGMENT_NAMES[c])).join(', ') || '—') + '</div></div>' + apptPill(a.status) + '</div>').join('') : '<p class="sm muted">' + esc(t('Bugun yozilgan bemor yo‘q.')) + '</p>') + '</div>';
      const chart = '<div class="glass card col">' + sectionHead(t('Ish dinamikasi (30 kun)'), '<a class="sm b" href="#/doctor/stats">' + esc(t('Batafsil')) + '</a>') +
        barChart({ labels: st.daily.map((x) => x.d), series: [{ label: 'Onlayn tashxis', color: 'var(--primary)', values: st.daily.map((x) => x.online) }, { label: 'Klinikadagi qabul', color: 'var(--mint)', values: st.daily.map((x) => x.visits) }], stacked: true, label: t('Ish dinamikasi') }) + '</div>';
      const reviews = '<div class="glass card col">' + sectionHead(t('So‘nggi baholar')) + (st.recentReviews.length ? st.recentReviews.map((r) => '<div class="review"><div class="row between nw"><b class="sm">' + esc(r.author.split(' ')[0]) + '</b>' + stars(r.rating, 13) + '</div>' + (r.comment ? '<p class="sm">' + esc(r.comment) + '</p>' : '') + '<span class="xs faint">' + ago(r.createdAt) + '</span></div>').join('') : '<p class="sm muted">' + esc(t('Hali baho yo‘q.')) + '</p>') + '</div>';
      const links = '<div class="tiles">' + [['#/doctor/schedule', 'clock', 'Ish jadvali', 'Qabul vaqtlari'], ['#/doctor/stats', 'file', 'Hisobot', 'CSV va chop etish'], ['#/doctor/profile', 'user', 'Profil', 'Narx, manzil, rasm'], ['#/support', 'help', 'Texnik yordam', 'Administratorga yozish']].map(([h, ic, tl, sub], i) => '<a class="glass tile" style="--d:' + i + '" href="' + h + '"><span class="ic">' + icon(ic, 22) + '</span><b>' + esc(t(tl)) + '</b><span class="xs muted">' + esc(t(sub)) + '</span></a>').join('') + '</div>';
      return shell('<div class="col g20">' + hero + kpis + '<div class="grid g2" style="align-items:start">' + worry + visits + '</div>' + chart + '<div class="grid g2" style="align-items:start">' + reviews + links + '</div></div>', { title: t('Bosh sahifa'), subtitle: 'Dr. ' + esc(u.fullName) });
    },
    on: { ...gateActions, presence: presenceAction },
    async mount() { if (gate()) return; try { await load(); } catch (e) { s.error = errMsg(e); app.render(); } stop = poller(load, 20000); },
    unmount() { if (stop) stop(); }
  };
}

/* ---------------- online queue workspace ---------------- */
export function doctorWorkspace(params) {
  const s = {
    filter: params.filter || 'mine', queue: null, stats: null, id: params.id ? Number(params.id) : null, c: null, msgs: [], draft: '', sending: false,
    view: 'front', seg: null, tab: 'dx', reviewed: false, aiLoading: false, rejecting: false, rejectNote: '', form: null, saving: false, formErr: '',
    cancel: false, cancelReason: '', meds: [], icd: [], busy: false, error: ''
  };
  const base = s.filter === 'done' ? '#/doctor/done' : '#/doctor/queue';
  let stopQ = null, stopC = null;
  const loadQueue = async () => {
    const r = await api('/doctor/queue?filter=' + s.filter);
    if (JSON.stringify(r) !== JSON.stringify({ items: s.queue, stats: s.stats })) { s.queue = r.items; s.stats = r.stats; app.render(); }
  };
  const loadCase = async () => {
    if (!s.id) return;
    const c = await api('/consultations/' + s.id);
    const msgs = c.doctor && c.doctor.id === session.user.id ? await api('/consultations/' + s.id + '/messages') : [];
    const changed = JSON.stringify(c) !== JSON.stringify(s.c) || msgs.length !== s.msgs.length;
    s.c = c; s.msgs = msgs; if (changed) app.render();
  };
  const medById = (id) => s.meds.find((m) => m.id === Number(id));
  const emptyForm = () => ({ icd10: '', title: '', description: '', recommendations: '', redFlags: t('Harorat 3 kundan ortiq tushmasa') + '\n' + t('Nafas qisilsa yoki og‘riq keskin kuchaysa'), items: [], fromAi: false });
  const formFromAi = (ai) => ({
    icd10: ai.draft.diagnosis.icd10, title: ai.draft.diagnosis.title || icdTitle(ai.draft.diagnosis.icd10), description: '', recommendations: (ai.draft.advice || []).join('\n'), redFlags: (ai.draft.redFlags || []).join('\n'),
    items: ai.kept.filter((k) => medById(k.medicineId)).map((k) => { const m = medById(k.medicineId); return { medicineId: m.id, doseMg: k.doseMg || m.mg || '', dosage: m.mg ? '' : (m.unitDose || ''), timesPerDay: k.timesPerDay, durationDays: k.durationDays, instructions: k.note || '' }; }),
    fromAi: true
  });
  const patientForSafety = () => { const p = s.c.patient; return { age: p.age, pregnant: p.pregnant, allergies: p.allergies, chronic: p.chronic }; };
  const submitDx = async (form, aiDecision) => {
    s.formErr = '';
    const icd = String(form.icd10 || '').trim().toUpperCase();
    if (!ICD_PATTERN.test(icd)) { s.formErr = t('ICD-10 kodini to‘g‘ri kiriting (masalan J06.9)'); app.render(); return; }
    if (!String(form.title).trim()) { s.formErr = t('Tashxis nomini yozing'); app.render(); return; }
    const items = form.items.map((it) => ({ medicineId: Number(it.medicineId), doseMg: Number(it.doseMg) || null, dosage: it.dosage, timesPerDay: Number(it.timesPerDay), durationDays: Number(it.durationDays), instructions: it.instructions }));
    s.saving = true; app.render();
    try {
      s.c = await api('/consultations/' + s.id + '/diagnosis', { method: 'POST', body: { icd10: icd, title: form.title, description: form.description, recommendations: form.recommendations, redFlags: String(form.redFlags || '').split('\n').map((x) => x.trim()).filter(Boolean), items, aiDecision } });
      s.form = null; s.reviewed = false; toast(t('Tashxis va retsept bemorga yuborildi')); loadQueue().catch(() => {});
    } catch (e) { s.formErr = errMsg(e); }
    s.saving = false; app.render();
  };

  function queueHtml() {
    const items = s.queue;
    const head = '<div class="row between"><h2 class="queue-title">' + esc(t(s.filter === 'done' ? 'Yakunlangan' : 'Onlayn navbat')) + '</h2><span class="pill">' + (items ? items.length : '…') + '</span></div>' +
      (s.filter !== 'done' ? '<div class="seg" role="group" aria-label="' + esc(t('Filtr')) + '"><button data-act="filter" data-v="mine" aria-pressed="' + (s.filter === 'mine') + '">' + esc(t('Menga')) + '</button><button data-act="filter" data-v="all" aria-pressed="' + (s.filter === 'all') + '">' + esc(t('Barchasi')) + '</button></div>' : '') +
      (s.stats ? '<div class="grid g2 keep2" style="gap:8px"><div class="well"><span class="xs faint b">' + esc(t('BUGUN')) + '</span><div class="b lg">' + esc(t('{n} ta', { n: s.stats.today })) + '</div></div><div class="well"><span class="xs faint b">' + esc(t('AI O‘ZGARISHSIZ')) + '</span><div class="b lg">' + (s.stats.aiReviewed ? Math.round(100 * s.stats.aiApproved / s.stats.aiReviewed) + '%' : '—') + '</div></div></div>' : '');
    let list;
    if (!items) list = skeletons(4);
    else if (!items.length) list = empty('check', t(s.filter === 'done' ? 'Hali yakunlangan murojaat yo‘q' : 'Navbat bo‘sh'), t('Yangi murojaat kelsa, shu yerda paydo bo‘ladi.'));
    else list = items.map((x, i) => '<button class="item qcard ' + x.severity + '" style="--d:' + i + '" data-act="pick" data-id="' + x.id + '" aria-pressed="' + (x.id === s.id) + '">' +
      '<span class="row between nw"><span class="row nw" style="gap:8px">' + avatar({ ...x.patient, id: null }, { size: 30 }) + '<b>' + esc(x.patient.fullName) + '</b></span>' + sevPill(x.severity) + '</span>' +
      '<span class="sm muted">' + esc((x.patient.age ?? '—') + ' ' + t('yosh') + ' · ' + gender(x.patient.gender)) + ' · ' + ago(x.createdAt) + '</span>' +
      '<span class="sm">' + esc(segSummary(x.segments)) + '</span>' +
      '<span class="row" style="gap:6px">' + statusPill(x.status) + (x.requestedDoctorId === session.user.id && !x.doctorId ? '<span class="pill ok">' + icon('user', 13) + esc(t('Sizni tanladi')) + '</span>' : '') + (x.aiPending ? '<span class="pill info">' + icon('spark', 13) + 'AI</span>' : '') + (x.unread ? '<span class="pill info">' + icon('chat', 13) + x.unread + '</span>' : '') + (x.doctorId && x.doctorId !== session.user.id ? '<span class="pill">' + esc(x.doctorName || '') + '</span>' : '') + '</span></button>').join('');
    return '<aside class="ws-queue" aria-label="' + esc(t('Navbat')) + '">' + head + list + '</aside>';
  }

  function centerHtml() {
    const c = s.c;
    if (!c) return '<section class="ws-center">' + (s.id ? skeletons(2) : empty('list', t('Navbatdan bemorni tanlang'), t('Shoshilinch murojaatlar ro‘yxat boshida turadi.'))) + '</section>';
    const p = c.patient; const mine = c.doctor && c.doctor.id === session.user.id; const free = !c.doctor;
    return '<section class="ws-center col g20" aria-label="' + esc(t('Bemor kartasi')) + '">' +
      '<div class="glass card col"><div class="row between top"><div class="row nw" style="gap:14px">' + avatar({ id: mine ? c.patientId : null, fullName: p.fullName, photo: mine ? c.patientPhoto : null }, { size: 56, private: true }) + '<div><h2 style="font-size:22px">' + esc(p.fullName) + '</h2><p class="sm muted">' + esc((p.age ?? '—') + ' ' + t('yosh') + ' · ' + gender(p.gender)) + (p.pregnant ? ' · ' + esc(t('homilador')) : '') + ' · ' + fmtDate(c.createdAt) + '</p></div></div><div class="row">' + sevPill(c.severity) + statusPill(c.status) + '</div></div>' +
      '<div class="kv"><div><span>' + esc(t('Harorat')) + '</span><b>' + (c.temperature ? c.temperature + ' °C' : '—') + '</b></div><div class="' + (p.allergies ? 'alert-cell' : '') + '"><span>' + esc(t('Allergiya')) + '</span><b>' + esc(p.allergies || t('Yo‘q')) + '</b></div><div><span>' + esc(t('Surunkali')) + '</span><b>' + esc(p.chronic || t('Yo‘q')) + '</b></div><div><span>' + esc(t('Qon guruhi')) + '</span><b>' + esc(p.bloodType || '—') + '</b></div></div>' +
      '<div class="well sm"><b>' + esc(t('Baholash:')) + '</b> ' + esc(c.triageReasons.map((r) => t(r)).join('; ')) + '</div>' +
      (c.requestedDoctor && free ? '<div class="alert info sm">' + icon('user', 18) + '<div>' + esc(t('Bemor aynan sizni tanlagan')) + '</div></div>' : '') +
      (free && ['NEW', 'AI_DRAFTED'].includes(c.status) ? '<button class="btn btn-primary btn-lg" data-act="assign"' + (s.busy ? ' disabled' : '') + '>' + (s.busy ? spinner() : icon('check', 18, 2.6) + esc(t('Navbatdan olish'))) + '</button>' : '') +
      (mine && p.phone && !['CLOSED', 'CANCELLED'].includes(c.status) ? '<a class="btn" href="tel:+' + esc(p.phone) + '">' + icon('phone', 18) + esc(t('Bemorga qo‘ng‘iroq')) + ' · ' + fmtPhone(p.phone) + '</a>' : '') + '</div>' +
      '<div class="glass card col"><div class="row between"><h3>' + esc(t('Belgilangan joylar')) + '</h3><div class="seg" role="group" aria-label="' + esc(t('Ko‘rinish')) + '"><button data-act="view" data-v="front" aria-pressed="' + (s.view === 'front') + '">' + esc(t('Old')) + '</button><button data-act="view" data-v="back" aria-pressed="' + (s.view === 'back') + '">' + esc(t('Orqa')) + '</button></div></div>' +
      // Bemor xuddi shu <body-map> komponentida belgilagan — shifokor ham aynan shu ko'rinishni ko'rsin (faqat o'qish uchun).
      '<div class="pt-grid"><div class="col g6"><body-map id="docmap" view="' + s.view + '" theme="dark" readonly no-controls no-list></body-map></div><div class="col g6">' +
      c.segments.map((x) => '<button class="item flat" data-act="segPick" data-code="' + x.code + '" aria-pressed="' + (s.seg === x.code) + '"><span class="bar" style="background:' + painColor(x.pain) + '"></span><span class="grow"><b>' + esc(t(SEGMENT_NAMES[x.code])) + '</b> <span class="xs faint">' + esc(sideLabel(x.code)) + '</span><br><span class="sm muted">' + esc(t(PAIN_KINDS[x.kind])) + ' · ' + esc(t(DURATIONS[x.dur])) + '</span></span><b style="color:' + painColor(x.pain) + '">' + x.pain + '/10</b></button>').join('') +
      (c.symptoms.length ? '<p class="sm"><span class="faint">' + esc(t('Belgilar:')) + '</span> ' + esc(c.symptoms.map((k) => t(SYMPTOMS[k])).join(', ')) + '</p>' : '') +
      (c.flags.length ? '<p class="sm" style="color:var(--coral-ink)"><b>' + esc(t('Xavfli belgilar:')) + '</b> ' + esc(c.flags.map((k) => t(DANGER_FLAGS[k])).join(', ')) + '</p>' : '') + '</div></div>' +
      (c.complaint ? '<div class="well"><span class="xs faint b">' + esc(t('SHIKOYAT')) + '</span><p>' + esc(c.complaint) + '</p></div>' : '') +
      (c.files.length ? '<div class="row">' + c.files.map((f) => '<button class="btn btn-sm" data-act="file" data-id="' + f.id + '">' + icon('file', 16) + esc(f.name) + ' <span class="faint">' + fmtSize(f.size) + '</span></button>').join('') + '</div>' : '') + '</div>' +
      (mine ? '<div class="glass card col">' + chatBox(s, 'DOCTOR', !['CLOSED', 'CANCELLED'].includes(c.status)) + '</div>' : '') + '</section>';
  }

  function aiHtml(c, mine) {
    if (c.severity === 'RED') return '<div class="glass card col"><h3 class="row">' + icon('spark', 18) + esc(t('AI qoralamasi')) + '</h3>' + emergency(t('AI o‘chirilgan: shoshilinch holat. Bemorga darhol 103 ga qo‘ng‘iroq qilish aytildi.')) + '</div>';
    const ai = c.ai;
    const ST = { PENDING: ['Tekshiruv kutmoqda', 'info'], APPROVED: ['Tasdiqlandi', 'ok'], MODIFIED: ['O‘zgartirildi', 'ok'], REJECTED: ['Rad etildi', 'err'] };
    const head = '<div class="row between"><h3 class="row" style="gap:6px">' + icon('spark', 18) + esc(t('AI qoralamasi')) + '</h3>' + (ai ? '<span class="pill ' + ST[ai.status][1] + '">' + esc(t(ST[ai.status][0])) + '</span>' : '') + '</div>' +
      '<p class="xs faint">' + esc(t('Bemor buni ko‘rmaydi. Har bir dori allergiya, yosh, homiladorlik va doza bo‘yicha tekshirilgan.')) + (c.severity === 'YELLOW' ? ' ' + esc(t('O‘rtacha holatda AI dori tavsiya qilmaydi.')) : '') + '</p>';
    if (!ai) return '<div class="glass card col">' + head + (mine ? '<button class="btn btn-primary" data-act="genAi"' + (s.aiLoading ? ' disabled' : '') + '>' + (s.aiLoading ? spinner() + esc(t('Tayyorlanmoqda…')) : icon('spark', 18) + esc(t('Qoralama tayyorlash'))) + '</button>' : '<p class="sm muted">' + esc(t('Qoralama tayyorlanmoqda yoki murojaatni olgach yaratish mumkin.')) + '</p>') + '</div>';
    const d = ai.draft; let body = '';
    if (s.tab === 'dx') {
      const dxItems = [{ icd10: d.diagnosis.icd10, title: d.diagnosis.title || icdTitle(d.diagnosis.icd10), confidence: d.diagnosis.confidence }]
        .concat((d.differential || []).map((x) => ({ icd10: x.icd10, title: x.title || icdTitle(x.icd10), confidence: x.confidence })));
      const segs = (c.segments || []).slice().sort((a, b) => b.pain - a.pain);
      const findings = segs.length ? dxItems.map((x, i) => ({ code: segs[i % segs.length].code, label: x.title, value: Math.round(x.confidence * 100), tone: i === 0 ? 'info' : ['warn', 'ok'][(i - 1) % 2] })) : [];
      body = (findings.length ? findStage(bodyMap({ view: s.view || 'front', width: 220, findings }), 'sm') : '') +
        '<div class="well col g6"><div class="row between nw"><b>' + esc(d.diagnosis.title || icdTitle(d.diagnosis.icd10)) + '</b><span class="pill">' + esc(d.diagnosis.icd10) + '</span></div>' + conf(d.diagnosis.confidence) + '</div>' +
        (d.differential && d.differential.length ? '<div class="col g6"><span class="xs faint b">' + esc(t('EHTIMOLIY TASHXISLAR')) + '</span>' + d.differential.map((x) => '<div class="well col g6" style="padding:10px 12px"><div class="row between nw sm"><span>' + esc(x.title || icdTitle(x.icd10)) + '</span><span class="faint">' + esc(x.icd10) + '</span></div>' + conf(x.confidence) + '</div>').join('') + '</div>' : '') +
        (d.reasoning ? '<p class="sm"><span class="faint">' + esc(t('Asos:')) + '</span> ' + esc(d.reasoning) + '</p>' : '') +
        (d.questionsForDoctor && d.questionsForDoctor.length ? '<div class="sm"><span class="faint">' + esc(t('Bemordan so‘rash mumkin:')) + '</span><ul style="margin:4px 0 0;padding-left:18px">' + d.questionsForDoctor.map((q) => '<li>' + esc(q) + '</li>').join('') + '</ul></div>' : '');
    } else if (s.tab === 'meds') {
      body = (ai.kept.length ? ai.kept.map((k) => { const m = medById(k.medicineId) || {}; return '<div class="med"><div class="row between nw"><b>' + esc(m.name) + ' ' + esc(m.strength) + '</b><span class="pill">' + esc(t(m.form)) + '</span></div><span class="sm">' + (k.doseMg ? k.doseMg + ' mg' : esc(m.unitDose || '')) + ', ' + esc(t('kuniga {n} marta', { n: k.timesPerDay })) + ', ' + esc(t('{n} kun', { n: k.durationDays })) + (k.note ? ' · ' + esc(k.note) : '') + '</span><span class="xs muted"><b>' + esc(t('Nojo‘ya ta’siri:')) + '</b> ' + esc((m.se || []).join(', ')) + '</span><span class="xs muted"><b>' + esc(t('Qarshi ko‘rsatma:')) + '</b> ' + esc((m.ci || []).join(', ')) + '</span></div>'; }).join('') : '<div class="well sm muted">' + esc(t('Tavsiya qilingan dori yo‘q.')) + '</div>') +
        (ai.removed.length ? '<div class="col g6"><span class="xs faint b">' + esc(t('TIZIM OLIB TASHLADI')) + '</span>' + ai.removed.map((r) => { const m = medById(r.medicineId) || { name: r.medicineCode }; return '<div class="med removed sm"><b>' + esc(m.name) + '</b>' + esc(r.reason) + '</div>'; }).join('') + '</div>' : '');
    } else {
      body = '<ul class="ticks sm">' + (d.advice || []).map((x) => '<li>' + icon('check', 16, 2.6) + '<span>' + esc(x) + '</span></li>').join('') + '</ul>' +
        ((d.redFlags || []).length ? '<div class="alert warn sm">' + icon('alert', 18) + '<div><div>' + esc(t('Darhol murojaat kerak, agar:')) + '</div><ul style="margin:4px 0 0;padding-left:18px">' + d.redFlags.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></div></div>' : '');
    }
    const pending = ai.status === 'PENDING' && mine && c.status === 'ASSIGNED';
    return '<div class="glass card col">' + head + '<div class="row xs faint">' + esc(t('Manba:')) + ' ' + (ai.source === 'AI' ? esc(ai.model || 'Claude') : esc(t('tibbiy qoidalar'))) + ' · ' + ago(ai.createdAt) + '</div>' +
      '<div class="tabs" role="tablist">' + [['dx', 'Tashxis'], ['meds', 'Dorilar'], ['adv', 'Maslahat']].map(([k, l]) => '<button role="tab" aria-selected="' + (s.tab === k) + '" data-act="tab" data-v="' + k + '">' + esc(t(l)) + (k === 'meds' && ai.removed.length ? ' <span class="pill err" style="height:20px">−' + ai.removed.length + '</span>' : '') + '</button>').join('') + '</div>' +
      '<div class="col">' + body + '</div>' +
      (pending ? '<div class="hr"></div><label class="check"><input type="checkbox" data-bind="reviewed"' + (s.reviewed ? ' checked' : '') + '>' + esc(t('Dorilar va nojo‘ya ta’sirlarni ko‘rib chiqdim')) + '</label>' +
        (s.rejecting ? '<div class="col"><input class="input" id="rejectNote" data-bind="rejectNote" placeholder="' + esc(t('Rad etish sababi')) + '" value="' + esc(s.rejectNote) + '"><div class="row end"><button class="btn btn-ghost btn-sm" data-act="rejectCancel">' + esc(t('Bekor')) + '</button><button class="btn btn-danger btn-sm" data-act="rejectConfirm">' + esc(t('Rad etish')) + '</button></div></div>'
          : '<div class="grid g3" style="gap:8px"><button class="btn btn-danger" data-act="rejectOpen">' + esc(t('Rad etish')) + '</button><button class="btn" data-act="aiEdit">' + esc(t('O‘zgartirish')) + '</button><button class="btn btn-primary" data-act="aiApprove"' + (s.reviewed && !s.saving ? '' : ' disabled') + '>' + (s.saving ? spinner() : esc(t('Tasdiqlash'))) + '</button></div>') +
        '<button class="btn btn-ghost btn-sm" style="align-self:flex-start" data-act="genAi"' + (s.aiLoading ? ' disabled' : '') + '>' + (s.aiLoading ? spinner() : icon('refresh', 16)) + esc(t('Qayta yaratish')) + '</button>' : '') +
      (ai.note ? '<p class="sm muted">' + esc(t('Izoh:')) + ' ' + esc(ai.note) + '</p>' : '') + (s.formErr && !s.form ? '<div class="alert err sm">' + esc(s.formErr) + '</div>' : '') + '</div>';
  }

  function dxHtml(c, mine) {
    if (c.diagnosis) {
      return '<div class="glass card col"><div class="row between"><h3>' + esc(t('Tashxis')) + '</h3><span class="xs faint">' + fmtDate(c.diagnosis.createdAt) + '</span></div>' +
        '<div class="well"><span class="xs faint b">' + esc(c.diagnosis.icd10) + '</span><div class="b">' + esc(c.diagnosis.title) + '</div>' + (c.diagnosis.description ? '<p class="sm muted">' + esc(c.diagnosis.description) + '</p>' : '') + '</div>' +
        (c.diagnosis.recommendations ? '<p class="sm" style="white-space:pre-wrap">' + esc(c.diagnosis.recommendations) + '</p>' : '') +
        (c.prescription ? rxCard(c.prescription, { download: true, cancel: mine, doctor: c.doctor }) : '<p class="sm muted">' + esc(t('Retseptsiz.')) + '</p>') + '</div>';
    }
    if (!mine || c.status !== 'ASSIGNED') return '';
    const f = s.form;
    const referBanner = c.referredAt ? '<div class="alert info sm">' + icon('calendar', 18) + '<div><b>' + esc(t('Siz bu bemorni tibbiy ko‘rikka taklif qildingiz')) + '</b>' + (c.referralNote ? '<div class="sm">' + esc(c.referralNote) + '</div>' : '') + '<div class="xs faint">' + fmtDate(c.referredAt) + '</div></div></div>' : '';
    if (!f) return '<div class="glass card col">' + referBanner + '<h3>' + esc(t('Tashxis va retsept')) + '</h3><p class="sm muted">' + esc(t('AI qoralamasidan foydalaning yoki o‘zingiz yozing. Onlayn ma’lumot yetarli bo‘lmasa, bemorni ko‘rikka taklif qiling.')) + '</p>' +
      '<div class="row" style="gap:8px"><button class="btn" data-act="manual">' + icon('edit', 18) + esc(t('Tashxisni qo‘lda yozish')) + '</button>' + (c.referredAt ? '' : '<button class="btn btn-ghost" data-act="referOpen">' + icon('calendar', 18) + esc(t('Tibbiy ko‘rikka chaqirish')) + '</button>') + '</div></div>';
    const items = f.items.map((it) => ({ med: medById(it.medicineId), doseMg: Number(it.doseMg) || null, timesPerDay: Number(it.timesPerDay) }));
    const checks = safetyCheck(items, patientForSafety());
    const inter = interactions(items.map((i) => i.med && i.med.code));
    return '<div class="glass card col" id="dxform">' + referBanner + '<div class="row between"><h3>' + esc(t('Tashxis va retsept')) + '</h3><button class="btn btn-ghost btn-sm" data-act="formClose">' + esc(t('Yopish')) + '</button></div>' +
      '<datalist id="icd-list">' + s.icd.map((x) => '<option value="' + x.code + '">' + esc(x.title) + '</option>').join('') + '</datalist>' +
      '<div class="grid" style="grid-template-columns:130px minmax(0,1fr);gap:10px"><label class="field"><span>ICD-10</span><input class="input" id="f-icd" list="icd-list" data-bind="f.icd10" value="' + esc(f.icd10) + '" placeholder="J06.9" style="text-transform:uppercase"></label>' +
      '<label class="field"><span>' + esc(t('Tashxis nomi')) + '</span><input class="input" id="f-title" data-bind="f.title" value="' + esc(f.title) + '"></label></div>' +
      '<label class="field"><span>' + esc(t('Tavsif')) + '</span><textarea class="input" id="f-desc" data-bind="f.description" style="min-height:70px">' + esc(f.description) + '</textarea></label>' +
      '<label class="field"><span>' + esc(t('Maslahatlar (har biri yangi qatorda)')) + '</span><textarea class="input" id="f-rec" data-bind="f.recommendations">' + esc(f.recommendations) + '</textarea></label>' +
      '<label class="field"><span>' + esc(t('Xavfli belgilar (har biri yangi qatorda)')) + '</span><textarea class="input" id="f-flags" data-bind="f.redFlags" style="min-height:70px">' + esc(f.redFlags) + '</textarea></label>' +
      '<div class="row between"><h4>' + esc(t('Retsept')) + '</h4><button class="btn btn-sm" data-act="addItem">' + icon('plus', 16) + esc(t('Dori qo‘shish')) + '</button></div>' +
      f.items.map((it, i) => { const m = medById(it.medicineId) || {}; const ch = checks[i];
        return '<div class="col g6"><div class="rx-row">' +
          '<label class="field full"><span>' + esc(t('Dori')) + '</span><select class="input" id="it-m-' + i + '" data-bind="item.' + i + '.medicineId">' + s.meds.map((x) => '<option value="' + x.id + '"' + (x.id === Number(it.medicineId) ? ' selected' : '') + '>' + esc(x.name + ' ' + x.strength + ' · ' + t(x.form)) + '</option>').join('') + '</select></label>' +
          (m.mg ? '<label class="field"><span>' + esc(t('Doza, mg')) + '</span><input class="input" id="it-d-' + i + '" data-bind="item.' + i + '.doseMg" inputmode="numeric" value="' + esc(it.doseMg) + '"></label>' : '<label class="field"><span>' + esc(t('Doza')) + '</span><input class="input" id="it-d-' + i + '" data-bind="item.' + i + '.dosage" value="' + esc(it.dosage) + '"></label>') +
          '<label class="field"><span>' + esc(t('Marta/kun')) + '</span><input class="input" id="it-t-' + i + '" data-bind="item.' + i + '.timesPerDay" inputmode="numeric" value="' + esc(it.timesPerDay) + '"></label>' +
          '<label class="field"><span>' + esc(t('Kun')) + '</span><input class="input" id="it-n-' + i + '" data-bind="item.' + i + '.durationDays" inputmode="numeric" value="' + esc(it.durationDays) + '"></label>' +
          '<button class="icon-btn" data-act="rmItem" data-i="' + i + '" aria-label="' + esc(t('Dorini olib tashlash')) + '" style="margin-bottom:2px">' + icon('x', 18) + '</button>' +
          '<label class="field full"><span>' + esc(t('Qabul tartibi')) + '</span><input class="input" id="it-i-' + i + '" data-bind="item.' + i + '.instructions" value="' + esc(it.instructions) + '" placeholder="' + esc(m.std || '') + '"></label></div>' +
          (ch && ch.issues.length ? '<div class="alert ' + (ch.block ? 'err' : 'warn') + ' sm">' + icon('alert', 18) + '<div>' + esc(ch.issues.join('; ')) + '</div></div>' : '') + '</div>'; }).join('') +
      (inter.length ? '<div class="alert warn sm">' + icon('alert', 18) + '<div>' + esc(inter.join('; ')) + '</div></div>' : '') +
      (s.formErr ? '<div class="alert err sm">' + icon('alert', 18) + '<div>' + esc(s.formErr) + '</div></div>' : '') +
      '<button class="btn btn-primary btn-lg" data-act="saveDx"' + (s.saving || checks.some((x) => x.block) ? ' disabled' : '') + '>' + (s.saving ? spinner() : icon('send', 18) + esc(t('Tasdiqlash va bemorga yuborish'))) + '</button></div>';
  }

  return {
    title: 'Onlayn navbat',
    html() {
      const g = gate('Onlayn navbat'); if (g) return g;
      const c = s.c; const mine = c && c.doctor && c.doctor.id === session.user.id;
      const right = c ? '<section class="ws-right col g20">' + aiHtml(c, mine) + dxHtml(c, mine) + '</section>' : '<section class="ws-right"></section>';
      const title = t(s.filter === 'done' ? 'Yakunlanganlar' : 'Onlayn navbat');
      return shell('<div class="ws' + (s.id ? ' has-detail' : '') + '">' + queueHtml() + centerHtml() + right + '</div>',
        { title: s.id && c ? c.patient.fullName : title, subtitle: s.id ? '' : 'Dr. ' + esc(session.user.fullName) + ' · ' + esc(t(session.user.doctor.specialty)), back: s.id ? base : '#/doctor', active: base });
    },
    after() {
      const el = document.getElementById('docmap');
      if (!el || !s.c) return;
      el.value = s.c.segments.map((x) => ({ code: x.code, pain: x.pain, kind: x.kind, dur: x.dur }));
      el.addEventListener('area-click', (e) => { s.seg = s.seg === e.detail.code ? null : e.detail.code; app.render(); });
    },
    bind(k, v) {
      if (k.startsWith('f.')) { s.form[k.slice(2)] = v; if (k === 'f.icd10') { const code = String(v).trim().toUpperCase(); if (icdTitle(code) && !s.form.title) { s.form.title = icdTitle(code); app.render(); } } return; }
      if (k.startsWith('item.')) {
        const [, i, field] = k.split('.'); const it = s.form.items[Number(i)];
        it[field] = v;
        if (field === 'medicineId') { const m = medById(v); it.doseMg = m.mg || ''; it.dosage = m.mg ? '' : (m.unitDose || ''); it.instructions = ''; app.render(); }
        else if (['doseMg', 'timesPerDay'].includes(field)) app.queue();
        return;
      }
      s[k] = v;
      if (k === 'reviewed') app.render();
    },
    on: {
      ...gateActions,
      filter(el) { s.filter = el.dataset.v; s.queue = null; app.render(); loadQueue().catch((e) => toast(errMsg(e), 'err')); },
      pick(el) { go((s.filter === 'done' ? '#/doctor/done/c/' : '#/doctor/c/') + el.dataset.id); },
      view(el) { s.view = el.dataset.v; app.render(); },
      segPick(el) { const code = el.dataset.code; s.seg = s.seg === code ? null : code; const side = segmentSide(code); if (side !== 'both') s.view = side; app.render(); },
      tab(el) { s.tab = el.dataset.v; app.render(); },
      async assign() { s.busy = true; app.render(); try { s.c = await api('/consultations/' + s.id + '/assign', { method: 'POST' }); toast(t('Murojaat sizga biriktirildi')); loadQueue().catch(() => {}); loadCase().catch(() => {}); } finally { s.busy = false; app.render(); } },
      async genAi() { s.aiLoading = true; app.render(); try { s.c = await api('/consultations/' + s.id + '/ai', { method: 'POST' }); s.tab = 'dx'; s.reviewed = false; } finally { s.aiLoading = false; app.render(); } },
      rejectOpen() { s.rejecting = true; s.rejectNote = ''; app.render(); setTimeout(() => { const n = document.getElementById('rejectNote'); if (n) n.focus(); }, 0); },
      rejectCancel() { s.rejecting = false; app.render(); },
      async rejectConfirm() {
        if (s.rejectNote.trim().length < 3) { toast(t('Rad etish sababini yozing'), 'err'); return; }
        s.c = await api('/consultations/' + s.id + '/ai/reject', { method: 'POST', body: { note: s.rejectNote } });
        s.rejecting = false; s.form = emptyForm(); toast(t('Qoralama rad etildi')); app.render();
      },
      aiEdit() { s.form = formFromAi(s.c.ai); s.formErr = ''; app.render(); setTimeout(() => { const n = document.getElementById('dxform'); if (n) n.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 0); },
      async referOpen() {
        const note = await promptSheet({ title: t('Tibbiy ko‘rikka chaqirish'), label: t('Sababi (ixtiyoriy) — masalan: sinish gumoni, rentgen kerak'), ok: t('Taklif yuborish'), min: 0 });
        if (note === null) return;
        s.c = await api('/consultations/' + s.id + '/refer', { method: 'POST', body: { note } });
        toast(t('Bemorga ko‘rikka taklif yuborildi')); loadQueue().catch(() => {}); app.render();
      },
      async aiApprove() { if (!s.reviewed) return; await submitDx(formFromAi(s.c.ai), 'APPROVED'); },
      manual() { s.form = emptyForm(); s.formErr = ''; app.render(); },
      formClose() { s.form = null; s.formErr = ''; app.render(); },
      addItem() { const m = s.meds[0]; s.form.items.push({ medicineId: m.id, doseMg: m.mg || '', dosage: m.mg ? '' : (m.unitDose || ''), timesPerDay: 3, durationDays: 3, instructions: '' }); app.render(); },
      rmItem(el) { s.form.items.splice(Number(el.dataset.i), 1); app.render(); },
      async saveDx() { await submitDx(s.form, s.form.fromAi ? 'MODIFIED' : undefined); },
      async rxCancelOpen() {
        const reason = await promptSheet({ title: t('Retseptni bekor qilish'), text: t('Retsept o‘chirilmaydi: “bekor qilingan” deb belgilanadi, sabab audit jurnaliga yoziladi. Dorixona tekshirsa, bekor qilinganini ko‘radi.'), label: t('Sabab'), placeholder: t('Masalan: doza qayta ko‘rib chiqildi'), ok: t('Bekor qilish'), min: 3, danger: true });
        if (!reason) return;
        await api('/prescriptions/' + s.c.prescription.id + '/cancel', { method: 'POST', body: { reason } });
        toast(t('Retsept bekor qilindi')); await loadCase();
      },
      qrFull() {},
      async pdf() { await downloadFile('/prescriptions/' + s.c.prescription.id + '/pdf', 'retsept-' + s.c.prescription.number + '.pdf'); },
      async file(el) { await openFile('/attachments/' + el.dataset.id); },
      async send() {
        const tx = s.draft.trim(); if (!tx || s.sending) return;
        s.sending = true; app.render();
        try { await api('/consultations/' + s.id + '/messages', { method: 'POST', body: { content: tx } }); s.draft = ''; await loadCase(); }
        finally { s.sending = false; app.render(); }
      }
    },
    async mount() {
      if (gate()) return;
      const cat = await catalog(); s.meds = cat.medicines; s.icd = cat.icd10;
      await Promise.all([loadQueue(), loadCase().catch((e) => { s.error = errMsg(e); toast(s.error, 'err'); })]);
      app.render();
      stopQ = poller(loadQueue, 10000);
      if (s.id) stopC = poller(loadCase, 5000);
    },
    unmount() { if (stopQ) stopQ(); if (stopC) stopC(); }
  };
}

/* ---------------- offline visits queue ---------------- */
export function doctorVisits(params) {
  const s = { date: (params.query && params.query.get('date')) || dayKey(Date.now()), data: null, notes: {}, error: '' };
  let stop = null;
  const load = async () => { const d = await api('/doctor/appointments?date=' + s.date); if (JSON.stringify(d) !== JSON.stringify(s.data)) { s.data = d; app.render(); } };
  const shift = (n) => { const d = new Date(s.date + 'T00:00'); d.setDate(d.getDate() + n); return dayKey(d); };
  return {
    title: 'Jonli qabul navbati',
    html() {
      const g = gate('Jonli qabul navbati'); if (g) return g;
      const items = (s.data && s.data.items) || [];
      const live = items.filter((a) => a.status !== 'CANCELLED');
      const current = live.find((a) => a.status === 'IN_PROGRESS');
      const next = live.find((a) => ['ARRIVED', 'BOOKED'].includes(a.status) && a !== current);
      const strip = '<div class="day-tabs">' + Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i); const k = dayKey(d); const n = (s.data && s.data.upcoming[k]) || 0; return '<button class="day-tab" data-act="date" data-v="' + k + '" aria-pressed="' + (s.date === k) + '"><span class="xs">' + esc(t(WEEKDAYS[d.getDay()]).slice(0, 3)) + '</span><b>' + d.getDate() + '</b><span class="xs ' + (n ? 'ok-t' : 'faint') + '">' + (n ? esc(t('{n} ta', { n })) : '—') + '</span></button>'; }).join('') + '</div>';
      const nav = '<div class="glass card tight row between"><div class="row nw" style="gap:6px"><button class="icon-btn" data-act="date" data-v="' + shift(-1) + '" aria-label="' + esc(t('Oldingi kun')) + '">' + icon('back', 18) + '</button><input class="input" type="date" id="vdate" data-bind="date" value="' + s.date + '" style="min-height:42px;width:auto"><button class="icon-btn" data-act="date" data-v="' + shift(1) + '" aria-label="' + esc(t('Keyingi kun')) + '">' + icon('next', 18) + '</button></div>' +
        '<div class="row nw sm" style="gap:14px"><span>' + esc(t('Jami')) + ': <b>' + live.length + '</b></span><span>' + esc(t('Yakunlandi')) + ': <b>' + live.filter((a) => a.status === 'DONE').length + '</b></span><span>' + esc(t('Kelmadi')) + ': <b>' + live.filter((a) => a.status === 'NO_SHOW').length + '</b></span></div></div>';
      const card = (a, i) => {
        const p = a.patient || {};
        const acts = {
          BOOKED: [['ARRIVED', 'Keldi', 'btn-mint', 'check'], ['IN_PROGRESS', 'Qabulga chaqirish', 'btn-primary', 'door'], ['NO_SHOW', 'Kelmadi', 'btn-ghost', 'x'], ['CANCELLED', 'Bekor qilish', 'btn-danger', 'trash']],
          ARRIVED: [['IN_PROGRESS', 'Qabulga chaqirish', 'btn-primary', 'door'], ['NO_SHOW', 'Kelmadi', 'btn-ghost', 'x']],
          IN_PROGRESS: [['DONE', 'Qabulni yakunlash', 'btn-primary', 'check']], NO_SHOW: [['ARRIVED', 'Keldi', 'btn-mint', 'check']], DONE: [], CANCELLED: []
        }[a.status] || [];
        return '<article class="glass card col vq ' + a.status + (a === current ? ' current' : a === next ? ' next' : '') + '" style="--d:' + i + '"><div class="row between nw top"><div class="row nw" style="gap:12px"><span class="qno">' + (a.queueNo || '–') + '</span>' + avatar(p, { size: 46, private: true }) +
          '<div><b>' + esc(p.fullName) + '</b><div class="sm muted">' + esc((p.age ?? '—') + ' ' + t('yosh') + ' · ' + gender(p.gender)) + ' · ' + fmtTime(a.startAt) + '–' + fmtTime(a.endAt) + '</div></div></div><div class="col g6" style="align-items:flex-end">' + apptPill(a.status) + (a === current ? '<span class="pill warn">' + esc(t('Hozir kabinetda')) + '</span>' : a === next ? '<span class="pill info">' + esc(t('Keyingi')) + '</span>' : '') + '</div></div>' +
          (a.reason ? '<p class="sm"><span class="faint">' + esc(t('Sabab:')) + '</span> ' + esc(a.reason) + '</p>' : '') +
          (a.segments.length ? '<div class="choices">' + a.segments.map((c) => '<span class="pill">' + esc(t(SEGMENT_NAMES[c])) + '</span>').join('') + '</div>' : '') +
          (p.allergies ? '<div class="alert err sm">' + icon('alert', 16) + '<div>' + esc(t('Allergiya')) + ': ' + esc(p.allergies) + '</div></div>' : '') +
          (a.status === 'IN_PROGRESS' || a.status === 'DONE' ? '<label class="field"><span>' + esc(t('Qabul izohi (bemorga ko‘rinadi)')) + '</span><textarea class="input" id="note-' + a.id + '" data-bind="note.' + a.id + '" style="min-height:70px">' + esc(s.notes[a.id] ?? a.doctorNote) + '</textarea></label>' : '') +
          '<div class="row" style="gap:8px">' + (p.phone ? '<a class="btn btn-sm" href="tel:+' + esc(p.phone) + '">' + icon('phone', 16) + fmtPhone(p.phone) + '</a>' : '') + acts.map(([st, l, cls, ic]) => '<button class="btn ' + cls + ' btn-sm" data-act="status" data-id="' + a.id + '" data-v="' + st + '">' + icon(ic, 16) + esc(t(l)) + '</button>').join('') +
          (a.status === 'DONE' ? '<button class="btn btn-ghost btn-sm" data-act="saveNote" data-id="' + a.id + '">' + esc(t('Izohni saqlash')) + '</button>' : '') + '</div></article>';
      };
      const body = s.error ? '<div class="alert err">' + esc(s.error) + '</div>' : !s.data ? skeletons(3) : !items.length ? empty('calendar', t('Bu kunga yozilgan bemor yo‘q'), t('Bemorlar ish jadvalingizdagi bo‘sh vaqtlarga yoziladi.'), '<a class="btn" href="#/doctor/schedule">' + icon('clock', 16) + esc(t('Ish jadvalini sozlash')) + '</a>') : '<div class="col">' + items.map(card).join('') + '</div>';
      return shell('<div class="col g20" style="max-width:900px">' + strip + nav + (next && !current ? '<button class="btn btn-primary btn-lg call-next" data-act="status" data-id="' + next.id + '" data-v="IN_PROGRESS">' + icon('door', 20) + esc(t('Keyingi bemorni chaqirish: {n}', { n: next.patient.fullName })) + '</button>' : '') + body + '</div>',
        { title: t('Jonli qabul navbati'), subtitle: esc(fmtDayLong(s.date + 'T00:00')), back: '#/doctor' });
    },
    bind(k, v) { if (k.startsWith('note.')) { s.notes[k.slice(5)] = v; return; } if (k === 'date' && v) { s.date = v; s.data = null; app.render(); load().catch(() => {}); } },
    on: {
      ...gateActions,
      date(el) { s.date = el.dataset.v; s.data = null; app.render(); load().catch((e) => toast(errMsg(e), 'err')); },
      async status(el) {
        const v = el.dataset.v; let reason;
        if (v === 'CANCELLED') { reason = await promptSheet({ title: t('Qabulni bekor qilish'), label: t('Sabab (bemorga yuboriladi)'), ok: t('Bekor qilish'), min: 3, danger: true }); if (!reason) return; }
        if (v === 'NO_SHOW' && !(await confirmSheet({ title: t('Bemor kelmadimi?'), ok: t('Ha, kelmadi') }))) return;
        const body = { status: v, reason };
        if (v === 'DONE' && s.notes[el.dataset.id] !== undefined) body.note = s.notes[el.dataset.id];
        await api('/doctor/appointments/' + el.dataset.id, { method: 'PATCH', body });
        toast(t(APPT_STATUS[v][0])); await load();
      },
      async saveNote(el) { await api('/doctor/appointments/' + el.dataset.id, { method: 'PATCH', body: { note: s.notes[el.dataset.id] ?? '' } }); toast(t('Saqlandi')); await load(); }
    },
    async mount() { if (gate()) return; try { await load(); } catch (e) { s.error = errMsg(e); app.render(); } stop = poller(load, 15000); },
    unmount() { if (stop) stop(); }
  };
}

/* ---------------- schedule ---------------- */
export function doctorSchedule() {
  const d0 = session.user.doctor;
  const s = { wh: JSON.parse(JSON.stringify(d0.workHours)), slot: d0.slotMinutes || 30, saving: false };
  const mins = (v) => { const [h, m] = String(v).split(':').map(Number); return h * 60 + m; };
  return {
    title: 'Ish jadvali',
    html() {
      const d = session.user.doctor;
      const perDay = (x) => (x.on ? Math.max(0, Math.floor((mins(x.end) - mins(x.start)) / s.slot)) : 0);
      const total = [0, 1, 2, 3, 4, 5, 6].reduce((a, i) => a + perDay(s.wh[i] || {}), 0);
      const rows = [1, 2, 3, 4, 5, 6, 0].map((i) => { const x = s.wh[i] || { on: false, start: '09:00', end: '17:00' }; return '<div class="wh-edit' + (x.on ? '' : ' off') + '"><button class="switch" role="switch" aria-checked="' + !!x.on + '" data-act="dayOn" data-i="' + i + '" aria-label="' + esc(t(WEEKDAYS[i])) + '"></button><b class="wd">' + esc(t(WEEKDAYS[i])) + '</b>' +
        '<input class="input" type="time" id="ws-' + i + '" data-bind="wh.' + i + '.start" aria-label="' + esc(t('{day} — boshlanish vaqti', { day: t(WEEKDAYS[i]) })) + '" value="' + esc(x.start) + '"' + (x.on ? '' : ' disabled') + '><span class="faint" aria-hidden="true">—</span><input class="input" type="time" id="we-' + i + '" data-bind="wh.' + i + '.end" aria-label="' + esc(t('{day} — tugash vaqti', { day: t(WEEKDAYS[i]) })) + '" value="' + esc(x.end) + '"' + (x.on ? '' : ' disabled') + '><span class="xs muted nowrap">' + (x.on ? esc(t('{n} ta qabul', { n: perDay(x) })) : esc(t('Dam olish'))) + '</span></div>'; }).join('');
      return shell('<div class="grid g2" style="align-items:start;max-width:1100px"><div class="glass card lg col g20">' + sectionHead(t('Haftalik ish vaqti')) + '<p class="sm muted">' + esc(t('Bemorlar faqat shu vaqtlardagi bo‘sh joylarga yozila oladi.')) + '</p>' + rows +
        '<div class="field"><span>' + esc(t('Bitta qabul davomiyligi')) + '</span><div class="seg">' + [15, 20, 30, 45, 60].map((m) => '<button data-act="slot" data-v="' + m + '" aria-pressed="' + (s.slot === m) + '">' + esc(t('{n} daq', { n: m })) + '</button>').join('') + '</div></div>' +
        '<div class="well row between"><span class="sm">' + esc(t('Haftasiga jami')) + '</span><b>' + esc(t('{n} ta qabul', { n: total })) + '</b></div>' +
        '<button class="btn btn-primary btn-lg" data-act="save"' + (s.saving ? ' disabled' : '') + '>' + (s.saving ? spinner() : icon('check', 18, 2.6) + esc(t('Jadvalni saqlash'))) + '</button></div>' +
        '<div class="col g20"><div class="glass card col">' + sectionHead(t('Hozirgi holatim')) + '<p class="sm muted">' + esc(t('Bemorlar shifokorlar ro‘yxatida holatingizni ko‘radi.')) + '</p>' + presenceSwitch(d.presence) + '</div>' +
        '<div class="glass card col">' + sectionHead(t('Maslahat')) + '<ul class="ticks sm"><li>' + icon('check', 16, 2.6) + '<span>' + esc(t('Tushlik vaqtini ajratish uchun kunni ikki qismga bo‘lmang — qisqaroq ish vaqtini belgilang.')) + '</span></li><li>' + icon('check', 16, 2.6) + '<span>' + esc(t('Jadval o‘zgarsa, allaqachon yozilgan bemorlar saqlanib qoladi.')) + '</span></li><li>' + icon('check', 16, 2.6) + '<span>' + esc(t('Ishdan chiqqanda holatni “Mavjud emas” qiling.')) + '</span></li></ul></div></div></div>',
        { title: t('Ish jadvali'), subtitle: esc(t('Qabul vaqtlari va holat')), back: '#/doctor' });
    },
    bind(k, v) { if (k.startsWith('wh.')) { const [, i, f] = k.split('.'); s.wh[i] = { ...(s.wh[i] || { on: true }), [f]: v }; app.queue(); } },
    on: {
      dayOn(el) { const i = el.dataset.i; s.wh[i] = { start: '09:00', end: '17:00', ...(s.wh[i] || {}), on: !(s.wh[i] && s.wh[i].on) }; app.render(); },
      slot(el) { s.slot = Number(el.dataset.v); app.render(); },
      presence: presenceAction,
      async save() { s.saving = true; app.render(); try { session.user = await api('/doctor/schedule', { method: 'PUT', body: { workHours: s.wh, slotMinutes: s.slot } }); toast(t('Jadval saqlandi')); } finally { s.saving = false; app.render(); } }
    }
  };
}

/* ---------------- statistics + report ---------------- */
export function doctorStats() {
  const today = dayKey(Date.now());
  const monthAgo = dayKey(Date.now() - 29 * 86400000);
  const s = { days: 30, st: null, from: monthAgo, to: today, rep: null, repLoading: false, error: '' };
  const load = async () => { s.st = await api('/doctor/stats?days=' + s.days); app.render(); };
  const ST = { BOOKED: 'Yozilgan', ARRIVED: 'Keldi', IN_PROGRESS: 'Qabulda', DONE: 'Yakunlandi', CANCELLED: 'Bekor qilingan', NO_SHOW: 'Kelmadi' };
  return {
    title: 'Statistika va hisobot',
    html() {
      const g = gate('Statistika'); if (g) return g;
      const st = s.st;
      const period = '<div class="seg">' + [7, 30, 90].map((n) => '<button data-act="days" data-v="' + n + '" aria-pressed="' + (s.days === n) + '">' + esc(t('{n} kun', { n })) + '</button>').join('') + '</div>';
      let stats = skeletons(3);
      if (st) {
        stats = '<div class="grid g4 keep2">' + kpi(st.totals.online, t('Onlayn tashxis'), icon('chat', 18), 'tone-blue') + kpi(st.totals.visitsDone, t('Klinikadagi qabul'), icon('calendar', 18), 'tone-mint') +
          kpi(st.totals.avgResponseMin != null ? st.totals.avgResponseMin + ' ' + t('daq') : '—', t('O‘rtacha javob vaqti'), icon('clock', 18)) + kpi(fmtMoney(st.totals.income), t('Taxminiy daromad'), icon('wallet', 18), 'tone-amber') + '</div>' +
          '<div class="glass card col">' + sectionHead(t('Kunlik dinamika')) + barChart({ labels: st.daily.map((x) => x.d), series: [{ label: 'Onlayn tashxis', color: 'var(--primary)', values: st.daily.map((x) => x.online) }, { label: 'Klinikadagi qabul', color: 'var(--mint)', values: st.daily.map((x) => x.visits) }], label: t('Kunlik dinamika') }) + '</div>' +
          '<div class="grid g3" style="align-items:start"><div class="glass card col">' + sectionHead(t('Xavf darajasi')) + donut([[SEV_LABEL.GREEN, st.bySeverity.GREEN || 0, 'var(--mint)'], [SEV_LABEL.YELLOW, st.bySeverity.YELLOW || 0, 'var(--amber)'], [SEV_LABEL.RED, st.bySeverity.RED || 0, 'var(--coral)']], { size: 130 }) + '</div>' +
          '<div class="glass card col">' + sectionHead(t('Bemorlar bahosi')) + '<div class="row nw" style="gap:12px"><b style="font-size:40px;line-height:1">' + (st.rating.avg ? st.rating.avg.toFixed(1) : '—') + '</b><div>' + stars(st.rating.avg, 16) + '<div class="xs faint">' + esc(t('{n} ta baho', { n: st.rating.count })) + '</div></div></div>' +
          '<div class="dist">' + [5, 4, 3, 2, 1].map((n) => { const c = st.rating.distribution[n - 1]; return '<div class="row nw sm" style="gap:8px"><span style="width:14px">' + n + '</span><div class="hbar grow"><i style="width:' + (100 * c / Math.max(1, st.rating.count)) + '%;background:var(--amber)"></i></div><span class="faint" style="width:22px;text-align:right">' + c + '</span></div>'; }).join('') + '</div></div>' +
          '<div class="glass card col">' + sectionHead(t('Ko‘p qo‘yilgan tashxislar')) + (st.topDiagnoses.length ? st.topDiagnoses.map((x) => '<div class="row between sm nw"><span class="ellipsis"><b>' + esc(x.code) + '</b> ' + esc(x.title) + '</span><b>' + x.n + '</b></div>').join('') : '<p class="sm muted">' + esc(t('Ma’lumot yo‘q')) + '</p>') + '<div class="hr"></div><div class="row between sm"><span>' + esc(t('Kelmagan bemorlar')) + '</span><b>' + st.totals.noShow + '</b></div></div></div>';
      }
      const r = s.rep;
      const report = '<div class="glass card lg col g20" id="report">' + sectionHead(t('Hisobot'), '') + '<div class="row"><label class="field"><span>' + esc(t('Dan')) + '</span><input class="input" type="date" id="rfrom" data-bind="from" max="' + today + '" value="' + s.from + '"></label><label class="field"><span>' + esc(t('Gacha')) + '</span><input class="input" type="date" id="rto" data-bind="to" min="' + s.from + '" max="' + today + '" value="' + s.to + '"></label>' +
        '<button class="btn btn-primary" style="align-self:flex-end" data-act="report"' + (s.repLoading ? ' disabled' : '') + '>' + (s.repLoading ? spinner() : icon('file', 18) + esc(t('Hisobotni tayyorlash'))) + '</button></div>' +
        (r ? '<div class="report-doc"><div class="row between"><div><b class="lg">' + esc(t('Shifokor faoliyati hisoboti')) + '</b><div class="sm muted">Dr. ' + esc(r.doctor.fullName) + ' · ' + esc(t(r.doctor.specialty)) + ' · ' + esc(r.doctor.licenseNumber) + (r.doctor.clinicName ? ' · ' + esc(r.doctor.clinicName) : '') + '</div><div class="sm muted">' + esc(fmtDay(r.from + 'T00:00')) + ' — ' + esc(fmtDay(r.to + 'T00:00')) + '</div></div>' +
          '<div class="row no-print"><button class="btn btn-sm" data-act="csv">' + icon('download', 16) + 'CSV (Excel)</button><button class="btn btn-sm" data-act="print">' + icon('printer', 16) + esc(t('Chop etish')) + '</button></div></div>' +
          '<div class="kv">' + [['Onlayn tashxis', r.totals.consultations], ['Retseptlar', r.totals.prescriptions], ['Klinikadagi qabul', r.totals.visitsDone], ['Kelmadi', r.totals.noShow], ['Bekor qilingan', r.totals.cancelled], ['Baholar', r.totals.reviews + (r.totals.rating ? ' · ' + r.totals.rating + '★' : '')], ['Taxminiy daromad', fmtMoney(r.totals.income)]].map(([l, v]) => '<div><span>' + esc(t(l)) + '</span><b>' + esc(v) + '</b></div>').join('') + '</div>' +
          '<h4>' + esc(t('Onlayn tashxislar')) + '</h4><div class="table-wrap"><table class="t"><thead><tr><th>' + esc(t('Sana')) + '</th><th>' + esc(t('Bemor')) + '</th><th>ICD-10</th><th>' + esc(t('Tashxis')) + '</th><th>' + esc(t('Retsept')) + '</th></tr></thead><tbody>' + (r.consultations.length ? r.consultations.map((x) => '<tr><td class="nowrap sm">' + fmtDate(x.date) + '</td><td>' + esc(x.patient) + ' <span class="faint xs">' + esc((x.age ?? '') + ' ' + gender(x.gender)) + '</span></td><td>' + esc(x.icd10) + '</td><td>' + esc(x.title) + '</td><td class="sm">' + esc(x.rx) + '</td></tr>').join('') : '<tr><td colspan="5" class="muted">' + esc(t('Yo‘q')) + '</td></tr>') + '</tbody></table></div>' +
          '<h4>' + esc(t('Klinikadagi qabullar')) + '</h4><div class="table-wrap"><table class="t"><thead><tr><th>' + esc(t('Sana')) + '</th><th>' + esc(t('Bemor')) + '</th><th>' + esc(t('Holat')) + '</th><th>' + esc(t('Narx')) + '</th><th>' + esc(t('Sabab')) + '</th></tr></thead><tbody>' + (r.appointments.length ? r.appointments.map((x) => '<tr><td class="nowrap sm">' + fmtDate(x.date) + '</td><td>' + esc(x.patient) + '</td><td>' + apptPill(x.status) + '</td><td class="nowrap">' + fmtMoney(x.price) + '</td><td class="sm muted">' + esc(x.reason) + '</td></tr>').join('') : '<tr><td colspan="5" class="muted">' + esc(t('Yo‘q')) + '</td></tr>') + '</tbody></table></div></div>' : '') + '</div>';
      return shell('<div class="col g20">' + (s.error ? '<div class="alert err">' + esc(s.error) + '</div>' : '') + stats + report + '</div>', { title: t('Statistika va hisobot'), back: '#/doctor', actions: period });
    },
    bind(k, v) { s[k] = v; },
    on: {
      ...gateActions,
      async days(el) { s.days = Number(el.dataset.v); s.st = null; app.render(); await load(); },
      async report() { s.repLoading = true; app.render(); try { s.rep = await api('/doctor/report?from=' + s.from + '&to=' + s.to); } finally { s.repLoading = false; app.render(); } },
      csv() {
        const r = s.rep;
        const rows = [[t('Shifokor faoliyati hisoboti'), 'Dr. ' + r.doctor.fullName, r.from + ' — ' + r.to], [],
          [t('Onlayn tashxislar')], [t('Sana'), t('Bemor'), t('Yosh'), 'ICD-10', t('Tashxis'), t('Xavf darajasi'), t('Retsept')],
          ...r.consultations.map((x) => [fmtDate(x.date), x.patient, x.age, x.icd10, x.title, t(SEV_LABEL[x.severity]), x.rx]), [],
          [t('Klinikadagi qabullar')], [t('Sana'), t('Bemor'), t('Holat'), t('Narx'), t('Sabab')],
          ...r.appointments.map((x) => [fmtDate(x.date), x.patient, t(ST[x.status]), x.price, x.reason]), [],
          [t('Jami')], [t('Onlayn tashxis'), r.totals.consultations], [t('Klinikadagi qabul'), r.totals.visitsDone], [t('Kelmadi'), r.totals.noShow], [t('Taxminiy daromad'), r.totals.income], [t('Reyting'), r.totals.rating ?? '']];
        downloadCsv('hisobot-' + r.from + '-' + r.to + '.csv', rows);
      },
      print() { window.print(); }
    },
    async mount() { if (gate()) return; try { await load(); } catch (e) { s.error = errMsg(e); app.render(); } }
  };
}

/* ---------------- profile (editable) ---------------- */
const DOCTOR_PROFILE_MENU = [
  ['personal', 'user', 'Shaxsiy ma’lumotlar', 'Ism, mutaxassislik, tajriba, litsenziya'],
  ['clinic', 'building', 'Klinika va manzil', 'Klinika nomi, manzili, litsenziya nusxasi'],
  ['prices', 'wallet', 'Narxlar', 'Onlayn va klinikadagi qabul narxi'],
  ['security', 'lock', 'Xavfsizlik va sozlamalar', 'Parol, til, bildirishnoma, chiqish']
];
/** Profil → bitta menyu + har bir bo‘lim o‘z alohida sahifasida (o‘z URL bilan). */
export function doctorProfile(params = {}) {
  const section = params.section || 'menu';
  const u0 = session.user; const d0 = u0.doctor;
  const f = { fullName: u0.fullName, specialtyId: String(d0.specialtyId), licenseNumber: d0.licenseNumber, experienceYears: String(d0.experienceYears), clinicName: d0.clinicName || '', clinicAddress: d0.clinicAddress || '', clinicLat: d0.clinicLat ?? '', clinicLng: d0.clinicLng ?? '', priceOnline: String(d0.priceOnline || ''), priceVisit: String(d0.priceVisit || ''), bio: d0.bio || '', specialties: [], saving: false, locating: false, current: '', next: '', pwSaving: false, photoBusy: false, qr: '' };
  return {
    title: 'Profil',
    html() {
      const u = session.user; const d = u.doctor;
      const ST = { VERIFIED: ['Tasdiqlangan', 'ok'], PENDING: ['Tekshirilmoqda', 'warn'], BLOCKED: ['Bloklangan', 'err'] };
      if (section === 'security') return shell('<div class="col g20" style="max-width:640px">' + securityCard(f) + '</div>', { title: t('Xavfsizlik va sozlamalar'), back: '#/doctor/profile' });
      if (section === 'menu') {
        const rows = DOCTOR_PROFILE_MENU.map(([key, ic, label, sub]) => '<a class="item" href="#/doctor/profile/' + key + '">' + icon(ic, 20) + '<span class="grow"><b>' + esc(t(label)) + '</b><br><span class="sm muted">' + esc(t(sub)) + '</span></span>' + icon('next', 18) + '</a>').join('');
        const validUntil = fmtDay(u0.createdAt + 3 * 365 * 86400000);
        const card = idCard(u, { role: 'doctor', title: t('Shifokor guvohnomasi'), qr: f.qr, fields: [[t('Ixtisosligi'), d.specialty], [t('Litsenziya'), d.licenseNumber], [t('Tajriba'), d.experienceYears ? t('{n} yil', { n: d.experienceYears }) : ''], [t('Amal qiladi'), validUntil]] });
        return shell('<div class="col g20" style="max-width:640px">' + card + '<div class="glass card lg col g20">' + photoBlock(u, f, false) +
          '<div class="row" style="gap:8px">' + '<span class="pill ' + ST[d.status][1] + '">' + icon('shield', 13) + esc(t(ST[d.status][0])) + '</span>' + presencePill(d.presence) + '</div></div>' +
          '<div class="col g12">' + rows + '</div></div>', { title: t('Profil'), subtitle: esc(t('Bemorlar ko‘radigan ma’lumotlar')), back: '#/doctor' });
      }
      const personalTab = '<label class="field"><span>' + esc(t('Ism va familiya')) + '</span><input class="input" id="fullName" data-bind="fullName" value="' + esc(f.fullName) + '"></label>' +
        '<div class="grid g2"><label class="field"><span>' + esc(t('Mutaxassislik (yo‘nalish)')) + '</span><select class="input" id="specialtyId" data-bind="specialtyId">' + f.specialties.map((x) => '<option value="' + x.id + '"' + (String(x.id) === f.specialtyId ? ' selected' : '') + '>' + esc(t(x.name)) + '</option>').join('') + '</select></label>' +
        '<label class="field"><span>' + esc(t('Tajriba, yil')) + '</span><input class="input" id="experienceYears" data-bind="experienceYears" inputmode="numeric" maxlength="2" value="' + esc(f.experienceYears) + '"></label></div>' +
        '<label class="field"><span>' + esc(t('Litsenziya raqami')) + '</span><input class="input" id="licenseNumber" data-bind="licenseNumber" value="' + esc(f.licenseNumber) + '" style="text-transform:uppercase"><small>' + esc(t('Litsenziya yoki mutaxassislik o‘zgarsa, profil qayta tekshiruvga yuboriladi.')) + '</small></label>' +
        '<label class="field"><span>' + esc(t('O‘zim haqimda')) + '</span><textarea class="input" id="bio" data-bind="bio" maxlength="1500" placeholder="' + esc(t('Ta’lim, tajriba, qanday kasalliklarni davolaysiz')) + '">' + esc(f.bio) + '</textarea></label>';
      const clinicTab = '<label class="field"><span>' + esc(t('Ishlaydigan klinika nomi')) + '</span><input class="input" id="clinicName" data-bind="clinicName" value="' + esc(f.clinicName) + '"></label>' +
        '<label class="field"><span>' + esc(t('Klinika manzili')) + '</span><textarea class="input" id="clinicAddress" data-bind="clinicAddress" maxlength="300" style="min-height:70px" placeholder="' + esc(t('Shahar, tuman, ko‘cha, uy')) + '">' + esc(f.clinicAddress) + '</textarea></label>' +
        '<div class="grid g2"><label class="field"><span>' + esc(t('Kenglik (lat)')) + '</span><input class="input" id="clinicLat" data-bind="clinicLat" inputmode="decimal" value="' + esc(f.clinicLat) + '"></label><label class="field"><span>' + esc(t('Uzunlik (lng)')) + '</span><input class="input" id="clinicLng" data-bind="clinicLng" inputmode="decimal" value="' + esc(f.clinicLng) + '"></label></div>' +
        '<button class="btn btn-sm" style="align-self:flex-start" data-act="locate"' + (f.locating ? ' disabled' : '') + '>' + (f.locating ? spinner() : icon('navigation', 16)) + esc(t('Hozirgi joylashuvni olish (klinikada turganda)')) + '</button>' +
        '<div class="hr"></div><h4 style="margin:0">' + esc(t('Litsenziya nusxasi')) + '</h4><span class="sm muted">' + esc(t(d.licenseFileId ? 'Yuklangan.' : 'Yuklanmagan.')) + '</span><label class="btn btn-sm" style="align-self:flex-start;cursor:pointer">' + icon('clip', 16) + esc(t('Fayl yuklash')) + '<input type="file" class="sr" data-file="license" accept="image/jpeg,image/png,application/pdf"></label>';
      const pricesTab = '<div class="grid g2"><label class="field"><span>' + esc(t('Onlayn tashxis narxi, so‘m')) + '</span><input class="input" id="priceOnline" data-bind="priceOnline" inputmode="numeric" value="' + esc(f.priceOnline) + '" placeholder="0"></label><label class="field"><span>' + esc(t('Klinikada qabul narxi, so‘m')) + '</span><input class="input" id="priceVisit" data-bind="priceVisit" inputmode="numeric" value="' + esc(f.priceVisit) + '" placeholder="0"></label></div>';
      const TITLES = { personal: 'Shaxsiy ma’lumotlar', clinic: 'Klinika va manzil', prices: 'Narxlar' };
      const body = { personal: personalTab, clinic: clinicTab, prices: pricesTab }[section] || personalTab;
      return shell('<div class="glass card lg col g20" style="max-width:640px"><div class="col g20">' + body + '</div>' +
        '<button class="btn btn-primary btn-lg" data-act="save"' + (f.saving ? ' disabled' : '') + '>' + (f.saving ? spinner() : icon('check', 18, 2.6) + esc(t('Saqlash'))) + '</button></div>',
        { title: t(TITLES[section] || 'Shaxsiy ma’lumotlar'), back: '#/doctor/profile' });
    },
    bind(k, v) { f[k] = v; },
    on: {
      ...gateActions, ...photoActions(f), ...accountActions(f),
      changePw: () => changePassword(f),
      locate() {
        if (!navigator.geolocation) { toast(t('Brauzeringiz joylashuvni aniqlay olmaydi'), 'err'); return; }
        f.locating = true; app.render();
        navigator.geolocation.getCurrentPosition((p) => { f.clinicLat = p.coords.latitude.toFixed(6); f.clinicLng = p.coords.longitude.toFixed(6); f.locating = false; app.render(); toast(t('Joylashuv olindi')); },
          () => { f.locating = false; app.render(); toast(t('Joylashuvni aniqlab bo‘lmadi. HTTPS orqali ochilganini tekshiring'), 'err'); }, { enableHighAccuracy: true, timeout: 12000 });
      },
      async save() {
        const d = session.user.doctor;
        const reverify = f.licenseNumber.trim().toUpperCase() !== d.licenseNumber || Number(f.specialtyId) !== d.specialtyId;
        if (reverify && d.status === 'VERIFIED' && !(await confirmSheet({ title: t('Qayta tekshiruv'), text: t('Litsenziya yoki mutaxassislik o‘zgarmoqda. Administrator qayta tasdiqlaguncha bemorlar navbati yopiladi. Davom etasizmi?'), ok: t('Ha, saqlash') }))) return;
        f.saving = true; app.render();
        try {
          const r = await api('/doctor/profile', { method: 'PUT', body: { fullName: f.fullName, specialtyId: Number(f.specialtyId), licenseNumber: f.licenseNumber, experienceYears: Number(f.experienceYears || 0), clinicName: f.clinicName, clinicAddress: f.clinicAddress, clinicLat: f.clinicLat === '' ? null : Number(f.clinicLat), clinicLng: f.clinicLng === '' ? null : Number(f.clinicLng), priceOnline: Number(String(f.priceOnline).replace(/\s/g, '') || 0), priceVisit: Number(String(f.priceVisit).replace(/\s/g, '') || 0), bio: f.bio } });
          session.user = r.user; toast(r.reverify ? t('Saqlandi. Profil qayta tekshiruvga yuborildi') : t('Profil saqlandi')); go('#/doctor/profile');
        } finally { f.saving = false; app.render(); }
      }
    },
    async mount() {
      f.specialties = (await catalog()).specialties;
      if (section === 'menu') api('/me/qr').then((r) => { f.qr = r.svg; app.render(); }).catch(() => {});
      app.render();
    }
  };
}
