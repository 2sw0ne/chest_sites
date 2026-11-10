// CHEST 2.0 (2026-11-02) — Dashboard au balisage exact de CHEST-DESIGN-2.0/html-exact/Main.html.
// dashboard.js garde tous ses calculs et émet « chest:dash-render » à chaque rendu ; ce fichier pose
// les vraies valeurs dans le balisage copié, et génère les lignes répétées (KPI, sessions, annonces,
// devises, trades, signaux) avec exactement le style d'une ligne de la maquette. Les formules de la
// courbe (lissage) et du ciel (soleil sur l'arc) sont celles de maquettes/Main.dc.html.
// Rien n'est inventé : une donnée absente donne un état vide.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nfr = (v, d = 0) => Number(v).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const num = (v) => { const m = String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.').replace('−', '-').match(/[-+]?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };
  const sign = (v) => (v > 0 ? '+' : v < 0 ? '−' : '');
  const usd = (v) => `${sign(v)}${nfr(Math.abs(v), Math.abs(v) >= 1000 || Number.isInteger(Math.round(v * 100) / 100) ? 0 : 2)} $`;
  const pair = (s) => { const u = String(s || '').toUpperCase(); return /^[A-Z]{6}$/.test(u) ? `${u.slice(0, 3)}/${u.slice(3)}` : u; };
  const MONO = 'font-family: &quot;Fragment Mono&quot;, ui-monospace, monospace;';
  const EMPTY = (t) => `<p style="margin: 6px 0px 0px; padding: 18px 14px; border: 1px dashed rgba(var(--fg-rgb, 255, 255, 255), 0.16); border-radius: 14px; font-size: 11.5px; color: var(--ink-3, rgb(122, 122, 130)); text-align: center;">${t}</p>`;
  const PERIOD_SUB = { week: 'sur 7 jours', '30d': 'sur 30 jours', '90d': 'sur 90 jours', full: 'depuis le début' };
  const PERIOD_KPI = { week: 'P&amp;L · 7 jours', '30d': 'P&amp;L · 30 jours', '90d': 'P&amp;L · 3 mois', full: 'P&amp;L · tout' };
  const TF = { 1: 'M1', 5: 'M5', 15: 'M15', 30: 'M30', 60: 'H1', 240: 'H4', D: 'D1', '1D': 'D1' };
  const toMs = (v) => { if (v == null || v === '') return NaN; if (typeof v === 'number') return v < 1e12 ? v * 1000 : v; const n = Number(v); return isFinite(n) && n > 1e8 ? (n < 1e12 ? n * 1000 : n) : Date.parse(v); };

  // ---------- En-tête : date + sessions ----------
  function sessionsLine(m) {
    const open = m.sessions.filter((s) => s.open).map((s) => s.name);
    const next = m.sessions.filter((s) => !s.open).sort((a, b) => a.delta - b.delta)[0];
    const h = (x) => { const mm = Math.round(x * 60); return mm >= 60 ? `${Math.floor(mm / 60)} h ${String(mm % 60).padStart(2, '0')}` : `${mm} min`; };
    let t = open.length > 1 ? `${open.slice(0, -1).join(', ')} et ${open[open.length - 1]} ouvertes` : open.length ? `${open[0]} ouverte` : 'Marché calme';
    if (next && open.length < 2) t += `, ${next.name} dans ${h(next.delta)}`;
    return t;
  }
  function paintDate(m) {
    const d = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    $('d2Date').textContent = `${d.charAt(0).toUpperCase() + d.slice(1)} · ${m ? sessionsLine(m) : ''}.`;
  }

  // ---------- Solde + 4 KPI ----------
  function objective(list, label) {
    const o = Array.isArray(list) ? list.find((x) => x.label === label) : null;
    if (!o) return null;
    const pct = (v) => { const r = String(v == null ? '' : v).replace(/\s/g, '').replace('−', '-').match(/\(([-+]?\d+(?:[.,]\d+)?)%\)/); return r ? parseFloat(r[1].replace(',', '.')) : num(v); };
    let tgt = pct(o.target);
    if (/Loss/.test(label) && tgt > 0) tgt = -tgt;
    return { cur: pct(o.current), tgt, ok: o.ok };
  }
  const G = 'linear-gradient(90deg, rgb(var(--a1-rgb, 252, 18, 131)), rgb(var(--a2-rgb, 249, 164, 94)))';
  function kpi(label, value, color, glow, bar, barBg, note) {
    return `
            <div style="display: flex; flex-direction: column; gap: 8px; padding: 4px 22px; border-left: 1px solid rgba(var(--fg-rgb, 255, 255, 255), 0.08);">
              <span style="${MONO} font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink-3, rgb(122, 122, 130));">${label}</span>
              <span style="font-size: 26px; font-weight: 700; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; color: ${color}; text-shadow: ${glow};">${value}</span>
              <div style="height: 3px; border-radius: 999px; background: rgba(var(--fg-rgb, 255, 255, 255), 0.06); overflow: hidden;">
                <div style="height: 100%; width: ${Math.max(0, Math.min(100, bar || 0)).toFixed(0)}%; border-radius: 999px; background: ${barBg};"></div>
              </div>
              <span style="font-size: 11.5px; color: var(--ink-3, rgb(122, 122, 130));">${note}</span>
            </div>`;
  }
  function floatingOf(a) {
    const b = Number(a && a.balance), e = Number(a && a.equity);
    return isFinite(b) && isFinite(e) && Math.abs(e - b) >= 0.5 ? e - b : 0;
  }
  function paintBand(a, d, P, period, objectives) {
    const bal = Number(a.balance) || 0;
    $('d2BalLabel').textContent = `Solde · ${a.name || 'Compte'}`;
    $('d2Bal').innerHTML = `${nfr(Math.round(bal))}<span style="color: var(--ink-3, rgb(122, 122, 130)); font-weight: 600;"> $</span>`;
    const diff = d.diff != null ? d.diff : num(d.profitDollar) || 0;
    const pct = d.profitPct != null ? d.profitPct : num(d.profit) || 0;
    const chip = $('d2Chip');
    chip.textContent = `${usd(diff)} · ${sign(pct)}${nfr(Math.abs(pct), 2)} %`;
    chip.style.color = diff < 0 ? 'var(--red-hi, rgb(255, 148, 160))' : 'var(--green-hi, rgb(127, 243, 202))';
    chip.style.background = diff < 0 ? 'rgba(var(--red-rgb, 255, 77, 94), 0.12)' : 'rgba(var(--green-rgb, 51, 230, 166), 0.12)';
    chip.style.textShadow = diff < 0 ? 'none' : 'rgba(var(--green-rgb, 51, 230, 166), 0.45) 0px 0px 14px';
    // Position ouverte (2026-11-10, « pourquoi 94 191 $ ici et 95 836 $ sur la courbe ? ») : le solde ne compte que
    // les trades clôturés, la courbe et le P&L suivent l'équité (solde + résultat latent) ; on le dit.
    const fl = floatingOf(a);
    $('d2ChipSub').textContent = (PERIOD_SUB[period] || '') + (fl ? ` · dont ${usd(fl)} en cours (équité ${nfr(Math.round(bal + fl))} $)` : '');

    const n = d.nTrades || 0, w = d.nWins || 0;
    const goal = objective(objectives, 'Profit Target');
    const lim = objective(objectives, 'Max Loss');
    const winPct = num(d.winrate);
    const win90 = P['90d'] ? num(P['90d'].winrate) : null;
    const pf = d.pf;
    // Avec une règle de perte max (propfirm) : la perte mesurée par l'objectif (depuis le capital de départ), pas le
    // recul de la seule période affichée (2026-11-05 : 4,6 % affichés sur un compte cramé à −10 %).
    const dd = lim && lim.cur != null && !isNaN(lim.cur) ? Math.abs(lim.cur) : Math.abs(num(d.dd) || 0);
    const used = lim && lim.tgt ? dd / Math.abs(lim.tgt) : null;
    const pos = diff >= 0;
    $('d2Kpis').innerHTML =
      kpi(PERIOD_KPI[period] || 'P&amp;L', usd(diff), pos ? 'var(--green-hi, rgb(127, 243, 202))' : 'var(--red-hi, rgb(255, 148, 160))', pos ? 'rgba(var(--green-rgb, 51, 230, 166), 0.35) 0px 0px 18px' : 'none',
        goal && goal.tgt ? pct / goal.tgt * 100 : (n ? w / n * 100 : 0), pos ? 'rgb(var(--green-rgb, 51, 230, 166))' : 'rgb(var(--red-rgb, 255, 77, 94))',
        n ? `${nfr(n)} trade${n > 1 ? 's' : ''} · ${nfr(w)} gagnant${w > 1 ? 's' : ''}` : 'aucun trade sur la période')
      + kpi('Taux de réussite', winPct != null ? `${nfr(winPct)} %` : '—', 'var(--ink, rgb(246, 246, 247))', 'none', winPct || 0, G,
        win90 != null ? `Moyenne 90 j : ${nfr(win90)} %` : 'pas encore de moyenne sur 90 jours')
      + kpi('Profit factor', pf == null ? '—' : pf === Infinity ? '∞' : nfr(pf, 2), 'var(--ink, rgb(246, 246, 247))', 'none', pf == null ? 0 : pf === Infinity ? 100 : Math.min(1, pf / 3) * 100, G,
        d.rr && d.rr !== '—' ? `Gain moyen ${esc(String(d.rr).replace('.', ','))} R` : 'gains ÷ pertes')
      + (used != null
        ? kpi('Drawdown utilisé', `${nfr(dd, 1)} %`, 'var(--ink, rgb(246, 246, 247))', 'none', used * 100, 'rgb(var(--amber-rgb, 232, 179, 57))', `sur ${nfr(Math.abs(lim.tgt))} % autorisés`)
        : kpi('Drawdown max', `${nfr(dd, 1)} %`, 'var(--ink, rgb(246, 246, 247))', 'none', Math.min(1, dd / 10) * 100, 'rgb(var(--amber-rgb, 232, 179, 57))', 'pic → creux sur la période'));
  }

  // ---------- Courbe d'equity (SVG de la maquette, lissage de Main.dc.html) ----------
  function smooth(pts) {
    let d = 'M' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ' C' + c1x.toFixed(1) + ',' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ',' + c2y.toFixed(1) + ' ' + p2[0].toFixed(1) + ',' + p2[1].toFixed(1);
    }
    return d;
  }
  const kfmt = (v) => (Math.abs(v) >= 1000 ? (v / 1000).toFixed(1).replace('.', ',') + 'k' : nfr(v));
  function paintChart(d, period, a) {
    const eq = (d.equity || []).filter((v) => isFinite(v));
    const diff = d.diff != null ? d.diff : num(d.profitDollar) || 0;
    $('d2ChartTitle').textContent = `${usd(diff)} ${PERIOD_SUB[period] || ''}`;
    if (eq.length < 2) { ['d2Area', 'd2Line', 'd2LineDn', 'd2Bt'].forEach((id) => $(id).setAttribute('d', '')); $('d2Y').innerHTML = ''; $('d2X').innerHTML = ''; $('d2Dot').hidden = true; $('d2DotLbl').hidden = true; return; }
    let lo = Math.min(...eq), hi = Math.max(...eq);
    const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.002 || 1;
    lo -= pad; hi += pad;
    const W = 1000, H = 270;
    const pts = eq.map((v, i) => [i / (eq.length - 1) * W, H - (v - lo) / (hi - lo) * H]);
    const line = smooth(pts);
    // Solde de départ de la période (2026-11-05) : la ligne et sa lueur sont vertes au-dessus, rouges dès qu'elle
    // passe en dessous ; la zone colorée s'arrête à ce niveau (plus de rouge jusqu'en bas du graphique).
    const yb = Math.max(0, Math.min(H, H - (eq[0] - lo) / (hi - lo) * H));
    $('d2Line').setAttribute('d', line);
    $('d2LineDn').setAttribute('d', line);
    $('eqClipUpR').setAttribute('height', String(yb + 60));
    $('eqClipDnR').setAttribute('y', String(yb));
    $('eqClipDnR').setAttribute('height', String(H - yb + 60));
    $('d2Area').setAttribute('d', line + ' L' + W + ',' + yb.toFixed(1) + ' L0,' + yb.toFixed(1) + ' Z');
    $('d2Bt').setAttribute('d', '');
    // vert au-dessus du solde de départ de la période, rouge en dessous (demande utilisateur 2026-11-03)
    const t = Math.max(0, Math.min(1, (H - (eq[0] - lo) / (hi - lo) * H) / H)).toFixed(4);
    const grad = (id, stops) => { const g = document.getElementById(id); if (!g) return; ['x1', 'y1', 'x2'].forEach((k) => g.setAttribute(k, '0')); g.setAttribute('y2', String(H)); g.setAttribute('gradientUnits', 'userSpaceOnUse');
      g.innerHTML = stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"></stop>`).join(''); };
    // Intensité calée sur les extrêmes de la courbe : la zone rouge reste visible même peu profonde.
    const yTop = Math.min(...pts.map((q) => q[1])) / H, yBot = Math.max(...pts.map((q) => q[1])) / H;
    grad('eqFill', [[Math.min(yTop, t).toFixed(4), 'var(--green, #33e6a6)', 0.3], [t, 'var(--green, #33e6a6)', 0.03], [t, 'var(--red, #ff4d5e)', 0.03], [Math.max(yBot, t).toFixed(4), 'var(--red, #ff4d5e)', 0.28], [1, 'var(--red, #ff4d5e)', 0.28]]);
    const up = eq[eq.length - 1] >= eq[0];
    $('d2Dot').style.borderColor = up ? 'var(--green-hi, rgb(110, 242, 201))' : 'rgb(255, 120, 135)';
    $('d2Dot').style.boxShadow = up ? 'rgba(var(--green-rgb, 51, 230, 166), 0.9) 0px 0px 14px' : 'rgba(var(--red-rgb, 255, 77, 94), 0.9) 0px 0px 14px';
    const last = pts[pts.length - 1];
    [$('d2Dot'), $('d2DotLbl')].forEach((el) => { el.hidden = false; el.style.left = (last[0] / W * 100) + '%'; el.style.top = last[1] + 'px'; });
    $('d2DotLbl').textContent = `${nfr(Math.round(eq[eq.length - 1]))} $${floatingOf(a) ? ' · équité' : ''}`;
    $('d2DotLbl').title = floatingOf(a) ? 'Équité = solde + résultat des positions encore ouvertes' : '';
    $('d2Y').innerHTML = [0, 1, 2, 3, 4].map((k) => `<span>${kfmt(hi - (hi - lo) * k / 4)}</span>`).join('');
    const labels = d.labels || [];
    const idx = [0, 1, 2, 3, 4, 5].map((k) => Math.round(k * (labels.length - 1) / 5));
    $('d2X').innerHTML = idx.map((i) => `<span>${esc(labels[i] || '')}</span>`).join('');
  }

  // ---------- Carte des sessions (formules de Main.dc.html, modèle de session-timeline.js) ----------
  const WX = {
    sun: ['radial-gradient(circle at 35% 32%, rgb(255, 248, 221), rgb(255, 200, 98) 55%, rgb(255, 154, 61))', 'rgba(255, 175, 70, 0.6) 0px 0px 10px'],
    moon: ['radial-gradient(circle at 35% 32%, rgb(248, 250, 255), rgb(215, 222, 239) 55%, rgb(168, 179, 214))', 'rgba(200, 215, 255, 0.4) 0px 0px 8px'],
    dawn: ['linear-gradient(rgb(255, 208, 138) 0px, rgb(255, 208, 138) 52%, rgba(255, 154, 61, 0.35) 52%)', 'rgba(255, 154, 61, 0.5) 0px 0px 8px'],
  };
  const CITY_TZ = { Sydney: 'Australia/Sydney', Tokyo: 'Asia/Tokyo', Londres: 'Europe/London', 'New York': 'America/New_York' };
  function cityTime(name) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: CITY_TZ[name], hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date()).map((p) => [p.type, p.value]));
    const h = Number(parts.hour) % 24;
    return { txt: `${String(h).padStart(2, '0')}:${parts.minute}`, wx: h >= 8 && h < 18 ? 'sun' : (h >= 6 && h < 8) || (h >= 18 && h < 20) ? 'dawn' : 'moon' };
  }
  const pctH = (h) => (h / 24 * 100).toFixed(2) + '%';
  function paintSessions() {
    if (!window.CHESTSessionTimeline || !CHESTSessionTimeline.model) return;
    const m = CHESTSessionTimeline.model();
    paintDate(m);
    const hr = m.hour;
    const day = hr >= 6 && hr < 18;
    const tS = day ? (hr - 6) / 12 : (((hr - 18) % 24 + 24) % 24) / 12;
    const sky = m.sky;
    const rgb = (c) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    const open = m.sessions.filter((s) => s.open);
    const title = open.length ? open.map((s) => s.name).join(' + ') : 'Marché calme';
    const hh = `${String(Math.floor(hr)).padStart(2, '0')}:${String(Math.floor((hr % 1) * 60)).padStart(2, '0')}`;
    const moment = hr < 5 || hr >= 21 ? 'nuit' : hr < 8 ? 'aube' : hr < 17 ? 'plein jour' : 'fin de journée';
    const place = m.city ? `à ${m.city}` : 'chez toi';
    const rows = m.sessions.map((s) => {
      const segs = s.segs;
      const [a1, b1] = segs[0], [a2, b2] = segs[1] || [0, 0];
      const on = s.open, ct = cityTime(s.name), wx = WX[ct.wx];
      const bg = on ? 'linear-gradient(90deg, rgb(var(--green-rgb, 51, 230, 166)), var(--green-hi, rgb(110, 242, 201)))' : 'rgba(var(--fg-rgb, 255, 255, 255), 0.14)';
      return `
                  <div style="display: grid; grid-template-columns: 96px 1fr 52px; align-items: center; gap: 10px;">
                    <span style="display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 600; color: ${on ? 'var(--ink, rgb(246, 246, 247))' : 'var(--ink-2, rgb(155, 155, 161))'};">
                      <span aria-hidden="true" style="width: 14px; height: 14px; flex: 0 0 14px; border-radius: 999px; background: ${wx[0]}; box-shadow: ${wx[1]};"></span>
                      ${esc(s.name)}
                    </span>
                    <div style="position: relative; height: 10px; border-radius: 999px; background: rgba(var(--fg-rgb, 255, 255, 255), 0.04); box-shadow: rgba(var(--fg-rgb, 255, 255, 255), 0.06) 0px 0px 0px 1px inset;">
                      <div style="position: absolute; top: 0px; bottom: 0px; left: ${pctH(a1)}; width: ${pctH(b1 - a1)}; border-radius: 999px; background: ${bg}; box-shadow: ${on ? 'rgba(var(--green-rgb, 51, 230, 166), 0.45) 0px 0px 12px' : 'none'};"></div>
                      <div style="position: absolute; top: 0px; bottom: 0px; left: ${pctH(a2)}; width: ${pctH(b2 - a2)}; border-radius: 999px; background: ${bg};"></div>
                    </div>
                    <span style="text-align: right; font-size: 11px; font-weight: ${on ? 700 : 500}; color: ${on ? 'var(--green-hi, rgb(127, 243, 202))' : 'var(--ink-3, rgb(122, 122, 130))'};">${ct.txt}</span>
                  </div>`;
    }).join('');
    const level = open.length >= 2 ? ['rgb(var(--red-rgb, 255, 77, 94))', 'rgba(var(--red-rgb, 255, 77, 94), 0.18)', 'Volatilité forte'] : open.length === 1 ? ['rgb(var(--amber-rgb, 232, 179, 57))', 'rgba(var(--amber-rgb, 232, 179, 57), 0.18)', 'Volatilité moyenne'] : ['var(--ink-3, rgb(122, 122, 130))', 'rgba(122, 122, 130, 0.18)', 'Volatilité faible'];
    let vibe;
    if (open.length >= 2) { const end = Math.min(...open.map((s) => hr + s.delta)) % 24; vibe = `chevauchement jusqu'à ${Math.round(end)}h`; }
    else if (open.length === 1) vibe = `${open[0].name} seule jusqu'à ${Math.round((hr + open[0].delta) % 24)}h`;
    else { const nx = m.sessions.slice().sort((x, y) => x.delta - y.delta)[0]; vibe = nx ? `${nx.name} ouvre à ${Math.round((hr + nx.delta) % 24)}h` : ''; }
    $('d2Sess').innerHTML = `
            <div style="position: relative; height: 150px; overflow: hidden; background: linear-gradient(${rgb(sky.top)}, ${rgb(sky.mid)} 62%, ${rgb(sky.bot)}); display: flex; align-items: center; justify-content: center;">
              <div aria-hidden="true" style="position: absolute; inset: 0px; opacity: ${m.stars}; background-image: radial-gradient(1px 1px at 12% 22%, #fff, transparent), radial-gradient(1px 1px at 32% 12%, #fff, transparent), radial-gradient(1.5px 1.5px at 58% 28%, #fff, transparent), radial-gradient(1px 1px at 78% 16%, #fff, transparent), radial-gradient(1px 1px at 88% 40%, #fff, transparent);"></div>
              <svg aria-hidden="true" viewBox="0 0 100 60" preserveAspectRatio="none" style="position: absolute; left: 6%; right: 6%; top: 18px; width: 88%; height: 96px; opacity: 0.32;"><path d="M0 60 Q50 -40 100 60" fill="none" stroke="#fff" stroke-width="1.2" stroke-dasharray="1.5 4" vector-effect="non-scaling-stroke"></path></svg>
              <span aria-hidden="true" style="position: absolute; left: ${(6 + tS * 88).toFixed(1)}%; top: ${(18 + (1 - 4 * tS * (1 - tS)) * 96).toFixed(0)}px; width: 26px; height: 26px; margin: -13px 0px 0px -13px; border-radius: 999px; background: ${day ? WX.sun[0] : WX.moon[0]}; box-shadow: ${day ? 'rgba(255, 175, 70, 0.55) 0px 0px 20px 5px' : 'rgba(200, 215, 255, 0.45) 0px 0px 18px 4px'};"></span>
              <div aria-hidden="true" style="position: absolute; left: 0px; right: 0px; bottom: 18px; height: 1px; background: rgba(255, 255, 255, 0.22);"></div>
              <div style="position: relative; text-align: center; margin-top: 26px;">
                <div style="font-size: 23px; font-weight: 800; letter-spacing: -0.02em; color: #fff; text-shadow: rgba(0, 0, 0, 0.4) 0px 1px 8px;">${esc(title)}</div>
                <div style="margin-top: 4px; font-size: 12.5px; color: rgba(255, 255, 255, 0.88); text-shadow: rgba(0, 0, 0, 0.3) 0px 1px 4px;">${hh} ${esc(place)} · ${moment}</div>
              </div>
            </div>
            <div style="padding: 16px 18px 18px; display: flex; flex-direction: column; gap: 10px;">
              <div style="position: relative; display: flex; flex-direction: column; gap: 9px;">
                ${rows}
                <div aria-hidden="true" style="position: absolute; top: -5px; bottom: -5px; left: calc(106px + (100% - 168px) * ${(hr / 24).toFixed(4)}); width: 2px; margin-left: -1px; background: var(--ink, rgb(246, 246, 247));">
                  <span style="position: absolute; top: 50%; left: 50%; width: 14px; height: 14px; margin: -7px 0px 0px -7px; border-radius: 999px; background: rgb(var(--dk-rgb, 11, 11, 14)); border: 2px solid var(--ink, rgb(246, 246, 247)); box-shadow: rgba(0, 0, 0, calc(0.5 * var(--sh-k, 1))) 0px 2px 6px;"></span>
                </div>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 0px 62px 0px 106px; ${MONO} font-size: 9.5px; color: var(--ink-3, rgb(122, 122, 130));"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>24h</span></div>
              <div style="display: flex; align-items: center; gap: 8px; padding-top: 4px; font-size: 12.5px;">
                <span style="width: 8px; height: 8px; border-radius: 999px; background: ${level[0]}; box-shadow: ${level[1]} 0px 0px 0px 3px;"></span>
                <b>${level[2]}</b><span style="color: var(--ink-2, rgb(155, 155, 161));">· ${esc(vibe)}</span>
              </div>
            </div>`;
  }

  // ---------- Annonces du jour + prévision de la semaine ----------
  const CCY = { US: 'USD', EU: 'EUR', UK: 'GBP', JP: 'JPY', CH: 'CHF', CA: 'CAD', AU: 'AUD', NZ: 'NZD', CN: 'CNY', DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR' };
  const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  async function loadNews() {
    const url = (window.CHEST_CONFIG && window.CHEST_CONFIG.calendarApiUrl) || 'data/calendar.json';
    let events;
    try { const data = await fetch(url, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)); events = (data && data.events) || []; } catch (e) { events = null; }
    if (events === null) { $('d2News').innerHTML = EMPTY('Calendrier indisponible pour le moment.'); return; }
    const today = isoLocal(new Date()), nowHM = new Date().toTimeString().slice(0, 5);
    const rows = events.filter((e) => e.date === today && (e.importance === 'high' || e.importance === 'medium')).sort((a, b) => String(a.time).localeCompare(String(b.time))).slice(0, 3);
    $('d2News').innerHTML = rows.length ? rows.map((e) => {
      const n = e.importance === 'high' ? 3 : 2;
      const bars = [1, 2, 3].map((k) => `
                  <span style="width: 4px; height: 12px; border-radius: 2px; background: ${k <= n ? (n === 3 ? 'rgb(var(--red-rgb, 255, 77, 94))' : 'rgb(var(--amber-rgb, 232, 179, 57))') : 'rgba(var(--fg-rgb, 255, 255, 255), 0.1)'};"></span>`).join('');
      return `
              <div class="row-h" style="display: flex; align-items: center; gap: 12px; padding: 10px 8px; margin: 0px -8px; border-radius: 10px;">
                <span style="width: 44px; ${MONO} font-size: 12px; color: ${e.time && e.time < nowHM ? 'var(--ink-3, rgb(122, 122, 130))' : 'var(--ink, rgb(246, 246, 247))'}; font-variant-numeric: tabular-nums;">${esc(e.time || '—')}</span>
                <span style="${MONO} font-size: 10.5px; font-weight: 600; color: var(--ink-2, rgb(155, 155, 161)); border: 1px solid rgba(var(--fg-rgb, 255, 255, 255), 0.1); padding: 2px 6px; border-radius: 6px;">${esc(CCY[e.country] || e.country || '')}</span>
                <span style="flex: 1 1 0%; min-width: 0px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${esc(e.event)}</span>
                <span aria-label="Impact ${n === 3 ? 'fort' : 'moyen'}" style="display: flex; gap: 3px;">${bars}
                </span>
              </div>`;
    }).join('') : EMPTY('Aucune annonce forte ou moyenne aujourd’hui.');
    let pk = 'XAUUSD', lock = null;
    try { pk = localStorage.getItem('chest_sentiment_pair') || 'XAUUSD'; } catch (e) { /* défaut */ }
    try {
      const locks = JSON.parse(localStorage.getItem('chest_weekly_forecast_lock') || '{}');
      const key = Object.keys(locks).filter((k) => k.startsWith(pk + '|') && k.split('|')[1] <= today).sort().pop();
      lock = key ? locks[key] : null;
    } catch (e) { lock = null; }
    const fc = $('d2Forecast');
    if (lock && typeof lock.weeklyCapped === 'number') {
      const word = lock.tone === 'pos' ? 'haussier' : lock.tone === 'neg' ? 'baissier' : 'neutre';
      const col = lock.tone === 'pos' ? 'var(--green-hi, rgb(127, 243, 202))' : lock.tone === 'neg' ? 'var(--red-hi, rgb(255, 148, 160))' : 'var(--ink, rgb(246, 246, 247))';
      fc.innerHTML = `Prévision de la semaine sur ${esc(pair(pk))} : <strong style="color: ${col};">${word} ${sign(lock.weeklyCapped)}${nfr(Math.abs(lock.weeklyCapped), 1)} %</strong>`;
      fc.hidden = false;
    } else fc.hidden = true;
  }

  // ---------- Force des devises (H4) ----------
  async function loadStrength() {
    const box = $('d2Str');
    if (!window.CHESTCurrencyStrength || !CHESTCurrencyStrength.byTf) return;
    try {
      const list = (await CHESTCurrencyStrength.byTf(240)).slice(0, 8);
      box.innerHTML = list.map((c) => {
        const v = c.index;
        return `
                <div style="display: grid; grid-template-columns: 34px 1fr 1fr 40px; align-items: center; gap: 0px;">
                  <span style="${MONO} font-size: 11px; font-weight: 600; color: var(--ink-1, rgb(201, 201, 206));">${esc(c.code)}</span>
                  <div style="display: flex; justify-content: flex-end; height: 8px; border-right: 1px solid rgba(var(--fg-rgb, 255, 255, 255), 0.14);">
                    <div style="height: 100%; width: ${v < 0 ? Math.min(100, -v / 6 * 100) : 0}%; border-radius: 4px 0px 0px 4px; background: linear-gradient(270deg, rgba(var(--red-rgb, 255, 77, 94), 0.9), rgba(var(--red-rgb, 255, 77, 94), 0.25));"></div>
                  </div>
                  <div style="display: flex; height: 8px;">
                    <div style="height: 100%; width: ${v > 0 ? Math.min(100, v / 6 * 100) : 0}%; border-radius: 0px 4px 4px 0px; background: linear-gradient(90deg, rgba(var(--green-rgb, 51, 230, 166), 0.9), rgba(var(--green-rgb, 51, 230, 166), 0.25));"></div>
                  </div>
                  <span style="text-align: right; ${MONO} font-size: 11px; color: ${v >= 0 ? 'var(--green-hi, rgb(127, 243, 202))' : 'var(--red-hi, rgb(255, 148, 160))'}; font-variant-numeric: tabular-nums;">${v > 0 ? '+' : ''}${v.toFixed(1).replace('.', ',')}</span>
                </div>`;
      }).join('');
    } catch (e) { box.innerHTML = EMPTY('Force des devises indisponible pour le moment.'); }
  }

  // ---------- Derniers trades ----------
  const PILL = (buy) => `<span style="font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; padding: 3px 8px; border-radius: 999px; color: ${buy ? 'var(--green-hi, rgb(127, 243, 202))' : 'var(--red-hi, rgb(255, 148, 160))'}; background: ${buy ? 'rgba(var(--green-rgb, 51, 230, 166), 0.12)' : 'rgba(var(--red-rgb, 255, 77, 94), 0.12)'};">${buy ? 'Achat' : 'Vente'}</span>`;
  const when = (ms) => { const d = new Date(ms); return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} ${d.toTimeString().slice(0, 5)}`; };
  function paintTrades(a, trades) {
    const rr = new Map((trades || []).map((t) => [new Date(t.date).getTime(), t.rr]));
    const rows = (a.history || []).filter((t) => !t.action || /^(buy|sell)/i.test(String(t.action)))
      .map((t) => ({ t, close: toMs(t.closeTime), open: toMs(t.openTime) })).filter((x) => isFinite(x.close))
      .sort((x, y) => y.close - x.close).slice(0, 5);
    if (!rows.length) { $('d2TradeRows').innerHTML = EMPTY('Aucun trade sur ce compte pour l’instant.'); return; }
    $('d2TradeRows').innerHTML = rows.map(({ t, close, open }) => {
      const buy = !/sell/i.test(String(t.side || t.action || t.type || ''));
      const p = parseFloat(t.profit) || 0;
      const r = rr.get(new Date(close).getTime());
      const col = p >= 0 ? 'var(--green-hi, rgb(127, 243, 202))' : 'var(--red-hi, rgb(255, 148, 160))';
      return `
                <div class="row-h" style="display: grid; grid-template-columns: 1.2fr 0.8fr 1fr 0.7fr 1fr; gap: 10px; align-items: center; padding: 11px 8px; border-bottom: 1px solid rgba(var(--fg-rgb, 255, 255, 255), 0.043); font-size: 12.5px;">
                  <span style="font-weight: 600;">${esc(pair(t.symbol || t.pair))}</span>
                  <span>${PILL(buy)}</span>
                  <span style="color: var(--ink-2, rgb(155, 155, 161)); font-variant-numeric: tabular-nums;">${esc(when(isFinite(open) ? open : close))}</span>
                  <span style="color: var(--ink-2, rgb(155, 155, 161)); font-variant-numeric: tabular-nums;">${r == null ? '—' : `${sign(r)}${nfr(Math.abs(r), 1)}`}</span>
                  <span style="text-align: right; font-weight: 700; color: ${col}; font-variant-numeric: tabular-nums;">${usd(p)}</span>
                </div>`;
    }).join('');
  }

  // ---------- Signaux des scanners (paires et unités de tes règles d'alerte) ----------
  const ago = (ms) => { const m = Math.max(0, Math.round((Date.now() - ms) / 60000)); if (m < 60) return `il y a ${m} min`; const h = Math.round(m / 60); return h < 24 ? `il y a ${h} h` : `il y a ${Math.round(h / 24)} j`; };
  async function loadSignals() {
    const box = $('d2Sig');
    const base = (window.CHEST_CONFIG && window.CHEST_CONFIG.accountsApiUrl) || '';
    const token = window.CHESTAccounts && CHESTAccounts.getToken && CHESTAccounts.getToken();
    if (!base || !token) { box.innerHTML = EMPTY('Connecte-toi pour voir les signaux.'); return; }
    const H = { Authorization: 'Bearer ' + token };
    try {
      const rules = ((await fetch(`${base}/alerts/rules`, { headers: H }).then((r) => (r.ok ? r.json() : { rules: [] }))).rules) || [];
      const combos = rules.flatMap((r) => (r.pairs || []).flatMap((p) => (r.timeframes || []).map((tf) => `${p}|${tf}`)));
      if (!combos.length) { box.innerHTML = EMPTY('Aucune alerte réglée. <a href="strategies.html" style="color: var(--ink-2, rgb(155, 155, 161));">Choisis tes paires dans Stratégies →</a>'); return; }
      // Le dernier signal de chaque scanner activé dans tes règles (2026-11-10), toutes paires et unités confondues
      const d = await fetch(`${base}/alerts/latest`, { headers: H }).then((r) => (r.ok ? r.json() : { signals: [] })).catch(() => ({ signals: [] }));
      const sig = (d.signals || []).sort((x, y) => toMs(y.time) - toMs(x.time));
      if (!sig.length) { box.innerHTML = EMPTY('Pas encore de signal sur tes scanners suivis.'); return; }
      const S = window.CHESTScanners;
      box.innerHTML = sig.map((o) => {
        const sc = (S && S.get && S.get(o.scanner)) || {};
        const t = toMs(o.time);
        return `
            <a class="row-h" href="strategies.html?scanner=${encodeURIComponent(o.scanner)}&amp;symbol=${encodeURIComponent(o.symbol)}&amp;tf=${encodeURIComponent(o.tf)}" style="display: flex; align-items: center; gap: 12px; padding: 9px 8px; margin: 0px -8px; border-radius: 12px; color: inherit; text-decoration: none;">
              <img src="${esc(sc.logo || 'assets/logo-chest-new.webp')}" alt="" style="width: 34px; height: 34px; border-radius: 9px; object-fit: cover;">
              <div style="display: flex; flex-direction: column; gap: 2px; min-width: 0px; flex: 1 1 0%;">
                <span style="font-weight: 600;">${esc((sc.name || o.scanner || '').toUpperCase())} <span style="color: var(--ink-3, rgb(122, 122, 130)); font-weight: 400;">· ${esc(pair(o.symbol))} ${esc(TF[o.tf] || o.tf)}</span></span>
                <span style="font-size: 11.5px; color: var(--ink-3, rgb(122, 122, 130));">${esc(ago(t))} · bougie de ${esc(new Date(t).toTimeString().slice(0, 5))}</span>
              </div>
              ${PILL(o.side === 'buy')}
            </a>`;
      }).join('');
    } catch (e) { box.innerHTML = EMPTY('Signaux indisponibles pour le moment.'); }
  }

  // ---------- Branchement ----------
  document.addEventListener('chest:dash-render', (ev) => {
    const { account, period, data, periods, objectives, trades } = ev.detail || {};
    if (!account || !data) return;
    $('d2AccLabel').textContent = `${account.name || 'Compte'} · ${account.isPropfirm ? 'Propfirm' : 'Compte propre'}`;
    paintBand(account, data, periods || {}, period, objectives);
    paintChart(data, period, account);
    paintTrades(account, trades);
    // positions ouvertes : le bloc n'apparaît que s'il y a vraiment une position (comme la maquette, qui n'en montre pas sinon)
    const pos = $('openPosSection');
    if (pos && !pos.querySelector('.openpos__row:not(.is-head)')) pos.hidden = true;
  });
  paintSessions();
  setInterval(paintSessions, 60000);
  loadNews();
  loadStrength();
  loadSignals();
})();

// Barre du haut du Dashboard (2026-11-05, demande utilisateur : « met lui quelque chose comme la session en cours ») :
// sessions de marché ouvertes (Sydney, Tokyo, Londres, New York, heures locales de chaque place, donc heure d'été
// comprise) et temps restant avant la fin de la session (ou avant l'ouverture de la suivante).
(function () {
  const T = window.parent !== window && window.parent.CHESTTopbar;
  if (!T) return;
  const SESS = [
    { k: 'Sydney', tz: 'Australia/Sydney', o: 7, c: 16 },
    { k: 'Tokyo', tz: 'Asia/Tokyo', o: 9, c: 18 },
    { k: 'Londres', tz: 'Europe/London', o: 8, c: 17 },
    { k: 'New York', tz: 'America/New_York', o: 8, c: 17 },
  ];
  const fmts = {};
  function local(tz, d) { // heure locale décimale + jour de semaine de la place
    const f = fmts[tz] || (fmts[tz] = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short', hourCycle: 'h23' }));
    const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
    return { h: +p.hour + p.minute / 60 + p.second / 3600, wd: p.weekday };
  }
  function weekendClosed(d) { // forex : fermé du vendredi 17 h au dimanche 17 h (New York)
    const n = local('America/New_York', d);
    return (n.wd === 'Fri' && n.h >= 17) || n.wd === 'Sat' || (n.wd === 'Sun' && n.h < 17);
  }
  function openNow(s, d) { const l = local(s.tz, d); return !weekendClosed(d) && !['Sat', 'Sun'].includes(l.wd) && l.h >= s.o && l.h < s.c; }
  function nextChange(d, pred) { // minutes avant que pred(d) change (pas de 1 min, 3 jours max)
    const cur = pred(d);
    for (let m = 1; m <= 4320; m++) { if (pred(new Date(d.getTime() + m * 60000)) !== cur) return m; }
    return null;
  }
  const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`);
  let last = '';
  function tick() {
    const d = new Date();
    const open = SESS.filter((s) => openNow(s, d));
    let dot = 'var(--ink-3, rgb(122, 122, 130))', halo = 'rgba(var(--fg-rgb, 255, 255, 255), 0.08)', txt;
    if (weekendClosed(d)) {
      const m = nextChange(d, weekendClosed);
      txt = `Marché fermé · ouvre dans ${m ? dur(m) : '—'}`;
    } else if (!open.length) {
      const m = nextChange(d, (x) => SESS.some((s) => openNow(s, x)));
      txt = `Entre deux sessions · prochaine dans ${m ? dur(m) : '—'}`;
    } else {
      dot = 'rgb(var(--green-rgb, 51, 230, 166))'; halo = 'rgba(var(--green-rgb, 51, 230, 166), 0.16)';
      const names = open.map((s) => s.k).join(' + ');
      const m = nextChange(d, (x) => SESS.filter((s) => openNow(s, x)).map((s) => s.k).join());
      txt = `Session ${names}${open.length > 1 ? ' · chevauchement' : ''}${m ? ` · change dans ${dur(m)}` : ''}`;
    }
    if (txt === last) return;
    last = txt;
    T.set(window, `<span style="display: flex; align-items: center; gap: 8px; height: 34px; padding: 0px 12px; border-radius: 999px; border: 1px solid rgba(var(--fg-rgb, 255, 255, 255), 0.1); font-size: 12px; color: var(--ink-2, rgb(155, 155, 161)); font-variant-numeric: tabular-nums; white-space: nowrap;" title="Sessions du marché des changes, heures locales de chaque place">
        <span style="width: 6px; height: 6px; border-radius: 999px; background: ${dot}; box-shadow: ${halo} 0px 0px 0px 3px;"></span>${txt}
      </span>`);
  }
  tick();
  setInterval(tick, 15000);
})();
