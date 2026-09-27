# CHEST — brief de reprise de projet

Ce fichier existe pour qu'une session Claude Code fraîche (autre machine, autre installation) retrouve immédiatement le niveau de contexte accumulé sur ce projet — vision, architecture, décisions techniques, goûts de l'utilisateur, pièges déjà rencontrés. Lis-le en entier avant de toucher au code.

Ce fichier vit dans `projects/chest/` et complète (ne remplace pas) le `CLAUDE.md` racine du dossier `Sites/` (le framework général "Elite Web Designer" — goûts de design par défaut, anti-patterns IA à bannir, références de niveau). Si seul ce dossier `chest/` a été copié sur la nouvelle machine, la section "Goûts et méthode de travail de l'utilisateur" ci-dessous résume l'essentiel de ce framework général appliqué à ce projet précis.

## Le projet en une phrase

**CHEST** est une plateforme de trading personnelle (usage strictement privé, pas public) pour un seul utilisateur : dashboard de comptes façon FTMO, hub de backtesting (algos figés + système self-service pour en ajouter sans coder), stratégies façon TradingView, calendrier économique avec analyse de sentiment (forex, matières premières, crypto), et un compte pour les réglages. Site multi-pages statique — pas de framework, pas de build, pas de backend (sauf un micro-service Railway pour le calendrier).

## Stack & architecture

