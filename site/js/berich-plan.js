// CHEST · BERICH — moteur du plan (2026-10-28).
// Prend l'historique d'un algorithme (une liste de trades en R) et les réponses du quiz (capital, objectif, durée,
// recul accepté, type de compte), essaie une grille de money management (risque par position + palier « après N
// stops d'affilée → risque réduit, retour au risque de base au premier trade non perdant », même règle que le
// backtesting) et garde celui qui atteint le plus souvent l'objectif SANS dépasser le recul accepté.
// Deux mesures : l'historique rejoué tel quel, et 800 futurs possibles tirés de l'historique par blocs de 8 trades
// (les séries de stops restent groupées comme dans la réalité). Aucune promesse : ce sont des fréquences passées.
(() => {
  'use strict';
  const MONTH = 30.44 * 86400000;
  const RISKS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const TIERS = [null, [2, 0.5], [3, 0.5], [4, 0.5], [5, 0.5], [3, 0.25]];
  const SIMS = 800, BLOCK = 8;

  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

  // trades : [{ t: ouverture ms, c: clôture ms, side, r }] → statistiques et tableau R dans l'ordre des clôtures.
  function prep(key, name, trades) {
    const list = trades.filter((x) => Number.isFinite(x.r)).slice().sort((a, b) => (a.c || a.t) - (b.c || b.t));
    const R = Float64Array.from(list.map((x) => x.r));
    const n = R.length;
    const span = n > 1 ? Math.max(1, ((list[n - 1].c || list[n - 1].t) - list[0].t) / MONTH) : 1;
    let wins = 0, losses = 0, sumW = 0, worst = 0, run = 0;
    R.forEach((r) => { if (r > 0) { wins++; sumW += r; } if (r < 0) { losses++; run++; worst = Math.max(worst, run); } else run = 0; });
    const total = R.reduce((s, r) => s + r, 0);
    const gl = R.reduce((s, r) => s + (r < 0 ? -r : 0), 0);
    return { key, name, list, R, n, months: span, perMonth: n / span, wins, losses, winrate: wins + losses ? wins / (wins + losses) : 0,
      avgWin: wins ? sumW / wins : 0, total, expectancy: n ? total / n : 0, pf: gl ? sumW / gl : null, worstStreak: worst,
      from: list.length ? list[0].t : null, to: list.length ? (list[n - 1].c || list[n - 1].t) : null };
  }

  const cfgOf = (risk, tier) => ({ risk, afterSl: tier ? tier[0] : 0, newRisk: tier ? round(risk * tier[1], 3) : risk });
  const riskAt = (cfg, streak) => (cfg.afterSl && streak >= cfg.afterSl ? cfg.newRisk : cfg.risk);

  // Historique rejoué : courbe du capital (une valeur par trade), recul max et pire journée (clôtures du même jour).
  function replay(p, cfg, capital) {
    let cap = capital, peak = capital, dd = 0, streak = 0, day = null, dayStart = capital, worstDay = 0;
    const curve = [{ t: p.from, v: capital }];
    p.list.forEach((x) => {
      const d = new Date(x.c || x.t).toISOString().slice(0, 10);
      if (d !== day) { day = d; dayStart = cap; }
      cap *= 1 + riskAt(cfg, streak) / 100 * x.r;
      streak = x.r < 0 ? streak + 1 : 0;
      peak = Math.max(peak, cap); dd = Math.max(dd, (peak - cap) / peak);
      worstDay = Math.max(worstDay, (dayStart - cap) / dayStart);
      curve.push({ t: x.c || x.t, v: cap });
    });
    return { curve, final: cap, mult: cap / capital, maxDd: dd, worstDay };
  }

  // Futurs possibles : SIMS chemins de n trades, tirés par blocs consécutifs de l'historique. Mêmes chemins pour tous
  // les réglages d'un algorithme (comparaison juste), graine fixe (même réponse à chaque calcul).
  const pathCache = new Map();
  function paths(p, n) {
    const k = p.key + ':' + n + ':' + p.n;
    if (pathCache.has(k)) return pathCache.get(k);
    const rand = rng(7919 + n * 31 + p.n), out = new Int32Array(SIMS * n), maxStart = Math.max(1, p.n - BLOCK);
    for (let s = 0; s < SIMS; s++) {
      let j = 0;
      while (j < n) { const st = Math.floor(rand() * maxStart); for (let b = 0; b < BLOCK && j < n; b++, j++) out[s * n + j] = Math.min(p.n - 1, st + b); }
    }
    pathCache.set(k, out);
    return out;
  }

  const pct = (arr, q) => { const a = Float64Array.from(arr).sort(); return a[Math.min(a.length - 1, Math.max(0, Math.round(q * (a.length - 1))))]; };

  // Un réglage sur les futurs : réussite = objectif touché avant d'avoir reculé de plus que la tolérance (depuis le plus haut).
  function evaluate(p, cfg, goal) {
    const n = Math.max(1, Math.round(p.perMonth * goal.months));
    const idx = paths(p, n), R = p.R, target = goal.target / goal.capital, tol = goal.tolerance;
    let reach = 0, breach = 0, hitAt = 0;
    const finals = new Float64Array(SIMS), dds = new Float64Array(SIMS);
    for (let s = 0; s < SIMS; s++) {
      let cap = 1, peak = 1, streak = 0, state = 0, dd = 0;
      const o = s * n;
      for (let j = 0; j < n; j++) {
        const r = R[idx[o + j]];
        cap *= 1 + (cfg.afterSl && streak >= cfg.afterSl ? cfg.newRisk : cfg.risk) / 100 * r;
        streak = r < 0 ? streak + 1 : 0;
        if (cap > peak) peak = cap;
        const d = (peak - cap) / peak;
        if (d > dd) dd = d;
        if (state === 0) { if (cap >= target) { state = 1; reach++; hitAt += j + 1; } else if (d >= tol) { state = 2; breach++; } }
      }
      finals[s] = cap; dds[s] = dd;
    }
    return { cfg, n, pReach: reach / SIMS, pBreach: breach / SIMS, monthsToGoal: reach ? hitAt / reach / p.perMonth : null,
      p10: pct(finals, 0.1) * goal.capital, p50: pct(finals, 0.5) * goal.capital, p90: pct(finals, 0.9) * goal.capital,
      dd50: pct(dds, 0.5), dd90: pct(dds, 0.9) };
  }

  // Éventail mois par mois (10e, 50e, 90e centiles du capital) pour le réglage retenu.
  function fan(p, cfg, goal) {
    const n = Math.max(1, Math.round(p.perMonth * goal.months)), idx = paths(p, n), R = p.R;
    const steps = Math.max(1, Math.round(goal.months)), at = [];
    for (let m = 1; m <= steps; m++) at.push(Math.min(n, Math.round(m * n / steps)));
    const grid = at.map(() => new Float64Array(SIMS));
    for (let s = 0; s < SIMS; s++) {
      let cap = 1, streak = 0, k = 0;
      for (let j = 0; j < n; j++) {
        const r = R[idx[s * n + j]];
        cap *= 1 + riskAt(cfg, streak) / 100 * r;
        streak = r < 0 ? streak + 1 : 0;
        while (k < at.length && at[k] === j + 1) grid[k++][s] = cap;
      }
    }
    const c = goal.capital;
    return { months: at.map((_, i) => i + 1), p10: grid.map((g) => pct(g, 0.1) * c), p50: grid.map((g) => pct(g, 0.5) * c), p90: grid.map((g) => pct(g, 0.9) * c) };
  }

  // Contraintes dures : compte perso → recul historique ≤ tolérance ; propfirm → recul historique ≤ 80 % de la perte
  // max et pire journée ≤ 4 % (règle des 5 % avec marge).
  function allowed(p, cfg, goal) {
    const h = replay(p, cfg, 1000);
    if (goal.account === 'propfirm') return h.maxDd <= goal.tolerance * 0.8 && h.worstDay <= 0.04 ? h : null;
    return h.maxDd <= goal.tolerance * 1.1 ? h : null;
  }

  function candidates(p, goal) {
    const out = [];
    RISKS.forEach((risk) => TIERS.forEach((tier) => {
      if (goal.account === 'propfirm' && risk > 3) return;
      const cfg = cfgOf(risk, tier);
      const hist = allowed(p, cfg, goal);
      if (!hist) return;
      out.push(Object.assign(evaluate(p, cfg, goal), { hist, algo: p.key }));
    }));
    return out;
  }
  // Meilleur = le plus de futurs qui touchent l'objectif ; à 1,5 point près, le moins risqué gagne.
  // Objectif hors de portée (presque aucun futur ne l'atteint) : le réglage qui fait le plus grandir le capital médian
  // sans dépasser le recul accepté plus d'une fois sur quatre.
  function pickBest(list) {
    if (!list.length) return null;
    const top = Math.max(...list.map((x) => x.pReach));
    if (top < 0.02) { const safe = list.filter((x) => x.pBreach <= 0.25); return (safe.length ? safe : list).slice().sort((a, b) => b.p50 - a.p50)[0]; }
    return list.filter((x) => x.pReach >= top - 0.015).sort((a, b) => a.cfg.risk - b.cfg.risk || a.pBreach - b.pBreach || b.p50 - a.p50)[0];
  }

  // goal : { capital, target, months, tolerance (0.2 = −20 %), account: 'perso'|'propfirm', algo: 'auto'|clé }.
  function recommend(preps, goal) {
    const pool = goal.algo && goal.algo !== 'auto' ? preps.filter((p) => p.key === goal.algo) : preps;
    const per = new Map(preps.map((p) => [p.key, candidates(p, goal)]));
    const mine = [].concat(...pool.map((p) => per.get(p.key)));
    const best = pickBest(mine);
    if (!best) return { best: null, goal };
    const same = per.get(best.algo);
    const prudent = pickBest(same.filter((x) => x.cfg.risk <= best.cfg.risk / 2 + 1e-9 && x !== best));
    const bold = same.filter((x) => x.cfg.risk > best.cfg.risk && x.pReach >= best.pReach - 0.12).sort((a, b) => b.p50 - a.p50)[0] || null;
    const others = preps.filter((p) => p.key !== best.algo).map((p) => pickBest(per.get(p.key))).filter(Boolean);
    // Si l'objectif reste peu probable : ce qui le rendrait atteignable (plus de temps, plus de recul, objectif plus bas).
    const hints = [];
    if (best.pReach < 0.5) {
      const tryGoal = (g, label) => { const b = pickBest([].concat(...pool.map((p) => candidates(p, g)))); if (b && b.pReach > best.pReach + 0.08) hints.push({ label, goal: g, pReach: b.pReach }); };
      const longer = { 3: 6, 6: 12, 12: 24, 24: 36 }[goal.months];
      if (longer) tryGoal(Object.assign({}, goal, { months: longer }), `en ${longer >= 12 ? longer / 12 + ' an' + (longer > 12 ? 's' : '') : longer + ' mois'}`);
      if (goal.account !== 'propfirm' && goal.tolerance < 0.5) tryGoal(Object.assign({}, goal, { tolerance: Math.min(0.5, goal.tolerance + 0.15) }), `en acceptant −${Math.round(Math.min(0.5, goal.tolerance + 0.15) * 100)} %`);
      const lower = goal.capital + (goal.target - goal.capital) / 2;
      const real = Math.round(best.p50 / 50) * 50;
      if (real > goal.capital && real < goal.target) hints.push({ label: `objectif réaliste : ${real.toLocaleString('fr-FR')} €`, goal: Object.assign({}, goal, { target: real }), pReach: 0.5, realistic: true });
      if (lower > goal.capital) tryGoal(Object.assign({}, goal, { target: Math.round(lower / 50) * 50 }), `avec un objectif de ${Math.round(lower / 50) * 50} €`);
    }
    return { best, prudent, bold, others, hints, goal };
  }

  // Phrase lisible d'un réglage.
  function describe(cfg) {
    const f = (v) => String(round(v, 2)).replace('.', ',') + ' %';
    return cfg.afterSl ? `${f(cfg.risk)} par position, ${f(cfg.newRisk)} après ${cfg.afterSl} stops d’affilée` : `${f(cfg.risk)} par position`;
  }

  window.CHESTBerichPlan = { prep, replay, evaluate, fan, recommend, describe, cfgOf, riskAt, RISKS };
})();
