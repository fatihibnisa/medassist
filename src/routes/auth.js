import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { one, all, run, insert, now, tx } from '../db.js';
import { HttpError, bad, conflict, rateLimit, str, intIn, normPhone, validPassword } from '../http.js';
import { hashPassword, verifyPassword, issueSession, rotateSession, endSession, createOtp, consumeOtp, sendSms, audit } from '../auth.js';
import { userDto, doctorProfile, idCardText } from '../dto.js';
import { detectFile } from './files.js';
import { qrSvg } from '../documents.js';

const BLOOD = ['O(I)+', 'O(I)−', 'A(II)+', 'A(II)−', 'B(III)+', 'B(III)−', 'AB(IV)+', 'AB(IV)−', ''];

function patientProfileInput(p) {
  p = p || {};
  const year = new Date().getFullYear();
  const birthYear = intIn(p.birthYear, 1900, year, 'Tug‘ilgan yil');
  const gender = p.gender === 'F' ? 'F' : p.gender === 'M' ? 'M' : null;
  if (!gender) throw bad('Jinsni tanlang');
  const bloodType = BLOOD.includes(p.bloodType || '') ? (p.bloodType || '') : '';
  return {
    birthYear, gender, bloodType,
    allergies: str(p.allergies, { max: 300, field: 'Allergiya' }),
    chronic: str(p.chronic, { max: 300, field: 'Surunkali kasalliklar' }),
    pregnant: gender === 'F' && !!p.pregnant,
    address: str(p.address, { max: 300, field: 'Yashash manzili' }),
    emergencyContact: str(p.emergencyContact, { max: 120, field: 'Yaqin kishi telefoni' })
  };
}

