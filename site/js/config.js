// Configuration locale de STASH. Rien de secret ici (l'URL Railway sert du
// calendrier public en lecture seule) — si une vraie clé API est ajoutée un
// jour dans ce fichier, l'exclure du dépôt (voir .gitignore) avant de pousser.
window.STASH_CONFIG = {
  // URL du service Railway qui sert calendar.json (calendar-bridge/server.py).
  // Laisser vide '' pour utiliser le fichier local data/calendar.json à la place.
  calendarApiUrl: 'https://calendrier-eco-production.up.railway.app/calendar.json',

  // URL du webhook-bridge BERICH (berich-bridge/server.py) qui sert signal.json.
  // Laisser vide '' pour utiliser le fichier local data/berich-signal.json à la place
  // (pas encore déployé — tourne uniquement en local pour l'instant).
  berichApiUrl: '',

  // Clé API Twelve Data pour le graphique BERICH (chandelles XAU/USD en direct).
  // Ne JAMAIS mettre une vraie clé ici — voir js/config.local.example.js.
  twelveDataApiKey: ''
};
