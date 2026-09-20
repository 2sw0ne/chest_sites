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
// Frais : fee.pct = frais du challenge en % du compte de 100 000. `verified`
// dit si le prix vient de la page officielle. Un compte perdu se rachète : sans
// frais, prendre un risque énorme paraîtrait toujours rentable.
(() => {
  'use strict';

  const VERIFIED_ON = '2026-09-20';
  const REF_ACCOUNT = 100000;

  const MODELS = [
    {
      id: 'ftmo-1step', firm: 'FTMO', label: '1 étape',
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
      fee: { pct: 0.55, verified: false, refund: null, note: 'Prix du 1 étape non lu sur la page (estimation)' },
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
      phases: [10, 5], dailyLossPct: 5, maxLossPct: 10, maxLossType: 'static',
      minDays: { count: 4, kind: 'trading' }, bestDay: null,
      funded: {
        dailyLossPct: 5, maxLossPct: 10, maxLossType: 'static', consistency: null,
        payoutOptions: [
          { id: 'std', label: 'Retrait dès le 14e jour', splitPct: 80, firstAfterDays: 14, cycleDays: 14, minProfitableDays: null, minGrowthPct: null, consistency: null },
        ],
      },
      riskCapPct: null,
      fee: { pct: 0.54, verified: true, refund: 'first', note: '540 € pour un compte de 100 000 (page FTMO) — remboursé avec le 1er retrait' },
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
      id: 'fundednext-stellar-1', firm: 'FundedNext', label: 'Stellar 1 étape',
      phases: [10], dailyLossPct: 3, maxLossPct: 6, maxLossType: 'static',
      minDays: { count: 2, kind: 'trading' }, bestDay: null,
      funded: {
        dailyLossPct: 3, maxLossPct: 6, maxLossType: 'static', consistency: null,
        payoutOptions: [
          { id: 'std', label: 'Cycle de 5 jours ouvrés', splitPct: 80, firstAfterDays: 0, cycleDays: 7, minProfitableDays: null, minGrowthPct: null, consistency: null },
        ],
      },
      riskCapPct: 3,
      fee: { pct: 0.57, verified: true, refund: 'third', note: '569,99 $ pour 100 000 (prix affiché, remises possibles) — remboursé avec le 3e retrait' },
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
      fee: { pct: 0.55, verified: true, refund: 'first', note: '549,99 $ pour 100 000 (prix affiché) — remboursé avec le 1er retrait' },
      newsFunded: 'Trades ±5 min autour d\'une annonce : seulement 40 % de leur profit compte (comptes financés Stellar).',
      source: { url: 'https://help.fundednext.com/en/articles/10701585-how-often-will-i-receive-my-performance-reward', pageDate: null },
      facts: [
        'Trois options de retrait : Standard (80 %, 1er retrait à 21 jours, puis tous les 14 jours), 3 jours (60 %, 3 jours profitables ≥ 1 % par cycle), À la demande (90 %, +2 % de croissance et 40 % de consistance)',
        'Limite de risque : 3 % maximum à tout moment',
        'Frais remboursés avec le 1er retrait',
      ],
      unverified: ['Perte max : fixe ou suiveuse non précisé (traité comme fixe)', 'Consistance « 40 % » de l\'option À la demande interprétée comme meilleur jour ≤ 40 % du profit du cycle', 'Rythme de l\'option 3 jours supposé identique au Standard'],
    },
    {
      id: 'fundednext-stellar-lite', firm: 'FundedNext', label: 'Stellar Lite',
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
      fee: { pct: 0.5, verified: false, refund: null, note: 'Prix du modèle Lite non lu (estimation)' },
      newsFunded: 'Trades ±5 min autour d\'une annonce : seulement 40 % de leur profit compte (comptes financés Stellar).',
      source: { url: 'https://fundednext.com/cfd-challenge-terms', pageDate: '2026-05-05' },
      facts: [
        'Mêmes trois options de retrait que le Stellar 2 étapes',
        'Limite de risque : 3 % maximum à tout moment',
      ],
      unverified: ['Perte max : fixe ou suiveuse non précisé (traité comme fixe)', 'Remboursement des frais non trouvé pour ce modèle', 'Consistance « 40 % » de l\'option À la demande interprétée comme meilleur jour ≤ 40 % du profit du cycle'],
    },
    {
      id: 'the5ers-hypergrowth', firm: 'The5ers', label: 'Hyper Growth · 1 étape',
      phases: [10], dailyLossPct: 3, maxLossPct: 6, maxLossType: 'static',
      minDays: { count: 3, kind: 'profitable', minPct: 0.5 }, bestDay: null,
      funded: {
        dailyLossPct: 3, maxLossPct: 6, maxLossType: 'static', consistency: null,
        payoutOptions: [
          { id: 'std', label: 'Retrait dès le 14e jour', splitPct: 75, firstAfterDays: 14, cycleDays: 14, minProfitableDays: null, minGrowthPct: null, consistency: null },
        ],
      },
      riskCapPct: null,
      fee: { pct: 0.55, verified: false, refund: null, note: 'Pas de compte de 100 000 : estimation' },
      newsFunded: 'Annonces permises (sauf stratégies « bracket » autour des annonces).',
      source: { url: 'https://the5ers.com/hyper-growth/', pageDate: null },
      facts: [
        'Perte max fixe : « stop out » à 6 % sous le capital initial · perte du jour 3 %',
        'Premier retrait 14 jours après l\'activation du compte financé, puis toutes les 2 semaines (profit minimum 150 $)',
        'Le compte double à chaque objectif de 10 % atteint (plan de croissance)',
        'Durée illimitée · week-end permis',
      ],
      unverified: ['Partage de 75 % lu dans le tableau du plan de croissance (à confirmer pour le départ)', 'Jours profitables exigés seulement au challenge dans cette simulation', 'Frais estimés'],
    },
    {
      id: 'the5ers-highstakes', firm: 'The5ers', label: 'High Stakes · 2 étapes',
      phases: [10, 5], dailyLossPct: 5, maxLossPct: 10, maxLossType: 'static',
      minDays: { count: 3, kind: 'profitable', minPct: 0.5 }, bestDay: null,
      funded: {
        dailyLossPct: 5, maxLossPct: 10, maxLossType: 'static', consistency: null,
        payoutOptions: [
          { id: 'std', label: 'Retrait dès le 14e jour', splitPct: 80, firstAfterDays: 14, cycleDays: 14, minProfitableDays: null, minGrowthPct: null, consistency: null },
        ],
      },
      riskCapPct: null,
      fee: { pct: 0.55, verified: false, refund: null, note: 'Prix du compte de 100 000 non lu (estimation)' },
      newsFunded: 'Aucun ordre exécuté 2 min avant / après une annonce majeure (garder une position ouverte est permis).',
      source: { url: 'https://the5ers.com/high-stakes/', pageDate: null },
      facts: [
        'Jour profitable = clôtures positives d\'au moins 0,5 % du capital initial',
        'Premier retrait 14 jours après l\'activation, puis toutes les 2 semaines (profit minimum 150 $)',
        'Partage 80 % (jusqu\'à 100 % avec la croissance) · week-end permis',
      ],
      unverified: ['Plafond de retrait éventuel non trouvé', 'Frais estimés'],
    },
    {
      id: 'fundingpips-2step-flex', firm: 'Funding Pips', label: '2 étapes Flex',
      phases: [10, 6], dailyLossPct: 4, maxLossPct: 12, maxLossType: 'static',
      minDays: { count: 1, kind: 'trading' }, bestDay: null,
      funded: {
        dailyLossPct: 4, maxLossPct: 12, maxLossType: 'static', consistency: null,
        payoutOptions: [
          { id: 'bw85', label: 'Toutes les 2 semaines · 85 %', splitPct: 85, firstAfterDays: 14, cycleDays: 14, minProfitableDays: null, minGrowthPct: null, consistency: null },
          { id: 'bw95', label: 'Toutes les 2 semaines · 95 %', splitPct: 95, firstAfterDays: 14, cycleDays: 14, minProfitableDays: { count: 3, minPct: 0.5 }, minGrowthPct: null, consistency: null },
          { id: 'm100', label: 'Mensuel · 100 %', splitPct: 100, firstAfterDays: 30, cycleDays: 30, minProfitableDays: { count: 7, minPct: 0.5 }, minGrowthPct: null, consistency: { maxPct: 35, basis: 'total_profit' } },
        ],
      },
      riskCapPct: 2,
      fee: { pct: 0.55, verified: false, refund: null, note: 'Prix du compte de 100 000 non lu (estimation)' },
      newsFunded: 'Compte Master : aucun ordre ouvert ou fermé 5 min avant / après une annonce majeure ; les profits d\'annonce sont déduits.',
      source: { url: 'https://fundingpips.com/trading-objectives', pageDate: null },
      facts: [
        'Risque maximum par idée de trade sur le compte Master : 2 % au-dessus de 25 000 $ (3 % à 25 000 $)',
        'Trois cycles de retrait : toutes les 2 semaines à 85 %, à 95 % (3 jours profitables), ou mensuel à 100 % (consistance 35 %, 7 jours profitables de 0,5 %)',
        'Inactivité : fermer au moins 1 trade tous les 30 jours · week-end permis',
      ],
      unverified: ['Définition du jour profitable des options 95 % et 100 % reprise à 0,5 %', 'Premier retrait supposé au bout d\'un cycle', 'Frais estimés', 'Système « strikes » à 1 % du cycle mensuel non simulé'],
    },
  ];

  // Firmes examinées mais volontairement non simulées.
  const EXCLUDED = [
    { firm: 'Smart Prop Trader', reason: 'Le site officiel (smartproptrader.com) redirige désormais vers fxnity.com, sans page de règles lisible : impossible à vérifier au 20 septembre 2026. Le moteur gère déjà une règle de cohérence (ex. 45 %) dès qu\'une source officielle existe.' },
  ];

  window.CHESTPropRules = { verifiedOn: VERIFIED_ON, refAccount: REF_ACCOUNT, models: MODELS, excluded: EXCLUDED };
})();
