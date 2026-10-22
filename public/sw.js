// Service worker de Gestion Pro : sert UNIQUEMENT à recevoir les notifications (M6.4). Il ne met rien en cache et ne touche pas aux pages.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = {}; }
  const en = /^en/i.test((self.navigator && self.navigator.language) || '');
  const m = (en ? d.en : d.fr) || d.fr || d.en || { title: 'Gestion Pro', body: '' };
  e.waitUntil(self.registration.showNotification(String(m.title || 'Gestion Pro'), {
    body: String(m.body || ''),
    icon: '/icon-192.png',
    badge: '/favicon-32.png',
    tag: typeof d.tag === 'string' ? d.tag : undefined,
    data: { url: typeof d.url === 'string' && d.url.startsWith('/') ? d.url : '/' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
