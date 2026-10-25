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
import hashlib
import hmac
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
        # Réglages du site modifiables par l'admin (2026-10-14) — ex. le mot de passe d'inscription.
        db.execute("CREATE TABLE IF NOT EXISTS site_settings (key TEXT PRIMARY KEY, value TEXT)")
        # Vidéo de présentation vue en entier (2026-10-14, demande utilisateur : obligatoire à la première
        # connexion d'un NOUVEAU membre). Les membres déjà inscrits au moment de la migration sont marqués
        # comme l'ayant vue : seules les nouvelles inscriptions la reçoivent obligatoirement.
        user_cols = [r[1] for r in db.execute("PRAGMA table_info(users)").fetchall()]  # r[1] = nom de colonne (connexion sans row_factory ici)
        if "tuto_seen_at" not in user_cols:
            db.execute("ALTER TABLE users ADD COLUMN tuto_seen_at TEXT")
            db.execute("UPDATE users SET tuto_seen_at = ?", (datetime.now(timezone.utc).isoformat(),))
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
        # Sauvegardes (2026-10-24, demande utilisateur : « une fois configuré il ne doit pas pouvoir partir ») :
        # chaque valeur synchronisée remplacée est gardée ici (30 dernières par donnée), restaurable depuis Compte.
        db.execute("""
            CREATE TABLE IF NOT EXISTS user_data_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                key TEXT NOT NULL,
                value TEXT NOT NULL,
                saved_at TEXT NOT NULL
            )
        """)
        db.execute("CREATE INDEX IF NOT EXISTS idx_udh_user_key ON user_data_history (user_id, key, id)")
        # Programme éducateur (2026-10-25) : lien d'invitation, coordonnées de paiement, demandes de retrait.
        db.execute("""
            CREATE TABLE IF NOT EXISTS edu_invites (
                code TEXT PRIMARY KEY,
                educator_id INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                active INTEGER NOT NULL DEFAULT 1
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS edu_payout_info (
                educator_id INTEGER PRIMARY KEY,
                method TEXT NOT NULL,
                holder TEXT, iban TEXT, bic TEXT, network TEXT, address TEXT,
                updated_at TEXT NOT NULL
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS edu_payouts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                educator_id INTEGER NOT NULL,
                amount INTEGER NOT NULL,
                method TEXT NOT NULL,
                details TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL,
                processed_at TEXT,
                admin_note TEXT
            )
        """)
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
        # Historique des comptes VPS (2026-10-13) : positions CLÔTURÉES envoyées par l'EA (dédupliquées
        # par ticket MT5, mises à jour si renvoyées) et courbe solde/équité (un point toutes les 15 min
        # au plus). C'est ce qui donne à un compte VPS profit, winrate, R:R et courbe sur le Dashboard,
        # comme un compte Myfxbook, au lieu d'un simple instantané.
        db.execute("""
            CREATE TABLE IF NOT EXISTS vps_deals (
                vps_id TEXT NOT NULL,
                ticket INTEGER NOT NULL,
                close_time INTEGER NOT NULL,
                data TEXT NOT NULL,
                PRIMARY KEY (vps_id, ticket)
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS vps_equity (
                vps_id TEXT NOT NULL,
                ts INTEGER NOT NULL,
                balance REAL,
                equity REAL,
                PRIMARY KEY (vps_id, ts)
            )
        """)
        # Offres et accès payant (2026-10-18). Les membres déjà inscrits au moment de la migration gardent
        # un accès offert, sans date de fin (l'admin peut le changer membre par membre).
        user_cols = [r[1] for r in db.execute("PRAGMA table_info(users)").fetchall()]
        new_cols = [("plan", "TEXT"), ("plan_period", "TEXT"), ("plan_status", "TEXT"), ("plan_started_at", "TEXT"),
                    ("plan_ends_at", "TEXT"), ("plan_amount", "INTEGER"), ("trial_used", "INTEGER NOT NULL DEFAULT 0"),
                    ("stripe_customer_id", "TEXT"), ("stripe_subscription_id", "TEXT"), ("onboarding", "TEXT"),
                    ("last_login_at", "TEXT"), ("last_seen_at", "TEXT"), ("role", "TEXT"),
                    # Programme éducateur (2026-10-25) : qui a parrainé ce membre, et le taux d'un éducateur
                    ("referred_by", "INTEGER"), ("commission_rate", "REAL")]
        first_billing_migration = "plan" not in user_cols
        for name, kind in new_cols:
            if name not in user_cols:
                db.execute(f"ALTER TABLE users ADD COLUMN {name} {kind}")
        if first_billing_migration:
            db.execute("UPDATE users SET plan = 'offert', plan_status = 'manual', plan_started_at = created_at")
        db.execute("""
            CREATE TABLE IF NOT EXISTS user_activity (
                user_id INTEGER NOT NULL,
                day TEXT NOT NULL,
                page TEXT NOT NULL,
                views INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (user_id, day, page)
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS billing_events (
                id TEXT PRIMARY KEY,
                user_id INTEGER,
                type TEXT NOT NULL,
                amount INTEGER,
                summary TEXT,
                created_at TEXT NOT NULL
            )
        """)
        # Manageurs désignés par la variable Railway MANAGER_EMAILS (e-mails séparés par des virgules) : compte
        # approuvé, pouvoirs admin, rôle manager, à chaque démarrage. Jamais d'e-mail dans le dépôt (public).
        # Ne touche jamais un admin principal.
        for email in [e.strip().lower() for e in os.environ.get("MANAGER_EMAILS", "").split(",") if e.strip()]:
            db.execute("UPDATE users SET is_admin = 1, role = 'manager', status = 'approved' "
                       "WHERE lower(email) = ? AND NOT (is_admin = 1 AND COALESCE(role, '') != 'manager')", (email,))
        # SÉCURITÉ (2026-10-24, audit) : la synchro envoyait les mots de passe Myfxbook / broker BERICH. Le
        # site ne les envoie plus (sync-store.js, coffre local) ; on efface ceux déjà enregistrés ici.
        for row in db.execute("SELECT user_id, key, value FROM user_data WHERE value LIKE '%\"password\"%'").fetchall():
            try:
                data = json.loads(row[2])
            except (TypeError, ValueError):
                continue
            if _strip_passwords(data):
                db.execute("UPDATE user_data SET value = ? WHERE user_id = ? AND key = ?",
                           (json.dumps(data, ensure_ascii=False, separators=(",", ":")), row[0], row[1]))
        db.commit()


def _strip_passwords(o):
    """Retire récursivement toute clé « password » ; True si quelque chose a été retiré."""
    found = False
    if isinstance(o, dict):
        if "password" in o:
            del o["password"]
            found = True
        for v in o.values():
            found = _strip_passwords(v) or found
    elif isinstance(o, list):
        for v in o:
            found = _strip_passwords(v) or found
    return found


# Limite d'essais (2026-10-24, audit) : contre les essais de mots de passe en rafale. En mémoire, par
# processus (un seul conteneur) ; remis à zéro au redémarrage, ce qui suffit à casser une attaque.
_rl_lock = threading.Lock()
_rl_hits = {}


def _client_ip():
    fwd = request.headers.get("X-Forwarded-For", "")
    return (fwd.split(",")[0].strip() if fwd else "") or request.remote_addr or "?"


def too_many(key, limit, window):
    now = time.time()
    with _rl_lock:
        hits = [t for t in _rl_hits.get(key, []) if now - t < window]
        _rl_hits[key] = hits
        return len(hits) >= limit


def hit(key):
    with _rl_lock:
        _rl_hits.setdefault(key, []).append(time.time())
        if len(_rl_hits) > 20000:
            _rl_hits.clear()


TOO_MANY = "Trop de tentatives. Réessaie dans quelques minutes."


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Mot de passe demandé à TOUTE nouvelle inscription (2026-10-14, demande utilisateur), modifiable par l'admin
# (admin-members.html). Comparaison sans tenir compte des majuscules ni des espaces autour.
SIGNUP_CODE_DEFAULT = "FUJI"


