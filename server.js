import http from 'node:http';
import { config } from './src/config.js';
import { db, migrate, seedReference, one, run, insert, now, specialtyId } from './src/db.js';
import { createRouter, HttpError, readBody, parseCookies, clientIp, securityHeaders, sendJson, sendError, serveStatic, serveSeo, sendIndex, rateLimit } from './src/http.js';
import { authenticate, hashPassword } from './src/auth.js';
import authRoutes from './src/routes/auth.js';
import fileRoutes from './src/routes/files.js';
import consultationRoutes from './src/routes/consultations.js';
import adminRoutes from './src/routes/admin.js';
import doctorRoutes from './src/routes/doctors.js';
import socialRoutes from './src/routes/social.js';
import trackerRoutes from './src/routes/tracker.js';

/* ---------- database ---------- */
migrate();
seedReference();

async function ensureUser(role, phone, name, password, extra) {
  if (one('SELECT id FROM users WHERE phone = ?', phone)) return;
  const id = insert('INSERT INTO users (role, full_name, phone, password_hash, created_at, updated_at) VALUES (?,?,?,?,?,?)', role, name, phone, await hashPassword(password), now(), now());
  if (role === 'DOCTOR') insert('INSERT INTO doctor_profiles (user_id, specialty_id, license_number, experience_years, verification_status, verified_at) VALUES (?,?,?,?,?,?)', id, specialtyId(extra.spec), extra.license, extra.exp, extra.status, extra.status === 'VERIFIED' ? now() : null);
  if (role === 'PATIENT') insert('INSERT INTO patient_profiles (user_id, birth_year, gender, blood_type, allergies, chronic_diseases, pregnant, updated_at) VALUES (?,?,?,?,?,?,?,?)', id, extra.birthYear, extra.gender, '', extra.allergies || '', extra.chronic || '', 0, now());
  if (role === 'DOCTOR') run('UPDATE doctor_profiles SET presence_at = ? WHERE user_id = ?', now(), id);
  console.log('[seed] ' + role + ' ' + phone);
}
if (config.admin.phone && config.admin.password) {
  await ensureUser('ADMIN', config.admin.phone.replace(/\D/g, ''), config.admin.name, config.admin.password);
}
if (config.demoSeed) {
  await ensureUser('ADMIN', '998900000099', 'Demo Administrator', 'Demo12345');
  const DEMO_DOCTORS = [
    ['998900000001', 'Akmal Karimov', 'Terapevt', 'UZ-TR-0042', 12, 'VERIFIED', 'Yunusobod oilaviy poliklinikasi', 'Toshkent sh., Yunusobod tumani, Amir Temur ko‘chasi, 108-uy', 41.3640, 69.2870, 80000, 150000, 'ONLINE'],
    ['998900000002', 'Nilufar Rashidova', 'Nevrolog', 'UZ-NV-0117', 9, 'VERIFIED', 'Nevrologiya markazi', 'Toshkent sh., Mirzo Ulug‘bek tumani, Buyuk Ipak yo‘li, 45-uy', 41.3260, 69.3350, 120000, 200000, 'AT_WORK'],
    ['998900000003', 'Javohir To‘xtayev', 'Travmatolog', 'UZ-TV-0233', 4, 'PENDING', '', '', null, null, 0, 0, 'OFFLINE'],
    ['998900000004', 'Kamola Ahmedova', 'Kardiolog', 'UZ-KR-0310', 15, 'VERIFIED', 'Kardiologiya klinikasi', 'Toshkent sh., Chilonzor tumani, Bunyodkor shoh ko‘chasi, 12-uy', 41.2850, 69.2040, 150000, 250000, 'ONLINE'],
    ['998900000005', 'Sherzod Nazarov', 'LOR', 'UZ-LR-0144', 8, 'VERIFIED', 'LOR markazi', 'Toshkent sh., Shayxontohur tumani, Navoiy ko‘chasi, 30-uy', 41.3230, 69.2400, 90000, 160000, 'AT_WORK'],
    ['998900000006', 'Gulnora Saidova', 'Gastroenterolog', 'UZ-GS-0412', 11, 'VERIFIED', 'Gastroenterologiya klinikasi', 'Toshkent sh., Mirobod tumani, Oybek ko‘chasi, 18-uy', 41.2960, 69.2770, 110000, 190000, 'ONLINE'],
    ['998900000007', 'Farrux Olimov', 'Dermatolog', 'UZ-DR-0098', 6, 'VERIFIED', 'Dermatologiya markazi', 'Toshkent sh., Yakkasaroy tumani, Shota Rustaveli ko‘chasi, 50-uy', 41.2830, 69.2560, 90000, 150000, 'OFFLINE'],
    ['998900000008', 'Malika Tursunova', 'Pediatr', 'UZ-PD-0271', 13, 'VERIFIED', 'Bolalar poliklinikasi', 'Toshkent sh., Olmazor tumani, Qorasaroy ko‘chasi, 7-uy', 41.3420, 69.2230, 70000, 130000, 'ONLINE']
  ];
  for (const [phone, name, spec, license, exp, status, clinic, address, lat, lng, pOnline, pVisit, presence] of DEMO_DOCTORS) {
    await ensureUser('DOCTOR', phone, name, 'Demo12345', { spec, license, exp, status });
    const id = one('SELECT id FROM users WHERE phone = ?', phone).id;
    // Demo-only: fill an empty clinic profile and mark the doctor available for today.
    run("UPDATE doctor_profiles SET clinic_name = ?, clinic_address = ?, clinic_lat = ?, clinic_lng = ?, price_online = ?, price_visit = ?, bio = ? WHERE user_id = ? AND clinic_name = ''",
      clinic, address, lat, lng, pOnline, pVisit, clinic ? exp + ' yillik tajribaga ega ' + spec.toLowerCase() + '. Bemorlarga onlayn va klinikada maslahat beraman.' : '', id);
    run('UPDATE doctor_profiles SET presence = ?, presence_at = ? WHERE user_id = ?', presence, now(), id);
  }
  await ensureUser('PATIENT', '998900000010', 'Dilnoza Yusupova', 'Demo12345', { birthYear: new Date().getFullYear() - 34, gender: 'F', allergies: 'penitsillin' });
  run("UPDATE patient_profiles SET address = 'Toshkent sh., Chilonzor tumani, 9-kvartal, 14-uy' WHERE user_id = (SELECT id FROM users WHERE phone = '998900000010') AND address = ''");
}

