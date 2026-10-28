import { one, all, run, insert, now, tx, json } from '../db.js';
import { HttpError, bad, forbidden, notFound, conflict, str, intIn, rateLimit } from '../http.js';
import { audit, notify, notifyAdmins } from '../auth.js';
import { userDto, doctorProfile, doctorPublic, DOCTOR_PUBLIC_SQL, requireVerifiedDoctor, ratingOf, photoV, ageFrom, workHours } from '../dto.js';
import { SEGMENT_CODES, SEGMENT_NAMES } from '../../public/shared/clinical.js';

const DAY = 86400000;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const toMin = (s) => { const m = HHMM.exec(s); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const ACTIVE_APPT = ['BOOKED', 'ARRIVED', 'IN_PROGRESS'];
const SLOT_SIZES = [10, 15, 20, 30, 45, 60];

function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}
const dayStart = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const dayKey = (t) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

/** Bookable slots of one day: work hours split by slot length, minus taken and past slots. */
export function slotsFor(doctorRow, day) {
  const wh = workHours(doctorRow.work_hours)[day.getDay()];
  if (!wh || !wh.on) return [];
  const a = toMin(wh.start), b = toMin(wh.end), step = doctorRow.slot_minutes || 30;
  if (a == null || b == null || b <= a) return [];
  const base = day.getTime();
  const taken = new Set(all("SELECT start_at FROM appointments WHERE doctor_id = ? AND start_at >= ? AND start_at < ? AND status != 'CANCELLED'", doctorRow.user_id, base, base + DAY).map((x) => x.start_at));
  const out = [];
  for (let m = a; m + step <= b; m += step) {
    const d = new Date(day); d.setHours(0, m, 0, 0);
    const t = d.getTime();
    out.push({ startAt: t, endAt: t + step * 60000, free: !taken.has(t) && t > now() + 15 * 60000 });
  }
  return out;
}

function apptDto(a, viewer) {
  const out = { id: a.id, startAt: a.start_at, endAt: a.end_at, status: a.status, reason: a.reason, segments: json(a.segments, []), price: a.price, doctorNote: a.doctor_note, cancelledBy: a.cancelled_by, createdAt: a.created_at };
  if (viewer !== 'doctor') {
    const d = one('SELECT d.*, u.full_name, s.name AS specialty FROM doctor_profiles d JOIN users u ON u.id = d.user_id JOIN specialties s ON s.id = d.specialty_id WHERE d.user_id = ?', a.doctor_id);
    out.doctor = d ? { id: d.user_id, fullName: d.full_name, specialty: d.specialty, clinicName: d.clinic_name, clinicAddress: d.clinic_address, clinicLat: d.clinic_lat, clinicLng: d.clinic_lng, photo: photoV(d.user_id) } : null;
    const rv = one('SELECT rating, comment FROM reviews WHERE appointment_id = ?', a.id);
    out.review = rv ? { rating: rv.rating, comment: rv.comment } : null;
  }
  if (viewer !== 'patient') {
    const p = one('SELECT u.full_name, u.phone, pp.birth_year, pp.gender, pp.allergies, pp.chronic_diseases FROM users u LEFT JOIN patient_profiles pp ON pp.user_id = u.id WHERE u.id = ?', a.patient_id);
    out.patient = p ? { id: a.patient_id, fullName: p.full_name, phone: p.phone, age: ageFrom(p.birth_year), gender: p.gender, allergies: p.allergies, chronic: p.chronic_diseases, photo: photoV(a.patient_id) } : null;
  }
  return out;
}

function workHoursInput(w) {
  if (!w || typeof w !== 'object') throw bad('Ish vaqti noto‘g‘ri');
  const out = {};
  for (let d = 0; d < 7; d++) {
    const x = w[d] || w[String(d)] || {};
    const on = !!x.on, start = String(x.start || '09:00'), end = String(x.end || '17:00');
    if (toMin(start) == null || toMin(end) == null) throw bad('Vaqtni SS:DD shaklida kiriting');
    if (on && toMin(end) - toMin(start) < 30) throw bad('Ish kuni kamida 30 daqiqa bo‘lsin');
    out[d] = { on, start, end };
  }
  return out;
}

