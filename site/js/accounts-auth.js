// CHEST — client du backend de comptes (accounts-bridge/server.py).
// Jeton + infos utilisateur stockes dans localStorage (comme le reste du
// site) une fois connecte. Voir accounts-bridge/README.md pour l'API.
window.CHESTAccounts = (() => {
  'use strict';
  const TOKEN_KEY = 'chest_account_token';
  const USER_KEY = 'chest_account_user';

  function apiBase() {
    const configured = window.CHEST_CONFIG && window.CHEST_CONFIG.accountsApiUrl;
    return configured || 'http://localhost:8080';
  }

  // "Se souvenir de moi" (page de connexion) : quand decoche, la session vit
  // dans sessionStorage (effacee a la fermeture du navigateur) plutot que
  // localStorage (persistante) - getToken/getUser lisent les deux pour que
  // le reste du site n'ait pas a se soucier d'où la session a ete rangee.
  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }
  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY) || 'null'); } catch (e) { return null; }
  }
  function isLoggedIn() { return !!getToken(); }
  function isAdmin() { const u = getUser(); return !!(u && u.isAdmin); }

  async function jsonFetch(path, options) {
    let res;
    try {
      res = await fetch(`${apiBase()}${path}`, options);
    } catch (e) {
      // fetch() rejette avec un TypeError "Failed to fetch" (anglais, brut du
      // navigateur) quand le serveur de comptes est injoignable (pas demarre,
      // mauvaise URL...) - on le traduit ici plutot que de laisser ce message
      // technique remonter tel quel dans le formulaire (retour direct
      // utilisateur du 2026-09-16 : messages d'erreur pas en francais).
      throw new Error('Impossible de contacter le serveur de comptes. Vérifie ta connexion et réessaie.');
    }
    let data = {};
    try { data = await res.json(); } catch (e) { /* reponse vide (ex. logout) */ }
    if (!res.ok) throw new Error(data.error || `Erreur (${res.status})`);
    return data;
  }

  function authHeaders() {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  // Lien d'un éducateur (2026-10-25) : /inscription?ref=CODE. Le code est gardé le temps de l'inscription
  // (même si la personne navigue avant de s'inscrire) et envoyé avec le formulaire.
  const REF_KEY = 'chest_ref_code';
  try {
    const ref = new URLSearchParams(location.search).get('ref');
    if (ref && /^[a-z0-9-]{3,40}$/i.test(ref)) localStorage.setItem(REF_KEY, ref);
  } catch (e) { /* stockage indisponible */ }
  function referralCode() { try { return localStorage.getItem(REF_KEY) || ''; } catch (e) { return ''; } }
  async function signup({ firstName, lastName, email, password, ref: typed, acceptTerms }) {
    const ref = typed != null ? String(typed).trim() : referralCode();
    const out = await jsonFetch('/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName, lastName, email, password, ref: ref || undefined, acceptTerms: acceptTerms === true }),
    });
    try { localStorage.removeItem(REF_KEY); } catch (e) { /* tant pis */ }
    return out;
  }

  // Membre stocké mis à jour là où il est rangé (localStorage ou sessionStorage).
  function storeUser(user) {
    try {
      if (localStorage.getItem(USER_KEY)) localStorage.setItem(USER_KEY, JSON.stringify(user));
      if (sessionStorage.getItem(USER_KEY)) sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (e) { /* stockage indisponible */ }
  }

  // ---- Offres et accès (2026-10-18) : user.access = { plan, label, period, status, startedAt, endsAt,
  // active, trial, trialUsed, school, berich, sync, paid } (calculé par le serveur, voir access_of). ----
  function access() { const u = getUser(); return (u && u.access) || null; }
  function hasAccess() { const u = getUser(); if (!u) return false; if (u.isAdmin) return true; const a = u.access; return !a || !!a.active; }
  function hasFeature(f) { const u = getUser(); if (!u) return false; if (u.isAdmin) return true; const a = u.access; return !a || !!a[f]; }
  async function refreshMe() {
    const token = getToken();
    if (!token) return null;
    const user = await jsonFetch('/me', { headers: { Authorization: 'Bearer ' + token } });
    storeUser(user);
    return user;
  }
  async function startTrial() {
    const user = await jsonFetch('/billing/trial', { method: 'POST', headers: authHeaders() });
    storeUser(user);
    return user;
  }
  async function saveOnboarding(answers, recommended) {
    return jsonFetch('/me/onboarding', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()), body: JSON.stringify({ answers, recommended }) });
  }
  // Activité : une ligne « page vue » par chargement de page du shell (jamais de contenu).
  function logActivity(page) {
    const token = getToken();
    if (!token || !/^[a-z-]{2,40}$/.test(page || '')) return;
    fetch(`${apiBase()}/me/activity`, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ page }) }).catch(() => {});
  }
  // Accès donné à la main : `days` (durée) OU `until` (AAAA-MM-JJ, fin de journée) ; ni l'un ni l'autre = sans limite (Privilège).
  async function setMemberAccess(id, plan, days, until, level) {
    return jsonFetch(`/members/${id}/access`, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()), body: JSON.stringify({ plan, days, until: until || '', level: level || undefined }) });
  }
  // Hiérarchie : member | educator | admin.
  async function setMemberRole(id, role) {
    return jsonFetch(`/members/${id}/role`, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()), body: JSON.stringify({ role }) });
  }
  async function fetchAdminStats(days) {
    return jsonFetch(`/admin/stats?days=${encodeURIComponent(days || 30)}`, { headers: authHeaders() });
  }

  // Vidéo de présentation vue en entier (js/tuto.js) : le serveur le retient, et le membre stocké est mis à jour
  // là où il est rangé (localStorage ou sessionStorage), pour ne plus la rendre obligatoire.
  async function markTutoSeen() {
    const token = getToken();
    if (!token) return null;
    const user = await jsonFetch('/me/tuto-seen', { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
    storeUser(user);
    return user;
  }

  async function login({ email, password, remember }) {
    const data = await jsonFetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    try {
      // BUG RÉEL (2026-10-13, retour utilisateur : "j'ai créé un autre compte et je vois mes
      // éléments de mon compte principal") : se connecter à un AUTRE compte dans le même navigateur
      // sans être passé par logout() (jeton expiré, test de plusieurs comptes...) laissait les
      // données de l'ancien compte en localStorage - vues (et potentiellement repoussées) sous le
      // nouveau compte. On compare AVANT d'écraser USER_KEY : même compte qui se reconnecte (jeton
      // expiré) -> on garde tout, rien à perdre ; compte différent -> données locales purgées
      // (jamais celles du serveur, voir CHESTSync.clearLocalData).
      // 2026-10-14 : on compare aussi au propriétaire des données du navigateur (chest_data_owner, posé par
      // sync-store.js), plus fiable que le membre en cache (effacé à la déconnexion ou rangé en session).
      const prevUser = getUser();
      let owner = null;
      try { owner = localStorage.getItem('chest_data_owner'); } catch (e) { /* tant pis */ }
      const sameUser = owner ? owner === String(data.user.id) : !!(prevUser && prevUser.id === data.user.id);
      if (!sameUser) {
        try { window.CHESTSync && window.CHESTSync.clearLocalData && window.CHESTSync.clearLocalData(); } catch (e) { /* tant pis */ }
      }
      // remember !== false -> comportement historique (persistant) par
      // defaut ; decoche explicitement "Se souvenir de moi" -> sessionStorage.
      const store = remember === false ? sessionStorage : localStorage;
      store.setItem(TOKEN_KEY, data.token);
      store.setItem(USER_KEY, JSON.stringify(data.user));
      if (window.CHESTSync && window.CHESTSync.setOwner) window.CHESTSync.setOwner(data.user.id);
      else localStorage.setItem('chest_data_owner', String(data.user.id));
    } catch (e) { /* stockage indisponible */ }
    return data.user;
  }

  // Notifications push : l'appareil est désabonné à la déconnexion (serveur + navigateur). Sans ça, le
  // téléphone d'un membre continuait de recevoir SES notifications (noms de comptes, gains) après qu'un autre
  // membre s'y était connecté (2026-10-14). keepalive : la requête part même si la page change juste après.
  function unsubscribePush(headers) {
    try {
      if (!('serviceWorker' in navigator) || !headers.Authorization) return;
      navigator.serviceWorker.getRegistration().then((reg) => reg && reg.pushManager && reg.pushManager.getSubscription()).then((sub) => {
        if (!sub) return;
        fetch(`${apiBase()}/push/unsubscribe`, {
          method: 'POST', keepalive: true,
          headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        sub.unsubscribe().catch(() => {});
      }).catch(() => {});
    } catch (e) { /* tant pis */ }
  }

  function logout() {
    const headers = authHeaders();
    // l'appareil retenu à l'abonnement (js/pwa.js), lu avant que le nettoyage local ne l'efface
    let endpoint = null; try { endpoint = localStorage.getItem('chest_push_ep'); localStorage.removeItem('chest_push_ep'); } catch (e) { /* tant pis */ }
    unsubscribePush(headers);
    try {
      localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY);
      sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(USER_KEY);
    } catch (e) { /* tant pis */ }
    try { window.CHESTSync && window.CHESTSync.clearLocalData && window.CHESTSync.clearLocalData(); } catch (e) { /* tant pis */ }
    if (headers.Authorization) {
      // /logout retire lui-même cet appareil des notifications, avant de fermer la session
      fetch(`${apiBase()}/logout`, { method: 'POST', keepalive: true, headers: Object.assign({ 'Content-Type': 'application/json' }, headers), body: JSON.stringify({ endpoint }) }).catch(() => {});
    }
  }

  async function fetchMembers() {
    const data = await jsonFetch('/members', { headers: authHeaders() });
    return data.members;
  }
  async function approveMember(id) {
    await jsonFetch(`/members/${id}/approve`, { method: 'POST', headers: authHeaders() });
  }
  async function rejectMember(id) {
    await jsonFetch(`/members/${id}/reject`, { method: 'POST', headers: authHeaders() });
  }
  async function resetMemberPassword(id) {
    const data = await jsonFetch(`/members/${id}/reset-password`, { method: 'POST', headers: authHeaders() });
    return data.newPassword;
  }
  async function blockMember(id) {
    await jsonFetch(`/members/${id}/block`, { method: 'POST', headers: authHeaders() });
  }
  // Suppression définitive d'un membre et de toutes ses données serveur (admin).
  async function deleteMember(id) {
    return jsonFetch(`/members/${id}/delete`, { method: 'POST', headers: authHeaders() });
  }

  // Protege une page reservee aux comptes connectes/approuves - a appeler en
  // haut du <body> des pages qui en ont besoin. Remplace CHESTAuth.guard()
  // (ancien code d'acces partage) comme porte d'entree principale du site
  // depuis le 2026-09-14 - retour direct utilisateur.
  function guard() {
    if (!isLoggedIn()) {
      window.location.replace('/connexion');
    }
  }

  // Deconnexion immediate d'un compte bloque (2026-09-24, demande utilisateur : "quand je bloque une
  // personne... qu'elle soit deconnectee a l'instant T et ne puisse plus se reco"). POST
  // /members/<id>/block supprime deja la session cote serveur (voir server.py), mais rien cote
  // client ne le detectait avant : guard() ne verifie que la PRESENCE locale d'un jeton, jamais sa
  // validite reelle - un membre bloque gardait donc un acces complet a l'app (toutes les pages qui
  // ne font aucun appel serveur) jusqu'a l'expiration naturelle du jeton (30 jours). /me verifie la
  // session aupres du serveur au chargement de CHAQUE page qui charge ce fichier (iframe comme
  // app.html), puis toutes les 2 minutes tant que la page reste ouverte - sur 401 confirme,
  // deconnexion + retour a l'ecran de connexion. Ne rien faire sur une simple coupure reseau
  // (fetch() qui echoue), jamais deconnecter pour ca.
  //
  // BUG REEL rencontre le 2026-09-24 (retour utilisateur : "ca revient a la page de connexion,
  // impossible d'ouvrir") : un premier 401 isole (redemarrage bref du serveur Railway apres l'ajout
  // d'une variable d'environnement, ou tout autre alea reseau/serveur transitoire) suffisait a
  // deconnecter une session par ailleurs valide - confirme en direct via l'onglet Reseau du
  // navigateur de l'utilisateur (une requete GET /me a repondu 401 une seule fois, ce qui a suffi a
  // declencher logout() + la redirection). Pire : logout() appelle POST /logout, qui SUPPRIME la
  // session cote serveur - un seul faux positif dans UN onglet invalide donc la session pour de bon,
  // y compris pour tous les autres onglets deja ouverts sur le meme compte. Corrige en exigeant DEUX
  // 401 consecutifs, espaces de 3 secondes, avant de conclure a une vraie deconnexion - un simple
  // alea isole ne suffit plus, seule une session reellement absente cote serveur echoue deux fois.
  function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
  async function checkMe(token) {
    try {
      const res = await fetch(`${apiBase()}/me`, { headers: { Authorization: 'Bearer ' + token } });
      // Réponse valide : on garde le membre à jour (offre, fin d'accès…) au passage.
      if (res.ok) { try { storeUser(await res.json()); } catch (e) { /* tant pis */ } }
      return res.status;
    } catch (e) { return null; } // serveur injoignable - jamais traite comme un 401
  }
  // Accès terminé (fin d'essai, résiliation, impayé) pendant qu'on utilise le site : direction les offres.
  // Jamais depuis les pages qui servent justement à se connecter ou à choisir une offre.
  function enforceAccess() {
    let top = window;
    try { top = window.top; } catch (e) { /* tant pis */ }
    let path = '';
    try { path = top.location.pathname; } catch (e) { return; }
    if (/^\/(offres|paiement|inscription|connexion)?$/.test(path) || /^\/audit/.test(path) || /(offres|paiement|audit|signup|login|index)\.html$/.test(path)) return;
    if (isLoggedIn() && !hasAccess()) top.location.href = '/offres?raison=fin';
  }
  async function verifySessionAlive() {
    const token = getToken();
    if (!token) return;
    const first = await checkMe(token);
    if (first !== 401 && first !== 403) { enforceAccess(); return; }
    await wait(3000);
    // Le jeton a pu changer entre-temps (reconnexion manuelle pendant les 3s) - on revérifie avec
    // le jeton ACTUEL, pas celui capturé au premier essai.
    const tokenNow = getToken();
    if (!tokenNow) return;
    const second = await checkMe(tokenNow);
    if (second === 401 || second === 403) {
      logout();
      (window.top || window).location.href = '/connexion';
    }
  }
  verifySessionAlive();
  setInterval(verifySessionAlive, 120000);

  return { getToken, getUser, isLoggedIn, isAdmin, signup, markTutoSeen, login, logout, fetchMembers, approveMember, rejectMember, resetMemberPassword, blockMember, deleteMember, guard,
    access, hasAccess, hasFeature, refreshMe, startTrial, saveOnboarding, logActivity, setMemberAccess, setMemberRole, fetchAdminStats, apiBase, referralCode };
})();
