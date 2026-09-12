# CHEST - calendrier economique (service Railway)
#
# Chrome doit se lancer en mode "visible" (pas headless) pour passer le
# blocage anti-bot d'investing.com (voir fetch_calendar.py) - sur un
# conteneur Linux sans ecran, Xvfb fournit un ecran virtuel que personne ne
# voit jamais. On utilise le Chromium embarque par Playwright
# (CHEST_CHROME_CHANNEL="" dans fetch_calendar.py), pas besoin d'installer
# Chrome separement.
#
# Xvfb est demarre en arriere-plan par start.sh (pas via `xvfb-run`, qui
# enveloppe tout le process Python et peut le bloquer silencieusement si
# Xvfb met du temps a demarrer) - Flask se lance independamment et ecoute
# sur le port immediatement.

FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb xauth curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN playwright install --with-deps chromium

COPY fetch_calendar.py server.py start.sh ./
RUN chmod +x start.sh

ENV CHEST_CHROME_CHANNEL=""
ENV PORT=8080
ENV PYTHONUNBUFFERED=1
EXPOSE 8080

CMD ["./start.sh"]
