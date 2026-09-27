"""CHEST · mt5-notify-bridge — notifications de clôture quasi temps réel pour le compte MT5 "Live"
actuellement connecté. Sans rapport avec le script local ../mt5-bridge/ (export MT5 -> Dashboard) -
noms volontairement différents pour ne jamais les confondre.

Se connecte au terminal MT5 (service Railway séparé "mt5-terminal", voir son README.md) et sonde
son historique de deals toutes les MT5_POLL_SECONDS secondes. Comme cette connexion est locale au
réseau privé Railway (pas un appel a une API externe facturee), on peut se permettre un intervalle
court sans que ca coute quoi que ce soit - "quasi temps reel" en pratique, contrairement a Myfxbook
qui ne se resynchronise que tres lentement cote serveur (voir CLAUDE.md).

IMPORTANT (2026-09-27, incident réel en production - voir logs Railway) : ce service se connecte en
RPyC BRUT (`import rpyc`, `DirectMT5Client` plus bas) plutôt que via la classe `mt5linux.MetaTrader5`
- son constructeur exige INCONDITIONNELLEMENT un runtime Docker ou udocker LOCAL rien que pour se
connecter à un serveur RPyC déjà lancé ailleurs (`ContainerManager.__init__` appelle toujours
`create_runtime()`/`start_container()`, même en mode "connexion manuelle" - lu directement dans le
code source du paquet). Sur ce projet, mt5-terminal fait tourner ce serveur RPyC "classic" en tant
que service Railway INDÉPENDANT et déjà vivant, sans aucun Docker/udocker installé côté
mt5-notify-bridge - `MetaTrader5(host=..., port=...)` levait donc systématiquement `RuntimeError:
No container runtime available` au tout premier démarrage. `DirectMT5Client` reprend EXACTEMENT le
même mécanisme interne que `mt5linux` utilise une fois connecté (`rpyc.classic.connect()` puis
`conn.execute()`/`conn.eval()` sur du code Python construit en chaîne - voir son propre
`_container_manager.py`), simplement sans la couche de gestion de conteneur, superflue et
incompatible avec une architecture à deux services séparés.

IMPORTANT (2026-09-27) : ce service ne doit JAMAIS appeler de fonction de trading de l'API MT5
(order_send, order_check...) - lecture seule uniquement (history_deals_get, account_info, login).
Le compte est connecte avec le mot de passe INVESTISSEUR (voir accounts-bridge/server.py, POST
/mt5/connect), qui refuse deja tout ordre cote serveur du broker - mais ce script ne doit meme pas
essayer, par principe (defense en profondeur).

Changement de compte "live" (2026-09-27, demande utilisateur : piloter ça depuis le site plutôt que
Railway - phase 1 -> phase 2 -> financé... sans jamais retoucher une variable d'environnement) :
POST /switch-account (interne, X-Internal-Secret) appelle mt5.login() SUR LA CONNEXION DÉJÀ
ÉTABLIE (mt5.initialize() ne se refait pas - c'est une reconnexion de compte, pas de terminal), et
la boucle de sondage bascule sur le nouveau compte. Le suivi du dernier ticket vu est gardé PAR
compte (login) sur le volume Railway, pour ne jamais renotifier un vieil historique si on revient
un jour sur un compte déjà vu.

A chaque nouvelle position fermee (deal "OUT"/"OUT_BY" jamais vu) sur le compte ACTUELLEMENT
connecté, notifie via accounts-bridge (meme mecanisme que berich-bridge/calendar-bridge : POST
/push/broadcast, secret partage INTERNAL_PUSH_SECRET) avec le vrai P&L en dollars et la cause
reelle de cloture (TP/SL/Stop Out/manuelle), lue directement dans le champ `reason` du deal MT5 -
jamais devinee.

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

import rpyc
from flask import Flask, jsonify, request

MT5_TERMINAL_HOST = os.environ.get("MT5_TERMINAL_HOST", "mt5-terminal.railway.internal")
MT5_TERMINAL_PORT = int(os.environ.get("MT5_TERMINAL_PORT", 18812))
POLL_SECONDS = int(os.environ.get("MT5_POLL_SECONDS", 15))
# Chemin d'installation du terminal DANS le conteneur mt5-terminal (image lprett/mt5linux, wine
# prefix /opt/wineprefix, MT5 installe via `/path:"C:/MT5"` - voir son Dockerfile en amont). Sans
# ce chemin explicite, mt5.initialize() fait une auto-detection (registre Windows) qui echoue sous
# Wine avec (-10005, 'IPC timeout') - constate en production le 2026-09-27 (voir CLAUDE.md).
MT5_TERMINAL_PATH = os.environ.get("MT5_TERMINAL_PATH", r"C:\MT5\terminal64.exe")


class DirectMT5Client:
    """Client RPyC minimal vers le serveur "classic" de mt5-terminal - voir la note en tête de
    fichier pour pourquoi (pas mt5linux.MetaTrader5, qui exige un Docker/udocker local). Expose
    juste les quelques appels MT5 dont ce service a besoin, en lecture seule (jamais order_send/
    order_check - voir la note de sécurité plus haut)."""

    def __init__(self, host: str, port: int):
        self.host = host
        self.port = port
        self._conn = None

    def connect(self) -> None:
        self._conn = rpyc.classic.connect(self.host, self.port)
        self._conn._config["sync_request_timeout"] = 300
        self._conn.execute("import sys; sys.path.append('C:\\\\mt5libs')")
        self._conn.execute("import MetaTrader5 as mt5")
        self._conn.execute("import datetime")

    def _eval(self, code: str):
        return rpyc.classic.obtain(self._conn.eval(code))

    def initialize(self, path: str | None = None):
        # path explicite (repr() = echappement correct des antislashs Windows) plutot que
        # l'auto-detection par defaut de mt5.initialize() - voir MT5_TERMINAL_PATH plus haut.
        code = f"mt5.initialize(path={path!r})" if path else "mt5.initialize()"
        return self._eval(code)

    def login(self, login: int, password: str, server: str):
        # repr() (via !r) echappe correctement les guillemets/backslashes du mot de passe/serveur
        # avant de les reinjecter dans du code execute a distance - jamais un f-string qui
        # concatenerait la valeur brute (injection de code sinon).
        code = f"mt5.login({int(login)}, password={password!r}, server={server!r})"
        return self._eval(code)

    def last_error(self):
        return self._eval("mt5.last_error()")

    def account_info(self):
        return self._eval("mt5.account_info()")

    def history_deals_get(self, date_from, date_to):
        code = f"mt5.history_deals_get({date_from!r}, {date_to!r})"
        return self._eval(code)

# Meme secret que berich-bridge/calendar-bridge ET que POST /mt5/connect côté accounts-bridge - un
# seul secret partagé pour toute communication service-à-service sur ce projet (voir
# accounts-bridge/server.py pour le détail du choix).
ACCOUNTS_BRIDGE_URL = os.environ.get("ACCOUNTS_BRIDGE_URL", "")
INTERNAL_PUSH_SECRET = os.environ.get("INTERNAL_PUSH_SECRET", "")

# Persiste le dernier ticket vu PAR COMPTE (clé = login MT5) sur le volume Railway (survit aux
# redémarrages ET aux changements de compte) - meme motif que calendar_history.json dans
# calendar-bridge.
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
state_lock = threading.Lock()
state = {
    "connected_login": None,        # compte MT5 actuellement connecté (None = aucun)
    "dashboard_account_id": None,   # id du compte CHEST correspondant (voir accounts-bridge)
    "last_poll_ok": None,
    "last_error": None,
}

# Coordination avec l'endpoint HTTP /switch-account (appelé depuis un thread Flask, alors que la
# connexion MT5 elle-même n'est utilisée QUE depuis poll_loop() - mt5linux/RPyC n'est pas garanti
# thread-safe, donc un seul thread y touche jamais directement).
switch_lock = threading.Lock()
switch_pending: dict | None = None
switch_event = threading.Event()   # signale "une demande de switch attend" - réveille poll_loop immédiatement
switch_done = threading.Event()    # signale "poll_loop a traité la demande, le résultat est prêt"
switch_result: dict = {}


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


def load_all_last_tickets() -> dict:
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return {}


def load_last_ticket(login: str) -> int:
    return int(load_all_last_tickets().get(login, 0))


def save_last_ticket(login: str, ticket: int) -> None:
    try:
        all_tickets = load_all_last_tickets()
        all_tickets[login] = ticket
        os.makedirs(STATE_DIR, exist_ok=True)
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(all_tickets, f)
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


def check_new_deals(mt5: DirectMT5Client, login: str, last_ticket: int) -> int:
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
    if closing:
        save_last_ticket(login, last_ticket)
    return last_ticket


def handle_switch(mt5: DirectMT5Client, req: dict) -> tuple[bool, dict]:
    """Bascule la connexion MT5 déjà établie sur un autre compte (mt5.login(), pas
    mt5.initialize() - le terminal reste le même, seul le compte connecté change)."""
    login = str(req["login"])
    try:
        ok = mt5.login(int(login), password=req["password"], server=req["server"])
    except Exception as exc:
        return False, {"error": f"Échec de connexion au compte MT5 : {exc}"}
    if not ok:
        return False, {"error": f"mt5.login() refusé : {mt5.last_error()}"}
    info = mt5.account_info()
    account_info = {"login": login, "balance": info.balance, "equity": info.equity, "currency": info.currency} if info else None
    return True, {"accountInfo": account_info}


def poll_loop() -> None:
    mt5 = DirectMT5Client(MT5_TERMINAL_HOST, MT5_TERMINAL_PORT)
    terminal_ready = False
    current_login: str | None = None
    last_ticket = 0
    while True:
        try:
            if not terminal_ready:
                mt5.connect()  # connexion RPyC vers mt5-terminal - voir DirectMT5Client
                terminal_ready = bool(mt5.initialize(path=MT5_TERMINAL_PATH))
                if not terminal_ready:
                    raise RuntimeError(f"mt5.initialize() a échoué : {mt5.last_error()}")

            if switch_event.is_set():
                with switch_lock:
                    req = switch_pending
                ok, result = handle_switch(mt5, req) if req else (False, {"error": "requête de switch vide"})
                global switch_result
                switch_result = {"ok": ok, **result}
                if ok:
                    current_login = str(req["login"])
                    last_ticket = load_last_ticket(current_login)
                    with state_lock:
                        state["connected_login"] = current_login
                        state["dashboard_account_id"] = req.get("dashboardAccountId")
                        state["last_error"] = None
                else:
                    with state_lock:
                        state["last_error"] = result.get("error")
                switch_event.clear()
                switch_done.set()

            if current_login:
                last_ticket = check_new_deals(mt5, current_login, last_ticket)
                with state_lock:
                    state["last_poll_ok"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                    state["last_error"] = None
        except Exception as exc:
            terminal_ready = False  # on retentera une vraie reconnexion au prochain tour
            with state_lock:
                state["last_error"] = str(exc)
            traceback.print_exc()
        # wait() se reveille immediatement si un switch est demande entre-temps, au lieu
        # d'attendre la fin du POLL_SECONDS complet.
        switch_event.wait(timeout=POLL_SECONDS)


@app.get("/health")
def health():
    with state_lock:
        return jsonify(dict(state))


@app.post("/switch-account")
def switch_account():
    if not INTERNAL_PUSH_SECRET or request.headers.get("X-Internal-Secret") != INTERNAL_PUSH_SECRET:
        return jsonify({"error": "Non autorisé."}), 401
    body = request.get_json(silent=True) or {}
    for field in ("login", "password", "server"):
        if not body.get(field):
            return jsonify({"error": f"Champ manquant : {field}"}), 400

    global switch_pending
    with switch_lock:
        switch_pending = body
    switch_done.clear()
    switch_event.set()
    got_it = switch_done.wait(timeout=25)
    if not got_it:
        return jsonify({"error": "Le terminal MT5 n'a pas répondu à temps (25s)."}), 504
    result = dict(switch_result)
    status = 200 if result.get("ok") else 502
    return jsonify(result), status


if __name__ == "__main__":
    threading.Thread(target=poll_loop, daemon=True).start()
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)), threaded=False)
