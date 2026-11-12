// Cotisation éducateur (2026-11-12) : 50 €/mois, couverte par les ventes du mois (6 € vendus = 1 € couvert).
// Bandeau sous le titre de l'espace éducateur : rouge = reste à régler avant la fin du mois, vert = couverte / réglée,
// ambre = virement déclaré, en attente de l'admin. Clic → virement (RIB, montant, référence) → « C'est fait ».
// GET /edu/fee (?educator=ID pour l'admin, lecture seule), POST /edu/fee/declare {month}.
(function () {
  const A = window.CHESTAccounts;
  const anchor = document.getElementById('edPreview');
  if (!A || !anchor) return;
  const qs = new URLSearchParams(location.search);
  const asAdmin = qs.get('educator');
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = (c, d) => (Number(c || 0) / 100).toLocaleString('fr-FR', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }) + ' €';
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const monthTxt = (k) => MOIS[Number(k.slice(5, 7)) - 1] + ' ' + k.slice(0, 4);
  const dayTxt = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  const api = async (method, path, body) => {
    const res = await fetch(A.apiBase() + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + A.getToken() }, body: body ? JSON.stringify(body) : undefined });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || 'Indisponible.');
    return d;
  };

  const css = `
.ef{ display:flex; align-items:center; gap:14px; width:100%; margin:0 0 18px; padding:14px 18px; border:0; border-radius:16px; text-align:left; font:inherit; color:var(--ink, #f6f6f7); background:rgba(var(--fg-rgb,255,255,255),.03); box-shadow:inset 0 0 0 1px rgba(var(--fg-rgb,255,255,255),.1); cursor:pointer; transition:box-shadow .2s, transform .16s ease-out; }
.ef:active{ transform:scale(.995); }
.ef__dot{ flex:none; width:10px; height:10px; border-radius:50%; background:var(--c); box-shadow:0 0 0 4px color-mix(in srgb, var(--c) 18%, transparent); }
.ef__t{ flex:1; min-width:0; display:grid; gap:2px; }
.ef__t b{ font-size:14.5px; font-weight:600; }
.ef__t small{ font-size:12.5px; color:var(--ink-2, #9b9ba1); }
.ef__bar{ flex:none; width:150px; height:6px; border-radius:6px; overflow:hidden; background:rgba(var(--fg-rgb,255,255,255),.08); }
.ef__bar i{ display:block; height:100%; background:var(--c); }
.ef__amt{ flex:none; font-size:20px; font-weight:700; font-variant-numeric:tabular-nums; color:var(--c); }
.ef:hover{ box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--c) 55%, transparent); }
.efm{ position:fixed; inset:0; z-index:9000; display:grid; place-items:center; padding:16px; background:rgba(0,0,0,.66); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); }
.efm[hidden]{ display:none; }
.efm__w{ position:relative; width:min(520px,100%); max-height:calc(100dvh - 32px); overflow:auto; padding:26px; border-radius:22px; color:#f6f6f7; background:#0c0c0f; box-shadow:inset 0 0 0 1px rgba(255,255,255,.12), 0 40px 120px rgba(0,0,0,.6); font-family:'Instrument Sans', system-ui, sans-serif; animation:efIn .22s cubic-bezier(.16,1,.3,1); }
@keyframes efIn{ from{ opacity:0; transform:translateY(10px) scale(.98); } }
.efm__x{ position:absolute; top:14px; right:14px; width:34px; height:34px; border:0; border-radius:10px; background:rgba(255,255,255,.06); color:#9b9ba1; font-size:18px; cursor:pointer; }
.efm__k{ font-family:'Fragment Mono', ui-monospace, monospace; font-size:10px; letter-spacing:.24em; text-transform:uppercase; color:#5c5c63; }
.efm h3{ margin:8px 0 4px; font-size:24px; letter-spacing:-.03em; }
.efm p{ margin:0 0 14px; font-size:13.5px; line-height:1.55; color:#9b9ba1; }
.efm__big{ margin:6px 0 16px; font-size:44px; font-weight:700; letter-spacing:-.04em; font-variant-numeric:tabular-nums; }
.efm__rows{ display:grid; gap:8px; margin:0 0 16px; }
.efm__row{ display:flex; align-items:center; gap:10px; padding:11px 14px; border-radius:12px; background:rgba(255,255,255,.04); box-shadow:inset 0 0 0 1px rgba(255,255,255,.08); }
.efm__row span{ flex:none; width:96px; font-size:12px; color:#9b9ba1; }
.efm__row b{ flex:1; min-width:0; font-family:'Fragment Mono', ui-monospace, monospace; font-size:13px; font-weight:500; word-break:break-all; }
.efm__row button{ flex:none; height:30px; padding:0 10px; border:0; border-radius:9px; font:inherit; font-size:12px; font-weight:600; color:#f6f6f7; background:rgba(255,255,255,.08); cursor:pointer; }
.efm__go{ width:100%; height:50px; border:0; border-radius:14px; font:inherit; font-weight:700; color:#fff; background:linear-gradient(90deg,#fc1283,#f9a45e); cursor:pointer; transition:transform .16s ease-out; }
.efm__go:active{ transform:scale(.98); }
.efm__go:disabled{ opacity:.5; cursor:default; }
.efm__hist{ list-style:none; margin:18px 0 0; padding:14px 0 0; border-top:1px solid rgba(255,255,255,.08); display:grid; gap:8px; font-size:13px; }
.efm__hist li{ display:flex; justify-content:space-between; gap:10px; color:#9b9ba1; }
.efm__hist li b{ font-weight:600; }
.efm__err{ min-height:18px; margin:8px 0 0; font-size:12.5px; color:#ff94a0; }
@media (max-width:640px){ .ef{ flex-wrap:wrap; } .ef__bar{ order:3; width:100%; } }
@media (prefers-reduced-motion: reduce){ .efm__w{ animation:none; } }`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  const strip = document.createElement('button');
  strip.type = 'button'; strip.className = 'ef'; strip.hidden = true;
  anchor.insertAdjacentElement('afterend', strip);
  const modal = document.createElement('div');
  modal.className = 'efm'; modal.hidden = true; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-label', 'Cotisation éducateur');
  document.body.appendChild(modal);
  const close = () => { modal.hidden = true; };
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-ef-x]')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });

  let D = null;
  const COL = { covered: '#33e6a6', paid: '#33e6a6', declared: '#e8b339', due: '#ff4d5e', late: '#ff4d5e' };
  const cur = () => D && (D.months.find((m) => m.month === D.current) || D.months[0]);
  // le mois à montrer : un mois en retard passe avant le mois en cours
  const focus = () => D && (D.months.find((m) => m.status === 'late') || cur());

  function paintStrip() {
    const m = focus();
    if (!m) { strip.hidden = true; return; }
    const c = COL[m.status];
    const pct = Math.round(m.covered / D.fee * 100);
    const T = {
      covered: [`Cotisation de ${monthTxt(m.month)} couverte par tes ventes`, `${eur(m.sales)} vendus ce mois-ci : rien à régler.`, 'Couverte'],
      paid: [`Cotisation de ${monthTxt(m.month)} réglée`, 'Ton virement a été validé.', 'Réglée'],
      declared: [`Virement de ${monthTxt(m.month)} déclaré`, 'En attente de validation par CHEST.', eur(m.due)],
      due: [`Cotisation de ${monthTxt(m.month)} : ${eur(m.due)} à régler avant le ${dayTxt(m.deadline)}`, `${eur(m.sales)} vendus · tes ventes couvrent ${eur(m.covered)} sur ${eur(D.fee)} (${eur(D.fee * D.ratio)} de ventes = tout couvert).${m.refused ? ' Dernier virement refusé : ' + m.note : ''}`, eur(m.due)],
      late: [`Cotisation de ${monthTxt(m.month)} en retard`, `${eur(m.due)} à régler dès maintenant par virement.`, eur(m.due)],
    }[m.status];
    strip.style.setProperty('--c', c);
    strip.innerHTML = `<span class="ef__dot" aria-hidden="true"></span><span class="ef__t"><b>${esc(T[0])}</b><small>${esc(T[1])}</small></span><span class="ef__bar" aria-hidden="true"><i style="width:${m.status === 'covered' || m.status === 'paid' ? 100 : pct}%"></i></span><span class="ef__amt">${esc(T[2])}</span>`;
    strip.hidden = false;
  }

  function openModal(msg) {
    const m = focus();
    if (!m) return;
    const b = D.bank || {};
    const canPay = (m.status === 'due' || m.status === 'late') && !asAdmin;
    const row = (l, v, copy) => `<div class="efm__row"><span>${l}</span><b>${esc(v)}</b>${copy ? `<button type="button" data-copy="${esc(l === 'IBAN' ? String(v).replace(/\s/g, '') : v)}">Copier</button>` : ''}</div>`;
    const hist = D.months.slice(0, 6).map((x) => `<li><span>${esc(monthTxt(x.month))}</span><b style="color:${COL[x.status]}">${{ covered: 'Couverte', paid: 'Réglée', declared: 'Déclarée', due: eur(x.due) + ' à régler', late: eur(x.due) + ' en retard' }[x.status]}</b></li>`).join('');
    const head = canPay
      ? `<span class="efm__k">Cotisation · ${esc(monthTxt(m.month))}</span><h3>Régler par virement</h3>
        <p>Tes ventes du mois couvrent déjà ${eur(m.covered)} sur ${eur(D.fee)}. Il reste :</p><div class="efm__big">${eur(m.due, 2)}</div>
        <div class="efm__rows">${b.holder ? row('Titulaire', b.holder, true) : ''}${row('IBAN', b.iban, true)}${row('BIC', b.bic, true)}${row('Revolut', b.revolut, true)}${row('Montant', eur(m.due, 2).replace(/ /g, ' '), true)}${row('Référence', D.ref + ' ' + m.month, true)}</div>
        <p>Une fois le virement envoyé, clique ci-dessous : CHEST le vérifie à réception et le valide.</p>
        <button type="button" class="efm__go" data-declare="${m.month}">C’est fait, j’ai envoyé le virement</button>`
      : `<span class="efm__k">Cotisation éducateur</span><h3>${eur(D.fee)} par mois</h3>
        <p>Couverte par les ventes du mois de tes membres : chaque ${D.ratio} € vendus couvrent 1 €. ${eur(D.fee * D.ratio)} de ventes = cotisation entièrement couverte, un pack à 150 € en couvre la moitié. Le reste se règle par virement avant la fin du mois.</p>`;
    modal.innerHTML = `<div class="efm__w">${'<button type="button" class="efm__x" data-ef-x aria-label="Fermer">×</button>'}${head}<p class="efm__err" role="alert">${esc(msg || '')}</p><ul class="efm__hist">${hist}</ul></div>`;
    modal.hidden = false;
    const go = modal.querySelector('[data-declare]');
    if (go) go.focus();
  }

  modal.addEventListener('click', async (e) => {
    const cp = e.target.closest('[data-copy]');
    if (cp) { try { await navigator.clipboard.writeText(cp.dataset.copy); cp.textContent = 'Copié'; } catch (err) { cp.textContent = '—'; } return; }
    const dc = e.target.closest('[data-declare]');
    if (!dc) return;
    dc.disabled = true;
    try { D = await api('POST', '/edu/fee/declare', { month: dc.dataset.declare }); paintStrip(); close(); } catch (err) { dc.disabled = false; openModal(err.message); }
  });
  strip.addEventListener('click', () => openModal());

  api('GET', '/edu/fee' + (asAdmin ? '?educator=' + encodeURIComponent(asAdmin) : '')).then((d) => { D = d; paintStrip(); }).catch(() => {});
})();
