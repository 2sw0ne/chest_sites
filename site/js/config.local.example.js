// Copie ce fichier en "config.local.js" à côté (déjà exclu du dépôt par
// .gitignore, jamais poussé sur le repo) et colle ta vraie clé dedans.
// Ne jamais mettre une vraie clé API dans config.js directement.
window.STASH_CONFIG = window.STASH_CONFIG || {};

// Clé gratuite sur https://twelvedata.com/pricing (plan Basic, 0€) — sert au
// graphique BERICH pour récupérer les chandelles XAU/USD en direct.
window.STASH_CONFIG.twelveDataApiKey = 'COLLE_TA_CLE_ICI';
