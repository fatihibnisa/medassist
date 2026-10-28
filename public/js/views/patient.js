import { paginate, pager } from '../core.js';
import { esc, icon, session, app, api, go, toast, errMsg, spinner, fmtDate, fmtDay, fmtTime, fmtDayLong, fmtMonthShort, fmtMin, ago, fmtSize, fmtPhone, fmtMoney, dayKey, sevPill, statusPill, apptPill, presencePill, stars, emergency, skeletons, empty, poller, downloadFile, openFile, t, avatar, resizeImage, pwField, confirmSheet, mapsUrl, gmapsUrl, langSwitch } from '../core.js';
import { shell, bodyMap, findStage, ornament, ikat, sectionHead, systemNotifications, idCard, personIllustration } from '../ui.js';
import { meds, refreshMeds, markDose, itemOf } from '../reminders.js';
import { SEGMENT_NAMES, PAIN_KINDS, DURATIONS, SYMPTOMS, DANGER_FLAGS, SPECIALTIES, SPECIALTY_INFO, CONDITIONS, WEEKDAYS, painColor, triage, segmentSide, segmentInfo, recommendSpecialty } from '/shared/clinical.js';

const sideLabel = (code) => t({ front: 'old', back: 'orqa', both: '' }[segmentSide(code)]);
const segSummary = (segs, n = 2) => { const s = (segs || []).slice(0, n).map((x) => t(SEGMENT_NAMES[x.code]) + ' ' + x.pain + '/10').join(', '); return s + ((segs || []).length > n ? ' +' + (segs.length - n) : ''); };
const ACTIVE = ['NEW', 'AI_DRAFTED', 'ASSIGNED', 'DIAGNOSED'];

/* ---------------- shared fragments ---------------- */
export function doctorCard(d, opts = {}) {
  return '<article class="glass doc-card' + (d.recommended ? ' rec' : '') + '" style="--d:' + (opts.i || 0) + '">' +
    (d.recommended ? '<span class="rec-badge">' + icon('spark', 14) + esc(t('MedAssist tavsiya qiladi')) + '</span>' : '') +
    '<div class="row nw top" style="gap:14px">' + avatar(d, { size: 64, cls: 'ring' }) +
    '<div class="grow col g6" style="gap:3px"><div class="row between nw"><b class="lg ellipsis">Dr. ' + esc(d.fullName) + '</b>' + presencePill(d.presence) + '</div>' +
    '<span class="sm muted">' + esc(t(d.specialty)) + ' · ' + esc(t('{n} yil tajriba', { n: d.experienceYears })) + '</span>' +
    '<span class="row nw sm" style="gap:6px">' + stars(d.rating) + '<b>' + (d.rating ? d.rating.toFixed(1) : '—') + '</b><span class="faint">(' + esc(t('{n} ta baho', { n: d.reviews })) + ')</span></span></div></div>' +
    (d.clinicName || d.clinicAddress ? '<div class="doc-addr sm">' + icon('pin', 16) + '<span><b>' + esc(d.clinicName) + '</b>' + (d.clinicAddress ? '<br><span class="muted">' + esc(d.clinicAddress) + '</span>' : '') + '</span></div>' : '') +
    '<div class="price-row"><div><span class="xs faint">' + esc(t('Onlayn maslahat')) + '</span><b>' + fmtMoney(d.priceOnline) + '</b></div><div><span class="xs faint">' + esc(t('Klinikada qabul')) + '</span><b>' + fmtMoney(d.priceVisit) + '</b></div></div>' +
    '<div class="row" style="gap:8px">' + (opts.pick ? '<button class="btn btn-primary btn-sm grow" data-act="pickDoctor" data-id="' + d.id + '" aria-pressed="' + !!opts.picked + '">' + (opts.picked ? icon('check', 16, 2.6) + esc(t('Tanlandi')) : esc(t('Shu shifokorni tanlash'))) + '</button>'
      : '<button class="btn btn-sm" data-act="go" data-to="#/app/doctor/' + d.id + '">' + esc(t('Batafsil')) + '</button><button class="btn btn-sm" data-act="go" data-to="#/app/new?doctor=' + d.id + '">' + icon('chat', 16) + esc(t('Onlayn')) + '</button><button class="btn btn-primary btn-sm" data-act="go" data-to="#/app/doctor/' + d.id + '?book=1">' + icon('calendar', 16) + esc(t('Qabulga yozilish')) + '</button>') + '</div></article>';
}
function ratingInput(s, key = 'rate') {
  return '<div class="rate-input" role="radiogroup" aria-label="' + esc(t('Baho')) + '">' + [1, 2, 3, 4, 5].map((n) => '<button role="radio" aria-checked="' + (s.rating === n) + '" class="' + (n <= s.rating ? 'on' : '') + '" data-act="' + key + '" data-v="' + n + '" aria-label="' + n + '">' + icon('star', 30, 1.8) + '</button>').join('') + '</div>';
}
const reviewCard = (s) => '<div class="glass card col review-card"><h3>' + esc(t('Shifokorni baholang')) + '</h3><p class="sm muted">' + esc(t('Bahoingiz boshqa bemorlarga to‘g‘ri shifokorni tanlashga yordam beradi.')) + '</p>' + ratingInput(s) +
  '<textarea class="input" id="rvComment" data-bind="rvComment" maxlength="1000" placeholder="' + esc(t('Fikringiz (ixtiyoriy)')) + '" style="min-height:70px">' + esc(s.rvComment || '') + '</textarea>' +
  '<button class="btn btn-primary" data-act="sendReview"' + (s.rating ? '' : ' disabled') + '>' + icon('send', 18) + esc(t('Bahoni yuborish')) + '</button></div>';
const ecg = () => '<svg class="ecg" viewBox="0 0 300 40" preserveAspectRatio="none" aria-hidden="true"><path d="M0 22H70L80 22L88 8L96 34L104 16L110 22H170L178 22L186 6L194 36L202 14L208 22H300"/></svg>';

/* ---------------- home ---------------- */
export function patientHome() {
  const s = { items: null, visits: null, error: '' };
  let stop = null;
  const load = async () => {
    const [items, visits] = await Promise.all([api('/consultations/my'), api('/appointments/my')]);
    if (JSON.stringify([items, visits]) !== JSON.stringify([s.items, s.visits])) { s.items = items; s.visits = visits; app.render(); }
  };
  return {
    title: 'Bosh sahifa',
    html() {
      const u = session.user;
      const active = (s.items || []).filter((c) => ACTIVE.includes(c.status));
      let worst = null;
      for (const c of active) for (const x of c.segments) if (!worst || x.pain > worst.pain) worst = x;
      const red = active.some((c) => c.severity === 'RED' && c.status !== 'DIAGNOSED');
      const ok = s.items !== null && !active.length;
      const tone = ok ? 'ok' : red ? 'err' : 'warn';
      const hour = new Date().getHours();
      const greet = t(hour < 5 ? 'Xayrli tun' : hour < 12 ? 'Xayrli tong' : hour < 18 ? 'Xayrli kun' : 'Xayrli kech') + ', ' + esc(u.fullName.split(' ')[0]) + '!';
      const statusTitle = s.items === null ? t('Holatingiz yuklanmoqda…') : ok ? t('Ahvolingiz yaxshi') : red ? t('Diqqat: shoshilinch belgi bor') : t('{n} ta faol murojaat', { n: active.length });
      const statusText = ok ? t('Tanangizning barcha sohalari sog‘lom ko‘rinmoqda. Biror joyingiz bezovta qilsa, xaritada belgilang.') : red ? t('Darhol 103 ga qo‘ng‘iroq qiling. Murojaatingiz shifokorga birinchi navbatda ko‘rsatiladi.') : t('Belgilangan sohalar xaritada rangli ko‘rsatilgan. Shifokor javobini shu yerda ko‘rasiz.');
      const pulseLabel = s.items === null ? '' : ok ? t('Sog‘lom') : worst ? t(SEGMENT_NAMES[worst.code]) + ' · ' + worst.pain + '/10' : '';
      const illust = '<div class="hh-illust">' + personIllustration('doctor') + '</div>';
      const hero = '<section class="glass card lg health-hero' + (ok ? ' ok' : red ? ' red' : ' warn') + '">' + illust +
        '<div class="hh-text col g12">' + (pulseLabel ? '<span class="hh-pill pill ' + tone + '"><span class="dot"></span>' + esc(pulseLabel) + '</span>' : '') +
        '<span class="eyebrow-soft">' + greet + '</span><h2 class="hh-title">' + (ok ? '<span class="ok-dot"></span>' : '') + esc(statusTitle) + '</h2><p class="muted">' + esc(statusText) + '</p>' + ecg() +
        (red ? emergency() : '') +
        '<div class="row"><a class="btn btn-primary btn-lg" href="#/app/new">' + icon('plus', 20, 2.6) + esc(t('Qayeringiz og‘riyapti?')) + '</a><a class="btn btn-lg" href="#/app/doctors">' + icon('steth', 20) + esc(t('Shifokor topish')) + '</a></div></div></section>';
      // Bosh sahifa qisqa: faqat tana holati va (bo‘lsa) yaqin qabul. Qolgan hammasi o‘z bo‘limida (Shifokorlar, Dorilar, Profil...).
      const upcoming = (s.visits || []).filter((a) => ['BOOKED', 'ARRIVED', 'IN_PROGRESS'].includes(a.status) && a.endAt > Date.now()).sort((a, b) => a.startAt - b.startAt);
      const visitCard = upcoming.length ? '<div class="glass card col">' + sectionHead(t('Yaqin qabul'), '<a class="sm b" href="#/app/visits">' + esc(t('Barchasi')) + '</a>') + upcoming.slice(0, 3).map(visitMini).join('') + '</div>' : '';
      return shell('<div class="col g20 home">' + hero + visitCard + (s.error ? '<div class="alert err">' + esc(s.error) + '</div>' : '') + '</div>',
        { title: t('Bosh sahifa'), subtitle: esc(fmtDayLong(Date.now())) });
    },
    async mount() {
      try { await load(); } catch (e) { s.error = errMsg(e); s.items = []; s.visits = []; app.render(); }
      stop = poller(load, 15000);
    },
    unmount() { if (stop) stop(); }
  };
}
function doseRow(d) {
  const it = itemOf(d); if (!it) return '';
  const now = Date.now(); const late = !d.status && d.dueAt < now; const soon = !d.status && d.dueAt >= now && d.dueAt - now < 3600000;
  return '<div class="dose ' + (d.status ? d.status.toLowerCase() : late ? 'late' : soon ? 'soon' : '') + '"><span class="dose-time">' + fmtTime(d.dueAt) + '</span>' + (it.photo ? '<img src="/api/v1/medicines/' + it.medicineId + '/photo?v=' + it.photo + '" alt="" class="med-photo-thumb sm">' : '') + '<span class="grow"><b class="sm">' + esc(it.name + ' ' + it.strength) + '</b><span class="xs muted" style="display:block">' + esc(it.dosage) + (it.instructions ? ' · ' + esc(it.instructions) : '') + '</span></span>' +
    (d.status === 'TAKEN' ? '<span class="pill ok">' + icon('check', 13, 3) + esc(t('Ichildi')) + '</span>' : d.status === 'SKIPPED' ? '<span class="pill">' + esc(t('O‘tkazildi')) + '</span>'
      : d.dueAt <= now + 3 * 3600000 ? '<button class="btn btn-mint btn-sm" data-act="dose" data-item="' + d.itemId + '" data-due="' + d.dueAt + '" data-st="TAKEN">' + icon('check', 15, 2.6) + esc(t('Ichdim')) + '</button>' : '<span class="xs faint">' + esc(t('kutilmoqda')) + '</span>') + '</div>';
}
function visitMini(a) {
  return '<div class="visit-mini"><div class="vm-date"><b>' + new Date(a.startAt).getDate() + '</b><span>' + esc(fmtMonthShort(a.startAt)) + '</span></div><div class="grow col g6" style="gap:2px"><b class="sm">Dr. ' + esc(a.doctor ? a.doctor.fullName : '') + '</b><span class="xs muted">' + fmtTime(a.startAt) + ' · ' + esc(a.doctor ? a.doctor.clinicName || a.doctor.clinicAddress : '') + '</span></div>' + apptPill(a.status) + '</div>';
}
function consCardHtml(c, i = 0) {
  const max = c.segments.reduce((m, x) => Math.max(m, x.pain), 0);
  return '<button class="item" style="--d:' + i + '" data-act="go" data-to="#/app/c/' + c.id + '"><span class="bar" style="background:' + painColor(max) + '"></span>' +
    '<span class="grow col g6" style="gap:2px"><span class="b">' + esc(segSummary(c.segments)) + '</span><span class="sm muted">' + esc(c.doctorName ? 'Dr. ' + c.doctorName : t(c.specialty)) + ' · ' + ago(c.createdAt) + '</span></span>' +
    '<span class="col g6" style="align-items:flex-end">' + statusPill(c.status) + (c.unread ? '<span class="pill info">' + icon('chat', 13) + c.unread + '</span>' : sevPill(c.severity)) + '</span></button>';
}

