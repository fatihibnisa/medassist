import { config } from './config.js';
import { one, all, json, medicineRow } from './db.js';
import { forbidden, notFound, HttpError } from './http.js';
import { qrSvg } from './documents.js';
import { DEFAULT_WORK_HOURS } from '../public/shared/clinical.js';

export const YEAR = () => new Date().getFullYear();
export const ageFrom = (birthYear) => (birthYear ? YEAR() - Number(birthYear) : null);
export const verifyUrl = (code) => config.publicUrl + '/#/verify/' + code;
export const mask = (n) => String(n || '').split(/\s+/).filter(Boolean).map((w) => w[0] + '***').join(' ');

export const photoV = (id) => { const p = one('SELECT updated_at FROM user_photos WHERE user_id = ?', id); return p ? p.updated_at : null; };

export function userDto(id) {
  const u = one('SELECT id, role, full_name, phone, is_active, created_at FROM users WHERE id = ?', id);
  if (!u) return null;
  const out = { id: u.id, role: u.role, fullName: u.full_name, phone: u.phone, isActive: !!u.is_active, createdAt: u.created_at, photo: photoV(id) };
  if (u.role === 'PATIENT') {
    const p = one('SELECT * FROM patient_profiles WHERE user_id = ?', id);
    out.patient = p ? { birthYear: p.birth_year, age: ageFrom(p.birth_year), gender: p.gender, bloodType: p.blood_type, allergies: p.allergies, chronic: p.chronic_diseases, pregnant: !!p.pregnant, address: p.address, emergencyContact: p.emergency_contact } : null;
  }
  if (u.role === 'DOCTOR') out.doctor = doctorProfile(id);
  return out;
}

/** A doctor who set "online" yesterday and forgot is not online today. */
export const effectivePresence = (presence, at) => (presence !== 'OFFLINE' && at && Date.now() - at < 16 * 3600000 ? presence : 'OFFLINE');
export const workHours = (raw) => { const w = json(raw, {}); return Object.keys(w).length ? w : DEFAULT_WORK_HOURS; };

/** Plain text behind the profile ID card's QR — exactly what the card already prints, nothing more. */
export function idCardText(u) {
  const idNo = (u.role === 'DOCTOR' ? 'MA-SH-' : 'MA-BM-') + String(u.id).padStart(6, '0');
  const lines = ['MedAssist', idNo, u.fullName];
  if (u.role === 'PATIENT' && u.patient) {
    if (u.patient.bloodType) lines.push('Qon guruhi: ' + u.patient.bloodType);
    if (u.patient.allergies) lines.push('Allergiya: ' + u.patient.allergies);
  }
  if (u.role === 'DOCTOR' && u.doctor) {
    lines.push(u.doctor.specialty);
    lines.push('Litsenziya: ' + u.doctor.licenseNumber);
  }
  return lines.join('\n');
}

export function doctorProfile(id) {
  const d = one('SELECT d.*, s.name AS specialty FROM doctor_profiles d JOIN specialties s ON s.id = d.specialty_id WHERE d.user_id = ?', id);
  if (!d) return null;
  return {
    specialtyId: d.specialty_id, specialty: d.specialty, licenseNumber: d.license_number, licenseFileId: d.license_file_id, experienceYears: d.experience_years, status: d.verification_status, note: d.note,
    clinicName: d.clinic_name, clinicAddress: d.clinic_address, clinicLat: d.clinic_lat, clinicLng: d.clinic_lng, priceOnline: d.price_online, priceVisit: d.price_visit, bio: d.bio,
    presence: effectivePresence(d.presence, d.presence_at), workHours: workHours(d.work_hours), slotMinutes: d.slot_minutes
  };
}

export function ratingOf(doctorId) {
  const r = one('SELECT COUNT(*) AS n, AVG(rating) AS avg FROM reviews WHERE doctor_id = ? AND is_hidden = 0', doctorId);
  return { count: r.n, avg: r.n ? Math.round(r.avg * 10) / 10 : null };
}
/** Public doctor card: no phone, no internal notes. */
export function doctorPublic(row) {
  const r = ratingOf(row.user_id);
  const served = one("SELECT (SELECT COUNT(*) FROM diagnoses WHERE doctor_id = ?) + (SELECT COUNT(*) FROM appointments WHERE doctor_id = ? AND status = 'DONE') AS n", row.user_id, row.user_id).n;
  return {
    id: row.user_id, fullName: row.full_name, specialty: row.specialty, specialtyId: row.specialty_id, experienceYears: row.experience_years, licenseNumber: row.license_number,
    clinicName: row.clinic_name, clinicAddress: row.clinic_address, clinicLat: row.clinic_lat, clinicLng: row.clinic_lng, priceOnline: row.price_online, priceVisit: row.price_visit, bio: row.bio,
    presence: effectivePresence(row.presence, row.presence_at), rating: r.avg, reviews: r.count, served, photo: photoV(row.user_id), workHours: workHours(row.work_hours), slotMinutes: row.slot_minutes
  };
}
export const DOCTOR_PUBLIC_SQL = `SELECT d.*, u.full_name, s.name AS specialty FROM doctor_profiles d JOIN users u ON u.id = d.user_id JOIN specialties s ON s.id = d.specialty_id
  WHERE d.verification_status = 'VERIFIED' AND u.is_active = 1`;
export function requireVerifiedDoctor(ctx) {
  const d = doctorProfile(ctx.user.id);
  if (!d || d.status !== 'VERIFIED') throw new HttpError(403, 'Litsenziyangiz hali tasdiqlanmagan');
  return d;
}

