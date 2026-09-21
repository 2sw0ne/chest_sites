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
  const skipBtn = document.getElementById('welSkip');
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
      root.classList.toggle('is-past', r > 0.06);
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
    root.classList.remove('is-past');
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
    ' float n1=fbm(p*vec2(.85,1.05)+vec2(t*.016,-t*.011));',
    ' float n2=fbm(p*1.6+vec2(-t*.02,t*.014)+n1*.9);',
    // bande de lumière claire, en diagonale depuis le coin haut gauche ; son axe et sa largeur respirent
    ' vec2 dir=normalize(vec2(1.,.5+.06*sin(t*.09)));vec2 nrm=vec2(-dir.y,dir.x);',
    ' vec2 c=vec2(-.05+.05*sin(t*.07),-.05+.04*cos(t*.06));',
    ' float q=dot(p-c,nrm)+(n1-.5)*.4;float al=dot(p-c,dir);',
    ' float band=exp(-pow(q/(.3+.05*sin(t*.13)),2.))*exp(-max(al,0.)*.5)*smoothstep(-.7,.15,al);',
    // très peu de rayons : juste de quoi donner du volume
    ' vec2 o=vec2(-.15,-.65);vec2 d=p-o;float len=length(d);float a=atan(d.y,d.x);',
    ' float rr=fbm(vec2(a*3.4+t*.045,len*.3-t*.03));',
    ' float ray=smoothstep(.3,.9,rr);',
    ' float inten=band*1.3+n2*.5*exp(-len*.46)+ray*.24*exp(-len*.42);',
    // fondu noir sous ~80 % de la hauteur
    ' float mask=1.-smoothstep(.26,.84,uv.y);',
    ' float b=clamp(inten*mask*.78,0.,1.5);',
    ' vec3 deep=vec3(.13,.0,.07),wine=vec3(.42,.03,.22),mauve=vec3(.74,.13,.44),soft=vec3(.93,.58,.76),wht=vec3(1.,.87,.93);',
    ' vec3 c1=mix(deep,wine,smoothstep(.04,.34,b));',
    ' c1=mix(c1,mauve,smoothstep(.3,.7,b));',
    ' c1=mix(c1,soft,smoothstep(.66,1.05,b));',
    ' c1=mix(c1,wht,smoothstep(1.0,1.5,b));',
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
    // la souris est suivie avec un peu de retard : le mouvement de la lumière reste doux
    cur.sx += (cur.x - cur.sx) * Math.min(1, dt * 7);
    cur.sy += (cur.y - cur.sy) * Math.min(1, dt * 7);

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
    ctx.globalAlpha = 1;
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
    root.classList.remove('is-past');
    html.classList.add('is-welcome');
    if (shell) shell.setAttribute('inert', ''); // le dashboard n'est ni cliquable ni atteignable au clavier tant qu'on n'y est pas

    const n = firstName();
    if (nameEl) nameEl.textContent = n;
    if (skipBtn) skipBtn.setAttribute('data-count', String(newsCount()));

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

  if (skipBtn) skipBtn.addEventListener('click', glide);

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
