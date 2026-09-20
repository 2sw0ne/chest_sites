# CHEST - calendrier economique (service Railway)
#
# Chrome doit se lancer en mode "visible" (pas headless) pour passer le
# blocage anti-bot d'investing.com (voir fetch_calendar.py) - sur un
# conteneur Linux sans ecran, Xvfb fournit un ecran virtuel que personne ne
# voit jamais.
#
# VRAI Chrome installe (pas le Chromium embarque par Playwright) - changement
# du 2026-09-13 : le Chromium embarque provoquait des echecs intermittents du
# scraping "Cette Semaine" (Locator.evaluate: Timeout 30000ms exceeded en
# attendant l'onglet), forcant un repli sur tradingeconomics.com qui ne
# remplit pas toujours prevu/precedent - deja anticipe dans le plan initial
# ("si ca bloque quand meme, installer Chrome via apt"). Le meme scraper
# tourne de facon fiable en local avec channel="chrome" (vrai Chrome) depuis
# le debut - on aligne Railway sur cette config qui a fait ses preuves,
# plutot que de continuer a deviner pourquoi le Chromium embarque coince.
#
# Xvfb est demarre en arriere-plan par start.sh (pas via `xvfb-run`, qui
# enveloppe tout le process Python et peut le bloquer silencieusement si
# Xvfb met du temps a demarrer) - Flask se lance independamment et ecoute
# sur le port immediatement.

FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb xauth curl wget gnupg ca-certificates \
    && wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update && apt-get install -y --no-install-recommends google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# --with-deps installe les bibliotheques partagees necessaires (fonts, libnss3,
# libatk...) communes a Chromium ET au vrai Chrome installe ci-dessus, meme si
# c'est channel="chrome" (le vrai Chrome) qui est utilise au final.
RUN playwright install --with-deps chromium

COPY fetch_calendar.py server.py start.sh ./
RUN chmod +x start.sh

ENV CHEST_CHROME_CHANNEL=chrome
ENV PORT=8080
ENV PYTHONUNBUFFERED=1
EXPOSE 8080

CMD ["./start.sh"]
