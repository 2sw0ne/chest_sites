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

  // Mode clair (2026-11-08, v2) : vrai thème clair. Les couleurs neutres et d'état du site sont des variables (voir LIGHT)
  // dont les valeurs claires sont posées ici sur html[data-mode="light"] ; les graphiques Vela passent en thème clair
  // (js/scanner-chart.js). L'ancien data-theme="light" des pages v2 n'est plus posé.
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
    emeraude: ['Émeraude', '#10b981', '16, 185, 129', '#a7f3d0', '167, 243, 208'],
    foret: ['Forêt', '#16a34a', '22, 163, 74', '#d9f99d', '217, 249, 157'],
    jade: ['Jade', '#0d9488', '13, 148, 136', '#5eead4', '94, 234, 212'],
    indigo: ['Indigo', '#4f46e5', '79, 70, 229', '#a5b4fc', '165, 180, 252'],
    sakura: ['Sakura', '#ec4899', '236, 72, 153', '#fbcfe8', '251, 207, 232'],
    corail: ['Corail', '#ff5a5f', '255, 90, 95', '#ffc8a2', '255, 200, 162'],
    cuivre: ['Cuivre', '#c2410c', '194, 65, 12', '#fdba74', '253, 186, 116'],
    nuit: ['Nuit', '#1e3a8a', '30, 58, 138', '#60a5fa', '96, 165, 250'],
  };
  const ACC_KEY = 'chest_accent';
  // Valeurs claires des variables posées dans toutes les feuilles (neutres, voiles, états) : en sombre elles ne sont
  // pas définies et chaque règle garde sa couleur d'origine (repli du var()).
  const LIGHT = 'html[data-mode="light"]{color-scheme:light;'
    + '--fg-rgb:18,18,30;--ink:#141419;--ink-1:#2c2c34;--ink-2:#565660;--ink-3:#787882;--ink-4:#9d9da6;'
    + '--bg-0:#f2f2f5;--bg0-rgb:242,242,245;--bg-1:#ffffff;--dk-rgb:255,255,255;--sh-k:.22;'
    + '--green:#0b9b69;--green-rgb:11,155,105;--green-hi:#08875b;--red:#dc3348;--red-rgb:220,51,72;--red-hi:#c62a3e;'
    + '--amber:#c4860a;--amber-rgb:196,134,10;--amber-hi:#a46f00;}'
    + 'html[data-mode="light"] body{background-color:#f2f2f5;}'
    + 'html[data-mode="light"] ::selection{background:rgba(var(--a1-rgb),.2);}';
  function accent() { let k = ''; try { k = localStorage.getItem(ACC_KEY) || ''; } catch (e) {} return ACCENTS[k] ? k : 'chest'; }
  function paintAccent(k) {
    const a = ACCENTS[k] || ACCENTS.chest;
    let el = document.getElementById('chestAccentVars');
    if (!el) { el = document.createElement('style'); el.id = 'chestAccentVars'; (document.head || document.documentElement).appendChild(el); }
    el.textContent = `:root{--a1:${a[1]};--a1-rgb:${a[2]};--a2:${a[3]};--a2-rgb:${a[4]};}`
      + LIGHT;
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
