"""
CHEST - calendrier economique (US / EU / UK / JP, impact eleve).

Deux sources combinees, chacune pour ce qu'elle fait de mieux :

1. investing.com/economic-calendar/ pour AUJOURD'HUI : leurs donnees
   sont embarquees en JSON structure dans la page (bloc __NEXT_DATA__),
   avec un vrai "forecast" et une notation d'importance (1-3) qui
   correspond a ce qu'on attend habituellement (ex: le PIB trimestriel
   y est note 3/haute, alors que tradingeconomics.com le note 2/moyenne
   pour le meme evenement - verifie le 2026-09-07). Limite : leur page
   ne montre que le jour courant en HTML simple, le reste se charge via
   une API interne qu'on ne reproduit pas ici (trop fragile/limite).

2. tradingeconomics.com/calendar pour les JOURS SUIVANTS : leur page
   liste ~10 jours a l'avance, utile pour la vue "a venir" meme si leur
   notation d'importance est parfois plus stricte que ce qu'on voudrait.

Sources publiques (pas les API payantes), pas de robots.txt qui
l'interdit sur l'une ou l'autre, licences "usage personnel" compatibles.
Mais ce n'est le produit officiel d'aucun des deux : usage strictement
personnel, ne jamais republier la donnee brute, ne pas relancer trop
souvent (le cache cote site est de toute facon sur plusieurs heures).
Fragile par nature (HTML/JSON interne qui peut changer sans prevenir).

Usage :
    python fetch_calendar.py

Ecrit ../site/data/calendar.json, lu par la page Calendrier du site.
"""

import hashlib
import json
import os
import re
import subprocess
import sys
import urllib.request
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sync_playwright = None

OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "site", "data", "calendar.json")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"

# Les deux sources donnent leurs heures en UTC (verifie le 2026-09-07 : le PIB
# japonais scrape a "23:50" UTC correspond bien aux "01:50" affiches par
# investing.com lui-meme pour un visiteur en France/GMT+2). On reconvertit
# systematiquement vers Paris pour que les heures et le jour affiche
# correspondent exactement a ce que l'utilisateur verrait sur investing.com.
PARIS_TZ = ZoneInfo("Europe/Paris")

TE_COUNTRIES = {"united states", "euro area", "european union", "united kingdom", "japan"}
TE_IMPORTANCE_MAP = {"1": "low", "2": "medium", "3": "high"}
INV_COUNTRIES = {"United States", "European Union", "United Kingdom", "Japan"}
COUNTRY_LABEL = {
    "united states": "US", "united states of america": "US", "United States": "US",
    "euro area": "EU", "european union": "EU", "European Union": "EU",
    "united kingdom": "UK", "United Kingdom": "UK",
    "japan": "JP", "Japan": "JP",
}

# Biais directionnel approximatif : quand la valeur reelle depasse le consensus,
# est-ce plutot haussier ("up") ou baissier ("down") pour la devise du pays ?
# Heuristique a base de mots-cles, pas un modele - affichee comme telle sur le site.
DIRECTION_BIAS = {
    "inflation": "up", "cpi": "up", "ppi": "up", "gdp": "up", "gross domestic": "up",
    "retail sales": "up", "payroll": "up", "ism": "up", "pmi": "up",
    "consumer confidence": "up", "consumer sentiment": "up", "trade balance": "up",
    "industrial production": "up", "unemployment": "down", "jobless claims": "down",
}

# Meme heuristique que DIRECTION_BIAS mais sur les intitules francais
# d'investing.com (fr.investing.com traduit deja tout lui-meme).
DIRECTION_BIAS_FR = {
    "inflation": "up", "ipc": "up", "prix à la production": "up",
    "produit intérieur brut": "up", "pib": "up",
    "ventes au détail": "up", "emplois non agricoles": "up", "création d'emploi": "up",
    "pmi": "up", "confiance des consommateurs": "up", "sentiment des consommateurs": "up",
    "balance commerciale": "up", "production industrielle": "up",
    "chômage": "down",
}


def guess_direction_fr(text):
    t = text.lower()
    for kw, direction in DIRECTION_BIAS_FR.items():
        if kw in t:
            return direction
    return None


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.read().decode("utf-8", errors="ignore")


def fetch_via_curl(url):
    """Certains sites (investing.com) fingerprintent le client TLS et bloquent
    urllib (403) tout en laissant passer curl. On shell-out sur curl, dispo
    nativement sur Windows 10+/macOS/Linux, plutot que urllib pour ces cas-la."""
    result = subprocess.run(
        ["curl", "-sL", "-A", UA, "--max-time", "20", url],
        capture_output=True, text=True, encoding="utf-8", errors="ignore",
    )
    if result.returncode != 0 or not result.stdout:
        raise RuntimeError(f"curl a echoue (code {result.returncode}): {result.stderr[:200]}")
    return result.stdout


def guess_direction(text):
    t = text.lower()
    for kw, direction in DIRECTION_BIAS.items():
        if kw in t:
            return direction
    return None


def utc_iso_to_paris(iso_str):
    """ISO UTC (champ 'time' d'investing.com) -> (date, heure 'HH:MM') heure de Paris.
    Peut faire changer le jour (ex: 23h50 UTC -> 01h50 le lendemain en ete)."""
    if not iso_str:
        return None, None
    try:
        dt_utc = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
    except ValueError:
        return None, None
    dt_paris = dt_utc.astimezone(PARIS_TZ)
    return dt_paris.strftime("%Y-%m-%d"), dt_paris.strftime("%H:%M")


def utc_date_time12h_to_paris(date_str, time12h_str):
    """Date UTC + heure 'HH:MM AM/PM' (Trading Economics) -> (date, heure 'HH:MM') heure de Paris."""
    if not date_str or not time12h_str:
        return date_str, None
    try:
        dt_utc = datetime.strptime(f"{date_str} {time12h_str}", "%Y-%m-%d %I:%M %p").replace(tzinfo=timezone.utc)
    except ValueError:
        return date_str, None
    dt_paris = dt_utc.astimezone(PARIS_TZ)
    return dt_paris.strftime("%Y-%m-%d"), dt_paris.strftime("%H:%M")


def cap_first(s):
    return s[0].upper() + s[1:] if s else s


