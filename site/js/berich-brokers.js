// CHEST · BERICH — liste indicative des brokers/propfirms les plus connus
// (priorité aux européens/régulés) et leurs serveurs MT5 courants, pour
// guider l'inscription (étape 1 et 2 de l'assistant). PAS une donnée
// vérifiée en direct (contrairement au reste de CHEST) — les noms de
// serveurs exacts changent selon le broker/le pays/le type de compte.
// "Autre" reste toujours disponible pour taper le nom exact affiché dans
// MT5 si l'entrée attendue n'est pas dans la liste.
window.CHEST_BROKERS = [
  // Brokers — européens/régulés en priorité
  { id: 'ig', name: 'IG', domain: 'ig.com', servers: ['IG-Live', 'IG-Demo'] },
  { id: 'icmarkets', name: 'IC Markets', domain: 'icmarkets.com', servers: ['ICMarketsSC-Live01', 'ICMarketsSC-Live02', 'ICMarketsSC-Demo'] },
  { id: 'pepperstone', name: 'Pepperstone', domain: 'pepperstone.com', servers: ['Pepperstone-Live01', 'Pepperstone-Live02', 'Pepperstone-Demo'] },
  { id: 'admirals', name: 'Admirals', domain: 'admirals.com', servers: ['Admirals-Live', 'Admirals-Demo'] },
  { id: 'fxpro', name: 'FxPro', domain: 'fxpro.com', servers: ['FxPro-MT5', 'FxPro-MT5.Demo'] },
  { id: 'avatrade', name: 'AvaTrade', domain: 'avatrade.com', servers: ['AvaTrade-Real', 'AvaTrade-Demo'] },
  { id: 'tickmill', name: 'Tickmill', domain: 'tickmill.com', servers: ['Tickmill-Live', 'Tickmill-Demo'] },
  { id: 'xm', name: 'XM', domain: 'xm.com', servers: ['XMGlobal-Real 1', 'XMGlobal-Real 2', 'XMGlobal-Demo'] },
  { id: 'vantage', name: 'Vantage', domain: 'vantagemarkets.com', servers: ['VantageInternational-Live 1', 'VantageInternational-Live 2', 'VantageInternational-Demo'] },
  { id: 'blueberry', name: 'Blueberry', domain: 'blueberrymarkets.com', servers: ['BlueberryMarkets-Live', 'BlueberryMarkets-Demo'] },
  { id: 'oanda', name: 'OANDA', domain: 'oanda.com', servers: ['OANDA-Live', 'OANDA-Demo'] },

  // Propfirms
  { id: 'ftmo', name: 'FTMO', domain: 'ftmo.com', servers: ['FTMO-Server', 'FTMO-Server2', 'FTMO-Server3', 'FTMO-Demo'] },
  { id: 'alphacapital', name: 'Alpha Capital Group', domain: 'alphacapitalgroup.uk', servers: ['AlphaCapitalGroup-Live', 'AlphaCapitalGroup-Demo'] },
  { id: 'smartfundtrader', name: 'Smart Fund Trader', domain: 'smartraderfunds.com', servers: ['SmartFundTrader-Live', 'SmartFundTrader-Demo'] },
  { id: 'topstep', name: 'TopStep', domain: 'topstep.com', servers: ['TopStep-Live', 'TopStep-Demo'] },
];

function chestBrokerLogo(domain) {
  return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}`;
}
