# CHEST — comptes utilisateurs

Petit backend d'authentification pour un usage familial/proches de confiance
(pas un vrai SaaS public) : inscription, approbation par un administrateur,
connexion par jeton. Voir les commentaires en tête de `server.py` pour le
détail du fonctionnement.

## Lancer en local

```
pip install -r requirements.txt
python server.py
```

Écoute sur `http://localhost:8080` par défaut (variable `PORT`). La base
SQLite est créée à côté du script (`accounts.db`) si `RAILWAY_VOLUME_MOUNT_PATH`
n'est pas défini.

## Créer le compte admin

Le **premier compte inscrit** via `POST /signup` devient automatiquement
administrateur et approuvé — pas besoin de manipuler un mot de passe ou une
base de données à la main. Utilise la page `site/signup.html` du site pour
créer ce premier compte avec ton propre email/mot de passe.

## Déploiement Railway

Même principe que `calendar-bridge/` :
1. Nouveau service Railway, pointé sur un repo/dossier contenant ce
   `Dockerfile` + `server.py` + `requirements.txt`.
2. Attacher un **Volume** au service (clic droit sur le service dans la vue
   canvas → Attach Volume) pour que la base de données survive aux
   redéploiements — sinon tous les comptes seraient perdus à chaque déploiement.
3. Récupérer l'URL publique du service et la renseigner dans
   `site/js/config.js` (`accountsApiUrl`).

## Endpoints

| Méthode | Route | Auth | Description |
|---|---|---|---|
| POST | `/signup` | — | Inscription (prénom, nom, email, mot de passe) |
| POST | `/login` | — | Connexion → `{token, user}` |
| POST | `/logout` | Bearer | Invalide le jeton |
| GET | `/me` | Bearer | Infos du compte connecté |
| GET | `/members` | Bearer (admin) | Liste tous les comptes |
| POST | `/members/<id>/approve` | Bearer (admin) | Approuve une inscription |
| POST | `/members/<id>/reject` | Bearer (admin) | Refuse une inscription |
| GET | `/health` | — | Statut du service |

## Portée actuelle (volontairement limitée)

Ce service gère uniquement l'authentification et l'approbation des comptes.
Les données par outil (journal, backtests, comptes MT5 connectés...) restent
pour l'instant dans le `localStorage` du navigateur, comme avant — leur
migration vers ce backend (rattachée à chaque compte utilisateur) est une
étape suivante, à faire outil par outil plutôt que d'un bloc, pour pouvoir
vérifier chaque migration sans perdre de données existantes.