# ---------------------------------------------------------------
# Traduction FR (best-effort) des intitules d'indicateurs.
# Couvre les intitules reellement vus dans le flux (style Trading Economics,
# tout en minuscules) ; a completer si de nouveaux intitules non couverts
# apparaissent - ils restent alors affiches en anglais plutot que mal traduits.
# ---------------------------------------------------------------
TE_TRANSLATIONS = {
    "10-year note auction": "adjudication d'obligations à 10 ans",
    "12-month bill auction": "adjudication de bons du Trésor à 12 mois",
    "15-year mortgage rate": "taux hypothécaire fixe 15 ans",
    "17-week bill auction": "adjudication de bons du Trésor à 17 semaines",
    "20-year bond auction": "adjudication d'obligations à 20 ans",
    "20-year jgb auction": "adjudication d'obligations d'État japonaises (JGB) à 20 ans",
    "3-month bill auction": "adjudication de bons du Trésor à 3 mois",
    "3-year note auction": "adjudication d'obligations à 3 ans",
    "30-year bond auction": "adjudication d'obligations à 30 ans",
    "30-year mortgage rate": "taux hypothécaire fixe 30 ans",
    "4-week bill auction": "adjudication de bons du Trésor à 4 semaines",
    "5-year jgb auction": "adjudication d'obligations d'État japonaises (JGB) à 5 ans",
    "52-week bill auction": "adjudication de bons du Trésor à 52 semaines",
    "6-month bill auction": "adjudication de bons du Trésor à 6 mois",
    "6-week bill auction": "adjudication de bons du Trésor à 6 semaines",
    "8-week bill auction": "adjudication de bons du Trésor à 8 semaines",
    "adp employment change weekly": "variation hebdomadaire de l'emploi (ADP)",
    "api crude oil stock change": "variation des stocks de pétrole brut (API)",
    "average earnings excl. bonus (3mo/yr)": "salaire moyen hors primes (3 mois/an)",
    "average earnings incl. bonus (3mo/yr)": "salaire moyen primes incluses (3 mois/an)",
    "baker hughes oil rig count": "nombre de forages pétroliers actifs (Baker Hughes)",
    "baker hughes total rigs count": "nombre total de forages actifs (Baker Hughes)",
    "balance of trade": "balance commerciale",
    "boe interest rate decision": "décision de taux de la Banque d'Angleterre (BoE)",
    "boe mpc vote cut": "votes du comité de politique monétaire de la BoE pour une baisse",
    "boe mpc vote hike": "votes du comité de politique monétaire de la BoE pour une hausse",
    "boe mpc vote unchanged": "votes du comité de politique monétaire de la BoE pour un statu quo",
    "boj jgb purchase": "rachats d'obligations d'État (JGB) par la BoJ",
    "boj masu speech": "discours d'un responsable de la BoJ",
    "bsi large manufacturing qoq": "indice BSI des grandes entreprises manufacturières (trimestriel)",
    "building permits mom prel": "permis de construire (mensuel, provisoire)",
    "building permits prel": "permis de construire (provisoire)",
    "business inventories mom": "stocks des entreprises (mensuel)",
    "capacity utilization mom": "taux d'utilisation des capacités (mensuel)",
    "claimant count change": "variation du nombre de demandeurs d'emploi",
    "construction output yoy": "production du secteur de la construction (annuel)",
    "consumer credit change": "variation du crédit à la consommation",
    "consumer inflation expectations": "anticipations d'inflation des consommateurs",
    "continuing jobless claims": "inscriptions au chômage en cours",
    "conventional gilt": "adjudication d'obligation d'État britannique (gilt)",
    "core inflation rate mom": "inflation sous-jacente (mensuel)",
    "core inflation rate yoy": "inflation sous-jacente (annuel)",
    "core inflation rate yoy final": "inflation sous-jacente (annuel, définitif)",
    "core ppi mom": "prix à la production sous-jacents (mensuel)",
    "core ppi yoy": "prix à la production sous-jacents (annuel)",
    "cpi": "indice des prix à la consommation (IPC)",
    "cpi final": "indice des prix à la consommation (IPC, définitif)",
    "cpi s.a": "indice des prix à la consommation (IPC, désaisonnalisé)",
    "deposit facility rate": "taux de la facilité de dépôt (BCE)",
    "ecb elderson speech": "discours d'un membre du directoire de la BCE (Elderson)",
    "ecb interest rate decision": "décision de taux de la BCE",
    "ecb lane speech": "discours d'un membre du directoire de la BCE (Lane)",
    "ecb president lagarde speech": "discours de la présidente de la BCE (Lagarde)",
    "ecb press conference": "conférence de presse de la BCE",
    "eco watchers survey current": "enquête Eco Watchers, situation actuelle (Japon)",
    "eco watchers survey outlook": "enquête Eco Watchers, perspectives (Japon)",
    "eia crude oil imports change": "variation des importations de pétrole brut (EIA)",
    "eia crude oil stocks change": "variation des stocks de pétrole brut (EIA)",
    "eia cushing crude oil stocks change": "variation des stocks de pétrole brut à Cushing (EIA)",
    "eia distillate fuel production change": "variation de la production de distillats (EIA)",
    "eia distillate stocks change": "variation des stocks de distillats (EIA)",
    "eia gasoline production change": "variation de la production d'essence (EIA)",
    "eia gasoline stocks change": "variation des stocks d'essence (EIA)",
    "eia heating oil stocks change": "variation des stocks de fioul domestique (EIA)",
    "eia natural gas stocks change": "variation des stocks de gaz naturel (EIA)",
    "eia refinery crude runs change": "variation du taux d'utilisation des raffineries (EIA)",
    "employment change": "variation de l'emploi",
    "existing home sales": "ventes de logements existants",
    "existing home sales mom": "ventes de logements existants (mensuel)",
    "export prices mom": "prix à l'exportation (mensuel)",
    "export prices yoy": "prix à l'exportation (annuel)",
    "exports yoy": "exportations (annuel)",
    "fed balance sheet": "bilan de la Réserve fédérale (Fed)",
    "fed interest rate decision": "décision de taux de la Réserve fédérale (Fed)",
    "fed press conference": "conférence de presse de la Fed",
    "fomc economic projections": "projections économiques du FOMC",
    "foreign bond investment": "investissements étrangers en obligations",
    "gdp 3-month avg": "PIB, moyenne sur 3 mois",
    "gdp mom": "PIB (mensuel)",
    "gdp yoy": "PIB (annuel)",
    "goods trade balance": "balance commerciale des biens",
    "goods trade balance non-eu": "balance commerciale des biens hors UE",
    "hmrc payrolls change": "variation des salariés déclarés (HMRC, UK)",
    "housing starts": "mises en chantier",
    "housing starts mom": "mises en chantier (mensuel)",
    "import prices mom": "prix à l'importation (mensuel)",
    "import prices yoy": "prix à l'importation (annuel)",
    "imports yoy": "importations (annuel)",
    "industrial production mom": "production industrielle (mensuel)",
    "industrial production mom final": "production industrielle (mensuel, définitif)",
    "industrial production yoy": "production industrielle (annuel)",
    "industrial production yoy final": "production industrielle (annuel, définitif)",
    "inflation rate mom": "taux d'inflation (mensuel)",
    "inflation rate mom final": "taux d'inflation (mensuel, définitif)",
    "inflation rate yoy": "taux d'inflation (annuel)",
    "inflation rate yoy final": "taux d'inflation (annuel, définitif)",
    "initial jobless claims": "nouvelles inscriptions au chômage",
    "interest rate projection - 1st yr": "projection de taux directeur, année 1",
    "interest rate projection - 2nd yr": "projection de taux directeur, année 2",
    "interest rate projection - 3rd yr": "projection de taux directeur, année 3",
    "interest rate projection - current": "projection de taux directeur, année en cours",
    "interest rate projection - longer": "projection de taux directeur, long terme",
    "jobless claims 4-week average": "inscriptions au chômage, moyenne sur 4 semaines",
    "labour cost index yoy final": "coût du travail (annuel, définitif)",
    "machine tool orders yoy": "commandes de machines-outils (annuel)",
    "machinery orders mom": "commandes de machines (mensuel)",
    "machinery orders yoy": "commandes de machines (annuel)",
    "manufacturing production mom": "production manufacturière (mensuel)",
    "manufacturing production yoy": "production manufacturière (annuel)",
    "marginal lending rate": "taux de prêt marginal (BCE)",
    "mba 30-year mortgage rate": "taux hypothécaire fixe 30 ans (MBA)",
    "mba mortgage applications": "demandes de prêts hypothécaires (MBA)",
    "mba mortgage market index": "indice du marché hypothécaire (MBA)",
    "mba mortgage refinance index": "indice des refinancements hypothécaires (MBA)",
    "mba purchase index": "indice des achats immobiliers (MBA)",
    "michigan 5 year inflation expectations prel": "anticipations d'inflation à 5 ans, U. Michigan (provisoire)",
    "michigan consumer expectations prel": "attentes des consommateurs, U. Michigan (provisoire)",
    "michigan consumer sentiment prel": "confiance des consommateurs, U. Michigan (provisoire)",
    "michigan current conditions prel": "conditions actuelles, U. Michigan (provisoire)",
    "michigan inflation expectations prel": "anticipations d'inflation, U. Michigan (provisoire)",
    "monthly budget statement": "solde budgétaire mensuel (US)",
    "mpc meeting minutes": "compte-rendu de réunion du comité de politique monétaire (BoE)",
    "nahb housing market index": "indice du marché immobilier (NAHB)",
    "net long-term tic flows": "flux nets de capitaux à long terme (TIC)",
    "nfib business optimism index": "indice de confiance des petites entreprises (NFIB)",
    "niesr monthly gdp tracker": "estimation mensuelle du PIB (NIESR, UK)",
    "nopa crush report": "rapport de trituration de soja (NOPA)",
    "ny empire state manufacturing index": "indice manufacturier Empire State (New York)",
    "ny fed bill purchases 4 to 12 months": "rachats de bons du Trésor par la Fed de New York (4-12 mois)",
    "ny fed services activity index": "indice d'activité des services, Fed de New York",
    "overall net capital flows": "flux de capitaux nets globaux",
    "philadelphia fed manufacturing index": "indice manufacturier de la Fed de Philadelphie",
    "philly fed business conditions": "conditions des affaires, Fed de Philadelphie",
    "philly fed capex index": "indice des dépenses d'investissement, Fed de Philadelphie",
    "philly fed employment": "emploi, Fed de Philadelphie",
    "philly fed new orders": "nouvelles commandes, Fed de Philadelphie",
    "philly fed prices paid": "prix payés, Fed de Philadelphie",
    "ppi": "prix à la production (PPI)",
    "ppi core output mom": "prix à la production sous-jacents, sortie (mensuel)",
    "ppi core output yoy": "prix à la production sous-jacents, sortie (annuel)",
    "ppi ex food, energy and trade mom": "prix à la production hors alimentation/énergie/commerce (mensuel)",
    "ppi ex food, energy and trade yoy": "prix à la production hors alimentation/énergie/commerce (annuel)",
    "ppi input mom": "prix à la production, intrants (mensuel)",
    "ppi input yoy": "prix à la production, intrants (annuel)",
    "ppi mom": "prix à la production (mensuel)",
    "ppi output mom": "prix à la production, sortie (mensuel)",
    "ppi output yoy": "prix à la production, sortie (annuel)",
    "ppi yoy": "prix à la production (annuel)",
    "redbook yoy": "ventes au détail Redbook (annuel)",
    "retail inventories ex autos mom": "stocks de détail hors automobile (mensuel)",
    "retail price index mom": "indice des prix de détail (mensuel)",
    "retail price index yoy": "indice des prix de détail (annuel)",
    "retail sales control group mom": "ventes au détail, groupe de contrôle (mensuel)",
    "retail sales ex autos mom": "ventes au détail hors automobile (mensuel)",
    "retail sales ex gas/autos mom": "ventes au détail hors essence/automobile (mensuel)",
    "retail sales mom": "ventes au détail (mensuel)",
    "retail sales yoy": "ventes au détail (annuel)",
    "reuters tankan index": "indice Tankan Reuters",
    "rics house price balance": "solde des prix immobiliers (RICS, UK)",
    "stock investment by foreigners": "investissements étrangers en actions",
    "tertiary industry index mom": "indice des industries tertiaires (mensuel)",
    "treasury gilt 2030 auction": "adjudication d'obligation d'État britannique (gilt) échéance 2030",
    "unemployment rate": "taux de chômage",
    "used car prices mom": "prix des véhicules d'occasion (mensuel)",
    "used car prices yoy": "prix des véhicules d'occasion (annuel)",
    "wage growth yoy": "croissance des salaires (annuel)",
    "wasde report": "rapport WASDE (offre et demande agricole, USDA)",
    "wholesale inventories mom": "stocks de gros (mensuel)",
    "zew economic sentiment index": "indice de confiance économique (ZEW)",
}


