// Carte pack CHEST (2026-11-12, esprit de la section offre d'OMNI World, en couleurs CHEST).
// Ordinateur : une carte au centre (logo du rang, nom, prix, durée) et derrière elle deux colonnes d'éléments qui
// s'écartent en éventail au survol : à gauche ce que l'offre débloque (barré si non inclus, débarré quand on monte en
// gamme), à droite l'accompagnement. Téléphone / tablette : tout tient dans l'écran, la carte se retourne au toucher
// et son dos liste les deux colonnes en version courte. Chaque élément a sa couleur.
//   CHESTPack.mount(host, { mode: 'teaser' | 'result', offers, sel, reco, fits, onPick(key), onSwitch(group), cta: {href, label, onClick} })
//   → { update(opts) }. En teaser (landing) : prix et éléments floutés, la carte invite à faire l'audit.
// Les deux listes ci-dessous sont l'unique endroit à modifier pour redéfinir les éléments.
(function () {
  const PREM = (o) => o && o.group === 'premium';
  // [icône, titre, titre court (dos de la carte), description, inclus ?, couleur]
  const LEFT = [
    ['dash', 'Dashboard et comptes reliés', 'Dashboard', 'Tes comptes et tes propfirms, tes objectifs en direct', () => true, '#4d8dff'],
    ['journal', 'Journal automatique', 'Journal auto', 'Chaque position classée, notée, analysée', () => true, '#a855f7'],
    ['bt', 'Backtesting et rapports', 'Backtesting', 'Ton historique rejoué, ton money management calculé', () => true, '#2dd4bf'],
    ['scan', 'Les 11 scanners CHEST', '11 scanners', 'Signaux et alertes en direct sur ton téléphone', () => true, '#f5c451'],
    ['macro', 'Calendrier et outils macro', 'Macro', 'Annonces, impact attendu, force des devises', () => true, '#38bdf8'],
    ['school', 'School : cours écrits et vidéo', 'School', 'La méthode CHEST, du premier trade à la régularité', PREM, '#fc1283'],
    ['berich', 'BERICH, trading algorithmique', 'BERICH algo', 'L’or tradé pour toi, 24 h / 24', PREM, '#f9a45e'],
    ['vps', 'VPS offert', 'VPS offert', 'BERICH tourne sans ton ordinateur', (o) => PREM(o) && o.months >= 6, '#33e6a6'],
  ];
  const RIGHT = [
    ['Ton éducateur dédié', 'Éducateur dédié', 'Il te suit, te corrige, te fait avancer', PREM, '#f9a45e'],
    ['Appels de suivi et missions', 'Suivi + missions', 'Un cap clair entre chaque appel', PREM, '#4d8dff'],
    ['IDEA, les opportunités de l’équipe', 'IDEA en direct', 'Entrée, SL et TP partagés en direct', PREM, '#33e6a6'],
    ['Mentorat chaque semaine', 'Mentorat hebdo', 'Un appel de mentorat par semaine', (o) => PREM(o) || (o && o.months === 12), '#a855f7'],
    ['BERICH installé clé en main', 'Clé en main', 'Ton éducateur branche tout pour toi', (o) => PREM(o) && o.months === 12, '#fc1283'],
    ['Mentorat à vie', 'Mentorat à vie', 'Ton accompagnement ne s’arrête pas', (o) => PREM(o) && o.months === 12, '#f5c451'],
  ];
  const IC = {
    dash: '<path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 4v4h6V4z"/>',
    journal: '<path d="M6 3.5h10a2 2 0 0 1 2 2v15l-3-2-3 2-3-2-3 2v-15a2 2 0 0 1 2-2zM9 8h6M9 12h6"/>',
    bt: '<path d="M4 19h16M6 15l4-5 3 3 5-7"/>',
    scan: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2M11 7.5v7M7.5 11h7"/>',
    macro: '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 9.5h16M8.5 3v4M15.5 3v4"/>',
    school: '<path d="M2.5 9 12 4.5 21.5 9 12 13.5z"/><path d="M6.5 11v4.5c0 1.7 2.5 3 5.5 3s5.5-1.3 5.5-3V11"/>',
    berich: '<path d="M13 3 5 13.5h6L10 21l9-11h-6z"/>',
    vps: '<rect x="4" y="4.5" width="16" height="6" rx="2"/><rect x="4" y="13.5" width="16" height="6" rx="2"/><path d="M8 7.5h.01M8 16.5h.01"/>',
  };
  const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>';
  const FLIP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3"/><path d="M18 3v4h-4M6 21v-4h4"/></svg>';
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = (n) => Math.round(n).toLocaleString('fr-FR') + ' €';
  const dur = (m) => (m === 12 ? '1 an' : m + ' mois');
  const ROM = ['', 'I', 'II', 'III', 'IV'];
  const LOGO = {
    premium: '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="pkGp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb36b"/><stop offset="1" stop-color="#fc1283"/></linearGradient></defs><path d="M32 3 57 17.5v29L32 61 7 46.5v-29z" fill="url(#pkGp)"/><path d="M23 25.5h18l6.5 8.5L32 50 16.5 34zM16.5 34h31M27.5 25.5 32 50l4.5-24.5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linejoin="round"/></svg>',
    essentiel: '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="pkGe" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5cffc4"/><stop offset="1" stop-color="#00b377"/></linearGradient></defs><path d="M32 3 57 17.5v29L32 61 7 46.5v-29z" fill="url(#pkGe)"/><path d="M21 33l7.5 7.5L44 25" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    teaser: '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="pkGt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f9a45e"/><stop offset="1" stop-color="#fc1283"/></linearGradient></defs><path d="M32 3 57 17.5v29L32 61 7 46.5v-29z" fill="url(#pkGt)"/><rect x="22" y="30" width="20" height="15" rx="3" fill="none" stroke="#fff" stroke-width="3"/><path d="M26 30v-4a6 6 0 0 1 12 0v4" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>',
  };

  const css = `
.pk{ --cw:min(380px, 86vw); --ch:560px; --sw:320px; --gap:44px; --step:74px; position:relative; isolation:isolate; font-family:'Instrument Sans', system-ui, sans-serif; color:#f6f6f7; }
.pk__aurora{ position:absolute; inset:-10% -20%; z-index:-1; overflow:hidden; pointer-events:none; filter:blur(60px) saturate(1.2); opacity:.9; }
.pk__aurora i{ position:absolute; display:block; border-radius:50%; mix-blend-mode:screen; will-change:transform; }
.pk__aurora i:nth-child(1){ width:70%; height:38%; left:2%; top:18%; background:radial-gradient(closest-side, rgba(252,18,131,.55), transparent); animation:pkA1 18s ease-in-out infinite alternate; }
.pk__aurora i:nth-child(2){ width:60%; height:34%; right:0; top:36%; background:radial-gradient(closest-side, rgba(249,164,94,.45), transparent); animation:pkA2 22s ease-in-out infinite alternate; }
.pk__aurora i:nth-child(3){ width:55%; height:26%; left:24%; top:4%; background:radial-gradient(closest-side, rgba(51,230,166,.28), transparent); animation:pkA3 26s ease-in-out infinite alternate; }
.pk__aurora i:nth-child(4){ width:45%; height:30%; left:30%; bottom:2%; background:radial-gradient(closest-side, rgba(140,80,255,.28), transparent); animation:pkA1 30s ease-in-out infinite alternate-reverse; }
@keyframes pkA1{ to{ transform:translate3d(14%, 8%, 0) rotate(8deg) scale(1.15); } }
@keyframes pkA2{ to{ transform:translate3d(-16%, -10%, 0) rotate(-10deg) scale(1.1); } }
@keyframes pkA3{ to{ transform:translate3d(10%, 14%, 0) scaleX(1.3); } }
.pk__deck{ position:relative; height:calc(var(--ch) + 130px); perspective:1200px; outline:0; }
.pk__side{ display:contents; }
.pk__sat{ position:absolute; top:50%; left:50%; z-index:2; display:flex; align-items:center; gap:12px; width:var(--sw); min-height:60px; padding:10px 14px 10px 10px; border-radius:16px; background:linear-gradient(110deg, rgba(22,20,28,.92), rgba(14,13,18,.9)); box-shadow:inset 3px 0 0 var(--h), inset 0 0 0 1px rgba(255,255,255,.1), 0 10px 30px rgba(0,0,0,.35); backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px);
  opacity:0; transform:translate(-50%, -50%) scale(.72); transition:transform .5s cubic-bezier(.16,1,.3,1), opacity .3s ease-out, box-shadow .3s; pointer-events:none; }
.pk.is-open .pk__sat{ opacity:1; pointer-events:auto; transform:translate(-50%, -50%) translate(var(--x), var(--y)) rotate(var(--r)); transition-delay:calc(var(--o) * 32ms); }
.pk__sat--h{ min-height:0; padding:0 4px; background:none; box-shadow:none; backdrop-filter:none; -webkit-backdrop-filter:none; font-family:'Fragment Mono', ui-monospace, monospace; font-size:10px; letter-spacing:.24em; text-transform:uppercase; color:#9b9ba1; }
.pk__sat:not(.pk__sat--h):hover{ z-index:12; box-shadow:inset 3px 0 0 var(--h), inset 0 0 0 1px color-mix(in srgb, var(--h) 55%, transparent), 0 14px 34px rgba(0,0,0,.45); }
.pk__ic, .pk__n{ flex:none; width:40px; height:40px; border-radius:12px; display:grid; place-items:center; background:color-mix(in srgb, var(--h) 20%, transparent); box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--h) 50%, transparent); transition:background .45s, box-shadow .45s, color .45s; }
.pk__ic svg{ width:19px; height:19px; fill:none; stroke:var(--h); stroke-width:1.9; stroke-linecap:round; stroke-linejoin:round; transition:stroke .45s; }
.pk__n{ font-family:'Fragment Mono', ui-monospace, monospace; font-size:13px; font-weight:600; color:var(--h); }
.pk__sat span{ min-width:0; display:grid; gap:2px; }
.pk__sat b{ position:relative; justify-self:start; font-size:13.5px; font-weight:650; letter-spacing:-.005em; transition:color .45s; }
.pk__sat b::after, .pk__bi b::after{ content:''; position:absolute; left:-2px; right:-2px; top:54%; height:1.5px; border-radius:2px; background:#ff4d5e; transform:scaleX(0); transform-origin:left; transition:transform .5s cubic-bezier(.16,1,.3,1); }
.pk__sat small{ display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; font-size:11.5px; line-height:1.35; color:#9b9ba1; transition:color .45s; }
.pk__sat em{ margin-left:auto; flex:none; color:#5c5c63; }
.pk__sat em svg, .pk__bi em svg{ width:14px; height:14px; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; display:block; }
.is-off .pk__ic, .is-off .pk__n{ background:rgba(255,255,255,.05); box-shadow:inset 0 0 0 1px rgba(255,255,255,.08); color:#5c5c63; }
.is-off .pk__ic svg{ stroke:#5c5c63; }
.pk__sat.is-off{ box-shadow:inset 3px 0 0 rgba(255,255,255,.08), inset 0 0 0 1px rgba(255,255,255,.08), 0 10px 30px rgba(0,0,0,.35); }
.is-off > span > b, .pk__bi.is-off b{ color:#7a7a82; }
.is-off > span > b::after, .pk__bi.is-off b::after{ transform:scaleX(1); }
.pk__sat.is-off small{ color:#5c5c63; }
.is-new{ animation:pkNew 1.2s ease-out; }
@keyframes pkNew{ 0%{ filter:brightness(1.8); } 100%{ filter:none; } }
.pk__main{ position:absolute; top:50%; left:50%; z-index:10; width:var(--cw); height:var(--ch); transform:translate(-50%, -50%); transform-style:preserve-3d; transition:transform .55s cubic-bezier(.16,1,.3,1); cursor:pointer; }
.pk__face{ position:absolute; inset:0; border-radius:30px; overflow:hidden; backface-visibility:hidden; -webkit-backface-visibility:hidden; transform-style:preserve-3d;
  background:radial-gradient(120% 60% at 50% 0%, rgba(252,18,131,.22), transparent 60%), linear-gradient(145deg, #1a1218, #0a0a0d 62%, #1c1210); box-shadow:0 30px 70px rgba(0,0,0,.55), inset 0 0 0 1px rgba(249,164,94,.3); transition:box-shadow .5s; }
.pk__main.is-ess .pk__face{ background:radial-gradient(120% 60% at 50% 0%, rgba(51,230,166,.16), transparent 60%), linear-gradient(145deg, #10171a, #0a0a0d 62%, #0f1714); box-shadow:0 30px 70px rgba(0,0,0,.55), inset 0 0 0 1px rgba(51,230,166,.26); }
.pk__back{ display:none; transform:rotateY(180deg); }
@media (hover:hover) and (min-width:1100px){ .pk.is-open .pk__main{ transform:translate(-50%, -50%) rotateX(6deg) rotateY(-9deg); } .pk.is-open .pk__front{ box-shadow:18px 30px 60px rgba(0,0,0,.55), inset 0 0 0 1px rgba(249,164,94,.5); } }
.pk__glass{ position:absolute; inset:9px; z-index:1; border-radius:22px 76% 22px 22px; background:linear-gradient(150deg, rgba(255,255,255,.1), rgba(255,255,255,.02) 56%, transparent); box-shadow:inset 1px 1px rgba(255,255,255,.16); pointer-events:none; }
.pk__in{ position:relative; z-index:3; display:flex; flex-direction:column; align-items:center; height:100%; padding:38px 22px 0; text-align:center; }
.pk__logo{ width:64px; height:64px; filter:drop-shadow(0 10px 24px rgba(252,18,131,.45)); }
.pk__logo svg{ width:100%; height:100%; display:block; }
.pk__rank{ margin-top:12px; font-family:'Fragment Mono', ui-monospace, monospace; font-size:10px; letter-spacing:.26em; text-transform:uppercase; color:#9b9ba1; }
.pk__name{ margin:6px 0 0; white-space:nowrap; font-size:clamp(30px, 3.2vw, 38px); font-weight:700; letter-spacing:-.04em; line-height:1; text-transform:uppercase; }
.pk__name strong{ background:linear-gradient(90deg,#fc1283,#f9a45e); -webkit-background-clip:text; background-clip:text; color:transparent; }
.pk__main.is-ess .pk__name strong{ background:linear-gradient(90deg,#33e6a6,#5cffc4); -webkit-background-clip:text; background-clip:text; }
.pk__sub{ margin:10px 0 0; max-width:30ch; font-size:13px; line-height:1.5; color:#9b9ba1; }
.pk__price{ margin-top:22px; font-size:clamp(58px, 6vw, 76px); font-weight:700; letter-spacing:-.05em; line-height:1; font-variant-numeric:tabular-nums; background:linear-gradient(180deg,#fff 25%,#ffd9c2 65%,#f9a45e); -webkit-background-clip:text; background-clip:text; color:transparent; transition:filter .4s; }
.pk__pm{ margin-top:6px; font-size:13px; color:#9b9ba1; }
.pk__bonus{ margin-top:14px; padding:7px 16px; border-radius:999px; font-size:11.5px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:#fff; background:linear-gradient(90deg,#fc1283,#f9a45e); box-shadow:0 0 22px rgba(252,18,131,.45); }
.pk__foot{ position:absolute; left:5%; right:5%; bottom:4%; z-index:3; display:grid; grid-template-columns:repeat(3,1fr); padding:12px 6px; border-radius:16px; background:rgba(255,255,255,.05); }
.pk__foot span{ display:grid; justify-items:center; gap:6px; padding:6px 4px; border-radius:11px; text-align:center; transition:transform .45s cubic-bezier(.16,1,.3,1), background-color .3s, box-shadow .3s; }
.pk__foot span + span{ border-left:1px solid rgba(255,255,255,.1); }
@media (hover:hover) and (min-width:1100px){ .pk.is-open .pk__foot span{ background:rgba(252,18,131,.1); transform:translateY(-4px); box-shadow:0 10px 18px rgba(0,0,0,.25), inset 0 0 0 1px rgba(249,164,94,.2); } .pk.is-open .pk__foot span:nth-child(2){ transition-delay:55ms; } .pk.is-open .pk__foot span:nth-child(3){ transition-delay:110ms; } }
.pk__foot b{ width:38px; aspect-ratio:1; border-radius:50%; display:grid; place-items:center; font-size:15px; color:#ffd9c2; box-shadow:inset 0 0 0 2px #fc1283; font-variant-numeric:tabular-nums; }
.pk__foot small{ font-size:10.5px; line-height:1.25; color:#9b9ba1; }
.pk__flip{ display:none; }
.pk__hint{ position:absolute; left:50%; bottom:-2px; transform:translateX(-50%); font-size:12px; color:#5c5c63; white-space:nowrap; transition:opacity .3s; }
.pk.is-open .pk__hint{ opacity:0; }
.pk__below{ position:relative; z-index:20; display:grid; justify-items:center; gap:12px; margin-top:6px; }
.pk__cta{ display:inline-flex; align-items:center; justify-content:center; gap:10px; width:min(380px, 100%); height:56px; padding:0 28px; border:0; border-radius:16px; font:inherit; font-size:16px; font-weight:700; color:#fff; text-decoration:none; background:linear-gradient(90deg,#fc1283,#f9a45e); box-shadow:0 14px 36px rgba(252,18,131,.35); cursor:pointer; transition:transform .16s ease-out, box-shadow .2s; }
.pk__cta:hover{ box-shadow:0 16px 44px rgba(252,18,131,.5); }
.pk__cta:active{ transform:scale(.98); }
.pk__cta svg{ width:18px; height:18px; fill:none; stroke:currentColor; stroke-width:2.2; stroke-linecap:round; stroke-linejoin:round; }
.pk__up{ display:flex; align-items:center; gap:10px; width:min(380px, 100%); padding:10px 12px; border:0; border-radius:14px; text-align:left; font:inherit; color:#f6f6f7; background:linear-gradient(110deg, rgba(249,164,94,.14), rgba(252,18,131,.08)); box-shadow:inset 0 0 0 1px rgba(249,164,94,.35); cursor:pointer; transition:transform .16s ease-out; }
.pk__up:active{ transform:scale(.98); }
.pk__up i{ flex:none; width:30px; height:30px; display:grid; place-items:center; border-radius:9px; font-style:normal; font-weight:800; font-size:12px; color:#fff; background:linear-gradient(135deg,#fc1283,#f9a45e); }
.pk__up span{ display:grid; gap:1px; font-size:12.5px; line-height:1.35; }
.pk__up span b{ font-size:13px; }
.pk__up span small{ color:#c9c9cf; }
.pk__others{ display:flex; flex-wrap:wrap; justify-content:center; gap:6px; }
.pk__others > span{ width:100%; text-align:center; font-size:10.5px; color:#5c5c63; font-family:'Fragment Mono', ui-monospace, monospace; letter-spacing:.18em; text-transform:uppercase; }
.pk__others button{ position:relative; padding:7px 12px; border:0; border-radius:999px; font:inherit; font-size:12px; color:#9b9ba1; background:rgba(255,255,255,.05); box-shadow:inset 0 0 0 1px rgba(255,255,255,.1); cursor:pointer; transition:color .2s, box-shadow .2s, transform .16s ease-out; font-variant-numeric:tabular-nums; }
.pk__others button:hover{ color:#f6f6f7; box-shadow:inset 0 0 0 1px rgba(252,18,131,.5); }
.pk__others button:active{ transform:scale(.96); }
.pk__others button.is-on{ color:#fff; background:rgba(252,18,131,.16); box-shadow:inset 0 0 0 1.5px rgba(252,18,131,.7); }
.pk__others button.is-top::before{ content:'Le plus complet'; position:absolute; top:-9px; left:50%; transform:translateX(-50%); padding:1px 7px; border-radius:999px; font-size:9px; font-weight:700; letter-spacing:.04em; white-space:nowrap; color:#fff; background:linear-gradient(90deg,#fc1283,#f9a45e); }
.pk__others button i{ font-style:normal; color:#33e6a6; margin-left:4px; }
.pk__switch{ border:0; background:none; font:inherit; font-size:13px; color:#9b9ba1; cursor:pointer; }
.pk__switch:hover{ color:#f6f6f7; }
.pk[data-mode="teaser"] .pk__price{ filter:blur(14px); user-select:none; }
.pk[data-mode="teaser"] .pk__sat b, .pk[data-mode="teaser"] .pk__sat small, .pk[data-mode="teaser"] .pk__bi b{ filter:blur(4px); user-select:none; }
.pk[data-mode="teaser"] .pk__main{ animation:pkFloat 6s ease-in-out infinite; }
@keyframes pkFloat{ 50%{ margin-top:-8px; } }
/* Dos de la carte (téléphone, tablette) : les deux colonnes en version courte */
.pk__bk{ position:relative; z-index:3; display:grid; grid-template-rows:auto 1fr auto; gap:8px; height:100%; padding:16px 14px 12px; }
.pk__bk h4{ margin:0; text-align:center; font-size:15px; letter-spacing:-.02em; }
.pk__bk h4 small{ display:block; margin-top:3px; font-size:11px; font-weight:500; color:#9b9ba1; }
.pk__cols{ display:grid; grid-template-columns:1fr 1fr; gap:12px; min-height:0; }
.pk__col{ display:grid; align-content:start; gap:4px; min-width:0; }
.pk__col > span{ margin-bottom:2px; font-family:'Fragment Mono', ui-monospace, monospace; font-size:8.5px; letter-spacing:.18em; text-transform:uppercase; color:#9b9ba1; }
.pk__bi{ display:flex; align-items:center; gap:7px; min-width:0; min-height:25px; padding:4px 6px 4px 4px; border-radius:9px; background:rgba(255,255,255,.04); box-shadow:inset 2px 0 0 var(--h); }
.pk__bi .pk__ic, .pk__bi .pk__n{ width:22px; height:22px; border-radius:7px; font-size:10px; }
.pk__bi .pk__ic svg{ width:13px; height:13px; }
.pk__bi b{ position:relative; flex:0 1 auto; min-width:0; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; font-size:11.5px; font-weight:650; line-height:1.2; }
.pk__bi em{ flex:none; margin-left:auto; color:#5c5c63; }
.pk__bi em svg{ width:11px; height:11px; }
.pk__bi.is-off{ box-shadow:inset 2px 0 0 rgba(255,255,255,.1); }
.pk__bk .pk__flip{ display:flex; }
@media (max-width:1099px), (hover:none){
  .pk{ --cw:min(340px, 88vw); --ch:clamp(350px, calc(100dvh - 330px), 500px); }
  .pk__front{ display:flex; flex-direction:column; }
  .pk__front .pk__in{ flex:1; height:auto; min-height:0; justify-content:center; padding:14px 18px 6px; }
  .pk__front .pk__sub{ display:none; }
  .pk__front .pk__foot{ position:relative; left:auto; right:auto; bottom:auto; margin:0 12px 38px; }
  .pk__aurora{ display:none; }
  .pk__deck{ height:auto; display:grid; justify-items:center; perspective:1400px; }
  .pk__side{ display:none; }
  .pk__main{ position:relative; top:auto; left:auto; transform:none; }
  .pk.is-open .pk__main{ transform:rotateY(180deg); }
  .pk__back{ display:block; }
  .pk__glass{ border-radius:20px 70% 20px 20px; }
  .pk__logo{ width:40px; height:40px; }
  .pk__rank{ margin-top:6px; }
  .pk__name{ font-size:28px; }
  .pk__sub{ margin-top:6px; font-size:12px; }
  .pk__price{ margin-top:10px; font-size:50px; }
  .pk__pm{ margin-top:4px; font-size:12px; }
  .pk__bonus{ margin-top:8px; padding:5px 12px; font-size:10px; }
  .pk__foot{ padding:7px 4px; }
  .pk__foot b{ width:28px; font-size:12.5px; }
  .pk__foot small{ font-size:9.5px; }
  .pk__flip{ position:absolute; left:0; right:0; bottom:12px; z-index:4; display:flex; align-items:center; justify-content:center; gap:6px; font-size:11.5px; font-weight:600; color:#ffd9c2; }
  .pk__flip svg{ width:14px; height:14px; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; animation:pkSpin 3.2s cubic-bezier(.16,1,.3,1) infinite; }
  @keyframes pkSpin{ 0%, 70%{ transform:none; } 100%{ transform:rotate(360deg); } }
  .pk__bk .pk__flip{ position:static; }
  .pk__hint{ display:none; }
  .pk__below{ gap:10px; margin-top:14px; }
  .pk__cta{ height:52px; font-size:15px; }
  .pk__others{ flex-wrap:nowrap; justify-content:flex-start; max-width:100%; overflow-x:auto; padding:10px 2px 2px; scrollbar-width:none; }
  .pk__others::-webkit-scrollbar{ display:none; }
  .pk__others > span{ display:none; }
  .pk__others button{ flex:none; }
  .pk[data-mode="teaser"] .pk__main{ animation:none; }
}
@media (prefers-reduced-motion: reduce){ .pk__aurora i, .pk[data-mode="teaser"] .pk__main, .pk__flip svg{ animation:none; } .pk__sat, .pk__main{ transition-duration:.01s; } }`;
  let styled = false;
  function style() { if (styled) return; styled = true; const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); }

  function mount(host, opts) {
    style();
    let O = Object.assign({}, opts);
    const root = document.createElement('div');
    root.className = 'pk'; root.dataset.mode = O.mode || 'result';
    const nL = LEFT.length, nR = RIGHT.length, N = Math.max(nL, nR);
    const X = (side) => `calc(${side} * (var(--cw) / 2 + var(--gap) + var(--sw) / 2))`;
    const pos = (i, side, h) => { const c = i - (N - 1) / 2; return `--x:${X(side)};--y:calc(${c} * var(--step) + 22px);--r:${(side * c * -0.55).toFixed(2)}deg;--o:${i};--h:${h}`; };
    const head = (t, side) => `<div class="pk__sat pk__sat--h" style="--x:${X(side)};--y:calc(${-(N + 1) / 2} * var(--step) + 36px);--r:0deg;--o:0;--h:transparent">${t}</div>`;
    root.innerHTML = `<div class="pk__aurora" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <div class="pk__deck" tabindex="0" aria-expanded="false">
        <div class="pk__side pk__side--l">${head('Ce que tu débloques', -1)}${LEFT.map(([ic, t, , d, , h], i) => `<article class="pk__sat" data-l="${i}" style="${pos(i, -1, h)}"><i class="pk__ic"><svg viewBox="0 0 24 24">${IC[ic]}</svg></i><span><b>${esc(t)}</b><small>${esc(d)}</small></span><em></em></article>`).join('')}</div>
        <article class="pk__main" aria-live="polite"></article>
        <div class="pk__side pk__side--r">${head('Ton accompagnement', 1)}${RIGHT.map(([t, , d, , h], i) => `<article class="pk__sat" data-r="${i}" style="${pos(i, 1, h)}"><i class="pk__n">${String(i + 1).padStart(2, '0')}</i><span><b>${esc(t)}</b><small>${esc(d)}</small></span><em></em></article>`).join('')}</div>
        <p class="pk__hint">Passe ta souris sur la carte</p>
      </div>
      <div class="pk__below"></div>`;
    host.appendChild(root);
    const deck = root.querySelector('.pk__deck'), main = root.querySelector('.pk__main'), below = root.querySelector('.pk__below');
    const hover = matchMedia('(hover: hover) and (min-width: 1100px)');
    let closeT = 0;
    const setOpen = (v) => { root.classList.toggle('is-open', v); deck.setAttribute('aria-expanded', String(v)); };
    root.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && hover.matches) { clearTimeout(closeT); setOpen(true); } });
    root.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && hover.matches) closeT = setTimeout(() => setOpen(false), 350); });
    deck.addEventListener('focusin', () => { if (hover.matches && deck.matches(':focus-visible')) setOpen(true); });
    deck.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !hover.matches) { e.preventDefault(); setOpen(!root.classList.contains('is-open')); } });
    main.addEventListener('click', () => { if (O.mode === 'teaser' && O.cta && O.cta.onClick) return O.cta.onClick(); if (!hover.matches) setOpen(!root.classList.contains('is-open')); });

    let prevOn = null;
    function paint() {
      const teaser = O.mode === 'teaser';
      const sel = teaser ? null : (O.offers || []).find((o) => o.key === O.sel);
      const prem = teaser || PREM(sel);
      const inL = LEFT.map((x) => teaser || !!x[4](sel)), inR = RIGHT.map((x) => teaser || !!x[3](sel));
      // éléments : inclus / barrés ; ceux qui viennent d'être débloqués s'allument une fois
      const on = new Set();
      root.querySelectorAll('[data-l]').forEach((el) => { const i = +el.dataset.l; el.classList.toggle('is-off', !inL[i]); el.querySelector('em').innerHTML = inL[i] ? '' : LOCK; if (inL[i]) on.add('l' + i); });
      root.querySelectorAll('[data-r]').forEach((el) => { const i = +el.dataset.r; el.classList.toggle('is-off', !inR[i]); el.querySelector('em').innerHTML = inR[i] ? '' : LOCK; if (inR[i]) on.add('r' + i); });
      if (prevOn) root.querySelectorAll('[data-l],[data-r]').forEach((el) => { const k = el.dataset.l != null ? 'l' + el.dataset.l : 'r' + el.dataset.r; if (on.has(k) && !prevOn.has(k)) { el.classList.remove('is-new'); void el.offsetWidth; el.classList.add('is-new'); } });
      main.classList.toggle('is-ess', !prem);
      const flip = (t) => `<span class="pk__flip">${FLIP}${t}</span>`;
      let front = '';
      if (teaser) {
        front = `<div class="pk__glass"></div><div class="pk__in"><div class="pk__logo">${LOGO.teaser}</div><span class="pk__rank">Accès sur invitation</span>
          <h3 class="pk__name">Ton <strong>pack</strong></h3><p class="pk__sub">Quelques questions pour trouver l’offre qui te correspond vraiment.</p>
          <div class="pk__price" aria-hidden="true">1 700 €</div><p class="pk__pm">Prix débloqué par le code de ton référent</p>
          <span class="pk__bonus">Fais ton audit</span></div>
          <div class="pk__foot"><span><b>6</b><small>questions</small></span><span><b>2’</b><small>minutes</small></span><span><b><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 17.5h2"/></svg></b><small>sur ton téléphone</small></span></div>`;
      } else if (sel) {
        const every = sel.months === 12 ? 'chaque année' : sel.months === 1 ? 'chaque mois' : `tous les ${sel.months} mois`;
        const perk = (sel.feats || []).map((f) => f[1]).find((t) => /VPS offert|à vie/i.test(t));
        front = `<div class="pk__glass"></div><div class="pk__in"><div class="pk__logo">${prem ? LOGO.premium : LOGO.essentiel}</div><span class="pk__rank">Rang ${ROM[sel.level] || ''} · ${dur(sel.months)}</span>
          <h3 class="pk__name">CHEST <strong>${prem ? 'Premium' : 'Essentiel'}</strong></h3><p class="pk__sub">${prem ? 'Toute la plateforme, la formation et l’accompagnement.' : 'Toute la plateforme, en autonomie.'}</p>
          <div class="pk__price">${eur(sel.price)}</div><p class="pk__pm">${sel.months > 1 ? `soit ${eur(sel.price / sel.months)} par mois` : 'par mois, sans engagement'}</p>
          ${O.reco === sel.key ? '<span class="pk__bonus">Conseillé pour toi</span>' : perk ? `<span class="pk__bonus">${esc(perk)}</span>` : ''}</div>
          <div class="pk__foot"><span><b>${sel.months}</b><small>mois d’accès</small></span><span><b>↻</b><small>renouvelé ${every}</small></span><span><b>✕</b><small>résiliable à tout moment</small></span></div>`;
      }
      const bi = (h, ico, t, ok) => `<div class="pk__bi${ok ? '' : ' is-off'}" style="--h:${h}">${ico}<b>${esc(t)}</b><em>${ok ? '' : LOCK}</em></div>`;
      const back = `<div class="pk__bk"><h4>${teaser ? 'Ton pack CHEST' : `CHEST ${prem ? 'Premium' : 'Essentiel'} ${ROM[sel.level] || ''}`}</h4>
        <div class="pk__cols"><div class="pk__col"><span>Tu débloques</span>${LEFT.map(([ic, , s, , , h], i) => bi(h, `<i class="pk__ic"><svg viewBox="0 0 24 24">${IC[ic]}</svg></i>`, s, inL[i])).join('')}</div>
          <div class="pk__col"><span>Accompagnement</span>${RIGHT.map(([, s, , , h], i) => bi(h, `<i class="pk__n">${String(i + 1).padStart(2, '0')}</i>`, s, inR[i])).join('')}</div></div>
        ${flip('Retourner la carte')}</div>`;
      main.innerHTML = `<div class="pk__face pk__front">${front}${flip('Touche pour voir ce qui est inclus')}</div><div class="pk__face pk__back">${back}</div>`;
      prevOn = on;
      // sous la carte : action, ce que l'offre la plus complète ajoute, autres durées du même pack, passage à Premium
      const list = teaser ? [] : (O.offers || []).filter((o) => o.group === sel.group).sort((a, b) => b.price - a.price);
      const top = list[0];
      let up = '';
      if (top && sel && top.key !== sel.key) {
        const plus = LEFT.filter((x) => x[4](top) && !x[4](sel)).map((x) => x[2]).concat(RIGHT.filter((x) => x[3](top) && !x[3](sel)).map((x) => x[1]));
        up = `<button type="button" class="pk__up" data-pick="${top.key}"><i>${ROM[top.level]}</i><span><b>Avec ${prem ? 'Premium' : 'Essentiel'} ${ROM[top.level]} · ${dur(top.months)}</b><small>${plus.length ? 'En plus : ' + esc(plus.join(', ')) : 'Le parcours le plus long, pour aller au bout'}</small></span></button>`;
      }
      below.innerHTML = `${O.cta ? (O.cta.href ? `<a class="pk__cta" href="${esc(O.cta.href)}" data-pk-cta>${esc(O.cta.label)}<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>` : `<button type="button" class="pk__cta" data-pk-cta>${esc(O.cta.label)}<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>`) : ''}
        ${up}
        ${list.length > 1 ? `<div class="pk__others"><span>Autres durées</span>${list.map((o) => `<button type="button" data-pick="${o.key}" class="${o.key === sel.key ? 'is-on' : ''}${o.key === top.key ? ' is-top' : ''}">${ROM[o.level]} · ${dur(o.months)} · ${eur(o.price)}${O.fits && O.fits(o) ? '<i>●</i>' : ''}</button>`).join('')}</div>` : ''}
        ${!teaser && !prem && O.onSwitch ? '<button type="button" class="pk__switch" data-pk-switch>Voir CHEST Premium, avec l’accompagnement →</button>' : ''}`;
      below.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => { if (O.onPick) O.onPick(b.dataset.pick); }));
      const sw = below.querySelector('[data-pk-switch]'); if (sw) sw.addEventListener('click', () => O.onSwitch('premium'));
      const ct = below.querySelector('[data-pk-cta]'); if (ct && O.cta.onClick) ct.addEventListener('click', (e) => O.cta.onClick(e));
    }
    paint();
    return { update(o) { O = Object.assign(O, o); paint(); }, open: setOpen, root };
  }
  window.CHESTPack = { mount, LEFT, RIGHT };
})();
