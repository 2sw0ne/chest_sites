# CHEST — refonte visuelle : à lire en premier

Contenu de ce dossier :

| Fichier | Rôle |
| --- | --- |
| `CHEST DA.dc.html` | La maquette complète des 9 pages. Ouvre-la dans un navigateur. |
| `CHEST-DA.md` | **La direction artistique.** Le document de référence à donner à Claude Code. |
| `css/chest-da.css` | Les tokens et les classes utilitaires de cette DA, prêts à brancher. |
| `assets/` | Les logos et l'image de fond réellement utilisés. |
| `support.js` | Runtime de la maquette. Inutile pour le site. |

## Sommaire de la maquette

Les pages sont empilées, la plus récente en haut. Chaque bloc porte un badge :

| Badge | Page |
| --- | --- |
| `7a` / `7b` / `7c` | Connexion / Compte / Gestion des membres |
| `6a` | BERICH |
| `5a` | Calendrier économique |
| `4a` | Stratégies |
| `3a` | Journal de trading |
| `2a` | Backtesting |
| `1a` / `1b` | Palette de DA / Dashboard |

`1a` est la palette : couleurs, échelle typo, composants et états. C'est la
source de vérité visuelle ; `CHEST-DA.md` en est la transcription écrite.

## Comment l'utiliser avec Claude Code

1. Donne-lui `CHEST-DA.md` et `css/chest-da.css`.
2. Charge `chest-da.css` après `tokens.css` dans les pages du site.
3. Demande-lui de refaire une page à la fois, en citant la ligne du tableau
   « Par page » (§12 du document) correspondante.
4. Les §4 (bandeau de KPI), §6 (fenêtre liquid glass) et §7 (graphiques) sont
   les trois mécaniques à respecter au pixel : c'est ce qui fait la cohérence.

Les données affichées dans la maquette sont fictives — seules la mise en page,
les couleurs et les états comptent.
