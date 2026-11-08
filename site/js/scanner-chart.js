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

  // Verrouille l'indicateur : pas de clic sur la légende ni de réglages ouverts depuis le graphique.
  function lockIndicators(chart) {
    try {
      chart.renderer.setLegendActions([]);
      chart.renderer.setSettingsVisibility(false);
    } catch (e) {
      console.warn('Scanner: verrouillage des réglages non appliqué', e);
    }
  }

  // Vue par défaut : les dernières bougies (et non une plage de temps fixe). Sinon le week-end,
  // sans bougies, occupe une bonne partie de la fenêtre et le graphique paraît vide.
  function showLastBars(chart, bars, count) {
    try {
      const core = chart.renderer && chart.renderer.renderer;
      if (!core || !core.setVisibleRange || bars.length === 0) return;
      const first = bars[Math.max(0, bars.length - count)];
      const last = bars[bars.length - 1];
      const pad = 5 * 60 * 1000;
      core.setVisibleRange({ from: first.time, to: last.time + pad });
    } catch (e) {
      console.warn('Scanner: vue par défaut non appliquée', e);
    }
  }

  // Échelle figée sur les bougies visibles (scanners marqués fixedScale : Algomni, Wave).
  // Les dessins hors cadre n'étirent alors plus le graphique.
  function freezeScaleToCandles(chart, bars) {
    try {
      const core = chart.renderer && chart.renderer.renderer;
      const pane = core && core.scene && core.scene.orderedPanes().find((p) => p.kind === 'price');
      if (!pane || !bars.length) return;
      let lo = Infinity;
      let hi = -Infinity;
      for (const c of bars) {
        if (c.low < lo) lo = c.low;
        if (c.high > hi) hi = c.high;
      }
      if (!isFinite(lo) || !isFinite(hi)) return;
      const m = (hi - lo) * 0.1 || 1;
      core.setManualScale(pane, { min: lo - m, max: hi + m, invert: false });
    } catch (e) {
      console.warn('Scanner: échelle non figée', e);
    }
  }

  // ---- Affichage du graphique (2026-10-18, demande utilisateur) : masquer des éléments du script
  // et ajouter des indicateurs absents du script (Ichimoku, stochastique). Tout se fait ICI, sur le
  // modèle déjà reçu : aucun recalcul serveur, aucun crédit Twelve Data, le zoom est conservé.
  // Règles par scanner : chaque élément du modèle Vela est reconnu par son identifiant (dérivé du
  // titre du plot Pine) ou par sa forme (ligne prolongée, texte d'une étiquette).
  const VISUALS_KEY = 'chest_chart_visuals';
  // Petits outils de reconnaissance. Un plot Pine devient « :<type>:<titre-en-minuscules>#n » dans
  // le modèle Vela ; label.new/line.new/box.new ont un id numéroté, on les reconnaît par leur texte
  // ou leur forme (prolongement, ligne horizontale…).
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const plotIs = (...names) => { const re = new RegExp(':[a-z]+:(' + names.map(esc).join('|') + ')#'); return (el) => re.test(el.id || ''); };
  const textIs = (re) => (el) => re.test(el.text || '');
  const either = (...fns) => (el) => fns.some((f) => f(el));
  const everything = () => true;
  const extIs = (...ext) => (el) => ext.includes(el.extend || 'none');
  const flat = (el) => el.y1 === el.y2;
  const PRICE_TAG = /\(\s*-?[\d\s.,]+\)$/; // « SL (4 176,28) »
  const VISUAL_RULES = {
    pulse: [
      { key: 'arrows', label: 'Flèches', hint: 'Micro-flèches ↑ ↓', def: true, labels: plotIs('buy-arrow', 'sell-arrow') },
      { key: 'pullback', label: 'Triangles de pullback', def: true, labels: plotIs('micropullback-buy', 'micropullback-sell') },
      { key: 'clouds', label: 'Nuages', hint: 'Bandes de volatilité', def: true, series: plotIs('bb1-upper', 'bb1-lower', 'bb2-upper', 'bb2-lower'), fills: plotIs('upper-band-gap-fill', 'lower-band-gap-fill') },
      { key: 'ribbon', label: 'Ruban EMA 8 / 13', def: true, series: plotIs('ema-8', 'ema-13'), fills: plotIs('fill-ema8-ema13') },
      { key: 'ema', label: 'EMA principale', hint: 'Moyenne longue', def: true, series: plotIs('main-ma', 'main-ma-glow') },
      { key: 'dots', label: 'Ronds', hint: 'Points de retournement', def: false, labels: plotIs('blue-flip-dot', 'red-flip-dot') },
      { key: 'hl', label: 'Repères H / L', def: true, labels: either(plotIs('h-marker', 'l-marker'), (el) => /:label:\d+#/.test(el.id || '') && /^[HL]$/.test(el.text || '')) },
      { key: 'trend', label: 'Trendlines', def: false, lines: (el) => !!el.extend && el.extend !== 'none' },
      { key: 'sessions', label: 'Sessions', hint: 'Hauts et bas New York, Londres, Asie', def: false, lines: extIs('none'), labels: textIs(/^(NY|LDN|Asia)\. /) },
    ],
    algomni: [
      { key: 'signals', label: 'Étiquettes BUY / SELL', def: true, labels: textIs(/^(BUY|SELL)\+?$|^[▲▼]$/) },
      { key: 'stars', label: 'Étoiles', hint: 'Sommets et creux ✵', def: true, labels: textIs(/^✵$/) },
      { key: 'sweeps', label: 'Zones de balayage', hint: 'SweepZone', def: true, boxes: extIs('none') },
      { key: 'rounds', label: 'Niveaux ronds', hint: 'Zones 5 / 10 / 25', def: true, boxes: extIs('both'), lines: extIs('both') },
      { key: 'ema', label: 'EMA 200', def: true, series: plotIs('ema200-mtf') },
      { key: 'stop', label: 'Stop suiveur', hint: 'Ligne ATR', def: true, series: plotIs('volume-des-bougies') },
    ],
    'swyper-v6': [
      // SWYPER (2026-10-30) : positions START et PULL, bougie de confirmation, panneau de pression
      // (zones de sweep calculées mais sans couleur dans le script, showSweeps = false : rien à basculer)
      { key: 'arrows', label: 'Flèches d’entrée', hint: '△ START, ▲ PULL', def: true, labels: either(textIs(/^[▲▼△▽↑↓⬆⬇⇧⇩]$/), (el) => el.style === 'arrowup' || el.style === 'arrowdown') },
      { key: 'star', label: 'Étoile', hint: 'Setup armé ✦', def: true, labels: textIs(/^✦$/) },
      { key: 'pb', label: 'Pullbacks', hint: 'Étiquettes PB', def: true, labels: textIs(/^PB$/) },
      { key: 'levels', label: 'Niveaux', hint: 'PE, SL, TP, Fibonacci', def: true, labels: textIs(PRICE_TAG), lines: extIs('right') },
      { key: 'zone', label: 'Zone de pullback', def: true, boxes: (el) => !!el.borderColor },
      { key: 'conf', label: 'Bougie de confirmation', def: true, series: plotIs('bougie-de-confirmation') },
      { key: 'exits', label: 'Marqueurs de sortie', hint: '◆ ✕ ■', def: true, labels: textIs(/^[◆✕■]$/) },
      { key: 'ut', label: 'UT Bot', def: true, series: plotIs('ut-bot-(matr)') },
      { key: 'mcg', label: 'McGinley 10', def: true, series: plotIs('mcginley-10') },
      { key: 'table', label: 'Panneau', hint: 'Pression acheteurs / vendeurs', def: true, tables: everything },
    ],
    wolfx: [
      { key: 'arrow', label: 'Flèche de signal', def: true, labels: (el) => el.style === 'arrowup' || el.style === 'arrowdown' },
      { key: 'levels', label: 'Entrée / invalidation / TP', def: true, labels: textIs(/^(Entry Zone|Invalid Level|TP\d)/), lines: extIs('right') },
      { key: 'waves', label: 'Vagues', hint: 'Nuages EMA', def: true, series: plotIs('ema(5)', 'ema(13)', 'ema(34)', 'ema(50)', 'ema(72)', 'ema(89)', 'ema(8)', 'ema(9)'), fills: plotIs('wave1', 'wave2', 'wave3', 'smartline') },
      { key: 'smma', label: 'Ligne SMMA', def: true, series: plotIs('plot-smma') },
      { key: 'curls', label: 'Cercles TSI', def: true, labels: plotIs('curl-up', 'curl-down') },
      { key: 'vol', label: 'Pics de volume', def: true, labels: plotIs('volume-spike') },
      { key: 'table', label: 'Tableau', def: true, tables: everything },
    ],
    nexus: [
      { key: 'signals', label: 'Signaux d’entrée', hint: 'Étoiles et fantômes', def: true, labels: plotIs('nexus-long', 'nexus-short', 'ghost-long', 'ghost-short') },
      { key: 'levels', label: 'Zones de trade', hint: 'Opportunité, invalidation, cibles', def: true, labels: textIs(/Zone|HIT|Break even/), lines: everything },
      { key: 'trend', label: 'Fond de tendance', def: true, backgrounds: everything },
      { key: 'sma', label: 'SMA lente', def: true, series: plotIs('slow-sma') },
      { key: 'table', label: 'Tableau', def: true, tables: everything },
    ],
    pivot: [
      { key: 'signal', label: 'Signal BUY / SELL', def: true, labels: textIs(/^(BUY|SELL)$/) },
      { key: 'lines', label: 'Lignes des niveaux', hint: 'Pivots, extensions, S0 / R8', def: true, lines: everything },
      { key: 'tags', label: 'Étiquettes des niveaux', def: true, labels: textIs(/^(R|S|P|\+|-)\S*( \(Weekly\))?$/) },
      { key: 'zones', label: 'Zones R8 / S0', def: true, boxes: everything },
      { key: 'rsi', label: 'RSI Pivot', hint: 'Panneau du bas', def: true, pane: true },
    ],
    harmonics: [
      { key: 'pattern', label: 'Figure X A B C D', def: true, polylines: everything, lines: (el) => !flat(el), labels: textIs(/^[XABCD]$/) },
      { key: 'ratios', label: 'Ratios', def: true, labels: textIs(/^-?\d*\.?\d+$/) },
      { key: 'name', label: 'Nom et score', def: true, labels: textIs(/^(Gartley|Bat|Butterfly|Crab)/) },
      { key: 'levels', label: 'Entry / Exit / Invalidation', def: true, lines: flat, labels: textIs(/^(Entry|Exit \d|Invalidation)$/) },
    ],
    stars: [
      { key: 'stars', label: 'Étoiles', def: true, labels: textIs(/^★$/) },
      { key: 'zones', label: 'Zones', def: true, boxes: everything },
      { key: 'positions', label: 'Entrée / SL / TP', def: true, lines: (el) => extIs('none')(el) && el.style !== 'dotted', labels: textIs(PRICE_TAG) },
      { key: 'checks', label: 'Validations ✓', def: true, labels: plotIs('long-entry', 'short-entry') },
      { key: 'grid', label: 'Grille de niveaux', def: true, lines: (el) => el.extend === 'right' || el.style === 'dotted' },
    ],
    blood: [
      { key: 'signals', label: 'Signaux LONG / SHORT', def: true, labels: plotIs('long', 'short') },
      { key: 'icons', label: 'Icônes', hint: '💎 🩸 ⚡', def: true, labels: plotIs('diamond', 'blood', 'lightning') },
      { key: 'diamonds', label: 'Losanges ◆', def: true, labels: plotIs('diamond-long', 'diamond-short') },
      { key: 'poc', label: 'Signaux PoC', def: true, labels: plotIs('strong-poc-long', 'weak-poc-long', 'strong-poc-short', 'weak-poc-short', 'keep-long', 'keep-short') },
      { key: 'levels', label: 'Entrée / sorties / invalidation', def: true, labels: textIs(/^(Entry|Exit|Invalidation)/), lines: everything, boxes: everything },
      { key: 'ribbon', label: 'Ruban EMA 5 / 34', def: true, series: plotIs('ema-1', 'ema-8'), fills: plotIs('ribbon') },
      { key: 'ema', label: 'EMA 20', def: true, series: plotIs('ema-(20)') },
      { key: 'sma', label: 'SMA 120', def: true, series: plotIs('sma-(120)') },
    ],
    wave: [
      { key: 'arrows', label: 'Flèches de tendance', def: true, labels: plotIs('arrow-up', 'arrow-dn') },
      { key: 'signals', label: 'Signaux', hint: 'Score, entrée, SL / TP', def: true, labels: either(textIs(/^(PE|SL|TP\d*)\s*\(/), textIs(/^\+\d+$/)), boxes: extIs('none'), lines: extIs('none') },
      { key: 'keylvl', label: 'Niveaux clés', hint: 'Nombres ronds', def: true, lines: extIs('both'), boxes: extIs('both') },
      { key: 'pivots', label: 'Pivots Camarilla', def: true, lines: extIs('right'), labels: textIs(/^[RS]\d$/) },
      { key: 'vol', label: 'Étiquettes de volume', def: true, labels: textIs(/^[▲▼]\n/) },
      { key: 'bands', label: 'Bandes', def: true, series: plotIs('lower-bb', 'upper-bb', 'midline-bb', 'lower-bb2', 'upper-bb2', 'lower-bb3', 'upper-bb3'), fills: plotIs('fill-lower-bb2-bb3', 'fill-upper-bb2-bb3') },
      { key: 'cloud', label: 'Cloud Kalman', def: true, series: plotIs('short-kalman', 'long-kalman'), fills: plotIs('fill-kalman') },
      { key: 'vidya', label: 'VIDYA 987', def: true, series: plotIs('trend-line-(vidya-987)') },
      { key: 'vidya2', label: 'VIDYA 55 / 233', def: true, series: plotIs('vidya-55', 'vidya-233') },
      { key: 'sar', label: 'Parabolic SAR', def: true, series: plotIs('parabolic-sar') },
      { key: 'table', label: 'Panneau de tendance', def: true, tables: everything },
    ],
    supernova: [
      { key: 'signals', label: 'Étiquettes Buy / Sell', def: true, labels: textIs(/^(Buy|Sell)$/) },
      { key: 'stars', label: 'Étoiles ✸', def: true, labels: textIs(/^✸$/) },
      { key: 'levels', label: 'Niveaux', hint: 'Entrée, SL, TP', def: true, labels: textIs(PRICE_TAG), lines: everything },
      { key: 'emas', label: 'EMA rapide / lente', def: true, series: plotIs('fast-ema', 'slow-ema') },
      { key: 'long', label: 'EMA longue', def: true, series: plotIs('long-ema') },
      { key: 'clock', label: 'Horloge de trading', def: true, tables: everything },
    ],
  };
  const MODEL_KINDS = ['series', 'fills', 'labels', 'lines', 'boxes', 'polylines', 'backgrounds', 'tables'];
  // Indicateurs ajoutables : proposés seulement s'ils ne font pas déjà partie du script du scanner.
  const ADDONS = [
    { key: 'ichimoku', label: 'Nuage Ichimoku', hint: 'Leading Span A / B', def: false },
  ];
  // Déjà présents dans le script : RSI (Pulse, Pivot), MACD (panneau « MACD BLOOD », Wolf Attack de Wolfx).
  const NATIVE_ADDONS = { pulse: ['rsi'], pivot: ['rsi'], blood: ['macd'], wolfx: ['macd'] };

  function readVisuals() {
    try { return JSON.parse(localStorage.getItem(VISUALS_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function visualOn(scannerId, item) {
    const v = (readVisuals()[scannerId] || {})[item.key];
    return typeof v === 'boolean' ? v : item.def;
  }
  function filterModel(model, scannerId) {
    // Les règles ne visent que le graphique des prix : les panneaux du bas (RSI, QQE…) restent entiers.
    if (!model || !model.overlay) return model;
    const hidden = (VISUAL_RULES[scannerId] || []).filter((r) => !visualOn(scannerId, r));
    if (!hidden.length) return model;
    const out = Object.assign({}, model);
    MODEL_KINDS.forEach((kind) => {
      const tests = hidden.map((r) => r[kind]).filter(Boolean);
      if (tests.length && Array.isArray(model[kind])) out[kind] = model[kind].filter((el) => !tests.some((t) => t(el)));
    });
    return out;
  }

  // Ichimoku (9, 26, 52, décalage 26) : seulement les Leading Span A / B et le nuage, comme le
  // réglage « Style » demandé (ligne de conversion, ligne de base et délai de retournement masqués).
  function ichimokuModel(bars) {
    const n = bars.length, D = 26;
    const mid = (len, i) => {
      if (i < len - 1) return null;
      let hi = -Infinity, lo = Infinity;
      for (let k = i - len + 1; k <= i; k++) { if (bars[k].high > hi) hi = bars[k].high; if (bars[k].low < lo) lo = bars[k].low; }
      return (hi + lo) / 2;
    };
    const steps = [];
    for (let i = Math.max(1, n - 50); i < n; i++) steps.push(bars[i].time - bars[i - 1].time);
    const step = steps.sort((a, b) => a - b)[Math.floor(steps.length / 2)] || 300000;
    const timeAt = (j) => (j < n ? bars[j].time : bars[n - 1].time + (j - n + 1) * step);
    const A = [], B = [], colors = [];
    for (let j = 0; j < n + D - 1; j++) {
      const i = j - (D - 1);
      const conv = i >= 0 ? mid(9, i) : null, base = i >= 0 ? mid(26, i) : null;
      const a = conv !== null && base !== null ? (conv + base) / 2 : null;
      const b = i >= 0 ? mid(52, i) : null;
      const t = timeAt(j);
      A.push({ time: t, value: a, color: '#A5D6A7' });
      B.push({ time: t, value: b, color: '#EF9A9A' });
      colors.push(a !== null && b !== null && a < b ? '#F4433622' : '#43A04722');
    }
    const id = 'addon-ichimoku';
    return {
      id, title: 'Ichimoku', overlay: true, paneHint: 'price',
      series: [
        { id: id + ':line:span-a#0', title: 'Leading Span A', paneId: 'unrouted', kind: 'line', points: A, style: { color: '#A5D6A7', width: 1, lineStyle: 'solid' }, visible: true },
        { id: id + ':line:span-b#0', title: 'Leading Span B', paneId: 'unrouted', kind: 'line', points: B, style: { color: '#EF9A9A', width: 1, lineStyle: 'solid' }, visible: true },
      ],
      fills: [{ id: id + ':fill:cloud#0', paneId: 'unrouted', fromSeriesId: id + ':line:span-a#0', toSeriesId: id + ':line:span-b#0', colors }],
      backgrounds: [], priceLines: [], lines: [], boxes: [], labels: [], polylines: [], linefills: [], tables: [],
      inputs: [], inputValues: {}, props: [], propValues: {}, anchorTime: bars[0] ? bars[0].time : 0,
    };
  }

  // Graphique distant affiché : de quoi le redessiner sans recharger.
  let live = null; // { chart, scannerId, bars, models, handles: [], addons: {} }
  function rerun(h) { try { h.setVisible(false); h.setVisible(true); } catch (e) { console.warn('Scanner: affichage non appliqué', e); } }
  // Plusieurs interrupteurs touchés d'affilée : un seul redessin par calque, une fois les clics
  // terminés (des relances trop rapprochées sur le même calque perdaient la dernière).
  const pendingReruns = new Set();
  let rerunTimer = null;
  function queueRerun(h) {
    pendingReruns.add(h);
    clearTimeout(rerunTimer);
    rerunTimer = setTimeout(() => { const hs = [...pendingReruns]; pendingReruns.clear(); hs.forEach(rerun); }, 150);
  }
  function touches(model, rule) {
    return !!model && !!model.overlay && MODEL_KINDS.some((k) => rule[k] && Array.isArray(model[k]) && model[k].some(rule[k]));
  }
  function addonsFor(scannerId) { return ADDONS.filter((a) => !(NATIVE_ADDONS[scannerId] || []).includes(a.key)); }
  // Ajouts/retraits enchaînés l'un après l'autre : deux clics rapides n'ajoutent jamais deux fois.
  let addonChain = Promise.resolve();
  function applyAddons() { addonChain = addonChain.then(applyAddonsNow, applyAddonsNow); return addonChain; }
  async function applyAddonsNow() {
    if (!live) return;
    const cur = live;
    for (const a of addonsFor(cur.scannerId)) {
      const want = visualOn(cur.scannerId, a), has = cur.addons[a.key];
      if (want && !has) {
        cur.addons[a.key] = a.native
          ? cur.chart.addNativeIndicator(a.native)
          : await cur.chart.addIndicator('//@version=5\n//addon:' + a.key + '\nindicator("' + a.label + '", overlay=true)');
      } else if (!want && has) {
        try { has.remove(); } catch (e) { /* déjà retiré */ }
        delete cur.addons[a.key];
      }
    }
  }

  const visuals = {
    // Liste pour le menu : éléments du script (si le scanner en a) puis ajouts possibles.
    options(scannerId) {
      return {
        elements: (VISUAL_RULES[scannerId] || []).map((r) => ({ key: r.key, label: r.label, hint: r.hint || '', on: visualOn(scannerId, r) })),
        addons: addonsFor(scannerId).map((a) => ({ key: a.key, label: a.label, hint: a.hint || '', on: visualOn(scannerId, a) })),
      };
    },
    set(scannerId, key, on) {
      const all = readVisuals();
      all[scannerId] = Object.assign({}, all[scannerId], { [key]: !!on });
      try { localStorage.setItem(VISUALS_KEY, JSON.stringify(all)); } catch (e) { /* sans stockage */ }
      if (!live || live.scannerId !== scannerId) return;
      const rule = (VISUAL_RULES[scannerId] || []).find((r) => r.key === key);
      // Panneau entier du script (RSI de Pivot) : affiché / masqué tel quel.
      if (rule && rule.pane) { live.handles.forEach((h, i) => { if (live.models[i] && !live.models[i].overlay) { try { h.setVisible(!!on); } catch (e) { /* tant pis */ } } }); return; }
      // Seul le calque qui contient l'élément est redessiné (les autres panneaux ne clignotent pas).
      if (rule) live.handles.forEach((h, i) => { if (touches(live.models[i], rule)) queueRerun(h); });
      else applyAddons();
    },
    reset(scannerId) {
      const all = readVisuals();
      delete all[scannerId];
      try { localStorage.setItem(VISUALS_KEY, JSON.stringify(all)); } catch (e) { /* sans stockage */ }
      if (live && live.scannerId === scannerId) {
        live.handles.forEach((h, i) => { if ((VISUAL_RULES[scannerId] || []).some((r) => touches(live.models[i], r))) queueRerun(h); });
        applyAddons();
      }
    },
  };

  // ---- Mode distant (2026-10-06) : le script Pine ne vit pas dans le navigateur. Le serveur de
  // comptes relaie le modèle calculé par le service de calcul (bougies + sorties de chaque script).
  // Vela affiche ces sorties à l'identique via un moteur qui lit le modèle au lieu d'exécuter le code.
  function remoteEngine(models, scannerId, bars, extra) {
    return class {
      language = 'pine';
      capabilities = { streaming: false, visibleRange: false, inputs: false, props: false };
      async prepare(source, instanceId) {
        const ext = (source.match(/\/\/extra:(\w+)/) || [])[1];
        if (ext && extra[ext]) return { language: 'pine', inputs: [], props: undefined, meta: { title: extra[ext].title || 'RSI Pivot', overlay: false }, reactsToViewport: false, token: { instanceId, ext } };
        const addon = (source.match(/\/\/addon:(\w+)/) || [])[1];
        if (addon) return { language: 'pine', inputs: [], props: undefined, meta: { title: 'Ichimoku', overlay: true }, reactsToViewport: false, token: { instanceId, addon } };
        const idx = Number((source.match(/\/\/idx:(\d+)/) || [])[1] || 0);
        const model = models[idx];
        return { language: 'pine', inputs: [], props: undefined, meta: { title: model.title, overlay: model.overlay }, reactsToViewport: false, token: { instanceId, idx } };
      }
      execute(req, handlers) {
        const tok = req.prepared.token;
        // Le filtre est relu à chaque exécution : masquer/afficher un élément = relancer l'indicateur.
        const model = tok.ext ? extra[tok.ext] : tok.addon === 'ichimoku' ? ichimokuModel(bars) : filterModel(models[tok.idx], scannerId);
        setTimeout(() => { handlers.onModel(model); handlers.onDone && handlers.onDone(); }, 0);
        return { stop() {}, update() {}, setVisibleRange() {}, notifyBars() {} };
      }
    };
  }

  let remoteSeq = 0;
  async function renderRemote(opts) {
    const { containerId, fixedScale, symbolDisplay, timeframe, candles, scannerId } = opts;
    const container = document.getElementById(containerId);
    container.innerHTML = `<div class="scanner-empty">Chargement de ${symbolDisplay} et du scanner…</div>`;
    const base = (window.CHEST_CONFIG && window.CHEST_CONFIG.accountsApiUrl) || 'http://localhost:8080';
    const token = window.CHESTAccounts && CHESTAccounts.getToken && CHESTAccounts.getToken();
    let body;
    try {
      const seq = ++remoteSeq;
      const qs = new URLSearchParams({ script: scannerId, symbol: symbolDisplay, tf: timeframe });
      const res = await fetch(`${base}/scanners/model?${qs}`, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
      // Un changement de paire pendant le calcul : seule la dernière demande est affichée
      if (seq !== remoteSeq) return null;
      body = await res.json();
      if (!res.ok || !Array.isArray(body.models)) {
        container.innerHTML = res.status === 401
          ? '<div class="scanner-empty">Connecte-toi pour voir l\'indicateur de ce scanner.</div>'
          : '<div class="scanner-empty">Scanner en attente — réessaie dans un instant.</div>';
        return null;
      }
    } catch (e) {
      container.innerHTML = '<div class="scanner-empty">Scanner en attente — réessaie dans un instant.</div>';
      return null;
    }
    const bars = body.bars;
    container.innerHTML = '';
    const { Vela } = await import('https://esm.sh/@luxalgo/vela@0.6.21');
    const chart = new Vela(container, {
      symbol: symbolDisplay,
      timeframe: VELA_TIMEFRAME_MAP[opts.timeframe] || '5m',
      data: bars,
      theme: 'dark',
      drawings: true,
      volume: false, // légende "Volume 0.00" jamais utile ici (pas de vraie donnée de volume)
    });
    const extra = {};
    chart.registerEngine('pine', new (remoteEngine(body.models, scannerId, bars, extra))());
    const handles = [];
    for (let i = 0; i < body.models.length; i++) {
      handles.push(await chart.addIndicator(`//@version=5\n//idx:${i}\nindicator("remote-${i}")`));
    }
    live = { chart, scannerId, bars, models: body.models, handles, addons: {}, extra, user: [], symbol: symbolDisplay, tf: timeframe };
    // RSI de Pivot masqué par le membre : son panneau ne s'affiche pas.
    const paneRule = (VISUAL_RULES[scannerId] || []).find((r) => r.pane);
    if (paneRule && !visualOn(scannerId, paneRule)) handles.forEach((h, i) => { if (body.models[i] && !body.models[i].overlay) { try { h.setVisible(false); } catch (e) { /* tant pis */ } } });
    await applyAddons();
    await userInd.restore();
    keepDrawings(chart, scannerId, symbolDisplay, timeframe);
    // heure de Paris (DST géré automatiquement) : s'applique via applyConfig, pas via les options du constructeur
    try { chart.renderer.applyConfig({ candles: candles || DEFAULT_CANDLES, timeScale: { timezone: 'Europe/Paris' } }); } catch (e) { console.warn('Scanner: couleurs de bougies non appliquees', e); }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    showLastBars(chart, bars, 150);
    if (fixedScale) freezeScaleToCandles(chart, bars.slice(-150));
    return chart;
  }

  async function render(opts) {
    if (opts.remote) return renderRemote(opts);
    const { containerId, pineSource, secondaryPineSource, extraPineSources, fixedScale, symbolDisplay, twelveDataSymbol, timeframe, candles, scannerId } = opts;
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
      volume: false, // légende "Volume 0.00" jamais utile ici (pas de vraie donnée de volume)
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
    // Scripts supplementaires du meme scanner (ex. Assistant, MACD) : empiles sur le meme graphique.
    for (const extra of extraPineSources || []) {
      try {
        await chart.addIndicator(extra);
      } catch (e) {
        console.error('Scanner: indicateur supplementaire non charge', e);
      }
    }

    try {
      chart.renderer.applyConfig({ candles: candles || DEFAULT_CANDLES, timeScale: { timezone: 'Europe/Paris' } });
    } catch (e) {
      console.warn('Scanner: couleurs de bougies non appliquees', e);
    }
    // lockIndicators(chart) retiré : masquait les tracés des indicateurs en production.
    // Laisse Vela finir son premier cadrage, puis cale la vue sur les dernières bougies.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    showLastBars(chart, candleData, 150);
    if (fixedScale) freezeScaleToCandles(chart, candleData.slice(-150));

    keepDrawings(chart, scannerId, symbolDisplay, timeframe);
    return chart;
  }

  // ---- Restauration + sauvegarde automatique des dessins (mode local ET distant depuis le 2026-11-08 : en distant,
  // celui de la production, les dessins disparaissaient au changement de page) ----
  function keepDrawings(chart, scannerId, symbolDisplay, timeframe) {
    if (!scannerId) return;
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

  // ---- Indicateurs ajoutés par le membre (2026-11-08, « comme les indicateurs TradingView ») ----
  // Catalogue complet de Vela (76 indicateurs natifs, chacun avec ses réglages : longueurs, couleurs…) + le RSI de
  // Pivot, ajoutable sur tous les scanners. La liste et les réglages sont gardés pour la prochaine visite (tous
  // scanners confondus, comme TradingView). Les indicateurs des scanners restent verrouillés.
  const USER_IND_KEY = 'chest_chart_indicators';
  const userInd = (() => {
    const read = () => { try { const v = JSON.parse(localStorage.getItem(USER_IND_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
    const write = (v) => { try { localStorage.setItem(USER_IND_KEY, JSON.stringify(v)); } catch (e) { /* sans stockage */ } };
    const listeners = new Set();
    const emit = () => listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
    let lastSnap = '';
    function snapshot() {
      if (!live || !live.userReady) return; // jamais pendant la restauration (sinon une liste partielle écrasait la vraie)
      const v = live.user.map((u) => {
        let inputs = null; try { inputs = u.h && u.h.inputValues ? u.h.inputValues() : null; } catch (e) { inputs = null; }
        return { type: u.type, inputs, hidden: !!(u.h && u.h.visible === false) };
      });
      const j = JSON.stringify(v);
      if (j !== lastSnap) { lastSnap = j; write(v); }
    }
    setInterval(snapshot, 3000);
    window.addEventListener('pagehide', snapshot);
    async function pivotPanes() {
      if (!live) return [];
      const base = (window.CHEST_CONFIG && window.CHEST_CONFIG.accountsApiUrl) || 'http://localhost:8080';
      const token = window.CHESTAccounts && CHESTAccounts.getToken && CHESTAccounts.getToken();
      const qs = new URLSearchParams({ script: 'pivot', symbol: live.symbol, tf: live.tf });
      const res = await fetch(`${base}/scanners/model?${qs}`, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
      const body = await res.json();
      return (body.models || []).filter((m) => m && !m.overlay);
    }
    async function addOne(type, inputs, hidden) {
      const cur = live;
      if (!cur) return null;
      let h = null;
      if (type === 'pivotrsi') {
        if (cur.scannerId === 'pivot') { visuals.set('pivot', 'rsi', true); return null; } // déjà dans le script
        const panes = await pivotPanes();
        if (!panes.length || cur !== live) return null;
        const k = 'p' + Object.keys(cur.extra).length;
        cur.extra[k] = Object.assign({}, panes[0], { title: 'RSI Pivot' });
        h = await cur.chart.addIndicator('//@version=5\n//extra:' + k + '\nindicator("RSI Pivot")');
      } else {
        h = cur.chart.addNativeIndicator(type, inputs && Object.keys(inputs).length ? { inputs } : undefined);
      }
      if (!h || cur !== live) return null;
      if (hidden) { try { h.setVisible(false); } catch (e) { /* tant pis */ } }
      cur.user.push({ type, h });
      legend();
      return h;
    }
    // Ligne de légende de chaque indicateur ajouté : réglages, masquer / afficher, retirer.
    function legend() {
      if (!live) return;
      const cur = live;
      try {
        cur.chart.renderer.setLegendActions((id) => {
          const u = cur.user.find((x) => x.h && x.h.id === id);
          if (!u) return [];
          const out = [];
          if (u.type !== 'pivotrsi') out.push({ id: 'cfg', icon: 'pen', tooltip: 'Réglages', run: () => api.settings(id) });
          out.push({ id: 'eye', icon: u.h.visible === false ? 'eye-off' : 'eye', tooltip: u.h.visible === false ? 'Afficher' : 'Masquer', run: () => api.toggle(id) });
          out.push({ id: 'del', icon: 'trash', tooltip: 'Retirer', run: () => api.remove(id) });
          return out;
        });
      } catch (e) { console.warn('Scanner: actions de légende indisponibles', e); }
      emit();
    }
    const api = {
      async catalog() { return live ? live.chart.availableNativeIndicators() : []; },
      list() {
        if (!live) return [];
        const out = live.user.map((u) => ({ id: u.h.id, type: u.type, title: u.type === 'pivotrsi' ? 'RSI Pivot' : u.h.title, visible: u.h.visible !== false }));
        if (live.scannerId === 'pivot' && visualOn('pivot', VISUAL_RULES.pivot.find((r) => r.pane))) out.unshift({ id: 'pivot-own-rsi', type: 'pivotrsi', title: 'RSI Pivot (dans le scanner)', visible: true, own: true });
        return out;
      },
      async add(type) { const h = await addOne(type); if (live) live.userReady = true; snapshot(); emit(); return h; },
      remove(id) {
        if (id === 'pivot-own-rsi') { visuals.set('pivot', 'rsi', false); emit(); return; }
        if (!live) return;
        const i = live.user.findIndex((x) => x.h && x.h.id === id);
        if (i < 0) return;
        try { live.user[i].h.remove(); } catch (e) { /* déjà retiré */ }
        live.user.splice(i, 1);
        snapshot(); legend();
      },
      toggle(id) {
        const u = live && live.user.find((x) => x.h && x.h.id === id);
        if (!u) return;
        try { u.h.setVisible(u.h.visible === false); } catch (e) { /* tant pis */ }
        snapshot(); legend();
      },
      settings(id) { try { live.chart.renderer.openIndicatorSettings(id); } catch (e) { console.warn('Scanner: réglages indisponibles', e); } },
      async restore() {
        const cur = live, saved = read();
        if (!cur) return;
        for (const it of saved) {
          if (cur !== live) return; // graphique remplacé entre-temps (le graphique se dessine parfois deux fois au chargement)
          try { await addOne(it.type, it.inputs, it.hidden); } catch (e) { console.warn('Scanner: indicateur non rétabli', it.type, e); }
        }
        if (cur !== live) return;
        cur.userReady = true;
        lastSnap = JSON.stringify(saved);
        legend();
      },
      onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    };
    return api;
  })();

  window.CHESTScannerChart = { render, visuals, indicators: userInd, current: () => live };
})();
