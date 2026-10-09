#!/bin/sh
# CHEST - prepare l'EA CHESTLive a CHAQUE demarrage du conteneur (voir README.md) :
#   1. copie la source, y injecte le secret/l'URL depuis l'environnement, la compile (MetaEditor headless) ;
#   2. autorise l'EA + WebRequest et l'attache a un graphique via la section [StartUp] du fichier de
#      demarrage (terminal64.exe est lance avec /config:C:/MT5/common.ini, voir mt5.sh de l'image) ;
#   3. recopie les journaux du terminal et de l'EA dans les logs du conteneur (visibles sur Railway),
#      pour pouvoir diagnostiquer connexion, compilation et envois sans ouvrir l'ecran noVNC.
# Toutes les fonctions finissent par `return 0` : main.sh tourne sous `set -e`.

# Redefinit start_mt5 (defini dans mt5.sh de l'image, source AVANT ce fichier). Constat en production le
# 2026-10-09 (journal du terminal) : lance avec `/config:C:/MT5/common.ini`, MT5 lit le chemin comme
# "C:\" ("successfully initialized from start config "C:\"") - le fichier de demarrage n'etait donc JAMAIS
# applique : ni autologin, ni [Experts], ni [StartUp]. Avec des antislashs (forme documentee par
# MetaQuotes : /config:C:\chemin\fichier.ini) le chemin est correct.
start_mt5() {
  wine64 C:/MT5/terminal64.exe /portable '/config:C:\MT5\startup.ini' &
  MT5_PID=$!
  wait_for_terminal64
}

CHEST_EA_SRC=/app/src/CHESTLive.mq5
CHEST_DEFAULT_PUSH_URL="https://accounts-bridge-production.up.railway.app/mt5/ea-push"

chest_prepare_ea() {
  log_info "CHEST: preparation de l'EA CHESTLive"
  EXP_DIR="$MT5/MQL5/Experts"
  # Files/ (fichier d'etat de l'EA) et Logs/ (journal des Print) : absents de cette installation allegee,
  # sans eux l'EA ne peut rien ecrire (Print et FileOpen echouent en silence).
  mkdir -p "$EXP_DIR" "$MT5/Config" "$MT5/MQL5/Files" "$MT5/MQL5/Logs" || true
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

  # --- Fichier de demarrage : TEXTE BRUT (forme documentee par MetaQuotes) ----------------------
  # L'image upstream ecrit common.ini en UTF-16LE SANS BOM ; MT5 ne semble pas l'interpreter (ni autologin
  # ni [StartUp] appliques). startup.ini est donc genere ici en texte brut CRLF, a partir des identifiants
  # deja injectes par apply_mt5_config, auquel on ajoute les sections [Experts] et [StartUp].
  STARTUP="$MT5/startup.ini"
  if [ -f "$MT5/common.ini" ]; then
    iconv -f UTF-16LE -t UTF-8 "$MT5/common.ini" 2>/dev/null | tr -d '\r' > /tmp/chest_common.txt || : > /tmp/chest_common.txt
  else
    : > /tmp/chest_common.txt
  fi
  grep -q '^\[Common\]' /tmp/chest_common.txt || printf '[Common]\nLogin=%s\nServer=%s\nPassword=%s\n' "${MT5_LOGIN:-}" "${MT5_SERVER:-}" "${MT5_PASSWORD:-}" > /tmp/chest_common.txt
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
  awk '{printf "%s\r\n", $0}' /tmp/chest_common2.txt > "$STARTUP"
  rm -f /tmp/chest_common.txt /tmp/chest_common2.txt
  log_info "CHEST: startup.ini genere en texte brut (experts + WebRequest $ORIGIN + EA attache a EURUSD M5)"

  # Reglages propres du terminal (Config/common.ini) : UTF-16LE AVEC BOM, comme les ecrit MT5 lui-meme.
  TERMCFG="$MT5/Config/common.ini"
  if [ -f "$TERMCFG" ]; then
    iconv -f UTF-16 -t UTF-8 "$TERMCFG" 2>/dev/null | tr -d '\r' > /tmp/chest_term.txt || : > /tmp/chest_term.txt
  else
    : > /tmp/chest_term.txt
  fi
  awk '/^\[Experts\]/{skip=1; next} /^\[/{skip=0} !skip{print}' /tmp/chest_term.txt > /tmp/chest_term2.txt
  cat >> /tmp/chest_term2.txt <<EOFTERM
[Experts]
Enabled=1
AllowLiveTrading=1
AllowDllImport=0
WebRequest=1
WebRequestUrl=$ORIGIN
EOFTERM
  { printf '\377\376'; awk '{printf "%s\r\n", $0}' /tmp/chest_term2.txt | iconv -f UTF-8 -t UTF-16LE; } > "$TERMCFG" || true
  rm -f /tmp/chest_term.txt /tmp/chest_term2.txt
  return 0
}

