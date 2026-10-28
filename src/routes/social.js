import { one, all, run, insert, now, tx } from '../db.js';
import { HttpError, bad, forbidden, notFound, conflict, str, intIn, rateLimit } from '../http.js';
import { audit, notify, notifyAdmins } from '../auth.js';
import { photoV } from '../dto.js';

const KIND_LABEL = { SUPPORT: 'Texnik yordam', COMPLAINT: 'Shikoyat', FEEDBACK: 'Taklif va fikr' };

function ticketDto(t, withMessages) {
  const u = one('SELECT full_name, role, phone FROM users WHERE id = ?', t.user_id);
  const about = t.about_doctor_id ? one('SELECT full_name FROM users WHERE id = ?', t.about_doctor_id) : null;
  const out = {
    id: t.id, kind: t.kind, subject: t.subject, status: t.status, rating: t.rating, createdAt: t.created_at, updatedAt: t.updated_at,
    user: { id: t.user_id, fullName: u.full_name, role: u.role, phone: u.phone, photo: photoV(t.user_id) },
    aboutDoctor: about ? { id: t.about_doctor_id, fullName: about.full_name } : null,
    lastMessage: (one('SELECT content FROM ticket_messages WHERE ticket_id = ? ORDER BY id DESC LIMIT 1', t.id) || {}).content || ''
  };
  if (withMessages) out.messages = all('SELECT m.id, m.content, m.created_at AS createdAt, m.sender_id AS senderId, u.role AS senderRole, u.full_name AS senderName FROM ticket_messages m JOIN users u ON u.id = m.sender_id WHERE m.ticket_id = ? ORDER BY m.id', t.id);
  return out;
}
function loadTicket(ctx) {
  const t = one('SELECT * FROM tickets WHERE id = ?', Number(ctx.params.id));
  if (!t) throw notFound('Murojaat topilmadi');
  if (ctx.user.role !== 'ADMIN' && t.user_id !== ctx.user.id) throw forbidden();
  return t;
}

