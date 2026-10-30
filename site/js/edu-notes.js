// CHEST — Notes de l'éducateur (2026-10-30). Une note personnelle par membre, que lui seul voit (ni le membre, ni les
// autres éducateurs). Chaque nouveau membre arrive avec sa note vide. Enregistrement automatique pendant la frappe.
// Données : GET /edu/notes (admin : ?educator=ID, lecture seule), PUT /edu/notes/<id>. CHESTEduNotes.open(id) ouvre
// la note d'un membre (bouton « Ma note » de la fiche).
(() => {
  'use strict';
  const A = window.CHESTAccounts;
  const box = document.getElementById('edNotes');
  if (!A || !box) return;
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initials = (n) => String(n || '?').split(/\s+/).map((w) => w[0] || '').join('').slice(0, 2).toUpperCase();
  const day = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const when = (iso) => {
    const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (m < 1) return 'à l’instant';
    if (m < 60) return `il y a ${m} min`;
    const d = new Date(iso), today = new Date().toDateString() === d.toDateString();
    return today ? `aujourd’hui à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : `le ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;
  };
  const preview = new URLSearchParams(location.search).get('educator');
  const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z"/></svg>';
  const SEARCH = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>';
  const S = { notes: [], sel: null, q: '', readOnly: false, timer: null, dirty: false, saving: null };

  async function api(path, opts) {
    const res = await fetch(A.apiBase() + path, Object.assign({ headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + A.getToken() } }, opts));
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || 'Service indisponible pour le moment.');
    return d;
  }
  const cur = () => S.notes.find((n) => n.id === S.sel) || null;
  const firstLine = (t) => String(t || '').split('\n').map((l) => l.trim()).find(Boolean) || '';

  function item(n) {
    const empty = !n.body.trim();
    return `<li><button type="button" class="en-item${n.id === S.sel ? ' is-on' : ''}" data-note="${n.id}" aria-current="${n.id === S.sel}">
      <span class="en-av">${esc(initials(n.name))}</span>
      <span class="en-item__m"><b>${esc(n.name)}</b><small>${empty ? '<i class="en-new">Nouvelle note</i>' : esc(firstLine(n.body))}</small></span>
      <time>${n.updatedAt ? esc(day(n.updatedAt)) : esc(day(n.joinedAt))}</time></button></li>`;
  }
  function renderList() {
    const q = S.q.toLowerCase();
    const list = S.notes.filter((n) => !q || n.name.toLowerCase().includes(q) || n.body.toLowerCase().includes(q));
    const todo = S.notes.filter((n) => !n.body.trim()).length;
    box.querySelector('.en-list__n').textContent = `${S.notes.length} membre${S.notes.length > 1 ? 's' : ''}${todo ? ` · ${todo} note${todo > 1 ? 's' : ''} à écrire` : ''}`;
    box.querySelector('.en-list ul').innerHTML = list.length ? list.map(item).join('') : `<li class="en-none">${q ? 'Aucun membre ne correspond.' : ''}</li>`;
  }
  function renderEditor() {
    const n = cur(), ed = box.querySelector('.en-ed');
    if (!n) { ed.innerHTML = '<div class="en-empty"><b>Choisis un membre</b>Sa note s’ouvre ici.</div>'; return; }
    const chip = window.CHESTRank && n.planKey && n.planKey !== 'none' ? CHESTRank.chip(n.planKey, n.level, null, n.active) : '';
    ed.innerHTML = `<header class="en-ed__h">
        <button type="button" class="en-back" data-en-back aria-label="Retour à la liste">←</button>
        <span class="en-av en-av--lg">${esc(initials(n.name))}</span>
        <div class="en-ed__who"><h3>${esc(n.name)}</h3><span>${chip}<small>membre depuis le ${esc(new Date(n.joinedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }))}</small></span></div>
        <button type="button" class="chest-btn-2 en-ed__sheet" data-member="${n.id}">Sa fiche</button>
      </header>
      <textarea id="enBody" class="en-ed__t" spellcheck="true" ${S.readOnly ? 'readonly' : ''} aria-label="Ta note sur ${esc(n.first)}"
        placeholder="Ce que tu retiens de ${esc(n.first)} : son objectif, ses points forts, ce qu’il doit travailler, ce qui s’est dit lors de vos échanges…">${esc(n.body)}</textarea>
      <footer class="en-ed__f"><span class="en-lock">${LOCK}${S.readOnly ? 'Lecture seule (aperçu admin)' : 'Visible seulement par toi'}</span><span id="enStatus" class="en-status">${n.updatedAt ? `Enregistrée ${esc(when(n.updatedAt))}` : 'Pas encore écrite'}</span></footer>`;
    const t = document.getElementById('enBody');
    t.addEventListener('input', () => { cur().body = t.value; S.dirty = true; status('Modifications…', 'is-busy'); clearTimeout(S.timer); S.timer = setTimeout(save, 800); });
    t.addEventListener('blur', () => { if (S.dirty) save(); });
  }
  function status(txt, cls) { const s = document.getElementById('enStatus'); if (s) { s.textContent = txt; s.className = 'en-status ' + (cls || ''); } }

  async function save() {
    clearTimeout(S.timer);
    const n = cur();
    if (!n || !S.dirty || S.readOnly) return;
    S.dirty = false;
    const body = n.body, id = n.id;
    status('Enregistrement…', 'is-busy');
    S.saving = api(`/edu/notes/${id}`, { method: 'PUT', body: JSON.stringify({ body }) })
      .then((d) => { const x = S.notes.find((m) => m.id === id); if (x) x.updatedAt = d.updatedAt; if (S.sel === id) status(`Enregistrée ${when(d.updatedAt)}`, 'is-ok'); renderList(); })
      .catch((e) => { S.dirty = true; if (S.sel === id) status(e.message + ' — nouvel essai à la prochaine frappe', 'is-err'); });
    return S.saving;
  }
  async function select(id) {
    if (S.dirty) await save();
    S.sel = id;
    box.classList.add('is-open');
    renderList(); renderEditor();
  }

  function shell() {
    box.innerHTML = `<aside class="en-list">
        <label class="en-search">${SEARCH}<input type="search" id="enSearch" placeholder="Chercher un membre ou un mot" aria-label="Chercher dans tes notes" autocomplete="off"></label>
        <div class="en-list__n"></div><ul role="list"></ul></aside>
      <article class="en-ed"></article>`;
    box.querySelector('#enSearch').addEventListener('input', (e) => { S.q = e.target.value.trim(); renderList(); });
  }

  async function load(openId) {
    try {
      const d = await api('/edu/notes' + (preview ? `?educator=${encodeURIComponent(preview)}` : ''));
      S.notes = d.notes; S.readOnly = !!d.readOnly;
    } catch (e) { box.innerHTML = `<p class="ed-error">${esc(e.message)}</p>`; return; }
    const c = document.getElementById('edNotesCount');
    if (c) c.textContent = S.notes.length ? String(S.notes.length) : '';
    if (!S.notes.length) { box.innerHTML = '<div class="en-empty en-empty--full"><b>Pas encore de membre</b>Chaque membre qui s’inscrit avec ton lien arrive ici avec sa note.</div>'; return; }
    shell();
    S.sel = openId || S.sel || (window.matchMedia('(max-width:760px)').matches ? null : S.notes[0].id);
    renderList(); renderEditor();
  }

  box.addEventListener('click', (e) => {
    const it = e.target.closest('[data-note]');
    if (it) { select(Number(it.dataset.note)); return; }
    if (e.target.closest('[data-en-back]')) { if (S.dirty) save(); box.classList.remove('is-open'); }
  });
  // Rien ne se perd en quittant la page en pleine frappe.
  window.addEventListener('pagehide', () => {
    const n = cur();
    if (!n || !S.dirty || S.readOnly) return;
    fetch(A.apiBase() + `/edu/notes/${n.id}`, { method: 'PUT', keepalive: true, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + A.getToken() }, body: JSON.stringify({ body: n.body }) });
  });

  window.CHESTEduNotes = { open: (id) => (S.notes.length ? select(Number(id)) : load(Number(id))), reload: () => load() };
  load();
})();
