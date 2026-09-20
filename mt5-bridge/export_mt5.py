"""
CHEST - pont local MT5 -> Dashboard.

Lit les données du compte MT5 actuellement connecté sur cette machine
(le terminal MT5 doit être ouvert et loggé) et écrit un data.json que
le Dashboard lit en fetch(). Aucun identifiant ne transite jamais vers
le site : ce script tourne uniquement en local.

Le plus simple pour une personne non technique : double-clique sur
lancer-sync.bat (Windows) - il installe MetaTrader5 si besoin, pose 4
questions au tout premier lancement (nom du compte, type, broker, objectifs
de challenge) puis synchronise en boucle tant que la fenêtre reste ouverte.
Ces reponses sont sauvegardees dans config.json (jamais commite, propre a
chaque machine) - pas besoin d'ouvrir ce fichier .py pour se configurer.

Installation manuelle :
    pip install MetaTrader5

Utilisation ponctuelle :
    python export_mt5.py

Utilisation en continu (répète toutes les 60s tant que la fenêtre reste ouverte) :
    python export_mt5.py --loop

Pour une synchronisation automatique en arrière-plan, préférer le
Planificateur de tâches Windows (toutes les 1 à 5 minutes) plutôt que
--loop, qui bloque la fenêtre.
"""

import sys
import os
import json
import time
import argparse
from datetime import datetime, timedelta, timezone

# La console Windows par defaut (cmd.exe lance par lancer-sync.bat) utilise
# souvent un codepage (cp1252/cp850) qui ne sait pas encoder certains
# caracteres Unicode (fleches, emoji) - un print() planterait le script en
# UnicodeEncodeError. errors="replace" degrade proprement (caractere illisible
# affiche) plutot que de crasher - constate en testant ce script (2026-09-14).
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

try:
    import MetaTrader5 as mt5
except ImportError:
    print("Le module MetaTrader5 n'est pas installé. Lance : pip install MetaTrader5")
    sys.exit(1)

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.json")
DEFAULT_CONFIG = {
    "account_name": "Mon compte MT5",
    "account_type": "Démo",
    "broker_label": "MT5",
    "objectives": {
        "min_trading_days": 5,
        "max_daily_loss_pct": 4.0,
        "max_loss_pct": 8.0,
        "profit_target_pct": 10.0,
    },
}
REFRESH_SECONDS = 60  # utilisé seulement en mode --loop

OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "site", "data", "data.json")


def ask(question, default):
    """input() avec une valeur par defaut si la personne appuie juste sur Entree."""
    answer = input(f"{question} [{default}] : ").strip()
    return answer if answer else default


def ask_float(question, default):
    while True:
        raw = ask(question, str(default))
        try:
            return float(raw)
        except ValueError:
            print("  -> réponds avec un nombre (ex. 8 ou 4.5).")


def run_setup_wizard():
    """Pose quelques questions une seule fois - pas besoin d'ouvrir le code
    pour configurer son compte, pense pour quelqu'un qui ne connaît pas
    Python (retour direct utilisateur : la famille/les amis qui trading
    doivent pouvoir s'en servir sans toucher au fichier .py)."""
    print("Première configuration de ton pont CHEST <-> MT5 (une seule fois).\n")
    cfg = {
        "account_name": ask("Nom du compte (affiché dans CHEST)", DEFAULT_CONFIG["account_name"]),
        "account_type": ask("Type de compte (Démo / 2-Step / 1-Step...)", DEFAULT_CONFIG["account_type"]),
        "broker_label": ask("Nom de ton broker/propfirm (ex. Vantage, FTMO)", DEFAULT_CONFIG["broker_label"]),
        "objectives": {
            "min_trading_days": ask_float("Jours de trading minimum exigés", DEFAULT_CONFIG["objectives"]["min_trading_days"]),
            "max_daily_loss_pct": ask_float("Perte journalière max autorisée (%)", DEFAULT_CONFIG["objectives"]["max_daily_loss_pct"]),
            "max_loss_pct": ask_float("Perte totale max autorisée (%)", DEFAULT_CONFIG["objectives"]["max_loss_pct"]),
            "profit_target_pct": ask_float("Objectif de profit (%)", DEFAULT_CONFIG["objectives"]["profit_target_pct"]),
        },
    }
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    print(f"\nConfiguration enregistrée dans {CONFIG_PATH} — modifiable à tout moment en relançant ce script après l'avoir supprimé, ou en éditant ce fichier directement.\n")
    return cfg


