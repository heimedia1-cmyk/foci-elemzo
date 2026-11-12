self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => {
  let d = {}; try { d = e.data.json(); } catch (err) { d = { title: 'Foci Elemző', body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Foci Elemző', { body: d.body || '', tag: d.tag, icon: '/icon-192.png', badge: '/icon-192.png', data: { url: d.url || '/' }, vibrate: [120, 60, 120] }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(cs => { for (const c of cs) { if ('focus' in c) { c.navigate(url); return c.focus(); } } return self.clients.openWindow(url); }));
});
