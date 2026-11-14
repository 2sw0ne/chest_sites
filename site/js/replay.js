// REPLAY v2 (2026-11-14) — rejouer le marché bougie par bougie et trader comme en direct.
// Page d'accueil (esprit Backtesting) : grand titre, nouvelle session en volets numérotés (marché, période, compte,
// scanner), puis tes sessions et les meilleurs résultats.
// Écran de trading : barre du haut (paire, unités de temps, indicateurs, aller à une date, solde, ACHETER ⌄ VENDRE),
// graphique Vela plein écran avec ses outils de dessin, lecteur flottant en bas, rail d'icônes à droite qui ouvre un
// volet (ordre, positions, journal, stats, scanner).
// Ordre : Acheter / Vendre pose une position sur le graphique (zone verte TP / rouge SL, poignées à tirer) ; le volet
// calcule le risque en % et en $, et le lot comme une calculatrice de marché (le lot se règle aussi : le risque suit).
// La flèche entre Acheter et Vendre ouvre les réglages avancés (prix d'entrée → ordre limite, SL / TP au prix près).
// Données : GET /replay/bars (historique partagé gardé sur disque, une tranche payée une fois pour tout le monde).
// Chaque unité de temps montre ~500 bougies : plus elle est grande, plus on voit loin. Scanner : GET /replay/scan,
// calculé sur les bougies passées seulement, rafraîchi à chaque pause.
(function () {
  const A = window.CHESTAccounts;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TF = { '1': [60e3, 'M1'], '5': [300e3, 'M5'], '15': [900e3, 'M15'], '30': [1800e3, 'M30'], '60': [3600e3, 'H1'], '240': [14400e3, 'H4'], 'D': [86400e3, 'D1'] };
  const VELA_TF = { '1': '1m', '5': '5m', '15': '15m', '30': '30m', '60': '1h', '240': '4h', 'D': '1d' };
  const TF_ORDER = ['1', '5', '15', '30', '60', '240', 'D'];
  const VIEW_BARS = 500;
  const PAIRS = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD', 'GBPJPY', 'EURJPY', 'EURGBP', 'XAGUSD', 'NAS100', 'US30', 'SPX500', 'GER40', 'BTCUSD', 'ETHUSD'];
  const KEY = 'chest_replay_sessions';
  const fr = (n, d = 2) => Number(n).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const money = (n) => (n < 0 ? '−' : '') + Math.abs(n).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' $';
  const dec = (sym) => (/JPY/.test(sym) ? 3 : /XAU|XAG|NAS|US30|SPX|GER|BTC|ETH/.test(sym) ? 2 : 5);
  // Taille d'un lot (unités) et conversion de la devise de cotation en $ : calculatrice de lot comme sur les marchés.
  const CONTRACT = (s) => (/XAU/.test(s) ? 100 : /XAG/.test(s) ? 5000 : /NAS|US30|SPX|GER|BTC|ETH/.test(s) ? 1 : 100000);
  const toUsd = (s, price) => (/USD$/.test(s) || /NAS|US30|SPX|BTC|ETH/.test(s) ? 1 : /^USD/.test(s) ? 1 / price : /JPY$/.test(s) ? 1 / 150 : /GBP$/.test(s) ? 1.27 : /GER/.test(s) ? 1.08 : 1);
  const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);
  const when = (ms) => new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
  const loadAll = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } };
  const saveAll = (l) => { try { localStorage.setItem(KEY, JSON.stringify(l.slice(0, 40))); } catch (e) { /* plein */ } };
  async function api(path) {
    const r = await fetch(A.apiBase() + path, { headers: { Authorization: 'Bearer ' + A.getToken() } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Données indisponibles.');
    return d;
  }
  const IC = {
    order: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    pos: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2.5"/><path d="M8 10h8M8 14h5"/></svg>',
    journal: '<svg viewBox="0 0 24 24"><path d="M6 3.5h10a2 2 0 0 1 2 2v15l-3-2-3 2-3-2-3 2v-15a2 2 0 0 1 2-2zM9 8h6M9 12h6"/></svg>',
    stats: '<svg viewBox="0 0 24 24"><path d="M4 19h16M6 15l4-5 3 3 5-7"/></svg>',
    scan: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2M11 7.5v7M7.5 11h7"/></svg>',
    ind: '<svg viewBox="0 0 24 24"><path d="M3 17l5-6 4 4 4-7 5 5"/><path d="M3 21h18"/></svg>',
    go: '<svg viewBox="0 0 24 24"><path d="M5 5l7 7-7 7M13 5l7 7-7 7"/></svg>',
  };

  // ================================================================ accueil (sessions)
  let root;
  function sessionStats(s) {
    const t = s.trades || [], w = t.filter((x) => x.rr > 0.05).length, l = t.filter((x) => x.rr < -0.05).length;
    const curve = [s.capital]; let b = s.capital; t.forEach((x) => { b += x.pnl; curve.push(b); });
    return { n: t.length, wr: w + l ? w / (w + l) : 0, pct: (s.balance - s.capital) / s.capital * 100, curve };
  }
  function spark(curve, w = 260, h = 54) {
    if (curve.length < 2) return `<svg class="rpx-sp" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="M0 ${h / 2}h${w}" stroke="rgba(255,255,255,.12)" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/></svg>`;
    const min = Math.min(...curve), max = Math.max(...curve);
    const pts = curve.map((v, i) => `${(i / (curve.length - 1) * w).toFixed(1)},${(h - 4 - (max > min ? (v - min) / (max - min) : 0.5) * (h - 8)).toFixed(1)}`).join(' ');
    const up = curve[curve.length - 1] >= curve[0];
    return `<svg class="rpx-sp" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${up ? '#33e6a6' : '#ff4d5e'}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
  }
  function home() {
    const scanners = (window.CHESTScanners ? CHESTScanners.list() : []).map((s) => [s.id, s.name]);
    const sessions = loadAll();
    const all = sessions.map((s) => Object.assign({ st: sessionStats(s) }, s));
    const best = all.filter((s) => s.st.n >= 3).sort((a, b) => b.st.pct - a.st.pct).slice(0, 3);
    const trades = all.reduce((n, s) => n + s.st.n, 0);
    const today = Date.now();
    const seg = (name, opts, on) => `<div class="rpx-seg" data-seg="${name}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${String(v) === String(on) ? 'is-on' : ''}">${l}</button>`).join('')}</div>`;
    const label = (s) => esc(s.name || s.symbol + ' ' + TF[s.tf][1]);
    root.innerHTML = `<div class="rpx">
      <header class="rpx-hero"><span class="rp__k">Entraînement · réservé à CHEST Premium</span><h1>Replay<i>.</i></h1>
        <p>Rejoue n’importe quelle paire, sur n’importe quelle période, bougie par bougie. Prends tes trades comme en direct, avec ton scanner si tu veux, puis envoie la session dans Backtesting.</p>
        <div class="rpx-kpis"><div><b>${sessions.length}</b><span>session${sessions.length > 1 ? 's' : ''}</span></div><div><b>${trades}</b><span>trades rejoués</span></div><div><b class="${best[0] ? (best[0].st.pct >= 0 ? 'is-up' : 'is-down') : ''}">${best[0] ? (best[0].st.pct >= 0 ? '+' : '') + fr(best[0].st.pct, 1) + ' %' : '—'}</b><span>meilleure session</span></div></div></header>
      <form class="rpx-new" id="rpaForm" novalidate>
        <div class="rpx-new__h"><span class="rp__k">Nouvelle session</span><input name="name" maxlength="60" placeholder="Nom de la session (facultatif)" aria-label="Nom de la session"></div>
        <div class="rpx-grid">
          <section class="rpx-pan"><span class="rpx-n">01 — Marché</span>
            <label class="rpx-f"><span>Paire</span><input name="symbol" list="rpaPairs" value="XAUUSD" maxlength="12" autocapitalize="characters"><datalist id="rpaPairs">${PAIRS.map((p) => `<option value="${p}">`).join('')}</datalist></label>
            <div class="rpx-f"><span>Unité de temps de base (le pas du replay)</span>${seg('tf', ['1', '5', '15', '30', '60', '240'].map((k) => [k, TF[k][1]]), '15')}</div></section>
          <section class="rpx-pan"><span class="rpx-n">02 — Période</span>
            <div class="rpx-two"><label class="rpx-f"><span>Début</span><input name="start" type="date" value="${ymd(today - 180 * 864e5)}" max="${ymd(today - 864e5)}"></label><label class="rpx-f"><span>Fin</span><input name="end" type="date" value="${ymd(today - 864e5)}" max="${ymd(today)}"></label></div>
            <div class="rpx-chips">${[[30, '1 mois'], [90, '3 mois'], [180, '6 mois'], [365, '1 an'], [0, 'Au hasard']].map(([d, l]) => `<button type="button" data-span="${d}">${l}</button>`).join('')}</div></section>
          <section class="rpx-pan"><span class="rpx-n">03 — Compte</span>
            <div class="rpx-f"><span>Capital de départ</span>${seg('cap', [5000, 10000, 25000, 50000, 100000].map((v) => [v, v / 1000 + 'k $']), 10000)}</div>
            <div class="rpx-f"><span>Risque par défaut</span>${seg('risk', [0.25, 0.5, 1, 2, 3].map((v) => [v, String(v).replace('.', ',') + ' %']), 1)}</div></section>
          <section class="rpx-pan"><span class="rpx-n">04 — Scanner (facultatif)</span>
            <label class="rpx-f"><span>Ses signaux s’affichent au fil du replay, sans jamais dévoiler la suite</span><select name="scanner"><option value="">Aucun : je trade à l’œil</option>${scanners.map(([id, n]) => `<option value="${esc(id)}">${esc(n)}</option>`).join('')}</select></label></section>
        </div>
        <div class="rpx-new__f"><p class="rpx-err" id="rpaErr" role="alert"></p><button class="rpx-go" type="submit">Lancer le replay ${IC.go}</button></div>
      </form>
      ${best.length ? `<section class="rpx-best"><span class="rp__k">Meilleurs résultats</span><div class="rpx-best__l">${best.map((s, i) => `<button type="button" class="rpx-bc" data-open="${esc(s.id)}"><i>${i + 1}</i><span><b>${label(s)}</b><small>${esc(s.symbol)} · ${TF[s.tf][1]} · ${s.st.n} trades · ${fr(s.st.wr * 100, 0)} % gagnants</small></span><em class="${s.st.pct >= 0 ? 'is-up' : 'is-down'}">${s.st.pct >= 0 ? '+' : ''}${fr(s.st.pct, 1)} %</em></button>`).join('')}</div></section>` : ''}
      <section class="rpx-list"><span class="rp__k">Tes sessions</span>
        ${all.length ? `<div class="rpx-cards">${all.map((s) => `<article class="rpx-card"><button type="button" class="rpx-card__hit" data-open="${esc(s.id)}" aria-label="Reprendre ${label(s)}"></button>
          <header><b>${label(s)}</b><button type="button" class="rpx-del" data-del="${esc(s.id)}" aria-label="Supprimer">×</button></header>
          <small>${esc(s.symbol)} · ${TF[s.tf][1]} · ${ymd(s.start)} → ${ymd(s.end)}</small>${spark(s.st.curve)}
          <footer><span class="${s.st.pct >= 0 ? 'is-up' : 'is-down'}">${s.st.pct >= 0 ? '+' : ''}${fr(s.st.pct, 1)} %</span><span>${s.st.n} trades</span><span>${fr(s.st.wr * 100, 0)} % gagnants</span></footer></article>`).join('')}</div>` : '<p class="rpx-empty">Aucune session pour l’instant : lance ta première juste au-dessus.</p>'}</section>
    </div>`;
    const f = $('#rpaForm');
    root.querySelectorAll('[data-seg]').forEach((g) => g.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; g.querySelectorAll('button').forEach((x) => x.classList.toggle('is-on', x === b)); }));
    root.querySelectorAll('[data-span]').forEach((b) => b.addEventListener('click', () => {
      let d = Number(b.dataset.span), end = Date.now() - 864e5;
      if (!d) { d = 90; end = Date.now() - 864e5 - Math.floor(Math.random() * 4 * 365) * 864e5; }
      f.end.value = ymd(end); f.start.value = ymd(end - d * 864e5);
    }));
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const sv = (n) => root.querySelector(`[data-seg="${n}"] .is-on`).dataset.v;
      const s = { id: 'rp_' + Date.now().toString(36), name: f.name.value.trim(), symbol: f.symbol.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''), tf: sv('tf'),
        start: Date.parse(f.start.value + 'T00:00:00Z'), end: Date.parse(f.end.value + 'T23:59:59Z'), capital: Number(sv('cap')), risk: Number(sv('risk')), scanner: f.scanner.value || null };
      const err = $('#rpaErr');
      if (!s.symbol) { err.textContent = 'Choisis une paire.'; return; }
      if (!(s.start < s.end)) { err.textContent = 'La fin doit être après le début.'; return; }
      Object.assign(s, { balance: s.capital, cursor: s.start, trades: [], orders: [], indicators: [], created: Date.now() });
      play(s);
    });
    root.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => { const s = loadAll().find((x) => x.id === b.dataset.open); if (s) play(s); }));
    root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); if (!confirm('Supprimer cette session ?')) return; saveAll(loadAll().filter((x) => x.id !== b.dataset.del)); home(); }));
  }

  // ================================================================ données
  function makeStore(symbol) {
    const series = {};
    const get = (tf) => (series[tf] = series[tf] || { bars: [], from: Infinity, to: -Infinity, busy: null });
    async function ensure(tf, from, to) {
      const s = get(tf), ms = TF[tf][0];
      if (from >= s.from && to <= s.to) return s.bars;
      while (s.busy) await s.busy;
      if (from >= s.from && to <= s.to) return s.bars;
      const parts = [];
      for (let a = from; a < to; a += ms * 5500) parts.push([a, Math.min(to, a + ms * 5500)]);
      s.busy = (async () => {
        for (const [a, b] of parts) {
          if (a >= s.from && b <= s.to) continue;
          const d = await api(`/replay/bars?symbol=${encodeURIComponent(symbol)}&tf=${tf}&from=${Math.round(a)}&to=${Math.round(b)}`);
          const seen = new Set(s.bars.map((x) => x[0]));
          d.bars.forEach((x) => { if (!seen.has(x[0])) s.bars.push(x); });
          s.bars.sort((x, y) => x[0] - y[0]);
          s.from = Math.min(s.from, a); s.to = Math.max(s.to, b);
        }
      })();
      try { await s.busy; } finally { s.busy = null; }
      return s.bars;
    }
    return { ensure, get };
  }
  const bucketOf = (t, tf) => Math.floor(t / TF[tf][0]) * TF[tf][0];
  function aggregate(bars, tf) {
    const out = [];
    for (const b of bars) {
      const k = bucketOf(b[0], tf), last = out[out.length - 1];
      if (last && last[0] === k) { last[2] = Math.max(last[2], b[2]); last[3] = Math.min(last[3], b[3]); last[4] = b[4]; }
      else out.push([k, b[1], b[2], b[3], b[4]]);
    }
    return out;
  }
  const toVela = (b) => ({ time: b[0], open: b[1], high: b[2], low: b[3], close: b[4], volume: 0 });
  // Marché fermé retiré comme sur le graphique Stratégies (même règle que isTradableBar du scanner-server) :
  // bougies plates, samedi, dimanche avant 22 h UTC, vendredi après 22 h, coupure de 21 h.
  function tradable(b) {
    if (b[1] === b[2] && b[2] === b[3] && b[3] === b[4]) return false;
    const d = new Date(b[0]), day = d.getUTCDay(), h = d.getUTCHours();
    if (day === 6 || (day === 0 && h < 22) || (day === 5 && h >= 22) || h === 21) return false;
    return true;
  }
  const chartBars = (bars) => bars.filter(tradable).map(toVela);

  // ================================================================ session
  let S = null, chart = null, core = null, store = null, viewTf = null, timer = null, speed = 5, scanBusy = false, scanHandles = [], scanAt = 0, lastScan = null;
  let draft = null, adv = false, panel = null;
  const baseMs = () => TF[S.tf][0];
  const revealedBase = () => store.get(S.tf).bars.filter((x) => x[0] + baseMs() <= S.cursor);
  const lastBase = () => { const b = store.get(S.tf).bars; let i = b.length - 1; while (i >= 0 && b[i][0] + baseMs() > S.cursor) i--; return b[i] || null; };
  const price = () => { const b = lastBase(); return b ? b[4] : null; };
  // Bougies affichées (~500) à l'unité de temps vue, jamais au-delà du curseur.
  async function barsFor(tf) {
    const ms = TF[tf][0], cur = S.cursor;
    if (tf === S.tf) return revealedBase().slice(-VIEW_BARS * 2);
    const hist = (await store.ensure(tf, cur - VIEW_BARS * ms * 1.6, cur)).filter((x) => x[0] + ms <= cur);
    if (TF_ORDER.indexOf(tf) > TF_ORDER.indexOf(S.tf)) {
      const open = bucketOf(cur - 1, tf);
      const part = aggregate(revealedBase().filter((x) => x[0] >= open), tf);
      return hist.filter((x) => x[0] < open).concat(part).slice(-VIEW_BARS);
    }
    return hist.slice(-VIEW_BARS);
  }

  async function play(session) {
    S = session; S.orders = S.orders || []; S.trades = S.trades || []; S.indicators = S.indicators || [];
    viewTf = S.tf; store = makeStore(S.symbol); scanHandles = []; draft = null; lastScan = null; scanAt = 0; panel = null;
    root.innerHTML = `<div class="rpt">
      <header class="rpt-top">
        <button type="button" class="rpt-ib" data-act="home" aria-label="Retour aux sessions">‹</button>
        <b class="rpt-sym">${esc(S.symbol)}</b>
        <div class="rpt-tfs" role="group" aria-label="Unité de temps">${TF_ORDER.map((k) => `<button type="button" data-tf="${k}" class="${k === viewTf ? 'is-on' : ''}">${TF[k][1]}</button>`).join('')}</div>
        <button type="button" class="rpt-tb" data-act="ind">${IC.ind}<span>Indicateurs</span></button>
        <label class="rpt-tb rpt-goto" title="Avancer jusqu’à une date">${IC.go}<input type="date" id="rpaGo" aria-label="Avancer jusqu’à une date"></label>
        <span class="rpt-when" id="rpaWhen"></span>
        <span class="rpt-sp"></span>
        <span class="rpt-bal"><b id="rpaBal"></b><i id="rpaPnl"></i></span>
        <div class="rpt-trade" role="group" aria-label="Passer un ordre">
          <button type="button" class="rpt-sell" data-trade="sell"><small>Vendre</small><b id="rpaBid">—</b></button>
          <button type="button" class="rpt-adv" data-act="adv" aria-label="Réglages avancés de l’ordre" aria-pressed="false"><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>
          <button type="button" class="rpt-buy" data-trade="buy"><small>Acheter</small><b id="rpaAsk">—</b></button>
        </div>
        <button type="button" class="rpt-tb" data-act="export">Vers Backtesting</button>
      </header>
      <div class="rpt-body">
        <div class="rpt-chart"><div id="rpaChart" class="rpt-canvas"><div class="rpt-load">Chargement des bougies…</div></div>
          <div class="rpt-player" role="group" aria-label="Lecture">
            <button type="button" data-act="play" id="rpaPlay" aria-label="Lecture / pause">▶</button>
            <button type="button" data-act="step" aria-label="Bougie suivante">⏭</button>
            <span>${TF[S.tf][1]}</span>
            <select id="rpaSpeed" aria-label="Vitesse">${[1, 2, 5, 10, 25, 50].map((v) => `<option value="${v}"${v === speed ? ' selected' : ''}>${v}x</option>`).join('')}</select>
          </div>
          <div class="rpt-indpop" id="rpaInd" hidden></div></div>
        <aside class="rpt-panel" id="rpaPanel" hidden></aside>
        <nav class="rpt-rail" aria-label="Volets">${[['order', 'Ordre'], ['pos', 'Positions'], ['journal', 'Journal'], ['stats', 'Statistiques'], ['scan', 'Scanner']].map(([k, l]) => `<button type="button" data-panel="${k}" title="${l}" aria-label="${l}">${IC[k]}</button>`).join('')}</nav>
      </div></div>`;
    bind();
    try {
      const ms = baseMs();
      await store.ensure(S.tf, S.cursor - VIEW_BARS * ms * 1.6, Math.min(S.end, S.cursor + 3000 * ms));
      // session neuve : on démarre avec ~500 bougies déjà visibles
      if (!revealedBase().length) { const b = store.get(S.tf).bars; if (b.length) S.cursor = b[Math.min(b.length - 1, 0)][0] + ms; }
      await mountChart();
    } catch (e) { $('#rpaChart').innerHTML = `<div class="rpt-load">${esc(e.message)}</div>`; }
    paint();
    if (S.scanner) refreshScan();
  }

  async function mountChart() {
    const el = $('#rpaChart');
    if (!el) return;
    const bars = await barsFor(viewTf);
    if (chart) { try { chart.destroy(); } catch (e) { /* tant pis */ } chart = null; core = null; }
    el.innerHTML = '';
    if (!bars.length) { el.innerHTML = '<div class="rpt-load">Pas de bougies sur cette période (marché fermé ou paire inconnue).</div>'; return; }
    const { Vela } = await import('https://esm.sh/@luxalgo/vela@0.6.21');
    const data = chartBars(bars);
    chart = new Vela(el, { symbol: S.symbol, timeframe: VELA_TF[viewTf], data, theme: 'dark', drawings: true, volume: false });
    core = chart.renderer && chart.renderer.renderer;
    window.__rpChart = chart;
    try { chart.renderer.applyConfig({ candles: { upColor: '#089981', downColor: '#f23645', wickUpColor: '#089981', wickDownColor: '#f23645' }, timeScale: { timezone: 'Europe/Paris' } }); } catch (e) { /* couleurs par défaut */ }
    try { await chart.ready(); } catch (e) { /* prêt */ }
    // vue de départ : les ~150 dernières bougies (les 500 restent accessibles en reculant)
    try { if (core && core.setVisibleRange && data.length) core.setVisibleRange({ from: data[Math.max(0, data.length - 150)].time, to: data[data.length - 1].time + TF[viewTf][0] * 25 }); } catch (e) { /* vue par défaut */ }
    try { chart.on('drawing:edited', (p) => onDrawingEdited(p && p.id)); } catch (e) { /* événement indisponible */ }
    for (const t of S.indicators) { try { await chart.addNativeIndicator(t); } catch (e) { /* indicateur absent */ } }
    scanHandles = [];
    if (S.scanner && lastScan) await mountScan(lastScan);
    drawPositions();
  }

  // ---------------------------------------------------------------- lecture
  async function step() {
    const ms = baseMs(), s = store.get(S.tf);
    if (S.cursor >= S.end) { stop(); toast('Fin de la période.'); return false; }
    if (s.to - S.cursor < 600 * ms && s.to < S.end) store.ensure(S.tf, s.to, Math.min(S.end, s.to + 4000 * ms)).catch(() => {});
    // le week-end et les coupures sont sautés d'un coup (aucune bougie à jouer)
    let i = s.bars.findIndex((x) => x[0] + ms > S.cursor);
    while (i >= 0 && i < s.bars.length && !tradable(s.bars[i])) i++;
    const next = i >= 0 ? s.bars[i] : undefined;
    if (!next) { if (s.busy) { await s.busy; return step(); } S.cursor = S.end; stop(); return false; }
    S.cursor = next[0] + ms;
    fill(next);
    if (core && tradable(next)) {
      try {
        if (viewTf === S.tf) core.updateBar(toVela(next));
        else if (TF_ORDER.indexOf(viewTf) > TF_ORDER.indexOf(S.tf)) { const open = bucketOf(S.cursor - 1, viewTf); const p = aggregate(revealedBase().filter((x) => x[0] >= open && tradable(x)), viewTf); if (p.length) core.updateBar(toVela(p[p.length - 1])); }
        else { const vb = await barsFor(viewTf); core.setBars(chartBars(vb), { preserveView: true }); }
      } catch (e) { /* tant pis */ }
    }
    paint();
    return true;
  }
  function fill(b) {
    const [, , h, l] = b;
    S.orders.forEach((o) => { if (o.status === 'pending' && l <= o.entry && h >= o.entry) { o.status = 'open'; o.openAt = b[0]; } });
    S.orders.forEach((o) => {
      if (o.status !== 'open') return;
      const hitSl = o.side === 'buy' ? l <= o.sl : h >= o.sl;
      const hitTp = o.tp != null && (o.side === 'buy' ? h >= o.tp : l <= o.tp);
      if (hitSl) close(o, o.sl, Math.abs(o.sl - o.entry) < 1e-12 ? 'BE' : 'SL', b[0]);
      else if (hitTp) close(o, o.tp, 'TP', b[0]);
    });
    S.orders = S.orders.filter((o) => o.status === 'open' || o.status === 'pending');
  }
  const rrOf = (o, exit) => { const r = Math.abs(o.entry - o.sl0); return r ? (o.side === 'buy' ? exit - o.entry : o.entry - exit) / r : 0; };
  const pnlOf = (o, exit) => (o.side === 'buy' ? exit - o.entry : o.entry - exit) * o.lots * CONTRACT(S.symbol) * toUsd(S.symbol, exit);
  function removeDw(o) { if (o && o.dw && chart) { try { chart.drawings.remove(o.dw); } catch (e) { /* déjà retirée */ } } if (o) o.dw = null; }
  function close(o, exit, why, at) {
    const rr = rrOf(o, exit), pnl = pnlOf(o, exit);
    S.balance += pnl;
    o.status = 'closed';
    removeDw(o);
    S.trades.push({ side: o.side, entry: o.entry, sl: o.sl0, tp: o.tp, exit, lots: o.lots, result: why === 'manual' ? (rr > 0.05 ? 'TP' : rr < -0.05 ? 'SL' : 'BE') : why, rr: Math.round(rr * 100) / 100, pnl, risk: o.risk, open: o.openAt, close: at || S.cursor });
    save();
  }
  function stop() { clearInterval(timer); timer = null; const b = $('#rpaPlay'); if (b) b.textContent = '▶'; if (S && S.scanner) refreshScan(); }

  // ---------------------------------------------------------------- ordre (position sur le graphique + calculatrice)
  function atr() {
    const b = revealedBase().slice(-15);
    if (b.length < 2) return price() * 0.002;
    return b.slice(1).reduce((s, x, i) => s + Math.max(x[2] - x[3], Math.abs(x[2] - b[i][4]), Math.abs(x[3] - b[i][4])), 0) / (b.length - 1);
  }
  const unitUsd = (entry) => CONTRACT(S.symbol) * toUsd(S.symbol, entry);
  function lotsFor(riskPct, entry, sl) { const d = Math.abs(entry - sl); return d ? Math.max(0.01, Math.round(S.balance * riskPct / 100 / (d * unitUsd(entry)) * 100) / 100) : 0.01; }
  const usdOf = (lots, a, b) => Math.abs(a - b) * lots * unitUsd(a);
  function startDraft(side) {
    const p = price(); if (!p) return;
    const a = atr() * 1.5;
    const sl = side === 'buy' ? p - a : p + a, tp = side === 'buy' ? p + 2 * a : p - 2 * a;
    draft = { side, entry: p, sl, tp, risk: Number(S.risk), lots: lotsFor(S.risk, p, sl), kind: 'market' };
    drawDraft();
    openPanel('order', true);
  }
  const posAnchors = (o) => { const t0 = o.openAt || S.cursor; const t1 = Math.max(t0, S.cursor) + TF[viewTf][0] * 30; return [{ time: t0, price: o.entry }, { time: t1, price: o.sl }, { time: t1, price: o.tp != null ? o.tp : o.entry + (o.entry - o.sl) * 2 }]; };
  function addPosDrawing(o) {
    if (!chart || !chart.drawings) return null;
    try {
      const d = chart.drawings.add('position', { anchors: posAnchors(o), props: { riskPercent: Math.round(o.risk * 100) / 100, accountBalance: Math.round(S.balance), profitColor: '#33e6a6', lossColor: '#ff4d5e', showText: true } });
      return d && (d.id || d);
    } catch (e) { return null; }
  }
  function drawDraft() { if (!draft) return; removeDw(draft); draft.dw = addPosDrawing(draft); }
  function drawPositions() { S.orders.forEach((o) => { o.dw = addPosDrawing(o); }); if (draft) draft.dw = addPosDrawing(draft); }
  // Une poignée tirée sur le graphique : nouveau SL / TP (ou entrée pour le brouillon).
  function onDrawingEdited(id) {
    if (!id || !chart) return;
    const d = (chart.drawings.all() || []).find((x) => x.id === id);
    if (!d || !d.anchors || d.anchors.length < 3) return;
    const [e, s, t] = d.anchors.map((x) => x.price);
    if (draft && draft.dw === id) {
      draft.entry = e; draft.sl = s; draft.tp = t;
      if ((draft.side === 'buy' && s > e) || (draft.side === 'sell' && s < e)) draft.side = draft.side === 'buy' ? 'sell' : 'buy';
      draft.kind = Math.abs(e - price()) > atr() * 0.05 ? 'limit' : 'market';
      if (draft.kind === 'market') draft.entry = price();
      draft.lots = lotsFor(draft.risk, draft.entry, draft.sl);
      paintOrder(); return;
    }
    const o = S.orders.find((x) => x.dw === id);
    if (!o) return;
    const p = price();
    if (o.side === 'buy' ? s < p : s > p) o.sl = s;
    if (o.side === 'buy' ? t > p : t < p) o.tp = t;
    save(); paint();
  }
  function placeDraft() {
    const o = draft; if (!o) return;
    const p = price();
    if ((o.side === 'buy' && o.sl >= o.entry) || (o.side === 'sell' && o.sl <= o.entry)) return toast('Le SL doit être sous l’entrée à l’achat, au-dessus à la vente.');
    if (o.tp != null && ((o.side === 'buy' && o.tp <= o.entry) || (o.side === 'sell' && o.tp >= o.entry))) return toast('Le TP doit être du bon côté de l’entrée.');
    const market = o.kind === 'market';
    const entry = market ? p : o.entry;
    const ord = { id: Date.now(), side: o.side, entry, sl: o.sl, sl0: o.sl, tp: o.tp, lots: o.lots, risk: Math.round(usdOf(o.lots, entry, o.sl) / S.balance * 10000) / 100, status: market ? 'open' : 'pending', openAt: S.cursor, dw: o.dw };
    S.orders.push(ord);
    draft = null;
    save(); openPanel('pos', true);
    toast(market ? `${ord.side === 'buy' ? 'Achat' : 'Vente'} ${fr(ord.lots, 2)} lot au marché` : 'Ordre limite posé');
  }
  function cancelDraft() { removeDw(draft); draft = null; paintOrder(); }
  function act(id, what) {
    const o = S.orders.find((x) => x.id === id); if (!o) return;
    if (what === 'close') {
      if (o.status === 'pending') removeDw(o); else close(o, price(), 'manual');
      S.orders = S.orders.filter((x) => x !== o);
    }
    if (what === 'be' && o.status === 'open') { o.sl = o.entry; removeDw(o); o.dw = addPosDrawing(o); }
    save(); paint();
  }

  // ---------------------------------------------------------------- volets
  function openPanel(k, force) {
    panel = !force && panel === k ? null : k;
    root.querySelectorAll('[data-panel]').forEach((b) => b.classList.toggle('is-on', b.dataset.panel === panel));
    $('#rpaPanel').hidden = !panel;
    paint();
  }
  function stats() {
    const t = S.trades, wins = t.filter((x) => x.rr > 0.05), losses = t.filter((x) => x.rr < -0.05);
    const gw = wins.reduce((s, x) => s + x.pnl, 0), gl = -losses.reduce((s, x) => s + x.pnl, 0);
    let bal = S.capital, peak = bal, dd = 0, streak = 0, worst = 0; const curve = [bal];
    t.forEach((x) => { bal += x.pnl; peak = Math.max(peak, bal); dd = Math.max(dd, (peak - bal) / peak); curve.push(bal); streak = x.rr < -0.05 ? streak + 1 : 0; worst = Math.max(worst, streak); });
    return { n: t.length, wr: wins.length + losses.length ? wins.length / (wins.length + losses.length) : 0, pf: gl ? gw / gl : null, R: t.reduce((s, x) => s + x.rr, 0), avgR: t.length ? t.reduce((s, x) => s + x.rr, 0) / t.length : 0, dd, worst, curve };
  }
  const riskSeg = (attr, on) => `<div class="rpt-seg">${[0.25, 0.5, 1, 2, 3].map((v) => `<button type="button" data-${attr}="${v}" class="${on != null && Math.abs(on - v) < 0.005 ? 'is-on' : ''}">${String(v).replace('.', ',')} %</button>`).join('')}</div>`;
  function paintOrder() {
    const P = $('#rpaPanel'); if (!P || panel !== 'order') return;
    const d = dec(S.symbol);
    if (!draft) {
      P.innerHTML = `<div class="rpt-ph"><span class="rp__k">Ordre</span><h3>Nouvelle position</h3></div><p class="rpt-empty">Clique sur <b class="is-up">Acheter</b> ou <b class="is-down">Vendre</b> dans la barre du haut : la position se pose sur le graphique, tire ses poignées pour placer le SL et le TP.</p>
        <div class="rpt-f"><span>Risque par défaut</span>${riskSeg('defrisk', Number(S.risk))}</div>`;
      return;
    }
    const o = draft, riskUsd = usdOf(o.lots, o.entry, o.sl), riskPct = riskUsd / S.balance * 100;
    const rr = o.tp != null ? Math.abs(o.tp - o.entry) / Math.abs(o.entry - o.sl) : null;
    const gain = o.tp != null ? usdOf(o.lots, o.entry, o.tp) : null;
    const lv = (cls, k, id, v, note) => `<div class="rpt-lvr ${cls}"><span>${k}</span>${adv ? `<input id="${id}" inputmode="decimal" value="${v}" placeholder="aucun">` : `<b>${v || '—'}</b>`}<em>${note}</em></div>`;
    P.innerHTML = `<div class="rpt-ph is-${o.side}"><span class="rp__k">Ordre · ${o.kind === 'market' ? 'au marché' : 'limite'}</span><h3>${o.side === 'buy' ? 'Achat' : 'Vente'} ${esc(S.symbol)}</h3><small>Tire les poignées sur le graphique, ou ouvre la flèche entre Vendre et Acheter pour taper les prix.</small></div>
      <div class="rpt-calc">
        <label><span>Risque</span><div class="rpt-io"><input id="oRisk" inputmode="decimal" value="${fr(riskPct, 2)}"><i>%</i></div><small>${money(riskUsd)} du capital</small></label>
        <label><span>Lot</span><div class="rpt-io"><button type="button" data-lot="-1" aria-label="Moins">−</button><input id="oLots" inputmode="decimal" value="${fr(o.lots, 2)}"><button type="button" data-lot="1" aria-label="Plus">+</button></div><small>${fr(o.lots * CONTRACT(S.symbol), 0)} unités</small></label>
      </div>
      ${riskSeg('qrisk', riskPct)}
      <div class="rpt-lv">
        ${lv('is-tp', 'TP', 'oTp', o.tp != null ? o.tp.toFixed(d) : '', gain != null ? '+' + money(gain) + ' · ' + fr(gain / S.balance * 100, 2) + ' %' : '')}
        ${lv('is-pe', 'Entrée', 'oPe', o.entry.toFixed(d), o.kind === 'market' ? 'marché' : 'limite')}
        ${lv('is-sl', 'SL', 'oSl', o.sl.toFixed(d), '−' + money(riskUsd) + ' · ' + fr(riskPct, 2) + ' %')}
      </div>
      <p class="rpt-rr">${rr ? `R:R <b>1 : ${fr(rr, 2)}</b> · ` : ''}${fr(Math.abs(o.entry - o.sl), d)} jusqu’au SL</p>
      <div class="rpt-acts"><button type="button" class="rpt-place is-${o.side}" data-act="place">${o.side === 'buy' ? 'Acheter' : 'Vendre'} ${fr(o.lots, 2)} lot</button><button type="button" class="rpt-cancel" data-act="cancel">Annuler</button></div>`;
  }
  function paint() {
    if (!S) return;
    const p = price(), d = dec(S.symbol);
    const floating = S.orders.filter((o) => o.status === 'open').reduce((s, o) => s + (p ? pnlOf(o, p) : 0), 0);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('rpaWhen', when(S.cursor)); set('rpaBal', money(S.balance + floating));
    if (p) { set('rpaAsk', p.toFixed(d)); set('rpaBid', p.toFixed(d)); }
    const pn = $('#rpaPnl'); if (pn) { const pct = (S.balance + floating - S.capital) / S.capital * 100; pn.textContent = `${pct >= 0 ? '+' : ''}${fr(pct, 2)} %`; pn.className = pct >= 0 ? 'is-up' : 'is-down'; }
    const P = $('#rpaPanel'); if (!P || !panel) return;
    if (panel === 'order') return paintOrder();
    if (panel === 'pos') P.innerHTML = `<div class="rpt-ph"><span class="rp__k">Positions</span><h3>${S.orders.length} en cours</h3></div>` + (S.orders.length ? S.orders.map((o) => `<div class="rpt-pos is-${o.side}"><div class="rpt-pos__t"><b>${o.side === 'buy' ? 'Achat' : 'Vente'} ${fr(o.lots, 2)} lot</b>${o.status === 'pending' ? '<em>en attente</em>' : p ? `<span class="${pnlOf(o, p) >= 0 ? 'is-up' : 'is-down'}">${money(pnlOf(o, p))}</span>` : ''}</div><small>Entrée ${o.entry.toFixed(d)} · SL ${o.sl.toFixed(d)}${o.tp != null ? ' · TP ' + o.tp.toFixed(d) : ''} · ${fr(o.risk, 2)} %</small>
        <div class="rpt-pos__a">${o.status === 'open' ? `<button type="button" data-be="${o.id}">SL à l’entrée</button>` : ''}<button type="button" data-close="${o.id}">${o.status === 'pending' ? 'Annuler' : 'Clôturer'}</button></div></div>`).join('') : '<p class="rpt-empty">Aucune position. Clique sur Acheter ou Vendre.</p>');
    if (panel === 'journal') P.innerHTML = `<div class="rpt-ph"><span class="rp__k">Journal</span><h3>${S.trades.length} trade${S.trades.length > 1 ? 's' : ''}</h3></div>` + (S.trades.length ? `<ul class="rpt-jr">${S.trades.slice().reverse().map((t) => `<li class="is-${t.rr > 0.05 ? 'win' : t.rr < -0.05 ? 'loss' : 'flat'}"><div><b>${t.side === 'buy' ? 'Achat' : 'Vente'} · ${t.result}</b><span>${t.rr > 0 ? '+' : ''}${fr(t.rr, 2)} R · ${money(t.pnl)}</span></div><small>${when(t.open)} → ${when(t.close)}</small></li>`).join('')}</ul>` : '<p class="rpt-empty">Les trades clôturés arrivent ici.</p>');
    if (panel === 'stats') { const x = stats(); P.innerHTML = `<div class="rpt-ph"><span class="rp__k">Statistiques</span><h3 class="${S.balance >= S.capital ? 'is-up' : 'is-down'}">${S.balance >= S.capital ? '+' : ''}${money(S.balance - S.capital)}</h3></div><div class="rpt-st">${[['Trades', x.n], ['Gagnants', fr(x.wr * 100, 1) + ' %'], ['Profit factor', x.pf == null ? '—' : fr(x.pf, 2)], ['Total', (x.R >= 0 ? '+' : '') + fr(x.R, 2) + ' R'], ['R moyen', (x.avgR >= 0 ? '+' : '') + fr(x.avgR, 2)], ['DD max', fr(x.dd * 100, 1) + ' %'], ['Pertes d’affilée', x.worst], ['Solde', money(S.balance)]].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>${spark(x.curve, 300, 80)}`; }
    if (panel === 'scan') {
      const list = window.CHESTScanners ? CHESTScanners.list() : [];
      P.innerHTML = `<div class="rpt-ph"><span class="rp__k">Scanner</span><h3>${S.scanner ? esc((list.find((s) => s.id === S.scanner) || {}).name || S.scanner) : 'Aucun'}</h3></div>
      <label class="rpt-f"><span>Scanner affiché</span><select id="rpaScanSel"><option value="">Aucun</option>${list.map((s) => `<option value="${esc(s.id)}"${s.id === S.scanner ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
      <p class="rpt-empty">Calculé sur les bougies déjà passées seulement : il ne dévoile jamais la suite. Mis à jour à chaque pause.</p>
      <p class="rpt-empty">${scanBusy ? 'Calcul en cours…' : scanAt ? 'À jour au ' + when(scanAt) : ''}</p>
      ${S.scanner ? '<button type="button" class="rpt-place is-ghost" data-act="scan">Mettre à jour maintenant</button>' : ''}`;
    }
  }

  // ---------------------------------------------------------------- indicateurs et scanner
  async function indMenu() {
    const pop = $('#rpaInd');
    if (!pop.hidden) { pop.hidden = true; return; }
    if (!chart) return;
    let list = [];
    try { list = await chart.availableNativeIndicators(); } catch (e) { /* aucun */ }
    list = (list || []).filter((x) => x && x.type !== 'volume' && x.supported !== false);
    pop.innerHTML = `<input id="rpaIndQ" placeholder="Rechercher un indicateur" aria-label="Rechercher un indicateur"><ul>${list.map((x) => `<li><button type="button" data-addind="${esc(x.type)}">${esc(x.title || x.name || x.type)}${S.indicators.includes(x.type) ? '<i>ajouté</i>' : ''}</button></li>`).join('') || '<li class="rpt-empty">Aucun indicateur disponible.</li>'}</ul>`;
    pop.hidden = false;
    const q = $('#rpaIndQ');
    q.addEventListener('input', () => { const v = q.value.toLowerCase(); pop.querySelectorAll('li').forEach((li) => { li.hidden = !li.textContent.toLowerCase().includes(v); }); });
    q.focus();
  }
  async function refreshScan() {
    if (!S || !S.scanner || scanBusy || !chart) return;
    scanBusy = true; paint();
    try {
      const d = await api(`/replay/scan?script=${encodeURIComponent(S.scanner)}&symbol=${encodeURIComponent(S.symbol)}&tf=${viewTf}&to=${Math.round(S.cursor)}&n=1200`);
      lastScan = d; scanAt = S.cursor;
      await mountScan(d);
    } catch (e) { toast(e.message); }
    scanBusy = false; paint();
  }
  // Les modèles du scanner (calculés côté serveur) sont branchés dans Vela par un moteur « pine » à distance,
  // comme sur le graphique Stratégies (js/scanner-chart.js).
  async function mountScan(d) {
    if (!chart || !d || !Array.isArray(d.models)) return;
    scanHandles.forEach((h) => { try { if (h && h.remove) h.remove(); else if (h && chart.removeIndicator) chart.removeIndicator(h); } catch (e) { /* tant pis */ } });
    scanHandles = [];
    const models = d.models;
    const engine = {
      language: 'pine',
      capabilities: { streaming: false, visibleRange: false, inputs: false, props: false },
      async prepare(source, instanceId) {
        const idx = Number((source.match(/\/\/idx:(\d+)/) || [])[1] || 0);
        const m = models[idx] || {};
        return { language: 'pine', inputs: [], props: undefined, meta: { title: m.title || 'Scanner', overlay: m.overlay !== false }, reactsToViewport: false, token: { instanceId, idx } };
      },
      execute(req, handlers) {
        const m = models[req.prepared.token.idx];
        setTimeout(() => { if (m) handlers.onModel(m); if (handlers.onDone) handlers.onDone(); }, 0);
        return { stop() {}, update() {}, setVisibleRange() {}, notifyBars() {} };
      },
    };
    try { chart.registerEngine('pine', engine); } catch (e) { /* déjà enregistré */ }
    for (let i = 0; i < models.length; i++) {
      try { scanHandles.push(await chart.addIndicator(`//@version=5\n//idx:${i}\n//t:${Date.now()}\nindicator("scan-${i}")`)); } catch (e) { /* modèle illisible */ }
    }
  }

  // ---------------------------------------------------------------- divers
  function save() { if (!S) return; const l = loadAll().filter((x) => x.id !== S.id); l.unshift(JSON.parse(JSON.stringify(S, (k, v) => (k === 'dw' ? undefined : v)))); saveAll(l); }
  function toast(t) { const el = document.createElement('div'); el.className = 'rpt-toast'; el.setAttribute('role', 'status'); el.textContent = t; document.body.appendChild(el); setTimeout(() => el.remove(), 2600); }
  async function exportBt() {
    if (!S.trades.length) return toast('Aucun trade clôturé à envoyer.');
    if (!window.CHESTBacktests) return toast('Backtesting indisponible.');
    await CHESTBacktests.ready();
    const iso = (ms) => new Date(ms).toISOString();
    const trades = S.trades.map((t) => ({ date: iso(t.close), open: iso(t.open), close: iso(t.close), result: t.result, rr: t.rr, order: t.side === 'buy' ? 'BUY' : 'SELL', extra: { Paire: S.symbol, Source: 'Replay' } }));
    const rec = CHESTBacktests.add({ title: S.name || `Replay ${S.symbol} ${TF[S.tf][1]}`, description: `Session de replay du ${ymd(S.start)} au ${ymd(S.end)}.`, capital: S.capital, pfCapital: 100000,
      cp: { mode: 'manual', risk: S.risk, tiers: [], rules: [] }, pf: null, trades });
    try { await CHESTBacktests.flush(); } catch (e) { /* envoyé plus tard */ }
    location.href = 'backtest-view.html?id=' + encodeURIComponent(rec.id);
  }

  let bound = false;
  function bind() {
    if (bound) return;
    bound = true;
    const num = (v) => Number(String(v).replace(/\s/g, '').replace(',', '.'));
    root.addEventListener('click', async (e) => {
      if (!S) return;
      const t = e.target;
      const pop = $('#rpaInd');
      if (pop && !pop.hidden && !t.closest('#rpaInd') && !t.closest('[data-act="ind"]')) pop.hidden = true;
      const a = t.closest('[data-act]');
      if (a) {
        const k = a.dataset.act;
        if (k === 'home') { clearInterval(timer); timer = null; save(); S = null; draft = null; if (chart) { try { chart.destroy(); } catch (x) { /* tant pis */ } chart = null; core = null; } home(); return; }
        if (k === 'step') { clearInterval(timer); timer = null; $('#rpaPlay').textContent = '▶'; await step(); return; }
        if (k === 'play') { if (timer) stop(); else { a.textContent = '⏸'; timer = setInterval(() => { step(); }, Math.max(30, 900 / speed)); } return; }
        if (k === 'adv') { adv = !adv; a.classList.toggle('is-on', adv); a.setAttribute('aria-pressed', String(adv)); openPanel('order', true); return; }
        if (k === 'place') { placeDraft(); return; }
        if (k === 'cancel') { cancelDraft(); return; }
        if (k === 'export') { exportBt(); return; }
        if (k === 'ind') { indMenu(); return; }
        if (k === 'scan') { refreshScan(); return; }
      }
      const tr = t.closest('[data-trade]'); if (tr) { if (draft && draft.side === tr.dataset.trade) { openPanel('order', true); return; } removeDw(draft); startDraft(tr.dataset.trade); return; }
      const tfb = t.closest('[data-tf]'); if (tfb) { viewTf = tfb.dataset.tf; root.querySelectorAll('[data-tf]').forEach((x) => x.classList.toggle('is-on', x === tfb)); lastScan = null; try { await mountChart(); } catch (x) { toast(x.message); } if (S.scanner) refreshScan(); return; }
      const pb = t.closest('[data-panel]'); if (pb) { openPanel(pb.dataset.panel); return; }
      const ai = t.closest('[data-addind]'); if (ai) { pop.hidden = true; try { await chart.addNativeIndicator(ai.dataset.addind); if (!S.indicators.includes(ai.dataset.addind)) S.indicators.push(ai.dataset.addind); save(); } catch (x) { toast('Indicateur indisponible.'); } return; }
      const dr = t.closest('[data-defrisk]'); if (dr) { S.risk = Number(dr.dataset.defrisk); save(); paintOrder(); return; }
      const qr = t.closest('[data-qrisk]'); if (qr && draft) { draft.risk = Number(qr.dataset.qrisk); draft.lots = lotsFor(draft.risk, draft.entry, draft.sl); drawDraft(); paintOrder(); return; }
      const lb = t.closest('[data-lot]'); if (lb && draft) { draft.lots = Math.max(0.01, Math.round((draft.lots + Number(lb.dataset.lot) * 0.01) * 100) / 100); draft.risk = usdOf(draft.lots, draft.entry, draft.sl) / S.balance * 100; drawDraft(); paintOrder(); return; }
      const cb = t.closest('[data-close]'); if (cb) { act(Number(cb.dataset.close), 'close'); return; }
      const bb = t.closest('[data-be]'); if (bb) act(Number(bb.dataset.be), 'be');
    });
    root.addEventListener('change', async (e) => {
      if (!S) return;
      const id = e.target.id;
      if (id === 'rpaSpeed') { speed = Number(e.target.value); if (timer) { clearInterval(timer); timer = setInterval(() => { step(); }, Math.max(30, 900 / speed)); } return; }
      if (id === 'rpaGo') {
        const target = Date.parse(e.target.value + 'T00:00:00Z');
        if (!(target > S.cursor)) { toast('On ne revient pas en arrière : choisis une date plus loin.'); return; }
        clearInterval(timer); timer = null; toast('Avance rapide…');
        const saveCore = core; core = null;
        let n = 0; while (S.cursor < target && n < 60000) { if (!(await step())) break; n++; }
        core = saveCore; await mountChart(); paint(); if (S.scanner) refreshScan(); return;
      }
      if (id === 'rpaScanSel') { S.scanner = e.target.value || null; lastScan = null; save(); await mountChart(); if (S.scanner) refreshScan(); paint(); return; }
      if (!draft) return;
      if (id === 'oRisk') { draft.risk = Math.max(0.01, num(e.target.value)); draft.lots = lotsFor(draft.risk, draft.entry, draft.sl); }
      if (id === 'oLots') { draft.lots = Math.max(0.01, Math.round(num(e.target.value) * 100) / 100); draft.risk = usdOf(draft.lots, draft.entry, draft.sl) / S.balance * 100; }
      if (id === 'oSl') { const v = num(e.target.value); if (v > 0) { draft.sl = v; draft.lots = lotsFor(draft.risk, draft.entry, draft.sl); } }
      if (id === 'oTp') { const v = String(e.target.value).trim(); draft.tp = v ? num(v) : null; }
      if (id === 'oPe') { const v = num(e.target.value); if (v > 0) { draft.entry = v; draft.kind = Math.abs(v - price()) > 1e-9 ? 'limit' : 'market'; draft.lots = lotsFor(draft.risk, draft.entry, draft.sl); } }
      if (['oRisk', 'oLots', 'oSl', 'oTp', 'oPe'].includes(id)) { drawDraft(); paintOrder(); }
    });
    document.addEventListener('keydown', (e) => {
      if (!S || /INPUT|SELECT|TEXTAREA/.test(document.activeElement && document.activeElement.tagName)) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); clearInterval(timer); timer = null; step(); }
      if (e.key === ' ') { e.preventDefault(); const b = $('#rpaPlay'); if (b) b.click(); }
    });
  }

  window.CHESTReplay = { mount(el) { root = el; home(); } };
})();
