# CHEST - mt5-bridge (notifications de cloture MT5, service Railway)
#
# Meme logique qu'accounts-bridge/berich-bridge : aucun navigateur ici, juste Flask + le client
# RPyC mt5linux (aucune installation Wine/MT5 dans CETTE image - ca vit dans le service separe
# "mt5-terminal", vu par celui-ci uniquement via le reseau prive Railway). Image minimale.
#
# Python 3.12 minimum (pas 3.11 comme les autres services) : le paquet mt5linux (1.1.1) contient au
# moins une f-string dont l'expression {...} s'etale sur plusieurs lignes physiques - syntaxe
# valide seulement depuis PEP 701 (Python 3.12+, grammaire des f-strings assouplie). Sur 3.11,
# `from mt5linux import MetaTrader5` leve un SyntaxError des l'import et fait crash-boucler tout le
# conteneur (constate en direct sur Railway, 2026-09-27) - le paquet ne declare pourtant aucune
# contrainte Requires-Python, rien ne previent pip.
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .

ENV PORT=8080
ENV PYTHONUNBUFFERED=1
EXPOSE 8080

CMD ["python", "server.py"]
