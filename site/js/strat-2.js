// CHEST 2.0 (2026-11-02) — page Stratégies d'après CHEST-DESIGN-2.0/html-exact/Strategies.html.
// Ne touche pas au graphique : déplace les onglets dans la carte du graphique, ajoute « Signal en cours »
// et « Derniers signaux » (opportunités de /alerts/signals, événement chest:scnr-opps de strategies.html)
// et l'état du marché dans la barre du haut. Pas de signal = état vide, rien d'inventé.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MONO = "font-family: 'JetBrains Mono', ui-monospace, monospace;";
  const POS = 'rgb(127, 243, 202)', NEG = 'rgb(255, 148, 160)';
  const TF = { 1: 'M1', 5: 'M5', 15: 'M15', 30: 'M30', 60: 'H1', 240: 'H4', D: 'D1' };
  const nf = (v, d) => Number(v).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const price = (v) => (v == null ? '—' : nf(v, Math.abs(v) >= 100 ? 1 : 4));
  const pair = (s) => { s = String(s || '').toUpperCase(); return /^[A-Z]{6}$/.test(s) ? s.slice(0, 3) + '/' + s.slice(3) : s; };
  const ago = (t) => { const m = Math.max(0, Math.round((Date.now() - t) / 60000)); if (m < 60) return m < 1 ? 'à l’instant' : `il y a ${m} min`; const h = Math.round(m / 60); return h < 24 ? `il y a ${h} h` : `il y a ${Math.round(h / 24)} j`; };

  // ---------- Onglets Graphique / À propos dans la carte du graphique ----------
  const card = $('scnrMediaCard'), tabs = $('scnrTabs');
  if (card && tabs) {
    const head = document.createElement('div');
    head.className = 's2-head';
    head.appendChild(tabs);
    head.insertAdjacentHTML('beforeend', `<div class="s2-legend" aria-hidden="true">
        <span><span style="width: 16px; height: 2px; background: rgb(249, 164, 94); box-shadow: rgba(249, 164, 94, 0.9) 0px 0px 8px;"></span>Biais</span>
        <span><svg width="10" height="10" viewBox="0 0 10 10"><path d="M5 1L9 9H1z" fill="#33e6a6"></path></svg>Signal</span>
      </div>`);
    card.insertBefore(head, card.firstChild);
  }

  // ---------- Signal en cours + derniers signaux ----------
  const box = document.createElement('section');
  box.className = 's2-sigs';
  box.id = 's2Sigs';
  if (card) card.after(box);

  function rOf(o) {
    const lv = o.levels || {};
    const tps = lv.tps || (lv.tp != null ? [lv.tp] : []);
    const risk = lv.pe != null && lv.sl != null ? Math.abs(lv.pe - lv.sl) : 0;
    const m = /^tp(\d+)$/.exec(o.status || '');
    if (o.status === 'sl') return -1;
    if (m && risk && tps[Number(m[1]) - 1] != null) return Math.abs(tps[Number(m[1]) - 1] - lv.pe) / risk;
    return null;
  }
  function statusLabel(o) {
    if (!o.status || o.status === 'active') return 'En cours';
    if (o.status === 'sl') return 'Stop';
    const m = /^tp(\d+)$/.exec(o.status);
    return m ? (m[1] === '1' ? 'Objectif touché' : `Objectif ${m[1]} touché`) : o.status;
  }
  const fmtR = (r) => (r == null ? '—' : (r > 0 ? '+' : r < 0 ? '−' : '') + nf(Math.abs(r), 1) + ' R');

  function paint(detail) {
    const list = (detail && detail.list) || [];
    const mine = list.filter((o) => o.scanner === detail.scannerId).sort((a, b) => b.time - a.time);
    const cur = mine[0];
    const head = (label, right) => `<div style="display: flex; align-items: center; gap: 10px;${right && right.pb ? ' padding-bottom: 8px;' : ''}">
            <span style="${MONO} font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: rgb(122, 122, 130);">${label}</span>${right ? right.html : ''}</div>`;
    let left;
    if (!cur) {
      left = `<div class="tile" style="position: relative; overflow: hidden; border-radius: 18px; border: 1px solid rgba(255, 255, 255, 0.07); background: linear-gradient(rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.01)); box-shadow: rgba(255, 255, 255, 0.05) 0px 1px 0px inset; padding: 22px; display: flex; flex-direction: column; gap: 16px;">
          ${head('Signal en cours')}
          <p style="margin: 0px; font-size: 13px; line-height: 1.6; color: rgb(155, 155, 161);">${detail && detail.error ? 'Signaux indisponibles pour le moment.' : `Pas de signal récent sur ${esc(pair(detail.symbol))} · ${esc(TF[detail.tf] || detail.tf)}. Active l’alerte pour être prévenu au prochain.`}</p>
        </div>`;
    } else {
      const buy = cur.side === 'buy', lv = cur.levels || {}, tps = lv.tps || (lv.tp != null ? [lv.tp] : []);
      const tone = buy ? POS : NEG, tint = buy ? '51, 230, 166' : '255, 77, 94';
      const risk = lv.pe != null && lv.sl != null ? Math.abs(lv.pe - lv.sl) : 0;
      const rr = risk && tps.length ? Math.abs(tps[tps.length - 1] - lv.pe) / risk : null;
      const r = rOf(cur);
      left = `<div class="tile" style="position: relative; overflow: hidden; border-radius: 18px; border: 1px solid rgba(${tint}, 0.25); background: linear-gradient(160deg, rgba(${tint}, 0.08), rgba(255, 255, 255, 0.01) 55%); box-shadow: rgba(255, 255, 255, 0.06) 0px 1px 0px inset; padding: 22px; display: flex; flex-direction: column; gap: 16px;">
          ${head('Signal en cours', { html: `<span style="margin-left: auto; display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: ${tone};"><span style="width: 6px; height: 6px; border-radius: 999px; background: rgb(${tint}); box-shadow: rgba(${tint}, 0.9) 0px 0px 8px;"></span>${esc(ago(cur.time))}</span>` })}
          <div style="display: flex; align-items: baseline; gap: 12px;">
            <span style="font-size: 30px; font-weight: 700; letter-spacing: -0.03em; color: ${tone}; text-shadow: rgba(${tint}, 0.45) 0px 0px 22px;">${buy ? 'Achat' : 'Vente'}</span>
            <span style="font-size: 15px; color: rgb(155, 155, 161);">${esc(pair(cur.symbol))} · ${esc(TF[cur.tf] || cur.tf)}</span>
            <span style="margin-left: auto; font-size: 20px; font-weight: 700; color: ${r == null ? 'rgb(155, 155, 161)' : r >= 0 ? POS : NEG}; font-variant-numeric: tabular-nums;">${r == null ? esc(statusLabel(cur)) : fmtR(r)}</span>
          </div>
          <div style="display: grid; grid-template-columns: repeat(4, minmax(0px, 1fr)); padding-top: 14px; border-top: 1px solid rgba(255, 255, 255, 0.07);">
            <div style="display: flex; flex-direction: column; gap: 4px;"><span style="font-size: 11px; color: rgb(122, 122, 130);">Entrée</span><span style="font-weight: 700; font-variant-numeric: tabular-nums;">${price(lv.pe)}</span></div>
            <div style="display: flex; flex-direction: column; gap: 4px; padding-left: 12px; border-left: 1px solid rgba(255, 255, 255, 0.07);"><span style="font-size: 11px; color: rgb(122, 122, 130);">Stop</span><span style="font-weight: 700; color: ${NEG}; font-variant-numeric: tabular-nums;">${price(lv.sl)}</span></div>
            <div style="display: flex; flex-direction: column; gap: 4px; padding-left: 12px; border-left: 1px solid rgba(255, 255, 255, 0.07);"><span style="font-size: 11px; color: rgb(122, 122, 130);">Objectif</span><span style="font-weight: 700; color: ${POS}; font-variant-numeric: tabular-nums;">${price(tps[tps.length - 1])}</span></div>
            <div style="display: flex; flex-direction: column; gap: 4px; padding-left: 12px; border-left: 1px solid rgba(255, 255, 255, 0.07);"><span style="font-size: 11px; color: rgb(122, 122, 130);">R:R</span><span style="font-weight: 700; font-variant-numeric: tabular-nums;">${rr == null ? '—' : '1 : ' + nf(rr, 1)}</span></div>
          </div>
          <button type="button" data-s2-lot style="align-self: flex-start; display: flex; align-items: center; gap: 8px; height: 40px; padding: 0px 16px; border: 0px; border-radius: 999px; color: rgb(255, 255, 255); font: inherit; font-weight: 600; cursor: pointer; background: linear-gradient(135deg, rgb(252, 18, 131), rgb(249, 164, 94)); box-shadow: rgba(252, 18, 131, 0.28) 0px 10px 30px;">Calculer mon lot</button>
        </div>`;
    }
    const rows = mine.slice(0, 5);
    const oldest = mine.length ? mine[mine.length - 1].time : null;
    const span = oldest ? Math.max(1, Math.ceil((Date.now() - oldest) / 86400000)) : 0;
    const right = `<div class="tile" style="border-radius: 18px; border: 1px solid rgba(255, 255, 255, 0.07); background: linear-gradient(rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.01)); box-shadow: rgba(255, 255, 255, 0.05) 0px 1px 0px inset; padding: 22px; display: flex; flex-direction: column; gap: 4px;">
          ${head('Derniers signaux', { pb: true, html: `<span style="margin-left: auto; font-size: 12px; color: rgb(155, 155, 161);">${mine.length ? `${span} jour${span > 1 ? 's' : ''} · ${mine.length} signa${mine.length > 1 ? 'ux' : 'l'}` : ''}</span>` })}
          ${rows.length ? rows.map((o) => {
            const d = new Date(o.time), buy = o.side === 'buy', r = rOf(o);
            return `<div class="row-h" style="display: grid; grid-template-columns: 1.2fr 0.8fr 1fr 0.7fr; align-items: center; gap: 10px; padding: 10px 8px; margin: 0px -8px; border-radius: 10px; font-size: 12.5px;">
              <span style="color: rgb(155, 155, 161); font-variant-numeric: tabular-nums;">${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
              <span><span style="font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; padding: 3px 8px; border-radius: 999px; color: ${buy ? POS : NEG}; background: ${buy ? 'rgba(51, 230, 166, 0.12)' : 'rgba(255, 77, 94, 0.12)'};">${buy ? 'Achat' : 'Vente'}</span></span>
              <span style="color: rgb(155, 155, 161);">${esc(statusLabel(o))}</span>
              <span style="text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; color: ${r == null ? 'rgb(155, 155, 161)' : r >= 0 ? POS : NEG};">${fmtR(r)}</span>
            </div>`;
          }).join('') : '<p style="margin: 6px 0px 0px; font-size: 12.5px; color: rgb(122, 122, 130);">Aucun signal récent sur cette paire et cette unité de temps.</p>'}
        </div>`;
    box.innerHTML = left + right;
  }
  document.addEventListener('chest:scnr-opps', (e) => paint(e.detail));
  box.addEventListener('click', (e) => {
    if (!e.target.closest('[data-s2-lot]')) return;
    const fab = document.querySelector('.lotcalc-fab');
    if (fab) fab.click();
  });

  // ---------- Barre du haut : marché ouvert / fermé + clôture de la bougie ----------
  const T = window.parent !== window && window.parent.CHESTTopbar;
  function marketOpen(d) {
    const day = d.getUTCDay(), h = d.getUTCHours();
    if (day === 6) return false;
    if (day === 5 && h >= 22) return false;
    if (day === 0 && h < 22) return false;
    return true;
  }
  function tick() {
    if (!T) return;
    const btn = document.querySelector('#scnrTimeframe button.is-active');
    const tf = btn ? btn.dataset.tf : '15';
    const now = new Date(), open = marketOpen(now);
    let txt = 'Marché fermé';
    if (open) {
      const mins = tf === 'D' ? 1440 : Number(tf);
      const ms = mins * 60000, left = ms - (now.getTime() % ms);
      const s = Math.floor(left / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
      txt = `Marché ouvert · bougie ${TF[tf] || tf} dans ${h ? h + ':' + String(m).padStart(2, '0') : m}:${String(sec).padStart(2, '0')}`;
    }
    const html = `<span style="display: flex; align-items: center; gap: 8px; height: 34px; padding: 0px 12px; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.1); font-size: 12px; color: rgb(155, 155, 161); font-variant-numeric: tabular-nums;">
        <span style="width: 6px; height: 6px; border-radius: 999px; background: ${open ? 'rgb(51, 230, 166)' : 'rgb(122, 122, 130)'}; box-shadow: ${open ? 'rgba(51, 230, 166, 0.16)' : 'rgba(255, 255, 255, 0.08)'} 0px 0px 0px 3px;"></span>${txt}
      </span>`;
    T.set(window, html);
  }
  tick();
  setInterval(tick, 1000);
})();
