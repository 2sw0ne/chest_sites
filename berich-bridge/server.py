"""CHEST · BERICH — récepteur de webhook TradingView (service Railway).

Reçoit les alertes du script Pine "BE FR€E" (alert() sur "Any alert() function
call") et les écrit dans ../site/data/berich-signal.json, que berich.html lit
pour afficher les positions détectées. Voir README.md pour la configuration
de l'alerte côté TradingView.

Le script envoie deux types de message JSON sur le MÊME endpoint, distingués
par la présence ou non de "result" :
  - Ouverture : {"id","pair","signal","entry","sl"}           (pas de tp — RR3 fixe, calculé ici)
  - Clôture   : {"id","result":"TP"|"SL"}                     (même id que l'ouverture)

Distinct de BEFREE (github.com/2sw0ne/BEFREE, service séparé qui relaie les
mêmes alertes vers le bot Telegram) : ici, seul le webhook -> berich.html,
rien à voir avec Telegram (2026-09-23, clarification utilisateur).

Utilisation :
    pip install -r requirements.txt
    python server.py
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

from flask import Flask, jsonify, request

app = Flask(__name__)

# Notifications push (2026-09-26, demande utilisateur : signal detecte + cloture TP/SL avec le
# detail) - relayees via accounts-bridge, seul service a avoir les abonnements Web Push et la cle
# VAPID. Secret partage (jamais de session utilisateur ici, c'est un webhook) - voir
# accounts-bridge/server.py, INTERNAL_PUSH_SECRET/POST /push/broadcast. Best-effort : ne bloque
# jamais l'enregistrement du signal si l'envoi echoue (ex. accounts-bridge injoignable).
ACCOUNTS_BRIDGE_URL = os.environ.get("ACCOUNTS_BRIDGE_URL", "")
INTERNAL_PUSH_SECRET = os.environ.get("INTERNAL_PUSH_SECRET", "")


def notify(title: str, body: str) -> None:
    if not ACCOUNTS_BRIDGE_URL or not INTERNAL_PUSH_SECRET:
        return
    try:
        req = urllib.request.Request(
            ACCOUNTS_BRIDGE_URL.rstrip("/") + "/push/broadcast",
            data=json.dumps({"title": title, "body": body, "url": "berich.html"}).encode("utf-8"),
            headers={"Content-Type": "application/json", "X-Internal-Secret": INTERNAL_PUSH_SECRET},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=5)
    except (urllib.error.URLError, OSError):
        pass  # jamais bloquant - le signal est deja enregistre a ce stade

DATA_FILE = Path(__file__).resolve().parent.parent / "site" / "data" / "berich-signal.json"
MAX_SIGNALS = 50
RR = 3.0  # verrouillé dans le script Pine — voir "Money management verrouillé"


def _load() -> dict:
    if not DATA_FILE.exists():
        return {"example": False, "updatedAt": None, "signals": []}
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))


def _save(data: dict) -> None:
    # Le conteneur Railway ne contient QUE ce dossier (Dockerfile ne copie pas
    # site/) - ../site/data/ n'existe donc pas au premier demarrage, meme
    # motif deja verifie en production sur calendar-bridge/fetch_calendar.py.
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def _compute_tp(signal: str, entry: float, sl: float) -> float:
    risk = abs(entry - sl)
    tp = entry + RR * risk if signal == "BUY" else entry - RR * risk
    return round(tp, 5)


@app.post("/webhook")
def webhook():
    payload = request.get_json(force=True, silent=True) or {}
    if "id" not in payload:
        return jsonify({"error": "champ manquant: id"}), 400

    data = _load()
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    # ---- Message de clôture : {"id","result":"TP"|"SL"} ----
    if "result" in payload:
        if payload["result"] not in ("TP", "SL"):
            return jsonify({"error": "result doit être 'TP' ou 'SL'"}), 400
        match = next((s for s in data.get("signals", []) if s["id"] == payload["id"]), None)
        if match is None:
            return jsonify({"error": f"aucun signal ouvert avec id={payload['id']}"}), 404
        match["status"] = "closed"
        match["result"] = payload["result"]
        match["closedAt"] = now
        data["example"] = False
        data["updatedAt"] = now
        _save(data)
        if payload["result"] == "TP":
            notify("TP touché — BERICH", f"{match['symbol']} ({match['side']}) : sortie à {match['tp']} (+{RR:g}R).")
        else:
            notify("SL touché — BERICH", f"{match['symbol']} ({match['side']}) : sortie à {match['sl']} (-1R).")
        return jsonify({"ok": True, "id": payload["id"], "closed": True})

    # ---- Message d'ouverture : {"id","pair","signal","entry","sl"} ----
    required = ("pair", "signal", "entry", "sl")
    missing = [k for k in required if k not in payload]
    if missing:
        return jsonify({"error": f"champs manquants: {', '.join(missing)}"}), 400
    if payload["signal"] not in ("BUY", "SELL"):
        return jsonify({"error": "signal doit être 'BUY' ou 'SELL'"}), 400

    signal = {
        "id": payload["id"],
        "scanner": "BE FR€E",
        "symbol": payload["pair"],
        "side": payload["signal"].lower(),
        "entry": payload["entry"],
        "sl": payload["sl"],
        "tp": _compute_tp(payload["signal"], payload["entry"], payload["sl"]),
        "time": now,
        "status": "open",
    }
    data["example"] = False
    data["updatedAt"] = now
    data["signals"] = [signal] + data.get("signals", [])[: MAX_SIGNALS - 1]
    _save(data)
    notify(f"Signal {signal['side'].upper()} — BERICH", f"{signal['symbol']} : entrée {signal['entry']}, SL {signal['sl']}, TP {signal['tp']}.")
    return jsonify({"ok": True, "id": signal["id"]})


@app.get("/signals")
def signals():
    return jsonify(_load())


if __name__ == "__main__":
    # PORT vient de Railway une fois deploye (proxy HTTPS -> ce port interne,
    # peu importe lequel) ; 5600 reste le defaut en local, deja documente
    # dans README.md pour l'alerte TradingView pendant le developpement.
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5600)), debug=False)
