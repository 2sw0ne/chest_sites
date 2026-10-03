// CHEST · Service worker (2026-09-26, demande utilisateur : "app installable + notifications").
// Volontairement TRES prudent sur le cache : ce site a déjà sa propre convention de
// cache-busting (?v=N sur chaque script/style, voir CLAUDE.md - "incrémenter ?v= à chaque
// modification") qui a causé plusieurs bugs cette session quand le navigateur servait une
// version périmée. Un service worker qui cache-first par-dessus créerait exactement le même
// problème, en pire (un cache qui survit même à un rechargement forcé). Stratégie retenue :
// - Réseau d'abord pour TOUT sauf les icônes (network-first, repli sur le cache seulement si
//   hors-ligne) : en ligne, on a toujours la dernière version ; hors-ligne, on a au moins
//   quelque chose plutôt qu'un écran blanc.
// - Les icônes (assets/icon-*.png) ne changent jamais entre deux visites : cache-first, elles.
const CACHE_NAME = 'chest-v1';
const ICON_PATHS = ['assets/icon-192.png', 'assets/icon-512.png', 'assets/icon-192-maskable.png', 'assets/icon-512-maskable.png'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ICON_PATHS)).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return; // API/cross-origin : jamais intercepte

  const isIcon = ICON_PATHS.some((p) => url.pathname.endsWith('/' + p));
  if (isIcon) {
    event.respondWith(caches.match(event.request).then((hit) => hit || fetch(event.request)));
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, res.clone())).catch(() => {});
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

// ---------------- Notifications push ----------------
// Le SERVEUR declenche l'envoi - /push/send (test admin, account.html), /push/broadcast (signal
// BERICH, annonce calendrier, nouveau membre - voir berich-bridge/calendar-bridge/accounts-bridge,
// section CLAUDE.md "Declencheurs de notifications push"). Ce fichier ne fait qu'afficher la
// notification recue et reagir a son clic.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : '' }; }
  // 2026-10-03 (demande utilisateur) : titre = "CHEST", l'information va dans le MESSAGE.
  // Le serveur envoie la ligne ("🇺🇸 - M-30 PMI manufacturier (prévu 49,5)", "ALLIN - TP✔️
  // +1964,57$") en `title` ; titre et corps éventuels sont réunis dans le corps. La ligne
  // "from CHEST" qu'iOS ajoute sous une app installée depuis Safari est imposée par Apple.
  const info = [data.title, data.body].filter(Boolean).join(' — ');
  const title = 'CHEST';
  const options = {
    body: info,
    icon: 'assets/icon-192.png',
    badge: 'assets/icon-192.png',
    data: { url: data.url || 'app.html' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || 'app.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      const existing = clientsArr.find((c) => c.url.includes(new URL(targetUrl, self.location.origin).pathname));
      if (existing) return existing.focus();
      return self.clients.openWindow(targetUrl);
    })
  );
});
