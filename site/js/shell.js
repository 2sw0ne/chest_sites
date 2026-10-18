// CHEST — shell unique (app.html).
//
// La sidebar et la barre du haut ne se rechargent jamais : chaque page est
// chargée dans l'iframe #chestView et le shell suit ce qu'elle fait (titre,
// page active, fil d'Ariane, adresse). Pourquoi une iframe plutôt qu'un
// échange de contenu dans le même document : chaque page a ses propres
// scripts, minuteries, écouteurs document/window et instances de graphiques ;
// les échanger à chaud les ferait s'accumuler ou planter sur des éléments
// disparus. Une iframe les isole complètement, sans réécrire une ligne.
(() => {
  'use strict';

  // Catégorie (fil d'Ariane) + entrée de menu à allumer pour chaque page.
  const PAGES = {
    'dashboard':        { cat: 'Suivi',     label: 'Dashboard' },
    'backtesting':      { cat: 'Recherche', label: 'Backtesting' },
    'journal':          { cat: 'Suivi',     label: 'Journal de trading' },
    'strategies':       { cat: 'Scanners',  label: 'Stratégies' },
    'calendar':         { cat: 'Marché',    label: 'Calendrier économique' },
    'berich':           { cat: 'Exécution', label: 'BERICH' },
    'school':           { cat: 'Formation', label: 'School' },
    'account':          { cat: 'Réglages',  label: 'Compte' },
    'admin-members':    { cat: 'Admin',     label: 'Gestion des membres' },
    'backtest-add':     { cat: 'Recherche', label: 'Nouveau backtest',    nav: 'backtesting' },
    'backtest-view':    { cat: 'Recherche', label: 'Rapport de backtest', nav: 'backtesting' },
    'strategy-example': { cat: 'Scanners',  label: 'Fiche stratégie',     nav: 'strategies' },
    'vps-guide':        { cat: 'Réglages',  label: 'Connexion VPS',       nav: 'account' },
    'connect':          { cat: 'Réglages',  label: 'Connecter un compte', nav: 'dashboard' },
  };
  const DEFAULT_PAGE = 'dashboard';
  const AUTH_PAGES = ['login', 'signup', 'index'];
  // Adresses propres (2026-10-18, demande utilisateur : « app.html# » remplacé par des noms lisibles,
  // sans .html) : /connexion, /welcome, /dashboard, /journal?acc=… ; /inscription pour signup.html.
  // Toutes servent app.html (vercel.json, et _dev_server.py en local). Les anciens liens
  // app.html#/page restent acceptés au démarrage.
  const AUTH_ROUTES = { login: '/connexion', signup: '/inscription', index: '/connexion' };

  const shell = document.getElementById('chestShell');
  const frame = document.getElementById('chestView');
  const crumbCat = document.getElementById('crumbCat');
  const crumbPage = document.getElementById('crumbPage');
  let currentKey = null; // "page?query" actuellement affiché
  let requestedKey = null; // "page?query" demandé à l'iframe, pas encore chargé

  // "#/backtest-view?id=x" -> { name:'backtest-view', search:'?id=x', file:'backtest-view.html?id=x' }
  function parseHash() {
    const raw = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
    const q = raw.indexOf('?');
    let name = q === -1 ? raw : raw.slice(0, q);
    const search = q === -1 ? '' : raw.slice(q);
    if (!PAGES[name]) name = DEFAULT_PAGE;
    return { name, search, file: name + '.html' + (PAGES[name] ? search : '') };
  }

  function keyOf(name, search) { return name + (search || ''); }

  // Page demandée par l'adresse : /journal?acc=x, sinon un ancien lien app.html#/journal?acc=x.
  function routeFromUrl() {
    const seg = decodeURIComponent(location.pathname.split('/').pop() || '').replace(/\.html$/, '');
    if (PAGES[seg]) return { name: seg, search: location.search, file: seg + '.html' + location.search };
    if (location.hash.length > 2) return parseHash();
    return { name: DEFAULT_PAGE, search: '', file: DEFAULT_PAGE + '.html' };
  }

  // L'adresse affichée suit l'état du shell : pas connecté = /connexion, Welcome ouvert = /welcome,
  // sinon la page de l'iframe. Recalculée à chaque changement de classe de <html> (connexion,
  // ouverture/fermeture du Welcome) et à chaque page chargée.
  const STATE_ROUTES = [['is-loggedout', '/connexion', 'Connexion'], ['is-welcome', '/welcome', 'Welcome']];
  function syncUrl() {
    const cls = document.documentElement.classList;
    const st = STATE_ROUTES.find(([c]) => cls.contains(c));
    let url, title;
    if (st) { url = st[1]; title = st[2] + ' — CHEST'; }
    else if (currentKey) { url = '/' + currentKey; title = currentTitle; }
    else return;
    if (location.pathname + location.search + location.hash !== url) history.replaceState(null, '', url);
    if (title) document.title = title;
  }
  let currentTitle = '';
  new MutationObserver(syncUrl).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

  function navigate(file) {
    requestedKey = file.replace(/\.html/, '');
    shell.classList.remove('is-done');
    shell.classList.add('is-navigating');
    try { frame.contentWindow.location.href = file; } catch (e) { frame.src = file; }
  }

  // Clic dans la sidebar / la topbar : on charge la page dans la zone de
  // contenu, l'adresse est ensuite mise à jour par onFrameLoad().
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#/"]');
    if (!a) return;
    e.preventDefault();
    const raw = a.getAttribute('href').replace(/^#\/?/, '');
    const q = raw.indexOf('?');
    const name = q === -1 ? raw : raw.slice(0, q);
    const search = q === -1 ? '' : raw.slice(q);
    if (!PAGES[name]) return;
    if (keyOf(name, search) === currentKey) return; // déjà là : rien à recharger
    navigate(name + '.html' + search);
  });

  // Adresse modifiée à la main / lien externe vers app.html#/page.
  window.addEventListener('hashchange', () => {
    const { name, search, file } = parseHash();
    if (keyOf(name, search) !== currentKey) navigate(file);
  });

  // La page chargée dans l'iframe dit au shell où on en est.
  function onFrameLoad() {
    let path, search, title, pageAttr;
    try {
      const w = frame.contentWindow;
      if (w.location.href === 'about:blank') return;
      path = w.location.pathname.split('/').pop().replace(/\.html$/, '');
      search = w.location.search;
      title = w.document.title;
      pageAttr = w.document.body && w.document.body.dataset.page;
    } catch (e) {
      // Origine différente (ex. ouverture en file://) : on ne peut rien lire,
      // on laisse simplement la page s'afficher.
      shell.classList.remove('is-navigating');
      shell.classList.add('is-done');
      return;
    }

    if (AUTH_PAGES.includes(path)) { window.location.replace(AUTH_ROUTES[path] + search); return; }

    const meta = Object.assign({}, PAGES[path] || { cat: 'CHEST', label: title || path });
    if (path === 'backtest-add' && /[?&]edit=/.test(search)) meta.label = 'Modifier le backtest';
    currentKey = keyOf(path, search);
    requestedKey = null;
    currentTitle = meta.label + ' — CHEST';
    syncUrl();
    crumbCat.textContent = meta.cat;
    crumbPage.textContent = meta.label;

    const active = meta.nav || (PAGES[path] ? path : pageAttr);
    document.querySelectorAll('.chest-nav__item[data-page]').forEach((el) => {
      el.classList.toggle('is-active', el.dataset.page === active);
    });
    document.querySelectorAll('.chest-topbar__btn[data-page]').forEach((el) => {
      el.classList.toggle('is-active', el.dataset.page === path);
    });

    shell.classList.remove('is-navigating');
    shell.classList.add('is-done');
    setTimeout(() => shell.classList.remove('is-done'), 500);
  }
  frame.addEventListener('load', onFrameLoad);

  // La page qu'on quitte prévient le shell : fondu de sortie + progression,
  // y compris quand c'est la page elle-même qui change d'adresse (lien
  // interne, redirection).
  window.addEventListener('message', (e) => {
    if (e.source !== frame.contentWindow) return;
    if (e.data && e.data.type === 'chest:nav-start') {
      shell.classList.remove('is-done');
      shell.classList.add('is-navigating');
    }
  });

  // Le thème se change depuis Compte (dans l'iframe) : le shell le suit.
  window.addEventListener('storage', (e) => {
    if (e.key === 'chest_theme' && window.CHESTTheme) CHESTTheme.apply(CHESTTheme.current());
  });

  // Démarrage : la page demandée par l'adresse, sinon le Dashboard. Différé si pas encore connecté
  // (expérimentation fusion login/app.html — voir app.html) : charger une page protégée dans l'iframe
  // avant la connexion ferait sa propre garde rediriger login.html DANS l'iframe, qui en sortirait alors
  // vers le haut (theme.js, AUTH_PAGES) et écraserait toute la page — exactement ce qu'on veut éviter en
  // gardant la connexion intégrée à app.html. `window.CHESTShell.boot()` est appelé une fois connecté.
  function boot() {
    const first = routeFromUrl();
    requestedKey = keyOf(first.name, first.search);
    shell.classList.add('is-navigating');
    frame.src = first.file;
  }
  // Ouvre une page du shell si elle n'est pas déjà affichée ou demandée (ex. Welcome → dashboard).
  function go(name, search) {
    const k = keyOf(name, search || '');
    if (k === currentKey || k === requestedKey || !PAGES[name]) return;
    navigate(name + '.html' + (search || ''));
  }
  syncUrl();
  if (!window.CHESTAccounts || CHESTAccounts.isLoggedIn()) boot();
  window.CHESTShell = { boot, go, routes: AUTH_ROUTES };
})();
