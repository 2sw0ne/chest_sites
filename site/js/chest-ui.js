/* ============================================================
   CHEST — comportements visuels manquants
   À déposer dans site/js/ et à charger APRÈS nav.js :
     <script src="js/chest-ui.js?v=1"></script>

   Ce fichier ne touche à aucune donnée, aucun store, aucune API.
   Il n'ajoute que des effets de présentation.
   ============================================================ */
(() => {
  'use strict';

  /* ---------- Lueur qui suit le curseur ----------
     Le HTML porte déjà .chest-spot / .chest-spot__layer et le CSS lit
     var(--mx) / var(--my) — mais rien ne les mettait à jour, donc la
     lueur restait figée à sa position par défaut. C'est ce qui manquait.

     La position est écrite sur le conteneur .chest-spot, en pourcentage
     relatif à sa propre boîte, et mise à jour dans un requestAnimationFrame
     pour ne jamais peser sur le défilement. */
  function initSpotlight() {
    const spots = document.querySelectorAll('.chest-spot');
    if (!spots.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!window.matchMedia('(hover: hover)').matches) return; // inutile au doigt

    let pending = null;

    function apply(e) {
      pending = null;
      spots.forEach((spot) => {
        // Le calque déborde volontairement sous la section (pour passer
        // derrière le graphique) : la position doit donc être mesurée sur
        // LE CALQUE, pas sur la section — sinon le pourcentage est calculé
        // sur une autre hauteur et la lueur décroche du curseur.
        const layer = spot.querySelector('.chest-spot__layer') || spot;
        const r = layer.getBoundingClientRect();
        if (!r.width || !r.height) return;
        if (r.bottom < -400 || r.top > window.innerHeight + 400) return;
        // En pixels : insensible à la taille du calque, donc exact même
        // quand il déborde largement de sa section.
        spot.style.setProperty('--mx', (e.clientX - r.left).toFixed(0) + 'px');
        spot.style.setProperty('--my', (e.clientY - r.top).toFixed(0) + 'px');
      });
    }

    window.addEventListener('mousemove', (e) => {
      if (pending) return;
      pending = requestAnimationFrame(() => apply(e));
    }, { passive: true });
  }

  /* ---------- Volet : largeur réelle pendant la transition ----------
     La grille anime grid-template-columns ; les graphiques en <canvas>
     (Chart.js, lightweight-charts) ne se redimensionnent pas tout seuls
     et restent à l'ancienne largeur jusqu'au prochain resize. On leur
     envoie l'évènement une fois l'animation finie. */
  function initShellResize() {
    const shell = document.querySelector('.chest-shell');
    const toggle = document.getElementById('sidebarToggle');
    if (!shell || !toggle) return;

    toggle.addEventListener('click', () => {
      let n = 0;
      const tick = setInterval(() => {
        window.dispatchEvent(new Event('resize'));
        if (++n >= 12) clearInterval(tick); // ~360 ms, couvre la transition .28s
      }, 30);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { initSpotlight(); initShellResize(); });
  } else {
    initSpotlight();
    initShellResize();
  }
})();
