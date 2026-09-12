// Moteur de simulation generique pour les backtests ajoutes par
// l'utilisateur. Reprend le meme principe de calcul que allin-engine.js
// (capital *= (1 + risque%/100 * rr) par trade, dans l'ordre chronologique,
// BE traite comme rr=0), generalise a un risque configurable par
// l'utilisateur (fixe ou par paliers) plutot que des constantes figees pour
// une seule strategie. Ne depend d'aucun autre fichier du site.
(() => {
  'use strict';

  function toDate(v) {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  function dayKey(d) { return d.toISOString().slice(0, 10); }

  function isSL(t) { return String(t.result).toUpperCase() === 'SL'; }
  function isBE(t) { return String(t.result).toUpperCase() === 'BE'; }

  // Ordre chronologique par cloture (ou ouverture, ou date simple si ni l'un
  // ni l'autre n'est fourni) - meme esprit que buildEvents() dans
  // allin-engine.js, simplifie : on ne gere pas ici l'entrelacement de
  // positions qui se chevauchent, seulement l'ordre de cloture.
  function sortedTrades(trades) {
    return trades.slice().sort((a, b) => {
      const da = toDate(a.close || a.open || a.date);
      const db = toDate(b.close || b.open || b.date);
      if (!da && !db) return 0;
      if (!da) return -1;
      if (!db) return 1;
      return da - db;
    });
  }

  // Risque effectif pour un trade, selon les paliers definis par
  // l'utilisateur ("apres X SL consecutifs -> risque Y%"). On prend le
  // palier le plus eleve dont le seuil est atteint - identique dans
  // l'esprit a tier() dans allin-engine.js, mais parametrable.
  function effectiveRisk(baseRisk, tiers, consecutiveSl) {
    if (!tiers || !tiers.length) return baseRisk;
    let risk = baseRisk;
    tiers.slice().sort((a, b) => a.afterSl - b.afterSl).forEach((t) => {
      if (consecutiveSl >= t.afterSl) risk = t.newRisk;
    });
    return risk;
  }

  function simulate(trades, capital0, riskConfig) {
    const ordered = sortedTrades(trades);
    let capital = capital0;
    let consecutiveSl = 0;
    const curve = [{ date: toDate(ordered[0] && (ordered[0].open || ordered[0].date)), capital, trade: null, riskUsed: null }];
    ordered.forEach((t) => {
      const risk = effectiveRisk(riskConfig.risk, riskConfig.tiers, consecutiveSl);
      const rr = isBE(t) ? 0 : Number(t.rr) || 0;
      capital = capital * (1 + (risk / 100) * rr);
      const d = toDate(t.close || t.open || t.date);
      curve.push({ date: d, capital, trade: t, riskUsed: risk });
      consecutiveSl = isSL(t) ? consecutiveSl + 1 : 0;
    });
    return curve;
  }

  function maxDrawdownPct(curve) {
    let peak = curve[0].capital, maxDd = 0;
    curve.forEach((pt) => {
      if (pt.capital > peak) peak = pt.capital;
      const dd = peak > 0 ? (peak - pt.capital) / peak * 100 : 0;
      if (dd > maxDd) maxDd = dd;
    });
    return maxDd;
  }

  // Episodes de drawdown superieurs a un seuil (ex. 10%) - meme principe que
  // ddEpisodes() dans allin-engine.js : un episode commence au dernier pic,
  // se termine quand un nouveau pic est atteint, et n'est retenu que si son
  // creux le plus profond depasse le seuil.
  function drawdownEpisodes(curve, thresholdPct) {
    const episodes = [];
    let peak = curve[0].capital, peakDate = curve[0].date;
    let inDd = false, worst = 0, worstDate = null;
    curve.forEach((pt) => {
      if (pt.capital >= peak) {
        if (inDd && worst >= thresholdPct) episodes.push({ from: peakDate, worstDate, to: pt.date, depthPct: worst });
        peak = pt.capital; peakDate = pt.date; inDd = false; worst = 0; worstDate = null;
      } else {
        const dd = peak > 0 ? (peak - pt.capital) / peak * 100 : 0;
        inDd = true;
        if (dd > worst) { worst = dd; worstDate = pt.date; }
      }
    });
    if (inDd && worst >= thresholdPct) {
      episodes.push({ from: peakDate, worstDate, to: curve[curve.length - 1].date, depthPct: worst });
    }
    return episodes;
  }

  // Plus forte baisse capital d'un jour calendaire au suivant. Necessite des
  // dates de cloture reelles pour etre fiable (voir warning cote appelant) -
  // sans elles, on retombe sur "date" seule, ce qui suppose (a tort,
  // potentiellement) que chaque position se cloture le jour de "date".
  function maxDailyDrawdownPct(curve) {
    const byDay = new Map();
    curve.forEach((pt) => { if (pt.date) byDay.set(dayKey(pt.date), pt.capital); });
    const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    if (days.length < 2) return 0;
    let maxDd = 0;
    for (let i = 1; i < days.length; i++) {
      const prevCap = days[i - 1][1], cap = days[i][1];
      const dd = prevCap > 0 ? (prevCap - cap) / prevCap * 100 : 0;
      if (dd > maxDd) maxDd = dd;
    }
    return maxDd;
  }

  function monthlyBreakdown(curve) {
    const months = new Map();
    let prevCap = curve[0].capital;
    curve.slice(1).forEach((pt) => {
      if (!pt.date) return;
      const key = pt.date.toISOString().slice(0, 7);
      if (!months.has(key)) months.set(key, { startCap: prevCap, endCap: prevCap, trades: 0, wins: 0 });
      const m = months.get(key);
      m.endCap = pt.capital;
      m.trades += 1;
      if (pt.trade && !isSL(pt.trade)) m.wins += 1;
      prevCap = pt.capital;
    });
    return [...months.entries()].map(([key, m]) => ({
      key,
      pct: m.startCap > 0 ? (m.endCap / m.startCap - 1) * 100 : 0,
      trades: m.trades,
      winRate: m.trades ? (m.wins / m.trades * 100) : 0,
    })).sort((a, b) => a.key.localeCompare(b.key));
  }

  function computeStats(curve, trades) {
    const wins = trades.filter((t) => !isSL(t)).length;
    const losses = trades.filter((t) => isSL(t)).length;
    const grossWin = trades.filter((t) => Number(t.rr) > 0).reduce((s, t) => s + Number(t.rr), 0);
    const grossLoss = Math.abs(trades.filter((t) => Number(t.rr) < 0).reduce((s, t) => s + Number(t.rr), 0));
    const startCap = curve[0].capital;
    const finalCap = curve[curve.length - 1].capital;
    return {
      totalTrades: trades.length,
      wins, losses,
      winRatePct: trades.length ? (wins / trades.length * 100) : 0,
      performancePct: startCap > 0 ? (finalCap / startCap - 1) * 100 : 0,
      finalCapital: finalCap,
      maxDrawdownPct: maxDrawdownPct(curve),
      profitFactor: grossLoss > 0 ? (grossWin / grossLoss) : null,
    };
  }

  /**
   * Calcule le rapport complet (courbe, stats, episodes de drawdown,
   * mois par mois) pour un jeu de trades + une config de risque donnee.
   * riskConfig: { risk: number (%), tiers: [{afterSl, newRisk}] }
   */
  function computeReport(trades, capital0, riskConfig) {
    const curve = simulate(trades, capital0, riskConfig || { risk: 1, tiers: [] });
    return {
      curve,
      stats: computeStats(curve, trades),
      drawdownEpisodes: drawdownEpisodes(curve, 10),
      monthly: monthlyBreakdown(curve),
      maxDailyDrawdownPct: maxDailyDrawdownPct(curve),
    };
  }

  // ---------------------------------------------------------------
  // Optimisation automatique du risque : balayage exhaustif d'une grille de
  // valeurs (0.1% a 5%, pas de 0.1) evaluee sur l'historique fourni, sous
  // contrainte. C'est une recherche transparente, pas un modele d'IA - le
  // meilleur candidat qui respecte la contrainte est garde tel quel.
  // ---------------------------------------------------------------
  const RISK_GRID = (() => {
    const steps = [];
    for (let r = 0.1; r <= 5; r = +(r + 0.1).toFixed(2)) steps.push(r);
    return steps;
  })();

  function bestUnderConstraint(trades, capital0, maxRisk, maxDd, maxDailyDd) {
    let best = null;
    RISK_GRID.filter((r) => r <= maxRisk).forEach((risk) => {
      const report = computeReport(trades, capital0, { risk, tiers: [] });
      if (maxDd != null && report.stats.maxDrawdownPct > maxDd) return;
      if (maxDailyDd != null && report.maxDailyDrawdownPct > maxDailyDd) return;
      if (!best || report.stats.performancePct > best.report.stats.performancePct) {
        best = { risk, report };
      }
    });
    return best;
  }

  /**
   * Optimisation "compte propre" : maximise le retour sous contrainte
   * souple (risque <=5%, idealement <=3% ; DD max <=30% si atteignable).
   * Relache progressivement la contrainte si rien ne la satisfait
   * pleinement, et le signale.
   */
  function optimizeCp(trades, capital0) {
    let result = bestUnderConstraint(trades, capital0, 3, 30);
    if (result) return { ...result, relaxed: false };
    result = bestUnderConstraint(trades, capital0, 5, 30);
    if (result) return { ...result, relaxed: true, relaxedNote: 'Risque étendu à 5% (aucun réglage ≤3% ne respectait un DD max de 30%).' };
    result = bestUnderConstraint(trades, capital0, 5, null);
    if (result) return { ...result, relaxed: true, relaxedNote: 'Contrainte de drawdown max (30%) non atteignable sur cet historique — meilleur compromis retenu.' };
    return null;
  }

  /**
   * Optimisation "propfirm" : maximise le retour sous contrainte STRICTE
   * (jamais >5% de DD journalier, jamais >10% de DD max). Si aucun palier
   * de risque (meme le plus bas de la grille) ne respecte ces limites,
   * renvoie null plutot que de forcer un resultat trompeur.
   */
  function optimizePf(trades, capital0) {
    return bestUnderConstraint(trades, capital0, 5, 10, 5);
  }

  window.CHESTBacktestEngine = {
    sortedTrades, effectiveRisk, simulate, computeReport, optimizeCp, optimizePf, RISK_GRID,
  };
})();
