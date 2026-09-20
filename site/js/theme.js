(() => {
  'use strict';
  const KEY = 'chest_theme';

  // ---------- Site unifié : shell (app.html) + pages embarquées ----------
  // Chaque page reste un fichier autonome, mais une fois ouverte elle vit
  // dans app.html : la sidebar et la barre du haut ne se rechargent jamais,
  // seul le contenu change. Ce fichier est chargé en tout premier dans le
  // <head> de chaque page, donc c'est ici que la page sait où elle est.
  const file = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '');
  const APP_PAGES = ['dashboard', 'backtesting', 'journal', 'strategies', 'calendar', 'berich', 'account',
    'admin-members', 'backtest-add', 'backtest-view', 'strategy-example'];
  const AUTH_PAGES = ['login', 'signup', 'index'];
  let framed = false;
  try { framed = window.self !== window.top; } catch (e) { framed = true; }

  if (framed) {
    const root = document.documentElement;
    if (AUTH_PAGES.includes(file)) {
      // Connexion/deconnexion/session expiree : jamais affichees DANS le shell,
      // on sort de l'iframe pour que la page occupe tout l'ecran.
      try { window.top.location.replace(file + '.html' + location.search); } catch (e) { /* tant pis */ }
    } else {
      root.classList.add('is-embedded');
      // Prévient le shell dès qu'on quitte la page (lien, redirection...) :
      // il lance le fondu de sortie + la barre de progression.
      window.addEventListener('beforeunload', () => {
        try { window.parent.postMessage({ type: 'chest:nav-start' }, '*'); } catch (e) { /* tant pis */ }
      });
    }
  } else if (APP_PAGES.includes(file)) {
    // Page ouverte "a nu" (favori, ancien lien, rechargement) : on la remet
    // dans le shell, en conservant ses parametres (?id=...).
    window.location.replace('app.html#/' + file + location.search);
  }

  function apply(theme) {
    if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
  }

  function current() {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  }

  function toggle() {
    const next = current() === 'light' ? 'dark' : 'light';
    localStorage.setItem(KEY, next);
    apply(next);
    document.dispatchEvent(new CustomEvent('chest:theme', { detail: next }));
    return next;
  }

  // Applied immediately on script load (placed early in <head>) to avoid a flash.
  apply(current());

  window.CHESTTheme = { apply, current, toggle };
})();
