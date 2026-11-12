// Audit CHEST (2026-11-12) — page /audit et /audit/<CODE> (ouverte par le QR code de la landing, sur le téléphone).
// On vise un public à guider : où il en est, ce qui le bloque, ce qu'il vise, le temps et le cadre qu'il accepte,
// son capital et l'effort financier confortable → pack conseillé (Premium dès qu'il faut guider, si le budget suit)
// et la durée la plus longue que le budget couvre. Fin : /inscription?ref=CODE&offre=<clé> (+ chest_wanted_offer).
(function () {
  const API = (window.CHEST_CONFIG && window.CHEST_CONFIG.accountsApiUrl) || 'https://accounts-bridge-production.up.railway.app';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const stage = $('auStage');
  const fromPath = (location.pathname.match(/\/audit\/([A-Za-z0-9]{3,12})/) || [])[1];
  let CODE = (new URLSearchParams(location.search).get('code') || fromPath || '').toUpperCase();
  let EDU = '', OFFERS = null, ANS = {}, SEL = null, GROUP = null, WHY = '', pack = null, at = -1;
  const offersP = fetch(API + '/pricing').then((r) => r.json()).then((d) => { OFFERS = (d.offers || []).filter((o) => o.enabled); }).catch(() => { OFFERS = []; });

  const Q = [
    ['stage', 'Où en es-tu aujourd’hui en trading ?', [['new', 'Je n’ai jamais vraiment tradé', 'Je pars de zéro'], ['lose', 'J’ai essayé, je perds plus que je gagne'], ['irreg', 'Je trade, mais sans régularité'], ['pro', 'Je suis rentable, je veux passer à l’échelle']]],
    ['block', 'Qu’est-ce qui te bloque le plus ?', [['start', 'Je ne sais pas par où commencer'], ['method', 'Je n’ai pas de méthode fiable'], ['mind', 'La discipline, la peur, l’impulsivité'], ['time', 'Je n’ai pas le temps de suivre les marchés']]],
    ['goal', 'Ton objectif dans 12 mois ?', [['extra', 'Un complément de revenu régulier'], ['funded', 'Réussir une propfirm et être financé'], ['live', 'Vivre du trading'], ['auto', 'Faire travailler mon capital en automatique', 'Avec BERICH, depuis un VPS']]],
    ['time', 'Combien de temps peux-tu y consacrer chaque semaine ?', [['s', 'Moins de 3 h'], ['m', '3 à 7 h'], ['l', '7 à 15 h'], ['xl', 'Plus de 15 h']]],
    ['frame', 'Es-tu prêt à suivre un cadre ?', [['guided', 'Oui, j’ai besoin d’être guidé', 'Appels, missions, règles de risque'], ['semi', 'Oui, mais je garde mon autonomie'], ['solo', 'Je préfère les outils, sans suivi']]],
    ['capital', 'Ton capital de trading aujourd’hui ?', [['s', 'Moins de 1 000 €'], ['m', '1 000 à 5 000 €'], ['l', '5 000 à 20 000 €'], ['xl', 'Plus de 20 000 €'], ['pf', 'Je passe par des propfirms']]],
    ['budget', 'Pour te former et t’équiper, quel effort est confortable ?', [['m150', 'Jusqu’à 150 € par mois'], ['m300', 'Jusqu’à 300 € par mois'], ['900', 'Un paiement de 450 à 900 €'], ['1700', 'Jusqu’à 1 700 € en une fois'], ['3000', '3 000 € pour une année complète']]],
  ];
  const budgetOf = () => ({ m150: [0, 150], m300: [0, 300], 900: [900, 0], 1700: [1700, 0], 3000: [Infinity, 0] }[ANS.budget] || [0, 0]);
  const fits = (o) => { const [once, month] = budgetOf(); return o.price <= once || (o.months === 1 && o.price <= month); };
  const ofGroup = (g) => OFFERS.filter((o) => o.group === g).sort((a, b) => b.months - a.months);

  function head(i) {
    $('auStep').textContent = i >= 0 && i < Q.length ? `${String(i + 1).padStart(2, '0')} / ${String(Q.length).padStart(2, '0')}` : '';
    $('auBar').innerHTML = i >= 0 ? Q.map((_, k) => `<i class="${k < i || i >= Q.length ? 'is-done' : ''}"></i>`).join('') : '';
  }
  function screen(html, back) {
    stage.innerHTML = `<div class="au__scr${back ? ' is-back' : ''}">${html}</div>`;
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }

  function codeStep(err) {
    head(-1);
    screen(`<span class="au__k">Accès invité</span><h1>Le code de ton référent</h1>
      <p class="au__lead">CHEST est réservé aux personnes invitées. Ce code débloque les prix et ton audit.</p>
      <form class="au__code" id="auCode"><input name="c" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Code du référent" placeholder="CODE" value="${esc(CODE)}"><button class="au__go" type="submit">Commencer mon audit</button></form>
      <p class="au__err" role="alert">${esc(err || '')}</p>`);
    const f = $('auCode');
    f.addEventListener('submit', (e) => { e.preventDefault(); const c = f.c.value.trim().toUpperCase(); if (c) check(c, f.querySelector('button')); });
  }
  async function check(c, btn) {
    if (btn) btn.disabled = true;
    try {
      const r = await fetch(API + '/ref/' + encodeURIComponent(c));
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(r.status === 429 ? 'Trop d’essais, réessaie dans quelques minutes.' : 'Ce code ne correspond à aucun référent.');
      CODE = c; EDU = d.educator || '';
      try { history.replaceState(null, '', '/audit/' + encodeURIComponent(c)); } catch (e) { /* aperçu local */ }
      intro();
    } catch (err) { codeStep(err.message); }
  }
  function intro() {
    head(-1);
    screen(`<span class="au__k">Ton audit · 2 minutes</span><h1>${EDU ? `${esc(EDU.split(' ')[0])} t’invite sur CHEST.` : 'Bienvenue sur CHEST.'}</h1>
      <p class="au__lead">7 questions simples sur où tu en es et ce que tu vises. On te montre ensuite le pack qui te correspond, avec son prix et tout ce qu’il débloque.</p>
      <div class="au__code"><button type="button" class="au__go" id="auStart">C’est parti</button></div>`);
    $('auStart').addEventListener('click', () => ask(0));
  }
  function ask(i, back) {
    at = i;
    const [key, title, opts] = Q[i];
    head(i);
    screen(`<span class="au__k">Question ${i + 1}</span><h1>${esc(title)}</h1>
      <div class="au__opts" role="radiogroup" aria-label="${esc(title)}">${opts.map(([v, l, s], k) => `<button type="button" role="radio" aria-checked="${ANS[key] === v}" class="au__opt${ANS[key] === v ? ' is-on' : ''}" data-v="${v}" style="--i:${k}"><i class="au__l">${'ABCDE'[k]}</i><span>${esc(l)}${s ? `<small>${esc(s)}</small>` : ''}</span></button>`).join('')}</div>
      ${i ? '<button type="button" class="au__back" id="auBack">← Question précédente</button>' : ''}`, back);
    stage.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => {
      if (stage.dataset.busy) return;
      stage.dataset.busy = '1';
      ANS[key] = b.dataset.v;
      stage.querySelectorAll('[data-v]').forEach((x) => { x.classList.toggle('is-on', x === b); x.setAttribute('aria-checked', String(x === b)); });
      if (navigator.vibrate) try { navigator.vibrate(8); } catch (e) { /* tant pis */ }
      setTimeout(() => { delete stage.dataset.busy; if (i + 1 < Q.length) ask(i + 1); else calc(); }, 260);
    }));
    const bk = $('auBack'); if (bk) bk.addEventListener('click', () => ask(i - 1, true));
  }
  async function calc() {
    head(Q.length);
    screen('<div class="au__calc"><div class="au__ring" aria-hidden="true"></div><span class="au__k">Analyse de tes réponses</span><h1 style="font-size:26px">On prépare ton pack…</h1></div>');
    await Promise.all([offersP, new Promise((r) => setTimeout(r, 1100))]);
    if (!OFFERS.length) { screen('<h1>Les offres ne sont pas disponibles</h1><p class="au__lead">Réessaie dans un instant.</p>'); return; }
    const needGuide = ANS.frame === 'guided' || ['new', 'lose'].includes(ANS.stage) || ['funded', 'live', 'auto'].includes(ANS.goal) || ANS.block === 'mind';
    const canPrem = ofGroup('premium').some(fits);
    GROUP = (needGuide || ANS.frame !== 'solo') && canPrem ? 'premium' : 'essentiel';
    const list = ofGroup(GROUP);
    SEL = (list.find(fits) || list[list.length - 1]).key;
    const GOAL = { extra: 'un complément de revenu régulier', funded: 'réussir une propfirm', live: 'vivre du trading', auto: 'faire travailler ton capital en automatique' };
    const BLOCK = { start: 'savoir par où commencer', method: 'une méthode fiable', mind: 'la discipline et la gestion des émotions', time: 'du temps pour suivre les marchés' };
    WHY = GROUP === 'premium'
      ? `Tu vises <b>${GOAL[ANS.goal] || 'la régularité'}</b> et ce qui te manque, c’est <b>${BLOCK[ANS.block] || 'un cadre'}</b>. Premium t’apporte un éducateur, une méthode, School et BERICH, en plus de toute la plateforme.`
      : `${needGuide ? 'Premium dépasse l’effort que tu juges confortable pour l’instant. ' : ''}Tu veux avancer en autonomie : <b>Essentiel</b> te donne toute la plateforme et ses outils.`;
    result();
  }
  function recoOf(g) { const l = ofGroup(g); return (l.find(fits) || l[l.length - 1]).key; }
  function cta() {
    const sel = OFFERS.find((o) => o.key === SEL);
    return { href: `/inscription?ref=${encodeURIComponent(CODE)}&offre=${encodeURIComponent(SEL)}`, label: `Rejoindre CHEST ${sel && sel.group === 'premium' ? 'Premium' : 'Essentiel'}`,
      onClick: () => { try { localStorage.setItem('chest_wanted_offer', SEL); } catch (e) { /* tant pis */ } } };
  }
  function result() {
    head(-1);
    $('au').classList.add('is-wide');
    screen(`<div class="au__res"><span class="au__k">Ton pack</span><h1>Voilà ce qui te correspond.</h1><p class="au__why">${WHY}</p><div id="auPack"></div>
      <p class="au__fine">Paiement sécurisé après l’inscription. Abonnement renouvelé automatiquement, résiliable à tout moment. Le trading comporte un risque de perte en capital ; CHEST ne garantit aucun gain.</p></div>`);
    pack = CHESTPack.mount($('auPack'), {
      mode: 'result', offers: OFFERS, sel: SEL, reco: recoOf(GROUP), fits, cta: cta(),
      onPick: (k) => { SEL = k; pack.update({ sel: SEL, cta: cta() }); },
      onSwitch: (g) => { GROUP = g; SEL = recoOf(g); pack.update({ sel: SEL, reco: SEL, cta: cta() }); },
    });
  }

  if (CODE) check(CODE); else codeStep();
})();
