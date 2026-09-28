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

# Corrige le bug d'espace manquant dans automation.sh:init_wine() (2026-09-28, voir CLAUDE.md
# "EA installé et branché de bout en bout, volume persistant ajouté") - `[-e $WIN_ROOT/server ] ||
# mkfifo ...` est interprete comme une commande `[-e` inexistante (pas un test), donc l'expression
# echoue TOUJOURS et `mkfifo` s'execute meme quand le fifo existe deja - inoffensif tant que le
# filesystem est ephemere (le fifo n'existe jamais au redemarrage), mais devient un crash-loop
# permanent des qu'un volume persistant est monte sur /opt (le fifo survit alors entre redemarrages).
# Verifie via la vraie source amont (docker/src/automation.sh, ligne 104), pas devine.
RUN sed -i 's/\[-e \$WIN_ROOT\/server \]/[ -e $WIN_ROOT\/server ]/' /app/src/automation.sh
