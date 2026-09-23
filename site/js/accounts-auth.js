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

  async function signup({ firstName, lastName, email, password }) {
    return jsonFetch('/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName, lastName, email, password }),
    });
  }

  async function login({ email, password, remember }) {
    const data = await jsonFetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    try {
      // remember !== false -> comportement historique (persistant) par
      // defaut ; decoche explicitement "Se souvenir de moi" -> sessionStorage.
      const store = remember === false ? sessionStorage : localStorage;
      store.setItem(TOKEN_KEY, data.token);
      store.setItem(USER_KEY, JSON.stringify(data.user));
    } catch (e) { /* stockage indisponible */ }
    return data.user;
  }

  function logout() {
    const headers = authHeaders();
    try {
      localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY);
      sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(USER_KEY);
    } catch (e) { /* tant pis */ }
    if (headers.Authorization) {
      fetch(`${apiBase()}/logout`, { method: 'POST', headers }).catch(() => {});
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

  // Protege une page reservee aux comptes connectes/approuves - a appeler en
  // haut du <body> des pages qui en ont besoin. Remplace CHESTAuth.guard()
  // (ancien code d'acces partage) comme porte d'entree principale du site
  // depuis le 2026-09-14 - retour direct utilisateur.
  function guard() {
    if (!isLoggedIn()) {
      window.location.replace('login.html');
    }
  }

  // Deconnexion immediate d'un compte bloque (2026-09-24, demande utilisateur : "quand je bloque une
  // personne... qu'elle soit deconnectee a l'instant T et ne puisse plus se reco"). POST
  // /members/<id>/block supprime deja la session cote serveur (voir server.py), mais rien cote
  // client ne le detectait avant : guard() ne verifie que la PRESENCE locale d'un jeton, jamais sa
  // validite reelle - un membre bloque gardait donc un acces complet a l'app (toutes les pages qui
  // ne font aucun appel serveur) jusqu'a l'expiration naturelle du jeton (30 jours). /me verifie la
  // session aupres du serveur au chargement de CHAQUE page qui charge ce fichier (iframe comme
  // app.html), puis toutes les 2 minutes tant que la page reste ouverte - sur 401 (session absente,
  // supprimee par un blocage), deconnexion + retour a l'ecran de connexion. Ne rien faire sur une
  // simple coupure reseau (fetch() qui echoue), jamais deconnecter pour ca.
  async function verifySessionAlive() {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${apiBase()}/me`, { headers: { Authorization: 'Bearer ' + token } });
      if (res.status === 401 || res.status === 403) {
        logout();
        (window.top || window).location.href = 'login.html';
      }
    } catch (e) { /* serveur injoignable - pas un motif de deconnexion */ }
  }
  verifySessionAlive();
  setInterval(verifySessionAlive, 120000);

  return { getToken, getUser, isLoggedIn, isAdmin, signup, login, logout, fetchMembers, approveMember, rejectMember, resetMemberPassword, blockMember, guard };
})();
