# CHEST — Direction artistique

Référence unique pour appliquer la DA au site réel. Toutes les valeurs ci-dessous
sont celles employées dans la maquette `CHEST DA.dc.html`. Rien n'est approximatif :
reprendre les nombres tels quels.

Fichier CSS prêt à brancher : `css/chest-da.css` (variables + classes utilitaires).

---

## 1. Principes

1. **Un seul fond** : noir `#050505`. Pas de deuxième couleur de fond.
2. **Une seule source de lumière** : le dégradé de marque rose → orange
   (`#FC1283` → `#F9A45E`). Il signale ce qui est actif, vivant ou à valider.
   Jamais en aplat de fond sur de grandes surfaces.
3. **Trois niveaux de surface**, pas quatre : fond, voile `rgba(255,255,255,.025)`,
   voile appuyé `rgba(255,255,255,.055)`.
4. **Les chiffres sont de la typo d'affiche.** Un seul chiffre héros par écran,
   tout le reste redescend en hiérarchie.
5. **Pas de carte par bloc.** Sur une page, les blocs de même niveau vivent sur
   la même surface et se séparent par un filet 1px. Une seule chose passe dans une
   « fenêtre » : le contenu dense (graphique, tableau). Voir §6.
6. **Zéro emoji, zéro icône pleine.** Icônes en trait (stroke 1.6–1.7), drapeaux
   réels via `flag-icons`, logos réels depuis `assets/`.
7. Grille de 4px. Rayons : `12` (petit), `16` (bloc), `18` (fenêtre), `20` (page),
   `999` (pilule). Aucune ombre portée sauf pour porter l'accent.

---

## 2. Couleurs

| Rôle | Valeur |
| --- | --- |
| Fond | `#050505` |
| Fond de page (carte pleine page) | `rgba(8,8,10,.72)` + `backdrop-filter: blur(30px) saturate(1.2)` |
| Surface 1 | `rgba(255,255,255,.025)` |
| Surface 2 | `rgba(255,255,255,.055)` |
| Bordure | `rgba(255,255,255,.12)` |
| Filet (séparateur) | `rgba(255,255,255,.08)` — vertical dans un bandeau : `.09` |
| Filet de ligne de liste | `rgba(255,255,255,.055)` à `.07` |
| Encre | `#F6F6F7` |
| Encre secondaire | `#9B9BA1` |
| Encre tertiaire / étiquettes | `#5C5C63` |
| Accent 1 (rose) | `#FC1283` |
| Accent 2 (orange) | `#F9A45E` |
| Dégradé de marque | `linear-gradient(135deg,#FC1283,#F9A45E)` |
| Gain / validé | `#33E6A6` (clair : `#7FF3CA`) |
| Perte / refusé | `#FF4D5E` (clair : `#FF94A0`) |
| Référence / en cours | `#4D8DFF` (clair : `#9DBCFF`) |
| Simulé / en attente | `#E8B339` (clair : `#F4D07A`) |

### Lueurs par contexte (héros de page)

| Page | Lueur |
| --- | --- |
| Marque / générique | rose→orange `rgba(252,18,131,.34)` + `rgba(249,164,94,.24)` |
| Stratégies (SWYPER) | `rgba(227,87,40,.42)` |
| BERICH | `rgba(8,153,129,.5)` |
| Calendrier haussier / baissier | `rgba(51,230,166,.4)` / `rgba(255,77,94,.4)` |

---

## 3. Typographie

`Instrument Sans` (400/500/600/700), `font-variant-numeric: tabular-nums` sur
**tous** les chiffres.

| Niveau | Taille | Poids | Letter-spacing |
| --- | --- | --- | --- |
| Chiffre héros | 78px | 700 | -.05em |
| Titre de page | 54–62px | 700 | -.045em |
| Titre de héros centré | 52–74px | 700 | -.04em |
| Chiffre de KPI | 25px | 700 | -.03em |
| Valeur | 17–24px | 700 | -.02em |
| Titre de bloc | 19px | 700 | -.025em |
| Corps | 13.5px | 400 | — |
| Ligne de tableau | 12.5px | 400 | — |
| Étiquette (uppercase) | 10px | 600 | .16em |
| Numéro de section (uppercase) | 10px | 400 | .24em |

Règles :

- Tout titre en dégradé de texte (`background-clip:text`) reçoit
  `line-height:1.06` et `padding-bottom:.06em` — sinon les jambages et le `%`
  sont rognés.
- Les sections d'une page sont numérotées : `01 — Compte actif`, `02 — Courbe
  d'equity`… en 10px, `letter-spacing:.24em`, `#5C5C63`.

