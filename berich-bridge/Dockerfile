# CHEST - BERICH (recepteur webhook TradingView, service Railway)
#
# Meme logique qu'accounts-bridge : aucun navigateur ici, juste Flask - image
# minimale. Le fichier ../site/data/berich-signal.json (ecrit par ce service,
# lu par berich.html) vit dans le meme depot que le site - voir OUTPUT_PATH
# equivalent dans calendar-bridge/fetch_calendar.py pour le meme motif deja
# verifie en production.

FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .

ENV PORT=8080
ENV PYTHONUNBUFFERED=1
EXPOSE 8080

CMD ["python", "server.py"]
