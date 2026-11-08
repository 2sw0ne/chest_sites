// CHEST 2.0 (2026-11-03) — Admin d'après CHEST-DESIGN-2.0/html-exact/Admin*.html :
//  - en tête de chaque vue : étiquette, grand titre, phrase, mot fantôme ; les onglets restent dessous, avec
//    « Rechercher » (vue Membres) et « Prix » (vue Système) à droite ;
//  - dans la barre du haut du shell : « N en ligne », les onglets, puis la période (7 j / 30 j / 90 j / 1 an).
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
    storage: ['Stockage', 'L’espace de chaque compte, ce qu’il coûterait plein et ce qu’il coûte vraiment.'],
  };
  const current = () => { const b = nav.querySelector('[aria-selected="true"]'); return b ? b.dataset.view : 'overview'; };

  // ---------- en-tête de la vue + boutons à droite des onglets ----------
  const bar = nav.closest('.am2-bar');
  const hero = document.createElement('section');
  hero.className = 'am2v-hero';
  bar.parentNode.insertBefore(hero, bar);
  const tools = document.createElement('span');
  tools.className = 'am2v-tools';
  // « Rechercher » seulement sur Membres, « Prix » seulement sur Système (2026-11-04) ; plus de « Offrir un Privilège » ici
  tools.innerHTML = `<a class="am2v-btn2" href="/offres?edit=1" target="_top" title="Modifier les offres et les prix" data-only="system">Prix<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"></path></svg></a>`;
  bar.appendChild(tools);
  tools.addEventListener('click', (e) => {
    const t = e.target.closest('[data-am2]');
    if (t && t.dataset.am2 === 'search') { const q = $('amSearch'); if (q) q.focus(); }
  });
  // période des statistiques : à droite du grand titre (la barre du haut garde « en ligne » + onglets)
  function periodHtml() {
    if (!period || period.hasAttribute('data-off')) return '';
    const days = [...period.querySelectorAll('[data-days]')];
    return `<span class="am2v-period" role="group" aria-label="Période des statistiques">${days.map((b) => { const on = b.classList.contains('is-active'); return `<button type="button" data-am2-days="${b.dataset.days}" aria-pressed="${on}" class="${on ? 'is-on' : ''}">${esc(b.textContent.trim())}</button>`; }).join('')}</span>`;
  }
  function paintHero() {
    const [title, sub] = HEAD[current()] || HEAD.overview;
    tools.querySelectorAll('[data-only]').forEach((x) => { x.hidden = x.dataset.only !== current(); });
    const num = String(Object.keys(HEAD).indexOf(current()) + 1 || 1).padStart(2, '0');
    try { const c = window.parent.document.getElementById('crumbPage'); if (c && window.parent !== window) c.textContent = title; } catch (e) { /* autre origine */ }
    hero.innerHTML = `<div class="am2v-ghost" aria-hidden="true">${esc(title)}</div>
      <div class="am2v-txt"><span class="am2v-lb">${num} — Espace membres</span><h1>${esc(title)}</h1><p>${esc(sub)}</p></div>${periodHtml()}`;
    hero.querySelectorAll('[data-am2-days]').forEach((b) => b.addEventListener('click', () => {
      const t = period.querySelector(`[data-days="${b.dataset.am2Days}"]`);
      if (t) t.click();
    }));
  }

  // ---------- barre du haut du shell : en ligne + période ----------
  const T = window.parent !== window && window.parent.CHESTTopbar;
  const live = $('amLive'), period = $('amPeriod');
  // Comme l'espace éducateur (2026-11-04) : « N en ligne » puis les onglets de l'admin dans la barre du haut,
  // la période à droite. Les onglets d'origine (#amNav) restent dans la page, cachés, et sont actionnés d'ici.
  const PILL = 'height: 30px; padding: 0px 10px; border: 0px; border-radius: 999px; font: inherit; font-size: 12.5px; cursor: pointer; white-space: nowrap;';
  function paintTop() {
    if (!T) return;
    document.documentElement.classList.add('am2v-top');
    const n = ((live && live.textContent) || '').match(/\d+/);
    const cur = current();
    const tabs = [...nav.querySelectorAll('[data-view]')].map((b) => {
      const on = b.dataset.view === cur;
      const small = b.querySelector('small');
      const extra = small && small.textContent.trim();
      const label = b.childNodes[0].textContent.trim();
      return `<button type="button" role="tab" data-am2-view="${b.dataset.view}" aria-selected="${on}" style="${PILL} background: ${on ? 'rgba(var(--fg-rgb, 255, 255, 255), 0.08)' : 'transparent'}; box-shadow: ${on ? 'rgba(var(--a1-rgb, 252, 18, 131), 0.45) 0px 0px 0px 1px inset' : 'none'}; color: ${on ? 'var(--ink, rgb(246, 246, 247))' : 'var(--ink-2, rgb(155, 155, 161))'}; font-weight: ${on ? 600 : 400};">${esc(label)}${extra ? ` <small style="font-family: 'Fragment Mono', ui-monospace, monospace; font-size: 10px; color: var(--ink-3, rgb(122, 122, 130));">${esc(extra)}</small>` : ''}</button>`;
    }).join('');
    const slot = T.set(window, `<span style="display: flex; flex-wrap: nowrap; align-items: center; gap: 8px; min-width: 0;">
      ${n ? `<span title="${n[0]} en ligne maintenant" style="display: inline-flex; flex: none; align-items: center; gap: 7px; height: 36px; padding: 0px 11px; border-radius: 999px; background: rgba(var(--green-rgb, 51, 230, 166), 0.08); box-shadow: rgba(var(--green-rgb, 51, 230, 166), 0.25) 0px 0px 0px 1px inset; font-size: 12px; color: var(--ink-1, rgb(201, 201, 206)); white-space: nowrap;"><i style="width: 7px; height: 7px; border-radius: 999px; background: rgb(var(--green-rgb, 51, 230, 166)); box-shadow: rgba(var(--green-rgb, 51, 230, 166), 0.8) 0px 0px 8px;"></i><b style="color: var(--ink, rgb(246, 246, 247));">${n[0]}</b><span class="am2t-lbl" style="color: var(--ink-2, rgb(155, 155, 161));">en ligne</span></span>` : ''}
      <span role="tablist" aria-label="Vues de l'admin" style="display: flex; gap: 2px; padding: 3px; border: 1px solid rgba(var(--fg-rgb, 255, 255, 255), 0.1); border-radius: 999px; background: rgba(var(--fg-rgb, 255, 255, 255), 0.024);">${tabs}</span>
    </span>`);
    if (!slot) return;
    slot.querySelectorAll('[data-am2-view]').forEach((b) => b.addEventListener('click', () => {
      const t = nav.querySelector(`[data-view="${b.dataset.am2View}"]`);
      if (t) t.click();
    }));
  }

  function paint() { paintHero(); paintTop(); }
  document.documentElement.classList.add('am2v');
  const mo = new MutationObserver(paint);
  mo.observe(nav, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['aria-selected'] });
  if (live) mo.observe(live, { childList: true, characterData: true, subtree: true });
  if (period) mo.observe(period, { subtree: true, attributes: true, attributeFilter: ['class', 'data-off'] });
  paint();
})();
// le shell réécrit le titre de la barre du haut au chargement de la page : on repasse après lui
window.addEventListener('load', () => setTimeout(() => { const n = document.querySelector('#amNav [aria-selected="true"]'); try { const c = window.parent !== window && window.parent.document.getElementById('crumbPage'); if (c && n) c.textContent = n.textContent.replace(/\d+/g, '').trim(); } catch (e) { /* autre origine */ } }, 120));
