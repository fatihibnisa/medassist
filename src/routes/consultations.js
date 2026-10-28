import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { one, all, run, insert, now, tx, json, specialtyId, medicineRow } from '../db.js';
import { HttpError, bad, forbidden, notFound, conflict, str, intIn, rateLimit } from '../http.js';
import { audit, notify, sendSms } from '../auth.js';
import { userDto, requireVerifiedDoctor, loadConsultation, assertCanView, consultationDto, prescriptionDto, ageFrom, verifyUrl, canTake, photoV } from '../dto.js';
import { startCourse } from './tracker.js';
import { detectFile } from './files.js';
import { generateSuggestion } from '../ai.js';
import { prescriptionPdf } from '../documents.js';
import { SEGMENT_CODES, SEGMENT_NAMES, PAIN_KINDS, SYMPTOMS, DANGER_FLAGS, SEVERITY_LABEL, triage, specialtyFor, safetyCheck, ICD_PATTERN } from '../../public/shared/clinical.js';

const ACTIVE = ['NEW', 'AI_DRAFTED', 'ASSIGNED'];
const SEV_ORDER = "CASE c.severity WHEN 'RED' THEN 0 WHEN 'YELLOW' THEN 1 ELSE 2 END";

function listItem(c) {
  const snap = json(c.patient_snapshot, {});
  const segs = all('SELECT segment_code AS code, pain_level AS pain FROM consultation_segments WHERE consultation_id = ? ORDER BY pain_level DESC', c.id);
  return {
    id: c.id, status: c.status, severity: c.severity, createdAt: c.created_at, updatedAt: c.updated_at, specialty: c.specialty,
    patient: { fullName: snap.fullName, age: snap.age, gender: snap.gender, photo: photoV(c.patient_id) }, doctorId: c.doctor_id, doctorName: c.doctor_name || null,
    requestedDoctorId: c.requested_doctor_id || null, segments: segs, aiPending: !!c.ai_pending, unread: c.unread || 0, hasPrescription: !!c.has_rx, reviewed: !!c.reviewed
  };
}
function bumpUpdated(id) { run('UPDATE consultations SET updated_at = ? WHERE id = ?', now(), id); }