def translate_te_name(raw_name):
    fr = TE_TRANSLATIONS.get(raw_name.strip().lower())
    return cap_first(fr) if fr else cap_first(raw_name.strip())


# Intitules "longs" d'investing.com (style phrase anglaise, ex: "Japan Gross
# Domestic Product (GDP) QoQ") : traduction par substitution de phrases
# usuelles plutot que dictionnaire exact, car le pays est deja affiche a part
# (drapeau) et le libelle complet varie trop pour un dictionnaire exhaustif.
INV_COUNTRY_PREFIXES = [
    "United States", "Euro Area", "European Union", "United Kingdom", "Japan",
    "Germany", "France", "Italy", "Spain", "China", "Canada", "Australia",
]
INV_PHRASES = [
    ("Gross Domestic Product (GDP)", "Produit intérieur brut (PIB)"),
    ("Gross Domestic Product", "Produit intérieur brut"),
    ("Consumer Price Index (CPI)", "Indice des prix à la consommation (IPC)"),
    ("Consumer Price Index", "Indice des prix à la consommation"),
    ("Non-Farm Payrolls", "Emplois non agricoles"),
    ("Nonfarm Payrolls", "Emplois non agricoles"),
    ("Unemployment Rate", "Taux de chômage"),
    ("Interest Rate Decision", "Décision de taux d'intérêt"),
    ("Retail Sales", "Ventes au détail"),
    ("Producer Price Index (PPI)", "Indice des prix à la production (IPP)"),
    ("Producer Price Index", "Indice des prix à la production"),
    ("Trade Balance", "Balance commerciale"),
    ("Industrial Production", "Production industrielle"),
    ("Manufacturing PMI", "PMI manufacturier"),
    ("Services PMI", "PMI services"),
    ("Composite PMI", "PMI composite"),
    ("Building Permits", "Permis de construire"),
    ("Housing Starts", "Mises en chantier"),
    ("Durable Goods Orders", "Commandes de biens durables"),
    ("Core PCE Price Index", "Indice des prix PCE sous-jacent"),
    ("PCE Price Index", "Indice des prix PCE"),
    ("Current Account", "Balance des transactions courantes"),
    ("Business Confidence", "Confiance des entreprises"),
    ("Consumer Confidence", "Confiance des consommateurs"),
    ("Wage Growth", "Croissance des salaires"),
]


