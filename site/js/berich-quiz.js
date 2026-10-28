// CHEST · BERICH — quiz de départ et plan proposé (2026-10-28).
// Six questions, une par écran (type de compte, capital, objectif, durée, recul accepté, algorithme), puis le calcul
// (js/berich-plan.js) et le plan proposé : algorithme + money management, chances d'atteindre l'objectif, éventail des
// futurs possibles, autres réglages. CHESTBerichQuiz.open({ preps, answers, onSave }) ; fanSvg() sert aussi à la page.
(() => {
  'use strict';
  const P = window.CHESTBerichPlan;
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = (v) => Math.round(v).toLocaleString('fr-FR') + ' €';
  const pc = (v) => Math.round(v * 100) + ' %';
  const nf = (v, d) => Number(v).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const rk = (v) => nf(v, v % 1 ? (Math.round(v * 100) % 10 ? 2 : 1) : 0);
  const dur = (m) => (m >= 12 ? `${m / 12} an${m > 12 ? 's' : ''}` : `${m} mois`);
  const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  const BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>';

  // ---------- Éventail : 10e–90e centiles, médiane, objectif. SVG à proportions fixes (largeur 100 %, hauteur auto).
  function fanSvg(f, goal, opts) {
    const o = opts || {}, W = 640, H = o.h || 250, L = 56, Rm = 14, T = 16, B = 30;
    const xs = [0].concat(f.months), lo = [goal.capital].concat(f.p10), mid = [goal.capital].concat(f.p50), hi = [goal.capital].concat(f.p90);
    // Échelle logarithmique : une croissance composée se lit en proportions, et toute la zone tient dans le cadre.
    const yMax = Math.max(goal.target * 1.15, Math.max(...hi) * 1.06), yMin = Math.min(goal.capital * 0.9, Math.min(...lo) * 0.94);
    const x = (m) => L + (m / xs[xs.length - 1]) * (W - L - Rm);
    const ly = (v) => Math.log(Math.max(v, 1e-9));
    const y = (v) => T + (1 - (ly(v) - ly(yMin)) / (ly(yMax) - ly(yMin))) * (H - T - B);
    const line = (arr) => arr.map((v, i) => `${i ? 'L' : 'M'}${x(xs[i]).toFixed(1)},${y(v).toFixed(1)}`).join('');
    const band = line(hi) + lo.slice().reverse().map((v, i) => `L${x(xs[xs.length - 1 - i]).toFixed(1)},${y(v).toFixed(1)}`).join('') + 'Z';
    const ty = y(goal.target), id = 'bqf' + Math.random().toString(36).slice(2, 7);
    const nice = (v) => { const e = 10 ** Math.floor(Math.log10(v)); return Math.round(v / e * 2) / 2 * e; };
    const ticks = [goal.capital, nice(Math.sqrt(goal.capital * yMax)), nice(yMax / 1.06)].filter((v, i, a) => v > yMin && v < yMax && a.findIndex((w) => Math.abs(y(w) - y(v)) < 26) === i && Math.abs(y(v) - ty) > 14);
    const step = xs[xs.length - 1] <= 6 ? 1 : xs[xs.length - 1] <= 12 ? 3 : 6;
    const mTicks = xs.filter((m) => m > 0 && m % step === 0);
    const short = (v) => (v >= 10000 ? Math.round(v / 1000).toLocaleString('fr-FR') + ' k€' : eur(v));
    return `<svg class="bq-fan" viewBox="0 0 ${W} ${H}" role="img" aria-label="Capital possible mois par mois : médiane ${eur(mid[mid.length - 1])}, objectif ${eur(goal.target)}">
      <defs><linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#33e6a6" stop-opacity=".30"/><stop offset="1" stop-color="#33e6a6" stop-opacity=".05"/></linearGradient>
        <clipPath id="${id}c"><rect x="${L}" y="${T}" width="${W - L - Rm}" height="${H - T - B}"/></clipPath></defs>
      ${ticks.map((v) => `<line x1="${L}" x2="${W - Rm}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="bq-fan__grid"/><text x="${L - 10}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" class="bq-fan__ax">${short(v)}</text>`).join('')}
      ${mTicks.map((m) => `<text x="${x(m).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="bq-fan__ax">${m >= 12 && m % 12 === 0 ? dur(m) : m + ' m'}</text>`).join('')}
      <g clip-path="url(#${id}c)"><path d="${band}" fill="url(#${id}g)"/><path d="${line(mid)}" class="bq-fan__mid"/></g>
      ${ty >= T && ty <= H - B ? `<line x1="${L}" x2="${W - Rm}" y1="${ty.toFixed(1)}" y2="${ty.toFixed(1)}" class="bq-fan__goal"/><text x="${W - Rm}" y="${(ty - 8).toFixed(1)}" text-anchor="end" class="bq-fan__goal-t">Objectif ${eur(goal.target)}</text>` : ''}
      <circle cx="${x(0)}" cy="${y(goal.capital).toFixed(1)}" r="4" class="bq-fan__dot"/>
    </svg>`;
  }
  function ring(p, label) {
    const C = 2 * Math.PI * 44, v = Math.max(0, Math.min(1, p));
    return `<div class="bq-ring" role="img" aria-label="${pc(v)} ${esc(label)}"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" class="bq-ring__bg"/>
      <circle cx="50" cy="50" r="44" class="bq-ring__fg" style="stroke-dasharray:${(C * v).toFixed(1)} ${C.toFixed(1)}"/></svg><b>${Math.round(v * 100)}<small>%</small></b></div>`;
  }

  // ---------- Questions
  const STEPS = ['account', 'capital', 'target', 'months', 'tolerance', 'algo'];
  const CAP = { perso: [500, 1000, 2500, 5000, 10000], propfirm: [10000, 25000, 50000, 100000, 200000] };
  const TGT = { perso: [[2, '×2'], [3, '×3'], [5, '×5'], [10, '×10']], propfirm: [[1.05, '+5 %', 'phase 2'], [1.08, '+8 %', 'phase 1'], [1.1, '+10 %', ''], [1.2, '+20 %', 'financé, sur la durée']] };
  const TOL = { perso: [[0.1, '−10 %', 'Je veux dormir tranquille'], [0.2, '−20 %', 'Un recul normal ne me fait pas paniquer'], [0.35, '−35 %', 'J’accepte de gros creux pour aller plus haut'], [0.5, '−50 %', 'Je vise le maximum, j’assume le risque']],
    propfirm: [[0.06, '−6 %', 'Règle stricte'], [0.08, '−8 %', 'Courant chez les propfirms'], [0.1, '−10 %', 'Le plus courant'], [0.12, '−12 %', 'Règle souple']] };
  const S = { step: 0, a: {}, preps: [], onSave: null, result: null, pick: null, calc: false };
  const root = () => document.getElementById('brQuiz');

  function algoCard(p, sel) {
    const pts = []; let cum = 0; p.list.forEach((x, i) => { cum += x.r; if (i % Math.max(1, Math.floor(p.n / 60)) === 0) pts.push(cum); });
    const mn = Math.min(0, ...pts), mx = Math.max(...pts, 1);
    const path = pts.map((v, i) => `${i ? 'L' : 'M'}${(i / (pts.length - 1 || 1) * 120).toFixed(1)},${(34 - (v - mn) / (mx - mn) * 30).toFixed(1)}`).join('');
    return `<button type="button" class="bq-algo${sel ? ' is-on' : ''}" data-v="${esc(p.key)}" aria-pressed="${sel}">
      <span class="bq-algo__top"><b>${esc(p.name)}</b><svg viewBox="0 0 120 36" aria-hidden="true"><path d="${path}"/></svg></span>
      <span class="bq-algo__facts"><span><b>${nf(p.winrate * 100, 0)} %</b>gagnants</span><span><b>${nf(p.avgWin, 1)} R</b>par gain</span><span><b>${nf(p.perMonth, 0)}</b>signaux / mois</span><span><b>${p.worstStreak}</b>stops d’affilée au pire</span></span>
      <span class="bq-algo__sum">${p.avgWin >= 4 ? 'Gagne gros mais rarement : longues séries de stops à encaisser.' : 'Gagne plus souvent, des creux plus courts.'} ${p.total > 0 ? '+' : ''}${nf(p.total, 0)} R en ${nf(p.months, 0)} mois.</span>
    </button>`;
  }

  function question() {
    const a = S.a, k = STEPS[S.step], acc = a.account || 'perso';
    const opt = (v, t, d, on) => `<button type="button" class="bq-opt${on ? ' is-on' : ''}" data-v="${v}" aria-pressed="${!!on}"><b>${t}</b>${d ? `<small>${d}</small>` : ''}</button>`;
    if (k === 'account') return { h: 'Où BERICH va trader ?', p: 'Les règles de risque ne sont pas les mêmes avec ton argent et avec un compte de propfirm.',
      body: `<div class="bq-opts bq-opts--2">${opt('perso', 'Mon compte perso', 'Ton argent, chez un broker. Tu fixes ton recul maximum.', a.account === 'perso')}${opt('propfirm', 'Une propfirm', 'Un compte financé : perte du jour et perte maximum imposées.', a.account === 'propfirm')}</div>` };
    if (k === 'capital') return { h: acc === 'propfirm' ? 'Quelle taille de compte ?' : 'Avec combien tu démarres ?', p: acc === 'propfirm' ? 'Le capital du challenge ou du compte financé.' : 'Le montant que tu mets sur le compte que BERICH va trader.', input: 'capital',
      body: `<label class="bq-num"><input type="text" inputmode="numeric" id="bqIn" value="${a.capital ? a.capital.toLocaleString('fr-FR') : ''}" placeholder="${acc === 'propfirm' ? '100 000' : '1 000'}" aria-label="Capital de départ en euros" autocomplete="off"><span>€</span></label>
        <div class="bq-chips">${CAP[acc].map((v) => `<button type="button" class="bq-chip${a.capital === v ? ' is-on' : ''}" data-v="${v}">${eur(v)}</button>`).join('')}</div>` };
    if (k === 'target') return { h: 'Jusqu’où tu veux l’emmener ?', p: `Ton objectif, en partant de ${eur(a.capital)}.`, input: 'target',
      body: `<label class="bq-num"><input type="text" inputmode="numeric" id="bqIn" value="${a.target ? a.target.toLocaleString('fr-FR') : ''}" placeholder="${(a.capital * (acc === 'propfirm' ? 1.08 : 3)).toLocaleString('fr-FR')}" aria-label="Objectif en euros" autocomplete="off"><span>€</span></label>
        <div class="bq-chips">${TGT[acc].map(([m, l, d]) => { const v = Math.round(a.capital * m); return `<button type="button" class="bq-chip${a.target === v ? ' is-on' : ''}" data-v="${v}">${l} <em>${eur(v)}${d ? ' · ' + d : ''}</em></button>`; }).join('')}</div>` };
    if (k === 'months') return { h: 'En combien de temps ?', p: `Pour passer de ${eur(a.capital)} à ${eur(a.target)}.`,
      body: `<div class="bq-opts bq-opts--4">${[[3, '3 mois'], [6, '6 mois'], [12, '1 an'], [24, '2 ans']].map(([v, t]) => opt(v, t, '', a.months === v)).join('')}</div>` };
    if (k === 'tolerance') return { h: acc === 'propfirm' ? 'Quelle perte maximum impose ta propfirm ?' : 'Quel recul tu acceptes de voir ?', p: acc === 'propfirm' ? 'On garde de la marge en dessous, et la perte du jour reste sous 4 %.' : 'Depuis ton plus haut. Au-delà, le plan est considéré comme raté.',
      body: `<div class="bq-opts bq-opts--2">${TOL[acc].map(([v, t, d]) => opt(v, t, d, a.tolerance === v)).join('')}</div>` };
    return { h: 'Quel algorithme ?', p: 'Deux façons de trader l’or, rejouées sur tout leur historique. Ou laisse le calcul choisir.',
      body: `<div class="bq-algos">${S.preps.map((p) => algoCard(p, a.algo === p.key)).join('')}</div>
        <button type="button" class="bq-auto${a.algo === 'auto' || !a.algo ? ' is-on' : ''}" data-v="auto" aria-pressed="${a.algo === 'auto' || !a.algo}"><span class="bq-auto__i" aria-hidden="true"></span><span><b>Choisis pour moi</b><small>On compare ${S.preps.length > 1 ? 'les deux' : 'les réglages'} et on garde ce qui atteint le plus souvent ton objectif.</small></span></button>` };
  }

  function frame(inner, opts) {
    const o = opts || {};
    return `<div class="bq-box" role="dialog" aria-modal="true" aria-labelledby="bqH" tabindex="-1">
      <div class="bq-head"><span class="bq-brand"><img src="assets/logo-berich.png?v=2" alt="">BERICH · ton plan</span>${o.progress != null ? `<span class="bq-step">${String(o.progress + 1).padStart(2, '0')} / ${String(STEPS.length).padStart(2, '0')}</span>` : ''}
        <button type="button" class="bq-x" data-bq="close" aria-label="Fermer"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6"/></svg></button></div>
      ${o.progress != null ? `<div class="bq-bar"><i style="transform:scaleX(${((o.progress + 1) / STEPS.length).toFixed(3)})"></i></div>` : ''}
      <div class="bq-body">${inner}</div></div>`;
  }

  function renderStep() {
    const q = question(), k = STEPS[S.step];
    const canNext = k === 'algo' || S.a[k] != null;
    root().innerHTML = frame(`<div class="bq-q" data-k="${k}"><h2 id="bqH">${q.h}</h2><p class="bq-lead">${q.p}</p>${q.body}<p class="bq-err" id="bqErr" role="alert"></p></div>
      <div class="bq-foot">${S.step ? `<button type="button" class="bq-back" data-bq="back">${BACK}Retour</button>` : '<span></span>'}
        <button type="button" class="br-btn" data-bq="next" ${canNext || q.input ? '' : 'disabled'}>${k === 'algo' ? 'Calculer mon plan' : 'Continuer'}${ARROW}</button></div>`, { progress: S.step });
    const inp = document.getElementById('bqIn');
    if (inp) {
      inp.addEventListener('input', () => { const d = inp.value.replace(/\D/g, ''); inp.value = d ? Number(d).toLocaleString('fr-FR') : ''; root().querySelectorAll('.bq-chip').forEach((c) => c.classList.toggle('is-on', c.dataset.v === d)); });
      setTimeout(() => inp.focus(), 60);
    } else { const f = root().querySelector('.bq-opt.is-on, .bq-algo.is-on, .bq-auto.is-on') || root().querySelector('.bq-box'); if (f) setTimeout(() => f.focus({ preventScroll: true }), 60); }
  }

  function commitInput() {
    const k = STEPS[S.step], inp = document.getElementById('bqIn');
    if (!inp) return true;
    const v = Number(inp.value.replace(/\D/g, ''));
    const err = (m) => { document.getElementById('bqErr').textContent = m; inp.focus(); return false; };
    if (k === 'capital' && !(v >= 100)) return err('Indique au moins 100 €.');
    if (k === 'target' && !(v > S.a.capital)) return err(`L’objectif doit dépasser ${eur(S.a.capital)}.`);
    S.a[k] = v;
    return true;
  }
  function next() {
    if (!commitInput()) return;
    const k = STEPS[S.step];
    if (k === 'account' && S.a.tolerance != null && !TOL[S.a.account].some(([v]) => v === S.a.tolerance)) S.a.tolerance = null;
    if (S.a[k] == null && k !== 'algo') return;
    if (S.step < STEPS.length - 1) { S.step++; renderStep(); return; }
    S.a.algo = S.a.algo || 'auto';
    compute();
  }

  // ---------- Calcul puis plan proposé
  function compute() {
    S.calc = true;
    const p = S.preps, n = p.reduce((s, x) => s + x.n, 0);
    root().innerHTML = frame(`<div class="bq-calc"><div class="bq-calc__orb" aria-hidden="true"><i></i><i></i></div>
      <h2 id="bqH">On calcule ton plan</h2>
      <ul class="bq-calc__steps"><li>On rejoue ${n.toLocaleString('fr-FR')} positions réelles de ${p.length > 1 ? p.map((x) => esc(x.name)).join(' et ') : esc(p[0].name)}</li>
        <li>On essaie 84 réglages de risque par algorithme</li><li>On tire 800 futurs possibles pour chacun</li></ul></div>`);
    const goal = goalOf(S.a);
    setTimeout(() => {
      S.result = P.recommend(S.preps, goal);
      S.pick = S.result.best;
      setTimeout(renderResult, 450);
    }, 380);
  }
  const goalOf = (a) => ({ capital: a.capital, target: a.target, months: a.months, tolerance: a.tolerance, account: a.account, algo: a.algo || 'auto' });
  const prepOf = (k) => S.preps.find((p) => p.key === k);

  function whyLines(c, goal) {
    const p = prepOf(c.algo), out = [];
    const streakCost = 1 - (c.cfg.afterSl ? Array.from({ length: p.worstStreak }, (_, i) => (i < c.cfg.afterSl ? c.cfg.risk : c.cfg.newRisk)) : Array(p.worstStreak).fill(c.cfg.risk)).reduce((m, r) => m * (1 - r / 100), 1);
    out.push(`${esc(p.name)} a déjà enchaîné <b>${p.worstStreak} stops</b> : avec ce réglage, cette série coûterait <b>−${nf(streakCost * 100, 1)} %</b>.`);
    if (c.cfg.afterSl) out.push(`Après ${c.cfg.afterSl} stops d’affilée, le risque passe à ${rk(c.cfg.newRisk)} % et revient à ${rk(c.cfg.risk)} % au premier gain : les creux se creusent moins vite.`);
    out.push(`Rejoué sur l’historique (${nf(p.months, 0)} mois), ${eur(goal.capital)} seraient devenus <b>${eur(goal.capital * c.hist.mult)}</b>, avec un recul maximum de <b>−${nf(c.hist.maxDd * 100, 1)} %</b>.`);
    if (goal.account === 'propfirm') out.push(`Pire journée passée : −${nf(c.hist.worstDay * 100, 1)} %, sous la limite de perte du jour.`);
    return out;
  }
  function altRow(c, tag, goal) {
    if (!c) return '';
    const on = S.pick === c;
    return `<button type="button" class="bq-alt${on ? ' is-on' : ''}" data-alt="${tag}" aria-pressed="${on}"><span class="bq-alt__tag">${{ best: 'Recommandé', prudent: 'Prudent', bold: 'Ambitieux', other: 'Autre algorithme' }[tag.split(':')[0]]}</span>
      <span class="bq-alt__cfg"><b>${esc(prepOf(c.algo).name)}</b> · ${esc(P.describe(c.cfg))}</span>
      <span class="bq-alt__n"><b>${pc(c.pReach)}</b>objectif</span><span class="bq-alt__n"><b>${eur(c.p50)}</b>médiane</span><span class="bq-alt__n"><b>−${Math.round(c.dd90 * 100)} %</b>recul 1 fois / 10</span></button>`;
  }
  function renderResult() {
    const R = S.result, goal = R.goal, c = S.pick;
    if (!c) {
      root().innerHTML = frame(`<div class="bq-q"><h2 id="bqH">Aucun réglage ne tient dans ce recul</h2><p class="bq-lead">Même au risque le plus bas, l’historique dépasse ta limite. Accepte un recul un peu plus grand ou choisis l’autre algorithme.</p>
        <div class="bq-foot"><button type="button" class="bq-back" data-bq="edit">${BACK}Modifier mes réponses</button></div></div>`);
      return;
    }
    const p = prepOf(c.algo), f = P.fan(p, c.cfg, goal);
    const alts = [['best', R.best], ['prudent', R.prudent], ['bold', R.bold]].concat((R.others || []).map((o, i) => ['other:' + i, o])).filter(([, x]) => x);
    const verdict = c.pReach >= 0.65 ? 'Ton objectif est à portée.' : c.pReach >= 0.4 ? 'Ton objectif est jouable, sans garantie.' : c.pReach >= 0.1 ? 'Ton objectif est ambitieux pour ce délai.' : 'Ton objectif est hors de portée dans ce délai.';
    root().innerHTML = frame(`<div class="bq-res">
      <span class="br-label">Ton plan BERICH</span>
      <h2 id="bqH">${esc(p.name)}, ${rk(c.cfg.risk)} % par position.</h2>
      <p class="bq-lead">${c.cfg.afterSl ? `${rk(c.cfg.newRisk)} % après ${c.cfg.afterSl} stops d’affilée, retour à ${rk(c.cfg.risk)} % au premier gain. ` : ''}${verdict}</p>
      <div class="bq-res__top">
        <div class="bq-res__ring">${ring(c.pReach, 'des futurs atteignent l’objectif')}<span>des futurs simulés touchent <b>${eur(goal.target)}</b> en ${dur(goal.months)} sans reculer de plus de ${Math.round(goal.tolerance * 100)} %${c.monthsToGoal ? ` · en ${nf(c.monthsToGoal, 1)} mois en moyenne` : ''}</span></div>
        <dl class="bq-res__facts">
          <div><dt>Médiane dans ${dur(goal.months)}</dt><dd>${eur(c.p50)}</dd></div>
          <div><dt>1 fois sur 10, moins de</dt><dd>${eur(c.p10)}</dd></div>
          <div><dt>1 fois sur 10, plus de</dt><dd>${eur(c.p90)}</dd></div>
          <div><dt>Recul probable</dt><dd>−${Math.round(c.dd50 * 100)} % <small>· 1 fois sur 10 : −${Math.round(c.dd90 * 100)} %</small></dd></div>
        </dl>
      </div>
      <div class="bq-res__fan">${fanSvg(f, goal)}<p class="bq-note">Zone verte : 8 futurs sur 10. Trait : le futur médian. Tirés de l’historique de ${esc(p.name)}, pas une prévision.</p></div>
      <ul class="bq-why">${whyLines(c, goal).map((l) => `<li>${l}</li>`).join('')}</ul>
      ${R.hints && R.hints.length ? `<div class="bq-hints"><span class="br-label">Pour mieux viser</span>${R.hints.map((h, i) => `<button type="button" class="bq-hint" data-hint="${i}">${esc(h.label)}${h.realistic ? '' : ` <b>${pc(h.pReach)}</b>`}<i>→</i></button>`).join('')}</div>` : ''}
      <div class="bq-alts"><span class="br-label">Autres réglages</span>${alts.map(([t, x]) => altRow(x, t, goal)).join('')}</div>
      <div class="bq-foot bq-foot--res"><button type="button" class="bq-back" data-bq="edit">${BACK}Modifier mes réponses</button><button type="button" class="br-btn" data-bq="save">Valider ce plan${ARROW}</button></div>
    </div>`);
    root().querySelector('.bq-body').scrollTop = 0;
  }

  async function save() {
    const c = S.pick, goal = S.result.goal;
    const plan = { v: 1, answers: Object.assign({}, S.a), algo: c.algo, cfg: c.cfg,
      metrics: { pReach: c.pReach, p10: c.p10, p50: c.p50, p90: c.p90, dd50: c.dd50, dd90: c.dd90, histMult: c.hist.mult, histDd: c.hist.maxDd }, goal, createdAt: new Date().toISOString() };
    const btn = root().querySelector('[data-bq="save"]');
    if (btn) btn.disabled = true;
    try { await S.onSave(plan); close(); } catch (e) { if (btn) btn.disabled = false; const p = document.createElement('p'); p.className = 'bq-err'; p.textContent = e.message || 'Enregistrement impossible.'; btn.parentNode.prepend(p); }
  }

  let lastFocus = null;
  function close() { const r = root(); if (!r) return; r.hidden = true; r.innerHTML = ''; document.documentElement.classList.remove('bq-open'); if (lastFocus && lastFocus.focus) lastFocus.focus(); if (S.onClose) S.onClose(); }
  function open(o) {
    S.preps = o.preps; S.onSave = o.onSave; S.onClose = o.onClose; S.a = Object.assign({}, o.answers || {}); S.step = 0; S.result = null; S.pick = null;
    if (S.preps.length === 1) S.a.algo = S.a.algo || 'auto';
    let r = root();
    if (!r) { r = document.createElement('div'); r.id = 'brQuiz'; r.className = 'bq'; document.body.appendChild(r); }
    lastFocus = document.activeElement;
    r.hidden = false; document.documentElement.classList.add('bq-open');
    if (o.result) { S.a = Object.assign({}, o.answers); compute(); } else renderStep();
  }

  document.addEventListener('click', (e) => {
    const r = root(); if (!r || r.hidden) return;
    if (e.target === r) return close();
    const act = e.target.closest('[data-bq]');
    if (act) {
      const a = act.dataset.bq;
      if (a === 'close') close(); else if (a === 'next') next(); else if (a === 'back') { S.step = Math.max(0, S.step - 1); renderStep(); }
      else if (a === 'edit') { S.step = 0; renderStep(); } else if (a === 'save') save();
      return;
    }
    const alt = e.target.closest('[data-alt]');
    if (alt) { const t = alt.dataset.alt; S.pick = t.startsWith('other:') ? S.result.others[Number(t.split(':')[1])] : S.result[t]; renderResult(); return; }
    const h = e.target.closest('[data-hint]');
    if (h) { const g = S.result.hints[Number(h.dataset.hint)].goal; Object.assign(S.a, { months: g.months, tolerance: g.tolerance, target: g.target }); compute(); return; }
    const v = e.target.closest('.bq-opt, .bq-chip, .bq-algo, .bq-auto');
    if (v) {
      const k = STEPS[S.step], raw = v.dataset.v;
      S.a[k] = k === 'account' || k === 'algo' ? raw : Number(raw);
      if (k === 'capital' || k === 'target') { renderStep(); return; }
      renderStep();
      if (k !== 'algo') setTimeout(next, 160);
    }
  });
  document.addEventListener('keydown', (e) => {
    const r = root(); if (!r || r.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'Enter' && e.target.id === 'bqIn') { e.preventDefault(); next(); }
  });

  window.CHESTBerichQuiz = { open, close, fanSvg, ring };
})();
