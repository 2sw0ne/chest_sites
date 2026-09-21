// CHEST · School — l'école : accueil (nouveautés), cours écrits (4 catégories), cours vidéo (Mindset / Business en affiches), lecteur de cours et de fiches.
// Catalogue de base : js/school-data.js (window.CHEST_SCHOOL). Contenu ajouté par l'admin : enregistré sur le serveur de comptes
// (accounts-bridge, table school_entries + fichiers), donc visible par TOUS les membres ; seul l'admin peut ajouter, modifier ou retirer.
(() => {
  'use strict';

  const D = window.CHEST_SCHOOL || { shelves: [], items: [], notes: {}, videoSections: [], videoCats: [], videoSeed: [], videoPending: [] };
  const CHECK_KEY = 'chest_school_vvs_check';
  const CACHE_KEY = 'chest_school_cache';
  const A = window.CHESTAccounts;

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
  const KIND = { course: 'Cours', note: 'Fiche', pdf: 'PDF', image: 'Image', link: 'Lien', sheet: 'Tableur', folder: 'Dossier', file: 'Fichier' };
  const KICON = { course: 'course', note: 'note', pdf: 'pdf', image: 'image', link: 'link', sheet: 'sheet', folder: 'folder', file: 'pdf' };

  // =====================================================================
  //  Serveur (comptes) : lecture pour tous, écriture pour l'admin
  // =====================================================================
  const API = () => (window.CHEST_CONFIG && window.CHEST_CONFIG.accountsApiUrl) || 'http://localhost:8080';
  const isAdmin = () => !!(A && A.isAdmin && A.isAdmin());
  const authH = () => { const t = A && A.getToken && A.getToken(); return t ? { Authorization: 'Bearer ' + t } : {}; };
  const fileUrl = (info) => (info && info.key ? `${API()}/school/files/${info.key}` : '');
  const R = { entries: [], ok: false };

  async function api(path, opts) {
    let res;
    try { res = await fetch(API() + path, Object.assign({ headers: authH() }, opts || {})); } catch (e) { throw new Error('Impossible de contacter le serveur de comptes.'); }
    let data = {};
    try { data = await res.json(); } catch (e) { /* vide */ }
    if (!res.ok) throw new Error(data.error || `Erreur (${res.status})`);
    return data;
  }
  function postForm(path, form, onProgress) {
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open('POST', API() + path);
      const h = authH();
      if (h.Authorization) x.setRequestHeader('Authorization', h.Authorization);
      if (onProgress) x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
      x.onload = () => {
        let d = {};
        try { d = JSON.parse(x.responseText); } catch (e) { /* vide */ }
        if (x.status < 300) resolve(d); else reject(new Error(d.error || `Erreur (${x.status})`));
      };
      x.onerror = () => reject(new Error('Impossible de contacter le serveur de comptes.'));
      x.send(form);
    });
  }
  function seedEntries() {
    const t0 = '1970-01-01T00:00:00+00:00';
    return D.videoSeed.map((v) => Object.assign({ kind: 'video', createdAt: t0 }, v))
      .concat(D.videoPending.map((v) => Object.assign({ kind: 'video', createdAt: t0 }, v)));
  }
  async function loadRemote() {
    try {
      let d = await api('/school');
      if (!d.seeded && isAdmin()) { await api('/school/seed', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, authH()), body: JSON.stringify({ entries: seedEntries() }) }); d = await api('/school'); }
      R.entries = d.entries; R.ok = true;
      store.set(CACHE_KEY, d.entries);
    } catch (e) {
      R.entries = store.get(CACHE_KEY, []); R.ok = false;
    }
    const n = $('#scNotice');
    if (n) { n.hidden = R.ok; if (!R.ok) n.textContent = 'Serveur de comptes injoignable : tu vois la dernière copie du contenu, en lecture seule.'; }
  }
  function upsert(entry) {
    const i = R.entries.findIndex((e) => e.id === entry.id);
    if (i >= 0) R.entries[i] = entry; else R.entries.unshift(entry);
    store.set(CACHE_KEY, R.entries);
  }
  async function saveEntry(data, files, onProgress) {
    const fd = new FormData();
    fd.append('data', JSON.stringify(data));
    if (files && files.file) fd.append('file', files.file, files.file.name || 'fichier');
    if (files && files.thumb) fd.append('thumb', files.thumb, 'miniature.jpg');
    const e = await postForm('/school/entries', fd, onProgress);
    upsert(e);
    return e;
  }
  async function removeEntry(id) {
    await api(`/school/entries/${encodeURIComponent(id)}/delete`, { method: 'POST' });
    R.entries = R.entries.filter((e) => e.id !== id);
    store.set(CACHE_KEY, R.entries);
  }
  const guardAdmin = () => { if (!R.ok) { window.CHESTAlert ? window.CHESTAlert('Serveur de comptes injoignable : impossible de modifier le contenu pour le moment.') : alert('Serveur injoignable'); return false; } return true; };

  // =====================================================================
  //  Éléments écrits : base statique + éléments/retouches de l'admin
  // =====================================================================
  const shelfOf = (id) => D.shelves.find((s) => s.id === id) || { id, title: id, blurb: '', icon: 'folder', tone: 'blue' };
  const sectionOf = (id) => D.videoSections.find((s) => s.id === id) || { id, title: id, blurb: '', icon: 'play' };
  const rankOf = (it) => (it.added ? Date.parse(it.added) / 1000 : it.rank || 0);
  const ago = (ms) => {
    const d = Math.floor((Date.now() - ms) / 86400000);
    return d <= 0 ? "Aujourd'hui" : d === 1 ? 'Hier' : d < 30 ? `Il y a ${d} jours` : new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const fmtSize = (n) => (n >= 1048576 ? (n / 1048576).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' Mo' : Math.max(1, Math.round(n / 1024)) + ' Ko');
  const textToHtml = (t) => String(t || '').split(/\n{2,}/).map((p) => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');

  function prepRemote(e) {
    const it = Object.assign({}, e);
    delete it.kind; delete it.createdAt;
    if (e.itype) it.kind = e.itype;
    if (e.createdAt && Date.parse(e.createdAt) > 0) it.added = e.createdAt;
    return it;
  }
  const needsFile = (it) => !!it.tg && !it.file && !it.url && !it.note && !it.text && it.kind !== 'course';
  function allItems() {
    const remote = new Map(R.entries.filter((e) => e.kind === 'item').map((e) => [e.id, e]));
    const out = [];
    D.items.forEach((base) => {
      const ov = remote.get(base.id);
      if (!ov) { out.push(Object.assign({}, base)); return; }
      remote.delete(base.id);
      if (ov.hidden) return;
      out.push(Object.assign({}, base, prepRemote(ov)));
    });
    remote.forEach((e) => { if (!e.hidden) out.push(Object.assign({ kind: 'file' }, prepRemote(e))); });
    return out;
  }
  // Ce que voit l'utilisateur : les documents dont le fichier n'est pas encore déposé n'apparaissent que pour l'admin.
  const visibleItems = () => allItems().filter((it) => isAdmin() || !needsFile(it));
  const itemById = (id) => allItems().find((i) => i.id === id);
  const hrefOf = (it) => (it.file ? fileUrl(it.file) : it.url || '');
  const noteKey = (it) => (it.text ? it.id : it.note || '');
  function getNote(key) {
    if (D.notes[key]) return { title: D.notes[key].title, html: D.notes[key].html };
    const it = allItems().find((i) => i.text && i.id === key);
    return it ? { title: it.title, html: textToHtml(it.text) } : null;
  }
  const metaOf = (it) => it.meta || (it.file ? `${KIND[it.kind] || 'Fichier'} · ${fmtSize(it.file.size)}` : '');

  // =====================================================================
  //  Vidéos
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

  const videoTs = (v) => (v.createdAt ? Date.parse(v.createdAt) || 0 : 0);
  const loadVideos = () => R.entries.filter((e) => e.kind === 'video').map((e) => Object.assign({}, e, { ts: videoTs(e) }));
  const allCats = () => D.videoCats.concat(R.entries.filter((e) => e.kind === 'cat').map((e) => e.name).filter((c) => c && !D.videoCats.includes(c)));
  const done = (v) => !v.pending && (v.url || v.file);
  const thumbUrl = (v) => (v.thumb ? fileUrl(v.thumb) : ytThumb(v.url ? parseVideo(v.url) : null));

  // Miniatures : réduction, et image par défaut (première image d'une vidéo, ou l'image elle-même)
  async function shrinkImage(file, maxW) {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, maxW / bmp.width);
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/jpeg', 0.86));
  }
  function frameOf(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const v = document.createElement('video');
      v.muted = true; v.preload = 'auto'; v.playsInline = true; v.src = url;
      const end = (blob) => { URL.revokeObjectURL(url); resolve(blob || null); };
      const t = setTimeout(() => end(null), 12000);
      v.addEventListener('error', () => { clearTimeout(t); end(null); });
      v.addEventListener('loadeddata', () => { try { v.currentTime = Math.min(2, (v.duration || 4) / 4); } catch (e) { clearTimeout(t); end(null); } });
      v.addEventListener('seeked', () => {
        clearTimeout(t);
        try {
          const k = Math.min(1, 720 / v.videoWidth);
          const c = document.createElement('canvas');
          c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
          c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
          c.toBlob((b) => end(b), 'image/jpeg', 0.85);
        } catch (e) { end(null); }
      });
    });
  }
  async function defaultThumb(file) {
    if (!file) return null;
    try {
      if ((file.type || '').startsWith('image/')) return await shrinkImage(file, 720);
      if ((file.type || '').startsWith('video/')) return await frameOf(file);
    } catch (e) { /* pas de miniature par défaut */ }
    return null;
  }
  const durationOf = (file) => new Promise((resolve) => {
    if (!file || !(file.type || '').startsWith('video/')) { resolve(''); return; }
    const url = URL.createObjectURL(file); const v = document.createElement('video'); v.preload = 'metadata'; v.src = url;
    const fin = (val) => { URL.revokeObjectURL(url); resolve(val); };
    v.onloadedmetadata = () => { const s = Math.round(v.duration || 0); fin(s ? `${s >= 3600 ? Math.floor(s / 3600) + ':' : ''}${String(Math.floor((s % 3600) / 60)).padStart(s >= 3600 ? 2 : 1, '0')}:${String(s % 60).padStart(2, '0')}` : ''); };
    v.onerror = () => fin('');
    setTimeout(() => fin(''), 6000);
  });

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
    if (q.get('n') && getNote(q.get('n'))) return { v: 'note', n: q.get('n') };
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
      const list = [home];
      if (!st.s) list.push({ label: 'Cours vidéo' });
      else { list.push({ label: 'Cours vidéo', st: { v: 'video' } }); list.push(st.k ? { label: sectionOf(st.s).title, st: { v: 'video', s: st.s } } : { label: sectionOf(st.s).title }); if (st.k) list.push({ label: st.k }); }
      setCrumbs(list);
      renderVideos(st.s, st.k);
    }
    if (st.v === 'course') {
      const it = allItems().find((i) => i.course === st.c);
      const shelf = it ? shelfOf(it.shelf) : null;
      setCrumbs([home, { label: 'Cours écrits', st: { v: 'written' } }, shelf ? { label: shelf.title, st: { v: 'written', s: shelf.id } } : null, { label: COURSES[st.c] }].filter(Boolean));
      renderCourse(st.c, st.ch, opts);
    }
    if (st.v === 'note') {
      const it = allItems().find((i) => noteKey(i) === st.n);
      const shelf = it ? shelfOf(it.shelf) : null;
      setCrumbs([home, { label: 'Cours écrits', st: { v: 'written' } }, shelf ? { label: shelf.title, st: { v: 'written', s: shelf.id } } : null, { label: getNote(st.n).title }].filter(Boolean));
      renderNote(st.n);
    }
    if (!opts.noScroll && !(st.v === 'course' && st.ch)) window.scrollTo(0, 0);
  }
  const rerender = () => render(parseUrl(), { noScroll: true });

  // =====================================================================
  //  Cartes communes
  // =====================================================================
  function coverOf(it) {
    const th = it.thumb ? fileUrl(it.thumb) : it.cover;
    if (th) return `<span class="sc-ctile__cover" style="background-image:url('${th}')"></span>`;
    const sh = shelfOf(it.shelf);
    return `<span class="sc-ctile__cover is-gen tone-${sh.tone}">${svg(it.kind === 'course' ? sh.icon : KICON[it.kind] || 'folder', 'sc-ctile__gen')}</span>`;
  }
  const itemTools = (it) => (isAdmin() && it.kind !== 'course'
    ? `<span class="sc-ctile__tools"><span role="button" tabindex="0" data-iedit="${esc(it.id)}" title="Modifier">${svg('edit')}</span><span role="button" tabindex="0" data-idel="${esc(it.id)}" title="Retirer">${svg('trash')}</span></span>` : '');
  function elTile(it) {
    const href = hrefOf(it);
    const nk = noteKey(it);
    const isCourse = it.kind === 'course';
    const pending = needsFile(it);
    const action = pending ? 'Ajouter le fichier →' : isCourse ? 'Ouvrir le cours →' : nk ? 'Lire la fiche →' : it.file ? 'Ouvrir le fichier ↗' : 'Ouvrir le lien ↗';
    const inner = `${coverOf(it)}${itemTools(it)}<span class="sc-ctile__body"><span class="sc-ctile__k">${esc(KIND[it.kind] || '')}${pending ? ' · <em>fichier à ajouter (visible par toi seul)</em>' : ''}</span>
      <span class="sc-ctile__t">${esc(it.title)}</span><span class="sc-ctile__d">${esc(it.desc)}</span>
      <span class="sc-ctile__m">${esc(pending ? '' : metaOf(it))}<b>${action}</b></span></span>`;
    const cls = `sc-ctile${pending ? ' is-pending' : ''}`;
    if (pending) return `<div class="${cls}" role="button" tabindex="0" data-iedit="${esc(it.id)}" data-id="${esc(it.id)}">${inner}</div>`;
    if (isCourse) return `<div class="${cls}" role="button" tabindex="0" data-course="${it.course}" data-id="${esc(it.id)}">${inner}</div>`;
    if (nk) return `<div class="${cls}" role="button" tabindex="0" data-note="${esc(nk)}" data-id="${esc(it.id)}">${inner}</div>`;
    return `<div class="${cls}" data-id="${esc(it.id)}"><a class="sc-ctile__link" href="${esc(href)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(it.title)}"></a>${inner}</div>`;
  }
  function catTile(s, count, label, st) {
    return `<div class="sc-ctile sc-ctile--cat" role="button" tabindex="0" data-st='${esc(JSON.stringify(st))}'>
      <span class="sc-ctile__cover is-gen tone-${s.tone || 'pink'}">${svg(s.icon, 'sc-ctile__gen')}</span>
      <span class="sc-ctile__body"><span class="sc-ctile__k">${esc(label)}</span><span class="sc-ctile__t">${esc(s.title)}</span><span class="sc-ctile__d">${esc(s.blurb)}</span>
      <span class="sc-ctile__m">${count}<b>Ouvrir →</b></span></span></div>`;
  }
  document.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[role=button]')) { e.preventDefault(); e.target.click(); } });
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-iedit], [data-idel]') && !e.target.closest('.sc-ctile__tools') && !e.target.matches('.sc-ctile.is-pending, .sc-ctile.is-pending *')) return;
    const t = e.target.closest('[data-st]:not(.sc-crumb)');
    if (t) { try { go(JSON.parse(t.dataset.st)); } catch (err) { /* ignore */ } return; }
    const door = e.target.closest('[data-go]');
    if (door) { go({ v: door.dataset.go }); return; }
    const sh = e.target.closest('[data-shelf]');
    if (sh) { go({ v: 'written', s: sh.dataset.shelf || '' }); return; }
    const co = e.target.closest('[data-course]');
    if (co && !e.target.closest('.sc-ctile__tools')) { go({ v: 'course', c: co.dataset.course }); return; }
    const nt = e.target.closest('[data-note]');
    if (nt && !e.target.closest('.sc-ctile__tools')) { go({ v: 'note', n: nt.dataset.note }); }
  });

  // =====================================================================
  //  Accueil : portes, nouveautés, raccourcis
  // =====================================================================
  function newsList() {
    const out = visibleItems().map((it) => ({ rank: rankOf(it), it }));
    loadVideos().filter((v) => done(v) && v.ts > 0).forEach((v) => out.push({ rank: v.ts / 1000, v }));
    return out.sort((a, b) => b.rank - a.rank).slice(0, 9);
  }
  function newsCard(n) {
    if (n.v) {
      const v = n.v; const th = thumbUrl(v);
      return `<button type="button" class="sc-news__card" data-play="${esc(v.id)}"><span class="sc-news__img ${th ? '' : 'is-empty'}" ${th ? `style="background-image:url('${th}')"` : ''}>${svg('play', 'sc-news__ic')}<span class="sc-news__new">Nouveau</span></span>
        <span class="sc-news__t">${esc(v.title)}</span><span class="sc-news__m">Vidéo · ${esc(v.section === 'mindset' ? 'Mindset' : v.cat || 'Business')} · ${ago(v.ts)}</span></button>`;
    }
    const it = n.it; const sh = shelfOf(it.shelf);
    const fresh = it.added && (Date.now() / 1000 - Date.parse(it.added) / 1000) < 14 * 86400;
    const nk = noteKey(it);
    const attrs = it.kind === 'course' ? `data-course="${it.course}"` : nk ? `data-note="${esc(nk)}"` : '';
    const open = attrs ? `<button type="button" class="sc-news__card" ${attrs}>` : `<a class="sc-news__card" href="${esc(hrefOf(it))}" target="_blank" rel="noopener noreferrer">`;
    const close = attrs ? '</button>' : '</a>';
    const th = it.thumb ? fileUrl(it.thumb) : it.cover;
    return `${open}<span class="sc-news__img ${th ? '' : 'is-gen tone-' + sh.tone}" ${th ? `style="background-image:url('${th}')"` : ''}>${th ? '' : svg(it.kind === 'course' ? sh.icon : KICON[it.kind] || 'folder', 'sc-news__ic')}${fresh ? '<span class="sc-news__new">Nouveau</span>' : ''}</span>
      <span class="sc-news__t">${esc(it.title)}</span><span class="sc-news__m">${esc(KIND[it.kind] || '')} · ${esc(sh.title)}${it.added ? ' · ' + ago(Date.parse(it.added)) : ''}</span>${close}`;
  }
  function renderHome() {
    const videos = loadVideos();
    const nDone = videos.filter(done).length;
    const nPending = isAdmin() ? videos.filter((v) => !done(v)).length : 0;
    const items = visibleItems();
    $('#doorWritten').textContent = `${D.shelves.length} catégories · ${items.length} cours, fiches et documents`;
    $('#doorVideo').textContent = `${nDone} vidéo${nDone > 1 ? 's' : ''}${nPending ? ` · ${nPending} rediffusions à compléter` : ''}`;
    const start = `<div class="sc-news__start"><span class="chest-label">Commence ici</span><button type="button" class="sc-video" data-src="https://www.youtube.com/watch?v=et552Md8yzo" data-title="À regarder avant de commencer" aria-label="Lire la vidéo d'introduction"><span class="sc-video__play">${svg('play')}</span><span class="sc-video__cap">À regarder avant de commencer</span></button></div>`;
    $('#scNews').innerHTML = start + newsList().map(newsCard).join('');
    const tiles = D.shelves.map((s) => ({ s, n: items.filter((i) => i.shelf === s.id).length, st: { v: 'written', s: s.id }, k: 'Cours écrits', unit: 'élément' }))
      .concat(D.videoSections.map((s) => ({ s: Object.assign({ tone: s.id === 'mindset' ? 'pink' : 'amber' }, s), n: videos.filter((v) => v.section === s.id && done(v)).length, st: { v: 'video', s: s.id }, k: 'Cours vidéo', unit: 'vidéo' })));
    $('#scShelfTiles').innerHTML = tiles.map((t) => `<button type="button" class="sc-shelf-tile" data-st='${esc(JSON.stringify(t.st))}'><span class="sc-shelf-tile__ic">${svg(t.s.icon)}</span><span class="sc-shelf-tile__k">${t.k}</span><span class="sc-shelf-tile__t">${esc(t.s.title)}</span><span class="sc-shelf-tile__n">${t.n} ${t.unit}${t.n > 1 ? 's' : ''}</span></button>`).join('');
    initLite(views.home);
  }

  // =====================================================================
  //  Cours écrits
  // =====================================================================
  function renderWritten(shelfId) {
    const head = { step: $('#wStep'), title: $('#wTitle'), blurb: $('#wBlurb'), chips: $('#wChips'), body: $('#wBody') };
    const items = visibleItems();
    $('#wAdd').hidden = !isAdmin();
    if (!shelfId) {
      head.step.textContent = '01 — École'; head.title.textContent = 'Cours écrits';
      head.blurb.textContent = 'Choisis une catégorie : chacune rassemble ses cours, ses fiches et ses documents.';
      head.chips.hidden = true;
      head.body.innerHTML = `<div class="sc-catgrid">${D.shelves.map((s) => { const n = items.filter((i) => i.shelf === s.id).length; return catTile(s, `${n} élément${n > 1 ? 's' : ''}`, 'Catégorie', { v: 'written', s: s.id }); }).join('')}</div>`;
      return;
    }
    const s = shelfOf(shelfId);
    head.step.textContent = 'Cours écrits'; head.title.textContent = s.title; head.blurb.textContent = s.blurb;
    head.chips.hidden = false;
    head.chips.innerHTML = D.shelves.map((x) => `<button type="button" data-shelf="${x.id}" class="${x.id === shelfId ? 'is-active' : ''}">${esc(x.title)}</button>`).join('');
    const its = items.filter((i) => i.shelf === shelfId);
    if (!its.length) { head.body.innerHTML = `<div class="sc-vempty"><span class="sc-vempty__ic">${svg('folder')}</span><b>Rien ici pour l'instant</b><span>De nouveaux éléments arrivent bientôt.</span>${isAdmin() ? `<button type="button" class="chest-btn" data-iadd="${shelfId}">+ Ajouter un élément</button>` : ''}</div>`; return; }
    const groups = [];
    its.forEach((i) => { const g = i.sub || ''; let grp = groups.find((x) => x.g === g); if (!grp) { grp = { g, list: [] }; groups.push(grp); } grp.list.push(i); });
    head.body.innerHTML = groups.map((g) => `${g.g ? `<h2 class="sc-group">${esc(g.g)} <small>${g.list.length}</small></h2>` : ''}<div class="sc-tiles">${g.list.map(elTile).join('')}</div>`).join('');
  }

  // =====================================================================
  //  Lecteur de cours et fiches
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

  function renderNote(key) {
    const n = getNote(key);
    const it = allItems().find((i) => noteKey(i) === key);
    const href = it && it.file ? fileUrl(it.file) : it && it.url ? it.url : '';
    const shelf = it ? shelfOf(it.shelf).title : '';
    $('#scArticle').innerHTML = `<span class="chest-step">Fiche · ${esc(shelf)}</span><h1>${esc(n.title)}</h1><div class="sc-article__body">${n.html}</div>` +
      (href ? `<a class="chest-btn-2 sc-article__src" href="${esc(href)}" target="_blank" rel="noopener noreferrer">Ouvrir le fichier ↗</a>` : '');
  }

  // =====================================================================
  //  Cours vidéo : Mindset (16:9) et Business (affiches 9:16 par catégorie)
  // =====================================================================
  function renderVideos(section, cat) {
    const head = { step: $('#vhStep'), title: $('#vhTitle'), blurb: $('#vhBlurb') };
    const doors = $('#vDoors'); const bar = $('#vBar'); const body = $('#vBody');
    const admin = isAdmin();
    const all = loadVideos();
    $('#vAdd').hidden = !admin;
    if (!section) {
      head.step.textContent = '02 — École'; head.title.textContent = 'Cours vidéo';
      head.blurb.textContent = 'Mindset pour s\'inspirer, Business pour revoir toutes les rediffusions, rangées par catégorie.';
      bar.hidden = true; body.innerHTML = '';
      doors.hidden = false;
      doors.innerHTML = D.videoSections.map((s, i) => {
        const list = all.filter((v) => v.section === s.id);
        const n = list.filter(done).length; const p = admin ? list.length - n : 0;
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
        (admin ? '<button type="button" class="sc-chip-add" id="vAddCat">+ Catégorie</button>' : '');
    } else { chips.hidden = true; chips.innerHTML = ''; }
    const shown = mine.filter((v) => done(v) && (section !== 'business' || !cat || v.cat === cat)).sort((a, b) => b.ts - a.ts);
    const pend = admin ? mine.filter((v) => !done(v) && (!cat || v.cat === cat)) : [];
    let html = '';
    if (!shown.length) {
      html += `<div class="sc-vempty"><span class="sc-vempty__ic">${svg('play')}</span><b>Aucune vidéo ici pour l'instant</b><span>${admin ? 'Ajoute un lien ou un fichier vidéo.' : 'De nouvelles vidéos arrivent bientôt.'}</span>${admin ? `<button type="button" class="chest-btn" data-vadd="${section}|${esc(cat || '')}">+ Ajouter une vidéo</button>` : ''}</div>`;
    } else if (section === 'business') {
      html += `<div class="sc-posters">${shown.map(posterCard).join('')}</div>`;
    } else {
      html += `<div class="sc-vgrid">${shown.map(wideCard).join('')}</div>`;
    }
    if (pend.length) {
      html += `<details class="sc-pending"><summary><span>À compléter · ${pend.length}</span><small>Visible par toi seul : ajoute le lien ou le fichier de chaque rediffusion</small></summary><div class="sc-pending__list">${pend.map((v) => `<div class="sc-prow"><span class="sc-prow__t">${esc(v.title)}</span><span class="sc-prow__d">${svg('clock')}${esc(v.duration || '')}</span><span class="sc-prow__c">${esc(v.cat || '')}</span><button type="button" class="chest-btn-2" data-vedit="${esc(v.id)}">Ajouter la vidéo</button></div>`).join('')}</div></details>`;
    }
    body.innerHTML = html;
  }
  const vtools = (v) => (isAdmin() ? `<div class="sc-vcard__tools"><button type="button" data-vthumb="${esc(v.id)}" aria-label="Changer la miniature" title="Changer la miniature">${svg('image')}</button><button type="button" data-vedit="${esc(v.id)}" aria-label="Modifier" title="Modifier">${svg('edit')}</button><button type="button" data-vdel="${esc(v.id)}" aria-label="Retirer" title="Retirer">${svg('trash')}</button></div>` : '');
  function posterCard(v) {
    const th = thumbUrl(v);
    return `<article class="sc-poster" data-id="${esc(v.id)}">
      <button type="button" class="sc-poster__img ${th ? '' : 'is-empty'}" data-play="${esc(v.id)}" ${th ? `style="background-image:url('${th}')"` : ''} aria-label="Lire ${esc(v.title)}">
        ${th ? '' : `<span class="sc-poster__ph">${esc(v.title)}</span>`}
        <span class="sc-poster__cat">${esc(v.cat || '')}</span>${v.duration ? `<span class="sc-poster__dur">${esc(v.duration)}</span>` : ''}
        <span class="sc-video__play">${svg('play')}</span></button>
      <div class="sc-poster__meta"><div class="sc-poster__t">${esc(v.title)}</div>${vtools(v)}</div></article>`;
  }
  function wideCard(v) {
    const p = v.url ? parseVideo(v.url) : null;
    const th = thumbUrl(v);
    return `<article class="sc-vcard" data-id="${esc(v.id)}">
      <button type="button" class="sc-vthumb ${th ? '' : 'is-empty'}" data-play="${esc(v.id)}" ${th ? `style="background-image:url('${th}')"` : ''} aria-label="Lire ${esc(v.title)}">
        <span class="sc-video__play">${svg('play')}</span><span class="sc-vbadge">${esc(sectionOf(v.section).title)}${p && p.kind === 'ytlist' ? ' · playlist' : ''}</span></button>
      <div class="sc-vcard__meta"><div><div class="sc-vcard__t">${esc(v.title)}</div>${v.speaker ? `<div class="sc-vcard__c">${esc(v.speaker)}</div>` : ''}</div>${vtools(v)}</div></article>`;
  }

  // ---------- Fenêtre (lecteur / formulaires) ----------
  const modal = $('#scModal');
  const modalPanel = $('#scModalPanel');
  function openModal(html) { modalPanel.innerHTML = html; modal.hidden = false; }
  function closeModal() { modal.hidden = true; modalPanel.innerHTML = ''; }
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-mclose]')) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!modal.hidden) closeModal(); const lb = $('#scLightbox'); if (!lb.hidden) lb.hidden = true; } });

  function playVideo(id) {
    const v = loadVideos().find((x) => x.id === id);
    if (!v) return;
    const p = v.url ? parseVideo(v.url) : null;
    const src = p && embedSrc(p);
    if (!src && !v.file) { if (v.url) window.open(v.url, '_blank', 'noopener'); return; }
    const player = v.file
      ? `<video controls autoplay playsinline src="${fileUrl(v.file)}" ${thumbUrl(v) ? `poster="${esc(thumbUrl(v))}"` : ''}></video>`
      : `<iframe src="${src}" title="${esc(v.title)}" allow="${IFRAME_ALLOW}" allowfullscreen></iframe>`;
    openModal(`<button type="button" class="sc-modal__x" data-mclose aria-label="Fermer">${svg('close')}</button>
      <div class="sc-player">${player}</div>
      <div class="sc-modal__info"><span class="chest-step">${esc(sectionOf(v.section).title)}${v.cat ? ' · ' + esc(v.cat) : ''}${v.speaker ? ' · ' + esc(v.speaker) : ''}</span><h3>${esc(v.title)}</h3>${v.desc ? `<p>${esc(v.desc)}</p>` : ''}${v.file ? '' : `<a class="sc-modal__ext" href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">Ouvrir sur ${p && p.kind === 'vimeo' ? 'Vimeo' : 'YouTube'} ↗</a>`}</div>`);
  }

  // Miniature seule (bouton de la carte)
  function pickThumb(id) {
    if (!guardAdmin()) return;
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      try { await saveEntry({ id, kind: 'video' }, { thumb: await shrinkImage(f, 720) }); rerender(); } catch (e) { window.CHESTAlert && window.CHESTAlert(e.message); }
    });
    inp.click();
  }

  // ---------- Zone de miniature (fichier ou Ctrl+V) et barre de progression ----------
  function thumbBlock(current) {
    return `<div class="sc-flyer">
      <div class="sc-flyer__prev" id="fPrev">${svg('image')}</div>
      <div class="sc-flyer__txt"><b>Miniature (facultative)</b><span>Sans miniature, une est créée automatiquement. Choisis un fichier ou colle l'image avec Ctrl+V.</span>
        <div class="sc-flyer__btns"><label class="chest-btn-2 sc-flyer__pick">${svg('up')} Choisir une miniature<input id="fThumb" type="file" accept="image/*" hidden></label><button type="button" class="sc-flyer__rm" id="fThumbRm" hidden>Retirer</button></div></div>
    </div>`;
  }
  function wireThumb(existing) {
    const st = { blob: null, keep: !!existing, remove: false };
    const prev = $('#fPrev'); const rm = $('#fThumbRm');
    const show = (url) => { prev.style.backgroundImage = url ? `url("${url}")` : ''; prev.classList.toggle('has-img', !!url); rm.hidden = !url; };
    if (existing) show(fileUrl(existing));
    const set = async (file) => { try { st.blob = await shrinkImage(file, 720); st.keep = false; st.remove = false; show(URL.createObjectURL(st.blob)); } catch (e) { /* ignore */ } };
    $('#fThumb').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; if (f) set(f); });
    modalPanel.addEventListener('paste', (e) => { const f = e.clipboardData && Array.from(e.clipboardData.files || []).find((x) => x.type.startsWith('image/')); if (f) { e.preventDefault(); set(f); } });
    rm.addEventListener('click', () => { st.blob = null; st.keep = false; st.remove = !!existing; $('#fThumb').value = ''; show(''); });
    return st;
  }
  const progressHtml = '<div class="sc-progress" id="fProg" hidden><div class="sc-progress__bar"><i id="fProgBar"></i></div><span id="fProgTxt">Envoi…</span></div>';
  const setProgress = (p) => { const el = $('#fProg'); if (!el) return; el.hidden = false; $('#fProgBar').style.width = Math.round(p * 100) + '%'; $('#fProgTxt').textContent = p >= 1 ? 'Enregistrement…' : `Envoi… ${Math.round(p * 100)} %`; };

  // ---------- Formulaire vidéo (admin) ----------
  function videoForm(v, defaults) {
    if (!guardAdmin()) return;
    defaults = defaults || {};
    const cur = v || { section: defaults.section || 'business', cat: defaults.cat || allCats()[0] };
    const cats = allCats();
    openModal(`<button type="button" class="sc-modal__x" data-mclose aria-label="Fermer">${svg('close')}</button>
      <form class="sc-form" id="vForm" autocomplete="off" novalidate>
        <span class="chest-step">${v ? (v.pending ? 'Compléter la rediffusion' : 'Modifier la vidéo') : 'Ajouter une vidéo'}</span>
        <h3>${v ? esc(v.title) : 'Nouvelle vidéo'}</h3>
        <label>Lien YouTube ou Vimeo<input id="vUrl" type="url" placeholder="https://www.youtube.com/watch?v=…" value="${esc(cur.url || '')}"></label>
        <label>… ou fichier vidéo${cur.file ? ` <em class="sc-form__cur">(actuel : ${esc(cur.file.name)})</em>` : ''}<input id="vFile" type="file" accept="video/*,.mp4,.mov,.mkv,.webm"></label>
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
        ${thumbBlock()}
        ${progressHtml}
        <div class="sc-form__err" id="fErr"></div>
        <div class="sc-form__foot"><button type="button" class="chest-btn-2" data-mclose>Annuler</button><button type="submit" class="chest-btn" id="fSubmit">${v && !v.pending ? 'Enregistrer' : 'Ajouter'}</button></div>
      </form>`);
    const thumb = wireThumb(cur.thumb);
    const reflect = () => { const biz = $('#vSection').value === 'business'; $('#vCatWrap').hidden = !biz; $('#vNewCatWrap').hidden = !(biz && $('#vCat').value === '__new'); };
    $('#vSection').addEventListener('change', reflect);
    $('#vCat').addEventListener('change', () => { reflect(); if ($('#vCat').value === '__new') $('#vNewCat').focus(); });
    reflect();
    $('#vForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#fErr');
      const url = $('#vUrl').value.trim();
      const file = $('#vFile').files && $('#vFile').files[0];
      if (url && !parseVideo(url)) { err.textContent = 'Colle un lien complet (https://…).'; return; }
      const hasSource = url || file || (v && v.file);
      if (!hasSource && !(v && v.pending)) { err.textContent = 'Colle un lien ou choisis un fichier vidéo.'; return; }
      if (url && loadVideos().some((x) => x.url === url && (!v || x.id !== v.id))) { err.textContent = 'Cette vidéo est déjà dans la bibliothèque.'; return; }
      const section = $('#vSection').value;
      let category = '';
      $('#fSubmit').disabled = true;
      try {
        if (section === 'business') {
          category = $('#vCat').value;
          if (category === '__new') {
            const name = $('#vNewCat').value.trim();
            if (!name) { err.textContent = 'Donne un nom à la nouvelle catégorie.'; $('#fSubmit').disabled = false; return; }
            const known = allCats().find((c) => norm(c) === norm(name));
            if (known) category = known; else { await saveEntry({ id: 'cat-' + norm(name).replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '-' + Date.now().toString(36), kind: 'cat', name }); category = name; }
          }
        }
        let tblob = thumb.blob;
        if (!tblob && !thumb.keep && !thumb.remove && file) tblob = await defaultThumb(file);
        const dur = $('#vDur').value.trim() || (file ? await durationOf(file) : '');
        const data = { kind: 'video', section, cat: category, title: $('#vTitle').value.trim() || (file ? file.name.replace(/\.[^.]+$/, '') : 'Vidéo sans titre'), speaker: $('#vSpeaker').value.trim(), desc: $('#vDesc').value.trim(), duration: dur, url, pending: !hasSource };
        if (v) data.id = v.id;
        if (thumb.remove && !tblob) data.removeThumb = true;
        if (url && v && v.file && !file) data.removeFile = true;
        await saveEntry(data, { file, thumb: tblob }, setProgress);
        closeModal();
        const st = parseUrl();
        if (st.v === 'video') go({ v: 'video', s: section, k: section === 'business' ? category : '' }, { replace: true, noScroll: true }); else rerender();
      } catch (ex) { err.textContent = ex.message; $('#fSubmit').disabled = false; const pg = $('#fProg'); if (pg) pg.hidden = true; }
    });
    $('#vUrl').focus();
  }

  // ---------- Formulaire élément écrit (admin) ----------
  function itemForm(it, defaults) {
    if (!guardAdmin()) return;
    defaults = defaults || {};
    const cur = it || { shelf: defaults.shelf || 'trading', kind: 'file' };
    const subs = Array.from(new Set(allItems().map((i) => i.sub).filter(Boolean)));
    const mode0 = cur.text ? 'text' : cur.url && !cur.file ? 'link' : 'file';
    openModal(`<button type="button" class="sc-modal__x" data-mclose aria-label="Fermer">${svg('close')}</button>
      <form class="sc-form" id="iForm" autocomplete="off" novalidate>
        <span class="chest-step">${it ? (needsFile(it) ? 'Ajouter le fichier' : 'Modifier l\'élément') : 'Ajouter un élément'}</span>
        <h3>${it ? esc(it.title) : 'Nouvel élément'}</h3>
        <div class="chest-seg sc-typeseg" id="iMode"><button type="button" data-mode="file" class="${mode0 === 'file' ? 'is-active' : ''}">Fichier</button><button type="button" data-mode="link" class="${mode0 === 'link' ? 'is-active' : ''}">Lien</button><button type="button" data-mode="text" class="${mode0 === 'text' ? 'is-active' : ''}">Fiche (texte)</button></div>
        <label id="iFileWrap">Fichier${cur.file ? ` <em class="sc-form__cur">(actuel : ${esc(cur.file.name)})</em>` : ''}<input id="iFile" type="file"></label>
        <label id="iUrlWrap" hidden>Lien<input id="iUrl" type="url" placeholder="https://…" value="${esc(cur.url || '')}"></label>
        <label id="iTextWrap" hidden>Texte de la fiche<textarea id="iText" rows="7" placeholder="Écris ta fiche ici. Une ligne vide sépare les paragraphes.">${esc(cur.text || '')}</textarea></label>
        <label>Titre<input id="iTitle" type="text" maxlength="140" value="${esc(cur.title || '')}"></label>
        <label>Description (facultatif)<textarea id="iDesc" rows="2" maxlength="300">${esc(cur.desc || '')}</textarea></label>
        <div class="sc-form__row">
          <label>Catégorie<select id="iShelf">${D.shelves.map((s) => `<option value="${s.id}" ${cur.shelf === s.id ? 'selected' : ''}>${esc(s.title)}</option>`).join('')}</select></label>
          <label id="iSubWrap">Groupe (facultatif)<input id="iSub" type="text" maxlength="60" list="iSubList" placeholder="Ex. Flyers & présentations" value="${esc(cur.sub || '')}"><datalist id="iSubList">${subs.map((x) => `<option value="${esc(x)}">`).join('')}</datalist></label>
        </div>
        ${thumbBlock()}
        ${progressHtml}
        <div class="sc-form__err" id="fErr"></div>
        <div class="sc-form__foot"><button type="button" class="chest-btn-2" data-mclose>Annuler</button><button type="submit" class="chest-btn" id="fSubmit">${it && !needsFile(it) ? 'Enregistrer' : 'Ajouter'}</button></div>
      </form>`);
    const thumb = wireThumb(cur.thumb);
    let mode = mode0;
    const reflect = () => {
      $$('#iMode button').forEach((b) => b.classList.toggle('is-active', b.dataset.mode === mode));
      $('#iFileWrap').hidden = mode !== 'file'; $('#iUrlWrap').hidden = mode !== 'link'; $('#iTextWrap').hidden = mode !== 'text';
      $('#iSubWrap').hidden = $('#iShelf').value !== 'other';
    };
    $$('#iMode button').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.mode; reflect(); }));
    $('#iShelf').addEventListener('change', reflect);
    $('#iFile').addEventListener('change', () => { const f = $('#iFile').files[0]; if (f && !$('#iTitle').value.trim()) $('#iTitle').value = f.name.replace(/\.[^.]+$/, ''); });
    reflect();
    $('#iForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#fErr');
      const title = $('#iTitle').value.trim();
      const file = mode === 'file' ? $('#iFile').files[0] : null;
      const url = mode === 'link' ? $('#iUrl').value.trim() : '';
      const text = mode === 'text' ? $('#iText').value.trim() : '';
      if (!title) { err.textContent = 'Donne un titre.'; return; }
      if (mode === 'file' && !file && !(cur.file && it)) { err.textContent = 'Choisis un fichier.'; return; }
      if (mode === 'link' && !/^https?:\/\//i.test(url)) { err.textContent = 'Colle un lien complet (https://…).'; return; }
      if (mode === 'text' && !text) { err.textContent = 'Écris le texte de la fiche.'; return; }
      $('#fSubmit').disabled = true;
      try {
        const mime = file ? file.type || '' : '';
        const name = file ? file.name.toLowerCase() : '';
        const itype = mode === 'text' ? 'note' : mode === 'link' ? (/docs\.google\.com\/spreadsheets/.test(url) ? 'sheet' : 'link')
          : mime.startsWith('image/') ? 'image' : /pdf/.test(mime) || name.endsWith('.pdf') ? 'pdf' : /\.(xlsx?|csv|ods)$/.test(name) ? 'sheet' : cur.file && !file ? cur.kind : 'file';
        let tblob = thumb.blob;
        if (!tblob && !thumb.keep && !thumb.remove && file) tblob = await defaultThumb(file);
        const shelf = $('#iShelf').value;
        const data = { kind: 'item', itype, shelf, sub: shelf === 'other' ? $('#iSub').value.trim() : '', title, desc: $('#iDesc').value.trim(), url, text };
        if (it) data.id = it.id;
        if (it && mode !== 'file' && cur.file) data.removeFile = true;
        if (thumb.remove && !tblob) data.removeThumb = true;
        if (file) data.meta = '';
        await saveEntry(data, { file, thumb: tblob }, setProgress);
        closeModal();
        rerender();
      } catch (ex) { err.textContent = ex.message; $('#fSubmit').disabled = false; const pg = $('#fProg'); if (pg) pg.hidden = true; }
    });
    $('#iTitle').focus();
  }

  async function deleteItem(id) {
    if (!guardAdmin()) return;
    const it = allItems().find((i) => i.id === id);
    const ok = window.CHESTConfirm ? await window.CHESTConfirm('Retirer cet élément de School pour tout le monde ?', { confirmLabel: 'Retirer' }) : true;
    if (!ok || !it) return;
    try {
      if (D.items.some((b) => b.id === id)) await saveEntry({ id, kind: 'item', hidden: true }, null);
      else await removeEntry(id);
      rerender();
    } catch (e) { window.CHESTAlert && window.CHESTAlert(e.message); }
  }

  document.addEventListener('click', async (e) => {
    const iadd = e.target.closest('#wAdd, [data-iadd]');
    if (iadd) { itemForm(null, { shelf: iadd.dataset.iadd || parseUrl().s || 'trading' }); return; }
    const iedit = e.target.closest('[data-iedit]');
    if (iedit) { e.preventDefault(); e.stopPropagation(); itemForm(allItems().find((x) => x.id === iedit.dataset.iedit)); return; }
    const idel = e.target.closest('[data-idel]');
    if (idel) { e.preventDefault(); e.stopPropagation(); deleteItem(idel.dataset.idel); return; }
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
      if (!guardAdmin()) return;
      openModal(`<button type="button" class="sc-modal__x" data-mclose aria-label="Fermer">${svg('close')}</button><form class="sc-form" id="catForm"><span class="chest-step">Business</span><h3>Nouvelle catégorie</h3>
        <label>Nom<input id="catName" type="text" maxlength="40" placeholder="Ex. Immobilier"></label><div class="sc-form__foot"><button type="button" class="chest-btn-2" data-mclose>Annuler</button><button type="submit" class="chest-btn">Créer</button></div></form>`);
      $('#catName').focus();
      $('#catForm').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const name = $('#catName').value.trim();
        if (!name) return;
        try {
          const known = allCats().find((c) => norm(c) === norm(name));
          if (!known) await saveEntry({ id: 'cat-' + norm(name).replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '-' + Date.now().toString(36), kind: 'cat', name });
          closeModal(); go({ v: 'video', s: 'business', k: known || name }, { noScroll: true });
        } catch (ex) { window.CHESTAlert && window.CHESTAlert(ex.message); }
      });
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
      if (!guardAdmin()) return;
      const ok = window.CHESTConfirm ? await window.CHESTConfirm('Retirer cette vidéo de School pour tout le monde ?', { confirmLabel: 'Retirer' }) : true;
      if (!ok) return;
      try { await removeEntry(del.dataset.vdel); rerender(); } catch (ex) { window.CHESTAlert && window.CHESTAlert(ex.message); }
    }
  });

  // =====================================================================
  //  Recherche
  // =====================================================================
  const searchIn = $('#scSearch');
  const resultsEl = $('#scResults');
  function searchIndex() {
    const out = [];
    visibleItems().forEach((i) => out.push({ type: 'item', id: i.id, title: i.title, hay: norm(i.title + ' ' + (i.desc || '')), label: `Cours écrits · ${shelfOf(i.shelf).title}`, kind: i.kind }));
    loadVideos().filter(done).forEach((v) => out.push({ type: 'video', id: v.id, title: v.title, hay: norm(v.title + ' ' + (v.speaker || '') + ' ' + (v.desc || '')), label: `Vidéo · ${sectionOf(v.section).title}${v.cat ? ' · ' + v.cat : ''}`, kind: 'video' }));
    return out;
  }
  function runSearch() {
    const q = norm(searchIn.value.trim());
    if (q.length < 2) { resultsEl.hidden = true; return; }
    const terms = q.split(/\s+/);
    const hits = searchIndex().filter((r) => terms.every((t) => r.hay.includes(t))).slice(0, 8);
    resultsEl.innerHTML = hits.length
      ? hits.map((h) => `<button type="button" class="sc-result" data-rtype="${h.type}" data-rid="${esc(h.id)}"><span class="sc-result__ic">${svg(h.kind === 'video' ? 'play' : KICON[h.kind] || 'folder')}</span><span><b>${esc(h.title)}</b><small>${esc(h.label)}</small></span></button>`).join('')
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
      if (noteKey(it)) { go({ v: 'note', n: noteKey(it) }); return; }
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
  (async () => {
    initLite(document);
    await loadRemote();
    const first = parseUrl();
    history.replaceState(first, '', location.href);
    render(first, { noScroll: true, instant: true });
  })();
})();
