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

  // 2026-10-14 : mesure en direct, Myfxbook OUBLIE l'en-tete CORS sur ~20 a 40 % de ses reponses
  // (8/10, 6/10, 8/10 sur trois series de 10 appels identiques, Chrome, Safari et curl confondus) - le
  // navigateur bloque alors la reponse comme une erreur reseau. Un seul reessai laissait echouer
  // environ une connexion sur trois (une connexion enchaine 4 a 5 appels). Jusqu'a 5 essais
  // espaces (0,4 s, 0,8 s, 1,2 s, 1,6 s) : la probabilite qu'un appel echoue tombe sous 1 %. Une page
  // Cloudflare (HTML au lieu de JSON) est traitee pareil. Pas de relais serveur possible : depuis
  // l'API v1.38 une session Myfxbook n'est valable que depuis l'IP qui l'a ouverte.
  const TRIES = 5;

  async function call(path, params) {
    const url = `${BASE}/${path}?${new URLSearchParams(params).toString()}`;
    for (let i = 0; i < TRIES; i++) {
      if (i) await sleep(400 * i);
      let data;
      try {
        const res = await fetch(url);
        data = await res.json();
      } catch (e) {
        continue; // CORS absent, reseau ou page non JSON : on reessaie
      }
      // Vraie reponse Myfxbook (ex. mauvais mot de passe) : jamais reessayee
      if (data && data.error) {
        const err = new Error(frMessage(data.message));
        err.kind = errKind(data.message);
        throw err;
      }
      return data;
    }
    // Sans jargon technique cote visiteur (2026-09-24, demande utilisateur : jamais le mot "API")
    throw new Error('Connexion échouée, veuillez réessayer dans un instant.');
  }

  function errKind(m) {
    const t = String(m || '').toLowerCase();
    if (t.includes('invalid session')) return 'session';
    if (t.includes('max login')) return 'locked';
    if (t.includes('wrong email') || t.includes('password')) return 'credentials';
    return 'other';
  }

  // Messages d'erreur Myfxbook (anglais) traduits pour l'ecran
  function frMessage(m) {
    const t = String(m || '').toLowerCase();
    if (t.includes('max login')) return 'Myfxbook bloque les connexions un moment (trop de tentatives). Réessaie dans quelques minutes.';
    if (t.includes('wrong email') || t.includes('password')) return 'Email ou mot de passe Myfxbook incorrect.';
    if (t.includes('invalid session')) return 'Session Myfxbook expirée, reconnecte-toi.';
    if (t.includes('invalid account')) return 'Compte Myfxbook introuvable.';
    if (t.includes('required')) return 'Email et mot de passe Myfxbook requis.';
    return m || 'Erreur Myfxbook.';
  }

  async function login(email, password) {
    const data = await call('login.json', { email, password });
    return data.session;
  }

  // Session réutilisée (2026-10-14) : le Dashboard et le Journal ouvraient puis fermaient une session Myfxbook
  // à CHAQUE relecture (chaque minute en formule Live), alors qu'une session reste valable un mois - et
  // Myfxbook finit par répondre « Max login attempts reached » (constaté en test), ce qui bloque aussi les
  // vraies connexions du membre. Une session par e-mail Myfxbook est gardée dans CE navigateur
  // (chest_mfx_sessions : jamais synchronisée - elle n'est valable que depuis l'IP qui l'a ouverte - et
  // effacée avec les autres données quand un autre membre CHEST se connecte, voir sync-store.js). Session
  // refusée (IP changée, expirée) : une reconnexion, une seule. Mauvais mot de passe : plus de tentative
  // automatique pendant 15 min (chaque essai raté rapproche du blocage Myfxbook).
  const SESS_KEY = 'chest_mfx_sessions';
  const SESS_TTL = 25 * 24 * 3600 * 1000;
  const BAD_PAUSE = 15 * 60 * 1000;
  const pending = {};
  function sessMap() { try { return JSON.parse(localStorage.getItem(SESS_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function sessSave(m) { try { localStorage.setItem(SESS_KEY, JSON.stringify(m)); } catch (e) { /* tant pis */ } }
  const sessKey = (email) => String(email || '').trim().toLowerCase();
  function sessPut(email, rec) { const m = sessMap(); if (rec) m[sessKey(email)] = rec; else delete m[sessKey(email)]; sessSave(m); }

  async function session(email, password, fresh) {
    const k = sessKey(email);
    const c = sessMap()[k];
    // Relecture automatique avec les mêmes identifiants qu'au dernier refus : on n'insiste pas avant la fin de
    // la pause (une connexion demandée par le membre, fresh, passe toujours)
    if (!fresh && c && c.bad && c.pw === hashPw(password) && Date.now() - c.at < BAD_PAUSE) throw Object.assign(new Error(c.msg || 'Email ou mot de passe Myfxbook incorrect.'), { kind: 'credentials' });
    if (!fresh && c && c.session && c.pw === hashPw(password) && Date.now() - c.at < SESS_TTL) return c.session;
    // Plusieurs appels en même temps (Dashboard + suivi live) : une seule connexion
    if (pending[k]) return pending[k];
    pending[k] = (async () => {
      try {
        const s = await login(email, password);
        sessPut(email, { session: s, at: Date.now(), pw: hashPw(password) });
        return s;
      } catch (e) {
        if (e.kind === 'credentials' || e.kind === 'locked') sessPut(email, { bad: true, at: Date.now(), pw: hashPw(password), msg: e.message });
        throw e;
      } finally { delete pending[k]; }
    })();
    return pending[k];
  }
  // Exécute fn(session) avec la session gardée ; si Myfxbook la refuse, une reconnexion puis un nouvel essai.
  async function withSession(email, password, fn) {
    const s = await session(email, password, false);
    try { return await fn(s); } catch (e) {
      if (e.kind !== 'session') throw e;
      return fn(await session(email, password, true));
    }
  }
  // Empreinte du mot de passe (jamais le mot de passe lui-même) : une session n'est réutilisée que pour
  // les mêmes identifiants, et un mot de passe corrigé relance tout de suite une connexion.
  function hashPw(str) {
    let h = 2166136261; str = String(str || '');
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h.toString(36);
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

  async function getOpenTrades(session, accountId) {
    const data = await call('get-open-trades.json', { session, id: accountId });
    return (data.openTrades || []).map((t) => (Array.isArray(t) ? t[0] : t)).filter(Boolean);
  }

  return { login, logout, session, withSession, getMyAccounts, getDailyGain, getHistory, getOpenTrades };
})();