def load_config():
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return run_setup_wizard()


CONFIG = load_config()
ACCOUNT_NAME = CONFIG["account_name"]
ACCOUNT_TYPE = CONFIG["account_type"]
BROKER_LABEL = CONFIG["broker_label"]
OBJECTIVES = CONFIG["objectives"]


def connect():
    if not mt5.initialize():
        print("Échec de connexion à MT5 :", mt5.last_error())
        print("Vérifie que le terminal MT5 est ouvert et connecté à ton compte.")
        sys.exit(1)


def get_deals(days_back):
    now = datetime.now()
    start = now - timedelta(days=days_back)
    deals = mt5.history_deals_get(start, now)
    return list(deals) if deals else []


def closed(deals):
    return [d for d in deals if d.entry == mt5.DEAL_ENTRY_OUT]


def net(d):
    return d.profit + d.swap + d.commission


def build_equity_curve(deals, starting_balance):
    deals_sorted = sorted(deals, key=lambda d: d.time)
    equity = [round(starting_balance, 2)]
    running = starting_balance
    for d in deals_sorted:
        running += net(d)
        equity.append(round(running, 2))
    return equity if len(equity) > 1 else [starting_balance, starting_balance]


def max_drawdown_pct(equity):
    peak = equity[0]
    worst = 0.0
    for v in equity:
        peak = max(peak, v)
        if peak:
            worst = min(worst, (v - peak) / peak * 100)
    return round(worst, 2)


def money(v):
    sign = "+" if v >= 0 else "-"
    return f"{sign}${abs(v):,.0f}"


def period_stats(deals, starting_balance, sub_label):
    c = closed(deals)
    n = len(c)
    wins = [d for d in c if d.profit > 0]
    losses = [d for d in c if d.profit < 0]
    equity = build_equity_curve(c, starting_balance)
    total = sum(net(d) for d in c)
    profit_pct = (total / starting_balance * 100) if starting_balance else 0
    winrate = (len(wins) / n * 100) if n else 0
    avg_win = (sum(d.profit for d in wins) / len(wins)) if wins else 0
    avg_loss = (abs(sum(d.profit for d in losses)) / len(losses)) if losses else 0
    rr = (avg_win / avg_loss) if avg_loss else 0

    return {
        "profit": f"{'+' if profit_pct >= 0 else ''}{profit_pct:.1f}%",
        "profitSub": f"{money(total)} {sub_label}",
        "rr": f"{rr:.1f}",
        "winrate": f"{winrate:.0f}%",
        "winrateSub": f"{len(wins)}/{n} trades",
        "dd": f"{max_drawdown_pct(equity):.1f}%",
        "ddSub": "pic → creux sur la période",
        "equity": equity,
    }


def daily_pnl_series(all_deals, days):
    """Liste de P&L net par jour calendaire, du plus ancien au plus récent."""
    today = datetime.now().date()
    buckets = {today - timedelta(days=i): 0.0 for i in range(days - 1, -1, -1)}
    for d in closed(all_deals):
        day = datetime.fromtimestamp(d.time).date()
        if day in buckets:
            buckets[day] += net(d)
    return [round(v, 2) for v in buckets.values()]


