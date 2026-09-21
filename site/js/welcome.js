(() => {
  'use strict';
  // CHEST · Page « Welcome » (par-dessus la coque de app.html).
  //
  // Le défilement est RÉEL : le calque contient son propre scroll avec
  // deux écrans opaques (hero, nouveautés) puis un troisième transparent.
  // En traversant ce dernier, on découvre le site qui attend dessous —
  // il n'y a donc pas de fondu, la page arrive comme dans un scroll
  // normal. Arrivé en bas, tout se verrouille : plus de retour en arrière.
  //
  // Contrat inchangé : sessionStorage `chest_welcome`, #chestWelcome,
  // #welScroll, classe `is-welcome` sur <html>, window.CHESTWelcome.show().

  const FLAG = 'chest_welcome';
  const root = document.getElementById('chestWelcome');
  if (!root) return;

  const scroller = document.getElementById('welScroll');
  const html = document.documentElement;
  const nameEl = document.getElementById('welName');
  const helloEl = document.getElementById('welHello');
  const skipBtn = document.getElementById('welSkip');
  const exitEl = root.querySelector('.wel__exit');
  const stars = document.getElementById('welStars');
  const hero = root.querySelector('.wel__page');
  const shell = document.getElementById('chestShell');
  let settleTimer = null;

  let closed = false;
  let sraf = null;
  let mraf = null;

  /* ---------- Prénom et salutation ---------- */
  function firstName() {
    try {
      const u = window.CHESTAccounts && CHESTAccounts.getUser();
      const n = u && u.firstName ? String(u.firstName).trim() : '';
      return n ? n.charAt(0).toLocaleUpperCase('fr-FR') + n.slice(1) : '';
    } catch (e) { return ''; }
  }
  function greeting() {
    const h = new Date().getHours();
    if (h < 6) return 'Bonne nuit';
    if (h < 12) return 'Bonjour';
    if (h < 18) return 'Bon après-midi';
    return 'Bonsoir';
  }

  /* ---------- Compteur de nouveautés ---------- */
  function newsCount() {
    const cards = root.querySelectorAll('[data-news-id]');
    if (!cards.length) return 0;
    let seen = [];
    try { seen = JSON.parse(localStorage.getItem('chest_news_seen') || '[]'); } catch (e) { seen = []; }
    let n = 0;
    cards.forEach((c) => { if (seen.indexOf(c.dataset.newsId) === -1) n++; });
    return n;
  }
  function markNewsSeen() {
    const ids = [].map.call(root.querySelectorAll('[data-news-id]'), (c) => c.dataset.newsId);
    if (!ids.length) return;
    try {
      const seen = JSON.parse(localStorage.getItem('chest_news_seen') || '[]');
      ids.forEach((id) => { if (seen.indexOf(id) === -1) seen.push(id); });
      localStorage.setItem('chest_news_seen', JSON.stringify(seen.slice(-40)));
    } catch (e) { /* stockage indisponible : sans conséquence */ }
  }

  /* ---------- La lumière suit le curseur ---------- */
  function onMove(e) {
    if (mraf || closed || root.hidden) return;
    mraf = requestAnimationFrame(() => {
      mraf = null;
      const r = root.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const x = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
      const y = Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100));
      root.style.setProperty('--mx', x.toFixed(1) + '%');
      root.style.setProperty('--my', y.toFixed(1) + '%');
    });
  }

  /* ---------- Défilement : le menu se pose à l'approche du site ---------- */
  function onScroll() {
    if (closed || sraf) return;
    sraf = requestAnimationFrame(() => {
      sraf = null;
      if (!exitEl) return;
      const top = exitEl.offsetTop;
      const h = scroller.clientHeight;
      // Le menu commence à apparaître sur la dernière moitié d'écran.
      const t = Math.max(0, Math.min(1, (scroller.scrollTop - (top - h * 0.55)) / (h * 0.55)));
      html.style.setProperty('--wel-in', t.toFixed(3));
      if (scroller.scrollTop >= top - 2) { finish(); return; }
      // Lâché en cours de route dans la zone transparente : on finit le trajet (plus de demi-état).
      clearTimeout(settleTimer);
      if (t > 0) settleTimer = setTimeout(() => { if (!closed && t > 0.25) glide(); }, 220);
    });
  }

  /* ---------- Sortie : on ne remonte plus ---------- */
  function finish() {
    if (closed) return;
    closed = true;
    clearTimeout(settleTimer);
    markNewsSeen();
    try { sessionStorage.removeItem(FLAG); } catch (e) {}

    root.classList.add('is-locked');
    if (exitEl) scroller.scrollTop = exitEl.offsetTop;
    html.style.setProperty('--wel-in', '1');

    // Le calque s'efface une fois le site entièrement découvert.
    setTimeout(() => {
      root.classList.add('is-gone');
      html.classList.remove('is-welcome');
      setTimeout(() => {
        root.hidden = true;
        root.classList.remove('is-gone', 'is-locked');
        html.style.removeProperty('--wel-in');
        if (shell) shell.removeAttribute('inert');
        window.dispatchEvent(new Event('resize'));
      }, 320);
    }, 340);
  }

  // Descente directe (cloche, boutons, Échap) : même trajet, en plus rapide.
  function glide() {
    if (closed || !exitEl) return;
    scroller.scrollTo({ top: exitEl.offsetTop, behavior: 'smooth' });
    setTimeout(finish, 850);
  }

  /* ---------- Ciel étoilé ---------- */
  function paintStars() {
    if (!stars) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const w = stars.offsetWidth, h = stars.offsetHeight;
    if (!w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    stars.width = w * dpr; stars.height = h * dpr;
    const ctx = stars.getContext('2d');
    ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h);
    const n = Math.round((w * h) / 13000);
    for (let i = 0; i < n; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = Math.random() * 1.05 + 0.22;
      const edge = Math.min(1, Math.abs(x / w - 0.5) * 2.3 + Math.abs(y / h - 0.42) * 1.5);
      ctx.globalAlpha = (0.1 + Math.random() * 0.48) * edge;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  /* ---------- Ouverture ---------- */
  function show() {
    closed = false;
    root.hidden = false;
    root.classList.remove('is-gone', 'is-locked');
    html.classList.add('is-welcome');
    html.style.setProperty('--wel-in', '0');
    if (shell) shell.setAttribute('inert', ''); // le site dessous n'est pas atteignable au clavier tant que Welcome est là
    root.style.setProperty('--mx', '50%');
    root.style.setProperty('--my', '22%');

    const n = firstName();
    if (nameEl) nameEl.textContent = n;
    if (helloEl) helloEl.textContent = n ? greeting() : 'Bienvenue';
    if (skipBtn) skipBtn.setAttribute('data-count', String(newsCount()));

    // Les cartes repartent fermées à chaque ouverture.
    root.querySelectorAll('.wel__card.is-open').forEach((c) => c.classList.remove('is-open'));

    scroller.scrollTop = 0;
    requestAnimationFrame(paintStars);
    scroller.focus({ preventScroll: true });
  }

  /* ---------- Branchements ---------- */
  scroller.addEventListener('scroll', onScroll, { passive: true });
  if (hero) hero.addEventListener('mousemove', onMove, { passive: true });
  window.addEventListener('resize', () => { paintStars(); onScroll(); });

  if (skipBtn) skipBtn.addEventListener('click', glide);
  root.querySelectorAll('[data-wel-enter]').forEach((b) => b.addEventListener('click', glide));
  root.querySelectorAll('[data-wel-next]').forEach((b) => b.addEventListener('click', () => {
    scroller.scrollBy({ top: scroller.clientHeight, behavior: 'smooth' });
  }));

  // Une carte s'ouvre au clic et déroule son explication.
  root.addEventListener('click', (e) => {
    const card = e.target.closest && e.target.closest('.wel__card');
    if (!card || !root.contains(card)) return;
    const wasOpen = card.classList.contains('is-open');
    root.querySelectorAll('.wel__card.is-open').forEach((c) => c.classList.remove('is-open'));
    if (!wasOpen) card.classList.add('is-open');
  });

  document.addEventListener('keydown', (e) => {
    if (root.hidden || closed) return;
    if (e.key === 'Escape') { e.preventDefault(); glide(); }
  });

  // Clic sur le logo CHEST de la barre du haut : rouvrir le Welcome.
  document.addEventListener('click', (e) => {
    const brand = e.target.closest && e.target.closest('.chest-topbar .brand');
    if (!brand) return;
    e.preventDefault();
    if (location.hash !== '#/dashboard') location.hash = '#/dashboard'; // le site qui attend dessous est le dashboard
    show();
  });

  let wanted = false;
  try { wanted = sessionStorage.getItem(FLAG) === '1'; } catch (e) {}
  if (wanted) {
    if (location.hash && location.hash !== '#/dashboard' && location.hash !== '#/') location.hash = '#/dashboard';
    show();
  } else root.hidden = true;

  window.CHESTWelcome = { show, close: finish };
})();
