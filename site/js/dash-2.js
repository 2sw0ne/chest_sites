// CHEST 2.0 (2026-11-02) — Dashboard, maquette CHEST-DESIGN-2.0/maquettes/Main.dc.html.
// dashboard.js garde tous ses calculs et émet « chest:dash-render » à chaque rendu ; ce fichier
// dessine à partir de ces données : en-tête (date + sessions), solde + 4 KPI, titre de la courbe,
// derniers trades. La rangée « Aujourd'hui » (sessions, annonces, force des devises) et les
// signaux des scanners lisent les sources déjà utilisées ailleurs sur le site. Rien n'est inventé :
// une donnée absente donne un état vide.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nfr = (v, d = 0) => Number(v).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const num = (v) => { const m = String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.').replace('−', '-').match(/[-+]?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };
  const sign = (v) => (v > 0 ? '+' : v < 0 ? '−' : '');
  const usd = (v, signed) => `${signed ? sign(v) : (v < 0 ? '−' : '')}${nfr(Math.abs(v), Math.abs(v) >= 1000 ? 0 : 2)} $`;
  const pair = (s) => { const u = String(s || '').toUpperCase(); return /^[A-Z]{6}$/.test(u) ? `${u.slice(0, 3)}/${u.slice(3)}` : u; };
  const PERIOD_SUB = { week: 'sur 7 jours', '30d': 'sur 30 jours', '90d': 'sur 90 jours', full: 'depuis le début' };
  const PERIOD_SHORT = { week: '7 jours', '30d': '30 jours', '90d': '3 mois', full: 'tout' };
  const TF = { 1: 'M1', 5: 'M5', 15: 'M15', 30: 'M30', 60: 'H1', 240: 'H4', D: 'D1', '1D': 'D1' };

  // ---------- En-tête : date + état des sessions ----------
  const SESS = [['Sydney', 'Australia/Sydney', 7, 16], ['Tokyo', 'Asia/Tokyo', 9, 18], ['Londres', 'Europe/London', 8, 17], ['New York', 'America/New_York', 8, 17]];
  function localInfo(tz) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(new Date()).map((p) => [p.type, p.value]));
    return { min: (Number(parts.hour) % 24) * 60 + Number(parts.minute), weekend: parts.weekday === 'Sat' || parts.weekday === 'Sun' };
  }
  const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ' ' + String(m % 60).padStart(2, '0') : ''}` : `${m} min`);
  function paintDate() {
    const d = new Date();
    const date = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    const st = SESS.map(([name, tz, o, c]) => { const i = localInfo(tz); return { name, open: !i.weekend && i.min >= o * 60 && i.min < c * 60, wait: !i.weekend && i.min < o * 60 ? o * 60 - i.min : null, weekend: i.weekend }; });
    const open = st.filter((s) => s.open).map((s) => s.name);
    const next = st.filter((s) => s.wait != null).sort((a, b) => a.wait - b.wait)[0];
    let txt;
    if (st.every((s) => s.weekend)) txt = 'marché fermé ce week-end';
    else if (open.length > 1) txt = `${open.slice(0, -1).join(', ')} et ${open[open.length - 1]} ouvertes`;
    else if (open.length === 1) txt = `${open[0]} ouverte`;
    else txt = 'marché calme';
    if (next && open.length < 2) txt += `, ${next.name} dans ${dur(next.wait)}`;
    $('d2Date').textContent = `${date.charAt(0).toUpperCase() + date.slice(1)} · ${txt.charAt(0).toUpperCase() + txt.slice(1)}.`;
  }

  // ---------- Solde + 4 KPI ----------
  function objective(list, label) {
    const o = Array.isArray(list) ? list.find((x) => x.label === label) : null;
    if (!o) return null;
    const pct = (v) => { const m = String(v == null ? '' : v).replace(/\s/g, '').replace('−', '-').match(/\(([-+]?\d+(?:[.,]\d+)?)%\)/); return m ? parseFloat(m[1].replace(',', '.')) : num(v); };
    let tgt = pct(o.target);
    if (/Loss/.test(label) && tgt > 0) tgt = -tgt;
    return { cur: pct(o.current), tgt, ok: o.ok };
  }
  function kpi(label, value, note, bar, barBg, cls) {
    return `<div class="d2-kpi"><span class="c2-label">${label}</span><span class="d2-kpi__v ${cls || ''}">${value}</span>
      <div class="d2-kpi__bar"><i style="width:${Math.max(0, Math.min(100, bar || 0)).toFixed(1)}%;background:${barBg}"></i></div><span class="d2-kpi__n">${note}</span></div>`;
  }
  function paintBand(a, d, P, period, objectives) {
    const bal = Number(a.balance) || 0;
    $('d2BalLabel').textContent = `Solde · ${a.name || 'Compte'}`;
    $('d2Bal').innerHTML = `${nfr(Math.round(bal))}<span> $</span>`;
    const diff = d.diff != null ? d.diff : num(d.profitDollar) || 0;
    const pct = d.profitPct != null ? d.profitPct : num(d.profit) || 0;
    const chip = $('d2Chip');
    chip.textContent = `${usd(diff, true)} · ${sign(pct)}${nfr(Math.abs(pct), 2)} %`;
    chip.className = 'd2-chip ' + (diff > 0 ? 'is-pos' : diff < 0 ? 'is-neg' : '');
    $('d2ChipSub').textContent = PERIOD_SUB[period] || '';
    $('d2ChartTitle').textContent = `${usd(diff, true)} ${PERIOD_SUB[period] || ''}`;

    const n = d.nTrades || 0, w = d.nWins || 0;
    const goal = objective(objectives, 'Profit Target');
    const lim = objective(objectives, 'Max Loss');
    const winPct = num(d.winrate);
    const win90 = P['90d'] ? P['90d'].winrate : null;
    const pf = d.pf;
    const dd = Math.abs(num(d.dd) || 0);
    const GREEN = 'linear-gradient(90deg,#33e6a6,#7ff3ca)', RED = 'linear-gradient(90deg,#ff4d5e,#ff94a0)', BRAND = 'linear-gradient(90deg,#fc1283,#f9a45e)', AMBER = '#e8b339';
    const k1bar = goal && goal.tgt ? (pct / goal.tgt) * 100 : (n ? (w / n) * 100 : 0);
    const used = lim && lim.tgt ? dd / Math.abs(lim.tgt) : null;
    $('d2Kpis').innerHTML =
      kpi(`P&L · ${PERIOD_SHORT[period] || ''}`, usd(diff, true), n ? `${nfr(n)} trade${n > 1 ? 's' : ''} · ${nfr(w)} gagnant${w > 1 ? 's' : ''}` : 'aucun trade sur la période', k1bar, diff < 0 ? RED : GREEN, diff > 0 ? 'is-pos' : diff < 0 ? 'is-neg' : '')
      + kpi('Taux de réussite', winPct != null ? `${nfr(winPct)} %` : '—', win90 && win90 !== '—' ? `Moyenne 90 j : ${esc(String(win90).replace('%', ' %'))}` : 'pas encore de moyenne sur 90 jours', winPct || 0, BRAND)
      + kpi('Profit factor', pf == null ? '—' : pf === Infinity ? '∞' : nfr(pf, 2), d.rr && d.rr !== '—' ? `R:R moyen ${esc(String(d.rr).replace('.', ','))}` : 'gains ÷ pertes', pf == null ? 0 : pf === Infinity ? 100 : Math.min(1, pf / 3) * 100, BRAND)
      + (used != null
        ? kpi('Drawdown utilisé', `${nfr(dd, 1)} %`, `sur ${nfr(Math.abs(lim.tgt))} % autorisés`, used * 100, used >= 0.7 ? '#ff4d5e' : AMBER, used >= 0.7 ? 'is-neg' : '')
        : kpi('Drawdown max', `${nfr(dd, 1)} %`, 'pic → creux sur la période', Math.min(1, dd / 10) * 100, AMBER));
  }

  // ---------- Derniers trades ----------
  const toMs = (v) => { if (v == null || v === '') return NaN; if (typeof v === 'number') return v < 1e12 ? v * 1000 : v; const n = Number(v); return isFinite(n) && n > 1e8 ? (n < 1e12 ? n * 1000 : n) : Date.parse(v); };
  const when = (ms) => new Date(ms).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(' à ', ' ');
  function paintTrades(a, trades) {
    const rr = new Map((trades || []).map((t) => [new Date(t.date).getTime(), t.rr]));
    const rows = (a.history || []).filter((t) => !t.action || /^(buy|sell)/i.test(String(t.action)))
      .map((t) => ({ t, close: toMs(t.closeTime), open: toMs(t.openTime) })).filter((x) => isFinite(x.close))
      .sort((x, y) => y.close - x.close).slice(0, 5);
    if (!rows.length) { $('d2Trades').innerHTML = '<p class="d2-empty">Aucun trade sur ce compte pour l’instant.</p>'; return; }
    $('d2Trades').innerHTML = `<div class="d2-tbl"><div class="d2-tbl__h"><span>Paire</span><span>Sens</span><span>Ouvert</span><span>R</span><span>Résultat</span></div>`
      + rows.map(({ t, close, open }) => {
        const sell = /sell/i.test(String(t.side || t.action || t.type || ''));
        const p = parseFloat(t.profit) || 0;
        const r = rr.get(new Date(close).getTime());
        return `<div class="d2-tbl__r"><span class="d2-tbl__p">${esc(pair(t.symbol || t.pair))}</span>`
          + `<span><span class="c2-pill ${sell ? 'c2-pill--sell' : 'c2-pill--buy'}">${sell ? 'Vente' : 'Achat'}</span></span>`
          + `<span class="d2-mut">${esc(when(isFinite(open) ? open : close))}</span>`
          + `<span class="d2-mut">${r == null ? '—' : `${sign(r)}${nfr(Math.abs(r), 1)}`}</span>`
          + `<span class="d2-tbl__res ${p > 0 ? 'is-pos' : p < 0 ? 'is-neg' : ''}">${usd(p, true)}</span></div>`;
      }).join('') + '</div>';
  }

  // ---------- Annonces du jour + prévision de la semaine ----------
  const CCY = { US: 'USD', EU: 'EUR', UK: 'GBP', JP: 'JPY', CH: 'CHF', CA: 'CAD', AU: 'AUD', NZ: 'NZD', CN: 'CNY', DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR' };
  const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  async function loadNews() {
    const url = (window.CHEST_CONFIG && window.CHEST_CONFIG.calendarApiUrl) || 'data/calendar.json';
    let events = [];
    try { const data = await fetch(url, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)); events = (data && data.events) || []; } catch (e) { events = null; }
    if (events === null) { $('d2News').innerHTML = '<p class="d2-empty">Calendrier indisponible pour le moment.</p>'; return; }
    const today = isoLocal(new Date()), nowHM = new Date().toTimeString().slice(0, 5);
    const rows = events.filter((e) => e.date === today && (e.importance === 'high' || e.importance === 'medium'))
      .sort((a, b) => String(a.time).localeCompare(String(b.time))).slice(0, 4);
    $('d2News').innerHTML = rows.length ? rows.map((e) => {
      const lvl = e.importance === 'high' ? 3 : 2, past = e.time && e.time < nowHM;
      const bars = [0, 1, 2].map((i) => `<i style="background:${i < lvl ? (lvl === 3 ? '#ff4d5e' : '#e8b339') : 'rgba(255,255,255,.12)'}"></i>`).join('');
      return `<div class="d2-news__r${past ? ' is-past' : ''}"><span class="d2-news__t">${esc(e.time || '—')}</span><span class="d2-news__c">${esc(CCY[e.country] || e.country || '')}</span><span class="d2-news__n">${esc(e.event)}</span><span class="d2-news__b" aria-label="Impact ${lvl === 3 ? 'fort' : 'moyen'}">${bars}</span></div>`;
    }).join('') : '<p class="d2-empty">Aucune annonce forte ou moyenne aujourd’hui.</p>';
    // prévision verrouillée par le Calendrier (js/calendar.js, chest_weekly_forecast_lock) pour la paire suivie
    let pk = 'XAUUSD';
    try { pk = localStorage.getItem('chest_sentiment_pair') || 'XAUUSD'; } catch (e) { /* défaut */ }
    let lock = null;
    try {
      const locks = JSON.parse(localStorage.getItem('chest_weekly_forecast_lock') || '{}');
      const key = Object.keys(locks).filter((k) => k.startsWith(pk + '|') && k.split('|')[1] <= today).sort().pop();
      lock = key ? locks[key] : null;
    } catch (e) { lock = null; }
    const fc = $('d2Forecast');
    if (lock && typeof lock.weeklyCapped === 'number') {
      const word = lock.tone === 'pos' ? 'haussier' : lock.tone === 'neg' ? 'baissier' : 'neutre';
      fc.innerHTML = `Prévision de la semaine sur ${esc(pair(pk))} : <strong class="is-${lock.tone || 'neutral'}">${word} ${sign(lock.weeklyCapped)}${nfr(Math.abs(lock.weeklyCapped), 1)} %</strong>`;
      fc.hidden = false;
    } else fc.hidden = true;
  }

  // ---------- Force des devises (H4) ----------
  async function loadStrength() {
    const box = $('d2Strength');
    if (!window.CHESTCurrencyStrength || !CHESTCurrencyStrength.byTf) return;
    try {
      const list = (await CHESTCurrencyStrength.byTf(240)).slice(0, 8);
      const max = Math.max(0.1, ...list.map((c) => Math.abs(c.index)));
      box.innerHTML = `<div class="d2-str__list">${list.map((c) => {
        const w = (Math.abs(c.index) / max * 100).toFixed(1);
        return `<div class="d2-str__r"><span class="d2-str__c">${esc(c.code)}</span><span class="d2-str__neg"><i style="width:${c.index < 0 ? w : 0}%"></i></span><span class="d2-str__pos"><i style="width:${c.index > 0 ? w : 0}%"></i></span><span class="d2-str__v ${c.index >= 0 ? 'is-pos' : 'is-neg'}">${sign(c.index)}${nfr(Math.abs(c.index), 1)}</span></div>`;
      }).join('')}</div>`;
    } catch (e) { box.innerHTML = '<p class="d2-empty">Force des devises indisponible pour le moment.</p>'; }
  }

  // ---------- Signaux des scanners (paires et unités de tes règles d'alerte) ----------
  const ago = (ms) => { const m = Math.max(0, Math.round((Date.now() - ms) / 60000)); if (m < 60) return `il y a ${m} min`; const h = Math.round(m / 60); return h < 24 ? `il y a ${h} h` : `il y a ${Math.round(h / 24)} j`; };
  async function loadSignals() {
    const box = $('d2Signals');
    const base = (window.CHEST_CONFIG && window.CHEST_CONFIG.accountsApiUrl) || '';
    const token = window.CHESTAccounts && CHESTAccounts.getToken && CHESTAccounts.getToken();
    if (!base || !token) { box.innerHTML = '<p class="d2-empty">Connecte-toi pour voir les signaux.</p>'; return; }
    const H = { Authorization: 'Bearer ' + token };
    try {
      const rules = ((await fetch(`${base}/alerts/rules`, { headers: H }).then((r) => (r.ok ? r.json() : { rules: [] }))).rules) || [];
      const combos = [...new Set(rules.flatMap((r) => (r.pairs || []).flatMap((p) => (r.timeframes || []).map((tf) => `${p}|${tf}`))))].slice(0, 4);
      if (!combos.length) { box.innerHTML = '<p class="d2-empty">Aucune alerte réglée. <a href="strategies.html?tab=alerts">Choisis tes paires dans Stratégies →</a></p>'; return; }
      const wanted = new Set(rules.flatMap((r) => r.scanners || []));
      const lists = await Promise.all(combos.map((c) => { const [s, tf] = c.split('|'); return fetch(`${base}/alerts/signals?symbol=${encodeURIComponent(s)}&tf=${encodeURIComponent(tf)}`, { headers: H }).then((r) => (r.ok ? r.json() : { opportunities: [] })).catch(() => ({ opportunities: [] })); }));
      const sig = lists.flatMap((l) => l.opportunities || []).filter((o) => !wanted.size || wanted.has(o.scanner)).sort((a, b) => toMs(b.time) - toMs(a.time)).slice(0, 4);
      if (!sig.length) { box.innerHTML = '<p class="d2-empty">Pas encore de signal sur tes paires suivies.</p>'; return; }
      const S = window.CHESTScanners;
      box.innerHTML = sig.map((o) => {
        const sc = (S && S.get && S.get(o.scanner)) || {};
        const buy = o.side === 'buy', t = toMs(o.time);
        const href = `strategies.html?scanner=${encodeURIComponent(o.scanner)}&symbol=${encodeURIComponent(o.symbol)}&tf=${encodeURIComponent(o.tf)}`;
        return `<a class="d2-sig__r" href="${href}">${sc.logo ? `<img src="${esc(sc.logo)}" alt="">` : `<span class="d2-sig__ini">${esc((sc.name || o.scanner || '?').slice(0, 2).toUpperCase())}</span>`}`
          + `<span class="d2-sig__t"><b>${esc((sc.name || o.scanner || '').toUpperCase())}</b> <span>· ${esc(pair(o.symbol))} ${esc(TF[o.tf] || o.tf)}</span><small>${esc(ago(t))} · bougie de ${esc(new Date(t).toTimeString().slice(0, 5))}</small></span>`
          + `<span class="c2-pill ${buy ? 'c2-pill--buy' : 'c2-pill--sell'}">${buy ? 'Achat' : 'Vente'}</span></a>`;
      }).join('');
    } catch (e) { box.innerHTML = '<p class="d2-empty">Signaux indisponibles pour le moment.</p>'; }
  }

  // ---------- Branchement ----------
  document.addEventListener('chest:dash-render', (ev) => {
    const { account, period, data, periods, objectives, trades } = ev.detail || {};
    if (!account || !data) return;
    paintBand(account, data, periods || {}, period, objectives);
    paintTrades(account, trades);
  });
  paintDate();
  setInterval(paintDate, 60000);
  if (window.CHESTSessionTimeline) CHESTSessionTimeline.render('sessionTimeline');
  loadNews();
  loadStrength();
  loadSignals();
})();