def get_setting(key, default=None):
    row = get_db().execute("SELECT value FROM site_settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row and row["value"] is not None else default


def set_setting(key, value):
    db = get_db()
    with db_lock:
        db.execute("INSERT INTO site_settings (key, value) VALUES (?, ?) "
                   "ON CONFLICT(key) DO UPDATE SET value = excluded.value", (key, value))
        db.commit()


def signup_code():
    return get_setting("signup_code", SIGNUP_CODE_DEFAULT)


def user_public(row):
    return {
        "id": row["id"],
        "firstName": row["first_name"],
        "lastName": row["last_name"],
        "email": row["email"],
        "status": row["status"],
        "isAdmin": bool(row["is_admin"]),
        "createdAt": row["created_at"],
        "tutoSeen": bool(row["tuto_seen_at"]) if "tuto_seen_at" in row.keys() else True,
        "access": access_of(row),
        "role": ("manager" if _col(row, "role") == "manager" else "admin") if row["is_admin"] else (_col(row, "role") or "member"),
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
    # DELETE indispensable : sans lui, le navigateur bloquait la suppression des notifications de
    # scanner (DELETE /alerts/rules/<id>) avant même qu'elle atteigne le serveur.
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
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
    if too_many("signup-ip:" + _client_ip(), 20, 3600):
        return jsonify({"error": TOO_MANY}), 429
    hit("signup-ip:" + _client_ip())
    body = request.get_json(silent=True) or {}
    first_name = (body.get("firstName") or "").strip()
    last_name = (body.get("lastName") or "").strip()
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    ref_code = str(body.get("ref") or "").strip()[:40]

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
    # Plus de mot de passe d'inscription (2026-10-18) : tout le monde peut créer un compte, l'accès à
    # la plateforme passe ensuite par l'essai gratuit ou une offre (page /offres).
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
            "INSERT INTO users (first_name, last_name, email, password_hash, status, is_admin, created_at, plan) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (first_name, last_name, email, generate_password_hash(password), status, is_admin,
             datetime.now(timezone.utc).isoformat(), "offert" if is_first_user else "none"),
        )
        # Inscrit par le lien d'un éducateur (?ref=CODE) : rattaché à son compte
        if ref_code:
            inv = db.execute("SELECT educator_id FROM edu_invites WHERE code = ? AND active = 1", (ref_code,)).fetchone()
            if inv:
                db.execute("UPDATE users SET referred_by = ? WHERE email = ?", (inv["educator_id"], email))
        db.commit()

    if not is_first_user:
        send_signup_notification(first_name, last_name, email)
        # Notification push aux admins (2026-09-26, demande utilisateur : "pour les nouveaux
        # membres oui avec le prénom etc.") - en plus de l'email existant ci-dessus, jamais a la
        # place : l'un ne remplace pas l'autre, l'admin peut ne pas avoir active les notifications.
        try:
            new_member_text = f"Nouveau membre : {first_name} {last_name} ({email})"
            send_typed_push("new_member", "/admin-members", lambda db, uid, p: new_member_text, admins_only=True)
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

    ip_key, mail_key = "login-ip:" + _client_ip(), "login-mail:" + email
    if too_many(ip_key, 40, 900) or too_many(mail_key, 10, 900):
        return jsonify({"error": TOO_MANY}), 429
    hit(ip_key)
    db = get_db()
    row = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if not row or not check_password_hash(row["password_hash"], password):
        hit(mail_key)
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
        db.execute("UPDATE users SET last_login_at = ?, last_seen_at = ? WHERE id = ?", (now.isoformat(), now.isoformat(), row["id"]))
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


@app.route("/me/profile", methods=["POST"])
def me_profile():
    """Prénom, nom et e-mail du compte (2026-10-21) : enregistrés sur le compte, plus seulement sur l'appareil."""
    user = current_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    body = request.get_json(silent=True) or {}
    first_name = (body.get("firstName") or "").strip()[:60]
    last_name = (body.get("lastName") or "").strip()[:60]
    email = (body.get("email") or "").strip().lower()
    if not first_name or not last_name:
        return jsonify({"error": "Prénom et nom requis."}), 400
    if not EMAIL_RE.match(email):
        return jsonify({"error": "Adresse email invalide."}), 400
    db = get_db()
    if db.execute("SELECT 1 FROM users WHERE lower(email) = ? AND id != ?", (email, user["id"])).fetchone():
        return jsonify({"error": "Cette adresse email est déjà utilisée par un autre compte."}), 400
    with db_lock:
        db.execute("UPDATE users SET first_name = ?, last_name = ?, email = ? WHERE id = ?",
                   (first_name, last_name, email, user["id"]))
        db.commit()
    return jsonify(user_public(db.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()))


@app.route("/me/password", methods=["POST"])
def me_password():
    """Changement du mot de passe du compte (2026-10-21) : vérifie l'actuel, enregistre le nouveau et
    déconnecte les autres appareils (la session en cours reste ouverte)."""
    user = current_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    body = request.get_json(silent=True) or {}
    current, new = body.get("current") or "", body.get("new") or ""
    pw_key = f"pw-change:{user['id']}"
    if too_many(pw_key, 8, 900):
        return jsonify({"error": TOO_MANY}), 429
    if not check_password_hash(user["password_hash"], current):
        hit(pw_key)
        return jsonify({"error": "Mot de passe actuel incorrect."}), 400
    if len(new) < 4:
        return jsonify({"error": "Le nouveau mot de passe doit faire au moins 4 caractères."}), 400
    if new == current:
        return jsonify({"error": "Le nouveau mot de passe est identique à l'actuel."}), 400
    token = request.headers.get("Authorization", "")[len("Bearer "):].strip()
    db = get_db()
    with db_lock:
        db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (generate_password_hash(new), user["id"]))
        db.execute("DELETE FROM sessions WHERE user_id = ? AND token != ?", (user["id"], token))
        db.commit()
    return jsonify({"ok": True})


@app.route("/me/tuto-seen", methods=["POST"])
def me_tuto_seen():
    user = current_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    db = get_db()
    with db_lock:
        db.execute("UPDATE users SET tuto_seen_at = COALESCE(tuto_seen_at, ?) WHERE id = ?",
                   (datetime.now(timezone.utc).isoformat(), user["id"]))
        db.commit()
    row = db.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
    return jsonify(user_public(row))


@app.route("/admin/signup-code", methods=["GET", "POST"])
def admin_signup_code():
    admin = current_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    if request.method == "POST":
        code = ((request.get_json(silent=True) or {}).get("code") or "").strip()
        if len(code) < 3 or len(code) > 64:
            return jsonify({"error": "Entre 3 et 64 caractères."}), 400
        set_setting("signup_code", code)
    return jsonify({"code": signup_code()})


@app.route("/members")
def list_members():
    admin = current_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    db = get_db()
    rows = db.execute("SELECT * FROM users ORDER BY created_at DESC").fetchall()
    return jsonify({"members": [_admin_member(db, r) for r in rows]})


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
    denied = guard_principal(admin, member_id)
    if denied:
        return denied
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
    denied = guard_principal(admin, member_id)
    if denied:
        return denied
    db = get_db()
    with db_lock:
        db.execute("UPDATE users SET status = 'blocked' WHERE id = ?", (member_id,))
        db.execute("DELETE FROM sessions WHERE user_id = ?", (member_id,))
        db.commit()
    return jsonify({"ok": True})


# Suppression definitive d'un membre (2026-10-14, demande utilisateur : "mets une option de suppression
# d'utilisateur"). Efface le compte ET tout ce qui lui appartient cote serveur : sessions (deconnecte a
# l'instant), donnees synchronisees (comptes, journal, backtests, identifiants Myfxbook...), comptes VPS et
# leur historique, alertes scanner, abonnements aux notifications, backtests partages en attente (envoyes
# ou recus). Irreversible. Jamais son propre compte (pour ne pas s'enfermer dehors), jamais le dernier admin.
@app.route("/members/<int:member_id>/delete", methods=["POST"])
def delete_member(member_id):
    admin = current_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    denied = guard_principal(admin, member_id)
    if denied:
        return denied
    if member_id == admin["id"]:
        return jsonify({"error": "Tu ne peux pas supprimer ton propre compte."}), 400
    db = get_db()
    target = db.execute("SELECT id, is_admin FROM users WHERE id = ?", (member_id,)).fetchone()
    if not target:
        return jsonify({"error": "Compte introuvable."}), 404
    if target["is_admin"] and db.execute("SELECT COUNT(*) AS n FROM users WHERE is_admin = 1").fetchone()["n"] <= 1:
        return jsonify({"error": "Impossible de supprimer le dernier administrateur."}), 400
    with db_lock:
        vps_ids = [r["id"] for r in db.execute("SELECT id FROM vps_accounts WHERE user_id = ?", (member_id,)).fetchall()]
        for vid in vps_ids:
            db.execute("DELETE FROM vps_deals WHERE vps_id = ?", (vid,))
            db.execute("DELETE FROM vps_equity WHERE vps_id = ?", (vid,))
        db.execute("DELETE FROM vps_accounts WHERE user_id = ?", (member_id,))
        db.execute("DELETE FROM sessions WHERE user_id = ?", (member_id,))
        db.execute("DELETE FROM user_data WHERE user_id = ?", (member_id,))
        db.execute("DELETE FROM user_data_history WHERE user_id = ?", (member_id,))
        db.execute("DELETE FROM edu_invites WHERE educator_id = ?", (member_id,))
        db.execute("DELETE FROM edu_payout_info WHERE educator_id = ?", (member_id,))
        db.execute("DELETE FROM edu_payouts WHERE educator_id = ?", (member_id,))
        db.execute("UPDATE users SET referred_by = NULL WHERE referred_by = ?", (member_id,))
        db.execute("DELETE FROM alert_rules WHERE user_id = ?", (member_id,))
        db.execute("DELETE FROM push_subscriptions WHERE user_id = ?", (member_id,))
        db.execute("DELETE FROM shared_backtests WHERE from_user = ? OR to_user = ?", (member_id, member_id))
        db.execute("DELETE FROM user_activity WHERE user_id = ?", (member_id,))
        db.execute("DELETE FROM billing_events WHERE user_id = ?", (member_id,))
        db.execute("DELETE FROM users WHERE id = ?", (member_id,))
        db.commit()
    return jsonify({"ok": True, "vpsDeleted": len(vps_ids)})


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
    denied = guard_principal(admin, member_id)
    if denied:
        return denied
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


