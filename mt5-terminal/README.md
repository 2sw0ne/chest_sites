# CHEST · mt5-terminal

Service Railway séparé : un vrai terminal **MetaTrader 5** tournant sous Wine dans un conteneur
Linux (image [`lprett/mt5linux`](https://github.com/lucas-campagna/mt5linux), publiée depuis le
projet open-source `mt5linux` — pas un service géré/tiers payant comme MetaApi.cloud, juste notre
propre conteneur sur l'infra Railway déjà utilisée par les autres services de ce monorepo).

Ce service ne fait rien tout seul : il expose l'API du terminal (RPyC, port `18812`) au service
`mt5-notify-bridge` via le réseau privé Railway, qui lui fait le vrai travail (sonder l'historique
des deals et notifier les clôtures). Voir `../mt5-notify-bridge/README.md`.

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
| `MT5_HOST` | `0.0.0.0` (pour écouter sur le réseau privé Railway) |
| `MT5_LOGIN` | Identifiant d'un compte MT5 **"bootstrap"** — voir explication ci-dessous |
| `MT5_PASSWORD` | Mot de passe (investisseur suffit) de ce compte bootstrap |
| `MT5_SERVER` | Nom exact du serveur broker de ce compte bootstrap |

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
