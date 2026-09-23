// CHEST · Stratégies — registre FIXE des scanners réels de l'utilisateur.
// Volontairement en lecture seule (pas d'add/update/remove, pas de formulaire
// dans strategies.html) : ce ne sont pas des scanners "ajoutés en libre service"
// comme avant, ce sont SES vrais scripts Pine, enregistrés une fois pour toutes
// depuis C:\\Users\\swann\\Desktop\\Trading\\Stratégies-Auto\\ — rien n'est modifiable
// depuis la page. `candles` (optionnel) surcharge la couleur des bougies du
// graphique pour CE scanner precis (ex. bougies invisibles pour ne garder que
// les plots du scanner) - voir scanner-chart.js. Sans `candles`, la palette
// par defaut du site (vert/rouge) s'applique.
(() => {
  'use strict';

  const SCANNERS = [
    {
      id: "wolfx",
      name: "Wolfx",
      description: "Scanner de structure de marché (BOS/CHoCH) avec zones d'entrée automatiques.",
      tags: ["L'ami de la tendance"],
      market: "commodities",
      defaultSymbol: "XAUUSD",
      defaultTimeframe: "5",
      candles: {"upColor": "rgba(0,0,0,0)", "downColor": "rgba(0,0,0,0)", "wickUpColor": "rgba(0,0,0,0)", "wickDownColor": "rgba(0,0,0,0)"},
      logoInitials: "WX",
      logoColor: "#5470c2",
      logo: "assets/logo-wolfx.png",
      pineSource: null,
      secondaryPineSource: null,
    },
    {
      id: "algomni",
      name: "Algomni",
      description: "Scanner multi-signaux (boîtes, lignes, labels dynamiques) sur la structure du marché.",
      tags: ["Structure de retournement"],
      market: "commodities",
      defaultSymbol: "XAUUSD",
      defaultTimeframe: "5",
      candles: {"upColor": "rgba(0,0,0,0)", "downColor": "rgba(0,0,0,0)", "wickUpColor": "rgba(0,0,0,0)", "wickDownColor": "rgba(0,0,0,0)"},
      logoInitials: "AO",
      logoColor: "#f9a45e",
      logo: "assets/logo-algomni.png",
      pineSource: null,
    },
    {
      id: "swyper-v6",
      name: "Swyper",
      description: "V6 de l'algorithme SWYPER — TP/SL dynamiques établis à partir de la structure du marché au moment de l'entrée.",
      tags: ["Prix d'entrée sniper"],
      market: "commodities",
      defaultSymbol: "XAUUSD",
      defaultTimeframe: "5",
      candles: {"upColor": "#ffffff", "downColor": "#ffa500", "wickUpColor": "#ffffff", "wickDownColor": "#ffa500"},
      logoInitials: "SW",
      logoColor: "#e35728",
      logo: "assets/logo-swyper.png",
      pineSource: null,
    },
    {
      id: "pivot",
      name: "Pivot",
      description: "Repère automatiquement les niveaux de pivots (support/résistance) et leurs extensions.",
      tags: ["Support & Résistance"],
      market: "commodities",
      defaultSymbol: "XAUUSD",
      defaultTimeframe: "5",
      candles: null,
      logoInitials: "PV",
      logoColor: "#33e6a6",
      logo: "assets/logo-pivot.png",
      pineSource: null,
      secondaryPineSource: null,
    },
  ];

  function list() { return SCANNERS.slice(); }
  function get(id) { return SCANNERS.find((s) => s.id === id) || null; }

  // Le vrai code Pine (pineSource/secondaryPineSource, ci-dessus a `null`) n'est plus dans ce
  // fichier livre au navigateur (repo public, voir accounts-bridge/server.py et le commentaire
  // en tete de fichier) : strategies.html le recupere via GET /scanners (authentifie) puis
  // l'injecte ici, une seule fois au demarrage de la page.
  function applyPineSource(byId) {
    if (!byId) return;
    SCANNERS.forEach((s) => {
      const e = byId[s.id];
      if (!e) return;
      if ('pineSource' in e) s.pineSource = e.pineSource;
      if ('secondaryPineSource' in e) s.secondaryPineSource = e.secondaryPineSource;
    });
  }

  window.CHESTScanners = { list, get, applyPineSource };
})();
