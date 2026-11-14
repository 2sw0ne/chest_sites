// REPLAY (2026-11-14, phase 2) : rejouer le marché bougie par bougie et prendre de faux trades.
// Réglages : paire, unité de temps de base, période, capital, risque par défaut, scanner (facultatif).
// Données : GET /replay/bars (historique gardé sur le disque du scanner-server, une tranche payée une seule fois pour
// tout le monde) chargé par fenêtres au fil de la lecture. Unités de temps supérieures recalculées dans le navigateur
// (aucun appel en plus) ; inférieures chargées seulement autour du curseur. Graphique : Vela (comme Stratégies).
// Ordres au marché ou limite, SL / TP, BE, clôture ; SL et TP touchés dans la même bougie = SL (prudence).
// Sessions gardées sur l'appareil (chest_replay_sessions) ; les trades partent vers Backtesting en un clic.
(function () {
  const A = window.CHESTAccounts;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TF = { '1': [60e3, 'M1'], '5': [300e3, 'M5'], '15': [900e3, 'M15'], '30': [1800e3, 'M30'], '60': [3600e3, 'H1'], '240': [14400e3, 'H4'], 'D': [86400e3, 'D1'] };
  const VELA_TF = { '1': '1m', '5': '5m', '15': '15m', '30': '30m', '60': '1h', '240': '4h', 'D': '1d' };
  const TF_ORDER = ['1', '5', '15', '30', '60', '240', 'D'];
  const PAIRS = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD', 'GBPJPY', 'EURJPY', 'EURGBP', 'XAGUSD', 'NAS100', 'US30', 'SPX500', 'GER40', 'BTCUSD', 'ETHUSD'];
  const KEY = 'chest_replay_sessions';
  const fr = (n, d = 2) => Number(n).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const money = (n) => (n < 0 ? '−' : '') + Math.abs(n).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' $';
  const dec = (sym) => (/JPY/.test(sym) ? 3 : /XAU|XAG|NAS|US30|SPX|GER|BTC|ETH/.test(sym) ? 2 : 5);
  const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);
  const when = (ms) => new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
  const loadAll = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } };
  const saveAll = (l) => { try { localStorage.setItem(KEY, JSON.stringify(l.slice(0, 30))); } catch (e) { /* plein */ } };
  async function api(path) {
    const r = await fetch(A.apiBase() + path, { headers: { Authorization: 'Bearer ' + A.getToken() } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Données indisponibles.');
    return d;
  }

  // ---------------------------------------------------------------- réglages
  let root;
  function setup() {
    const scanners = (window.CHESTScanners ? CHESTScanners.list() : []).map((s) => [s.id, s.name]);
    const sessions = loadAll();
    const today = Date.now();
    root.innerHTML = `<div class="rpa-setup">
      <section class="rpa-card">
        <span class="rp__k">01 — Nouvelle session</span><h2>Rejoue le marché</h2>
        <p class="rpa-lead">Choisis la paire, l’unité de temps et la période. Tu pourras monter ou descendre d’unité de temps une fois le graphique ouvert.</p>
        <form id="rpaForm" class="rpa-form" novalidate>
          <label class="rpa-f rpa-f--wide"><span>Nom <i>(facultatif)</i></span><input name="name" maxlength="60" placeholder="Ex. Or · ouverture de Londres"></label>
          <label class="rpa-f"><span>Paire</span><input name="symbol" list="rpaPairs" value="XAUUSD" maxlength="12" autocapitalize="characters" required><datalist id="rpaPairs">${PAIRS.map((p) => `<option value="${p}">`).join('')}</datalist></label>
          <div class="rpa-f"><span>Unité de temps de base</span><div class="rpa-seg" data-seg="tf">${['1', '5', '15', '30', '60', '240'].map((k) => `<button type="button" data-v="${k}" class="${k === '15' ? 'is-on' : ''}">${TF[k][1]}</button>`).join('')}</div></div>
          <label class="rpa-f"><span>Début</span><input name="start" type="date" value="${ymd(today - 180 * 864e5)}" max="${ymd(today - 864e5)}"></label>
          <label class="rpa-f"><span>Fin</span><input name="end" type="date" value="${ymd(today - 864e5)}" max="${ymd(today)}"></label>
          <div class="rpa-f rpa-f--wide"><span>Raccourcis</span><div class="rpa-chips">${[[30, '1 mois'], [90, '3 mois'], [180, '6 mois'], [365, '1 an'], [0, 'Au hasard']].map(([d, l]) => `<button type="button" data-span="${d}">${l}</button>`).join('')}</div></div>
          <div class="rpa-f"><span>Capital de départ</span><div class="rpa-seg" data-seg="cap">${[5000, 10000, 25000, 50000, 100000].map((v) => `<button type="button" data-v="${v}" class="${v === 10000 ? 'is-on' : ''}">${v / 1000}k</button>`).join('')}</div></div>
          <div class="rpa-f"><span>Risque par défaut</span><div class="rpa-seg" data-seg="risk">${[0.25, 0.5, 1, 2, 3].map((v) => `<button type="button" data-v="${v}" class="${v === 1 ? 'is-on' : ''}">${String(v).replace('.', ',')} %</button>`).join('')}</div></div>
          <label class="rpa-f rpa-f--wide"><span>Scanner <i>(facultatif)</i></span><select name="scanner"><option value="">Aucun : je trade à l’œil</option>${scanners.map(([id, n]) => `<option value="${esc(id)}">${esc(n)}</option>`).join('')}</select><em>Ses signaux s’afficheront au fil du replay, sans jamais dévoiler la suite (étape suivante du chantier).</em></label>
          <p class="rpa-err" id="rpaErr" role="alert"></p>
          <button class="rpa-go" type="submit">Lancer le replay</button>
        </form>
      </section>
      <section class="rpa-card rpa-saved"><span class="rp__k">02 — Tes sessions</span>
        ${sessions.length ? `<ul>${sessions.map((s, i) => `<li><button type="button" class="rpa-open" data-open="${i}"><b>${esc(s.name || s.symbol + ' ' + TF[s.tf][1])}</b><small>${esc(s.symbol)} · ${TF[s.tf][1]} · ${ymd(s.start)} → ${ymd(s.end)} · ${(s.trades || []).length} trade${(s.trades || []).length > 1 ? 's' : ''} · ${money(s.balance - s.capital)}</small></button><button type="button" class="rpa-del" data-del="${i}" aria-label="Supprimer la session">×</button></li>`).join('')}</ul>` : '<p class="rpa-lead">Aucune session pour l’instant.</p>'}
      </section></div>`;
    const f = $('#rpaForm');
    root.querySelectorAll('[data-seg]').forEach((g) => g.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; g.querySelectorAll('button').forEach((x) => x.classList.toggle('is-on', x === b)); }));
    root.querySelectorAll('[data-span]').forEach((b) => b.addEventListener('click', () => {
      let d = Number(b.dataset.span), end = Date.now() - 864e5;
      if (!d) { d = 90; end = Date.now() - 864e5 - Math.floor(Math.random() * 4 * 365) * 864e5; }
      f.end.value = ymd(end); f.start.value = ymd(end - d * 864e5);
    }));
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const seg = (n) => root.querySelector(`[data-seg="${n}"] .is-on`).dataset.v;
      const s = { id: 'rp_' + Date.now().toString(36), name: f.name.value.trim(), symbol: f.symbol.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''), tf: seg('tf'),
        start: Date.parse(f.start.value + 'T00:00:00Z'), end: Date.parse(f.end.value + 'T23:59:59Z'), capital: Number(seg('cap')), risk: Number(seg('risk')), scanner: f.scanner.value || null };
      const err = $('#rpaErr');
      if (!s.symbol) { err.textContent = 'Choisis une paire.'; return; }
      if (!(s.start < s.end)) { err.textContent = 'La fin doit être après le début.'; return; }
      Object.assign(s, { balance: s.capital, cursor: s.start, trades: [], orders: [], created: Date.now() });
      play(s);
    });
    root.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => play(loadAll()[Number(b.dataset.open)])));
    root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => { const l = loadAll(); l.splice(Number(b.dataset.del), 1); saveAll(l); setup(); }));
  }

  // ---------------------------------------------------------------- données
  // Une série par unité de temps : bougies [t, o, h, l, c] triées, fenêtres déjà chargées.
  function makeStore(symbol) {
    const series = {};
    const get = (tf) => (series[tf] = series[tf] || { bars: [], from: Infinity, to: -Infinity, busy: null });
    async function ensure(tf, from, to) {
      const s = get(tf), ms = TF[tf][0];
      if (from >= s.from && to <= s.to) return s.bars;
      if (s.busy) await s.busy;
      if (from >= s.from && to <= s.to) return s.bars;
      const lo = Math.min(from, s.from === Infinity ? from : s.from), hi = Math.max(to, s.to === -Infinity ? to : s.to);
      const parts = [];
      for (let a = lo; a < hi; a += ms * 5000) parts.push([a, Math.min(hi, a + ms * 5000)]);
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
  // Agrège des bougies fines (≤ t) en bougies de l'unité supérieure ; la dernière peut être en cours.
  function aggregate(bars, tf, upTo) {
    const ms = TF[tf][0], out = [];
    for (const b of bars) {
      if (b[0] > upTo) break;
      const k = tf === 'D' ? Date.UTC(new Date(b[0]).getUTCFullYear(), new Date(b[0]).getUTCMonth(), new Date(b[0]).getUTCDate()) : Math.floor(b[0] / ms) * ms;
      const last = out[out.length - 1];
      if (last && last[0] === k) { last[2] = Math.max(last[2], b[2]); last[3] = Math.min(last[3], b[3]); last[4] = b[4]; }
      else out.push([k, b[1], b[2], b[3], b[4]]);
    }
    return out;
  }
  const toVela = (b) => ({ time: b[0], open: b[1], high: b[2], low: b[3], close: b[4], volume: 0 });

  // ---------------------------------------------------------------- session
  let S = null, chart = null, core = null, store = null, viewTf = null, timer = null, speed = 1, lines = [];
  async function play(session) {
    S = session; viewTf = S.tf; store = makeStore(S.symbol);
    root.innerHTML = `<div class="rpa-app">
      <header class="rpa-top">
        <button type="button" class="rpa-ib" data-act="back" aria-label="Retour aux sessions">‹</button>
        <b class="rpa-sym">${esc(S.symbol)}</b>
        <div class="rpa-tfs" role="group" aria-label="Unité de temps">${TF_ORDER.map((k) => `<button type="button" data-tf="${k}" class="${k === viewTf ? 'is-on' : ''}">${TF[k][1]}</button>`).join('')}</div>
        <span class="rpa-when" id="rpaWhen"></span>
        <span class="rpa-bal"><small>Solde</small><b id="rpaBal"></b><i id="rpaPnl"></i></span>
        <button type="button" class="rpa-btn2" data-act="export">Envoyer vers Backtesting</button>
      </header>
      <div class="rpa-main">
        <div class="rpa-chartwrap"><div id="rpaChart" class="rpa-chart"><div class="rpa-load">Chargement des bougies…</div></div>
          <div class="rpa-player" role="group" aria-label="Lecture">
            <button type="button" data-act="play" aria-label="Lecture / pause" id="rpaPlay">▶</button>
            <button type="button" data-act="step" aria-label="Bougie suivante">⏭</button>
            <select id="rpaSpeed" aria-label="Vitesse">${[1, 2, 5, 10, 25].map((v) => `<option value="${v}">${v}x</option>`).join('')}</select>
            <span class="rpa-step">pas : ${TF[S.tf][1]}</span>
            <input type="date" id="rpaGo" aria-label="Aller à une date"><button type="button" data-act="go">Aller</button>
          </div></div>
        <aside class="rpa-side">
          <section class="rpa-order">
            <div class="rpa-sides"><button type="button" data-side="buy" class="is-on">Acheter</button><button type="button" data-side="sell">Vendre</button></div>
            <div class="rpa-kind"><button type="button" data-kind="market" class="is-on">Marché</button><button type="button" data-kind="limit">Limite</button></div>
            <label class="rpa-f" id="rpaEntryF" hidden><span>Prix d’entrée</span><input id="rpaEntry" inputmode="decimal"></label>
            <label class="rpa-f"><span>Risque (%)</span><input id="rpaRisk" inputmode="decimal" value="${S.risk}"></label>
            <div class="rpa-row"><label class="rpa-f"><span>SL</span><input id="rpaSl" inputmode="decimal"></label><label class="rpa-f"><span>TP</span><input id="rpaTp" inputmode="decimal"></label></div>
            <p class="rpa-calc" id="rpaCalc"></p>
            <button type="button" class="rpa-go" id="rpaSend">Acheter au marché</button>
          </section>
          <div class="rpa-tabs"><button type="button" data-tab="pos" class="is-on">Positions</button><button type="button" data-tab="journal">Journal</button><button type="button" data-tab="stats">Stats</button></div>
          <section class="rpa-list" id="rpaList"></section>
        </aside>
      </div></div>`;
    bind();
    try {
      const ms = TF[S.tf][0];
      await store.ensure(S.tf, S.cursor - 400 * ms, Math.min(S.end, S.cursor + 3000 * ms));
      await mountChart();
    } catch (e) { $('#rpaChart').innerHTML = `<div class="rpa-load">${esc(e.message)}</div>`; }
    paintAll();
  }

  async function mountChart() {
    const el = $('#rpaChart');
    const bars = await barsFor(viewTf);
    if (chart) { try { chart.destroy && chart.destroy(); } catch (e) { /* tant pis */ } chart = null; }
    el.innerHTML = '';
    if (!bars.length) { el.innerHTML = '<div class="rpa-load">Pas de bougies sur cette période (marché fermé ou paire inconnue).</div>'; return; }
    const { Vela } = await import('https://esm.sh/@luxalgo/vela@0.6.21');
    chart = new Vela(el, { symbol: S.symbol, timeframe: VELA_TF[viewTf], data: bars.map(toVela), theme: 'dark', drawings: true, volume: false });
    try { chart.renderer.applyConfig({ candles: { upColor: '#089981', downColor: '#f23645', wickUpColor: '#089981', wickDownColor: '#f23645' }, timeScale: { timezone: 'Europe/Paris' } }); } catch (e) { /* défaut */ }
    core = chart.renderer && chart.renderer.renderer;
    try { await chart.ready(); } catch (e) { /* déjà prêt */ }
    drawLines();
  }
  // Bougies visibles à l'unité affichée, jusqu'au curseur (jamais au-delà : pas de triche avec le futur).
  async function barsFor(tf) {
    const base = S.tf, cur = S.cursor;
    if (TF_ORDER.indexOf(tf) >= TF_ORDER.indexOf(base)) {
      const b = store.get(base).bars.filter((x) => x[0] + TF[base][0] <= cur);
      return tf === base ? b : aggregate(b, tf, cur);
    }
    const ms = TF[tf][0];
    const bars = await store.ensure(tf, cur - 1500 * ms, cur);
    return bars.filter((x) => x[0] + ms <= cur);
  }
  const lastBase = () => { const b = store.get(S.tf).bars; let i = b.length - 1; while (i >= 0 && b[i][0] + TF[S.tf][0] > S.cursor) i--; return b[i] || null; };
  const price = () => { const b = lastBase(); return b ? b[4] : null; };

  // Avance d'une bougie de base : ordres et positions vérifiés sur cette bougie, puis graphique mis à jour.
  async function step() {
    const ms = TF[S.tf][0], s = store.get(S.tf);
    if (S.cursor >= S.end) { stop(); toast('Fin de la période.'); return false; }
    if (s.to - S.cursor < 500 * ms && s.to < S.end) store.ensure(S.tf, s.to, Math.min(S.end, s.to + 4000 * ms)).catch(() => {});
    const next = s.bars.find((x) => x[0] + ms > S.cursor);
    if (!next) { if (s.busy) { await s.busy; return step(); } S.cursor = S.end; stop(); return false; }
    S.cursor = next[0] + ms;
    fill(next);
    const vb = await barsFor(viewTf);
    const lb = vb[vb.length - 1];
    if (core && lb) { try { core.updateBar(toVela(lb)); } catch (e) { try { core.setBars(vb.map(toVela), { preserveView: true }); } catch (x) { /* tant pis */ } } }
    paintAll();
    return true;
  }
  function fill(b) {
    const [, , h, l] = b;
    S.orders = S.orders.filter((o) => {
      if (o.status === 'pending') {
        if ((o.side === 'buy' && l <= o.entry) || (o.side === 'sell' && h >= o.entry)) { o.status = 'open'; o.openAt = b[0]; }
        return true;
      }
      return o.status === 'open';
    });
    S.orders.forEach((o) => {
      if (o.status !== 'open') return;
      const hitSl = o.side === 'buy' ? l <= o.sl : h >= o.sl;
      const hitTp = o.tp != null && (o.side === 'buy' ? h >= o.tp : l <= o.tp);
      if (hitSl) close(o, o.sl, Math.abs(o.sl - o.entry) < 1e-12 ? 'BE' : 'SL', b[0]);
      else if (hitTp) close(o, o.tp, 'TP', b[0]);
    });
    S.orders = S.orders.filter((o) => o.status === 'open' || o.status === 'pending');
  }
  function rrOf(o, exit) { const r = Math.abs(o.entry - o.sl0); return r ? ((o.side === 'buy' ? exit - o.entry : o.entry - exit) / r) : 0; }
  function close(o, exit, why, at) {
    const rr = rrOf(o, exit), pnl = o.riskAmt * rr;
    S.balance += pnl;
    o.status = 'closed';
    S.trades.push({ side: o.side, entry: o.entry, sl: o.sl0, tp: o.tp, exit, result: why === 'manual' ? (rr > 0.05 ? 'TP' : rr < -0.05 ? 'SL' : 'BE') : why, rr: Math.round(rr * 100) / 100, pnl, risk: o.risk, open: o.openAt, close: at || S.cursor });
    save();
  }

  // ---------------------------------------------------------------- ordres
  let side = 'buy', kind = 'market', userLevels = false; // SL / TP proposés suivent le prix tant que le membre ne les a pas touchés
  function defaults() {
    const b = store.get(S.tf).bars.filter((x) => x[0] + TF[S.tf][0] <= S.cursor).slice(-15);
    if (b.length < 2) return;
    const atr = b.slice(1).reduce((s, x, i) => s + Math.max(x[2] - x[3], Math.abs(x[2] - b[i][4]), Math.abs(x[3] - b[i][4])), 0) / (b.length - 1);
    const p = kind === 'limit' && Number($('#rpaEntry').value) ? Number($('#rpaEntry').value) : price(), d = dec(S.symbol);
    const sl = side === 'buy' ? p - atr * 1.5 : p + atr * 1.5, tp = side === 'buy' ? p + atr * 3 : p - atr * 3;
    $('#rpaSl').value = sl.toFixed(d); $('#rpaTp').value = tp.toFixed(d);
    if (kind === 'limit' && !$('#rpaEntry').value) $('#rpaEntry').value = p.toFixed(d);
    calc();
  }
  function calc() {
    const p = kind === 'limit' ? Number($('#rpaEntry').value) : price();
    const sl = Number($('#rpaSl').value), tp = Number($('#rpaTp').value), risk = Number(String($('#rpaRisk').value).replace(',', '.'));
    const r = Math.abs(p - sl), rr = r && tp ? Math.abs(tp - p) / r : null;
    $('#rpaCalc').innerHTML = p && sl && risk > 0 ? `Risque <b>${money(S.balance * risk / 100)}</b>${rr ? ` · R:R <b>${fr(rr, 2)}</b>` : ''}` : '';
    $('#rpaSend').textContent = `${side === 'buy' ? 'Acheter' : 'Vendre'} ${kind === 'market' ? 'au marché' : 'à cours limité'}`;
    $('#rpaSend').className = 'rpa-go' + (side === 'sell' ? ' is-sell' : '');
  }
  function send() {
    const p = kind === 'limit' ? Number(String($('#rpaEntry').value).replace(',', '.')) : price();
    const sl = Number(String($('#rpaSl').value).replace(',', '.')), tpv = String($('#rpaTp').value).trim(), tp = tpv ? Number(tpv.replace(',', '.')) : null;
    const risk = Number(String($('#rpaRisk').value).replace(',', '.'));
    if (!(p > 0) || !(sl > 0) || !(risk > 0)) return toast('Indique le risque et le SL.');
    if ((side === 'buy' && sl >= p) || (side === 'sell' && sl <= p)) return toast('Le SL doit être sous l’entrée à l’achat, au-dessus à la vente.');
    if (tp != null && ((side === 'buy' && tp <= p) || (side === 'sell' && tp >= p))) return toast('Le TP doit être au-dessus de l’entrée à l’achat, en dessous à la vente.');
    userLevels = false;
    S.orders.push({ id: Date.now(), side, entry: p, sl, sl0: sl, tp, risk, riskAmt: S.balance * risk / 100, status: kind === 'market' ? 'open' : 'pending', openAt: S.cursor });
    save(); paintAll();
  }
  function act(id, what) {
    const o = S.orders.find((x) => x.id === id);
    if (!o) return;
    if (what === 'close') { if (o.status === 'pending') S.orders = S.orders.filter((x) => x !== o); else { close(o, price(), 'manual'); S.orders = S.orders.filter((x) => x !== o); } }
    if (what === 'be' && o.status === 'open') o.sl = o.entry;
    save(); paintAll();
  }

  // ---------------------------------------------------------------- affichage
  let tab = 'pos';
  function stats() {
    const t = S.trades, wins = t.filter((x) => x.rr > 0.05), losses = t.filter((x) => x.rr < -0.05);
    const gw = wins.reduce((s, x) => s + x.pnl, 0), gl = -losses.reduce((s, x) => s + x.pnl, 0);
    let bal = S.capital, peak = bal, dd = 0; const curve = [bal];
    t.forEach((x) => { bal += x.pnl; peak = Math.max(peak, bal); dd = Math.max(dd, (peak - bal) / peak); curve.push(bal); });
    return { n: t.length, wr: wins.length + losses.length ? wins.length / (wins.length + losses.length) : 0, pf: gl ? gw / gl : null, R: t.reduce((s, x) => s + x.rr, 0), dd, curve };
  }
  function spark(curve) {
    if (curve.length < 2) return '';
    const min = Math.min(...curve), max = Math.max(...curve), W = 300, H = 70;
    const pts = curve.map((v, i) => `${(i / (curve.length - 1) * W).toFixed(1)},${(H - (max > min ? (v - min) / (max - min) : 0.5) * H).toFixed(1)}`).join(' ');
    return `<svg viewBox="0 0 ${W} ${H}" class="rpa-spark" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${curve[curve.length - 1] >= curve[0] ? '#33e6a6' : '#ff4d5e'}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
  }
  function paintAll() {
    if (!S) return;
    const p = price(), d = dec(S.symbol);
    const floating = S.orders.filter((o) => o.status === 'open').reduce((s, o) => s + (p ? o.riskAmt * rrOf(o, p) : 0), 0);
    const w = $('#rpaWhen'); if (w) w.textContent = when(S.cursor);
    const bal = $('#rpaBal'); if (bal) bal.textContent = money(S.balance);
    const pn = $('#rpaPnl'); if (pn) { const pct = (S.balance + floating - S.capital) / S.capital * 100; pn.textContent = `${pct >= 0 ? '+' : ''}${fr(pct, 2)} %`; pn.className = pct >= 0 ? 'is-up' : 'is-down'; }
    const list = $('#rpaList');
    if (list) {
      if (tab === 'pos') list.innerHTML = S.orders.length ? S.orders.map((o) => `<div class="rpa-pos is-${o.side}"><div><b>${o.side === 'buy' ? 'Achat' : 'Vente'}</b>${o.status === 'pending' ? '<em>en attente</em>' : ''}<small>Entrée ${o.entry.toFixed(d)} · SL ${o.sl.toFixed(d)}${o.tp ? ' · TP ' + o.tp.toFixed(d) : ''} · ${String(o.risk).replace('.', ',')} %</small></div>
          ${o.status === 'open' && p ? `<span class="${rrOf(o, p) >= 0 ? 'is-up' : 'is-down'}">${money(o.riskAmt * rrOf(o, p))}</span>` : ''}
          <div class="rpa-pos__a">${o.status === 'open' ? `<button type="button" data-be="${o.id}">BE</button>` : ''}<button type="button" data-close="${o.id}">${o.status === 'pending' ? 'Annuler' : 'Clôturer'}</button></div></div>`).join('') : '<p class="rpa-empty">Aucune position. Place un ordre au-dessus.</p>';
      if (tab === 'journal') list.innerHTML = S.trades.length ? `<ul class="rpa-jr">${S.trades.slice().reverse().map((t) => `<li class="is-${t.rr > 0.05 ? 'win' : t.rr < -0.05 ? 'loss' : 'flat'}"><b>${t.side === 'buy' ? 'Achat' : 'Vente'} · ${t.result}</b><span>${t.rr > 0 ? '+' : ''}${fr(t.rr, 2)} R · ${money(t.pnl)}</span><small>${when(t.open)} → ${when(t.close)}</small></li>`).join('')}</ul>` : '<p class="rpa-empty">Les trades clôturés arrivent ici.</p>';
      if (tab === 'stats') { const x = stats(); list.innerHTML = `<div class="rpa-st">${[['Trades', x.n], ['Win rate', fr(x.wr * 100, 1) + ' %'], ['Profit factor', x.pf == null ? '—' : fr(x.pf, 2)], ['Total R', (x.R >= 0 ? '+' : '') + fr(x.R, 2)], ['DD max', fr(x.dd * 100, 1) + ' %'], ['Résultat', money(S.balance - S.capital)]].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>${spark(x.curve)}`; }
    }
    if (p && (!userLevels || !$('#rpaSl').value)) defaults();
    calc();
    drawLines();
  }
  // Lignes des positions sur le graphique (entrée, SL, TP)
  function drawLines() {
    if (!chart || !chart.drawings) return;
    lines.forEach((id) => { try { chart.drawings.remove(id); } catch (e) { /* déjà retirée */ } });
    lines = [];
    const t = S.cursor;
    S.orders.forEach((o) => [[o.entry, o.status === 'pending' ? '#e8b339' : '#9b9ba1', o.status === 'pending' ? 'Limite' : 'Entrée'], [o.sl, '#ff4d5e', 'SL'], [o.tp, '#33e6a6', 'TP']].forEach(([v, color, txt]) => {
      if (v == null) return;
      try { const dr = chart.drawings.add('hline', { anchors: [{ time: t, price: v }], style: { color, lineWidth: 1 }, text: txt }); if (dr && dr.id) lines.push(dr.id); } catch (e) { /* outil indisponible */ }
    }));
  }
  function save() {
    const l = loadAll().filter((x) => x.id !== S.id);
    l.unshift(S);
    saveAll(l);
  }
  function stop() { clearInterval(timer); timer = null; const b = $('#rpaPlay'); if (b) b.textContent = '▶'; }
  function toast(t) { const el = document.createElement('div'); el.className = 'rpa-toast'; el.textContent = t; document.body.appendChild(el); setTimeout(() => el.remove(), 2600); }

  // Envoi vers Backtesting : chaque trade clôturé devient une ligne (date, résultat, R, sens, horaires, paire).
  async function exportBt() {
    if (!S.trades.length) return toast('Aucun trade clôturé à envoyer.');
    if (!window.CHESTBacktests) return toast('Backtesting indisponible.');
    await CHESTBacktests.ready();
    const iso = (ms) => new Date(ms).toISOString();
    const trades = S.trades.map((t) => ({ date: iso(t.close), open: iso(t.open), close: iso(t.close), result: t.result, rr: t.rr, order: t.side === 'buy' ? 'BUY' : 'SELL', extra: { Paire: S.symbol, Source: 'Replay' } }));
    const rec = CHESTBacktests.add({ title: S.name || `Replay ${S.symbol} ${TF[S.tf][1]}`, description: `Session de replay du ${ymd(S.start)} au ${ymd(S.end)}.`, capital: S.capital, pfCapital: 100000,
      cp: { mode: 'manual', risk: S.risk, tiers: [], rules: [] }, pf: null, trades });
    try { await CHESTBacktests.flush(); } catch (e) { /* envoyé plus tard */ }
    location.href = 'backtest-view.html?id=' + encodeURIComponent(rec.id); // le shell suit la page de l'iframe
  }

  let bound = false;
  function bind() {
    if (bound) return;
    bound = true;
    root.addEventListener('click', async (e) => {
      const t = e.target;
      const a = t.closest('[data-act]');
      if (a) {
        const k = a.dataset.act;
        if (k === 'back') { stop(); save(); S = null; setup(); return; }
        if (k === 'step') { stop(); await step(); return; }
        if (k === 'play') { if (timer) stop(); else { a.textContent = '⏸'; timer = setInterval(() => { step(); }, Math.max(40, 900 / speed)); } return; }
        if (k === 'go') { const v = $('#rpaGo').value; if (!v) return; const target = Date.parse(v + 'T00:00:00Z'); if (target <= S.cursor) return toast('On ne revient pas en arrière : choisis une date plus loin.'); stop(); toast('Avance rapide…'); let n = 0; while (S.cursor < target && n < 20000) { if (!(await step())) break; n++; } return; }
        if (k === 'export') { exportBt(); return; }
      }
      const tfb = t.closest('[data-tf]');
      if (tfb) { viewTf = tfb.dataset.tf; root.querySelectorAll('[data-tf]').forEach((x) => x.classList.toggle('is-on', x === tfb)); await mountChart(); return; }
      const sb = t.closest('[data-side]'); if (sb) { userLevels = false; side = sb.dataset.side; root.querySelectorAll('[data-side]').forEach((x) => x.classList.toggle('is-on', x === sb)); defaults(); return; }
      const kb = t.closest('[data-kind]'); if (kb) { kind = kb.dataset.kind; root.querySelectorAll('[data-kind]').forEach((x) => x.classList.toggle('is-on', x === kb)); $('#rpaEntryF').hidden = kind !== 'limit'; $('#rpaEntry').value = ''; defaults(); return; }
      if (t.id === 'rpaSend') { send(); return; }
      const tb = t.closest('[data-tab]'); if (tb) { tab = tb.dataset.tab; root.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('is-on', x === tb)); paintAll(); return; }
      const cb = t.closest('[data-close]'); if (cb) { act(Number(cb.dataset.close), 'close'); return; }
      const bb = t.closest('[data-be]'); if (bb) { act(Number(bb.dataset.be), 'be'); }
    });
    root.addEventListener('input', (e) => { if (['rpaSl', 'rpaTp', 'rpaEntry'].includes(e.target.id)) userLevels = true; if (['rpaSl', 'rpaTp', 'rpaRisk', 'rpaEntry'].includes(e.target.id)) calc(); });
    root.addEventListener('change', (e) => { if (e.target.id === 'rpaSpeed') { speed = Number(e.target.value); if (timer) { stop(); $('#rpaPlay').click(); } } });
    document.addEventListener('keydown', (e) => { if (!S || /INPUT|SELECT|TEXTAREA/.test(document.activeElement && document.activeElement.tagName)) return; if (e.key === 'ArrowRight') { e.preventDefault(); step(); } if (e.key === ' ') { e.preventDefault(); $('#rpaPlay').click(); } });
  }

  window.CHESTReplay = { mount(el) { root = el; setup(); } };
})();
