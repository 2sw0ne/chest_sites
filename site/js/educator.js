// CHEST — Espace éducateur (2026-10-25). Lit GET /edu/overview (accounts-bridge) : membres inscrits par le lien de
// l'éducateur, ventes encaissées, commissions, portefeuille (affichage indicatif), retraits et coordonnées de paiement.
// Un admin peut ouvrir l'espace d'un éducateur en lecture seule : educator.html?educator=<id>.
(() => {
  'use strict';
  const A = window.CHESTAccounts;
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = (cents, d = 2) => ((cents || 0) / 100).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' €';
  // 33,33… % (un tiers) s'affiche « 33 % » ; un taux comme 12,5 % garde sa décimale.
  const pctTxt = (r) => (Math.abs(r - Math.round(r)) <= 0.34 ? String(Math.round(r)) : (Math.round(r * 10) / 10).toString().replace('.', ',')) + ' %';
  const day = (iso) => { try { return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return '—'; } };
  const mon = (k) => { const [y, m] = k.split('-'); return new Date(+y, +m - 1, 1).toLocaleDateString('fr-FR', { month: 'short' }); };
  const query = new URLSearchParams(location.search);
  const previewId = query.get('educator');
  const readOnly = !!previewId;
  let D = null;
  let method = 'iban';

  async function api(path, opts) {
    const res = await fetch(A.apiBase() + path, Object.assign({}, opts, {
      headers: Object.assign({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + A.getToken() }, (opts && opts.headers) || {}),
    }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Service indisponible pour le moment.');
    return data;
  }

  // ---------- vues ----------
  function setView(v) {
    document.querySelectorAll('#edNav [data-view]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === v)));
    document.querySelectorAll('.am-view').forEach((p) => { p.hidden = p.dataset.panel !== v; });
    try { localStorage.setItem('chest_edu_view', v); } catch (e) { /* tant pis */ }
  }
  $('edNav').addEventListener('click', (e) => { const b = e.target.closest('[data-view]'); if (b) setView(b.dataset.view); });
  document.addEventListener('click', (e) => { const g = e.target.closest('[data-goto]'); if (g) setView(g.dataset.goto); });

  // ---------- rendu ----------
  function render() {
    const t = D.totals, w = D.wallet;
    $('edRate').innerHTML = `<span>Ta commission</span><b>${pctTxt(D.rate)}</b><small>des ventes de tes membres</small>`;
    $('edCount').textContent = t.members ? String(t.members) : '';
    $('edKpis').innerHTML = [
      ['Membres inscrits', String(t.members), `${t.active} abonné${t.active > 1 ? 's' : ''} · ${t.trials} en essai`, ''],
      ['Ventes générées', eur(t.sales, 0), 'paiements encaissés par CHEST', ''],
      ['Commissions gagnées', eur(w.earned), `${pctTxt(D.rate)} des ventes`, 'am-kpi--hero'],
      ['Disponible', eur(w.available), w.pending ? `${eur(w.pending)} en cours de versement` : 'à retirer dès 50 €', ''],
    ].map(([k, v, n, cls]) => `<div class="am-kpi ${cls}"><div class="am-kpi__k">${k}</div><div class="am-kpi__v"><b>${esc(v)}</b></div><div class="am-kpi__n">${esc(n)}</div></div>`).join('');

    // Code de référent (2026-10-28) : l'éducateur le choisit UNE fois (3 à 8 lettres ou chiffres), puis il est définitif.
    const link = D.invite ? `${location.origin}/inscription?ref=${encodeURIComponent(D.invite)}` : '';
    if (!D.codeChosen && !readOnly) {
      $('edInvite').innerHTML = `<form class="ed-code" id="edCodeForm" novalidate>
          <label class="ed-field"><span>Choisis ton code de référent</span><input type="text" id="edCodeInput" maxlength="8" autocomplete="off" spellcheck="false" placeholder="Ex. KARIM"></label>
          <button type="submit" class="chest-btn">Valider mon code</button>
        </form>
        <p class="ed-hint">3 à 8 lettres ou chiffres. <b>Attention : il est définitif</b>, tes membres le taperont à l’inscription ou l’auront déjà rempli via ton lien.</p>
        <p class="am-msg" id="edCodeMsg" role="status"></p>`
        + (link ? `<p class="ed-hint">En attendant, ton ancien lien fonctionne toujours : <code>${esc(link)}</code></p>` : '');
      $('edCodeInput').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
      $('edCodeForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = $('edCodeInput').value.trim();
        const msg = $('edCodeMsg');
        if (!/^[A-Z0-9]{3,8}$/.test(code)) { msg.textContent = 'De 3 à 8 lettres ou chiffres.'; msg.className = 'am-msg is-err'; return; }
        const ok = window.CHESTConfirm ? await CHESTConfirm(`Choisir « ${code} » comme code de référent ? Il ne pourra plus jamais être changé.`) : confirm('Code définitif ?');
        if (!ok) return;
        try { D = await api('/edu/code', { method: 'POST', body: JSON.stringify({ code }) }); render(); }
        catch (err) { msg.textContent = err.message; msg.className = 'am-msg is-err'; }
      });
    } else $('edInvite').innerHTML = link
      ? `<div class="ed-codebox"><span>Ton code</span><b>${esc(D.invite)}</b><i>définitif</i></div>
         <div class="ed-link"><code id="edLink">${esc(link)}</code><button type="button" class="chest-btn-2" id="edCopy">Copier</button></div>
         <p class="ed-hint">Chaque personne qui crée son compte avec ce lien est rattachée à ton espace. Tu touches ta commission sur chacun de ses paiements.</p>`
      : '<p class="ed-hint">Ton lien n’est pas encore prêt : CHEST le crée pour toi. Il apparaîtra ici.</p>';
    const copy = $('edCopy');
    if (copy) copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(link); copy.textContent = 'Copié ✓'; } catch (e) { copy.textContent = 'Sélectionne le lien'; }
      setTimeout(() => { copy.textContent = 'Copier'; }, 1800);
    });

    // 12 mois
    const months = D.monthly || [];
    if (!months.length) $('edMonths').innerHTML = '<p class="ed-empty">Tes premiers inscrits apparaîtront ici.</p>';
    else {
      const ms = Math.max(1, ...months.map((m) => m.signups)), mc = Math.max(1, ...months.map((m) => m.commission));
      $('edMonths').innerHTML = months.map((m) => `<div class="ed-month" title="${esc(mon(m.month))} : ${m.signups} inscrit(s), ${esc(eur(m.commission))}">
        <div class="ed-month__bars"><i class="ed-bar ed-bar--a" style="height:${(m.signups / ms * 100).toFixed(1)}%"></i><i class="ed-bar ed-bar--b" style="height:${(m.commission / mc * 100).toFixed(1)}%"></i></div>
        <span>${esc(mon(m.month))}</span></div>`).join('');
    }

    // membres
    const status = (m) => (m.active ? ['Abonné', 'is-on'] : m.trial ? ['Essai', 'is-trial'] : ['Inactif', 'is-off']);
    const recent = D.members.slice(0, 5);
    $('edRecent').innerHTML = recent.length ? `<ul class="ed-people">${recent.map((m) => { const [s, c] = status(m); return `<li><span class="ed-av">${esc(m.name.slice(0, 1))}</span><span class="ed-people__n">${esc(m.name)}<small>inscrit le ${esc(day(m.joinedAt))}</small></span><span class="ed-pill ${c}">${s}</span><b>${esc(eur(m.commission))}</b></li>`; }).join('')}</ul>`
      : '<p class="ed-empty">Personne encore. Partage ton lien pour accueillir tes premiers membres.</p>';
    $('edMembers').innerHTML = D.members.length ? `<div class="ed-tr ed-tr--h"><span>Membre</span><span>Inscrit le</span><span>Offre</span><span>Statut</span><span>Ventes</span><span>Ta commission</span></div>` + D.members.map((m) => { const [s, c] = status(m); return `<div class="ed-tr">
        <span class="ed-people__n"><span class="ed-av">${esc(m.name.slice(0, 1))}</span>${esc(m.name)}</span><span>${esc(day(m.joinedAt))}</span><span>${esc(m.plan)}</span><span><i class="ed-pill ${c}">${s}</i></span><span class="ed-num">${esc(eur(m.sales, 0))}</span><span class="ed-num ed-strong">${esc(eur(m.commission))}</span></div>`; }).join('')
      : '<p class="ed-empty">Aucun membre inscrit avec ton lien pour l’instant.</p>';

    // carte portefeuille
    $('edCard').innerHTML = `<div class="ed-wallet">
        <div class="ed-wallet__top"><span class="ed-wallet__brand"><img src="assets/logo-chest.png" alt="">CHEST Wallet</span><span class="ed-wallet__demo">Affichage indicatif</span></div>
        <div class="ed-wallet__k">Solde disponible</div>
        <div class="ed-wallet__v">${esc(eur(w.available))}</div>
        <div class="ed-wallet__row">
          <span><small>Commissions</small><b>${esc(eur(w.earned))}</b></span>
          <span><small>En cours</small><b>${esc(eur(w.pending))}</b></span>
          <span><small>Déjà versé</small><b>${esc(eur(w.paid))}</b></span>
          <span><small>Taux</small><b>${esc(pctTxt(D.rate))}</b></span>
        </div>
        <div class="ed-wallet__holder">${esc((D.payoutInfo && D.payoutInfo.holder) || D.educator.name)}</div>
      </div>
      <p class="ed-hint">Ce solde estime ce qui pourra t’être versé : ce n’est pas de l’argent détenu sur un compte. Voir « Nature du portefeuille » plus bas.</p>`;

    // retrait
    $('edMin').textContent = `minimum ${eur(D.minPayout, 0)}`;
    const pi = D.payoutInfo;
    $('edTo').innerHTML = pi ? `Versé sur : <b>${pi.method === 'iban' ? `IBAN ${esc(pi.iban)}` : `${esc(pi.network)} · ${esc(pi.address)}`}</b>` : '<span class="ed-warn">Enregistre d’abord où recevoir tes paiements (plus bas).</span>';
    $('edAsk').disabled = readOnly || !pi || w.available < D.minPayout;
    $('edMax').disabled = readOnly || !w.available;

    // coordonnées
    if (pi) {
      method = pi.method;
      $('edHolder').value = pi.holder || '';
      $('edIban').value = ''; $('edIban').placeholder = pi.iban ? `${pi.iban} (enregistré)` : 'FR76 …';
      $('edBic').value = pi.bic || '';
      $('edNetwork').value = pi.network || 'USDT (TRC-20)';
      $('edAddress').value = ''; $('edAddress').placeholder = pi.address ? `${pi.address} (enregistrée)` : '';
      $('edPayMeta').textContent = 'mis à jour le ' + day(pi.updatedAt);
    } else $('edPayMeta').textContent = 'pas encore renseigné';
    payMethod(method);
    document.querySelectorAll('#edPay input, #edPay select, #edPay button').forEach((el) => { el.disabled = readOnly; });

    // mouvements
    const lbl = { pending: 'en attente', paid: 'versé', refused: 'refusé' };
    $('edTx').innerHTML = D.transactions.length ? `<ul class="ed-tx">${D.transactions.map((t) => t.kind === 'commission'
      ? `<li><span class="ed-tx__ic is-in" aria-hidden="true">+</span><span class="ed-tx__l">Commission · ${esc(t.member)}<small>${esc(day(t.at))} · paiement de ${esc(eur(t.sale))}</small></span><b class="is-in">+${esc(eur(t.amount))}</b></li>`
      : `<li><span class="ed-tx__ic is-out" aria-hidden="true">↗</span><span class="ed-tx__l">Retrait ${t.method === 'iban' ? 'par virement' : 'en crypto'} <i class="ed-pill is-${t.status}">${lbl[t.status] || t.status}</i><small>${esc(day(t.at))}${t.processedAt ? ' · traité le ' + esc(day(t.processedAt)) : ''}${t.note ? ' · ' + esc(t.note) : ''}</small></span><b class="${t.status === 'refused' ? 'is-void' : ''}">${esc(eur(t.amount))}</b></li>`).join('')}</ul>`
      : '<p class="ed-empty">Tes commissions et tes retraits s’afficheront ici.</p>';
  }

  // ---------- coordonnées de paiement ----------
  function payMethod(m) {
    method = m;
    document.querySelectorAll('#edPay [data-method]').forEach((b) => b.classList.toggle('is-active', b.dataset.method === m));
    document.querySelectorAll('#edPay [data-pay]').forEach((g) => { g.hidden = g.dataset.pay !== m; });
  }
  $('edPay').addEventListener('click', (e) => { const b = e.target.closest('[data-method]'); if (b && !readOnly) payMethod(b.dataset.method); });
  $('edPay').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('edPayMsg');
    const body = method === 'iban'
      ? { method, holder: $('edHolder').value, iban: $('edIban').value || '', bic: $('edBic').value }
      : { method, holder: $('edHolder').value, network: $('edNetwork').value, address: $('edAddress').value };
    if (method === 'iban' && !body.iban) { msg.textContent = 'Saisis ton IBAN complet (il est masqué une fois enregistré).'; msg.className = 'am-msg is-err'; return; }
    if (method === 'crypto' && !body.address) { msg.textContent = 'Saisis l’adresse complète de ton portefeuille.'; msg.className = 'am-msg is-err'; return; }
    $('edPaySave').disabled = true;
    try { D = await api('/edu/payout-info', { method: 'PUT', body: JSON.stringify(body) }); render(); msg.textContent = 'Enregistré.'; msg.className = 'am-msg is-ok'; }
    catch (err) { msg.textContent = err.message; msg.className = 'am-msg is-err'; }
    finally { $('edPaySave').disabled = false; }
  });

  // ---------- retrait ----------
  $('edMax').addEventListener('click', () => { $('edAmount').value = (D.wallet.available / 100).toFixed(2).replace('.', ','); });
  $('edWithdraw').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('edAskMsg');
    const amount = Number(String($('edAmount').value).replace(/\s/g, '').replace(',', '.'));
    if (!isFinite(amount) || amount <= 0) { msg.textContent = 'Indique un montant.'; msg.className = 'am-msg is-err'; return; }
    const ok = window.CHESTConfirm ? await CHESTConfirm(`Demander le versement de ${amount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} € ? CHEST vérifie la demande puis effectue le virement.`) : confirm('Demander ce retrait ?');
    if (!ok) return;
    $('edAsk').disabled = true;
    try { D = await api('/edu/payouts', { method: 'POST', body: JSON.stringify({ amount }) }); $('edAmount').value = ''; render(); msg.textContent = 'Demande envoyée : tu la suis dans « Mouvements ».'; msg.className = 'am-msg is-ok'; }
    catch (err) { msg.textContent = err.message; msg.className = 'am-msg is-err'; $('edAsk').disabled = false; }
  });

  // ---------- chargement ----------
  async function load() {
    try {
      D = await api('/edu/overview' + (previewId ? '?educator=' + encodeURIComponent(previewId) : ''));
      $('edError').hidden = true;
      if (readOnly) { const p = $('edPreview'); p.hidden = false; p.textContent = `Aperçu admin de l’espace de ${D.educator.name} : lecture seule.`; }
      render();
    } catch (err) {
      const box = $('edError'); box.hidden = false; box.textContent = err.message;
    }
  }
  // Voile de la barre d'onglets seulement quand elle colle en haut (même règle que l'admin : .am-nav.is-stuck).
  const nav = $('edNav');
  const syncStuck = () => nav.classList.toggle('is-stuck', nav.getBoundingClientRect().top <= 1 && window.scrollY > 0);
  window.addEventListener('scroll', syncStuck, { passive: true });
  syncStuck();
  let v0 = 'overview';
  try { const s = localStorage.getItem('chest_edu_view'); if (['overview', 'members', 'wallet'].includes(s)) v0 = s; } catch (e) { /* défaut */ }
  setView(v0);
  load();
})();
