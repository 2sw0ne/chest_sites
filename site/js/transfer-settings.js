// Code d'invitation + paiement par virement (2026-11-14) — une carte pour l'admin (Admin → Système) et l'éducateur
// (onglet Portefeuille). Le parrain active le virement pour SES membres (désactivé par défaut) avec ses coordonnées :
// ils voient alors un 3e moyen de paiement (QR Revolut + RIB → « C'est fait »). L'admin voit en plus la liste des
// virements déclarés, à valider (accès ouvert, vente comptée) ou refuser.
// GET/PUT /me/transfer, POST /edu/code (code choisi une fois), GET /admin/transfers, POST /admin/transfers/<id>.
(function () {
  const A = window.CHESTAccounts;
  const host = document.querySelector('[data-panel="system"]') || document.querySelector('[data-panel="wallet"]');
  if (!A || !host) return;
  const isAdminPage = !!document.querySelector('[data-panel="system"]');
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = (n) => Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €';
  const api = async (method, path, body) => {
    const res = await fetch(A.apiBase() + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + A.getToken() }, body: body ? JSON.stringify(body) : undefined });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || 'Indisponible.');
    return d;
  };
  const box = document.createElement('article');
  box.className = 'am-panel';
  box.style.marginTop = '16px';
  host.appendChild(box);
  const input = 'height:42px;padding:0 12px;border-radius:12px;border:1px solid rgba(var(--fg-rgb,255,255,255),.14);background:rgba(var(--fg-rgb,255,255,255),.03);color:var(--chest-ink, #f6f6f7);font:inherit;font-size:13.5px;min-width:0';
  const lab = (t, inner) => `<label style="display:grid;gap:6px;font-size:12px;color:var(--chest-ink-2, #9b9ba1)">${t}${inner}</label>`;
  let T = null, L = null;
  function paint(msg) {
    if (!T) { box.innerHTML = '<header class="am-panel__head"><h2 class="am-panel__t">Code d’invitation et virement</h2></header><p class="am-empty">Chargement…</p>'; return; }
    const u = A.getUser() || {};
    const link = T.code ? `${location.origin}/rejoindre/${encodeURIComponent(T.code)}` : '';
    const ST = { declared: ['À vérifier', '#e8b339'], validated: ['Validé', '#33e6a6'], refused: ['Refusé', '#ff94a0'] };
    box.innerHTML = `<header class="am-panel__head"><h2 class="am-panel__t">Code d’invitation et virement</h2><span class="am-panel__meta">${T.members} membre${T.members > 1 ? 's' : ''} inscrit${T.members > 1 ? 's' : ''} avec ton code</span></header>
      ${isAdminPage ? (T.code
        ? `<p class="am-note">Ton code : <b style="color:var(--chest-ink);letter-spacing:.12em">${esc(T.code)}</b> · lien d’invitation <a href="${esc(link)}" target="_blank" rel="noopener" style="color:var(--chest-ink-2)">${esc(link.replace(/^https?:\/\//, ''))}</a> · <a href="educator.html?educator=${encodeURIComponent(u.id || '')}" style="color:var(--chest-ink-2)">voir mes membres</a></p>`
        : `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:end">${lab('Choisis ton code d’invitation (3 à 8 lettres ou chiffres, définitif)', `<input id="tsCode" maxlength="8" style="${input};text-transform:uppercase;letter-spacing:.14em" placeholder="EX. SWANN">`)}<button type="button" class="chest-btn" id="tsCodeSave">Valider mon code</button></div>`) : ''}
      <div style="margin-top:14px;display:grid;gap:12px">
        <label style="display:flex;align-items:center;gap:10px;font-size:14px;font-weight:600;cursor:pointer"><input type="checkbox" id="tsOn" ${T.enabled ? 'checked' : ''} style="width:18px;height:18px;accent-color:#fc1283">Proposer le paiement par virement à mes membres</label>
        <p class="am-note" style="margin:0">Désactivé par défaut. Activé, tes membres voient un 3e moyen de paiement : ton QR Revolut et ton RIB, puis « C’est fait » ; l’accès s’ouvre quand l’équipe a validé la réception.</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px">
          ${lab('Titulaire', `<input id="tsHolder" style="${input}" value="${esc(T.holder)}" placeholder="Prénom NOM">`)}
          ${lab('IBAN', `<input id="tsIban" style="${input};font-family:'Fragment Mono',monospace" value="${esc(T.iban)}" placeholder="FR76 …">`)}
          ${lab('BIC', `<input id="tsBic" style="${input}" value="${esc(T.bic)}" placeholder="REVOFRP2">`)}
          ${lab('Revolut (facultatif, pour le QR code)', `<input id="tsRev" style="${input}" value="${esc(T.revolut)}" placeholder="@identifiant">`)}
        </div>
        <div style="display:flex;gap:10px;align-items:center"><button type="button" class="chest-btn" id="tsSave">Enregistrer</button><span class="am-note" style="margin:0">${esc(msg || '')}</span></div>
      </div>
      ${isAdminPage ? `<h3 style="margin:20px 0 6px;font-size:13px;color:var(--chest-ink-2);font-weight:600">Virements déclarés par les membres</h3>
        <ul style="list-style:none;margin:0;padding:0">${(L || []).map((t) => `<li style="display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;padding:11px 2px;border-bottom:1px solid var(--am-line)">
          <b style="min-width:140px">${esc(t.member || '')}</b><span>${esc(t.offer)} · ${eur(t.eur)}${t.referrer ? ` · vers ${esc(t.referrer)}` : ''}</span><span style="font-family:'Fragment Mono',monospace;font-size:12px;color:var(--chest-ink-2)">${esc(t.reference)}</span>
          <span style="color:${ST[t.status] ? ST[t.status][1] : '#9b9ba1'};font-weight:600">${ST[t.status] ? ST[t.status][0] : esc(t.status)}</span>
          ${t.status === 'declared' ? `<span style="margin-left:auto;display:flex;gap:8px"><button type="button" class="chest-btn" data-tr="validate" data-id="${t.id}">Reçu, valider</button><button type="button" class="chest-btn-2" data-tr="refuse" data-id="${t.id}">Refuser</button></span>` : ''}</li>`).join('') || '<li class="am-empty" style="padding:10px 0">Aucun virement déclaré.</li>'}</ul>` : ''}`;
  }
  async function load() {
    try { T = await api('GET', '/me/transfer'); if (isAdminPage) L = (await api('GET', '/admin/transfers')).transfers; paint(); }
    catch (e) { box.innerHTML = `<p class="am-empty">${esc(e.message)}</p>`; }
  }
  box.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.id === 'tsSave') {
      try { T = await api('PUT', '/me/transfer', { enabled: document.getElementById('tsOn').checked, holder: document.getElementById('tsHolder').value, iban: document.getElementById('tsIban').value, bic: document.getElementById('tsBic').value, revolut: document.getElementById('tsRev').value }); paint('Enregistré.'); }
      catch (err) { paint(err.message); }
      return;
    }
    if (t.id === 'tsCodeSave') {
      const c = document.getElementById('tsCode').value.trim().toUpperCase();
      if (!confirm(`Ton code sera ${c}, définitivement. Valider ?`)) return;
      try { await api('POST', '/edu/code', { code: c }); await load(); } catch (err) { paint(err.message); }
      return;
    }
    const b = t.closest('[data-tr]');
    if (b) {
      let note = '';
      if (b.dataset.tr === 'refuse') { note = prompt('Motif du refus (le membre le verra) :', 'Virement non reçu') || ''; if (!note) return; }
      else if (!confirm('Le virement est bien arrivé ? L’accès du membre s’ouvre tout de suite.')) return;
      try { L = (await api('POST', '/admin/transfers/' + b.dataset.id, { action: b.dataset.tr, note })).transfers; paint(b.dataset.tr === 'validate' ? 'Virement validé : accès ouvert.' : 'Virement refusé.'); }
      catch (err) { paint(err.message); }
    }
  });
  paint();
  const tab = document.querySelector(isAdminPage ? '[data-view="system"]' : '[data-view="wallet"]');
  let started = false;
  const start = () => { if (!started) { started = true; load(); } };
  if (!host.hidden) start();
  if (tab) tab.addEventListener('click', start);
  new MutationObserver(() => { if (!host.hidden) start(); }).observe(host, { attributes: true, attributeFilter: ['hidden'] });
})();
