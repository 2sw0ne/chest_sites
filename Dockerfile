# CHEST - comptes utilisateurs (service Railway)
#
# Contrairement a calendar-bridge, aucun navigateur ici (pas de Playwright,
# pas de Chrome, pas de Xvfb) - juste Flask + sqlite3 (bibliotheque standard
# Python, rien a installer). Image minimale.

FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .

ENV PORT=8080
ENV PYTHONUNBUFFERED=1
EXPOSE 8080

CMD ["python", "server.py"]
