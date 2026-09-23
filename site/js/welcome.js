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

  /* ---------- Bento v2 : bandeau SCHOOLE (miniatures vidéo) ----------
     Contenu doublé (×2) pour boucler sans coupure visible (`welMenuScroll` translate à -50%, soit exactement
     un jeu de cartes). Les miniatures viennent des vidéos StepUp déjà listées dans school-data.js (vignette
     YouTube publique par id, aucun appel serveur). Round 1 (statique) : pas encore piloté par l'admin, voir
     CLAUDE.md. */
  const SCHOOL_THUMB_IDS = ['wU8i9-MbdWQ', 'd4sZy3AChZs', '6xjpusd9EMQ', 'iba0283havo', '7AHz5QoXL9U', 'QZxD5aotAAo', 'b9sc84WGlyw', 'LnV_Pz-qejs', 'iTb4oeGqEBs', 'uyyqD2M-71c'];
  function populateMarquees() {
    const schoolTrack = document.getElementById('welSchoolTrack');
    if (schoolTrack) {
      const thumbs = SCHOOL_THUMB_IDS.map((id) => `<span class="wel__school-thumb" style="background-image:url(https://img.youtube.com/vi/${id}/mqdefault.jpg)"></span>`).join('');
      schoolTrack.innerHTML = thumbs + thumbs;
    }
  }
  populateMarquees();

  /* ---------- Bento v2 : MENU — une bannière à la fois, fondu enchaîné (2026-09-22, 3e passe) ----------
     Chaque page du site s'affiche plein cadre quelques secondes, se fond en transparence (`.is-out`), puis la
     suivante prend sa place APRÈS la transition — un seul élément DOM réutilisé et repeint. En pause au survol.
     Design refait le 2026-09-23 (retour utilisateur : « le menu tu m'as mis des visuels nuls, regarde la bannière,
     je veux des visuels de ce style — motion design, avec nos couleurs et nos titres ») : les 3 références envoyées
     (bannières Fiverr/Behance de designers freelance) partagent une grammaire — kicker en pastille, immense titre
     en deux poids (blanc + mot en accent lumineux), badge d'icône flottant légèrement incliné avec halo, fond en
     glow radial + grille fine + vignette. Reproduite ici avec nos propres pages/icônes/couleurs, jamais copiée. */
  const MENU_ITEMS = [
    { ic: 'dashboard', label: 'Dashboard', c1: '#1de9a6', c2: '#0a8f68', kicker: 'Suivi en direct', title: 'Ton edge, <b>en direct</b>.' },
    { ic: 'backtesting', label: 'Backtesting', c1: '#fc1283', c2: '#f9a45e', kicker: 'Avant de risquer', title: 'Teste-le <b>avant</b> d’y croire.' },
    { ic: 'journal', label: 'Journal de trading', c1: '#5470c2', c2: '#2c3d7a', kicker: 'Chaque trade', title: 'Rien n’est <b>oublié</b>.' },
    { ic: 'strategies', label: 'Stratégies', c1: '#a26bff', c2: '#5b2ea6', kicker: 'Des systèmes', title: 'Pas de <b>hasard</b>.' },
    { ic: 'calendar', label: 'Calendrier économique', c1: '#e8b339', c2: '#a97a15', kicker: 'Ce qui bouge', title: 'Le marché <b>expliqué</b>.' },
    { ic: 'berich', label: 'BERICH', c1: '#ff8a3d', c2: '#c24a12', kicker: 'Exécution', title: 'Vite. <b>Bien.</b>' },
    { ic: 'school', label: 'School', c1: '#ff5da2', c2: '#a3216b', kicker: 'Apprends', title: 'L’<b>edge</b>, enseigné.' },
    { ic: 'account', label: 'Compte', c1: '#9aa3b2', c2: '#6b7688', kicker: 'Ton espace', title: '<b>Réglé</b> comme il faut.' },
  ];
  function initMenuSlideshow() {
    const stage = document.getElementById('welMenuStage');
    if (!stage) return;
    const banner = document.createElement('div');
    banner.className = 'wel__menu-banner';
    stage.appendChild(banner);
    let i = 0, timer = null, hovered = false;
    function paint() {
      const it = MENU_ITEMS[i];
      banner.style.setProperty('--c1', it.c1);
      banner.style.setProperty('--c2', it.c2);
      banner.innerHTML = `
        <span class="wel__menu-banner__grid" aria-hidden="true"></span>
        <span class="wel__menu-banner__glow" aria-hidden="true"></span>
        <span class="wel__menu-banner__kicker">${it.kicker}</span>
        <h4 class="wel__menu-banner__title">${it.title}</h4>
        <span class="wel__menu-banner__badge"><i class="chest-ic-${it.ic}"></i></span>`;
    }
    function step() {
      if (hovered) return;
      banner.classList.add('is-out');
      setTimeout(() => {
        if (hovered) { banner.classList.remove('is-out'); return; }
        i = (i + 1) % MENU_ITEMS.length;
        paint();
        // repaint puis on relève is-out au prochain frame pour que la transition d'entrée rejoue à chaque fois
        requestAnimationFrame(() => requestAnimationFrame(() => banner.classList.remove('is-out')));
      }, 500);
    }
    paint();
    timer = setInterval(step, 3200);
    const card = stage.closest('.wel__card--menu');
    if (card) {
      card.addEventListener('mouseenter', () => { hovered = true; });
      card.addEventListener('mouseleave', () => { hovered = false; });
    }
    if (reduce) { clearInterval(timer); }
  }
  initMenuSlideshow();

  /* ---------- Bento v2 : recadrage des photos/éléments DANS leur fenêtre (2026-09-22, correction utilisateur :
     « c'est les photos et éléments dans leur fenêtre que je veux recadrer, pas la disposition ») ----------
     Le 1er jet (redimensionner les cartes dans la grille) répondait à la mauvaise question — la carte elle-même
     ne bouge pas, c'est la PHOTO (Chest Is Here, Scanner) ou le TÉLÉPHONE (Founder) qu'on doit pouvoir glisser à
     l'intérieur du cadre fixe pour choisir ce qui se voit. Bouton « Recadrer » → curseur de déplacement sur les
     3 éléments concernés ; le glisser ajuste `background-position` (photos) ou un décalage `--dx/--dy` en px
     (téléphone, superposé à son centrage). Persisté en localStorage (par navigateur, pas encore le stockage
     admin partagé du futur CMS). Provisoire : accessible à tout le monde en attendant la Vue Admin/Client. */
  function initPhotoReposition() {
    const toggle = document.getElementById('welLayoutToggle');
    const resetBtn = document.getElementById('welLayoutReset');
    if (!toggle) return;
    const KEY = 'chest_wel_bento_crop';
    // Valeurs enregistrées comme défaut le 2026-09-23 (décision utilisateur : « enregistre comme je l'ai mis ») —
    // réglées à la main via le bouton Recadrer, elles remplacent le centrage neutre d'origine pour tout le monde.
    // `founder.s` (zoom) mis à jour le même jour, 2e réglage (« enregistre par défaut la taille et le
    // positionnement que je viens de lui donner »).
    const DEFAULTS = {
      hero: { x: 0, y: 24.39 },
      scanner: { x: 50, y: 62 },
      founder: { dx: 2, dy: 45, s: 1.3 },
    };
    function load() {
      try { return Object.assign({ hero: {}, scanner: {}, founder: {} }, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return { hero: {}, scanner: {}, founder: {} }; }
    }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(crop)); } catch (e) { /* stockage indisponible */ } }
    let crop = load();

    function applyMedia(id, el) {
      const c = Object.assign({}, DEFAULTS[id], crop[id]);
      el.style.backgroundPosition = c.x + '% ' + c.y + '%';
    }
    function applyPhone(el) {
      const c = Object.assign({}, DEFAULTS.founder, crop.founder);
      el.style.setProperty('--dx', c.dx + 'px');
      el.style.setProperty('--dy', c.dy + 'px');
      el.style.setProperty('--zs', c.s);
    }

    const heroMedia = document.querySelector('.wel__card--hero .wel__card-media');
    const scannerMedia = document.querySelector('.wel__card--scanner .wel__card-media');
    const phone = document.querySelector('.wel__founder-phone');
    if (heroMedia) applyMedia('hero', heroMedia);
    if (scannerMedia) applyMedia('scanner', scannerMedia);
    if (phone) applyPhone(phone);

    let active = false;
    function bindMediaDrag(id, el) {
      if (!el) return;
      el.addEventListener('mousedown', (ev) => {
        if (!active) return;
        ev.preventDefault();
        const rect = el.getBoundingClientRect();
        const start = Object.assign({}, DEFAULTS[id], crop[id]);
        const sx = ev.clientX, sy = ev.clientY;
        function onMove(mv) {
          const dxPct = ((mv.clientX - sx) / rect.width) * 100;
          const dyPct = ((mv.clientY - sy) / rect.height) * 100;
          crop[id] = { x: Math.max(0, Math.min(100, start.x - dxPct)), y: Math.max(0, Math.min(100, start.y - dyPct)) };
          applyMedia(id, el);
        }
        function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); save(); }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    }
    function bindPhoneDrag(el) {
      if (!el) return;
      el.addEventListener('mousedown', (ev) => {
        if (!active) return;
        ev.preventDefault();
        const start = Object.assign({}, DEFAULTS.founder, crop.founder);
        const sx = ev.clientX, sy = ev.clientY;
        function onMove(mv) {
          crop.founder = Object.assign({}, crop.founder, { dx: start.dx + (mv.clientX - sx), dy: start.dy + (mv.clientY - sy) });
          applyPhone(el);
        }
        function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); save(); }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
      // Molette = agrandir/réduire le téléphone (demande utilisateur 2026-09-23 : « permets-moi de l'agrandir »),
      // superposé au décalage --dx/--dy sans y toucher. Bornes larges (0,5 à 2,2) mais raisonnables.
      el.addEventListener('wheel', (ev) => {
        if (!active) return;
        ev.preventDefault();
        const cur = Object.assign({}, DEFAULTS.founder, crop.founder);
        const next = Math.max(0.5, Math.min(2.2, cur.s - ev.deltaY * 0.0015));
        crop.founder = Object.assign({}, crop.founder, { s: Math.round(next * 1000) / 1000 });
        applyPhone(el);
        save();
      }, { passive: false });
    }
    bindMediaDrag('hero', heroMedia);
    bindMediaDrag('scanner', scannerMedia);
    bindPhoneDrag(phone);

    toggle.addEventListener('click', () => {
      active = !active;
      toggle.classList.toggle('is-active', active);
      document.body.classList.toggle('wel-is-cropping', active);
      if (resetBtn) resetBtn.hidden = !active;
    });
    if (resetBtn) resetBtn.addEventListener('click', () => {
      crop = { hero: {}, scanner: {}, founder: {} };
      save();
      if (heroMedia) applyMedia('hero', heroMedia);
      if (scannerMedia) applyMedia('scanner', scannerMedia);
      if (phone) applyPhone(phone);
    });
  }
  initPhotoReposition();

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
      // Aucune aimantation : entre la Newsletter et le dashboard on défile librement, dans les deux sens.
      // La page ne se referme (et on ne peut plus remonter) que lorsque le dashboard est entièrement arrivé.
    });
  }

  /* ---------- Sortie : plus rien au-dessus ---------- */
  function finish() {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(loop); loop = 0;
    closeSheet(true);
    markNewsSeen();
    try { sessionStorage.removeItem(FLAG); } catch (e) {}
    // Dans la même image : le calque disparaît et le dashboard prend sa place en haut.
    root.hidden = true;
    // Le dashboard reste verrouillé un court instant de plus (`.wel-lock`) : l'inertie d'un trackpad
    // continue d'envoyer des deltas de molette juste après ce point, et sans ce sursis ils atterrissaient
    // sur le dashboard fraîchement ouvert et le faisaient défiler tout seul (bug signalé par l'utilisateur).
    if (shell) shell.classList.add('wel-lock');
    html.classList.remove('is-welcome');
    window.scrollTo(0, 0);
    window.dispatchEvent(new Event('resize'));
    setTimeout(() => { if (shell) { shell.classList.remove('wel-lock'); shell.removeAttribute('inert'); } }, 380);
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
    // axe de la lueur : descend du coin haut gauche, s'aplatit vers le centre, plonge puis remonte vers la droite (x et y en hauteurs d'écran)
    'float pathY(float x,float t){float xc=max(x,0.);float base=.02+.34*(1.-exp(-1.5*xc));',
    ' float w=.075*sin((xc-.9)*3.-t*.12)*smoothstep(.45,1.,xc)-.14*smoothstep(1.35+.08*sin(t*.05),1.95,xc);return base+w;}',
    'void main(){',
    ' vec2 uv=gl_FragCoord.xy/uRes;uv.y=1.-uv.y;',
    ' float asp=uRes.x/uRes.y;vec2 p=vec2(uv.x*asp,uv.y);float t=uTime;',
    // brume : de grandes nappes lentes qui se déforment l'une l'autre
    ' float n1=fbm(p*vec2(.85,1.05)+vec2(t*.034,-t*.021));',
    ' float n2=fbm(p*1.6+vec2(-t*.04,t*.028)+n1*.9);',
    // la bande claire suit la courbe pathY ; elle s'amincit et s'adoucit en avançant vers la droite
    ' float yc=pathY(p.x,t);float sl=(pathY(p.x+.02,t)-pathY(p.x-.02,t))/.04;',
    ' float q=(p.y-yc)/sqrt(1.+sl*sl)+(n1-.5)*.05;float al=max(p.x,0.);',
    ' float wd=mix(.31,.19,smoothstep(.5,1.4,al));',
    ' float v1=.55+.9*fbm(vec2(al*1.3-t*.03,q*1.4+t*.02));',
    ' float band=(exp(-pow(q/wd,2.))*.8+exp(-pow(q/(wd*.32),2.))*.55)*(.32+.68*exp(-al*.9))*smoothstep(-.1,.2,p.x)*(.75+.35*v1)*(.94+.06*sin(t*.09));',
    // la lumière et les couleurs PARTENT de la bande : elles s'éteignent avec la distance à son axe et le long de sa course
    ' float prox=.28+.72*exp(-abs(q)*1.15)*exp(-al*.14);',
    ' vec2 dir2=normalize(vec2(1.,.95+.08*cos(t*.07)));vec2 nrm2=vec2(-dir2.y,dir2.x);',
    ' vec2 c2=vec2(.62*asp+.08*sin(t*.05),-.2);',
    ' float q2=dot(p-c2,nrm2)+(n2-.5)*.45;float al2=dot(p-c2,dir2);',
    ' float v2=.4+1.0*fbm(vec2(al2*1.1+t*.025,q2*1.2-t*.03));',
    ' float band2=exp(-pow(q2/.4,2.))*exp(-max(al2,0.)*.3)*smoothstep(-.5,.2,al2)*v2*(.7+.5*sin(t*.11+2.));',
    // deux lueurs qui dérivent, apparaissent et s'effacent à tour de rôle : c'est ce qui fait vivre le fond
    ' vec2 g1=vec2(asp*(.5+.38*sin(t*.083)),.24+.14*cos(t*.117));',
    ' vec2 g2=vec2(asp*(.5+.4*cos(t*.061+1.)),.38+.12*sin(t*.097+2.));',
    ' float glow=exp(-dot(p-g1,p-g1)/.11)*(.5+.5*sin(t*.29))+exp(-dot(p-g2,p-g2)/.15)*(.5+.5*sin(t*.23+2.5))*.6;',
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
    // ORANGE : la lueur se réchauffe en avançant le long de son trajet (rose -> pêche -> orange), son bord inférieur est plus chaud,
    // et une des deux lueurs qui dérivent est orange. VIOLET : les zones éloignées de l'axe, à gauche et en haut à droite.
    ' float along=smoothstep(.35+.3*sin(t*.07),1.9,p.x);',
    ' float fringe=smoothstep(-.02,.3,q)*exp(-max(q,0.)*3.2);',
    ' float gw=exp(-dot(p-g2,p-g2)/.2)*(.5+.5*sin(t*.23+2.5));',
    ' float warm=clamp((along*.8+fringe*.75)*exp(-abs(q)*1.8)+gw*.9,0.,1.);',
    ' float vio=smoothstep(.15,.95,1.-prox)*(.45+.55*n1)*(1.-.6*warm);',
    ' float rd=1.-.62*smoothstep(.3,.95,uv.x/asp);',
    ' float inten=band*1.95+band2*.42+(glow*.3+aur*1.65+n2*.34*exp(-len*.3)+ray*.12*exp(-len*.34))*rd*prox;',
    // fondu noir : démarre à ~26 % de la hauteur et descend jusqu'en bas
    ' float mask=pow(1.-smoothstep(-.1,1.,uv.y),1.35);',
    ' float b=clamp(inten*mask*.72,0.,1.5);',
    ' vec3 deep=vec3(.15,.012,.085),wine=vec3(.37,.05,.225),mag=vec3(.56,.09,.37),rose=vec3(.75,.33,.55),soft=vec3(.83,.53,.68),wht=vec3(.9,.7,.8);',
    ' vec3 c1=mix(deep,wine,smoothstep(.03,.28,b));',
    ' c1=mix(c1,mag,smoothstep(.3,.66,b));',
    ' c1=mix(c1,rose,smoothstep(.58,.92,b));',
    ' c1=mix(c1,soft,smoothstep(.84,1.16,b));',
    ' c1=mix(c1,wht,smoothstep(1.1,1.5,b));',
    ' c1+=vec3(.18,.02,.3)*aur*.5*(1.-uv.x/asp)*mask+vec3(.3,.11,.04)*aur*.16*smoothstep(.5,1.,uv.x/asp)*mask;',
    // orange (pêche puis orange franc) et violet, fondus dans la palette : discrets, jamais saturés
    // COUCHER DE SOLEIL : violet à gauche -> rose au centre -> orange puis jaune doré à droite (le centre garde le rose de la marque)
    ' float sunR=smoothstep(.5,.92,uv.x);float vioL=1.-smoothstep(.06,.44,uv.x);',
    // droite : on privilégie le jaune-orange (le rose disparaît sous la teinte) ; gauche : violet franc ; centre : le rose de la marque
    ' vec3 gold=mix(vec3(.44,.2,.04),vec3(.98,.68,.16),smoothstep(.06,.5,b));gold=mix(gold,vec3(1.,.9,.45),smoothstep(.4,1.,b));',
    ' gold=mix(gold,vec3(1.,.94,.6),smoothstep(.8,1.3,b)*sunR);',
    ' c1=mix(c1,gold,clamp(sunR*1.05+warm*smoothstep(.4,.75,uv.x)*.3,0.,1.)*smoothstep(.02,.22,b)*.92);',
    ' vec3 vv=mix(vec3(.2,.04,.36),vec3(.52,.16,.82),smoothstep(.04,.5,b));vv=mix(vv,vec3(.84,.66,.99),smoothstep(.55,1.1,b));',
    ' c1=mix(c1,vv,clamp(vioL*1.05+vio*.3*(1.-sunR),0.,1.)*smoothstep(.02,.22,b)*.92);',
    ' c1*=smoothstep(0.,.16,b);',
    // queue du fondu : un lie-de-vin très sombre qui s'étire jusqu'à ~80 % de la hauteur, pour adoucir la démarcation
    ' c1+=mix(vec3(.1,.008,.056),vec3(.075,.014,.11),smoothstep(.2,.8,n1))*(.55+.45*n2)*smoothstep(.16,.5,uv.y)*(1.-smoothstep(.5,.84,uv.y))*(1.-.5*smoothstep(.4,1.,uv.x/asp));',
    ' c1+=(h21(gl_FragCoord.xy+t)-.5)/255.;',   // grain : évite les bandes
    ' gl_FragColor=vec4(c1,1.);',
    '}'
  ].join('\n');
  let gl = null, uRes = null, uTime = null, lightOK = false, t0 = 0;
  let lightScale = 0.5, dtAvg = 0, dtN = 0;   // résolution du rendu de la lumière, réduite toute seule sur une machine lente

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
    const w = Math.max(2, Math.round(lightCv.clientWidth * lightScale)), h = Math.max(2, Math.round(lightCv.clientHeight * lightScale));
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
  let loop = 0, last = 0, tsPrev = 0;

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
    // qualité adaptative : durée moyenne entre deux images ; au-dessus de 45 ms (< 22 i/s) on baisse la résolution de la lumière,
    // qui est douce : ça ne se voit pas, et l'écriture de la phrase / la souris restent fluides
    const raw = tsPrev ? (ts - tsPrev) / 1000 : 0; tsPrev = ts;
    if (raw > 0 && raw < 1) { dtAvg = dtAvg ? dtAvg * 0.9 + raw * 0.1 : raw; dtN++; }
    if (dtN >= 24 && dtAvg > 0.045 && lightScale > 0.2) { lightScale = Math.max(0.2, lightScale * 0.7); dtAvg = 0; dtN = 0; sizeLight(); }
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
     Chaque phrase est un PRÉTEXTE pour entrer sur la plateforme (dashboard, journal, backtest, calendrier, School) — pas un « tu peux respirer »
     (décision utilisateur). Volontairement prudent : « souvent », « probable » — jamais une prédiction ni une promesse. {name} = prénom (retiré s'il manque). */
  const SAY = {
    asiaOpen: [
      "Tu arrives pile pour l'ouverture de la session asiatique : ouvre ton dashboard et prépare ta journée.",
      "Tokyo ouvre. Le bon moment pour vérifier tes comptes avant que le marché s'agite.",
      "L'Asie se réveille : viens voir où en sont tes comptes.",
      "Une nouvelle journée de marché démarre. Entre, on s'y met ensemble.",
      "Ouverture asiatique : le calme avant Londres, idéal pour préparer ta journée dans le calendrier.",
      "{name}, la session asiatique s'ouvre. Viens jeter un œil au calendrier économique."
    ],
    mondayOpen: [
      "Nouvelle semaine de marché : viens poser ton plan avant que ça bouge.",
      "La semaine commence. Ouvre ton dashboard et fixe tes objectifs.",
      "Lundi : le calendrier de la semaine t'attend. Viens voir ce qui arrive.",
      "Les marchés rouvrent. {name}, entre et commence par ton plan."
    ],
    asia: [
      "En Asie, le marché est souvent plus lent : parfait pour travailler ton trading. Viens lancer un backtest.",
      "Session asiatique : un bon prétexte pour relire ton journal.",
      "Ambiance calme sur les marchés : profites-en pour explorer un cours dans School.",
      "Pendant que l'Europe dort, avance sur tes backtests.",
      "{name}, l'Asie est calme : c'est le moment de préparer Londres. Viens voir le calendrier.",
      "Peu de volume en Asie : idéal pour analyser tes derniers trades. Ton journal t'attend.",
      "Un café, un backtest, et Londres arrive bientôt. Viens t'y mettre.",
      "Session calme : le meilleur moment pour améliorer ta stratégie, sans pression."
    ],
    londonOpen: [
      "Londres vient d'ouvrir : entre et voyons ce qui bouge.",
      "Ouverture de Londres. Viens vérifier tes comptes et le calendrier avant que ça s'active.",
      "Tu arrives pile pour l'ouverture de Londres : ton dashboard est prêt.",
      "L'Europe prend le relais. {name}, ouvre ton dashboard et garde le cap.",
      "Les volumes montent : viens fixer ton plan avant de trader.",
      "Londres démarre : un coup d'œil au calendrier économique, et c'est parti."
    ],
    london: [
      "Londres est en pleine action : viens suivre tes comptes.",
      "Session de Londres en cours, souvent l'une des plus actives. Entre pour ne rien rater.",
      "Le marché a de l'énergie ce matin. Ouvre ton journal et note tes idées.",
      "{name}, l'Europe est réveillée. Viens voir où en sont tes comptes.",
      "Beaucoup de mouvement en Europe : le calendrier te dit pourquoi. Viens y jeter un œil.",
      "Un trade propre vaut mieux que dix trades pressés. Prépare le prochain dans ton journal.",
      "Session de Londres : entre, vérifie ton plan, et avance."
    ],
    nyOpen: [
      "New York ouvre ses portes : entre, le marché s'anime.",
      "Wall Street se réveille pendant que Londres bat encore son plein : viens tout suivre d'ici.",
      "Ouverture de New York : ça peut bouger vite. Ton dashboard est prêt.",
      "Tu arrives pile pour l'ouverture de New York. Viens voir le calendrier américain.",
      "Les Américains arrivent. {name}, ouvre ton dashboard et reste sur ton plan.",
      "Nouvelle vague de volume : viens vérifier tes positions."
    ],
    overlap: [
      "Londres et New York sont ouvertes en même temps : le moment le plus animé. Viens suivre ça de près.",
      "Pic d'activité probable : entre et garde un œil sur tes comptes.",
      "Le cœur de la journée de trading. Ton dashboard t'attend.",
      "Gros volumes en vue. {name}, ouvre ton journal avant de prendre position.",
      "Les deux grandes places sont ouvertes : viens voir ce que ça donne.",
      "C'est maintenant que ça se passe. Ouvre ton dashboard."
    ],
    ny: [
      "Londres a fermé, New York finit la journée : viens faire le point sur tes comptes.",
      "Fin de séance américaine : le bon moment pour noter ta journée dans ton journal.",
      "Le marché ralentit. {name}, viens faire un bilan de ta journée.",
      "Le jour touche à sa fin : un passage dans ton journal, et tu clôtures proprement.",
      "Après la séance, la progression : viens relire tes trades.",
      "Il reste New York. Entre pour suivre la fin de journée."
    ],
    late: [
      "La journée se termine : viens noter ce que tu as appris avant de couper.",
      "Bilan du soir : ouvre ton journal, ça prend cinq minutes.",
      "Dernière heure de la séance américaine. Passe faire le point sur tes comptes.",
      "Bonne soirée {name}. Un dernier tour sur ton dashboard avant de couper ?",
      "Prépare demain dès ce soir : viens regarder le calendrier de la journée à venir."
    ],
    friday: [
      "Vendredi soir : certaines propfirms interdisent de garder une position le week-end. Viens vérifier les tiennes.",
      "Dernière ligne droite de la semaine : ouvre ton journal et fais ton bilan.",
      "La semaine se termine. {name}, viens voir ce que tu en retiens.",
      "Le week-end approche : passe sur ton dashboard vérifier tes positions ouvertes."
    ],
    weekend: [
      "Marchés fermés : le moment idéal pour lancer un backtest tranquillement.",
      "Week-end : les graphiques dorment, pas ta progression. Viens faire un tour dans School.",
      "Rien ne bouge sur le forex : parfait pour relire ton journal.",
      "Marchés fermés jusqu'à dimanche soir. Prépare ta semaine, viens voir le calendrier.",
      "C'est le week-end, {name}. Viens analyser les erreurs de la semaine, sans pression.",
      "Pas de nouvelles bougies aujourd'hui : c'est le bon jour pour améliorer ta stratégie.",
      "Marchés fermés : viens ranger ton journal et lire un cours."
    ],
    night: [
      "Il est tard, {name}. Un petit tour rapide dans ton journal, puis dors.",
      "Encore debout ? Viens jeter un œil à tes comptes, puis repose-toi.",
      "Les meilleures décisions se prennent reposé : note tes idées dans ton journal, et à demain.",
      "Pas de trade fatigué : viens plutôt préparer ceux de demain."
    ],
    morning: [
      "Bon matin {name}. Un café, ton dashboard, et c'est parti.",
      "Nouvelle journée, nouvelle page de ton journal : viens l'ouvrir.",
      "Le matin, c'est fait pour préparer. Viens voir ton calendrier du jour."
    ],
    generic: [
      "Tout est prêt : tes comptes, tes backtests, ton journal. Entre.",
      "Content de te revoir, {name}. On reprend là où on s'est arrêtés ?",
      "Je ne prédis rien, je t'aide à décider. Viens voir par toi-même.",
      "Un bon trader est d'abord régulier. Connecte-toi, même cinq minutes.",
      "Ici, chaque chiffre est vérifié. Viens le constater sur ton dashboard.",
      "Ton journal est le meilleur des mentors. Il t'attend.",
      "Et si tu regardais tes derniers backtests avant d'ouvrir une position ?",
      "Un plan, un risque, un stop. Viens vérifier les tiens.",
      "Cinq minutes sur ton dashboard valent mieux qu'un trade impulsif."
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
    // Cache-flash temporaire posé tout en haut du <head> d'app.html (avant même que le <body> soit analysé) :
    // une fois ici, Welcome a la main, on peut le retirer — le shell (positionné SOUS la Newsletter dans le
    // flux) redevient visible normalement pour le défilement, sans jamais avoir été vu avant ce point.
    html.classList.remove('wel-boot-hide');
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
  if (hero) hero.addEventListener('mousemove', onMove, { passive: true });
  window.addEventListener('resize', () => { if (!closed) { sizeCanvas(); startSnow(); onScroll(); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) startSnow(); });
  if (hero) hero.addEventListener('mouseleave', () => { cur.on = false; });

  if (startBtn) startBtn.addEventListener('click', glide);
  if (newsBtn) newsBtn.addEventListener('click', () => scrollTo(newsEl.getBoundingClientRect().top + window.scrollY));

  // Une carte s'ouvre au clic (ou Entrée / Espace) dans une fenêtre — sauf les 5 vitrines fixes du bento v2
  // (data-no-sheet) : chacune est déjà sa propre vitrine interactive (Founder, Menu, School…), pas une fiche
  // de nouveauté à développer.
  root.addEventListener('click', (e) => {
    const card = e.target.closest && e.target.closest('.wel__card');
    if (card && root.contains(card) && !card.dataset.noSheet) { openSheet(card); return; }
    if (e.target === sheet || (e.target.closest && e.target.closest('[data-wel-close]'))) closeSheet();
  });
  root.addEventListener('keydown', (e) => {
    const card = e.target.closest && e.target.closest('.wel__card');
    if (card && !card.dataset.noSheet && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openSheet(card); }
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
