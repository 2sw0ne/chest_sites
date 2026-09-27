"""CHEST · mt5-notify-bridge — notifications de clôture quasi temps réel pour le compte MT5 Live
Swann. Sans rapport avec le script local ../mt5-bridge/ (export MT5 -> Dashboard) - noms
volontairement différents pour ne jamais les confondre.

Se connecte au terminal MT5 (service Railway séparé "mt5-terminal", voir son README.md) via
mt5linux (proxy RPyC vers l'API Python officielle MetaTrader5 - github.com/lucas-campagna/mt5linux)
et sonde son historique de deals toutes les MT5_POLL_SECONDS secondes. Comme cette connexion est
locale au réseau privé Railway (pas un appel a une API externe facturee), on peut se permettre un
intervalle court sans que ca coute quoi que ce soit - "quasi temps reel" en pratique, contrairement
a Myfxbook qui ne se resynchronise que tres lentement cote serveur (voir CLAUDE.md).

IMPORTANT (2026-09-27) : ce service ne doit JAMAIS appeler de fonction de trading de l'API MT5
(order_send, order_check...) - lecture seule uniquement (history_deals_get, account_info). Le
terminal lui-meme est connecte avec le mot de passe INVESTISSEUR (voir mt5-terminal/README.md),
qui refuse deja tout ordre cote serveur du broker - mais ce script ne doit meme pas essayer, par
principe (defense en profondeur).

A chaque nouvelle position fermee (deal "OUT"/"OUT_BY" jamais vu), notifie via accounts-bridge
(meme mecanisme que berich-bridge/calendar-bridge : POST /push/broadcast, secret partage
INTERNAL_PUSH_SECRET) avec le vrai P&L en dollars et la cause reelle de cloture (TP/SL/Stop Out/
manuelle), lue directement dans le champ `reason` du deal MT5 - jamais devinee.

Utilisation locale (necessite mt5-terminal demarre et accessible) :
    pip install -r requirements.txt
    python server.py
"""
from __future__ import annotations

import json
import os
import threading
import time
import traceback
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

from flask import Flask, jsonify
from mt5linux import MetaTrader5

MT5_TERMINAL_HOST = os.environ.get("MT5_TERMINAL_HOST", "mt5-terminal.railway.internal")
MT5_TERMINAL_PORT = int(os.environ.get("MT5_TERMINAL_PORT", 18812))
POLL_SECONDS = int(os.environ.get("MT5_POLL_SECONDS", 15))

# Meme secret que berich-bridge/calendar-bridge - voir accounts-bridge/server.py, POST
# /push/broadcast. ACCOUNTS_BRIDGE_URL = URL PUBLIQUE deployee (pas .railway.internal ici, ce
# n'est pas le meme service).
ACCOUNTS_BRIDGE_URL = os.environ.get("ACCOUNTS_BRIDGE_URL", "")
INTERNAL_PUSH_SECRET = os.environ.get("INTERNAL_PUSH_SECRET", "")

# Persiste le dernier ticket de deal deja notifie sur le volume Railway (survit aux redemarrages) -
# meme motif que calendar_history.json dans calendar-bridge.
STATE_DIR = os.environ.get("RAILWAY_VOLUME_MOUNT_PATH") or os.path.dirname(os.path.abspath(__file__))
STATE_FILE = os.path.join(STATE_DIR, "mt5_last_deal.json")

# ENUM_DEAL_ENTRY / ENUM_DEAL_REASON (doc officielle MQL5, jamais devine) :
# https://www.mql5.com/en/docs/constants/tradingconstants/dealproperties
DEAL_ENTRY_OUT = 1
DEAL_ENTRY_OUT_BY = 3
DEAL_REASON_SL = 4
DEAL_REASON_TP = 5
DEAL_REASON_SO = 6

app = Flask(__name__)
state = {"last_ticket": 0, "last_poll_ok": None, "last_error": None}
state_lock = threading.Lock()


def notify(title: str, body: str) -> None:
    if not ACCOUNTS_BRIDGE_URL or not INTERNAL_PUSH_SECRET:
        return
    try:
        req = urllib.request.Request(
            ACCOUNTS_BRIDGE_URL.rstrip("/") + "/push/broadcast",
            data=json.dumps({"title": title, "body": body, "url": "dashboard.html"}).encode("utf-8"),
            headers={"Content-Type": "application/json", "X-Internal-Secret": INTERNAL_PUSH_SECRET},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=5)
    except (urllib.error.URLError, OSError):
        pass  # jamais bloquant


def load_last_ticket() -> int:
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            return int(json.load(f).get("last_ticket", 0))
    except (FileNotFoundError, json.JSONDecodeError, OSError, ValueError):
        return 0


def save_last_ticket(ticket: int) -> None:
    try:
        os.makedirs(STATE_DIR, exist_ok=True)
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump({"last_ticket": ticket}, f)
    except OSError:
        pass


def format_close_message(deal) -> tuple[str, str]:
    side = "achat" if deal.type == 0 else "vente"
    # P&L reel = profit + commission + swap (ce qui a vraiment bouge sur le solde pour ce deal),
    # pas juste le "profit" brut - coherent avec ce que l'utilisateur voit sur son relevé MT5.
    pnl = deal.profit + deal.commission + deal.swap
    win = pnl > 0
    if deal.reason == DEAL_REASON_TP:
        cause = "TP"
    elif deal.reason == DEAL_REASON_SL:
        cause = "SL"
    elif deal.reason == DEAL_REASON_SO:
        cause = "Stop Out"
    else:
        cause = "clôture manuelle"
    emoji = "🎉" if win else "❌"
    sign = "+" if pnl >= 0 else ""
    title = f"{deal.symbol} — {cause}"
    body = f"Ton {side} sur {deal.symbol} a {cause} de {sign}{pnl:.2f}$ {emoji}"
    return title, body


def check_new_deals(mt5: MetaTrader5, last_ticket: int) -> int:
    now = datetime.now(timezone.utc)
    # Fenetre large (2 jours) par securite (redemarrage, latence...) - la dedup reelle se fait sur
    # le numero de ticket (croissant, jamais reattribue par MT5), jamais sur la date seule.
    start = now - timedelta(days=2)
    deals = mt5.history_deals_get(start, now) or []
    closing = [d for d in deals if d.entry in (DEAL_ENTRY_OUT, DEAL_ENTRY_OUT_BY) and d.ticket > last_ticket]
    closing.sort(key=lambda d: d.ticket)
    for deal in closing:
        title, body = format_close_message(deal)
        notify(title, body)
        last_ticket = deal.ticket
    return last_ticket


def poll_loop() -> None:
    last_ticket = load_last_ticket()
    mt5 = MetaTrader5(host=MT5_TERMINAL_HOST, port=MT5_TERMINAL_PORT)
    connected = False
    while True:
        try:
            if not connected:
                connected = bool(mt5.initialize())
                if not connected:
                    raise RuntimeError(f"mt5.initialize() a échoué : {mt5.last_error()}")
            last_ticket = check_new_deals(mt5, last_ticket)
            save_last_ticket(last_ticket)
            with state_lock:
                state["last_ticket"] = last_ticket
                state["last_poll_ok"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                state["last_error"] = None
        except Exception as exc:
            connected = False  # on retentera une vraie reconnexion au prochain tour
            with state_lock:
                state["last_error"] = str(exc)
            traceback.print_exc()
        time.sleep(POLL_SECONDS)


@app.get("/health")
def health():
    with state_lock:
        return jsonify(dict(state))


if __name__ == "__main__":
    threading.Thread(target=poll_loop, daemon=True).start()
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)), threaded=False)
