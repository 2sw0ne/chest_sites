# CHEST — brief court (chargé à chaque échange : le garder court)

**L'historique complet** (chaque décision, bug, itération, avec dates) est dans `docs/HISTORIQUE.md`.
Ne pas le lire en entier : y chercher la section utile avec `grep -n "^## " docs/HISTORIQUE.md` puis lire seulement cette section.
**Règle** : une nouvelle décision importante = 1 à 3 lignes ici ; le récit détaillé va dans `docs/HISTORIQUE.md`.

## Projet
Plateforme de trading CHEST (ch3st.app), accès privé payant. Site statique HTML/CSS/JS sans build (`site/`), un shell `app.html` qui charge chaque page dans l'iframe `#chestView`. Services Railway (projet `just-beauty`) : `accounts-bridge` (Flask/SQLite, comptes, accès, Stripe, admin, sync, push), `calendar-bridge`, `berich-bridge`, `scanner-server` (Node, Vela/PineTS, volet Force du marché). Site sur Vercel (racine `site/`).

## Déploiement
- Travail sur la branche `v2` de ce worktree. Commit puis `git push origin v2:main` (STASH, historique) **et** `git push chest-sites v2:main` (déclenche Railway + Vercel). Si origin a avancé : `git fetch` + merge, jamais de force-push.
- `?v=` à incrémenter à chaque modif d'un CSS/JS (`accounts-auth.js?v=7`, `config.js?v=5`, `admin-members.css/js?v=2`…). Attention : un `sed` sur `chest-da.css?v=N` touche aussi `patch-chest-da.css?v=N`.
- `scanner-server/Dockerfile` copie les fichiers un par un : tout nouveau `.mjs` doit y être ajouté.
- Scripts Pine : jamais commités ; mis en ligne par `POST /scanners/restore` (admin). Source : `Trading/scanner off/`.

