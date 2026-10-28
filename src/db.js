import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';
import { MEDICINES, SPECIALTIES } from '../public/shared/clinical.js';

export const db = new DatabaseSync(config.dbFile);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');

const norm = (params) => params.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));
const cache = new Map();
const stmt = (sql) => { let s = cache.get(sql); if (!s) { s = db.prepare(sql); cache.set(sql, s); } return s; };

export const one = (sql, ...p) => stmt(sql).get(...norm(p)) || null;
export const all = (sql, ...p) => stmt(sql).all(...norm(p));
export const run = (sql, ...p) => stmt(sql).run(...norm(p));
export const insert = (sql, ...p) => Number(stmt(sql).run(...norm(p)).lastInsertRowid);
export const now = () => Date.now();

let depth = 0;
export function tx(fn) {
  if (depth > 0) return fn();
  depth++;
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { try { db.exec('ROLLBACK'); } catch (_) { /* ignore */ } throw e; }
  finally { depth--; }
}
export const json = (v, d) => { if (v == null) return d; try { return JSON.parse(v); } catch { return d; } };

const MIGRATIONS = [
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL CHECK (role IN ('PATIENT','DOCTOR','ADMIN')),
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE patient_profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    birth_year INTEGER NOT NULL,
    gender TEXT NOT NULL CHECK (gender IN ('M','F')),
    blood_type TEXT,
    allergies TEXT NOT NULL DEFAULT '',
    chronic_diseases TEXT NOT NULL DEFAULT '',
    pregnant INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE specialties (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE);
  CREATE TABLE doctor_profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    specialty_id INTEGER NOT NULL REFERENCES specialties(id),
    license_number TEXT NOT NULL UNIQUE,
    license_file_id INTEGER,
    experience_years INTEGER NOT NULL DEFAULT 0,
    verification_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING','VERIFIED','BLOCKED')),
    verified_by INTEGER REFERENCES users(id),
    verified_at INTEGER,
    note TEXT
  );
  CREATE TABLE otp_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    purpose TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    consumed INTEGER NOT NULL DEFAULT 0,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idx_otp_phone ON otp_codes(phone, purpose, created_at);
  CREATE TABLE refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    revoked INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    user_agent TEXT
  );
  CREATE TABLE consultations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL REFERENCES users(id),
    doctor_id INTEGER REFERENCES users(id),
    specialty_id INTEGER NOT NULL REFERENCES specialties(id),
    complaint TEXT NOT NULL DEFAULT '',
    severity TEXT NOT NULL CHECK (severity IN ('GREEN','YELLOW','RED')),
    triage_reasons TEXT NOT NULL DEFAULT '[]',
    symptoms TEXT NOT NULL DEFAULT '[]',
    flags TEXT NOT NULL DEFAULT '[]',
    temperature REAL,
    patient_snapshot TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('NEW','AI_DRAFTED','ASSIGNED','DIAGNOSED','CLOSED','CANCELLED')),
    is_deleted INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    closed_at INTEGER
  );
  CREATE INDEX idx_cons_status ON consultations(status, specialty_id);
  CREATE INDEX idx_cons_patient ON consultations(patient_id);
  CREATE INDEX idx_cons_doctor ON consultations(doctor_id);
  CREATE TABLE consultation_segments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    consultation_id INTEGER NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
    segment_code TEXT NOT NULL,
    pain_level INTEGER NOT NULL CHECK (pain_level BETWEEN 0 AND 10),
    symptom_type TEXT NOT NULL,
    duration_idx INTEGER NOT NULL CHECK (duration_idx BETWEEN 0 AND 3),
    UNIQUE (consultation_id, segment_code)
  );
  CREATE TABLE attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    consultation_id INTEGER REFERENCES consultations(id) ON DELETE CASCADE,
    owner_id INTEGER NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL CHECK (kind IN ('CONSULTATION','LICENSE')),
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL UNIQUE,
    mime TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    consultation_id INTEGER NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
    sender_id INTEGER NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idx_msg_cons ON messages(consultation_id, id);
  CREATE TABLE diagnoses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    consultation_id INTEGER NOT NULL UNIQUE REFERENCES consultations(id),
    doctor_id INTEGER NOT NULL REFERENCES users(id),
    icd10_code TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    recommendations TEXT NOT NULL DEFAULT '',
    red_flags TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL
  );
  CREATE TABLE medicines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    form TEXT NOT NULL,
    strength TEXT NOT NULL,
    mg REAL,
    unit_dose TEXT,
    standard_dosage TEXT NOT NULL,
    max_daily_mg REAL,
    min_age INTEGER NOT NULL DEFAULT 0,
    pregnancy_allowed INTEGER NOT NULL DEFAULT 0,
    contra_keys TEXT NOT NULL DEFAULT '[]',
    allergy_keys TEXT NOT NULL DEFAULT '[]',
    side_effects TEXT NOT NULL DEFAULT '[]',
    contraindications TEXT NOT NULL DEFAULT '[]',
    ai_allowed INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE prescriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    diagnosis_id INTEGER NOT NULL REFERENCES diagnoses(id),
    consultation_id INTEGER NOT NULL REFERENCES consultations(id),
    doctor_id INTEGER NOT NULL REFERENCES users(id),
    number TEXT NOT NULL UNIQUE,
    verify_code TEXT NOT NULL UNIQUE,
    issued_at INTEGER NOT NULL,
    valid_until INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CANCELLED')),
    cancel_reason TEXT,
    cancelled_at INTEGER
  );
  CREATE TABLE prescription_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prescription_id INTEGER NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
    medicine_id INTEGER NOT NULL REFERENCES medicines(id),
    dose_mg REAL,
    dosage_text TEXT NOT NULL,
    times_per_day INTEGER NOT NULL CHECK (times_per_day BETWEEN 1 AND 12),
    duration_days INTEGER NOT NULL CHECK (duration_days BETWEEN 1 AND 365),
    instructions TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE ai_suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    consultation_id INTEGER NOT NULL UNIQUE REFERENCES consultations(id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK (source IN ('AI','RULES')),
    model_name TEXT,
    prompt_version TEXT NOT NULL,
    draft_json TEXT NOT NULL,
    kept_json TEXT NOT NULL,
    removed_json TEXT NOT NULL,
    review_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (review_status IN ('PENDING','APPROVED','MODIFIED','REJECTED')),
    reviewed_by INTEGER REFERENCES users(id),
    reviewed_at INTEGER,
    doctor_note TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    link TEXT,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idx_notif_user ON notifications(user_id, is_read);
  CREATE TABLE audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    entity TEXT,
    entity_id INTEGER,
    detail TEXT,
    ip TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idx_audit_time ON audit_logs(created_at);
  `,
  // v2: doctor public profile + schedule, offline appointments, reviews, support tickets, photos, medication tracker
  `
  ALTER TABLE patient_profiles ADD COLUMN address TEXT NOT NULL DEFAULT '';
  ALTER TABLE patient_profiles ADD COLUMN emergency_contact TEXT NOT NULL DEFAULT '';
  ALTER TABLE doctor_profiles ADD COLUMN clinic_name TEXT NOT NULL DEFAULT '';
  ALTER TABLE doctor_profiles ADD COLUMN clinic_address TEXT NOT NULL DEFAULT '';
  ALTER TABLE doctor_profiles ADD COLUMN clinic_lat REAL;
  ALTER TABLE doctor_profiles ADD COLUMN clinic_lng REAL;
  ALTER TABLE doctor_profiles ADD COLUMN price_online INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE doctor_profiles ADD COLUMN price_visit INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE doctor_profiles ADD COLUMN bio TEXT NOT NULL DEFAULT '';
  ALTER TABLE doctor_profiles ADD COLUMN presence TEXT NOT NULL DEFAULT 'OFFLINE';
  ALTER TABLE doctor_profiles ADD COLUMN presence_at INTEGER;
  ALTER TABLE doctor_profiles ADD COLUMN work_hours TEXT NOT NULL DEFAULT '{}';
  ALTER TABLE doctor_profiles ADD COLUMN slot_minutes INTEGER NOT NULL DEFAULT 30;
  ALTER TABLE consultations ADD COLUMN requested_doctor_id INTEGER REFERENCES users(id);
  ALTER TABLE prescriptions ADD COLUMN dispensed_at INTEGER;
  ALTER TABLE prescriptions ADD COLUMN dispensed_by TEXT;
  ALTER TABLE refresh_tokens ADD COLUMN revoked_at INTEGER;
  CREATE TABLE user_photos (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    stored_name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL REFERENCES users(id),
    doctor_id INTEGER NOT NULL REFERENCES users(id),
    start_at INTEGER NOT NULL,
    end_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'BOOKED' CHECK (status IN ('BOOKED','ARRIVED','IN_PROGRESS','DONE','CANCELLED','NO_SHOW')),
    reason TEXT NOT NULL DEFAULT '',
    segments TEXT NOT NULL DEFAULT '[]',
    doctor_note TEXT NOT NULL DEFAULT '',
    price INTEGER NOT NULL DEFAULT 0,
    cancelled_by TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX idx_appt_doctor ON appointments(doctor_id, start_at);
  CREATE INDEX idx_appt_patient ON appointments(patient_id, start_at);
  CREATE UNIQUE INDEX idx_appt_slot ON appointments(doctor_id, start_at) WHERE status NOT IN ('CANCELLED');
  CREATE TABLE reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL REFERENCES users(id),
    doctor_id INTEGER NOT NULL REFERENCES users(id),
    consultation_id INTEGER UNIQUE REFERENCES consultations(id),
    appointment_id INTEGER UNIQUE REFERENCES appointments(id),
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT NOT NULL DEFAULT '',
    is_hidden INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idx_reviews_doctor ON reviews(doctor_id);
  CREATE TABLE tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL CHECK (kind IN ('SUPPORT','COMPLAINT','FEEDBACK')),
    subject TEXT NOT NULL,
    about_doctor_id INTEGER REFERENCES users(id),
    rating INTEGER CHECK (rating BETWEEN 1 AND 5),
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ANSWERED','CLOSED')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX idx_tickets_status ON tickets(status, updated_at);
  CREATE TABLE ticket_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    sender_id INTEGER NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idx_ticket_msg ON ticket_messages(ticket_id, id);
  CREATE TABLE med_courses (
    prescription_id INTEGER PRIMARY KEY REFERENCES prescriptions(id) ON DELETE CASCADE,
    patient_id INTEGER NOT NULL REFERENCES users(id),
    start_at INTEGER NOT NULL,
    wake_minute INTEGER NOT NULL DEFAULT 480,
    sleep_minute INTEGER NOT NULL DEFAULT 1320,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE dose_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prescription_id INTEGER NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL REFERENCES prescription_items(id) ON DELETE CASCADE,
    due_at INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('TAKEN','SKIPPED')),
    logged_at INTEGER NOT NULL,
    UNIQUE (item_id, due_at)
  );
  `,
  // v3: medicine photos
  `
  ALTER TABLE medicines ADD COLUMN photo_name TEXT;
  ALTER TABLE medicines ADD COLUMN photo_mime TEXT;
  ALTER TABLE medicines ADD COLUMN photo_updated_at INTEGER;
  `,
  // v4: in-person exam referral, when the doctor cannot decide from the online consultation alone
  `
  ALTER TABLE consultations ADD COLUMN referred_at INTEGER;
  ALTER TABLE consultations ADD COLUMN referral_note TEXT;
  `
];

export function migrate() {
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const row = one('SELECT version FROM schema_version');
  let v = row ? row.version : 0;
  if (!row) run('INSERT INTO schema_version (version) VALUES (0)');
  while (v < MIGRATIONS.length) {
    tx(() => { db.exec(MIGRATIONS[v]); run('UPDATE schema_version SET version = ?', v + 1); });
    v++;
    console.log('[db] migratsiya qo‘llandi: v' + v);
  }
}

export function seedReference() {
  tx(() => {
    for (const name of SPECIALTIES) run('INSERT OR IGNORE INTO specialties (name) VALUES (?)', name);
    for (const m of MEDICINES) {
      const exists = one('SELECT id FROM medicines WHERE code = ?', m.code);
      if (exists) continue; // keep admin edits (ai_allowed, is_active)
      run(`INSERT INTO medicines (code,name,form,strength,mg,unit_dose,standard_dosage,max_daily_mg,min_age,pregnancy_allowed,contra_keys,allergy_keys,side_effects,contraindications,ai_allowed)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        m.code, m.name, m.form, m.strength, m.mg, m.unitDose, m.std, m.maxDaily, m.minAge, m.preg,
        JSON.stringify(m.contraKeys), JSON.stringify(m.allergyKeys), JSON.stringify(m.se), JSON.stringify(m.ci), m.ai);
    }
  });
}

export const specialtyId = (name) => (one('SELECT id FROM specialties WHERE name = ?', name) || one('SELECT id FROM specialties WHERE name = ?', 'Terapevt')).id;

export function medicineRow(r) {
  if (!r) return null;
  return {
    id: r.id, code: r.code, name: r.name, form: r.form, strength: r.strength, mg: r.mg, unitDose: r.unit_dose, std: r.standard_dosage,
    maxDaily: r.max_daily_mg, minAge: r.min_age, preg: !!r.pregnancy_allowed, contraKeys: json(r.contra_keys, []), allergyKeys: json(r.allergy_keys, []),
    se: json(r.side_effects, []), ci: json(r.contraindications, []), ai: !!r.ai_allowed, active: !!r.is_active,
    photo: r.photo_name ? r.photo_updated_at : null
  };
}
