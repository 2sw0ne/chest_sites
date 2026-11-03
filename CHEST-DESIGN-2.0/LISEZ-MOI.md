# CHEST 2.0 — refonte visuelle : à lire en premier

Ce dossier contient la maquette complète de CHEST 2.0 (14 planches) et tout ce qu'il
faut pour l'appliquer au vrai site (`site/` du dépôt `chest_sites`).

| Fichier | Rôle |
| --- | --- |
| `LISEZ-MOI.md` | Ce fichier : contenu, ordre de lecture, consigne à donner à Claude Code. |
| **`METHODE-EXACTE.md`** | **À donner en premier à Claude Code** : comment reproduire les maquettes à l'identique (copie du HTML exact + comparaison au pixel). |
| `html-exact/*.html` | Chaque page en HTML statique, exactement tel qu'il s'affiche (0,00 % d'écart avec sa capture). À copier, pas à réinterpréter. |
| `outils/comparer.mjs` | Compare une page du site à sa capture et montre les différences en rouge. |
| `CHEST-DA-2.0.md` | **La direction artistique 2.0.** Couleurs, typo, surfaces, composants, règles. |
| `INTEGRATION.md` | **Le plan de travail page par page** : fichier du site concerné, ce qui change, ce qui reste. |
| `css/chest-da-2.css` | Les tokens et les classes de la 2.0, prêts à brancher. |
| `captures/*.png` | Une capture pleine page de chaque planche (référence visuelle). |
| `maquettes/*.dc.html` | Les sources des maquettes (valeurs exactes de chaque élément). |
| `maquettes/support.js` | Moteur des maquettes (React inclus) : sert uniquement à les ouvrir dans un navigateur. |
| `maquettes/assets/` | Les logos utilisés (copies réduites des fichiers de `site/assets/`). |
| `maquettes/canvas.json` | Disposition des planches sur le canvas (titres, tailles). |

## Les planches (38, sur 4 pages du canvas)

**Page 1 · CHEST 2.0** : `Main` (Dashboard), `Calendrier`, `Backtesting`, `Pack-DA`, `Journal`, `Strategies`, `Berich`, `School`, `Compte`.

**Page 2 · Transitions et offres** : `Connexion`, `T-Inscription`, `T-Questionnaire`, `Offres`, `T-Paiement`, `T-Validation`, `T-Welcome`, `T-Conditions`, `T-Verrou`, `T-Maintenance`, `T-Rejoindre`, `Elements`.

**Page 3 · Admin** : `Admin`, `Admin-Membres`, `Admin-Fiche`, `Admin-Fiche-Acces`, `Admin-Fiche-Activite`, `Admin-Rangs`, `Admin-Engagement`, `Admin-Ventes`, `Admin-Educateurs`, `Admin-Systeme`, `Admin-Privilege`.

**Page 4 · Espace éducateur** : `Educateur`, `Edu-Membres`, `Edu-Fiche`, `Edu-Notes`, `Edu-Portefeuille`, `Edu-Accueil`.

Chaque planche `X` existe en trois formes : `maquettes/X.dc.html` (source), `captures/X.png` (référence), `html-exact/X.html` (HTML statique à copier). La correspondance planche ↔ fichier du site est dans `INTEGRATION.md` (§ 9, 10, 11 pour les nouvelles).

## Ouvrir les maquettes

Les `.dc.html` s'ouvrent dans un navigateur à condition d'être servis par HTTP
(pas en `file://`) :

```bash
cd maquettes && python3 -m http.server 8080
# puis http://localhost:8080/Main.dc.html
```

Les polices (Instrument Sans, JetBrains Mono) viennent de Google Fonts : sans
connexion, une police de remplacement s'affiche. Les maquettes interactives
(Calendrier, Backtesting, Journal, Stratégies, BERICH, Offres) réagissent aux clics ;
le menu se replie avec l'encoche sur son bord droit.

**Les chiffres, noms et textes des maquettes sont des exemples.** Sur le site, chaque
valeur vient des données réelles déjà calculées par les scripts existants.

## Consigne à donner à Claude Code

> Lis `CHEST-DESIGN-2.0/METHODE-EXACTE.md` puis `INTEGRATION.md` et `CHEST-DA-2.0.md`.
> Applique la refonte CHEST 2.0 une page à la fois, dans l'ordre de `INTEGRATION.md`,
> en suivant `METHODE-EXACTE.md` à la lettre : copie le balisage et les styles de
> `html-exact/<Page>.html` **sans modifier aucune valeur**, branche les données réelles
> déjà calculées par le JS existant (on change la présentation, pas le fonctionnement),
> puis lance `outils/comparer.mjs` contre `captures/<Page>.png` et corrige tant que des
> zones de mise en page ressortent en rouge. Respecte `CLAUDE.md` (`?v=`, fichiers à ne
> jamais réécrire). Montre-moi `cote-a-cote.png` à la fin de chaque page avant de passer
> à la suivante. Si une maquette demande une donnée qui n'existe pas encore, demande-moi
> avant de l'inventer.

Placer ce dossier à la racine du dépôt, à côté de `CHEST DESIGN/` (la DA 1.0, qui reste
la référence pour ce que la 2.0 ne redéfinit pas).
