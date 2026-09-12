"""
CHEST - calibration de l'impact reel des annonces macro sur XAU/USD et DXY.

Remplace l'ancienne estimation forfaitaire (IMPACT_BASE = 0.6/0.35/0.15% par
palier d'importance, voir js/calendar.js) par un VRAI coefficient mesure sur
l'historique reel des publications passees, plutot que devine.

Methode, par indicateur cible (voir TARGETS ci-dessous) :
1. Recupere l'historique des publications passees (actual/forecast/previous
   + date/heure exacte UTC) directement depuis la fiche investing.com de cet
   indicateur (donnee "occurrences" embarquee dans leur __NEXT_DATA__, PAS
   besoin du contournement Chrome visible - verifie le 2026-09-11, curl seul
   suffit sur ces pages de fiche, contrairement a la page calendrier
   principale qui bloque curl/urllib).
2. Pour chaque publication passee, calcule la surprise = actual - forecast.
3. Recupere via Twelve Data des bougies 5 minutes autour de l'heure exacte de
   publication, et mesure le VRAI mouvement du prix entre juste avant et 1h
   apres (fenetre resserree pour limiter le bruit d'autres actualites).
4. Regression lineaire simple (moindres carres) : mouvement reel = beta *
   surprise. beta et la correlation sont sauvegardes, avec le nombre de
   points utilises - permet a calendar.js de savoir si le calibrage est
   fiable (grand echantillon, correlation nette) ou fragile (peu de points,
   correlation faible), et de l'afficher avec un avertissement dans ce
   second cas plutot que de le cacher (choix explicite de l'utilisateur).

Contrainte reelle : Twelve Data (compte utilise par CHEST) est plafonne a
800 requetes/jour. Calibrer les ~19 indicateurs cibles avec un historique
correct (jusqu'a 60 points chacun) demande plus d'appels que le quota
journalier - ce script est donc RESUMABLE : il enregistre sa progression
dans calibration_checkpoint.json et s'arrete proprement (sans planter) en
approchant la limite du jour, pour reprendre exactement ou il s'etait
arrete au prochain lancement (le lendemain, une fois le quota reinitialise).

Usage :
    python calibrate_impact.py
    (a relancer chaque jour jusqu'a ce que "TOUT EST CALIBRE" s'affiche)

Ecrit ../site/data/impact-calibration.json (lu par js/calendar.js).
"""

import json
import os
import subprocess
import time
import urllib.parse
from datetime import datetime, timedelta

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"
# Jamais de cle en dur ici (fichier commite) - meme principe que
# site/js/config.local.js (gitignore) : passe ta cle Twelve Data via variable
# d'environnement avant de lancer ce script, ex. (PowerShell) :
#   $env:TWELVE_DATA_API_KEY = "ta-cle"; python calibrate_impact.py
TWELVE_DATA_KEY = os.environ.get("TWELVE_DATA_API_KEY")
if not TWELVE_DATA_KEY:
    raise SystemExit(
        "Variable d'environnement TWELVE_DATA_API_KEY manquante. "
        "Meme cle que celle utilisee dans site/js/config.local.js."
    )

CHECKPOINT_PATH = os.path.join(os.path.dirname(__file__), "calibration_checkpoint.json")
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "site", "data", "impact-calibration.json")

# Budget journalier Twelve Data : plan a 800 requetes/jour au total (partage
# avec calendar.js/BERICH/Strategies) - on se limite volontairement a 650
# pour cette tache par run pour laisser de la marge au reste du site.
DAILY_CALL_BUDGET = 650

