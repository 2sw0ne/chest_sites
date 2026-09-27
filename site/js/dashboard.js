(() => {
  'use strict';

  const ACCOUNTS_KEY = 'chest_accounts';
  const ACTIVE_KEY = 'chest_active_account';
  const FAMILIES_KEY = 'chest_account_families';
  const LIVE_SWANN_KEY = 'chest_live_account';
  const SIMPLE_MODE_KEY = 'chest_dashboard_simple_mode';
  // Dernier identifiant Myfxbook utilisé avec succès dans "Ajouter un compte" (2026-09-24, demande
  // utilisateur : "pas le mettre à chaque fois") - même principe déjà accepté ailleurs sur ce site
  // pour Myfxbook (Live Swann, comptes live du Journal : identifiants gardés dans le navigateur).
  const MFX_LAST_LOGIN_KEY = 'chest_mfx_last_login';
  function saveLastMfxLogin(email, password) {
    try { localStorage.setItem(MFX_LAST_LOGIN_KEY, JSON.stringify({ email, password })); } catch (e) { /* tant pis */ }
  }
  function loadLastMfxLogin() {
    try { return JSON.parse(localStorage.getItem(MFX_LAST_LOGIN_KEY) || 'null'); } catch (e) { return null; }
  }

  // "Mode simple" : masque ENTIEREMENT le backtest de depart (equity,
  // calendrier, RR/winrate) du Dashboard - retour direct utilisateur du
  // 2026-09-17 ("ajoute un bouton pour que toutes les positions du
  // backtesting journalier ne soient pas visibles ni appliquees au
  // dashboard"). Reglage GLOBAL (pas par compte) : un seul bouton, visible
  // sur n'importe quel compte/famille.
  function loadSimpleMode() {
    try { return localStorage.getItem(SIMPLE_MODE_KEY) === '1'; } catch (e) { return false; }
  }
  function saveSimpleMode(v) {
    try { localStorage.setItem(SIMPLE_MODE_KEY, v ? '1' : '0'); } catch (e) { /* tant pis */ }
  }

  // Exemple de données — partagées par les comptes de démonstration.
  const SAMPLE_PERIODS = {
    day: {
      profit: '+1.2%', profitSub: '+$154 aujourd\'hui', profitDollar: '+$154', profitDollarSub: '+1.2% · 1 jour tradé',
      rr: '1.8', winrate: '58%', winrateSub: '7/12 trades',
      dd: '-2.1%', ddSub: 'pic → creux du jour', tradedDays: 1, tradedDaysSub: '12 trades',
      equity: [12480, 12510, 12470, 12550, 12600, 12580, 12660, 12630, 12700, 12680, 12750, 12813]
    },
    week: {
      profit: '+4.6%', profitSub: '+$560 cette semaine', profitDollar: '+$560', profitDollarSub: '+4.6% · 5 jours tradés',
      rr: '2.0', winrate: '61%', winrateSub: '28/46 trades',
      dd: '-4.8%', ddSub: 'pic → creux de la semaine', tradedDays: 5, tradedDaysSub: '46 trades',
      equity: [12250, 12310, 12280, 12400, 12470, 12420, 12550, 12610, 12580, 12700, 12760, 12813]
    },
    month: {
      profit: '+12.4%', profitSub: '+$1 412 ce mois', profitDollar: '+$1 412', profitDollarSub: '+12.4% · 17 jours tradés',
      rr: '2.1', winrate: '61%', winrateSub: '112/184 trades',
      dd: '-8.3%', ddSub: 'pic → creux du mois', tradedDays: 17, tradedDaysSub: '184 trades',
      equity: [11400, 11550, 11480, 11700, 11650, 11900, 11820, 12100, 12050, 12300, 12500, 12420, 12650, 12750, 12813]
    },
    all: {
      profit: '+28.1%', profitSub: '+$2 812 depuis $10 000', profitDollar: '+$2 812', profitDollarSub: '+28.1% · 96 jours tradés',
      rr: '2.0', winrate: '59%', winrateSub: '640/1085 trades',
      dd: '-14.6%', ddSub: 'pire drawdown enregistré', tradedDays: 96, tradedDaysSub: '1085 trades',
      equity: [10000, 10250, 10100, 10500, 10350, 10800, 10650, 11100, 10950, 11400, 11250, 11700, 11550, 12000, 12813]
    },
    full: {
      profit: '+28.1%', profitSub: '+$2 812 depuis $10 000', profitDollar: '+$2 812', profitDollarSub: '+28.1% · 96 jours tradés',
      rr: '2.0', winrate: '59%', winrateSub: '640/1085 trades',
      dd: '-14.6%', ddSub: 'pire drawdown enregistré', tradedDays: 96, tradedDaysSub: '1085 trades',
      equity: [10000, 10250, 10100, 10500, 10350, 10800, 10650, 11100, 10950, 11400, 11250, 11700, 11550, 12000, 12813]
    }
  };

  const SAMPLE_OBJECTIVES = [
    { label: 'Minimum Trading Days', target: '5 jours', current: '12 jours', ok: true },
    { label: 'Max Daily Loss', target: '-$1 000.00 (4%)', current: '-$210.40 (-0.84%)', ok: true },
    { label: 'Max Loss', target: '-$2 000.00 (8%)', current: '-$680.20 (-2.72%)', ok: true },
    { label: 'Profit Target', target: '$2 500.00 (10%)', current: '+$2 812.00 (+11.2%)', ok: true }
  ];
  // 4 semaines (28 jours), pas 2 - meme profondeur que la maquette DA (S36 a
  // S39) meme en mode demo/sans compte reel connecte.
  const SAMPLE_CAL_14 = [
    420, -180, 610, 0, 340, -95, 1045,
    180, -340, 0, -220, 95, -410, 85,
    610, 0, 780, -140, 920, 1450, 360,
    0, 260, -95, 410, 0, -180, 425.2,
  ];

  // Anciens comptes de demonstration (Compte Demo Vantage / Challenge FTMO) —
  // retires le 2026-09-23 (retour utilisateur : "retire les faux comptes
  // qu'on parte de 0"). loadAccounts() retombe desormais sur [] plutot que
  // sur cette liste ; voir renderAll() pour l'etat vide qui geré l'absence
  // totale de compte.
  const DEFAULT_ACCOUNTS = [];

  let chart, unit = 'percent'; // % par defaut (retour direct utilisateur du 2026-09-16)
  let lastPfSim = null; // derniere simulation de retrait PF calculee par renderPayouts - lue par renderMiniCalendar pour les marqueurs jaunes
  let liveAccount = null; // rempli si data/data.json existe (pont export_mt5.py)
  let liveSwannAccount = null; // "Live Swann" (Myfxbook, admin uniquement, voir account.html) - toujours resynchronise, jamais depuis le cache 5min
  let activeAccountData = null; // compte actif, enrichi des vraies donnees Myfxbook si besoin (voir refreshActiveAccount)
  const openFamilyIds = new Set(); // etat d'ouverture des familles dans le switcher, le temps de la session

  function loadAccounts() {
    let list;
    try {
      const raw = localStorage.getItem(ACCOUNTS_KEY);
      list = raw ? JSON.parse(raw) : null;
    } catch (e) { list = null; }
    if (!list) {
      list = DEFAULT_ACCOUNTS;
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
    }
    const pinned = [liveSwannAccount, liveAccount].filter(Boolean);
    return pinned.length ? [...pinned, ...list] : list;
  }
  function saveAccounts(list) {
    // Les comptes "epingles" (live-swann, mt5-live) ne sont jamais persistes ici
    // - ils sont reconstruits a chaque chargement depuis leur propre source.
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list.filter((a) => a.id !== 'mt5-live' && a.id !== 'live-swann')));
  }
  function activeId(accounts) { return localStorage.getItem(ACTIVE_KEY) || (accounts[0] && accounts[0].id) || null; }

  // ---------- Familles de comptes (chaines propfirm : Phase 1 -> Phase 2 ->
  // Finance, ou tout regroupement de comptes lies) — purement une organisation
  // visuelle sur les comptes existants (chest_accounts), aucune donnee dupliquee.
  // Vit directement dans le switcher de comptes (retour direct utilisateur du
  // 2026-09-15 : pas une carte separee). ----------
  function loadFamilies() {
    try { return JSON.parse(localStorage.getItem(FAMILIES_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveFamilies(list) { localStorage.setItem(FAMILIES_KEY, JSON.stringify(list)); }
  function initials(name) { return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase(); }
  function money(n) { return (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  async function tryLoadLiveData() {
    try {
      const res = await fetch('data/data.json', { cache: 'no-store' });
      if (!res.ok) return null;
      const d = await res.json();
      return {
        id: 'mt5-live', name: '🔴 ' + (d.account.name || 'MT5 (connecté)'), number: d.account.number,
        type: d.account.type, broker: d.account.broker,
        balance: d.account.balance, equity: d.account.equity, pnl: d.account.pnl, today: d.account.today,
        example: false, live: true, syncedAt: d.generated_at,
        periods: { day: d.day, week: d.week, month: d.month, all: d.all },
        objectives: d.objectives, calendar14: d.calendar14
      };
    } catch (e) { return null; }
  }

  // ---------- Myfxbook : compte "classique" relié une fois sur myfxbook.com,
  // CHEST lit ensuite ses vraies données directement via leur API (CORS
  // ouvert, verifie en direct - aucun backend necessaire). ----------
  const myfxbookCache = {}; // { [accountLocalId]: { at: timestamp, data / error } }
  const MYFXBOOK_CACHE_MS = 5 * 60 * 1000; // eviter de re-appeler l'API a chaque clic de pilule periode

  function maxDrawdownPct(equity) {
    let peak = equity[0] || 1, worst = 0;
    equity.forEach((v) => { peak = Math.max(peak, v); if (peak) worst = Math.min(worst, (v - peak) / peak * 100); });
    return worst;
  }

  // ---------- Pipeline UNIFIE des 4 periodes (Jour/Semaine/Mois/Annee) -----
  // Retour direct utilisateur du 2026-09-16-17 : "les infos doivent
  // cohordonner, utilise la donnee du backtesting + reel myfxbook et
  // affiche un resultat logique" + "le graphique doit afficher une echelle
  // de temps coherente". Avant, il existait DEUX pipelines paralleles qui
  // pouvaient diverger : periodStatsFromDaily/historyStats (comptes sans
  // backtest, base sur dailyGainAsc brut) et statsFromDatedSeries/
  // applyBacktestToAllPeriods (comptes avec backtest, base sur une courbe
  // fusionnee separement). Desormais UNE seule source de verite pour TOUT
  // compte (avec ou sans backtest, individuel ou famille) : dailyHistory
  // (deja fusionne reel+backtest avec priorite au reel, voir sumDailyPnl)
  // pour Semaine/Mois/Annee, + une reconstruction INTRA-JOURNEE a partir des
  // vrais horodatages de trades (get-history) pour Jour - donc l'axe du
  // temps est enfin coherent : Jour = heures reelles de la journee, Semaine/
  // Mois/Annee = vraies dates calendaires, jamais un simple index 1,2,3...
  function isoDateLocal(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // Bornes calendaires réelles de chaque période (retour direct utilisateur
  // du 2026-09-16) : Jour = aujourd'hui seul, Semaine = 6 jours + aujourd'hui,
  // Mois = depuis le 1er du mois en cours, "Tout" (année) = depuis le 1er
  // janvier de l'année en cours - pas littéralement "tout l'historique",
  // relabellé "Année" dans l'UI (voir dashboard.html) pour rester honnête.
  function periodRange(period) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (period === 'day') return [startOfToday, now];
    if (period === 'week') { const s = new Date(startOfToday); s.setDate(s.getDate() - 6); return [s, now]; }
    if (period === 'month') return [new Date(now.getFullYear(), now.getMonth(), 1), now];
    if (period === 'full') return [new Date(2000, 0, 1), now]; // "Historique complet" - tout ce qui est connu, sans borne basse reelle
    return [new Date(now.getFullYear(), 0, 1), now]; // 'all' -> année en cours
  }

  // Courbe de capital $ JOUR PAR JOUR sur TOUTE la periode connue, decoupee
  // ensuite par periodRange(). Composee par CAPITALISATION DU % quotidien
  // (dailyHistory[i].pct), jamais en soustrayant des $ bruts en remontant
  // depuis le solde actuel - correctif du 2026-09-17 (retour direct
  // utilisateur : "je suis en negatif sur le dashboard alors que le
  // backtesting est rentable"). Le bug : un jour de BACKTEST a un pnl $
  // calcule sur l'echelle de capital DU BACKTEST (ex. 10 000$ -> 1M$), un
  // jour REEL a un pnl $ sur l'echelle du VRAI compte (~100k$) - soustraire
  // les deux depuis le meme solde actuel melangeait deux echelles sans
  // aucun rapport, produisant une courbe absurde (descente monotone a
  // -140% alors que le backtest lie est a +983%). Le %, lui, est comparable
  // et chainable quelle que soit l'echelle de la source (meme principe deja
  // utilise par objectivesStatsFromHistory) : on compose une courbe
  // RELATIVE (base 1) du premier au dernier jour, puis on la recale d'un
  // seul coup sur le vrai solde ACTUEL connu (currentBalance).
  function capitalCurveFromDailyHistory(dailyHistory, currentBalance) {
    if (!dailyHistory || !dailyHistory.length) return [];
    const firstDate = new Date(dailyHistory[0].date + 'T12:00:00');
    const anchor = new Date(firstDate); anchor.setDate(anchor.getDate() - 1);
    let rel = 1;
    const relPoints = [{ date: anchor, rel }];
    dailyHistory.forEach((d) => {
      rel *= 1 + (d.pct || 0) / 100;
      relPoints.push({ date: new Date(d.date + 'T12:00:00'), rel });
    });
    const scale = rel ? currentBalance / rel : currentBalance;
    return relPoints.map((p) => ({ date: p.date, capital: Math.round(p.rel * scale * 100) / 100 }));
  }

  // Recale le $ AFFICHE de chaque jour de dailyHistory sur l'echelle REELLE
  // actuelle du compte (meme principe que capitalCurveFromDailyHistory,
  // applique ici au calendrier 14j/hebdo plutot qu'au graphique) - sans ca,
  // un jour de backtest affichait son pnl $ calcule sur l'echelle du
  // backtest (parfois enorme, parfois minuscule) au lieu d'un montant
  // comparable a "ce que j'ai actuellement" (retour direct utilisateur du
  // 2026-09-17 : "en dollars je vois des sommes completement differentes de
  // ce que j'ai actuellement"). Le %, deja correct, n'est jamais modifie -
  // seul le $ affiche change ; la source ('real'/'backtest') est conservee
  // pour la coloration jaune/orange (voir renderMiniCalendar).
  function rescaleDailyHistoryPnl(dailyHistory, currentBalance) {
    if (!dailyHistory || !dailyHistory.length) return dailyHistory;
    const curve = capitalCurveFromDailyHistory(dailyHistory, currentBalance);
    return dailyHistory.map((d, i) => ({ ...d, pnl: Math.round((curve[i + 1].capital - curve[i].capital) * 100) / 100 }));
  }

  // Courbe INTRA-JOURNEE pour l'onglet "Jour" : dailyHistory n'a qu'UN point
  // par jour calendaire (impossible d'en tirer une echelle horaire) - on
  // reconstruit ici a partir des VRAIS horodatages de cloture des trades du
  // jour (get-history.json, toujours precis a la minute - verifie en direct
  // le 2026-09-17), en remontant depuis le solde actuel. Honnete : sans
  // trade cloture aujourd'hui, retombe sur une ligne plate (minuit -> solde
  // actuel), jamais d'heures inventees.
  function intradayCurveFromTrades(history, currentBalance) {
    const todayIso = isoDateLocal(new Date());
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const todayTrades = (history || [])
      .filter((t) => t.closeTime && isoDateLocal(new Date(t.closeTime)) === todayIso)
      .sort((a, b) => new Date(a.closeTime) - new Date(b.closeTime));
    if (!todayTrades.length) return [{ date: startOfDay, capital: currentBalance }, { date: new Date(), capital: currentBalance }];
    let bal = currentBalance;
    const desc = todayTrades.slice().reverse().map((t) => {
      const point = { date: new Date(t.closeTime), capital: Math.round(bal * 100) / 100 };
      bal -= parseFloat(t.profit) || 0;
      return point;
    });
    desc.push({ date: startOfDay, capital: Math.round(bal * 100) / 100 });
    const asc = desc.reverse();
    asc.push({ date: new Date(), capital: currentBalance }); // point "maintenant", ferme la courbe a l'heure actuelle
    return asc;
  }

  // Courbe datée du backtest (garde `pt.trade` pour calculer un vrai
  // winrate/RR par période plus bas, contrairement à
  // buildBacktestAugmentedAll qui ne gardait que les capitaux).
  function buildBacktestDatedCurve(bt, riskConfig) {
    if (!bt || !window.CHESTBacktestEngine || !riskConfig || !bt.trades || !bt.trades.length) return [];
    const report = window.CHESTBacktestEngine.computeReport(bt.trades, bt.capital, riskConfig);
    return report.curve.filter((pt) => pt.date).map((pt) => ({ date: pt.date, capital: pt.capital, trade: pt.trade }));
  }
  // Liste plate {date, result, rr}[] des trades SIMULES du backtest - meme
  // "monnaie" (RR = multiple du risque pris) que realTradesWithRR, donc les
  // deux s'additionnent naturellement dans une seule fenetre de periode.
  function backtestTradesList(bt, riskConfig) {
    return buildBacktestDatedCurve(bt, riskConfig).filter((pt) => pt.trade)
      .map((pt) => ({ date: pt.date, result: pt.trade.result, rr: pt.trade.rr }));
  }
  // Liste UNIFIEE des trades d'un compte (backtest simule + vrais trades
  // Myfxbook, RR calcule sur la meme base pour les deux - voir
  // backtestTradesList/realTradesWithRR) - source unique pour le RR/winrate
  // de TOUTE periode, individuelle ou familiale.
  function unifiedTradesList(account, riskPct, includeBacktest) {
    const trades = [];
    if (includeBacktest !== false && account.startBacktestId) {
      const bt = window.CHESTBacktests && window.CHESTBacktests.get(account.startBacktestId);
      if (bt && window.CHESTBacktestEngine) {
        const riskConfig = (account.isPropfirm && bt.pf) ? bt.pf : bt.cp;
        trades.push(...backtestTradesList(bt, riskConfig));
      }
    }
    if (account.myfxbook && account.history) {
      trades.push(...realTradesWithRR(account.id, account.history, riskPct, account.balance));
    }
    return trades;
  }

  // Formatte le label d'un point de la courbe SELON la periode active - c'est
  // ce qui rend l'axe du temps du graphique enfin coherent (retour direct
  // utilisateur : "en jour par rapport a l'heure de la journee, semaine 1
  // point par jour, mois 1 point par jour du mois...") plutot qu'un simple
  // index 1,2,3... sans rapport avec de vraies dates.
  const WEEKDAY_SHORT_FR = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
  function formatPeriodLabel(period, date) {
    if (!date) return '';
    if (period === 'day') return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (period === 'week') return `${WEEKDAY_SHORT_FR[date.getDay()]} ${date.getDate()}`;
    if (period === 'month') return String(date.getDate());
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); // 'all'
  }

  // Stats (profit/DD/courbe/RR/winrate/labels) d'une courbe datee, decoupee
  // sur [start,end] - garde le dernier point AVANT `start` comme ancre, pour
  // que le % de variation de la periode parte du vrai solde de veille plutot
  // que de 0. RR/winrate recalcules sur les trades (backtest + reels,
  // `trades`) tombant dans la fenetre - les deux s'additionnent naturellement
  // puisque `rr` est dans les deux cas un multiple du risque pris (jamais un
  // simple ratio $).
  function periodStatsFromCurve(period, curve, trades, subLabel) {
    const [start, end] = periodRange(period);
    const before = curve.filter((p) => p.date && p.date < start);
    const within = curve.filter((p) => p.date && p.date >= start && p.date <= end);
    const anchor = before.length ? before[before.length - 1] : null;
    const points = anchor ? [anchor, ...within] : within;
    const equity = points.map((p) => p.capital);
    const labels = points.map((p) => formatPeriodLabel(period, p.date));
    const windowTrades = (trades || []).filter((t) => t.date && t.date >= start && t.date <= end);
    let rr = '—', winrate = '—', winrateSub = 'aucun trade sur cette période';
    // Jours tradés = jours calendaires distincts couverts par les trades de
    // la fenêtre (pas le nombre de trades) - même logique que le compteur
    // "Minimum Trading Days" des objectifs (voir objectivesStatsFromHistory),
    // ici recalculé par période plutôt que depuis le dernier reset.
    const tradedDays = new Set(windowTrades.filter((t) => t.date).map((t) => String(t.date).slice(0, 10))).size;
    if (windowTrades.length) {
      const isSL = (t) => String(t.result).toUpperCase() === 'SL';
      const wins = windowTrades.filter((t) => !isSL(t));
      const winsWithRR = windowTrades.filter((t) => Number(t.rr) > 0);
      // R:R moyen = moyenne du RR des trades GAGNANTS uniquement (retour
      // direct utilisateur du 2026-09-16) - pas un profit factor gain/perte.
      rr = winsWithRR.length ? (winsWithRR.reduce((s, t) => s + Number(t.rr), 0) / winsWithRR.length).toFixed(1) : '—';
      winrate = Math.round((wins.length / windowTrades.length) * 100) + '%';
      winrateSub = `${wins.length}/${windowTrades.length} trades`;
    }
    const tradedDaysSub = `${windowTrades.length} trade${windowTrades.length === 1 ? '' : 's'}`;
    if (equity.length < 2) {
      const bal = equity[0] ?? 0;
      const lbl = labels[0] || '';
      // equity et labels doivent TOUJOURS garder la meme longueur (le
      // graphique les zippe point a point) - le repli 2 points ci-dessous
      // doit donc aussi dupliquer le label, jamais juste l'equity.
      return { profit: '+0.0%', profitSub: `$0 ${subLabel}`, profitDollar: '+$0', profitDollarSub: `+0.0% · ${tradedDays} jour${tradedDays === 1 ? '' : 's'} tradés`, rr, winrate, winrateSub, dd: '0.0%', ddSub: 'pic → creux sur la période', tradedDays, tradedDaysSub, equity: [bal, bal], labels: [lbl, lbl] };
    }
    const startBal = equity[0], endBal = equity[equity.length - 1];
    const diff = endBal - startBal;
    const profitPct = startBal ? (diff / startBal * 100) : 0;
    return {
      profit: `${profitPct >= 0 ? '+' : ''}${profitPct.toFixed(1)}%`,
      profitSub: `${diff >= 0 ? '+' : ''}${money(diff)} ${subLabel}`,
      profitDollar: `${diff >= 0 ? '+' : ''}${money(diff)}`,
      profitDollarSub: `${profitPct >= 0 ? '+' : ''}${profitPct.toFixed(1)}% · ${tradedDays} jour${tradedDays === 1 ? '' : 's'} tradés`,
      rr, winrate, winrateSub,
      dd: maxDrawdownPct(equity).toFixed(1) + '%', ddSub: 'pic → creux sur la période',
      tradedDays, tradedDaysSub,
      equity, labels,
    };
  }

  // Point d'entree : calcule les 4 periodes d'UN coup, a partir des 3
  // ingredients bruts deja disponibles pour tout compte reel (myfxbook et/ou
  // backtest) - dailyHistory (Semaine/Mois/Annee), history brut (Jour, voir
  // intradayCurveFromTrades) et la liste de trades unifiee (RR/winrate).
  function computeAllPeriods(dailyHistory, currentBalance, trades, history, backtestLinkedTitle) {
    const dayCurve = intradayCurveFromTrades(history, currentBalance);
    const restCurve = capitalCurveFromDailyHistory(dailyHistory, currentBalance);
    const subLabels = { day: "aujourd'hui", week: 'cette semaine', month: 'ce mois', all: 'cette année', full: 'sur tout l\'historique' };
    const out = {};
    ['day', 'week', 'month', 'all', 'full'].forEach((key) => {
      const curve = key === 'day' ? dayCurve : restCurve;
      out[key] = periodStatsFromCurve(key, curve, trades, subLabels[key]);
      if (backtestLinkedTitle) out[key].backtestLinked = backtestLinkedTitle;
    });
    return out;
  }

  // ---------- Historique Myfxbook persisté (retour direct utilisateur du
  // 2026-09-16 : "toutes les journées de myfxbook qui rentrent dans CHEST
  // restent dans CHEST... pour ne jamais perdre les infos d'un compte
  // précédemment utilisé") ----------
  // fetchMyfxbookAccount() ne récupère qu'une fenêtre glissante de 95 jours
  // via l'API Myfxbook (voir plus bas) - ce store local accumule CHAQUE jour
  // déjà vu, sans limite de durée ni suppression, pour que l'historique
  // d'une famille survive même si le compte myfxbook connecté change ou est
  // déconnecté plus tard. Un jour déjà stocké est écrasé s'il est
  // resynchronisé (Myfxbook ne révise normalement pas un jour déjà clos,
  // mais on reste cohérent en cas de resynchro) - jamais supprimé.
  const MYFXBOOK_HISTORY_KEY = 'chest_myfxbook_daily_history';
  function loadMyfxbookHistory() {
    try { return JSON.parse(localStorage.getItem(MYFXBOOK_HISTORY_KEY) || '{}'); } catch (e) { return {}; }
  }
  function saveMyfxbookHistory(all) {
    try { localStorage.setItem(MYFXBOOK_HISTORY_KEY, JSON.stringify(all)); } catch (e) { /* quota depassee, tant pis */ }
  }
  function mergeMyfxbookHistory(accountLocalId, dailyGainAsc) {
    if (!accountLocalId || !dailyGainAsc || !dailyGainAsc.length) return;
    const all = loadMyfxbookHistory();
    const forAcc = all[accountLocalId] || {};
    dailyGainAsc.forEach((d) => {
      const dt = new Date(d.date);
      if (isNaN(dt.getTime())) return;
      forAcc[isoDateLocal(dt)] = { value: parseFloat(d.value) || 0, profit: parseFloat(d.profit) || 0 };
    });
    all[accountLocalId] = forAcc;
    saveMyfxbookHistory(all);
  }
  // Complète dailyGainAsc (fenêtre live 95j) avec les jours plus anciens déjà
  // persistés localement pour ce compte, pour étendre la reconstruction de
  // courbe au-delà de ce que l'API renvoie aujourd'hui - c'est ce qui fait
  // que l'historique n'est jamais vraiment perdu, pas juste "stocké sans
  // usage".
  function extendWithPersistedHistory(accountLocalId, dailyGainAsc) {
    const forAcc = loadMyfxbookHistory()[accountLocalId];
    if (!forAcc) return dailyGainAsc;
    const known = new Set(dailyGainAsc.map((d) => isoDateLocal(new Date(d.date))));
    const older = Object.keys(forAcc).filter((key) => !known.has(key)).map((key) => ({ date: key, ...forAcc[key] }));
    if (!older.length) return dailyGainAsc;
    return [...older, ...dailyGainAsc].sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  // ---------- Historique jour par jour complet (remplace l'ancien "14
  // derniers jours" fixe par un navigateur qui parcourt TOUT ce qui est
  // enregistré - backtest + réel persisté, retour direct utilisateur du
  // 2026-09-16) ----------
  // IMPORTANT : produit UNE entree PAR JOUR CALENDAIRE, sans trou, meme les
  // jours sans trade (pnl=0 ce jour-la, capital reporte tel quel) - sinon un
  // jour sans trade est simplement absent de `series`, et le delta entre
  // deux jours AVEC trade se retrouve entierement attribue au jour le plus
  // recent des deux (ex. rien entre le 23/7 et le 26/7 -> tout le mouvement
  // de ces 3 jours s'affichait comme le pnl du 26/7 seul, un montant
  // absurdement gros). Corrige suite au retour direct utilisateur du
  // 2026-09-16 ("je vois des journees rouges a 84357$... ce n'est pas le
  // profit/perte du jour").
  // `pct` calcule ici a partir du VRAI capital de la veille (`carry`, issu
  // directement de la courbe du backtest, qui compose correctement risque%
  // x RR trade par trade) - PAS reconstruit a rebours depuis un solde de
  // compte sans rapport (bug corrige suite au retour direct utilisateur du
  // 2026-09-16 : "-1199.9% en une journée c'est impossible avec 1% de
  // risque" - l'ancienne version anchrait le calcul sur `account.balance`,
  // qui pour une famille sans compte myfxbook reel vaut $0, sans aucun
  // rapport avec l'echelle reelle du capital du backtest).
  function datedSeriesToDailyPnl(series) {
    const byDay = new Map();
    series.forEach((p) => { if (p.date) byDay.set(isoDateLocal(p.date), p.capital); });
    const knownDays = [...byDay.keys()].sort();
    if (knownDays.length < 2) return [];
    const out = [];
    let carry = byDay.get(knownDays[0]);
    const cursor = new Date(knownDays[0]);
    const end = new Date(knownDays[knownDays.length - 1]);
    cursor.setDate(cursor.getDate() + 1);
    while (cursor <= end) {
      const key = isoDateLocal(cursor);
      const capitalToday = byDay.has(key) ? byDay.get(key) : carry;
      const pnl = capitalToday - carry;
      out.push({ date: key, pnl, pct: carry ? (pnl / carry * 100) : 0, capitalBefore: carry });
      carry = capitalToday;
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }
  // Myfxbook renvoie deja un gain (%) et un profit ($) par jour calendaire
  // (pas de trou a combler ici, contrairement au backtest ci-dessus).
  // `capitalBefore` est retro-derive de value/profit (le seul moyen de le
  // connaitre sans un historique de solde jour par jour) - sert uniquement a
  // sommer plusieurs comptes proprement plus bas, jamais affiche tel quel.
  function realDailyPnlFromHistory(accountLocalId) {
    const forAcc = loadMyfxbookHistory()[accountLocalId];
    if (!forAcc) return [];
    return Object.keys(forAcc).sort().map((date) => {
      const { profit, value } = forAcc[date];
      return { date, pnl: profit, pct: value, capitalBefore: value ? (profit / value * 100) : null };
    });
  }
  // Additionne plusieurs series par date : les $ s'additionnent directement,
  // le % combine est recalcule a partir de la somme des capitaux de veille
  // de CHAQUE source active ce jour-la (jamais une simple moyenne/somme de
  // pourcentages heterogenes). Retourne une Map(date -> {pnl, capitalBefore})
  // brute, pas encore le tableau final trie - voir sumDailyPnl ci-dessous.
  function sumSeriesByDate(seriesList) {
    const byDate = new Map();
    seriesList.forEach((series) => series.forEach((d) => {
      const cur = byDate.get(d.date) || { pnl: 0, capitalBefore: 0 };
      cur.pnl += d.pnl;
      if (d.capitalBefore) cur.capitalBefore += d.capitalBefore;
      byDate.set(d.date, cur);
    }));
    return byDate;
  }
  // Combine des sources REELLES (myfxbook, plusieurs comptes membres
  // s'additionnent legitimement s'ils tradent en parallele) avec une source
  // de BACKTEST (le "passe simule" d'un compte/famille). En cas de
  // chevauchement de date entre les deux (le backtest continue au-dela du
  // vrai debut du compte relie), le reel prend TOUJOURS le dessus plutot que
  // de s'additionner au backtest sur ce jour-la - retour direct utilisateur
  // du 2026-09-16 ("quand deux positions se chevauchent, priorite a la
  // position myfxbook"). Avant ce correctif, sumDailyPnl additionnait
  // aveuglement toutes les sources jour par jour, gonflant le pnl des jours
  // ou les deux coexistaient.
  // `source` ('real'|'backtest') tague chaque jour selon sa provenance
  // reelle - sert a colorer differemment le calendrier (jaune/orange pour
  // un jour de backtest sur un compte propre, voir renderMiniCalendar) et
  // au mode "Backtest masqué" (voir dashboardSimpleMode).
  function sumDailyPnl(realParts, backtestParts) {
    const realByDate = sumSeriesByDate(realParts || []);
    const btByDate = sumSeriesByDate(backtestParts || []);
    const byDate = new Map();
    realByDate.forEach((v, date) => byDate.set(date, { ...v, source: 'real' }));
    btByDate.forEach((v, date) => { if (!byDate.has(date)) byDate.set(date, { ...v, source: 'backtest' }); });
    return [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({ date, pnl: v.pnl, pct: v.capitalBefore ? (v.pnl / v.capitalBefore * 100) : 0, source: v.source }));
  }
  function backtestDailyPnl(backtestId, isPropfirm) {
    const bt = window.CHESTBacktests && window.CHESTBacktests.get(backtestId);
    if (!bt || !window.CHESTBacktestEngine) return [];
    const riskConfig = (isPropfirm && bt.pf) ? bt.pf : bt.cp;
    return datedSeriesToDailyPnl(buildBacktestDatedCurve(bt, riskConfig));
  }
  // Historique jour par jour d'un compte INDIVIDUEL (myfxbook persisté + son
  // propre backtest de départ, s'il y en a un — le reel prend le dessus sur
  // les dates ou les deux se chevauchent, voir sumDailyPnl). `includeBacktest`
  // (par defaut true) permet de l'exclure entierement - "mode simple" (voir
  // dashboardSimpleMode), retour direct utilisateur du 2026-09-17.
  function buildDailyHistory(account, includeBacktest) {
    const realParts = account.myfxbook ? [realDailyPnlFromHistory(account.id)] : [];
    const btParts = (includeBacktest !== false && account.startBacktestId) ? [backtestDailyPnl(account.startBacktestId, account.isPropfirm)] : [];
    return sumDailyPnl(realParts, btParts);
  }
  // Historique jour par jour d'une FAMILLE : somme de l'historique reel
  // persiste de chaque membre (jamais leur backtest individuel - meme regle
  // que buildFamilyAggregate, skipBacktest) + le backtest choisi POUR LA
  // FAMILLE, une seule fois - le reel prend le dessus en cas de chevauchement.
  function buildFamilyDailyHistory(fam, members, isPropfirm, includeBacktest) {
    const realParts = members.filter((a) => a.myfxbook).map((a) => realDailyPnlFromHistory(a.id));
    const btParts = (includeBacktest !== false && fam.startBacktestId) ? [backtestDailyPnl(fam.startBacktestId, isPropfirm)] : [];
    return sumDailyPnl(realParts, btParts);
  }

  // Risque fixe reellement utilise par l'utilisateur - source unique pour
  // TOUT calcul de RR sur des positions reelles (dashboard ET BERICH), voir
  // js/berich-store.js. `effectiveRisk(conn, [], null)` avec un historique de
  // signaux vide retombe toujours sur le risque DE BASE (pas de palier post-
  // SL, qu'on ne peut pas reconstruire proprement depuis l'historique
  // Myfxbook) - une approximation assumee, jamais un vrai chiffre invente.
  function fixedRiskPercent() {
    if (!window.CHESTBerich) return null;
    const conn = CHESTBerich.loadConnection();
    if (!conn) return null;
    const info = CHESTBerich.effectiveRisk(conn, [], null);
    return info && info.risk ? info.risk : null;
  }

  // RR par trade reel = resultat% (par rapport au capital de la veille du
  // jour de cloture, voir realDailyPnlFromHistory) divise par le risque fixe
  // configure - retour direct utilisateur du 2026-09-16 ("si je risque 0.5%
  // et que mon tp est de +3% j'ai fait un RR6"). `fallbackBalance` (solde
  // actuel connu) est utilise quand le jour de cloture du trade n'a pas
  // encore de capitalBefore persiste - typiquement AUJOURD'HUI, que
  // get-daily-gain.json ne renvoie souvent qu'une fois la journee terminee
  // cote Myfxbook - sans repli, ces trades disparaissaient purement et
  // simplement du RR/winrate de la periode "Jour" meme quand la courbe
  // intra-journee montrait bien de vrais mouvements. Si AUCUN risque fixe
  // n'est configure (Compte -> Connexion trading), on l'ESTIME depuis la
  // perte moyenne des trades PERDANTS de ce meme historique plutot que de
  // renvoyer un RR/winrate vide - retour direct utilisateur du 2026-09-17
  // (deuxieme fois : "les rr moyen et winrate ne s'affichent toujours pas
  // avec les elements de myfxbook").
  function realTradesWithRR(accountId, history, riskPct, fallbackBalance) {
    if (!history || !history.length) return [];
    const capitalByDay = new Map(realDailyPnlFromHistory(accountId).map((d) => [d.date, d.capitalBefore]));
    const withPct = history.map((t) => {
      if (!t.closeTime) return null;
      const capitalBefore = capitalByDay.get(isoDateLocal(new Date(t.closeTime))) || fallbackBalance;
      if (!capitalBefore) return null;
      const profit = parseFloat(t.profit) || 0;
      return { date: new Date(t.closeTime), profit, resultPct: profit / capitalBefore * 100 };
    }).filter(Boolean);
    if (!withPct.length) return [];

    let effectiveRiskPct = riskPct;
    if (!effectiveRiskPct) {
      const losses = withPct.filter((t) => t.resultPct < 0);
      effectiveRiskPct = losses.length ? Math.abs(losses.reduce((s, t) => s + t.resultPct, 0) / losses.length) : null;
    }
    if (!effectiveRiskPct) return [];

    return withPct.map((t) => {
      const rr = t.resultPct / effectiveRiskPct;
      // BE (breakeven) : resultat quasi nul par rapport au risque pris
      // (moins de 10% du risque configure/estime, ex. sortie a l'entree
      // apres frais/commission) - ne compte ni comme gain ni comme perte
      // pour le winrate, meme convention que le moteur de backtest
      // (backtest-engine.js, ou un trade BE compte comme un "non-SL").
      const result = Math.abs(rr) < 0.1 ? 'BE' : (t.profit >= 0 ? 'TP' : 'SL');
      return { date: t.date, result, rr };
    });
  }

  // Reconstruit profit/DD/jours de trading a partir de dailyHistory (le
  // meme historique jour par jour, deja fusionne reel+backtest avec
  // priorite au reel - voir sumDailyPnl), filtre depuis `resetAtIso` -
  // c'est ce qui fait que "Trading Objectives" repart bien a zero apres un
  // payout ou un changement de phase (retour direct utilisateur du
  // 2026-09-16), au lieu de rester ancre sur la fenetre fixe de 95 jours de
  // l'API Myfxbook comme avant. Le % cumule est recompose par capitalisation
  // des % quotidiens (base 100) - coherent avec la meme convention utilisee
  // partout ailleurs sur le Dashboard (jamais une simple somme de %).
  function objectivesStatsFromHistory(dailyHistory, resetAtIso) {
    const days = (dailyHistory || []).filter((d) => !resetAtIso || d.date >= resetAtIso);
    let capital = 100;
    const curve = [capital];
    let tradingDays = 0;
    days.forEach((d) => {
      if (d.pnl) tradingDays++;
      capital *= 1 + (d.pct || 0) / 100;
      curve.push(capital);
    });
    const todayIso = isoDateLocal(new Date());
    const todayEntry = days.find((d) => d.date === todayIso);
    return {
      profitPct: (capital / 100 - 1) * 100,
      maxDD: maxDrawdownPct(curve),
      tradingDays,
      todayPct: todayEntry ? (todayEntry.pct || 0) : 0,
    };
  }
  function evaluateChallengeObjectivesFromHistory(cfg, dailyHistory, resetAtIso) {
    if (!cfg) return null;
    const { profitPct, maxDD, tradingDays, todayPct } = objectivesStatsFromHistory(dailyHistory, resetAtIso);
    return [
      { label: 'Minimum Trading Days', target: `${cfg.minTradingDays} jours`, current: `${tradingDays} jours`, ok: tradingDays >= cfg.minTradingDays },
      { label: 'Max Daily Loss', target: `-${cfg.maxDailyLossPct}%`, current: `${todayPct >= 0 ? '+' : ''}${todayPct.toFixed(2)}%`, ok: todayPct >= -cfg.maxDailyLossPct },
      { label: 'Max Loss', target: `-${cfg.maxLossPct}%`, current: `-${maxDD.toFixed(2)}%`, ok: maxDD <= cfg.maxLossPct },
      { label: 'Profit Target', target: `+${cfg.profitTargetPct}%`, current: `${profitPct >= 0 ? '+' : ''}${profitPct.toFixed(1)}%`, ok: profitPct >= cfg.profitTargetPct },
    ];
  }

  // Ne renvoie plus que les INGREDIENTS bruts (solde, historique jour par
  // jour, vrais trades) - le calcul des 4 periodes/objectifs/RR se fait
  // desormais en UN seul endroit commun (computeAllPeriods, voir plus haut)
  // une fois dailyHistory construit, que le compte soit individuel ou membre
  // d'une famille - plus deux pipelines paralleles qui pouvaient diverger.
  async function fetchMyfxbookAccount(mfx, localAccountId) {
    const session = await CHESTMyfxbook.login(mfx.email, mfx.password);
    try {
      const accounts = await CHESTMyfxbook.getMyAccounts(session);
      const acc = accounts.find((a) => String(a.id) === String(mfx.accountId));
      if (!acc) throw new Error("Ce compte n'existe plus sur ton profil Myfxbook.");
      const [dailyGainRaw, history] = await Promise.all([
        CHESTMyfxbook.getDailyGain(session, acc.id, 95),
        CHESTMyfxbook.getHistory(session, acc.id),
      ]);
      let dailyGainAsc = dailyGainRaw.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
      // Persiste chaque jour recu (jamais perdu meme si ce compte est plus
      // tard deconnecte/remplace), puis reetend la fenetre live 95j avec le
      // plus ancien deja stocke localement - voir la section juste au-dessus.
      mergeMyfxbookHistory(localAccountId, dailyGainAsc);
      dailyGainAsc = extendWithPersistedHistory(localAccountId, dailyGainAsc);
      const balance = parseFloat(acc.balance) || 0;
      const equity = parseFloat(acc.equity) || balance;
      return {
        balance, equity, pnl: equity - balance, today: 0, // "today" recalcule depuis dailyHistory juste apres (voir refreshActiveAccount)
        syncedAt: new Date().toISOString(),
        // number/type manquaient ici (2026-09-24, retour utilisateur : "#undefined · undefined" affiché
        // sous le nom du compte) - seul le repli d'erreur de tryLoadLiveSwann() les renseignait, jamais
        // une synchro réussie. Mêmes valeurs que ce repli, pour un affichage identique que la synchro
        // Myfxbook réussisse ou échoue (moins de "clignotement" visuel entre les deux états).
        number: mfx.accountId, type: mfx.demo ? 'Démo' : 'Réel',
        dailyGainAsc, // garde pour l'historique persiste (mergeMyfxbookHistory/extendWithPersistedHistory)
        history, // garde pour le RR reel et la courbe intra-journee (voir unifiedTradesList/intradayCurveFromTrades)
      };
    } finally {
      CHESTMyfxbook.logout(session);
    }
  }

  // "Live Swann" (voir account.html) reste toujours a jour - jamais servi
  // depuis le cache 5min des comptes Myfxbook ordinaires du Dashboard.
  async function tryLoadLiveSwann() {
    if (!window.CHESTAccounts || !CHESTAccounts.isAdmin()) return null;
    let live;
    try { live = JSON.parse(localStorage.getItem(LIVE_SWANN_KEY) || 'null'); } catch (e) { return null; }
    if (!live || !live.enabled || !live.myfxbook) return null;
    try {
      const data = await fetchMyfxbookAccount(live.myfxbook, 'live-swann');
      // `myfxbook` doit rester present sur l'objet retourne (pas juste passe
      // en argument) : c'est ce champ que refreshActiveAccount() lit pour
      // savoir s'il doit construire dailyHistory/periods pour ce compte -
      // sans lui, Live Swann ratait tout le pipeline unifie (mini-calendrier
      // bloque sur les 14 jours fixes, jamais le vrai navigateur par jour).
      return { id: 'live-swann', name: '🟢 Live Swann', isLiveSwann: true, example: false, myfxbook: live.myfxbook, ...data };
    } catch (e) {
      console.error('Live Swann', e);
      return { id: 'live-swann', name: '🟢 Live Swann', isLiveSwann: true, example: false, myfxbookError: e.message,
        balance: 0, equity: 0, pnl: 0, today: 0, number: live.myfxbook.accountId, type: live.myfxbook.demo ? 'Démo' : 'Réel', broker: live.myfxbook.name };
    }
  }

  // Derniere synchro reussie d'un compte, persistee sur le compte lui-meme
  // (pas seulement en memoire) - filet de securite si la TOUTE PREMIERE
  // synchro d'un chargement de page echoue (panne Myfxbook transitoire,
  // constate en direct le 2026-09-17 : CORS intermittent cote Myfxbook,
  // parfois bloque parfois non sur des appels identiques) : sans ca, la
  // seule alternative etait un compte vide (solde $0, aucun graphique) -
  // retour direct utilisateur ("la connexion semble erroner et donc
  // n'affiche toujours rien").
  function saveLastKnownGood(accountId, data) {
    const accounts = loadAccounts();
    const acc = accounts.find((a) => a.id === accountId);
    if (!acc) return;
    acc.lastKnownGood = { balance: data.balance, equity: data.equity, pnl: data.pnl, syncedAt: data.syncedAt };
    saveAccounts(accounts);
  }

  async function enrichWithMyfxbook(account) {
    if (!account.myfxbook) return account;
    if (account.isLiveSwann) return account; // deja resynchronise a chaque chargement, voir tryLoadLiveSwann
    const cached = myfxbookCache[account.id];
    if (cached && cached.data && Date.now() - cached.at < MYFXBOOK_CACHE_MS) {
      return { ...account, ...cached.data, example: false };
    }
    try {
      const data = await fetchMyfxbookAccount(account.myfxbook, account.id);
      myfxbookCache[account.id] = { at: Date.now(), data };
      saveLastKnownGood(account.id, data);
      return { ...account, ...data, example: false };
    } catch (e) {
      console.error('Myfxbook', e);
      // Panne transitoire : on ne garde JAMAIS l'erreur seule dans le cache
      // (contrairement a avant) - le dernier fetch reussi de cette session
      // (`cached.data`, jamais efface par un echec) reste utilisable tel
      // quel ; a defaut, le dernier solde connu PERSISTE (lastKnownGood,
      // survit meme a un rechargement complet de la page) ; l'historique
      // jour par jour (dailyHistory) reste de toute facon disponible via le
      // store persiste (chest_myfxbook_daily_history), independant de cet
      // echec - seule la toute derniere journee peut manquer.
      const fallback = (cached && cached.data) || (account.lastKnownGood && { ...account.lastKnownGood, dailyGainAsc: [], history: [] });
      if (fallback) {
        return { ...account, ...fallback, example: false, myfxbookError: e.message, myfxbookStale: true };
      }
      return { ...account, myfxbookError: e.message };
    }
  }

  // ---------- Switcher de comptes, avec familles imbriquées ----------
  function accountRowHtml(a, activeId) {
    // Les comptes "Live" (Myfxbook admin auto-synchronisé, pont MT5 local) ne sont pas des comptes
    // créés depuis le site : rien à supprimer ici, pas de bouton ⋮ pour eux.
    const canDelete = !a.isLiveSwann && a.id !== 'mt5-live';
    return `
      <div class="acc-row">
        <button class="acc-menu__item ${a.id === activeId ? 'is-active' : ''}" data-id="${a.id}">
          <span class="avatar ${a.isLiveSwann ? 'is-live' : ''}">${a.isLiveSwann ? '🟢' : a.live ? '🔴' : initials(a.name)}</span>
          <span><strong>${a.name}</strong><span>#${a.number} · ${a.type}</span></span>
        </button>
        ${canDelete ? `
        <div class="acc-tools">
          <button type="button" class="acc-tools__btn" aria-label="Options du compte ${a.name}">⋮</button>
          <div class="acc-tools__menu">
            <button type="button" data-pick-backtest-account="${a.id}">📊 ${a.startBacktestId ? 'Changer le backtesting' : 'Choisir un backtesting'}</button>
            <button type="button" class="is-danger" data-delete-account="${a.id}">Supprimer</button>
          </div>
        </div>` : ''}
      </div>`;
  }

  function renderAccountMenu(accounts, active) {
    const list = document.getElementById('accMenuList');
    const families = loadFamilies();
    const groupedIds = new Set(families.flatMap((f) => f.accountIds));
    const ungrouped = accounts.filter((a) => !groupedIds.has(a.id));

    const familyHtml = families.map((fam) => {
      const famAccounts = fam.accountIds.map((id) => accounts.find((a) => a.id === id)).filter(Boolean);
      const isFamilyActive = active.id === fam.id;
      const isOpen = openFamilyIds.has(fam.id) || isFamilyActive || famAccounts.some((a) => a.id === active.id);
      return `
        <div class="acc-menu__family" data-family-id="${fam.id}">
          <div class="acc-menu__family-row">
            <button type="button" class="acc-menu__family-head ${isOpen ? 'is-open' : ''} ${isFamilyActive ? 'is-active' : ''}" data-select-family="${fam.id}">
              <span>${fam.name}</span><span class="chev">▾</span>
            </button>
            <div class="acc-tools">
              <button type="button" class="acc-tools__btn" aria-label="Options de la famille ${fam.name}">⋮</button>
              <div class="acc-tools__menu">
                <button type="button" data-add-to-family="${fam.id}">＋ Ajouter un compte</button>
                <button type="button" data-pick-backtest-family="${fam.id}">📊 ${fam.startBacktestId ? 'Changer le backtesting' : 'Choisir un backtesting'}</button>
                <button type="button" class="is-danger" data-delete-family="${fam.id}">Supprimer</button>
              </div>
            </div>
          </div>
          <div class="acc-menu__family-accounts" ${isOpen ? '' : 'hidden'}>
            ${famAccounts.length ? famAccounts.map((a) => accountRowHtml(a, active.id)).join('') : '<div class="acc-menu__item" style="cursor:default;color:var(--faint);font-size:12px">Vide — utilise le ⋮ ci-dessus pour ajouter un compte.</div>'}
          </div>
        </div>`;
    }).join('');

    list.innerHTML = familyHtml + ungrouped.map((a) => accountRowHtml(a, active.id)).join('');

    list.querySelectorAll('[data-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        localStorage.setItem(ACTIVE_KEY, btn.dataset.id);
        closeMenu();
        renderAll();
      });
    });
    // Cliquer le nom d'une famille = choisir sa vue agrégée (somme de tous
    // ses comptes) ET la deplier - contrairement a un simple switcher, une
    // famille EST un compte a part entiere (retour direct utilisateur du
    // 2026-09-15 : "toutes les comptes qui s'additionnent pour former le
    // dashboard complet").
    list.querySelectorAll('[data-select-family]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.selectFamily;
        openFamilyIds.add(id);
        localStorage.setItem(ACTIVE_KEY, id);
        closeMenu();
        renderAll();
      });
    });
    list.querySelectorAll('[data-add-to-family]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openAddAccountModal(btn.dataset.addToFamily);
      });
    });
    list.querySelectorAll('[data-delete-account]').forEach((btn) => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); deleteAccount(btn.dataset.deleteAccount); });
    });
    list.querySelectorAll('[data-delete-family]').forEach((btn) => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); deleteFamily(btn.dataset.deleteFamily); });
    });
    list.querySelectorAll('[data-pick-backtest-family]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openBacktestPicker('family', btn.dataset.pickBacktestFamily);
      });
    });
    list.querySelectorAll('[data-pick-backtest-account]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openBacktestPicker('account', btn.dataset.pickBacktestAccount);
      });
    });
  }

  // Remplace un window.prompt() natif - ne fonctionne pas dans ce panneau
  // d'apercu integre (bouton sans aucun effet visible pour l'utilisateur,
  // constate en direct le 2026-09-15). Vraie fenetre du site a la place.
  function openFamilyPrompt() {
    document.getElementById('newFamilyName').value = '';
    document.getElementById('newFamilyModal').classList.add('is-open');
    requestAnimationFrame(() => document.getElementById('newFamilyName').focus());
  }
  function closeFamilyModal() {
    document.getElementById('newFamilyModal').classList.remove('is-open');
  }
  function createFamilyFromModal() {
    const name = document.getElementById('newFamilyName').value.trim();
    if (!name) { showToast('Donne un nom à la famille'); return; }
    const families = loadFamilies();
    const fam = { id: 'fam-' + Date.now(), name, accountIds: [] };
    families.push(fam);
    saveFamilies(families);
    openFamilyIds.add(fam.id);
    closeFamilyModal();
    closeMenu();
    // Enchaine directement sur "Ajouter un compte" DANS cette famille (2026-09-24, demande
    // utilisateur : "il est préférable de juste créer une famille d'abord [...] puis une fois créée
    // là il crée son compte dedans, pas l'inverse") - une famille vide n'a rien à montrer, le geste
    // naturel qui suit sa création est d'y mettre un premier compte, jamais un second clic à
    // retrouver soi-même dans un switcher qui, au tout premier lancement, n'est même pas visible
    // (dashboard encore sur l'état vide "Ajoute ton premier compte").
    showToast('Famille créée ✓');
    openAddAccountModal(fam.id);
  }
  function initFamilyModal() {
    document.getElementById('newFamilyClose').addEventListener('click', closeFamilyModal);
    document.getElementById('newFamilyModal').addEventListener('click', (e) => {
      if (e.target.id === 'newFamilyModal') closeFamilyModal();
    });
    document.getElementById('newFamilyCreateBtn').addEventListener('click', createFamilyFromModal);
    document.getElementById('newFamilyName').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') createFamilyFromModal();
    });
  }

  // ---------- Backtesting de depart d'une FAMILLE OU D'UN COMPTE SEUL (choix accessible depuis le
  // menu ⋮ du switcher) - generalise (2026-09-25, retour utilisateur : "j'ai un compte connecte a
  // myfxbook et que j'ajoute un backtesting, il marche pas, y a rien qui s'affiche") : le pipeline de
  // rendu (refreshActiveAccount(), ligne ~1657) lisait deja startBacktestId sur un compte INDIVIDUEL
  // aussi bien que sur une famille - seul CE picker et son bouton n'existaient que pour les
  // familles, un compte seul (myfxbook ou pas) n'avait simplement aucun moyen d'en choisir un apres
  // sa creation (uniquement a la creation, via #addAccountBacktest dans "Ajouter un compte"). ----------
  let pendingBacktestTarget = null; // { kind: 'family'|'account', id }
  function openBacktestPicker(kind, id) {
    pendingBacktestTarget = { kind, id };
    const target = kind === 'family' ? loadFamilies().find((f) => f.id === id) : loadAccounts().find((a) => a.id === id);
    const items = (window.CHESTBacktests && window.CHESTBacktests.list()) || [];
    const rows = [];
    if (target && target.startBacktestId) {
      rows.push(`<button type="button" class="mfx-account-row" data-backtest-choice="">✕ Retirer le backtesting actuel</button>`);
    }
    if (!items.length) {
      rows.push(`<p class="hint" style="margin:0">Aucun backtest disponible — ajoutes-en un depuis <a href="backtesting.html">Backtesting</a>.</p>`);
    } else {
      items.forEach((b) => {
        rows.push(`
          <button type="button" class="mfx-account-row ${target && target.startBacktestId === b.id ? 'is-selected' : ''}" data-backtest-choice="${b.id}">
            <span><strong>${b.title}</strong><span>${b.trades.length} trades · ${money(b.capital)} capital</span></span>
          </button>`);
      });
    }
    const list = document.getElementById('familyBacktestList');
    list.innerHTML = rows.join('');
    list.querySelectorAll('[data-backtest-choice]').forEach((btn) => {
      btn.addEventListener('click', () => setBacktestTarget(btn.dataset.backtestChoice || null));
    });
    document.getElementById('familyBacktestModal').classList.add('is-open');
  }
  function closeFamilyBacktestModal() { document.getElementById('familyBacktestModal').classList.remove('is-open'); }
  function setBacktestTarget(backtestId) {
    if (!pendingBacktestTarget) return;
    const { kind, id } = pendingBacktestTarget;
    if (kind === 'family') {
      const families = loadFamilies();
      const fam = families.find((f) => f.id === id);
      if (!fam) return;
      fam.startBacktestId = backtestId || null;
      saveFamilies(families);
    } else {
      const accounts = loadAccounts();
      const acc = accounts.find((a) => a.id === id);
      if (!acc) return;
      acc.startBacktestId = backtestId || null;
      saveAccounts(accounts);
    }
    closeFamilyBacktestModal();
    closeMenu();
    renderAll();
    showToast(backtestId ? 'Backtesting associé ✓' : 'Backtesting retiré');
  }
  function initFamilyBacktestModal() {
    document.getElementById('familyBacktestClose').addEventListener('click', closeFamilyBacktestModal);
    document.getElementById('familyBacktestModal').addEventListener('click', (e) => {
      if (e.target.id === 'familyBacktestModal') closeFamilyBacktestModal();
    });
  }

  // Gros titre "Propfirm" / "Compte propre" a la place de tout le texte de
  // statut de synchro (retour direct utilisateur du 2026-09-17 : "enleve
  // tout les texte et met juste un titre soit compte propre soit propfirm
  // en gros") - un echec de synchro reste visible mais compact (icone ⚠
  // avec le detail en tooltip), jamais perdu silencieusement.
  function renderAccountHeader(a) {
    const avatarEl = document.getElementById('accAvatar');
    avatarEl.textContent = a.isLiveSwann ? '🟢' : a.live ? '🔴' : initials(a.name);
    avatarEl.classList.toggle('is-live', !!a.isLiveSwann);
    document.getElementById('accName').textContent = a.name;
    document.getElementById('accSub').textContent = `#${a.number} · ${a.type}`;
    const titleEl = document.getElementById('accKindTitle');
    titleEl.textContent = a.isPropfirm ? 'Propfirm' : (a.myfxbook || a.live || a.isFamily ? 'Compte propre' : 'Démo');
    const errEl = document.getElementById('accSyncError');
    if (a.myfxbookError) {
      errEl.hidden = false;
      errEl.title = a.myfxbookStale
        ? `Synchro Myfxbook indisponible pour l'instant (${a.myfxbookError}) — dernières données connues du ${a.syncedAt ? new Date(a.syncedAt).toLocaleString('fr-FR') : '—'}.`
        : `Échec de synchro Myfxbook : ${a.myfxbookError}`;
    } else {
      errEl.hidden = true;
    }
    document.getElementById('resBalance').textContent = money(a.balance);
    document.getElementById('resEquity').textContent = money(a.equity);
    const pnlEl = document.getElementById('resPnl');
    pnlEl.textContent = (a.pnl >= 0 ? '+' : '') + money(a.pnl);
    pnlEl.className = a.pnl >= 0 ? 'pos' : 'neg';
    const todayEl = document.getElementById('resToday');
    todayEl.textContent = (a.today >= 0 ? '+' : '') + money(a.today);
    todayEl.className = a.today >= 0 ? 'pos' : 'neg';
  }

  function renderObjectives(a) {
    // Le bouton reste visible meme pour une famille (retour direct
    // utilisateur du 2026-09-17 : "il manque l'onglet parametre du propfirm
    // pour mettre les conditions du pf") - openEditObjectivesModal() resout
    // alors lui-meme le compte membre concerne plutot que de bloquer.
    if (a && a.objectives === null) {
      document.getElementById('objectivesList').innerHTML = `
        <div class="objective-row" style="border:none">
          <div class="label">Pas de règles de challenge associées à un compte Myfxbook — les objectifs ne concernent que les comptes propfirm/MT5 avec des règles définies.</div>
        </div>`;
      return;
    }
    const list = (a && a.objectives) || SAMPLE_OBJECTIVES;
    document.getElementById('objectivesList').innerHTML = list.map((o) => `
      <div class="objective-row">
        <div class="label"><b>${o.label}</b>Limite : ${o.target}</div>
        <div class="objective-row__wrap">
          <div class="value ${o.ok ? 'pos' : 'neg'}">${o.current}</div>
          <span class="check ${o.ok ? 'ok' : 'ko'}">${o.ok ? '✓' : '✕'}</span>
        </div>
      </div>
    `).join('');
  }

  // Navigateur de jours : `calOffsetDays` decale la fenetre de CAL_WINDOW
  // jours affichee (0 = fenetre se terminant aujourd'hui). Remis a 0 a
  // chaque changement de compte (voir renderAll) pour ne pas rester
  // "coince" dans le passe en changeant de compte/famille.
  let calOffsetDays = 0;
  let lastCalAccountId = null; // pour remettre calOffsetDays a 0 seulement au CHANGEMENT de compte, pas a chaque resynchro automatique du meme compte
  let CAL_WINDOW = 14; // recalcule a chaque rendu (14j ou mois complet, voir loadMiniCalRange - compte propre uniquement)

  // Fenetre affichee par le calendrier de performance - 14j fixe pour un
  // propfirm (le cycle de retrait raisonne par semaine sur 14j), ou 14j/28j
  // au choix pour un compte propre (retour direct utilisateur du
  // 2026-09-17 : "mettre les 4 semaines si c'est compte propre").
  const MINICAL_RANGE_KEY = 'chest_minical_range';
  function loadMiniCalRange(accountId) {
    let all = {};
    try { all = JSON.parse(localStorage.getItem(MINICAL_RANGE_KEY) || '{}'); } catch (e) { /* tant pis */ }
    return all[accountId] || 14;
  }
  function saveMiniCalRange(accountId, days) {
    let all = {};
    try { all = JSON.parse(localStorage.getItem(MINICAL_RANGE_KEY) || '{}'); } catch (e) { /* tant pis */ }
    all[accountId] = days;
    try { localStorage.setItem(MINICAL_RANGE_KEY, JSON.stringify(all)); } catch (e) { /* tant pis */ }
  }

  // Resultats par semaine EN TEXTE PLEIN (plus de "bulles" encadrees) tout
  // en haut de la carte, autant de semaines que la fenetre affichee (2 pour
  // 14j, 4 pour un mois complet) - retour direct utilisateur du 2026-09-17.
  function renderWeekTotals(weeks, isPercent) {
    const wrap = document.getElementById('calWeeks');
    wrap.innerHTML = weeks.map(({ d1, d2, value }) => {
      const cls = value > 0 ? ' pos' : value < 0 ? ' neg' : '';
      const label = isPercent ? `${value >= 0 ? '+' : ''}${value.toFixed(1)}%` : (value >= 0 ? '+' : '') + money(value);
      return `<span class="mini-cal__total-item"><span class="r">${d1.getDate()}/${d1.getMonth() + 1}–${d2.getDate()}/${d2.getMonth() + 1}</span><span class="v${cls}">${label}</span></span>`;
    }).join('');
  }

  function renderMiniCalendar(a) {
    const history = a && a.dailyHistory;
    const prevBtn = document.getElementById('calPrev');
    const nextBtn = document.getElementById('calNext');
    const todayBtn = document.getElementById('calToday');
    const rangeEl = document.getElementById('calRange');
    const settingsBtn = document.getElementById('miniCalSettingsBtn');
    const isPropfirmAccount = !!(a && a.isPropfirm);
    settingsBtn.hidden = !a || isPropfirmAccount;
    CAL_WINDOW = isPropfirmAccount ? 14 : loadMiniCalRange(a && a.id);
    document.querySelectorAll('#miniCalRangeToggle button').forEach((b) => b.classList.toggle('is-active', Number(b.dataset.days) === CAL_WINDOW));

    // Comptes demo/sans backtest ni myfxbook : pas d'historique jour par
    // jour reel disponible, on garde l'ancien affichage fixe (14 derniers
    // jours), navigation desactivee.
    if (!history || !history.length) {
      prevBtn.disabled = true; nextBtn.disabled = true; todayBtn.classList.add('is-active');
      rangeEl.textContent = '';
      const series = (a && a.calendar14) || SAMPLE_CAL_14;
      const today = new Date();
      const cells = series.map((pnl, i) => {
        const d = new Date(today);
        d.setDate(d.getDate() - (series.length - 1 - i));
        const cls = pnl > 0 ? 'pos' : pnl < 0 ? 'neg' : '';
        const pnlLabel = pnl === 0 ? '—' : (pnl > 0 ? '+' : '-') + '$' + Math.abs(pnl).toFixed(0);
        return `<div class="mini-cal__cell ${cls}"><span class="d">${d.getDate()}/${d.getMonth() + 1}</span><span class="p">${pnlLabel}</span></div>`;
      }).join('');
      document.getElementById('miniCalGrid').innerHTML = cells;
      const dateAt = (offsetFromEnd) => { const d = new Date(today); d.setDate(d.getDate() - offsetFromEnd); return d; };
      const weeks = [];
      for (let w = 0; w < series.length / 7; w++) {
        const week = series.slice(w * 7, w * 7 + 7);
        weeks.push({ d1: dateAt(series.length - 1 - w * 7), d2: dateAt(series.length - 7 - w * 7), value: week.reduce((s, v) => s + v, 0) });
      }
      renderWeekTotals(weeks, false);
      return;
    }

    const byDate = new Map(history.map((d) => [d.date, d]));
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - calOffsetDays);
    const todayIso = isoDateLocal(new Date());
    const days = [];
    for (let i = CAL_WINDOW - 1; i >= 0; i--) {
      const d = new Date(endDate);
      d.setDate(d.getDate() - i);
      const key = isoDateLocal(d);
      const rec = byDate.get(key);
      days.push({ date: d, key, pnl: rec ? rec.pnl : null, pct: rec ? rec.pct : null, source: rec ? rec.source : null });
    }
    // %/$ - meme bascule que le graphique juste au-dessus (retour direct
    // utilisateur du 2026-09-16). Un jour de BACKTEST sur un compte PROPRE
    // (pas propfirm) se colore en jaune/orange plutot que vert/rouge - permet
    // de distinguer d'un coup d'oeil une position simulee d'une vraie
    // position (retour direct utilisateur du 2026-09-17 : "position gagnante
    // du backtesting en jaune, perdante en orange, vraies positions en vert
    // et rouge"). Un retrait simule (mode PF simule, voir renderPayouts) est
    // note en jaune sous la case du jour concerne.
    const isBacktestDay = (d) => d.source === 'backtest' && !isPropfirmAccount;
    const simEventsByDate = (isPropfirmAccount && lastPfSim) ? new Map(lastPfSim.events.map((e) => [e.date, e])) : null;
    const cells = days.map(({ date, key, pnl, pct, source }) => {
      const v = unit === 'percent' ? pct : pnl;
      const backtest = isBacktestDay({ source });
      const toneClass = v === null ? '' : (backtest ? (v > 0 ? 'bt-pos' : v < 0 ? 'bt-neg' : '') : (v > 0 ? 'pos' : v < 0 ? 'neg' : ''));
      const cls = toneClass + (key === todayIso ? ' is-today' : '');
      const label = v === null ? '·' : v === 0 ? '—'
        : unit === 'percent' ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
          : `${v >= 0 ? '+' : '-'}$${Math.abs(v).toFixed(0)}`;
      const simEvent = simEventsByDate ? simEventsByDate.get(key) : null;
      const note = simEvent
        ? (simEvent.type === 'withdrawal' ? `<span class="n">💰 ${money(simEvent.amount)}</span>`
          : simEvent.type === 'blown' ? `<span class="n">✕ cramé</span>`
            : `<span class="n">✓ revalidé</span>`)
        : '';
      return `<div class="mini-cal__cell ${cls}"><span class="d">${date.getDate()}/${date.getMonth() + 1}</span><span class="p">${label}</span>${note}</div>`;
    }).join('');
    document.getElementById('miniCalGrid').innerHTML = cells;
    const isPercent = unit === 'percent';
    const weekTotal = (week) => week.reduce((s, d) => s + (isPercent ? (d.pct || 0) : (d.pnl || 0)), 0);
    const weeks = [];
    for (let w = 0; w < CAL_WINDOW / 7; w++) {
      const week = days.slice(w * 7, w * 7 + 7);
      weeks.push({ d1: week[0].date, d2: week[6].date, value: weekTotal(week) });
    }
    renderWeekTotals(weeks, isPercent);

    const first = days[0], last = days[days.length - 1];
    rangeEl.textContent = `${first.date.getDate()}/${first.date.getMonth() + 1} → ${last.date.getDate()}/${last.date.getMonth() + 1}`;
    todayBtn.classList.toggle('is-active', calOffsetDays === 0);
    nextBtn.disabled = calOffsetDays <= 0;
    // Rien de plus loin a voir si le debut de la fenetre courante remonte
    // deja avant (ou au) plus ancien jour connu.
    prevBtn.disabled = first.key <= history[0].date;
  }

  function initMiniCalSettings() {
    document.getElementById('miniCalSettingsBtn').addEventListener('click', () => {
      document.getElementById('miniCalSettingsModal').classList.add('is-open');
    });
    document.getElementById('miniCalSettingsClose').addEventListener('click', () => {
      document.getElementById('miniCalSettingsModal').classList.remove('is-open');
    });
    document.getElementById('miniCalSettingsModal').addEventListener('click', (e) => {
      if (e.target.id === 'miniCalSettingsModal') document.getElementById('miniCalSettingsModal').classList.remove('is-open');
    });
    document.querySelectorAll('#miniCalRangeToggle button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const raw = currentAccount();
        saveMiniCalRange(raw.id, Number(btn.dataset.days));
        document.getElementById('miniCalSettingsModal').classList.remove('is-open');
        calOffsetDays = 0;
        renderMiniCalendar(activeAccountData);
      });
    });
  }

  // ---------- Simulation de cycle de retrait PF (retour direct utilisateur
  // du 2026-09-17) ----------
  // Simule des conditions de retrait REALISTES appliquees a l'historique
  // jour par jour (backtest + reel, dailyHistory) d'un compte propfirm :
  // capital fixe a 100 000$ au depart de chaque cycle, 14 jours minimum
  // avant d'etre eligible, +1% de profit minimum, retrait le dimanche (fin
  // de semaine) du % configure (80% par defaut) du profit SI le montant
  // depasse le palier minimum configure (1000$ par defaut) - sinon on
  // continue d'accumuler. Si le compte "crame" (perte >= regle max du
  // challenge), on simule un redemarrage Phase 1 -> Phase 2 -> Financé sur
  // la suite de la MEME sequence de rendements quotidiens, et on rapporte le
  // temps mis a revalider (ou "en cours" si les donnees s'arretent avant).
  // Une simulation, jamais un vrai retrait ni une promesse de resultat -
  // meme honnetete que le reste de CHEST sur ses heuristiques.
  const PAYOUT_SIM_KEY = 'chest_payout_sim_settings';
  const PAYOUT_VIEW_KEY = 'chest_payout_view_mode';
  function loadPayoutSimSettings(accountId) {
    let all = {};
    try { all = JSON.parse(localStorage.getItem(PAYOUT_SIM_KEY) || '{}'); } catch (e) { /* tant pis */ }
    return all[accountId] || { payoutPct: 80, minPayout: 1000 };
  }
  function savePayoutSimSettings(accountId, settings) {
    let all = {};
    try { all = JSON.parse(localStorage.getItem(PAYOUT_SIM_KEY) || '{}'); } catch (e) { /* tant pis */ }
    all[accountId] = settings;
    try { localStorage.setItem(PAYOUT_SIM_KEY, JSON.stringify(all)); } catch (e) { /* tant pis */ }
  }
  function loadPayoutViewMode(accountId) {
    let all = {};
    try { all = JSON.parse(localStorage.getItem(PAYOUT_VIEW_KEY) || '{}'); } catch (e) { /* tant pis */ }
    return all[accountId] || 'real';
  }
  function savePayoutViewMode(accountId, mode) {
    let all = {};
    try { all = JSON.parse(localStorage.getItem(PAYOUT_VIEW_KEY) || '{}'); } catch (e) { /* tant pis */ }
    all[accountId] = mode;
    try { localStorage.setItem(PAYOUT_VIEW_KEY, JSON.stringify(all)); } catch (e) { /* tant pis */ }
  }

  // Regles de phase (profit cible + perte max) - reprend celles du
  // propfirm reconnu (CHEST_BROKERS, voir findBrokerMeta) si connu, sinon
  // des valeurs standard de l'industrie par defaut, jamais inventees comme
  // "exactes" (voir rulesNote sur chaque propfirm connu).
  function pfChallengeRules(account) {
    const meta = findBrokerMeta(account);
    if (meta && meta.rules) return meta.rules;
    return {
      phase1: { profitTargetPct: 10, maxLossPct: 10 },
      phase2: { profitTargetPct: 5, maxLossPct: 10 },
      funded: { maxLossPct: 10 },
    };
  }

  function simulatePfLifecycle(dailyHistory, account, settings) {
    const START = 100000;
    const rules = pfChallengeRules(account);
    const events = [];
    const byDate = new Map(); // date -> {capital, state}
    let state = 'funded';
    let capital = START;
    let cycleStart = null;
    let phaseStart = null;
    let blownDate = null;

    (dailyHistory || []).forEach((d) => {
      const date = new Date(d.date + 'T12:00:00');
      if (cycleStart === null) cycleStart = date;
      if (phaseStart === null) phaseStart = date;
      capital *= 1 + (d.pct || 0) / 100;

      if (state === 'funded') {
        const maxLossPct = (rules.funded && rules.funded.maxLossPct) || 10;
        if (capital <= START * (1 - maxLossPct / 100)) {
          events.push({ date: d.date, type: 'blown', capital });
          state = 'phase1'; capital = START; phaseStart = date; blownDate = date; cycleStart = null;
        } else if (date.getDay() === 0 && Math.round((date - cycleStart) / 86400000) >= 14) {
          const profit = capital - START, profitPct = profit / START * 100;
          if (profitPct >= 1) {
            const payout = profit * (settings.payoutPct / 100);
            if (payout >= settings.minPayout) {
              events.push({ date: d.date, type: 'withdrawal', amount: payout, profitPct });
              capital = START; cycleStart = null;
            }
          }
        }
      } else if (state === 'phase1') {
        const target = (rules.phase1 && rules.phase1.profitTargetPct) || 10;
        if ((capital - START) / START * 100 >= target) {
          state = 'phase2'; capital = START; phaseStart = date;
        }
      } else if (state === 'phase2') {
        const target = (rules.phase2 && rules.phase2.profitTargetPct) || 5;
        if ((capital - START) / START * 100 >= target) {
          events.push({ date: d.date, type: 'refunded', days: Math.round((date - blownDate) / 86400000) });
          state = 'funded'; capital = START; cycleStart = date;
        }
      }
      byDate.set(d.date, { capital, state });
    });

    return { events, byDate, finalState: state, inProgress: state !== 'funded' };
  }

  // Volet repliable de la liste des payouts individuels - ferme par defaut,
  // retour direct utilisateur du 2026-09-17 ("le volet des payout
  // individuelle j'aimerais qu'il soit par defaut ferme et que je puisse
  // ouvrir"). Reste ouvert/ferme d'un re-rendu a l'autre (changement de
  // periode, de mode reel/simule...) une fois que l'utilisateur l'a ouvert -
  // seul un changement de COMPTE le referme (voir renderAll).
  let payoutListOpen = false;
  let lastPayoutAccountId = null;
  function setPayoutListOpen(open) {
    payoutListOpen = open;
    const list = document.getElementById('payoutList');
    const toggleBtn = document.getElementById('payoutListToggle');
    if (list) list.hidden = !open;
    if (toggleBtn) toggleBtn.classList.toggle('is-open', open);
  }

  function inPeriodRange(dateStr, range) {
    if (!dateStr) return false;
    const d = new Date(dateStr + 'T12:00:00');
    return d >= range[0] && d <= range[1];
  }

  // ---------- Payouts propfirm : reel (saisi a la main) OU simule (cycle de
  // retrait applique au backtest+reel, voir simulatePfLifecycle) - bascule
  // par l'oeil, retour direct utilisateur du 2026-09-17. Filtres sur la MEME
  // periode que les KPI au-dessus (#periodPills), jamais sur une famille les
  // regles individuelles de chaque compte (payouts reels) mais la simulation
  // marche partout.
  function renderPayouts(a) {
    const bar = document.getElementById('payoutBar');
    if (!a || !a.isPropfirm) { bar.hidden = true; lastPfSim = null; return; }
    bar.hidden = false;
    if (a.id !== lastPayoutAccountId) { payoutListOpen = false; lastPayoutAccountId = a.id; }
    const viewToggle = document.getElementById('payoutViewToggle');
    const settingsBtn = document.getElementById('payoutSettingsBtn');
    const period = document.querySelector('#periodPills .is-active')?.dataset.period || 'month';
    const range = periodRange(period);
    // Le mode simule marche aussi pour une famille (retour direct
    // utilisateur du 2026-09-17 : "je sais pas ou tu l'as mis mais il doit
    // etre applique au dashboard") - la simulation tourne alors sur
    // l'historique jour par jour DEJA agrege de la famille (dailyHistory),
    // avec des regles de phase generiques (pas de propfirm precis au niveau
    // d'une famille). Seule la SAISIE manuelle de payout reste par compte
    // individuel (voir plus bas, payoutAddBtn).
    const mode = loadPayoutViewMode(a.id);
    viewToggle.hidden = false;
    viewToggle.querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b.dataset.view === mode));
    settingsBtn.hidden = mode !== 'sim';
    setPayoutListOpen(payoutListOpen);

    if (mode === 'sim') {
      const settings = loadPayoutSimSettings(a.id);
      const sim = simulatePfLifecycle(a.dailyHistory, a, settings);
      lastPfSim = sim;
      const withdrawals = sim.events.filter((e) => e.type === 'withdrawal');
      const withdrawalsInPeriod = withdrawals.filter((e) => inPeriodRange(e.date, range));
      const total = withdrawalsInPeriod.reduce((s, e) => s + e.amount, 0);
      document.getElementById('payoutTotal').textContent = money(total);
      const rows = sim.events.filter((e) => inPeriodRange(e.date, range)).slice().reverse();
      document.getElementById('payoutList').innerHTML = rows.length
        ? rows.map((e) => {
            if (e.type === 'withdrawal') return `<div class="payout-row"><span>${new Date(e.date).toLocaleDateString('fr-FR')} · +${e.profitPct.toFixed(1)}%</span><b class="val pos">${money(e.amount)}</b></div>`;
            if (e.type === 'blown') return `<div class="payout-row"><span>${new Date(e.date).toLocaleDateString('fr-FR')}</span><b class="val neg">Compte cramé (simulation)</b></div>`;
            return `<div class="payout-row"><span>${new Date(e.date).toLocaleDateString('fr-FR')} · ${e.days} jour${e.days > 1 ? 's' : ''}</span><b class="val pos">Revalidé ✓</b></div>`;
          }).join('')
        : '<p class="hint" style="margin:0">Aucun évènement simulé sur cette période.</p>';
      document.getElementById('payoutAddBtn').style.display = 'none';
      return;
    }

    lastPfSim = null;
    const entries = (a.payouts || []).filter((p) => inPeriodRange(p.date, range)).sort((x, y) => (y.date || '').localeCompare(x.date || ''));
    const total = entries.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    document.getElementById('payoutTotal').textContent = money(total);
    document.getElementById('payoutList').innerHTML = entries.length
      ? entries.map((p) => `
        <div class="payout-row">
          <span>${p.date ? new Date(p.date).toLocaleDateString('fr-FR') : '—'}${a.isFamily ? ' · ' + p.accountName : ''}</span>
          <b>${money(parseFloat(p.amount) || 0)}</b>
          ${a.isFamily ? '' : `<button type="button" class="payout-row__del" data-del-payout="${p.id}" aria-label="Supprimer ce payout">✕</button>`}
        </div>`).join('')
      : '<p class="hint" style="margin:0">Aucun payout enregistré sur cette période.</p>';
    document.getElementById('payoutAddBtn').style.display = a.isFamily ? 'none' : '';
    document.getElementById('payoutList').querySelectorAll('[data-del-payout]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!(await CHESTConfirm('Supprimer ce payout ?'))) return;
        removePayout(a.id, btn.dataset.delPayout);
      });
    });
  }

  function addPayout(accountId, amount, date) {
    const accounts = loadAccounts();
    const acc = accounts.find((x) => x.id === accountId);
    if (!acc) return;
    if (!acc.payouts) acc.payouts = [];
    acc.payouts.push({ id: 'po-' + Date.now(), amount, date });
    // Un retrait marque un nouveau depart pour "Trading Objectives" (comme un
    // vrai reset de challenge apres payout) - retour direct utilisateur du
    // 2026-09-16 ("a chaque nouveau retrait ou changement de phase cet
    // element se met a 0").
    if (acc.challengeObjectives) acc.objectivesResetAt = isoDateLocal(new Date());
    saveAccounts(accounts);
    renderAll();
  }
  function removePayout(accountId, payoutId) {
    const accounts = loadAccounts();
    const acc = accounts.find((x) => x.id === accountId);
    if (!acc) return;
    acc.payouts = (acc.payouts || []).filter((p) => p.id !== payoutId);
    saveAccounts(accounts);
    renderAll();
  }
  function openPayoutModal() {
    document.getElementById('payoutAmount').value = '';
    document.getElementById('payoutDate').value = new Date().toISOString().slice(0, 10);
    document.getElementById('payoutModal').classList.add('is-open');
  }
  function closePayoutModal() { document.getElementById('payoutModal').classList.remove('is-open'); }
  function initPayoutModal() {
    document.getElementById('payoutModalClose').addEventListener('click', closePayoutModal);
    document.getElementById('payoutModal').addEventListener('click', (e) => {
      if (e.target.id === 'payoutModal') closePayoutModal();
    });
    document.getElementById('payoutAddBtn').addEventListener('click', () => {
      const raw = currentAccount();
      if (raw.isFamily) { showToast('Ajoute le payout depuis le compte propfirm concerné, pas depuis la famille.'); return; }
      openPayoutModal();
    });
    document.getElementById('payoutSaveBtn').addEventListener('click', () => {
      const amount = parseFloat(document.getElementById('payoutAmount').value);
      if (!amount || amount <= 0) { showToast('Indique un montant valide'); return; }
      const date = document.getElementById('payoutDate').value || new Date().toISOString().slice(0, 10);
      const raw = currentAccount();
      addPayout(raw.id, amount, date);
      closePayoutModal();
      showToast('Payout ajouté ✓');
    });

    // ---- Volet repliable de la liste des payouts individuels (ferme par
    // defaut, voir setPayoutListOpen) ----
    document.getElementById('payoutListToggle').addEventListener('click', () => {
      setPayoutListOpen(!payoutListOpen);
    });

    // ---- Oeil Réel/Simulé + réglages du cycle de retrait simulé (marche
    // aussi pour une famille, voir renderPayouts) ----
    document.querySelectorAll('#payoutViewToggle button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const raw = currentAccount();
        savePayoutViewMode(raw.id, btn.dataset.view);
        renderPayouts(activeAccountData);
        renderMiniCalendar(activeAccountData);
      });
    });
    document.getElementById('payoutSettingsBtn').addEventListener('click', () => {
      const raw = currentAccount();
      const s = loadPayoutSimSettings(raw.id);
      document.getElementById('payoutSimPct').value = s.payoutPct;
      document.getElementById('payoutSimMin').value = s.minPayout;
      document.getElementById('payoutSettingsModal').classList.add('is-open');
    });
    document.getElementById('payoutSettingsClose').addEventListener('click', () => {
      document.getElementById('payoutSettingsModal').classList.remove('is-open');
    });
    document.getElementById('payoutSettingsModal').addEventListener('click', (e) => {
      if (e.target.id === 'payoutSettingsModal') document.getElementById('payoutSettingsModal').classList.remove('is-open');
    });
    document.getElementById('payoutSimSave').addEventListener('click', () => {
      const raw = currentAccount();
      const payoutPct = Math.min(100, Math.max(1, parseFloat(document.getElementById('payoutSimPct').value) || 80));
      const minPayout = Math.max(0, parseFloat(document.getElementById('payoutSimMin').value) || 0);
      savePayoutSimSettings(raw.id, { payoutPct, minPayout });
      document.getElementById('payoutSettingsModal').classList.remove('is-open');
      renderPayouts(activeAccountData);
      renderMiniCalendar(activeAccountData);
      showToast('Conditions de retrait mises à jour ✓');
    });
  }

  // ---------- Modifier les objectifs d'un compte existant - accessible a
  // tout moment depuis la carte "Trading Objectives" (bouton "Modifier"),
  // pas seulement a la creation du compte. Reprend les phases prereplies si
  // le broker/propfirm est reconnu (window.CHEST_BROKERS). Toute
  // sauvegarde ici (y compris un changement de phase) remet le suivi a zero
  // a partir d'aujourd'hui - voir evaluateChallengeObjectivesFromHistory. ----------
  let editObjectivesAccountId = null;

  function findBrokerMeta(account) {
    if (!account || !account.brokerId) return null;
    return window.CHEST_BROKERS.find((b) => b.id === account.brokerId) || null;
  }

  // Resout QUEL compte editer : le compte lui-meme, ou pour une famille, le
  // membre dont les objectifs sont deja affiches (meme regle que
  // buildFamilyAggregate/"withObjectives" - le dernier membre de la chaine
  // qui a des regles renseignees), sinon le dernier membre de la famille par
  // defaut - retour direct utilisateur du 2026-09-17 ("il manque l'onglet
  // parametre du propfirm pour mettre les conditions du pf" [depuis la vue
  // famille]).
  function resolveObjectivesAccount(raw) {
    if (!raw.isFamily) return raw;
    const fam = loadFamilies().find((f) => f.id === raw.id);
    if (!fam) return null;
    const accounts = loadAccounts();
    const members = fam.accountIds.map((id) => accounts.find((a) => a.id === id)).filter(Boolean);
    if (!members.length) return null;
    return [...members].reverse().find((a) => a.challengeObjectives) || members[members.length - 1];
  }

  function openEditObjectivesModal() {
    const raw = currentAccount();
    const target = resolveObjectivesAccount(raw);
    if (!target) { showToast("Ajoute d'abord un compte à cette famille."); return; }
    const accounts = loadAccounts();
    const acc = accounts.find((a) => a.id === target.id);
    if (!acc) return;
    editObjectivesAccountId = acc.id;
    document.getElementById('editObjectivesTitle').textContent = raw.isFamily
      ? `Objectifs du challenge — ${acc.name}` : 'Objectifs du challenge';

    const meta = findBrokerMeta(acc);
    const phaseBlock = document.getElementById('editObjectivesPhaseBlock');
    const phaseWrap = document.getElementById('editObjectivesPhase');
    const hintEl = document.getElementById('editObjectivesHint');
    if (meta && meta.kind === 'propfirm' && meta.rules) {
      phaseBlock.hidden = false;
      phaseWrap.innerHTML = `
        <button type="button" data-phase="phase1">Phase 1</button>
        <button type="button" data-phase="phase2">Phase 2</button>
        <button type="button" data-phase="funded">Financé</button>`;
      phaseWrap.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', () => {
          phaseWrap.querySelectorAll('button').forEach((b) => b.classList.remove('is-active'));
          btn.classList.add('is-active');
          const rules = meta.rules[btn.dataset.phase];
          if (rules) {
            document.getElementById('editObjMinDays').value = rules.minTradingDays ?? '';
            document.getElementById('editObjProfitTarget').value = rules.profitTargetPct ?? '';
            document.getElementById('editObjMaxDailyLoss').value = rules.maxDailyLossPct ?? '';
            document.getElementById('editObjMaxLoss').value = rules.maxLossPct ?? '';
          }
        });
      });
      hintEl.textContent = meta.rulesNote || 'Choisis la phase actuelle du challenge pour préremplir ses règles, puis ajuste si besoin.';
    } else {
      phaseBlock.hidden = true;
      phaseWrap.innerHTML = '';
      hintEl.textContent = meta ? 'Règles non répertoriées pour ce broker — renseigne-les manuellement.' : 'Renseigne les règles de ton challenge manuellement.';
    }

    const cfg = acc.challengeObjectives;
    document.getElementById('editObjMinDays').value = cfg ? cfg.minTradingDays : '';
    document.getElementById('editObjProfitTarget').value = cfg ? cfg.profitTargetPct : '';
    document.getElementById('editObjMaxDailyLoss').value = cfg ? cfg.maxDailyLossPct : '';
    document.getElementById('editObjMaxLoss').value = cfg ? cfg.maxLossPct : '';
    document.getElementById('editObjectivesModal').classList.add('is-open');
  }
  function closeEditObjectivesModal() { document.getElementById('editObjectivesModal').classList.remove('is-open'); }

  function readEditObjectives() {
    const minDays = parseFloat(document.getElementById('editObjMinDays').value);
    const profitTarget = parseFloat(document.getElementById('editObjProfitTarget').value);
    const maxDailyLoss = parseFloat(document.getElementById('editObjMaxDailyLoss').value);
    const maxLoss = parseFloat(document.getElementById('editObjMaxLoss').value);
    if ([minDays, profitTarget, maxDailyLoss, maxLoss].every((v) => isNaN(v))) return null;
    return {
      minTradingDays: isNaN(minDays) ? 0 : minDays,
      profitTargetPct: isNaN(profitTarget) ? 0 : profitTarget,
      maxDailyLossPct: isNaN(maxDailyLoss) ? 0 : maxDailyLoss,
      maxLossPct: isNaN(maxLoss) ? 0 : maxLoss,
    };
  }

  function initEditObjectivesModal() {
    document.getElementById('editObjectivesBtn').addEventListener('click', openEditObjectivesModal);
    document.getElementById('editObjectivesClose').addEventListener('click', closeEditObjectivesModal);
    document.getElementById('editObjectivesModal').addEventListener('click', (e) => {
      if (e.target.id === 'editObjectivesModal') closeEditObjectivesModal();
    });
    document.getElementById('editObjectivesSave').addEventListener('click', () => {
      const accounts = loadAccounts();
      const acc = accounts.find((a) => a.id === editObjectivesAccountId);
      if (!acc) return;
      acc.challengeObjectives = readEditObjectives();
      acc.isPropfirm = !!acc.challengeObjectives;
      acc.objectivesResetAt = isoDateLocal(new Date());
      saveAccounts(accounts);
      closeEditObjectivesModal();
      renderAll();
      showToast('Objectifs mis à jour ✓');
    });
    document.getElementById('editObjectivesClear').addEventListener('click', () => {
      const accounts = loadAccounts();
      const acc = accounts.find((a) => a.id === editObjectivesAccountId);
      if (!acc) return;
      acc.challengeObjectives = null;
      acc.objectivesResetAt = isoDateLocal(new Date());
      saveAccounts(accounts);
      closeEditObjectivesModal();
      renderAll();
      showToast('Objectifs retirés ✓');
    });
  }

  // Renvoie null quand il n'y a ni compte ni famille (etat vide, voir
  // renderAll()) — ne plus supposer accounts[0] toujours present depuis le
  // retrait des comptes de demonstration (2026-09-23).
  function currentAccount() {
    const accounts = loadAccounts();
    const id = activeId(accounts);
    if (id === null) return null;
    const fam = loadFamilies().find((f) => f.id === id);
    if (fam) {
      return { id: fam.id, name: fam.name, number: `${fam.accountIds.length} comptes`, type: 'Famille', isFamily: true, example: false, balance: 0, equity: 0, pnl: 0, today: 0 };
    }
    return accounts.find((a) => a.id === id) || accounts[0] || null;
  }

  // Vue agregee d'une famille : somme reelle des comptes qui la composent
  // (Phase 1 + Phase 2 + Finance, ou tout regroupement) - jamais de donnee
  // inventee : rr/winrate ne sont pas calculables proprement au niveau
  // agrege (comptes heterogenes), affiches honnetement en "—" plutot que
  // moyennes trompeuses. Les comptes Myfxbook membres sont resynchronises
  // avant d'etre sommes.
  // "today" recompose depuis dailyHistory (deja fusionne reel+backtest avec
  // priorite au reel) plutot que sommee/lue separement - meme convention
  // partout (individuel ET famille), c'est exactement le sens de "les infos
  // doivent cohordonner".
  function todayPnlFromHistory(dailyHistory) {
    const todayIso = isoDateLocal(new Date());
    const entry = (dailyHistory || []).find((d) => d.date === todayIso);
    return entry ? entry.pnl : 0;
  }

  async function buildFamilyAggregate(fam, accounts) {
    const rawMembers = fam.accountIds.map((id) => accounts.find((a) => a.id === id)).filter(Boolean);
    const members = await Promise.all(rawMembers.map((a) => (a.myfxbook ? enrichWithMyfxbook(a) : a)));

    const sum = (key) => members.reduce((s, a) => s + (a[key] || 0), 0);
    const balance = sum('balance'), equity = sum('equity'), pnl = sum('pnl');

    const isPropfirm = members.some((a) => a.isPropfirm);
    const includeBacktest = !loadSimpleMode();
    // Historique jour par jour DE LA FAMILLE (reel de chaque membre + le
    // backtest choisi POUR LA FAMILLE, jamais celui d'un membre individuel -
    // voir buildFamilyDailyHistory) : source unique pour Semaine/Mois/Annee
    // ET pour les Objectifs, exactement comme un compte individuel. Recale
    // sur le solde reel actuel (voir rescaleDailyHistoryPnl) - meme correctif
    // que le compte individuel.
    const dailyHistory = rescaleDailyHistoryPnl(buildFamilyDailyHistory(fam, members, isPropfirm, includeBacktest), balance);
    const today = todayPnlFromHistory(dailyHistory);

    // Objectifs : reprend la config du DERNIER compte de la chaine qui en a
    // une renseignee (represente en general la phase actuelle du challenge),
    // evalues sur l'historique jour par jour de la FAMILLE depuis son propre
    // point de reset (payout/changement de phase le plus recent parmi les
    // membres).
    const withObjectives = [...members].reverse().find((a) => a.challengeObjectives);
    const resetAt = withObjectives ? withObjectives.objectivesResetAt : null;
    const objectives = withObjectives
      ? evaluateChallengeObjectivesFromHistory(withObjectives.challengeObjectives, dailyHistory, resetAt)
      : null;

    // Payouts : simple reunion des payouts de chaque compte propfirm membre
    // (chacun garde son historique propre, on ne fait qu'additionner pour la
    // vue famille) - purement informatif, voir renderPayouts().
    const payouts = members.flatMap((a) => (a.payouts || []).map((p) => ({ ...p, accountName: a.name })));

    // Trades unifies : ceux de CHAQUE membre myfxbook reel + le backtest
    // choisi POUR LA FAMILLE (openBacktestPicker('family', ...)) une seule
    // fois - jamais le backtest individuel d'un membre, qui ne s'applique
    // qu'a sa propre vue (intention deja en place avant ce refactor).
    const riskPct = fixedRiskPercent();
    const trades = members.filter((a) => a.myfxbook).flatMap((a) => realTradesWithRR(a.id, a.history, riskPct, a.balance));
    let backtestLinkedTitle = null;
    if (includeBacktest && fam.startBacktestId) {
      const bt = window.CHESTBacktests && CHESTBacktests.get(fam.startBacktestId);
      if (bt && window.CHESTBacktestEngine) {
        const riskConfig = (isPropfirm && bt.pf) ? bt.pf : bt.cp;
        trades.push(...backtestTradesList(bt, riskConfig));
        backtestLinkedTitle = bt.title;
      }
    }
    // Courbe intra-journee "Jour" : combine les vrais trades de TOUS les
    // membres myfxbook, retries chronologiquement par leur horodatage reel
    // de cloture (voir intradayCurveFromTrades).
    const combinedHistory = members.filter((a) => a.myfxbook && a.history).flatMap((a) => a.history);
    const periods = computeAllPeriods(dailyHistory, balance, trades, combinedHistory, backtestLinkedTitle);

    return {
      id: fam.id, name: fam.name, number: `${members.length} compte${members.length > 1 ? 's' : ''}`, type: 'Famille',
      isFamily: true, example: members.length ? members.every((a) => a.example) : true,
      balance, equity, pnl, today, periods, objectives, payouts, isPropfirm,
      dailyHistory,
    };
  }

  async function refreshActiveAccount() {
    const raw = currentAccount();
    if (raw.isFamily) {
      const fam = loadFamilies().find((f) => f.id === raw.id);
      activeAccountData = fam ? await buildFamilyAggregate(fam, loadAccounts()) : raw;
      return;
    }
    activeAccountData = raw.myfxbook ? await enrichWithMyfxbook(raw) : raw;

    // Compte reel (myfxbook) et/ou lie a un backtest de depart : UN seul
    // pipeline pour construire dailyHistory + les 4 periodes + les objectifs
    // (retour direct utilisateur du 2026-09-16/17 : "les infos doivent
    // cohordonner, utilise le backtesting + le reel et affiche un resultat
    // logique"). Sans myfxbook ni backtest, `activeAccountData.periods` reste
    // absent et `render()` retombe sur SAMPLE_PERIODS (compte de demo).
    if (activeAccountData.myfxbook || activeAccountData.startBacktestId) {
      const includeBacktest = !loadSimpleMode();
      activeAccountData.dailyHistory = rescaleDailyHistoryPnl(
        buildDailyHistory(activeAccountData, includeBacktest), activeAccountData.balance);
      activeAccountData.today = todayPnlFromHistory(activeAccountData.dailyHistory);
      const riskPct = fixedRiskPercent();
      const trades = unifiedTradesList(activeAccountData, riskPct, includeBacktest);
      let backtestLinkedTitle = null;
      if (includeBacktest && activeAccountData.startBacktestId) {
        const bt = window.CHESTBacktests && CHESTBacktests.get(activeAccountData.startBacktestId);
        if (bt) backtestLinkedTitle = bt.title;
      }
      activeAccountData.periods = computeAllPeriods(
        activeAccountData.dailyHistory, activeAccountData.balance, trades, activeAccountData.history, backtestLinkedTitle);
      if (activeAccountData.challengeObjectives) {
        activeAccountData.objectives = evaluateChallengeObjectivesFromHistory(
          activeAccountData.challengeObjectives, activeAccountData.dailyHistory, activeAccountData.objectivesResetAt);
      }
    }
  }

  function render(period) {
    const a = activeAccountData || currentAccount();
    const d = (a.periods || SAMPLE_PERIODS)[period];
    document.getElementById('kpiProfit').textContent = d.profit;
    document.getElementById('kpiProfitSub').textContent = d.profitSub;
    const profitDollarEl = document.getElementById('kpiProfitDollar');
    profitDollarEl.textContent = d.profitDollar || '—';
    profitDollarEl.classList.toggle('is-pos', String(d.profitDollar || '').startsWith('+'));
    profitDollarEl.classList.toggle('is-neg', String(d.profitDollar || '').startsWith('-') || String(d.profitDollar || '').startsWith('−'));
    document.getElementById('kpiProfitDollarSub').textContent = d.profitDollarSub || '—';
    document.getElementById('kpiRR').textContent = d.rr;
    document.getElementById('kpiWinrate').textContent = d.winrate;
    document.getElementById('kpiWinrateSub').textContent = d.winrateSub;
    document.getElementById('kpiDD').textContent = d.dd;
    document.getElementById('kpiDDSub').textContent = d.ddSub;
    document.getElementById('kpiTradedDays').textContent = d.tradedDays ?? '—';
    document.getElementById('kpiTradedDaysSub').textContent = d.tradedDaysSub || '—';
    drawChart(d);
  }

  // Degrade "chaleur" neon, en 2 phases (retour direct utilisateur du
  // 2026-09-16, 3e passe - le degrade precedent etait "grossier", avec un
  // fondu commencant trop tot) :
  //  1) PLATEAU : opacite MAX constante du sommet jusqu'a mi-chemin de zero
  //     (couleur "classique" pleine, sans aucun fondu).
  //  2) FONDU : de ce point jusqu'a la ligne 0 (0% ou 0$ litteral), fondu
  //     LINEAIRE jusqu'a une opacite VRAIMENT nulle pile sur la ligne 0 -
  //     jamais de plancher non-nul, la couleur reste verte (ou rouge) tout
  //     du long, seule l'opacite change.
  // Beaucoup de crans (STEPS) pour un degrade lisse, sans bandes visibles.
  const NEON_GREEN = [51, 230, 166], NEON_RED = [255, 77, 94];
  const PLATEAU = 0.5; // portion (0..1) du sommet a la ligne 0 qui reste a opacite max
  const GRAD_STEPS = 28;
  function rgbaColor(c, a) { return `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`; }
  function plateauOpacity(t, peak) {
    if (t <= PLATEAU) return peak;
    return peak * (1 - (t - PLATEAU) / (1 - PLATEAU));
  }
  function addPlateauStops(grad, fromOffset, toOffset, peak, color) {
    for (let i = 0; i <= GRAD_STEPS; i++) {
      const t = i / GRAD_STEPS;
      const offset = fromOffset + (toOffset - fromOffset) * t;
      grad.addColorStop(Math.max(0, Math.min(1, offset)), rgbaColor(color, plateauOpacity(t, peak)));
    }
  }
  function buildHeatGradient(chartInstance, series, forLine) {
    const { ctx: c2d, chartArea, scales } = chartInstance;
    if (!chartArea) return forLine ? '#33e6a6' : 'rgba(51,230,166,.1)';
    const grad = c2d.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    const peak = forLine ? 1 : 0.85;
    const maxV = Math.max(...series, 0), minV = Math.min(...series, 0);
    if (maxV <= 0) { addPlateauStops(grad, 1, 0, peak, NEON_RED); return grad; }
    if (minV >= 0) { addPlateauStops(grad, 0, 1, peak, NEON_GREEN); return grad; }
    const zeroY = scales.y.getPixelForValue(0);
    const span = chartArea.bottom - chartArea.top;
    let zeroT = span ? (zeroY - chartArea.top) / span : 0.5;
    zeroT = Math.max(0.04, Math.min(0.96, zeroT));
    addPlateauStops(grad, 0, zeroT, peak, NEON_GREEN);
    addPlateauStops(grad, 1, zeroT, peak, NEON_RED);
    return grad;
  }
  // Lueur neon : une 2e passe de trait plus epais + flou (canvas
  // shadowBlur), dessinee EN DESSOUS du trait net, en reutilisant le MEME
  // degrade que le trait principal (pas une teinte unique globale) - la
  // lueur suit donc exactement la couleur locale (verte au-dessus de 0,
  // rouge en-dessous), au lieu d'une lueur verte qui debordait sur les
  // portions rouges (retour direct utilisateur du 2026-09-16, "autour du
  // rouge j'ai du vert"). Flou/epaisseur reduits (etait trop "grossier").
  const neonGlowPlugin = {
    id: 'neonGlow',
    beforeDatasetDraw(c, args) {
      if (!args.meta.dataset || args.index !== 0) return;
      c.ctx.save();
      c.ctx.shadowColor = 'rgba(160,255,220,.4)';
      c.ctx.shadowBlur = 7;
    },
    afterDatasetDraw(c, args) { if (args.index === 0) c.ctx.restore(); },
  };

  function drawChart(d) {
    const isDark = true; // le thème clair inverse la page entière : les graphiques restent dessinés pour un fond sombre
    const grid = isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.07)';
    const tick = isDark ? '#9b9ba1' : '#65656b';

    const base = d.equity[0] || 1;
    const series = unit === 'percent' ? d.equity.map((v) => ((v - base) / base * 100)) : d.equity;
    // Echelle de temps coherente par periode (retour direct utilisateur du
    // 2026-09-17 : "le graphique doit afficher une echelle de temps
    // coherente, en jour par rapport a l'heure, semaine/mois/annee par
    // vraies dates") - `d.labels` vient de periodStatsFromCurve/
    // formatPeriodLabel ; un compte de demo (SAMPLE_PERIODS) n'a pas de
    // vraies dates, on retombe honnetement sur un index plutot que d'en
    // inventer.
    const labels = d.labels || series.map((_, i) => i + 1);

    const ctx = document.getElementById('equityChart');
    if (!ctx || !window.Chart) return;
    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { // passe de lueur (large, floue, sans remplissage) - dessinee en dessous
            data: series, borderWidth: 5, pointRadius: 0, tension: .3, fill: false,
            borderColor: (c) => buildHeatGradient(c.chart, series, true),
          },
          { // trait net + remplissage, par-dessus
            data: series, borderWidth: 2.5, pointRadius: 0, tension: .3, fill: true,
            borderColor: (c) => buildHeatGradient(c.chart, series, true),
            backgroundColor: (c) => buildHeatGradient(c.chart, series, false),
          },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { grid: { color: grid }, ticks: { color: tick, callback: (v) => unit === 'percent' ? v.toFixed(1) + '%' : '$' + v } },
          x: { grid: { display: false }, ticks: { color: tick, maxTicksLimit: 8 } }
        }
      },
      plugins: [neonGlowPlugin],
    });
  }

  function closeMenu() { document.getElementById('accMenu').classList.remove('is-open'); }

  // ---------- Assistant "Ajouter un compte" — Myfxbook uniquement (retour
  // direct utilisateur du 2026-09-15 : le choix MT5-local a ete retire, trop
  // de friction face a Myfxbook qui ne demande aucun logiciel). Specifique a
  // CHAQUE compte du Dashboard, contrairement a CHESTBerich (une seule
  // connexion partagee pour Stratégies/BERICH). ----------

  let pendingFamilyId = null;

  let chosenBroker = null; // {id, name} ou {id:'other', name: <saisi>} - meme convention que le wizard BERICH
  let chosenAccountKind = 'own'; // 'own' | 'propfirm' - conditionne l'affichage des payouts et le choix cp/pf du backtest de depart
  // 'myfxbook' | 'live' (2026-09-27, demande utilisateur : reserve admin - voir addAccountModeToggle) -
  // conditionne quel bloc s'affiche (mfxStepIntro/liveStepIntro) et ce que fait "Ajouter le compte".
  let chosenAddMode = 'myfxbook';
  let liveCredentials = null; // {login, password, server} - jamais persiste, juste le temps du flux d'ajout

  function mt5ApiBase() { return (window.CHEST_CONFIG && window.CHEST_CONFIG.accountsApiUrl) || 'http://localhost:8080'; }
  function mt5AuthHeaders() {
    const t = window.CHESTAccounts && CHESTAccounts.getToken && CHESTAccounts.getToken();
    return t ? { Authorization: 'Bearer ' + t } : {};
  }

  // Backtest de depart (optionnel) : la liste vient de CHESTBacktests, donc
  // repopulee a chaque ouverture pour refleter les backtests ajoutes/supprimes
  // depuis backtesting.html entre-temps.
  function populateBacktestSelect() {
    const select = document.getElementById('addAccountBacktest');
    const items = (window.CHESTBacktests && window.CHESTBacktests.list()) || [];
    select.innerHTML = '<option value="">Aucun — nouveau compte, pas d\'historique</option>'
      + items.map((b) => `<option value="${b.id}">${b.title}</option>`).join('');
  }

  let chosenPhase = null; // 'phase1' | 'phase2' | 'funded' | null - propfirm reconnue uniquement

  // Compte Live = un compte du Journal (2026-09-27, demande utilisateur : plus de famille pour ce
  // chemin, "ca va etre les journaux qui sont directement a connecter"). pendingLiveJournalId
  // pointe un id CHESTJournal.listAccounts() (existant OU tout juste créé depuis cet écran).
  let pendingLiveJournalId = null;
  let pendingLiveStage = null; // 'p1'|'p2'|'funded'|null (null = compte propre, pas de phase)

  const LIVE_CONNECT_RESUME_KEY = 'chest_live_connect_resume'; // voir liveJournalNewBtn + boot()

  function openAddAccountModal(familyId) {
    pendingFamilyId = familyId || null;
    chosenBroker = null;
    chosenAccountKind = 'own';
    chosenPhase = null;
    chosenAddMode = 'myfxbook';
    liveCredentials = null;
    pendingLiveJournalId = null;
    pendingLiveStage = null;
    document.querySelectorAll('#accountKindToggle button').forEach((b) => b.classList.toggle('is-active', b.dataset.kind === 'own'));
    document.getElementById('accountKindBlock').hidden = true;
    document.getElementById('objectivesStepBlock').hidden = true;
    document.getElementById('addAccountPhaseBlock').hidden = true;
    document.querySelectorAll('#addAccountPhaseToggle button').forEach((b) => b.classList.remove('is-active'));
    document.getElementById('addAccountRulesNote').textContent = '';
    populateBacktestSelect();
    document.getElementById('addAccountBacktest').value = '';
    // "Compte Live" reserve admin (2026-09-27) - un seul terminal MT5 partage, voir README de
    // mt5-notify-bridge. Invisible pour un membre de la famille, comme s'il n'existait pas.
    const isAdmin = window.CHESTAccounts && CHESTAccounts.isAdmin && CHESTAccounts.isAdmin();
    document.getElementById('addAccountModeToggle').hidden = !isAdmin;
    document.querySelectorAll('#addAccountModeToggle button').forEach((b) => b.classList.toggle('is-active', b.dataset.mode === 'myfxbook'));
    document.getElementById('liveJournalStep').hidden = true;
    document.getElementById('liveStageStep').hidden = true;
    document.getElementById('liveStepIntro').hidden = true;
    document.getElementById('liveLogin').value = '';
    document.getElementById('livePassword').value = '';
    document.getElementById('liveServer').value = '';
    document.getElementById('liveConnectError').style.display = 'none';
    document.getElementById('mfxStepIntro').hidden = false;
    document.getElementById('mfxDetailsStep').hidden = true;
    // Preremplit avec le dernier identifiant Myfxbook connecte avec succes (voir saveLastMfxLogin) -
    // toujours modifiable si on ajoute un compte d'un AUTRE profil Myfxbook.
    const lastMfx = loadLastMfxLogin();
    document.getElementById('mfxEmail').value = (lastMfx && lastMfx.email) || '';
    document.getElementById('mfxPassword').value = (lastMfx && lastMfx.password) || '';
    document.getElementById('mfxLoginError').style.display = 'none';
    document.getElementById('mfxLoginForm').hidden = false;
    document.getElementById('mfxAccountsPicker').hidden = true;
    document.getElementById('addAccountBrokerOther').value = '';
    document.getElementById('addAccountBrokerOther').style.display = 'none';
    ['objMinDays', 'objProfitTarget', 'objMaxDailyLoss', 'objMaxLoss'].forEach((id) => { document.getElementById(id).value = ''; });
    document.querySelectorAll('#addAccountBrokerGrid .broker-card-sm').forEach((c) => c.classList.remove('is-selected'));
    document.getElementById('addAccountModal').classList.add('is-open');
  }
  function closeAddAccountModal() {
    document.getElementById('addAccountModal').classList.remove('is-open');
  }

  // Supprimer un compte ou une famille (2026-09-24, demande utilisateur) - CHESTConfirm() plutôt
  // qu'un window.confirm() natif, qui ne fonctionne pas dans ce panneau d'aperçu intégré (voir
  // js/confirm-dialog.js, même piège déjà rencontré sur "Nouvelle famille").
  async function deleteAccount(id) {
    const accounts = loadAccounts();
    const account = accounts.find((a) => a.id === id);
    if (!account) return;
    if (!(await CHESTConfirm(`Supprimer définitivement le compte "${account.name}" ? Cette action est irréversible.`))) return;
    saveAccounts(accounts.filter((a) => a.id !== id));
    const families = loadFamilies();
    let touched = false;
    families.forEach((fam) => {
      const idx = fam.accountIds.indexOf(id);
      if (idx !== -1) { fam.accountIds.splice(idx, 1); touched = true; }
    });
    if (touched) saveFamilies(families);
    if (localStorage.getItem(ACTIVE_KEY) === id) localStorage.removeItem(ACTIVE_KEY);
    closeMenu();
    renderAll();
    showToast('Compte supprimé');
  }
  // Supprime la famille elle-même, jamais ses comptes membres — ils redeviennent des comptes seuls
  // (plus destructeur qu'utile de faire disparaître de vraies données de trading en même temps
  // qu'un simple regroupement ; l'utilisateur peut ensuite les supprimer un par un s'il le veut).
  async function deleteFamily(id) {
    const families = loadFamilies();
    const fam = families.find((f) => f.id === id);
    if (!fam) return;
    if (!(await CHESTConfirm(`Supprimer la famille "${fam.name}" ? Ses comptes ne seront pas supprimés — ils redeviendront des comptes seuls.`))) return;
    saveFamilies(families.filter((f) => f.id !== id));
    openFamilyIds.delete(id);
    if (localStorage.getItem(ACTIVE_KEY) === id) localStorage.removeItem(ACTIVE_KEY);
    closeMenu();
    renderAll();
    showToast('Famille supprimée');
  }

  function finalizeNewAccount(fields, presetId) {
    const accounts = loadAccounts().filter((a) => a.id !== 'mt5-live' && a.id !== 'live-swann');
    const id = presetId || ('acc-' + Date.now());
    accounts.push({ id, ...fields });
    saveAccounts(accounts);
    if (pendingFamilyId) {
      const families = loadFamilies();
      const fam = families.find((f) => f.id === pendingFamilyId);
      if (fam) { fam.accountIds.push(id); saveFamilies(families); }
    }
    localStorage.setItem(ACTIVE_KEY, id);
    closeAddAccountModal();
    closeMenu();
    renderAll();
    showToast('Compte ajouté ✓');
  }

  function readObjectives() {
    const minDays = parseFloat(document.getElementById('objMinDays').value);
    const profitTarget = parseFloat(document.getElementById('objProfitTarget').value);
    const maxDailyLoss = parseFloat(document.getElementById('objMaxDailyLoss').value);
    const maxLoss = parseFloat(document.getElementById('objMaxLoss').value);
    // Rien de rempli -> pas de regles de challenge pour ce compte (compte
    // perso classique) : on garde `null`, jamais de fausses regles inventees.
    if ([minDays, profitTarget, maxDailyLoss, maxLoss].every((v) => isNaN(v))) return null;
    return {
      minTradingDays: isNaN(minDays) ? 0 : minDays,
      profitTargetPct: isNaN(profitTarget) ? 0 : profitTarget,
      maxDailyLossPct: isNaN(maxDailyLoss) ? 0 : maxDailyLoss,
      maxLossPct: isNaN(maxLoss) ? 0 : maxLoss,
    };
  }

  function initAddAccountModal() {
    document.getElementById('addAccountClose').addEventListener('click', closeAddAccountModal);
    document.getElementById('addAccountModal').addEventListener('click', (e) => {
      if (e.target.id === 'addAccountModal') closeAddAccountModal();
    });

    // Grille de brokers (meme liste que le wizard BERICH/Stratégies, window.CHEST_BROKERS)
    // - identite du compte par broker+numero, plus de nom libre a taper.
    const brokerGrid = document.getElementById('addAccountBrokerGrid');
    brokerGrid.innerHTML = window.CHEST_BROKERS.map((b) => `
      <button type="button" class="broker-card-sm" data-broker-id="${b.id}">
        <img src="${chestBrokerLogo(b.domain)}" alt="" onerror="this.remove()">
        <span>${b.name}</span>
      </button>`).join('') + `
      <button type="button" class="broker-card-sm" data-broker-id="other">
        <span class="broker-card-sm__icon">✎</span>
        <span>Autre</span>
      </button>`;
    // Reinitialise le bloc "Objectifs" pour refleter le broker choisi -
    // un broker classique (kind:'broker') n'ouvre JAMAIS les parametres de
    // propfirm, un propfirm reconnu (kind:'propfirm') affiche direct les
    // boutons de phase prereplis - retour direct utilisateur du 2026-09-16
    // ("quand on choisit le broker, ca n'ouvre pas les parametres de
    // propfirm ; quand je choisis une propfirm, ca me met le volet avec les
    // parametres preremplis selon la phase").
    function applyBrokerObjectivesUI(b) {
      const kindBlock = document.getElementById('accountKindBlock');
      const objBlock = document.getElementById('objectivesStepBlock');
      const phaseBlock = document.getElementById('addAccountPhaseBlock');
      const noteEl = document.getElementById('addAccountRulesNote');
      document.querySelectorAll('#addAccountPhaseToggle button').forEach((btn) => btn.classList.remove('is-active'));
      chosenPhase = null;
      if (b && b.kind === 'propfirm') {
        chosenAccountKind = 'propfirm';
        kindBlock.hidden = true;
        objBlock.hidden = false;
        phaseBlock.hidden = !b.rules;
        noteEl.textContent = b.rulesNote || '';
        ['objMinDays', 'objProfitTarget', 'objMaxDailyLoss', 'objMaxLoss'].forEach((id) => { document.getElementById(id).value = ''; });
      } else if (b && b.kind === 'broker') {
        chosenAccountKind = 'own';
        kindBlock.hidden = true;
        objBlock.hidden = true;
      } else {
        // "Autre" - kind inconnu, l'utilisateur tranche lui-meme.
        kindBlock.hidden = false;
        document.querySelectorAll('#accountKindToggle button').forEach((btn) => btn.classList.toggle('is-active', btn.dataset.kind === 'own'));
        chosenAccountKind = 'own';
        objBlock.hidden = true;
        phaseBlock.hidden = true;
        noteEl.textContent = '';
      }
    }

    brokerGrid.querySelectorAll('.broker-card-sm').forEach((card) => {
      card.addEventListener('click', () => {
        brokerGrid.querySelectorAll('.broker-card-sm').forEach((c) => c.classList.remove('is-selected'));
        card.classList.add('is-selected');
        const id = card.dataset.brokerId;
        const otherInput = document.getElementById('addAccountBrokerOther');
        if (id === 'other') {
          chosenBroker = { id: 'other', name: '' };
          otherInput.style.display = '';
          otherInput.focus();
          applyBrokerObjectivesUI(null);
        } else {
          const b = window.CHEST_BROKERS.find((x) => x.id === id);
          chosenBroker = { id: b.id, name: b.name, kind: b.kind, rules: b.rules };
          otherInput.style.display = 'none';
          applyBrokerObjectivesUI(b);
        }
      });
    });
    document.getElementById('addAccountBrokerOther').addEventListener('input', (e) => {
      if (chosenBroker && chosenBroker.id === 'other') chosenBroker.name = e.target.value.trim();
    });

    document.querySelectorAll('#accountKindToggle button').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#accountKindToggle button').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        chosenAccountKind = btn.dataset.kind;
        document.getElementById('objectivesStepBlock').hidden = chosenAccountKind !== 'propfirm';
      });
    });

    document.querySelectorAll('#addAccountPhaseToggle button').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#addAccountPhaseToggle button').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        chosenPhase = btn.dataset.phase;
        const rules = chosenBroker && chosenBroker.rules && chosenBroker.rules[chosenPhase];
        if (rules) {
          document.getElementById('objMinDays').value = rules.minTradingDays ?? '';
          document.getElementById('objProfitTarget').value = rules.profitTargetPct ?? '';
          document.getElementById('objMaxDailyLoss').value = rules.maxDailyLossPct ?? '';
          document.getElementById('objMaxLoss').value = rules.maxLossPct ?? '';
        }
      });
    });

    document.getElementById('mfxDetailsBack').addEventListener('click', () => {
      document.getElementById('mfxDetailsStep').hidden = true;
      document.getElementById('mfxStepIntro').hidden = false;
    });

    document.getElementById('addAccountFinish').addEventListener('click', () => {
      // Le mode Live ne passe plus par cet ecran/bouton (voir liveConnectBtn plus bas) - il se
      // rattache a un compte du Journal, qui porte deja son propre broker/phase/regles.
      if (chosenAddMode === 'live') return;
      if (!chosenBroker || !chosenBroker.name) { showToast('Choisis un broker/propfirm'); return; }
      if (!mfxSelected) return;
      const startBacktestId = document.getElementById('addAccountBacktest').value || null;
      const email = document.getElementById('mfxEmail').value.trim();
      const password = document.getElementById('mfxPassword').value;
      finalizeNewAccount({
        name: `${chosenBroker.name} · #${mfxSelected.id}`, number: String(mfxSelected.id),
        type: mfxSelected.demo ? 'Démo' : 'Réel', broker: chosenBroker.name, brokerId: chosenBroker.id,
        balance: parseFloat(mfxSelected.balance) || 0, equity: parseFloat(mfxSelected.equity) || 0, pnl: 0, today: 0,
        example: false, myfxbook: { email, password, accountId: mfxSelected.id },
        challengeObjectives: readObjectives(), isPropfirm: chosenAccountKind === 'propfirm',
        startBacktestId, payouts: [], objectivesResetAt: isoDateLocal(new Date()),
      });
    });

    // ---- Choix Myfxbook / Compte Live (2026-09-27) ----
    document.querySelectorAll('#addAccountModeToggle button').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#addAccountModeToggle button').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        chosenAddMode = btn.dataset.mode;
        document.getElementById('mfxStepIntro').hidden = chosenAddMode !== 'myfxbook';
        document.getElementById('liveJournalStep').hidden = chosenAddMode !== 'live';
        document.getElementById('liveStageStep').hidden = true;
        document.getElementById('liveStepIntro').hidden = true;
        document.getElementById('mfxDetailsStep').hidden = true;
        if (chosenAddMode === 'live') renderLiveJournalPicker();
      });
    });

    // ---- Compte Live : rattachement a un compte du Journal (2026-09-27) ----
    // "on va oublier les familles, ca va etre les journaux qui sont directement a connecter" -
    // le Journal (js/journal-store.js, deja riche : propfirm/modele/phase/regles verifiees) devient
    // la source de verite pour "ce que trade ce compte" ; le Dashboard n'est plus qu'un miroir
    // (chest_accounts) tagué `journalAccountId` pour continuer a s'afficher normalement.
    function stageLabelFor(acc) {
      if (!acc || acc.type !== 'propfirm' || !acc.modelId) return null;
      const models = window.CHESTJournal.challengeModels(acc.propfirmId);
      const model = models.find((m) => m.id === acc.modelId);
      if (!model) return null;
      const stages = window.CHESTJournal.stageList(model);
      return (stages.find((s) => s.id === acc.stage) || {}).label || null;
    }
    function nextStageAfter(acc) {
      const models = window.CHESTJournal.challengeModels(acc.propfirmId);
      const model = models.find((m) => m.id === acc.modelId);
      if (!model) return acc.stage;
      const stages = window.CHESTJournal.stageList(model);
      const i = stages.findIndex((s) => s.id === acc.stage);
      return i === -1 || i === stages.length - 1 ? acc.stage : stages[i + 1].id;
    }
    function renderLiveJournalPicker() {
      const list = document.getElementById('liveJournalList');
      const accounts = (window.CHESTJournal && window.CHESTJournal.listAccounts()) || [];
      if (!accounts.length) {
        list.innerHTML = '<p class="hint">Aucun compte dans le Journal pour l\'instant.</p>';
        return;
      }
      list.innerHTML = accounts.map((a) => {
        const stage = stageLabelFor(a);
        const live = a.mt5Live ? ' · <b style="color:var(--green)">🟢 connecté</b>' : '';
        return `<button type="button" class="mfx-account-row" data-id="${a.id}">
          <span><strong>${a.name}</strong><span>${a.type === 'propfirm' ? 'Propfirm' : 'Compte propre'}${stage ? ' · ' + stage : ''}${live}</span></span>
        </button>`;
      }).join('');
      list.querySelectorAll('.mfx-account-row').forEach((row) => {
        row.addEventListener('click', () => selectJournalForLive(accounts.find((a) => a.id === row.dataset.id)));
      });
    }
    function selectJournalForLive(acc) {
      pendingLiveJournalId = acc.id;
      document.getElementById('liveJournalStep').hidden = true;
      if (acc.type === 'propfirm' && acc.modelId) {
        const models = window.CHESTJournal.challengeModels(acc.propfirmId);
        const model = models.find((m) => m.id === acc.modelId);
        const stages = model ? window.CHESTJournal.stageList(model) : [{ id: 'p1', label: 'Phase 1' }];
        const suggested = nextStageAfter(acc);
        pendingLiveStage = suggested;
        document.getElementById('liveStageHint').textContent = `"${acc.name}" est actuellement en ${stageLabelFor(acc) || 'phase 1'}. À quelle phase te connectes-tu maintenant ? (par défaut : la suivante — change si besoin, même pour revenir sur une phase déjà passée)`;
        document.getElementById('liveStageToggle').innerHTML = stages.map((s) => `<button type="button" data-stage="${s.id}" class="${s.id === suggested ? 'is-active' : ''}">${s.label}</button>`).join('');
        document.querySelectorAll('#liveStageToggle button').forEach((b) => b.addEventListener('click', () => {
          document.querySelectorAll('#liveStageToggle button').forEach((x) => x.classList.remove('is-active'));
          b.classList.add('is-active');
          pendingLiveStage = b.dataset.stage;
        }));
        document.getElementById('liveStageStep').hidden = false;
      } else {
        pendingLiveStage = null;
        showLiveStepIntro(acc);
      }
    }
    function showLiveStepIntro(acc) {
      document.getElementById('liveStageStep').hidden = true;
      document.getElementById('liveJournalSummary').textContent = `Connexion pour : ${acc.name}${pendingLiveStage ? ' · ' + (stageLabelFor(Object.assign({}, acc, { stage: pendingLiveStage })) || pendingLiveStage) : ''}`;
      document.getElementById('liveStepIntro').hidden = false;
    }
    document.getElementById('liveJournalNewBtn').addEventListener('click', () => {
      // Reutilise l'ecran de creation de compte DEJA riche de journal.html (propfirm, modele,
      // phase, regles verifiees, tailles de compte...) plutot que de le dupliquer ici - on y va,
      // et on revient automatiquement finir la connexion Live une fois le compte cree (voir
      // journal.html, jaSave, et le "resume" plus bas dans ce fichier).
      try { localStorage.setItem(LIVE_CONNECT_RESUME_KEY, '1'); } catch (e) { /* tant pis */ }
      window.location.href = 'journal.html?fromLiveConnect=1';
    });
    document.getElementById('liveStageBack').addEventListener('click', () => {
      document.getElementById('liveStageStep').hidden = true;
      document.getElementById('liveJournalStep').hidden = false;
    });
    document.getElementById('liveStageNext').addEventListener('click', () => {
      const acc = window.CHESTJournal.listAccounts().find((a) => a.id === pendingLiveJournalId);
      if (acc) showLiveStepIntro(acc);
    });
    document.getElementById('liveIntroBack').addEventListener('click', () => {
      document.getElementById('liveStepIntro').hidden = true;
      const acc = window.CHESTJournal.listAccounts().find((a) => a.id === pendingLiveJournalId);
      if (acc && acc.type === 'propfirm' && acc.modelId) document.getElementById('liveStageStep').hidden = false;
      else document.getElementById('liveJournalStep').hidden = false;
    });

    document.getElementById('liveConnectBtn').addEventListener('click', async () => {
      const login = document.getElementById('liveLogin').value.trim();
      const password = document.getElementById('livePassword').value;
      const server = document.getElementById('liveServer').value.trim();
      const errEl = document.getElementById('liveConnectError');
      if (!login || !password || !server) {
        errEl.textContent = 'Numéro de compte, mot de passe investisseur et serveur sont requis.';
        errEl.style.display = '';
        return;
      }
      const journalAcc = window.CHESTJournal.listAccounts().find((a) => a.id === pendingLiveJournalId);
      if (!journalAcc) { errEl.textContent = 'Compte du Journal introuvable — recommence.'; errEl.style.display = ''; return; }
      errEl.style.display = 'none';
      const btn = document.getElementById('liveConnectBtn');
      btn.disabled = true;
      const prevLabel = btn.textContent;
      btn.textContent = 'Connexion au terminal…';
      try {
        const res = await fetch(mt5ApiBase() + '/mt5/connect', {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, mt5AuthHeaders()),
          body: JSON.stringify({ login, investorPassword: password, server, dashboardAccountId: journalAcc.id }),
        });
        const body = await res.json();
        if (!res.ok || body.error) throw new Error(body.error || 'Échec de connexion au terminal MT5.');
        const info = body.accountInfo || {};
        // Le Journal est la source de verite (nom, propfirm, phase) - le Dashboard n'est qu'un
        // miroir affichable, tague `journalAccountId` pour le retrouver au prochain changement.
        window.CHESTJournal.updateAccount(journalAcc.id, {
          mt5Live: { login, server },
          stage: pendingLiveStage != null ? pendingLiveStage : journalAcc.stage,
        });
        const accounts = loadAccounts().filter((a) => a.journalAccountId !== journalAcc.id);
        const id = 'acc-' + Date.now();
        accounts.push({
          id, journalAccountId: journalAcc.id,
          name: journalAcc.name, number: login, type: 'Réel', broker: journalAcc.name,
          balance: info.balance || 0, equity: info.equity || 0, pnl: 0, today: 0,
          example: false, mt5Live: { login, server },
          isPropfirm: journalAcc.type === 'propfirm', payouts: [],
          objectivesResetAt: isoDateLocal(new Date()),
        });
        saveAccounts(accounts);
        localStorage.setItem(ACTIVE_KEY, id);
        closeAddAccountModal();
        closeMenu();
        renderAll();
        showToast('Compte Live connecté ✓');
      } catch (e) {
        errEl.textContent = e.message || 'Échec de connexion au terminal MT5.';
        errEl.style.display = '';
      } finally {
        btn.disabled = false;
        btn.textContent = prevLabel;
      }
    });

    // Retour automatique depuis "+ Nouveau compte du Journal" (journal.html a créé le compte et
    // renvoyé ici, voir liveJournalNewBtn) - reprend le flux Live exactement là où il s'était arrêté.
    (function resumeLiveConnectAfterJournalCreate() {
      let resumeId = null;
      try {
        if (localStorage.getItem(LIVE_CONNECT_RESUME_KEY) === '1') resumeId = localStorage.getItem(LIVE_CONNECT_RESUME_KEY + '_account');
        localStorage.removeItem(LIVE_CONNECT_RESUME_KEY);
        localStorage.removeItem(LIVE_CONNECT_RESUME_KEY + '_account');
      } catch (e) { /* tant pis */ }
      if (!resumeId || !window.CHESTJournal) return;
      const acc = window.CHESTJournal.listAccounts().find((a) => a.id === resumeId);
      if (!acc) return;
      openAddAccountModal(null);
      chosenAddMode = 'live';
      document.querySelectorAll('#addAccountModeToggle button').forEach((b) => b.classList.toggle('is-active', b.dataset.mode === 'live'));
      document.getElementById('mfxStepIntro').hidden = true;
      selectJournalForLive(acc);
    })();

    // ---- Login Myfxbook -> choix du compte -> broker/propfirm + objectifs ----
    let mfxAccounts = [];
    let mfxSelected = null;

    document.getElementById('mfxConnectBtn').addEventListener('click', async () => {
      const email = document.getElementById('mfxEmail').value.trim();
      const password = document.getElementById('mfxPassword').value;
      const errEl = document.getElementById('mfxLoginError');
      errEl.style.display = 'none';
      if (!email || !password) { errEl.textContent = 'Email et mot de passe requis.'; errEl.style.display = ''; return; }

      const btn = document.getElementById('mfxConnectBtn');
      btn.disabled = true; btn.textContent = 'Connexion…';
      try {
        const session = await CHESTMyfxbook.login(email, password);
        mfxAccounts = await CHESTMyfxbook.getMyAccounts(session);
        CHESTMyfxbook.logout(session);
        saveLastMfxLogin(email, password); // identifiants valides - reutilises au prochain "Ajouter un compte"
        if (!mfxAccounts.length) {
          errEl.textContent = "Aucun compte relié à ce profil Myfxbook — va d'abord sur myfxbook.com > Portfolio > Add Account.";
          errEl.style.display = '';
          return;
        }
        const picker = document.getElementById('mfxAccountsPicker');
        picker.hidden = false;
        document.getElementById('mfxAccountsList').innerHTML = mfxAccounts.map((a, i) => `
          <button type="button" class="mfx-account-row" data-i="${i}">
            <span><strong>${a.name}</strong><span>${a.demo ? 'Démo' : 'Réel'} · ${a.currency || ''}</span></span>
            <b>${money(parseFloat(a.balance) || 0)}</b>
          </button>`).join('');
        document.querySelectorAll('#mfxAccountsList .mfx-account-row').forEach((row) => {
          row.addEventListener('click', () => {
            mfxSelected = mfxAccounts[Number(row.dataset.i)];
            document.getElementById('mfxStepIntro').hidden = true;
            document.getElementById('mfxDetailsStep').hidden = false;
          });
        });
      } catch (e) {
        errEl.textContent = e.message;
        errEl.style.display = '';
      } finally {
        btn.disabled = false; btn.textContent = 'Se connecter';
      }
    });
  }

  async function renderAll() {
    const raw = currentAccount();
    // Etat vide : aucun compte ni famille (2026-09-23, plus de comptes de
    // demonstration par defaut) — bascule vers la carte "Ajoute ton premier
    // compte" et saute tout le rendu qui suppose un compte actif valide.
    document.getElementById('dashMain').classList.toggle('is-empty', !raw);
    document.getElementById('dashEmptyState').hidden = !!raw;
    if (!raw) return;
    renderAccountMenu(loadAccounts(), raw);
    if (raw.myfxbook && !activeAccountData) renderAccountHeader({ ...raw, loading: true });
    await refreshActiveAccount();
    renderAccountHeader(activeAccountData);
    renderObjectives(activeAccountData);
    if (activeAccountData.id !== lastCalAccountId) { calOffsetDays = 0; lastCalAccountId = activeAccountData.id; }
    // renderPayouts AVANT renderMiniCalendar : peuple lastPfSim (simulation
    // de retrait PF) que le calendrier lit pour ses marqueurs jaunes.
    renderPayouts(activeAccountData);
    renderMiniCalendar(activeAccountData);
    const activePeriod = document.querySelector('#periodPills .is-active')?.dataset.period || 'month';
    render(activePeriod);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    [liveAccount, liveSwannAccount] = await Promise.all([tryLoadLiveData(), tryLoadLiveSwann()]);
    if (!localStorage.getItem(ACTIVE_KEY)) {
      // Priorite aux vraies donnees des qu'elles existent : Live Swann (le
      // compte perso toujours synchronise) avant le compte MT5 fichier.
      if (liveSwannAccount) localStorage.setItem(ACTIVE_KEY, 'live-swann');
      else if (liveAccount) localStorage.setItem(ACTIVE_KEY, 'mt5-live');
    }
    await renderAll();

    // "h24" : Live Swann se resynchronise tout seul pendant que l'onglet
    // reste ouvert, sans avoir besoin de recharger la page - myfxbook lui-meme
    // ne se met a jour qu'~1x/24h cote serveur, donc pas la peine d'interroger
    // plus souvent que quelques minutes.
    setInterval(async () => {
      if (!window.CHESTAccounts || !CHESTAccounts.isAdmin()) return;
      const fresh = await tryLoadLiveSwann();
      if (!fresh) return;
      liveSwannAccount = fresh;
      if (activeId(loadAccounts()) === 'live-swann') await renderAll();
    }, 3 * 60 * 1000);

    const pills = document.querySelectorAll('#periodPills button');
    pills.forEach((btn) => {
      btn.addEventListener('click', () => {
        pills.forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        render(btn.dataset.period);
        // Payouts (reels et simules) filtres sur la meme periode que les KPI
        // au-dessus - retour direct utilisateur du 2026-09-17 ("il faut que
        // les payouts se mettent a jour par rapport a la timeframe
        // selectionnee").
        renderPayouts(activeAccountData);
      });
    });

    document.getElementById('accSwitcherBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('accMenu').classList.toggle('is-open');
    });
    document.addEventListener('click', (e) => {
      if (!document.getElementById('accSwitcher').contains(e.target)) closeMenu();
    });

    initAddAccountModal();
    // Ouvre la création de famille, pas directement "Ajouter un compte" (2026-09-24, demande
    // utilisateur) - voir createFamilyFromModal() pour la suite du parcours.
    document.getElementById('dashEmptyAddBtn').addEventListener('click', () => openFamilyPrompt());
    initFamilyModal();
    initFamilyBacktestModal();
    initPayoutModal();
    initEditObjectivesModal();
    initMiniCalSettings();
    document.getElementById('familyAddBtn').addEventListener('click', () => openFamilyPrompt());

    const btButtons = document.querySelectorAll('#btVisibilityToggle button');
    (function initBtToggle() {
      btButtons.forEach((b) => b.classList.toggle('is-active', (b.dataset.bt === 'on') === !loadSimpleMode()));
    })();
    btButtons.forEach((btn) => {
      btn.addEventListener('click', async () => {
        btButtons.forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        saveSimpleMode(btn.dataset.bt === 'off');
        await renderAll();
        showToast(btn.dataset.bt === 'off' ? 'Backtest masqué — données réelles uniquement ✓' : 'Backtest réaffiché ✓');
      });
    });

    const unitButtons = document.querySelectorAll('#unitToggle button');
    unitButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        unitButtons.forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        unit = btn.dataset.unit;
        render(document.querySelector('#periodPills .is-active').dataset.period);
        renderMiniCalendar(activeAccountData);
      });
    });

    // Navigateur "14 derniers jours" -> fenetre glissante sur tout
    // l'historique enregistre (voir renderMiniCalendar / CAL_WINDOW).
    document.getElementById('calPrev').addEventListener('click', () => {
      calOffsetDays += CAL_WINDOW;
      renderMiniCalendar(activeAccountData);
    });
    document.getElementById('calNext').addEventListener('click', () => {
      calOffsetDays = Math.max(0, calOffsetDays - CAL_WINDOW);
      renderMiniCalendar(activeAccountData);
    });
    document.getElementById('calToday').addEventListener('click', () => {
      calOffsetDays = 0;
      renderMiniCalendar(activeAccountData);
    });

    // "Objectifs & calendrier" reste desormais toujours visible (retour
    // direct utilisateur du 2026-09-15 : plus besoin de deplier ce qu'on
    // regarde a chaque fois) - seul le nouveau panneau "Outils" garde le
    // mecanisme de repli, ferme par defaut.
    //
    // La force des devises se charge par lots espaces de ~65s (quota Twelve
    // Data gratuit, voir js/currency-strength.js) - le contenu du panneau
    // grandit donc pendant plusieurs minutes apres l'ouverture, pas juste au
    // premier rendu. Un MutationObserver reajuste max-height a chaque
    // changement (tant que le panneau est ouvert) plutot que d'attendre la
    // fin du chargement, qui peut prendre plusieurs minutes.
    const toolsToggle = document.getElementById('toolsToggle');
    const toolsPanel = document.getElementById('toolsPanel');
    let toolsLoaded = false;
    const toolsObserver = new MutationObserver(() => {
      if (toolsToggle.classList.contains('is-open')) {
        toolsPanel.style.maxHeight = toolsPanel.scrollHeight + 'px';
      }
    });
    toolsObserver.observe(toolsPanel, { childList: true, subtree: true, characterData: true });

    toolsToggle.addEventListener('click', () => {
      const isOpen = toolsToggle.classList.toggle('is-open');
      toolsPanel.style.maxHeight = isOpen ? toolsPanel.scrollHeight + 'px' : '0px';
      if (isOpen && !toolsLoaded) {
        toolsLoaded = true;
        CHESTSessionTimeline.render('sessionTimeline');
        CHESTCurrencyStrength.render('currencyStrength');
      }
    });

    document.addEventListener('chest:theme', () => render(document.querySelector('#periodPills .is-active').dataset.period));
  });
})();
