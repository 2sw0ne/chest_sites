// CHEST · PWA (installation + notifications push), 2026-09-26 - demande utilisateur : "app
// installable, logo, notifications". Enregistre le service worker (sw.js) et expose
// CHESTPwa.enableNotifications()/disableNotifications()/notificationStatus() pour le bouton
// "Notifications" d'account.html.
(() => {
  'use strict';

  function apiBase() { return (window.CHEST_CONFIG && window.CHEST_CONFIG.accountsApiUrl) || 'http://localhost:8080'; }
  function authHeaders() {
    const t = window.CHESTAccounts && CHESTAccounts.getToken && CHESTAccounts.getToken();
    return t ? { Authorization: 'Bearer ' + t } : {};
  }

  if ('serviceWorker' in navigator) {
    // 'sw.js' (racine, jamais 'js/sw.js') : la portee d'un service worker est limitee a son
    // propre dossier et en-dessous - a la racine, il couvre tout le site.
    navigator.serviceWorker.register('sw.js').catch(() => { /* pas grave, l'app marche sans */ });
  }

  // Convertit la cle publique VAPID (base64 URL-safe) au format Uint8Array attendu par
  // PushManager.subscribe() - conversion standard documentee par le spec Web Push.
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
    return output;
  }

  // Safari iOS n'expose PushManager/Notification QUE si le site tourne installé
  // depuis l'écran d'accueil (standalone) — restriction Apple depuis iOS 16.4,
  // pas un vrai "navigateur non supporté". Sans cette distinction, un iPhone
  // dans Safari normal affichait "non supportées par ce navigateur", message
  // trompeur puisque le vrai problème est "pas encore installé" (2026-09-26,
  // retour utilisateur).
  function isIOS() { return /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function isStandalone() { return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }

  async function notificationStatus() {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      return (isIOS() && !isStandalone()) ? 'ios-install-required' : 'unsupported';
    }
    if (Notification.permission === 'denied') return 'denied';
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub ? 'enabled' : 'disabled';
  }

  async function enableNotifications() {
    if (!('Notification' in window) || !('PushManager' in window)) throw new Error("Ton navigateur ne supporte pas les notifications.");
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Permission refusée.');
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      // La clé publique vit dans config.js (voir son commentaire : par nature non secrète) -
      // pas besoin d'un aller-retour serveur pour l'obtenir, contrairement à la clé PRIVÉE qui
      // reste uniquement côté serveur (variable d'environnement VAPID_PRIVATE_KEY).
      const publicKey = window.CHEST_CONFIG && window.CHEST_CONFIG.vapidPublicKey;
      if (!publicKey) throw new Error("Notifications pas encore configurées.");
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
    }
    await fetch(apiBase() + '/push/subscribe', {
      method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()), body: JSON.stringify(sub.toJSON()),
    });
    return true;
  }

  async function disableNotifications() {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return true;
    await fetch(apiBase() + '/push/unsubscribe', {
      method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()), body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {});
    await sub.unsubscribe();
    return true;
  }

  window.CHESTPwa = { notificationStatus, enableNotifications, disableNotifications };
})();
