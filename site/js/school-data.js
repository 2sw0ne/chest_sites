// CHEST · School — catalogue des cours écrits, fiches et vidéos (généré, puis maintenu à la main).
// Ajouter un document = une ligne dans `items` : id unique, `shelf` (trading|ugc|mental|other), `sub` (groupe dans « other »), `kind`, `rank` (récence : n° de message Telegram, ou `added` = date ISO pour un ajout futur). `tg` = « rubrique/message » du canal Telegram CHEST.
window.CHEST_SCHOOL = {
 "tg": "https://t.me/c/2530313046/",
 "shelves": [
  {
   "id": "trading",
   "title": "Trading",
   "blurb": "Cours VVS, ressources et documents de référence pour trader.",
   "icon": "chart",
   "tone": "blue"
  },
  {
   "id": "ugc",
   "title": "UGC",
   "blurb": "Tout pour démarrer dans l'UGC : dossier de départ, statut légal, portfolios.",
   "icon": "camera",
   "tone": "amber"
  },
  {
   "id": "mental",
   "title": "Psychologie",
   "blurb": "Émotions, discipline, pourquoi et lectures pour se construire.",
   "icon": "brain",
   "tone": "pink"
  },
  {
   "id": "other",
   "title": "Autres ressources",
   "blurb": "Flyers, preuves sociales, business, réseau, liens et outils.",
   "icon": "folder",
   "tone": "green"
  }
 ],
 "items": [
  {
   "id": "c-base",
   "shelf": "trading",
   "kind": "course",
   "title": "Ressources Trading",
   "desc": "Vocabulaire, ordres, sessions, bougies, Fibonacci, trendline, BOS, plateformes et outils : le dictionnaire du trader.",
   "course": "base",
   "meta": "14 chapitres",
   "cover": "assets/school/notion/cover-ressources.webp",
   "rank": 522
  },
  {
   "id": "c-vvs",
   "shelf": "trading",
   "kind": "course",
   "title": "VVS — La Stratégie",
   "desc": "3 confirmations, gestion du trade et checklist. Si une manque, pas de trade.",
   "course": "vvs",
   "meta": "5 chapitres",
   "cover": "assets/school/notion/cover-vvs.webp",
   "rank": 526
  },
  {
   "id": "n-supernova",
   "shelf": "trading",
   "kind": "note",
   "title": "Stratégie Supernova",
   "desc": "Moyennes mobiles, étoiles rouges et vertes, confirmation : le système partagé par Bastian.",
   "note": "supernova",
   "rank": 245
  },
  {
   "id": "s-supernova",
   "shelf": "trading",
   "kind": "sheet",
   "title": "Plan Supernova (tableur)",
   "desc": "Le plan que Bastian a partagé pendant son live.",
   "url": "https://docs.google.com/spreadsheets/d/14WgTAEzgnwJWi7-XV4r5aluiW9sDjLoIeJNPqr-RDMQ/edit?usp=sharing",
   "rank": 246
  },
  {
   "id": "d-synthese",
   "shelf": "trading",
   "kind": "pdf",
   "title": "Trading Synthèse",
   "desc": "La synthèse des notions à connaître.",
   "meta": "PDF · 1,2 Mo",
   "tg": "10/49",
   "rank": 49
  },
  {
   "id": "d-index",
   "shelf": "trading",
   "kind": "pdf",
   "title": "Index Trading",
   "desc": "L'index des notions de trading (Nathan).",
   "meta": "PDF · 1,7 Mo",
   "tg": "10/50",
   "rank": 50
  },
  {
   "id": "d-trendwave",
   "shelf": "trading",
   "kind": "pdf",
   "title": "Tutoriel Trend Wave",
   "desc": "Tutoriel en français pour trader les cryptos avec le scanner Trend Wave.",
   "meta": "PDF · 6,9 Mo",
   "tg": "10/258",
   "rank": 258
  },
  {
   "id": "d-charts",
   "shelf": "trading",
   "kind": "image",
   "title": "Trade-Charts",
   "desc": "Visuel de référence sur les graphiques.",
   "meta": "Image · 68 Ko",
   "tg": "10/48",
   "rank": 48
  },
  {
   "id": "n-propfirm",
   "shelf": "trading",
   "kind": "note",
   "title": "Acheter une propfirm",
   "desc": "Les 4 étapes pour prendre une propfirm avec le code de réduction OMNI et la connecter à TradeLocker.",
   "note": "propfirm",
   "rank": 530
  },
  {
   "id": "c-psy",
   "shelf": "mental",
   "kind": "course",
   "title": "Psychologie & Money Management",
   "desc": "À lire avant tout le reste : émotions, discipline, règle du 1 %, risk/reward et routine.",
   "course": "psy",
   "meta": "5 chapitres",
   "rank": 524
  },
  {
   "id": "n-pourquoi",
   "shelf": "mental",
   "kind": "note",
   "title": "Trouver ton pourquoi",
   "desc": "L'exercice en 2 étapes pour comprendre pourquoi tu fais ça, et t'engager.",
   "note": "pourquoi",
   "rank": 346
  },
  {
   "id": "n-livres",
   "shelf": "mental",
   "kind": "note",
   "title": "Livres à lire par palier",
   "desc": "La liste de lecture classée par niveau, du premier livre au leadership.",
   "note": "livres",
   "rank": 129
  },
  {
   "id": "l-16p",
   "shelf": "mental",
   "kind": "link",
   "title": "Test 16Personalities",
   "desc": "Le test de personnalité pour mieux te connaître.",
   "url": "https://www.16personalities.com/fr",
   "rank": 224
  },
  {
   "id": "d-leadership",
   "shelf": "mental",
   "kind": "pdf",
   "title": "5 niveaux de leadership",
   "desc": "Les cinq niveaux de leadership en un document.",
   "meta": "PDF · 466 Ko",
   "tg": "10/128",
   "rank": 128
  },
  {
   "id": "l-42livres",
   "shelf": "mental",
   "kind": "folder",
   "title": "42 livres PDF (IM French)",
   "desc": "42 livres de développement personnel, trading, marketing et éducation financière.",
   "url": "https://www.dropbox.com/sh/8g0kklm1k3us65x/AABMx2ibPOogq06yp2m3WXRNa?dl=0",
   "rank": 123
  },
  {
   "id": "d-ugc-dossier",
   "shelf": "ugc",
   "kind": "pdf",
   "title": "Dossier de démarrage UGC",
   "desc": "Le dossier pour lancer ton activité UGC sur iPhone : canaux et applications à installer.",
   "meta": "PDF · 2,2 Mo",
   "tg": "5/12",
   "note": "ugc-demarrage",
   "rank": 12
  },
  {
   "id": "n-autoentreprise",
   "shelf": "ugc",
   "kind": "note",
   "title": "Ouvrir ton auto-entreprise",
   "desc": "Le tuto express en 6 étapes pour obtenir ton SIRET et être payé par les marques.",
   "note": "autoentreprise",
   "rank": 28
  },
  {
   "id": "d-ugc-1",
   "shelf": "ugc",
   "kind": "pdf",
   "title": "UGC — document 1",
   "desc": "Support UGC (copie de UGC 1).",
   "meta": "PDF · 1,8 Mo",
   "tg": "5/65",
   "rank": 65
  },
  {
   "id": "l-portfolio-swann",
   "shelf": "ugc",
   "kind": "link",
   "title": "Portfolio UGC — Swann",
   "desc": "Ton portfolio UGC réalisé sur Canva.",
   "url": "https://www.canva.com/design/DAGyw6N-5wc/m8EYOWNmiHnckiEyFvTONA/view",
   "rank": 285
  },
  {
   "id": "l-portfolio-kelly",
   "shelf": "ugc",
   "kind": "link",
   "title": "Portfolio officiel de Kelly",
   "desc": "Un portfolio UGC de référence, pour t'inspirer.",
   "url": "https://kellytoldme.com/",
   "rank": 483
  },
  {
   "id": "d-omni-ugc",
   "shelf": "ugc",
   "kind": "pdf",
   "title": "Présentation OMNI JIFU UGC",
   "desc": "La présentation complète de l'offre UGC.",
   "meta": "PDF · 82 Mo",
   "tg": "9",
   "big": true,
   "rank": 515
  },
  {
   "id": "l-flyer-dceo",
   "shelf": "other",
   "kind": "link",
   "title": "Flyer DCEO",
   "desc": "Welcome, Exécutive, Silver, Gold : chaque niveau expliqué, à modifier sur Canva.",
   "url": "https://www.canva.com/design/DAGxBeIhRjc/DtkNwNGRIpCb1S6hsq0-nw/view",
   "sub": "Flyers & présentations",
   "rank": 153
  },
  {
   "id": "l-flyer-retrait",
   "shelf": "other",
   "kind": "link",
   "title": "Flyer 1er retrait trading",
   "desc": "Le flyer de félicitations et le diplôme « certification d'accomplissement ».",
   "url": "https://www.canva.com/design/DAGraOxznvE/1h418WSXsHbiHeuW-P7j6Q/view",
   "sub": "Flyers & présentations",
   "rank": 241
  },
  {
   "id": "d-visuels-duree",
   "shelf": "other",
   "kind": "image",
   "title": "Visuels 3 mois · 6 mois · 1 an",
   "desc": "Les trois visuels de durée.",
   "meta": "3 images · 4,9 Mo chacune",
   "tg": "10/492",
   "sub": "Flyers & présentations",
   "rank": 492
  },
  {
   "id": "d-slide-prix",
   "shelf": "other",
   "kind": "image",
   "title": "Slide prix H-T",
   "desc": "La slide des prix.",
   "meta": "Image · 8 Mo",
   "tg": "9/509",
   "sub": "Flyers & présentations",
   "rank": 509
  },
  {
   "id": "d-flyers-img",
   "shelf": "other",
   "kind": "image",
   "title": "Flyers (IMG 2649 et 2650)",
   "desc": "Deux visuels prêts à envoyer.",
   "meta": "2 images · 1,5 Mo",
   "tg": "9/379",
   "sub": "Flyers & présentations",
   "rank": 379
  },
  {
   "id": "d-omni-jifu",
   "shelf": "other",
   "kind": "pdf",
   "title": "Présentation OMNI JIFU",
   "desc": "La présentation de l'offre OMNI JIFU.",
   "meta": "PDF · 64 Mo",
   "tg": "9/264",
   "big": true,
   "sub": "Flyers & présentations",
   "rank": 264
  },
  {
   "id": "d-omn-ia",
   "shelf": "other",
   "kind": "pdf",
   "title": "Présentation OMN-IA (300 $)",
   "desc": "La présentation OMN-IA, version 300 $.",
   "meta": "PDF · 79 Mo",
   "tg": "9/514",
   "big": true,
   "sub": "Flyers & présentations",
   "rank": 514
  },
  {
   "id": "p-10k",
   "shelf": "other",
   "kind": "image",
   "title": "10K TODAY",
   "desc": "« J'ai tellement bossé pour en arriver là ! »",
   "meta": "Capture",
   "tg": "381/498",
   "sub": "Crédibilité",
   "rank": 498
  },
  {
   "id": "p-fin-semaine",
   "shelf": "other",
   "kind": "image",
   "title": "Fin de semaine trading",
   "desc": "Lundi 6/04 : fin de semaine de trading.",
   "meta": "Capture",
   "tg": "381/497",
   "sub": "Crédibilité",
   "rank": 497
  },
  {
   "id": "p-1er-retrait",
   "shelf": "other",
   "kind": "image",
   "title": "1er retrait — oct./déc. 2025",
   "desc": "Premier retrait, octobre à décembre 2025.",
   "meta": "Capture",
   "tg": "381/474",
   "sub": "Crédibilité",
   "rank": 474
  },
  {
   "id": "p-750",
   "shelf": "other",
   "kind": "image",
   "title": "Retrait de 750 €",
   "desc": "Félicitations à Ethan pour son retrait de 750 €.",
   "meta": "Capture",
   "tg": "381/399",
   "sub": "Crédibilité",
   "rank": 399
  },
  {
   "id": "p-trackyear",
   "shelf": "other",
   "kind": "image",
   "title": "Track record 1 an — Jeremy Gambi",
   "desc": "Un an de résultats.",
   "meta": "Capture",
   "tg": "381/382",
   "sub": "Crédibilité",
   "rank": 382
  },
  {
   "id": "p-track8",
   "shelf": "other",
   "kind": "image",
   "title": "Track 8 mois — Nick Gomez",
   "desc": "Huit mois de résultats.",
   "meta": "Capture",
   "tg": "381/385",
   "sub": "Crédibilité",
   "rank": 385
  },
  {
   "id": "p-cashlive",
   "shelf": "other",
   "kind": "image",
   "title": "Cashlive effect — Bastian Tallec",
   "desc": "L'effet des sessions en direct.",
   "meta": "Capture",
   "tg": "381/387",
   "sub": "Crédibilité",
   "rank": 387
  },
  {
   "id": "p-all",
   "shelf": "other",
   "kind": "folder",
   "title": "Tout le dossier Social Proof",
   "desc": "Les 22 captures : retraits, résultats et messages de remerciement.",
   "meta": "22 captures",
   "tg": "381",
   "sub": "Crédibilité",
   "rank": 500
  },
  {
   "id": "n-reseaux",
   "shelf": "other",
   "kind": "note",
   "title": "Formation réseaux sociaux (Morgan)",
   "desc": "Utiliser les réseaux comme un levier : personal branding, stories, M-E-P et 4 types de personnes.",
   "note": "reseaux",
   "sub": "Business & réseau",
   "rank": 124
  },
  {
   "id": "n-closing",
   "shelf": "other",
   "kind": "note",
   "title": "Méthodologie de closing",
   "desc": "Le closing en entonnoir, en 8 étapes.",
   "note": "closing",
   "sub": "Business & réseau",
   "rank": 107
  },
  {
   "id": "d-objections",
   "shelf": "other",
   "kind": "pdf",
   "title": "PDF des objections",
   "desc": "Le guide pour répondre aux objections.",
   "meta": "PDF · 461 Ko",
   "url": "https://391a8f93-70b1-4139-8de8-36855fec4b42.filesusr.com/ugd/ac6182_35ad745e5627437892bbb89aa2f33073.pdf",
   "sub": "Business & réseau",
   "rank": 51
  },
  {
   "id": "d-gameplan",
   "shelf": "other",
   "kind": "pdf",
   "title": "GAMEPLAN — Business Builder",
   "desc": "Le plan de jeu du Business Builder.",
   "meta": "PDF · 21 Mo",
   "tg": "6/302",
   "sub": "Business & réseau",
   "rank": 302
  },
  {
   "id": "d-mlm-ponzi",
   "shelf": "other",
   "kind": "pdf",
   "title": "Analyse juridique : MLM vs Ponzi",
   "desc": "Comprendre la différence, en droit.",
   "meta": "PDF · 3 Ko",
   "tg": "10/354",
   "sub": "Business & réseau",
   "rank": 354
  },
  {
   "id": "d-cfc",
   "shelf": "other",
   "kind": "pdf",
   "title": "Questionnaire CFC",
   "desc": "Le questionnaire de départ.",
   "meta": "PDF · 57 Ko",
   "tg": "10/130",
   "sub": "Business & réseau",
   "rank": 130
  },
  {
   "id": "l-myfxbook",
   "shelf": "trading",
   "kind": "link",
   "title": "Calculateur de lot MyFXBook",
   "desc": "Calcule la taille de ta position pour ne jamais risquer plus de 1 %.",
   "url": "https://www.myfxbook.com/forex-calculators/position-size",
   "rank": 100
  },
  {
   "id": "l-mega",
   "shelf": "other",
   "kind": "folder",
   "title": "Audio K. Trudeau + épisode bonus",
   "desc": "Le dossier MEGA des audios.",
   "url": "https://mega.nz/folder/EQxGVb4D#yHF4a76-uf0-dK7bZ9cU1A",
   "sub": "Liens & outils",
   "rank": 53
  }
 ],
 "notes": {
  "supernova": {
   "title": "Stratégie Supernova",
   "html": "\n<h3>Vocabulaire de base</h3>\n<ul><li><b>SL (Stop Loss)</b> → limite qui protège ton capital</li><li><b>TP (Take Profit)</b> → limite de prise de profit</li><li><b>BE (Break Even)</b> → déplacement du SL au prix d'entrée (sécurité)</li><li><b>CP (Close Partiel)</b> → prendre une partie des profits</li></ul>\n<h3>Système : moyennes mobiles</h3>\n<p><b>Moyennes mobiles court terme</b></p>\n<ul><li>Ligne rouge au-dessus de la ligne bleue → tendance haussière</li><li>Ligne bleue au-dessus de la ligne rouge → tendance baissière</li></ul>\n<p><b>MA200 (ligne orange)</b> → détermine la tendance de fond globale.</p>\n<h3>Les 2 configurations principales</h3>\n<p><b>Étoilées</b></p>\n<ul><li>Étoile rouge → signal de vente / baisse</li><li>Étoile verte → signal d'achat / hausse</li><li>Permettent d'identifier les structures importantes</li><li>Indiquent les SL à positionner sur la mèche (MI)</li></ul>\n<p><b>SELL / BUY confirmé</b></p>\n<ul><li>Configuration validée quand tous les critères sont alignés</li><li>93 % de réussite sur des RR de 1</li></ul>\n<h3>Étapes de la stratégie</h3>\n<ol><li>Attendre la clôture des moyennes mobiles (confirmation de direction)</li><li>Placer l'étiquette sur le graphique (signal d'entrée)</li><li>Prendre position à la clôture du signal</li><li>Placer le SL sur la mèche de l'étoile</li><li>Rechercher un RR ≥ 3 (ratio risque/rendement)</li></ol>\n"
  },
  "propfirm": {
   "title": "Acheter une propfirm",
   "html": "\n<ol>\n<li>Se rendre sur <a href=\"https://www.smartraderfunds.com/fr/\" target=\"_blank\" rel=\"noopener noreferrer\">smartraderfunds.com</a></li>\n<li>Entrer le code de réduction <b>OMNI</b></li>\n<li>Télécharger l'application <b>TradeLocker</b></li>\n<li>Connecter ta propfirm avec l'identifiant et le mot de passe reçus par mail, dans la partie démo de TradeLocker</li>\n</ol>\n<p>Et voilà, tu es prêt à rafler les marchés !</p>\n"
  },
  "pourquoi": {
   "title": "Trouver ton pourquoi",
   "html": "\n<h3>Étape 1 — Comprendre le pourquoi</h3>\n<p>Pour savoir comment l'appliquer, il faut d'abord comprendre pourquoi tu le fais. Trouve ton pourquoi.</p>\n<h3>Étape 2 — Fais une introspection</h3>\n<p>En musique, au calme, comme tu veux. Prends 4 feuilles et un stylo, et remplis le plus possible ces 4 feuilles.</p>\n<p>Une fois remplies, affiche-les sur ton bureau ou sur ton mur : ce sont les raisons pour lesquelles tu te lèves le matin. Tant que tu ne les as pas accomplies, tu ne te laisses pas le choix de t'arrêter.</p>\n<p>Envoie une photo quand c'est fait pour confirmer ton engagement socialement.</p>\n"
  },
  "livres": {
   "title": "Livres à lire par palier",
   "html": "\n<h3>Niveau 0 — développement personnel</h3>\n<ul><li>L'entreprise du 21<sup>e</sup> siècle — Robert Kiyosaki</li><li>Go Pro — Éric Worre</li><li>Comment se faire des amis — Dale Carnegie</li></ul>\n<h3>P300</h3>\n<ul><li>Go Pro — Éric Worre</li><li>Les 4 couleurs de personnalité — Big Al</li></ul>\n<h3>P600</h3>\n<ul><li>45 secondes qui changeront votre vie — Don Failla</li><li>Comment se faire des amis — Dale Carnegie</li><li>Les brise-glace — Big Al</li><li>Comment établir instantanément confiance, crédibilité, influence et connexion — Big Al</li></ul>\n<h3>P1000</h3>\n<ul><li>Vendre — Jordan Belfort</li><li>Les 21 lois irréfutables du leadership — John C. Maxwell</li></ul>\n<h3>P2000</h3>\n<ul><li>Building an Empire — Brian Carruthers</li><li>Comment développer des leaders dans le MLM — Big Al</li><li>Vous² — Price Pritchett</li></ul>\n"
  },
  "autoentreprise": {
   "title": "Ouvrir ton auto-entreprise",
   "html": "\n<p class=\"sc-lead\">Tu as besoin d'un statut légal pour faire de l'UGC et être payé par les marques. Voici comment créer ton auto-entreprise en 15 minutes, gratuitement.</p>\n<h3>Étape 1 — Va sur le bon site officiel</h3>\n<p><a href=\"https://formalites.entreprises.gouv.fr\" target=\"_blank\" rel=\"noopener noreferrer\">formalites.entreprises.gouv.fr</a></p>\n<p><b>Attention :</b> pas d'arnaque, on passe par le site officiel du gouvernement. Pas besoin de payer qui que ce soit !</p>\n<h3>Étape 2 — Clique sur « Créer mon entreprise »</h3>\n<ul><li>Choisis « Entreprise individuelle »</li><li>Puis sélectionne « Micro-entrepreneur »</li></ul>\n<h3>Étape 3 — Remplis ton identité</h3>\n<ul><li>Nom, prénom, adresse, etc.</li><li>Numéro de téléphone et adresse mail valides (tu recevras tout par mail ensuite)</li></ul>\n<h3>Étape 4 — Renseigne ton activité</h3>\n<ul><li>Type d'activité : « Activité commerciale » ou « Prestations de services »</li><li>Détail : par exemple « Création de contenu pour les marques » ou « Vidéo marketing / influence / communication visuelle »</li><li>Code APE souvent attribué : 74.20Z (activités photographiques). Pas grave si c'est un autre, c'est l'administration qui décide à la fin.</li></ul>\n<h3>Étape 5 — Choisis ton régime</h3>\n<ul><li>Régime micro-fiscal simplifié : OUI</li><li>Versement libératoire de l'impôt : si tu gagnes déjà un revenu (salarié, ou étudiant avec revenus) coche OUI, sinon coche NON</li></ul>\n<h3>Étape 6 — Finalise</h3>\n<p>Relis tout, valide et signe électroniquement. Tu recevras ton numéro SIRET par mail sous 8 à 15 jours (parfois moins).</p>\n<h3>Bonus — que faire après ?</h3>\n<p>Une fois ton SIRET reçu, tu peux :</p>\n<ul><li>Créer un compte bancaire dédié (obligatoire si tu dépasses 10 K€ par an)</li><li>T'inscrire sur les plateformes de collaboration avec les marques (Skeepers, Youdji, etc.)</li><li>Émettre des factures légales aux marques (ton statut est OK)</li></ul>\n<p>Si tu bloques à une étape, reviens vers nous. Dans 90 % des cas, tout se fait facilement et en autonomie.</p>\n"
  },
  "ugc-demarrage": {
   "title": "Dossier de démarrage UGC",
   "html": "\n<p>Application et dossier de démarrage UGC (iPhone).</p>\n<h3>Canal</h3>\n<ul><li>OMNI</li><li>DigitalCEO</li><li>UGC</li></ul>\n<h3>Applications</h3>\n<ul><li>JIFU</li><li>Telegram</li><li>Zoom</li><li>Canva</li><li>CapCut</li><li>Youdji</li></ul>\n<h3>DCEO</h3>\n<ul><li>JIFU LIVE UGC</li></ul>\n<p>Le PDF complet est dans le canal Telegram (bouton « Ouvrir dans Telegram »).</p>\n"
  },
  "reseaux": {
   "title": "Formation réseaux sociaux (Morgan)",
   "html": "\n<p class=\"sc-lead\">Objectif réseau : l'utiliser comme un levier.</p>\n<p><b>1<sup>er</sup> conseil :</b> ne pas réfléchir, juste partager un maximum notre vie, sans pression et sans stress, au plus de monde possible.</p>\n<p><b>Personal branding :</b> notre marque de fabrique, précurseur de quelque chose. De consommateur à producteur : l'objectif est d'utiliser les réseaux pour faire de l'argent avec mes réseaux.</p>\n<h3>Stories</h3>\n<ul><li><b>40 % lifestyle</b> → quotidien</li><li><b>40 % plus-value</b> → citations, formation, etc.</li><li><b>20 % business</b> → MEP, résultats, témoignages</li></ul>\n<h3>M-E-P</h3>\n<ul><li><b>Montrer</b> → événements, entraide, évolution, plateforme d'éducation</li><li><b>Expliquer</b> → convaincre de manière indirecte, expliquer de telle sorte qu'un enfant de 10 ans puisse comprendre</li><li><b>Proposer</b> → recruter, appel à l'action, pas souvent</li></ul>\n<p>Les gens doivent : 1) croire, 2) avoir confiance, 3) aimer.</p>\n<h3>Cibler 4 types de personnes</h3>\n<ul><li><b style=\"color:#4d8dff\">Bleu</b> → montrer business et argent, on rigole, fun</li><li><b style=\"color:#33e6a6\">Vert</b> → besoin de faits et de détails</li><li><b style=\"color:#ff4d5e\">Rouge</b> → argent, pouvoir, ego, reconnaissance, édification</li><li><b style=\"color:#e8b339\">Jaune</b> → les rassurer, montrer les success stories et les témoignages</li></ul>\n<p><b>Bio en escalier.</b> Être constant et soi-même : authentique.</p>\n"
  },
  "closing": {
   "title": "Méthodologie de closing",
   "html": "\n<p class=\"sc-lead\">Le closing en entonnoir, en 8 étapes.</p>\n<ol>\n<li>Demande à ton interlocuteur ce qu'il a pensé du projet.</li>\n<li>Ce qu'il a préféré, et pourquoi.</li>\n<li>Reformule de manière ciblée : problèmes → solutions.</li>\n<li>Les Français passent en moyenne 5 h 47 par jour sur les écrans : est-il au-dessus ou en dessous ?</li>\n<li>Fais le constat sur comment optimiser ce temps.</li>\n<li>Réalise un pricing logique et concret.</li>\n<li>Résume point par point la totalité.</li>\n<li>Conclus avec logique et spontanéité sur le paiement / le plan pour commencer.</li>\n</ol>\n"
  }
 },
 "videoSections": [
  {
   "id": "mindset",
   "title": "Mindset",
   "blurb": "Les vidéos YouTube qui font monter en niveau.",
   "icon": "brain"
  },
  {
   "id": "business",
   "title": "Business",
   "blurb": "Toutes les rediffusions, rangées par catégorie.",
   "icon": "play"
  }
 ],
 "videoCats": [
  "Trading",
  "UGC",
  "Marketing",
  "Autres"
 ],
 "videoSeed": [
  {
   "id": "s-wU8i9-MbdWQ",
   "section": "mindset",
   "title": "Ce concept va changer ta vie",
   "speaker": "GESS",
   "url": "https://youtu.be/wU8i9-MbdWQ"
  },
  {
   "id": "s-d4sZy3AChZs",
   "section": "mindset",
   "title": "Ce ne sont pas tes amis",
   "speaker": "Lucas Hof",
   "url": "https://youtu.be/d4sZy3AChZs"
  },
  {
   "id": "s-6xjpusd9EMQ",
   "section": "mindset",
   "title": "Tu vis à 1% de ton potentiel",
   "speaker": "Louis Key",
   "url": "https://youtu.be/6xjpusd9EMQ"
  },
  {
   "id": "s-iba0283havo",
   "section": "mindset",
   "title": "Devenir riche en faisant ce que les autres ne veulent pas faire",
   "speaker": "Lucas Hof",
   "url": "https://youtu.be/iba0283havo"
  },
  {
   "id": "s-7AHz5QoXL9U",
   "section": "mindset",
   "title": "MASTERCLASS CLOSING 🇨🇭",
   "speaker": "BB Vision TV",
   "url": "https://youtu.be/7AHz5QoXL9U"
  },
  {
   "id": "s-QZxD5aotAAo",
   "section": "mindset",
   "title": "90 Jours pour changer votre vie (ERIC WORRE)",
   "speaker": "Chris",
   "url": "https://youtu.be/QZxD5aotAAo"
  },
  {
   "id": "s-b9sc84WGlyw",
   "section": "mindset",
   "title": "HOLTON BUGGS -  CREER UN MOMENTUM EN MLM - VERSION FR",
   "speaker": "MLM FRANCE",
   "url": "https://youtu.be/b9sc84WGlyw"
  },
  {
   "id": "s-LnV_Pz-qejs",
   "section": "mindset",
   "title": "Comment Devenir un Maître en Storytelling ?",
   "speaker": "Oussama Ammar",
   "url": "https://youtu.be/LnV_Pz-qejs"
  },
  {
   "id": "s-iTb4oeGqEBs",
   "section": "mindset",
   "title": "Comment mieux s’exprimer que 99% de la population (3 secrets)",
   "speaker": "Yomi Denzel",
   "url": "https://youtu.be/iTb4oeGqEBs"
  },
  {
   "id": "s-uyyqD2M-71c",
   "section": "mindset",
   "title": "Les 6 Étapes qui m'ont Rendu Millionaire",
   "speaker": "Yomi Denzel",
   "url": "https://youtu.be/uyyqD2M-71c"
  },
  {
   "id": "s-FALDuZ5pPxc",
   "section": "mindset",
   "title": "Comment TikTok a ba*sé le cerveau d'une génération.",
   "speaker": "Léo Duff",
   "url": "https://youtu.be/FALDuZ5pPxc"
  },
  {
   "id": "s-DC82uICmIKI",
   "section": "mindset",
   "title": "Mes 5 Meilleurs Hacks de Cerveau pour la Rentrée",
   "speaker": "Fabien Olicard La deuxième chaîne",
   "url": "https://youtu.be/DC82uICmIKI"
  },
  {
   "id": "s-rtZVRjrT0mQ",
   "section": "mindset",
   "title": "J’ai testé le COPY TRADING pendant 300 JOURS (trackrecord à l’appuie)",
   "speaker": "BananaFX",
   "url": "https://youtu.be/rtZVRjrT0mQ"
  },
  {
   "id": "s-Hq5qkU2KH_c",
   "section": "mindset",
   "title": "La série d’influenceurs qui continue d’arnaquer des familles depuis Dubaï",
   "speaker": "Kylian Khalifa",
   "url": "https://youtu.be/Hq5qkU2KH_c"
  },
  {
   "id": "s-AiEzzV1fT_4",
   "section": "mindset",
   "title": "Comment VENDRE ce fameux STYLO (et n’importe quoi) comme un PRO",
   "speaker": "Shannen Louiz Boutaleb - SforSales",
   "url": "https://youtu.be/AiEzzV1fT_4"
  },
  {
   "id": "s-f5_WjcFEis0",
   "section": "mindset",
   "title": "Sans Permission PIRATÉ : Déclin de la France, Squatters et Business Physiques - Feat Hakim Benotmane",
   "speaker": "Sans Permission",
   "url": "https://youtu.be/f5_WjcFEis0"
  },
  {
   "id": "s-Eim_JRVLdIQ",
   "section": "mindset",
   "title": "J'ai gagné 100 000€ en 4 heures (et ça m'a ruiné)",
   "speaker": "Dali Dutilleul",
   "url": "https://youtu.be/Eim_JRVLdIQ"
  },
  {
   "id": "s-zdtoc2DVHDw",
   "section": "mindset",
   "title": "La TECHNIQUE de VENTE pour contrer l'objection \"JE DOIS Y RÉFLÉCHIR\" (Formation Closing)",
   "speaker": "Bastien Pelissier",
   "url": "https://youtu.be/zdtoc2DVHDw"
  },
  {
   "id": "s-Yekk5PKaR-k",
   "section": "mindset",
   "title": "SPARTIATES CIRCLE EP.1",
   "speaker": "RetiredYoung",
   "url": "https://youtu.be/Yekk5PKaR-k"
  },
  {
   "id": "s-xz-ymFOhBAE",
   "section": "mindset",
   "title": "“It took me 50+ years to realize what I’ll tell you in 69 minutes” — Tony Robbins",
   "speaker": "Tony Robbins",
   "url": "https://youtu.be/xz-ymFOhBAE"
  },
  {
   "id": "s-j0h05sVWoIY",
   "section": "mindset",
   "title": "Rising Star Alex Morton - NMPRO #973",
   "speaker": "Eric Worre - Network Marketing Pro",
   "url": "https://youtu.be/j0h05sVWoIY"
  },
  {
   "id": "s-WyNi8Lm5kQw",
   "section": "mindset",
   "title": "How Alex Morton Rose from the Depths of Failure to the Height of Success",
   "speaker": "Eric Worre - Network Marketing Pro",
   "url": "https://youtu.be/WyNi8Lm5kQw"
  },
  {
   "id": "s-Fn17-ShhG60",
   "section": "mindset",
   "title": "Comment parler à n'importe qui, d'après un ancien timide.",
   "speaker": "Charlie Haid",
   "url": "https://youtu.be/Fn17-ShhG60"
  },
  {
   "id": "s-pl-rediff",
   "section": "mindset",
   "title": "Playlist — toutes les rediffusions (M.O.B.)",
   "speaker": "",
   "url": "https://www.youtube.com/playlist?list=PL5gDllQpzJ4xl2CA05XcD4K6e9Wqb28g2"
  },
  {
   "id": "s-pl-mastermind",
   "section": "mindset",
   "title": "Playlist — vidéos de mastermind et de formations",
   "speaker": "",
   "url": "https://youtube.com/playlist?list=PLX3rHoVYoM5rVVPPtlGsoRAkiSsfC9bvX"
  },
  {
   "id": "s-pl-ressources",
   "section": "mindset",
   "title": "Playlist — ressources",
   "speaker": "",
   "url": "https://youtube.com/playlist?list=PLcXG0z0tubZR1OBjR0pTeYvGwfTYe89BA"
  },
  {
   "id": "s-pl-closing",
   "section": "mindset",
   "title": "Bootcamp Closing — playlist M.O.B.",
   "speaker": "M.O.B.",
   "url": "https://www.youtube.com/playlist?list=PL5gDllQpzJ4wUIVgo7HbZEJYLgmNfFOS7"
  }
 ],
 "videoPending": [
  {
   "id": "r01",
   "section": "business",
   "cat": "Autres",
   "title": "RANK UP — 12/08 — DEAN",
   "duration": "34:56",
   "url": "",
   "pending": true
  },
  {
   "id": "r02",
   "section": "business",
   "cat": "Autres",
   "title": "GREG X HUGO",
   "duration": "51:13",
   "url": "",
   "pending": true
  },
  {
   "id": "r03",
   "section": "business",
   "cat": "Autres",
   "title": "ULC 17/08",
   "duration": "47:32",
   "url": "",
   "pending": true
  },
  {
   "id": "r04",
   "section": "business",
   "cat": "Autres",
   "title": "RANK UP PARTIE III — MICKY — 19/08",
   "duration": "52:41",
   "url": "",
   "pending": true
  },
  {
   "id": "r05",
   "section": "business",
   "cat": "Autres",
   "title": "RANK UP PARTIE IV — ANISSA — 21/08",
   "duration": "48:13",
   "url": "",
   "pending": true
  },
  {
   "id": "r06",
   "section": "business",
   "cat": "Trading",
   "title": "Morgan — Patrimoine",
   "duration": "39:35",
   "url": "",
   "pending": true
  },
  {
   "id": "r07",
   "section": "business",
   "cat": "Trading",
   "title": "KURTIS COBAIN — Crypto LIFE",
   "duration": "35:31",
   "url": "",
   "pending": true
  },
  {
   "id": "r08",
   "section": "business",
   "cat": "Autres",
   "title": "10+ CALL — 31 Août",
   "duration": "37:43",
   "url": "",
   "pending": true
  },
  {
   "id": "r09",
   "section": "business",
   "cat": "Trading",
   "title": "INVEST MODE — MORGAN / BASTIAN / ABDEL",
   "duration": "41:48",
   "url": "",
   "pending": true
  },
  {
   "id": "r10",
   "section": "business",
   "cat": "Autres",
   "title": "Rediffusion sans titre (44:40)",
   "duration": "44:40",
   "url": "",
   "pending": true
  },
  {
   "id": "r11",
   "section": "business",
   "cat": "Autres",
   "title": "WIN — EDWIN — 18/09",
   "duration": "42:12",
   "url": "",
   "pending": true
  },
  {
   "id": "r12",
   "section": "business",
   "cat": "Autres",
   "title": "REDIFFUSION PRÉSENTATION DEAN 29/09",
   "duration": "28:47",
   "url": "",
   "pending": true
  },
  {
   "id": "r13",
   "section": "business",
   "cat": "Marketing",
   "title": "REDIFF VIRAL N1",
   "duration": "43:16",
   "url": "",
   "pending": true
  },
  {
   "id": "r14",
   "section": "business",
   "cat": "Autres",
   "title": "SUBCONSCIOUS — MICKY — 2/10",
   "duration": "41:57",
   "url": "",
   "pending": true
  },
  {
   "id": "r15",
   "section": "business",
   "cat": "Marketing",
   "title": "REDIFF VIRAL N2",
   "duration": "43:03",
   "url": "",
   "pending": true
  },
  {
   "id": "r16",
   "section": "business",
   "cat": "Autres",
   "title": "GAME PLAN ARP — TOM — 9/10",
   "duration": "31:10",
   "url": "",
   "pending": true
  },
  {
   "id": "r17",
   "section": "business",
   "cat": "Trading",
   "title": "« SYSTEM » — BASTIAN — 9/10",
   "duration": "40:36",
   "url": "",
   "pending": true
  },
  {
   "id": "r18",
   "section": "business",
   "cat": "Autres",
   "title": "THIS IS OMNI — 05/10 — MORGAN",
   "duration": "55:50",
   "url": "",
   "pending": true
  },
  {
   "id": "r19",
   "section": "business",
   "cat": "Autres",
   "title": "FAMILY OVER PROFIT",
   "duration": "54:41",
   "url": "",
   "pending": true
  },
  {
   "id": "r20",
   "section": "business",
   "cat": "Autres",
   "title": "LEADERSHIP — GREG — 19/10",
   "duration": "50:29",
   "url": "",
   "pending": true
  },
  {
   "id": "r21",
   "section": "business",
   "cat": "Autres",
   "title": "L'ABC du succès DCEO — Anissa, Bastian, Ethan",
   "duration": "59:13",
   "url": "",
   "pending": true
  },
  {
   "id": "r22",
   "section": "business",
   "cat": "Autres",
   "title": "« THE CLASH » — KELLY X BASTIAN X MAXIME",
   "duration": "53:05",
   "url": "",
   "pending": true
  },
  {
   "id": "r23",
   "section": "business",
   "cat": "Marketing",
   "title": "« INFLUENT » by DEAN — 6/11",
   "duration": "55:42",
   "url": "",
   "pending": true
  },
  {
   "id": "r24",
   "section": "business",
   "cat": "Autres",
   "title": "DDT — 28/11",
   "duration": "57:57",
   "url": "",
   "pending": true
  },
  {
   "id": "r25",
   "section": "business",
   "cat": "Autres",
   "title": "MVP — 30/10",
   "duration": "59:53",
   "url": "",
   "pending": true
  },
  {
   "id": "r26",
   "section": "business",
   "cat": "Autres",
   "title": "LEADERSHIP by HUGO — 02/11",
   "duration": "52:53",
   "url": "",
   "pending": true
  },
  {
   "id": "r27",
   "section": "business",
   "cat": "Autres",
   "title": "SECURE THE BAG — ABDEL X HUGO — 13/11",
   "duration": "39:11",
   "url": "",
   "pending": true
  },
  {
   "id": "r28",
   "section": "business",
   "cat": "Autres",
   "title": "Rediffusion sans titre (50:47)",
   "duration": "50:47",
   "url": "",
   "pending": true
  },
  {
   "id": "r29",
   "section": "business",
   "cat": "Autres",
   "title": "PASSING THE TORCH — Ethan Tiago",
   "duration": "34:55",
   "url": "",
   "pending": true
  },
  {
   "id": "r30",
   "section": "business",
   "cat": "Autres",
   "title": "GUILLAUME PLAS — BACKGROUND",
   "duration": "1:26:47",
   "url": "",
   "pending": true
  },
  {
   "id": "r31",
   "section": "business",
   "cat": "Marketing",
   "title": "SHOW IT — Micky",
   "duration": "51:51",
   "url": "",
   "pending": true
  },
  {
   "id": "r32",
   "section": "business",
   "cat": "UGC",
   "title": "PROSPECTION — Kelly",
   "duration": "56:06",
   "url": "",
   "pending": true
  },
  {
   "id": "r33",
   "section": "business",
   "cat": "Autres",
   "title": "Résolution — Swann 04/12/2025",
   "duration": "27:21",
   "url": "",
   "pending": true
  },
  {
   "id": "r34",
   "section": "business",
   "cat": "Trading",
   "title": "WOLF X — RAMI — 9/12",
   "duration": "45:27",
   "url": "",
   "pending": true
  },
  {
   "id": "r35",
   "section": "business",
   "cat": "Trading",
   "title": "NOT FINANCIAL ADVICE — THEO",
   "duration": "1:01:06",
   "url": "",
   "pending": true
  },
  {
   "id": "r36",
   "section": "business",
   "cat": "Autres",
   "title": "PERSONAL MASTERY — GREG — 7/12",
   "duration": "57:21",
   "url": "",
   "pending": true
  },
  {
   "id": "r37",
   "section": "business",
   "cat": "Marketing",
   "title": "STORY TELLING — HUGO",
   "duration": "58:23",
   "url": "",
   "pending": true
  },
  {
   "id": "r38",
   "section": "business",
   "cat": "Autres",
   "title": "THE DECISION — SWANN",
   "duration": "40:41",
   "url": "",
   "pending": true
  },
  {
   "id": "r39",
   "section": "business",
   "cat": "Autres",
   "title": "2026 — ERIC",
   "duration": "43:32",
   "url": "",
   "pending": true
  },
  {
   "id": "r40",
   "section": "business",
   "cat": "Marketing",
   "title": "COCKTAIL MARKETING — ANISSA x CAMILLE",
   "duration": "52:50",
   "url": "",
   "pending": true
  },
  {
   "id": "r41",
   "section": "business",
   "cat": "Autres",
   "title": "THE LAST DANCE — GUILLAUME x HUGO",
   "duration": "1:00:34",
   "url": "",
   "pending": true
  },
  {
   "id": "r42",
   "section": "business",
   "cat": "Autres",
   "title": "SOUK AUX QUESTIONS — MORGAN",
   "duration": "53:35",
   "url": "",
   "pending": true
  },
  {
   "id": "r43",
   "section": "business",
   "cat": "Autres",
   "title": "REDIFFUSION MATT ROSA x MORGAN — 7/01",
   "duration": "48:29",
   "url": "",
   "pending": true
  },
  {
   "id": "r44",
   "section": "business",
   "cat": "Autres",
   "title": "NEW EVOLUTION OF WINNERS — SWANN x ETHAN",
   "duration": "45:49",
   "url": "",
   "pending": true
  },
  {
   "id": "r45",
   "section": "business",
   "cat": "Autres",
   "title": "Hugo Sanchez — Le Cercle du Succès 22.02.26",
   "duration": "45:56",
   "url": "",
   "pending": true
  },
  {
   "id": "r46",
   "section": "business",
   "cat": "Trading",
   "title": "Ethan Kryptonite 10/02/2025",
   "duration": "37:07",
   "url": "",
   "pending": true
  },
  {
   "id": "r47",
   "section": "business",
   "cat": "Autres",
   "title": "ATMOSPHERE SWANN X ETHAN 24/02/2026",
   "duration": "45:56",
   "url": "",
   "pending": true
  },
  {
   "id": "r48",
   "section": "business",
   "cat": "Autres",
   "title": "P.R.O.T.O.C.O.L.E by Ethan — reprogrammer son cerveau",
   "duration": "41:58",
   "url": "",
   "pending": true
  }
 ]
};
