// End-to-end API tests. Runs a real server on a temp database: `npm test`
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = 'http://127.0.0.1:' + PORT + '/api/v1';
let proc, dataDir;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'medassist-test-'));
  proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.js'], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: dataDir, NODE_ENV: 'test', DEMO_SEED: 'true', SMS_PROVIDER: 'console', ANTHROPIC_API_KEY: '', JWT_SECRET: 'x'.repeat(48) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let err = ''; proc.stderr.on('data', (d) => { err += d; });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(BASE + '/health'); if (r.ok) return; } catch { /* wait */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start: ' + err);
});
// Wait for the server to exit before deleting its directory: Windows refuses to remove an open SQLite file.
after(async () => {
  const exited = new Promise((r) => proc.once('exit', r));
  proc.kill('SIGTERM');
  await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
  fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

async function call(method, url, { token, body, raw, headers = {}, cookie } = {}) {
  const h = { ...headers };
  if (token) h.authorization = 'Bearer ' + token;
  if (cookie) h.cookie = cookie;
  if (body !== undefined) h['content-type'] = 'application/json';
  const r = await fetch(BASE + url, { method, headers: h, body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined });
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer());
  return { status: r.status, data, headers: r.headers };
}
const login = async (phone) => {
  const r = await call('POST', '/auth/login', { body: { phone, password: 'Demo12345' } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.accessToken;
};

const S = {};

test('health + catalog', async () => {
  assert.equal((await call('GET', '/health')).status, 200);
  const c = await call('GET', '/catalog');
  assert.ok(c.data.medicines.length >= 10);
  assert.ok(c.data.specialties.find((s) => s.name === 'Terapevt'));
  S.catalog = c.data;
});

test('patient registration with OTP', async () => {
  const bad = await call('POST', '/auth/otp', { body: { phone: '12345', purpose: 'REGISTER' } });
  assert.equal(bad.status, 400);
  const otp = await call('POST', '/auth/otp', { body: { phone: '+998 93 555 44 33', purpose: 'REGISTER' } });
  assert.equal(otp.status, 200); assert.match(otp.data.devCode, /^\d{6}$/);
  const wrong = await call('POST', '/auth/register', { body: { role: 'PATIENT', phone: '935554433', code: '000000', password: 'Parol1234', fullName: 'Test Bemor', patient: { birthYear: 1990, gender: 'M', allergies: 'ibuprofen' } } });
  assert.equal(wrong.status, 400);
  const weak = await call('POST', '/auth/register', { body: { role: 'PATIENT', phone: '935554433', code: otp.data.devCode, password: 'short', fullName: 'Test Bemor', patient: { birthYear: 1990, gender: 'M' } } });
  assert.equal(weak.status, 400);
  const ok = await call('POST', '/auth/register', { body: { role: 'PATIENT', phone: '935554433', code: otp.data.devCode, password: 'Parol1234', fullName: 'Test Bemor', patient: { birthYear: 1990, gender: 'M', allergies: 'ibuprofen' } } });
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  assert.equal(ok.data.user.patient.allergies, 'ibuprofen');
  assert.match(ok.headers.get('set-cookie'), /ma_rt=.*HttpOnly/);
  S.patientToken = ok.data.accessToken;
  S.refreshCookie = ok.headers.get('set-cookie').split(';')[0];
  const dup = await call('POST', '/auth/otp', { body: { phone: '935554433', purpose: 'REGISTER' } });
  assert.equal(dup.status, 409);
});

test('refresh token rotation and reuse detection', async () => {
  const r1 = await call('POST', '/auth/refresh', { cookie: S.refreshCookie });
  assert.equal(r1.status, 200); assert.ok(r1.data.accessToken);
  const reuse = await call('POST', '/auth/refresh', { cookie: S.refreshCookie });
  assert.equal(reuse.status, 401);
});

test('auth guards', async () => {
  assert.equal((await call('GET', '/me')).status, 401);
  assert.equal((await call('GET', '/me', { token: 'abc.def.ghi' })).status, 401);
  assert.equal((await call('GET', '/admin/stats', { token: S.patientToken })).status, 403);
  assert.equal((await call('GET', '/doctor/queue', { token: S.patientToken })).status, 403);
});

test('login lockout after 5 wrong passwords', async () => {
  for (let i = 0; i < 4; i++) assert.equal((await call('POST', '/auth/login', { body: { phone: '900000010', password: 'wrong1234' } })).status, 401);
  assert.equal((await call('POST', '/auth/login', { body: { phone: '900000010', password: 'wrong1234' } })).status, 401);
  const locked = await call('POST', '/auth/login', { body: { phone: '900000010', password: 'Demo12345' } });
  assert.equal(locked.status, 423);
});

test('GREEN consultation → rule draft → doctor approve → prescription', async () => {
  const bad = await call('POST', '/consultations', { token: S.patientToken, body: { segments: [] } });
  assert.equal(bad.status, 400);
  const badPain = await call('POST', '/consultations', { token: S.patientToken, body: { segments: [{ code: 'throat', pain: 11, kind: 'burn', dur: 1 }] } });
  assert.equal(badPain.status, 400);
  const c = await call('POST', '/consultations', { token: S.patientToken, body: { segments: [{ code: 'lowL', pain: 4, kind: 'dull', dur: 1 }], symptoms: ['weak'], temperature: '36,8', complaint: 'Bel og‘riydi' } });
  assert.equal(c.status, 201, JSON.stringify(c.data));
  assert.equal(c.data.severity, 'GREEN');
  assert.equal(c.data.specialty, 'Travmatolog');
  assert.equal(c.data.ai, null, 'patient must never see AI draft');
  S.cid = c.data.id;

  // attachment: valid PNG, then a fake exe rejected
  const png = Buffer.from('89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000A49444154789C6360000002000154A24F5D0000000049454E44AE426082', 'hex');
  const up = await call('POST', '/consultations/' + S.cid + '/attachments', { token: S.patientToken, raw: png, headers: { 'content-type': 'image/png', 'x-file-name': encodeURIComponent('tahlil.png') } });
  assert.equal(up.status, 201, JSON.stringify(up.data));
  S.fileId = up.data.id;
  const exe = await call('POST', '/consultations/' + S.cid + '/attachments', { token: S.patientToken, raw: Buffer.from('MZ\x90\x00 fake'), headers: { 'x-file-name': 'virus.exe' } });
  assert.equal(exe.status, 400);

  await new Promise((r) => setTimeout(r, 300)); // background draft
  const doc = await login('900000001'); S.docToken = doc;
  const q = await call('GET', '/doctor/queue?filter=mine', { token: doc });
  assert.equal(q.status, 200);
  const item = q.data.items.find((x) => x.id === S.cid);
  assert.ok(item, 'Terapevt sees all specialties');
  assert.equal(item.aiPending, true);

  const preview = await call('GET', '/consultations/' + S.cid, { token: doc });
  assert.equal(preview.status, 200);
  assert.equal(preview.data.patient.phone, undefined, 'preview hides phone');
  assert.ok(preview.data.ai);
  assert.equal(preview.data.ai.source, 'RULES');
  // ibuprofen must be removed: patient is allergic
  assert.ok(preview.data.ai.removed.some((m) => m.medicineCode === 'IBUPROFEN_200' && /Allergiya/.test(m.reason)));
  assert.ok(!preview.data.ai.kept.some((m) => m.medicineCode === 'IBUPROFEN_200'));

  // doctor 2 cannot write before assigning; doctor 1 assigns
  assert.equal((await call('POST', '/consultations/' + S.cid + '/messages', { token: doc, body: { content: 'salom' } })).status, 403);
  const as = await call('POST', '/consultations/' + S.cid + '/assign', { token: doc });
  assert.equal(as.status, 200); assert.equal(as.data.status, 'ASSIGNED');
  const doc2 = await login('900000002');
  assert.equal((await call('POST', '/consultations/' + S.cid + '/assign', { token: doc2 })).status, 409);
  assert.equal((await call('GET', '/consultations/' + S.cid, { token: doc2 })).status, 403, 'IDOR: other doctor blocked');

  // chat
  const m1 = await call('POST', '/consultations/' + S.cid + '/messages', { token: doc, body: { content: 'Og‘riq qachon kuchayadi?' } });
  assert.equal(m1.status, 201);
  const m2 = await call('POST', '/consultations/' + S.cid + '/messages', { token: S.patientToken, body: { content: 'Ertalab' } });
  assert.equal(m2.status, 201);
  const list = await call('GET', '/consultations/' + S.cid + '/messages', { token: S.patientToken });
  assert.equal(list.data.length, 2);

  // file download authorization
  const f = await call('GET', '/attachments/' + S.fileId, { token: doc });
  assert.equal(f.status, 200); assert.equal(f.headers.get('content-type'), 'image/png');
  assert.equal((await call('GET', '/attachments/' + S.fileId, { token: doc2 })).status, 403);

  // diagnosis with an allergy conflict is blocked
  const ibu = S.catalog.medicines.find((m) => m.code === 'IBUPROFEN_200');
  const para = S.catalog.medicines.find((m) => m.code === 'PARACETAMOL_500');
  const gel = S.catalog.medicines.find((m) => m.code === 'DICLOFENAC_GEL');
  const blocked = await call('POST', '/consultations/' + S.cid + '/diagnosis', { token: doc, body: { icd10: 'M54.5', title: 'Bel og‘rig‘i', items: [{ medicineId: ibu.id, doseMg: 200, timesPerDay: 3, durationDays: 5 }] } });
  assert.equal(blocked.status, 400); assert.match(blocked.data.message, /Allergiya/);
  const overdose = await call('POST', '/consultations/' + S.cid + '/diagnosis', { token: doc, body: { icd10: 'M54.5', title: 'Bel og‘rig‘i', items: [{ medicineId: para.id, doseMg: 1500, timesPerDay: 3, durationDays: 5 }] } });
  assert.equal(overdose.status, 400); assert.match(overdose.data.message, /Sutkalik doza/);
  const badIcd = await call('POST', '/consultations/' + S.cid + '/diagnosis', { token: doc, body: { icd10: 'XX', title: 'x' } });
  assert.equal(badIcd.status, 400);

  const dx = await call('POST', '/consultations/' + S.cid + '/diagnosis', { token: doc, body: {
    icd10: 'm54.5', title: 'Bel og‘rig‘i', description: 'Mexanik', recommendations: 'Yuring\nOg‘ir ko‘tarmang', redFlags: ['Oyoqda uvishish'], aiDecision: 'MODIFIED',
    items: [{ medicineId: para.id, doseMg: 500, timesPerDay: 3, durationDays: 3, instructions: 'Ovqatdan keyin' }, { medicineId: gel.id, dosage: 'yupqa qatlam', timesPerDay: 3, durationDays: 7 }] } });
  assert.equal(dx.status, 201, JSON.stringify(dx.data));
  assert.equal(dx.data.status, 'DIAGNOSED');
  assert.equal(dx.data.diagnosis.icd10, 'M54.5');
  assert.equal(dx.data.ai.status, 'MODIFIED');
  assert.equal(dx.data.prescription.items.length, 2);
  assert.match(dx.data.prescription.qrSvg, /^<svg/);
  S.rx = dx.data.prescription;
  assert.equal((await call('POST', '/consultations/' + S.cid + '/diagnosis', { token: doc, body: { icd10: 'M54.5', title: 'x' } })).status, 400, 'no second diagnosis');

  // patient view: sees diagnosis & prescription, never the AI
  const pv = await call('GET', '/consultations/' + S.cid, { token: S.patientToken });
  assert.equal(pv.data.ai, null);
  assert.equal(pv.data.prescription.number, S.rx.number);

  // PDF
  const pdf = await call('GET', '/prescriptions/' + S.rx.id + '/pdf', { token: S.patientToken });
  assert.equal(pdf.status, 200); assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.equal(pdf.data.slice(0, 5).toString(), '%PDF-');
  assert.equal((await call('GET', '/prescriptions/' + S.rx.id + '/pdf', { token: doc2 })).status, 403);

  // public verification
  const v = await call('GET', '/public/verify/' + S.rx.code.toLowerCase());
  assert.equal(v.data.status, 'VALID'); assert.equal(v.data.patient, 'T*** B***'); assert.equal(v.data.items.length, 2);
  assert.equal((await call('GET', '/public/verify/ZZZZZZZZ')).data.status, 'NOT_FOUND');

  // cancel
  assert.equal((await call('POST', '/prescriptions/' + S.rx.id + '/cancel', { token: doc2, body: { reason: 'xato' } })).status, 403);
  const cx = await call('POST', '/prescriptions/' + S.rx.id + '/cancel', { token: doc, body: { reason: 'Doza qayta ko‘rib chiqildi' } });
  assert.equal(cx.status, 200); assert.equal(cx.data.status, 'CANCELLED');
  assert.equal((await call('GET', '/public/verify/' + S.rx.code)).data.status, 'CANCELLED');

  // patient closes
  const cl = await call('POST', '/consultations/' + S.cid + '/close', { token: S.patientToken });
  assert.equal(cl.data.status, 'CLOSED');
  assert.equal((await call('POST', '/consultations/' + S.cid + '/messages', { token: S.patientToken, body: { content: 'yana' } })).status, 400);

  const n = await call('GET', '/notifications', { token: S.patientToken });
  assert.ok(n.data.unread >= 3);
});

test('RED consultation: AI disabled, urgent', async () => {
  const c = await call('POST', '/consultations', { token: S.patientToken, body: { segments: [{ code: 'chestL', pain: 6, kind: 'press', dur: 0 }, { code: 'uarmL', pain: 3, kind: 'numb', dur: 0 }], symptoms: ['sweat'] } });
  assert.equal(c.status, 201); assert.equal(c.data.severity, 'RED');
  await new Promise((r) => setTimeout(r, 200));
  const d = await call('GET', '/consultations/' + c.data.id, { token: S.docToken });
  assert.equal(d.data.ai, null);
  await call('POST', '/consultations/' + c.data.id + '/assign', { token: S.docToken });
  assert.equal((await call('POST', '/consultations/' + c.data.id + '/ai', { token: S.docToken })).status, 400);
});

test('YELLOW: AI never recommends medicines', async () => {
  const c = await call('POST', '/consultations', { token: S.patientToken, body: { segments: [{ code: 'throat', pain: 6, kind: 'burn', dur: 1 }], symptoms: ['fever'] } });
  assert.equal(c.data.severity, 'YELLOW');
  await new Promise((r) => setTimeout(r, 300));
  const d = await call('GET', '/consultations/' + c.data.id, { token: S.docToken });
  assert.equal(d.data.ai.kept.length, 0);
  assert.ok(d.data.ai.removed.length > 0);
  await call('POST', '/consultations/' + c.data.id + '/assign', { token: S.docToken });
  const rej = await call('POST', '/consultations/' + c.data.id + '/ai/reject', { token: S.docToken, body: { note: 'Ko‘rik kerak' } });
  assert.equal(rej.data.ai.status, 'REJECTED');
});

test('doctor registration → pending → admin verifies', async () => {
  const otp = await call('POST', '/auth/otp', { body: { phone: '977778899', purpose: 'REGISTER' } });
  const spec = S.catalog.specialties.find((s) => s.name === 'Kardiolog');
  const r = await call('POST', '/auth/register', { body: { role: 'DOCTOR', phone: '977778899', code: otp.data.devCode, password: 'Doktor2026', fullName: 'Yangi Shifokor', doctor: { specialtyId: spec.id, licenseNumber: 'uz-kr-0555', experienceYears: 7 } } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.user.doctor.status, 'PENDING');
  assert.equal(r.data.user.doctor.licenseNumber, 'UZ-KR-0555');
  const tok = r.data.accessToken;
  assert.equal((await call('GET', '/doctor/queue', { token: tok })).status, 403);
  const pdfBytes = Buffer.from('%PDF-1.4\n%test\n');
  const lic = await call('POST', '/me/license', { token: tok, raw: pdfBytes, headers: { 'x-file-name': 'litsenziya.pdf' } });
  assert.equal(lic.status, 201, JSON.stringify(lic.data));
  const admin = await login('900000099');
  const docs = await call('GET', '/admin/doctors', { token: admin });
  const mine = docs.data.find((d) => d.licenseNumber === 'UZ-KR-0555');
  assert.equal(mine.status, 'PENDING'); assert.ok(mine.licenseFileId);
  assert.equal((await call('GET', '/attachments/' + mine.licenseFileId, { token: admin })).status, 200);
  assert.equal((await call('PATCH', '/admin/doctors/' + mine.id, { token: admin, body: { status: 'VERIFIED' } })).status, 200);
  assert.equal((await call('GET', '/doctor/queue', { token: tok })).status, 200);
});

test('admin: stats, medicines toggle, users, audit', async () => {
  const admin = await login('900000099');
  const st = await call('GET', '/admin/stats', { token: admin });
  assert.ok(st.data.totals.consultations >= 3);
  assert.ok(st.data.bySeverity.RED >= 1);
  const meds = await call('GET', '/admin/medicines', { token: admin });
  const amb = meds.data.find((m) => m.code === 'AMBROXOL_30');
  assert.equal((await call('PATCH', '/admin/medicines/' + amb.id, { token: admin, body: { aiAllowed: false } })).status, 200);
  assert.equal((await call('GET', '/admin/medicines', { token: admin })).data.find((m) => m.id === amb.id).ai, false);
  const users = await call('GET', '/admin/users?q=Test', { token: admin });
  assert.ok(users.data.some((u) => u.fullName === 'Test Bemor'));
  const audit = await call('GET', '/admin/audit', { token: admin });
  assert.ok(audit.data.some((a) => a.action === 'DIAGNOSIS_CREATE'));
  assert.ok(audit.data.some((a) => a.action === 'VIEW_PATIENT_CARD'));
  assert.equal((await call('GET', '/consultations/' + S.cid, { token: admin })).status, 403, 'admin cannot read medical records');
});

test('password reset revokes sessions', async () => {
  const otp = await call('POST', '/auth/otp', { body: { phone: '935554433', purpose: 'RESET' } });
  assert.equal(otp.status, 200);
  const r = await call('POST', '/auth/reset', { body: { phone: '935554433', code: otp.data.devCode, password: 'YangiParol99' } });
  assert.equal(r.status, 200);
  assert.equal((await call('POST', '/auth/login', { body: { phone: '935554433', password: 'YangiParol99' } })).status, 200);
});

const PNG = Buffer.from('89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000A49444154789C6360000002000154A24F5D0000000049454E44AE426082', 'hex');

test('doctor directory: only verified, recommendation, specialty filter', async () => {
  const all = await call('GET', '/doctors');
  assert.equal(all.status, 200);
  assert.ok(all.data.length >= 6);
  assert.ok(!all.data.some((d) => d.licenseNumber === 'UZ-TV-0233'), 'pending doctor hidden');
  assert.ok(!all.data.some((d) => 'phone' in d), 'no phone numbers in public list');
  assert.equal(all.data.filter((d) => d.recommended).length, 1);
  const kard = await call('GET', '/doctors?specialty=Kardiolog');
  assert.ok(kard.data.length >= 1 && kard.data.every((d) => d.specialty === 'Kardiolog'));
  const one = await call('GET', '/doctors/' + kard.data[0].id);
  assert.equal(one.status, 200); assert.ok(one.data.clinicAddress); assert.equal(one.data.distribution.length, 5);
  S.kardId = kard.data[0].id;
});

test('doctor presence, schedule, profile edit (licence change → re-verification)', async () => {
  const derm = await login('900000007');
  const p = await call('PUT', '/doctor/presence', { token: derm, body: { presence: 'ONLINE' } });
  assert.equal(p.status, 200); assert.equal(p.data.doctor.presence, 'ONLINE');
  assert.equal((await call('PUT', '/doctor/presence', { token: derm, body: { presence: 'SLEEPING' } })).status, 400);
  assert.equal((await call('PUT', '/doctor/schedule', { token: derm, body: { workHours: { 1: { on: true, start: '25:00', end: '17:00' } }, slotMinutes: 30 } })).status, 400);
  assert.equal((await call('PUT', '/doctor/schedule', { token: derm, body: { workHours: {}, slotMinutes: 7 } })).status, 400);
  const wh = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, { on: true, start: '08:00', end: '20:00' }]));
  const sc = await call('PUT', '/doctor/schedule', { token: derm, body: { workHours: wh, slotMinutes: 20 } });
  assert.equal(sc.status, 200); assert.equal(sc.data.doctor.slotMinutes, 20);
  const me = (await call('GET', '/me', { token: derm })).data.doctor;
  const base = { fullName: 'Farrux Olimov', specialtyId: me.specialtyId, licenseNumber: me.licenseNumber, experienceYears: 7, clinicName: 'Yangi klinika', clinicAddress: 'Toshkent', priceOnline: 95000, priceVisit: 155000, bio: 'Tajribali dermatolog' };
  const keep = await call('PUT', '/doctor/profile', { token: derm, body: base });
  assert.equal(keep.status, 200, JSON.stringify(keep.data)); assert.equal(keep.data.reverify, false); assert.equal(keep.data.user.doctor.status, 'VERIFIED');
  assert.equal(keep.data.user.doctor.priceOnline, 95000);
  assert.equal((await call('PUT', '/doctor/profile', { token: derm, body: { ...base, priceOnline: -5 } })).status, 400);
  assert.equal((await call('PUT', '/doctor/profile', { token: derm, body: { ...base, licenseNumber: 'UZ-TR-0042' } })).status, 409, 'licence of another doctor');
  const changed = await call('PUT', '/doctor/profile', { token: derm, body: { ...base, licenseNumber: 'UZ-DR-0999' } });
  assert.equal(changed.data.reverify, true); assert.equal(changed.data.user.doctor.status, 'PENDING');
  assert.ok(!(await call('GET', '/doctors')).data.some((d) => d.licenseNumber === 'UZ-DR-0999'), 'unverified doctor leaves the directory');
});

test('offline appointment: slots, booking, double-booking, doctor queue, review', async () => {
  const slots = await call('GET', '/doctors/' + S.kardId + '/slots?days=7');
  assert.equal(slots.status, 200); assert.equal(slots.data.length, 7);
  // Prefer a slot later today: /doctor/stats' 30-day window only runs through the end of "today" (a forward
  // buffer for work completed so far today, not a general booking horizon), so a slot on a later day would make
  // the visitsDone assertion below time-dependent instead of deterministic.
  const free = slots.data[0].slots.find((s) => s.free) || slots.data.flatMap((d) => d.slots).find((s) => s.free);
  assert.ok(free, 'a free slot within a week');
  const sameDay = slots.data[0].slots.includes(free);
  assert.equal((await call('POST', '/appointments', { token: S.patientToken, body: { doctorId: S.kardId, startAt: free.startAt + 60000 } })).status, 400, 'off-grid time');
  const b = await call('POST', '/appointments', { token: S.patientToken, body: { doctorId: S.kardId, startAt: free.startAt, reason: 'Yurak sohasida noqulaylik', segments: ['chestL'] } });
  assert.equal(b.status, 201, JSON.stringify(b.data)); assert.equal(b.data.status, 'BOOKED'); assert.ok(b.data.doctor.clinicAddress);
  assert.equal((await call('POST', '/appointments', { token: S.patientToken, body: { doctorId: S.kardId, startAt: free.startAt } })).status, 409, 'slot taken');
  const after = await call('GET', '/doctors/' + S.kardId + '/slots?days=7');
  assert.equal(after.data.flatMap((d) => d.slots).find((s) => s.startAt === free.startAt).free, false);
  const kard = await login('900000004');
  const day = new Date(free.startAt); const key = day.getFullYear() + '-' + String(day.getMonth() + 1).padStart(2, '0') + '-' + String(day.getDate()).padStart(2, '0');
  const q = await call('GET', '/doctor/appointments?date=' + key, { token: kard });
  const mine = q.data.items.find((x) => x.id === b.data.id);
  assert.ok(mine); assert.equal(mine.queueNo, 1); assert.equal(mine.patient.fullName, 'Test Bemor');
  assert.equal((await call('PATCH', '/doctor/appointments/' + b.data.id, { token: kard, body: { status: 'DONE' } })).status, 400, 'cannot skip IN_PROGRESS');
  assert.equal((await call('PATCH', '/doctor/appointments/' + b.data.id, { token: S.docToken, body: { status: 'IN_PROGRESS' } })).status, 403, 'other doctor');
  assert.equal((await call('POST', '/reviews', { token: S.patientToken, body: { appointmentId: b.data.id, rating: 5 } })).status, 400, 'review before visit is done');
  assert.equal((await call('PATCH', '/doctor/appointments/' + b.data.id, { token: kard, body: { status: 'IN_PROGRESS' } })).data.status, 'IN_PROGRESS');
  const done = await call('PATCH', '/doctor/appointments/' + b.data.id, { token: kard, body: { status: 'DONE', note: 'EKG normal' } });
  assert.equal(done.data.status, 'DONE'); assert.equal(done.data.doctorNote, 'EKG normal');
  const rv = await call('POST', '/reviews', { token: S.patientToken, body: { appointmentId: b.data.id, rating: 5, comment: 'Juda e’tiborli shifokor' } });
  assert.equal(rv.status, 201);
  assert.equal((await call('POST', '/reviews', { token: S.patientToken, body: { appointmentId: b.data.id, rating: 1 } })).status, 409);
  const d = await call('GET', '/doctors/' + S.kardId);
  assert.equal(d.data.rating, 5); assert.equal(d.data.reviews, 1); assert.equal(d.data.reviewList[0].author, 'Test B.');
  const my = await call('GET', '/appointments/my', { token: S.patientToken });
  assert.equal(my.data[0].review.rating, 5);
  const st = await call('GET', '/doctor/stats?days=30', { token: kard });
  // visitsDone only counts through the end of "today" (see note above) — assert 1 only when the booked
  // slot actually falls today; a later day is still correctly reflected in the per-day report below.
  assert.equal(st.status, 200); assert.equal(st.data.totals.visitsDone, sameDay ? 1 : 0); assert.equal(st.data.rating.avg, 5);
  const rep = await call('GET', '/doctor/report?from=' + key + '&to=' + key, { token: kard });
  assert.equal(rep.status, 200); assert.equal(rep.data.totals.visitsDone, 1); assert.equal(rep.data.appointments.length, 1);
});

test('consultation addressed to a chosen doctor stays with them', async () => {
  const nev = (await call('GET', '/doctors?specialty=Nevrolog')).data[0];
  const c = await call('POST', '/consultations', { token: S.patientToken, body: { segments: [{ code: 'head', pain: 4, kind: 'pulse', dur: 1 }], doctorId: nev.id } });
  assert.equal(c.status, 201); assert.equal(c.data.specialty, 'Nevrolog');
  assert.equal((await call('POST', '/consultations', { token: S.patientToken, body: { segments: [{ code: 'head', pain: 4, kind: 'pulse', dur: 1 }], doctorId: 999999 } })).status, 400);
  const q1 = await call('GET', '/doctor/queue?filter=mine', { token: S.docToken });
  assert.ok(!q1.data.items.some((x) => x.id === c.data.id), 'Terapevt does not see a case addressed to the neurologist');
  assert.equal((await call('POST', '/consultations/' + c.data.id + '/assign', { token: S.docToken })).status, 403);
  assert.equal((await call('GET', '/consultations/' + c.data.id, { token: S.docToken })).status, 403);
  const doc2 = await login('900000002');
  const q2 = await call('GET', '/doctor/queue?filter=mine', { token: doc2 });
  assert.ok(q2.data.items.some((x) => x.id === c.data.id));
  assert.equal((await call('POST', '/consultations/' + c.data.id + '/assign', { token: doc2 })).status, 200);
});

test('pharmacy dispense → medication tracker schedule', async () => {
  const c = await call('POST', '/consultations', { token: S.patientToken, body: { segments: [{ code: 'throat', pain: 3, kind: 'burn', dur: 1 }] } });
  await call('POST', '/consultations/' + c.data.id + '/assign', { token: S.docToken });
  const para = S.catalog.medicines.find((m) => m.code === 'PARACETAMOL_500');
  const dx = await call('POST', '/consultations/' + c.data.id + '/diagnosis', { token: S.docToken, body: { icd10: 'J02.9', title: 'Faringit', items: [{ medicineId: para.id, doseMg: 500, timesPerDay: 3, durationDays: 3 }] } });
  assert.equal(dx.status, 201, JSON.stringify(dx.data));
  const rx = dx.data.prescription;
  const before = await call('GET', '/tracker', { token: S.patientToken });
  assert.ok(before.data.available.some((p) => p.id === rx.id), 'prescription offered for manual tracking');
  assert.equal((await call('POST', '/public/verify/' + rx.code + '/dispense', { body: { pharmacy: '' } })).status, 400);
  const disp = await call('POST', '/public/verify/' + rx.code + '/dispense', { body: { pharmacy: 'Shifo dorixonasi' } });
  assert.equal(disp.status, 200, JSON.stringify(disp.data));
  assert.equal((await call('POST', '/public/verify/' + rx.code + '/dispense', { body: { pharmacy: 'Boshqa dorixona' } })).status, 409, 'dispense only once');
  const v = await call('GET', '/public/verify/' + rx.code);
  assert.ok(v.data.dispensedAt); assert.equal(v.data.dispensedBy, 'Shifo dorixonasi');
  const tr = await call('GET', '/tracker', { token: S.patientToken });
  const course = tr.data.courses.find((x) => x.prescriptionId === rx.id);
  assert.ok(course); assert.equal(course.progress.total, 9); assert.equal(course.items[0].times.length, 3);
  assert.equal((await call('POST', '/tracker/doses', { token: S.patientToken, body: { itemId: course.items[0].id, dueAt: 123, status: 'TAKEN' } })).status, 400);
  const dueSoon = tr.data.doses.find((x) => x.prescriptionId === rx.id && x.dueAt <= Date.now() + 3 * 3600000);
  if (dueSoon) {
    const tk = await call('POST', '/tracker/doses', { token: S.patientToken, body: { itemId: dueSoon.itemId, dueAt: dueSoon.dueAt, status: 'TAKEN' } });
    assert.equal(tk.status, 200);
  }
  const pt = await call('PATCH', '/tracker/' + rx.id, { token: S.patientToken, body: { wakeMinute: 420, sleepMinute: 1380 } });
  assert.equal(pt.status, 200);
  const doc2 = await login('900000002');
  assert.equal((await call('PATCH', '/tracker/' + rx.id, { token: doc2, body: { active: false } })).status, 403);
});

test('support tickets, complaints and feedback reach the admin', async () => {
  assert.equal((await call('POST', '/tickets', { token: S.patientToken, body: { kind: 'OTHER', subject: 'x', content: 'y' } })).status, 400);
  const t = await call('POST', '/tickets', { token: S.patientToken, body: { kind: 'SUPPORT', subject: 'Kod kelmayapti', content: 'SMS kod kelmadi, yordam bering' } });
  assert.equal(t.status, 201); assert.equal(t.data.status, 'OPEN'); assert.equal(t.data.messages.length, 1);
  const cmp = await call('POST', '/tickets', { token: S.patientToken, body: { kind: 'COMPLAINT', subject: 'Kech javob', content: 'Shifokor juda kech javob berdi', aboutDoctorId: S.kardId } });
  assert.equal(cmp.data.aboutDoctor.id, S.kardId);
  const fb = await call('POST', '/tickets', { token: S.docToken, body: { kind: 'FEEDBACK', subject: 'Ilova qulay', content: 'Navbat juda qulay ishlaydi', rating: 5 } });
  assert.equal(fb.data.rating, 5);
  const admin = await login('900000099');
  const list = await call('GET', '/admin/tickets?status=OPEN', { token: admin });
  assert.ok(list.data.length >= 3);
  const doc2 = await login('900000002');
  assert.equal((await call('GET', '/tickets/' + t.data.id, { token: doc2 })).status, 403, 'IDOR on tickets');
  const rep = await call('POST', '/tickets/' + t.data.id + '/messages', { token: admin, body: { content: 'Raqamingizni tekshirdik, qayta urinib ko‘ring' } });
  assert.equal(rep.data.status, 'ANSWERED');
  assert.equal((await call('PATCH', '/tickets/' + t.data.id, { token: S.patientToken, body: { status: 'ANSWERED' } })).status, 403);
  assert.equal((await call('PATCH', '/tickets/' + t.data.id, { token: S.patientToken, body: { status: 'CLOSED' } })).data.status, 'CLOSED');
  assert.equal((await call('POST', '/tickets/' + t.data.id + '/messages', { token: S.patientToken, body: { content: 'yana' } })).status, 400);
  const st = await call('GET', '/admin/stats', { token: admin });
  assert.ok(Array.isArray(st.data.anomalies));
  assert.equal(st.data.satisfaction.appByRole.DOCTOR.avg, 5);
  assert.ok(st.data.totals.complaints30 >= 1);
  assert.equal(st.data.daily30.consultations.length, 30);
});

test('admin adds a medicine, edits it, report', async () => {
  const admin = await login('900000099');
  const body = { code: 'nimesulide 100', name: 'Nimesulid', form: 'tabletka', strength: '100 mg', mg: 100, std: '100 mg, kuniga 2 marta', maxDaily: 200, minAge: 12, preg: false, allergyKeys: 'nimesulid, nyaq', se: 'Ko‘ngil aynishi', ci: 'Jigar kasalligi', ai: false };
  const c = await call('POST', '/admin/medicines', { token: admin, body });
  assert.equal(c.status, 201, JSON.stringify(c.data)); assert.equal(c.data.code, 'NIMESULIDE_100');
  assert.equal((await call('POST', '/admin/medicines', { token: admin, body })).status, 409);
  assert.equal((await call('POST', '/admin/medicines', { token: admin, body: { ...body, code: 'X_BAD', mg: -1 } })).status, 400);
  const cat = await call('GET', '/catalog');
  const m = cat.data.medicines.find((x) => x.code === 'NIMESULIDE_100');
  assert.ok(m); assert.deepEqual(m.allergyKeys, ['nimesulid', 'nyaq']);
  assert.equal((await call('PUT', '/admin/medicines/' + m.id, { token: admin, body: { ...body, maxDaily: 300 } })).status, 200);
  assert.equal((await call('GET', '/admin/medicines', { token: admin })).data.find((x) => x.id === m.id).maxDaily, 300);
  const d = new Date(); const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const r = await call('GET', '/admin/report?from=' + key + '&to=' + key, { token: admin });
  assert.equal(r.status, 200); assert.ok(r.data.totals.consultations >= 1); assert.ok(r.data.doctors.length >= 6);
  assert.equal((await call('GET', '/admin/report?from=2026-05-01&to=2026-01-01', { token: admin })).status, 400);
});

test('profile photos: doctor public, patient private', async () => {
  const up = await call('POST', '/me/photo', { token: S.docToken, raw: PNG, headers: { 'content-type': 'image/png' } });
  assert.equal(up.status, 200, JSON.stringify(up.data)); assert.ok(up.data.photo);
  const pub = await call('GET', '/users/' + up.data.id + '/photo');
  assert.equal(pub.status, 200); assert.equal(pub.headers.get('content-type'), 'image/png');
  assert.equal((await call('POST', '/me/photo', { token: S.docToken, raw: Buffer.from('%PDF-1.4 x') })).status, 400, 'pdf is not a photo');
  const pp = await call('POST', '/me/photo', { token: S.patientToken, raw: PNG });
  assert.equal(pp.status, 200);
  assert.equal((await call('GET', '/users/' + pp.data.id + '/photo')).status, 403, 'anonymous cannot see patient photo');
  assert.equal((await call('GET', '/users/' + pp.data.id + '/photo', { token: S.patientToken })).status, 200);
  assert.equal((await call('GET', '/users/' + pp.data.id + '/photo', { token: S.docToken })).status, 200, 'own doctor sees it');
  const del = await call('DELETE', '/me/photo', { token: S.patientToken });
  assert.equal(del.data.photo, null);
});

test('patient profile keeps address', async () => {
  const r = await call('PUT', '/me/profile', { token: S.patientToken, body: { fullName: 'Test Bemor', birthYear: 1990, gender: 'M', allergies: 'ibuprofen', address: 'Toshkent, Chilonzor 5', emergencyContact: '+998901112233' } });
  assert.equal(r.status, 200); assert.equal(r.data.patient.address, 'Toshkent, Chilonzor 5'); assert.equal(r.data.patient.emergencyContact, '+998901112233');
});

test('static + security headers + SPA', async () => {
  const r = await fetch('http://127.0.0.1:' + PORT + '/');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  const trav = await fetch('http://127.0.0.1:' + PORT + '/%2e%2e/package.json');
  assert.ok(!(await trav.text()).includes('"name": "medassist"'), 'path traversal blocked');
  const bad = await fetch(BASE + '/consultations', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + S.patientToken }, body: '{bad json' });
  assert.equal(bad.status, 400);
});
