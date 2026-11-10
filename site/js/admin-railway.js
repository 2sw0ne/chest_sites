// Admin → Système : facture Railway (2026-11-10, GET /admin/railway).
// Ce qui est déjà consommé sur la période de facturation, et la facture estimée à la fin de la période si on reste
// en Normal, Éco ou Arrêt. Coût horaire de chaque mode = mesuré par les relevés du serveur (toutes les 30 min) ;
// tant qu'un mode n'a pas 3 h de mesure, on prend la moyenne de la période (signalé).
(function () {
  const pane = document.querySelector('[data-panel="system"]');
  const A = window.CHESTAccounts;
  if (!pane || !A) return;
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const usd = (n) => (n == null ? '—' : Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $');
  const day = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const MODES = [['normal', 'Normal'], ['eco', 'Éco'], ['off', 'Arrêt']];
  const box = document.createElement('article');
  box.className = 'am-panel am-rail';
  pane.insertBefore(box, pane.querySelector('.am-grid--sys'));
  let D = null, busy = false;

  function paint() {
    if (!D) { box.innerHTML = '<header class="am-panel__head"><h2 class="am-panel__t">Facture Railway</h2></header><p class="am-empty">Chargement…</p>'; return; }
    if (D.error && !D.configured) { box.innerHTML = `<header class="am-panel__head"><h2 class="am-panel__t">Facture Railway</h2></header><p class="am-empty">${esc(D.error)}</p>`; return; }
    if (!D.configured) {
      box.innerHTML = `<header class="am-panel__head"><h2 class="am-panel__t">Facture Railway</h2><span class="am-panel__meta">à brancher</span></header>
        <ol class="am-rail__steps">
          <li>Sur Railway : <b>Account Settings → Tokens</b>, crée un jeton pour l’espace « 2sw0ne's Projects ».</li>
          <li>Service <b>accounts-bridge</b> → Variables : ajoute <code>RAILWAY_API_TOKEN</code> avec ce jeton (ne le colle nulle part ailleurs).</li>
          <li>Après le redémarrage, la consommation et les estimations s’affichent ici.</li>
        </ol>`;
      return;
    }
    if (D.error) { box.innerHTML = `<header class="am-panel__head"><h2 class="am-panel__t">Facture Railway</h2></header><p class="am-empty">${esc(D.error)}</p>`; return; }
    const total = D.elapsedH + D.leftH, pct = total ? Math.min(100, D.elapsedH / total * 100) : 0;
    const hard = D.limit && D.limit.hard, soft = D.limit && D.limit.soft;
    const cards = MODES.map(([k, l]) => {
      const m = D.modes[k], cur = D.mode === k, over = hard && m.usageEnd != null && m.usageEnd >= hard;
      return `<div class="am-rail__mode${cur ? ' is-cur' : ''}${over ? ' is-over' : ''}">
        <span class="am-rail__mk"><i class="am-sys__dot am-sys__dot--${k}" aria-hidden="true"></i>${l}${cur ? '<em>mode actuel</em>' : ''}</span>
        <b>${usd(m.invoice)}</b>
        <small>facture estimée le ${day(D.end)}</small>
        <span class="am-rail__src">${m.measured ? `≈ ${usd(m.rate * 24)} / jour · mesuré sur ${Math.round(m.hours)} h` : m.invoice == null ? `mesure en cours : il faut 3 h dans ce mode (${Math.round(m.hours * 10) / 10} h pour l’instant)` : 'pas encore mesuré : moyenne de la période (avant optimisations, sans doute trop haut)'}</span>
        ${over ? '<span class="am-rail__warn">dépasserait ta limite stricte : les services s’arrêteraient</span>' : ''}
      </div>`;
    }).join('');
    box.innerHTML = `<header class="am-panel__head"><h2 class="am-panel__t">Facture Railway</h2><span class="am-panel__meta">période du ${day(D.start)} au ${day(D.end)} · <button type="button" class="am-rail__re" data-rail-reload>${busy ? 'Mise à jour…' : 'Actualiser'}</button></span></header>
      <div class="am-rail__now">
        <div><span class="am-sub">Consommé depuis le ${day(D.start)}</span><b>${usd(D.used)}</b><small>facture si la période s’arrêtait aujourd’hui : ${usd(D.invoiceNow)} (abonnement Hobby ${usd(D.plan.price)}, dont ${usd(D.plan.included)} de consommation incluse)</small></div>
        <div class="am-rail__bar" role="img" aria-label="${Math.round(pct)} % de la période écoulée"><i style="transform:scaleX(${(pct / 100).toFixed(3)})"></i><span>${Math.round(pct)} % de la période · reste ${Math.round(D.leftH / 24)} j</span></div>
      </div>
      <div class="am-rail__modes">${cards}</div>
      <p class="am-note">${hard ? `Limite stricte ${usd(hard)}` : 'Aucune limite stricte'}${soft ? ` · alerte e-mail ${usd(soft)}` : ''}. Chaque mode est mesuré pendant qu’il est actif (relevé toutes les 30 min) : quelques heures dans un mode suffisent pour que son estimation devienne fiable.</p>`;
  }
  async function load() {
    busy = true; if (D) paint();
    try {
      const res = await fetch(A.apiBase() + '/admin/railway', { headers: { Authorization: 'Bearer ' + A.getToken() }, cache: 'no-store' });
      const d = await res.json().catch(() => ({}));
      D = res.ok ? d : { configured: d.configured !== false, error: d.error || 'Estimation indisponible pour le moment.' };
    } catch (e) { D = { configured: true, error: 'Estimation indisponible pour le moment.' }; }
    busy = false; paint();
  }
  box.addEventListener('click', (e) => { if (e.target.closest('[data-rail-reload]') && !busy) load(); });
  paint();
  // chargé à la première ouverture de l'onglet Système
  const tab = document.querySelector('[data-view="system"]');
  let started = false;
  const start = () => { if (!started) { started = true; load(); } };
  if (!pane.hidden) start();
  if (tab) tab.addEventListener('click', start);
  new MutationObserver(() => { if (!pane.hidden) start(); }).observe(pane, { attributes: true, attributeFilter: ['hidden'] });
})();
