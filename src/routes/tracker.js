import { one, all, run, insert, now } from '../db.js';
import { bad, forbidden, notFound, intIn } from '../http.js';
import { audit } from '../auth.js';
import { doseTimes } from '../../public/shared/clinical.js';

const DAY = 86400000;

/** Creates the medication course for a prescription (idempotent). Starts now. */
export function startCourse(prescriptionId, patientId, wake = 480, sleep = 1320) {
  insert('INSERT OR IGNORE INTO med_courses (prescription_id, patient_id, start_at, wake_minute, sleep_minute, created_at) VALUES (?,?,?,?,?,?)', prescriptionId, patientId, now(), wake, sleep, now());
  run('UPDATE med_courses SET is_active = 1 WHERE prescription_id = ?', prescriptionId);
}

const itemsOf = (rxId) => all(`SELECT i.*, m.name, m.strength, m.form, m.photo_name AS photoName, m.photo_updated_at AS photoAt FROM prescription_items i JOIN medicines m ON m.id = i.medicine_id WHERE i.prescription_id = ? ORDER BY i.id`, rxId);

/** Every dose of every item: days × timesPerDay doses, starting from the course start (earlier slots that day are skipped). */
export function scheduleFor(course, items) {
  const out = [];
  const start = new Date(course.start_at); start.setHours(0, 0, 0, 0);
  for (const it of items) {
    const times = doseTimes(it.times_per_day, course.wake_minute, course.sleep_minute);
    const total = it.duration_days * times.length;
    let count = 0;
    for (let d = 0; count < total && d < it.duration_days + 2; d++) {
      const day = new Date(start); day.setDate(day.getDate() + d);
      for (const t of times) {
        if (count >= total) break;
        const due = day.getTime() + t * 60000;
        if (due < course.start_at - 30 * 60000) continue;
        out.push({ itemId: it.id, dueAt: due });
        count++;
      }
    }
  }
  return out.sort((a, b) => a.dueAt - b.dueAt);
}

function ownCourse(ctx, rxId) {
  const c = one('SELECT mc.*, p.status AS rx_status FROM med_courses mc JOIN prescriptions p ON p.id = mc.prescription_id WHERE mc.prescription_id = ?', Number(rxId));
  if (!c) throw notFound('Dori kursi topilmadi');
  if (c.patient_id !== ctx.user.id) throw forbidden();
  return c;
}

