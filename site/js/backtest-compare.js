// CHEST — Comparatif de deux backtests.
// v1 (2026-10-24) : menu ⋯ d'une carte → choisir l'autre backtest et le type de compte.
// v2 (2026-10-25, retour utilisateur : « développe l'esthétisme et les infos, avec le choix individuel des
// deux ») : chaque côté a son propre backtest ET son propre type de compte (compte propre / propfirm) ;
// verdict, 4 chiffres clés, courbes + drawdown superposés avec lecture au survol, indicateurs détaillés par
// thème avec barre de comparaison, et mois par mois. Calculs : CHESTBacktestEngine.computeReport, avec le
// réglage de risque enregistré sur chaque backtest (b.cp, sinon 1 % fixe ; b.pf sur b.pfCapital).
(() => {
  'use strict';
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const COL = ['#fc1283', '#f9a45e'];
  const RGB = ['252,18,131', '249,164,94'];
  const hasPf = (b) => !!(b && b.pf && b.pf.mode);
  const isSL = (t) => String(t && t.result).toUpperCase() === 'SL';

  // ---------- calculs ----------
  function analyse(b, mode) {
    const E = window.CHESTBacktestEngine;
    const pf = mode === 'pf' && hasPf(b);
    const capital = pf ? (b.pfCapital || b.capital) : b.capital;
    const r = pf ? E.computeReport(b.trades || [], capital, b.pf)
      : E.computeReport(b.trades || [], b.capital, (b.cp && b.cp.mode) ? b.cp : { risk: 1, tiers: [] });
    const curve = r.curve, s = r.stats, mo = r.monthly || [];
    const c0 = curve[0].capital || 1;
    const perf = curve.map((p) => (p.capital / c0 - 1) * 100);
    let peak = -Infinity;
    const dd = curve.map((p) => { peak = Math.max(peak, p.capital); return peak > 0 ? (p.capital / peak - 1) * 100 : 0; });
    const taken = curve.slice(1).map((p) => p.trade).filter(Boolean);
    const rrs = taken.map((t) => Number(t.rr)).filter((n) => isFinite(n));
    let streak = 0, worstStreak = 0;
    taken.forEach((t) => { if (isSL(t)) { streak += 1; worstStreak = Math.max(worstStreak, streak); } else streak = 0; });
    const pcts = mo.map((m) => m.pct);
    const mean = pcts.length ? pcts.reduce((a, v) => a + v, 0) / pcts.length : null;
    const sd = pcts.length > 1 ? Math.sqrt(pcts.reduce((a, v) => a + (v - mean) ** 2, 0) / (pcts.length - 1)) : null;
    const dates = curve.slice(1).map((p) => p.date).filter(Boolean);
    const best = mo.reduce((a, m) => (!a || m.pct > a.pct ? m : a), null);
    const worst = mo.reduce((a, m) => (!a || m.pct < a.pct ? m : a), null);
    const maxDd = Math.abs(s.maxDrawdownPct || 0);
    return {
      mode: pf ? 'pf' : 'cp', capital, perf, dd, monthly: mo,
      perfPct: s.performancePct, finalCapital: s.finalCapital, gain: s.finalCapital - c0,
      avgMonth: mean, pf: s.profitFactor, expR: rrs.length ? rrs.reduce((a, v) => a + v, 0) / rrs.length : null,
      winRate: s.winRatePct, maxDd, maxDailyDd: Math.abs(r.maxDailyDrawdownPct || 0), worstStreak,
      worstMonth: worst, bestMonth: best, posMonths: mo.length ? mo.filter((m) => m.pct > 0).length / mo.length * 100 : null,
      posMonthsTxt: mo.length ? `${mo.filter((m) => m.pct > 0).length} / ${mo.length}` : '—',
      sd, trades: s.totalTrades, wins: s.wins, losses: s.losses, skipped: s.skippedTrades || 0,
      perMonth: mo.length ? s.totalTrades / mo.length : null, retDd: maxDd > 0 ? s.performancePct / maxDd : null,
      from: dates[0] || null, to: dates[dates.length - 1] || null,
    };
  }

  // ---------- formats ----------
  const fr = (n, d) => n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = (n, d = 1, sign = true) => (n == null || !isFinite(n) ? '—' : (sign && n > 0 ? '+' : '') + fr(n, d) + ' %');
  const num = (n, d = 2) => (n == null || !isFinite(n) ? '—' : fr(n, d));
  const money = (n) => (n == null || !isFinite(n) ? '—' : (n < 0 ? '−' : '') + '$' + fr(Math.abs(Math.round(n)), 0));
  const mName = (k, long) => { if (!k) return ''; const [y, m] = k.split('-'); return new Date(+y, +m - 1, 1).toLocaleDateString('fr-FR', long ? { month: 'long', year: 'numeric' } : { month: 'short' }); };
  const day = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

  // [libellé, valeur A/B pour comparer, texte, sens : 'high' | 'low' | 'none', explication]
  const GROUPS = [
    ['Rentabilité', [
      ['Performance', (x) => x.perfPct, (x) => pct(x.perfPct), 'high', 'Gain total sur la période, en % du capital de départ.'],
      ['Gain', (x) => x.gain, (x) => money(x.gain), 'none', 'En dollars, sur le capital de chaque côté.'],
      ['Moyenne par mois', (x) => x.avgMonth, (x) => pct(x.avgMonth, 2), 'high', ''],
      ['Profit factor', (x) => x.pf, (x) => num(x.pf), 'high', 'Gains bruts ÷ pertes brutes (en R).'],
      ['Espérance par trade', (x) => x.expR, (x) => (x.expR == null ? '—' : (x.expR > 0 ? '+' : '') + num(x.expR) + ' R'), 'high', 'Ce que rapporte un trade en moyenne, en multiple du risque.'],
    ]],
    ['Risque', [
      ['Drawdown max', (x) => x.maxDd, (x) => pct(-x.maxDd), 'low', 'Plus forte baisse depuis un sommet.'],
      ['Drawdown journalier max', (x) => x.maxDailyDd, (x) => pct(-x.maxDailyDd), 'low', ''],
      ['Rendement / risque', (x) => x.retDd, (x) => num(x.retDd), 'high', 'Performance ÷ drawdown max.'],
      ['Pertes d’affilée (max)', (x) => x.worstStreak, (x) => String(x.worstStreak), 'low', ''],
      ['Pire mois', (x) => (x.worstMonth ? x.worstMonth.pct : null), (x) => (x.worstMonth ? `${pct(x.worstMonth.pct)} · ${mName(x.worstMonth.key)}` : '—'), 'high', ''],
    ]],
    ['Régularité', [
      ['Taux de réussite', (x) => x.winRate, (x) => pct(x.winRate, 1, false), 'high', ''],
      ['Mois positifs', (x) => x.posMonths, (x) => x.posMonthsTxt, 'high', ''],
      ['Écart entre les mois', (x) => x.sd, (x) => (x.sd == null ? '—' : '± ' + fr(x.sd, 1) + ' %'), 'low', 'Plus c’est bas, plus les mois se ressemblent.'],
      ['Meilleur mois', (x) => (x.bestMonth ? x.bestMonth.pct : null), (x) => (x.bestMonth ? `${pct(x.bestMonth.pct)} · ${mName(x.bestMonth.key)}` : '—'), 'high', ''],
    ]],
    ['Activité', [
      ['Positions prises', (x) => x.trades, (x) => fr(x.trades, 0), 'none', ''],
      ['Gagnantes / perdantes', null, (x) => `${x.wins} / ${x.losses}`, 'none', ''],
      ['Positions par mois', (x) => x.perMonth, (x) => num(x.perMonth, 1), 'none', ''],
      ['Positions écartées', (x) => x.skipped, (x) => String(x.skipped), 'none', 'Non prises par le réglage de risque (règles propfirm, plafonds…).'],
      ['Période', null, (x) => `${day(x.from)} → ${day(x.to)}`, 'none', ''],
    ]],
  ];
  // Qui gagne une ligne : 0 (A), 1 (B) ou -1.
  function winner(get, dir, A, B) {
    if (!get || dir === 'none') return -1;
    const a = get(A), b = get(B);
    if (a == null || b == null || !isFinite(a) || !isFinite(b) || a === b) return -1;
    return (dir === 'high' ? a > b : a < b) ? 0 : 1;
  }
  function relBar(get, A, B, w) {
    if (!get || w < 0) return '<span class="btc-bar"></span>';
    const a = Math.abs(get(A)), b = Math.abs(get(B)), m = Math.max(a, b) || 1;
    const gap = Math.min(1, Math.abs(a - b) / m);
    const width = (12 + gap * 88).toFixed(0);
    return `<span class="btc-bar"><i style="width:${width}%;${w === 0 ? 'right:50%' : 'left:50%'};background:${COL[w]}"></i></span>`;
  }

  // ---------- graphiques ----------
  const W = 720, HE = 210, HD = 74;
  function lineOf(series, h, lo, hi, pad) {
    const span = hi - lo || 1, n = series.length;
    return series.map((v, i) => `${i ? 'L' : 'M'}${(n > 1 ? i / (n - 1) * W : 0).toFixed(1)} ${(pad + (1 - (v - lo) / span) * (h - 2 * pad)).toFixed(1)}`).join(' ');
  }
  function charts(X) {
    const allP = X[0].perf.concat(X[1].perf, [0]);
    const lo = Math.min(...allP), hi = Math.max(...allP);
    const ddLo = Math.min(...X[0].dd, ...X[1].dd, -0.5);
    const zeroY = 8 + (1 - (0 - lo) / ((hi - lo) || 1)) * (HE - 16);
    const grid = [0.25, 0.5, 0.75].map((f) => `<line x1="0" x2="${W}" y1="${(f * HE).toFixed(1)}" y2="${(f * HE).toFixed(1)}" class="btc-grid"/>`).join('');
    const eq = X.map((x, i) => {
      const d = lineOf(x.perf, HE, lo, hi, 8);
      return `<path d="${d} L${W} ${zeroY.toFixed(1)} L0 ${zeroY.toFixed(1)} Z" fill="url(#btcA${i})" opacity=".9"/><path d="${d}" fill="none" stroke="${COL[i]}" stroke-width="2.2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;
    }).reverse().join('');
    const dd = X.map((x, i) => { const d = lineOf(x.dd, HD, ddLo, 0, 3); return `<path d="${d} L${W} 3 L0 3 Z" fill="rgba(${RGB[i]},.13)"/><path d="${d}" fill="none" stroke="${COL[i]}" stroke-width="1.2" stroke-linejoin="round" vector-effect="non-scaling-stroke" opacity=".9"/>`; }).reverse().join('');
    return `
      <div class="btc-plot" data-plot>
        <svg viewBox="0 0 ${W} ${HE}" preserveAspectRatio="none" class="btc-svg" aria-hidden="true">
          <defs>${X.map((_, i) => `<linearGradient id="btcA${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(${RGB[i]},.22)"/><stop offset="1" stop-color="rgba(${RGB[i]},0)"/></linearGradient>`).join('')}</defs>
          ${grid}<line x1="0" x2="${W}" y1="${zeroY.toFixed(1)}" y2="${zeroY.toFixed(1)}" class="btc-zero"/>${eq}
        </svg>
        <span class="btc-ax btc-ax--top">${pct(hi, 0)}</span><span class="btc-ax btc-ax--bot">${pct(lo, 0)}</span>
        <i class="btc-cursor" data-cursor hidden></i>
        <div class="btc-tip" data-tip hidden></div>
      </div>
      <div class="btc-sub"><span>Drawdown</span><span>${pct(ddLo, 0)}</span></div>
      <div class="btc-plot btc-plot--dd"><svg viewBox="0 0 ${W} ${HD}" preserveAspectRatio="none" class="btc-svg" aria-hidden="true"><line x1="0" x2="${W}" y1="3" y2="3" class="btc-zero"/>${dd}</svg></div>
      <div class="btc-xax"><span>Début de l’historique</span><span>Fin</span></div>`;
  }
  function months(X, names) {
    const keys = [...new Set(X[0].monthly.map((m) => m.key).concat(X[1].monthly.map((m) => m.key)))].sort().slice(-12);
    if (!keys.length) return '<p class="btc-empty">Pas assez de dates pour comparer mois par mois.</p>';
    const val = (x, k) => { const m = x.monthly.find((z) => z.key === k); return m ? m.pct : null; };
    const max = Math.max(1, ...keys.flatMap((k) => X.map((x) => Math.abs(val(x, k) || 0))));
    return `<div class="btc-months">${keys.map((k) => `<div class="btc-month">
        <div class="btc-month__bars">${X.map((x, i) => { const v = val(x, k); if (v == null) return '<span class="btc-mb"></span>'; const h = Math.max(1.5, Math.abs(v) / max * 50); return `<span class="btc-mb" title="${esc(names[i])} · ${esc(mName(k, true))} : ${esc(pct(v))}"><i style="height:${h.toFixed(1)}%;background:${COL[i]};${v >= 0 ? 'bottom:50%' : 'top:50%'}"></i></span>`; }).join('')}</div>
        <span class="btc-month__k">${esc(mName(k))}</span></div>`).join('')}</div>`;
  }

  // ---------- styles ----------
  const STYLE = `
  .btc{ position:fixed; inset:0; z-index:200; display:grid; place-items:center; padding:24px; background:rgba(3,3,5,.66); -webkit-backdrop-filter:blur(12px); backdrop-filter:blur(12px); animation:btcFade .2s ease-out both; }
  @keyframes btcFade{ from{ opacity:0; } }
  .btc__box{ position:relative; width:min(1080px,100%); max-height:calc(100dvh - 48px); overflow:auto; border-radius:22px; border:1px solid rgba(255,255,255,.12);
    background:linear-gradient(180deg, rgba(22,20,24,.97), rgba(12,12,15,.98)); box-shadow:0 40px 120px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.07);
    color:var(--chest-ink,#f6f6f7); animation:btcIn .32s cubic-bezier(.16,1,.3,1) both; scrollbar-width:thin; }
  @keyframes btcIn{ from{ opacity:0; transform:translateY(12px) scale(.985); } }
  .btc__head{ position:sticky; top:0; z-index:5; display:flex; align-items:center; justify-content:space-between; gap:16px; padding:20px 26px 16px;
    background:linear-gradient(180deg, rgba(20,18,22,.98) 70%, rgba(20,18,22,0)); }
  .btc__k{ display:block; font-size:10px; letter-spacing:.24em; text-transform:uppercase; color:var(--chest-ink-3,#5c5c63); margin-bottom:6px; }
  .btc__t{ margin:0; font-size:21px; font-weight:700; letter-spacing:-.02em; }
  .btc__x{ width:36px; height:36px; flex-shrink:0; display:grid; place-items:center; border-radius:11px; cursor:pointer; border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.04); color:var(--chest-ink-2,#9b9ba1); transition:color .15s, border-color .15s; }
  .btc__x:hover{ color:#fff; border-color:rgba(255,255,255,.26); }
  .btc__body{ padding:0 26px 26px; display:flex; flex-direction:column; gap:22px; }
  .btc-slots{ display:grid; grid-template-columns:1fr auto 1fr; gap:14px; align-items:stretch; }
  .btc-vs{ align-self:center; font-size:11px; font-weight:700; letter-spacing:.14em; color:var(--chest-ink-3,#5c5c63); width:38px; height:38px; display:grid; place-items:center; border-radius:50%; border:1px solid rgba(255,255,255,.1); background:rgba(255,255,255,.02); }
  .btc-slot{ position:relative; padding:16px 16px 14px 20px; border-radius:16px; border:1px solid rgba(255,255,255,.1); background:rgba(255,255,255,.025); overflow:hidden; display:flex; flex-direction:column; gap:10px; min-width:0; }
  .btc-slot::before{ content:""; position:absolute; left:0; top:0; bottom:0; width:3px; background:var(--c); box-shadow:0 0 18px var(--c); }
  .btc-slot::after{ content:""; position:absolute; inset:0; pointer-events:none; background:radial-gradient(120% 90% at 0% 0%, rgba(var(--rgb),.1), transparent 60%); }
  .btc-slot__lbl{ font-size:10px; letter-spacing:.2em; text-transform:uppercase; color:var(--c); font-weight:700; }
  .btc-slot select{ position:relative; z-index:1; width:100%; height:42px; border-radius:12px; padding:0 12px; font:inherit; font-size:15px; font-weight:600; color:var(--chest-ink,#f6f6f7); background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.12); outline:none; }
  .btc-slot select:focus{ border-color:rgba(var(--a1-rgb, 252, 18, 131),.6); box-shadow:0 0 0 3px rgba(var(--a1-rgb, 252, 18, 131),.18); }
  .btc-slot option{ background:#121215; }
  .btc-seg{ position:relative; z-index:1; display:grid; grid-template-columns:1fr 1fr; padding:3px; gap:2px; border-radius:12px; border:1px solid rgba(255,255,255,.1); background:rgba(0,0,0,.2); }
  .btc-seg button{ font:inherit; font-size:12.5px; font-weight:600; height:32px; border-radius:9px; border:0; cursor:pointer; background:none; color:var(--chest-ink-2,#9b9ba1); transition:background .2s, color .2s; }
  .btc-seg button[aria-pressed="true"]{ background:rgba(255,255,255,.1); color:#fff; box-shadow:inset 0 0 0 1px rgba(var(--rgb),.45); }
  .btc-seg button:disabled{ opacity:.35; cursor:not-allowed; }
  .btc-seg button:active:not(:disabled), .btc__x:active{ transform:scale(.97); }
  .btc-slot__meta{ position:relative; z-index:1; font-size:12px; color:var(--chest-ink-3,#5c5c63); font-variant-numeric:tabular-nums; }
  .btc-verdict{ display:flex; align-items:center; gap:16px; padding:14px 18px; border-radius:14px; border:1px solid rgba(255,255,255,.08); background:rgba(255,255,255,.02); flex-wrap:wrap; }
  .btc-verdict p{ margin:0; font-size:14px; color:var(--chest-ink-2,#9b9ba1); flex:1 1 280px; }
  .btc-verdict b{ color:#fff; }
  .btc-score{ display:flex; align-items:center; gap:10px; font-size:13px; font-weight:700; font-variant-numeric:tabular-nums; }
  .btc-score__bar{ display:flex; width:160px; height:6px; border-radius:6px; overflow:hidden; background:rgba(255,255,255,.08); }
  .btc-score__bar i{ display:block; height:100%; }
  .btc-kpis{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; }
  .btc-kpi{ padding:14px 16px; border-radius:14px; border:1px solid rgba(255,255,255,.08); background:rgba(255,255,255,.02); }
  .btc-kpi__t{ font-size:10px; letter-spacing:.18em; text-transform:uppercase; color:var(--chest-ink-3,#5c5c63); margin-bottom:10px; }
  .btc-kpi__v{ display:flex; align-items:baseline; justify-content:space-between; gap:8px; font-variant-numeric:tabular-nums; font-size:15px; font-weight:600; color:var(--chest-ink-2,#9b9ba1); padding:3px 0; }
  .btc-kpi__v i{ width:7px; height:7px; border-radius:50%; flex-shrink:0; margin-right:8px; }
  .btc-kpi__v span{ display:flex; align-items:center; min-width:0; }
  .btc-kpi__v.is-win{ color:#fff; font-size:18px; font-weight:700; }
  .btc-kpi__v small{ font-size:10px; letter-spacing:.1em; text-transform:uppercase; color:#33e6a6; font-weight:700; }
  .btc-sec{ display:flex; flex-direction:column; gap:10px; }
  .btc-sec__k{ font-size:10px; letter-spacing:.24em; text-transform:uppercase; color:var(--chest-ink-3,#5c5c63); }
  .btc-legend{ display:flex; gap:18px; flex-wrap:wrap; font-size:12.5px; color:var(--chest-ink-2,#9b9ba1); }
  .btc-legend span{ display:inline-flex; align-items:center; gap:8px; min-width:0; }
  .btc-legend i{ width:16px; height:3px; border-radius:2px; }
  .btc-plot{ position:relative; height:${HE}px; border-radius:14px; border:1px solid rgba(255,255,255,.07); background:rgba(255,255,255,.012); overflow:hidden; }
  .btc-plot--dd{ height:${HD}px; }
  .btc-svg{ width:100%; height:100%; display:block; }
  .btc-grid{ stroke:rgba(255,255,255,.05); vector-effect:non-scaling-stroke; }
  .btc-zero{ stroke:rgba(255,255,255,.18); stroke-dasharray:3 6; vector-effect:non-scaling-stroke; }
  .btc-ax{ position:absolute; right:10px; font-size:10.5px; color:var(--chest-ink-3,#5c5c63); font-variant-numeric:tabular-nums; pointer-events:none; }
  .btc-ax--top{ top:8px; } .btc-ax--bot{ bottom:8px; }
  .btc-sub, .btc-xax{ display:flex; justify-content:space-between; font-size:10.5px; color:var(--chest-ink-3,#5c5c63); font-variant-numeric:tabular-nums; }
  .btc-sub{ margin-top:4px; letter-spacing:.14em; text-transform:uppercase; }
  .btc-cursor{ position:absolute; top:0; bottom:0; width:1px; background:rgba(255,255,255,.28); pointer-events:none; }
  .btc-tip{ position:absolute; top:10px; min-width:170px; padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.12); background:rgba(12,12,15,.94); box-shadow:0 14px 30px rgba(0,0,0,.5); font-size:12px; pointer-events:none; font-variant-numeric:tabular-nums; }
  .btc-tip div{ display:flex; justify-content:space-between; gap:14px; padding:2px 0; color:var(--chest-ink-2,#9b9ba1); }
  .btc-tip b{ color:#fff; }
  .btc-tip i{ display:inline-block; width:7px; height:7px; border-radius:50%; margin-right:7px; }
  .btc-cursor[hidden], .btc-tip[hidden]{ display:none; }
  .btc-tbl{ border-radius:14px; border:1px solid rgba(255,255,255,.08); overflow:hidden; }
  .btc-row{ display:grid; grid-template-columns:minmax(150px,1.2fr) minmax(0,1fr) 120px minmax(0,1fr); align-items:center; gap:12px; padding:10px 16px; border-top:1px solid rgba(255,255,255,.055); font-size:13.5px; font-variant-numeric:tabular-nums; }
  .btc-row--g{ background:rgba(255,255,255,.025); border-top:0; font-size:10px; letter-spacing:.2em; text-transform:uppercase; color:var(--chest-ink-3,#5c5c63); padding:9px 16px; }
  .btc-row--g + .btc-row{ border-top:0; }
  .btc-row__l{ color:var(--chest-ink-2,#9b9ba1); }
  .btc-row__l small{ display:block; font-size:11px; color:var(--chest-ink-3,#5c5c63); margin-top:2px; line-height:1.35; }
  .btc-row__v{ text-align:right; color:var(--chest-ink-2,#9b9ba1); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .btc-row__v:last-child{ text-align:left; }
  .btc-row__v.is-win{ color:#fff; font-weight:700; }
  .btc-bar{ position:relative; display:block; height:6px; border-radius:6px; background:rgba(255,255,255,.05); }
  .btc-bar::after{ content:""; position:absolute; left:50%; top:-3px; bottom:-3px; width:1px; background:rgba(255,255,255,.2); }
  .btc-bar i{ position:absolute; top:0; bottom:0; max-width:50%; border-radius:6px; }
  .btc-months{ display:flex; gap:6px; overflow-x:auto; padding-bottom:4px; }
  .btc-month{ flex:1 0 46px; display:flex; flex-direction:column; align-items:center; gap:6px; }
  .btc-month__bars{ position:relative; width:100%; height:120px; display:flex; justify-content:center; gap:4px; border-radius:10px; background:linear-gradient(transparent calc(50% - .5px), rgba(255,255,255,.12) calc(50% - .5px), rgba(255,255,255,.12) calc(50% + .5px), transparent calc(50% + .5px)); }
  .btc-mb{ position:relative; width:12px; height:100%; }
  .btc-mb i{ position:absolute; left:0; right:0; border-radius:3px; }
  .btc-month__k{ font-size:10.5px; color:var(--chest-ink-3,#5c5c63); text-transform:capitalize; }
  .btc-note{ margin:0; font-size:12.5px; color:#e8b339; }
  .btc-empty{ margin:0; padding:26px 0; text-align:center; color:var(--chest-ink-2,#9b9ba1); font-size:14px; }
  @media (max-width:860px){ .btc-kpis{ grid-template-columns:repeat(2,minmax(0,1fr)); } .btc-row{ grid-template-columns:minmax(110px,1fr) minmax(0,1fr) 70px minmax(0,1fr); gap:8px; padding:10px 12px; } .btc-row__l small{ display:none; } }
  @media (max-width:640px){ .btc{ padding:0; align-items:end; } .btc__box{ border-radius:22px 22px 0 0; max-height:94dvh; } .btc__head{ padding:18px 16px 12px; } .btc__body{ padding:0 16px 20px; }
    .btc-slots{ grid-template-columns:1fr; } .btc-vs{ justify-self:center; margin:-4px 0; } .btc-row{ grid-template-columns:1fr 1fr; } .btc-row .btc-bar{ display:none; } .btc-row__l{ grid-column:1 / -1; } .btc-row__v, .btc-row__v:last-child{ text-align:left; } }
  @media (prefers-reduced-motion:reduce){ .btc, .btc__box{ animation:none; } }`;

  // ---------- fenêtre ----------
  let root = null, lastFocus = null;
  function close() {
    if (!root) return;
    root.remove(); root = null;
    document.removeEventListener('keydown', onKey);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function onKey(e) { if (e.key === 'Escape') close(); }

  function open(idA) {
    const store = window.CHESTBacktests;
    const all = store.list();
    if (!all.length) return;
    if (!document.getElementById('btcStyle')) { const st = document.createElement('style'); st.id = 'btcStyle'; st.textContent = STYLE; document.head.appendChild(st); }
    close();
    lastFocus = document.activeElement;
    const a0 = store.get(idA) || all[0];
    const b0 = all.find((b) => b.id !== a0.id) || a0;
    const pick = [{ id: a0.id, mode: hasPf(a0) ? 'pf' : 'cp' }, { id: b0.id, mode: hasPf(b0) ? 'pf' : 'cp' }];
    root = document.createElement('div');
    root.className = 'btc';
    root.addEventListener('click', (e) => { if (e.target === root) close(); });
    document.body.appendChild(root);
    document.addEventListener('keydown', onKey);

    function slot(i) {
      const b = store.get(pick[i].id);
      const pf = hasPf(b);
      const capital = pick[i].mode === 'pf' && pf ? (b.pfCapital || b.capital) : b.capital;
      return `<div class="btc-slot" style="--c:${COL[i]};--rgb:${RGB[i]}">
        <span class="btc-slot__lbl">Backtest ${i ? 'B' : 'A'}</span>
        <select data-slot="${i}" aria-label="Backtest ${i ? 'B' : 'A'}">${all.map((o) => `<option value="${esc(o.id)}" ${o.id === pick[i].id ? 'selected' : ''}>${esc(o.title)}</option>`).join('')}</select>
        <div class="btc-seg" role="group" aria-label="Type de compte du backtest ${i ? 'B' : 'A'}">
          <button type="button" data-slot-mode="${i}" data-mode="cp" aria-pressed="${pick[i].mode === 'cp'}">Compte propre</button>
          <button type="button" data-slot-mode="${i}" data-mode="pf" aria-pressed="${pick[i].mode === 'pf'}" ${pf ? '' : 'disabled title="Aucun réglage propfirm enregistré sur ce backtest"'}>Propfirm</button>
        </div>
        <span class="btc-slot__meta">${(b.trades || []).length} positions · capital ${money(capital)}${pf ? '' : ' · pas de réglage propfirm'}</span>
      </div>`;
    }

    function render() {
      const B = pick.map((p) => store.get(p.id));
      const X = pick.map((p, i) => analyse(B[i], p.mode));
      const names = B.map((b) => b.title);
      let score = [0, 0];
      const rows = GROUPS.map(([g, list]) => `<div class="btc-row btc-row--g"><span>${g}</span><span></span><span></span><span></span></div>` + list.map(([label, get, txt, dir, help]) => {
        const w = winner(get, dir, X[0], X[1]);
        if (w >= 0) score[w] += 1;
        return `<div class="btc-row"><span class="btc-row__l">${esc(label)}${help ? `<small>${esc(help)}</small>` : ''}</span>
          <span class="btc-row__v ${w === 0 ? 'is-win' : ''}">${esc(txt(X[0]))}</span>${relBar(get, X[0], X[1], w)}<span class="btc-row__v ${w === 1 ? 'is-win' : ''}">${esc(txt(X[1]))}</span></div>`;
      }).join('')).join('');
      const total = score[0] + score[1];
      const lead = score[0] === score[1] ? -1 : (score[0] > score[1] ? 0 : 1);
      const same = pick[0].id === pick[1].id && pick[0].mode === pick[1].mode;
      const verdict = same ? 'Tu compares le même backtest avec le même réglage : choisis un autre backtest ou l’autre type de compte.'
        : lead < 0 ? `Égalité : chacun l’emporte sur <b>${score[0]}</b> indicateurs.`
        : `<b style="color:${COL[lead]}">${esc(names[lead])}</b> l’emporte sur <b>${score[lead]}</b> indicateurs sur ${total}.`;
      const kpi = (t, get, txt, dir) => {
        const w = winner(get, dir, X[0], X[1]);
        return `<div class="btc-kpi"><div class="btc-kpi__t">${t}</div>${X.map((x, i) => `<div class="btc-kpi__v ${w === i ? 'is-win' : ''}"><span><i style="background:${COL[i]}"></i>${esc(txt(x))}</span>${w === i ? '<small>Meilleur</small>' : ''}</div>`).join('')}</div>`;
      };
      root.innerHTML = `<div class="btc__box" role="dialog" aria-modal="true" aria-labelledby="btcTitle">
        <div class="btc__head"><div><span class="btc__k">01 — Comparatif</span><h2 class="btc__t" id="btcTitle">Comparer deux backtests</h2></div>
          <button type="button" class="btc__x" data-btc-close aria-label="Fermer le comparatif"><svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 3l6 6M9 3l-6 6"/></svg></button></div>
        <div class="btc__body">
          <div class="btc-slots">${slot(0)}<span class="btc-vs">VS</span>${slot(1)}</div>
          <div class="btc-verdict"><p>${verdict}</p>${same ? '' : `<div class="btc-score"><span style="color:${COL[0]}">${score[0]}</span><span class="btc-score__bar"><i style="width:${total ? score[0] / total * 100 : 50}%;background:${COL[0]}"></i><i style="width:${total ? score[1] / total * 100 : 50}%;background:${COL[1]}"></i></span><span style="color:${COL[1]}">${score[1]}</span></div>`}</div>
          <div class="btc-kpis">
            ${kpi('Performance', (x) => x.perfPct, (x) => pct(x.perfPct), 'high')}
            ${kpi('Drawdown max', (x) => x.maxDd, (x) => pct(-x.maxDd), 'low')}
            ${kpi('Profit factor', (x) => x.pf, (x) => num(x.pf), 'high')}
            ${kpi('Taux de réussite', (x) => x.winRate, (x) => pct(x.winRate, 1, false), 'high')}
          </div>
          <section class="btc-sec"><span class="btc-sec__k">02 — Courbes</span>
            <div class="btc-legend">${names.map((n, i) => `<span><i style="background:${COL[i]}"></i>${esc(n)} · ${pick[i].mode === 'pf' && X[i].mode === 'pf' ? 'propfirm' : 'compte propre'}</span>`).join('')}</div>
            ${charts(X)}
          </section>
          <section class="btc-sec"><span class="btc-sec__k">03 — Indicateurs détaillés</span>
            <div class="btc-tbl">${rows}</div>
          </section>
          <section class="btc-sec"><span class="btc-sec__k">04 — Mois par mois · 12 derniers</span>
            ${months(X, names)}
          </section>
        </div>
      </div>`;
      bind(X, names);
    }

    function bind(X, names) {
      root.querySelector('[data-btc-close]').addEventListener('click', close);
      root.querySelectorAll('[data-slot]').forEach((sel) => sel.addEventListener('change', () => {
        const i = +sel.dataset.slot; pick[i].id = sel.value;
        if (pick[i].mode === 'pf' && !hasPf(store.get(sel.value))) pick[i].mode = 'cp';
        render(); root.querySelector(`[data-slot="${i}"]`).focus();
      }));
      root.querySelectorAll('[data-slot-mode]').forEach((btn) => btn.addEventListener('click', () => {
        pick[+btn.dataset.slotMode].mode = btn.dataset.mode; render();
      }));
      // Lecture au survol : même position relative dans chaque historique.
      const plot = root.querySelector('[data-plot]');
      const cur = plot.querySelector('[data-cursor]'), tip = plot.querySelector('[data-tip]');
      const at = (x, f) => { const n = x.perf.length; return Math.round(f * (n - 1)); };
      plot.addEventListener('pointermove', (e) => {
        const r = plot.getBoundingClientRect();
        const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
        cur.hidden = false; tip.hidden = false;
        cur.style.left = (f * r.width) + 'px';
        tip.innerHTML = X.map((x, i) => { const k = at(x, f); return `<div><span><i style="background:${COL[i]}"></i>${esc(names[i])}</span><b>${pct(x.perf[k])}</b></div><div><span>drawdown</span><span>${pct(x.dd[k])}</span></div>`; }).join('');
        const tw = tip.offsetWidth;
        tip.style.left = Math.min(r.width - tw - 8, Math.max(8, f * r.width + 12)) + 'px';
      });
      plot.addEventListener('pointerleave', () => { cur.hidden = true; tip.hidden = true; });
    }

    render();
    root.querySelector('[data-btc-close]').focus();
  }

  window.CHESTCompare = { open, close };
})();
