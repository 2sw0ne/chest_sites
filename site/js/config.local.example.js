// Copie ce fichier en "config.local.js" à côté (déjà exclu du dépôt par
// .gitignore, jamais poussé sur le repo) et colle ta vraie clé dedans.
// Ne jamais mettre une vraie clé API dans config.js directement.
window.CHEST_CONFIG = window.CHEST_CONFIG || {};

// Clé gratuite sur https://twelvedata.com/pricing (plan Basic, 0€) — sert au
// calendrier et au calculateur de lot.
window.CHEST_CONFIG.twelveDataApiKey = 'COLLE_TA_CLE_ICI';

// Token OANDA (compte démo pratique gratuit) — sert aux graphiques
// Stratégies et BERICH. Pour l'obtenir : créer un compte démo sur
// https://www.oanda.com/demo-account/tpa/personal_details, puis dans le
// portail démo -> "Manage API Access" -> générer un "Personal Access Token".
window.CHEST_CONFIG.oandaApiToken = 'COLLE_TON_TOKEN_ICI';
