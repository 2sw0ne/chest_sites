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

  const IMPORTANCE_KEY = 'stash_cal_importance';
  let allEvents = [];

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
  const PAIR_KEY = 'stash_sentiment_pair';

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

  function renderSentimentHeader(events) {
    const hero = document.getElementById('sentimentHero');
    if (!hero) return;
    const pairKey = loadPair();
    if (CRYPTO_CONFIG[pairKey]) {
      renderCryptoSentiment(events, pairKey);
      return;
    }
    document.getElementById('sentimentEconMode').hidden = false;
    document.getElementById('sentimentCryptoMode').hidden = true;
    const config = PAIR_CONFIG[pairKey];
    if (!config) return;

    const { tone, drivers } = computeMarketSentiment(events, pairKey);
    hero.dataset.tone = tone;
    document.getElementById('sentimentCode').textContent = config.code;
    document.getElementById('sentimentLabel').textContent = config.label;
    document.getElementById('sentimentBadge').textContent =
      tone === 'pos' ? 'Biais haussier' : tone === 'neg' ? 'Biais baissier' : 'Neutre';

    // Estimation globale : somme des impacts estimes de toutes les annonces
    // motrices de la semaine (pas juste celles affichees en carte), plafonnee
    // pour rester plausible - indicatif, pas un vrai calcul de prix.
    const weeklyTotal = drivers.reduce((sum, d) => sum + (estimateMove(d.ev, config) || 0), 0);
    const weeklyCapped = Math.max(-3, Math.min(3, weeklyTotal));
    document.getElementById('sentimentWeekly').textContent = drivers.length ? fmtMove(weeklyCapped) : '—';

    const shortlist = drivers.slice(0, 6);
    const textEl = document.getElementById('sentimentText');
    if (!shortlist.length) {
      textEl.textContent = `Pas d'annonce US/EU/UK/JP assez marquante pour dégager un biais sur ${config.code} pour l'instant.`;
    } else {
      const n = shortlist.length;
      textEl.textContent = tone === 'neutral'
        ? `Signaux mitigés sur ${config.code} : ${n} annonce${n > 1 ? 's' : ''} pertinente${n > 1 ? 's' : ''} sans direction dominante.`
        : `${n} annonce${n > 1 ? 's' : ''} pertinente${n > 1 ? 's' : ''} penche${n > 1 ? 'nt' : ''} vers un biais ${tone === 'pos' ? 'haussier' : 'baissier'} sur ${config.code}.`;
    }

    document.getElementById('sentimentDrivers').innerHTML = shortlist.map((d) => {
      const shown = d.ev.released ? d.ev.actual : d.ev.consensus;
      const xauMove = estimateMove(d.ev, PAIR_CONFIG.XAUUSD);
      const dxyMove = estimateMove(d.ev, PAIR_CONFIG.DXY);
      return `
        <div class="driver-card">
          <div class="driver-card__top">
            ${flagIcon(d.ev.country)}
            <span class="driver-card__name">${d.ev.event}</span>
            <span class="tag">${d.ev.released ? 'Publié' : 'À venir'}</span>
          </div>
          <div class="driver-card__value val ${d.tone}">${shown || '—'}</div>
          <div class="driver-card__estimates">
            <div><span>Est. XAU</span><b class="val ${xauMove > 0 ? 'pos' : xauMove < 0 ? 'neg' : 'neutral'}">${fmtMove(xauMove)}</b></div>
            <div><span>Est. DXY</span><b class="val ${dxyMove > 0 ? 'pos' : dxyMove < 0 ? 'neg' : 'neutral'}">${fmtMove(dxyMove)}</b></div>
          </div>
        </div>`;
    }).join('');
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
    const apiUrl = (window.STASH_CONFIG && window.STASH_CONFIG.calendarApiUrl) || '';
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
