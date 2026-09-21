// CHEST · School — l'école : accueil (nouveautés), cours écrits (4 catégories), cours vidéo (Mindset / Business en affiches), lecteur de cours et de fiches.
// Catalogue : js/school-data.js (window.CHEST_SCHOOL). État local (navigateur) : cases VVS, vidéos ajoutées, catégories créées, miniatures (IndexedDB).
(() => {
  'use strict';

  const D = window.CHEST_SCHOOL || { shelves: [], items: [], notes: {}, videoSections: [], videoCats: [], videoSeed: [], videoPending: [], tg: '' };
  const CHECK_KEY = 'chest_school_vvs_check';
  const VKEY = 'chest_school_videos_v3';
  const VKEY_OLD = 'chest_school_videos_v2';

  const store = {
    get(k, fallback) { try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* tant pis */ } },
  };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  // ---------- Icônes (SVG en ligne) ----------
  const IC = {
    chart: 'M3 20V8M9 20V4M15 20v-9M21 20v-6',
    brain: 'M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a2 2 0 0 0-3-1zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1',
    camera: 'M4 8h3l1.5-2h7L17 8h3v11H4V8zM12 16.5a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z',
    image: 'M4 5h16v14H4V5zM4 16l5-5 4 4 3-3 4 4M9 9.5h.01',
    star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9L3.5 9.7l5.9-.8L12 3.5z',
    people: 'M9 11a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 9 11zM2.5 19.5a6.5 6.5 0 0 1 13 0M16 5.5a3.2 3.2 0 0 1 0 6M18 14a5.5 5.5 0 0 1 3.5 5.5',
    link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    pdf: 'M6 3h8l4 4v14H6V3zM14 3v4h4M9 13h6M9 17h6',
    sheet: 'M4 4h16v16H4V4zM4 9h16M4 14h16M10 4v16',
    folder: 'M3 6h6l2 2h10v11H3V6z',
    note: 'M5 3h14v18H5V3zM9 8h6M9 12h6M9 16h4',
    course: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5V5.5zM4 19V5M8 7h8M8 11h6',
    play: 'M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z',
    edit: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
    trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
    close: 'M6 6l12 12M18 6L6 18',
    up: 'M12 16V5M7 10l5-5 5 5M5 19h14',
    plus: 'M12 5v14M5 12h14',
    clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  };
  const svg = (name, cls) => `<svg class="sc-ic ${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${IC[name] || IC.link}"/></svg>`;
  const KIND = { course: 'Cours', note: 'Fiche', pdf: 'PDF', image: 'Image', link: 'Lien', sheet: 'Tableur', folder: 'Dossier' };
  const KICON = { course: 'course', note: 'note', pdf: 'pdf', image: 'image', link: 'link', sheet: 'sheet', folder: 'folder' };

  const shelfOf = (id) => D.shelves.find((s) => s.id === id) || { id, title: id, blurb: '', icon: 'folder', tone: 'blue' };
  const sectionOf = (id) => D.videoSections.find((s) => s.id === id) || { id, title: id, blurb: '', icon: 'play' };
  const itemById = (id) => D.items.find((i) => i.id === id);
  const hrefOf = (it) => it.url || (it.tg ? D.tg + it.tg : '');
  const rankOf = (it) => (it.added ? Date.parse(it.added) / 1000 : it.rank || 0);
  const ago = (ms) => {
    const d = Math.floor((Date.now() - ms) / 86400000);
    return d <= 0 ? "Aujourd'hui" : d === 1 ? 'Hier' : d < 30 ? `Il y a ${d} jours` : new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  // =====================================================================
  //  Vidéos : lecture, stockage, miniatures
  // =====================================================================
  function parseVideo(url) {
    const u = String(url || '').trim();
    let m = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/i);
    if (m) return { kind: 'yt', id: m[1], url: u };
    m = u.match(/youtube\.com\/playlist\?(?:.*&)?list=([\w-]+)/i);
    if (m) return { kind: 'ytlist', id: m[1], url: u };
    m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
    if (m) return { kind: 'vimeo', id: m[1], url: u };
    if (/^https?:\/\//i.test(u)) return { kind: 'ext', url: u };
    return null;
  }
  function embedSrc(v) {
    if (v.kind === 'yt') return `https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0`;
    if (v.kind === 'ytlist') return `https://www.youtube-nocookie.com/embed/videoseries?list=${v.id}&autoplay=1`;
    if (v.kind === 'vimeo') return `https://player.vimeo.com/video/${v.id}?autoplay=1`;
    return null;
  }
  const ytThumb = (v) => (v && v.kind === 'yt' ? `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg` : '');
  const IFRAME_ALLOW = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';

  function initLite(root) {
    $$('.sc-video[data-src]', root).forEach((el) => {
      if (el.dataset.wired) return;
      el.dataset.wired = '1';
      const v = parseVideo(el.dataset.src);
      if (v && v.kind === 'yt' && !el.style.backgroundImage) el.style.backgroundImage = `url("${ytThumb(v)}")`;
      el.addEventListener('click', () => {
        if (el.classList.contains('is-playing')) return;
        const p = parseVideo(el.dataset.src);
        const src = p && embedSrc(p);
        if (!src) return;
        el.classList.add('is-playing');
        el.innerHTML = `<iframe src="${src}" title="${esc(el.dataset.title || 'Vidéo')}" allow="${IFRAME_ALLOW}" allowfullscreen></iframe>`;
      });
    });
  }

  // Miniatures : images réduites, gardées dans IndexedDB (trop lourdes pour le localStorage).
  const flyerDb = {
    db: null,
    open() {
      if (this.db) return Promise.resolve(this.db);
      return new Promise((resolve) => {
        try {
          const req = indexedDB.open('chest_school', 1);
          req.onupgradeneeded = () => req.result.createObjectStore('flyers');
          req.onsuccess = () => { this.db = req.result; resolve(this.db); };
          req.onerror = () => resolve(null);
        } catch (e) { resolve(null); }
      });
    },
    async tx(mode, fn) {
      const db = await this.open();
      if (!db) return null;
      return new Promise((resolve) => {
        try {
          const t = db.transaction('flyers', mode);
          const r = fn(t.objectStore('flyers'));
          t.oncomplete = () => resolve(r && r.result !== undefined ? r.result : true);
          t.onerror = () => resolve(null);
        } catch (e) { resolve(null); }
      });
    },
    put(id, blob) { return this.tx('readwrite', (s) => s.put(blob, id)); },
    get(id) { return this.tx('readonly', (s) => s.get(id)); },
    del(id) { return this.tx('readwrite', (s) => s.delete(id)); },
  };
  async function shrinkImage(file, maxW) {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, maxW / bmp.width);
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/jpeg', 0.86));
  }
  const flyerUrls = {};
  async function flyerUrl(id) {
    if (flyerUrls[id]) return flyerUrls[id];
    const blob = await flyerDb.get(id);
    if (blob && blob instanceof Blob) { flyerUrls[id] = URL.createObjectURL(blob); return flyerUrls[id]; }
    return '';
  }

  // Stockage : { items:[…], cats:[catégories créées] } — migré depuis la version précédente (shelf -> section/cat).
  let vst = null;
  const OLD_CAT = { trading: 'Trading', ugc: 'UGC', reseau: 'Marketing' };
  function migrate(v) {
    if (v.section) return v;
    const out = Object.assign({}, v);
    if (v.shelf === 'stepup') out.section = 'mindset';
    else { out.section = 'business'; out.cat = OLD_CAT[v.shelf] || 'Autres'; }
    delete out.shelf;
    return out;
  }
  function vstore() {
    if (vst) return vst;
    let st = store.get(VKEY, null);
    if (!st || !Array.isArray(st.items)) {
      const old = store.get(VKEY_OLD, null);
      const items = old && Array.isArray(old.items) ? old.items.map(migrate) : D.videoSeed.map((x) => Object.assign({ createdAt: 0 }, x));
      D.videoPending.forEach((p) => { if (!items.some((i) => i.id === p.id)) items.push(Object.assign({ createdAt: 0 }, p)); });
      st = { items, cats: [] };
      store.set(VKEY, st);
    }
    vst = st;
    return st;
  }
  const loadVideos = () => vstore().items;
  const saveVideos = (items) => { vstore().items = items; store.set(VKEY, vstore()); };
  const allCats = () => D.videoCats.concat((vstore().cats || []).filter((c) => !D.videoCats.includes(c)));
  function addCat(name) {
    name = String(name || '').trim();
    if (!name) return '';
    const known = allCats().find((c) => norm(c) === norm(name));
    if (known) return known;
    vstore().cats = (vstore().cats || []).concat(name);
    store.set(VKEY, vstore());
    return name;
  }
  const done = (v) => !v.pending && v.url;

  // =====================================================================
  //  Routage
  // =====================================================================
  const views = { home: $('#scHome'), written: $('#scWritten'), video: $('#scVideo'), course: $('#scCourse'), note: $('#scNote') };
  const crumbs = $('#scCrumbs');
  const COURSES = { base: 'Ressources Trading', vvs: 'VVS — La Stratégie', psy: 'Psychologie & Money Management' };

  function parseUrl() {
    const q = new URLSearchParams(location.search);
    const c = q.get('c');
    if (c === 'videos') return { v: 'video' };
    if (c && COURSES[c]) return { v: 'course', c, ch: q.get('ch') || '' };
    if (q.get('n') && D.notes[q.get('n')]) return { v: 'note', n: q.get('n') };
    if (q.get('v') === 'written') return { v: 'written', s: q.get('s') || '' };
    if (q.get('v') === 'video') return { v: 'video', s: q.get('s') || '', k: q.get('k') || '' };
    return { v: 'home' };
  }
  function stateUrl(st) {
    const q = new URLSearchParams();
    if (st.v === 'written' || st.v === 'video') { q.set('v', st.v); if (st.s) q.set('s', st.s); if (st.k) q.set('k', st.k); }
    if (st.v === 'course') { q.set('c', st.c); if (st.ch) q.set('ch', st.ch); }
    if (st.v === 'note') q.set('n', st.n);
    const s = q.toString();
    return location.pathname + (s ? '?' + s : '');
  }
  function go(st, opts) {
    opts = opts || {};
    if (opts.replace) history.replaceState(st, '', stateUrl(st)); else history.pushState(st, '', stateUrl(st));
    render(st, opts);
  }
  window.addEventListener('popstate', () => render(parseUrl(), { noScroll: true }));

  function setCrumbs(list) {
    if (!list.length) { crumbs.hidden = true; crumbs.innerHTML = ''; return; }
    crumbs.hidden = false;
    crumbs.innerHTML = list.map((c) => (c.st
      ? `<button type="button" class="sc-crumb" data-st='${esc(JSON.stringify(c.st))}'>${esc(c.label)}</button>`
      : `<span class="sc-crumb is-current">${esc(c.label)}</span>`)).join('<i class="sc-crumb__sep">/</i>');
  }
  document.addEventListener('click', (e) => {
    const cr = e.target.closest('.sc-crumb[data-st]');
    if (cr) { try { go(JSON.parse(cr.dataset.st)); } catch (err) { /* ignore */ } }
  });

  function render(st, opts) {
    opts = opts || {};
    Object.keys(views).forEach((k) => { views[k].hidden = k !== st.v; });
    const home = { label: 'School', st: { v: 'home' } };
    if (st.v === 'home') { setCrumbs([]); renderHome(); }
    if (st.v === 'written') {
      setCrumbs([home, st.s ? { label: 'Cours écrits', st: { v: 'written' } } : { label: 'Cours écrits' }].concat(st.s ? [{ label: shelfOf(st.s).title }] : []));
      renderWritten(st.s);
    }
    if (st.v === 'video') {
      const root = { label: 'Cours vidéo', st: { v: 'video' } };
      const list = [home];
      if (!st.s) list.push({ label: 'Cours vidéo' });
      else { list.push(root); list.push(st.k ? { label: sectionOf(st.s).title, st: { v: 'video', s: st.s } } : { label: sectionOf(st.s).title }); if (st.k) list.push({ label: st.k }); }
      setCrumbs(list);
      renderVideos(st.s, st.k);
    }
    if (st.v === 'course') {
      const it = D.items.find((i) => i.course === st.c);
      const shelf = it ? shelfOf(it.shelf) : null;
      setCrumbs([home, { label: 'Cours écrits', st: { v: 'written' } }, shelf ? { label: shelf.title, st: { v: 'written', s: shelf.id } } : null, { label: COURSES[st.c] }].filter(Boolean));
      renderCourse(st.c, st.ch, opts);
    }
    if (st.v === 'note') {
      const it = D.items.find((i) => i.note === st.n);
      const shelf = it ? shelfOf(it.shelf) : null;
      setCrumbs([home, { label: 'Cours écrits', st: { v: 'written' } }, shelf ? { label: shelf.title, st: { v: 'written', s: shelf.id } } : null, { label: D.notes[st.n].title }].filter(Boolean));
      renderNote(st.n);
    }
    if (!opts.noScroll && !(st.v === 'course' && st.ch)) window.scrollTo(0, 0);
  }

  // =====================================================================
  //  Cartes communes
  // =====================================================================
  function coverOf(it) {
    if (it.cover) return `<span class="sc-ctile__cover" style="background-image:url('${it.cover}')"></span>`;
    const sh = shelfOf(it.shelf);
    return `<span class="sc-ctile__cover is-gen tone-${sh.tone}">${svg(it.kind === 'course' ? sh.icon : KICON[it.kind], 'sc-ctile__gen')}</span>`;
  }
  function elTile(it) {
    const href = hrefOf(it);
    const isNote = !!it.note;
    const isCourse = it.kind === 'course';
    const action = isCourse ? 'Ouvrir le cours →' : isNote ? 'Lire la fiche →' : it.tg ? 'Ouvrir dans Telegram ↗' : 'Ouvrir le lien ↗';
    const kind = KIND[it.kind] || '';
    const inner = `${coverOf(it)}<span class="sc-ctile__body"><span class="sc-ctile__k">${esc(kind)}${it.big ? ' · <em>lourd, s\'ouvre dans Telegram</em>' : ''}</span>
      <span class="sc-ctile__t">${esc(it.title)}</span><span class="sc-ctile__d">${esc(it.desc)}</span>
      <span class="sc-ctile__m">${esc(it.meta || '')}<b>${action}</b></span></span>`;
    if (isCourse) return `<button type="button" class="sc-ctile" data-course="${it.course}" data-id="${it.id}">${inner}</button>`;
    if (isNote) return `<button type="button" class="sc-ctile" data-note="${it.note}" data-id="${it.id}">${inner}</button>`;
    return `<a class="sc-ctile" data-id="${it.id}" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
  }
  function catTile(s, count, label, st) {
    return `<button type="button" class="sc-ctile sc-ctile--cat" data-st='${esc(JSON.stringify(st))}'>
      <span class="sc-ctile__cover is-gen tone-${s.tone || 'pink'}">${svg(s.icon, 'sc-ctile__gen')}</span>
      <span class="sc-ctile__body"><span class="sc-ctile__k">${esc(label)}</span><span class="sc-ctile__t">${esc(s.title)}</span><span class="sc-ctile__d">${esc(s.blurb)}</span>
      <span class="sc-ctile__m">${count}<b>Ouvrir →</b></span></span></button>`;
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-st]:not(.sc-crumb)');
    if (t) { try { go(JSON.parse(t.dataset.st)); } catch (err) { /* ignore */ } return; }
    const door = e.target.closest('[data-go]');
    if (door) { go({ v: door.dataset.go }); return; }
    const sh = e.target.closest('[data-shelf]');
    if (sh) { go({ v: 'written', s: sh.dataset.shelf || '' }); return; }
    const co = e.target.closest('[data-course]');
    if (co) { go({ v: 'course', c: co.dataset.course }); return; }
    const nt = e.target.closest('[data-note]');
    if (nt) { go({ v: 'note', n: nt.dataset.note }); }
  });

  // =====================================================================
  //  Accueil : portes, nouveautés, raccourcis
  // =====================================================================
  function newsList() {
    const out = D.items.map((it) => ({ rank: rankOf(it), it }));
    loadVideos().filter((v) => done(v) && v.createdAt > 0).forEach((v) => out.push({ rank: v.createdAt / 1000, v }));
    return out.sort((a, b) => b.rank - a.rank).slice(0, 9);
  }
  function newsCard(n) {
    if (n.v) {
      const v = n.v; const p = parseVideo(v.url); const th = ytThumb(p);
      return `<button type="button" class="sc-news__card" data-play="${esc(v.id)}"><span class="sc-news__img ${v.flyer || th ? '' : 'is-empty'}" ${v.flyer ? `data-flyer="${esc(v.id)}"` : th ? `style="background-image:url('${th}')"` : ''}>${svg('play', 'sc-news__ic')}<span class="sc-news__new">Nouveau</span></span>
        <span class="sc-news__t">${esc(v.title)}</span><span class="sc-news__m">Vidéo · ${esc(v.section === 'mindset' ? 'Mindset' : v.cat || 'Business')} · ${ago(v.createdAt)}</span></button>`;
    }
    const it = n.it; const sh = shelfOf(it.shelf);
    const fresh = it.added && (Date.now() / 1000 - Date.parse(it.added) / 1000) < 14 * 86400;
    const attrs = it.kind === 'course' ? `data-course="${it.course}"` : it.note ? `data-note="${it.note}"` : '';
    const open = attrs ? `<button type="button" class="sc-news__card" ${attrs}>` : `<a class="sc-news__card" href="${esc(hrefOf(it))}" target="_blank" rel="noopener noreferrer">`;
    const close = attrs ? '</button>' : '</a>';
    const img = it.cover ? `style="background-image:url('${it.cover}')"` : '';
    return `${open}<span class="sc-news__img ${it.cover ? '' : 'is-gen tone-' + sh.tone}" ${img}>${it.cover ? '' : svg(it.kind === 'course' ? sh.icon : KICON[it.kind], 'sc-news__ic')}${fresh ? '<span class="sc-news__new">Nouveau</span>' : ''}</span>
      <span class="sc-news__t">${esc(it.title)}</span><span class="sc-news__m">${esc(KIND[it.kind])} · ${esc(sh.title)}${it.added ? ' · ' + ago(Date.parse(it.added)) : ''}</span>${close}`;
  }
  function renderHome() {
    const videos = loadVideos();
    const nDone = videos.filter(done).length;
    const nPending = videos.filter((v) => !done(v)).length;
    $('#doorWritten').textContent = `${D.shelves.length} catégories · ${D.items.length} cours, fiches et documents`;
    $('#doorVideo').textContent = `${nDone} vidéo${nDone > 1 ? 's' : ''}${nPending ? ` · ${nPending} rediffusions à compléter` : ''}`;
    const start = `<div class="sc-news__start"><span class="chest-label">Commence ici</span><button type="button" class="sc-video" data-src="https://www.youtube.com/watch?v=et552Md8yzo" data-title="À regarder avant de commencer" aria-label="Lire la vidéo d'introduction"><span class="sc-video__play">${svg('play')}</span><span class="sc-video__cap">À regarder avant de commencer</span></button></div>`;
    $('#scNews').innerHTML = start + newsList().map(newsCard).join('');
    const tiles = D.shelves.map((s) => ({ s, n: D.items.filter((i) => i.shelf === s.id).length, st: { v: 'written', s: s.id }, k: 'Cours écrits', unit: 'élément' }))
      .concat(D.videoSections.map((s) => ({ s: Object.assign({ tone: s.id === 'mindset' ? 'pink' : 'amber' }, s), n: loadVideos().filter((v) => v.section === s.id && done(v)).length, st: { v: 'video', s: s.id }, k: 'Cours vidéo', unit: 'vidéo' })));
    $('#scShelfTiles').innerHTML = tiles.map((t) => `<button type="button" class="sc-shelf-tile" data-st='${esc(JSON.stringify(t.st))}'><span class="sc-shelf-tile__ic">${svg(t.s.icon)}</span><span class="sc-shelf-tile__k">${t.k}</span><span class="sc-shelf-tile__t">${esc(t.s.title)}</span><span class="sc-shelf-tile__n">${t.n} ${t.unit}${t.n > 1 ? 's' : ''}</span></button>`).join('');
    paintFlyers($('#scNews'));
    initLite(views.home);
  }

  // =====================================================================
  //  Cours écrits
  // =====================================================================
  function renderWritten(shelfId) {
    const head = { step: $('#wStep'), title: $('#wTitle'), blurb: $('#wBlurb'), chips: $('#wChips'), body: $('#wBody') };
    if (!shelfId) {
      head.step.textContent = '01 — École'; head.title.textContent = 'Cours écrits';
      head.blurb.textContent = 'Choisis une catégorie : chacune rassemble ses cours, ses fiches et ses documents.';
      head.chips.hidden = true;
      head.body.innerHTML = `<div class="sc-catgrid">${D.shelves.map((s) => { const n = D.items.filter((i) => i.shelf === s.id).length; return catTile(s, `${n} élément${n > 1 ? 's' : ''}`, 'Catégorie', { v: 'written', s: s.id }); }).join('')}</div>`;
      return;
    }
    const s = shelfOf(shelfId);
    head.step.textContent = 'Cours écrits'; head.title.textContent = s.title; head.blurb.textContent = s.blurb;
    head.chips.hidden = false;
    head.chips.innerHTML = D.shelves.map((x) => `<button type="button" data-shelf="${x.id}" class="${x.id === shelfId ? 'is-active' : ''}">${esc(x.title)}</button>`).join('');
    const its = D.items.filter((i) => i.shelf === shelfId);
    const groups = [];
    its.forEach((i) => { const g = i.sub || ''; let grp = groups.find((x) => x.g === g); if (!grp) { grp = { g, list: [] }; groups.push(grp); } grp.list.push(i); });
    head.body.innerHTML = groups.map((g) => `${g.g ? `<h2 class="sc-group">${esc(g.g)} <small>${g.list.length}</small></h2>` : ''}<div class="sc-tiles">${g.list.map(elTile).join('')}</div>`).join('');
  }

  // =====================================================================
  //  Lecteur de cours
  // =====================================================================
  function updateSpy() {
    const panel = $('.sc-panel.is-active');
    if (!panel) return;
    let cur = null;
    const line = window.innerHeight * 0.35;
    $$('.sc-chapter', panel).forEach((c) => { if (c.getBoundingClientRect().top <= line) cur = c; });
    $$('.sc-toc a', panel).forEach((a) => a.classList.toggle('is-current', !!cur && a.dataset.to === cur.id));
  }
  let spyTick = false;
  window.addEventListener('scroll', () => { if (!spyTick) { spyTick = true; requestAnimationFrame(() => { spyTick = false; updateSpy(); }); } }, { passive: true });

  function renderCourse(id, chapter, opts) {
    $$('.sc-panel').forEach((p) => p.classList.toggle('is-active', p.dataset.panel === id));
    initLite(views.course);
    updateSpy();
    if (chapter) {
      const el = document.getElementById(chapter);
      if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: opts && opts.instant ? 'auto' : 'smooth', block: 'start' }));
    }
  }
  document.addEventListener('click', (e) => {
    const toc = e.target.closest('.sc-toc a[data-to]');
    if (toc) { e.preventDefault(); const el = document.getElementById(toc.dataset.to); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const gt = e.target.closest('[data-goto]');
    if (gt) {
      e.preventDefault();
      const [course, chapter] = gt.dataset.goto.split(':');
      go({ v: 'course', c: course, ch: chapter || '' });
    }
  });

  function renderNote(id) {
    const n = D.notes[id];
    const it = D.items.find((i) => i.note === id);
    const href = it ? hrefOf(it) : '';
    const shelf = it ? shelfOf(it.shelf).title : '';
    $('#scArticle').innerHTML = `<span class="chest-step">Fiche · ${esc(shelf)}</span><h1>${esc(n.title)}</h1><div class="sc-article__body">${n.html}</div>` +
      (href ? `<a class="chest-btn-2 sc-article__src" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${it.tg ? 'Ouvrir le document dans Telegram' : 'Ouvrir le lien'} ↗</a>` : '');
  }

  // =====================================================================
  //  Cours vidéo : Mindset (16:9) et Business (affiches 9:16 par catégorie)
  // =====================================================================
  async function paintFlyers(root) {
    for (const el of $$('[data-flyer]', root)) {
      const url = await flyerUrl(el.dataset.flyer);
      if (url) { el.style.backgroundImage = `url("${url}")`; el.classList.remove('is-empty'); const ph = $('.sc-poster__ph', el); if (ph) ph.remove(); }
    }
  }
  function renderVideos(section, cat) {
    const head = { step: $('#vhStep'), title: $('#vhTitle'), blurb: $('#vhBlurb') };
    const doors = $('#vDoors'); const bar = $('#vBar'); const body = $('#vBody');
    const all = loadVideos();
    if (!section) {
      head.step.textContent = '02 — École'; head.title.textContent = 'Cours vidéo';
      head.blurb.textContent = 'Mindset pour s\'inspirer, Business pour revoir toutes les rediffusions, rangées par catégorie.';
      bar.hidden = true; body.innerHTML = '';
      doors.hidden = false;
      doors.innerHTML = D.videoSections.map((s, i) => {
        const list = all.filter((v) => v.section === s.id);
        const n = list.filter(done).length; const p = list.length - n;
        return `<button type="button" class="sc-door ${i ? 'sc-door--video' : 'sc-door--written'}" data-st='${esc(JSON.stringify({ v: 'video', s: s.id }))}'>
          <span class="sc-door__ic">${svg(s.icon)}</span><span class="sc-door__n">0${i + 1}</span><span class="sc-door__t">${esc(s.title)}</span><span class="sc-door__d">${esc(s.blurb)}</span>
          <span class="sc-door__meta">${n} vidéo${n > 1 ? 's' : ''}${p ? ` · ${p} à compléter` : ''}</span><span class="sc-door__go">Entrer <i>→</i></span></button>`;
      }).join('');
      return;
    }
    const sec = sectionOf(section);
    doors.hidden = true; bar.hidden = false;
    head.step.textContent = 'Cours vidéo'; head.title.textContent = sec.title; head.blurb.textContent = sec.blurb;
    const mine = all.filter((v) => v.section === section);
    const chips = $('#vChips');
    if (section === 'business') {
      const cats = allCats();
      chips.hidden = false;
      chips.innerHTML = `<button type="button" data-vcat="" class="${!cat ? 'is-active' : ''}">Tous · ${mine.filter(done).length}</button>` +
        cats.map((c) => `<button type="button" data-vcat="${esc(c)}" class="${cat === c ? 'is-active' : ''}">${esc(c)} · ${mine.filter((v) => done(v) && v.cat === c).length}</button>`).join('') +
        '<button type="button" class="sc-chip-add" id="vAddCat">+ Catégorie</button>';
    } else { chips.hidden = true; chips.innerHTML = ''; }
    const shown = mine.filter((v) => done(v) && (section !== 'business' || !cat || v.cat === cat));
    const pend = mine.filter((v) => !done(v) && (!cat || v.cat === cat));
    let html = '';
    if (!shown.length) {
      html += `<div class="sc-vempty"><span class="sc-vempty__ic">${svg('play')}</span><b>Aucune vidéo ici pour l'instant</b><span>Ajoute un lien YouTube et une miniature.</span><button type="button" class="chest-btn" data-vadd="${section}|${esc(cat || '')}">+ Ajouter une vidéo</button></div>`;
    } else if (section === 'business') {
      html += `<div class="sc-posters">${shown.map(posterCard).join('')}</div>`;
    } else {
      html += `<div class="sc-vgrid">${shown.map(wideCard).join('')}</div>`;
    }
    if (pend.length) {
      html += `<details class="sc-pending"><summary><span>À compléter · ${pend.length}</span><small>Ajoute le lien YouTube et la miniature de chaque rediffusion</small></summary><div class="sc-pending__list">${pend.map((v) => `<div class="sc-prow"><span class="sc-prow__t">${esc(v.title)}</span><span class="sc-prow__d">${svg('clock')}${esc(v.duration || '')}</span><span class="sc-prow__c">${esc(v.cat || '')}</span><button type="button" class="chest-btn-2" data-vedit="${esc(v.id)}">Ajouter le lien</button></div>`).join('')}</div></details>`;
    }
    body.innerHTML = html;
    paintFlyers(body);
  }
  function tools(v) {
    return `<div class="sc-vcard__tools"><button type="button" data-vthumb="${esc(v.id)}" aria-label="Changer la miniature" title="Changer la miniature">${svg('image')}</button><button type="button" data-vedit="${esc(v.id)}" aria-label="Modifier" title="Modifier">${svg('edit')}</button><button type="button" data-vdel="${esc(v.id)}" aria-label="Retirer" title="Retirer">${svg('trash')}</button></div>`;
  }
  function posterCard(v) {
    const p = parseVideo(v.url);
    const th = v.flyer ? '' : ytThumb(p);
    return `<article class="sc-poster" data-id="${esc(v.id)}">
      <button type="button" class="sc-poster__img ${v.flyer ? '' : 'is-empty'}" data-play="${esc(v.id)}" ${v.flyer ? `data-flyer="${esc(v.id)}"` : th ? `style="background-image:url('${th}')"` : ''} aria-label="Lire ${esc(v.title)}">
        ${v.flyer || th ? '' : `<span class="sc-poster__ph">${esc(v.title)}</span>`}
        <span class="sc-poster__cat">${esc(v.cat || '')}</span>${v.duration ? `<span class="sc-poster__dur">${esc(v.duration)}</span>` : ''}
        <span class="sc-video__play">${svg('play')}</span></button>
      <div class="sc-poster__meta"><div class="sc-poster__t">${esc(v.title)}</div>${tools(v)}</div></article>`;
  }
  function wideCard(v) {
    const p = parseVideo(v.url);
    const th = ytThumb(p);
    const playable = p && p.kind !== 'ext';
    return `<article class="sc-vcard" data-id="${esc(v.id)}">
      <button type="button" class="sc-vthumb ${th || v.flyer ? '' : 'is-empty'}" data-play="${esc(v.id)}" ${v.flyer ? `data-flyer="${esc(v.id)}"` : th ? `style="background-image:url('${th}')"` : ''} aria-label="${playable ? 'Lire' : 'Ouvrir'} ${esc(v.title)}">
        <span class="sc-video__play">${svg('play')}</span><span class="sc-vbadge">${esc(sectionOf(v.section).title)}${p && p.kind === 'ytlist' ? ' · playlist' : ''}</span></button>
      <div class="sc-vcard__meta"><div><div class="sc-vcard__t">${esc(v.title)}</div>${v.speaker ? `<div class="sc-vcard__c">${esc(v.speaker)}</div>` : ''}</div>${tools(v)}</div></article>`;
  }

  // ---------- Fenêtre (lecteur / formulaire) ----------
  const modal = $('#scModal');
  const modalPanel = $('#scModalPanel');
  function openModal(html) { modalPanel.innerHTML = html; modal.hidden = false; }
  function closeModal() { modal.hidden = true; modalPanel.innerHTML = ''; }
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-mclose]')) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!modal.hidden) closeModal(); const lb = $('#scLightbox'); if (!lb.hidden) lb.hidden = true; } });

  function playVideo(id) {
    const v = loadVideos().find((x) => x.id === id);
    if (!v) return;
    const p = parseVideo(v.url);
    const src = p && embedSrc(p);
    if (!src) { if (v.url) window.open(v.url, '_blank', 'noopener'); return; }
    openModal(`<button type="button" class="sc-modal__x" data-mclose aria-label="Fermer">${svg('close')}</button>
      <div class="sc-player"><iframe src="${src}" title="${esc(v.title)}" allow="${IFRAME_ALLOW}" allowfullscreen></iframe></div>
      <div class="sc-modal__info"><span class="chest-step">${esc(sectionOf(v.section).title)}${v.cat ? ' · ' + esc(v.cat) : ''}${v.speaker ? ' · ' + esc(v.speaker) : ''}</span><h3>${esc(v.title)}</h3>${v.desc ? `<p>${esc(v.desc)}</p>` : ''}<a class="sc-modal__ext" href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">Ouvrir sur ${p.kind === 'vimeo' ? 'Vimeo' : 'YouTube'} ↗</a></div>`);
  }

  // Miniature seule (bouton de la carte)
  function pickThumb(id) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      try {
        const blob = await shrinkImage(f, 720);
        await flyerDb.put(id, blob); delete flyerUrls[id];
        const list = loadVideos(); const v = list.find((x) => x.id === id);
        if (v) { v.flyer = true; saveVideos(list); }
        rerenderVideos();
      } catch (e) { /* ignore */ }
    });
    inp.click();
  }

  let pendingFlyer = null; // Blob choisi dans le formulaire
  let keepFlyer = false;
  function videoForm(v, defaults) {
    pendingFlyer = null;
    keepFlyer = !!(v && v.flyer);
    defaults = defaults || {};
    const cur = v || { section: defaults.section || 'business', cat: defaults.cat || allCats()[0] };
    const cats = allCats();
    openModal(`<button type="button" class="sc-modal__x" data-mclose aria-label="Fermer">${svg('close')}</button>
      <form class="sc-form" id="vForm" autocomplete="off" novalidate>
        <span class="chest-step">${v ? (v.pending ? 'Compléter la rediffusion' : 'Modifier la vidéo') : 'Ajouter une vidéo'}</span>
        <h3>${v ? esc(v.title) : 'Nouvelle vidéo'}</h3>
        <label>Lien YouTube ou Vimeo<input id="vUrl" type="url" placeholder="https://www.youtube.com/watch?v=…" value="${esc(cur.url || '')}"></label>
        <label>Titre<input id="vTitle" type="text" maxlength="140" placeholder="Ex. Rediffusion — Rank Up 12/08" value="${esc(cur.title || '')}"></label>
        <div class="sc-form__row">
          <label>Section<select id="vSection">${D.videoSections.map((s) => `<option value="${s.id}" ${cur.section === s.id ? 'selected' : ''}>${esc(s.title)}</option>`).join('')}</select></label>
          <label id="vCatWrap">Catégorie<select id="vCat">${cats.map((c) => `<option ${cur.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}<option value="__new">+ Créer une catégorie…</option></select></label>
        </div>
        <label id="vNewCatWrap" hidden>Nom de la nouvelle catégorie<input id="vNewCat" type="text" maxlength="40" placeholder="Ex. Immobilier"></label>
        <div class="sc-form__row">
          <label>Intervenant (facultatif)<input id="vSpeaker" type="text" maxlength="80" value="${esc(cur.speaker || '')}"></label>
          <label>Durée (facultatif)<input id="vDur" type="text" maxlength="10" placeholder="41:58" value="${esc(cur.duration || '')}"></label>
        </div>
        <label>Description (facultatif)<textarea id="vDesc" rows="2" maxlength="400">${esc(cur.desc || '')}</textarea></label>
        <div class="sc-flyer">
          <div class="sc-flyer__prev" id="vFlyerPrev">${svg('image')}</div>
          <div class="sc-flyer__txt"><b>Miniature (format affiche 9:16)</b><span>Choisis un fichier, ou colle l'image avec Ctrl+V.</span>
            <div class="sc-flyer__btns"><label class="chest-btn-2 sc-flyer__pick">${svg('up')} Choisir une miniature<input id="vFlyer" type="file" accept="image/*" hidden></label><button type="button" class="sc-flyer__rm" id="vFlyerRm" hidden>Retirer</button></div></div>
        </div>
        <div class="sc-form__err" id="vErr"></div>
        <div class="sc-form__foot"><button type="button" class="chest-btn-2" data-mclose>Annuler</button><button type="submit" class="chest-btn">${v && !v.pending ? 'Enregistrer' : 'Ajouter'}</button></div>
      </form>`);
    const prev = $('#vFlyerPrev');
    const rm = $('#vFlyerRm');
    const showPrev = (url) => { prev.style.backgroundImage = url ? `url("${url}")` : ''; prev.classList.toggle('has-img', !!url); rm.hidden = !url; };
    const setFlyer = async (file) => {
      try { pendingFlyer = await shrinkImage(file, 720); keepFlyer = false; showPrev(URL.createObjectURL(pendingFlyer)); } catch (err) { $('#vErr').textContent = "Cette image n'a pas pu être lue."; }
    };
    const reflectSection = () => { const biz = $('#vSection').value === 'business'; $('#vCatWrap').hidden = !biz; $('#vNewCatWrap').hidden = !(biz && $('#vCat').value === '__new'); };
    $('#vSection').addEventListener('change', reflectSection);
    $('#vCat').addEventListener('change', () => { reflectSection(); if ($('#vCat').value === '__new') $('#vNewCat').focus(); });
    reflectSection();
    if (keepFlyer) flyerUrl(v.id).then(showPrev);
    $('#vFlyer').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; if (f) setFlyer(f); });
    modalPanel.addEventListener('paste', function onPaste(e) {
      const f = e.clipboardData && Array.from(e.clipboardData.files || []).find((x) => x.type.startsWith('image/'));
      if (f) { e.preventDefault(); setFlyer(f); }
    });
    rm.addEventListener('click', () => { pendingFlyer = null; keepFlyer = false; $('#vFlyer').value = ''; showPrev(''); });
    $('#vForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = $('#vUrl').value.trim();
      const p = url ? parseVideo(url) : null;
      const err = $('#vErr');
      if (url && !p) { err.textContent = 'Colle un lien complet (https://…). YouTube et Vimeo se lisent ici, les autres liens s\'ouvrent dans un nouvel onglet.'; return; }
      if (!url && !(v && v.pending)) { err.textContent = 'Colle le lien de la vidéo.'; return; }
      const list = loadVideos();
      if (url && list.some((x) => x.url === url && (!v || x.id !== v.id))) { err.textContent = 'Cette vidéo est déjà dans ta bibliothèque.'; return; }
      const section = $('#vSection').value;
      let category = '';
      if (section === 'business') {
        category = $('#vCat').value === '__new' ? addCat($('#vNewCat').value) : $('#vCat').value;
        if (!category) { err.textContent = 'Donne un nom à la nouvelle catégorie.'; return; }
      }
      const rec = Object.assign({}, v || { id: 'v' + Date.now().toString(36) }, {
        url, title: $('#vTitle').value.trim() || 'Vidéo sans titre', section, cat: category, speaker: $('#vSpeaker').value.trim(), desc: $('#vDesc').value.trim(), duration: $('#vDur').value.trim(),
      });
      if (url && (!v || v.pending)) { rec.pending = false; rec.createdAt = Date.now(); } else if (!url) rec.pending = true;
      if (!v) rec.createdAt = Date.now();
      if (pendingFlyer) { const ok = await flyerDb.put(rec.id, pendingFlyer); rec.flyer = !!ok; delete flyerUrls[rec.id]; }
      else if (!keepFlyer) { if (rec.flyer) { await flyerDb.del(rec.id); delete flyerUrls[rec.id]; } rec.flyer = false; }
      if (v) { const i = list.findIndex((x) => x.id === v.id); list[i] = rec; } else list.unshift(rec);
      saveVideos(list);
      closeModal();
      const st = parseUrl();
      if (st.v === 'video') go({ v: 'video', s: section, k: section === 'business' ? category : '' }, { replace: true, noScroll: true }); else render(st, { noScroll: true });
    });
    $('#vUrl').focus();
  }
  function rerenderVideos() { const st = parseUrl(); render(st, { noScroll: true }); }

  document.addEventListener('click', async (e) => {
    const add = e.target.closest('#vAdd, [data-vadd]');
    if (add) {
      const st = parseUrl();
      const raw = (add.dataset.vadd || '').split('|');
      videoForm(null, { section: raw[0] || st.s || 'business', cat: raw[1] || st.k || '' });
      return;
    }
    const chip = e.target.closest('[data-vcat]');
    if (chip) { const st = parseUrl(); go({ v: 'video', s: st.s || 'business', k: chip.dataset.vcat || '' }, { noScroll: true }); return; }
    if (e.target.closest('#vAddCat')) {
      openModal(`<button type="button" class="sc-modal__x" data-mclose aria-label="Fermer">${svg('close')}</button><form class="sc-form" id="catForm"><span class="chest-step">Business</span><h3>Nouvelle catégorie</h3>
        <label>Nom<input id="catName" type="text" maxlength="40" placeholder="Ex. Immobilier"></label><div class="sc-form__foot"><button type="button" class="chest-btn-2" data-mclose>Annuler</button><button type="submit" class="chest-btn">Créer</button></div></form>`);
      $('#catName').focus();
      $('#catForm').addEventListener('submit', (ev) => { ev.preventDefault(); const c = addCat($('#catName').value); closeModal(); if (c) go({ v: 'video', s: 'business', k: c }, { noScroll: true }); });
      return;
    }
    const pl = e.target.closest('[data-play]');
    if (pl) { playVideo(pl.dataset.play); return; }
    const th = e.target.closest('[data-vthumb]');
    if (th) { pickThumb(th.dataset.vthumb); return; }
    const ed = e.target.closest('[data-vedit]');
    if (ed) { videoForm(loadVideos().find((x) => x.id === ed.dataset.vedit)); return; }
    const del = e.target.closest('[data-vdel]');
    if (del) {
      const ok = window.CHESTConfirm ? await window.CHESTConfirm('Retirer cette vidéo de ta bibliothèque ?', { confirmLabel: 'Retirer' }) : true;
      if (!ok) return;
      const id = del.dataset.vdel;
      saveVideos(loadVideos().filter((x) => x.id !== id));
      flyerDb.del(id); delete flyerUrls[id];
      rerenderVideos();
    }
  });

  // =====================================================================
  //  Recherche
  // =====================================================================
  const searchIn = $('#scSearch');
  const resultsEl = $('#scResults');
  function searchIndex() {
    const out = [];
    D.items.forEach((i) => out.push({ type: 'item', id: i.id, title: i.title, hay: norm(i.title + ' ' + i.desc), label: `Cours écrits · ${shelfOf(i.shelf).title}`, kind: i.kind }));
    loadVideos().filter(done).forEach((v) => out.push({ type: 'video', id: v.id, title: v.title, hay: norm(v.title + ' ' + (v.speaker || '') + ' ' + (v.desc || '')), label: `Vidéo · ${sectionOf(v.section).title}${v.cat ? ' · ' + v.cat : ''}`, kind: 'video' }));
    return out;
  }
  function runSearch() {
    const q = norm(searchIn.value.trim());
    if (q.length < 2) { resultsEl.hidden = true; return; }
    const terms = q.split(/\s+/);
    const hits = searchIndex().filter((r) => terms.every((t) => r.hay.includes(t))).slice(0, 8);
    resultsEl.innerHTML = hits.length
      ? hits.map((h) => `<button type="button" class="sc-result" data-rtype="${h.type}" data-rid="${esc(h.id)}"><span class="sc-result__ic">${svg(h.kind === 'video' ? 'play' : KICON[h.kind])}</span><span><b>${esc(h.title)}</b><small>${esc(h.label)}</small></span></button>`).join('')
      : '<div class="sc-result sc-result--none">Aucun résultat.</div>';
    resultsEl.hidden = false;
  }
  searchIn.addEventListener('input', runSearch);
  searchIn.addEventListener('focus', runSearch);
  document.addEventListener('click', (e) => {
    const r = e.target.closest('.sc-result[data-rid]');
    if (r) {
      resultsEl.hidden = true; searchIn.value = '';
      if (r.dataset.rtype === 'video') { const v = loadVideos().find((x) => x.id === r.dataset.rid); go({ v: 'video', s: v ? v.section : '', k: v && v.cat ? v.cat : '' }); setTimeout(() => playVideo(r.dataset.rid), 60); return; }
      const it = itemById(r.dataset.rid);
      if (!it) return;
      if (it.kind === 'course') { go({ v: 'course', c: it.course }); return; }
      if (it.note) { go({ v: 'note', n: it.note }); return; }
      go({ v: 'written', s: it.shelf });
      setTimeout(() => { const el = $(`.sc-ctile[data-id="${it.id}"]`); if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('is-flash'); setTimeout(() => el.classList.remove('is-flash'), 1800); } }, 80);
      return;
    }
    if (!e.target.closest('#scSearchBox')) resultsEl.hidden = true;
  });

  // =====================================================================
  //  Images agrandies, checklist, calculette
  // =====================================================================
  const lightbox = $('#scLightbox');
  document.addEventListener('click', (e) => {
    const im = e.target.closest('img[data-zoom]');
    if (im) { $('img', lightbox).src = im.src; lightbox.hidden = false; return; }
    if (e.target.closest('#scLightbox')) lightbox.hidden = true;
  });

  const checks = $$('.sc-check input[type=checkbox]');
  const statusEl = $('#vvsStatus');
  function reflectChecks() {
    const n = checks.filter((c) => c.checked).length;
    if (!statusEl) return;
    const all = n === checks.length && checks.length > 0;
    statusEl.classList.toggle('is-ok', all);
    statusEl.textContent = all ? 'Toutes les cases sont cochées — le trade est autorisé' : `${n} / ${checks.length} cases cochées — sinon, pas de trade`;
  }
  if (checks.length) {
    const saved = store.get(CHECK_KEY, []);
    checks.forEach((c, i) => {
      c.checked = !!saved[i];
      c.addEventListener('change', () => { store.set(CHECK_KEY, checks.map((x) => x.checked)); reflectChecks(); });
    });
    const reset = $('#vvsReset');
    if (reset) reset.addEventListener('click', () => { checks.forEach((c) => { c.checked = false; }); try { localStorage.removeItem(CHECK_KEY); } catch (e) { /* tant pis */ } reflectChecks(); });
    reflectChecks();
  }

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

  // ---------- Démarrage ----------
  initLite(document);
  const first = parseUrl();
  history.replaceState(first, '', location.href);
  render(first, { noScroll: true, instant: true });
})();
