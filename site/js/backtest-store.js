// Stockage local des backtests ajoutés par l'utilisateur (le site reste
// local pour le moment — voir memoire projet). Un backtest :
// { id, title, description, capital,
//   cp: { mode:'manual'|'auto', risk, tiers:[{afterSl,newRisk}],
//         rules?:[{conds:[{field,value}], afterSl:number|null, risk}]  // règles « Si » sur les bonus du fichier (risk 0 = trade ignoré)
//         premium?:{label,perf,basePerf,dd,baseDd,oos} },              // réglage premium retenu (mode auto)
//   pf: { mode:'manual'|'auto', risk, tiers:[...] } | null,
//   trades: [{ date, result, rr, open?, close?, source?, confirmation? }],
//   createdAt }
(() => {
  'use strict';

  const KEY = 'chest_backtests';

  function list() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function persist(items) {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) { /* tant pis, stockage indisponible */ }
  }

  function get(id) {
    return list().find((b) => b.id === id) || null;
  }

  function add(backtest) {
    const items = list();
    const id = 'bt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const record = Object.assign({ id, createdAt: new Date().toISOString() }, backtest);
    items.push(record);
    persist(items);
    return record;
  }

  function update(id, patch) {
    const items = list();
    const idx = items.findIndex((b) => b.id === id);
    if (idx === -1) return null;
    items[idx] = Object.assign({}, items[idx], patch);
    persist(items);
    return items[idx];
  }

  function remove(id) {
    persist(list().filter((b) => b.id !== id));
  }

  window.CHESTBacktests = { list, get, add, update, remove };
})();
