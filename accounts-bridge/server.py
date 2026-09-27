"""
CHEST - comptes utilisateurs (famille/proches), service Railway.

Petit backend d'authentification + approbation admin, pour un usage a
quelques comptes de confiance (pas un vrai SaaS public) :
- Inscription (email/mdp) -> statut "pending" tant qu'un admin n'a pas
  valide.
- Le TOUT PREMIER compte cree devient automatiquement admin ET approuve
  (bootstrap) - evite d'avoir a manipuler un mot de passe reel pour creer
  le compte admin depuis l'exterieur : l'utilisateur cree lui-meme son
  propre compte admin via /signup.html, avec son propre mot de passe.
- Connexion -> jeton opaque (table sessions), a renvoyer en
  "Authorization: Bearer <token>" sur les appels suivants.
- Un admin peut lister/approuver/refuser les inscriptions en attente.
- AJOUTÉ (2026-09-15, demande explicite) : un email est envoyé à
  NOTIFY_EMAIL_TO à chaque nouvelle inscription en attente, pour ne pas
  avoir à surveiller admin-members.html en permanence. Nécessite les
  variables d'environnement SMTP_* (voir send_signup_notification ci-dessous)
  - sans elles, l'inscription fonctionne quand même, l'email est juste
  silencieusement sauté (jamais un motif de bloquer un compte).

Donnees dans SQLite, sur le Volume Railway du service (meme mecanisme que
calendar-bridge/server.py pour l'historique du calendrier) - survit aux
redeploiements.

Usage local :
    python server.py
Sur Railway, c'est le CMD du Dockerfile qui lance cette commande.
"""

import base64
import json
import os
import re
import secrets
import smtplib
import sqlite3
import threading
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from email.mime.text import MIMEText

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename
from werkzeug.serving import WSGIRequestHandler
from pywebpush import webpush, WebPushException

DB_DIR = os.environ.get("RAILWAY_VOLUME_MOUNT_PATH") or os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(DB_DIR, "accounts.db")
SESSION_LIFETIME_DAYS = 30

# School : contenu partagé (cours, documents, vidéos) ajouté par l'admin, lu par tous les membres.
# Les fichiers (documents, vidéos, miniatures) vivent à côté de la base, sous des noms aléatoires.
FILES_DIR = os.path.join(DB_DIR, "school_files")
MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024

# Vrai code source Pine des scanners (WolfX/Algomni/SWYPER/Pivot) - JAMAIS dans un fichier livré au
# frontend ni commité (voir site/js/scanner-store.js, qui ne garde que les métadonnées, et
# .gitignore). Ce fichier vit sur le Volume Railway comme accounts.db, à restaurer depuis une
# sauvegarde hors-git après un premier déploiement (voir /scanners plus bas).
SCANNERS_SECRET_PATH = os.path.join(DB_DIR, "scanners_secret.json")

# Cle Twelve Data (2026-09-23, meme raison que scanners_secret.json ci-dessus) : jusqu'ici collee en
# clair dans js/config.local.js, un fichier gitignore donc absent du deploiement Vercel - fonctionnait
# en local, jamais en production. Plutot que de la commiter quelque part (chest_sites est public,
# meme probleme que le Pine Script), elle vit UNIQUEMENT dans la variable d'environnement Railway
# TWELVE_DATA_API_KEY (a definir dans Railway -> service accounts-bridge -> Variables), jamais dans
# un fichier. /twelvedata/<endpoint> relaie les appels du frontend en l'injectant cote serveur.
TWELVE_DATA_API_KEY = os.environ.get("TWELVE_DATA_API_KEY", "")
TWELVE_DATA_ALLOWED_ENDPOINTS = {"time_series", "price"}

# Notifications push (Web Push standard, 2026-09-26) - meme principe que scanners_secret.json /
# TWELVE_DATA_API_KEY : la cle PRIVEE ne vit que dans une variable d'environnement Railway, jamais
# dans un fichier commite (chest_sites est public). La cle PUBLIQUE, elle, est par nature destinee
# au client (c'est le principe de VAPID, jamais secrete) et vit directement dans js/config.js -
# le serveur n'a donc besoin que de la PRIVEE, jamais des deux.
def _normalize_vapid_key(raw: str) -> str:
    """py_vapid (utilisé par pywebpush) attend la clé privée VAPID sous forme BRUTE - le scalaire
    encodé en base64 urlsafe sans padding, PAS le bloc PEM "-----BEGIN PRIVATE KEY-----...".
    Erreur commise lors de la 1re mise en place (2026-09-26) : c'est le PEM qui avait été donné à
    coller sur Railway, ce qui faisait planter webpush() ("Could not deserialize key data... ASN.1
    parsing error"). Tolérance ajoutée ici pour accepter les deux formats, quel que soit celui
    collé dans la variable d'environnement."""
    # JAMAIS laisser une clé mal formée planter le démarrage (ce code tourne au chargement du
    # module, avant même que Flask n'existe) - un incident réel (2026-09-26) a fait crash-looper
    # TOUT accounts-bridge en boucle sur une PEM invalide collée sur Railway, alors qu'une clé VAPID
    # cassée ne devrait désactiver QUE les notifications push (voir le "if not VAPID_PRIVATE_KEY"
    # dans _send_push_to_subscriptions - conçu pour dégrader en douceur, pas pour planter).
    if "BEGIN" in raw:
        try:
            from cryptography.hazmat.primitives import serialization
            key = serialization.load_pem_private_key(raw.encode(), password=None)
            value = key.private_numbers().private_value.to_bytes(32, "big")
            return base64.urlsafe_b64encode(value).rstrip(b"=").decode()
        except Exception as exc:
            print(f"VAPID_PRIVATE_KEY : PEM illisible ({exc}) - notifications push désactivées.")
            return ""
    return raw


VAPID_PRIVATE_KEY = _normalize_vapid_key(os.environ.get("VAPID_PRIVATE_KEY", ""))
VAPID_CLAIM_EMAIL = os.environ.get("VAPID_CLAIM_EMAIL", "mailto:swann.lafon@gmail.com")

