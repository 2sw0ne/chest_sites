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
  // Relais authentifié vers Twelve Data (accounts-bridge/server.py, /twelvedata/<endpoint>) : la
  // vraie clé API ne vit plus dans un fichier livré au frontend (voir config.js/config.local.js) -
  // elle reste côté serveur (variable d'environnement Railway TWELVE_DATA_API_KEY), jamais commitée.
  function twelveDataApi(endpoint, params) {
    const base = (window.CHEST_CONFIG && window.CHEST_CONFIG.accountsApiUrl) || 'http://localhost:8080';
    const token = window.CHESTAccounts && CHESTAccounts.getToken && CHESTAccounts.getToken();
    const qs = new URLSearchParams(params).toString();
    return fetch(`${base}/twelvedata/${endpoint}?${qs}`, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
  }

  async function fetchCandles(twelveDataSymbol, interval) {
    // outputsize releve a 5000 (au lieu de 1000) : la MA500 "HTF" approximee de WolfX
    // a besoin d'une EMA de longueur allant jusqu'a 3500 (500 x ratio HTF, voir
    // MA500_HTF_RATIO plus bas) pour se rapprocher de la vraie MA multi-timeframe, et
    // ta.ema() de ce moteur exige un vrai "warm-up" de N bougies avant toute valeur
    // (verifie le 2026-09-16 : contrairement a TradingView, une EMA(1001) sur 1000
    // bougies ne renvoie JAMAIS de valeur). Meme cout en credits Twelve Data qu'avant
    // (1 credit/appel, verifie en direct - outputsize n'a pas d'impact sur le cout).
    // timezone=UTC : sans ce paramètre Twelve Data renvoie l'heure du marché (pas UTC), et
    // le filtre de fermeture ci-dessous serait décalé de plusieurs heures.
    const res = await twelveDataApi('time_series', { symbol: twelveDataSymbol, interval, outputsize: 5000, timezone: 'UTC' });
    const json = await res.json();
    // `json.error` = notre propre relais (ex. clé absente côté serveur, 401/503) ; `status`/`code` =
    // Twelve Data lui-même ; `!Array.isArray(values)` = filet de sécurité pour toute autre forme
    // inattendue - sans lui, `.map()` plantait plus bas avec un message technique illisible
    // ("Cannot read properties of undefined") au lieu de faire remonter la vraie cause.
    if (!res.ok || json.error || json.status === 'error' || (json.code && json.code >= 400) || !Array.isArray(json.values)) {
      throw new Error(json.error || json.message || 'Erreur Twelve Data');
    }
    return json.values
      .map((v) => ({
        time: Math.floor(new Date(v.datetime.replace(' ', 'T') + 'Z').getTime() / 1000) * 1000,
        open: parseFloat(v.open), high: parseFloat(v.high), low: parseFloat(v.low), close: parseFloat(v.close), volume: 0,
      }))
      .sort((a, b) => a.time - b.time);
  }

  // Etat HTF par bougie, comme TradingView avec request.security(..., lookahead_on) :
  // pour une bougie 5M donnee, la valeur HTF est celle de la bougie HTF qui la contient,
  // avec la CLOTURE FINALE de cette bougie HTF (sur l'historique). EMA 4 et SMA 10 sont
  // calculees sur les clotures HTF. Retour : Map(bucketHTF -> -1 | 0 | 1), 1 = EMA au-dessus
  // de la SMA, -1 = en dessous, 0 = indetermine (pas assez de bougies HTF).
  // Calcule sur TOUTES les bougies (avant filtre week-end/plates) : les clotures HTF sont
  // ainsi les vraies clotures du marche.
  function htfStates(allBars, minutes, emaLen, smaLen) {
    const close = new Map();
    const order = [];
    for (const c of allBars) {
      const b = Math.floor(c.time / (minutes * 60000));
      if (!close.has(b)) order.push(b);
      close.set(b, c.close);
    }
    const a = 2 / (emaLen + 1);
    const out = new Map();
    let e = null;
    const last = [];
    for (const b of order) {
      const cl = close.get(b);
      e = e === null ? cl : a * cl + (1 - a) * e;
      last.push(cl);
      if (last.length > smaLen) last.shift();
      const sma = last.length >= smaLen ? last.reduce((s, x) => s + x, 0) / smaLen : null;
      out.set(b, sma === null ? 0 : (e > sma ? 1 : e < sma ? -1 : 0));
    }
    return out;
  }
  // Pour chaque bougie retenue : [4H, 1H, 30M, 15M] (-1/0/1)
  function htfForBars(allBars, bars, emaLen, smaLen) {
    const maps = [240, 60, 30, 15].map((m) => htfStates(allBars, m, emaLen, smaLen));
    return bars.map((c) => maps.map((mp, i) => mp.get(Math.floor(c.time / ([240, 60, 30, 15][i] * 60000))) ?? 0));
  }

  // Les algos ne doivent voir QUE les moments où le marché trade. On retire donc, avant
  // le calcul, (1) les plages fermées (week-end, pause quotidienne 21h-22h UTC) et (2) les
  // bougies "plates" O=H=L=C, qui sont des remplissages de données sans transaction réelle
  // (constaté le 2026-10-05 : palier plat pendant lequel SWYPER prenait des trades).
  // Le graphique n'a pas de trou visible : Vela place les bougies par index (testé avec un
  // trou de 48 h, rendu correct).
  function isTradableBar(c) {
    if (c.open === c.high && c.high === c.low && c.low === c.close) return false;
    const d = new Date(c.time);
    const day = d.getUTCDay();   // 0 = dimanche, 6 = samedi
    const h = d.getUTCHours();
    if (day === 6) return false;                       // samedi
    if (day === 0 && h < 22) return false;             // dimanche avant l'ouverture
    if (day === 5 && h >= 22) return false;            // vendredi après la fermeture
    if (h === 21) return false;                        // pause quotidienne
    return true;
  }

  // { containerId, pineSource, secondaryPineSource?, symbolDisplay, twelveDataSymbol, timeframe,
  //   candles?: {upColor,downColor,wickUpColor,wickDownColor} | null,
  //   scannerId?: string (necessaire pour la sauvegarde des dessins) }
  // secondaryPineSource : un 2e indicateur (overlay=false) empile sous le
  // graphique principal, ex. le QQE de WolfX ou le RSI de Pivot (retour
  // direct utilisateur du 2026-09-15) - optionnel, ignore si absent.
  // Remplace le marqueur __HTF_STATES__ du script Pine par les etats 4H/1H/30M/15M calcules
  // ci-dessus, un tableau par timeframe, indexe comme les bougies affichees (bar_index).
  function injectHtfStates(source, allBars, bars) {
    if (!source.includes('__HTF_STATES__') || !allBars) return source;
    // Longueurs EMA / SMA lues dans le script (input.int), comme TradingView : 4 et 10 par defaut.
    const lenOf = (name, def) => { const m = source.match(new RegExp(name + '[ ]*=[ ]*input[.]int[(][ ]*([0-9]+)')); return m ? parseInt(m[1], 10) : def; };
    const emaLen = lenOf('lenEma', 4);
    const smaLen = lenOf('lenSma', 10);
    const st = htfForBars(allBars, bars, emaLen, smaLen);
    const names = ['hs4', 'hs1', 'hs30', 'hs15'];
    const lines = names.map((n, i) => `var float[] ${n} = array.from(${st.map((r) => r[i]).join(', ')})`);
    return source.replace('__HTF_STATES__', lines.join('\n'));
  }

  // Vela cale l'echelle verticale sur TOUT ce qui est dessine (zones, labels, lignes), y compris
  // ceux loin des bougies : Algomni etire alors le graphique a l'ouverture. On fige l'echelle sur
  // les bougies visibles : les dessins restent sur le graphique mais ne modifient plus le cadrage.
  // Verrouille l'indicateur : pas de clic sur la légende ni de réglages ouverts depuis le graphique.
  // Les réglages sont figés (code des scanners non consultable depuis l'interface).
  function lockIndicators(chart) {
    try {
      chart.renderer.setLegendActions([]);
      chart.renderer.setSettingsVisibility(false);
    } catch (e) {
      console.warn('Scanner: verrouillage des réglages non appliqué', e);
    }
  }

  function freezeScaleToCandles(chart, bars) {
    try {
      const core = chart.renderer && chart.renderer.renderer;
      const pane = core && core.scene && core.scene.orderedPanes().find((p) => p.kind === 'price');
      if (!pane) return;
      const r = core.getVisibleRange ? core.getVisibleRange() : null;
      const from = r ? r.from : -Infinity;
      const to = r ? r.to : Infinity;
      let lo = Infinity;
      let hi = -Infinity;
      for (const c of bars) {
        if (c.time < from || c.time > to) continue;
        if (c.low < lo) lo = c.low;
        if (c.high > hi) hi = c.high;
      }
      if (!isFinite(lo) || !isFinite(hi)) return;
      const m = (hi - lo) * 0.1 || 1;
      core.setManualScale(pane, { min: lo - m, max: hi + m, invert: false });
    } catch (e) {
      console.warn('Scanner: echelle non figee', e);
    }
  }

  async function render(opts) {
    const { containerId, pineSource, secondaryPineSource, symbolDisplay, twelveDataSymbol, timeframe, candles, scannerId } = opts;
    const container = document.getElementById(containerId);
    const interval = INTERVAL_MAP[timeframe] || '15min';

    // Le vrai code Pine est chargé à part, authentifié (voir strategies.html / GET /scanners) -
    // tant qu'il n'est pas encore arrivé (page pas encore connectée, ou serveur injoignable) on
    // n'affiche pas de graphique plutôt que de planter sur `pineSource.replace(...)`.
    if (!pineSource) {
      container.innerHTML = '<div class="scanner-empty">Connecte-toi pour voir l\'indicateur de ce scanner.</div>';
      return null;
    }

    container.innerHTML = `<div class="scanner-empty">Chargement de ${symbolDisplay} et du scanner…</div>`;

    let candleData;
    let allBars;
    try {
      allBars = await fetchCandles(twelveDataSymbol, interval);
      candleData = allBars.filter(isTradableBar);
    } catch (e) {
      // Jamais de detail technique ici (nom d'API, message d'exception brut) - demande utilisateur
      // 2026-09-24 : un visiteur ne doit voir ni jargon ni etat d'implementation, juste "reessaie".
      container.innerHTML = '<div class="scanner-empty">Scanner en attente — réessaie dans un instant.</div>';
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
    await chart.addIndicator(injectHtfStates(injectMa500Len(pineSource, timeframe), allBars, candleData));
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
    lockIndicators(chart);
    // Laisse Vela finir son premier cadrage, puis fige l'echelle sur les bougies.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    freezeScaleToCandles(chart, candleData);

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
