import { startApp, route, app, session, refreshSession, globalActions, onAfterRender } from './core.js';
import './body-map.js'; // registers the <body-map> custom element used by the "Tana xaritasi" picker
import { notifActions, startNotifications, stopNotifications, drawer } from './ui.js';
import { startReminders, stopReminders } from './reminders.js';
import { animateCounts } from './charts.js';
import { landingView, verifyView, notFoundView } from './views/public.js';
import { loginView, registerView, resetView } from './views/auth.js';
import { patientHome, patientHistory, patientNew, patientDetail, patientProfile, findDoctors, conditionPicker, doctorPage, patientVisits, patientMeds, patientNearby } from './views/patient.js';
import { doctorHome, doctorWorkspace, doctorVisits, doctorSchedule, doctorStats, doctorProfile } from './views/doctor.js';
import { adminStats, adminQueue, adminDoctors, adminUsers, adminMedicines, adminAudit, adminReviews, adminTickets, adminReports, adminProfile, ticketDetail } from './views/admin.js';
import { supportView, supportDetail, notificationsView } from './views/common.js';

Object.assign(globalActions, notifActions);
const logout = globalActions.logout;
globalActions.logout = async (el, e) => { stopNotifications(); stopReminders(); drawer.open = false; await logout(el, e); };
onAfterRender(animateCounts);
window.addEventListener('hashchange', () => { drawer.open = false; });

const P = ['PATIENT'], D = ['DOCTOR'], A = ['ADMIN'], PD = ['PATIENT', 'DOCTOR'], ALL = ['PATIENT', 'DOCTOR', 'ADMIN'];
route('/', () => landingView());
route('/verify', (p) => verifyView(p));
route('/verify/:code', (p) => verifyView(p));
route('/login', () => loginView(), { guestOnly: true });
route('/register', (p) => registerView(p), { guestOnly: true });
route('/reset', () => resetView(), { guestOnly: true });
route('/notifications', () => notificationsView(), { roles: ALL });
route('/support', (p) => supportView(p), { roles: PD });
route('/support/:id', (p) => supportDetail(p), { roles: PD });

route('/app', () => patientHome(), { roles: P });
route('/app/history', () => patientHistory(), { roles: P });
route('/app/new', (p) => patientNew(p), { roles: P });
route('/app/c/:id', (p) => patientDetail(p), { roles: P });
route('/app/doctors', (p) => findDoctors(p), { roles: P });
route('/app/doctors/condition', () => conditionPicker(), { roles: P });
route('/app/doctor/:id', (p) => doctorPage(p), { roles: P });
route('/app/visits', () => patientVisits(), { roles: P });
route('/app/meds', () => patientMeds({}), { roles: P });
route('/app/meds/:section', (p) => patientMeds(p), { roles: P });
route('/app/nearby', () => patientNearby(), { roles: P });
route('/app/profile', () => patientProfile({}), { roles: P });
route('/app/profile/:section', (p) => patientProfile(p), { roles: P });

route('/doctor', () => doctorHome(), { roles: D });
route('/doctor/queue', () => doctorWorkspace({}), { roles: D });
route('/doctor/c/:id', (p) => doctorWorkspace({ id: p.id }), { roles: D });
route('/doctor/done', () => doctorWorkspace({ filter: 'done' }), { roles: D });
route('/doctor/done/c/:id', (p) => doctorWorkspace({ filter: 'done', id: p.id }), { roles: D });
route('/doctor/visits', (p) => doctorVisits(p), { roles: D });
route('/doctor/schedule', () => doctorSchedule(), { roles: D });
route('/doctor/stats', () => doctorStats(), { roles: D });
route('/doctor/profile', () => doctorProfile({}), { roles: D });
route('/doctor/profile/:section', (p) => doctorProfile(p), { roles: D });

route('/admin', () => adminStats(), { roles: A });
route('/admin/queue', (p) => adminQueue(p), { roles: A });
route('/admin/doctors', () => adminDoctors(), { roles: A });
route('/admin/users', () => adminUsers(), { roles: A });
route('/admin/medicines', () => adminMedicines(), { roles: A });
route('/admin/reviews', () => adminReviews(), { roles: A });
route('/admin/tickets', () => adminTickets(), { roles: A });
route('/admin/tickets/:id', (p) => ticketDetail(p, true), { roles: A });
route('/admin/reports', () => adminReports(), { roles: A });
route('/admin/audit', () => adminAudit(), { roles: A });
route('/admin/profile', () => adminProfile({}), { roles: A });
route('/admin/profile/:section', (p) => adminProfile(p), { roles: A });
route('/404', () => notFoundView(), { notFound: true });

(async () => {
  startApp(document.getElementById('app'));
  if (await refreshSession()) { startNotifications(); if (session.user.role === 'PATIENT') startReminders(); }
  const boot = document.getElementById('boot'); if (boot) boot.remove();
  await app.navigate();
  // On localhost (active development) a cached service worker causes more confusion than it's worth —
  // drop any previously-registered one so every reload is guaranteed to hit the real server.
  if ('serviceWorker' in navigator) {
    if (location.hostname === 'localhost') navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
    else if (location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
})();

// Keep the access token fresh while the tab is open (access TTL is 15 min).
setInterval(() => { if (session.user) refreshSession(true); }, 10 * 60 * 1000);
