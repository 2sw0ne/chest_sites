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
import time
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
        # Comptes rendus semaine/mois deja envoyes (2026-10-01, voir check_digests) - une ligne par
        # periode, pour ne jamais renvoyer le meme compte rendu apres un redemarrage.
        db.execute("CREATE TABLE IF NOT EXISTS push_digest_log (period_key TEXT PRIMARY KEY, sent_at TEXT)")
        # Abonnements aux notifications push (Web Push standard) - un utilisateur peut avoir
        # plusieurs appareils abonnés (PC + téléphone), chacun avec son propre "endpoint".
        # Backtests partagés entre membres : une copie en attente dans la boîte du destinataire, supprimée dès qu'il l'a reçue.
        db.execute("""
            CREATE TABLE IF NOT EXISTS shared_backtests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                from_user INTEGER NOT NULL,
                to_user INTEGER NOT NULL,
                payload TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS alert_rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                pairs TEXT NOT NULL,
                timeframes TEXT NOT NULL,
                scanners TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
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
        # Comptes "VPS personnel" (2026-10-13) - un membre qui fait tourner MT5 sur SON PROPRE VPS
        # (voir vps-guide.html) installe un petit EA (CHESTAccountPush.mq5) qui pousse ici un
        # instantané (solde/équité/marge/positions ouvertes) toutes les ~30s. `id` (32 hex générés
        # par /vps/register) joue le rôle de secret non devinable pour /vps/push/<id> - l'EA n'a pas
        # de session membre (même principe que GET /school/files/<key>). Contrairement à Myfxbook,
        # pas d'historique de trades ici (l'EA ne pousse qu'un instantané, pas le journal complet) -
        # limite assumée et dite à l'utilisateur, voir vps-guide.html.
        db.execute("""
            CREATE TABLE IF NOT EXISTS vps_accounts (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                label TEXT NOT NULL,
                created_at TEXT NOT NULL,
                last_push_at TEXT,
                last_data TEXT
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
            new_member_text = f"Nouveau membre : {first_name} {last_name} ({email})"
            send_typed_push("new_member", "admin-members.html", lambda db, uid, p: new_member_text, admins_only=True)
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


# ---------------------------------------------------------------- Partage de backtests entre membres
@app.route("/members/search")
def members_search():
    """Recherche d'un membre approuvé par prénom / nom, pour lui envoyer un backtest. Ne renvoie jamais l'e-mail."""
    user = approved_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    q = (request.args.get("q") or "").strip().lower()
    if len(q) < 2:
        return jsonify({"members": []})
    db = get_db()
    rows = db.execute(
        "SELECT id, first_name, last_name FROM users WHERE status = 'approved' AND id != ? ORDER BY first_name, last_name",
        (user["id"],),
    ).fetchall()
    words = q.split()
    out = []
    for r in rows:
        full = f"{r['first_name']} {r['last_name']}".lower()
        if all(w in full for w in words):
            out.append({"id": r["id"], "name": f"{r['first_name']} {r['last_name']}".strip()})
        if len(out) >= 8:
            break
    return jsonify({"members": out})


@app.route("/backtests/share", methods=["POST"])
def backtests_share():
    user = approved_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    body = request.get_json(silent=True) or {}
    to_id = body.get("toUserId")
    bt = body.get("backtest")
    if not isinstance(to_id, int) or not isinstance(bt, dict) or not isinstance(bt.get("trades"), list):
        return jsonify({"error": "Demande invalide."}), 400
    db = get_db()
    dest = db.execute("SELECT id, first_name, last_name FROM users WHERE id = ? AND status = 'approved'", (to_id,)).fetchone()
    if not dest or dest["id"] == user["id"]:
        return jsonify({"error": "Membre introuvable."}), 404
    # On ne garde que ce qui décrit le backtest : jamais d'identifiant local ni de réglage de partage d'origine.
    keep = {k: bt.get(k) for k in ("title", "description", "capital", "pfCapital", "cp", "pf", "trades")}
    payload = json.dumps({
        "backtest": keep,
        "from": {"name": f"{user['first_name']} {user['last_name']}".strip()},
    }, separators=(",", ":"))
    if len(payload) > 40 * 1024 * 1024:
        return jsonify({"error": "Backtest trop volumineux pour être partagé."}), 413
    with db_lock:
        db.execute(
            "INSERT INTO shared_backtests (from_user, to_user, payload, created_at) VALUES (?, ?, ?, ?)",
            (user["id"], dest["id"], payload, datetime.now(timezone.utc).isoformat()),
        )
        db.commit()
    return jsonify({"ok": True, "to": f"{dest['first_name']} {dest['last_name']}".strip()})


@app.route("/backtests/inbox")
def backtests_inbox():
    """Backtests reçus et pas encore récupérés par ce membre."""
    user = approved_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    db = get_db()
    rows = db.execute("SELECT id, payload, created_at FROM shared_backtests WHERE to_user = ? ORDER BY id", (user["id"],)).fetchall()
    items = []
    for r in rows:
        try:
            d = json.loads(r["payload"])
        except ValueError:
            continue
        items.append({"id": r["id"], "from": d.get("from"), "backtest": d.get("backtest"), "createdAt": r["created_at"]})
    return jsonify({"items": items})


@app.route("/backtests/inbox/<int:item_id>/ack", methods=["POST"])
def backtests_inbox_ack(item_id):
    user = approved_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    with db_lock:
        db = get_db()
        db.execute("DELETE FROM shared_backtests WHERE id = ? AND to_user = ?", (item_id, user["id"]))
        db.commit()
    return jsonify({"ok": True})


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
    # 2026-10-06 : plus jamais de texte Pine ici. Les scanners sont calculés côté serveur
    # (/scanners/model) ; cette route ne renvoie plus rien de sensible.
    if not approved_user():
        return jsonify({"error": "Non connecté."}), 401
    return jsonify({"scanners": {}})


@app.route("/scanners/restore", methods=["POST"])
def scanners_restore():
    # Admin uniquement. Pose les scripts Pine sur le volume du service de calcul (scanner-server),
    # jamais dans git ni sur accounts-bridge. Corps attendu : {"manifest": {...}, "files": {...}}.
    # curl -X POST <url>/scanners/restore -H "Authorization: Bearer <token>"     #      -H "Content-Type: application/json" --data-binary @scanners_bundle.json
    admin = approved_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    if not SCANNER_SERVER_URL or not SCANNER_INTERNAL_SECRET:
        return jsonify({"error": "Service de calcul non configuré."}), 503
    body = request.get_json(silent=True)
    if not isinstance(body, dict) or not isinstance(body.get("files"), dict) or not isinstance(body.get("manifest"), dict):
        return jsonify({"error": "JSON invalide (attendu : manifest + files)."}), 400
    req = urllib.request.Request(
        SCANNER_SERVER_URL.rstrip("/") + "/restore",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "X-Internal-Secret": SCANNER_INTERNAL_SECRET},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return app.response_class(resp.read(), mimetype="application/json")
    except Exception:
        return jsonify({"error": "Restauration impossible, service de calcul injoignable."}), 503


# Scanners calcules cote serveur (2026-10-06) : le texte Pine ne sort jamais du service de calcul.
# Le navigateur n'obtient que le modele calcule, uniquement pour un membre approuve.
SCANNER_SERVER_URL = os.environ.get("SCANNER_SERVER_URL", "")
SCANNER_INTERNAL_SECRET = os.environ.get("SCANNER_INTERNAL_SECRET", "")


@app.route("/scanners/model")
def scanners_model():
    if not approved_user():
        return jsonify({"error": "Non connecté."}), 401
    script = request.args.get("script", "")
    if not re.fullmatch(r"[a-z0-9-]{1,40}", script):
        return jsonify({"error": "Scanner inconnu."}), 404
    if not SCANNER_SERVER_URL:
        return jsonify({"error": "Service de calcul non configuré."}), 503
    symbol = request.args.get("symbol", "XAUUSD")
    tf = request.args.get("tf", "5")
    if not re.fullmatch(r"[A-Z]{6}", symbol) or tf not in ALERT_TF_LABEL:
        return jsonify({"error": "Paramètres invalides."}), 400
    url = SCANNER_SERVER_URL.rstrip("/") + "/data?" + urllib.parse.urlencode({"script": script, "symbol": symbol, "tf": tf})
    try:
        with urllib.request.urlopen(url, timeout=120) as resp:
            return app.response_class(resp.read(), mimetype="application/json")
    except Exception:
        return jsonify({"error": "Scanner en attente."}), 503


# ---- Alertes scanners (2026-10-06) : règles par membre (paires, unités de temps, scanners) ----
# Le service de calcul détecte les opportunités et appelle /alerts/dispatch ; ici on choisit
# les membres concernés et on leur envoie une notification avec l'icône du scanner.
ALERT_SCANNERS = {
    "algomni": ("Algomni", "assets/logo-algomni.png"),
    "swyper-v6": ("Swyper", "assets/logo-swyper-v2.webp"),
    "wolfx": ("Wolfx", "assets/logo-wolfx.png"),
    "nexus": ("NEXUS", "assets/logo-nexus.webp"),
    "pivot": ("Pivot", "assets/logo-pivot.png"),
    "harmonics": ("Harmonics", "assets/logo-harmonics.webp"),
    "blood": ("Blood", "assets/logo-blood.webp"),
    "pulse": ("Pulse", "assets/logo-pulse.webp"),
    "wave": ("Wave", "assets/logo-wave.webp"),
    "stars": ("Stars", "assets/logo-stars.webp"),
    "supernova": ("Supernova", "assets/logo-supernova.webp"),
}
ALERT_TF_LABEL = {"1": "M1", "5": "M5", "15": "M15", "30": "M30", "60": "H1", "240": "H4", "D": "D1"}
SITE_URL = os.environ.get("SITE_URL", "https://your-chest.vercel.app").rstrip("/")


def _scanner_call(path, method="GET", body=None):
    if not SCANNER_SERVER_URL:
        return None
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json", "X-Internal-Secret": SCANNER_INTERNAL_SECRET}
    req = urllib.request.Request(SCANNER_SERVER_URL.rstrip("/") + path, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _rule_out(row):
    return {
        "id": row["id"],
        "pairs": json.loads(row["pairs"]),
        "timeframes": json.loads(row["timeframes"]),
        "scanners": json.loads(row["scanners"]),
        "createdAt": row["created_at"],
    }


@app.route("/alerts/rules", methods=["GET"])
def alerts_rules_list():
    user = approved_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    rows = get_db().execute("SELECT * FROM alert_rules WHERE user_id = ? ORDER BY id DESC", (user["id"],)).fetchall()
    return jsonify({"rules": [_rule_out(r) for r in rows]})


@app.route("/alerts/rules", methods=["POST"])
def alerts_rules_save():
    user = approved_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    body = request.get_json(silent=True) or {}
    pairs = [p for p in (body.get("pairs") or []) if isinstance(p, str) and re.fullmatch(r"[A-Z]{6}", p)]
    tfs = [t for t in (body.get("timeframes") or []) if t in ALERT_TF_LABEL]
    scanners = [sc for sc in (body.get("scanners") or []) if sc in ALERT_SCANNERS]
    if not pairs or not tfs or not scanners:
        return jsonify({"error": "Choisis au moins une paire, une unité de temps et un scanner."}), 400
    pairs, tfs, scanners = sorted(set(pairs)), sorted(set(tfs)), sorted(set(scanners))
    db = get_db()
    rid = body.get("id")
    with db_lock:
        if isinstance(rid, int):
            cur = db.execute("UPDATE alert_rules SET pairs=?, timeframes=?, scanners=? WHERE id=? AND user_id=?",
                             (json.dumps(pairs), json.dumps(tfs), json.dumps(scanners), rid, user["id"]))
            if cur.rowcount == 0:
                return jsonify({"error": "Règle introuvable."}), 404
        else:
            cur = db.execute("INSERT INTO alert_rules (user_id, pairs, timeframes, scanners, created_at) VALUES (?, ?, ?, ?, ?)",
                             (user["id"], json.dumps(pairs), json.dumps(tfs), json.dumps(scanners), datetime.now(timezone.utc).isoformat()))
            rid = cur.lastrowid
        db.commit()
    try:
        _scanner_call("/watch", "POST", {"combos": [{"symbol": p, "tf": t} for p in pairs for t in tfs]})
    except Exception:
        pass  # le suivi se remettra en place au prochain enregistrement
    row = db.execute("SELECT * FROM alert_rules WHERE id = ?", (rid,)).fetchone()
    return jsonify({"rule": _rule_out(row)})


@app.route("/alerts/rules/<int:rid>", methods=["DELETE"])
def alerts_rules_delete(rid):
    user = approved_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    with db_lock:
        cur = get_db().execute("DELETE FROM alert_rules WHERE id = ? AND user_id = ?", (rid, user["id"]))
        get_db().commit()
    return jsonify({"ok": cur.rowcount > 0})


@app.route("/alerts/signals")
def alerts_signals():
    if not approved_user():
        return jsonify({"error": "Non connecté."}), 401
    symbol = request.args.get("symbol", "")
    tf = request.args.get("tf", "")
    if not re.fullmatch(r"[A-Z]{6}", symbol) or tf not in ALERT_TF_LABEL:
        return jsonify({"error": "Paramètres invalides."}), 400
    try:
        return jsonify(_scanner_call("/signals?" + urllib.parse.urlencode({"symbol": symbol, "tf": tf})))
    except Exception:
        return jsonify({"opportunities": []})


@app.route("/alerts/dispatch", methods=["POST"])
def alerts_dispatch():
    # Appelé par scanner-server (secret interne) à chaque nouvelle opportunité détectée.
    if not SCANNER_INTERNAL_SECRET or request.headers.get("X-Internal-Secret") != SCANNER_INTERNAL_SECRET:
        return jsonify({"error": "non autorisé"}), 401
    ev = request.get_json(silent=True) or {}
    scanner, symbol, tf, side = ev.get("scanner"), ev.get("symbol"), ev.get("tf"), ev.get("side")
    if scanner not in ALERT_SCANNERS or tf not in ALERT_TF_LABEL or side not in ("buy", "sell") or not re.fullmatch(r"[A-Z]{6}", str(symbol)):
        return jsonify({"error": "événement invalide"}), 400
    name, logo = ALERT_SCANNERS[scanner]
    arrow = "📈" if side == "buy" else "📉"
    body_text = f"{arrow} {'BUY' if side == 'buy' else 'SELL'} détectée sur {symbol} en {ALERT_TF_LABEL[tf]} !"
    db = get_db()
    sent = 0
    for rule in db.execute("SELECT * FROM alert_rules").fetchall():
        if scanner not in json.loads(rule["scanners"]) or symbol not in json.loads(rule["pairs"]) or tf not in json.loads(rule["timeframes"]):
            continue
        subs = db.execute("SELECT * FROM push_subscriptions WHERE user_id = ?", (rule["user_id"],)).fetchall()
        if not subs:
            continue
        res = _send_push_to_subscriptions(subs, name, body_text,
                                          url=f"app.html#/strategies?scanner={scanner}&symbol={symbol}&tf={tf}&alert=1&side={side}",
                                          icon=f"{SITE_URL}/{logo}")
        sent += res.get("sent", 0)
    return jsonify({"sent": sent})


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


VPS_PUSH_MAX_POSITIONS = 200


@app.route("/vps/register", methods=["POST"])
def vps_register():
    user = approved_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    body = request.get_json(silent=True) or {}
    label = (body.get("label") or "Compte VPS").strip()[:80] or "Compte VPS"
    vid = secrets.token_hex(16)
    with db_lock:
        get_db().execute(
            "INSERT INTO vps_accounts (id, user_id, label, created_at) VALUES (?, ?, ?, ?)",
            (vid, user["id"], label, datetime.now(timezone.utc).isoformat()),
        )
        get_db().commit()
    return jsonify({"id": vid, "label": label})


@app.route("/vps/list")
def vps_list():
    user = approved_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    rows = get_db().execute(
        "SELECT id, label, created_at, last_push_at FROM vps_accounts WHERE user_id = ? ORDER BY created_at DESC",
        (user["id"],),
    ).fetchall()
    return jsonify({"accounts": [dict(r) for r in rows]})


@app.route("/vps/rename/<vid>", methods=["POST"])
def vps_rename(vid):
    user = approved_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    body = request.get_json(silent=True) or {}
    label = (body.get("label") or "").strip()[:80]
    if not label:
        return jsonify({"error": "Nom requis."}), 400
    with db_lock:
        cur = get_db().execute("UPDATE vps_accounts SET label = ? WHERE id = ? AND user_id = ?", (label, vid, user["id"]))
        get_db().commit()
    return jsonify({"ok": cur.rowcount > 0})


@app.route("/vps/delete/<vid>", methods=["POST"])
def vps_delete(vid):
    user = approved_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    with db_lock:
        cur = get_db().execute("DELETE FROM vps_accounts WHERE id = ? AND user_id = ?", (vid, user["id"]))
        get_db().commit()
    return jsonify({"ok": cur.rowcount > 0})


@app.route("/vps/data/<vid>")
def vps_data(vid):
    user = approved_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    row = get_db().execute("SELECT * FROM vps_accounts WHERE id = ? AND user_id = ?", (vid, user["id"])).fetchone()
    if not row:
        return jsonify({"error": "Compte introuvable."}), 404
    data = json.loads(row["last_data"]) if row["last_data"] else None
    return jsonify({"label": row["label"], "lastPushAt": row["last_push_at"], "data": data})


@app.route("/vps/push/<vid>", methods=["POST"])
def vps_push(vid):
    # Appelé par l'EA CHESTAccountPush.mq5 depuis le VPS personnel du membre - pas de session
    # membre ici (voir le commentaire sur la table vps_accounts), l'id lui-même (32 hex non
    # devinables) est le secret. Jamais d'authentification Bearer attendue sur cette route.
    db = get_db()
    row = db.execute("SELECT id FROM vps_accounts WHERE id = ?", (vid,)).fetchone()
    if not row:
        return jsonify({"error": "Identifiant inconnu."}), 404
    body = request.get_json(silent=True) or {}
    positions = body.get("positions")
    if not isinstance(positions, list):
        positions = []
    data = {
        "balance": _num(body.get("balance")),
        "equity": _num(body.get("equity")),
        "margin": _num(body.get("margin")),
        "marginFree": _num(body.get("marginFree")),
        "currency": (str(body.get("currency") or "")[:10] or None),
        "login": (str(body.get("login")) if body.get("login") is not None else None),
        "server": (str(body.get("server") or "")[:80] or None),
        "positions": positions[:VPS_PUSH_MAX_POSITIONS],
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    with db_lock:
        db.execute(
            "UPDATE vps_accounts SET last_data = ?, last_push_at = ? WHERE id = ?",
            (json.dumps(data), data["updatedAt"], vid),
        )
        db.commit()
    return jsonify({"ok": True})


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


def _send_push_to_subscriptions(subs, title, body_text, url=None, icon=None):
    """Envoie a une liste de lignes push_subscriptions (deja chargees) ; retire tout abonnement
    expire/invalide (410 Gone, cas normal quand un navigateur se desinscrit sans le dire) plutot
    que de re-essayer indefiniment dessus."""
    if not VAPID_PRIVATE_KEY:
        return {"sent": 0, "error": "VAPID_PRIVATE_KEY non configurée côté serveur."}
    payload = json.dumps({"title": title, "body": body_text, "url": url or "app.html", "icon": icon})
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


# ---------------------------------------------------------------- Notifications au choix (2026-10-01)
# Demande utilisateur : "une partie dans les parametres ou on choisit quelle notif on veut recevoir",
# chaque notification cochable, et un format court par compte ("ALLIN - TP✔️ +1964,57$") avec le
# choix $ ou % pour tout ce qui touche au compte. Les reglages vivent dans le navigateur
# (localStorage "chest_notif_prefs", voir site/account.html) et arrivent ici par la synchro
# existante (table user_data, voir /sync) - aucune nouvelle route a appeler cote client.
# Un reglage absent = tout coche (comportement d'avant : tout le monde recevait tout).
NOTIF_TYPES = (
    "calendar_pre", "calendar_result", "position_open", "position_close",
    "report_weekly", "report_monthly", "new_member",
)
NOTIF_PREFS_KEY = "chest_notif_prefs"
BERICH_SIGNALS_URL = os.environ.get("BERICH_SIGNALS_URL", "https://berich-bridge-production.up.railway.app/signals")


def _user_json(db, user_id, key, default):
    row = db.execute("SELECT value FROM user_data WHERE user_id = ? AND key = ?", (user_id, key)).fetchone()
    if not row:
        return default
    try:
        val = json.loads(row["value"])
    except (ValueError, TypeError):
        return default
    return val if val is not None else default


def _user_prefs(db, user_id):
    prefs = {t: True for t in NOTIF_TYPES}
    prefs["unit"] = "usd"
    stored = _user_json(db, user_id, NOTIF_PREFS_KEY, {})
    if isinstance(stored, dict):
        for t in NOTIF_TYPES:
            if isinstance(stored.get(t), bool):
                prefs[t] = stored[t]
        if stored.get("unit") in ("usd", "pct"):
            prefs["unit"] = stored["unit"]
    return prefs


def _owner_journal(db, user_id):
    """Journal qui recoit les positions BERICH : le premier journal saisi a la main (meme regle que
    site/js/journal-store.js, entriesFor)."""
    accounts = _user_json(db, user_id, "chest_journal_accounts", [])
    if not isinstance(accounts, list):
        return None
    accounts = [a for a in accounts if isinstance(a, dict)]
    return next((a for a in accounts if a.get("mode") != "auto"), None)


def _active_dashboard_account(db, user_id):
    accounts = _user_json(db, user_id, "chest_accounts", [])
    if not isinstance(accounts, list) or not accounts:
        return None
    row = db.execute("SELECT value FROM user_data WHERE user_id = ? AND key = 'chest_active_account'", (user_id,)).fetchone()
    active_id = row["value"] if row else None
    return next((a for a in accounts if isinstance(a, dict) and a.get("id") == active_id), accounts[0] if isinstance(accounts[0], dict) else None)


def _family_name(db, user_id):
    owner = _owner_journal(db, user_id)
    if owner and str(owner.get("name") or "").strip():
        return str(owner["name"]).strip()
    acc = _active_dashboard_account(db, user_id)
    if acc and str(acc.get("name") or "").strip():
        return str(acc["name"]).strip()
    return "BERICH"


def _num(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f == f else None  # NaN -> None


def _fmt_money(v):
    sign = "+" if v >= 0 else "-"
    return f"{sign}{abs(v):.2f}".replace(".", ",") + "$"


def _fmt_pct(v):
    txt = f"{abs(v):.2f}".rstrip("0").rstrip(".").replace(".", ",")
    return ("+" if v >= 0 else "-") + txt + "%"


def _fmt_value(prefs, amount, pct, r=None):
    """$ ou % selon le reglage ; l'autre unite en secours si la premiere est inconnue."""
    order = (("pct", pct), ("usd", amount)) if prefs["unit"] == "pct" else (("usd", amount), ("pct", pct))
    for unit, v in order:
        if v is not None:
            return _fmt_pct(v) if unit == "pct" else _fmt_money(v)
    if r is not None:
        return f"{r:+g}R".replace(".", ",")
    return ""


def _berich_risk(db, user_id, signal_id):
    """Risque d'une position BERICH pour CE membre : celui memorise au clic "prendre la position"
    (chest_berich_taken, voir site/js/berich-store.js), sinon le reglage de sa connexion BERICH
    applique au solde de son journal principal."""
    taken = _user_json(db, user_id, "chest_berich_taken", [])
    meta = next((t for t in taken if isinstance(t, dict) and t.get("id") == signal_id), None) if isinstance(taken, list) else None
    if meta:
        return _num(meta.get("riskAmount")), _num(meta.get("riskPercent")), True
    conn = _user_json(db, user_id, "chest_berich_connection", {})
    pct = _num(conn.get("riskPercent")) if isinstance(conn, dict) else None
    owner = _owner_journal(db, user_id) or _active_dashboard_account(db, user_id) or {}
    balance = _num(owner.get("balance"))
    amount = balance * pct / 100 if balance is not None and pct is not None else None
    return amount, pct, False


def _signal_rr(event):
    entry, sl, tp = _num(event.get("entry")), _num(event.get("sl")), _num(event.get("tp"))
    if entry is None or sl is None or tp is None or entry == sl:
        return 3.0
    return round(abs(tp - entry) / abs(entry - sl), 2)


def _render_position_open(db, user_id, prefs, event):
    side = str(event.get("side") or "").upper()
    if side not in ("BUY", "SELL"):
        return None
    arrow = "📈" if side == "BUY" else "📉"
    return f"{_family_name(db, user_id)} - Vous avez pris un {side} {arrow}"


def _render_position_close(db, user_id, prefs, event):
    result = event.get("result")
    if result not in ("TP", "SL"):
        return None
    r = _signal_rr(event) if result == "TP" else -1.0
    amount, pct, _ = _berich_risk(db, user_id, event.get("id"))
    val = _fmt_value(prefs, amount * r if amount is not None else None, pct * r if pct is not None else None, r)
    mark = "TP✔️" if result == "TP" else "SL❌"
    return f"{_family_name(db, user_id)} - {mark} {val}".strip()


def send_typed_push(ntype, url, render, admins_only=False):
    """Envoie a chaque membre abonne qui a coche `ntype`, avec un texte propre a ce membre
    (render(db, user_id, prefs) -> str | None). Le texte part en TITRE, corps vide : sur iPhone,
    la ligne "from CHEST" est ajoutee par iOS et ne peut pas etre retiree (voir site/sw.js)."""
    db = get_db()
    q = "SELECT push_subscriptions.* FROM push_subscriptions"
    if admins_only:
        q += " JOIN users ON users.id = push_subscriptions.user_id WHERE users.is_admin = 1"
    by_user = {}
    for sub in db.execute(q).fetchall():
        by_user.setdefault(sub["user_id"], []).append(sub)
    total = {"sent": 0, "removed": 0, "skipped": 0}
    for user_id, subs in by_user.items():
        prefs = _user_prefs(db, user_id)
        if not prefs.get(ntype, True):
            total["skipped"] += 1
            continue
        try:
            text = render(db, user_id, prefs)
        except Exception as exc:  # un membre aux donnees bizarres ne doit pas bloquer les autres
            print(f"Notification {ntype} : rendu impossible pour l'utilisateur {user_id} ({exc})")
            text = None
        if not text:
            total["skipped"] += 1
            continue
        res = _send_push_to_subscriptions(subs, text, "", url)
        total["sent"] += res.get("sent", 0)
        total["removed"] += res.get("removed", 0)
        if res.get("error"):
            total["error"] = res["error"]
    return total


@app.route("/push/broadcast", methods=["POST"])
def push_broadcast():
    # Reserve aux AUTRES SERVICES Railway (berich-bridge, calendar-bridge) - pas de session
    # utilisateur cote webhook/tache de fond, donc un secret partage plutot qu'un jeton Bearer (voir
    # INTERNAL_PUSH_SECRET). Avec "type" (2026-10-01), chaque membre ne recoit que ce qu'il a coche ;
    # "event" (positions BERICH) fait rediger le texte par membre (nom du journal, $ ou %). Sans
    # "type" : ancien comportement, a tout le monde.
    if not INTERNAL_PUSH_SECRET or request.headers.get("X-Internal-Secret") != INTERNAL_PUSH_SECRET:
        return jsonify({"error": "Non autorisé."}), 401
    body = request.get_json(silent=True) or {}
    ntype = body.get("type")
    url = body.get("url") or "app.html"
    event = body.get("event") if isinstance(body.get("event"), dict) else None
    if ntype == "position_open" and event:
        return jsonify(send_typed_push(ntype, url, lambda db, uid, p: _render_position_open(db, uid, p, event)))
    if ntype == "position_close" and event:
        return jsonify(send_typed_push(ntype, url, lambda db, uid, p: _render_position_close(db, uid, p, event)))
    title = (body.get("title") or "").strip()
    text = (body.get("body") or "").strip()
    if ntype in NOTIF_TYPES:
        message = " — ".join(x for x in (title, text) if x)
        return jsonify(send_typed_push(ntype, url, lambda db, uid, p: message))
    result = send_push_to_all(title or "CHEST", text, url)
    return jsonify(result)


# ---------------------------------------------------------------- Comptes rendus semaine / mois
# Demande utilisateur (2026-10-01) : "des comptes rendus dans la meme structure par semaine et par
# mois". Un message par journal qui a des trades clotures sur la periode : "ALLIN - Semaine du 22/09 :
# +1964,57$ · 5 TP✔️ 2 SL❌". Source = les memes donnees que la page Journal (saisies manuelles,
# comptes Myfxbook importes, positions BERICH prises), lues dans user_data. Le samedi matin pour la
# semaine (lundi -> vendredi), le 1er du mois pour le mois precedent ; jamais deux fois la meme
# periode (table push_digest_log, survit aux redemarrages).
DIGEST_HOUR_PARIS = 9
MONTHS_FR = ("Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août",
             "Septembre", "Octobre", "Novembre", "Décembre")


def _paris_now():
    from zoneinfo import ZoneInfo
    return datetime.now(ZoneInfo("Europe/Paris"))


def _fetch_berich_signals():
    try:
        with urllib.request.urlopen(BERICH_SIGNALS_URL, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return [s for s in data.get("signals", []) if isinstance(s, dict)]
    except (urllib.error.URLError, OSError, ValueError):
        return []


def _journal_trades(db, user_id, start_iso, end_iso, signals):
    """[(compte du journal, [(resultat, montant|None, pct|None)])] pour la periode [start, end)."""
    accounts = _user_json(db, user_id, "chest_journal_accounts", [])
    accounts = [a for a in accounts if isinstance(a, dict)] if isinstance(accounts, list) else []
    entries = _user_json(db, user_id, "chest_journal", [])
    entries = [e for e in entries if isinstance(e, dict)] if isinstance(entries, list) else []
    ext = _user_json(db, user_id, "chest_journal_ext", {})
    ext = ext if isinstance(ext, dict) else {}
    owner = next((a for a in accounts if a.get("mode") != "auto"), None)

    def in_period(d):
        d = str(d or "")[:10]
        return start_iso <= d < end_iso

    out = []
    for i, acc in enumerate(accounts):
        balance = _num(acc.get("balance"))
        rows = []
        manual = [e for e in entries if e.get("accountId") == acc.get("id") or (not e.get("accountId") and i == 0)]
        for live in acc.get("live") or []:
            if isinstance(live, dict):
                manual += [e for e in ext.get(live.get("id"), []) if isinstance(e, dict)]
        for e in manual:
            if e.get("result") not in ("TP", "SL", "BE") or not in_period(e.get("date")):
                continue
            pnl = _num(e.get("pnl"))
            rows.append((e["result"], pnl, pnl / balance * 100 if pnl is not None and balance else None))
        if owner is not None and acc.get("id") == owner.get("id"):
            for s in signals:
                if s.get("status") != "closed" or s.get("result") not in ("TP", "SL"):
                    continue
                if not in_period(s.get("closedAt") or s.get("time")):
                    continue
                amount, pct, taken = _berich_risk(db, user_id, s.get("id"))
                if not taken:
                    continue  # seules les positions prises comptent (meme regle que le Journal)
                r = _signal_rr(s) if s["result"] == "TP" else -1.0
                rows.append((s["result"], amount * r if amount is not None else None, pct * r if pct is not None else None))
        if rows:
            out.append((acc, rows))
    return out


def _render_digest(db, user_id, prefs, label, start_iso, end_iso, signals):
    lines = []
    for acc, rows in _journal_trades(db, user_id, start_iso, end_iso, signals):
        amounts = [a for _, a, _ in rows if a is not None]
        pcts = [p for _, _, p in rows if p is not None]
        val = _fmt_value(prefs, sum(amounts) if amounts else None, sum(pcts) if pcts else None)
        tp = sum(1 for r, _, _ in rows if r == "TP")
        sl = sum(1 for r, _, _ in rows if r == "SL")
        be = sum(1 for r, _, _ in rows if r == "BE")
        counts = f"{tp} TP✔️ {sl} SL❌" + (f" {be} BE" if be else "")
        name = str(acc.get("name") or "Journal").strip()
        lines.append(f"{name} - {label} : {val} · {counts}" if val else f"{name} - {label} : {counts}")
    return lines


def _send_digest(ntype, period_key, label, start_iso, end_iso):
    with db_lock:
        db = get_db()
        cur = db.execute("INSERT OR IGNORE INTO push_digest_log (period_key, sent_at) VALUES (?, ?)",
                         (period_key, datetime.now(timezone.utc).isoformat()))
        db.commit()
        if cur.rowcount == 0:
            return  # deja envoye pour cette periode
    signals = _fetch_berich_signals()
    db = get_db()
    users = {r["user_id"] for r in db.execute("SELECT DISTINCT user_id FROM push_subscriptions").fetchall()}
    for user_id in users:
        prefs = _user_prefs(db, user_id)
        if not prefs.get(ntype, True):
            continue
        for line in _render_digest(db, user_id, prefs, label, start_iso, end_iso, signals):
            subs = db.execute("SELECT * FROM push_subscriptions WHERE user_id = ?", (user_id,)).fetchall()
            _send_push_to_subscriptions(subs, line, "", "journal.html")
    print(f"Compte rendu {period_key} envoyé.")


def check_digests():
    now = _paris_now()
    if now.hour < DIGEST_HOUR_PARIS:
        return
    today = now.date()
    if today.weekday() in (5, 6):  # samedi (ou dimanche si le service etait arrete le samedi)
        monday = today - timedelta(days=today.weekday())
        _send_digest("report_weekly", f"week:{monday.isoformat()}", f"Semaine du {monday.strftime('%d/%m')}",
                     monday.isoformat(), (monday + timedelta(days=7)).isoformat())
    if today.day in (1, 2):
        first_this = today.replace(day=1)
        first_prev = (first_this - timedelta(days=1)).replace(day=1)
        _send_digest("report_monthly", f"month:{first_prev.strftime('%Y-%m')}", MONTHS_FR[first_prev.month - 1],
                     first_prev.isoformat(), first_this.isoformat())


def digest_loop():
    while True:
        try:
            with app.app_context():
                check_digests()
        except Exception:
            import traceback
            traceback.print_exc()
        time.sleep(300)


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
    threading.Thread(target=digest_loop, daemon=True).start()
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
