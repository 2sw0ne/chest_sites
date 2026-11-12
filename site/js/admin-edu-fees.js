// Admin → Système : cotisations des éducateurs (2026-11-12, GET /admin/edu-fees, POST /admin/edu-fees/<id>).
// Le mois en cours de chaque éducateur (ventes, part couverte, reste dû) et les virements déclarés « c'est fait »
// à valider (reçu sur le compte) ou refuser (avec un motif que l'éducateur voit).
(function () {
  const pane = document.querySelector('[data-panel="system"]');
  const A = window.CHESTAccounts;
  if (!pane || !A) return;
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = (c) => (Number(c || 0) / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' €';
  const ST = { declared: ['Déclaré · à vérifier', '#e8b339'], paid: ['Validé', '#33e6a6'], refused: ['Refusé', '#ff94a0'],
    covered: ['Couverte', '#33e6a6'], due: ['À régler', '#ff4d5e'], late: ['En retard', '#ff4d5e'] };
  const tag = (s) => `<span style="color:${ST[s] ? ST[s][1] : '#9b9ba1'};font-weight:600">${ST[s] ? ST[s][0] : esc(s)}</span>`;
  const box = document.createElement('article');
  box.className = 'am-panel';
  box.style.marginTop = '16px';
  pane.appendChild(box);
  let D = null;
  const api = async (method, path, body) => {
    const res = await fetch(A.apiBase() + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + A.getToken() }, body: body ? JSON.stringify(body) : undefined });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || 'Indisponible.');
    return d;
  };
  const li = 'display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;padding:11px 2px;border-bottom:1px solid var(--am-line)';
  function paint(msg) {
    const head = '<header class="am-panel__head"><h2 class="am-panel__t">Cotisations des éducateurs</h2><span class="am-panel__meta">50 € / mois · couverte à 1 € pour 6 € vendus</span></header>';
    if (!D) { box.innerHTML = head + '<p class="am-empty">Chargement…</p>'; return; }
    const eds = (D.educators || []).map((e) => `<li style="${li}"><b style="min-width:140px">${esc(e.name)}</b><span>${eur(e.sales)} vendus · couvre ${eur(e.covered)}</span>${tag(e.status)}${e.due > 0 && e.status !== 'paid' ? `<span style="margin-left:auto;font-variant-numeric:tabular-nums">${eur(e.due)}</span>` : ''}</li>`).join('');
    const fees = (D.fees || []).map((f) => `<li style="${li}"><b style="min-width:140px">${esc(f.educator)}</b><span>${esc(f.month)} · ${eur(f.amount)}</span>${tag(f.status)}${f.note ? `<span style="color:var(--chest-ink-2)">${esc(f.note)}</span>` : ''}
        ${f.status === 'declared' ? `<span style="margin-left:auto;display:flex;gap:8px"><button type="button" class="chest-btn" data-ef="paid" data-id="${f.id}">Reçu, valider</button><button type="button" class="chest-btn-2" data-ef="refused" data-id="${f.id}">Refuser</button></span>` : ''}</li>`).join('');
    box.innerHTML = `${head}<p class="am-note">${esc(msg || 'Ce mois-ci, par éducateur. Un virement déclaré « c’est fait » attend ta vérification sur le compte.')}</p>
      <ul style="list-style:none;margin:6px 0 0;padding:0">${eds || '<li class="am-empty" style="padding:10px 0">Aucun éducateur.</li>'}</ul>
      <h3 style="margin:18px 0 4px;font-size:13px;color:var(--chest-ink-2);font-weight:600">Virements déclarés</h3>
      <ul style="list-style:none;margin:0;padding:0">${fees || '<li class="am-empty" style="padding:10px 0">Aucun virement déclaré.</li>'}</ul>`;
  }
  async function load() { try { D = await api('GET', '/admin/edu-fees'); paint(); } catch (e) { box.innerHTML = `<p class="am-empty">${esc(e.message)}</p>`; } }
  box.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ef]');
    if (!b) return;
    let note = '';
    if (b.dataset.ef === 'refused') { note = prompt('Motif du refus (l’éducateur le verra) :', 'Virement non reçu') || ''; if (!note) return; }
    try { D = await api('POST', '/admin/edu-fees/' + b.dataset.id, { status: b.dataset.ef, note }); paint(b.dataset.ef === 'paid' ? 'Cotisation validée.' : 'Déclaration refusée.'); } catch (err) { paint(err.message); }
  });
  paint();
  const tab = document.querySelector('[data-view="system"]');
  let started = false;
  const start = () => { if (!started) { started = true; load(); } };
  if (!pane.hidden) start();
  if (tab) tab.addEventListener('click', start);
  new MutationObserver(() => { if (!pane.hidden) start(); }).observe(pane, { attributes: true, attributeFilter: ['hidden'] });
})();
