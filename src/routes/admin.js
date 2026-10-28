import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { one, all, run, insert, now, json, medicineRow } from '../db.js';
import { bad, notFound, conflict, str, intIn } from '../http.js';
import { audit, notify, sendSms } from '../auth.js';
import { medicinesAll } from '../dto.js';
import { aiAvailable } from '../ai.js';
import { detectFile } from './files.js';
import { ICD10, SPECIALTIES } from '../../public/shared/clinical.js';

const DAY = 86400000;
const dayStart = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const dayKey = (t) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const parseDate = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null; };
const count = (sql, ...p) => one(sql, ...p).n;
const group = (sql, ...p) => Object.fromEntries(all(sql, ...p).map((x) => [x.k, x.n]));
const dailySeries = (sql, since, days, ...p) => {
  const m = new Map(all(sql, since, ...p).map((x) => [x.d, x.n]));
  return Array.from({ length: days }, (_, i) => { const k = dayKey(since + i * DAY); return { d: k, n: m.get(k) || 0 }; });
};
const DAY_SQL = (table, col, extra = '') => `SELECT strftime('%Y-%m-%d', ${col} / 1000, 'unixepoch', 'localtime') AS d, COUNT(*) AS n FROM ${table} WHERE ${col} >= ? ${extra} GROUP BY d`;

