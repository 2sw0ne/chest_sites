// CHEST 2.0 (2026-11-02) — page Calendrier posée à l'identique de CHEST-DESIGN-2.0/html-exact/Calendrier.html
// (styles en ligne recopiés de la maquette, valeurs inchangées). Les données viennent de js/calendar.js
// (window.CHESTCalendar.model(), événement chest:cal-render) : prévision verrouillée, annonces de la semaine,
// bilan des semaines passées. Rien n'est inventé : une donnée absente = un état vide.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MONO = "font-family: 'JetBrains Mono', ui-monospace, monospace;";
  const C = () => window.CHESTCalendar;
  const CCY = { US: 'USD', EU: 'EUR', UK: 'GBP', JP: 'JPY', CH: 'CHF', AU: 'AUD', CA: 'CAD', NZ: 'NZD', CN: 'CNY', DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR' };
  const CCY_NAME = { USD: 'le dollar', EUR: 'l’euro', GBP: 'la livre', JPY: 'le yen' };
  const SUBJECT = { XAUUSD: 'l’or', XAGUSD: 'l’argent', XPTUSD: 'le platine', USOIL: 'le pétrole' };
  const SHORT = { XAUUSD: 'Or', XAGUSD: 'Argent', XPTUSD: 'Platine', USOIL: 'Pétrole' };
  const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
  const DAYS_S = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'];
  const N = { high: 3, medium: 2, low: 1 };
  const IMP_LABEL = ['', 'faible', 'moyen', 'fort'];
  let open = null;           // id de l'annonce dont le livre est ouvert
  let model = null;

  const pad = (n) => String(n).padStart(2, '0');
  const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dateShort = (d) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const fmtPct = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1).replace('.', ',') + ' %';
  const nowHm = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const evId = (e) => e.id || (e.date + e.time + e.event);
  const evN = (e) => N[e.importance] || 1;
  const ccyOf = (e) => CCY[e.country] || e.country || '';
  const subject = () => SUBJECT[model.pairKey] || model.code;
  const cleanName = (e) => String(e.event || '').replace(/\s*\((janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc)\.?\)\s*$/i, '').replace(/\s+/g, ' ').trim();
  const cut = (s, n) => s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
  const shortName = (e, n) => cut(cleanName(e), n || 24);
  const normName = (s) => String(s || '').replace(/\((janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc)\.?\)|\(T[1-4]\)/gi, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const num = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(/\s/g, '').replace('−', '-').replace(',', '.')); return isNaN(n) ? null : n; };
  const mine = (e) => model.countries.includes(e.country);

  // Sens de l'effet sur la paire : directionBias « up » = un chiffre plus haut soutient la devise du pays.
  function effect(e) {
    const w = model.weightOf ? model.weightOf(e.country) : 0;
    if (!e.directionBias || !w) return null;
    const upIfHigher = (e.directionBias === 'up') === (w > 0);
    return { upIfHigher };
  }

  // Fiches « Ce que c'est » : textes de la maquette (définitions), reconnues par le nom de l'annonce.
  const WHAT = [
    [/ism manufacturier|pmi manufacturier de l'ism/i, "Indice d'activité de 400 directeurs d'achat de l'industrie américaine. Au-dessus de 50, le secteur grandit ; en dessous, il se contracte."],
    [/ism non manufacturier|pmi non manufacturier/i, "Même indice que l'ISM manufacturier, pour les services : plus des deux tiers de l'économie américaine."],
    [/jolts/i, "Nombre de postes à pourvoir aux États-Unis. Un bon thermomètre de la tension sur l'emploi."],
    [/adp/i, "Créations d'emplois dans le privé, publiées deux jours avant le rapport officiel."],
    [/inscriptions hebdomadaires au ch[oô]mage$/i, 'Nouvelles demandes hebdomadaires d’allocations chômage.'],
    [/non farm payrolls$|emplois non agricoles$/i, "Créations d'emplois hors agriculture sur le mois. L'annonce la plus attendue du calendrier américain."],
    [/^taux de ch[oô]mage/i, 'Part de la population active sans emploi, publiée avec le NFP.'],
    [/average hourly earnings|salaire horaire/i, 'Hausse mensuelle du salaire horaire moyen.'],
    [/michigan de confiance|confiance des consommateurs, u\. michigan/i, 'Moral des ménages américains, avec leurs attentes d’inflation.'],
    [/d[ée]penses de construction/i, 'Montant dépensé dans la construction sur le mois.'],
    [/commandes [àa] l'industrie/i, 'Nouvelles commandes passées aux usines américaines.'],
    [/^stocks de p[ée]trole brut$/i, 'Variation hebdomadaire des réserves de brut aux États-Unis.'],
    [/cr[ée]dit [àa] la consommation/i, 'Variation de l’encours de crédit des ménages.'],
    [/^balance commerciale/i, 'Différence entre exportations et importations sur le mois.'],
  ];
  const whatOf = (e) => { const n = normName(e.event); const hit = WHAT.find(([re]) => re.test(n)); return hit ? hit[1] : null; };

  // ---------- Barre du haut (shell) : prochaine annonce de la paire + paire suivie ----------
  function nextAnnouncement() {
    const now = new Date();
    const up = model.weekEvents.concat((C().all() || []).filter((e) => e.date > isoOf(new Date(model.nextMonday.getTime() + 6 * 86400000))))
      .filter((e) => mine(e) && !e.released && e.time && /^\d\d:\d\d$/.test(e.time) && new Date(e.date + 'T' + e.time + ':00') > now)
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    return up.find((e) => e.importance === 'high') || up.find((e) => e.importance === 'medium') || up[0] || null;
  }
  function inLabel(e) {
    const m = Math.max(1, Math.round((new Date(e.date + 'T' + e.time + ':00') - Date.now()) / 60000));
    if (m < 60) return `dans ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `dans ${h} h ${pad(m % 60)}`;
    const d = Math.round(h / 24);
    return `dans ${d} j`;
  }
  function paintTopbar() {
    const T = window.parent !== window && window.parent.CHESTTopbar;
    if (!T) return;
    const nx = model.crypto ? null : nextAnnouncement();
    const red = nx && nx.importance === 'high';
    const pill = nx ? `<span style="display: flex; align-items: center; gap: 9px; height: 38px; padding: 0px 14px; border-radius: 12px; border: 1px solid ${red ? 'rgba(255, 77, 94, 0.25)' : 'rgba(232, 179, 57, 0.25)'}; background: ${red ? 'rgba(255, 77, 94, 0.07)' : 'rgba(232, 179, 57, 0.07)'}; font-size: 12.5px; color: rgb(246, 246, 247);">
          <span style="width: 7px; height: 7px; border-radius: 999px; background: ${red ? 'rgb(255, 77, 94)' : 'rgb(232, 179, 57)'}; box-shadow: ${red ? 'rgba(255, 77, 94, 0.9)' : 'rgba(232, 179, 57, 0.9)'} 0px 0px 10px;"></span>
          Prochaine : <strong>${esc(shortName(nx))}</strong> <span style="${MONO} color: ${red ? 'rgb(255, 148, 160)' : 'rgb(244, 208, 122)'};">${esc(inLabel(nx))}</span>
        </span>` : '';
    const slot = T.set(window, `${pill}<div style="position: relative;">
        <button type="button" class="btn2" data-cal-pair aria-haspopup="listbox" aria-expanded="false" style="display: flex; align-items: center; gap: 10px; height: 38px; padding: 0px 14px; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.1); background: rgba(255, 255, 255, 0.024); color: rgb(246, 246, 247); font: inherit; font-weight: 600; cursor: pointer;">
          Paire suivie : ${esc(model.code)}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9b9ba1" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>
        </button>
        <div data-cal-pairs role="listbox" hidden style="position: absolute; top: calc(100% + 8px); right: 0; z-index: 60; width: 260px; max-height: 380px; overflow-y: auto; padding: 6px; border-radius: 14px; border: 1px solid rgba(255,255,255,.12); background: linear-gradient(160deg, rgba(14,14,17,.96), rgba(9,9,11,.98)); box-shadow: 0 18px 44px rgba(0,0,0,.55), inset 1.5px 1.5px 0 rgba(255,255,255,.1);">
          ${C().pairs().map((p) => `<button type="button" role="option" data-key="${esc(p.key)}" aria-selected="${p.key === model.pairKey}" style="width: 100%; display: flex; align-items: baseline; gap: 10px; padding: 8px 10px; border: 0; border-radius: 10px; background: ${p.key === model.pairKey ? 'rgba(255,255,255,.06)' : 'none'}; color: rgb(246,246,247); font: inherit; font-size: 13px; text-align: left; cursor: pointer;"><b style="font-weight: 600; min-width: 74px;">${esc(p.code)}</b><small style="font-size: 11.5px; color: rgb(122,122,130);">${esc(p.label)}</small></button>`).join('')}
        </div>
      </div>`);
    if (!slot) return;
    const btn = slot.querySelector('[data-cal-pair]'), list = slot.querySelector('[data-cal-pairs]');
    const pdoc = slot.ownerDocument;
    const toggle = (on) => { list.hidden = !on; btn.setAttribute('aria-expanded', String(on)); };
    btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(list.hidden); });
    list.addEventListener('click', (e) => { const b = e.target.closest('[data-key]'); if (!b) return; toggle(false); open = null; C().setPair(b.dataset.key); });
    pdoc.addEventListener('click', (e) => { if (!list.hidden && !slot.contains(e.target)) toggle(false); });
  }

  // ---------- Hero ----------
  const TONE = {
    pos: { ink: 'rgb(127, 243, 202)', border: 'rgba(51, 230, 166, 0.4)', bg: 'rgba(51, 230, 166, 0.08)', dot: 'rgb(51, 230, 166)', glow: 'rgba(51, 230, 166, 0.9)', shadow: 'rgba(51, 230, 166, 0.55)', halo: 'rgba(51, 230, 166, 0.3)', label: 'Haussier', words: 'de hausse attendue sur la semaine' },
    neg: { ink: 'rgb(255, 148, 160)', border: 'rgba(255, 77, 94, 0.4)', bg: 'rgba(255, 77, 94, 0.08)', dot: 'rgb(255, 77, 94)', glow: 'rgba(255, 77, 94, 0.9)', shadow: 'rgba(255, 77, 94, 0.55)', halo: 'rgba(255, 77, 94, 0.26)', label: 'Baissier', words: 'de baisse attendue sur la semaine' },
    neutral: { ink: 'rgb(201, 201, 206)', border: 'rgba(255, 255, 255, 0.18)', bg: 'rgba(255, 255, 255, 0.04)', dot: 'rgb(155, 155, 161)', glow: 'rgba(255, 255, 255, 0.4)', shadow: 'rgba(255, 255, 255, 0.2)', halo: 'rgba(255, 255, 255, 0.08)', label: 'Neutre', words: 'de mouvement attendu sur la semaine' },
  };
  const gaugePos = (v) => Math.max(2, Math.min(98, 50 + (v / 3) * 50));
  function isoWeek(d) { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / 86400000 + 1) / 7); }

  function paintHero() {
    let tone = 'neutral', value = null, text = '';
    if (model.crypto) {
      const b = $('sentimentBadge'); tone = /hauss/i.test(b && b.textContent) ? 'pos' : /baiss/i.test(b && b.textContent) ? 'neg' : 'neutral';
      const t = ($('cryptoWeekly') || {}).textContent || '—'; value = t === '—' ? null : t;
      text = ($('cryptoText') || {}).textContent || '';
    } else {
      if (model.locked) { tone = model.locked.tone; value = fmtPct(model.locked.weeklyCapped); }
      text = ($('sentimentText') || {}).textContent || '';
      // calendar.js parle de « la semaine prochaine » ; vue d'un jour de la semaine en cours, c'est celle-ci.
      if (new Date() >= model.nextMonday) text = text.replace(/la semaine prochaine/g, 'cette semaine').replace(/de la semaine prochaine/g, 'de cette semaine');
    }
    const T = TONE[tone] || TONE.neutral;
    $('c2CalHalo').style.background = `radial-gradient(55% 64% at 50% 20%, ${T.halo}, transparent 72%)`;
    const badge = $('c2CalBadge');
    badge.style.color = T.ink; badge.style.borderColor = T.border; badge.style.background = T.bg;
    badge.innerHTML = `<span style="width: 7px; height: 7px; border-radius: 999px; background: ${T.dot}; box-shadow: ${T.glow} 0px 0px 10px;"></span>${T.label}`;
    $('c2CalCode').textContent = model.code;
    $('c2CalLabel').textContent = model.label;
    const big = $('c2CalMove');
    big.textContent = value || '—';
    big.style.color = T.ink; big.style.textShadow = `${T.shadow} 0px 0px 34px`;
    $('c2CalMoveWords').textContent = value ? T.words : 'pas encore de prévision pour cette semaine';
    const v = model.locked ? model.locked.weeklyCapped : 0;
    const knob = $('c2CalKnob');
    knob.style.left = gaugePos(v) + '%'; knob.style.borderColor = T.ink; knob.style.boxShadow = `${T.glow} 0px 0px 16px`;
    $('c2CalGauge').hidden = model.crypto;
    const fri = new Date(model.nextMonday.getTime() + 4 * 86400000);
    $('c2CalLock').lastChild.textContent = model.crypto ? ' Estimation indicative sur la semaine'
      : ` Prévision verrouillée lundi · S${isoWeek(model.nextMonday)} · ${model.nextMonday.getDate()} → ${dateShort(fri)}`;
    $('c2CalText').textContent = text;
  }

  // Semaine passée : prévu / réalisé + suite des semaines connues (un point par semaine)
  const track = {};
  function paintPast() {
    const row = $('c2CalPast'), last = $('c2CalLastDot');
    if (model.crypto) { row.hidden = true; last.hidden = true; return; }
    const k1 = track[1];
    row.hidden = false;
    const prev = model.pastPrevision;
    const real = k1 && k1.real;
    const ok = k1 ? k1.match : null;
    $('c2CalPastPrev').textContent = prev == null ? '—' : fmtPct(prev);
    const r = $('c2CalPastReal');
    r.textContent = real == null ? (k1 ? 'indisponible' : '…') : fmtPct(real);
    r.style.color = real == null ? 'rgb(122, 122, 130)' : real > 0 ? 'rgb(127, 243, 202)' : 'rgb(255, 148, 160)';
    $('c2CalPastMark').textContent = ok === null ? '' : ok ? ' ✓' : ' ✗';
    last.hidden = real == null;
    if (real != null) last.style.left = gaugePos(Math.max(-3, Math.min(3, real))) + '%';
    const weeks = Object.keys(track).map(Number).sort((a, b) => b - a).map((k) => track[k]).filter((w) => w && w.match !== null && w.match !== undefined);
    const dots = $('c2CalDots');
    dots.hidden = !weeks.length;
    if (weeks.length) {
      const won = weeks.filter((w) => w.match).length;
      dots.title = `${won} semaine${won > 1 ? 's' : ''} réussie${won > 1 ? 's' : ''} sur ${weeks.length}`;
      dots.innerHTML = weeks.map((w) => `<span style="width: 5px; height: 5px; border-radius: 999px; background: ${w.match ? 'rgb(51, 230, 166)' : 'rgba(255, 77, 94, 0.55)'};"></span>`).join('')
        + `\n            <span style="margin-left: 4px;">${won}/${weeks.length}</span>`;
    }
  }
  let trackPair = null;
  async function loadTrack() {
    if (model.crypto || trackPair === model.pairKey) return;
    trackPair = model.pairKey;
    for (const k of Object.keys(track)) delete track[k];
    const pair = model.pairKey;
    for (let k = 1; k <= 12; k++) {
      let res = null;
      try { res = await C().pastWeek(k); } catch (e) { res = null; }
      if (trackPair !== pair) return;
      if (!res) { if (k === 1) track[1] = { real: null, match: null }; break; }
      track[k] = res;
      paintPast();
    }
    paintPast();
  }

  // ---------- 01 — Les trois annonces qui décident ----------
  function cardRead(d) {
    const e = d.ev;
    if (C().hasNoData(e)) return 'Évènement qualitatif — pas de chiffre attendu.';
    if (e.released) return `Publié : ${e.actual || '—'} pour ${e.consensus || '—'} prévu.`;
    if (!d.est || d.tone === 'neutral') return 'Pas de sens attendu : le prévu ne s’écarte pas du précédent.';
    return `Si le prévu se réalise : ${fmtPct(d.est.value)} estimé sur ${model.code}.`;
  }
  function tagOf(e) {
    const eff = effect(e);
    if (!eff) return null;
    return `${SHORT[model.pairKey] || model.code.split('/')[0]} ↑ si ${eff.upIfHigher ? 'fort' : 'faible'}`;
  }
  function whenOf(e) {
    const d = new Date(e.date + 'T12:00:00');
    return `${DAYS_S[(d.getDay() + 6) % 7] || d.toLocaleDateString('fr-FR', { weekday: 'short' })} ${dateShort(d)}${e.time ? ' · ' + e.time : ''}`;
  }
  function paintMajors() {
    const box = $('c2CalMajors');
    if (model.crypto || !model.top3.length) {
      box.innerHTML = `<div style="grid-column: 1 / -1; display: flex; align-items: center; justify-content: center; height: 120px; border-radius: 18px; border: 1px dashed rgba(255, 255, 255, 0.16); font-size: 12px; color: rgb(122, 122, 130);">${model.crypto ? 'Pas d’annonce macro suivie pour une crypto : la prévision vient du marché.' : `Pas encore d’annonce de la semaine sur ${esc(model.code)}.`}</div>`;
      return;
    }
    box.innerHTML = model.top3.map((d) => {
      const e = d.ev, tag = tagOf(e);
      return `
            <button type="button" class="tile" data-open="${esc(evId(e))}" style="position: relative; overflow: hidden; text-align: left; cursor: pointer; font: inherit; color: inherit; border-radius: 18px; border: 1px solid rgba(255, 255, 255, 0.1); background: linear-gradient(160deg, rgba(16, 16, 19, 0.75), rgba(9, 9, 11, 0.9)); box-shadow: rgba(255, 255, 255, 0.12) 1.5px 1.5px 0px inset, rgba(255, 255, 255, 0.03) -1.5px -1.5px 0px inset; padding: 22px; display: flex; flex-direction: column; gap: 16px;">
              <div aria-hidden="true" style="position: absolute; right: -70px; top: -90px; width: 240px; height: 220px; pointer-events: none; background: radial-gradient(closest-side, rgba(252, 18, 131, 0.18), transparent);"></div>
              <div style="position: relative; display: flex; align-items: center; gap: 10px;">
                <span style="${MONO} font-size: 10.5px; font-weight: 600; color: rgb(201, 201, 206); border: 1px solid rgba(255, 255, 255, 0.12); padding: 3px 7px; border-radius: 6px;">${esc(ccyOf(e))}</span>
                <span style="${MONO} font-size: 11px; color: rgb(155, 155, 161);">${esc(whenOf(e))}</span>
                ${tag ? `<span style="margin-left: auto; font-size: 10.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; padding: 4px 9px; border-radius: 999px; color: rgb(127, 243, 202); background: rgba(51, 230, 166, 0.12);">${esc(tag)}</span>` : ''}
              </div>
              <span style="position: relative; font-size: 21px; font-weight: 700; letter-spacing: -0.025em;">${esc(shortName(e, 30))}</span>
              <div style="position: relative; display: grid; grid-template-columns: 1fr 1fr; padding: 12px 0px; border-top: 1px solid rgba(255, 255, 255, 0.06); border-bottom: 1px solid rgba(255, 255, 255, 0.06);">
                <div style="display: flex; flex-direction: column; gap: 4px; padding-right: 12px;">
                  <span style="font-size: 11px; color: rgb(122, 122, 130);">${e.released ? 'Réel' : 'Prévu'}</span>
                  <span style="font-size: 24px; font-weight: 700; letter-spacing: -0.02em; font-variant-numeric: tabular-nums;">${esc((e.released ? e.actual : e.consensus) || '—')}</span>
                </div>
                <div style="display: flex; flex-direction: column; gap: 4px; padding-left: 12px; border-left: 1px solid rgba(249, 164, 94, 0.5);">
                  <span style="font-size: 11px; color: rgb(122, 122, 130);">Précédent</span>
                  <span style="font-size: 17px; font-weight: 600; color: rgb(155, 155, 161); font-variant-numeric: tabular-nums; padding-top: 5px;">${esc(e.previous || '—')}</span>
                </div>
              </div>
              <span style="position: relative; font-size: 12.5px; line-height: 1.55; color: rgb(155, 155, 161);">${esc(cardRead(d))}</span>
            </button>`;
    }).join('');
  }

  // ---------- 02 — La semaine ----------
  const STARS = [['high', '★★★', 'Élevée'], ['medium', '★★☆', 'Moyenne'], ['low', '★☆☆', 'Faible']];
  function weekDays() { return DAYS.map((name, i) => { const d = new Date(model.nextMonday.getTime() + i * 86400000); return { name, short: DAYS_S[i], d, iso: isoOf(d) }; }); }
  function paintFilter() {
    const counts = {}; model.weekEvents.forEach((e) => { counts[e.importance] = (counts[e.importance] || 0) + 1; });
    $('c2CalStars').innerHTML = STARS.map(([k, glyph, label]) => {
      const on = model.filter.includes(k);
      return `
            <button type="button" data-imp="${k}" aria-pressed="${on}" style="display: flex; align-items: center; gap: 8px; height: 36px; padding: 0px 14px; border-radius: 999px; border: 1px solid ${on ? 'rgba(232, 179, 57, 0.45)' : 'rgba(255, 255, 255, 0.1)'}; background: ${on ? 'rgba(232, 179, 57, 0.1)' : 'transparent'}; color: ${on ? 'rgb(246, 246, 247)' : 'rgb(122, 122, 130)'}; font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer;">
              <span style="letter-spacing: 1px; color: ${on ? 'rgb(244, 208, 122)' : 'rgb(92, 92, 99)'}; text-shadow: ${on ? 'rgba(232, 179, 57, 0.6) 0px 0px 10px' : 'none'};">${glyph}</span>${label}
              <span style="${MONO} font-size: 10.5px; color: rgb(122, 122, 130);">${counts[k] || 0}</span>
            </button>`;
    }).join('');
    const shown = model.weekEvents.filter((e) => model.filter.includes(e.importance || 'high')).length;
    $('c2CalShown').textContent = `${shown} annonce${shown > 1 ? 's' : ''} affichée${shown > 1 ? 's' : ''} · la bibliothèque suit le filtre`;
  }
  const evColor = (n) => n === 3 ? 'rgb(255, 77, 94)' : n === 2 ? 'rgb(232, 179, 57)' : 'rgba(255, 255, 255, 0.3)';
  function paintWeek() {
    const today = isoOf(new Date()), hm = nowHm();
    $('c2CalWeek').innerHTML = weekDays().map((day, di) => {
      const isToday = day.iso === today;
      const evs = model.weekEvents.filter((e) => e.date === day.iso && model.filter.includes(e.importance || 'high'))
        .sort((a, b) => String(a.time).localeCompare(String(b.time)));
      let nowPlaced = !isToday;
      const rows = evs.map((e) => {
        const n = evN(e), m = mine(e), id = evId(e);
        let nowLine = '';
        if (!nowPlaced && String(e.time) > hm) {
          nowPlaced = true;
          nowLine = `
                      <div style="display: flex; align-items: center; gap: 6px; padding: 4px 6px;">
                        <span style="${MONO} font-size: 9.5px; color: rgb(252, 18, 131);">${hm}</span>
                        <span style="flex: 1 1 0%; height: 2px; border-radius: 2px; background: linear-gradient(90deg, rgb(252, 18, 131), rgb(249, 164, 94)); box-shadow: rgba(252, 18, 131, 0.8) 0px 0px 10px;"></span>
                      </div>`;
        }
        const past = day.iso < today || (isToday && String(e.time) < hm);
        return `
                  <div style="display: flex; flex-direction: column;">${nowLine}
                    <button type="button" class="ev"${m ? ` data-open="${esc(id)}"` : ' tabindex="-1"'} style="display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 6px; border: 0px; border-radius: 9px; background: ${m && open === id ? 'rgba(249, 164, 94, 0.1)' : 'transparent'}; color: inherit; font: inherit; text-align: left; cursor: ${m ? 'pointer' : 'default'}; opacity: ${past ? 0.5 : 1};">
                      <span style="width: 3px; align-self: stretch; border-radius: 2px; background: ${evColor(n)}; box-shadow: ${n === 3 ? 'rgba(255, 77, 94, 0.7) 0px 0px 8px' : 'none'};"></span>
                      <span style="display: flex; flex-direction: column; gap: 2px; min-width: 0px;">
                        <span style="display: flex; gap: 6px; ${MONO} font-size: 10px; color: rgb(122, 122, 130);"><span>${esc(e.time || '—')}</span><span>${esc(ccyOf(e))}</span></span>
                        <span style="font-size: 12.5px; line-height: 1.3; color: ${m ? 'rgb(246, 246, 247)' : 'rgb(155, 155, 161)'};">${esc(shortName(e))}</span>
                      </span>
                    </button>
                  </div>`;
      }).join('') + (nowPlaced || !evs.length ? '' : `
                  <div style="display: flex; align-items: center; gap: 6px; padding: 4px 6px;">
                    <span style="${MONO} font-size: 9.5px; color: rgb(252, 18, 131);">${hm}</span>
                    <span style="flex: 1 1 0%; height: 2px; border-radius: 2px; background: linear-gradient(90deg, rgb(252, 18, 131), rgb(249, 164, 94)); box-shadow: rgba(252, 18, 131, 0.8) 0px 0px 10px;"></span>
                  </div>`);
      return `
              <div style="position: relative; display: flex; flex-direction: column; gap: 4px; min-height: 300px; padding: 16px 10px; border-left: ${di === 0 ? '0px' : '1px solid rgba(255, 255, 255, 0.06)'}; background: ${isToday ? 'linear-gradient(rgba(252, 18, 131, 0.07), rgba(249, 164, 94, 0.02) 60%, transparent)' : 'transparent'};">
                <div style="display: flex; align-items: baseline; gap: 8px; padding: 0px 6px 10px;">
                  <span style="font-size: 13px; font-weight: 700; color: ${isToday ? 'rgb(246, 246, 247)' : 'rgb(201, 201, 206)'};">${day.name}</span>
                  <span style="${MONO} font-size: 11px; color: rgb(122, 122, 130);">${dateShort(day.d)}</span>
                  ${isToday ? `<span style="margin-left: auto; font-size: 9.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: rgb(5, 5, 5); background: linear-gradient(135deg, rgb(252, 18, 131), rgb(249, 164, 94)); padding: 2px 7px; border-radius: 999px;">Aujourd'hui</span>` : ''}
                </div>${rows || `
                <span style="padding: 8px 6px; font-size: 11.5px; color: rgb(92, 92, 99);">Rien à cette force.</span>`}
              </div>`;
    }).join('');
  }

  // ---------- 03 — Bibliothèque ----------
  function bookHtml(e, k, dayShort) {
    const n = evN(e), id = evId(e), isOpen = open === id;
    const w = n === 3 ? 48 : n === 2 ? 32 : 22;
    const h = [0, 128, 146, 168][n] - (k % 2) * 8;
    const bg = n === 3 ? 'linear-gradient(rgb(61, 13, 39) 0%, rgb(42, 15, 31) 45%, rgb(43, 24, 16) 100%)' : n === 2 ? 'linear-gradient(rgb(43, 35, 18), rgb(28, 23, 13))' : 'linear-gradient(rgb(27, 27, 32), rgb(20, 20, 24))';
    const band = n === 3 ? 'linear-gradient(90deg, rgb(252, 18, 131), rgb(249, 164, 94))' : n === 2 ? 'rgba(232, 179, 57, 0.7)' : 'rgba(255, 255, 255, 0.18)';
    const shadow = isOpen ? 'rgba(249, 164, 94, 0.7) 0px 0px 0px 1px, rgba(252, 18, 131, 0.35) 0px 18px 40px' : n === 3 ? 'rgba(252, 18, 131, 0.22) 0px 0px 0px 1px, rgba(252, 18, 131, 0.12) 0px 10px 26px' : 'rgba(255, 255, 255, 0.06) 0px 0px 0px 1px';
    return `
                      <button type="button" class="book" data-open="${esc(id)}" aria-label="Ouvrir : ${esc(shortName(e))}, ${dayShort} ${esc(e.time || '')}" aria-pressed="${isOpen}" style="position: relative; width: ${w}px; height: ${h}px; padding: 0px; border: 0px; border-radius: 4px 4px 2px 2px; cursor: pointer; color: rgb(246, 246, 247); font: inherit; background: ${bg}; box-shadow: ${shadow}; transform: ${isOpen ? 'translateY(-22px)' : 'none'}; display: flex; flex-direction: column; align-items: center; justify-content: space-between; overflow: hidden;">
                        <span aria-hidden="true" style="position: absolute; inset: 0px; background: linear-gradient(90deg, rgba(0, 0, 0, 0.45), rgba(255, 255, 255, 0.07) 22%, transparent 45%, transparent 70%, rgba(0, 0, 0, 0.5));"></span>
                        <span aria-hidden="true" style="position: absolute; left: 0px; right: 0px; top: 14px; height: 2px; background: ${band};"></span>
                        <span aria-hidden="true" style="position: absolute; left: 0px; right: 0px; bottom: 30px; height: 2px; background: ${band};"></span>
                        <span style="position: relative; margin-top: 24px; ${MONO} font-size: ${n === 1 ? '7px' : '8.5px'}; font-weight: 600; letter-spacing: 0.06em; color: ${n === 3 ? 'rgb(249, 164, 94)' : n === 2 ? 'rgb(232, 179, 57)' : 'rgb(122, 122, 130)'};">${esc(ccyOf(e))}</span>
                        <span style="position: relative; flex: 1 1 0%; display: flex; align-items: center; justify-content: center; padding: 10px 0px; min-height: 0px; overflow: hidden;">
                          <span style="writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; font-size: ${n === 3 ? '12px' : n === 2 ? '10.5px' : '9px'}; font-weight: ${n === 3 ? 700 : 600}; letter-spacing: 0.01em; color: ${n === 1 ? 'rgb(155, 155, 161)' : 'rgb(246, 246, 247)'};">${esc(shortName(e, n === 3 ? 15 : n === 2 ? 15 : 17))}</span>
                        </span>
                        <span style="position: relative; margin-bottom: 10px; ${MONO} font-size: 9px; color: ${n === 1 ? 'rgb(92, 92, 99)' : 'rgb(155, 155, 161)'};">${esc(e.time || '')}</span>
                      </button>`;
  }
  function libraryEvents() { return model.weekEvents.filter((e) => mine(e) && model.filter.includes(e.importance || 'high')); }
  function paintShelf() {
    $('c2CalLibTitle').textContent = `03 — Bibliothèque ${model.code}`;
    const today = isoOf(new Date()), lib = libraryEvents();
    $('c2CalShelf').innerHTML = weekDays().map((day) => {
      const books = lib.filter((e) => e.date === day.iso).sort((a, b) => String(a.time).localeCompare(String(b.time)));
      const count = books.length + (books.length > 1 ? ' livres' : ' livre');
      return `
            <div style="display: grid; grid-template-columns: 118px 1fr; align-items: end; gap: 16px; padding-top: 18px;">
              <div style="display: flex; flex-direction: column; gap: 3px; padding-bottom: 16px;">
                <span style="font-size: 15px; font-weight: 700; letter-spacing: -0.02em; color: ${day.iso === today ? 'rgb(249, 164, 94)' : 'rgb(122, 122, 130)'};">${day.name}</span>
                <span style="${MONO} font-size: 10px; color: rgb(122, 122, 130);">${dateShort(day.d)} · ${count}</span>
              </div>
              <div style="display: flex; flex-direction: column; min-width: 0px;">
                <div style="overflow-x: auto;">
                  <div style="display: flex; align-items: flex-end; gap: 4px; height: 178px; padding: 0px 12px; min-width: max-content;">
                    ${books.length ? books.map((e, k) => bookHtml(e, k, day.short)).join('') : '<span style="align-self: center; font-size: 11.5px; color: rgb(92, 92, 99);">Aucun livre à cette force ce jour-là.</span>'}
                  </div>
                </div>
                <div aria-hidden="true" style="height: 10px; border-radius: 2px; background: linear-gradient(rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.04)); border-top: 1px solid rgba(255, 255, 255, 0.3); box-shadow: rgba(0, 0, 0, 0.6) 0px 12px 26px;"></div>
              </div>
            </div>`;
    }).join('');
  }

  // Livre ouvert : la fiche de l'annonce (chiffres du calendrier, effet sur la paire, publications passées)
  function history(e) {
    const key = normName(e.event);
    return (C().all() || []).filter((x) => x.country === e.country && x.released && x.date < e.date && normName(x.event) === key)
      .sort((a, b) => a.date.localeCompare(b.date)).slice(-6)
      .map((x) => { const a = num(x.actual), c = num(x.consensus); return { d: new Date(x.date + 'T12:00:00'), v: a == null || c == null ? null : a - c }; })
      .filter((x) => x.v != null);
  }
  const LABEL = 'font-family: \'JetBrains Mono\', ui-monospace, monospace; font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: rgb(122, 122, 130);';
  function paintBook() {
    const box = $('c2CalBook');
    const lib = libraryEvents();
    const e = lib.find((x) => evId(x) === open) || model.weekEvents.find((x) => evId(x) === open && mine(x));
    if (!e) {
      box.innerHTML = `<div style="display: flex; align-items: center; justify-content: center; height: 120px; border-radius: 18px; border: 1px dashed rgba(255, 255, 255, 0.16); font-size: 12px; color: rgb(122, 122, 130);">${lib.length ? 'Choisis un livre sur l’étagère pour l’ouvrir.' : `Aucune annonce de la semaine sur ${esc(model.code)} à cette force.`}</div>`;
      return;
    }
    const n = evN(e), idx = lib.indexOf(e), eff = effect(e), est = C().estimate(e);
    const day = new Date(e.date + 'T12:00:00');
    const dayLong = `${DAYS[(day.getDay() + 6) % 7] || ''} ${dateShort(day)}`;
    const what = whatOf(e);
    const ccy = ccyOf(e), ccyName = CCY_NAME[ccy] || ccy;
    const pairUp = eff ? eff.upIfHigher : null;
    const why = eff ? `Un chiffre au-dessus du prévu ${(e.directionBias === 'up') ? 'soutient' : 'pèse sur'} ${ccyName} : ${model.code} tend alors à ${pairUp ? 'monter' : 'baisser'}.` : null;
    const effTitle = eff ? `${pairUp ? 'Plus élevé' : 'Plus faible'} que prévu → haussier pour ${subject()}` : 'Effet faible';
    const effText = est && est.tone !== 'neutral' ? `Si le prévu se réalise : ${fmtPct(est.value)} estimé sur ${model.code}.` : 'Pas de sens attendu : le prévu ne s’écarte pas du précédent.';
    const hist = history(e);
    const max = Math.max(...hist.map((h) => Math.abs(h.v)), 1e-9);
    const reel = e.released && e.actual ? e.actual : '—';
    const neutral = !eff;
    box.innerHTML = `
          <div style="position: relative; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(380px, 100%), 1fr)); gap: 0px; border-radius: 20px; border: 1px solid rgba(255, 255, 255, 0.1); box-shadow: rgba(0, 0, 0, 0.6) 0px 30px 70px, rgba(0, 0, 0, 0.4) 0px 0px 0px 1px; background: rgb(11, 11, 14);">
            <div aria-hidden="true" style="position: absolute; left: 50%; top: 0px; bottom: 0px; width: 60px; margin-left: -30px; pointer-events: none; z-index: 2; background: linear-gradient(90deg, transparent, rgba(0, 0, 0, 0.55) 48%, rgba(255, 255, 255, 0.05) 50%, rgba(0, 0, 0, 0.45) 52%, transparent);"></div>
            <div class="pg-l" style="position: relative; display: flex; flex-direction: column; gap: 20px; padding: 36px 48px 36px 40px; border-radius: 20px 0px 0px 20px; background: linear-gradient(270deg, rgba(255, 255, 255, 0.043), rgba(255, 255, 255, 0.016) 30%, rgba(255, 255, 255, 0.02));">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="${MONO} font-size: 10.5px; font-weight: 600; color: rgb(201, 201, 206); border: 1px solid rgba(255, 255, 255, 0.12); padding: 3px 7px; border-radius: 6px;">${esc(ccy)}</span>
                <span style="${MONO} font-size: 11px; letter-spacing: 0.06em; color: rgb(155, 155, 161);">${esc(dayLong)}${e.time ? ' · ' + esc(e.time) : ''}</span>
                <span style="margin-left: auto; font-size: 10.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; padding: 4px 9px; border-radius: 999px; color: ${n === 3 ? 'rgb(255, 148, 160)' : n === 2 ? 'rgb(244, 208, 122)' : 'rgb(201, 201, 206)'}; background: ${n === 3 ? 'rgba(255, 77, 94, 0.14)' : n === 2 ? 'rgba(232, 179, 57, 0.14)' : 'rgba(255, 255, 255, 0.08)'};">Impact ${IMP_LABEL[n]}</span>
              </div>
              <h3 style="margin: 0px; font-size: 34px; line-height: 1.08; font-weight: 700; letter-spacing: -0.035em;">${esc(String(e.event || '').replace(/\s+/g, ' ').trim())}</h3>
              <div style="display: flex; flex-direction: column; gap: 8px;">
                <span style="${LABEL}">Ce que c'est</span>
                <p style="margin: 0px; font-size: 14px; line-height: 1.65; color: ${what ? 'rgb(201, 201, 206)' : 'rgb(122, 122, 130)'};">${esc(what || 'Fiche de cette annonce pas encore rédigée.')}</p>
              </div>
              <div style="display: flex; flex-direction: column; gap: 8px;">
                <span style="${LABEL}">Pourquoi ${esc(SUBJECT[model.pairKey] ? subject().replace('l’', 'l\'') : model.code)} réagit</span>
                <p style="margin: 0px; font-size: 14px; line-height: 1.65; color: ${why ? 'rgb(201, 201, 206)' : 'rgb(122, 122, 130)'};">${esc(why || 'Le calendrier ne donne pas de sens à cette annonce : pas d’effet attendu sur la paire.')}</p>
              </div>
              <span style="margin-top: auto; ${MONO} font-size: 10px; color: rgb(92, 92, 99);">— p. ${idx * 2 + 1} —</span>
            </div>
            <div class="pg-r" style="position: relative; display: flex; flex-direction: column; gap: 22px; padding: 36px 40px 36px 48px; border-radius: 0px 20px 20px 0px; background: linear-gradient(90deg, rgba(255, 255, 255, 0.043), rgba(255, 255, 255, 0.016) 30%, rgba(255, 255, 255, 0.02));">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="${LABEL}">Les chiffres</span>
                <button type="button" data-close style="margin-left: auto; display: flex; align-items: center; gap: 7px; height: 34px; padding: 0px 12px; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.12); background: rgba(255, 255, 255, 0.03); color: rgb(201, 201, 206); font: inherit; font-size: 12px; cursor: pointer;">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>
                  Refermer le livre
                </button>
              </div>
              <div style="display: grid; grid-template-columns: repeat(3, minmax(0px, 1fr)); gap: 0px;">
                <div style="display: flex; flex-direction: column; gap: 6px; padding-right: 16px;">
                  <span style="font-size: 11.5px; color: rgb(122, 122, 130);">Prévu</span>
                  <span style="font-size: 32px; font-weight: 700; letter-spacing: -0.03em; font-variant-numeric: tabular-nums;">${esc(e.consensus || '—')}</span>
                </div>
                <div style="display: flex; flex-direction: column; gap: 6px; padding: 0px 16px; border-left: 1px solid rgba(249, 164, 94, 0.5);">
                  <span style="font-size: 11.5px; color: rgb(122, 122, 130);">Réel</span>
                  <span style="font-size: 32px; font-weight: 700; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; color: ${reel === '—' ? 'rgb(92, 92, 99)' : 'rgb(246, 246, 247)'};">${esc(reel)}</span>
                </div>
                <div style="display: flex; flex-direction: column; gap: 6px; padding-left: 16px; border-left: 1px solid rgba(255, 255, 255, 0.08);">
                  <span style="font-size: 11.5px; color: rgb(122, 122, 130);">Précédent</span>
                  <span style="font-size: 20px; font-weight: 600; color: rgb(155, 155, 161); font-variant-numeric: tabular-nums; padding-top: 8px;">${esc(e.previous || '—')}</span>
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 14px; padding: 16px 18px; border-radius: 14px; border: 1px solid ${neutral ? 'rgba(255, 255, 255, 0.1)' : 'rgba(51, 230, 166, 0.3)'}; background: ${neutral ? 'rgba(255, 255, 255, 0.03)' : 'rgba(51, 230, 166, 0.07)'};">
                <span style="width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; background: rgba(0, 0, 0, 0.25);">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${neutral ? '#c9c9ce' : '#7ff3ca'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="transform: ${neutral ? 'rotate(45deg)' : 'none'};"><path d="M7 17L17 7M9 7h8v8"></path></svg>
                </span>
                <div style="display: flex; flex-direction: column; gap: 3px;">
                  <span style="font-weight: 700; color: ${neutral ? 'rgb(201, 201, 206)' : 'rgb(127, 243, 202)'};">${esc(effTitle)}</span>
                  <span style="font-size: 12.5px; color: rgb(155, 155, 161);">${esc(effText)}</span>
                </div>
              </div>
              <div style="display: flex; flex-direction: column; gap: 10px;">
                <div style="display: flex; align-items: baseline; gap: 8px;">
                  <span style="${LABEL}">${hist.length ? (hist.length > 1 ? hist.length + ' dernières publications' : 'Dernière publication') : 'Publications passées'}</span>
                  <span style="margin-left: auto; font-size: 11px; color: rgb(122, 122, 130);">écart au prévu</span>
                </div>
                ${hist.length ? `<div style="display: flex; align-items: center; gap: 10px; height: 96px;">${hist.map((h) => `
                    <div style="flex: 1 1 0%; display: flex; flex-direction: column; align-items: center; height: 100%;">
                      <div style="flex: 1 1 0%; width: 100%; display: flex; align-items: flex-end; justify-content: center;">
                        <div style="width: 70%; height: ${h.v > 0 ? (h.v / max * 100) : 0}%; border-radius: 4px 4px 0px 0px; background: linear-gradient(rgb(51, 230, 166), rgba(51, 230, 166, 0.3));"></div>
                      </div>
                      <div style="width: 100%; height: 1px; background: rgba(255, 255, 255, 0.18);"></div>
                      <div style="flex: 1 1 0%; width: 100%; display: flex; align-items: flex-start; justify-content: center;">
                        <div style="width: 70%; height: ${h.v < 0 ? (-h.v / max * 100) : 0}%; border-radius: 0px 0px 4px 4px; background: linear-gradient(0deg, rgb(255, 77, 94), rgba(255, 77, 94, 0.3));"></div>
                      </div>
                    </div>`).join('')}
                </div>
                <div style="display: flex; gap: 10px;">${hist.map((h) => `<span style="flex: 1 1 0%; text-align: center; ${MONO} font-size: 9.5px; color: rgb(122, 122, 130);">${dateShort(h.d)}</span>`).join('')}</div>`
                  : '<div style="display: flex; align-items: center; justify-content: center; height: 96px; border-radius: 12px; border: 1px dashed rgba(255, 255, 255, 0.12); font-size: 12px; color: rgb(122, 122, 130);">Pas encore de publication passée dans les données du calendrier.</div>'}
              </div>
              <span style="margin-top: auto; text-align: right; ${MONO} font-size: 10px; color: rgb(92, 92, 99);">— p. ${idx * 2 + 2} —</span>
            </div>
          </div>`;
  }

  function paint() {
    if (!C()) return;
    model = C().model();
    const main = $('calMain');
    main.classList.remove('is-loading');
    if (open === null && model.top3.length) open = evId(model.top3[0].ev);
    paintTopbar(); paintHero(); paintPast(); paintMajors(); paintFilter(); paintWeek(); paintShelf(); paintBook();
    $('c2CalEcon').hidden = false;
    loadTrack();
  }
  function choose(id) {
    open = open === id ? null : id;
    paintWeek(); paintShelf(); paintBook();
    if (open) $('c2CalBook').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
  }

  document.addEventListener('chest:cal-render', paint);
  document.addEventListener('chest:cal-error', () => {
    $('c2CalText').textContent = 'Calendrier en attente — réessaie dans un instant.';
  });
  document.addEventListener('click', (e) => {
    const imp = e.target.closest('#c2CalStars [data-imp]');
    if (imp) { C().toggleImportance(imp.dataset.imp); return; }
    if (e.target.closest('#c2CalBook [data-close]')) { open = null; paintWeek(); paintShelf(); paintBook(); return; }
    const o = e.target.closest('#calMain [data-open]');
    if (o) choose(o.dataset.open);
  });
  // le compte à rebours de la barre du haut suit l'heure
  setInterval(() => { if (model) paintTopbar(); }, 60000);
})();
