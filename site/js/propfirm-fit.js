// CHEST · Compatibilité backtest ↔ prop firms.
//
// Une prop firm ne se juge pas seulement sur « est-ce que je valide le
// challenge ? » mais sur ce qu'on RETIRE ensuite. On rejoue donc les trades du
// backtest sous la vie complète d'un compte, depuis chaque jour de la période
// SÉLECTIONNÉE EN HAUT DE PAGE (comme si on avait acheté le challenge ce
// jour-là), jusqu'à la fin de cette même période (pas un horizon fixe en mois
// indépendant — décision utilisateur, 2026-09-22 : un horizon de 3/6/12 mois
// plaqué sur une sélection d'années plus courte ne laissait presque plus de
// place à des départs différents, et les corrélait artificiellement) :
//
//   challenge (1 ou 2 phases)  →  compte financé  →  retraits (cycles,
//   jours profitables, règle de cohérence, partage)  →  compte perdu ?  →  on
//   rachète un challenge (frais) et on recommence.
//
// Règles modélisées (voir js/propfirm-rules.js) : perte du jour, perte max
// FIXE ou SUIVEUSE recalculée après minuit sur le solde de fin de journée,
// jours minimum / profitables, règle du meilleur jour (base « jours positifs »
// ou « profit total »), cohérence des retraits (un retrait est REPORTÉ tant que
// le meilleur jour pèse trop lourd dans le profit du cycle), cycles de retrait,
// partage, risque maximum par trade, frais et remboursements.
//
// Limites assumées (affichées sur la page) : pertes mesurées sur les trades
// CLÔTURÉS (pas de perte flottante), ni spreads ni slippage, règles d'annonces
// non simulées (signalées), départs qui se recoupent (les taux ne sont pas
// indépendants). C'est une simulation sur l'historique, pas une prédiction.
(() => {
  'use strict';

  const RISKS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];
  const MIN_STARTS = 20;
  const MAX_STARTS = 240;
  const MAX_PURCHASES = 3;        // un trader ne rachète pas 90 challenges : on s'arrête au 3e achat
  const MAX_LOST_PER_START = 0.5; // risque conseillé : en moyenne moins d'un demi-compte perdu sur la période

  // Trades triés par clôture -> tableaux compacts (rr, jour UTC, week-end, nuit).
  // « Week-end » = le trade est resté ouvert au moins un samedi (ouverture avant,
  // clôture à partir du samedi) ; « nuit » = clôturé un autre jour UTC que son
  // ouverture. Sans heures d'ouverture ET de clôture, on ne peut pas les détecter.
  // weightOf(trade, index) (facultatif) : multiplicateur de risque du money management
  // (risque du trade / risque de référence). 0 = trade ignoré (pause), 2 = le trade
  // pèse le double du risque de référence.
  function prepare(trades, weightOf) {
    const ordered = window.CHESTBacktestEngine.sortedTrades(trades);
    const rr = [], day = [], wk = [], ov = [];
    let withTimes = 0, wkCount = 0, ovCount = 0;
    ordered.forEach((t, idx) => {
      const d = new Date(t.close || t.open || t.date);
      if (isNaN(d.getTime())) return;
      const w = weightOf ? weightOf(t, idx) : 1;
      if (!(w > 0)) return;
      const res = String(t.result).toUpperCase();
      rr.push(res === 'BE' ? 0 : (Number(t.rr) || 0) * w);
      day.push(Math.floor(d.getTime() / 86400000));
      let crosses = false, over = false;
      if (t.open && t.close) {
        const a = new Date(t.open), b = new Date(t.close);
        if (!isNaN(a.getTime()) && !isNaN(b.getTime())) {
          withTimes++;
          const da = Math.floor(a.getTime() / 86400000), db = Math.floor(b.getTime() / 86400000);
          over = db > da;
          for (let x = da + 1; x <= db && !crosses; x++) if ((x + 4) % 7 === 6) crosses = true; // 6 = samedi
        }
      }
      wk.push(crosses); ov.push(over);
      if (crosses) wkCount++;
      if (over) ovCount++;
    });
    return { rr, day, wk, ov, n: rr.length, withTimes, wkCount, ovCount };
  }

  function mean(a) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0; }
  function quantile(sorted, q) {
    if (!sorted.length) return null;
    const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
    return sorted[i];
  }

  /**
   * Vie complète d'un compte à partir du trade `start`, jusqu'au jour `endDay` (exclu) — la fin de la période
   * sélectionnée, la MÊME pour tous les départs d'un même calcul (voir `fit()`). Capital initial = 1 ; les
   * montants sont des fractions du compte.
   *
   * `riskPct` = risque PENDANT LE CHALLENGE, `fundedRiskPct` = risque UNE FOIS FINANCÉ (par défaut le même que
   * `riskPct` si omis). Décision utilisateur (2026-09-22) : les deux sont cherchés indépendamment ailleurs
   * (`bestChallengeRisk` / la grille RISKS du compte financé) — sans ça, un seul risque partagé pour tout le
   * cycle force le calcul à choisir un risque très bas pour survivre une fois financé (ex. une firme qui interdit
   * la détention le week-end pour une stratégie qui en traverse), et ce même risque bas ralentit alors le
   * challenge alors que ses règles n'ont rien à voir avec la détention.
   */
  function lifecycle(P, start, m, opt, riskPct, endDay, fundedRiskPct) {
    const kChallenge = riskPct / 100;
    const kFunded = (fundedRiskPct != null ? fundedRiskPct : riskPct) / 100;
    const f = m.funded;
    const feeF = m.fee.pct / 100;
    const startDay = P.day[start];
    const chMinDays = opt.challengeMinDays !== undefined ? opt.challengeMinDays : m.minDays;

    let stage = 0;                 // 0 = challenge, 1 = compte financé
    let phase = 0, bal = 1, dayStart = 1, peak = 1, curDay = startDay, dayHas = false;
    let tDays = 0, profDays = 0, posSum = 0, bestDay = 0;      // compteurs du challenge
    let clock = null, lastPay = null, cProf = 0, cBest = 0, cPos = 0, cActive = 0, blockedDay = null; // compte financé
    const o = { fundedDay: null, payouts: 0, count: 0, firstPay: null, purchases: 1, lost: 0, challFails: 0, delayed: 0, delayDays: 0, refund: 0, violations: 0 };

    const resetChallenge = () => {
      stage = 0; phase = 0; bal = 1; dayStart = 1; peak = 1; dayHas = false;
      tDays = 0; profDays = 0; posSum = 0; bestDay = 0;
      clock = null; lastPay = null; cProf = 0; cBest = 0; cPos = 0; cActive = 0; blockedDay = null;
    };

    // Un retrait est demandé le premier jour de trading où toutes les conditions sont réunies.
    const tryPayout = (d) => {
      if (clock === null) return;
      const since = lastPay === null ? d - clock : d - lastPay;
      const need = lastPay === null ? opt.firstAfterDays : opt.cycleDays;
      if (since < need) return;
      const profit = bal - 1;
      if (profit <= 0) return;
      const minPayout = opt.minPayoutPct != null ? opt.minPayoutPct : f.minPayoutPct;
      if (minPayout && profit * 100 < minPayout) return;
      if (opt.minGrowthPct && profit * 100 < opt.minGrowthPct) return;
      if (opt.minProfitableDays && cProf < opt.minProfitableDays.count) return;
      if (opt.minActiveDays && cActive < opt.minActiveDays) return;
      const cons = opt.consistency || f.consistency;
      if (cons) {
        const base = cons.basis === 'positive_days' ? cPos : profit;
        if (!(base > 0) || cBest / base > cons.maxPct / 100) { if (blockedDay === null) blockedDay = d; return; }
      }
      if (blockedDay !== null) { o.delayed++; o.delayDays += d - blockedDay; blockedDay = null; }
      // Fraction retirable (ex. Topstep : 50 % du solde) et plafond par retrait (ex.
      // The5ers High Stakes : 2 000 $ sur 100 000 $) : le reste du profit demeure sur le compte.
      let withdrawn = profit * (f.withdrawFraction || 1);
      let amount = withdrawn * opt.splitPct / 100;
      if (f.payoutCapPct && amount * 100 > f.payoutCapPct) { amount = f.payoutCapPct / 100; withdrawn = amount / (opt.splitPct / 100); }
      o.payouts += amount;
      o.count++;
      if (o.firstPay === null) o.firstPay = d - startDay + 1;
      if (m.fee.refund === 'first' && o.count === 1) o.refund += feeF;
      if (m.fee.refund === 'third' && o.count === 3) o.refund += feeF;
      if (withdrawn >= profit - 1e-12) { bal = 1; } else { bal -= withdrawn; }
      peak = bal; dayStart = bal; lastPay = d; cProf = 0; cBest = 0; cPos = 0; cActive = 0;
    };

    for (let i = start; i < P.n && P.day[i] < endDay; i++) {
      const d = P.day[i];
      if (d !== curDay) {
        if (dayHas) {
          const pnl = bal - dayStart;
          if (stage === 0) {
            if (pnl > 0) { posSum += pnl; if (pnl > bestDay) bestDay = pnl; }
            if (chMinDays && chMinDays.kind === 'profitable' && pnl >= chMinDays.minPct / 100) profDays++;
          } else {
            if (pnl > 0) { cPos += pnl; if (pnl > cBest) cBest = pnl; }
            if (opt.minProfitableDays && pnl >= opt.minProfitableDays.minPct / 100) cProf++;
            cActive++;
          }
        }
        // Plancher suiveur : recalculé APRÈS MINUIT sur le solde de fin de journée.
        if (bal > peak) peak = bal;
        dayStart = bal; curDay = d; dayHas = false;
        if (stage === 1) tryPayout(d);
      }

      // Détention interdite (week-end / nuit) : le compte est perdu avant même que le
      // trade ne compte. C'est le piège d'un compte Standard pour une stratégie swing.
      const h = m.holding;
      if (h && (h.appliesTo === 'all' || stage === 1) && ((h.weekend === 'forbidden' && P.wk[i]) || (h.overnight === 'forbidden' && P.ov[i]))) {
        if (stage === 0) o.challFails++; else o.lost++;
        o.violations++;
        if (o.purchases >= MAX_PURCHASES) { o.gaveUp = true; break; }
        o.purchases++;
        resetChallenge();
        continue;
      }

      bal *= 1 + (stage === 0 ? kChallenge : kFunded) * P.rr[i];
      if (!dayHas) { dayHas = true; if (stage === 0) tDays++; }
      if (stage === 1 && clock === null) clock = d;

      const dl = stage === 0 ? m.dailyLossPct : f.dailyLossPct;
      const daily = dl == null ? Infinity : dl / 100;            // null = pas de perte du jour
      let maxLoss = (stage === 0 ? m.maxLossPct : f.maxLossPct) / 100;
      let type = stage === 0 ? m.maxLossType : f.maxLossType;
      // Topstep : après le 1er retrait la perte max passe à 0 (le plancher devient le capital).
      if (stage === 1 && o.count > 0 && f.postPayoutMaxLossPct != null) { maxLoss = f.postPayoutMaxLossPct / 100; type = 'static'; }
      // trailing_eod_lock : suiveur (fin de journée) puis verrouillé au capital initial.
      const floor = type === 'trailing_eod' ? peak - maxLoss : type === 'trailing_eod_lock' ? Math.min(peak - maxLoss, 1) : 1 - maxLoss;
      if (bal < dayStart - daily || bal < floor) {
        if (stage === 0) o.challFails++; else o.lost++;
        if (o.purchases >= MAX_PURCHASES) { o.gaveUp = true; break; }
        o.purchases++;
        resetChallenge();
        continue;
      }

      if (stage === 0 && bal >= 1 + m.phases[phase] / 100) {
        const today = bal - dayStart;
        let okDays = true;
        const md = chMinDays;
        if (md) okDays = md.kind === 'trading' ? tDays >= md.count : (profDays + (today >= md.minPct / 100 ? 1 : 0)) >= md.count;
        let okBest = true;
        if (m.bestDay) {
          const best = Math.max(bestDay, today > 0 ? today : 0);
          const pos = posSum + (today > 0 ? today : 0);
          if (m.bestDay.basis === 'target') {
            // Topstep : si le meilleur jour dépasse 55 % de l'objectif, l'objectif augmente.
            okBest = bal - 1 >= best / (m.bestDay.maxPct / 100);
          } else {
            const base = m.bestDay.basis === 'positive_days' ? pos : bal - 1;
            okBest = base > 0 && best / base <= m.bestDay.maxPct / 100;
          }
        }
        if (okDays && okBest) {
          phase++;
          bal = 1; dayStart = 1; peak = 1; tDays = 0; profDays = 0; posSum = 0; bestDay = 0; dayHas = false;
          if (phase >= m.phases.length) {
            stage = 1;
            if (o.fundedDay === null) o.fundedDay = d - startDay + 1;
            clock = null; lastPay = null; cProf = 0; cBest = 0; cPos = 0; cActive = 0; blockedDay = null;
          }
        }
      }
    }
    o.net = o.payouts + o.refund - o.purchases * feeF;
    return o;
  }

  // Chaque jour distinct de la période sert de départ (jusqu'à MAX_STARTS, répartis régulièrement) : tous
  // courent jusqu'à la MÊME fin (le dernier jour de la période), pas jusqu'à un horizon fixe compté depuis leur
  // propre départ — un départ proche de la fin a donc naturellement moins de temps pour valider, ce qui est
  // honnête plutôt que de l'exclure ou de déborder sur des trades hors de la période sélectionnée.
  function startIndexes(P) {
    const all = [];
    for (let i = 0; i < P.n; i++) {
      if (i === 0 || P.day[i] !== P.day[i - 1]) all.push(i);
    }
    if (all.length <= MAX_STARTS) return all;
    const out = [];
    for (let j = 0; j < MAX_STARTS; j++) out.push(all[Math.floor(j * all.length / MAX_STARTS)]);
    return out;
  }

  function evaluate(P, starts, m, opt, challengeRisk, risk) {
    const endDay = P.day[P.n - 1] + 1;
    const spanMonths = (P.day[P.n - 1] - P.day[0] + 1) / 30.4;
    const nets = [], monthlyNets = [], pays = [], fundedDays = [], firstPays = [];
    let funded = 0, paid = 0, lost = 0, delayed = 0, delaySum = 0, payoutCount = 0, fails = 0, violStarts = 0;
    starts.forEach((s) => {
      const o = lifecycle(P, s, m, opt, challengeRisk, endDay, risk);
      const netPct = o.net * 100;
      nets.push(netPct);
      pays.push(o.payouts * 100);
      if (o.fundedDay !== null) {
        funded++; fundedDays.push(o.fundedDay);
        // Taux mensuel calculé sur le temps RÉELLEMENT FINANCÉ, pas sur tout le calendrier depuis l'achat du
        // challenge (décision utilisateur, 2026-09-22 : « si on prend une durée moyenne de 70j avant le premier
        // retrait, ça exclut 2 mois et 10 jours » — le temps de validation n'a AUCUN retrait possible par
        // construction, le compter dans le dénominateur écrase le taux pour rien). Un départ dont la majeure
        // partie du recul est mangée par le challenge (proche de la fin de la période sélectionnée) ressortait
        // avec un taux artificiellement bas alors que, UNE FOIS financé, son rythme réel peut être tout à fait
        // normal. Seuls les départs qui ont eu le temps de valider comptent dans cette moyenne (`fundedDays`
        // capture déjà, séparément, le taux de ceux qui n'ont pas eu le temps).
        const fundedDayAbs = P.day[s] + o.fundedDay - 1;
        const activeMonths = Math.max((endDay - fundedDayAbs) / 30.4, 1 / 30.4);
        monthlyNets.push(netPct / activeMonths);
      }
      if (o.count > 0) { paid++; firstPays.push(o.firstPay); }
      if (o.violations > 0) violStarts++;
      lost += o.lost; fails += o.challFails; delayed += o.delayed; delaySum += o.delayDays; payoutCount += o.count;
    });
    const n = starts.length;
    const sortedNets = nets.slice().sort((a, b) => a - b);
    // Moyenne sur les seuls départs financés (`monthlyNets`) : un départ jamais financé n'a, par définition,
    // aucun rythme de retrait à mesurer — il compte déjà dans `fundedPct`, pas ici.
    const meanNetPerMonth = monthlyNets.length ? mean(monthlyNets) : 0;
    return {
      risk, challengeRisk, starts: n,
      // « Retraits potentiels » affiché : le rythme mensuel moyen UNE FOIS FINANCÉ, étendu sur toute la période
      // sélectionnée — PAS la moyenne brute des % de chaque départ (nets/medianNet/p25Net restent sur la durée
      // propre, variable, de chaque départ : gardés pour la dispersion, pas pour un chiffre global). Ignore
      // volontairement le temps de validation (déjà donné à part par « Validation »/« Premier retrait ») : ce
      // chiffre répond à « une fois lancé, à quel rythme ça retire », pas « en tenant compte du démarrage ».
      meanNet: meanNetPerMonth * spanMonths, meanNetPerMonth,
      medianNet: quantile(sortedNets, 0.5), p25Net: quantile(sortedNets, 0.25),
      meanPayout: mean(pays),
      netPositivePct: nets.filter((v) => v > 0).length / n * 100,
      fundedPct: funded / n * 100,
      paidPct: paid / n * 100,
      medianFundedDay: fundedDays.length ? quantile(fundedDays.slice().sort((a, b) => a - b), 0.5) : null,
      // Moyenne (pas seulement la médiane) sur le même grand échantillon de départs (jusqu'à MAX_STARTS,
      // un par date de l'historique) : décision utilisateur, pour donner une validation « en jours » plus
      // représentative qu'un seul jour médian quand la distribution est étalée (peu de très longs départs).
      meanFundedDay: fundedDays.length ? mean(fundedDays) : null,
      medianFirstPay: firstPays.length ? quantile(firstPays.slice().sort((a, b) => a - b), 0.5) : null,
      lostPerStart: (lost + fails) / n,
      fundedLostPerStart: lost / n,
      payoutCount, delayedPayouts: delayed, avgDelayDays: delayed ? delaySum / delayed : 0,
      violatedPct: violStarts / n * 100,
    };
  }

  // Risque utilisé PENDANT LE CHALLENGE, cherché une seule fois par (firme, money management) — indépendamment
  // du risque du compte financé, et réutilisé pour toutes les options de retrait (qui ne jouent aucun rôle avant
  // d'être financé). Décision utilisateur (2026-09-22, retour : « un compte pas swing n'est pas possible, donc
  // on adapte ; les résultats doivent être le reflet de la réalité ») : le challenge doit se valider au risque le
  // plus RAPIDE tant qu'il reste FIABLE (≥ 90 % des départs valident) — jamais au prix de la fiabilité, et jamais
  // ralenti par un risque choisi pour des raisons propres au compte financé (ex. une détention interdite).
  function bestChallengeRisk(P, starts, m, wMax) {
    const endDay = P.day[P.n - 1] + 1;
    const opt0 = m.funded.payoutOptions[0];
    const risks = RISKS.filter((r) => !m.riskCapPct || r * (wMax || 1) <= m.riskCapPct + 1e-9);
    if (!risks.length) return { risk: RISKS[0], fundedPct: 0, meanDay: null };
    let best = null;
    risks.forEach((risk) => {
      const days = [];
      let funded = 0;
      starts.forEach((s) => {
        const o = lifecycle(P, s, m, opt0, risk, endDay, risk);
        if (o.fundedDay !== null) { funded++; days.push(o.fundedDay); }
      });
      const fundedPct = funded / starts.length * 100;
      const meanDay = days.length ? mean(days) : null;
      const cand = { risk, fundedPct, meanDay };
      if (!best) { best = cand; return; }
      const bReliable = best.fundedPct >= 90, cReliable = fundedPct >= 90;
      if (cReliable && !bReliable) { best = cand; return; }
      if (cReliable === bReliable) {
        if (cReliable) { if (cand.meanDay < best.meanDay) best = cand; }
        else if (cand.fundedPct > best.fundedPct) best = cand;
      }
    });
    return best;
  }

  // Rendement d'un compte propre depuis le départ `s` jusqu'à la fin de la période sélectionnée.
  function windowReturn(P, s, riskPct) {
    const k = riskPct / 100, endDay = P.day[P.n - 1] + 1;
    let bal = 1;
    for (let i = s; i < P.n && P.day[i] < endDay; i++) bal *= 1 + k * P.rr[i];
    return (bal - 1) * 100;
  }

  // Indice de recommandation (0-100). Ce n'est pas « le plus gros retrait » : il mélange ce qu'on retire (30 %), la
  // rapidité du 1er retrait (15 %), la part des départs qui retirent (15 %) et qui finissent gagnants (15 %), la
  // validation du challenge (10 %), l'absence de comptes perdus (10 %) et de retraits reportés par la cohérence (5 %).
  const INDEX_WEIGHTS = { net: 0.30, speed: 0.15, paid: 0.15, positive: 0.15, funded: 0.10, safe: 0.10, smooth: 0.05 };
  function scoreEv(ev, ctx) {
    const clamp = (x) => Math.max(0, Math.min(1, x));
    const delayedShare = ev.payoutCount ? ev.delayedPayouts / ev.payoutCount : 0;
    const parts = [
      { id: 'net', raw: ev.meanNet, score: clamp(ev.meanNet / ctx.maxNet) },
      { id: 'speed', raw: ev.medianFirstPay, score: ev.medianFirstPay != null ? clamp(1 - ev.medianFirstPay / ctx.horizonDays) : 0 },
      { id: 'paid', raw: ev.paidPct, score: clamp(ev.paidPct / 100) },
      { id: 'positive', raw: ev.netPositivePct, score: clamp(ev.netPositivePct / 100) },
      { id: 'funded', raw: ev.fundedPct, score: clamp(ev.fundedPct / 100) },
      { id: 'safe', raw: ev.lostPerStart, score: clamp(1 - ev.lostPerStart / MAX_LOST_PER_START) },
      { id: 'smooth', raw: delayedShare * 100, score: clamp(1 - delayedShare) },
    ];
    parts.forEach((p) => { p.weight = INDEX_WEIGHTS[p.id]; });
    return { index: 100 * parts.reduce((s, p) => s + p.weight * p.score, 0), parts };
  }

  function statusOf(best) {
    if (!best) return 'na';
    if (best.meanNet > 0 && best.netPositivePct >= 60) return 'good';
    if (best.meanNet > 0 && best.netPositivePct >= 35) return 'mid';
    return 'bad';
  }

  function annualized(pctOverHorizon, horizonDays) {
    const f = 1 + pctOverHorizon / 100;
    if (!(f > 0)) return null;
    return (Math.pow(f, 365.25 / horizonDays) - 1) * 100;
  }

  /**
   * trades : trades du backtest, DÉJÀ filtrés par année (c'est cette sélection qui fixe la période simulée —
   * plus d'horizon en mois indépendant, décision utilisateur 2026-09-22, voir l'en-tête du fichier)
   * capital0 : capital initial du backtest
   */
  function fit(trades, capital0, opts) {
    const E = window.CHESTBacktestEngine;
    const P = prepare(trades);
    if (P.n < 30) return { error: 'Il faut au moins 30 trades datés pour simuler un compte.' };
    const spanDays = P.day[P.n - 1] - P.day[0] + 1;
    // « horizonDays » = la durée de la période sélectionnée elle-même (pas un horizon fixe) : sert à normaliser
    // le score de rapidité et à annualiser les retraits, cohérent avec ce que chaque départ court réellement.
    const horizonDays = spanDays;
    const starts = startIndexes(P);
    if (starts.length < MIN_STARTS) {
      return { error: `La période sélectionnée en haut de page (${spanDays} jours) est trop courte pour simuler la vie d'un compte. Sélectionne une période plus longue.` };
    }

    // Money management candidats : sans MM (risque plat), le réglage enregistré du backtest, puis les trois profils
    // propfirm du calcul automatique (régularité, performance pure, sécurité). Chacun est un risque par trade
    // (paliers après SL, pause, logiques séparées) décidé à l'ouverture ; la simulation recale ensuite son risque
    // de référence pour chaque firme (grille RISKS) et garde ce qui retire le plus.
    const candidates = [{ id: 'flat', name: 'Sans money management', P, starts, ref: 1, wMax: 1, config: null, trust: null }];
    if (!(opts && opts.mm === false)) {
      const seen = new Set();
      const addPolicy = (id, name, config, trust, split) => {
        const key = JSON.stringify(config);
        if (seen.has(key)) return;
        seen.add(key);
        const series = E.riskSeries(trades, config);
        const pos = series.filter((x) => x > 0);
        if (!pos.length) return;
        const ref = mean(pos);
        const Pp = prepare(trades, (t, idx) => series[idx] / ref);
        if (Pp.n < 30) return;
        const st = startIndexes(Pp);
        if (st.length < MIN_STARTS) return;
        candidates.push({ id, name, P: Pp, starts: st, ref, wMax: Math.max(...pos) / ref, config, trust, split: split || null });
      };
      if (opts && opts.userConfig) addPolicy('user', 'Ton réglage', { risk: opts.userConfig.risk, tiers: opts.userConfig.tiers || [], rules: opts.userConfig.rules || [] }, null);
      const auto = E.optimizeProfiles(trades, capital0, 'pf', { minRiskPct: 0.05 });
      if (!auto.error) auto.profiles.forEach((p) => addPolicy(p.id, p.name, p.config, p.trust, p.split));
    }

    // Phase 1 : toutes les simulations (firme × money management × option de retrait × risque du compte financé).
    const sims = window.CHESTPropRules.models.map((m) => {
      const perCand = candidates.map((c) => {
        const risks = RISKS.filter((r) => !m.riskCapPct || r * c.wMax <= m.riskCapPct + 1e-9);
        if (!risks.length) return null;
        const chRisk = bestChallengeRisk(c.P, c.starts, m, c.wMax).risk;
        return { c, chRisk, perOption: m.funded.payoutOptions.map((opt) => ({ opt, curve: risks.map((risk) => evaluate(c.P, c.starts, m, opt, chRisk, risk)) })) };
      }).filter(Boolean);
      return { m, perCand };
    });
    // Échelle des retraits nets : le meilleur retrait net « sûr » toutes firmes confondues.
    let maxNet = 0;
    sims.forEach((sm) => sm.perCand.forEach((pc) => pc.perOption.forEach((po) => po.curve.forEach((ev) => {
      if (ev.lostPerStart <= MAX_LOST_PER_START && ev.meanNet > maxNet) maxNet = ev.meanNet;
    }))));
    if (!(maxNet > 0)) maxNet = 1;
    const ctx = { maxNet, horizonDays };

    // Phase 2 : pour chaque firme, on garde la combinaison (money management, option, risque) au meilleur INDICE parmi
    // celles qui ne perdent pas plus d'un demi-compte par période ; sinon la moins destructrice.
    const rows = sims.map(({ m, perCand }) => {
      const pick = (curve) => {
        curve.forEach((ev) => { const r = scoreEv(ev, ctx); ev.index = r.index; ev.parts = r.parts; });
        const safe = curve.filter((ev) => ev.lostPerStart <= MAX_LOST_PER_START);
        return safe.length
          ? safe.reduce((a, b) => (b.index > a.index + 1e-9 ? b : a))
          : curve.reduce((a, b) => (b.lostPerStart < a.lostPerStart ? b : a));
      };
      const results = perCand.map((pc) => {
        const perOption = pc.perOption.map((po) => ({ opt: po.opt, curve: po.curve, best: pick(po.curve) }));
        const top = perOption.reduce((a, b) => (b.best.index > a.best.index + 1e-9 ? b : a));
        return { c: pc.c, chRisk: pc.chRisk, perOption, top };
      });
      const flatRes = results.find((r) => r.c.id === 'flat') || results[0];
      const chosen = results.reduce((a, b) => (b.top.best.index > a.top.best.index + 1e-9 ? b : a), flatRes);
      const top = chosen.top, perOption = chosen.perOption, Pc = chosen.c.P;
      const best = top.best;
      best.delayedShare = best.payoutCount ? best.delayedPayouts / best.payoutCount * 100 : 0;
      // Conflit entre ce que la stratégie fait (week-end / nuit) et ce que le compte permet.
      let issue = null;
      const h = m.holding;
      if (h && (h.weekend === 'forbidden' || h.overnight === 'forbidden')) {
        if (!Pc.withTimes) issue = { kind: 'unknown', appliesTo: h.appliesTo, swingModelId: h.swingModelId };
        else {
          const wkHit = h.weekend === 'forbidden' && Pc.wkCount > 0;
          const ovHit = h.overnight === 'forbidden' && Pc.ovCount > 0;
          if (wkHit || ovHit) issue = { kind: wkHit ? 'weekend' : 'overnight', count: wkHit ? Pc.wkCount : Pc.ovCount, share: (wkHit ? Pc.wkCount : Pc.ovCount) / Pc.n * 100, appliesTo: h.appliesTo, swingModelId: h.swingModelId };
        }
      }
      // Money management retenu (null = risque plat) et ce que donnerait le risque plat, pour comparer.
      let mm = null;
      if (chosen.c.id !== 'flat') {
        const scale = best.risk / chosen.c.ref;
        mm = { id: chosen.c.id, name: chosen.c.name, trust: chosen.c.trust, refRisk: best.risk, scale, lines: chosen.c.split ? E.describeSplit(chosen.c.split, scale) : E.describeConfig(chosen.c.config, scale) };
      }
      const flat = flatRes ? { best: flatRes.top.best, option: flatRes.top.opt } : null;
      return { model: m, best, option: top.opt, options: perOption, curve: top.curve, status: statusOf(best), issue, mm, flat, challengeRisk: chosen.chRisk, index: best.index, parts: best.parts };
    });

    // Classement. Si des positions traversent le week-end : les comptes qui l'interdisent passent derrière, et les
    // comptes Swing (faits pour ça) reçoivent un bonus de 15 % sur leur indice.
    const swingIds = new Set(window.CHESTPropRules.models.map((x) => x.holding && x.holding.swingModelId).filter(Boolean));
    const swingPriority = P.withTimes > 0 && P.wkCount > 0;
    const rank = { good: 0, mid: 1, bad: 2 };
    rows.forEach((r) => {
      r.swing = swingIds.has(r.model.id);
      r.compatible = !r.issue || r.issue.kind === 'unknown';
      r.rankScore = r.index * (swingPriority && r.swing ? 1.15 : 1);
    });
    rows.sort((a, b) => (swingPriority ? Number(b.compatible) - Number(a.compatible) : 0)
      || (rank[a.status] - rank[b.status]) || (b.rankScore - a.rankScore) || (a.best.risk - b.best.risk));

    // Compte propre : risque optimisé, rendement moyen sur la même fenêtre. Même correction que pour la
    // propfirm ci-dessus : taux mensuel par départ, moyenné, puis étendu sur toute la période sélectionnée —
    // sinon les départs récents (peu de recul) écrasent la moyenne brute vers le bas.
    const ownOpt = E.optimizeCp(trades, capital0);
    let own = null;
    if (ownOpt) {
      const endDayOwn = P.day[P.n - 1] + 1;
      const spanMonthsOwn = (P.day[P.n - 1] - P.day[0] + 1) / 30.4;
      const rets = starts.map((s) => windowReturn(P, s, ownOpt.risk));
      const monthlyRets = starts.map((s, i) => {
        const runwayMonths = Math.max((endDayOwn - P.day[s]) / 30.4, 1 / 30.4);
        return rets[i] / runwayMonths;
      });
      const meanRetPerMonth = mean(monthlyRets);
      const meanRet = meanRetPerMonth * spanMonthsOwn;
      own = {
        risk: ownOpt.risk, relaxedNote: ownOpt.relaxed ? ownOpt.relaxedNote : null,
        horizonPct: meanRet, horizonPctPerMonth: meanRetPerMonth, horizonUsd: capital0 * meanRet / 100,
        positivePct: rets.filter((v) => v > 0).length / rets.length * 100,
        maxDdPct: ownOpt.report.stats.maxDrawdownPct,
        annualPct: annualized(meanRet, horizonDays),
      };
    }

    const top = rows[0];
    const ref = window.CHESTPropRules.refAccount;
    const prop = {
      risk: top.best.risk, optionLabel: top.option.label,
      horizonPct: top.best.meanNet, horizonUsd: ref * top.best.meanNet / 100,
      payoutPct: top.best.meanPayout, payoutUsd: ref * top.best.meanPayout / 100,
    };

    let kind = top.status === 'good' ? 'propfirm' : top.status === 'mid' ? 'both' : 'own';
    return {
      rows, own, prop, verdict: { kind, top },
      holding: { trades: P.n, withTimes: P.withTimes, weekendCount: P.wkCount, weekendPct: P.n ? P.wkCount / P.n * 100 : 0, overnightCount: P.ovCount, overnightPct: P.n ? P.ovCount / P.n * 100 : 0 },
      meta: { swingPriority, mm: candidates.length > 1, mmNames: candidates.filter((c) => c.id !== 'flat').map((c) => c.name), starts: starts.length, spanDays, trades: P.n, horizonDays, refAccount: ref },
    };
  }

  window.CHESTPropFit = { fit, RISKS };
})();
