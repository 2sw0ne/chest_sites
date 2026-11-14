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

from flask import Flask, g, jsonify, redirect, request, send_from_directory
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


SITE_URL = os.environ.get("SITE_URL", "https://www.ch3st.app").rstrip("/")


def send_mail(to, subject, html, text):
    """Envoie un e-mail avec le compte SMTP de CHEST (variables SMTP_* de Railway). Renvoie '' ou l'erreur."""
    if not (SMTP_HOST and SMTP_USER and SMTP_PASSWORD):
        return "L'envoi d'e-mails n'est pas configuré (variables SMTP_HOST, SMTP_USER, SMTP_PASSWORD sur Railway)."
    from email.mime.multipart import MIMEMultipart
    from email.utils import formataddr, make_msgid
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        sender = SMTP_FROM or SMTP_USER
        msg["From"] = sender if "<" in sender else formataddr(("CHEST", sender))
        msg["To"] = to
        msg["Message-ID"] = make_msgid(domain="ch3st.app")
        msg.attach(MIMEText(text, "plain", "utf-8"))
        msg.attach(MIMEText(html, "html", "utf-8"))
        port = SMTP_PORT
        if port == 465:
            with smtplib.SMTP_SSL(SMTP_HOST, port, timeout=15) as server:
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.sendmail(SMTP_USER, [to], msg.as_string())
        else:
            with smtplib.SMTP(SMTP_HOST, port, timeout=15) as server:
                server.starttls()
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.sendmail(SMTP_USER, [to], msg.as_string())
        return ""
    except Exception as exc:
        return f"Envoi impossible : {type(exc).__name__}"


MAIL_KINDS = {
    "avertissement": ("Avertissement", "#e8b339"),
    "information": ("Information", "#fc1283"),
    "rappel": ("Rappel", "#f9a45e"),
    "compte": ("Ton compte", "#33e6a6"),
}


