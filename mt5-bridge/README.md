# Pont MT5 → CHEST

Script local qui lit ton compte MT5 (déjà ouvert et connecté sur cette machine) et écrit `../site/data/data.json`, lu automatiquement par le Dashboard. Aucun identifiant MT5 ne transite jamais vers le navigateur — tout reste en local.

## Le plus simple : double-clic (Windows, pas besoin de connaître Python)

1. Ouvre MT5 et connecte-toi à ton compte.
2. Double-clique sur **`lancer-sync.bat`**.
3. Au tout premier lancement, il pose 4 questions (nom du compte, type, broker, objectifs de challenge) — réponds ou appuie juste sur Entrée pour garder la valeur par défaut. C'est enregistré une fois pour toutes dans `config.json` (jamais à retoucher ensuite, sauf si tu veux changer une réponse).
4. Laisse la fenêtre ouverte : elle synchronise automatiquement toutes les 60s tant qu'elle tourne.

## Installation manuelle (ligne de commande)

```bash
pip install MetaTrader5
```

## Utilisation en ligne de commande

Une seule synchronisation :

```bash
python export_mt5.py
```

Boucle continue (tant que la fenêtre reste ouverte, une synchro toutes les 60s) :

```bash
python export_mt5.py --loop
```

Pour une synchro automatique en arrière-plan sans garder de fenêtre ouverte : programme `python export_mt5.py` dans le **Planificateur de tâches Windows**, toutes les 1 à 5 minutes.

La configuration (nom du compte, broker, objectifs) est demandée une seule fois à l'exécution et enregistrée dans `config.json` (non commité, propre à chaque machine) — supprime ce fichier si tu veux reconfigurer.

## Ce que ça change dans CHEST

Une fois `site/data/data.json` présent, le Dashboard ajoute automatiquement un compte **"🔴 MT5 (connecté)"** dans le sélecteur de comptes, avec tes vraies données (balance, equity, KPIs par période, courbe d'equity, objectifs, calendrier 14 jours). Les comptes d'exemple restent disponibles à côté, toujours marqués comme tels.

Si le fichier n'existe pas encore (avant ta première synchro), le Dashboard continue de fonctionner normalement avec les comptes d'exemple.
