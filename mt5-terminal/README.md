# CHEST · mt5-terminal

Service Railway séparé : un vrai terminal **MetaTrader 5** tournant sous Wine dans un conteneur
Linux (image [`lprett/mt5linux`](https://github.com/lucas-campagna/mt5linux), publiée depuis le
projet open-source `mt5linux` — pas un service géré/tiers payant comme MetaApi.cloud, juste notre
propre conteneur sur l'infra Railway déjà utilisée par les autres services de ce monorepo).

Ce service expose l'API du terminal (RPyC, port `18812`) au service `mt5-notify-bridge` via le
réseau privé Railway, qui l'utilise pour **changer de compte connecté** depuis le site (voir
`../mt5-notify-bridge/README.md`). **Les notifications de clôture, elles, sont envoyées directement
par un Expert Advisor qui tourne DANS ce terminal** (`CHESTNotifier.mq5`, voir plus bas) - pas par un
sondage externe (changement d'architecture 2026-09-28, voir CLAUDE.md "Plan EA").

**Ne pas confondre avec `mt5-bridge/` (racine du dépôt)** : script LOCAL préexistant, sans rapport,
que l'utilisateur lance sur sa propre machine pour exporter son compte MT5 vers le Dashboard — voir
son propre README pour ce qu'il fait. Noms volontairement différents pour ne jamais les mélanger.

## Pourquoi ce choix plutôt qu'un service payant (MetaApi.cloud etc.)

Alternative envisagée puis écartée (2026-09-27, demande explicite utilisateur d'être économe) :
MetaApi.cloud fait la même chose (connexion en lecture seule à un compte MT5 via le mot de passe
investisseur) mais facture ~10-12 $/mois **par compte connecté**. `mt5linux` fait tourner
littéralement le même terminal MT5 nous-mêmes, sur l'infra qu'on paie déjà (Railway) — coût marginal
quasi nul pour UN compte (Live Swann), au prix d'un peu plus de responsabilité opérationnelle de
notre côté (pas de SLA, projet communautaire — mais actif : 222⭐, ~190 commits, watchdog de
crash intégré qui redémarre le terminal tout seul).

## ⚠️ Sécurité — mot de passe INVESTISSEUR uniquement, jamais le mot de passe de trading

`MT5_PASSWORD` ci-dessous doit être le mot de passe **investisseur** (lecture seule) du compte MT5,
jamais le mot de passe de trading. C'est un vrai réglage du protocole MT5 lui-même (pas une
promesse de ce conteneur) : avec un mot de passe investisseur, le serveur du broker refuse
n'importe quel ordre envoyé depuis cette session, quoi que fasse le logiciel côté client - même si
`mt5-notify-bridge` ne devait JAMAIS appeler de fonction de trading (et il ne le fait pas, voir son
README), cette double protection reste la bonne pratique : si ce conteneur était un jour compromis,
l'attaquant ne pourrait que consulter le compte, jamais trader ni retirer des fonds.

## Variables d'environnement à définir sur Railway

| Variable | Valeur |
|---|---|
| `MT5_HOST` | `0.0.0.0` (pour écouter sur le réseau privé Railway) - en réalité écrasé de toute façon par `env.sh` du conteneur qui l'exporte en dur, donc cette variable Railway est sans effet réel mais inoffensive |
| `MT5_LOGIN` | Identifiant d'un compte MT5 **"bootstrap"** — voir explication ci-dessous |
| `MT5_PASSWORD` | Mot de passe (investisseur suffit) de ce compte bootstrap |
| `MT5_SERVER` | Nom exact du serveur broker de ce compte bootstrap |
| `SERVER` | **Sans le préfixe `MT5_`** - même valeur que `MT5_SERVER` ci-dessus. Variable DIFFÉRENTE utilisée par une automation GUI distincte (voir ci-dessous) - nécessaire si le serveur n'est pas déjà dans la liste intégrée de MT5 (ex. `MetaQuotes-Demo` n'en a pas besoin, un serveur démo d'un vrai broker si) |

**Bizarrerie du script upstream (2026-09-27, lu directement dans le code source de
`lucas-campagna/mt5linux`, `docker/src/`)** : ce projet utilise DEUX conventions de noms de
variables différentes pour deux mécanismes différents, ce qui prête à confusion :
- `config.sh` (`apply_mt5_config()`) lit `MT5_LOGIN`/`MT5_SERVER`/`MT5_PASSWORD` (AVEC préfixe) pour
  écrire l'autologin dans `common.ini` - le mécanisme "silencieux", suffisant si le serveur est déjà
  connu de MT5.
- `mt5.sh` (`wait_for_mt5_and_type_server()`) et `automation.sh` lisent une variable `SERVER` (SANS
  préfixe, différente de `MT5_SERVER`) pour déclencher une automation `xdotool` qui tape le nom du
  serveur dans la fenêtre "rechercher un serveur" du terminal - nécessaire seulement si ce serveur
  n'est pas déjà dans la liste intégrée.
- **Le message des logs `MT5 Configuration: LOGIN: not set / SERVER: not set` est un faux
  problème/bug d'affichage du script upstream** : `main.sh` imprime ce diagnostic en lisant lui
  aussi les noms SANS préfixe (`LOGIN`/`SERVER`/`PASSWORD`), qui ne sont jamais ceux qu'on définit
  (`MT5_LOGIN` etc.) - il affichera "not set" même quand l'autologin est correctement configuré et
  fonctionne. Ne pas se fier à cette ligne pour diagnostiquer un problème.

**Correction importante (2026-09-27) : ces trois variables sont en réalité REQUISES**, contrairement
à ce que ce README affirmait juste avant — pas seulement un "secours optionnel". Incident réel en
production (logs Railway, voir CLAUDE.md) : `mt5.initialize()` échouait en boucle avec
`(-10005, 'IPC timeout')` tant qu'aucun compte n'était configuré. Cause confirmée (forum MQL5,
retour d'expérience d'autres utilisateurs de ce même projet `mt5linux`) : un terminal MT5 fraîchement
installé, sans autologin, reste bloqué sur SA PROPRE fenêtre modale de connexion/création de compte
démo — et une fenêtre modale ouverte empêche l'API `initialize()` de répondre, quel que soit le délai
d'attente ou le chemin passé en argument. Il faut donc qu'**un compte quelconque soit déjà connecté**
au démarrage du conteneur pour que le terminal sorte de cet état bloqué.

- Le compte bootstrap peut être **n'importe quel compte MT5, y compris un compte démo gratuit**
  (MetaQuotes-Demo ou un démo d'un vrai broker) — il ne sert qu'à débloquer `initialize()`, jamais
  utilisé pour de vraies notifications tant que le site n'a pas fait son propre `POST
  /switch-account`.
- Une fois le terminal initialisé avec ce compte bootstrap, le mécanisme normal reste inchangé : le
  site (Dashboard → Ajouter un compte → Compte Live, admin uniquement) appelle `POST /mt5/connect`
  sur accounts-bridge, qui appelle `POST /switch-account` sur `mt5-notify-bridge` — celui-ci
  reconnecte le terminal EN DIRECT (`mt5.login()`, sans redémarrer le conteneur ni retoucher ces
  variables) vers le VRAI compte voulu (nouvelle phase de challenge, nouveau compte financé...). Voir
  `../mt5-notify-bridge/README.md` pour le détail complet de ce mécanisme.

Ne PAS exposer de domaine public sur ce service — `mt5-notify-bridge` s'y connecte uniquement via
le réseau privé Railway (`mt5-terminal.railway.internal:18812`, nom exact = nom donné au service
dans Railway). Les ports 8080/5901 (interface noVNC, utile uniquement pour un diagnostic manuel en
cas de souci de connexion au broker) n'ont pas besoin d'être exposés publiquement non plus — au
besoin, utiliser le port-forwarding du CLI Railway (`railway service` puis `railway connect` /
tunnel) plutôt que de les rendre publics.

## Vérifier que ça tourne

Une fois déployé, les logs Railway du service doivent montrer le terminal MT5 démarrer (pas
forcément connecté à un compte tant que personne n'a utilisé "Ajouter un compte → Compte Live" sur
le site, voir plus haut). Si une connexion échoue, vérifier d'abord `MT5_SERVER` (nom exact,
sensible à la casse, saisi depuis le site) et que le mot de passe investisseur n'a pas expiré côté
broker.

## `CHESTNotifier.mq5` — l'Expert Advisor qui notifie les clôtures (2026-09-28)

**Pourquoi ce changement** : l'ancien mécanisme (`mt5-notify-bridge` qui sondait l'historique des
deals toutes les 15s via RPyC depuis l'extérieur) reposait sur `mt5.initialize()`, qui a échoué de
façon persistante en production (voir CLAUDE.md, section "IPC timeout") - un problème de démarrage
du terminal Wine qui reste **non résolu à ce jour**. Un Expert Advisor tourne DANS le terminal une
fois qu'un compte y est connecté (peu importe comment) et utilise l'API MQL5 native
(`OnTradeTransaction`, événement natif, pas de sondage) pour notifier `accounts-bridge`
**directement en HTTP** (`WebRequest()`) - aucune dépendance à `mt5-notify-bridge`/RPyC pour cette
partie. `mt5-notify-bridge` garde uniquement son rôle de changement de compte (`/switch-account`).

**Ça ne résout PAS le blocage du login au démarrage** (voir CLAUDE.md) - ça change juste comment on
détecte/notifie les clôtures UNE FOIS qu'un compte est connecté. Il faut donc toujours, au moins une
fois, obtenir un terminal réellement connecté à un compte (via l'autologin `MT5_LOGIN`/etc.
ci-dessus si ça finit par fonctionner, ou manuellement via noVNC en dernier recours).

### Installation (tout se fait via la Console Railway du service, pas besoin de noVNC pour ces étapes)

1. **Copier le fichier source** dans le conteneur - depuis la Console Railway de `mt5-terminal` :
   ```bash
   mkdir -p /opt/wineprefix/drive_c/MT5/MQL5/Experts
   cat > /opt/wineprefix/drive_c/MT5/MQL5/Experts/CHESTNotifier.mq5 << 'CHESTEOF'
   <coller ici le contenu exact de mt5-terminal/CHESTNotifier.mq5>
   CHESTEOF
   ```
   (Le terminal est lancé avec `/portable` - voir `mt5.sh` du paquet `mt5linux` - donc tout son
   dossier `MQL5/` vit à cet endroit prévisible, pas dans un profil Windows caché.)

2. **Compiler en ligne de commande** (MetaEditor supporte un mode headless officiel, pas besoin
   d'ouvrir une fenêtre) :
   ```bash
   export DISPLAY=:0
   wine64 "C:/MT5/metaeditor64.exe" /compile:"C:\MT5\MQL5\Experts\CHESTNotifier.mq5" /portable /log
   cat /opt/wineprefix/drive_c/MT5/MQL5/Experts/CHESTNotifier.log
   ```
   Le fichier `.log` dit si la compilation a réussi (doit produire `CHESTNotifier.ex5` à côté du
   `.mq5`). **Pas encore testé en conditions réelles** (bloqué par le login du terminal au moment
   d'écrire ceci) - si `/compile` ne fonctionne pas tel quel, la compilation reste possible via
   noVNC (MetaEditor s'ouvre avec F4 depuis le terminal, puis F7 pour compiler).

3. **Autoriser l'URL de notification** (obligatoire, sinon `WebRequest()` échoue systématiquement
   avec l'erreur 4060) - éditer `common.ini` pour ajouter l'URL à la liste blanche, OU le faire une
   fois via noVNC (Outils → Options → Expert Advisors → cocher "Autoriser WebRequest pour les URL
   listées" → ajouter l'URL exacte de `accounts-bridge`, ex.
   `https://accounts-bridge-production-xxxx.up.railway.app`). **Pas encore vérifié si une clé INI
   équivalente existe pour éviter le passage par noVNC** - à tester.

4. **Attacher l'EA à un graphique** - normalement une action GUI (glisser-déposer depuis le
   Navigateur), donc via noVNC la première fois. Une piste à vérifier pour l'automatiser au
   démarrage sans GUI : la section `[StartUp]` du fichier de config MT5 (`Expert=`, `Symbol=`,
   `Period=`) est un mécanisme documenté par MetaQuotes pour lancer un EA automatiquement au
   démarrage du terminal - **non testé sur ce projet**, à essayer en ajoutant cette section à
   `common.ini` (ou un fichier de profil séparé) avant de conclure qu'il faut repasser par noVNC à
   chaque redémarrage du conteneur.

5. **Renseigner les paramètres de l'EA** (`NotifyUrl`, `EaSecret`) - dans les propriétés de l'EA
   (clic droit sur le graphique → Expert Advisors → Entrées), avec l'URL publique
   d'`accounts-bridge` et la valeur de `MT5_EA_SECRET` (voir `accounts-bridge/server.py`, variable à
   définir aussi côté Railway sur ce service).

### Vérifier que l'EA fonctionne

Les `Print()` de l'EA vont dans les logs "Experts" du terminal, sur disque à
`/opt/wineprefix/drive_c/MT5/MQL5/Logs/*.log` (ou `Logs/` selon la version) et `Experts/*.log` -
consultables directement via la Console Railway (`cat`/`tail`), sans avoir besoin de noVNC pour
vérifier que les notifications partent bien.
