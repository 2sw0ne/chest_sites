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

  // ---------------------------------------------------------------
  // BONUS : colonnes optionnelles du fichier (étiquette W/L/P, tendance/contre,
  // confirmation…). Une règle « Si » choisit le risque d'un trade selon ses
  // bonus ; les paliers « après N SL » continuent de fonctionner.
  //
  // Règle : { conds:[{field, value}], afterSl:number|null, risk:number }
  //   field  'source' | 'confirmation' | 'order' | 'x:<en-tête de colonne>'
  //   risk   0 = le trade est IGNORÉ (il n'est pas pris)
  // La règle la plus précise gagne : plus de conditions, puis plus de SL
  // consécutifs exigés, puis la plus basse dans la liste.
  // ---------------------------------------------------------------
  const BONUS_LABELS = { source: 'Source', confirmation: 'Confirmation', order: 'Ordre' };

  function norm(v) { return String(v == null ? '' : v).trim().toUpperCase(); }

  function bonusValue(t, key) {
    if (!t || !key) return undefined;
    if (key.indexOf('x:') === 0) return t.extra ? t.extra[key.slice(2)] : undefined;
    return t[key];
  }

  function condsMatch(conds, t) {
    return (conds || []).every((c) => { const v = bonusValue(t, c.field); return v != null && norm(v) !== '' && norm(v) === norm(c.value); });
  }

  // Bonus exploitables : au moins 2 valeurs, au plus 15, renseignés sur ≥ 30 % des trades.
  function detectBonusFields(trades, opts) {
    const maxValues = (opts && opts.maxValues) || 15;
    const keys = new Map();
    trades.forEach((t) => {
      Object.keys(BONUS_LABELS).forEach((k) => { if (t[k] != null && norm(t[k]) !== '') keys.set(k, BONUS_LABELS[k]); });
      if (t.extra) Object.keys(t.extra).forEach((h) => { if (t.extra[h] != null && norm(t.extra[h]) !== '') keys.set('x:' + h, h); });
    });
    const out = [];
    keys.forEach((label, key) => {
      const counts = new Map();
      let filled = 0;
      trades.forEach((t) => {
        const v = bonusValue(t, key);
        if (v == null || norm(v) === '') return;
        filled++;
        const n = norm(v);
        if (!counts.has(n)) counts.set(n, { value: String(v).trim().toUpperCase() === n ? n : String(v).trim(), count: 0 });
        counts.get(n).count++;
      });
      if (counts.size < 2 || counts.size > maxValues || filled < trades.length * 0.3) return;
      out.push({ key, label, coverage: filled / trades.length * 100, values: [...counts.values()].sort((a, b) => b.count - a.count) });
    });
    return out;
  }

  // Risque d'un trade : base, paliers (afterSl) et règles « Si », la plus précise l'emporte.
  function resolveRisk(t, cfg, consecutiveSl) {
    let best = null, bestScore = -1;
    const test = (conds, afterSl, risk, order) => {
      if (afterSl != null && afterSl > 0 && consecutiveSl < afterSl) return;
      if (!condsMatch(conds, t)) return;
      const score = (conds ? conds.length : 0) * 1000000 + (afterSl || 0) * 1000 + order;
      if (score >= bestScore) { best = risk; bestScore = score; }
    };
    let order = 0;
    (cfg.tiers || []).forEach((x) => test([], x.afterSl, x.newRisk, order++));
    (cfg.rules || []).forEach((x) => test(x.conds, x.afterSl, x.risk, order++));
    return best == null ? cfg.risk : best;
  }

  // riskConfig : { risk, tiers:[{afterSl,newRisk}], rules:[{conds,afterSl,risk}] }.
  // Un trade dont le risque résolu est 0 est IGNORÉ : il n'entre ni dans la
  // courbe, ni dans les stats, ni dans la série de SL consécutifs.
  function simulate(trades, capital0, riskConfig) {
    const ordered = sortedTrades(trades);
    let capital = capital0;
    let consecutiveSl = 0;
    let skipped = 0;
    const curve = [{ date: toDate(ordered[0] && (ordered[0].open || ordered[0].date)), capital, trade: null, riskUsed: null }];
    ordered.forEach((t) => {
      const risk = resolveRisk(t, riskConfig, consecutiveSl);
      if (!(risk > 0)) { skipped++; return; }
      const rr = isBE(t) ? 0 : Number(t.rr) || 0;
      capital = capital * (1 + (risk / 100) * rr);
      const d = toDate(t.close || t.open || t.date);
      curve.push({ date: d, capital, trade: t, riskUsed: risk });
      consecutiveSl = isSL(t) ? consecutiveSl + 1 : 0;
    });
    curve.skipped = skipped;
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
   * riskConfig: { risk: number (%), tiers: [{afterSl, newRisk}], rules?: [{conds:[{field,value}], afterSl, risk}] }
   */
  function computeReport(trades, capital0, riskConfig) {
    const curve = simulate(trades, capital0, riskConfig || { risk: 1, tiers: [] });
    const taken = curve.slice(1).map((pt) => pt.trade);
    const stats = computeStats(curve, taken);
    stats.skippedTrades = curve.skipped || 0;
    return {
      curve,
      stats,
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

  // ---------------------------------------------------------------
  // Réglage PREMIUM (mode automatique) : sépare les bonus, calcule chaque
  // logique indépendamment (un bonus seul, puis deux bonus croisés) en
  // cherchant, pour chaque valeur (W, L, P, TENDANCE, CONTRE…), le risque qui
  // rapporte le plus sous les mêmes contraintes que le réglage classique.
  // Recherche transparente (montée par coordonnées sur une grille), pas un
  // modèle d'IA. Elle apprend sur l'historique : un test hors échantillon
  // (appris sur les 60 % premiers trades, jugé sur les 40 % derniers) dit
  // honnêtement si le gain tient.
  // ---------------------------------------------------------------
  const PREMIUM_GRID = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5];
  const MIN_GROUP = 15;

  function quickPre(ordered) {
    return {
      rr: ordered.map((t) => (isBE(t) ? 0 : Number(t.rr) || 0)),
      dayKey: ordered.map((t) => { const d = toDate(t.close || t.open || t.date); return d ? dayKey(d) : ''; }),
    };
  }

  // Évaluation rapide d'une affectation de risques par groupe (sans allocation).
  function quickEval(pre, gid, risks) {
    let cap = 1, peak = 1, maxDd = 0, lastKey = null, prevEnd = 1, dayEnd = 1, maxDaily = 0;
    for (let i = 0; i < gid.length; i++) {
      if (pre.dayKey[i] !== lastKey) {
        if (lastKey !== null) { const dd = prevEnd > 0 ? (prevEnd - dayEnd) / prevEnd : 0; if (dd > maxDaily) maxDaily = dd; prevEnd = dayEnd; }
        lastKey = pre.dayKey[i];
      }
      const r = risks[gid[i]];
      if (r > 0) {
        cap *= 1 + (r / 100) * pre.rr[i];
        if (cap > peak) peak = cap;
        const dd = (peak - cap) / peak; if (dd > maxDd) maxDd = dd;
      }
      dayEnd = cap;
    }
    const dd = prevEnd > 0 ? (prevEnd - dayEnd) / prevEnd : 0; if (dd > maxDaily) maxDaily = dd;
    return { perf: (cap - 1) * 100, maxDd: maxDd * 100, maxDaily: maxDaily * 100 };
  }

  // groups : [{ conds, count }] — l'index 0 est « le reste » (risque de base, jamais modifié).
  function optimizeGroups(pre, gid, groups, baseRisk, limits) {
    const risks = groups.map(() => baseRisk);
    const feasible = (e) => e.maxDd <= limits.maxDd + 1e-9 && (limits.maxDaily == null || e.maxDaily <= limits.maxDaily + 1e-9);
    const grid = PREMIUM_GRID.filter((r) => r <= limits.maxRisk + 1e-9);
    let cur = quickEval(pre, gid, risks);
    for (let pass = 0; pass < 3; pass++) {
      let improved = false;
      for (let g = 1; g < groups.length; g++) {
        if (groups[g].count < MIN_GROUP) continue;
        let bestR = risks[g], bestE = cur;
        grid.forEach((c) => {
          if (c === risks[g]) return;
          const t = risks.slice(); t[g] = c;
          const e = quickEval(pre, gid, t);
          if (feasible(e) && e.perf > bestE.perf + 1e-9) { bestR = c; bestE = e; }
        });
        if (bestR !== risks[g]) { risks[g] = bestR; cur = bestE; improved = true; }
      }
      if (!improved) break;
    }
    return { risks, ev: cur };
  }

  function buildLogic(ordered, pre, fields, baseRisk, limits, label) {
    // groupes = combinaisons de valeurs des champs choisis (index 0 = le reste)
    const groups = [{ conds: [], count: 0 }];
    const index = new Map();
    const gid = ordered.map((t) => {
      const parts = fields.map((f) => { const v = bonusValue(t, f.key); return v == null || norm(v) === '' ? null : { field: f.key, value: f.canon(v) }; });
      if (parts.some((p) => p === null)) { groups[0].count++; return 0; }
      const k = parts.map((p) => p.field + '=' + norm(p.value)).join('&');
      if (!index.has(k)) { index.set(k, groups.length); groups.push({ conds: parts, count: 0 }); }
      const g = index.get(k); groups[g].count++; return g;
    });
    if (groups.length < 2) return null;
    const { risks, ev } = optimizeGroups(pre, gid, groups, baseRisk, limits);
    const rules = [];
    const detail = [];
    groups.forEach((g, i) => {
      if (i === 0) return;
      detail.push({ conds: g.conds, count: g.count, risk: risks[i], tooFew: g.count < MIN_GROUP });
      if (risks[i] !== baseRisk) rules.push({ conds: g.conds, afterSl: null, risk: risks[i] });
    });
    return { label, fields: fields.map((f) => f.key), rules, detail, perf: ev.perf, maxDd: ev.maxDd, maxDaily: ev.maxDaily };
  }

  function premiumCore(trades, capital0, kind, onlyKeys) {
    const base = kind === 'pf' ? optimizePf(trades, capital0) : optimizeCp(trades, capital0);
    if (!base) return { error: kind === 'pf' ? 'Aucun réglage de risque ne respecte les contraintes propfirm sur cet historique, même au risque minimal.' : 'Aucun réglage de base trouvé.' };
    const ordered = sortedTrades(trades);
    const pre = quickPre(ordered);
    const fields = detectBonusFields(ordered).filter((f) => !onlyKeys || onlyKeys.includes(f.key));
    if (!fields.length) return { error: 'Aucun bonus exploitable dans ce fichier (il faut une colonne avec 2 à 15 valeurs différentes : Source, Confirmation, Ordre ou une colonne « Facultatif »).' };
    const lim0 = kind === 'pf' ? { maxRisk: 5, maxDd: 10, maxDaily: 5 } : { maxRisk: base.relaxed ? 5 : 3, maxDd: 30, maxDaily: null };
    const baseStats = base.report.stats;
    // Ne jamais dépasser le drawdown du réglage de base quand celui-ci a dû être assoupli.
    const limits = { maxRisk: Math.max(lim0.maxRisk, base.risk), maxDd: Math.max(lim0.maxDd, baseStats.maxDrawdownPct), maxDaily: lim0.maxDaily };
    const withCanon = fields.map((f) => { const canon = new Map(f.values.map((v) => [norm(v.value), v.value])); return { key: f.key, label: f.label, canon: (v) => canon.get(norm(v)) || String(v).trim() }; });

    const logics = [];
    withCanon.forEach((f) => {
      const l = buildLogic(ordered, pre, [f], base.risk, limits, `${f.label} seul`);
      if (l) logics.push(l);
    });
    if (withCanon.length >= 2) {
      // croisement des deux bonus les plus utiles (par gain de leur logique seule)
      const ranked = logics.slice().sort((a, b) => b.perf - a.perf).map((l) => withCanon.find((f) => f.key === l.fields[0])).filter(Boolean);
      const pair = ranked.slice(0, 2);
      if (pair.length === 2) {
        const l = buildLogic(ordered, pre, pair, base.risk, limits, `${pair[0].label} × ${pair[1].label}`);
        if (l) logics.push(l);
      }
    }
    const basePerf = baseStats.performancePct;
    logics.forEach((l) => { l.gain = l.perf - basePerf; });
    logics.sort((a, b) => b.perf - a.perf);
    return { base, basePerf, baseDd: baseStats.maxDrawdownPct, logics, limits, labels: withCanon.map((f) => [f.key, f.label]) };
  }

  /**
   * kind : 'cp' | 'pf'. Renvoie { base, logics[], best, limits } ou { error }.
   * Chaque logique : { label, fields, rules, detail, perf, maxDd, gain, oos }.
   * oos = test hors échantillon : la même logique est apprise sur les 60 % premiers
   * trades puis jugée sur les 40 % derniers, contre le réglage plat appris sur la même
   * période — { trainN, testN, flatPct, premiumPct, holds } (noGain si rien n'a été
   * trouvé à l'apprentissage, null si trop peu de trades pour tester).
   * best = la logique la plus rentable QUI TIENT hors échantillon ; à défaut, la plus
   * rentable tout court (l'appelant doit alors prévenir du risque de sur-optimisation).
   */
  function optimizePremium(trades, capital0, kind) {
    const core = premiumCore(trades, capital0, kind, null);
    if (core.error) return core;
    const sig = (l) => l.fields.slice().sort().join('|');
    const ordered = sortedTrades(trades);
    const cut = Math.floor(ordered.length * 0.6);
    const train = ordered.slice(0, cut), test = ordered.slice(cut);
    core.logics.forEach((l) => {
      l.oos = null;
      if (l.gain <= 1e-6 || trades.length < 60) return;
      const trainCore = premiumCore(train, capital0, kind, l.fields);
      if (trainCore.error) return;
      const pick = trainCore.logics.find((x) => sig(x) === sig(l));
      if (!pick || pick.gain <= 1e-6) { l.oos = { trainN: train.length, testN: test.length, flatPct: null, premiumPct: null, holds: false, noGain: true }; return; }
      const cfgBase = { risk: trainCore.base.risk, tiers: [] };
      const flat = computeReport(test, capital0, cfgBase).stats.performancePct;
      const prem = computeReport(test, capital0, Object.assign({}, cfgBase, { rules: pick.rules })).stats.performancePct;
      l.oos = { trainN: train.length, testN: test.length, flatPct: flat, premiumPct: prem, holds: prem > flat };
    });
    const useful = core.logics.filter((l) => l.gain > 1e-6);
    const best = useful.find((l) => l.oos && l.oos.holds) || useful[0] || null;
    return { base: core.base, basePerf: core.basePerf, baseDd: core.baseDd, logics: core.logics, best, limits: core.limits, labels: core.labels };
  }

  window.CHESTBacktestEngine = {
    sortedTrades, effectiveRisk, resolveRisk, simulate, computeReport, optimizeCp, optimizePf, optimizePremium,
    detectBonusFields, condsMatch, bonusValue, RISK_GRID,
  };
})();
