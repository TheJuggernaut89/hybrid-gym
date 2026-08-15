/* Hybrid Combative HUD — minimal offline shell.
   Network-first for navigations, cache-first for build assets.
   API and auth traffic is never cached. */

const CACHE = 'hybrid-hud-v1';
const SHELL = ['/offline', '/icons/bull.svg', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/* ── push ──────────────────────────────────────────────────────────────────
   THE SLOT computes an approaching / imminent / lapsed phase machine, but
   before this handler existed none of it could reach anybody: the app was
   pull-only, so a reminder was visible only to someone who had already opened
   it. The person deciding not to come is, by definition, the person not
   opening the app.

   Payload shape (see supabase/functions/slot-reminders):
     { title, body, tag, url, renotify } */
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'HYBRID COMBATIVE';
  const options = {
    body: payload.body || '',
    icon: '/icons/bull.svg',
    badge: '/icons/bull.svg',
    // Tagging by slot means a re-sent reminder REPLACES the earlier one
    // instead of stacking three notifications for the same class.
    tag: payload.tag || 'hybrid-slot',
    renotify: Boolean(payload.renotify),
    requireInteraction: false,
    data: { url: payload.url || '/now' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/now';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus an existing tab rather than opening a second copy of the app.
      for (const client of clients) {
        if (client.url.includes(target) && 'focus' in client) return client.focus();
      }
      for (const client of clients) {
        if ('navigate' in client && 'focus' in client) {
          return client.navigate(target).then((c) => (c ? c.focus() : undefined));
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

/* A subscription can be rotated by the browser at any time. Without this the
   endpoint silently goes stale and delivery stops with no error anywhere. */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe(event.oldSubscription ? event.oldSubscription.options : undefined)
      .then((sub) =>
        fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub),
        }),
      )
      .catch(() => {}),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;

  // Immutable build output — cache first.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
            return res;
          }),
      ),
    );
    return;
  }

  // Pages — network first, fall back to the offline shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/offline').then((hit) => hit || Response.error())),
    );
  }
});
