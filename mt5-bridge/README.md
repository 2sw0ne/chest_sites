# Pont MT5 → Chesting

Script local qui lit ton compte MT5 (déjà ouvert et connecté sur cette machine) et écrit `../site/data/data.json`, lu automatiquement par le Dashboard. Aucun identifiant MT5 ne transite jamais vers le navigateur — tout reste en local.

## Installation

```bash
pip install MetaTrader5
```

## Configuration

Ouvre `export_mt5.py` et modifie le bloc en haut du fichier :

- `ACCOUNT_NAME` / `ACCOUNT_TYPE` / `BROKER_LABEL` — comment le compte doit s'afficher dans Chesting.
- `OBJECTIVES` — les règles de ton challenge (jours minimum, perte journalière/max autorisée, objectif de profit) si tu veux que la checklist "Trading Objectives" soit calculée sur tes vraies règles.

## Utilisation

Une seule synchronisation :

```bash
python export_mt5.py
```

Boucle continue (tant que la fenêtre reste ouverte, une synchro toutes les 60s) :

```bash
python export_mt5.py --loop
```

Pour une synchro automatique en arrière-plan sans garder de fenêtre ouverte : programme `python export_mt5.py` dans le **Planificateur de tâches Windows**, toutes les 1 à 5 minutes.

## Ce que ça change dans Chesting

Une fois `site/data/data.json` présent, le Dashboard ajoute automatiquement un compte **"🔴 MT5 (connecté)"** dans le sélecteur de comptes, avec tes vraies données (balance, equity, KPIs par période, courbe d'equity, objectifs, calendrier 14 jours). Les comptes d'exemple restent disponibles à côté, toujours marqués comme tels.

Si le fichier n'existe pas encore (avant ta première synchro), le Dashboard continue de fonctionner normalement avec les comptes d'exemple.
