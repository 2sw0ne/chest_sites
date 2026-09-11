// STASH · Stratégies — CRUD localStorage des scanners ajoutés en libre
// service (même logique que backtest-store.js pour les backtests) : chacun
// garde son vrai script Pine, ses valeurs par défaut (marché/paire/unité de
// temps), affichées en direct par scanner-chart.js (PineTS + Vela).
(() => {
  'use strict';

  const KEY = 'stash_scanners';

  // Scanner de départ (repris du script réel déjà documenté dans
  // strategy-example.html) pour ne pas partir d'une page vide.
  const SEED = [{
    id: 'seed-pivot-sr',
    name: 'Pivot Scanner S/R',
    description: "Repère automatiquement les niveaux de support et résistance formés par les pivots récents et les trace sur le graphique.",
    tags: ['Support & Résistance', 'Pivots'],
    market: 'forex',
    defaultSymbol: 'EURUSD',
    defaultTimeframe: '15',
    pineSource: `//@version=5
indicator("Pivot Scanner S/R", overlay=true, max_lines_count=200)

leftBars = input.int(15, "Barres à gauche")
rightBars = input.int(15, "Barres à droite")
lineColor = input.color(color.new(color.orange, 0), "Couleur des niveaux")

ph = ta.pivothigh(high, leftBars, rightBars)
pl = ta.pivotlow(low, leftBars, rightBars)

var line[] resLines = array.new_line()
var line[] supLines = array.new_line()

if not na(ph)
    newLine = line.new(bar_index[rightBars], ph, bar_index, ph, extend=extend.right, color=lineColor, width=1)
    array.push(resLines, newLine)

if not na(pl)
    newLine = line.new(bar_index[rightBars], pl, bar_index, pl, extend=extend.right, color=color.new(color.blue, 0), width=1)
    array.push(supLines, newLine)

alertcondition(not na(ph), title="Nouvelle résistance", message="Un nouveau pivot haut a été détecté.")
alertcondition(not na(pl), title="Nouveau support", message="Un nouveau pivot bas a été détecté.")`,
    createdAt: new Date().toISOString(),
  }];

  function list() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw == null) { persist(SEED); return SEED.slice(); }
      return JSON.parse(raw);
    } catch (e) { return []; }
  }
  function persist(items) {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) { /* tant pis */ }
  }
  function get(id) { return list().find((s) => s.id === id) || null; }
  function add(scanner) {
    const items = list();
    const id = 'sc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const record = Object.assign({ id, createdAt: new Date().toISOString() }, scanner);
    items.push(record);
    persist(items);
    return record;
  }
  function update(id, patch) {
    const items = list();
    const idx = items.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    items[idx] = Object.assign({}, items[idx], patch);
    persist(items);
    return items[idx];
  }
  function remove(id) {
    persist(list().filter((s) => s.id !== id));
  }

  window.STASHScanners = { list, get, add, update, remove };
})();