/** Things an administrator should look at today. Each rule is cheap SQL over existing tables. */
function anomalies() {
  const out = [];
  const t = now();
  const redWaiting = count("SELECT COUNT(*) AS n FROM consultations WHERE severity = 'RED' AND doctor_id IS NULL AND status IN ('NEW','AI_DRAFTED') AND created_at < ?", t - 15 * 60000);
  if (redWaiting) out.push({ level: 'high', title: redWaiting + ' ta shoshilinch murojaat 15 daqiqadan beri olinmagan', detail: 'Navbatdagi shifokorlar bilan bog‘laning', link: '#/admin/doctors' });
  const doctorsComplaints = all("SELECT about_doctor_id AS id, u.full_name, COUNT(*) AS n FROM tickets t JOIN users u ON u.id = t.about_doctor_id WHERE kind = 'COMPLAINT' AND t.created_at > ? GROUP BY about_doctor_id HAVING n >= 3", t - 30 * DAY);
  for (const d of doctorsComplaints) out.push({ level: 'high', title: 'Dr. ' + d.full_name + ' ustidan 30 kunda ' + d.n + ' ta shikoyat', detail: 'Shikoyatlarni ko‘rib chiqing', link: '#/admin/tickets' });
  const stale = count("SELECT COUNT(*) AS n FROM consultations WHERE doctor_id IS NULL AND status IN ('NEW','AI_DRAFTED') AND created_at < ?", t - DAY);
  if (stale) out.push({ level: 'medium', title: stale + ' ta murojaat 24 soatdan ortiq javobsiz', detail: 'Shifokorlar yetishmayapti yoki mutaxassislik bo‘yicha navbat to‘lgan', link: '#/admin' });
  const today = count('SELECT COUNT(*) AS n FROM consultations WHERE created_at >= ?', dayStart(t));
  const prevAvg = count('SELECT COUNT(*) AS n FROM consultations WHERE created_at >= ? AND created_at < ?', dayStart(t) - 14 * DAY, dayStart(t)) / 14;
  if (today >= 5 && today > prevAvg * 2) out.push({ level: 'medium', title: 'Bugun murojaatlar keskin oshdi: ' + today + ' ta (o‘rtacha ' + prevAvg.toFixed(1) + ')', detail: 'Epidemiya yoki tizim xatosi bo‘lishi mumkin', link: '#/admin' });
  const failed = count("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'LOGIN_FAILED' AND created_at > ?", t - DAY);
  if (failed > 30) out.push({ level: 'medium', title: '24 soatda ' + failed + ' ta muvaffaqiyatsiz kirish urinishi', detail: 'Parol tanlash hujumi bo‘lishi mumkin — audit jurnalida IP manzillarni tekshiring', link: '#/admin/audit' });
  for (const d of all('SELECT r.doctor_id, u.full_name, AVG(r.rating) AS avg, COUNT(*) AS n FROM reviews r JOIN users u ON u.id = r.doctor_id WHERE r.is_hidden = 0 GROUP BY r.doctor_id HAVING n >= 3 AND avg < 3'))
    out.push({ level: 'medium', title: 'Dr. ' + d.full_name + ' o‘rtacha bahosi past: ' + (Math.round(d.avg * 10) / 10) + ' (' + d.n + ' ta baho)', detail: 'Bemorlar noroziligi sababini o‘rganing', link: '#/admin/reviews' });
  for (const p of all("SELECT entity_id, COUNT(*) AS n FROM audit_logs WHERE action = 'PRESCRIPTION_VERIFY' AND entity_id IS NOT NULL AND created_at > ? GROUP BY entity_id HAVING n > 5", t - DAY)) {
    const rx = one('SELECT number FROM prescriptions WHERE id = ?', p.entity_id);
    out.push({ level: 'medium', title: 'Retsept ' + (rx ? rx.number : '#' + p.entity_id) + ' sutkada ' + p.n + ' marta tekshirildi', detail: 'Bir retsept bilan bir necha dorixonaga borilgan bo‘lishi mumkin', link: '#/admin/audit' });
  }
  const oldComplaints = count("SELECT COUNT(*) AS n FROM tickets WHERE status = 'OPEN' AND created_at < ?", t - 2 * DAY);
  if (oldComplaints) out.push({ level: 'medium', title: oldComplaints + ' ta murojaat/shikoyat 48 soatdan beri javobsiz', detail: 'Texnik yordam bo‘limida javob bering', link: '#/admin/tickets' });
  const ai = one("SELECT SUM(review_status = 'REJECTED') AS rej, SUM(review_status IN ('APPROVED','MODIFIED','REJECTED')) AS tot FROM ai_suggestions WHERE created_at > ?", t - 30 * DAY);
  if (ai.tot >= 5 && ai.rej / ai.tot > 0.5) out.push({ level: 'low', title: 'AI qoralamalarining ' + Math.round(100 * ai.rej / ai.tot) + '% i rad etilmoqda', detail: 'Dorilar ro‘yxati yoki AI sozlamalarini qayta ko‘rib chiqing', link: '#/admin/medicines' });
  const pendingOld = count("SELECT COUNT(*) AS n FROM doctor_profiles d JOIN users u ON u.id = d.user_id WHERE d.verification_status = 'PENDING' AND u.created_at < ?", t - 3 * DAY);
  if (pendingOld) out.push({ level: 'low', title: pendingOld + ' ta shifokor 3 kundan beri tasdiq kutmoqda', detail: 'Litsenziyalarni tekshiring', link: '#/admin/doctors' });
  const noShow = one("SELECT SUM(status = 'NO_SHOW') AS ns, COUNT(*) AS n FROM appointments WHERE start_at > ? AND start_at < ? AND status IN ('DONE','NO_SHOW')", t - 30 * DAY, t);
  if (noShow.n >= 10 && noShow.ns / noShow.n > 0.3) out.push({ level: 'low', title: 'Qabulga kelmaslik darajasi yuqori: ' + Math.round(100 * noShow.ns / noShow.n) + '%', detail: 'Bemorlarga eslatma SMS yuborishni ko‘rib chiqing', link: '#/admin' });
  return out;
}