---

## 4. Le bandeau de KPI (remplace les cartes de statistiques)

Plusieurs mesures côte à côte **sur la surface de la page**, séparées par un filet
vertical. Pas de bordure autour, pas de fond.

```html
<div style="display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); padding:6px 34px 40px">
  <div style="padding:2px 22px 2px 0">…</div>
  <div style="padding:2px 22px; border-left:1px solid rgba(255,255,255,.09)">…</div>
</div>
```

Chaque cellule : étiquette 10px uppercase `#5C5C63` → chiffre 25px/700 → note 11px
`#5C5C63`. Les chiffres de signe (gain/perte) portent un halo :
`text-shadow:0 0 18px rgba(51,230,166,.35)`.

**Un filet ne se met qu'entre deux choses de même nature.** Entre le compte actif
et ses KPI : rien, la proximité suffit. Entre deux sujets (KPI → graphique →
objectifs → outils) : `border-top:1px solid rgba(255,255,255,.08)`.

---

## 5. Lueur qui suit le curseur

Réservée au **haut du Dashboard** (bloc compte + KPI). Elle se fond avant le
graphique et ne réapparaît pas plus bas.

```css
/* calque en position:absolute; inset:0; z-index:0; pointer-events:none */
background: radial-gradient(620px circle at var(--mx,72%) var(--my,3%), rgba(252,18,131,.17), transparent 70%);
mask-image: linear-gradient(180deg,#000 0%,#000 40%,transparent 57%);
```

`--mx` / `--my` mis à jour sur `mousemove` en % relatifs au conteneur.

---

## 6. La fenêtre « liquid glass »

Une seule par page, pour le contenu dense. Elle laisse voir la lueur derrière,
mais **fortement atténuée et floutée** — c'est ce contraste qui fait l'effet verre.

```css
position: relative; overflow: hidden;
border: 1px solid rgba(255,255,255,.14);
border-radius: 18px;
background: linear-gradient(160deg, rgba(9,9,11,.62), rgba(9,9,11,.74));
backdrop-filter: blur(34px) brightness(.34) saturate(1.05);
box-shadow:
  0 18px 44px rgba(0,0,0,.45),
  inset 1.5px 1.5px 0 rgba(255,255,255,.2),
  inset -1.5px -1.5px 0 rgba(255,255,255,.06),
  inset 0 0 40px rgba(255,255,255,.035);
```

Plus deux pseudo-éléments :

```css
/* ::before — reflet diagonal */
background: linear-gradient(135deg, rgba(255,255,255,.14) 0%, rgba(255,255,255,.02) 26%,
            transparent 48%, rgba(255,255,255,.035) 74%, rgba(255,255,255,.1) 100%);
/* ::after — liseré de lumière en haut */
top:0; left:8%; right:8%; height:1px;
background: linear-gradient(90deg, transparent, rgba(255,255,255,.55), transparent);
```

Variante « mini-fenêtre » (cartes de backtest, annonces motrices) : rayon 16px,
`blur(22px) brightness(.62)`, ombres internes à `1.5px / .16`.

L'effet ne dépend **jamais** de la position de la souris : c'est la fenêtre qui
atténue, pas le curseur qui éclaire.

---

## 7. Graphiques

Règle commune : tracé lissé (Catmull-Rom → Bézier), grille très discrète
(`rgba(255,255,255,.05)`), échelles en 10px `#5C5C63` tabular-nums, et
**toutes les graduations, lignes et étiquettes calculées depuis les mêmes
données** (jamais de position en dur).

### Courbe de performance (Dashboard, aperçus de backtest)

Dégradé vertical ancré sur la ligne du 0 (`gradientUnits="userSpaceOnUse"`) :

```xml
<linearGradient id="line" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="H">
  <stop offset="0"      stop-color="#6EF2C9"/>
  <stop offset="ZERO-.22" stop-color="#33E6A6"/>
  <stop offset="ZERO"   stop-color="#DCDCE0"/>
  <stop offset="1"      stop-color="#FF4D5E"/>
</linearGradient>
```

Vert au-dessus du 0, rouge en dessous, d'autant plus saturé que le creux est
profond. Halo néon sur le trait :
`filter: drop-shadow(0 0 9px rgba(51,230,166,.75))`.
Zone remplie : même dégradé en opacité `.45 → 0` puis `0 → .4`.
Le backtest de départ reste en pointillés ambre `#E8B339 / dasharray 5 6`.

### Bougies (Stratégies, BERICH)

