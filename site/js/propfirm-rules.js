// CHEST · Règles des prop firms — base VÉRIFIÉE sur les pages officielles.
//
// Règle d'or : on n'écrit ici que ce qu'on a lu sur le site de la firme,
// avec la date de la page et le lien. Un champ non trouvé reste `null`
// (affiché « non vérifié »), jamais deviné. Ces conditions changent souvent :
// avant de payer, le site officiel fait foi.
//
// Modèle d'une entrée :
//   phases[]         objectifs de profit successifs, en % du capital initial
//   dailyLossPct     perte max du jour, en % du capital initial
//   maxLossPct       perte max globale, en % du capital initial
//   maxLossType      'static' (fixe) | 'trailing_eod' (suit le plus haut de fin de journée)
//   minDays          { count, kind:'trading' } ou { count, kind:'profitable', minPct }
//   bestDayMaxPct    règle du meilleur jour : part max d'un jour dans le profit des jours positifs
//   unverified[]     ce que la page ne dit pas clairement (traité par l'hypothèse la plus simple)
(() => {
  'use strict';

  const VERIFIED_ON = '2026-09-20';

  const MODELS = [
    {
      id: 'ftmo-1step', firm: 'FTMO', label: '1 étape',
      phases: [10], dailyLossPct: 3, maxLossPct: 10, maxLossType: 'trailing_eod',
      minDays: null, bestDayMaxPct: 50,
      news: null, weekend: null,
      source: { url: 'https://ftmo.com/en/trading-objectives/', pageDate: '2026-05-13' },
      facts: ['Perte max suiveuse (recalculée chaque jour)', 'Règle du meilleur jour : 50 % du profit des jours positifs'],
      unverified: ['Jours de trading minimum, annonces et week-end non précisés sur la page'],
    },
    {
      id: 'ftmo-2step', firm: 'FTMO', label: '2 étapes',
      phases: [10, 5], dailyLossPct: 5, maxLossPct: 10, maxLossType: 'static',
      minDays: { count: 4, kind: 'trading' }, bestDayMaxPct: null,
      news: null, weekend: null,
      source: { url: 'https://ftmo.com/en/trading-objectives/', pageDate: '2026-05-13' },
      facts: ['Perte max fixe', '4 jours de trading minimum par phase'],
      unverified: ['Annonces et week-end non précisés sur la page'],
    },
    {
      id: 'fundednext-stellar-1', firm: 'FundedNext', label: 'Stellar 1 étape',
      phases: [10], dailyLossPct: 3, maxLossPct: 6, maxLossType: 'static',
      minDays: { count: 2, kind: 'trading' }, bestDayMaxPct: null,
      news: null, weekend: null,
      source: { url: 'https://fundednext.com/cfd-challenge-terms', pageDate: '2026-05-05' },
      facts: ['Perte du jour et perte max calculées sur le capital initial, frais inclus'],
      unverified: ['Perte max : fixe ou suiveuse non précisé (traité comme fixe)', 'Annonces et week-end : voir les règles du programme'],
    },
    {
      id: 'fundednext-stellar-2', firm: 'FundedNext', label: 'Stellar 2 étapes',
      phases: [8, 5], dailyLossPct: 5, maxLossPct: 10, maxLossType: 'static',
      minDays: { count: 5, kind: 'trading' }, bestDayMaxPct: null,
      news: null, weekend: null,
      source: { url: 'https://fundednext.com/cfd-challenge-terms', pageDate: '2026-05-05' },
      facts: ['Perte du jour et perte max calculées sur le capital initial, frais inclus'],
      unverified: ['Perte max : fixe ou suiveuse non précisé (traité comme fixe)', 'Annonces et week-end : voir les règles du programme'],
    },
    {
      id: 'fundednext-stellar-lite', firm: 'FundedNext', label: 'Stellar Lite',
      phases: [8, 4], dailyLossPct: 4, maxLossPct: 8, maxLossType: 'static',
      minDays: { count: 5, kind: 'trading' }, bestDayMaxPct: null,
      news: null, weekend: null,
      source: { url: 'https://fundednext.com/cfd-challenge-terms', pageDate: '2026-05-05' },
      facts: ['Perte du jour et perte max calculées sur le capital initial, frais inclus'],
      unverified: ['Perte max : fixe ou suiveuse non précisé (traité comme fixe)', 'Annonces et week-end : voir les règles du programme'],
    },
    {
      id: 'the5ers-hypergrowth', firm: 'The5ers', label: 'Hyper Growth · 1 étape',
      phases: [10], dailyLossPct: 3, maxLossPct: 6, maxLossType: 'static',
      minDays: { count: 3, kind: 'profitable', minPct: 0.5 }, bestDayMaxPct: null,
      news: 'allowed', weekend: 'allowed',
      source: { url: 'https://the5ers.com/hyper-growth/', pageDate: null },
      facts: ['Durée illimitée', 'Annonces permises (sauf stratégies « bracket »)', 'Week-end permis', 'Levier 1:30'],
      unverified: ['Perte max : fixe ou suiveuse non précisé (traité comme fixe)', 'Définition du jour profitable reprise de High Stakes (≥ 0,5 %)'],
    },
    {
      id: 'the5ers-highstakes', firm: 'The5ers', label: 'High Stakes · 2 étapes',
      phases: [10, 5], dailyLossPct: 5, maxLossPct: 10, maxLossType: 'static',
      minDays: { count: 3, kind: 'profitable', minPct: 0.5 }, bestDayMaxPct: null,
      news: 'restricted', weekend: 'allowed',
      source: { url: 'https://the5ers.com/high-stakes/', pageDate: null },
      facts: ['Durée illimitée', 'Jour profitable = au moins 0,5 % du capital initial', 'Pas d\'ordre exécuté 2 min avant / après une annonce majeure', 'Week-end permis'],
      unverified: [],
    },
    {
      id: 'fundingpips-2step-flex', firm: 'Funding Pips', label: '2 étapes Flex',
      phases: [10, 6], dailyLossPct: 4, maxLossPct: 12, maxLossType: 'static',
      minDays: { count: 1, kind: 'trading' }, bestDayMaxPct: null,
      news: 'allowed', weekend: 'allowed',
      source: { url: 'https://fundingpips.com/trading-objectives', pageDate: null },
      facts: ['Durée illimitée', 'Annonces permises en évaluation, restreintes (±5 min) sur le compte Master', 'Week-end permis'],
      unverified: ['Consistance de 35 % sur le cycle de retrait mensuel à 100 % — non simulée ici'],
    },
  ];

  window.CHESTPropRules = { verifiedOn: VERIFIED_ON, models: MODELS };
})();