export function loadConsultation(id) {
  const c = one('SELECT * FROM consultations WHERE id = ? AND is_deleted = 0', Number(id));
  if (!c) throw notFound('Murojaat topilmadi');
  return c;
}
/** A consultation addressed to a specific doctor stays with them — unless it is urgent. */
export const canTake = (doctorId, c) => c.requested_doctor_id == null || c.requested_doctor_id === doctorId || c.severity === 'RED';

/** Object-level access check (prevents IDOR). Admins do not read medical content. */
export function assertCanView(user, c) {
  if (user.role === 'PATIENT' && c.patient_id === user.id) return 'patient';
  if (user.role === 'DOCTOR') {
    const d = doctorProfile(user.id);
    if (d && d.status === 'VERIFIED') {
      if (c.doctor_id === user.id) return 'doctor';
      if (c.doctor_id == null && ['NEW', 'AI_DRAFTED'].includes(c.status) && canTake(user.id, c)) return 'doctor-preview';
    }
  }
  throw forbidden('Bu murojaatga ruxsatingiz yo‘q');
}

export function prescriptionDto(rx) {
  if (!rx) return null;
  const items = all(`SELECT i.*, m.name, m.form, m.strength, m.code, m.photo_name AS photoName, m.photo_updated_at AS photoAt FROM prescription_items i JOIN medicines m ON m.id = i.medicine_id WHERE i.prescription_id = ? ORDER BY i.id`, rx.id)
    .map((i) => ({ id: i.id, medicineId: i.medicine_id, code: i.code, name: i.name, form: i.form, strength: i.strength, doseMg: i.dose_mg, dosage: i.dosage_text, timesPerDay: i.times_per_day, days: i.duration_days, instructions: i.instructions, photo: i.photoName ? i.photoAt : null }));
  const expired = rx.status === 'ACTIVE' && rx.valid_until < Date.now();
  return {
    id: rx.id, number: rx.number, code: rx.verify_code, issuedAt: rx.issued_at, validUntil: rx.valid_until,
    status: rx.status === 'CANCELLED' ? 'CANCELLED' : expired ? 'EXPIRED' : 'ACTIVE', cancelReason: rx.cancel_reason, doctorId: rx.doctor_id,
    dispensedAt: rx.dispensed_at || null, dispensedBy: rx.dispensed_by || null,
    items, verifyUrl: verifyUrl(rx.verify_code), qrSvg: qrSvg(verifyUrl(rx.verify_code))
  };
}

export function consultationDto(c, access) {
  const segs = all('SELECT segment_code AS code, pain_level AS pain, symptom_type AS kind, duration_idx AS dur FROM consultation_segments WHERE consultation_id = ? ORDER BY pain_level DESC', c.id);
  const spec = one('SELECT name FROM specialties WHERE id = ?', c.specialty_id);
  const files = all('SELECT id, original_name AS name, mime, size_bytes AS size FROM attachments WHERE consultation_id = ? ORDER BY id', c.id);
  const out = {
    id: c.id, status: c.status, severity: c.severity, triageReasons: json(c.triage_reasons, []), specialty: spec ? spec.name : '',
    complaint: c.complaint, symptoms: json(c.symptoms, []), flags: json(c.flags, []), temperature: c.temperature,
    segments: segs, files, createdAt: c.created_at, updatedAt: c.updated_at, closedAt: c.closed_at,
    referredAt: c.referred_at || null, referralNote: c.referral_note || '',
    patient: json(c.patient_snapshot, {}), doctor: null, diagnosis: null, prescription: null, ai: null
  };
  const docInfo = (id) => {
    const d = one('SELECT u.full_name, s.name AS specialty, dp.license_number, dp.experience_years FROM users u JOIN doctor_profiles dp ON dp.user_id = u.id JOIN specialties s ON s.id = dp.specialty_id WHERE u.id = ?', id);
    return d ? { id, fullName: d.full_name, specialty: d.specialty, licenseNumber: d.license_number, experienceYears: d.experience_years, photo: photoV(id) } : null;
  };
  if (c.doctor_id) out.doctor = docInfo(c.doctor_id);
  out.requestedDoctor = c.requested_doctor_id && c.requested_doctor_id !== c.doctor_id ? docInfo(c.requested_doctor_id) : null;
  if (access === 'patient') {
    const rv = one('SELECT rating, comment, created_at FROM reviews WHERE consultation_id = ?', c.id);
    out.review = rv ? { rating: rv.rating, comment: rv.comment, createdAt: rv.created_at } : null;
  }
  if (access !== 'patient') out.patientPhoto = photoV(c.patient_id);
  out.patientId = access === 'doctor' ? c.patient_id : undefined;
  const dx = one('SELECT * FROM diagnoses WHERE consultation_id = ?', c.id);
  if (dx) {
    out.diagnosis = { id: dx.id, icd10: dx.icd10_code, title: dx.title, description: dx.description, recommendations: dx.recommendations, redFlags: json(dx.red_flags, []), createdAt: dx.created_at };
    out.prescription = prescriptionDto(one('SELECT * FROM prescriptions WHERE diagnosis_id = ? ORDER BY id DESC LIMIT 1', dx.id));
  }
  if (access === 'doctor' || access === 'doctor-preview') {
    const ai = one('SELECT * FROM ai_suggestions WHERE consultation_id = ?', c.id);
    if (ai) out.ai = { id: ai.id, source: ai.source, model: ai.model_name, draft: json(ai.draft_json, {}), kept: json(ai.kept_json, []), removed: json(ai.removed_json, []), status: ai.review_status, note: ai.doctor_note, createdAt: ai.created_at };
  }
  if (access === 'doctor-preview') { out.patient = { ...out.patient, phone: undefined }; }
  return out;
}

export const medicinesAll = () => all('SELECT * FROM medicines ORDER BY name').map(medicineRow);