Corps `rect` de 60% du pas, mèche 1.4px à 85% d'opacité, vert `#33E6A6` /
rouge `#FF4D5E`. Signaux = triangles pleins avec
`drop-shadow(0 0 8px …,.9)`. Zones TP/SL en `rgba(...,.07)`, lignes Entrée/SL/TP
en pointillés `6 5` avec étiquette calée sur l'échelle.

---

## 8. Composants

### Bouton principal

```css
padding:11px 22px; border-radius:999px; border:none; color:#fff; font-weight:600;
background: linear-gradient(135deg,#FC1283,#F9A45E);
box-shadow: 0 10px 30px rgba(252,18,131,.3);
/* :hover */ transform: translateY(-1px); box-shadow: 0 16px 44px rgba(252,18,131,.45);
```

### Bouton secondaire — le contour prend le dégradé au survol

Transparent au repos, contour neutre. Au survol, le contour **entier** passe au
dégradé rose→orange (technique double `background` + `border-box`) :

```css
border: 1px solid transparent;
background: linear-gradient(rgba(255,255,255,.04),rgba(255,255,255,.04)) padding-box,
            linear-gradient(135deg,rgba(255,255,255,.16),rgba(255,255,255,.16)) border-box;
/* :hover */
background: linear-gradient(rgba(255,255,255,.04),rgba(255,255,255,.04)) padding-box,
            linear-gradient(135deg,#FC1283,#F9A45E) border-box;
box-shadow: 0 8px 26px rgba(252,18,131,.2);
```

### Segmenté (périodes, %/$, importance)

Conteneur : `padding:3px; border:1px solid rgba(255,255,255,.12); border-radius:999px;
background:rgba(255,255,255,.03)`. Option active : `background:#F6F6F7; color:#050505`.
Options inactives : `#9B9BA1`, blanc au survol.

### Onglets de navigation (remplace la sidebar)

Même conteneur pilule. Onglet actif : `background:rgba(255,255,255,.08)` +
`box-shadow: inset 0 0 0 1px rgba(252,18,131,.45)`.

### Survol d'une tuile

Le fond ET le contour prennent le dégradé, jamais le rose seul :

```css
border-color: rgba(249,164,94,.45);
background: linear-gradient(135deg, rgba(252,18,131,.13), rgba(249,164,94,.1));
box-shadow: 0 10px 30px rgba(252,18,131,.18);
```

### Pastilles

- Sens / résultat : 10.5px/700 uppercase, `padding:3px 9px`, radius 999,
  couleur de signal sur fond `rgba(signal,.14)`.
- Validé / refusé : cercle 22px, `rgba(signal,.16)`, `box-shadow:0 0 12px rgba(signal,.25)`,
  glyphe `✓` / `✕`.
- État de compte : `Actif` vert, `En attente` ambre, `Bloqué` rouge.

### Vide assumé

`border:1px dashed rgba(255,255,255,.16–.18)`, texte 11.5px `#5C5C63`, aucune
illustration. Un vide est une information, pas une erreur.

### Tuiles de signal (DA)

Tuile de couleur pleine à faible opacité, texte en teinte claire avec halo :
`border:1px solid rgba(signal,.35)`, `background:linear-gradient(160deg,rgba(signal,.18),rgba(signal,.03))`,
`box-shadow:0 10px 26px rgba(signal,.16), inset 0 1px 0 rgba(255,255,255,.1)`,
valeur en teinte claire + `text-shadow:0 0 16px rgba(signal,.55)`.

---

## 9. Héros de page

Deux formes, jamais mélangées sur la même page.

**A. Héros aligné à gauche** (Backtesting, Journal, Compte, Admin, Publications) :
titre 48–62px, et **derrière le bloc de titre** un calque de lumière diffuse —
pas d'effet sur les lettres elles-mêmes.

```css
position:absolute; left:-80px; top:-90px; width:620px; height:400px;
pointer-events:none; filter: blur(90px);
background: radial-gradient(45% 50% at 30% 50%, rgba(252,18,131,.4), transparent 72%),
            radial-gradient(40% 44% at 62% 40%, rgba(249,164,94,.26), transparent 74%);
```

**B. Héros centré** (Stratégies, BERICH, Calendrier) : logo réel, titre en dégradé
blanc `linear-gradient(180deg,#fff,rgba(255,255,255,.55))`, lueur radiale propre au
contexte (§2) et fondu de sortie vers le fond :

```css
/* dégradé */ radial-gradient(ellipse 55% 64% at 50% 20%, <lueur>, transparent 72%)
/* fondu bas */ height:110–120px; linear-gradient(180deg, transparent, rgba(8,8,10,.95))
```

---

## 10. Grain

