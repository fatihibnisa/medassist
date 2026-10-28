import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Minimal .env loader: KEY=VALUE lines, # comments, optional quotes. Real env vars win.
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnvFile(path.join(ROOT, '.env'));
// Appointment slots and "today" counters follow clinic time, not the container's UTC default.
if (!process.env.TZ) process.env.TZ = 'Asia/Tashkent';

const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
const bool = (k, d) => { const v = env(k, null); return v === null ? d : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase()); };
const int = (k, d) => { const v = Number(env(k, d)); return Number.isFinite(v) ? v : d; };

const isProd = env('NODE_ENV', 'development') === 'production';
const dataDir = path.resolve(ROOT, env('DATA_DIR', './data'));
fs.mkdirSync(path.join(dataDir, 'uploads'), { recursive: true });

// JWT secret: required in production; generated and persisted in development.
let jwtSecret = env('JWT_SECRET', '');
if (!jwtSecret) {
  if (isProd) {
    console.error('[config] JWT_SECRET majburiy (production). .env faylida kamida 32 belgili tasodifiy qiymat bering.');
    process.exit(1);
  }
  const f = path.join(dataDir, '.dev-secret');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
  jwtSecret = fs.readFileSync(f, 'utf8').trim();
}
if (jwtSecret.length < 32) {
  console.error('[config] JWT_SECRET kamida 32 belgi bo‘lishi kerak.');
  process.exit(1);
}

export const config = {
  isProd,
  port: int('PORT', 3000),
  host: env('HOST', '0.0.0.0'),
  publicUrl: env('PUBLIC_URL', 'http://localhost:' + int('PORT', 3000)).replace(/\/$/, ''),
  dataDir,
  dbFile: path.join(dataDir, env('DB_FILE', 'medassist.db')),
  uploadDir: path.join(dataDir, 'uploads'),
  jwtSecret,
  accessTtlMin: int('ACCESS_TTL_MIN', 15),
  refreshTtlDays: int('REFRESH_TTL_DAYS', 7),
  trustProxy: bool('TRUST_PROXY', isProd),
  corsOrigin: env('CORS_ORIGIN', ''),
  googleVerification: env('GOOGLE_SITE_VERIFICATION', ''),
  sms: {
    provider: env('SMS_PROVIDER', 'console'),
    eskizEmail: env('ESKIZ_EMAIL', ''),
    eskizPassword: env('ESKIZ_PASSWORD', ''),
    eskizFrom: env('ESKIZ_FROM', '4546')
  },
  ai: {
    enabled: bool('AI_ENABLED', true),
    apiKey: env('ANTHROPIC_API_KEY', ''),
    model: env('AI_MODEL', 'claude-sonnet-5-5'),
    timeoutMs: int('AI_TIMEOUT_MS', 30000)
  },
  admin: {
    phone: env('ADMIN_PHONE', ''),
    password: env('ADMIN_PASSWORD', ''),
    name: env('ADMIN_NAME', 'Administrator')
  },
  demoSeed: bool('DEMO_SEED', !isProd),
  showDevOtp: !isProd && env('SMS_PROVIDER', 'console') === 'console',
  maxUploadBytes: 10 * 1024 * 1024
};
