# BERICH — scanner TradingView → CHEST

Service local qui reçoit les alertes de ton scanner Pine Script (webhook TradingView) et écrit `../site/data/berich-signal.json`, lu automatiquement par la page `berich.html`.

Distinct de BEFREE (`github.com/2sw0ne/BEFREE`, un autre service qui relaie
les mêmes alertes vers le bot Telegram) : ce dossier-ci ne fait QUE nourrir
`berich.html`, rien à voir avec Telegram (2026-09-23, clarification
utilisateur — les deux avaient été confondus dans une passe précédente).

## État actuel

- **Réception des signaux** : déployé comme service Railway séparé (même logique que `calendar-bridge`/`accounts-bridge` — Dockerfile + requirements.txt à la racine de ce dossier).
- **Exécution automatique sur MT5** : **pas branchée**. La page BERICH affiche le signal (entrée/SL/TP) et calcule le montant à risquer, mais le bouton « Prendre le trade » ne fait encore que confirmer l'intention côté site — aucun ordre n'est envoyé à un vrai terminal MT5. Deux mécanismes possibles ont été identifiés, à trancher plus tard :
  1. **Expert Advisor (EA) MT5** installé par chaque utilisateur dans son propre terminal — il interroge ce serveur (ou un service central si déployé) via une clé de connexion, et exécute localement quand un signal est confirmé. Les identifiants broker ne quittent jamais la machine de l'utilisateur (comme le fait [PineConnector](https://pineconnector.net)).
  2. **Service cloud MT5 tiers** (ex. MetaApi) — zéro installation côté utilisateur, mais implique d'envoyer les identifiants broker à un service externe payant.

## Configurer l'alerte TradingView

Le script Pine "BE FR€E" appelle déjà `alert(...)` lui-même (pas un `alertcondition()` classique) — il envoie directement le JSON complet. Un seul type d'alerte à créer côté TradingView : **"Any alert() function call"**, pointée vers :

```
http://<ton-ip-ou-tunnel>:5600/webhook
```

Le script envoie **deux messages distincts sur le même endpoint**, liés par un `id` commun (le timestamp d'ouverture) :

- **Ouverture** (à l'apparition du signal WolfX) :
  ```json
  {"id":"1234567890","pair":"EURUSD","signal":"BUY","entry":1.0850,"sl":1.0800}
  ```
  Pas de `tp` envoyé — le RR est verrouillé à 3 dans le script, donc `server.py` le recalcule lui-même (`tp = entry ± 3×|entry-sl|`).
- **Clôture** (au moment où le prix touche le SL ou le TP), même `id` :
  ```json
  {"id":"1234567890","result":"TP"}
  ```
  `server.py` retrouve le signal ouvert correspondant par `id` et le marque `status:"closed"` avec son `result` — la page BERICH l'affiche alors comme clôturé au lieu de proposer "Prendre le trade".

**Important** : les alertes avec webhook nécessitent un [plan TradingView payant](https://www.tradingview.com/pricing/).

## Lancer en local

```bash
pip install -r requirements.txt
python server.py
```

Le serveur écoute sur le port **5600** en local (`PORT` sinon, lu automatiquement une fois déployé sur Railway — voir plus bas). TradingView doit pouvoir atteindre cette URL depuis internet — en local ça veut dire un tunnel (ex. [ngrok](https://ngrok.com), `cloudflared`) tant que tu testes avant de pointer l'alerte vers l'URL Railway.

## Format de `berich-signal.json`

```json
{
  "example": false,
  "updatedAt": "2026-09-09T07:55:00Z",
  "signals": [
    {
      "id": "1234567890", "scanner": "BE FR€E", "symbol": "EURUSD", "side": "buy",
      "entry": 1.0850, "sl": 1.0800, "tp": 1.1000, "time": "2026-09-09T07:55:00Z",
      "status": "closed", "result": "TP", "closedAt": "2026-09-09T09:10:00Z"
    }
  ]
}
```

`status` vaut `"open"` tant qu'aucun message de clôture n'est arrivé pour cet `id`, puis `"closed"` avec `result` (`"TP"`/`"SL"`) une fois le second message reçu.

`example: true` (valeur par défaut du fichier livré avec le site) indique à `berich.html` qu'aucun vrai signal n'est encore arrivé — dès la première requête `POST /webhook` reçue, il repasse à `false`.

## Déploiement

Même logique que `calendar-bridge`/`accounts-bridge` (Railway, Root Directory = `berich-bridge`, Dockerfile détecté automatiquement) :

1. Créer le service Railway (Root Directory `berich-bridge`), déployer.
2. Copier son URL publique et la coller dans `site/js/config.js` (`berichApiUrl`), en ajoutant `/signals` à la fin (ex. `https://xxx.up.railway.app/signals`) — c'est la route qui sert `berich-signal.json` (`GET /signals`).
3. Dans TradingView, pointer l'alerte "Any alert() function call" vers `https://xxx.up.railway.app/webhook` (plus besoin de tunnel local).

**Limite connue** : `../site/data/berich-signal.json` vit dans le système de fichiers éphémère du conteneur (pas de Volume Railway ici, contrairement à `accounts-bridge`) — les 50 derniers signaux sont perdus à chaque redéploiement/redémarrage. Acceptable pour l'instant (se repeuple tout seul dès la prochaine alerte TradingView) ; à revoir avec un Volume si ça devient gênant.