/* ---------------- history ---------------- */
export function patientHistory() {
  const s = { items: null, error: '' };
  let stop = null;
  const load = async () => { const items = await api('/consultations/my'); if (JSON.stringify(items) !== JSON.stringify(s.items)) { s.items = items; app.render(); } };
  return {
    title: 'Murojaatlarim',
    html() {
      const active = (s.items || []).filter((c) => ACTIVE.includes(c.status));
      const past = (s.items || []).filter((c) => !ACTIVE.includes(c.status));
      let list;
      if (s.items === null) list = skeletons(3);
      else if (!s.items.length) list = empty('steth', t('Hali murojaat yo‘q'), t('Birinchi murojaatingizni yarating.'), '<a class="btn btn-primary" href="#/app/new">' + icon('plus', 18) + esc(t('Yangi murojaat')) + '</a>');
      else list = (active.length ? sectionHead(t('Faol')) + '<div class="list">' + active.map(consCardHtml).join('') + '</div>' : '') + (past.length ? sectionHead(t('Tarix')) + '<div class="list">' + past.map(consCardHtml).join('') + '</div>' : '');
      return shell('<div class="col g20" style="max-width:820px">' + (s.error ? '<div class="alert err">' + esc(s.error) + '</div>' : '') + list + '</div>', { title: t('Murojaatlarim'), subtitle: esc(t('Barcha onlayn murojaatlar')), back: '#/app' });
    },
    async mount() { try { await load(); } catch (e) { s.error = errMsg(e); s.items = []; app.render(); } stop = poller(load, 15000); },
    unmount() { if (stop) stop(); }
  };
}

/* ---------------- new consultation wizard ---------------- */
export function patientNew(params) {
  const q = params.query || new URLSearchParams();
  const w = { step: 1, sel: {}, open: null, sym: {}, flags: {}, temp: '', text: '', files: [], fileErr: '', sending: false, progress: '', doctors: null, doctorId: q.get('doctor') ? Number(q.get('doctor')) : null, showAll: false };
  const p = () => session.user.patient || {};
  const draft = () => ({ segments: Object.entries(w.sel).map(([code, v]) => ({ code, ...v })), symptoms: Object.keys(w.sym).filter((k) => w.sym[k]), flags: Object.keys(w.flags).filter((k) => w.flags[k]), temperature: w.temp, patient: { age: p().age, pregnant: p().pregnant, chronic: p().chronic } });
  const ids = () => Object.keys(w.sel);
  const rec = () => recommendSpecialty({ segments: draft().segments, age: p().age });
  const chosen = () => (w.doctors || []).find((d) => d.id === w.doctorId);
  const STEPS = ['Joy', 'Belgilar', 'Shifokor', 'Yuborish'];
  return {
    title: 'Yangi murojaat',
    html() {
      const tri = triage(draft());
      const prog = '<div class="stepper" aria-label="' + esc(t('Qadam {a} / {b}', { a: w.step, b: 4 })) + '">' + STEPS.map((l, i) => '<div class="st ' + (i + 1 < w.step ? 'done' : i + 1 === w.step ? 'now' : '') + '"><i>' + (i + 1 < w.step ? icon('check', 13, 3) : i + 1) + '</i><span>' + esc(t(l)) + '</span></div>').join('') + '</div>';
      let body = '';
      if (w.step === 1) {
        body = '<div class="anatomy-card col g16">' +
          '<div class="anatomy-head"><div class="row nw" style="gap:12px"><span class="ic">' + icon('heart', 22) + '</span><div class="col" style="gap:2px"><h2 style="font-size:22px;margin:0">' + esc(t('Tana xaritasi')) + '</h2><p class="sm muted" style="margin:0">' + esc(t('O‘zingizni bezovta qilayotgan joyni tanlang')) + '</p></div></div>' +
          '<span class="anatomy-badge">' + icon('shield', 14) + esc(t('Sog‘lig‘ingiz biz uchun muhim')) + '</span></div>' +
          '<body-map id="bm" theme="dark" callouts="on"></body-map>' +
          '<div id="recWrap">' + (ids().length ? '<div class="rec-hint">' + icon('steth', 18) + '<span>' + esc(t('Belgilaringiz bo‘yicha sizga {spec} kerak', { spec: t(rec()) })) + '</span></div>' : '') + '</div>' +
          '<div id="emgWrap">' + (tri.severity === 'RED' ? emergency(t('Bu belgilar xavfli bo‘lishi mumkin. Darhol 103 ga qo‘ng‘iroq qiling — murojaatingiz ham shifokorga birinchi navbatda yetkaziladi.')) : '') + '</div></div>' +
          '<div class="row end"><button class="btn btn-ghost" data-act="back" data-to="#/app">' + esc(t('Bekor qilish')) + '</button><button class="btn btn-primary btn-lg" id="step1next" data-act="next"' + (ids().length ? '' : ' disabled') + '>' + esc(t('Davom etish')) + icon('next', 18, 2.4) + '</button></div>';
      } else if (w.step === 2) {
        body = '<div class="col g6"><h2 style="font-size:24px">' + esc(t('Yana nimalar bezovta qiladi?')) + '</h2><p class="muted sm">' + esc(t('Bor belgilarni bosing.')) + '</p></div>' +
          '<div class="choices">' + Object.entries(SYMPTOMS).map(([k, l]) => '<button class="choice" data-act="sym" data-k="' + k + '" aria-pressed="' + !!w.sym[k] + '">' + esc(t(l)) + '</button>').join('') + '</div>' +
          '<label class="field" style="max-width:220px"><span>' + esc(t('Harorat, °C (ixtiyoriy)')) + '</span><input class="input" id="temp" data-bind="temp" inputmode="decimal" placeholder="36,6" value="' + esc(w.temp) + '"></label>' +
          '<div class="col"><h3>' + esc(t('Xavfli belgilar bormi?')) + '</h3><div class="choices">' + Object.entries(DANGER_FLAGS).map(([k, l]) => '<button class="choice danger" data-act="flag" data-k="' + k + '" aria-pressed="' + !!w.flags[k] + '">' + esc(t(l)) + '</button>').join('') + '</div></div>' +
          (tri.severity === 'RED' ? emergency(t('Bu belgilar xavfli bo‘lishi mumkin. Darhol 103 ga qo‘ng‘iroq qiling.')) : '') +
          '<label class="field"><span>' + esc(t('O‘z so‘zingiz bilan')) + '</span><textarea class="input" id="text" data-bind="text" maxlength="2000" placeholder="' + esc(t('Masalan: yutganda og‘riq kuchayadi, kechasi yo‘tal bezovta qiladi')) + '">' + esc(w.text) + '</textarea></label>' +
          '<div class="col"><label class="btn" style="align-self:flex-start;cursor:pointer">' + icon('clip', 18) + esc(t('Tahlil yoki rasm biriktirish')) + '<input type="file" class="sr" data-file="addFiles" accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf" multiple></label>' +
          '<span class="xs faint">' + esc(t('jpg, png yoki pdf · har biri 10 MB gacha · ko‘pi bilan 5 ta')) + '</span>' + (w.fileErr ? '<div class="alert err sm">' + esc(w.fileErr) + '</div>' : '') +
          w.files.map((f, i) => '<div class="well row between nw sm"><span class="row nw">' + icon('file', 18) + esc(f.name) + ' <span class="faint">' + fmtSize(f.size) + '</span></span><button class="btn btn-ghost btn-sm" data-act="rmFile" data-i="' + i + '" aria-label="' + esc(t('Olib tashlash')) + '">' + icon('x', 16) + '</button></div>').join('') + '</div>' +
          '<div class="row end"><button class="btn btn-ghost" data-act="prev">' + icon('back', 18) + esc(t('Orqaga')) + '</button><button class="btn btn-primary btn-lg" data-act="next">' + esc(t('Davom etish')) + icon('next', 18, 2.4) + '</button></div>';
      } else if (w.step === 3) {
        const spec = rec();
        const list = (w.doctors || []).filter((d) => w.showAll || d.specialty === spec || d.id === w.doctorId);
        body = '<div class="col g6"><h2 style="font-size:24px">' + esc(t('Shifokorni tanlang')) + '</h2><p class="muted sm">' + esc(t('Ilova belgilaringizga qarab mutaxassisni tavsiya qiladi. Xohlasangiz, o‘zingiz tanlang.')) + '</p></div>' +
          '<div class="glass card tight rec-card row nw top">' + '<span class="ic">' + icon('steth', 22) + '</span><div class="col g6"><b>' + esc(t('Sizga {spec} kerak', { spec: t(spec) })) + '</b><span class="sm muted">' + esc(t(SPECIALTY_INFO[spec] || '')) + '</span></div></div>' +
          (tri.severity === 'RED' ? '<div class="alert warn sm">' + icon('alert', 18) + '<div>' + esc(t('Shoshilinch holatda murojaatni birinchi bo‘sh shifokor oladi, hatto boshqa shifokorni tanlasangiz ham.')) + '</div></div>' : '') +
          '<button class="item auto-pick" data-act="pickDoctor" data-id="" aria-pressed="' + (w.doctorId === null) + '"><span class="ic">' + icon('spark', 20) + '</span><span class="grow"><b>' + esc(t('Avtomatik tanlash')) + '</b><br><span class="sm muted">' + esc(t('Birinchi bo‘sh mos shifokor oladi — eng tez javob')) + '</span></span>' + (w.doctorId === null ? icon('check', 20, 2.6) : '') + '</button>' +
          (w.doctors === null ? skeletons(2) : !list.length ? '<p class="sm muted">' + esc(t('Bu mutaxassislik bo‘yicha shifokor hozircha yo‘q — avtomatik tanlash tavsiya etiladi.')) + '</p>' : '<div class="doc-grid">' + list.map((d, i) => doctorCard(d, { pick: true, picked: d.id === w.doctorId, i })).join('') + '</div>') +
          '<button class="btn btn-ghost btn-sm" style="align-self:flex-start" data-act="toggleAll">' + esc(t(w.showAll ? 'Faqat mos mutaxassislar' : 'Boshqa mutaxassislarni ham ko‘rsatish')) + '</button>' +
          '<div class="row end"><button class="btn btn-ghost" data-act="prev">' + icon('back', 18) + esc(t('Orqaga')) + '</button><button class="btn btn-primary btn-lg" data-act="next">' + esc(t('Davom etish')) + icon('next', 18, 2.4) + '</button></div>';
      } else {
        const sm = Object.keys(w.sym).filter((k) => w.sym[k]).map((k) => t(SYMPTOMS[k]));
        const d = chosen();
        body = '<div class="col g6"><h2 style="font-size:24px">' + esc(t('Tekshirib yuboring')) + '</h2><p class="muted sm">' + esc(t('Shifokor aynan shu ma’lumotni ko‘radi.')) + '</p></div>' +
          '<div class="pt-grid"><div class="map-stage sm">' + bodyMap({ view: 'front', sel: w.sel, width: 96 }) + bodyMap({ view: 'back', sel: w.sel, width: 96 }) + '</div><div class="col">' +
          ids().map((id) => '<div class="well row between nw sm"><span><b>' + esc(t(SEGMENT_NAMES[id])) + '</b> · ' + esc(t(PAIN_KINDS[w.sel[id].kind])) + ' · ' + esc(t(DURATIONS[w.sel[id].dur])) + '</span><b style="color:' + painColor(w.sel[id].pain) + '">' + w.sel[id].pain + '/10</b></div>').join('') +
          (sm.length || w.temp ? '<p class="sm"><span class="faint">' + esc(t('Belgilar:')) + '</span> ' + esc(sm.join(', ')) + (w.temp ? (sm.length ? ', ' : '') + esc(w.temp) + ' °C' : '') + '</p>' : '') +
          (w.text ? '<p class="sm"><span class="faint">' + esc(t('Shikoyat:')) + '</span> ' + esc(w.text) + '</p>' : '') + (w.files.length ? '<p class="sm"><span class="faint">' + esc(t('Fayllar:')) + '</span> ' + w.files.length + '</p>' : '') +
          '<div class="well row nw" style="gap:10px">' + (d ? avatar(d, { size: 36 }) + '<span class="sm"><b>Dr. ' + esc(d.fullName) + '</b><br><span class="muted">' + esc(t(d.specialty)) + ' · ' + fmtMoney(d.priceOnline) + '</span></span>' : icon('spark', 20) + '<span class="sm"><b>' + esc(t('Avtomatik tanlash')) + '</b><br><span class="muted">' + esc(t(rec())) + '</span></span>') + '</div></div></div>' +
          '<div class="glass card tight col g6"><div class="row between"><b>' + esc(t('Dastlabki baholash')) + '</b>' + sevPill(tri.severity) + '</div><p class="sm muted">' + esc(tri.reasons.map((r) => t(r)).join('; ')) + '</p><p class="xs faint">' + esc(t('Baholashni qat’iy tibbiy qoidalar bajaradi. Yakuniy xulosani shifokor beradi.')) + '</p></div>' +
          (tri.severity === 'RED' ? emergency() : '') +
          '<div class="row end"><button class="btn btn-ghost" data-act="prev"' + (w.sending ? ' disabled' : '') + '>' + icon('back', 18) + esc(t('Orqaga')) + '</button><button class="btn btn-primary btn-lg" data-act="send"' + (w.sending ? ' disabled' : '') + '>' + (w.sending ? spinner() + esc(w.progress) : icon('send', 18) + esc(t('Shifokorga yuborish'))) + '</button></div>';
      }
      const out = shell('<div class="glass card lg col g20 wizard" style="max-width:760px">' + prog + '<div class="step-body' + (w.step !== w.shown ? ' anim' : '') + '">' + body + '</div></div>', { title: t('Yangi murojaat'), back: '#/app', active: '#/app/new' });
      w.shown = w.step;
      return out;
    },
    bind(k, v) { w[k] = v; },
    /** The <body-map> manages its own clicks/sheet internally; we only sync its `change` event into w.sel,
     * patching the step's own bits (continue button, specialty hint, RED banner) directly — never a full
     * app.render(), which would destroy and recreate the component mid-edit and close its open sheet. */
    after() {
      if (w.step !== 1) return;
      const el = document.getElementById('bm');
      if (!el) return;
      el.value = draft().segments;
      el.addEventListener('change', (e) => {
        w.sel = {};
        e.detail.value.forEach((s) => { w.sel[s.code] = { pain: s.pain, kind: s.kind, dur: s.dur }; });
        const tri2 = triage(draft());
        const recWrap = document.getElementById('recWrap');
        const emgWrap = document.getElementById('emgWrap');
        const nextBtn = document.getElementById('step1next');
        if (recWrap) recWrap.innerHTML = ids().length ? '<div class="rec-hint">' + icon('steth', 18) + '<span>' + esc(t('Belgilaringiz bo‘yicha sizga {spec} kerak', { spec: t(rec()) })) + '</span></div>' : '';
        if (emgWrap) emgWrap.innerHTML = tri2.severity === 'RED' ? emergency(t('Bu belgilar xavfli bo‘lishi mumkin. Darhol 103 ga qo‘ng‘iroq qiling — murojaatingiz ham shifokorga birinchi navbatda yetkaziladi.')) : '';
        if (nextBtn) nextBtn.disabled = !ids().length;
      });
    },
    on: {
      sym(el) { w.sym[el.dataset.k] = !w.sym[el.dataset.k]; app.render(); },
      flag(el) { w.flags[el.dataset.k] = !w.flags[el.dataset.k]; app.render(); },
      pickDoctor(el) { w.doctorId = el.dataset.id ? Number(el.dataset.id) : null; app.render(); },
      toggleAll() { w.showAll = !w.showAll; app.render(); },
      addFiles(el) {
        w.fileErr = '';
        for (const f of Array.from(el.files || [])) {
          if (!['image/jpeg', 'image/png', 'application/pdf'].includes(f.type)) { w.fileErr = '“' + f.name + '” — ' + t('faqat jpg, png yoki pdf'); continue; }
          if (f.size > 10 * 1048576) { w.fileErr = '“' + f.name + '” — ' + t('10 MB dan katta'); continue; }
          if (w.files.length >= 5) { w.fileErr = t('Ko‘pi bilan 5 ta fayl'); break; }
          w.files.push(f);
        }
        el.value = ''; app.render();
      },
      rmFile(el) { w.files.splice(Number(el.dataset.i), 1); app.render(); },
      next() {
        if (w.step === 1 && !ids().length) return;
        if (w.step === 2 && String(w.temp).trim()) { const tt = Number(String(w.temp).replace(',', '.')); if (!(tt >= 34 && tt <= 43)) { toast(t('Haroratni 34–43 °C oralig‘ida kiriting'), 'err'); return; } }
        w.step++; app.render(); window.scrollTo(0, 0);
      },
      prev() { w.step--; app.render(); window.scrollTo(0, 0); },
      async send() {
        w.sending = true; w.progress = t('Yuborilmoqda…'); app.render();
        try {
          const d = draft();
          const c = await api('/consultations', { method: 'POST', body: { segments: d.segments, symptoms: d.symptoms, flags: d.flags, temperature: String(w.temp).trim() || null, complaint: w.text, doctorId: w.doctorId } });
          for (let i = 0; i < w.files.length; i++) {
            w.progress = t('Fayl {a}/{b}', { a: i + 1, b: w.files.length }); app.render();
            try { await api('/consultations/' + c.id + '/attachments', { method: 'POST', raw: w.files[i], headers: { 'content-type': w.files[i].type, 'x-file-name': encodeURIComponent(w.files[i].name) } }); }
            catch (e) { toast(w.files[i].name + ': ' + errMsg(e), 'err'); }
          }
          toast(t('Murojaat shifokorga yuborildi'));
          go('#/app/c/' + c.id);
        } catch (e) { w.sending = false; app.render(); throw e; }
      }
    },
    async mount() { try { w.doctors = await api('/doctors'); } catch { w.doctors = []; } app.render(); }
  };
}

