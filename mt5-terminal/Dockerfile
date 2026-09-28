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