# Secret PARTAGE entre services Railway (2026-09-26) - berich-bridge/calendar-bridge n'ont pas de
# session utilisateur (ce sont des webhooks/tâches de fond), donc pas de jeton Bearer a presenter a
# /push/broadcast. Un secret simple, connu des deux cotes (variable d'environnement, jamais
# commite), suffit pour ce cas d'usage service-a-service - pas un vrai systeme d'auth inter-services,
# volontairement simple vu l'echelle du projet (3 services Railway, tous a moi).
INTERNAL_PUSH_SECRET = os.environ.get("INTERNAL_PUSH_SECRET", "")

# Compte MT5 "Live" pilote depuis le site (2026-09-27, demande utilisateur : pouvoir changer de
# compte connecte - phase 1 -> phase 2 -> finance... - sans jamais retoucher Railway). Le mot de
# passe INVESTISSEUR transite une fois par ici (jamais stocke en clair, jamais renvoye au client -
# voir _encrypt_mt5_secret/_decrypt_mt5_secret) puis est transmis a mt5-notify-bridge, qui l'utilise
# pour se reconnecter au terminal - voir mt5-notify-bridge/README.md pour l'autre bout.
MT5_NOTIFY_BRIDGE_URL = os.environ.get("MT5_NOTIFY_BRIDGE_URL", "")
MT5_CREDENTIALS_KEY = os.environ.get("MT5_CREDENTIALS_KEY", "")

# Secret DEDIE pour l'Expert Advisor MT5 (2026-09-28, voir mt5-terminal/CHESTNotifier.mq5) -
# volontairement PAS le meme que INTERNAL_PUSH_SECRET : ce secret vit en clair dans un fichier .mq5
# a l'interieur du terminal Wine (mt5-terminal), une frontiere de confiance plus faible que les
# autres services Railway (tous notre propre code) - un secret dedie limite le degat si jamais ce
# terminal etait compromis un jour (l'attaquant ne recupererait que ce secret, pas celui utilise par
# tous les autres services).
MT5_EA_SECRET = os.environ.get("MT5_EA_SECRET", "")


def _encrypt_mt5_secret(plain: str) -> str:
    from cryptography.fernet import Fernet
    if not MT5_CREDENTIALS_KEY:
        raise RuntimeError("MT5_CREDENTIALS_KEY non configurée côté serveur.")
    return Fernet(MT5_CREDENTIALS_KEY.encode()).encrypt(plain.encode()).decode()


def _decrypt_mt5_secret(token: str) -> str:
    from cryptography.fernet import Fernet
    return Fernet(MT5_CREDENTIALS_KEY.encode()).decrypt(token.encode()).decode()

# Notification email a chaque nouvelle inscription en attente - toutes ces
# variables sont optionnelles ; s'il en manque une, on logue et on continue
# sans email plutot que de faire echouer l'inscription pour ca.
SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
SMTP_FROM = os.environ.get("SMTP_FROM", SMTP_USER)
NOTIFY_EMAIL_TO = os.environ.get("NOTIFY_EMAIL_TO", "")

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES
db_lock = threading.Lock()


def send_signup_notification(first_name: str, last_name: str, email: str) -> None:
    if not (SMTP_HOST and SMTP_USER and SMTP_PASSWORD and NOTIFY_EMAIL_TO):
        print("Notification email non envoyee : variables SMTP_*/NOTIFY_EMAIL_TO manquantes.")
        return
    try:
        msg = MIMEText(
            f"{first_name} {last_name} ({email}) vient de créer un compte sur CHEST (approuvé automatiquement).\n\n"
            "Ouvre admin-members.html si tu veux le consulter ou le bloquer."
        )
        msg["Subject"] = "CHEST — nouveau compte créé"
        msg["From"] = SMTP_FROM
        msg["To"] = NOTIFY_EMAIL_TO
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_FROM, [NOTIFY_EMAIL_TO], msg.as_string())
    except Exception as exc:
        # Une notification ratee ne doit jamais faire echouer l'inscription
        # elle-meme - l'admin verra quand meme la demande dans admin-members.html.
        print(f"Echec de l'envoi de la notification d'inscription : {exc}")


def get_db():
    db = getattr(g, "_db", None)
    if db is None:
        os.makedirs(DB_DIR, exist_ok=True)
        db = g._db = sqlite3.connect(DB_PATH)
        db.row_factory = sqlite3.Row
    return db


@app.teardown_appcontext
def close_db(_exc):
    db = getattr(g, "_db", None)
    if db is not None:
        db.close()


