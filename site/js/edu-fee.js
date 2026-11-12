// Cotisation éducateur (2026-11-12) : 50 €/mois, couverte par les ventes du mois (6 € vendus = 1 € couvert).
// 5e case des chiffres de l'espace éducateur (#edKpis, à côté de « Membres inscrits ») : rouge = reste à régler avant
// la fin du mois, vert = couverte / validée, ambre = virement déclaré en attente de l'admin.
// Clic → fenêtre de paiement : montant, QR code Revolut au centre, lien / @, puis les coordonnées à copier → « C'est fait ».
// GET /edu/fee (?educator=ID pour l'admin, lecture seule), POST /edu/fee/declare {month}.
(function () {
  const A = window.CHESTAccounts;
  if (!A || !document.getElementById('edKpis')) return;
  const asAdmin = new URLSearchParams(location.search).get('educator');
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = (c, d) => (Number(c || 0) / 100).toLocaleString('fr-FR', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }) + ' €';
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const monthTxt = (k) => MOIS[Number(k.slice(5, 7)) - 1];
  const dayTxt = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  const api = async (method, path, body) => {
    const res = await fetch(A.apiBase() + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + A.getToken() }, body: body ? JSON.stringify(body) : undefined });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || 'Indisponible.');
    return d;
  };
  const loadQr = () => window.qrcode ? Promise.resolve() : new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });

  const css = `
@media (min-width:1101px){ #edKpis.has-fee{ grid-template-columns:repeat(5,minmax(0,1fr)); } }
@media (max-width:1100px){ #edKpis.has-fee .ef-kpi{ grid-column:1 / -1; min-height:0; padding-bottom:18px; } }
.ef-kpi{ cursor:pointer; text-align:left; font:inherit; color:inherit; border-color:color-mix(in srgb, var(--c) 34%, transparent) !important; background:radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--c) 16%, transparent), transparent 60%), var(--am-panel) !important; transition:border-color .2s, transform .16s ease-out; }
.ef-kpi:hover{ border-color:color-mix(in srgb, var(--c) 60%, transparent) !important; }
.ef-kpi:active{ transform:scale(.99); }
.ef-kpi .am-kpi__v b{ color:var(--c); }
.ef-kpi__st{ white-space:nowrap; display:inline-flex; align-items:center; gap:6px; font-family:'Instrument Sans', system-ui, sans-serif; font-size:10.5px; font-weight:700; letter-spacing:.04em; text-transform:none; color:var(--c); }
.ef-kpi__st::before{ content:''; width:7px; height:7px; border-radius:50%; background:var(--c); box-shadow:0 0 0 3px color-mix(in srgb, var(--c) 22%, transparent); }
.ef-kpi__bar{ height:4px; margin:12px 0 18px; border-radius:4px; overflow:hidden; background:rgba(var(--fg-rgb,255,255,255),.08); }
.ef-kpi__bar i{ display:block; height:100%; border-radius:4px; background:var(--c); }
.efm{ position:fixed; inset:0; z-index:9000; display:grid; place-items:center; padding:16px; background:rgba(0,0,0,.7); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); }
.efm[hidden]{ display:none; }
.efm__w{ position:relative; width:min(460px,100%); max-height:calc(100dvh - 32px); overflow:auto; padding:30px 26px 24px; border-radius:26px; text-align:center; color:#f6f6f7; font-family:'Instrument Sans', system-ui, sans-serif;
  background:radial-gradient(110% 55% at 50% 0%, rgba(252,18,131,.14), rgba(249,164,94,.05) 45%, transparent 70%), #0c0c0f; box-shadow:inset 0 0 0 1px rgba(255,255,255,.12), 0 40px 120px rgba(0,0,0,.6); animation:efIn .24s cubic-bezier(.16,1,.3,1); }
@keyframes efIn{ from{ opacity:0; transform:translateY(10px) scale(.98); } }
.efm__x{ position:absolute; top:14px; right:14px; width:34px; height:34px; border:0; border-radius:10px; background:rgba(255,255,255,.06); color:#9b9ba1; font-size:18px; cursor:pointer; }
.efm__k{ font-family:'Fragment Mono', ui-monospace, monospace; font-size:10px; letter-spacing:.24em; text-transform:uppercase; color:#5c5c63; }
.efm__big{ margin:10px 0 2px; font-size:56px; font-weight:700; letter-spacing:-.05em; line-height:1; font-variant-numeric:tabular-nums; background:linear-gradient(180deg,#fff 20%,#ffd9c2 60%,#f9a45e); -webkit-background-clip:text; background-clip:text; color:transparent; }
.efm__sub{ margin:8px auto 0; max-width:340px; font-size:13px; line-height:1.55; color:#9b9ba1; }
.efm__qr{ position:relative; width:212px; height:212px; margin:22px auto 0; padding:3px; border-radius:26px; background:linear-gradient(135deg,#fc1283,#f9a45e); box-shadow:0 18px 50px rgba(252,18,131,.25); }
.efm__qr > div{ width:100%; height:100%; display:grid; place-items:center; border-radius:23px; background:#fff; }
.efm__qr img{ display:block; width:178px; height:178px; image-rendering:pixelated; }
.efm__qr small{ color:#5c5c63; font-size:12px; padding:20px; }
.efm__tag{ display:inline-flex; align-items:center; gap:10px; margin-top:16px; padding:6px 6px 6px 14px; border-radius:999px; background:rgba(255,255,255,.05); box-shadow:inset 0 0 0 1px rgba(255,255,255,.1); }
.efm__tag a{ font-size:15px; font-weight:600; color:#f6f6f7; text-decoration:none; }
.efm__tag a:hover{ text-decoration:underline; }
.efm__tag span{ font-size:12.5px; font-weight:700; padding:5px 10px; border-radius:999px; color:#fff; background:linear-gradient(90deg,#fc1283,#f9a45e); }
.efm__or{ display:flex; align-items:center; gap:12px; margin:22px 0 12px; font-size:11.5px; color:#5c5c63; }
.efm__or::before, .efm__or::after{ content:''; flex:1; height:1px; background:rgba(255,255,255,.08); }
.efm__rows{ display:grid; gap:2px; padding:4px; border-radius:18px; background:rgba(255,255,255,.035); box-shadow:inset 0 0 0 1px rgba(255,255,255,.08); text-align:left; }
.efm__row{ display:flex; align-items:center; gap:12px; padding:10px 8px 10px 14px; border-radius:14px; transition:background-color .2s; }
.efm__row:hover{ background:rgba(255,255,255,.04); }
.efm__row > div{ flex:1; min-width:0; }
.efm__row span{ display:block; font-family:'Fragment Mono', ui-monospace, monospace; font-size:9.5px; letter-spacing:.2em; text-transform:uppercase; color:#5c5c63; }
.efm__row b{ display:block; margin-top:3px; font-size:15.5px; font-weight:600; letter-spacing:.01em; font-variant-numeric:tabular-nums; word-break:break-word; }
.efm__row b.is-iban{ letter-spacing:.06em; }
.efm__row button{ flex:none; width:36px; height:36px; display:grid; place-items:center; border:0; border-radius:11px; color:#9b9ba1; background:rgba(255,255,255,.06); cursor:pointer; transition:color .2s, background-color .2s, transform .16s ease-out; }
.efm__row button:hover{ color:#f6f6f7; background:rgba(255,255,255,.1); }
.efm__row button:active{ transform:scale(.94); }
.efm__row button.is-ok{ color:#33e6a6; background:rgba(51,230,166,.12); }
.efm__row svg{ width:16px; height:16px; fill:none; stroke:currentColor; stroke-width:1.9; stroke-linecap:round; stroke-linejoin:round; }
.efm__go{ width:100%; height:52px; margin-top:18px; border:0; border-radius:15px; font:inherit; font-size:15px; font-weight:700; color:#fff; background:linear-gradient(90deg,#fc1283,#f9a45e); box-shadow:0 12px 30px rgba(252,18,131,.28); cursor:pointer; transition:transform .16s ease-out; }
.efm__go:active{ transform:scale(.98); }
.efm__go:disabled{ opacity:.5; cursor:default; }
.efm__fine{ margin:10px 0 0; font-size:11.5px; color:#5c5c63; }
.efm__err{ min-height:0; margin:8px 0 0; font-size:12.5px; color:#ff94a0; }
.efm__hist{ list-style:none; margin:18px 0 0; padding:14px 0 0; border-top:1px solid rgba(255,255,255,.08); display:grid; gap:8px; font-size:13px; text-align:left; }
.efm__hist li{ display:flex; justify-content:space-between; gap:10px; color:#9b9ba1; }
.efm__hist li b{ font-weight:600; }
@media (max-width:480px){ .efm__w{ padding:26px 16px 18px; } .efm__big{ font-size:46px; } .efm__qr{ width:184px; height:184px; } .efm__qr img{ width:152px; height:152px; } }
@media (prefers-reduced-motion: reduce){ .efm__w{ animation:none; } }`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  const modal = document.createElement('div');
  modal.className = 'efm'; modal.hidden = true; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-label', 'Cotisation éducateur');
  document.body.appendChild(modal);
  const close = () => { modal.hidden = true; };
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-ef-x]')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });

  let D = null;
  const COL = { covered: '#33e6a6', paid: '#33e6a6', declared: '#e8b339', due: '#ff4d5e', late: '#ff4d5e' };
  const STATE = { covered: 'Couverte', paid: 'Validée', declared: 'En vérification', due: 'À régler', late: 'En retard' };
  const cur = () => D && (D.months.find((m) => m.month === D.current) || D.months[0]);
  const focus = () => D && (D.months.find((m) => m.status === 'late') || cur()); // un retard passe avant le mois en cours

  function paintTile() {
    const host = document.getElementById('edKpis');
    const m = focus();
    if (!host || !m) return;
    let t = host.querySelector('.ef-kpi');
    if (!t) { t = document.createElement('button'); t.type = 'button'; t.className = 'am-kpi ef-kpi'; t.addEventListener('click', () => openModal()); host.appendChild(t); }
    host.classList.add('has-fee');
    const ok = m.status === 'covered' || m.status === 'paid';
    const val = ok ? eur(D.fee) : eur(m.due);
    const note = { covered: `couverte par ${eur(m.sales)} de ventes`, paid: 'virement validé', declared: 'virement déclaré, CHEST vérifie',
      due: `avant le ${dayTxt(m.deadline)}`, late: `de ${monthTxt(m.month)}, à régler maintenant` }[m.status];
    t.style.setProperty('--c', COL[m.status]);
    t.setAttribute('aria-label', `Cotisation de ${monthTxt(m.month)} : ${STATE[m.status]}, ${val}`);
    t.innerHTML = `<div class="am-kpi__k">Cotisation<span class="ef-kpi__st">${STATE[m.status]}</span></div>
      <div class="am-kpi__v"><b>${esc(val)}</b></div><div class="am-kpi__n">${esc(note)}</div>
      <div class="ef-kpi__bar" aria-hidden="true"><i style="width:${ok ? 100 : Math.round(m.covered / D.fee * 100)}%"></i></div>`;
  }

  const COPY = '<svg viewBox="0 0 24 24"><rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/></svg>';
  const DONE = '<svg viewBox="0 0 24 24"><path d="M5 12.5 10 17 19 7"/></svg>';
  async function openModal(msg) {
    const m = focus();
    if (!m) return;
    const b = D.bank || {};
    const canPay = (m.status === 'due' || m.status === 'late') && !asAdmin;
    const tag = String(b.revolut || '').replace(/^@/, '');
    const link = tag ? `https://revolut.me/${encodeURIComponent(tag)}` : '';
    const row = (l, v, copy, cls) => `<div class="efm__row"><div><span>${l}</span><b${cls ? ` class="${cls}"` : ''}>${esc(v)}</b></div><button type="button" data-copy="${esc(copy == null ? v : copy)}" aria-label="Copier ${esc(l)}">${COPY}</button></div>`;
    const hist = D.months.slice(0, 6).map((x) => `<li><span>${esc(monthTxt(x.month))} ${x.month.slice(0, 4)}</span><b style="color:${COL[x.status]}">${x.status === 'due' || x.status === 'late' ? eur(x.due) + ' · ' : ''}${STATE[x.status]}</b></li>`).join('');
    const body = canPay ? `
      <span class="efm__k">Cotisation · ${esc(monthTxt(m.month))} ${m.month.slice(0, 4)}</span>
      <div class="efm__big">${eur(m.due, 2)}</div>
      <p class="efm__sub">Tes ventes du mois couvrent déjà ${eur(m.covered)} sur ${eur(D.fee)}. À régler avant le ${dayTxt(m.deadline)}.</p>
      ${link ? `<div class="efm__qr"><div id="efQr"><small>QR code…</small></div></div>
      <div class="efm__tag"><a href="${link}" target="_blank" rel="noopener">revolut.me/${esc(tag)}</a><span>@${esc(tag)}</span></div>` : ''}
      <div class="efm__or">ou par virement</div>
      <div class="efm__rows">${b.holder ? row('Titulaire', b.holder) : ''}${row('IBAN', b.iban, String(b.iban || '').replace(/\s/g, ''), 'is-iban')}${row('BIC', b.bic)}${row('Montant', eur(m.due, 2), (m.due / 100).toFixed(2).replace('.', ','))}${row('Référence', D.ref + ' ' + m.month)}</div>
      <button type="button" class="efm__go" data-declare="${m.month}">C’est fait, j’ai envoyé le paiement</button>
      <p class="efm__fine">CHEST vérifie la réception puis valide ta cotisation.</p>` : `
      <span class="efm__k">Cotisation éducateur</span>
      <div class="efm__big">${eur(D.fee)}</div>
      <p class="efm__sub">par mois, du 1er au dernier jour. Couverte par les ventes de tes membres : ${D.ratio} € vendus couvrent 1 €. ${eur(D.fee * D.ratio)} de ventes = tout couvert, un pack à 150 € en couvre la moitié.</p>`;
    modal.innerHTML = `<div class="efm__w"><button type="button" class="efm__x" data-ef-x aria-label="Fermer">×</button>${body}${msg ? `<p class="efm__err" role="alert">${esc(msg)}</p>` : ''}<ul class="efm__hist">${hist}</ul></div>`;
    modal.hidden = false;
    if (canPay && link) {
      try { await loadQr(); const q = window.qrcode(0, 'M'); q.addData(link); q.make(); const el = document.getElementById('efQr'); if (el) el.innerHTML = q.createImgTag(5, 0); }
      catch (e) { const el = document.getElementById('efQr'); if (el) el.innerHTML = '<small>QR indisponible : utilise le lien ci-dessous.</small>'; }
    }
  }

  modal.addEventListener('click', async (e) => {
    const cp = e.target.closest('[data-copy]');
    if (cp) {
      try { await navigator.clipboard.writeText(cp.dataset.copy); cp.innerHTML = DONE; cp.classList.add('is-ok'); setTimeout(() => { cp.innerHTML = COPY; cp.classList.remove('is-ok'); }, 1400); } catch (err) { /* presse-papiers refusé */ }
      return;
    }
    const dc = e.target.closest('[data-declare]');
    if (!dc) return;
    dc.disabled = true;
    try { D = await api('POST', '/edu/fee/declare', { month: dc.dataset.declare }); paintTile(); close(); } catch (err) { dc.disabled = false; openModal(err.message); }
  });

  // educator.js réécrit #edKpis à chaque rendu : la case est remise juste après
  document.addEventListener('chest:edu-render', () => paintTile());
  api('GET', '/edu/fee' + (asAdmin ? '?educator=' + encodeURIComponent(asAdmin) : '')).then((d) => { D = d; paintTile(); }).catch(() => {});
})();
