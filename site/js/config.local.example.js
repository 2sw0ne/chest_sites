// Copie ce fichier en "config.local.js" à côté (déjà exclu du dépôt par
// .gitignore, jamais poussé sur le repo) et colle ta vraie clé dedans.
// Ne jamais mettre une vraie clé API dans config.js directement.
window.CHEST_CONFIG = window.CHEST_CONFIG || {};

// La clé Twelve Data (gratuite sur https://twelvedata.com/pricing, plan Basic, 0€) n'est plus un
// réglage de ce fichier : elle vit côté serveur, en variable d'environnement TWELVE_DATA_API_KEY sur
// accounts-bridge (voir son server.py, /twelvedata/<endpoint>). Pour tester en local, définir cette
// variable avant de lancer `python server.py` dans accounts-bridge/, pas ici.

// Token OANDA (compte démo pratique gratuit) — sert aux graphiques
// Stratégies et BERICH. Pour l'obtenir : créer un compte démo sur
// https://www.oanda.com/demo-account/tpa/personal_details, puis dans le
// portail démo -> "Manage API Access" -> générer un "Personal Access Token".
window.CHEST_CONFIG.oandaApiToken = 'COLLE_TON_TOKEN_ICI';
