// Configuration locale de CHEST. Rien de secret ici (l'URL Railway sert du
// calendrier public en lecture seule) — si une vraie clé API est ajoutée un
// jour dans ce fichier, l'exclure du dépôt (voir .gitignore) avant de pousser.
// La clé Twelve Data n'est PLUS ici (2026-09-23, dépôt chest_sites public) :
// elle vit uniquement côté serveur (accounts-bridge, variable d'environnement
// Railway TWELVE_DATA_API_KEY), relayée par /twelvedata/<endpoint> — voir
// scanner-chart.js/berich-chart.js/calendar.js/lot-calculator.js.
window.CHEST_CONFIG = {
  // URL du service Railway qui sert calendar.json (calendar-bridge/server.py).
  // Laisser vide '' pour utiliser le fichier local data/calendar.json à la place.
  // Déployé le 2026-09-23 dans le projet Railway unique "chest_sites" (Root
  // Directory calendar-bridge), qui a remplacé l'ancien projet séparé.
  calendarApiUrl: 'https://calendar-bridge-production-1429.up.railway.app/calendar.json',

  // URL COMPLÈTE de l'endpoint /signals de berich-bridge/server.py — déployé
  // le 2026-09-23 dans le même projet Railway "chest_sites" (Root Directory
  // berich-bridge). Remplace BEFREE (github.com/2sw0ne/BEFREE), qui ne sert
  // en réalité qu'à relayer les mêmes alertes TradingView vers le bot
  // Telegram et n'a rien à voir avec CHEST (clarification utilisateur du
  // 2026-09-23). Penser à repointer l'alerte TradingView "Any alert()
  // function call" vers <cette-url-sans-/signals>/webhook (voir
  // berich-bridge/README.md) — pas encore fait à cette date. Laisser vide ''
  // pour utiliser le fichier local data/berich-signal.json à la place.
  berichApiUrl: 'https://berich-bridge-production.up.railway.app/signals',

  // URL du webhook-bridge Stratégies (scanner-bridge/server.py) qui sert
  // scanner-signals.json (opportunités détectées par les 4 scanners). Le
  // panneau de notification qui l'affichait a été retiré de strategies.html
  // (2026-09-14, sur demande explicite — plus de temps à y consacrer pour
  // l'instant) ; cette clé et le pipeline scanner-bridge/ restent en place
  // pour une reprise future. Laisser vide '' pour utiliser le fichier local
  // data/scanner-signals.json à la place (pas encore déployé non plus).
  scannerSignalsApiUrl: '',

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
  // Déployé le 2026-09-23 dans le projet Railway unique "chest_sites" (Root
  // Directory accounts-bridge, Volume attaché pour la persistance de
  // accounts.db).
  accountsApiUrl: 'https://accounts-bridge-production.up.railway.app',

  // Clé PUBLIQUE VAPID (notifications push, 2026-09-26) — par construction non secrète (c'est le
  // principe de VAPID : la clé publique s'envoie au navigateur, seule la clé privée côté serveur
  // doit rester secrète, elle vit dans la variable d'environnement Railway VAPID_PRIVATE_KEY).
  // Générée une fois avec py-vapid ; à régénérer (et remplacer aussi côté serveur) seulement si
  // elle devait un jour être révoquée.
  vapidPublicKey: 'BI2lWzimVJKfvk_uQxuWaROIdDniJrYaEkLsBpj8PdDl9sdiTgJEHFnYPD8LaOGAGdRiFP79vPnVY7Osvg-qxdM'
};
