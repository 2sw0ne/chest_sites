#!/bin/sh
# CHEST - persistance ciblee de la config MT5 (2026-09-28, voir CLAUDE.md "Persistance ciblee")
#
# Monter TOUT /opt sur un volume Railway expose un bug non identifie qui bloque `wineboot -init`
# des le 2e demarrage du conteneur (le 1er demarrage sur un volume vierge reussit toujours, tous
# les suivants restent bloques sur "Initializing Wine..." sans jamais aboutir - confirme deux fois
# de suite via des logs Railway complets, socket wineserver verifiee sous /tmp donc ephemere, pas
# la cause). Plutot que de continuer a deviner sans acces shell fiable au conteneur (Console
# inutilisable pendant un crash-loop), on ne persiste plus QUE ce qui sert vraiment : les .ini de
# compte/permissions MT5, l'EA compile et son preset - jamais le reste du profil Wine (registre,
# dosdevices, sockets) qui reste ephemere a chaque boot comme avant l'ajout de tout volume.
#
# Le volume Railway est monte sur /data (jamais sous /opt) - completement hors du perimetre du
# FIRST_RUN check de setup.sh (qui teste /opt/websockify) et du profil Wine lui-meme.

PERSIST_DIR=/data/mt5-config

# Appelee juste apres apply_mt5_config dans main.sh : a ce stade $MT5 vient d'etre extrait
# (fraichement installe par le FIRST_RUN normal), avant que start_mt5 ne lance terminal64.exe -
# le moment ideal pour reposer notre config sauvegardee par-dessus une installation propre.
restore_persisted_config() {
  [ -d "$PERSIST_DIR" ] || return 0
  mkdir -p "$MT5/Config" "$MT5/MQL5/Experts" "$MT5/MQL5/Presets" || true
  if [ -d "$PERSIST_DIR/Config" ]; then cp -a "$PERSIST_DIR/Config/." "$MT5/Config/" 2>/dev/null || true; fi
  if [ -d "$PERSIST_DIR/Experts" ]; then cp -a "$PERSIST_DIR/Experts/." "$MT5/MQL5/Experts/" 2>/dev/null || true; fi
  if [ -d "$PERSIST_DIR/Presets" ]; then cp -a "$PERSIST_DIR/Presets/." "$MT5/MQL5/Presets/" 2>/dev/null || true; fi
  log_info "Config MT5 restauree depuis $PERSIST_DIR"
  return 0
}

# Lancee en arriere-plan apres start_mt5 : pas de hook d'arret propre fiable (le conteneur peut
# etre tue brutalement a tout moment), donc on sauvegarde par sondage periodique plutot qu'a la
# fermeture - au pire on perd les ~30 dernieres secondes de changement, jamais plus.
persist_config_loop() {
  while true; do
    sleep 30
    mkdir -p "$PERSIST_DIR/Config" "$PERSIST_DIR/Experts" "$PERSIST_DIR/Presets" || true
    cp -a "$MT5/Config/." "$PERSIST_DIR/Config/" 2>/dev/null || true
    cp -a "$MT5/MQL5/Experts/." "$PERSIST_DIR/Experts/" 2>/dev/null || true
    cp -a "$MT5/MQL5/Presets/." "$PERSIST_DIR/Presets/" 2>/dev/null || true
  done
}