def translate_investing_name(name):
    if not name:
        return name
    result = name
    for prefix in INV_COUNTRY_PREFIXES:
        if result.startswith(prefix + " "):
            result = result[len(prefix) + 1:]
            break
    for en, fr in INV_PHRASES:
        result = re.sub(re.escape(en), fr, result, flags=re.IGNORECASE)
    result = re.sub(r"\bQoQ\b", "trimestriel", result)
    result = re.sub(r"\bMoM\b", "mensuel", result)
    result = re.sub(r"\bYoY\b", "annuel", result)
    result = re.sub(r"\bWoW\b", "hebdomadaire", result)
    return cap_first(result)


# ---------------------------------------------------------------
# Source 1 : investing.com — aujourd'hui, donnees riches
# ---------------------------------------------------------------
INV_EVENT_RE = re.compile(r'\{"mobx_easy_id":"[^}]*?"hasActualChanged":(?:true|false)\}')


def fetch_investing_today():
    try:
        html = fetch_via_curl("https://www.investing.com/economic-calendar/")
    except Exception as exc:
        print(f"investing.com indisponible : {exc}")
        return []

    events = []
    for raw in INV_EVENT_RE.findall(html):
        try:
            e = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if e.get("country") not in INV_COUNTRIES:
            continue
        if str(e.get("importance")) != "3":
            continue
        label = COUNTRY_LABEL.get(e["country"], e["country"][:2].upper())
        raw_name = e.get("eventLong") or e.get("event") or "Évènement"
        paris_date, paris_time = utc_iso_to_paris(e.get("time"))
        events.append({
            "id": f"inv-{e.get('eventId')}-{e.get('date')}",
            "country": label,
            "event": translate_investing_name(raw_name),
            "date": paris_date or e.get("date"),
            "time": paris_time,
            "actual": e.get("actual") or "",
            "previous": e.get("previous") or "",
            "consensus": e.get("forecast") or "",
            "released": bool(e.get("actual")),
            "directionBias": guess_direction(raw_name),
            "importance": "high",
            "source": "investing.com",
        })
    return events


# ---------------------------------------------------------------
# Source 1bis : investing.com — semaine en cours + semaine prochaine,
# via un vrai navigateur (Playwright). La page par defaut (curl) ne montre
# que "aujourd'hui" ; leurs jours suivants se chargent via une connexion
# temps reel qu'on ne peut pas appeler directement (voir plus haut). Mais
# un navigateur qui execute vraiment le JS de la page recoit ces donnees
# normalement - on lit alors le tableau tel qu'il s'affiche a l'ecran,
# comme le ferait un humain. Plus lent (~10-20s) et plus fragile qu'un
# simple curl (on depend de la structure HTML affichee, pas d'un JSON
# stable), d'ou un repli automatique sur tradingeconomics.com si
# Playwright n'est pas installe ou si ca echoue.
# ---------------------------------------------------------------
INV_WEEK_COUNTRIES = {"US", "EU", "UK", "JP"}


def stable_event_id(prefix, country, date_str, event_name):
    """Id deterministe (pays+jour+nom d'evenement), STABLE d'un fetch a
    l'autre - a l'inverse de l'id de ligne brut scrape sur investing.com
    (`row.id`, ex: "238-555939-UnitedStates-8"), dont le dernier segment
    n'est qu'un index de position dans leur tableau et peut changer d'un
    jour de scrape a l'autre pour LA MEME annonce (ex: le tableau contient
    plus ou moins de lignes avant elle selon le jour). Sans id stable,
    merge_with_history() ne reconnait pas qu'il s'agit du meme evenement
    et cree un DOUBLON : l'ancienne version archivee (pas encore publiee)
    reste affichee a cote de la nouvelle (publiee), constate le 2026-09-11
    sur "Inscriptions hebdomadaires au chomage" (deux cartes, memes jour/
    pays, previous legerement different a cause d'une revision)."""
    digest = hashlib.md5(f"{country}|{event_name.strip().lower()}".encode("utf-8")).hexdigest()[:10]
    return f"{prefix}-{country}-{date_str}-{digest}"

