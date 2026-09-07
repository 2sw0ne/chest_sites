"""
Chesting - calendrier economique, service Railway.

Enveloppe HTTP minimale autour de fetch_calendar.build_calendar_data() :
tourne en continu, relance le scraping une fois par jour en tache de fond,
garde le dernier resultat en memoire et l'expose en lecture sur /calendar.json.

Le reste du site Chesting reste local pour le moment (voir README.md) - ce
service ne fait que remplacer l'execution locale du script, pour que la
fenetre Chrome (necessaire pour passer le blocage anti-bot d'investing.com,
voir fetch_calendar.py) s'ouvre sur un ecran virtuel (Xvfb) que personne ne
voit, plutot que sur l'ecran de l'utilisateur a chaque lancement.

Usage local (Xvfb requis sur Linux/macOS ; sans objet sur Windows, ou le
script local `python fetch_calendar.py` classique reste la bonne option) :
    xvfb-run -a python server.py

Sur Railway, c'est le CMD du Dockerfile qui lance cette commande.
"""

import os
import threading
import time
import traceback

from flask import Flask, jsonify, send_file

import fetch_calendar

REFRESH_SECONDS = int(os.environ.get("CHESTING_CALENDAR_REFRESH_SECONDS", 24 * 3600))

app = Flask(__name__)
state = {"data": None, "error": None}
state_lock = threading.Lock()


def refresh_once():
    try:
        with state_lock:
            previous_events = (state["data"] or {}).get("events", [])
        data = fetch_calendar.build_calendar_data()
        data = fetch_calendar.merge_with_history(data, previous_events)
        with state_lock:
            state["data"] = data
            state["error"] = None
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
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
