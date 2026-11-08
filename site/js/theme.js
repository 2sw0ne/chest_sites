(() => {
  'use strict';
  const KEY = 'chest_theme';

  // ---------- Site unifié : shell (app.html) + pages embarquées ----------
  // Chaque page reste un fichier autonome, mais une fois ouverte elle vit
  // dans app.html : la sidebar et la barre du haut ne se rechargent jamais,
  // seul le contenu change. Ce fichier est chargé en tout premier dans le
  // <head> de chaque page, donc c'est ici que la page sait où elle est.
  const file = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '');
  const APP_PAGES = ['dashboard', 'backtesting', 'journal', 'strategies', 'calendar', 'berich', 'school', 'account',
    'admin-members', 'educator', 'suivi', 'backtest-add', 'backtest-view', 'strategy-example', 'vps-guide', 'connect'];
  const AUTH_PAGES = ['login', 'signup', 'index', 'offres'];
  let framed = false;
  try { framed = window.self !== window.top; } catch (e) { framed = true; }

  if (framed) {
    const root = document.documentElement;
    if (AUTH_PAGES.includes(file)) {
      // Connexion/deconnexion/session expiree : jamais affichees DANS le shell,
      // on sort de l'iframe pour que la page occupe tout l'ecran.
      const route = { login: '/connexion', signup: '/inscription', index: '/connexion', offres: '/offres' }[file];
      try { window.top.location.replace(route + location.search); } catch (e) { /* tant pis */ }
    } else {
      root.classList.add('is-embedded');
      // Prévient le shell dès qu'on quitte la page (lien, redirection...) :
      // il lance le fondu de sortie + la barre de progression.
      window.addEventListener('beforeunload', () => {
        try { window.parent.postMessage({ type: 'chest:nav-start' }, '*'); } catch (e) { /* tant pis */ }
      });
    }
  } else if (APP_PAGES.includes(file) && !document.documentElement.classList.contains('is-shell')) {
    // Page ouverte "a nu" (favori, ancien lien, rechargement) : on la remet
    // dans le shell, en conservant ses parametres (?id=...). /dashboard sert app.html
    // (vercel.json) : sans le test is-shell, le shell se redirigerait sur lui-même.
    window.location.replace('/' + file + location.search);
  }

  // Mode clair (2026-11-08) : les pages CHEST 2.0 sont dessinées en sombre ; le mode clair inverse le document du haut
  // (filtre invert + hue-rotate : les teintes restent, la luminosité s'inverse) et chaque document ré-inverse ses images,
  // vidéos, graphiques et drapeaux pour qu'ils gardent leurs vraies couleurs. Une page dans le shell n'inverse pas sa
  // racine : le filtre du shell s'applique déjà à son iframe. Attribut data-mode (l'ancien data-theme="light" des pages
  // v2 n'est plus posé : ses règles se cumuleraient avec l'inversion).
  // Couleurs du thème (chest_accent) : le duo rose → orange de CHEST devient --a1 / --a2 (et --a1-rgb / --a2-rgb pour
  // les transparences) ; toutes les feuilles les lisent avec le rose et l'orange d'origine en repli.
  const ACCENTS = {
    chest: ['CHEST', '#fc1283', '252, 18, 131', '#f9a45e', '249, 164, 94'],
    ocean: ['Océan', '#2f6bff', '47, 107, 255', '#7cc8ff', '124, 200, 255'],
    lagon: ['Lagon', '#06b6d4', '6, 182, 212', '#99f6e4', '153, 246, 228'],
    amethyste: ['Améthyste', '#8b5cf6', '139, 92, 246', '#e0b3ff', '224, 179, 255'],
    soleil: ['Soleil', '#f97316', '249, 115, 22', '#fcd34d', '252, 211, 77'],
    rubis: ['Rubis', '#e11d48', '225, 29, 72', '#fda4af', '253, 164, 175'],
    glace: ['Glace', '#e5e7eb', '229, 231, 235', '#8b95a5', '139, 149, 165'],
  };
  const ACC_KEY = 'chest_accent';
  function accent() { let k = ''; try { k = localStorage.getItem(ACC_KEY) || ''; } catch (e) {} return ACCENTS[k] ? k : 'chest'; }
  function paintAccent(k) {
    const a = ACCENTS[k] || ACCENTS.chest;
    let el = document.getElementById('chestAccentVars');
    if (!el) { el = document.createElement('style'); el.id = 'chestAccentVars'; (document.head || document.documentElement).appendChild(el); }
    el.textContent = `:root{--a1:${a[1]};--a1-rgb:${a[2]};--a2:${a[3]};--a2-rgb:${a[4]};}`
      + 'html[data-mode="light"]:not(.is-embedded){filter:invert(1) hue-rotate(180deg);}'
      + 'html[data-mode="light"] :is(img,video,canvas,picture,.fi,.no-invert){filter:invert(1) hue-rotate(180deg);}';
    document.documentElement.setAttribute('data-accent', k);
  }
  function setAccent(k) {
    if (!ACCENTS[k]) return;
    try { localStorage.setItem(ACC_KEY, k); } catch (e) {}
    paintAccent(k);
    document.dispatchEvent(new CustomEvent('chest:accent', { detail: k }));
  }

  function apply(theme) {
    if (theme === 'light') document.documentElement.setAttribute('data-mode', 'light');
    else document.documentElement.removeAttribute('data-mode');
    document.documentElement.removeAttribute('data-theme');
  }

  function current() {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  }

  function set(theme) {
    localStorage.setItem(KEY, theme === 'light' ? 'light' : 'dark');
    apply(current());
    document.dispatchEvent(new CustomEvent('chest:theme', { detail: current() }));
    return current();
  }
  function toggle() { return set(current() === 'light' ? 'dark' : 'light'); }

  // Appliqué dès le chargement (script en tête du <head>) pour éviter un flash ; suit les changements faits ailleurs
  // (autre page du shell, autre onglet).
  apply(current());
  paintAccent(accent());
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) apply(current());
    if (e.key === ACC_KEY) paintAccent(accent());
  });

  window.CHESTTheme = { apply, current, toggle, set, accent, setAccent, ACCENTS };

})();
