"""
CHEST - calendrier economique, service Railway.

Enveloppe HTTP minimale autour de fetch_calendar.build_calendar_data() :
tourne en continu, relance le scraping en tache de fond (voir
REFRESH_SECONDS ci-dessous), garde le dernier resultat en memoire et
l'expose en lecture sur /calendar.json.

Le reste du site CHEST reste local pour le moment (voir README.md) - ce
service ne fait que remplacer l'execution locale du script, pour que la
fenetre Chrome (necessaire pour passer le blocage anti-bot d'investing.com,
voir fetch_calendar.py) s'ouvre sur un ecran virtuel (Xvfb) que personne ne
voit, plutot que sur l'ecran de l'utilisateur a chaque lancement.

Usage local (Xvfb requis sur Linux/macOS ; sans objet sur Windows, ou le
script local `python fetch_calendar.py` classique reste la bonne option) :
    xvfb-run -a python server.py

Sur Railway, c'est le CMD du Dockerfile qui lance cette commande.
"""

import json
import os
import threading
import time
import traceback
import urllib.error
import urllib.request
from datetime import datetime, timedelta

from flask import Flask, jsonify, send_file

import fetch_calendar

# Notifications push (2026-09-26, demande utilisateur : "toute les infos de modification du
# propfirm... 2 pour les annonces calendrier") - meme mecanisme que berich-bridge/server.py
# (notify()) : relayees via accounts-bridge, seul service a avoir les abonnements Web Push et la
# cle VAPID. Secret partage - voir accounts-bridge/server.py, INTERNAL_PUSH_SECRET/POST
# /push/broadcast. Best-effort : ne bloque jamais le refresh si l'envoi echoue.
ACCOUNTS_BRIDGE_URL = os.environ.get("ACCOUNTS_BRIDGE_URL", "")
INTERNAL_PUSH_SECRET = os.environ.get("INTERNAL_PUSH_SECRET", "")


def notify(title: str, body: str) -> None:
    if not ACCOUNTS_BRIDGE_URL or not INTERNAL_PUSH_SECRET:
        return
    try:
        req = urllib.request.Request(
            ACCOUNTS_BRIDGE_URL.rstrip("/") + "/push/broadcast",
            data=json.dumps({"title": title, "body": body, "url": "calendar.html"}).encode("utf-8"),
            headers={"Content-Type": "application/json", "X-Internal-Secret": INTERNAL_PUSH_SECRET},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=5)
    except (urllib.error.URLError, OSError):
        pass  # jamais bloquant

# Persistance de l'historique glissant (merge_with_history) sur le Volume
# Railway attache au service - AJOUTE (2026-09-14, retour direct utilisateur) :
# state["data"] ne vivait qu'en RAM, donc chaque redemarrage/redeploiement du
# conteneur (meme pour un simple bug fix) effacait tout l'historique accumule,
# faisant disparaitre le bilan de "la semaine passee" cote site jusqu'a ce que
# 7 jours se soient re-ecoules. RAILWAY_VOLUME_MOUNT_PATH est defini
# automatiquement par Railway des qu'un Volume est attache au service (voir
# docs.railway.com/reference/volumes) - en local (pas de volume), on retombe
# sur le dossier du script, comme fetch_calendar.py le fait deja pour
# calendar_history.json.
HISTORY_DIR = os.environ.get("RAILWAY_VOLUME_MOUNT_PATH") or os.path.dirname(os.path.abspath(__file__))
HISTORY_FILE = os.path.join(HISTORY_DIR, "calendar_history.json")


def load_persisted_events():
    try:
        with open(HISTORY_FILE, "r", encoding="utf-8") as f:
            return json.load(f).get("events", [])
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return []


def save_persisted_events(data):
    try:
        os.makedirs(HISTORY_DIR, exist_ok=True)
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump({"events": data["events"]}, f, ensure_ascii=False)
    except OSError as exc:
        print(f"Impossible d'ecrire l'historique persistant ({HISTORY_FILE}) : {exc}")