Calque plein écran par-dessus le fond, sous le contenu :

```css
position:absolute; inset:0; pointer-events:none;
mix-blend-mode: overlay; opacity:.055;
background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)'/%3E%3C/svg%3E");
background-size: 180px 180px;
```

---

## 11. Mouvement

| Usage | Valeur |
| --- | --- |
| Courbe standard | `cubic-bezier(.16,1,.3,1)` |
| Survol (couleur, bordure, fond) | `.18s` – `.2s` |
| Soulèvement de tuile | `transform:translateY(-3px)` en `.22s` |
| Volet (chevron) | `.25s` |
| Lueur de fond du canvas | `46s` en boucle |
| Ticker | `42s linear infinite`, liste dupliquée, `translateX(0 → -50%)` |

Pas d'animation d'entrée, pas de parallaxe, pas de fondu au scroll.

---

## 12. Par page — ce qui change par rapport à l'existant

| Page | Décisions |
| --- | --- |
| **Dashboard** | Nav en onglets (plus de tiroir). Un seul chiffre héros (+12.84%). KPI en bandeau à filets, sur le même plan que le compte. Lueur au curseur en haut uniquement. Graphique dans la fenêtre liquid glass (hauteur 330px). Objectifs + calendrier sous le graphique. Outils (sessions, devises) dans un volet à barre d'ouverture. |
| **Backtesting** | Héros gauche + lumière derrière le titre. Bandeau de 4 KPI. Cartes d'algorithme en mini-fenêtres glass avec courbe d'aperçu vert/rouge sur la ligne du 0. Plus d'étiquettes Validé/Brouillon. Tuile d'ajout en pointillés. |
| **Journal** | Sélecteur de compte + actions en haut à droite. KPI en bandeau. Conditions du compte en 2 colonnes avec pastille validé/refusé. Positions dans une fenêtre glass, pastilles de sens et de résultat. |
| **Stratégies** | Héros centré avec le vrai logo du scanner et sa lueur. Barre de contrôle sur le même plan, à filets, scanner affiché en 19px avec logo nu (pas de bulle). Bougies + ligne de biais néon + signaux dans la fenêtre glass. |
| **Calendrier** | Ticker défilant intégré à l'en-tête. Héros de sentiment (badge, paire 74px, prévision hebdo néon). Annonces motrices en mini-fenêtres avec Prévu \| Réel séparés par un trait orange — la valeur qui compte est la plus grosse. Tranches verticales pour le reste de la semaine. Bilan Prévision / Réalisé / Réussite. Grande fenêtre du jour avec repère rose sur l'annonce en cours. Prochains jours en 3 colonnes. Drapeaux `flag-icons`. |
| **BERICH** | Signal en cours d'abord : bouton d'action sur fond vert diffus à gauche, niveaux Entrée/SL/TP à filets à droite, ligne de risque avec segmenté. Graphique glass avec zones TP/SL. Historique en liste simple. |
| **Connexion** | Photo plein cadre + scrim, carte en liquid glass, logo lumineux en débord au-dessus, champ actif cerclé de rose, logos Apple/Google/Discord réels en état désactivé. |
| **Compte** | Liste de réglages sans cartes, un filet par ligne, état en clair (vert si connecté), bouton au contour dégradé au survol. |
| **Admin membres** | Compteurs En attente / Actifs / Bloqués en bandeau à côté du titre, une ligne par membre, avatar dégradé, pastille d'état, actions à droite. |

---

## 13. Assets

Déjà présents dans `assets/` : `logo-chest.png`, `logo-chest-glow.png`,
`logo-swyper.png`, `logo-berich.png`, `login-bg.jpg`.
Également disponibles côté site : `logo-algomni.png`, `logo-pivot.png`, `logo-wolfx.png`.

Toujours utiliser le fichier réel. Ne jamais redessiner un logo en initiales —
les initiales ne sont qu'un repli si le fichier manque.
`logo-berich.png` s'affiche avec `mix-blend-mode:screen` sur fond sombre.

---

## 14. Ce qui est interdit

- Une carte bordée autour de chaque bloc d'une même page.
- Le rose seul sur un survol (toujours le dégradé rose→orange).
- Un emoji, une icône pleine, un logo redessiné.
- Une deuxième couleur de fond, un deuxième dégradé par écran.
- Un dégradé de texte sans `padding-bottom` (lettres rognées).
- Des graduations, étiquettes de prix ou repères positionnés en dur.
- Une lueur au curseur ailleurs qu'en haut du Dashboard.
- Un titre en `text-shadow` coloré à la place de la lumière diffuse derrière lui.
