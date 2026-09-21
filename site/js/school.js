// CHEST · School — l'école : accueil, cours écrits (rayons), cours vidéo (bibliothèque avec flyers), lecteur de cours et de notes.
// Catalogue : js/school-data.js (window.CHEST_SCHOOL). État local (navigateur) : cases VVS, vidéos ajoutées, flyers (IndexedDB).
(() => {
  'use strict';

  const D = window.CHEST_SCHOOL || { shelves: [], items: [], notes: {}, videoShelves: [], videoSeed: [], tg: '' };
  const CHECK_KEY = 'chest_school_vvs_check';
  const VIDEOS_KEY = 'chest_school_videos_v2';

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
  };
  const svg = (name, cls) => `<svg class="sc-ic ${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${IC[name] || IC.link}"/></svg>`;
  const KIND = { course: 'Cours', note: 'Fiche', pdf: 'PDF', image: 'Image', link: 'Lien', sheet: 'Tableur', folder: 'Dossier' };
  const KICON = { course: 'course', note: 'note', pdf: 'pdf', image: 'image', link: 'link', sheet: 'sheet', folder: 'folder' };

  const shelfOf = (id) => D.shelves.find((s) => s.id === id) || { id, title: id, blurb: '', icon: 'folder' };
  const vShelfOf = (id) => D.videoShelves.find((s) => s.id === id) || { id, title: 'Autre', blurb: '' };
  const itemById = (id) => D.items.find((i) => i.id === id);
  const hrefOf = (it) => it.url || (it.tg ? D.tg + it.tg : '');

  // =====================================================================
  //  Vidéos : lecture, stockage, flyers
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

  // Lecteur léger (miniature -> iframe au clic) utilisé dans les cours.
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

  // Flyers : images réduites, gardées dans IndexedDB (trop lourdes pour le localStorage).
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
    return new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/jpeg', 0.84));
  }
  const flyerUrls = {};
  async function flyerUrl(id) {
    if (flyerUrls[id]) return flyerUrls[id];
    const blob = await flyerDb.get(id);
    if (blob && blob instanceof Blob) { flyerUrls[id] = URL.createObjectURL(blob); return flyerUrls[id]; }
    return '';
  }

  function loadVideos() {
    let v = store.get(VIDEOS_KEY, null);
    if (!v || !Array.isArray(v.items)) {
      v = { items: D.videoSeed.map((x) => Object.assign({ createdAt: 0 }, x)) };
      store.set(VIDEOS_KEY, v);
    }
    return v.items;
  }
  const saveVideos = (items) => store.set(VIDEOS_KEY, { items });

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
    if (q.get('v') === 'video') return { v: 'video', s: q.get('s') || '' };
    return { v: 'home' };
  }
  function stateUrl(st) {
    const q = new URLSearchParams();
    if (st.v === 'written' || st.v === 'video') { q.set('v', st.v); if (st.s) q.set('s', st.s); }
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
      setCrumbs([home, st.s ? { label: 'Cours vidéo', st: { v: 'video' } } : { label: 'Cours vidéo' }].concat(st.s ? [{ label: vShelfOf(st.s).title }] : []));
      renderVideos(st.s);
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
  //  Accueil
  // =====================================================================
  function courseTile(it) {
    return `<button type="button" class="sc-ctile" data-course="${it.course}">
      <span class="sc-ctile__cover ${it.cover ? '' : 'is-gen is-' + it.course}" ${it.cover ? `style="background-image:url('${it.cover}')"` : ''}>${it.cover ? '' : svg(shelfOf(it.shelf).icon, 'sc-ctile__gen')}</span>
      <span class="sc-ctile__body"><span class="sc-ctile__k">${esc(shelfOf(it.shelf).title)}</span><span class="sc-ctile__t">${esc(it.title)}</span><span class="sc-ctile__d">${esc(it.desc)}</span>
      <span class="sc-ctile__m">${esc(it.meta || '')}<b>Ouvrir le cours →</b></span></span></button>`;
  }
  function renderHome() {
    const videos = loadVideos();
    $('#doorWritten').textContent = `${D.items.filter((i) => i.kind === 'course').length} cours · ${D.items.filter((i) => i.kind !== 'course').length} documents et fiches`;
    $('#doorVideo').textContent = `${videos.length} vidéo${videos.length > 1 ? 's' : ''} · ${D.videoShelves.length} rayons`;
    $('#scFeatured').innerHTML = D.items.filter((i) => i.kind === 'course').map(courseTile).join('');
    $('#scShelfTiles').innerHTML = D.shelves.map((s) => {
      const n = D.items.filter((i) => i.shelf === s.id).length;
      return `<button type="button" class="sc-shelf-tile" data-shelf="${s.id}"><span class="sc-shelf-tile__ic">${svg(s.icon)}</span><span class="sc-shelf-tile__t">${esc(s.title)}</span><span class="sc-shelf-tile__d">${esc(s.blurb)}</span><span class="sc-shelf-tile__n">${n} élément${n > 1 ? 's' : ''}</span></button>`;
    }).join('');
    initLite(views.home);
  }

  // =====================================================================
  //  Cours écrits
  // =====================================================================
  function tile(it) {
    if (it.kind === 'course') return courseTile(it);
    const href = hrefOf(it);
    const opensNote = !!it.note;
    const action = opensNote ? 'Lire la fiche →' : it.tg ? 'Ouvrir dans Telegram ↗' : 'Ouvrir le lien ↗';
    const inner = `<span class="sc-tile__ic sc-k-${it.kind}">${svg(KICON[it.kind])}</span>
      <span class="sc-tile__body"><span class="sc-tile__k">${esc(KIND[it.kind] || '')}${it.big ? ' · <em>lourd, s\'ouvre dans Telegram</em>' : ''}</span>
      <span class="sc-tile__t">${esc(it.title)}</span><span class="sc-tile__d">${esc(it.desc)}</span>
      <span class="sc-tile__m">${esc(it.meta || '')}<b>${action}</b></span></span>`;
    if (opensNote) return `<button type="button" class="sc-tile" data-note="${it.note}" data-id="${it.id}">${inner}</button>`;
    return `<a class="sc-tile" data-id="${it.id}" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
  }
  function renderWritten(shelfId) {
    const rail = $('#scRail');
    rail.innerHTML = `<button type="button" data-shelf="" class="${!shelfId ? 'is-current' : ''}"><span>Tous les rayons</span><i>${D.items.length}</i></button>` +
      D.shelves.map((s) => `<button type="button" data-shelf="${s.id}" class="${shelfId === s.id ? 'is-current' : ''}"><span class="sc-rail__ic">${svg(s.icon)}</span><span>${esc(s.title)}</span><i>${D.items.filter((i) => i.shelf === s.id).length}</i></button>`).join('');
    const list = shelfId ? D.shelves.filter((s) => s.id === shelfId) : D.shelves;
    $('#scShelves').innerHTML = list.map((s) => {
      const its = D.items.filter((i) => i.shelf === s.id);
      return `<section class="sc-shelf" id="shelf-${s.id}"><div class="sc-shelf__head"><span class="sc-shelf__ic">${svg(s.icon)}</span><div><h2>${esc(s.title)}</h2><p>${esc(s.blurb)}</p></div><span class="sc-shelf__n">${its.length}</span></div><div class="sc-tiles">${its.map(tile).join('')}</div></section>`;
    }).join('');
  }
  document.addEventListener('click', (e) => {
    const door = e.target.closest('[data-go]');
    if (door) { go({ v: door.dataset.go }); return; }
    const sh = e.target.closest('[data-shelf]');
    if (sh && (sh.closest('#scRail') || sh.closest('#scShelfTiles'))) { go({ v: 'written', s: sh.dataset.shelf || '' }); return; }
    const co = e.target.closest('[data-course]');
    if (co) { go({ v: 'course', c: co.dataset.course }); return; }
    const nt = e.target.closest('[data-note]');
    if (nt) { go({ v: 'note', n: nt.dataset.note }); }
  });

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

  // =====================================================================
  //  Notes
  // =====================================================================
  function renderNote(id) {
    const n = D.notes[id];
    const it = D.items.find((i) => i.note === id);
    const href = it ? hrefOf(it) : '';
    const shelf = it ? shelfOf(it.shelf).title : '';
    $('#scArticle').innerHTML = `<span class="chest-step">Fiche · ${esc(shelf)}</span><h1>${esc(n.title)}</h1><div class="sc-article__body">${n.html}</div>` +
      (href ? `<a class="chest-btn-2 sc-article__src" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${it.tg ? 'Ouvrir le document dans Telegram' : 'Ouvrir le lien'} ↗</a>` : '');
  }

  // =====================================================================
  //  Cours vidéo
  // =====================================================================
  let vShelf = '';
  async function paintFlyers(root) {
    for (const el of $$('[data-flyer]', root)) {
      const url = await flyerUrl(el.dataset.flyer);
      if (url) { el.style.backgroundImage = `url("${url}")`; el.classList.remove('is-empty'); }
    }
  }
  function renderVideos(shelfId) {
    vShelf = shelfId || '';
    const all = loadVideos();
    $('#vChips').innerHTML = `<button type="button" data-vshelf="" class="${!vShelf ? 'is-active' : ''}">Tous · ${all.length}</button>` +
      D.videoShelves.map((s) => `<button type="button" data-vshelf="${s.id}" class="${vShelf === s.id ? 'is-active' : ''}">${esc(s.title)} · ${all.filter((v) => v.shelf === s.id).length}</button>`).join('');
    $('#vBlurb').textContent = vShelf ? vShelfOf(vShelf).blurb : '';
    const shown = all.filter((v) => !vShelf || v.shelf === vShelf);
    const grid = $('#vGrid');
    if (!shown.length) {
      grid.innerHTML = `<div class="sc-vempty"><span class="sc-vempty__ic">${svg('play')}</span><b>Aucune vidéo ici pour l'instant</b><span>Colle un lien YouTube ou Vimeo et ajoute son flyer.</span><button type="button" class="chest-btn" data-vadd="${vShelf}">+ Ajouter une vidéo</button></div>`;
      return;
    }
    grid.innerHTML = shown.map((v) => {
      const p = parseVideo(v.url);
      const th = ytThumb(p);
      const style = th ? `style="background-image:url('${th}')"` : '';
      const playable = p && p.kind !== 'ext';
      return `<article class="sc-vcard" data-id="${esc(v.id)}">
        <button type="button" class="sc-vthumb ${th || v.flyer ? '' : 'is-empty'}" data-play="${esc(v.id)}" ${v.flyer ? `data-flyer="${esc(v.id)}"` : style} aria-label="${playable ? 'Lire' : 'Ouvrir'} ${esc(v.title)}">
          <span class="sc-video__play">${svg('play')}</span><span class="sc-vbadge">${esc(vShelfOf(v.shelf).title)}${p && p.kind === 'ytlist' ? ' · playlist' : ''}</span>
        </button>
        <div class="sc-vcard__meta"><div><div class="sc-vcard__t">${esc(v.title)}</div>${v.speaker ? `<div class="sc-vcard__c">${esc(v.speaker)}</div>` : ''}</div>
        <div class="sc-vcard__tools"><button type="button" data-vedit="${esc(v.id)}" aria-label="Modifier" title="Modifier">${svg('edit')}</button><button type="button" data-vdel="${esc(v.id)}" aria-label="Retirer" title="Retirer">${svg('trash')}</button></div></div>
      </article>`;
    }).join('');
    paintFlyers(grid);
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
    if (!src) { window.open(v.url, '_blank', 'noopener'); return; }
    openModal(`<button type="button" class="sc-modal__x" data-mclose aria-label="Fermer">${svg('close')}</button>
      <div class="sc-player"><iframe src="${src}" title="${esc(v.title)}" allow="${IFRAME_ALLOW}" allowfullscreen></iframe></div>
      <div class="sc-modal__info"><span class="chest-step">${esc(vShelfOf(v.shelf).title)}${v.speaker ? ' · ' + esc(v.speaker) : ''}</span><h3>${esc(v.title)}</h3>${v.desc ? `<p>${esc(v.desc)}</p>` : ''}<a class="sc-modal__ext" href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">Ouvrir sur ${p.kind === 'vimeo' ? 'Vimeo' : 'YouTube'} ↗</a></div>`);
  }

  let pendingFlyer = null; // Blob choisi dans le formulaire
  let keepFlyer = false;
  function videoForm(v, shelf) {
    pendingFlyer = null;
    keepFlyer = !!(v && v.flyer);
    const cur = v || { shelf: shelf || (D.videoShelves[0] || {}).id };
    openModal(`<button type="button" class="sc-modal__x" data-mclose aria-label="Fermer">${svg('close')}</button>
      <form class="sc-form" id="vForm" autocomplete="off" novalidate>
        <span class="chest-step">${v ? 'Modifier la vidéo' : 'Ajouter une vidéo'}</span>
        <h3>${v ? esc(v.title) : 'Nouvelle vidéo'}</h3>
        <label>Lien de la vidéo<input id="vUrl" type="url" placeholder="https://www.youtube.com/watch?v=…" value="${esc(cur.url || '')}"></label>
        <label>Titre<input id="vTitle" type="text" maxlength="120" placeholder="Ex. Rediffusion — Rank Up 12/08" value="${esc(cur.title || '')}"></label>
        <div class="sc-form__row">
          <label>Rayon<select id="vShelfSel">${D.videoShelves.map((s) => `<option value="${s.id}" ${cur.shelf === s.id ? 'selected' : ''}>${esc(s.title)}</option>`).join('')}</select></label>
          <label>Intervenant (facultatif)<input id="vSpeaker" type="text" maxlength="80" value="${esc(cur.speaker || '')}"></label>
        </div>
        <label>Description (facultatif)<textarea id="vDesc" rows="2" maxlength="400">${esc(cur.desc || '')}</textarea></label>
        <div class="sc-flyer">
          <div class="sc-flyer__prev" id="vFlyerPrev">${svg('image')}</div>
          <div class="sc-flyer__txt"><b>Flyer associé</b><span>Image affichée à la place de la miniature (JPG, PNG, WebP).</span>
            <div class="sc-flyer__btns"><label class="chest-btn-2 sc-flyer__pick">${svg('up')} Choisir un flyer<input id="vFlyer" type="file" accept="image/*" hidden></label><button type="button" class="sc-flyer__rm" id="vFlyerRm" hidden>Retirer</button></div></div>
        </div>
        <div class="sc-form__err" id="vErr"></div>
        <div class="sc-form__foot"><button type="button" class="chest-btn-2" data-mclose>Annuler</button><button type="submit" class="chest-btn">${v ? 'Enregistrer' : 'Ajouter'}</button></div>
      </form>`);
    const prev = $('#vFlyerPrev');
    const rm = $('#vFlyerRm');
    const showPrev = (url) => { prev.style.backgroundImage = url ? `url("${url}")` : ''; prev.classList.toggle('has-img', !!url); rm.hidden = !url; };
    if (keepFlyer) flyerUrl(v.id).then(showPrev);
    $('#vFlyer').addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try { pendingFlyer = await shrinkImage(f, 800); keepFlyer = false; showPrev(URL.createObjectURL(pendingFlyer)); } catch (err) { $('#vErr').textContent = "Cette image n'a pas pu être lue."; }
    });
    rm.addEventListener('click', () => { pendingFlyer = null; keepFlyer = false; $('#vFlyer').value = ''; showPrev(''); });
    $('#vForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = $('#vUrl').value.trim();
      const p = parseVideo(url);
      const err = $('#vErr');
      if (!p) { err.textContent = 'Colle un lien complet (https://…). YouTube et Vimeo se lisent ici, les autres liens s\'ouvrent dans un nouvel onglet.'; return; }
      const list = loadVideos();
      if (list.some((x) => x.url === url && (!v || x.id !== v.id))) { err.textContent = 'Cette vidéo est déjà dans ta bibliothèque.'; return; }
      const rec = Object.assign({}, v || { id: 'v' + Date.now().toString(36), createdAt: Date.now() }, {
        url, title: $('#vTitle').value.trim() || 'Vidéo sans titre', shelf: $('#vShelfSel').value, speaker: $('#vSpeaker').value.trim(), desc: $('#vDesc').value.trim(),
      });
      if (pendingFlyer) { const ok = await flyerDb.put(rec.id, pendingFlyer); rec.flyer = !!ok; delete flyerUrls[rec.id]; }
      else if (!keepFlyer) { if (rec.flyer) { await flyerDb.del(rec.id); delete flyerUrls[rec.id]; } rec.flyer = false; }
      if (v) { const i = list.findIndex((x) => x.id === v.id); list[i] = rec; } else list.unshift(rec);
      saveVideos(list);
      closeModal();
      renderVideos(vShelf);
    });
    $('#vUrl').focus();
  }
  document.addEventListener('click', async (e) => {
    const add = e.target.closest('#vAdd, [data-vadd]');
    if (add) { videoForm(null, add.dataset.vadd || vShelf); return; }
    const chip = e.target.closest('[data-vshelf]');
    if (chip) { go({ v: 'video', s: chip.dataset.vshelf || '' }, { noScroll: true }); return; }
    const pl = e.target.closest('[data-play]');
    if (pl) { playVideo(pl.dataset.play); return; }
    const ed = e.target.closest('[data-vedit]');
    if (ed) { videoForm(loadVideos().find((x) => x.id === ed.dataset.vedit)); return; }
    const del = e.target.closest('[data-vdel]');
    if (del) {
      const ok = window.CHESTConfirm ? await window.CHESTConfirm('Retirer cette vidéo de ta bibliothèque ?', { confirmLabel: 'Retirer' }) : true;
      if (!ok) return;
      const id = del.dataset.vdel;
      saveVideos(loadVideos().filter((x) => x.id !== id));
      flyerDb.del(id); delete flyerUrls[id];
      renderVideos(vShelf);
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
    loadVideos().forEach((v) => out.push({ type: 'video', id: v.id, title: v.title, hay: norm(v.title + ' ' + (v.speaker || '') + ' ' + (v.desc || '')), label: `Vidéo · ${vShelfOf(v.shelf).title}`, kind: 'video' }));
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
      if (r.dataset.rtype === 'video') { go({ v: 'video' }); setTimeout(() => playVideo(r.dataset.rid), 60); return; }
      const it = itemById(r.dataset.rid);
      if (!it) return;
      if (it.kind === 'course') { go({ v: 'course', c: it.course }); return; }
      if (it.note) { go({ v: 'note', n: it.note }); return; }
      go({ v: 'written', s: it.shelf });
      setTimeout(() => { const el = $(`.sc-tile[data-id="${it.id}"]`); if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('is-flash'); setTimeout(() => el.classList.remove('is-flash'), 1800); } }, 80);
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
    const done = checks.filter((c) => c.checked).length;
    if (!statusEl) return;
    const all = done === checks.length && checks.length > 0;
    statusEl.classList.toggle('is-ok', all);
    statusEl.textContent = all ? 'Toutes les cases sont cochées — le trade est autorisé' : `${done} / ${checks.length} cases cochées — sinon, pas de trade`;
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