def init_db():
    os.makedirs(DB_DIR, exist_ok=True)
    with sqlite3.connect(DB_PATH) as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                first_name TEXT NOT NULL,
                last_name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                is_admin INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS school_entries (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL,
                data TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        db.execute("CREATE TABLE IF NOT EXISTS school_meta (key TEXT PRIMARY KEY, value TEXT)")
        # Surcharges admin des 5 vitrines fixes de la Newsletter (Welcome) -
        # meme principe que school_entries (une entree de meme id remplace le
        # contenu code en dur), id limite aux 5 cartes existantes (voir
        # BENTO_IDS) plutot que libre comme school_entries.
        db.execute("""
            CREATE TABLE IF NOT EXISTS bento_entries (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        # Synchro multi-appareils (2026-09-26, demande utilisateur : "mes données ne sont pas sur
        # mon téléphone") - miroir générique de tout ce qui vivait UNIQUEMENT dans le localStorage
        # du navigateur (comptes, familles, backtests, journal...), par utilisateur. Générique par
        # clé/valeur (jamais de schéma propre à chaque type de donnée) : voir js/sync-store.js pour
        # la liste exacte des clés synchronisées et pourquoi ce choix - le site n'a plus à changer
        # de code serveur si une future page ajoute une nouvelle clé localStorage à synchroniser.
        db.execute("""
            CREATE TABLE IF NOT EXISTS user_data (
                user_id INTEGER NOT NULL,
                key TEXT NOT NULL,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (user_id, key)
            )
        """)
        # Compte MT5 "Live" actuellement connecté (2026-09-27) - UNE seule ligne (id=1) : un seul
        # terminal MT5, donc un seul compte actif à la fois, par nature. Changer de compte
        # (nouvelle phase de challenge) écrase cette ligne - l'ancien compte n'est pas supprimé
        # d'ailleurs (voir chest_accounts côté client), juste plus "connecté".
        db.execute("""
            CREATE TABLE IF NOT EXISTS mt5_live_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                user_id INTEGER NOT NULL,
                dashboard_account_id TEXT NOT NULL,
                login TEXT NOT NULL,
                encrypted_password TEXT NOT NULL,
                server TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        # Dernier ticket de deal deja notifie PAR COMPTE (2026-09-28, voir POST /mt5/ea-notify) -
        # dedup cote serveur : l'Expert Advisor peut re-signaler le meme deal (redemarrage du
        # terminal, EA rattache a un chart...), on ne renvoie jamais deux fois la meme notif push.
        # Login en clé plutot qu'un id incremental : un seul compte connecte a la fois de toute
        # facon (voir mt5_live_state), mais garde l'historique si on revient sur un vieux compte.
        db.execute("""
            CREATE TABLE IF NOT EXISTS mt5_ea_last_ticket (
                login TEXT PRIMARY KEY,
                ticket INTEGER NOT NULL
            )
        """)
        # Abonnements aux notifications push (Web Push standard) - un utilisateur peut avoir
        # plusieurs appareils abonnés (PC + téléphone), chacun avec son propre "endpoint".
        db.execute("""
            CREATE TABLE IF NOT EXISTS push_subscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                endpoint TEXT NOT NULL UNIQUE,
                p256dh TEXT NOT NULL,
                auth TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        db.commit()


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def user_public(row):
    return {
        "id": row["id"],
        "firstName": row["first_name"],
        "lastName": row["last_name"],
        "email": row["email"],
        "status": row["status"],
        "isAdmin": bool(row["is_admin"]),
        "createdAt": row["created_at"],
    }


@app.after_request
def add_cors_headers(resp):
    # Donnees de comptes prives (mdp haches, jetons) mais la protection
    # reelle est cote serveur (validation, hachage) - CORS ouvert ici
    # controle seulement quelles origines peuvent LIRE la reponse fetch()
    # depuis un navigateur, pas qui peut atteindre le serveur. Meme
    # convention que calendar-bridge/server.py.
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, Range"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return resp


@app.route("/<path:_any>", methods=["OPTIONS"])
@app.route("/", methods=["OPTIONS"])
def cors_preflight(_any=None):
    return "", 204


def current_user():
    """Renvoie la ligne utilisateur associee au jeton "Authorization: Bearer
    <token>" de la requete, ou None si absent/invalide/expire."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[len("Bearer "):].strip()
    if not token:
        return None
    db = get_db()
    row = db.execute(
        "SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id "
        "WHERE sessions.token = ? AND sessions.expires_at > ?",
        (token, datetime.now(timezone.utc).isoformat()),
    ).fetchone()
    return row


@app.route("/signup", methods=["POST"])
def signup():
    body = request.get_json(silent=True) or {}
    first_name = (body.get("firstName") or "").strip()
    last_name = (body.get("lastName") or "").strip()
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""

    if not first_name or not last_name:
        return jsonify({"error": "Prénom et nom requis."}), 400
    if not EMAIL_RE.match(email):
        return jsonify({"error": "Adresse email invalide."}), 400
    # Minimum court (4) plutot que le standard 8+ : usage familial/proches de
    # confiance, pas un vrai SaaS public - meme convention que le code
    # d'acces existant du site (4 chiffres), retour direct utilisateur du
    # 2026-09-14 qui voulait explicitement un mot de passe court et memorable.
    if len(password) < 4:
        return jsonify({"error": "Le mot de passe doit faire au moins 4 caractères."}), 400

    db = get_db()
    with db_lock:
        existing = db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if existing:
            return jsonify({"error": "Un compte existe déjà avec cet email."}), 409

        is_first_user = db.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"] == 0
        # Inscription ouverte à tous (2026-09-23, décision utilisateur : « que n'importe qui puisse créer
        # son compte ») : approuvé automatiquement pour tout le monde, plus seulement le premier compte.
        # Seul le statut admin reste réservé au tout premier compte créé (le propriétaire du site) ; un
        # admin garde la main pour bloquer un compte a posteriori (POST /members/<id>/block), la porte
        # d'approbation manuelle (status='pending') n'est simplement plus utilisée à l'inscription.
        status = "approved"
        is_admin = 1 if is_first_user else 0

        db.execute(
            "INSERT INTO users (first_name, last_name, email, password_hash, status, is_admin, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (first_name, last_name, email, generate_password_hash(password), status, is_admin,
             datetime.now(timezone.utc).isoformat()),
        )
        db.commit()

    if not is_first_user:
        send_signup_notification(first_name, last_name, email)
        # Notification push aux admins (2026-09-26, demande utilisateur : "pour les nouveaux
        # membres oui avec le prénom etc.") - en plus de l'email existant ci-dessus, jamais a la
        # place : l'un ne remplace pas l'autre, l'admin peut ne pas avoir active les notifications.
        try:
            send_push_to_admins("Nouveau membre CHEST", f"{first_name} {last_name} vient de créer un compte ({email}).", "admin-members.html")
        except Exception:
            pass  # jamais bloquer l'inscription pour un souci de notification

    return jsonify({
        "status": status,
        "isAdmin": bool(is_admin),
        "message": (
            "Compte admin créé et approuvé automatiquement (premier compte du site)."
            if is_first_user else
            "Compte créé et approuvé — tu peux te connecter directement."
        ),
    }), 201


@app.route("/login", methods=["POST"])
def login():
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""

    db = get_db()
    row = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if not row or not check_password_hash(row["password_hash"], password):
        return jsonify({"error": "Email ou mot de passe incorrect."}), 401
    if row["status"] == "blocked":
        return jsonify({"error": "Ce compte a été bloqué par un administrateur."}), 403
    if row["status"] != "approved":
        return jsonify({"error": "Ce compte n'a pas encore été approuvé par un administrateur."}), 403

    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    with db_lock:
        db.execute(
            "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (token, row["id"], now.isoformat(), (now + timedelta(days=SESSION_LIFETIME_DAYS)).isoformat()),
        )
        db.commit()

    return jsonify({"token": token, "user": user_public(row)})


@app.route("/logout", methods=["POST"])
def logout():
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[len("Bearer "):].strip()
        db = get_db()
        with db_lock:
            db.execute("DELETE FROM sessions WHERE token = ?", (token,))
            db.commit()
    return jsonify({"ok": True})


@app.route("/me")
def me():
    user = current_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    return jsonify(user_public(user))


@app.route("/members")
def list_members():
    admin = current_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    db = get_db()
    rows = db.execute("SELECT * FROM users ORDER BY created_at DESC").fetchall()
    return jsonify({"members": [user_public(r) for r in rows]})


@app.route("/members/<int:member_id>/approve", methods=["POST"])
def approve_member(member_id):
    admin = current_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    db = get_db()
    with db_lock:
        db.execute("UPDATE users SET status = 'approved' WHERE id = ?", (member_id,))
        db.commit()
    return jsonify({"ok": True})


@app.route("/members/<int:member_id>/reject", methods=["POST"])
def reject_member(member_id):
    admin = current_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    db = get_db()
    with db_lock:
        db.execute("UPDATE users SET status = 'rejected' WHERE id = ?", (member_id,))
        db.commit()
    return jsonify({"ok": True})


# Bloquer un compte deja approuve - AJOUTE (2026-09-15, retour direct
# utilisateur : remplace le bouton "Reinitialiser le mot de passe" dans
# Gestion des membres, cette reinitialisation devant plutot etre une demarche
# en libre-service depuis la page de connexion, pas une action admin). Coupe
# l'acces immediatement (sessions invalidees) ; un compte bloque peut etre
# reapprouve plus tard via /approve, comme un compte refuse.
@app.route("/members/<int:member_id>/block", methods=["POST"])
def block_member(member_id):
    admin = current_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    db = get_db()
    with db_lock:
        db.execute("UPDATE users SET status = 'blocked' WHERE id = ?", (member_id,))
        db.execute("DELETE FROM sessions WHERE user_id = ?", (member_id,))
        db.commit()
    return jsonify({"ok": True})


# Reinitialisation de mot de passe - AJOUTE (2026-09-14, retour direct
# utilisateur : "un processus de reinitialisation si tu peux"). Pas d'envoi
# d'email (aucune infrastructure mail dans ce projet, usage familial/proches
# de confiance uniquement) : l'admin genere un nouveau mot de passe
# temporaire depuis la page "Gestion des membres" et le transmet lui-meme
# (message, en personne...) - suffisant pour un petit cercle de confiance,
# beaucoup plus simple qu'un vrai service d'emails transactionnels a mettre
# en place pour si peu d'utilisateurs. Toutes les sessions actives du compte
# sont invalidees pour forcer une reconnexion avec le nouveau mot de passe.
@app.route("/members/<int:member_id>/reset-password", methods=["POST"])
def reset_member_password(member_id):
    admin = current_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    db = get_db()
    target = db.execute("SELECT id FROM users WHERE id = ?", (member_id,)).fetchone()
    if not target:
        return jsonify({"error": "Compte introuvable."}), 404
    new_password = secrets.token_hex(3)  # 6 caracteres hex, facile a transmettre a l'oral
    with db_lock:
        db.execute("UPDATE users SET password_hash = ? WHERE id = ?",
                   (generate_password_hash(new_password), member_id))
        db.execute("DELETE FROM sessions WHERE user_id = ?", (member_id,))
        db.commit()
    return jsonify({"newPassword": new_password})


# ---------------------------------------------------------------- School
def approved_user():
    u = current_user()
    return u if u and u["status"] == "approved" else None


def entry_public(row):
    d = json.loads(row["data"])
    d["id"] = row["id"]
    d["kind"] = row["kind"]
    d["createdAt"] = row["created_at"]
    return d


def save_upload(field, entry_id):
    """Enregistre le fichier du champ multipart `field` sous un nom aléatoire. Renvoie un dict ou None."""
    f = request.files.get(field)
    if not f or not f.filename:
        return None
    os.makedirs(FILES_DIR, exist_ok=True)
    ext = os.path.splitext(secure_filename(f.filename))[1][:12].lower()
    key = secrets.token_urlsafe(12).replace("-", "a").replace("_", "b") + ext
    f.save(os.path.join(FILES_DIR, key))
    return {"key": key, "name": f.filename, "size": os.path.getsize(os.path.join(FILES_DIR, key)), "mime": f.mimetype or ""}


def delete_file(info):
    if info and info.get("key"):
        try:
            os.remove(os.path.join(FILES_DIR, os.path.basename(info["key"])))
        except OSError:
            pass


@app.route("/school")
def school_list():
    if not approved_user():
        return jsonify({"error": "Non connecté."}), 401
    db = get_db()
    rows = db.execute("SELECT * FROM school_entries ORDER BY created_at DESC").fetchall()
    seeded = db.execute("SELECT value FROM school_meta WHERE key = 'seeded'").fetchone()
    return jsonify({"entries": [entry_public(r) for r in rows], "seeded": bool(seeded)})


@app.route("/school/entries", methods=["POST"])
def school_save():
    admin = approved_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    if request.files or request.form:
        try:
            data = json.loads(request.form.get("data", "{}"))
        except ValueError:
            return jsonify({"error": "Données invalides."}), 400
    else:
        data = request.get_json(silent=True) or {}
    kind = data.get("kind")
    if kind not in ("item", "video", "cat"):
        return jsonify({"error": "Type d'élément inconnu."}), 400
    entry_id = str(data.get("id") or "e" + secrets.token_hex(6))
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,64}", entry_id):
        return jsonify({"error": "Identifiant invalide."}), 400
    now = datetime.now(timezone.utc).isoformat()
    with db_lock:
        db = get_db()
        row = db.execute("SELECT * FROM school_entries WHERE id = ?", (entry_id,)).fetchone()
        cur = json.loads(row["data"]) if row else {}
        new = dict(cur)
        for k, v in data.items():
            if k in ("id", "kind", "createdAt", "file", "thumb", "removeFile", "removeThumb"):
                continue
            new[k] = v
        # fichier principal et miniature : remplacés, retirés ou conservés
        up = save_upload("file", entry_id)
        if up:
            delete_file(cur.get("file"))
            new["file"] = up
        elif data.get("removeFile"):
            delete_file(cur.get("file"))
            new.pop("file", None)
        th = save_upload("thumb", entry_id)
        if th:
            delete_file(cur.get("thumb"))
            new["thumb"] = th
        elif data.get("removeThumb"):
            delete_file(cur.get("thumb"))
            new.pop("thumb", None)
        if row:
            db.execute("UPDATE school_entries SET data = ?, updated_at = ? WHERE id = ?", (json.dumps(new, ensure_ascii=False), now, entry_id))
        else:
            db.execute("INSERT INTO school_entries (id, kind, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                       (entry_id, kind, json.dumps(new, ensure_ascii=False), now, now))
        db.commit()
        row = db.execute("SELECT * FROM school_entries WHERE id = ?", (entry_id,)).fetchone()
    return jsonify(entry_public(row))


@app.route("/school/entries/<entry_id>/delete", methods=["POST"])
def school_delete(entry_id):
    admin = approved_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    with db_lock:
        db = get_db()
        row = db.execute("SELECT * FROM school_entries WHERE id = ?", (entry_id,)).fetchone()
        if row:
            d = json.loads(row["data"])
            delete_file(d.get("file"))
            delete_file(d.get("thumb"))
            db.execute("DELETE FROM school_entries WHERE id = ?", (entry_id,))
            db.commit()
    return jsonify({"ok": True})


@app.route("/school/seed", methods=["POST"])
def school_seed():
    """Premier remplissage (vidéos recommandées et rediffusions à compléter) : une seule fois."""
    admin = approved_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    body = request.get_json(silent=True) or {}
    now = datetime.now(timezone.utc).isoformat()
    with db_lock:
        db = get_db()
        if db.execute("SELECT 1 FROM school_meta WHERE key = 'seeded'").fetchone():
            return jsonify({"seeded": False})
        for e in body.get("entries", []):
            eid = str(e.get("id", ""))
            kind = e.get("kind")
            if kind not in ("item", "video", "cat") or not re.fullmatch(r"[A-Za-z0-9_.-]{1,64}", eid):
                continue
            data = {k: v for k, v in e.items() if k not in ("id", "kind", "createdAt")}
            db.execute("INSERT OR IGNORE INTO school_entries (id, kind, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                       (eid, kind, json.dumps(data, ensure_ascii=False), e.get("createdAt") or "1970-01-01T00:00:00+00:00", now))
        db.execute("INSERT OR REPLACE INTO school_meta (key, value) VALUES ('seeded', ?)", (now,))
        db.commit()
    return jsonify({"seeded": True})


@app.route("/school/files/<key>")
def school_file(key):
    # Noms aléatoires impossibles à deviner : la liste des fichiers n'est visible que des membres connectés.
    return send_from_directory(FILES_DIR, os.path.basename(key), conditional=True, max_age=3600)


# Les 5 vitrines fixes de la Newsletter (welcome.js/app.html, data-bento-id) -
# id volontairement limité à cette liste (pas de créer/supprimer une carte
# depuis ce CMS, contrairement à School).
BENTO_IDS = {"hero", "scanner", "founder", "menu", "school"}


@app.route("/bento")
def bento_list():
    if not approved_user():
        return jsonify({"error": "Non connecté."}), 401
    db = get_db()
    rows = db.execute("SELECT * FROM bento_entries").fetchall()
    entries = {}
    for r in rows:
        d = json.loads(r["data"])
        d["updatedAt"] = r["updated_at"]
        entries[r["id"]] = d
    return jsonify({"entries": entries})


@app.route("/bento/<bento_id>", methods=["POST"])
def bento_save(bento_id):
    admin = approved_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    if bento_id not in BENTO_IDS:
        return jsonify({"error": "Carte inconnue."}), 404
    now = datetime.now(timezone.utc).isoformat()
    with db_lock:
        db = get_db()
        row = db.execute("SELECT * FROM bento_entries WHERE id = ?", (bento_id,)).fetchone()
        cur = json.loads(row["data"]) if row else {}
        new = dict(cur)
        if "title" in request.form:
            title = request.form.get("title", "").strip()
            if title:
                new["title"] = title
            else:
                new.pop("title", None)
        if "badgeEnabled" in request.form:
            new["badgeEnabled"] = request.form.get("badgeEnabled") == "1"
        if "position" in request.form:
            raw_pos = request.form.get("position", "").strip()
            if raw_pos:
                try:
                    pos = json.loads(raw_pos)
                except ValueError:
                    return jsonify({"error": "Position invalide."}), 400
                if not isinstance(pos, dict) or not all(isinstance(v, (int, float)) for v in pos.values()):
                    return jsonify({"error": "Position invalide."}), 400
                new["position"] = pos
            else:
                new.pop("position", None)
        up = save_upload("image", bento_id)
        if up:
            delete_file(cur.get("image"))
            new["image"] = up
        elif request.form.get("removeImage"):
            delete_file(cur.get("image"))
            new.pop("image", None)
        if row:
            db.execute("UPDATE bento_entries SET data = ?, updated_at = ? WHERE id = ?", (json.dumps(new, ensure_ascii=False), now, bento_id))
        else:
            db.execute("INSERT INTO bento_entries (id, data, updated_at) VALUES (?, ?, ?)", (bento_id, json.dumps(new, ensure_ascii=False), now))
        db.commit()
        row = db.execute("SELECT * FROM bento_entries WHERE id = ?", (bento_id,)).fetchone()
    d = json.loads(row["data"])
    d["id"] = bento_id
    d["updatedAt"] = row["updated_at"]
    return jsonify(d)


@app.route("/bento/<bento_id>/reset", methods=["POST"])
def bento_reset(bento_id):
    admin = approved_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    with db_lock:
        db = get_db()
        row = db.execute("SELECT * FROM bento_entries WHERE id = ?", (bento_id,)).fetchone()
        if row:
            delete_file(json.loads(row["data"]).get("image"))
            db.execute("DELETE FROM bento_entries WHERE id = ?", (bento_id,))
            db.commit()
    return jsonify({"ok": True})


@app.route("/scanners")
def scanners_list():
    # Reserve aux membres approuves (pas seulement admin) : c'est le contenu de la page
    # Strategies, deja visible de tout membre connecte cote UI - seule la source Pine elle-meme
    # ne doit jamais sortir d'une session authentifiee. Fichier absent (pas encore restaure sur ce
    # serveur) -> objet vide, jamais une erreur qui casserait le rendu de la page.
    if not approved_user():
        return jsonify({"error": "Non connecté."}), 401
    try:
        with open(SCANNERS_SECRET_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        data = {}
    return jsonify({"scanners": data})


@app.route("/scanners/restore", methods=["POST"])
def scanners_restore():
    # Seule façon de poser scanners_secret.json sur le Volume Railway : ce fichier n'est JAMAIS
    # commité (voir SCANNERS_SECRET_PATH plus haut), donc rien ne le déploie automatiquement -
    # l'admin l'envoie une fois lui-même (depuis sa machine, jamais via git) avec par ex. :
    # curl -X POST <url>/scanners/restore -H "Authorization: Bearer <token>" \
    #      -H "Content-Type: application/json" --data-binary @scanners_secret.json
    admin = approved_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"error": "JSON invalide."}), 400
    with db_lock:
        with open(SCANNERS_SECRET_PATH, "w", encoding="utf-8") as f:
            json.dump(body, f, ensure_ascii=False)
    return jsonify({"ok": True, "scanners": list(body.keys())})


@app.route("/twelvedata/<endpoint>")
def twelvedata_proxy(endpoint):
    # Relais pour api.twelvedata.com : le frontend (scanner-chart.js, berich-chart.js, calendar.js,
    # lot-calculator.js) appelait cette API directement avec la clé dans l'URL - lisible par
    # n'importe qui (réseau, code source), et de toute façon absente en production puisqu'elle
    # vivait dans js/config.local.js (gitignoré, jamais déployé). Réservé aux membres approuvés,
    # comme /scanners : ce sont des fonctionnalités du site, pas un accès public à l'API.
    if not approved_user():
        return jsonify({"error": "Non connecté."}), 401
    if endpoint not in TWELVE_DATA_ALLOWED_ENDPOINTS:
        return jsonify({"error": "Point d'accès inconnu."}), 404
    if not TWELVE_DATA_API_KEY:
        return jsonify({"error": "Clé Twelve Data non configurée côté serveur (variable TWELVE_DATA_API_KEY)."}), 503
    params = request.args.to_dict()
    params.pop("apikey", None)  # jamais une clé fournie par le client - toujours celle du serveur
    params["apikey"] = TWELVE_DATA_API_KEY
    url = "https://api.twelvedata.com/" + endpoint + "?" + urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            body = resp.read()
            status = resp.status
    except urllib.error.HTTPError as e:
        body = e.read()
        status = e.code
    except urllib.error.URLError as e:
        return jsonify({"error": f"Twelve Data injoignable : {e.reason}"}), 502
    return app.response_class(body, status=status, mimetype="application/json")


# ---------------------------------------------------------------- Synchro multi-appareils
@app.route("/sync")
def sync_get():
    user = approved_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    db = get_db()
    rows = db.execute("SELECT key, value FROM user_data WHERE user_id = ?", (user["id"],)).fetchall()
    return jsonify({"data": {r["key"]: r["value"] for r in rows}})


@app.route("/sync", methods=["POST"])
def sync_post():
    user = approved_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    body = request.get_json(silent=True) or {}
    data = body.get("data")
    if not isinstance(data, dict):
        return jsonify({"error": "JSON invalide."}), 400
    now = datetime.now(timezone.utc).isoformat()
    with db_lock:
        db = get_db()
        for key, value in data.items():
            if not isinstance(key, str) or not isinstance(value, str) or len(key) > 128:
                continue
            db.execute(
                "INSERT INTO user_data (user_id, key, value, updated_at) VALUES (?, ?, ?, ?) "
                "ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
                (user["id"], key, value, now),
            )
        db.commit()
    return jsonify({"ok": True})


# ---------------------------------------------------------------- Notifications push
@app.route("/push/subscribe", methods=["POST"])
def push_subscribe():
    user = approved_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    body = request.get_json(silent=True) or {}
    endpoint = body.get("endpoint")
    keys = body.get("keys") or {}
    p256dh, auth = keys.get("p256dh"), keys.get("auth")
    if not endpoint or not p256dh or not auth:
        return jsonify({"error": "Abonnement incomplet."}), 400
    now = datetime.now(timezone.utc).isoformat()
    with db_lock:
        db = get_db()
        db.execute(
            "INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?) "
            "ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth",
            (user["id"], endpoint, p256dh, auth, now),
        )
        db.commit()
    return jsonify({"ok": True})


@app.route("/push/unsubscribe", methods=["POST"])
def push_unsubscribe():
    user = approved_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    body = request.get_json(silent=True) or {}
    endpoint = body.get("endpoint")
    if not endpoint:
        return jsonify({"error": "endpoint manquant."}), 400
    with db_lock:
        db = get_db()
        db.execute("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?", (endpoint, user["id"]))
        db.commit()
    return jsonify({"ok": True})


def _send_push_to_subscriptions(subs, title, body_text, url=None):
    """Envoie a une liste de lignes push_subscriptions (deja chargees) ; retire tout abonnement
    expire/invalide (410 Gone, cas normal quand un navigateur se desinscrit sans le dire) plutot
    que de re-essayer indefiniment dessus."""
    if not VAPID_PRIVATE_KEY:
        return {"sent": 0, "error": "VAPID_PRIVATE_KEY non configurée côté serveur."}
    payload = json.dumps({"title": title, "body": body_text, "url": url or "app.html"})
    sent, dead, last_error = 0, [], None
    for sub in subs:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub["endpoint"],
                    "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
                },
                data=payload,
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={"sub": VAPID_CLAIM_EMAIL},
            )
            sent += 1
        except WebPushException as e:
            if e.response is not None and e.response.status_code in (404, 410):
                dead.append(sub["endpoint"])
            else:
                last_error = str(e)
        except Exception as e:
            # Ne JAMAIS laisser une exception (ex. cle VAPID_PRIVATE_KEY malformee - piege frequent :
            # les retours a la ligne du PEM perdus en collant dans le champ Railway) remonter telle
            # quelle : Flask renverrait alors une page d'erreur HTML au lieu de JSON, et le bouton
            # "Envoyer un test" d'account.html plante sur "Unexpected token" en essayant de la
            # parser (retour utilisateur, 2026-09-26). Toujours répondre en JSON, avec le detail.
            last_error = str(e)
    if dead:
        with db_lock:
            get_db().executemany("DELETE FROM push_subscriptions WHERE endpoint = ?", [(e,) for e in dead])
            get_db().commit()
    result = {"sent": sent, "removed": len(dead)}
    if sent == 0 and last_error:
        result["error"] = last_error
    return result


