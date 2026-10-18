/* Volet « Force du marché » (2026-10-18), rattaché au scanner PULSE : un volet de CHEST à droite de
   la page Stratégies (bosse + chevron, même principe que le menu de gauche), jamais posé sur le
   graphique. Données calculées en fond par scanner-server (board.mjs, 3e compte Twelve Data) et
   relayées par accounts-bridge (GET /scanners/board) : par marché et par unité de temps, le côté de
   l'EMA 500 (trend) et le score de tendance de Pulse (-100..100). Ici on ne fait que classer.
   - TREND = majorité des six unités de temps M5 → D1 du même côté de l'EMA 500 (ex. 5/6).
   - FORCE = score Pulse sur l'unité de temps choisie sur la page (M1 → M5, non calculée).
   API : CHESTStrengthBoard.mount({ api, headers, onPick }) puis .update({ scannerId, symbol, tf }). */
(function () {
  const SCANNER = 'pulse';
  const TFS = ['5', '15', '30', '60', '240', 'D'];
  const TF_LABEL = { '5': 'M5', '15': 'M15', '30': 'M30', '60': 'H1', '240': 'H4', 'D': 'D1' };
  const POLL_MS = 2 * 60 * 1000;
  const OPEN_KEY = 'chest_strength_board_open';
  const ARROW = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 10V2.4M2.6 5.6 6 2.2l3.4 3.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  let root = null, body = null, cfg = null, data = null, view = { scannerId: null, symbol: null, tf: '5' }, timer = null, loading = false;

  const dirClass = (d) => (d > 0 ? 'is-up' : d < 0 ? 'is-dn' : 'is-flat');
  const arrow = (d) => `<span class="sbd-arrow ${dirClass(d)}">${ARROW}</span>`;
  const label = (code) => (code.length === 6 ? code.slice(0, 3) + '/' + code.slice(3) : code);
  function ago(ms) {
    const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
    if (m < 1) return "à l'instant";
    if (m < 60) return 'il y a ' + m + ' min';
    const h = Math.round(m / 60);
    return h < 24 ? 'il y a ' + h + ' h' : 'il y a ' + Math.round(h / 24) + ' j';
  }
  // Par défaut : ouvert sur grand écran (il pousse la page), fermé sur petit écran (il la couvrirait).
  // Ensuite on retient le choix, sur cet appareil.
  function isOpen() {
    let v = null;
    try { v = localStorage.getItem(OPEN_KEY); } catch (e) { /* sans stockage */ }
    return v === null ? window.innerWidth >= 1100 : v === '1';
  }
  function setOpen(v) { try { localStorage.setItem(OPEN_KEY, v ? '1' : '0'); } catch (e) { /* sans stockage */ } }
  const active = () => view.scannerId === SCANNER;

  // Une ligne par marché : tendance majoritaire et force sur l'unité de temps choisie.
  function rows(tf) {
    const out = [];
    Object.entries((data && data.markets) || {}).forEach(([code, tfs]) => {
      let up = 0, dn = 0, n = 0;
      TFS.forEach((t) => { const x = tfs[t]; if (!x || !x.trend) return; n++; if (x.trend > 0) up++; else dn++; });
      const f = tfs[tf];
      if (!n && !f) return;
      out.push({ code, trend: up > dn ? 1 : dn > up ? -1 : 0, agree: Math.max(up, dn), n, score: f ? f.score : null, at: f ? f.at : 0 });
    });
    return out.sort((a, b) => Math.abs(b.score ?? -1) - Math.abs(a.score ?? -1) || b.agree - a.agree || a.code.localeCompare(b.code));
  }

  function applyOpen() {
    const open = active() && isOpen();
    document.documentElement.classList.toggle('sbd-on', active());
    document.documentElement.classList.toggle('sbd-open', open);
    root.querySelector('.sbd-toggle').setAttribute('aria-expanded', String(open));
    root.querySelector('.sbd-panel').toggleAttribute('inert', !open);
  }

  function render() {
    if (!root) return;
    applyOpen();
    if (!active()) return;
    const tf = TF_LABEL[view.tf] ? view.tf : '5';
    const list = rows(tf);
    const mine = data && data.markets && data.markets[view.symbol];
    const newest = list.reduce((m, r) => Math.max(m, r.at || 0), 0);
    root.querySelector('.sbd-meta').textContent = newest ? 'Mis à jour ' + ago(newest) : '';

    if (!data) body.innerHTML = `<p class="sbd-empty">${loading ? 'Lecture du tableau…' : 'Tableau indisponible pour le moment.'}</p>`;
    else if (data.enabled === false) body.innerHTML = '<p class="sbd-empty">Tableau en préparation : le calcul de fond n’est pas encore activé.</p>';
    else if (!list.length) body.innerHTML = '<p class="sbd-empty">Premier calcul en cours. Les marchés apparaissent au fil des minutes.</p>';
    else {
      body.innerHTML = `
        ${mine ? `<section class="sbd-pair" aria-label="Côté de l'EMA 500 pour ${label(view.symbol)}">
          <p class="sbd-k">01 — ${label(view.symbol)} · EMA 500</p>
          <div class="sbd-tfs" role="list">
            ${TFS.map((t) => { const x = mine[t]; return `<span role="listitem" class="sbd-tf ${t === tf ? 'is-cur' : ''}" title="${TF_LABEL[t]} : prix ${x && x.trend > 0 ? 'au-dessus' : x && x.trend < 0 ? 'au-dessous' : '—'} de l'EMA 500">${TF_LABEL[t]}${arrow(x ? x.trend : 0)}</span>`; }).join('')}
          </div>
        </section>` : ''}
        <p class="sbd-k">${mine ? '02' : '01'} — Classement par force</p>
        <div class="sbd-head" aria-hidden="true"><span>Paire</span><span>Trend</span><span>Force ${TF_LABEL[tf]}</span></div>
        <ol class="sbd-list">
          ${list.map((r) => `
            <li><button type="button" class="sbd-row ${r.code === view.symbol ? 'is-cur' : ''}" data-sbd-pick="${r.code}"
                aria-label="${label(r.code)}, tendance ${r.trend > 0 ? 'haussière' : r.trend < 0 ? 'baissière' : 'partagée'} ${r.agree} sur ${r.n}, force ${r.score === null ? 'inconnue' : Math.abs(r.score)}">
              <span class="sbd-pair-name">${label(r.code)}</span>
              <span class="sbd-trend">${arrow(r.trend)}<em>${r.agree}/${r.n}</em></span>
              <span class="sbd-force ${r.score === null ? '' : dirClass(r.score)}">${r.score === null ? '—' : arrow(r.score) + '<b>' + Math.abs(r.score) + '</b>'}</span>
            </button></li>`).join('')}
        </ol>
        <p class="sbd-note">Trend : unités de temps M5 → D1 du même côté de l'EMA 500. Force : score de tendance Pulse (10 moyennes, 0 à 100).</p>`;
    }
  }

  async function load() {
    if (!root || !active() || document.hidden || loading) return;
    loading = true;
    if (!data) render();
    try {
      const res = await fetch(cfg.api() + '/scanners/board', { headers: cfg.headers() });
      const json = await res.json();
      if (json && json.markets) data = json;
    } catch (e) { /* on garde le dernier tableau connu */ }
    loading = false;
    render();
  }

  window.CHESTStrengthBoard = {
    mount(options) {
      cfg = options;
      root = document.createElement('aside');
      root.className = 'sbd';
      root.id = 'strengthBoard';
      root.setAttribute('aria-label', 'Force du marché selon Pulse');
      root.innerHTML = `
        <button type="button" class="sbd-toggle" aria-controls="strengthBoard" title="Ouvrir ou fermer la force du marché" aria-label="Ouvrir ou fermer la force du marché">
          <svg class="sbd-toggle-bg" viewBox="0 0 22 112" preserveAspectRatio="none" aria-hidden="true"><path d="M22 0 C 22 22, 1 30, 1 56 C 1 82, 22 90, 22 112"></path></svg>
          <svg class="sbd-toggle-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M15 5l-7 7 7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="sbd-panel">
        <header class="sbd-top">
          <img src="assets/logo-pulse.webp" alt="" width="30" height="30">
          <div><h2>Force du marché</h2><p class="sbd-meta"></p></div>
        </header>
        <div class="sbd-body"></div>
        </div>`;
      body = root.querySelector('.sbd-body');
      document.body.appendChild(root);
      root.querySelector('.sbd-toggle').addEventListener('click', () => { setOpen(!isOpen()); render(); });
      root.addEventListener('click', (e) => {
        const pick = e.target.closest('[data-sbd-pick]');
        if (pick && cfg.onPick) cfg.onPick(pick.dataset.sbdPick);
      });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && active() && isOpen() && window.innerWidth < 1100) { setOpen(false); render(); } });
      document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
    },
    update(next) {
      const was = active();
      view = Object.assign(view, next);
      render();
      if (active() && (!was || !data)) load();
      if (was !== active()) { clearInterval(timer); if (active()) timer = setInterval(load, POLL_MS); }
    },
  };
})();
