// CHEST · Synchro multi-appareils (2026-09-26, demande utilisateur : "quand je me connecte avec
// mon téléphone [...] mes infos sont pas stockées dans mon compte"). Jusqu'ici, comptes, familles,
// backtests, journal etc. ne vivaient QUE dans le localStorage du navigateur - jamais liés au
// compte CHEST côté serveur, donc invisibles sur un autre appareil connecté au même compte.
//
// Choix délibéré : un miroir GÉNÉRIQUE clé/valeur (voir accounts-bridge/server.py, /sync), pas un
// schéma dédié par type de donnée - le code ici n'a jamais besoin de savoir ce que contient
// "chest_accounts" ou "chest_journal", juste de le recopier. Ça veut dire qu'AUCUNE page
// (dashboard.js, journal-store.js, backtest-store.js...) n'a besoin d'être réécrite : elles
// continuent de lire/écrire localStorage exactement comme avant, ce fichier se contente
// d'intercepter les clés qui nous intéressent.
//
// Le pull au chargement est ASYNCHRONE (pas de XMLHttpRequest bloquant) : ce site a une exigence
// forte de "jamais de sensation de chargement" (voir CLAUDE.md, section Welcome/pages d'auth,
// plusieurs passes dédiées à éliminer les flashs blancs et micro-gels) - une requête réseau
// bloquante en tête de page recréerait exactement ça, en pire (dépend de la latence Railway). Un
// appareil qui n'a JAMAIS rien eu en local (le cas décrit : "mon téléphone n'a pas les données de
// mon PC") recharge la page UNE FOIS après avoir reçu les données, pour les voir apparaître sans
// action manuelle ; un appareil qui a déjà des données locales ne recharge jamais tout seul (pas
// de boucle, pas de gêne) - la fraîcheur totale attendra la prochaine navigation normale, acceptée
// comme compromis vu que l'utilisateur a confirmé que ces données ne sont pas critiques.
(() => {
  'use strict';

  // Uniquement les clés qui représentent de VRAIES données/réglages utilisateur - jamais un jeton
  // de session, un cache re-téléchargeable, ou une préférence d'affichage propre à CET appareil
  // (sidebar repliée...). Le thème est inclus : c'est une vraie préférence, pas un état d'affichage
  // ponctuel.
  const SYNCED_KEYS = [
    'chest_accounts', 'chest_active_account', 'chest_account_families', 'chest_live_account',
    'chest_dashboard_simple_mode', 'chest_mfx_last_login', 'chest_myfxbook_daily_history',
    'chest_minical_range', 'chest_payout_sim_settings', 'chest_payout_view_mode',
    'chest_backtests', 'chest_chart_visuals',
    'chest_journal', 'chest_journal_tags', 'chest_journal_fav_pairs', 'chest_journal_accounts',
    'chest_journal_active_account', 'chest_journal_ext',
    'chest_berich_connection', 'chest_berich_taken', 'chest_berich_last_risk_choice', 'chest_berich_linked_account',
    'chest_sentiment_pair', 'chest_timezone', 'chest_profile',
    'chest_scanner_drawings', 'chest_theme', 'chest_admin_preview_mode', 'chest_ui_scale',
    'chest_notif_prefs',
    // 2026-10-14 : propres à chaque membre, désormais rattachées à son compte (plus perdues au changement de compte)
    'chest_bt_spot', 'chest_notifications', 'chest_school_vvs_check', 'chest_news_seen',
    'chest_berich_invalidated', 'chest_cal_importance',
  ];

  // BUG REEL (2026-10-01, retour utilisateur : "les backtests que j'ajoute ne s'enregistrent pas") :
  // ajouter un backtest puis ouvrir aussitot son rapport laissait la page suivante tirer la version
  // SERVEUR (pas encore a jour) et ECRASER la copie locale toute neuve. Premier correctif : marquer chaque cle
  // modifiee "pas encore envoyee" (chest_sync_dirty) en interceptant localStorage.setItem.
  //
  // 2e BUG REEL (2026-10-09, meme symptome, Safari) : l'interception se faisait par `localStorage.setItem = fn`.
  // Cette affectation sur l'INSTANCE n'est pas fiable selon le navigateur (Chrome la prend ; Safari/Firefox
  // creent une simple cle ou ignorent - sources d'epoque : bugzilla Mozilla 1141698, ChangeLog WebKit) : sur
  // Safari rien n'etait marque ni envoye au moment de l'enregistrement, et le pull de la page suivante
  // ecrasait la copie locale. Corrige de deux facons qui se completent :
  //   1. l'interception passe par Storage.prototype.setItem (le seul endroit fiable) ;
  //   2. SANS dependre de l'interception, on retient pour chaque cle l'empreinte de la derniere valeur
  //      connue du serveur (chest_sync_base). Une cle dont l'empreinte locale differe a ete modifiee ici
  //      depuis la derniere synchro : un pull ne l'ecrase jamais, et elle part au prochain envoi.
  // Au passage, on n'envoie plus TOUTES les cles a chaque chargement de page (logs Railway : POST de 1 a 7 s,
  // souvent coupes par la navigation = 499) mais seulement celles qui ont change.
  const DIRTY_KEY = 'chest_sync_dirty';
  const BASE_KEY = 'chest_sync_base';
  const origSetItem = Storage.prototype.setItem;
  const rawSet = (k, v) => origSetItem.call(localStorage, k, v);
  let flushTimer = null;
  const OWNER_KEY = 'chest_data_owner';
  const DEVICE_KEYS = [
    'chest_account_token', 'chest_account_user', 'chest_data_owner',
    'chest_nav_collapsed', 'chest_theme', 'chest_code_hash', 'chest_unlocked',
    'chest_cal_realmove_cache', 'chest_currency_strength_fxblue', 'chest_weekly_forecast_lock',
    'chest_strength_board_open',
  ];

  function loadMap(key) {
    try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) { return {}; }
  }
  function saveMap(key, m) {
    try { rawSet(key, JSON.stringify(m)); } catch (e) { /* tant pis */ }
  }
  // Empreinte rapide (FNV-1a 32 bits + longueur) : pas de valeur copiee, juste de quoi detecter un changement.
  function hashStr(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return str.length + ':' + h.toString(36);
  }
  function markDirty(key) { const d = loadMap(DIRTY_KEY); d[key] = Date.now(); saveMap(DIRTY_KEY, d); }
  // Le serveur a confirme avoir recu `sent` : retire le marquage et memorise l'empreinte, sauf si la cle a
  // encore change depuis l'envoi.
  function markSynced(sent) {
    const d = loadMap(DIRTY_KEY), b = loadMap(BASE_KEY);
    Object.keys(sent).forEach((key) => {
      if (localStorage.getItem(key) === sent[key]) { delete d[key]; b[key] = hashStr(sent[key]); }
    });
    saveMap(DIRTY_KEY, d); saveMap(BASE_KEY, b);
  }
  // Cles suivies modifiees ici depuis la derniere synchro confirmee (ou jamais synchronisees).
  function collectChanged() {
    const b = loadMap(BASE_KEY), out = {};
    SYNCED_KEYS.forEach((key) => {
      const v = localStorage.getItem(key);
      if (v !== null && b[key] !== hashStr(v)) out[key] = v;
    });
    return out;
  }

  function apiBase() { return (window.CHEST_CONFIG && window.CHEST_CONFIG.accountsApiUrl) || 'http://localhost:8080'; }
  function getToken() {
    try { return localStorage.getItem('chest_account_token') || sessionStorage.getItem('chest_account_token'); } catch (e) { return null; }
  }
  // Essai gratuit (2026-10-18) : les données restent sur l'appareil, rien ne part sur le serveur. Les
  // modifications restent marquées « à envoyer » : elles partiront d'elles-mêmes dès qu'une offre est prise.
  function localOnly() {
    try { const u = JSON.parse(localStorage.getItem('chest_account_user') || sessionStorage.getItem('chest_account_user') || 'null'); return !!(u && u.access && u.access.sync === false && !u.isAdmin); } catch (e) { return false; }
  }
  function isEmptyVal(v) {
    if (v == null) return true;
    const s = String(v).trim();
    return s === '' || s === '[]' || s === '{}' || s === 'null' || s === '""';
  }
  function hadAnyLocalData() {
    try { return SYNCED_KEYS.some((k) => localStorage.getItem(k) !== null); } catch (e) { return true; }
  }

  function postSync(data, timeoutMs) {
    const token = getToken();
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs || 30000) : null;
    return fetch(apiBase() + '/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ data }),
      signal: ctrl ? ctrl.signal : undefined,
    }).then((res) => { if (res.ok) markSynced(data); })
      .catch(() => { /* reste "non synchronisee" : repartira au prochain envoi ou chargement de page */ })
      .finally(() => { if (timer) clearTimeout(timer); });
  }

  // Envoie ce qui a change localement (voir collectChanged) - et seulement cela.
  function pushChanged() {
    if (!getToken() || localOnly()) return Promise.resolve();
    const data = collectChanged();
    if (!Object.keys(data).length) return Promise.resolve();
    return postSync(data);
  }

  async function pullSync() {
    const token = getToken();
    if (!token || localOnly()) return;
    const wasEmpty = !hadAnyLocalData();
    try {
      const res = await fetch(apiBase() + '/sync', { headers: { Authorization: 'Bearer ' + token } });
      if (!res.ok) return;
      const body = await res.json();
      const data = (body && body.data) || {};
      let changed = false, firstApplied = false;
      const dirty = loadMap(DIRTY_KEY);
      const base = loadMap(BASE_KEY);
      Object.keys(data).forEach((key) => {
        if (SYNCED_KEYS.indexOf(key) === -1) return;
        const local = localStorage.getItem(key);
        const remote = data[key];
        // BUG RÉEL (2026-10-20, retour utilisateur : « sur téléphone les données de mon compte ne sont pas
        // enregistrées, elles sont que sur PC ») : sur un appareil jamais synchronisé, les pages écrivent leurs
        // valeurs par défaut (listes vides, réglages) pendant que le pull est en route ; ces clés passaient
        // « modifiées ici » et la règle « la locale gagne » écartait pour toujours les vraies données du serveur.
        // Désormais une clé que CET appareil n'a jamais synchronisée (pas d'empreinte de base) prend la valeur
        // du serveur - sauf si la locale contient plus que celle du serveur (serveur vide, ou clé pas encore
        // envoyée depuis l'appareil qui a les vraies données) : on garde alors la locale et on la renvoie.
        // Une valeur par défaut est toujours plus courte que de vraies données : jamais écraser du contenu.
        if (!base[key]) {
          if (!isEmptyVal(local) && (isEmptyVal(remote) || local.length > remote.length)) { base[key] = hashStr(remote); return; }
          if (local !== remote) { rawSet(key, remote); changed = true; firstApplied = true; }
          delete dirty[key];
          base[key] = hashStr(remote);
          return;
        }
        if (dirty[key]) return; // modifiee ici et pas encore confirmee par le serveur : la locale gagne
        if (local !== null && base[key] !== hashStr(local)) return; // modifiee ici depuis la derniere synchro
        if (local !== remote) { rawSet(key, remote); changed = true; }
        base[key] = hashStr(remote);
      });
      saveMap(BASE_KEY, base);
      saveMap(DIRTY_KEY, dirty);
      // Nouvel appareil (ou première synchro de ces clés ici) qui vient de recevoir de vraies données : un seul
      // rechargement pour que la page déjà affichée (rendue vide/par défaut) les reflète. Pas de boucle : une
      // fois l'empreinte posée, la clé n'est plus « jamais synchronisée ».
      if ((wasEmpty || firstApplied) && changed) { location.reload(); return; }
    } catch (e) { /* hors-ligne / serveur injoignable : on garde ce qu'il y a deja en local */ }
    pushChanged();
  }
  function currentUserId() {
    try { const u = JSON.parse(localStorage.getItem('chest_account_user') || sessionStorage.getItem('chest_account_user') || 'null'); return u && u.id != null ? String(u.id) : null; } catch (e) { return null; }
  }
  (function checkOwner() {
    const uid = currentUserId();
    if (!getToken() || !uid) return;
    const owner = localStorage.getItem(OWNER_KEY);
    if (owner && owner !== uid) clearLocalData();
    // Pas encore de marque (navigateur d'avant cette mise à jour) : les données présentes sont celles du
    // membre connecté, comme jusqu'ici.
    setOwner(uid);
  })();
  pullSync();

  function flush() {
    flushTimer = null;
    return pushChanged();
  }

  Storage.prototype.setItem = function (key, value) {
    origSetItem.call(this, key, value);
    if (this === localStorage && SYNCED_KEYS.indexOf(key) !== -1) {
      markDirty(key);
      if (!flushTimer) flushTimer = setTimeout(flush, 600);
    }
  };
  // Vide immediatement ce qui reste en attente si l'onglet se ferme/change de page.
  window.addEventListener('pagehide', () => { if (flushTimer) { clearTimeout(flushTimer); flush(); } });

  // BUG RÉEL (2026-10-13, retour utilisateur : "j'ai créé un autre compte et je vois mes éléments
  // de mon compte principal") : logout() ne retirait que le jeton de session (accounts-auth.js) -
  // jamais les vraies données (chest_accounts, chest_backtests, chest_journal...). Se connecter à
  // un AUTRE compte dans le même navigateur affichait donc encore tout l'ancien compte, et pouvait
  // même finir par le pousser vers le nouveau (tout `setItem` sur une clé suivie la marque "à
  // envoyer", voir Storage.prototype.setItem plus bas). Appelée par accounts-auth.js à la
  // déconnexion, et à la connexion si le compte qui se connecte diffère de celui déjà en cache -
  // un removeItem() direct (jamais setItem) donc jamais repoussé vers le serveur par erreur.
  //
  // 2026-10-14 (demande utilisateur : « séparer vraiment les données de chaque compte ») : on efface TOUTES
  // les clés chest_* du navigateur, pas seulement les synchronisées - certaines ne le sont pas mais restent
  // propres au membre (backtest à la une, cloche de notifications, checklist School, signaux BERICH écartés,
  // Newsletter vue, cache School qui peut contenir les emplacements réservés à l'admin…). Ne restent que
  // la session elle-même, quelques préférences d'appareil et des caches de données publiques.
  function clearLocalData() {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
      keys.forEach((k) => { if (k && k.indexOf('chest_') === 0 && DEVICE_KEYS.indexOf(k) === -1) localStorage.removeItem(k); });
      localStorage.removeItem(OWNER_KEY);
    } catch (e) { /* tant pis */ }
  }
  // Propriétaire des données du navigateur (id du membre). Filet de sécurité indépendant de login()/logout() :
  // si une page s'ouvre avec la session d'un membre alors que les données appartiennent à un autre (session
  // posée autrement, onglet resté ouvert…), elles sont effacées AVANT le moindre pull ou push.
  function setOwner(id) { try { rawSet(OWNER_KEY, String(id)); } catch (e) { /* tant pis */ } }

  // API publique minimale : force l'envoi immediat de ce qui a change et ATTEND (au plus 10 s, pour ne jamais
  // bloquer l'utilisateur si le serveur est lent - ce qui n'a pas pu partir reste protege et repartira au
  // prochain chargement). A utiliser juste avant une navigation volontaire (journal.html, backtest-add.html).
  window.CHESTSync = {
    flushNow: async () => {
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      await Promise.race([flush(), new Promise((r) => setTimeout(r, 10000))]);
    },
    clearLocalData,
    setOwner,
  };
})();
