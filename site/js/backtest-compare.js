// CHEST — Comparatif de deux backtests (2026-10-24, demande utilisateur : « depuis les 3 petits points,
// choisir le backtest et la possibilité (compte propre ou propfirm) et avoir une fenêtre de comparatif »).
// Chaque backtest est recalculé par CHESTBacktestEngine.computeReport avec SON réglage : compte propre
// (b.cp, sinon 1 % fixe) ou propfirm (b.pf, sur b.pfCapital). Courbes superposées en % de performance,
// puis les indicateurs côte à côte, le meilleur des deux mis en avant.
(() => {
  'use strict';
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const COL_A = '#fc1283', COL_B = '#f9a45e';
  const hasPf = (b) => !!(b.pf && b.pf.mode);

  function reportOf(b, mode) {
    const E = window.CHESTBacktestEngine;
    if (mode === 'pf' && hasPf(b)) return { r: E.computeReport(b.trades || [], b.pfCapital || b.capital, b.pf), mode: 'pf' };
    const cfg = (b.cp && b.cp.mode) ? b.cp : { risk: 1, tiers: [] };
    return { r: E.computeReport(b.trades || [], b.capital, cfg), mode: 'cp' };
  }

  const pct = (n, d = 1) => (n == null || !isFinite(n) ? '—' : (n > 0 ? '+' : '') + n.toFixed(d).replace('.', ',') + ' %');
  const num = (n, d = 2) => (n == null || !isFinite(n) ? '—' : n.toFixed(d).replace('.', ','));
  const money = (n) => (n == null || !isFinite(n) ? '—' : '$' + Math.round(n).toLocaleString('fr-FR'));
  const monthName = (k) => { if (!k) return ''; const [y, m] = k.split('-'); return new Date(+y, +m - 1, 1).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }); };

  function metrics(r) {
    const s = r.stats, mo = r.monthly || [];
    const best = mo.reduce((a, m) => (!a || m.pct > a.pct ? m : a), null);
    const worst = mo.reduce((a, m) => (!a || m.pct < a.pct ? m : a), null);
    return [
      ['Performance', s.performancePct, pct(s.performancePct), 'high'],
      ['Capital final', s.finalCapital, money(s.finalCapital), 'none'],
      ['Taux de réussite', s.winRatePct, pct(s.winRatePct).replace('+', ''), 'high'],
      ['Profit factor', s.profitFactor, num(s.profitFactor), 'high'],
      ['Drawdown max', s.maxDrawdownPct, pct(-Math.abs(s.maxDrawdownPct)), 'low'],
      ['Drawdown journalier max', r.maxDailyDrawdownPct, pct(-Math.abs(r.maxDailyDrawdownPct || 0)), 'low'],
      ['Positions prises', s.totalTrades, String(s.totalTrades), 'none'],
      ['Gagnantes / perdantes', s.wins, `${s.wins} / ${s.losses}`, 'none'],
      ['Mois positifs', mo.length ? mo.filter((m) => m.pct > 0).length / mo.length * 100 : null, mo.length ? `${mo.filter((m) => m.pct > 0).length} sur ${mo.length}` : '—', 'high'],
      ['Meilleur mois', best ? best.pct : null, best ? `${pct(best.pct)} · ${monthName(best.key)}` : '—', 'high'],
      ['Pire mois', worst ? worst.pct : null, worst ? `${pct(worst.pct)} · ${monthName(worst.key)}` : '—', 'high'],
    ];
  }

  // Deux courbes en % de performance, chacune étalée sur toute la largeur (nombres de positions différents).
  function chart(ra, rb) {
    const W = 640, H = 200, P = 6;
    const toPct = (r) => { const c = r.curve, c0 = c[0].capital || 1; return c.map((p) => (p.capital / c0 - 1) * 100); };
    const a = toPct(ra), b = toPct(rb);
    const all = a.concat(b, [0]);
    const lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || 1;
    const y = (v) => P + (1 - (v - lo) / span) * (H - 2 * P);
    const path = (s) => s.map((v, i) => `${i ? 'L' : 'M'}${(s.length > 1 ? i / (s.length - 1) * W : 0).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="btc__svg" aria-hidden="true">
      <line x1="0" x2="${W}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" stroke="rgba(255,255,255,.16)" stroke-dasharray="3 6" vector-effect="non-scaling-stroke"/>
      <path d="${path(b)}" fill="none" stroke="${COL_B}" stroke-width="2.2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
      <path d="${path(a)}" fill="none" stroke="${COL_A}" stroke-width="2.2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    </svg>
    <div class="btc__axis"><span>${pct(hi, 0)}</span><span>${pct(lo, 0)}</span></div>`;
  }

  const STYLE = `
  .btc{ position:fixed; inset:0; z-index:200; display:grid; place-items:center; padding:20px; background:rgba(3,3,5,.62);
    -webkit-backdrop-filter:blur(10px); backdrop-filter:blur(10px); animation:btcFade .2s ease-out both; }
  @keyframes btcFade{ from{ opacity:0; } }
  .btc__box{ position:relative; width:min(940px,100%); max-height:calc(100dvh - 40px); overflow:auto; padding:26px 26px 22px; border-radius:20px;
    border:1px solid rgba(255,255,255,.13); background:rgba(14,14,17,.92); box-shadow:0 30px 90px rgba(0,0,0,.6);
    animation:btcIn .3s cubic-bezier(.16,1,.3,1) both; color:var(--chest-ink, #f6f6f7); }
  @keyframes btcIn{ from{ opacity:0; transform:translateY(10px) scale(.985); } }
  .btc__k{ display:block; font-size:10px; letter-spacing:.24em; text-transform:uppercase; color:var(--chest-ink-3, #5c5c63); margin-bottom:8px; }
  .btc__t{ margin:0 40px 18px 0; font-size:20px; font-weight:700; letter-spacing:-.02em; }
  .btc__t i{ font-style:normal; color:var(--chest-ink-3, #5c5c63); font-weight:500; padding:0 6px; }
  .btc__x{ position:absolute; top:18px; right:18px; width:34px; height:34px; display:grid; place-items:center; border-radius:10px; cursor:pointer;
    border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.04); color:var(--chest-ink-2, #9b9ba1); }
  .btc__x:hover{ color:#fff; border-color:rgba(255,255,255,.24); }
  .btc__x:active, .btc__seg button:active{ transform:scale(.97); }
  .btc__ctl{ display:flex; flex-wrap:wrap; gap:12px; align-items:flex-end; margin-bottom:18px; }
  .btc__field{ display:flex; flex-direction:column; gap:6px; flex:1 1 260px; min-width:0; font-size:10px; letter-spacing:.16em; text-transform:uppercase; color:var(--chest-ink-3, #5c5c63); }
  .btc__field select{ height:42px; border-radius:12px; padding:0 12px; font:inherit; font-size:14px; letter-spacing:0; text-transform:none; color:var(--chest-ink, #f6f6f7);
    background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.12); outline:none; }
  .btc__field select:focus{ border-color:rgba(252,18,131,.6); box-shadow:0 0 0 3px rgba(252,18,131,.18); }
  .btc__field option{ background:#121215; }
  .btc__seg{ display:inline-flex; padding:3px; gap:2px; border-radius:12px; border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.03); height:42px; box-sizing:border-box; }
  .btc__seg button{ font:inherit; font-size:13px; font-weight:600; padding:0 14px; border-radius:9px; border:0; cursor:pointer; background:none; color:var(--chest-ink-2, #9b9ba1); transition:background .2s, color .2s; }
  .btc__seg button[aria-pressed="true"]{ background:rgba(255,255,255,.1); color:#fff; }
  .btc__legend{ display:flex; flex-wrap:wrap; gap:8px 18px; margin-bottom:10px; font-size:13px; color:var(--chest-ink-2, #9b9ba1); }
  .btc__legend span{ display:inline-flex; align-items:center; gap:8px; min-width:0; }
  .btc__legend b{ color:var(--chest-ink, #f6f6f7); font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:36ch; }
  .btc__legend i{ width:18px; height:3px; border-radius:2px; flex-shrink:0; }
  .btc__chart{ position:relative; height:200px; margin-bottom:6px; border-radius:14px; border:1px solid rgba(255,255,255,.08); background:rgba(255,255,255,.015); }
  .btc__svg{ width:100%; height:100%; display:block; }
  .btc__axis{ position:absolute; top:8px; bottom:8px; right:10px; display:flex; flex-direction:column; justify-content:space-between; font-size:10.5px; color:var(--chest-ink-3, #5c5c63); font-variant-numeric:tabular-nums; pointer-events:none; }
  .btc__hint{ margin:0 0 18px; font-size:11.5px; color:var(--chest-ink-3, #5c5c63); }
  .btc__note{ margin:0 0 14px; font-size:12.5px; color:#e8b339; }
  .btc__tbl{ width:100%; border-collapse:collapse; font-size:13.5px; font-variant-numeric:tabular-nums; }
  .btc__tbl th, .btc__tbl td{ padding:10px 8px; text-align:right; border-bottom:1px solid rgba(255,255,255,.07); }
  .btc__tbl th{ font-size:10px; letter-spacing:.16em; text-transform:uppercase; color:var(--chest-ink-3, #5c5c63); font-weight:600; }
  .btc__tbl th:first-child, .btc__tbl td:first-child{ text-align:left; color:var(--chest-ink-2, #9b9ba1); }
  .btc__tbl tr:last-child td{ border-bottom:0; }
  .btc__tbl td.is-best{ color:#fff; font-weight:700; }
  .btc__tbl td.is-best::after{ content:""; display:inline-block; width:6px; height:6px; margin-left:8px; border-radius:50%; vertical-align:middle; background:var(--dot); box-shadow:0 0 8px var(--dot); }
  .btc__empty{ padding:30px 0 10px; text-align:center; color:var(--chest-ink-2, #9b9ba1); font-size:14px; }
  @media (max-width:560px){ .btc{ padding:0; align-items:end; } .btc__box{ border-radius:20px 20px 0 0; padding:22px 16px 18px; max-height:92dvh; } .btc__tbl{ font-size:12.5px; } }
  @media (prefers-reduced-motion:reduce){ .btc, .btc__box{ animation:none; } }`;

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
    const a = store.get(idA);
    if (!a) return;
    if (!document.getElementById('btcStyle')) {
      const st = document.createElement('style'); st.id = 'btcStyle'; st.textContent = STYLE; document.head.appendChild(st);
    }
    close();
    lastFocus = document.activeElement;
    const others = all.filter((b) => b.id !== a.id);
    let idB = others[0] && others[0].id;
    let mode = hasPf(a) ? 'pf' : 'cp';
    root = document.createElement('div');
    root.className = 'btc';
    root.addEventListener('click', (e) => { if (e.target === root) close(); });
    document.body.appendChild(root);
    document.addEventListener('keydown', onKey);

    function render() {
      const b = idB ? store.get(idB) : null;
      let body;
      if (!b) {
        body = '<p class="btc__empty">Ajoute un deuxième backtest pour pouvoir les comparer.</p>';
      } else {
        const A = reportOf(a, mode), B = reportOf(b, mode);
        const notes = [A, B].map((x, i) => (mode === 'pf' && x.mode === 'cp' ? `${esc((i ? b : a).title)} n’a pas de réglage propfirm : il est comparé en compte propre.` : '')).filter(Boolean);
        const ma = metrics(A.r), mb = metrics(B.r);
        const rows = ma.map((m, i) => {
          const n = mb[i];
          let wa = false, wb = false;
          if (m[3] !== 'none' && m[1] != null && n[1] != null && isFinite(m[1]) && isFinite(n[1]) && m[1] !== n[1]) {
            const aBetter = m[3] === 'high' ? m[1] > n[1] : Math.abs(m[1]) < Math.abs(n[1]);
            wa = aBetter; wb = !aBetter;
          }
          return `<tr><td>${m[0]}</td><td class="${wa ? 'is-best' : ''}" style="--dot:${COL_A}">${esc(m[2])}</td><td class="${wb ? 'is-best' : ''}" style="--dot:${COL_B}">${esc(n[2])}</td></tr>`;
        }).join('');
        body = `${notes.map((t) => `<p class="btc__note">${t}</p>`).join('')}
          <div class="btc__legend"><span><i style="background:${COL_A}"></i><b>${esc(a.title)}</b></span><span><i style="background:${COL_B}"></i><b>${esc(b.title)}</b></span></div>
          <div class="btc__chart">${chart(A.r, B.r)}</div>
          <p class="btc__hint">Performance cumulée, du premier au dernier trade de chaque backtest.</p>
          <table class="btc__tbl"><thead><tr><th>Indicateur</th><th>${esc(a.title)}</th><th>${esc(b.title)}</th></tr></thead><tbody>${rows}</tbody></table>`;
      }
      root.innerHTML = `<div class="btc__box" role="dialog" aria-modal="true" aria-labelledby="btcTitle">
        <button type="button" class="btc__x" data-btc-close aria-label="Fermer le comparatif"><svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 3l6 6M9 3l-6 6"/></svg></button>
        <span class="btc__k">01 — Comparatif</span>
        <h2 class="btc__t" id="btcTitle">${esc(a.title)}<i>vs</i>${b ? esc(b.title) : '…'}</h2>
        <div class="btc__ctl">
          <label class="btc__field">Comparer avec
            <select data-btc-pick ${others.length ? '' : 'disabled'}>${others.map((o) => `<option value="${esc(o.id)}" ${o.id === idB ? 'selected' : ''}>${esc(o.title)}</option>`).join('')}</select>
          </label>
          <div class="btc__seg" role="group" aria-label="Type de compte">
            <button type="button" data-btc-mode="cp" aria-pressed="${mode === 'cp'}">Compte propre</button>
            <button type="button" data-btc-mode="pf" aria-pressed="${mode === 'pf'}">Propfirm</button>
          </div>
        </div>
        ${body}
      </div>`;
      root.querySelector('[data-btc-close]').addEventListener('click', close);
      const pick = root.querySelector('[data-btc-pick]');
      if (pick) pick.addEventListener('change', () => { idB = pick.value; render(); root.querySelector('[data-btc-pick]').focus(); });
      root.querySelectorAll('[data-btc-mode]').forEach((btn) => btn.addEventListener('click', () => { mode = btn.dataset.btcMode; render(); }));
    }
    render();
    root.querySelector('[data-btc-close]').focus();
  }

  window.CHESTCompare = { open, close };
})();
