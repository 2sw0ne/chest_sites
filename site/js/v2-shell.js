/* ============================================================
   CHEST v2 — menu latéral du shell (app.html)
   Une seule lumière qui glisse d'une entrée à l'autre quand on change
   de page, au lieu que chaque entrée s'allume seule. Suit la classe
   .is-active posée par shell.js (rien d'autre à brancher).
   ============================================================ */
(() => {
  'use strict';
  const nav = document.querySelector('.chest-shell .chest-nav');
  if (!nav) return;
  const ind = document.createElement('span');
  ind.className = 'v2-nav-ind';
  ind.setAttribute('aria-hidden', 'true');
  nav.prepend(ind);
  nav.classList.add('has-ind');
  let first = true;
  function place() {
    const act = nav.querySelector('.chest-nav__item.is-active');
    if (!act || act.offsetParent === null) { ind.style.opacity = '0'; return; }
    ind.style.opacity = '1';
    if (first) ind.style.transition = 'none';
    ind.style.transform = `translateY(${act.offsetTop}px)`;
    ind.style.height = act.offsetHeight + 'px';
    if (first) { ind.offsetHeight; ind.style.transition = ''; first = false; }
  }
  new MutationObserver(place).observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'] });
  addEventListener('resize', place);
  // Le menu replié/déplié change la hauteur des entrées
  const shell = document.querySelector('.chest-shell');
  if (shell) new MutationObserver(() => setTimeout(place, 300)).observe(shell, { attributes: true, attributeFilter: ['class'] });
  place();
})();