def _h(v):
    return (str(v or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;"))


def render_mail(kind, title, paragraphs, first_name="", cta=None, signature="L'équipe CHEST"):
    """L'e-mail de CHEST : fond noir, logo, filet dégradé rose → orange, une carte, un bouton. Tables et styles en
    ligne (les messageries ignorent le CSS externe) ; une version texte pour les messageries sans HTML."""
    label, color = MAIL_KINDS.get(kind, MAIL_KINDS["information"])
    paras = [p for p in (paragraphs or []) if str(p).strip()][:8]
    hello = f"Salut {_h(first_name)}," if first_name else "Salut,"
    body = "".join(f'<p style="margin:0 0 14px;font:400 15px/1.6 Helvetica,Arial,sans-serif;color:#c9c9cf">{_h(p)}</p>' for p in paras)
    button = ""
    if cta and cta.get("label") and str(cta.get("url", "")).startswith("https://"):
        button = (f'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 6px"><tr><td style="border-radius:999px;'
                  f'background:#fc1283;background-image:linear-gradient(135deg,#fc1283,#f9a45e)"><a href="{_h(cta["url"])}" '
                  f'style="display:inline-block;padding:12px 24px;font:600 14px Helvetica,Arial,sans-serif;color:#ffffff;text-decoration:none">{_h(cta["label"])}</a></td></tr></table>')
    html = f"""<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><title>{_h(title)}</title></head>
<body style="margin:0;padding:0;background:#050505">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#050505"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 4px 20px"><img src="{SITE_URL}/assets/logo-chest.png" width="36" height="36" alt="CHEST" style="vertical-align:middle;border:0;border-radius:9px">
<span style="font:700 18px Helvetica,Arial,sans-serif;color:#f6f6f7;letter-spacing:-.02em;vertical-align:middle;padding-left:10px">CHEST</span></td></tr>
<tr><td style="background:#0d0d10;border:1px solid #1f1f25;border-radius:18px;overflow:hidden">
<div style="height:3px;background:#fc1283;background-image:linear-gradient(90deg,#fc1283,#f9a45e)"></div>
<div style="padding:28px 28px 22px">
<p style="margin:0 0 14px;font:700 10px Helvetica,Arial,sans-serif;letter-spacing:.24em;text-transform:uppercase;color:{color}">{_h(label)}</p>
<h1 style="margin:0 0 18px;font:700 24px/1.25 Helvetica,Arial,sans-serif;letter-spacing:-.03em;color:#f6f6f7">{_h(title)}</h1>
<p style="margin:0 0 14px;font:400 15px/1.6 Helvetica,Arial,sans-serif;color:#f6f6f7">{hello}</p>
{body}{button}
<p style="margin:22px 0 0;font:400 15px/1.6 Helvetica,Arial,sans-serif;color:#c9c9cf">{_h(signature)}</p>
</div></td></tr>
<tr><td style="padding:18px 6px 0;font:400 12px/1.6 Helvetica,Arial,sans-serif;color:#5c5c63">
Tu reçois ce message parce que tu as un compte sur CHEST. Une question ? Réponds simplement à cet e-mail.<br>
<a href="{SITE_URL}" style="color:#9b9ba1;text-decoration:none">ch3st.app</a></td></tr>
</table></td></tr></table></body></html>"""
    text = "\n\n".join([hello] + [str(p) for p in paras] + ([f"{cta['label']} : {cta['url']}"] if button else []) + [signature, f"CHEST · {SITE_URL}"])
    return html, text


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
            CREATE TABLE IF NOT EXISTS user_files (
                key TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                size INTEGER NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        db.execute("CREATE INDEX IF NOT EXISTS idx_user_files_user ON user_files (user_id)")
        # Backtests un par un (2026-11-04) : plus un seul gros bloc chest_backtests dans user_data, mais une ligne
        # par backtest (valeur rangée dans le bucket au-delà de 64 Ko, voir ud_put). Le navigateur les garde dans
        # IndexedDB (js/backtest-store.js) : plus de limite de 5 Mo, seule compte l'espace du membre.
        db.execute("""
            CREATE TABLE IF NOT EXISTS user_backtests (
                user_id INTEGER NOT NULL,
                id TEXT NOT NULL,
                value TEXT NOT NULL,
                size INTEGER NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (user_id, id)
            )
        """)
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
        # Connexion BERICH « clé en main » (Premium 3, 2026-10-28) : le membre donne son broker et ses accès MT5,
        # son éducateur installe le VPS lui-même. Mot de passe chiffré (Fernet, clé hors base).
        # Suivi élève–éducateur (2026-10-28, « comme Pronote ») : rendez-vous, notes, bibliothèque partagée.
        db.execute("""
            CREATE TABLE IF NOT EXISTS mentor_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT, member_id INTEGER NOT NULL, author_id INTEGER NOT NULL,
                starts_at TEXT NOT NULL, minutes INTEGER NOT NULL DEFAULT 45, topic TEXT, mode TEXT, link TEXT,
                status TEXT NOT NULL DEFAULT 'proposed', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS mentor_notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT, member_id INTEGER NOT NULL, author_id INTEGER NOT NULL,
                event_id INTEGER, title TEXT, body TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS mentor_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT, member_id INTEGER NOT NULL, author_id INTEGER NOT NULL,
                title TEXT NOT NULL, due_at TEXT, done_at TEXT, created_at TEXT NOT NULL
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS mentor_library (
                id INTEGER PRIMARY KEY AUTOINCREMENT, member_id INTEGER NOT NULL, author_id INTEGER NOT NULL,
                kind TEXT NOT NULL, title TEXT, body TEXT, url TEXT, file TEXT, created_at TEXT NOT NULL
            )
        """)
        # Planning commun (2026-10-28) : l'admin pose un appel collectif (éventuellement chaque semaine) ou une mission chez
        # tous les élèves, ou chez ceux de certains éducateurs ; chaque copie garde common_id pour tout retirer d'un coup.
        # Preuve des consentements (2026-10-30) : inscription (CGU, confidentialité, risques, 18 ans), nouvelle version
        # des CGU, règles du programme éducateur, achat (CGV + renonciation au droit de rétractation). Gardée même après
        # suppression du compte : c'est la preuve du contrat (durée légale de conservation).
        db.execute("""
            CREATE TABLE IF NOT EXISTS user_consents (
                id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, email TEXT, kind TEXT NOT NULL,
                version TEXT NOT NULL, detail TEXT, ip TEXT, user_agent TEXT, created_at TEXT NOT NULL
            )
        """)
        # Notes personnelles de l'éducateur (2026-10-30) : une note par membre, privée — le membre ne la voit jamais.
        db.execute("""
            CREATE TABLE IF NOT EXISTS edu_member_notes (
                author_id INTEGER NOT NULL, member_id INTEGER NOT NULL, body TEXT NOT NULL DEFAULT '',
                updated_at TEXT, PRIMARY KEY (author_id, member_id)
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS mentor_common (
                id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, title TEXT NOT NULL, starts_at TEXT, minutes INTEGER,
                mode TEXT, link TEXT, due_at TEXT, weeks INTEGER NOT NULL DEFAULT 1, scope TEXT, author_id INTEGER NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        for t in ("mentor_events", "mentor_tasks"):
            if "common_id" not in [c[1] for c in db.execute(f"PRAGMA table_info({t})").fetchall()]:
                db.execute(f"ALTER TABLE {t} ADD COLUMN common_id INTEGER")
        # School v3 (2026-10-28) : planning de la semaine et infos, chacun avec son public. Un appel collectif n'est plus
        # copié chez chaque élève : il vit une seule fois (school_events) et chacun le voit selon audience/scope
        # (all = tout le monde, members = les membres, educators = l'équipe, students = élèves des éducateurs de scope).
        db.execute("""
            CREATE TABLE IF NOT EXISTS school_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT, starts_at TEXT NOT NULL,
                minutes INTEGER NOT NULL DEFAULT 60, mode TEXT, link TEXT, flyer TEXT, audience TEXT NOT NULL, scope TEXT,
                weeks INTEGER NOT NULL DEFAULT 1, author_id INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS school_posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT, image TEXT, audience TEXT NOT NULL,
                scope TEXT, pinned INTEGER NOT NULL DEFAULT 0, author_id INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            )
        """)
        for name in ("format", "idea", "status"):
            if name not in [c[1] for c in db.execute("PRAGMA table_info(school_posts)").fetchall()]:
                db.execute(f"ALTER TABLE school_posts ADD COLUMN {name} TEXT")
        for name in ("body", "flyer"):
            if name not in [c[1] for c in db.execute("PRAGMA table_info(mentor_events)").fetchall()]:
                db.execute(f"ALTER TABLE mentor_events ADD COLUMN {name} TEXT")
        # Notifications School (2026-11-08) : qui a ajouté un appel, une mission, une Idea, un contenu ; rappels 15 min avant.
        db.execute("""
            CREATE TABLE IF NOT EXISTS school_notifs (
                id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL,
                body TEXT, url TEXT, actor_id INTEGER, created_at TEXT NOT NULL
            )
        """)
        db.execute("CREATE INDEX IF NOT EXISTS school_notifs_user ON school_notifs (user_id, created_at)")
        db.execute("CREATE TABLE IF NOT EXISTS school_reminders (key TEXT PRIMARY KEY, sent_at TEXT NOT NULL)")
        # Signature d'un admin (2026-11-08) : « chest » (au nom de CHEST) ou « me » (son prénom). Vide = comportement
        # d'avant : rendez-vous et missions signés CHEST, Idea signées du prénom.
        for t in ("school_events", "school_posts", "mentor_events", "mentor_tasks", "mentor_common"):
            if "signed" not in [c[1] for c in db.execute(f"PRAGMA table_info({t})").fetchall()]:
                db.execute(f"ALTER TABLE {t} ADD COLUMN signed TEXT")
        if "audience" not in [c[1] for c in db.execute("PRAGMA table_info(mentor_common)").fetchall()]:
            db.execute("ALTER TABLE mentor_common ADD COLUMN audience TEXT")
        # Couleur de chaque membre de l'équipe dans le planning commun (2026-10-28) : un éducateur = une couleur.
        if "staff_color" not in [c[1] for c in db.execute("PRAGMA table_info(users)").fetchall()]:
            db.execute("ALTER TABLE users ADD COLUMN staff_color TEXT")
        # BERICH v3 (2026-10-28) : backtests des algorithmes, importés par l'admin et gardés sur le volume (jamais dans le
        # dépôt public), et plan de chaque membre (quiz → algorithme + money management).
        db.execute("CREATE TABLE IF NOT EXISTS berich_algos (key TEXT PRIMARY KEY, name TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL)")
        db.execute("CREATE TABLE IF NOT EXISTS berich_plans (user_id INTEGER PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL)")
        # Rattachement (2026-10-28) : l'équipe branche le compte du membre sur le ou les algorithmes de son plan.
        for name in ("attached_at", "attached_algos"):
            if name not in [c[1] for c in db.execute("PRAGMA table_info(berich_plans)").fetchall()]:
                db.execute(f"ALTER TABLE berich_plans ADD COLUMN {name} TEXT")
        db.execute("""
            CREATE TABLE IF NOT EXISTS berich_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                educator_id INTEGER,
                broker_id TEXT, broker_name TEXT, kind TEXT, server TEXT, login TEXT, password_enc TEXT,
                phase TEXT, rules TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL, done_at TEXT, note TEXT
            )
        """)
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
        # Paiement par virement (2026-11-14) : réglage du parrain (éducateur ou admin) + virements déclarés par ses membres
        db.execute("""
            CREATE TABLE IF NOT EXISTS transfer_settings (
                user_id INTEGER PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0,
                holder TEXT, iban TEXT, bic TEXT, revolut TEXT, updated_at TEXT NOT NULL
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS transfer_payments (
                id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, referrer_id INTEGER, offer TEXT NOT NULL,
                eur REAL NOT NULL, reference TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'declared',
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL, note TEXT
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS edu_fees (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                educator_id INTEGER NOT NULL,
                month TEXT NOT NULL,
                amount INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'declared',
                created_at TEXT NOT NULL,
                processed_at TEXT,
                admin_note TEXT
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
        # Paiement en crypto (2026-11-12) : USDC sur Solana (Solana Pay), détecté sur la blockchain, validé par l'admin
        db.execute("""
            CREATE TABLE IF NOT EXISTS crypto_payments (
                id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, offer TEXT NOT NULL, eur REAL NOT NULL,
                usdc REAL NOT NULL, reference TEXT NOT NULL UNIQUE, wallet TEXT NOT NULL, status TEXT NOT NULL,
                signature TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            )
        """)
        # Fil d'une IDEA (2026-11-11) : mises à jour de la position publiées sous l'IDEA, comme une conversation
        db.execute("""
            CREATE TABLE IF NOT EXISTS school_post_updates (
                id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL, author_id INTEGER NOT NULL,
                body TEXT NOT NULL, signed TEXT, created_at TEXT NOT NULL
            )
        """)
        # Facture Railway (2026-11-10) : relevé de la consommation du mois toutes les 30 min, avec le mode en cours,
        # pour mesurer ce que coûte chaque mode (Admin → Système).
        db.execute("""
            CREATE TABLE IF NOT EXISTS railway_usage (
                id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, mode TEXT NOT NULL, usage REAL NOT NULL, period_start TEXT
            )
        """)
        # Alertes sur un prix (2026-11-09) : posées depuis le clic droit du graphique des scanners ; prévenues une fois.
        db.execute("""
            CREATE TABLE IF NOT EXISTS price_alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, symbol TEXT NOT NULL, price REAL NOT NULL,
                dir TEXT NOT NULL, created_at TEXT NOT NULL, fired_at TEXT
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
        if "berich_seen_at" not in [c[1] for c in db.execute("PRAGMA table_info(vps_accounts)").fetchall()]:
            db.execute("ALTER TABLE vps_accounts ADD COLUMN berich_seen_at TEXT")
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
                    ("referred_by", "INTEGER"), ("commission_rate", "REAL"),
                    # Rangs (2026-10-28) : Essentiel / Premium 1, 2, 3 = accès de 3, 6, 12 mois
                    ("plan_level", "INTEGER"),
                    # Code de référent choisi par l'éducateur (2026-10-28) : une seule fois, 8 caractères max
                    ("edu_code", "TEXT"),
                    # Documents légaux (2026-10-30) : version des CGU acceptée, et des règles du programme éducateur
                    ("terms_version", "TEXT"), ("edu_terms_version", "TEXT"),
                    # Discipline de l'éducateur (2026-11-04) : le scanner auquel il est affilié
                    ("edu_scanner", "TEXT"),
                    # Stockage (2026-11-04) : quota choisi par l'admin pour ce membre, en Mo (vide = quota de son offre)
                    ("storage_quota_mb", "INTEGER"),
                    # Photo de profil (2026-11-08) : fichier envoyé par le membre (dict de save_upload en JSON)
                    ("avatar", "TEXT")]
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
        # Journal des interactions avec la plateforme (2026-10-29) : connexions, échecs, inscriptions, retraits,
        # paiements, remboursements, actions de l'équipe, signaux d'abus. Lu par CHEST HQ (GET /admin/events) :
        # Atlas le transmet aux agents (Sécurité, Communauté, Société). Adresse IP tronquée, jamais d'e-mail.
        db.execute("""
            CREATE TABLE IF NOT EXISTS event_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                at TEXT NOT NULL,
                user_id INTEGER,
                kind TEXT NOT NULL,
                level TEXT NOT NULL DEFAULT 'info',
                detail TEXT,
                ip TEXT,
                device TEXT
            )
        """)
        db.execute("CREATE INDEX IF NOT EXISTS event_log_user ON event_log (user_id, kind, at)")
        # La boîte aux lettres de CHEST HQ (2026-10-30) : le QG (sur le PC du patron) y dépose ce qui attend sa
        # décision (actions, autorisations, comptes rendus) ; l'application téléphone (chest-hq.vercel.app) les lit,
        # le patron balaie oui / non ou écrit à Atlas ; le QG relit et exécute. Rien ne s'exécute ici.
        db.execute("""
            CREATE TABLE IF NOT EXISTS hq_cards (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL,
                title TEXT NOT NULL,
                summary TEXT,
                body TEXT,
                meta TEXT,
                status TEXT NOT NULL DEFAULT 'attente',
                note TEXT,
                created_at TEXT NOT NULL,
                decided_at TEXT,
                decided_by INTEGER,
                acked INTEGER NOT NULL DEFAULT 0
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS hq_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                text TEXT NOT NULL,
                card_id TEXT,
                author_id INTEGER,
                status TEXT NOT NULL DEFAULT 'envoye',
                created_at TEXT NOT NULL
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS hq_devices (
                endpoint TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                p256dh TEXT NOT NULL,
                auth TEXT NOT NULL,
                created_at TEXT NOT NULL
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


def _ip_prefix(ip):
    """L'adresse tronquée (réseau /24 en IPv4, /48 en IPv6) : assez pour voir un compte partagé, jamais l'adresse exacte."""
    ip = str(ip or "")
    if ":" in ip:
        return ":".join(ip.split(":")[:3]) + "::/48"
    parts = ip.split(".")
    return ".".join(parts[:3]) + ".0/24" if len(parts) == 4 else "?"


def _device():
    ua = request.headers.get("User-Agent", "")
    os_ = next((n for k, n in (("iPhone", "iPhone"), ("iPad", "iPad"), ("Android", "Android"), ("Windows", "Windows"),
                                 ("Mac OS", "Mac"), ("Linux", "Linux")) if k in ua), "autre")
    br = next((n for k, n in (("Edg/", "Edge"), ("OPR/", "Opera"), ("Chrome/", "Chrome"), ("Firefox/", "Firefox"),
                                ("Safari/", "Safari")) if k in ua), "autre")
    return f"{br} · {os_}"


def log_event(db, kind, user_id=None, detail="", level="info", locked=False, with_request=True):
    """Une ligne du journal. locked=True quand l'appelant tient déjà db_lock (il fait le commit)."""
    row = (datetime.now(timezone.utc).isoformat(), user_id, kind, level, str(detail or "")[:400],
           _ip_prefix(_client_ip()) if with_request else None, _device() if with_request else None)
    sql = "INSERT INTO event_log (at, user_id, kind, level, detail, ip, device) VALUES (?, ?, ?, ?, ?, ?, ?)"
    if locked:
        db.execute(sql, row)
        return
    with db_lock:
        db.execute(sql, row)
        db.commit()


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
        "terms": {"accepted": _col(row, "terms_version"), "current": TERMS_VERSION,
                  "eduAccepted": _col(row, "edu_terms_version"), "eduCurrent": EDU_TERMS_VERSION},
        "access": access_of(row),
        "role": ("manager" if _col(row, "role") == "manager" else "admin") if row["is_admin"] else (_col(row, "role") or "member"),
        "avatar": _avatar_key(_col(row, "avatar")),
        "scanner": _col(row, "edu_scanner"),
    }


def _avatar_key(raw):
    """Clé du fichier de la photo de profil (servie par /school/files/<clé>), ou None."""
    try:
        return (json.loads(raw) or {}).get("key") if raw else None
    except (ValueError, AttributeError):
        return None


# Taille des envois (audit 2026-11-05) : la limite globale de 2 Go (vidéos) valait pour TOUTES les routes, y compris
# publiques (/signup, /login) : un envoi JSON énorme était chargé en mémoire par get_json() et pouvait faire tomber le
# service. Les fichiers (multipart, écrits sur disque par morceaux) gardent 2 Go ; la synchro et les backtests 256 Mo ;
# le reste 4 Mo.
@app.before_request
def _body_limit():
    n = request.content_length or 0
    if n <= 4 * 1024 * 1024 or request.mimetype == "multipart/form-data":
        return None
    p = request.path
    lim = 256 * 1024 * 1024 if (p == "/sync" or p.startswith("/btstore/") or p.startswith("/backtests/")) else 32 * 1024 * 1024 if (p.startswith("/vps/") or p.startswith("/hq/")) else 4 * 1024 * 1024
    if n > lim:
        return jsonify({"error": "Envoi trop volumineux."}), 413
    return None


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


_AUDIT_ADMIN = re.compile(r"^/members/(\d+)/(approve|reject|block|delete|role|access|reset-password)$")
SCANNER_DAILY_ALERT = 400  # au-delà, par jour et par membre : lecture massive des scanners (aspiration)


@app.after_request
def _audit(resp):
    """Le journal des interactions : relevé ici, après chaque route sensible, pour ne jamais casser la route elle-même."""
    try:
        path, method, code = request.path, request.method, resp.status_code
        if method == "OPTIONS":
            return resp
        body = request.get_json(silent=True) if request.is_json else None
        body = body if isinstance(body, dict) else {}
        db = get_db()
        if path == "/login" and method == "POST":
            email = str(body.get("email") or "").strip().lower()
            row = db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone() if email else None
            uid = row["id"] if row else None
            if code == 200:
                log_event(db, "connexion", uid)
                # compte partagé ? trois réseaux différents en 24 h (une alerte par jour au plus)
                since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
                nets = {r["ip"] for r in db.execute("SELECT ip FROM event_log WHERE user_id = ? AND kind = 'connexion' AND at >= ?", (uid, since)).fetchall()}
                if len(nets) >= 3 and not db.execute("SELECT 1 FROM event_log WHERE user_id = ? AND kind = 'alerte.partage' AND at >= ?", (uid, since)).fetchone():
                    log_event(db, "alerte.partage", uid, f"{len(nets)} réseaux différents en 24 h", "alerte")
            elif code == 401:
                log_event(db, "connexion.echec", uid, "mauvais mot de passe" if uid else "adresse inconnue", "warn")
            elif code == 403:
                log_event(db, "connexion.refusee", uid, "compte bloqué ou pas encore approuvé", "warn")
            elif code == 429:
                log_event(db, "abus.rafale", uid, "trop d'essais de connexion", "alerte")
        elif path == "/signup" and method == "POST":
            if code < 300:
                row = db.execute("SELECT id, referred_by FROM users WHERE email = ?", (str(body.get("email") or "").strip().lower(),)).fetchone()
                if row:
                    log_event(db, "inscription", row["id"], f"parrainé par le membre {row['referred_by']}" if row["referred_by"] else "")
            elif code == 429:
                log_event(db, "abus.rafale", None, "trop d'inscriptions depuis le même réseau", "alerte")
        elif code < 300 and method == "POST":
            m = _AUDIT_ADMIN.match(path)
            user = current_user()
            if m:
                log_event(db, f"admin.{m.group(2)}", int(m.group(1)), f"par {user['first_name'] if user else '?'}")
            elif path == "/me/password":
                log_event(db, "mot_de_passe.change", user["id"] if user else None)
            elif path == "/edu/payouts" and user:
                log_event(db, "retrait.demande", user["id"], f"{body.get('amount')} €")
            elif path.startswith("/admin/payouts/"):
                log_event(db, f"retrait.{body.get('status')}", None, f"demande n°{path.rsplit('/', 1)[-1]} par {user['first_name'] if user else '?'}")
            elif path == "/backtests/share" and user:
                log_event(db, "backtest.partage", user["id"], f"vers le membre {body.get('toUserId') or '?'}")
        elif path == "/scanners/model" and method == "GET" and code == 200:
            user = current_user()
            if user:
                day = datetime.now(timezone.utc).date().isoformat()
                with db_lock:
                    db.execute("INSERT INTO user_activity (user_id, day, page, views) VALUES (?, ?, 'scanner-calcul', 1) "
                               "ON CONFLICT(user_id, day, page) DO UPDATE SET views = views + 1", (user["id"], day))
                    db.commit()
                n = db.execute("SELECT views FROM user_activity WHERE user_id = ? AND day = ? AND page = 'scanner-calcul'", (user["id"], day)).fetchone()
                if n and n["views"] == SCANNER_DAILY_ALERT:
                    log_event(db, "alerte.scanners", user["id"], f"{SCANNER_DAILY_ALERT} calculs de scanners aujourd'hui", "alerte")
    except Exception as exc:  # le journal ne doit jamais faire échouer une requête
        print(f"Journal : {type(exc).__name__}")
    return resp


@app.route("/admin/events")
def admin_events():
    """Le journal, pour l'admin et CHEST HQ : ?after=<id> (les suivants), ?kind=, ?level=, ?member=, ?limit= (500 max)."""
    admin = current_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    q, args = "SELECT e.*, u.first_name, u.last_name FROM event_log e LEFT JOIN users u ON u.id = e.user_id WHERE e.id > ?", [int(request.args.get("after", 0) or 0)]
    for key, col in (("kind", "e.kind"), ("level", "e.level"), ("member", "e.user_id")):
        v = request.args.get(key)
        if v:
            q += f" AND {col} {'LIKE' if key == 'kind' else '='} ?"
            args.append(v + "%" if key == "kind" else v)
    try:
        limit = max(1, min(500, int(request.args.get("limit", 200))))
    except ValueError:
        limit = 200
    rows = get_db().execute(q + " ORDER BY e.id DESC LIMIT ?", (*args, limit)).fetchall()
    out = [{"id": r["id"], "at": r["at"], "kind": r["kind"], "level": r["level"], "detail": r["detail"] or "",
            "member": {"id": r["user_id"], "name": f"{r['first_name']} {(r['last_name'] or '')[:1]}.".strip()} if r["user_id"] and r["first_name"] else ({"id": r["user_id"]} if r["user_id"] else None),
            "ip": r["ip"], "device": r["device"]} for r in rows]
    return jsonify({"events": out[::-1], "last": max([e["id"] for e in out], default=int(request.args.get("after", 0) or 0))})


# ---------------------------------------------------------------- CHEST HQ au téléphone (2026-10-30)
HQ_ONLINE_SECONDS = 90


def _setting(db, key, default=None):
    r = db.execute("SELECT value FROM site_settings WHERE key = ?", (key,)).fetchone()
    return r["value"] if r else default


def _set_setting(db, key, value):
    db.execute("INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", (key, value))


def _hq_agent():
    """Le compte du QG (celui qui dépose les cartes). Le premier admin qui s'en sert devient ce compte ; ensuite lui seul."""
    u = current_user()
    if not u or not u["is_admin"]:
        return None
    db = get_db()
    cur = _setting(db, "hq_account")
    if cur is None:
        with db_lock:
            _set_setting(db, "hq_account", str(u["id"]))
            db.commit()
        return u
    return u if str(u["id"]) == cur else None


def _hq_patron():
    """Le patron : un admin principal (pas manageur), qui n'est pas le compte du QG."""
    u = current_user()
    if not u or not u["is_admin"] or _col(u, "role") == "manager":
        return None
    return None if _setting(get_db(), "hq_account") == str(u["id"]) else u


def _hq_card(r):
    return {"id": r["id"], "kind": r["kind"], "title": r["title"], "summary": r["summary"] or "", "body": r["body"] or "",
            "meta": json.loads(r["meta"] or "{}"), "status": r["status"], "note": r["note"] or "", "createdAt": r["created_at"],
            "decidedAt": r["decided_at"]}


@app.route("/hq/cards", methods=["POST"])
def hq_cards_push():
    """Le QG dépose ses cartes : {cards: [{id, kind, title, summary, body, meta}], close: [{id, status}], status: {...}}."""
    hq = _hq_agent()
    if not hq:
        return jsonify({"error": "Réservé au compte du QG."}), 403
    b = request.get_json(silent=True) or {}
    db = get_db()
    now = datetime.now(timezone.utc).isoformat()
    fresh = []
    with db_lock:
        for c in (b.get("cards") or [])[:50]:
            cid = str(c.get("id") or "")[:80]
            if not cid or c.get("kind") not in ("action", "ask", "rapport", "info"):
                continue
            row = db.execute("SELECT status FROM hq_cards WHERE id = ?", (cid,)).fetchone()
            vals = (str(c.get("title") or "")[:200], str(c.get("summary") or "")[:600], str(c.get("body") or "")[:60000],
                    json.dumps(c.get("meta") or {}, ensure_ascii=False)[:4000])
            if row:
                if row["status"] == "attente":
                    db.execute("UPDATE hq_cards SET title = ?, summary = ?, body = ?, meta = ? WHERE id = ?", (*vals, cid))
                continue
            status = "attente" if c["kind"] in ("action", "ask") else "info"
            db.execute("INSERT INTO hq_cards (id, kind, title, summary, body, meta, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                       (cid, c["kind"], *vals, status, now))
            fresh.append((c["kind"], vals[0]))
        for c in (b.get("close") or [])[:100]:
            db.execute("UPDATE hq_cards SET status = ?, acked = 1, decided_at = COALESCE(decided_at, ?) WHERE id = ? AND status IN ('attente', 'info')",
                       (str(c.get("status") or "faite")[:20], now, str(c.get("id") or "")[:80]))
        if isinstance(b.get("status"), dict):
            _set_setting(db, "hq_status", json.dumps({**b["status"], "at": now}, ensure_ascii=False)[:2000])
        # on ne garde que les 300 dernières cartes
        db.execute("DELETE FROM hq_cards WHERE id NOT IN (SELECT id FROM hq_cards ORDER BY created_at DESC LIMIT 300)")
        db.commit()
    if fresh:
        devs = db.execute("SELECT endpoint, p256dh, auth FROM hq_devices WHERE user_id != ?", (hq["id"],)).fetchall()
        if devs:
            asks = [t for k, t in fresh if k in ("action", "ask")]
            title = (f"Atlas · {len(asks)} chose{'s' if len(asks) > 1 else ''} à valider" if asks else "Atlas · compte rendu")
            _send_push_to_subscriptions(devs, title, (asks or [t for _, t in fresh])[0][:140], url="/", table="hq_devices", tag="chest-hq")
    return jsonify({"ok": True, "new": len(fresh)})


@app.route("/hq/sync")
def hq_sync():
    """Le QG relit ce que le patron a décidé ou écrit depuis son téléphone (et signale qu'il est en ligne)."""
    hq = _hq_agent()
    if not hq:
        return jsonify({"error": "Réservé au compte du QG."}), 403
    db = get_db()
    with db_lock:
        st = json.loads(_setting(db, "hq_status") or "{}")
        _set_setting(db, "hq_status", json.dumps({**st, "at": datetime.now(timezone.utc).isoformat()}, ensure_ascii=False))
        db.commit()
    dec = db.execute("SELECT id, kind, status, note FROM hq_cards WHERE acked = 0 AND status IN ('oui', 'non', 'modif')").fetchall()
    msgs = db.execute("SELECT id, text, card_id, created_at FROM hq_messages WHERE status = 'envoye' ORDER BY id").fetchall()
    return jsonify({"decisions": [{"id": r["id"], "kind": r["kind"], "decision": r["status"], "note": r["note"] or ""} for r in dec],
                    "messages": [{"id": r["id"], "text": r["text"], "cardId": r["card_id"], "at": r["created_at"]} for r in msgs]})


@app.route("/hq/sync/ack", methods=["POST"])
def hq_sync_ack():
    hq = _hq_agent()
    if not hq:
        return jsonify({"error": "Réservé au compte du QG."}), 403
    b = request.get_json(silent=True) or {}
    db = get_db()
    with db_lock:
        for cid in (b.get("cards") or [])[:100]:
            db.execute("UPDATE hq_cards SET acked = 1 WHERE id = ?", (str(cid)[:80],))
        for m in (b.get("messages") or [])[:100]:
            if isinstance(m, dict):
                db.execute("UPDATE hq_messages SET status = ? WHERE id = ?", (str(m.get("status") or "pris")[:20], int(m.get("id") or 0)))
        db.commit()
    return jsonify({"ok": True})


@app.route("/hq/inbox")
def hq_inbox():
    """L'application téléphone : ce qui attend, ce qui a été fait, les messages à Atlas, et l'état du QG."""
    me = _hq_patron()
    if not me:
        return jsonify({"error": "Réservé au patron de CHEST."}), 403
    db = get_db()
    waiting = db.execute("SELECT * FROM hq_cards WHERE status = 'attente' ORDER BY created_at").fetchall()
    unread = db.execute("SELECT * FROM hq_cards WHERE status = 'info' ORDER BY created_at DESC LIMIT 20").fetchall()
    done = db.execute("SELECT * FROM hq_cards WHERE status NOT IN ('attente', 'info') ORDER BY COALESCE(decided_at, created_at) DESC LIMIT 30").fetchall()
    msgs = db.execute("SELECT * FROM hq_messages ORDER BY id DESC LIMIT 20").fetchall()
    st = json.loads(_setting(db, "hq_status") or "{}")
    seen = _parse_iso(st.get("at"))
    online = bool(seen and (datetime.now(timezone.utc) - seen).total_seconds() < HQ_ONLINE_SECONDS)
    return jsonify({"waiting": [_hq_card(r) for r in waiting], "reports": [_hq_card(r) for r in unread], "history": [_hq_card(r) for r in done],
                    "messages": [{"id": r["id"], "text": r["text"], "cardId": r["card_id"], "status": r["status"], "at": r["created_at"]} for r in msgs],
                    "hq": {"online": online, "seenAt": st.get("at"), "mission": st.get("mission"), "busy": bool(st.get("busy")) and online,
                           "h24": bool(st.get("h24"))},
                    "me": {"firstName": me["first_name"]}})


@app.route("/hq/cards/<cid>/decide", methods=["POST"])
def hq_card_decide(cid):
    me = _hq_patron()
    if not me:
        return jsonify({"error": "Réservé au patron de CHEST."}), 403
    b = request.get_json(silent=True) or {}
    decision = b.get("decision")
    if decision not in ("oui", "non", "lu"):
        return jsonify({"error": "Décision inconnue."}), 400
    db = get_db()
    with db_lock:
        r = db.execute("SELECT status, kind FROM hq_cards WHERE id = ?", (cid,)).fetchone()
        if not r:
            return jsonify({"error": "Carte introuvable."}), 404
        if decision == "lu":
            if r["status"] == "info":
                db.execute("UPDATE hq_cards SET status = 'lu', decided_at = ?, decided_by = ?, acked = 1 WHERE id = ?",
                           (datetime.now(timezone.utc).isoformat(), me["id"], cid))
        elif r["status"] != "attente":
            return jsonify({"error": "Déjà traitée (au QG ou sur un autre appareil)."}), 409
        else:
            db.execute("UPDATE hq_cards SET status = ?, note = ?, decided_at = ?, decided_by = ? WHERE id = ?",
                       (decision, str(b.get("note") or "")[:500], datetime.now(timezone.utc).isoformat(), me["id"], cid))
        db.commit()
    return jsonify({"ok": True})


@app.route("/hq/messages", methods=["POST"])
def hq_message():
    """Un message à Atlas : une demande nouvelle, ou une modification sur une carte (qui repart alors chez Atlas)."""
    me = _hq_patron()
    if not me:
        return jsonify({"error": "Réservé au patron de CHEST."}), 403
    b = request.get_json(silent=True) or {}
    text = str(b.get("text") or "").strip()[:4000]
    if not text:
        return jsonify({"error": "Message vide."}), 400
    cid = str(b.get("cardId") or "")[:80] or None
    db = get_db()
    now = datetime.now(timezone.utc).isoformat()
    with db_lock:
        if cid:
            r = db.execute("SELECT status FROM hq_cards WHERE id = ?", (cid,)).fetchone()
            if not r:
                cid = None
            elif r["status"] == "attente":
                db.execute("UPDATE hq_cards SET status = 'modif', note = ?, decided_at = ?, decided_by = ? WHERE id = ?", (text[:500], now, me["id"], cid))
            elif r["status"] == "info":
                db.execute("UPDATE hq_cards SET status = 'lu', decided_at = ?, decided_by = ?, acked = 1 WHERE id = ?", (now, me["id"], cid))
        db.execute("INSERT INTO hq_messages (text, card_id, author_id, created_at) VALUES (?, ?, ?, ?)", (text, cid, me["id"], now))
        db.commit()
    return jsonify({"ok": True})


@app.route("/hq/devices", methods=["POST"])
def hq_device_add():
    me = _hq_patron()
    if not me:
        return jsonify({"error": "Réservé au patron de CHEST."}), 403
    b = request.get_json(silent=True) or {}
    keys = b.get("keys") or {}
    if not b.get("endpoint") or not keys.get("p256dh") or not keys.get("auth"):
        return jsonify({"error": "Abonnement incomplet."}), 400
    db = get_db()
    with db_lock:
        db.execute("INSERT INTO hq_devices (endpoint, user_id, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?) "
                   "ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth",
                   (str(b["endpoint"])[:1000], me["id"], str(keys["p256dh"])[:300], str(keys["auth"])[:300], datetime.now(timezone.utc).isoformat()))
        db.commit()
    if b.get("test"):
        devs = db.execute("SELECT endpoint, p256dh, auth FROM hq_devices WHERE endpoint = ?", (str(b["endpoint"])[:1000],)).fetchall()
        return jsonify(_send_push_to_subscriptions(devs, "CHEST HQ", "Les notifications d’Atlas arrivent bien sur ce téléphone.", url="/", table="hq_devices", tag="chest-hq"))
    return jsonify({"ok": True})


@app.route("/hq/devices/remove", methods=["POST"])
def hq_device_remove():
    me = _hq_patron()
    if not me:
        return jsonify({"error": "Réservé au patron de CHEST."}), 403
    db = get_db()
    with db_lock:
        db.execute("DELETE FROM hq_devices WHERE endpoint = ? AND user_id = ?", (str((request.get_json(silent=True) or {}).get("endpoint") or ""), me["id"]))
        db.commit()
    return jsonify({"ok": True})


@app.route("/admin/billing")
def admin_billing():
    """Les achats, échecs, remboursements et litiges (Stripe), pour la Société de CHEST HQ : ?days= (365 max)."""
    admin = current_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    try:
        days = max(1, min(365, int(request.args.get("days", 30))))
    except ValueError:
        days = 30
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    rows = get_db().execute("SELECT b.*, u.first_name, u.last_name, u.referred_by FROM billing_events b LEFT JOIN users u ON u.id = b.user_id "
                            "WHERE b.created_at >= ? ORDER BY b.created_at", (since,)).fetchall()
    return jsonify({"days": days, "holdDays": EDU_HOLD_DAYS, "events": [{
        "id": r["id"], "at": r["created_at"], "type": r["type"], "amount": r["amount"] or 0, "summary": r["summary"] or "",
        "member": {"id": r["user_id"], "name": f"{r['first_name']} {(r['last_name'] or '')[:1]}.".strip(), "educator": r["referred_by"]} if r["user_id"] and r["first_name"] else None,
    } for r in rows]})


@app.route("/admin/sales")
def admin_sales():
    """Le registre des ventes : qui a acheté quoi, quel éducateur l'a amené, ce qui lui revient (commission,
    bloquée 14 jours puis retirable, annulée par un remboursement) et ce qui reste à CHEST. ?days= (730 max).
    Mêmes règles que le portefeuille des éducateurs (edu_report)."""
    admin = current_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    try:
        days = max(1, min(730, int(request.args.get("days", 90))))
    except ValueError:
        days = 90
    db = get_db()
    now = datetime.now(timezone.utc)
    since = (now - timedelta(days=days)).isoformat()
    name = lambda u: f"{u['first_name']} {(u['last_name'] or '')[:1]}.".strip()
    members = db.execute("SELECT * FROM users WHERE id IN (SELECT DISTINCT user_id FROM billing_events WHERE user_id IS NOT NULL AND amount > 0)").fetchall()
    educators = {e["id"]: e for e in db.execute("SELECT * FROM users WHERE role = 'educator'").fetchall()}
    rows = []
    for m in members:
        sales, _, net = _net_sales(db, m["id"])
        edu = educators.get(_col(m, "referred_by"))
        rate = edu_rate(edu) if edu else 0.0
        for s in sales:
            if (s["created_at"] or "") < since:
                continue
            left = net[s["id"]]
            comm = round(left * rate / 100)
            avail = (_parse_iso(s["created_at"]) or now) + timedelta(days=EDU_HOLD_DAYS)
            summary = s["summary"] or ""
            rows.append({
                "id": s["id"], "at": s["created_at"], "member": {"id": m["id"], "name": name(m)},
                "offer": summary[len("Paiement "):] if summary.startswith("Paiement ") else ("Renouvellement" if s["type"] == "invoice.paid" else summary),
                "amount": s["amount"], "refunded": s["amount"] - left, "net": left,
                "educator": {"id": edu["id"], "name": name(edu)} if edu else None, "rate": rate, "commission": comm,
                "chest": left - comm, "availableAt": avail.isoformat(),
                "status": "remboursee" if left <= 0 else ("encaissee" if not edu else ("bloquee" if avail > now else "retirable")),
            })
    rows.sort(key=lambda r: r["at"] or "", reverse=True)
    per = []
    for e in educators.values():
        mine = [r for r in rows if r["educator"] and r["educator"]["id"] == e["id"]]
        w = edu_report(db, e)["wallet"]
        per.append({"id": e["id"], "name": name(e), "rate": edu_rate(e), "sales": len(mine),
                    "net": sum(r["net"] for r in mine), "commission": sum(r["commission"] for r in mine), "wallet": w})
    direct = [r for r in rows if not r["educator"]]
    per.sort(key=lambda p: p["net"], reverse=True)
    return jsonify({
        "days": days, "holdDays": EDU_HOLD_DAYS, "checkout": "auto" if STRIPE_SECRET_KEY else "liens", "sales": rows[:500],
        "totals": {"count": len(rows), "gross": sum(r["amount"] for r in rows), "refunded": sum(r["refunded"] for r in rows),
                   "net": sum(r["net"] for r in rows), "commission": sum(r["commission"] for r in rows),
                   "chest": sum(r["chest"] for r in rows), "locked": sum(r["commission"] for r in rows if r["status"] == "bloquee")},
        "educators": per, "direct": {"sales": len(direct), "net": sum(r["net"] for r in direct)},
    })


@app.route("/admin/mail", methods=["POST"])
def admin_mail():
    """Un e-mail à un membre, au nom de CHEST (envoyé par le serveur : l'adresse du membre ne sort jamais d'ici).
    {memberId, kind: avertissement|information|rappel|compte, subject, title, paragraphs: [...], cta?: {label, url}, preview?: true}"""
    admin = current_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    b = request.get_json(silent=True) or {}
    db = get_db()
    member = db.execute("SELECT * FROM users WHERE id = ?", (b.get("memberId"),)).fetchone()
    if not member:
        return jsonify({"error": "Membre introuvable."}), 404
    subject = str(b.get("subject") or "").strip()[:140]
    title = str(b.get("title") or subject).strip()[:140]
    paras = [str(p)[:1200] for p in (b.get("paragraphs") or []) if str(p).strip()][:8]
    if not subject or not paras:
        return jsonify({"error": "Objet et texte requis."}), 400
    kind = b.get("kind") if b.get("kind") in MAIL_KINDS else "information"
    cta = b.get("cta") if isinstance(b.get("cta"), dict) else None
    html, text = render_mail(kind, title, paras, member["first_name"], cta)
    if b.get("preview"):
        return jsonify({"html": html, "text": text, "to": f"{member['first_name']} {(member['last_name'] or '')[:1]}."})
    err = send_mail(member["email"], f"CHEST — {subject}", html, text)
    if err:
        return jsonify({"error": err}), 503
    log_event(db, f"mail.{kind}", member["id"], f"« {subject} » envoyé par {admin['first_name']}")
    return jsonify({"ok": True, "to": f"{member['first_name']} {(member['last_name'] or '')[:1]}."})


# Version des documents légaux (site/js/legal-docs.js, LEGAL_VERSION) : la changer redemande l'accord de chacun.
TERMS_VERSION = "2026-10-30"
EDU_TERMS_VERSION = "2026-10-30"


def record_consent(db, user_row_or_id, kind, version, detail=None, email=None):
    uid = user_row_or_id if isinstance(user_row_or_id, int) else user_row_or_id["id"]
    db.execute("INSERT INTO user_consents (user_id, email, kind, version, detail, ip, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
               (uid, email, kind, version, json.dumps(detail or {}, ensure_ascii=False)[:2000], _client_ip(),
                (request.headers.get("User-Agent") or "")[:300], datetime.now(timezone.utc).isoformat()))


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
    if body.get("acceptTerms") is not True:
        return jsonify({"error": "Coche la case pour confirmer que tu as 18 ans et que tu acceptes les conditions d'utilisation."}), 400
    if ref_code and not get_db().execute("SELECT 1 FROM edu_invites WHERE upper(code) = upper(?) AND active = 1", (ref_code,)).fetchone():
        return jsonify({"error": "Code de référent inconnu : vérifie-le auprès de ton éducateur, ou laisse le champ vide."}), 400
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
        new_id = db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()["id"]
        db.execute("UPDATE users SET terms_version = ? WHERE id = ?", (TERMS_VERSION, new_id))
        record_consent(db, new_id, "signup", TERMS_VERSION, {"docs": ["cgu", "confidentialite", "risques"], "majeur": True, "ref": ref_code or None}, email)
        # Inscrit par le lien d'un éducateur (?ref=CODE) : rattaché à son compte
        if ref_code:
            inv = db.execute("SELECT educator_id FROM edu_invites WHERE upper(code) = upper(?) AND active = 1", (ref_code,)).fetchone()
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
        # L'appareil qui se déconnecte est retiré des notifications AVANT la fermeture de la session (2026-11-04) :
        # avant, /push/unsubscribe arrivait après la session supprimée (401) et l'abonnement restait sur le compte.
        endpoint = (request.get_json(silent=True) or {}).get("endpoint")
        with db_lock:
            if endpoint:
                row = db.execute("SELECT user_id FROM sessions WHERE token = ?", (token,)).fetchone()
                if row:
                    db.execute("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?", (endpoint, row["user_id"]))
            db.execute("DELETE FROM sessions WHERE token = ?", (token,))
            db.commit()
    return jsonify({"ok": True})


@app.route("/me")
def me():
    user = current_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    return jsonify({**user_public(user), "storage": storage_info(get_db(), user)})


@app.route("/members/<int:member_id>/storage", methods=["POST"])
def member_storage(member_id):
    """L'admin choisit l'espace d'un membre, en Go (vide = celui de son offre)."""
    admin = current_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    denied = guard_principal(admin, member_id)
    if denied:
        return denied
    gb = (request.get_json(silent=True) or {}).get("gb")
    mb = None
    if gb not in (None, ""):
        try:
            mb = int(round(float(str(gb).replace(",", ".")) * 1024))
        except (TypeError, ValueError):
            return jsonify({"error": "Indique un nombre de Go."}), 400
        if not 0 <= mb <= 1024 * 1024:
            return jsonify({"error": "Entre 0 et 1 024 Go."}), 400
    db = get_db()
    with db_lock:
        if not db.execute("SELECT 1 FROM users WHERE id = ?", (member_id,)).fetchone():
            return jsonify({"error": "Compte introuvable."}), 404
        db.execute("UPDATE users SET storage_quota_mb = ? WHERE id = ?", (mb, member_id))
        db.commit()
    row = db.execute("SELECT * FROM users WHERE id = ?", (member_id,)).fetchone()
    return jsonify({"storage": storage_info(db, row)})


# ---------------- Facture Railway (2026-11-10) ----------------
# Jeton : variable RAILWAY_API_TOKEN (jeton de compte ou d'espace de travail, railway.com/account/tokens), jamais dans le code.
# Hobby = 5 $ par mois dont 5 $ de consommation incluse → facture = max(5, consommation).
RAILWAY_WORKSPACE_ID = os.environ.get("RAILWAY_WORKSPACE_ID", "ddd921b7-7b88-40f3-a20a-3ba8c0b4ad03")
RAILWAY_PLAN_PRICE = float(os.environ.get("RAILWAY_PLAN_PRICE", "5"))
RAILWAY_PLAN_INCLUDED = float(os.environ.get("RAILWAY_PLAN_INCLUDED", "5"))


def _railway_customer():
    token = os.environ.get("RAILWAY_API_TOKEN", "").strip()
    if not token:
        return None
    q = """query($w: String!) { workspace(workspaceId: $w) { customer { currentUsage billingPeriod { start end }
        usageLimit { hardLimit softLimit isOverLimit } } } }"""
    req = urllib.request.Request("https://backboard.railway.com/graphql/v2",
                                 data=json.dumps({"query": q, "variables": {"w": RAILWAY_WORKSPACE_ID}}).encode("utf-8"),
                                 headers={"Content-Type": "application/json", "Authorization": "Bearer " + token, "User-Agent": "chest-accounts"})
    with urllib.request.urlopen(req, timeout=20) as r:
        d = json.loads(r.read().decode("utf-8"))
    if d.get("errors"):
        raise RuntimeError(d["errors"][0].get("message") or "erreur Railway")
    return ((d.get("data") or {}).get("workspace") or {}).get("customer")


def railway_usage_loop():
    while True:
        try:
            with app.app_context():
                c = _railway_customer()
                if c and c.get("currentUsage") is not None:
                    db = get_db()
                    with db_lock:
                        db.execute("INSERT INTO railway_usage (at, mode, usage, period_start) VALUES (?, ?, ?, ?)",
                                   (datetime.now(timezone.utc).isoformat(), get_ops()["mode"], float(c["currentUsage"]),
                                    (c.get("billingPeriod") or {}).get("start")))
                        db.execute("DELETE FROM railway_usage WHERE at < ?", ((datetime.now(timezone.utc) - timedelta(days=60)).isoformat(),))
                        db.commit()
        except Exception as e:
            print(f"[railway] relevé impossible : {e}", flush=True)
        time.sleep(1800)


@app.route("/admin/railway")
def admin_railway():
    """Admin → Système : consommé depuis le début de la période + facture estimée en fin de période si on reste dans
    chaque mode. Coût horaire d'un mode = mesuré sur les relevés pris dans ce mode (30 derniers jours) ; à défaut,
    moyenne de la période en cours."""
    admin = current_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    if not os.environ.get("RAILWAY_API_TOKEN", "").strip():
        return jsonify({"configured": False})
    try:
        c = _railway_customer() or {}
    except Exception as e:
        return jsonify({"configured": True, "error": f"Railway ne répond pas : {e}"}), 502
    used = float(c.get("currentUsage") or 0)
    bp = c.get("billingPeriod") or {}
    now = datetime.now(timezone.utc)
    try:
        start, end = _when(bp["start"]), _when(bp["end"])
    except Exception:
        return jsonify({"configured": True, "error": "Période de facturation illisible."}), 502
    elapsed_h = max((now - start).total_seconds() / 3600, 1)
    left_h = max((end - now).total_seconds() / 3600, 0)
    rows = get_db().execute("SELECT at, mode, usage, period_start FROM railway_usage WHERE at >= ? ORDER BY at",
                            ((now - timedelta(days=30)).isoformat(),)).fetchall()
    acc = {}
    for a, b in zip(rows, rows[1:]):
        dt = (_when(b["at"]) - _when(a["at"])).total_seconds() / 3600
        if a["period_start"] != b["period_start"] or dt <= 0 or dt > 2 or b["usage"] < a["usage"]:
            continue
        m = acc.setdefault(a["mode"], [0.0, 0.0])
        m[0] += b["usage"] - a["usage"]
        m[1] += dt
    avg = used / elapsed_h
    modes = {}
    for k in OPS_MODES:
        cost, hours = acc.get(k, [0.0, 0.0])
        measured = hours >= 3
        # Début de période (< 24 h) sans mesure du mode : la moyenne de quelques heures (redémarrages, premiers
        # calculs) n'est pas représentative → pas d'estimation plutôt qu'un chiffre faux.
        if not measured and elapsed_h < 24:
            modes[k] = {"rate": None, "hours": round(hours, 1), "measured": False, "usageEnd": None, "invoice": None}
            continue
        rate = cost / hours if measured else avg
        usage_end = used + rate * left_h
        modes[k] = {"rate": round(rate, 5), "hours": round(hours, 1), "measured": measured,
                    "usageEnd": round(usage_end, 2),
                    "invoice": round(RAILWAY_PLAN_PRICE + max(0.0, usage_end - RAILWAY_PLAN_INCLUDED), 2)}
    lim = c.get("usageLimit") or {}
    return jsonify({"configured": True, "used": round(used, 2), "start": bp.get("start"), "end": bp.get("end"),
                    "elapsedH": round(elapsed_h, 1), "leftH": round(left_h, 1), "avgRate": round(avg, 5),
                    "invoiceNow": round(RAILWAY_PLAN_PRICE + max(0.0, used - RAILWAY_PLAN_INCLUDED), 2),
                    "plan": {"price": RAILWAY_PLAN_PRICE, "included": RAILWAY_PLAN_INCLUDED},
                    "limit": {"hard": lim.get("hardLimit"), "soft": lim.get("softLimit"), "over": bool(lim.get("isOverLimit"))},
                    "mode": get_ops()["mode"], "modes": modes, "samples": len(rows)})


# ---------------- Paiement en crypto (2026-11-12) ----------------
# Solana Pay en USDC : le membre scanne un QR avec Phantom (ou tout wallet Solana), l'argent arrive directement sur
# le wallet de CHEST (aucun intermédiaire, frais < 0,01 $). Chaque paiement porte une « référence » unique : le serveur
# retrouve la transaction sur la blockchain (RPC publique), vérifie le montant et le destinataire, puis l'admin valide
# (supervision humaine) et l'accès s'ouvre. Le wallet de réception se règle dans Admin → Système (site_settings.crypto).
USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
SOLANA_RPC = os.environ.get("SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com")
_B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
_fx_cache = {"at": 0, "rate": None}


def _b58(b):
    n = int.from_bytes(b, "big")
    out = ""
    while n:
        n, r = divmod(n, 58)
        out = _B58[r] + out
    return "1" * (len(b) - len(b.lstrip(b"\0"))) + out


# Adresse de réception Solana (Phantom du patron, 2026-11-14) : posée une fois au démarrage (crypto_init), l'admin
# peut ensuite la changer ou couper la crypto depuis Admin → Système. Les USDC arrivent sur le compte de jetons
# associé à cette adresse (créé par le premier dépôt d'USDC).
CRYPTO_WALLET_DEFAULT = "9PQ8WgqGCj8Q4mTXcaRSh1CftAzc4h4FnSZwXQcWgnfw"


def get_crypto_settings():
    if get_setting("crypto_init") != "1":
        set_setting("crypto", json.dumps({"on": True, "wallet": CRYPTO_WALLET_DEFAULT}))
        set_setting("crypto_init", "1")
    try:
        d = json.loads(get_setting("crypto") or "null") or {}
    except ValueError:
        d = {}
    w = str(d.get("wallet") or "").strip()
    return {"on": bool(d.get("on")) and bool(w), "wallet": w}


def _eur_usd():
    """Taux EUR → USD (BCE via frankfurter.app), gardé 1 h ; repli 1,08."""
    if _fx_cache["rate"] and time.time() - _fx_cache["at"] < 3600:
        return _fx_cache["rate"]
    try:
        with urllib.request.urlopen("https://api.frankfurter.app/latest?from=EUR&to=USD", timeout=8) as r:
            rate = float(json.loads(r.read().decode())["rates"]["USD"])
        _fx_cache.update(at=time.time(), rate=rate)
        return rate
    except Exception:
        return _fx_cache["rate"] or 1.08


def _sol_rpc(method, params):
    req = urllib.request.Request(SOLANA_RPC, data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as r:
        d = json.loads(r.read().decode())
    if d.get("error"):
        raise RuntimeError(d["error"].get("message") or "RPC")
    return d.get("result")


_TX_VERSION = {"max": 1}


def _sol_tx(sig):
    """getTransaction en lisant toutes les versions de transaction (2026-11-14 : le réseau émet des transactions v1 ;
    demander « 0 » échouait et le paiement restait en attente). Si une version plus récente apparaît, on s'y adapte."""
    for _ in range(3):
        try:
            return _sol_rpc("getTransaction", [sig, {"encoding": "jsonParsed", "maxSupportedTransactionVersion": _TX_VERSION["max"], "commitment": "confirmed"}])
        except RuntimeError as e:
            m = re.search(r'"maxSupportedTransactionVersion": (\d+)', str(e))
            if not m or int(m.group(1)) <= _TX_VERSION["max"]:
                raise
            _TX_VERSION["max"] = int(m.group(1))
    return None


def _crypto_check(row):
    """Cherche sur la blockchain la transaction qui porte la référence du paiement : (signature, montant reçu) ou None."""
    sigs = _sol_rpc("getSignaturesForAddress", [row["reference"], {"limit": 10}]) or []
    for sg in sigs:
        if sg.get("err"):
            continue
        tx = _sol_tx(sg["signature"])
        meta = (tx or {}).get("meta") or {}
        if meta.get("err"):
            continue
        def bal(lst):
            return {b.get("accountIndex"): float((b.get("uiTokenAmount") or {}).get("uiAmountString") or 0)
                    for b in (lst or []) if b.get("mint") == USDC_MINT and b.get("owner") == row["wallet"]}
        pre, post = bal(meta.get("preTokenBalances")), bal(meta.get("postTokenBalances"))
        got = sum(post.get(i, 0) - pre.get(i, 0) for i in post)
        if got >= row["usdc"] * 0.999:
            return sg["signature"], got
    return None


def _crypto_out(r, who=None):
    return {"id": r["id"], "offer": r["offer"], "eur": r["eur"], "usdc": r["usdc"], "reference": r["reference"], "wallet": r["wallet"],
            "status": r["status"], "signature": r["signature"], "createdAt": r["created_at"], "updatedAt": r["updated_at"],
            **({"member": who} if who else {})}


@app.route("/billing/crypto/start", methods=["POST"])
def crypto_start():
    user = current_user()
    if not user:
        return jsonify({"error": "Connecte-toi pour choisir une offre."}), 401
    cs = get_crypto_settings()
    if not cs["on"]:
        return jsonify({"error": "Le paiement en crypto n'est pas encore ouvert."}), 400
    key = str((request.get_json(silent=True) or {}).get("offer") or "")
    o = next((x for x in get_pricing()["offers"] if x.get("key") == key and x.get("enabled")), None)
    if not o or not o.get("price"):
        return jsonify({"error": "Offre inconnue."}), 400
    eur = float(o["price"])
    usdc = round(eur * _eur_usd() + 0.004, 2)
    ref = _b58(secrets.token_bytes(32))
    now = datetime.now(timezone.utc).isoformat()
    db = get_db()
    with db_lock:
        db.execute("UPDATE crypto_payments SET status = 'expired', updated_at = ? WHERE user_id = ? AND status = 'pending'", (now, user["id"]))
        cur = db.execute("INSERT INTO crypto_payments (user_id, offer, eur, usdc, reference, wallet, status, created_at, updated_at) "
                         "VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)", (user["id"], key, eur, usdc, ref, cs["wallet"], now, now))
        db.commit()
        pid = cur.lastrowid
    label = urllib.parse.quote("CHEST")
    msg = urllib.parse.quote(f"{o.get('name') or key} · CHEST")
    url = f"solana:{cs['wallet']}?amount={usdc:.2f}&spl-token={USDC_MINT}&reference={ref}&label={label}&message={msg}"
    log_event(db, "paiement.crypto", user["id"], f"{key} · {usdc:.2f} USDC demandé", "info", locked=True, with_request=False)
    return jsonify({"id": pid, "url": url, "usdc": usdc, "eur": eur, "wallet": cs["wallet"], "reference": ref, "status": "pending"})


@app.route("/billing/crypto/<int:pid>")
def crypto_status(pid):
    user = current_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    db = get_db()
    r = db.execute("SELECT * FROM crypto_payments WHERE id = ? AND user_id = ?", (pid, user["id"])).fetchone()
    if not r:
        return jsonify({"error": "Paiement introuvable."}), 404
    if r["status"] == "pending":
        try:
            hit_ = _crypto_check(r)
        except Exception as e:
            print(f"[crypto] lecture blockchain impossible : {e}", flush=True)
            hit_ = None
        if hit_:
            # 2026-11-14 : la blockchain a confirmé le montant et le destinataire → l'accès s'ouvre aussitôt (plus
            # d'attente de l'équipe) ; l'admin garde « Refuser » dans Admin → Système en cas de souci. Paiement test : rien.
            now_dt = datetime.now(timezone.utc)
            now = now_dt.isoformat()
            with db_lock:
                db.execute("UPDATE crypto_payments SET status = ?, signature = ?, updated_at = ? WHERE id = ?",
                           ("validated" if r["offer"] != "test" else "detected", hit_[0], now, pid))
                if r["offer"] != "test":
                    _crypto_grant(db, r, now_dt, pid)
                db.commit()
            log_event(db, "paiement.crypto", user["id"], f"{r['offer']} · {hit_[1]:.2f} USDC reçus — accès ouvert", "info", locked=True, with_request=False)
            r = db.execute("SELECT * FROM crypto_payments WHERE id = ?", (pid,)).fetchone()
    return jsonify(_crypto_out(r))


@app.route("/admin/crypto", methods=["GET", "PUT"])
def admin_crypto():
    admin = current_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    db = get_db()
    if request.method == "PUT":
        b = request.get_json(silent=True) or {}
        w = re.sub(r"[^1-9A-HJ-NP-Za-km-z]", "", str(b.get("wallet") or ""))[:44]
        if w and not 32 <= len(w) <= 44:
            return jsonify({"error": "Adresse de wallet Solana invalide."}), 400
        set_setting("crypto", json.dumps({"on": bool(b.get("on")) and bool(w), "wallet": w}))
    who = _names(db)
    rows = db.execute("SELECT * FROM crypto_payments WHERE status != 'expired' ORDER BY id DESC LIMIT 60").fetchall()
    return jsonify({"settings": get_crypto_settings(), "payments": [_crypto_out(r, who(r["user_id"])) for r in rows]})


def _crypto_grant(db, r, now, pid):
    """Ouvre l'accès payé en crypto (durée du rang, sans renouvellement) et l'inscrit comme vente (commission de l'éducateur)."""
    lvl = int(r["offer"][-1])
    months = LEVEL_MONTHS[lvl]
    _set_plan(db, r["user_id"], r["offer"][:-1], f"{months}m", "active", now, _add_months(now, months), plan_level=lvl)
    _log_billing(db, f"crypto_{pid}", r["user_id"], "checkout.session.completed", int(round(r["eur"] * 100)),
                 f"Paiement {PLANS[r['offer'][:-1]]['label']} {ROMAN.get(lvl, lvl)} ({months} mois) · crypto")


# ---------------- Paiement par virement (2026-11-14) ----------------
# 3e moyen de paiement, proposé seulement aux membres dont le parrain (éducateur ou admin) l'a activé dans son espace
# (désactivé par défaut) avec ses coordonnées. Le membre voit le QR Revolut + le RIB, vire, clique « C'est fait » ;
# l'admin valide (accès ouvert, vente comptée) ou refuse. Activé une fois pour les admins principaux avec le RIB CHEST.
def _transfer_seed():
    if get_setting("transfer_seed") == "1":
        return
    db = get_db()
    now = datetime.now(timezone.utc).isoformat()
    with db_lock:
        for r in db.execute("SELECT id, role FROM users WHERE is_admin = 1").fetchall():
            if r["role"] == "manager":
                continue
            db.execute("INSERT OR IGNORE INTO transfer_settings (user_id, enabled, holder, iban, bic, revolut, updated_at) VALUES (?, 1, ?, ?, ?, ?, ?)",
                       (r["id"], EDU_FEE_BANK["holder"], EDU_FEE_BANK["iban"], EDU_FEE_BANK["bic"], EDU_FEE_BANK["revolut"], now))
        db.commit()
    set_setting("transfer_seed", "1")


def _transfer_of(db, uid):
    r = db.execute("SELECT * FROM transfer_settings WHERE user_id = ?", (uid,)).fetchone() if uid else None
    return {"enabled": bool(r and r["enabled"]), "holder": (r["holder"] if r else "") or "", "iban": (r["iban"] if r else "") or "",
            "bic": (r["bic"] if r else "") or "", "revolut": (r["revolut"] if r else "") or ""}


@app.route("/me/transfer", methods=["GET", "PUT"])
def me_transfer():
    """Réglage du parrain : accepter les virements de ses membres, et ses coordonnées."""
    user = current_user()
    if not user or not (is_educator(user) or user["is_admin"]):
        return jsonify({"error": "Réservé aux éducateurs et aux admins."}), 403
    _transfer_seed()
    db = get_db()
    if request.method == "PUT":
        b = request.get_json(silent=True) or {}
        on = bool(b.get("enabled"))
        holder = re.sub(r"\s+", " ", str(b.get("holder") or "")).strip()[:80]
        iban_raw = str(b.get("iban") or "").strip()
        iban = iban_ok(iban_raw) if iban_raw else None
        if iban_raw and not iban:
            return jsonify({"error": "IBAN invalide."}), 400
        bic = re.sub(r"[^A-Z0-9]", "", str(b.get("bic") or "").upper())[:11]
        rev = re.sub(r"[^A-Za-z0-9_.-]", "", str(b.get("revolut") or "").lstrip("@"))[:40]
        if on and not (holder and (iban or rev)):
            return jsonify({"error": "Pour activer le virement : le titulaire et un IBAN (ou un identifiant Revolut)."}), 400
        pretty = " ".join(iban[i:i + 4] for i in range(0, len(iban), 4)) if iban else ""
        with db_lock:
            db.execute("INSERT INTO transfer_settings (user_id, enabled, holder, iban, bic, revolut, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) "
                       "ON CONFLICT(user_id) DO UPDATE SET enabled = excluded.enabled, holder = excluded.holder, iban = excluded.iban, "
                       "bic = excluded.bic, revolut = excluded.revolut, updated_at = excluded.updated_at",
                       (user["id"], 1 if on else 0, holder, pretty, bic, ("@" + rev) if rev else "", datetime.now(timezone.utc).isoformat()))
            db.commit()
    return jsonify({**_transfer_of(db, user["id"]), "code": _col(user, "edu_code") or None,
                    "members": db.execute("SELECT COUNT(*) FROM users WHERE referred_by = ?", (user["id"],)).fetchone()[0]})


@app.route("/billing/transfer/info")
def transfer_info():
    """Le virement est-il proposé à ce membre ? (selon le réglage de son parrain)"""
    user = current_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    _transfer_seed()
    db = get_db()
    t = _transfer_of(db, _col(user, "referred_by"))
    if not t["enabled"]:
        return jsonify({"enabled": False})
    return jsonify({**t, "reference": f"CHEST {user['first_name']} {(user['last_name'] or '')[:1]}".strip()})


@app.route("/billing/transfer", methods=["POST"])
def transfer_declare():
    """Le membre déclare avoir fait le virement d'une offre (« C'est fait ») : à valider par l'admin."""
    user = current_user()
    if not user:
        return jsonify({"error": "Connecte-toi pour choisir une offre."}), 401
    db = get_db()
    ref_id = _col(user, "referred_by")
    if not _transfer_of(db, ref_id)["enabled"]:
        return jsonify({"error": "Le virement n'est pas proposé pour ton compte."}), 400
    key = str((request.get_json(silent=True) or {}).get("offer") or "")
    o = next((x for x in get_pricing()["offers"] if x.get("key") == key and x.get("enabled")), None)
    if not o or not o.get("price"):
        return jsonify({"error": "Offre inconnue."}), 400
    now = datetime.now(timezone.utc).isoformat()
    with db_lock:
        db.execute("UPDATE transfer_payments SET status = 'cancelled', updated_at = ? WHERE user_id = ? AND status = 'declared'", (now, user["id"]))
        cur = db.execute("INSERT INTO transfer_payments (user_id, referrer_id, offer, eur, reference, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'declared', ?, ?)",
                         (user["id"], ref_id, key, float(o["price"]), f"CHEST {user['first_name']} {(user['last_name'] or '')[:1]} {key}".strip(), now, now))
        db.commit()
    log_event(db, "paiement.virement", user["id"], f"{key} · {o['price']} € déclaré par virement — à valider", "alerte", locked=True, with_request=False)
    return jsonify({"id": cur.lastrowid, "status": "declared"})


@app.route("/billing/transfer/<int:pid>")
def transfer_status(pid):
    user = current_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    r = get_db().execute("SELECT id, offer, eur, status, note FROM transfer_payments WHERE id = ? AND user_id = ?", (pid, user["id"])).fetchone()
    if not r:
        return jsonify({"error": "Virement introuvable."}), 404
    return jsonify(dict(r))


@app.route("/admin/transfers")
def admin_transfers():
    admin = current_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    db = get_db()
    who = _names(db)
    rows = db.execute("SELECT * FROM transfer_payments WHERE status != 'cancelled' ORDER BY (status = 'declared') DESC, id DESC LIMIT 80").fetchall()
    return jsonify({"transfers": [{"id": r["id"], "member": who(r["user_id"]), "referrer": who(r["referrer_id"]) if r["referrer_id"] else None, "offer": r["offer"],
                                   "eur": r["eur"], "reference": r["reference"], "status": r["status"], "createdAt": r["created_at"], "note": r["note"] or ""} for r in rows]})


@app.route("/admin/transfers/<int:pid>", methods=["POST"])
def admin_transfer_decide(pid):
    admin = current_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    b = request.get_json(silent=True) or {}
    action = str(b.get("action") or "")
    db = get_db()
    r = db.execute("SELECT * FROM transfer_payments WHERE id = ?", (pid,)).fetchone()
    if not r or action not in ("validate", "refuse"):
        return jsonify({"error": "Virement introuvable."}), 404
    if r["status"] != "declared":
        return jsonify({"error": "Déjà traité."}), 400
    now = datetime.now(timezone.utc)
    with db_lock:
        if action == "validate":
            lvl = int(r["offer"][-1])
            months = LEVEL_MONTHS[lvl]
            _set_plan(db, r["user_id"], r["offer"][:-1], f"{months}m", "active", now, _add_months(now, months), plan_level=lvl)
            _log_billing(db, f"virement_{pid}", r["user_id"], "checkout.session.completed", int(round(r["eur"] * 100)),
                         f"Paiement {PLANS[r['offer'][:-1]]['label']} {ROMAN.get(lvl, lvl)} ({months} mois) · virement")
        db.execute("UPDATE transfer_payments SET status = ?, note = ?, updated_at = ? WHERE id = ?",
                   ("validated" if action == "validate" else "refused", str(b.get("note") or "")[:200], now.isoformat(), pid))
        db.commit()
    log_event(db, "paiement.virement", r["user_id"], f"{r['offer']} · virement {'validé' if action == 'validate' else 'refusé'} par l'admin", "info", locked=True, with_request=False)
    return admin_transfers()


@app.route("/admin/crypto/test", methods=["POST"])
def admin_crypto_test():
    """Demande de paiement de 1 USDC vers le wallet configuré, pour vérifier Solana Pay de bout en bout (aucun accès ouvert)."""
    admin = current_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    cs = get_crypto_settings()
    if not cs["wallet"]:
        return jsonify({"error": "Aucun wallet configuré."}), 400
    ref = _b58(secrets.token_bytes(32))
    now = datetime.now(timezone.utc).isoformat()
    db = get_db()
    with db_lock:
        cur = db.execute("INSERT INTO crypto_payments (user_id, offer, eur, usdc, reference, wallet, status, created_at, updated_at) "
                         "VALUES (?, 'test', ?, 1.0, ?, ?, 'pending', ?, ?)", (admin["id"], round(1 / _eur_usd(), 2), ref, cs["wallet"], now, now))
        db.commit()
        pid = cur.lastrowid
    url = f"solana:{cs['wallet']}?amount=1.00&spl-token={USDC_MINT}&reference={ref}&label=CHEST&message=" + urllib.parse.quote("Test CHEST")
    return jsonify({"id": pid, "url": url, "usdc": 1.0, "wallet": cs["wallet"], "reference": ref, "status": "pending"})


@app.route("/admin/crypto/<int:pid>", methods=["POST"])
def admin_crypto_decide(pid):
    admin = current_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    action = str((request.get_json(silent=True) or {}).get("action") or "")
    db = get_db()
    r = db.execute("SELECT * FROM crypto_payments WHERE id = ?", (pid,)).fetchone()
    if not r or action not in ("validate", "reject"):
        return jsonify({"error": "Paiement introuvable."}), 404
    now = datetime.now(timezone.utc)
    with db_lock:
        if action == "validate" and r["offer"] != "test" and r["status"] != "validated":
            _crypto_grant(db, r, now, pid)
        db.execute("UPDATE crypto_payments SET status = ?, updated_at = ? WHERE id = ?", ("validated" if action == "validate" else "rejected", now.isoformat(), pid))
        db.commit()
    log_event(db, "paiement.crypto", r["user_id"], f"{r['offer']} · {'validé' if action == 'validate' else 'refusé'} par l'admin", "info", locked=True, with_request=False)
    return admin_crypto()


@app.route("/admin/storage")
def admin_storage():
    """Vue Stockage de l'admin : total réellement stocké (bucket + disque), part sans auteur connu, prix au Go."""
    admin = current_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    files = bucket_usage()
    db = get_db()
    tracked = {r["key"] for r in db.execute("SELECT key FROM user_files").fetchall()}
    return jsonify({"total": sum(files.values()), "files": len(files),
                    "untracked": sum(v for k, v in files.items() if k not in tracked),
                    "pricePerGb": STORAGE_PRICE_USD_GB, "bucket": bool(s3()), "quotasMb": STORAGE_MB})


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


@app.route("/me/consents", methods=["POST"])
def me_consents():
    """Accord enregistré avec sa preuve : 'terms' (nouvelle version des CGU), 'educator' (règles du programme),
    'purchase' (CGV + accès immédiat et renonciation au droit de rétractation, juste avant le paiement Stripe)."""
    user = current_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    b = request.get_json(silent=True) or {}
    kind = b.get("kind")
    detail = b.get("detail") if isinstance(b.get("detail"), dict) else {}
    db = get_db()
    with db_lock:
        if kind == "terms":
            db.execute("UPDATE users SET terms_version = ? WHERE id = ?", (TERMS_VERSION, user["id"]))
            record_consent(db, user, "terms", TERMS_VERSION, {"docs": ["cgu", "confidentialite", "risques"]}, user["email"])
        elif kind == "educator":
            if not is_educator(user):
                return jsonify({"error": "Réservé aux éducateurs."}), 403
            db.execute("UPDATE users SET edu_terms_version = ? WHERE id = ?", (EDU_TERMS_VERSION, user["id"]))
            record_consent(db, user, "educator", EDU_TERMS_VERSION, {"docs": ["programme-educateur", "revenus-educateurs"]}, user["email"])
        elif kind == "purchase":
            if not (detail.get("cgv") is True and detail.get("immediate") is True and detail.get("risks") is True):
                return jsonify({"error": "Coche les trois cases avant de payer."}), 400
            clean = {k: detail.get(k) for k in ("offer", "price", "months", "cgv", "immediate", "risks")}
            record_consent(db, user, "purchase", TERMS_VERSION, clean, user["email"])
        else:
            return jsonify({"error": "Consentement inconnu."}), 400
        db.commit()
    return jsonify({"ok": True, "user": user_public(db.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone())})


@app.route("/me/delete", methods=["POST"])
def me_delete():
    """Droit à l'effacement (RGPD) : le membre supprime lui-même son compte et ses données, mot de passe à l'appui.
    Les paiements et les consentements restent conservés (obligations comptables et preuve du contrat)."""
    user = current_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    key = f"me-delete:{user['id']}"
    if too_many(key, 6, 900):
        return jsonify({"error": TOO_MANY}), 429
    if not check_password_hash(user["password_hash"], (request.get_json(silent=True) or {}).get("password") or ""):
        hit(key)
        return jsonify({"error": "Mot de passe incorrect."}), 400
    if user["is_admin"]:
        return jsonify({"error": "Un compte administrateur ne se supprime pas d'ici : retire d'abord ton rôle depuis Membres."}), 400
    db = get_db()
    with db_lock:
        _purge_user(db, user["id"])
        db.commit()
    return jsonify({"ok": True})


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
def _purge_user(db, member_id):
    """Efface un compte et toutes ses données (admin ou le membre lui-même). Gardés : paiements (billing_events,
    obligations comptables) et preuves de consentement (user_consents)."""
    av = db.execute("SELECT avatar FROM users WHERE id = ?", (member_id,)).fetchone()
    if av and av["avatar"]:
        try:
            delete_file(json.loads(av["avatar"]))
        except (ValueError, TypeError):
            pass
    db.execute("DELETE FROM event_log WHERE user_id = ?", (member_id,))
    db.execute("DELETE FROM hq_devices WHERE user_id = ?", (member_id,))
    vps_ids = [r["id"] for r in db.execute("SELECT id FROM vps_accounts WHERE user_id = ?", (member_id,)).fetchall()]
    for vid in vps_ids:
        db.execute("DELETE FROM vps_deals WHERE vps_id = ?", (vid,))
        db.execute("DELETE FROM vps_equity WHERE vps_id = ?", (vid,))
    db.execute("DELETE FROM vps_accounts WHERE user_id = ?", (member_id,))
    db.execute("DELETE FROM sessions WHERE user_id = ?", (member_id,))
    db.execute("DELETE FROM user_data WHERE user_id = ?", (member_id,))
    db.execute("DELETE FROM user_data_history WHERE user_id = ?", (member_id,))
    db.execute("DELETE FROM user_files WHERE user_id = ?", (member_id,))
    db.execute("DELETE FROM user_backtests WHERE user_id = ?", (member_id,))
    threading.Thread(target=_bucket_drop_prefix, args=(f"data/u{int(member_id)}/",), daemon=True).start()
    db.execute("DELETE FROM edu_invites WHERE educator_id = ?", (member_id,))
    db.execute("DELETE FROM berich_requests WHERE user_id = ?", (member_id,))
    db.execute("DELETE FROM berich_plans WHERE user_id = ?", (member_id,))
    db.execute("DELETE FROM edu_member_notes WHERE member_id = ? OR author_id = ?", (member_id, member_id))
    for row in db.execute("SELECT file FROM mentor_library WHERE member_id = ? AND file IS NOT NULL", (member_id,)).fetchall():
        delete_file(json.loads(row["file"]))
    for row in db.execute("SELECT flyer FROM mentor_events WHERE member_id = ? AND flyer IS NOT NULL", (member_id,)).fetchall():
        delete_file(json.loads(row["flyer"]))
    for t in ("mentor_events", "mentor_notes", "mentor_library", "mentor_tasks"):
        db.execute(f"DELETE FROM {t} WHERE member_id = ?", (member_id,))
    for t, col in (("school_events", "flyer"), ("school_posts", "image")):
        for row in db.execute(f"SELECT {col} FROM {t} WHERE author_id = ? AND {col} IS NOT NULL", (member_id,)).fetchall():
            delete_file(json.loads(row[0]))
        db.execute(f"DELETE FROM {t} WHERE author_id = ?", (member_id,))
    db.execute("UPDATE berich_requests SET educator_id = NULL WHERE educator_id = ?", (member_id,))
    db.execute("DELETE FROM edu_payout_info WHERE educator_id = ?", (member_id,))
    db.execute("DELETE FROM edu_payouts WHERE educator_id = ?", (member_id,))
    db.execute("DELETE FROM edu_fees WHERE educator_id = ?", (member_id,))
    db.execute("DELETE FROM transfer_settings WHERE user_id = ?", (member_id,))
    db.execute("DELETE FROM transfer_payments WHERE user_id = ?", (member_id,))
    db.execute("UPDATE users SET referred_by = NULL WHERE referred_by = ?", (member_id,))
    db.execute("DELETE FROM alert_rules WHERE user_id = ?", (member_id,))
    db.execute("DELETE FROM price_alerts WHERE user_id = ?", (member_id,))
    db.execute("DELETE FROM school_post_updates WHERE author_id = ?", (member_id,))
    db.execute("DELETE FROM crypto_payments WHERE user_id = ? AND status != 'validated'", (member_id,))
    db.execute("DELETE FROM push_subscriptions WHERE user_id = ?", (member_id,))
    db.execute("DELETE FROM shared_backtests WHERE from_user = ? OR to_user = ?", (member_id, member_id))
    db.execute("DELETE FROM user_activity WHERE user_id = ?", (member_id,))
    db.execute("DELETE FROM users WHERE id = ?", (member_id,))
    return vps_ids


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
        vps_ids = _purge_user(db, member_id)
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
# Paiement au prix affiché (2026-10-30) : avec une clé Stripe (restreinte : écriture « Checkout Sessions »
# suffit), le serveur ouvre lui-même la page de paiement de chaque achat (POST /billing/checkout), au prix
# de l'éditeur /offres, avec le membre, l'offre et son éducateur (taux, commission) inscrits sur le paiement
# dans Stripe. Plus de lien à recréer à chaque changement de prix. Sans clé : les liens de l'éditeur.
STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "")
CHECKOUT_SITE = os.environ.get("SITE_URL", "https://www.ch3st.app").rstrip("/")


def _stripe_post(path, fields):
    req = urllib.request.Request("https://api.stripe.com" + path, data=urllib.parse.urlencode(fields).encode(), method="POST",
                                 headers={"Authorization": "Bearer " + STRIPE_SECRET_KEY, "Stripe-Version": "2024-06-20"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            msg = (json.loads(e.read().decode()).get("error") or {}).get("message")
        except ValueError:
            msg = None
        raise RuntimeError(msg or f"Stripe a refusé ({e.code}).")
    except (urllib.error.URLError, TimeoutError):
        raise RuntimeError("Stripe ne répond pas : réessaie dans un instant.")
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
TRIAL_DAYS = 3

# ---------------------------------------------------------------- Prix modifiables (2026-10-21)
# L'admin modifie les offres depuis /offres (mode édition) : nom, textes, éléments, prix, liens de paiement
# Stripe, offres affichées (1 à 3). Trois emplacements fixes, un par niveau de droits (essentiel, premium,
# allstar) : c'est la clé qui donne les droits (School, BERICH...), le reste n'est que de l'affichage.
# Le webhook reconnaît l'offre au montant payé : les prix enregistrés ici sont lus en premier, puis les
# anciens montants (PLAN_AMOUNTS) pour les abonnements pris avant un changement de prix.
# v2 (2026-10-28, demande utilisateur) : 3 rangs par offre. Niveau 1 = 3 mois, 2 = 6 mois, 3 = 1 an, payés
# en une fois. Six emplacements fixes (essentiel1…premium3) : la clé donne les droits et la durée.
# v3 (2026-11-12) : 4 rangs par offre, abonnements qui se renouvellent seuls (liens Stripe récurrents) :
# I = 3 mois, II = 6 mois, III = 1 an, IV = 1 mois, chaque offre renouvelée au même prix.
# v4 (2026-11-12, demande patron : « I = moins cher, IV = plus cher ») : I = 1 mois, II = 3 mois, III = 6 mois, IV = 1 an.
# Les offres enregistrées et les rangs des membres sont renumérotés une fois au démarrage (rank_v4_migrate).
LEVEL_MONTHS = {1: 1, 2: 3, 3: 6, 4: 12}
RANK_V4 = {1: 2, 2: 3, 3: 4, 4: 1}  # ancien numéro de rang (v3) → nouveau
PRICING_KEYS = ("essentiel1", "essentiel2", "essentiel3", "essentiel4", "premium1", "premium2", "premium3", "premium4")
OFFER_PRICES = {"essentiel": {1: 150, 2: 450, 3: 800, 4: 1500}, "premium": {1: 300, 2: 900, 3: 1700, 4: 3000}}
OFFER_RENEW = {}  # 2026-11-12 : plus de tarif réduit au renouvellement (Premium III = 3 000 € chaque année)
OFFER_PERKS = {"premium4": ["Mentorat et accompagnement à vie", "VPS offert"], "premium3": ["VPS offert"],
               "essentiel4": ["1 appel de mentorat par semaine, à débloquer quand tu veux"]}
_ESS_FEATS = [[1, "Tous les scanners et leurs alertes"], [1, "Backtesting et rapports complets"], [1, "Journal de trading"],
              [1, "Dashboard et comptes reliés"], [1, "Calendrier économique"],
              [0, "School complet et cours vidéo"], [0, "BERICH et suivi des positions"], [0, "Accompagnement personnalisé"]]
_PRE_FEATS = [[1, "Tout CHEST Essentiel"], [1, "School complet : cours écrits et vidéo"], [1, "BERICH et suivi des positions"],
              [1, "Accompagnement personnalisé par ton éducateur"]]


ROMAN = {1: "I", 2: "II", 3: "III", 4: "IV"}


def rank_price(plan, level):
    """Prix affiché de l'offre d'un rang (éditeur Prix), en euros ; None hors Essentiel/Premium."""
    if plan not in ("essentiel", "premium") or not level:
        return None
    for o in get_pricing()["offers"]:
        if o.get("key") == f"{plan}{level}":
            return o.get("price")
    return None


def _default_offer(key):
    group, level = key[:-1], int(key[-1])
    ess = group == "essentiel"
    price = OFFER_PRICES[group][level]
    m = LEVEL_MONTHS[level]
    span = "1 an" if m == 12 else f"{m} mois"
    return {"key": key, "group": group, "level": level, "months": m, "enabled": True, "soon": False,
            "featured": key == "premium4", "name": f"{'Essentiel' if ess else 'Premium'} {ROMAN[level]}", "price": price, "link": "",
            "renew": OFFER_RENEW.get(key, price),
            "who": ("Pour trader en autonomie avec tous les outils" if ess else "Pour progresser vite, accompagné"),
            "desc": (f"{span} sur toute la plateforme, renouvelé automatiquement." if ess else f"{span} de CHEST complet, formation et suivi, renouvelé automatiquement."),
            "feats": [list(f) for f in (_ESS_FEATS if ess else _PRE_FEATS)] + [[1, t] for t in OFFER_PERKS.get(key, [])]}


PRICING_DEFAULT = {"offers": [_default_offer(k) for k in PRICING_KEYS]}


def get_pricing():
    try:
        data = json.loads(get_setting("pricing") or "null")
    except ValueError:
        data = None
    ok = isinstance(data, dict) and isinstance(data.get("offers"), list) and \
        [o.get("key") for o in data["offers"] if isinstance(o, dict)] == list(PRICING_KEYS)
    data = data if ok else PRICING_DEFAULT  # ancien format (mensuel / annuel) : on repart des nouvelles offres
    # Liens de paiement Stripe créés le 2026-11-04 (paiement unique, TVA comprise, codes promo autorisés,
    # retour sur /offres?paiement=ok) : ils remplissent une offre sans lien tant que son prix n'a pas changé.
    out = []
    for o in data["offers"]:
        o = dict(o)
        dl = STRIPE_DEFAULT_LINKS.get(o.get("key"))
        if dl and not str(o.get("link") or "").strip() and o.get("price") == dl[0]:
            o["link"] = dl[1]
        o.setdefault("renew", OFFER_RENEW.get(o.get("key"), o.get("price")))
        out.append(o)
    return {**data, "offers": out}


# Le webhook reconnaît l'offre au lien utilisé (payment_link) : Essentiel 3 et Premium 1 ont le même prix.
# Abonnements Stripe (2026-11-12, liens récurrents : chaque offre se renouvelle à sa durée, au même prix).
# Anciens liens désactivés dans Stripe le 2026-11-12.
STRIPE_LINK_IDS = {"plink_1UaxobAN6r524EGXZ2iEj9Xb": "essentiel3", "plink_1Uaxo7AN6r524EGXNQgaNfzB": "essentiel2",
                   "plink_1Uaxp4AN6r524EGXAfNtqn4k": "essentiel4", "plink_1UaxndAN6r524EGXmsgYnGPQ": "essentiel1",
                   "plink_1UaxlVAN6r524EGXesyXvP7q": "premium2", "plink_1Uaxm4AN6r524EGXfhp28H6L": "premium3",
                   "plink_1UaySyAN6r524EGXRqAe0MwQ": "premium4", "plink_1UaxkTAN6r524EGXMJ0C4f8f": "premium1"}
STRIPE_DEFAULT_LINKS = {  # offre -> (prix TTC du 1er paiement, lien de paiement Stripe)
    "essentiel1": (150, "https://buy.stripe.com/3cI5kCfvR3437zK7f52B20e"),
    "essentiel2": (450, "https://buy.stripe.com/cNi6oG2J54878DO42T2B20f"),
    "essentiel3": (800, "https://buy.stripe.com/00w3cu1F16gf5rC1UL2B20g"),
    "essentiel4": (1500, "https://buy.stripe.com/9B68wO3N91ZZg6geHx2B20h"),
    "premium1": (300, "https://buy.stripe.com/bJe28q4RdcED7zK2YP2B20a"),
    "premium2": (900, "https://buy.stripe.com/bJebJ0gzV3433ju9nd2B20b"),
    "premium3": (1700, "https://buy.stripe.com/6oUeVcdnJawv1bmczp2B20c"),
    "premium4": (3000, "https://buy.stripe.com/7sY3cu97t3438DO9nd2B20i"),
}


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
            raise ValueError("Les huit emplacements d'offre sont attendus.")
        feats = []
        for f in (o.get("feats") or [])[:16]:
            if isinstance(f, (list, tuple)) and len(f) == 2:
                t = _clean_text(f[1], 140)
                if t:
                    feats.append([1 if f[0] else 0, t])
        level = int(key[-1])
        item = {"key": key, "group": key[:-1], "level": level, "months": LEVEL_MONTHS[level],
                "enabled": bool(o.get("enabled")), "soon": bool(o.get("soon")), "featured": bool(o.get("featured")),
                "name": _clean_text(o.get("name"), 40), "who": _clean_text(o.get("who"), 90),
                "desc": _clean_text(o.get("desc"), 220), "price": _clean_price(o.get("price")),
                "link": _clean_link(o.get("link")), "feats": feats,
                "renew": _clean_price(o.get("renew")) or OFFER_RENEW.get(key) or _clean_price(o.get("price"))}
        if item["enabled"]:
            if not item["name"]:
                raise ValueError("Chaque offre affichée doit avoir un nom.")
            if item["price"] is None:
                raise ValueError(f"{item['name']} : indique son prix.")
        out.append(item)
    if not any(o["enabled"] for o in out):
        raise ValueError("Garde au moins une offre affichée.")
    return {"offers": out}


def plan_for_amount(amount):
    """{plan, level, months} d'après le montant payé (centimes) : offres actuelles d'abord, puis les anciens tarifs."""
    amount = int(amount or 0)
    for o in get_pricing().get("offers", []):
        price = o.get("price")
        pct = get_promo()["pct"]
        if price and o.get("group") in PLANS and amount in (int(round(float(price) * 100)), int(round(float(price) * (100 - pct)))):
            return {"plan": o["group"], "level": o.get("level"), "months": o.get("months") or LEVEL_MONTHS.get(o.get("level"), 1)}
    legacy = PLAN_AMOUNTS.get(amount)
    if legacy:
        return {"plan": legacy[0], "level": None, "months": 12 if legacy[1] == "year" else 1, "period": legacy[1]}
    return None


def _add_months(dt, n):
    m = dt.month - 1 + n
    y, m = dt.year + m // 12, m % 12 + 1
    import calendar as _cal
    return dt.replace(year=y, month=m, day=min(dt.day, _cal.monthrange(y, m)[1]))


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
    level = _col(row, "plan_level") if plan in ("essentiel", "premium") else None
    label = PLANS.get(plan, {}).get("label", "Aucune offre")
    return {
        "plan": plan,
        "level": level,
        "label": f"{label} {ROMAN.get(level, level)}" if level else label,
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
    m = re.fullmatch(r"u(\d+)(?:-[a-z]+\d)?", ref)
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
# Remboursement possible pendant 7 jours : une commission ne devient retirable que 14 jours après le paiement,
# pour pouvoir rembourser un membre avec les fonds de sa vente. Un remboursement annule la commission.
EDU_HOLD_DAYS = 14
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


def _net_sales(db, user_id):
    """Les ventes d'un membre, ses remboursements, et ce qu'il reste de chaque vente (centimes) : chaque
    remboursement annule la vente la plus récente qui le précède (jamais une autre)."""
    sales = member_sales(db, user_id)
    refunds = db.execute("SELECT id, amount, created_at FROM billing_events WHERE user_id = ? AND type = 'charge.refunded' AND amount > 0",
                         (user_id,)).fetchall()
    net = {r["id"]: r["amount"] for r in sales}
    for rf in sorted(refunds, key=lambda x: x["created_at"] or ""):
        left = rf["amount"]
        for sale in sorted(sales, key=lambda x: x["created_at"] or "", reverse=True):
            if left <= 0:
                break
            if (sale["created_at"] or "") <= (rf["created_at"] or "") and net[sale["id"]] > 0:
                cut = min(left, net[sale["id"]])
                net[sale["id"]] -= cut
                left -= cut
    return sales, refunds, net


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
    earned = matured = 0.0
    now = datetime.now(timezone.utc)
    hold_until = lambda at: (_parse_iso(at) or now) + timedelta(days=EDU_HOLD_DAYS)
    for m in members:
        sales, refunds, net = _net_sales(db, m["id"])
        total = sum(net.values())
        comm = total * rate / 100
        earned += comm
        # retirable : ce qui reste des ventes payées il y a plus de 14 jours
        matured += sum(net[r["id"]] for r in sales if hold_until(r["created_at"]) <= now) * rate / 100
        for r in refunds:
            tx.append({"kind": "refund", "at": r["created_at"], "amount": -round(r["amount"] * rate / 100), "sale": r["amount"],
                       "member": f"{m['first_name']} {(m['last_name'] or '')[:1]}.".strip()})
        a = access_of(m)
        out_members.append({
            "id": m["id"], "name": f"{m['first_name']} {(m['last_name'] or '')[:1]}.".strip(),
            "joinedAt": m["created_at"], "plan": a["label"] if a["active"] else ("Essai terminé" if a["trialUsed"] else "Sans offre"),
            "active": bool(a["active"]) and a["plan"] not in ("trial", "none"), "trial": a["trial"] and a["active"],
            "sales": total, "commission": round(comm), "payments": len(sales), "lastSeenAt": _col(m, "last_seen_at"),
            "level": a.get("level"), "planKey": a["plan"], "endsAt": a["endsAt"], "price": rank_price(a["plan"], a.get("level")),
            "berichPending": bool(db.execute("SELECT 1 FROM berich_requests WHERE user_id = ? AND status = 'pending'", (m["id"],)).fetchone()),
        })
        mk = (m["created_at"] or "")[:7]
        monthly.setdefault(mk, {"month": mk, "signups": 0, "commission": 0.0})["signups"] += 1
        for r in sales:
            c = r["amount"] * rate / 100
            tx.append({"kind": "commission", "at": r["created_at"], "amount": round(c), "sale": r["amount"],
                       "availableAt": hold_until(r["created_at"]).isoformat(), "locked": hold_until(r["created_at"]) > now,
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
    chosen = _col(educator, "edu_code")
    inv = {"code": chosen} if chosen else db.execute("SELECT code FROM edu_invites WHERE educator_id = ? AND active = 1 ORDER BY created_at DESC", (educator["id"],)).fetchone()
    earned_c = round(earned)
    return {
        "educator": {"id": educator["id"], "name": f"{educator['first_name']} {educator['last_name']}", "scanner": _col(educator, "edu_scanner")},
        "rate": rate, "invite": inv["code"] if inv else None, "codeChosen": bool(chosen), "minPayout": EDU_MIN_PAYOUT,
        "members": out_members,
        "totals": {"members": len(out_members), "active": sum(1 for m in out_members if m["active"]),
                   "trials": sum(1 for m in out_members if m["trial"]), "sales": sum(m["sales"] for m in out_members)},
        "wallet": {"earned": earned_c, "paid": paid, "pending": pending, "holdDays": EDU_HOLD_DAYS,
                   "locked": max(0, earned_c - round(matured)), "available": max(0, round(matured) - paid - pending)},
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


@app.route("/edu/notes")
def edu_notes():
    """Une note par membre de l'éducateur : chaque nouveau membre arrive avec sa note (vide). Admin : ?educator=ID, lecture."""
    who, err = _edu_subject()
    if err:
        return err
    db = get_db()
    notes = {r["member_id"]: r for r in db.execute("SELECT * FROM edu_member_notes WHERE author_id = ?", (who["id"],)).fetchall()}
    out = []
    for m in db.execute("SELECT * FROM users WHERE referred_by = ? ORDER BY created_at DESC", (who["id"],)).fetchall():
        a, n = access_of(m), notes.get(m["id"])
        out.append({**_person(m), "joinedAt": m["created_at"], "planKey": a["plan"], "level": a.get("level"), "active": bool(a["active"]),
                    "body": n["body"] if n else "", "updatedAt": n["updated_at"] if n else None})
    return jsonify({"notes": out, "readOnly": who["id"] != current_user()["id"]})


@app.route("/edu/notes/<int:mid>", methods=["PUT"])
def edu_note_save(mid):
    user = current_user()
    if not user or not is_educator(user):
        return jsonify({"error": "Réservé aux éducateurs."}), 403
    db = get_db()
    if not db.execute("SELECT 1 FROM users WHERE id = ? AND referred_by = ?", (mid, user["id"])).fetchone():
        return jsonify({"error": "Ce membre n'est pas l'un des tiens."}), 404
    body = str((request.get_json(silent=True) or {}).get("body") or "")
    if len(body) > 20000:
        return jsonify({"error": "Note trop longue (20 000 caractères au plus)."}), 400
    now = datetime.now(timezone.utc).isoformat()
    with db_lock:
        db.execute("INSERT INTO edu_member_notes (author_id, member_id, body, updated_at) VALUES (?, ?, ?, ?) "
                   "ON CONFLICT(author_id, member_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at", (user["id"], mid, body, now))
        db.commit()
    return jsonify({"memberId": mid, "body": body, "updatedAt": now})


@app.route("/edu/overview")
def edu_overview():
    who, err = _edu_subject()
    if err:
        return err
    return jsonify(edu_report(get_db(), who))


# ---------------------------------------------------------------- Connexion BERICH clé en main (2026-10-28)
_FERNET = None


def _fernet():
    """Clé de chiffrement des accès MT5 : variable DATA_KEY, sinon un fichier data.key créé une fois sur le volume."""
    global _FERNET
    if _FERNET is None:
        from cryptography.fernet import Fernet
        key = os.environ.get("DATA_KEY", "").encode()
        if not key:
            kp = os.path.join(DB_DIR, "data.key")
            if not os.path.exists(kp):
                with open(kp, "wb") as f:
                    f.write(Fernet.generate_key())
            with open(kp, "rb") as f:
                key = f.read().strip()
        _FERNET = Fernet(key)
    return _FERNET


def _req_public(r, reveal=False):
    out = {"id": r["id"], "userId": r["user_id"], "brokerId": r["broker_id"], "broker": r["broker_name"], "kind": r["kind"],
           "server": r["server"], "login": r["login"], "phase": r["phase"], "rules": json.loads(r["rules"] or "{}"),
           "status": r["status"], "createdAt": r["created_at"], "doneAt": r["done_at"], "note": r["note"] or ""}
    if reveal and r["password_enc"]:
        try:
            out["password"] = _fernet().decrypt(r["password_enc"].encode()).decode()
        except Exception:
            out["password"] = None
    return out


@app.route("/berich/requests", methods=["GET", "POST"])
def berich_requests():
    user = approved_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    db = get_db()
    if request.method == "GET":
        r = db.execute("SELECT * FROM berich_requests WHERE user_id = ? ORDER BY id DESC LIMIT 1", (user["id"],)).fetchone()
        return jsonify({"request": _req_public(r) if r else None})
    a = access_of(user)
    if not (a["berich"] and (a.get("level") == 4 or user["is_admin"] or _col(user, "role") == "educator")):
        return jsonify({"error": "La connexion clé en main est incluse dans Premium 3."}), 403
    b = request.get_json(silent=True) or {}
    clean = lambda v, n: re.sub(r"\s+", " ", str(v or "")).strip()[:n]
    broker, server, login, password = clean(b.get("broker"), 60), clean(b.get("server"), 80), clean(b.get("login"), 40), str(b.get("password") or "")[:120]
    if not broker:
        return jsonify({"error": "Choisis ton broker ou ta propfirm."}), 400
    if not server:
        return jsonify({"error": "Indique le serveur MT5 de ton compte."}), 400
    if not re.fullmatch(r"[0-9]{4,20}", login):
        return jsonify({"error": "Le numéro de compte MT5 ne contient que des chiffres."}), 400
    if len(password) < 4:
        return jsonify({"error": "Indique le mot de passe MT5 (principal) de ce compte."}), 400
    kind = "propfirm" if b.get("kind") == "propfirm" else "broker"
    phase = clean(b.get("phase"), 20) if kind == "propfirm" else ""
    rules = {}
    for k in ("minDays", "target", "dailyLoss", "maxLoss"):
        v = (b.get("rules") or {}).get(k)
        try:
            rules[k] = float(str(v).replace(",", ".")) if v not in (None, "") else None
        except ValueError:
            rules[k] = None
    now = datetime.now(timezone.utc).isoformat()
    with db_lock:
        db.execute("UPDATE berich_requests SET status = 'replaced' WHERE user_id = ? AND status = 'pending'", (user["id"],))
        db.execute("INSERT INTO berich_requests (user_id, educator_id, broker_id, broker_name, kind, server, login, password_enc, phase, rules, status, created_at) "
                   "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
                   (user["id"], _col(user, "referred_by"), clean(b.get("brokerId"), 40), broker, kind, server, login,
                    _fernet().encrypt(password.encode()).decode(), phase, json.dumps(rules), now))
        db.commit()
    r = db.execute("SELECT * FROM berich_requests WHERE user_id = ? ORDER BY id DESC LIMIT 1", (user["id"],)).fetchone()
    return jsonify({"request": _req_public(r)})


def _can_handle_request(user, req):
    return bool(user) and (user["is_admin"] or (is_educator(user) and req["educator_id"] == user["id"]))


@app.route("/berich/requests/<int:rid>", methods=["POST"])
def berich_request_update(rid):
    """L'éducateur (ou l'admin) marque la connexion comme faite, avec un mot pour le membre."""
    user = current_user()
    db = get_db()
    req = db.execute("SELECT * FROM berich_requests WHERE id = ?", (rid,)).fetchone()
    if not req or not _can_handle_request(user, req):
        return jsonify({"error": "Demande introuvable."}), 404
    b = request.get_json(silent=True) or {}
    status = b.get("status")
    if status not in ("done", "pending"):
        return jsonify({"error": "Statut inconnu."}), 400
    with db_lock:
        db.execute("UPDATE berich_requests SET status = ?, done_at = ?, note = ? WHERE id = ?",
                   (status, datetime.now(timezone.utc).isoformat() if status == "done" else None, str(b.get("note") or "")[:240], rid))
        db.commit()
    return jsonify({"request": _req_public(db.execute("SELECT * FROM berich_requests WHERE id = ?", (rid,)).fetchone(), reveal=True)})


# ---------------------------------------------------------------- Suivi élève–éducateur (2026-10-28)
# L'élève et son éducateur partagent un espace : planning de rendez-vous (l'un propose, l'autre confirme), notes
# (rattachées ou non à un rendez-vous) et bibliothèque (textes, vidéos envoyées ou liens, fichiers).
# Accès : l'élève (son espace), son éducateur (users.referred_by), un admin.
EVENT_STATUSES = ("proposed", "confirmed", "declined", "cancelled", "done")


def _mentor_ctx(member_id):
    """(user, member, educator) si l'utilisateur connecté peut ouvrir l'espace de member_id, sinon une réponse d'erreur."""
    user = current_user()
    if not user:
        return None, (jsonify({"error": "Non connecté."}), 401)
    db = get_db()
    try:
        mid = int(member_id) if member_id not in (None, "") else user["id"]
    except (TypeError, ValueError):
        return None, (jsonify({"error": "Élève introuvable."}), 404)
    member = db.execute("SELECT * FROM users WHERE id = ?", (mid,)).fetchone()
    if not member:
        return None, (jsonify({"error": "Élève introuvable."}), 404)
    allowed = user["id"] == member["id"] or user["is_admin"] or (is_educator(user) and member["referred_by"] == user["id"])
    if not allowed:
        return None, (jsonify({"error": "Cet espace ne t'est pas ouvert."}), 403)
    edu = db.execute("SELECT * FROM users WHERE id = ?", (member["referred_by"],)).fetchone() if member["referred_by"] else None
    return (user, member, edu), None


def _person(row):
    return {"id": row["id"], "name": f"{row['first_name']} {row['last_name']}", "first": row["first_name"]} if row else None


def _mentor_payload(db, user, member, edu):
    names = {}
    def who(uid):
        if uid not in names:
            r = db.execute("SELECT first_name, last_name FROM users WHERE id = ?", (uid,)).fetchone()
            names[uid] = f"{r['first_name']} {(r['last_name'] or '')[:1]}." if r else "Compte supprimé"
        return names[uid]
    mid = member["id"]
    events = [{"id": r["id"], "startsAt": r["starts_at"], "minutes": r["minutes"], "topic": r["topic"] or "", "mode": r["mode"] or "",
               "link": r["link"] or "", "status": r["status"], "authorId": r["author_id"], "author": "CHEST" if _col(r, "signed") == "chest" else who(r["author_id"]),
               "common": bool(_col(r, "common_id")), "body": _col(r, "body", ""), "flyer": json.loads(r["flyer"]) if _col(r, "flyer") else None,
               "createdAt": r["created_at"]} for r in db.execute("SELECT * FROM mentor_events WHERE member_id = ? ORDER BY starts_at", (mid,)).fetchall()]
    notes = [{"id": r["id"], "eventId": r["event_id"], "title": r["title"] or "", "body": r["body"] or "", "authorId": r["author_id"],
              "author": who(r["author_id"]), "createdAt": r["created_at"], "updatedAt": r["updated_at"]}
             for r in db.execute("SELECT * FROM mentor_notes WHERE member_id = ? ORDER BY created_at DESC", (mid,)).fetchall()]
    lib = [{"id": r["id"], "kind": r["kind"], "title": r["title"] or "", "body": r["body"] or "", "url": r["url"] or "",
            "file": json.loads(r["file"]) if r["file"] else None, "authorId": r["author_id"], "author": who(r["author_id"]), "createdAt": r["created_at"]}
           for r in db.execute("SELECT * FROM mentor_library WHERE member_id = ? ORDER BY created_at DESC", (mid,)).fetchall()]
    tasks = [{"id": r["id"], "title": r["title"], "dueAt": r["due_at"], "doneAt": r["done_at"], "author": "CHEST" if _col(r, "signed") == "chest" else who(r["author_id"]),
              "common": bool(_col(r, "common_id")), "createdAt": r["created_at"]}
             for r in db.execute("SELECT * FROM mentor_tasks WHERE member_id = ? ORDER BY done_at IS NOT NULL, due_at IS NULL, due_at, id", (mid,)).fetchall()]
    a = access_of(member)
    return {"tasks": tasks, "me": {"id": user["id"], "role": "member" if user["id"] == mid else ("educator" if is_educator(user) else "admin")},
            "member": {**_person(member), "plan": a["label"], "level": a.get("level"), "planKey": a["plan"], "price": rank_price(a["plan"], a.get("level")), "endsAt": a["endsAt"], "joinedAt": member["created_at"]},
            "educator": _person(edu), "events": events, "notes": notes, "library": lib}


@app.route("/mentor")
def mentor_get():
    ctx, err = _mentor_ctx(request.args.get("member"))
    if err:
        return err
    return jsonify(_mentor_payload(get_db(), *ctx))


@app.route("/mentor/students")
def mentor_students():
    """Les élèves d'un éducateur (ou tous les élèves rattachés, pour l'admin), avec leur prochain rendez-vous."""
    user = current_user()
    if not user or not (is_educator(user) or user["is_admin"]):
        return jsonify({"error": "Réservé aux éducateurs."}), 403
    db = get_db()
    if is_educator(user):
        rows = db.execute("SELECT * FROM users WHERE referred_by = ? ORDER BY first_name", (user["id"],)).fetchall()
    elif request.args.get("educator", "").isdigit():
        rows = db.execute("SELECT * FROM users WHERE referred_by = ? ORDER BY first_name", (int(request.args["educator"]),)).fetchall()
    else:
        # Admin : tous les membres (avec ou sans éducateur), l'équipe exclue.
        rows = db.execute("SELECT * FROM users WHERE is_admin = 0 AND COALESCE(role, 'member') = 'member' AND status = 'approved' ORDER BY first_name").fetchall()
    edu_names = {r["id"]: r["first_name"] for r in db.execute("SELECT id, first_name FROM users WHERE role = 'educator'").fetchall()}
    now = datetime.now(timezone.utc).isoformat()
    out = []
    for m in rows:
        nxt = db.execute("SELECT starts_at, status FROM mentor_events WHERE member_id = ? AND starts_at >= ? AND status IN ('proposed', 'confirmed') ORDER BY starts_at LIMIT 1", (m["id"], now)).fetchone()
        a = access_of(m)
        t = db.execute("SELECT COUNT(*) AS n, SUM(done_at IS NOT NULL) AS d, SUM(done_at IS NULL AND due_at < ?) AS late FROM mentor_tasks WHERE member_id = ?", (now, m["id"])).fetchone()
        last = db.execute("SELECT MAX(created_at) FROM mentor_notes WHERE member_id = ?", (m["id"],)).fetchone()[0]
        out.append({**_person(m), "educatorId": m["referred_by"], "educator": edu_names.get(m["referred_by"]), "plan": a["label"], "level": a.get("level"), "planKey": a["plan"], "active": bool(a["active"]),
                    "price": rank_price(a["plan"], a.get("level")), "endsAt": a["endsAt"], "next": dict(nxt) if nxt else None,
                    "tasks": {"total": t["n"] or 0, "done": t["d"] or 0, "late": t["late"] or 0}, "lastNoteAt": last,
                    "pending": db.execute("SELECT COUNT(*) AS n FROM mentor_events WHERE member_id = ? AND status = 'proposed' AND author_id = ?", (m["id"], m["id"])).fetchone()["n"]})
    return jsonify({"students": out})


def _mentor_write(member_id):
    ctx, err = _mentor_ctx(member_id)
    if err:
        return None, err
    user, member, edu = ctx
    if user["id"] == member["id"] and not edu:
        return None, (jsonify({"error": "Tu n'as pas encore d'éducateur : inscris-toi avec son code pour ouvrir ton suivi."}), 400)
    return ctx, None


@app.route("/mentor/events", methods=["POST"])
def mentor_event_save():
    # JSON, ou multipart (champ data + flyer) quand l'équipe joint un flyer.
    try:
        b = json.loads(request.form.get("data", "{}")) if (request.files or request.form) else (request.get_json(silent=True) or {})
    except ValueError:
        return jsonify({"error": "Données invalides."}), 400
    ctx, err = _mentor_write(b.get("member"))
    if err:
        return err
    user, member, edu = ctx
    try:
        starts = datetime.fromisoformat(str(b.get("startsAt") or "").replace("Z", "+00:00"))
        if starts.tzinfo is None:
            starts = starts.replace(tzinfo=timezone.utc)
    except ValueError:
        return jsonify({"error": "Date et heure invalides."}), 400
    try:
        minutes = max(10, min(240, int(b.get("minutes") or 45)))
    except (TypeError, ValueError):
        minutes = 45
    topic = re.sub(r"\s+", " ", str(b.get("topic") or "")).strip()[:140]
    if not topic:
        return jsonify({"error": "Indique le sujet du rendez-vous."}), 400
    mode = b.get("mode") if b.get("mode") in ("visio", "telephone", "presentiel") else "visio"
    link = str(b.get("link") or "").strip()[:300]
    if link and not re.fullmatch(r"https://\S+", link):
        return jsonify({"error": "Le lien de visio doit commencer par https://"}), 400
    body = str(b.get("body") or "").strip()[:4000]
    # L'équipe pose l'appel directement dans le planning de l'élève (déjà confirmé) ; un élève, lui, propose.
    staff = user["id"] != member["id"]
    status = "confirmed" if staff and b.get("confirmed", True) else "proposed"
    up = save_upload("flyer", f"e{member['id']}") if staff else None
    if up and not (up.get("mime") or "").startswith("image/"):
        delete_file(up)
        return jsonify({"error": "Le flyer doit être une image."}), 400
    now = datetime.now(timezone.utc).isoformat()
    db = get_db()
    with db_lock:
        if b.get("id"):
            ev = db.execute("SELECT * FROM mentor_events WHERE id = ? AND member_id = ?", (b.get("id"), member["id"])).fetchone()
            if not ev:
                return jsonify({"error": "Rendez-vous introuvable."}), 404
            flyer = _col(ev, "flyer")
            if up or b.get("removeFlyer"):
                delete_file(json.loads(flyer) if flyer else None)
                flyer = json.dumps(up) if up else None
            # déplacé par l'élève : il redevient une proposition, à confirmer par l'éducateur
            db.execute("UPDATE mentor_events SET starts_at = ?, minutes = ?, topic = ?, mode = ?, link = ?, body = ?, flyer = ?, status = ?, author_id = ?, updated_at = ? WHERE id = ?",
                       (starts.isoformat(), minutes, topic, mode, link, body, flyer, status, user["id"], now, ev["id"]))
        else:
            db.execute("INSERT INTO mentor_events (member_id, author_id, starts_at, minutes, topic, mode, link, body, flyer, status, created_at, updated_at, signed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                       (member["id"], user["id"], starts.isoformat(), minutes, topic, mode, link, body, json.dumps(up) if up else None, status, now, now, _signed(user, b)))
        db.commit()
    if not b.get("id") or not staff:
        when = _fr_when(starts.isoformat())
        if staff:
            _school_notify(db, [member["id"]], "event", f"{_sig(db, user, _signed(user, b))} t'a ajouté un appel", f"{topic} · {when}", "/school", user["id"])
            if edu and edu["id"] != user["id"]:
                _school_notify(db, [edu["id"]], "event", f"{_sig(db, user, _signed(user, b))} a ajouté un appel avec {member['first_name']}", f"{topic} · {when}", "/school", user["id"])
        elif edu:
            _school_notify(db, [edu["id"]], "event", f"{member['first_name']} propose un appel", f"{topic} · {when}", "/school", user["id"])
    return jsonify(_mentor_payload(db, user, member, edu))


@app.route("/mentor/events/<int:eid>/status", methods=["POST"])
def mentor_event_status(eid):
    b = request.get_json(silent=True) or {}
    db = get_db()
    ev = db.execute("SELECT * FROM mentor_events WHERE id = ?", (eid,)).fetchone()
    if not ev:
        return jsonify({"error": "Rendez-vous introuvable."}), 404
    ctx, err = _mentor_write(ev["member_id"])
    if err:
        return err
    user, member, edu = ctx
    status = b.get("status")
    if status not in EVENT_STATUSES:
        return jsonify({"error": "Statut inconnu."}), 400
    if status in ("confirmed", "declined") and ev["author_id"] == user["id"] and not user["is_admin"]:
        return jsonify({"error": "C'est à l'autre personne de confirmer ta proposition."}), 400
    with db_lock:
        db.execute("UPDATE mentor_events SET status = ?, updated_at = ? WHERE id = ?", (status, datetime.now(timezone.utc).isoformat(), eid))
        db.commit()
    return jsonify(_mentor_payload(db, user, member, edu))


@app.route("/mentor/tasks", methods=["POST"])
def mentor_task_save():
    """L'éducateur (ou l'admin) fixe une mission avec une date de fin ; le membre la coche."""
    b = request.get_json(silent=True) or {}
    ctx, err = _mentor_write(b.get("member"))
    if err:
        return err
    user, member, edu = ctx
    if user["id"] == member["id"]:
        return jsonify({"error": "Les missions sont fixées par ton éducateur."}), 403
    title = re.sub(r"\s+", " ", str(b.get("title") or "")).strip()[:200]
    if not title:
        return jsonify({"error": "Décris la mission."}), 400
    due = None
    if b.get("dueAt"):
        try:
            d = datetime.fromisoformat(str(b["dueAt"]).replace("Z", "+00:00"))
            due = (d if d.tzinfo else d.replace(tzinfo=timezone.utc)).isoformat()
        except ValueError:
            return jsonify({"error": "Date de fin invalide."}), 400
    db = get_db()
    with db_lock:
        if b.get("id"):
            if not db.execute("SELECT 1 FROM mentor_tasks WHERE id = ? AND member_id = ?", (b["id"], member["id"])).fetchone():
                return jsonify({"error": "Mission introuvable."}), 404
            db.execute("UPDATE mentor_tasks SET title = ?, due_at = ? WHERE id = ?", (title, due, b["id"]))
        else:
            db.execute("INSERT INTO mentor_tasks (member_id, author_id, title, due_at, created_at, signed) VALUES (?, ?, ?, ?, ?, ?)",
                       (member["id"], user["id"], title, due, datetime.now(timezone.utc).isoformat(), _signed(user, b)))
        db.commit()
    if not b.get("id"):
        _school_notify(db, [member["id"]], "task", f"{_sig(db, user, _signed(user, b))} t'a donné une mission", title + (f" · pour {_fr_when(due).split(' à ')[0]}" if due else ""), "/school", user["id"])
    return jsonify(_mentor_payload(db, user, member, edu))


@app.route("/mentor/tasks/<int:tid>/<action>", methods=["POST"])
def mentor_task_action(tid, action):
    db = get_db()
    t = db.execute("SELECT * FROM mentor_tasks WHERE id = ?", (tid,)).fetchone()
    if not t or action not in ("toggle", "delete"):
        return jsonify({"error": "Mission introuvable."}), 404
    # cocher sa mission reste possible sans éducateur (missions posées par l'admin chez tous les membres)
    ctx, err = _mentor_ctx(t["member_id"]) if action == "toggle" else _mentor_write(t["member_id"])
    if err:
        return err
    user, member, edu = ctx
    with db_lock:
        if action == "toggle":
            db.execute("UPDATE mentor_tasks SET done_at = ? WHERE id = ?", (None if t["done_at"] else datetime.now(timezone.utc).isoformat(), tid))
        elif user["id"] == member["id"]:
            return jsonify({"error": "Seul ton éducateur peut retirer une mission."}), 403
        else:
            db.execute("DELETE FROM mentor_tasks WHERE id = ?", (tid,))
        db.commit()
    return jsonify(_mentor_payload(db, user, member, edu))


# ---------------------------------------------------------------- School côté admin (2026-10-28)
# L'admin voit chaque éducateur (ses élèves, ses appels, ses retards) et pose un planning commun : un appel collectif
# (répété chaque semaine si besoin, déjà confirmé) ou une mission, copiés chez tous les élèves ou ceux de certains éducateurs.
def _admin_only():
    user = current_user()
    if not user or not user["is_admin"]:
        return None, (jsonify({"error": "Réservé aux administrateurs."}), 403)
    return user, None


def _common_public(db, r):
    table = "mentor_events" if r["kind"] == "event" else "mentor_tasks"
    return {"id": r["id"], "kind": r["kind"], "title": r["title"], "startsAt": r["starts_at"], "minutes": r["minutes"], "mode": r["mode"] or "",
            "link": r["link"] or "", "dueAt": r["due_at"], "weeks": r["weeks"], "educators": json.loads(r["scope"] or "[]"), "createdAt": r["created_at"],
            "members": db.execute(f"SELECT COUNT(DISTINCT member_id) FROM {table} WHERE common_id = ?", (r["id"],)).fetchone()[0],
            "done": db.execute("SELECT COUNT(*) FROM mentor_tasks WHERE common_id = ? AND done_at IS NOT NULL", (r["id"],)).fetchone()[0] if r["kind"] == "task" else None}


@app.route("/mentor/educators")
def mentor_educators():
    user, err = _admin_only()
    if err:
        return err
    db = get_db()
    now = datetime.now(timezone.utc)
    now_s, week_s, month_s = now.isoformat(), (now + timedelta(days=7)).isoformat(), (now - timedelta(days=30)).isoformat()
    out = []
    for e in db.execute("SELECT * FROM users WHERE role = 'educator' ORDER BY first_name").fetchall():
        studs = db.execute("SELECT * FROM users WHERE referred_by = ?", (e["id"],)).fetchall()
        ids = [r["id"] for r in studs]
        q = ",".join("?" * len(ids))
        def one(sql, *extra):
            return db.execute(sql.replace("(IDS)", f"({q})"), (*ids, *extra)).fetchone()[0] if ids else 0
        nxt = one("SELECT MIN(starts_at) FROM mentor_events WHERE member_id IN (IDS) AND starts_at >= ? AND status IN ('proposed', 'confirmed')", now_s)
        out.append({**_person(e), "code": _col(e, "edu_code"), "scanner": _col(e, "edu_scanner"), "students": len(ids), "active": sum(1 for r in studs if access_of(r)["active"]),
                    "calls": one("SELECT COUNT(*) FROM mentor_events WHERE member_id IN (IDS) AND starts_at >= ? AND starts_at <= ? AND status IN ('proposed', 'confirmed')", now_s, week_s),
                    "held30": one("SELECT COUNT(*) FROM mentor_events WHERE member_id IN (IDS) AND starts_at >= ? AND starts_at < ? AND status IN ('confirmed', 'done')", month_s, now_s),
                    "late": one("SELECT COUNT(*) FROM mentor_tasks WHERE member_id IN (IDS) AND done_at IS NULL AND due_at < ?", now_s),
                    "pending": one("SELECT COUNT(*) FROM mentor_events WHERE member_id IN (IDS) AND status = 'proposed' AND author_id = member_id AND starts_at >= ?", now_s),
                    "notes30": one("SELECT COUNT(*) FROM mentor_notes WHERE member_id IN (IDS) AND created_at >= ?", month_s),
                    "next": nxt or None})
    common = [_common_public(db, r) for r in db.execute("SELECT * FROM mentor_common ORDER BY COALESCE(starts_at, due_at, created_at) DESC, id DESC").fetchall()]
    return jsonify({"educators": out, "common": common,
                    "students": db.execute("SELECT COUNT(*) FROM users WHERE referred_by IS NOT NULL").fetchone()[0]})


@app.route("/mentor/common", methods=["POST"])
def mentor_common_add():
    user, err = _admin_only()
    if err:
        return err
    b = request.get_json(silent=True) or {}
    kind = "task" if b.get("kind") == "task" else "event"
    title = re.sub(r"\s+", " ", str(b.get("title") or "")).strip()[:200 if kind == "task" else 140]
    if not title:
        return jsonify({"error": "Donne un titre."}), 400
    def when(v):
        d = datetime.fromisoformat(str(v or "").replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    try:
        start = when(b.get("startsAt")) if kind == "event" else None
        due = when(b.get("dueAt")) if kind == "task" and b.get("dueAt") else None
    except ValueError:
        return jsonify({"error": "Date invalide."}), 400
    try:
        minutes = max(10, min(240, int(b.get("minutes") or 60)))
        weeks = max(1, min(12, int(b.get("weeks") or 1))) if kind == "event" else 1
    except (TypeError, ValueError):
        return jsonify({"error": "Durée invalide."}), 400
    mode = b.get("mode") if b.get("mode") in ("visio", "telephone", "presentiel") else "visio"
    link = str(b.get("link") or "").strip()[:300]
    if link and not re.fullmatch(r"https://\S+", link):
        return jsonify({"error": "Le lien de visio doit commencer par https://"}), 400
    educators = sorted({int(x) for x in (b.get("educators") or []) if str(x).isdigit()})
    db = get_db()
    q = ",".join("?" * len(educators))
    members = [r["id"] for r in (db.execute(f"SELECT id FROM users WHERE referred_by IN ({q})", educators).fetchall() if educators
                                 else db.execute("SELECT id FROM users WHERE referred_by IS NOT NULL").fetchall())]
    if not members:
        return jsonify({"error": "Aucun élève dans cette sélection."}), 400
    now = datetime.now(timezone.utc).isoformat()
    with db_lock:
        cur = db.execute("INSERT INTO mentor_common (kind, title, starts_at, minutes, mode, link, due_at, weeks, scope, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                         (kind, title, start.isoformat() if start else None, minutes if kind == "event" else None, mode if kind == "event" else None,
                          link if kind == "event" else None, due.isoformat() if due else None, weeks, json.dumps(educators), user["id"], now))
        cid = cur.lastrowid
        for mid in members:
            if kind == "event":
                for w in range(weeks):
                    db.execute("INSERT INTO mentor_events (member_id, author_id, starts_at, minutes, topic, mode, link, status, created_at, updated_at, common_id) "
                               "VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?)", (mid, user["id"], (start + timedelta(weeks=w)).isoformat(), minutes, title, mode, link, now, now, cid))
            else:
                db.execute("INSERT INTO mentor_tasks (member_id, author_id, title, due_at, created_at, common_id) VALUES (?, ?, ?, ?, ?, ?)",
                           (mid, user["id"], title, due.isoformat() if due else None, now, cid))
        db.commit()
    return mentor_educators()


@app.route("/mentor/common/<int:cid>/delete", methods=["POST"])
def mentor_common_delete(cid):
    user = current_user()
    db = get_db()
    row = db.execute("SELECT author_id FROM mentor_common WHERE id = ?", (cid,)).fetchone()
    if not user or not row or not (user["is_admin"] or (is_educator(user) and row["author_id"] == user["id"])):
        return jsonify({"error": "Réservé à l'auteur ou à un administrateur."}), 403
    with db_lock:
        db.execute("DELETE FROM mentor_events WHERE common_id = ?", (cid,))
        db.execute("DELETE FROM mentor_tasks WHERE common_id = ?", (cid,))
        db.execute("DELETE FROM mentor_common WHERE id = ?", (cid,))
        db.commit()
    return mentor_educators() if user["is_admin"] else jsonify({"ok": True})


# ---------------------------------------------------------------- School v3 : planning de la semaine et infos (2026-10-28)
# Trois échelles, un même modèle. Chaque appel collectif (school_events) et chaque info (school_posts) a un public :
#   all = tout le monde · members = les membres · educators = l'équipe (éducateurs, admins) · students = les élèves
#   des éducateurs listés dans scope. Un admin choisit librement ; un éducateur publie seulement pour ses élèves.
# Les appels personnels restent dans mentor_events (un membre principal), les missions dans mentor_tasks
# (copiées chez chaque membre visé pour que chacun coche la sienne).
AUDIENCES = ("all", "members", "educators", "students", "people")


def _school_role(user):
    return "admin" if user["is_admin"] else "educator" if is_educator(user) else "member"


def _scope_of(row):
    try:
        return [int(x) for x in json.loads(row["scope"] or "[]")]
    except (TypeError, ValueError):
        return []


def _students_of(edu_id):
    """Ids des élèves d'un éducateur (gardés le temps d'une requête)."""
    cache = g.setdefault("_students_of", {})
    if edu_id not in cache:
        cache[edu_id] = {r["id"] for r in get_db().execute("SELECT id FROM users WHERE referred_by = ?", (edu_id,)).fetchall()}
    return cache[edu_id]


def _school_visible(row, user):
    aud, scope = row["audience"], _scope_of(row)
    if user["is_admin"] or row["author_id"] == user["id"]:
        return True
    if aud == "people":
        # personnes choisies une à une (2026-11-08) ; l'éducateur voit aussi ce qui concerne ses élèves
        return user["id"] in scope or (is_educator(user) and bool(_students_of(user["id"]) & set(scope)))
    if is_educator(user):
        return aud in ("all", "members", "educators") or (aud == "students" and user["id"] in scope)
    return aud in ("all", "members") or (aud == "students" and _col(user, "referred_by") in scope)


def _school_target(user, b, allow_all=False):
    """(audience, scope) demandés, ramenés à ce que l'auteur a le droit de viser. allow_all : un éducateur peut viser
    tout le monde (IDEA partagées à toute la communauté CHEST, 2026-11-12)."""
    picked = sorted({int(x) for x in (b.get("scope") or []) if str(x).isdigit()})
    if not user["is_admin"]:
        if allow_all and b.get("audience") == "all":
            return "all", []
        if b.get("audience") == "people":
            mine = sorted(set(picked) & _students_of(user["id"]))
            return ("people", mine) if mine else (None, None)
        return "students", [user["id"]]
    aud = b.get("audience") if b.get("audience") in AUDIENCES else "all"
    if aud == "people":
        ok = {r["id"] for r in get_db().execute(f"SELECT id FROM users WHERE status = 'approved' AND id IN ({','.join('?' * len(picked))})", picked).fetchall()} if picked else set()
        ok.discard(user["id"])
        return ("people", sorted(ok)) if ok else (None, None)
    scope = sorted({int(x) for x in (b.get("scope") or []) if str(x).isdigit()}) if aud == "students" else []
    if aud == "students" and not scope:
        return None, None
    return aud, scope


def _school_writer():
    user = approved_user()
    if not user or not (user["is_admin"] or is_educator(user)):
        return None, (jsonify({"error": "Réservé à l'équipe."}), 403)
    return user, None


def _school_body():
    try:
        return json.loads(request.form.get("data", "{}")) if (request.files or request.form) else (request.get_json(silent=True) or {})
    except ValueError:
        return None


def _when(v):
    d = datetime.fromisoformat(str(v or "").replace("Z", "+00:00"))
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _role_tag_of(r):
    """Étiquette affichée à côté du prénom dans School (2026-11-11) : CEO (admin principal), Manageur, Éducateur."""
    if not r:
        return None
    role = r["role"] if "role" in r.keys() else None
    if r["is_admin"]:
        return "Manageur" if role == "manager" else "CEO"
    return "Éducateur" if role == "educator" else None


def _tags(db):
    cache = {}
    def tag(uid):
        if uid not in cache:
            cache[uid] = _role_tag_of(db.execute("SELECT is_admin, role FROM users WHERE id = ?", (uid,)).fetchone())
        return cache[uid]
    return tag


def _avatars(db):
    cache = {}
    def pic(uid):
        if uid not in cache:
            r = db.execute("SELECT avatar FROM users WHERE id = ?", (uid,)).fetchone()
            cache[uid] = _avatar_key(r["avatar"]) if r else None
        return cache[uid]
    return pic


@app.route("/me/avatar", methods=["POST"])
def me_avatar():
    """Photo de profil : envoi (champ multipart `avatar`, image) ou retrait ({"remove": true})."""
    user = current_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    db = get_db()
    old = db.execute("SELECT avatar FROM users WHERE id = ?", (user["id"],)).fetchone()["avatar"]
    up = None
    if request.files.get("avatar"):
        if (request.content_length or 0) > 6 * 1024 * 1024:
            return jsonify({"error": "Image trop lourde (6 Mo maximum)."}), 400
        up = save_upload("avatar", "avatar")
        if up and not (up.get("mime") or "").startswith("image/"):
            delete_file(up)
            return jsonify({"error": "La photo doit être une image."}), 400
    elif not (request.get_json(silent=True) or {}).get("remove"):
        return jsonify({"error": "Aucune image."}), 400
    with db_lock:
        db.execute("UPDATE users SET avatar = ? WHERE id = ?", (json.dumps(up) if up else None, user["id"]))
        db.commit()
    if old:
        try:
            delete_file(json.loads(old))
        except (ValueError, TypeError):
            pass
    row = db.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
    return jsonify({"user": user_public(row)})


def _names(db):
    cache = {}
    def who(uid):
        if uid not in cache:
            r = db.execute("SELECT first_name, last_name FROM users WHERE id = ?", (uid,)).fetchone()
            cache[uid] = f"{r['first_name']} {(r['last_name'] or '')[:1]}.".strip() if r else "Compte supprimé"
        return cache[uid]
    return who


def _scope_members(db, user, audience, scope):
    """Membres touchés par une mission collective."""
    if audience == "students":
        q = ",".join("?" * len(scope))
        return [r["id"] for r in db.execute(f"SELECT id FROM users WHERE referred_by IN ({q})", scope).fetchall()] if scope else []
    if audience == "educators":
        return []
    if audience == "people":
        q = ",".join("?" * len(scope))
        return [r["id"] for r in db.execute(f"SELECT id FROM users WHERE id IN ({q}) AND is_admin = 0 AND COALESCE(role, 'member') = 'member'", scope).fetchall()] if scope else []
    return [r["id"] for r in db.execute("SELECT id FROM users WHERE is_admin = 0 AND COALESCE(role, 'member') = 'member' AND status = 'approved'").fetchall()]


def _audience_label(db, audience, scope):
    if audience == "students":
        names = [r["first_name"] for r in db.execute(f"SELECT first_name FROM users WHERE id IN ({','.join('?' * len(scope))})", scope).fetchall()] if scope else []
        return "Élèves de " + ", ".join(names) if names else "Élèves"
    if audience == "people":
        names = [r["first_name"] for r in db.execute(f"SELECT first_name FROM users WHERE id IN ({','.join('?' * len(scope))})", scope).fetchall()] if scope else []
        return (", ".join(names[:3]) + (f" +{len(names) - 3}" if len(names) > 3 else "")) if names else "Personnes choisies"
    return {"all": "Tout le monde", "members": "Membres", "educators": "Équipe"}[audience]


def _event_public(db, r, who, start=None, occ=0):
    s = start or _when(r["starts_at"])
    return {"id": f"c{r['id']}:{occ}", "seriesId": r["id"], "type": "collective", "title": r["title"], "body": r["body"] or "",
            "startsAt": s.isoformat(), "minutes": r["minutes"], "mode": r["mode"] or "visio", "link": r["link"] or "",
            "flyer": json.loads(r["flyer"]) if r["flyer"] else None, "audience": r["audience"], "scope": _scope_of(r),
            "audienceLabel": _audience_label(db, r["audience"], _scope_of(r)), "weeks": r["weeks"], "occurrence": occ,
            "author": who(r["author_id"]), "authorId": r["author_id"], "status": "confirmed", "createdAt": r["created_at"], "signed": _col(r, "signed") or "chest"}


CHEST_COLOR = "#fc1283"
STAFF_PALETTE = ("#a855f7", "#f5c451", "#38bdf8", "#33e6a6", "#fc1283", "#f9a45e", "#ff4d5e", "#2dd4bf", "#4d8dff", "#e8e8ee")


def _staff_list(db):
    """L'équipe (admins puis éducateurs) avec sa couleur de planning : choisie par l'admin, sinon une de la palette.
    Un admin a toujours la couleur de CHEST (2026-10-30) : ce qu'il pose dans le planning se reconnaît partout."""
    rows = db.execute("SELECT id, first_name, last_name, is_admin, role, staff_color FROM users WHERE is_admin = 1 OR role = 'educator' ORDER BY is_admin DESC, id").fetchall()
    out = []
    for i, r in enumerate(rows):
        out.append({"id": r["id"], "name": f"{r['first_name']} {r['last_name']}".strip(), "first": r["first_name"],
                    "role": "admin" if r["is_admin"] else "educator",
                    "color": CHEST_COLOR if r["is_admin"] else (r["staff_color"] or STAFF_PALETTE[i % len(STAFF_PALETTE)])})
    return out


@app.route("/school/staff")
def school_staff():
    user, err = _school_writer()
    if err:
        return err
    return jsonify({"staff": _staff_list(get_db())})


@app.route("/school/staff/<int:sid>/color", methods=["POST"])
def school_staff_color(sid):
    user, err = _school_writer()
    if err:
        return err
    if not user["is_admin"] and sid != user["id"]:
        return jsonify({"error": "Seul un administrateur choisit la couleur des autres."}), 403
    color = str((request.get_json(silent=True) or {}).get("color") or "").strip().lower()
    if not re.fullmatch(r"#[0-9a-f]{6}", color):
        return jsonify({"error": "Couleur invalide."}), 400
    db = get_db()
    with db_lock:
        db.execute("UPDATE users SET staff_color = ? WHERE id = ? AND (is_admin = 1 OR role = 'educator')", (color, sid))
        db.commit()
    return jsonify({"staff": _staff_list(db)})


# Scanner de référence (2026-10-28) : choisi par l'admin, montré dans School à tous les membres avec ses derniers trades.
SCANNER_IDS = ("algomni", "swyper-v6", "wolfx", "nexus", "pivot", "harmonics", "blood", "pulse", "wave", "stars", "supernova")


@app.route("/school/scanner", methods=["GET", "POST"])
def school_scanner():
    user = approved_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    if request.method == "POST":
        if not user["is_admin"]:
            return jsonify({"error": "Réservé aux administrateurs."}), 403
        sid = str((request.get_json(silent=True) or {}).get("scanner") or "")
        if sid not in SCANNER_IDS:
            return jsonify({"error": "Scanner inconnu."}), 400
        set_setting("school_scanner", sid)
    sid = get_setting("school_scanner", "pulse")
    try:
        trades = (_scanner_call("/recent?" + urllib.parse.urlencode({"scanner": sid, "limit": 8})) or {}).get("trades", [])
        ok = True
    except Exception:
        trades, ok = [], False
    return jsonify({"scanner": sid, "trades": trades, "available": ok})


@app.route("/school/agenda")
def school_agenda():
    """La semaine (ou toute fenêtre ≤ 62 j) de l'utilisateur : appels collectifs visibles, appels personnels et missions.
    Membre : les siens. Éducateur : ceux de ses élèves (ou d'un seul, ?member=). Admin : tous (ou un seul)."""
    user = approved_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    try:
        start = _when(request.args.get("from")) if request.args.get("from") else datetime.now(timezone.utc) - timedelta(days=1)
        end = _when(request.args.get("to")) if request.args.get("to") else start + timedelta(days=7)
    except ValueError:
        return jsonify({"error": "Dates invalides."}), 400
    end = min(end, start + timedelta(days=62))
    db = get_db()
    who = _names(db)
    role = _school_role(user)
    events = []
    for r in db.execute("SELECT * FROM school_events").fetchall():
        if not _school_visible(r, user):
            continue
        first = _when(r["starts_at"])
        for w in range(max(1, r["weeks"])):
            s = first + timedelta(weeks=w)
            if start - timedelta(minutes=r["minutes"]) <= s < end:
                events.append(_event_public(db, r, who, s, w))
    # appels personnels et missions des membres visés
    only = request.args.get("member")
    if role == "member":
        mids = [user["id"]]
    elif only and only.isdigit():
        ctx, err = _mentor_ctx(only)
        if err:
            return err
        mids = [int(only)]
    elif role == "educator":
        # Éducateur (2026-10-30) : le planning de SES élèves seulement, pas celui des autres éducateurs.
        mids = [r["id"] for r in db.execute("SELECT id FROM users WHERE referred_by = ? AND is_admin = 0 AND COALESCE(role, 'member') = 'member'", (user["id"],)).fetchall()]
    else:
        # Admin : le planning de tout le monde, chaque éducateur dans sa couleur.
        mids = [r["id"] for r in db.execute("SELECT id FROM users WHERE is_admin = 0 AND COALESCE(role, 'member') = 'member'").fetchall()]
    staff = _staff_list(db)
    color_of = {s["id"]: s["color"] for s in staff}
    tasks = []
    if mids:
        q = ",".join("?" * len(mids))
        rows_p = db.execute(f"SELECT id, first_name, last_name, referred_by FROM users WHERE id IN ({q})", mids).fetchall()
        people = {r["id"]: f"{r['first_name']} {r['last_name']}".strip() for r in rows_p}
        coach = {r["id"]: r["referred_by"] for r in rows_p}
        # missions : l'éducateur ne voit que celles de ses élèves (le planning des appels, lui, est commun)
        task_mids = [m for m in mids if role != "educator" or coach.get(m) == user["id"]]
        lo, hi = (start - timedelta(hours=4)).isoformat(), end.isoformat()
        for r in db.execute(f"SELECT * FROM mentor_events WHERE member_id IN ({q}) AND starts_at >= ? AND starts_at < ? AND status NOT IN ('cancelled', 'declined')", (*mids, lo, hi)).fetchall():
            # couleur : celle de l'éducateur qui a posé l'appel, sinon (proposé par l'élève) celle de son éducateur
            owner = r["author_id"] if r["author_id"] in color_of else coach.get(r["member_id"])
            events.append({"id": f"p{r['id']}", "eventId": r["id"], "type": "personal", "ownerId": owner, "color": color_of.get(owner), "title": r["topic"] or "Appel", "body": _col(r, "body", ""),
                           "startsAt": r["starts_at"], "minutes": r["minutes"], "mode": r["mode"] or "visio", "link": r["link"] or "",
                           "flyer": json.loads(r["flyer"]) if _col(r, "flyer") else None, "status": r["status"], "common": bool(_col(r, "common_id")),
                           "memberId": r["member_id"], "member": people.get(r["member_id"]), "author": who(r["author_id"]), "authorId": r["author_id"], "createdAt": r["created_at"], "signed": _col(r, "signed") or "chest"})
        # missions : celles qui tombent dans la fenêtre, plus (membre) celles qui restent à faire sans date ou en retard
        tq = ",".join("?" * len(task_mids))
        sql = f"SELECT * FROM mentor_tasks WHERE member_id IN ({tq}) AND ((due_at >= ? AND due_at < ?)" + (" OR done_at IS NULL)" if role == "member" else ")")
        for r in (db.execute(sql + " ORDER BY due_at IS NULL, due_at", (*task_mids, start.isoformat(), hi)).fetchall() if task_mids else []):
            tasks.append({"id": r["id"], "title": r["title"], "dueAt": r["due_at"], "doneAt": r["done_at"], "memberId": r["member_id"],
                          "member": people.get(r["member_id"]), "author": who(r["author_id"]), "authorId": r["author_id"], "common": bool(_col(r, "common_id")), "createdAt": r["created_at"]})
    # Couleurs (2026-10-30) : seul l'admin voit le code couleur des éducateurs. Un élève ne voit que son éducateur et un
    # éducateur que ses élèves : pas de couleur à décoder, chaque rendez-vous garde la couleur de son type. Ce que pose un
    # admin prend la couleur de CHEST partout (chest: true) ; ses appels collectifs sont signés « Un éducateur ».
    admins = {s["id"] for s in staff if s["role"] == "admin"}
    for e in events:
        if e["type"] == "collective":
            e["ownerId"] = e["authorId"]
        e["chest"] = e.get("ownerId") in admins and e.get("signed") != "me"
        e["color"] = CHEST_COLOR if e["chest"] else (color_of.get(e.get("ownerId")) if role == "admin" else None)
        if e["chest"] and role != "admin":
            e["author"] = "CHEST"
    events.sort(key=lambda e: e["startsAt"])
    return jsonify({"from": start.isoformat(), "to": end.isoformat(), "role": role, "events": events, "tasks": tasks,
                    "staff": staff if role == "admin" else []})


@app.route("/school/events", methods=["POST"])
def school_event_save():
    user, err = _school_writer()
    if err:
        return err
    b = _school_body()
    if b is None:
        return jsonify({"error": "Données invalides."}), 400
    title = re.sub(r"\s+", " ", str(b.get("title") or "")).strip()[:140]
    if not title:
        return jsonify({"error": "Donne un titre à l'appel."}), 400
    try:
        start = _when(b.get("startsAt"))
        minutes = max(10, min(300, int(b.get("minutes") or 60)))
        weeks = max(1, min(26, int(b.get("weeks") or 1)))
    except (TypeError, ValueError):
        return jsonify({"error": "Date, heure ou durée invalide."}), 400
    aud, scope = _school_target(user, b)
    if not aud:
        return jsonify({"error": "Choisis au moins une personne."}), 400
    mode = b.get("mode") if b.get("mode") in ("visio", "telephone", "presentiel") else "visio"
    link = str(b.get("link") or "").strip()[:300]
    if link and not re.fullmatch(r"https://\S+", link):
        return jsonify({"error": "Le lien doit commencer par https://"}), 400
    body = str(b.get("body") or "").strip()[:4000]
    up = save_upload("flyer", "ev")
    if up and not (up.get("mime") or "").startswith("image/"):
        delete_file(up)
        return jsonify({"error": "Le flyer doit être une image."}), 400
    db = get_db()
    now = datetime.now(timezone.utc).isoformat()
    with db_lock:
        if b.get("id"):
            r = db.execute("SELECT * FROM school_events WHERE id = ?", (b["id"],)).fetchone()
            if not r or not (user["is_admin"] or r["author_id"] == user["id"]):
                return jsonify({"error": "Appel introuvable."}), 404
            flyer = r["flyer"]
            if up or b.get("removeFlyer"):
                delete_file(json.loads(flyer) if flyer else None)
                flyer = json.dumps(up) if up else None
            db.execute("UPDATE school_events SET title = ?, body = ?, starts_at = ?, minutes = ?, mode = ?, link = ?, flyer = ?, audience = ?, scope = ?, weeks = ?, signed = ?, updated_at = ? WHERE id = ?",
                       (title, body, start.isoformat(), minutes, mode, link, flyer, aud, json.dumps(scope), weeks, _signed(user, b), now, r["id"]))
            eid = r["id"]
        else:
            eid = db.execute("INSERT INTO school_events (title, body, starts_at, minutes, mode, link, flyer, audience, scope, weeks, author_id, created_at, updated_at, signed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                             (title, body, start.isoformat(), minutes, mode, link, json.dumps(up) if up else None, aud, json.dumps(scope), weeks, user["id"], now, now, _signed(user, b))).lastrowid
        db.commit()
    if not b.get("id"):
        _school_notify(db, _audience_users(db, aud, scope), "event", f"{_sig(db, user, _signed(user, b))} a ajouté un appel", f"{title} · {_fr_when(start.isoformat())}", "/school", user["id"])
    return jsonify({"event": _event_public(db, db.execute("SELECT * FROM school_events WHERE id = ?", (eid,)).fetchone(), _names(db))})


@app.route("/school/events/<int:eid>/delete", methods=["POST"])
def school_event_delete(eid):
    user, err = _school_writer()
    if err:
        return err
    db = get_db()
    r = db.execute("SELECT * FROM school_events WHERE id = ?", (eid,)).fetchone()
    if not r or not (user["is_admin"] or r["author_id"] == user["id"]):
        return jsonify({"error": "Appel introuvable."}), 404
    with db_lock:
        delete_file(json.loads(r["flyer"]) if r["flyer"] else None)
        db.execute("DELETE FROM school_events WHERE id = ?", (eid,))
        db.commit()
    return jsonify({"ok": True})


def _post_public(db, r, who, pic=None):
    return {"id": r["id"], "title": r["title"], "body": r["body"] or "", "image": json.loads(r["image"]) if r["image"] else None,
            "audience": r["audience"], "scope": _scope_of(r), "audienceLabel": _audience_label(db, r["audience"], _scope_of(r)),
            "pinned": bool(r["pinned"]), "format": r["format"] if "format" in r.keys() and r["format"] else "landscape",
            "idea": json.loads(r["idea"]) if "idea" in r.keys() and r["idea"] else None,
            "status": (r["status"] if "status" in r.keys() and r["status"] in IDEA_STATUS else "zone"),
            "author": "CHEST" if _col(r, "signed") == "chest" else who(r["author_id"]), "authorId": r["author_id"], "chest": _col(r, "signed") == "chest",
            "authorAvatar": None if _col(r, "signed") == "chest" else (pic(r["author_id"]) if pic else None), "signed": _col(r, "signed") or "me",
            "authorTag": None if _col(r, "signed") == "chest" else _role_tag_of(db.execute("SELECT is_admin, role FROM users WHERE id = ?", (r["author_id"],)).fetchone()),
            "createdAt": r["created_at"], "updatedAt": r["updated_at"]}


# IDEA (2026-11-08) : une info de School = une idée de trade de l'équipe. Position facultative {pair, side, pe, sl, tps[]},
# statut zone (zone d'action) | encours (position en cours) | inactive (rangée dans « Inactives »). Seuls éducateurs et
# admins publient (_school_writer) ; l'auteur ou un admin change le statut.
IDEA_STATUS = ("zone", "encours", "inactive")


def _idea_from(b):
    """Position d'une IDEA lue dans le formulaire : None si aucun niveau, sinon dict validé (ou ValueError)."""
    raw = b.get("idea") if isinstance(b.get("idea"), dict) else None
    if not raw:
        return None
    def num(v):
        v = str(v if v is not None else "").replace(",", ".").replace(" ", "").strip()
        if not v:
            return None
        x = float(v)
        if not (x == x) or abs(x) > 1e9:
            raise ValueError
        return x
    try:
        pe, sl = num(raw.get("pe")), num(raw.get("sl"))
        tps = [t for t in (num(x) for x in (raw.get("tps") or [])[:8]) if t is not None]
    except (TypeError, ValueError):
        raise ValueError("Les niveaux de la position doivent être des nombres.")
    pair = re.sub(r"[^A-Z0-9/.]", "", str(raw.get("pair") or "").upper())[:16]
    if pe is None and sl is None and not tps and not pair:
        return None
    if not pair or pe is None or sl is None or not tps:
        raise ValueError("Pour une position : la paire, le PE, le SL et au moins le TP 1.")
    side = "sell" if raw.get("side") == "sell" else "buy"
    if (side == "buy" and not sl < pe) or (side == "sell" and not sl > pe):
        raise ValueError("Le SL doit être sous le PE à l'achat, au-dessus à la vente.")
    return {"pair": pair, "side": side, "pe": pe, "sl": sl, "tps": tps}


@app.route("/school/posts/unread")
def school_posts_unread():
    """Nombre d'IDEA visibles publiées après ?since= (pastille « +N » de la barre latérale)."""
    user = approved_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    since = str(request.args.get("since") or "")[:40]
    db = get_db()
    rows = db.execute("SELECT * FROM school_posts WHERE created_at > ? AND author_id != ?", (since, user["id"])).fetchall()
    return jsonify({"n": sum(1 for r in rows if _school_visible(r, user) and (r["status"] if "status" in r.keys() else None) != "inactive")})


@app.route("/school/posts/<int:pid>/status", methods=["POST"])
def school_post_status(pid):
    user, err = _school_writer()
    if err:
        return err
    b = request.get_json(silent=True) or {}
    st = str(b.get("status") or "")
    if st not in IDEA_STATUS:
        return jsonify({"error": "Statut inconnu."}), 400
    db = get_db()
    r = db.execute("SELECT * FROM school_posts WHERE id = ?", (pid,)).fetchone()
    if not r or not (user["is_admin"] or r["author_id"] == user["id"]):
        return jsonify({"error": "IDEA introuvable."}), 404
    now = datetime.now(timezone.utc).isoformat()
    idea = json.loads(r["idea"]) if r["idea"] else None
    if idea is not None:
        res = b.get("result") if isinstance(b.get("result"), dict) else None
        if st == "inactive" and res:
            kind = res.get("kind") if res.get("kind") in ("tp", "sl", "be", "close") else "close"
            out = {"kind": kind, "at": now}
            if kind == "tp":
                out["tp"] = max(1, min(len(idea.get("tps") or [1]), int(res.get("tp") or 1)))
            try:
                if res.get("pips") not in (None, ""):
                    out["pips"] = round(float(str(res["pips"]).replace(",", ".")), 1)
            except ValueError:
                pass
            idea["result"] = out
        elif st != "inactive":
            idea.pop("result", None)
    with db_lock:
        db.execute("UPDATE school_posts SET status = ?, idea = ?, updated_at = ? WHERE id = ?", (st, json.dumps(idea) if idea is not None else r["idea"], now, pid))
        db.commit()
    return school_posts()


@app.route("/school/posts")
def school_posts():
    user = approved_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    db = get_db()
    who = _names(db)
    rows = db.execute("SELECT * FROM school_posts ORDER BY created_at DESC").fetchall()
    pic = _avatars(db)
    posts = [_post_public(db, r, who, pic) for r in rows if _school_visible(r, user)][:60]
    # fil de chaque IDEA (mises à jour, de la plus ancienne à la plus récente)
    ids = [p["id"] for p in posts]
    ups = {}
    tag = _tags(db)
    if ids:
        q = "SELECT * FROM school_post_updates WHERE post_id IN (%s) ORDER BY created_at" % ",".join("?" * len(ids))
        for u in db.execute(q, ids).fetchall():
            chest = u["signed"] == "chest"
            ups.setdefault(u["post_id"], []).append({"id": u["id"], "body": u["body"], "createdAt": u["created_at"], "authorId": u["author_id"],
                                                     "author": "CHEST" if chest else who(u["author_id"]), "chest": chest,
                                                     "authorAvatar": None if chest else (pic(u["author_id"]) if pic else None),
                                                     "authorTag": None if chest else tag(u["author_id"])})
    for p in posts:
        p["updates"] = ups.get(p["id"], [])
    return jsonify({"posts": posts})


@app.route("/school/posts/<int:pid>/updates", methods=["POST"])
def school_post_update_add(pid):
    """Mise à jour d'une IDEA (SL au BE, TP1 touché, sortie…) : l'auteur de l'IDEA ou un admin ; prévient son public."""
    user, err = _school_writer()
    if err:
        return err
    b = request.get_json(silent=True) or {}
    body = str(b.get("body") or "").strip()[:2000]
    if not body:
        return jsonify({"error": "Écris la mise à jour."}), 400
    db = get_db()
    r = db.execute("SELECT * FROM school_posts WHERE id = ?", (pid,)).fetchone()
    if not r or not (user["is_admin"] or r["author_id"] == user["id"]):
        return jsonify({"error": "IDEA introuvable."}), 404
    signed = _signed(user, b)
    with db_lock:
        db.execute("INSERT INTO school_post_updates (post_id, author_id, body, signed, created_at) VALUES (?, ?, ?, ?, ?)",
                   (pid, user["id"], body, signed, datetime.now(timezone.utc).isoformat()))
        db.execute("UPDATE school_posts SET updated_at = ? WHERE id = ?", (datetime.now(timezone.utc).isoformat(), pid))
        db.commit()
    try:
        who = "CHEST" if signed == "chest" else _sig(db, user, signed)
        tg = None if signed == "chest" else _role_tag_of(user)
        _school_notify(db, _audience_users(db, r["audience"], _scope_of(r)), "idea_update", f"{who}{' · ' + tg if tg else ''} — {r['title']}", body[:180], f"/school?post={pid}", user["id"])
    except Exception as e:
        print(f"[idea] notification impossible : {e}", flush=True)
    return school_posts()


@app.route("/school/posts/<int:pid>/updates/<int:uid>", methods=["DELETE", "POST"])
def school_post_update_del(pid, uid):
    user, err = _school_writer()
    if err:
        return err
    db = get_db()
    u = db.execute("SELECT * FROM school_post_updates WHERE id = ? AND post_id = ?", (uid, pid)).fetchone()
    if not u or not (user["is_admin"] or u["author_id"] == user["id"]):
        return jsonify({"error": "Message introuvable."}), 404
    with db_lock:
        db.execute("DELETE FROM school_post_updates WHERE id = ?", (uid,))
        db.commit()
    return school_posts()


@app.route("/school/posts", methods=["POST"])
def school_post_save():
    user, err = _school_writer()
    if err:
        return err
    b = _school_body()
    if b is None:
        return jsonify({"error": "Données invalides."}), 400
    title = re.sub(r"\s+", " ", str(b.get("title") or "")).strip()[:140]
    body = str(b.get("body") or "").strip()[:8000]
    try:
        idea = _idea_from(b)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    if not title and idea:
        title = f"{idea['pair']} · {'Vente' if idea['side'] == 'sell' else 'Achat'}"
    if not title:
        return jsonify({"error": "Donne un titre à l'IDEA."}), 400
    aud, scope = _school_target(user, b, allow_all=True)
    if not aud:
        return jsonify({"error": "Choisis au moins une personne."}), 400
    up = save_upload("image", "post")
    if up and not (up.get("mime") or "").startswith("image/"):
        delete_file(up)
        return jsonify({"error": "L'illustration doit être une image."}), 400
    pinned = 1 if b.get("pinned") and user["is_admin"] else 0
    fmt = "portrait" if b.get("format") == "portrait" else "landscape"
    idea_js = json.dumps(idea) if idea else None
    db = get_db()
    now = datetime.now(timezone.utc).isoformat()
    with db_lock:
        if b.get("id"):
            r = db.execute("SELECT * FROM school_posts WHERE id = ?", (b["id"],)).fetchone()
            if not r or not (user["is_admin"] or r["author_id"] == user["id"]):
                return jsonify({"error": "Info introuvable."}), 404
            image = r["image"]
            old = json.loads(r["idea"]) if r["idea"] else None
            if idea and old and old.get("result"):
                idea_js = json.dumps(dict(idea, result=old["result"]))
            if up or b.get("removeImage"):
                delete_file(json.loads(image) if image else None)
                image = json.dumps(up) if up else None
            db.execute("UPDATE school_posts SET title = ?, body = ?, image = ?, audience = ?, scope = ?, pinned = ?, format = ?, idea = ?, signed = ?, updated_at = ? WHERE id = ?",
                       (title, body, image, aud, json.dumps(scope), pinned, fmt, idea_js, _signed(user, b), now, r["id"]))
        else:
            pid = db.execute("INSERT INTO school_posts (title, body, image, audience, scope, pinned, format, idea, status, author_id, created_at, updated_at, signed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                             (title, body, json.dumps(up) if up else None, aud, json.dumps(scope), pinned, fmt, idea_js, "zone", user["id"], now, now, _signed(user, b))).lastrowid
        db.commit()
    if not b.get("id"):
        _school_notify(db, _audience_users(db, aud, scope), "idea", f"Nouvelle Idea de {_sig(db, user, _signed(user, b))}", title, f"/school?post={pid}", user["id"])
    return school_posts()


@app.route("/school/posts/<int:pid>/delete", methods=["POST"])
def school_post_delete(pid):
    user, err = _school_writer()
    if err:
        return err
    db = get_db()
    r = db.execute("SELECT * FROM school_posts WHERE id = ?", (pid,)).fetchone()
    if not r or not (user["is_admin"] or r["author_id"] == user["id"]):
        return jsonify({"error": "Info introuvable."}), 404
    with db_lock:
        delete_file(json.loads(r["image"]) if r["image"] else None)
        db.execute("DELETE FROM school_posts WHERE id = ?", (pid,))
        db.execute("DELETE FROM school_post_updates WHERE post_id = ?", (pid,))
        db.commit()
    return school_posts()


@app.route("/school/missions", methods=["POST"])
def school_mission_add():
    """Mission collective : copiée chez chaque membre visé (chacun coche la sienne), retirable d'un coup
    (POST /mentor/common/<id>/delete, aussi ouvert à l'éducateur qui l'a posée)."""
    user, err = _school_writer()
    if err:
        return err
    b = request.get_json(silent=True) or {}
    title = re.sub(r"\s+", " ", str(b.get("title") or "")).strip()[:200]
    if not title:
        return jsonify({"error": "Décris la mission."}), 400
    try:
        due = _when(b.get("dueAt")) if b.get("dueAt") else None
    except ValueError:
        return jsonify({"error": "Date de fin invalide."}), 400
    aud, scope = _school_target(user, b)
    if not aud or aud == "educators":
        return jsonify({"error": "Une mission vise des membres : choisis Membres, Tout le monde ou des élèves."}), 400
    db = get_db()
    members = _scope_members(db, user, aud, scope)
    if not members:
        return jsonify({"error": "Aucun membre dans cette sélection."}), 400
    now = datetime.now(timezone.utc).isoformat()
    with db_lock:
        sg = _signed(user, b)
        cid = db.execute("INSERT INTO mentor_common (kind, title, due_at, weeks, scope, audience, author_id, created_at, signed) VALUES ('task', ?, ?, 1, ?, ?, ?, ?, ?)",
                         (title, due.isoformat() if due else None, json.dumps(scope), aud, user["id"], now, sg)).lastrowid
        for mid in members:
            db.execute("INSERT INTO mentor_tasks (member_id, author_id, title, due_at, created_at, common_id, signed) VALUES (?, ?, ?, ?, ?, ?, ?)",
                       (mid, user["id"], title, due.isoformat() if due else None, now, cid, sg))
        db.commit()
    _school_notify(db, members, "task", f"{_sig(db, user, _signed(user, b))} t'a donné une mission", title + (f" · pour {_fr_when(due.isoformat()).split(' à ')[0]}" if due else ""), "/school", user["id"])
    return jsonify({"ok": True, "members": len(members), "commonId": cid})


@app.route("/school/missions")
def school_missions():
    """Missions collectives posées (admin : toutes ; éducateur : les siennes), avec leur avancement."""
    user, err = _school_writer()
    if err:
        return err
    db = get_db()
    who = _names(db)
    rows = db.execute("SELECT * FROM mentor_common WHERE kind = 'task'" + ("" if user["is_admin"] else " AND author_id = ?") + " ORDER BY created_at DESC",
                      () if user["is_admin"] else (user["id"],)).fetchall()
    out = []
    for r in rows:
        aud = _col(r, "audience") or "students"
        scope = _scope_of(r)
        if not scope and aud == "students":
            aud = "members"  # ancien planning commun : « tous les élèves »
        n = db.execute("SELECT COUNT(*) AS n, SUM(done_at IS NOT NULL) AS d FROM mentor_tasks WHERE common_id = ?", (r["id"],)).fetchone()
        out.append({"id": r["id"], "title": r["title"], "dueAt": r["due_at"], "audienceLabel": _audience_label(db, aud, scope),
                    "members": n["n"] or 0, "done": n["d"] or 0, "author": who(r["author_id"]), "createdAt": r["created_at"]})
    return jsonify({"missions": out})


# ---------------------------------------------------------------- Notifications School (2026-11-08)
# Chaque ajout (appel, mission, Idea, contenu partagé) prévient les personnes visées : une ligne dans school_notifs (la
# cloche de CHEST la relit, GET /school/notifs) et une notification push (réglage « school_new »). Un appel prévient
# aussi 15 min avant (school_reminder_loop, réglage « school_remind »), une seule fois par occurrence (school_reminders).
WEEKDAYS_FR = ("lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche")


def _fr_when(iso):
    from zoneinfo import ZoneInfo
    d = _when(iso).astimezone(ZoneInfo("Europe/Paris"))
    return f"{WEEKDAYS_FR[d.weekday()]} {d.day} {MONTHS_FR[d.month - 1].lower()} à {d.strftime('%H:%M')}"


def _signed(user, b):
    """Signature choisie par un admin : « chest » ou « me » ; l'équipe signe toujours de son prénom."""
    return ("me" if (b or {}).get("as") == "me" else "chest") if user["is_admin"] else "me"


def _sig(db, user, signed):
    return "CHEST" if signed == "chest" else _first(db, user["id"])


def _first(db, uid):
    r = db.execute("SELECT first_name FROM users WHERE id = ?", (uid,)).fetchone()
    return r["first_name"] if r else "L'équipe"


def _audience_users(db, audience, scope):
    """Tous les comptes visés par un public School (pour prévenir)."""
    base = "SELECT id FROM users WHERE status = 'approved'"
    if audience == "all":
        rows = db.execute(base).fetchall()
    elif audience == "members":
        rows = db.execute(base + " AND is_admin = 0 AND COALESCE(role, 'member') = 'member'").fetchall()
    elif audience == "educators":
        rows = db.execute(base + " AND (is_admin = 1 OR role = 'educator')").fetchall()
    elif audience in ("students", "people") and scope:
        q = ",".join("?" * len(scope))
        rows = db.execute(base + (f" AND referred_by IN ({q})" if audience == "students" else f" AND id IN ({q})"), scope).fetchall()
    else:
        rows = []
    return [r["id"] for r in rows]


def _push_school(items):
    """Envoi push en tâche de fond (sans ralentir la réponse) : [(user_id, kind, title, body, url)]."""
    def run():
        with app.app_context():
            db = get_db()
            for uid, kind, title, body, url in items:
                try:
                    pref = "school_remind" if kind == "remind" else "school_updates" if kind == "idea_update" else "school_new"
                    if _user_prefs(db, uid).get(pref, True):
                        send_push_to_user(uid, title, body, url)
                except Exception as e:
                    print(f"[school] push impossible pour {uid} : {e}", flush=True)
    if items and VAPID_PRIVATE_KEY:
        threading.Thread(target=run, daemon=True).start()


def _school_notify(db, uids, kind, title, body, url="/school", actor=None):
    """Prévient chaque compte de uids (sauf l'auteur) : ligne pour la cloche + push. À appeler hors db_lock."""
    uids = sorted({int(u) for u in uids if u and u != actor})
    if not uids:
        return 0
    now = datetime.now(timezone.utc).isoformat()
    with db_lock:
        db.executemany("INSERT INTO school_notifs (user_id, kind, title, body, url, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                       [(u, kind, title, body, url, actor, now) for u in uids])
        db.commit()
    _push_school([(u, kind, title, body, url) for u in uids])
    return len(uids)


@app.route("/school/notifs")
def school_notifs():
    """Les 40 dernières notifications School du compte (?since= pour ne lire que les nouvelles)."""
    user = approved_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    since = str(request.args.get("since") or "")[:40]
    rows = get_db().execute("SELECT * FROM school_notifs WHERE user_id = ? AND created_at > ? ORDER BY id DESC LIMIT 40", (user["id"], since)).fetchall()
    return jsonify({"notifs": [{"id": r["id"], "kind": r["kind"], "title": r["title"], "body": r["body"] or "", "url": r["url"] or "/school",
                                "createdAt": r["created_at"]} for r in rows]})


def school_reminders_due(db, now=None):
    """Appels qui commencent dans les 15 prochaines minutes et pas encore rappelés : [(clé, destinataires, titre, corps)]."""
    now = now or datetime.now(timezone.utc)
    hi = now + timedelta(minutes=15)
    out = []
    for r in db.execute("SELECT * FROM school_events").fetchall():
        first = _when(r["starts_at"])
        for w in range(max(1, r["weeks"])):
            s = first + timedelta(weeks=w)
            if now - timedelta(minutes=1) <= s <= hi:
                users = set(_audience_users(db, r["audience"], _scope_of(r))) | {r["author_id"]}
                if r["audience"] == "people":
                    edus = db.execute(f"SELECT DISTINCT referred_by FROM users WHERE id IN ({','.join('?' * len(_scope_of(r)))}) AND referred_by IS NOT NULL", _scope_of(r)).fetchall() if _scope_of(r) else []
                    users |= {e[0] for e in edus}
                out.append((f"c{r['id']}:{w}", users, r["title"], s))
    for r in db.execute("SELECT e.*, u.referred_by FROM mentor_events e JOIN users u ON u.id = e.member_id WHERE e.status = 'confirmed' AND e.starts_at >= ? AND e.starts_at <= ?",
                        ((now - timedelta(minutes=1)).isoformat(), hi.isoformat())).fetchall():
        out.append((f"p{r['id']}", {r["member_id"], r["author_id"], r["referred_by"]}, r["topic"] or "Appel", _when(r["starts_at"])))
    done = {x["key"] for x in db.execute("SELECT key FROM school_reminders").fetchall()}
    return [(k, u, t, s) for k, u, t, s in out if k not in done]


def school_reminder_loop():
    while True:
        try:
            with app.app_context():
                db = get_db()
                now = datetime.now(timezone.utc)
                for key, users, title, start in school_reminders_due(db, now):
                    mins = max(1, round((start - now).total_seconds() / 60))
                    with db_lock:
                        db.execute("INSERT OR IGNORE INTO school_reminders (key, sent_at) VALUES (?, ?)", (key, now.isoformat()))
                        db.commit()
                    _school_notify(db, users, "remind", f"Dans {mins} min : {title}", f"Il commence à {_fr_when(start.isoformat()).split(' à ')[-1]}. Ouvre School pour le rejoindre.", "/school")
        except Exception:
            import traceback
            traceback.print_exc()
        time.sleep(60)


@app.route("/school/share", methods=["POST"])
def school_share():
    """Un éducateur (ou un admin) envoie un élément des cours à des membres : il arrive dans la bibliothèque de leur suivi."""
    user, err = _school_writer()
    if err:
        return err
    b = request.get_json(silent=True) or {}
    title = re.sub(r"\s+", " ", str(b.get("title") or "")).strip()[:140]
    kind = b.get("kind") if b.get("kind") in ("video", "link", "text") else "link"
    url = str(b.get("url") or "").strip()[:500]
    body = str(b.get("body") or "").strip()[:2000]
    if not title or (kind != "text" and not re.fullmatch(r"(https://|/)\S+", url)):
        return jsonify({"error": "Élément invalide."}), 400
    picked = {int(x) for x in (b.get("members") or []) if str(x).isdigit()}
    db = get_db()
    if user["is_admin"]:
        ok = {r["id"] for r in db.execute(f"SELECT id FROM users WHERE id IN ({','.join('?' * len(picked))})", sorted(picked)).fetchall()} if picked else set()
    else:
        ok = picked & _students_of(user["id"])
    if not ok:
        return jsonify({"error": "Choisis au moins un membre."}), 400
    now = datetime.now(timezone.utc).isoformat()
    with db_lock:
        db.executemany("INSERT INTO mentor_library (member_id, author_id, kind, title, body, url, file, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)",
                       [(m, user["id"], kind, title, body, url, now) for m in ok])
        db.commit()
    _school_notify(db, ok, "share", f"{_first(db, user['id'])} t'a envoyé un contenu", title, "/suivi", user["id"])
    return jsonify({"ok": True, "members": len(ok)})


# ---------------------------------------------------------------- BERICH v3 : algorithmes et plan (2026-10-28)
# Les backtests de chaque algorithme (BERICH I, II…) sont importés par l'admin depuis l'export HTML d'un backtest CHEST
# (le navigateur en extrait le JSON) et servis aux seuls membres qui ont BERICH : le dépôt est public, eux non.
# Trade compact : [ouverture ms, clôture ms, sens 1/-1/0, R].
def _berich_member():
    user = approved_user()
    if not user:
        return None, (jsonify({"error": "Non connecté."}), 401)
    if not (access_of(user)["berich"] or user["is_admin"] or is_educator(user)):
        return None, (jsonify({"error": "BERICH fait partie de CHEST Premium."}), 403)
    return user, None


def _ms(v):
    try:
        d = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
        return int((d if d.tzinfo else d.replace(tzinfo=timezone.utc)).timestamp() * 1000)
    except (TypeError, ValueError):
        return None


@app.route("/berich/algos")
def berich_algos():
    user, err = _berich_member()
    if err:
        return err
    rows = get_db().execute("SELECT * FROM berich_algos ORDER BY key").fetchall()
    return jsonify({"algos": [{"key": r["key"], "name": r["name"], "updatedAt": r["updated_at"], **json.loads(r["data"])} for r in rows]})


@app.route("/berich/algos/<key>", methods=["POST"])
def berich_algo_save(key):
    user, err = _admin_only()
    if err:
        return err
    if not re.fullmatch(r"[a-z0-9]{2,20}", key or ""):
        return jsonify({"error": "Identifiant d'algorithme invalide."}), 400
    b = request.get_json(silent=True) or {}
    rec = b.get("rec") if isinstance(b.get("rec"), dict) else {}
    name = re.sub(r"\s+", " ", str(b.get("name") or rec.get("title") or "")).strip()[:40]
    trades = []
    for t in (rec.get("trades") if isinstance(rec.get("trades"), list) else [])[:6000]:
        if not isinstance(t, dict):
            continue
        res = str(t.get("result") or "").upper()
        try:
            r = 0.0 if res == "BE" else float(t.get("rr"))
        except (TypeError, ValueError):
            continue
        o = _ms(t.get("open") or t.get("date"))
        if o is None or abs(r) > 50:
            continue
        side = str(t.get("order") or "").lower()
        trades.append([o, _ms(t.get("close")) or o, 1 if side == "buy" else -1 if side == "sell" else 0, round(r, 3)])
    if len(trades) < 20:
        return jsonify({"error": "Ce fichier ne contient pas assez de trades (20 minimum) : exporte le backtest depuis CHEST."}), 400
    trades.sort(key=lambda x: x[1])
    wins = sorted(x[3] for x in trades if x[3] > 0)
    data = {"source": str(rec.get("title") or "")[:60], "target": wins[len(wins) // 2] if wins else None,
            "mm": {k: rec.get(k) for k in ("cp", "pf") if isinstance(rec.get(k), dict)}, "trades": trades}
    db = get_db()
    with db_lock:
        db.execute("INSERT INTO berich_algos (key, name, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET name = excluded.name, data = excluded.data, updated_at = excluded.updated_at",
                   (key, name or key.upper(), json.dumps(data, separators=(",", ":")), datetime.now(timezone.utc).isoformat()))
        db.commit()
    return berich_algos()


@app.route("/berich/algos/<key>/delete", methods=["POST"])
def berich_algo_delete(key):
    user, err = _admin_only()
    if err:
        return err
    db = get_db()
    with db_lock:
        db.execute("DELETE FROM berich_algos WHERE key = ?", (key,))
        db.commit()
    return berich_algos()


def _plan_algos(data):
    legs = data.get("legs") if isinstance(data.get("legs"), list) else [{"algo": data.get("algo")}]
    return sorted({str(l.get("algo")) for l in legs if isinstance(l, dict) and l.get("algo")})


def _plan_public(r):
    if not r:
        return None
    d = json.loads(r["data"])
    attached = r["attached_at"] if r["attached_at"] and json.loads(r["attached_algos"] or "[]") == _plan_algos(d) else None
    return {**d, "savedAt": r["updated_at"], "attachedAt": attached}


@app.route("/berich/plan", methods=["GET", "PUT"])
def berich_plan():
    user, err = _berich_member()
    if err:
        return err
    db = get_db()
    if request.method == "PUT":
        body = request.get_json(silent=True)
        raw = json.dumps(body, separators=(",", ":")) if isinstance(body, dict) else ""
        if not raw or len(raw) > 12000:
            return jsonify({"error": "Plan invalide."}), 400
        with db_lock:
            # Un plan qui change d'algorithmes redevient « à rattacher » (attached_algos ne correspond plus).
            db.execute("INSERT INTO berich_plans (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
                       (user["id"], raw, datetime.now(timezone.utc).isoformat()))
            db.commit()
    return jsonify({"plan": _plan_public(db.execute("SELECT * FROM berich_plans WHERE user_id = ?", (user["id"],)).fetchone())})


@app.route("/berich/plans")
def berich_plans_admin():
    """Admin : tous les plans, les plus récents d'abord, avec leur état de rattachement."""
    user, err = _admin_only()
    if err:
        return err
    db = get_db()
    out = []
    for r in db.execute("SELECT berich_plans.*, users.first_name, users.last_name, users.email FROM berich_plans JOIN users ON users.id = berich_plans.user_id ORDER BY berich_plans.updated_at DESC").fetchall():
        out.append({"userId": r["user_id"], "name": f"{r['first_name']} {r['last_name']}".strip(), "email": r["email"], "plan": _plan_public(r)})
    return jsonify({"plans": out})


@app.route("/berich/plans/<int:uid>/attach", methods=["POST"])
def berich_plan_attach(uid):
    user, err = _admin_only()
    if err:
        return err
    db = get_db()
    r = db.execute("SELECT * FROM berich_plans WHERE user_id = ?", (uid,)).fetchone()
    if not r:
        return jsonify({"error": "Ce membre n'a pas de plan."}), 404
    on = (request.get_json(silent=True) or {}).get("attached", True)
    with db_lock:
        db.execute("UPDATE berich_plans SET attached_at = ?, attached_algos = ? WHERE user_id = ?",
                   (datetime.now(timezone.utc).isoformat() if on else None, json.dumps(_plan_algos(json.loads(r["data"]))) if on else None, uid))
        db.commit()
    return berich_plans_admin()


@app.route("/mentor/notes", methods=["POST"])
def mentor_note_save():
    b = request.get_json(silent=True) or {}
    ctx, err = _mentor_write(b.get("member"))
    if err:
        return err
    user, member, edu = ctx
    title = re.sub(r"\s+", " ", str(b.get("title") or "")).strip()[:140]
    body = str(b.get("body") or "").strip()[:20000]
    if not body:
        return jsonify({"error": "La note est vide."}), 400
    event_id = b.get("eventId") or None
    db = get_db()
    if event_id and not db.execute("SELECT 1 FROM mentor_events WHERE id = ? AND member_id = ?", (event_id, member["id"])).fetchone():
        event_id = None
    now = datetime.now(timezone.utc).isoformat()
    with db_lock:
        if b.get("id"):
            n = db.execute("SELECT * FROM mentor_notes WHERE id = ? AND member_id = ?", (b.get("id"), member["id"])).fetchone()
            if not n or (n["author_id"] != user["id"] and not user["is_admin"]):
                return jsonify({"error": "Tu ne peux modifier que tes propres notes."}), 403
            db.execute("UPDATE mentor_notes SET title = ?, body = ?, event_id = ?, updated_at = ? WHERE id = ?", (title, body, event_id, now, n["id"]))
        else:
            db.execute("INSERT INTO mentor_notes (member_id, author_id, event_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                       (member["id"], user["id"], event_id, title, body, now, now))
        db.commit()
    return jsonify(_mentor_payload(db, user, member, edu))


@app.route("/mentor/notes/<int:nid>/delete", methods=["POST"])
def mentor_note_delete(nid):
    db = get_db()
    n = db.execute("SELECT * FROM mentor_notes WHERE id = ?", (nid,)).fetchone()
    if not n:
        return jsonify({"error": "Note introuvable."}), 404
    ctx, err = _mentor_write(n["member_id"])
    if err:
        return err
    user, member, edu = ctx
    if n["author_id"] != user["id"] and not user["is_admin"]:
        return jsonify({"error": "Tu ne peux supprimer que tes propres notes."}), 403
    with db_lock:
        db.execute("DELETE FROM mentor_notes WHERE id = ?", (nid,))
        db.commit()
    return jsonify(_mentor_payload(db, user, member, edu))


@app.route("/mentor/library", methods=["POST"])
def mentor_library_add():
    try:
        b = json.loads(request.form.get("data", "{}")) if (request.files or request.form) else (request.get_json(silent=True) or {})
    except ValueError:
        return jsonify({"error": "Données invalides."}), 400
    ctx, err = _mentor_write(b.get("member"))
    if err:
        return err
    user, member, edu = ctx
    kind = b.get("kind")
    if kind not in ("text", "video", "link", "file"):
        return jsonify({"error": "Type inconnu."}), 400
    title = re.sub(r"\s+", " ", str(b.get("title") or "")).strip()[:140]
    if not title:
        return jsonify({"error": "Donne un titre."}), 400
    body = str(b.get("body") or "").strip()[:20000]
    url = str(b.get("url") or "").strip()[:500]
    if url and not re.fullmatch(r"https://\S+", url):
        return jsonify({"error": "Le lien doit commencer par https://"}), 400
    up = save_upload("file", f"m{member['id']}")
    if kind == "text" and not body:
        return jsonify({"error": "Le texte est vide."}), 400
    if kind in ("video", "file") and not up and not url:
        return jsonify({"error": "Ajoute un fichier ou un lien."}), 400
    db = get_db()
    with db_lock:
        db.execute("INSERT INTO mentor_library (member_id, author_id, kind, title, body, url, file, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                   (member["id"], user["id"], kind, title, body, url, json.dumps(up) if up else None, datetime.now(timezone.utc).isoformat()))
        db.commit()
    return jsonify(_mentor_payload(db, user, member, edu))


@app.route("/mentor/library/<int:lid>/delete", methods=["POST"])
def mentor_library_delete(lid):
    db = get_db()
    it = db.execute("SELECT * FROM mentor_library WHERE id = ?", (lid,)).fetchone()
    if not it:
        return jsonify({"error": "Élément introuvable."}), 404
    ctx, err = _mentor_write(it["member_id"])
    if err:
        return err
    user, member, edu = ctx
    if it["author_id"] != user["id"] and not user["is_admin"] and not is_educator(user):
        return jsonify({"error": "Tu ne peux retirer que ce que tu as ajouté."}), 403
    with db_lock:
        if it["file"]:
            delete_file(json.loads(it["file"]))
        db.execute("DELETE FROM mentor_library WHERE id = ?", (lid,))
        db.commit()
    return jsonify(_mentor_payload(db, user, member, edu))


@app.route("/edu/members/<int:mid>")
def edu_member(mid):
    """Fiche complète d'un membre pour son éducateur (ou l'admin) : identité, rang et ce qu'il inclut, questionnaire,
    activité, paiements et commissions, demande BERICH clé en main (accès MT5 déchiffrés), état du suivi."""
    user = current_user()
    db = get_db()
    m = db.execute("SELECT * FROM users WHERE id = ?", (mid,)).fetchone()
    if not user or not m or not (user["is_admin"] or (is_educator(user) and m["referred_by"] == user["id"])):
        return jsonify({"error": "Membre introuvable."}), 404
    edu = db.execute("SELECT * FROM users WHERE id = ?", (m["referred_by"],)).fetchone() if m["referred_by"] else None
    rate = edu_rate(edu) if edu else 0
    a = access_of(m)
    sales = member_sales(db, mid)
    since = (datetime.now(timezone.utc) - timedelta(days=30)).date().isoformat()
    acts = db.execute("SELECT day, page, views FROM user_activity WHERE user_id = ? AND day >= ?", (mid, since)).fetchall()
    pages, per_day = {}, {}
    for r in acts:
        pages[r["page"]] = pages.get(r["page"], 0) + r["views"]
        per_day[r["day"]] = per_day.get(r["day"], 0) + r["views"]
    today = datetime.now(timezone.utc).date()
    try:
        onboarding = json.loads(_col(m, "onboarding") or "null")
    except ValueError:
        onboarding = None
    breq = db.execute("SELECT * FROM berich_requests WHERE user_id = ? AND status != 'replaced' ORDER BY id DESC LIMIT 1", (mid,)).fetchone()
    now = datetime.now(timezone.utc).isoformat()
    nxt = db.execute("SELECT starts_at, topic, status FROM mentor_events WHERE member_id = ? AND starts_at >= ? AND status IN ('proposed', 'confirmed') ORDER BY starts_at LIMIT 1", (mid, now)).fetchone()
    count = lambda q: db.execute(q, (mid,)).fetchone()[0]
    return jsonify({
        "id": mid, "name": f"{m['first_name']} {m['last_name']}".strip(), "first": m["first_name"], "email": m["email"],
        "joinedAt": m["created_at"], "lastSeenAt": _col(m, "last_seen_at"), "lastLoginAt": _col(m, "last_login_at"),
        "price": rank_price(a["plan"], a.get("level")),
        "access": {k: a.get(k) for k in ("plan", "level", "label", "period", "status", "startedAt", "endsAt", "active", "trial", "school", "berich")},
        "onboarding": onboarding,
        "activity": {"days30": len(per_day), "views30": sum(per_day.values()),
                     "last30": [per_day.get((today - timedelta(days=i)).isoformat(), 0) for i in range(29, -1, -1)],
                     "top": sorted(([k, v] for k, v in pages.items()), key=lambda x: -x[1])[:5]},
        "sales": [{"at": r["created_at"], "amount": r["amount"]} for r in sales],
        "salesTotal": sum(r["amount"] for r in sales), "commission": round(sum(r["amount"] for r in sales) * rate / 100), "rate": rate,
        "berich": _req_public(breq, reveal=True) if breq else None,
        "berichPlan": _plan_public(db.execute("SELECT * FROM berich_plans WHERE user_id = ?", (mid,)).fetchone()),
        "mentor": {"next": dict(nxt) if nxt else None,
                   "held": db.execute("SELECT COUNT(*) FROM mentor_events WHERE member_id = ? AND status IN ('confirmed', 'done') AND starts_at < ?", (mid, now)).fetchone()[0],
                   "notes": count("SELECT COUNT(*) FROM mentor_notes WHERE member_id = ?"),
                   "library": count("SELECT COUNT(*) FROM mentor_library WHERE member_id = ?"),
                   "pending": db.execute("SELECT COUNT(*) FROM mentor_events WHERE member_id = ? AND status = 'proposed' AND author_id = ? AND starts_at >= ?", (mid, mid, now)).fetchone()[0]},
    })


@app.route("/edu/code", methods=["POST"])
def edu_choose_code():
    """L'éducateur (ou un admin, 2026-11-14) choisit SON code de référent, une seule fois (3 à 8 lettres ou chiffres),
    définitif. Un membre inscrit avec ce code est rattaché à lui (users.referred_by)."""
    user = current_user()
    if not user or not (is_educator(user) or user["is_admin"]):
        return jsonify({"error": "Réservé aux éducateurs et aux admins."}), 403
    if _col(user, "edu_code"):
        return jsonify({"error": "Ton code est déjà choisi : il ne peut plus changer."}), 400
    code = str((request.get_json(silent=True) or {}).get("code") or "").strip().upper()
    if not re.fullmatch(r"[A-Z0-9]{3,8}", code):
        return jsonify({"error": "De 3 à 8 caractères, lettres et chiffres seulement."}), 400
    db = get_db()
    with db_lock:
        if db.execute("SELECT 1 FROM edu_invites WHERE upper(code) = ?", (code,)).fetchone():
            return jsonify({"error": "Ce code est déjà pris : choisis-en un autre."}), 400
        db.execute("INSERT INTO edu_invites (code, educator_id, created_at, active) VALUES (?, ?, ?, 1)",
                   (code, user["id"], datetime.now(timezone.utc).isoformat()))
        db.execute("UPDATE users SET edu_code = ? WHERE id = ?", (code, user["id"]))
        db.commit()
    if not is_educator(user):
        return jsonify({"code": code})
    return jsonify(edu_report(db, db.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()))


@app.route("/edu/scanner", methods=["POST"])
def edu_choose_scanner():
    """Discipline de l'éducateur = le scanner auquel il est affilié (modifiable). Un admin peut la fixer pour
    un éducateur : {scanner, educator}."""
    user = current_user()
    if not user or not (is_educator(user) or user["is_admin"]):
        return jsonify({"error": "Réservé aux éducateurs."}), 403
    body = request.get_json(silent=True) or {}
    sid = str(body.get("scanner") or "").strip().lower()
    if sid and not re.fullmatch(r"[a-z0-9_-]{1,32}", sid):
        return jsonify({"error": "Scanner inconnu."}), 400
    db = get_db()
    target = user
    if user["is_admin"] and str(body.get("educator") or "").isdigit():
        target = db.execute("SELECT * FROM users WHERE id = ?", (int(body["educator"]),)).fetchone()
        if not target or not is_educator(target):
            return jsonify({"error": "Éducateur introuvable."}), 404
    with db_lock:
        db.execute("UPDATE users SET edu_scanner = ? WHERE id = ?", (sid or None, target["id"]))
        db.commit()
    return jsonify({"ok": True, "scanner": sid or None})


@app.route("/ref/<code>")
def ref_lookup(code):
    """Vérifie un code de référent pour la page d'inscription (prénom + initiale de l'éducateur seulement)."""
    if too_many("ref-ip:" + _client_ip(), 60, 600):
        return jsonify({"error": TOO_MANY}), 429
    hit("ref-ip:" + _client_ip())
    row = get_db().execute("SELECT u.first_name, u.last_name FROM edu_invites i JOIN users u ON u.id = i.educator_id "
                           "WHERE upper(i.code) = upper(?) AND i.active = 1", (str(code)[:40],)).fetchone()
    if not row:
        return jsonify({"error": "Code inconnu."}), 404
    return jsonify({"ok": True, "educator": f"{row['first_name']} {(row['last_name'] or '')[:1]}.".strip()})


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
        out.append({"id": e["id"], "name": f"{e['first_name']} {e['last_name']}", "email": e["email"], "scanner": _col(e, "edu_scanner"), "rate": r["rate"],
                    "invite": r["invite"], "codeChosen": r["codeChosen"], "totals": r["totals"], "wallet": r["wallet"],
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


# ---------------- Cotisation éducateur (2026-11-12) ----------------
# 50 €/mois, couverte par les ventes du mois de ses membres : chaque 6 € vendus couvrent 1 € (300 € vendus = tout,
# un pack à 150 € = la moitié). Le reste se règle par virement (RIB ci-dessous) avant la fin du mois ; l'éducateur
# déclare « c'est fait », l'admin valide ou refuse (Admin → Système).
EDU_FEE = 5000
EDU_FEE_RATIO = 6
EDU_FEE_START = os.environ.get("EDU_FEE_START", "2026-11")
EDU_FEE_BANK = {"holder": os.environ.get("EDU_FEE_HOLDER", "SWANN LAFON"), "iban": "FR76 2823 3000 0161 0406 4729 923",
                "bic": "REVOFRP2", "revolut": "@swann21"}


def _month_key(dt):
    return f"{dt.year:04d}-{dt.month:02d}"


def _month_end(month):
    y, m = int(month[:4]), int(month[5:7])
    y2, m2 = (y + 1, 1) if m == 12 else (y, m + 1)
    return (datetime(y2, m2, 1, tzinfo=timezone.utc) - timedelta(seconds=1)).isoformat()


def edu_fee_report(db, educator):
    now = datetime.now(timezone.utc)
    cur = _month_key(now)
    first = max(EDU_FEE_START, (educator["created_at"] or cur)[:7])
    by_month = {}
    for m in db.execute("SELECT id FROM users WHERE referred_by = ?", (educator["id"],)).fetchall():
        sales, _r, net = _net_sales(db, m["id"])
        for sale in sales:
            k = (sale["created_at"] or "")[:7]
            by_month[k] = by_month.get(k, 0) + max(0, net.get(sale["id"], 0))
    rows = db.execute("SELECT * FROM edu_fees WHERE educator_id = ? ORDER BY id DESC", (educator["id"],)).fetchall()
    months, k = [], first
    while k <= cur and len(months) < 36:
        sold = by_month.get(k, 0)
        covered = min(EDU_FEE, sold // EDU_FEE_RATIO)
        due = EDU_FEE - covered
        decl = next((r for r in rows if r["month"] == k and r["status"] in ("declared", "paid")), None)
        refused = next((r for r in rows if r["month"] == k and r["status"] == "refused"), None)
        if due <= 0:
            status = "covered"
        elif decl:
            status = "paid" if decl["status"] == "paid" else "declared"
        else:
            status = "due" if k == cur else "late"
        months.append({"month": k, "sales": sold, "covered": covered, "due": max(0, due), "status": status,
                       "deadline": _month_end(k), "declaredAt": decl["created_at"] if decl else None,
                       "refused": bool(refused and not decl), "note": (refused["admin_note"] or "") if refused and not decl else ""})
        y, mo = int(k[:4]), int(k[5:7])
        k = f"{y + (mo == 12):04d}-{1 if mo == 12 else mo + 1:02d}"
    months.reverse()
    return {"fee": EDU_FEE, "ratio": EDU_FEE_RATIO, "bank": EDU_FEE_BANK, "current": cur, "months": months,
            "ref": f"CHEST {educator['first_name']} {(educator['last_name'] or '')[:1]}".strip()}


@app.route("/edu/fee")
def edu_fee():
    who, err = _edu_subject()
    if err:
        return err
    return jsonify(edu_fee_report(get_db(), who))


@app.route("/edu/fee/declare", methods=["POST"])
def edu_fee_declare():
    user = current_user()
    if not user or not is_educator(user):
        return jsonify({"error": "Réservé aux éducateurs."}), 403
    month = str((request.get_json(silent=True) or {}).get("month") or "")
    db = get_db()
    with db_lock:
        rep_ = edu_fee_report(db, user)
        m = next((x for x in rep_["months"] if x["month"] == month), None)
        if not m:
            return jsonify({"error": "Mois inconnu."}), 400
        if m["status"] not in ("due", "late"):
            return jsonify({"error": "Rien à régler pour ce mois."}), 400
        db.execute("INSERT INTO edu_fees (educator_id, month, amount, status, created_at) VALUES (?, ?, ?, 'declared', ?)",
                   (user["id"], month, m["due"], datetime.now(timezone.utc).isoformat()))
        db.commit()
    return jsonify(edu_fee_report(db, user))


@app.route("/admin/edu-fees")
def admin_edu_fees():
    admin = current_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    db = get_db()
    rows = db.execute("SELECT f.*, u.first_name, u.last_name FROM edu_fees f JOIN users u ON u.id = f.educator_id "
                      "ORDER BY (f.status = 'declared') DESC, f.id DESC LIMIT 200").fetchall()
    cur = _month_key(datetime.now(timezone.utc))
    educators = []
    for e in db.execute("SELECT * FROM users WHERE role = 'educator' ORDER BY first_name").fetchall():
        m = next((x for x in edu_fee_report(db, e)["months"] if x["month"] == cur), None)
        if m:
            educators.append({"id": e["id"], "name": f"{e['first_name']} {(e['last_name'] or '')[:1]}.".strip(), **m})
    return jsonify({"fees": [{"id": r["id"], "educator": f"{r['first_name']} {r['last_name'] or ''}".strip(), "month": r["month"],
                              "amount": r["amount"], "status": r["status"], "createdAt": r["created_at"],
                              "processedAt": r["processed_at"], "note": r["admin_note"] or ""} for r in rows],
                    "educators": educators, "current": cur})


@app.route("/admin/edu-fees/<int:fid>", methods=["POST"])
def admin_edu_fee_update(fid):
    admin = current_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    b = request.get_json(silent=True) or {}
    status = b.get("status")
    if status not in ("paid", "refused"):
        return jsonify({"error": "Statut inconnu."}), 400
    db = get_db()
    with db_lock:
        r = db.execute("SELECT status FROM edu_fees WHERE id = ?", (fid,)).fetchone()
        if not r:
            return jsonify({"error": "Déclaration introuvable."}), 404
        if r["status"] != "declared":
            return jsonify({"error": "Déjà traitée."}), 400
        db.execute("UPDATE edu_fees SET status = ?, processed_at = ?, admin_note = ? WHERE id = ?",
                   (status, datetime.now(timezone.utc).isoformat(), str(b.get("note") or "")[:240], fid))
        db.commit()
    return admin_edu_fees()


# Réduction affichée sur la landing et les offres (2026-11-04) : activée par l'admin (Admin → Système),
# un pourcentage et un code (NOVE10 par défaut). Le code tapé au paiement baisse le prix envoyé à Stripe.
def get_promo():
    try:
        p = json.loads(get_setting("promo") or "{}")
    except ValueError:
        p = {}
    pct = int(p.get("pct") or 10)
    return {"on": bool(p.get("on")), "pct": max(1, min(90, pct)), "code": str(p.get("code") or "NOVE10").upper()[:16]}


def promo_for(code):
    p = get_promo()
    return p["pct"] if p["on"] and code and str(code).strip().upper() == p["code"] else 0


@app.route("/promo", methods=["PUT"])
def promo_put():
    admin = current_user()
    if not admin or not admin["is_admin"]:
        return jsonify({"error": "Réservé aux administrateurs."}), 403
    body = request.get_json(silent=True) or {}
    code = str(body.get("code") or "NOVE10").strip().upper()
    if not re.fullmatch(r"[A-Z0-9]{3,16}", code):
        return jsonify({"error": "Code : 3 à 16 lettres ou chiffres."}), 400
    try:
        pct = int(body.get("pct") or 10)
    except (TypeError, ValueError):
        pct = 0
    if not 1 <= pct <= 90:
        return jsonify({"error": "La réduction va de 1 à 90 %."}), 400
    set_setting("promo", json.dumps({"on": bool(body.get("on")), "pct": pct, "code": code}))
    log_event(get_db(), "admin.promo", admin["id"], f"Réduction {'activée' if body.get('on') else 'désactivée'} : {pct} % · {code}")
    return jsonify(get_promo())


@app.route("/pricing", methods=["GET", "PUT"])
def pricing():
    if request.method == "GET":
        data = get_pricing()
        return jsonify({"offers": data["offers"], "updatedAt": get_setting("pricing_updated_at"),
                        "checkout": "auto" if STRIPE_SECRET_KEY else "liens", "promo": get_promo(),
                        "crypto": get_crypto_settings()["on"]})
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


def _offer_label(o):
    return f"CHEST {'Premium' if o['group'] == 'premium' else 'Essentiel'} {ROMAN.get(o['level'], '')}".strip()


@app.route("/billing/checkout", methods=["POST"])
def billing_checkout():
    """La page de paiement d'une offre, au prix affiché : {offer: "premium3"} → {url}. Le membre, l'offre, son
    éducateur, le taux et la commission sont inscrits sur le paiement (visibles dans Stripe, relus par le webhook)."""
    user = current_user()
    if not user:
        return jsonify({"error": "Connecte-toi pour choisir une offre."}), 401
    body = request.get_json(silent=True) or {}
    key = str(body.get("offer") or "")
    pct = promo_for(body.get("code"))
    o = next((x for x in get_pricing()["offers"] if x.get("key") == key), None)
    if not o or not o.get("enabled") or o.get("soon") or not o.get("price"):
        return jsonify({"error": "Cette offre n'est pas disponible."}), 400
    if not STRIPE_SECRET_KEY:
        link = str(o.get("link") or "").strip()
        if not link:
            return jsonify({"error": "Le paiement en ligne de cette offre ouvre très bientôt."}), 503
        # Le code de réduction n'est jamais pré-rempli : le membre le tape lui-même sur la page Stripe.
        # l'offre voyage avec le membre (2026-11-08) : Premium I et Essentiel III coûtent tous deux 1000 €, le montant
        # seul ne suffit pas à savoir ce qui a été acheté (lu par le webhook, validé contre le prix de l'offre)
        q = urllib.parse.urlencode({"client_reference_id": f"u{user['id']}-{key}", "prefilled_email": user["email"], "locale": "fr"})
        return jsonify({"url": f"{link}{'&' if '?' in link else '?'}{q}", "mode": "liens"})
    db = get_db()
    edu = db.execute("SELECT * FROM users WHERE id = ?", (_col(user, "referred_by"),)).fetchone() if _col(user, "referred_by") else None
    edu = edu if is_educator(edu) else None
    cents = int(round(float(o["price"]) * (100 - pct)))
    rate = edu_rate(edu) if edu else 0.0
    label, who = _offer_label(o), f"{user['first_name']} {(user['last_name'] or '')[:1]}.".strip()
    edu_name = f"{edu['first_name']} {edu['last_name'] or ''}".strip() if edu else "aucun (vente directe CHEST)"
    meta = {"offer": key, "amount": str(cents), "member_id": str(user["id"]), "member": who,
            "educator_id": str(edu["id"]) if edu else "", "educator": edu_name,
            "commission_rate": f"{rate:.2f} %", "commission": f"{cents * rate / 10000:.2f} EUR",
            "promo": f"{get_promo()['code']} -{pct} %" if pct else ""}
    fields = [("mode", "payment"), ("locale", "fr"), ("client_reference_id", f"u{user['id']}"),
              ("success_url", f"{CHECKOUT_SITE}/offres?paiement=ok"), ("cancel_url", f"{CHECKOUT_SITE}/offres"),
              ("line_items[0][quantity]", "1"), ("line_items[0][price_data][currency]", "eur"),
              ("line_items[0][price_data][unit_amount]", str(cents)),
              ("line_items[0][price_data][product_data][name]", f"{label} · {o['months']} mois"),
              ("payment_intent_data[description]", f"{label} · {who} · éducateur : {edu_name}")]
    if _col(user, "stripe_customer_id"):
        fields.append(("customer", user["stripe_customer_id"]))
    else:
        fields += [("customer_email", user["email"]), ("customer_creation", "always")]
    for k, v in meta.items():
        fields += [(f"metadata[{k}]", v), (f"payment_intent_data[metadata][{k}]", v)]
    try:
        session = _stripe_post("/v1/checkout/sessions", fields)
    except RuntimeError as e:
        log_event(db, "paiement.erreur", user["id"], f"{label} : {e}", "warn")
        return jsonify({"error": f"Le paiement n'a pas pu s'ouvrir : {e}"}), 502
    log_event(db, "paiement.ouvert", user["id"], f"{label} · {cents / 100:g} €{f' (code -{pct} %)' if pct else ''} · éducateur : {edu_name}")
    return jsonify({"url": session.get("url"), "mode": "auto"})


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
            # paiement ouvert par /billing/checkout : l'offre est inscrite dessus (par le serveur, signé par Stripe),
            # valable seulement si le montant payé est bien celui de cette offre au moment de l'achat
            meta = obj.get("metadata") or {}
            plan = None
            if meta.get("offer") in PRICING_KEYS and str(meta.get("amount") or "") == str(amount):
                lvl = int(meta["offer"][-1])
                plan = {"plan": meta["offer"][:-1], "level": lvl, "months": LEVEL_MONTHS[lvl]}
            ref = re.fullmatch(r"u\d+-([a-z]+\d)", str(obj.get("client_reference_id") or ""))
            if not plan and ref and ref.group(1) in PRICING_KEYS:
                o = next((x for x in get_pricing()["offers"] if x.get("key") == ref.group(1)), None)
                pct = get_promo()["pct"]
                if o and o.get("price") and int(amount or 0) in (int(round(float(o["price"]) * 100)), int(round(float(o["price"]) * (100 - pct)))):
                    lvl = int(ref.group(1)[-1])
                    plan = {"plan": ref.group(1)[:-1], "level": lvl, "months": LEVEL_MONTHS[lvl]}
            pl = obj.get("payment_link")
            pl_key = STRIPE_LINK_IDS.get(pl.get("id") if isinstance(pl, dict) else pl)
            if not plan and pl_key and str(STRIPE_DEFAULT_LINKS[pl_key][0] * 100) == str(amount):
                lvl = int(pl_key[-1])
                plan = {"plan": pl_key[:-1], "level": lvl, "months": LEVEL_MONTHS[lvl]}
            plan = plan or plan_for_amount(amount)
            paid = obj.get("payment_status") in ("paid", "no_payment_required")
            if user and plan and paid:
                name, level, months = plan["plan"], plan["level"], plan["months"]
                ends = _add_months(now, months)
                sub = obj.get("subscription")
                cust = obj.get("customer")
                _set_plan(db, uid, name, plan.get("period") or f"{months}m", "active", now, ends,
                          stripe_subscription_id=(sub.get("id") if isinstance(sub, dict) else sub),
                          stripe_customer_id=(cust.get("id") if isinstance(cust, dict) else cust),
                          plan_amount=int(obj.get("amount_total") or 0), plan_level=level)
                summary = f"Paiement {PLANS[name]['label']}{' ' + str(level) if level else ''} ({months} mois)"
            elif user and not paid:
                summary = "Paiement en attente de confirmation"
            else:
                summary = f"Paiement non rattaché (montant {amount}, membre {'trouvé' if user else 'inconnu'})"
            _log_billing(db, event.get("id"), uid, etype, int(obj.get("amount_total") or 0), summary)
            log_event(db, "paiement", uid, summary, "info", locked=True, with_request=False)
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
            log_event(db, "paiement.echec", uid, f"{int(obj.get('amount_due') or 0) / 100:.2f} €", "warn", locked=True, with_request=False)
        elif etype == "customer.subscription.updated":
            if user:
                end = _sub_period_end(obj)
                status = "canceling" if obj.get("cancel_at_period_end") else ("active" if obj.get("status") in ("active", "trialing") else obj.get("status"))
                if end:
                    db.execute("UPDATE users SET plan_status = ?, plan_ends_at = ? WHERE id = ?", (status, _iso(end), uid))
                else:
                    db.execute("UPDATE users SET plan_status = ? WHERE id = ?", (status, uid))
            _log_billing(db, event.get("id"), uid, etype, 0, "Résiliation programmée en fin de période" if obj.get("cancel_at_period_end") else "Abonnement mis à jour")
        elif etype == "charge.refunded":
            # remboursement (politique : 7 jours) : il annule la commission de l'éducateur sur ce paiement
            _log_billing(db, event.get("id"), uid, etype, int(obj.get("amount_refunded") or 0), "Remboursement")
            log_event(db, "remboursement", uid, f"{int(obj.get('amount_refunded') or 0) / 100:.2f} €", "warn", locked=True, with_request=False)
        elif etype in ("charge.dispute.created", "charge.dispute.closed"):
            _log_billing(db, event.get("id"), uid, etype, int(obj.get("amount") or 0), "Litige ouvert" if etype.endswith("created") else f"Litige clos ({obj.get('status')})")
            log_event(db, "litige", uid, f"{int(obj.get('amount') or 0) / 100:.2f} € · {obj.get('reason') or ''}", "alerte", locked=True, with_request=False)
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
    out["storage"] = storage_info(db, row)
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
    # Fiche Admin 2.0 (2026-11-02) : éducateur, état BERICH et alertes du journal sur 30 jours.
    edu = db.execute("SELECT id, first_name, last_name, edu_code, edu_scanner FROM users WHERE id = ?",
                     (_col(row, "referred_by"),)).fetchone() if _col(row, "referred_by") else None
    out["educator"] = {"id": edu["id"], "name": f"{edu['first_name']} {edu['last_name'] or ''}".strip(),
                       "code": _col(edu, "edu_code"), "scanner": _col(edu, "edu_scanner")} if edu else None
    plan = db.execute("SELECT attached_at FROM berich_plans WHERE user_id = ?", (row["id"],)).fetchone()
    req = db.execute("SELECT status FROM berich_requests WHERE user_id = ? ORDER BY id DESC LIMIT 1", (row["id"],)).fetchone()
    out["berich"] = {"plan": bool(plan), "attached": bool(plan and plan["attached_at"]), "request": req["status"] if req else None}
    out["alerts"] = db.execute("SELECT COUNT(*) FROM event_log WHERE user_id = ? AND level = 'warn' AND at >= ?",
                               (row["id"], (datetime.now(timezone.utc) - timedelta(days=30)).isoformat())).fetchone()[0]
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
            _set_plan(db, member_id, "none", None, "manual", None, None, plan_level=None)
        else:
            lvl = (request.get_json(silent=True) or {}).get("level")
            lvl = int(lvl) if str(lvl) in ("1", "2", "3", "4") and plan in ("essentiel", "premium") else None
            _set_plan(db, member_id, plan, f"{LEVEL_MONTHS[lvl]}m" if lvl else None, "manual", now, ends, plan_level=lvl)
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
                per = a["period"] or ""
                months = 12 if per == "year" else (int(per[:-1]) if per.endswith("m") and per[:-1].isdigit() else 1)
                mrr += amount / 100 / months
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


# Stockage par membre (2026-11-04) : chaque fichier envoyé est compté à celui qui l'envoie (table user_files).
# Quota de l'offre : Essentiel (et tout le reste) 1 Go, Premium 2 Go, éducateur 5 Go, admin 10 Go, manageur 0 ;
# l'admin peut en choisir un autre pour un membre (users.storage_quota_mb). Les fichiers d'avant le 2026-11-04
# n'ont pas d'auteur connu et ne comptent pour personne.
STORAGE_MB = {"essentiel": 1024, "premium": 2048, "educator": 5120, "admin": 10240, "manager": 0}
STORAGE_PRICE_USD_GB = 0.015  # Railway Buckets, par Go et par mois (lecture et téléchargements gratuits)

# Bucket Railway « chest-files » (2026-11-04) : les fichiers envoyés y sont rangés sous files/<clé>, le disque
# ne sert plus que de passage. Variables BUCKET_* = références Railway vers le bucket (jamais dans le code).
# Les fichiers d'avant restent sur le disque et sont copiés dans le bucket au démarrage ; ils sont servis depuis
# le disque tant que BUCKET_PURGE_LOCAL n'est pas à 1 (on efface le disque seulement une fois la copie vérifiée).
BUCKET = os.environ.get("BUCKET_NAME") or ""
_s3_client = None


def s3():
    global _s3_client
    if not BUCKET:
        return None
    if _s3_client is None:
        import boto3
        from botocore.config import Config
        _s3_client = boto3.client(
            "s3", endpoint_url=os.environ.get("BUCKET_ENDPOINT"), region_name=os.environ.get("BUCKET_REGION") or "auto",
            aws_access_key_id=os.environ.get("BUCKET_ACCESS_KEY_ID"), aws_secret_access_key=os.environ.get("BUCKET_SECRET_ACCESS_KEY"),
            config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}))
    return _s3_client


def _obj(key):
    return "files/" + os.path.basename(key)


def bucket_migrate():
    """Copie dans le bucket les fichiers restés sur le disque ; efface la copie locale si BUCKET_PURGE_LOCAL=1."""
    c = s3()
    if not c or not os.path.isdir(FILES_DIR):
        return
    purge = os.environ.get("BUCKET_PURGE_LOCAL") == "1"
    done = copied = purged = 0
    for name in os.listdir(FILES_DIR):
        path = os.path.join(FILES_DIR, name)
        if not os.path.isfile(path):
            continue
        size = os.path.getsize(path)
        try:
            try:
                same = c.head_object(Bucket=BUCKET, Key=_obj(name)).get("ContentLength") == size
            except Exception:
                same = False
            if not same:
                import mimetypes
                c.upload_file(path, BUCKET, _obj(name), ExtraArgs={"ContentType": mimetypes.guess_type(name)[0] or "application/octet-stream"})
                copied += 1
                same = c.head_object(Bucket=BUCKET, Key=_obj(name)).get("ContentLength") == size
            if same and purge:
                os.remove(path)
                purged += 1
            done += 1
        except Exception as e:
            print(f"[bucket] copie impossible de {name} : {e}", flush=True)
    print(f"[bucket] {done} fichiers vérifiés, {copied} copiés, {purged} effacés du disque", flush=True)


_bucket_stats = {"at": 0, "data": None}


def bucket_usage():
    """Tous les fichiers stockés (bucket + disque non encore copié) : {clé: taille}. Mis en cache 5 minutes."""
    if _bucket_stats["data"] is not None and time.time() - _bucket_stats["at"] < 300:
        return _bucket_stats["data"]
    files = {}
    if os.path.isdir(FILES_DIR):
        for name in os.listdir(FILES_DIR):
            path = os.path.join(FILES_DIR, name)
            if os.path.isfile(path):
                files[name] = os.path.getsize(path)
    c = s3()
    if c:
        try:
            for page in c.get_paginator("list_objects_v2").paginate(Bucket=BUCKET, Prefix="files/"):
                for o in page.get("Contents", []):
                    files[o["Key"][len("files/"):]] = o["Size"]
        except Exception as e:
            print(f"[bucket] liste impossible : {e}", flush=True)
    _bucket_stats.update(at=time.time(), data=files)
    return files


# Données synchronisées dans le bucket (2026-11-04) : une valeur de user_data (backtests, journal…) de plus de
# 64 Ko part dans le bucket sous data/u<id>/<sha256>.json ; la base ne garde qu'une référence
# « @@bucket:<octets>:<clé> ». Même contenu = même référence, donc l'historique (30 versions) pointe sur les mêmes
# objets sans les recopier ; un objet est effacé quand plus aucune ligne ne le référence (ud_forget).
UD_INLINE_MAX = 64 * 1024
UD_PREFIX = "@@bucket:"
_ud_cache = {}
_ud_cache_size = [0]


def ud_is_ref(v):
    return isinstance(v, str) and v.startswith(UD_PREFIX)


def ud_size(v):
    if ud_is_ref(v):
        return int(v[len(UD_PREFIX):].split(":", 1)[0])
    return len((v or "").encode("utf-8"))


def _ud_remember(key, value):
    if _ud_cache_size[0] > 64 * 1024 * 1024:
        _ud_cache.clear()
        _ud_cache_size[0] = 0
    if key not in _ud_cache:
        _ud_cache[key] = value
        _ud_cache_size[0] += len(value)


def ud_put(user_id, value):
    """Forme stockée d'une valeur : elle-même si petite (ou bucket absent), sinon une référence vers le bucket."""
    c = s3()
    if not c or not isinstance(value, str) or len(value) <= UD_INLINE_MAX or ud_is_ref(value):
        return value
    raw = value.encode("utf-8")
    key = f"data/u{int(user_id)}/{hashlib.sha256(raw).hexdigest()}.json"
    if key not in _ud_cache:
        try:
            c.put_object(Bucket=BUCKET, Key=key, Body=raw, ContentType="application/json")
        except Exception as e:  # bucket injoignable : la valeur reste dans la base, rien n'est perdu
            print(f"[bucket] données de u{user_id} gardées dans la base : {e}", flush=True)
            return value
        _ud_remember(key, value)
    return f"{UD_PREFIX}{len(raw)}:{key}"


def ud_get(v):
    """Valeur réelle (lit le bucket si c'est une référence). None si le bucket ne répond pas."""
    if not ud_is_ref(v):
        return v
    key = v.split(":", 2)[2]
    if key in _ud_cache:
        return _ud_cache[key]
    c = s3()
    if not c:
        return None
    try:
        body = c.get_object(Bucket=BUCKET, Key=key)["Body"].read().decode("utf-8")
    except Exception as e:
        print(f"[bucket] lecture impossible de {key} : {e}", flush=True)
        return None
    _ud_remember(key, body)
    return body


def ud_forget(db, v):
    """Efface l'objet du bucket si plus aucune donnée ni sauvegarde ne le référence."""
    if not ud_is_ref(v):
        return
    n = db.execute("SELECT (SELECT COUNT(*) FROM user_data WHERE value = ?) + (SELECT COUNT(*) FROM user_data_history WHERE value = ?)"
                   " + (SELECT COUNT(*) FROM user_backtests WHERE value = ?)", (v, v, v)).fetchone()[0]
    c = s3()
    if n == 0 and c:
        key = v.split(":", 2)[2]
        try:
            c.delete_object(Bucket=BUCKET, Key=key)
        except Exception as e:
            print(f"[bucket] suppression impossible de {key} : {e}", flush=True)
        _ud_cache.pop(key, None)


def _bucket_drop_prefix(prefix):
    c = s3()
    if not c:
        return
    try:
        for page in c.get_paginator("list_objects_v2").paginate(Bucket=BUCKET, Prefix=prefix):
            keys = [{"Key": o["Key"]} for o in page.get("Contents", [])]
            if keys:
                c.delete_objects(Bucket=BUCKET, Delete={"Objects": keys})
    except Exception as e:
        print(f"[bucket] nettoyage impossible de {prefix} : {e}", flush=True)


def ud_migrate():
    """Range dans le bucket les grosses valeurs encore dans la base (données et sauvegardes)."""
    if not s3():
        return
    moved = 0
    with sqlite3.connect(DB_PATH) as db:
        for table, pk in (("user_data", "rowid"), ("user_data_history", "id")):
            rows = db.execute(f"SELECT {pk}, user_id, value FROM {table} WHERE LENGTH(value) > ? AND value NOT LIKE '@@bucket:%'",
                              (UD_INLINE_MAX,)).fetchall()
            for rid, uid, value in rows:
                ref = ud_put(uid, value)
                if ref != value:
                    with db_lock:
                        db.execute(f"UPDATE {table} SET value = ? WHERE {pk} = ?", (ref, rid))
                        db.commit()
                    moved += 1
    print(f"[bucket] {moved} données synchronisées rangées dans le bucket", flush=True)


class StorageFull(Exception):
    pass


@app.errorhandler(StorageFull)
def _storage_full(e):
    return jsonify({"error": str(e), "storageFull": True}), 413


def storage_tier(row):
    if row["is_admin"]:
        return "manager" if _col(row, "role") == "manager" else "admin"
    if is_educator(row):
        return "educator"
    a = access_of(row)
    return "premium" if a.get("active") and a.get("plan") == "premium" else "essentiel"


def storage_quota_mb(row):
    q = _col(row, "storage_quota_mb")
    if q is not None:
        return int(q)
    return STORAGE_MB[storage_tier(row)]


def storage_info(db, row):
    # Utilisé = fichiers envoyés + données synchronisées du membre (backtests, journal, comptes, réglages : table user_data).
    files = db.execute("SELECT COALESCE(SUM(size), 0) FROM user_files WHERE user_id = ?", (row["id"],)).fetchone()[0]
    data = db.execute("SELECT COALESCE(SUM(LENGTH(key) + CASE WHEN value LIKE '@@bucket:%' "
                      "THEN CAST(substr(value, 10, instr(substr(value, 10), ':') - 1) AS INTEGER) "
                      "ELSE LENGTH(CAST(value AS BLOB)) END), 0) FROM user_data WHERE user_id = ?", (row["id"],)).fetchone()[0]
    data += db.execute("SELECT COALESCE(SUM(size), 0) FROM user_backtests WHERE user_id = ?", (row["id"],)).fetchone()[0]
    q = storage_quota_mb(row)
    return {"used": files + data, "files": files, "data": data, "quota": q * 1024 * 1024,
            "custom": _col(row, "storage_quota_mb") is not None, "tier": storage_tier(row)}


def _gb(n):
    if n < 1024 ** 3:
        return f"{round(n / 1024 ** 2)} Mo"
    return f"{n / 1024 ** 3:.1f}".rstrip("0").rstrip(".").replace(".", ",") + " Go"


def save_upload(field, entry_id):
    """Enregistre le fichier du champ multipart `field` sous un nom aléatoire. Renvoie un dict ou None.
    Lève StorageFull (→ 413) si le fichier dépasse l'espace restant de celui qui l'envoie."""
    f = request.files.get(field)
    if not f or not f.filename:
        return None
    owner = current_user()
    db = get_db()
    st = storage_info(db, owner) if owner else None
    full_msg = lambda: f"Espace de stockage plein : {_gb(st['used'])} utilisés sur {_gb(st['quota'])}. Supprime des fichiers ou mets la vidéo sur YouTube et colle le lien."
    if st and st["quota"] == 0:
        raise StorageFull("Ton compte n'a pas d'espace de stockage. Demande à l'admin, ou mets la vidéo sur YouTube et colle le lien.")
    if st and st["used"] + (request.content_length or 0) > st["quota"] + 64 * 1024:
        raise StorageFull(full_msg())
    os.makedirs(FILES_DIR, exist_ok=True)
    ext = os.path.splitext(secure_filename(f.filename))[1][:12].lower()
    key = secrets.token_urlsafe(12).replace("-", "a").replace("_", "b") + ext
    path = os.path.join(FILES_DIR, key)
    f.save(path)
    size = os.path.getsize(path)
    if st and st["used"] + size > st["quota"]:
        os.remove(path)
        raise StorageFull(full_msg())
    c = s3()
    if c:
        try:
            c.upload_file(path, BUCKET, _obj(key), ExtraArgs={"ContentType": f.mimetype or "application/octet-stream"})
            os.remove(path)
        except Exception as e:  # le bucket ne répond pas : le fichier reste sur le disque, recopié au prochain démarrage
            print(f"[bucket] envoi impossible de {key} : {e}", flush=True)
    _bucket_stats["data"] = None
    if owner:
        db.execute("INSERT INTO user_files (key, user_id, size, created_at) VALUES (?, ?, ?, ?)",
                   (key, owner["id"], size, datetime.now(timezone.utc).isoformat()))
        db.commit()
    return {"key": key, "name": f.filename, "size": size, "mime": f.mimetype or ""}


def delete_file(info):
    if info and info.get("key"):
        key = os.path.basename(info["key"])
        try:
            os.remove(os.path.join(FILES_DIR, key))
        except OSError:
            pass
        c = s3()
        if c:
            try:
                c.delete_object(Bucket=BUCKET, Key=_obj(key))
            except Exception as e:
                print(f"[bucket] suppression impossible de {key} : {e}", flush=True)
        _bucket_stats["data"] = None
        try:
            db = get_db()
            db.execute("DELETE FROM user_files WHERE key = ?", (key,))
            db.commit()
        except Exception:
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


def _scanner_video_ok(user, cur, data):
    """Un éducateur rattaché à un scanner gère les vidéos de ce scanner (section « scanners ») et rien d'autre."""
    sid = _col(user, "edu_scanner")
    if not sid or not is_educator(user):
        return False
    if cur and (cur.get("section") != "scanners" or cur.get("scanner") != sid):
        return False
    return data is None or (data.get("kind") == "video" and data.get("section", "scanners") == "scanners" and data.get("scanner", sid) == sid)


@app.route("/school/entries", methods=["POST"])
def school_save():
    admin = approved_user()
    if not admin:
        return jsonify({"error": "Non connecté."}), 401
    if request.files or request.form:
        try:
            data = json.loads(request.form.get("data", "{}"))
        except ValueError:
            return jsonify({"error": "Données invalides."}), 400
    else:
        data = request.get_json(silent=True) or {}
    if not admin["is_admin"]:
        prev = get_db().execute("SELECT data FROM school_entries WHERE id = ?", (str(data.get("id") or ""),)).fetchone()
        if not _scanner_video_ok(admin, json.loads(prev["data"]) if prev else None, data):
            return jsonify({"error": "Réservé aux administrateurs (un éducateur ajoute les vidéos de son scanner)."}), 403
        data["section"], data["scanner"] = "scanners", _col(admin, "edu_scanner")
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
    if not admin:
        return jsonify({"error": "Non connecté."}), 401
    if not admin["is_admin"]:
        prev = get_db().execute("SELECT data FROM school_entries WHERE id = ?", (entry_id,)).fetchone()
        if not prev or not _scanner_video_ok(admin, json.loads(prev["data"]), None):
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
    key = os.path.basename(key)
    c = s3()
    if c and not os.path.isfile(os.path.join(FILES_DIR, key)):
        url = c.generate_presigned_url("get_object", Params={"Bucket": BUCKET, "Key": _obj(key)}, ExpiresIn=6 * 3600)
        resp = redirect(url, code=302)
        resp.headers["Cache-Control"] = "private, max-age=3000"
        return resp
    return send_from_directory(FILES_DIR, key, conditional=True, max_age=3600)


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
# BERICH dans les notifications de scanners (2026-11-05) : toutes les positions de l'algorithme (ouverture puis
# résultat), sans paire ni unité de temps ; envoyées depuis /push/broadcast quand berich-bridge reçoit un signal.
ALERT_ALGOS = {"berich1": ("BERICH I", "assets/logo-berich.png"), "berich2": ("BERICH II", "assets/logo-berich.png")}
ALERT_TF_LABEL = {"1": "M1", "5": "M5", "15": "M15", "30": "M30", "60": "H1", "240": "H4", "D": "D1"}
SITE_URL = os.environ.get("SITE_URL", "https://your-chest.vercel.app").rstrip("/")


def _watch_sync():
    """Coût Railway (2026-11-10) : le scanner-server ne recalcule, à chaque clôture de bougie, que les combinaisons
    paire / unité de temps des règles existantes, et pour chacune seulement les scanners choisis dans ces règles
    (+ le scanner de référence de School, pour « Derniers trades »). Liste remplacée en entier : une règle supprimée
    n'est plus surveillée. Avant : les 11 scanners sur chaque combinaison, et les combinaisons jamais retirées."""
    want = {}
    for r in get_db().execute("SELECT pairs, timeframes, scanners FROM alert_rules").fetchall():
        try:
            pairs, tfs = json.loads(r["pairs"] or "[]"), json.loads(r["timeframes"] or "[]")
            scs = {s for s in json.loads(r["scanners"] or "[]") if s in ALERT_SCANNERS}
        except (TypeError, ValueError):
            continue
        for p in pairs:
            for t in tfs:
                if scs:
                    want.setdefault((p, t), set()).update(scs)
    school = get_setting("school_scanner", "pulse")
    combos = [{"symbol": p, "tf": t, "scanners": sorted(s | ({school} if school in ALERT_SCANNERS else set()))} for (p, t), s in sorted(want.items())]
    _scanner_call("/watch", "POST", {"replace": True, "combos": combos})


def _watch_sync_later():
    time.sleep(20)
    try:
        with app.app_context():
            _watch_sync()
    except Exception as e:
        print(f"[watch] synchronisation impossible : {e}", flush=True)


def _scanner_call(path, method="GET", body=None):
    if not SCANNER_SERVER_URL:
        return None
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json", "X-Internal-Secret": SCANNER_INTERNAL_SECRET}
    req = urllib.request.Request(SCANNER_SERVER_URL.rstrip("/") + path, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


# ---------------- Taille des SL d'un historique de positions (2026-11-12) ----------------
# Pour qu'aucun plan ne propose un risque impossible (lot minimum 0,01 = 1 $ par dollar de mouvement de l'or, donc
# 0,01 $ par tick de 0,01) : on retrouve le prix à l'ouverture et à la clôture de chaque position dans l'historique M15
# (scanner-server /history, gardé sur disque), puis distance du SL = |clôture − ouverture| pour un SL, ÷ R pour un TP.
# shift = heures à ajouter aux horaires (BERICH : +6 h). Résultat : médiane, quartiles et la distance de chaque position.
_SL_CACHE = {}


def _sl_estimate(symbol, trades, shift_h):
    key = hashlib.sha256(json.dumps([symbol, shift_h, trades], sort_keys=True).encode()).hexdigest()
    if key in _SL_CACHE:
        return _SL_CACHE[key]
    sh = int(shift_h * 3600000)
    times = [t["t"] + sh for t in trades] + [t["c"] + sh for t in trades]
    d = _scanner_call("/history?" + urllib.parse.urlencode({"symbol": symbol, "tf": "15", "from": min(times) - 900000, "to": max(times) + 900000})) or {}
    bars = d.get("bars") or []
    if not bars:
        raise RuntimeError("historique indisponible")
    starts = [b[0] for b in bars]
    import bisect

    def bar_at(ms):
        i = bisect.bisect_right(starts, ms) - 1
        return bars[i] if 0 <= i < len(bars) and ms - bars[i][0] < 3 * 3600000 else None

    per = []
    for t in trades:
        bo, bc = bar_at(t["t"] + sh), bar_at(t["c"] + sh)
        res, r = str(t.get("result") or "").upper(), t.get("r")
        dist = None
        if bo and bc:
            move = abs(bc[4] - bo[1])
            if res == "SL" or (r is not None and r <= -0.5):
                dist = move / max(1.0, abs(r or 1))
            elif r is not None and r >= 0.5:
                dist = move / r
        per.append(round(dist, 2) if dist and dist > 0 else None)
    vals = sorted(v for v in per if v)
    if not vals:
        raise RuntimeError("aucune position exploitable")
    q = lambda f: vals[min(len(vals) - 1, int(f * (len(vals) - 1) + 0.5))]
    out = {"symbol": symbol, "n": len(vals), "median": q(0.5), "p25": q(0.25), "p75": q(0.75), "min": vals[0], "per": per}
    _SL_CACHE[key] = out
    return out


# ---------------- REPLAY (2026-11-14) ----------------
# Bougies passées d'une paire pour le replay : relues dans l'historique gardé sur le disque du scanner-server (une
# tranche n'est payée qu'une fois, au premier qui la demande, puis servie gratuitement à tout le monde). Une requête =
# une fenêtre bornée (≤ 6 000 bougies) : le navigateur charge la suite au fur et à mesure que le replay avance.
REPLAY_TF_MS = {"1": 60000, "5": 300000, "15": 900000, "30": 1800000, "60": 3600000, "240": 14400000, "D": 86400000}


@app.route("/replay/bars")
def replay_bars():
    user = approved_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    acc = access_of(user)
    if not (user["is_admin"] or is_educator(user) or (acc.get("active") and acc.get("plan") in ("premium", "allstar", "offert"))):
        return jsonify({"error": "Le replay est réservé à CHEST Premium."}), 403
    symbol = re.sub(r"[^A-Z0-9]", "", str(request.args.get("symbol") or "").upper())[:12]
    tf = str(request.args.get("tf") or "15")
    try:
        frm, to = int(request.args.get("from")), int(request.args.get("to"))
    except (TypeError, ValueError):
        return jsonify({"error": "Période invalide."}), 400
    if not symbol or tf not in REPLAY_TF_MS or not (0 < frm < to) or (to - frm) / REPLAY_TF_MS[tf] > 6000:
        return jsonify({"error": "Paramètres invalides."}), 400
    try:
        d = _scanner_call("/history?" + urllib.parse.urlencode({"symbol": symbol, "tf": tf, "from": frm, "to": min(to, int(time.time() * 1000))}))
    except Exception:
        d = None
    if not isinstance(d, dict) or "bars" not in d:
        return jsonify({"error": "Historique indisponible pour l'instant (budget de données du jour atteint ou paire inconnue)."}), 503
    return jsonify({"symbol": symbol, "tf": tf, "bars": d["bars"]})


@app.route("/replay/scan")
def replay_scan():
    """Scanner du replay : calculé sur les bougies passées jusqu'au curseur seulement (Premium, éducateur, admin)."""
    user = approved_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    acc = access_of(user)
    if not (user["is_admin"] or is_educator(user) or (acc.get("active") and acc.get("plan") in ("premium", "allstar", "offert"))):
        return jsonify({"error": "Le replay est réservé à CHEST Premium."}), 403
    q = {k: str(request.args.get(k) or "") for k in ("script", "symbol", "tf", "to", "n")}
    if not re.fullmatch(r"[a-z0-9_-]{1,32}", q["script"]) or q["tf"] not in REPLAY_TF_MS or not q["to"].isdigit():
        return jsonify({"error": "Paramètres invalides."}), 400
    try:
        d = _scanner_call("/replay-scan?" + urllib.parse.urlencode({k: v for k, v in q.items() if v}))
    except Exception:
        d = None
    if not isinstance(d, dict) or "models" not in d:
        return jsonify({"error": "Scanner indisponible pour l'instant."}), 503
    return jsonify(d)


@app.route("/market/sl-estimate", methods=["POST"])
def market_sl_estimate():
    """{symbol, shift, trades:[{t, c, result, r}]} → taille des SL estimée (en $ de mouvement, et en ticks de 0,01)."""
    if not approved_user():
        return jsonify({"error": "Non connecté."}), 401
    b = request.get_json(silent=True) or {}
    symbol = re.sub(r"[^A-Z]", "", str(b.get("symbol") or "XAUUSD").upper())[:6] or "XAUUSD"
    try:
        shift = max(-24.0, min(24.0, float(b.get("shift") or 0)))
        trades = [{"t": int(x["t"]), "c": int(x.get("c") or x["t"]), "result": str(x.get("result") or "")[:4],
                   "r": (float(x["r"]) if x.get("r") not in (None, "") else None)} for x in (b.get("trades") or [])[:3000]]
    except (TypeError, ValueError, KeyError):
        return jsonify({"error": "Positions invalides."}), 400
    trades = [t for t in trades if t["t"] > 1262304000000]
    if len(trades) < 5:
        return jsonify({"error": "Pas assez de positions datées pour estimer les SL."}), 400
    try:
        out = _sl_estimate(symbol, trades, shift)
    except Exception as e:
        return jsonify({"error": f"Estimation impossible : {e}"}), 503
    tick = 0.01 if symbol.startswith("XAU") else (0.001 if symbol.endswith("JPY") else 0.00001)
    return jsonify({**out, "tick": tick, "medianTicks": round(out["median"] / tick)})


_BERICH_BARS = {"at": 0, "body": None}


@app.route("/berich/candles")
def berich_candles():
    """Bougies M15 de XAU/USD (2026-11-09 : M5 trop plates) pour le mini-graphique de la position BERICH (cache partagé 60 s, puis scanner-server)."""
    if not approved_user():
        return jsonify({"error": "Non connecté."}), 401
    if not SCANNER_SERVER_URL:
        return jsonify({"error": "Service de calcul non configuré."}), 503
    if _BERICH_BARS["body"] is None or time.time() - _BERICH_BARS["at"] > 60:
        try:
            url = SCANNER_SERVER_URL.rstrip("/") + "/bars?" + urllib.parse.urlencode({"symbol": "XAUUSD", "tf": "15", "n": 300})
            with urllib.request.urlopen(url, timeout=30) as resp:
                _BERICH_BARS.update(at=time.time(), body=resp.read())
        except Exception:
            if _BERICH_BARS["body"] is None:
                return jsonify({"error": "Bougies indisponibles."}), 503
    return app.response_class(_BERICH_BARS["body"], mimetype="application/json")


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


def _last_price(symbol):
    """Dernière bougie M5 connue du scanner-server pour ce symbole : (clôture, [(temps ms, haut, bas)])."""
    d = _scanner_call("/bars?" + urllib.parse.urlencode({"symbol": symbol, "tf": "5", "n": 24})) or {}
    bars = d.get("bars") or []
    return (bars[-1][4] if bars else None), [(b[0], b[2], b[3]) for b in bars]


def _price_alert_out(r):
    return {"id": r["id"], "symbol": r["symbol"], "price": r["price"], "dir": r["dir"], "createdAt": r["created_at"], "firedAt": r["fired_at"]}


@app.route("/alerts/prices", methods=["GET", "POST"])
def price_alerts():
    user = approved_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    db = get_db()
    if request.method == "POST":
        b = request.get_json(silent=True) or {}
        sym = re.sub(r"[^A-Z0-9]", "", str(b.get("symbol") or "").upper())[:12]
        try:
            price = float(str(b.get("price")).replace(",", ".").replace(" ", ""))
        except (TypeError, ValueError):
            return jsonify({"error": "Prix invalide."}), 400
        if not sym or not (price > 0):
            return jsonify({"error": "Symbole ou prix invalide."}), 400
        if db.execute("SELECT COUNT(*) FROM price_alerts WHERE user_id = ? AND fired_at IS NULL", (user["id"],)).fetchone()[0] >= 30:
            return jsonify({"error": "30 alertes actives au maximum."}), 400
        try:
            last, _ = _last_price(sym)
        except Exception:
            last = None
        cur = b.get("current")
        try:
            cur = float(cur) if cur is not None else last
        except (TypeError, ValueError):
            cur = last
        direction = "up" if cur is None or price >= cur else "down"
        with db_lock:
            db.execute("INSERT INTO price_alerts (user_id, symbol, price, dir, created_at) VALUES (?, ?, ?, ?, ?)",
                       (user["id"], sym, price, direction, datetime.now(timezone.utc).isoformat()))
            db.commit()
    rows = db.execute("SELECT * FROM price_alerts WHERE user_id = ? AND fired_at IS NULL ORDER BY symbol, price", (user["id"],)).fetchall()
    return jsonify({"alerts": [_price_alert_out(r) for r in rows]})


@app.route("/alerts/prices/<int:aid>", methods=["DELETE", "POST"])
def price_alert_delete(aid):
    user = approved_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    db = get_db()
    with db_lock:
        db.execute("DELETE FROM price_alerts WHERE id = ? AND user_id = ?", (aid, user["id"]))
        db.commit()
    rows = db.execute("SELECT * FROM price_alerts WHERE user_id = ? AND fired_at IS NULL ORDER BY symbol, price", (user["id"],)).fetchall()
    return jsonify({"alerts": [_price_alert_out(r) for r in rows]})


def price_alert_loop():
    """Toutes les minutes : une seule lecture de bougies par symbole surveillé (cache du scanner-server),
    une alerte part quand une bougie posée après sa création touche son prix."""
    while True:
        try:
            with app.app_context():
                if get_ops().get("mode") != "off":
                    db = get_db()
                    rows = db.execute("SELECT * FROM price_alerts WHERE fired_at IS NULL").fetchall()
                    for sym in sorted({r["symbol"] for r in rows}):
                        try:
                            _, bars = _last_price(sym)
                        except Exception:
                            continue
                        for r in [x for x in rows if x["symbol"] == sym]:
                            since = _when(r["created_at"]).timestamp() * 1000 - 300000
                            hit = any(t >= since and ((r["dir"] == "up" and hi >= r["price"]) or (r["dir"] == "down" and lo <= r["price"])) for t, hi, lo in bars)
                            if not hit:
                                continue
                            now = datetime.now(timezone.utc).isoformat()
                            with db_lock:
                                db.execute("UPDATE price_alerts SET fired_at = ? WHERE id = ?", (now, r["id"]))
                                db.commit()
                            txt = f"{sym} a touché {r['price']:g}"
                            try:
                                send_push_to_user(r["user_id"], f"Alerte {sym}", txt, f"/strategies?symbol={sym}")
                            except Exception as e:
                                print(f"[alertes prix] push impossible : {e}", flush=True)
        except Exception:
            import traceback
            traceback.print_exc()
        time.sleep(60)


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
    scanners = [sc for sc in (body.get("scanners") or []) if sc in ALERT_SCANNERS or sc in ALERT_ALGOS]
    real = [sc for sc in scanners if sc in ALERT_SCANNERS]
    if not scanners:
        return jsonify({"error": "Choisis au moins un scanner ou BERICH."}), 400
    if real and (not pairs or not tfs):
        return jsonify({"error": "Pour un scanner, choisis au moins une paire et une unité de temps."}), 400
    if not real:
        pairs, tfs = [], []  # BERICH seul : ni paire ni unité de temps
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
        _watch_sync()
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
    try:
        _watch_sync()
    except Exception:
        pass
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


@app.route("/alerts/latest")
def alerts_latest():
    """Dashboard (2026-11-10) : le dernier signal de CHAQUE scanner activé dans les règles du membre (toutes ses
    paires / unités de temps), plutôt que les 4 derniers signaux de 4 combinaisons seulement."""
    user = approved_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    rows = get_db().execute("SELECT pairs, timeframes, scanners FROM alert_rules WHERE user_id = ?", (user["id"],)).fetchall()
    want = {}  # scanner -> set((paire, ut)) ; vide = toutes
    for r in rows:
        try:
            pairs, tfs = json.loads(r["pairs"] or "[]"), json.loads(r["timeframes"] or "[]")
            scs = [s for s in json.loads(r["scanners"] or "[]") if s in ALERT_SCANNERS]
        except (TypeError, ValueError):
            continue
        for sc in scs:
            want.setdefault(sc, set()).update((p, t) for p in pairs for t in tfs)
    out = []
    for sc, combos in want.items():
        try:
            trades = (_scanner_call("/recent?" + urllib.parse.urlencode({"scanner": sc, "limit": 30})) or {}).get("trades", [])
        except Exception:
            trades = []
        mine = [t for t in trades if not combos or (t.get("symbol"), str(t.get("tf"))) in combos]
        if mine:
            out.append(max(mine, key=lambda t: t.get("time") or 0))
    out.sort(key=lambda t: t.get("time") or 0, reverse=True)
    return jsonify({"signals": out, "scanners": sorted(want)})


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
        "SELECT id, label, created_at, last_push_at, berich_seen_at FROM vps_accounts WHERE user_id = ? ORDER BY created_at DESC",
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


# BERICH en automatique sur le VPS (2026-11-09) : l'EA CHEST_BERICH.mq5 du membre lit ici, avec son identifiant
# (le même que CHESTAccountPush, 32 hex = le secret, sans session), les ordres à passer : les signaux ouverts des
# algorithmes de SON plan, chacun avec le risque du plan (réduit après N stops d'affilée de cet algorithme, comme le
# moteur du quiz), et les positions à fermer (clôture « BE » de BERICH II). Format texte, une ligne par instruction,
# pour un EA sans analyseur JSON : « PLAN|nom », « OPEN|id|algo|BUY|entrée|sl|tp|risque% », « CLOSE|id ».
_BR_SIG = {"at": 0.0, "data": None}


def _berich_signals_cached():
    if time.time() - _BR_SIG["at"] > 8 or _BR_SIG["data"] is None:
        try:
            with urllib.request.urlopen(BERICH_SIGNALS_URL, timeout=8) as resp:
                _BR_SIG["data"] = json.loads(resp.read().decode("utf-8")).get("signals", [])
            _BR_SIG["at"] = time.time()
        except Exception:
            if _BR_SIG["data"] is None:
                return []
    return _BR_SIG["data"] or []


def _berich_orders(db, user_id):
    r = db.execute("SELECT * FROM berich_plans WHERE user_id = ?", (user_id,)).fetchone()
    if not r:
        return None, []
    plan = json.loads(r["data"])
    legs = plan.get("legs") if isinstance(plan.get("legs"), list) and plan.get("legs") else [{"algo": plan.get("algo"), "cfg": plan.get("cfg")}]
    legs = [l for l in legs if isinstance(l, dict) and l.get("algo") and isinstance(l.get("cfg"), dict)]
    sigs = _berich_signals_cached()
    since = r["updated_at"] or ""
    out = []
    for leg in legs:
        algo, cfg = str(leg["algo"]), leg["cfg"]
        mine = [x for x in sigs if (x.get("algo") or "berich1") == algo]  # du plus récent au plus ancien
        streak = 0
        for x in mine:
            if x.get("status") != "closed":
                continue
            if x.get("result") == "SL":
                streak += 1
            else:
                break
        try:
            risk = float(cfg.get("risk") or 0)
            if cfg.get("afterSl") and streak >= int(cfg["afterSl"]) and cfg.get("newRisk") is not None:
                risk = float(cfg["newRisk"])
        except (TypeError, ValueError):
            continue
        for x in mine:
            # seulement les signaux nés après l'enregistrement du plan : l'EA ne rattrape jamais un vieux signal
            if str(x.get("time") or "") < since:
                continue
            if x.get("status") != "closed":
                if risk > 0:  # risque 0 = pause après N stops (2026-11-14) : le robot ne prend pas le signal
                    out.append(("OPEN", x, algo, risk))
            elif x.get("result") == "BE":
                out.append(("CLOSE", x, algo, risk))
    return plan, out


@app.route("/vps/berich/<vid>")
def vps_berich(vid):
    db = get_db()
    row = db.execute("SELECT id, user_id FROM vps_accounts WHERE id = ?", (vid,)).fetchone()
    if not row:
        return ("ERROR|Identifiant inconnu\n", 404, {"Content-Type": "text/plain; charset=utf-8"})
    user = db.execute("SELECT * FROM users WHERE id = ?", (row["user_id"],)).fetchone()
    if not user or not (user["is_admin"] or is_educator(user) or access_of(user).get("berich")):
        return ("ERROR|BERICH n'est pas inclus dans ton offre\n", 403, {"Content-Type": "text/plain; charset=utf-8"})
    plan, orders = _berich_orders(db, user["id"])
    if not plan:
        return ("ERROR|Pas encore de plan : fais le questionnaire sur la page BERICH\n", 200, {"Content-Type": "text/plain; charset=utf-8"})
    names = {"berich1": "BERICH I", "berich2": "BERICH II"}
    lines = ["PLAN|" + " + ".join(names.get(str(l.get("algo")), str(l.get("algo"))) for l in (plan.get("legs") or [plan]) if isinstance(l, dict))]
    for kind, x, algo, risk in orders:
        if kind == "OPEN":
            lines.append(f"OPEN|{x.get('id')}|{algo}|{'SELL' if x.get('side') == 'sell' else 'BUY'}|{x.get('entry')}|{x.get('sl')}|{x.get('tp')}|{risk:g}")
        else:
            lines.append(f"CLOSE|{x.get('id')}")
    with db_lock:
        db.execute("UPDATE vps_accounts SET berich_seen_at = ? WHERE id = ?", (datetime.now(timezone.utc).isoformat(), vid))
        db.commit()
    return ("\n".join(lines) + "\n", 200, {"Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store"})


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
    # Versions (2026-11-04) : l'appareil dit quelle version de chaque clé il a déjà (`have` = {clé: updated_at}) ;
    # seules les clés changées depuis repartent. Sans ça, chaque page retéléchargeait tout (jusqu'à des dizaines de Mo).
    try:
        have = json.loads(request.args.get("have") or "{}")
        have = have if isinstance(have, dict) else {}
    except ValueError:
        have = {}
    rows = db.execute("SELECT key, value, updated_at FROM user_data WHERE user_id = ?", (user["id"],)).fetchall()
    out, stamps = {}, {}
    for r in rows:
        stamps[r["key"]] = r["updated_at"]
        if have.get(r["key"]) == r["updated_at"]:
            continue
        v = ud_get(r["value"])
        if v is not None:  # bucket muet : la clé est omise, l'appareil garde sa copie locale
            out[r["key"]] = v
    return jsonify({"data": out, "stamps": stamps})


HISTORY_KEEP = 30
_EMPTY_VALUES = ("", "[]", "{}", "null", '""')


def _keep_history(db, user_id, key, new_value, now):
    """Garde la valeur actuelle avant qu'elle soit remplacée (si elle a du contenu et qu'elle change)."""
    old = db.execute("SELECT value FROM user_data WHERE user_id = ? AND key = ?", (user_id, key)).fetchone()
    if not old or old["value"] == new_value or (old["value"] or "").strip() in _EMPTY_VALUES:
        return
    db.execute("INSERT INTO user_data_history (user_id, key, value, saved_at) VALUES (?, ?, ?, ?)",
               (user_id, key, old["value"], now))
    keep = "SELECT id FROM user_data_history WHERE user_id = ? AND key = ? ORDER BY id DESC LIMIT ?"
    gone = [r[0] for r in db.execute(f"SELECT value FROM user_data_history WHERE user_id = ? AND key = ? AND id NOT IN ({keep})",
                                     (user_id, key, user_id, key, HISTORY_KEEP)).fetchall()]
    db.execute(f"DELETE FROM user_data_history WHERE user_id = ? AND key = ? AND id NOT IN ({keep})",
               (user_id, key, user_id, key, HISTORY_KEEP))
    for v in gone:
        ud_forget(db, v)


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
        "current": {"items": _items_of(ud_get(cur["value"])), "updatedAt": cur["updated_at"]} if cur else None,
        "versions": [{"id": r["id"], "savedAt": r["saved_at"], "items": _items_of(ud_get(r["value"])), "size": ud_size(r["value"])} for r in rows],
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
    value = ud_get(row["value"])
    if value is None:
        return jsonify({"error": "Sauvegarde momentanément illisible, réessaie dans un instant."}), 503
    return jsonify({"key": row["key"], "value": value})


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
    items = {k: v for k, v in data.items() if isinstance(k, str) and isinstance(v, str) and len(k) <= 128}
    # Envoi au bucket hors du verrou (réseau) ; la base ne reçoit que la référence.
    stored = {k: ud_put(user["id"], v) for k, v in items.items()}
    db = get_db()
    # Seule limite : l'espace du membre (fichiers + données). Refus seulement si l'envoi fait grossir le total de
    # plus de 64 Ko (un réglage ou une petite note passent toujours, même plein).
    st = storage_info(db, user)
    olds = {r["key"]: ud_size(r["value"]) for r in db.execute("SELECT key, value FROM user_data WHERE user_id = ?", (user["id"],)).fetchall()}
    grow = sum(ud_size(v) - olds.get(k, 0) for k, v in stored.items())
    if grow > 64 * 1024 and st["used"] + grow > st["quota"]:
        for v in stored.values():
            ud_forget(db, v)
        return jsonify({"error": f"Espace de stockage plein : {_gb(st['used'])} utilisés sur {_gb(st['quota'])}.", "storageFull": True}), 413
    with db_lock:
        for key, value in stored.items():
            _keep_history(db, user["id"], key, value, now)
            old = db.execute("SELECT value FROM user_data WHERE user_id = ? AND key = ?", (user["id"], key)).fetchone()
            db.execute(
                "INSERT INTO user_data (user_id, key, value, updated_at) VALUES (?, ?, ?, ?) "
                "ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
                (user["id"], key, value, now),
            )
            if old and old["value"] != value:
                ud_forget(db, old["value"])  # gardée en sauvegarde si elle avait du contenu, sinon effacée
        db.commit()
    return jsonify({"ok": True, "stamp": now})


# ---------------------------------------------------------------- Backtests un par un (2026-11-04)
_BT_ID = re.compile(r"[A-Za-z0-9_.-]{1,80}")


def _bt_user():
    user = approved_user()
    if not user:
        return None, (jsonify({"error": "Non connecté."}), 401)
    if not access_of(user)["sync"]:
        return None, (jsonify({"error": "Pendant l'essai, tes backtests restent sur ton appareil.", "local": True}), 403)
    return user, None


def _bt_migrate_legacy(db, user_id):
    """Ancien bloc chest_backtests (user_data) : chaque backtest absent de la table y est ajouté, puis le bloc est
    retiré (il reste dans les sauvegardes du membre)."""
    row = db.execute("SELECT value FROM user_data WHERE user_id = ? AND key = 'chest_backtests'", (user_id,)).fetchone()
    if not row:
        return
    try:
        items = json.loads(ud_get(row["value"]) or "[]")
    except (TypeError, ValueError):
        return
    now = datetime.now(timezone.utc).isoformat()
    have = {r[0] for r in db.execute("SELECT id FROM user_backtests WHERE user_id = ?", (user_id,)).fetchall()}
    for it in items if isinstance(items, list) else []:
        bid = str((it or {}).get("id") or "")
        if not _BT_ID.fullmatch(bid) or bid in have:
            continue
        raw = json.dumps(it, ensure_ascii=False, separators=(",", ":"))
        db.execute("INSERT OR IGNORE INTO user_backtests (user_id, id, value, size, updated_at) VALUES (?, ?, ?, ?, ?)",
                   (user_id, bid, ud_put(user_id, raw), len(raw.encode("utf-8")), now))
    _keep_history(db, user_id, "chest_backtests", "", now)
    db.execute("DELETE FROM user_data WHERE user_id = ? AND key = 'chest_backtests'", (user_id,))
    db.commit()


@app.route("/btstore")
def btstore_list():
    user, err = _bt_user()
    if err:
        return err
    db = get_db()
    with db_lock:
        _bt_migrate_legacy(db, user["id"])
    rows = db.execute("SELECT id, size, updated_at FROM user_backtests WHERE user_id = ?", (user["id"],)).fetchall()
    return jsonify({"items": [{"id": r["id"], "size": r["size"], "updatedAt": r["updated_at"]} for r in rows]})


@app.route("/btstore/<bid>", methods=["GET", "PUT", "DELETE"])
def btstore_item(bid):
    user, err = _bt_user()
    if err:
        return err
    if not _BT_ID.fullmatch(bid):
        return jsonify({"error": "Identifiant invalide."}), 400
    db = get_db()
    row = db.execute("SELECT value, size, updated_at FROM user_backtests WHERE user_id = ? AND id = ?", (user["id"], bid)).fetchone()
    if request.method == "GET":
        if not row:
            return jsonify({"error": "Backtest introuvable."}), 404
        value = ud_get(row["value"])
        if value is None:
            return jsonify({"error": "Backtest momentanément illisible, réessaie."}), 503
        resp = app.response_class(value, mimetype="application/json")
        resp.headers["X-Updated-At"] = row["updated_at"]
        return resp
    if request.method == "DELETE":
        if row:
            with db_lock:
                db.execute("DELETE FROM user_backtests WHERE user_id = ? AND id = ?", (user["id"], bid))
                db.commit()
                ud_forget(db, row["value"])
        return jsonify({"ok": True})
    raw = request.get_data(as_text=True) or ""
    try:
        obj = json.loads(raw)
    except ValueError:
        return jsonify({"error": "Backtest illisible."}), 400
    if not isinstance(obj, dict) or str(obj.get("id")) != bid:
        return jsonify({"error": "Backtest illisible."}), 400
    size = len(raw.encode("utf-8"))
    st = storage_info(db, user)
    grow = size - (row["size"] if row else 0)
    if grow > 64 * 1024 and st["used"] + grow > st["quota"]:
        return jsonify({"error": f"Espace de stockage plein : {_gb(st['used'])} utilisés sur {_gb(st['quota'])}.", "storageFull": True}), 413
    stored = ud_put(user["id"], raw)
    now = datetime.now(timezone.utc).isoformat()
    with db_lock:
        db.execute("INSERT INTO user_backtests (user_id, id, value, size, updated_at) VALUES (?, ?, ?, ?, ?) "
                   "ON CONFLICT(user_id, id) DO UPDATE SET value = excluded.value, size = excluded.size, updated_at = excluded.updated_at",
                   (user["id"], bid, stored, size, now))
        db.commit()
        if row and row["value"] != stored:
            ud_forget(db, row["value"])
    return jsonify({"ok": True, "updatedAt": now})


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


@app.route("/push/rotate", methods=["POST"])
def push_rotate():
    # Appelé par le service worker (sw.js, pushsubscriptionchange) quand le navigateur renouvelle l'abonnement :
    # pas de session possible là-bas. On ne fait que REMPLACER un abonnement déjà enregistré, retrouvé par son
    # ancienne adresse (une URL longue et secrète, connue du seul appareil) ; le membre reste le même.
    ip = _client_ip()
    if too_many("push-rotate:" + ip, 20, 3600):
        return jsonify({"error": TOO_MANY}), 429
    hit("push-rotate:" + ip)
    body = request.get_json(silent=True) or {}
    old = body.get("oldEndpoint")
    sub = body.get("subscription") or {}
    keys = sub.get("keys") or {}
    endpoint, p256dh, auth = sub.get("endpoint"), keys.get("p256dh"), keys.get("auth")
    if not old or not endpoint or not p256dh or not auth:
        return jsonify({"error": "Abonnement incomplet."}), 400
    with db_lock:
        db = get_db()
        row = db.execute("SELECT user_id FROM push_subscriptions WHERE endpoint = ?", (old,)).fetchone()
        if not row:
            return jsonify({"error": "Abonnement inconnu."}), 404
        db.execute("DELETE FROM push_subscriptions WHERE endpoint = ?", (old,))
        db.execute(
            "INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?) "
            "ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth",
            (row["user_id"], endpoint, p256dh, auth, datetime.now(timezone.utc).isoformat()),
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


def _send_push_to_subscriptions(subs, title, body_text, url=None, icon=None, table="push_subscriptions", tag=None):
    """Envoie a une liste de lignes push_subscriptions (deja chargees) ; retire tout abonnement
    expire/invalide (410 Gone, cas normal quand un navigateur se desinscrit sans le dire) plutot
    que de re-essayer indefiniment dessus."""
    if not VAPID_PRIVATE_KEY:
        return {"sent": 0, "error": "VAPID_PRIVATE_KEY non configurée côté serveur."}
    payload = json.dumps({"title": title, "body": body_text, "url": url or "/dashboard", "icon": icon, **({"tag": tag} if tag else {})})
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
                # BUG RÉEL (2026-11-04, « envoyée depuis mon PC, rien sur le téléphone ») : sans ttl, pywebpush envoie
                # TTL: 0 = « à livrer tout de suite ou à jeter ». Un téléphone en veille n'est pas joignable à cet
                # instant : Apple et Google jetaient le message. Gardé 12 h par le service de push, et marqué urgent
                # pour réveiller l'appareil (sinon Android peut le retenir jusqu'à la sortie de veille).
                ttl=12 * 3600,
                headers={"Urgency": "high"},
                timeout=15,
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
            get_db().executemany(f"DELETE FROM {'hq_devices' if table == 'hq_devices' else 'push_subscriptions'} WHERE endpoint = ?", [(e,) for e in dead])
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
    "report_weekly", "report_monthly", "new_member", "school_new", "school_remind", "school_updates",
)
NOTIF_PREFS_KEY = "chest_notif_prefs"
BERICH_SIGNALS_URL = os.environ.get("BERICH_SIGNALS_URL", "https://berich-bridge-production.up.railway.app/signals")


def _user_json(db, user_id, key, default):
    row = db.execute("SELECT value FROM user_data WHERE user_id = ? AND key = ?", (user_id, key)).fetchone()
    if not row:
        return default
    try:
        val = json.loads(ud_get(row["value"]))
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


def _berich_rule_alerts(ntype, event):
    """Notification « scanner » aux membres qui ont coché BERICH I / II dans leurs alertes. Renvoie leurs ids (ils ne
    reçoivent pas en plus le message de position habituel)."""
    algo = event.get("algo") or "berich1"
    if algo not in ALERT_ALGOS:
        return set()
    name, logo = ALERT_ALGOS[algo]
    side = str(event.get("side") or "").upper()
    symbol = str(event.get("symbol") or "")
    if ntype == "position_open":
        if side not in ("BUY", "SELL"):
            return set()
        body_text = f"{'📈' if side == 'BUY' else '📉'} {side} sur {symbol}"
    else:
        result = event.get("result")
        if result not in ("TP", "SL", "BE"):
            return set()
        r = _signal_rr(event) if result == "TP" else -1.0 if result == "SL" else 0.0
        body_text = {"TP": f"TP✔️ +{r:g}R", "SL": "SL❌ -1R", "BE": "BE ➖ 0R"}[result] + f" sur {symbol}"
    db = get_db()
    done = set()
    for rule in db.execute("SELECT * FROM alert_rules").fetchall():
        if algo not in json.loads(rule["scanners"]) or rule["user_id"] in done:
            continue
        subs = db.execute("SELECT * FROM push_subscriptions WHERE user_id = ?", (rule["user_id"],)).fetchall()
        if not subs:
            continue
        _send_push_to_subscriptions(subs, name, body_text, url="/berich", icon=f"{SITE_URL}/{logo}")
        done.add(rule["user_id"])
    return done


def _render_position_close(db, user_id, prefs, event):
    result = event.get("result")
    if result == "BE":  # sortie à break-even (BERICH II) : jusqu'ici aucune notification
        return f"{_family_name(db, user_id)} - BE ➖ 0"
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
    if ntype in ("position_open", "position_close") and event:
        alerted = _berich_rule_alerts(ntype, event)
        render = _render_position_open if ntype == "position_open" else _render_position_close
        res = send_typed_push(ntype, url, lambda db, uid, p: None if uid in alerted else render(db, uid, p, event))
        res["alerted"] = len(alerted)
        return jsonify(res)
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


_PUSH_TEST_LAST = {}


@app.route("/push/test", methods=["POST"])
def push_test():
    # Chaque membre peut s'envoyer une notification de test sur SES appareils (Compte → Notifications), 2026-11-04.
    user = approved_user()
    if not user:
        return jsonify({"error": "Non connecté."}), 401
    now = time.time()
    if now - _PUSH_TEST_LAST.get(user["id"], 0) < 20:
        return jsonify({"error": "Patiente quelques secondes avant un nouveau test."}), 429
    _PUSH_TEST_LAST[user["id"]] = now
    result = send_push_to_user(user["id"], "Notifications activées", "Cet appareil reçoit bien les alertes CHEST.", "/account")
    if not result.get("sent"):
        result.setdefault("error", "Aucun appareil enregistré pour ce compte : active les notifications sur cet appareil.")
        return jsonify(result), 400
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


def rank_v4_migrate():
    """Une seule fois : rangs v3 (I = 3 mois, II = 6, III = 1 an, IV = 1 mois) → v4 (I = 1 mois … IV = 1 an).
    Renumérote les offres de l'éditeur Prix (clé, niveau, durée, nom), les rangs des membres et les paiements
    crypto en attente."""
    with sqlite3.connect(DB_PATH) as db:
        db.row_factory = sqlite3.Row
        done = db.execute("SELECT value FROM site_settings WHERE key = 'rank_order'").fetchone()
        if done and done["value"] == "v4":
            return
        row = db.execute("SELECT value FROM site_settings WHERE key = 'pricing'").fetchone()
        try:
            data = json.loads(row["value"]) if row and row["value"] else None
        except ValueError:
            data = None
        if isinstance(data, dict) and isinstance(data.get("offers"), list):
            by = {}
            for o in data["offers"]:
                if not isinstance(o, dict) or not re.fullmatch(r"(essentiel|premium)[1-4]", str(o.get("key") or "")):
                    continue
                g, old = o["key"][:-1], int(o["key"][-1])
                new = RANK_V4[old]
                o = dict(o, key=f"{g}{new}", level=new, months=LEVEL_MONTHS[new], featured=(g == "premium" and new == 4))
                o["name"] = re.sub(r"\b(IV|III|II|I)\b\s*$", ROMAN[new], str(o.get("name") or "")) or f"{g.capitalize()} {ROMAN[new]}"
                by[o["key"]] = o
            if all(k in by for k in PRICING_KEYS):
                db.execute("UPDATE site_settings SET value = ? WHERE key = 'pricing'",
                           (json.dumps({**data, "offers": [by[k] for k in PRICING_KEYS]}, ensure_ascii=False),))
        cols = [r[1] for r in db.execute("PRAGMA table_info(users)").fetchall()]
        if "plan_level" in cols:
            db.execute("UPDATE users SET plan_level = CASE plan_level WHEN 1 THEN 2 WHEN 2 THEN 3 WHEN 3 THEN 4 WHEN 4 THEN 1 END "
                       "WHERE plan IN ('essentiel', 'premium') AND plan_level IN (1, 2, 3, 4)")
        try:
            for r in db.execute("SELECT id, offer FROM crypto_payments WHERE status IN ('pending', 'detected')").fetchall():
                m = re.fullmatch(r"(essentiel|premium)([1-4])", r["offer"] or "")
                if m:
                    db.execute("UPDATE crypto_payments SET offer = ? WHERE id = ?", (f"{m.group(1)}{RANK_V4[int(m.group(2))]}", r["id"]))
        except sqlite3.Error:
            pass
        db.execute("INSERT INTO site_settings (key, value) VALUES ('rank_order', 'v4') ON CONFLICT(key) DO UPDATE SET value = 'v4'")
        db.commit()


if __name__ == "__main__":
    init_db()
    rank_v4_migrate()
    threading.Thread(target=digest_loop, daemon=True).start()
    threading.Thread(target=school_reminder_loop, daemon=True).start()
    threading.Thread(target=price_alert_loop, daemon=True).start()
    threading.Thread(target=_watch_sync_later, daemon=True).start()
    threading.Thread(target=railway_usage_loop, daemon=True).start()
    threading.Thread(target=bucket_migrate, daemon=True).start()
    threading.Thread(target=ud_migrate, daemon=True).start()
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
