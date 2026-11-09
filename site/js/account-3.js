// Compte v3 (2026-11-08) : les réglages deviennent des cartes titrées et numérotées (Profil, Apparence, Abonnement,
// Alertes, Marché et exécution, Administration, Tes droits), chacune avec une phrase qui dit ce qu'elle règle.
// Ajoute la photo de profil (POST /me/avatar, image réduite à 320 px dans le navigateur avant l'envoi) et, dans
// Apparence, le mode clair / sombre et la couleur du thème directement sur la carte (js/theme.js).
(() => {
  const A = window.CHESTAccounts, T = window.CHESTTheme;
  const list = document.querySelector('.settings-list');
  if (!A || !list) return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fileUrl = (key) => (key ? `${A.apiBase()}/school/files/${encodeURIComponent(key)}` : '');

  const GROUPS = [
    ['Toi', 'profil', 'Ton profil', 'Ta photo, ton nom et ton e-mail de connexion ; tes sauvegardes.'],
    ['Affichage', 'apparence', 'Apparence', 'Mode clair ou sombre, couleur du thème, taille de l’affichage. Appliqués tout de suite, sur tous tes appareils.'],
    ['Abonnement', 'offre', 'Abonnement', 'Ton offre CHEST et la gestion de ton paiement.'],
    ['Alertes', 'alertes', 'Alertes', 'Les notifications que tu reçois et leur historique.'],
    ['Marché et exécution', 'marche', 'Marché et exécution', 'La paire suivie, ton fuseau horaire et la connexion de ton compte de trading.'],
    ['Administration', 'admin', 'Administration', 'Réservé à l’équipe CHEST.'],
    ['Tes droits', 'droits', 'Tes droits', 'Les documents légaux et la suppression de ton compte.'],
  ];

  // ---------- cartes
  const cards = {};
  let cur = null;
  [...list.children].forEach((el) => {
    if (el.classList.contains('settings-group')) {
      const g = GROUPS.find((x) => x[0] === el.textContent.trim());
      const sec = document.createElement('section');
      sec.className = 'acc-card';
      if (el.hasAttribute('data-admin-only')) { sec.setAttribute('data-admin-only', ''); if (el.hidden) sec.hidden = true; }
      const key = g ? g[1] : 'autre-' + Object.keys(cards).length;
      sec.dataset.card = key;
      sec.innerHTML = `<header class="acc-card__h"><span class="acc-card__n"></span><div><h3>${esc(g ? g[2] : el.textContent.trim())}</h3>${g ? `<p>${esc(g[3])}</p>` : ''}</div></header><div class="acc-card__b"></div>`;
      cards[key] = sec;
      cur = sec.querySelector('.acc-card__b');
      el.remove();
      return;
    }
    if (cur && el.nodeType === 1 && el.tagName !== 'SCRIPT') cur.appendChild(el);
  });
  const order = GROUPS.map((g) => g[1]).concat(Object.keys(cards).filter((k) => !GROUPS.some((g) => g[1] === k)));
  order.forEach((k) => { if (cards[k]) list.appendChild(cards[k]); });
  const renumber = () => [...list.querySelectorAll('.acc-card')].filter((c) => !c.hidden).forEach((c, i) => { c.querySelector('.acc-card__n').textContent = String(i + 1).padStart(2, '0'); });
  renumber();
  // une carte réservée à l'équipe peut apparaître après coup (CHESTNav.refreshAdminVisibility)
  new MutationObserver(renumber).observe(list, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
  list.classList.add('is-cards');
  const step = document.querySelector('main > .chest-step');
  if (step && /Réglages/.test(step.textContent)) step.textContent = '02 — Tes réglages';

  // ---------- photo de profil
  const prof = cards.profil && cards.profil.querySelector('.acc-card__b');
  if (prof) {
    const row = document.createElement('div');
    row.className = 'acc-photo';
    row.innerHTML = `<span class="acc-photo__pic" id="accPhotoPic" aria-hidden="true"></span>
      <div class="acc-photo__t"><b>Photo de profil</b><span id="accPhotoSub">Affichée dans le menu, sur School et pour ton éducateur. JPG ou PNG.</span></div>
      <div class="acc-photo__a"><label class="chest-btn-2 acc-photo__pick"><input type="file" id="accPhotoFile" accept="image/*" hidden>Changer la photo</label>
        <button type="button" class="chest-btn-2 acc-photo__del" id="accPhotoDel" hidden>Retirer</button></div>`;
    prof.prepend(row);
  }
  function storeUser(u) {
    const s = JSON.stringify(u);
    try { if (localStorage.getItem('chest_account_user')) localStorage.setItem('chest_account_user', s); else sessionStorage.setItem('chest_account_user', s); } catch (e) {}
    try { window.parent.postMessage({ type: 'chest:user' }, location.origin); } catch (e) {}
  }
  function paintPhoto() {
    const u = A.getUser() || {};
    const url = fileUrl(u.avatar);
    const ini = ((u.firstName || '?')[0] + ((u.lastName || '')[0] || '')).toUpperCase();
    [document.getElementById('accPhotoPic'), document.getElementById('acchAvatar')].forEach((el) => {
      if (!el) return;
      el.classList.toggle('has-photo', !!url);
      el.style.backgroundImage = url ? `url("${url}")` : '';
      el.style.setProperty('--ph', url ? `url("${url}")` : 'none');
      el.textContent = url ? '' : ini;
    });
    const del = document.getElementById('accPhotoDel'); if (del) del.hidden = !url;
  }
  async function shrinkUnused(file) {
    const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = URL.createObjectURL(file); });
    const n = 320, c = document.createElement('canvas'); c.width = n; c.height = n;
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    c.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, n, n);
    return new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.88));
  }
  async function send(body, isForm) {
    const sub = document.getElementById('accPhotoSub');
    if (sub) sub.textContent = 'Envoi…';
    try {
      const r = await fetch(A.apiBase() + '/me/avatar', { method: 'POST', headers: Object.assign({ Authorization: 'Bearer ' + A.getToken() }, isForm ? {} : { 'Content-Type': 'application/json' }), body });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Envoi impossible pour le moment.');
      storeUser(Object.assign({}, A.getUser(), { avatar: d.user.avatar }));
      paintPhoto();
      if (sub) sub.textContent = d.user.avatar ? 'Photo enregistrée.' : 'Photo retirée.';
    } catch (e) { if (sub) sub.textContent = e.message; }
  }
  // Recadrage : la photo se place dans le rond (glisser pour déplacer, curseur ou molette pour zoomer), puis seule la
  // zone visible est envoyée, en 320 x 320.
  function cropper(file) {
    const url = URL.createObjectURL(file);
    const dlg = document.createElement('dialog');
    dlg.className = 'acc-crop';
    dlg.innerHTML = `<form method="dialog" class="acc-crop__win"><h3>Ajuste ta photo</h3><p>Fais-la glisser pour la placer dans le rond, zoome avec le curseur.</p>
      <div class="acc-crop__stage" id="acCropStage"><img id="acCropImg" src="${url}" alt="" draggable="false"><span class="acc-crop__ring" aria-hidden="true"></span></div>
      <label class="acc-crop__zoom"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5M8.5 11h5"/></svg><input type="range" id="acCropZoom" min="1" max="4" step="0.01" value="1" aria-label="Zoom"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5M8.5 11h5M11 8.5v5"/></svg></label>
      <footer><button type="button" class="chest-btn-2" data-crop-cancel>Annuler</button><button type="button" class="chest-btn" data-crop-ok>Enregistrer</button></footer></form>`;
    document.body.appendChild(dlg);
    const img = dlg.querySelector('#acCropImg'), stage = dlg.querySelector('#acCropStage'), zoom = dlg.querySelector('#acCropZoom');
    const S = 280; // taille du cadre (px)
    let base = 1, z = 1, x = 0, y = 0, nw = 0, nh = 0;
    const clamp = () => {
      const w = nw * base * z, h = nh * base * z;
      x = Math.min(0, Math.max(S - w, x)); y = Math.min(0, Math.max(S - h, y));
    };
    const paint = () => { clamp(); img.style.transform = `translate(${x}px, ${y}px) scale(${base * z})`; };
    img.onload = () => {
      nw = img.naturalWidth; nh = img.naturalHeight;
      base = S / Math.min(nw, nh);
      x = (S - nw * base) / 2; y = (S - nh * base) / 2;
      paint();
    };
    const setZoom = (nz) => {
      const cx = S / 2, cy = S / 2, k = nz / z;
      x = cx - (cx - x) * k; y = cy - (cy - y) * k; z = nz; zoom.value = String(nz); paint();
    };
    zoom.addEventListener('input', () => setZoom(Number(zoom.value)));
    stage.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(Math.min(4, Math.max(1, z * (e.deltaY < 0 ? 1.08 : 1 / 1.08)))); }, { passive: false });
    let drag = null;
    stage.addEventListener('pointerdown', (e) => { drag = { px: e.clientX, py: e.clientY, x, y }; stage.setPointerCapture(e.pointerId); stage.classList.add('is-drag'); });
    stage.addEventListener('pointermove', (e) => { if (!drag) return; x = drag.x + e.clientX - drag.px; y = drag.y + e.clientY - drag.py; paint(); });
    const end = () => { drag = null; stage.classList.remove('is-drag'); };
    stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
    stage.addEventListener('keydown', (e) => {
      const d = e.shiftKey ? 20 : 6;
      if (e.key === 'ArrowLeft') x += d; else if (e.key === 'ArrowRight') x -= d; else if (e.key === 'ArrowUp') y += d; else if (e.key === 'ArrowDown') y -= d; else return;
      e.preventDefault(); paint();
    });
    stage.tabIndex = 0;
    const close = () => { dlg.close(); dlg.remove(); URL.revokeObjectURL(url); };
    dlg.addEventListener('click', (e) => {
      if (e.target.closest('[data-crop-cancel]') || e.target === dlg) return close();
      if (!e.target.closest('[data-crop-ok]')) return;
      const n = 320, c = document.createElement('canvas'); c.width = n; c.height = n;
      const sc = base * z, k = n / S;
      c.getContext('2d').drawImage(img, -x / sc, -y / sc, S / sc, S / sc, 0, 0, n, n);
      c.toBlob((blob) => { const fd = new FormData(); fd.append('avatar', blob, 'avatar.jpg'); send(fd, true); close(); }, 'image/jpeg', 0.9);
      void k;
    });
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    dlg.showModal();
  }
  document.addEventListener('change', (e) => {
    if (e.target.id !== 'accPhotoFile' || !e.target.files[0]) return;
    cropper(e.target.files[0]);
    e.target.value = '';
  });
  document.addEventListener('click', (e) => { if (e.target.closest('#accPhotoDel')) send(JSON.stringify({ remove: true }), false); });
  paintPhoto();
  setTimeout(paintPhoto, 400); // le héros remet les initiales après coup

  // ---------- Abonnement : la carte de l'offre (style carte bancaire premium)
  const offre = cards.offre && cards.offre.querySelector('.acc-card__b');
  if (offre) {
    const u = A.getUser() || {}, a = u.access || {};
    const R = window.CHESTRank;
    const dateL = (iso) => { try { return iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : ''; } catch (e) { return ''; } };
    const team = u.isAdmin || u.role === 'educator';
    const plan = team ? (u.isAdmin ? 'allstar' : 'offert') : (a.plan === 'offert' ? 'offert' : a.plan || 'none');
    const inf = R ? R.info(plan, a.level) : { c1: '#fc1283', c2: '#f9a45e', name: '' };
    const name = team ? (u.isAdmin ? (u.role === 'manager' ? 'Manageur' : 'Administrateur') : 'Éducateur') : (a.label || inf.name || 'Sans offre');
    const state = team ? ['Accès illimité', 'on'] : a.trial ? ['Essai', 'on'] : a.status === 'canceling' ? ['Résilié', 'warn'] : a.active ? ['Actif', 'on'] : ['Inactif', 'off'];
    const endLbl = team ? 'Échéance' : a.trial ? 'Fin de l’essai' : a.status === 'canceling' ? 'Actif jusqu’au' : a.paid ? 'Prochaine facture' : 'Accès jusqu’au';
    const endVal = team ? 'Sans limite' : a.endsAt ? dateL(a.endsAt) : a.plan === 'offert' ? 'Sans limite' : '—';
    const fullName = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || '';
    const card = document.createElement('div');
    card.className = 'acc-plan';
    card.style.cssText = `--p1:${inf.c1};--p2:${inf.c2}`;
    card.innerHTML = `<div class="acc-plan__card" role="img" aria-label="Carte ${esc(name)}">
        <span class="acc-plan__shine" aria-hidden="true"></span>
        <div class="acc-plan__top"><span class="acc-plan__brand"><img src="assets/icon-192.png" alt="" width="26" height="26">CHEST</span>${R ? R.badge(plan, a.level, 40) : ''}</div>
        <div class="acc-plan__chip" aria-hidden="true"></div>
        <div class="acc-plan__name">${esc(name)}</div>
        <div class="acc-plan__foot"><div><small>Membre</small><b>${esc(fullName)}</b></div><div><small>${esc(endLbl)}</small><b>${esc(endVal)}</b></div></div>
      </div>
      <dl class="acc-plan__facts">
        <div><dt>Statut</dt><dd><span class="acc-st acc-st--${state[1]}">${state[0]}</span></dd></div>
        <div><dt>Formule</dt><dd>${esc(team ? 'Rôle d’équipe' : a.trial ? '7 jours offerts' : a.plan === 'offert' ? 'Offert par CHEST' : a.level ? ['', '3 mois', '6 mois', '1 an'][a.level] || '—' : a.period === 'year' ? 'Annuel' : a.period === 'month' ? 'Mensuel' : '—')}</dd></div>
        <div><dt>Début</dt><dd>${esc(dateL(a.startedAt || u.createdAt) || '—')}</dd></div>
        <div><dt>${esc(endLbl)}</dt><dd>${esc(endVal)}</dd></div>
      </dl>`;
    offre.prepend(card);
  }

  // ---------- Marché : logos (drapeaux et pièces, comme la landing)
  const FLAG = { USD: 'us', EUR: 'eu', GBP: 'gb', JPY: 'jp', CHF: 'ch', AUD: 'au', CAD: 'ca', NZD: 'nz', CNY: 'cn' };
  const COIN = { XAU: 'au', XAG: 'ag', BTC: 'btc', ETH: 'eth' };
  const disc = (c, q) => {
    const k = String(c || '').toUpperCase();
    if (COIN[k]) return `<i class="mkf coin-${COIN[k]}${q ? ' q' : ''}"></i>`;
    if (FLAG[k]) return `<i class="mkf${q ? ' q' : ''}" style="background-image:url(https://cdnjs.cloudflare.com/ajax/libs/flag-icons/7.2.3/flags/1x1/${FLAG[k]}.svg)"></i>`;
    return `<i class="mkf mkf--txt${q ? ' q' : ''}">${esc(k.slice(0, 3))}</i>`;
  };
  function pairIcon() {
    const el = document.getElementById('pairRowValue');
    const row = el && el.closest('.settings-row');
    if (!row) return;
    const m = /([A-Z]{3})\s*\/\s*([A-Z]{3})/.exec(el.textContent || '');
    let ic = row.querySelector('.mk-ic2');
    if (!ic) { ic = document.createElement('span'); ic.className = 'mk-ic2'; row.querySelector('.settings-row__info').prepend(ic); }
    ic.innerHTML = m ? disc(m[1]) + disc(m[2], true) : '';
    ic.hidden = !m;
  }
  pairIcon();
  const pv = document.getElementById('pairRowValue');
  if (pv) new MutationObserver(pairIcon).observe(pv, { childList: true, characterData: true, subtree: true });
  const tz = document.getElementById('tzRowValue');
  if (tz) { const info = tz.closest('.settings-row__info'); const g = document.createElement('span'); g.className = 'mk-ic2 mk-ic2--glyph'; g.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18"/></svg>'; info.prepend(g); }

  // ---------- BERICH : une carte à part, ses informations de broker et la connexion du VPS
  const brRow = document.getElementById('connexion');
  if (brRow && cards.marche) {
    const sec = document.createElement('section');
    sec.className = 'acc-card acc-card--berich';
    sec.dataset.card = 'berich';
    sec.innerHTML = `<header class="acc-card__h"><span class="acc-card__n"></span><div><h3>BERICH</h3><p>Ton broker (ou ta propfirm) et la connexion de ton VPS : c’est ce qui permet à BERICH de placer les positions sur ton compte.</p></div><img class="acc-card__logo" src="assets/logo-berich.png" alt="" width="40" height="40"></header><div class="acc-card__b"></div>`;
    cards.marche.after(sec);
    const body = sec.querySelector('.acc-card__b');
    const conn = (() => { try { return window.CHESTBerich && CHESTBerich.loadConnection ? CHESTBerich.loadConnection() : null; } catch (e) { return null; } })() || {};
    const J = window.CHESTJournal;
    const vps = J && J.listAccounts ? J.listAccounts().filter((acc) => (J.liveAccounts(acc) || []).some((l) => l.kind === 'vps')) : [];
    const step = (n, ok, title, sub, act) => `<div class="acc-step${ok ? ' is-ok' : ''}"><span class="acc-step__n">${ok ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.2 4.2L19 7"/></svg>' : n}</span><div class="acc-step__t"><b>${title}</b><span>${sub}</span></div>${act}</div>`;
    const broker = conn.broker ? `${esc(conn.broker)}${conn.server ? ' · ' + esc(conn.server) : ''}${conn.login ? ' · n° ' + esc(conn.login) : ''}` : 'Pas encore renseigné.';
    const risk = conn.riskMode === 'preset' ? 'Préréglages de risque' : `${conn.riskPercent || 1} % de risque par position`;
    body.innerHTML = step(1, !!conn.broker, 'Ton broker ou ta propfirm', `${broker} — ${esc(risk)}`, '<button type="button" class="chest-btn-2" data-br-drawer>' + (conn.broker ? 'Modifier' : 'Renseigner') + '</button>')
      + step(2, vps.length > 0, 'Ton VPS', vps.length ? `Relié : ${vps.map((v) => esc(v.name)).join(', ')}. Les positions de BERICH arrivent sur ce compte.` : 'Pas encore relié. Le VPS fait tourner MetaTrader 5 en continu, même ordinateur éteint.', vps.length ? '<a class="chest-btn-2" href="berich.html">Voir BERICH</a>' : '<a class="chest-btn" href="connect.html?plan=pro&from=berich">Initialiser mon compte</a>')
      + `<p class="acc-step__note">Ton mot de passe de trading reste sur cet appareil : il n’est jamais envoyé à CHEST.</p>`;
    brRow.hidden = true;
    renumber();
  }
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-br-drawer]')) return;
    const b = document.querySelector('#connexion [data-open-drawer]'); if (b) b.click();
  });

  // ---------- Apparence : mode + couleur du thème sur la carte
  const app = cards.apparence && cards.apparence.querySelector('.acc-card__b');
  if (app && T && T.ACCENTS) {
    const oldRow = document.getElementById('themeRowValue');
    if (oldRow) { const r = oldRow.closest('.settings-row'); if (r) r.hidden = true; }
    const box = document.createElement('div');
    box.className = 'acc-look';
    box.innerHTML = `<div class="acc-look__row"><div class="acc-look__t"><b>Mode</b><span>Sombre ou clair, pour tout le site.</span></div>
        <div class="chest-seg acc-mode" role="radiogroup" aria-label="Mode d’affichage">${[['dark', 'Sombre'], ['light', 'Clair']].map(([v, l]) => `<button type="button" role="radio" data-mode="${v}">${l}</button>`).join('')}</div></div>
      <div class="acc-look__row acc-look__row--col"><div class="acc-look__t"><b>Couleur du thème</b><span>Le duo de couleurs des boutons, lueurs et dégradés.</span></div>
        <div class="acc-swatches" role="radiogroup" aria-label="Couleur du thème">${Object.entries(T.ACCENTS).map(([k, a]) => `<button type="button" role="radio" class="acc-sw" data-accent="${k}" style="--s1:${a[1]};--s2:${a[3]}"><i></i><span>${esc(a[0])}</span></button>`).join('')}</div></div>`;
    app.prepend(box);
    const paint = () => {
      box.querySelectorAll('[data-mode]').forEach((b) => { const on = b.dataset.mode === T.current(); b.classList.toggle('is-active', on); b.setAttribute('aria-checked', String(on)); });
      box.querySelectorAll('[data-accent]').forEach((b) => { const on = b.dataset.accent === T.accent(); b.classList.toggle('is-on', on); b.setAttribute('aria-checked', String(on)); });
    };
    box.addEventListener('click', (e) => {
      const m = e.target.closest('[data-mode]'); if (m) { T.set(m.dataset.mode); paint(); return; }
      const a = e.target.closest('[data-accent]'); if (a) { T.setAccent(a.dataset.accent); paint(); }
    });
    document.addEventListener('chest:theme', paint);
    paint();
  }
})();
