# CHEST · mt5-terminal — enveloppe fine autour de l'image officielle du projet mt5linux
# (github.com/lucas-campagna/mt5linux) : un vrai terminal MetaTrader 5 sous Wine, dans un conteneur
# Alpine minimal (pas de VNC exposé publiquement ici, juste le port RPyC 18812 en reseau prive
# Railway). Voir README.md de ce dossier pour les variables d'environnement a definir sur Railway.
FROM lprett/mt5linux:latest

# Neutralise login_automation() (2026-09-28, voir CLAUDE.md "Vraie cause trouvee : login_automation")
# - docker/src/automation.sh du paquet mt5linux definit une boucle de fond INFINIE, demarree
# inconditionnellement par docker/src/main.sh, qui clique EN AVEUGLE sur les coordonnees fixes
# (488,449) des qu'une fenetre de terminal64.exe dont le nom contient "Login" existe - sans aucun
# delai apres un clic reussi. Concue a l'origine pour fermer une petite popup de confirmation
# fugace au tout premier demarrage, elle interceptait AUSSI notre propre fenetre "Login to Trade
# Account" ouverte manuellement (meme sous-chaine "Login" dans son titre), la fermant/soumettant en
# quelques centaines de ms avant qu'on ait pu la remplir - la vraie cause de tous les echecs de
# connexion manuelle observes. Patch minimal et cible : supprime seulement les 2 lignes de main.sh
# qui demarrent ce job de fond (`login_automation &` / `LOGIN_PID=$!`) - la fonction reste definie
# (sourcee depuis automation.sh) mais n'est jamais appelee. server_search_automation et
# update_manager_automation restent inchanges (mecanismes differents, sans ce probleme).
RUN sed -i '/^login_automation &$/d; /^LOGIN_PID=\$!$/d' /app/src/main.sh

# Corrige automation.sh:init_wine() (2026-09-28, voir CLAUDE.md "EA installé et branché de bout en
# bout, volume persistant ajouté") - `mkfifo -m 666 $WIN_ROOT/server` n'a AUCUNE protection contre
# un fifo deja existant (verifie ligne par ligne contre le vrai contenu de l'image via son label
# OCI `org.opencontainers.image.revision` = commit 480396e, pas la branche master qui a un tout
# autre code a cet endroit - un premier essai de patch base sur master n'a rien change car le texte
# recherche n'existait pas dans l'image reelle). Inoffensif tant que le filesystem est ephemere (le
# fifo n'existe jamais au redemarrage), mais devient un crash-loop permanent des qu'un volume
# persistant est monte sur /opt (le fifo survit alors entre redemarrages, `mkfifo` echoue a chaque
# boot avec "File exists"). Fix : supprimer le fifo juste avant de le recreer, inconditionnellement.
RUN sed -i 's/^  mkfifo -m 666 \$WIN_ROOT\/server$/  rm -f $WIN_ROOT\/server; mkfifo -m 666 $WIN_ROOT\/server/' /app/src/automation.sh

# Persistance CIBLEE de la config MT5 (2026-09-28, voir CLAUDE.md "Persistance ciblee") - remplace
# la tentative precedente de monter tout /opt sur un volume Railway, qui bloquait `wineboot -init`
# des le 2e demarrage du conteneur pour une cause jamais isolee (cause probable : quelque chose
# dans l'etat interne persiste du profil Wine lui-meme, pas les sockets wineserver qui vivent sous
# /tmp donc ephemeres - verifie en Console). Au lieu de ca, seuls les fichiers de config MT5 utiles
# (ini de compte/permissions, EA compile, preset - voir persist.sh) sont sauvegardes/restaures
# depuis un volume monte sur /data (jamais sous /opt, hors du perimetre du profil Wine et du
# FIRST_RUN check de setup.sh). Points d'ancrage dans main.sh, verifies contre le vrai contenu de
# l'image (meme commit 480396e que les patches precedents) : `restore_persisted_config` juste apres
# `apply_mt5_config` (MT5 vient d'etre extrait, avant que terminal64.exe ne demarre) et
# `persist_config_loop &` juste apres `start_mt5` (sauvegarde par sondage toutes les 30s, pas de
# hook d'arret propre fiable puisque le conteneur peut etre tue brutalement a tout moment).
COPY persist.sh /app/src/persist.sh
RUN chmod +x /app/src/persist.sh \
    && sed -i '/^\. \/app\/src\/mt5\.sh$/a . /app/src/persist.sh' /app/src/main.sh \
    && sed -i '/^apply_mt5_config$/a restore_persisted_config' /app/src/main.sh \
    && sed -i '/^start_mt5$/a persist_config_loop \&' /app/src/main.sh
