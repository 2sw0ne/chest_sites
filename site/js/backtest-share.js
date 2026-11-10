// Partage d'un backtest : (1) export en fichier HTML autonome, (2) envoi à un autre membre du site.
//
// Envoi : le serveur de comptes garde une COPIE dans la boîte du destinataire (POST /backtests/share) ; elle
// est récupérée à l'ouverture du hub Backtesting (pullInbox) et devient un backtest ordinaire du destinataire,
// simplement étiqueté « by <expéditeur> ». Aucun lien ensuite : modifier sa copie ne touche pas l'original.
//
// Export HTML : le rapport (backtest-view.html) est reconstruit en un seul fichier — CSS, moteur de calcul,
// règles propfirm, Chart.js et les trades sont inclus ; l'authentification, le menu et la synchro sont retirés.
// Il s'ouvre sans compte ni serveur. Seules les polices Google et les images relatives (retournées en URL
// absolues du site) demandent internet ; sans elles le rapport reste complet.
(() => {
  'use strict';

  const apiBase = () => (window.CHEST_CONFIG && window.CHEST_CONFIG.accountsApiUrl) || 'http://localhost:8080';
  const token = () => (window.CHESTAccounts && window.CHESTAccounts.getToken()) || null;

  async function api(path, opts) {
    const o = opts || {};
    const res = await fetch(apiBase() + path, {
      method: o.method || 'GET',
      headers: { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' },
      body: o.body ? JSON.stringify(o.body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* corps vide */ }
    if (!res.ok) throw new Error((data && data.error) || 'Le serveur ne répond pas, réessaie dans un instant.');
    return data;
  }

  // ------------------------------------------------------------------ Réception
  /** Récupère les backtests reçus, les ajoute au stockage local puis les retire de la boîte. Renvoie le nombre ajouté. */
  async function pullInbox() {
    if (!token()) return 0;
    let items;
    try { items = (await api('/backtests/inbox')).items || []; } catch (e) { return 0; }
    let added = 0;
    const known = new Set(window.CHESTBacktests.list().map((b) => b.sharedInboxId).filter(Boolean));
    for (const it of items) {
      try {
        if (!known.has(it.id)) {
          window.CHESTBacktests.add(Object.assign({}, it.backtest, {
            sharedBy: { name: (it.from && it.from.name) || 'Un membre' },
            sharedAt: it.createdAt,
            sharedInboxId: it.id,
          }));
          added++;
        }
        await api('/backtests/inbox/' + it.id + '/ack', { method: 'POST' });
      } catch (e) { break; } // stockage plein ou réseau coupé : on réessaiera à la prochaine ouverture
    }
    return added;
  }

  // ------------------------------------------------------------------ Fenêtre « Partager à un membre »
  const CSS = `
  .btsh{ position:fixed; inset:0; z-index:200; display:flex; align-items:center; justify-content:center; padding:20px; background:rgba(var(--bg0-rgb, 5, 5, 5),.6); backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); }
  .btsh[hidden]{ display:none; }
  .btsh__box{ width:min(440px,100%); border-radius:20px; border:1px solid rgba(var(--fg-rgb, 255, 255, 255),.14); padding:22px; color:var(--ink, #f6f6f7);
    background:linear-gradient(180deg,rgba(var(--fg-rgb, 255, 255, 255),.07),rgba(var(--fg-rgb, 255, 255, 255),.02)), rgba(var(--dk-rgb, 14, 14, 16),.92);
    box-shadow:inset 0 1.5px 0 rgba(255, 255, 255, .12), 0 30px 80px rgba(0, 0, 0, calc(.6 * var(--sh-k, 1))); font-family:'Instrument Sans',system-ui,sans-serif; }
  .btsh__k{ font-size:10px; letter-spacing:.24em; text-transform:uppercase; color:var(--ink-4, #5c5c63); }
  .btsh__t{ margin:8px 0 4px; font-size:21px; font-weight:700; letter-spacing:-.03em; }
  .btsh__d{ margin:0 0 16px; font-size:12.5px; line-height:1.55; color:var(--ink-2, #9b9ba1); }
  .btsh__in{ width:100%; box-sizing:border-box; height:42px; border-radius:12px; padding:0 14px; font:inherit; font-size:14px; color:var(--ink, #f6f6f7);
    background:rgba(var(--fg-rgb, 255, 255, 255),.03); border:1px solid rgba(var(--fg-rgb, 255, 255, 255),.12); }
  .btsh__in:focus{ outline:none; border-color:rgba(var(--a1-rgb, 252, 18, 131),.6); box-shadow:0 0 0 3px rgba(var(--a1-rgb, 252, 18, 131),.15); }
  .btsh__list{ margin:10px 0 0; display:flex; flex-direction:column; gap:6px; max-height:210px; overflow:auto; }
  .btsh__row{ text-align:left; display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:12px; font:inherit; font-size:14px; color:var(--ink, #f6f6f7); cursor:pointer;
    background:rgba(var(--fg-rgb, 255, 255, 255),.03); border:1px solid rgba(var(--fg-rgb, 255, 255, 255),.1); }
  .btsh__row:hover, .btsh__row.is-on{ border-color:rgba(var(--a2-rgb, 249, 164, 94),.55); background:rgba(var(--a2-rgb, 249, 164, 94),.08); }
  .btsh__av{ width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex:none; font-size:11px; font-weight:700; color:#fff; background:linear-gradient(135deg,var(--a1, #fc1283),var(--a2, #f9a45e)); }
  .btsh__msg{ min-height:18px; margin:12px 0 0; font-size:12.5px; color:var(--ink-2, #9b9ba1); }
  .btsh__msg.is-err{ color:var(--red, #ff4d5e); } .btsh__msg.is-ok{ color:var(--green, #33e6a6); }
  .btsh__act{ display:flex; gap:10px; justify-content:flex-end; margin-top:16px; }
  .btsh__btn{ height:40px; padding:0 18px; border-radius:99px; font:inherit; font-size:13.5px; font-weight:600; cursor:pointer; color:var(--ink, #f6f6f7); background:rgba(var(--fg-rgb, 255, 255, 255),.06); border:1px solid rgba(var(--fg-rgb, 255, 255, 255),.14); }
  .btsh__btn--go{ border:0; color:#fff; background:linear-gradient(90deg,var(--a1, #fc1283),var(--a2, #f9a45e)); box-shadow:0 8px 24px rgba(var(--a1-rgb, 252, 18, 131),.3); }
  .btsh__btn[disabled]{ opacity:.45; cursor:default; box-shadow:none; }
  `;

  function openShareDialog(record) {
    if (!document.getElementById('btshCss')) {
      const st = document.createElement('style'); st.id = 'btshCss'; st.textContent = CSS; document.head.appendChild(st);
    }
    const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const root = document.createElement('div');
    root.className = 'btsh';
    root.innerHTML = `<div class="btsh__box" role="dialog" aria-modal="true" aria-label="Partager ce backtest">
      <div class="btsh__k">Partager</div>
      <h3 class="btsh__t">${esc(record.title)}</h3>
      <p class="btsh__d">Tape le prénom ou le nom d'un membre. Le membre reçoit une copie dans son Backtesting, marquée « by toi » : si la copie est modifiée, la tienne ne change pas.</p>
      <input class="btsh__in" type="text" placeholder="Prénom ou nom du membre" autocomplete="off" spellcheck="false">
      <div class="btsh__list"></div>
      <p class="btsh__msg" role="status"></p>
      <div class="btsh__act"><button type="button" class="btsh__btn" data-close>Fermer</button><button type="button" class="btsh__btn btsh__btn--go" data-send disabled>Envoyer</button></div>
    </div>`;
    document.body.appendChild(root);
    const input = root.querySelector('.btsh__in'), list = root.querySelector('.btsh__list'), msg = root.querySelector('.btsh__msg'), send = root.querySelector('[data-send]');
    let chosen = null, timer = null, seq = 0;
    const say = (t, cls) => { msg.textContent = t || ''; msg.className = 'btsh__msg' + (cls ? ' ' + cls : ''); };
    const close = () => { document.removeEventListener('keydown', onKey); root.remove(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    root.addEventListener('click', (e) => { if (e.target === root || e.target.closest('[data-close]')) close(); });
    input.focus();

    input.addEventListener('input', () => {
      chosen = null; send.disabled = true; say('');
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) { list.innerHTML = ''; return; }
      timer = setTimeout(async () => {
        const mine = ++seq;
        try {
          const { members } = await api('/members/search?q=' + encodeURIComponent(q));
          if (mine !== seq) return;
          list.innerHTML = members.length ? members.map((m) => {
            const ini = m.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
            return `<button type="button" class="btsh__row" data-id="${m.id}" data-name="${esc(m.name)}"><span class="btsh__av">${esc(ini)}</span>${esc(m.name)}</button>`;
          }).join('') : '';
          if (!members.length) say('Aucun membre trouvé.');
        } catch (e) { say(e.message, 'is-err'); }
      }, 250);
    });
    list.addEventListener('click', (e) => {
      const row = e.target.closest('.btsh__row'); if (!row) return;
      list.querySelectorAll('.btsh__row').forEach((r) => r.classList.toggle('is-on', r === row));
      chosen = { id: Number(row.dataset.id), name: row.dataset.name };
      send.disabled = false; say('');
    });
    send.addEventListener('click', async () => {
      if (!chosen) return;
      send.disabled = true; say('Envoi en cours…');
      try {
        const full = window.CHESTBacktests.get(record.id) || record;
        await api('/backtests/share', { method: 'POST', body: { toUserId: chosen.id, backtest: full } });
        say(`Envoyé à ${chosen.name}. Le backtest apparaîtra dans son Backtesting.`, 'is-ok');
        setTimeout(close, 1800);
      } catch (e) { say(e.message, 'is-err'); send.disabled = false; }
    });
  }

  // ------------------------------------------------------------------ Export HTML autonome
  const SKIP_SCRIPTS = /(?:^|\/)(theme|config|config\.local|auth|accounts-auth|sync-store|nav|chest-ui|confirm-dialog|lot-calculator|page-tour|backtest-store|backtest-share)\.js/;

  const text = async (url) => { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error('Ressource introuvable : ' + url); return r.text(); };
  // Le contenu d'un <script> ne doit jamais contenir « </script » : on l'échappe avant de l'inliner.
  const safeJs = (js) => js.replace(/<\/script/gi, '<\\/script');

  // Rend absolues les URL relatives d'une feuille de style (images du site), pour qu'elles marchent hors du site.
  function absolutizeCss(css, cssUrl) {
    return css.replace(/url\(\s*(['"]?)(?!data:|https?:|#|\/\/)([^)'"]+)\1\s*\)/g, (m, q, u) => `url("${new URL(u, cssUrl).href}")`);
  }

  async function buildExportHtml(record) {
    const base = new URL('backtest-view.html', location.href).href;
    const doc = new DOMParser().parseFromString(await text('backtest-view.html'), 'text/html');
    const root = doc.documentElement;
    root.classList.add('is-embedded');
    root.setAttribute('data-theme', 'dark');

    // Feuilles de style locales -> <style>
    for (const link of [...doc.querySelectorAll('link[rel="stylesheet"]')]) {
      const href = link.getAttribute('href') || '';
      if (/^https?:/.test(href)) continue; // polices Google : gardées en ligne
      const url = new URL(href, base).href;
      const st = doc.createElement('style');
      st.textContent = absolutizeCss(await text(url), url);
      link.replaceWith(st);
    }
    // Scripts
    for (const sc of [...doc.querySelectorAll('script')]) {
      const src = sc.getAttribute('src');
      if (src) {
        if (SKIP_SCRIPTS.test(src)) { sc.remove(); continue; }
        const url = new URL(src, base).href;
        let js;
        try { js = await text(url); } catch (e) { if (/^https?:/.test(src)) continue; throw e; } // CDN injoignable : on laisse la balise
        const inl = doc.createElement('script');
        inl.textContent = safeJs(js);
        sc.replaceWith(inl);
      } else if (/CHESTAccounts\.guard|CHESTTour\.init/.test(sc.textContent)) {
        sc.remove();
      } else {
        sc.textContent = safeJs(sc.textContent.replace("const id = params.get('id');", "const id = params.get('id') || 'export';"));
      }
    }
    // Données + doublures des modules retirés, avant tout le reste
    const stub = doc.createElement('script');
    const rec = JSON.stringify(record).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    stub.textContent = `window.__CHEST_EXPORT__=true;window.CHEST_CONFIG={};var __REC__=${rec};
window.CHESTAccounts={guard:function(){},isLoggedIn:function(){return true;},isAdmin:function(){return false;},getToken:function(){return null;},getUser:function(){return null;},apiBase:function(){return "";}};
window.CHESTBacktests={get:function(){return __REC__;},list:function(){return [__REC__];},ensure:function(){return Promise.resolve(__REC__);},ready:function(){return Promise.resolve();},flush:function(){return Promise.resolve();},onChange:function(){return function(){};},update:function(){},add:function(){},remove:function(){}};
window.CHESTConfirm=function(){return Promise.resolve(false);};
window.CHESTTour={init:function(){}};`;
    doc.head.appendChild(stub);
    // Le stub doit passer avant les scripts du corps : on le place en tête du <head>
    doc.head.insertBefore(stub, doc.head.firstChild);

    const extra = doc.createElement('style');
    // BUG REEL (2026-10-12, retour utilisateur avec plusieurs captures : le rapport telecharge puis
    // ouvert en double-clic - file:// - restait plus clair que le site a chaque passe (blanc, puis
    // gris une fois color-scheme ajoute). Cause trouvee en lisant le CSS : html.is-embedded
    // .chest-shell{ background:transparent } (chest-da.css) - une regle pensee pour l'iframe du
    // shell (app.html fournit le fond, la page embarquee doit rester transparente pour ne pas le
    // doubler) qui s'applique AUSSI a l'export, puisque buildExportHtml ajoute cette meme classe
    // is-embedded. Dans un fichier autonome il n'y a pas de parent pour fournir ce fond - demande
    // explicite utilisateur : ne plus compter sur color-scheme/le navigateur, fixer la couleur
    // nous-memes, directement, sur CHAQUE conteneur qui pourrait peindre par-dessus.
    extra.textContent = `html,body,.chest-shell,#mainZone{background:var(--bg-0, #050505) !important}
.bt-hero-glow{background:var(--bg-0, #050505) !important}
.bt-hero-glow__title{background:linear-gradient(180deg,light-dark(#fe94c7, #fff),#fe94c7) !important;-webkit-background-clip:text !important;background-clip:text !important;-webkit-text-fill-color:transparent !important;color:transparent !important}
.bt-hero-glow__stats span{color:#fff !important}
.chest-back,#editLink,#deleteBtn,.bt-hero-glow__actions,#btMenuWrap,.chest-fab,.lotcalc-fab,#sidebarToggle{display:none !important}
.bt-export-note{max-width:820px;margin:28px auto 0;padding:0 16px 40px;text-align:center;font-size:11.5px;line-height:1.6;color:var(--ink-4, #5c5c63)}`;
    doc.head.appendChild(extra);

    doc.title = `${record.title} — rapport de backtest (CHEST)`;
    const note = doc.createElement('p');
    note.className = 'bt-export-note';
    const who = record.sharedBy && record.sharedBy.name ? ` Backtest de ${record.sharedBy.name}.` : '';
    note.textContent = `Rapport exporté depuis CHEST le ${new Date().toLocaleDateString('fr-FR')}.${who} Simulation sur données historiques : ni prédiction, ni conseil financier.`;
    const main = doc.getElementById('mainZone');
    if (main) main.appendChild(note);

    return '<!DOCTYPE html>\n' + root.outerHTML;
  }

  async function downloadHtml(record) {
    const html = await buildExportHtml(window.CHESTBacktests.get(record.id) || record);
    const name = (record.title || 'backtest').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'backtest';
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `CHEST-${name}.html`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  window.CHESTShare = { pullInbox, openShareDialog, downloadHtml, buildExportHtml };
})();
