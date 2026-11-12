// Réduction sur la landing (2026-11-04) : activée par l'admin (Admin → Système, GET /pricing → promo).
// Désactivée : rien ne change. Active : à l'arrivée des cartes à l'écran, l'ancien prix se raye, le nouveau
// descend jusqu'au prix réduit, la pastille « −N % » apparaît avec le code donné par le référent.
// Le code est retenu (chest_promo_code) pour pré-remplir la page des offres.
(function () {
  const duo = document.querySelector('#offres .duo');
  if (!duo) return;
  const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const API = (window.CHEST_CONFIG && window.CHEST_CONFIG.accountsApiUrl) || (local ? 'http://localhost:8081' : 'https://accounts-bridge-production.up.railway.app');
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Math.round(n).toLocaleString('fr-FR').replace(/ /g, ' ');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  fetch(API + '/pricing').then((r) => r.json()).then((d) => {
    const P = d && d.promo;
    if (!P || !P.on || !P.pct) return;
    const offers = d.offers || [];
    const year = (g) => offers.find((o) => o.group === g && o.level === 4 && o.enabled);
    const cards = [['essentiel', duo.querySelector('.o-ess')], ['premium', duo.querySelector('.o-prem')]];
    const anims = [];
    cards.forEach(([g, card]) => {
      const o = year(g);
      if (!card || !o || !o.price) return;
      const full = o.price, now = Math.round(full * (100 - P.pct)) / 100;
      const pm = full / 12, pmNow = now / 12;
      const price = card.querySelector('.o-price'), b = price && price.querySelector('b');
      if (!b) return;
      card.classList.add('has-promo');
      price.insertAdjacentHTML('beforebegin', `<div class="o-promo"><span class="o-promo__chip">−${P.pct} %</span><span class="o-promo__t">avec le code <b>${esc(P.code)}</b> donné par ton référent</span></div>`);
      price.insertAdjacentHTML('afterbegin', `<s class="o-was" aria-label="au lieu de ${fmt(pm)} € par mois">${fmt(pm)} €</s>`);
      b.textContent = fmt(pm) + ' €';
      const f = card.querySelector('.o-full');
      if (f) f.innerHTML = `soit <s>${fmt(full)} €</s> <b>${fmt(now)} €</b> pour un an, payé une fois`;
      anims.push([b, pm, pmNow]);
      card.querySelectorAll('a[href^="/inscription"]').forEach((a) => a.addEventListener('click', () => { try { localStorage.setItem('chest_promo_code', P.code); } catch (e) { /* tant pis */ } }));
    });
    if (!anims.length) return;
    const play = () => {
      duo.classList.add('is-promo-in');
      anims.forEach(([b, from, to]) => {
        if (reduce) { b.textContent = fmt(to) + ' €'; return; }
        const t0 = performance.now() + 450, dur = 900;
        const step = (t) => {
          const k = Math.min(1, Math.max(0, (t - t0) / dur));
          const e = 1 - Math.pow(1 - k, 4);
          b.textContent = fmt(from + (to - from) * e) + ' €';
          if (k < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    };
    if (!('IntersectionObserver' in window)) { play(); return; }
    const io = new IntersectionObserver((ents) => { if (ents.some((x) => x.isIntersecting)) { io.disconnect(); play(); } }, { threshold: 0.35 });
    io.observe(duo);
  }).catch(() => { /* hors ligne : prix normaux */ });
})();