INV_WEEK_EXTRACT_JS = r"""
(fallbackDate) => {
  const MONTHS_FR = {
    janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
    juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11,
    décembre: 12, decembre: 12,
  };
  const DAY_HEADER_RE = /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+(\d{1,2})\s+([a-zéû]+)\s+(\d{4})$/i;
  const rows = Array.from(document.querySelectorAll('tr'));
  // La vue "Aujourd'hui" (un seul jour) n'a pas de ligne d'en-tete de date -
  // on retombe alors sur fallbackDate (passe par l'appelant) plutot que de
  // rejeter silencieusement toutes les lignes faute de currentDate connu.
  let currentDate = fallbackDate || null;
  const events = [];
  for (const row of rows) {
    if (!row.id) {
      const headerCell = row.querySelector('td[colspan]');
      if (headerCell) {
        const m = headerCell.textContent.trim().toLowerCase().match(DAY_HEADER_RE);
        if (m && MONTHS_FR[m[3]]) {
          currentDate = `${m[4]}-${String(MONTHS_FR[m[3]]).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
        }
      }
      continue;
    }
    if (!/^\d+-\d+-[A-Za-z]+-\d+$/.test(row.id) || !currentDate) continue;

    const link = row.querySelector('a[href*="/economic-calendar/"]');
    if (!link) continue;
    const eventName = (link.querySelector('div') || link).textContent.trim();

    const flag = row.querySelector('span[data-test^="flag-"]');
    if (!flag) continue;
    const countryCode = flag.getAttribute('data-test').replace('flag-', '');

    const hiddenCells = Array.from(row.querySelectorAll('td.hidden'))
      .filter((td) => td.className.includes('md:table-cell'));
    const timeCell = hiddenCells[0];
    const starsCell = hiddenCells[2];
    const actualCell = hiddenCells[3];
    const forecastCell = hiddenCells[4];
    const previousCell = hiddenCells[5];
    const clean = (td) => {
      if (!td) return '';
      const t = td.textContent.trim();
      return t === '-' ? '' : t;
    };

    events.push({
      id: row.id,
      // Premier segment du row.id investing.com (ex. "238" dans
      // "238-555939-UnitedStates-8") = leur identifiant STABLE par
      // indicateur (le meme que celui utilise dans leurs URLs de fiche,
      // ex. investing.com/economic-calendar/cpi-69 -> id 69), verifie le
      // 2026-09-11 sur un doublon (memes 2 premiers segments sur deux
      // scrapes differents, seul le dernier index de position changeait).
      // Sert a relier une annonce a sa calibration reelle (voir
      // calibrate_impact.py) plutot que de deviner par nom traduit.
      investingEventId: row.id.split('-')[0],
      date: currentDate,
      time: timeCell ? timeCell.textContent.trim() : null,
      countryCode,
      event: eventName,
      stars: starsCell ? starsCell.querySelectorAll('svg[class*="opacity-60"]').length : 0,
      actual: clean(actualCell),
      forecast: clean(forecastCell),
      previous: clean(previousCell),
    });
  }
  return events;
}
"""

DEBUG_DIR = os.path.join(os.path.dirname(__file__), "debug")


def _save_debug_snapshot(page, exc):
    """Capture le HTML + une image de la page au moment d'un echec, pour
    diagnostiquer a distance sans avoir a deviner. Servi par server.py sur
    /debug/*. Le HTML (leger) est tente avant la capture d'ecran (plus
    couteuse en memoire/threads - Chrome dans un conteneur aux ressources
    limitees peut echouer sur juste cette etape, voir "can't start new
    thread" observe le 2026-09-07) pour garder au moins le HTML meme si la
    capture d'ecran echoue. Ne doit jamais faire planter le vrai flux."""
    try:
        os.makedirs(DEBUG_DIR, exist_ok=True)
    except Exception as dir_exc:
        print(f"Capture de diagnostic impossible (dossier) : {dir_exc}")
        return

    with open(os.path.join(DEBUG_DIR, "last_failure.txt"), "w", encoding="utf-8") as f:
        f.write(f"{exc}\n")

    try:
        with open(os.path.join(DEBUG_DIR, "last_failure.html"), "w", encoding="utf-8") as f:
            f.write(page.content())
    except Exception as html_exc:
        print(f"Capture HTML de diagnostic impossible : {html_exc}")

    try:
        page.screenshot(path=os.path.join(DEBUG_DIR, "last_failure.png"), full_page=True)
    except Exception as png_exc:
        print(f"Capture ecran de diagnostic impossible : {png_exc}")


def _dismiss_onetrust_consent(page):
    """investing.com utilise le CMP OneTrust. Le bandeau simple ("Tout
    refuser", id #onetrust-reject-all-handler - confirme le 2026-09-07 par
    inspection directe du DOM) suffit generalement, mais il ouvre parfois un
    "Preference Center" detaille a la place (comportement aleatoire de
    OneTrust, pas lie a la region/serveur) qui reste ouvert par-dessus la
    page et bloque tous les clics suivants. On cible les ID standards du SDK
    OneTrust (stables quelle que soit la langue detectee) plutot que le
    texte du bouton.

    Le bandeau se rend de facon asynchrone (script OneTrust charge apres le
    DOM) et peut prendre plus de temps sur un conteneur sous tension (voir
    le souci "can't start new thread" du 2026-09-07) - d'ou une attente
    explicite et genereuse avant de cliquer. Le clic "reel" de Playwright
    (simule un vrai clic souris) echoue quand meme sur Railway meme une fois
    le bouton present : un filtre d'animation OneTrust semble clignoter
    par-dessus au mauvais moment et intercepte le clic (verifie le
    2026-09-07). On appelle donc directement .click() en JS sur le bouton,
    qui declenche le meme gestionnaire d'evenement sans dependre de ce que
    la souris "verrait" a l'ecran."""
    try:
        page.wait_for_selector("#onetrust-reject-all-handler", timeout=20000)
    except Exception:
        return  # jamais apparu cette fois-ci, rien a fermer

    try:
        page.eval_on_selector("#onetrust-reject-all-handler", "el => el.click()")
    except Exception:
        pass
    page.wait_for_timeout(500)  # laisse l'animation de fermeture se terminer

    # Si le Preference Center s'est ouvert quand meme, le fermer explicitement.
    for selector in (
        "#onetrust-pc-sdk #accept-recommended-btn-handler",
        "#onetrust-pc-sdk .save-preference-btn-handler",
        "#onetrust-pc-btn-handler",
    ):
        try:
            if page.is_visible("#onetrust-pc-sdk", timeout=1500):
                page.click(selector, timeout=3000)
                break
        except Exception:
            continue

    # Dernier recours : Escape ferme aussi les modales OneTrust.
    try:
        if page.is_visible("#onetrust-consent-sdk", timeout=1000):
            page.keyboard.press("Escape")
    except Exception:
        pass


