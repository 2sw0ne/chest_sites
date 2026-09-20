// Configuration locale de CHEST. Rien de secret ici (l'URL Railway sert du
// calendrier public en lecture seule) — si une vraie clé API est ajoutée un
// jour dans ce fichier, l'exclure du dépôt (voir .gitignore) avant de pousser.
window.CHEST_CONFIG = {
  // URL du service Railway qui sert calendar.json (calendar-bridge/server.py).
  // Laisser vide '' pour utiliser le fichier local data/calendar.json à la place.
  calendarApiUrl: 'https://calendrier-eco-production.up.railway.app/calendar.json',

  // URL COMPLÈTE de l'endpoint /signals du bot BE FR€E (github.com/2sw0ne/
  // BEFREE, déployé sur Railway) — le MÊME service qui envoie déjà les
  // notifs Telegram, pas un service séparé (décision du 2026-09-15 : un
  // seul webhook TradingView pour les deux usages plutôt que d'en dupliquer
  // un deuxième). Il expose aussi /signal/current, un format plat lu par
  // l'EA MT5 BERICH_Receiver.mq5 (voir github.com/2sw0ne/BERICH) — son URL
  // se configure séparément, dans les réglages de l'EA lui-même, pas ici.
  // Laisser vide '' pour utiliser le fichier local data/berich-signal.json
  // à la place.
  berichApiUrl: 'https://web-production-a3415.up.railway.app/signals',

  // URL du webhook-bridge Stratégies (scanner-bridge/server.py) qui sert
  // scanner-signals.json (opportunités détectées par les 4 scanners). Le
  // panneau de notification qui l'affichait a été retiré de strategies.html
  // (2026-09-14, sur demande explicite — plus de temps à y consacrer pour
  // l'instant) ; cette clé et le pipeline scanner-bridge/ restent en place
  // pour une reprise future. Laisser vide '' pour utiliser le fichier local
  // data/scanner-signals.json à la place (pas encore déployé non plus).
  scannerSignalsApiUrl: '',

  // Clé API Twelve Data — utilisée par le calendrier (js/calendar.js) et le
  // calculateur de lot (js/lot-calculator.js). Ne JAMAIS mettre une vraie clé
  // ici — voir js/config.local.example.js.
  twelveDataApiKey: '',

  // Token d'accès personnel OANDA (compte démo pratique, gratuit) — utilisé
  // par les graphiques Stratégies (js/scanner-chart.js) et BERICH
  // (js/berich-chart.js) pour récupérer les chandelles en direct : jusqu'à
  // 5000 bougies par requête (contre 1000 chez Twelve Data), un vrai broker
  // forex/CFD plutôt qu'un agrégateur. Pour l'obtenir : créer un compte démo
  // gratuit sur https://www.oanda.com/demo-account/tpa/personal_details,
  // puis dans le portail démo (https://www.oanda.com/demo-account/) ->
  // "Manage API Access" -> générer un "Personal Access Token". Coller le
  // token dans js/config.local.js (jamais ici) — voir js/config.local.example.js.
  // Ne JAMAIS mettre un vrai token ici.
  oandaApiToken: '',

  // URL du service Railway de comptes utilisateurs (accounts-bridge/server.py) :
  // inscription/connexion/approbation admin. Laisser vide '' pour utiliser
  // un backend local (http://localhost:8080) pendant le développement.
  accountsApiUrl: ''
};
