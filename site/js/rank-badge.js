// CHEST — Badges de rang (2026-10-28) : Essentiel I/II/III et Premium I/II/III, hexagone dégradé + chiffre romain.
// Mêmes couleurs que les rangs de l'admin (js/admin-members.js, TIERS). CHESTRank.badge(plan, level, size),
// CHESTRank.chip(plan, level, price) → badge + nom + prix de l'offre.
(() => {
  'use strict';
  const ROMAN = { 1: 'I', 2: 'II', 3: 'III' };
  const COLORS = {
    premium1: ['#ffc59a', '#ff8a4c'], premium2: ['#ffab6b', '#ff4f3a'], premium3: ['#ff6aa8', '#fc1283'], premium: ['#ffab6b', '#ff4f3a'],
    essentiel1: ['#a8f7d9', '#34c08f'], essentiel2: ['#5ff0bd', '#13a274'], essentiel3: ['#3fe0c8', '#0b7f8a'], essentiel: ['#5ff0bd', '#13a274'],
    trial: ['#7ce3f5', '#0f93ad'], offert: ['#9dbcff', '#3f7bff'], none: ['#a0a0a8', '#4a4a52'],
  };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NAMES = { premium: 'Premium', essentiel: 'Essentiel', trial: 'Essai', offert: 'Privilège', allstar: 'Allstar', none: 'Sans offre' };
  let seq = 0;
  function info(plan, level) {
    const key = (plan === 'premium' || plan === 'essentiel') && ROMAN[level] ? plan + level : plan;
    const [c1, c2] = COLORS[key] || COLORS.none;
    return { key, c1, c2, roman: ROMAN[level] || '', name: `${NAMES[plan] || NAMES.none}${ROMAN[level] && NAMES[plan] && (plan === 'premium' || plan === 'essentiel') ? ' ' + ROMAN[level] : ''}` };
  }
  function badge(plan, level, size) {
    const t = info(plan, level), id = 'rkb' + (++seq), s = size || 22;
    const mark = t.roman
      ? `<text x="12" y="15.4" text-anchor="middle" font-family="Instrument Sans, system-ui, sans-serif" font-weight="700" font-size="${t.roman.length > 2 ? 6.6 : t.roman.length > 1 ? 7.6 : 8.6}" fill="#fff" letter-spacing=".2">${t.roman}</text>`
      : '<path d="M8.5 12h7" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/>';
    return `<svg class="rk-badge" width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.c1}"/><stop offset="1" stop-color="${t.c2}"/></linearGradient></defs>
      <path d="M12 1.6 20.9 6.8v10.4L12 22.4 3.1 17.2V6.8z" fill="url(#${id})" stroke="rgba(255,255,255,.35)" stroke-width=".8" stroke-linejoin="round"/>
      <path d="M12 2.6 20 7.2v3.2C15.5 8.6 8.5 8.6 4 10.4V7.2z" fill="rgba(255,255,255,.16)"/>${mark}</svg>`;
  }
  const eur = (n) => Number(n).toLocaleString('fr-FR') + ' €';
  function chip(plan, level, price, active) {
    const t = info(plan, level);
    return `<span class="rk-chip${active === false ? ' is-off' : ''}" style="--c1:${t.c1};--c2:${t.c2}">${badge(plan, level, 20)}<span class="rk-chip__n">${esc(t.name)}</span>${price ? `<span class="rk-chip__p">${eur(price)}</span>` : ''}</span>`;
  }
  // Styles du chip, injectés une fois (utilisés par plusieurs pages).
  const css = '.rk-badge{flex-shrink:0;display:block}.rk-chip{display:inline-flex;align-items:center;gap:7px;height:28px;padding:0 10px 0 4px;border-radius:999px;white-space:nowrap;font-size:12.5px;font-weight:600;color:var(--chest-ink,#f6f6f7);'
    + 'background:linear-gradient(90deg,color-mix(in srgb,var(--c2) 22%,transparent),color-mix(in srgb,var(--c2) 6%,transparent));border:1px solid color-mix(in srgb,var(--c1) 38%,transparent)}'
    + '.rk-chip__p{font-weight:500;color:var(--chest-ink-2,#9b9ba1);font-variant-numeric:tabular-nums}.rk-chip.is-off{filter:grayscale(1);opacity:.6}';
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  window.CHESTRank = { info, badge, chip, ROMAN };
})();