def fetch_investing_week():
    """Renvoie la liste des evenements (US/EU/UK/JP) pour la semaine en cours
    sur investing.com (onglet "Cette Semaine"), avec LEUR notation
    d'importance (etoiles) et LEURS previsions. Limite a un seul onglet :
    "Semaine prochaine" s'est avere trop instable a cliquer de facon fiable
    (verifie le 2026-09-07) - c'est main() qui complete au-dela avec
    tradingeconomics.com. Renvoie None si Playwright est absent ou si ca
    echoue, pour que l'appelant sache qu'il doit se rabattre sur une autre
    source plutot que de croire a tort qu'il n'y a aucun evenement."""
    if sync_playwright is None:
        print("Playwright non installe (pip install playwright && playwright install chromium) — repli sur tradingeconomics.com")
        return None

    browser = None
    try:
        with sync_playwright() as p:
            # investing.com bloque (403) tout Chromium en mode headless, meme
            # avec le vrai Chrome installe (verifie le 2026-09-07) - seul un
            # lancement "visible" passe. En local (Windows), on utilise le
            # vrai Chrome installe (channel="chrome") ; sur Railway (Linux,
            # via Xvfb - voir server.py), CHEST_CHROME_CHANNEL="" fait
            # retomber sur le Chromium embarque par Playwright, pas besoin
            # d'installer Chrome dans le conteneur.
            #
            # --disable-dev-shm-usage et --disable-gpu : Chrome dans un
            # conteneur Docker aux ressources limitees (ex: Railway) peut
            # manquer de memoire partagee (/dev/shm est minuscule par
            # defaut) et planter/manquer de threads en cours de route (vu le
            # 2026-09-07 : "can't start new thread" pendant une capture
            # d'ecran) - ce sont les deux options standards pour ce cas.
            launch_kwargs = {
                "headless": False,
                "args": ["--disable-dev-shm-usage", "--disable-gpu"],
            }
            chrome_channel = os.environ.get("CHEST_CHROME_CHANNEL", "chrome")
            if chrome_channel:
                launch_kwargs["channel"] = chrome_channel
            browser = p.chromium.launch(**launch_kwargs)
            context = browser.new_context(locale="fr-FR", timezone_id="Europe/Paris")
            page = context.new_page()
            page.goto("https://fr.investing.com/economic-calendar/", wait_until="domcontentloaded", timeout=30000)
            _dismiss_onetrust_consent(page)
            page.wait_for_timeout(1500)  # laisse le tableau "Aujourd'hui" (onglet par defaut) finir de se rendre

            # La page atterrit par defaut sur l'onglet "Aujourd'hui" (un seul
            # jour, avec les VRAIS actual/consensus deja publies) - on le lit
            # AVANT de basculer sur "Cette Semaine", car ce dernier onglet
            # exclut parfois le jour meme en fin de journee (constate le
            # 2026-09-11 : "Cette Semaine" ne montrait que lundi->jeudi un
            # vendredi soir, vendredi restant absent du DOM meme apres scroll
            # - comportement du site, pas un bug de scraping). Sans cette
            # etape, les evenements du jour deja publies retombaient sur
            # tradingeconomics.com, qui n'expose pas leur "actual" -> ils
            # restaient a tort marques "a venir" toute la journee.
            today_iso = datetime.now(PARIS_TZ).date().isoformat()
            today_events_raw = page.evaluate(INV_WEEK_EXTRACT_JS, today_iso)

            try:
                # Delai genereux : sur un conteneur aux ressources limitees,
                # la page peut mettre du temps a finir de se rendre une fois
                # le bandeau cookies ferme (meme constat que pour le bandeau
                # lui-meme, voir _dismiss_onetrust_consent).
                page.wait_for_selector("text=Cette Semaine", timeout=45000)
                tab_locator = page.get_by_text("Cette Semaine", exact=True).last
                try:
                    tab_locator.click(timeout=10000)
                except Exception:
                    # Repli en clic JS direct si un overlay residuel
                    # intercepte encore le clic "reel" (meme souci que pour
                    # le bandeau de cookies - voir _dismiss_onetrust_consent).
                    tab_locator.evaluate("el => el.click()")
            except Exception as click_exc:
                _save_debug_snapshot(page, click_exc)
                raise
            page.wait_for_timeout(2500)  # laisse le tableau se re-rendre avec les nouvelles donnees
            all_events = {}
            # Cle stable (pays+jour+nom), PAS le row.id brut scrape (voir
            # stable_event_id) : necessaire ici aussi, sinon le meme
            # evenement lu une fois via "Aujourd'hui" et une fois via
            # "Cette Semaine" (s'il finissait par apparaitre dans les deux)
            # pourrait se dedupliquer par accident dans le mauvais sens.
            for e in today_events_raw:
                if e["countryCode"] in INV_WEEK_COUNTRIES:
                    all_events[(e["countryCode"], e["date"], e["event"].strip().lower())] = e
            for e in page.evaluate(INV_WEEK_EXTRACT_JS, None):
                if e["countryCode"] in INV_WEEK_COUNTRIES:
                    all_events[(e["countryCode"], e["date"], e["event"].strip().lower())] = e
    except Exception as exc:
        print(f"investing.com (semaine, playwright) indisponible : {exc}")
        return None
    finally:
        # Toujours fermer le navigateur, meme en cas d'echec, pour ne pas
        # accumuler de processus/threads Chrome zombies d'une tentative a
        # l'autre dans un conteneur aux ressources limitees.
        if browser is not None:
            try:
                browser.close()
            except Exception:
                pass

    events = []
    for e in all_events.values():
        stars = e["stars"]
        importance = "high" if stars >= 3 else ("medium" if stars == 2 else "low")
        events.append({
            "id": stable_event_id("invwk", e["countryCode"], e["date"], e["event"]),
            "investingEventId": e.get("investingEventId"),
            "country": e["countryCode"],
            "event": cap_first(e["event"]),
            "date": e["date"],
            "time": e["time"],
            "actual": e["actual"],
            "previous": e["previous"],
            "consensus": e["forecast"],
            "released": bool(e["actual"]),
            "directionBias": guess_direction_fr(e["event"]),
            "importance": importance,
            "source": "investing.com",
        })
    return events


