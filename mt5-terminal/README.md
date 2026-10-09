# CHEST · mt5-terminal (v2, 2026-10-09)

Un vrai terminal **MetaTrader 5** sous Wine (image `lprett/mt5linux`) dans un service Railway, connecté
à UN compte (le Live de l'admin). Un Expert Advisor, `CHESTLive.mq5`, tourne dedans et **pousse** vers
`accounts-bridge` (`POST /mt5/ea-push`) : solde, equity, P&L flottant, positions ouvertes toutes les
5 s, plus l'événement « position prise » / « position clôturée » à chaque deal. Le Dashboard lit ça
(`GET /mt5/live`) à la place de Myfxbook, qui ne se met à jour qu'à ses propres moments.

## Ce qui change par rapport à la v1 (retirée le 2026-10-04)

La v1 passait par **RPyC + `mt5.login()` depuis un second service** (`mt5-notify-bridge`) pour
« changer de compte depuis le site » : timeouts de 25 s, boucles, erreurs en cascade. **Tout ça est
supprimé.** Plus de RPyC, plus de `/switch-account`, plus de `mt5-notify-bridge`, plus de API Python
MT5. Le terminal se connecte **une fois** à ton compte (fenêtre de connexion MT5, qui fonctionnait
déjà) et l'EA pousse. Changer de compte = refaire cette connexion à la main dans le terminal (un
terminal ne sert de toute façon qu'un compte à la fois).

## Déploiement Railway

1. Nouveau service `mt5-terminal`, dépôt `chest_sites`, **Root Directory `mt5-terminal`**.
2. **Volume** monté sur **`/data`** (jamais sous `/opt` : un volume sur `/opt` bloquait Wine au 2ᵉ
   démarrage). `persist.sh` y sauvegarde la config MT5 (comptes, EA compilé, preset, **profils de
   graphiques = l'EA reste attaché**) toutes les 30 s et la restaure au boot.
3. Variables d'environnement :

   | Variable | Valeur |
   |---|---|
   | `MT5_LOGIN` / `MT5_PASSWORD` / `MT5_SERVER` | un compte pour que le terminal sorte de son état « fenêtre de connexion bloquante » — idéalement TON compte (mot de passe **investisseur**, lecture seule) |
   | `SERVER` | même valeur que `MT5_SERVER` (variable sans préfixe lue par une autre automation du script upstream) |

   Ne pas exposer de domaine public sur ce service. Pour voir l'écran (noVNC, ports 8080/5901),
   créer un domaine temporaire puis le retirer.
4. Sur `accounts-bridge` : variable **`MT5_EA_SECRET`** (chaîne aléatoire longue). Même valeur dans
   l'EA (voir plus bas). Ce secret est DIFFÉRENT d'`INTERNAL_PUSH_SECRET` : il vit en clair dans le
   terminal Wine.

## Installer l'EA (une seule fois, tout est ensuite persisté)

Console Railway du service `mt5-terminal` :

```bash
mkdir -p /opt/wineprefix/drive_c/MT5/MQL5/Experts
cat > /opt/wineprefix/drive_c/MT5/MQL5/Experts/CHESTLive.mq5 << 'CHESTEOF'
<coller le contenu de mt5-terminal/CHESTLive.mq5>
CHESTEOF

export DISPLAY=:0
wine64 "C:/MT5/metaeditor64.exe" /compile:"C:\MT5\MQL5\Experts\CHESTLive.mq5" /portable /log
# ^ renvoie un code de sortie non nul à cause d'un avertissement Wine inoffensif (libgnutls) même
#   quand la compilation réussit : NE PAS enchaîner avec &&. Lire ensuite :
cat /opt/wineprefix/drive_c/MT5/MQL5/Experts/CHESTLive.log      # doit finir par 0 errors
ls /opt/wineprefix/drive_c/MT5/MQL5/Experts/CHESTLive.ex5
```

Puis dans le terminal (noVNC, temporaire) :
1. **Outils → Options → Expert Advisors** : cocher « Autoriser le trading algorithmique » et
   « Autoriser WebRequest pour les URL suivantes », ajouter
   `https://accounts-bridge-production.up.railway.app`. (Le champ de saisie n'accepte pas les noms de
   touches symboliques `slash`/`period`/`minus` : envoyer les caractères littéraux `/` `.` `-`.)
2. Double-clic sur `CHESTLive` dans le Navigateur : l'EA s'attache au graphique actif. Onglet
   **Entrées** : `EaSecret` = la valeur de `MT5_EA_SECRET`, `PushUrl` = `…/mt5/ea-push`.
3. Dans l'onglet Journal / Experts du terminal, chercher `CHESTLive: demarre`.

## Vérifier

- Logs de l'EA : `…/MT5/MQL5/Logs/*.log` (Console Railway, `tail`). Erreur `4060` = URL non autorisée ;
  `401` = secret différent de `MT5_EA_SECRET`.
- Côté serveur : `GET /mt5/live` (admin) renvoie `{"connected":true,"fresh":true,…}` ; `fresh` passe à
  `false` si aucun envoi depuis 90 s, et le Dashboard retombe tout seul sur Myfxbook.

## Sécurité

L'EA est en **lecture seule** (aucun `OrderSend`). Utiliser le mot de passe **investisseur** : même si le
conteneur était compromis, il ne pourrait pas trader.

## Statut honnête

Écrit le 2026-10-09 à partir de l'historique de la v1. **Non compilé ni testé sur un vrai terminal** :
`CHESTLive.mq5` n'a pas pu être compilé hors de MetaEditor (pas de Wine/MT5 en local). Côté serveur
(`/mt5/ea-push`, `/mt5/live`, notifications, dédoublonnage) et côté navigateur (`js/mt5-live.js`), les
tests locaux passent. Le premier point à valider en réel : que le terminal se connecte à ton compte
Vantage depuis Railway (la connexion par la fenêtre MT5 fonctionnait déjà).
