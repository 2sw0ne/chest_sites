// Moteur de simulation generique pour les backtests ajoutes par
// l'utilisateur. Reprend le meme principe de calcul que allin-engine.js
// (capital *= (1 + risque%/100 * rr) par trade, dans l'ordre chronologique,
// BE traite comme rr=0), generalise a un risque configurable par
// l'utilisateur (fixe ou par paliers) plutot que des constantes figees pour
// une seule strategie. Ne depend d'aucun autre fichier du site.
(() => {
  'use strict';

  function toDate(v) {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  function dayKey(d) { return d.toISOString().slice(0, 10); }

  function isSL(t) { return String(t.result).toUpperCase() === 'SL'; }
  function isBE(t) { return String(t.result).toUpperCase() === 'BE'; }

  // Ordre chronologique par cloture (ou ouverture, ou date simple si ni l'un
  // ni l'autre n'est fourni) - meme esprit que buildEvents() dans
  // allin-engine.js, simplifie : on ne gere pas ici l'entrelacement de
  // positions qui se chevauchent, seulement l'ordre de cloture.
  function sortedTrades(trades) {
    return trades.slice().sort((a, b) => {
      const da = toDate(a.close || a.open || a.date);
      const db = toDate(b.close || b.open || b.date);
      if (!da && !db) return 0;
      if (!da) return -1;
      if (!db) return 1;
      return da - db;
    });
  }

  // Risque effectif pour un trade, selon les paliers definis par
  // l'utilisateur ("apres X SL consecutifs -> risque Y%"). On prend le
  // palier le plus eleve dont le seuil est atteint - identique dans
  // l'esprit a tier() dans allin-engine.js, mais parametrable.
  function effectiveRisk(baseRisk, tiers, consecutiveSl) {
    if (!tiers || !tiers.length) return baseRisk;
    let risk = baseRisk;
    tiers.slice().sort((a, b) => a.afterSl - b.afterSl).forEach((t) => {
      if (consecutiveSl >= t.afterSl) risk = t.newRisk;
    });
    return risk;
  }

  // ---------------------------------------------------------------
  // BONUS : colonnes optionnelles du fichier (étiquette W/L/P, tendance/contre,
  // confirmation…) + informations DÉDUITES de l'heure d'ouverture (session,
  // jour, plage horaire). Une règle « Si » choisit le risque d'un trade selon
  // ses bonus ; les paliers « après N SL » continuent de fonctionner.
  //
  // Règle : { conds:[{field, value}], afterSl:number|null, risk:number }
  //   field  'source' | 'confirmation' | 'order' | 'x:<en-tête de colonne>'
  //          | 'd:session' | 'd:weekday' | 'd:window' (déduits de l'heure d'OUVERTURE, connue à l'entrée)
  //   value  pour 'd:window' : plage d'heures d'ouverture « 1h-3h » (de 1h00 à 2h59, boucle possible « 22h-2h »)
  //   risk   0 = le trade est IGNORÉ (il n'est pas pris)
  // La règle la plus précise gagne : plus de conditions, puis plus de SL
  // consécutifs exigés, puis la plus basse dans la liste.
  //
  // Garde-fous assumés : la durée de détention n'est PAS proposée (connue seulement à
  // la clôture : les SL sortent vite, les TP durent — tricher avec l'avenir) ; le
  // week-end n'existe pas (samedi et dimanche du calendrier du fichier, crypto
  // non prise en compte) : ces trades n'ont ni session, ni jour, ni plage horaire.
  // ---------------------------------------------------------------
  const BONUS_LABELS = { source: 'Source', confirmation: 'Confirmation', order: 'Ordre' };
  const DERIVED_LABELS = { 'd:session': 'Session', 'd:weekday': 'Jour', 'd:window': 'Heures' };
  // Heures UTC : les horaires importés sont lus tels quels (un fichier saisi en heure locale décale les sessions).
  const SESSIONS = [[0, 7, 'Asie'], [7, 12, 'Londres'], [12, 16, 'Londres × New York'], [16, 21, 'New York'], [21, 24, 'Soir']];
  const WEEKDAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const DERIVED_ORDER = {
    'd:session': SESSIONS.map((s) => s[2]),
    'd:weekday': ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'],
  };

  function norm(v) { return String(v == null ? '' : v).trim().toUpperCase(); }

  function fieldLabel(key) {
    if (!key) return '';
    if (key.indexOf('x:') === 0) return key.slice(2);
    return BONUS_LABELS[key] || DERIVED_LABELS[key] || key;
  }

  // Date d'OUVERTURE (jamais la clôture : elle est inconnue à l'entrée) si le marché est ouvert, sinon null.
  // Jour = jour calendaire de l'heure d'ouverture telle qu'elle est écrite dans le fichier ; samedi et dimanche = fermé.
  // (Le forex ouvre le dimanche 22 h UTC = lundi 0 h en UTC+2, l'heure d'un fichier TradingView : le calendrier est exact.)
  function openMarketDate(t) {
    const d = toDate(t.open || t.date);
    if (!d) return null;
    const wd = d.getUTCDay();
    return wd === 0 || wd === 6 ? null : d;
  }

  function openHour(t) {
    const d = openMarketDate(t);
    return d ? d.getUTCHours() : null;
  }

  function parseWindow(v) {
    const m = /^(\d{1,2})h-(\d{1,2})h$/.exec(String(v || ''));
    return m ? [Number(m[1]) % 24, Number(m[2]) % 24] : null;
  }

  function inWindow(h, w) {
    if (w[0] === w[1]) return false;
    return w[0] < w[1] ? h >= w[0] && h < w[1] : h >= w[0] || h < w[1];
  }

  function derivedValue(t, key) {
    const d = openMarketDate(t);
    if (!d) return undefined;
    if (key === 'd:weekday') return WEEKDAYS[d.getUTCDay()];
    if (key === 'd:session') {
      const h = d.getUTCHours();
      const s = SESSIONS.find((x) => h >= x[0] && h < x[1]);
      return s ? s[2] : undefined;
    }
    return undefined;
  }

  function bonusValue(t, key) {
    if (!t || !key) return undefined;
    if (key.indexOf('d:') === 0) return derivedValue(t, key);
    if (key.indexOf('x:') === 0) return t.extra ? t.extra[key.slice(2)] : undefined;
    return t[key];
  }

  function condMatch(c, t) {
    if (c.field === 'd:window') {
      const w = parseWindow(c.value), h = openHour(t);
      return !!w && h != null && inWindow(h, w);
    }
    const v = bonusValue(t, c.field);
    return v != null && norm(v) !== '' && norm(v) === norm(c.value);
  }

  function condsMatch(conds, t) {
    return (conds || []).every((c) => condMatch(c, t));
  }

  // Part des trades dont l'heure du jour n'est pas minuit pile (sinon les sessions n'ont aucun sens).
  function clockShare(trades) {
    let n = 0, c = 0;
    trades.forEach((t) => { const d = toDate(t.open || t.date); if (!d) return; n++; if (d.getUTCHours() || d.getUTCMinutes()) c++; });
    return n ? c / n : 0;
  }

  // Colonnes qui « trichent » : leurs valeurs recopient le résultat du trade (ex. une IA a mis TP2 / SL / BE dans
  // « Facultatif ») ou le RR. Ces informations ne sont connues qu'APRÈS le trade : s'en servir comme bonus reviendrait
  // à ignorer les SL à l'avance. Renvoie 'result', 'rr' ou null.
  function leakKind(trades, key) {
    if (key.indexOf('d:') === 0) return null;
    const by = new Map(), all = { SL: 0, BE: 0, TP: 0 };
    let total = 0, numN = 0, numEq = 0;
    trades.forEach((t) => {
      const v = bonusValue(t, key);
      if (v == null || norm(v) === '') return;
      total++;
      const r = isSL(t) ? 'SL' : isBE(t) ? 'BE' : 'TP';
      all[r]++;
      const k = norm(v);
      if (!by.has(k)) by.set(k, { SL: 0, BE: 0, TP: 0 });
      by.get(k)[r]++;
      const nv = Number(String(v).replace(',', '.'));
      if (isFinite(nv)) { numN++; const rr = Number(t.rr) || 0; if (Math.abs(nv - rr) < 1e-9 || Math.abs(nv - Math.abs(rr)) < 1e-9) numEq++; }
    });
    if (total < 20) return null;
    if (numN >= total * 0.9 && numEq >= numN * 0.85) return 'rr';
    if (by.size < 2 || by.size > total / 5) return null;
    let good = 0;
    by.forEach((c) => { good += Math.max(c.SL, c.BE, c.TP); });
    const base = Math.max(all.SL, all.BE, all.TP);
    return good >= total * 0.97 && good - base >= total * 0.1 ? 'result' : null;
  }

  function explicitKeys(trades) {
    const keys = new Map();
    trades.forEach((t) => {
      Object.keys(BONUS_LABELS).forEach((k) => { if (t[k] != null && norm(t[k]) !== '') keys.set(k, BONUS_LABELS[k]); });
      if (t.extra) Object.keys(t.extra).forEach((h) => { if (t.extra[h] != null && norm(t.extra[h]) !== '') keys.set('x:' + h, h); });
    });
    return keys;
  }

  // Colonnes écartées des bonus parce qu'elles trichent : [{ key, label, kind, values }].
  function detectLeakFields(trades) {
    const out = [];
    explicitKeys(trades).forEach((label, key) => {
      const kind = leakKind(trades, key);
      if (!kind) return;
      const vals = [...new Set(trades.map((t) => bonusValue(t, key)).filter((v) => v != null && norm(v) !== '').map((v) => String(v).trim()))];
      out.push({ key, label, kind, values: kind === 'result' ? vals.slice(0, 6) : [] });
    });
    return out;
  }

  // Bonus exploitables : au moins 2 valeurs, au plus 15, renseignés sur ≥ 30 % des trades ; jamais une colonne qui triche.
  function detectBonusFields(trades, opts) {
    const maxValues = (opts && opts.maxValues) || 15;
    const withDerived = !opts || opts.derived !== false;
    const keys = explicitKeys(trades);
    [...keys.keys()].forEach((k) => { if (leakKind(trades, k)) keys.delete(k); });
    if (withDerived && trades.length >= 20) {
      keys.set('d:weekday', DERIVED_LABELS['d:weekday']);
      if (clockShare(trades) >= 0.5) keys.set('d:session', DERIVED_LABELS['d:session']);
    }
    const out = [];
    keys.forEach((label, key) => {
      const counts = new Map();
      let filled = 0;
      trades.forEach((t) => {
        const v = bonusValue(t, key);
        if (v == null || norm(v) === '') return;
        filled++;
        const n = norm(v);
        if (!counts.has(n)) counts.set(n, { value: key.indexOf('d:') === 0 ? String(v) : (String(v).trim().toUpperCase() === n ? n : String(v).trim()), count: 0 });
        counts.get(n).count++;
      });
      if (counts.size < 2 || counts.size > maxValues || filled < trades.length * 0.3) return;
      const order = DERIVED_ORDER[key];
      const values = [...counts.values()].sort(order ? (a, b) => order.indexOf(a.value) - order.indexOf(b.value) : (a, b) => b.count - a.count);
      out.push({ key, label, derived: key.indexOf('d:') === 0, coverage: filled / trades.length * 100, values });
    });
    return out;
  }

  // Série de SL d'un « périmètre » : les trades qui vérifient les conditions d'une règle (ou tous les trades
  // pour un palier global). Elle compte les résultats de TOUS les trades du périmètre, pris ou non : un
  // trade mis en pause (risque 0) continue donc de « compter » et la pause s'arrête au prochain trade non-SL
  // (« CONTRE à 3 SL d'affilée → 0 % jusqu'à son prochain trade non-SL »).
  function scopeKey(conds) { return (conds || []).map((c) => c.field + '=' + norm(c.value)).sort().join('&'); }

  function collectScopes(cfg) {
    const m = new Map();
    (cfg.tiers || []).forEach((x) => { if (x.afterSl > 0) m.set('', []); });
    (cfg.rules || []).forEach((x) => { if (x.afterSl > 0) { const k = scopeKey(x.conds); if (!m.has(k)) m.set(k, x.conds || []); } });
    return [...m.entries()].map(([key, conds]) => ({ key, conds }));
  }

  // Risque d'un trade : base, paliers (afterSl) et règles « Si », la plus précise l'emporte.
  // streakOf(key) : série de SL courante du périmètre (ou un nombre, valable pour tous les périmètres).
  function resolveRisk(t, cfg, streakOf) {
    const so = typeof streakOf === 'function' ? streakOf : () => streakOf || 0;
    let best = null, bestScore = -1;
    const test = (conds, afterSl, risk, order) => {
      if (afterSl != null && afterSl > 0 && so(scopeKey(conds)) < afterSl) return;
      if (!condsMatch(conds, t)) return;
      const score = (conds ? conds.length : 0) * 1000000 + (afterSl || 0) * 1000 + order;
      if (score >= bestScore) { best = risk; bestScore = score; }
    };
    let order = 0;
    (cfg.tiers || []).forEach((x) => test([], x.afterSl, x.newRisk, order++));
    (cfg.rules || []).forEach((x) => test(x.conds, x.afterSl, x.risk, order++));
    return best == null ? cfg.risk : best;
  }

  // Chronologie réelle d'un backtest : le risque d'un trade est décidé à son OUVERTURE, en ne regardant que
  // les trades DÉJÀ CLÔTURÉS à cet instant ; le capital bouge à la clôture. (Décider à la clôture, comme si on
  // connaissait déjà les trades qui se sont terminés pendant que la position était ouverte, serait tricher.)
  // À égalité d'horaire, une clôture passe avant une ouverture. Sans heure d'ouverture, l'ouverture précède
  // la clôture de 1 ms.
  function buildEvents(ordered) {
    const evs = [];
    ordered.forEach((t, i) => {
      const c = toDate(t.close || t.open || t.date), o = toDate(t.open || t.date || t.close);
      const ct = c ? c.getTime() : 0;
      let ot = o ? o.getTime() : ct;
      if (ot >= ct) ot = ct - 1;
      evs.push([ot, 1, i], [ct, 0, i]);
    });
    evs.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    return evs;
  }

  // riskConfig : { risk, tiers:[{afterSl,newRisk}], rules:[{conds,afterSl,risk}] }.
  // Un trade dont le risque résolu est 0 est IGNORÉ : il n'entre ni dans la courbe ni dans les stats,
  // mais son résultat continue de compter dans les séries de SL de son périmètre.
  // Risque décidé pour chaque trade (même ordre que sortedTrades), en %, 0 = ignoré. Il ne dépend que des résultats
  // des trades (séries de SL en ombre), jamais du capital : on peut donc le calculer une fois pour toutes.
  function riskSeries(trades, riskConfig) {
    const ordered = sortedTrades(trades);
    const scopes = collectScopes(riskConfig);
    const streaks = new Map(scopes.map((sc) => [sc.key, 0]));
    const streakOf = (k) => streaks.get(k) || 0;
    const assigned = new Array(ordered.length).fill(0);
    buildEvents(ordered).forEach(([, kind, i]) => {
      const t = ordered[i];
      if (kind === 1) { assigned[i] = resolveRisk(t, riskConfig, streakOf); return; }
      const sl = isSL(t);
      scopes.forEach((sc) => { if (condsMatch(sc.conds, t)) streaks.set(sc.key, sl ? streakOf(sc.key) + 1 : 0); });
    });
    return assigned;
  }

  // Money management lisible : une ligne par logique (valeur de bonus) avec son risque et son palier, ou une ligne
  // globale. `scale` multiplie tous les risques (la simulation propfirm recale le risque par firme).
  function describeConfig(cfg, scale) {
    const s = scale == null ? 1 : scale;
    const r3 = (x) => Math.round(x * s * 1000) / 1000;
    const rules = cfg.rules || [];
    const groups = new Map();
    const others = [];
    rules.forEach((r) => {
      if ((r.conds || []).length === 1) {
        const c = r.conds[0], k = scopeKey(r.conds);
        if (!groups.has(k)) groups.set(k, { cond: c, base: null, tiers: [] });
        const g = groups.get(k);
        if (r.afterSl > 0) g.tiers.push({ afterSl: r.afterSl, risk: r3(r.risk) }); else g.base = r3(r.risk);
      } else others.push(r);
    });
    const label = (c) => (c.field === 'd:window' ? 'Heures ' + c.value : c.field.indexOf('d:') === 0 ? c.value : fieldLabel(c.field) + ' ' + c.value);
    const lines = [];
    const gv = [...groups.values()];
    const isGroupMM = gv.some((g) => g.tiers.length) || (gv.length > 0 && gv.every((g) => g.base != null && g.base > 0));
    const tiers = (cfg.tiers || []).map((t) => ({ afterSl: t.afterSl, risk: r3(t.newRisk) }));
    if (isGroupMM) {
      groups.forEach((g) => lines.push({ name: g.cond.field === 'd:window' ? 'Heures ' + g.cond.value : g.cond.value, base: g.base != null ? g.base : r3(cfg.risk), tiers: g.tiers.sort((a, b) => a.afterSl - b.afterSl) }));
    } else {
      lines.push({ name: null, base: r3(cfg.risk), tiers });
      groups.forEach((g) => lines.push({ name: label(g.cond), base: g.base != null ? g.base : null, tiers: g.tiers, text: g.base === 0 ? 'ignoré' : null }));
    }
    others.forEach((r) => lines.push({ name: r.conds.map(label).join(' + '), base: r3(r.risk), tiers: [], text: r.risk === 0 ? 'ignoré' : null }));
    return lines;
  }

  function simulate(trades, capital0, riskConfig) {
    const ordered = sortedTrades(trades);
    let capital = capital0;
    let skipped = 0;
    const scopes = collectScopes(riskConfig);
    const streaks = new Map(scopes.map((sc) => [sc.key, 0]));
    const streakOf = (k) => streaks.get(k) || 0;
    const assigned = new Array(ordered.length).fill(0);
    const curve = [{ date: toDate(ordered[0] && (ordered[0].open || ordered[0].date)), capital, trade: null, riskUsed: null }];
    buildEvents(ordered).forEach(([, kind, i]) => {
      const t = ordered[i];
      if (kind === 1) { assigned[i] = resolveRisk(t, riskConfig, streakOf); return; }
      const risk = assigned[i];
      if (!(risk > 0)) skipped++;
      else {
        const rr = isBE(t) ? 0 : Number(t.rr) || 0;
        capital = capital * (1 + (risk / 100) * rr);
        curve.push({ date: toDate(t.close || t.open || t.date), capital, trade: t, riskUsed: risk });
      }
      const sl = isSL(t);
      scopes.forEach((sc) => { if (condsMatch(sc.conds, t)) streaks.set(sc.key, sl ? streakOf(sc.key) + 1 : 0); });
    });
    curve.skipped = skipped;
    return curve;
  }

  function maxDrawdownPct(curve) {
    let peak = curve[0].capital, maxDd = 0;
    curve.forEach((pt) => {
      if (pt.capital > peak) peak = pt.capital;
      const dd = peak > 0 ? (peak - pt.capital) / peak * 100 : 0;
      if (dd > maxDd) maxDd = dd;
    });
    return maxDd;
  }

  // Episodes de drawdown superieurs a un seuil (ex. 10%) - meme principe que
  // ddEpisodes() dans allin-engine.js : un episode commence au dernier pic,
  // se termine quand un nouveau pic est atteint, et n'est retenu que si son
  // creux le plus profond depasse le seuil.
  function drawdownEpisodes(curve, thresholdPct) {
    const episodes = [];
    let peak = curve[0].capital, peakDate = curve[0].date;
    let inDd = false, worst = 0, worstDate = null;
    curve.forEach((pt) => {
      if (pt.capital >= peak) {
        if (inDd && worst >= thresholdPct) episodes.push({ from: peakDate, worstDate, to: pt.date, depthPct: worst });
        peak = pt.capital; peakDate = pt.date; inDd = false; worst = 0; worstDate = null;
      } else {
        const dd = peak > 0 ? (peak - pt.capital) / peak * 100 : 0;
        inDd = true;
        if (dd > worst) { worst = dd; worstDate = pt.date; }
      }
    });
    if (inDd && worst >= thresholdPct) {
      episodes.push({ from: peakDate, worstDate, to: curve[curve.length - 1].date, depthPct: worst });
    }
    return episodes;
  }

  // Plus forte baisse capital d'un jour calendaire au suivant. Necessite des
  // dates de cloture reelles pour etre fiable (voir warning cote appelant) -
  // sans elles, on retombe sur "date" seule, ce qui suppose (a tort,
  // potentiellement) que chaque position se cloture le jour de "date".
  function maxDailyDrawdownPct(curve) {
    const byDay = new Map();
    curve.forEach((pt) => { if (pt.date) byDay.set(dayKey(pt.date), pt.capital); });
    const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    if (days.length < 2) return 0;
    let maxDd = 0;
    for (let i = 1; i < days.length; i++) {
      const prevCap = days[i - 1][1], cap = days[i][1];
      const dd = prevCap > 0 ? (prevCap - cap) / prevCap * 100 : 0;
      if (dd > maxDd) maxDd = dd;
    }
    return maxDd;
  }

  function monthlyBreakdown(curve) {
    const months = new Map();
    let prevCap = curve[0].capital;
    curve.slice(1).forEach((pt) => {
      if (!pt.date) return;
      const key = pt.date.toISOString().slice(0, 7);
      if (!months.has(key)) months.set(key, { startCap: prevCap, endCap: prevCap, trades: 0, wins: 0 });
      const m = months.get(key);
      m.endCap = pt.capital;
      m.trades += 1;
      if (pt.trade && !isSL(pt.trade)) m.wins += 1;
      prevCap = pt.capital;
    });
    return [...months.entries()].map(([key, m]) => ({
      key,
      pct: m.startCap > 0 ? (m.endCap / m.startCap - 1) * 100 : 0,
      trades: m.trades,
      winRate: m.trades ? (m.wins / m.trades * 100) : 0,
    })).sort((a, b) => a.key.localeCompare(b.key));
  }

  function computeStats(curve, trades) {
    const wins = trades.filter((t) => !isSL(t)).length;
    const losses = trades.filter((t) => isSL(t)).length;
    const grossWin = trades.filter((t) => Number(t.rr) > 0).reduce((s, t) => s + Number(t.rr), 0);
    const grossLoss = Math.abs(trades.filter((t) => Number(t.rr) < 0).reduce((s, t) => s + Number(t.rr), 0));
    const startCap = curve[0].capital;
    const finalCap = curve[curve.length - 1].capital;
    return {
      totalTrades: trades.length,
      wins, losses,
      winRatePct: trades.length ? (wins / trades.length * 100) : 0,
      performancePct: startCap > 0 ? (finalCap / startCap - 1) * 100 : 0,
      finalCapital: finalCap,
      maxDrawdownPct: maxDrawdownPct(curve),
      profitFactor: grossLoss > 0 ? (grossWin / grossLoss) : null,
    };
  }

  /**
   * Calcule le rapport complet (courbe, stats, episodes de drawdown,
   * mois par mois) pour un jeu de trades + une config de risque donnee.
   * riskConfig: { risk: number (%), tiers: [{afterSl, newRisk}], rules?: [{conds:[{field,value}], afterSl, risk}] }
   */
  function computeReport(trades, capital0, riskConfig) {
    const curve = simulate(trades, capital0, riskConfig || { risk: 1, tiers: [] });
    const taken = curve.slice(1).map((pt) => pt.trade);
    const stats = computeStats(curve, taken);
    stats.skippedTrades = curve.skipped || 0;
    return {
      curve,
      stats,
      drawdownEpisodes: drawdownEpisodes(curve, 10),
      monthly: monthlyBreakdown(curve),
      maxDailyDrawdownPct: maxDailyDrawdownPct(curve),
    };
  }

  // ---------------------------------------------------------------
  // Optimisation automatique du risque : balayage exhaustif d'une grille de
  // valeurs (0.1% a 5%, pas de 0.1) evaluee sur l'historique fourni, sous
  // contrainte. C'est une recherche transparente, pas un modele d'IA - le
  // meilleur candidat qui respecte la contrainte est garde tel quel.
  // ---------------------------------------------------------------
  const RISK_GRID = (() => {
    const steps = [];
    for (let r = 0.1; r <= 5; r = +(r + 0.1).toFixed(2)) steps.push(r);
    return steps;
  })();

  function bestUnderConstraint(trades, capital0, maxRisk, maxDd, maxDailyDd) {
    let best = null;
    RISK_GRID.filter((r) => r <= maxRisk).forEach((risk) => {
      const report = computeReport(trades, capital0, { risk, tiers: [] });
      if (maxDd != null && report.stats.maxDrawdownPct > maxDd) return;
      if (maxDailyDd != null && report.maxDailyDrawdownPct > maxDailyDd) return;
      if (!best || report.stats.performancePct > best.report.stats.performancePct) {
        best = { risk, report };
      }
    });
    return best;
  }

  /**
   * Optimisation "compte propre" : maximise le retour sous contrainte
   * souple (risque <=5%, idealement <=3% ; DD max <=30% si atteignable).
   * Relache progressivement la contrainte si rien ne la satisfait
   * pleinement, et le signale.
   */
  function optimizeCp(trades, capital0) {
    let result = bestUnderConstraint(trades, capital0, 3, 30);
    if (result) return { ...result, relaxed: false };
    result = bestUnderConstraint(trades, capital0, 5, 30);
    if (result) return { ...result, relaxed: true, relaxedNote: 'Risque étendu à 5% (aucun réglage ≤3% ne respectait un DD max de 30%).' };
    result = bestUnderConstraint(trades, capital0, 5, null);
    if (result) return { ...result, relaxed: true, relaxedNote: 'Contrainte de drawdown max (30%) non atteignable sur cet historique — meilleur compromis retenu.' };
    return null;
  }

  /**
   * Optimisation "propfirm" : maximise le retour sous contrainte STRICTE
   * (jamais >5% de DD journalier, jamais >10% de DD max). Si aucun palier
   * de risque (meme le plus bas de la grille) ne respecte ces limites,
   * renvoie null plutot que de forcer un resultat trompeur.
   */
  function optimizePf(trades, capital0) {
    return bestUnderConstraint(trades, capital0, 5, 10, 5);
  }

  // ---------------------------------------------------------------
  // Réglage PREMIUM (mode automatique) : trois profils par compte, chacun avec
  // son propre objectif. Pour chaque profil la recherche est exhaustive sur le
  // risque de base × le palier « après N SL », puis affinée par montée de
  // coordonnées sur les règles « Si » (chaque valeur d'un bonus est réglée
  // indépendamment : étiquette, tendance/contre, session, jour, détention…).
  // Recherche transparente sur l'historique, jamais une prédiction. Chaque
  // profil est vérifié sur les 40 % de trades les plus récents, que le calcul
  // n'a pas vus (réglage appris sur les 60 % premiers), et son pire cas est
  // estimé en mélangeant l'ordre des trades (300 tirages, graine fixe).
  //
  // GÉNÉRALITÉS, pas coïncidences : le passé ne fait pas le futur, donc une règle n'existe que si
  // (1) son groupe pèse au moins 30 trades et 4 % de l'historique, (2) son écart de gain moyen
  // face au reste a le même signe dans les DEUX moitiés de l'historique et reste net sur le tout,
  // (3) elle est simple : une session entière, un jour, une plage d'heures contiguë (« pas de
  // trading de 1 h à 3 h »), une étiquette — jamais un croisement session × jour. Le sens de la
  // règle suit l'écart (moins bon → réduire ou ignorer ; meilleur → augmenter).
  // ---------------------------------------------------------------
  const MIN_GROUP_ABS = 30;
  const MIN_GROUP_SHARE = 0.04;
  const minGroupOf = (nTrades) => Math.max(MIN_GROUP_ABS, Math.ceil(nTrades * MIN_GROUP_SHARE));
  const Z_GATE = 1.5;    // écart minimal (en écarts-types) pour qu'un groupe ait droit à une règle
  const Z_SCAN = 2.3;    // idem pour une plage d'heures, choisie parmi beaucoup de candidates
  const MAX_RULES = 6;   // au-delà, le réglage n'est plus applicable ni fiable : on élague
  const MC_RUNS = 300;
  const MULTS = [0, 0.5, 0.75, 1, 1.25, 1.5, 2]; // multiplicateur du risque de base par groupe (1 = pas de règle)
  const M_ONE = 3;
  const TIERS = [null];
  [1, 2, 3, 4, 5].forEach((a) => [0, 0.1, 0.25, 1 / 3, 0.5, 0.75].forEach((f) => TIERS.push({ a, f })));
  const GRID_CP_BOLD = [1, 2, 3, 4, 5, 6, 8, 10, 12];
  const GRID_CP = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5];
  const GRID_PF = [0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];
  const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
  const round2 = (x) => Math.round(x * 100) / 100;
  const round3 = (x) => Math.round(x * 1000) / 1000;
  // Risque d'un palier / d'un multiplicateur : jamais sous le plus petit risque réalisable (lot minimum), 0 = pause.
  const minOf = (prof) => (prof.minRisk == null ? 0.05 : prof.minRisk);
  const tierRisk = (prof, base, f) => (f === 0 ? 0 : Math.max(round3(base * f), minOf(prof)));

  // steps : limites de plus en plus souples, essayées dans l'ordre tant qu'aucun réglage ne les respecte.
  const PROFILES = {
    cp: [
      { id: 'growth', name: 'Croissance', short: 'Partir de peu, monter haut',
        goal: 'Gros risque, réduit après une série de SL, sans jamais cramer le compte : pour faire grimper un petit capital.',
        grid: GRID_CP_BOLD, steps: [{ maxDd: 55 }, { maxDd: 70 }], mc: { dd: 70, p: 5 },
        score: (m) => m.perf },
      { id: 'ratio', name: 'Meilleur ratio', short: 'Le plus de rendement pour le risque',
        goal: 'Le meilleur rendement mensuel moyen rapporté au drawdown subi.',
        grid: GRID_CP, steps: [{ maxDd: 35 }, { maxDd: 50 }, { maxDd: null }],
        score: (m) => m.avgM / Math.max(m.maxDd, 1) },
      { id: 'safe', name: 'Prudent', short: 'Raisonnable, sans grosses secousses',
        goal: 'Le rendement le plus régulier avec un drawdown contenu et aucun mois catastrophique.',
        grid: GRID_CP, steps: [{ maxDd: 15, worstM: -8 }, { maxDd: 20, worstM: -12 }, { maxDd: 30 }, { maxDd: null }],
        score: (m) => m.avgM * m.posM },
    ],
    pf: [
      { id: 'regular', name: 'Régularité', short: 'Rendement mensuel le plus stable',
        goal: 'Le rendement mensuel le plus stable d\'un mois à l\'autre (meilleur ratio rendement / variation), puis le plus haut possible parmi les réglages aussi stables, dans les limites de la propfirm.',
        grid: GRID_PF, steps: [{ maxDd: 8, maxDaily: 4 }, { maxDd: 10, maxDaily: 5 }],
        score: (m) => (m.stdM > 0 ? Math.round((m.avgM / m.stdM) * 20) * 1e6 : 0) + Math.min(m.avgM, 9e5) },
      { id: 'perf', name: 'Performance pure', short: 'Le plus de profit possible',
        goal: 'La plus forte performance totale qui respecte les limites de perte de la propfirm.',
        grid: GRID_PF, steps: [{ maxDd: 10, maxDaily: 5 }],
        score: (m) => m.perf },
      { id: 'safe', name: 'Sécurité', short: 'Loin des limites, quand même rentable',
        goal: 'Reste loin des limites de perte (DD ≤ 6 %, jour ≤ 3 %) et vise un rendement régulier ; le pire cas mélangé doit aussi passer.',
        grid: GRID_PF, steps: [{ maxDd: 6, maxDaily: 3 }, { maxDd: 8, maxDaily: 4 }, { maxDd: 10, maxDaily: 5 }], mc: { dd: 10, p: 5 },
        score: (m) => m.avgM * m.posM },
    ],
  };

  function feasible(m, L) {
    return (L.maxDd == null || m.maxDd <= L.maxDd + 1e-9)
      && (L.maxDaily == null || m.maxDaily <= L.maxDaily + 1e-9)
      && (L.worstM == null || m.worstM >= L.worstM - 1e-9);
  }

  function buildPre(ordered) {
    const n = ordered.length;
    const rr = new Float64Array(n), sl = new Uint8Array(n), hr = new Int8Array(n), dk = new Array(n), mk = new Array(n);
    ordered.forEach((t, i) => {
      rr[i] = isBE(t) ? 0 : Number(t.rr) || 0;
      sl[i] = isSL(t) ? 1 : 0;
      const h = openHour(t); hr[i] = h == null ? -1 : h;
      const d = toDate(t.close || t.open || t.date);
      const k = d ? d.toISOString() : '';
      dk[i] = k.slice(0, 10); mk[i] = k.slice(0, 7);
    });
    const evs = buildEvents(ordered);
    const ev = new Int32Array(evs.length);
    evs.forEach((e, k) => { ev[k] = e[2] * 2 + e[1]; }); // idx × 2 + 1 (ouverture) ou 0 (clôture)
    return { n, rr, sl, hr, dk, mk, ev, zeros: new Int16Array(n) };
  }

  // Un état = { bi (risque de base), ti (palier), mi[] (multiplicateur par groupe) } ; groupe 0 = « le reste ».
  function stateCfg(prof, st, gs) {
    const base = prof.grid[st.bi];
    const t = TIERS[st.ti];
    const rg = [-1];
    const cap = prof.grid[prof.grid.length - 1];
    if (gs) for (let g = 1; g < gs.groups.length; g++) rg.push(MULTS[st.mi[g]] === 1 ? -1 : MULTS[st.mi[g]] === 0 ? 0 : Math.min(cap, Math.max(round3(base * MULTS[st.mi[g]]), minOf(prof))));
    return { base, tier: t ? { a: t.a, r: tierRisk(prof, base, t.f) } : null, rg };
  }

  function stateConfig(prof, st, gs) {
    const c = stateCfg(prof, st, gs);
    const config = { risk: c.base, tiers: c.tier ? [{ afterSl: c.tier.a, newRisk: c.tier.r }] : [], rules: [] };
    if (gs) gs.groups.forEach((g, i) => {
      if (i > 0 && c.rg[i] >= 0) config.rules.push({ conds: g.conds.map((x) => ({ field: x.field, value: x.value })), afterSl: null, risk: c.rg[i] });
    });
    return config;
  }

  // Évaluation rapide (sans allocation de courbe) d'une configuration sur les trades [lo, hi).
  function evalRange(pre, lo, hi, gid, cfg) {
    let cap = 1, peak = 1, maxDd = 0, streak = 0;
    const gstk = cfg.gcfg ? new Int32Array(cfg.gcfg.length) : null; // séries propres à chaque valeur (mode « séparé »)
    const asg = new Float64Array(pre.n);
    let lastD = null, prevEnd = 1, dayEnd = 1, maxDaily = 0, bestDay = 0, sumPos = 0;
    let lastM = null, mStart = 1;
    const months = [];
    const closeDay = () => {
      const ret = prevEnd > 0 ? dayEnd / prevEnd - 1 : 0;
      if (-ret > maxDaily) maxDaily = -ret;
      if (ret > 0) { sumPos += ret; if (ret > bestDay) bestDay = ret; }
      prevEnd = dayEnd;
    };
    const ev = pre.ev;
    for (let e = 0; e < ev.length; e++) {
      const code = ev[e], i = code >> 1;
      if (i < lo || i >= hi) continue;
      const g = gid[i];
      if (code & 1) { // ouverture : risque décidé avec les séries des trades déjà clôturés
        const gc = cfg.gcfg ? cfg.gcfg[g] : null;
        const rg = cfg.rg[g];
        const tr = gc ? gc.tier : cfg.tier;
        const sk = gc && g > 0 ? gstk[g] : streak;
        asg[i] = rg >= 0 ? rg : (tr && sk >= tr.a ? tr.r : (gc ? gc.base : cfg.base));
        continue;
      }
      const d = pre.dk[i];
      if (d !== lastD) { if (lastD !== null) closeDay(); lastD = d; }
      const mk = pre.mk[i];
      if (mk !== lastM) { if (lastM !== null) months.push(cap / mStart - 1); mStart = cap; lastM = mk; }
      const r = asg[i];
      if (r > 0) {
        cap *= 1 + (r / 100) * pre.rr[i];
        if (cap > peak) peak = cap;
        const dd = (peak - cap) / peak; if (dd > maxDd) maxDd = dd;
      }
      const isSl = pre.sl[i];
      streak = isSl ? streak + 1 : 0;
      if (gstk && g > 0) gstk[g] = isSl ? gstk[g] + 1 : 0;
      dayEnd = cap;
    }
    if (lastD !== null) closeDay();
    if (lastM !== null) months.push(cap / mStart - 1);
    const nM = months.length;
    const avg = mean(months);
    const std = nM > 1 ? Math.sqrt(months.reduce((s, v) => s + (v - avg) * (v - avg), 0) / (nM - 1)) : 0;
    return {
      perf: (cap - 1) * 100, cap, maxDd: maxDd * 100, maxDaily: maxDaily * 100,
      avgM: avg * 100, stdM: std * 100, posM: nM ? months.filter((v) => v > 0).length / nM : 0,
      worstM: nM ? Math.min(...months) * 100 : 0, nM, bestShare: sumPos > 0 ? bestDay / sumPos : 0,
    };
  }

  function searchFlat(pre, lo, hi, prof) {
    for (let s = 0; s < prof.steps.length; s++) {
      let best = null;
      for (let bi = 0; bi < prof.grid.length; bi++) {
        for (let ti = 0; ti < TIERS.length; ti++) {
          const st = { bi, ti, mi: [M_ONE] };
          const m = evalRange(pre, lo, hi, pre.zeros, stateCfg(prof, st, null));
          if (!feasible(m, prof.steps[s])) continue;
          const sc = prof.score(m);
          if (!best || sc > best.score + 1e-12) best = { state: st, m, score: sc, stepIdx: s };
        }
      }
      if (best) return best;
    }
    return null;
  }

  // Droit à une règle : écart de gain moyen (en R) du groupe face au reste, de même signe dans les deux
  // moitiés de [lo, hi) ET net sur le tout. -1 = moins bon (réduire / ignorer), +1 = meilleur (augmenter), 0 = rien.
  function zStat(ng, sg, qg, N, S, Q) {
    const nr = N - ng;
    if (ng < 2 || nr < 2) return null;
    const mg = sg / ng, mr = (S - sg) / nr;
    const vg = Math.max(0, (qg - ng * mg * mg) / (ng - 1)), vr = Math.max(0, (Q - qg - nr * mr * mr) / (nr - 1));
    const se = Math.sqrt(vg / ng + vr / nr);
    return { d: mg - mr, z: se > 0 ? (mg - mr) / se : 0, n: ng, mg, mr };
  }

  function groupDirs(pre, lo, hi, gs) {
    const G = gs.groups.length, mid = (lo + hi) >> 1, minG = minGroupOf(hi - lo);
    const mk = () => ({ n: new Array(G).fill(0), s: new Array(G).fill(0), q: new Array(G).fill(0), N: 0, S: 0, Q: 0 });
    const T = mk(), A = mk(), B = mk();
    for (let i = lo; i < hi; i++) {
      const g = gs.gid[i], r = pre.rr[i];
      [T, i < mid ? A : B].forEach((X) => { X.n[g]++; X.s[g] += r; X.q[g] += r * r; X.N++; X.S += r; X.Q += r * r; });
    }
    const dirs = new Array(G).fill(0);
    for (let g = 1; g < G; g++) {
      const t = zStat(T.n[g], T.s[g], T.q[g], T.N, T.S, T.Q);
      const a = zStat(A.n[g], A.s[g], A.q[g], A.N, A.S, A.Q);
      const b = zStat(B.n[g], B.s[g], B.q[g], B.N, B.S, B.Q);
      if (!t || !a || !b || t.n < minG || a.n < 8 || b.n < 8) continue;
      if (Math.abs(t.z) < Z_GATE || a.d * b.d <= 0 || a.d * t.d <= 0) continue;
      dirs[g] = t.d < 0 ? -1 : 1;
    }
    return dirs;
  }

  // Plages d'heures d'ouverture (1 à 6 h contiguës, boucle possible) au gain moyen nettement différent du reste,
  // avec le même signe dans les deux moitiés de l'historique ; au plus `maxWin` plages qui ne se chevauchent pas.
  function scanWindows(pre, lo, hi, maxWin) {
    const mid = (lo + hi) >> 1, minG = minGroupOf(hi - lo);
    const H = () => ({ n: new Array(24).fill(0), s: new Array(24).fill(0), q: new Array(24).fill(0), N: 0, S: 0, Q: 0 });
    const T = H(), A = H(), B = H();
    for (let i = lo; i < hi; i++) {
      const h = pre.hr[i];
      if (h < 0) continue;
      const r = pre.rr[i];
      [T, i < mid ? A : B].forEach((X) => { X.n[h]++; X.s[h] += r; X.q[h] += r * r; X.N++; X.S += r; X.Q += r * r; });
    }
    const sum = (X, a0, len) => {
      let n = 0, s = 0, q = 0;
      for (let k = 0; k < len; k++) { const h = (a0 + k) % 24; n += X.n[h]; s += X.s[h]; q += X.q[h]; }
      return [n, s, q];
    };
    const found = [];
    for (let len = 1; len <= 6; len++) {
      for (let a0 = 0; a0 < 24; a0++) {
        const [n, s, q] = sum(T, a0, len);
        if (n < minG || n > T.N * 0.4) continue;
        const t = zStat(n, s, q, T.N, T.S, T.Q);
        const x = sum(A, a0, len), y = sum(B, a0, len);
        const ta = zStat(x[0], x[1], x[2], A.N, A.S, A.Q), tb = zStat(y[0], y[1], y[2], B.N, B.S, B.Q);
        if (!t || !ta || !tb || ta.n < 8 || tb.n < 8) continue;
        if (Math.abs(t.z) < Z_SCAN || ta.d * tb.d <= 0 || ta.d * t.d <= 0) continue;
        found.push({ a: a0, len, z: t.z, n, avg: t.mg, rest: t.mr });
      }
    }
    found.sort((p, q) => Math.abs(q.z) - Math.abs(p.z));
    const used = new Array(24).fill(false), out = [];
    for (const w of found) {
      if (out.length >= maxWin) break;
      let clash = false;
      for (let k = 0; k < w.len; k++) if (used[(w.a + k) % 24]) clash = true;
      if (clash) continue;
      for (let k = 0; k < w.len; k++) used[(w.a + k) % 24] = true;
      out.push(Object.assign(w, { value: `${w.a}h-${(w.a + w.len) % 24}h` }));
    }
    return out;
  }

  function windowGs(pre, wins) {
    if (!wins.length) return null;
    const groups = [{ conds: [], count: 0 }].concat(wins.map((w) => ({ conds: [{ field: 'd:window', value: w.value }], count: 0 })));
    const parsed = wins.map((w) => parseWindow(w.value));
    const gid = new Int16Array(pre.n);
    for (let i = 0; i < pre.n; i++) {
      const h = pre.hr[i];
      let g = 0;
      if (h >= 0) for (let k = 0; k < parsed.length; k++) if (inWindow(h, parsed[k])) { g = k + 1; break; }
      gid[i] = g; groups[g].count++;
    }
    return { groups, gid, fields: [{ key: 'd:window', derived: true }] };
  }

  // Montée de coordonnées : risque de base, palier, puis multiplicateur de chaque groupe autorisé
  // (sens imposé par groupDirs : moins bon → 0 / ×0,5 / ×0,75 ; meilleur → ×1,25 / ×1,5 / ×2).
  function ascent(pre, lo, hi, gs, prof, stepIdx, start) {
    const L = prof.steps[stepIdx];
    const dirs = groupDirs(pre, lo, hi, gs);
    const st = { bi: start.state.bi, ti: start.state.ti, mi: gs.groups.map(() => M_ONE) };
    let cur = evalRange(pre, lo, hi, gs.gid, stateCfg(prof, st, gs));
    let curScore = prof.score(cur);
    const range = (n) => Array.from({ length: n }, (_, i) => i);
    const coords = [{ k: 'bi', vals: range(prof.grid.length) }, { k: 'ti', vals: range(TIERS.length) }];
    for (let g = 1; g < gs.groups.length; g++) if (dirs[g] !== 0) coords.push({ k: 'g', g, vals: dirs[g] < 0 ? [0, 1, 2, M_ONE] : [M_ONE, 4, 5, 6] });
    for (let pass = 0; pass < 6; pass++) {
      let improved = false;
      coords.forEach((c) => {
        const get = () => (c.k === 'g' ? st.mi[c.g] : st[c.k]);
        const set = (v) => { if (c.k === 'g') st.mi[c.g] = v; else st[c.k] = v; };
        const orig = get();
        let bestV = orig, bestM = cur, bestS = curScore;
        c.vals.forEach((v) => {
          if (v === orig) return;
          set(v);
          const m = evalRange(pre, lo, hi, gs.gid, stateCfg(prof, st, gs));
          if (!feasible(m, L)) return;
          const sc = prof.score(m);
          if (sc > bestS + 1e-9) { bestV = v; bestM = m; bestS = sc; }
        });
        set(bestV);
        if (bestV !== orig) { cur = bestM; curScore = bestS; improved = true; }
      });
      if (!improved) break;
    }
    // Élagage : on retire les règles qui rapportent peu (≤ 5 % du score) puis, s'il en reste trop,
    // les moins utiles, pour garder un réglage simple à appliquer et moins collé à l'historique.
    const ref = curScore;
    for (;;) {
      const active = [];
      for (let g = 1; g < st.mi.length; g++) if (st.mi[g] !== M_ONE) active.push(g);
      if (!active.length) break;
      let bg = -1, bm = null, bs = 0, bl = Infinity;
      active.forEach((g) => {
        const keep = st.mi[g];
        st.mi[g] = M_ONE;
        const m = evalRange(pre, lo, hi, gs.gid, stateCfg(prof, st, gs));
        st.mi[g] = keep;
        if (!feasible(m, L)) return;
        const sc = prof.score(m);
        if (ref - sc < bl) { bl = ref - sc; bg = g; bm = m; bs = sc; }
      });
      if (bg < 0) break;
      if (bl <= Math.abs(ref) * 0.05 || active.length > MAX_RULES) { st.mi[bg] = M_ONE; cur = bm; curScore = bs; } else break;
    }
    const nRules = st.mi.filter((v, i) => i > 0 && v !== M_ONE).length;
    return { state: st, m: cur, score: curScore, nRules, stepIdx };
  }

  function mulberry32(a) {
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // Pire cas : DD max sur des ordres de trades mélangés (mêmes trades, autre séquence).
  function mcDrawdowns(pre, gid, cfg) {
    const n = pre.n, ord = new Int32Array(n), rand = mulberry32(20260920), dds = [];
    for (let run = 0; run < MC_RUNS; run++) {
      for (let i = 0; i < n; i++) ord[i] = i;
      for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const tmp = ord[i]; ord[i] = ord[j]; ord[j] = tmp; }
      let cap = 1, peak = 1, maxDd = 0, streak = 0;
      const gstk = cfg.gcfg ? new Int32Array(cfg.gcfg.length) : null;
      for (let k = 0; k < n; k++) {
        const i = ord[k];
        const g = gid[i];
        const gc = cfg.gcfg ? cfg.gcfg[g] : null;
        const rg = cfg.rg[g];
        const tr = gc ? gc.tier : cfg.tier;
        const sk = gc && g > 0 ? gstk[g] : streak;
        const r = rg >= 0 ? rg : (tr && sk >= tr.a ? tr.r : (gc ? gc.base : cfg.base));
        if (r > 0) {
          cap *= 1 + (r / 100) * pre.rr[i];
          if (cap > peak) peak = cap;
          const dd = (peak - cap) / peak; if (dd > maxDd) maxDd = dd;
        }
        streak = pre.sl[i] ? streak + 1 : 0;
        if (gstk && g > 0) gstk[g] = pre.sl[i] ? gstk[g] + 1 : 0;
      }
      dds.push(maxDd * 100);
    }
    dds.sort((a, b) => a - b);
    return dds;
  }
  const mcBreach = (dds, x) => dds.filter((v) => v >= x).length / dds.length;

  function maxSlStreak(ordered) {
    let best = 0, cur = 0;
    ordered.forEach((t) => { if (isSL(t)) { cur++; if (cur > best) best = cur; } else cur = 0; });
    return best;
  }

  function monthStats(monthly) {
    const v = monthly.map((m) => m.pct);
    const avg = mean(v);
    return {
      avgM: avg, posM: v.length ? v.filter((x) => x > 0).length / v.length : 0,
      worstM: v.length ? Math.min(...v) : 0, bestM: v.length ? Math.max(...v) : 0, nM: v.length,
    };
  }

  // ---------------------------------------------------------------
  // Mode « Si » forcé par l'utilisateur : chaque valeur d'un bonus (ex. TREND / CONTRE) reçoit son
  // PROPRE money management complet (risque de base + palier après N SL), cherché indépendamment.
  // Les séries de SL restent comptées sur l'ensemble des trades du compte.
  // ---------------------------------------------------------------
  function splitCfg(prof, st) {
    const gcfg = st.gb.map((bi, g) => {
      const base = prof.grid[bi], t = TIERS[st.gt[g]];
      return { base, tier: t ? { a: t.a, r: tierRisk(prof, base, t.f) } : null };
    });
    return { base: gcfg[0].base, tier: gcfg[0].tier, rg: gcfg.map(() => -1), gcfg };
  }

  const sameTier = (a, b) => (!a && !b) || (!!a && !!b && a.a === b.a && a.r === b.r);

  // Règles équivalentes : un groupe qui diffère du réglage global reçoit une règle de risque et, s'il a un
  // palier, une règle « après N SL » (plus précise, donc prioritaire sur le palier global).
  function splitConfigOut(prof, st, gs) {
    const c = splitCfg(prof, st), g0 = c.gcfg[0];
    const config = { risk: g0.base, tiers: g0.tier ? [{ afterSl: g0.tier.a, newRisk: g0.tier.r }] : [], rules: [] };
    gs.groups.forEach((grp, g) => {
      if (g === 0) return;
      const gc = c.gcfg[g];
      const conds = grp.conds.map((x) => ({ field: x.field, value: x.value }));
      config.rules.push({ conds, afterSl: null, risk: gc.base });
      if (gc.tier) config.rules.push({ conds: conds.map((x) => Object.assign({}, x)), afterSl: gc.tier.a, risk: gc.tier.r });
    });
    return config;
  }

  function splitInfo(prof, st, gs, field) {
    const c = splitCfg(prof, st);
    return {
      field, label: fieldLabel(field),
      groups: gs.groups.map((g, i) => ({
        value: i === 0 ? null : g.conds[0].value, count: g.count, base: c.gcfg[i].base,
        tier: c.gcfg[i].tier ? { afterSl: c.gcfg[i].tier.a, newRisk: c.gcfg[i].tier.r } : null,
      })).filter((g, i) => i > 0 || g.count > 0),
    };
  }

  // Ne garde que les valeurs assez fréquentes ; les autres trades retombent dans le groupe 0 (réglage global).
  function activeGroups(gs, n, minG) {
    const keep = [0];
    gs.groups.forEach((g, i) => { if (i > 0 && g.count >= minG) keep.push(i); });
    if (keep.length < 2) return null;
    const map = new Map(keep.map((old, idx) => [old, idx]));
    const groups = keep.map((old) => ({ conds: gs.groups[old].conds, count: 0 }));
    const gid = new Int16Array(n);
    for (let i = 0; i < n; i++) { const g = map.has(gs.gid[i]) ? map.get(gs.gid[i]) : 0; gid[i] = g; groups[g].count++; }
    return { groups, gid, fields: gs.fields };
  }

  // Recherche jointe (risque de base × palier) groupe par groupe, les autres étant fixés.
  function ascentSplit(pre, lo, hi, gs, prof, stepIdx, start) {
    const L = prof.steps[stepIdx], G = gs.groups.length;
    const st = { gb: new Array(G).fill(start.state.bi), gt: new Array(G).fill(start.state.ti) };
    const counts = new Array(G).fill(0);
    for (let i = lo; i < hi; i++) counts[gs.gid[i]]++;
    const ev = () => evalRange(pre, lo, hi, gs.gid, splitCfg(prof, st));
    let cur = ev(), curScore = prof.score(cur);
    for (let pass = 0; pass < 4; pass++) {
      let improved = false;
      for (let g = 0; g < G; g++) {
        if (!counts[g]) continue;
        const ob = st.gb[g], ot = st.gt[g];
        let bb = ob, bt = ot, bm = cur, bs = curScore;
        for (let bi = 0; bi < prof.grid.length; bi++) {
          for (let ti = 0; ti < TIERS.length; ti++) {
            if (bi === ob && ti === ot) continue;
            st.gb[g] = bi; st.gt[g] = ti;
            const m = ev();
            if (!feasible(m, L)) continue;
            const sc = prof.score(m);
            if (sc > bs + 1e-9) { bb = bi; bt = ti; bm = m; bs = sc; }
          }
        }
        st.gb[g] = bb; st.gt[g] = bt;
        if (bb !== ob || bt !== ot) { cur = bm; curScore = bs; improved = true; }
      }
      if (!improved) break;
    }
    return { state: st, m: cur, score: curScore, stepIdx };
  }

  /**
   * kind : 'cp' | 'pf'. Renvoie { profiles:[…3], fields:[libellés pris en compte] } ou { error }.
   * Profil : { id, name, short, goal, config:{risk,tiers,rules}, logic (libellé ou null), perf, dd, daily, avgM,
   *            posM, worstM, nM, bestShare, finalMult, mc:{p95, breach}, trust:'ok'|'warn'|'none', oos, note }
   */
  function optimizeProfiles(trades, capital0, kind, opts) {
    // Plus petit risque réalisable (lot minimum) : aucun risque, palier ou multiplicateur n'ira en dessous (0 = pause).
    const minRisk = opts && opts.minRiskPct > 0 ? opts.minRiskPct : 0.05;
    const ordered = sortedTrades(trades);
    const n = ordered.length;
    if (n < 20) return { error: 'Il faut au moins 20 trades pour calculer un réglage premium.' };
    const pre = buildPre(ordered);
    const fields = detectBonusFields(ordered);
    const canon = new Map(fields.map((f) => [f.key, new Map(f.values.map((v) => [norm(v.value), v.value]))]));
    const gsCache = new Map();
    const groupsFor = (fs) => {
      const ck = fs.map((f) => f.key).join('|');
      if (gsCache.has(ck)) return gsCache.get(ck);
      const groups = [{ conds: [], count: 0 }], index = new Map();
      const gid = new Int16Array(n);
      ordered.forEach((t, i) => {
        const parts = fs.map((f) => { const v = bonusValue(t, f.key); return v == null || norm(v) === '' ? null : { field: f.key, value: canon.get(f.key).get(norm(v)) || String(v).trim() }; });
        if (parts.some((p) => p === null)) { groups[0].count++; gid[i] = 0; return; }
        const k = parts.map((p) => p.field + '=' + norm(p.value)).join('&');
        if (!index.has(k)) { index.set(k, groups.length); groups.push({ conds: parts, count: 0 }); }
        const g = index.get(k); groups[g].count++; gid[i] = g;
      });
      const gs = groups.length < 2 ? null : { groups, gid, fields: fs };
      gsCache.set(ck, gs);
      return gs;
    };
    const cut = n >= 60 ? Math.floor(n * 0.6) : 0;
    const built = [];
    const debug = {};
    // Bonus imposé par l'utilisateur (« + Si » en mode Automatique) : un money management par valeur.
    const splitField = opts && opts.split ? opts.split : null;
    let splitGs = null;
    if (splitField) {
      const f = fields.find((x) => x.key === splitField);
      const raw = f ? groupsFor([f]) : null;
      splitGs = raw ? activeGroups(raw, n, minGroupOf(n)) : null;
      if (!splitGs) return { error: `Trop peu de trades par valeur de « ${fieldLabel(splitField)} » pour séparer les réglages (il faut au moins ${minGroupOf(n)} trades par valeur).` };
    }

    const PROFS = PROFILES[kind].map((pr) => {
      let grid = pr.grid.filter((g) => g >= minRisk - 1e-9);
      if (!grid.length) grid = [Math.ceil(minRisk * 100) / 100];
      return Object.assign({}, pr, { grid, minRisk });
    });
    // Ajoute un réglage « séparé » (un money management par valeur) : pire cas, note, résultat.
    const pushSplit = (prof, stepIdx, stS, gsS, field, oos) => {
      let dds = mcDrawdowns(pre, gsS.gid, splitCfg(prof, stS));
      let note = stepIdx > 0 ? 'Limite assouplie : aucun réglage ne tenait la limite visée sur cet historique.' : null;
      if (prof.mc) {
        let backed = 0;
        while (mcBreach(dds, prof.mc.dd) > prof.mc.p / 100 && stS.gb.some((b) => b > 0)) {
          stS.gb = stS.gb.map((b) => Math.max(0, b - 1)); backed++;
          dds = mcDrawdowns(pre, gsS.gid, splitCfg(prof, stS));
        }
        if (backed) note = (note ? note + ' ' : '') + `Risques réduits de ${backed} cran${backed > 1 ? 's' : ''} pour que le pire cas reste sous ${prof.mc.dd} % de DD.`;
      }
      const cfgS = splitCfg(prof, stS);
      built.push({ prof, cfg: cfgS, config: splitConfigOut(prof, stS, gsS), gid: gsS.gid, logic: `${fieldLabel(field)} séparé`, oos, note, dds,
        score: prof.score(evalRange(pre, 0, n, gsS.gid, cfgS)), stepIdx, split: splitInfo(prof, stS, gsS, field) });
    };

    for (const prof of PROFS) {
      const flat = searchFlat(pre, 0, n, prof);
      if (!flat) {
        return { error: kind === 'pf'
          ? 'Aucun réglage de risque ne respecte les limites propfirm (5 % de DD journalier, 10 % de DD max) sur cet historique, même au risque minimal.'
          : 'Aucun réglage de risque trouvé sur cet historique.' };
      }
      if (splitGs) { // « + Si » imposé par l'utilisateur
        const r = ascentSplit(pre, 0, n, splitGs, prof, flat.stepIdx, flat);
        let oosS = null;
        if (cut) {
          const tf = searchFlat(pre, 0, cut, prof);
          if (tf) {
            const ft = evalRange(pre, cut, n, pre.zeros, stateCfg(prof, tf.state, null));
            const tl = ascentSplit(pre, 0, cut, splitGs, prof, tf.stepIdx, tf);
            const lt = evalRange(pre, cut, n, splitGs.gid, splitCfg(prof, tl.state));
            const limS = prof.steps[0];
            const okS = lt.perf > 0 && (limS.maxDd == null || lt.maxDd <= limS.maxDd * 1.25 + 1e-9);
            oosS = { trainN: cut, testN: n - cut, perf: lt.perf, maxDd: lt.maxDd, flatPerf: ft.perf, holds: okS && prof.score(lt) > prof.score(ft) };
          }
        }
        pushSplit(prof, flat.stepIdx, r.state, splitGs, splitField, oosS);
        continue;
      }
      // Logiques candidates : chaque bonus seul (étiquettes, session, jour), une à deux plages d'heures,
      // puis les deux meilleures étiquettes croisées. Jamais session × jour (échantillons trop petits).
      const logics = [];
      const addLogic = (mkGs, fs) => {
        const gs = mkGs(0, n);
        if (!gs) return null;
        const l = Object.assign(ascent(pre, 0, n, gs, prof, flat.stepIdx, flat), { gs, mkGs, fields: fs });
        logics.push(l);
        return l;
      };
      fields.forEach((f) => addLogic(() => groupsFor([f]), [f]));
      addLogic((lo, hi) => windowGs(pre, scanWindows(pre, lo, hi, 2)), [{ key: 'd:window', derived: true }]);
      const topExplicit = logics.filter((l) => l.nRules > 0 && !l.isSplit && !l.fields[0].derived).sort((p, q) => q.score - p.score).slice(0, 2);
      if (topExplicit.length === 2) {
        const fs = [topExplicit[0].fields[0], topExplicit[1].fields[0]];
        addLogic(() => groupsFor(fs), fs);
      }
      // Un money management complet PAR valeur d'une étiquette (ex. TREND / CONTRE, W / L / P), séries de SL propres
      // à chaque valeur : c'est ainsi qu'on règle deux logiques qui vivent leur propre vie.
      fields.filter((f) => !f.derived && f.values.length <= 6).forEach((f) => {
        const raw = groupsFor([f]);
        const gsS = raw ? activeGroups(raw, n, minGroupOf(n)) : null;
        if (!gsS) return;
        logics.push(Object.assign(ascentSplit(pre, 0, n, gsS, prof, flat.stepIdx, flat), { gs: gsS, isSplit: true, field: f.key, nRules: 1, fields: [f] }));
      });

      // Vérification sur les trades récents, jamais vus par le réglage.
      const lim = prof.steps[0];
      const okTest = (m) => m.perf > 0 && (lim.maxDd == null || m.maxDd <= lim.maxDd * 1.25 + 1e-9);
      let trainFlat = null, flatTest = null;
      if (cut) {
        trainFlat = searchFlat(pre, 0, cut, prof);
        if (trainFlat) flatTest = evalRange(pre, cut, n, pre.zeros, stateCfg(prof, trainFlat.state, null));
      }
      const oosFlat = flatTest ? { trainN: cut, testN: n - cut, perf: flatTest.perf, maxDd: flatTest.maxDd, holds: okTest(flatTest) } : null;
      let pick = null;
      if (flatTest) {
        const margin = Math.max(Math.abs(flat.score) * 0.02, 1e-9);
        const cands = logics.filter((l) => l.nRules > 0 && l.score > flat.score + margin).sort((x, y) => y.score - x.score).slice(0, 5);
        // Parmi les logiques qui tiennent sur les trades jamais vus, on garde celle qui y fait le mieux (et non celle
        // qui a le mieux collé à l'apprentissage) : c'est la moins sujette à la sur-optimisation.
        const passed = [];
        for (const c of cands) {
          let lt;
          if (c.isSplit) {
            const tl = ascentSplit(pre, 0, cut, c.gs, prof, trainFlat.stepIdx, trainFlat);
            lt = evalRange(pre, cut, n, c.gs.gid, splitCfg(prof, tl.state));
          } else {
            const gsT = c.mkGs(0, cut); // réglage refait sur les seuls trades d'apprentissage (plages d'heures comprises)
            if (!gsT) continue;
            const tl = ascent(pre, 0, cut, gsT, prof, trainFlat.stepIdx, trainFlat);
            lt = evalRange(pre, cut, n, gsT.gid, stateCfg(prof, tl.state, gsT));
          }
          const ok = okTest(lt) && prof.score(lt) > prof.score(flatTest) && lt.avgM >= flatTest.avgM * 0.75;
          if (opts && opts.debug) (debug[prof.id] = debug[prof.id] || []).push({ logic: c.isSplit ? 'split ' + c.field : c.fields.map((f) => f.key).join('+'), inScore: c.score, testPerf: lt.perf, testDd: lt.maxDd, testScore: prof.score(lt), flatTestScore: prof.score(flatTest), flatTestPerf: flatTest.perf, ok });
          if (ok) passed.push({ c, lt, sc: prof.score(lt) });
        }
        if (passed.length) {
          passed.sort((x, y) => y.sc - x.sc);
          const w = passed[0];
          pick = { c: w.c, oos: { trainN: cut, testN: n - cut, perf: w.lt.perf, maxDd: w.lt.maxDd, flatPerf: flatTest.perf, holds: true, beatsFlat: true } };
        }
      }

      if (pick && pick.c.isSplit) { pushSplit(prof, flat.stepIdx, pick.c.state, pick.c.gs, pick.c.field, pick.oos); continue; }
      const st = pick ? pick.c.state : flat.state;
      const gs = pick ? pick.c.gs : null;
      const gid = gs ? gs.gid : pre.zeros;
      // Pire cas : si le profil l'exige, on baisse le risque de base jusqu'à ce que le pire cas passe.
      let dds = mcDrawdowns(pre, gid, stateCfg(prof, st, gs));
      let note = flat.stepIdx > 0 ? 'Limite assouplie : aucun réglage ne tenait la limite visée sur cet historique.' : null;
      if (prof.mc) {
        let backed = 0;
        while (mcBreach(dds, prof.mc.dd) > prof.mc.p / 100 && st.bi > 0) { st.bi--; backed++; dds = mcDrawdowns(pre, gid, stateCfg(prof, st, gs)); }
        if (backed) note = (note ? note + ' ' : '') + `Risque réduit de ${backed} cran${backed > 1 ? 's' : ''} pour que le pire cas reste sous ${prof.mc.dd} % de DD.`;
        if (mcBreach(dds, prof.mc.dd) > prof.mc.p / 100) note = (note ? note + ' ' : '') + `Même au risque minimal, le pire cas dépasse ${prof.mc.dd} % de DD dans plus de ${prof.mc.p} % des cas.`;
      }
      const cfg = stateCfg(prof, st, gs), config = stateConfig(prof, st, gs);
      const logic = pick ? pick.c.fields.map((f) => fieldLabel(f.key)).join(' × ') : null;
      const oos = pick ? pick.oos : oosFlat;
      const mFull = evalRange(pre, 0, n, gid, cfg);
      built.push({ prof, cfg, config, gid, logic, oos, note, dds, score: prof.score(mFull), stepIdx: flat.stepIdx });
    }

    // Cohérence : un profil ne doit jamais être battu, sur SON objectif, par le réglage d'un autre profil
    // (validé sur des trades jamais vus, dans les mêmes limites). Sinon on lui donne ce meilleur réglage.
    const snapshot = built.slice();
    built.forEach((P, idx) => {
      let best = null;
      snapshot.forEach((Q) => {
        if (Q === P || !Q.oos || !Q.oos.holds) return;
        const m = evalRange(pre, 0, n, Q.gid, Q.cfg);
        if (!feasible(m, P.prof.steps[P.stepIdx])) return;
        const sc = P.prof.score(m);
        if (sc <= (best ? best.score : P.score) + 1e-9) return;
        const dds = mcDrawdowns(pre, Q.gid, Q.cfg);
        if (P.prof.mc && mcBreach(dds, P.prof.mc.dd) > P.prof.mc.p / 100) return;
        best = { Q, score: sc, dds };
      });
      if (best) built[idx] = Object.assign({}, best.Q, { prof: P.prof, score: best.score, dds: best.dds, stepIdx: P.stepIdx, note: `Même réglage que « ${best.Q.prof.name} » : il fait mieux ici sur cet objectif.` });
    });

    const out = built.map((B) => {
      const prof = B.prof;
      const bdd = prof.mc ? prof.mc.dd : (kind === 'pf' ? 10 : null);
      const report = computeReport(trades, capital0, B.config);
      const ms = monthStats(report.monthly);
      const fin = evalRange(pre, 0, n, B.gid, B.cfg);
      return {
        id: prof.id, name: prof.name, short: prof.short, goal: prof.goal, config: B.config, logic: B.logic,
        perf: report.stats.performancePct, finalMult: report.stats.finalCapital / capital0,
        dd: report.stats.maxDrawdownPct, daily: report.maxDailyDrawdownPct,
        avgM: ms.avgM, posM: ms.posM, worstM: ms.worstM, nM: ms.nM, bestShare: fin.bestShare * 100,
        skipped: report.stats.skippedTrades || 0, maxSlStreak: maxSlStreak(ordered),
        mc: { p95: B.dds[Math.floor(B.dds.length * 0.95)], breachDd: bdd, breach: bdd != null ? mcBreach(B.dds, bdd) * 100 : null },
        trust: B.oos ? (B.oos.holds ? 'ok' : 'warn') : 'none', oos: B.oos, note: B.note, split: B.split || null,
      };
    });
    return { profiles: out, fields: fields.map((f) => f.label), kind, debug: opts && opts.debug ? debug : undefined };
  }

  // ---------------------------------------------------------------
  // Pistes : ce que l'historique suggère en plus (jamais une prédiction).
  // Compare, pour chaque valeur d'un bonus (étiquette, session, jour…), le gain moyen
  // par trade (en R) au reste des trades ; ne retient que les écarts nets (z ≥ 2,3, ≥ 30 trades).
  // ---------------------------------------------------------------
  function findInsights(trades) {
    const ordered = sortedTrades(trades);
    const n = ordered.length;
    const minG = minGroupOf(n);
    const R = ordered.map((t) => (isBE(t) ? 0 : Number(t.rr) || 0));
    const fields = detectBonusFields(ordered);
    const tips = [];
    fields.forEach((f) => f.values.forEach((val) => {
      let ng = 0, sg = 0, qg = 0, N = 0, S = 0, Q = 0;
      ordered.forEach((t, i) => {
        const v = bonusValue(t, f.key);
        if (v == null || norm(v) === '') return;
        N++; S += R[i]; Q += R[i] * R[i];
        if (norm(v) === norm(val.value)) { ng++; sg += R[i]; qg += R[i] * R[i]; }
      });
      if (ng < minG || N - ng < minG) return;
      const z = zStat(ng, sg, qg, N, S, Q);
      if (z && Math.abs(z.z) >= Z_SCAN) tips.push({ key: f.key, label: f.label, value: val.value, n: ng, avg: z.mg, rest: z.mr, z: z.z });
    }));
    scanWindows(buildPre(ordered), 0, n, 2).forEach((w) => tips.push({ key: 'd:window', label: fieldLabel('d:window'), value: w.value, n: w.n, avg: w.avg, rest: w.rest, z: w.z }));
    tips.sort((x, y) => Math.abs(y.z) - Math.abs(x.z));
    const missing = [];
    if (n >= 20 && clockShare(ordered) < 0.5) missing.push('time');
    if (!fields.some((f) => !f.derived)) missing.push('bonus');
    return { tips: tips.slice(0, 3), missing, checked: fields.map((f) => f.label) };
  }

  window.CHESTBacktestEngine = {
    sortedTrades, effectiveRisk, resolveRisk, simulate, computeReport, optimizeCp, optimizePf, optimizeProfiles, riskSeries, describeConfig,
    detectBonusFields, detectLeakFields, findInsights, fieldLabel, condsMatch, bonusValue, RISK_GRID,
  };
})();
