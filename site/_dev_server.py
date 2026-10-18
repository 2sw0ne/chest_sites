"""
CHEST - serveur de dev local SANS CACHE.

`python -m http.server` n'envoie aucun en-tete de cache, ce qui laisse le
navigateur appliquer sa propre heuristique de cache (souvent tres agressive,
et invisible aux ?query-string ajoutes manuellement sur une navigation, car
les redirections internes du site (location.replace('dashboard.html'), etc.)
utilisent des chemins RELATIFS SANS query - donc jamais "cache-busted" par ce
truc, contrairement a une navigation manuelle). Symptome deja rencontre
plusieurs fois cette session : une page editee continue d'afficher son
ancien contenu meme apres un rechargement complet.

Ce script est un remplacement direct de `python -m http.server` qui envoie
`Cache-Control: no-store` sur CHAQUE reponse - plus jamais besoin de
`?nocache=N` pour voir un fichier a jour, y compris sur les redirections
internes du site.

Usage (identique a http.server, --directory accepte comme lui) :
    python _dev_server.py 8934 --directory projects/chesting/site
"""
import functools
import sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler


class NoCacheHandler(SimpleHTTPRequestHandler):
    # HTTP/1.1 par defaut => keep-alive : un onglet de navigateur qui garde
    # sa connexion ouverte suffit a bloquer TOUTES les autres requetes sur un
    # HTTPServer mono-thread (constate le 2026-09-14 : curl et le navigateur
    # se figeaient des qu'un onglet etait deja ouvert). HTTP/1.0 force une
    # connexion par requete, donc plus de blocage inter-onglets.
    protocol_version = "HTTP/1.0"

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    # Adresses propres (2026-10-18) : mêmes redirections et réécritures que vercel.json, relues
    # depuis ce fichier, pour que /connexion, /welcome, /dashboard... marchent aussi en local.
    def _route(self):
        path, _, query = self.path.partition("?")
        for r in ROUTES["redirects"]:
            if r[0].match(path):
                self.send_response(307)
                self.send_header("Location", r[1] + ("?" + query if query else ""))
                self.end_headers()
                return True
        for r in ROUTES["rewrites"]:
            if r[0].match(path):
                self.path = r[1] + ("?" + query if query else "")
                break
        return False

    def do_GET(self):
        if not self._route():
            super().do_GET()

    def do_HEAD(self):
        if not self._route():
            super().do_HEAD()


def load_routes(directory):
    import json, os, re
    out = {"redirects": [], "rewrites": []}
    try:
        with open(os.path.join(directory or ".", "vercel.json"), encoding="utf-8") as f:
            cfg = json.load(f)
    except (OSError, ValueError):
        return out
    def pattern(src):
        # "/:page(a|b)" -> ^/(a|b)$ ; le reste est littéral
        return re.compile("^" + re.sub(r":\w+\(([^)]*)\)", r"(\1)", src) + "$")
    for kind in ("redirects", "rewrites"):
        for r in cfg.get(kind, []):
            out[kind].append((pattern(r["source"]), r["destination"]))
    return out


ROUTES = {"redirects": [], "rewrites": []}


if __name__ == "__main__":
    args = sys.argv[1:]
    directory = None
    if "--directory" in args:
        i = args.index("--directory")
        directory = args[i + 1]
        del args[i:i + 2]
    port = int(args[0]) if args else 8934

    ROUTES.update(load_routes(directory))
    handler = functools.partial(NoCacheHandler, directory=directory) if directory else NoCacheHandler
    server = ThreadingHTTPServer(("0.0.0.0", port), handler)
    print(f"Serveur sans cache sur http://localhost:{port} (Ctrl+C pour arreter)")
    server.serve_forever()
