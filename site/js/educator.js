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
      ['Disponible', eur(w.available), w.pending ? `${eur(w.pending)} en cours de versement` : w.locked ? `${eur(w.locked)} débloqué sous ${w.holdDays || 14} jours` : 'à retirer dès 50 €', ''],
    ].map(([k, v, n, cls]) => `<div class="am-kpi ${cls}" data-tilt="5"><div class="am-kpi__k">${k}</div><div class="am-kpi__v"><b>${esc(v)}</b></div><div class="am-kpi__n">${esc(n)}</div></div>`).join('');

    // Code de référent (2026-10-28) : l'éducateur le choisit UNE fois (3 à 8 lettres ou chiffres), puis il est définitif.
    // Lien officiel (2026-10-30) : la page d'invitation de l'éducateur, qui mène à l'inscription avec son code rempli.
    const link = D.invite ? `${location.origin}/rejoindre/${encodeURIComponent(D.invite)}` : '';
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
         <div class="ed-link"><code id="edLink">${esc(link)}</code><button type="button" class="chest-btn-2" id="edCopy">Copier</button><a class="chest-btn-2" href="${esc(link)}" target="_blank" rel="noopener">Voir ma page</a></div>
         <p class="ed-hint">Ta page d’invitation officielle : ton prénom, ce qu’est CHEST, et l’inscription avec ton code déjà rempli. Chaque personne qui crée son compte par ce lien est rattachée à ton espace. Sur les réseaux, indique « Publicité » et ne promets aucun gain (${'<a href="/legal/charte-educateur" target="_blank" rel="noopener">règles du programme</a>'}).</p>`
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
    // Badge de rang (Premium III…) avec le prix de son offre : js/rank-badge.js
    const rankChip = (m) => (window.CHESTRank && m.planKey && m.planKey !== 'none' ? CHESTRank.chip(m.planKey, m.level, m.price, m.active || m.trial) : `<i class="ed-pill is-off">${esc(m.plan)}</i>`);
    const status = (m) => (m.active ? ['Abonné', 'is-on'] : m.trial ? ['Essai', 'is-trial'] : ['Inactif', 'is-off']);
    const recent = D.members.slice(0, 5);
    $('edRecent').innerHTML = recent.length ? `<ul class="ed-people">${recent.map((m) => { const [s, c] = status(m); return `<li><button type="button" class="ed-people__btn" data-member="${m.id}"><span class="ed-av">${esc(m.name.slice(0, 1))}</span><span class="ed-people__n">${esc(m.name)}<small>inscrit le ${esc(day(m.joinedAt))} · ${s.toLowerCase()}</small></span>${rankChip(m)}<b>${esc(eur(m.commission))}</b></button></li>`; }).join('')}</ul>`
      : '<p class="ed-empty">Personne encore. Partage ton lien pour accueillir tes premiers membres.</p>';
    // Connexions BERICH clé en main (Premium 3) à faire : rappel en tête de l'espace
    const todo = D.members.filter((m) => m.berichPending);
    $('edAlert').hidden = !todo.length;
    $('edAlert').innerHTML = todo.length ? `<span class="ed-alert__dot"></span><span><b>${todo.length} connexion${todo.length > 1 ? 's' : ''} BERICH à faire</b> · ${todo.map((m) => esc(m.name)).join(', ')} attend${todo.length > 1 ? 'ent' : ''} que tu installes son VPS.</span><button type="button" class="chest-btn-2 ed-alert__go" data-member="${todo[0].id}">Voir ${todo.length > 1 ? 'la première' : 'la demande'}</button>` : '';
    $('edMembers').innerHTML = D.members.length ? `<div class="ed-tr ed-tr--h"><span>Membre</span><span>Inscrit le</span><span>Rang</span><span>Statut</span><span>Ventes</span><span>Ta commission</span></div>` + D.members.map((m) => { const [s, c] = status(m); return `<button type="button" class="ed-tr ed-tr--btn" data-member="${m.id}">
        <span class="ed-people__n"><span class="ed-av">${esc(m.name.slice(0, 1))}</span>${esc(m.name)}${m.berichPending ? '<i class="ed-pill is-trial">BERICH à connecter</i>' : ''}</span><span>${esc(day(m.joinedAt))}</span><span>${rankChip(m)}${m.endsAt && m.active ? `<small class="ed-sub">jusqu’au ${esc(day(m.endsAt))}</small>` : ''}</span><span><i class="ed-pill ${c}">${s}</i></span><span class="ed-num">${esc(eur(m.sales, 0))}</span><span class="ed-num ed-strong">${esc(eur(m.commission))}</span></button>`; }).join('')
      : '<p class="ed-empty">Aucun membre inscrit avec ton lien pour l’instant.</p>';

    // carte portefeuille
    $('edCard').innerHTML = `<div class="ed-wallet" data-tilt="11">
        <div class="ed-wallet__top"><span class="ed-wallet__brand"><img src="assets/logo-chest.png" alt="">CHEST Wallet</span><span class="ed-wallet__demo">Affichage indicatif</span></div>
        <div class="ed-wallet__k">Solde disponible</div>
        <div class="ed-wallet__v">${esc(eur(w.available))}</div>
        <div class="ed-wallet__row">
          <span><small>Commissions</small><b>${esc(eur(w.earned))}</b></span>
          <span><small>Sous ${esc(String(w.holdDays || 14))} jours</small><b>${esc(eur(w.locked || 0))}</b></span>
          <span><small>En cours</small><b>${esc(eur(w.pending))}</b></span>
          <span><small>Déjà versé</small><b>${esc(eur(w.paid))}</b></span>
        </div>
        <div class="ed-wallet__holder">${esc((D.payoutInfo && D.payoutInfo.holder) || D.educator.name)}</div>
      </div>
      <p class="ed-hint">Ce solde estime ce qui pourra t’être versé : ce n’est pas de l’argent détenu sur un compte. Une commission devient retirable ${esc(String(w.holdDays || 14))} jours après le paiement du membre (un membre peut être remboursé sous 7 jours) ; un remboursement l’annule. Voir <a href="/legal/charte-educateur#portefeuille" target="_blank" rel="noopener">la Charte de l’éducateur</a>.</p>`;

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
      ? `<li><span class="ed-tx__ic is-in" aria-hidden="true">+</span><span class="ed-tx__l">Commission · ${esc(t.member)}<small>${esc(day(t.at))} · paiement de ${esc(eur(t.sale))}${t.locked && t.availableAt ? ' · retirable le ' + esc(day(t.availableAt)) : ''}</small></span><b class="is-in">+${esc(eur(t.amount))}</b></li>`
      : t.kind === 'refund'
      ? `<li><span class="ed-tx__ic is-out" aria-hidden="true">−</span><span class="ed-tx__l">Remboursement · ${esc(t.member)}<small>${esc(day(t.at))} · paiement de ${esc(eur(t.sale))} remboursé, commission annulée</small></span><b class="is-void">${esc(eur(t.amount))}</b></li>`
      : `<li><span class="ed-tx__ic is-out" aria-hidden="true">↗</span><span class="ed-tx__l">Retrait ${t.method === 'iban' ? 'par virement' : 'en crypto'} <i class="ed-pill is-${t.status}">${lbl[t.status] || t.status}</i><small>${esc(day(t.at))}${t.processedAt ? ' · traité le ' + esc(day(t.processedAt)) : ''}${t.note ? ' · ' + esc(t.note) : ''}</small></span><b class="${t.status === 'refused' ? 'is-void' : ''}">${esc(eur(t.amount))}</b></li>`).join('')}</ul>`
      : '<p class="ed-empty">Tes commissions et tes retraits s’afficheront ici.</p>';
    // CHEST 2.0 : vue d'ensemble de la maquette (js/educator-2.js)
    document.dispatchEvent(new CustomEvent('chest:edu-render', { detail: { D, link, readOnly } }));
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

  // ---------- fiche d'un membre (2026-10-28) ----------
  // Tout ce que l'éducateur doit savoir d'un membre : rang et ce qu'il inclut, connexion BERICH clé en main à faire
  // (accès MT5 déchiffrés pour lui seul), suivi, questionnaire, activité, paiements. GET /edu/members/<id>.
  const ANSWERS = {
    made: { yes: 'Oui', no: 'Non' },
    amount: { lt1k: 'moins de 1 000 €', '1k-10k': '1 000 à 10 000 €', '10k-50k': '10 000 à 50 000 €', gt50k: 'plus de 50 000 €' },
    goal: { learn: 'Apprendre de zéro', improve: 'S’améliorer', structure: 'Structurer', automate: 'Automatiser' },
    budget: { lt100: 'moins de 100 €/mois', '100-300': '100 à 300 €/mois', '300-1000': '300 à 1 000 €/mois', gt1000: 'plus de 1 000 €/mois' },
    reco: { essentiel: 'Essentiel', premium: 'Premium', allstar: 'Allstar' },
  };
  const PAGE_LBL = { dashboard: 'Dashboard', backtesting: 'Backtesting', journal: 'Journal', strategies: 'Stratégies', calendar: 'Calendrier', berich: 'BERICH', school: 'School', suivi: 'Suivi', account: 'Compte' };
  const MONTHS = { 1: '1 mois', 2: '3 mois', 3: '6 mois', 4: '1 an' };
  const sheet = $('edSheet');
  let M = null;
  const tick = (on, label, note) => `<li class="${on ? 'is-on' : ''}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${on ? 'M5 12.5l4.2 4.2L19 7' : 'M7 7l10 10M17 7L7 17'}"/></svg><span>${label}${note ? `<small>${note}</small>` : ''}</span></li>`;
  const copyBtn = (v, l) => `<button type="button" class="ed-copy" data-copy="${esc(v)}" aria-label="Copier ${l}">Copier</button>`;

  function renderSheet() {
    const a = M.access || {}, lvl = a.level, ob = M.onboarding, act = M.activity, br = M.berich, mt = M.mentor;
    const start = Date.parse(a.startedAt), end = Date.parse(a.endsAt);
    const pct = start && end && end > start ? Math.min(100, Math.max(0, (Date.now() - start) / (end - start) * 100)) : null;
    const left = end ? Math.ceil((end - Date.now()) / 86400000) : null;
    const isPremium = a.plan === 'premium';
    // Plan BERICH du membre (quiz, 2026-10-28) : le risque à régler sur son VPS.
    const bp = M.berichPlan && M.berichPlan.cfg ? M.berichPlan : null;
    const fr = (v) => Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
    const legs = bp ? (bp.legs && bp.legs.length ? bp.legs : [{ algo: bp.algo, cfg: bp.cfg }]) : [];
    const algoName = (k) => ({ berich1: 'BERICH I', berich2: 'BERICH II' }[k] || esc(k));
    const planTxt = bp ? legs.map((l) => `${algoName(l.algo)} · ${fr(l.cfg.risk)} % par position${l.cfg.afterSl ? `, ${fr(l.cfg.newRisk)} % après ${l.cfg.afterSl} stops d’affilée` : ''}`).join(' + ')
      + (bp.attachedAt ? ' · rattaché' : ' · à rattacher par l’équipe') : '';
    const maxV = Math.max(1, ...act.last30);
    $('edSheetBody').innerHTML = `
      <header class="ed-sh__head">
        <span class="ed-av ed-av--lg">${esc((M.first || '?').slice(0, 1))}</span>
        <div class="ed-sh__id"><h2 id="edSheetT">${esc(M.name)}</h2><a href="mailto:${esc(M.email)}">${esc(M.email)}</a>
          <span>Inscrit le ${esc(day(M.joinedAt))}${M.lastSeenAt ? ` · vu le ${esc(day(M.lastSeenAt))}` : ''}</span></div>
      </header>
      <div class="ed-sh__acts"><button type="button" class="chest-btn" data-suivi="${M.id}">Ouvrir son suivi</button><button type="button" class="chest-btn-2" data-mynote="${M.id}">Ma note</button><a class="chest-btn-2" href="mailto:${esc(M.email)}">Écrire</a></div>

      <section class="ed-sh__sec">
        <div class="chest-step">01 — Rang</div>
        <div class="ed-rank ${isPremium ? 'is-premium' : ''}">
          <div class="ed-rank__top"><span class="ed-rank__id">${window.CHESTRank ? CHESTRank.badge(a.plan, lvl, 40) : ''}<b>${esc(a.label || 'Sans offre')}</b></span>${lvl ? `<span class="ed-pill">${M.price ? `${Number(M.price).toLocaleString('fr-FR')} € · ` : ''}${MONTHS[lvl]}</span>` : ''}</div>
          ${pct != null ? `<div class="ed-rank__bar"><i style="transform:scaleX(${(pct / 100).toFixed(3)})"></i></div>
          <div class="ed-rank__dates"><span>${esc(day(a.startedAt))}</span><span>${left > 0 ? `${left} jour${left > 1 ? 's' : ''} restant${left > 1 ? 's' : ''}` : 'Terminé'}</span><span>${esc(day(a.endsAt))}</span></div>` : `<p class="ed-hint">${a.trial ? 'Essai gratuit en cours.' : a.active ? 'Accès sans échéance.' : 'Aucun accès actif pour le moment.'}</p>`}
          <ul class="ed-ticks">
            ${tick(a.active, 'Dashboard, journal, backtests, stratégies, calendrier')}
            ${tick(a.school, 'School', a.school ? '' : 'inclus dans Premium')}
            ${tick(a.berich, 'BERICH', a.berich ? '' : 'inclus dans Premium')}
            ${tick(isPremium && lvl === 4, 'Connexion BERICH clé en main', isPremium && lvl === 4 ? 'c’est toi qui installes son VPS' : 'Premium IV uniquement')}
            ${tick(!!M.email, 'Suivi avec toi : rendez-vous, notes, bibliothèque')}
          </ul>
        </div>
      </section>

      ${br ? `<section class="ed-sh__sec">
        <div class="chest-step">02 — Connexion BERICH clé en main</div>
        <div class="ed-br ${br.status === 'done' ? 'is-done' : ''}">
          <div class="ed-br__top"><b>${esc(br.broker)}</b><i class="ed-pill ${br.status === 'done' ? 'is-on' : 'is-trial'}">${br.status === 'done' ? `Connecté le ${esc(day(br.doneAt))}` : `Demandé le ${esc(day(br.createdAt))}`}</i></div>
          <dl class="ed-br__dl">
            <div><dt>Type</dt><dd>${br.kind === 'propfirm' ? `Propfirm${br.phase ? ' · ' + esc(br.phase) : ''}` : 'Broker'}</dd></div>
            <div><dt>Serveur MT5</dt><dd>${esc(br.server)} ${copyBtn(br.server, 'le serveur')}</dd></div>
            <div><dt>Numéro de compte</dt><dd>${esc(br.login)} ${copyBtn(br.login, 'le numéro de compte')}</dd></div>
            <div><dt>Mot de passe</dt><dd>${br.password ? `<span class="ed-secret" data-secret="${esc(br.password)}">••••••••</span> <button type="button" class="ed-copy" data-reveal>Afficher</button> ${copyBtn(br.password, 'le mot de passe')}` : '<span class="ed-warn">Illisible : redemande-le au membre.</span>'}</dd></div>
            ${br.kind === 'propfirm' && br.rules ? `<div class="ed-br__wide"><dt>Règles</dt><dd>${[['minDays', 'jours min.', ''], ['target', 'objectif', ' %'], ['dailyLoss', 'perte jour', ' %'], ['maxLoss', 'perte max', ' %']].filter(([k]) => br.rules[k] != null).map(([k, l, u]) => `${l} ${esc(String(br.rules[k]).replace('.', ','))}${u}`).join(' · ') || '—'}</dd></div>` : ''}
            ${bp ? `<div class="ed-br__wide"><dt>Son plan (à régler sur le VPS)</dt><dd>${planTxt}</dd></div>` : ''}
            ${br.note ? `<div class="ed-br__wide"><dt>Ton mot au membre</dt><dd>${esc(br.note)}</dd></div>` : ''}
          </dl>
          <div class="ed-br__acts">${br.status === 'done' ? `<button type="button" class="chest-btn-2" data-breq="pending" data-id="${br.id}">Rouvrir la demande</button>` : `<button type="button" class="chest-btn" data-breq="done" data-id="${br.id}">Marquer comme connecté</button><span class="ed-hint">Le membre est prévenu sur sa page BERICH.</span>`}</div>
        </div>
      </section>` : ''}

      <section class="ed-sh__sec">
        <div class="chest-step">${br ? '03' : '02'} — Suivi</div>
        <div class="ed-sh__facts">
          <div><span>Prochain rendez-vous</span><b>${mt.next ? `${esc(day(mt.next.starts_at))} · ${new Date(mt.next.starts_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : '—'}</b>${mt.next ? `<small>${esc(mt.next.topic)}${mt.next.status === 'proposed' ? ' · à confirmer' : ''}</small>` : ''}</div>
          <div><span>Séances faites</span><b>${mt.held}</b></div>
          <div><span>Notes</span><b>${mt.notes}</b></div>
          <div><span>Bibliothèque</span><b>${mt.library}</b></div>
        </div>
        ${bp && !br ? `<p class="ed-hint">Plan BERICH : ${planTxt} · objectif ${Number(bp.answers.target).toLocaleString('fr-FR')} € en partant de ${Number(bp.answers.capital).toLocaleString('fr-FR')} €.</p>` : ''}
        ${mt.pending ? `<p class="ed-warn">${mt.pending} demande${mt.pending > 1 ? 's' : ''} de rendez-vous à confirmer.</p>` : ''}
      </section>

      <section class="ed-sh__sec">
        <div class="chest-step">${br ? '04' : '03'} — Ce qu’il a indiqué</div>
        ${ob ? `<dl class="ed-sh__dl">
          <dt>Niveau</dt><dd>${esc(ob.level || '—')} / 10</dd>
          <dt>Déjà gagné en trading</dt><dd>${esc(ANSWERS.made[ob.made] || '—')}${ob.amount ? ', ' + esc(ANSWERS.amount[ob.amount] || '') : ''}</dd>
          <dt>Objectif</dt><dd>${esc(ANSWERS.goal[ob.goal] || '—')}</dd>
          <dt>Budget</dt><dd>${esc(ANSWERS.budget[ob.budget] || '—')}</dd>
          <dt>Offre conseillée</dt><dd>${esc(ANSWERS.reco[ob.recommended] || '—')}</dd>
        </dl>` : '<p class="ed-empty">Questionnaire d’accueil pas encore rempli.</p>'}
      </section>

      <section class="ed-sh__sec">
        <div class="chest-step">${br ? '05' : '04'} — Activité · 30 jours</div>
        <div class="ed-spark" aria-label="${act.days30} jours actifs sur 30">${act.last30.map((v) => `<i style="height:${Math.max(v ? 12 : 4, v / maxV * 100).toFixed(0)}%" class="${v ? 'is-on' : ''}"></i>`).join('')}</div>
        <p class="ed-hint">${act.days30} jour${act.days30 > 1 ? 's' : ''} actif${act.days30 > 1 ? 's' : ''}${act.top.length ? ' · surtout ' + act.top.slice(0, 3).map(([p]) => esc(PAGE_LBL[p] || p)).join(', ') : ''}</p>
      </section>

      <section class="ed-sh__sec">
        <div class="chest-step">${br ? '06' : '05'} — Paiements</div>
        ${M.sales.length ? `<ul class="ed-tx">${M.sales.map((s) => `<li><span class="ed-tx__ic is-in" aria-hidden="true">+</span><span class="ed-tx__l">Paiement<small>${esc(day(s.at))}</small></span><b>${esc(eur(s.amount))}</b></li>`).join('')}</ul>
        <p class="ed-hint">Total ${esc(eur(M.salesTotal))} · ta commission ${esc(eur(M.commission))} (${esc(pctTxt(M.rate))})</p>` : '<p class="ed-empty">Aucun paiement encaissé pour l’instant.</p>'}
      </section>`;
  }

  async function openMember(id) {
    $('edSheetBody').innerHTML = '<p class="ed-empty">Chargement…</p>';
    if (!sheet.open) sheet.showModal();
    try { M = await api(`/edu/members/${id}`); renderSheet(); }
    catch (err) { $('edSheetBody').innerHTML = `<p class="ed-error">${esc(err.message)}</p>`; }
  }
  sheet.addEventListener('click', async (e) => {
    const t = e.target;
    if (t === sheet || t.closest('[data-sheet-close]')) return sheet.close();
    const cp = t.closest('[data-copy]');
    if (cp) { try { await navigator.clipboard.writeText(cp.dataset.copy); cp.textContent = 'Copié'; setTimeout(() => { cp.textContent = 'Copier'; }, 1400); } catch (err) { /* presse-papiers refusé */ } return; }
    const rv = t.closest('[data-reveal]');
    if (rv) { const s = rv.parentElement.querySelector('[data-secret]'); const on = rv.textContent === 'Afficher'; s.textContent = on ? s.dataset.secret : '••••••••'; rv.textContent = on ? 'Masquer' : 'Afficher'; return; }
    const mn = t.closest('[data-mynote]');
    if (mn) { sheet.close(); setView('notes'); if (window.CHESTEduNotes) CHESTEduNotes.open(mn.dataset.mynote); return; }
    const sv = t.closest('[data-suivi]');
    if (sv) { const sh = window.parent && window.parent !== window && window.parent.CHESTShell; sheet.close(); if (sh && sh.go) sh.go('suivi', `?member=${sv.dataset.suivi}`); else location.href = `suivi.html?member=${sv.dataset.suivi}`; return; }
    const bq = t.closest('[data-breq]');
    if (bq) {
      let note = '';
      if (bq.dataset.breq === 'done') {
        note = window.CHESTPrompt ? await CHESTPrompt('Un mot pour le membre (facultatif) :', { value: 'Ton VPS est installé, BERICH tourne sur ton compte.', confirmLabel: 'Marquer comme connecté' }) : '';
        if (note === null) return;
      }
      bq.disabled = true;
      try { await api(`/berich/requests/${bq.dataset.id}`, { method: 'POST', body: JSON.stringify({ status: bq.dataset.breq, note }) }); M = await api(`/edu/members/${M.id}`); renderSheet(); load(); }
      catch (err) { bq.disabled = false; if (window.CHESTAlert) CHESTAlert(err.message); }
    }
  });
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-member]'); if (b && !sheet.contains(b)) openMember(b.dataset.member); });

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
  try { const s = localStorage.getItem('chest_edu_view'); if (['overview', 'members', 'notes', 'wallet'].includes(s)) v0 = s; } catch (e) { /* défaut */ }
  setView(v0);
  load();
})();