# (event_id investing.com, slug complet, pays, libelle, max points vises)
# ids trouves via l'API de recherche interne d'investing.com (curl direct,
# voir README) le 2026-09-11 - a re-verifier si une fiche disparait un jour.
TARGETS = [
    (69, "united-states-consumer-price-index-(cpi)-mom", "US", "CPI (MoM)", 60),
    (56, "united-states-core-consumer-price-index-(cpi)-mom", "US", "Core CPI (MoM)", 60),
    (227, "united-states-nonfarm-payrolls", "US", "Nonfarm Payrolls", 60),
    (300, "united-states-unemployment-rate", "US", "Taux de chômage", 60),
    (294, "united-states-initial-jobless-claims", "US", "Inscriptions chômage (hebdo)", 60),
    (256, "united-states-retail-sales-mom", "US", "Ventes au détail (MoM)", 60),
    (173, "united-states-ism-manufacturing-pmi", "US", "ISM Manufacturing PMI", 60),
    (320, "united-states-michigan-consumer-sentiment", "US", "Michigan Consumer Sentiment", 60),
    (238, "united-states-producer-price-index-(ppi)-mom", "US", "PPI (MoM)", 60),
    (168, "united-states-federal-reserve-interest-rate-decision", "US", "Fed - Décision de taux", 40),
    (68, "european-consumer-price-index-(cpi)-yoy", "EU", "CPI (YoY)", 60),
    (120, "european-gross-domestic-product-(gdp)-qoq", "EU", "PIB (QoQ)", 40),
    (164, "european-interest-rate-decision", "EU", "BCE - Décision de taux", 40),
    (67, "united-kingdom-consumer-price-index-(cpi)-yoy", "UK", "CPI (YoY)", 60),
    (121, "united-kingdom-gross-domestic-product-(gdp)-qoq", "UK", "PIB (QoQ)", 40),
    (170, "united-kingdom-interest-rate-decision", "UK", "BoE - Décision de taux", 40),
    (992, "japan-national-consumer-price-index-(cpi)-yoy", "JP", "CPI national (YoY)", 60),
    (119, "japan-gross-domestic-product-(gdp)-qoq", "JP", "PIB (QoQ)", 40),
    (165, "japan-interest-rate-decision", "JP", "BoJ - Décision de taux", 40),
]

PAIRS_TO_CALIBRATE = {
    "XAUUSD": "XAU/USD",
    # DXY retire : pas un symbole valide sur Twelve Data (404 confirme le
    # 2026-09-11 - seuls des ETF proxy comme UUP/UDN existent, pas fiables
    # pour un historique 5min precis) - chaque tentative faisait echouer TOUT
    # le point (voir `ok` dans process_indicator), gaspillant le quota pour
    # rien. Le "Est. DXY" du site reste sur l'heuristique forfaitaire.
}


def fetch_via_curl(url, timeout=30):
    result = subprocess.run(["curl", "-s", "-A", UA, url], capture_output=True, timeout=timeout)
    return result.stdout.decode("utf-8", errors="replace")


def get_occurrences(event_id, slug):
    html = fetch_via_curl(f"https://www.investing.com/economic-calendar/{slug}-{event_id}")
    import re
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        raise RuntimeError(f"__NEXT_DATA__ introuvable pour {slug}-{event_id}")
    data = json.loads(m.group(1))
    occ = data["props"]["pageProps"]["state"]["economicCalendarEventStore"]["occurrences"]
    return occ


def twelvedata_5min(symbol, start_dt, end_dt):
    url = (
        f"https://api.twelvedata.com/time_series?symbol={urllib.parse.quote(symbol)}&interval=5min"
        f"&start_date={urllib.parse.quote(start_dt)}&end_date={urllib.parse.quote(end_dt)}&apikey={TWELVE_DATA_KEY}"
    )
    raw = fetch_via_curl(url)
    data = json.loads(raw)
    if isinstance(data, dict) and data.get("status") == "error":
        raise RuntimeError(data.get("message"))
    return data.get("values") or []


def closest_candle(candles, target_dt):
    best, best_diff = None, None
    for c in candles:
        dt = datetime.fromisoformat(c["datetime"])
        diff = abs((dt - target_dt).total_seconds())
        if best_diff is None or diff < best_diff:
            best_diff, best = diff, c
    return best, best_diff


