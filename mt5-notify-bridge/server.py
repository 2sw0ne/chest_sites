"""CHEST · mt5-notify-bridge — pilote le changement de compte MT5 "Live" depuis le site. Sans
rapport avec le script local ../mt5-bridge/ (export MT5 -> Dashboard) - noms volontairement
différents pour ne jamais les confondre.

Se connecte au terminal MT5 (service Railway séparé "mt5-terminal", voir son README.md) via RPyC et
expose POST /switch-account, appelé par accounts-bridge (POST /mt5/connect) à chaque fois que
l'utilisateur change le compte Live depuis le Dashboard (nouvelle phase de challenge, nouveau compte
financé...).

IMPORTANT (2026-09-28, changement d'architecture - voir CLAUDE.md "Plan EA") : ce service ne sonde
PLUS l'historique des deals lui-même. Les notifications de clôture sont maintenant envoyées
DIRECTEMENT par un Expert Advisor MQL5 (mt5-terminal/CHESTNotifier.mq5) qui tourne DANS le terminal
et appelle accounts-bridge (POST /mt5/ea-notify) à chaque clôture détectée (OnTradeTransaction,
événement natif, plus réactif qu'un sondage externe toutes les MT5_POLL_SECONDS). Ancienne logique
de sondage (check_new_deals/format_close_message/mt5_last_deal.json) retirée - devenue morte -
voir l'historique git si besoin de la retrouver.

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
(order_send, order_check...) - lecture seule uniquement (account_info, login). Le compte est
connecté avec le mot de passe INVESTISSEUR (voir accounts-bridge/server.py, POST /mt5/connect), qui
refuse déjà tout ordre côté serveur du broker - mais ce script ne doit même pas essayer, par
principe (défense en profondeur).

Utilisation locale (necessite mt5-terminal demarre et accessible) :
    pip install -r requirements.txt
    python server.py
"""
from __future__ import annotations

import os
import threading
import time
import traceback

import rpyc
from flask import Flask, jsonify, request

