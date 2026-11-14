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
    if (DEMO) {
      await new Promise((r) => setTimeout(r, 120));
      const q = new URLSearchParams(path.split('?')[1] || '');
      if (path.startsWith('/replay/me')) return { unlimited: true, freeSession: null };
      if (path.startsWith('/replay/bars')) return demoBars(q.get('tf'), Number(q.get('from')), Number(q.get('to')));
      throw new Error('Scanner indisponible dans la démonstration.');
    }
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
  // Accueil v3 (2026-11-14) : esprit Backtesting 2.0 — mot fantôme, héros centré sur une session (onglets), grand
  // résultat, bandeau de chiffres, courbe pleine largeur ; 02 nouvelle session (barre de réglages façon Stratégies),
  // 03 la bibliothèque en chiffres, 04 les sessions en cartes avec leur courbe.
  let heroId = null, ME = { unlimited: true, freeSession: null };
  function area(curve, w, h, start) {
    if (curve.length < 2) return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="M0 ${h * 0.6}H${w}" stroke="rgba(255,255,255,.14)" stroke-dasharray="3 5" vector-effect="non-scaling-stroke"/></svg>`;
    const min = Math.min(start, ...curve), max = Math.max(start, ...curve), k = max > min ? (h - 12) / (max - min) : 0;
    const y = (v) => (h - 6 - (v - min) * k).toFixed(1), x = (i) => (i / (curve.length - 1) * w).toFixed(1);
    const up = curve[curve.length - 1] >= start, c = up ? '51,230,166' : '255,77,94', id = 'g' + Math.random().toString(36).slice(2, 8);
    const line = curve.map((v, i) => `${i ? 'L' : 'M'}${x(i)} ${y(v)}`).join('');
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(${c},.32)"/><stop offset="1" stop-color="rgba(${c},0)"/></linearGradient></defs>
      <path d="M0 ${y(start)}H${w}" stroke="rgba(255,255,255,.16)" stroke-dasharray="2 5" vector-effect="non-scaling-stroke"/>
      <path d="${line}L${w} ${h}L0 ${h}Z" fill="url(#${id})"/><path d="${line}" fill="none" stroke="rgb(${c})" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
  }
  function fullStats(s) {
    const t = s.trades || [], wins = t.filter((x) => x.rr > 0.05), losses = t.filter((x) => x.rr < -0.05);
    const gw = wins.reduce((a, x) => a + x.pnl, 0), gl = -losses.reduce((a, x) => a + x.pnl, 0);
    let b = s.capital, peak = b, dd = 0; const curve = [b];
    t.forEach((x) => { b += x.pnl; peak = Math.max(peak, b); dd = Math.max(dd, (peak - b) / peak); curve.push(b); });
    return { n: t.length, wr: wins.length + losses.length ? wins.length / (wins.length + losses.length) : 0, pf: gl ? gw / gl : null, dd, pct: (s.balance - s.capital) / s.capital * 100, curve };
  }
  const pctTxt = (p) => (p >= 0 ? '+' : '−') + fr(Math.abs(p), Math.abs(p) >= 100 ? 0 : 1) + ' %';
  const mon = (ms) => new Date(ms).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
  const ago = (ms) => { const d = Math.floor((Date.now() - ms) / 864e5); return d <= 0 ? 'Aujourd’hui' : d === 1 ? 'Hier' : `Il y a ${d} j`; };
  function home() {
    const scanners = (window.CHESTScanners ? CHESTScanners.list() : []).map((s) => [s.id, s.name]);
    const all = loadAll().map((s) => Object.assign({ st: fullStats(s) }, s));
    const ranked = all.filter((s) => s.st.n).sort((a, b) => b.st.pct - a.st.pct);
    const best = ranked[0] || null;
    if (!all.find((s) => s.id === heroId)) heroId = (best || all[0] || {}).id || null;
    const H = all.find((s) => s.id === heroId) || null;
    const name = (s) => esc(s.name || s.symbol + ' ' + TF[s.tf][1]);
    const trades = all.reduce((n, s) => n + s.st.n, 0);
    const last = all.slice().sort((a, b) => (b.updated || b.created || 0) - (a.updated || a.created || 0))[0];
    const freeUsed = !ME.unlimited && !!ME.freeSession;
    const today = Date.now();
    const seg = (n, opts, on) => `<div class="rpx-seg" data-seg="${n}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${String(v) === String(on) ? 'is-on' : ''}">${l}</button>`).join('')}</div>`;
    const heroHtml = H ? `
        <div class="rpx-tabs" role="tablist">${all.slice(0, 6).map((s) => `<button type="button" role="tab" data-hero="${esc(s.id)}" class="${s.id === H.id ? 'is-on' : ''}">${name(s)}</button>`).join('')}</div>
        <h1>${name(H)}${best && H.id === best.id && H.st.n ? '<span class="rpx-badge">Meilleure session</span>' : ''}</h1>
        <p class="rpx-sub">${esc(H.symbol)} · ${TF[H.tf][1]} · rejouée jusqu’au ${when(H.cursor)}${H.scanner ? ' · avec scanner' : ''}</p>
        <div class="rpx-big ${H.st.pct >= 0 ? 'is-up' : 'is-down'}">${H.st.n ? pctTxt(H.st.pct) : '0 trade'}</div>
        <p class="rpx-meta">de <b>${money(H.capital)}</b> à <b>${money(H.balance)}</b> · ${mon(H.start)} → ${mon(H.end)}</p>
        <div class="rpx-strip"><div><span>Profit factor</span><b class="is-up">${H.st.pf == null ? '—' : fr(H.st.pf, 2)}</b></div><div><span>Taux de réussite</span><b>${H.st.n ? fr(H.st.wr * 100, 0) + ' %' : '—'}</b></div><div><span>Drawdown max</span><b class="is-down">${H.st.n ? '−' + fr(H.st.dd * 100, 1) + ' %' : '—'}</b></div><div><span>Trades</span><b>${H.st.n}</b></div></div>
        <div class="rpx-acts"><button type="button" class="rpx-cta" data-open="${esc(H.id)}">Reprendre la session</button><button type="button" class="rpx-ghostbtn" data-go-new>+ Nouvelle session</button></div>`
      : `<h1>REPLAY</h1><p class="rpx-sub">Rejoue n’importe quelle paire, sur n’importe quelle période, bougie par bougie.</p>
        <div class="rpx-big is-brand">Rejoue le passé.</div>
        <p class="rpx-meta">Prends tes trades comme en direct, avec ton scanner si tu veux, puis envoie la session dans Backtesting.</p>
        <div class="rpx-acts"><button type="button" class="rpx-cta" data-go-new>Lancer ma première session</button></div>`;
    root.innerHTML = `<div class="rpx">
      <div class="rpx-light" aria-hidden="true"></div><div class="rpx-word" aria-hidden="true">Replay</div>
      <header class="rpx-hero">${!ME.unlimited ? `<span class="rpx-free">${freeUsed ? 'Ton replay d’essai est utilisé' : '1 replay d’essai offert avec ton accès'}</span>` : ''}${heroHtml}</header>
      <div class="rpx-curve">${H ? area(H.st.curve, 1200, 230, H.capital) : area([], 1200, 230, 0)}<span>${H && H.st.n ? 'Solde trade après trade · capital de départ en pointillés' : 'Ta courbe s’affichera ici dès ton premier trade'}</span></div>

      <section class="rpx-sec" id="rpaNew"><div class="rpx-h"><span class="rpx-k">02 — Nouvelle session</span><span class="rpx-note">Les bougies arrivent une à une : la suite reste cachée.</span></div>
        ${freeUsed && !ME.unlimited ? `<div class="rpx-up"><div><b>Ton replay d’essai est utilisé.</b><span>Avec CHEST Premium, rejoue autant de sessions que tu veux, sur toutes les paires, avec les scanners.</span></div><a class="rpx-cta" href="/paiement?offre=premium4" target="_top">Passer à Premium</a></div>` : `
        <form class="rpx-form" id="rpaForm" novalidate>
          <div class="rpx-col">
            <label class="rpx-row"><span>Paire</span><input name="symbol" list="rpaPairs" value="XAUUSD" maxlength="12" autocapitalize="characters"><datalist id="rpaPairs">${PAIRS.map((p) => `<option value="${p}">`).join('')}</datalist></label>
            <div class="rpx-row"><span>Unité de temps</span>${seg('tf', ['1', '5', '15', '30', '60', '240'].map((k) => [k, TF[k][1]]), '15')}</div>
            <div class="rpx-row"><span>Période</span><div class="rpx-dates"><input name="start" type="date" value="${ymd(today - 180 * 864e5)}" max="${ymd(today - 864e5)}" aria-label="Début"><i>→</i><input name="end" type="date" value="${ymd(today - 864e5)}" max="${ymd(today)}" aria-label="Fin"></div></div>
            <div class="rpx-row"><span>Raccourcis</span><div class="rpx-chips">${[[30, '1 mois'], [90, '3 mois'], [180, '6 mois'], [365, '1 an'], [0, 'Au hasard']].map(([d, l]) => `<button type="button" data-span="${d}">${l}</button>`).join('')}</div></div>
          </div>
          <div class="rpx-col">
            <div class="rpx-row"><span>Capital</span>${seg('cap', [5000, 10000, 25000, 50000, 100000].map((v) => [v, v / 1000 + 'k $']), 10000)}</div>
            <div class="rpx-row"><span>Risque par trade</span>${seg('risk', [0.25, 0.5, 1, 2].map((v) => [v, String(v).replace('.', ',') + ' %']), 1)}</div>
            <label class="rpx-row"><span>Scanner</span><select name="scanner"><option value="">Aucun, je trade à l’œil</option>${scanners.map(([id, n]) => `<option value="${esc(id)}">${esc(n)}</option>`).join('')}</select></label>
            <label class="rpx-row"><span>Nom</span><input name="name" maxlength="60" placeholder="Facultatif"></label>
          </div>
          <div class="rpx-foot"><p class="rpx-sum" id="rpaSum"></p><p class="rpx-err" id="rpaErr" role="alert"></p><button class="rpx-cta" type="submit">Lancer le replay</button></div>
        </form>`}
      </section>

      <section class="rpx-sec"><div class="rpx-h"><span class="rpx-k">03 — Tes replays en chiffres</span><span class="rpx-note">Toutes sessions confondues.</span></div>
        <div class="rpx-band"><div><span>Sessions</span><b>${all.length}</b><small>${ME.unlimited ? 'sans limite' : freeUsed ? 'essai utilisé' : '1 offerte'}</small></div>
          <div><span>Trades rejoués</span><b>${trades}</b><small>tous replays</small></div>
          <div><span>Meilleur résultat</span><b class="${best && best.st.pct >= 0 ? 'is-up' : best ? 'is-down' : ''}">${best ? pctTxt(best.st.pct) : '—'}</b><small>${best ? name(best) : 'aucun trade'}</small></div>
          <div><span>Dernière session</span><b>${last ? ago(last.updated || last.created) : '—'}</b><small>${last ? name(last) : 'aucune'}</small></div></div>
      </section>

      <section class="rpx-sec"><div class="rpx-h"><span class="rpx-k">04 — Sessions</span><span class="rpx-note">Triées par résultat</span></div>
        <div class="rpx-cards">${all.slice().sort((a, b) => b.st.pct - a.st.pct).map((s) => `<article class="rpx-card${best && s.id === best.id ? ' is-best' : ''}">
            <button type="button" class="rpx-card__hit" data-open="${esc(s.id)}" aria-label="Reprendre ${name(s)}"></button>
            <header><div><b>${name(s)}${best && s.id === best.id ? ' <i>★</i>' : ''}</b><small>${esc(s.symbol)} · ${TF[s.tf][1]}</small></div><button type="button" class="rpx-del" data-del="${esc(s.id)}" aria-label="Supprimer la session">×</button></header>
            <div class="rpx-card__p ${s.st.pct >= 0 ? 'is-up' : 'is-down'}">${s.st.n ? pctTxt(s.st.pct) : '0 trade'}<small>${mon(s.start)} → ${mon(s.end)}</small></div>
            <div class="rpx-card__c">${area(s.st.curve, 300, 80, s.capital)}</div>
            <footer><span><b>${s.st.n}</b> trades</span><span><b>${fr(s.st.wr * 100, 0)} %</b> réussite</span><span class="is-down"><b>${s.st.n ? '−' + fr(s.st.dd * 100, 1) + ' %' : '—'}</b> DD max</span></footer></article>`).join('')}
          <button type="button" class="rpx-add" data-go-new><i>+</i><b>Nouvelle session</b><span>Une paire, une période, et c’est parti.</span></button></div>
      </section>
    </div>`;
    root.querySelectorAll('[data-hero]').forEach((b) => b.addEventListener('click', () => { heroId = b.dataset.hero; home(); }));
    root.querySelectorAll('[data-go-new]').forEach((b) => b.addEventListener('click', () => { const n = $('#rpaNew'); if (n) n.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); const i = root.querySelector('#rpaForm input[name="name"]'); if (i) setTimeout(() => i.focus({ preventScroll: true }), 400); }));
    root.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => { const s = loadAll().find((x) => x.id === b.dataset.open); if (s) play(s); }));
    root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); if (!confirm('Supprimer cette session ?')) return; saveAll(loadAll().filter((x) => x.id !== b.dataset.del)); home(); }));
    const f = $('#rpaForm');
    if (!f) return;
    root.querySelectorAll('[data-seg]').forEach((g) => g.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; g.querySelectorAll('button').forEach((x) => x.classList.toggle('is-on', x === b)); }));
    root.querySelectorAll('[data-span]').forEach((b) => b.addEventListener('click', () => {
      let d = Number(b.dataset.span), end = Date.now() - 864e5;
      if (!d) { d = 90; end = Date.now() - 864e5 - Math.floor(Math.random() * 4 * 365) * 864e5; }
      f.end.value = ymd(end); f.start.value = ymd(end - d * 864e5);
    }));
    const sum = () => { const on = (n) => (root.querySelector(`[data-seg="${n}"] .is-on`) || {}).textContent || ''; const d = (v) => (v ? new Date(v + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '…');
      const el = $('#rpaSum'); if (el) el.innerHTML = `<b>${esc(f.symbol.value.toUpperCase() || '…')}</b> · ${on('tf')} · ${d(f.start.value)} → ${d(f.end.value)} · ${on('cap')} · ${on('risk')}${f.scanner.value ? ' · ' + esc(f.scanner.selectedOptions[0].textContent) : ''}`; };
    f.addEventListener('input', sum); f.addEventListener('change', sum); f.addEventListener('click', () => setTimeout(sum, 0)); sum();
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
          const d = await api(`/replay/bars?symbol=${encodeURIComponent(symbol)}&tf=${tf}&from=${Math.round(a)}&to=${Math.round(b)}&session=${encodeURIComponent(S ? S.id : '')}`);
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
  // Démonstration de la landing (js/demo-mode.js, 2026-11-14) : bougies de l'or simulées (toujours les mêmes),
  // deux sessions d'exemple avec leurs trades ; rien n'est cliquable dans l'écran de trading.
  const DEMO = !!window.CHEST_DEMO;
  const DEMO_T0 = Date.UTC(2026, 8, 1);
  function demoPrice(t) {
    const k = (t - DEMO_T0) / 9e5;
    return 2650 + Math.sin(k / 37) * 18 + Math.sin(k / 9.3) * 5 + Math.sin(k / 211) * 40 + k * 0.012;
  }
  function demoBars(tf, from, to) {
    const ms = TF[tf][0], out = [];
    for (let t = Math.ceil(from / ms) * ms; t <= to; t += ms) {
      const o = demoPrice(t), c = demoPrice(t + ms), n = Math.abs(Math.sin(t / 7e5)) * 1.6 + 0.4;
      const bar = [t, o, Math.max(o, c) + n, Math.min(o, c) - n * 0.8, c];
      if (tradable(bar)) out.push(bar);
    }
    return { bars: out };
  }
  function demoSessions() {
    if (loadAll().length) return;
    const ms = 9e5, C = Date.UTC(2026, 9, 14, 14, 0);
    // chaque trade suit le vrai mouvement des bougies simulées : gagnant = dans le sens du marché, perdant = à contre-sens
    const mk = (open, _side, risk, rrTarget, closeAfter, lots) => {
      const win = closeAfter > 0, n = Math.abs(closeAfter), e = demoPrice(open), fut = demoPrice(open + n * ms), up = fut > e;
      const side = win ? (up ? 'buy' : 'sell') : (up ? 'sell' : 'buy'), r = Math.max(1.5, Math.abs(fut - e) / (win ? rrTarget : 1));
      const sl = side === 'buy' ? e - r : e + r, tp = side === 'buy' ? e + r * rrTarget : e - r * rrTarget;
      const exit = win ? tp : sl, rr = win ? rrTarget : -1;
      return { side, entry: e, sl, slEnd: sl, tp, exit, lots, result: win ? 'TP' : 'SL', rr, pnl: rr * risk * 100, risk, open, close: open + Math.abs(closeAfter) * ms };
    };
    const t1 = [mk(C - 260 * ms, 'buy', 1, 2.5, 30, 0.24), mk(C - 190 * ms, 'sell', 1, 2, -12, 0.24), mk(C - 120 * ms, 'buy', 1, 3, 40, 0.24), mk(C - 45 * ms, 'buy', 1, 2, 22, 0.24)];
    const bal = (t) => 10000 + t.reduce((a, x) => a + x.pnl, 0);
    const sess = [
      { id: 'rp_demo1', name: 'Or · reprise de tendance', symbol: 'XAUUSD', tf: '15', start: Date.UTC(2026, 8, 1), end: Date.UTC(2026, 10, 1), capital: 10000, risk: 1, scanner: null, trades: t1, balance: bal(t1), cursor: C, indicators: [], created: Date.now() - 864e5 * 3, updated: Date.now() - 864e5,
        orders: [{ id: 1, side: 'buy', entry: demoPrice(C - 8 * ms), sl: demoPrice(C - 8 * ms) - 4.5, sl0: demoPrice(C - 8 * ms) - 4.5, tp: demoPrice(C - 8 * ms) + 11, lots: 0.22, risk: 1, status: 'open', openAt: C - 8 * ms }] },
      { id: 'rp_demo2', name: 'Or · cassures du matin', symbol: 'XAUUSD', tf: '15', start: Date.UTC(2026, 6, 1), end: Date.UTC(2026, 8, 1), capital: 10000, risk: 0.5, scanner: null, trades: t1.slice(0, 2), balance: bal(t1.slice(0, 2)), cursor: C, indicators: [], orders: [], created: Date.now() - 864e5 * 9, updated: Date.now() - 864e5 * 6 },
    ];
    saveAll(sess);
  }

  // ================================================================ session
  let S = null, chart = null, core = null, store = null, viewTf = null, timer = null, speed = 5, scanBusy = false, scanHandles = [], scanAt = 0, lastScan = null;
  let draft = null, adv = false, panel = null;
  const baseMs = () => TF[S.tf][0];
  const revealedBase = () => store.get(S.tf).bars.filter((x) => x[0] + baseMs() <= S.cursor && tradable(x));
  const lastBase = () => { const b = store.get(S.tf).bars; let i = b.length - 1; while (i >= 0 && (b[i][0] + baseMs() > S.cursor || !tradable(b[i]))) i--; return b[i] || null; };
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
      <header class="rpt-bar">
        <button type="button" class="rpt-back" data-act="home" aria-label="Retour aux sessions">‹</button>
        <div class="rpt-id"><b>${esc(S.symbol)}</b><small id="rpaWhen" class="is-mono"></small></div>
        <div class="rpt-tfs" role="group" aria-label="Unité de temps">${TF_ORDER.map((k) => `<button type="button" data-tf="${k}" class="${k === viewTf ? 'is-on' : ''}">${TF[k][1]}</button>`).join('')}</div>
        <button type="button" class="rpt-tb" data-act="ind">${IC.ind}<em>Indicateurs</em></button>
        <label class="rpt-tb rpt-goto" title="Avancer jusqu’à une date">${IC.go}<input type="date" id="rpaGo" aria-label="Avancer jusqu’à une date"></label>
        <span class="rpt-sp"></span>
        <div class="rpt-bal"><span>Solde</span><b id="rpaBal"></b><i id="rpaPnl"></i></div>
        <div class="rpt-trade" role="group" aria-label="Passer un ordre">
          <button type="button" class="rpt-sell" data-trade="sell"><small>Vendre</small><b id="rpaBid">—</b></button>
          <button type="button" class="rpt-adv" data-act="adv" aria-label="Réglages avancés de l’ordre" aria-pressed="false"><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>
          <button type="button" class="rpt-buy" data-trade="buy"><small>Acheter</small><b id="rpaAsk">—</b></button>
        </div>
        <button type="button" class="rpt-tb" data-act="export" title="Envoyer les trades dans Backtesting">${IC.stats}<em>Backtesting</em></button>
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
    try { const sc = S.scanner && window.CHESTScanners && CHESTScanners.get(S.scanner); chart.renderer.applyConfig({ candles: (sc && sc.candles) || { upColor: '#089981', downColor: '#f23645', wickUpColor: '#089981', wickDownColor: '#f23645' }, timeScale: { timezone: 'Europe/Paris' } }); } catch (e) { /* couleurs par défaut */ }
    try { await chart.ready(); } catch (e) { /* prêt */ }
    // vue de départ : les ~150 dernières bougies (les 500 restent accessibles en reculant)
    try { if (core && core.setVisibleRange && data.length) core.setVisibleRange({ from: data[Math.max(0, data.length - 150)].time, to: data[data.length - 1].time + TF[viewTf][0] * 45 }); } catch (e) { /* vue par défaut */ }
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
    S.orders.forEach((o) => { if (o.dw) setPos(o.dw, liveAnchors(o)); });
    paint();
    return true;
  }
  // Remplissage d'une bougie : ordre limite déclenché, SL puis TP (SL d'abord si les deux), puis BE automatique.
  function fill(b) {
    const [t, , h, l] = b, end = t + baseMs();
    S.orders.forEach((o) => { if (o.status === 'pending' && l <= o.entry && h >= o.entry) { o.status = 'open'; o.openAt = t; } });
    S.orders.forEach((o) => {
      if (o.status !== 'open') return;
      const hitSl = o.side === 'buy' ? l <= o.sl : h >= o.sl;
      const hitTp = o.tp != null && (o.side === 'buy' ? h >= o.tp : l <= o.tp);
      if (hitSl) { close(o, o.sl, Math.abs(o.sl - o.entry) < 1e-12 ? 'BE' : 'SL', end); return; }
      if (hitTp) { close(o, o.tp, 'TP', end); return; }
      if (o.beAt && !o.beDone) {
        const r = Math.abs(o.entry - o.sl0), lvl = o.side === 'buy' ? o.entry + o.beAt * r : o.entry - o.beAt * r;
        if (o.side === 'buy' ? h >= lvl : l <= lvl) { o.sl = o.entry; o.beDone = true; toast(`SL à l’entrée : ${fr(o.beAt, 1)} R atteint`); }
      }
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
    const tr = { side: o.side, entry: o.entry, sl: o.sl0, slEnd: o.sl, tp: o.tp, exit, lots: o.lots, result: why === 'manual' ? (rr > 0.05 ? 'TP' : rr < -0.05 ? 'SL' : 'BE') : why, rr: Math.round(rr * 100) / 100, pnl, risk: o.risk, open: o.openAt, close: at || S.cursor };
    S.trades.push(tr);
    // la position reste dessinée, figée de son ouverture à sa clôture
    if (o.dw) { setPos(o.dw, tradeAnchors(tr)); o.dw = null; }
    save();
  }
  function stop() { clearInterval(timer); timer = null; const b = $('#rpaPlay'); if (b) b.textContent = '▶'; if (S && S.scanner) refreshScan(); }

  // ---------------------------------------------------------------- ordre : traits Entrée / SL / TP, puis zones
  function atr() {
    const b = revealedBase().slice(-15);
    if (b.length < 2) return price() * 0.002;
    return b.slice(1).reduce((s, x, i) => s + Math.max(x[2] - x[3], Math.abs(x[2] - b[i][4]), Math.abs(x[3] - b[i][4])), 0) / (b.length - 1);
  }
  const unitUsd = (entry) => CONTRACT(S.symbol) * toUsd(S.symbol, entry);
  function lotsFor(riskPct, entry, sl) { const d = Math.abs(entry - sl); return d ? Math.max(0.01, Math.round(S.balance * riskPct / 100 / (d * unitUsd(entry)) * 100) / 100) : 0.01; }
  const usdOf = (lots, a, b) => Math.abs(a - b) * lots * unitUsd(a);
  const LINE = { pe: '#cfcfd4', sl: '#ff4d5e', tp: '#33e6a6' };
  let syncing = false;
  // Vendre / Acheter : trois traits horizontaux à placer (entrée au prix du marché, SL, TP), lot calculé au risque par défaut.
  function startDraft(side) {
    const p = price(); if (!p) return;
    const a = atr() * 1.5;
    const sl = side === 'buy' ? p - a : p + a, tp = side === 'buy' ? p + 2 * a : p - 2 * a;
    draft = { side, entry: p, sl, tp, risk: Number(S.risk), lots: lotsFor(S.risk, p, sl), kind: 'market', beAt: draft && draft.beAt || 0, lines: {} };
    drawDraft();
    openPanel('order', true);
  }
  function lineText(k) {
    const o = draft, d = dec(S.symbol);
    if (k === 'pe') return `${o.side === 'buy' ? 'ACHAT' : 'VENTE'} ${fr(o.lots, 2)} lot · ${o.kind === 'market' ? 'marché' : 'limite ' + o.entry.toFixed(d)}`;
    if (k === 'sl') { const u = usdOf(o.lots, o.entry, o.sl); return `SL ${o.sl.toFixed(d)} · −${money(u)} · ${fr(u / S.balance * 100, 2)} %`; }
    const u = usdOf(o.lots, o.entry, o.tp); return `TP ${o.tp.toFixed(d)} · +${money(u)} · ${fr(u / S.balance * 100, 2)} %`;
  }
  const lineSpec = (k, v) => ({ anchors: [{ time: S.cursor, price: v }], style: { lineColor: LINE[k], lineWidth: k === 'pe' ? 1 : 2, lineStyle: k === 'pe' ? 'dashed' : 'solid' }, text: { value: lineText(k), color: LINE[k], size: 12, hAlign: 'right', vAlign: 'top', bold: true } });
  function drawDraft() {
    if (!draft || !chart || !chart.drawings) return;
    syncing = true;
    ['pe', 'sl', 'tp'].forEach((k) => {
      const v = k === 'pe' ? draft.entry : draft[k];
      const id = draft.lines[k];
      if (v == null) { if (id) { try { chart.drawings.remove(id); } catch (e) { /* tant pis */ } delete draft.lines[k]; } return; }
      if (id) { try { chart.drawings.update(id, lineSpec(k, v)); return; } catch (e) { try { chart.drawings.remove(id); } catch (x) { /* tant pis */ } } }
      try { const dd = chart.drawings.add('hline', lineSpec(k, v)); draft.lines[k] = dd && (dd.id || dd); } catch (e) { /* trait indisponible */ }
    });
    syncing = false;
  }
  function clearDraftLines() { if (!draft) return; Object.values(draft.lines || {}).forEach((id) => { try { chart.drawings.remove(id); } catch (e) { /* tant pis */ } }); draft.lines = {}; }
  // Zones d'une position : de l'ouverture jusqu'à la bougie en cours (elles s'allongent pendant la lecture).
  const tpOr = (o, sl) => (o.tp != null ? o.tp : o.entry + (o.entry - sl) * 2);
  const liveAnchors = (o) => { const t0 = o.openAt, t1 = Math.max(S.cursor, t0 + baseMs() * 3); return [{ time: t0, price: o.entry }, { time: t1, price: o.sl }, { time: t1, price: tpOr(o, o.sl) }]; };
  const tradeAnchors = (t) => { const t1 = Math.max(t.close, t.open + baseMs()); return [{ time: t.open, price: t.entry }, { time: t1, price: t.slEnd != null ? t.slEnd : t.sl }, { time: t1, price: tpOr(t, t.sl) }]; };
  function addPos(anchors, risk) {
    if (!chart || !chart.drawings) return null;
    try { const d = chart.drawings.add('position', { anchors, props: { riskPercent: Math.round((risk || 1) * 100) / 100, accountBalance: Math.round(S.balance), profitColor: '#33e6a6', lossColor: '#ff4d5e', showText: true } }); return d && (d.id || d); } catch (e) { return null; }
  }
  function setPos(id, anchors) { if (!chart || !id) return; syncing = true; try { chart.drawings.update(id, { anchors }); } catch (e) { /* tant pis */ } syncing = false; }
  function drawPositions() {
    S.trades.slice(-30).forEach((t) => { if (t.open) addPos(tradeAnchors(t), t.risk); });
    S.orders.forEach((o) => { o.dw = addPos(liveAnchors(o), o.risk); });
    if (draft) { draft.lines = {}; drawDraft(); }
  }
  // Un trait ou une poignée tirée sur le graphique.
  function onDrawingEdited(id) {
    if (!id || !chart || syncing) return;
    const d = (chart.drawings.all() || []).find((x) => x.id === id);
    if (!d || !d.anchors || !d.anchors.length) return;
    if (draft) {
      const k = Object.keys(draft.lines).find((x) => draft.lines[x] === id);
      if (k) {
        const v = d.anchors[0].price;
        if (k === 'pe') { draft.entry = v; draft.kind = Math.abs(v - price()) > atr() * 0.05 ? 'limit' : 'market'; if (draft.kind === 'market') draft.entry = price(); }
        else draft[k] = v;
        draft.lots = lotsFor(draft.risk, draft.entry, draft.sl);
        drawDraft(); paintOrder(); return;
      }
    }
    const o = S.orders.find((x) => x.dw === id);
    if (!o || d.anchors.length < 3) return;
    const [, s, t] = d.anchors.map((x) => x.price), p = price();
    if (o.side === 'buy' ? s < p : s > p) o.sl = s;
    if (o.side === 'buy' ? t > p : t < p) o.tp = t;
    setPos(o.dw, liveAnchors(o));
    save(); paint();
  }
  function placeDraft() {
    const o = draft; if (!o) return true;
    const p = price();
    if ((o.side === 'buy' && o.sl >= o.entry) || (o.side === 'sell' && o.sl <= o.entry)) { toast('Le SL doit être sous l’entrée à l’achat, au-dessus à la vente.'); return false; }
    if (o.tp != null && ((o.side === 'buy' && o.tp <= o.entry) || (o.side === 'sell' && o.tp >= o.entry))) { toast('Le TP doit être du bon côté de l’entrée.'); return false; }
    const market = o.kind === 'market';
    const entry = market ? p : o.entry;
    const ord = { id: Date.now(), side: o.side, entry, sl: o.sl, sl0: o.sl, tp: o.tp, lots: o.lots, beAt: o.beAt || 0, risk: Math.round(usdOf(o.lots, entry, o.sl) / S.balance * 10000) / 100, status: market ? 'open' : 'pending', openAt: S.cursor };
    clearDraftLines();
    draft = null;
    ord.dw = addPos(liveAnchors(ord), ord.risk);
    S.orders.push(ord);
    save(); openPanel('pos', true);
    toast(market ? `${ord.side === 'buy' ? 'Achat' : 'Vente'} ${fr(ord.lots, 2)} lot au marché` : 'Ordre limite posé');
    return true;
  }
  function cancelDraft() { clearDraftLines(); draft = null; paintOrder(); }
  function act(id, what) {
    const o = S.orders.find((x) => x.id === id); if (!o) return;
    if (what === 'close') {
      if (o.status === 'pending') removeDw(o); else close(o, price(), 'manual');
      S.orders = S.orders.filter((x) => x !== o);
    }
    if (what === 'be' && o.status === 'open') { o.sl = o.entry; o.beDone = true; setPos(o.dw, liveAnchors(o)); }
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
      P.innerHTML = `<div class="rpt-ph"><span class="rp__k">Ordre</span><h3>Nouvelle position</h3></div><p class="rpt-empty">Clique sur <b class="is-up">Acheter</b> ou <b class="is-down">Vendre</b> en haut : trois traits apparaissent (entrée, SL, TP). Place-les où tu veux, le lot se calcule tout seul ; il se modifie ici.</p>
        <div class="rpt-f"><span>Risque par défaut</span>${riskSeg('defrisk', Number(S.risk))}</div>`;
      return;
    }
    const o = draft, riskUsd = usdOf(o.lots, o.entry, o.sl), riskPct = riskUsd / S.balance * 100;
    const rr = o.tp != null ? Math.abs(o.tp - o.entry) / Math.abs(o.entry - o.sl) : null;
    const gain = o.tp != null ? usdOf(o.lots, o.entry, o.tp) : null;
    const lv = (cls, k, id, v, note) => `<div class="rpt-lvr ${cls}"><span>${k}</span>${adv ? `<input id="${id}" inputmode="decimal" value="${v}" placeholder="aucun">` : `<b>${v || '—'}</b>`}<em>${note}</em></div>`;
    P.innerHTML = `<div class="rpt-ph is-${o.side}"><span class="rp__k">Ordre · ${o.kind === 'market' ? 'au marché' : 'limite'}</span><h3>${o.side === 'buy' ? 'Achat' : 'Vente'} ${esc(S.symbol)}</h3><small>Monte ou descends les traits Entrée, SL et TP sur le graphique. Lecture : l’ordre part tout seul.</small></div>
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
      <div class="rpt-f"><span>Stop à l’entrée automatique quand le prix atteint</span><div class="rpt-seg">${[[0, 'Jamais'], [1, '1 R'], [1.5, '1,5 R'], [2, '2 R'], [3, '3 R']].map(([v, l]) => `<button type="button" data-beat="${v}" class="${(o.beAt || 0) === v ? 'is-on' : ''}">${l}</button>`).join('')}</div></div>
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
    set('rpaN', String(S.trades.length));
    paintCards(p, d);
    const P = $('#rpaPanel'); if (!P || !panel) return;
    if (panel === 'order') return paintOrder();
    if (panel === 'pos') P.innerHTML = `<div class="rpt-ph"><span class="rp__k">Positions</span><h3>${S.orders.length} en cours</h3></div>` + (S.orders.length ? S.orders.map((o) => `<div class="rpt-pos is-${o.side}"><div class="rpt-pos__t"><b>${o.side === 'buy' ? 'Achat' : 'Vente'} ${fr(o.lots, 2)} lot</b>${o.status === 'pending' ? '<em>en attente</em>' : p ? `<span class="${pnlOf(o, p) >= 0 ? 'is-up' : 'is-down'}">${money(pnlOf(o, p))}</span>` : ''}</div><small>Entrée ${o.entry.toFixed(d)} · SL ${o.sl.toFixed(d)}${o.tp != null ? ' · TP ' + o.tp.toFixed(d) : ''} · ${fr(o.risk, 2)} %${o.beAt && !o.beDone ? ` · BE à ${fr(o.beAt, 1)} R` : ''}</small>
        <div class="rpt-pos__a">${o.status === 'open' ? `<button type="button" data-be="${o.id}">SL à l’entrée</button>` : ''}<button type="button" data-close="${o.id}">${o.status === 'pending' ? 'Annuler' : 'Clôturer'}</button></div></div>`).join('') : '<p class="rpt-empty">Aucune position. Clique sur Acheter ou Vendre.</p>');
    if (panel === 'journal') P.innerHTML = `<div class="rpt-ph"><span class="rp__k">Journal</span><h3>${S.trades.length} trade${S.trades.length > 1 ? 's' : ''}</h3></div>` + (S.trades.length ? `<ul class="rpt-jr">${S.trades.slice().reverse().map((t) => `<li class="is-${t.rr > 0.05 ? 'win' : t.rr < -0.05 ? 'loss' : 'flat'}"><div><b>${t.side === 'buy' ? 'Achat' : 'Vente'} · ${t.result}</b><span>${t.rr > 0 ? '+' : ''}${fr(t.rr, 2)} R · ${money(t.pnl)}</span></div><small>${when(t.open)} → ${when(t.close)}</small></li>`).join('')}</ul>` : '<p class="rpt-empty">Les trades clôturés arrivent ici.</p>');
    if (panel === 'stats') { const x = stats(); P.innerHTML = `<div class="rpt-ph"><span class="rp__k">Statistiques</span><h3 class="${S.balance >= S.capital ? 'is-up' : 'is-down'}">${S.balance >= S.capital ? '+' : ''}${money(S.balance - S.capital)}</h3></div><div class="rpt-st">${[['Trades', x.n], ['Gagnants', fr(x.wr * 100, 1) + ' %'], ['Profit factor', x.pf == null ? '—' : fr(x.pf, 2)], ['Total', (x.R >= 0 ? '+' : '') + fr(x.R, 2) + ' R'], ['R moyen', (x.avgR >= 0 ? '+' : '') + fr(x.avgR, 2)], ['DD max', fr(x.dd * 100, 1) + ' %'], ['Pertes d’affilée', x.worst], ['Solde', money(S.balance)]].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div><div class="rpt-curve">${area(x.curve, 300, 80, S.capital)}</div>`; }
    if (panel === 'scan') {
      const list = window.CHESTScanners ? CHESTScanners.list() : [];
      P.innerHTML = `<div class="rpt-ph"><span class="rp__k">Scanner</span><h3>${S.scanner ? esc((list.find((s) => s.id === S.scanner) || {}).name || S.scanner) : 'Aucun'}</h3></div>
      <label class="rpt-f"><span>Scanner affiché</span><select id="rpaScanSel"><option value="">Aucun</option>${list.map((s) => `<option value="${esc(s.id)}"${s.id === S.scanner ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
      <p class="rpt-empty">Calculé sur les bougies déjà passées seulement : il ne dévoile jamais la suite. Mis à jour à chaque pause.</p>
      <p class="rpt-empty">${scanBusy ? 'Calcul en cours…' : scanAt ? 'À jour au ' + when(scanAt) : ''}</p>
      ${S.scanner ? '<button type="button" class="rpt-place is-ghost" data-act="scan">Mettre à jour maintenant</button>' : ''}`;
    }
  }

  // Bas de page (esprit Stratégies) : la position en cours et les derniers trades
  function paintCards(p, d) {
    const cur = $('#rpaCur'), lastEl = $('#rpaLast');
    if (!cur || !lastEl) return;
    const o = S.orders.find((x) => x.status === 'open') || S.orders[0];
    if (!o) { cur.className = 'rpt-card'; cur.innerHTML = `<div class="rpt-card__h"><span class="rpx-k">Position en cours</span></div><p class="rpt-none">Aucune position. Clique sur <b class="is-up">Acheter</b> ou <b class="is-down">Vendre</b> en haut : la position se pose sur le graphique, tire ses poignées pour placer le SL et le TP.</p>`; }
    else {
      const live = o.status === 'open' && p ? pnlOf(o, p) : null, rr = o.status === 'open' && p ? rrOf(o, p) : null;
      cur.className = 'rpt-card is-' + o.side;
      cur.innerHTML = `<div class="rpt-card__h"><span class="rpx-k">Position en cours${S.orders.length > 1 ? ` · ${S.orders.length}` : ''}</span><span class="rpt-dot">${o.status === 'open' ? 'ouverte' : 'en attente'}</span></div>
        <div class="rpt-cur"><b class="${o.side === 'buy' ? 'is-up' : 'is-down'}">${o.side === 'buy' ? 'Achat' : 'Vente'}</b><span>${esc(S.symbol)} · ${fr(o.lots, 2)} lot</span>${rr != null ? `<em class="${rr >= 0 ? 'is-up' : 'is-down'}">${rr >= 0 ? '+' : ''}${fr(rr, 1)} R</em>` : ''}</div>
        <div class="rpt-lvls"><div><span>Entrée</span><b>${o.entry.toFixed(d)}</b></div><div><span>Stop</span><b class="is-down">${o.sl.toFixed(d)}</b></div><div><span>Objectif</span><b class="is-up">${o.tp != null ? o.tp.toFixed(d) : '—'}</b></div><div><span>En cours</span><b class="${live == null ? '' : live >= 0 ? 'is-up' : 'is-down'}">${live == null ? '—' : money(live)}</b></div></div>
        <div class="rpt-cur__a">${o.status === 'open' ? `<button type="button" data-be="${o.id}">SL à l’entrée</button>` : ''}<button type="button" data-close="${o.id}">${o.status === 'pending' ? 'Annuler' : 'Clôturer'}</button></div>`;
    }
    const t = S.trades.slice(-6).reverse();
    lastEl.innerHTML = t.length ? `<ul class="rpt-last">${t.map((x) => `<li><span class="is-mono">${new Date(x.close).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })}</span><i class="${x.side === 'buy' ? 'is-buy' : 'is-sell'}">${x.side === 'buy' ? 'Achat' : 'Vente'}</i><span>${x.result === 'TP' ? 'Objectif touché' : x.result === 'SL' ? 'Stop' : 'Sortie à 0'}</span><b class="${x.rr > 0.05 ? 'is-up' : x.rr < -0.05 ? 'is-down' : ''}">${x.rr > 0 ? '+' : ''}${fr(x.rr, 1)} R</b></li>`).join('')}</ul>` : '<p class="rpt-none">Tes trades clôturés arrivent ici.</p>';
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
      const d = await api(`/replay/scan?script=${encodeURIComponent(S.scanner)}&symbol=${encodeURIComponent(S.symbol)}&tf=${viewTf}&to=${Math.round(S.cursor)}&n=1200&session=${encodeURIComponent(S.id)}`);
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
  function save() { if (!S) return; S.updated = Date.now(); const l = loadAll().filter((x) => x.id !== S.id); l.unshift(JSON.parse(JSON.stringify(S, (k, v) => (k === 'dw' ? undefined : v)))); saveAll(l); }
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
        if ((k === 'step' || k === 'play') && !timer && draft && !placeDraft()) return;
        if (k === 'step') { clearInterval(timer); timer = null; $('#rpaPlay').textContent = '▶'; await step(); return; }
        if (k === 'play') { if (timer) stop(); else { a.textContent = '⏸'; timer = setInterval(() => { step(); }, Math.max(30, 900 / speed)); } return; }
        if (k === 'adv') { adv = !adv; a.classList.toggle('is-on', adv); a.setAttribute('aria-pressed', String(adv)); openPanel('order', true); return; }
        if (k === 'place') { placeDraft(); return; }
        if (k === 'cancel') { cancelDraft(); return; }
        if (k === 'export') { exportBt(); return; }
        if (k === 'ind') { indMenu(); return; }
        if (k === 'scan') { refreshScan(); return; }
      }
      const tr = t.closest('[data-trade]'); if (tr) { if (draft && draft.side === tr.dataset.trade) { openPanel('order', true); return; } clearDraftLines(); startDraft(tr.dataset.trade); return; }
      const tfb = t.closest('[data-tf]'); if (tfb) { viewTf = tfb.dataset.tf; root.querySelectorAll('[data-tf]').forEach((x) => x.classList.toggle('is-on', x === tfb)); lastScan = null; try { await mountChart(); } catch (x) { toast(x.message); } if (S.scanner) refreshScan(); return; }
      const pb = t.closest('[data-panel]'); if (pb) { openPanel(pb.dataset.panel); return; }
      const ai = t.closest('[data-addind]'); if (ai) { pop.hidden = true; try { await chart.addNativeIndicator(ai.dataset.addind); if (!S.indicators.includes(ai.dataset.addind)) S.indicators.push(ai.dataset.addind); save(); } catch (x) { toast('Indicateur indisponible.'); } return; }
      const ba = t.closest('[data-beat]'); if (ba && draft) { draft.beAt = Number(ba.dataset.beat); paintOrder(); return; }
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

  window.CHESTReplay = { async mount(el) { root = el; if (DEMO) { document.documentElement.classList.add('rp-demo'); demoSessions(); } try { ME = await api('/replay/me'); } catch (e) { /* hors ligne : sans limite côté écran, le serveur tranche */ } home(); } };
})();
