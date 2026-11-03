// Landing ch3st.app (2026-11-02) : les interactions de la maquette, en JS simple.
// - 7 espaces de l'app (onglets + menu de la fausse fenêtre) : chaque état est un <template id="sol-…">
// - périodes / unités de temps / missions à cocher dans la fausse app
// - FAQ (catégories + questions dépliables), bulles du problème révélées au défilement
// - relief de la carte Premium, horloge du téléphone, fond pixelisé de la fin
(function () {
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SCREENS = { Dashboard: 'dashboard', Backtesting: 'backtesting', Journal: 'journal', 'Stratégies': 'strategies', Calendrier: 'calendar', BERICH: 'berich', School: 'school' };
  const SCREEN_IDS = Object.values(SCREENS);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- 7 espaces ----------
  function showScreen(id) {
    const cur = document.getElementById('solution');
    const tpl = document.getElementById('sol-' + id);
    if (!cur || !tpl) return;
    const next = tpl.content.firstElementChild.cloneNode(true);
    cur.replaceWith(next);
    const tab = next.querySelector('.tab.on');
    if (tab) tab.focus({ preventScroll: true });
    fitDemo();
  }

  // ---------- fenêtre de démonstration : la vraie page CHEST 2.0 (landing-app/*.html) mise à l'échelle ----------
  function fitDemo() {
    document.querySelectorAll('.app-live').forEach((el) => {
      const f = el.querySelector('iframe');
      if (f) f.style.transform = `scale(${el.clientWidth / 1440})`;
    });
  }
  fitDemo();
  window.addEventListener('resize', fitDemo);
  // un clic dans le menu de la page de démonstration change d'espace comme les onglets
  window.addEventListener('message', (e) => {
    if (e.origin === location.origin && e.data && SCREEN_IDS.includes(e.data.chestDemo)) showScreen(e.data.chestDemo);
  });

  function recountMissions(scope) {
    const n = scope.querySelectorAll('.mis.done').length;
    const out = scope.querySelector('[data-mis-count]');
    if (out) out.textContent = n;
    const bar = out && out.closest('div') && out.closest('div').parentElement.querySelector('.prog > i');
    if (bar) bar.style.width = Math.round(n / 6 * 100) + '%';
  }

  document.addEventListener('click', (e) => {
    const nav = e.target.closest('#solution .tab, #solution .sn');
    if (nav) { const id = SCREENS[nav.textContent.trim()]; if (id) showScreen(id); return; }
    const pick = e.target.closest('#solution .rb, #solution .tf');
    if (pick) { const cls = pick.classList.contains('rb') ? 'rb' : 'tf'; pick.parentElement.querySelectorAll('.' + cls).forEach((b) => b.classList.toggle('on', b === pick)); return; }
    const mis = e.target.closest('#solution .mis');
    if (mis) {
      const done = !mis.classList.contains('done');
      mis.classList.toggle('done', done);
      mis.setAttribute('aria-pressed', String(done));
      recountMissions(document.getElementById('solution'));
      return;
    }
    const cat = e.target.closest('.faq .cat');
    if (cat) { renderFaq([...cat.parentElement.querySelectorAll('.cat')].indexOf(cat), 0); return; }
    const q = e.target.closest('.faq .qa > button');
    if (q) {
      const item = q.parentElement, open = !item.classList.contains('open');
      item.parentElement.querySelectorAll('.qa').forEach((x) => { x.classList.remove('open'); x.querySelector('button').setAttribute('aria-expanded', 'false'); });
      item.classList.toggle('open', open);
      q.setAttribute('aria-expanded', String(open));
    }
  });

  // ---------- FAQ ----------
  function renderFaq(ci, openIdx) {
    const FAQ = window.CHEST_FAQ || [];
    const sec = document.querySelector('.faq');
    if (!sec || !FAQ[ci]) return;
    sec.querySelectorAll('.cat').forEach((b, i) => { b.className = i === ci ? 'cat on' : 'cat'; b.setAttribute('aria-selected', String(i === ci)); });
    const list = sec.querySelector('.qa') && sec.querySelector('.qa').parentElement;
    if (!list) return;
    list.innerHTML = FAQ[ci][1].map((it, k) => `
      <div class="${k === openIdx ? 'qa open' : 'qa'}">
        <button type="button" aria-expanded="${k === openIdx}">${esc(it[0])}<span class="pm" aria-hidden="true"></span></button>
        <div class="qa-a"><div><p>${esc(it[1])}</p></div></div>
      </div>`).join('');
  }

  // ---------- Bulles du problème ----------
  // ---------- titres : chaque lettre arrive d'un flou, un peu plus bas, l'une après l'autre ----------
  // (esprit duocase.lol). Les mots restent insécables ; un passage en dégradé (.gt) arrive d'un bloc pour garder son dégradé.
  const splitTitle = (el) => {
    let n = 0;
    const walk = (node) => {
      [...node.childNodes].forEach((c) => {
        if (c.nodeType === 3) {
          const frag = document.createDocumentFragment();
          c.textContent.split(/(\s+)/).forEach((w) => {
            if (!w) return;
            if (/^\s+$/.test(w)) { frag.appendChild(document.createTextNode(w)); return; }
            const word = document.createElement('span'); word.className = 'tw';
            [...w].forEach((ch) => { const s = document.createElement('span'); s.className = 'tc'; s.style.setProperty('--i', n++); s.textContent = ch; word.appendChild(s); });
            frag.appendChild(word);
          });
          c.replaceWith(frag);
        } else if (c.nodeType === 1) {
          if (c.classList.contains('gt') || c.tagName === 'BR') { if (c.tagName !== 'BR') { c.classList.add('tc', 'tc--blk'); c.style.setProperty('--i', n); n += 6; } }
          else walk(c);
        }
      });
    };
    el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    walk(el);
    [...el.querySelectorAll('.tw, .tc--blk')].forEach((x) => x.setAttribute('aria-hidden', 'true'));
    el.classList.add('t-split');
  };
  if (!reduce && 'IntersectionObserver' in window) {
    const titles = [...document.querySelectorAll('.hero .h1, .h2, .end-t')];
    titles.forEach(splitTitle);
    const tio = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('t-in'); tio.unobserve(e.target); } }), { threshold: 0.35 });
    titles.forEach((t) => tio.observe(t));
  }

  // ---------- rubans 01 → 02 : défilent en continu, plus vite quand on fait défiler la page ----------
  const ribbons = [...document.querySelectorAll('.brk-r > div')];
  if (ribbons.length) {
    let last = performance.now(), lastY = window.scrollY, boost = 0;
    const off = ribbons.map(() => 0);
    const run = (t) => {
      const dt = Math.min(64, t - last); last = t;
      const y = window.scrollY, dy = y - lastY; lastY = y;
      boost += (dy * 0.9 - boost) * 0.12; // élan qui retombe doucement
      ribbons.forEach((el, i) => {
        const half = el.scrollWidth / 2, dir = i % 2 ? 1 : -1;
        if (!half) return;
        off[i] = (off[i] + dir * ((reduce ? 0 : 0.045 * dt) + Math.abs(boost) * 0.6)) % half;
        el.style.transform = `translate3d(${(dir < 0 ? off[i] : off[i] - half).toFixed(1)}px, 0, 0)`;
      });
      requestAnimationFrame(run);
    };
    requestAnimationFrame(run);
  }

  // ---------- 02 : la fenêtre de démo arrive inclinée et se redresse en montant vers le centre ----------
  if (!reduce) {
    let raf4 = 0;
    const tilt = () => {
      raf4 = 0;
      const w = document.querySelector('.sol .win'); if (!w) return;
      const r = w.getBoundingClientRect(), vh = window.innerHeight;
      const k = Math.min(1, Math.max(0, (r.top - vh * 0.12) / (vh * 0.75)));
      w.style.setProperty('--wr', k.toFixed(3));
    };
    window.addEventListener('scroll', () => { if (!raf4) raf4 = requestAnimationFrame(tilt); }, { passive: true });
    tilt();
  }

  // ---------- fin de page : « CHEST » en caractères (esprit swashmotion.com) ----------
  // Deux couches en police à chasse fixe : un champ qui ondule, et le mot CHEST qui s'ouvre à mesure qu'on descend.
  const asc = document.querySelector('.asc');
  if (asc) {
    const preF = asc.querySelector('.asc-f'), preM = asc.querySelector('.asc-m');
    const RAMP = ' .:-=+*#%@';
    let cols = 0, rows = 0, mask = null, seed = null, live = false;
    // souris : les caractères proches s'animent et prennent les couleurs de l'aurore du Welcome (calque canvas)
    const preH = asc.querySelector('.asc-h');
    let mx = -1e4, my = -1e4, mcx = -1e4, mcy = -1e4, hover = 0, cw = 6.62;
    asc.addEventListener('pointermove', (e) => {
      const r = asc.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top;
      if (mcx < -1e3) { mcx = mx; mcy = my; }
    });
    asc.addEventListener('pointerleave', () => { mx = my = -1e4; });
    const build = () => {
      const lh = 12; // police 11 px
      // le raccourci CSS contient « / 12px » (interligne), que le canvas refuse : on recompose la police
      const cs = getComputedStyle(preF), font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const mc = document.createElement('canvas').getContext('2d'); mc.font = font;
      cw = mc.measureText('MMMMMMMMMM').width / 10 || 6.62;
      cols = Math.max(40, Math.floor(asc.clientWidth / cw));
      rows = Math.max(16, Math.floor(asc.clientHeight / lh));
      const c = document.createElement('canvas'); c.width = cols; c.height = rows;
      const x = c.getContext('2d');
      x.fillStyle = '#000'; x.fillRect(0, 0, cols, rows);
      x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
      // les caractères sont 2 fois plus hauts que larges : on écrase le mot en hauteur pour garder ses proportions
      x.setTransform(1, 0, 0, 0.55, 0, 0);
      let fs = rows * 1.55; x.font = `700 ${fs}px "Instrument Sans", Arial, sans-serif`;
      const w = x.measureText('CHEST').width; if (w > cols * 0.9) { fs *= (cols * 0.9) / w; x.font = `700 ${fs}px "Instrument Sans", Arial, sans-serif`; }
      x.fillText('CHEST', cols / 2, (rows / 2) / 0.55 + fs * 0.04);
      const d = x.getImageData(0, 0, cols, rows).data;
      mask = new Float32Array(cols * rows); seed = new Float32Array(cols * rows);
      for (let i = 0; i < cols * rows; i++) { mask[i] = d[i * 4] / 255; seed[i] = Math.random(); }
    };
    let open = reduce ? 1 : 0;
    const frame = (t) => {
      if (!live) return;
      // la fenêtre s'ouvre à mesure que l'espace du bas apparaît sous la page
      const g = gap.getBoundingClientRect(), vh = window.innerHeight;
      const target = reduce ? 1 : Math.min(1, Math.max(0, (vh - g.top) / g.height));
      open += (target - open) * 0.08;
      const T = reduce ? 0 : t / 1000;
      // le point suivi glisse vers la souris ; l'effet monte et retombe en douceur
      if (mx > -1e3) { mcx += (mx - mcx) * 0.18; mcy += (my - mcy) * 0.18; hover += (1 - hover) * 0.1; } else hover += (0 - hover) * 0.06;
      const pc = mcx / cw, pr = mcy / 12;
      let f = '', m = '';
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          let v = 0.5 + 0.5 * Math.sin(x * 0.045 + T * 0.9 + Math.sin(y * 0.18 + T * 0.6) * 1.6) * Math.cos(y * 0.07 - T * 0.4);
          if (hover > 0.01) { const dx = (x - pc) / 2.1, dy = y - pr, d2 = dx * dx + dy * dy; v = Math.min(1, v + hover * 0.75 * Math.exp(-d2 / 70) * (0.75 + 0.25 * Math.sin(d2 * 0.08 - T * 6))); }
          f += RAMP[Math.min(9, Math.floor(v * v * 7))];
          // le mot réagit à la souris : effet de loupe qui repousse les lettres, onde, caractères brouillés
          let si = i, near = 0;
          if (hover > 0.01) {
            const ddx = x - pc, ddy = (y - pr) * 2.1, d = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
            near = hover * Math.exp(-(d * d) / 520);
            if (near > 0.01) {
              const push = near * 9 + hover * 1.6 * Math.sin(d * 0.55 - T * 7) * Math.exp(-d / 26);
              const sx = Math.round(x - (ddx / d) * push), sy = Math.round(y - (ddy / d) * push / 2.1);
              si = (sy < 0 || sy >= rows || sx < 0 || sx >= cols) ? -1 : sy * cols + sx;
            }
          }
          const mv = si < 0 ? 0 : mask[si];
          const on = mv > 0.15 && seed[i] < open * 1.15 - 0.1;
          m += on ? (near > 0.25 && Math.random() < near * 0.5 ? RAMP[5 + Math.floor(Math.random() * 5)] : RAMP[Math.min(9, 5 + Math.floor(mv * 3 + v * 1.9))]) : ' ';
        }
        f += '\n'; m += '\n';
      }
      preF.textContent = f; preM.textContent = m;
      // calque aurore : le même champ, coloré aux couleurs de l'aurore du Welcome, visible seulement autour de la souris (masque CSS)
      if (preH) {
        if (hover > 0.02) preH.textContent = f;
        asc.style.setProperty('--mx', mcx.toFixed(0) + 'px'); asc.style.setProperty('--my', mcy.toFixed(0) + 'px');
        asc.style.setProperty('--hv', hover.toFixed(3)); asc.style.setProperty('--ax', (Math.sin(T * 0.4) * 30).toFixed(1) + '%');
      }
      requestAnimationFrame(frame);
    };
    const start = () => { if (!mask) build(); if (!live) { live = true; requestAnimationFrame(frame); } };
    const gap = document.querySelector('.asc-gap');
    if ('IntersectionObserver' in window) new IntersectionObserver((es) => { const on = es[0].isIntersecting; asc.classList.toggle('is-on', on); if (on) start(); else live = false; }).observe(gap);
    else start();
    window.addEventListener('resize', () => { mask = null; if (live) build(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { mask = null; if (live) build(); });
  }

  // ---------- 01 — Le problème : à mi-course de la scène fixe, les bulles passent du rouge au vert ----------
  const pain = document.querySelector('.pain');
  const painBub = pain && pain.querySelector('.bubbles');
  if (pain && painBub) {
    let raf = 0;
    // chaque bulle : une profondeur, une durée de flottement, et 8 particules pour l'éclat (tirées au hasard une fois)
    const bubs = [...painBub.querySelectorAll('.bub')];
    bubs.forEach((b) => {
      b._z = 0.45 + Math.random() * 0.9;
      b.style.setProperty('--fd', (6 + Math.random() * 4).toFixed(1) + 's');
      for (let i = 0; i < 8; i++) {
        const q = document.createElement('i'); q.className = 'bub-p'; q.setAttribute('aria-hidden', 'true');
        const a = (i / 8) * Math.PI * 2 + Math.random() * 0.5, d = 70 + Math.random() * 70;
        q.style.setProperty('--dx', (Math.cos(a) * d * 1.6).toFixed(0) + 'px');
        q.style.setProperty('--dy', (Math.sin(a) * d * 0.7).toFixed(0) + 'px');
        b.appendChild(q);
      }
    });
    // 90 → 10 : le chiffre vert décompte au moment de la bascule
    const n10 = painBub.querySelector('.n10');
    const countDown = () => {
      if (!n10 || reduce) return;
      const t0 = performance.now(), D = 700;
      const step = (t) => {
        const k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - k, 3);
        n10.textContent = Math.round(90 - 80 * e) + ' %';
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const tick = () => {
      raf = 0;
      const r = pain.getBoundingClientRect(), vh = window.innerHeight;
      const run = Math.max(1, r.height - vh);
      // scène fixe : bascule à 45 % de la course ; sans scène fixe (mobile) : quand la section a bien défilé
      const p = r.height > vh * 1.5 ? -r.top / run : (vh * 0.55 - r.top) / r.height;
      const flip = p > 0.45;
      // profondeur : chaque bulle glisse à sa vitesse pendant la scène fixe
      if (!reduce && r.height > vh * 1.5) bubs.forEach((b) => b.style.setProperty('--py', ((0.5 - Math.min(1, Math.max(0, p))) * 140 * b._z).toFixed(1) + 'px'));
      if (flip !== painBub.classList.contains('is-flip')) {
        if (flip) countDown();
        painBub.classList.toggle('is-flip', flip);
        painBub.querySelector('.core-a').setAttribute('aria-hidden', String(flip));
        painBub.querySelector('.core-b').setAttribute('aria-hidden', String(!flip));
      }
    };
    window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(tick); }, { passive: true });
    window.addEventListener('resize', tick);
    tick();
  }
  const bub = document.querySelector('.bubbles');
  if (bub) {
    if (reduce || !('IntersectionObserver' in window)) bub.classList.add('in');
    else {
      const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { bub.classList.add('in'); io.disconnect(); } }, { threshold: 0.2 });
      io.observe(bub);
    }
  }

  // ---------- Relief de la carte Premium ----------
  document.querySelectorAll('.offer.o-prem').forEach((el) => {
    if (reduce) return;
    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      el.classList.add('tilting');
      el.style.setProperty('--rx', ((0.5 - y) * 12).toFixed(2) + 'deg');
      el.style.setProperty('--ry', ((x - 0.5) * 14).toFixed(2) + 'deg');
      el.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
      el.style.setProperty('--my', (y * 100).toFixed(1) + '%');
    });
    el.addEventListener('mouseleave', () => {
      el.classList.remove('tilting');
      ['--rx', '--ry', '--mx', '--my'].forEach((k) => el.style.removeProperty(k));
    });
  });

  // ---------- Horloge du téléphone ----------
  function clock() {
    const now = new Date(), pad = (x) => String(x).padStart(2, '0');
    document.querySelectorAll('[data-ph-time]').forEach((el) => { el.textContent = pad(now.getHours()) + ':' + pad(now.getMinutes()); });
    document.querySelectorAll('[data-ph-date]').forEach((el) => { el.textContent = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); });
  }
  clock();
  setInterval(clock, 20000);

  // ---------- Fond pixelisé de la fin ----------
  const cv = document.querySelector('.end-pix');
  if (cv && cv.getContext) {
    const px = cv.getContext('2d');
    let t = 1.2, last = 0, on = true;
    const size = () => { const r = cv.getBoundingClientRect(); cv.width = Math.max(1, Math.round(r.width)); cv.height = Math.max(1, Math.round(r.height)); };
    const draw = () => {
      const w = cv.width, h = cv.height, s = w < 700 ? 14 : 18, cols = Math.ceil(w / s), rows = Math.ceil(h / s);
      px.clearRect(0, 0, w, h);
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const u = x / cols, v = y / rows;
        const band = Math.sin(u * 5.2 + t * 0.35 + Math.sin(v * 3 + t * 0.2) * 1.4) * 0.5 + 0.5;
        const ridge = Math.exp(-Math.pow((v - (0.42 + 0.16 * Math.sin(u * 3.1 + t * 0.25))) / 0.2, 2));
        const a = band * ridge * (0.25 + 0.75 * Math.sin(u * Math.PI));
        if (a < 0.06) continue;
        const k = u * 0.75 + 0.25 * Math.sin(t * 0.3 + v * 4);
        px.fillStyle = 'rgba(' + ((252 - 3 * k) | 0) + ',' + ((18 + 146 * k) | 0) + ',' + ((131 - 37 * k) | 0) + ',' + (a * 0.85).toFixed(3) + ')';
        px.fillRect(x * s + 1, y * s + 1, s - 3, s - 3);
      }
    };
    size(); draw();
    window.addEventListener('resize', () => { size(); draw(); });
    if ('IntersectionObserver' in window) new IntersectionObserver((es) => { on = !!(es[0] && es[0].isIntersecting); }).observe(cv);
    if (!reduce) {
      const loop = (ts) => {
        if (on && ts - last > 50) { t += Math.min(0.1, (ts - last) / 1000); last = ts; draw(); }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
  }
})();
