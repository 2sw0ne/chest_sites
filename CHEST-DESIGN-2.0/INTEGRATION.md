# CHEST 2.0 — Plan d'intégration page par page

Règle d'or : **on change la présentation, pas le fonctionnement.** Toutes les données,
calculs, appels serveur, synchro et règles d'accès existants restent tels quels. Chaque
valeur affichée dans la maquette correspond à une donnée déjà calculée par le site ; les
rares données nouvelles sont signalées **[NOUVEAU]** et doivent être validées avec
l'utilisateur avant d'être codées.

Rappels de `CLAUDE.md` à respecter pendant tout le chantier :
- incrémenter les `?v=` de chaque CSS/JS modifié (attention au `sed` sur `chest-da.css` qui touche aussi `patch-chest-da.css`) ;
- ne jamais réécrire `site/support.js`, `site/allin-engine.js`, `backtesting-swyper.html`, `backtesting-allin.html` ;
- toujours `esc()` sur une donnée venant d'un autre membre ;
- vérifier par JS / texte, captures rares ; une passe de vérification à la fin de chaque page ;
- ajouter 1 à 3 lignes dans `CLAUDE.md` (section « DA CHEST ») quand la 2.0 remplace une règle de la 1.0, le récit détaillé dans `docs/HISTORIQUE.md`.

