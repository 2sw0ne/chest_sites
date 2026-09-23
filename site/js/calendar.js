(() => {
  'use strict';

  // Codes ISO (flag-icons) pour chaque pays suivi - "eu" est un code special
  // (pas ISO-3166) mais supporte nativement par la librairie pour l'UE/zone euro.
  // CH/AU/CA/NZ ne servent qu'a l'affichage (identifier la paire) : le
  // calendrier ne suit pas leurs donnees economiques, voir PAIR_CONFIG.
  const FLAG_CODE = { US: 'us', EU: 'eu', UK: 'gb', JP: 'jp', CH: 'ch', AU: 'au', CA: 'ca', NZ: 'nz' };
  function flagIcon(country, extraClass) {
    const code = FLAG_CODE[country];
    if (!code) return country || '';
    return `<span class="fi fi-${code} flag-ic${extraClass ? ' ' + extraClass : ''}" title="${country}"></span>`;
  }
  const CCY_NAME = { US: "l'USD", EU: "l'EUR", UK: 'la GBP', JP: 'le JPY' };
  const IMP_LABEL = { high: 'Élevée', medium: 'Moyenne', low: 'Faible' };
  const IMP_STARS = { high: '✯✯✯', medium: '✯✯☆', low: '✯☆☆' };
  const IMPORTANCE_WEIGHT = { high: 3, medium: 2, low: 1 };

  const IMPORTANCE_KEY = 'chest_cal_importance';
  let allEvents = [];
  // Calibration reelle chargee depuis data/impact-calibration.json (voir
  // calendar-bridge/calibrate_impact.py) - null tant qu'elle n'est pas
  // chargee/disponible, auquel cas getCalibratedImpact() retourne null et
  // l'appelant retombe sur l'heuristique forfaitaire (IMPACT_BASE).
  let impactCalibration = null;

  // ---------------------------------------------------------------
  // Sentiment de marche par paire : chaque paire est pilotee par une ou
  // deux devises "motrices". weight=1 -> une surprise positive pour ce pays
  // pousse la paire a la hausse ; weight=-1 -> l'inverse (ex: dollar fort =
  // or plus faible, cotation en USD). Heuristique transparente, pas un
  // modele entraine - affichee comme telle sur la page.
  // ---------------------------------------------------------------
  const PAIR_CONFIG = {};
  // Forex : matrice complete des 8 devises suivies (28 paires), generee
  // plutot que ecrite a la main. Seules EUR/UK/US/JP ont un pays reellement
  // suivi par fetch_calendar.py -> une paire ou aucune des deux devises n'a
  // de pays suivi (ex. AUDCHF) aura simplement 0 driver, et affichera un
  // biais neutre honnete plutot qu'une fausse analyse (voir computeMarketSentiment,
  // qui gere deja `drivers: []` sans cas particulier).
  const CCY = {
    EUR: { flag: 'EU', country: 'EU', name: 'Euro' },
    GBP: { flag: 'UK', country: 'UK', name: 'Livre' },
    AUD: { flag: 'AU', country: null, name: 'Dollar australien' },
    NZD: { flag: 'NZ', country: null, name: 'Dollar néo-zélandais' },
    USD: { flag: 'US', country: 'US', name: 'Dollar' },
    CAD: { flag: 'CA', country: null, name: 'Dollar canadien' },
    CHF: { flag: 'CH', country: null, name: 'Franc suisse' },
    JPY: { flag: 'JP', country: 'JP', name: 'Yen' },
  };
  function buildFxConfig(base, quote) {
    const b = CCY[base], q = CCY[quote];
    const drivers = [];
    if (b.country) drivers.push({ country: b.country, weight: 1 });
    if (q.country) drivers.push({ country: q.country, weight: -1 });
    return { code: `${base}/${quote}`, label: `${b.name} / ${q.name}`, flagsHtml: flagIcon(b.flag) + flagIcon(q.flag), drivers };
  }
  // Ordre = convention forex standard (EUR > GBP > AUD > NZD > USD > CAD >
  // CHF > JPY), chaque paire une seule fois - correspond au regroupement
  // affiche cote compte.html (AUD/XXX, EUR/XXX, ...).
  [
    ['AUD', 'CHF'], ['AUD', 'USD'], ['AUD', 'CAD'], ['AUD', 'NZD'], ['AUD', 'JPY'],
    ['EUR', 'GBP'], ['EUR', 'CHF'], ['EUR', 'USD'], ['EUR', 'CAD'], ['EUR', 'AUD'], ['EUR', 'NZD'], ['EUR', 'JPY'],
    ['GBP', 'CHF'], ['GBP', 'USD'], ['GBP', 'CAD'], ['GBP', 'AUD'], ['GBP', 'NZD'], ['GBP', 'JPY'],
    ['USD', 'CHF'], ['USD', 'CAD'], ['USD', 'JPY'],
    ['NZD', 'CHF'], ['NZD', 'USD'], ['NZD', 'CAD'], ['NZD', 'JPY'],
    ['CAD', 'CHF'], ['CAD', 'JPY'],
    ['CHF', 'JPY'],
  ].forEach(([base, quote]) => { PAIR_CONFIG[base + quote] = buildFxConfig(base, quote); });

  // Matieres premieres : cotees en USD, un dollar fort pese generalement
  // dessus (heuristique plus approximative pour le petrole, dont l'offre/
  // demande physique domine largement les surprises macro US).
  Object.assign(PAIR_CONFIG, {
    XAUUSD: { code: 'XAU/USD', label: 'Or / Dollar', flagsHtml: '🪙' + flagIcon('US'), drivers: [{ country: 'US', weight: -1 }] },
    XAGUSD: { code: 'XAG/USD', label: 'Argent / Dollar', flagsHtml: '🥈' + flagIcon('US'), drivers: [{ country: 'US', weight: -1 }] },
    XPTUSD: { code: 'XPT/USD', label: 'Platine / Dollar', flagsHtml: '⚪' + flagIcon('US'), drivers: [{ country: 'US', weight: -1 }] },
    USOIL: { code: 'WTI/USD', label: 'Pétrole (WTI) / Dollar', flagsHtml: '🛢️' + flagIcon('US'), drivers: [{ country: 'US', weight: -1 }] },
    DXY: { code: 'DXY', label: 'Indice dollar', flagsHtml: '💵' + flagIcon('US'), drivers: [{ country: 'US', weight: 1 }] },
  });
  // Cryptos "de reference" : pas de calendrier macro pertinent, pilotees par
  // l'indice Fear & Greed (alternative.me) + donnees de marche (CoinGecko) -
  // voir renderCryptoSentiment(), branche separee du modele evenementiel ci-dessus.
  // geckoId = identifiant CoinGecko (verifie manuellement, tous different
  // parfois du symbole - ex. XRP -> "ripple", AVAX -> "avalanche-2").
  const CRYPTO_CONFIG = {
    BTCUSD: { code: 'BTC/USD', label: 'Bitcoin', geckoId: 'bitcoin', symbol: '₿' },
    ETHUSD: { code: 'ETH/USD', label: 'Ethereum', geckoId: 'ethereum', symbol: 'Ξ' },
    SOLUSD: { code: 'SOL/USD', label: 'Solana', geckoId: 'solana', symbol: '◎' },
    XRPUSD: { code: 'XRP/USD', label: 'XRP', geckoId: 'ripple', symbol: '✕' },
    TRXUSD: { code: 'TRX/USD', label: 'Tron', geckoId: 'tron', symbol: 'T' },
    HYPEUSD: { code: 'HYPE/USD', label: 'Hyperliquid', geckoId: 'hyperliquid', symbol: 'H' },
    DOGEUSD: { code: 'DOGE/USD', label: 'Dogecoin', geckoId: 'dogecoin', symbol: 'Ð' },
    LINKUSD: { code: 'LINK/USD', label: 'Chainlink', geckoId: 'chainlink', symbol: '⬡' },
    ADAUSD: { code: 'ADA/USD', label: 'Cardano', geckoId: 'cardano', symbol: '₳' },
    UNIUSD: { code: 'UNI/USD', label: 'Uniswap', geckoId: 'uniswap', symbol: '🦄' },
    AVAXUSD: { code: 'AVAX/USD', label: 'Avalanche', geckoId: 'avalanche-2', symbol: '▲' },
  };
  const PAIR_KEY = 'chest_sentiment_pair';

  function loadPair() {
    try {
      const p = localStorage.getItem(PAIR_KEY);
      if (p && (PAIR_CONFIG[p] || CRYPTO_CONFIG[p])) return p;
    } catch (e) { /* localStorage indisponible */ }
    return 'XAUUSD';
  }

  // Ton d'un evenement : compare la valeur disponible (reelle si publiee,
  // sinon le consensus/prevision) a sa reference (consensus si publie,
  // sinon le precedent) - donne un signal meme avant publication, a partir
  // de ce que le marche attend deja (le "previsionnel").
  function valueTone(ev) {
    const shown = ev.released ? ev.actual : ev.consensus;
    const reference = ev.released ? ev.consensus : ev.previous;
    const shownNum = parseFloat(String(shown).replace(',', '.'));
    const refNum = parseFloat(String(reference).replace(',', '.'));
    if (!shown || isNaN(shownNum) || isNaN(refNum) || !ev.directionBias) return 'neutral';
    const diff = shownNum - refNum;
    if (Math.abs(diff) < 1e-9) return 'neutral';
    const beat = diff > 0;
    const bullish = ev.directionBias === 'up' ? beat : !beat;
    return bullish ? 'pos' : 'neg';
  }

  // Ton du "previsionnel" seul (consensus vs precedent) - structurellement
  // identique a valueTone mais ne bascule JAMAIS sur le reel, meme publie :
  // sert a garder une colonne "Prevu" stable toute la semaine, a cote de la
  // colonne "Reel" (valueTone) qui elle passe de neutre a coloree une fois
  // l'evenement publie. Les deux coexistent sur chaque carte (voir driverCardHtml).
  function forecastTone(ev) {
    const shownNum = parseFloat(String(ev.consensus).replace(',', '.'));
    const refNum = parseFloat(String(ev.previous).replace(',', '.'));
    if (!ev.consensus || isNaN(shownNum) || isNaN(refNum) || !ev.directionBias) return 'neutral';
    const diff = shownNum - refNum;
    if (Math.abs(diff) < 1e-9) return 'neutral';
    const beat = diff > 0;
    const bullish = ev.directionBias === 'up' ? beat : !beat;
    return bullish ? 'pos' : 'neg';
  }

  // Bornes lundi->dimanche de la semaine contenant `ref`. Utilise pour borner
  // le cycle hebdomadaire du calendrier (voir renderSentimentHeader) : les
  // annonces d'une semaine restent affichees du lundi au dimanche, meme une
  // fois publiees, plutot que de disparaitre au fil des jours.
  function getWeekBounds(ref) {
    const d = new Date(ref);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay(); // 0 = dimanche ... 6 = samedi
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { monday, sunday };
  }
  // Le marche forex ferme vendredi ~22h UTC (17h New York) et rouvre
  // dimanche ~22h UTC - PAS a minuit UTC comme le decoupage calendaire
  // lundi->dimanche pourrait le laisser penser. Retour direct utilisateur
  // (2026-09-13) : le samedi et une bonne partie du dimanche, la semaine qui
  // vient de s'achever vendredi doit encore s'afficher comme "en cours"/
  // "a venir" tant que le marche n'a pas reellement rouvert - pas des le
  // premier instant du week-end calendaire.
  function isForexMarketClosedNow() {
    const now = new Date();
    const day = now.getUTCDay(); // 0=dimanche ... 6=samedi
    const hour = now.getUTCHours();
    if (day === 6) return true; // samedi : toujours ferme
    if (day === 0 && hour < 22) return true; // dimanche avant ~22h UTC : toujours ferme
    if (day === 5 && hour >= 22) return true; // vendredi apres ~22h UTC : deja ferme
    return false;
  }
  // Date de reference pour le decoupage lundi->dimanche, ajustee pour que
  // getWeekBounds() retombe deja sur la BONNE semaine une fois le marche
  // rouvert le dimanche soir - sans ca, getWeekBounds(new Date()) un dimanche
  // 23h renverrait encore le lundi de la semaine qui vient de se terminer
  // (le calendrier dit toujours "dimanche"), alors que la semaine de trading
  // suivante a deja commence.
  function tradingWeekReference() {
    const now = new Date();
    if (now.getUTCDay() === 0 && now.getUTCHours() >= 22) {
      return new Date(now.getTime() + 24 * 3600 * 1000);
    }
    return now;
  }
  function isoInRange(iso, monday, sunday) {
    return iso >= isoDateLocal(monday) && iso <= isoDateLocal(sunday);
  }

  // Estimation indicative (pas un vrai modele de pricing) de l'impact d'un
  // evenement sur un instrument donne : ampleur de base selon l'importance,
  // orientee par le sens de la surprise et le poids du pays pour cet
  // instrument. Plafonnee et clairement presentee comme une estimation.
  const IMPACT_BASE = { high: 0.6, medium: 0.35, low: 0.15 };
  function fmtMove(v) {
    if (v === null) return '—';
    // Arrondir D'ABORD, puis decider le signe sur la valeur ARRONDIE - sinon
    // un tout petit negatif (ex. -0.0014) affiche "−0,0%", un signe moins
    // devant zero qui n'a aucun sens pour l'utilisateur (retour direct).
    const rounded = Math.round(Math.abs(v) * 10) / 10;
    const sign = rounded === 0 ? '' : v > 0 ? '+' : '−';
    return `${sign}${rounded.toFixed(1).replace('.', ',')}%`;
  }
  // Classe .val (pos/neg/neutral) alignee sur la valeur ARRONDIE affichee par
  // fmtMove (voir ci-dessus) - sinon un chiffre qui s'affiche "0,0%" pouvait
  // quand meme ressortir en rouge/vert a cause d'un residu minuscule avant
  // arrondi, incoherent avec ce qui est ecrit.
  function moveTone(v) {
    if (v === null) return 'neutral';
    const rounded = Math.round(Math.abs(v) * 10) / 10;
    if (rounded === 0) return 'neutral';
    return v > 0 ? 'pos' : 'neg';
  }
  // Variante de fmtMove/moveTone pour un "impact estime" {value, tone} (voir
  // estimateForecastMove) : ici `tone` est decide explicitement par l'appelant
  // (pas devine depuis le signe de `value`), car `value` est une AMPLEUR
  // (toujours positive ou nulle) et non un mouvement signe - une ampleur non
  // nulle avec un ton "neutral" (direction pas encore determinee) doit
  // s'afficher avec un prefixe "±" neutre, jamais "+"/"−".
  function fmtImpact(est) {
    if (!est) return '—';
    const rounded = Math.round(Math.abs(est.value) * 10) / 10;
    if (rounded === 0) return '0,0%';
    const prefix = est.tone === 'pos' ? '+' : est.tone === 'neg' ? '−' : '±';
    return `${prefix}${rounded.toFixed(1).replace('.', ',')}%`;
  }
  function impactTone(est) {
    return est ? est.tone : 'neutral';
  }

  // Cherche une calibration REELLE (voir calendar-bridge/calibrate_impact.py,
  // qui mesure le vrai mouvement historique de prix apres chaque publication
  // passee d'un indicateur precis) pour cet evenement + cette paire cible.
  // Jointure par investingEventId (l'id stable investing.com capture par
  // fetch_calendar.py, ex. 69 pour "CPI (MoM)" US - verifie le 2026-09-12 :
  // memes ids que ceux utilises dans calibrate_impact.py pour PIB EU/JP,
  // BCE, PPI, inscriptions chomage). Retourne null si aucune calibration
  // n'existe encore pour cette paire precise (calibration pas terminee, ou
  // pas assez de points) - l'appelant retombe alors sur l'heuristique forfaitaire.
  // N'utilise une calibration que si sa confiance est au moins "moyenne"
  // (voir confidence_tier dans calibrate_impact.py : n>=15 ET |correlation|
  // >=0.2). En dessous, le beta est mesure sur trop peu de points / une
  // correlation trop proche de zero pour dire quoi que ce soit - l'utiliser
  // quand meme donnerait un chiffre qui a l'air precis mais qui n'est que du
  // bruit, PIRE que le forfait honnete (retour direct : "ca a l'air faux et
  // illogique"). getCalibratedImpactRaw() garde l'acces a la version brute
  // (avec confiance faible) pour l'affichage du badge "en cours de calibration".
  function getCalibratedImpactRaw(ev, targetConfig) {
    if (!impactCalibration || !ev.investingEventId) return null;
    const indicator = impactCalibration.indicators && impactCalibration.indicators[String(ev.investingEventId)];
    if (!indicator) return null;
    const pairKey = Object.keys(PAIR_CONFIG).find((k) => PAIR_CONFIG[k] === targetConfig);
    const calib = pairKey && indicator.pairs && indicator.pairs[pairKey];
    return calib || null;
  }
  function getCalibratedImpact(ev, targetConfig) {
    const calib = getCalibratedImpactRaw(ev, targetConfig);
    if (!calib || calib.confidence === 'faible') return null;
    return calib;
  }

  // Variante "previsionnelle" d'estimateMove : basee sur forecastTone (donc
  // JAMAIS sur le resultat reel), sans demi-poids pour les evenements pas
  // encore publies. C'est LA reference stable de la semaine (voir
  // computeForecastSentiment) - contrairement a estimateMove (qui, une fois
  // l'evenement publie, bascule sur la surprise reelle et peut donc changer
  // de sens/ampleur du jour au lendemain), celle-ci ne bouge pas juste parce
  // qu'une annonce est tombee.
  //
  // Retourne {value, tone} plutot qu'un simple nombre signe - AMPLEUR et
  // DIRECTION sont deux questions distinctes qu'il ne faut pas melanger :
  //
  // AMPLEUR ("si cet evenement sort, quelle taille de mouvement attendre ?") :
  // BUG CORRIGE (2026-09-12, retour direct utilisateur avec l'exemple du PPI
  // US aout : previsionnel 0,4% quasi identique au mois precedent -> ampleur
  // affichait 0% alors que l'evenement est 3 etoiles/"eleve", ce qui n'a pas
  // de sens : une annonce importante garde un potentiel d'impact meme quand
  // son consensus n'a pas bouge depuis le mois dernier - "pas de changement
  // de prevision" ne veut pas dire "pas d'impact possible a la publication".
  // L'ancienne formule (beta x ecart Prevu/Precedent) melangeait les deux
  // questions et s'effondrait a ~0 des que cet ecart etait petit, quelle que
  // soit l'importance reelle de l'evenement. Desormais l'ampleur vient de
  // l'impact TYPIQUE reellement mesure pour cet indicateur (beta x
  // stdSurprise, l'ecart-type des surprises passees dans calibrate_impact.py -
  // "quand cet indicateur publie une surprise de taille habituelle, de
  // combien bouge la paire en moyenne"), independant du delta vs precedent.
  // Sans calibration exploitable, retombe sur le forfait par etoile
  // (IMPACT_BASE) - jamais 0 pour un evenement suivi.
  //
  // DIRECTION (haussier/baissier/incertaine) : reste basee sur forecastTone
  // (consensus vs precedent, "la prevision s'oriente-t-elle plutot vers plus
  // ou moins de ce qui est hawkish/dovish pour ce pays"). Quand le consensus
  // est identique au precedent, la direction est honnetement "incertaine"
  // (ton neutre) - mais l'ampleur, elle, reste affichee : l'evenement peut
  // toujours surprendre dans un sens ou dans l'autre a la publication.
  function estimateForecastMove(ev, targetConfig) {
    if (!targetConfig) return null;
    const driver = targetConfig.drivers.find((d) => d.country === ev.country);
    if (!driver) return null;

    const calib = getCalibratedImpact(ev, targetConfig);
    const magnitude = (calib && typeof calib.stdSurprise === 'number')
      ? Math.abs(calib.beta * calib.stdSurprise)
      : (IMPACT_BASE[ev.importance] || 0.2);

    const dirTone = forecastTone(ev);
    if (dirTone === 'neutral') return { value: magnitude, tone: 'neutral' };
    const sign = (dirTone === 'pos' ? 1 : -1) * driver.weight;
    return { value: sign * magnitude, tone: sign > 0 ? 'pos' : 'neg' };
  }

  // pairKeyOrConfig accepte soit une cle de PAIR_CONFIG (usage normal), soit
  // directement un objet {drivers:[...]} (utilise par le sentiment crypto,
  // qui a besoin d'une config "macro US generique" sans entree dans PAIR_CONFIG).
  function computeMarketSentiment(events, pairKeyOrConfig) {
    const config = typeof pairKeyOrConfig === 'string' ? PAIR_CONFIG[pairKeyOrConfig] : pairKeyOrConfig;
    const drivers = [];
    let score = 0;
    if (config) {
      events.forEach((ev) => {
        if (ev.importance === 'low') return; // trop de bruit pour peser sur un biais
        const driver = config.drivers.find((d) => d.country === ev.country);
        if (!driver) return;
        const rawTone = valueTone(ev);
        // Un evenement suivi (pays driver + importance suffisante) reste dans
        // la liste MEME si aucune direction n'est encore determinable (pas
        // encore de reel/consensus exploitable) - il pese 0 sur le score mais
        // continue d'apparaitre comme "impactant" cet instrument (retour
        // direct utilisateur du 2026-09-16 : "tout ce qui est USD 3 etoiles
        // est cense impacter XAUUSD", disparaissait avant silencieusement).
        if (rawTone === 'neutral') { drivers.push({ ev, tone: 'neutral' }); return; }
        const rawSign = rawTone === 'pos' ? 1 : -1;
        const pairSign = rawSign * driver.weight;
        const weight = (IMPORTANCE_WEIGHT[ev.importance] || 1) * (ev.released ? 1 : 0.5);
        score += pairSign * weight;
        drivers.push({ ev, tone: pairSign > 0 ? 'pos' : 'neg' });
      });
    }
    let tone = 'neutral';
    if (score >= 2) tone = 'pos';
    else if (score <= -2) tone = 'neg';
    drivers.sort((a, b) => (a.ev.date + (a.ev.time || '')).localeCompare(b.ev.date + (b.ev.time || '')));
    return { score, tone, drivers };
  }

  // Version "previsionnelle" de computeMarketSentiment : score et liste de
  // cartes bases sur forecastTone pour TOUS les evenements (publies ou non),
  // jamais sur le resultat reel. C'est la reference utilisee pour le %
  // affiche en gros dans le hero et pour la liste des cartes de la semaine :
  // determinee une fois par semaine (a partir des consensus), elle ne
  // retombe pas vers 0%/neutre juste parce que des annonces sont publiees
  // entre-temps - seul un changement de consensus avant publication (rare)
  // la fait bouger. Le resultat REEL (une fois connu) est traite a part :
  // couleur "Reel" de chaque carte (valueTone) et comparateur Prevision/
  // Realise de la semaine passee (renderWeekResult).
  function computeForecastSentiment(events, pairKeyOrConfig) {
    const config = typeof pairKeyOrConfig === 'string' ? PAIR_CONFIG[pairKeyOrConfig] : pairKeyOrConfig;
    const drivers = [];
    let score = 0;
    if (config) {
      events.forEach((ev) => {
        if (ev.importance === 'low') return;
        const driver = config.drivers.find((d) => d.country === ev.country);
        if (!driver) return;
        const rawTone = forecastTone(ev);
        // Meme principe que computeMarketSentiment (voir commentaire
        // au-dessus) : un evenement suivi sans direction determinable reste
        // affiche, poids 0 sur le score.
        if (rawTone === 'neutral') { drivers.push({ ev, tone: 'neutral' }); return; }
        const rawSign = rawTone === 'pos' ? 1 : -1;
        const pairSign = rawSign * driver.weight;
        const weight = IMPORTANCE_WEIGHT[ev.importance] || 1;
        score += pairSign * weight;
        drivers.push({ ev, tone: pairSign > 0 ? 'pos' : 'neg' });
      });
    }
    let tone = 'neutral';
    if (score >= 2) tone = 'pos';
    else if (score <= -2) tone = 'neg';
    drivers.sort((a, b) => (a.ev.date + (a.ev.time || '')).localeCompare(b.ev.date + (b.ev.time || '')));
    return { score, tone, drivers };
  }

  // ---------------------------------------------------------------
  // Sentiment crypto : different du modele forex (pas de calendrier macro
  // dedie a la crypto), mais PAS juste le Fear & Greed brut - combine trois
  // signaux court terme pour donner un biais "sur la semaine" :
  //  1. Macro US generique (meme calendrier que les autres paires) : un
  //     contexte US plutot accommodant/dovish est lu comme "risk-on" donc
  //     plutot haussier pour la crypto (meme convention que l'or) ; un
  //     contexte restrictif/hawkish est lu comme "risk-off" donc baissier.
  //  2. Fear & Greed Index (alternative.me) : sentiment de marche general.
  //  3. Momentum 24h de la piece suivie (CoinGecko) : signal court terme,
  //     plus rapide que le reste - la crypto bouge vite, contrairement au
  //     forex ou une semaine d'annonces suffit.
  // Poids arbitraires mais documentes (0.4 / 0.35 / 0.25) - heuristique
  // transparente, pas un modele entraine, comme partout ailleurs sur la page.
  // ---------------------------------------------------------------
  const CRYPTO_MACRO_CONFIG = { drivers: [{ country: 'US', weight: -1 }] };
  let cryptoDataCache = null;
  async function fetchCryptoData() {
    if (cryptoDataCache) return cryptoDataCache;
    const ids = Object.values(CRYPTO_CONFIG).map((c) => c.geckoId).join(',');
    const [fng, markets] = await Promise.all([
      fetch('https://api.alternative.me/fng/?limit=1').then((r) => r.json()).catch(() => null),
      fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&price_change_percentage=24h`).then((r) => r.json()).catch(() => null),
    ]);
    const marketsById = {};
    (Array.isArray(markets) ? markets : []).forEach((m) => { marketsById[m.id] = m; });
    cryptoDataCache = { fng, marketsById };
    return cryptoDataCache;
  }
  const FNG_LABEL_FR = { 'Extreme Fear': 'Peur extrême', Fear: 'Peur', Neutral: 'Neutre', Greed: 'Cupidité', 'Extreme Greed': 'Cupidité extrême' };
  function fmtPctFr(v) {
    if (v == null || isNaN(v)) return '—';
    return (v >= 0 ? '+' : '') + v.toFixed(1).replace('.', ',') + '%';
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  async function renderCryptoSentiment(events, pairKey) {
    const hero = document.getElementById('sentimentHero');
    const meta = CRYPTO_CONFIG[pairKey];
    document.getElementById('sentimentEconMode').hidden = true;
    document.getElementById('econBlocks').hidden = true;
    document.getElementById('cryptoBlocks').hidden = false;
    document.getElementById('sentimentCryptoMode').hidden = false;
    document.getElementById('moversSection').hidden = false;
    document.getElementById('sentimentCode').textContent = meta.code;
    document.getElementById('sentimentLabel').textContent = meta.label;
    document.getElementById('cryptoWeekly').textContent = '—';
    document.getElementById('cryptoText').textContent = 'Chargement des données de marché…';
    document.getElementById('sentimentBadge').textContent = 'Chargement…';
    document.getElementById('cryptoCards').innerHTML = '';

    const data = await fetchCryptoData();
    const coinMarket = data.marketsById[meta.geckoId];
    const fngEntry = data.fng && data.fng.data && data.fng.data[0];

    if (!fngEntry && !coinMarket) {
      hero.dataset.tone = 'neutral';
      document.getElementById('sentimentBadge').textContent = 'Indisponible';
      document.getElementById('cryptoBlocks').hidden = true;
      document.getElementById('cryptoText').textContent = 'Données indisponibles pour le moment (alternative.me / coingecko.com).';
      return;
    }

    // 1) Macro US generique - meme calcul que pour une paire forex/matiere
    // premiere, juste avec une config dediee (pas dans PAIR_CONFIG).
    const { score: macroScore, drivers: macroDrivers } = computeMarketSentiment(events, CRYPTO_MACRO_CONFIG);
    const macroNorm = clamp(macroScore / 4, -1, 1);

    // 2) Fear & Greed (0-100 -> -1..+1 autour de 50).
    const fngVal = fngEntry ? Number(fngEntry.value) : null;
    const fngClass = fngEntry ? fngEntry.value_classification : null;
    const fngNorm = fngVal != null ? (fngVal - 50) / 50 : 0;

    // 3) Momentum 24h de la piece suivie.
    const chg24h = coinMarket ? coinMarket.price_change_percentage_24h : null;
    const momentumNorm = chg24h != null ? clamp(chg24h / 5, -1, 1) : 0;

    const combined = macroNorm * 0.4 + fngNorm * 0.35 + momentumNorm * 0.25;
    const tone = combined >= 0.12 ? 'pos' : combined <= -0.12 ? 'neg' : 'neutral';
    hero.dataset.tone = tone;
    document.getElementById('sentimentBadge').textContent = tone === 'pos' ? 'Biais haussier' : tone === 'neg' ? 'Biais baissier' : 'Neutre';
    document.getElementById('cryptoWeekly').textContent = fmtPctFr(clamp(combined * 5, -5, 5));

    // Texte explicatif : ne cite que les composantes qui pesent reellement,
    // pour rester honnete si un signal est neutre plutot que d'inventer une justification.
    const parts = [];
    if (Math.abs(macroNorm) > 0.15) parts.push(`un contexte macro US plutôt ${macroNorm > 0 ? 'accommodant' : 'restrictif'} (${macroDrivers.length} annonce${macroDrivers.length > 1 ? 's' : ''})`);
    if (fngVal != null && Math.abs(fngNorm) > 0.1) parts.push(`un sentiment de marché en zone de ${(FNG_LABEL_FR[fngClass] || fngClass).toLowerCase()} (${fngVal})`);
    if (chg24h != null && Math.abs(momentumNorm) > 0.1) parts.push(`un momentum 24h ${momentumNorm > 0 ? 'positif' : 'négatif'} (${fmtPctFr(chg24h)}) sur ${meta.label}`);
    document.getElementById('cryptoText').textContent = parts.length
      ? `Biais ${tone === 'pos' ? 'haussier' : tone === 'neg' ? 'baissier' : 'neutre'} porté par ${parts.join(', ')}. Combine calendrier macro US, Fear & Greed et momentum court terme — une heuristique de tendance, pas une prédiction de prix.`
      : `Signaux mitigés sur ${meta.code} cette semaine — aucune composante ne domine assez pour dégager un biais net.`;

    // Cartes : la piece suivie (avec son vrai logo CoinGecko) en premier,
    // puis jusqu'a 3 annonces macro ayant reellement pese sur le score -
    // pas les 11 references (l'utilisateur suit UNE paire a la fois).
    let cardsHtml = '';
    if (coinMarket) {
      const chgTone = chg24h > 0.05 ? 'pos' : chg24h < -0.05 ? 'neg' : 'neutral';
      cardsHtml += `
        <div class="driver-card">
          <div class="driver-card__top">
            <img class="driver-card__logo" src="${coinMarket.image}" alt="">
            <span class="driver-card__name">${meta.label}</span>
            <span class="tag">Suivi</span>
          </div>
          <div class="driver-card__value val ${chgTone}">$${coinMarket.current_price.toLocaleString('fr-FR')}</div>
          <div class="driver-card__estimates">
            <div><span>Variation 24h</span><b class="val ${chgTone}">${fmtPctFr(chg24h)}</b></div>
            <div><span>Rang cap.</span><b class="val neutral">${coinMarket.market_cap_rank ? '#' + coinMarket.market_cap_rank : '—'}</b></div>
          </div>
        </div>`;
    }
    cardsHtml += macroDrivers.slice(0, 3).map((d) => {
      const shown = d.ev.released ? d.ev.actual : d.ev.consensus;
      return `
        <div class="driver-card">
          <div class="driver-card__top">
            ${flagIcon(d.ev.country)}
            <span class="driver-card__name">${d.ev.event}</span>
            <span class="tag">${d.ev.released ? 'Publié' : 'À venir'}</span>
          </div>
          <div class="driver-card__value val ${d.tone}">${shown || '—'}</div>
        </div>`;
    }).join('');
    document.getElementById('cryptoCards').innerHTML = cardsHtml;
  }

  // Nom du jour (lundi/mardi/...) d'un evenement, ou "Aujourd'hui" - remplace
  // l'ancien badge "Publié"/"À venir" sur les cartes : une fois la semaine
  // entiere affichee (lundi->dimanche), ce badge etait ambigu (une annonce
  // de lundi encore marquee "publiee" le vendredi n'apprend rien ; une
  // annonce qualitative - discours, sans donnee chiffree - restait bloquee
  // sur "a venir" pour toujours, meme apres avoir eu lieu). Savoir QUEL jour
  // est la vraie information utile ici.
  const WEEKDAY_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  function dayBadge(ev) {
    if (!ev.date) return '';
    if (ev.date === isoDateLocal(new Date())) return "Aujourd'hui";
    const name = WEEKDAY_FR[new Date(ev.date + 'T00:00:00').getDay()];
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  // Carte d'annonce partagee entre la vue "semaine en cours" et les deux
  // blocs du mode weekend (bilan passe / previsionnel a venir) : colonne
  // "Prevu" (forecastTone, stable) a gauche, trait violet, colonne "Reel"
  // (valueTone une fois publie, sinon "En attente") a droite. Avant
  // publication, "Prevu" est la valeur mise en avant (grande) et "Reel"
  // reste petit/attenue ("En attente") ; une fois publie, le rapport
  // s'inverse - "Reel" devient la valeur mise en avant, "Prevu" reste
  // visible mais petit, comme reference. Repond directement au "je vois
  // des % je sais pas si c'est la prevision ou la realite".
  function driverCardHtml(d) {
    const ev = d.ev;
    const badge = [dayBadge(ev), ev.time].filter(Boolean).join(' '); // "Lundi 14:30"
    if (hasNoData(ev)) {
      // Evenement qualitatif (discours, conference...) : jamais de valeur
      // chiffree, meme une fois passe - inutile (et trompeur) de lui
      // appliquer le badge "publie/a venir" ou le duo Prevu/Reel.
      return `
        <div class="driver-card">
          <div class="driver-card__top">
            ${flagIcon(ev.country)}
            <span class="driver-card__name">${ev.event}</span>
            <span class="tag">${badge}</span>
          </div>
          <p class="driver-empty" style="margin:0">Évènement qualitatif — pas de donnée chiffrée attendue.</p>
        </div>`;
    }
    const forecastVal = ev.consensus || '—';
    const realVal = ev.released ? (ev.actual || '—') : 'En attente';
    const fTone = forecastTone(ev);
    const rTone = ev.released ? valueTone(ev) : 'neutral';
    // estimateForecastMove (pas estimateMove) : "Est. XAU/DXY" repond a "si
    // la prevision se realise, quelle consequence sur XAU/DXY" - une
    // question sur le PREVU, qui a une reponse meme apres publication et ne
    // retombe pas a 0% juste parce que le reel a fini pile sur le consensus
    // (aucune "surprise" ne veut pas dire "aucun impact attendu" : le
    // consensus lui-meme pouvait deja impliquer un mouvement vs le
    // precedent). Repond directement au retour "je veux savoir la
    // consequence SI le % prevu arrive".
    const xauMove = estimateForecastMove(ev, PAIR_CONFIG.XAUUSD);
    const dxyMove = estimateForecastMove(ev, PAIR_CONFIG.DXY);
    const xauCalib = getCalibratedImpact(ev, PAIR_CONFIG.XAUUSD);
    const xauCalibRaw = getCalibratedImpactRaw(ev, PAIR_CONFIG.XAUUSD);
    const forecastMain = !ev.released;
    // Quand le reel tombe pile sur le consensus, Prevu et Reel affichent le
    // meme chiffre - volontaire (donnee reelle), mais ressemble a un bug
    // d'affichage si rien ne le signale explicitement (retour utilisateur direct).
    const exactMatch = ev.released && String(forecastVal) === String(realVal) && realVal !== '—';
    return `
      <div class="driver-card">
        <div class="driver-card__top">
          ${flagIcon(ev.country)}
          <span class="driver-card__name">${ev.event}</span>
          <span class="tag">${badge}</span>
        </div>
        <div class="driver-card__compare">
          <div class="driver-card__compare-col ${forecastMain ? 'is-main' : 'is-ref'}"><span>Prévu</span><b class="val ${fTone}">${forecastVal}</b></div>
          <div class="driver-card__divider"></div>
          <div class="driver-card__compare-col ${forecastMain ? 'is-ref' : 'is-main'}"><span>Réel</span><b class="val ${rTone}">${realVal}</b></div>
        </div>
        ${exactMatch ? '<div class="driver-card__match">✓ Résultat exactement conforme au consensus</div>' : ''}
        <div class="driver-card__estimates">
          <div><span>Est. XAU</span><b class="val ${impactTone(xauMove)}">${fmtImpact(xauMove)}</b></div>
          <div><span>Est. DXY</span><b class="val ${impactTone(dxyMove)}">${fmtImpact(dxyMove)}</b></div>
        </div>
        ${xauCalib
          ? `<div class="driver-card__calib">📊 Estimation XAU calibrée sur ${xauCalib.n} publications passées (confiance ${xauCalib.confidence})</div>`
          : xauCalibRaw
            ? `<div class="driver-card__calib is-heuristic">Estimation forfaitaire — calibration en cours (${xauCalibRaw.n} publications, pas encore assez fiable)</div>`
            : `<div class="driver-card__calib is-heuristic">Estimation forfaitaire (pas encore calibrée sur l'historique réel)</div>`}
      </div>`;
  }

  // ---------- Pile compacte "semaine a venir" : 3 annonces vedettes (plus
  // gros risque d'impact estime) + le reste replie en tranches cliquables -
  // retour direct utilisateur du 2026-09-16. Le score de tri privilegie
  // d'abord l'importance (high > medium > low, comme un vrai taux Fed passe
  // toujours devant), puis le mouvement estime en cas d'egalite. ----------
  function driverImpactScore(d, config) {
    const impWeight = { high: 3, medium: 2, low: 1 }[d.ev.importance] || 1;
    const est = estimateForecastMove(d.ev, config);
    const move = est && typeof est.value === 'number' ? Math.abs(est.value) : 0;
    return impWeight * 1000 + move;
  }
  function rankedDrivers(drivers, config) {
    return drivers.slice().sort((a, b) => driverImpactScore(b, config) - driverImpactScore(a, config));
  }
  function driverTabTone(d) {
    if (hasNoData(d.ev)) return 'neutral';
    return d.ev.released ? valueTone(d.ev) : forecastTone(d.ev);
  }
  // Coupe proprement sur un mot entier (jamais en plein milieu) pour rester
  // lisible en texte vertical sur une tranche de 18px de large.
  function driverTabLabel(ev) {
    const words = (ev.event || '').split(' ');
    let label = words[0] || '';
    for (let i = 1; i < words.length && label.length < 15; i++) label += ' ' + words[i];
    return label.length > 24 ? label.slice(0, 22) + '…' : label;
  }
  function driverTabHtml(d, i) {
    return `
      <button type="button" class="driver-tab" data-i="${i}" title="${d.ev.event}">
        ${flagIcon(d.ev.country)}
        <span class="driver-tab__name">${driverTabLabel(d.ev)}</span>
        <span class="driver-tab__dot ${driverTabTone(d)}"></span>
      </button>`;
  }
  // Repere visuel "Maintenant" (façon appli mobile de calendrier eco) - inséré
  // dans la pile juste avant la premiere annonce encore a venir, au milieu
  // des annonces deja passees plus a gauche - retour direct utilisateur du
  // 2026-09-16 ("une barre de l'heure actuelle au niveau des annonces
  // passées").
  //
  // Selection persistee par bloc (haut "semaine a venir" vs bas "semaine
  // passee", chacun sa propre pile) - retour direct utilisateur du
  // 2026-09-16 ("par defaut la 4eme annonce la plus importante, ou laisse
  // l'annonce que j'aurais ouverte"). Cle = ids.stack (stable d'un rendu a
  // l'autre), valeur = index dans `rest`, remise a 0 uniquement si l'ancien
  // choix n'existe plus (moins d'annonces cette fois-ci).
  const driverCompactSelection = {};

  function renderDriverCompact(ids, drivers, config, emptyMessage) {
    const top3Wrap = document.getElementById(ids.top3);
    const compactWrap = document.getElementById(ids.compact);
    const stackWrap = document.getElementById(ids.stack);
    const detailWrap = document.getElementById(ids.detail);
    if (!top3Wrap || !compactWrap) return;
    if (!drivers.length) {
      top3Wrap.innerHTML = `<p class="driver-empty">${emptyMessage}</p>`;
      compactWrap.hidden = true;
      return;
    }
    const ranked = rankedDrivers(drivers, config);
    const top3 = ranked.slice(0, 3);
    const rest = ranked.slice(3);
    top3Wrap.innerHTML = top3.map(driverCardHtml).join('');

    if (!rest.length) { compactWrap.hidden = true; return; }
    compactWrap.hidden = false;

    const nowIso = isoDateLocal(new Date());
    const nowHM = new Date().toTimeString().slice(0, 5);
    let insertedSep = false;
    stackWrap.innerHTML = rest.map((d, i) => {
      const isFuture = d.ev.date > nowIso || (d.ev.date === nowIso && (d.ev.time || '00:00') > nowHM);
      const prefix = (isFuture && !insertedSep) ? (insertedSep = true, '<div class="driver-now-sep"><span>Maintenant</span></div>') : '';
      return prefix + driverTabHtml(d, i);
    }).join('');

    // 4eme annonce la plus importante par defaut (rest[0], juste apres les 3
    // vedettes) - ou la selection precedente si elle est toujours valide.
    const savedIndex = driverCompactSelection[ids.stack];
    const selectedIndex = (savedIndex != null && savedIndex < rest.length) ? savedIndex : 0;

    function selectTab(i) {
      driverCompactSelection[ids.stack] = i;
      stackWrap.querySelectorAll('.driver-tab').forEach((b) => b.classList.toggle('is-active', Number(b.dataset.i) === i));
      detailWrap.innerHTML = driverCardHtml(rest[i]);
    }
    stackWrap.querySelectorAll('.driver-tab').forEach((btn) => {
      btn.addEventListener('click', () => selectTab(Number(btn.dataset.i)));
    });
    selectTab(selectedIndex);
  }

  // Cache localStorage pour fetchWeeklyRealMovePct - AJOUTE (2026-09-12,
  // retour direct) : sans cache, chaque (re)chargement de la page relance un
  // appel Twelve Data, alors que la cle est PARTAGEE avec calibrate_impact.py
  // (quota journalier de 800, deja epuise une fois par mes propres tests +
  // relances de calibration le meme jour). Une semaine DEJA TERMINEE (le
  // "sunday" demande est dans le passe) a un resultat qui ne changera plus
  // jamais - cachee de facon PERMANENTE. La semaine EN COURS (priceEndDate =
  // aujourd'hui) est cachee seulement quelques heures, pour continuer a se
  // rafraichir dans la journee sans re-appeler a chaque reload.
  const REALMOVE_CACHE_KEY = 'chest_cal_realmove_cache';
  const REALMOVE_LIVE_TTL_MS = 3 * 3600 * 1000;
  function loadRealMoveCache() {
    try { return JSON.parse(localStorage.getItem(REALMOVE_CACHE_KEY) || '{}'); } catch (e) { return {}; }
  }
  function saveRealMoveCache(cache) {
    try {
      const keys = Object.keys(cache);
      while (keys.length > 60) { delete cache[keys.shift()]; } // pas d'accumulation infinie
      localStorage.setItem(REALMOVE_CACHE_KEY, JSON.stringify(cache));
    } catch (e) { /* tant pis */ }
  }

  // Mouvement reel du prix sur [monday, sunday] (% signe), utilise le weekend
  // pour comparer le biais estime de la semaine passee a ce qui s'est
  // reellement passe. Forex/matieres premieres -> Twelve Data (deja utilise
  // par BERICH/Strategies) ; crypto -> historique CoinGecko. Retourne null
  // (jamais une fausse valeur) si la source ne repond pas ou manque de clé -
  // le bloc de comparaison reste alors simplement masque.
  // Relais authentifié vers Twelve Data (accounts-bridge/server.py, /twelvedata/<endpoint>) : la
  // vraie clé API ne vit plus dans un fichier livré au frontend - voir scanner-chart.js pour le
  // detail complet (meme mecanique, dupliquee ici a l'identique).
  function twelveDataApi(endpoint, params) {
    const base = (window.CHEST_CONFIG && window.CHEST_CONFIG.accountsApiUrl) || 'http://localhost:8080';
    const token = window.CHESTAccounts && CHESTAccounts.getToken && CHESTAccounts.getToken();
    const qs = new URLSearchParams(params).toString();
    return fetch(`${base}/twelvedata/${endpoint}?${qs}`, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
  }

  const REALMOVE_FAILURE_TTL_MS = 15 * 60 * 1000; // echec (quota/reseau) : retente apres 15 min, pas a chaque reload
  async function fetchWeeklyRealMovePct(pairKey, monday, sunday) {
    const cacheKey = `${pairKey}|${isoDateLocal(monday)}|${isoDateLocal(sunday)}`;
    const isLiveWeek = isoDateLocal(sunday) >= isoDateLocal(new Date());
    const cache = loadRealMoveCache();
    const cached = cache[cacheKey];
    if (cached) {
      const ttl = cached.value === null ? REALMOVE_FAILURE_TTL_MS : (isLiveWeek ? REALMOVE_LIVE_TTL_MS : Infinity);
      if (Date.now() - cached.fetchedAt < ttl) return cached.value;
    }
    const value = await (async () => {
      try {
        if (CRYPTO_CONFIG[pairKey]) {
          const meta = CRYPTO_CONFIG[pairKey];
          const from = Math.floor(monday.getTime() / 1000);
          const to = Math.floor((sunday.getTime() + 86400000) / 1000);
          const res = await fetch(`https://api.coingecko.com/api/v3/coins/${meta.geckoId}/market_chart/range?vs_currency=usd&from=${from}&to=${to}`);
          const data = await res.json();
          const prices = data && data.prices;
          if (!Array.isArray(prices) || prices.length < 2) return null;
          const first = prices[0][1];
          const last = prices[prices.length - 1][1];
          if (!first) return null;
          return ((last - first) / first) * 100;
        }
        const config = PAIR_CONFIG[pairKey];
        if (!config) return null;
        const res = await twelveDataApi('time_series', { symbol: config.code, interval: '1day', start_date: isoDateLocal(monday), end_date: isoDateLocal(sunday), outputsize: 10 });
        const data = await res.json();
        const values = data && data.values;
        if (!Array.isArray(values) || values.length < 2) return null;
        // Twelve Data renvoie les bougies du plus recent au plus ancien.
        const last = parseFloat(values[0].close);
        const first = parseFloat(values[values.length - 1].close);
        if (!first || isNaN(first) || isNaN(last)) return null;
        return ((last - first) / first) * 100;
      } catch (e) {
        return null;
      }
    })();
    cache[cacheKey] = { value, fetchedAt: Date.now() };
    saveRealMoveCache(cache);
    return value;
  }

  // Verrouille le % principal + le ton (badge/lueur) d'une semaine donnee
  // (pairKey+lundi) dans localStorage des le premier rendu de cette semaine,
  // puis renvoie TOUJOURS cette meme valeur pour le reste de la semaine -
  // meme si un consensus est revise avant publication, meme en rechargeant
  // la page. C'est le nombre qui "englobe toute la semaine" et qui doit
  // rester identique du lundi au vendredi, contrairement a la liste de
  // cartes (drivers) qui elle reste toujours recalculee en direct pour que
  // chaque "Reel" se mette a jour normalement. Cle differente par semaine
  // (le lundi change) => une nouvelle semaine se recalcule naturellement.
  const WEEKLY_FORECAST_LOCK_KEY = 'chest_weekly_forecast_lock';
  // Plafond (points de %) applique a la somme hebdo des estimations.
  const WEEKLY_CAP = 3;
  function loadForecastLocks() {
    try { return JSON.parse(localStorage.getItem(WEEKLY_FORECAST_LOCK_KEY) || '{}'); } catch (e) { return {}; }
  }
  function getLockedWeeklyForecast(pairKey, monday, freshResult, config) {
    const key = `${pairKey}|${isoDateLocal(monday)}`;
    const locks = loadForecastLocks();
    if (locks[key]) return locks[key];
    // Somme SIGNEE uniquement (une direction incertaine ne doit pas gonfler
    // le total hebdo, meme si son "Est. XAU" par carte affiche une ampleur
    // non nulle - voir estimateForecastMove) : coherent avec
    // computeForecastSentiment qui ignore deja ces evenements dans son score.
    const total = freshResult.drivers.reduce((sum, d) => {
      const est = estimateForecastMove(d.ev, config);
      return sum + (est && est.tone !== 'neutral' ? est.value : 0);
    }, 0);
    const locked = { weeklyCapped: Math.max(-WEEKLY_CAP, Math.min(WEEKLY_CAP, total)), tone: freshResult.tone };
    // BUG CORRIGE (2026-09-14, retour direct utilisateur) : ne JAMAIS figer
    // un verrou base sur ZERO annonce (freshResult.drivers.length===0) - ca
    // arrive quand la page tourne la toute premiere fois de la semaine
    // pendant un incident de donnees (scraping investing.com en echec,
    // Railway qui vient de redemarrer sans historique...). Avant ce fix, ce
    // "rien" se figeait pour toute la semaine, sans visuel jusqu'au lundi
    // suivant. Desormais, un resultat vide n'est PAS sauvegarde - la fonction
    // recalcule a chaque rechargement de page jusqu'a ce que de vraies
    // annonces apparaissent, et LA seulement le verrou se fige (comme prevu).
    if (!freshResult.drivers.length) return locked;
    locks[key] = locked;
    const keys = Object.keys(locks).sort();
    while (keys.length > 8) { delete locks[keys.shift()]; } // 8 semaines glissantes, pas d'accumulation infinie
    try { localStorage.setItem(WEEKLY_FORECAST_LOCK_KEY, JSON.stringify(locks)); } catch (e) { /* tant pis */ }
    return locked;
  }

  // "Reussite" de la prevision = le SENS (haussier/baissier) annonce lundi
  // etait-il le bon, une fois le reel connu - pas un ecart de magnitude en %
  // (remplace une ancienne version en %, retour direct utilisateur du
  // 2026-09-13 : un ecart de magnitude important entre deux valeurs bornees
  // differemment (prevision plafonnee a +/-WEEKLY_CAP, realise jamais
  // plafonne) donnait des scores qui semblaient "abuses" meme quand le sens
  // etait juste). Coche si prevision et realise sont du meme signe, croix si
  // opposes. Si l'un des deux est trop proche de zero pour avoir un sens
  // clair, aucun verdict tranche (affiche neutre) - toujours une lecture
  // indicative, pas une vraie metrique de precision statistique.
  function forecastDirectionMatch(prevision, realise) {
    if (prevision === null || realise === null || prevision === undefined) return null;
    if (Math.abs(prevision) < 0.05 || Math.abs(realise) < 0.05) return null;
    return (prevision > 0) === (realise > 0);
  }

  // Devise(s) de la paire qui n'ont PAS de pays suivi par fetch_calendar.py
  // (voir CCY plus haut - seuls EU/UK/US/JP le sont). Retour direct
  // utilisateur (2026-09-13) : sur une paire comme CAD/JPY, la Prevision ne
  // se base QUE sur le Yen (le Dollar canadien n'a aucun driver, voir
  // buildFxConfig) - un ecart important avec le Realise n'est alors PAS une
  // erreur de calcul, juste le signe honnete que la moitie des vrais moteurs
  // de la paire (BdC, petrole, donnees canadiennes...) sont invisibles au
  // modele. A afficher explicitement plutot que de laisser une "Reussite"
  // basse sans explication a cote d'annonces suivies pourtant tres proches
  // du consensus.
  function missingCurrencyNames(config) {
    if (!config.code || !config.code.includes('/')) return [];
    return config.code.split('/').filter((c) => CCY[c] && !CCY[c].country).map((c) => CCY[c].name);
  }

  // Comparateur "Prevision / Realise / Reussite" pour LA SEMAINE PASSEE
  // (jamais la semaine en cours - il faut que le "Realise" ait un sens, donc
  // que la semaine soit terminee). previsionValue = null si aucune annonce
  // suivie cette semaine-la (pas de prevision a comparer).
  //
  // Jeton de generation : cette fonction attend une reponse reseau
  // (fetchWeeklyRealMovePct). Sans garde-fou, une reponse EN RETARD d'un
  // rendu precedent pouvait ecraser l'affichage courant avec de vieux
  // chiffres - constate le 2026-09-11.
  let weekCompareToken = 0;
  async function renderWeekResult(pairKey, config, monday, sunday, previsionValue) {
    const myToken = ++weekCompareToken;
    const compareEl = document.getElementById('weekRealCompare');
    if (previsionValue === null) { compareEl.hidden = true; return; }
    const realMove = await fetchWeeklyRealMovePct(pairKey, monday, sunday);
    if (myToken !== weekCompareToken) return; // un rendu plus recent a eu lieu entre-temps
    compareEl.hidden = false;
    // Message honnete plutot que masquer en silence (retour direct
    // utilisateur du 2026-09-12) quand la donnee de marche n'est pas
    // disponible (cle Twelve Data absente, quota journalier epuise - partage
    // avec calibrate_impact.py/BERICH/Strategies/calculette de lot - ou
    // simple souci reseau).
    if (realMove === null) {
      compareEl.innerHTML = `<p class="driver-empty" style="margin:0">Résultat réel du marché indisponible pour l'instant (donnée de marché hors ligne ou quota API journalier atteint — réessaie plus tard).</p>`;
      return;
    }
    const previsionTone = previsionValue > 0 ? 'pos' : previsionValue < 0 ? 'neg' : 'neutral';
    const realTone = realMove > 0.05 ? 'pos' : realMove < -0.05 ? 'neg' : 'neutral';
    const match = forecastDirectionMatch(previsionValue, realMove);
    const matchTone = match === null ? 'neutral' : match ? 'pos' : 'neg';
    const matchSymbol = match === null ? '—' : match ? '✓' : '✗';
    const missing = missingCurrencyNames(config);
    const coverageNote = missing.length
      ? `<div class="week-compare__accuracy-note">${missing.join(' et ')} non suivi${missing.length > 1 ? 's' : ''} par le calendrier — la prévision ne capte que l'autre devise de la paire, un écart avec le réel est donc normal ici.</div>`
      : '';
    compareEl.innerHTML = `
      <div class="week-compare__col"><span>Prévision</span><b class="val ${previsionTone}">${fmtMove(previsionValue)}</b></div>
      <div class="week-compare__divider"></div>
      <div class="week-compare__col"><span>Réalisé</span><b class="val ${realTone}">${fmtMove(realMove)}</b></div>
      <div class="week-compare__divider"></div>
      <div class="week-compare__col week-compare__col--accuracy"><span>Réussite</span><b class="val ${matchTone}">${matchSymbol}</b></div>
      <div class="week-compare__accuracy-note">Coche = même sens (haussier/baissier) entre prévision et réel ; croix = sens opposé — pas une vraie métrique de précision statistique.</div>
      ${coverageNote}`;
  }

  // Une annonce publiee est "dans le sens prevu" quand le reel s'est ecarte
  // du precedent dans la meme direction que le consensus (ou a pile atteint
  // le consensus). null = pas assez de chiffres pour trancher (annonce non
  // publiee, qualitative, ou consensus == precedent : aucun sens attendu).
  function inForecastDirection(ev) {
    if (!ev.released) return null;
    const num = (v) => parseFloat(String(v).replace(',', '.'));
    const prev = num(ev.previous), cons = num(ev.consensus), act = num(ev.actual);
    if ([prev, cons, act].some(isNaN)) return null;
    const expected = Math.sign(cons - prev);
    if (expected === 0) return null;
    return act === cons || Math.sign(act - prev) === expected;
  }
  // "4 annonces sur 5 dans le sens prévu" — compte factuel sur les annonces
  // de la semaine passée, affiche a droite du titre de la section 02.
  function renderPastAside(drivers) {
    const el = document.getElementById('weekPastAside');
    if (!el) return;
    const verdicts = drivers.map((d) => inForecastDirection(d.ev)).filter((v) => v !== null);
    el.hidden = !verdicts.length;
    if (!verdicts.length) return;
    const ok = verdicts.filter(Boolean).length;
    el.textContent = `${ok} annonce${ok > 1 ? 's' : ''} sur ${verdicts.length} dans le sens prévu`;
  }

  function renderSentimentHeader(events) {
    const hero = document.getElementById('sentimentHero');
    if (!hero) return;
    const pairKey = loadPair();
    if (CRYPTO_CONFIG[pairKey]) {
      renderCryptoSentiment(events, pairKey);
      return;
    }
    document.getElementById('sentimentEconMode').hidden = false;
    document.getElementById('econBlocks').hidden = false;
    document.getElementById('cryptoBlocks').hidden = true;
    document.getElementById('sentimentCryptoMode').hidden = true;
    document.getElementById('moversSection').hidden = true;
    const config = PAIR_CONFIG[pairKey];
    if (!config) return;

    document.getElementById('sentimentCode').textContent = config.code;
    document.getElementById('sentimentLabel').textContent = config.label;

    const fmtRange = (a, b) => `${a.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} – ${b.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;

    // Plus de navigation manuelle ◀/▶ (retour direct utilisateur du
    // 2026-09-13, simplifie a une vue fixe) : "semaine passee" = la derniere
    // semaine ENTIEREMENT terminee par rapport a MAINTENANT - au sens du
    // marche forex (ferme vendredi ~22h UTC, rouvre dimanche ~22h UTC), pas
    // du calendrier civil. Le samedi et le dimanche avant reouverture, la
    // semaine qui vient de finir compte deja comme terminee ; des que le
    // marche a rouvert (dimanche soir), elle bascule en "semaine a venir"
    // devient la nouvelle semaine en cours. "Semaine a venir" (haut) =
    // exactement 7 jours apres "semaine passee" (bas), ce qui correspond,
    // vu de n'importe quel jour DANS la semaine en cours, a cette semaine en
    // cours elle-meme - pas de trou de visibilite entre les deux blocs.
    const { monday: todayMonday } = getWeekBounds(tradingWeekReference());
    const pastMonday = isForexMarketClosedNow() ? todayMonday : new Date(todayMonday.getTime() - 7 * 86400000);
    const pastSunday = new Date(pastMonday.getTime() + 6 * 86400000);
    const nextMonday = new Date(pastMonday.getTime() + 7 * 86400000);
    const nextSunday = new Date(pastMonday.getTime() + 13 * 86400000);

    // --- Haut : prevision verrouillee pour la semaine A VENIR - c'est elle
    // qui pilote la couleur de fond du hero (hero.dataset.tone), toujours,
    // meme quand on regarde le bilan de la semaine passee juste en dessous
    // (retour direct utilisateur du 2026-09-13).
    const nextWeekEvents = events.filter((e) => e.date && isoInRange(e.date, nextMonday, nextSunday));
    const nextResult = computeForecastSentiment(nextWeekEvents, config);
    const nextLocked = getLockedWeeklyForecast(pairKey, nextMonday, nextResult, config);
    hero.dataset.tone = nextLocked.tone;
    document.getElementById('sentimentBadge').textContent =
      nextLocked.tone === 'pos' ? 'Biais haussier' : nextLocked.tone === 'neg' ? 'Biais baissier' : 'Neutre';
    document.getElementById('sentimentWeekly').textContent = nextResult.drivers.length ? fmtMove(nextLocked.weeklyCapped) : '—';
    document.getElementById('sentimentWeeklyLabel').textContent = `Prévision verrouillée lundi, pour la semaine à venir (${fmtRange(nextMonday, nextSunday)})`;

    const textEl = document.getElementById('sentimentText');
    const missingNext = missingCurrencyNames(config);
    const coverageSuffix = missingNext.length
      ? ` ${missingNext.join(' et ')} non suivi${missingNext.length > 1 ? 's' : ''} par le calendrier — cette prévision ne capte que l'autre devise de la paire.`
      : '';
    if (!nextResult.drivers.length) {
      textEl.textContent = `Calendrier de la semaine prochaine pas encore complètement disponible pour dégager un biais sur ${config.code}.${coverageSuffix}`;
    } else {
      const n = nextResult.drivers.length;
      textEl.textContent = (nextLocked.tone === 'neutral'
        ? `Signaux mitigés sur ${config.code} la semaine prochaine : ${n} annonce${n > 1 ? 's' : ''} pertinente${n > 1 ? 's' : ''} sans direction dominante.`
        : `${n} annonce${n > 1 ? 's' : ''} pertinente${n > 1 ? 's' : ''} la semaine prochaine penche${n > 1 ? 'nt' : ''} vers un biais ${nextLocked.tone === 'pos' ? 'haussier' : 'baissier'} sur ${config.code}.`) + coverageSuffix;
    }
    renderDriverCompact(
      { top3: 'driverTop3', compact: 'driverCompact', stack: 'driverCompactStack', detail: 'driverCompactDetail' },
      nextResult.drivers, config, 'Calendrier de la semaine prochaine pas encore complètement disponible.');

    // --- Bas : resultats de la semaine PASSEE - prevision verrouillee de
    // cette semaine-la vs ce qui s'est reellement passe, + score de reussite.
    document.getElementById('weekPastTitle').textContent = `02 — Semaine passée (${fmtRange(pastMonday, pastSunday)})`;
    const pastWeekEvents = allEvents.filter((e) => e.date && isoInRange(e.date, pastMonday, pastSunday));
    const pastResult = computeForecastSentiment(pastWeekEvents, config);
    renderPastAside(pastResult.drivers);
    const pastLocked = getLockedWeeklyForecast(pairKey, pastMonday, pastResult, config);
    renderDriverCompact(
      { top3: 'weekPastTop3', compact: 'weekPastCompact', stack: 'weekPastCompactStack', detail: 'weekPastCompactDetail' },
      pastResult.drivers, config, `Pas d'annonce US/EU/UK/JP marquante cette semaine-là sur ${config.code}.`);
    renderWeekResult(pairKey, config, pastMonday, pastSunday, pastResult.drivers.length ? pastLocked.weeklyCapped : null);
  }

  function loadImportanceFilter() {
    try {
      const raw = localStorage.getItem(IMPORTANCE_KEY);
      if (raw) return new Set(JSON.parse(raw));
    } catch (e) { /* localStorage indisponible, on retombe sur le défaut */ }
    return new Set(['high']);
  }

  function saveImportanceFilter(set) {
    try { localStorage.setItem(IMPORTANCE_KEY, JSON.stringify([...set])); } catch (e) { /* tant pis */ }
  }

  let importanceFilter = loadImportanceFilter();

  function setupImportanceFilter() {
    const wrap = document.getElementById('importanceFilter');
    if (!wrap) return;
    const pills = wrap.querySelectorAll('.imp-pill');
    pills.forEach((pill) => {
      const imp = pill.dataset.imp;
      pill.classList.toggle('is-active', importanceFilter.has(imp));
      pill.addEventListener('click', () => {
        if (importanceFilter.has(imp)) importanceFilter.delete(imp);
        else importanceFilter.add(imp);
        saveImportanceFilter(importanceFilter);
        pill.classList.toggle('is-active', importanceFilter.has(imp));
        renderAll();
      });
    });
  }

  function renderAll() {
    const filtered = allEvents.filter((e) => importanceFilter.has(e.importance || 'high'));
    renderSentimentHeader(allEvents); // sentiment : toujours base sur tout (hors "faible"), independant du filtre affiche
    renderDayZone(filtered);
    renderUpcoming(filtered);
  }

  function showState(el, html) { el.innerHTML = `<div class="cal-state">${html}</div>`; }

  // Date au format YYYY-MM-DD en heure LOCALE (pas toISOString, qui convertit
  // en UTC et peut faire glisser d'un jour selon le fuseau) - comparable
  // directement aux dates deja au format Paris fournies par le backend.
  function isoDateLocal(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function fmtDateLabel(iso) {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  function renderTicker(ticker) {
    const track = document.getElementById('tickerTrack');
    if (!ticker || !ticker.pairs || !ticker.pairs.length) {
      track.innerHTML = '<div class="ticker-meta">Ticker indisponible pour le moment.</div>';
      return;
    }
    const items = ticker.pairs.map((p) => {
      const cls = p.changePct >= 0 ? 'pos' : 'neg';
      const sign = p.changePct >= 0 ? '+' : '';
      return `<div class="ticker-item"><b>${p.pair}</b><span class="px">${p.price}</span><span class="chg ${cls}">${sign}${p.changePct.toFixed(2)}%</span></div>`;
    }).join('');
    const sequence = items;
    track.innerHTML = sequence + sequence; // dupliqué pour boucler la marquee sans coupure

    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      let x = 0;
      const speed = 0.4; // px par frame
      function loop() {
        x -= speed;
        if (Math.abs(x) >= track.scrollWidth / 2) x = 0;
        track.style.transform = `translateX(${x}px)`;
        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);
    }
  }

  function hasNoData(ev) {
    return !ev.previous && !ev.consensus && !ev.actual;
  }

  // Ligne d'une annonce, partagee entre "Aujourd'hui" (renderDayZone) et
  // "Prochains jours" (renderUpcoming) - meme format des deux cotes (retour
  // direct utilisateur du 2026-09-16 : "je veux les voir... comme en
  // dessous en trait"). Affiche TOUJOURS Prévu ET Réel cote a cote (avant,
  // .upcoming-row ne montrait que l'un OU l'autre selon la publication - le
  // % de prevision disparaissait une fois l'annonce publiee, retour direct
  // utilisateur : "le calendrier n'affiche plus le % de prevision une fois
  // les annonces passees").
  // `compact` (colonnes "Prochains jours", etroites) : heure, drapeau, titre
  // et Prevu seulement - ces jours-la ne sont pas encore publies. Le tableau
  // du jour, lui, a 3 colonnes de chiffres sous un en-tete (voir dayHeadHtml).
  function dayRowHtml(ev, isNow, compact) {
    const fTone = forecastTone(ev);
    const rTone = ev.released ? valueTone(ev) : 'neutral';
    const title = `<span class="ev"><span class="ev__name">${ev.event}</span> <span class="imp-dot" title="Importance ${IMP_LABEL[ev.importance] || 'Élevée'}">${IMP_STARS[ev.importance] || IMP_STARS.high}</span></span>`;
    if (compact) {
      return `
      <div class="day-row day-row--compact">
        <span class="t">${ev.time || '—'}</span>
        <span class="c">${flagIcon(ev.country)}</span>
        ${title}
        <span class="col val ${fTone}">${ev.consensus || '—'}</span>
      </div>`;
    }
    return `
      <div class="day-row${isNow ? ' is-now' : ''}">
        <span class="t">${ev.time || '—'}</span>
        <span class="c">${flagIcon(ev.country)}</span>
        ${title}
        <span class="col col--prev"><span>Précédent</span>${ev.previous || '—'}</span>
        <span class="col val ${fTone}"><span>Prévu</span>${ev.consensus || '—'}</span>
        <span class="col val ${rTone}"><span>Réel</span>${ev.released ? (ev.actual || '—') : '—'}</span>
      </div>`;
  }
  function dayHeadHtml() {
    return `<div class="day-row day-head"><span>Heure</span><span>Pays</span><span>Évènement</span><span class="col">Précédent</span><span class="col">Prévu</span><span class="col">Réel</span></div>`;
  }
  // Index de l'annonce "en cours" dans une liste triee par heure : la
  // premiere qui n'est pas encore passee, ou la derniere si tout est deja
  // publie - sert a poser le repere visuel (voir .day-row.is-now).
  function nowRowIndex(dayEvents) {
    if (!dayEvents.length) return -1;
    const nowHM = new Date().toTimeString().slice(0, 5);
    const idx = dayEvents.findIndex((e) => e.time && e.time > nowHM);
    return idx === -1 ? dayEvents.length - 1 : idx;
  }

  // Jour actuellement affiche dans la zone "bulles" - navigable (hier,
  // aujourd'hui, demain...) independamment de la liste "Prochains jours"
  // ci-dessous, qui reste toujours ancree sur la vraie date du jour.
  let selectedDate = new Date();
  selectedDate.setHours(0, 0, 0, 0);

  function renderDayZone(events) {
    const zone = document.getElementById('bubbleZone');
    const iso = isoDateLocal(selectedDate);
    const todayIso = isoDateLocal(new Date());

    const dayEvents = events.filter((e) => e.date === iso);

    // "Jeudi 17 septembre — aujourd'hui" (la maquette nomme toujours le jour).
    const label = selectedDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
      + (iso === todayIso ? " — aujourd'hui" : '');
    document.getElementById('dayZoneLabel').textContent = label;
    document.getElementById('dayToday').classList.toggle('is-active', iso === todayIso);

    // Bornes de navigation : ne pas depasser ce que les donnees couvrent
    // (l'historique s'accumule jour apres jour cote backend, voir README).
    const allDates = [...new Set(allEvents.map((e) => e.date).filter(Boolean))].sort();
    document.getElementById('dayPrev').disabled = !allDates.length || iso <= allDates[0];
    document.getElementById('dayNext').disabled = !allDates.length || iso >= allDates[allDates.length - 1];

    if (!dayEvents.length) {
      const when = iso === todayIso ? "aujourd'hui" : `le ${selectedDate.toLocaleDateString('fr-FR')}`;
      showState(zone, `Aucune annonce (US/EU/UK/JP) ${when} pour le filtre d'importance sélectionné.`);
      return;
    }

    // Lignes (pas des cartes, voir dayRowHtml) - le repere "maintenant" n'a
    // de sens que sur le jour REEL d'aujourd'hui, pas en navigant sur un
    // autre jour.
    const nowIdx = iso === todayIso ? nowRowIndex(dayEvents) : -1;
    zone.innerHTML = `<div class="day-table">${dayHeadHtml()}${dayEvents.map((e, i) => dayRowHtml(e, i === nowIdx)).join('')}</div>`;
  }

  function setupDayNav() {
    document.getElementById('dayPrev').addEventListener('click', () => {
      selectedDate.setDate(selectedDate.getDate() - 1);
      renderAll();
    });
    document.getElementById('dayNext').addEventListener('click', () => {
      selectedDate.setDate(selectedDate.getDate() + 1);
      renderAll();
    });
    document.getElementById('dayToday').addEventListener('click', () => {
      selectedDate = new Date();
      selectedDate.setHours(0, 0, 0, 0);
      renderAll();
    });
  }

  function renderUpcoming(events) {
    const zone = document.getElementById('upcomingZone');
    const todayIso = isoDateLocal(new Date());

    const later = events.filter((e) => e.date && e.date > todayIso);

    if (!later.length) {
      showState(zone, "Rien d'autre de programmé pour l'instant.");
      return;
    }

    const groups = new Map();
    later.forEach((e) => {
      if (!groups.has(e.date)) groups.set(e.date, []);
      groups.get(e.date).push(e);
    });

    let html = '';
    groups.forEach((rows, date) => {
      const n = rows.length;
      html += `<div class="upcoming-day"><div class="upcoming-day__head"><span class="upcoming-day__label">${fmtDateLabel(date)}</span><span class="upcoming-day__count">${n} annonce${n > 1 ? 's' : ''}</span></div><div class="day-table">`;
      html += rows.map((e) => dayRowHtml(e, false, true)).join('');
      html += `</div></div>`;
    });
    zone.innerHTML = html;
  }

  async function load() {
    setupImportanceFilter();
    setupDayNav();
    // Calibration reelle (voir calibrate_impact.py) - best-effort, jamais
    // bloquant : si le fichier n'existe pas encore (calibration pas encore
    // lancee/terminee) ou echoue a charger, impactCalibration reste null et
    // estimateForecastMove retombe silencieusement sur l'heuristique forfaitaire.
    try {
      const calRes = await fetch('data/impact-calibration.json', { cache: 'no-store' });
      if (calRes.ok) impactCalibration = await calRes.json();
    } catch (e) { /* pas grave, repli sur l'heuristique */ }
    const apiUrl = (window.CHEST_CONFIG && window.CHEST_CONFIG.calendarApiUrl) || '';
    const url = apiUrl || 'data/calendar.json';
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('404');
      const data = await res.json();
      renderTicker(data.ticker);
      allEvents = data.events || [];
      renderAll();
    } catch (e) {
      showState(document.getElementById('bubbleZone'),
        `Pas encore de données. Lance <code>calendar-bridge/fetch_calendar.py</code> une première fois, puis recharge cette page.`);
      document.getElementById('tickerTrack').innerHTML = '<div class="ticker-meta">En attente de données…</div>';
      document.getElementById('upcomingZone').innerHTML = '';
    }
  }

  document.addEventListener('DOMContentLoaded', load);
})();
