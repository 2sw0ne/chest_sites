# CHEST 2.0 — Direction artistique

La 2.0 garde l'identité de la 1.0 (`CHEST DESIGN/CHEST-DA.md` : noir, dégradé
rose → orange, Instrument Sans, verre liquide, bandeau de KPI à filets) et la rend plus
calme et plus lisible. Tout ce qui n'est pas redéfini ici reste celui de la 1.0.
Les valeurs ci-dessous sont celles des maquettes : les reprendre telles quelles.

---

## 1. Principes

1. **Une seule lumière par écran.** Un halo fixe, flou, dans la couleur du contexte, en
   haut de la page. Plus de lueur qui suit le curseur, plus de lueurs multiples.
2. **Un grand héros centré par page**, avec le titre de la page en filigrane derrière
   (« mot fantôme »), le chiffre qui compte en très grand, puis le contenu en dessous.
3. **Tuiles calmes.** Fond à 3,5 % → 1,2 %, bordure à 7 %. Un halo d'angle seulement
   quand la tuile a un sens (vert, rouge, ambre, marque). La fenêtre verre reste
   réservée au contenu dense (graphique, tableau de positions).
4. **Étiquettes en mono.** JetBrains Mono pour les numéros de section, les heures, les
   codes devise et les petites étiquettes. Instrument Sans pour tout ce qu'on lit.
5. **La couleur a un sens.** Vert = gain, rouge = perte, ambre = attente, bleu =
   référence, dégradé de marque = actif / à toi.
6. **Rien n'est inventé à l'écran.** Si une donnée manque, l'état vide est affiché
   (bordure en pointillés, texte 11,5 px `#7A7A82`).

## 2. Couleurs

| Rôle | Valeur |
| --- | --- |
| Fond | `#050506` |
| Fond du menu | `rgba(8,8,10,.86)` + halo rose en haut `radial-gradient(ellipse 90% 70% at 20% 0%, rgba(252,18,131,.09), transparent 75%)` |
| Tuile | `linear-gradient(180deg, rgba(255,255,255,.035), rgba(255,255,255,.012))` · bordure `rgba(255,255,255,.07)` · `inset 0 1px 0 rgba(255,255,255,.05)` |
| Fenêtre verre | `linear-gradient(160deg, rgba(14,14,17,.72), rgba(9,9,11,.86))` · bordure `.12` · ombres `0 18px 44px rgba(0,0,0,.45), inset 1.5px 1.5px 0 rgba(255,255,255,.14), inset -1.5px -1.5px 0 rgba(255,255,255,.04)` · liseré haut `linear-gradient(90deg, transparent, rgba(255,255,255,.5), transparent)` |
| Filet | `rgba(255,255,255,.07)` (entre sujets) · `.055` (lignes de liste) · `.09` (vertical dans un bandeau) |
| Encre | `#F6F6F7` |
| Encre 2 | `#9B9BA1` |
| Étiquette | **`#7A7A82`** (remplace `#5C5C63`, trop peu contrasté en petit) |
| Encre 4 (décor seulement) | `#5C5C63` |
| Rose / Orange / Marque | `#FC1283` / `#F9A45E` / `linear-gradient(135deg,#FC1283,#F9A45E)` |
| Gain | `#33E6A6` · texte clair `#7FF3CA` |
| Perte | `#FF4D5E` · texte clair `#FF94A0` |
| Attente | `#E8B339` · texte clair `#F4D07A` |
| Référence | `#4D8DFF` · texte clair `#9DBCFF` |
| Admin | `linear-gradient(90deg,#FF8A1F,#FFD23F)` |

### Lumière par page (halo du héros)

| Page | Halo |
| --- | --- |
| Dashboard, Backtesting, Compte, Éducateur, School, Admin, Offres, Connexion | rose `rgba(252,18,131,.16–.34)` + orange `rgba(249,164,94,.10–.26)`, `filter: blur(100–110px)` |
| Journal | vert `rgba(51,230,166,.16)` + rose `rgba(252,18,131,.12)` |
| Calendrier haussier / baissier | `radial-gradient(ellipse 55% 64% at 50% 20%, rgba(51,230,166,.30), transparent 72%)` / même chose en `rgba(255,77,94,.30)` |
| Stratégies | `rgba(227,87,40,.34)` (couleur du scanner) |
| BERICH | `rgba(8,153,129,.42)` |

## 3. Typographie

| Niveau | Taille | Poids | Interlettrage |
| --- | --- | --- | --- |
| Mot fantôme (derrière le héros) | 210 px (90 px sous 900 px de large) | 700 | −.06em, dégradé `rgba(255,255,255,.075) → 0` |
| Chiffre héros | 100–112 px | 700 | −.055em |
| Titre de héros | 56–76 px | 700 | −.05em |
| Titre de page simple | 40 px | 700 | −.04em |
| Chiffre de KPI | 24–26 px | 700 | −.03em |
| Titre de bloc | 19–24 px | 700 | −.025em |
| Corps | 13,5 px | 400 | — |
| Ligne de tableau | 12,5 px | 400 | — |
| Numéro de section | JetBrains Mono 10,5 px | 400 | .20em, majuscules, `#7A7A82` — « 02 — La semaine » |
| Étiquette | JetBrains Mono 10 px | 400–600 | .16em, majuscules, `#7A7A82` |