/* ---------------- consultation detail ---------------- */
export function patientDetail(params) {
  const s = { c: null, msgs: [], draft: '', sending: false, error: '', rating: 0, rvComment: '' };
  let stop = null;
  const load = async () => {
    const [c, msgs] = await Promise.all([api('/consultations/' + params.id), api('/consultations/' + params.id + '/messages')]);
    const changed = JSON.stringify(c) !== JSON.stringify(s.c) || msgs.length !== s.msgs.length;
    s.c = c; s.msgs = msgs; if (changed) app.render();
  };
  return {
    title: 'Murojaat',
    html() {
      const c = s.c;
      if (!c) return shell(s.error ? '<div class="alert err">' + esc(s.error) + '</div>' : skeletons(3), { title: t('Murojaat'), back: '#/app/history', active: '#/app/history' });
      const st = c.status; const reviewing = ['ASSIGNED', 'DIAGNOSED', 'CLOSED'].includes(st); const done = ['DIAGNOSED', 'CLOSED'].includes(st);
      const tl = (cls, tt, sub) => '<div class="tl ' + cls + '"><span class="b">' + (cls === 'done' ? icon('check', 15, 3) : '') + '</span><div><b>' + tt + '</b>' + (sub ? '<div class="sm muted">' + sub + '</div>' : '') + '</div></div>';
      const timeline = '<div class="glass card"><div class="timeline">' +
        tl('done', esc(t('Murojaat qabul qilindi')), fmtDate(c.createdAt)) +
        (st === 'CANCELLED' ? tl('done', esc(t('Bekor qilindi')), c.closedAt ? fmtDate(c.closedAt) : '') :
          tl(done ? 'done' : 'now', reviewing ? esc(t('Shifokor ko‘rib chiqmoqda')) : esc(t('Navbatda')) + ' — ' + esc(t(c.specialty)), c.doctor ? 'Dr. ' + esc(c.doctor.fullName) + ' · ' + esc(t(c.doctor.specialty)) : c.requestedDoctor ? esc(t('Siz tanlagan shifokor:')) + ' Dr. ' + esc(c.requestedDoctor.fullName) : esc(t('Mos mutaxassis tez orada oladi'))) +
          tl(done ? 'done' : '', esc(t('Tashxis va retsept')), c.diagnosis ? fmtDate(c.diagnosis.createdAt) : '')) + '</div></div>';
      const docBlock = c.doctor ? '<a class="glass card tight row nw doc-strip" href="#/app/doctor/' + c.doctor.id + '">' + avatar(c.doctor, { size: 44 }) + '<span class="grow"><b>Dr. ' + esc(c.doctor.fullName) + '</b><br><span class="sm muted">' + esc(t(c.doctor.specialty)) + ' · ' + esc(t('{n} yil tajriba', { n: c.doctor.experienceYears })) + '</span></span>' + icon('next', 18) + '</a>' : '';
      let result = '';
      if (c.diagnosis) {
        const rx = c.prescription;
        result = '<div class="glass card lg col g20"><div class="row between"><h2 style="font-size:22px">' + esc(t('Shifokor xulosasi')) + '</h2><span class="pill ok">' + icon('shield', 14) + esc(t('Shifokor tasdiqlagan')) + '</span></div>' +
          '<div class="well"><span class="xs faint b">' + esc(t('TASHXIS')) + ' · ' + esc(c.diagnosis.icd10) + '</span><div class="b lg">' + esc(c.diagnosis.title) + '</div>' + (c.diagnosis.description ? '<p class="sm muted" style="margin-top:4px">' + esc(c.diagnosis.description) + '</p>' : '') + '</div>' +
          (c.diagnosis.recommendations ? '<div class="col g6"><h4>' + esc(t('Maslahatlar')) + '</h4><ul class="ticks">' + c.diagnosis.recommendations.split('\n').filter(Boolean).map((r) => '<li>' + icon('check', 16, 2.6) + '<span>' + esc(r) + '</span></li>').join('') + '</ul></div>' : '') +
          (c.diagnosis.redFlags.length ? '<div class="alert warn">' + icon('alert') + '<div><div>' + esc(t('Darhol shifokorga murojaat qiling, agar:')) + '</div><ul style="margin:6px 0 0;padding-left:18px">' + c.diagnosis.redFlags.map((r) => '<li>' + esc(r) + '</li>').join('') + '</ul></div></div>' : '') +
          (rx ? rxCard(rx, { download: true, track: true, doctor: c.doctor }) : '<p class="sm muted">' + esc(t('Retsept yozilmagan.')) + '</p>') +
          (st === 'DIAGNOSED' ? '<button class="btn" data-act="close">' + icon('check', 18) + esc(t('Tushunarli, murojaatni yopish')) + '</button>' : '') + '</div>';
      } else if (st !== 'CANCELLED') {
        result = (c.referredAt ? '<div class="alert info">' + icon('calendar', 20) + '<div><b>' + esc(t('Shifokor sizni tibbiy ko‘rikka taklif qilmoqda')) + '</b>' + (c.referralNote ? '<p class="sm" style="margin:4px 0 0">' + esc(c.referralNote) + '</p>' : '') + '<p class="sm muted" style="margin:4px 0 0">' + esc(t('Onlayn ma’lumot yetarli bo‘lmadi — klinikaga yozilib, shaxsan ko‘rinishingiz tavsiya etiladi.')) + '</p>' + (c.doctor ? '<a class="btn btn-primary btn-sm" style="margin-top:8px" href="#/app/doctor/' + c.doctor.id + '?book=1">' + icon('calendar', 16) + esc(t('Qabulga yozilish')) + '</a>' : '') + '</div></div>' : '') +
          '<div class="glass card col g6"><h3>' + esc(t('Javob kutilmoqda')) + '</h3><p class="muted sm">' + esc(t('Shifokor ko‘rib chiqqach, tashxis va retsept shu yerda paydo bo‘ladi, SMS ham keladi. Savol bo‘lsa, shifokor chatga yozadi.')) + '</p>' +
          (['NEW', 'AI_DRAFTED'].includes(st) ? '<button class="btn btn-ghost btn-sm" style="align-self:flex-start" data-act="cancel">' + esc(t('Murojaatni bekor qilish')) + '</button>' : '') + '</div>';
      }
      const review = done && c.doctor ? (c.review ? '<div class="glass card row between"><span class="sm">' + esc(t('Sizning bahoingiz')) + '</span>' + stars(c.review.rating, 18) + '</div>' : reviewCard(s)) : '';
      const chat = ['NEW', 'AI_DRAFTED'].includes(st) && !s.msgs.length ? '' : '<div class="glass card col">' + chatBox(s, 'PATIENT', !['CLOSED', 'CANCELLED'].includes(st)) + '</div>';
      const topSeg = (c.segments || []).slice().sort((a, b) => b.pain - a.pain)[0];
      const sentView = topSeg && segmentSide(topSeg.code) === 'back' ? 'back' : 'front';
      const sentFindings = (c.segments || []).map((x) => ({ code: x.code, label: SEGMENT_NAMES[x.code], value: x.pain, unit: '/10', tone: x.pain >= 8 ? 'err' : x.pain >= 5 ? 'warn' : 'ok' }));
      const sent = '<div class="glass card col"><h3>' + esc(t('Siz yuborgan ma’lumot')) + '</h3>' +
        (sentFindings.length ? findStage(bodyMap({ view: sentView, width: 200, findings: sentFindings }), 'sm') : '') +
        '<div class="col">' +
        c.segments.map((x) => '<div class="well row between nw sm"><span><b>' + esc(t(SEGMENT_NAMES[x.code])) + '</b> · ' + esc(t(PAIN_KINDS[x.kind])) + ' · ' + esc(t(DURATIONS[x.dur])) + '</span><b style="color:' + painColor(x.pain) + '">' + x.pain + '/10</b></div>').join('') +
        (c.complaint ? '<p class="sm"><span class="faint">' + esc(t('Shikoyat:')) + '</span> ' + esc(c.complaint) + '</p>' : '') +
        (c.files.length ? '<div class="row">' + c.files.map((f) => '<button class="btn btn-sm" data-act="file" data-id="' + f.id + '">' + icon('file', 16) + esc(f.name) + '</button>').join('') + '</div>' : '') + '</div></div>';
      return shell('<div class="col g20" style="max-width:820px">' + (c.severity === 'RED' && !done && st !== 'CANCELLED' ? emergency(t('Belgilaringiz xavfli bo‘lishi mumkin. Darhol 103 ga qo‘ng‘iroq qiling. Murojaatingiz shifokorga birinchi navbatda ko‘rsatiladi.')) : '') + timeline + docBlock + result + review + chat + sent + '</div>',
        { title: segSummary(c.segments, 1), subtitle: sevPill(c.severity) + ' ' + statusPill(st), back: '#/app/history', active: '#/app/history' });
    },
    bind(k, v) { s[k] = v; },
    on: {
      async send() {
        const tx = s.draft.trim(); if (!tx || s.sending) return;
        s.sending = true; app.render();
        try { await api('/consultations/' + params.id + '/messages', { method: 'POST', body: { content: tx } }); s.draft = ''; await load(); }
        finally { s.sending = false; app.render(); }
      },
      async close() { s.c = await api('/consultations/' + params.id + '/close', { method: 'POST' }); toast(t('Murojaat yopildi')); app.render(); },
      async cancel() { if (!(await confirmSheet({ title: t('Murojaatni bekor qilasizmi?'), ok: t('Ha, bekor qilish'), danger: true }))) return; s.c = await api('/consultations/' + params.id + '/close', { method: 'POST' }); toast(t('Murojaat bekor qilindi')); app.render(); },
      async pdf() { await downloadFile('/prescriptions/' + s.c.prescription.id + '/pdf', 'retsept-' + s.c.prescription.number + '.pdf'); },
      async file(el) { await openFile('/attachments/' + el.dataset.id); },
      rate(el) { s.rating = Number(el.dataset.v); app.render(); },
      async sendReview() { await api('/reviews', { method: 'POST', body: { consultationId: s.c.id, rating: s.rating, comment: s.rvComment } }); toast(t('Rahmat! Bahoingiz qabul qilindi')); await load(); },
      async track() { await api('/tracker/start', { method: 'POST', body: { prescriptionId: s.c.prescription.id } }); await refreshMeds(); toast(t('Dori eslatmalari yoqildi')); go('#/app/meds'); },
      qrFull() { qrFullscreen(s.c.prescription); }
    },
    async mount() { try { await load(); } catch (e) { s.error = errMsg(e); app.render(); } stop = poller(load, 5000); },
    unmount() { if (stop) stop(); }
  };
}
function qrFullscreen(rx) {
  const host = document.createElement('div');
  host.className = 'dlg-host qr-full';
  host.innerHTML = '<div class="overlay"></div><div class="qr-big glass"><div class="qr">' + rx.qrSvg + '</div><b class="lg">' + esc(rx.number) + '</b><span class="code-big">' + esc(rx.code) + '</span><span class="sm muted">' + esc(t('Dorixonaga shu QR kodni ko‘rsating')) + '</span><button class="btn btn-primary">' + esc(t('Yopish')) + '</button></div>';
  document.body.appendChild(host);
  const close = () => host.remove();
  host.querySelector('.overlay').addEventListener('click', close);
  host.querySelector('button').addEventListener('click', close);
}

