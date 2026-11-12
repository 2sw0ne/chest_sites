// Landing · « Trouver mon pack » (2026-11-12) : les prix des deux cartes sont floutés. Un clic ouvre une fenêtre :
// 1) le code donné par le référent (vérifié par GET /ref/<code>), 2) un audit v2 (niveau, blocage, objectif, temps, cadre,
// capital, effort financier), 3) la recommandation : le pack conseillé, ses 4 durées (prix, €/mois, « dans ton budget »),
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
.lp__win.is-wide{ width:min(1180px, 100%); padding:30px 30px 22px; }
.lp__opt.is-on{ background:rgba(252,18,131,.09); box-shadow:inset 0 0 0 1.5px rgba(252,18,131,.7); }
.lp3{ display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1.08fr) minmax(0,1fr); gap:18px; align-items:stretch; margin-top:4px; }
.lp3__col{ padding:20px 18px; border-radius:20px; background:rgba(255,255,255,.025); box-shadow:inset 0 0 0 1px rgba(255,255,255,.08); }
.lp3__h{ display:block; margin-bottom:12px; font-family:'Fragment Mono', ui-monospace, monospace; font-size:10px; letter-spacing:.24em; text-transform:uppercase; color:#5c5c63; }
.lp3__plat, .lp3__skills{ list-style:none; margin:0; padding:0; display:grid; }
.lp3__plat li, .lp3__skills li{ display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:12px; padding:11px 0; border-top:1px solid rgba(255,255,255,.06); transition:opacity .25s; }
.lp3__plat li:first-child, .lp3__skills li:first-child{ border-top:0; }
.lp3__plat b, .lp3__skills b{ display:block; font-size:14px; font-weight:600; letter-spacing:-.01em; }
.lp3__plat small, .lp3__skills small{ display:block; margin-top:2px; font-size:12px; line-height:1.4; color:#9b9ba1; }
.lp3__ic{ width:34px; height:34px; border-radius:11px; display:grid; place-items:center; background:rgba(252,18,131,.1); box-shadow:inset 0 0 0 1px rgba(252,18,131,.25); }
.lp3__ic svg{ width:17px; height:17px; fill:none; stroke:#f9a45e; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
.lp3__n{ width:34px; font-family:'Fragment Mono', ui-monospace, monospace; font-size:12px; color:#fc1283; }
.lp3__skills i{ display:grid; place-items:center; width:20px; height:20px; border-radius:50%; background:rgba(51,230,166,.12); }
.lp3__skills i svg{ width:12px; height:12px; fill:none; stroke:#33e6a6; stroke-width:2.6; stroke-linecap:round; stroke-linejoin:round; }
.lp3 li.is-off{ opacity:.42; }
.lp3 li em{ display:inline-flex; align-items:center; gap:4px; font-style:normal; font-size:10.5px; font-weight:600; color:#9b9ba1; }
.lp3 li em svg, .lp3__perks svg{ width:13px; height:13px; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
.lp3__note{ margin:12px 0 0; font-size:12.5px; color:#9b9ba1; }
.lp3__card{ position:relative; display:flex; flex-direction:column; align-items:center; text-align:center; padding:26px 22px 20px; border-radius:24px; overflow:hidden; background:radial-gradient(120% 70% at 50% 0%, rgba(252,18,131,.16), transparent 60%), #101014; box-shadow:inset 0 0 0 1px rgba(255,255,255,.12), 0 30px 80px rgba(0,0,0,.45); }
.lp3__card.is-prem{ background:radial-gradient(120% 70% at 50% 0%, rgba(249,164,94,.2), rgba(252,18,131,.1) 40%, transparent 70%), #101014; box-shadow:inset 0 0 0 1px rgba(249,164,94,.32), 0 30px 80px rgba(0,0,0,.45); }
.lp3__chip{ font-size:10.5px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; padding:4px 10px; border-radius:999px; color:#fff; background:linear-gradient(90deg,#fc1283,#f9a45e); }
.lp3__name{ margin:14px 0 4px !important; font-size:clamp(26px, 2.8vw, 34px) !important; letter-spacing:-.035em; }
.lp3__name span{ background:linear-gradient(90deg,#fc1283,#f9a45e); -webkit-background-clip:text; background-clip:text; color:transparent; }
.lp3__sub{ margin:0 0 16px; font-size:13px; color:#9b9ba1; }
.lp3__price{ font-size:clamp(44px, 5vw, 58px); font-weight:700; letter-spacing:-.045em; line-height:1; font-variant-numeric:tabular-nums; }
.lp3__pm{ margin:8px 0 18px; font-size:13px; color:#9b9ba1; }
.lp3__durs{ display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:6px; width:100%; padding:4px; border-radius:14px; background:rgba(255,255,255,.04); }
.lp3__durs button{ position:relative; padding:8px 4px; border:0; border-radius:10px; font:inherit; font-size:12.5px; font-weight:600; color:#9b9ba1; background:none; cursor:pointer; transition:background-color .2s, color .2s; }
.lp3__durs button small{ display:block; margin-top:2px; font-size:11px; font-weight:500; font-variant-numeric:tabular-nums; color:#5c5c63; }
.lp3__durs button.is-fit::after{ content:''; position:absolute; top:6px; right:6px; width:5px; height:5px; border-radius:50%; background:#33e6a6; }
.lp3__durs button.is-on{ color:#f6f6f7; background:rgba(255,255,255,.1); box-shadow:inset 0 0 0 1px rgba(255,255,255,.14); }
.lp3__durs button.is-on small{ color:#9b9ba1; }
.lp3__durs button:active{ transform:scale(.97); }
.lp3__perks{ list-style:none; margin:14px 0 0; padding:0; display:grid; gap:6px; width:100%; text-align:left; }
.lp3__perks li{ display:flex; gap:8px; align-items:center; font-size:13px; color:#f6f6f7; }
.lp3__perks svg{ color:#33e6a6; flex:none; }
.lp3__facts{ display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:6px; width:100%; margin:16px 0 18px; }
.lp3__facts span{ display:flex; flex-direction:column; align-items:center; gap:3px; padding:10px 4px; border-radius:12px; font-size:11px; line-height:1.3; color:#9b9ba1; background:rgba(255,255,255,.035); }
.lp3__facts b{ font-size:15px; color:#f6f6f7; font-variant-numeric:tabular-nums; }
.lp3__go{ display:flex; align-items:center; justify-content:center; width:100%; height:52px; margin-top:auto; border-radius:14px; font-weight:700; text-decoration:none; color:#fff; background:linear-gradient(90deg,#fc1283,#f9a45e); box-shadow:0 12px 30px rgba(252,18,131,.3); transition:transform .16s ease-out, box-shadow .2s; }
.lp3__go:hover{ box-shadow:0 14px 38px rgba(252,18,131,.42); }
.lp3__go:active{ transform:scale(.98); }
.lp3__switch{ margin-top:12px; border:0; background:none; font:inherit; font-size:13px; color:#9b9ba1; cursor:pointer; }
.lp3__switch:hover{ color:#f6f6f7; }
.lp3__fine{ margin:16px 0 0; font-size:11.5px; color:#5c5c63; text-align:center; }
@media (max-width:980px){ .lp3{ grid-template-columns:1fr; } .lp3__card{ order:-1; } }
@media (max-width:760px){ .lp__win.is-wide{ padding:22px 14px 18px; } .lp3__durs{ grid-template-columns:repeat(2, minmax(0,1fr)); } }
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

  // Audit v2 (2026-11-12) : on vise un public à guider. Les questions mesurent où il en est, ce qui le bloque, ce qu'il
  // vise, le temps et le cadre qu'il accepte, puis son capital et l'effort financier qui lui est confortable.
  const Q = [
    ['stage', 'Où en es-tu aujourd’hui en trading ?', [['new', 'Je n’ai jamais vraiment tradé', 'Je pars de zéro'], ['lose', 'J’ai essayé, je perds plus que je gagne'], ['irreg', 'Je trade, mais sans régularité'], ['pro', 'Je suis rentable, je veux passer à l’échelle']]],
    ['block', 'Qu’est-ce qui te bloque le plus ?', [['start', 'Je ne sais pas par où commencer'], ['method', 'Je n’ai pas de méthode fiable'], ['mind', 'La discipline, la peur, l’impulsivité'], ['time', 'Je n’ai pas le temps de suivre les marchés']]],
    ['goal', 'Ton objectif dans 12 mois ?', [['extra', 'Un complément de revenu régulier'], ['funded', 'Réussir une propfirm et être financé'], ['live', 'Vivre du trading'], ['auto', 'Faire travailler mon capital en automatique', 'Avec BERICH, depuis un VPS']]],
    ['time', 'Combien de temps peux-tu y consacrer chaque semaine ?', [['s', 'Moins de 3 h'], ['m', '3 à 7 h'], ['l', '7 à 15 h'], ['xl', 'Plus de 15 h']]],
    ['frame', 'Es-tu prêt à suivre un cadre ?', [['guided', 'Oui, j’ai besoin d’être guidé', 'Appels, missions, règles de risque'], ['semi', 'Oui, mais je veux garder mon autonomie'], ['solo', 'Je préfère les outils, sans suivi']]],
    ['capital', 'Ton capital de trading aujourd’hui', [['s', 'Moins de 1 000 €'], ['m', '1 000 à 5 000 €'], ['l', '5 000 à 20 000 €'], ['xl', 'Plus de 20 000 €'], ['pf', 'Je passe par des propfirms']]],
    ['budget', 'Pour te former et t’équiper, quel effort est confortable pour toi ?', [['m150', 'Jusqu’à 150 € par mois'], ['m300', 'Jusqu’à 300 € par mois'], ['900', 'Un paiement de 450 à 900 €'], ['1700', 'Jusqu’à 1 700 € en une fois'], ['3000', '3 000 € pour une année complète']]],
  ];
  function audit(i) {
    const [key, title, opts] = Q[i];
    show(`<span class="lp__k">02 — Ton audit · ${i + 1} / ${Q.length}</span>${EDU && !i ? `<p class="lp__lead" style="margin:6px 0 0">Code de <b style="color:#f6f6f7">${esc(EDU)}</b> validé.</p>` : ''}
      <div class="lp__bar"><i style="width:${(i / Q.length) * 100}%"></i></div><h3>${esc(title)}</h3>
      <div class="lp__opts">${opts.map(([v, l, s]) => `<button type="button" class="lp__opt${ANS[key] === v ? ' is-on' : ''}" data-v="${v}"><span>${esc(l)}${s ? `<small>${esc(s)}</small>` : ''}</span></button>`).join('')}</div>
      ${i ? '<button type="button" class="lp__back" data-back>← Question précédente</button>' : ''}`, true);
    box.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => { ANS[key] = b.dataset.v; if (i + 1 < Q.length) audit(i + 1); else result(); }));
    const bk = box.querySelector('[data-back]'); if (bk) bk.addEventListener('click', () => audit(i - 1));
    const f = box.querySelector('.lp__opt'); if (f) f.focus();
  }

  // Budget : ce que le membre peut mettre en une fois (once) ou chaque mois (month)
  const budgetOf = () => ({ m150: [0, 150], m300: [0, 300], 900: [900, 0], 1700: [1700, 0], 3000: [Infinity, 0] }[ANS.budget] || [0, 0]);
  const fits = (o) => { const [once, month] = budgetOf(); return o.price <= once || (o.months === 1 && o.price <= month); };
  // Pack : Premium dès qu'il faut guider (débutant, perdant, besoin de cadre, propfirm / vivre du trading / automatique),
  // si le budget le permet ; sinon Essentiel. Durée : la plus longue que le budget couvre.
  function result() {
    if (!OFFERS || !OFFERS.length) { show('<span class="lp__k">03</span><h3>Un instant…</h3><p class="lp__lead">Les offres se chargent.</p>', true); setTimeout(result, 1200); return; }
    const needGuide = ANS.frame === 'guided' || ['new', 'lose'].includes(ANS.stage) || ['funded', 'live', 'auto'].includes(ANS.goal) || ANS.block === 'mind';
    const of = (g) => OFFERS.filter((o) => o.group === g).sort((a, b) => b.months - a.months);
    const canPrem = of('premium').some(fits);
    const group = (needGuide || ANS.frame !== 'solo') && canPrem ? 'premium' : 'essentiel';
    const list = of(group);
    SEL = (list.find(fits) || list[list.length - 1]).key;
    const GOAL = { extra: 'un complément de revenu régulier', funded: 'réussir une propfirm', live: 'vivre du trading', auto: 'faire travailler ton capital en automatique' };
    const BLOCK = { start: 'savoir par où commencer', method: 'une méthode fiable', mind: 'la discipline et la gestion des émotions', time: 'du temps pour suivre les marchés' };
    WHY = group === 'premium'
      ? `Tu vises <b>${GOAL[ANS.goal] || 'la régularité'}</b> et ce qui te manque, c’est <b>${BLOCK[ANS.block] || 'un cadre'}</b> : Premium t’apporte un éducateur, une méthode, School et BERICH, en plus de toute la plateforme.`
      : `${needGuide ? 'Premium dépasse l’effort que tu juges confortable pour l’instant. ' : ''}Tu veux avancer en autonomie : <b>Essentiel</b> te donne toute la plateforme et ses outils.`;
    paintResult(group);
  }

  // Page du pack (2026-11-12, esprit de la section prix d'OMNI) : à gauche la plateforme, au centre la carte du pack
  // (prix, durées, conditions), à droite les compétences transmises. Tout se met à jour quand on change de durée ou de pack.
  const IC = {
    dash: '<path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 4v4h6V4z"/>',
    journal: '<path d="M6 3.5h10a2 2 0 0 1 2 2v15l-3-2-3 2-3-2-3 2v-15a2 2 0 0 1 2-2zM9 8h6M9 12h6"/>',
    bt: '<path d="M4 19h16M6 15l4-5 3 3 5-7"/><circle cx="18" cy="6" r="1.4"/>',
    scan: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2M11 7.5v7M7.5 11h7"/>',
    macro: '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 9.5h16M8.5 3v4M15.5 3v4M8 13.5h3M8 16.5h6"/>',
    berich: '<path d="M13 3 5 13.5h6L10 21l9-11h-6z"/>',
  };
  const PLATFORM = [
    ['dash', 'Dashboard multi-comptes', 'Tes comptes et tes propfirms reliés, tes objectifs suivis en direct'],
    ['journal', 'Journal automatique', 'Chaque position classée, notée et analysée'],
    ['bt', 'Backtesting et rapports', 'Ton historique rejoué, ton money management calculé'],
    ['scan', 'Les 11 scanners CHEST', 'Signaux et alertes en direct, sur ton téléphone'],
    ['macro', 'Outils macro et calendrier économique', 'Annonces, impact attendu, force des devises'],
    ['berich', 'BERICH, le trading algorithmique', 'L’or tradé pour toi, 24 h / 24, depuis un VPS', true],
  ];
  const SKILLS = [
    ['Trading', 'Lire le marché et exécuter un plan clair'],
    ['Gestion du risque', 'Money management, propfirms, régularité'],
    ['Mindset', 'Discipline, patience, émotions sous contrôle'],
    ['Trading algorithmique', 'Comprendre et automatiser avec BERICH'],
    ['Intelligence artificielle', 'L’IA pour analyser plus vite et mieux'],
    ['Réseaux sociaux', 'Développer et monétiser ta présence'],
    ['Marketing et business', 'Construire une activité autour du trading'],
    ['Accompagnement 1:1', 'Un éducateur, des appels et des missions'],
  ];
  const CK = '<svg viewBox="0 0 24 24"><path d="M5 12.5 10 17 19 7"/></svg>';
  const LOCK = '<svg viewBox="0 0 24 24"><rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>';
  let WHY = '';
  function paintResult(group) {
    const list = OFFERS.filter((o) => o.group === group).sort((a, b) => b.months - a.months);
    const sel = list.find((o) => o.key === SEL) || list[0];
    const recoKey = (list.find(fits) || list[list.length - 1]).key;
    const prem = group === 'premium';
    const base = new Set((OFFERS.find((o) => o.group === group && o.months === 1) || sel).feats.filter((f) => f[0]).map((f) => f[1]));
    const perks = (sel.feats || []).filter((f) => f[0] && !base.has(f[1])).map((f) => f[1]);
    const every = sel.months === 12 ? 'chaque année' : sel.months === 1 ? 'chaque mois' : `tous les ${sel.months} mois`;
    const other = prem ? 'essentiel' : 'premium';
    show(`<span class="lp__k">03 — Ton pack</span>
      <p class="lp__why">${WHY}</p>
      <div class="lp3">
        <section class="lp3__col" aria-label="La plateforme"><span class="lp3__h">La plateforme</span>
          <ul class="lp3__plat">${PLATFORM.map(([ic, t, d, premOnly]) => { const on = !premOnly || prem; return `<li class="${on ? '' : 'is-off'}"><span class="lp3__ic"><svg viewBox="0 0 24 24">${IC[ic]}</svg></span><span><b>${esc(t)}</b><small>${esc(d)}</small></span>${on ? '' : `<em>${LOCK}Premium</em>`}</li>`; }).join('')}</ul>
        </section>
        <article class="lp3__card${prem ? ' is-prem' : ''}">
          <span class="lp3__chip">${sel.key === recoKey ? 'Conseillé pour toi' : fits(sel) ? 'Dans ton budget' : 'Au-delà de ton budget'}</span>
          <h3 class="lp3__name">CHEST <span>${prem ? 'Premium' : 'Essentiel'}</span></h3>
          <p class="lp3__sub">${prem ? 'Toute la plateforme, la formation et l’accompagnement.' : 'Toute la plateforme, en autonomie.'}</p>
          <div class="lp3__price">${eur(sel.price)}</div>
          <p class="lp3__pm">${sel.months > 1 ? `soit ${eur(sel.price / sel.months)} par mois` : 'par mois, sans engagement'}</p>
          <div class="lp3__durs" role="radiogroup" aria-label="Durée">${list.map((o) => `<button type="button" role="radio" aria-checked="${o.key === sel.key}" class="${o.key === sel.key ? 'is-on' : ''}${fits(o) ? ' is-fit' : ''}" data-pick="${o.key}">${dur(o.months)}<small>${eur(o.price)}</small></button>`).join('')}</div>
          ${perks.length ? `<ul class="lp3__perks">${perks.map((t) => `<li>${CK}${esc(t)}</li>`).join('')}</ul>` : ''}
          <div class="lp3__facts"><span><b>${sel.months}</b>mois d’accès</span><span><b>↻</b>Renouvelé ${every}</span><span><b>✕</b>Résiliable à tout moment</span></div>
          <a class="lp3__go" href="/inscription?ref=${encodeURIComponent(CODE)}&offre=${encodeURIComponent(sel.key)}" data-lp-signup>Rejoindre CHEST ${prem ? 'Premium' : 'Essentiel'}</a>
          <button type="button" class="lp3__switch" data-switch="${other}">Voir plutôt ${other === 'premium' ? 'Premium' : 'Essentiel'} →</button>
        </article>
        <section class="lp3__col" aria-label="Les compétences"><span class="lp3__h">Les compétences</span>
          <ol class="lp3__skills">${SKILLS.map(([t, d], i) => `<li class="${prem ? '' : 'is-off'}"><span class="lp3__n">${String(i + 1).padStart(2, '0')}</span><span><b>${esc(t)}</b><small>${esc(d)}</small></span>${prem ? `<i aria-hidden="true">${CK}</i>` : `<em>${LOCK}</em>`}</li>`).join('')}</ol>
          ${prem ? '' : '<p class="lp3__note">La formation et l’accompagnement sont inclus dans Premium.</p>'}
        </section>
      </div>
      <p class="lp3__fine">Paiement sécurisé après l’inscription. Le trading comporte un risque de perte en capital ; CHEST ne garantit aucun gain.</p>`);
    box.querySelector('.lp__win').classList.add('is-wide');
    box.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => { SEL = b.dataset.pick; paintResult(group); }));
    const sw = box.querySelector('[data-switch]');
    if (sw) sw.addEventListener('click', () => { const l2 = OFFERS.filter((o) => o.group === other).sort((a, b) => b.months - a.months); SEL = (l2.find(fits) || l2[l2.length - 1]).key; paintResult(other); });
    const su = box.querySelector('[data-lp-signup]');
    if (su) su.addEventListener('click', () => { try { localStorage.setItem('chest_wanted_offer', sel.key); } catch (e) { /* tant pis */ } });
  }
})();
