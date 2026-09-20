// CHEST · Compatibilité backtest ↔ prop firms.
//
// Principe : on rejoue les trades du backtest sous les règles VÉRIFIÉES de
// chaque modèle de challenge (js/propfirm-rules.js), en partant de chaque jour
// de l'historique comme si on avait acheté le challenge ce jour-là. Pour
// chaque modèle on garde le risque par trade qui maximise le taux de passage.
//
// Ce que c'est : une simulation transparente sur l'HISTORIQUE fourni. Ce n'est
// pas une prédiction. Limites assumées :
//  - la perte du jour est mesurée sur les trades CLÔTURÉS (pas de perte
//    flottante en cours de trade) ;
//  - les frais, swaps, spreads et le slippage ne sont pas simulés ;
//  - les règles non modélisées (annonces, robots, consistance des retraits…)
//    sont listées sur chaque fiche comme « à vérifier », jamais ignorées.
(() => {
  'use strict';

  const RISKS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];
  const PASS_TARGET = 80;    // taux de réussite visé pour choisir le risque conseillé
  const MIN_DECISIVE = 10;  // départs « réussi/échoué » minimum pour afficher un taux
  const MAX_STARTS = 400;
  const STRESS_RUNS = 250;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Trades triés par clôture -> tableaux compacts (rr, jour UTC).
  function prepare(trades) {
    const ordered = window.CHESTBacktestEngine.sortedTrades(trades);
    const rr = [], day = [];
    ordered.forEach((t) => {
      const d = new Date(t.close || t.open || t.date);
      if (isNaN(d.getTime())) return;
      const res = String(t.result).toUpperCase();
      rr.push(res === 'BE' ? 0 : (Number(t.rr) || 0));
      day.push(Math.floor(d.getTime() / 86400000));
    });
    return { rr, day, n: rr.length };
  }

  // Un challenge complet à partir du trade `start`. Le capital initial vaut 1.
  function run(P, start, m, riskPct) {
    const k = riskPct / 100;
    const daily = m.dailyLossPct / 100;
    const maxLoss = m.maxLossPct / 100;
    const md = m.minDays;
    const startDay = P.day[start];
    let phase = 0, bal = 1, dayStart = 1, peak = 1, curDay = startDay;
    let days = 0, profDays = 0, posSum = 0, bestDay = 0, dayHasTrade = false;

    for (let i = start; i < P.n; i++) {
      if (P.day[i] !== curDay) {
        if (dayHasTrade) {
          const pnl = bal - dayStart;
          if (pnl > 0) { posSum += pnl; if (pnl > bestDay) bestDay = pnl; }
          if (md && md.kind === 'profitable' && pnl >= md.minPct / 100) profDays++;
        }
        if (bal > peak) peak = bal;
        dayStart = bal; curDay = P.day[i]; dayHasTrade = false;
      }
      bal *= 1 + k * P.rr[i];
      if (!dayHasTrade) { dayHasTrade = true; days++; }

      if (bal < dayStart - daily) return { status: 'fail', reason: 'daily' };
      const floor = m.maxLossType === 'trailing_eod' ? peak - maxLoss : 1 - maxLoss;
      if (bal < floor) return { status: 'fail', reason: 'max' };

      if (bal >= 1 + m.phases[phase] / 100) {
        const today = bal - dayStart;
        let okDays = true;
        if (md) okDays = md.kind === 'trading' ? days >= md.count : (profDays + (today >= md.minPct / 100 ? 1 : 0)) >= md.count;
        let okBest = true;
        if (m.bestDayMaxPct != null) {
          const best = Math.max(bestDay, today > 0 ? today : 0);
          const pos = posSum + (today > 0 ? today : 0);
          okBest = pos > 0 && best / pos <= m.bestDayMaxPct / 100;
        }
        if (okDays && okBest) {
          phase++;
          if (phase >= m.phases.length) return { status: 'pass', days: P.day[i] - startDay + 1 };
          bal = 1; dayStart = 1; peak = 1;
          days = 0; profDays = 0; posSum = 0; bestDay = 0; dayHasTrade = false;
        }
      }
    }
    return { status: 'open' };
  }

  // Un départ par jour de trading (plafonné, réparti sur tout l'historique).
  function startIndexes(P) {
    const all = [];
    for (let i = 0; i < P.n; i++) if (i === 0 || P.day[i] !== P.day[i - 1]) all.push(i);
    if (all.length <= MAX_STARTS) return all;
    const out = [];
    for (let j = 0; j < MAX_STARTS; j++) out.push(all[Math.floor(j * all.length / MAX_STARTS)]);
    return out;
  }

  function evaluate(P, starts, m, risk) {
    let pass = 0, fail = 0, open = 0, daily = 0, max = 0;
    const times = [];
    starts.forEach((s) => {
      const r = run(P, s, m, risk);
      if (r.status === 'pass') { pass++; times.push(r.days); }
      else if (r.status === 'fail') { fail++; if (r.reason === 'daily') daily++; else max++; }
      else open++;
    });
    times.sort((a, b) => a - b);
    const decisive = pass + fail;
    return {
      risk, pass, fail, open, daily, max, decisive,
      passPct: decisive ? pass / decisive * 100 : null,
      medianDays: times.length ? times[Math.floor(times.length / 2)] : null,
    };
  }

  // Test de robustesse : on garde les journées intactes mais on en mélange l'ordre.
  function shuffledDays(P, rng) {
    const blocks = [];
    let cur = [];
    for (let i = 0; i < P.n; i++) {
      if (i > 0 && P.day[i] !== P.day[i - 1]) { blocks.push(cur); cur = []; }
      cur.push(P.rr[i]);
    }
    blocks.push(cur);
    for (let i = blocks.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = blocks[i]; blocks[i] = blocks[j]; blocks[j] = tmp;
    }
    const rr = [], day = [];
    blocks.forEach((b, bi) => b.forEach((v) => { rr.push(v); day.push(bi); }));
    return { rr, day, n: rr.length };
  }

  // Profil de l'historique complet à un risque donné : ce qui fait casser (ou passer) les règles.
  function profile(P, riskPct) {
    const k = riskPct / 100;
    let bal = 1, peak = 1, maxDd = 0, dayStart = 1, curDay = P.day[0];
    let worstDay = 0, bestDay = 0, posSum = 0, trades = 0, days = 0;
    const close = () => {
      const pnl = bal - dayStart;
      if (pnl < worstDay) worstDay = pnl;
      if (pnl > 0) { posSum += pnl; if (pnl > bestDay) bestDay = pnl; }
      days++;
    };
    for (let i = 0; i < P.n; i++) {
      if (P.day[i] !== curDay) { close(); dayStart = bal; curDay = P.day[i]; }
      bal *= 1 + k * P.rr[i]; trades++;
      if (bal > peak) peak = bal;
      const dd = (peak - bal) / peak; if (dd > maxDd) maxDd = dd;
    }
    close();
    return {
      worstDayPct: worstDay * 100,
      bestDayShare: posSum > 0 ? bestDay / posSum * 100 : null,
      maxDdPct: maxDd * 100,
      tradesPerDay: days ? trades / days : 0,
    };
  }

  function annualized(report, capital0, years) {
    const final = report.stats.finalCapital;
    if (!(final > 0) || !(capital0 > 0) || !(years > 0)) return null;
    return (Math.pow(final / capital0, 1 / years) - 1) * 100;
  }

  function statusOf(best) {
    if (!best) return 'na';
    if (best.passPct >= 60 && (best.stressPassPct == null || best.stressPassPct >= 40)) return 'good';
    if (best.passPct >= 30) return 'mid';
    return 'bad';
  }

  /**
   * trades : trades du backtest (déjà filtrés par année si besoin)
   * capital0 : capital initial du backtest
   * Renvoie { rows, verdict, own, prop } ou { error }.
   */
  function fit(trades, capital0) {
    const E = window.CHESTBacktestEngine;
    const P = prepare(trades);
    if (P.n < 30) return { error: 'Il faut au moins 30 trades datés pour simuler un challenge.' };
    const spanDays = P.day[P.n - 1] - P.day[0] + 1;
    if (spanDays < 20) return { error: 'La période est trop courte (moins de 20 jours) pour simuler un challenge.' };

    const starts = startIndexes(P);
    const rng = mulberry32(20260920);

    const rows = window.CHESTPropRules.models.map((m) => {
      // Risque conseillé : le plus élevé (donc le plus rapide et le plus
      // rentable) qui garde au moins 80 % de réussite. « Maximiser le passage »
      // choisirait toujours le risque minimal, qui passe presque à coup sûr
      // mais très lentement. Si aucun risque n'atteint 80 %, on retient le plus
      // élevé à moins de 5 points du meilleur taux observé.
      const evs = RISKS.map((risk) => evaluate(P, starts, m, risk)).filter((ev) => ev.decisive >= MIN_DECISIVE);
      let best = null;
      if (evs.length) {
        const top = Math.max(...evs.map((ev) => ev.passPct));
        const pool = evs.filter((ev) => ev.passPct >= PASS_TARGET);
        const pick = pool.length ? pool : evs.filter((ev) => ev.passPct >= top - 5);
        best = pick.reduce((a, b) => (b.risk > a.risk ? b : a));
      }
      if (best) {
        best.curve = evs.map((ev) => ({ risk: ev.risk, passPct: ev.passPct, medianDays: ev.medianDays }));
        let sp = 0, sf = 0;
        for (let i = 0; i < STRESS_RUNS; i++) {
          const r = run(shuffledDays(P, rng), 0, m, best.risk);
          if (r.status === 'pass') sp++; else if (r.status === 'fail') sf++;
        }
        best.stressPassPct = sp + sf ? sp / (sp + sf) * 100 : null;
        best.blocker = best.fail ? (best.daily >= best.max ? 'daily' : 'max') : null;
        best.blockerShare = best.fail ? Math.max(best.daily, best.max) / best.fail * 100 : null;
        best.openPct = starts.length ? best.open / starts.length * 100 : 0;
      }
      return { model: m, best, status: statusOf(best) };
    });

    const rank = { good: 0, mid: 1, bad: 2, na: 3 };
    rows.sort((a, b) => {
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      if (!a.best) return 0;
      if (b.best.passPct !== a.best.passPct) return b.best.passPct - a.best.passPct;
      return (a.best.medianDays || 1e9) - (b.best.medianDays || 1e9);
    });

    const years = Math.max(spanDays / 365.25, 0.25);
    const ownOpt = E.optimizeCp(trades, capital0);
    const own = ownOpt ? {
      risk: ownOpt.risk, relaxedNote: ownOpt.relaxed ? ownOpt.relaxedNote : null,
      annualPct: annualized(ownOpt.report, capital0, years), maxDdPct: ownOpt.report.stats.maxDrawdownPct,
    } : null;

    const top = rows.find((r) => r.best) || null;
    let prop = null;
    if (top) {
      const rep = E.computeReport(trades, capital0, { risk: top.best.risk, tiers: [] });
      prop = { risk: top.best.risk, annualPct: annualized(rep, capital0, years), maxDdPct: rep.stats.maxDrawdownPct, profile: profile(P, top.best.risk) };
    }

    let kind = 'none';
    if (top) kind = top.status === 'good' ? 'propfirm' : top.status === 'mid' ? 'both' : 'own';
    return { rows, verdict: { kind, top }, own, prop, meta: { starts: starts.length, spanDays, trades: P.n, stressRuns: STRESS_RUNS } };
  }

  window.CHESTPropFit = { fit, RISKS };
})();
