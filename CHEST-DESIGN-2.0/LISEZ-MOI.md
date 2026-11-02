# CHEST 2.0 — refonte visuelle : à lire en premier

Ce dossier contient la maquette complète de CHEST 2.0 (14 planches) et tout ce qu'il
faut pour l'appliquer au vrai site (`site/` du dépôt `chest_sites`).

| Fichier | Rôle |
| --- | --- |
| `LISEZ-MOI.md` | Ce fichier : contenu, ordre de lecture, consigne à donner à Claude Code. |
| `CHEST-DA-2.0.md` | **La direction artistique 2.0.** Couleurs, typo, surfaces, composants, règles. |
| `INTEGRATION.md` | **Le plan de travail page par page** : fichier du site concerné, ce qui change, ce qui reste. |
| `css/chest-da-2.css` | Les tokens et les classes de la 2.0, prêts à brancher. |
| `captures/*.png` | Une capture pleine page de chaque planche (référence visuelle). |
| `maquettes/*.dc.html` | Les sources des maquettes (valeurs exactes de chaque élément). |
| `maquettes/support.js` | Moteur des maquettes (React inclus) : sert uniquement à les ouvrir dans un navigateur. |
| `maquettes/assets/` | Les logos utilisés (copies réduites des fichiers de `site/assets/`). |
| `maquettes/canvas.json` | Disposition des planches sur le canvas (titres, tailles). |

## Les planches

| Planche | Page du site | Capture |
| --- | --- | --- |
| `Main.dc.html` | Dashboard (`dashboard.html`) | `captures/Main.png` |
| `Calendrier.dc.html` | Calendrier (`calendar.html`) | `captures/Calendrier.png` |
| `Backtesting.dc.html` | Backtesting (`backtesting.html`) | `captures/Backtesting.png` |
| `Journal.dc.html` | Journal (`journal.html`) | `captures/Journal.png` |
| `Strategies.dc.html` | Stratégies (`strategies.html`) | `captures/Strategies.png` |
| `Berich.dc.html` | BERICH (`berich.html`) | `captures/Berich.png` |
| `School.dc.html` | School (`school.html`) | `captures/School.png` |
| `Compte.dc.html` | Compte (`account.html`) | `captures/Compte.png` |
| `Educateur.dc.html` | Espace éducateur (`educator.html`) | `captures/Educateur.png` |
| `Admin.dc.html` | Admin membres (`admin-members.html`) | `captures/Admin.png` |
| `Offres.dc.html` | Offres (`offres.html`) | `captures/Offres.png` |
| `Connexion.dc.html` | Connexion (`app.html`, écran connecté-déconnecté) | `captures/Connexion.png` |
| `Elements.dc.html` | Calculatrice de lot, menu replié, volets, notifications, confirmation, message court, quiz BERICH | `captures/Elements.png` |
| `Pack-DA.dc.html` | Planche de la DA (référence) | `captures/Pack-DA.png` |

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

> Lis `CHEST-DESIGN-2.0/LISEZ-MOI.md`, puis `CHEST-DA-2.0.md` et `INTEGRATION.md`.
> Applique la refonte CHEST 2.0 au site, une page à la fois, dans l'ordre de
> `INTEGRATION.md`. Pour chaque page : ouvre la capture et la maquette `.dc.html`
> correspondantes, reprends les valeurs exactes (tailles, espacements, couleurs),
> garde toute la logique et les données existantes (on change la présentation, pas
> le fonctionnement), respecte `CLAUDE.md` (incrément des `?v=`, fichiers à ne jamais
> réécrire, vérification par JS/texte). Montre-moi chaque page avant de passer à la
> suivante. Quand une maquette demande une donnée qui n'existe pas encore, demande-moi
> avant de l'inventer.

Placer ce dossier à la racine du dépôt, à côté de `CHEST DESIGN/` (la DA 1.0, qui reste
la référence pour ce que la 2.0 ne redéfinit pas).