def fetch_investing_date_range(start_date, end_date):
    """Comme fetch_investing_week(), mais pour une plage de dates arbitraire
    dans le PASSE - utile pour garantir qu'une semaine deja ecoulee (ex. la
    semaine precedente) reste disponible independamment de l'historique deja
    accumule par merge_with_history(). Utilise le bouton "Personnaliser les
    dates" du calendrier investing.com (verifie manuellement le 2026-09-14 :
    champs #date-picker-start-day / #date-picker-end-day au format
    DD/MM/YYYY, puis bouton "Appliquer"), plutot que "Cette Semaine"/
    "Semaine prochaine" qui ne couvrent jamais le passe.

    start_date/end_date : objets date(). Renvoie None si Playwright est
    absent ou si ca echoue (meme convention que fetch_investing_week)."""
    if sync_playwright is None:
        return None

    browser = None
    try:
        with sync_playwright() as p:
            launch_kwargs = {
                "headless": False,
                "args": ["--disable-dev-shm-usage", "--disable-gpu"],
            }
            chrome_channel = os.environ.get("CHEST_CHROME_CHANNEL", "chrome")
            if chrome_channel:
                launch_kwargs["channel"] = chrome_channel
            browser = p.chromium.launch(**launch_kwargs)
            context = browser.new_context(locale="fr-FR", timezone_id="Europe/Paris")
            page = context.new_page()
            page.goto("https://fr.investing.com/economic-calendar/", wait_until="domcontentloaded", timeout=30000)
            _dismiss_onetrust_consent(page)
            page.wait_for_timeout(1500)

            page.wait_for_selector("text=Personnaliser les dates", timeout=45000)
            # BUG CORRIGE (2026-09-14, vu en prod) : le bandeau OneTrust peut
            # encore etre en train de se fermer (filtre sombre du Preference
            # Center) au moment de ce clic, meme apres _dismiss_onetrust_consent
            # plus haut - il intercepte alors le clic "reel" en boucle jusqu'au
            # timeout. On retente le dismiss juste avant, et on retombe sur un
            # clic JS direct (qui ignore les overlays) si ca coince quand meme -
            # meme repli deja utilise avec succes pour l'onglet "Cette Semaine".
            _dismiss_onetrust_consent(page)
            date_range_tab = page.get_by_text("Personnaliser les dates", exact=True).last
            try:
                date_range_tab.click(timeout=10000)
            except Exception:
                date_range_tab.evaluate("el => el.click()")
            page.wait_for_selector("#date-picker-start-day", timeout=10000)
            # .fill() ne declenche pas toujours le re-rendu React de ce
            # composant (verifie manuellement) - on passe par le DOM natif +
            # un evenement "input", comme teste avec succes dans le navigateur.
            set_native_value = """(el, value) => {
                const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                setter.call(el, value);
                el.dispatchEvent(new Event('input', { bubbles: true }));
            }"""
            page.eval_on_selector("#date-picker-start-day", set_native_value, start_date.strftime("%d/%m/%Y"))
            page.eval_on_selector("#date-picker-end-day", set_native_value, end_date.strftime("%d/%m/%Y"))
            apply_btn = page.get_by_text("Appliquer", exact=True).last
            try:
                apply_btn.click(timeout=10000)
            except Exception:
                apply_btn.evaluate("el => el.click()")
            page.wait_for_timeout(2500)

            raw_events = page.evaluate(INV_WEEK_EXTRACT_JS, None)
    except Exception as exc:
        print(f"investing.com (plage {start_date}..{end_date}, playwright) indisponible : {exc}")
        return None
    finally:
        if browser is not None:
            try:
                browser.close()
            except Exception:
                pass

    events = []
    for e in raw_events:
        if e["countryCode"] not in INV_WEEK_COUNTRIES:
            continue
        stars = e["stars"]
        importance = "high" if stars >= 3 else ("medium" if stars == 2 else "low")
        events.append({
            "id": stable_event_id("invwk", e["countryCode"], e["date"], e["event"]),
            "investingEventId": e.get("investingEventId"),
            "country": e["countryCode"],
            "event": cap_first(e["event"]),
            "date": e["date"],
            "time": e["time"],
            "actual": e["actual"],
            "previous": e["previous"],
            "consensus": e["forecast"],
            "released": bool(e["actual"]),
            "directionBias": guess_direction_fr(e["event"]),
            "importance": importance,
            "source": "investing.com",
        })
    return events


# ---------------------------------------------------------------
# Source 2 : tradingeconomics.com — jours suivants, apercu
# ---------------------------------------------------------------
TE_ROW_RE = re.compile(
    # (.*?)</tr> capturait jusqu'au PREMIER </tr> rencontre - or chaque ligne
    # contient un mini-tableau imbrique pour le drapeau du pays (son propre
    # <tr>...</tr>), donc la capture s'arretait juste apres le drapeau, bien
    # avant les champs actual/previous/consensus/forecast (toujours vides en
    # sortie). Bug trouve et verifie en direct le 2026-09-23 (retour
    # utilisateur : son calendrier "completement casse" compare a
    # investing.com) - corrige en capturant jusqu'a la PROCHAINE ligne
    # d'evenement (ou la fin du document) plutot que jusqu'a un </tr> litteral.
    r'<tr data-url="([^"]*)" data-id="([^"]*)" data-country="([^"]*)" data-category="([^"]*)" data-event="([^"]*)"[^>]*>(.*?)(?=<tr data-url=|\Z)',
    re.S,
)
# tradingeconomics.com mélange guillemets simples et doubles selon les
# attributs (souvent simples pour class="../id=.., toujours doubles pour les
# data-* de la ligne) - regex tolérantes aux deux pour ne pas re-casser au
# moindre changement de markup.
TE_DATE_RE = re.compile(r"class=[\"']\s*(\d{4}-\d{2}-\d{2})[\"']")
TE_IMPORTANCE_RE = re.compile(r"calendar-date-(\d)")
TE_TIME_RE = re.compile(r"calendar-date-\d[\"']>\s*([\dAPM: ]+?)\s*</span>")
TE_EVENT_NAME_RE = re.compile(r"class=[\"']calendar-event[\"']>([^<]*)</a>")


def te_field_re(name):
    return re.compile(rf"id=[\"']{name}[\"'][^>]*>\s*([^<]*)\s*</(?:span|a)>")


TE_ACTUAL_RE = te_field_re("actual")
TE_PREVIOUS_RE = te_field_re("previous")
TE_CONSENSUS_RE = te_field_re("consensus")
TE_FORECAST_RE = te_field_re("forecast")


def fetch_tradingeconomics_upcoming(min_date):
    try:
        html = fetch("https://tradingeconomics.com/calendar")
    except Exception as exc:
        print(f"tradingeconomics.com indisponible : {exc}")
        return []

    events = []
    for m in TE_ROW_RE.finditer(html):
        _url, rid, country, category, event, body = m.groups()
        if country not in TE_COUNTRIES:
            continue
        imp_m = TE_IMPORTANCE_RE.search(body)
        importance = TE_IMPORTANCE_MAP.get(imp_m.group(1), "low") if imp_m else "low"
        # Pas de filtre d'importance ici : on garde les 3 niveaux et c'est le site
        # (filtre "etoiles" cote client) qui decide quoi afficher, par defaut "high" seul.

        date_m = TE_DATE_RE.search(body)
        raw_date = date_m.group(1) if date_m else None
        time_m = TE_TIME_RE.search(body)
        raw_time = time_m.group(1).strip() if time_m else None
        paris_date, paris_time = utc_date_time12h_to_paris(raw_date, raw_time)
        ev_date = paris_date or raw_date
        if not ev_date or ev_date < min_date:
            continue  # la partie "aujourd'hui" est deja couverte par investing.com

        name_m = TE_EVENT_NAME_RE.search(body)
        actual_m = TE_ACTUAL_RE.search(body)
        prev_m = TE_PREVIOUS_RE.search(body)
        cons_m = TE_CONSENSUS_RE.search(body) or TE_FORECAST_RE.search(body)
        label = COUNTRY_LABEL.get(country, country[:2].upper())
        raw_name = (name_m.group(1).strip() if name_m else event).strip()

        events.append({
            "id": f"te-{rid}",
            "country": label,
            "event": translate_te_name(raw_name),
            "date": ev_date,
            "time": paris_time or raw_time,
            "actual": actual_m.group(1).strip() if actual_m else "",
            "previous": prev_m.group(1).strip() if prev_m else "",
            "consensus": (cons_m.group(1).strip() if cons_m else ""),
            "released": bool(actual_m and actual_m.group(1).strip()),
            "directionBias": guess_direction(category),
            "importance": importance,
            "source": "tradingeconomics.com",
        })
    return events