## Sécurité (non négociable)
- Ne jamais tester inscription/connexion contre la vraie base : base jetable seulement (`RAILWAY_VOLUME_MOUNT_PATH=<dossier temporaire>` + `python accounts-bridge/server.py`).
- Ne jamais commiter de secret (`scanners_secret.json`, clés Twelve Data, clé VAPID privée, `config.local.js`, `STRIPE_WEBHOOK_SECRET`). `chest_sites` est public.
- Ne jamais répéter d'identifiants de test dans le chat ; l'utilisateur ne colle pas de jeton admin dans le chat.
- Ne jamais toucher `projects/chesting` (autre checkout) pour les vidéos chest-motion.
- Audit 2026-10-24 : mots de passe externes (Myfxbook, broker BERICH) jamais synchronisés (`sync-store.js` : retirés à l'envoi, coffre local `chest_vault`, purge serveur au démarrage) ; limite d'essais sur `/login`, `/signup`, `/me/password` ; en-têtes de sécurité dans `site/vercel.json` ; `/debug/*` du calendrier fermés (variable `CALENDAR_DEBUG=1`) ; toujours `esc()` sur une donnée venant d'un autre membre.
- Ne jamais réécrire `site/support.js`, `site/allin-engine.js`, `backtesting-swyper.html`, `backtesting-allin.html`.

## Architecture du site (l'essentiel)
- `js/theme.js` en tête de chaque page (iframe → `html.is-embedded`, page à nu → redirection), `js/shell.js` (table `PAGES`, routage par chemin), `js/nav.js`, `js/accounts-auth.js` (`CHESTAccounts`), `js/sync-store.js` (synchro par clés : nouvelle clé membre → `SYNCED_KEYS`, clé d'appareil → `DEVICE_KEYS`).
- **Ajouter une page** : le `.html`, `PAGES` (shell.js), `APP_PAGES` (theme.js), lien sidebar, et la liste `:page(...)` de `site/vercel.json`.
- Adresses propres : `/connexion`, `/welcome`, `/inscription`, `/offres`, `/<page>` (réécritures `vercel.json`, relues par `_dev_server.py`).
- Connexion intégrée à `app.html` (un seul document du login au dashboard). Tout script d'`app.html` qui lit l'état connecté doit pouvoir être rappelé après la connexion.
- Synchro (`sync-store.js`) : rien n'est envoyé avant que la lecture du serveur de la page ait abouti ; jamais de contenu remplacé par du vide (serveur vide → la locale est renvoyée) ; clé jamais synchronisée ici → valeur du serveur ; rechargement unique à la première réception. Serveur : `user_data_history` (30 versions par donnée), `GET /sync/history`, `POST /sync/restore`, rubrique Compte → Sauvegardes.
- **Mode de fonctionnement** (admin → onglet Système, `GET/PUT /ops`) : normal / eco (calendrier 1×/jour, sans relecture après annonce) / off (plus de tâches de fond : calendrier, alarmes scanners, Force du marché) ; pages en maintenance = écran `#chestMaint` du shell pour les membres (admins : pastille). Services relisent `/ops` toutes les 5 min (`ACCOUNTS_BRIDGE_URL` / `ACCOUNTS_INTERNAL_URL`).
- Toute nouvelle table liée à un membre → l'ajouter à `POST /members/<id>/delete`. Toute route PUT/PATCH/DELETE passe le CORS.

## Accès payant
- Offres : Essentiel 99,98 €/mois ou 1 000 €/an ; Premium 299,98 €/mois ou 3 000 €/an ; Allstar 9 999,98 €/an (affiché « Bientôt ») ; essai 7 j (données sur l'appareil). `offres.html` + questionnaire 5 questions. Liens Stripe dans `config.js` ; offre déduite du montant (`PLAN_AMOUNTS`) dans le webhook signé `/billing/webhook`.
- `users.plan` none|trial|essentiel|premium|allstar|offert (« Privilège ») ; `users.role` member|educator|manager (admin = `is_admin` ; « Manageur » = `is_admin` + role manager : pouvoirs admin et accès illimité, sans HQ `data-owner-only`, aucun pouvoir sur un admin principal — `guard_principal` ; variable Railway `MANAGER_EMAILS` = nommés Manageur au démarrage) ; un éducateur a tout sans abonnement. `access_of(row)`, `approved_user()` exige un accès actif. School/BERICH verrouillés hors Premium (`js/plan-gate.js`).
- **Entrées admin** (`data-admin-only`, rendues visibles par `CHESTNav.refreshAdminVisibility`) : item « Admin » en dégradé orange→jaune dans la sidebar, case « HQ » pleine hauteur collée au bord droit de la topbar (mini aurore pixelisée rose #fc1283 → orange #f9a45e, grille 32×14, `js/hq.js`, ouvre le QG local par `chesthq://ouvrir`, bulle d'aide sinon ; `data-url` = version en ligne de secours), Compte à sa gauche.
- **Programme éducateur** (`educator.html`, `js/educator.js`, `css/educator.css` ; icône `data-educator-only` à gauche de Compte) : lien `/inscription?ref=CODE` (`edu_invites`, généré dans Admin → Éducateurs) → `users.referred_by` ; commission = taux (`users.commission_rate`, 1/3 par défaut) × paiements encaissés (`member_sales` : `invoice.paid`, sinon checkout payé) ; portefeuille = affichage indicatif (gagné − versé − en attente) ; retraits ≥ 50 € (`edu_payouts`, coordonnées `edu_payout_info`, IBAN vérifié mod 97) traités par l'admin/HQ (`GET /admin/payouts`, `POST /admin/payouts/<id>`).
- **Admin `admin-members.html`** : 4 vues (Vue d'ensemble, Membres + volet latéral, Rangs, Engagement), `/admin/stats?days=`, `POST /members/<id>/role|access` (`until` = date précise, 21:59 UTC). Badges provisoires dans `TIERS` (`js/admin-members.js`).
- Reste côté utilisateur : redirection des liens Stripe vers `/offres?paiement=ok`, webhook + `STRIPE_WEBHOOK_SECRET` sur Railway, lien du portail client, CGV ; promesse « ×2 garanti » (Allstar) à faire valider.

## DA CHEST (obligatoire pour toute nouvelle fenêtre/page)
Fond `#050505`, encres `#f6f6f7`/`#9b9ba1`/`#5c5c63`, accent `#fc1283 → #f9a45e`, vert `#33e6a6`, rouge `#ff4d5e`, ambre `#e8b339`, Instrument Sans, chiffres tabulaires. Fenêtres en verre (bordure blanche 12-14 %, rayon 16-20, flou), étiquettes « 01 — Titre » 10px/.24em, champs 42px rayon 12 avec anneau rose au focus, `.chest-btn` / `.chest-btn-2` / `.chest-seg`. Mouvement court (.2s, `cubic-bezier(.16,1,.3,1)`), `prefers-reduced-motion`. Pas d'emoji comme icône ni drapeau (SVG / flag-icons). Sources : `site/css/chest-da.css`, `patch-chest-da.css`, `v2.css`.

## Pièges fréquents
- `[hidden]` perd contre une règle `display:flex` de même spécificité : ajouter `.x[hidden]{display:none}`.
- Panneau du navigateur masqué : ni `requestAnimationFrame`, ni transitions, ni Vela ne tournent ; captures parfois périmées. Préférer les vérifications par JS / texte.
- Myfxbook : `profit` de l'historique est déjà net (ne pas rajouter commission/swap) ; session liée à l'IP (pas de relais serveur).
- `init_db()` sans `row_factory` : `PRAGMA table_info` se lit `r[1]`.
- Python : vérifier avec `python -m py_compile`, pas `ast.parse`.

## Méthode (économie de tokens, demande utilisateur du 2026-10-19)
- Modifs ciblées (`Edit`, petits scripts) plutôt que réécrire un fichier entier.
- Vérifier par JS/texte ; captures d'écran rares et à échelle réduite ; une seule passe de vérification à la fin.
- Pas de relecture de gros fichiers entiers : `grep -n` puis lecture de la zone utile.