Ordre conseillé : 0 → 1 → 2 → … (le socle d'abord, puis les pages les plus vues).

---

## 0. Socle commun

**Fichiers** : `site/css/chest-da.css`, `site/css/v2.css`, `site/css/tokens.css`, nouveau `site/css/chest-da-2.css` (copie de `css/chest-da-2.css` de ce dossier), `app.html`, `js/nav.js`, `js/v2-shell.js`.

1. Brancher `chest-da-2.css` après `v2.css` dans `app.html` et dans chaque page embarquée.
2. Remplacer la couleur des étiquettes `#5C5C63` par `#7A7A82` (variable `--chest-ink-3`).
3. Ajouter JetBrains Mono (Google Fonts, 400/500/600) et l'utiliser pour les numéros de section `.chest-step`, les étiquettes `.chest-label` et les heures.
4. Une seule lumière par page : supprimer la lueur qui suit le curseur du Dashboard et les lueurs secondaires ; garder un halo fixe par page (tableau §2 de la DA).
5. Le menu ne change pas de structure (il était déjà le bon) : vérifier l'état actif (fond dégradé + barre lumineuse à gauche), l'encoche de repli, le séparateur Admin, le bloc Compte. Référence : n'importe quelle maquette, classes `.sb*` de `chest-da-2.css`.
6. Composant **héros centré** réutilisable (`.h2-hero`, `.h2-ghost`, `.h2-num`, `.h2-facts`, `.h2-curve`) : le Backtesting et le Journal l'ont déjà (`.bth`, `.jrh`) — les aligner sur la DA 2.0 et le réutiliser ailleurs.

## 1. Dashboard — `dashboard.html`, `js/dashboard.js`, `js/session-timeline.js`, `js/currency-strength.js`

Maquette `Main.dc.html`.
- En-tête : titre, date + état des sessions, sélecteur de compte, segmenté 7J / 30J / 3M / Tout.
- Bandeau sans carte : solde en héros + 4 KPI à filets (P&L du mois, taux de réussite, profit factor, drawdown utilisé) avec mini-barre.
- Courbe d'equity pleine largeur dans la fenêtre verre (backtest de départ en pointillés ambre).
- **Le bloc Challenge / phases de propfirm est retiré** du Dashboard (il reste dans le Journal, où il ne s'affiche que pour un compte propfirm).
- Rangée « Aujourd'hui » : **carte sessions façon météo** (ciel de l'utilisateur selon son fuseau `chest_timezone`, soleil/lune sur l'arc, une piste par place avec sa météo locale et son heure, curseur « maintenant ») — tout existe déjà dans `session-timeline.js`, on change seulement la mise en page ; annonces du jour ; force des devises en barres divergentes.
- Rangée basse : derniers trades (tableau) + signaux des scanners (logo, paire, unité, il y a…, pastille).

## 2. Calendrier — `calendar.html`, `js/calendar.js`

Maquette `Calendrier.dc.html` (interactive).
- Héros centré : badge Haussier/Baissier/Neutre, paire en 112 px, nom, **mouvement attendu en %** sur la semaine (ex. « +2,1 % de hausse attendue »), jauge de −3 % à +3 %, mention « Prévision verrouillée lundi », phrase d'analyse.
  - **[NOUVEAU / à valider]** aujourd'hui le héros montre un score converti en %. Le « +2,1 % » attendu peut se calculer à partir des impacts estimés par annonce (« Est. XAU », calibration `data/impact-calibration.json`) dans le sens de la prévision. Demander à l'utilisateur la formule avant de coder.
- Semaine passée : **une seule ligne discrète sous la jauge** (prévu, réalisé ✓/✕, 12 dernières semaines en petits points) + un point gris sur la jauge. Plus de bloc séparé. (Données : `renderWeekResult` existant.)
- **Supprimé** : « D'où vient la prévision ».
- 01 — Les trois annonces qui décident : 3 cartes (devise, jour + heure, effet attendu, Prévu | Précédent, une phrase). Clic = ouvre le livre de l'annonce.
- 02 — La semaine : **filtre « Force du marché » ★★★ / ★★☆ / ★☆☆** (boutons, multi-sélection, jamais de menu déroulant ; reprendre les `.imp-pill` existants), puis 5 colonnes Lun→Ven, jour courant teinté, trait « maintenant ».
- 03 — Bibliothèque : **un étage par jour**, livres plus petits (épaisseur = impact), seulement les annonces qui touchent la paire suivie ; **le filtre de force s'applique aussi à la bibliothèque**. Clic sur un livre = livre ouvert en double page sous la bibliothèque (ce que c'est, pourquoi la paire réagit, Prévu / Réel / Précédent, effet attendu, 6 dernières publications en écart au prévu).

## 3. Backtesting — `backtesting.html`

Maquette `Backtesting.dc.html` (interactive). Le héros « À la une » existant est conservé et aligné sur la DA 2.0.
- Onglets soulignés pour choisir l'algorithme mis en avant ; nom en 76 px ; description ; profit en 104 px ; « de X à Y · période » ; 4 faits (PF, réussite, DD max, positions) ; boutons ; courbe pleine largeur.
- 02 — La bibliothèque en chiffres (bandeau de 4 KPI), 03 — Algorithmes (filtre Tous/Or/Forex/Indices, cartes verre avec courbe verte/rouge sur le 0, tuile d'ajout en pointillés).
- **Aucun logo** dans le héros ni sur les cartes. Une étoile ★ marque la carte mise en avant.

## 4. Journal — `journal.html`

Maquette `Journal.dc.html` (interactive).
- Héros centré : **onglets des journaux** (comme Backtesting) + « + Nouveau journal », nom du journal en 64 px, type, P&L cumulé en 100 px (vert ou rouge), période, boutons, légende des journaux, courbe pleine largeur.
- Bandeau de 5 KPI.
- **Conditions du compte et mois jour par jour côte à côte** (2 colonnes, une seule colonne de conditions, cases du mois 48 px). Les conditions ne s'affichent que pour un compte propfirm.
- Positions dans la fenêtre verre (filtres Toutes / Gagnantes / Perdantes / Hors protocole).
- 05 — **Tes journaux** : cartes de tous les journaux (pastille Propfirm / Compte propre, courbe, P&L, trades, réussite) + tuile « Nouveau journal ». C'est le hub actuel, placé sous le journal ouvert.

## 5. Stratégies — `strategies.html`, `js/scanner-chart.js`, `js/scanner-guides.js`

Maquette `Strategies.dc.html` (interactive).
- Héros du scanner : vrai logo, nom en 72 px dégradé blanc, phrase, 3 faits (réussite 90 j, R moyen, signaux 30 j), mot fantôme « Scanner », lueur de la couleur du scanner.
- **La barre reste celle d'avant** (`.scnr-topbar` : Scanner, Marché, Paire, Unité de temps 1m→1D, dernière alerte, cloche, affichage du graphique) avec le nouveau style.
- **Volet des scanners** (clic sur « Scanner ») : liste verre des scanners avec logo, marché, réussite 90 j, dernier signal, état de l'alarme. Voir aussi `Elements.dc.html` §03.
- Graphique dans la fenêtre verre (onglets Graphique / À propos inchangés).
- Sous le graphique : **Signal en cours** (tuile verte, niveaux, bouton « Calculer mon lot ») et **Derniers signaux**.

## 6. BERICH — `berich.html`, `js/berich-app.js`, `css/berich-plan.css`

Maquette `Berich.dc.html` (interactive). **Toutes les fonctions actuelles sont conservées**, seule la présentation change.
- Bandeau « Signal en cours » (`renderSignal`) en haut.
- Héros (`renderHero`) : logo, état du VPS (`renderWatch`), ligne du plan (`renderPlanLine`), capital / résultat en 104 px, sous-ligne, **vues** Mon plan / Mes positions / BERICH I / BERICH II et **périodes** 30 j / 90 j / 1 an / Tout (`renderControls`), courbe pleine largeur, positions ouvertes, 5 KPI.
- 01 — Automatisation (`renderAuto`) : 3 étapes Signal → Plan → Compte, avec leurs états (fait / en attente / à faire) et leurs liens.
- 02 — Projection (`renderProj`) : éventail des futurs, anneau de réussite, médiane, fourchette 8 sur 10, creux probable, « Comparer d'autres réglages », « Refaire le quiz ».
- 03 — Performances (`renderPerf`) : onglets d'algorithme (★ = algorithme du plan), 3 cartes Depuis toujours / L'année dernière / Cette année avec R, %, euros et 7 faits.
- 04 — Registre (`renderLedger`) : filtres, tableau, « Afficher 10 de plus ».
- 05 — Sessions et 06 — Sens & durée (`renderInsights`).
- Section admin « Plans à rattacher » inchangée (non dessinée).

## 7. School — `school.html`, `js/school-hub.js`

Maquette `School.dc.html`. Héros centré (« Prêt pour jeudi ? », éducateur, 4 faits) ; Cette semaine (7 jours, appels CHEST en dégradé, appels de l'éducateur en vert) ; prochain appel, missions à cocher, infos ; scanner de référence + « Avant de trader aujourd'hui » ; cours en tuiles. Vues éducateur et admin : même DA, mêmes données qu'aujourd'hui.

## 8. Compte — `account.html`

Maquette `Compte.dc.html`. Reprend **la page actuelle** : héros centré (« Ton espace », avatar, nom, e-mail + rang, 4 faits), 01 — Comptes de trading (une ligne par compte), 02 — Réglages par groupes. **Lignes plus serrées** : 50 px de haut, titre et valeur sur la même ligne, boutons 32 px. Le volet de réglage existant (`.drawer`) prend le style de `Elements.dc.html` §05.

## 9. Espace éducateur — `educator.html`, `js/educator.js`, `js/edu-notes.js`, `js/consent.js`

**Même structure, mêmes données que la page actuelle** ; seul l'habillage change. Maquettes (page 4 du canvas) :

| Maquette | Ce qu'elle montre | Code existant |
| --- | --- | --- |
| `Educateur.dc.html` | Vue d'ensemble : commission du mois en héros, `#edRate`, alerte BERICH `#edAlert`, 4 `#edKpis`, lien `#edInvite`, 12 mois `#edMonths`, `#edRecent` | `render()` |
| `Edu-Membres.dc.html` | `#edMembers` (+ colonne « Prochain appel » si la donnée `mentor.next` est servie, sinon la retirer) | `render()` |
| `Edu-Fiche.dc.html` | Fiche `#edSheet`, sections 01 Rang → 06 Paiements, connexion BERICH clé en main | `renderSheet()` |
| `Edu-Notes.dc.html` | `#edNotes` (liste + éditeur) | `js/edu-notes.js` |
| `Edu-Portefeuille.dc.html` | `#edCard` (Wallet), `#edWithdraw`, `#edPay`, `#edTx` | `render()` |
| `Edu-Accueil.dc.html` | Choix du code de référent (`#edCodeForm`) + fenêtre de la Charte | `render()`, `CHESTConsent.ensureEducator()` |

[NOUVEAU / à valider] les 3 étapes « Demande · Vérification sous 48 h · Virement » sous le formulaire de retrait.

## 10. Admin — `admin-members.html`, `js/admin-members.js`, `css/admin-members.css`

**Même structure que l'admin actuel** (7 vues, volet latéral, fenêtre Privilège), mêmes données ; seul l'habillage change. Maquettes (page 3) :

| Maquette | Vue / élément | Code existant |
| --- | --- | --- |
| `Admin.dc.html` | Vue d'ensemble : `#amKpis`, `#amChart` + `#amMetrics`, `#amWatch`, `#amMix`, `#amFunnel`, `#amPages` | `renderOverview()` |
| `Admin-Membres.dc.html` | `#amChips`, `#amFilter`, `#amRows` | `renderMembers()`, `rowHtml()` |
| `Admin-Fiche.dc.html` · `-Acces` · `-Activite` | `#amDrawer`, onglets Aperçu / Rôle et accès / Activité + Historique | `renderDrawer()` |
| `Admin-Rangs.dc.html` | `#amSpectrum`, `#amRanks` | `renderRanks()` |
| `Admin-Engagement.dc.html` | `#amSteps`, `#amArrivals`, `#amTop`, `#amNudge`, `#amGhost` | `renderEngagement()` |
| `Admin-Ventes.dc.html` | `#amSalesKpis`, `#amSalesEdu`, `#amSalesList` | `renderSales()` |
| `Admin-Educateurs.dc.html` | `#amPayouts`, `#amEdu` | `renderEducators()` |
| `Admin-Systeme.dc.html` | `#amOpsMode`, `#amOpsPages`, `#amOpsMsg`, `#amOpsSave` | `renderSystem()` |
| `Admin-Privilege.dc.html` | `#amGift` | `openGift()` |

Badges de rang : toujours `js/rank-badge.js` (`CHESTRank`), couleurs de `TIERS`.

## 11. Pages d'entrée et de transition (page 2 du canvas)

**Fond : la vraie aurore de `js/hero-bg.js`** (shader + neige, celle de la connexion et du Welcome). Dans les maquettes c'est une image fixe du rendu (`assets/aurora-chest.webp`) ; sur le site, garder le canvas animé `CHESTHeroBg.init(...)` et ne pas le remplacer par l'image.

| Maquette | Page du site |
| --- | --- |
| `Connexion.dc.html` | `login.html` / `/connexion` (et la connexion intégrée à `app.html`) |
| `T-Inscription.dc.html` | `signup.html` / `/inscription` (code de référent verrouillé via `?ref=`, case de consentement) |
| `T-Questionnaire.dc.html` | `offres.html`, étape 01 (questionnaire `Q`, rail `#ofSteps`) |
| `Offres.dc.html` | `offres.html`, étape 02 (onglets Premium / Essentiel, 3 rangs, essai 7 jours) |
| `T-Paiement.dc.html` | `CHESTConsent.purchase()` (`js/consent.js`) |
| `T-Validation.dc.html` | `offres.html`, étape 03 (`#ofWaitTitle` : en cours / validé / trop long) |
| `T-Welcome.dc.html` | `#chestWelcome` dans `app.html` (`js/welcome.js`, `css/welcome.css`) |
| `T-Conditions.dc.html` | `CHESTConsent.ensureTerms()` |
| `T-Verrou.dc.html` | `CHESTPlan.lock()` (`js/plan-gate.js`) |
| `T-Maintenance.dc.html` | `#chestMaint` + `#chestMaintPill` dans `app.html` |
| `T-Rejoindre.dc.html` | `join.html` / `/rejoindre/<CODE>` |

[NOUVEAU / à valider] : bandeau « on te conseille Premium » au-dessus des offres, 3 cartes « Ton éducatrice / BERICH clé en main / School complet » après paiement, pastilles d'état sur la page de maintenance, contenus de la newsletter (repris des cartes actuelles).

## 12. Éléments intermédiaires — `Elements.dc.html`

| Élément | Fichier du site |
| --- | --- |
| 01 Calculatrice de lot (bouton rond rose en bas à droite de chaque page) | `js/lot-calculator.js` |
| 02 Menu replié | `app.html` + `js/nav.js` (classe `.is-collapsed`) |
| 03 Volet des scanners | `strategies.html` (`.scnr-menu`) |
| 04 Notifications | `js/notifications-store.js` |
| 05 Volet de réglage | `account.html` (`.drawer`) |
| 06 Confirmation | `js/confirm-dialog.js` |
| 07 Message court | `showToast()` de `js/nav.js` |
| 08 Quiz BERICH | `js/berich-quiz.js` |
