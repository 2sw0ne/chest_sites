// CHEST · Règles des prop firms — base VÉRIFIÉE sur les pages officielles.
//
// Règle d'or : on n'écrit ici que ce qu'on a lu sur le site de la firme, avec
// la date de la page et le lien. Un champ non trouvé reste `null` ou figure
// dans `unverified[]` (affiché « non vérifié »), jamais deviné en silence.
// Ces conditions changent souvent : le site officiel fait foi avant tout achat.
//
// Une prop firm, ce n'est pas seulement « passer le challenge » : ce qui compte
// c'est la validation ET les retraits ensuite. Chaque modèle décrit donc deux
// étapes :
//   challenge  phases[] (objectifs en % du capital initial), perte du jour,
//              perte max (fixe ou suiveuse), jours minimum, règle du meilleur jour
//   funded     règles du compte financé + options de retrait (payoutOptions[])
//
// Types de perte max :
//   'static'        plancher fixe : capital initial − X %
//   'trailing_eod'  plancher suiveur recalculé APRÈS MINUIT : plus haut solde de
//                   fin de journée − X % (il monte avec le PnL, ne redescend pas)
//
// Règle de cohérence  { maxPct, basis } :
//   basis 'positive_days' → le meilleur jour ne doit pas dépasser maxPct % du
//                           profit des jours positifs (ex. FTMO 1 étape)
//   basis 'total_profit'  → … maxPct % du profit total du cycle (ex. 35 %, 40 %, 45 %)
//
// Option de retrait : splitPct, firstAfterDays (jours calendaires depuis le
// 1er trade financé), cycleDays (entre deux retraits), minProfitableDays
// { count, minPct }, minGrowthPct (profit minimum), consistency.
// Après un retrait le solde revient au capital initial (le profit est retiré).
//
// Détention week-end / nuit : holding { weekend, overnight, appliesTo:'all'|'funded',
// swingModelId }. Un trade qui traverse un week-end sur un compte où c'est interdit
// FAIT PERDRE le compte dans la simulation (ex. FTMO Standard financé, Alpha Pro
// qualifié, Topstep) ; swingModelId désigne la variante Swing qui l'autorise.
// Autres champs : market 'futures' (Topstep), prices.unit '/mois' (abonnement),
// prices.refSize (taille simulée), funded.postPayoutMaxLossPct (Topstep : perte max
// ramenée à 0 après le 1er retrait), funded.withdrawFraction / payoutCapPct,
// option.minActiveDays (jours de trading actifs par cycle).
//
// Frais : fee.pct = frais du challenge en % du compte de 100 000. `verified`
// dit si le prix vient de la page officielle (tous relevés le 20/09/2026, prix affichés). Un compte perdu se rachète : sans
// frais, prendre un risque énorme paraîtrait toujours rentable.
(() => {
  'use strict';

  const VERIFIED_ON = '2026-09-20';
  const REF_ACCOUNT = 100000;

  const MODELS = [
    {
      id: 'ftmo-1step', firm: 'FTMO', label: '1 étape',
      consistencyNote: 'Règle du meilleur jour : le meilleur jour ne doit pas dépasser 50 % du profit des jours positifs (page officielle des objectifs).',
      phases: [10], dailyLossPct: 3, maxLossPct: 10, maxLossType: 'trailing_eod',
      minDays: null, bestDay: { maxPct: 50, basis: 'positive_days' },
      funded: {
        dailyLossPct: 3, maxLossPct: 10, maxLossType: 'trailing_eod',
        consistency: { maxPct: 50, basis: 'positive_days' },
        payoutOptions: [
          { id: 'std', label: 'Retrait dès le 14e jour', splitPct: 90, firstAfterDays: 14, cycleDays: 14, minProfitableDays: null, minGrowthPct: null, consistency: null },
        ],
      },
      riskCapPct: null,
      holding: { weekend: 'forbidden', overnight: 'allowed', appliesTo: 'funded', swingModelId: null, note: 'Compte FTMO (financé) Standard : positions à fermer avant la fermeture du week-end (ou si la coupure dépasse 2 h). Aucune restriction pendant le challenge. Le compte Swing n\'existe pas en 1 étape.' },
      fee: { pct: 0.5, verified: true, refund: null, note: '499 € pour un compte de 100 000 (tarif normal, 399 € en promotion) — frais non remboursables (page FTMO)' },
      prices: { currency: 'EUR', asOf: '2026-09-20', source: 'https://ftmo.com/en/', sizes: [{ size: 10000, price: 79 }, { size: 25000, price: 199 }, { size: 50000, price: 319 }, { size: 100000, price: 399, regular: 499 }, { size: 200000, price: 999 }],
        notes: ['Frais unique, non remboursable', 'Offre du moment : −20 % sur le compte de 100 000 (399 € au lieu de 499 €)'] },
      newsFunded: 'Compte FTMO : aucun ordre ouvert, fermé ou déclenché (SL/TP) 2 min avant / après une annonce majeure (comptes Standard).',
      source: { url: 'https://ftmo.com/en/trading-objectives/', pageDate: '2026-05-13' },
      facts: [
        'Perte max SUIVEUSE, recalculée chaque jour : elle monte avec ton PnL de fin de journée',
        'Règle du meilleur jour : 50 % du profit des jours positifs',
        'Retrait possible dès le 14e jour après le 1er trade ; le solde ne peut pas rester sur le compte',
        'Partage 90 % · frais non remboursés',
        'Annonces libres pendant le challenge',
      ],
      unverified: ['Rythme des retraits après le premier (14 jours supposé)', 'Plafonnement du plancher suiveur non précisé (non plafonné ici)'],
    },
    {
      id: 'ftmo-2step', firm: 'FTMO', label: '2 étapes',
      consistencyNote: 'Aucune règle de cohérence en dehors des objectifs (FAQ officielle « Do you have any consistency rules? »).',
      phases: [10, 5], dailyLossPct: 5, maxLossPct: 10, maxLossType: 'static',
      minDays: { count: 4, kind: 'trading' }, bestDay: null,
      funded: {
        dailyLossPct: 5, maxLossPct: 10, maxLossType: 'static', consistency: null,
        payoutOptions: [
          { id: 'std', label: 'Retrait dès le 14e jour', splitPct: 80, firstAfterDays: 14, cycleDays: 14, minProfitableDays: null, minGrowthPct: null, consistency: null },
        ],
      },
      riskCapPct: null,
      holding: { weekend: 'forbidden', overnight: 'allowed', appliesTo: 'funded', swingModelId: 'ftmo-2step-swing', note: 'Compte FTMO (financé) Standard : positions à fermer avant la fermeture du week-end (ou si la coupure dépasse 2 h). Aucune restriction pendant le challenge. Le compte Swing (2 étapes, à choisir à l\'achat, non modifiable ensuite vers le Swing) lève la restriction.' },
      fee: { pct: 0.54, verified: true, refund: 'first', note: '540 € pour un compte de 100 000 (tarif normal, 439 € en promotion) — remboursé avec le 1er retrait (page FTMO)' },
      prices: { currency: 'EUR', asOf: '2026-09-20', source: 'https://ftmo.com/en/', sizes: [{ size: 10000, price: 89 }, { size: 25000, price: 250 }, { size: 50000, price: 345 }, { size: 100000, price: 439, regular: 540 }, { size: 200000, price: 1080 }],
        notes: ['Frais unique, remboursé avec le 1er retrait'] },
      newsFunded: 'Compte FTMO : aucun ordre ouvert, fermé ou déclenché (SL/TP) 2 min avant / après une annonce majeure (comptes Standard).',
      source: { url: 'https://ftmo.com/en/trading-objectives/', pageDate: '2026-05-13' },
      facts: [
        'Perte max fixe · 4 jours de trading minimum par phase',
        'Retrait possible dès le 14e jour après le 1er trade',
        'Partage 80 % (90 % avec le plan de croissance) · frais remboursés avec le 1er retrait',
        'Annonces libres pendant le challenge',
      ],
      unverified: ['Rythme des retraits après le premier (14 jours supposé)'],
    },
    {
      id: 'ftmo-2step-swing', firm: 'FTMO', label: '2 étapes Swing',
      consistencyNote: 'Aucune règle de cohérence en dehors des objectifs (FAQ officielle « Do you have any consistency rules? »).',
      phases: [10, 5], dailyLossPct: 5, maxLossPct: 10, maxLossType: 'static',
      minDays: { count: 4, kind: 'trading' }, bestDay: null,
      funded: {
        dailyLossPct: 5, maxLossPct: 10, maxLossType: 'static', consistency: null,
        payoutOptions: [
          { id: 'std', label: 'Retrait dès le 14e jour', splitPct: 80, firstAfterDays: 14, cycleDays: 14, minProfitableDays: null, minGrowthPct: null, consistency: null },
        ],
      },
      riskCapPct: null,
      holding: { weekend: 'allowed', overnight: 'allowed', appliesTo: 'all', swingModelId: null, note: 'Compte Swing : aucune restriction de nuit, de week-end ni d\'annonces (FAQ officielle « FTMO Swing account type »). Disponible uniquement en 2 étapes, à choisir à l\'achat ; on peut repasser du Swing au Standard, jamais l\'inverse. Levier 1:30.' },
      fee: { pct: 0.54, verified: true, refund: 'first', note: '540 € pour un compte de 100 000 (tarif normal, 439 € en promotion) — remboursé avec le 1er retrait (page FTMO) ; aucun surcoût Swing indiqué' },
      prices: { currency: 'EUR', asOf: '2026-09-20', source: 'https://ftmo.com/en/', sizes: [{ size: 10000, price: 89 }, { size: 25000, price: 250 }, { size: 50000, price: 345 }, { size: 100000, price: 439, regular: 540 }, { size: 200000, price: 1080 }],
        notes: ['Aucun surcoût indiqué pour le Swing : mêmes prix que le 2 étapes Standard (la FAQ précise que les frais dépendent du challenge et de la taille du compte)', 'Frais unique, remboursé avec le 1er retrait'] },
      newsFunded: 'Aucune restriction d\'annonces sur le compte Swing.',
      source: { url: 'https://ftmo.com/en/faq/ftmo-swing-account-type/', pageDate: null },
      facts: [
        'Mêmes objectifs et mêmes retraits que le 2 étapes Standard (perte max fixe, 4 jours de trading minimum par phase, retrait dès le 14e jour, partage 80 %)',
        'Nuit, week-end et annonces sans restriction sur le compte financé',
        'Levier 1:30 au lieu de 1:100 · disponible uniquement en 2 étapes',
      ],
      unverified: ['Rythme des retraits après le premier (14 jours supposé)', 'Aucune page officielle n\'indique de surcoût pour le Swing : les frais sont ceux du 2 étapes Standard (la FAQ précise que le prix dépend du challenge et de la taille du compte)'],
    },
    {
      id: 'fundednext-stellar-1', firm: 'FundedNext', label: 'Stellar 1 étape',
      consistencyNote: 'Aucune règle de cohérence trouvée pour ce modèle (règles CFD officielles).',
      phases: [10], dailyLossPct: 3, maxLossPct: 6, maxLossType: 'static',
      minDays: { count: 2, kind: 'trading' }, bestDay: null,
      funded: {
        dailyLossPct: 3, maxLossPct: 6, maxLossType: 'static', consistency: null,
        payoutOptions: [
          { id: 'std', label: 'Cycle de 5 jours ouvrés', splitPct: 80, firstAfterDays: 0, cycleDays: 7, minProfitableDays: null, minGrowthPct: null, consistency: null },
        ],
      },
      riskCapPct: 3,
      holding: { weekend: 'allowed', overnight: 'allowed', appliesTo: 'all', swingModelId: null, note: 'Week-end et nuit autorisés (swaps à ta charge, triples le mercredi pour le forex et l\'or).' },
      fee: { pct: 0.57, verified: true, refund: 'third', note: '569,99 $ pour 100 000 (prix affiché, remises possibles) — remboursé avec le 3e retrait' },
      prices: { currency: 'USD', asOf: '2026-09-20', source: 'https://fundednext.com/cfds/stellar-1-step', sizes: [{ size: 6000, price: 39.99, regular: 65.99 }, { size: 15000, price: 103.99 }, { size: 25000, price: 175.99 }, { size: 50000, price: 263.99 }, { size: 100000, price: 569.99 }, { size: 200000, price: 1099.99 }],
        notes: ['Prix affichés avec remise (le tarif normal n\'apparaît que pour le compte de 6 000 : 65,99 $)', 'Frais remboursés avec le 3e retrait', 'Option « Lifetime Reward 95 % » : 95 % de partage, prix non relevé'] },
      newsFunded: 'Trades ouverts ou clôturés ±5 min autour d\'une annonce : seulement 40 % de leur profit compte, 100 % de la perte reste à ta charge.',
      source: { url: 'https://fundednext.com/cfd-challenge-terms', pageDate: '2026-05-05' },
      facts: [
        'Perte max FIXE : le compte ne doit pas passer sous 94 % du capital initial',
        'Limite de risque : 3 % maximum à tout moment sur le compte (2e violation : limite ramenée à 1 %)',
        'Premier retrait dès le passage au compte financé, puis tous les 5 jours ouvrés · partage 80 %',
      ],
      unverified: ['5 jours ouvrés converti en 7 jours calendaires', 'Consistance : aucune règle trouvée pour ce modèle'],
    },
    {
      id: 'fundednext-stellar-2', firm: 'FundedNext', label: 'Stellar 2 étapes',
      consistencyNote: 'Aucune règle de cohérence, sauf l\'option de retrait « À la demande » : 40 % (aide officielle FundedNext).',
      phases: [8, 5], dailyLossPct: 5, maxLossPct: 10, maxLossType: 'static',
      minDays: { count: 5, kind: 'trading' }, bestDay: null,
      funded: {
        dailyLossPct: 5, maxLossPct: 10, maxLossType: 'static', consistency: null,
        payoutOptions: [
          { id: 'std', label: 'Standard · 80 %', splitPct: 80, firstAfterDays: 21, cycleDays: 14, minProfitableDays: null, minGrowthPct: null, consistency: null },
          { id: '3day', label: '3 jours · 60 %', splitPct: 60, firstAfterDays: 21, cycleDays: 14, minProfitableDays: { count: 3, minPct: 1 }, minGrowthPct: null, consistency: null },
          { id: 'demand', label: 'À la demande · 90 %', splitPct: 90, firstAfterDays: 0, cycleDays: 1, minProfitableDays: null, minGrowthPct: 2, consistency: { maxPct: 40, basis: 'total_profit' } },
        ],
      },
      riskCapPct: 3,
      holding: { weekend: 'allowed', overnight: 'allowed', appliesTo: 'all', swingModelId: null, note: 'Week-end et nuit autorisés (swaps à ta charge, triples le mercredi pour le forex et l\'or).' },
      fee: { pct: 0.55, verified: true, refund: 'first', note: '549,99 $ pour 100 000 (prix affiché) — remboursé avec le 1er retrait' },
      prices: { currency: 'USD', asOf: '2026-09-20', source: 'https://fundednext.com/cfds/stellar-2-step', sizes: [{ size: 6000, price: 29.99 }, { size: 15000, price: 95.99 }, { size: 25000, price: 159.99 }, { size: 50000, price: 239.99 }, { size: 100000, price: 549.99 }, { size: 200000, price: 1099.99 }],
        notes: ['Prix affichés, promotions incluses', 'Frais remboursés avec le 1er retrait', 'Option « Lifetime Reward 95 % » : 95 % de partage, prix non relevé'] },
      newsFunded: 'Trades ±5 min autour d\'une annonce : seulement 40 % de leur profit compte (comptes financés Stellar).',
      source: { url: 'https://help.fundednext.com/en/articles/10701585-how-often-will-i-receive-my-performance-reward', pageDate: null },
      facts: [
        'Perte max FIXE (10 % depuis le solde initial) — règles CFD officielles',
        'Trois options de retrait : Standard (80 %, 1er retrait à 21 jours, puis tous les 14 jours), 3 jours (60 %, 3 jours profitables ≥ 1 % par cycle), À la demande (90 %, +2 % de croissance et 40 % de consistance)',
        'Limite de risque : 3 % maximum à tout moment',
        'Frais remboursés avec le 1er retrait',
      ],
      unverified: ['Consistance « 40 % » de l\'option À la demande interprétée comme meilleur jour ≤ 40 % du profit du cycle', 'Rythme de l\'option 3 jours supposé identique au Standard'],
    },
    {
      id: 'fundednext-stellar-lite', firm: 'FundedNext', label: 'Stellar Lite',
      consistencyNote: 'Aucune règle de cohérence, sauf l\'option de retrait « À la demande » : 40 % (aide officielle FundedNext).',
      phases: [8, 4], dailyLossPct: 4, maxLossPct: 8, maxLossType: 'static',
      minDays: { count: 5, kind: 'trading' }, bestDay: null,
      funded: {
        dailyLossPct: 4, maxLossPct: 8, maxLossType: 'static', consistency: null,
        payoutOptions: [
          { id: 'std', label: 'Standard · 80 %', splitPct: 80, firstAfterDays: 21, cycleDays: 14, minProfitableDays: null, minGrowthPct: null, consistency: null },
          { id: '3day', label: '3 jours · 60 %', splitPct: 60, firstAfterDays: 21, cycleDays: 14, minProfitableDays: { count: 3, minPct: 1 }, minGrowthPct: null, consistency: null },
          { id: 'demand', label: 'À la demande · 90 %', splitPct: 90, firstAfterDays: 0, cycleDays: 1, minProfitableDays: null, minGrowthPct: 2, consistency: { maxPct: 40, basis: 'total_profit' } },
        ],
      },
      riskCapPct: 3,
      holding: { weekend: 'allowed', overnight: 'allowed', appliesTo: 'all', swingModelId: null, note: 'Week-end et nuit autorisés (swaps à ta charge, triples le mercredi pour le forex et l\'or).' },
      fee: { pct: 0.4, verified: true, refund: 'third', note: '399,99 $ pour un compte de 100 000 (prix affiché avec remise) — remboursé avec le 3e retrait (page FundedNext)' },
      prices: { currency: 'USD', asOf: '2026-09-20', source: 'https://fundednext.com/cfds/stellar-lite', sizes: [{ size: 5000, price: 26.39, regular: 32.99 }, { size: 10000, price: 47.99, regular: 59.99 }, { size: 25000, price: 111.99, regular: 139.99 }, { size: 50000, price: 183.99, regular: 229.99 }, { size: 100000, price: 399.99 }, { size: 200000, price: 798.99 }],
        notes: ['Prix normal non affiché pour 100 000 et 200 000', 'Frais remboursés avec le 3e retrait'] },
      newsFunded: 'Trades ±5 min autour d\'une annonce : seulement 40 % de leur profit compte (comptes financés Stellar).',
      source: { url: 'https://fundednext.com/cfd-challenge-terms', pageDate: '2026-05-05' },
      facts: [
        'Perte max FIXE (8 % : le compte ne doit pas passer sous 92 % du solde initial)',
        'Mêmes trois options de retrait que le Stellar 2 étapes',
        'Limite de risque : 3 % maximum à tout moment',
      ],
      unverified: ['Consistance « 40 % » de l\'option À la demande interprétée comme meilleur jour ≤ 40 % du profit du cycle'],
    },
    {
      id: 'the5ers-hypergrowth', firm: 'The5ers', label: 'Hyper Growth · 1 étape',
      consistencyNote: 'Aucune règle de cohérence trouvée sur la fiche Hyper Growth.',
      phases: [10], dailyLossPct: 3, maxLossPct: 6, maxLossType: 'static',
      minDays: { count: 3, kind: 'profitable', minPct: 0.5 }, bestDay: null,
      funded: {
        dailyLossPct: 3, maxLossPct: 6, maxLossType: 'static', consistency: null,
        payoutOptions: [
          { id: 'std', label: 'Retrait dès le 14e jour', splitPct: 75, firstAfterDays: 14, cycleDays: 14, minProfitableDays: null, minGrowthPct: null, consistency: null, minPayoutPct: 0.15 },
        ],
      },
      riskCapPct: null,
      holding: { weekend: 'allowed', overnight: 'allowed', appliesTo: 'all', swingModelId: null, note: 'Week-end permis (page officielle Hyper Growth).' },
      fee: { pct: 0.66, verified: true, refund: null, note: '329 $ pour le plus grand compte (50 000) : pas de compte de 100 000 — remboursement non précisé' },
      prices: { currency: 'USD', asOf: '2026-09-20', source: 'https://the5ers.com/hyper-growth/', sizes: [{ size: 5000, price: 52 }, { size: 10000, price: 98 }, { size: 20000, price: 189 }, { size: 50000, price: 329 }],
        notes: ['Le compte le plus grand est de 50 000 $ ; il double à chaque objectif de 10 % atteint', 'Prix affichés, promotions incluses'] },
      newsFunded: 'Annonces permises (sauf stratégies « bracket » autour des annonces).',
      source: { url: 'https://the5ers.com/hyper-growth/', pageDate: null },
      facts: [
        'Perte max fixe : « stop out » à 6 % sous le capital initial · perte du jour 3 %',
        'Premier retrait 14 jours après l\'activation du compte financé, puis toutes les 2 semaines (profit minimum 150 $)',
        'Le compte double à chaque objectif de 10 % atteint (plan de croissance)',
        'Durée illimitée · week-end permis',
      ],
      unverified: ['Partage de 75 % lu dans le tableau du plan de croissance (à confirmer pour le départ)', 'Jours profitables exigés seulement au challenge dans cette simulation'],
    },
    {
      id: 'the5ers-highstakes', firm: 'The5ers', label: 'High Stakes · 2 étapes',
      consistencyNote: 'Aucune pendant l\'évaluation ; 50 % sur le compte financé (page officielle 2 étapes) — mode de calcul non précisé, lu comme meilleur jour ≤ 50 % du profit du cycle.',
      phases: [10, 5], dailyLossPct: 5, maxLossPct: 10, maxLossType: 'static',
      minDays: { count: 3, kind: 'profitable', minPct: 0.5 }, bestDay: null,
      funded: {
        dailyLossPct: 5, maxLossPct: 10, maxLossType: 'static',
        consistency: { maxPct: 50, basis: 'total_profit' }, payoutCapPct: 2, minPayoutPct: 0.25,
        payoutOptions: [
          { id: 'std', label: 'Retrait dès le 14e jour', splitPct: 80, firstAfterDays: 14, cycleDays: 14, minProfitableDays: null, minGrowthPct: null, consistency: null },
        ],
      },
      riskCapPct: null,
      holding: { weekend: 'allowed', overnight: 'allowed', appliesTo: 'all', swingModelId: null, note: 'Nuit et week-end permis ; swap élevé sur les indices tenus le week-end (page officielle High Stakes).' },
      fee: { pct: 0.46, verified: true, refund: null, note: '455 $ pour un compte de 100 000 (tarif normal, 405 $ en promotion) — remboursement à confirmer' },
      prices: { currency: 'USD', asOf: '2026-09-20', source: 'https://the5ers.com/high-stakes/', sizes: [{ size: 2500, price: 19, regular: 22 }, { size: 5000, price: 35, regular: 39 }, { size: 10000, price: 69, regular: 78 }, { size: 25000, price: 176, regular: 195 }, { size: 50000, price: 249, regular: 279 }, { size: 100000, price: 405, regular: 455 }],
        notes: ['Remboursement du prix mentionné sur la page (« Refund ») : conditions à confirmer'] },
      newsFunded: 'Aucun ordre exécuté 2 min avant / après une annonce majeure (garder une position ouverte est permis).',
      source: { url: 'https://the5ers.com/high-stakes/', pageDate: null },
      facts: [
        'Compte financé : consistance de 50 % · retrait minimum 250 $ de profit · plafond de 2 000 $ par retrait (compte de 100 000 $)',
        'Jour profitable = clôtures positives d\'au moins 0,5 % du capital initial',
        'Premier retrait 14 jours après l\'activation, puis toutes les 2 semaines (profit minimum 150 $)',
        'Partage 80 % (jusqu\'à 100 % avec la croissance) · week-end permis',
      ],
      unverified: ['Mode de calcul de la consistance de 50 % non précisé', 'Ce qui reste du profit au-delà du plafond de 2 000 $ : supposé laissé sur le compte'],
    },
    {
      id: 'fundingpips-2step-flex', firm: 'Funding Pips', label: '2 étapes Flex',
      consistencyNote: 'Aucune sur les cycles bimensuels (85 % et 95 %) ; 35 % sur le cycle mensuel à 100 % : aucun jour ne doit peser plus de 35 % du profit total, remis à zéro après chaque retrait (aide officielle).',
      phases: [10, 6], dailyLossPct: 4, maxLossPct: 12, maxLossType: 'static',
      minDays: { count: 1, kind: 'trading' }, bestDay: null,
      funded: {
        dailyLossPct: 4, maxLossPct: 12, maxLossType: 'static', consistency: null,
        payoutOptions: [
          { id: 'bw85', label: 'Toutes les 2 semaines · 85 %', splitPct: 85, firstAfterDays: 14, cycleDays: 14, minProfitableDays: null, minGrowthPct: null, consistency: null, minPayoutPct: 1, challengeMinDays: { count: 1, kind: 'trading' } },
          { id: 'bw95', label: 'Toutes les 2 semaines · 95 %', splitPct: 95, firstAfterDays: 14, cycleDays: 14, minProfitableDays: { count: 3, minPct: 0.5 }, minGrowthPct: null, consistency: null, minPayoutPct: 1, challengeMinDays: { count: 3, kind: 'profitable', minPct: 0.5 } },
          { id: 'm100', label: 'Mensuel · 100 %', splitPct: 100, firstAfterDays: 30, cycleDays: 30, minProfitableDays: { count: 7, minPct: 0.5 }, minGrowthPct: null, consistency: { maxPct: 35, basis: 'total_profit' }, minPayoutPct: 1, challengeMinDays: { count: 1, kind: 'trading' } },
        ],
      },
      riskCapPct: 2,
      holding: { weekend: 'allowed', overnight: 'allowed', appliesTo: 'all', swingModelId: null, note: 'Nuit et week-end permis (page officielle des objectifs).' },
      fee: { pct: 0.56, verified: true, refund: null, note: '555 $ pour un compte de 100 000 (tarif normal, 499 $ en promotion) — remboursement non précisé' },
      prices: { currency: 'USD', asOf: '2026-09-20', source: 'https://fundingpips.com/', sizes: [{ size: 5000, price: 32 }, { size: 10000, price: 59 }, { size: 25000, price: 159 }, { size: 50000, price: 269 }, { size: 100000, price: 499, regular: 555 }],
        notes: ['Option swap-free disponible sur toutes les tailles (prix non relevé)', 'Les autres modèles (Zero, 1 étape Flex, 2 étapes Standard et Pro) existent aussi et ne sont pas simulés ici'] },
      newsFunded: 'Compte Master : aucun ordre ouvert ou fermé 5 min avant / après une annonce majeure ; les profits d\'annonce sont déduits.',
      source: { url: 'https://fundingpips.com/trading-objectives', pageDate: null },
      facts: [
        'Risque maximum par idée de trade sur le compte Master : 2 % au-dessus de 25 000 $ (3 % à 25 000 $)',
        'Trois cycles de retrait, tous comptés depuis le 1er trade du Master : toutes les 2 semaines à 85 % (sans condition), à 95 % (3 jours profitables par cycle), ou mensuel à 100 % (consistance 35 %, 7 jours profitables de 0,5 %)',
        'Retrait minimum : 1 % de la taille du compte · jours minimum de l\'évaluation : 1 jour (85 %) ou 3 jours profitables (95 %)',
        'Inactivité : fermer au moins 1 trade tous les 30 jours · week-end permis',
      ],
      unverified: ['Jour profitable de l\'évaluation (option 95 %) supposé à 0,5 % comme sur le compte Master', 'Système « strikes » à 1 % du cycle mensuel non simulé'],
    },
    {
      id: 'topstep-combine-50k', firm: 'Topstep', label: 'Combine 50 000 (futures)', market: 'futures',
      consistencyNote: 'Combine : le meilleur jour doit rester ≤ 55 % de l\'objectif de profit, sinon l\'objectif augmente. Compte financé : chemin Consistance = meilleur jour ≤ 40 % du profit net ; chemin Standard = 5 jours gagnants de 150 $ minimum (aide officielle Topstep).',
      phases: [6], dailyLossPct: null, maxLossPct: 4, maxLossType: 'trailing_eod_lock',
      minDays: null, bestDay: { maxPct: 55, basis: 'target' },
      funded: {
        dailyLossPct: null, maxLossPct: 4, maxLossType: 'trailing_eod_lock', consistency: null,
        postPayoutMaxLossPct: 0, withdrawFraction: 0.5, payoutCapPct: 4, minPayoutPct: 0.25,
        payoutOptions: [
          { id: 'std', label: 'Standard · 5 jours gagnants', splitPct: 90, firstAfterDays: 0, cycleDays: 1, minProfitableDays: { count: 5, minPct: 0.3 }, minGrowthPct: null, consistency: null },
          { id: 'cons', label: 'Consistance · 40 %', splitPct: 90, firstAfterDays: 0, cycleDays: 1, minProfitableDays: null, minActiveDays: 3, minGrowthPct: null, consistency: { maxPct: 40, basis: 'total_profit' } },
        ],
      },
      riskCapPct: null,
      holding: { weekend: 'forbidden', overnight: 'forbidden', appliesTo: 'all', swingModelId: null, note: 'Toutes les positions doivent être fermées à 15 h 10 (heure du Centre) chaque jour ouvré : aucune position d\'une séance à l\'autre, donc ni nuit ni week-end, à tous les stades (règle officielle Topstep).' },
      fee: { pct: 0.5, verified: false, refund: null, note: 'Abonnement 49 $/mois (compte de 50 000) + 149 $ d\'activation du compte financé ; durée estimée à 2 mois : ≈ 247 $ pour 50 000 $' },
      prices: { currency: 'USD', asOf: '2026-09-20', source: 'https://help.topstep.com/en/articles/14289835-topstep-pricing-and-payment-questions', unit: '/mois', refSize: 50000,
        sizes: [{ size: 50000, price: 49 }, { size: 100000, price: 99 }, { size: 150000, price: 199 }],
        notes: ['Abonnement mensuel du Trading Combine ; 149 $ d\'activation à chaque compte financé obtenu (option « sans frais d\'activation » plus chère, prix divergents entre pages officielles : non retenus)', 'Réinitialisation au même prix que l\'abonnement'] },
      newsFunded: 'Aucune règle d\'annonces trouvée dans les pages lues (futures).',
      source: { url: 'https://help.topstep.com/en/articles/8284208-consistency-at-topstep', pageDate: null },
      facts: [
        'Futures uniquement : la stratégie doit pouvoir s\'exécuter sur contrats à terme (ex. contrats micro sur l\'or)',
        'Combine 50 000 $ : objectif 3 000 $ (6 %), perte max 2 000 $ (4 %) SUIVEUSE sur le solde de fin de journée, qui se verrouille au capital initial une fois atteint',
        'Compte financé : partage 90 %, on retire 50 % du solde dans la limite d\'un plafond ; après le 1er retrait la perte max passe à 0 (plancher = capital)',
        'Perte du jour : optionnelle',
      ],
      unverified: ['Frais estimés (durée du Combine supposée : 2 mois)', 'Plafond de retrait du compte de 50 000 $ supposé à 2 000 $ (fourchette lue : 2 000 à 5 000 $)', 'Jours minimum du Combine non précisés', 'Contrats maximum (5 sur 50 000 $) non simulés'],
    },
    {
      id: 'blueberry-prime', firm: 'Blueberry Funded', label: 'Prime · 2 étapes',
      consistencyNote: 'Aucune règle de cohérence (aide officielle : « There is no consistency rule on Prime »).',
      phases: [8, 6], dailyLossPct: 4, maxLossPct: 10, maxLossType: 'static',
      minDays: null, bestDay: null,
      funded: {
        dailyLossPct: 4, maxLossPct: 10, maxLossType: 'static', consistency: null,
        payoutOptions: [
          { id: 'std', label: 'Cycle de 14 jours · 80 %', splitPct: 80, firstAfterDays: 14, cycleDays: 14, minProfitableDays: null, minActiveDays: 3, minGrowthPct: null, consistency: null },
        ],
      },
      riskCapPct: null,
      holding: { weekend: 'allowed', overnight: 'allowed', appliesTo: 'all', swingModelId: null, note: 'Nuit et week-end autorisés sur tous les comptes sauf le Flex 1 étape (non simulé ici) ; risque d\'écart d\'ouverture le lundi.' },
      fee: { pct: 0.81, verified: true, refund: null, note: '812 $ pour un compte de 100 000 (tarif normal, 569 $ avec −30 %) — remboursement non précisé' },
      prices: { currency: 'USD', asOf: '2026-09-20', source: 'https://blueberryfunded.com/prime/',
        sizes: [{ size: 25000, price: 145, regular: 206 }, { size: 50000, price: 285, regular: 406 }, { size: 100000, price: 569, regular: 812 }],
        notes: ['Seuls les comptes de 25 000, 50 000 et 100 000 $ affichent un prix sur la page ; les autres tailles (2 500, 5 000, 10 000, 200 000 $) existent mais leur prix n\'a pas été lu', 'Offre du moment : −30 %'] },
      newsFunded: 'Aucune nouvelle position ±2 min autour d\'une annonce majeure.',
      source: { url: 'https://help.blueberryfunded.com/en/articles/12136509-what-is-the-prime-challenge', pageDate: null },
      facts: [
        'Objectifs 8 % puis 6 % · perte du jour 4 % (le plus haut du solde ou de l\'équité au départ du jour) · perte max 10 % FIXE',
        'Retraits tous les 14 jours, partage 80 %, 3 jours de trading actifs minimum par cycle (5 avant le 17 août 2026)',
        'Aucune limite de risque par trade · levier 1:30',
      ],
      unverified: ['Jours minimum du challenge non lus', 'Premier retrait supposé au bout d\'un cycle de 14 jours', 'Remboursement des frais non trouvé', 'Prix de 100 000 $ : tarif normal retenu (promotion de 30 % en cours)'],
    },
    {
      id: 'alpha-pro-8', firm: 'Alpha Capital', label: 'Pro 8 % · 2 étapes',
      consistencyNote: 'Retraits sur demande : meilleur jour ≤ 40 % du profit net total et 2 % de profit minimum ; retraits bimensuels : aucune règle de cohérence trouvée (aide officielle Alpha).',
      phases: [8, 5], dailyLossPct: 4, maxLossPct: 8, maxLossType: 'static',
      minDays: { count: 3, kind: 'trading' }, bestDay: null,
      funded: {
        dailyLossPct: 4, maxLossPct: 8, maxLossType: 'static', consistency: null,
        minPayoutPct: 0.1,
        payoutOptions: [
          { id: 'bw', label: 'Toutes les 2 semaines · 80 %', splitPct: 80, firstAfterDays: 14, cycleDays: 14, minProfitableDays: null, minActiveDays: 5, minGrowthPct: null, consistency: null },
          { id: 'demand', label: 'Sur demande · 80 %', splitPct: 80, firstAfterDays: 0, cycleDays: 1, minProfitableDays: null, minGrowthPct: 2, consistency: { maxPct: 40, basis: 'total_profit' } },
        ],
      },
      riskCapPct: null,
      holding: { weekend: 'forbidden', overnight: 'allowed', appliesTo: 'funded', swingModelId: 'alpha-swing', note: 'Week-end autorisé pendant les phases d\'évaluation mais INTERDIT sur le compte qualifié (règle officielle Alpha Pro) : le programme Alpha Swing le permet à tous les stades.' },
      fee: { pct: 0.58, verified: false, refund: null, note: 'Prix du Pro 100 000 non lu (prix du Swing 100 000 pris comme repère) — frais jamais remboursés (« All sales are final »)' },
      prices: { currency: 'USD', asOf: '2026-09-20', source: 'https://alphacapitalgroup.uk/resources/alpha-capital-review-2026-trader-verdict',
        sizes: [{ size: 25000, price: 197 }],
        notes: ['Seul le compte de 25 000 $ affiche un prix Pro sur les pages lues ; les autres tailles ne sont pas relevées (page de prix dynamique)', 'Frais jamais remboursés', 'Promotions fréquentes'] },
      newsFunded: 'Aucun nouveau trade ni clôture ±5 min autour d\'une annonce ciblée.',
      source: { url: 'https://help.alphacapitalgroup.uk/en/articles/8420429-alpha-pro-8-10', pageDate: null },
      facts: [
        'Objectifs 8 % puis 5 % · perte du jour 4 % (sur solde) · perte max 8 % FIXE · 3 jours de trading minimum par phase',
        'Partage jusqu\'à 80 % (90 % avec l\'option) · retraits bimensuels ou sur demande',
        'Levier 1:100 forex, 1:30 métaux, 1:20 indices',
      ],
      unverified: ['Frais estimés', 'Délai entre deux retraits « sur demande » non précisé (1 jour supposé)', '5 jours de trading avant le premier retrait bimensuel appliqué à chaque cycle'],
    },
    {
      id: 'alpha-swing', firm: 'Alpha Capital', label: 'Swing · 2 étapes',
      consistencyNote: 'Retraits sur demande uniquement : meilleur jour ≤ 40 % du profit net total et 2 % de profit minimum (aide officielle Alpha).',
      phases: [10, 5], dailyLossPct: 5, maxLossPct: 10, maxLossType: 'static',
      minDays: { count: 3, kind: 'trading' }, bestDay: null,
      funded: {
        dailyLossPct: 5, maxLossPct: 10, maxLossType: 'static', consistency: null,
        minPayoutPct: 0.1,
        payoutOptions: [
          { id: 'demand', label: 'Sur demande · 80 %', splitPct: 80, firstAfterDays: 0, cycleDays: 1, minProfitableDays: null, minGrowthPct: 2, consistency: { maxPct: 40, basis: 'total_profit' } },
        ],
      },
      riskCapPct: null,
      holding: { weekend: 'allowed', overnight: 'allowed', appliesTo: 'all', swingModelId: null, note: 'Week-end et nuit autorisés à tous les stades, annonces comprises (règle officielle du programme Swing) ; levier réduit à 1:30 sur le forex.' },
      fee: { pct: 0.58, verified: true, refund: null, note: '577 $ pour un compte de 100 000 (page Alpha) — frais jamais remboursés' },
      prices: { currency: 'USD', asOf: '2026-09-20', source: 'https://alphacapitalgroup.uk/resources/alpha-capital-review-2026-trader-verdict',
        sizes: [{ size: 100000, price: 577 }],
        notes: ['Seul le compte de 100 000 $ affiche un prix Swing sur les pages lues ; les autres tailles ne sont pas relevées', 'Frais jamais remboursés', 'Retraits sur demande uniquement (pas de cycle bimensuel)'] },
      newsFunded: 'Annonces autorisées ; un trade ouvert ±2 min autour d\'une annonce doit durer plus de 2 min pour être valable.',
      source: { url: 'https://help.alphacapitalgroup.uk/en/articles/9789907-alpha-swing', pageDate: null },
      facts: [
        'Objectifs 10 % puis 5 % · perte du jour 5 % (sur solde) · perte max 10 % FIXE · 3 jours de trading minimum par phase',
        'Levier 1:30 forex, 1:9 métaux, 1:10 indices',
        'Retraits sur demande uniquement : 2 % de profit brut minimum et meilleur jour ≤ 40 %',
      ],
      unverified: ['Délai entre deux retraits non précisé (1 jour supposé)', 'Partage « jusqu\'à 80 % » retenu à 80 %'],
    },
  ];

  // Firmes examinées mais volontairement non simulées.
  const EXCLUDED = [
    { firm: 'Smart Prop Trader', reason: 'Signalée comme fermée depuis le 29 décembre 2024 par plusieurs sites d\'avis tiers (information non confirmée par la firme) ; son site officiel redirige vers fxnity.com sans aucune règle lisible : à éviter et impossible à vérifier au 20 septembre 2026. Le moteur gère déjà une cohérence à 45 % dès qu\'une source officielle existe.' },
    { firm: 'MyFundedFX', reason: 'Signalée comme fermée en février 2026 par des sites d\'avis tiers (non vérifié auprès de la firme) : non simulée.' },
  ];

  window.CHESTPropRules = { verifiedOn: VERIFIED_ON, refAccount: REF_ACCOUNT, models: MODELS, excluded: EXCLUDED };
})();