MT5_TERMINAL_HOST = os.environ.get("MT5_TERMINAL_HOST", "mt5-terminal.railway.internal")
MT5_TERMINAL_PORT = int(os.environ.get("MT5_TERMINAL_PORT", 18812))
# Combien de temps entre deux tentatives de (re)connexion au terminal quand il n'est pas pret -
# connexion locale au reseau prive Railway (pas un appel facture), peut rester bas sans souci.
RETRY_SECONDS = int(os.environ.get("MT5_POLL_SECONDS", 15))
# Chemin d'installation du terminal DANS le conteneur mt5-terminal (image lprett/mt5linux, wine
# prefix /opt/wineprefix, MT5 installe via `/path:"C:/MT5"` - voir son Dockerfile en amont). Sans
# ce chemin explicite, mt5.initialize() fait une auto-detection (registre Windows) qui echoue sous
# Wine avec (-10005, 'IPC timeout') - constate en production le 2026-09-27 (voir CLAUDE.md).
MT5_TERMINAL_PATH = os.environ.get("MT5_TERMINAL_PATH", r"C:\MT5\terminal64.exe")
# mt5.initialize() echoue de facon erratique et bien documentee dans la communaute MT5 (~50% de
# reussite par tentative, meme sur Windows natif sans Wine - voir CLAUDE.md "IPC timeout erratique,
# bug connu MT5", forums MQL5 428075/447937 : aucune cause ni fix fiable identifie par la
# communaute, ce n'est pas un bug de CE projet). Une seule tentative par cycle de poll (toutes les
# RETRY_SECONDS, 15-70s) etait insuffisant - on retente plusieurs fois rapprochees avant d'abandonner.
INIT_ATTEMPTS = int(os.environ.get("MT5_INIT_ATTEMPTS", 6))
INIT_ATTEMPT_DELAY = float(os.environ.get("MT5_INIT_ATTEMPT_DELAY", 3))
# Timeout par appel RPyC (connect/initialize/login/account_info...) - etait fixe a 300s (2026-09-29,
# incident reel en production) : un mt5.login() vers un VRAI broker (VantageMarkets) qui ne repond
# jamais (silencieusement, ni succes ni erreur) bloquait tout ce timeout AVANT de lever la moindre
# exception - pendant ce temps poll_loop() entier restait fige (plus de last_poll_ok, plus aucun
# /switch-account traitable pour QUI QUE CE SOIT, meme un nouvel appel), un simple retry() ou try/
# except ne pouvait rien y faire puisque l'appel bloquant lui-meme ne rendait jamais la main. Borne a
# une valeur qui laisse largement le temps a un login legitime (quelques secondes en pratique, meme
# contre un broker reel) tout en garantissant qu'AUCUN appel ne peut plus jamais figer le service
# au-dela de cette duree.
MT5_RPYC_TIMEOUT = float(os.environ.get("MT5_RPYC_TIMEOUT", 20))


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
        # Ferme l'ancienne connexion avant d'en ouvrir une nouvelle (2026-09-29, voir CLAUDE.md
        # "IPC timeout intermittent") - sans ca, une session RPyC classic jamais fermee restait
        # ouverte cote serveur (mt5server.exe) a chaque nouvelle tentative apres un echec, laissant
        # potentiellement un handle IPC MetaTrader5 fantome tenir la ressource.
        self.close()
        self._conn = rpyc.classic.connect(self.host, self.port)
        self._conn._config["sync_request_timeout"] = MT5_RPYC_TIMEOUT
        self._conn.execute("import sys; sys.path.append('C:\\\\mt5libs')")
        self._conn.execute("import MetaTrader5 as mt5")

    def close(self) -> None:
        if self._conn is not None:
            try:
                self._conn.close()
            except Exception:
                pass
            self._conn = None

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

    def shutdown(self):
        self._eval("mt5.shutdown()")

    def account_info(self):
        # N'obtient JAMAIS l'objet AccountInfo tel quel : c'est un type nomme dynamiquement par le
        # module MetaTrader5 cote distant, absent localement (ce service n'importe jamais
        # MetaTrader5) - rpyc.classic.obtain() tente de le "pickler" pour le rapatrier et echoue
        # avec "Can't pickle <class 'AccountInfo'>: attribute lookup AccountInfo on builtins
        # failed" (constate en production le 2026-09-29, lors du tout premier appel a
        # /switch-account depuis CHEST - le login reussissait deja, seule cette ligne plantait).
        # On extrait donc les champs utiles COTE DISTANT, dans le code eval() lui-meme, pour ne
        # faire transiter que des types Python natifs (dict/float/int/str/None), qui picklent
        # sans probleme.
        code = (
            "(lambda i: {'login': i.login, 'balance': i.balance, 'equity': i.equity, "
            "'currency': i.currency} if i else None)(mt5.account_info())"
        )
        return self._eval(code)


# Meme secret que berich-bridge/calendar-bridge ET que POST /mt5/connect côté accounts-bridge - un
# seul secret partagé pour toute communication service-à-service sur ce projet (voir
# accounts-bridge/server.py pour le détail du choix).
INTERNAL_PUSH_SECRET = os.environ.get("INTERNAL_PUSH_SECRET", "")

app = Flask(__name__)
state_lock = threading.Lock()
state = {
    "connected_login": None,        # compte MT5 actuellement connecté (None = aucun)
    "dashboard_account_id": None,   # id du compte CHEST correspondant (voir accounts-bridge)
    "last_poll_ok": None,
    "last_error": None,
}

# Coordination avec l'endpoint HTTP /switch-account (appelé depuis un thread Flask, alors que la
# connexion MT5 elle-même n'est utilisée QUE depuis poll_loop() - RPyC n'est pas garanti thread-safe,
# donc un seul thread y touche jamais directement).
switch_lock = threading.Lock()
switch_pending: dict | None = None
switch_event = threading.Event()   # signale "une demande de switch attend" - réveille poll_loop immédiatement
switch_done = threading.Event()    # signale "poll_loop a traité la demande, le résultat est prêt"
switch_result: dict = {}


