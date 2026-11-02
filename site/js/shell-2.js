// CHEST 2.0 (2026-11-02) — barre du haut du shell : recherche de page ou de paire (⌘K / Ctrl+K / « / »)
// et cloche des notifications (window.CHESTNotifications, js/notifications-store.js).
// Maquettes : Main.dc.html (barre), Elements.dc.html § 04 (volet des notifications).
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const go = (name, search) => { if (window.CHESTShell) CHESTShell.go(name, search || ''); else location.hash = '#/' + name + (search || ''); };

  // ---------- Menu replié (case #sbT de la maquette), gardé par appareil avec la même clé que nav.js ----------
  const sbT = $('sbT');
  if (sbT) {
    try { sbT.checked = localStorage.getItem('chest_nav_collapsed') === '1'; } catch (e) { /* tant pis */ }
    sbT.addEventListener('change', () => {
      try { localStorage.setItem('chest_nav_collapsed', sbT.checked ? '1' : '0'); } catch (e) { /* tant pis */ }
      const sh = $('chestShell'); if (sh) sh.classList.toggle('is-collapsed', sbT.checked);
    });
  }
  // HQ est un lien « # » dans la maquette : on garde l'adresse, js/hq.js ouvre CHEST HQ.
  const hqLink = $('chestHq');
  if (hqLink) hqLink.addEventListener('click', (e) => e.preventDefault());

  // ---------- Recherche ----------
  const PAGES = [
    ['dashboard', 'Dashboard', 'Suivi'], ['journal', 'Journal de trading', 'Suivi'], ['backtesting', 'Backtesting', 'Recherche'],
    ['strategies', 'Stratégies', 'Scanners'], ['calendar', 'Calendrier économique', 'Marché'], ['berich', 'BERICH', 'Exécution'],
    ['school', 'School', 'Formation'], ['account', 'Compte', 'Réglages'], ['connect', 'Connecter un compte', 'Réglages'],
    ['vps-guide', 'Connexion VPS', 'Réglages'], ['educator', 'Espace éducateur', 'Éducateur', 'edu'], ['admin-members', 'Admin', 'Admin', 'admin'],
  ];
  const PAIRS = [
    ['XAUUSD', 'XAU/USD', 'Or / Dollar'], ['EURUSD', 'EUR/USD', 'Euro / Dollar'], ['GBPUSD', 'GBP/USD', 'Livre / Dollar'],
    ['USDJPY', 'USD/JPY', 'Dollar / Yen'], ['USDCHF', 'USD/CHF', 'Dollar / Franc suisse'], ['AUDUSD', 'AUD/USD', 'Dollar australien'],
    ['USDCAD', 'USD/CAD', 'Dollar / Dollar canadien'], ['NZDUSD', 'NZD/USD', 'Dollar néo-zélandais'], ['EURJPY', 'EUR/JPY', 'Euro / Yen'],
    ['GBPJPY', 'GBP/JPY', 'Livre / Yen'], ['EURGBP', 'EUR/GBP', 'Euro / Livre'], ['BTCUSD', 'BTC/USD', 'Bitcoin / Dollar'],
  ];
  const input = $('c2SearchInput'), list = $('c2SearchList'), box = $('c2Search');
  let items = [], idx = 0;

  function allowed(p) {
    const A = window.CHESTAccounts;
    if (p[3] === 'admin') return !!(A && A.isAdmin && A.isAdmin());
    if (p[3] === 'edu') { const u = A && A.getUser && A.getUser(); return !!(u && (u.role === 'educator' || u.isAdmin)); }
    return true;
  }
  function results(q) {
    const n = norm(q).trim();
    const pages = PAGES.filter(allowed).filter((p) => !n || norm(p[1] + ' ' + p[2] + ' ' + p[0]).includes(n))
      .map((p) => ({ kind: 'Page', label: p[1], sub: p[2], name: p[0], search: '' }));
    const pairs = n ? PAIRS.filter((p) => norm(p[0] + ' ' + p[1] + ' ' + p[2]).includes(n.replace(/[\s/]/g, '')) || norm(p[1] + ' ' + p[2]).includes(n))
      .map((p) => ({ kind: 'Paire', label: p[1], sub: p[2] + ' · ouvrir dans Stratégies', name: 'strategies', search: '?symbol=' + p[0] })) : [];
    return pages.slice(0, n ? 6 : 8).concat(pairs.slice(0, 5));
  }
  function paint() {
    items = results(input.value);
    idx = Math.min(idx, Math.max(0, items.length - 1));
    list.innerHTML = items.length
      ? items.map((it, i) => `<button type="button" role="option" class="c2-search__it${i === idx ? ' is-on' : ''}" aria-selected="${i === idx}" data-i="${i}"><span class="c2-search__k">${it.kind}</span><b>${esc(it.label)}</b><small>${esc(it.sub)}</small></button>`).join('')
      : '<p class="c2-search__empty">Aucun résultat.</p>';
  }
  function open() { list.hidden = false; input.setAttribute('aria-expanded', 'true'); paint(); }
  function close() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); }
  function pick(i) { const it = items[i]; if (!it) return; close(); input.value = ''; input.blur(); go(it.name, it.search); }

  if (input) {
    input.addEventListener('focus', open);
    input.addEventListener('input', () => { idx = 0; open(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(items.length - 1, idx + 1); paint(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(0, idx - 1); paint(); }
      else if (e.key === 'Enter') { e.preventDefault(); pick(idx); }
      else if (e.key === 'Escape') { close(); input.blur(); }
    });
    list.addEventListener('mousedown', (e) => { const b = e.target.closest('[data-i]'); if (b) { e.preventDefault(); pick(Number(b.dataset.i)); } });
    input.addEventListener('blur', () => setTimeout(close, 120));
    const kbd = $('c2SearchKbd');
    document.addEventListener('keydown', (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '');
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) { e.preventDefault(); input.focus(); input.select(); }
    });
  }

  // ---------- Notifications ----------
  const bell = $('c2Bell'), panel = $('c2Notif'), dot = $('c2BellDot');
  const N = () => window.CHESTNotifications;
  const TONE = { phase_validated: 'pos', payout_detected: 'pos', account_blown: 'neg' };
  function ago(iso) {
    const t = Date.parse(iso); if (isNaN(t)) return '';
    const m = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (m < 60) return m < 1 ? 'à l’instant' : `${m} min`;
    const h = Math.round(m / 60); if (h < 24) return `${h} h`;
    return h < 48 ? 'hier' : new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }
  function paintNotifs() {
    if (!N()) return;
    const all = N().list().slice().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 12);
    dot.hidden = !N().unreadCount();
    $('c2NotifList').innerHTML = all.length
      ? all.map((n) => `<button type="button" class="c2-notif__it${n.read ? '' : ' is-new'}" data-id="${esc(n.id)}"><i class="is-${TONE[n.type] || 'brand'}"></i><span><b>${esc(n.title)}</b><small>${esc(n.body || '')}</small></span><time>${esc(ago(n.createdAt))}</time></button>`).join('')
      : '<p class="c2-notif__empty">Rien de nouveau pour l’instant.</p>';
  }
  function toggle(open) {
    panel.hidden = !open;
    bell.setAttribute('aria-expanded', String(open));
    if (open) paintNotifs();
  }
  if (bell && panel) {
    bell.addEventListener('click', (e) => { e.stopPropagation(); toggle(panel.hidden); });
    document.addEventListener('click', (e) => { if (!panel.hidden && !e.target.closest('.c2-notif')) toggle(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) { toggle(false); bell.focus(); } });
    $('c2NotifAll').addEventListener('click', () => { if (N()) N().markAllRead(); paintNotifs(); });
    $('c2NotifList').addEventListener('click', (e) => {
      const it = e.target.closest('[data-id]'); if (!it || !N()) return;
      const n = N().list().find((x) => String(x.id) === it.dataset.id);
      N().markRead(n ? n.id : it.dataset.id);
      toggle(false);
      if (n && n.data && n.data.journalAccountId) go('journal');
    });
    paintNotifs();
    window.addEventListener('storage', (e) => { if (!e.key || /notif/i.test(e.key)) paintNotifs(); });
    setInterval(paintNotifs, 60000);
  }
})();