# ---------------------------------------------------------------
# Ticker (paires majeures, Frankfurter - gratuit, sans cle)
# ---------------------------------------------------------------
TICKER_PAIRS = [
    ("EUR/USD", "EUR", True), ("GBP/USD", "GBP", True), ("USD/JPY", "JPY", False),
    ("USD/CHF", "CHF", False), ("AUD/USD", "AUD", True), ("USD/CAD", "CAD", False),
]


def fetch_ticker():
    try:
        latest = json.loads(fetch("https://api.frankfurter.dev/v1/latest?from=USD&to=EUR,GBP,JPY,CHF,AUD,CAD"))
        latest_date = latest["date"]
        d = date.fromisoformat(latest_date) - timedelta(days=6)
        hist = json.loads(fetch(f"https://api.frankfurter.dev/v1/{d.isoformat()}..?from=USD&to=EUR,GBP,JPY,CHF,AUD,CAD"))
        first_date = sorted(hist["rates"].keys())[0]
        previous = hist["rates"][first_date]

        pairs = []
        for label, code, invert in TICKER_PAIRS:
            now_px = (1 / latest["rates"][code]) if invert else latest["rates"][code]
            prev_px = (1 / previous[code]) if invert else previous[code]
            pairs.append({
                "pair": label, "price": round(now_px, 4),
                "changePct": round((now_px - prev_px) / prev_px * 100, 2),
            })
        return {"as_of": latest_date, "compared_to": first_date, "pairs": pairs}
    except Exception as exc:
        print(f"Ticker indisponible : {exc}")
        return None


def build_calendar_data():
    """Construit le JSON complet (evenements + ticker). Reutilisee par main()
    (usage local, ecrit un fichier) et par server.py (usage Railway, garde
    le resultat en memoire et le sert via HTTP - voir calendar-bridge/README.md)."""
    tomorrow = (datetime.now(PARIS_TZ).date() + timedelta(days=1)).isoformat()

    # L'onglet "Cette Semaine" d'investing.com couvre deja aujourd'hui ET les
    # jours suivants avec LEUR notation d'importance + LEURS previsions -
    # source unique quand Playwright marche, pour eviter tout doublon avec
    # l'ancien chemin curl (fetch_investing_today) qui, une fois converti a
    # l'heure de Paris, peut recouvrir les memes evenements de justesse.
    week_events = fetch_investing_week()
    if week_events is None:
        events = fetch_investing_today()  # repli : au moins "aujourd'hui" en direct (curl)
        events += fetch_tradingeconomics_upcoming(min_date=tomorrow)
        source_label = "investing.com (aujourd'hui, repli curl) + tradingeconomics.com (a venir, repli)"
    else:
        events = week_events
        # Au-dela de ce que "Cette Semaine" couvre, on complete avec
        # tradingeconomics.com pour garder une vue a ~10 jours.
        max_inv_date = max((e["date"] for e in week_events), default=None)
        fill_from = (date.fromisoformat(max_inv_date) + timedelta(days=1)).isoformat() if max_inv_date else tomorrow
        events += fetch_tradingeconomics_upcoming(min_date=fill_from)
        source_label = "investing.com (semaine, via navigateur automatise) + tradingeconomics.com (au-dela)"
    events.sort(key=lambda e: (e["date"] or "", e["time"] or ""))

    if not events:
        print("Aucun evenement trouve — une des deux sources a peut-etre change de structure.")

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": f"{source_label} — pages publiques, usage personnel",
        "events": events,
        "ticker": fetch_ticker(),
    }


HISTORY_DAYS = 30


def merge_with_history(new_data, previous_events):
    """Accumule l'historique au lieu de l'ecraser a chaque fetch.

    build_calendar_data() ne renvoie jamais que "aujourd'hui -> +N jours" (ni
    investing.com ni tradingeconomics.com n'exposent le passe). Sans cette
    fusion, l'ancien "aujourd'hui" disparaitrait purement et simplement des
    qu'on re-fetch le lendemain - impossible de consulter "hier" cote site
    (voir le navigateur de jours dans js/calendar.js). On garde donc les
    evenements des jours DEJA ECOULES issus du fetch precedent, fusionnes
    avec le nouveau fetch (today -> +N), dedupliques par id (le nouveau
    fetch prime en cas de collision), sur une fenetre glissante de
    HISTORY_DAYS jours pour ne pas grossir indefiniment.

    Limite connue, a garder en tete : le champ "actual" d'un jour archive
    est celui capture au moment du fetch (une fois par jour, voir
    REFRESH_SECONDS dans server.py) - une publication survenue plus tard ce
    jour-la, apres le run, n'est pas mise a jour retroactivement. L'historique
    ne remonte par ailleurs que jusqu'a la date de mise en service de cette
    fonction - aucune donnee anterieure n'a jamais ete capturee.
    """
    today_iso = datetime.now(PARIS_TZ).date().isoformat()
    cutoff_iso = (datetime.now(PARIS_TZ).date() - timedelta(days=HISTORY_DAYS)).isoformat()
    archived = [
        e for e in (previous_events or [])
        if e.get("date") and cutoff_iso <= e["date"] < today_iso
    ]

    by_id = {}
    for e in archived:
        by_id[e["id"]] = e
    for e in new_data["events"]:
        by_id[e["id"]] = e  # le nouveau fetch prime sur l'archive en cas d'id partage
    new_data["events"] = sorted(by_id.values(), key=lambda e: (e["date"] or "", e["time"] or ""))
    return new_data


def main():
    try:
        with open(OUTPUT_PATH, "r", encoding="utf-8") as f:
            previous_events = json.load(f).get("events", [])
    except (FileNotFoundError, json.JSONDecodeError):
        previous_events = []

    data = merge_with_history(build_calendar_data(), previous_events)

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"OK — {len(data['events'])} evenements ecrits dans {os.path.abspath(OUTPUT_PATH)}")


if __name__ == "__main__":
    main()
