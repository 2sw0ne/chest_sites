// CHEST 2.0 (2026-11-02) — verre liquide des volets, porté en JS simple depuis « Nimbus Liquid Navbar »
// (React/WebGL fourni par l'utilisateur). On garde ce qui fait l'effet sans WebGL :
//  - le filtre SVG de réfraction (feTurbulence → feGaussianBlur → feDisplacementMap, mêmes réglages que Nimbus)
//    appliqué en backdrop-filter sur Chrome / Edge (les seuls à accepter url() dans backdrop-filter) ;
//  - le liseré et le reflet intérieur (box-shadow inset de .nimbus-glass) ;
//  - le reflet spéculaire qui suit le pointeur (spec du shader), en dégradé radial piloté par --lgx / --lgy.
// Ailleurs : flou + saturation classiques. Rien ne bouge avec prefers-reduced-motion.
// Volets concernés : notifications et recherche du shell, calculatrice de lot, confirmation, volet de réglage
// (Compte), volet des scanners, message court. Tout élément [data-lg] ou .c2-lg reçoit aussi l'effet.
(function () {
  if (window.CHESTLiquidGlass) return;
  const doc = document;
  const SEL = '.c2-lg, [data-lg], .c2-notif__panel, .c2-search__list, .lotcalc-modal, .chestconfirm-modal, .drawer, .toast, .sbd';

  const ua = navigator.userAgent;
  const refract = /Chrome\/|Chromium\/|Edg\//.test(ua) && !/Firefox\//.test(ua) && !!(window.CSS && CSS.supports && CSS.supports('backdrop-filter', 'url(#a)'));
  doc.documentElement.classList.toggle('lg-refract', refract);

  function mountFilter() {
    if (doc.getElementById('c2-refract') || !doc.body) return;
    const box = doc.createElement('div');
    box.setAttribute('aria-hidden', 'true');
    box.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    box.innerHTML = '<svg width="0" height="0"><filter id="c2-refract" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">'
      + '<feTurbulence type="fractalNoise" baseFrequency="0.006 0.02" numOctaves="2" seed="7" result="noise"/>'
      + '<feGaussianBlur in="noise" stdDeviation="2" result="soft"/>'
      + '<feDisplacementMap in="SourceGraphic" in2="soft" scale="60" xChannelSelector="R" yChannelSelector="G"/></filter></svg>';
    doc.body.appendChild(box);
  }

  const CSS_TEXT = `
.c2-lg, [data-lg], .c2-notif__panel, .c2-search__list, .lotcalc-modal, .chestconfirm-modal, .drawer, .toast, .sbd{
  --lgx:30%; --lgy:0%;
  background:linear-gradient(160deg, rgba(20,20,24,.62), rgba(9,9,11,.74)) !important;
  -webkit-backdrop-filter:blur(18px) saturate(1.25) brightness(1.06) !important; backdrop-filter:blur(18px) saturate(1.25) brightness(1.06) !important;
  box-shadow:inset 0 1px 1px rgba(255,255,255,.34), inset 0 0 0 1px rgba(255,255,255,.12), 0 24px 60px -18px rgba(0,0,0,.75), 0 2px 6px rgba(0,0,0,.3) !important;
  border-color:rgba(255,255,255,.14) !important;
}
html.lg-refract .c2-lg, html.lg-refract [data-lg], html.lg-refract .c2-notif__panel, html.lg-refract .c2-search__list, html.lg-refract .lotcalc-modal,
html.lg-refract .chestconfirm-modal, html.lg-refract .drawer, html.lg-refract .toast, html.lg-refract .sbd{
  -webkit-backdrop-filter:url(#c2-refract) blur(6px) saturate(1.25) brightness(1.06) !important; backdrop-filter:url(#c2-refract) blur(6px) saturate(1.25) brightness(1.06) !important;
}
.lg-shine{ position:absolute; inset:0; border-radius:inherit; pointer-events:none; z-index:0;
  background:radial-gradient(420px 260px at var(--lgx) var(--lgy), rgba(255,255,255,.10), rgba(255,255,255,0) 60%),
    linear-gradient(115deg, rgba(var(--a1-rgb, 252, 18, 131),.05), rgba(255,255,255,0) 30%, rgba(255,255,255,0) 70%, rgba(var(--a2-rgb, 249, 164, 94),.05)); }
.lg-shine::after{ content:''; position:absolute; top:0; left:8%; right:8%; height:1px; background:linear-gradient(90deg, transparent, rgba(255,255,255,.55), transparent); }
@media (prefers-reduced-motion:reduce){ .lg-shine{ background:linear-gradient(115deg, rgba(var(--a1-rgb, 252, 18, 131),.05), rgba(255,255,255,0) 30%, rgba(255,255,255,0) 70%, rgba(var(--a2-rgb, 249, 164, 94),.05)); } }`;
  function mountCss() {
    if (doc.getElementById('c2-lg-css')) return;
    const st = doc.createElement('style');
    st.id = 'c2-lg-css';
    st.textContent = CSS_TEXT;
    (doc.head || doc.documentElement).appendChild(st);
  }

  // reflet : une couche .lg-shine par volet (ajoutée une fois), déplacée au pointeur
  function dress(el) {
    if (el.__lg || el.classList.contains('toast')) return; // le message court réécrit son contenu à chaque affichage
    el.__lg = true;
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    const sh = doc.createElement('span');
    sh.className = 'lg-shine';
    sh.setAttribute('aria-hidden', 'true');
    el.insertBefore(sh, el.firstChild);
  }
  function scan(root) { (root || doc).querySelectorAll(SEL).forEach(dress); }

  const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf = 0, last = null;
  doc.addEventListener('pointermove', (e) => {
    if (still || e.pointerType !== 'mouse') return;
    last = e;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const el = last.target && last.target.closest && last.target.closest(SEL);
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--lgx', ((last.clientX - r.left) / r.width * 100).toFixed(1) + '%');
      el.style.setProperty('--lgy', ((last.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    });
  }, { passive: true });

  function start() {
    mountCss(); mountFilter(); scan();
    // volets créés plus tard (calculatrice, confirmation, message court…)
    new MutationObserver((list) => {
      list.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) { if (n.matches && n.matches(SEL)) dress(n); scan(n); } }));
    }).observe(doc.body, { childList: true, subtree: true });
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else start();
  window.CHESTLiquidGlass = { refract, scan };
})();