export default function trackerRoutes(r) {
  r.get('/tracker', { auth: ['PATIENT'] }, (ctx) => {
    const t = now();
    const courses = all(`SELECT mc.*, p.number, p.status AS rx_status, p.dispensed_at, p.dispensed_by, u.full_name AS doctor_name
      FROM med_courses mc JOIN prescriptions p ON p.id = mc.prescription_id JOIN users u ON u.id = p.doctor_id
      WHERE mc.patient_id = ? ORDER BY mc.start_at DESC LIMIT 20`, ctx.user.id);
    const doses = [];
    const outCourses = courses.map((c) => {
      const items = itemsOf(c.prescription_id);
      const sched = scheduleFor(c, items);
      const logs = new Map(all('SELECT item_id, due_at, status FROM dose_logs WHERE prescription_id = ?', c.prescription_id).map((l) => [l.item_id + ':' + l.due_at, l.status]));
      let taken = 0, skipped = 0, missed = 0;
      for (const s of sched) {
        const st = logs.get(s.itemId + ':' + s.dueAt) || null;
        if (st === 'TAKEN') taken++; else if (st === 'SKIPPED') skipped++; else if (s.dueAt < t - 2 * 3600000) missed++;
        if (c.is_active && c.rx_status !== 'CANCELLED' && s.dueAt > t - 36 * 3600000 && s.dueAt < t + 7 * DAY) doses.push({ prescriptionId: c.prescription_id, itemId: s.itemId, dueAt: s.dueAt, status: st });
      }
      const endAt = sched.length ? sched[sched.length - 1].dueAt : c.start_at;
      return {
        prescriptionId: c.prescription_id, number: c.number, doctorName: c.doctor_name, startAt: c.start_at, endAt, wakeMinute: c.wake_minute, sleepMinute: c.sleep_minute,
        active: !!c.is_active && c.rx_status !== 'CANCELLED' && endAt > t - DAY, cancelled: c.rx_status === 'CANCELLED', dispensedAt: c.dispensed_at, dispensedBy: c.dispensed_by,
        items: items.map((i) => ({ id: i.id, medicineId: i.medicine_id, name: i.name, strength: i.strength, form: i.form, dosage: i.dosage_text, timesPerDay: i.times_per_day, days: i.duration_days, instructions: i.instructions, times: doseTimes(i.times_per_day, c.wake_minute, c.sleep_minute), photo: i.photoName ? i.photoAt : null })),
        progress: { taken, skipped, missed, total: sched.length }
      };
    });
    // Prescriptions the patient can start tracking manually (e.g. the pharmacy did not scan the code).
    const available = all(`SELECT p.id, p.number, p.issued_at FROM prescriptions p JOIN consultations c ON c.id = p.consultation_id
      WHERE c.patient_id = ? AND p.status = 'ACTIVE' AND p.valid_until > ? AND p.id NOT IN (SELECT prescription_id FROM med_courses) ORDER BY p.id DESC LIMIT 10`, ctx.user.id, t)
      .map((p) => ({ id: p.id, number: p.number, issuedAt: p.issued_at }));
    return { courses: outCourses, doses: doses.sort((a, b) => a.dueAt - b.dueAt), available, serverTime: t };
  });

  r.post('/tracker/start', { auth: ['PATIENT'], status: 201 }, (ctx) => {
    const rx = one('SELECT p.*, c.patient_id FROM prescriptions p JOIN consultations c ON c.id = p.consultation_id WHERE p.id = ?', Number(ctx.body.prescriptionId));
    if (!rx) throw notFound('Retsept topilmadi');
    if (rx.patient_id !== ctx.user.id) throw forbidden();
    if (rx.status === 'CANCELLED') throw bad('Retsept bekor qilingan');
    const wake = ctx.body.wakeMinute == null ? 480 : intIn(ctx.body.wakeMinute, 240, 720, 'Uyg‘onish vaqti');
    const sleep = ctx.body.sleepMinute == null ? 1320 : intIn(ctx.body.sleepMinute, 1080, 1439, 'Uxlash vaqti');
    startCourse(rx.id, ctx.user.id, wake, sleep);
    audit(ctx, 'COURSE_START', 'prescription', rx.id);
    return { ok: true };
  });

  r.patch('/tracker/:id', { auth: ['PATIENT'] }, (ctx) => {
    const c = ownCourse(ctx, ctx.params.id);
    const wake = ctx.body.wakeMinute == null ? c.wake_minute : intIn(ctx.body.wakeMinute, 240, 720, 'Uyg‘onish vaqti');
    const sleep = ctx.body.sleepMinute == null ? c.sleep_minute : intIn(ctx.body.sleepMinute, 1080, 1439, 'Uxlash vaqti');
    const active = ctx.body.active === undefined ? !!c.is_active : !!ctx.body.active;
    run('UPDATE med_courses SET wake_minute = ?, sleep_minute = ?, is_active = ? WHERE prescription_id = ?', wake, sleep, active, c.prescription_id);
    return { ok: true };
  });

  r.post('/tracker/doses', { auth: ['PATIENT'] }, (ctx) => {
    const item = one('SELECT * FROM prescription_items WHERE id = ?', Number(ctx.body.itemId));
    if (!item) throw notFound('Dori topilmadi');
    const c = ownCourse(ctx, item.prescription_id);
    const status = ctx.body.status === 'SKIPPED' ? 'SKIPPED' : 'TAKEN';
    const dueAt = Number(ctx.body.dueAt);
    if (!scheduleFor(c, [item]).some((s) => s.dueAt === dueAt)) throw bad('Bu vaqt jadvalda yo‘q');
    if (dueAt > now() + 3 * 3600000) throw bad('Hali vaqti kelmagan dozani belgilab bo‘lmaydi');
    run(`INSERT INTO dose_logs (prescription_id, item_id, due_at, status, logged_at) VALUES (?,?,?,?,?)
      ON CONFLICT(item_id, due_at) DO UPDATE SET status = excluded.status, logged_at = excluded.logged_at`, item.prescription_id, item.id, dueAt, status, now());
    return { ok: true, status };
  });
}