# ---------------------------------------------------------------- Offres, accès et paiements (2026-10-18)
# Accès payant : chaque membre a une offre (plan) et une date de fin d'accès. Les paiements passent par
# les liens de paiement Stripe (un par offre et par période, voir site/js/config.js : stripeLinks) ; le
# lien porte « client_reference_id = u<id du membre> », et Stripe prévient ce serveur (POST
# /billing/webhook, signé avec STRIPE_WEBHOOK_SECRET) à chaque paiement, renouvellement, échec ou
# résiliation. Aucune clé secrète Stripe n'est nécessaire ici : seulement le secret de signature.
# L'offre est déduite du MONTANT avant remise (amount_subtotal), jamais de ce que le navigateur annonce :
# changer le lien à la main ne donne pas une offre plus chère.
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
PLANS = {
    # features : school = School complet (sinon 2 cours), berich = BERICH, sync = données sur le serveur
    "trial": {"label": "Essai gratuit (Essentiel)", "school": False, "berich": False, "sync": False},
    "essentiel": {"label": "CHEST Essentiel", "school": False, "berich": False, "sync": True},
    "premium": {"label": "CHEST Premium", "school": True, "berich": True, "sync": True},
    "allstar": {"label": "CHEST Allstar", "school": True, "berich": True, "sync": True},
    "offert": {"label": "Privilège", "school": True, "berich": True, "sync": True},
}
PLAN_AMOUNTS = {  # centimes TTC avant remise -> (offre, période)
    9998: ("essentiel", "month"), 100000: ("essentiel", "year"),
    29998: ("premium", "month"), 300000: ("premium", "year"),
    999998: ("allstar", "year"),
}
TRIAL_DAYS = 7

# ---------------------------------------------------------------- Prix modifiables (2026-10-21)
# L'admin modifie les offres depuis /offres (mode édition) : nom, textes, éléments, prix, liens de paiement
# Stripe, offres affichées (1 à 3). Trois emplacements fixes, un par niveau de droits (essentiel, premium,
# allstar) : c'est la clé qui donne les droits (School, BERICH...), le reste n'est que de l'affichage.
# Le webhook reconnaît l'offre au montant payé : les prix enregistrés ici sont lus en premier, puis les
# anciens montants (PLAN_AMOUNTS) pour les abonnements pris avant un changement de prix.
PRICING_KEYS = ("essentiel", "premium", "allstar")
PRICING_DEFAULT = {"offers": [
    {"key": "essentiel", "enabled": True, "soon": False, "name": "CHEST Essentiel", "month": 99.98, "year": 1000,
     "who": "Pour trader en autonomie avec tous les outils",
     "desc": "Toute la plateforme pour analyser, tester et suivre tes trades.",
     "linkMonth": "https://buy.stripe.com/3cI3cu3N97kj07i42T2B200", "linkYear": "https://buy.stripe.com/9B6dR8bfBdIH7zK9nd2B201",
     "feats": [[1, "Tous les scanners et leurs alertes"], [1, "Backtesting et rapports complets"], [1, "Journal de trading"],
               [1, "Dashboard et comptes reliés"], [1, "Calendrier économique"], [1, "2 cours School offerts"],
               [0, "School complet et cours vidéo"], [0, "BERICH et suivi des positions"], [0, "Accompagnement personnalisé"]]},
    {"key": "premium", "enabled": True, "soon": False, "name": "CHEST Premium", "month": 299.98, "year": 3000,
     "who": "Pour progresser vite, accompagné",
     "desc": "Tout CHEST, la formation complète et un suivi pour atteindre tes objectifs.",
     "linkMonth": "https://buy.stripe.com/7sY6oG4Rd0VV5rCgPF2B202", "linkYear": "https://buy.stripe.com/00w9ASabx1ZZ2fq42T2B203",
     "feats": [[1, "Tout CHEST Essentiel"], [1, "School complet : cours écrits et vidéo"], [1, "BERICH et suivi des positions"],
               [1, "Accompagnement personnalisé vers tes objectifs"]]},
    {"key": "allstar", "enabled": True, "soon": True, "name": "CHEST Allstar", "month": None, "year": 9999.98,
     "who": "Pour déléguer et automatiser",
     "desc": "Tout CHEST Premium, avec l’automatisation complète de ton trading.",
     "linkMonth": "", "linkYear": "",
     "feats": [[1, "Tout CHEST Premium"], [1, "Automatisation complète"], [1, "×2 garanti en 1 an sur ton capital de départ"]]},
]}


def get_pricing():
    try:
        data = json.loads(get_setting("pricing") or "null")
    except ValueError:
        data = None
    return data if isinstance(data, dict) and isinstance(data.get("offers"), list) else PRICING_DEFAULT


def _clean_text(v, limit):
    return re.sub(r"\s+", " ", str(v or "")).strip()[:limit]


def _clean_price(v):
    if v in (None, ""):
        return None
    try:
        n = round(float(v), 2)
    except (TypeError, ValueError):
        raise ValueError("Prix invalide.")
    if not (0 < n < 1000000):
        raise ValueError("Un prix doit être compris entre 0,01 et 999 999,99 €.")
    return n


def _clean_link(v):
    v = str(v or "").strip()
    if v and not re.fullmatch(r"https://[^\s\"'<>]{8,500}", v):
        raise ValueError("Un lien de paiement doit commencer par https://")
    return v


def validate_pricing(body):
    offers = (body or {}).get("offers")
    if not isinstance(offers, list):
        raise ValueError("Format invalide.")
    by_key = {o.get("key"): o for o in offers if isinstance(o, dict)}
    out = []
    for key in PRICING_KEYS:
        o = by_key.get(key)
        if o is None:
            raise ValueError("Les trois emplacements d'offre sont attendus.")
        feats = []
        for f in (o.get("feats") or [])[:16]:
            if isinstance(f, (list, tuple)) and len(f) == 2:
                t = _clean_text(f[1], 140)
                if t:
                    feats.append([1 if f[0] else 0, t])
        item = {"key": key, "enabled": bool(o.get("enabled")), "soon": bool(o.get("soon")),
                "name": _clean_text(o.get("name"), 40), "who": _clean_text(o.get("who"), 90),
                "desc": _clean_text(o.get("desc"), 220), "month": _clean_price(o.get("month")),
                "year": _clean_price(o.get("year")), "linkMonth": _clean_link(o.get("linkMonth")),
                "linkYear": _clean_link(o.get("linkYear")), "feats": feats}
        if item["enabled"]:
            if not item["name"]:
                raise ValueError("Chaque offre affichée doit avoir un nom.")
            if item["month"] is None and item["year"] is None:
                raise ValueError(f"{item['name']} : indique au moins un prix (mensuel ou annuel).")
        out.append(item)
    if not any(o["enabled"] for o in out):
        raise ValueError("Garde au moins une offre affichée.")
    return {"offers": out}


def plan_for_amount(amount):
    """(offre, période) d'après le montant payé en centimes : prix actuels d'abord, puis les anciens."""
    amount = int(amount or 0)
    for o in get_pricing().get("offers", []):
        for period, field in (("month", "month"), ("year", "year")):
            price = o.get(field)
            if price and o.get("key") in PLANS and int(round(float(price) * 100)) == amount:
                return (o["key"], period)
    return PLAN_AMOUNTS.get(amount)


def _iso(dt):
    return dt.isoformat() if dt else None


def _parse_iso(v):
    try:
        return datetime.fromisoformat(v) if v else None
    except ValueError:
        return None


def _col(row, key, default=None):
    return row[key] if key in row.keys() and row[key] is not None else default


def access_of(row):
    """Droits du membre : offre, période, dates, et ce qu'elle débloque. Un admin a toujours tout."""
    plan = _col(row, "plan", "none")
    ends = _parse_iso(_col(row, "plan_ends_at"))
    now = datetime.now(timezone.utc)
    if row["is_admin"] or _col(row, "role") == "educator":
        # Équipe (admin, éducateurs) : accès complet, sans abonnement.
        active, plan_key = True, "offert"
    else:
        plan_key = plan
        active = plan in PLANS and (ends is None and plan == "offert" or (ends is not None and ends > now))
    feats = PLANS.get(plan_key, {}) if active else {}
    return {
        "plan": plan,
        "label": PLANS.get(plan, {}).get("label", "Aucune offre"),
        "period": _col(row, "plan_period"),
        "status": _col(row, "plan_status"),
        "startedAt": _col(row, "plan_started_at"),
        "endsAt": _col(row, "plan_ends_at"),
        "active": bool(active),
        "trial": plan == "trial",
        "trialUsed": bool(_col(row, "trial_used", 0)),
        "school": bool(feats.get("school")),
        "berich": bool(feats.get("berich")),
        "sync": bool(feats.get("sync")) if active else True,
        "paid": bool(_col(row, "stripe_subscription_id")),
    }


def _set_plan(db, user_id, plan, period, status, started, ends, **extra):
    fields = {"plan": plan, "plan_period": period, "plan_status": status,
              "plan_started_at": _iso(started), "plan_ends_at": _iso(ends)}
    fields.update(extra)
    db.execute("UPDATE users SET " + ", ".join(f"{k} = ?" for k in fields) + " WHERE id = ?",
               list(fields.values()) + [user_id])


def _log_billing(db, event_id, user_id, etype, amount, summary):
    db.execute("INSERT OR IGNORE INTO billing_events (id, user_id, type, amount, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)",
               (event_id, user_id, etype, amount, summary[:300], datetime.now(timezone.utc).isoformat()))