def handle_switch(mt5: DirectMT5Client, req: dict) -> tuple[bool, dict]:
    """Bascule la connexion MT5 déjà établie sur un autre compte.

    Retente plusieurs fois avec reconnexion RPyC (2026-09-29, constaté en production : premier
    switch réel depuis CHEST échoué sur "connection closed by peer") - même classe d'erreurs
    transitoires que celles qui ont motivé la boucle de retry de mt5.initialize() dans poll_loop()
    (voir CLAUDE.md "IPC timeout erratique, bug connu MT5") : un seul essai sans filet était
    insuffisant, alors même que le login MT5 en lui-même n'a rien d'anormal. mt5.connect() rouvre
    juste le CANAL RPyC (rpyc.classic.connect()).

    Essaie d'abord un simple login() (rapide, cas normal), et ne refait mt5.initialize() que si
    CET essai echoue avec un message evoquant un probleme IPC (2026-09-29, 3e iteration le meme
    jour) - la version precedente refaisait initialize() a CHAQUE tentative inconditionnellement,
    ce qui resolvait bien le cas "switch vers un courtier jamais initialise" (MetaQuotes-Demo ->
    VantageMarkets-Live 14, echouait avec (-10004, 'No IPC connection')) mais cassait le cas normal
    tout aussi reel (re-basculer vers un serveur DEJA bien connu comme FTMO-Demo, avec un compte
    deja activement connecte) : reinitialiser un terminal deja connecte declenche une resynchro de
    tous les symboles qui peut elle-meme timeout ("symbol synchronization timeout" observe dans le
    Journal MT5), et cet echec-la ne se rattrape jamais par un simple retry puisque CHAQUE tentative
    relance la meme resynchro couteuse. Le compromis : login() seul reste le chemin rapide par
    defaut (comme le cas prevu a l'origine, phase 1 -> phase 2 d'un meme challenge) ; seulement
    quand son echec ressemble a un probleme IPC (pas un mauvais mot de passe/login) on retente un
    initialize() complet PUIS un 2e login() DANS LA MEME tentative, sans consommer un tour de retry
    supplementaire pour rien."""
    login = str(req["login"])
    last_error = None
    ok = False
    for attempt in range(INIT_ATTEMPTS):
        try:
            mt5.connect()
            ok = mt5.login(int(login), password=req["password"], server=req["server"])
            if not ok:
                last_error = mt5.last_error()
                if last_error and "IPC" in str(last_error):
                    if mt5.initialize(path=MT5_TERMINAL_PATH):
                        ok = mt5.login(int(login), password=req["password"], server=req["server"])
                        last_error = None if ok else mt5.last_error()
                    else:
                        last_error = mt5.last_error()
            if ok:
                break
        except Exception as exc:
            last_error = str(exc)
        if attempt < INIT_ATTEMPTS - 1:
            time.sleep(INIT_ATTEMPT_DELAY)
    if not ok:
        return False, {"error": f"Échec de connexion au compte MT5 après {INIT_ATTEMPTS} tentatives : {last_error}"}
    info = mt5.account_info()  # dict {login,balance,equity,currency} ou None - voir account_info()
    account_info = {"login": login, "balance": info["balance"], "equity": info["equity"], "currency": info["currency"]} if info else None
    return True, {"accountInfo": account_info}


