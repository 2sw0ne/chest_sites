// CHEST — School à trois échelles (2026-10-28).
//   Membre     : la semaine (appels collectifs et personnels, avec flyer et horaire), les infos, son suivi
//                (missions à cocher, notes de son éducateur), puis ses cours (portes, nouveautés, étagères de js/school.js).
//   Éducateur  : Planning de ses élèves, Élèves (js/mentor-hub.js), Infos & missions ; il pose un appel ou une mission
//                chez un élève ou chez tous ses élèves, et une info pour eux.
//   Admin      : Planning complet, Membres (tous), Éducateurs, Infos & missions, Contenu des cours ; il vise tout le
//                monde, les membres, l'équipe, les élèves de certains éducateurs ou un seul membre.
// Données (accounts-bridge) : GET /school/agenda, GET/POST /school/posts, POST /school/events, POST /school/missions,
// GET /school/missions, /mentor (suivi personnel), /mentor/students, /mentor/educators.
(() => {
  'use strict';
  const A = window.CHESTAccounts;
  const root = document.getElementById('scHub');
  if (!A || !root) return;
  const U = A.getUser() || {};
  const ROLE = U.isAdmin ? 'admin' : U.role === 'educator' ? 'educator' : 'member';

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DAY = 86400000;
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fr = (d, o) => new Date(d).toLocaleDateString('fr-FR', o);
  const hm = (d) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const dur = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${pad(m % 60)}` : ''}`);
  const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
  const initials = (n) => String(n || '?').split(/\s+/).map((w) => w[0] || '').join('').slice(0, 2).toUpperCase();
  const textToHtml = (t) => String(t || '').split(/\n{2,}/).map((p) => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
  const fileUrl = (f) => (f && f.key ? `${A.apiBase()}/school/files/${encodeURIComponent(f.key)}` : '');
  const mondayOf = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  const sameDay = (a, b) => ymd(new Date(a)) === ymd(new Date(b));
  const relDay = (d) => {
    const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / DAY);
    return days === 0 ? "Aujourd'hui" : days === 1 ? 'Demain' : days === -1 ? 'Hier' : fr(d, { weekday: 'long', day: 'numeric', month: 'long' });
  };
  const MODES = { visio: 'Visio', telephone: 'Téléphone', presentiel: 'Présentiel' };
  const P = {
    cal: 'M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M9 3v4M15 3v4',
    users: 'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 19v-1a4 4 0 0 0-3-3.9M15.5 3.1a3.5 3.5 0 0 1 0 6.8',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20c1-3.5 4-5.5 7.5-5.5s6.5 2 7.5 5.5',
    flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
    info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
    pin: 'M9 4h6l-1 6 4 3H6l4-3zM12 13v7',
    check: 'M5 12.5l4.2 4.2L19 7',
    left: 'M15 6l-6 6 6 6', right: 'M9 6l6 6-6 6',
    plus: 'M12 5v14M5 12h14',
    image: 'M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15 9h.01',
    book: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5V5.5zM8 7h8M8 11h6',
    play: 'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM10.5 9.5v5l4.2-2.5z',
    note: 'M5 4h14v16H5zM9 8h6M9 12h6M9 16h3',
    go: 'M5 12h14M13 6l6 6-6 6',
  };
  const ic = (n, cls) => `<svg class="sh-ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="${P[n]}"/></svg>`;

  // ---------------------------------------------------------------- serveur
  async function api(path, opts) {
    const res = await fetch(A.apiBase() + path, Object.assign({}, opts, { headers: Object.assign({ Authorization: 'Bearer ' + A.getToken() }, (opts && opts.headers) || {}) }));
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || 'Le serveur ne répond pas pour le moment.');
    return d;
  }
  const postJson = (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const postForm = (path, data, files) => {
    const fd = new FormData();
    fd.append('data', JSON.stringify(data));
    Object.entries(files || {}).forEach(([k, f]) => { if (f) fd.append(k, f, f.name); });
    return api(path, { method: 'POST', body: fd });
  };

  const S = {
    week: mondayOf(new Date()), agenda: null, posts: [], missions: [], mentor: null, people: null, educators: null,
    tab: null, member: null, // filtre éducateur/admin : un seul élève dans le planning
  };

  // ---------------------------------------------------------------- planning de la semaine
  async function loadAgenda() {
    const from = S.week, to = new Date(from.getTime() + 7 * DAY);
    const q = `?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}${S.member ? `&member=${S.member}` : ''}`;
    S.agenda = await api('/school/agenda' + q);
  }

  function kindOf(e) {
    if (e.type === 'personal') return { k: 'perso', label: e.common ? 'Commun' : 'Perso' };
    if (e.audience === 'educators') return { k: 'team', label: 'Équipe' };
    return { k: 'group', label: 'Collectif' };
  }

  function evCard(e) {
    const k = kindOf(e);
    const ended = Date.parse(e.startsAt) + e.minutes * 60000 < Date.now();
    const who = ROLE !== 'member' && e.type === 'personal' && e.member ? `<span class="sh-ev__who">${ic('user')}${esc(e.member)}</span>` : '';
    const ask = e.status === 'proposed' ? '<span class="sh-ev__ask">à confirmer</span>' : '';
    return `<button type="button" class="sh-ev sh-ev--${k.k}${ended ? ' is-past' : ''}" data-ev="${esc(e.id)}">
      ${e.flyer ? `<span class="sh-ev__fly"><img src="${esc(fileUrl(e.flyer))}" alt="" loading="lazy"></span>` : ''}
      <span class="sh-ev__body"><span class="sh-ev__t"><b>${hm(e.startsAt)}</b><span>${dur(e.minutes)}</span><em>${k.label}</em></span>
      <span class="sh-ev__title">${esc(e.title)}</span>${who}${ask}</span></button>`;
  }
  function taskChip(t) {
    const late = !t.doneAt && t.dueAt && Date.parse(t.dueAt) < Date.now();
    if (t.group) {
      // équipe : une mission de groupe = une seule ligne, avec l'avancement
      const done = t.group.filter((x) => x.doneAt).length, n = t.group.length;
      const all = done === n, lateAny = t.dueAt && Date.parse(t.dueAt) < Date.now() && !all;
      return `<div class="sh-due${all ? ' is-done' : ''}${lateAny ? ' is-late' : ''}">${ic(all ? 'check' : 'flag')}<span><b>${esc(t.title)}</b><small>${done}/${n} faites · ${plural(n, 'membre', 'membres')}</small></span></div>`;
    }
    const who = ROLE !== 'member' && t.member ? ` · ${esc(t.member)}` : '';
    return `<div class="sh-due${t.doneAt ? ' is-done' : ''}${late ? ' is-late' : ''}">${ic(t.doneAt ? 'check' : 'flag')}<span><b>${esc(t.title)}</b><small>${t.doneAt ? 'faite' : late ? 'en retard' : 'à rendre'}${who}</small></span></div>`;
  }
  function groupTasks(list) {
    if (ROLE === 'member') return list;
    const out = [], seen = new Map();
    list.forEach((t) => {
      if (!t.common) return out.push(t);
      const k = `${t.title}|${t.dueAt}`;
      if (!seen.has(k)) { const g = Object.assign({}, t, { group: [] }); seen.set(k, g); out.push(g); }
      seen.get(k).group.push(t);
    });
    return out.map((t) => (t.group && t.group.length === 1 ? t.group[0] : t));
  }

  function weekHtml() {
    const D = S.agenda || { events: [], tasks: [] };
    const days = Array.from({ length: 7 }, (_, i) => new Date(S.week.getTime() + i * DAY));
    const end = new Date(S.week.getTime() + 6 * DAY);
    const thisWeek = sameDay(S.week, mondayOf(new Date()));
    const range = `${fr(S.week, { day: 'numeric', month: S.week.getMonth() === end.getMonth() ? undefined : 'short' })} – ${fr(end, { day: 'numeric', month: 'long' })}`;
    const total = D.events.length;
    const cols = days.map((d) => {
      const evs = D.events.filter((e) => sameDay(e.startsAt, d));
      const due = groupTasks(D.tasks.filter((t) => t.dueAt && sameDay(t.dueAt, d)));
      const today = sameDay(d, new Date());
      const past = d < new Date(new Date().setHours(0, 0, 0, 0));
      return `<div class="sh-day${today ? ' is-today' : ''}${past ? ' is-past' : ''}${evs.length || due.length ? '' : ' is-empty'}">
        <div class="sh-day__h"><span>${fr(d, { weekday: 'short' }).replace('.', '')}</span><b>${d.getDate()}</b>${today ? '<i>Aujourd’hui</i>' : ''}</div>
        <div class="sh-day__list">${evs.map(evCard).join('')}${due.map(taskChip).join('')}${evs.length || due.length ? '' : '<span class="sh-day__none">—</span>'}</div>
      </div>`;
    }).join('');
    const undated = ROLE === 'member' ? D.tasks.filter((t) => !t.doneAt && (!t.dueAt || Date.parse(t.dueAt) < S.week.getTime())) : [];
    const filter = ROLE !== 'member' && S.people ? `<label class="sh-filter"><span class="sr-only">Afficher</span><select id="shWho">
        <option value="">${ROLE === 'admin' ? 'Tout le monde' : 'Tous mes élèves'}</option>
        ${S.people.map((p) => `<option value="${p.id}" ${String(S.member) === String(p.id) ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>` : '';
    return `<div class="sh-week">
      <div class="sh-week__bar">
        <div class="sh-week__nav">
          <button type="button" class="sh-ib" data-week="-1" aria-label="Semaine précédente">${ic('left')}</button>
          <div class="sh-week__t"><b>${thisWeek ? 'Cette semaine' : `Semaine du ${fr(S.week, { day: 'numeric', month: 'long' })}`}</b><span>${esc(range)} · ${plural(total, 'rendez-vous', 'rendez-vous')}</span></div>
          <button type="button" class="sh-ib" data-week="1" aria-label="Semaine suivante">${ic('right')}</button>
          ${thisWeek ? '' : '<button type="button" class="sh-link" data-week="0">Revenir à aujourd’hui</button>'}
        </div>
        <div class="sh-week__tools">${filter}${ROLE !== 'member' ? `<button type="button" class="chest-btn" data-compose="event">${ic('plus')}Ajouter</button>` : ''}</div>
      </div>
      <div class="sh-days">${cols}</div>
      ${undated.length ? `<div class="sh-undated"><span class="chest-step">Toujours à faire</span>${undated.map(taskChip).join('')}</div>` : ''}
      <div class="sh-legend"><span class="sh-lg sh-lg--group">Collectif</span><span class="sh-lg sh-lg--perso">Personnel</span>${ROLE !== 'member' ? '<span class="sh-lg sh-lg--team">Équipe</span>' : ''}<span class="sh-lg sh-lg--due">Mission à rendre</span></div>
    </div>`;
  }

  // ---------------------------------------------------------------- infos
  function postCard(p, opts) {
    const o = opts || {};
    const staff = ROLE !== 'member';
    return `<article class="sh-post${p.pinned ? ' is-pinned' : ''}${p.image ? ' has-img' : ''}">
      <button type="button" class="sh-post__open" data-post="${p.id}" aria-label="Lire « ${esc(p.title)} »"></button>
      ${p.image ? `<span class="sh-post__img"><img src="${esc(fileUrl(p.image))}" alt="" loading="lazy"></span>` : ''}
      <div class="sh-post__body">
        <div class="sh-post__meta">${p.pinned ? `<span class="sh-pin">${ic('pin')}Épinglé</span>` : ''}${staff ? `<span class="sh-aud">${esc(p.audienceLabel)}</span>` : ''}<span>${esc(p.author)} · ${fr(p.createdAt, { day: 'numeric', month: 'short' })}</span></div>
        <h3>${esc(p.title)}</h3>
        ${o.short ? '' : `<p>${esc(p.body.slice(0, 220))}${p.body.length > 220 ? '…' : ''}</p>`}
      </div></article>`;
  }
  const postsHtml = (list, empty) => (list.length ? `<div class="sh-posts">${list.map((p) => postCard(p)).join('')}</div>` : `<p class="sh-empty">${empty}</p>`);

  // ---------------------------------------------------------------- suivi du membre (missions + notes)
  function memberSuiviHtml() {
    const M = S.mentor;
    if (!M) return '';
    const tasks = (M.tasks || []);
    const todo = tasks.filter((t) => !t.doneAt), done = tasks.length - todo.length;
    const notes = (M.notes || []).slice(0, 3);
    if (!M.educator && !tasks.length && !notes.length) return '';
    const next = (M.events || []).filter((e) => (e.status === 'confirmed' || e.status === 'proposed') && Date.parse(e.startsAt) + e.minutes * 60000 >= Date.now())
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0];
    const taskLi = (t) => {
      const late = !t.doneAt && t.dueAt && Date.parse(t.dueAt) < Date.now();
      return `<li class="sh-task${t.doneAt ? ' is-done' : ''}"><button type="button" class="sh-check" data-task="${t.id}" role="checkbox" aria-checked="${!!t.doneAt}" aria-label="${esc(t.title)}">${ic('check')}</button>
        <span><b>${esc(t.title)}</b>${t.dueAt ? `<small class="${late ? 'is-late' : ''}">${late ? 'en retard · ' : 'pour '}${fr(t.dueAt, { weekday: 'short', day: 'numeric', month: 'short' })}</small>` : ''}</span></li>`;
    };
    return `<div class="sh-suivi">
      <div class="sh-suivi__col">
        <div class="sh-suivi__h"><span class="chest-step">Missions</span>${tasks.length ? `<span class="sh-count">${done}/${tasks.length}</span>` : ''}</div>
        ${tasks.length ? `<div class="sh-bar"><i style="transform:scaleX(${(done / tasks.length).toFixed(3)})"></i></div><ul class="sh-tasks">${todo.concat(tasks.filter((t) => t.doneAt)).slice(0, 6).map(taskLi).join('')}</ul>`
          : `<p class="sh-empty">Rien à faire pour l’instant.${M.educator ? ` ${esc(M.educator.first)} ajoutera ici ce qu’il faut préparer.` : ''}</p>`}
      </div>
      <div class="sh-suivi__col">
        <div class="sh-suivi__h"><span class="chest-step">Notes</span>${(M.notes || []).length ? `<span class="sh-count">${M.notes.length}</span>` : ''}</div>
        ${notes.length ? `<ul class="sh-notes">${notes.map((n) => `<li><button type="button" data-note-read="${n.id}">${ic('note')}<span><b>${esc(n.title || 'Note')}</b><small>${esc(n.author)} · ${fr(n.createdAt, { day: 'numeric', month: 'short' })}</small><em>${esc(n.body.slice(0, 110))}${n.body.length > 110 ? '…' : ''}</em></span></button></li>`).join('')}</ul>`
          : '<p class="sh-empty">Les notes de vos appels apparaîtront ici.</p>'}
      </div>
      <a class="sh-suivi__cta" href="suivi.html" data-suivi>
        <span class="sh-pair"><span class="sh-av">${esc(initials(M.member.name))}</span><i></i><span class="sh-av sh-av--edu">${esc(M.educator ? initials(M.educator.name) : '?')}</span></span>
        <span><b>${M.educator ? `Ton espace avec ${esc(M.educator.first)}` : 'Ton espace'}</b><small>${next ? `Prochain appel ${esc(relDay(next.startsAt).toLowerCase())} à ${hm(next.startsAt)}${next.status === 'proposed' ? ' · à confirmer' : ''}` : 'Appels, notes et ressources partagées'}</small></span>
        <span class="sh-go">Ouvrir ${ic('go')}</span></a>
    </div>`;
  }

  // ---------------------------------------------------------------- rendus par rôle
  const section = (n, title, sub, body, id) => `<section class="sh-sec"${id ? ` id="${id}"` : ''}><div class="sh-sec__h"><span class="chest-step">${pad(n)} — ${title}</span>${sub ? `<p>${sub}</p>` : ''}</div>${body}</section>`;

  function renderMember() {
    let n = 0;
    const posts = S.posts;
    const parts = [section(++n, 'Cette semaine', 'Les lives et les appels prévus, avec leur flyer et leur horaire.', weekHtml())];
    if (posts.length) parts.push(section(++n, 'Infos', '', postsHtml(posts.slice(0, 6), '')));
    const sv = memberSuiviHtml();
    if (sv) parts.push(section(++n, 'Ton suivi', '', sv));
    root.innerHTML = parts.join('');
    // les rubriques de cours (js/school.js) continuent la numérotation
    document.querySelectorAll('[data-sc-num]').forEach((el) => { el.textContent = `${pad(++n)} — ${el.dataset.scNum}`; });
  }

  const TABS = {
    educator: [['planning', 'Planning'], ['people', 'Élèves'], ['infos', 'Infos & missions']],
    admin: [['planning', 'Planning'], ['people', 'Membres'], ['educators', 'Éducateurs'], ['infos', 'Infos & missions'], ['content', 'Contenu des cours']],
  };

  function staffFacts() {
    const D = S.agenda || { events: [], tasks: [] };
    const now = Date.now();
    const upcoming = D.events.filter((e) => Date.parse(e.startsAt) >= now).length;
    const asks = D.events.filter((e) => e.status === 'proposed').length;
    const late = D.tasks.filter((t) => !t.doneAt && t.dueAt && Date.parse(t.dueAt) < now).length;
    const people = S.people ? S.people.length : 0;
    const f = [[people, ROLE === 'admin' ? (people > 1 ? 'membres' : 'membre') : (people > 1 ? 'élèves' : 'élève')], [upcoming, 'à venir cette semaine'], [asks, asks > 1 ? 'appels à confirmer' : 'appel à confirmer', asks ? 'ask' : ''], [late, late > 1 ? 'missions en retard' : 'mission en retard', late ? 'late' : '']];
    return `<div class="sh-facts">${f.map(([v, l, c]) => `<span class="${c ? 'is-' + c : ''}"><b>${v}</b>${l}</span>`).join('')}</div>`;
  }

  function renderStaff() {
    const tabs = TABS[ROLE];
    if (!S.tab) { try { S.tab = localStorage.getItem('chest_school_tab_' + ROLE); } catch (e) { /* tant pis */ } }
    if (!tabs.some(([k]) => k === S.tab)) S.tab = 'planning';
    const head = ROLE === 'admin'
      ? ['School · Admin', 'Toute l’école', 'Le planning de chacun, les membres et leurs éducateurs, et ce que tu publies : pour tout le monde, les membres ou l’équipe.']
      : ['School · Éducateur', 'Tes élèves', 'Leur semaine, leurs missions et leurs notes. Pose un appel ou une mission chez un élève, ou chez tous.'];
    root.innerHTML = `<header class="sh-head"><div><div class="chest-step">${head[0]}</div><h1>${head[1]}</h1><p>${head[2]}</p></div>
        <div class="sh-head__acts"><button type="button" class="chest-btn-2" data-compose="post">${ic('info')}Info</button><button type="button" class="chest-btn-2" data-compose="task">${ic('flag')}Mission</button><button type="button" class="chest-btn" data-compose="event">${ic('cal')}Appel</button></div></header>
      ${staffFacts()}
      <nav class="sh-tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${S.tab === k}">${l}</button>`).join('')}</nav>
      <div class="sh-panel" id="shPanel"></div>`;
    renderTab();
  }

  async function renderTab() {
    const box = document.getElementById('shPanel');
    if (!box) return;
    try { localStorage.setItem('chest_school_tab_' + ROLE, S.tab); } catch (e) { /* tant pis */ }
    if (S.tab === 'planning') { box.innerHTML = weekHtml(); return; }
    if (S.tab === 'people') {
      box.innerHTML = '<div id="shPeople"></div>';
      if (window.CHESTMentorHub) await CHESTMentorHub.render(document.getElementById('shPeople'), { compact: true });
      return;
    }
    if (S.tab === 'educators') { box.innerHTML = educatorsHtml(); return; }
    if (S.tab === 'infos') { box.innerHTML = infosHtml(); return; }
    if (S.tab === 'content') {
      box.innerHTML = `<div class="sh-content">
        <button type="button" class="sh-door" data-go="written">${ic('book')}<span><b>Cours écrits</b><small>Trading, UGC, Psychologie, Autres ressources : ajoute, modifie ou retire un élément (menu ⋮ sur chaque carte).</small></span><span class="sh-go">Gérer ${ic('go')}</span></button>
        <button type="button" class="sh-door" data-go="video">${ic('play')}<span><b>Cours vidéo</b><small>Mindset et Business : les vidéos, leurs miniatures et les rediffusions à compléter.</small></span><span class="sh-go">Gérer ${ic('go')}</span></button></div>`;
    }
  }

  function educatorsHtml() {
    const E = S.educators;
    if (!E) return '<p class="sh-empty">Chargement…</p>';
    if (!E.length) return '<p class="sh-empty">Aucun éducateur pour le moment. Donne le rôle Éducateur à un membre depuis Admin → Membres.</p>';
    return `<div class="sh-edus">${E.map((e) => `<button type="button" class="sh-edu" data-edu="${e.id}">
      <span class="sh-av">${esc(initials(e.name))}</span>
      <span class="sh-edu__who"><b>${esc(e.name)}</b><small>${e.code ? `Code ${esc(e.code)}` : 'Code pas encore choisi'}</small></span>
      <span class="sh-edu__n"><b>${e.students}</b>${e.students > 1 ? 'élèves' : 'élève'}</span>
      <span class="sh-edu__n"><b>${e.calls}</b>appels 7 j</span>
      <span class="sh-edu__n"><b>${e.notes30}</b>notes 30 j</span>
      <span class="sh-edu__n${e.late ? ' is-late' : ''}"><b>${e.late}</b>en retard</span>
      <span class="sh-go">Ses élèves ${ic('go')}</span></button>`).join('')}</div>`;
  }

  function infosHtml() {
    const M = S.missions;
    return `<div class="sh-two">
      <div><div class="sh-sub"><span class="chest-step">Infos publiées</span><button type="button" class="sh-link" data-compose="post">+ Nouvelle info</button></div>
        ${postsHtml(S.posts, 'Aucune info pour l’instant. Une info apparaît dans School chez tous ceux que tu vises.')}</div>
      <div><div class="sh-sub"><span class="chest-step">Missions de groupe</span><button type="button" class="sh-link" data-compose="task">+ Nouvelle mission</button></div>
        ${M.length ? `<ul class="sh-mlist">${M.map((m) => `<li><span class="sh-mlist__main"><b>${esc(m.title)}</b><small>${esc(m.audienceLabel)} · ${m.dueAt ? `pour le ${fr(m.dueAt, { day: 'numeric', month: 'short' })}` : 'sans date'}${ROLE === 'admin' ? ` · ${esc(m.author)}` : ''}</small></span>
          <span class="sh-mlist__n"><b>${m.done}/${m.members}</b>faites</span><span class="sh-bar sh-bar--sm"><i style="transform:scaleX(${m.members ? (m.done / m.members).toFixed(3) : 0})"></i></span>
          <button type="button" class="sh-link sh-link--red" data-del-mission="${m.id}">Retirer</button></li>`).join('')}</ul>` : '<p class="sh-empty">Une mission de groupe est copiée chez chaque membre visé : chacun coche la sienne, tu vois l’avancement ici.</p>'}</div>
    </div>`;
  }

  // ---------------------------------------------------------------- fenêtre (détail, composer)
  let dlg;
  function ensureDlg() {
    if (dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.className = 'sh-dlg';
    dlg.innerHTML = '<form method="dialog" class="sh-dlg__win" id="shForm" novalidate><button type="button" class="sh-ib sh-dlg__x" data-close aria-label="Fermer"><svg class="sh-ic" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button><div id="shDlgIn"></div></form>';
    document.body.appendChild(dlg);
    dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); });
    // l'évènement close arrive après coup : ne rien vider si une nouvelle fenêtre s'est déjà ouverte entre-temps
    dlg.addEventListener('close', () => { if (dlg.open) return; document.getElementById('shDlgIn').innerHTML = ''; S.submit = null; });
    dlg.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!S.submit) return;
      const btn = dlg.querySelector('[type=submit]'), msg = document.getElementById('shMsg');
      if (btn) btn.disabled = true;
      if (msg) msg.textContent = '';
      try { await S.submit(); dlg.close(); } catch (err) { if (msg) msg.textContent = err.message; } finally { if (btn) btn.disabled = false; }
    });
    dlg.addEventListener('click', onDlgClick);
    dlg.addEventListener('change', onDlgChange);
    return dlg;
  }
  function openDlg(html, wide, onSubmit) {
    ensureDlg();
    document.getElementById('shDlgIn').innerHTML = html;
    dlg.classList.toggle('is-wide', !!wide);
    S.submit = onSubmit || null;
    if (!dlg.open) dlg.showModal();
    const f = dlg.querySelector('input[type=text]');
    if (f && onSubmit) f.focus();
  }

  function eventDetail(e) {
    const k = kindOf(e);
    const s = new Date(e.startsAt), end = new Date(s.getTime() + e.minutes * 60000);
    const future = end.getTime() >= Date.now();
    const canEdit = e.type === 'collective' && (ROLE === 'admin' || e.authorId === U.id);
    const acts = [];
    if (future && e.link && e.status === 'confirmed') acts.push(`<a class="chest-btn" href="${esc(e.link)}" target="_blank" rel="noopener">Rejoindre</a>`);
    if (e.type === 'personal') acts.push(`<button type="button" class="chest-btn-2" data-open-suivi="${ROLE === 'member' ? '' : e.memberId}">${ROLE === 'member' ? 'Ouvrir mon suivi' : `Suivi de ${esc((e.member || '').split(' ')[0])}`}</button>`);
    if (canEdit) acts.push(`<button type="button" class="chest-btn-2" data-edit-ev="${esc(e.id)}">Modifier</button>`, `<button type="button" class="sh-link sh-link--red" data-del-ev="${e.seriesId}">Supprimer${e.weeks > 1 ? ' la série' : ''}</button>`);
    openDlg(`<div class="sh-detail">
      ${e.flyer ? `<div class="sh-detail__fly"><img src="${esc(fileUrl(e.flyer))}" alt="Flyer de ${esc(e.title)}"></div>` : `<div class="sh-detail__fly is-gen sh-gen--${k.k}">${ic(e.type === 'personal' ? 'user' : 'users')}</div>`}
      <div class="sh-detail__main">
        <div class="sh-detail__k"><span class="sh-badge sh-badge--${k.k}">${k.label}</span>${e.status === 'proposed' ? '<span class="sh-badge sh-badge--ask">À confirmer</span>' : ''}</div>
        <h2>${esc(e.title)}</h2>
        <dl class="sh-dl">
          <div><dt>Quand</dt><dd>${esc(relDay(s))} · ${hm(s)} – ${hm(end)}${e.weeks > 1 ? ` · chaque semaine (${e.occurrence + 1}/${e.weeks})` : ''}</dd></div>
          <div><dt>Format</dt><dd>${MODES[e.mode] || 'Visio'}${e.link ? ' · lien de visio' : ''}</dd></div>
          <div><dt>${e.type === 'personal' ? 'Avec' : 'Pour'}</dt><dd>${e.type === 'personal' ? esc(ROLE === 'member' ? e.author : `${e.member} · posé par ${e.author}`) : esc(e.audienceLabel || '')}</dd></div>
          ${e.type === 'collective' ? `<div><dt>Par</dt><dd>${esc(e.author)}</dd></div>` : ''}
        </dl>
        ${e.body ? `<div class="sh-read">${textToHtml(e.body)}</div>` : ''}
        <div class="sh-acts">${acts.join('')}</div>
      </div></div>`, true);
  }

  function postDetail(p) {
    const can = ROLE === 'admin' || (ROLE === 'educator' && p.authorId === U.id);
    openDlg(`<div class="sh-detail sh-detail--post">
      ${p.image ? `<div class="sh-detail__fly"><img src="${esc(fileUrl(p.image))}" alt=""></div>` : ''}
      <div class="sh-detail__main">
        <div class="sh-detail__k">${p.pinned ? `<span class="sh-badge">${ic('pin')}Épinglé</span>` : ''}${ROLE !== 'member' ? `<span class="sh-badge sh-badge--group">${esc(p.audienceLabel)}</span>` : ''}</div>
        <h2>${esc(p.title)}</h2>
        <p class="sh-detail__by">${esc(p.author)} · ${fr(p.createdAt, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
        <div class="sh-read">${textToHtml(p.body)}</div>
        ${can ? `<div class="sh-acts"><button type="button" class="chest-btn-2" data-edit-post="${p.id}">Modifier</button><button type="button" class="sh-link sh-link--red" data-del-post="${p.id}">Supprimer</button></div>` : ''}
      </div></div>`, !!p.image);
  }

  function noteDetail(n) {
    openDlg(`<div class="sh-detail sh-detail--post"><div class="sh-detail__main"><span class="chest-step">Note · ${esc(n.author)}</span><h2>${esc(n.title || 'Note')}</h2>
      <p class="sh-detail__by">${fr(n.createdAt, { day: 'numeric', month: 'long', year: 'numeric' })}</p><div class="sh-read">${textToHtml(n.body)}</div></div></div>`);
  }

  // Composer : Appel / Mission / Info, et pour qui.
  const C = { kind: 'event', target: 'all', scope: [], member: '', flyer: null, editing: null };
  function targetsFor(kind) {
    if (ROLE === 'educator') return kind === 'post' ? [['students', 'Tous mes élèves']] : [['students', 'Tous mes élèves'], ['one', 'Un élève']];
    const t = [['all', 'Tout le monde'], ['members', 'Membres'], ['educators', 'Équipe'], ['students', 'Élèves de…'], ['one', 'Un membre']];
    if (kind === 'task') return t.filter(([k]) => k !== 'educators');
    if (kind === 'post') return t.filter(([k]) => k !== 'one');
    return t;
  }
  const seg = (name, opts, val) => `<div class="chest-seg sh-seg" data-seg="${name}" role="radiogroup">${opts.map(([v, l]) => `<button type="button" role="radio" data-v="${v}" aria-checked="${String(v) === String(val)}" class="${String(v) === String(val) ? 'is-active' : ''}">${l}</button>`).join('')}</div>`;
  const field = (label, inner, wide, hint) => `<label class="sh-f${wide ? ' sh-f--wide' : ''}"><span>${label}</span>${inner}${hint ? `<em>${hint}</em>` : ''}</label>`;

  function composerHtml() {
    const k = C.kind, ed = C.editing;
    const T = targetsFor(k);
    if (!T.some(([v]) => v === C.target)) C.target = T[0][0];
    const base = ed ? new Date(ed.startsAt || Date.now()) : (() => { const d = new Date(Date.now() + DAY); d.setHours(19, 0, 0, 0); return d; })();
    const due = new Date(Date.now() + 7 * DAY);
    const people = S.people || [];
    const scopeHtml = C.target === 'students' && ROLE === 'admin' ? `<div class="sh-f sh-f--wide"><span>Éducateurs</span><div class="sh-pills">${(S.educators || []).map((e) => `<button type="button" class="sh-pill${C.scope.includes(e.id) ? ' is-on' : ''}" data-scope="${e.id}" aria-pressed="${C.scope.includes(e.id)}">${esc(e.first)} <small>${e.students}</small></button>`).join('') || '<em class="sh-hint">Aucun éducateur.</em>'}</div></div>` : '';
    const oneHtml = C.target === 'one' ? field(ROLE === 'admin' ? 'Membre' : 'Élève', `<select id="cMember"><option value="">Choisir…</option>${people.map((p) => `<option value="${p.id}" ${String(C.member) === String(p.id) ? 'selected' : ''}>${esc(p.name)}${ROLE === 'admin' && p.educator ? ` · avec ${esc(p.educator)}` : ''}</option>`).join('')}</select>`, true) : '';
    const flyerHtml = (label) => `<div class="sh-f sh-f--wide"><span>${label} <i>(facultatif)</i></span><div class="sh-drop${C.flyer || (ed && (ed.flyer || ed.image)) ? ' has-img' : ''}" id="cDrop">
        <input type="file" id="cFile" accept="image/*" aria-label="${label}">
        ${C.flyer ? `<img src="${esc(URL.createObjectURL(C.flyer))}" alt="">` : ed && (ed.flyer || ed.image) ? `<img src="${esc(fileUrl(ed.flyer || ed.image))}" alt="">` : ''}
        <span class="sh-drop__t">${ic('image')}<b>${C.flyer || (ed && (ed.flyer || ed.image)) ? 'Changer l’image' : 'Choisir une image'}</b><small>JPG ou PNG · format affiche ou carré</small></span></div></div>`;
    const title = ed ? (k === 'event' ? 'Modifier l’appel' : 'Modifier l’info') : 'Ajouter au School';
    let body = '';
    if (k === 'event') {
      body = `${field('Titre', `<input type="text" id="cTitle" maxlength="140" value="${esc(ed ? ed.title : '')}" placeholder="${C.target === 'one' ? 'Point sur tes trades de la semaine' : 'Live : revue du marché'}">`, true)}
        ${field('Date', `<input type="date" id="cDate" value="${ymd(base)}">`)}${field('Heure', `<input type="time" id="cTime" step="900" value="${pad(base.getHours())}:${pad(base.getMinutes())}">`)}
        ${field('Durée', `<select id="cMin">${[30, 45, 60, 90, 120, 180].map((m) => `<option value="${m}" ${m === (ed ? ed.minutes : 60) ? 'selected' : ''}>${dur(m)}</option>`).join('')}</select>`)}
        ${C.target !== 'one' ? field('Répéter', `<select id="cWeeks">${[[1, 'Une fois'], [2, '2 semaines'], [4, '4 semaines'], [8, '8 semaines'], [12, '12 semaines'], [26, '6 mois']].map(([v, l]) => `<option value="${v}" ${v === (ed ? ed.weeks : 1) ? 'selected' : ''}>${l}</option>`).join('')}</select>`) : ''}
        <div class="sh-f sh-f--wide"><span>Format</span>${seg('mode', Object.entries(MODES), ed ? ed.mode : 'visio')}</div>
        ${field('Lien de visio <i>(facultatif)</i>', `<input type="url" id="cLink" maxlength="300" value="${esc(ed ? ed.link : '')}" placeholder="https://meet.google.com/…">`, true)}
        ${field('Description <i>(facultatif)</i>', `<textarea id="cBody" rows="4" maxlength="4000" placeholder="Ce qui sera vu, ce qu’il faut préparer…">${esc(ed ? ed.body : '')}</textarea>`, true)}
        ${flyerHtml('Flyer')}`;
    } else if (k === 'task') {
      body = `${field('Mission', `<input type="text" id="cTitle" maxlength="200" placeholder="Remplir ton journal chaque soir">`, true)}
        ${field('À faire pour le', `<input type="date" id="cDue" value="${ymd(due)}">`)}`;
    } else {
      body = `${field('Titre', `<input type="text" id="cTitle" maxlength="140" value="${esc(ed ? ed.title : '')}" placeholder="Nouveau cours disponible">`, true)}
        ${field('Texte', `<textarea id="cBody" rows="6" maxlength="8000" placeholder="L’info en quelques lignes.">${esc(ed ? ed.body : '')}</textarea>`, true)}
        ${flyerHtml('Illustration')}
        ${ROLE === 'admin' ? `<label class="sh-tick"><input type="checkbox" id="cPin" ${ed && ed.pinned ? 'checked' : ''}><span>Épingler en tête</span></label>` : ''}`;
    }
    const hint = C.target === 'one' ? (k === 'event' ? 'Posé directement dans son planning, déjà confirmé. Il le retrouve dans School et dans son suivi.' : 'Ajoutée à ses missions : il la coche quand c’est fait.')
      : k === 'task' ? 'Copiée chez chaque membre visé ; chacun coche la sienne, tu vois l’avancement dans Infos & missions.'
      : k === 'event' ? 'Un seul rendez-vous, visible dans le planning de chacun de ceux que tu vises.' : 'Visible dans School chez tous ceux que tu vises.';
    return `<div class="sh-comp">
      <header class="sh-comp__h"><span class="chest-step">${ROLE === 'admin' ? 'Admin' : 'Éducateur'}</span><h2>${title}</h2></header>
      ${ed ? '' : `<div class="sh-f sh-f--wide"><span>Quoi</span>${seg('kind', [['event', 'Appel'], ['task', 'Mission'], ['post', 'Info']], k)}</div>`}
      <div class="sh-f sh-f--wide"><span>Pour</span>${seg('target', T, C.target)}</div>
      ${scopeHtml}${oneHtml}
      <div class="sh-grid">${body}</div>
      <p class="sh-hint">${hint}</p>
      <p class="sh-msg" id="shMsg" role="alert"></p>
      <footer class="sh-comp__f"><button type="button" class="chest-btn-2" data-close>Annuler</button><button type="submit" class="chest-btn">${ed ? 'Enregistrer' : k === 'post' ? 'Publier' : 'Ajouter'}</button></footer>
    </div>`;
  }

  function keepValues(fn) {
    const ids = ['cTitle', 'cDate', 'cTime', 'cMin', 'cWeeks', 'cLink', 'cBody', 'cDue', 'cMember'];
    const kept = {};
    ids.forEach((id) => { const el = document.getElementById(id); if (el) kept[id] = el.value; });
    fn();
    ids.forEach((id) => { const el = document.getElementById(id); if (el && kept[id] != null && !(id === 'cTitle' && !kept[id])) el.value = kept[id]; });
  }
  const refreshComposer = () => keepValues(() => { document.getElementById('shDlgIn').innerHTML = composerHtml(); });

  async function openComposer(kind, editing) {
    await ensurePeople();
    if (ROLE === 'admin' && !S.educators) await loadEducators().catch(() => {});
    Object.assign(C, { kind: kind || 'event', editing: editing || null, flyer: null });
    if (editing) {
      C.target = editing.audience === 'students' ? 'students' : editing.audience;
      C.scope = (editing.scope || []).slice();
      if (ROLE === 'educator') C.target = 'students';
    } else {
      C.target = ROLE === 'educator' ? 'students' : 'all';
      C.scope = [];
      C.member = S.member || '';
      if (C.member) C.target = 'one';
    }
    openDlg(composerHtml(), false, submitComposer);
  }

  function onDlgChange(e) {
    if (e.target.id === 'cFile') { C.flyer = e.target.files[0] || null; refreshComposer(); }
    if (e.target.id === 'cMember') C.member = e.target.value;
  }

  async function onDlgClick(e) {
    const t = e.target;
    const sg = t.closest('[data-seg] [data-v]');
    if (sg && t.closest('.sh-comp')) {
      const name = sg.parentElement.dataset.seg;
      if (name === 'kind') { C.kind = sg.dataset.v; return refreshComposer(); }
      if (name === 'target') { C.target = sg.dataset.v; return refreshComposer(); }
      sg.parentElement.querySelectorAll('[data-v]').forEach((b) => { b.classList.toggle('is-active', b === sg); b.setAttribute('aria-checked', String(b === sg)); });
      return;
    }
    const sc = t.closest('[data-scope]');
    if (sc) { const id = Number(sc.dataset.scope); C.scope = C.scope.includes(id) ? C.scope.filter((x) => x !== id) : C.scope.concat(id); return refreshComposer(); }
    const eev = t.closest('[data-edit-ev]');
    if (eev) { const ev = findEvent(eev.dataset.editEv); const first = ev && Object.assign({}, ev, { startsAt: new Date(Date.parse(ev.startsAt) - ev.occurrence * 7 * DAY).toISOString() }); return openComposer('event', first); }
    const dev = t.closest('[data-del-ev]');
    if (dev) { if (!(await ask('Supprimer cet appel du planning de tous ceux qui le voient ?', 'Supprimer'))) return; return act(() => postJson(`/school/events/${dev.dataset.delEv}/delete`, {}), 'Appel supprimé.'); }
    const ep = t.closest('[data-edit-post]');
    if (ep) return openComposer('post', S.posts.find((p) => p.id === Number(ep.dataset.editPost)));
    const dp = t.closest('[data-del-post]');
    if (dp) { if (!(await ask('Supprimer cette info ?', 'Supprimer'))) return; return act(() => postJson(`/school/posts/${dp.dataset.delPost}/delete`, {}), 'Info supprimée.'); }
    const os = t.closest('[data-open-suivi]');
    if (os) { dlg.close(); return goSuivi(os.dataset.openSuivi); }
  }

  async function submitComposer() {
    const v = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
    const segVal = (n) => { const b = dlg.querySelector(`[data-seg="${n}"] .is-active`); return b ? b.dataset.v : ''; };
    const title = v('cTitle');
    if (!title) throw new Error(C.kind === 'task' ? 'Décris la mission.' : 'Donne un titre.');
    const one = C.target === 'one';
    const member = one ? v('cMember') : '';
    if (one && !member) throw new Error(ROLE === 'admin' ? 'Choisis le membre.' : 'Choisis l’élève.');
    if (C.target === 'students' && ROLE === 'admin' && !C.scope.length) throw new Error('Choisis au moins un éducateur.');
    const target = { audience: C.target, scope: C.scope };
    if (C.kind === 'event') {
      if (!v('cDate') || !v('cTime')) throw new Error('Choisis la date et l’heure.');
      const at = new Date(`${v('cDate')}T${v('cTime')}`);
      const common = { startsAt: at.toISOString(), minutes: Number(v('cMin')), mode: segVal('mode') || 'visio', link: v('cLink'), body: v('cBody') };
      if (one) await postForm('/mentor/events', Object.assign(common, { member: Number(member), topic: title, confirmed: true }), { flyer: C.flyer });
      else await postForm('/school/events', Object.assign(common, target, { id: C.editing && C.editing.seriesId, title, weeks: Number(v('cWeeks') || 1) }), { flyer: C.flyer });
      S.week = mondayOf(at);
    } else if (C.kind === 'task') {
      const dueAt = v('cDue') ? new Date(`${v('cDue')}T23:59`).toISOString() : null;
      if (one) await postJson('/mentor/tasks', { member: Number(member), title, dueAt });
      else { const r = await postJson('/school/missions', Object.assign({ title, dueAt }, target)); toast(`Mission ajoutée chez ${plural(r.members, 'membre', 'membres')}.`); }
    } else {
      const pin = document.getElementById('cPin');
      await postForm('/school/posts', Object.assign({ id: C.editing && C.editing.id, title, body: v('cBody'), pinned: !!(pin && pin.checked) }, target), { image: C.flyer });
    }
    if (C.kind !== 'task' || one) toast(C.editing ? 'Enregistré.' : C.kind === 'post' ? 'Info publiée.' : C.kind === 'event' ? 'Ajouté au planning.' : 'Mission ajoutée.');
    await refresh();
  }

  // ---------------------------------------------------------------- outils
  let toastT;
  function toast(msg) {
    let t = document.getElementById('shToast');
    if (!t) { t = document.createElement('div'); t.id = 'shToast'; t.className = 'sh-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('is-on');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('is-on'), 2600);
  }
  const ask = (msg, label) => (window.CHESTConfirm ? window.CHESTConfirm(msg, { confirmLabel: label }) : Promise.resolve(window.confirm(msg)));
  async function act(fn, done) {
    try { await fn(); if (dlg && dlg.open) dlg.close(); toast(done); await refresh(); } catch (e) { toast(e.message); }
  }
  const findEvent = (id) => ((S.agenda && S.agenda.events) || []).find((e) => e.id === id);
  function goSuivi(member) {
    const q = member ? `?member=${member}` : '';
    const sh = window.parent && window.parent !== window && window.parent.CHESTShell;
    if (sh && sh.go) sh.go('suivi', q); else location.href = 'suivi.html' + q;
  }

  async function ensurePeople() {
    if (ROLE === 'member' || S.people) return;
    try { S.people = (await api('/mentor/students')).students; } catch (e) { S.people = []; }
  }
  async function loadEducators() { const d = await api('/mentor/educators'); S.educators = d.educators; }

  // ---------------------------------------------------------------- chargement
  async function refresh() {
    const jobs = [loadAgenda(), api('/school/posts').then((d) => { S.posts = d.posts; })];
    if (ROLE === 'member') jobs.push(api('/mentor').then((d) => { S.mentor = d; }).catch(() => { S.mentor = null; }));
    else {
      jobs.push(ensurePeople(), api('/school/missions').then((d) => { S.missions = d.missions; }).catch(() => { S.missions = []; }));
      if (ROLE === 'admin') jobs.push(loadEducators().catch(() => { S.educators = []; }));
    }
    const res = await Promise.allSettled(jobs);
    const failed = res.find((r) => r.status === 'rejected');
    if (failed && !S.agenda) { root.innerHTML = `<p class="sh-empty">${esc(failed.reason.message)}</p>`; return; }
    if (ROLE === 'member') renderMember(); else renderStaff();
  }
  async function reloadWeek() {
    try { await loadAgenda(); } catch (e) { return toast(e.message); }
    if (ROLE === 'member') renderMember();
    else { const box = document.getElementById('shPanel'); if (box && S.tab === 'planning') box.innerHTML = weekHtml(); const f = root.querySelector('.sh-facts'); if (f) f.outerHTML = staffFacts(); }
  }

  root.addEventListener('click', async (e) => {
    const t = e.target;
    const wk = t.closest('[data-week]');
    if (wk) { const d = Number(wk.dataset.week); S.week = d === 0 ? mondayOf(new Date()) : new Date(S.week.getTime() + d * 7 * DAY); return reloadWeek(); }
    const ev = t.closest('[data-ev]'); if (ev) { const x = findEvent(ev.dataset.ev); if (x) eventDetail(x); return; }
    const po = t.closest('[data-post]'); if (po) { const x = S.posts.find((p) => p.id === Number(po.dataset.post)); if (x) postDetail(x); return; }
    const nr = t.closest('[data-note-read]'); if (nr) { const x = S.mentor && S.mentor.notes.find((n) => n.id === Number(nr.dataset.noteRead)); if (x) noteDetail(x); return; }
    const cp = t.closest('[data-compose]'); if (cp) return openComposer(cp.dataset.compose);
    const tb = t.closest('[data-tab]'); if (tb) { S.tab = tb.dataset.tab; root.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b === tb))); return renderTab(); }
    const ed = t.closest('[data-edu]');
    if (ed) { S.member = null; S.tab = 'people'; renderStaff(); const box = document.getElementById('shPeople'); if (box && window.CHESTMentorHub) await CHESTMentorHub.render(box, { educator: Number(ed.dataset.edu), compact: true }); return; }
    const sv = t.closest('[data-suivi]'); if (sv) { e.preventDefault(); return goSuivi(''); }
    const tk = t.closest('[data-task]');
    if (tk) { try { S.mentor = await postJson(`/mentor/tasks/${tk.dataset.task}/toggle`, {}); await loadAgenda(); renderMember(); } catch (err) { toast(err.message); } return; }
    const dm = t.closest('[data-del-mission]');
    if (dm) { if (!(await ask('Retirer cette mission chez tous les membres qui l’ont ?', 'Retirer'))) return; return act(() => postJson(`/mentor/common/${dm.dataset.delMission}/delete`, {}), 'Mission retirée.'); }
  });
  root.addEventListener('change', (e) => { if (e.target.id === 'shWho') { S.member = e.target.value || null; reloadWeek(); } });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.agenda && !(dlg && dlg.open)) refresh(); });

  if (ROLE !== 'member') {
    const home = document.getElementById('scHome');
    if (home) home.classList.add('is-staff');
  }
  root.hidden = false;
  root.innerHTML = '<p class="sh-empty sh-loading">Chargement de ta semaine…</p>';
  refresh();
  window.CHESTSchoolHub = { refresh };
})();
