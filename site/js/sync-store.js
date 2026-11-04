// lz-string 1.5.0 (MIT, pieroxy) : compression des gros blocs (backtests, journal) dans le navigateur.
var LZString=function(){var r=String.fromCharCode,o="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",n="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$",e={};function t(r,o){if(!e[r]){e[r]={};for(var n=0;n<r.length;n++)e[r][r.charAt(n)]=n}return e[r][o]}var i={compressToBase64:function(r){if(null==r)return"";var n=i._compress(r,6,function(r){return o.charAt(r)});switch(n.length%4){default:case 0:return n;case 1:return n+"===";case 2:return n+"==";case 3:return n+"="}},decompressFromBase64:function(r){return null==r?"":""==r?null:i._decompress(r.length,32,function(n){return t(o,r.charAt(n))})},compressToUTF16:function(o){return null==o?"":i._compress(o,15,function(o){return r(o+32)})+" "},decompressFromUTF16:function(r){return null==r?"":""==r?null:i._decompress(r.length,16384,function(o){return r.charCodeAt(o)-32})},compressToUint8Array:function(r){for(var o=i.compress(r),n=new Uint8Array(2*o.length),e=0,t=o.length;e<t;e++){var s=o.charCodeAt(e);n[2*e]=s>>>8,n[2*e+1]=s%256}return n},decompressFromUint8Array:function(o){if(null==o)return i.decompress(o);for(var n=new Array(o.length/2),e=0,t=n.length;e<t;e++)n[e]=256*o[2*e]+o[2*e+1];var s=[];return n.forEach(function(o){s.push(r(o))}),i.decompress(s.join(""))},compressToEncodedURIComponent:function(r){return null==r?"":i._compress(r,6,function(r){return n.charAt(r)})},decompressFromEncodedURIComponent:function(r){return null==r?"":""==r?null:(r=r.replace(/ /g,"+"),i._decompress(r.length,32,function(o){return t(n,r.charAt(o))}))},compress:function(o){return i._compress(o,16,function(o){return r(o)})},_compress:function(r,o,n){if(null==r)return"";var e,t,i,s={},u={},a="",p="",c="",l=2,f=3,h=2,d=[],m=0,v=0;for(i=0;i<r.length;i+=1)if(a=r.charAt(i),Object.prototype.hasOwnProperty.call(s,a)||(s[a]=f++,u[a]=!0),p=c+a,Object.prototype.hasOwnProperty.call(s,p))c=p;else{if(Object.prototype.hasOwnProperty.call(u,c)){if(c.charCodeAt(0)<256){for(e=0;e<h;e++)m<<=1,v==o-1?(v=0,d.push(n(m)),m=0):v++;for(t=c.charCodeAt(0),e=0;e<8;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1}else{for(t=1,e=0;e<h;e++)m=m<<1|t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t=0;for(t=c.charCodeAt(0),e=0;e<16;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1}0==--l&&(l=Math.pow(2,h),h++),delete u[c]}else for(t=s[c],e=0;e<h;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1;0==--l&&(l=Math.pow(2,h),h++),s[p]=f++,c=String(a)}if(""!==c){if(Object.prototype.hasOwnProperty.call(u,c)){if(c.charCodeAt(0)<256){for(e=0;e<h;e++)m<<=1,v==o-1?(v=0,d.push(n(m)),m=0):v++;for(t=c.charCodeAt(0),e=0;e<8;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1}else{for(t=1,e=0;e<h;e++)m=m<<1|t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t=0;for(t=c.charCodeAt(0),e=0;e<16;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1}0==--l&&(l=Math.pow(2,h),h++),delete u[c]}else for(t=s[c],e=0;e<h;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1;0==--l&&(l=Math.pow(2,h),h++)}for(t=2,e=0;e<h;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1;for(;;){if(m<<=1,v==o-1){d.push(n(m));break}v++}return d.join("")},decompress:function(r){return null==r?"":""==r?null:i._decompress(r.length,32768,function(o){return r.charCodeAt(o)})},_decompress:function(o,n,e){var t,i,s,u,a,p,c,l=[],f=4,h=4,d=3,m="",v=[],g={val:e(0),position:n,index:1};for(t=0;t<3;t+=1)l[t]=t;for(s=0,a=Math.pow(2,2),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;switch(s){case 0:for(s=0,a=Math.pow(2,8),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;c=r(s);break;case 1:for(s=0,a=Math.pow(2,16),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;c=r(s);break;case 2:return""}for(l[3]=c,i=c,v.push(c);;){if(g.index>o)return"";for(s=0,a=Math.pow(2,d),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;switch(c=s){case 0:for(s=0,a=Math.pow(2,8),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;l[h++]=r(s),c=h-1,f--;break;case 1:for(s=0,a=Math.pow(2,16),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;l[h++]=r(s),c=h-1,f--;break;case 2:return v.join("")}if(0==f&&(f=Math.pow(2,d),d++),l[c])m=l[c];else{if(c!==h)return null;m=i+i.charAt(0)}v.push(m),l[h++]=i+m.charAt(0),i=m,0==--f&&(f=Math.pow(2,d),d++)}}};return i}();"function"==typeof define&&define.amd?define(function(){return LZString}):"undefined"!=typeof module&&null!=module?module.exports=LZString:"undefined"!=typeof angular&&null!=angular&&angular.module("LZString",[]).factory("LZString",function(){return LZString});

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
    // chest_backtests : plus synchronisé ici depuis le 2026-11-04 (un par un, js/backtest-store.js + /btstore)
    'chest_chart_visuals',
    'chest_journal', 'chest_journal_tags', 'chest_journal_fav_pairs', 'chest_journal_accounts',
    'chest_journal_active_account', 'chest_journal_ext', 'chest_journal_hidden',
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
  // Version serveur (updated_at) de chaque clé déjà reçue ou envoyée : le serveur ne renvoie que ce qui a changé.
  const STAMP_KEY = 'chest_sync_stamps';
  const origSetItem = Storage.prototype.setItem;
  const origGetItem = Storage.prototype.getItem;
  const origRemoveItem = Storage.prototype.removeItem;
  const origClear = Storage.prototype.clear;

  // Gros blocs compressés (2026-11-04, demande utilisateur : « plus de limite de stockage de backtesting ») :
  // le navigateur n'accepte qu'environ 5 Mo par site, vite atteints par les backtests et le journal. Ces clés
  // sont rangées compressées (lz-string, ~5 à 10 fois plus petites) et rendues décompressées à la lecture :
  // aucune page ne change, elles lisent et écrivent localStorage comme avant. Une lecture décompressée est
  // gardée en mémoire (memo) jusqu'à la prochaine écriture, ici ou dans un autre onglet (événement storage).
  // Le serveur reçoit toujours le JSON en clair ; au-delà de 64 Ko il le range dans le bucket.
  const BIG_KEYS = ['chest_backtests', 'chest_journal', 'chest_journal_ext', 'chest_myfxbook_daily_history'];
  const LZ_MARK = '\u0001lz:';
  const memo = {};
  const isBig = (st, k) => st === localStorage && BIG_KEYS.indexOf(k) !== -1;
  const lzOk = typeof LZString === 'object' && LZString;
  function pack(v) { return lzOk ? LZ_MARK + LZString.compressToUTF16(String(v)) : String(v); }
  function unpack(raw) {
    if (raw == null || raw.indexOf(LZ_MARK) !== 0) return raw;
    const v = lzOk ? LZString.decompressFromUTF16(raw.slice(LZ_MARK.length)) : null;
    return v == null ? null : v;
  }
  function bigSet(key, value) {
    const v = String(value);
    origSetItem.call(localStorage, key, pack(v)); // lève l'erreur « plein » comme avant si ça ne tient pas
    memo[key] = v;
  }
  Storage.prototype.getItem = function (key) {
    if (!isBig(this, key)) return origGetItem.call(this, key);
    if (Object.prototype.hasOwnProperty.call(memo, key)) return memo[key];
    const v = unpack(origGetItem.call(this, key));
    memo[key] = v;
    return v;
  };
  Storage.prototype.removeItem = function (key) {
    if (isBig(this, key)) delete memo[key];
    return origRemoveItem.call(this, key);
  };
  Storage.prototype.clear = function () {
    if (this === localStorage) Object.keys(memo).forEach((k) => { delete memo[k]; });
    return origClear.call(this);
  };
  window.addEventListener('storage', (e) => {
    if (!e.key) Object.keys(memo).forEach((k) => { delete memo[k]; });
    else delete memo[e.key];
  });
  // Une fois par navigateur : les blocs encore en clair sont recompressés (sans être renvoyés au serveur).
  if (lzOk) BIG_KEYS.forEach((k) => {
    try {
      const raw = origGetItem.call(localStorage, k);
      if (raw != null && raw.indexOf(LZ_MARK) !== 0) { origSetItem.call(localStorage, k, pack(raw)); delete memo[k]; }
    } catch (e) { /* tant pis : la valeur reste en clair, toujours lisible */ }
  });

  const rawSet = (k, v) => (BIG_KEYS.indexOf(k) !== -1 ? bigSet(k, v) : origSetItem.call(localStorage, k, v));
  let flushTimer = null;
  const OWNER_KEY = 'chest_data_owner';
  const DEVICE_KEYS = [
    'chest_account_token', 'chest_account_user', 'chest_data_owner',
    'chest_nav_collapsed', 'chest_theme', 'chest_code_hash', 'chest_unlocked',
    'chest_cal_realmove_cache', 'chest_currency_strength_fxblue', 'chest_weekly_forecast_lock',
    'chest_strength_board_open', 'chest_ops_cache', 'chest_vault', 'chest_ref_code',
  ];

  // SÉCURITÉ (2026-10-24, audit) : les mots de passe de comptes externes (Myfxbook dans chest_accounts /
  // chest_journal_accounts / chest_live_account, broker BERICH dans chest_berich_connection) partaient avec
  // la synchro et finissaient EN CLAIR sur le serveur. Ils ne quittent plus l'appareil : toute propriété
  // « password » est retirée de ce qui est envoyé (et de ce qui sert à comparer avec le serveur), gardée
  // dans un coffre local (chest_vault, jamais synchronisé) et remise en place quand une version arrive du
  // serveur. Sur un nouvel appareil, le mot de passe est redemandé une fois.
  const VAULT_KEY = 'chest_vault';
  const idOf = (o) => String(o.email || o.login || o.username || o.user || '').trim().toLowerCase();
  function stripSecrets(raw) {
    if (raw == null || raw.indexOf('"password"') === -1) return raw;
    let data;
    try { data = JSON.parse(raw); } catch (e) { return raw; }
    const vault = loadMap(VAULT_KEY);
    let found = false;
    (function walk(o) {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) { o.forEach(walk); return; }
      if (Object.prototype.hasOwnProperty.call(o, 'password')) {
        if (o.password && idOf(o)) vault[idOf(o)] = o.password;
        delete o.password; found = true;
      }
      Object.keys(o).forEach((k) => walk(o[k]));
    })(data);
    if (found) saveMap(VAULT_KEY, vault);
    return JSON.stringify(data);
  }
  function restoreSecrets(raw) {
    if (raw == null) return raw;
    let data;
    try { data = JSON.parse(raw); } catch (e) { return raw; }
    const vault = loadMap(VAULT_KEY);
    let touched = false;
    (function walk(o) {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) { o.forEach(walk); return; }
      const id = idOf(o);
      if (id && !o.password && vault[id] && ('email' in o || 'login' in o)) { o.password = vault[id]; touched = true; }
      Object.keys(o).forEach((k) => walk(o[k]));
    })(data);
    return touched ? JSON.stringify(data) : raw;
  }
  // Valeur telle qu'elle part au serveur (et telle qu'on la compare à celle du serveur).
  const syncVal = (raw) => stripSecrets(raw);

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
  function markSynced(sent, stamp) {
    const d = loadMap(DIRTY_KEY), b = loadMap(BASE_KEY), st = loadMap(STAMP_KEY);
    Object.keys(sent).forEach((key) => {
      if (syncVal(localStorage.getItem(key)) === sent[key]) { delete d[key]; b[key] = hashStr(sent[key]); if (stamp) st[key] = stamp; }
    });
    saveMap(DIRTY_KEY, d); saveMap(BASE_KEY, b); saveMap(STAMP_KEY, st);
  }
  // Cles suivies modifiees ici depuis la derniere synchro confirmee (ou jamais synchronisees).
  function collectChanged() {
    const b = loadMap(BASE_KEY), out = {};
    SYNCED_KEYS.forEach((key) => {
      const v = syncVal(localStorage.getItem(key));
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
    }).then((res) => {
      if (res.ok) { return res.json().catch(() => ({})).then((body) => markSynced(data, body && body.stamp)); }
      if (res.status === 413) storageFull();
    })
      .catch(() => { /* reste "non synchronisee" : repartira au prochain envoi ou chargement de page */ })
      .finally(() => { if (timer) clearTimeout(timer); });
  }

  // Espace du membre plein (2026-11-04) : ses données restent sur l'appareil (« à envoyer ») et on le prévient
  // une fois par session ; elles repartent seules dès qu'il libère de la place ou que l'admin agrandit son espace.
  function storageFull() {
    try {
      if (sessionStorage.getItem('chest_storage_full_seen')) return;
      sessionStorage.setItem('chest_storage_full_seen', '1');
    } catch (e) { /* tant pis */ }
    const msg = 'Ton espace de stockage CHEST est plein : tes dernières modifications restent sur cet appareil et ne sont pas encore sauvegardées sur ton compte. Libère de la place (Compte) ou demande plus d’espace.';
    setTimeout(() => { if (window.CHESTAlert) window.CHESTAlert(msg); else console.warn(msg); }, 0);
  }

  // Envoie ce qui a change localement (voir collectChanged) - et seulement cela.
  // BUG RÉEL (2026-10-24, retour utilisateur : « sur ce PC mon dashboard est enlevé, sur mon MacBook et mon
  // téléphone je l'ai ») : après une déconnexion, le Dashboard réécrit une liste de comptes VIDE au chargement ;
  // la synchro l'envoyait 600 ms plus tard, AVANT que la lecture du serveur soit revenue, et la liste vide
  // remplaçait les vrais comptes sur le serveur (puis sur chaque appareil rechargé). Désormais rien ne part
  // tant que la lecture du serveur de cette page n'a pas abouti ; ce qui a changé entre-temps reste marqué
  // « à envoyer » et part juste après.
  let pulled = false;
  function pushChanged() {
    if (!pulled || !getToken() || localOnly()) return Promise.resolve();
    const data = collectChanged();
    if (!Object.keys(data).length) return Promise.resolve();
    return postSync(data);
  }

  async function pullSync() {
    const token = getToken();
    if (!token || localOnly()) return;
    const wasEmpty = !hadAnyLocalData();
    try {
      const known = loadMap(STAMP_KEY);
      const res = await fetch(apiBase() + '/sync?have=' + encodeURIComponent(JSON.stringify(known)), { headers: { Authorization: 'Bearer ' + token } });
      if (!res.ok) return;
      const body = await res.json();
      const data = (body && body.data) || {};
      const stamps = (body && body.stamps) || {};
      let changed = false, firstApplied = false;
      const dirty = loadMap(DIRTY_KEY);
      const base = loadMap(BASE_KEY);
      Object.keys(data).forEach((key) => {
        if (SYNCED_KEYS.indexOf(key) === -1) return;
        const local = syncVal(localStorage.getItem(key));
        const remote = data[key];
        // BUG RÉEL (2026-10-20, retour utilisateur : « sur téléphone les données de mon compte ne sont pas
        // enregistrées, elles sont que sur PC ») : sur un appareil jamais synchronisé, les pages écrivent leurs
        // valeurs par défaut (listes vides, réglages) pendant que le pull est en route ; ces clés passaient
        // « modifiées ici » et la règle « la locale gagne » écartait pour toujours les vraies données du serveur.
        // Désormais une clé que CET appareil n'a jamais synchronisée (pas d'empreinte de base) prend la valeur
        // du serveur - sauf si la locale contient plus que celle du serveur (serveur vide, ou clé pas encore
        // envoyée depuis l'appareil qui a les vraies données) : on garde alors la locale et on la renvoie.
        // Une valeur par défaut est toujours plus courte que de vraies données : jamais écraser du contenu.
        // Jamais remplacer du contenu par du vide : si le serveur n'a qu'une valeur vide et que l'appareil a de
        // vraies données, on garde la locale et on la renvoie (le serveur est « réparé »). Une suppression de
        // TOUT le contenu ne se propage donc pas d'un appareil à l'autre - prix accepté pour ne rien perdre.
        if (isEmptyVal(remote) && !isEmptyVal(local)) { base[key] = hashStr(remote); return; }
        if (!base[key]) {
          if (local !== remote) { rawSet(key, restoreSecrets(remote)); changed = true; firstApplied = true; }
          delete dirty[key];
          base[key] = hashStr(remote);
          return;
        }
        if (dirty[key]) return; // modifiee ici et pas encore confirmee par le serveur : la locale gagne
        if (local !== null && base[key] !== hashStr(local)) return; // modifiee ici depuis la derniere synchro
        if (local !== remote) { rawSet(key, restoreSecrets(remote)); changed = true; }
        base[key] = hashStr(remote);
      });
      saveMap(BASE_KEY, base);
      saveMap(DIRTY_KEY, dirty);
      // Version retenue seulement pour les clés reçues et acceptées telles quelles (empreinte = celle du serveur).
      Object.keys(data).forEach((key) => { if (stamps[key] && base[key] === hashStr(data[key])) known[key] = stamps[key]; });
      saveMap(STAMP_KEY, known);
      // Nouvel appareil (ou première synchro de ces clés ici) qui vient de recevoir de vraies données : un seul
      // rechargement pour que la page déjà affichée (rendue vide/par défaut) les reflète. Pas de boucle : une
      // fois l'empreinte posée, la clé n'est plus « jamais synchronisée ».
      if ((wasEmpty || firstApplied) && changed) { location.reload(); return; }
      pulled = true;
    } catch (e) { /* hors-ligne / serveur injoignable : on garde ce qu'il y a deja en local, rien n'est envoyé */ }
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
    if (isBig(this, key)) bigSet(key, value); else origSetItem.call(this, key, value);
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
      // Backtests (IndexedDB, js/backtest-store.js) : la base est vidée à la prochaine ouverture si elle appartient
      // à un autre compte ; on tente aussi de la supprimer tout de suite.
      try { indexedDB.deleteDatabase('chest_backtests_db'); } catch (e) { /* tant pis */ }
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
    // Valeur restaurée depuis une sauvegarde serveur (Compte → Sauvegardes) : posée telle quelle ici,
    // mots de passe locaux remis en place, et marquée comme déjà synchronisée.
    applyServerValue: (key, value) => {
      rawSet(key, restoreSecrets(value));
      const b = loadMap(BASE_KEY); b[key] = hashStr(value); saveMap(BASE_KEY, b);
      const d = loadMap(DIRTY_KEY); delete d[key]; saveMap(DIRTY_KEY, d);
    },
  };
})();
