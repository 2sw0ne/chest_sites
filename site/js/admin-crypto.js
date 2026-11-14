// Admin → Système : paiements en crypto (2026-11-12, USDC sur Solana, GET/PUT /admin/crypto, POST /admin/crypto/<id>).
// Le wallet Solana de réception, l'interrupteur, et la file des paiements : « reçu » = trouvé sur la blockchain
// (montant et destinataire vérifiés), l'admin valide (l'accès s'ouvre) ou refuse.
(function () {
  const pane = document.querySelector('[data-panel="system"]');
  const A = window.CHESTAccounts;
  if (!pane || !A) return;
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ST = { pending: ['En attente', '#9b9ba1'], detected: ['Reçu · à valider', '#e8b339'], validated: ['Validé', '#33e6a6'], rejected: ['Refusé', '#ff94a0'] };
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
  function paint(msg) {
    if (!D) { box.innerHTML = '<header class="am-panel__head"><h2 class="am-panel__t">Paiement en crypto</h2></header><p class="am-empty">Chargement…</p>'; return; }
    const s = D.settings || {};
    const rows = (D.payments || []).map((p) => `<li style="display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;padding:11px 2px;border-bottom:1px solid var(--am-line)">
        <b style="min-width:140px">${esc(p.member || '')}</b><span>${esc(p.offer)} · ${p.usdc.toFixed(2)} USDC (${Math.round(p.eur)} €)</span>
        <span style="color:${ST[p.status] ? ST[p.status][1] : '#9b9ba1'};font-weight:600">${ST[p.status] ? ST[p.status][0] : esc(p.status)}</span>
        ${p.signature ? `<a href="https://solscan.io/tx/${esc(p.signature)}" target="_blank" rel="noopener" style="color:var(--chest-ink-2)">Voir la transaction</a>` : ''}
        ${p.status === 'detected' || p.status === 'pending' ? `<span style="margin-left:auto;display:flex;gap:8px"><button type="button" class="chest-btn" data-cr="validate" data-id="${p.id}"${p.status === 'pending' ? ' title="Pas encore vu sur la blockchain : valide seulement si tu as vérifié la réception"' : ''}>Valider</button><button type="button" class="chest-btn-2" data-cr="reject" data-id="${p.id}">Refuser</button></span>` : ''}</li>`).join('');
    box.innerHTML = `<header class="am-panel__head"><h2 class="am-panel__t">Paiement en crypto</h2><span class="am-panel__meta">USDC sur Solana · Solana Pay</span></header>
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">
        <input type="text" id="crWallet" value="${esc(s.wallet || '')}" placeholder="Adresse de ton wallet Solana (Phantom…)" spellcheck="false" autocomplete="off" style="flex:1 1 320px;height:42px;padding:0 14px;border-radius:12px;border:1px solid rgba(var(--fg-rgb,255,255,255),.14);background:rgba(var(--fg-rgb,255,255,255),.03);color:var(--chest-ink);font:inherit;font-family:'Fragment Mono',monospace;font-size:12.5px">
        <label style="display:flex;align-items:center;gap:8px;font-size:13px"><input type="checkbox" id="crOn" ${s.on ? 'checked' : ''}> Proposé aux membres</label>
        <button type="button" class="chest-btn" id="crSave">Enregistrer</button>
        <button type="button" class="chest-btn-2" id="crTest">Tester avec 1 USDC</button>
      </div>
      <div id="crTestBox"></div>
      <p class="am-note" style="margin-top:10px">${esc(msg || 'L’argent arrive directement sur ce wallet. Chaque paiement est retrouvé sur la blockchain (montant + destinataire), puis tu le valides ici : l’accès s’ouvre pour la durée de l’offre, sans renouvellement automatique.')}</p>
      <ul style="list-style:none;margin:8px 0 0;padding:0">${rows || '<li class="am-empty" style="padding:10px 0">Aucun paiement en crypto pour l’instant.</li>'}</ul>`;
  }
  async function load() { try { D = await api('GET', '/admin/crypto'); paint(); } catch (e) { box.innerHTML = `<p class="am-empty">${esc(e.message)}</p>`; } }
  // Paiement test (2026-11-14) : 1 USDC vers le wallet configuré, suivi en direct sur la blockchain (aucun accès ouvert)
  let testPoll = 0;
  const loadQr = () => window.qrcode ? Promise.resolve() : new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'; sc.onload = res; sc.onerror = rej; document.head.appendChild(sc); });
  async function runTest() {
    const tb = document.getElementById('crTestBox');
    clearInterval(testPoll);
    try {
      const d = await api('POST', '/admin/crypto/test');
      tb.innerHTML = `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:16px;margin-top:14px;padding:14px;border-radius:14px;background:rgba(var(--fg-rgb,255,255,255),.03);box-shadow:inset 0 0 0 1px rgba(var(--fg-rgb,255,255,255),.08)">
        <div id="crQr" style="padding:8px;border-radius:12px;background:#fff"></div>
        <div style="display:grid;gap:6px;max-width:420px"><b>Scanne avec Phantom (Solana Pay)</b><span class="am-note" style="margin:0">Paie 1 USDC depuis un autre wallet que celui qui reçoit. CHEST cherche la transaction sur la blockchain toutes les 4 secondes.</span>
          <a href="${esc(d.url)}" class="chest-btn-2" style="justify-self:start;text-decoration:none">Ouvrir dans le wallet</a><b id="crTestSt" style="color:#e8b339">En attente du paiement…</b></div></div>`;
      try { await loadQr(); const q = window.qrcode(0, 'M'); q.addData(d.url); q.make(); document.getElementById('crQr').innerHTML = q.createImgTag(4, 0); } catch (err) { /* lien seul */ }
      testPoll = setInterval(async () => {
        try {
          const r = await api('GET', '/billing/crypto/' + d.id);
          if (r.status !== 'pending') {
            clearInterval(testPoll);
            const st = document.getElementById('crTestSt');
            if (st) { st.style.color = '#33e6a6'; st.innerHTML = `Reçu et vérifié sur la blockchain ✓ <a href="https://solscan.io/tx/${esc(r.signature || '')}" target="_blank" rel="noopener" style="color:var(--chest-ink-2)">voir la transaction</a>`; }
          }
        } catch (err) { /* on réessaie */ }
      }, 4000);
    } catch (err) { tb.innerHTML = `<p class="am-note">${esc(err.message)}</p>`; }
  }
  box.addEventListener('click', async (e) => {
    if (e.target.id === 'crTest') { runTest(); return; }
    if (e.target.id === 'crSave') {
      try { D = await api('PUT', '/admin/crypto', { wallet: document.getElementById('crWallet').value.trim(), on: document.getElementById('crOn').checked }); paint('Enregistré.'); } catch (err) { paint(err.message); }
      return;
    }
    const b = e.target.closest('[data-cr]');
    if (!b) return;
    if (b.dataset.cr === 'validate' && !confirm('Valider ce paiement et ouvrir l’accès du membre ?')) return;
    try { D = await api('POST', '/admin/crypto/' + b.dataset.id, { action: b.dataset.cr }); paint(b.dataset.cr === 'validate' ? 'Paiement validé : accès ouvert.' : 'Paiement refusé.'); } catch (err) { paint(err.message); }
  });
  paint();
  const tab = document.querySelector('[data-view="system"]');
  let started = false;
  const start = () => { if (!started) { started = true; load(); } };
  if (!pane.hidden) start();
  if (tab) tab.addEventListener('click', start);
  new MutationObserver(() => { if (!pane.hidden) start(); }).observe(pane, { attributes: true, attributeFilter: ['hidden'] });
})();