@app.route("/billing/trial", methods=["POST"])
def billing_trial():
    user = current_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    acc = access_of(user)
    if acc["active"] and not acc["trial"]:
        return jsonify({"error": "Tu as déjà une offre active."}), 409
    if acc["trialUsed"]:
        return jsonify({"error": "L'essai gratuit a déjà été utilisé sur ce compte."}), 409
    now = datetime.now(timezone.utc)
    db = get_db()
    with db_lock:
        _set_plan(db, user["id"], "trial", None, "trialing", now, now + timedelta(days=TRIAL_DAYS), trial_used=1)
        _log_billing(db, "trial-" + str(user["id"]), user["id"], "trial", 0, f"Essai gratuit de {TRIAL_DAYS} jours")
        db.commit()
    row = db.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
    return jsonify(user_public(row))


@app.route("/me/onboarding", methods=["POST"])
def me_onboarding():
    user = current_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    body = request.get_json(silent=True) or {}
    answers = body.get("answers") if isinstance(body.get("answers"), dict) else {}
    clean = {k: str(v)[:40] for k, v in answers.items() if isinstance(k, str) and len(k) <= 20}
    clean["recommended"] = str(body.get("recommended") or "")[:20]
    clean["at"] = datetime.now(timezone.utc).isoformat()
    db = get_db()
    with db_lock:
        db.execute("UPDATE users SET onboarding = ? WHERE id = ?", (json.dumps(clean), user["id"]))
        db.commit()
    return jsonify({"ok": True})


# Activité : seulement « quelle page, quel jour, combien de fois », pour savoir ce qui sert vraiment.
# Rien sur le contenu (comptes, trades, montants) ni l'appareil.
@app.route("/me/activity", methods=["POST"])
def me_activity():
    user = current_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    page = ((request.get_json(silent=True) or {}).get("page") or "").strip()
    if not re.fullmatch(r"[a-z-]{2,40}", page):
        return jsonify({"error": "Page invalide."}), 400
    now = datetime.now(timezone.utc)
    db = get_db()
    with db_lock:
        db.execute(
            "INSERT INTO user_activity (user_id, day, page, views) VALUES (?, ?, ?, 1) "
            "ON CONFLICT(user_id, day, page) DO UPDATE SET views = views + 1",
            (user["id"], now.date().isoformat(), page))
        db.execute("UPDATE users SET last_seen_at = ? WHERE id = ?", (now.isoformat(), user["id"]))
        db.commit()
    return jsonify({"ok": True})


def _verify_stripe(payload, header):
    if not STRIPE_WEBHOOK_SECRET or not header:
        return False
    parts = {}
    for item in header.split(","):
        k, _, v = item.partition("=")
        parts.setdefault(k.strip(), []).append(v.strip())
    ts = (parts.get("t") or [""])[0]
    if not ts.isdigit() or abs(time.time() - int(ts)) > 600:
        return False
    expected = hmac.new(STRIPE_WEBHOOK_SECRET.encode(), (ts + ".").encode() + payload, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(expected, sig) for sig in parts.get("v1", []))


def _user_for_stripe(db, obj):
    ref = str(obj.get("client_reference_id") or "")
    m = re.fullmatch(r"u(\d+)", ref)
    if m:
        row = db.execute("SELECT * FROM users WHERE id = ?", (int(m.group(1)),)).fetchone()
        if row:
            return row
    for key in ("subscription", "customer"):
        val = obj.get(key)
        if isinstance(val, dict):
            val = val.get("id")
        if val:
            col = "stripe_subscription_id" if key == "subscription" else "stripe_customer_id"
            row = db.execute(f"SELECT * FROM users WHERE {col} = ?", (val,)).fetchone()
            if row:
                return row
    email = ((obj.get("customer_details") or {}).get("email") or obj.get("customer_email") or "").strip().lower()
    if email:
        return db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    return None


def _ts(v):
    try:
        return datetime.fromtimestamp(int(v), timezone.utc)
    except (TypeError, ValueError):
        return None


def _sub_period_end(obj):
    end = _ts(obj.get("current_period_end"))
    if end:
        return end
    items = (obj.get("items") or {}).get("data") or []
    ends = [_ts(i.get("current_period_end")) for i in items if i.get("current_period_end")]
    return max(ends) if ends else None


# ---------------------------------------------------------------- Mode de fonctionnement (2026-10-24)
# Réglé par l'admin (admin-members.html, onglet Système) pour limiter la consommation Railway :
#   normal = tout tourne ; eco = le calendrier ne se met à jour qu'une fois par jour (pas de relecture
#   après chaque annonce) ; off = les tâches de fond des services s'arrêtent (calendrier, alarmes des
#   scanners, Force du marché). « maintenance » = pages qui affichent la maintenance aux membres (les
#   admins les voient toujours). Lu sans connexion par le site et par les autres services (GET /ops).
OPS_MODES = ("normal", "eco", "off")


def get_ops():
    try:
        data = json.loads(get_setting("ops") or "null")
    except ValueError:
        data = None
    if not isinstance(data, dict):
        data = {}
    return {"mode": data.get("mode") if data.get("mode") in OPS_MODES else "normal",
            "maintenance": [p for p in (data.get("maintenance") or []) if isinstance(p, str)],
            "message": str(data.get("message") or "")}


@app.route("/ops", methods=["GET", "PUT"])
def ops():
    if request.method == "GET":
        resp = jsonify({**get_ops(), "updatedAt": get_setting("ops_updated_at")})
        resp.headers["Cache-Control"] = "no-store"
        return resp
    admin = current_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    body = request.get_json(silent=True) or {}
    mode = body.get("mode")
    if mode not in OPS_MODES:
        return jsonify({"error": "Mode inconnu."}), 400
    pages = body.get("maintenance") or []
    if not isinstance(pages, list) or len(pages) > 40 or not all(isinstance(x, str) and re.fullmatch(r"[a-z-]{1,40}", x) for x in pages):
        return jsonify({"error": "Liste de pages invalide."}), 400
    data = {"mode": mode, "maintenance": sorted(set(pages)), "message": re.sub(r"\s+", " ", str(body.get("message") or "")).strip()[:240]}
    set_setting("ops", json.dumps(data, ensure_ascii=False))
    now = datetime.now(timezone.utc).isoformat()
    set_setting("ops_updated_at", now)
    return jsonify({**data, "updatedAt": now})


# ---------------------------------------------------------------- Programme éducateur (2026-10-25)
# Un éducateur invite des membres avec son lien (/inscription?ref=CODE). Chaque paiement d'un membre rattaché lui
# rapporte une commission (son taux, 33 % par défaut, réglable par l'admin). Le portefeuille est un AFFICHAGE
# indicatif : les retraits demandés sont vérifiés puis payés par la société (CHEST HQ / admin), par virement.
EDU_DEFAULT_RATE = 100 / 3
EDU_MIN_PAYOUT = 5000  # centimes : 50 €
SALE_TYPES = ("invoice.paid", "checkout.session.completed", "checkout.session.async_payment_succeeded")


def is_educator(row):
    return bool(row) and _col(row, "role") == "educator"


def edu_rate(row):
    r = _col(row, "commission_rate")
    try:
        return float(r) if r is not None else EDU_DEFAULT_RATE
    except (TypeError, ValueError):
        return EDU_DEFAULT_RATE


def member_sales(db, user_id):
    """Paiements encaissés d'un membre (centimes). Une facture Stripe payée = une vente ; sans facture
    (paiement unique), le paiement validé du checkout."""
    rows = db.execute("SELECT id, type, amount, summary, created_at FROM billing_events WHERE user_id = ? AND amount > 0 "
                      "AND type IN (?, ?, ?) ORDER BY created_at", (user_id, *SALE_TYPES)).fetchall()
    inv = [r for r in rows if r["type"] == "invoice.paid"]
    if inv:
        return inv
    return [r for r in rows if r["type"] != "invoice.paid" and (r["summary"] or "").startswith("Paiement ")
            and not (r["summary"] or "").startswith(("Paiement en attente", "Paiement non rattaché"))]


def _mask(v, keep=4):
    v = str(v or "")
    return ("•••• " + v[-keep:]) if len(v) > keep else v


def iban_ok(iban):
    v = re.sub(r"\s+", "", iban or "").upper()
    if not re.fullmatch(r"[A-Z]{2}\d{2}[A-Z0-9]{10,30}", v):
        return None
    n = "".join(str(int(ch, 36)) for ch in v[4:] + v[:4])
    return v if int(n) % 97 == 1 else None