def send_push_to_user(user_id, title, body_text, url=None):
    db = get_db()
    subs = db.execute("SELECT * FROM push_subscriptions WHERE user_id = ?", (user_id,)).fetchall()
    return _send_push_to_subscriptions(subs, title, body_text, url)


def send_push_to_all(title, body_text, url=None):
    """A TOUS les membres abonnes (scanners/calendrier concernent tout le monde, pas un compte en
    particulier - contrairement a une eventuelle alerte propre a UN compte propfirm)."""
    db = get_db()
    subs = db.execute("SELECT * FROM push_subscriptions").fetchall()
    return _send_push_to_subscriptions(subs, title, body_text, url)


def send_push_to_admins(title, body_text, url=None):
    db = get_db()
    subs = db.execute(
        "SELECT push_subscriptions.* FROM push_subscriptions "
        "JOIN users ON users.id = push_subscriptions.user_id WHERE users.is_admin = 1"
    ).fetchall()
    return _send_push_to_subscriptions(subs, title, body_text, url)


@app.route("/push/broadcast", methods=["POST"])
def push_broadcast():
    # Reserve aux AUTRES SERVICES Railway (berich-bridge, calendar-bridge) - pas de session
    # utilisateur cote webhook/tache de fond, donc un secret partage plutot qu'un jeton Bearer (voir
    # INTERNAL_PUSH_SECRET). Declencheurs reels : signal BERICH detecte/cloture (TP/SL), grosse
    # annonce du calendrier qui approche - voir berich-bridge/server.py et
    # calendar-bridge/fetch_calendar.py pour l'appel.
    if not INTERNAL_PUSH_SECRET or request.headers.get("X-Internal-Secret") != INTERNAL_PUSH_SECRET:
        return jsonify({"error": "Non autorisé."}), 401
    body = request.get_json(silent=True) or {}
    title = (body.get("title") or "CHEST").strip()
    text = (body.get("body") or "").strip()
    url = body.get("url") or "app.html"
    result = send_push_to_all(title, text, url)
    return jsonify(result)