Chiffres toujours en `font-variant-numeric: tabular-nums`. Un dégradé de texte reçoit
`line-height ≥ 1` et `padding-bottom: .04–.06em`.

Chiffre héros en dégradé : gain `linear-gradient(180deg,#fff 8%,#c9fbe9 45%,#33e6a6)` +
`drop-shadow(0 0 36px rgba(51,230,166,.3))` ; perte `linear-gradient(180deg,#fff 8%,#ffc2c9 45%,#ff4d5e)`.

## 4. Le héros centré (toutes les pages de l'app)

Ordre vertical : mot fantôme (en `position:absolute`, `z-index:-1`) → sélecteur
(onglets soulignés en dégradé, ou pastille) → titre → phrase → **chiffre héros** →
sous-ligne → faits en ligne (`dl` à filets verticaux) → boutons → courbe pleine largeur.

- Onglets soulignés : texte 12,5 px/600, `#7A7A82` au repos, `#F6F6F7` actif, trait 2 px
  en dégradé + `box-shadow:0 0 10px rgba(252,18,131,.55)` sous l'onglet actif.
- Courbe pleine largeur : hauteur 260–280 px, déborde des marges de la page,
  `mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent)`,
  ligne de départ en pointillés `3 7`, point final blanc pulsant.

## 5. Le menu (ancien volet CHEST, conservé)

- Largeur 248 px, repliable à 76 px par l'**encoche** collée au bord droit (forme
  `M0 0 C 0 22, 21 30, 21 56 C 21 82, 0 90, 0 112`, 22 × 112 px, fond `#070709`, trait
  `rgba(255,255,255,.12)`, chevron qui pivote).
- Logo + « CHEST », étiquette « Navigation » (10 px, .24em).
- Item : 13,5 px/600, `padding:11px 14px`, rayon 12, icône trait 18 px.
- **Actif** : fond `linear-gradient(90deg, rgba(252,18,131,.16), rgba(249,164,94,.05) 60%, transparent)`,
  icône en dégradé + lueur, barre 3 × 18 px en dégradé collée au bord gauche avec
  `box-shadow:0 0 14px rgba(252,18,131,.8)`.
- Séparateur avant Admin : `linear-gradient(90deg, rgba(255,138,31,.55), rgba(255,210,63,0))`.
- Admin : libellé et icône en dégradé orange → jaune.
- Bas : « Compte », avatar dégradé 28 px, nom + e-mail, bouton pilule « Se déconnecter ».
- Le **bouton rond rose** en bas à droite de toutes les pages ouvre la calculatrice de lot.

## 6. Composants

- **Bouton principal** : pilule, dégradé de marque, `box-shadow:0 10px 30px rgba(252,18,131,.3)`.
- **Bouton secondaire** : contour neutre `.14`, le contour entier passe au dégradé au survol.
- **Segmenté** : conteneur pilule `.1`, option active fond `#F6F6F7` texte `#050505`.
- **Pastilles** : Achat / Vente / En attente / Référence (10,5 px/700, majuscules, fond du signal à 12–14 %).
- **Validé / en attente** : rond 22 px, glyphe ✓ ou …, halo du signal.
- **Barre de progression** : 4–6 px, piste `rgba(255,255,255,.06)`, remplissage dégradé ou signal.
- **Tuile de carte de backtest / journal** : verre, courbe d'aperçu verte au-dessus de 0
  et rouge en dessous (dégradé `userSpaceOnUse` ancré sur le 0), plus de logos.
- **Filtre de force (étoiles)** : boutons pilule ★★★ / ★★☆ / ★☆☆, fond ambre à 10 %
  quand actif, nombre d'annonces en mono. Jamais de menu déroulant pour ce filtre.
- **Livre d'annonce** (bibliothèque du Calendrier) : épaisseur = impact (48 / 32 / 22 px),
  hauteur 168 / 146 / 128 px, reliure en dégradé de marque (fort), ambre (moyen),
  grise (faible). Un étage par jour. Clic = livre ouvert en double page sous la bibliothèque.
- **Carte sessions « météo »** : ciel en dégradé selon l'heure locale (nuit / aube /
  jour / crépuscule, mêmes couleurs que `js/session-timeline.js`), soleil ou lune sur son
  arc, puis une piste par place avec sa propre météo (lune, aube, soleil) et son heure locale.

## 7. Mouvement

Courbe standard `cubic-bezier(.16,1,.3,1)`, survols .18–.2 s, soulèvement de tuile
`translateY(-3px)` .22 s, repli du menu .28 s, point final de courbe pulsant 2,4 s.
Tout est coupé sous `prefers-reduced-motion`.

## 8. Interdits

- Plusieurs lueurs sur un même écran, une lueur qui suit la souris.
- Une carte bordée autour de chaque bloc d'un bandeau de KPI.
- Des étiquettes en `#5C5C63` (illisibles en petit) : utiliser `#7A7A82`.
- Des logos sur les cartes de backtest.
- Un menu déroulant pour le filtre de force du Calendrier.
- Un emoji comme icône, un logo redessiné, une donnée inventée.