/* ---------------- shared: chat + prescription ---------------- */
export function chatBox(s, myRole, canWrite) {
  return '<div class="row between"><h3>' + esc(t(myRole === 'PATIENT' ? 'Shifokor bilan chat' : 'Bemor bilan chat')) + '</h3><span class="xs faint">' + esc(t('{n} xabar', { n: s.msgs.length })) + '</span></div>' +
    '<div class="chat" id="chat" data-keep-scroll aria-live="polite">' + (s.msgs.length ? s.msgs.map((m) => '<div class="bubble ' + (m.senderRole === myRole ? 'me' : '') + '">' + esc(m.content) + '<small>' + (m.senderRole === 'DOCTOR' ? 'Dr. ' + esc(m.senderName) : esc(m.senderName)) + ' · ' + ago(m.createdAt) + '</small></div>').join('') : '<p class="sm faint">' + esc(t('Hali xabar yo‘q.')) + '</p>') + '</div>' +
    (canWrite ? '<div class="composer"><input class="input" id="draft" data-bind="draft" data-enter="send" maxlength="2000" placeholder="' + esc(t('Xabar yozing…')) + '" value="' + esc(s.draft) + '" aria-label="' + esc(t('Xabar')) + '"><button class="btn btn-primary" data-act="send" aria-label="' + esc(t('Yuborish')) + '"' + (s.sending ? ' disabled' : '') + '>' + (s.sending ? spinner() : icon('send', 18)) + '</button></div>' : '');
}
let sealSeq = 0;
/** Round "doctor's seal" badge — specialty curves along the top arc, full name along the bottom, MedAssist mark in the center. */
export function sealSvg(specialty, fullName) {
  const id = 'seal' + (++sealSeq);
  const top = (t(specialty) || '').toUpperCase(), bottom = (fullName || '').toUpperCase();
  return '<svg class="rx-seal" viewBox="0 0 100 100" role="img" aria-label="' + esc(t(specialty) + ' ' + fullName) + '">' +
    '<defs><path id="' + id + 't" d="M12 52A38 38 0 0 1 88 52"/><path id="' + id + 'b" d="M88 54A38 38 0 0 1 12 54"/></defs>' +
    '<circle cx="50" cy="50" r="47" fill="none" stroke="currentColor" stroke-width="1" opacity=".5"/>' +
    '<circle cx="50" cy="50" r="41" fill="#0B1E4D" stroke="currentColor" stroke-width="1.4"/>' +
    '<circle cx="50" cy="50" r="30" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width=".8"/>' +
    '<text font-size="7.4" font-weight="700" fill="#fff" letter-spacing=".5"><textPath href="#' + id + 't" startOffset="50%" text-anchor="middle">' + esc(top) + '</textPath></text>' +
    '<text font-size="7.4" font-weight="700" fill="#fff" letter-spacing=".5"><textPath href="#' + id + 'b" startOffset="50%" text-anchor="middle">' + esc(bottom) + '</textPath></text>' +
    '<path d="M50 34v9M45.5 38.5h9" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>' +
    '<text x="50" y="58" text-anchor="middle" font-size="11" font-weight="800" fill="#fff">MED</text>' +
    '<text x="50" y="69" text-anchor="middle" font-size="11" font-weight="800" fill="#fff">ASSIST</text>' +
    '</svg>';
}
export function rxCard(rx, opts = {}) {
  const st = rx.status;
  return '<div class="rx"><button class="qr" data-act="qrFull" aria-label="' + esc(t('QR kodni kattalashtirish')) + '">' + rx.qrSvg + '</button>' + (opts.doctor ? sealSvg(opts.doctor.specialty, opts.doctor.fullName) : '') + '<div class="grow col g6" style="min-width:220px">' +
    '<div class="row between"><h3>' + esc(t('E-retsept')) + ' ' + esc(rx.number) + '</h3>' + (st === 'ACTIVE' ? '<span class="pill ok">' + esc(t('Amalda')) + '</span>' : st === 'CANCELLED' ? '<span class="pill err">' + esc(t('Bekor qilingan')) + '</span>' : '<span class="pill warn">' + esc(t('Muddati o‘tgan')) + '</span>') + '</div>' +
    '<p class="sm muted">' + esc(t('Kod:')) + ' <b style="color:var(--ink);letter-spacing:.1em">' + esc(rx.code) + '</b> · ' + fmtDay(rx.issuedAt) + ' — ' + fmtDay(rx.validUntil) + '</p>' +
    (rx.dispensedAt ? '<p class="sm"><span class="pill ok">' + icon('check', 13, 3) + esc(t('Dorixonada berilgan')) + '</span> <span class="muted">' + fmtDate(rx.dispensedAt) + (rx.dispensedBy ? ' · ' + esc(rx.dispensedBy) : '') + '</span></p>' : '') +
    rx.items.map((i) => '<div class="med row nw" style="gap:10px">' + (i.photo ? '<img src="/api/v1/medicines/' + i.medicineId + '/photo?v=' + i.photo + '" alt="" class="med-photo-thumb sm">' : '') + '<span class="col" style="gap:2px"><b>' + esc(i.name) + ' ' + esc(i.strength) + ' <span class="faint sm">' + esc(t(i.form)) + '</span></b><span class="sm">' + esc(i.dosage) + ', ' + esc(t('kuniga {n} marta', { n: i.timesPerDay })) + ', ' + esc(t('{n} kun', { n: i.days })) + (i.instructions ? ' · ' + esc(i.instructions) : '') + '</span></span></div>').join('') +
    (st === 'CANCELLED' && rx.cancelReason ? '<div class="alert err sm">' + icon('alert', 18) + '<div>' + esc(t('Sabab:')) + ' ' + esc(rx.cancelReason) + '</div></div>' : '') +
    '<div class="row" style="margin-top:6px">' + (opts.download ? '<button class="btn btn-primary btn-sm" data-act="pdf">' + icon('download', 16) + esc(t('PDF yuklab olish')) + '</button>' : '') +
    (opts.track && st === 'ACTIVE' ? '<button class="btn btn-sm" data-act="track">' + icon('alarm', 16) + esc(t('Dori eslatmalarini yoqish')) + '</button>' : '') +
    (opts.cancel && st === 'ACTIVE' ? '<button class="btn btn-danger btn-sm" data-act="rxCancelOpen">' + esc(t('Bekor qilish')) + '</button>' : '') + '</div></div></div>';
}

