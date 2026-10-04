// CHEST · Suivi live visuel des positions ouvertes Myfxbook (2026-10-03).
// Estimation INDICATIVE, jamais enregistrée : le Journal garde les montants réels de Myfxbook.
// Le prix vient de Twelve Data (plan gratuit, relayé par accounts-bridge). Le décalage entre le prix
// du broker (Myfxbook) et celui de la source est mesuré à l'ouverture de chaque position, puis
// appliqué aux niveaux SL/TP pour qu'ils tombent au même endroit que sur le broker.
(() => {
  'use strict';

  const POLL_MS = 30000;
  const HISTORY_TTL_MS = 10 * 60 * 1000;
  const SESSION_TTL_MS = 20 * 60 * 1000;
  const MAX_SYMBOLS = 4;          // plan gratuit Twelve Data : ~8 requêtes/minute
  const MAX_OFFSET_RATIO = 0.005; // au-delà de 0,5 % d'écart, on suppose une erreur de fuseau : pas de recalage

  const sessions = {};
  const histories = {};
  const offsets = {};
  let timer = null;
  let current = null;

  const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
  const dirOf = (action) => {
    const a = String(action || '').toLowerCase();
    return a.startsWith('buy') ? 1 : a.startsWith('sell') ? -1 : 0;
  };
  const lotsOf = (t) => num(t.sizing && t.sizing.value) ?? num(t.lots);
  const srcSymbol = (sym) => {
    const m = String(sym || '').toUpperCase().match(/^([A-Z]{3})([A-Z]{3})/);
    return m ? `${m[1]}/${m[2]}` : null;
  };

  function twelveDataApi(endpoint, params) {
    const base = (window.CHEST_CONFIG && window.CHEST_CONFIG.accountsApiUrl) || 'http://localhost:8080';
    const token = window.CHESTAccounts && CHESTAccounts.getToken && CHESTAccounts.getToken();
    const qs = new URLSearchParams(params).toString();
    return fetch(`${base}/twelvedata/${endpoint}?${qs}`, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
  }

  async function sessionFor(mfx) {
    const c = sessions[mfx.email];
    if (c && Date.now() - c.at < SESSION_TTL_MS) return c.session;
    const session = await CHESTMyfxbook.login(mfx.email, mfx.password);
    sessions[mfx.email] = { session, at: Date.now() };
    return session;
  }

  async function historyFor(mfx, session) {
    const c = histories[mfx.accountId];
    if (c && Date.now() - c.at < HISTORY_TTL_MS) return c.trades;
    const raw = await CHESTMyfxbook.getHistory(session, mfx.accountId);
    const trades = raw.map((h) => (Array.isArray(h) ? h[0] : h)).filter(Boolean);
    histories[mfx.accountId] = { at: Date.now(), trades };
    return trades;
  }

  // Valeur d'un point de prix pour un lot, déduite des trades clôturés du même symbole : profit net
  // (commission et swap inclus) ÷ (mouvement de prix × lots). La médiane évite les trades atypiques.
  function unitPerPoint(symbol, trades) {
    const vals = [];
    for (const t of trades) {
      if (t.symbol !== symbol) continue;
      const d = dirOf(t.action), lots = lotsOf(t), o = num(t.openPrice), c = num(t.closePrice), p = num(t.profit);
      if (!d || !lots || o == null || c == null || p == null) continue;
      const move = d * (c - o);
      if (Math.abs(move) < 1e-9 || Math.abs(p) < 1) continue;
      vals.push(p / (move * lots));
    }
    if (vals.length < 3) return null;
    vals.sort((a, b) => a - b);
    return vals[Math.floor(vals.length / 2)];
  }

  async function sourcePrice(src) {
    const res = await twelveDataApi('price', { symbol: src });
    const j = await res.json();
    return num(j.price);
  }

  function parseOpen(raw) {
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const utcStamp = (d) => d.toISOString().slice(0, 19).replace('T', ' ');

  // Bougie 1 minute la plus proche de l'instant d'ouverture, côté source.
  async function sourceAt(src, when) {
    const res = await twelveDataApi('time_series', {
      symbol: src, interval: '1min', timezone: 'UTC', outputsize: 10,
      start_date: utcStamp(new Date(when.getTime() - 120000)), end_date: utcStamp(new Date(when.getTime() + 120000)),
    });
    const j = await res.json();
    if (!Array.isArray(j.values) || !j.values.length) return null;
    let best = null;
    for (const v of j.values) {
      const t = Date.parse(v.datetime.replace(' ', 'T') + 'Z');
      if (best == null || Math.abs(t - when) < Math.abs(best.t - when)) best = { t, close: num(v.close) };
    }
    return best ? best.close : null;
  }

  // Décalage = prix broker à l'ouverture − prix source au même instant. Ignoré s'il paraît aberrant
  // (en général une erreur de fuseau horaire entre Myfxbook et la source).
  async function offsetFor(t, src) {
    const key = [t.symbol, t.openTime || t.openDate, t.openPrice].join('|');
    if (key in offsets) return offsets[key];
    let off = null;
    const when = parseOpen(t.openTime || t.openDate), o = num(t.openPrice);
    if (when && o != null) {
      const s = await sourceAt(src, when);
      if (s != null && Math.abs(o - s) / o < MAX_OFFSET_RATIO) off = o - s;
    }
    offsets[key] = off;
    return off;
  }

  // P&L estimé = valeur du point × lots × sens × (prix source actuel − prix source à l'ouverture).
  // Le décalage ne change pas ce P&L : il sert seulement à placer SL/TP au niveau du broker.
  function estimate(t, unit, srcNow, off) {
    const d = dirOf(t.action), lots = lotsOf(t), o = num(t.openPrice);
    const sl = num(t.sl), tp = num(t.tp);
    const shift = off == null ? 0 : off;
    const pnl = unit != null && srcNow != null && off != null && d && lots ? unit * lots * d * (srcNow + off - o) : null;
    return {
      side: d > 0 ? 'Achat' : 'Vente', lots, entry: o,
      sl: sl == null || sl === 0 ? null : sl + (off == null ? 0 : off),
      tp: tp == null || tp === 0 ? null : tp + (off == null ? 0 : off),
      pnl, shifted: off != null, shift,
    };
  }

  async function compute(mfx) {
    const session = await sessionFor(mfx);
    const [open, trades] = await Promise.all([CHESTMyfxbook.getOpenTrades(session, mfx.accountId), historyFor(mfx, session)]);
    const positions = open.filter((t) => dirOf(t.action) && lotsOf(t));
    const symbols = [...new Set(positions.map((t) => t.symbol))].filter((s) => srcSymbol(s)).slice(0, MAX_SYMBOLS);
    const prices = {}, units = {};
    for (const sym of symbols) {
      prices[sym] = await sourcePrice(srcSymbol(sym));
      units[sym] = unitPerPoint(sym, trades);
    }
    const rows = [];
    for (const t of positions) {
      const sym = t.symbol;
      const src = srcSymbol(sym);
      const off = src && prices[sym] != null ? await offsetFor(t, src) : null;
      rows.push({ t, sym, est: estimate(t, units[sym], prices[sym], off) });
    }
    return { rows, at: new Date() };
  }

  async function tick() {
    if (!current) return;
    const { mfx, onUpdate } = current;
    let state;
    try {
      const { rows, at } = await compute(mfx);
      const pnls = rows.map((r) => r.est.pnl).filter((p) => p != null);
      state = { floating: pnls.length ? pnls.reduce((a, b) => a + b, 0) : 0, count: rows.length, at };
    } catch (e) {
      state = { floating: null, count: 0, at: new Date(), error: true };
    }
    if (current && current.mfx === mfx) onUpdate(state);
  }

  // onUpdate reçoit { floating, count, at } : P&L flottant estimé de toutes les positions ouvertes
  // (null si la mise à jour a échoué). Le Dashboard l'intègre à ses chiffres, pas dans une carte à part.
  function start(mfx, onUpdate) {
    if (current && current.mfx.accountId === mfx.accountId) return;
    stop();
    current = { mfx, onUpdate };
    tick();
    timer = setInterval(() => { if (!document.hidden) tick(); }, POLL_MS);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    current = null;
  }

  window.CHESTLiveSim = { start, stop };
})();
