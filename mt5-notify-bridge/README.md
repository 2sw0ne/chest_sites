# CHEST · mt5-notify-bridge

Service Railway séparé : pilote le **changement de compte MT5 "Live"** connecté au terminal
(service `mt5-terminal`, voir son README.md) depuis le site — `POST /switch-account`, appelé par
`accounts-bridge` (`POST /mt5/connect`) à chaque fois que l'utilisateur change de compte (nouvelle
phase de challenge, nouveau compte financé...).

**Changement de rôle (2026-09-28, voir CLAUDE.md "Plan EA")** : ce service ne sonde PLUS
l'historique des deals lui-même pour détecter les clôtures. Cette responsabilité est passée à un
Expert Advisor MQL5 qui tourne DANS le terminal (`mt5-terminal/CHESTNotifier.mq5`) et notifie
`accounts-bridge` directement (`POST /mt5/ea-notify`) via un événement natif
(`OnTradeTransaction`), sans dépendre de ce service ni de RPyC pour cette partie — plus réactif
qu'un sondage externe, et indépendant du blocage `mt5.initialize()` qui affecte encore ce service
(voir plus bas).

**Ne pas confondre avec `mt5-bridge/` (racine du dépôt)** : ce dernier est un script LOCAL,
préexistant, que l'utilisateur lance sur sa propre machine Windows pour exporter son compte MT5
vers `site/data/data.json` (lu par le Dashboard) — rien à voir avec ce service. Noms volontairement
différents pour ne pas les mélanger (erreur commise puis corrigée le 2026-09-27 — voir CLAUDE.md).

## Connexion : RPyC brut, PAS `mt5linux.MetaTrader5` (2026-09-27)

Ce service se connecte à `mt5-terminal` avec `import rpyc` directement (`DirectMT5Client` dans
`server.py`), pas la classe `mt5linux.MetaTrader5`. Incident réel en production (logs Railway) :
son constructeur exige INCONDITIONNELLEMENT un runtime Docker ou udocker **local** rien que pour se
connecter à un serveur déjà lancé ailleurs (`ContainerManager.__init__` appelle toujours
`create_runtime()`, lu directement dans le code source du paquet) — sur une architecture à deux
services séparés comme celle-ci, ça plantait systématiquement au démarrage avec `RuntimeError: No
container runtime available`. `DirectMT5Client` reprend le même mécanisme interne que `mt5linux`
utilise une fois connecté (`rpyc.classic.connect()` puis `conn.execute()`/`conn.eval()` sur du code
Python construit en chaîne, avec `repr()` pour échapper correctement les valeurs interpolées -
jamais un f-string qui concaténerait une valeur brute, injection de code sinon), simplement sans la
couche de gestion de conteneur. Vérifié en direct contre un vrai serveur RPyC classic local (pas un
mock) : connexion, login (échec et succès, y compris avec un mot de passe contenant guillemets et
antislash), `account_info()` — tout fonctionne correctement.

## Dépendance : `mt5-terminal` doit tourner AVANT ce service

Ce service se connecte au terminal (`mt5.initialize()`) au démarrage, mais aucun compte n'est
forcément connecté avant qu'un premier changement de compte n'arrive (voir plus bas) — c'est
normal, `GET /health` renverra `connected_login: null` jusque-là.

## Changer de compte "Live" depuis le site (2026-09-27)

`POST /switch-account` (protégé par `X-Internal-Secret`, appelé par accounts-bridge — voir
`POST /mt5/connect` dans `accounts-bridge/server.py`) reçoit `{login, password, server,
dashboardAccountId}` et appelle `mt5.login(...)` **sur la connexion déjà établie** — pas
`mt5.initialize()` à nouveau, c'est une reconnexion de COMPTE, pas de terminal. Ça permet de
changer de compte (nouvelle phase de challenge, nouveau compte financé...) sans jamais redémarrer
le conteneur ni toucher une variable d'environnement Railway. Un seul compte connecté à la fois
(contrainte réelle du terminal MT5) — brancher un nouveau compte remplace l'ancien, qui n'est pas
supprimé côté CHEST, juste plus mis à jour.

## Sécurité — lecture seule, par principe ET par protocole

- Ce script n'appelle **jamais** de fonction de trading de l'API MT5 (`order_send`, `order_check`…)
  — uniquement `login`/`account_info`. Vérifié dans `server.py`.
- Le terminal lui-même est connecté avec le mot de passe **investisseur** (lecture seule) — même si
  ce code appelait un jour une fonction de trading par erreur, le serveur du broker la refuserait.
  Double protection, jamais une seule.

## Variables d'environnement

| Variable | Valeur |
|---|---|
| `MT5_TERMINAL_HOST` | Nom interne Railway du service `mt5-terminal` (ex. `mt5-terminal.railway.internal`) |
| `MT5_TERMINAL_PORT` | `18812` (port RPyC par défaut de `mt5linux`) |
| `MT5_TERMINAL_PATH` | `C:\MT5\terminal64.exe` par défaut — chemin d'installation du terminal DANS `mt5-terminal` (image `lprett/mt5linux`). Ne changer que si `mt5-terminal` passe un jour à une autre image. Sans ce chemin explicite, `mt5.initialize()` fait une auto-détection qui échoue sous Wine avec `(-10005, 'IPC timeout')` (incident du 2026-09-27, voir CLAUDE.md) |
| `MT5_POLL_SECONDS` | `15` par défaut — délai entre deux tentatives de (re)connexion au terminal quand il n'est pas prêt (pas un sondage de deals, ce rôle est passé à l'EA) |
| `INTERNAL_PUSH_SECRET` | **Même valeur** que sur accounts-bridge/berich-bridge/calendar-bridge |

`ACCOUNTS_BRIDGE_URL` n'est plus utilisée par ce service (2026-09-28) — les notifications passent
désormais par l'EA, qui appelle `accounts-bridge` directement.

## Vérifier que ça tourne

`GET /health` renvoie `{"connected_login": "...", "dashboard_account_id": "...", "last_poll_ok":
"...", "last_error": null}` — un `last_error` non nul indique un souci de connexion à
`mt5-terminal` (voir ses logs), et `connected_login: null` veut juste dire qu'aucun compte n'a
encore été connecté depuis le site.

## Configurer aussi le côté accounts-bridge

Ce service ne suffit pas seul : `accounts-bridge` a besoin de `MT5_NOTIFY_BRIDGE_URL` (URL
**publique** de CE service, ou son adresse réseau privé si accounts-bridge et lui tournent tous les
deux sur Railway) et `MT5_CREDENTIALS_KEY` (une clé Fernet — `python3 -c "from cryptography.fernet
import Fernet; print(Fernet.generate_key().decode())"` pour en générer une) pour que
"Ajouter un compte → Compte Live" fonctionne sur le site. Voir `POST /mt5/connect` dans
`accounts-bridge/server.py`.

Pour que les notifications de clôture (envoyées par l'EA, pas par ce service) fonctionnent,
`accounts-bridge` a aussi besoin de `MT5_EA_SECRET` (une chaîne aléatoire quelconque, différente de
`INTERNAL_PUSH_SECRET` — voir `mt5-terminal/README.md` section EA pour le détail complet).
