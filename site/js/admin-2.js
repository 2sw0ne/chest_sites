// CHEST 2.0 (2026-11-03) — Admin d'après CHEST-DESIGN-2.0/html-exact/Admin*.html :
//  - en tête de chaque vue : étiquette, grand titre, phrase, mot fantôme ; les onglets restent dessous, avec
//    « Rechercher », « Prix » et « Offrir un Privilège » à droite ;
//  - dans la barre du haut du shell : « N en ligne maintenant » et la période (7 j / 30 j / 90 j / 1 an).
// Toute la logique reste dans js/admin-members.js : ces boutons actionnent les commandes d'origine.
(function () {
  const $ = (id) => document.getElementById(id);
  const nav = $('amNav');
  if (!nav) return;
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const HEAD = {
    overview: ['Vue d’ensemble', 'Les chiffres de CHEST et ce qui demande ton attention.'],
    members: ['Membres', 'Chaque membre, son rang, son accès et son activité.'],
    ranks: ['Rangs', 'La hiérarchie de CHEST, du sommet à la base.'],
    engagement: ['Engagement', 'Les arrivées de la période et l’activité des élèves.'],
    sales: ['Ventes', 'Qui a acheté quoi, quel éducateur l’a amené, ce que reçoit CHEST.'],
    educators: ['Éducateurs', 'Taux, liens d’invitation et demandes de retrait.'],
    system: ['Système', 'Mode de fonctionnement des services et pages en maintenance.'],
  };
  const current = () => { const b = nav.querySelector('[aria-selected="true"]'); return b ? b.dataset.view : 'overview'; };

  // ---------- en-tête de la vue + boutons à droite des onglets ----------
  const bar = nav.closest('.am2-bar');
  const hero = document.createElement('section');
  hero.className = 'am2v-hero';
  bar.parentNode.insertBefore(hero, bar);
  const tools = document.createElement('span');
  tools.className = 'am2v-tools';
  tools.innerHTML = `<button type="button" class="am2v-btn2" data-am2="search"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><path d="m16 16 4 4"></path></svg><span>Rechercher</span><kbd>/</kbd></button>
    <a class="am2v-btn2" href="/offres?edit=1" target="_top" title="Modifier les offres et les prix">Prix<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"></path></svg></a>
    <button type="button" class="am2v-btn" data-am2="gift"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="8.5" width="17" height="4" rx="1"></rect><path d="M5 12.5v7.5h14v-7.5M12 8.5V20M12 8.5c-1.5-3-5-3-5-1s3 1 5 1zm0 0c1.5-3 5-3 5-1s-3 1-5 1z"></path></svg>Offrir un Privilège</button>`;
  bar.appendChild(tools);
  tools.addEventListener('click', (e) => {
    const t = e.target.closest('[data-am2]');
    if (!t) return;
    if (t.dataset.am2 === 'search') { const q = $('amQuick'); if (q) q.click(); }
    if (t.dataset.am2 === 'gift') { const g = $('amGiftBtn'); if (g) g.click(); }
  });
  function paintHero() {
    const [title, sub] = HEAD[current()] || HEAD.overview;
    hero.innerHTML = `<div class="am2v-ghost" aria-hidden="true">${esc(title)}</div>
      <div class="am2v-txt"><span class="am2v-lb">01 — Espace membres</span><h1>${esc(title)}</h1><p>${esc(sub)}</p></div>`;
  }

  // ---------- barre du haut du shell : en ligne + période ----------
  const T = window.parent !== window && window.parent.CHESTTopbar;
  const live = $('amLive'), period = $('amPeriod');
  function paintTop() {
    if (!T) return;
    const n = ((live && live.textContent) || '').match(/\d+/);
    const days = period ? [...period.querySelectorAll('[data-days]')] : [];
    const usesPeriod = period && !period.hasAttribute('data-off');
    const slot = T.set(window, `${n ? `<span style="display: inline-flex; align-items: center; gap: 8px; height: 30px; padding: 0px 12px; border-radius: 999px; background: rgba(51, 230, 166, 0.08); box-shadow: rgba(51, 230, 166, 0.25) 0px 0px 0px 1px inset; font-size: 12px; color: rgb(201, 201, 206);"><i style="width: 7px; height: 7px; border-radius: 999px; background: rgb(51, 230, 166); box-shadow: rgba(51, 230, 166, 0.8) 0px 0px 8px;"></i><b style="color: rgb(246, 246, 247);">${n[0]}</b> en ligne maintenant</span>` : ''}
      ${usesPeriod ? `<span role="group" aria-label="Période des statistiques" style="display: flex; gap: 2px; padding: 3px; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 999px; background: rgba(255, 255, 255, 0.024);">${days.map((b) => { const on = b.classList.contains('is-active'); return `<button type="button" data-am2-days="${b.dataset.days}" aria-pressed="${on}" style="height: 28px; padding: 0px 11px; border: 0px; border-radius: 999px; background: ${on ? 'rgb(246, 246, 247)' : 'transparent'}; color: ${on ? 'rgb(5, 5, 5)' : 'rgb(155, 155, 161)'}; font: inherit; font-size: 12px; font-weight: ${on ? 600 : 400}; cursor: pointer;">${esc(b.textContent.trim())}</button>`; }).join('')}</span>` : ''}`);
    if (!slot) return;
    slot.querySelectorAll('[data-am2-days]').forEach((b) => b.addEventListener('click', () => {
      const t = period.querySelector(`[data-days="${b.dataset.am2Days}"]`);
      if (t) t.click();
    }));
  }

  function paint() { paintHero(); paintTop(); }
  document.documentElement.classList.add('am2v');
  const mo = new MutationObserver(paint);
  mo.observe(nav, { subtree: true, attributes: true, attributeFilter: ['aria-selected'] });
  if (live) mo.observe(live, { childList: true, characterData: true, subtree: true });
  if (period) mo.observe(period, { subtree: true, attributes: true, attributeFilter: ['class', 'data-off'] });
  paint();
})();
