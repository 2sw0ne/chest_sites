// CHEST · Stratégies — moteur de rendu générique pour les scanners : même
// pipeline que BERICH (PineTS + Vela sur données Twelve Data réelles), mais
// paramétrable par symbole/unité de temps/script/couleur de bougies au lieu
// d'être figé sur XAU/USD. berich-chart.js n'est pas touché.
//
// Sauvegarde des dessins (traits, fibo, etc.) : Vela expose chart.drawings.
// toJSON()/fromJSON() nativement (voir @luxalgo/vela). Sans ça, changer de
// paire/unité de temps recree le graphique et perd tout ce qui a ete trace —
// on persiste donc automatiquement (evenements drawing:created/edited/
// removed) dans localStorage, par scanner+paire+unite de temps, et on
// restaure la bonne analyse a chaque (re)rendu de ce meme trio.
(() => {
  'use strict';

  const INTERVAL_MAP = {
    '1': '1min', '5': '5min', '15': '15min', '30': '30min',
    '60': '1h', '240': '4h', 'D': '1day',
  };
  const DEFAULT_CANDLES = { upColor: '#089981', downColor: '#f23645', wickUpColor: '#089981', wickDownColor: '#f23645' };
  const DRAWINGS_KEY = 'chest_scanner_drawings';

  function drawingsStoreKey(scannerId, symbolDisplay, timeframe) {
    return `${scannerId}::${symbolDisplay}::${timeframe}`;
  }
  function loadAllDrawings() {
    try { return JSON.parse(localStorage.getItem(DRAWINGS_KEY) || '{}'); } catch (e) { return {}; }
  }
  function saveDrawingsFor(key, doc) {
    try {
      const all = loadAllDrawings();
      all[key] = doc;
      localStorage.setItem(DRAWINGS_KEY, JSON.stringify(all));
    } catch (e) { /* quota depassee ou stockage indisponible - tant pis, pas bloquant */ }
  }

  async function fetchCandles(twelveDataSymbol, interval) {
    const key = window.CHEST_CONFIG && window.CHEST_CONFIG.twelveDataApiKey;
    if (!key) throw new Error('Clé Twelve Data manquante — voir js/config.local.example.js');
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(twelveDataSymbol)}&interval=${interval}&outputsize=1000&apikey=${key}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.status === 'error' || (json.code && json.code >= 400)) throw new Error(json.message || 'Erreur Twelve Data');
    const candles = json.values
      .map((v) => ({
        time: Math.floor(new Date(v.datetime.replace(' ', 'T') + 'Z').getTime() / 1000) * 1000,
        open: parseFloat(v.open), high: parseFloat(v.high), low: parseFloat(v.low), close: parseFloat(v.close), volume: 0,
      }))
      .sort((a, b) => a.time - b.time);
    return dropGapArtifacts(candles);
  }

  // Cf. berich-chart.js : Twelve Data renvoie parfois une bougie aberrante au
  // redémarrage du marché (weekend/fermeture) — même heuristique de filtrage.
  function dropGapArtifacts(candles) {
    if (candles.length < 4) return candles;
    const ranges = candles.map((c) => c.high - c.low).sort((a, b) => a - b);
    const median = ranges[Math.floor(ranges.length / 2)] || 1;
    return candles.filter((c) => (c.high - c.low) <= median * 8);
  }

  // { containerId, pineSource, symbolDisplay, twelveDataSymbol, timeframe,
  //   candles?: {upColor,downColor,wickUpColor,wickDownColor} | null,
  //   scannerId?: string (necessaire pour la sauvegarde des dessins) }
  async function render(opts) {
    const { containerId, pineSource, symbolDisplay, twelveDataSymbol, timeframe, candles, scannerId } = opts;
    const container = document.getElementById(containerId);
    const interval = INTERVAL_MAP[timeframe] || '15min';

    const key = window.CHEST_CONFIG && window.CHEST_CONFIG.twelveDataApiKey;
    if (!key) {
      container.innerHTML = '<div class="scanner-empty">Clé Twelve Data manquante — voir <code>js/config.local.example.js</code>.</div>';
      return null;
    }

    container.innerHTML = `<div class="scanner-empty">Chargement de ${symbolDisplay} et du scanner…</div>`;

    let candleData;
    try {
      candleData = await fetchCandles(twelveDataSymbol, interval);
    } catch (e) {
      container.innerHTML = `<div class="scanner-empty">Erreur Twelve Data : ${e.message}</div>`;
      return null;
    }

    container.innerHTML = '';

    const [{ Vela }, { PineEngine }] = await Promise.all([
      import('https://esm.sh/@luxalgo/vela@0.6.21'),
      import('https://esm.sh/@luxalgo/vela-pinets@0.2.10?deps=@luxalgo/vela@0.6.21'),
    ]);

    const chart = new Vela(container, {
      symbol: symbolDisplay,
      timeframe,
      data: candleData,
      theme: (window.CHESTTheme && CHESTTheme.current() === 'light') ? 'light' : 'dark',
      drawings: true,
    });

    chart.registerEngine('pine', new PineEngine());
    await chart.addIndicator(pineSource);

    try {
      chart.renderer.applyConfig({ candles: candles || DEFAULT_CANDLES });
    } catch (e) {
      console.warn('Scanner: couleurs de bougies non appliquees', e);
    }

    // ---- Restauration + sauvegarde automatique des dessins ----
    if (scannerId) {
      const storeKey = drawingsStoreKey(scannerId, symbolDisplay, timeframe);
      const saved = loadAllDrawings()[storeKey];
      if (saved) { try { chart.drawings.fromJSON(saved); } catch (e) { console.warn('Scanner: restauration des dessins impossible', e); } }

      let saveTimer = null;
      const scheduleSave = () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => saveDrawingsFor(storeKey, chart.drawings.toJSON()), 400);
      };
      chart.on('drawing:created', scheduleSave);
      chart.on('drawing:edited', scheduleSave);
      chart.on('drawing:removed', scheduleSave);
    }

    return chart;
  }

  window.CHESTScannerChart = { render };
})();
