"""CHEST · Stratégies — récepteur de webhook TradingView pour les notifications
d'opportunité multi-scanners (local, pas encore déployé).

Contrairement à BERICH (une seule position active à la fois, cycle ouverture/
clôture), ici chaque scanner peut signaler une opportunité sur N'IMPORTE
QUELLE paire/unité de temps à tout moment — le rôle de ce pont est juste
d'accumuler les N dernières et de les servir à strategies.html pour le
panneau de notifications, pas de suivre leur issue.

Un seul type de message JSON sur /webhook :
    {"scanner": "Wolfx", "symbol": "EURUSD", "timeframe": "15", "side": "buy"}

"timeframe" doit être l'un des codes utilisés par le site (1/5/15/30/60/240/D).
"time" est optionnel (sinon l'heure de réception du webhook est utilisée).

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

DATA_FILE = Path(__file__).resolve().parent.parent / "site" / "data" / "scanner-signals.json"
MAX_SIGNALS = 50
VALID_TIMEFRAMES = {"1", "5", "15", "30", "60", "240", "D"}


def _load() -> dict:
    if not DATA_FILE.exists():
        return {"example": False, "updatedAt": None, "signals": []}
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))


def _save(data: dict) -> None:
    DATA_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


@app.post("/webhook")
def webhook():
    payload = request.get_json(force=True, silent=True) or {}
    required = ("scanner", "symbol", "timeframe", "side")
    missing = [k for k in required if k not in payload]
    if missing:
        return jsonify({"error": f"champs manquants: {', '.join(missing)}"}), 400
    if payload["side"] not in ("buy", "sell"):
        return jsonify({"error": "side doit être 'buy' ou 'sell'"}), 400
    if str(payload["timeframe"]) not in VALID_TIMEFRAMES:
        return jsonify({"error": f"timeframe doit être l'un de {sorted(VALID_TIMEFRAMES)}"}), 400

    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    signal = {
        "id": f"{payload['scanner']}-{payload['symbol']}-{payload['timeframe']}-{now}",
        "scanner": payload["scanner"],
        "symbol": payload["symbol"],
        "timeframe": str(payload["timeframe"]),
        "side": payload["side"],
        "time": payload.get("time") or now,
    }

    data = _load()
    data["example"] = False
    data["updatedAt"] = now
    data["signals"] = [signal] + data.get("signals", [])[: MAX_SIGNALS - 1]
    _save(data)
    return jsonify({"ok": True, "id": signal["id"]})


@app.get("/signals.json")
def signals_json():
    return jsonify(_load())


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5601, debug=True)