def build_objectives(all_stats, day_deals, all_deals, starting_balance):
    trading_days = len({datetime.fromtimestamp(d.time).date() for d in closed(all_deals)})
    today_pnl = sum(net(d) for d in closed(day_deals))
    today_pct = (today_pnl / starting_balance * 100) if starting_balance else 0
    overall_dd = max_drawdown_pct(build_equity_curve(closed(all_deals), starting_balance))
    profit_pct = float(all_stats["profit"].replace("%", "").replace("+", ""))

    return [
        {
            "label": "Minimum Trading Days",
            "target": f"{OBJECTIVES['min_trading_days']} jours",
            "current": f"{trading_days} jours",
            "ok": trading_days >= OBJECTIVES["min_trading_days"],
        },
        {
            "label": "Max Daily Loss",
            "target": f"-${starting_balance * OBJECTIVES['max_daily_loss_pct'] / 100:,.2f} ({OBJECTIVES['max_daily_loss_pct']:.0f}%)",
            "current": f"{money(today_pnl)} ({today_pct:+.2f}%)",
            "ok": today_pct >= -OBJECTIVES["max_daily_loss_pct"],
        },
        {
            "label": "Max Loss",
            "target": f"-${starting_balance * OBJECTIVES['max_loss_pct'] / 100:,.2f} ({OBJECTIVES['max_loss_pct']:.0f}%)",
            "current": f"{overall_dd:.2f}%",
            "ok": overall_dd >= -OBJECTIVES["max_loss_pct"],
        },
        {
            "label": "Profit Target",
            "target": f"${starting_balance * OBJECTIVES['profit_target_pct'] / 100:,.2f} ({OBJECTIVES['profit_target_pct']:.0f}%)",
            "current": f"{'+' if profit_pct >= 0 else ''}{profit_pct:.1f}%",
            "ok": profit_pct >= OBJECTIVES["profit_target_pct"],
        },
    ]


def run_once():
    connect()
    acc = mt5.account_info()
    if acc is None:
        print("Impossible de lire le compte — vérifie que MT5 est ouvert et connecté.")
        mt5.shutdown()
        return False

    starting_balance = acc.balance - acc.profit  # approximation : solde hors positions flottantes

    all_deals = get_deals(365)
    day_deals = get_deals(1)
    week_deals = get_deals(7)
    month_deals = get_deals(30)

    day_stats = period_stats(day_deals, starting_balance, "aujourd'hui")
    all_stats = period_stats(all_deals, starting_balance, f"depuis ${starting_balance:,.0f}")

    data = {
        "account": {
            "name": ACCOUNT_NAME,
            "number": str(acc.login),
            "type": ACCOUNT_TYPE,
            "broker": f"{acc.company} · {BROKER_LABEL}",
            "balance": round(acc.balance, 2),
            "equity": round(acc.equity, 2),
            "pnl": round(acc.equity - acc.balance, 2),
            "today": round(sum(net(d) for d in closed(day_deals)), 2),
        },
        "day": day_stats,
        "week": period_stats(week_deals, starting_balance, "cette semaine"),
        "month": period_stats(month_deals, starting_balance, "ce mois"),
        "all": all_stats,
        "objectives": build_objectives(all_stats, day_deals, all_deals, starting_balance),
        "calendar14": daily_pnl_series(all_deals, 14),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"[{datetime.now().strftime('%H:%M:%S')}] OK — écrit dans {os.path.abspath(OUTPUT_PATH)}")
    mt5.shutdown()
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--loop", action="store_true", help="répète toutes les %d s tant que la fenêtre reste ouverte" % REFRESH_SECONDS)
    args = parser.parse_args()

    if not args.loop:
        run_once()
        return

    print(f"Synchronisation toutes les {REFRESH_SECONDS}s — Ctrl+C pour arrêter.")
    try:
        while True:
            run_once()
            time.sleep(REFRESH_SECONDS)
    except KeyboardInterrupt:
        print("Arrêté.")


if __name__ == "__main__":
    main()
