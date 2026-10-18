/* Tableau de force Wolfx (2026-10-18) : posé sur le graphique quand le scanner Wolfx est choisi.
   Données calculées en fond par scanner-server (board.mjs, 3e compte Twelve Data) et relayées par
   accounts-bridge (GET /scanners/board) : par marché et par unité de temps, le côté de l'EMA 500
   (trend) et le score de tendance de Pulse (-100..100). Ici on ne fait que classer et afficher.
   - TREND = majorité des six unités de temps M5 → D1 du même côté de l'EMA 500 (ex. 5/6).
   - FORCE = score Pulse sur l'unité de temps choisie sur la page (M1 → M5, non calculée).
   API : CHESTWolfxBoard.mount(host, { api, headers, onPick }) puis .update({ scannerId, symbol, tf }). */
(function () {
  const TFS = ['5', '15', '30', '60', '240', 'D'];
  const TF_LABEL = { '5': 'M5', '15': 'M15', '30': 'M30', '60': 'H1', '240': 'H4', 'D': 'D1' };
  const POLL_MS = 2 * 60 * 1000;
  const COLLAPSE_KEY = 'chest_wolfx_board_collapsed';
  const ARROW = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 10V2.4M2.6 5.6 6 2.2l3.4 3.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  let el = null, cfg = null, data = null, view = { scannerId: null, symbol: null, tf: '5' }, timer = null, loading = false;

  const dirClass = (d) => (d > 0 ? 'is-up' : d < 0 ? 'is-dn' : 'is-flat');
  const arrow = (d) => `<span class="wxb-arrow ${dirClass(d)}">${ARROW}</span>`;
  const label = (code) => (code.length === 6 ? code.slice(0, 3) + '/' + code.slice(3) : code);
  function ago(ms) {
    const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
    if (m < 1) return "à l'instant";
    if (m < 60) return 'il y a ' + m + ' min';
    const h = Math.round(m / 60);
    return h < 24 ? 'il y a ' + h + ' h' : 'il y a ' + Math.round(h / 24) + ' j';
  }
  function collapsed() { try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch (e) { return false; } }
  function setCollapsed(v) { try { localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0'); } catch (e) { /* sans stockage */ } }

  // Une ligne par marché : tendance majoritaire et force sur l'unité de temps choisie.
  function rows(tf) {
    const out = [];
    Object.entries((data && data.markets) || {}).forEach(([code, tfs]) => {
      let up = 0, dn = 0, n = 0;
      TFS.forEach((t) => { const x = tfs[t]; if (!x || !x.trend) return; n++; if (x.trend > 0) up++; else dn++; });
      const f = tfs[tf];
      if (!n && !f) return;
      const trend = up > dn ? 1 : dn > up ? -1 : 0;
      out.push({ code, trend, agree: Math.max(up, dn), n, score: f ? f.score : null, at: f ? f.at : 0 });
    });
    return out.sort((a, b) => Math.abs(b.score ?? -1) - Math.abs(a.score ?? -1) || b.agree - a.agree || a.code.localeCompare(b.code));
  }

  function render() {
    if (!el) return;
    const show = view.scannerId === 'wolfx';
    el.hidden = !show;
    if (!show) return;
    const tf = TF_LABEL[view.tf] ? view.tf : '5';
    const isCollapsed = collapsed();
    el.classList.toggle('is-collapsed', isCollapsed);
    const list = rows(tf);
    const mine = data && data.markets && data.markets[view.symbol];
    const newest = list.reduce((m, r) => Math.max(m, r.at || 0), 0);

    let body;
    if (!data) body = `<p class="wxb-empty">${loading ? 'Lecture du tableau…' : 'Tableau indisponible pour le moment.'}</p>`;
    else if (data.enabled === false) body = '<p class="wxb-empty">Tableau en préparation : le calcul de fond n’est pas encore activé.</p>';
    else if (!list.length) body = '<p class="wxb-empty">Premier calcul en cours. Les marchés apparaissent au fil des minutes.</p>';
    else {
      body = `
        ${mine ? `<p class="wxb-cap"><b>${label(view.symbol)}</b> · côté de l'EMA 500</p>
        <div class="wxb-tfs" role="list" aria-label="Côté de l'EMA 500 pour ${label(view.symbol)}">
          ${TFS.map((t) => { const x = mine[t]; return `<span role="listitem" class="wxb-tf ${t === tf ? 'is-cur' : ''}" title="${TF_LABEL[t]} : prix ${x && x.trend > 0 ? 'au-dessus' : x && x.trend < 0 ? 'au-dessous' : '—'} de l'EMA 500">${TF_LABEL[t]}${arrow(x ? x.trend : 0)}</span>`; }).join('')}
        </div>` : ''}
        <div class="wxb-head" aria-hidden="true"><span>Paire</span><span>Trend</span><span>Force ${TF_LABEL[tf]}</span></div>
        <ol class="wxb-list">
          ${list.map((r) => `
            <li><button type="button" class="wxb-row ${r.code === view.symbol ? 'is-cur' : ''}" data-wxb-pick="${r.code}"
                aria-label="${label(r.code)}, tendance ${r.trend > 0 ? 'haussière' : r.trend < 0 ? 'baissière' : 'partagée'} ${r.agree} sur ${r.n}, force ${r.score === null ? 'inconnue' : Math.abs(r.score)}">
              <span class="wxb-pair">${label(r.code)}</span>
              <span class="wxb-trend">${arrow(r.trend)}<em>${r.agree}/${r.n}</em></span>
              <span class="wxb-force ${r.score === null ? '' : dirClass(r.score)}">${r.score === null ? '—' : arrow(r.score) + '<b>' + Math.abs(r.score) + '</b>'}</span>
            </button></li>`).join('')}
        </ol>`;
    }
    el.innerHTML = `
      <button type="button" class="wxb-top" aria-expanded="${!isCollapsed}" data-wxb-toggle>
        <span class="wxb-title">Force du marché</span>
        <span class="wxb-meta">${newest ? ago(newest) : ''}</span>
        <svg class="wxb-caret" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5l3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="wxb-body">${body}</div>`;
  }

  async function load() {
    if (!el || view.scannerId !== 'wolfx' || document.hidden || loading) return;
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
  function schedule() {
    clearInterval(timer);
    if (view.scannerId === 'wolfx') timer = setInterval(load, POLL_MS);
  }

  window.CHESTWolfxBoard = {
    mount(host, options) {
      cfg = options;
      el = document.createElement('aside');
      el.className = 'wxb';
      el.hidden = true;
      el.setAttribute('aria-label', 'Force du marché selon Wolfx');
      host.appendChild(el);
      el.addEventListener('click', (e) => {
        const pick = e.target.closest('[data-wxb-pick]');
        if (pick) { cfg.onPick && cfg.onPick(pick.dataset.wxbPick); return; }
        if (e.target.closest('[data-wxb-toggle]')) { setCollapsed(!collapsed()); render(); }
      });
      document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
    },
    update(next) {
      const wasWolfx = view.scannerId === 'wolfx';
      view = Object.assign(view, next);
      render();
      if (view.scannerId === 'wolfx' && (!wasWolfx || !data)) load();
      if (wasWolfx !== (view.scannerId === 'wolfx')) schedule();
    },
  };
})();
