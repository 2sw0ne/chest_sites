# Calendrier économique → CHEST

Script local qui va chercher les annonces à impact élevé pour US / zone euro / UK / Japon et écrit `../site/data/calendar.json`, lu automatiquement par la page Calendrier.

## D'où vient la donnée

Deux sources publiques combinées, chacune pour ce qu'elle fait de mieux :

- **investing.com/economic-calendar/** pour **aujourd'hui + la semaine en cours** (onglet "Cette Semaine") : leurs propres étoiles d'importance (1 à 3) et leurs propres prévisions, directement lues sur `fr.investing.com` — donc déjà en français. Technique : depuis le 2026-09-07, on pilote un vrai navigateur Chrome via [Playwright](https://playwright.dev/python/) (clic sur l'onglet "Cette Semaine", lecture du tableau final) plutôt qu'une simple requête HTTP, parce que leurs jours suivants ne sont chargés que par JavaScript (voir "Fragilités" plus bas).
- **tradingeconomics.com/calendar** pour **au-delà de la semaine en cours** : liste ~10 jours à l'avance, utile pour l'aperçu plus lointain même si leur notation d'importance est parfois plus stricte que celle d'investing.com pour le même évènement (ex. le PIB trimestriel japonais, noté "haute" chez investing.com mais "moyenne" chez eux — vérifié le 2026-09-07).

Vérifié le 2026-09-07 : pas de `robots.txt` qui interdit ces pages sur l'un ou l'autre site, licences "usage personnel" compatibles avec cet usage.

**Dans tous les cas** : ni l'un ni l'autre n'est le produit officiel de son fournisseur, donc c'est fragile (structure HTML qui peut changer sans prévenir) et à garder strictement personnel — ne jamais republier la donnée brute, ne pas relancer le script trop souvent (une fois par jour suffit largement, le cache côté site est de toute façon sur plusieurs heures).

Le ticker du haut de page utilise l'API gratuite [Frankfurter](https://frankfurter.dev) (taux de référence BCE, sans clé) — ce sont des cours de clôture, pas du tick temps réel.

## Fragilités connues

- **investing.com bloque tout accès automatisé en mode invisible** ("headless"), qu'il s'agisse d'une simple requête (`urllib`/`curl`, testé 403) ou d'un Chrome piloté par Playwright en mode headless (403 aussi, même avec le vrai Chrome installé). Seul un Chrome lancé en mode **visible** passe (`headless=False`) — c'est pour ça qu'**une fenêtre Chrome s'ouvre brièvement (~15-20 secondes) à chaque exécution du script puis se ferme toute seule**. Ce n'est pas un bug, c'est voulu : ne pas s'inquiéter de la voir apparaître.
- Si `fetch_calendar.py` affiche "investing.com (semaine, playwright) indisponible", le script retombe automatiquement sur l'ancien chemin `curl` pour aujourd'hui + tradingeconomics.com pour la suite — le calendrier continue de fonctionner, juste avec une précision moindre sur les jours à venir.
- Leur page ne montre par défaut que la **semaine en cours** ("Cette Semaine") ; l'onglet "Semaine prochaine" s'est avéré trop instable à cliquer de façon fiable pour être utilisé (abandonné le 2026-09-07) — au-delà de la semaine en cours, tradingeconomics.com prend le relais.
- Leur tableau est lu tel qu'affiché à l'écran (classes CSS, icônes d'étoiles), pas via un JSON stable : plus sensible qu'avant à un changement visuel de leur site. Si le script renvoie 0 évènement investing.com un jour, il faudra probablement ajuster le sélecteur JS `INV_WEEK_EXTRACT_JS` dans `fetch_calendar.py`.

## Utilisation

```bash
python fetch_calendar.py
```

**Dépendances à installer une fois :**

```bash
pip install playwright tzdata
python -m playwright install chromium
```

- `playwright` pilote un vrai Chrome pour lire le calendrier investing.com (voir "Fragilités" ci-dessus) — nécessite que **Google Chrome soit installé** sur la machine (`channel="chrome"` dans le script), pas seulement le Chromium embarqué par Playwright.
- `tzdata` fournit la base de fuseaux horaires (Windows ne l'embarque pas nativement, contrairement à macOS/Linux) — nécessaire pour convertir les heures UTC des deux sources vers l'heure de Paris.
- `curl` doit rester disponible dans le PATH (natif sur Windows 10+/macOS/Linux) pour le chemin de repli.

Pour une mise à jour automatique **en local**, programme-le dans le **Planificateur de tâches Windows** une fois par jour (pas besoin de plus, ni investing.com ni tradingeconomics.com ne sont du temps réel ici) — ou déploie-le sur Railway (voir ci-dessous) pour ne plus avoir de fenêtre Chrome qui s'ouvre du tout sur ta machine.

## Déploiement Railway (optionnel — évite la fenêtre Chrome locale)

Le reste du site CHEST (dashboard, backtesting, compte) reste local pour le moment ; seul ce dossier `calendar-bridge/` peut tourner sur Railway, en remplacement du lancement local, pour que la fenêtre Chrome s'ouvre sur un écran virtuel plutôt que sur l'écran de l'utilisateur :

1. Créer un nouveau service Railway pointé sur ce dossier (`calendar-bridge/`), déployé via son `Dockerfile` (Railway le détecte automatiquement).
2. Aucune variable d'environnement obligatoire — `CHEST_CHROME_CHANNEL=""` et `PORT=8080` sont déjà fixées dans le `Dockerfile` pour utiliser le Chromium embarqué par Playwright (pas besoin d'installer Chrome dans le conteneur) sous `xvfb-run`.
3. Une fois déployé, Railway donne une URL publique (`https://<ton-service>.up.railway.app`). Le service scrape une première fois au démarrage puis se rafraîchit tout seul toutes les 30 min par défaut (`server.py`, `CHEST_CALENDAR_REFRESH_SECONDS`) — modifiable via cette variable d'environnement Railway. Compromis assumé : plus réactif qu'un cycle de 24h, mais 48 scrapes/jour au lieu d'1 augmente le risque de se faire bloquer par l'anti-bot d'investing.com (voir "Fragilités" plus haut) — à surveiller via les logs Railway si ça se dégrade.
4. Dans `site/js/config.js`, renseigner `calendarApiUrl: 'https://<ton-service>.up.railway.app/calendar.json'` — la page calendrier du site local ira lire les données là-bas au lieu du fichier local `data/calendar.json`. Laisser vide `''` pour revenir au fonctionnement 100% local (fichier écrit par `python fetch_calendar.py`).

**À vérifier au premier déploiement** : le blocage anti-bot d'investing.com a été testé en local avec le vrai Chrome installé (`channel="chrome"`) en mode visible. Sur Railway, c'est le Chromium embarqué par Playwright (sous Xvfb) qui est utilisé à la place — l'hypothèse est que c'est bien le mode *headless* qui déclenche le blocage, pas le binaire précis. Si les logs du service Railway affichent "investing.com (semaine, playwright) indisponible" en continu, il faudra installer Chrome via `apt-get` dans le `Dockerfile` (`google-chrome-stable`) et repasser `CHEST_CHROME_CHANNEL=chrome`.

## Traduction et heure de Paris

- Les évènements tradingeconomics.com sont traduits en français via un dictionnaire (~170 intitulés courants) dans `fetch_calendar.py` ; un intitulé absent du dictionnaire reste affiché en anglais plutôt que d'être mal traduit. Les évènements investing.com sont déjà en français nativement (site `fr.investing.com`).
- Les heures des deux sources sont systématiquement converties vers `Europe/Paris` (gère automatiquement heure d'été/hiver), y compris le changement de jour si la conversion fait passer un évènement après minuit (ex. le PIB japonais publié à 23h50 UTC devient 01h50 le lendemain, heure de Paris — exactement ce qu'affiche investing.com pour un visiteur en France).

## Filtre d'importance (étoiles)

Le script écrit trois niveaux (`"importance": "high"|"medium"|"low"`) dans `calendar.json` — les étoiles d'investing.com pour aujourd'hui et la semaine en cours, celles de tradingeconomics.com au-delà. La page filtre côté client via les pastilles "Élevée / Moyenne / Faible" au-dessus du calendrier (choix mémorisé dans `localStorage`, par défaut "Élevée" seule).

Attention : au-delà de la semaine en cours (partie tradingeconomics.com), leur notation d'importance ne correspond pas toujours à celle d'investing.com pour un même évènement (voir plus haut, cas du PIB japonais) — à vérifier au cas par cas si un doute sur ces jours plus lointains.

## Limites connues

- Le **consensus/prévision** n'est pas toujours renseigné pour les évènements encore loin dans le temps — il se précise généralement dans les 24-48h avant la publication.
- L'"hypothèse de réaction" affichée sur le site est une **heuristique simple** (comparaison réel vs consensus + biais directionnel par mot-clé), pas un modèle prédictif entraîné. Elle est présentée comme telle dans l'interface.
- Si le script ne renvoie plus rien un jour, c'est probablement qu'un des deux sites a changé la structure de sa page — il faudra ajuster les sélecteurs/expressions régulières dans `fetch_calendar.py`.
- **Historique (navigateur de jours du site)** : ni investing.com ni tradingeconomics.com n'exposent le passé — chaque fetch ne renvoie que "aujourd'hui → +N jours". `merge_with_history()` conserve donc les jours déjà écoulés d'un fetch au suivant (fenêtre glissante de `HISTORY_DAYS` = 30 jours) plutôt que de les perdre, pour que le site puisse afficher "hier" etc. Deux limites à garder en tête : (1) l'historique ne remonte que jusqu'à la date de mise en service de cette fonction — aucune donnée antérieure n'a jamais été capturée ; (2) le `actual` d'un jour archivé est celui capturé au moment du fetch (une fois par 24h) — une publication survenue plus tard ce jour-là, après le run, n'est pas mise à jour rétroactivement.
