// CHEST 2.0 (2026-11-02) — vue d'un journal posée à l'identique de CHEST-DESIGN-2.0/html-exact/Journal.html
// (styles en ligne recopiés de la maquette). Données : événement chest:jr-render de journal.html
// ({ acc, rows, subtitleOf }) + CHESTJournal pour les autres journaux. Rien n'est inventé : une règle ou une donnée
// absente = un état vide. Les formulaires (trade, compte, compte live) restent ceux de journal.html.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MONO = "font-family: 'Fragment Mono', ui-monospace, monospace;";
  const LABEL = MONO + ' font-size: 10.5px; letter-spacing: 0.2em; text-transform: uppercase; color: rgb(122, 122, 130);';
  const COLORS = ['#fc1283', '#9dbcff', '#e8b339', '#33e6a6', '#b46bff', '#f9a45e'];
  const POS = 'rgb(127, 243, 202)', NEG = 'rgb(255, 148, 160)';
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const J = () => window.CHESTJournal;
  let state = null, filter = 'all';

  const nf = (v, d) => Number(v).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const sign = (v) => (v > 0 ? '+' : v < 0 ? '−' : '');
  const money = (v, d) => (v == null ? '—' : sign(v) + nf(Math.abs(v), d == null ? 0 : d) + ' $');
  const pct = (v, d) => (v == null ? '—' : sign(v) + nf(Math.abs(v), d == null ? 1 : d) + ' %');
  const ink = (v) => (v > 0 ? POS : v < 0 ? NEG : 'rgb(246, 246, 247)');
  const when = (r) => new Date(r.closeAt || r.date);
  const closed = (rows) => rows.filter((r) => r.result && r.pnl != null && isFinite(r.pnl) && r.date).sort((a, b) => when(a) - when(b));
  const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const pairLabel = (p) => { const s = String(p || '').toUpperCase(); return /^[A-Z]{6}$/.test(s) ? s.slice(0, 3) + '/' + s.slice(3) : (s || '—'); };
  const num = (v, d) => (v == null || !isFinite(v) ? '—' : nf(v, d));
  const priceDigits = (v) => (v == null ? 2 : Math.abs(v) >= 1000 ? 1 : Math.abs(v) >= 50 ? 2 : 4);

  // Mois montré : le mois en cours s'il a des positions clôturées, sinon celui de la dernière position.
  function monthOf(rows) {
    const now = new Date();
    const inMonth = (r, y, m) => { const d = when(r); return d.getFullYear() === y && d.getMonth() === m; };
    if (rows.some((r) => inMonth(r, now.getFullYear(), now.getMonth())) || !rows.length) return { y: now.getFullYear(), m: now.getMonth(), current: true };
    const last = when(rows[rows.length - 1]);
    return { y: last.getFullYear(), m: last.getMonth(), current: false };
  }
  const monthRows = (rows, M) => rows.filter((r) => { const d = when(r); return d.getFullYear() === M.y && d.getMonth() === M.m; });

  // ---------- Barre du haut : état de la synchro du compte relié ----------
  function paintTopbar(acc) {
    const T = window.parent !== window && window.parent.CHESTTopbar;
    if (!T) return;
    const lives = J().liveAccounts(acc);
    if (!lives.length) { T.set(window, ''); return; }
    const l = lives.slice().sort((a, b) => new Date(b.lastSync || 0) - new Date(a.lastSync || 0))[0];
    const hm = l.lastSync ? new Date(l.lastSync).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—';
    const err = !!l.lastError;
    const label = err ? 'Synchro impossible' : (l.kind === 'vps' ? 'VPS en direct' : 'Myfxbook') + ' · ' + hm;
    T.set(window, `<span style="display: flex; align-items: center; gap: 8px; height: 34px; padding: 0px 12px; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.1); font-size: 12px; color: rgb(155, 155, 161);">
        <span style="width: 6px; height: 6px; border-radius: 999px; background: ${err ? 'rgb(255, 77, 94)' : 'rgb(51, 230, 166)'}; box-shadow: ${err ? 'rgba(255, 77, 94, 0.16)' : 'rgba(51, 230, 166, 0.16)'} 0px 0px 0px 3px;"></span>${esc(label)}
      </span>`);
  }

  // ---------- Héros ----------
  function curveSvg(rows, M) {
    const pts = closed(monthRows(rows, M));
    let c = 0;
    const ys = [0].concat(pts.map((r) => (c += r.pnl)));
    const total = ys[ys.length - 1];
    const max = Math.max(...ys, 0), min = Math.min(...ys, 0), span = (max - min) || 1;
    const X = (i) => (ys.length > 1 ? (i / (ys.length - 1)) * 940 : 0);
    const Y = (v) => 246 - (v - min) / span * 232;
    const line = ys.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ');
    const neg = total < 0;
    const col = neg ? '255,77,94' : '51,230,166', hex = neg ? '#ff4d5e' : '#33e6a6';
    const last = new Date(M.y, M.m + 1, 0).getDate();
    const endDay = M.current ? new Date().getDate() : last;
    const mm = MONTHS[M.m].slice(0, 4).replace(/(janv|févr|avri|juil|sept|octo|nove|déce)$/, (s) => ({ janv: 'janv.', févr: 'févr.', avri: 'avr.', juil: 'juil.', sept: 'sept.', octo: 'oct.', nove: 'nov.', déce: 'déc.' }[s])).replace(/^(mars|mai|juin|août)$/, '$1');
    const short = ({ 2: 'mars', 4: 'mai', 5: 'juin', 7: 'août' })[M.m] || mm;
    const yEnd = Y(total);
    return `
      <div style="position: relative; height: clamp(200px, 30vh, 300px); margin: 20px -36px 0px; mask-image: linear-gradient(90deg, transparent, rgb(0, 0, 0) 6%, rgb(0, 0, 0) 94%, transparent);">
        <svg width="100%" height="100%" viewBox="0 0 1000 260" preserveAspectRatio="none" aria-label="P&amp;L cumulé du compte" style="display: block; overflow: visible; height: 100%;">
          <defs>
            <linearGradient id="jA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(${col},.3)"></stop><stop offset=".7" stop-color="rgba(${col},.04)"></stop><stop offset="1" stop-color="rgba(${col},0)"></stop></linearGradient>
            <linearGradient id="jL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="rgba(${col},.35)"></stop><stop offset=".6" stop-color="${hex}"></stop><stop offset="1" stop-color="#ffffff"></stop></linearGradient>
          </defs>
          <line x1="0" x2="1000" y1="71" y2="71" stroke="rgba(255,255,255,.045)" vector-effect="non-scaling-stroke"></line>
          <line x1="0" x2="1000" y1="130" y2="130" stroke="rgba(255,255,255,.045)" vector-effect="non-scaling-stroke"></line>
          <line x1="0" x2="1000" y1="189" y2="189" stroke="rgba(255,255,255,.045)" vector-effect="non-scaling-stroke"></line>
          <line x1="0" x2="1000" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" stroke="rgba(255,255,255,.16)" stroke-dasharray="3 7" vector-effect="non-scaling-stroke"></line>
          ${pts.length ? `<path d="${line} L940 260 L0 260 Z" fill="url(#jA)"></path>
          <path d="${line}" fill="none" stroke="url(#jL)" stroke-width="2.4" stroke-linejoin="round" vector-effect="non-scaling-stroke" style="filter: drop-shadow(rgba(${col}, 0.5) 0px 0px 8px);"></path>` : ''}
        </svg>
        ${pts.length ? `<span class="pulse" style="position: absolute; left: 94%; top: ${(yEnd / 260 * 100).toFixed(2)}%; width: 11px; height: 11px; margin: -5.5px 0px 0px -5.5px; border-radius: 999px; background: rgb(255, 255, 255); box-shadow: rgba(${col}, 0.25) 0px 0px 0px 4px, rgba(${col}, 0.9) 0px 0px 22px;"></span>` : ''}
        <span style="position: absolute; left: 36px; bottom: 8px; font-size: 10.5px; color: rgb(122, 122, 130);">${pts.length ? '' : `Pas encore de position clôturée en ${MONTHS[M.m]}.`}</span>
      </div>`;
  }

  function legendHtml(acc, others, M) {
    return others.map((o) => {
      const v = closed(monthRows(o.rows, M)).reduce((s, r) => s + r.pnl, 0);
      return `
          <a href="journal.html?acc=${encodeURIComponent(o.a.id)}" class="leg" style="display: inline-flex; align-items: center; gap: 9px; padding: 4px 0px; font-size: 12.5px; color: ${o.a.id === acc.id ? 'rgb(246, 246, 247)' : 'rgb(155, 155, 161)'};">
            <i style="width: 6px; height: 6px; border-radius: 999px; background: ${o.color}; box-shadow: ${o.color} 0px 0px 8px;"></i>
            <span>${esc(o.a.name || 'Journal')}</span>
            <b style="font-weight: 700; font-variant-numeric: tabular-nums; color: ${v < 0 ? NEG : POS};">${money(v)}</b>
          </a>`;
    }).join('');
  }
  function paintLegend(acc, others, M) { const el = $('jr2Legend'); if (el) el.innerHTML = legendHtml(acc, others, M); }
  function paintHero(acc, rows, others) {
    const M = monthOf(closed(rows));
    const mrows = closed(monthRows(rows, M));
    const tot = mrows.reduce((s, r) => s + r.pnl, 0);
    const lastDay = M.current ? new Date().getDate() : new Date(M.y, M.m + 1, 0).getDate();
    const bits = [`Du 1er au ${lastDay} ${MONTHS[M.m]}`];
    if (acc.balance > 0) bits.push(`${pct(tot / acc.balance * 100, 2)} sur ${nf(acc.balance, 0)} $`);
    bits.push(`${mrows.length} position${mrows.length > 1 ? 's' : ''} clôturée${mrows.length > 1 ? 's' : ''}`);
    const grad = tot < 0 ? 'linear-gradient(rgb(255, 255, 255) 8%, rgb(255, 194, 201) 45%, rgb(255, 77, 94)) text' : 'linear-gradient(rgb(255, 255, 255) 8%, rgb(201, 251, 233) 45%, rgb(51, 230, 166)) text';
    const glow = tot < 0 ? 'rgba(255, 77, 94, 0.3)' : 'rgba(51, 230, 166, 0.3)';
    const tabs = others.map((o) => `
          <button type="button" role="tab" data-acc="${esc(o.a.id)}" aria-selected="${o.a.id === acc.id}" style="position: relative; padding: 8px 0px; border: 0px; background: none; font: inherit; font-size: 12.5px; font-weight: 600; color: ${o.a.id === acc.id ? 'rgb(246, 246, 247)' : 'rgb(122, 122, 130)'}; cursor: pointer;">
            ${esc(o.a.name || 'Journal')}
            <span aria-hidden="true" style="position: absolute; left: 0px; right: 0px; bottom: 0px; height: 2px; border-radius: 2px; background: linear-gradient(90deg, rgb(var(--a1-rgb, 252, 18, 131)), rgb(var(--a2-rgb, 249, 164, 94))); box-shadow: rgba(var(--a1-rgb, 252, 18, 131), 0.55) 0px 0px 10px; opacity: ${o.a.id === acc.id ? 1 : 0};"></span>
          </button>`).join('');
    const legend = legendHtml(acc, others, M);
    $('jr2Hero').innerHTML = `
      <div aria-hidden="true" style="position: absolute; left: 50%; top: 0px; width: 900px; height: 520px; margin-left: -450px; z-index: -2; pointer-events: none; filter: blur(100px); background: radial-gradient(40% 46% at 42% 42%, rgba(51, 230, 166, 0.16), transparent 72%), radial-gradient(34% 40% at 64% 36%, rgba(var(--a1-rgb, 252, 18, 131), 0.12), transparent 74%);"></div>
      <div class="ghost" aria-hidden="true" style="position: absolute; left: 50%; top: 16px; transform: translateX(-50%); z-index: -1; pointer-events: none; white-space: nowrap; font-size: 210px; font-weight: 700; letter-spacing: -0.06em; line-height: 1; background: linear-gradient(rgba(255, 255, 255, 0.075), rgba(255, 255, 255, 0) 78%) text; color: transparent;">Journal</div>
      <div role="tablist" aria-label="Tes journaux" style="display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 24px;">${tabs}
        <button type="button" data-jr2="new" style="padding: 8px 0px; border: 0px; background: none; font: inherit; font-size: 12.5px; font-weight: 600; color: rgb(var(--a2-rgb, 249, 164, 94)); cursor: pointer;">+ Nouveau journal</button>
      </div>
      <h1 style="margin: 18px 0px 0px; font-size: 64px; line-height: 1; font-weight: 700; letter-spacing: -0.05em;">${esc(acc.name || 'Journal')}</h1>
      <div style="margin-top: 8px; font-size: 13px; color: rgb(155, 155, 161);">${esc(state.subtitle)}</div>
      <div style="margin-top: 22px; ${MONO} font-size: 10px; font-weight: 600; letter-spacing: 0.22em; text-transform: uppercase; color: rgb(122, 122, 130);">P&amp;L ${M.current ? 'du mois' : 'de ' + MONTHS[M.m]}</div>
      <div style="margin-top: 12px; font-size: 100px; line-height: 0.98; padding-bottom: 0.04em; font-weight: 700; letter-spacing: -0.055em; font-variant-numeric: tabular-nums; background: ${grad}; color: transparent; filter: drop-shadow(${glow} 0px 0px 36px);">${money(tot, 2)}</div>
      <p style="max-width: 520px; margin: 12px auto 0px; font-size: 13px; line-height: 1.6; color: rgb(155, 155, 161);">${esc(bits.join(' · '))}</p>
      <div style="margin-top: 24px; display: flex; justify-content: center; gap: 10px; flex-wrap: wrap;">
        ${$('jrAddBtn') && !$('jrAddBtn').hidden ? `<button type="button" data-jr2="add" style="display: flex; align-items: center; height: 44px; padding: 0px 22px; border-radius: 999px; border: 0px; color: rgb(255, 255, 255); font: inherit; font-weight: 600; cursor: pointer; background: linear-gradient(135deg, rgb(var(--a1-rgb, 252, 18, 131)), rgb(var(--a2-rgb, 249, 164, 94))); box-shadow: rgba(var(--a1-rgb, 252, 18, 131), 0.3) 0px 10px 30px;">+ Ajouter un trade</button>` : ''}
        <button type="button" class="btn2" data-jr2="edit" style="display: flex; align-items: center; height: 44px; padding: 0px 20px; border-radius: 999px; border: 1px solid transparent; background: linear-gradient(rgb(11, 11, 14), rgb(11, 11, 14)) padding-box padding-box, linear-gradient(135deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.14)) border-box border-box; color: rgb(246, 246, 247); font: inherit; font-weight: 600; cursor: pointer;">Modifier ce compte</button>
      </div>
      <div id="jr2Legend" style="margin: 28px auto 0px; display: flex; justify-content: center; flex-wrap: wrap; gap: 10px 26px;">${legend}
      </div>
      ${curveSvg(rows, M)}`;
    return M;
  }

  // ---------- KPI ----------
  function drawdown(acc, rows) {
    let c = 0, peak = 0, worst = 0, at = null;
    closed(rows).forEach((r) => { c += r.pnl; if (c > peak) peak = c; const dd = c - peak; if (dd < worst) { worst = dd; at = when(r); } });
    return { usd: worst, pct: acc.balance > 0 ? worst / (acc.balance + peak) * 100 : null, at };
  }
  function paintKpis(acc, rows) {
    const s = J().computeStats(rows);
    const dd = drawdown(acc, rows);
    const k = (label, val, note, color, glow, first) => `
          <div style="display: flex; flex-direction: column; gap: 8px; padding: 2px 22px; border-left: ${first ? '0px' : '1px solid rgba(255, 255, 255, 0.09)'};">
            <span style="${MONO} font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: rgb(122, 122, 130);">${label}</span>
            <span style="font-size: 25px; font-weight: 700; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; color: ${color}; text-shadow: ${glow || 'none'};">${val}</span>
            <span style="font-size: 11.5px; color: rgb(122, 122, 130);">${note}</span>
          </div>`;
    $('jr2Kpis').innerHTML =
      k('Winrate', s.winRatePct == null ? '—' : nf(Math.round(s.winRatePct), 0) + ' %', `${s.total} trade${s.total > 1 ? 's' : ''}`, 'rgb(246, 246, 247)', null, true)
      + k('R moyen par trade', s.avgRR == null ? '—' : sign(s.avgRR) + nf(Math.abs(s.avgRR), 2) + ' R', 'pertes comprises', s.avgRR == null ? 'rgb(246, 246, 247)' : ink(s.avgRR), s.avgRR > 0 ? 'rgba(51, 230, 166, 0.35) 0px 0px 18px' : null)
      + k('P&amp;L total', money(s.totalPnl), 'sur ce compte', s.totalPnl == null ? 'rgb(246, 246, 247)' : ink(s.totalPnl))
      + k('Trades', String(s.total), `${s.tp} TP · ${s.sl} SL · ${s.be} BE${s.open ? ' · ' + s.open + ' en cours' : ''}`, 'rgb(246, 246, 247)')
      + k('Drawdown max', dd.usd ? (dd.pct != null ? pct(dd.pct) : money(dd.usd)) : '0 %', dd.at ? 'le ' + dd.at.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : 'aucun recul', dd.usd ? NEG : 'rgb(246, 246, 247)');
  }

  // ---------- 02 — Conditions du compte (règles du challenge) ----------
  function paintConditions(acc, rows) {
    const R = acc.rules;
    $('jr2CondHint').textContent = state.subtitle || '';
    const box = $('jr2Conds');
    if (!R || !(acc.balance > 0)) {
      box.innerHTML = `<p style="margin: 14px 0px 0px; font-size: 12.5px; line-height: 1.6; color: rgb(122, 122, 130);">${!R ? (acc.type === 'propfirm' ? 'Règles du challenge pas encore renseignées : ouvre « Modifier ce compte » et choisis le modèle de la propfirm.' : 'Compte propre : pas de règles de challenge à suivre.') : 'Renseigne le solde du compte (Modifier ce compte) pour suivre les règles du challenge.'}</p>`;
      return;
    }
    const bal = acc.balance, cl = closed(rows);
    const total = cl.reduce((s, r) => s + r.pnl, 0);
    const byDay = new Map();
    cl.forEach((r) => { const k = dayKey(when(r)); byDay.set(k, (byDay.get(k) || 0) + r.pnl); });
    const worstDay = Math.min(0, ...byDay.values());
    let c = 0, low = 0; cl.forEach((r) => { c += r.pnl; low = Math.min(low, c); });
    const days = byDay.size;
    const items = [];
    const row = (title, sub, ratio, bar, status) => {
      const st = status === 'ok' ? { t: '✓', c: POS, b: 'rgba(51, 230, 166, 0.16)', g: 'rgba(51, 230, 166, 0.25)' }
        : status === 'ko' ? { t: '✗', c: NEG, b: 'rgba(255, 77, 94, 0.16)', g: 'rgba(255, 77, 94, 0.25)' }
        : { t: '…', c: 'rgb(244, 208, 122)', b: 'rgba(232, 179, 57, 0.16)', g: 'rgba(232, 179, 57, 0.2)' };
      return `
            <div style="display: flex; align-items: center; gap: 14px; padding: 14px 0px; border-bottom: 1px solid rgba(255, 255, 255, 0.055);">
              <span style="flex: 1 1 0%; display: flex; flex-direction: column; gap: 3px; min-width: 0px;">
                <span style="font-size: 13px;">${esc(title)}</span>
                <span style="font-size: 11.5px; color: rgb(122, 122, 130);">${esc(sub)}</span>
              </span>
              <div style="width: 110px; height: 4px; border-radius: 999px; background: rgba(255, 255, 255, 0.06);"><div style="height: 100%; width: ${Math.max(0, Math.min(100, ratio * 100)).toFixed(0)}%; border-radius: 999px; background: ${bar};"></div></div>
              <span style="width: 22px; height: 22px; flex: 0 0 22px; border-radius: 999px; display: grid; place-items: center; font-size: 11px; font-weight: 700; color: ${st.c}; background: ${st.b}; box-shadow: ${st.g} 0px 0px 12px;">${st.t}</span>
            </div>`;
    };
    const fmtP = (v) => nf(v, 1).replace(/,0$/, '');
    if (R.profitTargetPct) {
      const goal = bal * R.profitTargetPct / 100, done = total / bal * 100;
      items.push(row(`Objectif de profit ${fmtP(R.profitTargetPct)} %`, total >= goal ? `${pct(done)} atteint · objectif validé` : `${pct(done)} atteint · encore ${nf(goal - total, 0)} $`,
        total / goal, 'linear-gradient(90deg, rgb(var(--a1-rgb, 252, 18, 131)), rgb(var(--a2-rgb, 249, 164, 94)))', total >= goal ? 'ok' : 'wait'));
    }
    if (R.dailyLossPct) {
      const lim = bal * R.dailyLossPct / 100;
      items.push(row(`Perte du jour < ${fmtP(R.dailyLossPct)} %`, `pire jour : ${worstDay ? pct(worstDay / bal * 100) : 'aucune perte'}`, -worstDay / lim, 'rgb(232, 179, 57)', -worstDay > lim ? 'ko' : 'ok'));
    }
    if (R.maxLossPct) {
      const lim = bal * R.maxLossPct / 100;
      items.push(row(`Perte max < ${fmtP(R.maxLossPct)} %`, `plus bas : ${low ? pct(low / bal * 100) : 'jamais sous le départ'}`, -low / lim, 'rgb(232, 179, 57)', -low > lim ? 'ko' : 'ok'));
    }
    if (R.minDays) {
      items.push(row(`${R.minDays} jours de trading minimum`, `${days} jour${days > 1 ? 's' : ''}`, days / R.minDays, 'rgb(51, 230, 166)', days >= R.minDays ? 'ok' : 'wait'));
    }
    box.innerHTML = items.join('') || '<p style="margin: 14px 0px 0px; font-size: 12.5px; color: rgb(122, 122, 130);">Aucune règle chiffrée pour ce challenge.</p>';
  }

  // ---------- 03 — Le mois jour par jour ----------
  function paintMonth(rows, M) {
    const cl = closed(monthRows(rows, M));
    const byDay = new Map();
    const last = new Date(M.y, M.m + 1, 0).getDate();
    // grille du lundi au vendredi : une position du week-end compte pour le lundi suivant (réouverture du marché),
    // ou pour le vendredi d'avant quand ce lundi tombe le mois suivant
    const dowOf = (d) => (new Date(M.y, M.m, d).getDay() + 6) % 7;
    const slot = (d) => { const w = dowOf(d); if (w < 5) return d; const mon = d + (7 - w); return mon <= last ? mon : d - (w - 4); };
    cl.forEach((r) => { const d = slot(when(r).getDate()); byDay.set(d, (byDay.get(d) || 0) + r.pnl); });
    const vals = [...byDay.values()];
    const maxAbs = Math.max(1, ...vals.map(Math.abs));
    const best = vals.length ? Math.max(...vals) : null;
    $('jr2MonthTitle').textContent = `03 — ${MONTHS[M.m][0].toUpperCase() + MONTHS[M.m].slice(1)} jour par jour`;
    $('jr2MonthHint').textContent = byDay.size ? `${byDay.size} jour${byDay.size > 1 ? 's' : ''} tradé${byDay.size > 1 ? 's' : ''}${best > 0 ? ' · meilleur jour ' + sign(best) + nf(Math.abs(best), 0) + ' $' : ''}` : 'aucun jour tradé';
    const today = new Date();
    const cells = [];
    let first = 1; while (dowOf(first) > 4) first++;
    for (let i = 0; i < dowOf(first); i++) cells.push(null);
    for (let d = first; d <= last; d++) if (dowOf(d) < 5) cells.push(d);
    const cell = (d) => {
      if (d == null) return `
            <div style="display: flex; flex-direction: column; justify-content: space-between; height: 48px; padding: 6px 10px; box-sizing: border-box; border-radius: 10px; background: transparent; box-shadow: rgba(255, 255, 255, 0.04) 0px 0px 0px 1px inset;">
              <span style="${MONO} font-size: 9.5px; color: rgb(122, 122, 130);"></span>
              <span style="font-size: 12px; font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; color: rgb(122, 122, 130);"></span>
            </div>`;
      const v = byDay.get(d);
      const future = M.current && d > today.getDate();
      let bg = 'rgba(255, 255, 255, 0.02)', sh = 'rgba(255, 255, 255, 0.05)', col = 'rgb(122, 122, 130)', txt = future ? '' : '—';
      if (future) { bg = 'transparent'; sh = 'rgba(255, 255, 255, 0.04)'; }
      if (v != null) {
        const a = 0.06 + 0.25 * Math.abs(v) / maxAbs;
        const c = v >= 0 ? '51, 230, 166' : '255, 77, 94';
        bg = `rgba(${c}, ${a.toFixed(2)})`; sh = `rgba(${c}, ${(a * 1.25 + 0.01).toFixed(2)})`;
        col = v >= 0 ? POS : NEG; txt = sign(v) + nf(Math.abs(v), 0);
      }
      return `
            <div style="display: flex; flex-direction: column; justify-content: space-between; height: 48px; padding: 6px 10px; box-sizing: border-box; border-radius: 10px; background: ${bg}; box-shadow: ${sh} 0px 0px 0px 1px inset;">
              <span style="${MONO} font-size: 9.5px; color: rgb(122, 122, 130);">${String(d).padStart(2, '0')}</span>
              <span style="font-size: 12px; font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; color: ${col};">${txt}</span>
            </div>`;
    };
    $('jr2Month').innerHTML = ['LUN', 'MAR', 'MER', 'JEU', 'VEN'].map((d) => `
          <span style="${MONO} font-size: 9.5px; color: rgb(122, 122, 130); text-align: center;">${d}</span>`).join('') + cells.map(cell).join('');
  }

  // ---------- 04 — Positions ----------
  function paintPositions(rows) {
    const all = rows.slice().sort((a, b) => when(b) - when(a));
    const list = all.filter((r) => filter === 'all' || (filter === 'win' ? r.pnl > 0 : r.pnl < 0));
    $('jr2Filter').innerHTML = [['all', 'Toutes'], ['win', 'Gagnantes'], ['loss', 'Perdantes']].map(([k, l]) => `
            <button type="button" data-filter="${k}" aria-pressed="${filter === k}" style="height: 30px; padding: 0px 12px; border: 0px; border-radius: 999px; background: ${filter === k ? 'rgb(246, 246, 247)' : 'transparent'}; color: ${filter === k ? 'rgb(5, 5, 5)' : 'rgb(155, 155, 161)'}; font: inherit; font-size: 12px; font-weight: ${filter === k ? 600 : 400}; cursor: pointer;">${l}</button>`).join('');
    const COLS = 'grid-template-columns: 1.1fr 1fr 0.8fr 0.6fr 0.9fr 0.9fr 0.6fr 1.3fr 0.9fr;';
    const shown = list.slice(0, 8);
    $('jr2Rows').innerHTML = shown.length ? shown.map((r) => {
      const d = when(r);
      const lot = r.lots != null ? r.lots : r.mfx && r.mfx.lots;
      const exit = r.exit != null ? r.exit : r.mfx && r.mfx.close;
      const raw = (r.tags && r.tags[0]) || (r.notes ? String(r.notes).split('\n')[0] : '') || r.sourceLabel || '';
      const note = raw.length > 26 ? raw.slice(0, 25).trimEnd() + '…' : raw;
      const sell = r.side === 'sell';
      return `
              <div class="row-h"${r.source === 'manual' || !r.source ? ` data-edit="${esc(r.id)}" style="cursor: pointer;` : ' style="'} display: grid; ${COLS} gap: 10px; align-items: center; padding: 12px 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.043); font-size: 12.5px;">
                <span style="color: rgb(155, 155, 161); font-variant-numeric: tabular-nums; white-space: nowrap;">${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                <span style="font-weight: 600;">${esc(pairLabel(r.pair))}</span>
                <span>${r.side ? `<span style="font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; padding: 3px 8px; border-radius: 999px; color: ${sell ? NEG : POS}; background: ${sell ? 'rgba(255, 77, 94, 0.12)' : 'rgba(51, 230, 166, 0.12)'};">${sell ? 'Vente' : 'Achat'}</span>` : '—'}</span>
                <span style="color: rgb(155, 155, 161); font-variant-numeric: tabular-nums;">${num(lot, 2)}</span>
                <span style="font-variant-numeric: tabular-nums;">${num(r.entry, priceDigits(r.entry))}</span>
                <span style="font-variant-numeric: tabular-nums;">${num(exit, priceDigits(exit))}</span>
                <span style="color: rgb(155, 155, 161); font-variant-numeric: tabular-nums;">${r.rrActual != null ? sign(r.rrActual) + nf(Math.abs(r.rrActual), 1) : '—'}</span>
                <span style="min-width: 0px;"${raw.length > 26 ? ` title="${esc(raw)}"` : ''}>${note ? `<span style="font-size: 11px; padding: 3px 8px; border-radius: 999px; color: rgb(201, 201, 206); background: rgba(255, 255, 255, 0.05); display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle;">${esc(note)}</span>` : ''}</span>
                <span style="text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; color: ${r.result ? ink(r.pnl) : 'rgb(155, 155, 161)'};">${r.result ? money(r.pnl) : 'En cours'}</span>
              </div>`;
    }).join('') : `<p style="margin: 0px; padding: 22px 8px; font-size: 12.5px; color: rgb(122, 122, 130);">${all.length ? 'Aucune position pour ce filtre.' : 'Aucune position dans ce journal pour l’instant.'}</p>`;
    $('jr2Count').textContent = `${shown.length} sur ${list.length} position${list.length > 1 ? 's' : ''}`;
  }

  // ---------- 05 — Tes journaux ----------
  function paintJournals(acc, others) {
    const card = (o) => {
      const cl = closed(o.rows), s = J().computeStats(o.rows);
      let c = 0; const ys = [0].concat(cl.map((r) => (c += r.pnl)));
      const step = Math.max(1, Math.ceil(ys.length / 40)), pts = ys.filter((_, i) => i % step === 0 || i === ys.length - 1);
      const max = Math.max(...pts), min = Math.min(...pts), span = (max - min) || 1;
      const d = pts.map((v, i) => `${i ? 'L' : 'M'}${(pts.length > 1 ? i / (pts.length - 1) * 300 : 0).toFixed(0)},${(54 - (v - min) / span * 48).toFixed(1)}`).join(' ');
      const tot = s.totalPnl || 0, col = tot < 0 ? '#ff4d5e' : '#33e6a6', glow = tot < 0 ? 'rgb(255, 77, 94)' : 'rgb(51, 230, 166)';
      const prop = o.a.type === 'propfirm';
      return `
            <button type="button" data-acc="${esc(o.a.id)}" style="position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 10px; padding: 18px 18px 16px; text-align: left; font: inherit; color: rgb(246, 246, 247); cursor: pointer; border-radius: 18px; border: 1px solid ${o.a.id === acc.id ? 'rgba(249, 164, 94, 0.45)' : 'rgba(255, 255, 255, 0.12)'}; background: linear-gradient(160deg, rgba(16, 16, 19, 0.72), rgba(9, 9, 11, 0.88)); box-shadow: rgba(255, 255, 255, 0.14) 1.5px 1.5px 0px inset, rgba(255, 255, 255, 0.04) -1.5px -1.5px 0px inset;">
              <span style="display: flex; align-items: center; gap: 8px; width: 100%;">
                <span style="width: 7px; height: 7px; border-radius: 999px; background: ${o.color}; box-shadow: ${o.color} 0px 0px 8px;"></span>
                <span style="font-size: 16px; font-weight: 700; letter-spacing: -0.02em;">${esc(o.a.name || 'Journal')}</span>
                <span style="margin-left: auto; font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; padding: 3px 8px; border-radius: 999px; color: ${prop ? 'rgb(249, 164, 94)' : 'rgb(201, 201, 206)'}; background: ${prop ? 'rgba(249, 164, 94, 0.12)' : 'rgba(255, 255, 255, 0.07)'};">${prop ? 'Propfirm' : 'Compte propre'}</span>
              </span>
              <span style="font-size: 11.5px; color: rgb(122, 122, 130);">${esc(o.subtitle)}</span>
              <svg width="100%" height="60" viewBox="0 0 300 60" preserveAspectRatio="none" aria-hidden="true" style="display: block;">${cl.length ? `<path d="${d}" fill="none" stroke="${col}" stroke-width="2" vector-effect="non-scaling-stroke" style="filter: drop-shadow(${glow} 0px 0px 6px);"></path>` : '<line x1="0" x2="300" y1="30" y2="30" stroke="rgba(255,255,255,.12)" stroke-dasharray="3 6" vector-effect="non-scaling-stroke"></line>'}</svg>
              <span style="display: flex; gap: 14px; width: 100%; padding-top: 10px; border-top: 1px solid rgba(255, 255, 255, 0.07); font-size: 11.5px; color: rgb(122, 122, 130); font-variant-numeric: tabular-nums;">
                <span><b style="color: ${tot < 0 ? NEG : POS};">${money(tot, 2)}</b></span><span><b style="color: rgb(246, 246, 247);">${s.total}</b> trades</span><span><b style="color: rgb(246, 246, 247);">${s.winRatePct == null ? '—' : Math.round(s.winRatePct) + ' %'}</b> réussite</span>
              </span>
            </button>`;
    };
    $('jr2Journals').innerHTML = others.map(card).join('') + `
          <button type="button" data-jr2="new" style="min-height: 180px; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 10px; padding: 22px; border-radius: 18px; border: 1px dashed rgba(255, 255, 255, 0.18); background: transparent; color: rgb(155, 155, 161); font: inherit; text-align: left; cursor: pointer;">
            <span style="width: 34px; height: 34px; border-radius: 999px; display: grid; place-items: center; border: 1px solid rgba(255, 255, 255, 0.2); font-size: 17px;">+</span>
            <span style="font-size: 15px; font-weight: 700; color: rgb(246, 246, 247);">Nouveau journal</span>
            <span style="font-size: 12px; color: rgb(122, 122, 130);">Propfirm ou compte propre, relié ou saisi à la main.</span>
          </button>`;
  }

  async function render(detail) {
    state = detail;
    const { acc, rows } = detail;
    const accounts = J().listAccounts();
    // Le journal ouvert s'affiche tout de suite ; les autres journaux (légende, cartes « Tes journaux ») se
    // complètent quand leurs positions arrivent. Avant, la vue attendait tous les journaux : si l'un d'eux
    // tardait (compte relié, synchro), la page restait sur l'ancien affichage.
    const sub = (a) => { try { return detail.subtitleOf ? detail.subtitleOf(a) : ''; } catch (e) { return ''; } };
    const others = accounts.map((a, i) => ({ a, color: COLORS[i % COLORS.length], subtitle: sub(a), rows: a.id === acc.id ? rows : [] }));
    others.filter((o) => o.a.id !== acc.id).forEach((o) => {
      Promise.race([Promise.resolve().then(() => J().entriesFor(o.a, 'all')), new Promise((r) => setTimeout(() => r(null), 15000))])
        .then((r) => { if (!r || state !== detail) return; o.rows = r; const M = monthOf(closed(rows)); try { paintLegend(acc, others, M); paintJournals(acc, others); } catch (e) { /* tant pis */ } })
        .catch(() => {});
    });
    $('jr2').hidden = false;
    document.body.classList.add('jr2-on');
    // chaque bloc est indépendant : un compte aux données incomplètes n'empêche pas les autres de s'afficher
    const safe = (fn) => { try { return fn(); } catch (e) { console.warn('journal-2', e); return null; } };
    safe(() => paintTopbar(acc));
    const M = safe(() => paintHero(acc, rows, others)) || { y: new Date().getFullYear(), m: new Date().getMonth(), current: true };
    safe(() => paintKpis(acc, rows));
    safe(() => paintConditions(acc, rows));
    safe(() => paintMonth(rows, M));
    safe(() => paintPositions(rows));
    safe(() => paintJournals(acc, others));
  }

  document.addEventListener('chest:jr-render', (e) => { render(e.detail); });
  if (window.__chestJr) render(window.__chestJr); // rendu déjà demandé avant le chargement de ce script
  document.addEventListener('click', (e) => {
    if (!state) return;
    const t = e.target.closest('#jr2 [data-jr2], #jr2 [data-acc], #jr2 [data-filter], #jr2 [data-edit], #jr2 [data-all]');
    if (!t) return;
    if (t.dataset.acc) { if (t.dataset.acc !== state.acc.id) { if (window.CHESTJournalGo) window.CHESTJournalGo(t.dataset.acc); else location.href = 'journal.html?acc=' + encodeURIComponent(t.dataset.acc); } return; }
    if (t.dataset.filter) { filter = t.dataset.filter; paintPositions(state.rows); return; }
    if (t.dataset.edit) { if (state.openForm) state.openForm(t.dataset.edit); return; }
    if (t.dataset.all !== undefined) {
      const wrap = $('jrHistory');
      wrap.hidden = !wrap.hidden;
      t.textContent = wrap.hidden ? 'Voir tout l’historique' : 'Masquer l’historique complet';
      if (!wrap.hidden) wrap.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      return;
    }
    const map = { add: 'jrAddBtn', edit: 'jrAccEditBtn', new: 'jrAccAddBtn' };
    const b = $(map[t.dataset.jr2]); if (b) b.click();
  });
})();
