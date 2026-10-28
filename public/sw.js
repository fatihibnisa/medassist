// MedAssist service worker: caches the app shell for fast loads / offline start. API calls are never cached.
const CACHE = 'medassist-v3';
const SHELL = ['/', '/index.html', '/css/app.css', '/css/app2.css', '/js/app.js', '/js/core.js', '/js/ui.js', '/js/i18n.js', '/js/i18n-dict.js', '/js/charts.js', '/js/reminders.js', '/shared/clinical.js',
  '/js/views/public.js', '/js/views/auth.js', '/js/views/patient.js', '/js/views/doctor.js', '/js/views/admin.js', '/js/views/common.js', '/icons/icon-192.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // Network first, cache fallback — bypass the browser's HTTP cache too, so a stale disk-cached
  // response (from before a deploy) can never masquerade as "fresh" while online.
  e.respondWith(fetch(e.request, { cache: 'no-store' }).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return r; }).catch(() => caches.match(e.request).then((m) => m || caches.match('/index.html'))));
});
// Tapping a reminder / notification opens the app on the linked screen.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const link = (e.notification.data && e.notification.data.link) || '#/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const c = list.find((w) => new URL(w.url).origin === location.origin);
    if (c) { c.focus(); return c.navigate('/' + link.replace(/^\/?/, '')); }
    return self.clients.openWindow('/' + link.replace(/^\/?/, ''));
  }));
});
