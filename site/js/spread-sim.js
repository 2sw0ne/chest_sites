// Simulation du spread dans un backtest (option « Simuler le spread » de backtest-view.html).
//
// Le moteur travaille en multiples de R. Un spread est un coût en PRIX ; pour le convertir en R il faut la
// distance du stop de CHAQUE trade : coût (R) = spread / distance du stop, et rr_net = rr - coût. Cela vaut pour
// un TP (on gagne rr·stop - spread), un SL (on perd stop + spread) et un BE (on perd le spread).
//
// Distance du stop, par ordre de fiabilité (la première disponible l'emporte) :
//   1. colonne « SL (pips) » du fichier                         -> 'sl'
//   2. |prix de sortie - prix d'entrée| / |RR|                  -> 'prix'   (colonnes « Prix d'entrée » / « Prix de sortie »)
//   3. |pips réalisés| / |RR|                                   -> 'pips'   (colonne « Pips »)
//   4. médiane des distances trouvées ci-dessus (≥ 5 trades)    -> 'mediane' (BE, lignes sans prix)
//   5. stop moyen saisi par l'utilisateur                       -> 'saisi'
//   Sans aucune distance : le trade n'est pas ajusté (et c'est dit).
//
// LES SPREADS DES PROFILS SONT DES ORDRES DE GRANDEUR (de mémoire, non vérifiés sur les sites des courtiers ni
// des firmes), commission incluse en équivalent spread, et valables hors annonces / ouverture. Ils sont tous
// modifiables à l'écran : le bon réflexe est de les remplacer par le spread réellement vu dans MT5.
(() => {
  'use strict';

  // pip : taille d'un « pip » en prix (convention de l'outil : or 0,10 $, indices et crypto 1 point / 1 $).
  const INSTRUMENTS = {
    XAUUSD: { label: 'Or (XAUUSD)', pip: 0.1, unit: '$' },
    EURUSD: { label: 'EURUSD', pip: 0.0001, unit: '' },
    GBPUSD: { label: 'GBPUSD', pip: 0.0001, unit: '' },
    USDJPY: { label: 'USDJPY', pip: 0.01, unit: '' },
    GBPJPY: { label: 'GBPJPY', pip: 0.01, unit: '' },
    NAS100: { label: 'Nasdaq (NAS100)', pip: 1, unit: 'pt' },
    US30: { label: 'Dow Jones (US30)', pip: 1, unit: 'pt' },
    BTCUSD: { label: 'Bitcoin (BTCUSD)', pip: 1, unit: '$' },
  };
  const ORDER = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'GBPJPY', 'NAS100', 'US30', 'BTCUSD'];

  const row = (xau, eur, gbp, jpy, gbpjpy, nas, us30, btc) => ({ XAUUSD: xau, EURUSD: eur, GBPUSD: gbp, USDJPY: jpy, GBPJPY: gbpjpy, NAS100: nas, US30: us30, BTCUSD: btc });

  // Spread effectif moyen en pips, commission aller-retour convertie en équivalent spread.
  // Fourchettes de prix plausibles (très larges) : sert à repérer un instrument mal choisi (prix du fichier incohérents).
  const PRICE_RANGE = {
    XAUUSD: [800, 8000], EURUSD: [0.7, 1.7], GBPUSD: [0.9, 2], USDJPY: [70, 220], GBPJPY: [100, 280],
    NAS100: [3000, 40000], US30: [15000, 70000], BTCUSD: [3000, 250000],
  };

  const PROFILES = [
    { id: 'none', label: 'Aucun (référence)', group: 'Référence', spreads: row(0, 0, 0, 0, 0, 0, 0, 0) },
    { id: 'ftmo', label: 'FTMO', group: 'Propfirms', spreads: row(2.5, 0.9, 1.1, 1.0, 2.0, 1.5, 3, 25) },
    { id: 'fundednext', label: 'FundedNext', group: 'Propfirms', spreads: row(3.0, 1.1, 1.4, 1.3, 2.5, 2, 4, 30) },
    { id: 'the5ers', label: 'The5ers', group: 'Propfirms', spreads: row(3.0, 1.2, 1.5, 1.4, 2.6, 2, 4, 30) },
    { id: 'fundingpips', label: 'Funding Pips', group: 'Propfirms', spreads: row(3.5, 1.3, 1.6, 1.4, 2.8, 2, 4, 35) },
    { id: 'blueberry', label: 'Blueberry Funded', group: 'Propfirms', spreads: row(2.5, 1.0, 1.3, 1.2, 2.2, 2, 4, 30) },
    { id: 'alpha', label: 'Alpha Capital', group: 'Propfirms', spreads: row(3.0, 1.1, 1.4, 1.3, 2.5, 2, 4, 30) },
    { id: 'vantage-raw', label: 'Vantage Raw ECN', group: 'Courtiers', spreads: row(2.3, 0.9, 1.1, 1.0, 2.0, 1.6, 3, 22) },
    { id: 'vantage-std', label: 'Vantage Standard', group: 'Courtiers', spreads: row(3.0, 1.3, 1.6, 1.5, 2.8, 2, 4, 35) },
    { id: 'icmarkets', label: 'IC Markets Raw', group: 'Courtiers', spreads: row(2.0, 0.7, 0.9, 0.9, 1.8, 1.2, 2.5, 18) },
    { id: 'pepperstone', label: 'Pepperstone Razor', group: 'Courtiers', spreads: row(2.0, 0.7, 0.9, 0.9, 1.8, 1.2, 2.5, 18) },
    { id: 'standard', label: 'Compte standard typique', group: 'Courtiers', spreads: row(4.0, 1.6, 2.0, 1.8, 3.5, 2.5, 5, 45) },
    { id: 'stress', label: 'Mauvaises conditions (×2 standard)', group: 'Stress test', spreads: row(8, 3.2, 4, 3.6, 7, 5, 10, 90) },
  ];

  const profileById = (id) => PROFILES.find((p) => p.id === id) || PROFILES[0];

  // Devine l'instrument depuis le titre / la description du backtest (l'utilisateur peut corriger).
  function guessInstrument(text) {
    const s = String(text || '').toUpperCase();
    if (/XAU|GOLD|\bOR\b/.test(s)) return 'XAUUSD';
    if (/NAS|NDX|US100/.test(s)) return 'NAS100';
    if (/US30|DOW|DJI/.test(s)) return 'US30';
    if (/BTC|BITCOIN/.test(s)) return 'BTCUSD';
    if (/GBPJPY/.test(s)) return 'GBPJPY';
    if (/USDJPY/.test(s)) return 'USDJPY';
    if (/GBPUSD/.test(s)) return 'GBPUSD';
    if (/EURUSD/.test(s)) return 'EURUSD';
    return 'XAUUSD';
  }

  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const isBeTrade = (t) => String(t.result).toUpperCase() === 'BE';
  const median = (a) => { const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

  // Distance du stop d'un trade en PRIX, ou null (voir l'en-tête du fichier).
  function stopOf(t, pip) {
    if (isNum(t.slPips) && t.slPips > 0) return { d: t.slPips * pip, src: 'sl' };
    const rr = Math.abs(Number(t.rr));
    if (!isBeTrade(t) && rr >= 0.2) { // un RR minuscule rend la distance déduite trop bruitée
      if (isNum(t.entryPrice) && isNum(t.exitPrice)) {
        const d = Math.abs(t.exitPrice - t.entryPrice) / rr;
        if (d > 0) return { d, src: 'prix' };
      }
      if (isNum(t.pips) && t.pips !== 0) return { d: Math.abs(t.pips) * pip / rr, src: 'pips' };
    }
    return null;
  }

  /**
   * apply(trades, { spreadPips, instrument, stopPips })
   *  -> { trades (copies ajustées), summary }
   * Ne modifie jamais les trades reçus. rr_net = rr - spread / stop ; pour un BE le coût est porté par `beRr`
   * (le moteur lit rrOf(t)). `rr0` garde le RR d'origine.
   */
  function apply(trades, opts) {
    const inst = INSTRUMENTS[opts.instrument] || INSTRUMENTS.XAUUSD;
    const spreadPrice = Math.max(0, Number(opts.spreadPips) || 0) * inst.pip;
    const assumed = Number(opts.stopPips) > 0 ? Number(opts.stopPips) * inst.pip : null;
    const found = trades.map((t) => stopOf(t, inst.pip));
    const known = found.filter(Boolean).map((f) => f.d);
    const med = known.length >= 5 ? median(known) : null;
    const by = { sl: 0, prix: 0, pips: 0, mediane: 0, saisi: 0 };
    let skipped = 0, costSum = 0, adjusted = 0;

    const out = trades.map((t, i) => {
      let f = found[i];
      if (!f && med) f = { d: med, src: 'mediane' };
      if (!f && assumed) f = { d: assumed, src: 'saisi' };
      if (!f || !(spreadPrice > 0)) { if (!f) skipped++; return t; }
      const cost = spreadPrice / f.d;
      by[f.src]++; adjusted++; costSum += cost;
      if (isBeTrade(t)) return Object.assign({}, t, { beRr: -cost, spreadCostR: cost });
      return Object.assign({}, t, { rr0: Number(t.rr) || 0, rr: (Number(t.rr) || 0) - cost, spreadCostR: cost });
    });

    const entries = trades.map((t) => t.entryPrice).filter(isNum);
    const medEntry = entries.length >= 5 ? median(entries) : null;
    const range = PRICE_RANGE[opts.instrument];
    const priceMismatch = !!(medEntry && range && (medEntry < range[0] || medEntry > range[1]));

    return {
      trades: out,
      summary: {
        total: trades.length, adjusted, skipped, bySource: by,
        avgCostR: adjusted ? costSum / adjusted : 0,
        spreadPrice, medianStopPrice: med, pip: inst.pip,
        priceMismatch, medianEntryPrice: medEntry,
        realShare: trades.length ? (by.sl + by.prix + by.pips) / trades.length : 0,
      },
    };
  }

  window.CHESTSpread = { INSTRUMENTS, ORDER, PROFILES, profileById, guessInstrument, apply };
})();