# Recopie periodique des nouvelles lignes des journaux (terminal : connexion au compte ; EA : envois).
chest_tail_logs() {
  tick=0
  while true; do
    sleep 20
    tick=$((tick + 1))
    # Etat resume toutes les 60 s : permet de diagnostiquer a distance (terminal vivant ? journaux ? EA compile ?).
    if [ $((tick % 3)) -eq 1 ]; then
      procs=$(ps 2>/dev/null | grep -c '[t]erminal64' || true)
      tlogs=$(ls "$MT5/Logs" 2>/dev/null | tr '\n' ' ')
      elogs=$(ls "$MT5/MQL5/Logs" 2>/dev/null | tr '\n' ' ')
      ex5="non"; [ -f "$MT5/MQL5/Experts/CHESTLive.ex5" ] && ex5="oui"
      wins=$(xdotool search --onlyvisible --classname terminal64.exe 2>/dev/null | wc -l | tr -d ' ')
      titles=""
      for w in $(xdotool search --onlyvisible --classname terminal64.exe 2>/dev/null | head -n 6); do
        titles="$titles | $(xdotool getwindowname "$w" 2>/dev/null)"
      done
      alllogs=$(find "$MT5" -maxdepth 4 -iname '*.log' 2>/dev/null | sed "s|^$MT5/||" | head -n 10 | tr '\n' ' ')
      log_info "CHEST: etat - terminal64 procs=$procs fenetres=$wins ex5=$ex5 Logs=[$tlogs] MQL5/Logs=[$elogs] tous-logs=[$alllogs] titres=[$titles]"
      if [ "$tick" -eq 1 ]; then
        # Contenu reel du fichier de demarrage et des profils (mot de passe masque) - diagnostic unique.
        tr -d '\r' < "$MT5/startup.ini" 2>/dev/null | sed -e 's/^Password=.*/Password=***/' -e 's/^/[STARTCFG] /'
        iconv -f UTF-16LE -t UTF-8 "$MT5/terminal.ini" 2>/dev/null | tr -d '\r' | grep -i -E 'profile|^\[' | head -n 12 | sed 's/^/[TERMINI] /'
        log_info "CHEST: MQL5 = [$(ls "$MT5/MQL5" 2>/dev/null | tr '\n' ' ')]"
        log_info "CHEST: profils = [$(find "$MT5/Profiles" -maxdepth 3 2>/dev/null | sed "s|^$MT5/Profiles/||" | head -n 15 | tr '\n' ' ')]"
        log_info "CHEST: racine MT5 = [$(ls "$MT5" 2>/dev/null | tr '\n' ' ')] Profiles=[$(ls "$MT5/Profiles" 2>/dev/null | tr '\n' ' ')] Config=[$(ls "$MT5/Config" 2>/dev/null | tr '\n' ' ')]"
      fi
    fi
    # Garde-fou : un compte est configure (MT5_LOGIN) mais l'EA n'a rien ecrit depuis plus de 2 min (apres 4 min
    # de demarrage) - typiquement l'EA a ete retire parce que la synchro du symbole a expire avant la connexion
    # au compte ("symbol synchronization timeout"). On arrete le terminal : main.sh se termine, Railway relance
    # le conteneur (politique ALWAYS) et l'EA se rattache sur un terminal deja connecte.
    if [ -n "${MT5_LOGIN:-}" ] && [ $((tick * 20)) -gt 240 ]; then
      if ! find "$MT5/MQL5/Files/chest_status.txt" -mmin -2 2>/dev/null | grep -q .; then
        log_info "CHEST: EA silencieux depuis plus de 2 min alors qu'un compte est configure - redemarrage du terminal"
        pkill -f terminal64 2>/dev/null || kill $(ps 2>/dev/null | grep '[t]erminal64' | awk '{print $1}') 2>/dev/null || true
        sleep 10
      fi
    fi
    # Etat ecrit par l'EA lui-meme (MQL5/Files/chest_status.txt) : recopie a chaque changement.
    stf="$MT5/MQL5/Files/chest_status.txt"
    if [ -f "$stf" ]; then
      tr -d '\r' < "$stf" > /tmp/chest_status_now.txt
      if ! cmp -s /tmp/chest_status_now.txt /tmp/chest_status_prev.txt 2>/dev/null; then
        sed 's/^/[EASTATUS] /' /tmp/chest_status_now.txt
        cp /tmp/chest_status_now.txt /tmp/chest_status_prev.txt
      fi
    fi
    for spec in "Logs:TERMINAL" "logs:TERMINAL2" "MQL5/Logs:EA" "MQL5/logs:EA2"; do
      dir="${spec%%:*}"; label="${spec##*:}"
      f=$(ls -t "$MT5/$dir"/*.log 2>/dev/null | head -n 1)
      [ -n "$f" ] || continue
      iconv -f UTF-16LE -t UTF-8 "$f" > "/tmp/chest_log_$label.txt" 2>/dev/null || cp "$f" "/tmp/chest_log_$label.txt"
      n=$(wc -l < "/tmp/chest_log_$label.txt" | tr -d ' ')
      prev=$(cat "/tmp/chest_seen_$label" 2>/dev/null || echo 0)
      [ "$n" -lt "$prev" ] && prev=0
      if [ "$n" -gt "$prev" ]; then
        tail -n +$((prev + 1)) "/tmp/chest_log_$label.txt" | tail -n 40 | sed "s/^/[$label] /"
        echo "$n" > "/tmp/chest_seen_$label"
      fi
    done
  done
}