def load_checkpoint():
    try:
        with open(CHECKPOINT_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_checkpoint(cp):
    with open(CHECKPOINT_PATH, "w", encoding="utf-8") as f:
        json.dump(cp, f, ensure_ascii=False, indent=2)


def linreg(xs, ys):
    n = len(xs)
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    cov = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    var_x = sum((x - mean_x) ** 2 for x in xs)
    beta = cov / var_x if var_x else 0.0
    var_y = sum((y - mean_y) ** 2 for y in ys)
    corr = cov / (var_x ** 0.5 * var_y ** 0.5) if var_x and var_y else 0.0
    return beta, corr


def confidence_tier(n, corr):
    if n >= 30 and abs(corr) >= 0.35:
        return "bonne"
    if n >= 15 and abs(corr) >= 0.2:
        return "moyenne"
    return "faible"


def process_indicator(event_id, slug, country, label, max_points, cp, calls_left):
    key = str(event_id)
    entry = cp.setdefault(key, {"country": country, "label": label, "points": {}, "occurrences_fetched": False})

    if not entry["occurrences_fetched"]:
        try:
            occurrences = get_occurrences(event_id, slug)
        except Exception as exc:
            print(f"  [{label}] impossible de recuperer l'historique : {exc}")
            return calls_left
        # IMPORTANT : "actual"/"forecast" (valeurs DEJA mises a l'echelle
        # d'affichage par investing.com, ex. 0.4 pour "0,4 %" ou 162 pour
        # "162K" emplois) - PAS "actualRaw"/"forecastRaw" (valeurs brutes non
        # mises a l'echelle, ex. 0.004 ou 162000). Le site (calendar.js)
        # parse les memes chaines affichees ("0,4 %", "162K") avec
        # parseFloat, qui s'arrete au premier caractere non numerique et
        # retombe donc SUR CETTE MEME ECHELLE (0.4, 162) - utiliser les
        # valeurs brutes ici aurait donne un beta 100x a 1000x trop petit
        # (constate le 2026-09-12 : deja calibre une fois avec actualRaw,
        # betas inutilisables, tout recalibre depuis zero avec ce correctif).
        entry["all_occurrences"] = [
            {
                "occurrence_id": o["occurrence_id"],
                "time": o["occurrence_time"],
                "actual": o.get("actual"),
                "forecast": o.get("forecast"),
                "reference_period": o.get("reference_period"),
            }
            for o in occurrences
            if o.get("occurrence_time") and o.get("actual") is not None and o.get("forecast") is not None
        ][:max_points]
        entry["occurrences_fetched"] = True
        save_checkpoint(cp)

    todo = [o for o in entry["all_occurrences"] if str(o["occurrence_id"]) not in entry["points"]]
    if not todo:
        return calls_left

    print(f"  [{label}] {len(todo)} publications restantes a mesurer ({len(entry['all_occurrences'])} au total)")

    for occ in todo:
        if calls_left < len(PAIRS_TO_CALIBRATE) + 1:
            print(f"  [{label}] budget du jour epuise, on s'arrete proprement ici")
            return calls_left

        surprise = occ["actual"] - occ["forecast"]
        release_dt = datetime.fromisoformat(occ["time"].replace("Z", ""))
        start = (release_dt - timedelta(minutes=20)).strftime("%Y-%m-%d %H:%M:%S")
        end = (release_dt + timedelta(minutes=70)).strftime("%Y-%m-%d %H:%M:%S")

        reactions = {}
        ok = True
        for pair_key, symbol in PAIRS_TO_CALIBRATE.items():
            try:
                candles = twelvedata_5min(symbol, start, end)
                calls_left -= 1
            except Exception as exc:
                print(f"    erreur Twelve Data ({symbol}, {occ['reference_period']}) : {exc}")
                ok = False
                time.sleep(8.5)
                continue
            time.sleep(8.5)  # 8 requetes/minute max sur ce plan
            if len(candles) < 2:
                ok = False
                continue
            before, _ = closest_candle(candles, release_dt - timedelta(minutes=5))
            after, _ = closest_candle(candles, release_dt + timedelta(minutes=60))
            if not before or not after:
                ok = False
                continue
            before_px, after_px = float(before["close"]), float(after["close"])
            reactions[pair_key] = (after_px - before_px) / before_px * 100

        if ok and reactions:
            entry["points"][str(occ["occurrence_id"])] = {"surprise": surprise, "reactions": reactions}
            save_checkpoint(cp)
            # reference_period est None pour certains indicateurs hebdomadaires
            # (ex. inscriptions chomage, pas de "mois" associe) - a fait planter
            # tout le run en plein milieu la premiere fois (donnee deja
            # sauvegardee juste au-dessus, seul l'affichage plantait).
            period = occ["reference_period"] or occ["time"][:10]
            print(f"    {period:>10} surprise={surprise:+.4f} -> {reactions}")

    return calls_left


def build_output(cp):
    result = {"generated_at": datetime.utcnow().isoformat() + "Z", "indicators": {}}
    for key, entry in cp.items():
        points = list(entry.get("points", {}).values())
        if len(points) < 5:
            continue
        per_pair = {}
        for pair_key in PAIRS_TO_CALIBRATE:
            xs = [p["surprise"] for p in points if pair_key in p["reactions"]]
            ys = [p["reactions"][pair_key] for p in points if pair_key in p["reactions"]]
            if len(xs) < 5:
                continue
            beta, corr = linreg(xs, ys)
            std_surprise = (sum((x - sum(xs) / len(xs)) ** 2 for x in xs) / len(xs)) ** 0.5
            per_pair[pair_key] = {
                "beta": round(beta, 4),
                "correlation": round(corr, 3),
                "n": len(xs),
                "stdSurprise": round(std_surprise, 5),
                "confidence": confidence_tier(len(xs), corr),
            }
        if per_pair:
            result["indicators"][key] = {
                "country": entry["country"],
                "label": entry["label"],
                "pairs": per_pair,
            }
    return result


def main():
    usage_raw = fetch_via_curl(f"https://api.twelvedata.com/api_usage?apikey={TWELVE_DATA_KEY}")
    try:
        usage = json.loads(usage_raw)
        remaining_today = max(0, usage.get("plan_daily_limit", 800) - usage.get("daily_usage", 0))
    except Exception:
        remaining_today = DAILY_CALL_BUDGET
    calls_left = min(DAILY_CALL_BUDGET, remaining_today - 20)  # marge de securite pour le reste du site
    print(f"Budget Twelve Data disponible pour ce run : {calls_left} appels")

    cp = load_checkpoint()
    all_done = True
    for event_id, slug, country, label, max_points in TARGETS:
        if calls_left < len(PAIRS_TO_CALIBRATE) + 1:
            print("Budget du jour epuise - relancer ce script demain pour continuer.")
            all_done = False
            break
        print(f"\n=== {country} - {label} ===")
        try:
            calls_left = process_indicator(event_id, slug, country, label, max_points, cp, calls_left)
        except Exception as exc:
            # Ne jamais laisser une erreur sur UN indicateur tuer tout le run
            # (deja arrive une fois - voir historique) - la progression deja
            # sauvegardee (save_checkpoint est appele des qu'un point reussit)
            # n'est pas perdue, on passe juste au suivant.
            print(f"  ERREUR inattendue sur {label}, on passe au suivant : {exc}")
        entry = cp.get(str(event_id), {})
        remaining = [o for o in entry.get("all_occurrences", []) if str(o["occurrence_id"]) not in entry.get("points", {})]
        if remaining:
            all_done = False

    output = build_output(cp)
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"\n{len(output['indicators'])}/{len(TARGETS)} indicateurs calibres (avec >=5 points) -> {os.path.abspath(OUTPUT_PATH)}")

    if all_done:
        print("TOUT EST CALIBRE.")
    else:
        print("Calibration partielle - relancer ce script demain (quota Twelve Data reinitialise) pour continuer.")


if __name__ == "__main__":
    main()