def edu_report(db, educator, full=False):
    rate = edu_rate(educator)
    members = db.execute("SELECT * FROM users WHERE referred_by = ? ORDER BY created_at DESC", (educator["id"],)).fetchall()
    out_members, tx, monthly = [], [], {}
    earned = 0.0
    for m in members:
        sales = member_sales(db, m["id"])
        total = sum(r["amount"] for r in sales)
        comm = total * rate / 100
        earned += comm
        a = access_of(m)
        out_members.append({
            "id": m["id"], "name": f"{m['first_name']} {(m['last_name'] or '')[:1]}.".strip(),
            "joinedAt": m["created_at"], "plan": a["label"] if a["active"] else ("Essai terminé" if a["trialUsed"] else "Sans offre"),
            "active": bool(a["active"]) and a["plan"] not in ("trial", "none"), "trial": a["trial"] and a["active"],
            "sales": total, "commission": round(comm), "payments": len(sales), "lastSeenAt": _col(m, "last_seen_at"),
        })
        mk = (m["created_at"] or "")[:7]
        monthly.setdefault(mk, {"month": mk, "signups": 0, "commission": 0.0})["signups"] += 1
        for r in sales:
            c = r["amount"] * rate / 100
            tx.append({"kind": "commission", "at": r["created_at"], "amount": round(c), "sale": r["amount"],
                       "member": f"{m['first_name']} {(m['last_name'] or '')[:1]}.".strip()})
            k = (r["created_at"] or "")[:7]
            monthly.setdefault(k, {"month": k, "signups": 0, "commission": 0.0})["commission"] += c
    payouts = db.execute("SELECT * FROM edu_payouts WHERE educator_id = ? ORDER BY id DESC", (educator["id"],)).fetchall()
    paid = sum(p["amount"] for p in payouts if p["status"] == "paid")
    pending = sum(p["amount"] for p in payouts if p["status"] == "pending")
    for p in payouts:
        tx.append({"kind": "payout", "at": p["created_at"], "amount": -p["amount"], "status": p["status"],
                   "processedAt": p["processed_at"], "method": p["method"], "note": p["admin_note"] or ""})
    tx.sort(key=lambda t: t["at"] or "", reverse=True)
    info = db.execute("SELECT * FROM edu_payout_info WHERE educator_id = ?", (educator["id"],)).fetchone()
    pinfo = None
    if info:
        pinfo = {"method": info["method"], "holder": info["holder"] or "", "network": info["network"] or "",
                 "bic": info["bic"] or "", "updatedAt": info["updated_at"]}
        if full:
            pinfo.update({"iban": info["iban"] or "", "address": info["address"] or ""})
        else:
            pinfo.update({"iban": _mask(info["iban"]), "address": _mask(info["address"], 6)})
    inv = db.execute("SELECT code FROM edu_invites WHERE educator_id = ? AND active = 1 ORDER BY created_at DESC", (educator["id"],)).fetchone()
    earned_c = round(earned)
    return {
        "educator": {"id": educator["id"], "name": f"{educator['first_name']} {educator['last_name']}"},
        "rate": rate, "invite": inv["code"] if inv else None, "minPayout": EDU_MIN_PAYOUT,
        "members": out_members,
        "totals": {"members": len(out_members), "active": sum(1 for m in out_members if m["active"]),
                   "trials": sum(1 for m in out_members if m["trial"]), "sales": sum(m["sales"] for m in out_members)},
        "wallet": {"earned": earned_c, "paid": paid, "pending": pending, "available": max(0, earned_c - paid - pending)},
        "transactions": tx[:200], "payoutInfo": pinfo,
        "monthly": sorted(({**v, "commission": round(v["commission"])} for v in monthly.values() if v["month"]), key=lambda x: x["month"])[-12:],
    }


def _edu_subject():
    """L'éducateur concerné : soi-même, ou (admin) celui de ?educator=ID."""
    user = current_user()
    if not user:
        return None, (jsonify({"error": "Non connecté."}), 401)
    target_id = request.args.get("educator")
    if target_id and user["is_admin"]:
        row = get_db().execute("SELECT * FROM users WHERE id = ?", (target_id,)).fetchone()
        if not row:
            return None, (jsonify({"error": "Éducateur introuvable."}), 404)
        return row, None
    if not is_educator(user):
        return None, (jsonify({"error": "Réservé aux éducateurs."}), 403)
    return user, None


@app.route("/edu/overview")
def edu_overview():
    who, err = _edu_subject()
    if err:
        return err
    return jsonify(edu_report(get_db(), who))


@app.route("/edu/payout-info", methods=["PUT"])
def edu_payout_info():
    user = current_user()
    if not user or not is_educator(user):
        return jsonify({"error": "Réservé aux éducateurs."}), 403
    b = request.get_json(silent=True) or {}
    method = b.get("method")
    holder = re.sub(r"\s+", " ", str(b.get("holder") or "")).strip()[:80]
    if method == "iban":
        iban = iban_ok(b.get("iban"))
        if not holder:
            return jsonify({"error": "Indique le titulaire du compte."}), 400
        if not iban:
            return jsonify({"error": "IBAN invalide : vérifie-le (lettres et chiffres, sans erreur de saisie)."}), 400
        bic = re.sub(r"\s+", "", str(b.get("bic") or "")).upper()[:11]
        if bic and not re.fullmatch(r"[A-Z0-9]{8}([A-Z0-9]{3})?", bic):
            return jsonify({"error": "BIC invalide (8 ou 11 caractères)."}), 400
        vals = ("iban", holder, iban, bic, None, None)
    elif method == "crypto":
        network = str(b.get("network") or "").strip()[:30]
        address = str(b.get("address") or "").strip()
        if network not in ("USDT (TRC-20)", "USDT (ERC-20)", "USDC (ERC-20)", "USDC (Solana)", "Bitcoin"):
            return jsonify({"error": "Choisis un réseau dans la liste."}), 400
        if not re.fullmatch(r"[A-Za-z0-9]{26,64}", address):
            return jsonify({"error": "Adresse de portefeuille invalide."}), 400
        vals = ("crypto", holder, None, None, network, address)
    else:
        return jsonify({"error": "Moyen de paiement inconnu."}), 400
    now = datetime.now(timezone.utc).isoformat()
    db = get_db()
    with db_lock:
        db.execute("INSERT INTO edu_payout_info (educator_id, method, holder, iban, bic, network, address, updated_at) "
                   "VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(educator_id) DO UPDATE SET method = excluded.method, "
                   "holder = excluded.holder, iban = excluded.iban, bic = excluded.bic, network = excluded.network, "
                   "address = excluded.address, updated_at = excluded.updated_at", (user["id"], *vals, now))
        db.commit()
    return jsonify(edu_report(db, user))


@app.route("/edu/payouts", methods=["POST"])
def edu_payout_request():
    user = current_user()
    if not user or not is_educator(user):
        return jsonify({"error": "Réservé aux éducateurs."}), 403
    try:
        amount = int(round(float((request.get_json(silent=True) or {}).get("amount")) * 100))
    except (TypeError, ValueError):
        return jsonify({"error": "Montant invalide."}), 400
    db = get_db()
    with db_lock:
        rep_ = edu_report(db, user, full=True)
        if not rep_["payoutInfo"]:
            return jsonify({"error": "Enregistre d'abord ton moyen de paiement (IBAN ou portefeuille crypto)."}), 400
        if amount < EDU_MIN_PAYOUT:
            return jsonify({"error": f"Le retrait minimum est de {EDU_MIN_PAYOUT // 100} €."}), 400
        if amount > rep_["wallet"]["available"]:
            return jsonify({"error": "Montant supérieur à ton solde disponible."}), 400
        info = rep_["payoutInfo"]
        db.execute("INSERT INTO edu_payouts (educator_id, amount, method, details, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)",
                   (user["id"], amount, info["method"], json.dumps(info, ensure_ascii=False), datetime.now(timezone.utc).isoformat()))
        db.commit()
    notify_admin_text = f"Demande de retrait éducateur : {user['first_name']} {user['last_name']} — {amount / 100:.2f} €"
    try:
        print(notify_admin_text)
    except Exception:
        pass
    return jsonify(edu_report(db, user))


@app.route("/admin/educators")
def admin_educators():
    admin = current_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    db = get_db()
    out = []
    for e in db.execute("SELECT * FROM users WHERE role = 'educator' ORDER BY first_name").fetchall():
        r = edu_report(db, e)
        out.append({"id": e["id"], "name": f"{e['first_name']} {e['last_name']}", "email": e["email"], "rate": r["rate"],
                    "invite": r["invite"], "totals": r["totals"], "wallet": r["wallet"],
                    "pendingPayouts": sum(1 for t in r["transactions"] if t["kind"] == "payout" and t.get("status") == "pending")})
    return jsonify({"educators": out, "defaultRate": EDU_DEFAULT_RATE})


@app.route("/admin/educators/<int:eid>/rate", methods=["POST"])
def admin_educator_rate(eid):
    admin = current_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    try:
        rate = round(float((request.get_json(silent=True) or {}).get("rate")), 4)
    except (TypeError, ValueError):
        return jsonify({"error": "Taux invalide."}), 400
    if not (0 <= rate <= 100):
        return jsonify({"error": "Le taux doit être entre 0 et 100 %."}), 400
    db = get_db()
    with db_lock:
        db.execute("UPDATE users SET commission_rate = ? WHERE id = ? AND role = 'educator'", (rate, eid))
        db.commit()
    return jsonify({"ok": True, "rate": rate})


@app.route("/admin/educators/<int:eid>/invite", methods=["POST"])
def admin_educator_invite(eid):
    admin = current_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    db = get_db()
    e = db.execute("SELECT * FROM users WHERE id = ?", (eid,)).fetchone()
    if not is_educator(e):
        return jsonify({"error": "Ce compte n'est pas éducateur."}), 400
    base = re.sub(r"[^a-z0-9]", "", (e["first_name"] or "").lower().translate(str.maketrans("àâäéèêëîïôöùûüç", "aaaeeeeiioouuuc")))[:10] or "edu"
    code = f"{base}-{secrets.token_hex(3)}"
    with db_lock:
        db.execute("UPDATE edu_invites SET active = 0 WHERE educator_id = ?", (eid,))
        db.execute("INSERT INTO edu_invites (code, educator_id, created_at, active) VALUES (?, ?, ?, 1)",
                   (code, eid, datetime.now(timezone.utc).isoformat()))
        db.commit()
    return jsonify({"code": code})


