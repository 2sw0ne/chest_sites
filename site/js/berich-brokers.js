// CHEST · BERICH — liste indicative des brokers/propfirms les plus connus
// (priorité aux européens/régulés) et leurs serveurs MT5 courants, pour
// guider l'inscription (étape 1 et 2 de l'assistant). PAS une donnée
// vérifiée en direct (contrairement au reste de CHEST) — les noms de
// serveurs exacts changent selon le broker/le pays/le type de compte.
// "Autre" reste toujours disponible pour taper le nom exact affiché dans
// MT5 si l'entrée attendue n'est pas dans la liste.
//
// `kind` ('broker'|'propfirm') pilote l'étape "Objectifs du challenge" du
// Dashboard (js/dashboard.js) : un broker classique ne montre jamais ce
// bloc, un propfirm connu le montre avec des boutons de phase préremplis.
// `rules` (quand connu) vient de recherches publiques sur chaque programme
// "standard" au 2026-09-16 (voir sources dans le message correspondant) —
// les propfirms proposent souvent PLUSIEURS programmes (agressif, swing,
// 1-step...) avec des chiffres différents : ces valeurs ne sont qu'un point
// de départ, toujours éditable, jamais présenté comme garanti (honnêteté
// radicale, comme le reste de CHEST) - voir `rulesNote`. `null` sur un champ
// precis = valeur non confirmee publiquement, laissee vide plutot
// qu'inventee.
window.CHEST_BROKERS = [
  // Brokers — européens/régulés en priorité
  { id: 'ig', name: 'IG', domain: 'ig.com', kind: 'broker', servers: ['IG-Live', 'IG-Demo'] },
  { id: 'icmarkets', name: 'IC Markets', domain: 'icmarkets.com', kind: 'broker', servers: ['ICMarketsSC-Live01', 'ICMarketsSC-Live02', 'ICMarketsSC-Demo'] },
  { id: 'pepperstone', name: 'Pepperstone', domain: 'pepperstone.com', kind: 'broker', servers: ['Pepperstone-Live01', 'Pepperstone-Live02', 'Pepperstone-Demo'] },
  { id: 'admirals', name: 'Admirals', domain: 'admirals.com', kind: 'broker', servers: ['Admirals-Live', 'Admirals-Demo'] },
  { id: 'fxpro', name: 'FxPro', domain: 'fxpro.com', kind: 'broker', servers: ['FxPro-MT5', 'FxPro-MT5.Demo'] },
  { id: 'avatrade', name: 'AvaTrade', domain: 'avatrade.com', kind: 'broker', servers: ['AvaTrade-Real', 'AvaTrade-Demo'] },
  { id: 'tickmill', name: 'Tickmill', domain: 'tickmill.com', kind: 'broker', servers: ['Tickmill-Live', 'Tickmill-Demo'] },
  { id: 'xm', name: 'XM', domain: 'xm.com', kind: 'broker', servers: ['XMGlobal-Real 1', 'XMGlobal-Real 2', 'XMGlobal-Demo'] },
  { id: 'vantage', name: 'Vantage', domain: 'vantagemarkets.com', kind: 'broker', servers: ['VantageInternational-Live 1', 'VantageInternational-Live 2', 'VantageInternational-Demo'] },
  { id: 'blueberry', name: 'Blueberry', domain: 'blueberrymarkets.com', kind: 'broker', servers: ['BlueberryMarkets-Live', 'BlueberryMarkets-Demo'] },
  { id: 'oanda', name: 'OANDA', domain: 'oanda.com', kind: 'broker', servers: ['OANDA-Live', 'OANDA-Demo'] },

  // Propfirms
  {
    id: 'ftmo', name: 'FTMO', domain: 'ftmo.com', kind: 'propfirm', servers: ['FTMO-Server', 'FTMO-Server2', 'FTMO-Server3', 'FTMO-Demo'],
    rules: {
      phase1: { minTradingDays: 10, profitTargetPct: 10, maxDailyLossPct: 5, maxLossPct: 10 },
      phase2: { minTradingDays: 10, profitTargetPct: 5, maxDailyLossPct: 5, maxLossPct: 10 },
      funded: { minTradingDays: 0, profitTargetPct: 0, maxDailyLossPct: 5, maxLossPct: 10 },
    },
    rulesNote: 'Programme FTMO Challenge standard (2 étapes, sans limite de temps) — si tu as pris un autre programme, vérifie et ajuste sur ftmo.com.',
  },
  {
    id: 'alphacapital', name: 'Alpha Capital Group', domain: 'alphacapitalgroup.uk', kind: 'propfirm', servers: ['AlphaCapitalGroup-Live', 'AlphaCapitalGroup-Demo'],
    rules: {
      phase1: { minTradingDays: 3, profitTargetPct: 8, maxDailyLossPct: 4, maxLossPct: 6 },
      phase2: { minTradingDays: 3, profitTargetPct: 4, maxDailyLossPct: 4, maxLossPct: 6 },
      funded: { minTradingDays: 0, profitTargetPct: 0, maxDailyLossPct: 4, maxLossPct: 6 },
    },
    rulesNote: 'Programme "Alpha One" standard — Alpha Pro/Swing/Three ont des règles différentes, vérifie le tien sur alphacapitalgroup.uk.',
  },
  {
    id: 'smartfundtrader', name: 'Smart Fund Trader', domain: 'smartraderfunds.com', kind: 'propfirm', servers: ['SmartFundTrader-Live', 'SmartFundTrader-Demo'],
    rules: {
      phase1: { minTradingDays: null, profitTargetPct: 9, maxDailyLossPct: null, maxLossPct: null },
      phase2: { minTradingDays: null, profitTargetPct: 4, maxDailyLossPct: null, maxLossPct: null },
      funded: { minTradingDays: null, profitTargetPct: 0, maxDailyLossPct: null, maxLossPct: null },
    },
    rulesNote: 'Seuls les objectifs de profit (9% / 4%) du programme "Regular" sont confirmés publiquement — complète les pertes max toi-même depuis smartraderfunds.com.',
  },
  {
    id: 'topstep', name: 'TopStep', domain: 'topstep.com', kind: 'propfirm', servers: ['TopStep-Live', 'TopStep-Demo'],
    rules: null,
    rulesNote: 'TopStep fonctionne en limites $ fixes selon la taille du compte (ex. 50k$ : perte quotidienne 1 000$, perte max ≈2 000$ en trailing fin de journée, objectif 3 000$), pas en % — convertis toi-même si besoin, ou laisse les champs vides.',
  },
];

function chestBrokerLogo(domain) {
  return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}`;
}
