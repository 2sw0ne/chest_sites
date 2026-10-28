// CHEST — relief au survol (2026-10-29). Tout élément [data-tilt="N"] s'incline vers la souris (N = angle max en degrés)
// et reçoit --px / --py (-1 → 1, position du pointeur) et --mx / --my (en %) pour un reflet et une parallaxe en CSS.
// Délégation sur le document : marche aussi sur les cartes redessinées par innerHTML. Souris seulement (pas au tactile),
// rien en prefers-reduced-motion.
(() => {
  'use strict';
  if (!window.matchMedia || !matchMedia('(hover:hover) and (pointer:fine)').matches) return;
  if (matchMedia('(prefers-reduced-motion:reduce)').matches) return;
  let cur = null, last = null;

  function paint() {
    if (!cur || !last) return;
    const r = cur.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (last.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (last.clientY - r.top) / r.height));
    const max = Number(cur.dataset.tilt) || 6;
    const s = cur.style;
    s.setProperty('--rx', `${((0.5 - y) * 2 * max).toFixed(2)}deg`);
    s.setProperty('--ry', `${((x - 0.5) * 2 * max).toFixed(2)}deg`);
    s.setProperty('--px', ((x - 0.5) * 2).toFixed(3));
    s.setProperty('--py', ((y - 0.5) * 2).toFixed(3));
    s.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
    s.setProperty('--my', `${(y * 100).toFixed(1)}%`);
  }
  function release(el) {
    el.classList.remove('is-tilting');
    ['--rx', '--ry', '--px', '--py', '--mx', '--my'].forEach((k) => el.style.removeProperty(k));
  }

  document.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const el = e.target.closest && e.target.closest('[data-tilt]');
    if (el !== cur) {
      if (cur) release(cur);
      cur = el;
      if (cur) cur.classList.add('is-tilting');
    }
    last = e;
    paint(); // pointermove arrive déjà au rythme de l'écran : pas besoin de requestAnimationFrame
  }, { passive: true });
  document.addEventListener('pointerleave', () => { if (cur) release(cur); cur = null; });
  window.addEventListener('blur', () => { if (cur) release(cur); cur = null; });
})();
