/* ============================================================
   CHEST — vidéo de présentation (tutoriel), jouée dans app.html
   - Obligatoire à la première connexion d'un nouveau membre (`tutoSeen === false`, fourni par le serveur de
     comptes) : impossible à passer, sans croix.
   - Le logo du Welcome la relance pour tout le monde ; une croix en haut à droite permet de l'arrêter dès
     qu'on l'a déjà vue une fois en entier.
   - La vidéo (tuto.html) envoie le temps restant : la couche s'efface pendant les 3 dernières secondes et
     laisse apparaître la page (le Welcome), puis le serveur retient qu'elle a été vue.
   Filet de sécurité : si la vidéo ne démarre pas (réseau…), la croix apparaît au bout de 15 s pour ne
   jamais bloquer quelqu'un devant un écran noir.
   ============================================================ */
(() => {
  'use strict';
  const FADE_MS = 3000;
  const html = document.documentElement;
  let el = null, frame = null, closeBtn = null, state = null;

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
      <iframe class="tuto__frame" title="Présentation de CHEST"></iframe>
      <div class="tuto__veil" aria-hidden="true"></div>
      <button type="button" class="tuto__close" aria-label="Fermer la présentation" hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18" stroke-linecap="round"/></svg>
      </button>`;
    document.body.appendChild(el);
    frame = el.querySelector('.tuto__frame');
    closeBtn = el.querySelector('.tuto__close');
    closeBtn.addEventListener('click', () => stop(false));
    addEventListener('message', onMessage);
    addEventListener('keydown', (e) => { if (state && state.closable && e.key === 'Escape') stop(false); });
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
    el.classList.remove('is-playing', 'is-out');
    el.style.opacity = '';
    el.hidden = false;
    html.classList.add('is-tuto');
    frame.src = 'tuto.html?v=1&t=' + Date.now(); // repart toujours du début
    state.guard = setTimeout(() => {
      if (state && !state.started) { state.closable = true; closeBtn.hidden = false; }
    }, 15000);
    if (!state.mandatory) setTimeout(() => closeBtn.focus({ preventScroll: true }), 50);
  }

  function onMessage(e) {
    if (!state || !frame || e.source !== frame.contentWindow) return;
    const d = e.data || {};
    if (d.type === 'chest:tuto-ready' || d.type === 'chest:tuto') {
      if (!state.started) { state.started = true; el.classList.add('is-playing'); }
      if (d.type === 'chest:tuto') el.style.opacity = d.remaining < FADE_MS ? String(Math.max(0, d.remaining / FADE_MS)) : '1';
    } else if (d.type === 'chest:tuto-end') {
      stop(true);
    }
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
      frame.src = 'about:blank';
      html.classList.remove('is-tuto');
    };
    if (complete) hide(); // déjà à opacité 0 : la page est visible
    else { el.classList.add('is-out'); setTimeout(hide, 460); }
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
