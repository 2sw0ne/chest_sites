// CHEST 2.0 (2026-11-02) — Vue d'ensemble de l'espace éducateur d'après CHEST-DESIGN-2.0/html-exact/Educateur.html
// (styles en ligne de la maquette). Données : événement chest:edu-render de js/educator.js (GET /edu/overview).
// Les autres vues (membres, notes, portefeuille) et la fiche membre restent celles de educator.js ;
// les onglets passent dans la barre du haut du shell.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MONO = "font-family: 'JetBrains Mono', ui-monospace, monospace;";
  // montants en centimes et taux en pourcentage, comme GET /edu/overview (js/educator.js)
  const eur = (v, d) => (Number(v || 0) / 100).toLocaleString('fr-FR', { minimumFractionDigits: d == null ? 0 : d, maximumFractionDigits: d == null ? 0 : d }) + ' €';
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const third = (r) => Math.abs(r - 100 / 3) < 0.5;
  const rateTxt = (r) => (third(r) ? 'Un tiers' : Math.round(r) + ' %');

  // ---------- onglets dans la barre du haut ----------
  const VIEWS = [['overview', 'Vue d’ensemble', ''], ['members', 'Mes membres', 'edCount'], ['notes', 'Notes', 'edNotesCount'], ['wallet', 'Portefeuille', '']];
  function current() { const b = document.querySelector('#edNav [aria-selected="true"]'); return b ? b.dataset.view : 'overview'; }
  function paintTabs() {
    const T = window.parent !== window && window.parent.CHESTTopbar;
    if (!T) return;
    const cur = current();
    const slot = T.set(window, `<div role="tablist" aria-label="Vues de l'espace éducateur" style="display: flex; gap: 2px; padding: 3px; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 999px; background: rgba(255, 255, 255, 0.024);">${VIEWS.map(([k, l, c]) => `<button type="button" role="tab" data-ed2-view="${k}" aria-selected="${cur === k}" style="height: 30px; padding: 0px 13px; border: 0px; border-radius: 999px; background: ${cur === k ? 'rgba(255, 255, 255, 0.08)' : 'transparent'}; box-shadow: ${cur === k ? 'rgba(252, 18, 131, 0.45) 0px 0px 0px 1px inset' : 'none'}; color: ${cur === k ? 'rgb(246, 246, 247)' : 'rgb(155, 155, 161)'}; font: inherit; font-size: 12.5px; font-weight: ${cur === k ? 600 : 400}; cursor: pointer;">${l}${c && $(c) && $(c).textContent ? ` <small style="${MONO} font-size: 10px; color: rgb(122, 122, 130);">${esc($(c).textContent)}</small>` : ''}</button>`).join('')}</div>`);
    if (!slot) return;
    slot.querySelectorAll('[data-ed2-view]').forEach((b) => b.addEventListener('click', () => {
      const t = document.querySelector(`#edNav [data-view="${b.dataset.ed2View}"]`);
      if (t) t.click();
      paintTabs();
    }));
  }
  document.addEventListener('click', (e) => { if (e.target.closest('#edNav [data-view], [data-goto]')) setTimeout(paintTabs, 0); });

  // ---------- vue d'ensemble : héros de la commission du mois (le reste = blocs d'origine de educator.js) ----------
  function render({ D }) {
    const w = D.wallet, now = new Date();
    const mk = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const m = (D.monthly || []).find((x) => x.month === mk) || { signups: 0, commission: 0 };
    const hold = w.holdDays || 14;
    const rate = (Math.round(D.rate * 10) / 10).toString().replace('.', ',');
    $('ed2').innerHTML = `
      <section style="position: relative; isolation: isolate; display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 14px 0px 6px; text-align: center;">
        <div class="ghost" aria-hidden="true" style="position: absolute; left: 50%; top: -20px; transform: translateX(-50%); z-index: -1; pointer-events: none; white-space: nowrap; font-size: 200px; font-weight: 700; letter-spacing: -0.06em; line-height: 1; background: linear-gradient(rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0) 78%); -webkit-background-clip: text; background-clip: text; color: transparent;">Éducateur</div>
        <span style="${MONO} font-size: 10.5px; letter-spacing: 0.24em; text-transform: uppercase; color: rgb(122, 122, 130);">01 — Ta commission de ${MONTHS[now.getMonth()]}</span>
        <span style="font-size: 96px; line-height: 1; padding-bottom: 0.04em; font-weight: 700; letter-spacing: -0.055em; font-variant-numeric: tabular-nums; background: linear-gradient(180deg, #ffffff 10%, #ffd9c2 50%, #f9a45e); -webkit-background-clip: text; background-clip: text; color: transparent;">${eur(m.commission)}</span>
        <p style="max-width: 560px; margin: 4px 0px 0px; font-size: 13px; line-height: 1.6; color: rgb(155, 155, 161);">${rateTxt(D.rate)} des ventes encaissées grâce à tes membres${m.signups ? ` · <b style="color: rgb(246, 246, 247);">${m.signups}</b> nouveau${m.signups > 1 ? 'x' : ''} ce mois` : ''}. Retirable ${hold} jours après chaque paiement.</p>
        <span style="margin-top: 6px; display: inline-flex; align-items: center; gap: 8px; height: 32px; padding: 0px 14px; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.1); background: rgba(255, 255, 255, 0.03); font-size: 12px; color: rgb(155, 155, 161);">Ta commission <b style="font-size: 14px; background: linear-gradient(135deg, #fc1283, #f9a45e); -webkit-background-clip: text; background-clip: text; color: transparent;">${rate} %</b> des ventes de tes membres</span>
      </section>`;
    document.body.classList.add('ed2-on');
    paintTabs();
  }

  // ---------- Mes membres : chiffres, recherche et filtre au-dessus du tableau (maquette Edu-Membres.html) ----------
  let filter = 'all', query = '', members = [];
  function members2(D) {
    members = D.members || [];
    const box = $('edMembers');
    if (!box) return;
    let top = $('ed2m');
    if (!top) { top = document.createElement('div'); top.id = 'ed2m'; top.className = 'ed2m'; box.parentNode.insertBefore(top, box); }
    const t = D.totals, pending = members.filter((x) => x.berichPending).length;
    const stat = (k, v, c) => `<div class="ed2m__s"><span>${k}</span><b${c ? ` style="color: ${c};"` : ''}>${v}</b></div>`;
    top.innerHTML = `<div class="ed2m__stats">${stat('Membres', t.members)}${stat('Abonnés', t.active, 'rgb(127, 243, 202)')}${stat('En essai', t.trials, 'rgb(244, 208, 122)')}${stat('BERICH à connecter', pending, pending ? 'rgb(249, 164, 94)' : '')}${stat('Ventes', eur(t.sales))}</div>
      <div class="ed2m__tools"><label class="ed2m__search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><path d="m16 16 4 4"></path></svg><input type="search" id="ed2mQ" placeholder="Chercher un membre" value="${esc(query)}" aria-label="Chercher un membre"></label>
      <div class="ed2m__seg" role="group" aria-label="Filtre">${[['all', 'Tous'], ['active', 'Abonnés'], ['trial', 'Essai'], ['off', 'Inactifs']].map(([k, l]) => `<button type="button" data-ed2f="${k}" aria-pressed="${filter === k}">${l}</button>`).join('')}</div></div>`;
    applyFilter();
  }
  function applyFilter() {
    const q = query.trim().toLowerCase();
    document.querySelectorAll('#edMembers [data-member]').forEach((row) => {
      const x = members.find((m) => String(m.id) === row.dataset.member);
      if (!x) return;
      const st = x.active ? 'active' : x.trial ? 'trial' : 'off';
      row.hidden = !((filter === 'all' || filter === st) && (!q || String(x.name).toLowerCase().includes(q)));
    });
  }
  document.addEventListener('input', (e) => { if (e.target.id === 'ed2mQ') { query = e.target.value; applyFilter(); } });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ed2f]');
    if (!b) return;
    filter = b.dataset.ed2f;
    document.querySelectorAll('[data-ed2f]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    applyFilter();
  });
  document.addEventListener('chest:edu-render', (e) => { render(e.detail); members2(e.detail.D); });
})();
