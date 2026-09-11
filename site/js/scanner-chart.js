// STASH · Stratégies — moteur de rendu générique pour les scanners ajoutés
// en libre service : même pipeline que BERICH (PineTS + Vela sur données
// Twelve Data réelles), mais paramétrable par symbole/unité de temps/script
// au lieu d'être figé sur XAU/USD. berich-chart.js n'est pas touché — cette
// page a besoin d'être générique, BERICH doit rester exactement comme testé.
(() => {
  'use strict';

  // Intervalle Vela/Pine (timeframe.period) -> intervalle Twelve Data.
  const INTERVAL_MAP = {
    '1': '1min', '5': '5min', '15': '15min', '30': '30min',
    '60': '1h', '240': '4h', 'D': '1day',
  };

  async function fetchCandles(twelveDataSymbol, interval) {
    const key = window.STASH_CONFIG && window.STASH_CONFIG.twelveDataApiKey;
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

  // { containerId, pineSource, symbolDisplay, twelveDataSymbol, timeframe }
  async function render(opts) {
    const { containerId, pineSource, symbolDisplay, twelveDataSymbol, timeframe } = opts;
    const container = document.getElementById(containerId);
    const interval = INTERVAL_MAP[timeframe] || '15min';

    const key = window.STASH_CONFIG && window.STASH_CONFIG.twelveDataApiKey;
    if (!key) {
      container.innerHTML = '<div class="scanner-empty">Clé Twelve Data manquante — voir <code>js/config.local.example.js</code>.</div>';
      return;
    }

    container.innerHTML = `<div class="scanner-empty">Chargement de ${symbolDisplay} et du scanner…</div>`;

    let candles;
    try {
      candles = await fetchCandles(twelveDataSymbol, interval);
    } catch (e) {
      container.innerHTML = `<div class="scanner-empty">Erreur Twelve Data : ${e.message}</div>`;
      return;
    }

    container.innerHTML = '';

    const [{ Vela }, { PineEngine }] = await Promise.all([
      import('https://esm.sh/@luxalgo/vela@0.6.21'),
      import('https://esm.sh/@luxalgo/vela-pinets@0.2.10?deps=@luxalgo/vela@0.6.21'),
    ]);

    const chart = new Vela(container, {
      symbol: symbolDisplay,
      timeframe,
      data: candles,
      theme: (window.STASHTheme && STASHTheme.current() === 'light') ? 'light' : 'dark',
    });

    chart.registerEngine('pine', new PineEngine());
    await chart.addIndicator(pineSource);

    // Memes couleurs de bougies que BERICH (berich-chart.js) - un seul et
    // meme moteur de graphique, doit rendre pareil partout sur le site.
    try {
      chart.renderer.applyConfig({
        candles: { upColor: '#089981', downColor: '#f23645', wickUpColor: '#089981', wickDownColor: '#f23645' },
      });
    } catch (e) {
      console.warn('Scanner: couleurs de bougies non appliquees', e);
    }
  }

  window.STASHScannerChart = { render };
})();
