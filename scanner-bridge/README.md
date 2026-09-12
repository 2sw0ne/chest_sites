# Stratégies — panneau de notification multi-scanners

Service local qui reçoit les alertes TradingView de N'IMPORTE LEQUEL des scanners enregistrés (Wolfx, Algomni, Swyper v6, Pivot) et écrit `../site/data/scanner-signals.json`, lu par le panneau de notification de `strategies.html`.

Différence avec `berich-bridge` : BERICH suit UNE position (ouverture → clôture, avec un `id` partagé entre les deux messages). Ici il n'y a pas de suivi de position — chaque signal est une simple opportunité ponctuelle (achat/vente détecté sur telle paire/unité de temps par tel scanner), affichée dans la liste, cliquable pour ouvrir directement le bon graphique.

## Configurer les alertes TradingView

Sur **chaque** script (Wolfx, Algomni, Swyper v6, Pivot), crée une alerte de type webhook pointée vers :

```
http://<ton-ip-ou-tunnel>:5601/webhook
```

avec un message JSON dans ce format exact :

```json
{"scanner": "Wolfx", "symbol": "EURUSD", "timeframe": "15", "side": "buy"}
```

- `scanner` doit correspondre EXACTEMENT au nom du scanner tel qu'enregistré dans `site/js/scanner-store.js` (`"Wolfx"`, `"Algomni"`, `"Swyper v6"`, `"Pivot"`) — c'est ce nom qui sert à retrouver le bon logo/couleur côté site.
- `timeframe` doit être l'un de `1`, `5`, `15`, `30`, `60`, `240`, `D` (les unités de temps proposées par le site).
- `side` vaut `"buy"` ou `"sell"`.
- `time` est optionnel (l'heure de réception du serveur est utilisée sinon).

Si tu utilises une alerte générique TradingView (pas un `alert()` explicite dans le script), tu peux construire ce JSON directement dans le champ "Message" de l'alerte avec les variables TradingView (`{{ticker}}`, `{{interval}}`, …) — à adapter selon ce que chaque script expose réellement.

**Important** : les alertes avec webhook nécessitent un [plan TradingView payant](https://www.tradingview.com/pricing/).

## Lancer en local

```bash
pip install flask
python server.py
```

Le serveur écoute sur le port **5601** (BERICH utilise déjà le 5600, pas de conflit). TradingView doit pouvoir atteindre cette URL depuis internet — en local ça veut dire un tunnel (ex. [ngrok](https://ngrok.com), `cloudflared`) tant que ce service n'est pas déployé sur Railway comme `calendar-bridge`.

## Format de `scanner-signals.json`

```json
{
  "example": false,
  "updatedAt": "2026-09-11T19:55:00Z",
  "signals": [
    { "id": "Wolfx-EURUSD-15-2026-09-11T19:55:00Z", "scanner": "Wolfx", "symbol": "EURUSD", "timeframe": "15", "side": "buy", "time": "2026-09-11T19:55:00Z" }
  ]
}
```

`example: true` (valeur par défaut du fichier livré avec le site) indique au site qu'aucun vrai signal n'est encore arrivé — dès la première requête `POST /webhook` reçue, il repasse à `false`.

## Déploiement (plus tard)

Même logique que `calendar-bridge`/`berich-bridge` : une fois prêt, ce dossier peut être déployé comme service Railway séparé, avec son URL renseignée dans `site/js/config.js` (`scannerSignalsApiUrl`) pour que le site aille lire les signaux là-bas au lieu du fichier local. Pas fait pour l'instant — le reste de CHEST reste 100% local.
