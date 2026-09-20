# CHEST — mise à niveau visuelle

Trois fichiers à déposer dans le dépôt `2sw0ne/STASH`, branche `main`.

## 1. Où déposer quoi

| Fichier du zip | Destination dans le dépôt |
| --- | --- |
| `patch-chest-da.css` | `site/css/patch-chest-da.css` |
| `chest-ui.js` | `site/js/chest-ui.js` |
| `signup.html` | `site/signup.html` (remplace l'existant) |

## 2. Deux lignes à ajouter dans chaque page

Dans **toutes** les pages qui ont déjà `chest-da.css` — c'est-à-dire
`dashboard.html`, `backtesting.html`, `journal.html`, `strategies.html`,
`calendar.html`, `berich.html`, `account.html`, `admin-members.html`,
`backtest-add.html`, `backtest-view.html`, `strategy-example.html` :

Dans le `<head>`, **après** la ligne `chest-da.css` :

    <link rel="stylesheet" href="css/patch-chest-da.css?v=3">

En bas de page, **après** la ligne `nav.js` :

    <script src="js/chest-ui.js?v=1"></script>

`login.html`, `signup.html` et `index.html` n'en ont pas besoin : ces pages
sont autonomes et déjà à jour.

## 3. Ce que ça change

**Corrections de fond**

- **La lueur du curseur ne fonctionnait pas du tout.** Les éléments
  `#heroSpot`/`#heroGlow` existent dans le HTML et le CSS lit
  `var(--mx)/var(--my)`, mais aucun script ne les mettait à jour.
  `chest-ui.js` apporte ce chaînon manquant. Son masque est aussi corrigé :
  il s'arrêtait à 57 %, la lueur mourait dès les KPI au lieu de couvrir la
  courbe d'equity.
- **La flèche du volet flottait dans le vide** : le fond de son SVG était
  semi-transparent, sans le `backdrop-filter` de la sidebar, donc elle ne
  se raccordait pas. Fond opaque + filet de raccord.
- **Titres en dégradé rognés** : le bas du « g » de Stratégie et la barre
  du « % » étaient coupés par `background-clip:text`.
- **Lueur d'ambiance** qui provoquait une barre de défilement horizontale.

**Stratégies**

Barre de contrôle sortie de sa carte, posée sur le même plan avec des
filets verticaux. Scanner affiché en 19 px avec son logo nu. Marché et
paire en texte plutôt qu'en `<select>` encadrés. Unité de temps en
pilules. Graphique en fenêtre liquid glass, pleine largeur.

**BERICH**

Barre de connexion en bandeau. Bloc du signal et graphique en fenêtres
liquid glass. Entrée / SL / TP en colonnes à filets, valeurs en 24 px avec
halos rouge et vert. Sélecteur de risque en pilules. Historique en liste.

**Calendrier**

Bulles du jour en mini-fenêtres verre avec soulèvement au survol.
Tableaux du jour et des prochains jours en liquid glass. Prévu | Réel en
colonnes à filets. Filtre d'importance et navigateur de jour alignés sur
la DA. Repère « maintenant » en rose.

**Écrans de transition** (jamais adaptés jusqu'ici)

Assistant BERICH (broker puis installation de l'EA), ajout de compte
Myfxbook du Dashboard, modales, verrou d'accès, formulaires. Tuiles de
choix avec survol dégradé, fil d'étapes à accent rose→orange, champs
cerclés de rose au focus, boutons hérités alignés.

**signup.html**

Réécrite. Elle utilisait encore l'ancien `.gate` gris alors que
`login.html` avait déjà la photo pleine page et la carte en verre. Même
traitement désormais : photo, scrim, carte translucide, logo lumineux en
débord, champs à icônes, bouton dégradé. Le JavaScript et les
identifiants sont inchangés — `CHESTAccounts.signup()` fonctionne à
l'identique.

**Générique**

Tableaux, onglets, zones de dépôt de fichier, sélecteurs, cases à cocher,
barres de progression et `.card` restées en fond plat : alignés sur la DA
sur l'ensemble du site, ce qui couvre Journal, Compte, l'import et le
rapport de backtest sans toucher à leur balisage.

## 4. Ce qui n'est pas touché

Aucun fichier JavaScript existant n'est modifié. Aucun identifiant, aucune
classe utilisée par le JS n'est renommé. Les appels API, les stores
locaux, Myfxbook, Twelve Data, les scanners et l'EA fonctionnent à
l'identique. `chest-ui.js` n'ajoute que des effets de présentation.

## 5. Référence

- `CHEST-DA.md` — la direction artistique écrite.
- `CHEST App.dc.html` — la maquette navigable des neuf écrans.
- `CHEST DA.dc.html` — la planche de tous les composants.
