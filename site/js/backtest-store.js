// Backtests du membre (2026-11-04, demande utilisateur : « le but c'est d'en stocker plusieurs, la limite est
// contraignante »). Avant : un seul gros bloc chest_backtests dans le localStorage (≈ 5 Mo par site, vite plein)
// recopié en entier sur le serveur à chaque changement. Maintenant :
//   - dans le navigateur, chaque backtest est une entrée d'IndexedDB (des centaines de Mo, voire plus) ;
//   - sur le serveur, chaque backtest est envoyé seul (PUT /btstore/<id>) et rangé dans le bucket ;
//   - la seule limite est l'espace de stockage du membre (Admin → Stockage).
// Les pages gardent la même API synchrone (list, get, add, update, remove) une fois `ready()` résolu ; `onChange`
// prévient quand un autre appareil a modifié la liste. Un backtest :
// { id, title, description, capital, pfCapital (capital propfirm s'il diffère, sinon null),
//   cp: { mode:'manual'|'auto', risk, tiers:[{afterSl,newRisk}],
//         rules?:[{conds:[{field,value}], afterSl:number|null, risk}]  // règles « Si » sur les bonus du fichier (risk 0 = trade ignoré)
//         premium?:{label,perf,basePerf,dd,baseDd,oos} },              // réglage premium retenu (mode auto)
//   pf: { mode:'manual'|'auto', risk, tiers:[...] } | null,
//   trades: [{ date, result, rr, open?, close?, source?, confirmation? }],
//   createdAt }
(() => {
  'use strict';

  const LEGACY_KEY = 'chest_backtests';  // ancien bloc (repris une fois, puis retiré)
  const INDEX_KEY = 'chest_bt_index';    // petit résumé {id, title} lu par la page Compte
  const DB_NAME = 'chest_backtests_db';
  let items = [];
  let state = {};     // id -> { synced: updatedAt serveur | null, dirty: bool }
  let deleted = [];   // suppressions à envoyer au serveur
  let readyP = null, writes = Promise.resolve(), syncP = null, syncTimer = null;
  const listeners = [];

  // ------------------------------------------------------------------ IndexedDB
  let dbP = null;
  function db() {
    if (!dbP) dbP = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('bt', { keyPath: 'id' }); r.result.createObjectStore('meta'); };
      r.onsuccess = () => { r.result.onversionchange = () => r.result.close(); res(r.result); };
      r.onerror = () => rej(r.error);
    });
    return dbP;
  }
  function run(stores, mode, fn) {
    return db().then((d) => new Promise((res, rej) => {
      const t = d.transaction(stores, mode);
      const out = fn(t);
      t.oncomplete = () => res(out && 'result' in out ? out.result : out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('abort'));
    }));
  }
  // Écritures en file : l'ordre est garanti, flush() les attend.
  function queue(fn) { writes = writes.then(fn).catch((e) => { console.warn('[backtests] écriture locale', e); }); return writes; }
  function saveMeta() {
    const s = JSON.parse(JSON.stringify(state)), d = deleted.slice();
    return queue(() => run(['meta'], 'readwrite', (t) => { t.objectStore('meta').put(s, 'state'); t.objectStore('meta').put(d, 'deleted'); }));
  }
  function writeIndex() {
    try { localStorage.setItem(INDEX_KEY, JSON.stringify(items.map((b) => ({ id: b.id, title: b.title })))); } catch (e) { /* tant pis */ }
  }

  // ------------------------------------------------------------------ Compte, serveur
  function account() {
    try { return JSON.parse(localStorage.getItem('chest_account_user') || sessionStorage.getItem('chest_account_user') || 'null'); } catch (e) { return null; }
  }
  function token() {
    try { return localStorage.getItem('chest_account_token') || sessionStorage.getItem('chest_account_token'); } catch (e) { return null; }
  }
  function apiBase() { return (window.CHEST_CONFIG && window.CHEST_CONFIG.accountsApiUrl) || 'http://localhost:8080'; }
  // Essai gratuit : tout reste sur l'appareil (comme la synchro générale, voir sync-store.js).
  function localOnly() { const u = account(); return !u || !!(u.access && u.access.sync === false && !u.isAdmin); }
  function api(path, opts) {
    return fetch(apiBase() + path, Object.assign({}, opts, { headers: Object.assign({ Authorization: 'Bearer ' + token() }, (opts && opts.headers) || {}) }));
  }
  let fullWarned = false;
  function storageFull() {
    if (fullWarned) return; fullWarned = true;
    const msg = 'Ton espace de stockage CHEST est plein : ce backtest reste sur cet appareil et n’est pas encore sauvegardé sur ton compte. Libère de la place ou demande plus d’espace.';
    if (window.CHESTAlert) window.CHESTAlert(msg); else console.warn(msg);
  }

  // ------------------------------------------------------------------ Chargement
  function ready() {
    if (readyP) return readyP;
    readyP = (async () => {
      let all = [], meta = {};
      try {
        await run(['bt', 'meta'], 'readonly', (t) => {
          const a = t.objectStore('bt').getAll(); a.onsuccess = () => { all = a.result || []; };
          ['owner', 'state', 'deleted'].forEach((k) => { const r = t.objectStore('meta').get(k); r.onsuccess = () => { meta[k] = r.result; }; });
        });
      } catch (e) { console.warn('[backtests] IndexedDB indisponible', e); }
      // Données d'un autre compte dans ce navigateur : effacées (comme sync-store.js, clearLocalData).
      const u = account(), uid = u && u.id != null ? String(u.id) : null;
      if (meta.owner && uid && meta.owner !== uid) {
        all = []; meta = {};
        await queue(() => run(['bt', 'meta'], 'readwrite', (t) => { t.objectStore('bt').clear(); t.objectStore('meta').clear(); }));
      }
      if (uid) queue(() => run(['meta'], 'readwrite', (t) => t.objectStore('meta').put(uid, 'owner')));
      items = all;
      state = meta.state || {};
      deleted = meta.deleted || [];
      // Ancien bloc du localStorage : chaque backtest absent est repris, puis le bloc est retiré.
      let legacy = null;
      try { legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null'); } catch (e) { legacy = null; }
      if (Array.isArray(legacy)) {
        const have = new Set(items.map((b) => b.id));
        const fresh = legacy.filter((b) => b && b.id && !have.has(b.id));
        fresh.forEach((b) => { items.push(b); state[b.id] = { synced: null, dirty: true }; });
        if (fresh.length) await queue(() => run(['bt'], 'readwrite', (t) => { const s = t.objectStore('bt'); fresh.forEach((b) => s.put(b)); }));
        await saveMeta();
        try { localStorage.removeItem(LEGACY_KEY); } catch (e) { /* tant pis */ }
      }
      items.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
      writeIndex();
      setTimeout(() => { sync(); }, 0);
    })();
    return readyP;
  }

  // ------------------------------------------------------------------ Synchro serveur
  function schedule() { clearTimeout(syncTimer); syncTimer = setTimeout(() => { sync(); }, 400); }
  function sync() {
    if (!token() || localOnly()) return Promise.resolve();
    if (syncP) { syncP.then(schedule); return syncP; }
    syncP = (async () => {
      let changed = false;
      try {
        const r = await api('/btstore');
        if (!r.ok) return;
        const remote = (await r.json()).items || [];
        const rmap = new Map(remote.map((x) => [x.id, x]));
        // 1. Ce qui a changé ailleurs (ou n'existe pas ici) : téléchargé.
        for (const x of remote) {
          if (deleted.includes(x.id)) continue;
          const st = state[x.id];
          const local = items.find((b) => b.id === x.id);
          if (local && st && (st.dirty || st.synced === x.updatedAt)) continue;
          const g = await api('/btstore/' + encodeURIComponent(x.id));
          if (!g.ok) continue;
          const bt = await g.json();
          const i = items.findIndex((b) => b.id === x.id);
          if (i === -1) items.push(bt); else items[i] = bt;
          state[x.id] = { synced: x.updatedAt, dirty: false };
          await queue(() => run(['bt'], 'readwrite', (t) => t.objectStore('bt').put(bt)));
          changed = true;
        }
        // 2. Déjà synchronisé mais disparu du serveur : supprimé depuis un autre appareil.
        for (const b of items.slice()) {
          const st = state[b.id];
          if (!rmap.has(b.id) && st && st.synced && !st.dirty) {
            items = items.filter((x) => x.id !== b.id); delete state[b.id];
            await queue(() => run(['bt'], 'readwrite', (t) => t.objectStore('bt').delete(b.id)));
            changed = true;
          }
        }
        // 3. Envois : nouveaux et modifiés ici.
        for (const b of items.slice()) {
          const st = state[b.id] || { synced: null, dirty: true };
          if (!st.dirty && rmap.has(b.id)) continue;
          const p = await api('/btstore/' + encodeURIComponent(b.id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
          if (p.status === 413) { storageFull(); break; }
          if (!p.ok) continue;
          const cur = items.find((x) => x.id === b.id);
          if (cur === b) state[b.id] = { synced: (await p.json()).updatedAt, dirty: false };
        }
        // 4. Suppressions faites ici.
        for (const id of deleted.slice()) {
          const d = await api('/btstore/' + encodeURIComponent(id), { method: 'DELETE' });
          if (d.ok || d.status === 404) deleted = deleted.filter((x) => x !== id);
        }
      } catch (e) {
        /* hors ligne : tout reste marqué « à envoyer » et repartira au prochain chargement */
      } finally {
        await saveMeta();
        syncP = null;
        if (changed) {
          items.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
          writeIndex();
          listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
        }
      }
    })();
    return syncP;
  }

  // ------------------------------------------------------------------ API des pages
  function list() { return items; }
  function get(id) { return items.find((b) => b.id === id) || null; }
  function persist(record) {
    state[record.id] = { synced: (state[record.id] || {}).synced || null, dirty: true };
    queue(() => run(['bt'], 'readwrite', (t) => t.objectStore('bt').put(record)));
    saveMeta();
    writeIndex();
    schedule();
  }
  function add(backtest) {
    const id = 'bt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const record = Object.assign({ id, createdAt: new Date().toISOString() }, backtest);
    items.push(record);
    persist(record);
    return record;
  }
  function update(id, patch) {
    const idx = items.findIndex((b) => b.id === id);
    if (idx === -1) return null;
    items[idx] = Object.assign({}, items[idx], patch);
    persist(items[idx]);
    return items[idx];
  }
  function remove(id) {
    items = items.filter((b) => b.id !== id);
    const st = state[id]; delete state[id];
    if (st && st.synced && !deleted.includes(id)) deleted.push(id);
    queue(() => run(['bt'], 'readwrite', (t) => t.objectStore('bt').delete(id)));
    saveMeta();
    writeIndex();
    schedule();
  }
  // Un backtest pas encore sur cet appareil (lien ouvert sur un nouvel appareil) : demandé au serveur.
  async function ensure(id) {
    await ready();
    const local = get(id);
    if (local || !token() || localOnly()) return local;
    try {
      const g = await api('/btstore/' + encodeURIComponent(id));
      if (!g.ok) return null;
      const bt = await g.json();
      if (!get(id)) { items.push(bt); state[id] = { synced: g.headers.get('X-Updated-At'), dirty: false }; }
      await queue(() => run(['bt'], 'readwrite', (t) => t.objectStore('bt').put(bt)));
      saveMeta(); writeIndex();
      return get(id);
    } catch (e) { return null; }
  }
  // Avant de quitter la page : écritures locales terminées, puis envoi au serveur (15 s au plus ; ce qui n'est pas
  // parti reste marqué et repartira sur la page suivante).
  async function flush() {
    await writes;
    clearTimeout(syncTimer);
    await Promise.race([sync(), new Promise((r) => setTimeout(r, 15000))]);
    await writes;
  }
  function onChange(fn) { listeners.push(fn); }

  window.CHESTBacktests = { ready, list, get, add, update, remove, ensure, flush, onChange };
})();
