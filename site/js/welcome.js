(() => {
  'use strict';
  // CHEST · Page « Welcome » (posée avant le shell, dans le même défilement).
  //
  // La page défile nativement : hero (100vh), Newsletter, puis le shell
  // (le dashboard) qui suit dans le flux. Rien n'est en surimpression, donc
  // le dashboard arrive collé sous la Newsletter, au pixel près, sans retard.
  // Quand le sommet du dashboard atteint le haut de l'écran, on retire le
  // calque et on remet le défilement à 0 dans la même image : visuellement rien
  // ne bouge, mais il n'y a plus rien au-dessus, on ne peut plus remonter.
  //
  // Contrat : sessionStorage `chest_welcome`, #chestWelcome, classe
  // `is-welcome` sur <html>, window.CHESTWelcome.show() / .close().

  const FLAG = 'chest_welcome';
  const root = document.getElementById('chestWelcome');
  if (!root) return;

  const html = document.documentElement;
  const shell = document.getElementById('chestShell');
  const nameEl = document.getElementById('welName');
  const newsBtn = document.getElementById('welNewsBtn');
  const badge = document.getElementById('welBadge');
  const startBtn = document.getElementById('welStart');
  const newsEl = document.getElementById('welNews');
  const sayFx = document.getElementById('welSayFx');
  const saySr = document.getElementById('welSaySr');
  const stars = document.getElementById('welStars');
  const lightCv = document.getElementById('welLight');
  const hero = root.querySelector('.wel__hero');
  const sheet = document.getElementById('welSheet');
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let closed = true;
  let sraf = null;
  let settleTimer = null;
  let touching = false;
  let lastFocus = null;

  // Position du dashboard dans la page = fin de la Newsletter.
  const endY = () => shell.getBoundingClientRect().top + window.scrollY;
  const vh = () => window.innerHeight;
  const scrollTo = (top) => window.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });

  /* ---------- Prénom ---------- */
  function firstName() {
    try {
      const u = window.CHESTAccounts && CHESTAccounts.getUser();
      const n = u && u.firstName ? String(u.firstName).trim() : '';
      return n ? n.charAt(0).toLocaleUpperCase('fr-FR') + n.slice(1) : '';
    } catch (e) { return ''; }
  }

  /* ---------- Compteur de nouveautés ---------- */
  const cards = () => root.querySelectorAll('[data-news-id]');
  function newsCount() {
    const list = cards();
    if (!list.length) return 0;
    let seen = [];
    try { seen = JSON.parse(localStorage.getItem('chest_news_seen') || '[]'); } catch (e) { seen = []; }
    let n = 0;
    list.forEach((c) => { if (seen.indexOf(c.dataset.newsId) === -1) n++; });
    return n;
  }
  function markNewsSeen() {
    const ids = [].map.call(cards(), (c) => c.dataset.newsId);
    if (!ids.length) return;
    try {
      const seen = JSON.parse(localStorage.getItem('chest_news_seen') || '[]');
      ids.forEach((id) => { if (seen.indexOf(id) === -1) seen.push(id); });
      localStorage.setItem('chest_news_seen', JSON.stringify(seen.slice(-40)));
    } catch (e) { /* stockage indisponible : sans conséquence */ }
  }

  /* ---------- La souris : un effet par-dessus, sans jamais bouger le fond ni le logo ---------- */
  function onMove(e) {
    if (closed) return;
    const r = hero.getBoundingClientRect();
    cur.x = e.clientX - r.left; cur.y = e.clientY - r.top;
    if (!cur.on) { cur.on = true; cur.sx = cur.x; cur.sy = cur.y; }
  }

  /* ---------- Défilement ---------- */
  function onScroll() {
    if (closed || sraf) return;
    sraf = requestAnimationFrame(() => {
      sraf = null;
      if (closed) return;
      const end = endY();
      const y = window.scrollY;
      if (y >= end - 1) { finish(); return; }
      startSnow();
      // r = part du dashboard déjà visible (0 = tout juste caché, 1 = plein écran)
      const r = (y - (end - vh())) / vh();
      clearTimeout(settleTimer);
      if (r > 0 && !touching && !sheet.classList.contains('is-open')) settleTimer = setTimeout(settle, 150);
    });
  }
  // Lâché à mi-chemin : au-delà de 25 % le dashboard finit d'arriver, sinon il repart.
  function settle() {
    if (closed || touching) return;
    const end = endY();
    const r = (window.scrollY - (end - vh())) / vh();
    if (r <= 0 || r >= 1) return;
    scrollTo(r > 0.25 ? end : end - vh());
  }

  /* ---------- Sortie : plus rien au-dessus ---------- */
  function finish() {
    if (closed) return;
    closed = true;
    clearTimeout(settleTimer);
    cancelAnimationFrame(loop); loop = 0;
    closeSheet(true);
    markNewsSeen();
    try { sessionStorage.removeItem(FLAG); } catch (e) {}
    // Dans la même image : le calque disparaît et le dashboard prend sa place en haut.
    root.hidden = true;
    html.classList.remove('is-welcome');
    if (shell) shell.removeAttribute('inert');
    window.scrollTo(0, 0);
    window.dispatchEvent(new Event('resize'));
  }

  // Descente directe (cloche, repère, Échap) : même trajet, en douceur.
  function glide() {
    if (closed) return;
    scrollTo(endY());
    setTimeout(() => { if (!closed && window.scrollY >= endY() - 2) finish(); }, 1500);
  }

  /* ---------- Rayons de lumière : un shader qui bouge tout seul ----------
     Des rayons issus d'un foyer hors champ (haut gauche), deux nappes qui glissent en sens contraires,
     une brume magenta, ~80 % de la hauteur puis un fondu noir. Aucune interaction avec la souris. */
  const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const FRAG = [
    'precision highp float;',
    'uniform vec2 uRes;uniform float uTime;',
    'float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}',
    'float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);',
    ' return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y);}',
    'float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*vn(p);p=p*2.03+vec2(17.1,9.2);a*=.5;}return s;}',
    'void main(){',
    ' vec2 uv=gl_FragCoord.xy/uRes;uv.y=1.-uv.y;',
    ' float asp=uRes.x/uRes.y;vec2 p=vec2(uv.x*asp,uv.y);float t=uTime;',
    // brume : de grandes nappes lentes qui se déforment l'une l'autre
    ' float n1=fbm(p*vec2(.85,1.05)+vec2(t*.034,-t*.021));',
    ' float n2=fbm(p*1.6+vec2(-t*.04,t*.028)+n1*.9);',
    // deux bandes de lumière en diagonale, d'inclinaisons différentes ; elles respirent, en opposition de phase
    ' vec2 dir=normalize(vec2(1.,.5+.02*sin(t*.05)));vec2 nrm=vec2(-dir.y,dir.x);',
    ' vec2 c=vec2(-.05+.02*sin(t*.04),-.05+.015*cos(t*.035));',
    ' float q=dot(p-c,nrm)+(n1-.5)*.4;float al=dot(p-c,dir);',
    ' float v1=.55+.9*fbm(vec2(al*1.3-t*.03,q*1.4+t*.02));',
    ' float band=exp(-pow(q/(.32+.015*sin(t*.08)),2.))*exp(-max(al,0.)*.36)*smoothstep(-.7,.15,al)*v1*(.92+.1*sin(t*.09));',
    ' vec2 dir2=normalize(vec2(1.,.95+.08*cos(t*.07)));vec2 nrm2=vec2(-dir2.y,dir2.x);',
    ' vec2 c2=vec2(.62*asp+.08*sin(t*.05),-.2);',
    ' float q2=dot(p-c2,nrm2)+(n2-.5)*.45;float al2=dot(p-c2,dir2);',
    ' float v2=.4+1.0*fbm(vec2(al2*1.1+t*.025,q2*1.2-t*.03));',
    ' float band2=exp(-pow(q2/.4,2.))*exp(-max(al2,0.)*.3)*smoothstep(-.5,.2,al2)*v2*(.7+.5*sin(t*.11+2.));',
    // deux lueurs qui dérivent, apparaissent et s'effacent à tour de rôle : c'est ce qui fait vivre le fond
    ' vec2 g1=vec2(asp*(.5+.38*sin(t*.083)),.24+.14*cos(t*.117));',
    ' vec2 g2=vec2(asp*(.5+.4*cos(t*.061+1.)),.38+.12*sin(t*.097+2.));',
    ' float glow=exp(-dot(p-g1,p-g1)/.11)*(.5+.5*sin(t*.29))+exp(-dot(p-g2,p-g2)/.15)*(.5+.5*sin(t*.23+2.5));',
    // aurore : des rideaux verticaux déformés par une houle lente, qui glissent d'un côté à l'autre
    ' float wav=fbm(vec2(p.x*.85+t*.05,p.y*.7-t*.03))*1.7+sin(p.x*1.25+t*.11+n1*2.2)*.3;',
    ' float cur1=fbm(vec2(p.x*2.1+wav*1.5,p.y*.6+t*.05));',
    ' float cur2=fbm(vec2(p.x*3.4-wav*1.1+7.3,p.y*.7-t*.04));',
    ' float rib=smoothstep(.3,.74,cur1)*.8+smoothstep(.36,.8,cur2)*.5;',
    ' float ah=smoothstep(-.02,.18,uv.y)*(1.-smoothstep(.2,.78,uv.y));',
    ' float aw=1.-.75*exp(-dot(p-vec2(.05,.0),p-vec2(.05,.0))/.3);',   // le coin haut gauche reste calme
    ' float aur=rib*ah*aw*(.62+.38*sin(t*.11+p.x*1.6));',
    // très peu de rayons : juste de quoi donner du volume
    ' vec2 o=vec2(-.15,-.65);vec2 d=p-o;float len=length(d);float a=atan(d.y,d.x);',
    ' float rr=fbm(vec2(a*3.4+t*.045,len*.3-t*.03));',
    ' float ray=smoothstep(.3,.9,rr);',
    // brume plus présente, bandes moins dominantes : le contraste général baisse
    ' float rd=1.-.62*smoothstep(.3,.95,uv.x/asp);',
    ' float inten=band*1.3+band2*.42+(glow*.3+aur*1.25+n2*.34*exp(-len*.3))*rd+ray*.12*exp(-len*.34)*rd;',
    // fondu noir : démarre à ~26 % de la hauteur et descend jusqu'en bas
    ' float mask=1.-smoothstep(.08,.95,uv.y);',
    ' float b=clamp(inten*mask*.58,0.,1.5);',
    ' vec3 deep=vec3(.15,.012,.085),wine=vec3(.37,.05,.225),mag=vec3(.56,.09,.37),rose=vec3(.75,.33,.55),soft=vec3(.83,.53,.68),wht=vec3(.9,.7,.8);',
    ' vec3 c1=mix(deep,wine,smoothstep(.03,.28,b));',
    ' c1=mix(c1,mag,smoothstep(.3,.66,b));',
    ' c1=mix(c1,rose,smoothstep(.58,.92,b));',
    ' c1=mix(c1,soft,smoothstep(.84,1.16,b));',
    ' c1=mix(c1,wht,smoothstep(1.1,1.5,b));',
    ' c1+=vec3(.18,.02,.3)*aur*.5*(1.-uv.x/asp)*mask+vec3(.3,.11,.04)*aur*.16*smoothstep(.5,1.,uv.x/asp)*mask;',
    ' c1*=smoothstep(0.,.16,b);',
    ' c1+=(h21(gl_FragCoord.xy+t)-.5)/255.;',   // grain : évite les bandes
    ' gl_FragColor=vec4(c1,1.);',
    '}'
  ].join('\n');
  let gl = null, uRes = null, uTime = null, lightOK = false, t0 = 0;

  function initLight() {
    if (lightOK || !lightCv) return lightOK;
    try { gl = lightCv.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' }); } catch (e) { gl = null; }
    if (!gl) { hero.classList.add('no-gl'); return false; }
    const mk = (type, src) => { const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh); return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null; };
    const vs = mk(gl.VERTEX_SHADER, VERT), fs = mk(gl.FRAGMENT_SHADER, FRAG);
    const prog = vs && fs && gl.createProgram();
    if (!prog) { gl = null; hero.classList.add('no-gl'); return false; }
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { gl = null; hero.classList.add('no-gl'); return false; }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); // un seul grand triangle
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    uRes = gl.getUniformLocation(prog, 'uRes'); uTime = gl.getUniformLocation(prog, 'uTime');
    lightCv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); gl = null; lightOK = false; hero.classList.add('no-gl'); });
    lightOK = true; t0 = performance.now();
    return true;
  }
  function sizeLight() {
    if (!initLight()) return;
    // demi-résolution : de la lumière douce, étirée par le navigateur, coûte 4 fois moins
    const w = Math.max(2, Math.round(lightCv.clientWidth * 0.5)), h = Math.max(2, Math.round(lightCv.clientHeight * 0.5));
    lightCv.width = w; lightCv.height = h;
    gl.viewport(0, 0, w, h);
  }
  function drawLight(ts) {
    if (!lightOK) return;
    gl.uniform2f(uRes, lightCv.width, lightCv.height);
    gl.uniform1f(uTime, 18 + (ts - t0) / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* ---------- Neige : des flocons qui tombent, et la souris qui les écarte et les allume ---------- */
  // Trois plans de profondeur : petits et vifs au loin, gros et flous au premier plan (effet de flou d'objectif).
  const cur = { x: 0, y: 0, sx: 0, sy: 0, on: false }; // souris (px dans le hero) et sa version lissée
  let flakes = [];
  let sprite = null;
  let cw = 0, ch = 0, dpr = 1;
  let loop = 0, last = 0;

  function makeSprite() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    return c;
  }
  function spawn(f, anywhere) {
    const z = Math.random();                    // 0 = loin, 1 = près
    const near = z > 0.86;                      // quelques gros flocons flous au premier plan
    f.z = z;
    f.r = near ? 5 + Math.random() * 8 : 0.9 + z * 2.4;
    f.a = near ? 0.13 + Math.random() * 0.14 : 0.34 + z * 0.6;
    f.v = near ? 34 + Math.random() * 26 : 12 + z * 34;   // px/s vers le bas
    f.sw = 6 + Math.random() * 16;              // amplitude de la dérive latérale
    f.w = 0.4 + Math.random() * 0.9;            // vitesse de la dérive
    f.p = Math.random() * Math.PI * 2;
    f.x = Math.random() * cw;
    f.y = anywhere ? Math.random() * ch : -12 - Math.random() * 60;
    f.push = 0;
    return f;
  }
  function sizeCanvas() {
    if (!stars) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cw = stars.offsetWidth; ch = stars.offsetHeight;
    stars.width = Math.round(cw * dpr); stars.height = Math.round(ch * dpr);
    const n = Math.min(320, Math.round((cw * ch) / 6200));
    flakes = Array.from({ length: n }, () => spawn({}, true));
    if (!sprite) sprite = makeSprite();
    sizeLight();
  }
  function heroVisible() { return !closed && window.scrollY < window.innerHeight * 1.05 && !document.hidden; }

  function tick(ts) {
    loop = 0;
    if (!heroVisible()) return;
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts;
    drawLight(ts);
    const ctx = stars.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    cur.sx = cur.x; cur.sy = cur.y; // suivi direct, sans inertie

    // halo de lumière sous le curseur
    if (cur.on) {
      ctx.globalCompositeOperation = 'lighter';
      const R = Math.max(220, Math.min(cw, ch) * 0.34);
      const g = ctx.createRadialGradient(cur.sx, cur.sy, 0, cur.sx, cur.sy, R);
      g.addColorStop(0, 'rgba(255,225,240,.30)');
      g.addColorStop(0.18, 'rgba(255,140,205,.22)');
      g.addColorStop(0.55, 'rgba(252,18,131,.08)');
      g.addColorStop(1, 'rgba(252,18,131,0)');
      ctx.fillStyle = g; ctx.fillRect(cur.sx - R, cur.sy - R, R * 2, R * 2);
    }

    ctx.globalCompositeOperation = 'lighter';
    const t = ts / 1000;
    const RM = 130; // rayon d'influence de la souris
    for (let i = 0; i < flakes.length; i++) {
      const f = flakes[i];
      f.y += f.v * dt;
      f.x += Math.cos(t * f.w + f.p) * f.sw * dt;
      let boost = 0;
      if (cur.on) {
        const dx = f.x - cur.sx, dy = f.y - cur.sy, d = Math.hypot(dx, dy);
        if (d < RM && d > 0.01) {
          const k = 1 - d / RM;
          f.x += (dx / d) * k * k * 240 * dt * (0.4 + f.z); // les flocons s'écartent du curseur
          f.y += (dy / d) * k * k * 120 * dt;
          boost = k;                                          // et s'allument à son approche
        }
      }
      if (f.y > ch + 14 || f.x < -30 || f.x > cw + 30) { spawn(f, false); continue; }
      const r = f.r * (1 + boost * 0.5);
      ctx.globalAlpha = Math.min(1, f.a + boost * 0.55);
      ctx.drawImage(sprite, f.x - r, f.y - r, r * 2, r * 2);
    }
    // fondu de tout (halo + flocons) vers le bas du hero : aucune bordure nette, raccord noir avec la Newsletter
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'destination-out';
    const fg = ctx.createLinearGradient(0, ch * 0.5, 0, ch);
    fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(0.55, 'rgba(0,0,0,.7)'); fg.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = fg; ctx.fillRect(0, ch * 0.5, cw, ch * 0.5);
    ctx.globalCompositeOperation = 'source-over';
    loop = requestAnimationFrame(tick);
  }
  function startSnow() {
    if (!stars) return;
    if (reduce) { // sans animation : quelques flocons fixes, c'est tout
      sizeCanvas();
      drawLight(performance.now());
      const ctx = stars.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      flakes.forEach((f) => { ctx.globalAlpha = f.a * 0.8; ctx.drawImage(sprite, f.x - f.r, f.y - f.r, f.r * 2, f.r * 2); });
      return;
    }
    if (!loop && heroVisible()) { last = performance.now(); loop = requestAnimationFrame(tick); }
  }

  /* ---------- CHEST qui parle ----------
     Une phrase choisie selon l'heure et la session de marché en cours (heures en UTC, comme les sessions du reste du site :
     Asie 0-7, Londres 7-12, Londres × New York 12-16, New York 16-21), écrite lettre à lettre comme si l'algo s'adressait à toi.
     Volontairement prudent : « généralement », « souvent » — jamais une prédiction ni une promesse. {name} = prénom (retiré s'il manque). */
  const SAY = {
    asiaOpen: [
      "Tu arrives pile pour l'ouverture de la session asiatique.",
      "Tokyo ouvre ses portes. Je surveille, tu peux respirer.",
      "L'Asie se réveille : les premiers mouvements de la journée se dessinent.",
      "Une nouvelle journée de marché démarre. Je suis prêt quand tu l'es.",
      "Ouverture asiatique : le calme avant l'arrivée de l'Europe.",
      "{name}, la session asiatique s'ouvre. Rien ne presse."
    ],
    mondayOpen: [
      "Nouvelle semaine de marché. On repart de zéro, ensemble.",
      "La semaine commence. Les écarts du week-end sont souvent les premiers à regarder.",
      "Lundi, ouverture de la semaine : un bon moment pour relire ton plan.",
      "Les marchés rouvrent. {name}, commence par ton plan, pas par les graphiques."
    ],
    asia: [
      "L'Asie mène la danse, généralement plus calme : idéal pour préparer la suite.",
      "Le marché est plutôt lent en ce moment : parfait pour travailler ton trading.",
      "Session asiatique en cours. Un bon moment pour relire ton journal.",
      "Pendant que l'Europe dort, je garde un œil sur Tokyo.",
      "Les volumes sont souvent plus faibles en Asie. Profites-en pour revoir tes backtests.",
      "Ambiance tranquille sur les marchés. Ton plan, ton rythme.",
      "{name}, l'Asie est calme : c'est le moment de préparer Londres.",
      "Session asiatique : l'heure où l'on prépare, plutôt que de courir.",
      "Un café, un backtest, et Londres arrive bientôt."
    ],
    londonOpen: [
      "Londres vient d'ouvrir : les premiers vrais mouvements arrivent souvent maintenant.",
      "Ouverture de Londres. Le marché se réveille pour de bon.",
      "Londres est là. Respire, applique ton plan.",
      "L'Europe prend le relais. Pas de précipitation, {name}.",
      "Les volumes montent, la discipline aussi.",
      "Tu arrives pile pour l'ouverture de Londres.",
      "Le ballet européen commence. Je surveille les premières minutes avec toi."
    ],
    london: [
      "Londres est en pleine action. Garde la tête froide.",
      "Session de Londres en cours : souvent l'une des plus actives de la journée.",
      "Le marché a de l'énergie ce matin. Ton plan reste ton meilleur allié.",
      "Londres bat son plein. Un trade propre vaut mieux que dix trades pressés.",
      "{name}, l'Europe est réveillée, et toi aussi. Bonne session.",
      "Beaucoup de mouvement en Europe : reste sur tes setups, pas sur ceux des autres.",
      "Session de Londres : le bon moment pour être patient."
    ],
    nyOpen: [
      "New York ouvre ses portes, et le marché avec.",
      "Wall Street se réveille pendant que Londres bat encore son plein.",
      "Ouverture de New York : ça peut bouger vite. Prends ton souffle.",
      "Tu arrives pile pour l'ouverture de New York.",
      "Les Américains arrivent. Reste sur ton plan, {name}.",
      "Nouvelle vague de volume : New York rejoint la séance."
    ],
    overlap: [
      "Londres et New York sont ouvertes en même temps : souvent le moment le plus animé.",
      "Le chevauchement des deux sessions : de l'énergie, mais aussi des faux départs. Prudence.",
      "Pic d'activité probable. Une position à la fois.",
      "Gros volumes en vue. La discipline avant tout, {name}.",
      "Les deux grandes places sont ouvertes : ça vit fort sur les graphiques.",
      "Le cœur de la journée de trading. Concentre-toi, je m'occupe du reste."
    ],
    ny: [
      "Londres a fermé, New York finit la journée. Le rythme ralentit souvent.",
      "Session américaine : l'après-midi peut rester calme… ou surprendre. Reste attentif.",
      "L'Europe est partie se coucher. Il reste New York.",
      "Le marché commence à ralentir. Pense à faire un bilan de ta journée.",
      "Le jour touche à sa fin. Un petit tour dans ton journal, {name} ?",
      "Fin de journée : le moment idéal pour noter ce que tu as appris."
    ],
    late: [
      "La journée de trading se termine. Bravo si tu as tenu ton plan, ou su t'arrêter.",
      "Les marchés se calment. Ferme aussi tes graphiques.",
      "Dernière heure de la séance américaine. Le repos fait partie du plan.",
      "Bonne soirée {name}. Demain, un nouveau marché t'attend.",
      "Coupe les écrans de trading : tes décisions de demain n'en seront que meilleures."
    ],
    friday: [
      "Dernière ligne droite de la semaine. Certaines propfirms interdisent de garder une position le week-end : vérifie les tiennes.",
      "Vendredi soir : bilan, journal, puis repos.",
      "La semaine se termine. Qu'as-tu appris cette semaine, {name} ?",
      "Le week-end approche : pense à tes positions ouvertes avant la fermeture."
    ],
    weekend: [
      "Les marchés forex et actions sont fermés. Profites-en pour souffler, ou pour préparer la semaine.",
      "Week-end : les graphiques dorment. Ton journal, lui, t'attend.",
      "Rien ne bouge sur le forex : le moment idéal pour un backtest.",
      "Marchés fermés jusqu'à dimanche soir. Un passage par School ne coûte rien.",
      "C'est le week-end, {name}. Fais une pause, tu l'as sans doute méritée.",
      "Pas de nouvelles bougies aujourd'hui. Un bon jour pour revoir les erreurs de la semaine.",
      "Marchés fermés : parfait pour ranger ton journal et lire un cours."
    ],
    night: [
      "Il est tard, {name}. Un trade fatigué reste un trade fatigué.",
      "Les meilleures décisions se prennent reposé. Je serai encore là demain.",
      "Encore debout ? Je veille, mais dors un peu.",
      "Le sommeil est aussi un outil de trader."
    ],
    morning: [
      "Bon matin {name}. Un café, un plan, et c'est parti.",
      "Nouvelle journée, nouvelle page de ton journal.",
      "Le matin, c'est fait pour préparer. Tout est prêt de mon côté."
    ],
    generic: [
      "Tout est prêt : tes comptes, tes backtests, ton journal.",
      "Content de te revoir, {name}. On reprend là où on s'est arrêtés.",
      "Je ne prédis rien, je t'aide à décider. C'est déjà beaucoup.",
      "Un bon trader est d'abord un trader patient.",
      "Aujourd'hui : discipline d'abord, résultats ensuite.",
      "Ici, chaque chiffre est vérifié. Pas de promesses, seulement des simulations honnêtes.",
      "Ton journal est le meilleur des mentors : il ne ment jamais.",
      "Et si tu regardais tes derniers backtests avant d'ouvrir une position ?",
      "Un plan, un risque, un stop. Le reste, c'est du bruit."
    ]
  };

  function sayContext(d) {
    const day = d.getUTCDay(), h = d.getUTCHours();   // 0 = dimanche
    if (day === 6 || (day === 5 && h >= 22) || (day === 0 && h < 22)) return 'weekend';
    if (day === 0) return 'mondayOpen';               // dimanche soir : réouverture
    if (day === 5 && h >= 20) return 'friday';
    if (day === 1 && h < 2) return 'mondayOpen';
    if (h >= 22 || h === 0) return 'asiaOpen';
    if (h < 7) return 'asia';
    if (h === 7) return 'londonOpen';
    if (h < 12) return 'london';
    if (h === 12) return 'nyOpen';
    if (h < 16) return 'overlap';
    if (h < 21) return 'ny';
    return 'late';
  }
  function pickSay() {
    const d = new Date(), lh = d.getHours(), r = Math.random();
    let pool = SAY[sayContext(d)];
    if (lh < 5 && r < 0.35) pool = SAY.night;
    else if (lh >= 5 && lh < 9 && r < 0.25) pool = SAY.morning;
    else if (r < 0.2) pool = SAY.generic;
    let last = -1, lastKey = '';
    try { const v = (localStorage.getItem('chest_wel_say') || '').split('|'); lastKey = v[0]; last = +v[1]; } catch (e) {}
    const key = Object.keys(SAY).find((k) => SAY[k] === pool);
    let i = Math.floor(Math.random() * pool.length);
    if (pool.length > 1 && key === lastKey && i === last) i = (i + 1) % pool.length;   // jamais deux fois la même d'affilée
    try { localStorage.setItem('chest_wel_say', key + '|' + i); } catch (e) {}
    let txt = pool[i];
    const n = firstName();
    txt = n ? txt.replace(/\{name\}/g, n) : txt.replace(/\{name\},\s*/g, '').replace(/,\s*\{name\}/g, '').replace(/\s*\{name\}/g, '');
    txt = txt.replace(/\s+([,.!?])/g, '$1').trim();
    return txt.charAt(0).toLocaleUpperCase('fr-FR') + txt.slice(1);
  }
  let sayTimer = 0;
  function say() {
    if (!sayFx) return;
    clearInterval(sayTimer);
    const txt = pickSay();
    if (saySr) saySr.textContent = txt;
    // mots insécables > lettres : la mise en page est figée d'avance, rien ne bouge pendant l'écriture
    sayFx.innerHTML = '';
    const chars = [];
    txt.split(' ').forEach((w, wi, arr) => {
      const ws = document.createElement('span'); ws.className = 'wel__say-w';
      [...w].forEach((ch) => { const c = document.createElement('span'); c.className = 'wel__say-c'; c.textContent = ch; ws.appendChild(c); chars.push(c); });
      sayFx.appendChild(ws);
      if (wi < arr.length - 1) sayFx.appendChild(document.createTextNode(' '));
    });
    if (reduce) { chars.forEach((c) => c.classList.add('is-on')); return; }
    let i = 0, prev = null;
    setTimeout(() => {
      sayTimer = setInterval(() => {
        if (prev) prev.classList.remove('is-cur');
        if (i >= chars.length) { clearInterval(sayTimer); setTimeout(() => prev && prev.classList.remove('is-cur'), 1400); return; }
        prev = chars[i++]; prev.classList.add('is-on', 'is-cur');
      }, 26);
    }, 1000);
  }

  /* ---------- Fenêtre d'une nouveauté ---------- */
  function openSheet(card) {
    const full = card.querySelector('.wel__card-full');
    const media = card.querySelector('.wel__card-media');
    document.getElementById('welSheetTitle').textContent = (card.querySelector('.wel__card-title') || {}).textContent || '';
    document.getElementById('welSheetTag').textContent = card.dataset.tag || '';
    document.getElementById('welSheetDate').textContent = card.dataset.date || '';
    document.getElementById('welSheetText').innerHTML = full ? full.innerHTML : '';
    const sm = document.getElementById('welSheetMedia');
    const img = media && media.style.getPropertyValue('--img');
    if (img) sm.style.setProperty('--img', img); else sm.style.removeProperty('--img');
    lastFocus = document.activeElement;
    sheet.classList.add('is-open');
    html.classList.add('is-sheet');
    sheet.querySelector('.wel__sheet-win').scrollTop = 0;
    sheet.querySelector('[data-wel-close]').focus({ preventScroll: true });
  }
  function closeSheet(silent) {
    if (!sheet.classList.contains('is-open')) return;
    sheet.classList.remove('is-open');
    html.classList.remove('is-sheet');
    if (!silent && lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  /* ---------- Ouverture ---------- */
  function show() {
    closed = false;
    root.hidden = false;
    html.classList.add('is-welcome');
    if (shell) shell.setAttribute('inert', ''); // le dashboard n'est ni cliquable ni atteignable au clavier tant qu'on n'y est pas

    const n = firstName();
    if (nameEl) nameEl.textContent = n;
    const nb = newsCount();
    if (newsBtn) newsBtn.setAttribute('data-count', String(nb));
    if (badge) badge.textContent = '+' + nb;
    say();

    window.scrollTo(0, 0);
    requestAnimationFrame(() => { sizeCanvas(); startSnow(); });
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  /* ---------- Branchements ---------- */
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('touchstart', () => { touching = true; clearTimeout(settleTimer); }, { passive: true });
  const release = () => { touching = false; if (!closed) settleTimer = setTimeout(settle, 150); };
  window.addEventListener('touchend', release, { passive: true });
  window.addEventListener('touchcancel', release, { passive: true });
  if (hero) hero.addEventListener('mousemove', onMove, { passive: true });
  window.addEventListener('resize', () => { if (!closed) { sizeCanvas(); startSnow(); onScroll(); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) startSnow(); });
  if (hero) hero.addEventListener('mouseleave', () => { cur.on = false; });

  if (startBtn) startBtn.addEventListener('click', glide);
  if (newsBtn) newsBtn.addEventListener('click', () => scrollTo(newsEl.getBoundingClientRect().top + window.scrollY));

  // Une carte s'ouvre au clic (ou Entrée / Espace) dans une fenêtre.
  root.addEventListener('click', (e) => {
    const card = e.target.closest && e.target.closest('.wel__card');
    if (card && root.contains(card)) { openSheet(card); return; }
    if (e.target === sheet || (e.target.closest && e.target.closest('[data-wel-close]'))) closeSheet();
  });
  root.addEventListener('keydown', (e) => {
    const card = e.target.closest && e.target.closest('.wel__card');
    if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openSheet(card); }
  });

  document.addEventListener('keydown', (e) => {
    if (closed || root.hidden) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (sheet.classList.contains('is-open')) closeSheet(); else glide();
    }
  });

  // Clic sur le logo CHEST de la barre du haut : rouvrir le Welcome (le dashboard est dessous).
  document.addEventListener('click', (e) => {
    const brand = e.target.closest && e.target.closest('.chest-topbar .brand');
    if (!brand) return;
    e.preventDefault();
    if (location.hash !== '#/dashboard') location.hash = '#/dashboard';
    show();
  });

  let wanted = false;
  try { wanted = sessionStorage.getItem(FLAG) === '1'; } catch (e) {}
  if (wanted) {
    if (location.hash && location.hash !== '#/dashboard' && location.hash !== '#/') location.hash = '#/dashboard';
    show();
  } else {
    root.hidden = true;
  }

  window.CHESTWelcome = { show, close: finish };
})();
