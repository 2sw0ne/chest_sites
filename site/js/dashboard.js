(() => {
  'use strict';

  const ACCOUNTS_KEY = 'chest_accounts';
  const ACTIVE_KEY = 'chest_active_account';
  const LIVE_SWANN_KEY = 'chest_live_account';
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
  let liveAccount = null; // rempli si data/data.json existe (pont export_mt5.py)
  let liveSwannAccount = null; // "Live Swann" (Myfxbook, admin uniquement, voir account.html) - toujours resynchronise, jamais depuis le cache 5min
  let activeAccountData = null; // compte actif, enrichi des vraies donnees Myfxbook si besoin (voir refreshActiveAccount)

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

  // Chaque compte se rattache a un compte du JOURNAL (2026-09-29, demande utilisateur : "les
  // famille ce sont les journal, et tout les compte doivent etre connecter a un journal") - le
  // Journal (js/journal-store.js) remplace entierement l'ancien systeme de "familles" de comptes :
  // plus de regroupement/agregation cote Dashboard, chaque compte reste individuel et affiche
  // simplement le nom du journal auquel il est rattache (voir journalNameFor/accountRowHtml).
  function journalNameFor(account) {
    if (!account || !account.journalAccountId || !window.CHESTJournal) return null;
    const j = window.CHESTJournal.listAccounts().find((x) => x.id === account.journalAccountId);
    return j ? j.name : null;
  }
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
  const startCapitalById = {}; // capital de depart connu par compte (voir fetchMyfxbookAccount)
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
  // 2026-10-02 (retour utilisateur : "mes profits affichent -6 679,53 $ alors qu'ils devraient
  // afficher -5 641,64 $") : avec un capital de depart connu (`startCapital`, depots Myfxbook), la
  // courbe est simplement capital de depart + profit cumule jour par jour - plus aucune
  // capitalisation de % ni recalage sur le solde actuel, qui deformaient les montants.
  function capitalCurveFromDailyHistory(dailyHistory, currentBalance, startCapital) {
    if (!dailyHistory || !dailyHistory.length) return [];
    const firstDate = new Date(dailyHistory[0].date + 'T12:00:00');
    const anchor = new Date(firstDate); anchor.setDate(anchor.getDate() - 1);
    if (startCapital) {
      let cap = startCapital;
      const pts = [{ date: anchor, capital: Math.round(cap * 100) / 100 }];
      dailyHistory.forEach((d) => {
        cap += d.pnl || 0;
        pts.push({ date: new Date(d.date + 'T12:00:00'), capital: Math.round(cap * 100) / 100 });
      });
      return pts;
    }
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
  function rescaleDailyHistoryPnl(dailyHistory, currentBalance, startCapital) {
    if (!dailyHistory || !dailyHistory.length) return dailyHistory;
    if (startCapital) return dailyHistory; // $ deja reels (difference de profit cumule), rien a recaler
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
  // Resultat NET d'un trade Myfxbook (profit + commission + swap), comme le Journal (mfxToEntry).
  function tradeNet(t) {
    return (parseFloat(t.profit) || 0) + (parseFloat(t.commission) || 0) + (parseFloat(t.interest) || 0);
  }
  function tradesClosedOn(history, iso) {
    return (history || []).filter((t) => t.closeTime && !isNaN(new Date(t.closeTime)) && isoDateLocal(new Date(t.closeTime)) === iso)
      .sort((a, b) => new Date(a.closeTime) - new Date(b.closeTime));
  }
  // `startOfDayCapital` = capital a minuit (capital de depart + profit cumule jusqu'a hier) ;
  // chaque trade compte a son heure de CLOTURE (une position ouverte hier et fermee aujourd'hui
  // compte aujourd'hui). `todayPnl` ferme la courbe sur le vrai resultat du jour.
  function intradayCurveFromTrades(history, startOfDayCapital, todayPnl) {
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const endCap = Math.round((startOfDayCapital + (todayPnl || 0)) * 100) / 100;
    const pts = [{ date: startOfDay, capital: Math.round(startOfDayCapital * 100) / 100 }];
    let cap = startOfDayCapital;
    tradesClosedOn(history, isoDateLocal(new Date())).forEach((t) => {
      cap += tradeNet(t);
      pts.push({ date: new Date(t.closeTime), capital: Math.round(cap * 100) / 100 });
    });
    pts.push({ date: new Date(), capital: endCap });
    return pts;
  }

  // Liste des trades reels (Myfxbook) d'un compte - source unique pour le RR/winrate de toute
  // periode (2026-09-29, demande utilisateur : le Backtesting ne s'attache plus a un compte du
  // Dashboard, seulement a un Journal - voir backtesting.html "Rattacher à un journal").
  function unifiedTradesList(account, riskPct) {
    if (account.myfxbook && account.history) {
      return realTradesWithRR(account.id, account.history, riskPct, account.balance);
    }
    return [];
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
  function periodStatsFromCurve(period, curve, trades, subLabel, refCapital) {
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
      return { profit: '+0.0%', profitSub: `$0 ${subLabel}`, profitDollar: '+$0', profitDollarSub: `+0.0% · ${tradedDays} jour${tradedDays === 1 ? '' : 's'} tradés`, rr, winrate, winrateSub, dd: '0.0%', ddSub: 'pic → creux sur la période', tradedDays, tradedDaysSub, equity: [bal, bal], labels: [lbl, lbl], refCapital };
    }
    const startBal = equity[0], endBal = equity[equity.length - 1];
    const diff = endBal - startBal;
    // % du capital de DEPART du compte (comme une propfirm), plus du solde de debut de periode.
    const pctBase = refCapital || startBal;
    const profitPct = pctBase ? (diff / pctBase * 100) : 0;
    return {
      profit: `${profitPct >= 0 ? '+' : ''}${profitPct.toFixed(1)}%`,
      profitSub: `${diff >= 0 ? '+' : ''}${money(diff)} ${subLabel}`,
      profitDollar: `${diff >= 0 ? '+' : ''}${money(diff)}`,
      profitDollarSub: `${profitPct >= 0 ? '+' : ''}${profitPct.toFixed(1)}% · ${tradedDays} jour${tradedDays === 1 ? '' : 's'} tradés`,
      rr, winrate, winrateSub,
      dd: maxDrawdownPct(equity).toFixed(1) + '%', ddSub: 'pic → creux sur la période',
      tradedDays, tradedDaysSub,
      equity, labels, refCapital,
    };
  }

  // Point d'entree : calcule les 4 periodes d'UN coup, a partir des 3
  // ingredients bruts deja disponibles pour tout compte reel (myfxbook et/ou
  // backtest) - dailyHistory (Semaine/Mois/Annee), history brut (Jour, voir
  // intradayCurveFromTrades) et la liste de trades unifiee (RR/winrate).
  function computeAllPeriods(dailyHistory, currentBalance, trades, history, startCapital, todayPnl) {
    const restCurve = capitalCurveFromDailyHistory(dailyHistory, currentBalance, startCapital);
    const todayIso = isoDateLocal(new Date());
    const beforeToday = restCurve.filter((p) => isoDateLocal(p.date) < todayIso);
    const startOfDayCapital = beforeToday.length ? beforeToday[beforeToday.length - 1].capital : (startCapital || currentBalance - (todayPnl || 0));
    const dayCurve = intradayCurveFromTrades(history, startOfDayCapital, todayPnl);
    const subLabels = { day: "aujourd'hui", week: 'cette semaine', month: 'ce mois', all: 'cette année', full: 'sur tout l\'historique' };
    const out = {};
    ['day', 'week', 'month', 'all', 'full'].forEach((key) => {
      const curve = key === 'day' ? dayCurve : restCurve;
      out[key] = periodStatsFromCurve(key, curve, trades, subLabels[key], startCapital || null);
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

  // ---------- Historique jour par jour complet (parcourt TOUT ce qui est enregistré côté réel) ----------
  // Myfxbook renvoie deja un gain (%) et un profit ($) par jour calendaire
  // (pas de trou a combler ici, contrairement au backtest ci-dessus).
  // `capitalBefore` est retro-derive de value/profit (le seul moyen de le
  // connaitre sans un historique de solde jour par jour) - sert uniquement a
  // sommer plusieurs comptes proprement plus bas, jamais affiche tel quel.
  // BUG REEL corrige le 2026-10-02 (retour utilisateur : profit du jour -5 679,69 $ au lieu de
  // -4 658,54 $, profit total -6 679,53 $ au lieu de -5 641,64 $) : get-daily-gain.json renvoie
  // pour chaque date le gain (%) et le profit ($) CUMULES depuis l'ouverture du compte, pas ceux du
  // jour. Les traiter comme des valeurs du jour additionnait les cumuls (la perte d'hier comptee a
  // nouveau dans celle d'aujourd'hui). Le resultat d'un jour = cumul du jour - cumul de la veille.
  // Limite : si le compte est plus ancien que l'historique connu, le 1er jour connu porte tout le
  // passe (les totaux restent justes).
  function realDailyPnlFromHistory(accountLocalId, startCapital) {
    const forAcc = loadMyfxbookHistory()[accountLocalId];
    if (!forAcc) return [];
    let prevProfit = 0, prevValue = 0;
    return Object.keys(forAcc).sort().map((date) => {
      const { profit, value } = forAcc[date];
      const pnl = Math.round((profit - prevProfit) * 100) / 100;
      const capitalBefore = startCapital ? startCapital + prevProfit : null;
      const pct = capitalBefore ? (pnl / capitalBefore * 100)
        : ((1 + value / 100) / (1 + prevValue / 100) - 1) * 100;
      prevProfit = profit; prevValue = value;
      return { date, pnl, pct, capitalBefore: capitalBefore || (pct ? pnl / pct * 100 : null) };
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
  // Combine les sources REELLES myfxbook d'un compte (2026-09-29 : plus de backtest mélangé ici -
  // le Backtesting ne s'attache plus qu'à un Journal, jamais à un compte du Dashboard, voir
  // backtesting.html "Rattacher à un journal"). `source` reste 'real' sur chaque jour.
  function sumDailyPnl(realParts) {
    const realByDate = sumSeriesByDate(realParts || []);
    return [...realByDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({ date, pnl: v.pnl, pct: v.capitalBefore ? (v.pnl / v.capitalBefore * 100) : 0, source: 'real' }));
  }
  // Historique jour par jour d'un compte INDIVIDUEL (myfxbook persisté).
  function buildDailyHistory(account) {
    const realParts = account.myfxbook ? [realDailyPnlFromHistory(account.id, account.startCapital)] : [];
    return sumDailyPnl(realParts);
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
    const capitalByDay = new Map(realDailyPnlFromHistory(accountId, startCapitalById[accountId]).map((d) => [d.date, d.capitalBefore]));
    const withPct = history.map((t) => {
      if (!t.closeTime) return null;
      const capitalBefore = capitalByDay.get(isoDateLocal(new Date(t.closeTime))) || fallbackBalance;
      if (!capitalBefore) return null;
      const profit = tradeNet(t);
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
      // Capital de depart du compte = depots - retraits (2026-10-02 : reference neutre de la courbe
      // et base de tous les % et $ du Dashboard). Absent -> null, l'ancien calcul s'applique.
      const deposits = parseFloat(acc.deposits) || 0;
      const withdrawals = parseFloat(acc.withdrawals) || 0;
      const startCapital = deposits > 0 ? deposits - withdrawals : null;
      return {
        balance, equity, pnl: equity - balance, today: 0, startCapital, // "today" recalcule depuis dailyHistory juste apres (voir refreshActiveAccount)
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
    acc.lastKnownGood = { balance: data.balance, equity: data.equity, pnl: data.pnl, startCapital: data.startCapital, syncedAt: data.syncedAt };
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

  // ---------- Switcher de comptes : liste PLATE, plus de familles imbriquées (2026-09-29, demande
  // utilisateur : "les famille ce sont les journal... on vois tout les compte avec notifier le
  // journal rattaché (pas de famille)") - chaque compte affiche simplement le journal auquel il
  // est rattaché (voir journalNameFor), et son ⋮ permet de le rattacher à un autre journal, le
  // renommer, ou le supprimer (le journal et son historique de trades survivent toujours à la
  // suppression du compte miroir — "si ils sont supprimer les infos reste dans leur journal"). ----------
  function accountRowHtml(a, activeId) {
    // Les comptes "Live" (Myfxbook admin auto-synchronisé, pont MT5 local) ne sont pas des comptes
    // créés depuis le site : rien à supprimer ici, pas de bouton ⋮ pour eux.
    const canDelete = !a.isLiveSwann && a.id !== 'mt5-live';
    const journalName = journalNameFor(a);
    return `
      <div class="acc-row">
        <button class="acc-menu__item ${a.id === activeId ? 'is-active' : ''}" data-id="${a.id}">
          <span class="avatar ${a.isLiveSwann ? 'is-live' : ''}">${a.isLiveSwann ? '🟢' : a.live ? '🔴' : initials(a.name)}</span>
          <span><strong>${a.name}</strong><span>${journalName ? '📒 ' + journalName : `#${a.number} · ${a.type}`}</span></span>
        </button>
        ${canDelete ? `
        <div class="acc-tools">
          <button type="button" class="acc-tools__btn" aria-label="Options du compte ${a.name}">⋮</button>
          <div class="acc-tools__menu">
            <button type="button" data-reattach-account="${a.id}">📒 Rattacher à un autre journal</button>
            <button type="button" data-rename-account="${a.id}">✎ Renommer le compte</button>
            <button type="button" class="is-danger" data-delete-account="${a.id}">Supprimer</button>
          </div>
        </div>` : ''}
      </div>`;
  }

  function renderAccountMenu(accounts, active) {
    const list = document.getElementById('accMenuList');
    list.innerHTML = accounts.map((a) => accountRowHtml(a, active.id)).join('');

    list.querySelectorAll('[data-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        localStorage.setItem(ACTIVE_KEY, btn.dataset.id);
        closeMenu();
        renderAll();
      });
    });
    list.querySelectorAll('[data-delete-account]').forEach((btn) => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); deleteAccount(btn.dataset.deleteAccount); });
    });
    list.querySelectorAll('[data-rename-account]').forEach((btn) => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); renameAccount(btn.dataset.renameAccount); });
    });
    list.querySelectorAll('[data-reattach-account]').forEach((btn) => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); openReattachJournalModal(btn.dataset.reattachAccount); });
    });
  }

  async function renameAccount(id) {
    const accounts = loadAccounts();
    const acc = accounts.find((a) => a.id === id);
    if (!acc) return;
    const name = await CHESTPrompt('Nouveau nom du compte :', { value: acc.name, confirmLabel: 'Renommer' });
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed) { showToast('Le nom ne peut pas être vide'); return; }
    acc.name = trimmed;
    saveAccounts(accounts);
    closeMenu();
    renderAll();
    showToast('Compte renommé ✓');
  }

  // ---------- Rattacher un compte à un autre compte du Journal (menu ⋮, 2026-09-29) ----------
  let pendingReattachAccountId = null;
  function openReattachJournalModal(accountId) {
    pendingReattachAccountId = accountId;
    const list = document.getElementById('reattachJournalList');
    const items = (window.CHESTJournal && window.CHESTJournal.listAccounts()) || [];
    list.innerHTML = items.length
      ? items.map((j) => `
        <button type="button" class="mfx-account-row" data-journal-id="${j.id}">
          <span><strong>${j.name}</strong><span>${j.type === 'propfirm' ? 'Propfirm' : 'Compte propre'}</span></span>
        </button>`).join('')
      : '<p class="hint">Aucun compte dans le Journal — crée-en un depuis <a href="journal.html">Journal</a>.</p>';
    list.querySelectorAll('[data-journal-id]').forEach((btn) => {
      btn.addEventListener('click', () => reattachAccountToJournal(btn.dataset.journalId));
    });
    document.getElementById('reattachJournalModal').classList.add('is-open');
  }
  function closeReattachJournalModal() { document.getElementById('reattachJournalModal').classList.remove('is-open'); }
  function reattachAccountToJournal(journalId) {
    const accounts = loadAccounts();
    const acc = accounts.find((a) => a.id === pendingReattachAccountId);
    if (!acc) return;
    // Compte Myfxbook : deplace son enregistrement "live" du journal precedent (si connu) vers le
    // nouveau - les positions deja importees restent dans l'ancien journal (l'utilisateur peut les
    // y retrouver), seule la synchronisation future change de destination.
    if (acc.myfxbook && window.CHESTJournal) {
      if (acc.journalAccountId && acc.journalLiveId) {
        window.CHESTJournal.removeLiveAccount(acc.journalAccountId, acc.journalLiveId);
      }
      const live = window.CHESTJournal.addLiveAccount(journalId, {
        name: acc.name, email: acc.myfxbook.email, password: acc.myfxbook.password, accountId: acc.myfxbook.accountId,
        demo: acc.type === 'Démo', currency: null,
      });
      acc.journalLiveId = live ? live.id : null;
      if (live) window.CHESTJournal.syncLiveAccount(journalId, live.id).catch(() => { /* resynchronisable depuis journal.html */ });
    }
    acc.journalAccountId = journalId;
    saveAccounts(accounts);
    closeReattachJournalModal();
    closeMenu();
    renderAll();
    showToast('Compte rattaché au journal ✓');
  }
  function initReattachJournalModal() {
    document.getElementById('reattachJournalClose').addEventListener('click', closeReattachJournalModal);
    document.getElementById('reattachJournalModal').addEventListener('click', (e) => {
      if (e.target.id === 'reattachJournalModal') closeReattachJournalModal();
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
    titleEl.textContent = a.isPropfirm ? 'Propfirm' : (a.myfxbook || a.live ? 'Compte propre' : 'Démo');
    // Journal rattaché (2026-09-29, demande utilisateur : "on vois tout les compte avec notifier
    // le journal rattaché").
    const journalTag = document.getElementById('accJournalTag');
    const jName = journalNameFor(a);
    if (jName) { journalTag.textContent = '📒 ' + jName; journalTag.hidden = false; }
    else { journalTag.hidden = true; }
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
    // %/$ - meme bascule que le graphique juste au-dessus (retour direct utilisateur du 2026-09-16).
    const cells = days.map(({ date, key, pnl, pct }) => {
      const v = unit === 'percent' ? pct : pnl;
      const toneClass = v === null ? '' : (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
      const cls = toneClass + (key === todayIso ? ' is-today' : '');
      const label = v === null ? '·' : v === 0 ? '—'
        : unit === 'percent' ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
          : `${v >= 0 ? '+' : '-'}$${Math.abs(v).toFixed(0)}`;
      return `<div class="mini-cal__cell ${cls}"><span class="d">${date.getDate()}/${date.getMonth() + 1}</span><span class="p">${label}</span></div>`;
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

  // ---------- Payouts propfirm : reel, saisi a la main. Filtres sur la MEME periode que les KPI
  // au-dessus (#periodPills). Plus de mode "Simulé" (2026-09-29, demande utilisateur : "tu peux
  // enlever la partie simuler du dashboard").
  function renderPayouts(a) {
    const bar = document.getElementById('payoutBar');
    if (!a || !a.isPropfirm) { bar.hidden = true; return; }
    bar.hidden = false;
    if (a.id !== lastPayoutAccountId) { payoutListOpen = false; lastPayoutAccountId = a.id; }
    const period = document.querySelector('#periodPills .is-active')?.dataset.period || 'month';
    const range = periodRange(period);
    setPayoutListOpen(payoutListOpen);

    // Retraits détectés automatiquement par le Journal (2026-09-29, demande utilisateur : "les
    // payouts devraient être ajustables dans le journal et visible uniquement sur le dashboard") -
    // ajustables uniquement depuis journal.html (volet "Historique du challenge"), juste affichés
    // ici en lecture seule, en plus des payouts saisis à la main sur ce compte.
    const journalEntries = (a.journalAccountId && window.CHESTJournal)
      ? window.CHESTJournal.stagePayouts(a.journalAccountId).map((p) => ({ date: p.date, amount: p.net, fromJournal: true, label: p.label }))
      : [];
    const manualEntries = (a.payouts || []).map((p) => Object.assign({ fromJournal: false }, p));
    const entries = manualEntries.concat(journalEntries).filter((p) => inPeriodRange(p.date, range)).sort((x, y) => (y.date || '').localeCompare(x.date || ''));
    const total = entries.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    document.getElementById('payoutTotal').textContent = money(total);
    document.getElementById('payoutList').innerHTML = entries.length
      ? entries.map((p) => `
        <div class="payout-row">
          <span>${p.date ? new Date(p.date).toLocaleDateString('fr-FR') : '—'}${p.fromJournal ? ` · <i title="Détecté par le Journal — modifiable depuis le Journal">📒 ${p.label}</i>` : ''}</span>
          <b>${money(parseFloat(p.amount) || 0)}</b>
          ${p.fromJournal ? '' : `<button type="button" class="payout-row__del" data-del-payout="${p.id}" aria-label="Supprimer ce payout">✕</button>`}
        </div>`).join('')
      : '<p class="hint" style="margin:0">Aucun payout enregistré sur cette période.</p>';
    document.getElementById('payoutAddBtn').style.display = '';
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

  function openEditObjectivesModal() {
    const raw = currentAccount();
    if (!raw) return;
    const accounts = loadAccounts();
    const acc = accounts.find((a) => a.id === raw.id);
    if (!acc) return;
    editObjectivesAccountId = acc.id;
    document.getElementById('editObjectivesTitle').textContent = 'Objectifs du challenge';

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

  // Renvoie null quand il n'y a aucun compte (etat vide, voir renderAll()) —
  // ne plus supposer accounts[0] toujours present depuis le retrait des
  // comptes de demonstration (2026-09-23). Plus de famille (2026-09-29) :
  // chaque compte reste individuel, rattache a un compte du Journal (voir
  // journalNameFor).
  function currentAccount() {
    const accounts = loadAccounts();
    const id = activeId(accounts);
    if (id === null) return null;
    return accounts.find((a) => a.id === id) || accounts[0] || null;
  }

  // Resultat du jour : celui de Myfxbook (trades classes par jour de cloture) ; si Myfxbook n'a pas
  // encore publie la journee, somme des trades CLOTURES aujourd'hui (profit + commission + swap).
  function todayPnlFromHistory(dailyHistory, history) {
    const todayIso = isoDateLocal(new Date());
    const entry = (dailyHistory || []).find((d) => d.date === todayIso);
    if (entry) return entry.pnl;
    const closed = tradesClosedOn(history, todayIso);
    return closed.length ? Math.round(closed.reduce((s, t) => s + tradeNet(t), 0) * 100) / 100 : 0;
  }

  async function refreshActiveAccount() {
    const raw = currentAccount();
    activeAccountData = raw.myfxbook ? await enrichWithMyfxbook(raw) : raw;

    // Compte reel (myfxbook) : pipeline pour construire dailyHistory + les 4 periodes + les
    // objectifs. Sans myfxbook, `activeAccountData.periods` reste absent et `render()` retombe
    // sur SAMPLE_PERIODS (compte de demo).
    if (activeAccountData.myfxbook) {
      if (activeAccountData.startCapital) startCapitalById[activeAccountData.id] = activeAccountData.startCapital;
      activeAccountData.dailyHistory = rescaleDailyHistoryPnl(
        buildDailyHistory(activeAccountData), activeAccountData.balance, activeAccountData.startCapital);
      activeAccountData.today = todayPnlFromHistory(activeAccountData.dailyHistory, activeAccountData.history);
      const riskPct = fixedRiskPercent();
      const trades = unifiedTradesList(activeAccountData, riskPct);
      activeAccountData.periods = computeAllPeriods(
        activeAccountData.dailyHistory, activeAccountData.balance, trades, activeAccountData.history,
        activeAccountData.startCapital, activeAccountData.today);
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
  // `ref` = valeur neutre (2026-10-02 : le capital de depart en $, 0 en %) - vert au-dessus,
  // rouge en dessous.
  function buildHeatGradient(chartInstance, series, forLine, ref) {
    const r = ref || 0;
    const { ctx: c2d, chartArea, scales } = chartInstance;
    if (!chartArea) return forLine ? '#33e6a6' : 'rgba(51,230,166,.1)';
    const grad = c2d.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    const peak = forLine ? 1 : 0.85;
    const maxV = Math.max(...series, r), minV = Math.min(...series, r);
    if (maxV <= r) { addPlateauStops(grad, 1, 0, peak, NEON_RED); return grad; }
    if (minV >= r) { addPlateauStops(grad, 0, 1, peak, NEON_GREEN); return grad; }
    const zeroY = scales.y.getPixelForValue(r);
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

    // Reference neutre = capital de depart du compte (2026-10-02) : en $, la courbe s'organise
    // autour de ce montant (au milieu de l'axe), en %, autour de 0 % de ce capital.
    const base = d.refCapital || d.equity[0] || 1;
    const series = unit === 'percent' ? d.equity.map((v) => ((v - base) / base * 100)) : d.equity;
    const ref = unit === 'percent' ? 0 : (d.refCapital || 0);
    let yMin, yMax;
    if (d.refCapital) {
      const dev = Math.max(...series.map((v) => Math.abs(v - ref)), unit === 'percent' ? 0.5 : base * 0.005);
      yMin = ref - dev * 1.15; yMax = ref + dev * 1.15;
    }
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
            borderColor: (c) => buildHeatGradient(c.chart, series, true, ref),
          },
          { // trait net + remplissage, par-dessus
            data: series, borderWidth: 2.5, pointRadius: 0, tension: .3,
            borderColor: (c) => buildHeatGradient(c.chart, series, true, ref),
            backgroundColor: (c) => buildHeatGradient(c.chart, series, false, ref),
            fill: d.refCapital ? { value: ref } : true,
          },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { min: yMin, max: yMax, grid: { color: grid }, ticks: { color: tick, callback: (v) => unit === 'percent' ? v.toFixed(1) + '%' : '$' + Math.round(v) } },
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

  // Journal (obligatoire, remplace l'ancien "Backtesting de depart" - 2026-09-29, demande
  // utilisateur : "myfxbooks remplace juste le choix d'un backetsting par le choix d'un journal...
  // tout les position noté dans myfxbooks doivent etre enregistrer indépendament et
  // automatiquement dans un journal soit deja crée soit qu'on doit crée") : la liste vient de
  // CHESTJournal.listAccounts(), donc repopulee a chaque ouverture pour refleter les comptes du
  // Journal ajoutes/supprimes depuis journal.html entre-temps.
  function populateJournalSelect() {
    const select = document.getElementById('addAccountJournal');
    const items = (window.CHESTJournal && window.CHESTJournal.listAccounts()) || [];
    select.innerHTML = '<option value="">— Choisir un journal existant —</option>'
      + items.map((a) => `<option value="${a.id}">${a.name}</option>`).join('');
  }

  let chosenPhase = null; // 'phase1' | 'phase2' | 'funded' | null - propfirm reconnue uniquement

  // Compte Live = un compte du Journal (2026-09-27, demande utilisateur : plus de famille pour ce
  // chemin, "ca va etre les journaux qui sont directement a connecter"). pendingLiveJournalId
  // pointe un id CHESTJournal.listAccounts() (existant OU tout juste créé depuis cet écran).
  let pendingLiveJournalId = null;
  let pendingLiveStage = null; // 'p1'|'p2'|'funded'|null (null = compte propre, pas de phase)
  let pendingLiveKind = 'propfirm'; // 'propfirm'|'own' - filtre #liveJournalList (toggle du haut, 2026-09-29)
  let pendingLiveBroker = null; // {id, name, servers} resolu pour le compte du Journal choisi, ou choisi a la main

  const LIVE_CONNECT_RESUME_KEY = 'chest_live_connect_resume'; // voir liveJournalNewBtn + boot()

  function openAddAccountModal() {
    chosenBroker = null;
    chosenAccountKind = 'own';
    chosenPhase = null;
    chosenAddMode = 'myfxbook';
    liveCredentials = null;
    pendingLiveJournalId = null;
    pendingLiveStage = null;
    pendingLiveKind = 'propfirm';
    pendingLiveBroker = null;
    document.querySelectorAll('#accountKindToggle button').forEach((b) => b.classList.toggle('is-active', b.dataset.kind === 'own'));
    document.getElementById('accountKindBlock').hidden = true;
    document.getElementById('objectivesStepBlock').hidden = true;
    document.getElementById('addAccountPhaseBlock').hidden = true;
    document.querySelectorAll('#addAccountPhaseToggle button').forEach((b) => b.classList.remove('is-active'));
    document.getElementById('addAccountRulesNote').textContent = '';
    populateJournalSelect();
    document.getElementById('addAccountJournal').value = '';
    document.getElementById('addAccountJournalNewName').value = '';
    // "Compte Live" reserve admin (2026-09-27) - un seul terminal MT5 partage, voir README de
    // mt5-notify-bridge. Invisible pour un membre de la famille, comme s'il n'existait pas.
    const isAdmin = window.CHESTAccounts && CHESTAccounts.isAdmin && CHESTAccounts.isAdmin();
    document.getElementById('addAccountModeToggle').hidden = !isAdmin;
    document.querySelectorAll('#addAccountModeToggle button').forEach((b) => b.classList.toggle('is-active', b.dataset.mode === 'myfxbook'));
    document.getElementById('liveJournalStep').hidden = true;
    document.querySelectorAll('#liveKindToggle button').forEach((b) => b.classList.toggle('is-active', b.dataset.kind === 'propfirm'));
    document.getElementById('liveStageStep').hidden = true;
    document.getElementById('liveStepIntro').hidden = true;
    document.getElementById('liveLogin').value = '';
    document.getElementById('livePassword').value = '';
    document.getElementById('liveBrokerPickBlock').hidden = true;
    document.querySelectorAll('#liveBrokerGrid .broker-card-sm').forEach((c) => c.classList.remove('is-selected'));
    document.getElementById('liveServer').innerHTML = '<option value="">Choisis d\'abord le broker ci-dessus…</option>';
    document.getElementById('liveServerOther').value = '';
    document.getElementById('liveServerOther').style.display = 'none';
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

  // Supprimer un compte (2026-09-24, demande utilisateur) - CHESTConfirm() plutôt qu'un
  // window.confirm() natif, qui ne fonctionne pas dans ce panneau d'aperçu intégré (voir
  // js/confirm-dialog.js). Ne supprime QUE le miroir du Dashboard (chest_accounts) - le compte du
  // Journal et tout son historique de trades restent intacts (2026-09-29, demande utilisateur :
  // "si ils sont supprimer les infos reste dans leur journal").
  async function deleteAccount(id) {
    const accounts = loadAccounts();
    const account = accounts.find((a) => a.id === id);
    if (!account) return;
    if (!(await CHESTConfirm(`Supprimer définitivement le compte "${account.name}" ? Cette action est irréversible (l'historique reste disponible dans son journal).`))) return;
    saveAccounts(accounts.filter((a) => a.id !== id));
    if (localStorage.getItem(ACTIVE_KEY) === id) localStorage.removeItem(ACTIVE_KEY);
    closeMenu();
    renderAll();
    showToast('Compte supprimé');
  }

  function finalizeNewAccount(fields, presetId) {
    const accounts = loadAccounts().filter((a) => a.id !== 'mt5-live' && a.id !== 'live-swann');
    const id = presetId || ('acc-' + Date.now());
    accounts.push({ id, ...fields });
    saveAccounts(accounts);
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

    // Grille identique pour le broker/plateforme de la connexion Live (2026-09-29, demande
    // utilisateur : le serveur MT5 est un menu deroulant qui depend du broker choisi ici -
    // c'est l'origine directe du bug "je me suis trompe de nom de serveur" du 2026-09-29).
    const liveBrokerGrid = document.getElementById('liveBrokerGrid');
    liveBrokerGrid.innerHTML = window.CHEST_BROKERS.map((b) => `
      <button type="button" class="broker-card-sm" data-broker-id="${b.id}">
        <img src="${chestBrokerLogo(b.domain)}" alt="" onerror="this.remove()">
        <span>${b.name}</span>
      </button>`).join('') + `
      <button type="button" class="broker-card-sm" data-broker-id="other">
        <span class="broker-card-sm__icon">✎</span>
        <span>Autre</span>
      </button>`;
    function populateLiveServerSelect(broker) {
      const select = document.getElementById('liveServer');
      const otherInput = document.getElementById('liveServerOther');
      if (broker && Array.isArray(broker.servers) && broker.servers.length) {
        select.innerHTML = broker.servers.map((s) => `<option value="${s}">${s}</option>`).join('')
          + '<option value="__other__">Autre (nom exact non listé)…</option>';
        select.value = broker.servers[0];
        otherInput.style.display = 'none';
        otherInput.value = '';
      } else {
        // Broker choisi mais sans liste de serveurs connue (ex. "Autre", ou une propfirm sans
        // catalogue verifie) - jamais de liste inventee, saisie directe du nom affiche dans MT5.
        select.innerHTML = '<option value="__other__">Nom exact du serveur (aucune liste connue pour ce broker)</option>';
        select.value = '__other__';
        otherInput.style.display = '';
      }
    }
    function selectLiveBroker(broker) {
      pendingLiveBroker = broker;
      liveBrokerGrid.querySelectorAll('.broker-card-sm').forEach((c) => c.classList.toggle('is-selected', c.dataset.brokerId === (broker ? broker.id : null)));
      populateLiveServerSelect(broker);
    }
    liveBrokerGrid.querySelectorAll('.broker-card-sm').forEach((card) => {
      card.addEventListener('click', () => {
        const id = card.dataset.brokerId;
        const b = id === 'other' ? { id: 'other', name: '', servers: null } : window.CHEST_BROKERS.find((x) => x.id === id);
        selectLiveBroker(b);
      });
    });
    document.getElementById('liveServer').addEventListener('change', (e) => {
      document.getElementById('liveServerOther').style.display = e.target.value === '__other__' ? '' : 'none';
    });

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
      const email = document.getElementById('mfxEmail').value.trim();
      const password = document.getElementById('mfxPassword').value;
      // Journal OBLIGATOIRE (2026-09-29, demande utilisateur : "tout les position noté dans
      // myfxbooks doivent etre enregistrer indépendament et automatiquement dans un journal soit
      // deja crée soit qu'on doit crée") - un journal existant est choisi, ou un nouveau nom tape
      // cree un journal vierge a la volee.
      let journalAccountId = document.getElementById('addAccountJournal').value || null;
      const newJournalName = document.getElementById('addAccountJournalNewName').value.trim();
      if (!journalAccountId && newJournalName && window.CHESTJournal) {
        const created = window.CHESTJournal.addAccount({
          name: newJournalName, type: 'own', propfirmId: null, modelId: null, stage: null,
          balance: parseFloat(mfxSelected.balance) || 0, riskUnit: 'pct', riskValue: 1,
          connectionMode: 'manual', mode: 'manual', rules: null, live: [],
        });
        journalAccountId = created.id;
      }
      if (!journalAccountId) { showToast('Un journal est obligatoire — choisis-en un existant, ou tape un nom pour en créer un nouveau.'); return; }
      // Le compte Myfxbook devient AUSSI un "compte live" du Journal choisi (meme mecanisme que
      // journal.html - voir CHESTJournal.addLiveAccount/syncLiveAccount) - ses positions Myfxbook
      // rejoignent le journal, vierge ou deja rempli, en plus de leur affichage normal sur ce
      // compte du Dashboard. `journalLiveId` permet de deplacer cet enregistrement plus tard (voir
      // reattachAccountToJournal) si le compte est rattache a un AUTRE journal.
      let journalLiveId = null;
      if (window.CHESTJournal) {
        const live = window.CHESTJournal.addLiveAccount(journalAccountId, {
          name: `${chosenBroker.name} · #${mfxSelected.id}`, email, password, accountId: mfxSelected.id,
          demo: !!mfxSelected.demo, currency: mfxSelected.currency || null,
        });
        if (live) {
          journalLiveId = live.id;
          window.CHESTJournal.syncLiveAccount(journalAccountId, live.id).catch(() => { /* resynchronisable depuis journal.html */ });
        }
      }
      finalizeNewAccount({
        name: `${chosenBroker.name} · #${mfxSelected.id}`, number: String(mfxSelected.id),
        type: mfxSelected.demo ? 'Démo' : 'Réel', broker: chosenBroker.name, brokerId: chosenBroker.id,
        balance: parseFloat(mfxSelected.balance) || 0, equity: parseFloat(mfxSelected.equity) || 0, pnl: 0, today: 0,
        example: false, myfxbook: { email, password, accountId: mfxSelected.id }, journalAccountId, journalLiveId,
        challengeObjectives: readObjectives(), isPropfirm: chosenAccountKind === 'propfirm',
        payouts: [], objectivesResetAt: isoDateLocal(new Date()),
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
    // (chest_accounts) tagué `journalAccountId` pour continuer a s'afficher normalement. Plus de
    // famille (2026-09-29) : chaque nouvelle connexion Live (phase 1, phase 2, financé...) ajoute
    // simplement un NOUVEAU compte miroir individuel, rattaché au même compte du Journal (jamais
    // remplacé/supprimé, l'historique de chaque phase reste visible individuellement).
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
    // Filtre par le toggle "Propfirm"/"Compte propre" du haut (2026-09-29, demande utilisateur -
    // voir #liveKindToggle) : un seul type affiche a la fois, plus facile a parcourir des qu'il y a
    // plusieurs comptes du Journal.
    function renderLiveJournalPicker() {
      const list = document.getElementById('liveJournalList');
      const all = (window.CHESTJournal && window.CHESTJournal.listAccounts()) || [];
      const accounts = all.filter((a) => (pendingLiveKind === 'propfirm' ? a.type === 'propfirm' : a.type !== 'propfirm'));
      if (!all.length) {
        list.innerHTML = '<p class="hint">Aucun compte dans le Journal pour l\'instant.</p>';
        return;
      }
      if (!accounts.length) {
        list.innerHTML = `<p class="hint">Aucun compte "${pendingLiveKind === 'propfirm' ? 'propfirm' : 'propre'}" dans le Journal — crée-en un nouveau, ou change le type ci-dessus.</p>`;
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
        row.addEventListener('click', () => selectJournalForLive(all.find((a) => a.id === row.dataset.id)));
      });
    }
    document.querySelectorAll('#liveKindToggle button').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#liveKindToggle button').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        pendingLiveKind = btn.dataset.kind;
        renderLiveJournalPicker();
      });
    });
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
    // Regles preconnues (2026-09-29, demande utilisateur : "les regle preecrite car tu va les
    // apprendre sur internet") - vient de CHESTPropRules (js/propfirm-rules.js, verifie sur les
    // pages officielles), la meme base que le compte du Journal utilise deja pour ses conditions.
    function liveRulesFactsFor(acc) {
      if (!acc || acc.type !== 'propfirm' || !acc.modelId) return null;
      const models = window.CHESTJournal.challengeModels(acc.propfirmId);
      const model = models.find((m) => m.id === acc.modelId);
      return model && model.facts ? model.facts : null;
    }
    // Resout le broker MT5 du compte du Journal choisi, pour prereplir le menu deroulant des
    // serveurs (2026-09-29) - un compte "propfirm" reconnu dans CHEST_BROKERS (ex. FTMO, Alpha
    // Capital) se resout tout seul ; un compte "propre" ou une propfirm sans catalogue de serveurs
    // connu (FundedNext, The5ers, Funding Pips, Blueberry Funded...) repasse la main a la grille.
    function resolveLiveBroker(acc) {
      if (acc && acc.type === 'propfirm' && acc.propfirmId) {
        const b = window.CHEST_BROKERS.find((x) => x.id === acc.propfirmId && Array.isArray(x.servers) && x.servers.length);
        if (b) return b;
      }
      return null;
    }
    function showLiveStepIntro(acc) {
      document.getElementById('liveStageStep').hidden = true;
      const stageTxt = pendingLiveStage ? ' · ' + (stageLabelFor(Object.assign({}, acc, { stage: pendingLiveStage })) || pendingLiveStage) : '';
      document.getElementById('liveJournalSummary').innerHTML = `Connexion pour : <b>${acc.name}</b>${stageTxt}`;
      const facts = liveRulesFactsFor(acc);
      const factsEl = document.getElementById('liveRulesFacts');
      if (factsEl) factsEl.innerHTML = facts ? facts.map((f) => `• ${f}`).join('<br>') : '';
      const resolved = resolveLiveBroker(acc);
      const pickBlock = document.getElementById('liveBrokerPickBlock');
      if (resolved) {
        pickBlock.hidden = true;
        selectLiveBroker(resolved);
      } else {
        pickBlock.hidden = false;
        selectLiveBroker(pendingLiveBroker);
      }
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
      const serverSel = document.getElementById('liveServer').value;
      const server = (serverSel === '__other__' ? document.getElementById('liveServerOther').value : serverSel).trim();
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
        const newStage = pendingLiveStage != null ? pendingLiveStage : journalAcc.stage;
        // Le Journal est la source de verite (nom, propfirm, phase) - le Dashboard n'est qu'un
        // miroir affichable, tague `journalAccountId` pour le retrouver au prochain changement.
        // connectionMode/mode basculent automatiquement en "auto" ici (2026-09-27, demande
        // utilisateur : "connecté à dashboard il se remplit automatiquement") - jamais demandé à
        // la création du compte du Journal (voir journal.html, jaSave), seulement dérivé du fait
        // qu'une vraie connexion Live vient de réussir.
        window.CHESTJournal.updateAccount(journalAcc.id, {
          mt5Live: { login, server }, stage: newStage, connectionMode: 'mt5', mode: 'auto',
        });
        // Historique du challenge (2026-09-29, demande utilisateur : "il faut que le journal
        // comprenne les transitions de compte") - detecte etape validee / compte crame / retrait
        // probable en comparant ce nouveau compte au precedent, voir CHESTJournal.attachStageAccount.
        const stageRes = window.CHESTJournal.attachStageAccount(journalAcc.id, {
          connType: 'mt5', connRef: 'mt5', stage: newStage, startBalance: info.balance || 0,
        });
        if (stageRes && stageRes.needsSplitPct) {
          const val = await CHESTPrompt('Quel pourcentage du profit gardes-tu (le reste va au propfirm) ? Sert à calculer automatiquement tes retraits sur ce journal.', { value: '80', confirmLabel: 'Valider' });
          if (val !== null) window.CHESTJournal.setPayoutSplitPct(journalAcc.id, Math.min(100, Math.max(1, parseFloat(val) || 80)));
        }
        // CHAQUE connexion Live (phase 1, phase 2, financé...) ajoute un NOUVEAU compte miroir
        // individuel, rattaché au même compte du Journal via `journalAccountId` (jamais
        // remplacé/supprimé, l'historique de chaque phase reste visible individuellement - "les
        // famille ce sont les journal" 2026-09-29).
        const stageLbl = stageLabelFor(Object.assign({}, journalAcc, { stage: newStage }));
        const accounts = loadAccounts();
        const id = 'acc-' + Date.now();
        accounts.push({
          id, journalAccountId: journalAcc.id,
          name: stageLbl ? `${journalAcc.name} · ${stageLbl}` : journalAcc.name,
          number: login, type: 'Réel', broker: journalAcc.name,
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
      openAddAccountModal();
      chosenAddMode = 'live';
      document.querySelectorAll('#addAccountModeToggle button').forEach((b) => b.classList.toggle('is-active', b.dataset.mode === 'live'));
      document.getElementById('mfxStepIntro').hidden = true;
      pendingLiveKind = acc.type === 'propfirm' ? 'propfirm' : 'own';
      document.querySelectorAll('#liveKindToggle button').forEach((b) => b.classList.toggle('is-active', b.dataset.kind === pendingLiveKind));
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
    // Ouvre directement "Ajouter un compte" (2026-09-27/29, demande utilisateur : "on va oublier les
    // familles" / "à côté une fonction d'ajouter un compte un petit +") - chaque compte se rattache
    // a un compte du Journal (voir addAccountFinish/liveConnectBtn), plus de famille a creer.
    document.getElementById('dashEmptyAddBtn').addEventListener('click', () => openAddAccountModal());
    initReattachJournalModal();
    initPayoutModal();
    initEditObjectivesModal();
    initMiniCalSettings();
    document.getElementById('familyAddBtn').addEventListener('click', () => openAddAccountModal());

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