@app.route("/admin/payouts")
def admin_payouts():
    """Demandes de retrait des éducateurs (pour l'admin et CHEST HQ) ; ?status=pending|paid|refused."""
    admin = current_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    status = request.args.get("status")
    db = get_db()
    q = "SELECT p.*, u.first_name, u.last_name, u.email FROM edu_payouts p JOIN users u ON u.id = p.educator_id"
    rows = db.execute(q + (" WHERE p.status = ?" if status else "") + " ORDER BY p.id DESC", ((status,) if status else ())).fetchall()
    return jsonify({"payouts": [{"id": r["id"], "educator": f"{r['first_name']} {r['last_name']}", "email": r["email"],
                                 "educatorId": r["educator_id"], "amount": r["amount"], "method": r["method"],
                                 "details": json.loads(r["details"] or "{}"), "status": r["status"],
                                 "createdAt": r["created_at"], "processedAt": r["processed_at"], "note": r["admin_note"] or ""} for r in rows]})


@app.route("/admin/payouts/<int:pid>", methods=["POST"])
def admin_payout_update(pid):
    admin = current_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    b = request.get_json(silent=True) or {}
    status = b.get("status")
    if status not in ("paid", "refused"):
        return jsonify({"error": "Statut inconnu."}), 400
    db = get_db()
    with db_lock:
        cur = db.execute("SELECT status FROM edu_payouts WHERE id = ?", (pid,)).fetchone()
        if not cur:
            return jsonify({"error": "Demande introuvable."}), 404
        if cur["status"] != "pending":
            return jsonify({"error": "Cette demande a déjà été traitée."}), 400
        db.execute("UPDATE edu_payouts SET status = ?, processed_at = ?, admin_note = ? WHERE id = ?",
                   (status, datetime.now(timezone.utc).isoformat(), str(b.get("note") or "")[:240], pid))
        db.commit()
    return jsonify({"ok": True})


@app.route("/pricing", methods=["GET", "PUT"])
def pricing():
    if request.method == "GET":
        data = get_pricing()
        return jsonify({"offers": data["offers"], "updatedAt": get_setting("pricing_updated_at")})
    admin = current_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    try:
        data = validate_pricing(request.get_json(silent=True))
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    set_setting("pricing", json.dumps(data, ensure_ascii=False))
    now = datetime.now(timezone.utc).isoformat()
    set_setting("pricing_updated_at", now)
    return jsonify({"offers": data["offers"], "updatedAt": now})


@app.route("/billing/webhook", methods=["POST"])
def billing_webhook():
    payload = request.get_data()
    if not _verify_stripe(payload, request.headers.get("Stripe-Signature", "")):
        return jsonify({"error": "Signature invalide."}), 400
    try:
        event = json.loads(payload.decode("utf-8"))
    except ValueError:
        return jsonify({"error": "JSON invalide."}), 400
    etype = event.get("type", "")
    obj = (event.get("data") or {}).get("object") or {}
    db = get_db()
    with db_lock:
        if db.execute("SELECT 1 FROM billing_events WHERE id = ?", (event.get("id"),)).fetchone():
            return jsonify({"ok": True, "duplicate": True})
        user = _user_for_stripe(db, obj)
        uid = user["id"] if user else None
        now = datetime.now(timezone.utc)
        summary = etype
        if etype in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
            amount = obj.get("amount_subtotal") if obj.get("amount_subtotal") is not None else obj.get("amount_total")
            plan = plan_for_amount(amount)
            paid = obj.get("payment_status") in ("paid", "no_payment_required")
            if user and plan and paid:
                name, period = plan
                ends = now + (timedelta(days=366) if period == "year" else timedelta(days=31))
                sub = obj.get("subscription")
                cust = obj.get("customer")
                _set_plan(db, uid, name, period, "active", now, ends,
                          stripe_subscription_id=(sub.get("id") if isinstance(sub, dict) else sub),
                          stripe_customer_id=(cust.get("id") if isinstance(cust, dict) else cust),
                          plan_amount=int(obj.get("amount_total") or 0))
                summary = f"Paiement {PLANS[name]['label']} ({'annuel' if period == 'year' else 'mensuel'})"
            elif user and not paid:
                summary = "Paiement en attente de confirmation"
            else:
                summary = f"Paiement non rattaché (montant {amount}, membre {'trouvé' if user else 'inconnu'})"
            _log_billing(db, event.get("id"), uid, etype, int(obj.get("amount_total") or 0), summary)
        elif etype in ("invoice.paid", "invoice.payment_succeeded"):
            lines = (obj.get("lines") or {}).get("data") or []
            ends = [_ts((ln.get("period") or {}).get("end")) for ln in lines]
            ends = [e for e in ends if e]
            if user and ends:
                db.execute("UPDATE users SET plan_ends_at = ?, plan_status = 'active' WHERE id = ?", (_iso(max(ends)), uid))
            _log_billing(db, event.get("id"), uid, etype, int(obj.get("amount_paid") or 0), "Facture payée — accès prolongé")
        elif etype == "invoice.payment_failed":
            if user:
                db.execute("UPDATE users SET plan_status = 'past_due' WHERE id = ?", (uid,))
            _log_billing(db, event.get("id"), uid, etype, int(obj.get("amount_due") or 0), "Échec de paiement — Stripe va réessayer")
        elif etype == "customer.subscription.updated":
            if user:
                end = _sub_period_end(obj)
                status = "canceling" if obj.get("cancel_at_period_end") else ("active" if obj.get("status") in ("active", "trialing") else obj.get("status"))
                if end:
                    db.execute("UPDATE users SET plan_status = ?, plan_ends_at = ? WHERE id = ?", (status, _iso(end), uid))
                else:
                    db.execute("UPDATE users SET plan_status = ? WHERE id = ?", (status, uid))
            _log_billing(db, event.get("id"), uid, etype, 0, "Résiliation programmée en fin de période" if obj.get("cancel_at_period_end") else "Abonnement mis à jour")
        elif etype == "customer.subscription.deleted":
            if user:
                db.execute("UPDATE users SET plan_status = 'canceled', plan_ends_at = ? WHERE id = ?", (now.isoformat(), uid))
            _log_billing(db, event.get("id"), uid, etype, 0, "Abonnement terminé — accès coupé")
        else:
            _log_billing(db, event.get("id"), uid, etype, 0, etype)
        db.commit()
    return jsonify({"ok": True})


def _admin_member(db, row):
    out = user_public(row)
    since = (datetime.now(timezone.utc) - timedelta(days=30)).date().isoformat()
    acts = db.execute("SELECT day, page, views FROM user_activity WHERE user_id = ? AND day >= ?", (row["id"], since)).fetchall()
    pages = {}
    for a in acts:
        pages[a["page"]] = pages.get(a["page"], 0) + a["views"]
    today = datetime.now(timezone.utc).date()
    per_day = {}
    for a in acts:
        per_day[a["day"]] = per_day.get(a["day"], 0) + a["views"]
    last30 = [per_day.get((today - timedelta(days=i)).isoformat(), 0) for i in range(29, -1, -1)]
    last14 = last30[-14:]
    week = {(today - timedelta(days=i)).isoformat() for i in range(7)}
    out["activity"] = {
        "days30": len({a["day"] for a in acts}),
        "views30": sum(a["views"] for a in acts),
        "days7": len({a["day"] for a in acts if a["day"] in week}),
        "views7": sum(a["views"] for a in acts if a["day"] in week),
        "last14": last14,
        "last30": last30,
        "top": sorted(([p, v] for p, v in pages.items()), key=lambda x: -x[1])[:5],
    }
    out["lastLoginAt"] = _col(row, "last_login_at")
    out["lastSeenAt"] = _col(row, "last_seen_at")
    try:
        out["onboarding"] = json.loads(_col(row, "onboarding") or "null")
    except ValueError:
        out["onboarding"] = None
    out["billing"] = [dict(r) for r in db.execute(
        "SELECT type, amount, summary, created_at AS at FROM billing_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 6",
        (row["id"],)).fetchall()]
    out["amount"] = _col(row, "plan_amount")
    out["category"] = member_category(row)
    return out


