// Landing ch3st.app (2026-11-02) : les interactions de la maquette, en JS simple.
// - 7 espaces de l'app (onglets + menu de la fausse fenêtre) : chaque état est un <template id="sol-…">
// - périodes / unités de temps / missions à cocher dans la fausse app
// - FAQ (catégories + questions dépliables), bulles du problème révélées au défilement
// - relief de la carte Premium, horloge du téléphone, fond pixelisé de la fin
(function () {
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SCREENS = { Dashboard: 'dashboard', Backtesting: 'backtesting', Journal: 'journal', 'Stratégies': 'strategies', Calendrier: 'calendar', BERICH: 'berich', School: 'school' };
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
  }

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
