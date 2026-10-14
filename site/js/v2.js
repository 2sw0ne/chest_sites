/* ============================================================
   CHEST v2 — mouvement commun à toutes les pages de l'app
   (La lumière qui suivait la souris a été retirée : seul le Dashboard
   garde la sienne, celle d'origine — retour utilisateur.)
   2. Apparition des blocs au défilement (au-dessus de la ligne de
      flottaison : en cascade dès le chargement)
   3. Chiffres qui défilent jusqu'à leur valeur quand ils changent
   Rien ne s'anime si l'appareil demande moins de mouvement.
   Chargé en fin de <body>, après les scripts de la page.
   ============================================================ */
(() => {
  'use strict';
  const body = document.body;
  if (!body || !body.dataset.page) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.add('v2-js');

  // ---------- 2. Apparition au défilement ----------
  const main = document.querySelector('.chest-main > main');
  if (main && !reduce && 'IntersectionObserver' in window) {
    const skip = (el) => el.hidden || /overlay|modal/.test(el.className || '') || el.getAttribute('role') === 'dialog'
      || el.hasAttribute('aria-modal') || el.tagName === 'SCRIPT' || el.tagName === 'TEMPLATE';
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: .04 });
    let firstFold = 0;
    [...main.children].forEach((el) => {
      if (skip(el)) return;
      // Un bloc qui contient une fenêtre fixe ne doit pas être translaté (sinon la fenêtre se cale sur lui)
      el.classList.add('v2-r');
      if (el.querySelector('[class*="overlay"], [role="dialog"], [aria-modal], .drawer')) el.classList.add('v2-r--fade');
      const top = el.getBoundingClientRect().top;
      if (top < innerHeight * .92) {
        el.style.transitionDelay = (Math.min(firstFold++, 6) * 70) + 'ms';
        requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
        setTimeout(() => { el.style.transitionDelay = ''; }, 1400);
      } else {
        io.observe(el);
      }
    });
    // Filet de sécurité : rien ne reste invisible (contenu ajouté, onglet en arrière-plan…)
    setTimeout(() => main.querySelectorAll(':scope > .v2-r:not(.is-in)').forEach((el) => {
      if (el.getBoundingClientRect().top < innerHeight) el.classList.add('is-in');
    }), 2500);
  }

  // ---------- 3. Chiffres qui défilent ----------
  const COUNT_SEL = '.chest-kpi__val, .chest-hero-num, .dv2-facts dd, .jr-curve__total, [data-v2-count]';
  const NUM_RE = /[-+−]?\d[\d\s  .,]*\d|[-+−]?\d/;
  // Lit « $118 580,00 », « +3.0 », « -1,3 », « 14052.1 » : un séparateur présent une seule fois
  // est la virgule décimale ; présent plusieurs fois, c'est un séparateur de milliers.
  function parseToken(tok) {
    const t = tok.replace(/[\s  ]/g, '').replace('−', '-');
    const nc = (t.match(/,/g) || []).length, nd = (t.match(/\./g) || []).length;
    let decChar = '';
    if (nc && nd) decChar = t.lastIndexOf(',') > t.lastIndexOf('.') ? ',' : '.';
    else if (nc === 1) decChar = ',';
    else if (nd === 1) decChar = '.';
    let intPart = t, frac = '';
    if (decChar) { const i = t.lastIndexOf(decChar); intPart = t.slice(0, i); frac = t.slice(i + 1); }
    intPart = intPart.replace(/[.,]/g, '');
    const v = parseFloat(intPart + (frac ? '.' + frac : ''));
    const gm = tok.match(/\d([\s  .,])\d{3}(?!\d)/);
    const group = gm && gm[1] !== decChar ? gm[1] : '';
    return { v, dec: frac.length, decChar: decChar || ',', group, sign: /^\s*\+/.test(tok) };
  }
  function fmt(v, p) {
    const neg = v < 0; let a = Math.abs(v);
    let s = a.toFixed(p.dec);
    let [i, f] = s.split('.');
    if (p.group) i = i.replace(/\B(?=(\d{3})+(?!\d))/g, p.group);
    return (neg ? '-' : (p.sign ? '+' : '')) + i + (p.dec ? p.decChar + f : '');
  }
  const easeOut = (t) => 1 - Math.pow(1 - t, 4);
  function animateEl(el, fromText, toText) {
    const m = NUM_RE.exec(toText);
    if (!m) return;
    const p = parseToken(m[0]);
    if (!isFinite(p.v)) return;
    const fm = fromText ? NUM_RE.exec(fromText) : null;
    const from = fm ? parseToken(fm[0]).v : 0;
    if (!isFinite(from) || from === p.v) return;
    const pre = toText.slice(0, m.index), post = toText.slice(m.index + m[0].length);
    const t0 = performance.now(), dur = 900;
    el.__v2run = (el.__v2run || 0) + 1;
    const run = el.__v2run;
    const step = (now) => {
      if (run !== el.__v2run) return;
      const k = Math.min(1, (now - t0) / dur);
      const v = from + (p.v - from) * easeOut(k);
      // Le texte écrit ici est mémorisé : l'observateur (asynchrone) le reconnaît et ne relance rien.
      const out = k < 1 ? pre + fmt(v, p) + post : toText;
      el.__v2last = out;
      el.textContent = out;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  if (!reduce && 'MutationObserver' in window) {
    const watched = new WeakSet();
    const watch = (el) => {
      if (watched.has(el)) return;
      watched.add(el);
      el.__v2last = el.textContent;
      new MutationObserver(() => {
        const txt = el.textContent;
        if (txt === el.__v2last) return;
        const prev = el.__v2last; el.__v2last = txt;
        if (el.children.length) return; // structure riche : on ne touche pas
        animateEl(el, prev, txt);
      }).observe(el, { childList: true, characterData: true, subtree: true });
    };
    document.querySelectorAll(COUNT_SEL).forEach(watch);
    // Les blocs rendus plus tard (innerHTML) : on rattrape leurs chiffres et on les anime une fois
    new MutationObserver((muts) => {
      muts.forEach((mu) => mu.addedNodes.forEach((n) => {
        if (n.nodeType !== 1) return;
        const els = n.matches && n.matches(COUNT_SEL) ? [n] : [...n.querySelectorAll(COUNT_SEL)];
        els.forEach((el) => {
          if (watched.has(el)) return;
          watch(el);
          if (!el.children.length && el.textContent && el.getBoundingClientRect().top < innerHeight * 1.2) animateEl(el, '', el.textContent);
        });
      }));
    }).observe(main || body, { childList: true, subtree: true });
  }

})();