function medicineInput(b) {
  const list = (v, f) => (Array.isArray(v) ? v : String(v || '').split(',')).map((x) => String(x).trim().toLowerCase().slice(0, 60)).filter(Boolean).slice(0, 20);
  const text = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map((x) => String(x).trim().slice(0, 120)).filter(Boolean).slice(0, 12);
  const num = (v, f, lo, hi) => { if (v === null || v === undefined || v === '') return null; const n = Number(v); if (!(n >= lo && n <= hi)) throw bad(f + ' ' + lo + '–' + hi + ' oralig‘ida bo‘lsin'); return n; };
  const mg = num(b.mg, 'Bir dona dozasi (mg)', 0.01, 5000);
  return {
    name: str(b.name, { min: 2, max: 120, field: 'Dori nomi', required: true }),
    form: str(b.form, { min: 2, max: 40, field: 'Shakli', required: true }),
    strength: str(b.strength, { min: 1, max: 40, field: 'Kuchi', required: true }),
    mg, unitDose: mg ? null : str(b.unitDose, { max: 80, field: 'Bir martalik miqdor' }) || null,
    std: str(b.std, { min: 3, max: 200, field: 'Standart doza', required: true }),
    maxDaily: num(b.maxDaily, 'Maksimal sutkalik doza (mg)', 0.01, 20000),
    minAge: intIn(b.minAge == null || b.minAge === '' ? 0 : b.minAge, 0, 100, 'Minimal yosh'),
    preg: !!b.preg, contraKeys: list(b.contraKeys), allergyKeys: list(b.allergyKeys), se: text(b.se), ci: text(b.ci), ai: !!b.ai
  };
}