/* ---------------- find doctors ---------------- */
export function findDoctors(params) {
  const q = params.query || new URLSearchParams();
  const s = { all: null, spec: q.get('specialty') || '', condition: q.get('condition') || '', sel: {}, open: null, view: 'front', q: '', sort: 'rec', mode: q.get('mode') || '', error: '', page: 1 };
  const recSpec = () => (s.condition || Object.keys(s.sel).length ? recommendSpecialty({ condition: s.condition, segments: Object.entries(s.sel).map(([code, v]) => ({ code, ...v })) }) : '');
  return {
    title: 'Shifokor topish',
    html() {
      const spec = s.spec || recSpec();
      let list = s.all;
      if (list) {
        list = list.filter((d) => !spec || d.specialty === spec);
        if (s.q.trim()) { const qq = s.q.trim().toLowerCase(); list = list.filter((d) => (d.fullName + ' ' + d.clinicName + ' ' + d.clinicAddress + ' ' + t(d.specialty)).toLowerCase().includes(qq)); }
        const sorters = { rec: (a, b) => b.score - a.score, rating: (a, b) => (b.rating || 0) - (a.rating || 0) || b.reviews - a.reviews, exp: (a, b) => b.experienceYears - a.experienceYears, price: (a, b) => (s.mode === 'visit' ? a.priceVisit - b.priceVisit : a.priceOnline - b.priceOnline) };
        list = list.slice().sort(sorters[s.sort]).map((d, i) => ({ ...d, recommended: s.sort === 'rec' && i === 0 }));
      }
      const info = s.open ? segmentInfo(s.open) : null;
      const condLabel = s.condition && (CONDITIONS.find((c) => c.key === s.condition) || {}).label;
      const quick = '<div class="tiles"><a class="glass tile" href="#/app/doctors?mode=visit"><span class="ic">' + icon('calendar', 24) + '</span><b>' + esc(t('Qabulga yozilish')) + '</b><span class="xs muted">' + esc(t('Klinikada uchrashish')) + '</span></a>' +
        '<a class="glass tile" href="#/app/nearby"><span class="ic">' + icon('pin', 24) + '</span><b>' + esc(t('Yaqin dorixona')) + '</b><span class="xs muted">' + esc(t('Xaritada ko‘rish')) + '</span></a></div>';
      const finder = '<aside class="glass card col finder"><h2 class="finder-title">' + esc(t('Kimga murojaat qilish kerak?')) + ikat() + '</h2><p class="sm muted">' + esc(t('Bezovta qilayotgan joyni bosing yoki kasallik turini tanlang — ilova mos mutaxassisni aytadi.')) + '</p>' +
        '<div class="row between"><span class="xs faint b">' + esc(t('TANA XARITASI')) + '</span><div class="seg"><button data-act="view" data-v="front" aria-pressed="' + (s.view === 'front') + '">' + esc(t('Old')) + '</button><button data-act="view" data-v="back" aria-pressed="' + (s.view === 'back') + '">' + esc(t('Orqa')) + '</button></div></div>' +
        '<div style="align-self:center">' + bodyMap({ view: s.view, sel: s.sel, open: s.open, act: 'seg', width: 92 }) + '</div>' +
        (info ? '<div class="seg-info sm"><div>' + icon('pin', 16) + '<span><b>' + esc(t(SEGMENT_NAMES[s.open])) + ':</b> ' + esc(t(info.organs)) + '</span></div><div>' + icon('list', 16) + '<span>' + esc(info.causes.map((c) => t(c)).join(', ')) + '</span></div></div>' : '') +
        '<a class="item" href="#/app/doctors/condition"><span class="fi" style="background:var(--primary-soft);color:var(--primary)">' + icon('spark', 20) + '</span><span class="grow"><b>' + esc(t('Yoki kasallik turi')) + '</b>' + (condLabel ? '<br><span class="sm muted">' + esc(t(condLabel)) + '</span>' : '') + '</span>' + icon('next', 18) + '</a>' +
        (recSpec() ? '<div class="rec-hint">' + icon('steth', 18) + '<span>' + esc(t('Sizga {spec} kerak', { spec: t(recSpec()) })) + '<br><span class="xs muted">' + esc(t(SPECIALTY_INFO[recSpec()] || '')) + '</span></span></div>' : '') +
        ((s.condition || Object.keys(s.sel).length) ? '<button class="btn btn-ghost btn-sm" data-act="clear">' + icon('x', 16) + esc(t('Tozalash')) + '</button>' : '') + '</aside>';
      const filters = '<div class="glass card tight col g12"><div class="input-group"><span class="prefix">' + icon('search', 18) + '</span><input class="input" type="search" id="dq" data-bind="q" placeholder="' + esc(t('Ism, klinika yoki manzil')) + '" value="' + esc(s.q) + '"></div>' +
        '<div class="chips-scroll"><button class="chip" data-act="spec" data-v="" aria-pressed="' + (!s.spec) + '">' + esc(recSpec() && !s.spec ? t('Tavsiya:') + ' ' + t(recSpec()) : t('Barcha mutaxassislar')) + '</button>' + SPECIALTIES.map((x) => '<button class="chip" data-act="spec" data-v="' + x + '" aria-pressed="' + (s.spec === x) + '">' + esc(t(x)) + '</button>').join('') + '</div>' +
        '<div class="row between"><span class="sm muted">' + esc(t('{n} ta shifokor', { n: list ? list.length : '…' })) + '</span><div class="seg sm">' + [['rec', 'Tavsiya'], ['rating', 'Reyting'], ['exp', 'Tajriba'], ['price', 'Narx']].map(([k, l]) => '<button data-act="sort" data-v="' + k + '" aria-pressed="' + (s.sort === k) + '">' + esc(t(l)) + '</button>').join('') + '</div></div></div>';
      const body = s.error ? '<div class="alert err">' + esc(s.error) + '</div>' : !list ? skeletons(3) : !list.length ? empty('steth', t('Mos shifokor topilmadi'), t('Filtrni o‘zgartiring yoki avtomatik tanlash bilan onlayn murojaat yuboring.'), '<a class="btn btn-primary" href="#/app/new">' + esc(t('Onlayn murojaat')) + '</a>') : '<div class="doc-grid">' + paginate(list, s.page, 12).items.map((d, i) => doctorCard(d, { i })).join('') + '</div>' + pager(paginate(list, s.page, 12));
      const moreLinks = '<div class="tiles"><a class="glass tile" href="#/app/meds"><span class="ic">' + icon('pill', 24) + '</span><b>' + esc(t('Dorilarim')) + '</b><span class="xs muted">' + esc(t('Jadval va eslatmalar')) + '</span></a>' +
        '<a class="glass tile" href="#/verify"><span class="ic">' + icon('scan', 24) + '</span><b>' + esc(t('Retseptni tekshirish')) + '</b><span class="xs muted">' + esc(t('QR kod orqali')) + '</span></a></div>';
      return shell('<div class="finder-layout">' + finder + '<div class="col g20">' + quick + (s.mode === 'visit' ? '<div class="alert info">' + icon('calendar') + '<div>' + esc(t('Klinikada qabulga yozilish uchun shifokorni tanlang, keyin bo‘sh vaqtni belgilang.')) + '</div></div>' : '') + filters + body + moreLinks + '</div></div>',
        { title: t('Shifokor topish'), subtitle: esc(t('Reyting, tajriba va narx bo‘yicha')), back: '#/app' });
    },
    bind(k, v) { s[k] = v; s.page = 1; app.queue(); },
    on: {
      page(el) { s.page = Number(el.dataset.v); app.render(); window.scrollTo(0, 0); },
      view(el) { s.view = el.dataset.v; app.render(); },
      seg(el) { const c = el.dataset.code; if (s.sel[c]) { delete s.sel[c]; s.open = null; } else { s.sel = { [c]: { pain: 5 } }; s.open = c; } s.condition = ''; s.spec = ''; app.render(); },
      clear() { s.condition = ''; s.sel = {}; s.open = null; s.spec = ''; app.render(); },
      spec(el) { s.spec = el.dataset.v; s.page = 1; app.render(); },
      sort(el) { s.sort = el.dataset.v; s.page = 1; app.render(); }
    },
    async mount() { try { s.all = await api('/doctors'); } catch (e) { s.error = errMsg(e); } app.render(); }
  };
}

/** "Yoki kasallik turi" — alohida sahifa, bitta tugmani almashtiradi. */
export function conditionPicker() {
  return {
    title: 'Kasallik turi',
    html() {
      const rows = CONDITIONS.map((c) => '<a class="item" href="#/app/doctors?condition=' + c.key + '">' + icon(c.icon, 20) + '<span class="grow"><b>' + esc(t(c.label)) + '</b></span>' + icon('next', 18) + '</a>').join('');
      return shell('<div class="col g12" style="max-width:640px">' + rows + '</div>', { title: t('Kasallik turini tanlang'), back: '#/app/doctors' });
    }
  };
}