@app.route("/members/<int:member_id>/access", methods=["POST"])
def member_access(member_id):
    """Offrir / changer l'accès d'un membre à la main (proches, geste commercial, correction)."""
    admin = current_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    denied = guard_principal(admin, member_id)
    if denied:
        return denied
    body = request.get_json(silent=True) or {}
    plan = body.get("plan")
    days = body.get("days")
    until = (body.get("until") or "").strip()
    if plan not in ("offert", "essentiel", "premium", "none"):
        return jsonify({"error": "Offre inconnue."}), 400
    db = get_db()
    if not db.execute("SELECT 1 FROM users WHERE id = ?", (member_id,)).fetchone():
        return jsonify({"error": "Compte introuvable."}), 404
    now = datetime.now(timezone.utc)
    ends = None
    if until:
        try:
            # 21:59 UTC = fin de soirée en France (22:59 l'hiver, 23:59 l'été) : la date affichée reste celle choisie.
            ends = datetime.fromisoformat(until[:10]).replace(hour=21, minute=59, second=59, tzinfo=timezone.utc)
        except ValueError:
            return jsonify({"error": "Date invalide."}), 400
        if ends <= now:
            return jsonify({"error": "La date de fin doit être dans le futur."}), 400
    elif days not in (None, "", 0):
        try:
            ends = now + timedelta(days=max(1, min(3660, int(days))))
        except (TypeError, ValueError):
            return jsonify({"error": "Durée invalide."}), 400
    elif plan != "offert" and plan != "none":
        return jsonify({"error": "Indique une durée pour cette offre."}), 400
    with db_lock:
        if plan == "none":
            _set_plan(db, member_id, "none", None, "manual", None, None)
        else:
            _set_plan(db, member_id, plan, None, "manual", now, ends)
        _log_billing(db, f"manual-{member_id}-{int(time.time())}", member_id, "manual", 0,
                     f"Accès modifié par l'admin : {PLANS.get(plan, {}).get('label', 'aucun accès')}" + (f" jusqu'au {ends.strftime('%d/%m/%Y')}" if ends else (" sans limite" if plan == "offert" else "")))
        db.commit()
    return jsonify(_admin_member(db, db.execute("SELECT * FROM users WHERE id = ?", (member_id,)).fetchone()))


@app.route("/members/<int:member_id>/role", methods=["POST"])
def member_role(member_id):
    """Hiérarchie : membre, éducateur (accès complet ; School plus tard) ou admin."""
    admin = current_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    denied = guard_principal(admin, member_id)
    if denied:
        return denied
    role = (request.get_json(silent=True) or {}).get("role")
    if role not in ("member", "educator", "manager", "admin"):
        return jsonify({"error": "Rôle inconnu."}), 400
    if role == "admin" and is_manager(admin):
        return jsonify({"error": "Seul un administrateur principal peut nommer un administrateur."}), 403
    db = get_db()
    target = db.execute("SELECT * FROM users WHERE id = ?", (member_id,)).fetchone()
    if not target:
        return jsonify({"error": "Compte introuvable."}), 404
    if member_id == admin["id"]:
        return jsonify({"error": "Tu ne peux pas changer ton propre rôle."}), 400
    principals = db.execute("SELECT COUNT(*) AS n FROM users WHERE is_admin = 1 AND COALESCE(role, '') != 'manager'").fetchone()["n"]
    if target["is_admin"] and not is_manager(target) and role != "admin" and principals <= 1:
        return jsonify({"error": "Il faut garder au moins un administrateur principal."}), 400
    labels = {"member": "Membre", "educator": "Éducateur", "manager": "Manageur", "admin": "Admin"}
    with db_lock:
        db.execute("UPDATE users SET is_admin = ?, role = ? WHERE id = ?",
                   (1 if role in ("admin", "manager") else 0, None if role == "admin" else role, member_id))
        _log_billing(db, f"role-{member_id}-{int(time.time())}", member_id, "role", 0, f"Rôle : {labels[role]}")
        db.commit()
    return jsonify(_admin_member(db, db.execute("SELECT * FROM users WHERE id = ?", (member_id,)).fetchone()))


MONTHLY_VALUE = {("essentiel", "month"): 99.98, ("essentiel", "year"): 1000 / 12,
                 ("premium", "month"): 299.98, ("premium", "year"): 3000 / 12, ("allstar", "year"): 9999.98 / 12}


def is_manager(row):
    """Manageur (2026-10-21) : un admin (is_admin = 1) avec role = 'manager'. Mêmes pouvoirs, accès complet
    illimité, mais pas d'accès à CHEST HQ et aucun pouvoir sur un admin principal."""
    return bool(row and row["is_admin"] and _col(row, "role") == "manager")


def guard_principal(admin, member_id):
    """Réponse d'erreur si un manageur vise un admin principal, sinon None."""
    if not is_manager(admin):
        return None
    t = get_db().execute("SELECT * FROM users WHERE id = ?", (member_id,)).fetchone()
    if t and t["is_admin"] and not is_manager(t):
        return jsonify({"error": "Un manageur ne peut pas modifier un administrateur principal."}), 403
    return None


def member_category(row):
    """Catégorie d'un membre dans la hiérarchie (même découpage que la page admin)."""
    if row["is_admin"]:
        return "manager" if _col(row, "role") == "manager" else "admin"
    if _col(row, "role") == "educator":
        return "educator"
    a = access_of(row)
    if a["active"]:
        return "privilege" if a["plan"] == "offert" else a["plan"]  # trial | essentiel | premium | allstar
    return "expired" if (a["trialUsed"] or a["plan"] not in ("none", None)) else "none"


@app.route("/admin/stats")
def admin_stats():
    admin = current_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    try:
        days = max(7, min(365, int(request.args.get("days", 30))))
    except ValueError:
        days = 30
    db = get_db()
    now = datetime.now(timezone.utc)
    today = now.date()
    start = today - timedelta(days=days - 1)
    prev_start = start - timedelta(days=days)
    rows = db.execute("SELECT * FROM users").fetchall()
    cats = {}
    for r in rows:
        c = member_category(r)
        cats[c] = cats.get(c, 0) + 1
    # Arrivées par jour (période) et sur la période précédente
    signups = {}
    prev_signups = 0
    for r in rows:
        d = (_parse_iso(r["created_at"]) or now).date()
        if d >= start:
            signups[d.isoformat()] = signups.get(d.isoformat(), 0) + 1
        elif d >= prev_start:
            prev_signups += 1
    series = []
    revenue = {}
    for r in db.execute("SELECT created_at, amount FROM billing_events WHERE type = 'invoice.paid' AND created_at >= ?", (start.isoformat(),)).fetchall():
        k = (_parse_iso(r["created_at"]) or now).date().isoformat()
        revenue[k] = revenue.get(k, 0) + (r["amount"] or 0) / 100
    act_rows = {r["day"]: r for r in db.execute(
        "SELECT day, COUNT(DISTINCT user_id) AS users, SUM(views) AS views FROM user_activity WHERE day >= ? GROUP BY day",
        (start.isoformat(),)).fetchall()}
    for i in range(days):
        d = (start + timedelta(days=i)).isoformat()
        a = act_rows.get(d)
        series.append({"day": d, "signups": signups.get(d, 0), "users": a["users"] if a else 0, "views": a["views"] if a else 0,
                       "revenue": round(revenue.get(d, 0), 2)})
    pages = [[r["page"], r["v"]] for r in db.execute(
        "SELECT page, SUM(views) AS v FROM user_activity WHERE day >= ? GROUP BY page ORDER BY v DESC LIMIT 8",
        (start.isoformat(),)).fetchall()]

    def distinct_since(n):
        d = (today - timedelta(days=n - 1)).isoformat()
        return db.execute("SELECT COUNT(DISTINCT user_id) AS n FROM user_activity WHERE day >= ?", (d,)).fetchone()["n"]

    mrr = 0.0
    paying = 0
    for r in rows:
        a = access_of(r)
        if a["active"] and a["plan"] in ("essentiel", "premium", "allstar") and not r["is_admin"]:
            paying += 1
            amount = _col(r, "plan_amount")
            if amount:
                mrr += amount / 100 / (12 if a["period"] == "year" else 1)
            else:
                mrr += MONTHLY_VALUE.get((a["plan"], a["period"] or "month"), 0)

    def collected(a, b):
        return db.execute("SELECT COALESCE(SUM(amount), 0) AS s FROM billing_events WHERE type = 'invoice.paid' AND created_at >= ? AND created_at < ?",
                          (a.isoformat(), b.isoformat())).fetchone()["s"] / 100

    trial_started = db.execute("SELECT COUNT(*) AS n FROM users WHERE trial_used = 1").fetchone()["n"]
    trial_paid = db.execute("SELECT COUNT(*) AS n FROM users WHERE trial_used = 1 AND stripe_subscription_id IS NOT NULL").fetchone()["n"]
    churn = db.execute("SELECT COUNT(*) AS n FROM billing_events WHERE type = 'customer.subscription.deleted' AND created_at >= ?",
                       (start.isoformat(),)).fetchone()["n"]
    return jsonify({
        "days": days,
        "categories": cats,
        "members": len(rows),
        "paying": paying,
        "mrr": round(mrr, 2),
        "collected": round(collected(datetime.combine(start, datetime.min.time(), timezone.utc), now + timedelta(seconds=1)), 2),
        "collectedPrev": round(collected(datetime.combine(prev_start, datetime.min.time(), timezone.utc), datetime.combine(start, datetime.min.time(), timezone.utc)), 2),
        "signups": sum(signups.values()),
        "signupsPrev": prev_signups,
        "active1": distinct_since(1),
        "active7": distinct_since(7),
        "active30": distinct_since(30),
        "trial": {"started": trial_started, "converted": trial_paid},
        "churn": churn,
        "series": series,
        "pages": pages,
    })


# ---------------------------------------------------------------- School
def approved_user():
    # Compte approuvé ET accès en cours (essai, offre payée ou offerte). Sans accès, les données de la
    # plateforme (scanners, School, synchro, alertes…) sont refusées comme si on n'était pas connecté ;
    # /me, /billing/* et /me/* passent par current_user() et restent ouverts pour choisir une offre.
    u = current_user()
    if not u or u["status"] != "approved":
        return None
    return u if access_of(u)["active"] else None


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
    user = approved_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    if not access_of(user)["school"]:
        return jsonify({"entries": [], "seeded": True, "locked": True})
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


