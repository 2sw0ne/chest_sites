#!/bin/sh
# Demarre un ecran virtuel Xvfb en arriere-plan puis lance le serveur Flask
# directement (pas via `xvfb-run`, qui enveloppe tout le process et peut
# bloquer silencieusement Flask si Xvfb met du temps a demarrer). Ainsi
# Flask ecoute sur le port immediatement, independamment de Xvfb/Chrome.
Xvfb :99 -screen 0 1280x1024x24 -nolisten tcp &
export DISPLAY=:99
sleep 1
exec python server.py