/* ---------------- doctor page + booking ---------------- */
export function doctorPage(params) {
  const q = params.query || new URLSearchParams();
  const s = { d: null, days: null, day: 0, slot: null, reason: '', booking: !!q.get('book'), saving: false, error: '' };
  return {
    title: 'Shifokor',
    html() {
      const d = s.d;
      if (!d) return shell(s.error ? '<div class="alert err">' + esc(s.error) + '</div>' : skeletons(3), { title: t('Shifokor'), back: '#/app/doctors', active: '#/app/doctors' });
      const wh = [1, 2, 3, 4, 5, 6, 0].map((i) => { const x = d.workHours[i] || {}; return '<div class="row between sm wh-row' + (new Date().getDay() === i ? ' today' : '') + '"><span>' + esc(t(WEEKDAYS[i])) + '</span><b>' + (x.on ? esc(x.start + ' – ' + x.end) : '<span class="faint">' + esc(t('Dam olish')) + '</span>') + '</b></div>'; }).join('');
      const head = '<section class="glass card lg doc-hero"><div class="row nw top" style="gap:20px">' + avatar(d, { size: 104, cls: 'ring xl' }) +
        '<div class="grow col g6"><div class="row" style="gap:8px">' + presencePill(d.presence) + (d.rating && d.rating >= 4.5 && d.reviews >= 3 ? '<span class="pill ok">' + icon('spark', 13) + esc(t('Bemorlar tavsiya qiladi')) + '</span>' : '') + '</div>' +
        '<h2>Dr. ' + esc(d.fullName) + '</h2><span class="muted">' + esc(t(d.specialty)) + ' · ' + esc(t('litsenziya')) + ' ' + esc(d.licenseNumber) + '</span>' +
        '<div class="kv" style="margin-top:8px"><div><span>' + esc(t('Reyting')) + '</span><b class="row nw" style="gap:6px">' + (d.rating ? d.rating.toFixed(1) : '—') + ' ' + stars(d.rating, 14) + '</b></div><div><span>' + esc(t('Tajriba')) + '</span><b>' + esc(t('{n} yil', { n: d.experienceYears })) + '</b></div><div><span>' + esc(t('Bemorlar')) + '</span><b>' + d.served + '</b></div><div><span>' + esc(t('Baholar')) + '</span><b>' + d.reviews + '</b></div></div></div></div>' +
        (d.bio ? '<p class="muted" style="margin-top:14px">' + esc(d.bio) + '</p>' : '') + '</section>';
      const clinic = '<div class="glass card col">' + '<h3>' + esc(t('Klinika va manzil')) + ikat() + '</h3>' +
        '<div class="doc-addr">' + icon('building', 18) + '<span><b>' + esc(d.clinicName || t('Klinika ko‘rsatilmagan')) + '</b><br><span class="muted sm">' + esc(d.clinicAddress || '') + '</span></span></div>' +
        (d.clinicAddress || d.clinicLat ? '<div class="map-card">' + ornament('map-orn') + '<span class="pin-drop">' + icon('pin', 34, 2) + '</span><span class="xs faint">' + (d.clinicLat ? d.clinicLat.toFixed(4) + ', ' + d.clinicLng.toFixed(4) : '') + '</span></div>' +
          '<div class="grid g2" style="gap:8px"><a class="btn" href="' + mapsUrl(d) + '" target="_blank" rel="noopener">' + icon('route', 18) + esc(t('Yandex: qanday borish')) + '</a><a class="btn" href="' + gmapsUrl(d) + '" target="_blank" rel="noopener">' + icon('navigation', 18) + esc(t('Google Maps')) + '</a></div>' : '') +
        '<div class="price-row"><div><span class="xs faint">' + esc(t('Onlayn maslahat')) + '</span><b>' + fmtMoney(d.priceOnline) + '</b></div><div><span class="xs faint">' + esc(t('Klinikada qabul')) + '</span><b>' + fmtMoney(d.priceVisit) + '</b></div></div>' +
        '<h4>' + esc(t('Ish vaqti')) + '</h4><div class="col g6">' + wh + '</div></div>';
      const day = s.days && s.days[s.day];
      const book = '<div class="glass card col" id="book"><h3>' + esc(t('Qabulga yozilish')) + ikat() + '</h3>' +
        (!s.days ? skeletons(1) : '<div class="day-tabs">' + s.days.map((x, i) => { const dt = new Date(x.date + 'T00:00'); const free = x.slots.filter((y) => y.free).length; return '<button class="day-tab" data-act="day" data-i="' + i + '" aria-pressed="' + (s.day === i) + '"' + (x.slots.length ? '' : ' disabled') + '><span class="xs">' + esc(t(WEEKDAYS[dt.getDay()]).slice(0, 3)) + '</span><b>' + dt.getDate() + '</b><span class="xs ' + (free ? 'ok-t' : 'faint') + '">' + (x.slots.length ? esc(t('{n} bo‘sh', { n: free })) : '—') + '</span></button>'; }).join('') + '</div>' +
          (day && day.slots.length ? '<div class="slots">' + day.slots.map((x) => '<button class="slot" data-act="slot" data-v="' + x.startAt + '" aria-pressed="' + (s.slot === x.startAt) + '"' + (x.free ? '' : ' disabled') + '>' + fmtTime(x.startAt) + '</button>').join('') + '</div>' : '<p class="sm muted">' + esc(t('Bu kuni qabul yo‘q.')) + '</p>') +
          (s.slot ? '<div class="col g12 book-confirm"><div class="well row nw" style="gap:10px">' + icon('calendar', 20) + '<span class="sm"><b>' + esc(fmtDayLong(s.slot)) + ', ' + fmtTime(s.slot) + '</b><br><span class="muted">' + esc(d.clinicName || '') + ' · ' + fmtMoney(d.priceVisit) + '</span></span></div>' +
            '<label class="field"><span>' + esc(t('Qabul sababi (ixtiyoriy)')) + '</span><textarea class="input" id="reason" data-bind="reason" maxlength="500" style="min-height:70px" placeholder="' + esc(t('Masalan: tizza og‘rig‘i, nazorat ko‘rigi')) + '">' + esc(s.reason) + '</textarea></label>' +
            '<button class="btn btn-primary btn-lg" data-act="book"' + (s.saving ? ' disabled' : '') + '>' + (s.saving ? spinner() : icon('check', 18, 2.6) + esc(t('Yozilishni tasdiqlash'))) + '</button></div>' : '')) + '</div>';
      const reviews = '<div class="glass card col"><h3>' + esc(t('Bemorlar fikri')) + ikat() + '</h3>' +
        (d.reviews ? '<div class="dist">' + [5, 4, 3, 2, 1].map((n) => { const c = d.distribution[n - 1]; return '<div class="row nw sm" style="gap:8px"><span style="width:14px">' + n + '</span>' + icon('star', 13, 1.8) + '<div class="hbar grow"><i style="width:' + (100 * c / Math.max(1, d.reviews)) + '%;background:var(--amber)"></i></div><span class="faint" style="width:24px;text-align:right">' + c + '</span></div>'; }).join('') + '</div>' +
          d.reviewList.map((r) => '<div class="review"><div class="row between nw"><b class="sm">' + esc(r.author) + '</b>' + stars(r.rating, 13) + '</div>' + (r.comment ? '<p class="sm">' + esc(r.comment) + '</p>' : '') + '<span class="xs faint">' + ago(r.createdAt) + '</span></div>').join('') : '<p class="sm muted">' + esc(t('Hali baho yo‘q. Birinchi bo‘lib baholang!')) + '</p>') + '</div>';
      const actions = '<div class="row sticky-actions"><a class="btn btn-lg grow" href="#/app/new?doctor=' + d.id + '">' + icon('chat', 18) + esc(t('Onlayn maslahat')) + '</a><button class="btn btn-primary btn-lg grow" data-act="scrollBook">' + icon('calendar', 18) + esc(t('Qabulga yozilish')) + '</button></div>';
      return shell('<div class="doc-layout"><div class="col g20">' + head + actions + book + reviews + '</div><div class="col g20">' + clinic + '</div></div>', { title: 'Dr. ' + d.fullName, subtitle: esc(t(d.specialty)), back: '#/app/doctors', active: '#/app/doctors' });
    },
    bind(k, v) { s[k] = v; },
    on: {
      day(el) { s.day = Number(el.dataset.i); s.slot = null; app.render(); },
      slot(el) { s.slot = Number(el.dataset.v); app.render(); setTimeout(() => { const n = document.querySelector('.book-confirm'); if (n) n.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 30); },
      scrollBook() { const n = document.getElementById('book'); if (n) n.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
      async book() {
        s.saving = true; app.render();
        try {
          await api('/appointments', { method: 'POST', body: { doctorId: s.d.id, startAt: s.slot, reason: s.reason } });
          toast(t('Qabulga yozildingiz!'));
          go('#/app/visits');
        } catch (e) { s.saving = false; s.days = await api('/doctors/' + s.d.id + '/slots?days=7').catch(() => s.days); s.slot = null; app.render(); throw e; }
      }
    },
    async mount() {
      try {
        const [d, days] = await Promise.all([api('/doctors/' + params.id), api('/doctors/' + params.id + '/slots?days=7')]);
        s.d = d; s.days = days; s.day = Math.max(0, days.findIndex((x) => x.slots.some((y) => y.free)));
      } catch (e) { s.error = errMsg(e); }
      app.render();
      if (s.booking) setTimeout(() => { const n = document.getElementById('book'); if (n) n.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 120);
    }
  };
}

/* ---------------- my visits ---------------- */
export function patientVisits() {
  const s = { items: null, error: '', rateFor: null, rating: 0, rvComment: '' };
  const load = async () => { s.items = await api('/appointments/my'); app.render(); };
  return {
    title: 'Qabullarim',
    html() {
      const up = (s.items || []).filter((a) => ['BOOKED', 'ARRIVED', 'IN_PROGRESS'].includes(a.status) && a.endAt > Date.now() - 3600000).sort((a, b) => a.startAt - b.startAt);
      const past = (s.items || []).filter((a) => !up.includes(a));
      const card = (a, i) => '<article class="glass card col visit" style="--d:' + i + '"><div class="row between nw top"><div class="row nw" style="gap:12px">' + (a.doctor ? avatar(a.doctor, { size: 48 }) : '') + '<div><b>Dr. ' + esc(a.doctor ? a.doctor.fullName : '') + '</b><div class="sm muted">' + esc(a.doctor ? t(a.doctor.specialty) : '') + '</div></div></div>' + apptPill(a.status) + '</div>' +
        '<div class="kv"><div><span>' + esc(t('Sana')) + '</span><b>' + esc(fmtDayLong(a.startAt)) + '</b></div><div><span>' + esc(t('Vaqt')) + '</span><b>' + fmtTime(a.startAt) + ' – ' + fmtTime(a.endAt) + '</b></div><div><span>' + esc(t('Narx')) + '</span><b>' + fmtMoney(a.price) + '</b></div></div>' +
        (a.doctor && (a.doctor.clinicAddress || a.doctor.clinicName) ? '<div class="doc-addr sm">' + icon('pin', 16) + '<span><b>' + esc(a.doctor.clinicName) + '</b><br><span class="muted">' + esc(a.doctor.clinicAddress) + '</span></span></div>' : '') +
        (a.reason ? '<p class="sm"><span class="faint">' + esc(t('Sabab:')) + '</span> ' + esc(a.reason) + '</p>' : '') + (a.doctorNote ? '<div class="well sm"><b>' + esc(t('Shifokor izohi:')) + '</b> ' + esc(a.doctorNote) + '</div>' : '') +
        (a.status === 'IN_PROGRESS' ? '<div class="alert info sm">' + icon('door', 18) + '<div>' + esc(t('Shifokor sizni kutmoqda — kabinetga kiring')) + '</div></div>' : '') +
        '<div class="row" style="gap:8px">' + (a.doctor ? '<a class="btn btn-sm" href="' + mapsUrl(a.doctor) + '" target="_blank" rel="noopener">' + icon('route', 16) + esc(t('Qanday borish')) + '</a>' : '') +
        (a.status === 'BOOKED' ? '<button class="btn btn-danger btn-sm" data-act="cancel" data-id="' + a.id + '">' + esc(t('Bekor qilish')) + '</button>' : '') +
        (a.status === 'DONE' && !a.review ? '<button class="btn btn-primary btn-sm" data-act="rateOpen" data-id="' + a.id + '">' + icon('star', 16) + esc(t('Baholash')) + '</button>' : '') +
        (a.review ? '<span class="row nw sm" style="gap:6px">' + esc(t('Bahoingiz:')) + stars(a.review.rating, 14) + '</span>' : '') + '</div>' +
        (s.rateFor === a.id ? reviewCard(s) : '') + '</article>';
      const body = s.error ? '<div class="alert err">' + esc(s.error) + '</div>' : s.items === null ? skeletons(3) : !s.items.length ? empty('calendar', t('Hali qabulga yozilmagansiz'), t('Shifokorni tanlab, bo‘sh vaqtga yoziling.'), '<a class="btn btn-primary" href="#/app/doctors?mode=visit">' + esc(t('Shifokor tanlash')) + '</a>')
        : (up.length ? sectionHead(t('Kelgusi qabullar')) + '<div class="col">' + up.map(card).join('') + '</div>' : '') + (past.length ? sectionHead(t('O‘tgan qabullar')) + '<div class="col">' + past.map(card).join('') + '</div>' : '');
      return shell('<div class="col g20" style="max-width:820px">' + body + '</div>', { title: t('Qabullarim'), subtitle: esc(t('Klinikadagi uchrashuvlar')), back: '#/app', actions: '<a class="btn btn-primary btn-sm hide-sm" href="#/app/doctors?mode=visit">' + icon('plus', 16) + esc(t('Yozilish')) + '</a>' });
    },
    bind(k, v) { s[k] = v; },
    on: {
      async cancel(el) { if (!(await confirmSheet({ title: t('Qabulni bekor qilasizmi?'), text: t('Shifokorga xabar boradi.'), ok: t('Ha, bekor qilish'), danger: true }))) return; await api('/appointments/' + el.dataset.id + '/cancel', { method: 'POST' }); toast(t('Qabul bekor qilindi')); await load(); },
      rateOpen(el) { s.rateFor = Number(el.dataset.id); s.rating = 0; s.rvComment = ''; app.render(); },
      rate(el) { s.rating = Number(el.dataset.v); app.render(); },
      async sendReview() { await api('/reviews', { method: 'POST', body: { appointmentId: s.rateFor, rating: s.rating, comment: s.rvComment } }); s.rateFor = null; toast(t('Rahmat! Bahoingiz qabul qilindi')); await load(); }
    },
    async mount() { try { await load(); } catch (e) { s.error = errMsg(e); app.render(); } }
  };
}

/* ---------------- medication tracker ---------------- */
const doseCourse = (c, i, s) => {
  const pct = c.progress.total ? Math.round(100 * c.progress.taken / c.progress.total) : 0;
  return '<article class="glass card col course' + (c.active ? '' : ' ended') + '" style="--d:' + i + '"><div class="row between nw top"><div class="row nw" style="gap:14px"><div class="ring-prog" style="--p:' + pct + '"><span>' + pct + '%</span></div><div><b>' + esc(t('Retsept')) + ' ' + esc(c.number) + '</b><div class="sm muted">Dr. ' + esc(c.doctorName) + ' · ' + fmtDay(c.startAt) + ' — ' + fmtDay(c.endAt) + '</div>' +
    (c.dispensedAt ? '<div class="xs faint">' + esc(t('Dorixona:')) + ' ' + esc(c.dispensedBy || '') + '</div>' : '') + '</div></div>' + (c.cancelled ? '<span class="pill err">' + esc(t('Retsept bekor qilingan — dorini to‘xtating')) + '</span>' : c.active ? '<span class="pill ok">' + esc(t('Davom etmoqda')) + '</span>' : '<span class="pill">' + esc(t('Yakunlangan')) + '</span>') + '</div>' +
    c.items.map((it) => '<div class="med row nw" style="gap:10px;align-items:flex-start">' + (it.photo ? '<img src="/api/v1/medicines/' + it.medicineId + '/photo?v=' + it.photo + '" alt="" class="med-photo-thumb sm">' : '') + '<span class="grow col" style="gap:2px"><div class="row between nw"><b>' + esc(it.name + ' ' + it.strength) + '</b><span class="xs faint">' + esc(t('kuniga {n} marta', { n: it.timesPerDay })) + ' · ' + esc(t('{n} kun', { n: it.days })) + '</span></div><span class="sm">' + esc(it.dosage) + (it.instructions ? ' · ' + esc(it.instructions) : '') + '</span><div class="times">' + it.times.map((m) => '<span class="time-chip">' + icon('clock', 13) + fmtMin(m) + '</span>').join('') + '</div></span></div>').join('') +
    '<div class="row between sm"><span class="muted">' + esc(t('Ichildi: {a} · O‘tkazildi: {b} · Unutildi: {c}', { a: c.progress.taken, b: c.progress.skipped, c: c.progress.missed })) + '</span>' + (c.active ? '<button class="btn btn-ghost btn-sm" data-act="edit" data-id="' + c.prescriptionId + '">' + icon('settings', 16) + esc(t('Vaqtni sozlash')) + '</button>' : '') + '</div>' +
    (s.editing === c.prescriptionId ? '<div class="well col g12"><div class="grid g2"><label class="field"><span>' + esc(t('Uyg‘onish vaqti')) + '</span><input class="input" type="time" id="wake" data-bind="wake" value="' + esc(s.wake) + '"></label><label class="field"><span>' + esc(t('Uxlash vaqti')) + '</span><input class="input" type="time" id="sleep" data-bind="sleep" value="' + esc(s.sleep) + '"></label></div><p class="xs faint">' + esc(t('Dozalar shu oraliqda teng taqsimlanadi.')) + '</p><div class="row end"><button class="btn btn-ghost btn-sm" data-act="editCancel">' + esc(t('Bekor qilish')) + '</button><button class="btn btn-primary btn-sm" data-act="editSave">' + esc(t('Saqlash')) + '</button></div></div>' : '') + '</article>';
};
/** Dorilarim → bugungi dozalar bosh sahifada, "Dori kurslari" esa tepadagi tugma orqali ochiladigan alohida sahifa. */
export function patientMeds(params = {}) {
  const section = params.section || 'today';
  const s = { error: '', editing: null, wake: '08:00', sleep: '22:00' };
  const toMin = (v) => { const [h, m] = String(v).split(':').map(Number); return h * 60 + (m || 0); };
  return {
    title: 'Dorilarim',
    html() {
      const data = meds.data;
      const notifOn = systemNotifications.enabled();
      const perm = '<div class="glass card row between notif-card' + (notifOn ? ' on' : '') + '"><div class="row nw" style="gap:12px"><span class="ic">' + icon('alarm', 22) + '</span><div><b>' + esc(t(notifOn ? 'Eslatmalar yoqilgan' : 'Telefon eslatmalarini yoqing')) + '</b><div class="sm muted">' + esc(t('Dori vaqti kelganda budilnikdek signal chalinadi. Ilova ochiq yoki o‘rnatilgan bo‘lishi kerak.')) + '</div></div></div>' +
        (systemNotifications.supported() ? '<button class="btn ' + (notifOn ? 'btn-ghost' : 'btn-primary') + ' btn-sm" data-act="notif">' + esc(t(notifOn ? 'O‘chirish' : 'Yoqish')) + '</button>' : '<span class="xs faint">' + esc(t('Brauzer qo‘llab-quvvatlamaydi')) + '</span>') + '</div>';
      if (!data) return shell('<div class="col g20" style="max-width:860px">' + perm + (s.error ? '<div class="alert err">' + esc(s.error) + '</div>' : skeletons(3)) + '</div>', { title: t('Dorilarim'), back: '#/app' });
      if (section === 'courses') {
        const avail = data.available.length ? '<div class="glass card col">' + sectionHead(t('Eslatma yoqilmagan retseptlar')) + data.available.map((p) => '<div class="row between well"><span class="sm"><b>' + esc(p.number) + '</b> · ' + fmtDay(p.issuedAt) + '</span><button class="btn btn-primary btn-sm" data-act="start" data-id="' + p.id + '">' + icon('alarm', 16) + esc(t('Eslatmani yoqish')) + '</button></div>').join('') + '<p class="xs faint">' + esc(t('Dorixona retseptni skanerlaganda eslatmalar avtomatik yoqiladi.')) + '</p></div>' : '';
        const courses = data.courses.length ? '<div class="col">' + data.courses.map((c, i) => doseCourse(c, i, s)).join('') + '</div>' : empty('pill', t('Hali dori kursi yo‘q'), t('Shifokor retsept yozib, dorixona uni tasdiqlagach, jadval shu yerda paydo bo‘ladi.'));
        return shell('<div class="col g20" style="max-width:860px">' + avail + courses + '</div>', { title: t('Dori kurslari'), back: '#/app/meds' });
      }
      const today = data.doses.filter((d) => dayKey(d.dueAt) === dayKey(Date.now()));
      const tomorrow = data.doses.filter((d) => dayKey(d.dueAt) === dayKey(Date.now() + 86400000));
      const coursesBtn = '<a class="item" href="#/app/meds/courses">' + icon('pill', 20) + '<span class="grow"><b>' + esc(t('Dori kurslari')) + '</b><br><span class="sm muted">' + esc(t('{n} ta faol retsept', { n: data.courses.filter((c) => c.active).length })) + '</span></span>' + icon('next', 18) + '</a>';
      const timeline = '<div class="glass card col">' + sectionHead(t('Bugun'), '<span class="sm muted">' + esc(t('{a} / {b} ichildi', { a: today.filter((d) => d.status === 'TAKEN').length, b: today.length })) + '</span>') +
        (today.length ? '<div class="dose-list">' + today.map(doseRow).join('') + '</div>' : '<p class="sm muted">' + esc(t('Bugun ichiladigan dori yo‘q.')) + '</p>') +
        (tomorrow.length ? '<h4 style="margin-top:8px">' + esc(t('Ertaga')) + '</h4><div class="dose-list">' + tomorrow.map(doseRow).join('') + '</div>' : '') + '</div>';
      return shell('<div class="col g20" style="max-width:860px">' + perm + coursesBtn + timeline + '</div>', { title: t('Dorilarim'), subtitle: esc(t('Dori ichish jadvali va eslatmalar')), back: '#/app' });
    },
    bind(k, v) { s[k] = v; },
    on: {
      async dose(el) { await markDose(Number(el.dataset.item), Number(el.dataset.due), el.dataset.st); },
      async notif() { if (systemNotifications.enabled()) { systemNotifications.disable(); toast(t('Eslatmalar o‘chirildi'), 'info'); } else if (await systemNotifications.enable()) toast(t('Eslatmalar yoqildi')); else toast(t('Brauzer ruxsat bermadi. Sozlamalardan bildirishnomalarga ruxsat bering'), 'err'); app.render(); },
      async start(el) { await api('/tracker/start', { method: 'POST', body: { prescriptionId: Number(el.dataset.id) } }); await refreshMeds(); toast(t('Dori eslatmalari yoqildi')); app.render(); },
      edit(el) { const c = meds.data.courses.find((x) => x.prescriptionId === Number(el.dataset.id)); s.editing = c.prescriptionId; s.wake = fmtMin(c.wakeMinute); s.sleep = fmtMin(c.sleepMinute); app.render(); },
      editCancel() { s.editing = null; app.render(); },
      async editSave() { await api('/tracker/' + s.editing, { method: 'PATCH', body: { wakeMinute: toMin(s.wake), sleepMinute: toMin(s.sleep) } }); s.editing = null; await refreshMeds(); toast(t('Jadval yangilandi')); app.render(); }
    },
    async mount() { try { await refreshMeds(); } catch (e) { s.error = errMsg(e); } app.render(); }
  };
}

/* ---------------- nearby pharmacies & hospitals ---------------- */
export function patientNearby() {
  const s = { pos: null, locating: false, error: '', clinics: null };
  const dist = (a, b) => { const R = 6371, r = (x) => x * Math.PI / 180; const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng); const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  const search = (what) => s.pos ? 'https://yandex.uz/maps/?ll=' + s.pos.lng + ',' + s.pos.lat + '&z=14&text=' + encodeURIComponent(what) : 'https://yandex.uz/maps/?text=' + encodeURIComponent(what);
  const gsearch = (what) => 'https://www.google.com/maps/search/' + encodeURIComponent(what) + (s.pos ? '/@' + s.pos.lat + ',' + s.pos.lng + ',15z' : '');
  return {
    title: 'Yaqin atrofda',
    html() {
      const cats = [['pill', 'Dorixonalar', 'dorixona', 'pharmacy', 'Eng yaqin dorixonalar va ish vaqti'], ['hospital', 'Shifoxonalar', 'shifoxona', 'hospital', 'Kasalxona va tez yordam bo‘limlari'], ['building', 'Poliklinikalar', 'poliklinika', 'polyclinic', 'Oilaviy poliklinika va QVP'], ['heart', 'Diagnostika markazlari', 'diagnostika markazi', 'diagnostic center', 'Tahlil, UZI, MRT']];
      const loc = '<div class="glass card row between locate' + (s.pos ? ' on' : '') + '"><div class="row nw" style="gap:12px"><span class="ic pulse-ic">' + icon('navigation', 22) + '</span><div><b>' + esc(t(s.pos ? 'Joylashuvingiz aniqlandi' : 'Joylashuvingizni aniqlang')) + '</b><div class="sm muted">' + esc(s.pos ? s.pos.lat.toFixed(4) + ', ' + s.pos.lng.toFixed(4) + ' · ±' + Math.round(s.pos.acc) + ' m' : t('Eng yaqin dorixona va shifoxonalarni ko‘rsatish uchun')) + '</div></div></div>' +
        '<button class="btn btn-primary btn-sm" data-act="locate"' + (s.locating ? ' disabled' : '') + '>' + (s.locating ? spinner() : icon('pin', 16) + esc(t(s.pos ? 'Yangilash' : 'Aniqlash'))) + '</button></div>' + (s.error ? '<div class="alert warn sm">' + icon('alert', 18) + '<div>' + esc(s.error) + '</div></div>' : '');
      const grid = '<div class="tiles big">' + cats.map(([ic, title, uz, en, sub], i) => '<div class="glass tile" style="--d:' + i + '"><span class="ic">' + icon(ic, 24) + '</span><b>' + esc(t(title)) + '</b><span class="xs muted">' + esc(t(sub)) + '</span><div class="row" style="gap:6px;margin-top:6px"><a class="btn btn-sm" href="' + search(uz) + '" target="_blank" rel="noopener">Yandex</a><a class="btn btn-sm" href="' + gsearch(en) + '" target="_blank" rel="noopener">Google</a></div></div>').join('') + '</div>';
      const clinics = (s.clinics || []).filter((d) => d.clinicLat).map((d) => ({ ...d, km: s.pos ? dist(s.pos, { lat: d.clinicLat, lng: d.clinicLng }) : null })).sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9));
      const list = '<div class="glass card col">' + sectionHead(t('MedAssist shifokorlari klinikalari')) + (s.clinics === null ? skeletons(2) : !clinics.length ? '<p class="sm muted">' + esc(t('Manzili ko‘rsatilgan klinika yo‘q.')) + '</p>' :
        clinics.map((d) => '<div class="clinic-row"><span class="ic">' + icon('building', 18) + '</span><div class="grow"><b class="sm">' + esc(d.clinicName) + '</b><div class="xs muted">' + esc(d.clinicAddress) + '</div><div class="xs">Dr. ' + esc(d.fullName) + ' · ' + esc(t(d.specialty)) + '</div></div>' + (d.km != null ? '<b class="sm nowrap">' + (d.km < 1 ? Math.round(d.km * 1000) + ' m' : d.km.toFixed(1) + ' km') + '</b>' : '') + '<a class="icon-btn" href="' + mapsUrl(d) + '" target="_blank" rel="noopener" aria-label="' + esc(t('Qanday borish')) + '">' + icon('route', 18) + '</a></div>').join('')) + '</div>';
      const sos = '<div class="emergency">' + icon('phone', 24) + '<div class="t">' + esc(t('Shoshilinch holatda: tez yordam 103, yong‘in 101, IIB 102. Yagona raqam — 112.')) + '</div><a class="btn btn-emergency" href="tel:103">' + esc(t('103 ga qo‘ng‘iroq')) + '</a></div>';
      return shell('<div class="col g20" style="max-width:960px">' + loc + grid + sos + list + '</div>', { title: t('Yaqin atrofda'), subtitle: esc(t('Dorixonalar, shifoxonalar va klinikalar')), back: '#/app' });
    },
    on: {
      locate() {
        if (!navigator.geolocation) { s.error = t('Brauzeringiz joylashuvni aniqlay olmaydi'); app.render(); return; }
        s.locating = true; s.error = ''; app.render();
        navigator.geolocation.getCurrentPosition((p) => { s.pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }; s.locating = false; app.render(); },
          (e) => { s.locating = false; s.error = e.code === 1 ? t('Joylashuvga ruxsat berilmadi. Brauzer sozlamalaridan ruxsat bering') : t('Joylashuvni aniqlab bo‘lmadi. HTTPS orqali ochilganini tekshiring'); app.render(); }, { enableHighAccuracy: true, timeout: 12000 });
      }
    },
    async mount() { try { s.clinics = await api('/doctors'); } catch { s.clinics = []; } app.render(); }
  };
}

