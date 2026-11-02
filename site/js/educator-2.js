// CHEST 2.0 (2026-11-02) — Vue d'ensemble de l'espace éducateur d'après CHEST-DESIGN-2.0/html-exact/Educateur.html
// (styles en ligne de la maquette). Données : événement chest:edu-render de js/educator.js (GET /edu/overview).
// Les autres vues (membres, notes, portefeuille) et la fiche membre restent celles de educator.js ;
// les onglets passent dans la barre du haut du shell.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MONO = "font-family: 'JetBrains Mono', ui-monospace, monospace;";
  const LBL = MONO + ' font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: rgb(122, 122, 130);';
  // montants en centimes et taux en pourcentage, comme GET /edu/overview (js/educator.js)
  const eur = (v, d) => (Number(v || 0) / 100).toLocaleString('fr-FR', { minimumFractionDigits: d == null ? 0 : d, maximumFractionDigits: d == null ? 0 : d }) + ' €';
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const AV = ['#fc1283', '#9dbcff', '#e8b339', '#33e6a6', '#f9a45e', '#c9c9ce'];
  const third = (r) => Math.abs(r - 100 / 3) < 0.5;
  const rateTxt = (r) => (third(r) ? 'Un tiers' : Math.round(r) + ' %');

  // ---------- onglets dans la barre du haut ----------
  const VIEWS = [['overview', 'Vue d’ensemble'], ['members', 'Membres'], ['notes', 'Notes'], ['wallet', 'Retraits']];
  function current() { const b = document.querySelector('#edNav [aria-selected="true"]'); return b ? b.dataset.view : 'overview'; }
  function paintTabs() {
    const T = window.parent !== window && window.parent.CHESTTopbar;
    if (!T) return;
    const cur = current();
    const slot = T.set(window, `<div role="tablist" aria-label="Vues de l'espace éducateur" style="display: flex; gap: 2px; padding: 3px; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 999px; background: rgba(255, 255, 255, 0.024);">${VIEWS.map(([k, l]) => `<button type="button" role="tab" data-ed2-view="${k}" aria-selected="${cur === k}" style="height: 30px; padding: 0px 13px; border: 0px; border-radius: 999px; background: ${cur === k ? 'rgba(255, 255, 255, 0.08)' : 'transparent'}; box-shadow: ${cur === k ? 'rgba(252, 18, 131, 0.45) 0px 0px 0px 1px inset' : 'none'}; color: ${cur === k ? 'rgb(246, 246, 247)' : 'rgb(155, 155, 161)'}; font: inherit; font-size: 12.5px; font-weight: ${cur === k ? 600 : 400}; cursor: pointer;">${l}</button>`).join('')}</div>`);
    if (!slot) return;
    slot.querySelectorAll('[data-ed2-view]').forEach((b) => b.addEventListener('click', () => {
      const t = document.querySelector(`#edNav [data-view="${b.dataset.ed2View}"]`);
      if (t) t.click();
      paintTabs();
    }));
  }
  document.addEventListener('click', (e) => { if (e.target.closest('#edNav [data-view], [data-goto]')) setTimeout(paintTabs, 0); });

  // ---------- vue d'ensemble ----------
  function render({ D, link }) {
    const t = D.totals, w = D.wallet, now = new Date();
    const mk = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const m = (D.monthly || []).find((x) => x.month === mk) || { signups: 0, commission: 0 };
    const name = String(D.educator && D.educator.name || '').split(' ')[0];
    const code = D.codeChosen ? D.invite : '';
    const hold = w.holdDays || 14;
    const kpi = (k, v, n, glow) => `<div class="tile" style="position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 10px; padding: 18px; border-radius: 18px; border: 1px solid rgba(255, 255, 255, 0.08); background: linear-gradient(160deg, rgba(16, 16, 19, 0.75), rgba(9, 9, 11, 0.9));">
          <div aria-hidden="true" style="position: absolute; right: -60px; top: -60px; width: 200px; height: 180px; pointer-events: none; background: radial-gradient(closest-side, ${glow}, transparent);"></div>
          <span style="position: relative; ${LBL}">${k}</span>
          <span style="position: relative; font-size: 30px; font-weight: 700; letter-spacing: -0.03em; font-variant-numeric: tabular-nums;">${v}</span>
          <span style="position: relative; margin-top: auto; font-size: 11.5px; color: rgb(122, 122, 130);">${n}</span></div>`;
    const state = (x) => {
      if (x.berichPending) return ['BERICH à connecter', 'rgb(244, 208, 122)', 'rgba(232, 179, 57, 0.14)'];
      const days = x.endsAt ? Math.ceil((Date.parse(x.endsAt) - Date.now()) / 86400000) : null;
      if (x.active && days != null && days >= 0 && days <= 14) return [`Expire dans ${days} j`, 'rgb(255, 148, 160)', 'rgba(255, 77, 94, 0.12)'];
      if (x.active) return ['Actif', 'rgb(127, 243, 202)', 'rgba(51, 230, 166, 0.12)'];
      if (x.trial) return ['Essai', 'rgb(201, 201, 206)', 'rgba(255, 255, 255, 0.07)'];
      return ['Inactif', 'rgb(122, 122, 130)', 'rgba(255, 255, 255, 0.05)'];
    };
    const rank = (x) => (window.CHESTRank && x.planKey && x.planKey !== 'none' ? CHESTRank.chip(x.planKey, x.level, null, x.active || x.trial) : `<span style="color: rgb(122, 122, 130);">${esc(x.plan || '—')}</span>`);
    const members = D.members.slice(0, 6);
    const pending = D.members.filter((x) => x.berichPending).length;
    $('ed2').innerHTML = `
      <section style="position: relative; isolation: isolate; display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 14px 0px 6px; text-align: center;">
        <div class="ghost" aria-hidden="true" style="position: absolute; left: 50%; top: -20px; transform: translateX(-50%); z-index: -1; pointer-events: none; white-space: nowrap; font-size: 200px; font-weight: 700; letter-spacing: -0.06em; line-height: 1; background: linear-gradient(rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0) 78%); -webkit-background-clip: text; background-clip: text; color: transparent;">Éducateur</div>
        <span style="${MONO} font-size: 10.5px; letter-spacing: 0.24em; text-transform: uppercase; color: rgb(122, 122, 130);">01 — Ta commission de ${MONTHS[now.getMonth()]}</span>
        <span style="font-size: 96px; line-height: 1; padding-bottom: 0.04em; font-weight: 700; letter-spacing: -0.055em; font-variant-numeric: tabular-nums; background: linear-gradient(180deg, #ffffff 10%, #ffd9c2 50%, #f9a45e); -webkit-background-clip: text; background-clip: text; color: transparent;">${eur(m.commission)}</span>
        <p style="max-width: 560px; margin: 4px 0px 0px; font-size: 13px; line-height: 1.6; color: rgb(155, 155, 161);">${rateTxt(D.rate)} des ventes encaissées grâce à tes membres${m.signups ? ` · <b style="color: rgb(246, 246, 247);">${m.signups}</b> nouveau${m.signups > 1 ? 'x' : ''} ce mois` : ''}. Retirable ${hold} jours après chaque paiement.</p>
      </section>

      <section style="display: grid; grid-template-columns: minmax(0px, 1.5fr) repeat(3, minmax(0px, 1fr)); gap: 14px;" class="ed2-row">
        <div style="position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 10px; padding: 20px; border-radius: 20px; border: 1px solid rgba(249, 164, 94, 0.45); background: linear-gradient(135deg, rgba(120, 30, 70, 0.75), rgba(40, 18, 28, 0.9) 55%, rgba(60, 36, 20, 0.85)); box-shadow: rgba(252, 18, 131, 0.25) 0px 20px 50px, rgba(255, 255, 255, 0.18) 1.5px 1.5px 0px inset;">
          <div style="display: flex; align-items: center; gap: 10px;"><img src="assets/logo-chest.png" alt="" style="width: 22px; height: 22px;"><b style="font-size: 13.5px;">CHEST Wallet</b><span style="margin-left: auto; ${MONO} font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255, 255, 255, 0.7);">${esc(name)}</span></div>
          <span style="margin-top: 14px; font-size: 11.5px; color: rgba(255, 255, 255, 0.7);">Retirable maintenant</span>
          <span style="font-size: 40px; line-height: 1; font-weight: 700; letter-spacing: -0.04em; font-variant-numeric: tabular-nums;">${eur(w.available)}</span>
          <div style="display: flex; align-items: center; gap: 12px; margin-top: 6px;">
            <span style="font-size: 11.5px; line-height: 1.45; color: rgba(255, 255, 255, 0.72);">${w.locked ? `+ ${eur(w.locked)} bloqués · retirables sous ${hold} jours` : w.pending ? `${eur(w.pending)} en cours de versement` : `retrait dès ${eur(D.minPayout)}`}</span>
            <button type="button" data-goto="wallet" style="margin-left: auto; height: 36px; padding: 0px 16px; border: 0px; border-radius: 999px; background: rgb(246, 246, 247); color: rgb(5, 5, 5); font: inherit; font-weight: 700; cursor: pointer;">Retirer</button>
          </div>
        </div>
        ${kpi('Membres actifs', String(t.active), m.signups ? `+${m.signups} ce mois` : `${t.members} inscrit${t.members > 1 ? 's' : ''}`, 'rgba(51, 230, 166, 0.16)')}
        ${kpi('Ventes générées', eur(t.sales), 'paiements encaissés par CHEST', 'rgba(249, 164, 94, 0.16)')}
        ${kpi('Ta commission', eur(w.earned), `taux ${third(D.rate) ? '1/3' : Math.round(D.rate) + ' %'} · versée sous ${hold} j`, 'rgba(252, 18, 131, 0.2)')}
      </section>

      ${code ? `<section style="display: flex; flex-wrap: wrap; align-items: center; gap: 14px; padding: 20px 0px; border-top: 1px solid rgba(255, 255, 255, 0.07); border-bottom: 1px solid rgba(255, 255, 255, 0.07);">
        <div style="display: flex; flex-direction: column; gap: 5px;"><span style="${LBL}">02 — Ton lien d’invitation</span><span style="font-size: 12.5px; color: rgb(155, 155, 161);">Le code <b style="color: rgb(246, 246, 247);">${esc(code)}</b> est déjà rempli et verrouillé pour la personne qui l’ouvre.</span></div>
        <div style="margin-left: auto; display: flex; align-items: center; gap: 4px; padding: 4px 4px 4px 14px; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.1); background: rgba(255, 255, 255, 0.03);">
          <code style="${MONO} font-size: 12px; color: rgb(201, 201, 206);">${esc(String(link).replace(/^https?:\/\//, '').replace(/\/[^/]*$/, '/'))}<span style="color: rgb(249, 164, 94);">${esc(code)}</span></code>
          <button type="button" data-ed2-copy style="height: 30px; padding: 0px 12px; border: 0px; border-radius: 999px; background: linear-gradient(135deg, rgb(252, 18, 131), rgb(249, 164, 94)); color: rgb(255, 255, 255); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer;">Copier</button>
        </div>
      </section>` : ''}

      <section style="position: relative; overflow: hidden; border-radius: 18px; border: 1px solid rgba(255, 255, 255, 0.12); background: linear-gradient(160deg, rgba(14, 14, 17, 0.72), rgba(9, 9, 11, 0.86)); box-shadow: rgba(0, 0, 0, 0.45) 0px 18px 44px, rgba(255, 255, 255, 0.14) 1.5px 1.5px 0px inset, rgba(255, 255, 255, 0.04) -1.5px -1.5px 0px inset; padding: 18px 20px 8px;">
        <div style="display: flex; align-items: center; gap: 10px; padding-bottom: 10px;"><span style="${LBL}">${code ? '03' : '02'} — Tes membres</span><span style="margin-left: auto; font-size: 11.5px; color: rgb(155, 155, 161);">${t.active} actif${t.active > 1 ? 's' : ''}${pending ? ` · ${pending} demande${pending > 1 ? 's' : ''} BERICH à traiter` : ''}</span></div>
        ${members.length ? `<div style="overflow-x: auto;"><div style="min-width: 680px;">
          <div style="display: grid; grid-template-columns: 1.3fr 1fr 0.8fr 1.2fr 1fr 0.6fr; gap: 10px; padding: 6px 4px; ${MONO} font-size: 9.5px; letter-spacing: 0.14em; text-transform: uppercase; color: rgb(122, 122, 130); border-bottom: 1px solid rgba(255, 255, 255, 0.07);"><span>Membre</span><span>Rang</span><span>Depuis</span><span>Suivi</span><span>État</span><span style="text-align: right;">Ta part</span></div>
          ${members.map((x, i) => { const [s, c, b] = state(x); return `<button type="button" class="row-h" data-member="${x.id}" style="width: 100%; display: grid; grid-template-columns: 1.3fr 1fr 0.8fr 1.2fr 1fr 0.6fr; gap: 10px; align-items: center; padding: 11px 4px; border: 0px; border-bottom: 1px solid rgba(255, 255, 255, 0.045); background: none; color: inherit; font: inherit; font-size: 12.5px; text-align: left; cursor: pointer;">
            <span style="display: flex; align-items: center; gap: 10px; font-weight: 600;"><span style="width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; font-size: 11px; font-weight: 700; color: rgb(5, 5, 5); background: ${AV[i % AV.length]};">${esc(String(x.name).slice(0, 1).toUpperCase())}</span>${esc(x.name)}</span>
            <span>${rank(x)}</span>
            <span style="color: rgb(155, 155, 161);">${esc(new Date(x.joinedAt).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }))}</span>
            <span style="color: rgb(155, 155, 161);">${x.berichPending ? 'Clé en main demandée' : x.endsAt && x.active ? `jusqu’au ${esc(new Date(x.endsAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }))}` : '—'}</span>
            <span><span style="font-size: 10px; font-weight: 700; letter-spacing: 0.04em; padding: 3px 8px; border-radius: 999px; color: ${c}; background: ${b};">${s}</span></span>
            <span style="text-align: right; font-weight: 700; font-variant-numeric: tabular-nums;">${eur(x.commission)}</span></button>`; }).join('')}
        </div></div>
        ${D.members.length > members.length ? `<button type="button" data-goto="members" style="margin: 10px 0px 8px; height: 32px; padding: 0px 14px; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.12); background: transparent; color: rgb(201, 201, 206); font: inherit; font-size: 12px; cursor: pointer;">Voir les ${D.members.length} membres</button>` : ''}`
        : '<p style="margin: 0px 0px 12px; font-size: 13px; color: rgb(155, 155, 161);">Personne encore. Partage ton lien pour accueillir tes premiers membres.</p>'}
      </section>`;
    document.body.classList.add('ed2-on');
    document.body.classList.toggle('ed2-code', !!code);
    const cp = $('ed2').querySelector('[data-ed2-copy]');
    if (cp) cp.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(link); cp.textContent = 'Copié ✓'; } catch (e) { cp.textContent = 'Sélectionne le lien'; }
      setTimeout(() => { cp.textContent = 'Copier'; }, 1800);
    });
    paintTabs();
  }
  document.addEventListener('chest:edu-render', (e) => render(e.detail));
})();