# 2h par defaut. Etait a 30 min (demande explicite de fraicheur), mais le
# service s'est mis a repondre 502 "Application failed to respond" en continu
# juste apres ce changement (2026-09-12) - hypothese la plus probable : Chrome
# via Playwright/Xvfb, relance 48x/jour au lieu de 1x, finit par OOM le
# conteneur Railway (ressources limitees, cause deja rencontree une fois lors
# du deploiement initial - voir README.md). 2h reste bien plus frequent que
# la recommandation initiale (1x/jour) tout en reduisant fortement le risque
# de crash repete. A resserrer de nouveau seulement si le service se montre
# stable ET qu'un vrai suivi memoire est en place cote Railway.
REFRESH_SECONDS = int(os.environ.get("CHEST_CALENDAR_REFRESH_SECONDS", 2 * 3600))

app = Flask(__name__)
state = {"data": None, "error": None}
state_lock = threading.Lock()


def last_completed_week_bounds():
    """Lundi/dimanche de la derniere semaine ENTIEREMENT terminee, cote
    serveur (heure de Paris) - reprend la meme convention que le site
    (js/calendar.js, isForexMarketClosedNow/tradingWeekReference) : le
    week-end, la semaine qui s'acheve aujourd'hui compte deja comme
    terminee ; sinon c'est la semaine precedente."""
    now = datetime.now(fetch_calendar.PARIS_TZ)
    today = now.date()
    monday = today - timedelta(days=today.weekday())
    market_closed = today.weekday() == 5 or (today.weekday() == 6 and now.hour < 22)
    past_monday = monday if market_closed else monday - timedelta(days=7)
    return past_monday, past_monday + timedelta(days=6)


def ensure_last_week_backfilled(data):
    """Garantit que la derniere semaine terminee est presente dans
    data["events"], independamment de ce que merge_with_history a accumule -
    retour direct utilisateur (2026-09-14) : sans ca, un historique remis a
    zero (redemarrage, nouveau Volume...) laisse "Resultats de la semaine
    passee" vide cote site jusqu'a ce qu'une semaine entiere se re-ecoule.
    Ne scrape QUE si necessaire (semaine deja absente) - pas a chaque refresh,
    pour ne pas doubler la charge Playwright toutes les 2h."""
    past_monday, past_sunday = last_completed_week_bounds()
    have_dates = {e["date"] for e in data["events"] if e.get("date")}
    target_dates = {(past_monday + timedelta(days=i)).isoformat() for i in range(7)}
    if target_dates & have_dates:
        return data  # au moins un jour de cette semaine est deja connu - rien a faire
    print(f"Semaine du {past_monday} au {past_sunday} absente de l'historique — backfill investing.com...")
    backfilled = fetch_calendar.fetch_investing_date_range(past_monday, past_sunday)
    if not backfilled:
        print("Backfill de la semaine passee indisponible pour l'instant (reessaiera au prochain refresh).")
        return data
    by_id = {e["id"]: e for e in data["events"]}
    for e in backfilled:
        by_id.setdefault(e["id"], e)
    data["events"] = sorted(by_id.values(), key=lambda e: (e["date"] or "", e["time"] or ""))
    print(f"Backfill OK — {len(backfilled)} evenements ajoutes pour la semaine du {past_monday}.")
    return data


def refresh_once():
    try:
        with state_lock:
            previous_events = (state["data"] or {}).get("events")
        if previous_events is None:
            # Rien en RAM (premier refresh depuis un (re)demarrage du
            # conteneur) - recharge l'historique persiste sur le Volume au
            # lieu de repartir de zero.
            previous_events = load_persisted_events()
        data = fetch_calendar.build_calendar_data()
        data = fetch_calendar.merge_with_history(data, previous_events)
        data = ensure_last_week_backfilled(data)
        with state_lock:
            state["data"] = data
            state["error"] = None
        save_persisted_events(data)
        print(f"OK — {len(data['events'])} evenements rafraichis")
    except Exception:
        err = traceback.format_exc()
        with state_lock:
            state["error"] = err
        print(f"Echec du rafraichissement :\n{err}")


def refresh_loop():
    while True:
        refresh_once()
        time.sleep(REFRESH_SECONDS)


# Boucle RAPIDE separee de refresh_loop() (2026-09-26) : refresh_loop() re-scrape
# investing.com/tradingeconomics.com toutes les 2h (voir REFRESH_SECONDS ci-dessus, deliberement
# lent - risque d'OOM Railway deja rencontre). Detecter "une annonce a fort impact arrive bientot"
# ne necessite AUCUN nouveau scraping : les evenements et leurs horaires sont deja dans
# state["data"] depuis le dernier refresh. Cette boucle se contente donc de RELIRE cette memoire
# toutes les NOTIFY_CHECK_SECONDS et notifie une fois par evenement, dans une fenetre de
# NOTIFY_WINDOW_MINUTES avant l'heure annoncee.
NOTIFY_CHECK_SECONDS = 60
NOTIFY_WINDOW_MINUTES = 20