@app.route("/scanners/board")
def scanners_board():
    # Volet « Force du marché » de Pulse (2026-10-18) : tendance EMA 500 et score Pulse par marché, calculés en
    # fond par scanner-server avec son propre compte Twelve Data. Aucune bougie, seulement des scores.
    if not approved_user():
        return jsonify({"error": "Non connecté."}), 401
    try:
        return jsonify(_scanner_call("/board") or {"enabled": False, "markets": {}})
    except Exception:
        return jsonify({"enabled": False, "markets": {}}), 503


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
                                          url=f"/strategies?scanner={scanner}&symbol={symbol}&tf={tf}&alert=1&side={side}",
                                          icon=f"{SITE_URL}/{logo}")
        sent += res.get("sent", 0)
    return jsonify({"sent": sent})


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


VPS_PUSH_MAX_POSITIONS = 200
VPS_PUSH_MAX_DEALS = 2000
VPS_EQUITY_STEP_SEC = 15 * 60


def _clean_deal(d):
    """Une position clôturée telle qu'envoyée par CHESTAccountPush.mq5 (heures déjà en UTC, secondes)."""
    try:
        ticket = int(d.get("ticket"))
        close_time = int(d.get("closeTime"))
    except (TypeError, ValueError):
        return None
    side = "sell" if str(d.get("side", "")).lower() == "sell" else "buy"
    return ticket, close_time, {
        "ticket": ticket, "position": d.get("position"), "symbol": str(d.get("symbol") or "")[:20], "side": side,
        "volume": _num(d.get("volume")), "openTime": _num(d.get("openTime")), "closeTime": close_time,
        "openPrice": _num(d.get("openPrice")), "closePrice": _num(d.get("closePrice")),
        "sl": _num(d.get("sl")), "tp": _num(d.get("tp")),
        "profit": _num(d.get("profit")), "swap": _num(d.get("swap")), "commission": _num(d.get("commission")),
    }


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
        db = get_db()
        cur = db.execute("DELETE FROM vps_accounts WHERE id = ? AND user_id = ?", (vid, user["id"]))
        if cur.rowcount:
            db.execute("DELETE FROM vps_deals WHERE vps_id = ?", (vid,))
            db.execute("DELETE FROM vps_equity WHERE vps_id = ?", (vid,))
        db.commit()
    return jsonify({"ok": cur.rowcount > 0})


@app.route("/vps/history/<vid>")
def vps_history(vid):
    user = approved_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    db = get_db()
    if not db.execute("SELECT 1 FROM vps_accounts WHERE id = ? AND user_id = ?", (vid, user["id"])).fetchone():
        return jsonify({"error": "Compte introuvable."}), 404
    try:
        days = max(1, min(800, int(request.args.get("days", 400))))
    except ValueError:
        days = 400
    since = int(time.time()) - days * 86400
    deals = [json.loads(r["data"]) for r in db.execute(
        "SELECT data FROM vps_deals WHERE vps_id = ? AND close_time >= ? ORDER BY close_time", (vid, since)).fetchall()]
    equity = [{"ts": r["ts"], "balance": r["balance"], "equity": r["equity"]} for r in db.execute(
        "SELECT ts, balance, equity FROM vps_equity WHERE vps_id = ? AND ts >= ? ORDER BY ts", (vid, since)).fetchall()]
    return jsonify({"deals": deals, "equity": equity})


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
    row = db.execute("SELECT id, last_data FROM vps_accounts WHERE id = ?", (vid,)).fetchone()
    if not row:
        return jsonify({"error": "Identifiant inconnu."}), 404
    prev = json.loads(row["last_data"]) if row["last_data"] else {}
    body = request.get_json(silent=True) or {}
    positions = body.get("positions")
    if not isinstance(positions, list):
        positions = []
    data = {
        "deposits": _num(body.get("deposits")),
        "withdrawals": _num(body.get("withdrawals")),
        "eaVersion": (str(body.get("eaVersion") or "")[:12] or None),
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
    # L'EA n'envoie dépôts/retraits qu'à la synchro complète (toutes les 30 min) : un envoi léger ne
    # doit pas effacer ces valeurs (ni la version de l'EA).
    for k in ("deposits", "withdrawals", "eaVersion"):
        if data[k] is None and prev.get(k) is not None:
            data[k] = prev[k]
    deals = body.get("deals")
    deals = [x for x in (_clean_deal(d) for d in (deals if isinstance(deals, list) else [])[:VPS_PUSH_MAX_DEALS] if isinstance(d, dict)) if x]
    now = int(time.time())
    with db_lock:
        db.execute(
            "UPDATE vps_accounts SET last_data = ?, last_push_at = ? WHERE id = ?",
            (json.dumps(data), data["updatedAt"], vid),
        )
        if deals:
            db.executemany(
                "INSERT INTO vps_deals (vps_id, ticket, close_time, data) VALUES (?, ?, ?, ?) "
                "ON CONFLICT(vps_id, ticket) DO UPDATE SET close_time = excluded.close_time, data = excluded.data",
                [(vid, t, c, json.dumps(d)) for t, c, d in deals],
            )
        last = db.execute("SELECT MAX(ts) AS ts FROM vps_equity WHERE vps_id = ?", (vid,)).fetchone()["ts"]
        if data["balance"] is not None and (last is None or now - last >= VPS_EQUITY_STEP_SEC):
            db.execute("INSERT OR REPLACE INTO vps_equity (vps_id, ts, balance, equity) VALUES (?, ?, ?, ?)",
                       (vid, now, data["balance"], data["equity"]))
        db.commit()
    return jsonify({"ok": True, "deals": len(deals)})


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
    if not access_of(user)["sync"]:
        return jsonify({"data": {}, "local": True})
    db = get_db()
    rows = db.execute("SELECT key, value FROM user_data WHERE user_id = ?", (user["id"],)).fetchall()
    return jsonify({"data": {r["key"]: r["value"] for r in rows}})


HISTORY_KEEP = 30
_EMPTY_VALUES = ("", "[]", "{}", "null", '""')


def _keep_history(db, user_id, key, new_value, now):
    """Garde la valeur actuelle avant qu'elle soit remplacée (si elle a du contenu et qu'elle change)."""
    old = db.execute("SELECT value FROM user_data WHERE user_id = ? AND key = ?", (user_id, key)).fetchone()
    if not old or old["value"] == new_value or (old["value"] or "").strip() in _EMPTY_VALUES:
        return
    db.execute("INSERT INTO user_data_history (user_id, key, value, saved_at) VALUES (?, ?, ?, ?)",
               (user_id, key, old["value"], now))
    db.execute("DELETE FROM user_data_history WHERE user_id = ? AND key = ? AND id NOT IN "
               "(SELECT id FROM user_data_history WHERE user_id = ? AND key = ? ORDER BY id DESC LIMIT ?)",
               (user_id, key, user_id, key, HISTORY_KEEP))


def _items_of(value):
    try:
        v = json.loads(value)
    except (TypeError, ValueError):
        return None
    return len(v) if isinstance(v, (list, dict)) else None


@app.route("/sync/history")
def sync_history():
    user = approved_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    key = request.args.get("key", "")
    db = get_db()
    rows = db.execute("SELECT id, value, saved_at FROM user_data_history WHERE user_id = ? AND key = ? ORDER BY id DESC",
                      (user["id"], key)).fetchall()
    cur = db.execute("SELECT value, updated_at FROM user_data WHERE user_id = ? AND key = ?", (user["id"], key)).fetchone()
    return jsonify({
        "current": {"items": _items_of(cur["value"]), "updatedAt": cur["updated_at"]} if cur else None,
        "versions": [{"id": r["id"], "savedAt": r["saved_at"], "items": _items_of(r["value"]), "size": len(r["value"])} for r in rows],
    })


@app.route("/sync/restore", methods=["POST"])
def sync_restore():
    user = approved_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    vid = (request.get_json(silent=True) or {}).get("id")
    db = get_db()
    row = db.execute("SELECT key, value FROM user_data_history WHERE id = ? AND user_id = ?", (vid, user["id"])).fetchone()
    if not row:
        return jsonify({"error": "Sauvegarde introuvable."}), 404
    now = datetime.now(timezone.utc).isoformat()
    with db_lock:
        _keep_history(db, user["id"], row["key"], row["value"], now)
        db.execute("INSERT INTO user_data (user_id, key, value, updated_at) VALUES (?, ?, ?, ?) "
                   "ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
                   (user["id"], row["key"], row["value"], now))
        db.commit()
    return jsonify({"key": row["key"], "value": row["value"]})


@app.route("/sync", methods=["POST"])
def sync_post():
    user = approved_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    if not access_of(user)["sync"]:
        return jsonify({"error": "Pendant l'essai, tes données restent sur ton appareil.", "local": True}), 403
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
            _keep_history(db, user["id"], key, value, now)
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
            "ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth",
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
    payload = json.dumps({"title": title, "body": body_text, "url": url or "/dashboard", "icon": icon})
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
    url = body.get("url") or "/dashboard"
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
            _send_push_to_subscriptions(subs, line, "", "/journal")
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
    url = body.get("url") or "/dashboard"
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
