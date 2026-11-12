// CHEST — Badges de rang (2026-10-28, v2). Essentiel et Premium gardent leur logo d'origine (coche verte, diamant
// orange) ; le niveau change la vivacité de la couleur (III = la plus vive, I = la plus terne) et le chiffre romain est
// posé à côté du logo, dans son coin. Source unique des couleurs et glyphes : admin-members.js s'en sert aussi.
// CHESTRank.badge(plan, level, size), CHESTRank.chip(plan, level, price, active), CHESTRank.corner(svg, roman, size).
(() => {
  'use strict';
  const ROMAN = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };
  const GLYPH = {
    premium: 'M8.6 7.5h6.8l2.6 3.4-6 6.6-6-6.6zM6 10.9h12M10.3 7.5 12 17.5l1.7-10',
    essentiel: 'M7.8 12.4l2.8 2.8 5.6-6',
    trial: 'M8.6 6.5h6.8M8.6 17.5h6.8M9.3 6.5c0 3.4 5.4 3.6 5.4 5.5s-5.4 2.1-5.4 5.5M14.7 6.5c0 3.4-5.4 3.6-5.4 5.5s5.4 2.1 5.4 5.5',
    offert: 'M12 6.2l1.5 4.3 4.3 1.5-4.3 1.5L12 17.8l-1.5-4.3L6.2 12l4.3-1.5z',
    allstar: 'M12 6.3l1.7 3.6 3.9.5-2.9 2.7.7 3.9L12 15.1 8.6 17l.7-3.9-2.9-2.7 3.9-.5z',
    none: 'M8.5 12h7',
  };
  // Même teinte par famille ; plus le rang est haut, plus elle est saturée et lumineuse.
  const COLORS = {
    premium4: ['#ffb36b', '#ff3d1f'], premium3: ['#e9a57d', '#cc5a41'], premium2: ['#c3a594', '#8f5f50'], premium1: ['#a8968c', '#6e5348'], premium: ['#ffab6b', '#ff4f3a'],
    essentiel4: ['#5cffc4', '#00b377'], essentiel3: ['#80d7b7', '#2b9372'], essentiel2: ['#a3c4b8', '#557f70'], essentiel1: ['#97aaa3', '#4c645b'], essentiel: ['#5ff0bd', '#13a274'],
    trial: ['#7ce3f5', '#0f93ad'], offert: ['#9dbcff', '#3f7bff'], allstar: ['#ffe39a', '#d99a1e'], none: ['#a0a0a8', '#4a4a52'],
  };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NAMES = { premium: 'Premium', essentiel: 'Essentiel', trial: 'Essai', offert: 'Privilège', allstar: 'Allstar', none: 'Sans offre' };
  let seq = 0;
  function info(plan, level) {
    const leveled = (plan === 'premium' || plan === 'essentiel') && ROMAN[level];
    const key = leveled ? plan + level : plan;
    const [c1, c2] = COLORS[key] || COLORS.none;
    return { key, c1, c2, glyph: GLYPH[plan] || GLYPH.none, roman: leveled ? ROMAN[level] : '', name: `${NAMES[plan] || NAMES.none}${leveled ? ' ' + ROMAN[level] : ''}` };
  }
  function hex(c1, c2, glyph, size, cls) {
    const id = 'rkb' + (++seq);
    return `<svg class="${cls || 'rk-badge'}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
      <path d="M12 1.6 20.9 6.8v10.4L12 22.4 3.1 17.2V6.8z" fill="url(#${id})" stroke="rgba(255,255,255,.35)" stroke-width=".8" stroke-linejoin="round"/>
      <path d="M12 2.6 20 7.2v3.2C15.5 8.6 8.5 8.6 4 10.4V7.2z" fill="rgba(255,255,255,.16)"/>
      <path d="${glyph}" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  // Chiffre romain dans le coin bas-droit du logo. Sous 26 px, le badge est toujours accompagné du nom (« Premium II »),
  // le chiffre n'y est pas répété.
  function corner(svg, roman, size, c1) {
    if (!roman || size < 26) return svg;
    return `<span class="rk-mark" style="--rk-s:${size}px;--rk-c:${c1}">${svg}<i class="rk-roman">${roman}</i></span>`;
  }
  function badge(plan, level, size) {
    const t = info(plan, level), s = size || 22;
    return corner(hex(t.c1, t.c2, t.glyph, s), t.roman, s, t.c1);
  }
  const eur = (n) => Number(n).toLocaleString('fr-FR') + ' €';
  function chip(plan, level, price, active) {
    const t = info(plan, level);
    return `<span class="rk-chip${active === false ? ' is-off' : ''}" style="--c1:${t.c1};--c2:${t.c2}">${badge(plan, level, 20)}<span class="rk-chip__n">${esc(t.name)}</span>${price ? `<span class="rk-chip__p">${eur(price)}</span>` : ''}</span>`;
  }
  const css = '.rk-badge{flex-shrink:0;display:block}.rk-chip{display:inline-flex;align-items:center;gap:7px;height:28px;padding:0 10px 0 4px;border-radius:999px;white-space:nowrap;font-size:12.5px;font-weight:600;color:var(--chest-ink,#f6f6f7);'
    + 'background:linear-gradient(90deg,color-mix(in srgb,var(--c2) 22%,transparent),color-mix(in srgb,var(--c2) 6%,transparent));border:1px solid color-mix(in srgb,var(--c1) 38%,transparent)}'
    + '.rk-chip__p{font-weight:500;color:var(--chest-ink-2,#9b9ba1);font-variant-numeric:tabular-nums}.rk-chip.is-off{filter:grayscale(1);opacity:.6}'
    + '.rk-mark{position:relative;display:inline-block;flex-shrink:0;width:var(--rk-s);height:var(--rk-s);margin-right:calc(var(--rk-s) * .22);line-height:0;vertical-align:middle}.rk-mark>svg{display:block}'
    + '.rk-roman{position:absolute;right:calc(var(--rk-s) * -.2);bottom:calc(var(--rk-s) * -.06);min-width:calc(var(--rk-s) * .44);padding:0 calc(var(--rk-s) * .07);height:calc(var(--rk-s) * .36);'
    + 'display:inline-flex;align-items:center;justify-content:center;border-radius:999px;font:700 max(9px,calc(var(--rk-s) * .22))/1 "Instrument Sans",system-ui,sans-serif;font-style:normal;letter-spacing:.04em;'
    + 'color:#fff;background:var(--bg-1, #0b0b0d);box-shadow:0 0 0 1.5px var(--rk-c),0 2px 8px rgba(0, 0, 0, calc(.5 * var(--sh-k, 1)))}';
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  window.CHESTRank = { info, badge, chip, corner, hex, ROMAN, GLYPH, COLORS };
})();
