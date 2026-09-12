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
  function isWeekendNow() {
    const day = new Date().getDay();
    return day === 0 || day === 6;
  }
  function isoInRange(iso, monday, sunday) {
    return iso >= isoDateLocal(monday) && iso <= isoDateLocal(sunday);
  }

  // Estimation indicative (pas un vrai modele de pricing) de l'impact d'un
  // evenement sur un instrument donne : ampleur de base selon l'importance,
  // divisee de moitie si l'evenement n'est pas encore publie (anticipation),
  // orientee par le sens de la surprise et le poids du pays pour cet
  // instrument. Plafonnee et clairement presentee comme une estimation.
  const IMPACT_BASE = { high: 0.6, medium: 0.35, low: 0.15 };
  function estimateMove(ev, targetConfig) {
    if (!targetConfig) return null;
    const driver = targetConfig.drivers.find((d) => d.country === ev.country);
    if (!driver) return null;
    const tone = valueTone(ev);
    if (tone === 'neutral') return 0;
    const sign = (tone === 'pos' ? 1 : -1) * driver.weight;
    const base = IMPACT_BASE[ev.importance] || 0.2;
    const scale = ev.released ? 1 : 0.5;
    return sign * base * scale;
  }
  function fmtMove(v) {
    if (v === null) return '—';
    const sign = v > 0 ? '+' : v < 0 ? '−' : '';
    return `${sign}${Math.abs(v).toFixed(1).replace('.', ',')}%`;
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
  function getCalibratedImpact(ev, targetConfig) {
    if (!impactCalibration || !ev.investingEventId) return null;
    const indicator = impactCalibration.indicators && impactCalibration.indicators[String(ev.investingEventId)];
    if (!indicator) return null;
    const pairKey = Object.keys(PAIR_CONFIG).find((k) => PAIR_CONFIG[k] === targetConfig);
    const calib = pairKey && indicator.pairs && indicator.pairs[pairKey];
    return calib || null;
  }

  // Variante "previsionnelle" d'estimateMove : basee sur forecastTone (donc
  // JAMAIS sur le resultat reel), sans demi-poids pour les evenements pas
  // encore publies. C'est LA reference stable de la semaine (voir
  // computeForecastSentiment) - contrairement a estimateMove (qui, une fois
  // l'evenement publie, bascule sur la surprise reelle et peut donc changer
  // de sens/ampleur du jour au lendemain), celle-ci ne bouge pas juste parce
  // qu'une annonce est tombee.
  //
  // Ampleur : quand une calibration reelle existe pour cet indicateur+cette
  // paire (voir getCalibratedImpact), utilise le VRAI coefficient mesure
  // (beta x l'ecart Prevu/Precedent, dans les memes unites que celles
  // affichees par investing.com) au lieu du forfait fixe par palier
  // d'importance (IMPACT_BASE) - c'est tout le sens de la calibration :
  // remplacer un chiffre devine par un chiffre mesure sur l'historique reel.
  function estimateForecastMove(ev, targetConfig) {
    if (!targetConfig) return null;
    const driver = targetConfig.drivers.find((d) => d.country === ev.country);
    if (!driver) return null;
    const tone = forecastTone(ev);
    if (tone === 'neutral') return 0;
    const sign = (tone === 'pos' ? 1 : -1) * driver.weight;

    const calib = getCalibratedImpact(ev, targetConfig);
    if (calib) {
      const consensusNum = parseFloat(String(ev.consensus).replace(',', '.'));
      const prevNum = parseFloat(String(ev.previous).replace(',', '.'));
      if (!isNaN(consensusNum) && !isNaN(prevNum)) {
        const magnitude = Math.abs(calib.beta * (consensusNum - prevNum));
        return sign * magnitude;
      }
    }
    const base = IMPACT_BASE[ev.importance] || 0.2;
    return sign * base;
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
        if (rawTone === 'neutral') return;
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
  // couleur "Reel" de chaque carte (valueTone), comparateur Biais/Realise
  // (renderWeekCompare) et indicateur de coherence (computeWeeklyConsistency).
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
        if (rawTone === 'neutral') return;
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
    document.getElementById('sentimentCryptoMode').hidden = false;
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
    const badge = dayBadge(ev);
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
          <div><span>Est. XAU</span><b class="val ${xauMove > 0 ? 'pos' : xauMove < 0 ? 'neg' : 'neutral'}">${fmtMove(xauMove)}</b></div>
          <div><span>Est. DXY</span><b class="val ${dxyMove > 0 ? 'pos' : dxyMove < 0 ? 'neg' : 'neutral'}">${fmtMove(dxyMove)}</b></div>
        </div>
        ${xauCalib
          ? `<div class="driver-card__calib">📊 Estimation XAU calibrée sur ${xauCalib.n} publications passées (confiance ${xauCalib.confidence}${xauCalib.confidence === 'faible' ? ' — à prendre avec prudence' : ''})</div>`
          : `<div class="driver-card__calib is-heuristic">Estimation forfaitaire (pas encore calibrée sur l'historique réel)</div>`}
      </div>`;
  }

  // "Coherence" de la semaine : parmi les annonces DEJA PUBLIEES cette
  // semaine (hors neutres), la part dont le RESULTAT REEL (valueTone, pas
  // le sens previsionnel qui a servi a fixer `tone`) confirme le biais
  // previsionnel stable de la semaine. Repond a "le % de reussite par
  // rapport a ce qui etait prevu". CE N'EST PAS un taux de reussite
  // historique des previsions (ca demanderait de suivre des centaines
  // d'annonces passees dans le temps - hors de portee avec l'historique
  // glissant de 30 jours actuel) : juste une lecture honnete, calculable
  // des maintenant, de "est-ce que ce qui est deja tombe confirme le biais
  // determine en debut de semaine."
  function computeWeeklyConsistency(tone, drivers) {
    if (tone === 'neutral') return null;
    const releasedNonNeutral = drivers
      .filter((d) => d.ev.released)
      .map((d) => valueTone(d.ev))
      .filter((t) => t !== 'neutral');
    if (!releasedNonNeutral.length) return null;
    const agree = releasedNonNeutral.filter((t) => t === tone).length;
    return { agree, total: releasedNonNeutral.length, pct: Math.round((agree / releasedNonNeutral.length) * 100) };
  }

  // Mouvement reel du prix sur [monday, sunday] (% signe), utilise le weekend
  // pour comparer le biais estime de la semaine passee a ce qui s'est
  // reellement passe. Forex/matieres premieres -> Twelve Data (deja utilise
  // par BERICH/Strategies) ; crypto -> historique CoinGecko. Retourne null
  // (jamais une fausse valeur) si la source ne repond pas ou manque de clé -
  // le bloc de comparaison reste alors simplement masque.
  async function fetchWeeklyRealMovePct(pairKey, monday, sunday) {
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
      const apiKey = window.CHEST_CONFIG && window.CHEST_CONFIG.twelveDataApiKey;
      if (!config || !apiKey) return null;
      const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(config.code)}&interval=1day&start_date=${isoDateLocal(monday)}&end_date=${isoDateLocal(sunday)}&outputsize=10&apikey=${apiKey}`;
      const res = await fetch(url);
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
  function loadForecastLocks() {
    try { return JSON.parse(localStorage.getItem(WEEKLY_FORECAST_LOCK_KEY) || '{}'); } catch (e) { return {}; }
  }
  function getLockedWeeklyForecast(pairKey, monday, freshResult, config) {
    const key = `${pairKey}|${isoDateLocal(monday)}`;
    const locks = loadForecastLocks();
    if (locks[key]) return locks[key];
    const total = freshResult.drivers.reduce((sum, d) => sum + (estimateForecastMove(d.ev, config) || 0), 0);
    const locked = { weeklyCapped: Math.max(-3, Math.min(3, total)), tone: freshResult.tone };
    locks[key] = locked;
    const keys = Object.keys(locks).sort();
    while (keys.length > 8) { delete locks[keys.shift()]; } // 8 semaines glissantes, pas d'accumulation infinie
    try { localStorage.setItem(WEEKLY_FORECAST_LOCK_KEY, JSON.stringify(locks)); } catch (e) { /* tant pis */ }
    return locked;
  }

  // Comparaison "Biais (annonces publiées) / Réalisé" - partagée entre la
  // semaine en cours (lundi->aujourd'hui, mise a jour au fil des
  // publications) et le bilan weekend (lundi->dimanche, semaine bouclee).
  // Ne se base QUE sur les annonces deja publiees (pas les futures encore
  // en "En attente") : repond a "a combien on est APRES ces annonces",
  // pas a une projection sur celles qui restent a venir.
  //
  // Jeton de generation : cette fonction attend une reponse reseau
  // (fetchWeeklyRealMovePct) qui peut prendre plus longtemps que le temps
  // qu'il faut a l'utilisateur pour naviguer vers une autre semaine (◀/▶).
  // Sans ce garde-fou, une reponse EN RETARD d'une semaine deja quittee
  // pouvait ecraser l'affichage de la semaine fraichement ouverte avec de
  // vieux chiffres - constate le 2026-09-11 en testant la nav ◀.
  let weekCompareToken = 0;
  async function renderWeekCompare(pairKey, config, monday, priceEndDate, drivers) {
    const myToken = ++weekCompareToken;
    const compareEl = document.getElementById('weekRealCompare');
    const releasedDrivers = drivers.filter((d) => d.ev.released);
    if (!releasedDrivers.length) { compareEl.hidden = true; return; }
    const bias = Math.max(-3, Math.min(3, releasedDrivers.reduce((sum, d) => sum + (estimateMove(d.ev, config) || 0), 0)));
    const realMove = await fetchWeeklyRealMovePct(pairKey, monday, priceEndDate);
    if (myToken !== weekCompareToken) return; // une navigation plus recente a eu lieu entre-temps
    if (realMove === null) { compareEl.hidden = true; return; }
    compareEl.hidden = false;
    const realTone = realMove > 0.05 ? 'pos' : realMove < -0.05 ? 'neg' : 'neutral';
    const biasTone = bias > 0 ? 'pos' : bias < 0 ? 'neg' : 'neutral';
    compareEl.innerHTML = `
      <div class="week-compare__col"><span>Biais (annonces publiées)</span><b class="val ${biasTone}">${fmtMove(bias)}</b></div>
      <div class="week-compare__divider"></div>
      <div class="week-compare__col"><span>Réalisé</span><b class="val ${realTone}">${fmtMove(realMove)}</b></div>`;
  }

  // Affiche/masque la ligne de coherence interne de la semaine (voir
  // computeWeeklyConsistency) - jamais presentee comme un taux de reussite
  // historique, seulement comme un signal de coherence des annonces deja
  // publiees entre elles.
  function renderWeeklyConsistency(tone, drivers) {
    const el = document.getElementById('sentimentConsistency');
    const stat = computeWeeklyConsistency(tone, drivers);
    if (!stat) { el.hidden = true; return; }
    el.hidden = false;
    const plural = stat.total > 1;
    el.innerHTML = `📊 Cohérence de la semaine : <b>${stat.agree}/${stat.total}</b> annonce${plural ? 's' : ''} publiée${plural ? 's' : ''} (<b>${stat.pct}%</b>) ${plural ? 'vont' : 'va'} dans le sens du biais — pas un taux de réussite historique, juste la cohérence entre les annonces déjà sorties.`;
  }

  // Navigation par semaine dans le hero : 0 = semaine en cours, negatif =
  // semaines passees consultees via ◀/▶ (voir renderWeekNav/setupWeekNav).
  // Plafonnee a la fenetre d'historique reellement disponible cote backend
  // (~30 jours glissants, voir merge_with_history() dans fetch_calendar.py).
  let weekOffset = 0;
  const MIN_WEEK_OFFSET = -4;

  function renderWeekNav(monday, sunday) {
    const fmtRange = (a, b) => `${a.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} – ${b.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
    document.getElementById('weekNavLabel').textContent = weekOffset === 0 ? `Cette semaine (${fmtRange(monday, sunday)})` : fmtRange(monday, sunday);
    document.getElementById('weekNavPrev').disabled = weekOffset <= MIN_WEEK_OFFSET;
    document.getElementById('weekNavNext').disabled = weekOffset >= 0;
  }

  function setupWeekNav() {
    document.getElementById('weekNavPrev').addEventListener('click', () => {
      if (weekOffset <= MIN_WEEK_OFFSET) return;
      weekOffset -= 1;
      renderSentimentHeader(allEvents);
    });
    document.getElementById('weekNavNext').addEventListener('click', () => {
      if (weekOffset >= 0) return;
      weekOffset += 1;
      renderSentimentHeader(allEvents);
    });
  }

  // Bilan d'UNE semaine donnee (lundi->dimanche) : toutes ses annonces avec
  // Prevu/Reel, % et ton verrouilles (getLockedWeeklyForecast), comparateur
  // Biais/Realise et coherence. Utilisee a la fois pour "cette semaine" une
  // fois le weekend arrive (avec l'aperçu de la semaine suivante juste a
  // cote, showNextPreview=true) ET pour n'importe quelle semaine passee
  // consultee via la nav ◀ (showNextPreview=false : on regarde l'histoire,
  // pas besoin d'un aperçu de "la semaine d'apres", deja connue).
  async function renderWeekBilan(pairKey, config, monday, sunday, showNextPreview) {
    const fmtRange = (a, b) => `${a.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} – ${b.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;

    document.getElementById('weekForecastView').hidden = true;
    document.getElementById('weekendView').hidden = false;
    document.getElementById('sentimentWeeklyLabel').textContent = weekOffset === 0 ? 'Bilan indicatif de la semaine passée' : 'Bilan indicatif de cette semaine-là';
    document.getElementById('weekPastTitle').textContent = `Bilan de la semaine (${fmtRange(monday, sunday)})`;

    const weekEvents = allEvents.filter((e) => e.date && isoInRange(e.date, monday, sunday));
    const result = computeForecastSentiment(weekEvents, config);

    document.getElementById('weekPastDrivers').innerHTML = result.drivers.length
      ? result.drivers.map(driverCardHtml).join('')
      : `<p class="driver-empty">Pas d'annonce US/EU/UK/JP marquante cette semaine-là sur ${config.code}.</p>`;

    const nextBlock = document.getElementById('weekNextBlock');
    if (showNextPreview) {
      nextBlock.hidden = false;
      const nextMonday = new Date(monday); nextMonday.setDate(nextMonday.getDate() + 7);
      const nextSunday = new Date(nextMonday); nextSunday.setDate(nextMonday.getDate() + 6);
      document.getElementById('weekNextTitle').textContent = `Prévisionnel de la semaine à venir (${fmtRange(nextMonday, nextSunday)})`;
      const nextWeekEvents = allEvents.filter((e) => e.date && isoInRange(e.date, nextMonday, nextSunday));
      const nextResult = computeForecastSentiment(nextWeekEvents, config);
      document.getElementById('weekNextDrivers').innerHTML = nextResult.drivers.length
        ? nextResult.drivers.map(driverCardHtml).join('')
        : `<p class="driver-empty">Calendrier de la semaine prochaine pas encore complètement disponible.</p>`;
    } else {
      nextBlock.hidden = true;
    }

    // Meme verrou que la vue "semaine en cours" (voir getLockedWeeklyForecast) :
    // affiche exactement le meme % (et le meme ton de badge) que celui qui a
    // tourne toute cette semaine-la, pas un recalcul frais au bilan.
    const locked = getLockedWeeklyForecast(pairKey, monday, result, config);
    const hero = document.getElementById('sentimentHero');
    hero.dataset.tone = locked.tone;
    document.getElementById('sentimentBadge').textContent =
      (locked.tone === 'pos' ? 'Biais haussier' : locked.tone === 'neg' ? 'Biais baissier' : 'Neutre') + (weekOffset === 0 ? ' (semaine passée)' : '');
    document.getElementById('sentimentWeekly').textContent = result.drivers.length ? fmtMove(locked.weeklyCapped) : '—';

    renderWeeklyConsistency(locked.tone, result.drivers);
    renderWeekCompare(pairKey, config, monday, sunday, result.drivers);
  }

  function renderSentimentHeader(events) {
    const hero = document.getElementById('sentimentHero');
    if (!hero) return;
    const pairKey = loadPair();
    if (CRYPTO_CONFIG[pairKey]) {
      document.getElementById('weekNav').hidden = true;
      renderCryptoSentiment(events, pairKey);
      return;
    }
    document.getElementById('sentimentEconMode').hidden = false;
    document.getElementById('sentimentCryptoMode').hidden = true;
    document.getElementById('weekNav').hidden = false;
    const config = PAIR_CONFIG[pairKey];
    if (!config) return;

    document.getElementById('sentimentCode').textContent = config.code;
    document.getElementById('sentimentLabel').textContent = config.label;

    // La semaine consultee : celle du jour reel + weekOffset*7 jours -
    // weekOffset=0 => semaine en cours (ou "semaine passee" bis si weekend).
    const refDate = new Date();
    refDate.setDate(refDate.getDate() + weekOffset * 7);
    const { monday, sunday } = getWeekBounds(refDate);
    renderWeekNav(monday, sunday);

    const browsingPastWeek = weekOffset < 0;
    const liveWeekendBilan = weekOffset === 0 && isWeekendNow();
    if (browsingPastWeek || liveWeekendBilan) {
      renderWeekBilan(pairKey, config, monday, sunday, liveWeekendBilan);
      return;
    }

    // Semaine en cours, en semaine (lundi->vendredi) : vue previsionnelle live.
    document.getElementById('weekForecastView').hidden = false;
    document.getElementById('weekendView').hidden = true;
    document.getElementById('weekRealCompare').hidden = true;
    document.getElementById('sentimentWeeklyLabel').textContent = 'Estimation indicative sur la semaine';

    // Bornage lundi->dimanche : une annonce reste affichee toute la semaine,
    // meme une fois publiee (le prevu ne disparait jamais, voir driverCardHtml).
    const weekEvents = events.filter((e) => e.date && isoInRange(e.date, monday, sunday));
    // computeForecastSentiment (pas computeMarketSentiment) : le biais et la
    // liste de cartes sont determines une fois pour la semaine a partir des
    // consensus (forecastTone) et NE bougent PAS juste parce qu'une annonce
    // est publiee entre-temps - seule une revision de consensus avant
    // publication (rare) les fait evoluer. Le resultat reel, lui, s'affiche
    // par carte (colonne "Reel") et dans le comparateur juste au-dessus
    // (renderWeekCompare) + l'indicateur de coherence.
    const freshResult = computeForecastSentiment(weekEvents, config);
    const drivers = freshResult.drivers; // liste toujours en direct (les "Reel" doivent se mettre a jour)
    const locked = getLockedWeeklyForecast(pairKey, monday, freshResult, config); // % + ton fixes des lundi
    const tone = locked.tone;
    hero.dataset.tone = tone;
    document.getElementById('sentimentBadge').textContent =
      tone === 'pos' ? 'Biais haussier' : tone === 'neg' ? 'Biais baissier' : 'Neutre';
    document.getElementById('sentimentWeekly').textContent = drivers.length ? fmtMove(locked.weeklyCapped) : '—';

    const textEl = document.getElementById('sentimentText');
    if (!drivers.length) {
      textEl.textContent = `Pas d'annonce US/EU/UK/JP assez marquante pour dégager un biais sur ${config.code} cette semaine.`;
    } else {
      const n = drivers.length;
      textEl.textContent = tone === 'neutral'
        ? `Signaux mitigés sur ${config.code} cette semaine : ${n} annonce${n > 1 ? 's' : ''} pertinente${n > 1 ? 's' : ''} sans direction dominante.`
        : `${n} annonce${n > 1 ? 's' : ''} pertinente${n > 1 ? 's' : ''} cette semaine penche${n > 1 ? 'nt' : ''} vers un biais ${tone === 'pos' ? 'haussier' : 'baissier'} sur ${config.code}.`;
    }

    document.getElementById('sentimentDrivers').innerHTML = drivers.length
      ? drivers.map(driverCardHtml).join('')
      : '';

    renderWeeklyConsistency(tone, drivers);
    renderWeekCompare(pairKey, config, monday, new Date(), drivers);
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
    const meta = `<div class="ticker-meta">Clôture ${ticker.as_of} vs ${ticker.compared_to} · taux BCE</div>`;
    const sequence = items + meta;
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

  function computeHypothesis(ev) {
    if (!ev.released) return { text: 'En attente de publication.', tone: 'neutral' };
    const actual = parseFloat(String(ev.actual).replace(',', '.'));
    const consensus = parseFloat(String(ev.consensus).replace(',', '.'));
    if (isNaN(actual) || isNaN(consensus)) {
      return { text: 'Résultat publié — pas de comparaison chiffrée possible pour ce format.', tone: 'neutral' };
    }
    const surprise = actual - consensus;
    if (Math.abs(surprise) < 1e-9) {
      return { text: 'Résultat conforme au consensus — impact généralement limité.', tone: 'neutral' };
    }
    const beat = surprise > 0;
    if (!ev.directionBias) {
      return { text: `Résultat ${beat ? 'supérieur' : 'inférieur'} au consensus — sens usuel non défini pour ce type d'indicateur.`, tone: 'neutral' };
    }
    const bullish = ev.directionBias === 'up' ? beat : !beat;
    return {
      text: `${beat ? 'Meilleur' : 'Moins bon'} que prévu → biais ${bullish ? 'haussier' : 'baissier'} habituellement observé pour ${CCY_NAME[ev.country] || ev.country}. Heuristique statistique, pas une prédiction garantie.`,
      tone: bullish ? 'pos' : 'neg',
    };
  }

  function hasNoData(ev) {
    return !ev.previous && !ev.consensus && !ev.actual;
  }

  // Affiche le jour si l'evenement n'est pas aujourd'hui (utile dans la zone
  // "48h" qui peut deborder sur demain).
  function dayAwareTime(ev) {
    const t = ev.time || '—';
    if (!ev.date) return t;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const evDate = new Date(ev.date + 'T00:00:00');
    const diffDays = Math.round((evDate - today) / 86400000);
    if (diffDays <= 0) return t;
    if (diffDays === 1) return `Demain ${t}`;
    return `${evDate.toLocaleDateString('fr-FR', { weekday: 'short' })} ${t}`;
  }

  function formatCountdown(target) {
    const diffMs = target - new Date();
    if (diffMs <= 0) return 'En cours';
    const totalSec = Math.floor(diffMs / 1000);
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return days > 0 ? `Dans ${days}j ${pad(hours)}h` : `Dans ${pad(hours)}:${pad(mins)}:${pad(secs)}`;
  }

  function tickCountdowns() {
    document.querySelectorAll('[data-countdown]').forEach((el) => {
      const target = new Date(el.dataset.countdown);
      if (isNaN(target)) return;
      el.textContent = formatCountdown(target);
    });
  }
  setInterval(tickCountdowns, 1000);

  function bubbleHtml(ev, idx) {
    const noData = hasNoData(ev);
    const targetIso = (ev.date && ev.time) ? `${ev.date}T${ev.time}:00` : null;
    const topRight = (noData && !ev.released && targetIso)
      ? `<span class="countdown" data-countdown="${targetIso}">…</span>`
      : (ev.released ? `<span class="bubble__badge released">Publié</span>` : `<span class="bubble__badge pending">À venir</span>`);

    const statsBlock = noData ? '' : `
        <div class="bubble__stats">
          <div><span>Précédent</span><b>${ev.previous || '—'}</b></div>
          <div><span>Prévu</span><b class="val ${valueTone(ev)}">${ev.consensus || '—'}</b></div>
          <div><span>Réel</span><b class="val ${ev.released ? valueTone(ev) : 'neutral'}">${ev.actual || '—'}</b></div>
        </div>`;

    const detailInner = noData
      ? `<p class="hypothesis neutral">Évènement qualitatif (discours/déclaration) — pas de donnée chiffrée attendue.</p>`
      : `
            <div class="compare-row">
              <div class="compare-cell"><span>Précédent</span><b>${ev.previous || '—'}</b></div>
              <div class="compare-cell"><span>Prévu</span><b class="val ${valueTone(ev)}">${ev.consensus || '—'}</b></div>
              <div class="compare-cell"><span>Réel</span><b class="val ${ev.released ? valueTone(ev) : 'neutral'}">${ev.actual || '—'}</b></div>
            </div>
            <div class="hypothesis ${computeHypothesis(ev).tone}">${computeHypothesis(ev).text}</div>`;

    return `
      <div class="bubble" data-idx="${idx}">
        <div class="bubble__top">
          <span class="bubble__country">${flagIcon(ev.country)}</span>
          <span class="bubble__time" title="Importance ${IMP_LABEL[ev.importance] || 'Élevée'}">${IMP_STARS[ev.importance] || IMP_STARS.high} · ${dayAwareTime(ev)}</span>
        </div>
        <p class="bubble__event">${ev.event}</p>
        ${statsBlock}
        <div style="margin-top:10px">${topRight}</div>
        <div class="bubble__detail" id="detail-${idx}">
          <div class="bubble__detail-inner">${detailInner}</div>
        </div>
      </div>`;
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

    const label = iso === todayIso
      ? "Aujourd'hui"
      : selectedDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
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

    zone.innerHTML = `<div class="bubble-grid">${dayEvents.map(bubbleHtml).join('')}</div>`;
    tickCountdowns();

    zone.querySelectorAll('.bubble').forEach((bubble) => {
      bubble.addEventListener('click', () => {
        const idx = bubble.dataset.idx;
        const detail = document.getElementById('detail-' + idx);
        const isOpen = bubble.classList.toggle('is-open');
        detail.style.maxHeight = isOpen ? detail.scrollHeight + 'px' : '0px';
      });
    });
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
      html += `<div class="upcoming-day"><div class="upcoming-day__label">${fmtDateLabel(date)}</div><div class="upcoming-table">`;
      rows.forEach((e) => {
        html += `
          <div class="upcoming-row">
            <span class="t">${e.time || '—'}</span>
            <span class="c">${flagIcon(e.country)}</span>
            <span>${e.event} <span class="imp-dot" title="Importance ${IMP_LABEL[e.importance] || 'Élevée'}">${IMP_STARS[e.importance] || IMP_STARS.high}</span></span>
            <span class="val cons ${valueTone(e)}">${(e.released ? e.actual : e.consensus) || '—'}</span>
          </div>`;
      });
      html += `</div></div>`;
    });
    zone.innerHTML = html;
  }

  async function load() {
    setupImportanceFilter();
    setupDayNav();
    setupWeekNav();
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
