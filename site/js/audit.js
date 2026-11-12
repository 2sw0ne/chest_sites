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

  // Audit v3 (2026-11-12, retour patron : « je ne veux pas savoir ce qu'il veut mais ce qu'il peut ») : on mesure ses
  // capacités (temps, cadre accepté, capital, investissement sur soi), réponse favorable en premier, et la question
  // de l'investissement explique pourquoi s'engager sur la durée. [clé, question, options [valeur, texte, détail, conseillé], intro]
  const Q = [
    ['stage', 'Où en es-tu aujourd’hui en trading ?', [['new', 'Je débute', 'Je pars de zéro'], ['lose', 'J’ai essayé, je perds plus que je gagne'], ['irreg', 'Je gagne parfois, sans régularité'], ['pro', 'Je suis rentable, je veux passer à l’échelle']]],
    ['goal', 'Où veux-tu être dans 12 mois ?', [['live', 'Vivre du trading'], ['funded', 'Être financé par une propfirm'], ['auto', 'Faire travailler mon capital en automatique', 'Avec BERICH, sur un VPS'], ['extra', 'Un complément de revenu régulier']]],
    ['time', 'Combien de temps peux-tu consacrer à ta progression chaque semaine ?', [['xl', 'Plus de 10 h', 'Je m’y mets à fond', 1], ['l', '5 à 10 h'], ['m', '2 à 5 h'], ['s', 'Moins de 2 h']], 'Les membres qui progressent le plus vite sont ceux qui bloquent du temps chaque semaine.'],
    ['frame', 'Es-tu prêt à être accompagné et à suivre un cadre ?', [['guided', 'Oui, je veux être guidé jusqu’au résultat', 'Appels, missions, plan de risque', 1], ['semi', 'Oui, en gardant de l’autonomie'], ['solo', 'Non, seulement les outils']], 'Un cadre et quelqu’un qui te suit, c’est ce qui fait la différence entre essayer et réussir.'],
    ['capital', 'Quel capital peux-tu mettre en jeu sur les marchés ?', [['xl', 'Plus de 20 000 €'], ['l', '5 000 à 20 000 €'], ['m', '1 000 à 5 000 €'], ['s', 'Moins de 1 000 €'], ['pf', 'Je passe par des propfirms', 'Le capital est fourni par la propfirm']]],
    ['budget', 'Quelle est ta capacité d’investissement sur toi ?', [['y', '3 000 €', 'Je m’engage sur une année complète', 1], ['h', '1 700 €', 'Six mois pour poser des bases solides'], ['q', '900 €', 'Trois mois pour démarrer'], ['m300', '300 € par mois'], ['m150', '150 € par mois', 'C’est vraiment mon maximum aujourd’hui']],
      'Plus tu investis dans ta formation, plus tes chances d’aller au bout sont grandes : ceux qui réussissent sont ceux qui s’engagent sur la durée.'],
  ];
  const budgetOf = () => ({ y: [Infinity, 0], h: [1700, 0], q: [900, 0], m300: [0, 300], m150: [0, 150] }[ANS.budget] || [0, 0]);
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
      if (logged()) intro(); else account();
    } catch (err) { codeStep(err.message); }
  }
  const desk = () => matchMedia('(hover: hover) and (min-width: 900px)').matches;
  // Création du compte (2026-11-12) : comme /inscription (prénom, nom, e-mail, mot de passe, code verrouillé,
  // consentement), puis connexion sur cet appareil → le paiement s'ouvrira directement à la fin. Compte existant : connexion.
  const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const field = (n, label, attrs, extra) => `<label class="au__f"><span>${label}</span>${extra ? `<span class="au__pw"><input name="${n}" ${attrs}>${extra}</span>` : `<input name="${n}" ${attrs}>`}</label>`;
  function account(err) {
    head(-1);
    screen(`<span class="au__k">Étape 1 · Ton compte</span><h1>Crée ton compte</h1>
      <p class="au__lead">${EDU ? `Code de <b>${esc(EDU)}</b> validé. ` : ''}Ensuite, 6 questions pour trouver le pack qui te correspond.</p>
      <form class="au__form" id="auSu" novalidate>
        <div class="au__row">${field('fn', 'Prénom', 'autocomplete="given-name" maxlength="60"')}${field('ln', 'Nom', 'autocomplete="family-name" maxlength="60"')}</div>
        ${field('em', 'E-mail', 'type="email" autocomplete="email" inputmode="email" maxlength="160"')}
        ${field('pw', 'Mot de passe <i>· 8 caractères minimum</i>', 'type="password" autocomplete="new-password" minlength="8"', `<button type="button" class="au__eye" data-eye aria-label="Afficher le mot de passe">${EYE}</button>`)}
        <label class="au__f"><span>Code de référent</span><span class="au__lock"><b>${esc(CODE)}</b><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg></span></label>
        <label class="au__ok"><input type="checkbox" name="ok"><span>J’ai 18 ans ou plus et j’accepte les <a href="/legal/cgu" target="_blank" rel="noopener">conditions d’utilisation</a>, la <a href="/legal/confidentialite" target="_blank" rel="noopener">politique de confidentialité</a> et l’<a href="/legal/risques" target="_blank" rel="noopener">avertissement sur les risques</a> du trading.</span></label>
        <button class="au__go" type="submit">Créer mon compte</button>
      </form>
      <p class="au__err" role="alert">${esc(err || '')}</p>
      <button type="button" class="au__back au__swap" id="auLogin">Déjà un compte ? Se connecter</button>`);
    const f = $('auSu');
    stage.querySelector('[data-eye]').addEventListener('click', () => { f.pw.type = f.pw.type === 'password' ? 'text' : 'password'; });
    $('auLogin').addEventListener('click', () => signin());
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const out = stage.querySelector('.au__err'), btn = f.querySelector('.au__go');
      const v = { firstName: f.fn.value.trim(), lastName: f.ln.value.trim(), email: f.em.value.trim(), password: f.pw.value };
      out.textContent = '';
      if (!v.firstName || !v.lastName) { out.textContent = 'Indique ton prénom et ton nom.'; return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) { out.textContent = 'Adresse e-mail invalide.'; return; }
      if (v.password.length < 8) { out.textContent = 'Le mot de passe doit faire au moins 8 caractères.'; return; }
      if (!f.ok.checked) { out.textContent = 'Coche la case pour accepter les conditions.'; return; }
      btn.disabled = true; btn.textContent = 'Création…';
      try {
        await CHESTAccounts.signup(Object.assign({ ref: CODE, acceptTerms: true }, v));
        await CHESTAccounts.login({ email: v.email, password: v.password, remember: true });
        try { sessionStorage.setItem('chest_welcome', '1'); } catch (x) { /* tant pis */ }
        intro(true);
      } catch (x) { out.textContent = x.message; btn.disabled = false; btn.textContent = 'Créer mon compte'; }
    });
  }
  function signin() {
    head(-1);
    screen(`<span class="au__k">Étape 1 · Ton compte</span><h1>Connexion</h1><p class="au__lead">Connecte-toi pour faire ton audit et retrouver ton pack.</p>
      <form class="au__form" id="auLi" novalidate>${field('em', 'E-mail', 'type="email" autocomplete="email" inputmode="email"')}
        ${field('pw', 'Mot de passe', 'type="password" autocomplete="current-password"', `<button type="button" class="au__eye" data-eye aria-label="Afficher le mot de passe">${EYE}</button>`)}
        <button class="au__go" type="submit">Se connecter</button></form>
      <p class="au__err" role="alert"></p>
      <button type="button" class="au__back au__swap" id="auNew">Pas encore de compte ? Le créer</button>`, true);
    const f = $('auLi');
    stage.querySelector('[data-eye]').addEventListener('click', () => { f.pw.type = f.pw.type === 'password' ? 'text' : 'password'; });
    $('auNew').addEventListener('click', () => account());
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = f.querySelector('.au__go');
      btn.disabled = true;
      try { await CHESTAccounts.login({ email: f.em.value.trim(), password: f.pw.value, remember: true }); intro(); }
      catch (x) { stage.querySelector('.au__err').textContent = x.message; btn.disabled = false; }
    });
  }
  function intro(fresh) {
    head(-1);
    screen(`<span class="au__k">Étape 2 · Ton audit · 2 minutes</span><h1>${fresh ? 'Ton compte est prêt.' : EDU ? `${esc(EDU.split(' ')[0])} t’invite sur CHEST.` : 'Bienvenue sur CHEST.'}</h1>
      <p class="au__lead">6 questions sur où tu en es et ce que tu peux mettre en place. On te montre ensuite le pack qui te correspond, avec son prix et tout ce qu’il débloque.</p>
      <div class="au__code"><button type="button" class="au__go" id="auStart">C’est parti</button></div>`);
    $('auStart').addEventListener('click', () => ask(0));
  }
  function ask(i, back) {
    at = i;
    const [key, title, opts, intro] = Q[i];
    head(i);
    screen(`<span class="au__k">Question ${i + 1}</span><h1>${esc(title)}</h1>${intro ? `<p class="au__lead">${esc(intro)}</p>` : ''}
      <div class="au__opts" role="radiogroup" aria-label="${esc(title)}">${opts.map(([v, l, s, rec], k) => `<button type="button" role="radio" aria-checked="${ANS[key] === v}" class="au__opt${ANS[key] === v ? ' is-on' : ''}${rec ? ' is-rec' : ''}" data-v="${v}" style="--i:${k}"><i class="au__l">${'ABCDE'[k]}</i><span>${esc(l)}${s ? `<small>${esc(s)}</small>` : ''}</span>${rec ? '<em class="au__rec">Conseillé</em>' : ''}</button>`).join('')}</div>
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
    const needGuide = ANS.frame !== 'solo' || ['new', 'lose', 'irreg'].includes(ANS.stage) || ['funded', 'live', 'auto'].includes(ANS.goal);
    const canPrem = ofGroup('premium').some(fits);
    GROUP = needGuide && canPrem ? 'premium' : 'essentiel';
    SEL = recoOf(GROUP);
    const GOAL = { extra: 'un complément de revenu régulier', funded: 'être financé par une propfirm', live: 'vivre du trading', auto: 'faire travailler ton capital en automatique' };
    const sel = OFFERS.find((o) => o.key === SEL);
    WHY = GROUP === 'premium'
      ? `Tu vises <b>${GOAL[ANS.goal] || 'la régularité'}</b>. Premium t’apporte un éducateur, une méthode, School et BERICH${sel && sel.months === 12 ? ', sur une année complète pour aller au bout' : ''}.`
      : `${needGuide ? 'Premium dépasse ton budget pour l’instant. ' : ''}<b>Essentiel</b> te donne toute la plateforme et ses outils, en autonomie.`;
    result();
  }
  // la durée la plus longue que le budget permet (sinon la plus courte)
  function recoOf(g) { const l = ofGroup(g); return (l.find(fits) || l[l.length - 1]).key; }
  // Fin (2026-11-12) : le compte est créé avant l'audit. Connecté sur cet appareil → /offres ouvre directement le
  // paiement de l'offre choisie (chest_wanted_offer) ; sinon (audit fait au téléphone par le QR code) → connexion, puis
  // la coque renvoie sur /offres (pas encore d'accès) et le paiement s'ouvre.
  const logged = () => !!(window.CHESTAccounts && CHESTAccounts.isLoggedIn && CHESTAccounts.isLoggedIn());
  function cta() {
    const sel = OFFERS.find((o) => o.key === SEL);
    return { href: logged() ? '/offres' : '/connexion', label: `Rejoindre CHEST ${sel && sel.group === 'premium' ? 'Premium' : 'Essentiel'}`,
      onClick: () => { try { localStorage.setItem('chest_wanted_offer', SEL); } catch (e) { /* tant pis */ } } };
  }
  async function trial(btn) {
    if (!logged()) { location.href = '/connexion'; return; }
    btn.disabled = true; btn.textContent = 'Ouverture…';
    try { await CHESTAccounts.startTrial(); try { sessionStorage.setItem('chest_welcome', '1'); } catch (e) { /* tant pis */ } location.href = '/welcome'; }
    catch (err) { btn.disabled = false; btn.textContent = err.message; }
  }
  function result() {
    head(-1);
    $('auStep').textContent = desk() ? '' : 'TON PACK';
    $('au').classList.add('is-wide');
    screen(`<div class="au__res"><span class="au__k au__k--res">Ton pack · conseillé pour toi</span><h1>Voilà ce qui te correspond.</h1><p class="au__why">${WHY}</p><div id="auPack"></div>
      <p class="au__fine">Paiement sécurisé après l’inscription. Abonnement renouvelé automatiquement, résiliable à tout moment. Le trading comporte un risque de perte en capital ; CHEST ne garantit aucun gain.</p></div>`);
    pack = CHESTPack.mount($('auPack'), {
      mode: 'result', offers: OFFERS, sel: SEL, reco: recoOf(GROUP), fits, cta: cta(),
      onTrial: logged() ? trial : null,
      onPick: (k) => { SEL = k; pack.update({ sel: SEL, cta: cta() }); },
      onSwitch: (g) => { GROUP = g; SEL = recoOf(g); if (!OFFERS.find((o) => o.key === SEL && fits(o))) SEL = ofGroup(g)[0].key; pack.update({ sel: SEL, reco: SEL, cta: cta() }); },
    });
  }

  if (CODE) check(CODE); else codeStep();
})();
