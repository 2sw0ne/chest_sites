// Landing · « Trouver mon pack » (2026-11-12) : les prix des deux cartes sont floutés. Un clic ouvre une fenêtre :
// 1) le code donné par le référent (vérifié par GET /ref/<code>), 2) un audit (objectif, niveau, capital, budget en une
// fois ou par mois, temps), 3) la recommandation : le pack conseillé, ses 4 durées (prix, €/mois, « dans ton budget »),
// la liste de ce qu'il contient qui se coche selon la durée choisie, et l'autre pack en dessous.
// Fin : /inscription?ref=CODE&offre=<clé> (l'offre voulue est aussi gardée dans chest_wanted_offer).
(function () {
  const duo = document.querySelector('#offres .duo');
  if (!duo) return;
  const API = (window.CHEST_CONFIG && window.CHEST_CONFIG.accountsApiUrl) || 'https://accounts-bridge-production.up.railway.app';
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = (n) => Math.round(n).toLocaleString('fr-FR') + ' €';
  const dur = (m) => (m === 12 ? '1 an' : m + ' mois');
  const ROM = ['', 'I', 'II', 'III', 'IV'];
  let OFFERS = null, CODE = '', EDU = '', ANS = {}, SEL = null;
  fetch(API + '/pricing').then((r) => r.json()).then((d) => { OFFERS = (d.offers || []).filter((o) => o.enabled); }).catch(() => {});

  // Prix floutés + boutons qui ouvrent la fenêtre
  duo.classList.add('lp-locked');
  duo.querySelectorAll('.offer').forEach((card) => {
    const price = card.querySelector('.o-price');
    if (price && !card.querySelector('.lp-lock')) price.insertAdjacentHTML('beforebegin', '<button type="button" class="lp-lock" data-lp-open><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>Prix réservés aux invités · entre le code de ton référent</button>');
    card.querySelectorAll('a[href="/inscription"]').forEach((a) => { a.setAttribute('href', '#offres'); a.setAttribute('data-lp-open', ''); });
  });
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-lp-open]'); if (b) { e.preventDefault(); open(); } });

  const css = `
#offres .lp-locked .o-price, #offres .lp-locked .o-full{ filter:blur(9px); user-select:none; pointer-events:none; }
.lp-lock{ display:inline-flex; align-items:center; gap:8px; align-self:flex-start; margin-top:18px; padding:8px 13px; border:0; border-radius:999px; font:inherit; font-size:12.5px; font-weight:600; color:#f6f6f7; background:rgba(255,255,255,.07); box-shadow:inset 0 0 0 1px rgba(255,255,255,.14); cursor:pointer; }
.lp-lock svg{ width:15px; height:15px; fill:none; stroke:currentColor; stroke-width:1.9; stroke-linecap:round; }
.lp-lock:hover{ box-shadow:inset 0 0 0 1px rgba(252,18,131,.55); }
.lp{ position:fixed; inset:0; z-index:9000; display:grid; place-items:center; padding:16px; background:rgba(0,0,0,.7); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); }
.lp[hidden]{ display:none; }
.lp__win{ position:relative; font-family:'Instrument Sans', system-ui, sans-serif; width:min(980px, 100%); max-height:calc(100dvh - 32px); overflow:auto; padding:30px; border-radius:24px; color:#f6f6f7; background:#0c0c0f; box-shadow:inset 0 0 0 1px rgba(255,255,255,.12), 0 40px 120px rgba(0,0,0,.6); animation:lpIn .24s cubic-bezier(.16,1,.3,1); }
.lp__win.is-narrow{ width:min(560px, 100%); }
@keyframes lpIn{ from{ opacity:0; transform:translateY(12px) scale(.98); } }
.lp__x{ position:absolute; top:16px; right:16px; width:36px; height:36px; border:0; border-radius:11px; background:rgba(255,255,255,.06); color:#9b9ba1; font-size:19px; cursor:pointer; }
.lp__k{ font-family:'Fragment Mono', ui-monospace, monospace; font-size:10px; letter-spacing:.24em; text-transform:uppercase; color:#5c5c63; }
.lp h3{ margin:8px 0 6px; font-size:clamp(24px, 3vw, 32px); letter-spacing:-.03em; line-height:1.1; }
.lp p.lp__lead{ margin:0 0 18px; color:#9b9ba1; font-size:14.5px; line-height:1.55; }
.lp__code{ display:flex; gap:8px; }
.lp__code input{ flex:1; height:50px; padding:0 16px; border-radius:14px; border:1px solid rgba(255,255,255,.14); background:rgba(255,255,255,.04); color:#f6f6f7; font:inherit; font-size:18px; letter-spacing:.14em; text-transform:uppercase; outline:none; }
.lp__code input:focus{ border-color:rgba(252,18,131,.6); box-shadow:0 0 0 3px rgba(252,18,131,.18); }
.lp__go{ height:50px; padding:0 20px; border:0; border-radius:14px; font:inherit; font-weight:700; color:#fff; background:linear-gradient(90deg,#fc1283,#f9a45e); cursor:pointer; }
.lp__go:disabled{ opacity:.5; cursor:default; }
.lp__err{ min-height:20px; margin:8px 0 0; font-size:13px; color:#ff94a0; }
.lp__bar{ height:4px; border-radius:4px; background:rgba(255,255,255,.07); margin:4px 0 20px; overflow:hidden; }
.lp__bar i{ display:block; height:100%; background:linear-gradient(90deg,#fc1283,#f9a45e); transition:width .3s cubic-bezier(.16,1,.3,1); }
.lp__opts{ display:grid; gap:9px; }
.lp__opt{ display:flex; align-items:center; gap:12px; min-height:54px; padding:12px 16px; border:0; border-radius:14px; text-align:left; font:inherit; font-size:14.5px; color:#f6f6f7; background:rgba(255,255,255,.04); box-shadow:inset 0 0 0 1px rgba(255,255,255,.09); cursor:pointer; transition:box-shadow .2s, background-color .2s; }
.lp__opt small{ display:block; font-size:12px; color:#9b9ba1; margin-top:2px; }
.lp__opt:hover, .lp__opt:focus-visible{ background:rgba(252,18,131,.07); box-shadow:inset 0 0 0 1px rgba(252,18,131,.5); outline:none; }
.lp__back{ margin-top:14px; border:0; background:none; color:#9b9ba1; font:inherit; font-size:13px; cursor:pointer; }
.lp__res{ display:grid; grid-template-columns:minmax(0, 1fr) minmax(0, 1.15fr); gap:22px; margin-top:6px; }
.lp__feats{ list-style:none; margin:0; padding:18px; border-radius:18px; background:rgba(255,255,255,.03); box-shadow:inset 0 0 0 1px rgba(255,255,255,.08); display:grid; gap:11px; align-content:start; }
.lp__feats li{ display:flex; gap:10px; font-size:14px; line-height:1.4; color:#5c5c63; transition:color .25s; }
.lp__feats li i{ flex:none; width:20px; height:20px; border-radius:50%; display:grid; place-items:center; background:rgba(255,255,255,.06); transition:background-color .25s; }
.lp__feats li i svg{ width:12px; height:12px; fill:none; stroke:transparent; stroke-width:2.6; stroke-linecap:round; stroke-linejoin:round; transition:stroke .25s; }
.lp__feats li.is-on{ color:#f6f6f7; }
.lp__feats li.is-on i{ background:linear-gradient(135deg,#fc1283,#f9a45e); }
.lp__feats li.is-on i svg{ stroke:#fff; }
.lp__rows{ display:grid; gap:9px; }
.lp__row{ display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:4px 14px; padding:14px 16px; border:0; border-radius:16px; text-align:left; font:inherit; color:#f6f6f7; background:rgba(255,255,255,.035); box-shadow:inset 0 0 0 1px rgba(255,255,255,.09); cursor:pointer; transition:box-shadow .2s, background-color .2s, opacity .2s; }
.lp__row b.lp__d{ font-size:16px; }
.lp__row .lp__p{ text-align:right; font-size:20px; font-weight:700; font-variant-numeric:tabular-nums; }
.lp__row small{ grid-column:2 / 4; font-size:12px; color:#9b9ba1; }
.lp__row.is-out{ opacity:.5; }
.lp__row.is-on{ background:rgba(252,18,131,.09); box-shadow:inset 0 0 0 1.5px rgba(252,18,131,.7); }
.lp__chip{ font-size:10.5px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; padding:3px 8px; border-radius:999px; color:#33e6a6; background:rgba(51,230,166,.12); justify-self:start; }
.lp__chip.is-reco{ color:#fff; background:linear-gradient(90deg,#fc1283,#f9a45e); }
.lp__cta{ display:flex; flex-wrap:wrap; align-items:center; gap:12px; margin-top:16px; }
.lp__cta .lp__go{ display:inline-flex; align-items:center; text-decoration:none; }
.lp__why{ margin:0 0 14px; padding:12px 14px; border-radius:14px; font-size:13.5px; line-height:1.55; color:#9b9ba1; background:rgba(255,255,255,.03); }
.lp__why b{ color:#f6f6f7; }
.lp__other{ margin-top:22px; padding-top:18px; border-top:1px solid rgba(255,255,255,.08); }
.lp__other .lp__rows{ grid-template-columns:repeat(4, minmax(0,1fr)); }
.lp__other .lp__row{ grid-template-columns:1fr; text-align:left; padding:12px; }
.lp__other .lp__row .lp__p{ text-align:left; font-size:16px; }
.lp__other .lp__row small{ grid-column:auto; }
@media (max-width:760px){ .lp__win{ padding:22px 16px; } .lp__res{ grid-template-columns:1fr; } .lp__other .lp__rows{ grid-template-columns:1fr 1fr; } }
@media (prefers-reduced-motion: reduce){ .lp__win{ animation:none; } }`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const box = document.createElement('div'); box.className = 'lp'; box.hidden = true;
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Trouver mon pack CHEST');
  document.body.appendChild(box);
  box.addEventListener('click', (e) => { if (e.target === box || e.target.closest('[data-lp-x]')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !box.hidden) close(); });
  function close() { box.hidden = true; document.documentElement.style.overflow = ''; }
  const X = '<button type="button" class="lp__x" data-lp-x aria-label="Fermer">×</button>';
  function show(html, narrow) { box.innerHTML = `<div class="lp__win${narrow ? ' is-narrow' : ''}">${X}${html}</div>`; box.hidden = false; document.documentElement.style.overflow = 'hidden'; }

  function open() {
    if (CODE) return audit(0);
    show(`<span class="lp__k">01 — Accès invité</span><h3>Le code de ton référent</h3>
      <p class="lp__lead">CHEST est réservé aux personnes invitées. Entre le code que t’a donné ton référent : il débloque les prix et un audit rapide pour trouver le pack qui te correspond vraiment.</p>
      <form class="lp__code" id="lpCode"><input type="text" name="c" maxlength="12" autocomplete="off" spellcheck="false" aria-label="Code du référent" placeholder="CODE" autofocus><button class="lp__go" type="submit">Débloquer</button></form>
      <p class="lp__err" id="lpErr" role="alert"></p>`, true);
    const f = document.getElementById('lpCode');
    f.c.focus();
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const c = f.c.value.trim().toUpperCase(), btn = f.querySelector('button');
      if (!c) return;
      btn.disabled = true;
      try {
        const r = await fetch(API + '/ref/' + encodeURIComponent(c));
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(r.status === 429 ? 'Trop d’essais, réessaie dans quelques minutes.' : 'Ce code ne correspond à aucun référent.');
        CODE = c; EDU = d.educator || '';
        audit(0);
      } catch (err) { document.getElementById('lpErr').textContent = err.message; btn.disabled = false; }
    });
  }

  const Q = [
    ['goal', 'Qu’attends-tu de CHEST ?', [['tools', 'Les outils pour trader en autonomie', 'Scanners, backtesting, journal, calendrier'], ['coach', 'Être accompagné jusqu’à être rentable', 'Un éducateur, des appels, School'], ['auto', 'Faire travailler mon compte automatiquement', 'BERICH trade pour toi, depuis un VPS']]],
    ['level', 'Où en es-tu en trading ?', [['new', 'Je découvre'], ['base', 'J’ai des bases, pas encore régulier'], ['pro', 'Je suis déjà rentable ou presque']]],
    ['capital', 'Ton capital de trading (compte propre ou propfirm)', [['s', 'Moins de 1 000 €'], ['m', '1 000 à 5 000 €'], ['l', '5 000 à 20 000 €'], ['xl', 'Plus de 20 000 €'], ['pf', 'Je passe par des propfirms']]],
    ['once', 'Ce que tu peux investir en une fois, sans te mettre en difficulté', [['0', 'Moins de 300 €'], ['300', '300 à 900 €'], ['900', '900 à 1 700 €'], ['1700', '1 700 à 3 000 €'], ['3000', '3 000 € ou plus']]],
    ['month', 'Et chaque mois, sans souci ?', [['0', 'Moins de 150 €'], ['150', '150 à 300 €'], ['300', '300 € ou plus']]],
    ['time', 'Combien de temps par semaine pour le trading ?', [['s', 'Moins de 3 h'], ['m', '3 à 10 h'], ['l', 'Plus de 10 h']]],
  ];
  function audit(i) {
    const [key, title, opts] = Q[i];
    show(`<span class="lp__k">02 — Audit · ${i + 1} / ${Q.length}</span>${EDU ? `<p class="lp__lead" style="margin:6px 0 0">Code de <b style="color:#f6f6f7">${esc(EDU)}</b> validé.</p>` : ''}
      <div class="lp__bar"><i style="width:${(i / Q.length) * 100}%"></i></div><h3>${esc(title)}</h3>
      <div class="lp__opts">${opts.map(([v, l, s]) => `<button type="button" class="lp__opt" data-v="${v}"><span>${esc(l)}${s ? `<small>${esc(s)}</small>` : ''}</span></button>`).join('')}</div>
      ${i ? '<button type="button" class="lp__back" data-back>← Question précédente</button>' : ''}`, true);
    box.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => { ANS[key] = b.dataset.v; if (i + 1 < Q.length) audit(i + 1); else result(); }));
    const bk = box.querySelector('[data-back]'); if (bk) bk.addEventListener('click', () => audit(i - 1));
    const f = box.querySelector('.lp__opt'); if (f) f.focus();
  }

  // Recommandation : le pack selon l'objectif et le niveau, la durée la plus longue que le budget permet
  // (en une fois), sinon la formule au mois si le budget mensuel la couvre.
  function result() {
    if (!OFFERS || !OFFERS.length) { show('<span class="lp__k">03</span><h3>Un instant…</h3><p class="lp__lead">Les offres se chargent, réessaie dans une seconde.</p>', true); setTimeout(result, 1200); return; }
    const once = Number(ANS.once) || 0, month = Number(ANS.month) || 0;
    const wantPrem = ANS.goal !== 'tools' || ANS.level === 'new';
    const of = (g) => OFFERS.filter((o) => o.group === g).sort((a, b) => b.months - a.months);
    const fits = (o) => o.price <= (once >= 3000 ? Infinity : once) || (o.months === 1 && o.price <= (month >= 300 ? Infinity : month));
    const canPrem = of('premium').some(fits);
    const group = wantPrem && canPrem ? 'premium' : 'essentiel';
    const list = of(group);
    const reco = list.find(fits) || list[list.length - 1];
    SEL = reco.key;
    const why = group === 'premium'
      ? `Tu veux ${ANS.goal === 'auto' ? 'automatiser ton compte avec BERICH' : ANS.goal === 'coach' ? 'être accompagné jusqu’à la rentabilité' : 'progresser vite'} : <b>Premium</b> te donne ton éducateur, School et BERICH. ${reco.months === 12 ? 'Ton budget permet l’année, la formule la plus avantageuse.' : reco.months === 1 ? 'Avec ton budget, la formule au mois est la plus sûre : tu gardes la main, sans avance.' : `Ton budget couvre ${dur(reco.months)} : la meilleure durée possible pour toi aujourd’hui.`}`
      : `${wantPrem ? 'Premium dépasse ton budget pour l’instant. ' : ''}<b>Essentiel</b> te donne tous les outils de CHEST. ${reco.months === 1 ? 'La formule au mois correspond à ton budget.' : `Ton budget couvre ${dur(reco.months)}.`}`;
    paintResult(group, why);
  }
  const CK = '<svg viewBox="0 0 24 24"><path d="M5 12.5 10 17 19 7"/></svg>';
  function paintResult(group, why) {
    const once = Number(ANS.once) || 0, month = Number(ANS.month) || 0;
    const list = OFFERS.filter((o) => o.group === group).sort((a, b) => b.months - a.months);
    const sel = list.find((o) => o.key === SEL) || list[0];
    const fits = (o) => o.price <= (once >= 3000 ? Infinity : once) || (o.months === 1 && o.price <= (month >= 300 ? Infinity : month));
    const recoKey = (list.find(fits) || list[list.length - 1]).key;
    const all = [];
    list.forEach((o) => (o.feats || []).forEach(([on, t]) => { if (on && !all.includes(t)) all.push(t); }));
    const has = new Set((sel.feats || []).filter((f) => f[0]).map((f) => f[1]));
    const row = (o, small) => `<button type="button" class="lp__row${o.key === sel.key && !small ? ' is-on' : ''}${fits(o) ? '' : ' is-out'}" data-pick="${o.key}">
        <b class="lp__d">${dur(o.months)}</b>${small ? '' : (o.key === recoKey ? '<span class="lp__chip is-reco">Conseillée</span>' : fits(o) ? '<span class="lp__chip">Dans ton budget</span>' : '<span></span>')}<span class="lp__p">${eur(o.price)}</span>
        <small>${o.months > 1 ? `soit ${eur(o.price / o.months)} / mois · ` : ''}${Number(o.renew || o.price) !== Number(o.price) ? `puis ${eur(o.renew)} / an` : `renouvelé ${o.months === 1 ? 'chaque mois' : o.months === 12 ? 'chaque année' : 'tous les ' + o.months + ' mois'}`}</small></button>`;
    const other = group === 'premium' ? 'essentiel' : 'premium';
    const olist = OFFERS.filter((o) => o.group === other).sort((a, b) => b.months - a.months);
    show(`<span class="lp__k">03 — Ton pack</span><h3>${group === 'premium' ? 'Premium' : 'Essentiel'} ${ROM[sel.level] || ''} · ${dur(sel.months)}</h3>
      <p class="lp__why">${why || ''}</p>
      <div class="lp__res">
        <ul class="lp__feats" aria-label="Ce que contient ce pack">${all.map((t) => `<li class="${has.has(t) ? 'is-on' : ''}"><i>${CK}</i>${esc(t)}</li>`).join('')}</ul>
        <div><div class="lp__rows" role="radiogroup" aria-label="Durée">${list.map((o) => row(o)).join('')}</div>
          <div class="lp__cta"><a class="lp__go" href="/inscription?ref=${encodeURIComponent(CODE)}&offre=${encodeURIComponent(sel.key)}" data-lp-signup>Créer mon compte · ${esc(sel.name || '')}</a><span style="font-size:12px;color:#5c5c63">Paiement après l’inscription, par carte ou en crypto.</span></div></div>
      </div>
      ${olist.length ? `<div class="lp__other"><span class="lp__k">L’autre pack · ${other === 'premium' ? 'Premium' : 'Essentiel'}</span><div class="lp__rows" style="margin-top:10px">${olist.map((o) => row(o, true)).join('')}</div></div>` : ''}`);
    box.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => {
      SEL = b.dataset.pick;
      const g = SEL.replace(/\d$/, '');
      paintResult(g, g === group ? why : `Tu regardes <b>${g === 'premium' ? 'Premium' : 'Essentiel'}</b>. Les durées marquées « Dans ton budget » correspondent à tes réponses.`);
    }));
    const su = box.querySelector('[data-lp-signup]');
    if (su) su.addEventListener('click', () => { try { localStorage.setItem('chest_wanted_offer', sel.key); } catch (e) { /* tant pis */ } });
  }
})();