export default function doctorRoutes(r) {
  /* ---------------- public directory ---------------- */
  r.get('/doctors', (ctx) => {
    const spec = ctx.query.get('specialty');
    const q = String(ctx.query.get('q') || '').trim().toLowerCase();
    let rows = all(DOCTOR_PUBLIC_SQL).map(doctorPublic);
    if (spec) rows = rows.filter((d) => d.specialty === spec || String(d.specialtyId) === spec);
    if (q) rows = rows.filter((d) => (d.fullName + ' ' + d.specialty + ' ' + d.clinicName + ' ' + d.clinicAddress).toLowerCase().includes(q));
    // Recommendation score: rating (with a prior so 1 review ≠ 5 stars), experience, availability.
    const presenceW = { ONLINE: 0.6, AT_WORK: 0.3, OFFLINE: 0 };
    for (const d of rows) d.score = Math.round((((d.rating || 0) * d.reviews + 4 * 3) / (d.reviews + 3) + Math.min(d.experienceYears, 30) / 15 + presenceW[d.presence]) * 100) / 100;
    const sort = ctx.query.get('sort');
    rows.sort(sort === 'price' ? (a, b) => (a.priceOnline || 0) - (b.priceOnline || 0) : sort === 'experience' ? (a, b) => b.experienceYears - a.experienceYears : (a, b) => b.score - a.score);
    if (rows.length && sort !== 'price' && sort !== 'experience') rows[0].recommended = true;
    return rows;
  });

  r.get('/doctors/:id', (ctx) => {
    const row = one(DOCTOR_PUBLIC_SQL + ' AND d.user_id = ?', Number(ctx.params.id));
    if (!row) throw notFound('Shifokor topilmadi');
    const d = doctorPublic(row);
    d.reviewList = all('SELECT r.rating, r.comment, r.created_at AS createdAt, u.full_name FROM reviews r JOIN users u ON u.id = r.patient_id WHERE r.doctor_id = ? AND r.is_hidden = 0 ORDER BY r.id DESC LIMIT 20', d.id)
      .map((x) => ({ rating: x.rating, comment: x.comment, createdAt: x.createdAt, author: x.full_name.split(/\s+/).map((w, i) => (i === 0 ? w : w[0] + '.')).join(' ') }));
    d.distribution = [1, 2, 3, 4, 5].map((n) => one('SELECT COUNT(*) AS n FROM reviews WHERE doctor_id = ? AND rating = ? AND is_hidden = 0', d.id, n).n);
    return d;
  });

  r.get('/doctors/:id/slots', (ctx) => {
    const row = one(DOCTOR_PUBLIC_SQL + ' AND d.user_id = ?', Number(ctx.params.id));
    if (!row) throw notFound('Shifokor topilmadi');
    const from = parseDate(ctx.query.get('from')) || new Date(dayStart(now()));
    const days = Math.min(14, Math.max(1, Number(ctx.query.get('days')) || 7));
    const out = [];
    for (let i = 0; i < days; i++) { const day = new Date(from); day.setDate(day.getDate() + i); out.push({ date: dayKey(day.getTime()), weekday: day.getDay(), slots: slotsFor(row, day) }); }
    return out;
  });

  /* ---------------- doctor: own profile, presence, schedule ---------------- */
  r.put('/doctor/profile', { auth: ['DOCTOR'] }, (ctx) => {
    const b = ctx.body;
    const cur = one('SELECT * FROM doctor_profiles WHERE user_id = ?', ctx.user.id);
    if (!cur) throw notFound('Shifokor profili topilmadi');
    const fullName = str(b.fullName, { min: 3, max: 120, field: 'F.I.Sh.', required: true });
    const spec = one('SELECT id FROM specialties WHERE id = ?', Number(b.specialtyId));
    if (!spec) throw bad('Mutaxassislikni tanlang');
    const license = str(b.licenseNumber, { min: 4, max: 40, field: 'Litsenziya raqami', required: true }).toUpperCase();
    if (!/^[A-Z0-9-]{4,40}$/.test(license)) throw bad('Litsenziya raqamida faqat harf, raqam va “-” bo‘lsin');
    if (one('SELECT user_id FROM doctor_profiles WHERE license_number = ? AND user_id != ?', license, ctx.user.id)) throw conflict('Bu litsenziya raqami boshqa shifokorda ro‘yxatda');
    const exp = intIn(b.experienceYears || 0, 0, 70, 'Tajriba');
    const price = (v, f) => { const n = Number(v || 0); if (!Number.isInteger(n) || n < 0 || n > 100000000) throw bad(f + ' 0 dan katta butun son bo‘lsin (so‘m)'); return n; };
    const coord = (v, lo, hi) => (v === null || v === undefined || v === '' ? null : (Number(v) >= lo && Number(v) <= hi ? Number(v) : (() => { throw bad('Koordinata noto‘g‘ri'); })()));
    const fields = {
      clinicName: str(b.clinicName, { max: 160, field: 'Klinika nomi' }), clinicAddress: str(b.clinicAddress, { max: 300, field: 'Manzil' }),
      lat: coord(b.clinicLat, -90, 90), lng: coord(b.clinicLng, -180, 180),
      priceOnline: price(b.priceOnline, 'Onlayn maslahat narxi'), priceVisit: price(b.priceVisit, 'Qabul narxi'), bio: str(b.bio, { max: 1500, field: 'O‘zim haqimda' })
    };
    // Changing the licence or specialty sends the profile back to verification: patients must only see checked credentials.
    const reverify = license !== cur.license_number || spec.id !== cur.specialty_id;
    tx(() => {
      run('UPDATE users SET full_name = ?, updated_at = ? WHERE id = ?', fullName, now(), ctx.user.id);
      run(`UPDATE doctor_profiles SET specialty_id = ?, license_number = ?, experience_years = ?, clinic_name = ?, clinic_address = ?, clinic_lat = ?, clinic_lng = ?, price_online = ?, price_visit = ?, bio = ?
        ${reverify ? ", verification_status = 'PENDING', verified_at = NULL, note = 'Litsenziya yoki mutaxassislik o‘zgardi'" : ''} WHERE user_id = ?`,
        spec.id, license, exp, fields.clinicName, fields.clinicAddress, fields.lat, fields.lng, fields.priceOnline, fields.priceVisit, fields.bio, ctx.user.id);
    });
    if (reverify && cur.verification_status === 'VERIFIED') notifyAdmins('VERIFICATION', 'Shifokor ' + fullName + ' litsenziya/mutaxassislikni o‘zgartirdi — qayta tekshiring', '#/admin/doctors');
    audit(ctx, 'DOCTOR_PROFILE_UPDATE', 'user', ctx.user.id, reverify ? 'reverify' : '');
    return { user: userDto(ctx.user.id), reverify };
  });

  r.put('/doctor/presence', { auth: ['DOCTOR'] }, (ctx) => {
    const p = ctx.body.presence;
    if (!['ONLINE', 'AT_WORK', 'OFFLINE'].includes(p)) throw bad('Holat noto‘g‘ri');
    run('UPDATE doctor_profiles SET presence = ?, presence_at = ? WHERE user_id = ?', p, now(), ctx.user.id);
    return userDto(ctx.user.id);
  });

  r.put('/doctor/schedule', { auth: ['DOCTOR'] }, (ctx) => {
    const wh = workHoursInput(ctx.body.workHours);
    const slot = Number(ctx.body.slotMinutes);
    if (!SLOT_SIZES.includes(slot)) throw bad('Qabul davomiyligi: ' + SLOT_SIZES.join(', ') + ' daqiqa');
    run('UPDATE doctor_profiles SET work_hours = ?, slot_minutes = ? WHERE user_id = ?', JSON.stringify(wh), slot, ctx.user.id);
    audit(ctx, 'DOCTOR_SCHEDULE_UPDATE', 'user', ctx.user.id);
    return userDto(ctx.user.id);
  });

  /* ---------------- appointments (offline visits) ---------------- */
  r.post('/appointments', { auth: ['PATIENT'], status: 201 }, (ctx) => {
    if (!rateLimit('appt:' + ctx.user.id, 10, 3600000)) throw new HttpError(429, 'Juda ko‘p urinish. Birozdan keyin qayta urinib ko‘ring');
    const b = ctx.body;
    const row = one(DOCTOR_PUBLIC_SQL + ' AND d.user_id = ?', Number(b.doctorId));
    if (!row) throw notFound('Shifokor topilmadi');
    const startAt = Number(b.startAt);
    if (!Number.isFinite(startAt) || startAt > now() + 31 * DAY) throw bad('Sana noto‘g‘ri yoki juda uzoq (30 kungacha)');
    const slot = slotsFor(row, new Date(dayStart(startAt))).find((s) => s.startAt === startAt);
    if (!slot) throw bad('Bu vaqt shifokorning ish vaqtiga to‘g‘ri kelmaydi');
    if (!slot.free) throw conflict('Bu vaqt band yoki o‘tib ketgan. Boshqa vaqtni tanlang');
    if (one(`SELECT COUNT(*) AS n FROM appointments WHERE patient_id = ? AND status IN ('BOOKED','ARRIVED','IN_PROGRESS') AND start_at > ?`, ctx.user.id, now()).n >= 5) throw bad('Bir vaqtda ko‘pi bilan 5 ta faol yozilish mumkin');
    if (one(`SELECT id FROM appointments WHERE patient_id = ? AND start_at = ? AND status IN ('BOOKED','ARRIVED','IN_PROGRESS')`, ctx.user.id, startAt)) throw conflict('Shu vaqtga boshqa shifokorga yozilgansiz');
    const segments = (Array.isArray(b.segments) ? b.segments : []).filter((c) => SEGMENT_CODES.includes(c)).slice(0, 20);
    const reason = str(b.reason, { max: 500, field: 'Sabab' });
    let id;
    try {
      id = insert('INSERT INTO appointments (patient_id, doctor_id, start_at, end_at, reason, segments, price, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
        ctx.user.id, row.user_id, slot.startAt, slot.endAt, reason, JSON.stringify(segments), row.price_visit, now(), now());
    } catch (e) { if (/UNIQUE/.test(e.message)) throw conflict('Bu vaqtni hozirgina boshqa bemor band qildi'); throw e; }
    const when = new Date(slot.startAt).toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    notify(row.user_id, 'APPOINTMENT', 'Yangi qabulga yozilish: ' + when + (segments.length ? ' · ' + segments.map((c) => SEGMENT_NAMES[c]).join(', ') : ''), '#/doctor/visits');
    audit(ctx, 'APPOINTMENT_BOOK', 'appointment', id, String(row.user_id));
    return apptDto(one('SELECT * FROM appointments WHERE id = ?', id), 'patient');
  });

  r.get('/appointments/my', { auth: ['PATIENT'] }, (ctx) =>
    all('SELECT * FROM appointments WHERE patient_id = ? ORDER BY start_at DESC LIMIT 100', ctx.user.id).map((a) => apptDto(a, 'patient')));

  r.post('/appointments/:id/cancel', { auth: ['PATIENT'] }, (ctx) => {
    const a = one('SELECT * FROM appointments WHERE id = ?', Number(ctx.params.id));
    if (!a) throw notFound('Yozilish topilmadi');
    if (a.patient_id !== ctx.user.id) throw forbidden();
    if (a.status !== 'BOOKED') throw bad('Faqat kutilayotgan yozilishni bekor qilish mumkin');
    run("UPDATE appointments SET status = 'CANCELLED', cancelled_by = 'PATIENT', updated_at = ? WHERE id = ?", now(), a.id);
    notify(a.doctor_id, 'APPOINTMENT', 'Bemor qabulni bekor qildi: ' + new Date(a.start_at).toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }), '#/doctor/visits');
    audit(ctx, 'APPOINTMENT_CANCEL', 'appointment', a.id, 'patient');
    return apptDto(one('SELECT * FROM appointments WHERE id = ?', a.id), 'patient');
  });

  r.get('/doctor/appointments', { auth: ['DOCTOR'] }, (ctx) => {
    requireVerifiedDoctor(ctx);
    const day = parseDate(ctx.query.get('date')) || new Date(dayStart(now()));
    const base = day.getTime();
    const rows = all('SELECT * FROM appointments WHERE doctor_id = ? AND start_at >= ? AND start_at < ? ORDER BY start_at', ctx.user.id, base, base + DAY);
    let n = 0;
    const items = rows.map((a) => ({ ...apptDto(a, 'doctor'), queueNo: a.status === 'CANCELLED' ? null : ++n }));
    const upcoming = all(`SELECT start_at FROM appointments WHERE doctor_id = ? AND start_at >= ? AND start_at < ? AND status IN ('BOOKED','ARRIVED')`, ctx.user.id, dayStart(now()), dayStart(now()) + 14 * DAY)
      .reduce((m, a) => { const k = dayKey(a.start_at); m[k] = (m[k] || 0) + 1; return m; }, {});
    return { date: dayKey(base), items, upcoming };
  });

  r.patch('/doctor/appointments/:id', { auth: ['DOCTOR'] }, (ctx) => {
    requireVerifiedDoctor(ctx);
    const a = one('SELECT * FROM appointments WHERE id = ?', Number(ctx.params.id));
    if (!a) throw notFound('Yozilish topilmadi');
    if (a.doctor_id !== ctx.user.id) throw forbidden();
    const note = ctx.body.note === undefined ? a.doctor_note : str(ctx.body.note, { max: 2000, field: 'Izoh' });
    let status = a.status;
    if (ctx.body.status && ctx.body.status !== a.status) {
      const allowed = { BOOKED: ['ARRIVED', 'IN_PROGRESS', 'NO_SHOW', 'CANCELLED'], ARRIVED: ['IN_PROGRESS', 'NO_SHOW', 'CANCELLED'], IN_PROGRESS: ['DONE'], DONE: [], NO_SHOW: ['ARRIVED'], CANCELLED: [] };
      if (!(allowed[a.status] || []).includes(ctx.body.status)) throw bad('Bu holatga o‘tkazib bo‘lmaydi');
      status = ctx.body.status;
    }
    run('UPDATE appointments SET status = ?, doctor_note = ?, cancelled_by = ?, updated_at = ? WHERE id = ?', status, note, status === 'CANCELLED' ? 'DOCTOR' : a.cancelled_by, now(), a.id);
    if (status !== a.status) {
      const msg = { IN_PROGRESS: 'Shifokor sizni kutmoqda — kabinetga kiring', DONE: 'Qabul yakunlandi. Shifokorni baholashingiz mumkin', CANCELLED: 'Shifokor qabulni bekor qildi' + (ctx.body.reason ? ': ' + str(ctx.body.reason, { max: 200 }) : ''), NO_SHOW: 'Qabulga kelmaganingiz qayd etildi' }[status];
      if (msg) notify(a.patient_id, 'APPOINTMENT', msg, '#/app/visits');
      audit(ctx, 'APPOINTMENT_' + status, 'appointment', a.id);
    }
    return apptDto(one('SELECT * FROM appointments WHERE id = ?', a.id), 'doctor');
  });

  /* ---------------- doctor statistics + report ---------------- */
  r.get('/doctor/stats', { auth: ['DOCTOR'] }, (ctx) => {
    const d = requireVerifiedDoctor(ctx);
    const me = ctx.user.id;
    const days = [7, 30, 90].includes(Number(ctx.query.get('days'))) ? Number(ctx.query.get('days')) : 30;
    const since = dayStart(now()) - (days - 1) * DAY;
    const today = dayStart(now());
    const dx = all('SELECT created_at FROM diagnoses WHERE doctor_id = ? AND created_at >= ?', me, since);
    const visits = all("SELECT start_at, status, price FROM appointments WHERE doctor_id = ? AND start_at >= ? AND start_at < ?", me, since, today + DAY);
    const daily = [];
    for (let i = 0; i < days; i++) {
      const s = since + i * DAY, e = s + DAY;
      daily.push({ d: dayKey(s), online: dx.filter((x) => x.created_at >= s && x.created_at < e).length, visits: visits.filter((x) => x.status === 'DONE' && x.start_at >= s && x.start_at < e).length });
    }
    const sev = Object.fromEntries(all('SELECT c.severity AS k, COUNT(*) AS n FROM consultations c JOIN diagnoses x ON x.consultation_id = c.id WHERE x.doctor_id = ? AND x.created_at >= ? GROUP BY c.severity', me, since).map((x) => [x.k, x.n]));
    const rating = ratingOf(me);
    const resp = one(`SELECT AVG(a.created_at - c.created_at) AS ms FROM audit_logs a JOIN consultations c ON c.id = a.entity_id
      WHERE a.action = 'CONSULTATION_ASSIGN' AND a.user_id = ? AND a.created_at >= ?`, me, since).ms;
    const worrying = all(`SELECT c.*, (SELECT MAX(pain_level) FROM consultation_segments s WHERE s.consultation_id = c.id) AS max_pain FROM consultations c
      WHERE c.is_deleted = 0 AND c.status IN ('NEW','AI_DRAFTED','ASSIGNED') AND c.severity IN ('RED','YELLOW')
        AND (c.doctor_id = ? OR (c.doctor_id IS NULL AND (c.requested_doctor_id = ? OR c.severity = 'RED' OR (c.requested_doctor_id IS NULL AND (c.specialty_id = ? OR ? = 'Terapevt')))))
      ORDER BY CASE c.severity WHEN 'RED' THEN 0 ELSE 1 END, c.created_at LIMIT 8`, me, me, d.specialtyId, d.specialty)
      .map((c) => { const s = json(c.patient_snapshot, {}); return { id: c.id, severity: c.severity, status: c.status, createdAt: c.created_at, mine: c.doctor_id === me, maxPain: c.max_pain, patient: { fullName: s.fullName, age: s.age, gender: s.gender, photo: photoV(c.patient_id) }, segments: all('SELECT segment_code AS code, pain_level AS pain FROM consultation_segments WHERE consultation_id = ? ORDER BY pain_level DESC LIMIT 3', c.id) }; });
    const waiting = one(`SELECT COUNT(*) AS n FROM consultations c WHERE c.is_deleted = 0 AND c.status IN ('NEW','AI_DRAFTED') AND c.doctor_id IS NULL
      AND (c.requested_doctor_id = ? OR c.severity = 'RED' OR (c.requested_doctor_id IS NULL AND (c.specialty_id = ? OR ? = 'Terapevt')))`, me, d.specialtyId, d.specialty).n;
    const todayVisits = all("SELECT status FROM appointments WHERE doctor_id = ? AND start_at >= ? AND start_at < ? AND status != 'CANCELLED'", me, today, today + DAY);
    const prof = one('SELECT price_online FROM doctor_profiles WHERE user_id = ?', me);
    return {
      days, daily, bySeverity: sev,
      totals: {
        online: dx.length, visitsDone: visits.filter((x) => x.status === 'DONE').length, noShow: visits.filter((x) => x.status === 'NO_SHOW').length,
        income: dx.length * (prof.price_online || 0) + visits.filter((x) => x.status === 'DONE').reduce((a, x) => a + (x.price || 0), 0),
        avgResponseMin: resp ? Math.round(resp / 60000) : null, mineActive: one("SELECT COUNT(*) AS n FROM consultations WHERE doctor_id = ? AND status = 'ASSIGNED'", me).n
      },
      today: { waiting, visits: todayVisits.length, visitsLeft: todayVisits.filter((x) => ['BOOKED', 'ARRIVED', 'IN_PROGRESS'].includes(x.status)).length, done: todayVisits.filter((x) => x.status === 'DONE').length, diagnoses: dx.filter((x) => x.created_at >= today).length },
      rating: { ...rating, distribution: [1, 2, 3, 4, 5].map((n) => one('SELECT COUNT(*) AS n FROM reviews WHERE doctor_id = ? AND rating = ? AND is_hidden = 0', me, n).n) },
      recentReviews: all('SELECT r.rating, r.comment, r.created_at AS createdAt, u.full_name AS author FROM reviews r JOIN users u ON u.id = r.patient_id WHERE r.doctor_id = ? AND r.is_hidden = 0 ORDER BY r.id DESC LIMIT 5', me),
      topDiagnoses: all('SELECT icd10_code AS code, title, COUNT(*) AS n FROM diagnoses WHERE doctor_id = ? AND created_at >= ? GROUP BY icd10_code ORDER BY n DESC LIMIT 5', me, since),
      worrying
    };
  });

  r.get('/doctor/report', { auth: ['DOCTOR'] }, (ctx) => {
    requireVerifiedDoctor(ctx);
    const from = parseDate(ctx.query.get('from')), to = parseDate(ctx.query.get('to'));
    if (!from || !to || to < from) throw bad('Davrni to‘g‘ri tanlang');
    if (to - from > 370 * DAY) throw bad('Hisobot davri ko‘pi bilan 1 yil');
    const a = from.getTime(), b = to.getTime() + DAY, me = ctx.user.id;
    const consultations = all(`SELECT x.created_at, x.icd10_code, x.title, c.severity, c.patient_snapshot, (SELECT number FROM prescriptions p WHERE p.diagnosis_id = x.id ORDER BY p.id DESC LIMIT 1) AS rx
      FROM diagnoses x JOIN consultations c ON c.id = x.consultation_id WHERE x.doctor_id = ? AND x.created_at >= ? AND x.created_at < ? ORDER BY x.created_at`, me, a, b)
      .map((x) => { const s = json(x.patient_snapshot, {}); return { date: x.created_at, patient: s.fullName, age: s.age, gender: s.gender, icd10: x.icd10_code, title: x.title, severity: x.severity, rx: x.rx || '' }; });
    const appointments = all(`SELECT a.start_at, a.status, a.price, a.reason, u.full_name FROM appointments a JOIN users u ON u.id = a.patient_id WHERE a.doctor_id = ? AND a.start_at >= ? AND a.start_at < ? ORDER BY a.start_at`, me, a, b)
      .map((x) => ({ date: x.start_at, patient: x.full_name, status: x.status, price: x.price, reason: x.reason }));
    const rv = one('SELECT COUNT(*) AS n, AVG(rating) AS avg FROM reviews WHERE doctor_id = ? AND created_at >= ? AND created_at < ?', me, a, b);
    const prof = doctorProfile(me);
    audit(ctx, 'DOCTOR_REPORT', 'user', me, dayKey(a) + '..' + dayKey(b - DAY));
    return {
      doctor: { fullName: ctx.user.full_name, specialty: prof.specialty, licenseNumber: prof.licenseNumber, clinicName: prof.clinicName },
      from: dayKey(a), to: dayKey(b - DAY), consultations, appointments,
      totals: {
        consultations: consultations.length, prescriptions: consultations.filter((x) => x.rx).length, visitsDone: appointments.filter((x) => x.status === 'DONE').length,
        noShow: appointments.filter((x) => x.status === 'NO_SHOW').length, cancelled: appointments.filter((x) => x.status === 'CANCELLED').length,
        income: consultations.length * (prof.priceOnline || 0) + appointments.filter((x) => x.status === 'DONE').reduce((s, x) => s + (x.price || 0), 0),
        reviews: rv.n, rating: rv.n ? Math.round(rv.avg * 10) / 10 : null
      }
    };
  });
}

export { ACTIVE_APPT };