@app.route("/push/send", methods=["POST"])
def push_send():
    # Reserve admin : sert a TESTER l'envoi (voir bouton "Notifications" dans account.html).
    admin = approved_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    body = request.get_json(silent=True) or {}
    title = (body.get("title") or "CHEST").strip()
    text = (body.get("body") or "").strip()
    url = body.get("url") or "app.html"
    target_user_id = body.get("userId") or admin["id"]
    result = send_push_to_user(target_user_id, title, text, url)
    return jsonify(result)


@app.route("/mt5/connect", methods=["POST"])
def mt5_connect():
    # Reserve admin (2026-09-27, demande utilisateur) : un seul terminal MT5 partage entre tous -
    # changer de compte live affecte tout le monde, seul l'admin peut le declencher. Voir
    # site/dashboard.html "Compte Live" et mt5-notify-bridge/README.md pour l'autre bout.
    admin = approved_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    if not MT5_NOTIFY_BRIDGE_URL or not INTERNAL_PUSH_SECRET or not MT5_CREDENTIALS_KEY:
        return jsonify({"error": "Compte Live pas encore configuré côté serveur (variables Railway manquantes)."}), 503
    body = request.get_json(silent=True) or {}
    login = str(body.get("login") or "").strip()
    password = str(body.get("investorPassword") or "")
    server_name = str(body.get("server") or "").strip()
    dashboard_account_id = str(body.get("dashboardAccountId") or "").strip()
    if not login or not password or not server_name or not dashboard_account_id:
        return jsonify({"error": "login, investorPassword, server et dashboardAccountId sont requis."}), 400

    # Le terminal doit confirmer la connexion AVANT qu'on n'écrase l'ancien compte enregistré - si
    # mt5-notify-bridge échoue (mauvais mot de passe, serveur introuvable...), on garde l'ancien
    # état plutôt que de perdre la trace du compte qui marchait.
    try:
        req = urllib.request.Request(
            MT5_NOTIFY_BRIDGE_URL.rstrip("/") + "/switch-account",
            data=json.dumps({
                "login": login, "password": password, "server": server_name,
                "dashboardAccountId": dashboard_account_id,
            }).encode("utf-8"),
            headers={"Content-Type": "application/json", "X-Internal-Secret": INTERNAL_PUSH_SECRET},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            switch_result = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        return jsonify({"error": f"Connexion au terminal MT5 refusée : {detail}"}), 502
    except (urllib.error.URLError, OSError, TimeoutError) as e:
        return jsonify({"error": f"Terminal MT5 injoignable : {e}"}), 502

    encrypted = _encrypt_mt5_secret(password)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with db_lock:
        db = get_db()
        db.execute(
            "INSERT INTO mt5_live_state (id, user_id, dashboard_account_id, login, encrypted_password, server, updated_at) "
            "VALUES (1, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id, dashboard_account_id=excluded.dashboard_account_id, "
            "login=excluded.login, encrypted_password=excluded.encrypted_password, server=excluded.server, updated_at=excluded.updated_at",
            (admin["id"], dashboard_account_id, login, encrypted, server_name, now),
        )
        db.commit()
    return jsonify({"ok": True, "accountInfo": switch_result.get("accountInfo")})


@app.route("/mt5/status")
def mt5_status():
    user = approved_user()
    if not user:
        return jsonify({"error": "Non autorisé."}), 401
    with db_lock:
        row = get_db().execute("SELECT dashboard_account_id, login, server, updated_at FROM mt5_live_state WHERE id = 1").fetchone()
    if not row:
        return jsonify({"connected": False})
    return jsonify({
        "connected": True,
        "dashboardAccountId": row["dashboard_account_id"],
        "login": row["login"],
        "server": row["server"],
        "updatedAt": row["updated_at"],
    })


# ENUM_DEAL_REASON (doc officielle MQL5, jamais devine) :
# https://www.mql5.com/en/docs/constants/tradingconstants/dealproperties
_DEAL_REASON_SL = 4
_DEAL_REASON_TP = 5
_DEAL_REASON_SO = 6


def _format_mt5_close_message(deal_type, symbol, pnl, reason):
    side = "achat" if deal_type == 0 else "vente"
    win = pnl > 0
    if reason == _DEAL_REASON_TP:
        cause = "TP"
    elif reason == _DEAL_REASON_SL:
        cause = "SL"
    elif reason == _DEAL_REASON_SO:
        cause = "Stop Out"
    else:
        cause = "clôture manuelle"
    emoji = "🎉" if win else "❌"
    sign = "+" if pnl >= 0 else ""
    title = f"{symbol} — {cause}"
    body = f"Ton {side} sur {symbol} a {cause} de {sign}{pnl:.2f}$ {emoji}"
    return title, body


@app.route("/mt5/ea-notify", methods=["POST"])
def mt5_ea_notify():
    # Appele DIRECTEMENT par l'Expert Advisor MQL5 (WebRequest()) qui tourne DANS le terminal MT5
    # (mt5-terminal), a chaque cloture de position detectee (OnTradeTransaction, evenement natif -
    # voir mt5-terminal/CHESTNotifier.mq5) - remplace l'ancien sondage externe de
    # mt5-notify-bridge (2026-09-28, voir CLAUDE.md "Plan EA"). Secret DEDIE (MT5_EA_SECRET, pas
    # INTERNAL_PUSH_SECRET) car ce code vit dans un fichier a l'interieur du terminal Wine, une
    # frontiere de confiance plus faible que les autres services Railway.
    if not MT5_EA_SECRET or request.headers.get("X-EA-Secret") != MT5_EA_SECRET:
        return jsonify({"error": "Non autorisé."}), 401
    body = request.get_json(silent=True) or {}
    try:
        login = str(body["login"])
        ticket = int(body["ticket"])
        symbol = str(body["symbol"])
        deal_type = int(body["type"])
        profit = float(body["profit"])
        commission = float(body.get("commission", 0))
        swap = float(body.get("swap", 0))
        reason = int(body.get("reason", -1))
    except (KeyError, ValueError, TypeError):
        return jsonify({"error": "Payload invalide (login, ticket, symbol, type, profit requis)."}), 400

    with db_lock:
        db = get_db()
        row = db.execute("SELECT ticket FROM mt5_ea_last_ticket WHERE login = ?", (login,)).fetchone()
        last_ticket = row["ticket"] if row else 0
        if ticket <= last_ticket:
            return jsonify({"ok": True, "skipped": True})  # deja notifie - dedup
        db.execute(
            "INSERT INTO mt5_ea_last_ticket (login, ticket) VALUES (?, ?) "
            "ON CONFLICT(login) DO UPDATE SET ticket = excluded.ticket",
            (login, ticket),
        )
        db.commit()

    # P&L reel = profit + commission + swap (ce qui a vraiment bouge sur le solde), pas juste le
    # "profit" brut - coherent avec ce que l'utilisateur voit sur son releve MT5.
    pnl = profit + commission + swap
    title, body_text = _format_mt5_close_message(deal_type, symbol, pnl, reason)
    result = send_push_to_all(title, body_text, "dashboard.html")
    return jsonify({"ok": True, **result})


@app.route("/health")
def health():
    return jsonify({"ok": True})


class NoKeepAliveHandler(WSGIRequestHandler):
    # HTTP/1.1 (defaut de WSGIRequestHandler) => keep-alive : avec
    # threaded=False, une connexion laissee ouverte par un navigateur (fetch()
    # garde la connexion vivante par defaut) bloque TOUTES les requetes
    # suivantes indefiniment - le serveur mono-thread reste bloque a lire sur
    # ce socket au lieu d'accepter la connexion suivante. Constate en direct
    # le 2026-09-15 (un curl se bloquait des qu'un onglet avait deja charge
    # admin-members.html) - meme bug deja rencontre et corrige sur le serveur
    # de dev statique du site (site/_dev_server.py). HTTP/1.0 force une
    # connexion par requete, donc plus de blocage inter-clients.
    protocol_version = "HTTP/1.0"


if __name__ == "__main__":
    init_db()
    # threaded=True : threaded=False bloquait TOUTES les requetes suivantes
    # des qu'un client (navigateur avec keep-alive) laissait une connexion
    # ouverte - constate en direct le 2026-09-15, meme avec NoKeepAliveHandler
    # applique (le blocage persistait, cause exacte non confirmee - peut-etre
    # request_handler non repris par cette version de Flask/Werkzeug). Le
    # risque documente plus haut (epuisement de threads sur calendar-bridge
    # apres plusieurs heures, du a Playwright/Chrome tournant en continu) ne
    # s'applique pas de la meme facon ici : accounts-bridge ne fait que de
    # courtes requetes SQLite, sans processus lourd de longue duree.
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)), threaded=True, request_handler=NoKeepAliveHandler)
