# scanner-server

Service privé qui exécute les scripts Pine des scanners et renvoie le modèle calculé. Le code Pine ne sort jamais de ce service.

- Scripts : sur le volume Railway monté sur `/data` (variable `SCRIPTS_DIR`, défaut `/data/scripts`). Jamais dans git.
- `manifest.json` dans `SCRIPTS_DIR` : `{ "<id-scanner>": ["fichier principal", "fichier supplémentaire", ...] }`, chemins relatifs à `SCRIPTS_DIR`.
- `GET /data?script=<id>` : bougies Twelve Data (filtrées comme sur le site) et modèles calculés.
- `POST /restore` (en-tête `X-Internal-Secret`) : pose les fichiers et le manifeste. Appelé uniquement par accounts-bridge (`/scanners/restore`, admin).
- Variables : `TWELVE_DATA_API_KEY`, `INTERNAL_SECRET`, `SCRIPTS_DIR`, `PORT`.
- Pas de domaine public : seul accounts-bridge l'appelle, via `SCANNER_SERVER_URL`.
