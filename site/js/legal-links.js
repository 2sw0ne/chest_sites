// CHEST — Liens légaux en bas de page (2026-10-30). Discrets (gris, petits) mais toujours là : sous le logo du pied
// de page des pages de l'app (.v2-foot__inner, chargé par js/v2.js) et dans tout élément [data-legal-links] des pages
// publiques (connexion, inscription, offres, rejoindre, documents). Ouverts dans un nouvel onglet depuis l'app.
(() => {
  'use strict';
  const LINKS = [['cgu', 'Conditions d’utilisation'], ['cgv', 'Conditions de vente'], ['remboursement', 'Remboursement'], ['confidentialite', 'Confidentialité'],
    ['risques', 'Avertissement sur les risques'], ['mentions-legales', 'Mentions légales'], ['charte-educateur', 'Charte de l’éducateur']];
  const inApp = window.parent !== window || document.body.dataset.page;
  const html = `<nav class="lg-links" aria-label="Documents légaux">${LINKS.map(([s, t]) => `<a href="/legal/${s}"${inApp ? ' target="_blank" rel="noopener"' : ''}>${t}</a>`).join('')}</nav>
    <p class="lg-links__risk">Le trading comporte un risque de perte en capital. CHEST n’est pas un conseiller en investissement.</p>`;
  if (!document.getElementById('lgLinksCss')) {
    const st = document.createElement('style'); st.id = 'lgLinksCss';
    st.textContent = '.lg-links{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 0;max-width:640px;margin:6px auto 0;font-size:11.5px;line-height:1.6}'
      + '.lg-links a{color:var(--chest-ink-3,#5c5c63);text-decoration:none;padding:0 9px;position:relative;transition:color .18s cubic-bezier(.16,1,.3,1)}'
      + '.lg-links a+a::before{content:"";position:absolute;left:-1.5px;top:50%;width:3px;height:3px;margin-top:-1.5px;border-radius:50%;background:currentColor;opacity:.5}'
      + '.lg-links a:hover,.lg-links a:focus-visible{color:var(--chest-ink-2,#9b9ba1);text-decoration:underline;text-underline-offset:3px}'
      + '.lg-links__risk{margin:4px auto 0;max-width:560px;text-align:center;font-size:10.5px;line-height:1.5;color:var(--chest-ink-3,#5c5c63);opacity:.8}';
    document.head.appendChild(st);
  }
  document.querySelectorAll('[data-legal-links]').forEach((el) => { el.innerHTML = html; });
  document.querySelectorAll('.v2-foot__inner').forEach((el) => {
    if (el.querySelector('.lg-links')) return;
    const copy = el.querySelector('.v2-foot__copy');
    const wrap = document.createElement('div'); wrap.innerHTML = html;
    [...wrap.children].forEach((c) => el.insertBefore(c, copy));
  });
})();