/* ---------------- profile ---------------- */
const PROFILE_MENU = [
  ['personal', 'user', 'Shaxsiy ma’lumotlar', 'Ism, telefon, tug‘ilgan yil, jins, manzil'],
  ['medical', 'pulse', 'Tibbiy ma’lumotlar', 'Favqulodda aloqa, allergiya, kasallik tarixi'],
  ['security', 'lock', 'Xavfsizlik va sozlamalar', 'Parol, til, bildirishnoma, chiqish']
];
const personalFields = (f, u) => '<label class="field"><span>' + esc(t('Ism va familiya')) + '</span><input class="input" id="fullName" data-bind="fullName" value="' + esc(f.fullName) + '"></label>' +
  '<label class="field"><span>' + esc(t('Telefon')) + '</span><input class="input" value="' + esc(fmtPhone(u.phone)) + '" disabled></label>' +
  '<div class="grid g2"><label class="field"><span>' + esc(t('Tug‘ilgan yil')) + '</span><input class="input" id="birthYear" data-bind="birthYear" inputmode="numeric" maxlength="4" value="' + esc(f.birthYear) + '"></label>' +
  '<div class="field"><span>' + esc(t('Jins')) + '</span><div class="seg" style="height:50px;align-items:stretch"><button data-act="gender" data-v="M" aria-pressed="' + (f.gender === 'M') + '" style="flex:1">' + esc(t('Erkak')) + '</button><button data-act="gender" data-v="F" aria-pressed="' + (f.gender === 'F') + '" style="flex:1">' + esc(t('Ayol')) + '</button></div></div></div>' +
  (f.gender === 'F' ? '<label class="check"><input type="checkbox" data-bind="pregnant"' + (f.pregnant ? ' checked' : '') + '>' + esc(t('Hozir homiladorman')) + '</label>' : '') +
  '<label class="field"><span>' + esc(t('To‘liq yashash manzili')) + '</span><textarea class="input" id="address" data-bind="address" maxlength="300" style="min-height:70px" placeholder="' + esc(t('Viloyat, shahar/tuman, ko‘cha, uy, xonadon')) + '">' + esc(f.address) + '</textarea><small>' + esc(t('Shifokor uyga chaqirilganda va tez yordam uchun kerak bo‘ladi.')) + '</small></label>';
