#!/bin/sh
# CHEST - prepare l'EA CHESTLive a CHAQUE demarrage du conteneur (voir README.md) :
#   1. copie la source, y injecte le secret/l'URL depuis l'environnement, la compile (MetaEditor headless) ;
#   2. autorise l'EA + WebRequest et l'attache a un graphique via la section [StartUp] du fichier de
#      demarrage (terminal64.exe est lance avec /config:C:/MT5/common.ini, voir mt5.sh de l'image) ;
#   3. recopie les journaux du terminal et de l'EA dans les logs du conteneur (visibles sur Railway),
#      pour pouvoir diagnostiquer connexion, compilation et envois sans ouvrir l'ecran noVNC.
# Toutes les fonctions finissent par `return 0` : main.sh tourne sous `set -e`.

CHEST_EA_SRC=/app/src/CHESTLive.mq5
CHEST_DEFAULT_PUSH_URL="https://accounts-bridge-production.up.railway.app/mt5/ea-push"

chest_prepare_ea() {
  log_info "CHEST: preparation de l'EA CHESTLive"
  EXP_DIR="$MT5/MQL5/Experts"
  mkdir -p "$EXP_DIR" "$MT5/Config" || true
  if ! cp "$CHEST_EA_SRC" "$EXP_DIR/CHESTLive.mq5"; then
    log_info "CHEST: source de l'EA introuvable ($CHEST_EA_SRC)"
    return 0
  fi

  # Secret et URL viennent de l'environnement du conteneur : jamais commites.
  SECRET=$(printf '%s' "${MT5_EA_SECRET:-}" | tr -cd 'A-Za-z0-9_-')
  PUSH_URL="${MT5_PUSH_URL:-$CHEST_DEFAULT_PUSH_URL}"
  if [ -n "$SECRET" ]; then
    sed -i -E "s|^input string EaSecret *= *\"\";|input string EaSecret    = \"$SECRET\";|" "$EXP_DIR/CHESTLive.mq5" || true
  else
    log_info "CHEST: MT5_EA_SECRET absent - l'EA enverra un secret vide (refuse 401 par accounts-bridge)"
  fi
  sed -i -E "s|^input string PushUrl *= *\"[^\"]*\";|input string PushUrl     = \"$PUSH_URL\";|" "$EXP_DIR/CHESTLive.mq5" || true
  ORIGIN=$(printf '%s' "$PUSH_URL" | sed -E 's#^(https?://[^/]+).*#\1#')

  # --- Compilation headless -------------------------------------------------------------------
  export DISPLAY=:0
  rm -f "$EXP_DIR/CHESTLive.ex5" "$EXP_DIR/CHESTLive.log"
  wine64 "C:/MT5/metaeditor64.exe" /compile:"C:\\MT5\\MQL5\\Experts\\CHESTLive.mq5" /portable /log >/dev/null 2>&1 || true
  if [ -f "$EXP_DIR/CHESTLive.log" ]; then
    iconv -f UTF-16LE -t UTF-8 "$EXP_DIR/CHESTLive.log" 2>/dev/null | sed 's/^/[EA-COMPILE] /' || true
  fi
  if [ -f "$EXP_DIR/CHESTLive.ex5" ]; then
    log_info "CHEST: EA CHESTLive compile (CHESTLive.ex5 present)"
  else
    log_info "CHEST: ECHEC de compilation de l'EA - voir les lignes [EA-COMPILE] ci-dessus"
  fi

  # --- Fichier de demarrage : experts autorises + EA attache a un graphique ----------------------
  STARTUP="$MT5/common.ini"
  if [ -f "$STARTUP" ]; then
    iconv -f UTF-16LE -t UTF-8 "$STARTUP" > /tmp/chest_common.txt 2>/dev/null || cp "$STARTUP" /tmp/chest_common.txt
    awk '/^\[Experts\]/{skip=1; next} /^\[StartUp\]/{skip=1; next} /^\[/{skip=0} !skip{print}' /tmp/chest_common.txt > /tmp/chest_common2.txt
    cat >> /tmp/chest_common2.txt <<EOFSTART
[Experts]
Enabled=1
AllowLiveTrading=1
AllowDllImport=0
WebRequest=1
WebRequestUrl=$ORIGIN

[StartUp]
Expert=CHESTLive
Symbol=EURUSD
Period=M5
EOFSTART
    iconv -f UTF-8 -t UTF-16LE /tmp/chest_common2.txt > "$STARTUP" || true
    rm -f /tmp/chest_common.txt /tmp/chest_common2.txt
    log_info "CHEST: demarrage configure (experts + WebRequest $ORIGIN + EA attache a EURUSD M5)"
  else
    log_info "CHEST: $STARTUP absent - EA non attache automatiquement"
  fi

  # Reglages propres du terminal (Config/common.ini) : memes cles, section [Experts] seulement.
  TERMCFG="$MT5/Config/common.ini"
  if [ -f "$TERMCFG" ]; then
    iconv -f UTF-16LE -t UTF-8 "$TERMCFG" > /tmp/chest_term.txt 2>/dev/null || cp "$TERMCFG" /tmp/chest_term.txt
    awk '/^\[Experts\]/{skip=1; next} /^\[/{skip=0} !skip{print}' /tmp/chest_term.txt > /tmp/chest_term2.txt
  else
    : > /tmp/chest_term2.txt
  fi
  cat >> /tmp/chest_term2.txt <<EOFTERM
[Experts]
Enabled=1
AllowLiveTrading=1
AllowDllImport=0
WebRequest=1
WebRequestUrl=$ORIGIN
EOFTERM
  iconv -f UTF-8 -t UTF-16LE /tmp/chest_term2.txt > "$TERMCFG" || true
  rm -f /tmp/chest_term.txt /tmp/chest_term2.txt
  return 0
}

# Recopie periodique des nouvelles lignes des journaux (terminal : connexion au compte ; EA : envois).
chest_tail_logs() {
  while true; do
    sleep 20
    for spec in "Logs:TERMINAL" "MQL5/Logs:EA"; do
      dir="${spec%%:*}"; label="${spec##*:}"
      f=$(ls -t "$MT5/$dir"/*.log 2>/dev/null | head -n 1)
      [ -n "$f" ] || continue
      key=$(printf '%s' "$label")
      iconv -f UTF-16LE -t UTF-8 "$f" > "/tmp/chest_log_$key.txt" 2>/dev/null || cp "$f" "/tmp/chest_log_$key.txt"
      n=$(wc -l < "/tmp/chest_log_$key.txt" | tr -d ' ')
      prev=$(cat "/tmp/chest_seen_$key" 2>/dev/null || echo 0)
      [ "$n" -lt "$prev" ] && prev=0
      if [ "$n" -gt "$prev" ]; then
        tail -n +$((prev + 1)) "/tmp/chest_log_$key.txt" | tail -n 40 | sed "s/^/[$label] /"
        echo "$n" > "/tmp/chest_seen_$key"
      fi
    done
  done
}
