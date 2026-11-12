// Choix du moyen de paiement (2026-11-12) : avant Stripe, le membre choisit Carte (Stripe : carte, Apple Pay, Google Pay,
// abonnement renouvelé) ou Crypto (USDC sur Solana via Solana Pay : QR à scanner avec Phantom, l'argent va directement
// sur le wallet de CHEST, détecté sur la blockchain puis validé par l'équipe ; pas de renouvellement automatique).
// CHESTPay.choose(offer, { onCard }) — offer = objet de GET /pricing ; crypto = booléen de GET /pricing.
(function () {
  const A = window.CHESTAccounts;
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = (n) => Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €';
  const every = (m) => (m === 12 ? 'chaque année' : m === 1 ? 'chaque mois' : `tous les ${m} mois`);
  const css = `
.pc{ position:fixed; inset:0; z-index:9500; display:grid; place-items:center; padding:16px; background:rgba(0,0,0,.66); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); }
.pc[hidden]{ display:none; }
.pc__win{ position:relative; width:min(560px, 100%); max-height:calc(100dvh - 32px); overflow:auto; padding:26px; border-radius:22px; color:#f6f6f7; background:rgba(14,14,17,.96); box-shadow:inset 0 0 0 1px rgba(255,255,255,.13), 0 40px 120px rgba(0,0,0,.6); font-family:'Instrument Sans', system-ui, sans-serif; animation:pcIn .22s cubic-bezier(.16,1,.3,1); }
@keyframes pcIn{ from{ opacity:0; transform:translateY(10px) scale(.98); } }
.pc__x{ position:absolute; top:14px; right:14px; width:34px; height:34px; border:0; border-radius:10px; background:rgba(255,255,255,.06); color:#9b9ba1; cursor:pointer; font-size:18px; }
.pc__k{ font-family:'Fragment Mono', ui-monospace, monospace; font-size:10px; letter-spacing:.24em; text-transform:uppercase; color:#5c5c63; }
.pc h2{ margin:8px 0 4px; font-size:24px; letter-spacing:-.02em; }
.pc__sum{ display:flex; align-items:baseline; justify-content:space-between; gap:10px; margin:16px 0 18px; padding:14px 16px; border-radius:14px; background:rgba(255,255,255,.04); box-shadow:inset 0 0 0 1px rgba(255,255,255,.08); }
.pc__sum b{ font-size:22px; font-variant-numeric:tabular-nums; }
.pc__sum small{ display:block; font-size:12px; color:#9b9ba1; margin-top:2px; }
.pc__opts{ display:grid; gap:10px; }
.pc__opt{ display:flex; align-items:center; gap:14px; width:100%; padding:16px; border:0; border-radius:16px; text-align:left; font:inherit; color:inherit; background:rgba(255,255,255,.035); box-shadow:inset 0 0 0 1px rgba(255,255,255,.1); cursor:pointer; transition:box-shadow .2s cubic-bezier(.16,1,.3,1), background-color .2s cubic-bezier(.16,1,.3,1), transform .16s cubic-bezier(.16,1,.3,1); }
.pc__opt:hover{ background:rgba(252,18,131,.06); box-shadow:inset 0 0 0 1px rgba(252,18,131,.45); }
.pc__opt:active{ transform:scale(.985); }
.pc__opt:focus-visible{ outline:2px solid #fc1283; outline-offset:2px; }
.pc__opt[disabled]{ opacity:.45; cursor:not-allowed; }
.pc__ic{ flex:none; width:44px; height:44px; border-radius:12px; display:grid; place-items:center; background:linear-gradient(135deg,#fc1283,#f9a45e); }
.pc__ic.is-sol{ background:linear-gradient(135deg,#9945ff,#14f195); }
.pc__ic svg{ width:22px; height:22px; stroke:#fff; fill:none; stroke-width:1.9; stroke-linecap:round; stroke-linejoin:round; }
.pc__opt b{ display:block; font-size:15.5px; }
.pc__opt small{ display:block; margin-top:3px; font-size:12.5px; line-height:1.45; color:#9b9ba1; }
.pc__fine{ margin:16px 0 0; font-size:11.5px; line-height:1.55; color:#5c5c63; }
.pc__qr{ display:grid; place-items:center; margin:16px auto 12px; width:220px; height:220px; padding:12px; border-radius:16px; background:#fff; }
.pc__qr img, .pc__qr canvas{ width:100%; height:100%; image-rendering:pixelated; }
.pc__amt{ text-align:center; font-size:30px; font-weight:700; letter-spacing:-.02em; font-variant-numeric:tabular-nums; }
.pc__amt small{ display:block; font-size:12.5px; font-weight:400; color:#9b9ba1; letter-spacing:0; }
.pc__row{ display:flex; gap:8px; margin-top:12px; }
.pc__btn{ flex:1; display:inline-flex; align-items:center; justify-content:center; gap:8px; height:44px; padding:0 14px; border:0; border-radius:12px; font:inherit; font-size:13.5px; font-weight:650; color:#fff; background:linear-gradient(90deg,#fc1283,#f9a45e); text-decoration:none; cursor:pointer; }
.pc__btn.is-2{ color:#f6f6f7; background:rgba(255,255,255,.07); box-shadow:inset 0 0 0 1px rgba(255,255,255,.12); }
.pc__st{ display:flex; align-items:center; gap:10px; margin-top:16px; padding:12px 14px; border-radius:12px; font-size:13px; background:rgba(255,255,255,.04); }
.pc__st i{ flex:none; width:8px; height:8px; border-radius:50%; background:#e8b339; box-shadow:0 0 10px rgba(232,179,57,.7); animation:pcP 1.2s ease-in-out infinite; }
.pc__st.is-ok i{ background:#33e6a6; box-shadow:0 0 10px rgba(51,230,166,.7); animation:none; }
@keyframes pcP{ 50%{ opacity:.35; } }
.pc__guide{ margin-top:16px; border-radius:14px; background:rgba(255,255,255,.03); box-shadow:inset 0 0 0 1px rgba(255,255,255,.08); }
.pc__guide summary{ padding:13px 16px; font-size:13.5px; font-weight:600; cursor:pointer; list-style:none; }
.pc__guide summary::-webkit-details-marker{ display:none; }
.pc__steps{ list-style:none; margin:0; padding:0 16px 14px; display:grid; gap:12px; }
.pc__steps li{ display:flex; gap:12px; font-size:13px; line-height:1.5; color:#9b9ba1; }
.pc__steps b{ color:#f6f6f7; }
.pc__n{ flex:none; width:26px; height:26px; border-radius:50%; display:grid; place-items:center; font-size:12px; font-weight:700; color:#fff; background:linear-gradient(135deg,#9945ff,#14f195); }
.pc__addr{ margin-top:10px; font-family:'Fragment Mono', ui-monospace, monospace; font-size:11px; color:#9b9ba1; word-break:break-all; }
@media (prefers-reduced-motion: reduce){ .pc__win, .pc__st i{ animation:none; } }`;
  let box = null, poll = 0;
  function ensure() {
    if (box) return box;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    box = document.createElement('div'); box.className = 'pc'; box.hidden = true;
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Moyen de paiement');
    document.body.appendChild(box);
    box.addEventListener('click', (e) => { if (e.target === box || e.target.closest('[data-pc-x]')) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !box.hidden) close(); });
    return box;
  }
  function close() { if (box) box.hidden = true; clearInterval(poll); }
  const ICARD = '<svg viewBox="0 0 24 24"><rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 15h3"/></svg>';
  const ISOL = '<svg viewBox="0 0 24 24"><path d="M6 7h13l-2 2.5H4zM4 14.5h13l2 2.5H6zM6 10.8h13l-2 2.4H4"/></svg>';

  function choose(o, opt) {
    const b = ensure();
    const r = Number(o.renew || o.price);
    b.innerHTML = `<div class="pc__win">
      <button type="button" class="pc__x" data-pc-x aria-label="Fermer">×</button>
      <span class="pc__k">Paiement</span><h2>Comment veux-tu payer ?</h2>
      <div class="pc__sum"><div><b>${esc(o.name)}</b><small>${o.months === 12 ? '1 an' : o.months + ' mois'} d’accès</small></div><div style="text-align:right"><b>${eur(o.price)}</b><small>${r !== Number(o.price) ? `puis ${eur(r)} ${every(o.months)}` : `renouvelé ${every(o.months)} par carte`}</small></div></div>
      <div class="pc__opts">
        <button type="button" class="pc__opt" data-pc="card"><span class="pc__ic">${ICARD}</span><span><b>Carte bancaire, Apple Pay, Google Pay</b><small>Paiement sécurisé par Stripe. Abonnement renouvelé automatiquement, résiliable à tout moment.</small></span></button>
        <button type="button" class="pc__opt" data-pc="crypto" ${opt && opt.crypto ? '' : 'disabled'}><span class="pc__ic is-sol">${ISOL}</span><span><b>Crypto · USDC sur Solana</b><small>${opt && opt.crypto ? 'De ton wallet au nôtre, sans intermédiaire, frais &lt; 0,01 $. Validé par l’équipe, pas de renouvellement automatique.' : 'Bientôt disponible.'}</small></span></button>
      </div>
      <p class="pc__fine">En payant, tu acceptes les conditions de vente déjà validées à l’étape précédente. Le trading comporte un risque de perte en capital ; CHEST ne garantit aucun gain.</p>
    </div>`;
    b.hidden = false;
    b.querySelector('[data-pc="card"]').focus();
    b.querySelector('[data-pc="card"]').onclick = () => { close(); if (opt && opt.onCard) opt.onCard(); };
    const cr = b.querySelector('[data-pc="crypto"]');
    if (cr) cr.onclick = () => crypto(o);
  }

  async function loadQr() {
    if (window.qrcode) return;
    await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  }
  async function crypto(o) {
    const win = box.querySelector('.pc__win');
    win.innerHTML = '<span class="pc__k">Crypto · Solana Pay</span><h2>Préparation…</h2>';
    let d;
    try {
      const res = await fetch(A.apiBase() + '/billing/crypto/start', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + A.getToken() }, body: JSON.stringify({ offer: o.key }) });
      d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Paiement indisponible.');
    } catch (e) { win.innerHTML = `<button type="button" class="pc__x" data-pc-x aria-label="Fermer">×</button><span class="pc__k">Crypto</span><h2>Oups</h2><p class="pc__fine">${esc(e.message)}</p>`; return; }
    win.innerHTML = `<button type="button" class="pc__x" data-pc-x aria-label="Fermer">×</button>
      <span class="pc__k">Crypto · Solana Pay</span><h2>Scanne avec ton wallet</h2>
      <div class="pc__qr" id="pcQr" aria-label="QR code du paiement"></div>
      <div class="pc__amt">${d.usdc.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} USDC<small>= ${eur(d.eur)} · ${esc(o.name)} · réseau Solana</small></div>
      <div class="pc__row"><a class="pc__btn" href="${esc(d.url)}">Ouvrir mon wallet</a><button type="button" class="pc__btn is-2" data-pc-copy>Copier l’adresse</button></div>
      <p class="pc__addr">Adresse : ${esc(d.wallet)} — envoie exactement ce montant en USDC sur Solana, depuis le QR de préférence (il porte la référence qui identifie ton paiement).</p>
      <div class="pc__st" id="pcSt" role="status"><i></i><span>En attente de ton paiement… la page se met à jour toute seule.</span></div>
      <details class="pc__guide"><summary>Pas encore de crypto ? Le chemin le plus simple</summary>
        <ol class="pc__steps">
          <li><span class="pc__n">1</span><span><b>Installe Phantom</b> (application gratuite, iPhone / Android / navigateur) et crée ton wallet. Garde ta phrase secrète sur papier, ne la donne jamais.</span></li>
          <li><span class="pc__n">2</span><span><b>Achète des USDC</b> directement dans Phantom (« Acheter », carte ou Apple Pay) ; ou sur Coinbase / Kraken puis « Retirer » vers ton adresse Phantom en choisissant le <b>réseau Solana</b> (frais de quelques centimes).</span></li>
          <li><span class="pc__n">3</span><span><b>Scanne ce QR</b> avec Phantom et valide : le montant et notre adresse sont déjà remplis. Garde quelques centimes de SOL pour les frais.</span></li>
        </ol>
      </details>`;
    try {
      await loadQr();
      const q = window.qrcode(0, 'M'); q.addData(d.url); q.make();
      document.getElementById('pcQr').innerHTML = q.createImgTag(6, 0);
    } catch (e) { document.getElementById('pcQr').textContent = 'QR indisponible : utilise « Ouvrir mon wallet ».'; }
    win.querySelector('[data-pc-copy]').onclick = async (ev) => { try { await navigator.clipboard.writeText(d.wallet); ev.target.textContent = 'Adresse copiée'; } catch (e) { /* tant pis */ } };
    clearInterval(poll);
    poll = setInterval(async () => {
      if (box.hidden) { clearInterval(poll); return; }
      try {
        const r = await fetch(A.apiBase() + '/billing/crypto/' + d.id, { headers: { Authorization: 'Bearer ' + A.getToken() } }).then((x) => x.json());
        const st = document.getElementById('pcSt');
        if (r.status === 'detected' || r.status === 'validated') {
          clearInterval(poll);
          st.classList.add('is-ok');
          st.querySelector('span').textContent = r.status === 'validated' ? 'Paiement validé : ton accès est ouvert.' : 'Paiement reçu sur la blockchain. L’équipe le valide sous 24 h et ton accès s’ouvre aussitôt.';
        }
      } catch (e) { /* on réessaie */ }
    }, 6000);
  }
  window.CHESTPay = { choose, close };
})();
