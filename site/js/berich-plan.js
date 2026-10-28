// CHEST · BERICH — moteur du plan (2026-10-28, v2 : diversification).
// Un plan = une ou plusieurs « jambes » sur le MÊME compte : { algo, cfg } où cfg = risque par position + palier
// « après N stops d'affilée de CET algorithme → risque réduit, retour au risque de base au premier trade non perdant »
// (même règle que le backtesting). Les positions des algorithmes s'enchaînent dans l'ordre réel de leurs clôtures.
// Deux mesures : l'historique rejoué tel quel, et 700 futurs possibles tirés de l'historique par blocs de 2 semaines
// (les positions des deux algorithmes d'une même semaine restent ensemble : leurs bonnes et mauvaises passes
// simultanées sont conservées). On garde le plan qui touche le plus souvent l'objectif sans dépasser le recul accepté.
// Aucune promesse : ce sont des fréquences passées.
(() => {
  'use strict';
  const MONTH = 30.44 * 86400000, WEEK = 7 * 86400000;
  const RISKS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const MIX_RISKS = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5];
  const TIERS = [null, [2, 0.5], [3, 0.5], [4, 0.5], [5, 0.5], [3, 0.25]];
  const SIMS = 700, BLOCK_WEEKS = 2;

  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
  const pct = (arr, q) => { const a = Float64Array.from(arr).sort(); return a[Math.min(a.length - 1, Math.max(0, Math.round(q * (a.length - 1))))]; };

  // trades : [{ t: ouverture ms, c: clôture ms, side, r }] → statistiques d'un algorithme.
  function prep(key, name, trades) {
    const list = trades.filter((x) => Number.isFinite(x.r)).map((x) => Object.assign({}, x, { c: x.c || x.t })).sort((a, b) => a.c - b.c);
    const n = list.length;
    const span = n > 1 ? Math.max(1, (list[n - 1].c - list[0].t) / MONTH) : 1;
    let wins = 0, losses = 0, sumW = 0, worst = 0, run = 0, total = 0, gl = 0;
    list.forEach((x) => { total += x.r; if (x.r > 0) { wins++; sumW += x.r; } if (x.r < 0) { losses++; gl -= x.r; run++; worst = Math.max(worst, run); } else run = 0; });
    return { key, name, list, n, months: span, perMonth: n / span, wins, losses, winrate: wins + losses ? wins / (wins + losses) : 0,
      avgWin: wins ? sumW / wins : 0, total, expectancy: n ? total / n : 0, pf: gl ? sumW / gl : null, worstStreak: worst,
      from: n ? list[0].t : null, to: n ? list[n - 1].c : null };
  }

  const cfgOf = (risk, tier) => ({ risk, afterSl: tier && risk ? tier[0] : 0, newRisk: tier && risk ? round(risk * tier[1], 3) : risk });
  const riskAt = (cfg, streak) => (cfg.afterSl && streak >= cfg.afterSl ? cfg.newRisk : cfg.risk);
  const tierOf = (cfg) => (cfg.afterSl ? [cfg.afterSl, cfg.newRisk / cfg.risk] : null);

  // Fil commun des positions d'un ensemble d'algorithmes (ordre des clôtures) ; pour les futurs, seulement la période
  // où tous ont un historique, découpée en semaines.
  const feedCache = new Map();
  function feed(preps) {
    const key = preps.map((p) => p.key + ':' + p.n).join('|');
    if (feedCache.has(key)) return feedCache.get(key);
    const all = [];
    preps.forEach((p, k) => p.list.forEach((x) => all.push({ k, r: x.r, c: x.c })));
    all.sort((a, b) => a.c - b.c);
    const lo = Math.max(...preps.map((p) => p.from)), hi = Math.min(...preps.map((p) => p.to));
    const win = all.filter((e) => e.c >= lo && e.c <= hi);
    const W = Math.max(1, Math.ceil((hi - lo + 1) / WEEK));
    const starts = new Int32Array(W + 1);
    let j = 0;
    for (let w = 0; w < W; w++) { starts[w] = j; while (j < win.length && win[j].c < lo + (w + 1) * WEEK) j++; }
    starts[W] = win.length;
    const f = { all, R: Float64Array.from(win.map((e) => e.r)), K: Int8Array.from(win.map((e) => e.k)), starts, W, legs: preps.length };
    feedCache.set(key, f);
    return f;
  }
  const pathCache = new Map();
  function weekPaths(W, H) {
    const k = W + ':' + H;
    if (pathCache.has(k)) return pathCache.get(k);
    const rand = rng(7919 + W * 31 + H), out = new Int32Array(SIMS * H), maxStart = Math.max(1, W - BLOCK_WEEKS + 1);
    for (let s = 0; s < SIMS; s++) {
      let h = 0;
      while (h < H) { const st = Math.floor(rand() * maxStart); for (let b = 0; b < BLOCK_WEEKS && h < H; b++, h++) out[s * H + h] = Math.min(W - 1, st + b); }
    }
    pathCache.set(k, out);
    return out;
  }

  // Historique rejoué : courbe (une valeur par position), recul max, pire journée (clôtures d'un même jour).
  function replay(preps, cfgs, capital) {
    const f = feed(preps);
    let cap = capital, peak = capital, dd = 0, day = null, dayStart = capital, worstDay = 0;
    const streak = new Int32Array(preps.length);
    const curve = [{ t: Math.min(...preps.map((p) => p.from)), v: capital }];
    f.all.forEach((e) => {
      const d = new Date(e.c).toISOString().slice(0, 10);
      if (d !== day) { day = d; dayStart = cap; }
      cap *= 1 + riskAt(cfgs[e.k], streak[e.k]) / 100 * e.r;
      streak[e.k] = e.r < 0 ? streak[e.k] + 1 : 0;
      peak = Math.max(peak, cap); dd = Math.max(dd, (peak - cap) / peak);
      worstDay = Math.max(worstDay, (dayStart - cap) / dayStart);
      curve.push({ t: e.c, v: cap, k: e.k });
    });
    return { curve, final: cap, mult: cap / capital, maxDd: dd, worstDay, n: f.all.length };
  }

  // Un plan sur les futurs : réussite = objectif touché avant d'avoir reculé de plus que la tolérance (depuis le plus haut).
  function evaluate(preps, cfgs, goal, withFan) {
    const f = feed(preps), H = Math.max(1, Math.round(goal.months * 4.345)), idx = weekPaths(f.W, H);
    const target = goal.target / goal.capital, tol = goal.tolerance, L = preps.length;
    const marks = []; for (let m = 1; m <= goal.months; m++) marks.push(Math.min(H, Math.round(m * H / goal.months)));
    const grid = withFan ? marks.map(() => new Float64Array(SIMS)) : null;
    const finals = new Float64Array(SIMS), dds = new Float64Array(SIMS);
    const base = cfgs.map((c) => c.risk), after = cfgs.map((c) => c.afterSl), low = cfgs.map((c) => c.newRisk);
    const streak = new Int32Array(L);
    let reach = 0, breach = 0, hitWeeks = 0;
    for (let s = 0; s < SIMS; s++) {
      let cap = 1, peak = 1, state = 0, dd = 0, mk = 0;
      streak.fill(0);
      for (let h = 0; h < H; h++) {
        const w = idx[s * H + h];
        for (let j = f.starts[w], e = f.starts[w + 1]; j < e; j++) {
          const k = f.K[j], r = f.R[j];
          cap *= 1 + (after[k] && streak[k] >= after[k] ? low[k] : base[k]) / 100 * r;
          streak[k] = r < 0 ? streak[k] + 1 : 0;
          if (cap > peak) peak = cap;
          const d = (peak - cap) / peak;
          if (d > dd) dd = d;
          if (state === 0) { if (cap >= target) { state = 1; reach++; hitWeeks += h + 1; } else if (d >= tol) { state = 2; breach++; } }
        }
        if (grid) while (mk < marks.length && marks[mk] === h + 1) grid[mk++][s] = cap;
      }
      finals[s] = cap; dds[s] = dd;
    }
    const c = goal.capital;
    const out = { pReach: reach / SIMS, pBreach: breach / SIMS, monthsToGoal: reach ? hitWeeks / reach / 4.345 : null,
      p10: pct(finals, 0.1) * c, p50: pct(finals, 0.5) * c, p90: pct(finals, 0.9) * c, dd50: pct(dds, 0.5), dd90: pct(dds, 0.9) };
    if (grid) out.fan = { months: marks.map((_, i) => i + 1), p10: grid.map((g) => pct(g, 0.1) * c), p50: grid.map((g) => pct(g, 0.5) * c), p90: grid.map((g) => pct(g, 0.9) * c) };
    return out;
  }

  // Contraintes dures : compte perso → recul historique ≤ tolérance (+10 %) ; propfirm → recul historique ≤ 80 % de la
  // perte max et pire journée ≤ 4 % (règle des 5 % avec marge).
  function allowed(preps, cfgs, goal) {
    const h = replay(preps, cfgs, 1000);
    if (goal.account === 'propfirm') return h.maxDd <= goal.tolerance * 0.8 && h.worstDay <= 0.04 ? h : null;
    return h.maxDd <= goal.tolerance * 1.1 ? h : null;
  }
  // Un candidat : seules les jambes à risque non nul sont gardées.
  function candidate(preps, cfgs, goal) {
    const keep = cfgs.map((c, i) => i).filter((i) => cfgs[i].risk > 0);
    if (!keep.length) return null;
    const ps = keep.map((i) => preps[i]), cs = keep.map((i) => cfgs[i]);
    const hist = allowed(ps, cs, goal);
    if (!hist) return null;
    return Object.assign(evaluate(ps, cs, goal), { hist, legs: ps.map((p, i) => ({ algo: p.key, cfg: cs[i] })), total: cs.reduce((s, c) => s + c.risk, 0) });
  }
  function singles(p, goal) {
    const out = [];
    RISKS.forEach((risk) => TIERS.forEach((tier) => {
      if (goal.account === 'propfirm' && risk > 3) return;
      const c = candidate([p], [cfgOf(risk, tier)], goal);
      if (c) out.push(c);
    }));
    return out;
  }
  // Mélange de deux algorithmes : chacun garde le palier de son meilleur réglage seul, on balaie les deux risques.
  function mixes(pa, pb, ta, tb, goal) {
    const out = [];
    MIX_RISKS.forEach((ra) => MIX_RISKS.forEach((rb) => {
      if (!ra || !rb) return;
      if (goal.account === 'propfirm' && ra + rb > 3) return;
      const c = candidate([pa, pb], [cfgOf(ra, ta), cfgOf(rb, tb)], goal);
      if (c) out.push(c);
    }));
    return out;
  }
  // Meilleur = le plus de futurs qui touchent l'objectif ; à 1,5 point près, le moins risqué gagne. Objectif hors de
  // portée : celui qui fait le plus grandir le capital médian sans dépasser le recul plus d'une fois sur quatre.
  function pickBest(list) {
    if (!list.length) return null;
    const top = Math.max(...list.map((x) => x.pReach));
    if (top < 0.02) { const safe = list.filter((x) => x.pBreach <= 0.25); return (safe.length ? safe : list).slice().sort((a, b) => b.p50 - a.p50)[0]; }
    return list.filter((x) => x.pReach >= top - 0.015).sort((a, b) => a.total - b.total || a.pBreach - b.pBreach || b.p50 - a.p50)[0];
  }

  // goal : { capital, target, months, tolerance (0.2 = −20 %), account: 'perso'|'propfirm', algo: 'auto' (diversifier)|clé }.
  function recommend(preps, goal) {
    const per = new Map(preps.map((p) => [p.key, singles(p, goal)]));
    const bestSingle = new Map(preps.map((p) => [p.key, pickBest(per.get(p.key))]));
    let mix = [];
    if (preps.length >= 2 && (!goal.algo || goal.algo === 'auto')) {
      const [a, b] = preps.slice().sort((x, y) => y.total - x.total);
      const ba = bestSingle.get(a.key), bb = bestSingle.get(b.key);
      mix = mixes(a, b, ba ? tierOf(ba.legs[0].cfg) : [3, 0.25], bb ? tierOf(bb.legs[0].cfg) : [3, 0.25], goal);
    }
    const pool = goal.algo && goal.algo !== 'auto' ? per.get(goal.algo) || [] : [].concat(...per.values(), mix);
    let best = pickBest(pool);
    if (!best) return { best: null, goal };
    // Diversifier est la demande par défaut : à 2 points près, le mélange passe devant un algorithme seul.
    const bestMix = pickBest(mix);
    if (bestMix && best.legs.length === 1 && bestMix.pReach >= best.pReach - 0.02) best = bestMix;
    const sameShape = pool.filter((x) => x.legs.length === best.legs.length && x.legs.every((l, i) => l.algo === best.legs[i].algo));
    const prudent = pickBest(sameShape.filter((x) => x.total <= best.total / 2 + 1e-9));
    const bold = sameShape.filter((x) => x.total > best.total && x.pReach >= best.pReach - 0.12).sort((a, b) => b.p50 - a.p50)[0] || null;
    const others = [];
    if (best.legs.length > 1) preps.forEach((p) => { const s = bestSingle.get(p.key); if (s) others.push(Object.assign(s, { tag: 'only' })); });
    else {
      if (bestMix) others.push(Object.assign(bestMix, { tag: 'mix' }));
      preps.filter((p) => p.key !== best.legs[0].algo).forEach((p) => { const s = bestSingle.get(p.key); if (s) others.push(Object.assign(s, { tag: 'only' })); });
    }
    // Ce que la diversification apporte : le même risque total sur l'algorithme principal seul.
    let solo = null;
    if (best.legs.length > 1) {
      const main = best.legs.slice().sort((x, y) => y.cfg.risk - x.cfg.risk)[0];
      const p = preps.find((x) => x.key === main.algo);
      solo = { algo: main.algo, hist: replay([p], [cfgOf(round(best.total, 2), tierOf(main.cfg))], 1000) };
    }
    const hints = [];
    if (best.pReach < 0.5) {
      const real = Math.round(best.p50 / 50) * 50;
      if (real > goal.capital && real < goal.target) hints.push({ label: `objectif réaliste : ${real.toLocaleString('fr-FR')} €`, goal: Object.assign({}, goal, { target: real }), realistic: true });
      const longer = { 3: 6, 6: 12, 12: 24 }[goal.months];
      if (longer) hints.push({ label: `en ${longer >= 12 ? longer / 12 + ' an' + (longer > 12 ? 's' : '') : longer + ' mois'}`, goal: Object.assign({}, goal, { months: longer }) });
      if (goal.account !== 'propfirm' && goal.tolerance < 0.5) { const t = Math.min(0.5, goal.tolerance + 0.15); hints.push({ label: `en acceptant −${Math.round(t * 100)} %`, goal: Object.assign({}, goal, { tolerance: t }) }); }
    }
    return { best, prudent, bold, others, hints, solo, goal };
  }

  const fmt = (v) => String(round(v, 2)).replace('.', ',') + ' %';
  function describeCfg(cfg) { return cfg.afterSl ? `${fmt(cfg.risk)} par position, ${fmt(cfg.newRisk)} après ${cfg.afterSl} stops d’affilée` : `${fmt(cfg.risk)} par position`; }
  // legs : [{ algo, cfg }], names : clé → nom.
  function describe(legs, names) {
    if (!Array.isArray(legs)) return describeCfg(legs);
    if (legs.length === 1) return describeCfg(legs[0].cfg);
    return legs.map((l) => `${names ? names(l.algo) : l.algo} ${fmt(l.cfg.risk)}`).join(' + ') + (legs.some((l) => l.cfg.afterSl) ? ', réduit après une série de stops' : '');
  }

  window.CHESTBerichPlan = { prep, replay, evaluate, recommend, describe, describeCfg, cfgOf, riskAt, RISKS };
})();