export default function consultationRoutes(r) {
  /* ---------------- patient ---------------- */
  r.post('/consultations', { auth: ['PATIENT'], status: 201 }, (ctx) => {
    if (!rateLimit('cons:' + ctx.user.id, 10, 3600000)) throw new HttpError(429, 'Bir soatda 10 tadan ortiq murojaat yuborib bo‘lmaydi');
    const b = ctx.body;
    const prof = one('SELECT * FROM patient_profiles WHERE user_id = ?', ctx.user.id);
    if (!prof) throw bad('Avval tibbiy profilni to‘ldiring');
    if (!Array.isArray(b.segments) || b.segments.length < 1) throw bad('Kamida bitta joy tanlang');
    if (b.segments.length > 20) throw bad('Ko‘pi bilan 20 ta joy');
    const seen = new Set();
    const segments = b.segments.map((s) => {
      if (!s || !SEGMENT_CODES.includes(s.code)) throw bad('Noma’lum tana joyi');
      if (seen.has(s.code)) throw bad('Bir joy ikki marta tanlangan');
      seen.add(s.code);
      if (!PAIN_KINDS[s.kind]) throw bad('Og‘riq turini tanlang');
      return { code: s.code, pain: intIn(s.pain, 0, 10, 'Og‘riq darajasi'), kind: s.kind, dur: intIn(s.dur, 0, 3, 'Davomiylik') };
    });
    const symptoms = [...new Set((Array.isArray(b.symptoms) ? b.symptoms : []).filter((k) => SYMPTOMS[k]))];
    const flags = [...new Set((Array.isArray(b.flags) ? b.flags : []).filter((k) => DANGER_FLAGS[k]))];
    let temperature = null;
    if (b.temperature !== null && b.temperature !== undefined && b.temperature !== '') {
      temperature = Number(String(b.temperature).replace(',', '.'));
      if (!(temperature >= 34 && temperature <= 43)) throw bad('Harorat 34–43 °C oralig‘ida bo‘lsin');
    }
    const complaint = str(b.complaint, { max: 2000, field: 'Shikoyat' });
    const u = one('SELECT full_name, phone FROM users WHERE id = ?', ctx.user.id);
    const age = ageFrom(prof.birth_year);
    const snapshot = { fullName: u.full_name, phone: u.phone, age, gender: prof.gender, pregnant: !!prof.pregnant, allergies: prof.allergies, chronic: prof.chronic_diseases, bloodType: prof.blood_type };
    const t = triage({ segments, symptoms, flags, temperature, patient: { age, pregnant: !!prof.pregnant, chronic: prof.chronic_diseases } });
    const top = segments.slice().sort((a, z) => z.pain - a.pain)[0];
    let requested = null;
    if (b.doctorId != null && b.doctorId !== '') {
      requested = one("SELECT d.user_id, d.specialty_id FROM doctor_profiles d JOIN users u ON u.id = d.user_id WHERE d.user_id = ? AND d.verification_status = 'VERIFIED' AND u.is_active = 1", Number(b.doctorId));
      if (!requested) throw bad('Tanlangan shifokor topilmadi');
    }
    const specId = requested ? requested.specialty_id : specialtyId(t.severity === 'RED' ? 'Terapevt' : specialtyFor(top.code));
    const id = tx(() => {
      const cid = insert(`INSERT INTO consultations (patient_id, specialty_id, complaint, severity, triage_reasons, symptoms, flags, temperature, patient_snapshot, status, requested_doctor_id, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, ctx.user.id, specId, complaint, t.severity, JSON.stringify(t.reasons), JSON.stringify(symptoms), JSON.stringify(flags), temperature, JSON.stringify(snapshot), 'NEW', requested ? requested.user_id : null, now(), now());
      for (const s of segments) insert('INSERT INTO consultation_segments (consultation_id, segment_code, pain_level, symptom_type, duration_idx) VALUES (?,?,?,?,?)', cid, s.code, s.pain, s.kind, s.dur);
      return cid;
    });
    audit(ctx, 'CONSULTATION_CREATE', 'consultation', id, t.severity);
    if (t.severity === 'RED') {
      for (const d of all("SELECT user_id FROM doctor_profiles WHERE verification_status = 'VERIFIED'")) notify(d.user_id, 'URGENT', 'Shoshilinch murojaat navbatda: ' + segments.map((s) => SEGMENT_NAMES[s.code]).join(', '), '#/doctor/c/' + id);
    } else {
      if (requested) notify(requested.user_id, 'NEW_CASE', 'Bemor sizni tanladi: ' + segments.map((s) => SEGMENT_NAMES[s.code]).join(', '), '#/doctor/c/' + id);
      setImmediate(() => { generateSuggestion(id, null).catch((e) => console.error('[ai]', e.message)); });
    }
    return consultationDto(loadConsultation(id), 'patient');
  });

  r.post('/consultations/:id/attachments', { auth: ['PATIENT'], raw: true, status: 201 }, (ctx) => {
    const c = loadConsultation(ctx.params.id);
    if (c.patient_id !== ctx.user.id) throw forbidden();
    if (!ACTIVE.includes(c.status)) throw bad('Yopilgan murojaatga fayl qo‘shib bo‘lmaydi');
    if (one('SELECT COUNT(*) AS n FROM attachments WHERE consultation_id = ?', c.id).n >= 5) throw bad('Ko‘pi bilan 5 ta fayl');
    const f = detectFile(ctx.raw);
    let name = 'fayl' + f.ext;
    try { name = decodeURIComponent(String(ctx.req.headers['x-file-name'] || name)); } catch { /* keep default */ }
    name = name.replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 120) || 'fayl' + f.ext;
    const stored = crypto.randomBytes(16).toString('hex') + f.ext;
    fs.writeFileSync(path.join(config.uploadDir, stored), ctx.raw, { mode: 0o640 });
    const id = insert('INSERT INTO attachments (consultation_id, owner_id, kind, original_name, stored_name, mime, size_bytes, created_at) VALUES (?,?,?,?,?,?,?,?)', c.id, ctx.user.id, 'CONSULTATION', name, stored, f.mime, ctx.raw.length, now());
    audit(ctx, 'ATTACHMENT_UPLOAD', 'consultation', c.id, name);
    return { id, name, mime: f.mime, size: ctx.raw.length };
  });

  r.get('/consultations/my', { auth: ['PATIENT'] }, (ctx) => {
    const rows = all(`SELECT c.*, s.name AS specialty, u.full_name AS doctor_name,
        (SELECT COUNT(*) FROM messages m WHERE m.consultation_id = c.id AND m.sender_id != c.patient_id AND m.is_read = 0) AS unread,
        (SELECT COUNT(*) FROM prescriptions p WHERE p.consultation_id = c.id) AS has_rx,
        (SELECT COUNT(*) FROM reviews r WHERE r.consultation_id = c.id) AS reviewed
      FROM consultations c JOIN specialties s ON s.id = c.specialty_id LEFT JOIN users u ON u.id = c.doctor_id
      WHERE c.patient_id = ? AND c.is_deleted = 0 ORDER BY c.created_at DESC LIMIT 200`, ctx.user.id);
    return rows.map(listItem);
  });

  r.get('/consultations/:id', { auth: ['PATIENT', 'DOCTOR'] }, (ctx) => {
    const c = loadConsultation(ctx.params.id);
    const access = assertCanView(ctx.user, c);
    if (access !== 'patient') audit(ctx, 'VIEW_PATIENT_CARD', 'consultation', c.id);
    return consultationDto(c, access);
  });

  r.post('/consultations/:id/close', { auth: ['PATIENT'] }, (ctx) => {
    const c = loadConsultation(ctx.params.id);
    if (c.patient_id !== ctx.user.id) throw forbidden();
    if (c.status === 'DIAGNOSED') run("UPDATE consultations SET status = 'CLOSED', closed_at = ?, updated_at = ? WHERE id = ?", now(), now(), c.id);
    else if (['NEW', 'AI_DRAFTED'].includes(c.status)) run("UPDATE consultations SET status = 'CANCELLED', closed_at = ?, updated_at = ? WHERE id = ?", now(), now(), c.id);
    else throw bad('Bu holatda murojaatni yopib bo‘lmaydi');
    audit(ctx, 'CONSULTATION_CLOSE', 'consultation', c.id);
    return consultationDto(loadConsultation(c.id), 'patient');
  });

  /* ---------------- chat ---------------- */
  r.get('/consultations/:id/messages', { auth: ['PATIENT', 'DOCTOR'] }, (ctx) => {
    const c = loadConsultation(ctx.params.id);
    const access = assertCanView(ctx.user, c);
    if (access === 'doctor-preview') return [];
    const after = Number(ctx.query.get('after') || 0);
    run('UPDATE messages SET is_read = 1 WHERE consultation_id = ? AND sender_id != ? AND is_read = 0', c.id, ctx.user.id);
    return all(`SELECT m.id, m.content, m.created_at AS createdAt, m.sender_id AS senderId, u.role AS senderRole, u.full_name AS senderName
      FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.consultation_id = ? AND m.id > ? ORDER BY m.id LIMIT 500`, c.id, after);
  });

  r.post('/consultations/:id/messages', { auth: ['PATIENT', 'DOCTOR'], status: 201 }, (ctx) => {
    const c = loadConsultation(ctx.params.id);
    const access = assertCanView(ctx.user, c);
    if (access === 'doctor-preview') throw forbidden('Yozish uchun avval murojaatni navbatdan oling');
    if (['CLOSED', 'CANCELLED'].includes(c.status)) throw bad('Murojaat yopilgan');
    if (!rateLimit('msg:' + ctx.user.id, 30, 60000)) throw new HttpError(429, 'Juda tez yozyapsiz');
    const content = str(ctx.body.content, { min: 1, max: 2000, field: 'Xabar', required: true });
    const id = insert('INSERT INTO messages (consultation_id, sender_id, content, created_at) VALUES (?,?,?,?)', c.id, ctx.user.id, content, now());
    bumpUpdated(c.id);
    const to = access === 'patient' ? c.doctor_id : c.patient_id;
    if (to) notify(to, 'MESSAGE', 'Yangi xabar: ' + content.slice(0, 80), access === 'patient' ? '#/doctor/c/' + c.id : '#/app/c/' + c.id);
    return { id, content, createdAt: now(), senderId: ctx.user.id, senderRole: ctx.user.role };
  });

  /* ---------------- doctor ---------------- */
  r.get('/doctor/queue', { auth: ['DOCTOR'] }, (ctx) => {
    const d = requireVerifiedDoctor(ctx);
    const filter = ctx.query.get('filter') || 'mine';
    const base = `SELECT c.*, s.name AS specialty, u.full_name AS doctor_name,
        (SELECT COUNT(*) FROM ai_suggestions a WHERE a.consultation_id = c.id AND a.review_status = 'PENDING') AS ai_pending,
        (SELECT COUNT(*) FROM messages m WHERE m.consultation_id = c.id AND m.sender_id = c.patient_id AND m.is_read = 0) AS unread,
        (SELECT COUNT(*) FROM prescriptions p WHERE p.consultation_id = c.id) AS has_rx
      FROM consultations c JOIN specialties s ON s.id = c.specialty_id LEFT JOIN users u ON u.id = c.doctor_id WHERE c.is_deleted = 0 `;
    let rows;
    const takeable = "(c.requested_doctor_id IS NULL OR c.requested_doctor_id = ? OR c.severity = 'RED')";
    if (filter === 'done') rows = all(base + "AND c.doctor_id = ? AND c.status IN ('DIAGNOSED','CLOSED') ORDER BY c.updated_at DESC LIMIT 200", ctx.user.id);
    else if (filter === 'all') rows = all(base + `AND c.status IN ('NEW','AI_DRAFTED','ASSIGNED') AND (c.doctor_id = ? OR (c.doctor_id IS NULL AND ${takeable})) ORDER BY ${SEV_ORDER}, c.created_at LIMIT 300`, ctx.user.id, ctx.user.id);
    else rows = all(base + `AND c.status IN ('NEW','AI_DRAFTED','ASSIGNED') AND (c.doctor_id = ? OR (c.doctor_id IS NULL AND (c.requested_doctor_id = ? OR (c.requested_doctor_id IS NULL AND (c.specialty_id = ? OR c.severity = 'RED' OR ? = 'Terapevt')) OR c.severity = 'RED'))) ORDER BY ${SEV_ORDER}, c.created_at LIMIT 300`, ctx.user.id, ctx.user.id, d.specialtyId, d.specialty);
    const stats = one(`SELECT
        (SELECT COUNT(*) FROM diagnoses WHERE doctor_id = ? AND created_at > ?) AS today,
        (SELECT COUNT(*) FROM ai_suggestions WHERE reviewed_by = ? AND review_status = 'APPROVED') AS aiApproved,
        (SELECT COUNT(*) FROM ai_suggestions WHERE reviewed_by = ? AND review_status IN ('APPROVED','MODIFIED','REJECTED')) AS aiReviewed`,
      ctx.user.id, new Date().setHours(0, 0, 0, 0), ctx.user.id, ctx.user.id);
    return { items: rows.map(listItem), stats };
  });

  r.post('/consultations/:id/assign', { auth: ['DOCTOR'] }, (ctx) => {
    requireVerifiedDoctor(ctx);
    const c = loadConsultation(ctx.params.id);
    if (!canTake(ctx.user.id, c)) throw forbidden('Bemor boshqa shifokorni tanlagan');
    const res = run("UPDATE consultations SET doctor_id = ?, status = 'ASSIGNED', updated_at = ? WHERE id = ? AND doctor_id IS NULL AND status IN ('NEW','AI_DRAFTED')", ctx.user.id, now(), c.id);
    if (res.changes === 0) throw conflict('Bu murojaatni boshqa shifokor allaqachon olgan');
    notify(c.patient_id, 'ASSIGNED', 'Shifokor murojaatingizni ko‘rib chiqmoqda', '#/app/c/' + c.id);
    audit(ctx, 'CONSULTATION_ASSIGN', 'consultation', c.id);
    return consultationDto(loadConsultation(c.id), 'doctor');
  });

  r.post('/consultations/:id/ai', { auth: ['DOCTOR'] }, async (ctx) => {
    requireVerifiedDoctor(ctx);
    const c = loadConsultation(ctx.params.id);
    if (c.doctor_id !== ctx.user.id) throw forbidden('Avval murojaatni navbatdan oling');
    if (c.severity === 'RED') throw bad('Shoshilinch holatda AI o‘chirilgan');
    if (!rateLimit('ai:' + ctx.user.id, 20, 3600000)) throw new HttpError(429, 'AI so‘rovlari limiti tugadi, birozdan keyin urinib ko‘ring');
    await generateSuggestion(c.id, ctx);
    return consultationDto(loadConsultation(c.id), 'doctor');
  });

  r.post('/consultations/:id/ai/reject', { auth: ['DOCTOR'] }, (ctx) => {
    requireVerifiedDoctor(ctx);
    const c = loadConsultation(ctx.params.id);
    if (c.doctor_id !== ctx.user.id) throw forbidden();
    const note = str(ctx.body.note, { min: 3, max: 500, field: 'Rad etish sababi', required: true });
    const res = run("UPDATE ai_suggestions SET review_status = 'REJECTED', reviewed_by = ?, reviewed_at = ?, doctor_note = ? WHERE consultation_id = ? AND review_status = 'PENDING'", ctx.user.id, now(), note, c.id);
    if (!res.changes) throw bad('Kutilayotgan AI qoralamasi yo‘q');
    audit(ctx, 'AI_REJECT', 'consultation', c.id, note);
    return consultationDto(loadConsultation(c.id), 'doctor');
  });

  /** Doctor cannot decide from the online consultation alone — invite the patient for an in-person exam, without closing the case. */
  r.post('/consultations/:id/refer', { auth: ['DOCTOR'] }, (ctx) => {
    requireVerifiedDoctor(ctx);
    const c = loadConsultation(ctx.params.id);
    if (c.doctor_id !== ctx.user.id) throw forbidden('Bu murojaat sizga biriktirilmagan');
    if (c.status !== 'ASSIGNED') throw bad('Tashxis allaqachon qo‘yilgan yoki murojaat yopilgan');
    const note = str(ctx.body.note, { max: 500, field: 'Izoh' });
    run('UPDATE consultations SET referred_at = ?, referral_note = ?, updated_at = ? WHERE id = ?', now(), note, now(), c.id);
    notify(c.patient_id, 'REFERRAL', 'Shifokor sizni tibbiy ko‘rikka taklif qilmoqda' + (note ? ': ' + note.slice(0, 100) : '') + '. Klinikaga yozilib boring', '#/app/c/' + c.id);
    audit(ctx, 'CONSULTATION_REFER', 'consultation', c.id, note);
    return consultationDto(loadConsultation(c.id), 'doctor');
  });

  r.post('/consultations/:id/diagnosis', { auth: ['DOCTOR'], status: 201 }, (ctx) => {
    requireVerifiedDoctor(ctx);
    const c = loadConsultation(ctx.params.id);
    if (c.doctor_id !== ctx.user.id) throw forbidden('Bu murojaat sizga biriktirilmagan');
    if (c.status !== 'ASSIGNED') throw bad('Tashxis allaqachon qo‘yilgan yoki murojaat yopilgan');
    const b = ctx.body;
    const icd = String(b.icd10 || '').trim().toUpperCase();
    if (!ICD_PATTERN.test(icd)) throw bad('ICD-10 kodi noto‘g‘ri (masalan J06.9)');
    const title = str(b.title, { min: 2, max: 200, field: 'Tashxis nomi', required: true });
    const description = str(b.description, { max: 2000, field: 'Tavsif' });
    const recommendations = str(b.recommendations, { max: 3000, field: 'Maslahatlar' });
    const redFlags = (Array.isArray(b.redFlags) ? b.redFlags : []).map((x) => String(x).trim().slice(0, 200)).filter(Boolean).slice(0, 10);
    const rawItems = Array.isArray(b.items) ? b.items : [];
    if (rawItems.length > 10) throw bad('Ko‘pi bilan 10 ta dori');
    const items = rawItems.map((it) => {
      const m = medicineRow(one('SELECT * FROM medicines WHERE id = ? AND is_active = 1', Number(it.medicineId)));
      if (!m) throw bad('Dori topilmadi yoki faol emas');
      const timesPerDay = intIn(it.timesPerDay, 1, 12, 'Kuniga necha marta');
      const durationDays = intIn(it.durationDays, 1, 365, 'Kunlar soni');
      let doseMg = null, dosage;
      if (m.mg) { doseMg = Number(it.doseMg); if (!(doseMg > 0 && doseMg <= 5000)) throw bad(m.name + ': dozani mg da kiriting'); dosage = doseMg + ' mg'; }
      else dosage = str(it.dosage || m.unitDose || m.std, { min: 1, max: 120, field: 'Doza' });
      return { med: m, doseMg, dosage, timesPerDay, durationDays, instructions: str(it.instructions, { max: 300, field: 'Qabul tartibi' }) };
    });
    const snap = json(c.patient_snapshot, {});
    const checks = safetyCheck(items, { age: snap.age, pregnant: snap.pregnant, allergies: snap.allergies, chronic: snap.chronic });
    const blocked = checks.map((ch, i) => (ch.block ? items[i].med.name + ': ' + ch.issues.join('; ') : null)).filter(Boolean);
    if (blocked.length) throw bad('Xavfsizlik tekshiruvi: ' + blocked.join(' | '), blocked);
    const aiDecision = b.aiDecision === 'APPROVED' ? 'APPROVED' : 'MODIFIED';
    const rx = tx(() => {
      const dxId = insert('INSERT INTO diagnoses (consultation_id, doctor_id, icd10_code, title, description, recommendations, red_flags, created_at) VALUES (?,?,?,?,?,?,?,?)',
        c.id, ctx.user.id, icd, title, description, recommendations, JSON.stringify(redFlags), now());
      let rxRow = null;
      if (items.length) {
        let number, code;
        do { number = 'RX-' + new Date().getFullYear() + '-' + String(crypto.randomInt(100000, 1000000)); } while (one('SELECT id FROM prescriptions WHERE number = ?', number));
        const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        do { code = Array.from({ length: 8 }, () => A[crypto.randomInt(0, A.length)]).join(''); } while (one('SELECT id FROM prescriptions WHERE verify_code = ?', code));
        const rxId = insert('INSERT INTO prescriptions (diagnosis_id, consultation_id, doctor_id, number, verify_code, issued_at, valid_until) VALUES (?,?,?,?,?,?,?)',
          dxId, c.id, ctx.user.id, number, code, now(), now() + 30 * 86400000);
        for (const it of items) insert('INSERT INTO prescription_items (prescription_id, medicine_id, dose_mg, dosage_text, times_per_day, duration_days, instructions) VALUES (?,?,?,?,?,?,?)',
          rxId, it.med.id, it.doseMg, it.dosage, it.timesPerDay, it.durationDays, it.instructions);
        rxRow = { id: rxId, number };
      }
      run("UPDATE ai_suggestions SET review_status = ?, reviewed_by = ?, reviewed_at = ? WHERE consultation_id = ? AND review_status = 'PENDING'", aiDecision, ctx.user.id, now(), c.id);
      run("UPDATE consultations SET status = 'DIAGNOSED', updated_at = ? WHERE id = ?", now(), c.id);
      return rxRow;
    });
    audit(ctx, 'DIAGNOSIS_CREATE', 'consultation', c.id, icd + (rx ? ' ' + rx.number : ''));
    notify(c.patient_id, 'RESULT', 'Shifokor javobi tayyor: ' + title, '#/app/c/' + c.id);
    const phone = one('SELECT phone FROM users WHERE id = ?', c.patient_id).phone;
    sendSms(phone, 'MedAssist: shifokor murojaatingizga javob berdi.' + (rx ? ' Retsept: ' + rx.number : '') + ' ' + config.publicUrl).catch((e) => console.error('[sms]', e.message));
    return consultationDto(loadConsultation(c.id), 'doctor');
  });

  r.post('/prescriptions/:id/cancel', { auth: ['DOCTOR'] }, (ctx) => {
    requireVerifiedDoctor(ctx);
    const rx = one('SELECT * FROM prescriptions WHERE id = ?', Number(ctx.params.id));
    if (!rx) throw notFound('Retsept topilmadi');
    if (rx.doctor_id !== ctx.user.id) throw forbidden('Faqat retseptni yozgan shifokor bekor qila oladi');
    if (rx.status === 'CANCELLED') throw bad('Retsept allaqachon bekor qilingan');
    const reason = str(ctx.body.reason, { min: 3, max: 300, field: 'Sabab', required: true });
    run("UPDATE prescriptions SET status = 'CANCELLED', cancel_reason = ?, cancelled_at = ? WHERE id = ?", reason, now(), rx.id);
    const c = loadConsultation(rx.consultation_id);
    notify(c.patient_id, 'RX_CANCELLED', 'Retsept ' + rx.number + ' bekor qilindi: ' + reason, '#/app/c/' + c.id);
    audit(ctx, 'PRESCRIPTION_CANCEL', 'prescription', rx.id, reason);
    return prescriptionDto(one('SELECT * FROM prescriptions WHERE id = ?', rx.id));
  });

  r.get('/prescriptions/:id/pdf', { auth: ['PATIENT', 'DOCTOR'] }, async (ctx) => {
    const rx = one('SELECT * FROM prescriptions WHERE id = ?', Number(ctx.params.id));
    if (!rx) throw notFound('Retsept topilmadi');
    const c = loadConsultation(rx.consultation_id);
    if (!((ctx.user.role === 'PATIENT' && c.patient_id === ctx.user.id) || (ctx.user.role === 'DOCTOR' && rx.doctor_id === ctx.user.id))) throw forbidden();
    const dto = prescriptionDto(rx);
    const snap = json(c.patient_snapshot, {});
    const doc = userDto(rx.doctor_id);
    const dx = one('SELECT * FROM diagnoses WHERE id = ?', rx.diagnosis_id);
    let patientPhoto = null;
    const photoRow = one('SELECT stored_name, mime FROM user_photos WHERE user_id = ?', c.patient_id);
    if (photoRow) {
      const file = path.join(config.uploadDir, photoRow.stored_name);
      if (fs.existsSync(file)) patientPhoto = { bytes: fs.readFileSync(file), mime: photoRow.mime };
    }
    const buf = await prescriptionPdf({
      number: rx.number, code: rx.verify_code, issuedAt: rx.issued_at, validUntil: rx.valid_until, status: rx.status,
      patientName: snap.fullName, patientAge: snap.age, patientPhoto, doctorName: doc.fullName, specialty: doc.doctor.specialty, license: doc.doctor.licenseNumber,
      icd10: dx.icd10_code, dxTitle: dx.title, verifyUrl: verifyUrl(rx.verify_code),
      items: dto.items.map((i) => ({ name: i.name, strength: i.strength, form: i.form, dosage: i.dosage, timesPerDay: i.timesPerDay, days: i.days, instructions: i.instructions }))
    });
    audit(ctx, 'PRESCRIPTION_PDF', 'prescription', rx.id);
    ctx.res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': buf.length, 'Content-Disposition': 'attachment; filename="retsept-' + rx.number + '.pdf"', 'Cache-Control': 'private, no-store' });
    ctx.res.end(buf);
  });

  /* ---------------- public ---------------- */
  r.get('/public/verify/:code', (ctx) => {
    if (!rateLimit('verify:' + ctx.ip, 30, 60000)) throw new HttpError(429, 'Juda ko‘p so‘rov');
    const code = String(ctx.params.code || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!/^[A-Z0-9-]{6,20}$/.test(code)) throw bad('Kod formati noto‘g‘ri');
    const rx = one('SELECT * FROM prescriptions WHERE verify_code = ? OR number = ?', code, code);
    audit(ctx, 'PRESCRIPTION_VERIFY', 'prescription', rx ? rx.id : null, rx ? rx.status : 'NOT_FOUND');
    if (!rx) return { status: 'NOT_FOUND' };
    const dto = prescriptionDto(rx);
    const c = one('SELECT patient_snapshot FROM consultations WHERE id = ?', rx.consultation_id);
    const snap = json(c.patient_snapshot, {});
    const doc = userDto(rx.doctor_id);
    return {
      status: dto.status === 'ACTIVE' ? 'VALID' : dto.status, number: dto.number, code: dto.code, issuedAt: dto.issuedAt, validUntil: dto.validUntil, cancelReason: dto.cancelReason,
      dispensedAt: dto.dispensedAt, dispensedBy: dto.dispensedBy,
      patient: snap.fullName ? snap.fullName.split(/\s+/).map((w) => w[0] + '***').join(' ') : '',
      doctor: { fullName: doc.fullName, specialty: doc.doctor.specialty, licenseNumber: doc.doctor.licenseNumber },
      items: dto.items.map((i) => ({ name: i.name, strength: i.strength, form: i.form, dosage: i.dosage, timesPerDay: i.timesPerDay, days: i.days }))
    };
  });

  // Pharmacy marks the prescription as dispensed. The verify code itself is the credential (printed on the
  // prescription, never listed anywhere). A prescription can be dispensed once — repeat attempts are refused.
  r.post('/public/verify/:code/dispense', (ctx) => {
    if (!rateLimit('dispense:' + ctx.ip, 20, 60000)) throw new HttpError(429, 'Juda ko‘p so‘rov');
    const code = String(ctx.params.code || '').trim().toUpperCase().replace(/\s+/g, '');
    const rx = one('SELECT * FROM prescriptions WHERE verify_code = ?', code);
    if (!rx) throw notFound('Retsept topilmadi');
    const dto = prescriptionDto(rx);
    if (dto.status !== 'ACTIVE') throw bad('Retsept amalda emas: ' + (dto.status === 'CANCELLED' ? 'bekor qilingan' : 'muddati o‘tgan'));
    if (rx.dispensed_at) throw conflict('Bu retsept bo‘yicha dori allaqachon berilgan: ' + new Date(rx.dispensed_at).toLocaleString('uz-UZ'));
    const pharmacy = str(ctx.body.pharmacy, { min: 2, max: 120, field: 'Dorixona nomi', required: true });
    run('UPDATE prescriptions SET dispensed_at = ?, dispensed_by = ? WHERE id = ? AND dispensed_at IS NULL', now(), pharmacy, rx.id);
    const c = one('SELECT patient_id FROM consultations WHERE id = ?', rx.consultation_id);
    startCourse(rx.id, c.patient_id);
    notify(c.patient_id, 'DISPENSED', 'Dorilar berildi (' + pharmacy + '). Dori ichish jadvali tayyor — eslatmalar yoqildi', '#/app/meds');
    audit(ctx, 'PRESCRIPTION_DISPENSE', 'prescription', rx.id, pharmacy);
    return { ok: true, dispensedAt: now() };
  });
}

export { SEVERITY_LABEL };