export default function adminRoutes(r) {
  r.get('/health', () => ({ ok: true, time: new Date().toISOString() }));

  r.get('/catalog', () => ({
    specialties: all('SELECT id, name FROM specialties ORDER BY name'),
    medicines: medicinesAll().filter((m) => m.active),
    icd10: ICD10.map(([code, title]) => ({ code, title })),
    features: { ai: aiAvailable(), devOtp: config.showDevOtp, sms: config.sms.provider }
  }));

  r.get('/admin/stats', { auth: ['ADMIN'] }, () => {
    const t = now();
    const since14 = dayStart(t) - 13 * DAY, since30 = dayStart(t) - 29 * DAY;
    const rv = one('SELECT COUNT(*) AS n, AVG(rating) AS avg FROM reviews WHERE is_hidden = 0');
    const feedback = all("SELECT u.role AS role, COUNT(*) AS n, AVG(t.rating) AS avg FROM tickets t JOIN users u ON u.id = t.user_id WHERE t.kind = 'FEEDBACK' AND t.rating IS NOT NULL GROUP BY u.role");
    return {
      totals: {
        patients: count("SELECT COUNT(*) AS n FROM users WHERE role = 'PATIENT'"),
        doctors: count("SELECT COUNT(*) AS n FROM doctor_profiles WHERE verification_status = 'VERIFIED'"),
        pendingDoctors: count("SELECT COUNT(*) AS n FROM doctor_profiles WHERE verification_status = 'PENDING'"),
        onlineDoctors: count("SELECT COUNT(*) AS n FROM doctor_profiles WHERE verification_status = 'VERIFIED' AND presence != 'OFFLINE' AND presence_at > ?", t - 16 * 3600000),
        consultations: count('SELECT COUNT(*) AS n FROM consultations'),
        open: count("SELECT COUNT(*) AS n FROM consultations WHERE status IN ('NEW','AI_DRAFTED','ASSIGNED')"),
        prescriptions: count('SELECT COUNT(*) AS n FROM prescriptions'),
        dispensed: count('SELECT COUNT(*) AS n FROM prescriptions WHERE dispensed_at IS NOT NULL'),
        appointments: count('SELECT COUNT(*) AS n FROM appointments'),
        appointmentsToday: count("SELECT COUNT(*) AS n FROM appointments WHERE start_at >= ? AND start_at < ? AND status != 'CANCELLED'", dayStart(t), dayStart(t) + DAY),
        openTickets: count("SELECT COUNT(*) AS n FROM tickets WHERE status = 'OPEN'"),
        complaints30: count("SELECT COUNT(*) AS n FROM tickets WHERE kind = 'COMPLAINT' AND created_at > ?", t - 30 * DAY)
      },
      bySeverity: group('SELECT severity AS k, COUNT(*) AS n FROM consultations GROUP BY severity'),
      byStatus: group('SELECT status AS k, COUNT(*) AS n FROM consultations GROUP BY status'),
      bySpecialty: group('SELECT s.name AS k, COUNT(*) AS n FROM consultations c JOIN specialties s ON s.id = c.specialty_id GROUP BY s.name'),
      apptByStatus: group('SELECT status AS k, COUNT(*) AS n FROM appointments GROUP BY status'),
      ai: group('SELECT review_status AS k, COUNT(*) AS n FROM ai_suggestions GROUP BY review_status'),
      aiSource: group('SELECT source AS k, COUNT(*) AS n FROM ai_suggestions GROUP BY source'),
      tickets: { byKind: group('SELECT kind AS k, COUNT(*) AS n FROM tickets GROUP BY kind'), byStatus: group('SELECT status AS k, COUNT(*) AS n FROM tickets GROUP BY status') },
      satisfaction: {
        doctorRating: rv.n ? Math.round(rv.avg * 10) / 10 : null, reviews: rv.n,
        distribution: [1, 2, 3, 4, 5].map((n) => count('SELECT COUNT(*) AS n FROM reviews WHERE rating = ? AND is_hidden = 0', n)),
        appByRole: Object.fromEntries(feedback.map((f) => [f.role, { n: f.n, avg: Math.round(f.avg * 10) / 10 }])),
        complaints: count("SELECT COUNT(*) AS n FROM tickets WHERE kind = 'COMPLAINT'")
      },
      daily: dailySeries(DAY_SQL('consultations', 'created_at'), since14, 14),
      daily30: {
        consultations: dailySeries(DAY_SQL('consultations', 'created_at'), since30, 30),
        appointments: dailySeries(DAY_SQL('appointments', 'start_at', "AND status != 'CANCELLED'"), since30, 30),
        patients: dailySeries(DAY_SQL('users', 'created_at', "AND role = 'PATIENT'"), since30, 30),
        doctors: dailySeries(DAY_SQL('users', 'created_at', "AND role = 'DOCTOR'"), since30, 30)
      },
      topDoctors: all(`SELECT u.id, u.full_name AS fullName, s.name AS specialty, d.presence, d.presence_at,
          (SELECT COUNT(*) FROM diagnoses x WHERE x.doctor_id = u.id) AS diagnoses,
          (SELECT COUNT(*) FROM appointments a WHERE a.doctor_id = u.id AND a.status = 'DONE') AS visits,
          (SELECT ROUND(AVG(rating), 1) FROM reviews r WHERE r.doctor_id = u.id AND r.is_hidden = 0) AS rating,
          (SELECT COUNT(*) FROM reviews r WHERE r.doctor_id = u.id AND r.is_hidden = 0) AS reviews,
          (SELECT COUNT(*) FROM tickets k WHERE k.about_doctor_id = u.id AND k.kind = 'COMPLAINT') AS complaints
        FROM users u JOIN doctor_profiles d ON d.user_id = u.id JOIN specialties s ON s.id = d.specialty_id WHERE d.verification_status = 'VERIFIED'
        ORDER BY diagnoses + visits DESC LIMIT 10`).map((d) => ({ ...d, online: d.presence !== 'OFFLINE' && d.presence_at > t - 16 * 3600000 })),
      anomalies: anomalies(),
      aiConfigured: aiAvailable()
    };
  });

  /** Live queue: every request with per-request wait time, computed to the second on each poll. */
  r.get('/admin/queue', { auth: ['ADMIN'] }, (ctx) => {
    const openOnly = ctx.query.get('status') === 'open';
    const rows = all(`SELECT c.id, c.status, c.severity, c.created_at AS createdAt, c.updated_at AS updatedAt, c.closed_at AS closedAt,
        c.patient_snapshot AS snap, s.name AS specialty, c.doctor_id AS doctorId, du.full_name AS doctorName
      FROM consultations c JOIN specialties s ON s.id = c.specialty_id LEFT JOIN users du ON du.id = c.doctor_id
      ${openOnly ? "WHERE c.status IN ('NEW','AI_DRAFTED','ASSIGNED')" : ''}
      ORDER BY (c.status IN ('NEW','AI_DRAFTED','ASSIGNED')) DESC, (c.severity = 'RED' AND c.status IN ('NEW','AI_DRAFTED','ASSIGNED')) DESC, c.created_at ASC LIMIT 300`);
    const t = now();
    return rows.map((r) => {
      const snap = json(r.snap, {});
      const open = ['NEW', 'AI_DRAFTED', 'ASSIGNED'].includes(r.status);
      return {
        id: r.id, status: r.status, severity: r.severity, specialty: r.specialty, open,
        patientName: snap.fullName || '—', createdAt: r.createdAt,
        doctorName: r.doctorName || null,
        waitedMs: open ? t - r.createdAt : (r.closedAt || r.updatedAt) - r.createdAt
      };
    });
  });

  r.get('/admin/report', { auth: ['ADMIN'] }, (ctx) => {
    const from = parseDate(ctx.query.get('from')), to = parseDate(ctx.query.get('to'));
    if (!from || !to || to < from) throw bad('Davrni to‘g‘ri tanlang');
    if (to - from > 370 * DAY) throw bad('Hisobot davri ko‘pi bilan 1 yil');
    const a = from.getTime(), b = to.getTime() + DAY;
    const days = Math.round((b - a) / DAY);
    const daily = dailySeries(DAY_SQL('consultations', 'created_at', 'AND created_at < ?'), a, days, b);
    const appts = dailySeries(DAY_SQL('appointments', 'start_at', "AND status = 'DONE' AND start_at < ?"), a, days, b);
    const regs = dailySeries(DAY_SQL('users', 'created_at', 'AND created_at < ?'), a, days, b);
    audit(ctx, 'ADMIN_REPORT', null, null, dayKey(a) + '..' + dayKey(b - DAY));
    return {
      from: dayKey(a), to: dayKey(b - DAY),
      totals: {
        consultations: count('SELECT COUNT(*) AS n FROM consultations WHERE created_at >= ? AND created_at < ?', a, b),
        diagnosed: count('SELECT COUNT(*) AS n FROM diagnoses WHERE created_at >= ? AND created_at < ?', a, b),
        prescriptions: count('SELECT COUNT(*) AS n FROM prescriptions WHERE issued_at >= ? AND issued_at < ?', a, b),
        dispensed: count('SELECT COUNT(*) AS n FROM prescriptions WHERE dispensed_at >= ? AND dispensed_at < ?', a, b),
        appointments: count("SELECT COUNT(*) AS n FROM appointments WHERE start_at >= ? AND start_at < ? AND status != 'CANCELLED'", a, b),
        visitsDone: count("SELECT COUNT(*) AS n FROM appointments WHERE start_at >= ? AND start_at < ? AND status = 'DONE'", a, b),
        newPatients: count("SELECT COUNT(*) AS n FROM users WHERE role = 'PATIENT' AND created_at >= ? AND created_at < ?", a, b),
        newDoctors: count("SELECT COUNT(*) AS n FROM users WHERE role = 'DOCTOR' AND created_at >= ? AND created_at < ?", a, b),
        reviews: count('SELECT COUNT(*) AS n FROM reviews WHERE created_at >= ? AND created_at < ?', a, b),
        rating: (one('SELECT ROUND(AVG(rating), 1) AS n FROM reviews WHERE created_at >= ? AND created_at < ?', a, b) || {}).n,
        complaints: count("SELECT COUNT(*) AS n FROM tickets WHERE kind = 'COMPLAINT' AND created_at >= ? AND created_at < ?", a, b),
        tickets: count('SELECT COUNT(*) AS n FROM tickets WHERE created_at >= ? AND created_at < ?', a, b)
      },
      bySeverity: group('SELECT severity AS k, COUNT(*) AS n FROM consultations WHERE created_at >= ? AND created_at < ? GROUP BY severity', a, b),
      bySpecialty: group('SELECT s.name AS k, COUNT(*) AS n FROM consultations c JOIN specialties s ON s.id = c.specialty_id WHERE c.created_at >= ? AND c.created_at < ? GROUP BY s.name', a, b),
      daily: daily.map((x, i) => ({ d: x.d, consultations: x.n, visits: appts[i].n, registrations: regs[i].n })),
      doctors: all(`SELECT u.full_name AS fullName, s.name AS specialty,
          (SELECT COUNT(*) FROM diagnoses x WHERE x.doctor_id = u.id AND x.created_at >= ? AND x.created_at < ?) AS diagnoses,
          (SELECT COUNT(*) FROM appointments p WHERE p.doctor_id = u.id AND p.status = 'DONE' AND p.start_at >= ? AND p.start_at < ?) AS visits,
          (SELECT COUNT(*) FROM appointments p WHERE p.doctor_id = u.id AND p.status = 'NO_SHOW' AND p.start_at >= ? AND p.start_at < ?) AS noShow,
          (SELECT ROUND(AVG(rating), 1) FROM reviews r WHERE r.doctor_id = u.id AND r.created_at >= ? AND r.created_at < ?) AS rating,
          (SELECT COUNT(*) FROM tickets k WHERE k.about_doctor_id = u.id AND k.kind = 'COMPLAINT' AND k.created_at >= ? AND k.created_at < ?) AS complaints
        FROM users u JOIN doctor_profiles d ON d.user_id = u.id JOIN specialties s ON s.id = d.specialty_id ORDER BY diagnoses + visits DESC`, a, b, a, b, a, b, a, b, a, b)
    };
  });

  r.get('/admin/doctors', { auth: ['ADMIN'] }, () => all(`SELECT u.id, u.full_name AS fullName, u.phone, u.is_active AS isActive, u.created_at AS createdAt, s.name AS specialty,
      d.license_number AS licenseNumber, d.license_file_id AS licenseFileId, d.experience_years AS experienceYears, d.verification_status AS status, d.note, d.verified_at AS verifiedAt,
      d.clinic_name AS clinicName, d.clinic_address AS clinicAddress, d.price_online AS priceOnline, d.price_visit AS priceVisit,
      (SELECT updated_at FROM user_photos p WHERE p.user_id = u.id) AS photo,
      (SELECT ROUND(AVG(rating), 1) FROM reviews r WHERE r.doctor_id = u.id AND r.is_hidden = 0) AS rating
    FROM users u JOIN doctor_profiles d ON d.user_id = u.id JOIN specialties s ON s.id = d.specialty_id
    ORDER BY CASE d.verification_status WHEN 'PENDING' THEN 0 WHEN 'VERIFIED' THEN 1 ELSE 2 END, u.created_at DESC`).map((x) => ({ ...x, isActive: !!x.isActive })));

  r.patch('/admin/doctors/:id', { auth: ['ADMIN'] }, (ctx) => {
    const id = Number(ctx.params.id);
    const d = one('SELECT * FROM doctor_profiles WHERE user_id = ?', id);
    if (!d) throw notFound('Shifokor topilmadi');
    const status = ctx.body.status;
    if (!['VERIFIED', 'BLOCKED', 'PENDING'].includes(status)) throw bad('Holat noto‘g‘ri');
    const note = str(ctx.body.note, { max: 300, field: 'Izoh' });
    run('UPDATE doctor_profiles SET verification_status = ?, note = ?, verified_by = ?, verified_at = ? WHERE user_id = ?', status, note || null, ctx.user.id, now(), id);
    notify(id, 'VERIFICATION', status === 'VERIFIED' ? 'Litsenziyangiz tasdiqlandi. Navbat ochildi' : status === 'BLOCKED' ? 'Profilingiz bloklandi' + (note ? ': ' + note : '') : 'Profilingiz qayta tekshiruvga qaytarildi', '#/doctor');
    if (status === 'VERIFIED') {
      const u = one('SELECT phone FROM users WHERE id = ?', id);
      sendSms(u.phone, 'MedAssist: litsenziyangiz tasdiqlandi. Endi bemorlar navbatini ko‘rishingiz mumkin.').catch((e) => console.error('[sms]', e.message));
    }
    audit(ctx, 'DOCTOR_' + status, 'user', id, note);
    return { ok: true };
  });

  r.get('/admin/users', { auth: ['ADMIN'] }, (ctx) => {
    const q = '%' + String(ctx.query.get('q') || '').trim().replace(/[%_]/g, '') + '%';
    const role = ['PATIENT', 'DOCTOR', 'ADMIN'].includes(ctx.query.get('role')) ? ctx.query.get('role') : null;
    return all(`SELECT id, role, full_name AS fullName, phone, is_active AS isActive, created_at AS createdAt, (SELECT updated_at FROM user_photos p WHERE p.user_id = users.id) AS photo FROM users
      WHERE (full_name LIKE ? OR phone LIKE ?) AND (? IS NULL OR role = ?) ORDER BY created_at DESC LIMIT 200`, q, q, role, role).map((u) => ({ ...u, isActive: !!u.isActive }));
  });

  r.patch('/admin/users/:id', { auth: ['ADMIN'] }, (ctx) => {
    const id = Number(ctx.params.id);
    if (id === ctx.user.id) throw bad('O‘z akkauntingizni o‘chira olmaysiz');
    if (!one('SELECT id FROM users WHERE id = ?', id)) throw notFound('Foydalanuvchi topilmadi');
    const active = !!ctx.body.isActive;
    run('UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?', active, now(), id);
    if (!active) run('UPDATE refresh_tokens SET revoked = 1, revoked_at = ? WHERE user_id = ? AND revoked = 0', now(), id);
    audit(ctx, active ? 'USER_ACTIVATE' : 'USER_DEACTIVATE', 'user', id);
    return { ok: true };
  });

  r.get('/admin/medicines', { auth: ['ADMIN'] }, () => medicinesAll());

  r.post('/admin/medicines', { auth: ['ADMIN'], status: 201 }, (ctx) => {
    const m = medicineInput(ctx.body);
    const code = str(ctx.body.code, { min: 3, max: 40, field: 'Kod', required: true }).toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    if (one('SELECT id FROM medicines WHERE code = ?', code)) throw conflict('Bu kod bilan dori allaqachon bor');
    const id = insert(`INSERT INTO medicines (code,name,form,strength,mg,unit_dose,standard_dosage,max_daily_mg,min_age,pregnancy_allowed,contra_keys,allergy_keys,side_effects,contraindications,ai_allowed)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, code, m.name, m.form, m.strength, m.mg, m.unitDose, m.std, m.maxDaily, m.minAge, m.preg,
      JSON.stringify(m.contraKeys), JSON.stringify(m.allergyKeys), JSON.stringify(m.se), JSON.stringify(m.ci), m.ai);
    audit(ctx, 'MEDICINE_CREATE', 'medicine', id, code + ' ' + m.name);
    return { id, code };
  });

  r.put('/admin/medicines/:id', { auth: ['ADMIN'] }, (ctx) => {
    const id = Number(ctx.params.id);
    if (!one('SELECT id FROM medicines WHERE id = ?', id)) throw notFound('Dori topilmadi');
    const m = medicineInput(ctx.body);
    run(`UPDATE medicines SET name = ?, form = ?, strength = ?, mg = ?, unit_dose = ?, standard_dosage = ?, max_daily_mg = ?, min_age = ?, pregnancy_allowed = ?, contra_keys = ?, allergy_keys = ?, side_effects = ?, contraindications = ?, ai_allowed = ? WHERE id = ?`,
      m.name, m.form, m.strength, m.mg, m.unitDose, m.std, m.maxDaily, m.minAge, m.preg, JSON.stringify(m.contraKeys), JSON.stringify(m.allergyKeys), JSON.stringify(m.se), JSON.stringify(m.ci), m.ai, id);
    audit(ctx, 'MEDICINE_UPDATE', 'medicine', id, m.name);
    return { ok: true };
  });

  r.patch('/admin/medicines/:id', { auth: ['ADMIN'] }, (ctx) => {
    const id = Number(ctx.params.id);
    const m = one('SELECT * FROM medicines WHERE id = ?', id);
    if (!m) throw notFound('Dori topilmadi');
    const ai = ctx.body.aiAllowed === undefined ? !!m.ai_allowed : !!ctx.body.aiAllowed;
    const active = ctx.body.isActive === undefined ? !!m.is_active : !!ctx.body.isActive;
    run('UPDATE medicines SET ai_allowed = ?, is_active = ? WHERE id = ?', ai, active, id);
    audit(ctx, 'MEDICINE_UPDATE', 'medicine', id, m.name + ': ai=' + ai + ', active=' + active);
    return { ok: true };
  });

  r.post('/admin/medicines/:id/photo', { auth: ['ADMIN'], raw: true }, (ctx) => {
    const id = Number(ctx.params.id);
    const m = one('SELECT * FROM medicines WHERE id = ?', id);
    if (!m) throw notFound('Dori topilmadi');
    const f = detectFile(ctx.raw);
    if (!f.mime.startsWith('image/')) throw bad('Rasm jpg yoki png bo‘lishi kerak');
    if (ctx.raw.length > 3 * 1048576) throw bad('Rasm 3 MB dan oshmasin');
    const stored = 'med-' + crypto.randomBytes(12).toString('hex') + f.ext;
    fs.writeFileSync(path.join(config.uploadDir, stored), ctx.raw, { mode: 0o640 });
    if (m.photo_name) fs.rm(path.join(config.uploadDir, m.photo_name), { force: true }, () => {});
    run('UPDATE medicines SET photo_name = ?, photo_mime = ?, photo_updated_at = ? WHERE id = ?', stored, f.mime, now(), id);
    audit(ctx, 'MEDICINE_PHOTO', 'medicine', id, m.name);
    return medicineRow(one('SELECT * FROM medicines WHERE id = ?', id));
  });

  r.delete('/admin/medicines/:id/photo', { auth: ['ADMIN'] }, (ctx) => {
    const id = Number(ctx.params.id);
    const m = one('SELECT * FROM medicines WHERE id = ?', id);
    if (!m) throw notFound('Dori topilmadi');
    if (m.photo_name) fs.rm(path.join(config.uploadDir, m.photo_name), { force: true }, () => {});
    run('UPDATE medicines SET photo_name = NULL, photo_mime = NULL, photo_updated_at = NULL WHERE id = ?', id);
    audit(ctx, 'MEDICINE_PHOTO_DELETE', 'medicine', id, m.name);
    return medicineRow(one('SELECT * FROM medicines WHERE id = ?', id));
  });

  r.get('/admin/audit', { auth: ['ADMIN'] }, (ctx) => {
    const limit = Math.min(500, Math.max(1, Number(ctx.query.get('limit')) || 200));
    return all(`SELECT a.id, a.action, a.entity, a.entity_id AS entityId, a.detail, a.ip, a.created_at AS createdAt, u.full_name AS userName, u.role AS userRole
      FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT ?`, limit);
  });
}

export { SPECIALTIES };
