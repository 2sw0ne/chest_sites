// CHEST 2.0 (2026-11-02) — Admin : les vues (Vue d'ensemble, Membres, Ventes, Éducateurs, Système) passent dans la
// barre du haut du shell, comme la maquette CHEST-DESIGN-2.0/html-exact/Admin.html. Un clic actionne l'onglet
// d'origine de #amNav (js/admin-members.js garde toute la logique des vues).
(function () {
  const T = window.parent !== window && window.parent.CHESTTopbar;
  const nav = document.getElementById('amNav');
  if (!T || !nav) return;
  document.documentElement.classList.add('am2-topbar');
  function paint() {
    const tabs = [...nav.querySelectorAll('.am-nav__tabs [data-view]')].filter((b) => !b.hidden);
    const slot = T.set(window, `<div role="tablist" aria-label="Vues de l'admin" style="display: flex; gap: 2px; padding: 3px; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 999px; background: rgba(255, 255, 255, 0.024);">${tabs.map((b) => {
      const on = b.getAttribute('aria-selected') === 'true';
      const label = b.childNodes[0] ? b.childNodes[0].textContent.trim() : b.textContent.trim();
      return `<button type="button" role="tab" data-am2-view="${b.dataset.view}" aria-selected="${on}" style="height: 30px; padding: 0px 13px; border: 0px; border-radius: 999px; background: ${on ? 'rgba(255, 255, 255, 0.08)' : 'transparent'}; box-shadow: ${on ? 'rgba(252, 18, 131, 0.45) 0px 0px 0px 1px inset' : 'none'}; color: ${on ? 'rgb(246, 246, 247)' : 'rgb(155, 155, 161)'}; font: inherit; font-size: 12.5px; font-weight: ${on ? 600 : 400}; cursor: pointer;">${label.replace(/[<>&"]/g, '')}</button>`;
    }).join('')}</div>`);
    if (!slot) return;
    slot.querySelectorAll('[data-am2-view]').forEach((b) => b.addEventListener('click', () => {
      const t = nav.querySelector(`.am-nav__tabs [data-view="${b.dataset.am2View}"]`);
      if (t) t.click();
    }));
  }
  // l'onglet actif change aussi depuis la page (cartes « Voir les membres », raccourci « / ») : on suit aria-selected
  new MutationObserver(paint).observe(nav, { subtree: true, attributes: true, attributeFilter: ['aria-selected', 'hidden'] });
  paint();
})();
