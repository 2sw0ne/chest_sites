# CHEST — brief de reprise de projet

Ce fichier existe pour qu'une session Claude Code fraîche (autre machine, autre installation) retrouve immédiatement le niveau de contexte accumulé sur ce projet — vision, architecture, décisions techniques, goûts de l'utilisateur, pièges déjà rencontrés. Lis-le en entier avant de toucher au code.

Ce fichier vit dans `projects/chest/` et complète (ne remplace pas) le `CLAUDE.md` racine du dossier `Sites/` (le framework général "Elite Web Designer" — goûts de design par défaut, anti-patterns IA à bannir, références de niveau). Si seul ce dossier `chest/` a été copié sur la nouvelle machine, la section "Goûts et méthode de travail de l'utilisateur" ci-dessous résume l'essentiel de ce framework général appliqué à ce projet précis.

## Le projet en une phrase

**CHEST** est une plateforme de trading personnelle (usage strictement privé, pas public) pour un seul utilisateur : dashboard de comptes façon FTMO, hub de backtesting (algos figés + système self-service pour en ajouter sans coder), stratégies façon TradingView, calendrier économique avec analyse de sentiment (forex, matières premières, crypto), et un compte pour les réglages. Site multi-pages statique — pas de framework, pas de build, pas de backend (sauf un micro-service Railway pour le calendrier).

## Stack & architecture