def poll_loop() -> None:
    global switch_result  # declare une seule fois ici - une 2e "global" plus bas dans la fonction
    # (apres un premier usage) est une SyntaxError ("assigned to before global declaration"), pas
    # juste un doublon inoffensif - incident reel en production, voir CLAUDE.md (2026-09-27).
    mt5 = DirectMT5Client(MT5_TERMINAL_HOST, MT5_TERMINAL_PORT)
    terminal_ready = False
    while True:
        try:
            if not terminal_ready:
                # connect() + initialize() vivent DANS le meme bloc protege, a CHAQUE tentative
                # (2026-09-29) - un connect() initial separe, hors de la boucle de retry, pouvait
                # lui-meme echouer ("Connection reset by peer") et faire planter tout le cycle
                # avant meme d'atteindre la boucle. Voir CLAUDE.md "IPC timeout erratique, bug
                # connu MT5" pour l'historique complet des erreurs RPyC transitoires rencontrees
                # (result expired, connection closed by peer, stream has been closed, connection
                # reset by peer) qui ont chacune motive un ajustement de cette boucle.
                last_init_error = None
                for attempt in range(INIT_ATTEMPTS):
                    try:
                        mt5.connect()  # connexion RPyC vers mt5-terminal - voir DirectMT5Client
                        if bool(mt5.initialize(path=MT5_TERMINAL_PATH)):
                            terminal_ready = True
                            break
                        last_init_error = mt5.last_error()
                    except Exception as init_exc:
                        last_init_error = str(init_exc)
                    if attempt < INIT_ATTEMPTS - 1:
                        time.sleep(INIT_ATTEMPT_DELAY)
                if not terminal_ready:
                    raise RuntimeError(
                        f"mt5.initialize() a échoué après {INIT_ATTEMPTS} tentatives : {last_init_error}"
                    )

            if switch_event.is_set():
                with switch_lock:
                    req = switch_pending
                ok, result = handle_switch(mt5, req) if req else (False, {"error": "requête de switch vide"})
                switch_result = {"ok": ok, **result}
                if ok:
                    with state_lock:
                        state["connected_login"] = str(req["login"])
                        state["dashboard_account_id"] = req.get("dashboardAccountId")
                        state["last_error"] = None
                else:
                    with state_lock:
                        state["last_error"] = result.get("error")
                switch_event.clear()
                switch_done.set()

            with state_lock:
                state["last_poll_ok"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                state["last_error"] = None
        except Exception as exc:
            # Nettoyage best-effort (2026-09-29, voir CLAUDE.md "IPC timeout intermittent apres le
            # premier succes") : le module MetaTrader5 importe cote mt5server.exe (Wine) PERSISTE
            # d'une connexion RPyC classic a l'autre - c'est le MEME processus Windows/Python tout
            # au long de la vie du conteneur mt5-terminal, `import MetaTrader5 as mt5` dans une
            # nouvelle connexion recupere le module DEJA importe, pas une instance fraiche. Sans
            # mt5.shutdown() avant de retenter mt5.initialize() sur une connexion suivante, le
            # handle IPC cote module reste dans un etat incoherent - cause plausible du pattern
            # observe (marche juste apres un redeploiement de mt5-terminal, se degrade ensuite de
            # facon intermittente). Best-effort : si la connexion actuelle est deja cassee, shutdown
            # echouera aussi - on l'ignore, ce n'est qu'un nettoyage, pas la logique principale.
            try:
                mt5.shutdown()
            except Exception:
                pass
            # Ferme la connexion RPyC immediatement (2026-09-29) plutot que d'attendre le prochain
            # `connect()` - logs Railway montrant des "welcome" sans "goodbye" correspondant a
            # chaque cycle d'echec, preuve que les sessions RPyC precedentes restaient ouvertes
            # cote serveur bien apres que ce client les ait abandonnees.
            mt5.close()
            terminal_ready = False  # on retentera une vraie reconnexion au prochain tour
            with state_lock:
                state["last_error"] = str(exc)
            traceback.print_exc()
            # Bug reel constate en production (2026-09-27) : si mt5.connect()/initialize() echoue
            # AVANT le bloc switch_event.clear() plus haut, un switch deja demande (switch_event
            # mis a True par /switch-account) restait "set" indefiniment - le wait() juste en
            # dessous se reveille alors IMMEDIATEMENT a chaque tour au lieu d'attendre RETRY_SECONDS,
            # ce qui transforme la boucle en busy-loop (des centaines de mt5.connect()/seconde,
            # log flood + rate-limit Railway) ET laisse /switch-account bloque 25s pour rien
            # (switch_done jamais mis). Il faut toujours debloquer l'appelant ici si un switch est
            # en attente, meme quand on ne peut pas le traiter.
            if switch_event.is_set():
                switch_result = {"ok": False, "error": f"Terminal MT5 indisponible : {exc}"}
                switch_event.clear()
                switch_done.set()
        # wait() se reveille immediatement si un switch est demande entre-temps, au lieu
        # d'attendre la fin du RETRY_SECONDS complet.
        switch_event.wait(timeout=RETRY_SECONDS)


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
