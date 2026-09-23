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
  // Format attendu par l'option `timeframe` de Vela (ex. "5m", "1h", "1d") -
  // different du code interne style Pine ('1'/'5'/'240'/'D') utilise partout
  // ailleurs dans ce fichier. Sans cette conversion, Vela recoit un timeframe
  // incoherent avec l'espacement reel des bougies fournies et l'auto-fit du
  // graphique casse (bougies ecrasees sur une petite portion, reste vide) -
  // constate en direct le 2026-09-14.
  const VELA_TIMEFRAME_MAP = {
    '1': '1m', '5': '5m', '15': '15m', '30': '30m',
    '60': '1h', '240': '4h', 'D': '1d',
  };
  const DEFAULT_CANDLES = { upColor: '#089981', downColor: '#f23645', wickUpColor: '#089981', wickDownColor: '#f23645' };
  const DRAWINGS_KEY = 'chest_scanner_drawings';

  // WolfX approxime sa MA500 "multi-timeframe" (impossible ici, request.security
  // non supporte - voir scanner-store.js) par une EMA(500 x ratio HTF/TF courant)
  // calculee directement sur l'unite de temps affichee. ta.ema() exige une longueur
  // CONSTANTE LITTERALE (verifie le 2026-09-16 : un ratio calcule dynamiquement via
  // un ternaire sur timeframe.period renvoie na) - la longueur est donc injectee
  // ici, en texte, avant compilation du script, plutot que calculee dans le Pine.
  const MA500_HTF_RATIO = { '1': 5, '5': 3, '15': 2, '30': 2, '60': 4, '240': 6, 'D': 7 };
  function injectMa500Len(source, timeframe) {
    const ratio = MA500_HTF_RATIO[timeframe] || 1;
    return source.replace('__WOLFX_MA500_LEN__', String(Math.max(2, Math.round(500 * ratio))));
  }

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

  // PAS de filtre "bougie aberrante" ici — voir berich-chart.js pour le
  // detail : un ancien filtre base sur la mediane des ranges retirait ~1/3
  // des bougies reelles des qu'une periode calme (weekend/heures creuses)
  // etait presente dans les 1000 bougies, creant des trous temporels qui
  // cassaient le rendu Vela (bougies ecrasees sur une portion du graphique).
  async function fetchCandles(twelveDataSymbol, interval) {
    const key = window.CHEST_CONFIG && window.CHEST_CONFIG.twelveDataApiKey;
    if (!key) throw new Error('Clé Twelve Data manquante — voir js/config.local.example.js');
    // outputsize releve a 5000 (au lieu de 1000) : la MA500 "HTF" approximee de WolfX
    // a besoin d'une EMA de longueur allant jusqu'a 3500 (500 x ratio HTF, voir
    // MA500_HTF_RATIO plus bas) pour se rapprocher de la vraie MA multi-timeframe, et
    // ta.ema() de ce moteur exige un vrai "warm-up" de N bougies avant toute valeur
    // (verifie le 2026-09-16 : contrairement a TradingView, une EMA(1001) sur 1000
    // bougies ne renvoie JAMAIS de valeur). Meme cout en credits Twelve Data qu'avant
    // (1 credit/appel, verifie en direct - outputsize n'a pas d'impact sur le cout).
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(twelveDataSymbol)}&interval=${interval}&outputsize=5000&apikey=${key}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.status === 'error' || (json.code && json.code >= 400)) throw new Error(json.message || 'Erreur Twelve Data');
    return json.values
      .map((v) => ({
        time: Math.floor(new Date(v.datetime.replace(' ', 'T') + 'Z').getTime() / 1000) * 1000,
        open: parseFloat(v.open), high: parseFloat(v.high), low: parseFloat(v.low), close: parseFloat(v.close), volume: 0,
      }))
      .sort((a, b) => a.time - b.time);
  }

  // { containerId, pineSource, secondaryPineSource?, symbolDisplay, twelveDataSymbol, timeframe,
  //   candles?: {upColor,downColor,wickUpColor,wickDownColor} | null,
  //   scannerId?: string (necessaire pour la sauvegarde des dessins) }
  // secondaryPineSource : un 2e indicateur (overlay=false) empile sous le
  // graphique principal, ex. le QQE de WolfX ou le RSI de Pivot (retour
  // direct utilisateur du 2026-09-15) - optionnel, ignore si absent.
  async function render(opts) {
    const { containerId, pineSource, secondaryPineSource, symbolDisplay, twelveDataSymbol, timeframe, candles, scannerId } = opts;
    const container = document.getElementById(containerId);
    const interval = INTERVAL_MAP[timeframe] || '15min';

    const key = window.CHEST_CONFIG && window.CHEST_CONFIG.twelveDataApiKey;
    if (!key) {
      container.innerHTML = '<div class="scanner-empty">Clé Twelve Data manquante — voir <code>js/config.local.example.js</code>.</div>';
      return null;
    }
    // Le vrai code Pine est chargé à part, authentifié (voir strategies.html / GET /scanners) -
    // tant qu'il n'est pas encore arrivé (page pas encore connectée, ou serveur injoignable) on
    // n'affiche pas de graphique plutôt que de planter sur `pineSource.replace(...)`.
    if (!pineSource) {
      container.innerHTML = '<div class="scanner-empty">Connecte-toi pour voir l\'indicateur de ce scanner.</div>';
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
      timeframe: VELA_TIMEFRAME_MAP[timeframe] || '15m',
      data: candleData,
      theme: 'dark', // le thème clair inverse la page entière
      drawings: true,
    });

    chart.registerEngine('pine', new PineEngine());
    await chart.addIndicator(injectMa500Len(pineSource, timeframe));
    if (secondaryPineSource) {
      try {
        await chart.addIndicator(secondaryPineSource);
      } catch (e) {
        console.error('Scanner: indicateur secondaire non charge', e);
      }
    }

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
