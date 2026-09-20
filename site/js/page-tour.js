// CHEST · Visite guidée d'une page — bouton discret "i" (bas gauche, à
// l'opposé de la calculatrice de lots qui occupe déjà le bas droit) qui
// lance une visite pas-à-pas : un élément reste net et éclairé, le reste de
// la page s'assombrit, une bulle explique l'élément, et "Suivant" éclaire
// l'élément suivant. Même principe d'auto-injection que js/lot-calculator.js
// et js/confirm-dialog.js : à inclure sur n'importe quelle page, puis
// appeler CHESTTour.init(steps) une fois le DOM de la page prêt.
//
// steps: [{ selector: '#foo', title: '...', text: '...' }, ...] — un
// sélecteur absent du DOM au moment de la visite (état différent de la
// page) est silencieusement sauté plutôt que de casser la visite.
(() => {
  'use strict';

  const STYLE = `
    .chesttour-btn{
      /* z-index sous le sidebar (80) et son overlay (70, voir layout.css) -
         le bouton doit disparaitre derriere le menu ouvert, pas flotter par-
         dessus (retour direct utilisateur du 2026-09-15). */
      position:fixed; left:24px; bottom:24px; z-index:50; width:40px; height:40px; border-radius:50%;
      border:1px solid var(--line2); background:var(--panel); color:var(--muted); cursor:pointer;
      font:inherit; font-size:15px; font-weight:700; font-style:italic; box-shadow:0 8px 24px rgba(0,0,0,.25);
      transition:color .15s, border-color .15s, transform .15s;
    }
    .chesttour-btn:hover{ color:var(--acc); border-color:var(--acc); transform:translateY(-2px); }

    .chesttour-overlay{
      position:fixed; inset:0; z-index:400; opacity:0; pointer-events:none; transition:opacity .25s ease;
    }
    .chesttour-overlay.is-open{ opacity:1; pointer-events:auto; }
    .chesttour-spotlight{
      position:fixed; z-index:401; border-radius:14px; pointer-events:none;
      box-shadow:0 0 0 9999px rgba(4,4,6,.8);
      transition:top .35s ease, left .35s ease, width .35s ease, height .35s ease;
    }
    .chesttour-tooltip{
      position:fixed; z-index:402; width:min(320px,calc(100vw - 32px)); background:var(--panel);
      border:1px solid var(--line2); border-radius:var(--radius); padding:18px 20px; box-shadow:0 24px 60px rgba(0,0,0,.4);
      transition:top .35s ease, left .35s ease;
    }
    .chesttour-tooltip__step{ font-size:10.5px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--acc); margin-bottom:8px; }
    .chesttour-tooltip__title{ font-size:15px; font-weight:700; margin:0 0 8px; }
    .chesttour-tooltip__text{ font-size:12.5px; color:var(--muted); line-height:1.55; margin:0 0 16px; }
    .chesttour-tooltip__actions{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
    .chesttour-tooltip__skip{ border:none; background:transparent; color:var(--faint); font:inherit; font-size:12px; cursor:pointer; padding:6px 2px; }
    .chesttour-tooltip__skip:hover{ color:var(--muted); }
    .chesttour-tooltip__next{ border:none; cursor:pointer; font:inherit; font-size:12.5px; font-weight:700; padding:9px 18px; border-radius:var(--radius-pill); background:var(--ink); color:var(--bg); }
  `;

  function injectStyles() {
    if (document.getElementById('chesttour-style')) return;
    const style = document.createElement('style');
    style.id = 'chesttour-style';
    style.textContent = STYLE;
    document.head.appendChild(style);
  }

  let overlay, spotlight, tooltip;
  function ensureDom() {
    if (overlay) return;
    injectStyles();
    overlay = document.createElement('div');
    overlay.className = 'chesttour-overlay';
    spotlight = document.createElement('div');
    spotlight.className = 'chesttour-spotlight';
    tooltip = document.createElement('div');
    tooltip.className = 'chesttour-tooltip';
    tooltip.innerHTML = `
      <div class="chesttour-tooltip__step" id="chesttourStep"></div>
      <h3 class="chesttour-tooltip__title" id="chesttourTitle"></h3>
      <p class="chesttour-tooltip__text" id="chesttourText"></p>
      <div class="chesttour-tooltip__actions">
        <button type="button" class="chesttour-tooltip__skip" id="chesttourSkip">Passer</button>
        <button type="button" class="chesttour-tooltip__next" id="chesttourNext">Suivant</button>
      </div>`;
    overlay.appendChild(spotlight);
    overlay.appendChild(tooltip);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeTour(); });
    tooltip.querySelector('#chesttourSkip').addEventListener('click', closeTour);
    tooltip.querySelector('#chesttourNext').addEventListener('click', () => advance(1));
  }

  let activeSteps = [];
  let activeIndex = 0;
  let repositionHandler = null;

  function resolvedSteps() {
    // Ne garde que les etapes dont l'element cible existe ET est reellement
    // visible dans l'etat courant de la page (ex. "Prendre le trade" absent
    // tant qu'aucun signal n'est actif, historique cache si vide) - jamais
    // une bulle pointant vers du vide ou un rectangle 0x0.
    return activeSteps
      .map((s) => ({ ...s, el: document.querySelector(s.selector) }))
      .filter((s) => {
        if (!s.el) return false;
        const r = s.el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
  }

  function placeOn(step, index, total) {
    const rect = step.el.getBoundingClientRect();
    const pad = 8;
    spotlight.style.top = (rect.top - pad) + 'px';
    spotlight.style.left = (rect.left - pad) + 'px';
    spotlight.style.width = (rect.width + pad * 2) + 'px';
    spotlight.style.height = (rect.height + pad * 2) + 'px';

    tooltip.querySelector('#chesttourStep').textContent = `Étape ${index + 1} / ${total}`;
    tooltip.querySelector('#chesttourTitle').textContent = step.title;
    tooltip.querySelector('#chesttourText').textContent = step.text;
    tooltip.querySelector('#chesttourNext').textContent = index === total - 1 ? 'Terminer' : 'Suivant';

    const spaceBelow = window.innerHeight - rect.bottom;
    const tooltipWidth = tooltip.offsetWidth || 320;
    let top = spaceBelow > 200 ? rect.bottom + 16 : rect.top - (tooltip.offsetHeight || 160) - 16;
    top = Math.max(12, Math.min(top, window.innerHeight - 12 - (tooltip.offsetHeight || 160)));
    let left = rect.left + rect.width / 2 - tooltipWidth / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - tooltipWidth - 12));
    tooltip.style.top = top + 'px';
    tooltip.style.left = left + 'px';
  }

  function showStep(steps, index) {
    const step = steps[index];
    step.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Laisse le scroll s'installer avant de mesurer la position reelle -
    // sinon la bulle se cale sur la position d'AVANT le scroll.
    setTimeout(() => placeOn(step, index, steps.length), 260);
  }

  function advance(delta) {
    const steps = resolvedSteps();
    const next = activeIndex + delta;
    if (next >= steps.length) { closeTour(); return; }
    activeIndex = Math.max(0, next);
    showStep(steps, activeIndex);
  }

  function closeTour() {
    overlay.classList.remove('is-open');
    if (repositionHandler) {
      window.removeEventListener('resize', repositionHandler);
      window.removeEventListener('scroll', repositionHandler, true);
      repositionHandler = null;
    }
  }

  function startTour(steps) {
    ensureDom();
    activeSteps = steps;
    const resolved = resolvedSteps();
    if (!resolved.length) return;
    activeIndex = 0;
    overlay.classList.add('is-open');
    showStep(resolved, 0);
    repositionHandler = () => {
      const cur = resolvedSteps();
      if (cur[activeIndex]) placeOn(cur[activeIndex], activeIndex, cur.length);
    };
    window.addEventListener('resize', repositionHandler);
    window.addEventListener('scroll', repositionHandler, true);
  }

  function init(steps) {
    ensureDom();
    if (document.getElementById('chesttourTrigger')) return; // deja initialise sur cette page
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'chesttourTrigger';
    btn.className = 'chesttour-btn';
    btn.setAttribute('aria-label', 'Visite guidée de la page');
    btn.textContent = 'i';
    btn.addEventListener('click', () => startTour(steps));
    document.body.appendChild(btn);
  }

  window.CHESTTour = { init };
})();
