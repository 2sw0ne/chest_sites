# CHEST · mt5-notify-bridge

Service Railway séparé : sonde le terminal MT5 (service `mt5-terminal`, voir son README.md) toutes
les quelques secondes et envoie une notification push CHEST dès qu'une position se clôture, avec le
vrai P&L en dollars et la vraie cause de clôture (TP/SL/Stop Out/manuelle — lue directement dans
MT5, jamais devinée).

**Ne pas confondre avec `mt5-bridge/` (racine du dépôt)** : ce dernier est un script LOCAL,
préexistant, que l'utilisateur lance sur sa propre machine Windows pour exporter son compte MT5
vers `site/data/data.json` (lu par le Dashboard) — rien à voir avec ce service, qui lui tourne sur
Railway en continu et ne fait que déclencher des notifications push. Les deux coexistent sans
conflit (noms volontairement différents pour ne pas les mélanger, erreur commise puis corrigée le
2026-09-27 pendant la mise en place de ce service — voir CLAUDE.md).

Remplace la piste "Myfxbook + serveur qui repasse dessus" envisagée d'abord : Myfxbook lui-même ne
se resynchronise que très lentement côté serveur (voir CLAUDE.md, section notifications), un délai
qu'on ne peut pas contourner en interrogeant plus souvent. En se connectant directement au terminal
MT5 (via `mt5-terminal`, notre propre conteneur — pas Myfxbook), il n'y a plus d'intermédiaire lent
: la fraîcheur ne dépend que de `MT5_POLL_SECONDS`.

## Dépendance : `mt5-terminal` doit tourner et être connecté AVANT ce service

Ce service ne contient AUCUN mot de passe MT5 — il se contente d'interroger un terminal déjà
connecté (autologin, voir `../mt5-terminal/README.md`). Déployer et vérifier `mt5-terminal` en
premier.

## Sécurité — lecture seule, par principe ET par protocole

- Ce script n'appelle **jamais** de fonction de trading de l'API MT5 (`order_send`, `order_check`…)
  — uniquement `history_deals_get`/`account_info`. Vérifié dans `server.py`.
- Le terminal lui-même est connecté avec le mot de passe **investisseur** (lecture seule) — même si
  ce code appelait un jour une fonction de trading par erreur, le serveur du broker la refuserait.
  Double protection, jamais une seule.

## Variables d'environnement

| Variable | Valeur |
|---|---|
| `MT5_TERMINAL_HOST` | Nom interne Railway du service `mt5-terminal` (ex. `mt5-terminal.railway.internal`) |
| `MT5_TERMINAL_PORT` | `18812` (port RPyC par défaut de `mt5linux`) |
| `MT5_POLL_SECONDS` | `15` par défaut — connexion locale au réseau privé Railway, pas un appel facturé, peut rester bas sans souci |
| `ACCOUNTS_BRIDGE_URL` | URL **publique** déployée d'accounts-bridge (même valeur que sur berich-bridge/calendar-bridge) |
| `INTERNAL_PUSH_SECRET` | **Même valeur** que sur accounts-bridge/berich-bridge/calendar-bridge |

## Vérifier que ça tourne

`GET /health` renvoie `{"last_ticket": ..., "last_poll_ok": "...", "last_error": null}` — un
`last_error` non nul indique un souci de connexion à `mt5-terminal` (voir ses logs).
