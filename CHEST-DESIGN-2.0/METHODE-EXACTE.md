# Reproduire les maquettes à l'identique

Pourquoi une copie « moins bonne » : quand on demande d'« appliquer une DA », l'outil
reconstruit chaque élément de mémoire et arrondit (une ombre en moins, un 26 px qui
devient 24, un dégradé simplifié), puis il ne compare jamais son résultat au modèle.
Ce dossier supprime les deux causes :

1. **`html-exact/`** : chaque page de la maquette en HTML statique, exactement tel qu'il
   s'affiche (styles en ligne, valeurs exactes, aucune dépendance). On **copie** ce
   balisage, on ne le réinterprète pas.
2. **`outils/comparer.mjs`** : capture la page du site, la compare pixel par pixel à
   `captures/<Page>.png` et produit `ecart.png` (les différences en rouge). On corrige
   jusqu'à ce que l'écart soit faible.

Vérifié : chaque fichier de `html-exact/` donne 0,00 % d'écart avec sa capture.

---

## Méthode, page par page (à suivre dans cet ordre)

1. **Ouvrir les deux références** : `captures/<Page>.png` et `html-exact/<Page>.html`
   (servir le dossier : `cd html-exact && python3 -m http.server 8090`).
2. **Copier le balisage tel quel.** Prendre le bloc de la page dans `html-exact/<Page>.html`
   (tout ce qui est dans `<main>`, ou le menu pour le shell) et le coller dans le gabarit
   du site, **sans changer une seule valeur de style**. Les styles en ligne restent en
   ligne, ou passent dans une classe qui contient **exactement** les mêmes déclarations.
   Le bloc `<style>` en tête de `html-exact/<Page>.html` (survols, menu, responsive) va
   dans le CSS de la page.
3. **Brancher les données réelles** : remplacer les textes d'exemple (« 100 740 $ »,
   « XAU/USD », listes de trades…) par les valeurs que les scripts actuels calculent
   déjà. Garder les `id`, `data-*` et écouteurs dont le JS existant a besoin, en les
   ajoutant sur les nouveaux éléments. Les listes répétées (lignes, cartes, livres) sont
   générées par le JS existant avec **le même balisage** qu'une ligne de la maquette.
4. **Comparer** :
   ```bash
   npm i -D playwright && npx playwright install chromium   # une seule fois
   (cd site && python3 _dev_server.py)                       # le site en local, port 8934
   node CHEST-DESIGN-2.0/outils/comparer.mjs http://localhost:8934/dashboard CHEST-DESIGN-2.0/captures/Main.png --connecte --sortie comparaison/dashboard
   ```
   Ouvrir `comparaison/dashboard/ecart.png`. Le dossier `comparaison/` ne se commite pas.
5. **Corriger les zones rouges qui ne sont pas des données** (alignements, tailles,
   couleurs, espacements, ombres) et relancer l'étape 4. Les chiffres et textes réels
   diffèrent forcément de l'exemple : c'est normal qu'ils ressortent en rouge. Les
   blocs, bordures, fonds et positions, eux, doivent disparaître de l'écart.
6. **Montrer** `cote-a-cote.png` à l'utilisateur avant de passer à la page suivante.

Correspondance pages ↔ captures ↔ adresses :

| Page du site | Adresse locale | Capture | HTML exact |
| --- | --- | --- | --- |
| dashboard.html | `/dashboard` | `captures/Main.png` | `html-exact/Main.html` |
| calendar.html | `/calendar` | `captures/Calendrier.png` | `html-exact/Calendrier.html` |
| backtesting.html | `/backtesting` | `captures/Backtesting.png` | `html-exact/Backtesting.html` |
| journal.html | `/journal?acc=…` | `captures/Journal.png` | `html-exact/Journal.html` |
| strategies.html | `/strategies` | `captures/Strategies.png` | `html-exact/Strategies.html` |
| berich.html | `/berich` | `captures/Berich.png` | `html-exact/Berich.html` |
| school.html | `/school` | `captures/School.png` | `html-exact/School.html` |
| account.html | `/account` | `captures/Compte.png` | `html-exact/Compte.html` |
| educator.html | `/educator` | `captures/Educateur.png` | `html-exact/Educateur.html` |
| admin-members.html | `/admin-members` | `captures/Admin.png` | `html-exact/Admin.html` |
| offres.html | `/offres` | `captures/Offres.png` | `html-exact/Offres.html` |
| connexion (login.html) | `/connexion` | `captures/Connexion.png` | `html-exact/Connexion.html` |
| inscription (signup.html) | `/inscription` | `captures/T-Inscription.png` | `html-exact/T-Inscription.html` |
| Welcome (app.html) | `/` après connexion | `captures/T-Welcome.png` | `html-exact/T-Welcome.html` |
| invitation (join.html) | `/rejoindre/CODE` | `captures/T-Rejoindre.png` | `html-exact/T-Rejoindre.html` |

Les autres planches (vues Admin, volets éducateur, fenêtres et étapes) se comparent sur la même page du site une fois la vue ouverte : voir les tableaux de `INTEGRATION.md`. Pour le fond aurore, l'écart sera forcément visible (animation) : comparer seulement la carte et les textes.

## Pièges qui font perdre la ressemblance

- **Polices** : charger Instrument Sans (400/500/600/700) **et** JetBrains Mono
  (400/500/600) depuis Google Fonts, sinon tout le texte bouge.
- **Les anciennes règles CSS gagnent** : `chest-da.css`, `patch-chest-da.css` et `v2.css`
  ont des sélecteurs plus forts (et des `!important`). Vérifier dans les outils du
  navigateur qu'aucune ancienne règle n'écrase un style copié ; neutraliser l'ancienne
  règle plutôt que d'« ajuster » la nouvelle valeur.
- **Le shell** : le menu et la barre du haut vivent dans `app.html`, la page dans
  l'iframe `#chestView` (`html.is-embedded`). Les marges de la page embarquée doivent
  reprendre celles de la maquette (contenu `padding:34px 36px`, largeur max 1180 px).
- **Pas de simplification** : garder les doubles ombres, les liserés `::after`, les
  `mask-image` des courbes, les `text-shadow` des chiffres, le grain, `font-variant-numeric`.
- **Couleur des étiquettes** : `#7A7A82` partout (plus `#5C5C63`).

## Consigne à copier dans Claude Code

> Applique la refonte CHEST 2.0 en suivant `CHEST-DESIGN-2.0/METHODE-EXACTE.md` à la lettre.
> Page par page : copie le balisage et les styles de `CHEST-DESIGN-2.0/html-exact/<Page>.html`
> **sans modifier aucune valeur** (tailles, couleurs, ombres, espacements), branche les
> données réelles déjà calculées par le JS existant, puis lance `outils/comparer.mjs` contre
> `captures/<Page>.png` et corrige tant que des zones de mise en page ressortent en rouge
> dans `ecart.png`. Ne réinvente aucun style, ne simplifie rien. Respecte `CLAUDE.md`
> (`?v=`, fichiers interdits). Montre-moi `cote-a-cote.png` à la fin de chaque page avant
> de passer à la suivante. Commence par le menu (app.html), puis le Dashboard.
