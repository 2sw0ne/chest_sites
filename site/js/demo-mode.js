// CHEST — mode démonstration de la landing (2026-11-09).
// Les vraies pages tournent dans la fenêtre « 02 — La solution » de la landing, avec un compte fictif (Pierre Martin) :
// tout est cliquable (ouvrir un backtest, un livre du calendrier, cocher une mission…), rien ne part jamais au serveur.
//  - activé seulement quand la page est affichée DANS la landing (ou avec ?demo=1 en haut, pour tester) ;
//  - localStorage / sessionStorage remplacés par une mémoire propre à la visite (window.top) : les vraies données d'un
//    membre connecté sur ce navigateur ne sont ni lues ni modifiées ; IndexedDB renommé (« demo_… ») ;
//  - fetch / XMLHttpRequest vers le serveur de comptes servis par /demo/fixtures.json (réponses enregistrées sur une
//    base de démonstration, dates décalées à la semaine en cours) ; bougies, prix et trade BERICH en cours simulés ;
//  - chargé par js/theme.js (document.write) avant tout autre script de la page.
(() => {
  'use strict';
  let top = null;
  try { top = window.top; void top.location.pathname; } catch (e) { return; }
  const isDemo = (() => {
    try {
      if (/[?&]demo=1\b/.test(top.location.search)) return true;
      return top !== window && /^\/(landing(\.html)?)?$/.test(top.location.pathname);
    } catch (e) { return false; }
  })();
  window.CHEST_DEMO = isDemo;
  if (!isDemo) return;

  const WEEK = 7 * 86400000, NOW = Date.now();
  const D = top.__chestDemo || (top.__chestDemo = { local: new Map(), session: new Map(), fx: null, taskDone: {} });

  // ---------------------------------------------------------------- réponses enregistrées
  if (!D.fx) {
    try {
      const x = new XMLHttpRequest();
      x.open('GET', '/demo/fixtures.json?v=2', false);
      x.send();
      let txt = x.responseText;
      const rec = Date.parse((JSON.parse(txt)._recordedAt) || new Date().toISOString());
      // les dates suivent la semaine en cours (décalage par semaines entières : les jours de la semaine restent justes)
      const shift = Math.max(0, Math.floor((NOW - rec) / WEEK)) * WEEK;
      if (shift) {
        const iso = (s) => new Date(Date.parse(s) + shift).toISOString();
        txt = txt.replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(\+00:00|Z)/g, (m) => { const t = Date.parse(m); return isNaN(t) ? m : iso(m).replace(/\.000Z$/, 'Z'); })
          .replace(/\b(\d{4}-\d\d-\d\d)\b(?!T)/g, (m) => { const t = Date.parse(m + 'T12:00:00Z'); return isNaN(t) ? m : new Date(t + shift).toISOString().slice(0, 10); })
          .replace(/\b1[78]\d{11}\b/g, (m) => String(Number(m) + shift));
      }
      D.fx = JSON.parse(txt);
    } catch (e) { D.fx = {}; }
    const me = D.fx['GET /me'] ? JSON.parse(D.fx['GET /me']) : {};
    const user = Object.assign({}, me.user || me, { firstName: 'Pierre', lastName: 'Martin', email: 'pierre@exemple.fr', isAdmin: false, role: 'member', tutoSeen: true, avatar: null });
    D.user = user;
    D.local.set('chest_account_token', 'demo');
    D.local.set('chest_account_user', JSON.stringify(user));
    D.local.set('chest_theme', 'dark');
    D.local.set('chest_accent', 'chest');
    D.local.set('chest_tuto_seen', '1');
    D.session.set('chest_welcome_seen', '1');
    D.session.set('chest_welcome', '0');
    D.session.set('chest_berich_quiz_seen', '1');
  }

  // ---------------------------------------------------------------- stockage de la visite
  const mapOf = (st) => (st === window.sessionStorage ? D.session : D.local);
  const SP = Storage.prototype;
  SP.getItem = function (k) { const m = mapOf(this); k = String(k); return m.has(k) ? m.get(k) : null; };
  SP.setItem = function (k, v) { mapOf(this).set(String(k), String(v)); };
  SP.removeItem = function (k) { mapOf(this).delete(String(k)); };
  SP.clear = function () { mapOf(this).clear(); };
  SP.key = function (i) { return [...mapOf(this).keys()][i] || null; };
  try { Object.defineProperty(SP, 'length', { configurable: true, get() { return mapOf(this).size; } }); } catch (e) { /* tant pis */ }
  try {
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (name, v) { return open.call(this, 'demo_' + name, v); };
  } catch (e) { /* pas d'IndexedDB */ }
  try { navigator.sendBeacon = () => true; } catch (e) { /* tant pis */ }

  // ---------------------------------------------------------------- données simulées
  const ENTRY = 4110.67, SL = 4082.75, TP = 4250.27;
  function walk(n, tfMs, base, vol, seed) {
    let s = seed || 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const out = []; let px = base; const t0 = Math.floor(NOW / tfMs) * tfMs - (n - 1) * tfMs;
    for (let i = 0; i < n; i++) {
      const o = px, c = o + (rnd() - 0.48) * vol;
      out.push({ time: t0 + i * tfMs, open: o, high: Math.max(o, c) + rnd() * vol * 0.6, low: Math.min(o, c) - rnd() * vol * 0.6, close: c, volume: 0 });
      px = c;
    }
    return out;
  }
  // or : de 4 096 à ~4 121 sur les 8 dernières heures (trade BERICH en cours, légèrement gagnant)
  function goldM15() {
    const path = [4096, 4093, 4099, 4097, 4102, 4100, 4095, 4098, 4104, 4101, 4106, 4103, 4108, 4105, 4102, 4107, 4111, 4109, 4113, 4110, 4106, 4109, 4112, 4110, 4114, 4111, 4108, 4112, 4115, 4113, 4117, 4115, 4112, 4116, 4119, 4117, 4120, 4118, 4122, 4121.4];
    const t0 = Math.floor(NOW / 900000) * 900000 - (path.length - 1) * 900000; let px = 4096;
    return path.map((c, i) => { const o = px; px = c; return [t0 + i * 900000, o, Math.max(o, c) + 1.2 + (i % 3) * 0.6, Math.min(o, c) - 1.1 - (i % 4) * 0.5, c]; });
  }
  const PRICE = 4121.4;
  const baseOf = (sym) => (/XAU/.test(sym) ? 4110 : /BTC/.test(sym) ? 96000 : /ETH/.test(sym) ? 3400 : /US30|DJ/.test(sym) ? 44000 : /NAS|US100/.test(sym) ? 21000 : /SPX|US500/.test(sym) ? 6000 : /GER|DAX/.test(sym) ? 19500 : /JPY/.test(sym) ? 152 : 1.1);
  const TFMS = { 1: 60000, 5: 300000, 15: 900000, 30: 1800000, 60: 3600000, 240: 14400000, D: 86400000 };

  function mentorPayload() {
    const raw = D.fx['GET /mentor'];
    if (!raw) return {};
    const m = JSON.parse(raw);
    (m.tasks || []).forEach((t) => { if (t.id in D.taskDone) t.doneAt = D.taskDone[t.id]; });
    return m;
  }
  function answer(method, url, body) {
    const p = url.pathname, q = url.search;
    const j = (o, st) => ({ status: st || 200, body: JSON.stringify(o) });
    if (method === 'GET') {
      if (p === '/berich/candles') return j({ bars: goldM15() });
      if (p === '/twelvedata/price') return j({ price: String(/XAU/.test(q) ? PRICE : baseOf(decodeURIComponent(q))) });
      if (p === '/scanners/model') {
        const sp = url.searchParams, sym = sp.get('symbol') || 'XAUUSD', tf = sp.get('tf') || '5';
        const b = baseOf(sym);
        return j({ bars: walk(600, TFMS[tf] || 300000, b, b * (tf === 'D' ? 0.006 : 0.00045), sym.length * 97 + Number(tf === 'D' ? 1440 : tf)), models: [] });
      }
      if (p === '/mentor') return j(mentorPayload());
      if (p === '/me') return j(D.user);
      if (p === '/sync') return { status: 200, body: D.fx['GET /sync'] || '{"data":{},"stamps":{}}' };
      const hit = D.fx['GET ' + p + q] || D.fx['GET ' + p];
      if (hit != null) return { status: 200, body: hit };
      if (p.startsWith('/sync')) return j({ data: {}, stamps: {} });
      return j({});
    }
    // écritures : jamais envoyées ; quelques-unes jouent leur effet pour que la démo réagisse
    const mt = p.match(/^\/mentor\/tasks\/(\d+)\/toggle$/);
    if (mt) {
      const id = Number(mt[1]), cur = mentorPayload().tasks || [];
      const t = cur.find((x) => x.id === id);
      D.taskDone[id] = t && t.doneAt ? null : new Date().toISOString();
      return j(mentorPayload());
    }
    if (p === '/me' || p.startsWith('/me/')) return j({ user: D.user });
    return j({ ok: true, demo: true });
  }
  const apiOrigins = () => {
    const o = new Set(['http://localhost:8081', 'http://localhost:8080']);
    try { const c = window.CHEST_CONFIG && window.CHEST_CONFIG.accountsApiUrl; if (c) o.add(new URL(c).origin); } catch (e) { /* tant pis */ }
    o.add('https://accounts-bridge-production.up.railway.app');
    return o;
  };
  const isApi = (u) => apiOrigins().has(u.origin);
  const isSignals = (u) => /berich-bridge/.test(u.host) && /\/signals/.test(u.pathname);

  const realFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const href = typeof input === 'string' ? input : input && input.url;
    let u; try { u = new URL(href, location.href); } catch (e) { return realFetch(input, init); }
    const method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    if (isApi(u)) {
      const r = answer(method, u, init && init.body);
      await new Promise((res) => setTimeout(res, 60 + Math.random() * 120));
      return new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json' } });
    }
    // services extérieurs (calendrier, force des devises, crypto) : copies figées, aucun appel réel
    const ext = /calendar-bridge/.test(u.host) ? (/calendar\.json/.test(u.pathname) ? D.fx['EXT calendar'] : '{}')
      : /fxbluelabs/.test(u.host) ? D.fx['EXT strength']
      : /coingecko/.test(u.host) ? (/\/markets$/.test(u.pathname) ? D.fx['EXT coingecko'] : '{"prices":[]}') : null;
    if (ext != null) {
      await new Promise((res) => setTimeout(res, 80));
      return new Response(ext || '{}', { status: 200, headers: { 'Content-Type': /fxbluelabs/.test(u.host) ? 'text/plain' : 'application/json' } });
    }
    if (isSignals(u)) {
      // BERICH : les signaux clôturés (copie) + un achat de l'or en cours (BERICH II)
      let data = { signals: [] };
      try { data = JSON.parse(D.fx['EXT signals'] || '{"signals":[]}'); } catch (e) { /* tant pis */ }
      const open = { id: 'demo-open', algo: 'berich2', scanner: 'BERICH II', symbol: 'XAUUSD', side: 'buy', entry: ENTRY, sl: SL, tp: TP, time: new Date(NOW - 95 * 60000).toISOString(), status: 'open' };
      data.signals = [open].concat((data.signals || []).filter((s) => s.status === 'closed'));
      return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return realFetch(input, init);
  };

  // XMLHttpRequest (envois de fichiers de School, import de backtest) : réponse simulée, rien ne part
  const XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.send, XH = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (m, url) {
    try { const u = new URL(url, location.href); this.__demo = isApi(u) ? { m: String(m).toUpperCase(), u } : null; } catch (e) { this.__demo = null; }
    if (!this.__demo) return XO.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function () { if (!this.__demo) return XH.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (body) {
    if (!this.__demo) return XS.apply(this, arguments);
    const r = answer(this.__demo.m, this.__demo.u, body), x = this;
    setTimeout(() => {
      ['readyState', 'status', 'responseText', 'response'].forEach((k, i) => { try { Object.defineProperty(x, k, { configurable: true, value: [4, r.status, r.body, r.body][i] }); } catch (e) { /* tant pis */ } });
      if (x.upload && x.upload.onprogress) try { x.upload.onprogress({ lengthComputable: true, loaded: 1, total: 1 }); } catch (e) { /* tant pis */ }
      if (x.onreadystatechange) x.onreadystatechange();
      if (x.onload) x.onload();
      x.dispatchEvent(new Event('load'));
    }, 300);
  };

  // images des fichiers (Idea, miniatures des cours) : copies dans /demo/files, jamais le vrai serveur
  const fileRe = /https?:\/\/[^\/'")\s]+\/school\/files\/([\w.-]+)/g;
  const fixEl = (el) => {
    if (el.nodeType !== 1) return;
    const src = el.getAttribute && el.getAttribute('src');
    if (src && fileRe.test(src)) { fileRe.lastIndex = 0; el.setAttribute('src', src.replace(fileRe, '/demo/files/$1')); }
    fileRe.lastIndex = 0;
    const st = el.getAttribute && el.getAttribute('style');
    if (st && st.includes('/school/files/')) el.setAttribute('style', st.replace(fileRe, '/demo/files/$1'));
    fileRe.lastIndex = 0;
  };
  new MutationObserver((list) => list.forEach((m) => {
    if (m.type === 'attributes') fixEl(m.target);
    else m.addedNodes.forEach((n) => { if (n.nodeType === 1) { fixEl(n); n.querySelectorAll && n.querySelectorAll('[src*="/school/files/"], [style*="/school/files/"]').forEach(fixEl); } });
  })).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'style'] });

  // Stratégies : certains scanners peignent eux-mêmes leurs bougies (bougies transparentes) ; sans le calcul du
  // serveur, la démo les remet aux couleurs par défaut pour qu'on voie le marché
  document.addEventListener('DOMContentLoaded', () => {
    try { (window.CHESTScanners ? CHESTScanners.list() : []).forEach((sc) => { if (sc.candles && /rgba\(0, ?0, ?0, ?0\)/.test(JSON.stringify(sc.candles))) sc.candles = null; }); } catch (e) { /* tant pis */ }
  });

  // Démo « à regarder » (2026-11-09, demande patron) : rien n'est cliquable, sauf ce qui explique une page —
  // cocher une mission (School), ouvrir un rapport (Backtesting), ouvrir un livre (Calendrier).
  const PAGE = (location.pathname.split('/').pop() || '').replace(/\.html$/, '');
  const inLanding = (() => { try { return top !== window && /^\/(landing(\.html)?)?$/.test(top.location.pathname); } catch (e) { return false; } })();
  const ALLOW = { school: '[data-task]', backtesting: 'a[href*="backtest-view"]', calendar: '.book[data-open]', 'backtest-view': 'a.chest-back' }[PAGE] || null;
  const allowed = (t) => !!(ALLOW && t && t.closest && t.closest(ALLOW));
  ['click', 'dblclick', 'auxclick', 'contextmenu', 'mousedown', 'submit'].forEach((type) => document.addEventListener(type, (e) => {
    if (!inLanding || allowed(e.target)) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
  }, true));
  document.addEventListener('keydown', (e) => {
    if (!inLanding) return;
    if (/^(Arrow|Page|Home|End)/.test(e.key) || (e.key === ' ' && !allowed(e.target))) return;
    if (allowed(e.target)) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
  }, true);
  const css = document.createElement('style');
  if (inLanding) {
  css.textContent = `html *, html *::before, html *::after{ cursor:default !important; }
    ${ALLOW ? `${ALLOW}, ${ALLOW} *{ cursor:pointer !important; }` : ''}
    .chesttour-btn, .lotcalc-fab, .lotcalc-overlay{ display:none !important; }
    #scHome > section.chest-section, #scHome > .sc-hero, #sh2Search{ display:none !important; }`;
  (document.head || document.documentElement).appendChild(css);
  document.documentElement.classList.add('chest-demo');
  }
})();
