// CHEST · BERICH — quiz de départ et plan proposé (2026-10-28, v3).
// Six questions, une par écran : type de compte, capital (500 € minimum), objectif (×3 réaliste, ×6 maximum), durée
// (1 an maximum), rapport aux pertes passagères (en mots, pas en chiffres), algorithme. À la dernière question, chaque
// algorithme affiche SA meilleure proposition pour ces réponses ; une fois choisi, on voit les possibilités de cet
// algorithme (recommandé, prudent, ambitieux). Calcul : js/berich-plan.js. CHESTBerichQuiz.open({ preps, answers,
// onSave }) ; fanSvg() et ring() servent aussi à la page.
(() => {
  'use strict';
  const P = window.CHESTBerichPlan;
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = (v) => Math.round(v).toLocaleString('fr-FR') + ' €';
  const pc = (v) => Math.round(v * 100) + ' %';
  const nf = (v, d) => Number(v).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const rk = (v) => nf(v, v % 1 ? (Math.round(v * 100) % 10 ? 2 : 1) : 0);
  const dur = (m) => (m >= 12 ? `${m / 12} an${m > 12 ? 's' : ''}` : `${m} mois`);
  const keur = (v) => (v >= 1000 ? `${nf(v / 1000, v < 10000 && Math.round(v / 100) % 10 ? 1 : 0)} k€` : `${Math.round(v)} €`);
  const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  const BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>';
  let uid = 0;

  // ---------- Courbe lissée (Catmull-Rom → Bézier), sans dépassement visible sur des séries croissantes.
  function smooth(pts) {
    if (pts.length < 3) return pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d;
  }

  // ---------- Éventail des futurs : 8 sur 10 (clair), 1 sur 2 (plus dense), médiane lumineuse, objectif, moment où la
  // médiane l'atteint. Échelle logarithmique : une croissance composée se lit en proportions.
  function fanSvg(f, goal, opts) {
    const o = opts || {}, W = 680, H = o.h || 280, L = 50, R = 84, T = 22, B = 34, id = 'bqf' + (++uid);
    const xs = [0].concat(f.months), at = (arr) => [goal.capital].concat(arr);
    const lo = at(f.p10), q1 = at(f.p25 || f.p10), mid = at(f.p50), q3 = at(f.p75 || f.p90), hi = at(f.p90);
    const yMax = Math.max(goal.target * 1.12, Math.max(...hi) * 1.04), yMin = Math.min(goal.capital * 0.92, Math.min(...lo) * 0.96);
    const last = xs[xs.length - 1];
    const x = (m) => L + (m / last) * (W - L - R);
    const ly = (v) => Math.log(Math.max(v, 1e-9));
    const y = (v) => T + (1 - (ly(v) - ly(yMin)) / (ly(yMax) - ly(yMin))) * (H - T - B);
    const pts = (arr) => arr.map((v, i) => [x(xs[i]), y(v)]);
    const area = (top, bot) => smooth(pts(top)) + 'L' + smooth(pts(bot).reverse()).slice(1) + 'Z';
    // Graduations « rondes » (1, 2, 2,5, 5 × 10ⁿ) espacées d'au moins 34 px.
    const ticks = [];
    for (let e = Math.floor(Math.log10(yMin)); e <= Math.ceil(Math.log10(yMax)); e++) [1, 2, 2.5, 5].forEach((m) => { const v = m * 10 ** e; if (v >= yMin && v <= yMax) ticks.push(v); });
    const shown = []; ticks.forEach((v) => { if (shown.every((w) => Math.abs(y(w) - y(v)) >= 34)) shown.push(v); });
    const ty = y(goal.target);
    // Mois où la médiane franchit l'objectif (interpolation logarithmique).
    let cross = null;
    for (let i = 1; i < mid.length && cross == null; i++) if (mid[i] >= goal.target && mid[i - 1] < goal.target) cross = xs[i - 1] + (xs[i] - xs[i - 1]) * (ly(goal.target) - ly(mid[i - 1])) / (ly(mid[i]) - ly(mid[i - 1]));
    const endX = x(last), endY = y(mid[mid.length - 1]);
    const mLabel = (m) => (m === 0 ? 'Départ' : m % 12 === 0 ? dur(m) : `${m} mois`);
    const step = last <= 6 ? (last <= 3 ? 1 : 2) : 3;
    return `<svg class="bq-fan" viewBox="0 0 ${W} ${H}" role="img" aria-label="Capital possible mois par mois : médiane ${eur(mid[mid.length - 1])} au bout de ${dur(last)}, objectif ${eur(goal.target)}">
      <defs>
        <linearGradient id="${id}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5df5c0" stop-opacity=".20"/><stop offset="1" stop-color="#14b8a6" stop-opacity=".04"/></linearGradient>
        <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5df5c0" stop-opacity=".30"/><stop offset="1" stop-color="#14b8a6" stop-opacity=".10"/></linearGradient>
        <linearGradient id="${id}m" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7ff0cd" stop-opacity=".55"/><stop offset=".6" stop-color="#33e6a6"/><stop offset="1" stop-color="#c8fff0"/></linearGradient>
        <filter id="${id}g" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
      </defs>
      ${shown.map((v) => `<line x1="${L}" x2="${W - R + 8}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="bq-fan__grid"/><text x="${L - 12}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" class="bq-fan__ax">${keur(v)}</text>`).join('')}
      ${xs.filter((m) => m === 0 || m % step === 0).map((m) => `<text x="${x(m).toFixed(1)}" y="${H - 10}" text-anchor="${m === 0 ? 'start' : m === last ? 'end' : 'middle'}" class="bq-fan__ax">${mLabel(m)}</text>`).join('')}
      <g class="bq-fan__bands">
        <path d="${area(hi, lo)}" fill="url(#${id}a)"/>
        <path d="${area(q3, q1)}" fill="url(#${id}b)"/>
        <path d="${smooth(pts(hi))}" class="bq-fan__edge"/><path d="${smooth(pts(lo))}" class="bq-fan__edge"/>
      </g>
      ${ty >= T && ty <= H - B ? `<line x1="${L}" x2="${endX}" y1="${ty.toFixed(1)}" y2="${ty.toFixed(1)}" class="bq-fan__goal"/>
        <g transform="translate(${L + 8},${(ty - 12).toFixed(1)})"><rect class="bq-fan__pill bq-fan__pill--goal" x="0" y="-11" rx="9" width="${(14 + `Objectif ${eur(goal.target)}`.length * 5.6).toFixed(0)}" height="18"/><text x="8" y="2" class="bq-fan__goal-t">Objectif ${eur(goal.target)}</text></g>` : ''}
      ${cross != null && cross < last ? `<line x1="${x(cross).toFixed(1)}" x2="${x(cross).toFixed(1)}" y1="${ty.toFixed(1)}" y2="${H - B}" class="bq-fan__cross"/><circle cx="${x(cross).toFixed(1)}" cy="${ty.toFixed(1)}" r="3.5" class="bq-fan__hit"/>` : ''}
      <path d="${smooth(pts(mid))}" class="bq-fan__glow" stroke="url(#${id}m)" filter="url(#${id}g)"/>
      <path d="${smooth(pts(mid))}" class="bq-fan__mid" stroke="url(#${id}m)" pathLength="1"/>
      <circle cx="${x(0)}" cy="${y(goal.capital).toFixed(1)}" r="4" class="bq-fan__start"/>
      <circle cx="${endX}" cy="${endY.toFixed(1)}" r="9" class="bq-fan__halo"/><circle cx="${endX}" cy="${endY.toFixed(1)}" r="4.5" class="bq-fan__end"/>
      <g transform="translate(${(endX + 12).toFixed(1)},${endY.toFixed(1)})"><rect class="bq-fan__pill" x="0" y="-12" rx="10" width="${R - 16}" height="22"/><text x="${((R - 16) / 2).toFixed(1)}" y="3.5" text-anchor="middle" class="bq-fan__end-t">${keur(mid[mid.length - 1])}</text></g>
    </svg>`;
  }

  // ---------- Anneau de réussite : piste graduée, arc en dégradé qui se dessine, point lumineux au bout.
  function ring(p, label) {
    const v = Math.max(0, Math.min(1, p)), r = 50, C = 2 * Math.PI * r, id = 'bqr' + (++uid);
    const ang = (v * 360 - 90) * Math.PI / 180, ex = 60 + r * Math.cos(ang), ey = 60 + r * Math.sin(ang);
    const tone = v >= 0.65 ? '' : v >= 0.35 ? ' is-mid' : ' is-low';
    return `<div class="bq-ring${tone}" role="img" aria-label="${pc(v)} ${esc(label)}"><svg viewBox="0 0 120 120" aria-hidden="true">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--ring-a)"/><stop offset="1" style="stop-color:var(--ring-b)"/></linearGradient></defs>
      <circle cx="60" cy="60" r="${r}" class="bq-ring__ticks"/>
      <circle cx="60" cy="60" r="${r}" class="bq-ring__bg"/>
      <circle cx="60" cy="60" r="${r}" class="bq-ring__fg" stroke="url(#${id})" style="--c:${C.toFixed(1)};stroke-dasharray:${C.toFixed(1)};stroke-dashoffset:${(C * (1 - v)).toFixed(1)}" transform="rotate(-90 60 60)"/>
      ${v > 0.02 ? `<circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="4" class="bq-ring__dot"/>` : ''}
    </svg><span class="bq-ring__v"><b>${Math.round(v * 100)}<small>%</small></b><em>de réussite</em></span></div>`;
  }

  // ---------- Questions
  const STEPS = ['account', 'capital', 'target', 'months', 'tolerance', 'algo'];
  const MIN_CAP = 500, MAX_MULT = 6;
  const CAP = { perso: [500, 1000, 2500, 5000, 10000], propfirm: [10000, 25000, 50000, 100000, 200000] };
  const TGT = { perso: [[2, '×2', ''], [3, '×3', 'le plus réaliste'], [4, '×4', ''], [6, '×6', 'maximum']], propfirm: [[1.05, '+5 %', 'phase 2'], [1.08, '+8 %', 'phase 1'], [1.1, '+10 %', ''], [1.2, '+20 %', 'financé']] };
  // Rapport aux pertes passagères : des mots, pas des chiffres. Valeur interne = recul toléré depuis le plus haut.
  const FEEL = [[0.15, 'Une progression calme', 'Voir mon compte baisser me stresse. Je préfère avancer moins vite.'],
    [0.25, 'Quelques creux, ça va', 'Des pertes passagères ne me font pas paniquer, tant que ça remonte.'],
    [0.35, 'Les creux ne me font pas peur', 'Les pertes font partie du jeu. Je regarde où j’arrive, pas chaque journée.'],
    [0.5, 'Seul le résultat compte', 'Les pertes éphémères ne me gênent pas du tout si l’objectif est au bout.']];
  const PROP = [[0.06, 'Perte max 6 %', 'Règle stricte'], [0.08, 'Perte max 8 %', 'Courant'], [0.1, 'Perte max 10 %', 'Le plus courant'], [0.12, 'Perte max 12 %', 'Règle souple']];
  const S = { step: 0, a: {}, preps: [], onSave: null, result: null, pick: null, byAlgo: null, byKey: '' };
  const root = () => document.getElementById('brQuiz');
  const prepOf = (k) => S.preps.find((p) => p.key === k);
  const nameOf = (k) => (prepOf(k) || { name: k }).name;
  const goalOf = (a, algo) => ({ capital: a.capital, target: a.target, months: a.months, tolerance: a.tolerance, account: a.account, algo });
  const feelOf = (a) => (a.account === 'propfirm' ? 'sans toucher la perte maximum de ta propfirm' : 'en restant dans des creux que tu acceptes');

  // Meilleure proposition de chaque algorithme pour les réponses en cours (calculée une fois par jeu de réponses).
  function computeByAlgo() {
    const key = JSON.stringify([S.a.capital, S.a.target, S.a.months, S.a.tolerance, S.a.account]);
    if (S.byAlgo && S.byKey === key) return;
    S.byAlgo = {}; S.byKey = key;
    S.preps.forEach((p) => { S.byAlgo[p.key] = P.recommend(S.preps, goalOf(S.a, p.key)); });
  }
  const bestAlgo = () => S.preps.map((p) => p.key).filter((k) => S.byAlgo[k] && S.byAlgo[k].best)
    .sort((a, b) => S.byAlgo[b].best.pReach - S.byAlgo[a].best.pReach || S.byAlgo[b].best.p50 - S.byAlgo[a].best.p50)[0];

  function spark(p) {
    const pts = []; let cum = 0;
    p.list.forEach((x, i) => { cum += x.r; if (i % Math.max(1, Math.floor(p.n / 60)) === 0) pts.push(cum); });
    const mn = Math.min(0, ...pts), mx = Math.max(...pts, 1);
    return smooth(pts.map((v, i) => [i / (pts.length - 1 || 1) * 120, 34 - (v - mn) / (mx - mn) * 30]));
  }
  function algoCard(p, sel, top) {
    const r = S.byAlgo && S.byAlgo[p.key], b = r && r.best;
    return `<button type="button" class="bq-algo${sel ? ' is-on' : ''}${top ? ' is-top' : ''}" data-v="${esc(p.key)}" aria-pressed="${sel}">
      ${top ? '<span class="bq-algo__badge">Meilleure proposition</span>' : ''}
      <span class="bq-algo__top"><b>${esc(p.name)}</b><svg viewBox="0 0 120 36" aria-hidden="true"><path d="${spark(p)}"/></svg></span>
      <span class="bq-algo__sum">${p.avgWin >= 4 ? 'Gagne gros mais plus rarement : des séries de stops plus longues.' : 'Gagne plus souvent, des creux plus courts.'} ${nf(p.winrate * 100, 0)} % de gagnants, ${nf(p.avgWin, 1)} R par gain, ${nf(p.perMonth, 0)} signaux par mois.</span>
      <span class="bq-algo__prop">${b ? `${ring(b.pReach, 'de réussite')}<span><small>Sa meilleure proposition</small><b>${rk(b.legs[0].cfg.risk)} % par position</b><span>médiane ${eur(b.p50)} en ${dur(S.a.months)}</span></span>`
        : r ? '<span class="bq-algo__none">Aucun réglage ne tient avec ces réponses.</span>' : '<span class="bq-algo__calc"><i></i>Calcul de sa proposition…</span>'}</span>
    </button>`;
  }

  function question() {
    const a = S.a, k = STEPS[S.step], acc = a.account || 'perso';
    const opt = (v, t, d, on) => `<button type="button" class="bq-opt${on ? ' is-on' : ''}" data-v="${v}" aria-pressed="${!!on}"><b>${t}</b>${d ? `<small>${d}</small>` : ''}</button>`;
    if (k === 'account') return { h: 'Où BERICH va trader ?', p: 'Les règles de risque ne sont pas les mêmes avec ton argent et avec un compte de propfirm.',
      body: `<div class="bq-opts bq-opts--2">${opt('perso', 'Mon compte perso', 'Ton argent, chez un broker.', a.account === 'perso')}${opt('propfirm', 'Une propfirm', 'Un compte financé, avec une perte maximum imposée.', a.account === 'propfirm')}</div>` };
    if (k === 'capital') return { h: acc === 'propfirm' ? 'Quelle taille de compte ?' : 'Avec combien tu démarres ?', p: acc === 'propfirm' ? 'Le capital du challenge ou du compte financé.' : `Le montant que BERICH va faire travailler, ${eur(MIN_CAP)} minimum.`, input: 'capital',
      body: `<label class="bq-num"><input type="text" inputmode="numeric" id="bqIn" value="${a.capital ? a.capital.toLocaleString('fr-FR') : ''}" placeholder="${acc === 'propfirm' ? '100 000' : '1 000'}" aria-label="Capital de départ en euros" autocomplete="off"><span>€</span></label>
        <div class="bq-chips">${CAP[acc].map((v) => `<button type="button" class="bq-chip${a.capital === v ? ' is-on' : ''}" data-v="${v}">${eur(v)}</button>`).join('')}</div>` };
    if (k === 'target') return { h: 'Jusqu’où tu veux l’emmener ?', p: acc === 'propfirm' ? `L’objectif de ton compte de ${eur(a.capital)}.` : `En partant de ${eur(a.capital)}, sur un an au plus. ×3 est l’objectif le plus réaliste, ×6 le maximum.`, input: 'target',
      body: `<div class="bq-mults">${TGT[acc].map(([m, l, d]) => { const v = Math.round(a.capital * m); return `<button type="button" class="bq-mult${a.target === v ? ' is-on' : ''}${d === 'le plus réaliste' ? ' is-reco' : ''}" data-v="${v}"><b>${l}</b><span>${eur(v)}</span>${d ? `<small>${d}</small>` : ''}</button>`; }).join('')}</div>
        <label class="bq-num bq-num--sm"><span class="bq-num__k">ou un montant précis</span><input type="text" inputmode="numeric" id="bqIn" value="${a.target && !TGT[acc].some(([m]) => Math.round(a.capital * m) === a.target) ? a.target.toLocaleString('fr-FR') : ''}" placeholder="${Math.round(a.capital * (acc === 'propfirm' ? 1.08 : 3)).toLocaleString('fr-FR')}" aria-label="Objectif en euros" autocomplete="off"><span>€</span></label>` };
    if (k === 'months') return { h: 'En combien de temps ?', p: `Pour passer de ${eur(a.capital)} à ${eur(a.target)}. Un an au plus : au-delà, l’historique ne permet plus de projeter honnêtement.`,
      body: `<div class="bq-opts bq-opts--4">${[[3, '3 mois'], [6, '6 mois'], [9, '9 mois'], [12, '1 an']].map(([v, t]) => opt(v, t, '', a.months === v)).join('')}</div>` };
    if (k === 'tolerance') return acc === 'propfirm'
      ? { h: 'Quelle perte maximum impose ta propfirm ?', p: 'On garde de la marge en dessous, et la perte du jour reste sous 4 %.', body: `<div class="bq-opts bq-opts--2">${PROP.map(([v, t, d]) => opt(v, t, d, a.tolerance === v)).join('')}</div>` }
      : { h: 'Et les pertes passagères ?', p: 'Même un bon plan passe par des creux avant de monter. Lequel te ressemble le plus ?', body: `<div class="bq-opts bq-opts--2">${FEEL.map(([v, t, d]) => opt(v, t, d, a.tolerance === v)).join('')}</div>` };
    const top = S.byAlgo ? bestAlgo() : null;
    return { h: 'Quel algorithme ?', p: S.preps.length > 1 ? 'Chacun a calculé sa meilleure proposition pour tes réponses. Choisis-en un pour voir toutes ses possibilités.' : 'Sa meilleure proposition pour tes réponses. Ouvre-le pour voir toutes ses possibilités.',
      body: `<div class="bq-algos">${S.preps.map((p) => algoCard(p, a.algo === p.key, top === p.key && S.preps.length > 1)).join('')}</div>` };
  }

  function frame(inner, o) {
    o = o || {};
    return `<div class="bq-box" role="dialog" aria-modal="true" aria-labelledby="bqH" tabindex="-1">
      <div class="bq-head"><span class="bq-brand"><img src="assets/logo-berich.png?v=2" alt="">BERICH · ton plan</span>${o.progress != null ? `<span class="bq-step">${String(o.progress + 1).padStart(2, '0')} / ${String(STEPS.length).padStart(2, '0')}</span>` : ''}
        <button type="button" class="bq-x" data-bq="close" aria-label="Fermer"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6"/></svg></button></div>
      ${o.progress != null ? `<div class="bq-bar"><i style="transform:scaleX(${((o.progress + 1) / STEPS.length).toFixed(3)})"></i></div>` : ''}
      <div class="bq-body">${inner}</div>
      ${o.foot ? `<div class="bq-foot">${o.foot}</div>` : ''}</div>`;
  }

  // Changement d'écran sans reconstruire la fenêtre (retour utilisateur : « ça bug puis passe ») : la boîte reste en
  // place, seuls son contenu, son pied et la barre de progression changent ; la barre glisse de l'ancienne valeur à la nouvelle.
  function paint(html) {
    const r = root(), box = r.querySelector('.bq-box');
    if (!box) { r.innerHTML = html; return; }
    const oldBar = box.querySelector('.bq-bar i'), from = oldBar ? oldBar.style.transform : null;
    const t = document.createElement('template'); t.innerHTML = html.trim();
    box.replaceChildren(...t.content.firstElementChild.childNodes);
    const bar = box.querySelector('.bq-bar i');
    if (bar && from) { const to = bar.style.transform; bar.style.transform = from; requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.transform = to; })); }
  }
  const view = { set html(v) { paint(v); } };

  function renderStep() {
    S.busy = false;
    const q = question(), k = STEPS[S.step];
    const canNext = k === 'algo' ? !!(S.a.algo && S.byAlgo && S.byAlgo[S.a.algo] && S.byAlgo[S.a.algo].best) : S.a[k] != null || !!q.input;
    const label = k === 'algo' ? (S.a.algo && prepOf(S.a.algo) ? `Voir les possibilités de ${esc(nameOf(S.a.algo))}` : 'Choisis un algorithme') : 'Continuer';
    view.html = frame(`<div class="bq-q" data-k="${k}"><h2 id="bqH">${q.h}</h2><p class="bq-lead">${q.p}</p>${q.body}<p class="bq-err" id="bqErr" role="alert"></p></div>`,
      { progress: S.step, foot: `${S.step ? `<button type="button" class="bq-back" data-bq="back">${BACK}Retour</button>` : '<span></span>'}<button type="button" class="br-btn" data-bq="next" ${canNext ? '' : 'disabled'}>${label}${ARROW}</button>` });
    const inp = document.getElementById('bqIn');
    if (inp) {
      inp.addEventListener('input', () => { const d = inp.value.replace(/\D/g, ''); inp.value = d ? Number(d).toLocaleString('fr-FR') : ''; root().querySelectorAll('.bq-chip, .bq-mult').forEach((c) => c.classList.toggle('is-on', c.dataset.v === d)); });
      if (k === 'capital') setTimeout(() => inp.focus(), 60);
    }
    const f = root().querySelector('.bq-opt.is-on, .bq-algo.is-on, .bq-mult.is-on') || (k === 'capital' ? null : root().querySelector('.bq-box'));
    if (f) setTimeout(() => f.focus({ preventScroll: true }), 60);
    if (k === 'algo' && !S.byAlgo) setTimeout(() => { computeByAlgo(); if (!S.a.algo || !S.byAlgo[S.a.algo] || !S.byAlgo[S.a.algo].best) S.a.algo = bestAlgo(); if (STEPS[S.step] === 'algo' && !root().hidden) renderStep(); }, 120);
  }

  function commitInput() {
    const k = STEPS[S.step], inp = document.getElementById('bqIn');
    if (!inp) return true;
    const raw = inp.value.replace(/\D/g, '');
    if (k === 'target' && !raw) return S.a.target != null || (document.getElementById('bqErr').textContent = 'Choisis un objectif.', false);
    const v = Number(raw), perso = S.a.account !== 'propfirm';
    const err = (m) => { document.getElementById('bqErr').textContent = m; inp.focus(); return false; };
    if (k === 'capital' && !(v >= MIN_CAP)) return err(`Il faut au moins ${eur(MIN_CAP)} pour que le plan tienne.`);
    if (k === 'target' && !(v > S.a.capital)) return err(`L’objectif doit dépasser ${eur(S.a.capital)}.`);
    if (k === 'target' && perso && v > S.a.capital * MAX_MULT) return err(`Au-delà de ×${MAX_MULT} (${eur(S.a.capital * MAX_MULT)}) en un an, aucun réglage ne tient sans risque démesuré.`);
    S.a[k] = v;
    return true;
  }
  function next() {
    S.busy = false;
    if (!commitInput()) return;
    const k = STEPS[S.step];
    if (k === 'account' && S.a.tolerance != null && !(S.a.account === 'propfirm' ? PROP : FEEL).some(([v]) => v === S.a.tolerance)) S.a.tolerance = null;
    if (k === 'capital' && S.a.target && S.a.target <= S.a.capital) S.a.target = null;
    if (S.a[k] == null) return;
    if (k !== 'algo') { S.byAlgo = null; S.step++; renderStep(); return; }
    showResult(S.a.algo);
  }

  // ---------- Possibilités de l'algorithme choisi
  function calcScreen(text) {
    view.html = frame(`<div class="bq-calc"><div class="bq-calc__orb" aria-hidden="true"><i></i><i></i></div><h2 id="bqH">On calcule ton plan</h2>
      <ul class="bq-calc__steps"><li>${text}</li><li>On essaie 84 réglages de risque par algorithme</li><li>On tire 700 futurs possibles pour chacun</li></ul></div>`);
  }
  function showResult(algo) {
    if (S.byAlgo && S.byAlgo[algo]) { S.a.algo = algo; S.result = S.byAlgo[algo]; S.pick = S.result.best; renderResult(); return; }
    calcScreen(`On rejoue ${S.preps.reduce((s, x) => s + x.n, 0).toLocaleString('fr-FR')} positions réelles`);
    setTimeout(() => { computeByAlgo(); const k = S.byAlgo[algo] && S.byAlgo[algo].best ? algo : bestAlgo() || algo; S.a.algo = k; S.result = S.byAlgo[k]; S.pick = S.result.best; setTimeout(renderResult, 250); }, 300);
  }
  const streakCost = (p, cfg) => 1 - Array.from({ length: p.worstStreak }, (_, i) => (cfg.afterSl && i >= cfg.afterSl ? cfg.newRisk : cfg.risk)).reduce((m, r) => m * (1 - r / 100), 1);
  function whyLines(c, goal) {
    const l = c.legs[0], p = prepOf(l.algo), out = [];
    out.push(`${esc(p.name)} a déjà enchaîné <b>${p.worstStreak} stops</b> : avec ce réglage, cette série coûterait <b>−${nf(streakCost(p, l.cfg) * 100, 1)} %</b>, puis il repart.`);
    if (l.cfg.afterSl) out.push(`Après ${l.cfg.afterSl} stops d’affilée, le risque passe à ${rk(l.cfg.newRisk)} % et revient à ${rk(l.cfg.risk)} % au premier gain : les creux se creusent moins vite.`);
    out.push(`Rejoué sur son historique, ${eur(goal.capital)} seraient devenus <b>${eur(goal.capital * c.hist.mult)}</b>, avec un recul maximum de <b>−${nf(c.hist.maxDd * 100, 1)} %</b>.`);
    if (goal.account === 'propfirm') out.push(`Pire journée passée : −${nf(c.hist.worstDay * 100, 1)} %, sous la limite de perte du jour.`);
    return out;
  }
  function altRow(c, tag) {
    if (!c) return '';
    const on = S.pick === c;
    return `<button type="button" class="bq-alt${on ? ' is-on' : ''}" data-alt="${tag}" aria-pressed="${on}"><span class="bq-alt__tag">${{ best: 'Recommandé', prudent: 'Prudent', bold: 'Ambitieux' }[tag]}</span>
      <span class="bq-alt__cfg">${esc(P.describeCfg(c.legs[0].cfg))}</span>
      <span class="bq-alt__n"><b>${pc(c.pReach)}</b>réussite</span><span class="bq-alt__n"><b>${eur(c.p50)}</b>médiane</span><span class="bq-alt__n"><b>−${Math.round(c.dd50 * 100)} %</b>creux probable</span></button>`;
  }
  function renderResult() {
    const R = S.result, goal = R.goal, c = S.pick;
    if (!c) {
      view.html = frame(`<div class="bq-q"><h2 id="bqH">Aucun réglage ne tient avec ces réponses</h2><p class="bq-lead">Même au risque le plus bas, les creux passés de ${esc(nameOf(S.a.algo))} dépassent ce que tu acceptes. Choisis l’autre algorithme, ou accepte des pertes passagères un peu plus marquées.</p></div>`,
        { foot: `<button type="button" class="bq-back" data-bq="edit">${BACK}Modifier mes réponses</button><span></span>` });
      return;
    }
    const l = c.legs[0], p = prepOf(l.algo), f = P.evaluate([p], [l.cfg], goal, true).fan;
    const alts = [['best', R.best], ['prudent', R.prudent], ['bold', R.bold]].filter(([, x], i, arr) => x && arr.findIndex(([, y]) => y === x) === i);
    const other = S.preps.find((x) => x.key !== l.algo && S.byAlgo && S.byAlgo[x.key] && S.byAlgo[x.key].best);
    const verdict = c.pReach >= 0.65 ? 'Ton objectif est à portée.' : c.pReach >= 0.4 ? 'Ton objectif est jouable, sans garantie.' : c.pReach >= 0.1 ? 'Ton objectif est ambitieux pour ce délai.' : 'Ton objectif est hors de portée dans ce délai.';
    view.html = frame(`<div class="bq-res">
      <span class="br-label">Les possibilités de ${esc(p.name)}</span>
      <h2 id="bqH">${esc(p.name)}, ${rk(l.cfg.risk)} % par position.</h2>
      <p class="bq-lead">${l.cfg.afterSl ? `${rk(l.cfg.newRisk)} % après ${l.cfg.afterSl} stops d’affilée, retour à ${rk(l.cfg.risk)} % au premier gain. ` : ''}${verdict}</p>
      <div class="bq-res__top">
        <div class="bq-res__ring">${ring(c.pReach, 'de réussite')}<p>des futurs simulés touchent <b>${eur(goal.target)}</b> en ${dur(goal.months)}, ${feelOf(goal)}${c.monthsToGoal ? `.<br><span>En ${nf(c.monthsToGoal, 1)} mois en moyenne quand ils y arrivent.</span>` : '.'}</p></div>
        <dl class="bq-res__facts">
          <div><dt>Médiane dans ${dur(goal.months)}</dt><dd>${eur(c.p50)}</dd></div>
          <div><dt>8 fois sur 10, entre</dt><dd>${eur(c.p10)} <small>et</small> ${eur(c.p90)}</dd></div>
          <div><dt>Creux probable en route</dt><dd>−${Math.round(c.dd50 * 100)} % <small>· au pire −${Math.round(c.dd90 * 100)} %</small></dd></div>
        </dl>
      </div>
      <figure class="bq-res__fan">${fanSvg(f, goal)}<figcaption><span><i class="bq-key bq-key--a"></i>8 futurs sur 10</span><span><i class="bq-key bq-key--b"></i>1 sur 2</span><span><i class="bq-key bq-key--m"></i>futur médian</span><span>Tirés de l’historique de ${esc(p.name)}, pas une prévision.</span></figcaption></figure>
      <ul class="bq-why">${whyLines(c, goal).map((x) => `<li>${x}</li>`).join('')}</ul>
      ${R.hints && R.hints.length ? `<div class="bq-hints"><span class="br-label">Pour mieux viser</span>${R.hints.map((h, i) => `<button type="button" class="bq-hint" data-hint="${i}">${esc(h.label)}<i>→</i></button>`).join('')}</div>` : ''}
      <div class="bq-alts"><span class="br-label">Ses autres possibilités</span>${alts.map(([t, x]) => altRow(x, t)).join('')}
        ${other ? `<button type="button" class="bq-switch" data-switch="${esc(other.key)}">Voir plutôt ${esc(other.name)} <b>${pc(S.byAlgo[other.key].best.pReach)} de réussite</b><i>→</i></button>` : ''}</div>
      <p class="bq-note">Une fois validé, l’équipe CHEST rattache ton compte à ${esc(p.name)}, avec ce réglage.</p>
    </div>`, { foot: `<button type="button" class="bq-back" data-bq="algos">${BACK}Choisir un autre algorithme</button><button type="button" class="br-btn" data-bq="save">Valider ce plan${ARROW}</button>` });
    root().querySelector('.bq-body').scrollTop = 0;
  }

  async function save() {
    const c = S.pick, goal = S.result.goal, l = c.legs[0];
    const plan = { v: 2, answers: Object.assign({}, S.a), legs: [{ algo: l.algo, cfg: l.cfg }], algo: l.algo, cfg: l.cfg,
      metrics: { pReach: c.pReach, p10: c.p10, p50: c.p50, p90: c.p90, dd50: c.dd50, dd90: c.dd90, histMult: c.hist.mult, histDd: c.hist.maxDd }, goal, createdAt: new Date().toISOString() };
    const btn = root().querySelector('[data-bq="save"]');
    if (btn) btn.disabled = true;
    try { await S.onSave(plan); close(); } catch (e) { if (btn) btn.disabled = false; const p = document.createElement('p'); p.className = 'bq-err'; p.textContent = e.message || 'Enregistrement impossible.'; btn.parentNode.prepend(p); }
  }

  let lastFocus = null;
  function close() { const r = root(); if (!r) return; r.hidden = true; r.innerHTML = ''; document.documentElement.classList.remove('bq-open'); if (lastFocus && lastFocus.focus) lastFocus.focus(); if (S.onClose) S.onClose(); }
  function open(o) {
    S.preps = o.preps; S.onSave = o.onSave; S.onClose = o.onClose; S.a = Object.assign({}, o.answers || {}); S.step = 0; S.result = null; S.pick = null; S.byAlgo = null;
    // Anciennes réponses : durée au plus 1 an, recul en mots.
    if (S.a.months > 12) S.a.months = 12;
    if (S.a.algo === 'auto') S.a.algo = null;
    let r = root();
    if (!r) { r = document.createElement('div'); r.id = 'brQuiz'; r.className = 'bq'; document.body.appendChild(r); }
    lastFocus = document.activeElement;
    r.hidden = false; document.documentElement.classList.add('bq-open');
    if (o.result && S.a.capital && S.a.target && S.a.months && S.a.tolerance) showResult(S.a.algo || null); else renderStep();
  }

  document.addEventListener('click', (e) => {
    const r = root(); if (!r || r.hidden) return;
    if (e.target === r) return close();
    const act = e.target.closest('[data-bq]');
    if (act) {
      const a = act.dataset.bq;
      if (a === 'close') close(); else if (a === 'next') next(); else if (a === 'back') { S.step = Math.max(0, S.step - 1); renderStep(); }
      else if (a === 'edit') { S.step = 0; S.byAlgo = null; renderStep(); } else if (a === 'algos') { S.step = STEPS.length - 1; renderStep(); } else if (a === 'save') save();
      return;
    }
    const alt = e.target.closest('[data-alt]');
    if (alt) { S.pick = S.result[alt.dataset.alt]; renderResult(); return; }
    const sw = e.target.closest('[data-switch]');
    if (sw) { showResult(sw.dataset.switch); return; }
    const h = e.target.closest('[data-hint]');
    if (h) { const g = S.result.hints[Number(h.dataset.hint)].goal; Object.assign(S.a, { months: g.months, tolerance: g.tolerance, target: g.target }); S.byAlgo = null; showResult(S.a.algo); return; }
    const v = e.target.closest('.bq-opt, .bq-chip, .bq-mult, .bq-algo');
    if (v && !S.busy) {
      // Sélection mise à jour sur place (pas de nouveau rendu), puis passage à la question suivante.
      const k = STEPS[S.step], raw = v.dataset.v, nb = root().querySelector('[data-bq="next"]');
      root().querySelectorAll('.bq-opt, .bq-chip, .bq-mult, .bq-algo').forEach((b) => { const on = b === v; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); });
      if (k === 'algo') {
        S.a.algo = raw;
        if (nb) { nb.disabled = !(S.byAlgo && S.byAlgo[raw] && S.byAlgo[raw].best); nb.innerHTML = `Voir les possibilités de ${esc(nameOf(raw))}${ARROW}`; }
        return;
      }
      S.a[k] = k === 'account' ? raw : Number(raw);
      const inp = document.getElementById('bqIn');
      if (k === 'capital') { if (inp) inp.value = Number(raw).toLocaleString('fr-FR'); if (nb) nb.disabled = false; return; }
      if (k === 'target' && inp) inp.value = '';
      if (nb) nb.disabled = false;
      S.busy = true;
      setTimeout(next, 220);
    }
  });
  document.addEventListener('keydown', (e) => {
    const r = root(); if (!r || r.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'Enter' && e.target.id === 'bqIn') { e.preventDefault(); next(); }
  });

  window.CHESTBerichQuiz = { open, close, fanSvg, ring };
})();