/* ---------- routes ---------- */
const api = createRouter('/api/v1');
authRoutes(api);
fileRoutes(api);
consultationRoutes(api);
adminRoutes(api);
doctorRoutes(api);
socialRoutes(api);
trackerRoutes(api);

const JSON_LIMIT = 100 * 1024;

async function handleApi(req, res, url) {
  const ip = clientIp(req);
  if (!rateLimit('ip:' + ip, 600, 5 * 60000)) throw new HttpError(429, 'Juda ko‘p so‘rov. Birozdan keyin urinib ko‘ring');
  const m = api.match(req.method, url.pathname);
  if (!m) throw new HttpError(404, 'API manzili topilmadi');
  if (m.methodNotAllowed) throw new HttpError(405, 'Metod ruxsat etilmagan');
  const { route, params } = m;
  const ctx = { req, res, ip, params, query: url.searchParams, cookies: parseCookies(req.headers.cookie), body: {}, raw: null, user: null };
  ctx.user = authenticate(ctx);
  if (route.opts.auth) {
    if (!ctx.user) throw new HttpError(401, 'Avtorizatsiya talab qilinadi');
    if (Array.isArray(route.opts.auth) && !route.opts.auth.includes(ctx.user.role)) throw new HttpError(403, 'Bu amal sizning rolingiz uchun emas');
  }
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    if (route.opts.raw) {
      ctx.raw = await readBody(req, config.maxUploadBytes + 1);
    } else {
      const buf = await readBody(req, JSON_LIMIT);
      if (buf.length) {
        if (!String(req.headers['content-type'] || '').includes('application/json')) throw new HttpError(415, 'Content-Type application/json bo‘lishi kerak');
        try { ctx.body = JSON.parse(buf.toString('utf8')); } catch { throw new HttpError(400, 'JSON formati noto‘g‘ri'); }
        if (!ctx.body || typeof ctx.body !== 'object' || Array.isArray(ctx.body)) throw new HttpError(400, 'So‘rov tanasi obyekt bo‘lishi kerak');
      }
    }
  }
  const result = await route.handler(ctx);
  if (!res.headersSent && !res.writableEnded) sendJson(res, route.opts.status || 200, result === undefined ? { ok: true } : result);
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  securityHeaders(res);
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { sendError(res, 400, 'Noto‘g‘ri manzil'); return; }
  if (config.corsOrigin && req.headers.origin === config.corsOrigin) {
    res.setHeader('Access-Control-Allow-Origin', config.corsOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-File-Name', 'Access-Control-Max-Age': '600' });
      res.end(); return;
    }
  }
  if (url.pathname.startsWith('/api/')) {
    try { await handleApi(req, res, url); }
    catch (e) {
      if (e instanceof HttpError) { if (!res.headersSent) sendError(res, e.status, e.message, e.errors); }
      else { console.error('[error]', req.method, url.pathname, e); if (!res.headersSent) sendError(res, 500, 'Serverda kutilmagan xatolik'); else res.end(); }
    }
    if (config.isProd) console.log(new Date().toISOString(), req.method, url.pathname, res.statusCode, (Date.now() - started) + 'ms');
    return;
  }
  if (serveSeo(req, res, url.pathname) || serveStatic(req, res, url.pathname)) return;
  // Unknown non-API page → the app shell with a real 404 status; the app shows its 404 page.
  if (req.method === 'GET' || req.method === 'HEAD') { sendIndex(req, res, 404); return; }
  sendError(res, 404, 'Topilmadi');
});

server.requestTimeout = 60000;
server.headersTimeout = 20000;
server.listen(config.port, config.host, () => {
  console.log('MedAssist ishga tushdi: ' + config.publicUrl + '  (port ' + config.port + ', ' + (config.isProd ? 'production' : 'development') + ')');
  if (config.demoSeed) console.log('[demo] Kirish: shifokor 90 000 00 01 / bemor 90 000 00 10 / admin 90 000 00 99 — parol Demo12345');
});

function shutdown(sig) {
  console.log('\n' + sig + ' — to‘xtatilmoqda…');
  server.close(() => { try { db.close(); } catch { /* ignore */ } process.exit(0); });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