export default function authRoutes(r) {
  r.post('/auth/otp', async (ctx) => {
    const phone = normPhone(ctx.body.phone);
    const purpose = ctx.body.purpose === 'RESET' ? 'RESET' : 'REGISTER';
    const exists = one('SELECT id FROM users WHERE phone = ?', phone);
    if (purpose === 'REGISTER' && exists) throw conflict('Bu raqam allaqachon ro‘yxatdan o‘tgan. Kirish sahifasidan foydalaning');
    if (!rateLimit('otp:' + phone, 3, 3600000) || !rateLimit('otp-ip:' + ctx.ip, 10, 3600000)) throw new HttpError(429, 'Juda ko‘p so‘rov. 1 soatdan keyin urinib ko‘ring');
    // Password reset never reveals whether a number is registered: same answer, no SMS.
    if (purpose === 'RESET' && !exists) return { sent: true, expiresIn: 120 };
    const code = createOtp(phone, purpose);
    try { await sendSms(phone, 'MedAssist tasdiqlash kodi: ' + code + '. Kodni hech kimga bermang.'); }
    catch (e) { console.error('[sms]', e.message); throw new HttpError(502, 'SMS yuborib bo‘lmadi. Birozdan keyin urinib ko‘ring'); }
    return { sent: true, expiresIn: 120, devCode: config.showDevOtp ? code : undefined };
  });

  r.post('/auth/register', async (ctx) => {
    const b = ctx.body;
    const role = b.role === 'DOCTOR' ? 'DOCTOR' : 'PATIENT';
    const phone = normPhone(b.phone);
    const password = validPassword(b.password);
    const fullName = str(b.fullName, { min: 3, max: 120, field: 'F.I.Sh.', required: true });
    let prof = null, doc = null;
    if (role === 'PATIENT') prof = patientProfileInput(b.patient);
    else {
      const d = b.doctor || {};
      const spec = one('SELECT id FROM specialties WHERE id = ?', Number(d.specialtyId));
      if (!spec) throw bad('Mutaxassislikni tanlang');
      const license = str(d.licenseNumber, { min: 4, max: 40, field: 'Litsenziya raqami', required: true }).toUpperCase();
      if (!/^[A-Z0-9-]{4,40}$/.test(license)) throw bad('Litsenziya raqamida faqat harf, raqam va “-” bo‘lsin');
      if (one('SELECT user_id FROM doctor_profiles WHERE license_number = ?', license)) throw conflict('Bu litsenziya raqami allaqachon ro‘yxatda');
      doc = { specialtyId: spec.id, license, exp: intIn(d.experienceYears || 0, 0, 70, 'Tajriba') };
    }
    if (one('SELECT id FROM users WHERE phone = ?', phone)) throw conflict('Bu raqam allaqachon ro‘yxatdan o‘tgan');
    consumeOtp(phone, 'REGISTER', b.code);
    const hash = await hashPassword(password);
    const id = tx(() => {
      const uid = insert('INSERT INTO users (role, full_name, phone, password_hash, created_at, updated_at) VALUES (?,?,?,?,?,?)', role, fullName, phone, hash, now(), now());
      if (prof) insert('INSERT INTO patient_profiles (user_id, birth_year, gender, blood_type, allergies, chronic_diseases, pregnant, address, emergency_contact, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)', uid, prof.birthYear, prof.gender, prof.bloodType, prof.allergies, prof.chronic, prof.pregnant, prof.address, prof.emergencyContact, now());
      if (doc) insert('INSERT INTO doctor_profiles (user_id, specialty_id, license_number, experience_years) VALUES (?,?,?,?)', uid, doc.specialtyId, doc.license, doc.exp);
      return uid;
    });
    ctx.user = { id, role };
    audit(ctx, 'REGISTER', 'user', id, role);
    const accessToken = issueSession(ctx, { id, role });
    return { accessToken, user: userDto(id) };
  }, { status: 201 });

  r.post('/auth/login', async (ctx) => {
    if (!rateLimit('login-ip:' + ctx.ip, 20, 600000)) throw new HttpError(429, 'Juda ko‘p urinish. 10 daqiqadan keyin qayta urinib ko‘ring');
    const phone = normPhone(ctx.body.phone);
    const u = one('SELECT * FROM users WHERE phone = ?', phone);
    const fail = 'Telefon raqam yoki parol noto‘g‘ri';
    if (!u) { await hashPassword('timing-equalizer'); throw new HttpError(401, fail); }
    if (u.locked_until && u.locked_until > now()) throw new HttpError(423, 'Akkaunt vaqtincha bloklangan. ' + Math.ceil((u.locked_until - now()) / 60000) + ' daqiqadan keyin urinib ko‘ring');
    if (!u.is_active) throw new HttpError(403, 'Akkaunt o‘chirilgan. Administrator bilan bog‘laning');
    if (!(await verifyPassword(ctx.body.password, u.password_hash))) {
      const n = u.failed_attempts + 1;
      run('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?', n >= 5 ? 0 : n, n >= 5 ? now() + 15 * 60000 : null, u.id);
      ctx.user = { id: u.id };
      audit(ctx, 'LOGIN_FAILED', 'user', u.id, n >= 5 ? 'locked 15 min' : 'attempt ' + n);
      throw new HttpError(401, n >= 5 ? 'Parol 5 marta noto‘g‘ri kiritildi. Akkaunt 15 daqiqaga bloklandi' : fail);
    }
    run('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?', u.id);
    ctx.user = { id: u.id, role: u.role };
    audit(ctx, 'LOGIN', 'user', u.id);
    return { accessToken: issueSession(ctx, u), user: userDto(u.id) };
  });

  r.post('/auth/refresh', (ctx) => {
    const { user, access } = rotateSession(ctx);
    return { accessToken: access, user: userDto(user.id) };
  });

  r.post('/auth/logout', (ctx) => { endSession(ctx); return { ok: true }; });

  r.post('/auth/reset', async (ctx) => {
    const phone = normPhone(ctx.body.phone);
    const password = validPassword(ctx.body.password);
    const u = one('SELECT id FROM users WHERE phone = ?', phone);
    if (!u) throw bad('Kod noto‘g‘ri');
    consumeOtp(phone, 'RESET', ctx.body.code);
    run('UPDATE users SET password_hash = ?, failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?', await hashPassword(password), now(), u.id);
    run('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?', u.id);
    ctx.user = { id: u.id };
    audit(ctx, 'PASSWORD_RESET', 'user', u.id);
    return { ok: true };
  });

  r.get('/me', { auth: true }, (ctx) => userDto(ctx.user.id));

  /** QR for the profile ID card — encodes exactly the facts already printed on the card, nothing extra. */
  r.get('/me/qr', { auth: true }, (ctx) => ({ svg: qrSvg(idCardText(userDto(ctx.user.id)), 'Tibbiy ID karta QR kodi') }));

  r.put('/me/profile', { auth: ['PATIENT'] }, (ctx) => {
    const p = patientProfileInput(ctx.body);
    const fullName = str(ctx.body.fullName, { min: 3, max: 120, field: 'F.I.Sh.', required: true });
    tx(() => {
      run('UPDATE users SET full_name = ?, updated_at = ? WHERE id = ?', fullName, now(), ctx.user.id);
      run('UPDATE patient_profiles SET birth_year = ?, gender = ?, blood_type = ?, allergies = ?, chronic_diseases = ?, pregnant = ?, address = ?, emergency_contact = ?, updated_at = ? WHERE user_id = ?',
        p.birthYear, p.gender, p.bloodType, p.allergies, p.chronic, p.pregnant, p.address, p.emergencyContact, now(), ctx.user.id);
    });
    audit(ctx, 'PROFILE_UPDATE', 'user', ctx.user.id);
    return userDto(ctx.user.id);
  });

  // Name change for roles without a medical profile form (administrators).
  r.put('/me/basic', { auth: ['ADMIN'] }, (ctx) => {
    const fullName = str(ctx.body.fullName, { min: 3, max: 120, field: 'F.I.Sh.', required: true });
    run('UPDATE users SET full_name = ?, updated_at = ? WHERE id = ?', fullName, now(), ctx.user.id);
    audit(ctx, 'PROFILE_UPDATE', 'user', ctx.user.id);
    return userDto(ctx.user.id);
  });

  r.put('/me/password', { auth: true }, async (ctx) => {
    const u = one('SELECT password_hash FROM users WHERE id = ?', ctx.user.id);
    if (!(await verifyPassword(ctx.body.current, u.password_hash))) throw bad('Joriy parol noto‘g‘ri');
    const next = validPassword(ctx.body.next);
    run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', await hashPassword(next), now(), ctx.user.id);
    // Every other device is signed out; this one gets a fresh session.
    run('UPDATE refresh_tokens SET revoked = 1, revoked_at = COALESCE(revoked_at, ?) WHERE user_id = ? AND revoked = 0', now(), ctx.user.id);
    audit(ctx, 'PASSWORD_CHANGE', 'user', ctx.user.id);
    return { ok: true, accessToken: issueSession(ctx, ctx.user) };
  });

  // Doctor uploads a license scan (jpg/png/pdf ≤ 10 MB) for admin verification.
  r.post('/me/license', { auth: ['DOCTOR'], raw: true }, (ctx) => {
    const d = doctorProfile(ctx.user.id);
    if (!d) throw bad('Shifokor profili topilmadi');
    const f = detectFile(ctx.raw);
    const name = str(decodeURIComponent(String(ctx.req.headers['x-file-name'] || 'litsenziya')), { max: 120, field: 'Fayl nomi' }) || 'litsenziya';
    const stored = crypto.randomBytes(16).toString('hex') + f.ext;
    fs.writeFileSync(path.join(config.uploadDir, stored), ctx.raw, { mode: 0o640 });
    const id = insert('INSERT INTO attachments (owner_id, kind, original_name, stored_name, mime, size_bytes, created_at) VALUES (?,?,?,?,?,?,?)', ctx.user.id, 'LICENSE', name, stored, f.mime, ctx.raw.length, now());
    run('UPDATE doctor_profiles SET license_file_id = ? WHERE user_id = ?', id, ctx.user.id);
    audit(ctx, 'LICENSE_UPLOAD', 'attachment', id);
    return userDto(ctx.user.id);
  }, { status: 201 });

  r.get('/notifications', { auth: true }, (ctx) => {
    const unread = one('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0', ctx.user.id).n;
    const limit = Math.min(200, Math.max(1, Number(ctx.query.get('limit')) || 40));
    const items = all('SELECT id, type, content, link, is_read AS isRead, created_at AS createdAt FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?', ctx.user.id, limit)
      .map((n) => ({ ...n, isRead: !!n.isRead }));
    return { unread, items };
  });

  r.post('/notifications/:id/read', { auth: true }, (ctx) => {
    run('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', Number(ctx.params.id), ctx.user.id);
    return { ok: true };
  });

  r.post('/notifications/read-all', { auth: true }, (ctx) => {
    run('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0', ctx.user.id);
    return { ok: true };
  });
}