- **HTML/CSS/JS statique pur**, aucune dépendance Node/build sur cette machine — vrai site multi-pages (un fichier `.html` par page), pas une SPA.
- Fondations partagées entre toutes les pages : `site/css/tokens.css` (variables de couleur, thème sombre/clair, composants de base : `.card`, `.btn`, `.pill-group`, `.eyebrow`...), `site/css/layout.css` (sidebar off-canvas + topbar), `site/js/theme.js` (toggle sombre/clair persistant), `site/js/auth.js` (gate d'accès), `site/js/nav.js` (ouverture/fermeture sidebar).
- **Gate d'accès** (`site/index.html` + `js/auth.js`) : filtre **côté client uniquement** (hash SHA-256 du code dans `localStorage`, flag `sessionStorage` pour la session déverrouillée). Ce n'est **pas** une vraie sécurité — décision assumée et acceptée par l'utilisateur pour un usage perso. Chaque page protégée appelle `CHESTAuth.guard()` dans son `<head>`.
- Code d'accès par défaut : `2123`.
- Librairies externes (toutes via CDN, jamais installées) : Chart.js 4.4.0 (courbes d'équity), SheetJS/xlsx 0.18.5 (import Excel côté navigateur), flag-icons 7.2.3 (vrais drapeaux SVG — **jamais** d'emoji drapeau, ils s'affichent en texte brut "US"/"EU" sur Windows faute de police dédiée, bug plateforme réel et non contournable en CSS).

## Site unifié : shell `app.html` (PRIORITAIRE sur la description multi-pages ci-dessus)

Le site se comporte comme **un seul produit** : `app.html` est le shell (sidebar repliable + topbar avec fil d'Ariane « catégorie / page » + barre de progression) et charge chaque page dans l'iframe `#chestView`. La sidebar et la topbar ne se rechargent jamais ; seul le contenu change (fondu + progression).

- **Pourquoi une iframe et pas un échange de contenu (pjax)** : chaque page a des IIFE inline, des écouteurs `document`/`window`, des minuteries et des instances Chart.js qui fuiraient ou planteraient si on les échangeait à chaud. L'iframe les isole sans réécrire les pages.
- **`js/theme.js` (premier script du `<head>` de chaque page)** détecte le contexte : dans une iframe → `html.is-embedded` (le CSS cache alors la sidebar/topbar propres à la page) ; page applicative ouverte à nu → `location.replace('app.html#/page?query')` ; pages d'auth (`login`, `signup`, `index`) → sortent de l'iframe via `top.location`.
- **`js/shell.js`** : table `PAGES` (catégorie, libellé, entrée de menu à allumer — ex. `backtest-view` allume « Backtesting »), routage par hash `#/page?query`, synchro iframe → shell (adresse via `replaceState`, titre, fil d'Ariane, entrée active) et fondu de sortie via `postMessage('chest:nav-start')` envoyé par `beforeunload`. Le thème se synchronise par l'évènement `storage`. Le bouton Retour du navigateur fonctionne (historique de l'iframe).
- **Ajouter une page** : créer le `.html` avec le même `<head>`/CSS que les autres, l'ajouter à `PAGES` (`shell.js`) et à `APP_PAGES` (`theme.js`), et un lien `href="#/nom"` dans la sidebar d'`app.html`.
- **Ne pas** tester la création de compte/connexion contre le backend local réel (`accounts.db`) : ça crée de vrais comptes.
- Les pages `backtesting-swyper.html` / `backtesting-allin.html` (legacy) ne sont plus liées nulle part et restent hors shell.
- Feuilles de style : `css/chest-da.css` (design system + shell) puis `css/patch-chest-da.css` (correctifs par page fournis par la DA, chargé après). Incrémenter le `?v=` à chaque modification. Attention : un `sed` sur `chest-da.css?v=N` modifie aussi `patch-chest-da.css?v=N` (sous-chaîne).
- Calendrier : `calendar.html` suit la maquette 5a en sections numérotées (hero → 01 annonces motrices → 02 semaine passée → 03 publications), habillées par `css/calendar-da.css` (chargé après le patch, préfixe `.chest-root` pour l'emporter sur ses `!important`). `calendar.js` masque `#econBlocks` en mode crypto.
- Volet rabattable : bosse SVG ouverte (sans `Z`) dont le trait ne suit que la courbe ; règles dans `chest-da.css` avec sélecteurs plus spécifiques que le patch. Ne pas re-fixer la taille du fond en 13×13 (la règle générique `.chest-sidebar__toggle svg` l'écrasait).
- Logo BERICH : `assets/logo-berich.png` est un PNG détouré (vrai canal alpha), sans `mix-blend-mode`.

## DA CHEST — référence pour TOUTE nouvelle fenêtre, modale, page ou composant

Validée par l'utilisateur le 2026-09-20 (« vraiment super »). Tout ce qui est créé pour CHEST doit être fait dans ce style, sans qu'on ait à le redemander. Sources de vérité : `site/css/chest-da.css` (jetons `--chest-*` et composants), `site/css/patch-chest-da.css`, `site/css/calendar-da.css` (patron « sections numérotées »), `CHEST DESIGN/CHEST-DA.md`, maquette `CHEST App.dc.html`.

- **Base** : fond `#050505`, encres `#f6f6f7` / `#9b9ba1` / `#5c5c63`, accent dégradé `#fc1283 → #f9a45e`, vert `#33e6a6`, rouge `#ff4d5e`, ambre `#e8b339`, police Instrument Sans, chiffres tabulaires. Jamais de gris « ancienne carte », jamais d'emoji comme icône (SVG en ligne).
- **Fenêtres / modales / cartes = verre liquide** : bordure 1px `rgba(255,255,255,.12–.14)`, rayon 16–20, fond dégradé sombre + `backdrop-filter: blur(22–34px) brightness(.34–.62)`, reflets internes `inset 1.5px` blancs, filet clair en haut (voir `.chest-glass`, `.chest-glass--mini`, `.lotcalc-modal`).
- **Typographie** : étiquette `10px / .24em / majuscules / ink-3` avec numérotation (« 01 — Titre ») ; grands titres 700, interlettrage −.045em ; grands chiffres avec ombre de texte colorée (vert/rouge selon le signe).
- **Champs** : hauteur 42, rayon 12, fond `rgba(255,255,255,.03)`, **anneau rose au focus** (bordure `rgba(252,18,131,.6)` + halo 3px `.15`). Bouton principal `.chest-btn` (pilule dégradée), secondaire `.chest-btn-2`, bascules `.chest-seg` (actif = fond encre).
- **États** : positif vert / négatif rouge, séparateur orange 2px entre paires « Prévu | Réel », survol = bordure orange `rgba(249,164,94,.5)` + léger soulèvement.
- **Mouvement** : court et doux (.2s, `cubic-bezier(.16,1,.3,1)`), `prefers-reduced-motion` respecté. Toujours vérifier bureau ET mobile (<640px), sans débordement horizontal.
- **Pièges** : une règle générique `.x svg{}` écrase les tailles de composants ; le patch utilise `!important`, donc préfixer par `.chest-root …` ; ne pas mettre de couleur sur `a` globalement.

## Rapport de backtest : recommandation prop firm / compte propre

`backtest-view.html` suit la DA (`css/backtest-da.css`, sections `01 Deux possibilités → 02 Détail → 03 Recommandation → 04 Mensuel → 05 Journal`). La section 03 est calculée par deux fichiers :

- **`js/propfirm-rules.js`** : règles des challenges, **uniquement lues sur les pages officielles** (lien + date de page + date de vérification). Un champ non trouvé reste `null` / listé dans `unverified[]`, jamais deviné. Modèles vérifiés le 2026-09-20 : FTMO 1 et 2 étapes, FundedNext Stellar 1/2/Lite, The5ers Hyper Growth et High Stakes, Funding Pips 2 étapes Flex. **Ne jamais copier la base d'un concurrent (Futurizq) ni compléter de mémoire** : ces règles changent souvent (ex. FTMO a maintenant un 1 étape à perte max suiveuse et règle du meilleur jour) ; pour ajouter ou rafraîchir une firme, relire sa page officielle et dater l'entrée.
- **Ce qui compte n'est pas de valider mais de RETIRER** : chaque modèle décrit le challenge ET le compte financé (`funded` : perte du jour, perte max fixe ou suiveuse, règle de cohérence, `payoutOptions[]` avec partage, 1er retrait, cycle, jours profitables, croissance minimale, cohérence), le risque max par trade (`riskCapPct`) et les frais (`fee.pct`, `verified`, remboursement). Types de perte max : `static` et `trailing_eod` (plancher suiveur recalculé APRÈS MINUIT sur le plus haut solde de fin de journée).
- **`js/propfirm-fit.js`** : simule la vie complète d'un compte depuis chaque jour de la période sélectionnée en haut de page (≤ 240 départs), jusqu'à la fin de cette même période (**plus d'horizon fixe en mois — voir plus bas**) : challenge → compte financé → retraits → compte perdu → rachat (3 achats max). Un retrait est REPORTÉ tant que la règle de cohérence n'est pas respectée (le meilleur jour pèse trop dans le profit du cycle). Le risque conseillé est le plus rentable parmi ceux qui perdent < 0,5 compte par période ; le classement se fait sur les retraits nets (après partage, frais et remboursements). Sortie : retraits potentiels (% et $ pour 100 000 $), validation, 1er retrait, comptes perdus, pire quart des départs, comparaison au compte propre (`optimizeCp`) sur la même fenêtre. **Validation en jours = médiane ET moyenne (2026-09-22, demande utilisateur)** : `evaluate()` calcule `medianFundedDay` et `meanFundedDay` sur le même échantillon (un départ par date de l'historique, jusqu'à `MAX_STARTS=240`) ; la moyenne est affichée à côté de la médiane dans la phrase du verdict, le KPI « Validation », le KPI « Premier retrait » et le détail de chaque option de retrait (`backtest-view.html`) — utile quand la distribution des durées de validation est étalée (peu de départs très longs tirent la moyenne vers le haut sans bouger la médiane). **UI (décision utilisateur)** : pas de bloc « règles de cohérence » ni de cartes comparatives — la cohérence est seulement PRISE EN COMPTE dans le calcul et dite pour le modèle recommandé ; le volet dépliable du verdict ne montre que le **top 3** (classé par retraits nets, puis risque le plus bas).
- **Risque du challenge découplé du risque une fois financé (2026-09-22, retour utilisateur : « pourquoi Swing valide plus vite que Standard, les règles du challenge sont pourtant identiques ? »)**. Avant : un seul `riskPct` servait à TOUT le cycle (`lifecycle(P, start, m, opt, riskPct, horizonDays)`). Problème concret : FTMO Standard interdit la détention le week-end **uniquement sur le compte financé** (`holding.appliesTo:'funded'`, jamais pendant le challenge — vérifié dans `js/propfirm-rules.js`) ; pour une stratégie qui traverse le week-end, le compte financé saute presque à coup sûr, donc pour limiter la casse (rachats, `MAX_PURCHASES=3`) le calcul choisissait un risque très bas — et ce même risque bas, réutilisé pendant le challenge, ralentissait alors la validation, alors que les règles du challenge (objectifs, perte du jour, perte max, jours minimum) sont **identiques** entre Standard et Swing. Résultat observé sur ALLIN 2.0 / 12 mois avant la correction : Standard mettait `lostPerStart` en pièces (jusqu'à 3, le max) à tout niveau de risque, avec une moyenne de validation autour de 245 j.
  - **Après** : `lifecycle(P, start, m, opt, riskPct, horizonDays, fundedRiskPct)` prend deux risques — `riskPct` pendant le challenge (`stage===0`), `fundedRiskPct` une fois financé (`stage===1`), chacun appliqué à `P.rr[i]` selon le stage courant. `bestChallengeRisk(P, starts, m, horizonDays, wMax)` (nouvelle fonction) cherche, **une seule fois par (firme, money management)** — indépendamment de l'option de retrait, qui ne joue aucun rôle avant d'être financé — le risque de la grille `RISKS` qui **valide le plus vite sans jamais descendre sous 90 % de départs validés** (jamais au prix de la fiabilité). `evaluate(P, starts, m, opt, challengeRisk, risk, horizonDays)` reçoit ce risque en plus du risque financé (`risk`, cherché comme avant sur la grille `RISKS`, filtrée par `riskCapPct`) ; les deux sont propagés jusqu'à `row.challengeRisk` / `row.best.risk`. **Vérifié sur ALLIN 2.0 / 12 mois** : le challenge de FTMO Standard et Swing convergent maintenant vers exactement le **même** risque (0,50 %) et la **même** moyenne de validation (155,0 j, identique aux deux décimales) — ce qui est correct puisque les règles du challenge sont identiques ; seul le risque UNE FOIS FINANCÉ diverge (Swing 0,75 % / +55,8 % net ; Standard forcé à 0,25 % / −1,1 % net, toujours déconseillé, mais pour la bonne raison — le compte financé saute, pas le challenge qui serait lent). Pour un money management fixe (« Ton réglage »), le découplage a aussi fait passer sa propre validation de 134 j à 87,9 j (même firme, même MM, juste plus rapide).
  - **UI** : `backtest-view.html`, `mmBlock()`/`chRiskNote(r)` — une phrase « Risque pendant le challenge : X % (cherché à part…) — une fois financé, le risque repasse à Y % » dans la fiche dépliée d'une firme, affichée seulement quand les deux risques diffèrent réellement (≥ 0,01 point d'écart).
  - **Coût** : `bestChallengeRisk` ajoute jusqu'à 9 balayages de `lifecycle` par (firme, money management), réutilisés pour toutes les options de retrait — mesuré ~4,8 s pour un horizon de 12 mois sur ALLIN 2.0 (candidats testés = flat + jusqu'à 4 MM), contre ~3 s avant. Reste dans le budget de la page (état de chargement déjà prévu).
- **Plus d'horizon fixe en mois (3/6/12) : la simulation tourne sur la période sélectionnée en haut de page (2026-09-22, décision utilisateur : « la corrélation entre la période du propfirm et du backtesting, ça faut enlever »)**. `#fitHorizon` (les boutons « 3 mois / 6 mois / 12 mois ») et `fitHorizon` sont supprimés de `backtest-view.html` ; la section 03 est désormais « 100 % sur la période mise en haut » (`selectedYears`, le même filtre que le reste de la page) — aucun contrôle séparé. Dans le moteur : `startIndexes(P)` n'a plus de filtre d'horizon (chaque jour distinct de `P` est un départ valable) ; `lifecycle`/`evaluate`/`bestChallengeRisk`/`windowReturn` reçoivent un `endDay` **partagé par tous les départs** (`P.day[P.n-1] + 1`, la fin de la période sélectionnée) au lieu d'un `horizonDays` compté depuis chaque départ — un départ pris tôt dans la période a donc naturellement plus de recul qu'un départ pris hier, plutôt que d'être exclu ou de déborder sur des trades hors sélection. `fit()` n'a plus `opts.horizonMonths` ; `horizonDays` (gardé, réutilisé par `scoreEv`/`annualized`) = la durée de la période sélectionnée elle-même (`spanDays`), plus l'ancien horizon arbitraire.
  - **UI (`backtest-view.html`)** : `periodShort()` / `periodLabel()` remplacent partout l'ancien `${H} mois` (label compact « 2025 » / « 2025-2026 », ou phrase « l'année 2025 » / « 2025-2026 ») ; `#fitAside` affiche en permanence sur quelle période et quel compte (compte propre/propfirm) porte le calcul.
  - **Bug découvert par ce changement, corrigé le même jour (retour utilisateur : « comment j'arrive à 49 % si chaque mois je retire mon profit, ta simulation est mauvaise »)** : sur une période PAS ENCORE TERMINÉE (ex. « 2026 » alors qu'on est le 22/09/2026), une grosse part des ≤ 240 départs tombe forcément proche de la fin des données disponibles et n'a presque plus de recul pour valider un challenge puis retirer quoi que ce soit (vérifié sur ALLIN 2.0 / 2026 : sur 178 départs, 57 avaient moins de 90 jours de recul, 5 moins de 7 jours). Faire la MOYENNE BRUTE des % de chaque départ (`meanNet = mean(nets)`) écrasait donc le résultat vers le bas à mesure que la sélection s'approche d'aujourd'hui — sans lien avec la vraie performance de la stratégie. **Correction** : `evaluate()` calcule d'abord un **taux mensuel par départ** (`% du départ ÷ mois de recul de CE départ`), moyenne ces taux (`meanNetPerMonth`, chaque départ pèse pour son rythme et non pour sa part du montant brut), puis étend ce rythme moyen sur la durée totale de la période sélectionnée pour obtenir `meanNet` (le chiffre affiché en KPI « Retraits potentiels »). Même correction appliquée au calcul `own` (compte propre, `windowReturn`) → `own.horizonPctPerMonth`. Sur ALLIN 2.0 / année 2026 en cours : `meanNet` passe de **+46 % à +71 %** pour FTMO Swing (le risque et le money management retenus changent aussi, car le classement des firmes utilise ce même chiffre corrigé) ; `own.horizonPct` passe de +465 % à +685 %. `medianNet`/`p25Net`/`netPositivePct` restent volontairement sur la durée PROPRE (variable) de chaque départ — gardés pour la dispersion, pas comme chiffre global ; `lostPerStart` (le seuil de sécurité `MAX_LOST_PER_START`) n'a PAS été renormalisé par mois — limite connue, à revoir si un biais similaire y est repéré.
  - **Nouveaux KPI demandés par l'utilisateur** : « Retrait moyen mensuel » (`b.meanNetPerMonth`, nouvelle 5e carte à côté de « Retraits potentiels ») et le montant global (`b.meanNet`, déjà affiché) explicitement présenté comme « étendu sur {période} » dans sa note — pour qu'on voie que ce n'est plus une simple moyenne brute. La phrase du verdict et la comparaison au compte propre mentionnent aussi le taux mensuel entre parenthèses.
  - **Deuxième correction, même jour (retour utilisateur : « avec une durée moyenne de 70j avant le premier retrait, ça exclut 2 mois et 10 jours, le calcul est toujours faux »)** : le taux mensuel ci-dessus divisait encore par le recul TOTAL depuis l'achat du challenge (`endDay - P.day[s]`), qui inclut les 1 à 10 semaines de validation où AUCUN retrait n'est possible par construction (`tryPayout` n'est appelé qu'en `stage===1`) — un départ récent, dont la majeure partie du recul est mangée par le challenge, ressortait donc avec un taux artificiellement bas. **Correction** : le taux mensuel n'est calculé QUE sur les départs financés (`o.fundedDay !== null`), et seulement sur le temps RÉELLEMENT FINANCÉ (`activeMonths = (endDay − (P.day[s] + o.fundedDay − 1)) / 30.4`, pas depuis l'achat du challenge) ; un départ jamais financé à temps n'entre plus du tout dans cette moyenne (il compte déjà dans `fundedPct`, pas dans le rythme). `meanNet` (le chiffre étendu affiché) répond donc à « une fois lancé, à quel rythme ça retire, étendu sur toute la période » — le temps de démarrage reste visible à part via les KPI « Validation »/« Premier retrait », il n'est plus mélangé dans le taux. Sur ALLIN 2.0 : 2026 seul passe de +71 % à **+94 %** (+11,0 %/mois, contre +8,3 %/mois) ; 2025-2026 (le réglage par défaut, celui où le compte propre affiche +1151 % en section 01) donne **+144 %** (+7,0 %/mois) pour la propfirm contre +597 % (+29,1 %/mois) pour le compte propre à risque optimisé — un écart de 4 à 8× selon la comparaison — plausible (partage 80/20, risque plafonné par la contrainte de sécurité `MAX_LOST_PER_START`, gains de la phase de challenge perdus au reset de phase) — plutôt que le ~10× observé avant cette correction.
  - **Troisième correction, même jour (retour utilisateur : « que je mette propfirm ou compte propre, aucune différence, j'ai pas tes chiffres »)** : les trois profils du calcul automatique étaient cherchés avec `E.optimizeProfiles(trades, capital0, 'pf', …)` **en dur**, quel que soit `mmDetailAccount` — seul le candidat « Ton réglage » (bâti sur `record.cp` ou `record.pf` selon le bouton choisi en section 01) dépendait vraiment du compte sélectionné. Dès que ce n'était PAS « Ton réglage » qui gagnait (ex. le risque plat, ou un des 3 profils auto), basculer « Compte propre » / « Propfirm » ne changeait donc RIEN à l'écran — exactement le symptôme signalé. **Correction** : `fit()` reçoit `opts.accountKind` (`backtest-view.html` passe `accountKind: mmDetailAccount`) et l'utilise pour choisir les profils auto ('cp' → Croissance/Meilleur ratio/Prudent, 'pf' → Régularité/Performance pure/Sécurité, `PROFILES` dans `backtest-engine.js`). Vérifié sur ALLIN 2.0 / 2025-2026 : compte propre retient maintenant « Croissance » (P 1,058 % → 0,529 % après 1 SL · L 0,066 % → pause après 5 SL · W 0,661 % → 0,496 % après 2 SL, +145 %, validation médiane 50 j) contre « Ton réglage » côté propfirm (+144 %, validation médiane 44 j) — deux money management RÉELLEMENT différents (avant : identiques dès que « Ton réglage » ne gagnait pas). Les chiffres finaux peuvent rester proches (les deux profils performent similairement sur cet historique) : ce qui comptait, c'est que le calcul ne soit plus figé sur un seul jeu de profils.
- **Pire/meilleur scénario sous les KPI « Retraits potentiels » et « Retrait moyen mensuel » (2026-09-22, demande utilisateur)** : `evaluate()` calcule le 10e et le 90e centile (`quantile`) du **rythme mensuel** (`monthlyNets`, déjà limité aux départs financés — voir la deuxième correction ci-dessus), pas du montant brut, pour rester comparables au chiffre moyen ; chacun est étendu sur la période sélectionnée comme la moyenne (`worstNet = worstNetPerMonth × spanMonths`, idem `bestNet`). Un centile plutôt que le départ le plus extrême isolé, pour qu'un seul départ hors norme ne domine pas l'affichage. UI (`backtest-view.html`) : une ligne « pire cas ≈ X % · meilleur cas ≈ Y % » ajoutée dans `.chest-kpi__note` des deux cartes, uniquement quand la donnée existe.
- **Verdict repliable : cliquer le badge « PF RECOMMANDÉE » déplie la phrase ET l'avertissement week-end ensemble (2026-09-22, demande utilisateur)** : `.bt-pill` (`css/backtest-da.css`) devient un `<button>` (était un `<span>`) avec un chevron rotatif (`.bt-pill__caret`, tourne via `[aria-expanded="true"]`) ; `paintFit()` (`backtest-view.html`) enveloppe la phrase du verdict (`fitVerdictText`) ET le bloc d'alerte week-end (`holdingAlert`) dans un même conteneur `#verdictDetail` (`hidden` par défaut — replié), ouvert/fermé ensemble par un seul clic sur `#verdictToggle`. Les deux vivent dans le même volet : jamais l'un sans l'autre.
- **Section 03 vérifiée sur DEUX backtests distincts (2026-09-22)** : `mmDetailAccount` (bouton « Compte propre »/« Propfirm » de la section 01) pilote bien toute la section 03 sur chacun — confirmé que basculer le compte change le money management retenu ET les chiffres, pas seulement sur le backtest testé lors de la correction initiale (voir troisième correction ci-dessus) mais aussi sur un second backtest (`bt_mucj1q1backrs1`) : compte propre → profil « Croissance » (auto), propfirm → « Ton réglage », deux money management réellement différents dans les deux cas.
- **Bouton « MM brut » : teste le réglage réel, non recalé (2026-09-22, demande utilisateur : « je veux trouver l'efficacité et la rapidité, quitte à s'exposer à quelque danger »)**. Constat qui a motivé la demande, vérifié sur ALLIN 2.0 / compte propre / année 2026 : la courbe brute (section 01, risque plat 1 %, aucune règle) donne +538,1 % avec un Max DD qui ne dépasse jamais 10 % sur tout l'historique — pourtant la section 03 ne recommandait que +95 % à un risque RECALÉ à 0,75 % (jamais le 1 % réellement utilisé). **Raison, pas un bug** : le Max DD de la section 01 est mesuré sur une courbe qui COMPOUND (le pic de référence grossit avec les gains, donc un creux tardif paraît minuscule en %), alors que le plancher de perte d'une propfirm est FIXE par rapport au capital financé (jamais gonflé par les gains) — une série de SL invisible sur la courbe compoundée peut suffire à cramer un compte à plancher fixe. Le moteur recalait donc le risque à la baisse pour rester sous son propre seuil de sécurité (`MAX_LOST_PER_START = 0,5` compte perdu / période), sans jamais montrer ce que donnerait le réglage RÉEL.
  - **Mécanique (`js/propfirm-fit.js`, `fit()`)** : `opts.rawMM` (transmis avec `opts.userConfig`) active `raw`. En mode brut, `candidates` ne contient QUE le candidat `'user'` (pas de risque plat, pas des 3 profils auto) ; pour chaque firme, `risks` n'est plus toute la grille `RISKS` filtrée par `riskCapPct` mais un seul point — `c.ref` (le risque moyen réel du réglage enregistré) — retenu seulement s'il respecte le plafond par trade de la firme (`m.riskCapPct`, une règle réelle, jamais contournée même en brut ; une firme dont le plafond est plus bas que le risque réel disparaît simplement des résultats). `pick(curve)` ne filtre plus par `MAX_LOST_PER_START` : le seul point est gardé tel quel, aussi dangereux soit-il — c'est tout l'intérêt du mode. `rows` filtre désormais les firmes sans aucun candidat viable (`.filter(Boolean)`, garde-fou nécessaire dès qu'un seul candidat peut disparaître) ; si TOUTES les firmes disparaissent (risque réel au-dessus de tous les plafonds), `fit()` renvoie une erreur dédiée plutôt que de planter sur `rows[0]` indéfini.
  - **UI (`backtest-view.html`)** : bouton toggle `#rawMmToggle` (« MM brut ») à côté de `#fitAside`, section 03 ; clic = `rawMM = !rawMM` + `renderFit()`. Clé de cache (`fitCache`) étendue avec `|raw`/`|opt` pour ne jamais réafficher un résultat en cache pour l'autre mode. Note dédiée (`.bt-note--warn`, ambre) remplace la note habituelle quand `res.meta.raw` est vrai, qui pointe explicitement vers le KPI « ≈ X compte perdu / période » à lire avant de se fier au chiffre.
  - **Vérifié en direct (ALLIN 2.0, année 2026, compte propre)** : brut désactivé → FTMO Swing, risque recalé 0,75 %, +95 %, ≈0,33 compte perdu/période. Brut activé → même firme, risque réel 1 % (`CONTRE 1 % → pause après 2 SL`, exactement le réglage enregistré, scale=1, aucun recalage), **+106 %** mais **≈1,02 compte perdu / période** — soit un compte cramé plus d'une fois par période en moyenne : le gain de rendement existe (+95 % → +106 %, pas le ×2 qu'on pourrait attendre naïvement d'un risque doublé) mais s'accompagne d'un coût réel (rachats de challenge à répétition) que le mode optimisé cachait. Vérifié aussi côté Propfirm (même backtest : firme recommandée change de FTMO Swing à FundedNext Stellar 1 étape en brut, +58 % à risque réel 0,5 %) et sur un second backtest (`bt_mucj1q1backrs1`) : toggle marche des deux côtés, remise à zéro correcte en désactivant, aucune erreur console.
- **Cohérence vérifiée firme par firme** (champ `consistencyNote` de chaque modèle) : FTMO 1 étape = meilleur jour ≤ 50 % du profit des jours positifs ; FTMO 2 étapes = aucune ; FundedNext = aucune sauf option « À la demande » (40 %) ; The5ers High Stakes = 50 % sur le compte financé (+ plafond de 2 000 $ par retrait, minimum 250 $) ; Funding Pips 2 étapes Flex = aucune sur les cycles bimensuels, 35 % sur le mensuel à 100 % (retrait minimum 1 %, jours minimum du challenge selon l'option). Le moteur choisit l'option de retrait qui convient le mieux à la stratégie.
- **Limites assumées et affichées** : trades clôturés seulement (pas de perte flottante), ni spreads ni slippage, règles d'annonces non simulées (signalées par modèle), départs qui se recoupent. **Tarifs** : chaque modèle a un champ `prices` (toutes les tailles de compte, prix affiché + tarif normal barré quand il existe, devise, notes, lien) relevé sur les pages officielles le 2026-09-20 ; l'UI les affiche dans la fiche dépliée (colonne gauche, sous « Règles officielles ») avec les autres modèles de la même firme en colonnes. Les frais de la simulation (`fee.pct`) viennent de ces prix (tarif normal du compte de 100 000 $ ; 50 000 $ pour The5ers Hyper Growth, plus grand compte proposé).
- **Smart Prop Trader** (cité par l'utilisateur pour sa cohérence à 45 %) : son site officiel redirige vers fxnity.com au 2026-09-20, aucune règle lisible → non simulé (liste `excluded` de `propfirm-rules.js`). Le moteur gère déjà une cohérence à 45 % dès qu'une source officielle existe.
- **Règles subtiles : week-end / nuit et comptes Swing** (décision utilisateur : les courtiers sont abandonnés, seule la reco prop firm reste). Chaque modèle a `holding` (`weekend`, `overnight`, `appliesTo:'all'|'funded'`, `swingModelId`). `propfirm-fit.js` détecte dans le backtest les trades qui traversent un samedi (`wk`) ou passent la nuit (`ov`) grâce à `open`/`close` ; un trade en violation FAIT PERDRE le compte (FTMO Standard financé, Alpha Pro qualifié, Topstep) et le compte Swing correspondant (FTMO 2 étapes Swing, Alpha Swing) le lève. L'UI affiche une alerte dans le verdict (incompatibles / Swing / firmes qui autorisent le week-end), l'avertissement dans « À surveiller » et un groupe « Comptes Swing » sous le top 3 avec règles et tarifs. Sans heures d'ouverture et de clôture : alerte « week-end impossible à vérifier ». FTMO : la restriction ne vaut que sur le compte financé Standard (pas pendant l'évaluation), le Swing n'existe qu'en 2 étapes, à choisir à l'achat, et aucune page officielle n'indique de surcoût (mêmes prix).
- **Firmes couvertes (13 modèles)** : FTMO 1 étape / 2 étapes / 2 étapes Swing, FundedNext Stellar 1 / 2 / Lite, The5ers Hyper Growth / High Stakes, Funding Pips 2 étapes Flex, Topstep Combine 50 000 (futures, abonnement, plancher `trailing_eod_lock`, retrait 50 % du solde, perte max 0 après le 1er retrait), Blueberry Funded Prime, Alpha Capital Pro 8 % et Swing. **Non simulées** (liste `excluded`) : Smart Prop Trader (signalée fermée depuis le 29/12/2024 par des sites d'avis tiers, domaine redirigé vers fxnity.com) et MyFundedFX (signalée fermée en février 2026, source tierce). Piège de lecture : la page Blueberry avait décalé les tailles de compte dans une extraction automatique — toujours revérifier les prix dans le vrai navigateur.
- **Pas encore fait** : plus de firmes fiables (E8 Markets, Apex, Tradeify, Blue Guardian…), autres modèles de Funding Pips (Zero, 1 étape Flex, 2 étapes Standard et Pro), plans de croissance (scaling), prix des tailles manquantes (Alpha, Blueberry hors 25 000-100 000 $).

## Règles « Si » (bonus du fichier) et Réglage premium

Le fichier importé peut porter des **bonus** : `source` (étiquette W/L/P…), `confirmation`, `order` et toute colonne inconnue conservée dans `trade.extra` (ex. « Facultatif » = TREND/CONTRE). `CHESTBacktestEngine.detectBonusFields(trades)` les liste (2 à 15 valeurs, renseignés sur ≥ 30 % des trades). Clés de champ : `source` | `confirmation` | `order` | `x:<en-tête>`.

- **Règle** : `{conds:[{field,value}], afterSl:number|null, risk}` stockée dans `cp.rules` / `pf.rules` (les paliers `tiers` restent, rétro-compatibles). `resolveRisk(trade, cfg, consecutiveSl)` : la règle la plus précise l'emporte (plus de conditions, puis plus de SL exigés, puis la plus basse dans la liste). **`risk: 0` = le trade est ignoré** (pause) : hors courbe et hors stats (`report.stats.skippedTrades`), mais son résultat continue de compter dans les séries de SL de son périmètre.
- **UI** (`backtest-add.html`, étape 4, design conservé) : chaque palier a un bouton « + Si » qui ouvre une petite fenêtre en verre listant les bonus détectés par catégorie (valeurs + nombre de trades) ; plusieurs conditions = ET (« + Et ») ; « Après N SL » devient facultatif dès qu'un « Si » est posé. Édition (`?edit=`) préremplit tout.
- **Réglage premium = le mode Automatique** (plus de bouton « Calculer le meilleur réglage » : les trois réglages se calculent tout seuls quand on active Automatique, à l'import d'un fichier, au changement de capital ou en cochant la propfirm ; `optimizeCp/optimizePf` ne servent plus qu'à `propfirm-fit.js`) = `optimizeProfiles(trades, capital, 'cp'|'pf')` : **trois profils** par compte, chacun avec son objectif (décision utilisateur, 3 colonnes). Compte propre : *Croissance* (gros risque réduit après une série de SL, sans cramer : DD ≤ 55 % + pire cas mélangé < 70 % dans 95 % des tirages), *Meilleur ratio* (rendement mensuel moyen / DD, DD ≤ 35 %), *Prudent* (DD ≤ 15 %, pire mois ≥ −8 %). Propfirm : *Régularité* (rendement mensuel moyen élevé ET stable), *Performance pure*, *Sécurité* (DD ≤ 6 %, jour ≤ 3 %, pire cas mélangé < 10 %) — toujours dans les limites 10 % / 5 %. Limites assouplies par étapes si rien ne convient (note affichée).
  - **Recherche** : exhaustive risque de base × palier « après N SL » (réduction ×0,1 à ×0,75), puis montée par coordonnées sur les règles « Si » (multiplicateurs 0 à 2 du risque de base) ; bonus testés seuls puis les deux meilleurs croisés ; élagage à ≤ 6 règles (au-delà, non applicable/collé à l'historique) ; groupes < 15 trades non réglés. Score de chaque profil = `PROFILES[...].score` dans `backtest-engine.js`.
  - **Généralités, pas coïncidences (décision utilisateur : le passé ne fait pas le futur)** : une règle « Si » n'existe que si son groupe pèse ≥ 30 trades ET ≥ 4 % de l'historique, si l'écart de gain moyen (R) face au reste a le MÊME SIGNE dans les deux moitiés de l'historique et est net (|z| ≥ 1,5) — `groupDirs` — ; le sens de la règle suit l'écart (moins bon → 0 / ×0,5 / ×0,75, meilleur → ×1,25 à ×2). Jamais de croisement session × jour (échantillons trop petits) ; seuls deux bonus explicites (étiquettes) peuvent être croisés. Règles applicables par un trader : une session entière (« risque 0,5 % pendant Londres »), un jour (« pas de mercredi »), une **plage d'heures contiguë** (« pas de trading de 1 h à 3 h », `scanWindows` : 1 à 6 h, ≥ 30 trades, |z| ≥ 2,3, même signe dans les deux moitiés, 2 plages max non chevauchantes), une étiquette. La règle-plage est `{field:'d:window', value:'1h-3h'}` (heures d'ouverture UTC, boucle possible « 22h-2h ») et se saisit aussi à la main dans « + Si » (catégorie Heures).
  - **Informations déduites** : `Session` (Asie 0-7h, Londres 7-12h, Londres × New York 12-16h, New York 16-21h, Soir, en UTC), `Jour` (Lun-Ven) et `Heures` viennent de l'heure d'OUVERTURE. **Toujours l'heure d'OUVERTURE, jamais la clôture** (inconnue à l'entrée) : « mercredi ignoré » = les positions OUVERTES un mercredi, même si elles se ferment le jeudi ; une position ouverte le mardi soir qui se ferme le mercredi est prise. Jour = jour calendaire de l'heure du fichier (pas de décalage de rollover). **Le week-end n'existe pas** : samedi et dimanche du calendrier du fichier (crypto non prise en compte) → ces trades n'ont ni session, ni jour, ni plage (exact pour un fichier TradingView en UTC+2 : le forex ouvre le dimanche 22 h UTC = lundi 0 h). **Jamais la durée de détention** : elle n'est connue qu'à la clôture (les SL sortent vite, les TP durent) — l'utiliser pour dimensionner serait tricher avec l'avenir (bug rencontré : gains × 10^12 aberrants).
  - **Fiabilité** : chaque profil est appris sur les 60 % premiers trades puis jugé sur les 40 % derniers (« jamais vus ») ; une logique « Si » n'est retenue que si elle bat le réglage sans règle sur ces trades ET garde ≥ 75 % du rendement mensuel ; sinon le profil est plat. Pire cas = DD max sur 300 ordres de trades mélangés (graine fixe) ; pour un profil qui l'exige le risque est baissé de crans jusqu'à passer. Tags UI : Fiable / Prudence / Non vérifiable. Défaut : Meilleur ratio (cp) / Régularité (pf). Cohérence : un profil ne peut pas être battu sur SON objectif par le réglage validé d'un autre profil (il l'adopte, avec une note). Régularité (pf) = meilleur ratio rendement / variation (par paliers de 0,05), puis rendement le plus haut parmi les réglages aussi stables — sinon elle se confondait avec Performance pure.
  - **Affichage (décision utilisateur : concis, explicite, qui ressort)** : chaque carte montre le money management en clair (« 3 % par trade, puis 2,25 % après 1 SL » + règles en phrases : « Pas de trading de 1h à 3h », « Pas de trading le mercredi », « Ignorer les trades Source L », « Session Londres : risque 0,5 % »), numéros en dégradé/lueur, règles colorées (rouge = ignorer, ambre = réduire, vert = augmenter) ; l'étiquette de fiabilité n'apparaît QUE si le profil n'est pas confirmé. Le panneau du profil choisi n'a plus de phrases : Money management, puis des pastilles lumineuses (« +19 828 % · 362 derniers trades · 37,4 % DD max · +13 906 % sans la règle « Si » »), puis Pire cas.
  - **« + Si » du mode Automatique (décision utilisateur)** : au-dessus des 3 cartes, un bouton « + Si » ouvre la liste des bonus détectés (2 à 6 valeurs : Source, Facultatif TREND/CONTRE, Jour, Session) ; en choisir un force `optimizeProfiles(..., {split: clé})` : CHAQUE valeur reçoit son propre money management complet (risque de base + palier après N SL), cherché indépendamment (`ascentSplit`, grille jointe base × palier par groupe, séries de SL comptées sur tout le compte), sous les mêmes limites et le même pire cas ; valeurs < 30 trades / 4 % → retombent dans « Autres trades ». Exprimé en règles moteur : `{conds, afterSl:null, risk}` + `{conds, afterSl:N, risk}` (prioritaires sur le palier global). Comme c'est imposé, le résultat est montré même s'il ne tient pas sur les trades récents (étiquette Prudence) et la pastille « sans séparer » donne la comparaison. `premium.split = {field,label,groups}` est stocké et restauré à l'édition ; un seul bonus à la fois (pas de croisement).
  - **Statistiques du panneau** : pas de bulles — nombre en grand (lueur verte/rouge/ambre), texte dessous, colonnes séparées par un filet vertical « | », une seule ligne pleine largeur (2 colonnes sur mobile).
  - Stockage : `cp.tiers` peut maintenant contenir le palier du profil en mode auto ; `premium = {profile,name,logic,perf,mult,avgM,posM,dd,holds}`.
- **Pistes** (bas de `backtest-view.html`, en petit) : `findInsights(trades)` compare le gain moyen (R) de chaque valeur de bonus au reste (≥ 30 trades, z ≥ 2,3), 2 pistes max, plus conseils « ajoute l'heure d'ouverture » / « ajoute une colonne de confirmation » quand elles manquent. Jamais présenté comme une prédiction.
- **Rapport** (`backtest-view.html`) : les cartes MM appliquent les règles et affichent « Règles « Si » / Réglage premium » + trades ignorés + tient/ne tient pas. La recommandation prop firm reçoit `weightOf` (risque de la règle ÷ risque de base ; règles avec `afterSl` ignorées, elles dépendent de la série de SL) via `CHESTPropFit.fit(..., {weightOf})` ; le compte propre de comparaison reste en risque plat.

## Recommandation propfirm avec money management

`CHESTPropFit.fit(trades, capital, {horizonMonths, userConfig, mm})` ne teste plus un simple risque plat par firme : pour chaque modèle il essaie plusieurs **money management** — sans MM (risque plat), le réglage propfirm enregistré du backtest (`userConfig`, « Ton réglage ») et les trois profils propfirm de `optimizeProfiles(…, 'pf')` (Régularité, Performance pure, Sécurité) — et garde celui qui retire le plus (même règle qu'avant : parmi les risques qui perdent ≤ 0,5 compte par période).
- Un MM = une **série de risques par trade** (`riskSeries` : paliers après SL, pause, logiques TREND/CONTRE séparées, décision à l'ouverture, séries en ombre — voir section moteur ci-dessous) ; elle ne dépend pas du capital, donc `prepare()` reçoit `weightOf(trade, index) = risque du trade / risque moyen de référence` (0 = trade en pause, retiré) et la grille `RISKS` fait varier ce risque de référence (le risque max d'un trade respecte `riskCapPct`).
- Sortie par firme : `row.mm` (`{name, refRisk, scale, lines}` avec `describeConfig` = une ligne par logique, ex. « TREND 0,734 % puis 0,244 % après 2 SL · CONTRE 0,551 % puis pause après 3 SL ») ou `null` si le risque plat suffit, et `row.flat` (résultat sans MM) pour afficher le gain. UI : KPI « Money management » du verdict, cellule Risque avec le nom du profil, bloc « Money management retenu » dans la fiche (comparaison avec le risque plat).
- **Indice de recommandation (0-100), plus « le plus gros retrait » (décision utilisateur)** : `scoreEv` = retraits nets 30 % (normalisés par le meilleur retrait net sûr toutes firmes) + rapidité du 1er retrait 15 % (1 − jours / horizon) + départs qui retirent 15 % + départs gagnants 15 % + challenge validé 10 % + comptes non perdus 10 % + retraits sans report de cohérence 5 %. Il sert à choisir, pour chaque firme, le money management, l'option de retrait et le risque (parmi ceux qui perdent ≤ 0,5 compte par période), puis à classer les firmes (`status` good/mid/bad d'abord, puis indice). **Priorité Swing** : si des positions traversent le week-end (`P.wkCount > 0` avec heures d'ouverture et de clôture), les comptes qui l'interdisent passent derrière et les comptes Swing (`swingModelId` d'un autre modèle) reçoivent +15 % sur l'indice (`rankScore`) ; badge « Swing » et bloc « Indice de recommandation » (barres par critère) dans la fiche de chaque firme.
- Limites : les MM sont calculés sur le même historique que la simulation (pas de test hors échantillon ici) ; ~3 s par horizon (cache par année/horizon). Sur ALLIN 2.0 / « test », Funding Pips passe de +51 % à +63 % de retraits nets sur 6 mois.
- **La section 03 bascule entre DEUX résultats distincts selon le compte choisi en section 01, jamais les deux à la fois (décision utilisateur, 2026-09-22, après un essai raté).** Premier essai le même jour : faire tester à la propfirm le money management du compte propre EN PLUS de celui de la propfirm, et tout afficher ensemble sur un même écran (5e KPI « Compte propre », puis un panneau `.bt-own` dédié) — **reverté** (`git revert` de 3 commits, retour à l'état d'avant) : l'utilisateur voulait deux VUES séparées de la même section, pas un mélange sur une seule page. Le bon modèle : `fitUserCfgFor(account)` (`backtest-view.html`) renvoie `record.pf` ou `record.cp` selon `mmDetailAccount` (le même bouton « Compte propre »/« Propfirm » que la section 01 « Deux possibilités », pas un nouveau contrôle) ; `renderFit()` passe ce réglage comme **le seul** `userConfig` de `CHESTPropFit.fit()` (candidat « Ton réglage »), et sa clé de cache (`fitCache`) inclut `mmDetailAccount` pour ne jamais réafficher un résultat resté en cache pour l'autre compte. Cliquer l'un ou l'autre bouton en section 01 **recalcule toute la section 03** (verdict, 4 KPI, tableau des firmes) avec ce réglage comme candidat testé — les trois profils auto restent ceux de la propfirm (`optimizeProfiles(…, 'pf')`, adaptés aux contraintes d'une firme), seul le « Ton réglage » change de source. `#fitAside` affiche en permanence lequel des deux est actif (« Money management « Compte propre/Propfirm » · règles vérifiées le … »). Vérifié sur ALLIN 2.0 : compte propre → +17 % (« Performance pure », 77 % validés, 1er retrait 86 j) ; propfirm → +18 % (« Ton réglage », 83 % validés, 99 j) — deux pages bien distinctes, jamais montrées en même temps.

## Moteur : chronologie réelle, séries par logique (référence = `allin-engine.js`)

Le money management de l'utilisateur (SWYPER/ALLIN) est la référence de sémantique ; `backtest-engine.js` la reproduit **au centime** (ALLIN 2.0 propfirm : 31 892 $ final, +218,92 %, DD 9,65 % — test à refaire si on touche `simulate`).
- **Décision à l'OUVERTURE, effet à la CLÔTURE** (`buildEvents`) : le risque d'un trade se décide en ne regardant que les trades DÉJÀ clôturés à son ouverture ; le capital bouge à la clôture ; clôture avant ouverture à égalité d'horaire. Décider à la clôture (ancienne version) voyait des trades terminés pendant que la position était ouverte : biais d'anticipation.
- **Séries de SL PAR LOGIQUE, en « ombre »** : une règle `{conds, afterSl:N, risk}` compte les SL consécutifs des seuls trades qui vérifient `conds` (TREND et CONTRE ont chacun leur série) ; un palier sans conditions compte tous les trades. Les trades en pause (risque 0) comptent quand même : « CONTRE à 3 SL d'affilée → 0 % jusqu'à son prochain trade non-SL ». BE et TP remettent la série à 0.
- **Paliers du calcul automatique** : après 1 à 5 SL, risque ×0 (pause), ×0,1, ×0,25, ×1/3, ×0,5 ou ×0,75.
- **Plus petit risque réalisable** (champ « $ par trade » du mode Automatique, 5 $ par défaut) : un lot minimum ne descend pas sous un montant (0,012 % de 10 000 $ = 1,2 $ est irréalisable) → `minRiskPct = $ / capital` ; aucun risque de base, palier ou multiplicateur n'y passe en dessous (la pause à 0 % reste permise). Sauvegardé dans `premium.minRiskUsd`.
- **Pourquoi l'automatique ne retrouvait pas le réglage de l'utilisateur (TREND 2 SL ÷3, CONTRE 3 SL → 0)** : série de SL globale au lieu de par logique ; trades en pause retirés de la série (une pause ne pouvait plus finir) ; pas de palier « pause » ni « ÷3 » ; décision à la clôture ; et surtout jamais de money management COMPLET par valeur d'une étiquette (seulement des multiplicateurs de risque). Désormais chaque étiquette (2 à 6 valeurs) est un candidat « séparé » (`ascentSplit`), et parmi les logiques qui tiennent sur les trades jamais vus on garde celle qui y fait le MIEUX (pas celle qui colle le mieux à l'apprentissage). Sur ALLIN 2.0 l'automatique retombe seul sur « Facultatif séparé » : CONTRE 0,6 % pause après 3 SL, TREND 0,5 % puis 0,125 % après 2 SL → +240 % pour 9,74 % de DD (l'utilisateur : +218,9 % pour 9,65 %). Le fichier de test à réutiliser : première ligne de `site/allin-engine.js` (`RAW_ALLIN20`, 871 trades, `source`=signal, `extra.Facultatif`=trend).

## Import : colonnes qui « trichent » et heures du fichier

- **Colonnes qui recopient le résultat ou le RR** (cas réel : une IA a mis TP2/SL/BE dans « Facultatif » et le RR dans « Facultatif 2 ») : `leakKind` les détecte (valeurs qui prédisent le résultat à ≥ 97 %, ou nombres égaux au RR) ; `detectBonusFields` les écarte (jamais de règle, de Réglage premium ni de piste dessus) et l'étape 3 affiche un avertissement (`detectLeakFields`). Sans ça l'automatique « ignorait les SL » (`Facultatif = SL → risque 0`) et sortait ×10^12 avec 0 % de DD. Le prompt de l'étape 1 interdit aussi de recopier résultat/RR ; une tendance TREND/CONTRE va dans « Confirmation » (`confirmation`, pas `x:Facultatif`).
- **Heures Excel lues telles quelles** : `xlsx-import.js` lit les dates en numéros de série (`cellDates:false`) et les arrondit à la seconde, comme des heures « murales » sans fuseau. Les dates locales de SheetJS décalaient de 1 à 2 h selon l'heure d'été et ajoutaient ~20 s (fuseau historique de Paris) ; un décalage uniforme ne change pas l'ordre des événements, donc pas le résultat, mais les frontières de jours/mois et les sessions bougent. Les heures du fichier ALLIN sont en UTC+2 (TradingView) : les sessions (définies en UTC) sont donc décalées de 2 h tant qu'il n'y a pas de réglage de fuseau.

## Journal : hub de journaux = familles (journal principal + comptes live Myfxbook)

`journal.html` = **hub** façon Backtesting (héros, 4 KPI, une carte par journal avec mini-courbe du solde, menu ⋮ Ouvrir / Modifier / Supprimer, carte « + Nouveau journal »). Cliquer une carte ouvre `journal.html?acc=<id>[&m=<membre>]`. **Un journal est une FAMILLE, comme au Dashboard** : en haut de la page, le sélecteur liste chaque journal (tête = vue agrégée) avec ses membres imbriqués — « Journal principal » (manuel) et un membre par compte live — et une flèche → au survol (« ＋ Ajouter un compte live »). `account.mode` : `'manual'` (journal principal saisi à la main, on peut y ajouter des comptes live quand on veut) ou `'auto'` (alimenté seulement par des comptes live ; « + Ajouter un trade » masqué ; à la création on est envoyé direct sur la modale d'ajout). `account.live[]` = comptes live `{id, name, email, password, accountId, demo, currency, info, lastSync, lastError, lastLimitReached, possibleGap, firstBatch}`.
- **Myfxbook fonctionne directement depuis le navigateur** (client `js/myfxbook-store.js`, API publique en CORS ouvert, déjà utilisée par le Dashboard : aucun serveur nécessaire — ne pas redire le contraire). Modale d'ajout : e-mail + mot de passe MYFXBOOK (pas ceux du broker) → login + `get-my-accounts` → choix du compte relié → ajout + première synchro. Identifiants gardés dans le navigateur (comme au Dashboard). `syncLiveAccount` lit `get-my-accounts` (solde, équité, DD, profit) + `get-history` (**50 dernières transactions seulement**), convertit (`mfxToEntry` : pnl = profit + swap + commission, RR = distance parcourue / distance au SL, tolère les clés `openTime`/`openDate`, résultats enveloppés dans des tableaux) et **ajoute à l'historique déjà importé** (`mergeExternal`, doublons ignorés par id, stock `chest_journal_ext` par compte live). Synchro auto à l'ouverture si > 5 min ; bouton « ↻ Synchroniser ». Avertissements : lot plein sans recouvrement (`possibleGap`) = des trades ont pu être ratés entre deux synchronisations ; premier lot plein = l'historique plus ancien n'est pas repris.
- `entriesFor(compte, membre)` : saisie manuelle du compte (les anciennes entrées sans compte vont au plus ancien) + positions BERICH (rattachées au premier journal manuel, plus d'interrupteur) + comptes live ; en vue agrégée une saisie manuelle qui double une position live (même paire/sens à ≤ 1 h) est masquée (le live prend le dessus). **Solde obligatoire** à la création d'un compte ; puces de tailles de compte tirées des tarifs du challenge ; un trade en % mémorise `riskValue`/`riskUnit`, donc son P&L suit un changement de solde. Supprimé à la demande de l'utilisateur : la rubrique « Sources et backtests » (BERICH / Automatique / backtests associés).

- **SL/BE remplissent le RR automatiquement à l'ajout manuel d'un trade (2026-09-22, demande utilisateur : « si je risque 1 % et que je mets SL sur un 100k, ça met direct -1000 $ »)** : SL = −1 R et BE = 0 R par définition (la perte d'un SL égale exactement le risque pris) — cliquer ces boutons dans `#jrRewardToggle` (`journal.html`) remplit désormais `#jrRR` (−1 ou 0) et appelle `reflectPnl()` tout de suite, sans que l'utilisateur retape le RR à chaque trade. `reflectPnl()` (déjà existant) fait le calcul réel : `pnl = RR × effectiveRiskAmount()`, où `effectiveRiskAmount()` lit `#jrRisk`/`currentRiskUnit` contre le solde du compte actif. Un TP garde son RR propre, saisi à la main (pas de valeur par défaut, chaque TP est différent). Vérifié : compte test 100 000 $ à 1 % de risque, clic SL → RR `-1`, P&L `-$1 000,00` ; clic BE → RR `0`, P&L `$0,00`.

## Journal : comptes propfirm (firme → challenge → étape)

Le formulaire « Nouveau compte » de `journal.html` (fenêtre centrée, 760 px, titre aligné dessus) propose **toute la liste BERICH** (`js/berich-brokers.js` : propfirms FTMO, Alpha Capital Group, Smart Fund Trader, TopStep, puis les brokers IG, IC Markets, Pepperstone…, ids préfixés `br_`) plus les firmes vérifiées de `js/propfirm-rules.js` absentes de BERICH (FundedNext, The5ers, Funding Pips, Blueberry Funded). Le menu est groupé « Propfirms » puis « Brokers (saisie manuelle des règles) » ; seules les firmes de `RULES_FIRM` (règles vérifiées) proposent challenge et étape, les autres (Smart Fund Trader, brokers) restent en saisie manuelle. Choix de la firme, puis du **challenge** (1 étape, 2 étapes, Swing, Lite…) et de l'**étape** (Phase 1 / Phase 2 / Compte financé) : perte du jour, perte max, objectif et jours minimum se remplissent (modifiables) et une carte « Règles » s'affiche juste dessous (challenge, compte financé, cohérence, week-end, retraits, frais, lien officiel daté). Le compte stocke `modelId` et `stage`. La connexion automatique passe par **Myfxbook** (voir section précédente ; API v1.38 : session liée à l'IP, heures du courtier, historique limité à 50 transactions). Les pages étroites (Ajouter un backtest, formulaire du journal) sont centrées.

## School (l'école) et visites guidées « i »

- **`school.html`** (+ `css/school-da.css` cours/schémas, `school-v2.css` accueil/portes, `school-v3.css` catégories/affiches, `js/school.js`, `js/school-data.js`) : menu « School » (catégorie « Formation »). Une page, plusieurs vues routées par `?v=` (`history.pushState`, Retour OK) avec fil d'Ariane : **accueil** (deux portes « Cours écrits » / « Cours vidéo », recherche, **Nouveautés** = rangée défilante des ajouts les plus récents d'abord + vidéo d'intro « Commence ici », raccourcis « Explorer »), **cours écrits** (`?v=written`, 4 catégories globales **Trading · UGC · Psychologie · Autres ressources**, puis `&s=<catégorie>` = cartes des éléments), **lecteur de cours** (`?c=base|vvs|psy&ch=`), **fiche** (`?n=`), **cours vidéo** (`?v=video`, deux sections **Mindset** et **Business**, `&s=`, Business = `&k=<catégorie>`).
- **Cartes** (décision utilisateur, style « Psychologie & Money Management ») : couverture 2:1 (image ou dégradé radial par teinte de catégorie `tone-pink|blue|amber|green` + icône), type, titre, description, action. Pas d'info en trop : les 4 catégories seulement sur la page « Cours écrits » ; « Autres ressources » regroupe par sous-titre (`sub` : Flyers & présentations, Crédibilité, Business & réseau, Liens & outils).
- **Catalogue = `js/school-data.js`** (généré une fois, puis maintenu à la main) : `shelves` (4), `items` (id unique, `shelf`, `sub`, `kind` = course|note|pdf|image|link|sheet|folder, `title`, `desc`, `meta`, `rank`, et **`tg: 'rubrique/message'`** = `https://t.me/c/2530313046/<rubrique>/<message>` ou `url`), `notes`, `videoSections`, `videoCats` (Trading, UGC, Marketing, Autres), `videoSeed` (23 vidéos + 4 playlists YouTube = rubrique Telegram « StepUp », section Mindset) et `videoPending` (**48 rediffusions** de la rubrique Telegram « Rediffusion », titre + durée + catégorie proposée, en attente de lien). **Récence** : `rank` = n° de message Telegram (globalement chronologique dans le groupe) ; un futur ajout porte `added: 'AAAA-MM-JJ'` et passe devant ; une vidéo ajoutée par l'utilisateur passe devant tout (horodatage). Rubriques Telegram (ids) : Rediffusion 2, Suivie Client 3, Suivie UGC 5, Suivie IBO 6, Flyer 9, Ressources annexes 10, Social Proof 381.
- **Contenu partagé, géré par l'admin uniquement** (décision utilisateur) : tout ce qui est ajouté dans School est enregistré **côté serveur** (`accounts-bridge/server.py` : tables `school_entries` / `school_meta`, fichiers dans `accounts-bridge/school_files/` sous des noms aléatoires, hors git) et visible par **tous les membres approuvés** ; seul un compte `is_admin` peut ajouter, modifier ou retirer (contrôlé côté serveur, l'interface masque juste les boutons). Endpoints : `GET /school` (membres), `POST /school/entries` (admin, multipart : champ `data` JSON + fichiers `file` et `thumb`, mise à jour si l'`id` existe), `POST /school/entries/<id>/delete`, `POST /school/seed` (une fois, remplit les vidéos de départ), `GET /school/files/<clé>` (lecture avec Range, clé aléatoire non devinable). Limite d'envoi 2 Go. Le client garde une copie `chest_school_cache` : serveur injoignable = bandeau « lecture seule ».
- **Plus aucune redirection vers Telegram** (décision utilisateur) : le champ `tg` du catalogue n'est plus jamais un lien. Un élément qui n'avait que `tg` (documents à téléverser) est un **emplacement « fichier à ajouter »** visible **de l'admin seul** (carte en pointillés) ; « Ajouter le fichier » ouvre le formulaire, et l'entrée serveur de même `id` remplace l'élément de base (retirer un élément de base = entrée `hidden:true`). Les membres ne voient que les éléments réellement disponibles.
- **Ajout d'un élément écrit (admin)** : bouton « + Ajouter un élément » (vue Cours écrits) ; type Fichier / Lien / Fiche (texte) ; titre, description, catégorie (Trading, UGC, Psychologie, Autres ressources) et groupe (Autres) ; **miniature facultative** (fichier ou Ctrl+V), sinon **créée automatiquement** : l'image elle-même pour une image, sinon la couverture générée aux couleurs de la catégorie. Envoi avec barre de progression (XHR).
- **Menu ⋮ + totale liberté d'édition, y compris les cours (2026-09-23, demande utilisateur : « les menus, pour que j'aie une totale liberté sur School »)** : les icônes séparées crayon/corbeille (et miniature pour les vidéos) sont remplacées par un seul bouton **⋮** (`toolsMenu()`, `js/school.js`) ouvrant un petit menu déroulant (`Modifier` / `Changer la miniature` pour les vidéos / `Retirer` en rouge) — même esprit que les vitrines de la Newsletter du Welcome. Un seul menu ouvert à la fois, se ferme au clic ailleurs ou à Échap. Remplace `.sc-ctile__tools`/`.sc-vcard__tools` (CSS mortes retirées de `school-v2/v3/v4.css`) par `.sc-tools` (`school-da.css`, seule source), toujours en `position:absolute` sur la carte (`.sc-ctile`/`.sc-vcard`/`.sc-poster`, qui ont donc dû gagner `position:relative`) — visible au survol/focus sur desktop, **toujours visible** sur mobile (pas de survol au tactile).
  - **Les cours statiques (`kind:'course'`, contenu de `school-data.js`) ont maintenant aussi ce menu** — jusqu'ici exclus (`it.kind !== 'course'`) alors que le mécanisme de retouche serveur (`allItems()` : une entrée `school_entries` de même `id` surcharge le catalogue de base, déjà utilisé pour cacher/retirer un élément de base) fonctionnait déjà pour eux structurellement ; seule l'interface les excluait. `itemForm()` détecte `kind==='course'` et bascule vers `courseForm()` — un formulaire **volontairement réduit** à Titre + Description + Miniature (pas de sélecteur Fichier/Lien/Fiche, pas de changement de catégorie) : un cours n'a ni fichier, ni lien, ni texte à gérer ici, son contenu (les chapitres) reste codé en dur dans `school-data.js`/le lecteur de cours. **Limite assumée, à dire explicitement si on redemande "plus de liberté" plus tard** : réécrire le CONTENU d'un cours (les chapitres eux-mêmes, texte + schémas) resterait un chantier séparé bien plus lourd (éditeur de texte riche) — non fait ici, seuls titre/description/miniature sont éditables pour un cours.
  - **Vérifié en direct contre le vrai serveur local (`accounts-bridge`, port 8080)** : édité le titre du cours « Ressources Trading » (ajout puis retrait d'un suffixe de test), sauvegarde et re-rendu corrects après rechargement de la vue ; menu ⋮ + formulaire complet (avec sélecteur de mode) toujours fonctionnels sur un élément non-cours (Fiche) — pas de régression ; menu à 3 entrées vérifié sur une carte vidéo (Mindset) ; fermeture au clic extérieur vérifiée ; bouton toujours visible en mobile (375px).
- **Vidéos** : entrées serveur `kind:'video'` `{section:'mindset'|'business', cat, title, speaker, desc, duration, url | file, thumb, pending}` ; catégories créées = entrées `kind:'cat'`. Source = **lien YouTube (vidéo ou playlist) / Vimeo** OU **fichier vidéo envoyé directement** (lu par `<video>`), miniature par défaut = **première image de la vidéo** extraite dans le navigateur (durée aussi). **Mindset** = cartes 16:9 ; **Business** = **affiches 9:16** filtrées par catégorie (création de catégorie depuis le formulaire ou « + Catégorie »). Les **48 rediffusions** de la rubrique Telegram « Rediffusion » sont des entrées `pending` (« À compléter », visibles de l'admin seul) en attente de lien ou de fichier ; les 23 vidéos et 4 playlists de « StepUp » sont en Mindset. Le premier admin qui ouvre School après la mise à jour du serveur déclenche le `seed`.
- **Décisions utilisateur** : Ressources Trading et VVS gardent les schémas d'origine du Notion (`assets/school/notion/*`) ; Psychologie garde des visuels générés. Le transfert Telegram → YouTube en masse n'est pas automatisé (dizaines de Go, enregistrements de tiers) : l'admin téléverse lui-même les fichiers (directement ou via YouTube). L'onboarding interne (Suivie Client/IBO : scripts d'appels, liens d'inscription) n'est pas repris.
- **Lire Telegram** : le navigateur intégré était connecté à `web.telegram.org` (groupe CHEST). DOM virtualisé : scroller de bas en haut par pas de 250 px et relever `.bubble[data-mid]` (id réel = `data-mid` − 4294967296) ; cliquer les rubriques avec de vrais clics (`.click()` JS ne bascule pas). Ne jamais envoyer ce contenu vers un serveur local : refusé par le garde-fou.
- Brancher une page : `js/shell.js` (`PAGES`), `js/theme.js` (`APP_PAGES`), lien `#/school` dans chaque sidebar, icône `.chest-ic-school` dans `chest-da.css`. Piège rencontré : deux éléments avec le même id (`#vTitle` en-tête et champ du formulaire) → `.value` undefined ; garder les ids d'en-tête préfixés `vh`/`w`.
- **Visites « i »** (`CHESTTour.init`) réécrites sur toutes les pages, dans l'ordre de lecture ; étapes à cible absente ou cachée sautées : revérifier les sélecteurs à chaque refonte.

## Thème clair, survol des cartes, ordre du journal de backtest

- **Thème clair = inversion de la page** (`css/patch-chest-da.css`, bloc « THÈME CLAIR ») : la DA est dessinée en sombre avec des centaines de teintes en dur, donc `html[data-theme="light"]:not(.is-embedded)` applique `filter: invert(1) hue-rotate(180deg)` **une seule fois** sur le document racine hors iframe (le shell `app.html`, ou une page d'auth) ; les pages de l'iframe sont inversées avec lui. Les variables `--chest-*` / `tokens.css` ne changent PAS. Ce qui ne doit pas être inversé (images, `video`, iframes YouTube/Vimeo, boutons dégradés `.chest-btn`, pastilles/avatars, couvertures et miniatures de School) est ré-inversé par la même déclaration dans la liste du bloc : **tout nouvel élément à dégradé + texte blanc ou à image de fond doit être ajouté à cette liste**. Les graphiques (Chart.js, widgets TradingView) sont toujours dessinés pour un fond sombre (`isDark = true`, `theme: 'dark'`) puisque l'inversion les éclaircit. Ne pas remettre de règles `[data-theme="light"]` avec des couleurs claires : elles seraient re-inversées. Vérifié le 2026-09-21 sur School, Dashboard, Backtesting, Journal, Calendrier, Compte, BERICH.
- **Survol des fenêtres** (décision utilisateur, cadrée par CHEST-DA.md « Survol d'une tuile ») : bloc en fin de `patch-chest-da.css`. Deux régimes : **petites tuiles de choix cliquables** (broker, méthode, compte Myfxbook, options, dropzone, tuiles de rayon School) = illuminées en entier (`--lit-fill` sur base opaque `--lit-base`, contour `--lit-ring`, halo) ; **grandes plaques d'information** (cartes de backtest et de journal, annonces, cartes School…) = seul le **contour arrondi** s'allume (`--rim-ring` + `--rim-glow`), l'intérieur ne bouge pas — un fond rose plein sur une grande carte est laid (retour utilisateur). Toute nouvelle carte s'ajoute à l'une des deux listes de sélecteurs.
- **Journal du rapport de backtest** (`backtest-view.html`, section 05) : par défaut rangé **par clôture** (ordre de la courbe) ; quand le fichier donne l'heure d'ouverture ET de clôture, un sélecteur « Par clôture / Par ouverture » apparaît (`journalOrder`). En mode ouverture : tri par heure d'ouverture, mois = mois d'ouverture, numéros recalculés ; « Capital après » et « Variation » restent ceux de la clôture (le capital bouge à la clôture) — une phrase le rappelle sous le titre.
- School : la vidéo « Commence ici » de l'accueil a été retirée (décision utilisateur).

## Page « Welcome » (ouverture) — v3, dans le flux de la page

`css/welcome.css` + `js/welcome.js` + le bloc `#chestWelcome` d'`app.html` (posé **avant** `#chestShell`). Elle s'affiche à **chaque connexion** (`login.html` pose `sessionStorage.chest_welcome = '1'`) et au **clic sur le logo « CHEST »** en haut à gauche (qui ramène aussi au dashboard). La base visuelle vient de Claude Design (`Projet CHEST - Amélioration visuelle (2)/a-deposer`) ; la mécanique de défilement et la Newsletter sont refaites ici sur demande de l'utilisateur.

- **Le dashboard fait partie du défilement (décision utilisateur : « la continuité », « juste du visuel mais hyper fluide »)** : plus de calque fixe. Le calque `.wel` est un bloc **dans le flux**, avant le shell : hero (100dvh) + Newsletter, puis le shell (`.chest-shell.is-app`, 100vh) juste dessous. `html.is-welcome` rend au document son défilement natif (`html.is-shell` le verrouille sinon). Comme tout défile ensemble, le dashboard arrive collé sous la Newsletter, au pixel près (vérifié : `shell.top === welcome.bottom`). Quand le sommet du shell atteint le haut de l'écran (`scrollY >= shell.top + scrollY`), `finish()` masque le calque, retire `is-welcome` et remet `scrollTo(0,0)` **dans la même image** : aucun saut visible, mais il n'y a plus rien au-dessus, on ne peut plus remonter. Seul le logo la rouvre. Un défilement natif (pas d'écouteur qui translate) évite tout décalage d'une image entre les deux couches. Le shell est `inert` tant que Welcome est ouverte.
- **Transition à la jonction : essai puis retour arrière (2026-09-22)** : une mosaïque façon welcome.alike.page a été essayée, puis **retirée** (« ça rogne toute la page » — `git revert`). Un fondu en dégradé CSS pur a ensuite été essayé (`.wel__seam`), puis **retiré aussi** sur demande explicite de l'utilisateur (« oublie le fondu, remets comme avant quand il n'y en avait pas ») : **la jonction Newsletter → dashboard est une coupure nette, sans effet**, comme au premier passage en v3. Ne pas réintroduire d'effet à cet endroit sans demande explicite.
- **Le dashboard ne doit pas défiler avant d'être entièrement ouvert (2026-09-22, bug signalé deux fois : « je peux encore scroller le dashboard », puis « la molette fonctionne encore à des endroits en bas »)** : l'`inert` seul sur `#chestShell` ne suffisait pas. Deux couches de protection :
  1. **`html.is-welcome .chest-shell, html.is-welcome .chest-shell *{ pointer-events:none !important; }`** (CSS) : la molette et le clic ne trouvent alors plus aucune cible dans le shell/l'iframe (`elementFromPoint` retombe sur `body`), donc c'est la page qui défile. Vérifié à plusieurs profondeurs de défilement, y compris tout en bas (juste avant l'arrivée) : `scrollY` de la page avance SANS bouger `scrollTop` de l'iframe.
  2. **Sursis après l'ouverture (`.wel-lock`, même règle `pointer-events:none`)** : l'inertie d'un trackpad continue d'envoyer des deltas de molette quelques centaines de ms après que `finish()` a fermé la page — sans sursis, ces derniers deltas atterrissaient sur le dashboard qui venait tout juste de devenir interactif et le faisaient défiler tout seul (c'était probablement la vraie cause du premier bug signalé, pas l'aimantation). `finish()` pose `.wel-lock` sur `#chestShell` en même temps qu'il retire `is-welcome`, et ne l'enlève (avec `inert`) que 380 ms plus tard (`setTimeout`). Vérifié : un enchaînement molette agressif qui traverse le seuil de fermeture dans le même geste laisse `scrollTop` de l'iframe à 0 ; passé le sursis, le dashboard redevient normal et défile comme d'habitude.
- **Pas d'aimantation (décision utilisateur, 2026-09-22)** : entre la Newsletter et le dashboard on défile librement **dans les deux sens** — l'ancienne aimantation (`settle()`) sautait d'un côté ou de l'autre quand on lâchait ; elle est supprimée. La page ne se referme, et on ne peut plus remonter, que quand le dashboard est **entièrement** arrivé. Le bouton **Start** et Échap descendent en douceur jusqu'au dashboard (`glide()`). La cloche « Entrer » du coin a été supprimée (décision utilisateur).
- **Hero** (référence : première page de backgrounds.supply, effets refaits ici) : fond noir ; **lumière = shader WebGL** (`#welLight`, GLSL dans `welcome.js` : deux bandes claires en diagonale (la 1re depuis le coin haut gauche, la 2e plus à droite) dont l'intensité **varie le long de leur axe** et qui portent loin, de grandes nappes de brume qui se déforment lentement, très peu de rayons, palette désaturée lie-de-vin → magenta sourd → rose → rose poudré, grain anti-bandes ; demi-résolution). Le **fondu noir démarre à ~26 % de la hauteur et descend jusqu'au bas du hero** (`mask` dans le shader + `.wel__vignette` qui raccorde en noir pur avec la Newsletter). **Sobriété (décision utilisateur)** : la première version, en rayons magenta saturés, a été jugée « vulgaire » ; on vise la subtilité de la référence — ne pas remonter la saturation ni la force des rayons qui **bouge tout seul** et couvre ~80 % de la hauteur avant un **fondu noir** (masque dans le shader + `.wel__vignette`) ; repli sans WebGL = dégradé fixe (`.wel__hero.no-gl`). **Décision utilisateur : la souris ne bouge NI le logo NI le fond** — elle n'agit que par un effet posé par-dessus (canvas `#welStars`) : halo de lumière sous le curseur (suivi lissé) qui écarte et allume les flocons. **Neige** : 3 plans de profondeur (petits vifs au loin, gros flous devant), dérive latérale, sprite pré-rendu ; boucle unique (`tick`) mise en pause quand le hero sort de l'écran ou que l'onglet est caché ; sans animation en `prefers-reduced-motion`. Les anciennes « lueurs » CSS (glow suivant la souris, aurore floue) ont été supprimées. Logo `assets/logo-chest-glow.png` (celui du login) **petit** (~15vh, max 150px) au-dessus du titre, que le titre chevauche légèrement (`mix-blend-mode:screen`, il flotte doucement) — une version bien plus grande a été jugée « beaucoup trop grosse ». Puis « Welcome » + prénom en italique **Instrument Serif**.
- **Logo (2026-09-22)** : `assets/logo-chest-hero.webp` (640 px, dérivé de `logo-chest-new.webp` fourni par l'utilisateur, fond déjà transparent). Le **noir du centre est volontaire** et gardé, mais à **60 % d'opacité** (−40 %, demande utilisateur) : l'alpha des pixels sombres est multiplié par 0,6 avec un raccord doux. Plus de `mix-blend-mode`. À reproduire si on remplace le logo ailleurs (login, topbar) — non fait.
- **Souris directe (2026-09-22)** : le halo suit le curseur **sans retard** (plus de lissage). **Flocons** : fondu noir sur le bas du hero (alpha ×(1−smoothstep) de 58 % à 94 % de la hauteur) pour qu'ils disparaissent proprement.
- **Lumière (finalisée 2026-09-22)** : la bande claire du coin haut gauche est **calme** (elle reste une lueur, un peu atténuée) ; ce sont **le reste du fond, à droite et à gauche, qui bouge** : une **aurore boréale** (rideaux verticaux déformés par une houle lente, `wav/cur1/cur2/aur` dans le shader, teintes violet à gauche / chaud à droite, coin haut gauche épargné) et une brume qui circule plus vite, plus deux lueurs qui s'allument et s'éteignent à tour de rôle. Le mouvement est fluide et lent ; sur un cycle de ~10 s le fond change nettement de forme sans jamais s'agiter (vérifié sur 3 captures à 0, 5 et 10 s). **Réglage du 2026-09-22 (retour utilisateur : « trop longiligne, trop chargé, la droite trop colorée »)** : le fondu noir du shader démarre plus haut (`smoothstep(.08,.95)`), les rideaux de l'aurore sont plus courts (fréquence verticale ×2, éteints vers 78 % de la hauteur) et **la droite est nettement plus sombre** (`rd`, −62 % vers le bord droit ; la bande 2 reste visible comme un reflet sur ce fond sombre). **Correction du 2026-09-22 (l'utilisateur visait le FONDU, pas la lueur blanche)** : la bande claire est redevenue **droite et franche** (plus déformée par la brume, cœur plus net) ; **toute la lumière et les couleurs partent d'elle** (`prox` : elles s'éteignent avec la distance à son axe ET le long de sa direction, donc le côté opposé — la droite — est plus sombre) ; le **fondu noir est long et progressif** (`pow(1-smoothstep(-.1,1,y),1.35)`, plus aucune zone de transition marquée ; vignette CSS réduite aux 14 % du bas). **Trajet de la lueur (2026-09-22, tracé bleu de l'utilisateur)** : la bande claire n'est plus une droite mais suit une **courbe `pathY(x,t)`** (en hauteurs d'écran) : elle descend en diagonale depuis le coin haut gauche, s'aplatit vers le centre, plonge puis remonte vers la droite comme une aurore, en s'amincissant ; l'ondulation dérive lentement avec le temps. Toute la lumière (`prox`) part de cet axe. **Orange et violet (2026-09-22, « c'est délicat »)** : ils sont fondus dans la palette du shader, pondérés par la luminosité (le noir reste noir) et **jamais saturés** — `warm` (la lueur se réchauffe en avançant le long de son trajet, rose → pêche → orange ; son bord inférieur est plus chaud ; une des deux lueurs dérivantes est orange) et `vio` (violet dans les zones éloignées de l'axe, à gauche et en haut à droite, et dans la queue du fondu). **Vrai orange (même jour)** : une première version se contentait de teinter le rose (résultat saumon/pêche, l'utilisateur ne voyait pas d'orange) ; le fond est maintenant **mélangé vers une rampe orange** (`og` : brun-orange → orange `#f2752a` → ambre clair) là où `warm` est fort, à 50 % (`…*.5` en fin de shader ; 62 % virait au terracotta). Violet : facteurs `1.0`/`.22`. **Coucher de soleil (2026-09-22, demande utilisateur : « côté droit plus jaune, côté gauche violet »)** : les teintes sont maintenant **positionnelles** — violet à gauche (`vioL`, `uv.x` < ~55 %), rose de la marque au centre, orange doré puis jaune vers la droite (`sunR`, `uv.x` > ~34 %), mélangés par rampes de luminosité (`gold`, `vv`). **Réglage final (même jour, « il y a encore du rose sous l'orange »)** : `sunR = smoothstep(.5,.92,uv.x)` et `vioL = 1-smoothstep(.06,.44,uv.x)`, mélange à 92 % jusque dans les zones sombres (`smoothstep(.02,.22,b)`) : la droite est franchement jaune-orange (plus de rose dessous), la gauche violet franc (lavande dans les zones claires), et le rose de la marque n'occupe plus que la bande centrale (~42-50 % de la largeur) — pour l'élargir, reculer `vioL` / avancer `sunR`. Attention : `uv.x/asp` (utilisé plus haut pour `rd`) ne dépasse pas ~0,5 ; utiliser `uv.x` pour toute nouvelle teinte horizontale. **Queue du fondu** : un lie-de-vin très sombre et très discret s'étire jusqu'à ~80 % de la hauteur pour agrandir la transition vers le noir (à retirer d'une ligne si elle déplaît : `c1+=vec3(.1,.008,.056)*…` en fin de shader). **Qualité adaptative** : le rendu de la lumière est à 50 % de la résolution et descend jusqu'à 20 % si l'image met > 45 ms en moyenne (`lightScale`). **Fondu de tout vers le bas** : un masque `destination-out` sur le canvas des flocons éteint halo et flocons ensemble de 50 % à 100 % de la hauteur — une première version laissait le halo de la souris coupé net par le bas du hero (une « barre » grise visible à la jonction avec la Newsletter).
- **CHEST qui parle** (sous le titre, `SAY` dans `welcome.js`) : une phrase tirée selon l'heure et la **session de marché en cours** (UTC, comme les sessions du reste du site : Asie 0-7, Londres 7-12, Londres × New York 12-16, New York 16-21 ; contextes `asiaOpen`, `mondayOpen`, `asia`, `londonOpen`, `london`, `nyOpen`, `overlap`, `ny`, `late`, `friday`, `weekend`), avec un mélange d'heure locale (`night` avant 5 h, `morning` 5-9 h) et de phrases génériques (20 %) ; jamais deux fois la même d'affilée (`chest_wel_say`). Ton « tu », voix d'algo. **Chaque phrase est un prétexte pour entrer sur la plateforme** (décision utilisateur : plus de « je surveille, tu peux respirer ») : elle finit par une invitation concrète — dashboard, journal, backtest, calendrier, School. **Toujours prudent** (« souvent », « probable » : jamais une prédiction ni une promesse) ; `{name}` = prénom, retiré proprement s'il manque. Écrite lettre à lettre (lettres pré-placées → aucun décalage de mise en page) avec un curseur rose ; instantanée en `prefers-reduced-motion` ; texte complet dans un `.wel__say-sr` pour les lecteurs d'écran. **Ajouter des phrases = ajouter une ligne dans le bon tableau de `SAY`.**
- **Deux boutons** sous la phrase : **Newsletter** (défile jusqu'à la section, pastille rouge **+N** = nouveautés jamais vues, `chest_news_seen`) et **Start** (direct au dashboard). Retirés à la demande de l'utilisateur : barre flottante, « Bonjour/Bonsoir », sous-titre, repère « Scroll », cloche.
- **Newsletter** (`.wel__grid`, 12 colonnes) : grandes fenêtres arrondies façon bento (rangées 7+5, 5+7, 12), **titre en haut à gauche**, photo qui remplit la fenêtre, étiquette dégradée, bouton « + ». Survol = seul le contour s'allume (règle des grandes plaques). **Clic = fenêtre de détail** (`#welSheet` : photo, étiquette, titre, texte, date ; Échap / croix / fond pour fermer), contenu pris dans `.wel__card-full` de la carte. **Pour poser une photo** : `style="--img:url(assets/xxx.jpg)"` sur `.wel__card-media` de la carte ; **elle remplit tout le cadre**, le titre et l'étiquette restent par-dessus au même endroit, la fenêtre de détail reprend la même image. Sans photo, le cadre est un dégradé rose → orange plein (plus de cadre pointillé). Les 5 cartes actuelles décrivent de vraies évolutions du site (School, recommandation propfirm, journal Myfxbook, réglage automatique, menu/thème clair) ; `data-news-id` alimente la pastille +N du bouton Newsletter (`chest_news_seen`). Plus tard : générer les cartes depuis le serveur de comptes (admin).
- **Bento v2 : les 5 vitrines fixes remplacent les cartes génériques (2026-09-22, demande utilisateur)**. La Newsletter n'est plus une liste de 5 cartes de nouveautés interchangeables : elle porte désormais 5 cartes FIXES, chacune avec son propre rôle — **Founder** (profil Instagram du fondateur dans un téléphone, réseaux qui apparaissent au survol), **CHEST IS HERE** (vitrine statique de l'app), **SCANNER** (annonce avec badge +1), **MENU** (pages du site qui défilent), **SCHOOLE** (miniatures vidéo de School qui défilent). Disposition calquée sur la démo « See it in action » de [backgrounds.supply](https://www.backgrounds.supply/?ref=onepagelove) (référence donnée par l'utilisateur) : 2 colonnes, la gauche empile CHEST IS HERE (haut) + Founder (bas, sur 2 rangées) ; la droite empile Scanner + Menu + School. **Décision : structure et mécaniques reprises, jamais le code ni les images** (le site est un site Framer, JS compilé illisible — impossible et interdit de le copier littéralement).
  - **Vérification sur le site de référence (important, contredit l'intuition de départ)** : sur backgrounds.supply, l'effet de la carte Social Media (téléphone flou, logos flottants) est en fait **permanent dès que la carte est visible** (une légère dérive continue, pas un `:hover`) — inspecté via les classes Framer et les transforms, aucune classe liée à `:hover` trouvée. La demande initiale de l'utilisateur (« l'iphone recule et se floute quand la souris est dessus ») décrit un survol franc, plus propre à construire et plus cohérent avec des cartes CHEST cliquables ailleurs sur la page : **implémenté en hover réel** (`:hover`), pas en dérive continue — écart assumé et documenté plutôt que silencieux.
  - **Cartes** (`app.html`, section `#welNews` → `.wel__grid.wel__grid--v2`) : `data-no-sheet="1"` sur les 5 — elles n'ouvrent plus la fenêtre de détail générique (`openSheet`, réservée à d'éventuelles futures cartes de nouveauté) ; `welcome.js` ignore l'ouverture si l'attribut est présent (délégation sur `.wel__card`, guard ajouté aux deux écouteurs clic et clavier). Seule SCANNER garde `data-news-id` (compte pour le badge +N du bouton « Newsletter » du hero, mécanique déjà existante — voir plus haut) : les 4 autres n'en ont plus, elles ne sont pas des « nouveautés » à marquer vues.
  - **Piège : `url()` dans une variable CSS (`--img`) se résout depuis la feuille de style qui l'UTILISE, pas depuis la page qui la déclare** — `style="--img:url(assets/x.webp)"` sur une balise d'`app.html` cherchait le fichier dans `css/assets/` (relatif à `welcome.css`, qui contient la règle `background-image:var(--img)`) et échouait en 404 silencieux (dégradé de repli affiché, aucune erreur visible sans ouvrir la console). **Toujours un chemin RACINE (`/assets/...`) pour `--img`**, documenté directement dans le commentaire d'en-tête d'`app.html` pour ne pas retomber dedans.
  - **Founder** (`.wel__card--founder`) : téléphone en CSS (bezel dessiné, pas le gabarit PNG fourni par l'utilisateur — décision : un bezel CSS s'aligne pixel-parfait avec n'importe quelle photo recadrée via `object-fit`, un gabarit PNG externe aurait demandé un calage manuel fragile) avec la capture Instagram fournie recadrée dedans (`object-fit:cover; object-position:top center`). Réseaux : Instagram (lien réel, `instagram.com/2sw0ne`), TikTok et Telegram (`href="#"`, **placeholders — liens réels à fournir par l'utilisateur**, pas trouvés dans le contexte du projet). **Piège rencontré (2 itérations)** : le téléphone occupe presque toute la hauteur de la carte (aspect-ratio 9/19.5), donc (a) un `transform-origin` par défaut (centre) ne libère quasiment aucun espace en haut même avec un fort rétrécissement au survol — l'icône Telegram restait cachée dessous malgré `opacity:1` (vérifié via `getBoundingClientRect` : son rectangle restait entièrement inclus dans celui du téléphone) ; **corrigé avec `transform-origin:bottom center`** (le téléphone rétrécit vers le bas, tout l'espace libéré apparaît en haut) ; (b) une vérification DOM juste après un `hover` simulé peut lire `opacity:0` alors que la transition (.4s) n'a simplement pas eu le temps de jouer — toujours attendre après un survol simulé avant de lire les styles calculés.
  - **MENU / SCHOOLE** (`.wel__menu-track`, `.wel__school-track`) : bandeau en boucle (`@keyframes welMenuScroll`, translate à -50 % sur un contenu DOUBLÉ pour boucler sans coupure), fondu sur les bords via `mask-image` (dégradé transparent → opaque → transparent), pause au survol (`animation-play-state:paused`), rien en `prefers-reduced-motion`. MENU reprend les libellés et icônes (`.chest-ic-*`) exactement de `PAGES` dans `shell.js`, pour rester synchronisé avec le vrai menu du site. SCHOOLE utilise les vraies vignettes YouTube publiques (`img.youtube.com/vi/<id>/mqdefault.jpg`, aucun appel serveur) des vidéos déjà listées dans `videoSeed` de `school-data.js`.
  - **CMS admin + Vue Admin/Client : fait (2026-09-23)**, voir section dédiée plus bas (« CMS admin de la Newsletter »). (3) **Page d'inscription/connexion refaite** : fond = le même shader que le hero Welcome, formulaire centré par-dessus, fondu (opacité 100→0, 1-2 s) vers le Welcome déjà chargé dessous au lieu d'une redirection de page classique — implique de fusionner `login.html`/`signup.html` dans `app.html` (ou un mécanisme équivalent) puisqu'un vrai fondu entre deux états suppose le même document, pas une navigation complète ; à concevoir avec soin car ça touche le flux d'auth (`accounts-auth.js`) documenté ailleurs comme fragile.
- **Correction des proportions, 2e passe (2026-09-22, retour utilisateur : « pas du tout les dimensions sont importantes, je veux les mêmes »)**. Le premier jet (2 colonnes `1.5fr 1fr` fixes) ne reproduisait pas la référence : mesure précise sur backgrounds.supply (`getBoundingClientRect` sur chaque carte, en remontant jusqu'à l'ancêtre à coins arrondis) a montré que ce n'est **pas une grille à 2 colonnes classique** — les largeurs de colonne s'INVERSENT entre la 1re rangée (large à gauche/étroit à droite : Presentations 622px / Wallpapers 412px) et les rangées 2-3 (étroit à gauche/large à droite : Social Media 412px / Banners-WebsitesApps 622px), et les 3 rangées ont la MÊME hauteur (326px chacune). Seule façon de reproduire ça dans une seule grille CSS : **5 colonnes égales** avec des `grid-column: X / span N` différents par carte (Chest Is Here = 1/span3, Scanner = 4/span2, Founder = 1/span2 sur 2 rangées, Menu = 3/span3, School = 3/span3) — `.wel__grid--v2` réécrit en conséquence.
  - **Titre en casse normale** : « CHEST IS HERE » → « Chest Is Here » (majuscule seulement en tête de chaque mot, comme les autres titres) — décision utilisateur, cohérent avec « Founder »/« Presentations » de la référence.
  - **Fond aussi noir que la page** : les 5 cartes fixes n'utilisent plus le dégradé rose/orange de repli (`.wel__card-media`) réservé aux futures cartes de nouveauté sans photo — fond `#050505` explicite sur `.wel__card--v2`, identique au fond de la page.
  - **Founder, 2e correctif du bug « Telegram invisible »** : la vraie cause n'était pas le `transform-origin` (déjà corrigé en 1re passe) mais la HAUTEUR de carte insuffisante avant la mesure précise — avec la bonne proportion (2 colonnes de large × 2 rangées de haut, ≈1:1,3 à 1:1,6 selon la largeur d'écran), le téléphone dispose de largement assez de place et Telegram sort proprement par le haut, visible et cliquable (vérifié `opacity:1` + position hors du rectangle du téléphone aux trois réseaux, à 1440×900).
  - **MENU repensé selon la carte Banners de référence, inspectée en direct (2e passe, retour utilisateur : « c'est pas ce que j'ai demandé, ça ne ressemble pas au modèle »)** : Banners sur le vrai site est en fait un slideshow d'UNE fenêtre à la fois qui se fond dans la suivante (vérifié par observation : le contenu change entre deux captures espacées de quelques secondes, un seul aperçu visible à chaque fois) — mais la demande initiale de l'utilisateur (« des éléments horizontaux qui défilent ») décrivait plusieurs petites fenêtres en rangée, plus proche de Websites and Apps. **Parti pris assumé** : garder le défilement horizontal continu (déjà demandé explicitly par l'utilisateur), corriger seulement le STYLE de chaque élément pour que ce soit une vraie petite fenêtre (`.wel__menu-win` : barre à 3 points façon navigateur + corps illustré en dégradé + légende) au lieu d'une pastille de menu (`.wel__menu-chip`, supprimée) — beaucoup plus proche visuellement de la référence que des pilules de navigation.
  - **SCHOOLE** : vignettes agrandies (`.wel__school-thumb`, 120×68 → 150×88) pour mieux remplir la carte maintenant correctement dimensionnée (3/5 de large).
- **3e passe (2026-09-22, retour utilisateur avec captures annotées) : photo réelle du téléphone, disposition des réseaux mesurée sur la référence, MENU en slideshow, images recadrées, réglage manuel de la disposition.**
  - **Founder : la photo iPhone+Instagram déjà composée par l'utilisateur remplace le bezel CSS** (`assets/wel-founder-phone.webp`, 1125×2000, fond transparent autour de l'appareil — vérifié à l'octet, pas besoin de détourage). `<img class="wel__founder-phone">` directement, plus de `<div>` bezel ni de pseudo-élément encoche. Ancré en HAUT (`top:6%`) et volontairement plus grand que la carte : le bas de l'appareil est coupé par `overflow:hidden` de la carte, comme la référence (on ne voit jamais le bas du téléphone sur Social Media). Au survol : `scale(.66) translateY(6%)` + flou, réseaux qui apparaissent.
  - **Disposition des 3 réseaux mesurée sur la carte Social Media de référence** (coordonnées relevées directement sur l'image) : 1 en haut-centre (remplace le duo LinkedIn/Twitter du haut, un seul réseau suffit ici), Instagram à gauche et TikTok à droite tous deux à mi-hauteur et légèrement ROGNÉS par le bord de la carte (`left:-14px` / `right:-14px`, comme Instagram déborde visiblement du cadre sur la référence) — pas des cercles flottants bien centrés dans une marge, comme la 1re tentative.
  - **Image « Chest Is Here » recadrée pour de bon (retour : « on voit le bord noir à gauche, c'est pas possible »)** : l'image (collage incliné) a des marges TRANSPARENTES baked-in (vérifié à l'octet avec PIL : coin gauche `alpha=0` à mi-hauteur) — `background-size:cover` centré laissait donc parfois voir un triangle de fond de carte au lieu du visuel. Corrigé en recadrant le FICHIER SOURCE lui-même sur sa zone garantie 100 % opaque (`wel-chest-here.webp`, 1908×1013 → 1622×793, vérifié pixel par pixel après coup : zéro pixel à alpha < 250 sur un échantillonnage serré) plutôt que de bricoler `background-position` en CSS — plus robuste, aucun triangle transparent possible quel que soit le recadrage `cover` appliqué ensuite.
  - **Image SCANNER remplacée par la version complète fournie** (`wel-scanner.webp`, la même image qu'avant en fait — mais recadrage `cover` différent maintenant que le titre « New Features » du haut, sur fond transparent, n'a plus besoin d'être préservé : c'est la zone basse — icône, main, signature « Algomni » — qui compte visuellement, déjà bien visible).
  - **MENU refait en slideshow (3e passe, retour utilisateur : « je t'ai dit je veux un élément horizontal qui disparaît puis laisse apparaître un autre »)** : après vérification en direct que la carte Banners de référence est bien un slideshow à une seule bannière (constat déjà fait en 2e passe, mais je m'étais fié à tort à ma propre relecture de la demande initiale plutôt qu'à cette vérification) — corrigé cette fois pour de bon. `initMenuSlideshow()` (`welcome.js`) : un seul élément `.wel__menu-banner` réutilisé, repeint puis fondu (`.is-out`, transition .5s) toutes les 3,2 s, cycle sur les 8 pages du site (mêmes libellés que `PAGES` dans `shell.js`), en pause au survol. Plus de piste qui défile ni de petites fenêtres multiples.
  - **Recadrage manuel, corrigé (retour utilisateur : « c'est les photos et éléments DANS LEUR FENÊTRE que je veux recadrer, pas la disposition »)** : le 1er jet (poignées pour redimensionner les CARTES dans la grille) répondait à la mauvaise question. Remplacé par `initPhotoReposition()` (`welcome.js`) : bouton « Recadrer » (`#welLayoutToggle`) active un mode où seuls les 3 éléments concernés deviennent glissables — la photo de Chest Is Here et celle de Scanner (`background-position` ajusté en %, glisser = déplacer l'image dans son cadre fixe, la carte elle-même ne bouge pas) et le téléphone de Founder (décalage `--dx`/`--dy` en px, superposé à son centrage). Persisté dans `localStorage` (`chest_wel_bento_crop`, par navigateur — pas encore le stockage serveur partagé du futur CMS admin) ; bouton « Réinitialiser » pour revenir au centrage par défaut. En mode actif, les cartes perdent leurs interactions normales (`pointer-events:none` sauf sur l'élément glissable) pour ne pas interférer avec le glisser. Vérifié : glisser-déposer sur les 3 éléments, persistance après rechargement de page, curseur grab/grabbing. **Toujours provisoire** : accessible à tout le monde en attendant la Vue Admin/Client du CMS.
  - **Centrage du téléphone corrigé au passage** : `.wel__founder-phone` est en `position:absolute`, donc le `justify-content:center` de son parent flex (`.wel__founder-stage`) ne s'appliquait plus (un élément en position absolue sort du flux) — le téléphone n'était pas centré. Corrigé avec `left:50%` + `translateX(-50%)` combiné aux autres transforms (recadrage, survol) via `calc()`.
- **4e passe (2026-09-23) : valeurs de recadrage enregistrées comme défaut, zoom du téléphone, design du MENU relevé.**
  - **« enregistre comme je l'ai mis »** : l'utilisateur a réglé le cadrage à la main via le bouton Recadrer (dans ce même navigateur intégré, partagé avec la session) ; ses valeurs (`chest_wel_bento_crop` de son `localStorage`) sont devenues les nouvelles constantes `DEFAULTS` dans `initPhotoReposition()` (`welcome.js`) — donc valables pour tout le monde, pas seulement son propre navigateur. Toujours modifiable ensuite via le même bouton (qui écrase ces défauts dans le `localStorage` de qui l'utilise).
  - **Zoom du téléphone (demande : « permets-moi de l'agrandir »)** : nouvelle variable `--zs` (échelle) sur `.wel__founder-phone`, réglée à la molette pendant que le mode Recadrer est actif et la souris sur le téléphone (`wheel`, bornes 0,5–2,2, `ev.preventDefault()` pour ne pas faire défiler la page en même temps). Combinée aux transforms existants via `calc(var(--zs) * .66)` au survol (le zoom manuel et le rétrécissement au survol se multiplient plutôt que de s'écraser l'un l'autre). Stockée dans le même `founder.s` que `dx`/`dy`.
  - **MENU : chaque page a son thème visuel propre (demande : « pousse le design, un échantillon visuel de chaque thème »)** : `MENU_ITEMS` (`welcome.js`) passe d'un tableau `[icône, libellé]` à des objets `{ic, label, c1, c2, art}` — une paire de couleurs d'accent (`--c1`/`--c2`, posées en JS sur la bannière, mélangées au fond via `color-mix()`) et un petit motif SVG en filigrane (`.wel__menu-banner__art`, `currentColor`, opacité .28) qui évoque le contenu réel de la page plutôt qu'un icône seul sur fond rose/orange systématique : barres montantes (Dashboard, vert), courbe + aire (Backtesting, rose/orange de marque), lignes de journal (Journal, bleu), anneaux excentrés (Stratégies, violet), grille de points façon calendrier (Calendrier, ambre), éclair (BERICH, orange), cercle + lecture (School, rose), avatar (Compte, gris neutre). Vérifié sur un cycle complet (8 bannières) en desktop et mobile.
- **5e passe (2026-09-23) : bento validé, casse des titres, refonte MENU « motion design », correction du vide sur Scanner.**
  - **« valide tout, c'est parfait »** : Chest Is Here, Founder et Scanner (cadrage, zoom, disposition) sont figés — ne plus les retoucher sans demande explicite.
  - **Casse des titres** : `SCANNER`/`MENU`/`SCHOOLE` (tout capitales) → `Scanner`/`Menu`/`Schoole` (majuscule initiale seulement, comme `Chest Is Here` et `Founder`) — simple correction de texte dans `app.html`.
  - **MENU refait une 2e fois (retour : « tu m'as mis des visuels nuls, regarde la bannière, je veux des visuels de ce style — motion design, dans nos couleurs, avec nos titres » + 3 bannières de designers freelance Fiverr/Behance envoyées en référence)** : le style « icône + motif SVG en filigrane » de la passe précédente ne correspondait pas du tout à ce qui était demandé. Grammaire commune aux 3 réfs analysée puis reproduite avec du contenu 100 % CHEST (jamais copiée) : pastille kicker courte au-dessus, immense titre sur 2 poids (blanc + mot en accent lumineux via un simple `<b>`, `text-shadow` double halo), badge d'icône flottant incliné (-9°) avec dégradé de marque + respiration verticale douce (`@keyframes welMenuBadgeFloat`, coupée en `prefers-reduced-motion`), fond en double glow radial (couleurs de la page) + grille fine masquée en dégradé + vignette. `MENU_ITEMS` porte maintenant un vrai texte par page (`kicker` + `title` avec `<b>`) au lieu d'un simple libellé : ex. Dashboard → « SUIVI EN DIRECT » / « Ton edge, **en direct**. », BERICH → « EXÉCUTION » / « Vite. **Bien.** ». Ton direct, sans jargon marketing (cohérent avec le goût habituel de l'utilisateur pour ce genre de copywriting).
  - **Vide visible sur Scanner hors survol (retour : « je veux pas qu'on voie le vide, zoom-le »)** : même cause que le bug déjà corrigé sur Chest Is Here — l'image source (`wel-scanner.webp`) a un fond noir à COINS ARRONDIS sur canevas transparent, donc même après avoir retiré la marge morte, les 4 coins de son cadre rectangulaire restent transparents ; `background-size:cover` peut donc laisser voir un bord du fond de carte à un coin selon la position. Corrigé en resserrant le recadrage du FICHIER (pas seulement sa bbox : encore 2 à 8 % de marge intérieure selon le coin) jusqu'à zéro pixel à alpha < 250 sur un échantillonnage serré (vérifié par script) — la position de cadrage par défaut a été réinitialisée au centre puisque l'ancienne valeur visait l'ancien cadrage, plus valable après ce resserrement.
- **Thème clair** : le calque est inversé avec la page (filtre sur `<html>`), donc Welcome devient claire ; à revoir si on veut un hero toujours sombre.
- Le prénom sous « Welcome » est celui saisi à l'inscription (`signup.html`, champ obligatoire, mis en majuscule à l'envoi ; `CHESTAccounts.getUser().firstName`).
- **Référence visuelle** : backgrounds.supply (première page : gros logo, titre avec italique serif, lavis rose, puis sections en grandes fenêtres). Décision : on reprend la **structure, le rythme et les mécaniques**, jamais le code ni les images du site (ce serait de la copie) ; les détails de finition sont écrits ici.
- **Fichiers de la livraison de Claude Design NON appliqués** : `patch-chest-da.css`, `chest-ui.js`, `signup.html` sont des états antérieurs de fichiers que nous avons depuis modifiés — ne pas les écraser sans comparer. Si Claude Design livre une nouvelle version de `welcome.css/js`, ne pas la remplacer telle quelle : elle repose sur l'ancien modèle « calque fixe + écran transparent ».

## CMS admin de la Newsletter (Welcome) + Vue Admin/Client (2026-09-23)

Portée annoncée dans la section précédente comme "pas encore fait" — livrée sur demande explicite de l'utilisateur ("ajoute donc la dernière demande [...] les paramétrages dans newsletter comme dans school et dans mes paramètres admin je choisis de mettre ou non le visuel des modifications").

- **`accounts-bridge/server.py`** : nouvelle table `bento_entries` (`id` limité à `hero|scanner|founder|menu|school` — pas de créer/supprimer une carte, contrairement à School) + endpoints `GET /bento` (membres), `POST /bento/<id>` (admin, multipart `title`/`image`/`badgeEnabled`), `POST /bento/<id>/reset` (admin). Réutilise `save_upload()`/`delete_file()`/`FILES_DIR`/`GET /school/files/<key>` de School plutôt que de dupliquer le stockage de fichiers — un même mécanisme générique pour les deux CMS.
- **`welcome.js`** : `loadBentoOverrides()` (fetch `/bento` au chargement si connecté, fusionne dans les 5 cartes via `[data-cms-title]`/`[data-cms-media]`/`[data-cms-badge]`) + `initBentoTools()` (menu ⋮ par carte, même esprit visuel que `.sc-tools` de School mais CSS autonome — `welcome.css` n'est chargé que sur `app.html`) + fenêtre d'édition (`#welBentoEdit`, titre + upload photo + case badge visible seulement sur Scanner) avec Enregistrer/Réinitialiser. Remplace entièrement l'ancien bouton "Recadrer" (glisser-déposer manuel en localStorage, provisoire depuis la passe précédente) — retiré à la demande de l'utilisateur maintenant que le vrai CMS existe. Le cadrage des 3 photos/téléphone (`BENTO_MEDIA_DEFAULTS`) reste les dernières valeurs validées, mais n'est plus réglable à la main (remplacer la photo entière via le CMS à la place).
- **Vue Admin / Vue Client (`account.html`)** : nouveau réglage `data-admin-only` "Vue du site" (drawer `preview`, 2 boutons façon `theme-choice`), stocké dans `localStorage.chest_admin_preview_mode` (`'admin'` par défaut, `'client'` sinon). `school.js` (`isAdmin()`) et `welcome.js` (`isAdminEffective()`) lisent la MÊME clé : en Vue Client, aucun menu ⋮ nulle part (School inclus), même pour un compte admin — pour prévisualiser exactement ce qu'un membre voit. La ligne de réglage elle-même reste toujours visible à un admin (sinon impossible de revenir en Vue Admin).
- **Piège retrouvé et corrigé en testant** : même classe de bug que celui déjà documenté dans `dashboard.html` (`[hidden]` de spécificité égale à une règle `display:flex` d'auteur, qui gagne et laisse l'élément visible) — touché ici sur `.wel-edit__check` (case "Badge visible" affichée même sur les cartes où elle doit être cachée). Corrigé avec `.wel-edit__check[hidden]{ display:none; }` (spécificité plus élevée, robuste quel que soit l'ordre des règles). **Réflexe à prendre systématiquement pour toute nouvelle règle CSS qui fixe `display` sur une classe pouvant porter `hidden`.**
- **Corrections associées, mêmes commits** : "Schoole" → "School" (faute de frappe dans le titre de la carte) ; liens réels Instagram (déjà fait)/TikTok (`tiktok.com/@2sw0ne`)/Telegram (`t.me/sw0ne21`) sur les icônes de la carte Founder (c'étaient des `href="#"` placeholders) ; nuance de noir visible entre le bas du hero et le haut de la Newsletter (`.wel__vignette`, retour utilisateur avec capture annotée) — le shader converge vers un noir mathématiquement pur (0,0,0), légèrement plus sombre que le `#050505` du reste du site ; corrigé en élargissant largement le recouvrement du dégradé (`transparent 45% → #050505 78-100%`, au lieu de `transparent 86% → #050505 100%`) plutôt qu'en cherchant à égaliser exactement les deux noirs.
- **`config.js` versionné (`?v=1` → `?v=2`)** au passage : la bascule d'URL Railway de la session précédente n'avait aucun effet pour un navigateur qui avait déjà mis l'ancien fichier en cache (voir section "Pré-déploiement Vercel" plus haut, qui documente le versionnage lui-même).
- **Vérifié en direct** (navigateur intégré ; session de test créée directement en base pour le compte admin RÉEL existant, jamais via un vrai signup/login contre le backend — voir consigne du projet) : ouverture/édition/sauvegarde/réinitialisation d'une carte avec persistance confirmée par un second `GET /bento`, bascule Vue Admin/Client reflétée immédiatement sur School ET la Newsletter (0 menu ⋮ en Client, 5 en Admin), badge Scanner édité indépendamment sans toucher aux autres cartes.
- **Recadrage ajouté comme option dans la fenêtre d'édition (2026-09-23, même jour, demande utilisateur explicite)** : la fenêtre "Modifier" d'une carte porte maintenant un champ "Position" (aperçu glissable) en plus du titre/photo/badge — Chest Is Here/Scanner ajustent `background-position` en %, Founder son téléphone en px + molette pour le zoom. `POST /bento/<id>` accepte un champ `position` (JSON, validé). Menu/School n'ont pas ce champ (pas de photo). **Bug trouvé et corrigé pendant le test** : `defaultPosition()` plantait pour menu/school (absents de `BENTO_MEDIA_DEFAULTS`), ce qui avortait silencieusement toute la fenêtre d'édition pour ces deux cartes (aucune erreur visible, le clic "Modifier" ne faisait juste plus rien) — un rappel que toute fonction lue par `openBentoEdit()` doit gérer les 5 ids, pas seulement les 3 qui ont une photo. Écouteurs de glisser posés une seule fois au niveau du module (pas par rendu d'aperçu, qui aurait fui sur `window`).
- **Pas fait / limites assumées** : Menu/School n'éditent que leur titre (leur contenu reste généré : pages du site / vraies vidéos School) ; pas de bascule Vue Admin/Client par carte, un seul réglage global.

## Pages de connexion/inscription : même fond animé que Welcome (2026-09-23)

Refonte demandée par l'utilisateur : « je veux que ce soit le fond de la page welcome, avec au centre la fenêtre d'inscription et le logo, et une fois connecté ça s'enlève en fondu et laisse apparaître le welcome ». `login.html`/`signup.html` remplacent leur ancien traitement (photo pleine page + carte à droite, `assets/login-bg.jpg`) par le même shader animé (lumière + neige) que le hero de `app.html`, carte centrée par-dessus.

- **`js/hero-bg.js` (nouveau fichier)** : copie FIDÈLE (pas une factorisation partagée) du moteur de rendu du hero Welcome — shader GLSL, neige, halo souris, qualité adaptative — extrait de `welcome.js` mais gardé **volontairement séparé**. Décision : le shader de Welcome est le fruit d'un très long réglage (voir section « Page Welcome » plus haut, des dizaines d'itérations sur la trajectoire de la lumière, les couleurs, le fondu) — le refactoriser en module partagé tout de suite aurait risqué de le casser pour gagner une déduplication qui n'était pas demandée. **Si l'un des deux fichiers est retouché (couleurs, trajectoire, vitesse…), reporter le même changement dans l'autre à la main.** API : `CHESTHeroBg.init(canvasLumière, canvasNeige, {mouseTarget})` → `{stop()}`.
- **Pas de fusion architecturale avec `app.html`** : une vraie fusion (formulaire d'auth dans une surcouche par-dessus le Welcome déjà chargé, pour un fondu strictement continu sans aucune navigation) aurait touché `CHESTAccounts.guard()` et l'amorçage de l'iframe du shell (`shell.js`, `frame.src = ...` qui s'exécute immédiatement) — risque réel de boucle de redirection (dashboard.html dans l'iframe re-garde, renvoie vers login.html, qui renverrait vers app.html, qui recharge le shell...). **Choix assumé, plus sûr** : `login.html`/`signup.html` restent des pages à part, avec leur PROPRE instance du même fond animé (visuellement indiscernable de celui de Welcome) ; à la connexion réussie, la carte se fond seule (`.auth-stage.is-leaving`, opacity 1→0 en 1,2 s) PUIS la page rejoint `app.html` (qui affiche Welcome sur un fond qui a l'air d'être resté le même). Le seul repère technique d'une vraie continuité entre les deux pages : elles partagent le même shader, donc rien ne « saute » visuellement à l'œil.
- **Le fondu ne s'applique qu'à la CONNEXION réussie, pas à l'inscription** : `CHESTAccounts.signup()` ne renvoie jamais de jeton (le compte doit être approuvé par l'administrateur, voir `accounts-bridge`) — après un signup approuvé, `signup.html` fond aussi sa carte puis renvoie vers `login.html` (pas vers app.html, puisque pas encore connecté). Un signup en attente reste simplement affiché sur place, message ambre.
- **Vérifié** : rendu (fond, halo souris, neige) sur les deux pages, desktop et mobile ; le mécanisme de fondu (`classList.add('is-leaving')` déclenché à la main, sans soumettre de vraies informations d'identification contre le serveur de comptes réel — consigne du projet). Session admin réelle de l'utilisateur temporairement retirée du `localStorage` le temps de la capture (jamais via `CHESTAccounts.logout()`, qui aurait appelé le serveur), puis restaurée et revérifiée (dashboard toujours accessible ensuite).
- **Pas encore fait** : le CMS admin (menu ⋮, Vue Admin/Client) reste en suspens, comme documenté dans la section Bento v2 ci-dessus.
- **Correction « sensation de chargement » (2026-09-23, retour utilisateur : « on a un bug, je veux garder le visuel fluide sur le fond, pas ce sentiment que ça charge »)** : la vraie cause n'est pas un bug de rendu mais un **flash blanc classique** — un `<link rel="stylesheet">` (Google Fonts en particulier, requête réseau externe, potentiellement lente ; nos CSS locales aussi dans une moindre mesure) bloque le premier affichage de TOUTE la page tant qu'il n'a pas fini de charger, quel que soit son ordre dans le `<head>` — le fond sombre du shader n'apparaît donc qu'après ce délai, sur un blanc par défaut du navigateur. Corrigé sur `app.html`, `login.html` et `signup.html` : (1) un `<style>html,body{background:#050505}</style>` tout en haut du `<head>`, qui ne dépend d'aucun fichier externe donc s'applique dès l'analyse du HTML — fond noir instantané, jamais de blanc ; (2) la feuille Google Fonts chargée en **non bloquant** (motif « loadCSS » : `media="print"` puis bascule en `media="all"` via `onload`, plus un `<noscript>` de repli) — le premier rendu n'attend plus le réseau des polices. Vérifié : `document.body`'s background est `rgb(5,5,5)` dès le chargement, la bascule `media` s'opère bien (`print` → `all`), aucune régression visuelle (polices, mise en page identiques). **Corrigé au passage** : un retour arrière du navigateur juste après une connexion/inscription pouvait restaurer la page depuis le bfcache figée en fondu invisible (`is-leaving` encore posé) — `pageshow` avec `e.persisted` remet la carte visible.
- **2e passe, la vraie cause (retour utilisateur : « ça le fait encore. je me connecte, ça charge, puis ça ouvre 1 sec le dashboard et ça revient, le welcome apparaît »)** : rien à voir avec les polices cette fois — `html.is-welcome .chest-shell{ pointer-events:none }` empêche seulement le CLIC pendant que Welcome est ouverte, pas l'AFFICHAGE. `#chestWelcome` porte l'attribut `hidden` en dur dans le HTML, retiré seulement par `welcome.js` (chargé et exécuté après tout le reste du `<body>` : shell.js, dashboard dans l'iframe, etc.) — le temps que ce script s'exécute, c'est donc le SHELL qui est le premier contenu visible de la page, exactement le flash décrit. Corrigé par deux changements qui se complètent : (1) un script inline synchrone tout en haut du `<head>` d'`app.html`, qui pose la classe `is-welcome` sur `<html>` dès l'analyse du `<head>` — donc avant même que le `<body>` (et le shell qu'il contient) ne soit analysé — si `sessionStorage.chest_welcome === '1'` ; (2) `html.is-welcome .chest-shell{ visibility:hidden; }` (nouveau, `welcome.css`) en plus du `pointer-events:none` déjà là — `visibility` et non `display:none`, pour ne pas fausser les mesures de hauteur du shell utilisées ailleurs (`shell.top === welcome.bottom`). Résultat : la classe est posée et la CSS déjà chargée dès le tout premier rendu de la page, il n'existe plus de fenêtre où le shell serait visible avant que Welcome ne le soit. **Vérifié** : `html.is-welcome` + `shell.visibility:'hidden'` dès le chargement quand le drapeau est posé ; `shell.visibility:'visible'` immédiatement quand il ne l'est pas (aucun retard artificiel pour une visite normale) ; cycle complet retesté (connexion simulée → Welcome sans flash → bouton Start → dashboard) sans régression.
- **3e passe, régression du 1er correctif (retour utilisateur : « je vois plus le dashboard quand je scroll, c'est tout noir, c'est en arrivant en bas que je le vois »)** : le correctif précédent cachait le shell via `html.is-welcome .chest-shell{visibility:hidden}` — mais `is-welcome` reste posée pendant TOUT le défilement de Welcome (depuis `show()` jusqu'à `finish()` tout en bas), pas seulement le bref instant du chargement. Résultat : le shell restait invisible pendant toute la descente dans la Newsletter, au lieu d'apparaître progressivement dessous comme conçu à l'origine (« le dashboard arrive collé sous la Newsletter, au pixel près ») — on ne le revoyait qu'au tout dernier moment, quand `finish()` retire `is-welcome`. **Corrigé en réduisant la portée** : nouvelle classe dédiée `wel-boot-hide`, posée par le même script inline du `<head>` (au lieu de `is-welcome`), et retirée par `show()` (welcome.js) dès qu'il tourne — donc active seulement pendant la fenêtre de course initiale (avant que welcome.js n'ait la main), jamais pendant le défilement qui suit. Filet de sécurité ajouté : un `setTimeout` de 4 s retire `wel-boot-hide` quoi qu'il arrive, au cas où `show()` ne s'exécuterait jamais (page modifiée, erreur…), pour ne jamais risquer un shell caché en permanence. **Vérifié** : `wel-boot-hide` retirée dès que `show()` tourne (avant même de scroller) ; en scrollant à un point intermédiaire AVANT la fin (`is-welcome` toujours vrai à ce stade), le haut du dashboard est bien visible en bas de l'écran, sous la Newsletter — plus de zone noire ; arrivée en bas, `finish()` déclenche toujours normalement (`is-welcome` retirée, `scrollY` remis à 0, dashboard affiché).
- **4e passe (retour utilisateur : « le fond s'arrête de bouger le temps du chargement, un petit freeze avant de reprendre »)** : celui-ci est une **limite réelle**, pas un bug — `login.html` et `app.html` sont deux documents séparés (décision assumée dans la 1re passe, voir plus haut, pour ne pas toucher `CHESTAccounts.guard()`/l'amorçage du shell) ; le contexte JS/WebGL de la page de connexion s'arrête forcément quand elle se ferme, et celui d'`app.html` doit redémarrer de zéro — il ne peut pas y avoir de continuité d'ANIMATION à 100 % à travers une vraie navigation, seulement une continuité VISUELLE (même shader, mêmes couleurs). Ce qu'on peut réduire, en revanche, c'est la DURÉE du trou : plus `app.html` met de temps à afficher sa 1re image de shader après la navigation, plus le gel se voit.
  - **Correctif appliqué : préchargement (`<link rel="prefetch">`) des ressources critiques d'`app.html` depuis `login.html`** — `css/tokens.css`, `layout.css`, `chest-da.css`, `patch-chest-da.css`, `welcome.css`, `js/config.js`, `accounts-auth.js`, `shell.js`, `nav.js`, `welcome.js` (qui contient le shader), plus `assets/logo-chest-hero.webp`, et le document `app.html` lui-même. `rel="prefetch"` charge en arrière-plan, priorité basse, **sans rien ralentir sur la page de connexion elle-même** — le temps que l'utilisateur remplit le formulaire (quelques secondes, largement assez), ces fichiers sont déjà en cache du navigateur. Au moment de la navigation réelle, `app.html` n'a donc presque plus rien à demander au réseau : son premier rendu, et sa première image de shader, arrivent le plus vite possible. Vérifié : ces fichiers apparaissent bien en 200 dans les requêtes réseau dès l'arrivée sur `login.html`, avant tout envoi de formulaire.
  - **Honnêteté à garder en tête** : ça réduit le gel au minimum atteignable sans fusionner les deux pages en un seul document (SPA) — un vrai zéro-gap demanderait de revenir sur la décision de la 1re passe (garder `login.html`/`app.html` séparés) et d'accepter le risque alors écarté (boucle de redirection entre le garde de la page et celui de l'iframe). Pas fait sans qu'on en rediscute explicitement.

## Connexion fusionnée dans app.html (2026-09-23) — SUPERSÈDE la section précédente

Toute la section ci-dessus (« Pages de connexion/inscription : même fond animé que Welcome ») décrit `login.html`/`app.html` comme deux documents séparés avec un shader dupliqué (`hero-bg.js`) — c'est le compromis « assumé » de la 1re passe, explicitement pas un vrai SPA. **Ce compromis a depuis été abandonné** : sur demande explicite de l'utilisateur (« le fond n'arrête jamais de tourner et que les éléments arrivent en fondu par-dessus »), `login.html` est devenu un simple stub de redirection (`window.location.replace('app.html')` tout en haut du `<head>`) et le formulaire de connexion vit maintenant DANS `app.html` (`#authOverlay`, transparent, posé par-dessus le hero de Welcome qui tourne déjà en continu depuis avant la connexion). Un seul document, un seul contexte WebGL du tout début (page pas connectée) jusqu'au dashboard — plus aucun gel/saut à la jonction, le risque de boucle de redirection écarté dans la 1re passe a été réévalué et accepté après vérification. `hero-bg.js` et le shader dupliqué de `login.html` sont **morts** (le fichier reste sur disque mais n'est plus chargé). Validé par l'utilisateur après 5 rounds de debug (flash blanc iframe, divergence de shader, micro-coupure canvas au resize, décalage des animations d'entrée, bypass par bookmark de l'ancien `login.html`) : **« c'est exactement ce que je voulais, verrouille ça »** — fusionné dans `main` le 2026-09-23.

- **`js/shell.js`** : l'amorçage de l'iframe (`frame.src = ...`) est différé derrière `CHESTShell.boot()`, appelée seulement une fois connecté (soit déjà au chargement si une session existe, soit par `app.html` juste après `CHESTAccounts.login()`) — sinon une page protégée chargerait dans l'iframe avant la connexion et sa propre garde la ferait sortir vers le haut, écrasant toute la page.
- **`js/welcome.js`** : `heroActive` (distinct de `closed`) suit si le hero WebGL est en train de tourner, pour continuer à l'alimenter (resize, neige, visibilitychange) même AVANT la connexion — c'est ce qui permet au fond de ne jamais s'arrêter entre l'écran de connexion et l'apparition du Welcome.
- **Piège de classe trouvé en vérifiant que la fusion n'avait rien cassé ailleurs (demande explicite utilisateur, voir plus bas)** : plusieurs endroits ne (re)calculaient l'état « connecté » qu'**une seule fois**, au chargement du script — correct tant que `app.html` n'était chargé QU'APRÈS une vraie connexion (ancien modèle deux-pages), cassé maintenant qu'`app.html` peut se charger AVANT la connexion et rester le même document après. Trouvé et corrigé : le bloc « Compte » en bas de la sidebar (`nav.js`, restait à "—"), le bouton « Membres (admin) » de la topbar (`data-admin-only`, restait caché pour un admin), les overrides CMS + menu ⋮ de la Newsletter (`welcome.js`, cartes gardaient leur contenu par défaut). `nav.js` expose maintenant `CHESTNav.refreshAccount()`/`refreshAdminVisibility()`, et `welcome.js` rappelle `loadBentoOverrides()`/`initBentoTools()` depuis `show()` — tous rappelés explicitement par `app.html` juste après `CHESTAccounts.login()`. **Réflexe à garder pour toute future page/fonctionnalité posée directement dans `app.html`** (pas dans une page d'iframe, qui elle ne charge jamais qu'après connexion grâce à `shell.js` ci-dessus) : si un script y lit `CHESTAccounts.isLoggedIn()`/`isAdmin()`/`getUser()` une seule fois à son exécution, il doit aussi être rappelable après une connexion intégrée, sinon il reste figé dans l'état « pas connecté » jusqu'au prochain rechargement complet de page.
- **Newsletter** : le texte "Continue à descendre / Ton dashboard arrive" sous `.wel__grid` (`app.html`) est remplacé par deux flèches doubles (SVG, dégradé `--chest-grad`) qui rebondissent doucement (`welHandoffBounce`/`welHandoffPulse`, `welcome.css`) — demande utilisateur, indication de défilement sans texte.

### Sécurisation du vrai code Pine des scanners (2026-09-23)

En vérifiant la sécurité avant de verrouiller la fusion ci-dessus (demande explicite utilisateur : « impossible que quelqu'un obtienne les pinscript, ni par du code, ni par une IA, ni nulle part »), découverte d'un vrai problème, plus grave que prévu : `site/js/scanner-store.js` contenait déjà le code source COMPLET des 4 vrais algos (WolfX/Algomni/SWYPER v6/Pivot) en clair — et ce fichier est présent tel quel sur le dépôt GitHub **PUBLIC** `chest_sites` (celui qui déploie sur Railway/Vercel, voir plus bas « Flux de déploiement ») depuis le commit `edd245d` du **2026-09-11**, soit ~12 jours d'exposition publique au moment de la découverte (vérifié via `curl https://api.github.com/repos/2sw0ne/chest_sites` sans authentification → `"private": false`). Le vrai problème n'était donc pas un accès non authentifié côté site (curl/DevTools), c'était le code source lui-même déjà lisible par n'importe qui sur github.com.

- **`scanner-store.js`** ne garde plus QUE les métadonnées d'affichage (nom, logo, tags, bougies) — `pineSource`/`secondaryPineSource` valent `null` et ne seront plus jamais commités. Extraction faite par script (`json.loads` sur les chaînes JS échappées), jamais en recopiant le texte à la main dans la conversation.
- Le vrai texte Pine vit désormais uniquement dans `accounts-bridge/scanners_secret.json` — **gitignoré comme `accounts.db`**, sur le Volume Railway du serveur de comptes, jamais dans un fichier destiné au dépôt.
- **`GET /scanners`** (`accounts-bridge/server.py`), réservé aux membres approuvés (même garde que `/school`/`/bento`) : `strategies.html` le récupère au démarrage (jeton de session), et injecte le résultat dans les scanners déjà chargés via `CHESTScanners.applyPineSource()`. Sans session valide, `scanner-chart.js` affiche « Connecte-toi pour voir l'indicateur de ce scanner » au lieu de planter sur `pineSource.replace(...)`.
- **`POST /scanners/restore`** (admin) : seule façon de poser ce fichier sur le Volume Railway après déploiement, puisque rien ne le déploie automatiquement (jamais dans git) — `curl -X POST <url>/scanners/restore -H "Authorization: Bearer <token>" -H "Content-Type: application/json" --data-binary @scanners_secret.json`.
- **`strategy-example.html`** (fiche orpheline, plus liée depuis `strategies.html`, script générique de pivots S/R — pas un des 4 vrais algos) perd son bouton « Copier » : durcissement minimal, proportionné à ce que cette page expose réellement.
- **Honnêteté sur la limite réelle, à ne jamais dissimuler si le sujet revient** : ce qui précède empêche un `curl` non authentifié et un simple accès à un fichier statique de récupérer le script. Ça n'empêche PAS un membre connecté d'extraire le texte via les DevTools de son propre navigateur une fois le graphique rendu — aucune techno côté client ne peut empêcher ça, c'est une limite fondamentale du web, pas un oubli.
- **Reste à faire par l'utilisateur, décidé avec lui, hors de portée de ce qu'un agent peut faire seul** (repo distant, réécriture d'historique + force-push) :
  1. Passer `chest_sites` en dépôt **privé** sur GitHub (Settings → General → Danger Zone → Change visibility) — coupe l'accès public à TOUT le contenu du dépôt, pas seulement ce fichier.
  2. Purger `site/js/scanner-store.js` de tout l'historique Git de `chest_sites` (`git filter-repo` dans un clone séparé, jamais dans ce working directory pour ne pas toucher l'historique complet de `STASH`/`origin`, qui doit rester intact) + force-push — n'efface pas une copie déjà prise pendant les ~12 jours d'exposition, mais arrête que le fichier reste consultable dans les vieux commits.
  3. Restaurer `scanners_secret.json` sur le Volume Railway via `POST /scanners/restore` une fois le nouveau `server.py` déployé.

### Clé Twelve Data retirée du frontend (2026-09-23, même jour, découvert au premier déploiement Vercel réel)

Premier déploiement Vercel du site (`chest-nine.vercel.app`, root directory `site/`) fait juste après le verrouillage ci-dessus — a immédiatement révélé un problème de la même famille : la page Stratégies affichait "Clé Twelve Data manquante". Cause : la clé vivait dans `site/js/config.local.js` (gitignoré, donc absent du déploiement) — marchait en local, jamais en production. La solution "rapide" (la coller en dur dans `config.js`) aurait recréé exactement le problème qu'on vient de traiter pour le Pine Script (`chest_sites` est public) ; l'utilisateur a choisi la solution propre plutôt.

- **`accounts-bridge/server.py`** : nouveau `GET /twelvedata/<endpoint>` (allowlist `time_series`/`price`, les deux seuls utilisés), réservé aux membres approuvés (même garde que `/scanners`), qui relaie vers `api.twelvedata.com` en injectant la clé lue depuis la variable d'environnement Railway **`TWELVE_DATA_API_KEY`** (Railway → service `accounts-bridge` → Variables — jamais dans un fichier commité). Implémenté avec `urllib` (stdlib), aucune nouvelle dépendance dans `requirements.txt`.
- **`scanner-chart.js`, `berich-chart.js`, `calendar.js`, `lot-calculator.js`** : chacun a sa propre petite fonction `twelveDataApi(endpoint, params)` (dupliquée à l'identique dans les 4 fichiers, même convention que `hero-bg.js` — pas de fichier partagé pour un si petit utilitaire, surtout que `backtesting-swyper.html`/`backtesting-allin.html`, qui chargent aussi `lot-calculator.js`, sont des fichiers "jamais toucher" et n'auraient pas pu recevoir un nouveau `<script src>`) qui appelle ce relais avec le jeton de session, au lieu d'appeler Twelve Data directement avec la clé dans l'URL. `config.js`/`config.local.js`/`config.local.example.js` n'ont plus le champ `twelveDataApiKey` — il n'existe plus nulle part côté client.
- **Pour que ça marche en local** : définir `TWELVE_DATA_API_KEY` comme variable d'environnement avant `python server.py` dans `accounts-bridge/` (plus dans `config.local.js`).
- Vérifié en direct (clé de test injectée par variable d'environnement, jamais commitée) : 401 sans jeton, 404 sur un point d'accès hors liste, 200 avec de vraies données ; graphique Stratégies (Wolfx, XAUUSD) rendu avec de vraies bougies récupérées via ce relais.
- **Reste à faire par l'utilisateur** : définir `TWELVE_DATA_API_KEY` dans les variables d'environnement Railway du service `accounts-bridge` (même valeur que l'ancienne `config.local.js`), puis repousser/redéployer.

## Plan du site (`site/*.html`)

| Page | Rôle |
|---|---|
| `index.html` | Gate d'accès |
| `dashboard.html` + `js/dashboard.js` | Multi-comptes (switcher), KPIs période/profit/RR/winrate/DD, courbe d'équity $/%, panneau Objectifs & calendrier 14j (façon FTMO), widget "Top/Flop crypto top 100" (`js/crypto-movers.js`) |
| `backtesting.html` | Hub : 2 cartes statiques (SWYPER, ALLIN) + cartes dynamiques des backtests ajoutés par l'utilisateur (menu ⋮ Modifier/Supprimer) + carte "Ajouter un backtest" |
| `backtesting-swyper.html` / `backtesting-allin.html` | **Fichiers legacy, ne jamais réécrire** — voir section dédiée ci-dessous |
| `backtest-add.html` | Assistant d'ajout : prompt IA à copier → infos générales → import Xlsx → money management (manuel/auto, compte propre + propfirm optionnel) → génère. Supporte aussi le mode édition (`?edit=<id>`) |
| `backtest-view.html?id=...` | Rapport généré dynamiquement (voir section Backtesting self-service) |
| `strategies.html` / `strategy-example.html` | Liste de stratégies façon page TradingView (Pine Script, onglets, changelog) |
| `calendar.html` + `js/calendar.js` | Calendrier économique + hero de sentiment (voir section dédiée) |
| `school.html` | L'école : cours écrits (rayons, fiches, cours Notion) + cours vidéo (bibliothèque avec flyers) |
| `account.html` | Thème, paire suivie (calendrier), changement de code d'accès |

## Fichiers de référence — NE JAMAIS TOUCHER NI FORK

- **`site/support.js`** : framework de rendu **généré** (`// GENERATED from dc-runtime/src/*.ts — do not edit`), le moteur `<x-dc>`/`DCLogic` qui fait tourner `backtesting-swyper.html`/`backtesting-allin.html`. Zéro connaissance des trades/capital/risque — pur rendu. Fragile à étendre à la main, ne jamais essayer.
- **`site/allin-engine.js`** (253 lignes) : contient les vraies données des algos ALLIN/SWYPER (`RAW_ALLIN20`, `RAW_BE`, `CAP0 = 10000`, presets `MM_ALLIN20`/`MM_BE`). Sert de **référence de conventions de calcul** (capital composé `capital *= 1 + risque%/100 * rr`, BE traité comme rr=0, paliers de risque après N SL consécutifs, détection d'épisodes de drawdown) — ces conventions ont été reprises dans le moteur générique (`js/backtest-engine.js`) mais **jamais en forkant ce fichier**.
- **`backtesting-swyper.html`** / **`backtesting-allin.html`** : pages de production réelles, fonctionnelles, à ne jamais réécrire — juste un lien "← CHEST" ajouté en overlay. Le design SWYPER (hero plein écran sombre `#050505`, dégradé rose→violet, sections numérotées "01 — Modèles", "02 — Drawdown", etc., cartes cp/pf orange `#e35728`/bleu `#5470c2`) a servi de **référence visuelle** pour la refonte de `backtest-view.html`.

## Design system / DA

Hérité de l'outil de backtest existant de l'utilisateur (voir historique complet ci-dessous) :
- Thème sombre par défaut : `#050505` (fond), `#0c0c0e` (panel) ; miroir clair : blanc/gris clair. Toggle persistant.
- Dégradé de marque : rose `#ff3d7f` → violet `#c04dff`.
- Police : Instrument Sans (Google Fonts).
- Convention "eyebrow" numérotée pour les sections : `01 — Titre` (voir `.eyebrow` dans `tokens.css`) — la ligne qui suit est dessinée automatiquement par `.eyebrow::after`, ne jamais taper de tirets à la main dans le texte.
- Convention couleur `.val`/`.val.pos` (vert `--green`)/`.val.neg` (rouge `--red`)/`.val.neutral` (gris `--muted`) — réutilisée partout (calendrier, backtest, dashboard).
- Hero "plein écran toujours sombre" (breakout `width:100vw; margin-left:-50vw`, même trick que `.ticker-wrap`) utilisé pour la page de garde du calendrier ET celle d'un backtest — délibérément **non lié au thème du site** (reste sombre même en thème clair), pour matcher l'identité visuelle de SWYPER.
- **Honnêteté radicale sur toute heuristique** : chaque estimation/biais/note affichée est explicitement labellisée "heuristique statistique, pas une prédiction garantie" (ou équivalent). Ne jamais présenter un calcul maison comme un vrai modèle prédictif entraîné.

## Backtesting self-service (ajouter un backtest sans coder)

Fonctionnalité phare construite cette session : l'utilisateur peut ajouter un nouveau backtest directement depuis le site, sans que Claude ait à coder une nouvelle paire de fichiers HTML+JS à chaque fois (contrairement à SWYPER/ALLIN, codés en dur).

- **`js/backtest-store.js`** : CRUD localStorage (`list/get/add/update/remove`), clé `chest_backtests`. Schéma d'un backtest : `{id, title, description, capital, cp:{mode:'manual'|'auto', risk, tiers:[{afterSl,newRisk}], rules?:[…], premium?:{…}}, pf:{...}|null, trades:[{date,result,rr,open?,close?,source?,confirmation?,order?,extra:{}}], createdAt}`.
- **`js/backtest-engine.js`** : moteur générique (simulation à risque fixe/paliers, courbe d'équity, épisodes de drawdown >10%, stats, mensuel, `optimizeCp`/`optimizePf` = grid-search transparent 0.1%→5% par pas de 0.1). `optimizeCp` vise ≤3% de risque (relâché à 5% si besoin) et ≤30% de DD max. `optimizePf` est **strict** : jamais >5% DD journalier ni >10% DD max, renvoie `null` avec message honnête si aucun réglage ne convient. Flag "valeur non garantie" si les heures de clôture ne sont pas fournies (le DD journalier suppose alors une clôture le jour même).
- **`js/xlsx-import.js`** (SheetJS) : colonnes A/B/C **strictes par position** (date/résultat/RR), peu importe le nom d'en-tête. Colonnes optionnelles après C détectées par nom (FR/EN, insensible aux accents via une table de correspondance explicite — **jamais** de regex Unicode sur les diacritiques, ça a cassé l'outil d'édition une fois). Tout en-tête non reconnu est préservé sous `trade.extra[<en-tête original>]` plutôt que jeté (permet à une IA de nommer une colonne "Facultatif" sans perte de données).
- **`backtest-add.html`** : assistant en 4 étapes. Le prompt à copier-coller (étape 1) nomme explicitement les en-têtes attendus et instruit l'IA de préserver tout le reste sous "Facultatif"/"Facultatif 2"... Dropzone : le retour "fichier ajouté" s'affiche **dans** la dropzone elle-même (pas un message séparé en dessous — évite l'impression d'ajouter un 2e fichier). Supporte `?edit=<id>` pour modifier un backtest existant (préremplit tout, sauvegarde via `update()` au lieu de `add()`).
- **`backtest-view.html?id=...`** : page de rapport, refaite pour matcher fidèlement SWYPER : hero plein écran (titre en dégradé, badge positions+période non filtrée, footer Capital initial/Trades/Période en mois/**Note** — une note E→S calculée par heuristique transparente sur retour/DD/profit factor/winrate), cartes "Deux possibilités" (compte propre + propfirm) côte à côte avec filtre par année, clic sur une carte → bascule + scroll vers la section détail (gros bloc de 6 stats façon ancien design, courbe d'équity, zones de DD **en carrés** — pas des ovales, testé et corrigé — sous la courbe), tableau mensuel comparatif cp/pf, journal filtrable (compte/résultat/mois) groupé par mois avec en-tête de séparation.
- Menu ⋮ sur les cartes du hub (`backtesting.html`) : Modifier (renvoie vers `backtest-add.html?edit=`) / Supprimer (confirmation, suppression instantanée sans reload).

## Calendrier économique & sentiment (`calendar.html` + `calendar-bridge/`)

- **Sources de données** (aucune API payante, tout gratuit/public) : `investing.com/economic-calendar` (aujourd'hui + semaine en cours, via **Playwright avec un vrai Chrome visible** — le mode headless est bloqué par leur anti-bot) + `tradingeconomics.com/calendar` (au-delà, jusqu'à ~10 jours). Champ `source` sur chaque évènement pour transparence. Couvre US/zone euro/UK/Japon uniquement.
- **`calendar-bridge/fetch_calendar.py`** : script qui scrape et écrit `site/data/calendar.json`. `build_calendar_data()` fait le fetch ; `merge_with_history()` (ajouté récemment) **accumule un historique glissant de 30 jours** au lieu d'écraser à chaque run — nécessaire pour que le navigateur de dates du site puisse consulter "hier". Deux limites documentées dans le code et le README : l'historique ne remonte que depuis sa mise en service, et un jour archivé garde le "résultat" capturé au moment du run (pas de mise à jour rétroactive intra-journée).
- **`calendar-bridge/server.py`** : service Flask déployé sur **Railway** (Xvfb pour le Chrome visible, `xauth` requis, `--disable-dev-shm-usage` pour la mémoire limitée du conteneur), refetch toutes les 24h, sert `GET /calendar.json` en lecture (CORS ouvert, données publiques). URL live configurée dans `site/js/config.js` (`calendarApiUrl`). A nécessité **5 itérations de debug** (xauth manquant → Flask bloqué par Xvfb → OOM Chrome → bannière de consentement OneTrust asynchrone → timing du clic "Cette Semaine") — tout est documenté dans `calendar-bridge/README.md`, à consulter avant de retoucher ce script.
- **Sentiment forex/matières premières** (`js/calendar.js`, `PAIR_CONFIG`) : chaque paire a 1-2 devises "motrices" avec un poids signé. Matrice complète des 28 paires forex (8 devises : EUR/GBP/AUD/NZD/USD/CAD/CHF/JPY, générée par `buildFxConfig()`, pas écrite à la main) + 5 matières premières (Or/Argent/Pétrole/Platine/DXY, DXY promu en paire suivable à part entière). Seuls EU/UK/US/JP ont de vraies données suivies — une paire comme AUDCHF (aucune des deux devises suivie) affiche honnêtement un biais neutre plutôt qu'une fausse analyse.
- **Sentiment crypto** (11 pièces : BTC/ETH/SOL/XRP/TRX/HYPE/DOGE/LINK/ADA/UNI/AVAX, ids CoinGecko vérifiés) : **différent** du modèle forex — combine 3 signaux normalisés (-1..+1) : macro US générique 40% (réutilise le même calcul que l'or), Fear & Greed Index (`api.alternative.me/fng/`, gratuit sans clé) 35%, momentum 24h de la pièce suivie (CoinGecko `/coins/markets`) 25%. Affiche uniquement la pièce suivie (logo réel CoinGecko, pas d'emoji) + jusqu'à 3 annonces macro ayant pesé — pas les 11 pièces à chaque fois.
- **Sélecteur de paire** (`account.html`) : 3 menus déroulants (Forex 28 options en `<optgroup>`, Matières premières 5, Crypto 11) plutôt que des boutons — un seul `<select>` actif à la fois, stocké dans `localStorage` (`chest_sentiment_pair`).
- **Navigateur de jour** (section "Aujourd'hui" du calendrier) : montre **exactement** le jour sélectionné (plus une fenêtre 48h), boutons ◀/Aujourd'hui/▶, bornes désactivées aux limites des données disponibles. La liste "Prochains jours" reste toujours ancrée sur le vrai jour courant, indépendamment de la navigation.
- **Piège de fuseau horaire** : ne jamais utiliser `date.toISOString().slice(0,10)` pour comparer une date locale à une date `YYYY-MM-DD` du backend (déjà convertie en heure de Paris) — `toISOString()` repasse en UTC et peut décaler le jour. Utiliser `isoDateLocal()` (déjà défini dans `calendar.js`).
- **Bug corrigé (2026-09-23, retour utilisateur : comparaison avec investing.com, "rien à voir, le mien est complètement cassé")** : `previous`/`consensus`/`actual`/`forecast` ressortaient VIDES sur les ~208 évènements à venir (source `tradingeconomics.com`, tout ce qui dépasse la fenêtre investing.com). Cause réelle : `TE_ROW_RE` (`fetch_calendar.py`) capturait le contenu d'une ligne jusqu'au PREMIER `</tr>` rencontré, mais chaque ligne contient un mini-tableau imbriqué pour le drapeau du pays (son propre `<tr>...</tr>`) — la capture s'arrêtait donc juste après le drapeau, jamais jusqu'aux champs réels. Corrigé en capturant jusqu'à la prochaine ligne d'évènement plutôt qu'un `</tr>` littéral (regex des champs individuels rendues tolérantes aux guillemets simples/doubles au passage, le markup du site les mélange). Vérifié en direct contre le vrai site : `previous` 0/208 → 156/208 rempli, `consensus` 0/208 → 37/208. Prend effet sur Railway au prochain refresh (`REFRESH_SECONDS`, 2h par défaut) une fois le fix déployé.

## Pré-déploiement Vercel (2026-09-23) : inscription ouverte, retrait des données de démo

Passe demandée par l'utilisateur avant un premier déploiement public sur Vercel (« retire les data vide comme les faux dashboard et les faux membres qu'on parte de 0 [...] que n'importe qui puisse créer son compte [...] une fois bon je le déploie sur vercel »).

- **Inscription ouverte à tous** : `accounts-bridge/server.py`, `signup()` — `status` passe systématiquement à `'approved'` (avant : `'pending'` sauf le tout premier compte). Seul `is_admin` reste réservé au tout premier compte créé (propriétaire du site). Un admin garde la main pour bloquer un compte a posteriori (`POST /members/<id>/block`, déjà existant) — la porte d'approbation manuelle n'est simplement plus utilisée à l'inscription. `login()` vérifie déjà `status === 'approved'`, donc la connexion fonctionne immédiatement après inscription, sans changement côté login. Copie mise à jour en conséquence sur `signup.html`/`admin-members.html`.
- **Comptes de test retirés de la vraie base locale** (`accounts-bridge/accounts.db`, gitignorée) : 4 faux membres `@example.com` supprimés (table `users` + `sessions` associées), ne laissant que le vrai compte admin (`swann.lafon@gmail.com`, id 1). Action ponctuelle sur la donnée, pas un changement de code.
- **Dashboard : plus de comptes de démonstration + vrai état vide (2026-09-23)** : `DEFAULT_ACCOUNTS` (`js/dashboard.js`) — les 2 comptes fictifs "Compte Démo Vantage"/"Challenge FTMO" sont retirés (`= []`). **Bug réel trouvé en testant le retrait à blanc** : `currentAccount()` faisait `accounts.find(...) || accounts[0]`, qui renvoie `undefined` dès que `accounts` est vide → `renderAll()` plantait sur `activeAccountData.id` (`TypeError: Cannot read properties of undefined`). Corrigé avec un vrai état vide plutôt qu'un simple garde-fou silencieux : `activeId()`/`currentAccount()` renvoient `null` proprement quand il n'y a ni compte ni famille ; `renderAll()` bascule alors `#dashMain` en classe `.is-empty` (CSS dans `dashboard.html` : masque tout sauf `#dashEmptyState`) et affiche une carte glass "Ajoute ton premier compte" (`#dashEmptyState`, bouton relié à `openAddAccountModal()`, déjà existante). Dès qu'un compte est ajouté, `renderAll()` (déjà appelé en fin d'ajout) fait disparaître l'état vide normalement. **Vérifié en direct** (navigateur intégré, jamais contre le vrai backend — token/`localStorage` simulés) : état vide correct sans erreur console sur un profil totalement neuf (0 compte), retour à la normale correct dès qu'un compte existe (`mainClass` vide, `#dashEmptyState` caché, KPI peuplés).
- **Founder (bento Welcome)** : valeurs par défaut de cadrage/zoom (`DEFAULTS.founder` dans `welcome.js`) mises à jour une 2e fois avec le dernier réglage manuel de l'utilisateur via le bouton Recadrer (`{dx:2, dy:45, s:1.3}`).
- **Calendrier et BERICH vérifiés git + Railway** : les deux dossiers (`calendar-bridge/`, `berich-bridge/`) sont git-clean (aucune modification locale non déployée) ; les deux URLs Railway de `site/js/config.js` répondent en direct avec de la donnée réelle et à jour (`calendarApiUrl` : évènements récents ; `berichApiUrl` : signal du jour même). **Asymétrie notée, pas un problème** : `berich-bridge/` n'a ni `Dockerfile` ni `requirements.txt` (contrairement à `calendar-bridge/`) mais tourne quand même sur Railway (déploiement probablement auto-détecté par Nixpacks) — fonctionne, donc pas retouché, juste consigné ici si ça surprend en cas de redéploiement.
- **Clarification importante (2026-09-23) : BEFREE ≠ berich-bridge.** `berichApiUrl` pointait vers `github.com/2sw0ne/BEFREE`, un service SÉPARÉ dont le seul rôle est de relayer les alertes TradingView vers le bot Telegram — une note précédente de ce fichier affirmait à tort que c'était "le même service". Le vrai `berich-bridge/` de CE repo n'avait jamais été déployé (prototype local). Préparé pour un vrai déploiement Railway dans la foulée : `Dockerfile`/`requirements.txt` ajoutés (même schéma qu'`accounts-bridge`), route de lecture renommée `/signal.json` → `/signals` (pour matcher `berichApiUrl`), lit `PORT` depuis l'environnement, `debug=False`. Pas de Volume Railway ici (contrairement à `accounts-bridge`) — les 50 derniers signaux sont perdus à chaque redéploiement, acceptable pour l'instant (se repeuple à la prochaine alerte TradingView). `berichApiUrl` reste pointé sur BEFREE en attendant le vrai déploiement (pour ne pas couper l'affichage) — **à remplacer** une fois `berich-bridge` déployé, et l'alerte TradingView à repointer vers son `/webhook`.
- **Résolu (2026-09-23) : `accountsApiUrl` déployé.** Les 3 services (`accounts-bridge`, `calendar-bridge`, `berich-bridge`) tournent maintenant dans **un seul projet Railway**, connecté au repo GitHub **`github.com/2sw0ne/chest_sites`** (remplace `STASH` comme source de déploiement — `origin` reste `STASH` dans ce dépôt local, `chest_sites` est un remote séparé, poussé manuellement le temps que le push direct depuis Claude Code soit bloqué par son garde-fou anti-exfiltration). Chaque service a son "Root Directory" réglé sur son dossier (`accounts-bridge`/`calendar-bridge`/`berich-bridge`), port interne `8080` partout. `accounts-bridge` a un Volume Railway attaché (persistance de `accounts.db`). URLs vérifiées vivantes (`/health`, `/calendar.json`, `/signals`) et renseignées dans `site/js/config.js`. **Reste à faire, hors code** : repointer l'alerte webhook TradingView ("Any alert() function call") vers `<url-berich-bridge>/webhook` pour que `berich-bridge` reçoive vraiment les signaux (jusqu'ici c'était BEFREE qui les recevait).
- **Flux de déploiement désormais : push sur `chest_sites`, pas `STASH`.** Toute future session doit committer sur `STASH` (`origin`, historique complet) PUIS pousser aussi sur `https://github.com/2sw0ne/chest_sites.git` (remote `chest-sites` si déjà ajouté dans ce checkout, sinon `git push https://github.com/2sw0ne/chest_sites.git main:main`) pour que Railway redéploie — sinon les changements ne partent jamais en prod. Si le push direct est bloqué par le classificateur auto-mode de Claude Code ("Data Exfiltration"), le donner à faire à l'utilisateur (commande prête à copier-coller).
- **Pas fait, hors scope de cette passe (à signaler si redemandé)** : passe exhaustive de vérification console sur toutes les pages (seul le dashboard, avant/après le retrait des comptes de démo, a été spécifiquement re-testé) ; relecture orthographique du site entier (seules les chaînes touchées par cette passe — signup/admin-members/commentaires — ont été relues).

## Synchro multi-appareils + PWA installable + notifications push (2026-09-26)

Deux demandes utilisateur : "mes données ne sont pas sur mon téléphone quand je me connecte avec
le même compte" + "on pourrait le mettre en application, avec des notifications ?" (réponse
donnée : PWA plutôt qu'une vraie app native App Store/Play Store — beaucoup plus rapide à livrer,
couvre l'essentiel : icône + plein écran + notifications). L'utilisateur a explicitement autorisé
un risque de perte de données pour aller vite ("les données enregistrées sont pas très
importantes, si ça se perd c'est pas très grave") — ne pas généraliser cette tolérance à d'autres
décisions sans qu'elle soit redemandée.

- **`accounts-bridge`** : table `user_data` (miroir générique clé/valeur PAR UTILISATEUR — le
  serveur ne connaît jamais le schéma de "chest_accounts" vs "chest_journal", juste des paires
  clé/valeur) + `GET`/`POST /sync`. Table `push_subscriptions` (Web Push standard) +
  `POST /push/subscribe`/`/push/unsubscribe`/`/push/send` (admin, sert à TESTER l'envoi — les
  vrais déclencheurs automatiques n'existent pas encore, voir plus bas). Nouvelle dépendance
  `pywebpush` (`requirements.txt`).
- **Clé VAPID** : générée une fois avec `py-vapid`. La **publique** n'est par nature pas secrète
  (c'est le principe de VAPID) et vit directement dans `js/config.js` (`vapidPublicKey`) — le
  client n'a donc PAS besoin d'un aller-retour serveur pour l'obtenir. La **privée** ne vit que
  dans la variable d'environnement Railway `VAPID_PRIVATE_KEY` (jamais commitée, même principe que
  `TWELVE_DATA_API_KEY`/`scanners_secret.json` — `chest_sites` est public). **Si la clé doit être
  régénérée un jour**, remplacer les DEUX valeurs (publique dans `config.js`, privée sur Railway)
  en même temps — un dépareillement casse silencieusement tous les abonnements existants.
- **`site/js/sync-store.js`** : intercepte `localStorage.setItem` sur une liste explicite de clés
  ("vraies données" — comptes, familles, backtests, journal, réglages... — jamais un jeton de
  session, une préférence purement locale comme la sidebar repliée, ou un cache re-téléchargeable)
  et les répercute vers `/sync` en tâche de fond (débit groupé 600 ms). **Aucune réécriture de
  `dashboard.js`/`journal-store.js`/`backtest-store.js` n'a été nécessaire** — ce fichier se
  contente d'intercepter les clés qui l'intéressent, les autres fichiers continuent de lire/écrire
  `localStorage` exactement comme avant. Pull volontairement **asynchrone** au chargement (jamais
  une requête bloquante en tête de page — ce site a une exigence forte de "jamais de sensation de
  chargement", déjà travaillée à plusieurs reprises, voir section Welcome plus haut) : un appareil
  totalement vide qui reçoit des données se recharge UNE fois pour les afficher immédiatement ; un
  appareil qui a déjà des données ne recharge jamais tout seul. **Pour ajouter une future clé
  localStorage à synchroniser** : juste l'ajouter à `SYNCED_KEYS` dans ce fichier, rien d'autre à
  changer côté serveur.
- **PWA** : `manifest.json` + icônes (`assets/icon-192.png`/`icon-512.png`, versions "maskable"
  pour Android — générées depuis `assets/logo-chest.png`) + `sw.js` (service worker, à la racine
  du site pour couvrir toutes les pages). **Cache volontairement minimal** (network-first partout
  sauf les icônes, qui ne changent jamais) : un service worker cache-first aurait recréé
  exactement les bugs de cache déjà rencontrés cette session avec la convention `?v=N` du site
  (voir plusieurs sections plus haut), en pire — un cache qui survivrait même à un rechargement
  forcé. **`js/pwa.js`** enregistre le service worker et expose
  `CHESTPwa.notificationStatus()`/`enableNotifications()`/`disableNotifications()`, utilisés par
  le nouveau réglage "Notifications" d'`account.html`.
- **Déclencheurs automatiques** : voir section dédiée « Déclencheurs de notifications push »
  juste en dessous — câblés le même jour, après cette base.
- **Vérifié en direct** (session de test locale, jamais contre les vraies données de l'utilisateur) :
  simulation d'un appareil neuf (localStorage vidé) → connexion → données déjà connues du serveur
  récupérées automatiquement → réapparition après un seul rechargement ; écriture locale → confirmée
  arrivée côté serveur (round-trip complet, vérifié aussi en direct via `curl`) ; service worker
  enregistré et actif (`navigator.serviceWorker.getRegistrations()`) ; réglage Notifications
  réagit correctement à l'état de permission du navigateur (masqué si bloquées/non supportées).

## Déclencheurs de notifications push (2026-09-26)

Suite directe de la section précédente : la base (VAPID, `/sync`, abonnements) était posée mais
aucun évènement réel ne déclenchait encore d'envoi. Demande utilisateur, verbatim : "met 1, 2, 4
mais plutot toute les infos de modification du propfirm. en mode si on a tp, ou sl, de combien
ect... 5 pour les nouveau membre oui avec le prenom ect..." — sur une liste proposée de 5
candidats, l'utilisateur a choisi 1 (signal détecté), 2 (annonce calendrier à venir), une version
redéfinie de 4 (pas "limite du propfirm approche" mais bien TOUTE clôture TP/SL avec le détail), et
5 (nouveau membre, avec prénom).

- **Mécanisme partagé** : `INTERNAL_PUSH_SECRET` (variable d'environnement Railway, PARTAGÉE entre
  `accounts-bridge`, `berich-bridge` et `calendar-bridge` — à définir manuellement, aucune valeur
  par défaut) protège `accounts-bridge` `POST /push/broadcast` : ce n'est PAS un jeton de session
  utilisateur (un webhook TradingView ou une boucle de fond n'a pas de session), juste un secret
  service-à-service. `accounts-bridge/server.py` : `send_push_to_all(...)` (tout le monde — signal
  scanner et annonce calendrier concernent tout le monde) et `send_push_to_admins(...)` (jointure
  `push_subscriptions`+`users` filtrée `is_admin=1` — nouveau membre ne concerne que les admins).
- **1 + « 4 » redéfini — `berich-bridge/server.py`** : `notify()` (POST vers
  `/push/broadcast`, jamais bloquant — `except (URLError, OSError): pass`) appelé (a) à l'ouverture
  d'un signal dans `/webhook` (paire, sens, entrée, SL, TP calculé) et (b) à la clôture (TP ou SL
  touché, avec le prix de sortie exact). **Aucune nouvelle infra de sondage MyFXBook nécessaire** —
  le webhook du script Pine "BE FR€E" contenait déjà tout ce qu'il fallait ; construire un poll
  serveur des comptes MyFXBook aurait été un chantier bien plus lourd pour rien.
  `ACCOUNTS_BRIDGE_URL`/`INTERNAL_PUSH_SECRET` à définir sur ce service Railway.
- **5 — `accounts-bridge/server.py`, `signup()`** : juste après l'email existant (`send_signup_notification`,
  jamais remplacé, l'un n'exclut pas l'autre — l'admin peut avoir désactivé les notifications),
  `send_push_to_admins("Nouveau membre CHEST", f"{first_name} {last_name} vient de créer un compte
  ({email}).", "admin-members.html")`, dans un `try/except` qui ne bloque jamais l'inscription.
- **2 — `calendar-bridge/server.py`** : PAS de nouveau scraping (le refresh lent existant,
  `REFRESH_SECONDS` = 2h, reste inchangé — volontairement lent, voir le commentaire au-dessus de
  `REFRESH_SECONDS` sur les crashs OOM Railway déjà rencontrés). À la place, une boucle SÉPARÉE et
  rapide (`notify_loop()`, `NOTIFY_CHECK_SECONDS` = 60s) relit uniquement `state["data"]["events"]`
  déjà en mémoire, repère les évènements `"importance": "high"` dont l'heure (`date`+`time`, fuseau
  Paris) tombe dans les `NOTIFY_WINDOW_MINUTES` (20) minutes à venir, et notifie une fois par
  évènement (`notified_event_ids`, mémoire seulement — se réinitialise à chaque redémarrage du
  conteneur, jugé sans conséquence : au pire une annonce déjà passée pourrait renotifier juste après
  un redéploiement, jamais de spam en boucle). `ACCOUNTS_BRIDGE_URL`/`INTERNAL_PUSH_SECRET` à
  définir aussi sur ce service Railway.
- **Testé en conditions réelles (2026-09-26/27) — deux vrais incidents de déploiement, corrigés :**
  1. **Format de `VAPID_PRIVATE_KEY`** : `py_vapid` (utilisé par `pywebpush`) attend la clé privée
     sous forme **brute** (le scalaire encodé en base64 urlsafe SANS padding, ex.
     `ZC-ODFv9sBMKoUIqdiqOrdegE7koDLJRENm2KL8v3bM`), **pas** le bloc PEM
     (`-----BEGIN PRIVATE KEY-----...`) donné initialement à coller sur Railway — coller le PEM
     faisait planter `webpush()` (`ASN.1 parsing error`). `accounts-bridge/server.py` accepte
     maintenant les deux formats (`_normalize_vapid_key()` détecte "BEGIN" et convertit), mais **le
     format brut reste préférable** à coller sur Railway (une seule ligne, alphabet
     base64-urlsafe uniquement — aucun tiret/retour à la ligne à perdre en copiant).
  2. **Incident critique évité de justesse** : la 1re version de `_normalize_vapid_key()` plantait
     (exception non rattrapée) si le PEM collé était illisible — comme ce code tourne au
     chargement du module (avant l'initialisation de Flask), ça faisait **crash-boucler tout
     `accounts-bridge`** (plus de `/me`, `/login`, rien), pas seulement les notifications. Corrigé :
     toute erreur de parsing s'y rabat sur `""` (notifications désactivées, dégradation en douceur
     déjà prévue par le `if not VAPID_PRIVATE_KEY` existant) — **une clé VAPID cassée ne doit
     jamais pouvoir affecter autre chose que les notifications.**
  - Signal BERICH (ouverture/clôture) et nouveau membre confirmés fonctionnels sur un vrai iPhone.
     L'annonce calendrier (item 2) reste à confirmer au prochain évènement à fort impact.
- **Notifications sans titre séparé (2026-09-27, demande utilisateur)** : iOS affiche déjà
  automatiquement le nom de l'app (CHEST) + son icône au-dessus de chaque notif — un titre
  `showNotification()` en plus faisait doublon visuel ("CHEST" / "CHEST — test"). `site/sw.js`
  fusionne maintenant l'éventuel `title` envoyé par le serveur DANS le `body` (`${title} — ${body}`)
  et passe une chaîne vide comme titre à `showNotification()` — le corps contient tout, aucun
  changement nécessaire côté serveur (les trois déclencheurs continuent d'envoyer `title`+`body`
  séparément, la fusion se fait uniquement côté client).
- **Bouton "Envoyer un test"** (ajouté temporairement dans `account.html` pour diagnostiquer les
  deux incidents ci-dessus) retiré une fois la fonctionnalité confirmée — `POST /push/send` reste
  disponible côté serveur (admin, gated) pour un futur test manuel via `curl` au besoin.

## Notification de clôture MT5 en temps quasi réel — `mt5-terminal` + `mt5-notify-bridge` (2026-09-27)

Suite directe de la section précédente : le déclencheur "4" (TP/SL touché) ne couvrait que les
signaux du scanner BERICH, pas les VRAIES positions personnelles de l'utilisateur sur son compte
MT5 (Live Swann). Question posée : Myfxbook est-il assez rapide pour ça ? Réponse trouvée en
relisant `js/myfxbook-store.js`/`js/dashboard.js` : **non** — Myfxbook lui-même ne se resynchronise
que très lentement côté serveur, et CHEST ne l'interroge de toute façon qu'à la demande (cache 5
min, ou 3 min pour Live Swann UNIQUEMENT pendant que l'onglet reste ouvert) — rien ne tourne jamais
en fond. Alternative validée avec l'utilisateur après étude comparative (voir ci-dessous) :
connexion DIRECTE au terminal MT5 (même principe que Futurizq, étudié plus tôt pour la
recommandation propfirm — voir "Recommandation propfirm avec money management" plus haut : lien
MT5 = numéro de compte + serveur + mot de passe investisseur, chiffré, traité côté serveur),
auto-hébergée plutôt que via un service payant.

- **Options étudiées et écartées** : MetaApi.cloud (service géré, ~10-12 $/mois PAR COMPTE connecté
  — tarifs officiels vérifiés sur `metaapi.cloud/#pricing`, latence <1ms mais coût récurrent réel
  pour un seul compte) ; `metatraderapi.net` (concurrent, encore plus cher au compte unique,
  14 $/mois) ; auto-hébergement Windows/multi-terminaux (limité à ~24-28 terminaux MT5 par machine,
  RAM lourde, pertinent seulement à l'échelle de nombreux comptes — pas le cas ici).
- **Solution retenue : `mt5linux`** (github.com/lucas-campagna/mt5linux, 222⭐, actif) — fait
  tourner un VRAI terminal MT5 sous Wine dans un conteneur Alpine (image publiée
  `lprett/mt5linux`), exposant l'API Python officielle MetaTrader5 via un pont RPyC. Coût marginal
  quasi nul (juste un peu de compute Railway en plus, déjà payé pour les autres services) plutôt
  qu'un abonnement par compte — hypothèse : c'est probablement ainsi que Futurizq tient son propre
  modèle (29€/mois tout compris) malgré le coût des services API tiers équivalents.
- **Deux services Railway séparés** :
  - `mt5-terminal/` — juste `FROM lprett/mt5linux:latest` + `MT5_HOST=0.0.0.0`. Le compte connecté
    se choisit maintenant depuis le site (voir "Changer de compte Live depuis le site" ci-dessous) -
    `MT5_LOGIN`/`MT5_PASSWORD`/`MT5_SERVER` restent utilisables en secours (autologin au
    démarrage) mais ne sont plus le chemin normal. **Le mot de passe utilisé doit toujours être
    celui de l'INVESTISSEUR (lecture seule)**, jamais celui de trading — double protection
    volontaire : même si `mt5-notify-bridge` appelait un jour une fonction de trading par erreur
    (il ne le fait pas), le serveur du broker la refuserait de toute façon.
  - `mt5-notify-bridge/` — sonde `history_deals_get()` toutes les `MT5_POLL_SECONDS` (15s par
    défaut - connexion locale au réseau privé Railway, pas un appel facturé, peut rester bas) via
    le réseau privé Railway (`mt5-terminal.railway.internal:18812`), détecte les deals de type
    `DEAL_ENTRY_OUT`/`DEAL_ENTRY_OUT_BY` jamais vus (dédupliqués par `ticket`, jamais réattribué),
    et notifie via le `POST /push/broadcast` déjà existant (même `INTERNAL_PUSH_SECRET` que
    berich-bridge/calendar-bridge) avec le P&L réel (`profit+commission+swap`) et la vraie cause
    de clôture lue dans le champ `reason` du deal (`DEAL_REASON_TP`=5/`SL`=4/`SO`=6, jamais devinée
    — constantes vérifiées sur la doc officielle MQL5, `mql5.com/en/docs/constants/tradingconstants/dealproperties`).
- **⚠️ Piège évité de justesse pendant la mise en place** : un dossier `mt5-bridge/` existait déjà
  à la racine du dépôt depuis le tout premier commit — un script LOCAL, sans rapport, que
  l'utilisateur lance sur sa PROPRE machine Windows pour exporter son compte MT5 vers
  `site/data/data.json` (lu par le Dashboard, voir la section "Autres décisions techniques
  notables" plus bas). Le nouveau service a failli être créé dans ce même dossier (écrasant
  `README.md` avant d'être repéré via `git status` affichant "M" au lieu de "??") — renommé
  `mt5-notify-bridge/` pour ne plus jamais confondre les deux. **Toujours vérifier `git status`
  avant d'écrire dans un dossier dont le nom semble libre.**
- **Pas encore testé en conditions réelles** : aucun accès à un vrai compte MT5/mot de passe
  investisseur ni à Railway depuis cette session — le code est correct au meilleur de ce qui est
  vérifiable sans ça (signatures de `mt5linux` inspectées en installant le paquet localement,
  champs de deal vérifiés sur la doc MQL5 officielle), mais le déploiement réel (création des deux
  services Railway, variables d'environnement, premher signal réel) reste à faire et à valider par
  l'utilisateur. Risque connu à surveiller : Railway a déjà fait planter un service par manque de
  mémoire une fois (`calendar-bridge`, Playwright/Chrome relancé à froid 48x/jour) — un terminal
  Wine/MT5 qui reste connecté en continu a un profil de charge différent (un seul processus stable,
  pas de relances répétées), mais à vérifier en observant la conso mémoire réelle sur Railway avant
  de conclure que c'est stable.

## Changer de compte "Live" depuis le site, sans jamais toucher Railway (2026-09-27)

Suite directe : l'utilisateur a fait remarquer que devoir repasser par les variables Railway à
chaque changement de compte (phase 1 → phase 2 → financé → payout 1 → payout 2...) serait pénible -
demande explicite de piloter ça depuis le Dashboard. Contrainte réelle acceptée comme une feature,
pas une limitation : **un seul terminal MT5 = un seul compte connecté à la fois**, donc brancher un
nouveau compte Live remplace forcément l'ancien (ses données restent sur CHEST, juste plus
mises à jour) - exactement le comportement décrit par l'utilisateur pour les phases de challenge.

- **`site/dashboard.html`/`js/dashboard.js`** : le modal "Ajouter un compte" a maintenant un choix
  **Myfxbook / Compte Live** (`#addAccountModeToggle`, **caché entièrement si non-admin** - un seul
  terminal partagé, le changer affecte tout le monde). "Compte Live" demande login MT5 + mot de
  passe investisseur + serveur, puis réutilise l'écran broker/phase déjà existant (aucune
  duplication de cet écran). À la validation : génère l'id du futur compte AVANT tout appel réseau,
  appelle `POST /mt5/connect` avec cet id, et ne crée le compte côté Dashboard
  (`finalizeNewAccount(fields, presetId)`, `presetId` = nouveau 2e paramètre optionnel) **que si la
  connexion réussit** - jamais de compte "à moitié" créé si le mot de passe/serveur est faux.
- **`accounts-bridge/server.py`** : nouvelle table `mt5_live_state` (**UNE seule ligne, id=1** - un
  seul compte actif par nature, pas une table historique). `POST /mt5/connect` (admin) chiffre le
  mot de passe investisseur (`_encrypt_mt5_secret`/`_decrypt_mt5_secret`, `cryptography.fernet`,
  clé `MT5_CREDENTIALS_KEY` - même principe que `VAPID_PRIVATE_KEY`, jamais commitée) **après avoir
  confirmé que `mt5-notify-bridge` a bien basculé** (`MT5_NOTIFY_BRIDGE_URL`, POST
  `/switch-account`) - si le switch échoue, l'ancien état en base n'est jamais écrasé. `GET
  /mt5/status` (n'importe quel membre approuvé) renvoie quel compte Dashboard est actuellement
  connecté, jamais le mot de passe.
- **`mt5-notify-bridge/server.py`** : nouveau `POST /switch-account` (X-Internal-Secret) qui appelle
  `mt5.login(...)` **sur la connexion déjà établie** (`mt5.initialize()` ne se refait pas - c'est
  une reconnexion de COMPTE, pas de terminal). Coordination thread-safe entre la requête HTTP
  (thread Flask) et `poll_loop()` (thread de fond, seul à toucher l'objet `mt5` - RPyC/mt5linux
  n'est pas garanti thread-safe) via deux `threading.Event` (`switch_event`/`switch_done`) : la
  requête HTTP pose la demande et ATTEND (jusqu'à 25s) que `poll_loop()` l'exécute et publie le
  résultat, `switch_event.wait(timeout=POLL_SECONDS)` remplace le `time.sleep()` simple pour que
  `poll_loop()` réagisse immédiatement à une demande au lieu d'attendre la fin du cycle de sondage
  normal. Le suivi du dernier ticket notifié passe de "un seul fichier global" à "un par compte"
  (clé = login MT5) pour ne jamais renotifier un vieil historique si on revient sur un compte déjà
  vu.
- **Vérifié en écrivant un faux client MT5 en Python** (login qui réussit/échoue selon le mot de
  passe fourni, `account_info()`/`history_deals_get()` bidon) et en testant `/switch-account` par
  dessus (mauvais mot de passe → 502 propre, bon mot de passe → 200 + `accountInfo`, mauvais secret
  interne → 401, `/health` reflète le compte connecté) - **et en direct dans le navigateur** (compte
  admin de test, accounts-bridge local) : le toggle Myfxbook/Compte Live s'affiche bien uniquement
  admin, le formulaire Live s'enchaîne bien vers l'écran broker/phase, et surtout, sans
  `MT5_NOTIFY_BRIDGE_URL`/`MT5_CREDENTIALS_KEY` configurés localement, `POST /mt5/connect` échoue
  proprement (503, message clair, bouton réactivé, **aucun compte à moitié créé**) au lieu de
  planter - exactement le comportement voulu pour ce cas. **Le vrai test de bout en bout (connexion
  à un compte MT5 réel, bascule entre deux comptes) reste à faire une fois déployé.**
- **Pas fait dans cette passe (toujours vrai après la restructuration ci-dessous)** :
  alimenter automatiquement le Journal de trading (`journal-store.js`) à chaque clôture détectée -
  reporté volontairement : `chest_journal`/`chest_journal_ext` sont aujourd'hui des blobs JSON
  synchronisés en "dernier écrit gagne" (voir `/sync`, `accounts-bridge/server.py`) - un serveur qui
  ferait lecture-modification-écriture dessus en même temps qu'un navigateur ouvert créerait un vrai
  risque de perte d'écriture concurrente. À traiter séparément, probablement en réutilisant le motif
  déjà existant des comptes "live" du journal (`liveAccounts`/`extEntries`, tableau APPEND-ONLY par
  compte live - voir `journal-store.js`), pas en touchant le blob principal.

## Le Journal devient la source de vérité du compte Live, plus de famille pour ce chemin (2026-09-27)

Suite directe : l'utilisateur a demandé de simplifier encore - "on va oublier les familles, ça va
être les journaux qui sont directement à connecter". Avant : un Compte Live du Dashboard portait
lui-même son broker/sa phase (écran dupliqué de celui du Journal). Maintenant : une connexion Live
se rattache à un **compte du Journal** (`js/journal-store.js`, déjà riche - propfirm, modèle, phase,
règles vérifiées) plutôt qu'à une famille - le Journal sait "ce que ce compte trade", le Dashboard
n'est plus qu'un miroir qui l'affiche.

- **`site/dashboard.html`/`js/dashboard.js`** : le flux "Compte Live" est maintenant **Quel journal
  ? → (si propfirm) quelle phase ? → identifiants MT5 → connecter**, sans toucher aux familles/au
  broker-grid du Dashboard (ceux-ci restent utilisés tels quels par le chemin Myfxbook, inchangé).
  - `renderLiveJournalPicker()` liste `CHESTJournal.listAccounts()` (badge "🟢 connecté" sur celui
    qui a déjà un `mt5Live`), + bouton **"+ Nouveau compte du Journal"**.
  - **Créer un nouveau compte NE duplique PAS l'écran riche de `journal.html`** (propfirm/modèle/
    phase/règles vérifiées/tailles de compte) - le bouton y redirige (`journal.html?
    fromLiveConnect=1`, qui ouvre directement le formulaire de création plutôt que le hub), et
    `jaSave` (dans `journal.html`) détecte ce flag pour revenir sur `dashboard.html` avec le compte
    tout juste créé au lieu de rester sur le Journal - relai via deux clés localStorage
    (`chest_live_connect_resume`/`_account`), lues une fois au chargement du Dashboard
    (`resumeLiveConnectAfterJournalCreate()`) puis effacées immédiatement (consommées une seule
    fois, y compris en cas d'échec/annulation - jamais de résidu qui rouvrirait le modal au hasard
    plus tard).
  - **Suggestion de phase par défaut = la suivante** (`nextStageAfter()`, à partir de
    `CHESTJournal.stageList()`) mais **librement changeable vers n'importe quelle phase**, y compris
    une antérieure/potentiellement "cramée" (demande explicite : "va par défaut proposer celui
    d'après... mais ça le mettra par défaut vu que les infos seront en réel" - jamais de validation
    qui bloquerait un choix "illogique", l'utilisateur reste seul juge).
  - À la connexion réussie : `CHESTJournal.updateAccount(id, {mt5Live:{login,server}, stage})` (le
    Journal retient l'état) + un compte miroir dans `chest_accounts` tagué `journalAccountId` (pour
    que le Dashboard continue de s'afficher sans réécrire tout son moteur de rendu, qui reste
    entièrement basé sur `chest_accounts`/familles pour tout le reste).
  - **Piège de cache local rencontré en testant** : `dashboard.html` ne chargeait ni
    `js/journal-store.js` ni `js/propfirm-rules.js` (jamais utilisés par le Dashboard avant) -
    ajoutés juste avant `dashboard.js`, même ordre que `journal.html`. Un premier test après ajout a
    semblé encore échoué (libellé de phase générique "Phase 1" au lieu de "Challenge") à cause du
    cache agressif du serveur de dev local déjà documenté plus bas (section "Pièges déjà
    rencontrés") - un rechargement `?nocache=` de l'iframe a confirmé que le code était correct.
- **Vérifié en direct** (session de test locale) : création d'un compte Journal "FTMO Challenge"
  (1 étape) depuis le flux Live, retour automatique sur le Dashboard avec le bon compte préselectionné,
  suggestion de phase par défaut correcte ("Challenge" → suggère "Compte financé"), et sélection
  directe depuis la liste (sans passer par la création) - les deux chemins convergent bien vers le
  même écran d'identifiants. Échec de connexion (sans variables Railway configurées en local) géré
  proprement : aucun compte à moitié créé, le compte Journal n'est jamais modifié tant que le
  serveur n'a pas confirmé la connexion.

## Le Journal fait maintenant office de famille (superpose les phases automatiquement) (2026-09-27)

Suite directe, le jour même : "on peut enlever les familles [du Dashboard] et remplacer par
justement un journal. C'est le journal qui fait office de famille et qui va enregistrer et
superposer les informations des trades de chaque compte." Le mécanisme de "famille" existant
(`chest_account_families` - vue "Tout" = somme réelle des comptes membres, code déjà là et déjà
fiable, `buildFamilyAggregate`/`buildFamilyDailyHistory`) n'a **pas été réécrit** - il est
maintenant **piloté automatiquement par le compte du Journal**, plus jamais créé/nommé à la main
pour ce chemin.

- **`findOrCreateJournalFamily(journalAcc)`** (`js/dashboard.js`) : retrouve (par
  `family.journalAccountId`) ou crée une famille nommée d'après le compte du Journal. **Chaque
  connexion Live sur ce même compte du Journal (nouvelle phase) AJOUTE un nouveau compte miroir
  dans la MEME famille** - jamais de remplacement, l'historique de chaque phase reste individuellement
  consultable ET sommé dans la vue "Tout" de la famille. Le nom du compte miroir reprend le nom du
  Journal + le libellé de la phase (ex. "FTMO Test · Compte financé") pour les distinguer dans la
  liste des membres.
- **`ACTIVE_KEY` pointe sur l'id de la FAMILLE**, pas du compte miroir individuel, dès la toute
  première connexion (même avec un seul membre) - évite une transition brutale d'affichage
  "compte seul" → "famille" quand une 2e phase s'ajoute plus tard ; le rendu est identique dès le
  départ.
- **Entrée du Dashboard simplifiée** : le bouton de l'état vide n'ouvre plus "Créer une famille"
  d'abord (`openFamilyPrompt()`) mais directement "Ajouter un compte" (`openAddAccountModal(null)`)
  - texte de la carte mis à jour en conséquence ("Ajoute ton premier compte" / "Myfxbook, ou Compte
  Live rattaché à un compte du Journal..."). Le chemin Myfxbook reste inchangé par ailleurs (compte
  seul par défaut, regroupable à la main via le switcher comme avant si l'utilisateur le souhaite) -
  seul le chemin Live/Journal gère sa "famille" tout seul.
- **Vérifié en direct** (fetch mocké pour simuler une vraie connexion réussie, accounts-bridge/
  mt5-notify-bridge non déployés localement) : 1ère connexion Live → famille créée avec 1 membre,
  balance/equity affichées correctement (vue famille dès le départ, "#1 compte"). 2e connexion Live
  sur le MEME compte du Journal (nouveau login MT5, simulant une phase 2) → **même famille**, 2e
  membre ajouté ("#2 comptes"), balance/equity **sommées automatiquement** (50 000$+100 000$ =
  150 000$ affichés) - confirme que "superposer les informations de chaque compte" fonctionne
  exactement comme voulu, sans aucun code d'agrégation nouveau à écrire.

## Vraie course entre créer un compte du Journal et changer de page (2026-09-27)

**Bug réel en production, signalé par l'utilisateur avec capture d'écran** ("Compte du Journal
introuvable — recommence.") : créer un compte via "+ Nouveau compte du Journal" depuis le Dashboard
fonctionnait, la reprise automatique retrouvait bien le compte (l'écran affichait "Connexion pour :
Test", identifiants remplis) - mais cliquer "Connecter" quelques secondes plus tard échouait, le
compte ayant disparu entre-temps.

- **Cause racine** : `js/sync-store.js` pousse chaque écriture vers le serveur avec un debounce de
  600ms (`setTimeout(flush, 600)`), en "fire and forget" (jamais attendu). `journal.html` (jaSave)
  crée le compte puis change IMMÉDIATEMENT de page (`window.location.href = 'dashboard.html'`) pour
  revenir finir la connexion Live - largement avant que les 600ms ne s'écoulent. Le `pagehide` prévu
  pour ce cas déclenche bien un `flush()` à la fermeture, mais un `fetch()` lancé au moment où la
  page se décharge n'est **pas garanti d'aboutir** (le navigateur peut l'annuler en cours de
  navigation - c'est précisément le problème que `navigator.sendBeacon` existe pour résoudre,
  jamais utilisé ici). Le compte du Journal restait donc SEULEMENT local, jamais poussé. Quand
  `dashboard.html` se charge derrière, son propre `pullSync()` récupère la version du serveur
  (encore ancienne, sans le nouveau compte) et - comme `/sync` fonctionne en "dernier pull gagne"
  sans aucune fusion ni horodatage - **écrase la copie locale flambant neuve avec l'ancienne**. Le
  compte tout juste créé disparaît purement et simplement avant que l'utilisateur n'ait fini de
  remplir les identifiants MT5.
- **Corrigé** : `flush()` retourne maintenant sa promesse, et une nouvelle API minimale
  `window.CHESTSync.flushNow()` (attend l'envoi immédiat, sans le debounce) est exposée. `jaSave`
  (`journal.html`) fait `await window.CHESTSync.flushNow()` **avant** tout changement de page après
  une création - sur les DEUX chemins de redirection (retour au Dashboard, et le rechargement normal
  de `journal.html?acc=...`), le second ayant le même risque de course avec son propre `pullSync()`.
- **Limite connue, acceptée** : ceci ferme la fenêtre de course pour CE cas précis (créer puis
  changer de page tout de suite après) ; le mécanisme `/sync` reste globalement "dernier pull gagne"
  sans fusion - un vrai correctif général demanderait un horodatage par clé comparé des deux côtés,
  hors scope de ce correctif ciblé.
- **Vérifié en direct** : `window.CHESTSync.flushNow` bien exposé et de type `function` ; séquence
  réseau confirmée (`POST /sync` du compte créé complété AVANT le `GET /sync` de la page suivante) -
  impossible de reproduire la vraie condition de course en local (serveur de dev quasi instantané,
  contrairement à Railway en production, ce qui explique pourquoi ça ne s'est jamais vu en test
  local alors que ça arrivait de façon fiable en production).

## `mt5-notify-bridge` : RPyC direct, jamais `mt5linux.MetaTrader5` (2026-09-27)

**Incident critique en production, logs Railway fournis par l'utilisateur** : `mt5-notify-bridge`
crash-bouclait dès le démarrage - `RuntimeError: No container runtime available. engine='auto' but
neither docker nor udocker is installed.` En lisant le code source réel du paquet `mt5linux`
(`ContainerManager.__init__` → `create_runtime(engine)` → lève systématiquement si ni Docker ni
udocker n'est installé LOCALEMENT) : la classe `mt5linux.MetaTrader5` n'est PAS conçue pour une
architecture à deux services séparés comme celle-ci - même en "mode connexion manuelle" documenté
dans son propre README (`MetaTrader5(host="localhost", port=18812)`), son constructeur exige
INCONDITIONNELLEMENT un runtime de conteneur local, y compris pour simplement se connecter à un
serveur RPyC déjà lancé ailleurs (`start_container()` cherche un conteneur Docker LOCAL par port -
jamais juste "se connecter à cette adresse réseau").

- **Corrigé** : `mt5-notify-bridge/server.py` n'importe plus `mt5linux` du tout - `DirectMT5Client`
  (classe définie dans `server.py`) se connecte en RPyC brut (`import rpyc`,
  `rpyc.classic.connect(host, port)`) directement au serveur RPyC "classic" que `mt5-terminal` fait
  déjà tourner (confirmé dans ses propres logs : `SLAVE/18812[MainThread]: server started`) -
  exactement le même mécanisme que `mt5linux` utilise en interne UNE FOIS connecté
  (`conn.execute()`/`conn.eval()` sur du code Python construit en chaîne), simplement sans la
  couche de gestion de conteneur, superflue ici. `requirements.txt` : `mt5linux` remplacé par
  `rpyc>=6.0.0,<7` (la dépendance réellement utilisée, `mt5linux` la tirait déjà en transitif).
- **Échappement des valeurs interpolées** : chaque appel construit son code à distance avec `!r`
  (repr) sur les chaînes (`f"mt5.login({int(login)}, password={password!r}, server={server!r})"`)
  plutôt qu'un f-string qui concaténerait la valeur brute - sans ça, un mot de passe contenant un
  guillemet casserait la chaîne littérale et injecterait du code arbitraire dans le processus Wine
  distant. Jamais un souci en pratique tant que seul l'admin fournit ces valeurs, mais correct par
  construction plutôt que par confiance.
- **Vérifié contre un VRAI serveur RPyC classic local** (pas un mock - `rpyc.utils.server.
  ThreadedServer(rpyc.SlaveService)`, avec un faux module MetaTrader5 important comme un vrai
  fichier Python pour que le pickling des namedtuples fonctionne correctement) : connexion, login
  qui échoue/réussit, `last_error()`, `account_info()`, `history_deals_get()` - et spécifiquement un
  mot de passe contenant guillemets ET antislash (`go"od'pa\ss`) pour confirmer l'échappement
  `!r`. Tout fonctionne. Le vrai test contre le vrai `mt5-terminal` (vrai Wine/MT5) reste à faire
  au prochain déploiement.

## `mt5.initialize()` échoue avec `(-10005, 'IPC timeout')` — chemin explicite requis (2026-09-27)

**Après le fix RPyC ci-dessus, nouveau problème distinct** (confirmé par logs Railway des deux
services) : la connexion RPyC vers `mt5-terminal` réussit bien à chaque tentative (logs
`mt5-terminal` : `SLAVE/18812... accepted... welcome` répété toutes les ~15s), mais `mt5.initialize()`
échoue systématiquement, en boucle pendant plusieurs minutes (pas un simple souci de timing au
démarrage) : `RuntimeError: mt5.initialize() a échoué : (-10005, 'IPC timeout')`, ce qui fait
timeout `POST /switch-account` côté site (504 après 25s).

- **Cause** : `mt5.initialize()` appelé SANS argument fait une auto-détection du terminal installé
  (registre Windows) — ça ne marche pas de façon fiable sous Wine, dont l'émulation de registre pour
  une installation silencieuse (`/auto`) ne remplit pas forcément les clés que l'auto-détection
  attend. Confirmé en lisant le vrai Dockerfile amont du paquet `mt5linux`
  (`lucas-campagna/mt5linux`, `docker/Dockerfile`) : le terminal est installé via
  `wine64 mt5setup.exe /auto /path:"C:/MT5"`, donc `terminal64.exe` vit à un chemin connu et fixe :
  `C:\MT5\terminal64.exe`.
- **Corrigé** : `DirectMT5Client.initialize()` accepte maintenant un `path` optionnel
  (`mt5.initialize(path=...)`, avec `!r` pour échapper correctement les antislashs Windows du
  chemin — même principe que l'échappement déjà en place pour `login()`/`history_deals_get()`).
  `poll_loop()` passe désormais `MT5_TERMINAL_PATH` (nouvelle variable d'env, défaut
  `C:\MT5\terminal64.exe` — à ne changer QUE si `mt5-terminal` passe un jour à une autre image que
  `lprett/mt5linux`).
- **Confirmé faux au déploiement suivant** : le chemin explicite n'a rien changé, même erreur en
  boucle. Cause réelle trouvée (recherche web, forum MQL5 + retours d'autres utilisateurs de
  `mt5linux`) : **un terminal MT5 sans aucun compte configuré reste bloqué sur SA PROPRE fenêtre
  modale** (connexion / création de compte démo), et une fenêtre modale ouverte empêche
  `mt5.initialize()` de répondre, quel que soit le délai ou le chemin passé — ce n'est pas un
  problème de chemin ni de timing Wine, c'est le terminal qui n'est simplement jamais dans un état
  "prêt". Voir la section suivante pour le vrai fix.

## `MT5_LOGIN`/`MT5_PASSWORD`/`MT5_SERVER` sur `mt5-terminal` sont en fait REQUIS (2026-09-27)

**Correction d'une affirmation antérieure de ce fichier** : la section "Le Journal devient la source
de vérité du compte Live" (et le README de `mt5-terminal`) affirmaient que ces trois variables
"ne sont PLUS nécessaires" puisque le choix du compte se fait maintenant dynamiquement depuis le
site. C'est faux pour la toute première connexion du terminal : `mt5.initialize()` ne peut PAS
réussir sur un terminal totalement vierge (voir ci-dessus, fenêtre modale bloquante) — il faut un
compte **"bootstrap"** déjà configuré au démarrage du conteneur, n'importe lequel, y compris un
compte démo gratuit (MetaQuotes-Demo), juste pour que le terminal sorte de son état bloqué.

- Une fois `initialize()` réussi avec ce compte bootstrap, le reste du mécanisme (`mt5.login()` sur
  la connexion déjà établie, piloté par `POST /switch-account` depuis le site) reste inchangé et
  correct — seule la toute première étape (sortir le terminal de son état vierge) nécessitait ce
  correctif.
- **Action utilisateur requise** : fournir un login/mot de passe (investisseur suffit)/serveur d'un
  compte MT5 quelconque (démo ou réel, peu importe lequel) à définir comme `MT5_LOGIN`/
  `MT5_PASSWORD`/`MT5_SERVER` sur le service Railway `mt5-terminal`. Voir
  `mt5-terminal/README.md` pour le détail.
- **Pas encore vérifié contre le vrai déploiement Railway** (l'hypothèse s'appuie sur un retour
  d'expérience externe, pas encore reproduite dans CE projet précis) — à confirmer une fois ces
  variables définies et le service redéployé.

## Vrai bug trouvé : busy-loop dans `poll_loop()` si un switch arrive pendant que le terminal n'est pas prêt (2026-09-27)

**Logs Railway fournis par l'utilisateur juste après avoir défini les 3 variables ci-dessus** :
`mt5-notify-bridge` spam des centaines de `mt5.connect()`/`ConnectionRefusedError` en ~1 seconde,
Railway coupe avec `rate limit reached... Messages dropped: 301`. Pas un souci d'IPC cette fois :
un vrai bug de boucle.

- **Cause** : dans `poll_loop()`, si `mt5.connect()`/`mt5.initialize()` échoue, le code fait
  `raise RuntimeError(...)` **avant** d'atteindre le bloc `if switch_event.is_set(): ...
  switch_event.clear()`. Si `/switch-account` a déjà appelé `switch_event.set()` pendant que le
  terminal n'est pas prêt (exactement le cas ici), cet event reste "set" pour toujours -
  `switch_event.wait(timeout=POLL_SECONDS)` en fin de boucle se réveille alors INSTANTANÉMENT à
  chaque tour au lieu d'attendre 15s, transformant la boucle en busy-loop. Effet double : (1) le
  flood de logs/rate-limit observé, (2) `/switch-account` reste bloqué les 25s complètes pour rien
  (`switch_done` jamais mis), d'où le message "n'a pas répondu à temps" côté site alors que le vrai
  problème est ailleurs.
- **Corrigé** : dans le bloc `except`, si un switch est en attente (`switch_event.is_set()`), on le
  résout immédiatement en échec (`switch_result = {"ok": False, "error": ...}`,
  `switch_event.clear()`, `switch_done.set()`) au lieu de le laisser bloqué - l'appelant récupère
  une vraie erreur immédiatement plutôt qu'un timeout générique de 25s, et le busy-loop disparaît.
- **Indépendant du fix bootstrap-account ci-dessus** : ce bug de boucle aurait recréé le même flood
  à chaque fois qu'un switch arrive alors que le terminal n'est pas prêt, même après avoir réglé la
  cause IPC - les deux corrections sont nécessaires. Pas encore reconfirmé avec des logs propres
  après ce fix (à faire au prochain redéploiement).

## Leçon d'outillage : `ast.parse()` NE détecte PAS toutes les `SyntaxError` (2026-09-27)

**Incident** : le fix du busy-loop ci-dessus a été poussé avec une vraie erreur - une 2e ligne
`global switch_result` plus bas dans `poll_loop()`, après un premier usage de cette variable sans
`global` déjà en vigueur plus haut dans la fonction, ce qui est en réalité une `SyntaxError: name
'switch_result' is assigned to before global declaration`. `mt5-notify-bridge` crash-bouclait dès
le démarrage (confirmé par les logs Railway). **Mais `python3 -c "import ast;
ast.parse(open(...).read())"` - la méthode de vérification utilisée systématiquement tout au long
de cette session - ne l'a PAS détectée** : reproduit en local, `ast.parse()` construit l'arbre
syntaxique sans erreur, alors que cette classe d'erreur (ordre `global`/assignation) n'est vérifiée
que par le compilateur (`compile()`/`py_compile`), une passe plus tardive que le simple parsing.

- **Corrigé dans le code** : un seul `global switch_result` en tête de `poll_loop()` (couvre toute
  la fonction, pas besoin de le redéclarer dans chaque bloc interne).
- **Corrigé dans la méthode** : remplacer désormais `ast.parse()` par `python3 -m py_compile
  fichier.py` (ou `compile(source, filename, 'exec')`) pour vérifier un fichier Python avant de le
  pousser - seule cette dernière méthode exécute réellement la passe de résolution de portée qui
  attrape ce genre d'erreur.

## Deux conventions de noms de variables différentes dans le script upstream `mt5linux` (2026-09-27)

**L'utilisateur a bien réglé `MT5_LOGIN`/`MT5_PASSWORD`/`MT5_SERVER` sur Railway (confirmé par
capture d'écran), pourtant les logs continuent d'afficher `LOGIN: not set` / `SERVER: not set`.**
Lu directement le vrai code source de `lucas-campagna/mt5linux` (`docker/src/*.sh`, récupéré via
`curl` - PAS via un résumé WebFetch, qui avait donné des réponses imprécises/tronquées sur ce
fichier) pour comprendre :

- Ce message de log est un **faux problème, bug d'affichage du script upstream lui-même** :
  `main.sh` imprime ce diagnostic avec `${LOGIN:-not set}`/`${SERVER:-not set}` - des noms de
  variables SANS le préfixe `MT5_`, jamais ceux qu'on définit. Il affiche "not set" même quand tout
  fonctionne correctement. Ne pas s'y fier.
- Le VRAI mécanisme d'autologin (`config.sh`, `apply_mt5_config()`) lit bien `MT5_LOGIN`/
  `MT5_SERVER`/`MT5_PASSWORD` (avec préfixe, exactement ce que l'utilisateur a réglé) et écrit ça
  dans `common.ini` - gated par `FIRST_RUN` (vrai sur ce projet : pas de volume Railway attaché à
  `mt5-terminal`, donc `/opt/websockify` n'existe jamais au boot, `FIRST_RUN=1` à chaque démarrage).
  Le log `MT5 config applied` (déjà vu dans les logs Railway) confirme que cette fonction s'exécute
  bien jusqu'au bout.
- **Mais il existe un SECOND mécanisme, séparé, avec une TROISIÈME variable** : `mt5.sh`
  (`wait_for_mt5_and_type_server()`) et `automation.sh` lisent une variable `SERVER` (SANS préfixe,
  différente de `MT5_SERVER`) pour déclencher une automation `xdotool` qui tape le nom du serveur
  dans la fenêtre "rechercher un serveur" du terminal MT5 - nécessaire uniquement si ce serveur
  n'est pas déjà dans la liste intégrée de MT5 (un `MetaQuotes-Demo` n'en a pas besoin, un serveur
  démo d'un vrai broker si, potentiellement).
- **Action demandée à l'utilisateur** : ajouter une variable `SERVER` (sans préfixe) sur
  `mt5-terminal`, même valeur que `MT5_SERVER`, en plus des 3 déjà réglées. Pas encore confirmé si
  ça résout l'IPC timeout - hypothèse la plus concrète à ce stade, mais l'automation `xdotool`
  elle-même est fragile (coordonnées d'écran fixes, dépend du timing/focus des fenêtres) et pourrait
  ne pas suffire. Si ça ne suffit pas, la suite logique serait d'inspecter visuellement la console
  noVNC du conteneur (port 8080, actuellement non exposé publiquement par choix de sécurité - voir
  `mt5-terminal/README.md`) pour voir ce qui bloque réellement à l'écran.

## `mt5.initialize()` toujours bloqué même avec `SERVER` + login manuel via Console (2026-09-27/28)

Après avoir ajouté `SERVER`, `mt5.initialize()` échouait encore. Diagnostic poussé via la Console
Railway (pas de noVNC nécessaire, tout en ligne de commande - `ps aux`, `xdotool` avec `DISPLAY=:0`
exporté manuellement, `iconv` pour lire `common.ini` en UTF-16LE) :
- Le fichier `common.ini` contenait bien les vrais identifiants (`Login=26174924`,
  `Server=VantageMarkets-Demo`, `Password=...`) - donc les variables d'env Railway arrivent
  correctement au conteneur, ce n'était pas le problème.
- Une seule fenêtre `terminal64.exe` visible, titre générique "MetaTrader 5 - Netting - EURUSD,H1"
  (pas de compte/broker affiché) - le login auto n'aboutit pas.
- Tentative de lancer `wine64 C:/MT5/terminal64.exe ...` À LA MAIN depuis la Console (au premier
  plan, pas en arrière-plan comme le script) : **aucune réponse, et `ps aux` ne montre ensuite AUCUN
  process wine/terminal64 nulle part** - signal fort que Wine lui-même est bloqué/cassé dans ce
  conteneur d'une façon qu'on ne peut plus diagnostiquer sans regarder l'écran (noVNC).
- **Décision utilisateur (2026-09-28)** : plutôt que d'exposer noVNC ou de repartir de zéro sur le
  service, on met ce diagnostic en pause et on explore une architecture différente (voir section
  suivante) après une piste suggérée par un contact externe (créateur de Futurizq).

## Piste explorée puis écartée : reproduire le protocole MT5 nous-mêmes (2026-09-28)

Le créateur de Futurizq affirme avoir contourné les services payants (type MetaApi.cloud) en codant
lui-même, en Python, un client qui parle DIRECTEMENT au serveur du broker - sans jamais lancer de
vrai terminal MT5 - et confirme avoir fait du **reverse engineering** du protocole. Il ne partage
pas son code.

Recherche effectuée avant de décider (voir historique de conversation pour le détail complet) :
- MetaQuotes documente eux-mêmes que la connexion terminal↔serveur utilise RSA (échange de clé) +
  AES-256 (session) - un vrai protocole chiffré propriétaire, pas quelque chose qu'on peut décoder
  en analysant du trafic réseau : il faudrait décompiler le binaire Windows du terminal pour en
  extraire la logique de chiffrement. Travail de reverse engineer chevronné sur plusieurs
  semaines/mois, pas quelques sessions de travail.
- FIX API (alternative "officielle" standard) : écarté, les brokers qui l'ouvrent demandent
  généralement 50 000-100 000$ de dépôt minimum.
- Réduire à UN SEUL compte (au lieu de gérer une flotte comme Futurizq) ne réduit PAS la difficulté
  du cœur du problème (décoder le handshake RSA/AES) - cette difficulté est constante quel que soit
  le nombre de comptes visés. Seule la complexité d'échelle (pooling, multi-tenant) disparaît, une
  fraction mineure du travail total.
- **Décision : ne pas poursuivre cette piste.** Trop de travail/risque pour un gain incertain, alors
  qu'une alternative plus simple existe (section suivante).

## Piste retenue : Expert Advisor MQL5 natif au lieu du sondage RPyC externe (2026-09-28, "Plan EA")

En creusant les alternatives légitimes (pas de reverse engineering), trouvé : les **Expert Advisors
(EA)** MQL5 sont une fonctionnalité 100% officielle et documentée - un script qui tourne DANS le
vrai terminal MT5, avec accès natif à l'historique des trades (`HistoryDealGet*`) et capable de
faire des appels HTTP sortants (`WebRequest()`) vers un serveur externe. Zéro reverse engineering.

**Ce que ça change concrètement** :
- `mt5-notify-bridge` ne sonde PLUS l'historique des deals via RPyC toutes les 15s - toute cette
  logique (`check_new_deals`, `format_close_message`, `mt5_last_deal.json`) a été RETIRÉE de
  `server.py` (2026-09-28). Il ne garde que son rôle de changement de compte (`/switch-account`,
  `mt5.login()` sur la connexion RPyC déjà établie).
- Nouveau fichier `mt5-terminal/CHESTNotifier.mq5` : sur `OnTradeTransaction()` (événement natif,
  pas un sondage), détecte une clôture (`DEAL_ENTRY_OUT`/`DEAL_ENTRY_OUT_BY`) et POST en JSON vers
  `accounts-bridge` (`POST /mt5/ea-notify`, nouveau, secret dédié `MT5_EA_SECRET` - PAS
  `INTERNAL_PUSH_SECRET`, frontière de confiance plus faible puisque ce secret vit en clair dans un
  fichier à l'intérieur du terminal Wine). Formatage du message (TP/SL/Stop Out/manuelle, P&L =
  profit+commission+swap) porté côté Python dans `accounts-bridge/server.py`
  (`_format_mt5_close_message`), dédup par ticket dans une nouvelle table SQLite
  `mt5_ea_last_ticket` (login → dernier ticket notifié).
- **Ça ne résout PAS le blocage `mt5.initialize()`/Wine ci-dessus** - ça change seulement comment on
  détecte/notifie les clôtures UNE FOIS qu'un compte est réellement connecté. Le login au démarrage
  reste un prérequis non résolu.
- Installation de l'EA documentée dans `mt5-terminal/README.md` : copie du fichier + compilation
  headless via la Console Railway (`wine64 metaeditor64.exe /compile:...`, fonctionnalité officielle
  MetaEditor) - **pas encore testé en conditions réelles** (bloqué par le login). Attacher l'EA à un
  graphique et autoriser son URL dans les options WebRequest restent potentiellement des étapes GUI
  (noVNC) à défaut de trouver l'équivalent en fichier de config (`[StartUp]` dans l'ini - piste à
  vérifier, non confirmée).

## Plan B — mis de côté par l'utilisateur, à ressortir si le Plan EA échoue ou ne convient pas (2026-09-28)

Idée de repli donnée explicitement par l'utilisateur, à conserver textuellement pour ne pas la
perdre : si le Plan EA ne couvre pas suffisamment le temps réel, a trop de décalage, ou a des
contraintes de connexion trop lourdes, construire un système **synthétique** à la place :
- Un script enregistre les points clés d'une position à son ouverture (TP, SL, BE - breakeven, PE -
  prix d'entrée, etc.).
- Il associe ces points au prix en direct via l'API déjà utilisée pour les scanners (celle qui
  fournit déjà les prix de graphique ailleurs sur le site).
- Calcul naturel du P&L flottant approximatif en cours de route : lot × écart entre prix d'entrée et
  prix actuel (issu de cette API), mis à jour en continu - une approximation du solde flottant sans
  jamais interroger MT5 directement.
- À la clôture réelle de la position, ce prix "en cours" est remplacé par le VRAI gain réalisé,
  récupéré via une connexion Myfxbook (déjà utilisée ailleurs dans le projet, voir
  `js/myfxbook-store.js`) - donc jamais de données fictives présentées comme définitives, seulement
  en approximation temporaire tant que la position est ouverte.
- Avantage : combine un système "temps réel" (approximatif, basé sur les prix qu'on a déjà) avec un
  système de données déjà fiable et existant (Myfxbook) - présente une expérience fluide sans
  dépendre de la fragilité du terminal MT5/Wine pour le suivi en direct.

**Rappeler cette section à l'utilisateur si le Plan EA échoue ou ne le satisfait pas** - c'est
explicitement la consigne donnée.

## Corrections post-premier-déploiement (2026-09-24)

Retours utilisateur groupés après le tout premier déploiement réel (Vercel + Railway) — voir aussi
les sections « Connexion fusionnée dans app.html » et « Sécurisation du vrai code Pine » plus haut
pour ce qui a été trouvé/corrigé le jour précédent (même vague de durcissement).

- **Bouton admin visible par tout le monde + compte bloqué toujours utilisable + thème clair sur
  Welcome** : voir le commit dédié — même piège `[hidden]` vs `display:flex` déjà documenté sur
  `.wel-edit__check`, retrouvé sur `.chest-topbar__btn`/`.settings-row` ; `guard()` ne vérifiait
  jamais la validité RÉELLE d'un jeton auprès du serveur (seulement sa présence locale), corrigé par
  une vérification `/me` périodique dans `accounts-auth.js`.
- **Jargon technique retiré des messages visibles** (demande explicite : jamais le mot "API", jamais
  un nom de script, jamais un message d'exception brut) : `scanner-chart.js`/`berich-chart.js`
  (« Scanner en attente — réessaie dans un instant. »), `myfxbook-store.js` (« Connexion échouée,
  veuillez réessayer dans un instant. »), `calendar.js` (« Calendrier en attente... », finie la
  mention de `fetch_calendar.py`), badge « Exemple — données de démonstration » du Dashboard retiré
  (devenu un mort-vivant depuis que `DEFAULT_ACCOUNTS=[]`, voir plus haut).
- **Dashboard restructuré « famille d'abord »** : `#dashEmptyAddBtn` (premier lancement) ouvre
  maintenant `openFamilyPrompt()` au lieu de `openAddAccountModal()` directement ;
  `createFamilyFromModal()` enchaîne aussitôt sur l'ajout d'un compte DANS la famille tout juste
  créée (`openAddAccountModal(fam.id)`). Le switcher de comptes (une fois au moins une famille/un
  compte existant) forçait déjà ce chemin — seul le tout premier lancement le contournait.
- **Suppression d'un compte ou d'une famille** : bouton ⋮ par ligne du switcher (`.acc-tools`,
  même mécanique de survol que `.acc-menu__family-hover`), un seul choix « Supprimer » (rouge),
  confirmation `CHESTConfirm()`. Supprimer une famille NE supprime PAS ses comptes membres (ils
  redeviennent des comptes seuls) — choix délibérément moins destructeur.
- **Thème clair : retouche ciblée choisie (2026-09-24), pas une vraie palette claire dédiée.**
  L'utilisateur a tranché entre "retouche ciblée (rapide)" et "vraie palette claire (gros chantier)"
  → retouche ciblée. Voir la section « Retouches ciblées » de `patch-chest-da.css` (juste après les
  règles Welcome) : `.chest-grad-text` (dégradé blanc→orange invisible en clair, refait en encre→
  orange) et `.chest-spot__layer` (lueur rose du Dashboard, devenait un lavis voyant en clair,
  masquée). Backtesting et Calendrier vérifiés en clair au passage, déjà corrects. **Si un autre
  élément "rend mal" en clair est signalé plus tard** : même traitement ponctuel dans cette même
  section, pas une refonte — l'utilisateur a explicitement choisi la portée limitée.

## Autres décisions techniques notables

- **Pont MT5** (`mt5-bridge/export_mt5.py`) : script Python local (pip `MetaTrader5`) qui lit le terminal MT5 ouvert et écrit `site/data/data.json` ; `dashboard.js` le consomme s'il existe, sinon retombe silencieusement sur les comptes d'exemple. **Jamais exécuté/vérifié** faute d'accès à un vrai terminal MT5 depuis cette session — à tester par l'utilisateur.
- **Déploiement** : tout le site reste **100% local** pour l'instant (décision explicite de l'utilisateur), seul le calendrier tourne sur Railway. Le déploiement public complet est repoussé après une passe de design/DA à venir — ne pas relancer ce chantier sans que l'utilisateur le redemande explicitement.
- **Pas de clé API leakée** : une ancienne clé Financial Modeling Prep orpheline a été retirée de `js/config.js` — ne jamais recommiter de secret dans ce fichier.
- **`config.js` versionné (`?v=1`, 2026-09-23)** : jusqu'ici chargé sans version (`<script src="js/config.js">`) sur les 16 pages — un changement d'URL Railway restait invisible pour un navigateur qui avait déjà mis le fichier en cache (constaté en direct : après avoir reconfiguré `calendarApiUrl`, une page déjà ouverte continuait d'appeler l'ancienne URL, supprimée, et affichait "en attente de données"). Même règle que `chest-da.css?v=N` : **incrémenter `?v=` sur les 16 `<script src="js/config.js?v=N">` à chaque modification de ce fichier** (pas seulement un rechargement forcé ponctuel, qui ne règle que le poste qui vient d'être testé).

## Goûts et méthode de travail de l'utilisateur

- Esthétique par défaut recherchée : **indie premium**, pas corporate/générique — références Vanta Supply, alike.page (voir le `CLAUDE.md` racine pour le détail complet). Bannir explicitement le combo Space Grotesk+Syne et le cliché "dashboard sombre + grille de fond + KPI cards à liseré coloré" — devenu un tell instantané d'IA.
- Préfère un **retour direct et itératif** : donne des captures d'écran annotées à la main, corrige rapidement si l'implémentation dévie de sa vision, apprécie qu'on exécute directement sur un feedback déjà très détaillé plutôt que de repasser systématiquement en mode plan.
- Exige de la **donnée réelle vérifiée** plutôt que de la donnée plausible : chaque source externe (API, scraping) a été testée en direct (curl/fetch) avant d'être branchée, jamais supposée fonctionner.
- Veut que toute estimation/heuristique soit **explicitement labellisée comme telle**, jamais présentée comme une vraie prédiction.
- Style de communication : français, direct, parfois elliptique — ne pas hésiter à interpréter intelligemment une demande courte à la lumière du contexte déjà posé, mais confirmer par un test visible plutôt que de juste affirmer que "ça marche".

## Pièges déjà rencontrés (pour ne pas les refaire)

- Emoji drapeaux → texte brut sur Windows : toujours utiliser flag-icons (SVG), jamais d'emoji régional pour un pays. Idem pour les cryptos : utiliser les vrais logos CoinGecko (`image` dans `/coins/markets`), pas d'emoji symbole.
- Regex Unicode sur les diacritiques dans l'outil d'édition → a cassé un `Edit` (comparaison silencieusement identique). Préférer une table de correspondance explicite.
- Un backtest importé via `<input type=file>` ne peut pas être testé par automatisation de navigateur (restriction navigateur réelle) — pour tester, construire un `Blob` synthétique depuis un fichier généré par `openpyxl` et appeler `parseXlsxFile()` directement, ou dispatcher un événement `drop` synthétique avec un vrai `DataTransfer`.
- Screenshot automatisé qui rend en noir après un scroll sur une page avec hero plein écran (`calendar.html`, `backtest-view.html`) : bug de l'outil de test, pas du site — vérifier via `get_page_text`/`getComputedStyle`/`elementFromPoint` plutôt que via capture d'écran dans ce cas précis.
- Cache navigateur agressif sur le serveur de dev local (`python -m http.server`, pas d'en-têtes no-cache) : si un fichier édité ne semble pas se refléter après un rechargement, ajouter un `?nocache=N` à l'URL avant de conclure que l'édition est fausse.
- Railway + Playwright : conteneur à ressources limitées → toujours `--disable-dev-shm-usage`/`--disable-gpu`, fermer le navigateur dans un `finally`, et attendre explicitement (`wait_for_selector`, pas juste un `click` avec timeout court) les éléments chargés de façon asynchrone (bannière OneTrust notamment).

## Pour aller plus loin

L'historique chronologique complet (chaque itération, chaque bug, chaque décision avec sa justification exacte) vit dans la mémoire Claude de la machine d'origine (`project_chest.md`) et ne voyage pas avec ce dossier. Ce fichier-ci en est la synthèse actionnable — si un détail précis manque pour une décision passée, le comportement du code lui-même (commentaires inline, notamment dans `fetch_calendar.py`, `calendar.js`, `backtest-engine.js`) est la source de vérité la plus fiable après ce document.
