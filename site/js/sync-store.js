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
    'chest_backtests',
    'chest_journal', 'chest_journal_tags', 'chest_journal_fav_pairs', 'chest_journal_accounts',
    'chest_journal_active_account', 'chest_journal_ext',
    'chest_berich_connection', 'chest_berich_taken', 'chest_berich_last_risk_choice',
    'chest_sentiment_pair', 'chest_timezone', 'chest_profile',
    'chest_scanner_drawings', 'chest_theme', 'chest_admin_preview_mode', 'chest_ui_scale',
  ];

  function apiBase() { return (window.CHEST_CONFIG && window.CHEST_CONFIG.accountsApiUrl) || 'http://localhost:8080'; }
  function getToken() {
    try { return localStorage.getItem('chest_account_token') || sessionStorage.getItem('chest_account_token'); } catch (e) { return null; }
  }
  function hadAnyLocalData() {
    try { return SYNCED_KEYS.some((k) => localStorage.getItem(k) !== null); } catch (e) { return true; }
  }

  // BUG REEL corrige ici (2026-09-26, retour utilisateur : "j'ai pas mes rapports de backtesting"
  // / "j'ai pas les familles aussi") : la 1re version n'interceptait que les FUTURES écritures
  // (setItem monkey-patché plus bas) - tout ce qui était déjà dans le navigateur AVANT même
  // l'existence de cette synchro (backtests, familles créés les jours précédents) n'avait jamais
  // été poussé vers le serveur, donc n'existait nulle part pour qu'un autre appareil le récupère.
  // pushExistingLocalData() corrige ça en poussant, à CHAQUE chargement de page, la valeur
  // actuelle de toute clé suivie déjà présente en local - pas seulement celles qui viennent de
  // changer. Ça peut sembler redondant (renvoyer une donnée qui n'a pas bougé), mais c'est
  // largement moins cher qu'un vrai bug de données manquantes, et le volume reste minime.
  function pushExistingLocalData() {
    const token = getToken();
    if (!token) return;
    const data = {};
    SYNCED_KEYS.forEach((key) => {
      const v = localStorage.getItem(key);
      if (v !== null) data[key] = v;
    });
    if (!Object.keys(data).length) return;
    fetch(apiBase() + '/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ data }),
    }).catch(() => { /* tant pis, retentera au prochain chargement de page */ });
  }

  async function pullSync() {
    const token = getToken();
    if (!token) return;
    const wasEmpty = !hadAnyLocalData();
    try {
      const res = await fetch(apiBase() + '/sync', { headers: { Authorization: 'Bearer ' + token } });
      if (!res.ok) return;
      const body = await res.json();
      const data = (body && body.data) || {};
      let changed = false;
      Object.keys(data).forEach((key) => {
        if (SYNCED_KEYS.indexOf(key) === -1) return;
        if (localStorage.getItem(key) !== data[key]) { localStorage.setItem(key, data[key]); changed = true; }
      });
      // Nouvel appareil (rien en local avant) qui vient de recevoir de vraies données : un seul
      // rechargement pour que la page déjà affichée (rendue vide/par défaut) les reflète, sans quoi
      // il faudrait naviguer manuellement pour les voir apparaître.
      if (wasEmpty && changed) { location.reload(); return; }
    } catch (e) { /* hors-ligne / serveur injoignable : on garde ce qu'il y a deja en local */ }
    // Ce que CET appareil a en local (déjà là avant, ou reçu du serveur juste au-dessus) part
    // aussi vers le serveur - voir le commentaire de pushExistingLocalData().
    pushExistingLocalData();
  }
  pullSync();

  let pending = {};
  let flushTimer = null;
  function flush() {
    flushTimer = null;
    const token = getToken();
    const batch = pending;
    pending = {};
    if (!token || !Object.keys(batch).length) return Promise.resolve();
    // Retourne la promesse (2026-09-27, corrige un vrai bug retour utilisateur : "compte du
    // journal introuvable" apres avoir cree un compte puis change de page presque aussitot) -
    // avant, cet appel etait "fire and forget" : creer un compte du Journal puis naviguer vers une
    // AUTRE page (dashboard.html) quasi instantanement ne laissait pas le temps aux 600ms de debounce
    // de s'ecouler ni a ce fetch de finir - le PULL de la page suivante arrivait alors AVANT que le
    // serveur n'ait ce nouveau compte, et l'ECRASAIT localement avec l'ancienne version (toujours
    // "dernier pull gagne", jamais de fusion) - le compte tout juste cree disparaissait purement et
    // simplement. Voir window.CHESTSync.flushNow(), attendu explicitement par journal.html avant de
    // changer de page apres une creation.
    return fetch(apiBase() + '/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ data: batch }),
    }).catch(() => { /* prochaine ecriture reessaiera - pas grave si celle-ci se perd */ });
  }

  const realSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function (key, value) {
    realSetItem(key, value);
    if (SYNCED_KEYS.indexOf(key) !== -1) {
      pending[key] = value;
      if (!flushTimer) flushTimer = setTimeout(flush, 600);
    }
  };
  // Vide immediatement ce qui reste en attente si l'onglet se ferme/change de page - sinon la
  // derniere modification juste avant un changement de page pouvait ne jamais partir.
  window.addEventListener('pagehide', () => { if (flushTimer) { clearTimeout(flushTimer); flush(); } });

  // API publique minimale (2026-09-27) : force l'envoi immediat de ce qui est en attente, et
  // ATTEND que ce soit fait - a utiliser juste avant une navigation volontaire vers une autre page
  // qui va elle-meme re-synchroniser (voir journal.html, jaSave). pagehide seul ne suffit pas ici :
  // un changement de page DECLENCHE par notre propre code (window.location.href = ...) doit
  // pouvoir attendre la fin du fetch avant de partir, ce que pagehide ne garantit pas.
  window.CHESTSync = {
    flushNow: async () => {
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      await flush();
    },
  };
})();