- **HTML/CSS/JS statique pur**, aucune dépendance Node/build sur cette machine — vrai site multi-pages (un fichier `.html` par page), pas une SPA.
- Fondations partagées entre toutes les pages : `site/css/tokens.css` (variables de couleur, thème sombre/clair, composants de base : `.card`, `.btn`, `.pill-group`, `.eyebrow`...), `site/css/layout.css` (sidebar off-canvas + topbar), `site/js/theme.js` (toggle sombre/clair persistant), `site/js/auth.js` (gate d'accès), `site/js/nav.js` (ouverture/fermeture sidebar).
- **Gate d'accès** (`site/index.html` + `js/auth.js`) : filtre **côté client uniquement** (hash SHA-256 du code dans `localStorage`, flag `sessionStorage` pour la session déverrouillée). Ce n'est **pas** une vraie sécurité — décision assumée et acceptée par l'utilisateur pour un usage perso. Chaque page protégée appelle `CHESTAuth.guard()` dans son `<head>`.
- Code d'accès par défaut : `2123`.
- Librairies externes (toutes via CDN, jamais installées) : Chart.js 4.4.0 (courbes d'équity), SheetJS/xlsx 0.18.5 (import Excel côté navigateur), flag-icons 7.2.3 (vrais drapeaux SVG — **jamais** d'emoji drapeau, ils s'affichent en texte brut "US"/"EU" sur Windows faute de police dédiée, bug plateforme réel et non contournable en CSS).

## Site unifié : shell `app.html` (PRIORITAIRE sur la description multi-pages ci-dessus)

Le site se comporte comme **un seul produit** : `app.html` est le shell (sidebar repliable + topbar avec fil d'Ariane « catégorie / page » + barre de progression) et charge chaque page dans l'iframe `#chestView`. La sidebar et la topbar ne se rechargent jamais ; seul le contenu change (fondu + progression).

- **Pourquoi une iframe et pas un échange de contenu (pjax)** : chaque page a des IIFE inline, des écouteurs `document`/`window`, des minuteries et des instances Chart.js qui fuiraient ou planteraient si on les échangeait à chaud. L'iframe les isole sans réécrire les pages.
- **`js/theme.js` (premier script du `<head>` de chaque page)** détecte le contexte : dans une iframe → `html.is-embedded` (le CSS cache alors la sidebar/topbar propres à la page) ; page applicative ouverte à nu → `location.replace('app.html#/page?query')` ; pages d'auth (`login`, `signup`, `index`) → sortent de l'iframe via `top.location`.
- **`js/shell.js`** : table `PAGES` (catégorie, libellé, entrée de menu à allumer — ex. `backtest-view` allume « Backtesting »), routage par hash `#/page?query`, synchro iframe → shell (adresse via `replaceState`, titre, fil d'Ariane, entrée active) et fondu de sortie via `postMessage('chest:nav-start')` envoyé par `beforeunload`. Le thème se synchronise par l'évènement `storage`. Le bouton Retour du navigateur fonctionne (historique de l'iframe).
- **Ajouter une page** : créer le `.html` avec le même `<head>`/CSS que les autres, l'ajouter à `PAGES` (`shell.js`) et à `APP_PAGES` (`theme.js`), et un lien `href="#/nom"` dans la sidebar d'`app.html`.
- **Ne pas** tester la création de compte/connexion contre le backend local réel (`accounts.db`) : ça crée de vrais comptes.
- Les pages `backtesting-swyper.html` / `backtesting-allin.html` (legacy) ne sont plus liées nulle part et restent hors shell.
- Feuilles de style : `css/chest-da.css` (design system + shell) puis `css/patch-chest-da.css` (correctifs par page fournis par la DA, chargé après). Incrémenter le `?v=` à chaque modification. Attention : un `sed` sur `chest-da.css?v=N` modifie aussi `patch-chest-da.css?v=N` (sous-chaîne).
- Calendrier : `calendar.html` suit la maquette 5a en sections numérotées (hero → 01 annonces motrices → 02 semaine passée → 03 publications), habillées par `css/calendar-da.css` (chargé après le patch, préfixe `.chest-root` pour l'emporter sur ses `!important`). `calendar.js` masque `#econBlocks` en mode crypto.
- Volet rabattable : bosse SVG ouverte (sans `Z`) dont le trait ne suit que la courbe ; règles dans `chest-da.css` avec sélecteurs plus spécifiques que le patch. Ne pas re-fixer la taille du fond en 13×13 (la règle générique `.chest-sidebar__toggle svg` l'écrasait).
- Logo BERICH : `assets/logo-berich.png` est un PNG détouré (vrai canal alpha), sans `mix-blend-mode`.

## Plan du site (`site/*.html`)

| Page | Rôle |
|---|---|
| `index.html` | Gate d'accès |
| `dashboard.html` + `js/dashboard.js` | Multi-comptes (switcher), KPIs période/profit/RR/winrate/DD, courbe d'équity $/%, panneau Objectifs & calendrier 14j (façon FTMO), widget "Top/Flop crypto top 100" (`js/crypto-movers.js`) |
| `backtesting.html` | Hub : 2 cartes statiques (SWYPER, ALLIN) + cartes dynamiques des backtests ajoutés par l'utilisateur (menu ⋮ Modifier/Supprimer) + carte "Ajouter un backtest" |
| `backtesting-swyper.html` / `backtesting-allin.html` | **Fichiers legacy, ne jamais réécrire** — voir section dédiée ci-dessous |
| `backtest-add.html` | Assistant d'ajout : prompt IA à copier → infos générales → import Xlsx → money management (manuel/auto, compte propre + propfirm optionnel) → génère. Supporte aussi le mode édition (`?edit=<id>`) |
| `backtest-view.html?id=...` | Rapport généré dynamiquement (voir section Backtesting self-service) |
| `strategies.html` / `strategy-example.html` | Liste de stratégies façon page TradingView (Pine Script, onglets, changelog) |
| `calendar.html` + `js/calendar.js` | Calendrier économique + hero de sentiment (voir section dédiée) |
| `account.html` | Thème, paire suivie (calendrier), changement de code d'accès |

## Fichiers de référence — NE JAMAIS TOUCHER NI FORK

- **`site/support.js`** : framework de rendu **généré** (`// GENERATED from dc-runtime/src/*.ts — do not edit`), le moteur `<x-dc>`/`DCLogic` qui fait tourner `backtesting-swyper.html`/`backtesting-allin.html`. Zéro connaissance des trades/capital/risque — pur rendu. Fragile à étendre à la main, ne jamais essayer.
- **`site/allin-engine.js`** (253 lignes) : contient les vraies données des algos ALLIN/SWYPER (`RAW_ALLIN20`, `RAW_BE`, `CAP0 = 10000`, presets `MM_ALLIN20`/`MM_BE`). Sert de **référence de conventions de calcul** (capital composé `capital *= 1 + risque%/100 * rr`, BE traité comme rr=0, paliers de risque après N SL consécutifs, détection d'épisodes de drawdown) — ces conventions ont été reprises dans le moteur générique (`js/backtest-engine.js`) mais **jamais en forkant ce fichier**.
- **`backtesting-swyper.html`** / **`backtesting-allin.html`** : pages de production réelles, fonctionnelles, à ne jamais réécrire — juste un lien "← CHEST" ajouté en overlay. Le design SWYPER (hero plein écran sombre `#050505`, dégradé rose→violet, sections numérotées "01 — Modèles", "02 — Drawdown", etc., cartes cp/pf orange `#e35728`/bleu `#5470c2`) a servi de **référence visuelle** pour la refonte de `backtest-view.html`.

## Design system / DA

Hérité de l'outil de backtest existant de l'utilisateur (voir historique complet ci-dessous) :
- Thème sombre par défaut : `#050505` (fond), `#0c0c0e` (panel) ; miroir clair : blanc/gris clair. Toggle persistant.
- Dégradé de marque : rose `#ff3d7f` → violet `#c04dff`.
- Police : Instrument Sans (Google Fonts).
- Convention "eyebrow" numérotée pour les sections : `01 — Titre` (voir `.eyebrow` dans `tokens.css`) — la ligne qui suit est dessinée automatiquement par `.eyebrow::after`, ne jamais taper de tirets à la main dans le texte.
- Convention couleur `.val`/`.val.pos` (vert `--green`)/`.val.neg` (rouge `--red`)/`.val.neutral` (gris `--muted`) — réutilisée partout (calendrier, backtest, dashboard).
- Hero "plein écran toujours sombre" (breakout `width:100vw; margin-left:-50vw`, même trick que `.ticker-wrap`) utilisé pour la page de garde du calendrier ET celle d'un backtest — délibérément **non lié au thème du site** (reste sombre même en thème clair), pour matcher l'identité visuelle de SWYPER.
- **Honnêteté radicale sur toute heuristique** : chaque estimation/biais/note affichée est explicitement labellisée "heuristique statistique, pas une prédiction garantie" (ou équivalent). Ne jamais présenter un calcul maison comme un vrai modèle prédictif entraîné.

## Backtesting self-service (ajouter un backtest sans coder)

Fonctionnalité phare construite cette session : l'utilisateur peut ajouter un nouveau backtest directement depuis le site, sans que Claude ait à coder une nouvelle paire de fichiers HTML+JS à chaque fois (contrairement à SWYPER/ALLIN, codés en dur).

- **`js/backtest-store.js`** : CRUD localStorage (`list/get/add/update/remove`), clé `chest_backtests`. Schéma d'un backtest : `{id, title, description, capital, cp:{mode:'manual'|'auto', risk, tiers:[{afterSl,newRisk}]}, pf:{...}|null, trades:[{date,result,rr,open?,close?,source?,confirmation?,order?,extra:{}}], createdAt}`.
- **`js/backtest-engine.js`** : moteur générique (simulation à risque fixe/paliers, courbe d'équity, épisodes de drawdown >10%, stats, mensuel, `optimizeCp`/`optimizePf` = grid-search transparent 0.1%→5% par pas de 0.1). `optimizeCp` vise ≤3% de risque (relâché à 5% si besoin) et ≤30% de DD max. `optimizePf` est **strict** : jamais >5% DD journalier ni >10% DD max, renvoie `null` avec message honnête si aucun réglage ne convient. Flag "valeur non garantie" si les heures de clôture ne sont pas fournies (le DD journalier suppose alors une clôture le jour même).
- **`js/xlsx-import.js`** (SheetJS) : colonnes A/B/C **strictes par position** (date/résultat/RR), peu importe le nom d'en-tête. Colonnes optionnelles après C détectées par nom (FR/EN, insensible aux accents via une table de correspondance explicite — **jamais** de regex Unicode sur les diacritiques, ça a cassé l'outil d'édition une fois). Tout en-tête non reconnu est préservé sous `trade.extra[<en-tête original>]` plutôt que jeté (permet à une IA de nommer une colonne "Facultatif" sans perte de données).
- **`backtest-add.html`** : assistant en 4 étapes. Le prompt à copier-coller (étape 1) nomme explicitement les en-têtes attendus et instruit l'IA de préserver tout le reste sous "Facultatif"/"Facultatif 2"... Dropzone : le retour "fichier ajouté" s'affiche **dans** la dropzone elle-même (pas un message séparé en dessous — évite l'impression d'ajouter un 2e fichier). Supporte `?edit=<id>` pour modifier un backtest existant (préremplit tout, sauvegarde via `update()` au lieu de `add()`).
- **`backtest-view.html?id=...`** : page de rapport, refaite pour matcher fidèlement SWYPER : hero plein écran (titre en dégradé, badge positions+période non filtrée, footer Capital initial/Trades/Période en mois/**Note** — une note E→S calculée par heuristique transparente sur retour/DD/profit factor/winrate), cartes "Deux possibilités" (compte propre + propfirm) côte à côte avec filtre par année, clic sur une carte → bascule + scroll vers la section détail (gros bloc de 6 stats façon ancien design, courbe d'équity, zones de DD **en carrés** — pas des ovales, testé et corrigé — sous la courbe), tableau mensuel comparatif cp/pf, journal filtrable (compte/résultat/mois) groupé par mois avec en-tête de séparation.
- Menu ⋮ sur les cartes du hub (`backtesting.html`) : Modifier (renvoie vers `backtest-add.html?edit=`) / Supprimer (confirmation, suppression instantanée sans reload).

## Calendrier économique & sentiment (`calendar.html` + `calendar-bridge/`)

- **Sources de données** (aucune API payante, tout gratuit/public) : `investing.com/economic-calendar` (aujourd'hui + semaine en cours, via **Playwright avec un vrai Chrome visible** — le mode headless est bloqué par leur anti-bot) + `tradingeconomics.com/calendar` (au-delà, jusqu'à ~10 jours). Champ `source` sur chaque évènement pour transparence. Couvre US/zone euro/UK/Japon uniquement.
- **`calendar-bridge/fetch_calendar.py`** : script qui scrape et écrit `site/data/calendar.json`. `build_calendar_data()` fait le fetch ; `merge_with_history()` (ajouté récemment) **accumule un historique glissant de 30 jours** au lieu d'écraser à chaque run — nécessaire pour que le navigateur de dates du site puisse consulter "hier". Deux limites documentées dans le code et le README : l'historique ne remonte que depuis sa mise en service, et un jour archivé garde le "résultat" capturé au moment du run (pas de mise à jour rétroactive intra-journée).
- **`calendar-bridge/server.py`** : service Flask déployé sur **Railway** (Xvfb pour le Chrome visible, `xauth` requis, `--disable-dev-shm-usage` pour la mémoire limitée du conteneur), refetch toutes les 24h, sert `GET /calendar.json` en lecture (CORS ouvert, données publiques). URL live configurée dans `site/js/config.js` (`calendarApiUrl`). A nécessité **5 itérations de debug** (xauth manquant → Flask bloqué par Xvfb → OOM Chrome → bannière de consentement OneTrust asynchrone → timing du clic "Cette Semaine") — tout est documenté dans `calendar-bridge/README.md`, à consulter avant de retoucher ce script.
- **Sentiment forex/matières premières** (`js/calendar.js`, `PAIR_CONFIG`) : chaque paire a 1-2 devises "motrices" avec un poids signé. Matrice complète des 28 paires forex (8 devises : EUR/GBP/AUD/NZD/USD/CAD/CHF/JPY, générée par `buildFxConfig()`, pas écrite à la main) + 5 matières premières (Or/Argent/Pétrole/Platine/DXY, DXY promu en paire suivable à part entière). Seuls EU/UK/US/JP ont de vraies données suivies — une paire comme AUDCHF (aucune des deux devises suivie) affiche honnêtement un biais neutre plutôt qu'une fausse analyse.
- **Sentiment crypto** (11 pièces : BTC/ETH/SOL/XRP/TRX/HYPE/DOGE/LINK/ADA/UNI/AVAX, ids CoinGecko vérifiés) : **différent** du modèle forex — combine 3 signaux normalisés (-1..+1) : macro US générique 40% (réutilise le même calcul que l'or), Fear & Greed Index (`api.alternative.me/fng/`, gratuit sans clé) 35%, momentum 24h de la pièce suivie (CoinGecko `/coins/markets`) 25%. Affiche uniquement la pièce suivie (logo réel CoinGecko, pas d'emoji) + jusqu'à 3 annonces macro ayant pesé — pas les 11 pièces à chaque fois.
- **Sélecteur de paire** (`account.html`) : 3 menus déroulants (Forex 28 options en `<optgroup>`, Matières premières 5, Crypto 11) plutôt que des boutons — un seul `<select>` actif à la fois, stocké dans `localStorage` (`chest_sentiment_pair`).
- **Navigateur de jour** (section "Aujourd'hui" du calendrier) : montre **exactement** le jour sélectionné (plus une fenêtre 48h), boutons ◀/Aujourd'hui/▶, bornes désactivées aux limites des données disponibles. La liste "Prochains jours" reste toujours ancrée sur le vrai jour courant, indépendamment de la navigation.
- **Piège de fuseau horaire** : ne jamais utiliser `date.toISOString().slice(0,10)` pour comparer une date locale à une date `YYYY-MM-DD` du backend (déjà convertie en heure de Paris) — `toISOString()` repasse en UTC et peut décaler le jour. Utiliser `isoDateLocal()` (déjà défini dans `calendar.js`).

## Autres décisions techniques notables

- **Pont MT5** (`mt5-bridge/export_mt5.py`) : script Python local (pip `MetaTrader5`) qui lit le terminal MT5 ouvert et écrit `site/data/data.json` ; `dashboard.js` le consomme s'il existe, sinon retombe silencieusement sur les comptes d'exemple. **Jamais exécuté/vérifié** faute d'accès à un vrai terminal MT5 depuis cette session — à tester par l'utilisateur.
- **Déploiement** : tout le site reste **100% local** pour l'instant (décision explicite de l'utilisateur), seul le calendrier tourne sur Railway. Le déploiement public complet est repoussé après une passe de design/DA à venir — ne pas relancer ce chantier sans que l'utilisateur le redemande explicitement.
- **Pas de clé API leakée** : une ancienne clé Financial Modeling Prep orpheline a été retirée de `js/config.js` — ne jamais recommiter de secret dans ce fichier.

## Goûts et méthode de travail de l'utilisateur

- Esthétique par défaut recherchée : **indie premium**, pas corporate/générique — références Vanta Supply, alike.page (voir le `CLAUDE.md` racine pour le détail complet). Bannir explicitement le combo Space Grotesk+Syne et le cliché "dashboard sombre + grille de fond + KPI cards à liseré coloré" — devenu un tell instantané d'IA.
- Préfère un **retour direct et itératif** : donne des captures d'écran annotées à la main, corrige rapidement si l'implémentation dévie de sa vision, apprécie qu'on exécute directement sur un feedback déjà très détaillé plutôt que de repasser systématiquement en mode plan.
- Exige de la **donnée réelle vérifiée** plutôt que de la donnée plausible : chaque source externe (API, scraping) a été testée en direct (curl/fetch) avant d'être branchée, jamais supposée fonctionner.
- Veut que toute estimation/heuristique soit **explicitement labellisée comme telle**, jamais présentée comme une vraie prédiction.
- Style de communication : français, direct, parfois elliptique — ne pas hésiter à interpréter intelligemment une demande courte à la lumière du contexte déjà posé, mais confirmer par un test visible plutôt que de juste affirmer que "ça marche".

## Pièges déjà rencontrés (pour ne pas les refaire)

- Emoji drapeaux → texte brut sur Windows : toujours utiliser flag-icons (SVG), jamais d'emoji régional pour un pays. Idem pour les cryptos : utiliser les vrais logos CoinGecko (`image` dans `/coins/markets`), pas d'emoji symbole.
- Regex Unicode sur les diacritiques dans l'outil d'édition → a cassé un `Edit` (comparaison silencieusement identique). Préférer une table de correspondance explicite.
- Un backtest importé via `<input type=file>` ne peut pas être testé par automatisation de navigateur (restriction navigateur réelle) — pour tester, construire un `Blob` synthétique depuis un fichier généré par `openpyxl` et appeler `parseXlsxFile()` directement, ou dispatcher un événement `drop` synthétique avec un vrai `DataTransfer`.
- Screenshot automatisé qui rend en noir après un scroll sur une page avec hero plein écran (`calendar.html`, `backtest-view.html`) : bug de l'outil de test, pas du site — vérifier via `get_page_text`/`getComputedStyle`/`elementFromPoint` plutôt que via capture d'écran dans ce cas précis.
- Cache navigateur agressif sur le serveur de dev local (`python -m http.server`, pas d'en-têtes no-cache) : si un fichier édité ne semble pas se refléter après un rechargement, ajouter un `?nocache=N` à l'URL avant de conclure que l'édition est fausse.
- Railway + Playwright : conteneur à ressources limitées → toujours `--disable-dev-shm-usage`/`--disable-gpu`, fermer le navigateur dans un `finally`, et attendre explicitement (`wait_for_selector`, pas juste un `click` avec timeout court) les éléments chargés de façon asynchrone (bannière OneTrust notamment).

## Pour aller plus loin

L'historique chronologique complet (chaque itération, chaque bug, chaque décision avec sa justification exacte) vit dans la mémoire Claude de la machine d'origine (`project_chest.md`) et ne voyage pas avec ce dossier. Ce fichier-ci en est la synthèse actionnable — si un détail précis manque pour une décision passée, le comportement du code lui-même (commentaires inline, notamment dans `fetch_calendar.py`, `calendar.js`, `backtest-engine.js`) est la source de vérité la plus fiable après ce document.
