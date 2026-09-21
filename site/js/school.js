// CHEST · School — cours (onglets, sommaire, checklist VVS), calculette de risque et bibliothèque de vidéos.
// Tout est local : l'état (cours ouvert, cases cochées, vidéos ajoutées) vit dans le localStorage du navigateur.
(() => {
  'use strict';

  const TAB_KEY = 'chest_school_tab';
  const CHECK_KEY = 'chest_school_vvs_check';
  const VIDEOS_KEY = 'chest_school_videos';

  const store = {
    get(k, fallback) { try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* tant pis */ } },
  };
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z"/></svg>';

  // ---------- Vidéos : lecteur léger ----------
  function parseVideo(url) {
    const u = String(url || '').trim();
    let m = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/i);
    if (m) return { kind: 'yt', id: m[1], url: u };
    m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
    if (m) return { kind: 'vimeo', id: m[1], url: u };
    if (/^https?:\/\//i.test(u)) return { kind: 'ext', url: u };
    return null;
  }
  function embedSrc(v) {
    if (v.kind === 'yt') return `https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0`;
    if (v.kind === 'vimeo') return `https://player.vimeo.com/video/${v.id}?autoplay=1`;
    return null;
  }
  function thumbOf(v) { return v.kind === 'yt' ? `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg` : ''; }

  function wireLite(el) {
    if (el.dataset.wired) return;
    el.dataset.wired = '1';
    el.addEventListener('click', () => {
      if (el.classList.contains('is-playing')) return;
      const v = parseVideo(el.dataset.src);
      const src = v && embedSrc(v);
      if (!src) return;
      el.classList.add('is-playing');
      el.innerHTML = `<iframe src="${src}" title="${esc(el.dataset.title || 'Vidéo')}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
    });
  }
  function initLite(root) {
    $$('.sc-video[data-src]', root).forEach((el) => {
      const v = parseVideo(el.dataset.src);
      if (v && v.kind === 'yt' && !el.style.backgroundImage) el.style.backgroundImage = `url("${thumbOf(v)}")`;
      wireLite(el);
    });
  }

  // ---------- Cours : onglets ----------
  const panels = $$('.sc-panel');
  const courseBtns = $$('.sc-course');
  let spyTick = false;

  // Chapitre en cours = le dernier dont le haut est passé sous ~35 % de la hauteur de l'écran.
  function updateSpy() {
    spyTick = false;
    const panel = $('.sc-panel.is-active');
    if (!panel) return;
    const chapters = $$('.sc-chapter', panel);
    if (!chapters.length) return;
    let cur = null;
    const line = window.innerHeight * 0.35;
    chapters.forEach((c) => { if (c.getBoundingClientRect().top <= line) cur = c; });
    $$('.sc-toc a', panel).forEach((a) => a.classList.toggle('is-current', !!cur && a.dataset.to === cur.id));
  }
  function setSpy() { updateSpy(); }
  window.addEventListener('scroll', () => { if (!spyTick) { spyTick = true; requestAnimationFrame(updateSpy); } }, { passive: true });

  function openCourse(id, opts) {
    opts = opts || {};
    if (!panels.some((p) => p.dataset.panel === id)) id = 'base';
    panels.forEach((p) => p.classList.toggle('is-active', p.dataset.panel === id));
    courseBtns.forEach((b) => { const on = b.dataset.course === id; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    store.set(TAB_KEY, id);
    setSpy();
    if (opts.scroll !== false) { const a = $('#scArea'); if (a) a.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    if (id === 'videos') renderVideos();
  }
  courseBtns.forEach((b) => b.addEventListener('click', () => openCourse(b.dataset.course)));

  function scrollToChapter(course, chapterId) {
    if (course) openCourse(course, { scroll: false });
    const el = document.getElementById(chapterId);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  document.addEventListener('click', (e) => {
    const toc = e.target.closest('.sc-toc a[data-to]');
    if (toc) { e.preventDefault(); scrollToChapter(null, toc.dataset.to); return; }
    const go = e.target.closest('[data-goto]');
    if (go) {
      e.preventDefault();
      const [course, chapter] = go.dataset.goto.split(':');
      if (chapter) scrollToChapter(course, chapter); else openCourse(course);
    }
  });

  // ---------- Checklist VVS ----------
  const checks = $$('.sc-check input[type=checkbox]');
  const statusEl = $('#vvsStatus');
  function reflectChecks() {
    const done = checks.filter((c) => c.checked).length;
    if (statusEl) {
      const all = done === checks.length && checks.length > 0;
      statusEl.classList.toggle('is-ok', all);
      statusEl.textContent = all ? 'Toutes les cases sont cochées — le trade est autorisé' : `${done} / ${checks.length} cases cochées — sinon, pas de trade`;
    }
  }
  if (checks.length) {
    const saved = store.get(CHECK_KEY, []);
    checks.forEach((c, i) => {
      c.checked = !!saved[i];
      c.addEventListener('change', () => { store.set(CHECK_KEY, checks.map((x) => x.checked)); reflectChecks(); });
    });
    const reset = $('#vvsReset');
    if (reset) reset.addEventListener('click', () => { checks.forEach((c) => { c.checked = false; }); store.set(CHECK_KEY, []); reflectChecks(); });
    reflectChecks();
  }

  // ---------- Calculette 1 % ----------
  const capIn = $('#riskCapital');
  if (capIn) {
    const out = $('#riskOut');
    const fr = (n) => Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
    const upd = () => {
      const cap = parseFloat(String(capIn.value).replace(/\s/g, '').replace(',', '.'));
      out.innerHTML = cap > 0 ? `Risque max par trade (1 %) : <b>${fr(cap * 0.01)} €</b>` : 'Entre ton capital pour voir ton risque maximum par trade.';
    };
    capIn.addEventListener('input', upd);
    upd();
  }

  // ---------- Bibliothèque de vidéos ----------
  const CATS = ['Bases', 'Stratégie VVS', 'Psychologie', 'Autre'];
  const DEFAULT_VIDEOS = [
    { id: 'd1', title: 'Avant de commencer — à regarder en premier', cat: 'Autre', url: 'https://www.youtube.com/watch?v=et552Md8yzo' },
    { id: 'd2', title: 'MetaTrader 5 — passer un ordre', cat: 'Bases', url: 'https://www.youtube.com/watch?v=I8ysF9hb0I8' },
    { id: 'd3', title: 'TradingView — analyser les graphiques', cat: 'Bases', url: 'https://www.youtube.com/watch?v=23IChajv15k' },
    { id: 'd4', title: 'VVS — la gestion du trade', cat: 'Stratégie VVS', url: 'https://youtu.be/qUt6IizL5sw' },
  ];
  let videoFilter = 'Tout';
  const loadVideos = () => { const v = store.get(VIDEOS_KEY, null); return Array.isArray(v) ? v : DEFAULT_VIDEOS.slice(); };
  const saveVideos = (list) => store.set(VIDEOS_KEY, list);

  function renderVideos() {
    const list = loadVideos();
    const chips = $('#vChips');
    const used = ['Tout'].concat(CATS.filter((c) => list.some((v) => v.cat === c)));
    if (!used.includes(videoFilter)) videoFilter = 'Tout';
    chips.innerHTML = used.map((c) => `<button type="button" data-cat="${esc(c)}" class="${c === videoFilter ? 'is-active' : ''}">${esc(c)}</button>`).join('');
    const shown = list.filter((v) => videoFilter === 'Tout' || v.cat === videoFilter);
    const grid = $('#vGrid');
    if (!shown.length) {
      grid.innerHTML = `<div class="sc-vempty" style="grid-column:1/-1">Aucune vidéo pour l'instant. Clique sur « + Ajouter une vidéo » et colle un lien YouTube ou Vimeo.</div>`;
      return;
    }
    grid.innerHTML = shown.map((v) => {
      const p = parseVideo(v.url);
      const media = p && p.kind !== 'ext'
        ? `<button type="button" class="sc-video" data-src="${esc(v.url)}" data-title="${esc(v.title)}" aria-label="Lire ${esc(v.title)}"><span class="sc-video__play">${PLAY}</span></button>`
        : `<a class="sc-video sc-video--ext" href="${esc(v.url)}" target="_blank" rel="noopener noreferrer"><span class="sc-video__play">${PLAY}</span><span class="sc-video__cap">Ouvrir le lien ↗</span></a>`;
      return `<article class="sc-vcard">${media}
        <div class="sc-vcard__meta"><div><div class="sc-vcard__t">${esc(v.title)}</div><div class="sc-vcard__c">${esc(v.cat)}</div></div>
        <button type="button" class="sc-vcard__x" data-del="${esc(v.id)}" aria-label="Retirer cette vidéo" title="Retirer">×</button></div></article>`;
    }).join('');
    initLite(grid);
  }
  const vChips = $('#vChips');
  if (vChips) vChips.addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (b) { videoFilter = b.dataset.cat; renderVideos(); } });
  const vGrid = $('#vGrid');
  if (vGrid) vGrid.addEventListener('click', async (e) => {
    const x = e.target.closest('[data-del]');
    if (!x) return;
    const ok = window.CHESTConfirm ? await window.CHESTConfirm('Retirer cette vidéo de ta bibliothèque ?', { confirmLabel: 'Retirer' }) : true;
    if (!ok) return;
    saveVideos(loadVideos().filter((v) => v.id !== x.dataset.del));
    renderVideos();
  });

  const form = $('#vForm');
  if (form) {
    const err = $('#vErr');
    $('#vToggle').addEventListener('click', () => { form.classList.toggle('is-open'); if (form.classList.contains('is-open')) $('#vUrl').focus(); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const url = $('#vUrl').value.trim();
      const p = parseVideo(url);
      if (!p) { err.textContent = 'Colle un lien complet (https://…) — YouTube et Vimeo se lisent ici, les autres liens s’ouvrent dans un nouvel onglet.'; return; }
      const title = $('#vTitle').value.trim() || 'Vidéo sans titre';
      const list = loadVideos();
      if (list.some((v) => v.url === url)) { err.textContent = 'Cette vidéo est déjà dans ta bibliothèque.'; return; }
      list.unshift({ id: 'v' + Date.now().toString(36), title, cat: $('#vCat').value, url });
      saveVideos(list);
      err.textContent = '';
      form.reset();
      form.classList.remove('is-open');
      videoFilter = 'Tout';
      renderVideos();
    });
  }

  // ---------- Démarrage ----------
  initLite(document);
  const qs = new URLSearchParams(location.search);
  openCourse(qs.get('c') || store.get(TAB_KEY, 'base'), { scroll: false });
  renderVideos();
})();
