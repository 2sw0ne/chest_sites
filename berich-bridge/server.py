"""CHEST · BERICH — récepteur de webhook TradingView (local, pas encore déployé).

Reçoit les alertes du script Pine "BE FR€E" (alert() sur "Any alert() function
call") et les écrit dans ../site/data/berich-signal.json, que berich.html lit
pour afficher les positions détectées. Voir README.md pour la configuration
de l'alerte côté TradingView.

Le script envoie deux types de message JSON sur le MÊME endpoint, distingués
par la présence ou non de "result" :
  - Ouverture : {"id","pair","signal","entry","sl"}           (pas de tp — RR3 fixe, calculé ici)
  - Clôture   : {"id","result":"TP"|"SL"}                     (même id que l'ouverture)

Utilisation :
    pip install flask
    python server.py
"""
from __future__ import annotations

import json
import time
from pathlib import Path

from flask import Flask, jsonify, request

app = Flask(__name__)

DATA_FILE = Path(__file__).resolve().parent.parent / "site" / "data" / "berich-signal.json"
MAX_SIGNALS = 50
RR = 3.0  # verrouillé dans le script Pine — voir "Money management verrouillé"


def _load() -> dict:
    if not DATA_FILE.exists():
        return {"example": False, "updatedAt": None, "signals": []}
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))


def _save(data: dict) -> None:
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
    return jsonify({"ok": True, "id": signal["id"]})


@app.get("/signal.json")
def signal_json():
    return jsonify(_load())


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5600, debug=True)
