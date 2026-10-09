#!/usr/bin/env python3
"""CHEST - petit controleur HTTP du terminal MT5 (2026-10-09).

Permet a accounts-bridge de changer le compte MT5 branche, SANS passer par RPyC / l'API Python MT5 (cause des
timeouts de 25 s de la v1) et sans toucher aux variables Railway : il range les identifiants sur le volume
(/data/account/) puis arrete terminal64 ; Railway relance le conteneur et chest_load_account (chest-ea.sh) les
relit au demarrage, avant que la config MT5 ne soit generee.

Ecoute sur le reseau PRIVE Railway uniquement (aucun domaine public sur ce service), port 8090, et exige le
secret partage MT5_CONTROL_SECRET dans l'en-tete X-Control-Secret. Le mot de passe (investisseur, lecture seule)
n'est jamais ecrit dans les logs.
"""
import hmac
import json
import os
import re
import socket
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SECRET = os.environ.get("MT5_CONTROL_SECRET", "")
ACCOUNT_DIR = os.environ.get("MT5_ACCOUNT_DIR", "/data/account")
PORT = int(os.environ.get("MT5_CONTROL_PORT", "8090"))
LOGIN_RE = re.compile(r"^[0-9]{3,12}$")
SERVER_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 ._-]{1,63}$")


def log(msg):
    print(f"[CONTROL] {msg}", flush=True)


def write_secret_file(name, value):
    path = os.path.join(ACCOUNT_DIR, name)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(value)


def restart_terminal():
    time.sleep(1.5)  # laisse partir la reponse HTTP avant de couper le terminal
    try:
        os.remove(os.path.join(os.path.dirname(ACCOUNT_DIR), "ea-silent-restarts"))  # repart d'un compteur de garde-fou neuf
    except OSError:
        pass
    subprocess.call("pkill -f terminal64 2>/dev/null || true", shell=True)


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _authorized(self):
        got = self.headers.get("X-Control-Secret", "")
        return bool(SECRET) and hmac.compare_digest(got.encode("utf-8"), SECRET.encode("utf-8"))

    def log_message(self, fmt, *args):  # pas de log d'acces (evite toute fuite)
        return

    def do_GET(self):
        if self.path == "/health":
            return self._send(200, {"ok": True})
        if not self._authorized():
            return self._send(401, {"error": "non autorise"})
        if self.path == "/state":
            try:
                login = open(os.path.join(ACCOUNT_DIR, "login")).read().strip()
                server = open(os.path.join(ACCOUNT_DIR, "server")).read().strip()
            except OSError:
                login = server = ""
            return self._send(200, {"login": login, "server": server})
        return self._send(404, {"error": "inconnu"})

    def do_POST(self):
        if self.path != "/switch":
            return self._send(404, {"error": "inconnu"})
        if not self._authorized():
            return self._send(401, {"error": "non autorise"})
        try:
            n = int(self.headers.get("Content-Length", "0"))
            data = json.loads(self.rfile.read(min(n, 4096)).decode("utf-8"))
        except (ValueError, OSError):
            return self._send(400, {"error": "JSON invalide"})
        login, server, password = str(data.get("login", "")), str(data.get("server", "")), data.get("password")
        if not LOGIN_RE.match(login) or not SERVER_RE.match(server) or not isinstance(password, str) \
                or not 1 <= len(password) <= 128 or "\n" in password or "\r" in password:
            return self._send(400, {"error": "identifiants invalides"})
        try:
            os.makedirs(ACCOUNT_DIR, mode=0o700, exist_ok=True)
            write_secret_file("login", login)
            write_secret_file("server", server)
            write_secret_file("password", password)
        except OSError as e:
            log(f"ecriture impossible : {e.__class__.__name__}")
            return self._send(500, {"error": "volume inaccessible"})
        log(f"nouveau compte {login} sur {server} : redemarrage du terminal")
        threading.Thread(target=restart_terminal, daemon=True).start()
        return self._send(200, {"ok": True, "restarting": True})


class DualStackServer(ThreadingHTTPServer):
    address_family = socket.AF_INET6

    def server_bind(self):
        self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)  # IPv4 ET IPv6 (reseau prive Railway)
        super().server_bind()


if __name__ == "__main__":
    if not SECRET:
        log("MT5_CONTROL_SECRET absent : controleur desactive")
        raise SystemExit(0)
    log(f"ecoute sur [::]:{PORT} (reseau prive)")
    DualStackServer(("::", PORT), Handler).serve_forever()
