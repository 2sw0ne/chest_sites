// Outils du graphique du Scanner (2026-11-08, « comme TradingView ») : barre au-dessus du graphique
// (Indicateurs, Capture, Plein écran), fenêtre Indicateurs (catalogue Vela + RSI Pivot, réglages, retrait) et
// outils de dessin traduits en français. S'appuie sur window.CHESTScannerChart (js/scanner-chart.js).
(function () {
  'use strict';
  const card = document.getElementById('scnrMediaCard');
  const chartBox = document.getElementById('scnrChart');
  if (!card || !chartBox) return;
  const SC = () => window.CHESTScannerChart;
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (t) => { if (window.showToast) window.showToast(t); };
  const ICON = {
    fx: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 20c2 0 2.6-1.6 3-4l1.6-9c.4-2.4 1-4 3-4"/><path d="M8 10h8"/><path d="M14.5 14l5 5M19.5 14l-5 5"/></svg>',
    cam: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.7l1.2-1.8h5.2L15.8 6h1.7A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.4" r="3.4"/></svg>',
    full: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    exit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>',
  };

  // ---------------- Barre d'outils ----------------
  const bar = document.createElement('div');
  bar.className = 'ct-bar';
  bar.innerHTML = `<button type="button" class="ct-btn" data-ct="ind">${ICON.fx}<span>Indicateurs</span><em data-ct-count hidden></em></button>
    <span class="ct-sp"></span>
    <button type="button" class="ct-btn" data-ct="shot" title="Capture du graphique (téléchargée et copiée)">${ICON.cam}<span>Capture</span></button>
    <button type="button" class="ct-btn" data-ct="full" title="Plein écran">${ICON.full}<span>Plein écran</span></button>`;
  const panel = document.getElementById('scnrPanelChart');
  panel.insertBefore(bar, panel.firstChild);

  function refreshCount() {
    const n = SC() && SC().indicators ? SC().indicators.list().length : 0;
    const el = bar.querySelector('[data-ct-count]');
    el.hidden = !n; el.textContent = n;
  }
  const hook = setInterval(() => { if (SC() && SC().indicators) { SC().indicators.onChange((ev) => { refreshCount(); if (ev && ev.settings) { if (window.CHESTOpenViz) window.CHESTOpenViz(); else openModal(); return; } if (!modal.hidden) paintModal(); }); refreshCount(); clearInterval(hook); } }, 300);

  // ---------------- Capture ----------------
  // Capture de Vela (tout le graphique : bougies, indicateurs, dessins, légendes) + un bandeau
  // « CHEST · scanner · paire · unité de temps · date » en dessous, pour partager une idée.
  const TF_TXT = { 1: 'M1', 5: 'M5', 15: 'M15', 30: 'M30', 60: 'H1', 240: 'H4', D: 'D1' };
  function composite(L, d) {
    const R = L.chart.renderer;
    const src = R && typeof R.screenshotCanvas === 'function' ? R.screenshotCanvas() : null;
    if (!src || !src.width) return null;
    const dpr = src.width / Math.max(1, chartBox.getBoundingClientRect().width || src.width), foot = 44;
    const box = { height: src.height / dpr };
    const out = document.createElement('canvas');
    out.width = src.width; out.height = Math.round(src.height + foot * dpr);
    const ctx = out.getContext('2d');
    ctx.drawImage(src, 0, 0);
    ctx.fillStyle = '#0a0a0c'; ctx.fillRect(0, box.height * dpr, out.width, foot * dpr);
    ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(0, box.height * dpr, out.width, dpr);
    const name = (window.CHESTScanners && CHESTScanners.get && (CHESTScanners.get(L.scannerId) || {}).name) || L.scannerId;
    const txt = `${name} · ${L.symbol} · ${TF_TXT[L.tf] || L.tf} · ${d.toLocaleDateString('fr-FR')} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    const y = (box.height + foot / 2) * dpr;
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${14 * dpr}px "Instrument Sans", system-ui, sans-serif`;
    const g = ctx.createLinearGradient(16 * dpr, 0, 80 * dpr, 0); g.addColorStop(0, '#fc1283'); g.addColorStop(1, '#f9a45e');
    ctx.fillStyle = g; ctx.fillText('CHEST', 16 * dpr, y);
    const w = ctx.measureText('CHEST').width;
    ctx.font = `500 ${13 * dpr}px "Instrument Sans", system-ui, sans-serif`;
    ctx.fillStyle = '#9b9ba1'; ctx.fillText(txt, 16 * dpr + w + 12 * dpr, y);
    return out.toDataURL('image/png');
  }
  async function shot() {
    const L = SC() && SC().current && SC().current();
    if (!L) { toast('Le graphique se charge encore.'); return; }
    const d = new Date(), pad = (n) => String(n).padStart(2, '0');
    let url = null;
    try { url = composite(L, d); } catch (e) { console.warn('Capture', e); url = null; }
    if (!url) { toast('Capture impossible pour le moment.'); return; }
    const name = `CHEST-${L.scannerId}-${L.symbol}-${L.tf}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.png`;
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    let copied = false;
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        const blob = await (await fetch(url)).blob();
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        copied = true;
      }
    } catch (e) { copied = false; }
    toast(copied ? 'Capture téléchargée et copiée : colle-la dans une idée School' : 'Capture téléchargée');
    bar.querySelector('[data-ct="shot"]').classList.add('is-flash');
    setTimeout(() => bar.querySelector('[data-ct="shot"]').classList.remove('is-flash'), 500);
  }

  // ---------------- Plein écran (vrai plein écran, sinon agrandi dans le volet) ----------------
  const isFull = () => document.fullscreenElement === card || card.classList.contains('is-max');
  function paintFull() {
    const b = bar.querySelector('[data-ct="full"]');
    b.innerHTML = isFull() ? `${ICON.exit}<span>Quitter</span>` : `${ICON.full}<span>Plein écran</span>`;
    setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
  }
  // Agrandi sans l'API plein écran (iPhone, 2026-11-10 : le bas du site passait par-dessus et le doigt faisait défiler
  // la page au lieu du graphique) : la carte est sortie de la page (posée sur <body>, hors de tout parent transformé),
  // la page est bloquée, et la coque (app.html) masque ses barres et donne tout l'écran au cadre (html.is-immersive).
  let mark = null;
  function setMax(on) {
    if (on === card.classList.contains('is-max')) return;
    if (on) {
      mark = document.createComment('graphique'); card.parentNode.insertBefore(mark, card);
      document.body.appendChild(card);
      card.classList.add('is-max');
    } else {
      card.classList.remove('is-max');
      if (mark && mark.parentNode) { mark.parentNode.insertBefore(card, mark); mark.remove(); }
      mark = null;
    }
    document.documentElement.classList.toggle('ct-max-lock', on);
    try { if (window.parent !== window) window.parent.document.documentElement.classList.toggle('is-immersive', on); } catch (e) { /* autre origine */ }
    window.dispatchEvent(new Event('resize'));
  }
  async function toggleFull() {
    if (isFull()) {
      if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch (e) { /* tant pis */ } }
      setMax(false);
    } else {
      let ok = false;
      if (card.requestFullscreen && document.fullscreenEnabled) { try { await card.requestFullscreen(); ok = true; } catch (e) { ok = false; } }
      if (!ok) setMax(true); // iframe sans autorisation ou iPhone : agrandi dans tout l'écran
    }
    paintFull();
  }
  document.addEventListener('fullscreenchange', paintFull);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && card.classList.contains('is-max')) { setMax(false); paintFull(); } });
  window.addEventListener('pagehide', () => { try { window.parent.document.documentElement.classList.remove('is-immersive'); } catch (e) { /* tant pis */ } });

  // ---------------- Fenêtre Indicateurs ----------------
  const CAT = {
    'Tendance': ['sma', 'ema', 'moving-average', 'rma', 'zlema', 'vidya', 'ma-envelope', 'linear-regression', 'supertrend', 'williams-alligator', 'parabolic-sar', 'chandelier-exit', 'chande-kroll-stop', 'zigzag', 'pivot-points', 'williams-fractal', '52-week-high-low', 'vwap'],
    'Oscillateurs': ['rsi', 'stochastic', 'stochastic-rsi', 'macd', 'ppo', 'awesome-oscillator', 'commodity-channel-index', 'williams-percent-r', 'chande-momentum-oscillator', 'connors-rsi', 'fisher-transform', 'trix', 'true-strength-index', 'smi-ergodic', 'schaff-trend-cycle', 'know-sure-thing', 'coppock-curve', 'detrended-price-oscillator', 'rate-of-change', 'ultimate-oscillator', 'relative-vigor-index', 'balance-of-power', 'elder-ray', 'gator-oscillator', 'aroon', 'average-directional-index', 'vortex-indicator'],
    'Volatilité': ['bollinger-bands', 'percent-b', 'bandwidth', 'keltner-channels', 'donchian-channels', 'average-true-range', 'historical-volatility', 'chaikin-volatility', 'mass-index', 'standard-deviation', 'ulcer-index', 'choppiness-index', 'relative-volatility-index', 'ttm-squeeze'],
    'Volume': ['volume', 'vpvr', 'on-balance-volume', 'accumulation-distribution', 'chaikin-money-flow', 'chaikin-oscillator', 'ease-of-movement', 'force-index', 'klinger-oscillator', 'money-flow-index', 'negative-volume-index', 'positive-volume-index', 'price-volume-trend', 'volume-oscillator', 'pvo', 'volume-flow-indicator', 'intraday-intensity'],
  };
  const FR = { sma: 'Moyenne mobile simple', ema: 'Moyenne mobile exponentielle', rsi: 'Force relative', macd: 'Convergence / divergence des moyennes', stochastic: 'Stochastique', 'bollinger-bands': 'Bandes de Bollinger', 'average-true-range': 'Volatilité moyenne', 'average-directional-index': 'Force de la tendance', 'parabolic-sar': 'Stop suiveur parabolique', vwap: 'Prix moyen pondéré', volume: 'Volume (l’or n’a pas de vrai volume)', vpvr: 'Profil de volume visible', supertrend: 'Tendance + stop', 'keltner-channels': 'Canaux de Keltner', 'donchian-channels': 'Canaux de Donchian', 'pivot-points': 'Points pivots', zigzag: 'Sommets et creux', 'williams-alligator': 'Alligator de Williams' };
  const modal = document.createElement('div');
  modal.className = 'ct-modal'; modal.hidden = true;
  modal.innerHTML = `<div class="ct-modal__veil" data-ct-close></div>
    <div class="ct-modal__win" role="dialog" aria-modal="true" aria-labelledby="ctIndT">
      <header class="ct-modal__head"><h2 id="ctIndT">Indicateurs</h2><button type="button" class="ct-x" data-ct-close aria-label="Fermer">×</button></header>
      <label class="ct-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg><input type="search" placeholder="Rechercher un indicateur" data-ct-q autocomplete="off" spellcheck="false"></label>
      <div class="ct-modal__body" data-ct-body></div>
    </div>`;
  document.body.appendChild(modal);
  let catalog = null, q = '';
  async function openModal() {
    modal.hidden = false; document.documentElement.classList.add('ct-lock');
    const input = modal.querySelector('[data-ct-q]'); input.value = q; setTimeout(() => input.focus(), 30);
    if (!catalog && SC() && SC().indicators) { try { catalog = await SC().indicators.catalog(); } catch (e) { catalog = []; } }
    paintModal();
  }
  function closeModal() { modal.hidden = true; document.documentElement.classList.remove('ct-lock'); }
  function row(type, title, hint, tag) {
    return `<button type="button" class="ct-row" data-ct-add="${esc(type)}"><span class="ct-row__t">${esc(title)}${tag ? `<i>${esc(tag)}</i>` : ''}</span>${hint ? `<span class="ct-row__h">${esc(hint)}</span>` : ''}<span class="ct-row__plus" aria-hidden="true">+</span></button>`;
  }
  function paintModal() {
    const body = modal.querySelector('[data-ct-body]');
    const I = SC() && SC().indicators;
    if (!I || !SC().current()) { body.innerHTML = '<p class="ct-empty">Le graphique se charge encore…</p>'; return; }
    const on = I.list();
    const match = (t, h) => !q || (t + ' ' + (h || '')).toLowerCase().includes(q.toLowerCase());
    let html = '';
    if (on.length && !q) {
      html += `<div class="ct-sec">Sur le graphique</div>` + on.map((u) => `<div class="ct-on"><span class="ct-on__t">${esc(u.title)}${u.visible ? '' : ' <i>masqué</i>'}</span>
        ${u.own || u.type === 'ichimoku' ? '' : u.type === 'chestrsi' ? `<label class="ct-mini ct-chk"><input type="checkbox" data-ct-div="${esc(u.id)}" ${u.opts && u.opts.divergence ? 'checked' : ''}>Calculer les divergences</label>` : `<button type="button" class="ct-mini" data-ct-cfg="${esc(u.id)}">Réglages</button>`}
        ${u.own ? '' : `<button type="button" class="ct-mini" data-ct-eye="${esc(u.id)}">${u.visible ? 'Masquer' : 'Afficher'}</button>`}
        <button type="button" class="ct-mini is-del" data-ct-del="${esc(u.id)}">Retirer</button></div>`).join('');
    }
    const chest = [['chestrsi', 'RSI', 'Panneau du bas · divergences au choix (Réglages)'], ['ichimoku', 'Nuage Ichimoku', 'Leading Span A / B et le nuage']].filter(([, t, h]) => match(t, h + ' CHEST'));
    if (chest.length) html += `<div class="ct-sec">CHEST</div>` + chest.map(([k, t, h]) => row(k, t, h, 'CHEST')).join('');
    const known = new Set([].concat(...Object.values(CAT)));
    const byType = new Map((catalog || []).filter((c) => c.supported !== false).map((c) => [c.type, c]));
    const groups = Object.entries(CAT).map(([k, types]) => [k, types.filter((t) => byType.has(t))]);
    const rest = [...byType.keys()].filter((t) => !known.has(t));
    if (rest.length) groups.push(['Autres', rest]);
    groups.forEach(([name, types]) => {
      const rows = types.map((t) => byType.get(t)).filter((c) => match(c.title, FR[c.type])).map((c) => row(c.type, c.title, FR[c.type] || ''));
      if (rows.length) html += `<div class="ct-sec">${esc(name)}</div>` + rows.join('');
    });
    body.innerHTML = html || '<p class="ct-empty">Aucun indicateur ne correspond.</p>';
  }
  modal.addEventListener('input', (e) => { if (e.target.matches('[data-ct-q]')) { q = e.target.value.trim(); paintModal(); } });
  modal.addEventListener('click', async (e) => {
    const I = SC() && SC().indicators;
    if (e.target.closest('[data-ct-close]')) { closeModal(); return; }
    const add = e.target.closest('[data-ct-add]');
    if (add && I) {
      add.disabled = true; add.classList.add('is-busy');
      const h = await I.add(add.dataset.ctAdd);
      add.disabled = false; add.classList.remove('is-busy');
      if (!h) toast('Indicateur indisponible pour le moment.');
      else toast(`${add.querySelector('.ct-row__t').firstChild.textContent} ajouté`);
      paintModal(); return;
    }
    const cfg = e.target.closest('[data-ct-cfg]'); if (cfg && I) { closeModal(); I.settings(cfg.dataset.ctCfg); return; }
    const eye = e.target.closest('[data-ct-eye]'); if (eye && I) { I.toggle(eye.dataset.ctEye); paintModal(); return; }
    const dv = e.target.closest('[data-ct-div]'); if (dv && I) { I.setRsi(dv.dataset.ctDiv, { divergence: dv.checked }); toast(dv.checked ? 'Divergences affichées' : 'Divergences masquées'); return; }
    const del = e.target.closest('[data-ct-del]'); if (del && I) { I.remove(del.dataset.ctDel); paintModal(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ct]'); if (!b) return;
    if (b.dataset.ct === 'ind') openModal();
    else if (b.dataset.ct === 'shot') shot();
    else if (b.dataset.ct === 'full') toggleFull();
  });

  // ---------------- Clic droit sur le graphique (2026-11-09, « comme TradingView ») ----------------
  // Réinitialiser l'affichage, copier le prix, alerte sur un prix ou sur une ligne horizontale tracée,
  // masquer / supprimer les dessins et les indicateurs ajoutés, mes alertes de prix, capture, plein écran.
  // Le prix proposé = clôture de la bougie sous la souris (modifiable avant de créer l'alerte).
  const A = window.CHESTAccounts;
  const apiCall = async (path, opts) => {
    const res = await fetch(A.apiBase() + path, Object.assign({}, opts, { headers: Object.assign({ Authorization: 'Bearer ' + A.getToken(), 'Content-Type': 'application/json' }, (opts && opts.headers) || {}) }));
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || 'Le serveur ne répond pas pour le moment.');
    return d;
  };
  const nfp = (v) => (v == null || isNaN(v) ? '—' : Number(v).toLocaleString('fr-FR', { maximumFractionDigits: Math.abs(v) >= 100 ? 2 : 5 }));
  const curSym = () => { const c = SC() && SC().current(); return c ? String(c.symbol || 'XAUUSD').replace(/[^A-Z0-9]/gi, '').toUpperCase() : 'XAUUSD'; };
  const drw = () => { const c = SC() && SC().current(); return c && (c.chart.drawings || c.chart.drawingsControl); };
  const allDrawings = () => { try { const d = drw(); const a = d ? d.all() : []; return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  const lineOf = (x) => { const pts = x && (x.points || x.anchors) || []; const pr = pts[0] && (pts[0].price != null ? pts[0].price : pts[0].value); return /horizontal/i.test(String(x && (x.type || x.tool || ''))) && pr != null ? Number(pr) : null; };
  let drawingsHidden = false, indHidden = false, ctxPrice = null, myAlerts = [];
  function priceUnderCursor() {
    try { const r = SC().current().chart.renderer.dataWindowReadout(); return r && r.ohlc ? parseFloat(r.ohlc.c) : null; } catch (e) { return null; }
  }
  async function loadAlerts() { try { myAlerts = (await apiCall('/alerts/prices')).alerts || []; } catch (e) { /* hors ligne */ } }
  loadAlerts();

  const ctx = document.createElement('div');
  ctx.className = 'ct-ctx'; ctx.hidden = true; ctx.setAttribute('role', 'menu');
  document.body.appendChild(ctx);
  const item = (act, label, key, extra) => `<button type="button" role="menuitem" data-cx="${act}"${extra || ''}><span>${label}</span>${key ? `<kbd>${key}</kbd>` : ''}</button>`;
  function openCtx(x, y) {
    const I = SC().indicators, ind = I ? I.list().filter((u) => !u.own) : [];
    const dr = allDrawings(), lines = dr.map(lineOf).filter((v) => v != null).slice(0, 4);
    const sym = curSym(), mine = myAlerts.filter((a) => a.symbol === sym);
    ctx.innerHTML = item('reset', 'Réinitialiser l’affichage du graphique', 'Alt + R')
      + '<hr>' + item('copy', `Copier le prix ${nfp(ctxPrice)}`)
      + '<hr>' + item('alert', `Ajouter une alerte sur ${esc(sym)} à ${nfp(ctxPrice)}…`, 'Alt + A')
      + lines.map((v) => item('alert', `Ajouter une alerte sur la ligne à ${nfp(v)}…`, '', ` data-price="${v}"`)).join('')
      + (mine.length ? item('alerts', `Mes alertes sur ${esc(sym)} (${mine.length})`) : '')
      + '<hr>' + item('hidedraw', drawingsHidden ? 'Afficher les dessins' : 'Masquer les dessins', '', dr.length ? '' : ' disabled')
      + item('deldraw', `Supprimer ${dr.length} dessin${dr.length > 1 ? 's' : ''}`, '', dr.length ? '' : ' disabled')
      + item('hideind', indHidden ? 'Afficher les indicateurs' : 'Masquer les indicateurs', '', ind.length ? '' : ' disabled')
      + item('delind', `Supprimer ${ind.length} indicateur${ind.length > 1 ? 's' : ''}`, '', ind.length ? '' : ' disabled')
      + '<hr>' + item('ind', 'Indicateurs…') + item('shot', 'Capture du graphique') + item('full', 'Plein écran');
    ctx.hidden = false;
    const r = ctx.getBoundingClientRect();
    ctx.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
    ctx.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
  }
  const closeCtx = () => { ctx.hidden = true; };
  chartBox.addEventListener('contextmenu', (e) => {
    if (!SC() || !SC().current()) return;
    e.preventDefault();
    ctxPrice = priceUnderCursor();
    openCtx(e.clientX, e.clientY);
  });
  document.addEventListener('mousedown', (e) => { if (!ctx.hidden && !ctx.contains(e.target)) closeCtx(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeCtx();
    if (!e.altKey || !SC() || !SC().current() || /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '')) return;
    if (e.code === 'KeyR') { e.preventDefault(); SC().resetView(); }
    if (e.code === 'KeyA') { e.preventDefault(); alertDialog(priceUnderCursor()); }
  });
  ctx.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-cx]'); if (!b || b.disabled) return;
    closeCtx();
    const I = SC().indicators, d = drw();
    switch (b.dataset.cx) {
      case 'reset': SC().resetView(); break;
      case 'copy': try { await navigator.clipboard.writeText(String(ctxPrice)); toast('Prix copié'); } catch (err) { toast(String(ctxPrice)); } break;
      case 'alert': alertDialog(b.dataset.price != null ? Number(b.dataset.price) : ctxPrice); break;
      case 'alerts': alertsDialog(); break;
      case 'hidedraw': {
        drawingsHidden = !drawingsHidden;
        const ids = allDrawings().map((x) => x.id).filter(Boolean);
        try { d.show(ids, !drawingsHidden); } catch (err) { try { ids.forEach((id) => d.show(id, !drawingsHidden)); } catch (e2) { /* tant pis */ } }
        toast(drawingsHidden ? 'Dessins masqués' : 'Dessins affichés'); break;
      }
      case 'deldraw': {
        const ids = allDrawings().map((x) => x.id).filter(Boolean);
        const ok = window.CHESTConfirm ? await window.CHESTConfirm(`Supprimer les ${ids.length} dessins du graphique ?`, { confirmLabel: 'Supprimer' }) : true;
        if (!ok) break;
        try { d.removeMany(ids); } catch (err) { ids.forEach((id) => { try { d.remove(id); } catch (e2) { /* tant pis */ } }); }
        toast('Dessins supprimés'); break;
      }
      case 'hideind': {
        indHidden = !indHidden;
        I.list().filter((u) => !u.own && u.visible === indHidden).forEach((u) => I.toggle(u.id));
        toast(indHidden ? 'Indicateurs masqués' : 'Indicateurs affichés'); break;
      }
      case 'delind': {
        const ind = I.list().filter((u) => !u.own);
        const ok = window.CHESTConfirm ? await window.CHESTConfirm(`Retirer les ${ind.length} indicateurs ajoutés ?`, { confirmLabel: 'Retirer' }) : true;
        if (!ok) break;
        ind.forEach((u) => I.remove(u.id)); toast('Indicateurs retirés'); break;
      }
      case 'ind': openModal(); break;
      case 'shot': shot(); break;
      case 'full': toggleFull(); break;
      default: break;
    }
  });

  // Fenêtres « Ajouter une alerte » et « Mes alertes »
  const dlg = document.createElement('div');
  dlg.className = 'ct-modal ct-adlg'; dlg.hidden = true;
  document.body.appendChild(dlg);
  const closeDlg = () => { dlg.hidden = true; };
  dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-ad-close]')) closeDlg(); });
  function alertDialog(price) {
    const sym = curSym();
    dlg.innerHTML = `<div class="ct-modal__veil" data-ad-close></div><div class="ct-modal__win ct-adlg__win" role="dialog" aria-modal="true" aria-labelledby="ctAdT">
      <div class="ct-modal__head"><b id="ctAdT">Alerte sur ${esc(sym)}</b><button type="button" class="ct-x" data-ad-close aria-label="Fermer">×</button></div>
      <label class="ct-adlg__f"><span>Prévenir quand le prix touche</span><input type="text" inputmode="decimal" id="ctAdPrice" value="${price != null && !isNaN(price) ? String(price) : ''}" autocomplete="off"></label>
      <p class="ct-adlg__h">Une notification sur tes appareils, une seule fois, dès qu’une bougie touche ce prix.</p>
      <p class="ct-adlg__err" id="ctAdErr" role="alert"></p>
      <div class="ct-adlg__a"><button type="button" class="ct-mini" data-ad-close>Annuler</button><button type="button" class="ct-mini is-go" id="ctAdGo">Créer l’alerte</button></div></div>`;
    dlg.hidden = false;
    const input = document.getElementById('ctAdPrice'); input.focus(); input.select();
    const go = async () => {
      const v = parseFloat(String(input.value).replace(',', '.').replace(/\s/g, ''));
      if (!(v > 0)) { document.getElementById('ctAdErr').textContent = 'Indique un prix.'; return; }
      try { myAlerts = (await apiCall('/alerts/prices', { method: 'POST', body: JSON.stringify({ symbol: sym, price: v, current: priceUnderCursor() }) })).alerts || []; closeDlg(); toast(`Alerte posée à ${nfp(v)}`); }
      catch (err) { document.getElementById('ctAdErr').textContent = err.message; }
    };
    document.getElementById('ctAdGo').addEventListener('click', go);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  }
  function alertsDialog() {
    const sym = curSym(), mine = myAlerts.filter((a) => a.symbol === sym);
    dlg.innerHTML = `<div class="ct-modal__veil" data-ad-close></div><div class="ct-modal__win ct-adlg__win" role="dialog" aria-modal="true" aria-labelledby="ctAlT">
      <div class="ct-modal__head"><b id="ctAlT">Mes alertes sur ${esc(sym)}</b><button type="button" class="ct-x" data-ad-close aria-label="Fermer">×</button></div>
      <ul class="ct-adlg__list">${mine.map((a) => `<li><span>${a.dir === 'up' ? 'Au-dessus de' : 'En dessous de'} <b>${nfp(a.price)}</b></span><button type="button" class="ct-mini is-del" data-ad-del="${a.id}">Retirer</button></li>`).join('') || '<li>Aucune alerte active.</li>'}</ul></div>`;
    dlg.hidden = false;
    dlg.querySelectorAll('[data-ad-del]').forEach((bt) => bt.addEventListener('click', async () => {
      try { myAlerts = (await apiCall('/alerts/prices/' + bt.dataset.adDel, { method: 'DELETE' })).alerts || []; alertsDialog(); toast('Alerte retirée'); } catch (err) { toast(err.message); }
    }));
  }

  // ---------------- Outils de dessin en français (libellés de Vela) ----------------
  const T = {
    'Cursor': 'Curseur', 'Measure': 'Mesurer', 'Eraser (click/drag to delete)': 'Gomme (clic ou glisser pour effacer)', 'Stay in drawing mode': 'Rester en mode dessin', 'Collapse toolbar': 'Replier la barre',
    'LINES': 'LIGNES', 'Trend Line': 'Ligne de tendance', 'Horizontal Line': 'Ligne horizontale', 'Ray': 'Rayon', 'Extended Line': 'Ligne étendue', 'Vertical Line': 'Ligne verticale', 'Horizontal Ray': 'Rayon horizontal', 'Cross Line': 'Ligne en croix', 'Info Line': 'Ligne d’info', 'Trend Angle': 'Angle de tendance',
    'CHANNELS': 'CANAUX', 'Parallel Channel': 'Canal parallèle', 'Disjoint Channel': 'Canal disjoint', 'Flat Top/Bottom': 'Haut / bas plat', 'Linear Regression': 'Régression linéaire',
    'PITCHFORKS': 'FOURCHES', 'Pitchfork': 'Fourche d’Andrews', 'Schiff Pitchfork': 'Fourche de Schiff', 'Modified Schiff Pitchfork': 'Fourche de Schiff modifiée', 'Inside Pitchfork': 'Fourche intérieure',
    'FIBONACCI': 'FIBONACCI', 'Fib Retracement': 'Retracement de Fibonacci', 'Fib Extension': 'Extension de Fibonacci', 'Trend-Based Fib Extension': 'Extension de Fibonacci sur tendance', 'Fib Fan': 'Éventail de Fibonacci', 'Fib Time Zones': 'Zones temporelles de Fibonacci', 'Fib Channel': 'Canal de Fibonacci', 'Fib Speed Resistance Fan': 'Éventail de résistance de vitesse', 'Trend-Based Fib Time': 'Temps de Fibonacci sur tendance', 'Fib Circles': 'Cercles de Fibonacci', 'Fib Speed Resistance Arcs': 'Arcs de résistance de vitesse', 'Fib Wedge': 'Biseau de Fibonacci', 'Fib Spiral': 'Spirale de Fibonacci',
    'GANN': 'GANN', 'Gann Fan': 'Éventail de Gann', 'Gann Box': 'Boîte de Gann', 'Gann Square': 'Carré de Gann', 'GEOMETRY': 'GÉOMÉTRIE',
    'PATTERNS': 'FIGURES', 'XABCD Pattern': 'Figure XABCD', 'ABCD Pattern': 'Figure ABCD', 'Head & Shoulders': 'Tête et épaules', 'ELLIOTT WAVES': 'VAGUES D’ELLIOTT', 'Elliott Impulse Wave (1-5)': 'Vague d’impulsion (1-5)', 'Elliott Correction Wave (ABC)': 'Vague de correction (ABC)', 'HARMONICS': 'HARMONIQUES',
    'MEASUREMENTS': 'MESURES', 'Long/Short Position': 'Position longue / courte', 'Date & Price Range': 'Plage de dates et de prix', 'Magnifier': 'Loupe', 'VOLUME': 'VOLUME', 'Anchored VWAP': 'VWAP ancré', 'Fixed Range Volume Profile': 'Profil de volume sur plage',
    'BRUSHES': 'PINCEAUX', 'Brush': 'Pinceau', 'Highlighter': 'Surligneur', 'ARROWS': 'FLÈCHES', 'Arrow': 'Flèche', 'Arrow Mark Up': 'Flèche vers le haut', 'Arrow Mark Down': 'Flèche vers le bas',
    'SHAPES': 'FORMES', 'Rectangle': 'Rectangle', 'Ellipse': 'Ellipse', 'Triangle': 'Triangle', 'Polyline': 'Polyligne', 'Circle': 'Cercle', 'Rotated Rectangle': 'Rectangle incliné', 'Path': 'Chemin', 'Arc': 'Arc', 'Curve': 'Courbe',
    'TEXT': 'TEXTE', 'Text': 'Texte', 'Callout': 'Bulle', 'Note': 'Note', 'Price Note': 'Note de prix', 'Comment': 'Commentaire', 'Price Label': 'Étiquette de prix', 'Signpost': 'Panneau',
    'ICONS': 'ICÔNES', 'Flag': 'Drapeau', 'Icon': 'Icône', 'MAGNET': 'AIMANT', 'Off': 'Désactivé', 'Weak': 'Faible', 'Strong': 'Fort',
  };
  function translate(root) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n; while ((n = w.nextNode())) { const t = n.nodeValue.trim(); if (T[t] && n.parentElement && !n.parentElement.closest('.ct-modal')) n.nodeValue = n.nodeValue.replace(t, T[t]); }
    root.querySelectorAll('[aria-label],[title]').forEach((el) => {
      ['aria-label', 'title'].forEach((a) => { const v = el.getAttribute(a); if (v && T[v]) el.setAttribute(a, T[v]); });
    });
  }
  let tq = null;
  new MutationObserver(() => { clearTimeout(tq); tq = setTimeout(() => translate(document.body), 40); }).observe(document.body, { childList: true, subtree: true });
})();
