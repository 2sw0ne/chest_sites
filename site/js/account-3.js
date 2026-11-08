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
      el.textContent = url ? '' : ini;
    });
    const del = document.getElementById('accPhotoDel'); if (del) del.hidden = !url;
  }
  async function shrink(file) {
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
  document.addEventListener('change', async (e) => {
    if (e.target.id !== 'accPhotoFile' || !e.target.files[0]) return;
    let blob;
    try { blob = await shrink(e.target.files[0]); } catch (err) { blob = e.target.files[0]; }
    const fd = new FormData(); fd.append('avatar', blob, 'avatar.jpg');
    send(fd, true);
    e.target.value = '';
  });
  document.addEventListener('click', (e) => { if (e.target.closest('#accPhotoDel')) send(JSON.stringify({ remove: true }), false); });
  paintPhoto();
  setTimeout(paintPhoto, 400); // le héros remet les initiales après coup

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
