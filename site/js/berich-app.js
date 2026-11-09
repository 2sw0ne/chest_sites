// CHEST · BERICH v3 (2026-10-28) — espace d'automatisation et de croissance du compte.
// Le membre démarre par un quiz (js/berich-quiz.js) : capital, objectif, durée, recul accepté, algorithme (BERICH I ou
// II). Le calcul (js/berich-plan.js) lui propose un algorithme et un money management ; la page montre ensuite son plan
// rejoué sur l'historique, l'automatisation (signal → plan → compte), l'éventail des futurs possibles, puis le détail
// de l'algorithme (performances, registre, sessions). BERICH I = flux en direct (berich-bridge) + historique
// TradingView ; les autres algorithmes viennent des backtests importés par l'admin (GET /berich/algos, jamais publics).
(() => {
  'use strict';
  const P = window.CHESTBerichPlan, Q = window.CHESTBerichQuiz, A = window.CHESTAccounts;

  // ================= Utilitaires =================
  const $ = (id) => document.getElementById(id);
  const DAY = 86400000;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = (v, d) => Number(v).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const money = (v) => (v < 0 ? '−' : '') + '$' + nf(Math.abs(v), 2);
  const signedMoney = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + '$' + nf(Math.abs(v), 2);
  const signedR = (v) => { const r = Math.round(v * 100) / 100; return (r > 0 ? '+' : r < 0 ? '−' : '') + nf(Math.abs(r), Math.abs(r) % 1 ? 2 : 0) + ' R'; };
  const eur = (v) => Math.round(v).toLocaleString('fr-FR') + ' €';
  const signedPct = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + nf(Math.abs(v), Math.abs(v) >= 100 ? 0 : 1) + ' %';
  const rk = (v) => nf(v, v % 1 ? (Math.round(v * 100) % 10 ? 2 : 1) : 0);
  const pctTxt = (v, d) => nf(v * 100, d == null ? 0 : d) + ' %';
  const tone = (v) => (v > 0 ? 'is-pos-txt' : v < 0 ? 'is-neg-txt' : '');
  const dateShort = (t) => { const d = new Date(t); return d.toLocaleDateString('fr-FR', d.getFullYear() === new Date().getFullYear() ? { day: '2-digit', month: 'short' } : { day: '2-digit', month: 'short', year: '2-digit' }); };
  const dateLong = (t) => { const d = new Date(t); return d.toLocaleDateString('fr-FR', d.getFullYear() === new Date().getFullYear() ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' }); };
  const durTxt = (m) => (m >= 12 ? `${m / 12} an${m > 12 ? 's' : ''}` : `${m} mois`);
  function ago(ms) {
    const m = Math.max(0, Math.round(ms / 60000));
    if (m < 1) return "à l'instant";
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} h ${String(m % 60).padStart(2, '0')}`;
    const d = Math.floor(h / 24);
    return `${d} j${h % 24 ? ' ' + (h % 24) + ' h' : ''}`;
  }
  function dur(ms) {
    if (ms == null || ms < 0) return '—';
    const h = ms / 3600000;
    if (h < 1) return `${Math.round(h * 60)} min`;
    if (h < 48) return `${nf(h, h < 10 ? 1 : 0)} h`;
    return `${nf(h / 24, 1)} j`;
  }
  const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  async function api(path, opts) {
    const o = opts || {};
    const res = await fetch(A.apiBase() + path, { method: o.method || 'GET', headers: Object.assign({ Authorization: 'Bearer ' + A.getToken() }, o.body ? { 'Content-Type': 'application/json' } : {}), body: o.body ? JSON.stringify(o.body) : undefined });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || 'Le serveur ne répond pas pour le moment.');
    return d;
  }
  const meUser = () => (A && A.getUser()) || {};

  // ================= État =================
  const S = { loaded: false, seeds: { berich1: [], berich2: [] }, live: [], updatedAt: null, feedOk: null, price: null, scope: 'plan', period: 'all', filter: 'all', shown: 10,
    uploaded: [], algo: 'berich1', plan: null, alts: null };

  // ================= Flux en direct (berich-bridge) + historiques =================
  // BERICH I : historique TradingView (data/berich-history-seed.json) ; BERICH II : son backtest
  // (data/berich2-history-seed.json). Les signaux du webhook portent `algo` (absent = BERICH I).
  const BUILTIN = { berich1: 'data/berich-history-seed.json', berich2: 'data/berich2-history-seed.json' };
  function rrFromLevels(s) {
    const risk = Math.abs(s.entry - s.sl);
    return risk ? Math.round((Math.abs(s.tp - s.entry) / risk) * 100) / 100 : null;
  }
  function fromLive(s) {
    const closed = s.status === 'closed';
    return { id: String(s.id), time: new Date(s.time).getTime(), closeTime: s.closedAt ? new Date(s.closedAt).getTime() : null,
      side: s.side, closed, result: s.result || null, detail: s.result || null,
      rr: closed ? (s.result === 'TP' ? rrFromLevels(s) : s.result === 'SL' ? -1 : 0) : null, entry: s.entry, sl: s.sl, tp: s.tp, algo: s.algo || 'berich1' };
  }
  function fromSeed(s) {
    return { id: s.id, time: s.time, closeTime: s.closeTime || null, side: s.side, closed: s.status === 'closed', result: s.result, detail: s.detail || s.result, rr: s.rr, origin: s.origin || 'tradingview', algo: s.algo || 'berich1' };
  }
  function livePositions(key) {
    const k = key || 'berich1';
    const live = S.live.map(fromLive).filter((l) => l.algo === k);
    const used = new Set();
    const merged = (S.seeds[k] || []).map(fromSeed).map((p) => {
      const twin = live.find((l) => !used.has(l.id) && (!p.side || l.side === p.side) && Math.abs(l.time - p.time) <= 15 * 60000);
      if (!twin) return p;
      used.add(twin.id);
      return Object.assign({}, p, { id: twin.id, entry: twin.entry, sl: twin.sl, tp: twin.tp, closeTime: p.closeTime || twin.closeTime, rr: p.rr != null ? p.rr : twin.rr });
    });
    live.forEach((l) => { if (!used.has(l.id)) merged.push(l); });
    return merged.sort((a, b) => b.time - a.time);
  }
  const allLive = () => [].concat(...Object.keys(BUILTIN).map(livePositions)).sort((a, b) => b.time - a.time);
  // Positions des algorithmes du plan (2026-11-05, « je suis sur BERICH II et je vois les trades de BERICH I ») :
  // le signal en cours et la ligne d'état ne montrent que ce que le plan du membre suit ; sans plan, tout.
  const planAlgos = () => { const L = legsOf(S.plan).map((l) => l.algo); return L.length ? L : null; };
  const myLive = () => { const A = planAlgos(); return A ? allLive().filter((p) => A.includes(p.algo)) : allLive(); };

  // ================= Algorithmes =================
  const ROMAN_NAME = { berich1: 'BERICH I', berich2: 'BERICH II', berich3: 'BERICH III' };
  const nameOf = (k) => { const u = S.uploaded.find((a) => a.key === k); return ROMAN_NAME[k] || (u && u.name) || String(k).toUpperCase(); };
  function backtestPositions(a) {
    return a.trades.map((t, i) => ({ id: `${a.key}-${i}`, time: t[0], closeTime: t[1], side: t[2] > 0 ? 'buy' : t[2] < 0 ? 'sell' : null, closed: true,
      rr: t[3], result: t[3] > 0 ? 'TP' : t[3] < 0 ? 'SL' : 'BE', detail: null, origin: 'backtest' })).sort((x, y) => y.time - x.time);
  }
  // BERICH I et II : historique du site + flux en direct ; un backtest importé par l'admin ne sert que de repli.
  function algos() {
    const out = [];
    Object.keys(BUILTIN).forEach((k) => {
      const up = S.uploaded.find((a) => a.key === k);
      if (livePositions(k).filter((p) => p.closed && p.rr != null).length >= 20) out.push({ key: k, live: true, positions: () => livePositions(k) });
      else if (up) out.push({ key: k, positions: () => backtestPositions(up) });
    });
    S.uploaded.filter((a) => !BUILTIN[a.key]).forEach((a) => out.push({ key: a.key, positions: () => backtestPositions(a) }));
    return out.map((a) => Object.assign(a, { name: nameOf(a.key) }));
  }
  const prepCache = new Map();
  function preps() {
    return algos().map((a) => {
      const list = a.positions().filter((p) => p.closed && p.rr != null);
      const k = a.key + ':' + list.length;
      if (!prepCache.has(k)) prepCache.set(k, P.prep(a.key, a.name, list.map((p) => ({ t: p.time, c: p.closeTime || p.time, side: p.side, r: p.rr }))));
      return prepCache.get(k);
    });
  }
  const prepOf = (k) => preps().find((p) => p.key === k) || null;
  const positions = () => { const a = algos().find((x) => x.key === S.algo) || algos()[0]; return a ? a.positions() : []; };

  function outcome(p) {
    if (!p.closed) return { cls: 'open', label: 'En cours' };
    const d = String(p.detail || p.result || '');
    const partial = d.match(/SL\s*\((TP\d)\)/i);
    if (p.rr > 0) return { cls: 'tp', label: /TP\d/i.test(d) ? d.toUpperCase() : 'Objectif' };
    if (p.rr === 0) return { cls: 'part', label: 'Break-even' };
    if (partial) return { cls: 'part', label: `Stop après ${partial[1].toUpperCase()}` };
    return { cls: 'sl', label: 'Stop' };
  }
  function takenMap() { const m = new Map(); CHESTBerich.loadTaken().forEach((t) => m.set(String(t.id), t)); return m; }
  function sessionOf(ts) {
    const h = new Date(ts).getUTCHours();
    if (h < 7) return 'Asie'; if (h < 12) return 'Londres'; if (h < 16) return 'Londres × NY'; if (h < 21) return 'New York'; return 'Soir';
  }
  // Compteur de l'algorithme : pour un membre, depuis le jour où il a débloqué BERICH (admin et éducateurs : tout).
  function unlockAt() {
    const u = meUser();
    if (u.isAdmin || u.role === 'educator') return null;
    const t = u.access && u.access.startedAt ? new Date(u.access.startedAt).getTime() : NaN;
    return Number.isFinite(t) ? t : null;
  }
  const inPeriod = (p) => S.period === 'all' || p.time >= Date.now() - Number(S.period) * DAY;
  function stats(list, valueOf) {
    const vals = list.slice().sort((a, b) => a.time - b.time).map(valueOf).filter((v) => v != null);
    const wins = vals.filter((v) => v > 0), losses = vals.filter((v) => v < 0);
    const total = vals.reduce((s, v) => s + v, 0);
    const gain = wins.reduce((s, v) => s + v, 0), loss = Math.abs(losses.reduce((s, v) => s + v, 0));
    let cum = 0, peak = 0, dd = 0;
    vals.forEach((v) => { cum += v; peak = Math.max(peak, cum); dd = Math.min(dd, cum - peak); });
    return { n: vals.length, wins: wins.length, losses: losses.length, total,
      winrate: wins.length + losses.length ? (wins.length / (wins.length + losses.length)) * 100 : null,
      expectancy: vals.length ? total / vals.length : null, pf: loss ? gain / loss : (gain ? Infinity : null), dd };
  }

  // ================= Compte relié =================
  // Plus de menu « compte suivi » : le petit check permet de changer de VPS s'il y en a plusieurs.
  const LINKED_KEY = 'chest_berich_linked_account';
  // Compte relié = UN COMPTE VPS uniquement (2026-10-29) : BERICH exécute sur le VPS. Un compte du Journal suivi par
  // Myfxbook ou saisi à la main n'est jamais proposé, même s'il était choisi avant.
  const vpsOf = (acc) => CHESTJournal.liveAccounts(acc).find((l) => l.kind === 'vps') || null;
  const vpsAccounts = () => CHESTJournal.listAccounts().filter(vpsOf);
  function linkedAccount() {
    let id = null;
    try { id = localStorage.getItem(LINKED_KEY); } catch (e) { /* tant pis */ }
    const list = vpsAccounts();
    const acc = id === 'none' ? null : list.find((a) => a.id === id) || list[0] || null;
    if (!acc) return null;
    const live = vpsOf(acc);
    const bal = live.info && live.info.balance != null ? live.info.balance : null;
    return { acc, live, balance: bal != null ? bal : acc.balance, equity: live.info ? live.info.equity : null, source: 'VPS en direct' };
  }
  let p3Req = null;
  function connState() {
    const la = linkedAccount();
    if (la && la.live) return { ok: true, name: la.acc.name, la };
    if (p3Req && p3Req.status === 'done') return { ok: true, name: `${p3Req.broker} · ${p3Req.login}` };
    if (p3Req && p3Req.status === 'pending') return { pending: true };
    return { ok: false, la };
  }
  function connection() {
    return CHESTBerich.loadConnection() || { broker: '', riskPercent: 1, riskMode: 'manual', presets: CHESTBerich.defaultPresets(), activePresetId: null };
  }
  function connControl() {
    const c = connState();
    if (c.pending) return `<span class="br-conn is-wait"><i></i>Compte envoyé · ton éducateur installe ton VPS sous 24 à 48 h</span>`;
    if (!c.ok) return `<a class="br-btn br-btn--sm" href="connect.html?plan=pro&from=berich" data-br-connect>Initialiser mon compte${ARROW}</a>`;
    const list = vpsAccounts();
    return `<span class="br-conn-wrap"><button type="button" class="br-conn is-ok" id="brConnBtn" aria-expanded="false" aria-haspopup="true" title="${esc(c.name)}"><span class="br-conn__check">${CHECK}</span>Compte relié</button>
      <span class="br-conn-menu" id="brConnMenu" hidden role="menu"><span class="br-conn-menu__h">${esc(c.name)}${c.la && c.la.balance != null ? ` · <b>${money(c.la.balance)}</b>` : ''}</span>
        ${list.length > 1 ? list.map((a) => `<button type="button" role="menuitemradio" aria-checked="${c.la && c.la.acc.id === a.id}" data-acc="${esc(a.id)}">${esc(a.name)}<small>VPS</small></button>`).join('') : ''}
        <a href="connect.html?plan=pro&from=berich" data-br-connect role="menuitem">Initialiser un autre compte →</a></span></span>`;
  }

  // ================= Plan =================
  // Plan v2 (diversifié) : une ou plusieurs « jambes » { algo, cfg } sur le même compte ; un plan v1 n'en a qu'une.
  // Plan incomplet (sans réglage) : ignoré au lieu de faire planter la page (diagnostic 2026-11-05).
  const legsOf = (pl) => (pl ? (pl.legs && pl.legs.length ? pl.legs : [{ algo: pl.algo, cfg: pl.cfg }]) : []).filter((l) => l && l.cfg);
  const planLegs = () => legsOf(S.plan).filter((l) => prepOf(l.algo));
  const planName = () => legsOf(S.plan).map((l) => nameOf(l.algo)).join(' + ');
  const planTotal = () => legsOf(S.plan).reduce((s, l) => s + l.cfg.risk, 0);
  // « BERICH II · 1,5 % par position, … » ou « BERICH II 1,5 % + BERICH I 0,25 %, … »
  const planLabel = () => { const L = legsOf(S.plan); return L.length > 1 ? P.describe(L, nameOf) : `${nameOf(L[0].algo)} · ${P.describeCfg(L[0].cfg)}`; };
  function planReplay(periodOnly) {
    const legs = planLegs();
    if (!legs.length) return null;
    const ps = legs.map((l) => { const p = prepOf(l.algo); return periodOnly ? P.prep(p.key, p.name, p.list.filter((x) => inPeriod({ time: x.t }))) : p; });
    const on = ps.map((p, i) => i).filter((i) => ps[i].n);
    if (!on.length) return { curve: [], final: S.plan.answers.capital, mult: 1, maxDd: 0, n: 0, from: null, worst: 0 };
    const r = P.replay(on.map((i) => ps[i]), on.map((i) => legs[i].cfg), S.plan.answers.capital);
    return Object.assign(r, { from: Math.min(...on.map((i) => ps[i].from)), worst: Math.max(...on.map((i) => ps[i].worstStreak)) });
  }
  // Préréglage « Mon plan » de la connexion (conservé pour Compte) : suit le réglage de BERICH I s'il fait partie du plan.
  function applyPlanToConnection(plan) {
    const L = legsOf(plan), cfg = (L.find((l) => l.algo === 'berich1') || L[0]).cfg;
    const c = connection();
    const presets = (c.presets && c.presets.length ? c.presets : CHESTBerich.defaultPresets()).filter((x) => x.id !== 'plan');
    presets.unshift({ id: 'plan', name: 'Mon plan', risk: cfg.risk, tiers: cfg.afterSl ? [{ afterSl: cfg.afterSl, newRisk: cfg.newRisk }] : [] });
    CHESTBerich.saveConnection(Object.assign({}, c, { presets, activePresetId: 'plan', riskMode: 'preset' }));
    CHESTBerich.saveLastRiskChoice({ mode: 'preset', presetId: 'plan' });
  }
  async function savePlan(plan) {
    const d = await api('/berich/plan', { method: 'PUT', body: plan });
    S.plan = d.plan; S.algo = plan.algo; S.scope = 'plan'; S.alts = null; riskChoiceIdx = null;
    applyPlanToConnection(plan);
    await loadPlans();
    if (window.showToast) showToast('Plan enregistré');
    renderAll();
  }
  function openQuiz(opts) {
    const ps = preps();
    if (!ps.length) { if (window.showToast) showToast('Les algorithmes se chargent encore, réessaie dans un instant.'); return; }
    Q.open({ preps: ps, answers: (opts && opts.answers) || (S.plan && S.plan.answers) || {}, result: opts && opts.result, onSave: savePlan,
      onClose: () => { try { sessionStorage.setItem('chest_berich_quiz_seen', '1'); } catch (e) { /* tant pis */ } } });
  }

  // ================= Ligne d'état =================
  function renderTop() {
    const last = myLive()[0];
    $('brStatus').innerHTML = S.feedOk === false
      ? '<span class="br-dot is-neg"></span><span>Flux injoignable</span>'
      : S.feedOk == null ? '<span class="br-dot"></span><span>Connexion au flux…</span>'
        : `<span class="br-dot is-live"></span><span>Flux connecté · dernier signal <b>il y a ${last ? ago(Date.now() - last.time) : '—'}</b></span>`;
    $('brPriceStat').hidden = S.price == null;
    $('brPrice').textContent = S.price != null ? nf(S.price, 2) : '—';
  }

  // ================= Signal en cours (flux BERICH I) =================
  const PRICE_INVALIDATE = 5;
  const INVALIDATED_KEY = 'chest_berich_invalidated';
  const invalidated = (() => { try { return new Set(JSON.parse(localStorage.getItem(INVALIDATED_KEY) || '[]')); } catch (e) { return new Set(); } })();
  function saveInvalidated() { try { localStorage.setItem(INVALIDATED_KEY, JSON.stringify([...invalidated])); } catch (e) { /* tant pis */ } }
  // Position en cours (2026-11-09) : BERICH ne prend ses positions que depuis un VPS ; la carte reste affichée tant que
  // la position n'est pas clôturée, qu'un compte soit relié ou non.
  // Positions ouvertes (2026-11-09) : toutes dessinées sur le graphique ; la carte détaille celle choisie (la plus récente par défaut).
  let selPos = null;
  const openPositions = () => myLive().filter((p) => !p.closed && p.entry != null).sort((a, b) => a.time - b.time);
  function activePosition() {
    const ps = openPositions();
    return ps.find((p) => p.id === selPos) || ps[ps.length - 1] || null;
  }
  function railHtml(p, markerValue) {
    const span = p.tp - p.sl;
    const x = (v) => Math.min(1, Math.max(0, (v - p.sl) / span)) * 100;
    const xe = x(p.entry);
    const xm = markerValue != null ? x(markerValue) : null;
    return `
      <div class="br-rail${xe < 26 || xe > 74 ? ' has-low' : ''}" role="img" aria-label="Prix ${markerValue != null ? nf(markerValue, 2) : 'inconnu'} — stop ${nf(p.sl, 2)}, entrée ${nf(p.entry, 2)}, objectif ${nf(p.tp, 2)}">
        <div class="br-rail__track"><div class="br-rail__loss" style="width:${xe}%"></div><div class="br-rail__win" style="left:${xe}%"></div></div>
        <span class="br-rail__tick" style="left:0"></span><span class="br-rail__tick is-entry" style="left:${xe}%"></span><span class="br-rail__tick" style="left:100%"></span>
        ${xm != null ? `<div class="br-rail__price ${xm > 82 ? 'is-end' : xm < 18 ? 'is-start' : ''}" style="left:${xm}%"><span>${nf(markerValue, 2)}</span><i></i></div>` : ''}
        <span class="br-rail__lbl is-first" style="left:0">STOP<b>${nf(p.sl, 2)}</b></span>
        <span class="br-rail__lbl is-entry" style="left:${xe}%">ENTRÉE<b>${nf(p.entry, 2)}</b></span>
        <span class="br-rail__lbl is-last">OBJECTIF<b>${nf(p.tp, 2)}</b></span>
      </div>`;
  }
  // Graphique des positions (2026-11-09, « comme un vrai graphique ») : jusqu'à 3 jours de M15, échelle de prix,
  // heures et jours, toutes les positions ouvertes (zones entrée → SL / TP, celle choisie en plein, les autres en
  // retrait), molette = zoom, glisser = remonter dans le passé, double-clic = revenir au présent.
  let miniBars = null, miniAt = 0;
  const MV = { n: 160, off: 0 }; // bougies visibles, décalage depuis la dernière
  async function loadMini(force) {
    if (document.hidden || (!force && Date.now() - miniAt < 4.5 * 60000)) return;
    miniAt = Date.now();
    try { const d = await api('/berich/candles'); if (Array.isArray(d.bars) && d.bars.length) miniBars = d.bars; } catch (e) { /* on garde les dernières */ }
    paintMini();
  }
  function paintMini() { const el = $('brMini'); if (el && activePosition()) el.innerHTML = miniHtml(S.price); }
  // marché fermé retiré comme sur le graphique des scanners : week-end, pause de 21 h UTC, bougies plates (O=H=L=C)
  function tradable(b) {
    if (b[1] === b[2] && b[2] === b[3] && b[3] === b[4]) return false;
    const d = new Date(b[0]), day = d.getUTCDay(), h = d.getUTCHours();
    return !(day === 6 || (day === 0 && h < 22) || (day === 5 && h >= 22) || h === 21);
  }
  function toM15(bars) {
    const out = [];
    bars.filter(tradable).forEach((b) => {
      const t = Math.floor(b[0] / 900000) * 900000, last = out[out.length - 1];
      if (last && last[0] === t) { last[2] = Math.max(last[2], b[2]); last[3] = Math.min(last[3], b[3]); last[4] = b[4]; }
      else out.push([t, b[1], b[2], b[3], b[4]]);
    });
    return out;
  }
  function niceStep(span, n) { const raw = span / n, k = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / k; return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * k; }
  const algoShort = (k) => nameOf(k).replace(/^BERICH\s+/i, '');
  function miniHtml(price) {
    if (!miniBars) return '<div class="br-mini__wait">Chargement du graphique…</div>';
    const ps = openPositions(), sel = activePosition();
    const TF = 900000, all = toM15(miniBars), L = all.length;
    MV.n = Math.max(Math.min(30, L), Math.min(L, MV.n)); MV.off = Math.max(0, Math.min(L - MV.n, MV.off));
    const bars = all.slice(L - MV.off - MV.n, L - MV.off), live = MV.off === 0;
    const W = 1000, H = 300, padR = live ? 0.2 : 0.02, cw = (W * (1 - padR)) / bars.length, t0 = bars[0][0];
    // position par bougie (les plages fermées n'existent pas sur l'axe) ; après la dernière bougie : au temps
    const xOf = (t) => {
      if (t < t0) return -cw;
      const last = bars[bars.length - 1][0];
      if (t > last) return (bars.length - 1 + (t - last) / TF) * cw;
      let a = 0, z = bars.length - 1;
      while (a < z) { const m = (a + z) >> 1; if (bars[m][0] < t) a = m + 1; else z = m; }
      return a * cw;
    };
    const core = [];
    bars.forEach((b) => { core.push(b[2], b[3]); });
    if (price != null && live) core.push(price);
    ps.forEach((p) => [p.entry, p.sl, p.tp].forEach((v) => { if (v != null && isFinite(v)) core.push(v); }));
    // positions passées visibles (clôturées, avec leurs niveaux) : dessinées de l'ouverture à la clôture
    const tLast = bars[bars.length - 1][0] + TF;
    const past = myLive().filter((p) => p.closed && p.entry != null && p.sl != null && p.tp != null && p.closeTime && p.closeTime > t0 && p.time < tLast);
    past.forEach((p) => [p.entry, p.sl, p.tp].forEach((v) => core.push(v)));
    let lo = Math.min(...core), hi = Math.max(...core);
    const pad = Math.max(hi - lo, 1) * 0.06; lo -= pad; hi += pad;
    const y = (v) => (hi - v) / (hi - lo) * H;
    const yc = (v) => Math.max(0, Math.min(H, y(v)));
    const pct = (v) => (v / H * 100).toFixed(2);
    // grille : prix
    const step = niceStep(hi - lo, 5);
    let grid = '', ticks = '';
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      grid += `<line x1="0" x2="${W}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="rgba(255,255,255,.045)" vector-effect="non-scaling-stroke"/>`;
      if (y(v) > 34 && y(v) < H - 24) ticks += `<span class="br-mini__tick" style="top:${pct(y(v))}%">${nf(v, step < 1 ? 1 : 0)}</span>`;
    }
    // grille : heures et jours
    const every = bars.length > 220 ? 12 : bars.length > 90 ? 6 : 3;
    let times = '';
    bars.forEach((b, i) => {
      const d = new Date(b[0]), h = d.getHours(), m = d.getMinutes();
      if (m || h % every) return;
      const x = i * cw + cw / 2, day = h === 0;
      grid += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="0" y2="${H}" stroke="rgba(255,255,255,${day ? '.07' : '.035'})" vector-effect="non-scaling-stroke"/>`;
      if (x > 24 && x < W - 24) times += `<span class="br-mini__time${day ? ' is-day' : ''}" style="left:${(x / W * 100).toFixed(2)}%">${day ? d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }) : String(h).padStart(2, '0') + ':00'}</span>`;
    });
    const xe = live ? W * 0.97 : W;
    let zones = '';
    ps.forEach((p) => {
      const on = p.id === sel.id, xs = Math.max(0, xOf(Math.floor(p.time / TF) * TF));
      if (xs >= xe) return;
      const box = (a, b2, col, op) => `<rect x="${xs.toFixed(1)}" y="${Math.min(yc(a), yc(b2)).toFixed(1)}" width="${(xe - xs).toFixed(1)}" height="${Math.abs(yc(a) - yc(b2)).toFixed(1)}" fill="${col}" fill-opacity="${op}"${on ? '' : ` stroke="${col}" stroke-opacity=".35" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"`}/>`;
      zones += box(p.entry, p.sl, '#ff4d5e', on ? '.15' : '.05') + box(p.entry, p.tp, '#33e6a6', on ? '.11' : '.04')
        + `<line x1="${xs.toFixed(1)}" x2="${xe.toFixed(1)}" y1="${y(p.entry).toFixed(1)}" y2="${y(p.entry).toFixed(1)}" stroke="rgba(246,246,247,${on ? '.6' : '.3'})" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/>`;
    });
    let pastSvg = '', pastTags = '';
    past.forEach((p) => {
      const xs = Math.max(0, xOf(Math.floor(p.time / TF) * TF)), x2 = Math.min(W, xOf(Math.floor(p.closeTime / TF) * TF) + cw);
      if (x2 <= xs) return;
      const box = (a, b2, col, op) => `<rect x="${xs.toFixed(1)}" y="${Math.min(yc(a), yc(b2)).toFixed(1)}" width="${(x2 - xs).toFixed(1)}" height="${Math.abs(yc(a) - yc(b2)).toFixed(1)}" fill="${col}" fill-opacity="${op}"/>`;
      pastSvg += box(p.entry, p.sl, '#ff4d5e', '.09') + box(p.entry, p.tp, '#33e6a6', '.07')
        + `<line x1="${xs.toFixed(1)}" x2="${x2.toFixed(1)}" y1="${y(p.entry).toFixed(1)}" y2="${y(p.entry).toFixed(1)}" stroke="rgba(246,246,247,.35)" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"/>`;
      const rr = p.rr != null ? p.rr : null, res = p.result || (rr > 0 ? 'TP' : rr < 0 ? 'SL' : 'BE');
      const at = res === 'TP' ? p.tp : res === 'SL' ? p.sl : p.entry;
      pastTags += `<span class="br-mini__past ${rr > 0 ? 'is-win' : rr < 0 ? 'is-loss' : ''}" style="left:${(x2 / W * 100).toFixed(2)}%;top:${(yc(at) / H * 100).toFixed(2)}%" title="${esc(nameOf(p.algo))} · ${p.side === 'sell' ? 'Vente' : 'Achat'} · ${esc(res)}">${esc(res)}${rr != null ? ' ' + signedR(rr) : ''}</span>`;
    });
    const candles = bars.map((b, i) => {
      const x = i * cw + cw / 2, up = b[4] >= b[1], c = up ? '#33e6a6' : '#ff4d5e';
      const yo = y(b[1]), ycl = y(b[4]), top = Math.min(yo, ycl), hgt = Math.max(1.5, Math.abs(ycl - yo));
      return `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${y(b[2]).toFixed(1)}" y2="${y(b[3]).toFixed(1)}" stroke="${c}" stroke-opacity=".7" stroke-width="1.2" vector-effect="non-scaling-stroke"/>`
        + `<rect x="${(x - cw * 0.34).toFixed(1)}" y="${top.toFixed(1)}" width="${(cw * 0.68).toFixed(1)}" height="${hgt.toFixed(1)}" rx="${Math.min(2, cw * 0.15).toFixed(1)}" fill="${c}" fill-opacity="${up ? '.92' : '.88'}"/>`;
    }).join('');
    // étiquettes des niveaux, écartées pour ne jamais se chevaucher
    const many = ps.length > 1, lv = [];
    const dupAlgo = new Set(ps.map((p) => p.algo)).size < ps.length;
    ps.forEach((p, k) => {
      const on = p.id === sel.id, pre = many ? (dupAlgo ? (k + 1) : algoShort(p.algo)) + ' · ' : '';
      lv.push({ v: p.tp, cls: 'is-tp', txt: pre + 'TP', on }, { v: p.entry, cls: 'is-pe', txt: pre + 'PE', on }, { v: p.sl, cls: 'is-sl', txt: pre + 'SL', on });
    });
    lv.forEach((l) => { l.top = Math.max(4, Math.min(96, yc(l.v) / H * 100)); });
    lv.sort((a, b) => a.top - b.top);
    for (let i = 1; i < lv.length; i++) lv[i].top = Math.max(lv[i].top, lv[i - 1].top + 9);
    const over = lv.length ? lv[lv.length - 1].top - 96 : 0;
    if (over > 0) for (let i = lv.length - 1; i >= 0; i--) { lv[i].top -= over; if (i && lv[i - 1].top > lv[i].top - 9) lv[i - 1].top = lv[i].top - 9; }
    const labels = lv.map((l) => `<span class="br-mini__lvl ${l.cls}${l.on ? '' : ' is-dim'}" style="top:${l.top.toFixed(2)}%">${esc(l.txt)} ${nf(l.v, 2)}</span>`).join('')
      + (price != null && live ? `<span class="br-mini__lvl is-px" style="top:${Math.max(4, Math.min(96, yc(price) / H * 100)).toFixed(2)}%">Prix ${nf(price, 2)}</span>` : '');
    const span = bars.length / 4;
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
        ${grid}${pastSvg}${zones}${candles}
        ${price != null && live ? `<line x1="0" x2="${W}" y1="${y(price).toFixed(1)}" y2="${y(price).toFixed(1)}" stroke="rgba(246,246,247,.35)" stroke-dasharray="2 5" vector-effect="non-scaling-stroke"/>` : ''}
      </svg>
      <div class="br-mini__ticks" aria-hidden="true">${ticks}</div>
      <div class="br-mini__times" aria-hidden="true">${times}${pastTags}</div>
      <div class="br-mini__lvls" aria-label="Niveaux des positions">${labels}</div>
      <span class="br-mini__tf">XAU/USD · M15 · ${span >= 30 ? nf(span / 24, 1) + ' j' : Math.round(span) + ' h'}${live ? '' : ' · <button type="button" class="br-mini__now" data-br-now>Revenir au présent</button>'}</span>`;
  }
  // molette = zoom, glisser = passé, double-clic = présent ; onglets des positions
  (function bindMini() {
    const host = $('brSignal');
    if (!host) return;
    let drag = null;
    host.addEventListener('wheel', (e) => {
      if (!e.target.closest('#brMini') || !miniBars) return;
      e.preventDefault();
      MV.n = Math.round(MV.n * (e.deltaY > 0 ? 1.15 : 1 / 1.15)); paintMini();
    }, { passive: false });
    host.addEventListener('pointerdown', (e) => {
      const m = e.target.closest('#brMini');
      if (!m || e.button || e.target.closest('button')) return;
      drag = { x: e.clientX, off: MV.off, w: m.getBoundingClientRect().width };
      try { m.setPointerCapture(e.pointerId); } catch (err) { /* tant pis */ }
      m.classList.add('is-drag');
    });
    host.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const off = Math.round(drag.off + (e.clientX - drag.x) / (drag.w * 0.85 / MV.n));
      if (off !== MV.off) { MV.off = off; paintMini(); }
    });
    const end = () => { if (!drag) return; drag = null; const m = $('brMini'); if (m) m.classList.remove('is-drag'); };
    host.addEventListener('pointerup', end); host.addEventListener('pointercancel', end);
    host.addEventListener('dblclick', (e) => { if (e.target.closest('#brMini')) { MV.n = 160; MV.off = 0; paintMini(); } });
    host.addEventListener('click', (e) => {
      if (e.target.closest('[data-br-now]')) { MV.off = 0; paintMini(); return; }
      const b = e.target.closest('[data-br-pos]');
      if (b) { selPos = b.dataset.brPos; renderSignal(); }
    });
  })();
  setInterval(() => { if (activePosition()) loadMini(); }, 60000);
  let riskChoiceIdx = null;
  function posTabs() {
    const ps = openPositions(), sel = activePosition();
    if (ps.length < 2) return '';
    const dupAlgo = new Set(ps.map((p) => p.algo)).size < ps.length;
    return `<div class="br-postabs" role="tablist" aria-label="Positions en cours">${ps.map((p, k) => {
      const fr = S.price != null && (p.entry - p.sl) ? (S.price - p.entry) / (p.entry - p.sl) : null;
      return `<button type="button" role="tab" data-br-pos="${esc(p.id)}" aria-selected="${p.id === sel.id}"><span class="br-dot is-live"></span>${dupAlgo ? (k + 1) + ' · ' : ''}${esc(nameOf(p.algo))} · ${p.side === 'sell' ? 'Vente' : 'Achat'} <b class="${tone(fr)}">${fr == null ? '—' : signedR(fr)}</b></button>`;
    }).join('')}</div>`;
  }
  function renderSignal() {
    const el = $('brSignal');
    const p = activePosition();
    if (!p) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    if (!miniBars) loadMini(true);
    const c = connState();
    const leg = legsOf(S.plan).find((l) => l.algo === p.algo);
    const isSell = p.side === 'sell';
    el.classList.toggle('is-sell', isSell);
    const floatR = S.price != null && (p.entry - p.sl) ? (S.price - p.entry) / (p.entry - p.sl) : null;
    const rrTarget = rrFromLevels(p);
    const la = linkedAccount();
    const risk = leg ? leg.cfg.risk : null;
    const amount = c.ok && la && la.balance != null && risk != null ? la.balance * risk / 100 : null;
    const floatMoney = amount != null && floatR != null ? amount * floatR : null;
    el.innerHTML = `
      <div class="br-signal__row">
        <div>
          <span class="br-signal__kicker"><span class="br-dot is-live"></span>${openPositions().length > 1 ? openPositions().length + ' positions en cours' : c.ok ? 'Position prise par ton VPS' : 'Position en cours'} · ${esc(nameOf(p.algo))}</span>
          <h2>${isSell ? 'Vente' : 'Achat'} XAU/USD</h2>
          <div class="br-signal__meta">Ouverte il y a ${ago(Date.now() - p.time)} · session ${sessionOf(p.time)} · objectif ${rrTarget != null ? '+' + nf(rrTarget, rrTarget % 1 ? 1 : 0) + ' R' : '—'}</div>
        </div>
        <div class="br-signal__r"><b class="${tone(floatR)}">${floatR == null ? '—' : signedR(floatR)}</b><small>${floatMoney != null ? signedMoney(floatMoney) + ' latent' : 'résultat latent'}</small></div>
      </div>
      ${posTabs()}
      <div class="br-mini" id="brMini">${miniHtml(S.price)}</div>
      ${railHtml(p, S.price)}
      <div class="br-signal__foot">
        ${c.ok ? `<span class="br-done">${CHECK}Exécutée par ton VPS</span>
          <span class="br-signal__risk">Risque <b>${risk != null ? rk(risk) + ' %' : '—'}</b>${amount != null ? ` → <b>${money(amount)}</b>` : ''} · selon ton plan ${esc(planName() || '')}.</span>`
        : c.pending ? `<span class="br-signal__risk">Ton éducateur installe ton VPS : les prochains signaux seront pris pour toi automatiquement.</span>`
        : `<span class="br-signal__risk">BERICH ne prend ses positions que depuis un VPS : initialise ton compte, les prochains signaux seront pris pour toi 24 h / 24, au risque de ton plan.</span>
          <a class="br-btn" href="connect.html?plan=pro&from=berich" data-br-connect>Initialiser mon compte${ARROW}</a>`}
      </div>`;
  }

  // ================= Accueil sans plan =================
  function renderIntro() {
    const el = $('brIntro');
    el.hidden = !!S.plan || !S.loaded;
    if (el.hidden) return;
    const ps = preps();
    el.innerHTML = `<span class="br-label">Ton plan BERICH</span>
      <h1>Fais travailler ton compte,<br>avec un plan calculé pour toi.</h1>
      <p>Six questions : ton capital, ton objectif, ton délai, le recul que tu acceptes${ps.length > 1 ? ' et ton algorithme' : ''}. On rejoue ${ps.reduce((s, p) => s + p.n, 0).toLocaleString('fr-FR')} positions réelles et 800 futurs possibles pour te proposer le risque par position qui atteint le plus souvent ton objectif.</p>
      <div class="br-intro__cta"><button type="button" class="br-btn" data-br="quiz">Construire mon plan${ARROW}</button><span>2 minutes · modifiable à tout moment</span></div>
      ${ps.length ? `<div class="br-intro__algos">${ps.map((p) => `<span><b>${esc(p.name)}</b>${nf(p.winrate * 100, 0)} % gagnants · ${nf(p.avgWin, 1)} R par gain · ${p.total > 0 ? '+' : ''}${nf(p.total, 0)} R en ${nf(p.months, 0)} mois</span>`).join('')}</div>` : ''}`;
  }

  // ================= Hero =================
  function renderWatch() {
    const el = $('brWatch');
    if (activePosition()) { el.innerHTML = ''; return; }
    const times = livePositions('berich1').map((p) => p.time).sort((a, b) => a - b);
    const gap = times.length > 1 ? (times[times.length - 1] - times[0]) / (times.length - 1) : null;
    el.innerHTML = `<span class="br-dot is-live"></span><span><b>BERICH surveille l'or</b> — aucun signal ouvert${gap ? ` · un signal tous les ${nf(gap / DAY, 1)} j en moyenne` : ''}</span>`;
  }
  function renderPlanLine() {
    const el = $('brPlanLine');
    const pl = S.plan;
    const la = linkedAccount();
    const goal = pl && pl.answers;
    const prog = pl && la && la.live && la.balance != null && goal.target > goal.capital
      ? Math.max(0, Math.min(1, (la.balance - goal.capital) / (goal.target - goal.capital))) : null;
    el.innerHTML = `${pl ? `<button type="button" class="br-planchip" data-br="adjust" title="Ajuster mon plan"><span class="br-planchip__a">${legsOf(pl).length > 1 ? 'Diversifié' : esc(nameOf(pl.algo))}</span><span>${esc(legsOf(pl).length > 1 ? P.describe(legsOf(pl), nameOf) : P.describeCfg(pl.cfg))}</span><span class="br-planchip__e">Ajuster</span></button>` : ''}
      ${connControl()}
      ${prog != null ? `<span class="br-goal" title="De ${eur(goal.capital)} à ${eur(goal.target)}"><span class="br-goal__bar"><i style="transform:scaleX(${prog.toFixed(3)})"></i></span><span><b>${money(la.balance)}</b> / objectif ${eur(goal.target)}</span></span>` : ''}`;
  }
  function renderControls() {
    const tabs = [['plan', 'Ton plan · €'], ['algo', `${nameOf(S.algo)} · R`]].filter(([k]) => k !== 'plan' || S.plan);
    if (S.scope === 'me') S.scope = S.plan ? 'plan' : 'algo';
    if (S.scope === 'plan' && !S.plan) S.scope = 'algo';
    $('brScope').innerHTML = tabs.map(([k, l]) => `<button type="button" data-v="${k}" aria-pressed="${S.scope === k}">${esc(l)}</button>`).join('');
  }
  function scopeSeries() {
    if (S.scope === 'plan' && S.plan) {
      const r = planReplay(true);
      const pts = r.curve;
      return { kind: 'plan', r, labels: pts.map((x, i) => (i ? dateShort(x.t) : 'Départ')), series: pts.map((x) => Math.round(x.v * 100) / 100),
        fmt: eur, unit: '€', base: S.plan.answers.capital, target: S.plan.answers.target, n: r.n };
    }
    const since = unlockAt();
    const all = positions().filter((p) => p.closed && p.rr != null && inPeriod(p) && !(S.scope === 'algo' && S.algo === 'berich1' && since && p.time < since)).sort((a, b) => a.time - b.time);
    if (S.scope === 'algo') return { kind: 'algo', list: all, val: (p) => p.rr, fmt: signedR, unit: 'R' };
    const taken = takenMap();
    const mine = allLive().filter((p) => p.closed && p.rr != null && inPeriod(p) && taken.has(p.id) && taken.get(p.id).riskAmount != null).sort((a, b) => a.time - b.time);
    return { kind: 'me', list: mine, val: (p) => taken.get(p.id).riskAmount * p.rr, fmt: signedMoney, unit: '$' };
  }

  let chart = null;
  const MINT = [51, 230, 166], RED = [255, 77, 94];
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  // Vert au-dessus du point de départ, rouge en dessous, lueur néon (même principe que la courbe du Dashboard).
  function heatGradient(ch, series, base, forLine) {
    const { ctx, chartArea, scales } = ch;
    if (!chartArea) return forLine ? rgba(MINT, 1) : rgba(MINT, .12);
    const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    const maxV = Math.max(...series, base), minV = Math.min(...series, base);
    let t = (scales.y.getPixelForValue(base) - chartArea.top) / ((chartArea.bottom - chartArea.top) || 1);
    t = Math.max(0.001, Math.min(0.999, t));
    if (forLine) {
      if (minV >= base) { g.addColorStop(0, rgba(MINT, 1)); g.addColorStop(1, rgba(MINT, 1)); return g; }
      if (maxV <= base) { g.addColorStop(0, rgba(RED, 1)); g.addColorStop(1, rgba(RED, 1)); return g; }
      g.addColorStop(0, rgba(MINT, 1)); g.addColorStop(t, rgba(MINT, 1)); g.addColorStop(t, rgba(RED, 1)); g.addColorStop(1, rgba(RED, 1));
      return g;
    }
    g.addColorStop(0, rgba(MINT, maxV > base ? .26 : 0)); g.addColorStop(t, rgba(MINT, 0)); g.addColorStop(t, rgba(RED, 0)); g.addColorStop(1, rgba(RED, minV < base ? .24 : 0));
    return g;
  }
  const glowPlugin = {
    id: 'brGlow',
    beforeDatasetDraw(c, args) { if (args.index !== 0) return; c.ctx.save(); c.ctx.shadowColor = 'rgba(160,255,220,.5)'; c.ctx.shadowBlur = 12; },
    afterDatasetDraw(c, args) { if (args.index === 0) c.ctx.restore(); },
  };
  // Ligne d'objectif en pointillés (vue « Ton plan »).
  const goalPlugin = {
    id: 'brGoal',
    afterDatasetsDraw(c, args, o) {
      if (!o || o.value == null) return;
      const { ctx, chartArea, scales } = c, y = scales.y.getPixelForValue(o.value);
      if (y < chartArea.top || y > chartArea.bottom) return;
      ctx.save(); ctx.setLineDash([5, 6]); ctx.strokeStyle = 'rgba(200,255,240,.45)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(chartArea.left, y); ctx.lineTo(chartArea.right, y); ctx.stroke();
      ctx.setLineDash([]); ctx.fillStyle = 'rgba(200,255,240,.8)'; ctx.font = '600 11px "Instrument Sans", system-ui'; ctx.textAlign = 'right';
      ctx.fillText(o.label, chartArea.right - 4, y - 8); ctx.restore();
    },
  };
  function renderCurve(sc) {
    const empty = $('brCurveEmpty'), canvas = $('brCurveCanvas');
    let series, labels, base = 0, fmtY;
    if (sc.kind === 'plan') {
      series = sc.series; labels = sc.labels; base = sc.base;
      fmtY = (v) => (Math.abs(v) >= 10000 ? Math.round(v / 1000).toLocaleString('fr-FR') + ' k€' : Math.round(v).toLocaleString('fr-FR') + ' €');
    } else {
      let cum = 0;
      series = [0].concat(sc.list.map((p) => { cum += sc.val(p); return Math.round(cum * 100) / 100; }));
      labels = ['Départ'].concat(sc.list.map((p) => dateShort(p.time)));
      fmtY = (v) => (sc.unit === 'R' ? (v > 0 ? '+' : '') + Math.round(v) + ' R' : '$' + Math.round(v));
    }
    if (series.length < 2) {
      if (chart) { chart.destroy(); chart = null; }
      canvas.hidden = true; empty.hidden = false;
      empty.innerHTML = sc.kind === 'me'
        ? `<span>Aucune position prise via BERICH${S.period === 'all' ? '' : ' sur cette période'}.<br>Confirme un signal avec « Prendre le trade » : ta propre courbe, en dollars, se dessine ici.</span>`
        : '<span>Aucune position clôturée sur cette période.</span>';
      return;
    }
    canvas.hidden = false; empty.hidden = true;
    if (!window.Chart) return;
    if (chart) chart.destroy();
    const lo = Math.min(...series, base), hi = Math.max(...series, base, sc.kind === 'plan' && sc.target <= Math.max(...series) * 1.25 ? sc.target : -Infinity);
    const pad = Math.max((hi - lo) * 0.12, sc.unit === 'R' ? 1 : 10);
    chart = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets: [
        { data: series, borderWidth: 2.2, cubicInterpolationMode: 'monotone', pointRadius: 0, pointHoverRadius: 5, pointHoverBorderWidth: 2, pointHoverBackgroundColor: '#03100c',
          borderColor: (c) => heatGradient(c.chart, series, base, true), pointHoverBorderColor: (c) => heatGradient(c.chart, series, base, true),
          fill: { value: base }, backgroundColor: (c) => heatGradient(c.chart, series, base, false), borderCapStyle: 'round', borderJoinStyle: 'round' },
      ] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 650, easing: 'easeOutQuart' },
        layout: { padding: { top: 8, right: 6 } },
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, brGoal: sc.kind === 'plan' ? { value: sc.target, label: `Objectif ${eur(sc.target)}` } : {},
          tooltip: { displayColors: false, backgroundColor: 'rgba(5, 12, 10,.92)', borderColor: 'rgba(127,245,214,.25)', borderWidth: 1, padding: 10,
            callbacks: { label: (i) => sc.fmt(i.parsed.y) } } },
        scales: {
          y: { ...(sc.kind === 'plan' ? { grace: '6%' } : { min: lo - pad, max: hi + pad }), grid: { color: (c) => (Math.abs(c.tick.value - base) < 1e-9 ? 'rgba(255, 255, 255,.16)' : 'rgba(255, 255, 255,.045)') }, border: { display: false },
            ticks: { color: '#5c5c63', maxTicksLimit: 5, padding: 10, callback: fmtY } },
          x: { grid: { display: false }, border: { display: false }, ticks: { color: '#5c5c63', maxTicksLimit: 7, maxRotation: 0, padding: 8 } },
        },
      },
      plugins: [glowPlugin, goalPlugin],
    });
  }
  function kpi(label, value, note, cls) { return `<div class="br-kpi"><div class="br-label">${label}</div><div class="br-kpi__v ${cls || ''}">${value}</div><div class="br-kpi__n">${note}</div></div>`; }
  function renderHero() {
    renderWatch(); renderPlanLine(); renderControls();
    $('brHeroNum').style.visibility = S.loaded ? '' : 'hidden';
    if (!S.loaded) { $('brHeroSub').textContent = 'Chargement des positions…'; $('brCurveEmpty').hidden = true; $('brKpis').innerHTML = ''; return; }
    const sc = scopeSeries();
    const num = $('brHeroNum');
    if (sc.kind === 'plan') {
      const r = sc.r, cap = S.plan.answers.capital, perf = (r.mult - 1) * 100, L = legsOf(S.plan);
      num.textContent = eur(r.final); num.classList.toggle('is-neg', r.final < cap);
      $('brHeroSub').innerHTML = sc.n
        ? `Ton plan rejoué sur <b>${sc.n}</b> positions ${esc(planName())} · <b>${eur(cap)}</b> au départ, le <b>${dateLong(r.from)}</b>`
        : 'Aucune position sur cette période.';
      renderCurve(sc);
      $('brKpis').innerHTML = kpi('Performance', signedPct(perf), `${eur(cap)} → ${eur(r.final)}`, tone(perf))
        + kpi('Recul max', r.maxDd ? '−' + pctTxt(r.maxDd, 1) : '0 %', 'depuis un plus haut', r.maxDd ? 'is-neg-txt' : '')
        + kpi('Pire série', r.worst ? `${r.worst} stops` : '—', L.length > 1 ? 'd’un algorithme' : 'd’affilée')
        + kpi('Risque', rk(planTotal()) + ' %', L.length > 1 ? L.map((l) => `${nameOf(l.algo)} ${rk(l.cfg.risk)} %`).join(' · ') : L[0] && L[0].cfg.afterSl ? `${rk(L[0].cfg.newRisk)} % après ${L[0].cfg.afterSl} stops` : 'par position')
        + kpi('Positions', String(sc.n), 'rejouées');
    } else {
      const st = stats(sc.list, sc.val);
      num.textContent = st.n ? sc.fmt(st.total) : '—';
      num.classList.toggle('is-neg', st.total < 0);
      const since = sc.kind === 'algo' && S.algo === 'berich1' ? unlockAt() : null;
      const first = sc.list[0];
      $('brHeroSub').innerHTML = st.n
        ? `<b>${st.n}</b> position${st.n > 1 ? 's' : ''} ${sc.kind === 'me' ? 'prises par toi' : esc(nameOf(S.algo))} · ${since && S.period === 'all' ? `depuis ton accès à BERICH, le <b>${dateLong(since)}</b>` : `depuis le <b>${dateLong(first.time)}</b>`}`
        : since ? `Ton compteur démarre le ${dateLong(since)}, jour où tu as débloqué BERICH. Les performances complètes de l’algorithme sont plus bas.`
          : (sc.kind === 'me' ? 'Tes positions prises via BERICH, en dollars' : `Tous les signaux ${esc(nameOf(S.algo))}, en R`);
      renderCurve(sc);
      const pf = st.pf === Infinity ? '∞' : st.pf != null ? nf(st.pf, 2) : '—';
      $('brKpis').innerHTML = kpi('Winrate', st.winrate != null ? nf(st.winrate, 1) + ' %' : '—', `${st.wins} gagnante${st.wins > 1 ? 's' : ''} · ${st.losses} perdante${st.losses > 1 ? 's' : ''}`)
        + kpi('Espérance', st.expectancy != null ? sc.fmt(st.expectancy) : '—', 'par position', tone(st.expectancy))
        + kpi('Profit factor', pf, 'gains ÷ pertes')
        + kpi('Drawdown max', st.n ? (st.dd < 0 ? sc.fmt(st.dd) : '0') : '—', 'pire recul cumulé', st.dd < 0 ? 'is-neg-txt' : '')
        + kpi('Positions', String(st.n), 'clôturées');
    }
    // Compte VPS : positions ouvertes en direct, sous la courbe.
    const la = linkedAccount();
    const pos = la && la.live && la.live.kind === 'vps' && la.live.info && Array.isArray(la.live.info.positions) ? la.live.info.positions : null;
    $('brOpenPos').hidden = !(pos && pos.length);
    if (pos && pos.length) {
      $('brOpenPos').innerHTML = pos.slice(0, 6).map((q) => `<span><span class="br-side-txt ${q.side === 'sell' ? 'sell' : 'buy'}">${q.side === 'sell' ? 'Vente' : 'Achat'}</span> ${esc(q.symbol)} · ${nf(q.volume || 0, 2)} lot · <b class="${tone(q.profit)} br-flat">${signedMoney(Number(q.profit) || 0)}</b></span>`).join('');
    }
  }

  // ================= 01 — Automatisation =================
  function renderAuto() {
    const el = $('brAutoBody');
    const c = connState(), pl = S.plan, la = linkedAccount();
    const last = allLive()[0];
    const bal = la && la.balance != null ? la.balance : null;
    const L = legsOf(pl), attached = pl && pl.attachedAt;
    const node = (n, title, sub, state, extra) => `<li class="br-node is-${state}"><span class="br-node__i">${state === 'ok' ? CHECK : `<b>${n}</b>`}</span><span class="br-node__t">${title}</span><span class="br-node__s">${sub}</span>${extra || ''}</li>`;
    el.innerHTML = `<ol class="br-flow${c.ok && pl ? ' is-live' : ''}">
      ${node(1, 'Signal BERICH', S.feedOk === false ? 'Flux injoignable pour le moment' : last ? `Or, 5 min · dernier signal il y a ${ago(Date.now() - last.time)}` : 'Or, 5 min · en veille', S.feedOk === false ? 'off' : 'ok')}
      ${node(2, 'Ton plan', pl ? esc(planLabel()) : 'Pas encore de plan', pl ? 'ok' : 'todo', pl ? '' : '<button type="button" class="br-link" data-br="quiz">Construire mon plan →</button>')}
      ${node(3, 'Ton compte', c.ok ? `${esc(c.name)}${bal != null ? ` · ${money(bal)}` : ''}${pl ? `<br>${attached ? `rattaché à ${esc(planName())}` : `rattachement à ${esc(planName())} en cours par l’équipe CHEST`}` : ''}`
        : c.pending ? 'Envoyé à ton éducateur : il installe ton VPS sous 24 à 48 h' : 'Pas encore initialisé', c.ok ? (pl && !attached ? 'wait' : 'ok') : c.pending ? 'wait' : 'todo',
        c.ok || c.pending ? '' : '<a class="br-link" href="connect.html?plan=pro&from=berich" data-br-connect>Initialiser mon compte →</a>')}
    </ol>
    <p class="br-flow__note">${pl ? `Chaque signal ${L.length > 1 ? 'part avec le risque de son algorithme : ' + L.map((l) => `<b>${rk(l.cfg.risk)} %</b> pour ${esc(nameOf(l.algo))}`).join(', ') : `part à <b>${rk(L[0].cfg.risk)} %</b> du compte${bal != null ? `, soit <b>${money(bal * L[0].cfg.risk / 100)}</b> sur le prochain` : ''}`}${L.some((l) => l.cfg.afterSl) ? ', réduit après une série de stops' : ''}.${c.ok ? '' : isP3() ? ' Initialise ton compte : ton éducateur installe ton VPS et le rattache à ton plan.' : ' Initialise ton compte : ton VPS appliquera ton plan tout seul, 24 h / 24.'}`
      : 'Le plan fixe le risque de chaque position ; le compte relié l’applique automatiquement.'}</p>`;
  }

  // ================= 02 — Projection =================
  function renderProj() {
    const sec = $('brProj');
    sec.hidden = !S.plan || !planLegs().length;
    if (sec.hidden) return;
    const pl = S.plan, legs = planLegs(), goal = Object.assign({}, pl.goal || pl.answers);
    const ev = P.evaluate(legs.map((l) => prepOf(l.algo)), legs.map((l) => l.cfg), goal, true);
    const f = ev.fan;
    $('brProjBody').innerHTML = `<div class="br-proj">
      <figure class="br-proj__fan">${Q.fanSvg(f, goal)}<figcaption><span><i class="bq-key bq-key--a"></i>8 futurs sur 10</span><span><i class="bq-key bq-key--b"></i>1 sur 2</span><span><i class="bq-key bq-key--m"></i>futur médian</span></figcaption></figure>
      <div class="br-proj__side">
        <div class="br-proj__ring">${Q.ring(ev.pReach, 'de réussite')}<span>des futurs simulés touchent <b>${eur(goal.target)}</b> en ${durTxt(goal.months)}, ${goal.account === 'propfirm' ? 'sans toucher la perte maximum de ta propfirm' : 'en restant dans des creux que tu acceptes'}</span></div>
        <dl class="br-proj__facts">
          <div><dt>Médiane</dt><dd>${eur(ev.p50)}</dd></div>
          <div><dt>8 fois sur 10, entre</dt><dd>${eur(ev.p10)} <small>et</small> ${eur(ev.p90)}</dd></div>
          <div><dt>Creux probable en route</dt><dd>−${Math.round(ev.dd50 * 100)} % <small>· au pire −${Math.round(ev.dd90 * 100)} %</small></dd></div>
        </dl>
        <div class="br-proj__acts"><button type="button" class="br-btn br-btn--ghost br-btn--sm" data-br="adjust">Comparer d’autres réglages</button><button type="button" class="br-link" data-br="redo">Refaire le quiz</button></div>
      </div></div>
      <p class="br-note">Capital de départ ${eur(goal.capital)}, ${goal.account === 'propfirm' ? 'compte de propfirm' : 'compte perso'}, plan du ${dateLong(new Date(pl.createdAt || pl.savedAt).getTime())}. Futurs tirés de l’historique de ${esc(planName())} par blocs de 2 semaines. Les performances passées ne préjugent pas des performances futures.</p>`;
  }

  // ================= 03 — Performances =================
  function renderAlgoTabs() {
    const list = algos();
    $('brAlgoTabs').hidden = list.length < 2;
    $('brAlgoTabs').innerHTML = list.map((a) => `<button type="button" data-algo="${esc(a.key)}" aria-pressed="${a.key === S.algo}">${esc(a.name)}${legsOf(S.plan).some((l) => l.algo === a.key) ? '<i class="br-mine" title="L’algorithme de ton plan"></i>' : ''}</button>`).join('');
    $('brPerfTitle').textContent = nameOf(S.algo);
  }
  function renderPerf() {
    renderAlgoTabs();
    const closed = positions().filter((p) => p.closed && p.rr != null).sort((a, b) => a.time - b.time);
    const body = $('brStreaksBody');
    if (!closed.length) { body.innerHTML = '<p class="br-note">Pas encore de position clôturée.</p>'; return; }
    const y = new Date().getFullYear();
    const inYear = (yy) => (p) => new Date(p.time).getFullYear() === yy;
    const cols = [
      ['Depuis toujours', closed, `depuis le ${dateShort(closed[0].time)}`],
      [`L’année dernière · ${y - 1}`, closed.filter(inYear(y - 1)), `du 1er janvier au 31 décembre ${y - 1}`],
      [`Cette année · ${y}`, closed.filter(inYear(y)), `depuis le 1er janvier ${y}`],
    ];
    const leg = legsOf(S.plan).find((l) => l.algo === S.algo), risk = leg ? leg.cfg : null;
    const cap = risk ? S.plan.answers.capital : 1000;
    const months = (list) => {
      const m = new Map();
      list.forEach((p) => { const d = new Date(p.time); const k = d.getFullYear() * 12 + d.getMonth(); m.set(k, (m.get(k) || 0) + p.rr); });
      const vals = [...m.entries()];
      if (!vals.length) return null;
      const best = vals.reduce((a, b) => (b[1] > a[1] ? b : a));
      const lbl = (k) => new Date(Math.floor(k / 12), k % 12, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      return { best: `${signedR(best[1])} · ${lbl(best[0])}`, pos: `${vals.filter((v) => v[1] > 0).length} sur ${vals.length}` };
    };
    body.innerHTML = `<div class="br-perf">${cols.map(([title, list, sub]) => {
      const st = stats(list, (p) => p.rr);
      let eq = cap, streak = 0;
      list.forEach((p) => { eq *= 1 + (risk ? P.riskAt(risk, streak) : 1) / 100 * p.rr; streak = p.rr < 0 ? streak + 1 : 0; });
      const pct = (eq / cap - 1) * 100;
      const pf = st.pf === Infinity ? '∞' : st.pf != null ? nf(st.pf, 2) : '—';
      const mo = months(list);
      return `<article class="br-perf__card">
        <div class="br-perf__t">${esc(title)}</div>
        <div class="br-perf__r ${tone(st.total)}">${st.n ? signedR(st.total) : '—'}</div>
        <div class="br-perf__money">${st.n ? `<b class="${tone(pct)}">${signedPct(pct)}</b><span>${eur(cap)} → <b>${eur(eq)}</b></span>` : '<span>Aucune position</span>'}</div>
        <dl class="br-perf__facts">
          <div><dt>Positions</dt><dd>${st.n}</dd></div>
          <div><dt>Winrate</dt><dd>${st.winrate != null ? nf(st.winrate, 1) + ' %' : '—'}</dd></div>
          <div><dt>Profit factor</dt><dd>${pf}</dd></div>
          <div><dt>Espérance</dt><dd>${st.expectancy != null ? signedR(st.expectancy) : '—'}</dd></div>
          <div><dt>Drawdown max</dt><dd class="${st.dd < 0 ? 'is-neg-txt' : ''}">${st.n ? (st.dd < 0 ? signedR(st.dd) : '0 R') : '—'}</dd></div>
          <div><dt>Mois positifs</dt><dd>${mo ? mo.pos : '—'}</dd></div>
          <div class="br-perf__wide"><dt>Meilleur mois</dt><dd>${mo ? esc(mo.best) : '—'}</dd></div>
        </dl>
        <div class="br-perf__sub">${esc(sub)}</div>
      </article>`;
    }).join('')}</div>
    <p class="br-note">${risk ? `Le calcul en euros suit le réglage de ton plan pour cet algorithme (${esc(P.describeCfg(risk))}) en partant de ${eur(cap)}, gains réinvestis` : 'Le calcul en euros suppose 1 000 € de départ et 1 % du capital risqué par position, gains réinvestis'} ; frais et glissements non compris. Les performances passées ne préjugent pas des performances futures.</p>`;
  }

  // ================= 04 — Registre =================
  function renderLedger() {
    const taken = takenMap();
    if (S.filter === 'me') S.filter = 'all'; // « Prises par toi » retiré : BERICH ne passe plus que par le VPS
    let list = positions();
    if (S.filter === 'win') list = list.filter((p) => p.closed && p.rr > 0);
    if (S.filter === 'loss') list = list.filter((p) => p.closed && p.rr < 0);
    if (S.filter === 'me') list = list.filter((p) => taken.has(p.id));
    const body = $('brLedgerBody');
    if (!list.length) { body.innerHTML = `<p class="br-note">${S.filter === 'me' ? 'Aucune position prise via BERICH pour l\'instant.' : 'Aucune position dans ce filtre.'}</p>`; return; }
    const shown = list.slice(0, S.shown);
    body.innerHTML = `
      <div class="br-ledger__scroll"><table class="br-ledger">
        <thead><tr><th>Ouverture</th><th>Sens</th><th>Résultat</th><th class="num">R</th><th class="num br-hide-sm">Durée</th><th class="num br-hide-sm">Entrée → stop / objectif</th></tr></thead>
        <tbody>${shown.map((p) => {
          const o = outcome(p), t = taken.get(p.id), d = new Date(p.time);
          return `<tr>
            <td class="br-ledger__date"><b>${d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</b><span>${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · ${sessionOf(p.time)}</span></td>
            <td>${p.side ? `<span class="br-side-txt ${p.side === 'sell' ? 'sell' : 'buy'}">${p.side === 'sell' ? 'Vente' : 'Achat'}</span>` : '<span class="br-side-txt">—</span>'}</td>
            <td><span class="br-out ${o.cls}">${esc(o.label)}</span>${t ? `<span class="br-you">· toi${t.riskAmount != null && p.rr != null ? ' ' + signedMoney(t.riskAmount * p.rr) : ''}</span>` : ''}</td>
            <td class="num"><b class="${tone(p.rr)} br-flat">${p.rr != null ? signedR(p.rr) : '—'}</b></td>
            <td class="num br-hide-sm" style="color:var(--chest-ink-2)">${p.closed ? dur(p.closeTime && p.closeTime !== p.time ? p.closeTime - p.time : null) : ago(Date.now() - p.time)}</td>
            <td class="num br-hide-sm" style="color:var(--chest-ink-3)">${p.entry != null ? `${nf(p.entry, 2)} → ${nf(p.sl, 2)} / ${nf(p.tp, 2)}` : (p.origin === 'backtest' ? 'backtest' : 'historique TradingView')}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
      <div class="br-ledger__more">${list.length > S.shown ? `<button type="button" class="br-link" id="brMore">Afficher ${Math.min(25, list.length - S.shown)} de plus ↓</button><span class="br-note" style="margin:0 0 0 14px">${S.shown} sur ${list.length}</span>` : list.length > 10 ? `<button type="button" class="br-link" id="brLess">Réduire ↑</button>` : ''}</div>`;
    const more = $('brMore');
    if (more) more.addEventListener('click', () => { S.shown += 25; renderLedger(); });
    const less = $('brLess');
    if (less) less.addEventListener('click', () => { S.shown = 10; renderLedger(); $('brLedger').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  }

  // ================= 05 / 06 — Sessions, sens & durée =================
  function renderInsights() {
    const closed = positions().filter((p) => p.closed && p.rr != null);
    const groups = ['Asie', 'Londres', 'Londres × NY', 'New York', 'Soir'].map((name) => {
      const g = closed.filter((p) => sessionOf(p.time) === name);
      return { name, n: g.length, st: stats(g, (p) => p.rr) };
    }).filter((g) => g.n);
    $('brSessionsBody').innerHTML = groups.length ? `<div class="br-bars">${groups.map((g) => `
      <div class="br-bar__row"><span>${g.name}</span>
        <div class="br-bar__track" title="Winrate ${g.st.winrate != null ? nf(g.st.winrate, 0) + ' %' : '—'}"><div class="br-bar__fill ${g.st.total < 0 ? 'is-neg' : ''}" style="width:${Math.max(3, g.st.winrate || 0)}%"></div></div>
        <b class="${tone(g.st.total)} br-flat">${signedR(g.st.total)}<small>${g.st.wins}/${g.n}</small></b></div>`).join('')}</div>`
      : '<p class="br-note">Pas encore assez de positions.</p>';
    const side = (s) => stats(closed.filter((p) => p.side === s), (p) => p.rr);
    const b = side('buy'), s = side('sell');
    const avg = (arr) => (arr.length ? arr.reduce((x, y) => x + y, 0) / arr.length : null);
    const hold = (pred) => avg(closed.filter((p) => pred(p) && p.closeTime && p.closeTime !== p.time).map((p) => p.closeTime - p.time));
    $('brSidesBody').innerHTML = `
      <div class="br-duo">
        <div class="br-fact"><b class="${tone(b.total)}">${b.n ? signedR(b.total) : '—'}</b><span>Achats</span><small>${b.n ? `${b.wins}/${b.wins + b.losses} gagnants · ${b.n} positions` : 'sens non renseigné'}</small></div>
        <div class="br-fact"><b class="${tone(s.total)}">${s.n ? signedR(s.total) : '—'}</b><span>Ventes</span><small>${s.n ? `${s.wins}/${s.wins + s.losses} gagnantes · ${s.n} positions` : 'sens non renseigné'}</small></div>
        <div class="br-fact"><b>${dur(hold((p) => p.rr > 0))}</b><span>Durée moyenne des gagnantes</span></div>
        <div class="br-fact"><b>${dur(hold((p) => p.rr < 0))}</b><span>Durée moyenne des perdantes</span></div>
      </div>`;
  }

  // ================= Admin : backtests des algorithmes =================
  function renderAdmin() {
    const sec = $('brAdmin');
    sec.hidden = !meUser().isAdmin;
    if (sec.hidden) return;
    const rows = ['berich1', 'berich2'].concat(S.uploaded.map((a) => a.key)).filter((k, i, arr) => arr.indexOf(k) === i);
    const plans = S.plans || [];
    const todo = plans.filter((x) => !x.plan.attachedAt).length;
    const planRow = (x) => { const L = legsOf(x.plan), at = x.plan.attachedAt;
      return `<li><b>${esc(x.name)}</b><span>${esc(!L.length ? 'plan incomplet' : L.length > 1 ? P.describe(L, nameOf) : `${nameOf(L[0].algo)} · ${P.describeCfg(L[0].cfg)}`)} · ${x.plan.answers ? `${eur(x.plan.answers.capital)} → ${eur(x.plan.answers.target)}${x.plan.answers.account === 'propfirm' ? ' · propfirm' : ''}` : ''}
        <br><small>${at ? `rattaché le ${dateLong(new Date(at).getTime())}` : `plan du ${dateLong(new Date(x.plan.savedAt).getTime())} · à rattacher`}</small></span>
        <button type="button" class="br-btn ${at ? 'br-btn--ghost ' : ''}br-btn--sm" data-attach="${x.userId}" data-on="${at ? '0' : '1'}">${at ? 'Détacher' : 'Marquer rattaché'}</button></li>`; };
    $('brAdminBody').innerHTML = `<h4 class="br-adm__h">Plans des membres${todo ? ` · <em>${todo} à rattacher</em>` : ''}</h4>
    ${plans.length ? `<ul class="br-adm">${plans.map(planRow).join('')}</ul>` : '<p class="br-note">Aucun membre n’a encore validé de plan.</p>'}
    <p class="br-note">Branche le compte du membre (VPS) sur le ou les algorithmes de son plan avec ces risques, puis marque-le rattaché : sa page BERICH passe au vert.</p>
    <h4 class="br-adm__h">Backtests des algorithmes</h4>
    <ul class="br-adm">${rows.map((k) => {
      const u = S.uploaded.find((a) => a.key === k);
      const live = BUILTIN[k] && (algos().find((a) => a.key === k) || {}).live;
      return `<li><b>${esc(nameOf(k))}</b><span>${live ? `historique du site + flux en direct · ${livePositions(k).filter((x) => x.closed).length} positions${u ? ' · import inutilisé' : ''}` : u ? `${u.trades.length} positions importées · ${dateLong(new Date(u.updatedAt).getTime())}` : 'aucune donnée'}</span>
        <label class="br-btn br-btn--ghost br-btn--sm">${u ? 'Remplacer' : 'Importer'}<input type="file" accept=".html,text/html" data-import="${esc(k)}" hidden></label>
        ${u ? `<button type="button" class="br-link" data-drop="${esc(k)}">Retirer</button>` : ''}</li>`;
    }).join('')}</ul>
    <p class="br-note">Exporte le backtest depuis Backtesting (« Exporter en HTML ») et importe le fichier ici : seuls les trades sont gardés, sur le serveur, lisibles par les membres qui ont BERICH. Rien n’est publié dans le dépôt.</p>
    <p class="br-adm__err" id="brAdmErr" role="alert"></p>`;
  }
  async function importBacktest(key, file) {
    $('brAdmErr').textContent = '';
    try {
      const txt = await file.text();
      const m = txt.match(/var __REC__=(\{[\s\S]*?\});\s*(?:var|window|<\/script>)/);
      if (!m) throw new Error('Ce fichier n’est pas un export de backtest CHEST.');
      const d = await api(`/berich/algos/${key}`, { method: 'POST', body: { name: nameOf(key), rec: JSON.parse(m[1]) } });
      S.uploaded = d.algos; prepCache.clear(); S.alts = null;
      if (window.showToast) showToast(`${nameOf(key)} mis à jour`);
      renderAll();
    } catch (e) { $('brAdmErr').textContent = e.message; }
  }

  // ================= Biais (une ligne dans la barre d'état) =================
  function forecastTone(ev) {
    const a = parseFloat(String(ev.consensus).replace(',', '.')), b = parseFloat(String(ev.previous).replace(',', '.'));
    if (!ev.consensus || isNaN(a) || isNaN(b) || !ev.directionBias || Math.abs(a - b) < 1e-9) return 'neutral';
    return (ev.directionBias === 'up' ? a > b : a < b) ? 'pos' : 'neg';
  }
  async function loadBias() {
    const chip = $('brBias');
    try {
      const url = (window.CHEST_CONFIG && window.CHEST_CONFIG.calendarApiUrl) || 'data/calendar.json';
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('calendar');
      const events = (await res.json()).events || [];
      const now = new Date(); now.setHours(0, 0, 0, 0);
      const monday = new Date(now); monday.setDate(now.getDate() + (now.getDay() === 0 ? -6 : 1 - now.getDay()));
      const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23, 59, 59);
      const W = { high: 3, medium: 2 };
      let score = 0;
      const drivers = events.filter((ev) => ev.country === 'US' && W[ev.importance]).filter((ev) => { const d = new Date(ev.date + 'T00:00:00'); return d >= monday && d <= sunday; })
        .map((ev) => { const raw = forecastTone(ev); const t = raw === 'neutral' ? 'neutral' : raw === 'pos' ? 'neg' : 'pos'; if (t !== 'neutral') score += (t === 'pos' ? 1 : -1) * W[ev.importance]; return { ev, t }; });
      const bias = score >= 2 ? 'pos' : score <= -2 ? 'neg' : 'neutral';
      $('brBiasText').innerHTML = `Or : <b>${bias === 'pos' ? 'biais haussier' : bias === 'neg' ? 'biais baissier' : 'biais neutre'}</b>`;
      chip.querySelector('.br-dot').className = 'br-dot ' + (bias === 'pos' ? 'is-pos' : bias === 'neg' ? 'is-neg' : '');
      const weighted = drivers.filter((d) => d.t !== 'neutral').slice(0, 5);
      $('brBiasPop').innerHTML = `<p>Heuristique sur ${drivers.length} annonce${drivers.length > 1 ? 's' : ''} US de la semaine (prévision contre précédent) — le dollar pèse sur l'or en sens inverse. Jamais une prédiction.</p>
        ${weighted.map((d) => `<div class="br-pop__row"><span>${esc(d.ev.event)}</span><b class="${d.t === 'pos' ? 'is-pos-txt' : 'is-neg-txt'} br-flat">${d.t === 'pos' ? '↑ or' : '↓ or'}</b></div>`).join('') || '<div class="br-pop__row"><span>Aucune annonce orientée pour l\'instant</span></div>'}
        <div class="br-pop__row"><a class="br-link" href="calendar.html">Ouvrir le calendrier →</a></div>`;
    } catch (e) {
      $('brBiasText').textContent = 'Or : contexte indisponible';
      $('brBiasPop').innerHTML = '<p>Calendrier en attente — réessaie dans un instant.</p>';
    }
  }

  // ================= Chargements =================
  async function loadSeed() {
    await Promise.all(Object.entries(BUILTIN).map(async ([k, url]) => {
      try { const res = await fetch(`${url}?nocache=${Date.now()}`); const json = res.ok ? await res.json() : []; S.seeds[k] = Array.isArray(json) ? json : []; } catch (e) { S.seeds[k] = []; }
    }));
  }
  let lastFingerprint = '';
  async function loadSignals() {
    try { const data = await CHESTBerich.fetchSignals(); S.feedOk = true; S.live = data.example ? [] : (data.signals || []); S.updatedAt = data.updatedAt || null; } catch (e) { S.feedOk = false; }
    const fp = JSON.stringify([S.live, S.feedOk]);
    const changed = fp !== lastFingerprint; lastFingerprint = fp; return changed;
  }
  async function loadAlgos() { try { S.uploaded = (await api('/berich/algos')).algos || []; } catch (e) { S.uploaded = []; } }
  async function loadPlans() { if (!meUser().isAdmin) return; try { S.plans = (await api('/berich/plans')).plans; } catch (e) { S.plans = []; } }
  async function loadPlan() { try { S.plan = (await api('/berich/plan')).plan; } catch (e) { S.plan = null; } }
  async function loadPrice() {
    if (document.hidden) return;
    try {
      const token = A.getToken();
      const res = await fetch(`${A.apiBase()}/twelvedata/price?symbol=${encodeURIComponent('XAU/USD')}`, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
      const p = parseFloat((await res.json()).price);
      if (!isNaN(p)) S.price = p;
    } catch (e) { /* on garde le dernier prix connu */ }
    renderTop(); renderSignal(); renderWatch();
  }
  // Chaque prix consomme un crédit Twelve Data : 1 min pendant un signal ouvert, 4 min sinon, jamais onglet caché.
  let priceTimer = null;
  function schedulePrice() { clearTimeout(priceTimer); priceTimer = setTimeout(async () => { await loadPrice(); schedulePrice(); }, activePosition() ? 60000 : 240000); }
  async function refreshLinkedVps() {
    const la = linkedAccount();
    if (!la || !la.live || la.live.kind !== 'vps' || document.hidden) return;
    try { await CHESTJournal.syncVpsLiveAccount(la.acc.id, la.live.id); renderPlanLine(); renderHero(); renderAuto(); } catch (e) { /* dernier instantané conservé */ }
  }

  // ================= Connexion clé en main (Premium 3) =================
  // Premium 1 et 2 : « Connecter » ouvre le parcours VPS (connect.html?plan=pro). Premium 3 : un volet sur la page ; le
  // membre donne son broker, ses accès MT5 et ses règles, son éducateur installe le VPS sous 24 à 48 h.
  const isP3 = () => { const u = meUser(), a = u.access || {}; return !u.isAdmin && u.role !== 'educator' && a.plan === 'premium' && a.level === 3; };
  async function loadP3() {
    if (!isP3()) return;
    try { const d = await api('/berich/requests'); p3Req = d.request; renderAll(); } catch (e) { /* hors ligne */ }
  }
  const P3 = { firm: null, phase: 'Phase 1' };
  function openP3() {
    let root = $('brP3');
    if (!root) { root = document.createElement('div'); root.id = 'brP3'; root.className = 'br-p3'; document.body.appendChild(root); }
    const firms = CHESTJournal.propfirms();
    const brokerOf = (f) => (window.CHEST_BROKERS || []).find((b) => b.id === f.id || 'br_' + b.id === f.id) || {};
    const sel = P3.firm;
    const servers = sel ? (brokerOf(sel).servers || []) : [];
    root.hidden = false;
    root.innerHTML = `<div class="br-p3__box" role="dialog" aria-modal="true" aria-labelledby="brP3T">
      <button type="button" class="br-p3__x" data-p3-close aria-label="Fermer"><svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 3l6 6M9 3l-6 6"/></svg></button>
      <span class="br-label">Premium III · connexion clé en main</span>
      <h3 id="brP3T">Ton broker et tes règles</h3>
      <p class="br-p3__lead">Ton éducateur installe ton VPS lui-même${S.plan ? `, avec ton plan (${esc(planLabel())})` : ''}. Donne-lui ton compte : la connexion sera faite sous <b>24 à 48 h</b>.</p>
      <div class="br-p3__grid">${firms.map((f) => `<button type="button" class="br-p3__firm ${sel && sel.id === f.id ? 'is-on' : ''}" data-p3-firm="${esc(f.id)}"><img src="${esc(CHESTJournal.propfirmLogo(f.domain))}" alt="" loading="lazy"><span><b>${esc(f.name)}</b><small>${f.kind === 'propfirm' ? 'Propfirm' : 'Broker'}</small></span></button>`).join('')}</div>
      ${sel ? `
      ${sel.kind === 'propfirm' ? `<div class="br-p3__row"><span class="br-p3__k">Phase actuelle</span><div class="br-tabs">${['Phase 1', 'Phase 2', 'Financé'].map((ph) => `<button type="button" data-p3-phase="${ph}" aria-pressed="${P3.phase === ph}">${ph}</button>`).join('')}</div></div>
      <div class="br-p3__fields">
        <label><span>Jours min.</span><input type="text" inputmode="decimal" data-p3-rule="minDays"></label>
        <label><span>Objectif (%)</span><input type="text" inputmode="decimal" data-p3-rule="target"></label>
        <label><span>Perte jour max (%)</span><input type="text" inputmode="decimal" data-p3-rule="dailyLoss"></label>
        <label><span>Perte max (%)</span><input type="text" inputmode="decimal" data-p3-rule="maxLoss"></label>
      </div>` : ''}
      <div class="br-p3__fields br-p3__fields--acc">
        <label><span>Serveur MT5</span>${servers.length ? `<select data-p3="server">${servers.map((v) => `<option>${esc(v)}</option>`).join('')}<option value="">Autre…</option></select>` : '<input type="text" data-p3="server" placeholder="ex. FTMO-Server3" autocomplete="off">'}</label>
        <label><span>Numéro de compte</span><input type="text" inputmode="numeric" data-p3="login" autocomplete="off"></label>
        <label><span>Mot de passe MT5 (principal)</span><input type="password" data-p3="password" autocomplete="new-password"></label>
      </div>
      <p class="br-p3__safe">Chiffré sur nos serveurs, visible seulement par ton éducateur pour installer le VPS. Tu pourras changer ce mot de passe dans MT5 une fois la connexion faite.</p>` : '<p class="br-p3__safe">Choisis ton broker ou ta propfirm pour continuer.</p>'}
      <p class="br-p3__err" id="brP3Err" role="alert"></p>
      <div class="br-p3__foot"><button type="button" class="br-btn br-btn--ghost" data-p3-close>Annuler</button><button type="button" class="br-btn" id="brP3Send" ${sel ? '' : 'disabled'}>Envoyer à mon éducateur</button></div>
    </div>`;
    const srv = root.querySelector('select[data-p3="server"]');
    if (srv) srv.addEventListener('change', () => { if (!srv.value) { const i = document.createElement('input'); i.type = 'text'; i.dataset.p3 = 'server'; i.placeholder = 'Nom du serveur'; srv.replaceWith(i); i.focus(); } });
  }
  function closeP3() { const r = $('brP3'); if (r) r.hidden = true; }

  // ================= Interactions =================
  function closeConnMenu() { const m = $('brConnMenu'), b = $('brConnBtn'); if (m) m.hidden = true; if (b) b.setAttribute('aria-expanded', 'false'); }
  document.addEventListener('click', async (e) => {
    const conn = e.target.closest('[data-br-connect]');
    if (conn && isP3()) { e.preventDefault(); openP3(); return; }
    if (e.target.closest('#brConnBtn')) { const m = $('brConnMenu'); m.hidden = !m.hidden; $('brConnBtn').setAttribute('aria-expanded', String(!m.hidden)); return; }
    const acc = e.target.closest('[data-acc]');
    if (acc) { try { localStorage.setItem(LINKED_KEY, acc.dataset.acc); } catch (err) { /* tant pis */ } closeConnMenu(); renderAll(); return; }
    if (!e.target.closest('#brConnMenu')) closeConnMenu();
    const act = e.target.closest('[data-br]');
    if (act) {
      const a = act.dataset.br;
      if (a === 'quiz' || a === 'redo') openQuiz(a === 'redo' ? { answers: {} } : null);
      else if (a === 'adjust') openQuiz({ answers: Object.assign({}, S.plan.answers, { algo: S.plan.algo }), result: true });
      return;
    }
    const al = e.target.closest('[data-algo]');
    if (al) { S.algo = al.dataset.algo; S.shown = 10; renderHero(); renderPerf(); renderLedger(); renderInsights(); return; }
    const sc = e.target.closest('#brScope button');
    if (sc) { S.scope = sc.dataset.v; renderHero(); return; }
    const att = e.target.closest('[data-attach]');
    if (att) {
      att.disabled = true;
      try { S.plans = (await api(`/berich/plans/${att.dataset.attach}/attach`, { method: 'POST', body: { attached: att.dataset.on === '1' } })).plans; if (S.plan && Number(att.dataset.attach) === meUser().id) await loadPlan(); renderAll(); }
      catch (err) { $('brAdmErr').textContent = err.message; att.disabled = false; }
      return;
    }
    const drop = e.target.closest('[data-drop]');
    if (drop && confirm(`Retirer le backtest ${nameOf(drop.dataset.drop)} ?`)) {
      try { S.uploaded = (await api(`/berich/algos/${drop.dataset.drop}/delete`, { method: 'POST' })).algos; prepCache.clear(); renderAll(); } catch (err) { $('brAdmErr').textContent = err.message; }
      return;
    }
    // Volet Premium III
    const root = $('brP3');
    if (!root || root.hidden) return;
    if (e.target === root || e.target.closest('[data-p3-close]')) { closeP3(); return; }
    const f = e.target.closest('[data-p3-firm]');
    if (f) { P3.firm = CHESTJournal.propfirms().find((x) => x.id === f.dataset.p3Firm); openP3(); return; }
    const ph = e.target.closest('[data-p3-phase]');
    if (ph) { P3.phase = ph.dataset.p3Phase; root.querySelectorAll('[data-p3-phase]').forEach((b) => b.setAttribute('aria-pressed', String(b === ph))); return; }
    if (e.target.closest('#brP3Send')) {
      const v = (k) => { const el = root.querySelector(`[data-p3="${k}"]`); return el ? el.value.trim() : ''; };
      const rules = {}; root.querySelectorAll('[data-p3-rule]').forEach((i) => { rules[i.dataset.p3Rule] = i.value.trim(); });
      const btn = $('brP3Send'); btn.disabled = true; $('brP3Err').textContent = '';
      try {
        const d = await api('/berich/requests', { method: 'POST', body: { broker: P3.firm.name, brokerId: P3.firm.id, kind: P3.firm.kind, server: v('server'), login: v('login'), password: v('password'), phase: P3.firm.kind === 'propfirm' ? P3.phase : '', rules } });
        p3Req = d.request;
        root.querySelector('.br-p3__box').innerHTML = `<span class="br-label">Premium III · connexion clé en main</span>
          <h3>C’est envoyé à ton éducateur</h3>
          <p class="br-p3__lead">Ta connexion <b>${esc(p3Req.broker)} · ${esc(p3Req.login)}</b> sera faite sous <b>24 à 48 h</b>. Tu n’as rien d’autre à faire : BERICH suivra ce compte dès que ton VPS sera prêt.</p>
          <div class="br-p3__foot"><button type="button" class="br-btn" data-p3-close>Compris</button></div>`;
        renderAll();
      } catch (err) { $('brP3Err').textContent = err.message; btn.disabled = false; }
    }
  });
  document.addEventListener('change', (e) => { const i = e.target.closest('[data-import]'); if (i && i.files[0]) importBacktest(i.dataset.import, i.files[0]); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeP3(); closeConnMenu(); } });
  $('brPeriod').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    S.period = b.dataset.v; $('brPeriod').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); renderHero();
  }));
  $('brFilter').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    S.filter = b.dataset.v; S.shown = 10; $('brFilter').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); renderLedger();
  }));

  function renderAll() {
    renderTop(); renderSignal(); renderIntro(); renderHero();
    if (!S.loaded) return;
    renderAuto(); renderProj(); renderPerf(); renderLedger(); renderInsights(); renderAdmin();
  }

  (async () => {
    renderAll();
    await Promise.all([loadSeed(), loadSignals(), loadAlgos(), loadPlan(), loadPlans()]);
    S.loaded = true;
    const keys = algos().map((a) => a.key);
    S.algo = S.plan && keys.includes(S.plan.algo) ? S.plan.algo : keys[0] || 'berich1';
    S.scope = S.plan ? 'plan' : 'algo';
    if (S.plan) applyPlanToConnection(S.plan);
    renderAll();
    // Première visite sans plan : le quiz s'ouvre de lui-même (une fois par session).
    let seen = false; try { seen = sessionStorage.getItem('chest_berich_quiz_seen') === '1'; } catch (e) { /* tant pis */ }
    if (!S.plan && !seen && keys.length && !(window.CHESTPlan && !CHESTPlan.allowed('berich'))) openQuiz();
    loadPrice().then(schedulePrice);
    loadBias();
    refreshLinkedVps();
    loadP3();
    setInterval(refreshLinkedVps, 30000);
    setInterval(async () => { if (document.hidden) return; if (await loadSignals()) renderAll(); else { renderTop(); renderSignal(); } }, 20000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) loadPrice(); });
  })();

  CHESTTour.init([
    { selector: '.br-top', title: 'BERICH', text: 'L’état du flux de signaux sur l’or, le prix en direct et le biais du calendrier (survole-le pour le détail).' },
    { selector: '#brHero', title: 'Ton plan', text: '« Ton plan » rejoue ton réglage sur tout l’historique, en euros. « R » montre l’algorithme brut, « Toi » les positions que tu as prises.' },
    { selector: '#brAuto', title: 'Automatisation', text: 'Signal, plan, compte : quand les trois sont au vert, chaque signal part avec le risque de ton plan.' },
    { selector: '#brProj', title: 'Projection', text: '800 futurs possibles tirés de l’historique : tes chances d’atteindre l’objectif et le recul à prévoir.' },
    { selector: '#brStreaks', title: 'Performances', text: 'Chaque algorithme depuis toujours, l’an dernier et cette année, en R et en euros avec ton plan.' },
  ]);
})();
