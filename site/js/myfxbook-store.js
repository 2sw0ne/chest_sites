// CHEST · Myfxbook — client de l'API publique Myfxbook (CORS ouvert, verifie
// en direct le 2026-09-14 : access-control-allow-origin: *, aucun serveur
// intermediaire necessaire). Le broker est relie une seule fois par
// l'utilisateur sur myfxbook.com lui-meme (jamais depuis CHEST - impossible
// via l'API, qui est en lecture seule : aucune methode "add-account" n'existe)
// ; CHEST ne fait que se connecter avec l'email/mot de passe MYFXBOOK (pas le
// broker) pour lire les vraies donnees du compte choisi.
window.CHESTMyfxbook = (() => {
  'use strict';

  const BASE = 'https://www.myfxbook.com/api';

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // 1 reessai apres un court delai sur un echec RESEAU/CORS uniquement
  // (jamais sur une vraie erreur applicative Myfxbook, ex. mauvais mot de
  // passe) - constate en direct le 2026-09-17 : des appels strictement
  // identiques (memes identifiants, quelques secondes d'ecart) echouent
  // parfois en CORS puis reussissent juste apres, cote serveur Myfxbook -
  // un vrai flottement intermittent de leur infra, pas un bug cote CHEST.
  // Sans ce reessai, un simple hoquet reseau se traduisait par un Dashboard
  // vide pendant 5 minutes entieres (voir MYFXBOOK_CACHE_MS/enrichWithMyfxbook
  // dans dashboard.js) - retour direct utilisateur ("la connexion semble
  // erroner et donc n'affiche toujours rien").
  async function rawFetch(url) {
    try {
      return await fetch(url);
    } catch (e) {
      await sleep(700);
      return fetch(url);
    }
  }

  async function call(path, params) {
    const qs = new URLSearchParams(params).toString();
    let res;
    try {
      res = await rawFetch(`${BASE}/${path}?${qs}`);
    } catch (e) {
      // fetch() rejette avec un TypeError "Failed to fetch" (anglais, brut du
      // navigateur) en cas de CORS/reseau - meme piege deja corrige sur
      // accounts-auth.js (retour direct utilisateur du 2026-09-16 :
      // "la connexion au compte myfxbook ne marche pas non plus"). Traduit
      // ici plutot que de laisser ce message technique remonter tel quel.
      throw new Error("Impossible de contacter Myfxbook (connexion réseau ou blocage temporaire de leur API). Réessaie dans quelques instants.");
    }
    const data = await res.json();
    if (data.error) throw new Error(data.message || 'Erreur Myfxbook.');
    return data;
  }

  async function login(email, password) {
    const data = await call('login.json', { email, password });
    return data.session;
  }

  async function logout(session) {
    try { await call('logout.json', { session }); } catch (e) { /* tant pis, la session expire seule sous 1 mois */ }
  }

  async function getMyAccounts(session) {
    const data = await call('get-my-accounts.json', { session });
    return data.accounts || [];
  }

  function fmtDate(d) {
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
  }

  async function getDailyGain(session, accountId, days) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    const data = await call('get-daily-gain.json', { session, id: accountId, start: fmtDate(start), end: fmtDate(end) });
    const raw = data.dailyGain || [];
    // Myfxbook enveloppe parfois CHAQUE jour dans son propre tableau a 1
    // element (ex. [{date,value,profit}] au lieu de {date,value,profit}
    // direct) - verifie en direct le 2026-09-16 sur un vrai compte avec un
    // historique reel (retour direct utilisateur : "j'ai 14 positions depuis
    // le 8 mais rien ne s'affiche sur le dashboard" - dailyGainAsc.forEach
    // lisait `d.date` sur un tableau, jamais sur l'objet, donc `new
    // Date(undefined)` -> Invalid Date -> chaque jour etait silencieusement
    // ignore par mergeMyfxbookHistory). Aplatit systematiquement pour rester
    // robuste aux deux formes, jamais suppose une forme unique de l'API.
    return raw.map((d) => (Array.isArray(d) ? d[0] : d)).filter(Boolean);
  }

  // Toujours les 50 dernieres transactions closes, peu importe la periode
  // demandee ailleurs sur le Dashboard - limite documentee de l'API.
  async function getHistory(session, accountId) {
    const data = await call('get-history.json', { session, id: accountId });
    return data.history || [];
  }

  return { login, logout, getMyAccounts, getDailyGain, getHistory };
})();