export default function socialRoutes(r) {
  /* ---------------- reviews ---------------- */
  r.post('/reviews', { auth: ['PATIENT'], status: 201 }, (ctx) => {
    const b = ctx.body;
    const rating = intIn(b.rating, 1, 5, 'Baho');
    const comment = str(b.comment, { max: 1000, field: 'Izoh' });
    let doctorId, cid = null, aid = null;
    if (b.consultationId) {
      const c = one('SELECT * FROM consultations WHERE id = ? AND is_deleted = 0', Number(b.consultationId));
      if (!c) throw notFound('Murojaat topilmadi');
      if (c.patient_id !== ctx.user.id) throw forbidden();
      if (!['DIAGNOSED', 'CLOSED'].includes(c.status) || !c.doctor_id) throw bad('Shifokor javob bergandan keyin baholash mumkin');
      doctorId = c.doctor_id; cid = c.id;
    } else if (b.appointmentId) {
      const a = one('SELECT * FROM appointments WHERE id = ?', Number(b.appointmentId));
      if (!a) throw notFound('Qabul topilmadi');
      if (a.patient_id !== ctx.user.id) throw forbidden();
      if (a.status !== 'DONE') throw bad('Qabul yakunlangandan keyin baholash mumkin');
      doctorId = a.doctor_id; aid = a.id;
    } else throw bad('Nimani baholayotganingizni ko‘rsating');
    let id;
    try { id = insert('INSERT INTO reviews (patient_id, doctor_id, consultation_id, appointment_id, rating, comment, created_at) VALUES (?,?,?,?,?,?,?)', ctx.user.id, doctorId, cid, aid, rating, comment, now()); }
    catch (e) { if (/UNIQUE/.test(e.message)) throw conflict('Siz allaqachon baho qo‘ygansiz'); throw e; }
    notify(doctorId, 'REVIEW', 'Yangi baho: ' + '★'.repeat(rating) + (comment ? ' — ' + comment.slice(0, 80) : ''), '#/doctor/stats');
    if (rating <= 2) notifyAdmins('LOW_RATING', 'Past baho (' + rating + '/5): ' + (comment || 'izohsiz').slice(0, 100), '#/admin/reviews');
    audit(ctx, 'REVIEW_CREATE', 'review', id, String(rating));
    return { id, rating, comment };
  });

  r.get('/doctor/reviews', { auth: ['DOCTOR'] }, (ctx) =>
    all('SELECT r.id, r.rating, r.comment, r.created_at AS createdAt, u.full_name AS author FROM reviews r JOIN users u ON u.id = r.patient_id WHERE r.doctor_id = ? AND r.is_hidden = 0 ORDER BY r.id DESC LIMIT 200', ctx.user.id));

  r.get('/admin/reviews', { auth: ['ADMIN'] }, (ctx) => {
    const low = ctx.query.get('filter') === 'low';
    return all(`SELECT r.id, r.rating, r.comment, r.is_hidden AS hidden, r.created_at AS createdAt, p.full_name AS patient, d.full_name AS doctor, r.doctor_id AS doctorId
      FROM reviews r JOIN users p ON p.id = r.patient_id JOIN users d ON d.id = r.doctor_id ${low ? 'WHERE r.rating <= 2' : ''} ORDER BY r.id DESC LIMIT 300`).map((x) => ({ ...x, hidden: !!x.hidden }));
  });

  r.patch('/admin/reviews/:id', { auth: ['ADMIN'] }, (ctx) => {
    const rv = one('SELECT id FROM reviews WHERE id = ?', Number(ctx.params.id));
    if (!rv) throw notFound('Baho topilmadi');
    run('UPDATE reviews SET is_hidden = ? WHERE id = ?', !!ctx.body.hidden, rv.id);
    audit(ctx, ctx.body.hidden ? 'REVIEW_HIDE' : 'REVIEW_SHOW', 'review', rv.id);
    return { ok: true };
  });

  /* ---------------- support tickets / complaints / feedback ---------------- */
  r.post('/tickets', { auth: ['PATIENT', 'DOCTOR'], status: 201 }, (ctx) => {
    if (!rateLimit('ticket:' + ctx.user.id, 10, 3600000)) throw new HttpError(429, 'Juda ko‘p murojaat. Birozdan keyin urinib ko‘ring');
    const b = ctx.body;
    const kind = KIND_LABEL[b.kind] ? b.kind : null;
    if (!kind) throw bad('Murojaat turini tanlang');
    const subject = str(b.subject, { min: 3, max: 160, field: 'Mavzu', required: true });
    const content = str(b.content, { min: 5, max: 4000, field: 'Matn', required: true });
    let about = null;
    if (kind === 'COMPLAINT' && b.aboutDoctorId) {
      about = one("SELECT user_id FROM doctor_profiles WHERE user_id = ?", Number(b.aboutDoctorId));
      if (!about) throw bad('Shifokor topilmadi');
    }
    const rating = kind === 'FEEDBACK' && b.rating != null && b.rating !== '' ? intIn(b.rating, 1, 5, 'Baho') : null;
    const id = tx(() => {
      const tid = insert('INSERT INTO tickets (user_id, kind, subject, about_doctor_id, rating, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', ctx.user.id, kind, subject, about ? about.user_id : null, rating, now(), now());
      insert('INSERT INTO ticket_messages (ticket_id, sender_id, content, created_at) VALUES (?,?,?,?)', tid, ctx.user.id, content, now());
      return tid;
    });
    notifyAdmins(kind === 'COMPLAINT' ? 'COMPLAINT' : 'TICKET', KIND_LABEL[kind] + ': ' + subject, '#/admin/tickets/' + id);
    audit(ctx, 'TICKET_CREATE', 'ticket', id, kind);
    return ticketDto(one('SELECT * FROM tickets WHERE id = ?', id), true);
  });

  r.get('/tickets/my', { auth: ['PATIENT', 'DOCTOR'] }, (ctx) =>
    all('SELECT * FROM tickets WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100', ctx.user.id).map((t) => ticketDto(t, false)));

  r.get('/tickets/:id', { auth: true }, (ctx) => ticketDto(loadTicket(ctx), true));

  r.post('/tickets/:id/messages', { auth: true, status: 201 }, (ctx) => {
    const t = loadTicket(ctx);
    if (t.status === 'CLOSED') throw bad('Murojaat yopilgan. Yangi murojaat yarating');
    if (!rateLimit('tmsg:' + ctx.user.id, 30, 60000)) throw new HttpError(429, 'Juda tez yozyapsiz');
    const content = str(ctx.body.content, { min: 1, max: 4000, field: 'Xabar', required: true });
    const admin = ctx.user.role === 'ADMIN';
    tx(() => {
      insert('INSERT INTO ticket_messages (ticket_id, sender_id, content, created_at) VALUES (?,?,?,?)', t.id, ctx.user.id, content, now());
      run('UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?', admin ? 'ANSWERED' : 'OPEN', now(), t.id);
    });
    if (admin) notify(t.user_id, 'SUPPORT', 'Administrator javob berdi: ' + content.slice(0, 80), '#/support/' + t.id);
    else notifyAdmins('TICKET', 'Yangi xabar: ' + t.subject, '#/admin/tickets/' + t.id);
    return ticketDto(one('SELECT * FROM tickets WHERE id = ?', t.id), true);
  });

  r.patch('/tickets/:id', { auth: true }, (ctx) => {
    const t = loadTicket(ctx);
    const status = ctx.body.status;
    if (!['OPEN', 'ANSWERED', 'CLOSED'].includes(status)) throw bad('Holat noto‘g‘ri');
    if (ctx.user.role !== 'ADMIN' && status !== 'CLOSED') throw forbidden();
    run('UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?', status, now(), t.id);
    if (ctx.user.role === 'ADMIN' && status === 'CLOSED') notify(t.user_id, 'SUPPORT', 'Murojaatingiz yopildi: ' + t.subject, '#/support/' + t.id);
    audit(ctx, 'TICKET_' + status, 'ticket', t.id);
    return ticketDto(one('SELECT * FROM tickets WHERE id = ?', t.id), true);
  });

  r.get('/admin/tickets', { auth: ['ADMIN'] }, (ctx) => {
    const st = ['OPEN', 'ANSWERED', 'CLOSED'].includes(ctx.query.get('status')) ? ctx.query.get('status') : null;
    const kind = KIND_LABEL[ctx.query.get('kind')] ? ctx.query.get('kind') : null;
    return all(`SELECT * FROM tickets WHERE (? IS NULL OR status = ?) AND (? IS NULL OR kind = ?) ORDER BY CASE status WHEN 'OPEN' THEN 0 WHEN 'ANSWERED' THEN 1 ELSE 2 END, updated_at DESC LIMIT 300`, st, st, kind, kind)
      .map((t) => ticketDto(t, false));
  });
}
