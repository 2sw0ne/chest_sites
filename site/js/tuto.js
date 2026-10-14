/* ============================================================
   CHEST — vidéo de présentation (tutoriel), jouée dans app.html
   - Obligatoire à la première connexion d'un nouveau membre (`tutoSeen === false`, fourni par le serveur de
     comptes) : impossible à passer, sans croix.
   - Le logo du Welcome la relance pour tout le monde ; une croix en haut à droite permet de l'arrêter dès
     qu'on l'a déjà vue une fois en entier.
   - Vidéo MP4 (assets/tuto/chest-tuto.mp4, fournie par l'utilisateur, ré-encodée pour le web) : sans contrôles,
     impossible à avancer ; la couche s'efface pendant les 3 dernières secondes et laisse apparaître la page (le
     Welcome), puis le serveur retient qu'elle a été vue.
   - Son : lancée avec le son ; si le navigateur refuse (lecture sans clic, ex. rechargement de page), elle
     démarre muette avec un bouton « Activer le son ».
   Filet de sécurité : si la vidéo ne démarre pas (réseau…), la croix apparaît au bout de 15 s pour ne
   jamais bloquer quelqu'un devant un écran noir.
   ============================================================ */
(() => {
  'use strict';
  const FADE_MS = 3000;
  const html = document.documentElement;
  const SRC = 'assets/tuto/chest-tuto.mp4?v=1';
  let el = null, video = null, closeBtn = null, soundBtn = null, state = null, raf = 0;

  function build() {
    if (el) return;
    el = document.createElement('div');
    el.className = 'tuto';
    el.id = 'chestTuto';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Présentation de CHEST');
    el.innerHTML = `
      <video class="tuto__video" playsinline preload="none" poster="assets/tuto/chest-tuto-poster.jpg" disablepictureinpicture controlslist="nodownload nofullscreen noremoteplayback"></video>
      <div class="tuto__veil" aria-hidden="true"></div>
      <button type="button" class="tuto__sound" hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>
        <span>Activer le son</span>
      </button>
      <button type="button" class="tuto__close" aria-label="Fermer la présentation" hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18" stroke-linecap="round"/></svg>
      </button>`;
    document.body.appendChild(el);
    video = el.querySelector('.tuto__video');
    closeBtn = el.querySelector('.tuto__close');
    soundBtn = el.querySelector('.tuto__sound');
    closeBtn.addEventListener('click', () => stop(false));
    soundBtn.addEventListener('click', () => { video.muted = false; soundBtn.hidden = true; video.play().catch(() => {}); });
    // Impossible d'avancer : un saut dans la vidéo est ramené au dernier point regardé (sauf relecture fermable)
    let watched = 0;
    video.addEventListener('timeupdate', () => { if (!video.seeking) watched = Math.max(watched, video.currentTime); });
    video.addEventListener('seeking', () => { if (state && state.mandatory && video.currentTime > watched + 1) video.currentTime = watched; });
    video.addEventListener('playing', () => { if (state && !state.started) { state.started = true; el.classList.add('is-playing'); } });
    video.addEventListener('ended', () => stop(true));
    // Une pause imposée par le système (onglet caché…) reprend dès que possible : la vidéo ne se met pas en pause
    video.addEventListener('pause', () => { if (state && !video.ended && !document.hidden) video.play().catch(() => {}); });
    document.addEventListener('visibilitychange', () => { if (state && !document.hidden && video.paused && !video.ended) video.play().catch(() => {}); });
    video.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', (e) => {
      if (!state) return;
      if (state.closable && e.key === 'Escape') { stop(false); return; }
      if (state.mandatory && [' ', 'k', 'K', 'ArrowLeft', 'ArrowRight', 'j', 'J', 'l', 'L'].includes(e.key)) e.preventDefault();
    }, true);
    video._resetWatched = () => { watched = 0; };
  }

  // Fondu des 3 dernières secondes, lu à chaque image (timeupdate ne passe que ~4 fois par seconde)
  function fadeLoop() {
    if (!state) { raf = 0; return; }
    const d = video.duration;
    if (d && isFinite(d)) {
      const remaining = (d - video.currentTime) * 1000;
      el.style.opacity = remaining < FADE_MS ? String(Math.max(0, remaining / FADE_MS)) : '1';
    }
    raf = requestAnimationFrame(fadeLoop);
  }

  function user() { return (window.CHESTAccounts && CHESTAccounts.getUser && CHESTAccounts.getUser()) || null; }
  // Vue = tout ce qui n'est pas explicitement « pas vue » (un membre connecté avant cette fonctionnalité n'a pas le champ).
  function seen() { const u = user(); return !u || u.tutoSeen !== false; }

  function play(opts) {
    const o = opts || {};
    build();
    if (state) return;
    state = { mandatory: !!o.mandatory, closable: !o.mandatory, onDone: o.onDone || null, started: false };
    closeBtn.hidden = state.mandatory;
    soundBtn.hidden = true;
    el.classList.remove('is-playing', 'is-out');
    el.style.opacity = '';
    el.hidden = false;
    html.classList.add('is-tuto');
    video._resetWatched();
    video.muted = false;
    video.src = SRC;
    video.currentTime = 0;
    const p = video.play();
    if (p && p.catch) p.catch(() => {
      // Lecture avec le son refusée (pas de clic récent) : on démarre muet, le son s'active d'un clic
      if (!state) return;
      video.muted = true;
      soundBtn.hidden = false;
      video.play().catch(() => {});
    });
    state.guard = setTimeout(() => {
      if (state && !state.started) { state.closable = true; closeBtn.hidden = false; }
    }, 15000);
    if (!raf) raf = requestAnimationFrame(fadeLoop);
    if (!state.mandatory) setTimeout(() => closeBtn.focus({ preventScroll: true }), 50);
  }

  async function stop(complete) {
    const s = state;
    if (!s) return;
    state = null;
    clearTimeout(s.guard);
    const hide = () => {
      el.hidden = true;
      el.classList.remove('is-playing', 'is-out');
      el.style.opacity = '';
      video.pause();
      video.removeAttribute('src');
      video.load(); // libère la vidéo (mémoire, réseau)
      html.classList.remove('is-tuto');
    };
    if (complete) hide(); // déjà à opacité 0 : la page est visible
    else { el.classList.add('is-out'); video.pause(); setTimeout(hide, 460); }
    if (complete && !seen() && window.CHESTAccounts && CHESTAccounts.markTutoSeen) {
      try { await CHESTAccounts.markTutoSeen(); } catch (err) { /* sera redemandée à la prochaine connexion */ }
    }
    if (s.onDone) s.onDone(complete);
  }

  // Joue la vidéo si elle est obligatoire pour ce membre ; renvoie vrai si elle a démarré.
  function playIfRequired(onDone) {
    if (!(window.CHESTAccounts && CHESTAccounts.isLoggedIn && CHESTAccounts.isLoggedIn()) || seen()) return false;
    play({ mandatory: true, onDone });
    return true;
  }

  // Logo du Welcome : relance la présentation (fermable si déjà vue)
  function bindLogo() {
    const logo = document.querySelector('.wel__logo');
    if (!logo || logo.dataset.tuto) return;
    logo.dataset.tuto = '1';
    logo.setAttribute('role', 'button');
    logo.setAttribute('tabindex', '0');
    logo.setAttribute('aria-label', 'Voir la présentation de CHEST');
    logo.title = 'Voir la présentation';
    const go = () => play({ mandatory: !seen() });
    logo.addEventListener('click', go);
    logo.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  }

  window.CHESTTuto = { play, stop: () => stop(false), seen, playIfRequired };

  const boot = () => {
    bindLogo();
    // Déjà connecté au chargement (ex. page fermée pendant la vidéo) : toujours obligatoire tant qu'elle n'est pas vue.
    if (!html.classList.contains('is-loggedout')) playIfRequired();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
