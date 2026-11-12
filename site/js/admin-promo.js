// Admin → Système : la réduction sur les offres (2026-11-04, GET /pricing → promo, PUT /promo).
// Éteinte : la landing et les offres restent telles quelles. Allumée : prix barrés + nouveau prix + « −N % »
// avec le code donné par le référent ; le code tapé sur /offres baisse le prix envoyé à Stripe.
(function () {
  const pane = document.querySelector('[data-panel="system"]');
  const A = window.CHESTAccounts;
  if (!pane || !A) return;
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Math.round(n).toLocaleString('fr-FR');
  let P = { on: false, pct: 10, code: 'NOVE10' }, saved = null, ref = 3000;
  const box = document.createElement('article');
  box.className = 'am-panel am-promo';
  pane.appendChild(box);
  const same = () => saved && P.on === saved.on && P.pct === saved.pct && P.code === saved.code;

  function paint() {
    const now = Math.round(ref * (100 - P.pct)) / 100;
    box.innerHTML = `<header class="am-panel__head"><h2 class="am-panel__t">Réduction sur les offres</h2><span class="am-panel__meta">${saved && saved.on ? `active · −${saved.pct} % · ${esc(saved.code)}` : 'désactivée'}</span></header>
      <div class="am-promo__grid">
        <div class="am-promo__set">
          <button type="button" class="am-promo__sw" role="switch" aria-checked="${P.on}" data-pr="on"><i></i><span><b>${P.on ? 'Affichée' : 'Désactivée'}</b><small>${P.on ? 'Landing et page des offres : prix barré, nouveau prix et code.' : 'Les prix restent tels quels partout.'}</small></span></button>
          <div class="am-promo__f"><span class="am-sub">Réduction</span><div class="am-promo__pcts">${[5, 10, 15, 20, 25, 30].map((n) => `<button type="button" class="${P.pct === n ? 'is-on' : ''}" aria-pressed="${P.pct === n}" data-pr-pct="${n}">−${n} %</button>`).join('')}<label class="am-promo__own"><input type="number" min="1" max="90" value="${P.pct}" data-pr="pct" aria-label="Autre pourcentage"><em>%</em></label></div></div>
          <label class="am-promo__f"><span class="am-sub">Code donné par les référents</span><input class="am-promo__code" type="text" maxlength="16" value="${esc(P.code)}" data-pr="code" spellcheck="false" autocomplete="off"></label>
        </div>
        <div class="am-promo__prev${P.on ? '' : ' is-off'}" aria-label="Aperçu sur une carte">
          <span class="am-promo__pk">Aperçu · Premium IV</span>
          <span class="am-promo__chip">−${P.pct} %</span>
          <s>${fmt(ref)} €</s><b>${fmt(now)} €</b>
          <small>avec le code <em>${esc(P.code)}</em> donné par ton référent</small>
        </div>
      </div>
      <div class="am-promo__save"><span class="am-msg" data-pr-msg aria-live="polite"></span><button type="button" class="chest-btn" data-pr="save" ${same() ? 'disabled' : ''}>Enregistrer</button></div>`;
  }
  function msg(t, bad) { const m = box.querySelector('[data-pr-msg]'); if (m) { m.textContent = t; m.style.color = bad ? '#ff4d5e' : '#33e6a6'; } }

  box.addEventListener('click', async (e) => {
    const pct = e.target.closest('[data-pr-pct]');
    if (pct) { P.pct = Number(pct.dataset.prPct); paint(); return; }
    const b = e.target.closest('[data-pr]');
    if (!b) return;
    if (b.dataset.pr === 'on') { P.on = !P.on; paint(); return; }
    if (b.dataset.pr === 'save') {
      b.disabled = true;
      try {
        const r = await fetch(A.apiBase() + '/promo', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + A.getToken() }, body: JSON.stringify(P) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'Enregistrement impossible.');
        P = { on: d.on, pct: d.pct, code: d.code }; saved = { ...P };
        paint(); msg(P.on ? 'Réduction en ligne.' : 'Réduction retirée.');
      } catch (err) { b.disabled = false; msg(err.message, true); }
    }
  });
  box.addEventListener('input', (e) => {
    if (e.target.dataset.pr !== 'code') return;
    P.code = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    e.target.value = P.code;
    box.querySelector('.am-promo__prev em').textContent = P.code;
    const s = box.querySelector('[data-pr="save"]'); if (s) s.disabled = same();
  });
  box.addEventListener('change', (e) => {
    if (e.target.dataset.pr === 'pct') { const n = Math.round(Number(e.target.value)); if (n >= 1 && n <= 90) P.pct = n; paint(); }
  });

  fetch(A.apiBase() + '/pricing').then((r) => r.json()).then((d) => {
    if (d.promo) P = { on: !!d.promo.on, pct: d.promo.pct, code: d.promo.code };
    const p3 = (d.offers || []).find((o) => o.key === 'premium4');
    if (p3 && p3.price) ref = p3.price;
    saved = { ...P }; paint();
  }).catch(() => { saved = { ...P }; paint(); });
  paint();
})();
