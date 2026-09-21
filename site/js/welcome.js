(() => {
  'use strict';
  // CHEST · Page « Welcome » (posée avant le shell, dans le même défilement).
  //
  // La page défile nativement : hero (100vh), Newsletter, puis le shell
  // (le dashboard) qui suit dans le flux. Rien n'est en surimpression, donc
  // le dashboard arrive collé sous la Newsletter, au pixel près, sans retard.
  // Quand le sommet du dashboard atteint le haut de l'écran, on retire le
  // calque et on remet le défilement à 0 dans la même image : visuellement rien
  // ne bouge, mais il n'y a plus rien au-dessus, on ne peut plus remonter.
  //
  // Contrat : sessionStorage `chest_welcome`, #chestWelcome, classe
  // `is-welcome` sur <html>, window.CHESTWelcome.show() / .close().

  const FLAG = 'chest_welcome';
  const root = document.getElementById('chestWelcome');
  if (!root) return;

  const html = document.documentElement;
  const shell = document.getElementById('chestShell');
  const nameEl = document.getElementById('welName');
  const skipBtn = document.getElementById('welSkip');
  const stars = document.getElementById('welStars');
  const hero = root.querySelector('.wel__hero');
  const sheet = document.getElementById('welSheet');
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let closed = true;
  let sraf = null;
  let mraf = null;
  let settleTimer = null;
  let touching = false;
  let lastFocus = null;

  // Position du dashboard dans la page = fin de la Newsletter.
  const endY = () => shell.getBoundingClientRect().top + window.scrollY;
  const vh = () => window.innerHeight;
  const scrollTo = (top) => window.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });

  /* ---------- Prénom ---------- */
  function firstName() {
    try {
      const u = window.CHESTAccounts && CHESTAccounts.getUser();
      const n = u && u.firstName ? String(u.firstName).trim() : '';
      return n ? n.charAt(0).toLocaleUpperCase('fr-FR') + n.slice(1) : '';
    } catch (e) { return ''; }
  }

  /* ---------- Compteur de nouveautés ---------- */
  const cards = () => root.querySelectorAll('[data-news-id]');
  function newsCount() {
    const list = cards();
    if (!list.length) return 0;
    let seen = [];
    try { seen = JSON.parse(localStorage.getItem('chest_news_seen') || '[]'); } catch (e) { seen = []; }
    let n = 0;
    list.forEach((c) => { if (seen.indexOf(c.dataset.newsId) === -1) n++; });
    return n;
  }
  function markNewsSeen() {
    const ids = [].map.call(cards(), (c) => c.dataset.newsId);
    if (!ids.length) return;
    try {
      const seen = JSON.parse(localStorage.getItem('chest_news_seen') || '[]');
      ids.forEach((id) => { if (seen.indexOf(id) === -1) seen.push(id); });
      localStorage.setItem('chest_news_seen', JSON.stringify(seen.slice(-40)));
    } catch (e) { /* stockage indisponible : sans conséquence */ }
  }

  /* ---------- La lumière suit le curseur ---------- */
  function onMove(e) {
    if (mraf || closed) return;
    mraf = requestAnimationFrame(() => {
      mraf = null;
      const r = hero.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const fx = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      const fy = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
      root.style.setProperty('--mx', (fx * 100).toFixed(1) + '%');
      root.style.setProperty('--my', (fy * 100).toFixed(1) + '%');
      root.style.setProperty('--px', (fx * 2 - 1).toFixed(3));
      root.style.setProperty('--py', (fy * 2 - 1).toFixed(3));
    });
  }

  /* ---------- Défilement ---------- */
  function onScroll() {
    if (closed || sraf) return;
    sraf = requestAnimationFrame(() => {
      sraf = null;
      if (closed) return;
      const end = endY();
      const y = window.scrollY;
      if (y >= end - 1) { finish(); return; }
      // r = part du dashboard déjà visible (0 = tout juste caché, 1 = plein écran)
      const r = (y - (end - vh())) / vh();
      root.classList.toggle('is-past', r > 0.06);
      clearTimeout(settleTimer);
      if (r > 0 && !touching && !sheet.classList.contains('is-open')) settleTimer = setTimeout(settle, 150);
    });
  }
  // Lâché à mi-chemin : au-delà de 25 % le dashboard finit d'arriver, sinon il repart.
  function settle() {
    if (closed || touching) return;
    const end = endY();
    const r = (window.scrollY - (end - vh())) / vh();
    if (r <= 0 || r >= 1) return;
    scrollTo(r > 0.25 ? end : end - vh());
  }

  /* ---------- Sortie : plus rien au-dessus ---------- */
  function finish() {
    if (closed) return;
    closed = true;
    clearTimeout(settleTimer);
    closeSheet(true);
    markNewsSeen();
    try { sessionStorage.removeItem(FLAG); } catch (e) {}
    // Dans la même image : le calque disparaît et le dashboard prend sa place en haut.
    root.hidden = true;
    root.classList.remove('is-past');
    html.classList.remove('is-welcome');
    if (shell) shell.removeAttribute('inert');
    window.scrollTo(0, 0);
    window.dispatchEvent(new Event('resize'));
  }

  // Descente directe (cloche, repère, Échap) : même trajet, en douceur.
  function glide() {
    if (closed) return;
    scrollTo(endY());
    setTimeout(() => { if (!closed && window.scrollY >= endY() - 2) finish(); }, 1500);
  }

  /* ---------- Ciel étoilé ---------- */
  function paintStars() {
    if (!stars || reduce) return;
    const w = stars.offsetWidth, h = stars.offsetHeight;
    if (!w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    stars.width = w * dpr; stars.height = h * dpr;
    const ctx = stars.getContext('2d');
    ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h);
    const n = Math.round((w * h) / 12000);
    for (let i = 0; i < n; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = Math.random() * 1.05 + 0.22;
      const edge = Math.min(1, Math.abs(x / w - 0.5) * 2.3 + Math.abs(y / h - 0.42) * 1.5);
      ctx.globalAlpha = (0.1 + Math.random() * 0.5) * edge;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  /* ---------- Fenêtre d'une nouveauté ---------- */
  function openSheet(card) {
    const full = card.querySelector('.wel__card-full');
    const media = card.querySelector('.wel__card-media');
    document.getElementById('welSheetTitle').textContent = (card.querySelector('.wel__card-title') || {}).textContent || '';
    document.getElementById('welSheetTag').textContent = card.dataset.tag || '';
    document.getElementById('welSheetDate').textContent = card.dataset.date || '';
    document.getElementById('welSheetText').innerHTML = full ? full.innerHTML : '';
    const sm = document.getElementById('welSheetMedia');
    const img = media && media.style.getPropertyValue('--img');
    if (img) sm.style.setProperty('--img', img); else sm.style.removeProperty('--img');
    lastFocus = document.activeElement;
    sheet.classList.add('is-open');
    html.classList.add('is-sheet');
    sheet.querySelector('.wel__sheet-win').scrollTop = 0;
    sheet.querySelector('[data-wel-close]').focus({ preventScroll: true });
  }
  function closeSheet(silent) {
    if (!sheet.classList.contains('is-open')) return;
    sheet.classList.remove('is-open');
    html.classList.remove('is-sheet');
    if (!silent && lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  /* ---------- Ouverture ---------- */
  function show() {
    closed = false;
    root.hidden = false;
    root.classList.remove('is-past');
    html.classList.add('is-welcome');
    if (shell) shell.setAttribute('inert', ''); // le dashboard n'est ni cliquable ni atteignable au clavier tant qu'on n'y est pas
    root.style.setProperty('--mx', '50%');
    root.style.setProperty('--my', '22%');
    root.style.setProperty('--px', '0');
    root.style.setProperty('--py', '0');

    const n = firstName();
    if (nameEl) nameEl.textContent = n;
    if (skipBtn) skipBtn.setAttribute('data-count', String(newsCount()));

    window.scrollTo(0, 0);
    requestAnimationFrame(paintStars);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  /* ---------- Branchements ---------- */
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('touchstart', () => { touching = true; clearTimeout(settleTimer); }, { passive: true });
  const release = () => { touching = false; if (!closed) settleTimer = setTimeout(settle, 150); };
  window.addEventListener('touchend', release, { passive: true });
  window.addEventListener('touchcancel', release, { passive: true });
  if (hero) hero.addEventListener('mousemove', onMove, { passive: true });
  window.addEventListener('resize', () => { if (!closed) { paintStars(); onScroll(); } });

  if (skipBtn) skipBtn.addEventListener('click', glide);
  root.querySelectorAll('[data-wel-next]').forEach((b) => b.addEventListener('click', () => {
    scrollTo(Math.min(vh(), endY() - vh()));
  }));

  // Une carte s'ouvre au clic (ou Entrée / Espace) dans une fenêtre.
  root.addEventListener('click', (e) => {
    const card = e.target.closest && e.target.closest('.wel__card');
    if (card && root.contains(card)) { openSheet(card); return; }
    if (e.target === sheet || (e.target.closest && e.target.closest('[data-wel-close]'))) closeSheet();
  });
  root.addEventListener('keydown', (e) => {
    const card = e.target.closest && e.target.closest('.wel__card');
    if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openSheet(card); }
  });

  document.addEventListener('keydown', (e) => {
    if (closed || root.hidden) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (sheet.classList.contains('is-open')) closeSheet(); else glide();
    }
  });

  // Clic sur le logo CHEST de la barre du haut : rouvrir le Welcome (le dashboard est dessous).
  document.addEventListener('click', (e) => {
    const brand = e.target.closest && e.target.closest('.chest-topbar .brand');
    if (!brand) return;
    e.preventDefault();
    if (location.hash !== '#/dashboard') location.hash = '#/dashboard';
    show();
  });

  let wanted = false;
  try { wanted = sessionStorage.getItem(FLAG) === '1'; } catch (e) {}
  if (wanted) {
    if (location.hash && location.hash !== '#/dashboard' && location.hash !== '#/') location.hash = '#/dashboard';
    show();
  } else {
    root.hidden = true;
  }

  window.CHESTWelcome = { show, close: finish };
})();