const medicalFields = (f) => '<label class="field"><span>' + esc(t('Yaqin kishining telefoni')) + '</span><input class="input" id="emergencyContact" data-bind="emergencyContact" inputmode="tel" value="' + esc(f.emergencyContact) + '" placeholder="+998 90 123 45 67"></label>' +
  '<label class="field"><span>' + esc(t('Allergiya')) + '</span><input class="input" id="allergies" data-bind="allergies" value="' + esc(f.allergies) + '" placeholder="' + esc(t('Bo‘lmasa bo‘sh qoldiring')) + '"></label>' +
  '<label class="field"><span>' + esc(t('Surunkali kasalliklar')) + '</span><input class="input" id="chronic" data-bind="chronic" value="' + esc(f.chronic) + '"></label>' +
  '<label class="field"><span>' + esc(t('Qon guruhi')) + '</span><select class="input" id="bloodType" data-bind="bloodType">' + ['', 'O(I)+', 'O(I)−', 'A(II)+', 'A(II)−', 'B(III)+', 'B(III)−', 'AB(IV)+', 'AB(IV)−'].map((v) => '<option value="' + v + '"' + (f.bloodType === v ? ' selected' : '') + '>' + esc(v || t('Bilmayman')) + '</option>').join('') + '</select></label>';
/** Profil → bitta menyu + har bir bo‘lim o‘z alohida sahifasida (o‘z URL bilan), bitta uzun forma emas. */
export function patientProfile(params = {}) {
  const section = params.section || 'menu';
  const u0 = session.user; const p = u0.patient || {};
  const f = { fullName: u0.fullName, birthYear: String(p.birthYear || ''), gender: p.gender || 'M', bloodType: p.bloodType || '', allergies: p.allergies || '', chronic: p.chronic || '', pregnant: !!p.pregnant, address: p.address || '', emergencyContact: p.emergencyContact || '', current: '', next: '', saving: false, pwSaving: false, photoBusy: false, qr: '' };
  return {
    title: 'Profil',
    html() {
      const u = session.user;
      if (section === 'security') return shell('<div class="col g20" style="max-width:640px">' + securityCard(f) + '</div>', { title: t('Xavfsizlik va sozlamalar'), back: '#/app/profile' });
      if (section === 'personal' || section === 'medical') {
        const isMed = section === 'medical';
        return shell('<div class="glass card lg col g20" style="max-width:640px">' + '<div class="col g20">' + (isMed ? medicalFields(f) : personalFields(f, u)) + '</div>' +
          '<button class="btn btn-primary btn-lg" data-act="save"' + (f.saving ? ' disabled' : '') + '>' + (f.saving ? spinner() : icon('check', 18, 2.6) + esc(t('Saqlash'))) + '</button></div>',
          { title: t(isMed ? 'Tibbiy ma’lumotlar' : 'Shaxsiy ma’lumotlar'), back: '#/app/profile' });
      }
      const rows = PROFILE_MENU.map(([key, ic, label, sub]) => '<a class="item" href="#/app/profile/' + key + '">' + icon(ic, 20) + '<span class="grow"><b>' + esc(t(label)) + '</b><br><span class="sm muted">' + esc(t(sub)) + '</span></span>' + icon('next', 18) + '</a>').join('');
      const validUntil = fmtDay(u0.createdAt + 3 * 365 * 86400000);
      const card = idCard(u, { role: 'patient', title: t('Bemor tibbiy kartasi'), qr: f.qr, fields: [[t('Tug‘ilgan yili'), p.birthYear || ''], [t('Qon guruhi'), p.bloodType || ''], [t('Allergiya'), p.allergies || '', 'warn'], [t('Amal qiladi'), validUntil]] });
      return shell('<div class="col g20" style="max-width:640px">' + card + '<div class="glass card lg col g20">' + photoBlock(u, f, true) + '</div><div class="col g12">' + rows + '</div></div>',
        { title: t('Profil'), subtitle: esc(t('Shaxsiy va tibbiy ma’lumotlar')), back: '#/app' });
    },
    bind(k, v) { f[k] = v; },
    on: {
      gender(el) { f.gender = el.dataset.v; if (f.gender !== 'F') f.pregnant = false; app.render(); },
      async save() {
        f.saving = true; app.render();
        try { session.user = await api('/me/profile', { method: 'PUT', body: { fullName: f.fullName, birthYear: Number(f.birthYear), gender: f.gender, bloodType: f.bloodType, allergies: f.allergies, chronic: f.chronic, pregnant: f.pregnant, address: f.address, emergencyContact: f.emergencyContact } }); toast(t('Profil saqlandi')); go('#/app/profile'); }
        finally { f.saving = false; app.render(); }
      },
      changePw: () => changePassword(f),
      ...photoActions(f),
      ...accountActions(f)
    },
    async mount() { if (section !== 'menu') return; try { f.qr = (await api('/me/qr')).svg; app.render(); } catch { /* QR is a nicety, not critical */ } }
  };
}

/* ---------------- shared profile pieces ---------------- */
export function photoBlock(u, f, priv) {
  return '<div class="photo-block"><div class="photo-wrap">' + avatar(u, { size: 96, cls: 'ring xl', private: priv }) + (f.photoBusy ? '<span class="photo-busy">' + spinner() + '</span>' : '') + '</div><div class="col g6"><h2 class="profile-name">' + esc(u.fullName) + '</h2><p class="sm muted">' + fmtPhone(u.phone) + '</p>' +
    '<div class="row" style="gap:6px"><label class="btn btn-sm" style="cursor:pointer">' + icon('camera', 16) + esc(t(u.photo ? 'Rasmni almashtirish' : 'Rasm qo‘yish')) + '<input type="file" class="sr" data-file="photo" accept="image/jpeg,image/png"></label>' +
    (u.photo ? '<button class="btn btn-ghost btn-sm" data-act="photoDel">' + icon('trash', 16) + esc(t('O‘chirish')) + '</button>' : '') + '</div></div></div>';
}
export const photoActions = (f) => ({
  async photo(el) {
    const file = el.files && el.files[0]; el.value = '';
    if (!file) return;
    if (!/^image\/(jpeg|png)$/.test(file.type)) { toast(t('Rasm jpg yoki png bo‘lishi kerak'), 'err'); return; }
    f.photoBusy = true; app.render();
    try { const blob = await resizeImage(file); session.user = await api('/me/photo', { method: 'POST', raw: blob, headers: { 'content-type': 'image/jpeg' } }); toast(t('Rasm yangilandi')); }
    finally { f.photoBusy = false; app.render(); }
  },
  async photoDel() { if (!(await confirmSheet({ title: t('Rasmni o‘chirasizmi?'), ok: t('O‘chirish'), danger: true }))) return; session.user = await api('/me/photo', { method: 'DELETE' }); toast(t('Rasm o‘chirildi')); app.render(); }
});
const prefActions = {
  async sysNotif() { if (systemNotifications.enabled()) systemNotifications.disable(); else if (!(await systemNotifications.enable())) toast(t('Brauzer ruxsat bermadi. Sozlamalardan bildirishnomalarga ruxsat bering'), 'err'); app.render(); }
};
/** Password change + language/notification/theme prefs + logout — one flowing card, not three stacked ones. */
export function securityCard(f) {
  const on = systemNotifications.enabled();
  return '<div class="glass card lg col g20">' +
    '<div class="col g16">' +
    pwField({ id: 'current', label: t('Joriy parol'), value: f.current, auto: 'current-password' }) +
    pwField({ id: 'next', label: t('Yangi parol'), value: f.next, auto: 'new-password', hint: t('Kamida 8 belgi, harf va raqam') }) +
    pwField({ id: 'next2', label: t('Yangi parolni takrorlang'), value: f.next2 || '', auto: 'new-password' }) +
    '<button class="btn" data-act="changePw"' + (f.pwSaving ? ' disabled' : '') + '>' + (f.pwSaving ? spinner() : esc(t('Parolni yangilash'))) + '</button></div>' +
    '<div class="hr"></div><div class="col g16">' +
    '<div class="row between"><span class="sm"><b>' + esc(t('Til')) + '</b></span>' + langSwitch() + '</div>' +
    '<div class="row between"><span class="sm"><b>' + esc(t('Brauzer bildirishnomalari')) + '</b><br><span class="muted xs">' + esc(t('Yangi xabar, javob va eslatmalar telefon ekranida chiqadi')) + '</span></span><button class="switch" role="switch" aria-checked="' + on + '" data-act="sysNotif" aria-label="' + esc(t('Brauzer bildirishnomalari')) + '"></button></div>' +
    '<div class="row between"><span class="sm"><b>' + esc(t('Mavzu')) + '</b></span><button class="btn btn-sm" data-act="theme">' + icon('moon', 16) + esc(t('Kunduzgi / tungi')) + '</button></div></div>' +
    '<div class="hr"></div><button class="btn btn-danger" data-act="logout">' + icon('out', 18) + esc(t('Akkauntdan chiqish')) + '</button></div>';
}
export const settingsActions = prefActions;
/** Actions for a profile view's own `f` state: spread as `...accountActions(f)` into its `on` block. */
export const accountActions = () => prefActions;
export async function changePassword(f) {
  if (f.next !== (f.next2 || '')) { toast(t('Parollar mos kelmadi'), 'err'); return; }
  f.pwSaving = true; app.render();
  try { const r = await api('/me/password', { method: 'PUT', body: { current: f.current, next: f.next } }); if (r && r.accessToken) session.token = r.accessToken; f.current = ''; f.next = ''; f.next2 = ''; toast(t('Parol yangilandi. Boshqa qurilmalardagi sessiyalar yopildi')); }
  finally { f.pwSaving = false; app.render(); }
}
