// CHEST · Page « Welcome » (par-dessus le shell app.html).
// - S'ouvre à chaque connexion (login.html pose `chest_welcome` en sessionStorage) et au clic sur le logo « CHEST » en haut à gauche.
// - On la fait défiler vers le bas : elle monte et laisse apparaître le dashboard ; une fois tout en bas elle disparaît
//   et on ne peut plus y remonter (seul le logo la rouvre).
(() => {
  'use strict';

  const FLAG = 'chest_welcome';
  const root = document.getElementById('chestWelcome');
  if (!root) return;
  const scroller = document.getElementById('welScroll');
  const shell = document.getElementById('chestShell');
  const cue = document.getElementById('welCue');
  const canvas = document.getElementById('welStars');
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const html = document.documentElement;

  let open = false;
  let touching = false;
  let settleTimer = null;
  let raf = 0;
  let stars = [];
  let starsRaf = 0;

  const maxScroll = () => Math.max(1, scroller.scrollHeight - scroller.clientHeight);
  const progress = () => Math.min(1, scroller.scrollTop / maxScroll());

  // ---------- Étoiles : quelques points qui scintillent, très discrets ----------
  function resizeStars() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = root.clientWidth, h = root.clientHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const n = Math.round((w * h) / 9000);
    stars = Array.from({ length: n }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height, r: (Math.random() * 1.1 + .3) * dpr,
      a: Math.random() * .6 + .15, t: Math.random() * Math.PI * 2, s: Math.random() * .015 + .004, vy: (Math.random() * .05 + .01) * dpr,
    }));
  }
  function drawStars() {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    stars.forEach((st) => {
      st.t += st.s; st.y -= st.vy; if (st.y < -2) { st.y = canvas.height + 2; st.x = Math.random() * canvas.width; }
      ctx.globalAlpha = st.a * (0.55 + 0.45 * Math.sin(st.t));
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
    if (open && !reduce) starsRaf = requestAnimationFrame(drawStars);
  }

  // ---------- Défilement : progression, aimantation, fin ----------
  function paint() {
    raf = 0;
    html.style.setProperty('--wel-p', progress().toFixed(4));
  }
  function finish() {
    if (!open) return;
    open = false;
    clearTimeout(settleTimer);
    cancelAnimationFrame(starsRaf);
    root.hidden = true;
    root.classList.remove('is-in');
    html.classList.remove('is-welcome');
    html.style.removeProperty('--wel-p');
    if (shell) shell.removeAttribute('inert');
    window.scrollTo(0, 0);
  }
  function settle() {
    if (!open || touching) return;
    const p = progress();
    if (p >= .995) { finish(); return; }
    scroller.scrollTo({ top: p > .3 ? maxScroll() : 0, behavior: reduce ? 'auto' : 'smooth' });
  }
  scroller.addEventListener('scroll', () => {
    if (!open) return;
    if (!raf) raf = requestAnimationFrame(paint);
    if (progress() >= .995) { finish(); return; }
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settle, 160);
  }, { passive: true });
  scroller.addEventListener('touchstart', () => { touching = true; clearTimeout(settleTimer); }, { passive: true });
  scroller.addEventListener('touchend', () => { touching = false; settleTimer = setTimeout(settle, 120); }, { passive: true });
  scroller.addEventListener('touchcancel', () => { touching = false; settleTimer = setTimeout(settle, 120); }, { passive: true });
  const enter = () => scroller.scrollTo({ top: maxScroll(), behavior: reduce ? 'auto' : 'smooth' });
  cue.addEventListener('click', enter);
  scroller.addEventListener('keydown', (e) => {
    if (['ArrowDown', 'PageDown', 'End', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); enter(); }
  });
  // lueur qui suit doucement le curseur
  root.addEventListener('pointermove', (e) => {
    const r = root.getBoundingClientRect();
    root.style.setProperty('--mx', ((e.clientX - r.left) / r.width - .5) * 60 + 'px');
    root.style.setProperty('--my', ((e.clientY - r.top) / r.height - .5) * 40 + 'px');
  });
  window.addEventListener('resize', () => { if (open) resizeStars(); });

  // ---------- Ouverture ----------
  function firstName() {
    try { const u = window.CHESTAccounts && CHESTAccounts.getUser(); return u && u.firstName ? String(u.firstName).trim() : ''; } catch (e) { return ''; }
  }
  function show() {
    const name = firstName();
    document.getElementById('welName').textContent = name;
    document.getElementById('welName').hidden = !name;
    const h = new Date().getHours();
    document.getElementById('welHello').textContent = h >= 18 || h < 5 ? 'Bonsoir' : 'Bonjour';
    open = true;
    root.hidden = false;
    html.classList.add('is-welcome');
    html.style.setProperty('--wel-p', '0');
    if (shell) shell.setAttribute('inert', '');
    scroller.scrollTop = 0;
    resizeStars();
    cancelAnimationFrame(starsRaf);
    drawStars();
    root.classList.remove('is-in');
    void root.offsetWidth; // relance l'animation d'entrée
    root.classList.add('is-in');
    scroller.focus({ preventScroll: true });
  }

  // clic sur le logo CHEST (en haut à gauche) : retour au dashboard sous la page Welcome
  const brand = document.querySelector('.chest-topbar .brand');
  if (brand) {
    brand.addEventListener('click', (e) => {
      e.preventDefault();
      if (location.hash !== '#/dashboard') location.hash = '#/dashboard';
      show();
    });
  }

  // à la connexion
  let fresh = false;
  try { fresh = sessionStorage.getItem(FLAG) === '1'; sessionStorage.removeItem(FLAG); } catch (e) { /* tant pis */ }
  if (fresh) {
    if (location.hash && location.hash !== '#/dashboard' && location.hash !== '#/') location.hash = '#/dashboard';
    show();
  }

  window.CHESTWelcome = { show };
})();
