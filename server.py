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

Donnees dans SQLite, sur le Volume Railway du service (meme mecanisme que
calendar-bridge/server.py pour l'historique du calendrier) - survit aux
redeploiements.

Usage local :
    python server.py
Sur Railway, c'est le CMD du Dockerfile qui lance cette commande.
"""

import os
import re
import secrets
import sqlite3
import threading
from datetime import datetime, timedelta, timezone

from flask import Flask, g, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

DB_DIR = os.environ.get("RAILWAY_VOLUME_MOUNT_PATH") or os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(DB_DIR, "accounts.db")
SESSION_LIFETIME_DAYS = 30

app = Flask(__name__)
db_lock = threading.Lock()


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
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
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
    if len(password) < 8:
        return jsonify({"error": "Le mot de passe doit faire au moins 8 caractères."}), 400

    db = get_db()
    with db_lock:
        existing = db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if existing:
            return jsonify({"error": "Un compte existe déjà avec cet email."}), 409

        is_first_user = db.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"] == 0
        status = "approved" if is_first_user else "pending"
        is_admin = 1 if is_first_user else 0

        db.execute(
            "INSERT INTO users (first_name, last_name, email, password_hash, status, is_admin, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (first_name, last_name, email, generate_password_hash(password), status, is_admin,
             datetime.now(timezone.utc).isoformat()),
        )
        db.commit()

    return jsonify({
        "status": status,
        "isAdmin": bool(is_admin),
        "message": (
            "Compte admin créé et approuvé automatiquement (premier compte du site)."
            if is_first_user else
            "Inscription reçue — en attente d'approbation par un administrateur."
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


@app.route("/health")
def health():
    return jsonify({"ok": True})


if __name__ == "__main__":
    init_db()
    # threaded=False : meme incident deja rencontre et corrige sur
    # calendar-bridge/server.py (RuntimeError: can't start new thread apres
    # quelques heures, le serveur de dev Werkzeug ouvrant un thread par
    # requete jusqu'a epuiser la limite du conteneur) - on part directement
    # sur la configuration qui s'est averee stable, plutot que de reproduire
    # le meme bug ici.
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)), threaded=False)
