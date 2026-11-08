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
  const hook = setInterval(() => { if (SC() && SC().indicators) { SC().indicators.onChange(() => { refreshCount(); if (!modal.hidden) paintModal(); }); refreshCount(); clearInterval(hook); } }, 300);

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
  async function toggleFull() {
    if (isFull()) {
      if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch (e) { /* tant pis */ } }
      card.classList.remove('is-max');
    } else {
      let ok = false;
      if (card.requestFullscreen && document.fullscreenEnabled) { try { await card.requestFullscreen(); ok = true; } catch (e) { ok = false; } }
      if (!ok) card.classList.add('is-max'); // iframe sans autorisation : agrandi dans le volet
    }
    paintFull();
  }
  document.addEventListener('fullscreenchange', paintFull);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && card.classList.contains('is-max')) { card.classList.remove('is-max'); paintFull(); } });

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
        ${u.own || u.type === 'pivotrsi' ? '' : `<button type="button" class="ct-mini" data-ct-cfg="${esc(u.id)}">Réglages</button>`}
        ${u.own ? '' : `<button type="button" class="ct-mini" data-ct-eye="${esc(u.id)}">${u.visible ? 'Masquer' : 'Afficher'}</button>`}
        <button type="button" class="ct-mini is-del" data-ct-del="${esc(u.id)}">Retirer</button></div>`).join('');
    }
    if (match('RSI Pivot', 'CHEST')) html += `<div class="ct-sec">CHEST</div>` + row('pivotrsi', 'RSI Pivot', 'Le RSI du scanner Pivot, sur n’importe quel scanner', 'CHEST');
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
      if (add.dataset.ctAdd === 'pivotrsi' && !h && (SC().current() || {}).scannerId !== 'pivot') toast('RSI Pivot indisponible pour le moment.');
      else toast(`${add.querySelector('.ct-row__t').firstChild.textContent} ajouté`);
      paintModal(); return;
    }
    const cfg = e.target.closest('[data-ct-cfg]'); if (cfg && I) { closeModal(); I.settings(cfg.dataset.ctCfg); return; }
    const eye = e.target.closest('[data-ct-eye]'); if (eye && I) { I.toggle(eye.dataset.ctEye); paintModal(); return; }
    const del = e.target.closest('[data-ct-del]'); if (del && I) { I.remove(del.dataset.ctDel); paintModal(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ct]'); if (!b) return;
    if (b.dataset.ct === 'ind') openModal();
    else if (b.dataset.ct === 'shot') shot();
    else if (b.dataset.ct === 'full') toggleFull();
  });

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
