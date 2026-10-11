// CHEST · Worker pour le calcul "vie du compte" (js/propfirm-fit.js, lui-même basé sur
// optimizeProfiles de js/backtest-engine.js). Ce calcul est un vrai optimiseur (grille de risques
// × paliers × règles "Si", affiné par montée de coordonnées, vérifié par 300 tirages Monte-Carlo,
// répété pour plusieurs profils) : sur un backtest de plusieurs milliers de positions il peut
// prendre plusieurs secondes, et le faire sur le fil principal gelait la page entière - signalé
// par l'utilisateur (2026-10-11) sur les gros fichiers, un changement d'année, ou le premier
// chargement du rapport. Ici il tourne sur un fil séparé : le reste de la page (stats rapides,
// cartes, courbe) reste réactif pendant qu'il travaille.
//
// `backtest-engine.js` et `propfirm-fit.js` sont écrits pour le navigateur (ils exportent via
// `window.X = ...`) - aucune réécriture n'était nécessaire, `self.window = self` suffit à les
// charger tels quels ici (aucun des deux ne touche au DOM, à localStorage ou au réseau).
self.window = self;
importScripts('backtest-engine.js', 'propfirm-rules.js', 'propfirm-fit.js');

// backtest-view.html (vie complète du compte) envoie { kind:'fit', trades, capital, opts } ;
// backtest-add.html (réglage premium à l'import/réglage) envoie { kind:'optimize', trades, capital, account, opts }.
self.onmessage = (e) => {
  const { id, kind, trades, capital, account, opts } = e.data;
  try {
    const result = kind === 'optimize'
      ? self.CHESTBacktestEngine.optimizeProfiles(trades, capital, account, opts)
      : self.CHESTPropFit.fit(trades, capital, opts);
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: (err && err.message) || String(err) });
  }
};
