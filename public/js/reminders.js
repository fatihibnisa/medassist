// Medication reminders — an alarm clock in the page. While MedAssist is open (or installed and running),
// each due dose rings: modal + repeating chime + vibration + a system notification if permitted.
import { api, esc, icon, t, fmtTime, toast, app, session } from './core.js';
import { showSystemNotification, systemNotifications } from './ui.js';

export const meds = { data: null, loadedAt: 0 };
let timer = null, poll = null, ringing = null, audio = null;
const snoozed = new Map(); // key → until
const rung = new Set();
const key = (d) => d.itemId + ':' + d.dueAt;

export const itemOf = (d) => { for (const c of (meds.data && meds.data.courses) || []) { const it = c.items.find((i) => i.id === d.itemId); if (it) return { ...it, number: c.number }; } return null; };

export async function refreshMeds() {
  if (!session.user || session.user.role !== 'PATIENT') return null;
  meds.data = await api('/tracker');
  meds.loadedAt = Date.now();
  schedule();
  return meds.data;
}

/** Doses that should ring now: due within the last 3 hours, not logged, not snoozed. */
function dueNow() {
  const now = Date.now();
  return ((meds.data && meds.data.doses) || []).filter((d) => !d.status && d.dueAt <= now && d.dueAt > now - 3 * 3600000 && !(snoozed.get(key(d)) > now));
}
function schedule() {
  clearTimeout(timer);
  if (!meds.data) return;
  const now = Date.now();
  const pending = dueNow().filter((d) => !rung.has(key(d)) || snoozed.has(key(d)));
  if (pending.length && !ringing) { ring(pending[0]); return; }
  const next = meds.data.doses.filter((d) => !d.status && d.dueAt > now).map((d) => d.dueAt)
    .concat([...snoozed.values()].filter((v) => v > now)).sort((a, b) => a - b)[0];
  if (next) timer = setTimeout(schedule, Math.min(next - now + 500, 2147000000));
}

function chime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return;
    audio = audio || new Ctx();
    const tone = (f, at, dur) => { const o = audio.createOscillator(); const g = audio.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, audio.currentTime + at); g.gain.exponentialRampToValueAtTime(0.25, audio.currentTime + at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + at + dur); o.connect(g).connect(audio.destination); o.start(audio.currentTime + at); o.stop(audio.currentTime + at + dur + 0.05); };
    tone(880, 0, 0.35); tone(1175, 0.4, 0.35); tone(1568, 0.8, 0.5);
  } catch { /* autoplay blocked until the first user gesture */ }
}

function ring(d) {
  const it = itemOf(d); if (!it) return;
  rung.add(key(d)); snoozed.delete(key(d));
  const host = document.createElement('div');
  host.className = 'alarm-host';
  host.innerHTML = '<div class="overlay"></div><div class="alarm glass" role="alertdialog" aria-modal="true" aria-labelledby="alarm-t">' +
    '<div class="alarm-ring">' + icon('alarm', 40, 2) + '</div><h2 id="alarm-t">' + esc(t('Dori ichish vaqti')) + '</h2>' +
    '<div class="alarm-time">' + fmtTime(d.dueAt) + '</div>' +
    '<div class="med"><b>' + esc(it.name + ' ' + it.strength) + '</b><span class="sm">' + esc(it.dosage) + (it.instructions ? ' · ' + esc(it.instructions) : '') + '</span></div>' +
    '<div class="grid g3" style="gap:8px;width:100%"><button class="btn btn-ghost" data-r="SKIPPED">' + esc(t('O‘tkazib yubordim')) + '</button><button class="btn" data-r="SNOOZE">' + icon('clock', 18) + esc(t('10 daqiqadan keyin')) + '</button><button class="btn btn-primary" data-r="TAKEN">' + icon('check', 18, 2.6) + esc(t('Ichdim')) + '</button></div></div>';
  document.body.appendChild(host);
  ringing = { d, host };
  chime(); const loop = setInterval(chime, 4000);
  if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]);
  showSystemNotification(t('Dori ichish vaqti'), it.name + ' ' + it.strength + ' — ' + it.dosage, '#/app/meds');
  const done = async (r) => {
    clearInterval(loop); host.remove(); ringing = null;
    if (r === 'SNOOZE') { snoozed.set(key(d), Date.now() + 10 * 60000); toast(t('10 daqiqadan keyin eslatamiz'), 'info'); schedule(); return; }
    try { await markDose(d.itemId, d.dueAt, r); } catch (e) { toast(e.message, 'err'); }
  };
  host.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => done(b.dataset.r)));
  host.querySelector('[data-r="TAKEN"]').focus();
}

export async function markDose(itemId, dueAt, status) {
  await api('/tracker/doses', { method: 'POST', body: { itemId, dueAt, status } });
  const d = meds.data && meds.data.doses.find((x) => x.itemId === itemId && x.dueAt === dueAt);
  if (d) d.status = status;
  toast(status === 'TAKEN' ? t('Belgilandi: dori ichildi') : t('Belgilandi: o‘tkazib yuborildi'), status === 'TAKEN' ? 'ok' : 'info');
  refreshMeds().catch(() => {});
  app.queue();
}

export function startReminders() {
  if (poll) return;
  refreshMeds().catch(() => {});
  poll = setInterval(() => { refreshMeds().catch(() => {}); }, 5 * 60000);
  document.addEventListener('visibilitychange', onVisible);
}
function onVisible() { if (!document.hidden && Date.now() - meds.loadedAt > 60000) refreshMeds().catch(() => {}); }
export function stopReminders() {
  clearInterval(poll); poll = null; clearTimeout(timer); meds.data = null; rung.clear(); snoozed.clear();
  if (ringing) { ringing.host.remove(); ringing = null; }
  document.removeEventListener('visibilitychange', onVisible);
}
export { systemNotifications };
