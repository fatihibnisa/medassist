import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { one, run, now } from '../db.js';
import { bad, forbidden, notFound } from '../http.js';
import { audit } from '../auth.js';
import { assertCanView, loadConsultation, userDto } from '../dto.js';

/** Validates by magic bytes, not by the client-supplied type. */
export function detectFile(buf) {
  if (!buf || !buf.length) throw bad('Fayl bo‘sh');
  if (buf.length > config.maxUploadBytes) throw bad('Fayl hajmi 10 MB dan oshmasin');
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: '.jpg' };
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: '.png' };
  if (buf.slice(0, 5).toString('latin1') === '%PDF-') return { mime: 'application/pdf', ext: '.pdf' };
  throw bad('Faqat jpg, png yoki pdf fayl yuklash mumkin');
}

/** Who may see a user's profile photo: doctors' photos are public; a patient's only to themselves, admins and their doctors. */
function canSeePhoto(viewer, ownerId) {
  const owner = one('SELECT role FROM users WHERE id = ?', ownerId);
  if (!owner) return false;
  if (owner.role !== 'PATIENT') return true;
  if (!viewer) return false;
  if (viewer.id === ownerId || viewer.role === 'ADMIN') return true;
  if (viewer.role !== 'DOCTOR') return false;
  return !!one(`SELECT 1 FROM consultations WHERE patient_id = ? AND (doctor_id = ? OR requested_doctor_id = ? OR (doctor_id IS NULL AND status IN ('NEW','AI_DRAFTED')))
    UNION SELECT 1 FROM appointments WHERE patient_id = ? AND doctor_id = ? LIMIT 1`, ownerId, viewer.id, viewer.id, ownerId, viewer.id);
}

export default function fileRoutes(r) {
  r.post('/me/photo', { auth: true, raw: true }, (ctx) => {
    const f = detectFile(ctx.raw);
    if (!f.mime.startsWith('image/')) throw bad('Rasm jpg yoki png bo‘lishi kerak');
    if (ctx.raw.length > 3 * 1048576) throw bad('Rasm 3 MB dan oshmasin');
    const stored = 'photo-' + crypto.randomBytes(12).toString('hex') + f.ext;
    fs.writeFileSync(path.join(config.uploadDir, stored), ctx.raw, { mode: 0o640 });
    const old = one('SELECT stored_name FROM user_photos WHERE user_id = ?', ctx.user.id);
    run('INSERT INTO user_photos (user_id, stored_name, mime, size_bytes, updated_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET stored_name = excluded.stored_name, mime = excluded.mime, size_bytes = excluded.size_bytes, updated_at = excluded.updated_at',
      ctx.user.id, stored, f.mime, ctx.raw.length, now());
    if (old) fs.rm(path.join(config.uploadDir, old.stored_name), { force: true }, () => {});
    audit(ctx, 'PHOTO_UPLOAD', 'user', ctx.user.id);
    return userDto(ctx.user.id);
  });

  r.delete('/me/photo', { auth: true }, (ctx) => {
    const old = one('SELECT stored_name FROM user_photos WHERE user_id = ?', ctx.user.id);
    if (old) { run('DELETE FROM user_photos WHERE user_id = ?', ctx.user.id); fs.rm(path.join(config.uploadDir, old.stored_name), { force: true }, () => {}); }
    return userDto(ctx.user.id);
  });

  // <img> tags cannot send the bearer token, so patient photos are fetched as blobs by the app; doctor photos load directly.
  r.get('/users/:id/photo', (ctx) => {
    const id = Number(ctx.params.id);
    const p = one('SELECT * FROM user_photos WHERE user_id = ?', id);
    if (!p) throw notFound('Rasm yo‘q');
    if (!canSeePhoto(ctx.user, id)) throw forbidden();
    const file = path.join(config.uploadDir, p.stored_name);
    if (!fs.existsSync(file)) throw notFound('Rasm topilmadi');
    const isPublic = one('SELECT role FROM users WHERE id = ?', id).role !== 'PATIENT';
    ctx.res.writeHead(200, { 'Content-Type': p.mime, 'Content-Length': p.size_bytes, 'Cache-Control': (isPublic ? 'public' : 'private') + ', max-age=86400', 'Content-Security-Policy': "default-src 'none'; sandbox" });
    fs.createReadStream(file).pipe(ctx.res);
  });

  // Medicine photos are reference images (a box/pack), not patient data — public like a doctor's photo.
  r.get('/medicines/:id/photo', (ctx) => {
    const m = one('SELECT photo_name, photo_mime FROM medicines WHERE id = ?', Number(ctx.params.id));
    if (!m || !m.photo_name) throw notFound('Rasm yo‘q');
    const file = path.join(config.uploadDir, m.photo_name);
    if (!fs.existsSync(file)) throw notFound('Rasm topilmadi');
    ctx.res.writeHead(200, { 'Content-Type': m.photo_mime, 'Cache-Control': 'public, max-age=86400', 'Content-Security-Policy': "default-src 'none'; sandbox" });
    fs.createReadStream(file).pipe(ctx.res);
  });

  r.get('/attachments/:id', { auth: true }, (ctx) => {
    const a = one('SELECT * FROM attachments WHERE id = ?', Number(ctx.params.id));
    if (!a) throw notFound('Fayl topilmadi');
    if (a.kind === 'LICENSE') {
      if (!(ctx.user.role === 'ADMIN' || ctx.user.id === a.owner_id)) throw forbidden();
    } else {
      assertCanView(ctx.user, loadConsultation(a.consultation_id));
    }
    const file = path.join(config.uploadDir, a.stored_name);
    if (!fs.existsSync(file)) throw notFound('Fayl serverda topilmadi');
    const safeName = a.original_name.replace(/[^\w.\-() ]+/g, '_');
    ctx.res.writeHead(200, {
      'Content-Type': a.mime,
      'Content-Length': a.size_bytes,
      'Content-Disposition': 'inline; filename="' + safeName + '"',
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox"
    });
    fs.createReadStream(file).pipe(ctx.res);
  });
}
