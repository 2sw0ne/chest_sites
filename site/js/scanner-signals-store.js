// CHEST · Stratégies — lecture des opportunités détectées par TOUS les
// scanners (webhook TradingView -> scanner-bridge), pour le panneau de
// notification. Même pattern que berich-store.js/fetchSignals(), mais une
// simple liste d'opportunités (pas de cycle ouverture/clôture à suivre).
(() => {
  'use strict';

  const LOCAL_SIGNALS_FILE = 'data/scanner-signals.json';

  async function fetchSignals() {
    const url = (window.CHEST_CONFIG && window.CHEST_CONFIG.scannerSignalsApiUrl) || '';
    const target = url || `${LOCAL_SIGNALS_FILE}?nocache=${Date.now()}`;
    const res = await fetch(target);
    if (!res.ok) throw new Error('scanner signals fetch failed');
    return res.json();
  }

  window.CHESTScannerSignals = { fetchSignals };
})();
