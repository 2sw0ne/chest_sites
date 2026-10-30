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
    // '/sw.js' (racine, jamais 'js/sw.js') : la portee d'un service worker est limitee a son
    // propre dossier et en-dessous - a la racine, il couvre tout le site. Chemin absolu : une page
    // servie sous /legal/... ou /rejoindre/... visait sinon /legal/sw.js (2026-10-30).
    navigator.serviceWorker.register('/sw.js').catch(() => { /* pas grave, l'app marche sans */ });
  }

  // Le service worker actif. `ready` ne se résout jamais si l'enregistrement a échoué : le bouton
  // « Activer » restait alors bloqué sans rien dire (2026-10-30). On attend 10 s au plus.
  async function workerReady() {
    if (!(await navigator.serviceWorker.getRegistration('/'))) await navigator.serviceWorker.register('/sw.js');
    return Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, ko) => setTimeout(() => ko(new Error("Le service des notifications ne démarre pas : recharge la page et réessaie.")), 10000)),
    ]);
  }
  const FLAG = 'chest_push_on';
  // Notifications toujours actives (2026-10-31, demande utilisateur : « jamais redemandé et toujours activé ») :
  // seul un « Désactiver » explicite (Compte) les coupe sur cet appareil, et ce choix est retenu ici.
  const OFF = 'chest_push_off';
  const getLs = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const setLs = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* navigation privée */ } };
  function flag(v) {
    try {
      if (v === undefined) return localStorage.getItem(FLAG) === '1';
      if (v) localStorage.setItem(FLAG, '1'); else localStorage.removeItem(FLAG);
    } catch (e) { /* navigation privée */ }
    return false;
  }

  async function saveSubscription(sub) {
    const res = await fetch(apiBase() + '/push/subscribe', {
      method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()), body: JSON.stringify(sub.toJSON()),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || "Le serveur n'a pas enregistré cet appareil (erreur " + res.status + ').');
    }
  }
  function subscribe(reg) {
    // La clé publique vit dans config.js (voir son commentaire : par nature non secrète) -
    // pas besoin d'un aller-retour serveur pour l'obtenir, contrairement à la clé PRIVÉE qui
    // reste uniquement côté serveur (variable d'environnement VAPID_PRIVATE_KEY).
    const publicKey = window.CHEST_CONFIG && window.CHEST_CONFIG.vapidPublicKey;
    if (!publicKey) throw new Error("Notifications pas encore configurées.");
    return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
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
    const reg = await workerReady().catch(() => null);
    const sub = reg && await reg.pushManager.getSubscription();
    return sub ? 'enabled' : 'disabled';
  }

  async function enableNotifications() {
    if (!('Notification' in window) || !('PushManager' in window)) throw new Error("Ton navigateur ne supporte pas les notifications.");
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Permission refusée.');
    const reg = await workerReady();
    const sub = (await reg.pushManager.getSubscription()) || (await subscribe(reg));
    // avant : réponse du serveur ignorée → « activées » affiché alors que l'appareil n'était pas enregistré
    await saveSubscription(sub);
    flag(true);
    setLs(OFF, null);
    return true;
  }

  async function disableNotifications() {
    flag(false);
    setLs(OFF, '1');
    const reg = await workerReady();
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return true;
    await fetch(apiBase() + '/push/unsubscribe', {
      method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()), body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {});
    await sub.unsubscribe();
    return true;
  }

  // Une fois activées, elles doivent le rester : le navigateur renouvelle parfois l'abonnement, le
  // serveur efface ceux qui ont expiré (410), une connexion sur un autre compte le rattache ailleurs.
  // À l'ouverture et au retour sur l'app (au plus 1 fois / 30 min), on renvoie l'abonnement de cet
  // appareil au serveur, et on le recrée sans rien demander si la permission est déjà donnée.
  // Depuis le 2026-10-31 : la permission déjà donnée suffit, l'abonnement est recréé sans condition (avant : seulement
  // si l'appareil avait été activé depuis ce code, ce qui laissait des téléphones désabonnés sans rien dire).
  let lastSync = 0;
  async function resync() {
    if (Date.now() - lastSync < 30 * 60 * 1000 || !('PushManager' in window) || !('Notification' in window)) return;
    if (Notification.permission !== 'granted' || getLs(OFF) || !(window.CHESTAccounts && CHESTAccounts.getToken && CHESTAccounts.getToken())) return;
    lastSync = Date.now();
    try {
      const reg = await workerReady();
      const sub = (await reg.pushManager.getSubscription()) || (await subscribe(reg));
      await saveSubscription(sub);
      flag(true);
    } catch (e) { lastSync = 0; }
  }
  // Pas de demande automatique (retour utilisateur du 2026-10-31) : l'autorisation se donne une fois par le bouton
  // « Activer » (Compte, Stratégies), qui disparaît ensuite ; on/off se règle par type dans Compte → notifications.
  if (window === window.top) {
    setTimeout(resync, 4000);
    setInterval(() => { if (!document.hidden) resync(); }, 30 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) resync(); });
  }

  window.CHESTPwa = { notificationStatus, enableNotifications, disableNotifications, resync };
})();
