// STASH · Journal de trading — CRUD des entrées manuelles + agrégation des
// trades venus de BERICH (live), dans un format commun, et gestion des
// comptes de journal (propre ou propfirm, avec leurs règles). Le Backtesting
// est volontairement exclu de cette agrégation — voir allEntries() plus bas.
//
// Entrée commune : { id, date, pair, side:'buy'|'sell', entry, sl, tp,
//   rrTarget, rrActual, result:'TP'|'SL'|'BE'|null (null = encore ouvert),
//   pnl (montant $, null si inconnu/ouvert), tags:[], chartLink, notes,
//   accountId (compte de journal concerné, entrées manuelles uniquement),
//   source:'manual'|'berich' }
//
// Compte de journal : { id, name, type:'own'|'propfirm', propfirmId,
//   balance, riskUnit:'usd'|'pct', riskValue,
//   rules:{ dailyLossPct, maxLossPct, profitTargetPct, minDays } | null,
//   rulesVerified: bool (true seulement pour un préréglage vérifié en direct),
//   connectionMode:'manual'|'mt5' }
//
// Honnêteté : le P&L des entrées 'berich' est celui réellement choisi au
// moment de la prise de position (mémorisé par berich-store.js), pas
// recalculé après coup. Les règles propfirm ne sont préremplies QUE pour
// FTMO (Challenge 2 étapes, Phase 1 — vérifié en direct le 2026-09-09) :
// les autres varient trop selon l'offre choisie pour être devinées sans
// risquer de mal représenter un vrai compte — saisie manuelle uniquement.
(() => {
  'use strict';

  const KEY = 'stash_journal';
  const TAGS_KEY = 'stash_journal_tags';
  const FAV_PAIRS_KEY = 'stash_journal_fav_pairs';
  const ACCOUNTS_KEY = 'stash_journal_accounts';
  const ACTIVE_ACCOUNT_KEY = 'stash_journal_active_account';

  // ---------- Propfirms sélectionnables (mêmes que BERICH) ----------
  const PROPFIRMS = [
    { id: 'ftmo', name: 'FTMO', domain: 'ftmo.com' },
    { id: 'alphacapital', name: 'Alpha Capital Group', domain: 'alphacapitalgroup.uk' },
    { id: 'smartfundtrader', name: 'Smart Fund Trader', domain: 'smartraderfunds.com' },
    { id: 'topstep', name: 'TopStep', domain: 'topstep.com' },
  ];

  // Règles vérifiées en direct (recherche du 2026-09-09) — uniquement FTMO,
  // dont le format Challenge 2 étapes a des paramètres fixes et documentés.
  // Alpha Capital Group, Smart Fund Trader et TopStep proposent plusieurs
  // offres avec des paramètres différents (% vs $, statique vs trailing) :
  // pas de préréglage fiable possible, saisie manuelle obligatoire pour eux.
  const PROPFIRM_RULE_PRESETS = {
    ftmo: {
      label: 'FTMO — Challenge 2 étapes, Phase 1 (vérifié 09/2026)',
      dailyLossPct: 5, maxLossPct: 10, profitTargetPct: 10, minDays: 4,
    },
  };

  function propfirms() { return PROPFIRMS.slice(); }
  function propfirmRulePreset(id) { return PROPFIRM_RULE_PRESETS[id] || null; }
  function propfirmLogo(domain) { return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}`; }

  // ---------- Comptes du journal (propre ou propfirm) ----------
  function listAccounts() {
    try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]'); } catch (e) { return []; }
  }
  function persistAccounts(items) {
    try { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(items)); } catch (e) { /* tant pis */ }
  }
  function addAccount(acc) {
    const items = listAccounts();
    const id = 'acc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const record = Object.assign({ id }, acc);
    items.push(record);
    persistAccounts(items);
    setActiveAccountId(id);
    return record;
  }
  function updateAccount(id, patch) {
    const items = listAccounts();
    const idx = items.findIndex((a) => a.id === id);
    if (idx === -1) return null;
    items[idx] = Object.assign({}, items[idx], patch);
    persistAccounts(items);
    return items[idx];
  }
  function removeAccount(id) {
    persistAccounts(listAccounts().filter((a) => a.id !== id));
    if (activeAccountId() === id) {
      const remaining = listAccounts();
      setActiveAccountId(remaining.length ? remaining[0].id : null);
    }
  }
  function activeAccountId() {
    try { return localStorage.getItem(ACTIVE_ACCOUNT_KEY); } catch (e) { return null; }
  }
  function setActiveAccountId(id) {
    try { id ? localStorage.setItem(ACTIVE_ACCOUNT_KEY, id) : localStorage.removeItem(ACTIVE_ACCOUNT_KEY); } catch (e) { /* tant pis */ }
  }
  function getActiveAccount() {
    const id = activeAccountId();
    const accounts = listAccounts();
    return accounts.find((a) => a.id === id) || accounts[0] || null;
  }

  // Montant $ à risquer pour un compte donné, selon son unité (fixe ou %).
  function riskAmountFor(account) {
    if (!account) return null;
    return account.riskUnit === 'pct' ? Math.round(account.balance * account.riskValue) / 100 : account.riskValue;
  }

  // ---------- Confirmations réutilisables (façon multi-select Notion) ----------
  function knownTags() {
    try { return JSON.parse(localStorage.getItem(TAGS_KEY) || '[]'); } catch (e) { return []; }
  }
  function rememberTag(tag) {
    const t = tag.trim();
    if (!t) return;
    const tags = knownTags();
    if (!tags.some((x) => x.toLowerCase() === t.toLowerCase())) {
      tags.push(t);
      try { localStorage.setItem(TAGS_KEY, JSON.stringify(tags)); } catch (e) { /* tant pis */ }
    }
  }

  // ---------- Paires favorites (remontent en haut de la liste) ----------
  function favoritePairs() {
    try { return JSON.parse(localStorage.getItem(FAV_PAIRS_KEY) || '[]'); } catch (e) { return []; }
  }
  function toggleFavoritePair(code) {
    const favs = favoritePairs();
    const next = favs.includes(code) ? favs.filter((c) => c !== code) : [...favs, code];
    try { localStorage.setItem(FAV_PAIRS_KEY, JSON.stringify(next)); } catch (e) { /* tant pis */ }
    return next;
  }

  function list() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
  }
  function persist(items) {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) { /* tant pis */ }
  }
  function add(entry) {
    const items = list();
    const id = 'jr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const record = Object.assign({ id, source: 'manual', tags: [] }, entry);
    items.push(record);
    persist(items);
    return record;
  }
  function update(id, patch) {
    const items = list();
    const idx = items.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    items[idx] = Object.assign({}, items[idx], patch);
    persist(items);
    return items[idx];
  }
  function remove(id) {
    persist(list().filter((e) => e.id !== id));
  }

  // ---------- Import depuis BERICH (positions prises via le bouton) ----------
  function rrFromLevels(side, entry, sl, tp) {
    const risk = Math.abs(entry - sl);
    if (!risk) return null;
    const reward = side === 'sell' ? entry - tp : tp - entry;
    return Math.round((reward / risk) * 100) / 100;
  }

  async function berichEntries() {
    if (!window.STASHBerich) return [];
    let data;
    try { data = await STASHBerich.fetchSignals(); } catch (e) { return []; }
    if (data.example) return []; // pas de vrai signal encore reçu
    const taken = STASHBerich.loadTaken();
    return (data.signals || [])
      .map((s) => {
        const meta = taken.find((t) => t.id === s.id);
        if (!meta) return null; // seules les positions confirmées entrent dans le journal
        const closed = s.status === 'closed';
        const rrTarget = rrFromLevels(s.side, s.entry, s.sl, s.tp);
        const rrActual = closed ? (s.result === 'TP' ? rrTarget : s.result === 'SL' ? -1 : 0) : null;
        const pnl = closed && meta.riskAmount != null && rrActual != null ? Math.round(meta.riskAmount * rrActual * 100) / 100 : null;
        return {
          id: 'berich-' + s.id,
          date: s.time,
          pair: s.symbol,
          side: s.side,
          entry: s.entry, sl: s.sl, tp: s.tp,
          rrTarget, rrActual,
          result: closed ? s.result : null,
          pnl,
          tags: [],
          chartLink: null,
          notes: '',
          accountId: null,
          source: 'berich',
          sourceLabel: `Risque ${meta.riskPercent}% (${meta.riskSource})`,
        };
      })
      .filter(Boolean);
  }

  // Le Backtesting reste volontairement à part : ses trades sont une
  // simulation de capital (voir backtest-engine.js), pas des positions
  // réelles rattachées à un compte de journal — les mélanger ici rendait le
  // journal illisible (des lignes "ETHAN"/"SWYPER" sans rapport avec une
  // vraie paire, un vrai risque ou un vrai compte). Chaque backtest garde
  // son propre historique dans backtest-view.html?id=... (accessible depuis
  // le menu ⋮ de sa carte sur backtesting.html).
  async function allEntries() {
    const [manual, live] = await Promise.all([
      Promise.resolve(list()),
      berichEntries(),
    ]);
    return [...manual, ...live].sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  // ---------- Stats — arithmétique directe (pas de simulation de capital,
  // pas de forfait sur le moteur de backtesting qui répond à un besoin
  // différent : projeter un capital, pas totaliser un P&L réel). BE est
  // compté à part (ni gagnant ni perdant), contrairement au moteur de
  // backtest qui le traite comme un gain — plus honnête pour un vrai journal.
  function computeStats(rows) {
    const closed = rows.filter((r) => r.result);
    const tp = closed.filter((r) => r.result === 'TP').length;
    const sl = closed.filter((r) => r.result === 'SL').length;
    const be = closed.filter((r) => r.result === 'BE').length;
    const decisive = tp + sl;
    const rrValues = closed.filter((r) => r.rrActual != null).map((r) => r.rrActual);
    const avgRR = rrValues.length ? Math.round((rrValues.reduce((s, v) => s + v, 0) / rrValues.length) * 100) / 100 : null;
    const pnlValues = closed.filter((r) => r.pnl != null).map((r) => r.pnl);
    const totalPnl = pnlValues.length ? Math.round(pnlValues.reduce((s, v) => s + v, 0) * 100) / 100 : null;
    return {
      total: rows.length, closed: closed.length, open: rows.length - closed.length,
      tp, sl, be,
      winRatePct: decisive ? Math.round((tp / decisive) * 1000) / 10 : null,
      avgRR, totalPnl,
    };
  }

  // ---------- Conditions propfirm/compte (façon "Trading Objectives" du Dashboard) ----------
  // Calculées uniquement sur les entrées manuelles rattachées à ce compte
  // (accountId) — les positions BERICH/backtest ne sont pas liées à un
  // compte de journal précis pour l'instant.
  function accountConditions(account, allRows) {
    if (!account || !account.rules) return null;
    const rows = allRows.filter((r) => r.accountId === account.id && r.result);
    const today = new Date().toDateString();
    const todayPnl = rows.filter((r) => new Date(r.date).toDateString() === today && r.pnl != null)
      .reduce((s, r) => s + r.pnl, 0);
    const totalPnl = rows.filter((r) => r.pnl != null).reduce((s, r) => s + r.pnl, 0);
    const tradingDays = new Set(rows.map((r) => new Date(r.date).toDateString())).size;
    const r = account.rules;

    const items = [];
    items.push({
      label: 'Perte journalière max', limit: `-${r.dailyLossPct}% (${(account.balance * r.dailyLossPct / 100).toFixed(0)}$)`,
      value: todayPnl, ok: todayPnl >= -(account.balance * r.dailyLossPct / 100),
    });
    items.push({
      label: 'Perte totale max', limit: `-${r.maxLossPct}% (${(account.balance * r.maxLossPct / 100).toFixed(0)}$)`,
      value: totalPnl, ok: totalPnl >= -(account.balance * r.maxLossPct / 100),
    });
    items.push({
      label: 'Objectif de profit', limit: `+${r.profitTargetPct}% (${(account.balance * r.profitTargetPct / 100).toFixed(0)}$)`,
      value: totalPnl, ok: totalPnl >= (account.balance * r.profitTargetPct / 100),
    });
    if (r.minDays) {
      items.push({ label: 'Jours de trading min.', limit: `${r.minDays} jours`, value: tradingDays, ok: tradingDays >= r.minDays, isCount: true });
    }
    return items;
  }

  window.STASHJournal = {
    list, add, update, remove, berichEntries, allEntries, computeStats,
    knownTags, rememberTag, favoritePairs, toggleFavoritePair,
    propfirms, propfirmRulePreset, propfirmLogo,
    listAccounts, addAccount, updateAccount, removeAccount,
    activeAccountId, setActiveAccountId, getActiveAccount, riskAmountFor, accountConditions,
  };
})();