notified_event_ids = set()
notified_lock = threading.Lock()


def check_upcoming_high_impact_events():
    with state_lock:
        events = list((state["data"] or {}).get("events") or [])
    now = datetime.now(fetch_calendar.PARIS_TZ)
    for e in events:
        if e.get("importance") != "high":
            continue
        eid = e.get("id")
        if not eid:
            continue
        with notified_lock:
            already = eid in notified_event_ids
        if already:
            continue
        date_str, time_str = e.get("date"), e.get("time")
        if not date_str or not time_str:
            continue
        try:
            when = datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M").replace(tzinfo=fetch_calendar.PARIS_TZ)
        except ValueError:
            continue
        minutes_until = (when - now).total_seconds() / 60
        if 0 <= minutes_until <= NOTIFY_WINDOW_MINUTES:
            country = e.get("country") or ""
            title = e.get("event") or ""
            notify(f"Annonce dans {int(minutes_until)} min", f"{country} — {title}".strip(" —"))
            with notified_lock:
                notified_event_ids.add(eid)


def notify_loop():
    while True:
        try:
            check_upcoming_high_impact_events()
        except Exception:
            traceback.print_exc()
        time.sleep(NOTIFY_CHECK_SECONDS)


@app.route("/calendar.json")
def serve_calendar():
    with state_lock:
        data = state["data"]
    if data is None:
        # Premier demarrage : le tout premier scraping (10-20s, fenetre
        # Chrome sur l'ecran virtuel) n'est pas encore termine.
        return jsonify({"error": "Donnees pas encore disponibles, reessaie dans quelques secondes."}), 503
    resp = jsonify(data)
    # Donnees publiques (calendrier economique), pas de compte trading -
    # CORS ouvert pour que le site local puisse les lire directement.
    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp


@app.route("/health")
def health():
    with state_lock:
        ok = state["data"] is not None
    return jsonify({"ok": ok}), (200 if ok else 503)


@app.route("/debug/screenshot.png")
def debug_screenshot():
    """Capture prise au dernier echec du clic 'Cette Semaine' investing.com -
    voir _save_debug_snapshot() dans fetch_calendar.py. Sert a diagnostiquer
    a distance ce que Railway voit reellement (bandeau different, etc.)."""
    path = os.path.join(fetch_calendar.DEBUG_DIR, "last_failure.png")
    if not os.path.exists(path):
        return jsonify({"error": "Aucun echec capture pour l'instant"}), 404
    return send_file(path, mimetype="image/png")


@app.route("/debug/page.html")
def debug_html():
    path = os.path.join(fetch_calendar.DEBUG_DIR, "last_failure.html")
    if not os.path.exists(path):
        return jsonify({"error": "Aucun echec capture pour l'instant"}), 404
    return send_file(path, mimetype="text/html")


@app.route("/debug/error.txt")
def debug_error():
    path = os.path.join(fetch_calendar.DEBUG_DIR, "last_failure.txt")
    if not os.path.exists(path):
        return jsonify({"error": "Aucun echec capture pour l'instant"}), 404
    return send_file(path, mimetype="text/plain")


if __name__ == "__main__":
    threading.Thread(target=refresh_loop, daemon=True).start()
    threading.Thread(target=notify_loop, daemon=True).start()
    # threaded=False explicite (2026-09-12) : les logs Railway montrent le
    # serveur de dev Werkzeug plantant sur "RuntimeError: can't start new
    # thread" (socketserver.py, ThreadingMixIn.process_request) apres une
    # dizaine d'heures - le conteneur finit par epuiser sa limite de threads
    # OS a force de servir /calendar.json (chaque requete entrante ouvrant un
    # nouveau thread), ce qui bloque ENSUITE toutes les requetes (502
    # "Application failed to respond" cote Railway). En mode non threade, le
    # serveur traite les requetes une par une sur le thread principal - pas
    # de thread supplementaire cree par requete HTTP.
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)), threaded=False)
