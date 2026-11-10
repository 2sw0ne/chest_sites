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
    expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
    share: 'M12 15V3M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7',
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
    week: mondayOf(new Date()), agenda: null, posts: [], ideaTab: 'on', newIds: null, missions: [], mentor: null, people: null, educators: null,
    tab: null, member: null, // filtre éducateur/admin : un seul élève dans le planning
    planNew: new Set(), person: null, wk2: false,
    view: (() => { try { return localStorage.getItem('chest_school_view') === 'compact' ? 'compact' : 'full'; } catch (e) { return 'full'; } })(),
  };
  // Équipe : le planning montre la semaine en cours ET la suivante (2026-11-08) ; un membre garde sa semaine.
  const SPAN = ROLE === 'member' ? 7 : 14;

  // ---------------------------------------------------------------- planning de la semaine
  async function loadAgenda() {
    const from = S.week, to = new Date(from.getTime() + SPAN * DAY);
    const q = `?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}${S.member ? `&member=${S.member}` : ''}`;
    S.agenda = await api('/school/agenda' + q);
  }

  // Type d'un rendez-vous (code couleur de la pastille) : Appel (une personne), Groupe, Équipe ; CHEST pour l'admin.
  function kindOf(e) {
    if (e.type === 'personal') return { k: 'perso', label: e._n > 1 ? 'Groupe' : 'Appel' };
    if (e.audience === 'educators' || (e.audience === 'people' && staffIds().size && (e.scope || []).every((id) => staffIds().has(id)))) return { k: 'team', label: 'Équipe' };
    return { k: 'group', label: 'Groupe' };
  }
  const staffIds = () => new Set(((S.agenda && S.agenda.staff) || []).map((x) => x.id).concat((S.educators || []).map((x) => x.id)));

  // Couleur de la personne (barre et pastille de la carte) : l'admin voit l'éducateur, l'éducateur voit l'élève.
  const PEOPLE_PAL = ['#a855f7', '#38bdf8', '#33e6a6', '#f5c451', '#2dd4bf', '#4d8dff', '#ff8a65', '#e879f9', '#84cc16', '#f472b6'];
  const hashColor = (id) => PEOPLE_PAL[Math.abs(Number(id) || 0) % PEOPLE_PAL.length];
  const ownerOf = (e) => ((S.agenda && S.agenda.staff) || []).find((x) => x.id === e.ownerId) || null;
  function personOf(e) {
    if (e.chest) return { id: 'chest', name: 'CHEST', chest: true };
    if (ROLE === 'admin') { const o = ownerOf(e); return o ? { id: 'o' + o.id, name: o.first, color: o.color } : null; }
    if (ROLE === 'educator') {
      if (e.type === 'personal' && !(e._n > 1)) return { id: 'm' + e.memberId, name: String(e.member || '').split(' ')[0], color: hashColor(e.memberId) };
      return { id: 'g', name: 'Groupes', color: 'var(--a2, #f9a45e)', group: true };
    }
    return null;
  }
  const personMatch = (e) => {
    if (ROLE === 'admin') return !S.owner || e.ownerId === S.owner;
    if (ROLE === 'educator' && S.person) { const p = personOf(e); return !!p && p.id === S.person; }
    return true;
  };
  const isNewEv = (e) => S.planNew.has(e.id);

  function evCard(e) {
    const k = kindOf(e);
    const ended = Date.parse(e.startsAt) + e.minutes * 60000 < Date.now();
    const p = personOf(e);
    const ask = e.status === 'proposed' ? '<span class="sh-ev__ask">à confirmer</span>' : '';
    // équipe : « nom du membre » pour un appel perso ; un appel posé chez plusieurs élèves = une seule carte (« 4 élèves »)
    const many = e._n > 1;
    const staff = ROLE !== 'member';
    const title = esc(e.title);
    const sub = staff ? (e.type === 'personal' ? `<span class="sh-ev__topic">${many ? `${e._n} élèves` : esc(e.member || '')}</span>` : e.audienceLabel ? `<span class="sh-ev__topic">${esc(e.audienceLabel)}</span>` : '') : '';
    const tag = p && !p.group ? `<span class="sh-ev__who"><i></i>${esc(p.name)}</span>` : '';
    return `<button type="button" class="sh-ev sh-ev--${k.k}${e.chest ? ' is-chest' : ''}${ended ? ' is-past' : ''}${isNewEv(e) ? ' is-new' : ''}" data-ev="${esc(e.id)}"${p && p.color ? ` style="--c:${esc(p.color)}"` : ''}>
      <span class="sh-ev__body"><span class="sh-ev__t"><b>${hm(e.startsAt)}</b><span>${dur(e.minutes)}</span><em class="sh-ty sh-ty--${e.chest ? 'chest' : k.k}">${e.chest ? 'CHEST' : k.label}</em></span>
      <span class="sh-ev__title">${title}</span>${sub}${staff ? tag : ''}${ask}${isNewEv(e) ? '<span class="sh-new">Nouveau</span>' : ''}</span></button>`;
  }
  function taskChip(t) {
    const late = !t.doneAt && t.dueAt && Date.parse(t.dueAt) < Date.now();
    const nw = S.planNew.has('t' + t.id) || (t.group && t.group.some((x) => S.planNew.has('t' + x.id)));
    const fresh = nw ? '<em class="sh-new">Nouveau</em>' : '';
    if (t.group) {
      // équipe : une mission de groupe = une seule ligne, avec l'avancement
      const done = t.group.filter((x) => x.doneAt).length, n = t.group.length;
      const all = done === n, lateAny = t.dueAt && Date.parse(t.dueAt) < Date.now() && !all;
      return `<div class="sh-due${all ? ' is-done' : ''}${lateAny ? ' is-late' : ''}${nw ? ' is-new' : ''}">${ic(all ? 'check' : 'flag')}<span><b>${esc(t.title)}</b><small>Mission · ${done}/${n} faites</small>${fresh}</span></div>`;
    }
    const who = ROLE !== 'member' && t.member ? ` · ${esc(String(t.member).split(' ')[0])}` : '';
    return `<div class="sh-due${t.doneAt ? ' is-done' : ''}${late ? ' is-late' : ''}${nw ? ' is-new' : ''}"${ROLE === 'educator' && t.memberId ? ` style="--c:${hashColor(t.memberId)}"` : ''}>${ic(t.doneAt ? 'check' : 'flag')}<span><b>${esc(t.title)}</b><small>Mission · ${t.doneAt ? 'faite' : late ? 'en retard' : 'à rendre'}${who}</small>${fresh}</span></div>`;
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

  function groupCommon(list) {
    if (ROLE === 'member') return list;
    const out = [], seen = new Map();
    list.forEach((e) => {
      if (e.type !== 'personal') return out.push(e);
      const k = `${e.title}|${e.startsAt}|${e.ownerId}`;
      if (seen.has(k)) { seen.get(k)._n += 1; if (isNewEv(e)) S.planNew.add(seen.get(k).id); return; }
      const g = Object.assign({}, e, { _n: 1 }); seen.set(k, g); out.push(g);
    });
    return out;
  }
  const weekRange = (mon) => {
    const end = new Date(mon.getTime() + 6 * DAY);
    return `${fr(mon, { day: 'numeric', month: mon.getMonth() === end.getMonth() ? undefined : 'short' })} – ${fr(end, { day: 'numeric', month: 'long' })}`;
  };
  function weekGrid(mon, label) {
    const D = S.agenda || { events: [], tasks: [] };
    const days = Array.from({ length: 7 }, (_, i) => new Date(mon.getTime() + i * DAY));
    const inWeek = D.events.filter((e) => Date.parse(e.startsAt) >= mon.getTime() && Date.parse(e.startsAt) < mon.getTime() + 7 * DAY && personMatch(e));
    const cols = days.map((d) => {
      const evs = groupCommon(D.events.filter((e) => sameDay(e.startsAt, d) && personMatch(e)));
      const due = groupTasks(D.tasks.filter((t) => t.dueAt && sameDay(t.dueAt, d) && (ROLE !== 'educator' || !S.person || S.person === 'm' + t.memberId)));
      const today = sameDay(d, new Date());
      const past = d < new Date(new Date().setHours(0, 0, 0, 0));
      return `<div class="sh-day${today ? ' is-today' : ''}${past ? ' is-past' : ''}${evs.length || due.length ? '' : ' is-empty'}">
        <div class="sh-day__h"><span>${fr(d, { weekday: 'short' }).replace('.', '')}</span><b>${d.getDate()}</b>${today ? '<i>Aujourd’hui</i>' : ''}</div>
        <div class="sh-day__list">${evs.map(evCard).join('')}${due.map(taskChip).join('')}${evs.length || due.length ? '' : '<span class="sh-day__none">—</span>'}</div>
      </div>`;
    }).join('');
    return `<section class="sh-wk"><h3 class="sh-wk__h"><b>${label}</b><span>${esc(weekRange(mon))} · ${plural(groupCommon(inWeek).length, 'rendez-vous', 'rendez-vous')}</span></h3><div class="sh-days">${cols}</div></section>`;
  }
  // Légende : les types (pastille) et les personnes (barre de couleur), cliquables pour filtrer.
  function legendHtml() {
    const D = S.agenda || { events: [] };
    const types = `<span class="sh-legend__k">Types</span><span class="sh-ty sh-ty--perso">Appel</span><span class="sh-ty sh-ty--group">Groupe</span>${ROLE === 'admin' ? '<span class="sh-ty sh-ty--team">Équipe</span>' : ''}<span class="sh-ty sh-ty--chest">CHEST</span><span class="sh-lg sh-lg--due">Mission</span>`;
    let people = [];
    if (ROLE === 'admin') {
      people = (D.staff || []).filter((x) => x.role !== 'admin').map((x) => `<button type="button" class="sh-lg${S.owner === x.id ? ' is-on' : ''}${S.owner && S.owner !== x.id ? ' is-off' : ''}" style="--c:${esc(x.color)}" data-owner="${x.id}" aria-pressed="${S.owner === x.id}">${esc(x.first)}</button>`);
    } else {
      const seen = new Map();
      groupCommon(D.events).forEach((e) => { const p = personOf(e); if (p && !p.chest && !seen.has(p.id)) seen.set(p.id, p); });
      people = [...seen.values()].map((p) => `<button type="button" class="sh-lg${S.person === p.id ? ' is-on' : ''}${S.person && S.person !== p.id ? ' is-off' : ''}" style="--c:${esc(p.color)}" data-person="${esc(p.id)}" aria-pressed="${S.person === p.id}">${esc(p.name)}</button>`);
    }
    const reset = S.owner || S.person ? '<button type="button" class="sh-link" data-owner="" data-person="">Tout afficher</button>' : '';
    return `<div class="sh-legend"><div class="sh-legend__row">${types}</div>${people.length ? `<div class="sh-legend__row"><span class="sh-legend__k">${ROLE === 'admin' ? 'Éducateurs' : 'Élèves'}</span>${people.join('')}${reset}</div>` : ''}</div>`;
  }
  const newBadgePlan = () => (S.planNew.size ? `<span class="sh-plus" aria-label="${S.planNew.size} nouveauté${S.planNew.size > 1 ? 's' : ''} dans le planning">+${S.planNew.size}</span>` : '');
  // Vue « Complet » (2026-11-08, équipe) : la semaine heure par heure, comme le calendrier de l'iPhone. Chaque rendez-vous
  // est placé à son horaire (hauteur = durée, côte à côte s'ils se chevauchent) ; les missions sont en haut du jour ;
  // un clic sur une zone vide ouvre « Nouveau rendez-vous » à ce jour et à ce quart d'heure. « Compact » = les cartes.
  const HH = 48; // pixels par heure : la journée entière (00 h – 24 h), la fenêtre en montre 13 (10 h – 23 h)
  function layoutDay(evs) {
    const items = evs.map((e) => ({ e, s: Date.parse(e.startsAt), f: Date.parse(e.startsAt) + Math.max(15, e.minutes) * 60000 })).sort((a, b) => a.s - b.s || b.f - a.f);
    let cluster = [], end = 0;
    const flush = () => { const n = Math.max(...cluster.map((x) => x.col)) + 1; cluster.forEach((x) => { x.n = n; }); cluster = []; };
    items.forEach((it) => {
      if (cluster.length && it.s >= end) flush();
      const used = new Set(cluster.filter((x) => x.f > it.s).map((x) => x.col));
      let c = 0; while (used.has(c)) c++;
      it.col = c; cluster.push(it); end = Math.max(end, it.f);
    });
    if (cluster.length) flush();
    return items;
  }
  function gridHtml() {
    const D = S.agenda || { events: [], tasks: [] };
    const mon = new Date(S.week.getTime() + (S.wk2 ? 7 : 0) * DAY);
    const days = Array.from({ length: 7 }, (_, i) => new Date(mon.getTime() + i * DAY));
    const inWeek = groupCommon(D.events.filter((e) => Date.parse(e.startsAt) >= mon.getTime() && Date.parse(e.startsAt) < mon.getTime() + 7 * DAY && personMatch(e)));
    const h0 = 0, h1 = 24;
    const hours = Array.from({ length: h1 - h0 }, (_, i) => h0 + i);
    const now = new Date();
    // Téléphone (2026-11-10) : un jour à la fois, choisi dans la rangée des 7 jours (aujourd'hui par défaut)
    const phone = window.matchMedia('(max-width: 640px)').matches;
    if (S.calDay == null || S.calDay < 0 || S.calDay > 6) { const ti = days.findIndex((d) => sameDay(d, now)); S.calDay = ti >= 0 ? ti : 0; }
    const shown = phone ? [days[S.calDay]] : days;
    const head = phone
      ? `<div class="sh-cal__days">${days.map((d, i) => `<button type="button" class="sh-cal__dh${sameDay(d, now) ? ' is-today' : ''}${i === S.calDay ? ' is-on' : ''}" data-calday="${i}" aria-pressed="${i === S.calDay}"><span>${fr(d, { weekday: 'short' }).replace('.', '')}</span><b>${d.getDate()}</b>${inWeek.some((e) => sameDay(e.startsAt, d)) ? '<i aria-hidden="true"></i>' : ''}</button>`).join('')}</div>`
      : days.map((d) => `<div class="sh-cal__dh${sameDay(d, now) ? ' is-today' : ''}"><span>${fr(d, { weekday: 'short' }).replace('.', '')}</span><b>${d.getDate()}</b></div>`).join('');
    const allDay = shown.map((d) => `<div class="sh-cal__ad">${groupTasks(D.tasks.filter((t) => t.dueAt && sameDay(t.dueAt, d) && (ROLE !== 'educator' || !S.person || S.person === 'm' + t.memberId))).map(taskChip).join('')}</div>`).join('');
    const cols = shown.map((d) => {
      const evs = layoutDay(inWeek.filter((e) => sameDay(e.startsAt, d))).map(({ e, col, n }) => {
        const st = new Date(e.startsAt), top = ((st.getHours() - h0) * 60 + st.getMinutes()) / 60 * HH, hgt = Math.max(22, e.minutes / 60 * HH - 2);
        const k = kindOf(e), p = personOf(e), past = Date.parse(e.startsAt) + e.minutes * 60000 < Date.now();
        const who = ROLE !== 'member' ? (e.type === 'personal' ? (e._n > 1 ? `${e._n} élèves` : String(e.member || '')) : e.audienceLabel || '') : '';
        return `<button type="button" class="sh-gev sh-ev--${k.k}${e.chest ? ' is-chest' : ''}${past ? ' is-past' : ''}${isNewEv(e) ? ' is-new' : ''}${hgt < 44 ? ' is-short' : ''}" data-ev="${esc(e.id)}" style="top:${top}px;height:${hgt}px;left:calc(${(col / n) * 100}% + 2px);width:calc(${100 / n}% - 4px);${p && p.color ? `--c:${esc(p.color)};` : ''}">
          <span class="sh-gev__t"><b>${hm(e.startsAt)}</b>${esc(e.title)}</span>${hgt >= 62 ? `<span class="sh-gev__s">${e.chest ? 'CHEST · ' : `${k.label} · `}${esc(who)}</span>` : ''}</button>`;
      }).join('');
      const nowLine = sameDay(d, now) && now.getHours() >= h0 && now.getHours() < h1 ? `<i class="sh-cal__now" style="top:${((now.getHours() - h0) * 60 + now.getMinutes()) / 60 * HH}px"></i>` : '';
      return `<div class="sh-cal__col${sameDay(d, now) ? ' is-today' : ''}${d < new Date(new Date().setHours(0, 0, 0, 0)) ? ' is-past' : ''}" data-slot="${ymd(d)}" data-h0="${h0}" style="height:${hours.length * HH}px">${evs}${nowLine}</div>`;
    }).join('');
    return `<div class="sh-cal${phone ? ' is-phone' : ''}" style="--hh:${HH}px">
      <div class="sh-cal__head">${phone ? head : `<span></span>${head}`}</div>
      <div class="sh-cal__adrow"><span class="sh-cal__adk">Missions</span>${allDay}</div>
      <div class="sh-cal__scroll" id="shCalScroll" style="height:${13 * HH + 12}px"><div class="sh-cal__body"><div class="sh-cal__hours">${hours.map((h) => `<span style="height:${HH}px">${h ? `${pad(h)}:00` : ''}</span>`).join('')}</div>${cols}</div></div>
    </div>`;
  }
  // après rendu : la grille s'ouvre sur l'heure courante (ou 8 h)
  function scrollCal() {
    const sc = document.getElementById('shCalScroll'); if (!sc) return;
    // vue par défaut : 10 h – 23 h (la journée entière reste accessible en faisant défiler)
    sc.scrollTop = 10 * HH;
  }

  function weekHtml() {
    const thisWeek = sameDay(S.week, mondayOf(new Date()));
    const next = new Date(S.week.getTime() + 7 * DAY);
    const full = S.view !== 'compact';
    const filter = ROLE !== 'member' && S.people ? `<label class="sh-filter"><span class="sr-only">Afficher</span><select id="shWho">
        <option value="">${ROLE === 'admin' ? 'Tout le monde' : 'Tous mes élèves'}</option>
        ${S.people.map((p) => `<option value="${p.id}" ${String(S.member) === String(p.id) ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>` : '';
    return `<div class="sh-week">
      <div class="sh-week__bar">
        <div class="sh-week__nav">
          <button type="button" class="sh-ib" ${full ? 'data-wk="-1"' : 'data-week="-1"'} aria-label="Semaine précédente">${ic('left')}</button>
          ${full ? `<div class="sh-week__t"><b>${thisWeek ? (S.wk2 ? 'Semaine prochaine' : 'Cette semaine') : `Semaine du ${fr(S.wk2 ? next : S.week, { day: 'numeric', month: 'long' })}`}</b><span>${esc(weekRange(S.wk2 ? next : S.week))}</span></div>`
            : `<div class="sh-week__t"><b>${thisWeek ? 'Cette semaine et la suivante' : `Semaines du ${fr(S.week, { day: 'numeric', month: 'long' })}`}</b><span>${esc(weekRange(S.week).split(' – ')[0])} – ${esc(weekRange(next).split(' – ')[1])}</span></div>`}
          <button type="button" class="sh-ib" ${full ? 'data-wk="1"' : 'data-week="1"'} aria-label="Semaine suivante">${ic('right')}</button>
          ${thisWeek && !S.wk2 ? '' : '<button type="button" class="sh-link" data-week="0">Aujourd’hui</button>'}${newBadgePlan()}
        </div>
        <div class="sh-week__tools">${seg('view', [['full', 'Complet'], ['compact', 'Compact']], full ? 'full' : 'compact')}${filter}<button type="button" class="chest-btn" data-compose="event">${ic('plus')}Ajouter</button></div>
      </div>
      ${full ? gridHtml() : `${weekGrid(S.week, thisWeek ? 'Cette semaine' : `Semaine du ${fr(S.week, { day: 'numeric', month: 'long' })}`)}
      ${weekGrid(next, thisWeek ? 'Semaine prochaine' : `Semaine du ${fr(next, { day: 'numeric', month: 'long' })}`)}`}
      ${legendHtml()}
    </div>`;
  }
  // ---------------------------------------------------------------- infos
  // Idea (2026-11-08) : les idées de trade de l'équipe, en fil façon Instagram. Chaque Idea garde son format d'image
  // (vertical 4:5, horizontal 16:9 sur deux colonnes), peut porter une position (paire, sens, PE, SL, TP 1…n) et un
  // statut : zone d'action / en cours (onglet Actives) ou inactive (onglet Inactives). Seule l'équipe publie.
  const fmtOf = (p) => (p.format === 'portrait' ? 'portrait' : 'landscape');
  const STATUS = { zone: ['Zone d’action', 'zone'], encours: ['En cours', 'run'], inactive: ['Inactive', 'off'] };
  const stOf = (p) => (STATUS[p.status] ? p.status : 'zone');
  const cap1 = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  function ideaWhen(d) {
    const t = new Date(d);
    const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / DAY);
    const hm = t.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (days <= 0) return `Aujourd’hui · ${hm}`;
    if (days === 1) return `Hier · ${hm}`;
    if (days < 7) return cap1(fr(d, { weekday: 'long', day: 'numeric', month: 'short' }));
    return fr(d, t.getFullYear() === new Date().getFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
  }
  // prix au format des plateformes (point décimal), même nombre de décimales pour tous les niveaux d'une Idea
  const decOf = (I) => Math.min(5, Math.max(0, ...[I.pe, I.sl, ...I.tps].map((v) => (String(v).split('.')[1] || '').length)));
  const fmtN = (x, d) => Number(x).toFixed(d);
  const rrOf = (I, tp) => { const risk = Math.abs(I.pe - I.sl); return risk ? Math.abs(tp - I.pe) / risk : 0; };
  // Position d'une Idea, sur le modèle de la carte « Signal en cours » : sens en grand (néon vert / rouge), paire,
  // puis Entrée (gris) · Stop (rouge) · TP (vert) avec leur R:R. Version compacte dans le fil : TP 1 seulement.
  function posHtml(I, compact) {
    if (!I) return '';
    const buy = I.side !== 'sell', d = decOf(I);
    const tps = compact ? I.tps.slice(0, 1) : I.tps;
    const pair = /^[A-Z]{6}$/.test(I.pair) ? `${I.pair.slice(0, 3)}/${I.pair.slice(3)}` : I.pair;
    const rr = (t) => rrOf(I, t).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
    const cell = (k, v, cls, sub) => `<div class="sh-pos__c ${cls}"><span>${k}</span><b>${fmtN(v, d)}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
    return `<div class="sh-pos sh-pos--${buy ? 'buy' : 'sell'}${compact ? ' is-compact' : ''}">
      <div class="sh-pos__h"><b class="sh-pos__side">${buy ? 'Achat' : 'Vente'}</b><span class="sh-pos__pair">${esc(pair)}</span>${compact && I.tps.length > 1 ? `<span class="sh-pos__more">+${I.tps.length - 1} TP</span>` : ''}</div>
      <div class="sh-pos__g">${cell('Entrée', I.pe, 'is-pe')}${cell('Stop', I.sl, 'is-sl')}${tps.map((t, k) => cell(I.tps.length > 1 ? `Objectif ${k + 1}` : 'Objectif', t, 'is-tp', `R:R ${rr(t)}`)).join('')}</div>
    </div>`;
  }
  const isNew = (p) => S.newIds && S.newIds.has(p.id);
  function postCard(p) {
    const staff = ROLE !== 'member';
    const who = String(p.author || 'Équipe');
    const body = String(p.body || '');
    const st = STATUS[stOf(p)];
    return `<article class="sh-fc sh-fc--${p.image ? fmtOf(p) : p.idea ? 'pos' : 'text'}${isNew(p) ? ' is-new' : ''} is-${st[1]}">
      <button type="button" class="sh-fc__open" data-post="${p.id}" aria-label="Ouvrir l’Idea « ${esc(p.title)} »"></button>
      <header class="sh-fc__h"><span class="sh-fc__av${p.authorAvatar || p.chest ? ' has-photo' : ''}${p.chest ? ' is-chest' : ''}"${p.chest ? ` style="background-image:url('assets/logo-chest.png')"` : p.authorAvatar ? ` style="background-image:url('${esc(fileUrl({ key: p.authorAvatar }))}')"` : ''}>${p.authorAvatar || p.chest ? '' : esc(initials(who))}</span>
        <span class="sh-fc__who"><b>${esc(who)}</b><small>${esc(ideaWhen(p.createdAt))}${staff ? ` · ${esc(p.audienceLabel)}` : ''}</small></span>
        ${isNew(p) ? '<span class="sh-new">Nouveau</span>' : ''}</header>
      ${p.image ? `<div class="sh-fc__media"><img src="${esc(fileUrl(p.image))}" alt="" loading="lazy" decoding="async"></div>` : p.idea ? '' : `<div class="sh-fc__quote"><span>${esc(p.title)}</span></div>`}
      <div class="sh-fc__b"><span class="sh-st sh-st--${st[1]}">${st[0]}</span>${p.image || p.idea ? `<h3>${esc(p.title)}</h3>` : ''}${posHtml(p.idea, true)}${body ? `<p>${esc(body.slice(0, 180))}${body.length > 180 ? '…' : ''}</p>` : ''}<span class="sh-fc__more">Voir l’Idea${ic('go')}</span></div>
    </article>`;
  }
  const ideaTabs = (list) => {
    const on = list.filter((p) => stOf(p) !== 'inactive').length, off = list.length - on;
    return `<div class="chest-seg sh-seg sh-itabs" role="tablist" aria-label="Idea actives ou inactives">${[['on', 'Actives', on], ['off', 'Inactives', off]].map(([k, l, n]) => `<button type="button" role="tab" data-idea-tab="${k}" aria-selected="${S.ideaTab === k}" class="${S.ideaTab === k ? 'is-active' : ''}">${l} <small>${n}</small></button>`).join('')}</div>`;
  };
  function postsHtml(list, empty) {
    const shown = list.filter((p) => (S.ideaTab === 'off') === (stOf(p) === 'inactive'));
    return shown.length ? `<div class="sh-feed">${shown.map((p) => postCard(p)).join('')}</div>`
      : `<p class="sh-empty">${S.ideaTab === 'off' ? 'Aucune Idea inactive pour l’instant.' : empty}</p>`;
  }
  const newBadge = () => (S.newIds && S.newIds.size ? `<span class="sh-plus" aria-label="${S.newIds.size} nouvelle${S.newIds.size > 1 ? 's' : ''}">+${S.newIds.size}</span>` : '');
  function feed2() {
    const list = S.posts || [];
    return `<section class="sh-feedsec" id="shIdeas" aria-labelledby="shFeedT"><div class="sh-feedsec__h"><span class="chest-step">Idea</span><h2 id="shFeedT">Les idées de l’équipe</h2>${newBadge()}${ideaTabs(list)}</div>
      ${postsHtml(list, 'Pas d’Idea active pour l’instant. Les idées de trade de l’équipe arrivent ici.')}</section>`;
  }


  // ---------------------------------------------------------------- suivi du membre (missions + notes)

  // ---------------------------------------------------------------- scanner de référence (choisi par l'admin)
  // Derniers trades (GET /school/scanner → scanner-server /recent), stratégie rédigée et checklist « avant de trader »
  // tirées du guide du scanner (js/scanner-guides.js). Un clic sur un trade ouvre Stratégies sur son graphique.
  const scannerList = () => (window.CHESTScanners ? CHESTScanners.list() : []);
  const TF = { 1: 'M1', 5: 'M5', 15: 'M15', 30: 'M30', 60: 'H1', 240: 'H4', D: 'D1' };
  const ago = (ms) => {
    const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
    return m < 1 ? "à l'instant" : m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`;
  };
  const price = (v) => (v == null ? '—' : Math.abs(v) >= 100 ? Number(v).toFixed(2) : Number(v).toFixed(5));
  const CHECK_KEY = 'chest_school_check';
  function checks(sid) {
    try {
      const c = JSON.parse(localStorage.getItem(CHECK_KEY) || 'null');
      return c && c.day === ymd(new Date()) && c.scanner === sid ? c.done : [];
    } catch (e) { return []; }
  }
  function setChecks(sid, done) { try { localStorage.setItem(CHECK_KEY, JSON.stringify({ day: ymd(new Date()), scanner: sid, done })); } catch (e) { /* tant pis */ } }
  function openStrategies(q) {
    const sh = window.parent && window.parent !== window && window.parent.CHESTShell;
    if (sh && sh.go) sh.go('strategies', q); else location.href = 'strategies.html' + q;
  }

  function tradeRow(t) {
    const buy = t.side === 'buy', lv = t.levels || {};
    const tps = lv.tps || (lv.tp != null ? [lv.tp] : []);
    const m = /^tp(\d+)$/.exec(t.status || '');
    const st = !t.status || t.status === 'active' ? ['En cours', 'live'] : t.status === 'sl' ? ['Stop touché', 'sl'] : m ? [`TP${m[1]} atteint`, 'tp'] : null;
    return `<li><button type="button" class="sh-trade" data-trade="${esc(t.symbol)}|${esc(t.tf)}">
      <span class="sh-trade__side is-${buy ? 'buy' : 'sell'}">${buy ? 'Achat' : 'Vente'}</span>
      <span class="sh-trade__main"><b>${esc(t.symbol)} <small>${TF[t.tf] || esc(t.tf)}</small></b><small>${ago(t.time)}</small></span>
      <span class="sh-trade__lv"><span><i>Entrée</i>${price(lv.pe)}</span>${lv.sl != null ? `<span class="is-sl"><i>Stop</i>${price(lv.sl)}</span>` : ''}${tps.length ? `<span class="is-tp"><i>${tps.length > 1 ? 'TP' + tps.length : 'TP'}</i>${price(tps[tps.length - 1])}</span>` : ''}</span>
      ${st ? `<span class="sh-trade__st is-${st[1]}">${st[0]}</span>` : ''}
      ${ic('go', 'sh-trade__go')}</button></li>`;
  }

  function refHtml() {
    const R = S.ref;
    if (!R) return '';
    const sc = window.CHESTScanners && CHESTScanners.get(R.scanner);
    const g = window.CHESTScannerGuide && CHESTScannerGuide.data ? CHESTScannerGuide.data(R.scanner) : null;
    if (!sc) return '';
    const tab = S.refTab || 'trades';
    let body = '';
    if (tab === 'trades') {
      body = R.trades.length ? `<ul class="sh-trades">${R.trades.map(tradeRow).join('')}</ul>`
        : `<p class="sh-empty">${R.available === false ? 'Le scanner ne répond pas pour le moment.' : 'Pas de trade récent. Ouvre le graphique pour voir les signaux en direct.'}</p>`;
    } else if (tab === 'strategy') {
      let n = 0;
      body = g ? `<div class="sh-strat"><p class="sh-strat__intro">${esc(g.intro)}</p>${g.steps.map((x) => {
        if (x.group) { n = 0; return `<h4 class="sh-strat__group">${esc(x.group)}</h4>`; }
        // texte du guide : HTML écrit par CHEST (gras et couleurs), jamais une donnée d'un membre
        return `<div class="sh-strat__step"><span>${pad(++n)}</span><div><b>${esc(x.t)}</b><p>${x.txt}</p>${x.pts ? `<ul>${x.pts.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}</div></div>`;
      }).join('')}<button type="button" class="sh-link" data-ref-about>Voir la vidéo et les schémas dans Stratégies</button></div>` : '<p class="sh-empty">La stratégie de ce scanner arrive bientôt.</p>';
    } else {
      const items = g ? g.recap : [];
      const done = checks(R.scanner);
      const all = items.length && items.every((_, i) => done.includes(i));
      body = items.length ? `<div class="sh-check-list"><p class="sh-hint">À relire avant chaque trade. Coche chaque point : tant qu’ils ne sont pas tous cochés, pas de trade. Remis à zéro chaque jour.</p>
        <ul>${items.map((it, i) => `<li class="${done.includes(i) ? 'is-done' : ''}"><button type="button" class="sh-check" data-ref-check="${i}" role="checkbox" aria-checked="${done.includes(i)}" aria-label="${esc(it)}">${ic('check')}</button><span>${esc(it)}</span></li>`).join('')}</ul>
        <div class="sh-check-list__f${all ? ' is-ok' : ''}">${all ? `${ic('check')}Tout est vérifié : tu peux prendre le trade.` : `${done.length}/${items.length} vérifiés`}${done.length ? '<button type="button" class="sh-link" data-ref-reset>Recommencer</button>' : ''}</div></div>` : '<p class="sh-empty">La checklist de ce scanner arrive bientôt.</p>';
    }
    return `<div class="sh-ref" style="--c:${esc(sc.logoColor || 'var(--a1, #fc1283)')}">
      <div class="sh-ref__head">
        <span class="sh-ref__logo">${sc.logo ? `<img src="${esc(sc.logo)}" alt="">` : esc(sc.logoInitials || sc.name.slice(0, 2))}</span>
        <span class="sh-ref__who"><span class="chest-step">Scanner de référence</span><b>${esc(sc.name)}</b>${g ? `<small>${esc(g.tagline)}</small>` : ''}</span>
        <button type="button" class="chest-btn" data-ref-open>Ouvrir le graphique ${ic('go')}</button>
      </div>
      <nav class="sh-ref__tabs" role="tablist">${[['trades', 'Derniers trades'], ['strategy', 'Stratégie'], ['check', 'Avant de trader']].map(([k, l]) => `<button type="button" role="tab" data-ref-tab="${k}" aria-selected="${tab === k}">${l}</button>`).join('')}</nav>
      <div class="sh-ref__body">${body}</div></div>`;
  }
  function paintRef() { const el = document.getElementById('shRef'); if (el) el.innerHTML = ROLE === 'member' ? ref2() : refHtml(); }

  // ---------------------------------------------------------------- rendus par rôle

  // ---------------------------------------------------------------- vue membre CHEST 2.0 (2026-11-02)
  // Mise en page de CHEST-DESIGN-2.0/html-exact/School.html : héros « prochain appel », semaine, trois cartes
  // (prochain appel, missions, infos), scanner de référence + « avant de trader ». Mêmes données et mêmes
  // actions que la vue v3 (data-task, data-post, data-ref-*, data-trade, data-suivi).
  const MONO2 = "font-family: 'Fragment Mono', ui-monospace, monospace;";
  const LBL2 = MONO2 + ' font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink-3, rgb(122, 122, 130));';
  const TILE2 = 'border-radius: 18px; border: 1px solid rgba(var(--fg-rgb, 255, 255, 255), 0.07); background: linear-gradient(rgba(var(--fg-rgb, 255, 255, 255), 0.035), rgba(var(--fg-rgb, 255, 255, 255), 0.01)); box-shadow: rgba(255, 255, 255, 0.05) 0px 1px 0px inset; padding: 22px; display: flex; flex-direction: column;';
  const GRAD2 = 'background: linear-gradient(135deg, rgb(var(--a1-rgb, 252, 18, 131)), rgb(var(--a2-rgb, 249, 164, 94))); -webkit-background-clip: text; background-clip: text; color: transparent;';
  function nextCall2() {
    const M = S.mentor || {};
    const mine = (M.events || []).filter((e) => (e.status === 'confirmed' || e.status === 'proposed') && Date.parse(e.startsAt) + e.minutes * 60000 >= Date.now());
    return mine.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0] || null;
  }
  const jMinus = (d) => { const n = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / DAY); return n <= 0 ? 'Aujourd’hui' : 'J−' + n; };
  function icsHref(e) {
    const f = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const end = new Date(Date.parse(e.startsAt) + e.minutes * 60000);
    const txt = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CHEST//School//FR', 'BEGIN:VEVENT', `UID:chest-${e.id}@ch3st.app`, `DTSTAMP:${f(new Date())}`, `DTSTART:${f(e.startsAt)}`, `DTEND:${f(end)}`, `SUMMARY:${String(e.title || 'Appel CHEST').replace(/[,;\n]/g, ' ')}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(txt);
  }
  function hero2() {
    const M = S.mentor || {}, nx = nextCall2(), edu = M.educator;
    const tasks = M.tasks || [], done = tasks.filter((t) => t.doneAt).length;
    const sc = S.ref && window.CHESTScanners && CHESTScanners.get(S.ref.scanner);
    const title = nx ? `Prêt pour ${fr(nx.startsAt, { weekday: 'long' })} ?` : 'Ta semaine';
    const stat = (k, v, first, grad) => `<div style="display: flex; flex-direction: column; gap: 6px; padding: 0px 24px;${first ? '' : ' border-left: 1px solid rgba(var(--fg-rgb, 255, 255, 255), 0.09);'}"><dt style="${MONO2} font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink-3, rgb(122, 122, 130));">${k}</dt><dd style="margin: 0px; font-size: 20px; font-weight: 700;${grad ? ' ' + GRAD2 : ''}">${v}</dd></div>`;
    return `<section style="position: relative; isolation: isolate; display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 14px 0px 26px; text-align: center; border-bottom: 1px solid rgba(var(--fg-rgb, 255, 255, 255), 0.07);">
        <div class="ghost" aria-hidden="true" style="position: absolute; left: 50%; top: -26px; transform: translateX(-50%); z-index: -1; pointer-events: none; white-space: nowrap; font-size: 210px; font-weight: 700; letter-spacing: -0.06em; line-height: 1; background: linear-gradient(rgba(var(--fg-rgb, 255, 255, 255), 0.075), rgba(var(--fg-rgb, 255, 255, 255), 0) 78%); -webkit-background-clip: text; background-clip: text; color: transparent;">School</div>
        <span style="${MONO2} font-size: 10.5px; letter-spacing: 0.24em; text-transform: uppercase; color: var(--ink-3, rgb(122, 122, 130));">01 — Ton espace</span>
        <h1 style="margin: 0px; font-size: 64px; line-height: 1; font-weight: 700; letter-spacing: -0.05em;">${esc(title)}</h1>
        ${edu ? `<a href="suivi.html" data-suivi style="display: flex; align-items: center; gap: 12px; padding: 8px 16px 8px 8px; border-radius: 999px; border: 1px solid rgba(var(--fg-rgb, 255, 255, 255), 0.08); background: rgba(var(--fg-rgb, 255, 255, 255), 0.02); color: var(--ink, rgb(246, 246, 247)); text-decoration: none;">
          <span style="width: 34px; height: 34px; border-radius: 999px; display: grid; place-items: center; font-weight: 700; color: var(--bg-0, rgb(5, 5, 5)); background: var(--green-hi, rgb(127, 243, 202));">${esc(initials(edu.name).slice(0, 1))}</span>
          <span style="display: flex; flex-direction: column; gap: 1px; text-align: left;"><span style="font-size: 11px; color: var(--ink-3, rgb(122, 122, 130));">Ton éducateur</span><span style="font-weight: 600;">${esc(edu.first || edu.name)}</span></span>
        </a>` : ''}
        <dl style="margin: 6px 0px 0px; display: flex; flex-wrap: wrap; justify-content: center;">
          ${stat('Prochain appel', nx ? jMinus(nx.startsAt) : '—', true, !!nx)}${stat('Missions', tasks.length ? `${done} / ${tasks.length}` : '—')}${stat('Scanner', sc ? esc(sc.name) : '—')}
        </dl>
        <div id="sh2Search" style="width: 100%; max-width: 520px;"></div>
      </section>`;
  }
  function week2() {
    const D = S.agenda || { events: [], tasks: [] };
    const days = Array.from({ length: 7 }, (_, i) => new Date(S.week.getTime() + i * DAY));
    const thisWeek = sameDay(S.week, mondayOf(new Date()));
    const cols = days.map((d, i) => {
      const evs = D.events.filter((e) => sameDay(e.startsAt, d)).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
      const today = sameDay(d, new Date());
      return `<div style="display: flex; flex-direction: column; gap: 8px; min-height: 170px; padding: 14px 10px; border-left: ${i ? '1px solid rgba(var(--fg-rgb, 255, 255, 255), 0.06)' : '0px'}; background: ${today ? 'linear-gradient(rgba(var(--a1-rgb, 252, 18, 131), 0.07), transparent 70%)' : 'transparent'};">
          <div style="display: flex; align-items: baseline; gap: 6px; padding: 0px 4px;"><span style="font-size: 12.5px; font-weight: 700; color: ${today ? 'var(--ink, rgb(246, 246, 247))' : 'var(--ink-1, rgb(201, 201, 206))'};">${fr(d, { weekday: 'short' }).replace('.', '').replace(/^./, (c) => c.toUpperCase())}</span><span style="${MONO2} font-size: 10.5px; color: var(--ink-3, rgb(122, 122, 130));">${d.getDate()}</span></div>
          ${evs.map((e) => {
            const chest = e.chest || e.type !== 'personal';
            const who = e.chest ? 'CHEST' : e.type === 'personal' ? (ownerOf(e) ? ownerOf(e).first : 'Appel') : kindOf(e).label;
            const c = chest ? ['rgba(var(--a2-rgb, 249, 164, 94), 0.3)', 'linear-gradient(160deg, rgba(var(--a1-rgb, 252, 18, 131), 0.1), rgba(var(--a2-rgb, 249, 164, 94), 0.04))', 'rgb(var(--a2-rgb, 249, 164, 94))'] : ['rgba(var(--green-rgb, 51, 230, 166), 0.3)', 'linear-gradient(160deg, rgba(var(--green-rgb, 51, 230, 166), 0.1), rgba(var(--green-rgb, 51, 230, 166), 0.03))', 'var(--green-hi, rgb(127, 243, 202))'];
            const past = Date.parse(e.startsAt) + e.minutes * 60000 < Date.now();
            return `<button type="button" data-ev="${esc(e.id)}" style="display: flex; flex-direction: column; gap: 4px; padding: 10px; border-radius: 11px; border: 1px solid ${c[0]}; background: ${c[1]}; color: var(--ink, rgb(246, 246, 247)); font: inherit; text-align: left; cursor: pointer; opacity: ${past ? 0.55 : 1};">
              <span style="${MONO2} font-size: 10px; color: ${c[2]};">${hm(e.startsAt)} · ${esc(who)}</span>
              <span style="font-size: 12.5px; font-weight: 600; line-height: 1.3;">${esc(e.title)}</span>${isNewEv(e) ? '<span class="sh-new" style="align-self: flex-start;">Nouveau</span>' : ''}</button>`;
          }).join('')}
        </div>`;
    }).join('');
    return `<section style="display: flex; flex-direction: column; gap: 14px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="${MONO2} font-size: 10.5px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--ink-3, rgb(122, 122, 130));">02 — ${thisWeek ? 'Cette semaine' : `Semaine du ${fr(S.week, { day: 'numeric', month: 'long' })}`}</span>
          ${newBadgePlan()}<span style="flex: 1 1 0%; height: 1px; background: rgba(var(--fg-rgb, 255, 255, 255), 0.07);"></span>
          <button type="button" class="sh-ib" data-week="-1" aria-label="Semaine précédente">${ic('left')}</button><button type="button" class="sh-ib" data-week="1" aria-label="Semaine suivante">${ic('right')}</button>
          ${thisWeek ? '' : '<button type="button" class="sh-link" data-week="0">Aujourd’hui</button>'}
        </div>
        <div style="overflow-x: auto;"><div style="min-width: 820px; display: grid; grid-template-columns: repeat(7, minmax(0px, 1fr)); border-radius: 18px; border: 1px solid rgba(var(--fg-rgb, 255, 255, 255), 0.07); background: rgba(var(--fg-rgb, 255, 255, 255), 0.016); overflow: hidden;">${cols}</div></div>
      </section>`;
  }
  function cards2() {
    const M = S.mentor || {}, nx = nextCall2();
    const tasks = (M.tasks || []).slice().sort((a, b) => (!!a.doneAt - !!b.doneAt) || (Date.parse(a.dueAt || 0) - Date.parse(b.dueAt || 0)));
    const done = tasks.filter((t) => t.doneAt).length;
    const call = nx ? `<div style="position: relative; overflow: hidden; border-radius: 18px; border: 1px solid rgba(var(--fg-rgb, 255, 255, 255), 0.12); background: linear-gradient(160deg, rgba(var(--dk-rgb, 16, 16, 19), 0.75), rgba(var(--dk-rgb, 9, 9, 11), 0.9)); box-shadow: rgba(255, 255, 255, 0.12) 1.5px 1.5px 0px inset, rgba(var(--fg-rgb, 255, 255, 255), 0.03) -1.5px -1.5px 0px inset; padding: 22px; display: flex; flex-direction: column; gap: 14px;">
          <div aria-hidden="true" style="position: absolute; right: -80px; top: -90px; width: 260px; height: 240px; background: radial-gradient(closest-side, rgba(var(--a1-rgb, 252, 18, 131), 0.22), transparent);"></div>
          <span style="position: relative; ${LBL2}">Prochain appel${nx.status === 'proposed' ? ' · à confirmer' : ''}</span>
          <span style="position: relative; font-size: 22px; font-weight: 700; letter-spacing: -0.025em;">${esc(nx.title || 'Appel')}</span>
          <div style="position: relative; display: flex; align-items: baseline; gap: 10px;">
            <span style="font-size: 44px; line-height: 1; font-weight: 700; letter-spacing: -0.045em; font-variant-numeric: tabular-nums; ${GRAD2} padding-bottom: 0.06em;">${jMinus(nx.startsAt)}</span>
            <span style="color: var(--ink-2, rgb(155, 155, 161));">${esc(fr(nx.startsAt, { weekday: 'long', day: 'numeric', month: 'short' }))} · ${hm(nx.startsAt)}</span>
          </div>
          <div style="position: relative; display: flex; gap: 10px; margin-top: auto;">
            <a href="${icsHref(nx)}" download="appel-chest.ics" style="display: flex; align-items: center; height: 40px; padding: 0px 16px; border-radius: 999px; color: rgb(var(--fg-rgb, 255, 255, 255)); font-weight: 600; text-decoration: none; background: linear-gradient(135deg, rgb(var(--a1-rgb, 252, 18, 131)), rgb(var(--a2-rgb, 249, 164, 94))); box-shadow: rgba(var(--a1-rgb, 252, 18, 131), 0.28) 0px 10px 30px;">Ajouter à mon agenda</a>
            <a href="suivi.html" data-suivi style="display: flex; align-items: center; height: 40px; padding: 0px 16px; border-radius: 999px; border: 1px solid rgba(var(--fg-rgb, 255, 255, 255), 0.14); color: var(--ink-1, rgb(201, 201, 206)); text-decoration: none;">Déplacer</a>
          </div>
        </div>` : `<div class="tile" style="${TILE2} gap: 14px;"><span style="${LBL2}">Prochain appel</span><p style="margin: 0px; font-size: 13px; line-height: 1.6; color: var(--ink-2, rgb(155, 155, 161));">${M.educator ? `Pas d’appel prévu pour l’instant avec ${esc(M.educator.first)}.` : 'Pas encore d’éducateur rattaché à ton compte.'}</p>${M.educator ? '<a href="suivi.html" data-suivi class="sh-link" style="align-self: flex-start;">Ouvrir ton espace →</a>' : ''}</div>`;
    const missions = `<div class="tile" style="${TILE2} gap: 6px;">
          <div style="display: flex; align-items: center; gap: 10px; padding-bottom: 6px;"><span style="${LBL2}">Avant le prochain appel</span>${tasks.length ? `<span style="margin-left: auto; font-size: 12px; font-weight: 600; color: rgb(var(--a2-rgb, 249, 164, 94));">${done} / ${tasks.length}</span>` : ''}</div>
          ${tasks.length ? tasks.slice(0, 5).map((t) => {
            const late = !t.doneAt && t.dueAt && Date.parse(t.dueAt) < Date.now();
            const sub = t.doneAt ? `fait le ${fr(t.doneAt, { day: 'numeric', month: 'short' })}` : t.dueAt ? `${late ? 'en retard · ' : 'avant '}${fr(t.dueAt, { weekday: 'long', day: 'numeric', month: 'short' })}` : 'sans date';
            return `<button type="button" data-task="${t.id}" role="checkbox" aria-checked="${!!t.doneAt}" style="display: flex; align-items: flex-start; gap: 12px; padding: 10px 0px; border: 0; border-bottom: 1px solid rgba(var(--fg-rgb, 255, 255, 255), 0.055); background: none; color: inherit; font: inherit; text-align: left; cursor: pointer;">
              <span aria-hidden="true" style="width: 18px; height: 18px; flex: 0 0 18px; margin-top: 1px; border-radius: 4px; display: grid; place-items: center; ${t.doneAt ? 'background: rgb(var(--a1-rgb, 252, 18, 131));' : 'border: 1.5px solid rgba(var(--fg-rgb, 255, 255, 255), 0.5);'} color: #fff; font-size: 12px; font-weight: 700;">${t.doneAt ? '✓' : ''}</span>
              <span style="display: flex; flex-direction: column; gap: 2px;"><span style="font-size: 13px; color: ${t.doneAt ? 'var(--ink-3, rgb(122, 122, 130))' : 'var(--ink, rgb(246, 246, 247))'}; text-decoration: ${t.doneAt ? 'line-through' : 'none'};">${esc(t.title)}</span>
              <span style="${MONO2} font-size: 10.5px; color: ${late ? 'var(--red-hi, rgb(255, 148, 160))' : 'var(--ink-3, rgb(122, 122, 130))'};">${esc(sub)}</span></span></button>`;
          }).join('') : `<p style="margin: 0px; font-size: 13px; color: var(--ink-2, rgb(155, 155, 161));">Rien à préparer pour l’instant.</p>`}
        </div>`;
    const posts = (S.posts || []).slice(0, 2);
    const infos = `<div class="tile" style="${TILE2} gap: 14px;"><span style="${LBL2}">Infos</span>
          ${posts.length ? posts.map((p) => `<button type="button" data-post="${p.id}" style="display: flex; flex-direction: column; gap: 6px; padding: 0px 0px 14px; border: 0; border-bottom: 1px solid rgba(var(--fg-rgb, 255, 255, 255), 0.055); background: none; color: inherit; font: inherit; text-align: left; cursor: pointer;">
              <span style="display: flex; align-items: center; gap: 8px;"><span style="font-size: 9.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; padding: 3px 7px; border-radius: 999px; color: var(--bg-0, rgb(5, 5, 5)); background: ${p.chest ? 'linear-gradient(135deg, rgb(var(--a1-rgb, 252, 18, 131)), rgb(var(--a2-rgb, 249, 164, 94)))' : 'var(--green-hi, rgb(127, 243, 202))'};">${p.chest ? 'CHEST' : esc(String(p.author || 'Équipe').split(' ')[0])}</span><span style="${MONO2} font-size: 10.5px; color: var(--ink-3, rgb(122, 122, 130));">${esc(relDay(p.createdAt).toLowerCase())}</span></span>
              <span style="font-weight: 600;">${esc(p.title)}</span>
              <span style="font-size: 12.5px; line-height: 1.55; color: var(--ink-2, rgb(155, 155, 161));">${esc(String(p.body || '').slice(0, 120))}${String(p.body || '').length > 120 ? '…' : ''}</span></button>`).join('') : '<p style="margin: 0px; font-size: 13px; color: var(--ink-2, rgb(155, 155, 161));">Pas d’info de l’équipe pour l’instant.</p>'}
        </div>`;
    return `<section style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr)); gap: 16px;">${call}${missions}</section>`;
  }
  function ref2() {
    const R = S.ref;
    const sc = R && window.CHESTScanners && CHESTScanners.get(R.scanner);
    if (!sc) return '';
    const g = window.CHESTScannerGuide && CHESTScannerGuide.data ? CHESTScannerGuide.data(R.scanner) : null;
    const rowR = (t) => {
      const lv = t.levels || {}, tps = lv.tps || (lv.tp != null ? [lv.tp] : []), m = /^tp(\d+)$/.exec(t.status || '');
      const risk = lv.pe != null && lv.sl != null ? Math.abs(lv.pe - lv.sl) : 0;
      if (t.status === 'sl') return -1;
      return m && risk && tps[Number(m[1]) - 1] != null ? Math.abs(tps[Number(m[1]) - 1] - lv.pe) / risk : null;
    };
    const trades = (R.trades || []).slice(0, 4).map((t) => {
      const buy = t.side === 'buy', r = rowR(t), d = new Date(t.time);
      const st = !t.status || t.status === 'active' ? 'En cours' : t.status === 'sl' ? 'Stop' : 'Objectif';
      return `<button type="button" class="row-h" data-trade="${esc(t.symbol)}|${esc(t.tf)}" style="display: grid; grid-template-columns: 1.3fr 0.8fr 1fr 0.6fr; align-items: center; gap: 10px; padding: 10px 8px; margin: 0px -8px; border: 0; border-radius: 10px; background: none; color: inherit; font: inherit; font-size: 12.5px; text-align: left; cursor: pointer;">
              <span style="color: var(--ink-2, rgb(155, 155, 161)); font-variant-numeric: tabular-nums;">${fr(d, { day: 'numeric', month: 'short' })} ${hm(d)}</span>
              <span><span style="font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; padding: 3px 8px; border-radius: 999px; color: ${buy ? 'var(--green-hi, rgb(127, 243, 202))' : 'var(--red-hi, rgb(255, 148, 160))'}; background: ${buy ? 'rgba(var(--green-rgb, 51, 230, 166), 0.12)' : 'rgba(var(--red-rgb, 255, 77, 94), 0.12)'};">${buy ? 'Achat' : 'Vente'}</span></span>
              <span style="color: var(--ink-2, rgb(155, 155, 161));">${st} · ${esc(t.symbol)}</span>
              <span style="text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; color: ${r == null ? 'var(--ink-2, rgb(155, 155, 161))' : r >= 0 ? 'var(--green-hi, rgb(127, 243, 202))' : 'var(--red-hi, rgb(255, 148, 160))'};">${r == null ? '—' : (r >= 0 ? '+' : '−') + Math.abs(r).toFixed(1).replace('.', ',') + ' R'}</span></button>`;
    }).join('');
    const items = g ? g.recap : [];
    const ok = checks(R.scanner);
    return `<section style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(380px, 100%), 1fr)); gap: 16px;">
        <div class="tile" style="${TILE2} gap: 12px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            ${sc.logo ? `<img src="${esc(sc.logo)}" alt="" style="width: 40px; height: 40px; border-radius: 11px; object-fit: cover;">` : ''}
            <span style="display: flex; flex-direction: column; gap: 2px;"><span style="${LBL2}">03 — Ton scanner de référence</span><span style="font-size: 17px; font-weight: 700;">${esc(sc.name)}</span></span>
            <button type="button" data-ref-open style="margin-left: auto; border: 0; background: none; color: var(--ink-2, rgb(155, 155, 161)); font: inherit; font-size: 12px; cursor: pointer;">Ouvrir →</button>
          </div>
          ${trades || `<p style="margin: 0px; font-size: 13px; color: var(--ink-2, rgb(155, 155, 161));">${R.available === false ? 'Le scanner ne répond pas pour le moment.' : 'Pas de trade récent. Ouvre le graphique pour voir les signaux en direct.'}</p>`}
        </div>
        <div class="tile" style="${TILE2} gap: 4px;">
          <div style="display: flex; align-items: center; gap: 10px; padding-bottom: 8px;"><span style="${LBL2}">Avant de trader aujourd’hui</span><span style="margin-left: auto; font-size: 11.5px; color: var(--ink-3, rgb(122, 122, 130));">remis à zéro chaque matin</span></div>
          ${items.length ? items.map((it, i) => `<button type="button" data-ref-check="${i}" role="checkbox" aria-checked="${ok.includes(i)}" style="display: flex; align-items: center; gap: 12px; padding: 9px 0px; border: 0; border-bottom: 1px solid rgba(var(--fg-rgb, 255, 255, 255), 0.05); background: none; color: inherit; font: inherit; text-align: left; cursor: pointer;">
              <span aria-hidden="true" style="width: 18px; height: 18px; flex: 0 0 18px; border-radius: 4px; display: grid; place-items: center; ${ok.includes(i) ? 'background: rgb(var(--green-rgb, 51, 230, 166)); color: var(--bg-0, rgb(5, 5, 5));' : 'border: 1.5px solid rgba(var(--fg-rgb, 255, 255, 255), 0.5);'} font-size: 12px; font-weight: 700;">${ok.includes(i) ? '✓' : ''}</span>
              <span style="font-size: 13px; color: var(--ink, rgb(246, 246, 247));">${esc(it)}</span></button>`).join('') : '<p style="margin: 0px; font-size: 13px; color: var(--ink-2, rgb(155, 155, 161));">La checklist de ce scanner arrive bientôt.</p>'}
        </div>
      </section>`;
  }

  // Dernières nouvelles School (GET /school/notifs) : qui a ajouté quoi, et les rappels 15 min avant un appel.
  const NK = { event: ['cal', 'Appel'], task: ['flag', 'Mission'], idea: ['info', 'Idea'], share: ['book', 'Contenu'], remind: ['cal', 'Rappel'] };
  function newsHtml() {
    const list = (S.notifs || []).slice(0, 4);
    if (!list.length) return '';
    return `<section class="sh-news" aria-label="Dernières nouvelles"><span class="chest-step">Dernières nouvelles</span><ul>${list.map((n) => {
      const k = NK[n.kind] || NK.event;
      return `<li class="sh-news__it is-${esc(n.kind)}${n.createdAt > S.notifSeen ? ' is-new' : ''}"><span class="sh-news__ic">${ic(k[0])}</span><span class="sh-news__t"><b>${esc(n.title)}</b><small>${esc(n.body)}</small></span><time>${esc(ago(Date.parse(n.createdAt)))}</time></li>`;
    }).join('')}</ul></section>`;
  }

  function renderMember() {
    let n = 3;
    root.innerHTML = `<div class="sh2" style="display: flex; flex-direction: column; gap: 30px; color: var(--ink, rgb(246, 246, 247)); font-size: 13.5px; line-height: normal;">${hero2()}${newsHtml()}${week2()}${cards2()}${feed2()}<div id="shRef">${ref2()}</div></div>`;
    // la recherche des cours (js/school.js) passe sous le héros ; l'ancien en-tête School est masqué
    const sb = document.getElementById('scSearchBox'), slot = document.getElementById('sh2Search');
    if (sb && slot) slot.appendChild(sb);
    document.getElementById('scHome').classList.add('is-sh2');
    // les rubriques de cours (js/school.js) continuent la numérotation
    document.querySelectorAll('[data-sc-num]').forEach((el) => { el.textContent = `${pad(++n)} — ${el.dataset.scNum}`; });
  }

  const TABS = {
    educator: [['planning', 'Planning'], ['people', 'Élèves'], ['ideas', 'Idea'], ['missions', 'Missions'], ['content', 'Contenu']],
    admin: [['planning', 'Planning'], ['people', 'Membres'], ['educators', 'Éducateurs'], ['ideas', 'Idea'], ['missions', 'Missions'], ['content', 'Contenu des cours']],
  };

  function staffFacts() {
    const D = S.agenda || { events: [], tasks: [] };
    const now = Date.now();
    const upcoming = D.events.filter((e) => Date.parse(e.startsAt) >= now).length;
    const asks = D.events.filter((e) => e.status === 'proposed').length;
    const late = D.tasks.filter((t) => !t.doneAt && t.dueAt && Date.parse(t.dueAt) < now).length;
    const people = S.people ? S.people.length : 0;
    const f = [[people, ROLE === 'admin' ? (people > 1 ? 'membres' : 'membre') : (people > 1 ? 'élèves' : 'élève')], [upcoming, 'à venir sur 2 semaines'], [asks, asks > 1 ? 'appels à confirmer' : 'appel à confirmer', asks ? 'ask' : ''], [late, late > 1 ? 'missions en retard' : 'mission en retard', late ? 'late' : '']];
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
        <div class="sh-head__acts"><button type="button" class="chest-btn-2" data-compose="post">${ic('info')}Idea</button><button type="button" class="chest-btn-2" data-compose="task">${ic('flag')}Mission</button><button type="button" class="chest-btn" data-compose="event">${ic('cal')}Appel</button></div></header>
      ${staffFacts()}${newsHtml()}
      <nav class="sh-tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${S.tab === k}">${l}${k === 'planning' && S.planNew.size ? `<em class="sh-tabn">+${S.planNew.size}</em>` : ''}</button>`).join('')}</nav>
      <div class="sh-panel" id="shPanel"></div>`;
    renderTab();
  }

  async function renderTab() {
    const box = document.getElementById('shPanel');
    if (!box) return;
    try { localStorage.setItem('chest_school_tab_' + ROLE, S.tab); } catch (e) { /* tant pis */ }
    if (S.tab === 'planning') { box.innerHTML = weekHtml(); scrollCal(); return; }
    if (S.tab === 'people') {
      box.innerHTML = '<div id="shPeople"></div>';
      if (window.CHESTMentorHub) await CHESTMentorHub.render(document.getElementById('shPeople'), { compact: true });
      return;
    }
    if (S.tab === 'educators') { box.innerHTML = educatorsHtml(); return; }
    if (S.tab === 'ideas') { box.innerHTML = ideasHtml(); return; }
    if (S.tab === 'missions') { box.innerHTML = missionsHtml(); return; }
    if (S.tab === 'content' && ROLE === 'educator') { box.innerHTML = eduContentHtml(); return; }
    if (S.tab === 'content') {
      box.innerHTML = `<div class="sh-content">
        <button type="button" class="sh-door" data-go="written">${ic('book')}<span><b>Cours écrits</b><small>Trading, UGC, Psychologie, Autres ressources : ajoute, modifie ou retire un élément (menu ⋮ sur chaque carte).</small></span><span class="sh-go">Gérer ${ic('go')}</span></button>
        <button type="button" class="sh-door" data-go="video">${ic('play')}<span><b>Cours vidéo</b><small>Mindset et Business : les vidéos, leurs miniatures et les rediffusions à compléter.</small></span><span class="sh-go">Gérer ${ic('go')}</span></button></div>
        <div class="sh-refpick"><div class="sh-sub sh-sub--top"><span class="chest-step">Scanner de référence</span><span class="sh-hint">Montré à tous les membres en haut de School, avec ses derniers trades, sa stratégie et sa checklist.</span></div>
          <div class="sh-pills">${scannerList().map((x) => `<button type="button" class="sh-pill${S.ref && S.ref.scanner === x.id ? ' is-on' : ''}" data-ref-pick="${x.id}" aria-pressed="${!!(S.ref && S.ref.scanner === x.id)}">${x.logo ? `<img src="${esc(x.logo)}" alt="">` : ''}${esc(x.name)}</button>`).join('')}</div></div>`;
    }
  }

  // Contenu, côté éducateur (2026-11-08) : les cours en lecture (modifiables par l'admin seul), « Envoyer à… » sur chaque
  // élément (menu ⋮), et les vidéos de SON scanner, qu'il ajoute lui-même (lien YouTube / Vimeo ou fichier, comme l'admin).
  function eduContentHtml() {
    const sid = U.scanner, sc = sid && window.CHESTScanners && CHESTScanners.get(sid);
    const vids = sid && window.CHESTSchool ? CHESTSchool.videos().filter((v) => v.section === 'scanners' && v.scanner === sid).sort((a, b) => b.ts - a.ts) : [];
    const scan = sc ? `<section class="sh-scv" style="--c:${esc(sc.logoColor || 'var(--a1, #fc1283)')}">
        <header class="sh-scv__h"><span class="sh-ref__logo">${sc.logo ? `<img src="${esc(sc.logo)}" alt="">` : esc(sc.logoInitials || sc.name.slice(0, 2))}</span>
          <span class="sh-ref__who"><span class="chest-step">Ton scanner</span><b>${esc(sc.name)}</b><small>${plural(vids.length, 'vidéo', 'vidéos')} · visibles par tous dans Cours vidéo → Scanners</small></span>
          <button type="button" class="chest-btn" data-scv-add>${ic('plus')}Ajouter une vidéo</button></header>
        ${vids.length ? `<ul class="sh-scv__list">${vids.map((v) => { const th = CHESTSchool.thumb(v); return `<li><button type="button" class="sh-scv__th" data-scv-play="${esc(v.id)}" aria-label="Lire ${esc(v.title)}"${th ? ` style="background-image:url('${esc(th)}')"` : ''}>${ic('play')}</button>
          <span class="sh-scv__t"><b>${esc(v.title)}</b><small>${v.duration ? esc(v.duration) + ' · ' : ''}${esc(fr(v.createdAt || Date.now(), { day: 'numeric', month: 'short' }))}</small></span>
          <span class="sh-scv__a"><button type="button" class="chest-btn-2" data-scv-share="${esc(v.id)}">${ic('share')}Envoyer</button><button type="button" class="sh-link" data-scv-edit="${esc(v.id)}">Modifier</button></span></li>`; }).join('')}</ul>`
        : '<p class="sh-empty">Pas encore de vidéo pour ton scanner. Colle un lien YouTube ou envoie un fichier : elle apparaît chez tous les membres.</p>'}</section>`
      : `<p class="sh-empty">Aucun scanner n’est rattaché à ton compte pour l’instant : l’admin te le donne depuis Admin → Éducateurs. Tu pourras alors y ajouter tes vidéos.</p>`;
    return `${scan}<div class="sh-sub sh-sub--top"><span class="chest-step">Les cours</span><span class="sh-hint">Ouvre une catégorie, puis les options (•••) d’un élément → « Envoyer à… » pour le partager à tes élèves. Seul l’admin les modifie.</span></div>
      <div class="sh-content">
        <button type="button" class="sh-door" data-go="written">${ic('book')}<span><b>Cours écrits</b><small>Trading, UGC, Psychologie, Autres ressources.</small></span><span class="sh-go">Parcourir ${ic('go')}</span></button>
        <button type="button" class="sh-door" data-go="video">${ic('play')}<span><b>Cours vidéo</b><small>Mindset, Business et les vidéos des scanners.</small></span><span class="sh-go">Parcourir ${ic('go')}</span></button></div>`;
  }

  // « Envoyer à… » : un élément des cours vers la bibliothèque du suivi des membres choisis (POST /school/share).
  async function share(item) {
    await ensurePeople();
    Object.assign(C, { kind: 'share', picked: [], q: '' });
    S.shareItem = item;
    S.dlgRender = shareHtml;
    openDlg(shareHtml(), false, async () => {
      if (!C.picked.length) throw new Error('Choisis au moins un membre.');
      const r = await postJson('/school/share', Object.assign({ members: C.picked }, item));
      toast(`Envoyé à ${plural(r.members, 'membre', 'membres')} : c’est dans leur suivi.`);
    });
  }
  function shareHtml() {
    const it = S.shareItem || {};
    return `<div class="sh-comp"><header class="sh-comp__h"><span class="chest-step">Envoyer</span><h2>${esc(it.title || '')}</h2></header>
      ${pickerHtml()}
      <p class="sh-hint">L’élément arrive dans la bibliothèque de leur suivi, et ils sont prévenus.</p>
      <p class="sh-msg" id="shMsg" role="alert"></p>
      <footer class="sh-comp__f"><button type="button" class="chest-btn-2" data-close>Annuler</button><button type="submit" class="chest-btn">Envoyer${C.picked.length ? ` à ${C.picked.length}` : ''}</button></footer></div>`;
  }

  const PALETTE = ['#a855f7', '#f5c451', '#38bdf8', 'var(--green, #33e6a6)', 'var(--a1, #fc1283)', 'var(--a2, #f9a45e)', 'var(--red, #ff4d5e)', '#2dd4bf', '#4d8dff', '#e8e8ee'];
  function colorsHtml() {
    const staff = ((S.agenda && S.agenda.staff) || []).filter((x) => x.role !== 'admin');
    if (!staff.length) return '';
    return `<div class="sh-colors"><div class="sh-sub"><span class="chest-step">Couleurs du planning</span><span class="sh-hint">Visibles par toi seul : chaque call prend la couleur de son éducateur, ce que tu poses prend celle de CHEST.</span></div>
      <ul>${staff.map((x) => `<li style="--c:${esc(x.color)}"><span class="sh-colors__who"><i></i><b>${esc(x.name)}</b><small>${x.role === 'admin' ? 'Admin' : 'Éducateur'}</small></span>
        <span class="sh-swatches">${PALETTE.map((c) => `<button type="button" class="sh-sw${c === x.color ? ' is-on' : ''}" style="--s:${c}" data-color="${c}" data-staff="${x.id}" aria-label="${esc(x.first)} en ${c}" aria-pressed="${c === x.color}"></button>`).join('')}
        <label class="sh-sw sh-sw--pick" title="Autre couleur"><input type="color" value="${esc(x.color)}" data-staff-pick="${x.id}" aria-label="Autre couleur pour ${esc(x.first)}"></label></span></li>`).join('')}</ul></div>`;
  }

  function educatorsHtml() {
    const E = S.educators;
    if (!E) return '<p class="sh-empty">Chargement…</p>';
    if (!E.length) return colorsHtml() + '<p class="sh-empty">Aucun éducateur pour le moment. Donne le rôle Éducateur à un membre depuis Admin → Membres.</p>';
    return `${colorsHtml()}<div class="sh-sub sh-sub--top"><span class="chest-step">Éducateurs</span></div><div class="sh-edus">${E.map((e) => `<button type="button" class="sh-edu" data-edu="${e.id}">
      <span class="sh-av">${esc(initials(e.name))}</span>
      <span class="sh-edu__who"><b>${esc(e.name)}</b><small>${e.code ? `Code ${esc(e.code)}` : 'Code pas encore choisi'}${(() => { const sc = e.scanner && scannerList().find((x) => x.id === e.scanner); return sc ? ` · ${esc(sc.name)}` : ''; })()}</small></span>
      <span class="sh-edu__n"><b>${e.students}</b>${e.students > 1 ? 'élèves' : 'élève'}</span>
      <span class="sh-edu__n"><b>${e.calls}</b>appels 7 j</span>
      <span class="sh-edu__n"><b>${e.notes30}</b>notes 30 j</span>
      <span class="sh-edu__n${e.late ? ' is-late' : ''}"><b>${e.late}</b>en retard</span>
      <span class="sh-go">Ses élèves ${ic('go')}</span></button>`).join('')}</div>`;
  }

  function ideasHtml() {
    return `<div class="sh-feedsec"><div class="sh-feedsec__h"><span class="chest-step">Idea publiées</span><h2>Les idées de l’équipe</h2>${newBadge()}${ideaTabs(S.posts || [])}<button type="button" class="chest-btn sh-feedsec__add" data-compose="post">+ Nouvelle Idea</button></div>
      ${postsHtml(S.posts || [], 'Aucune Idea active. Une Idea apparaît dans School chez tous ceux que tu vises.')}</div>`;
  }
  // Missions : le suivi personnalisé (copiées chez chaque membre visé), à ne pas confondre avec les Idea
  function missionsHtml() {
    const M = S.missions;
    return `<div class="sh-missions">
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
    // recherche dans la liste des personnes : seule la liste est redessinée (le champ garde le focus)
    dlg.addEventListener('input', (e) => {
      if (e.target.id !== 'pickQ') return;
      C.q = e.target.value;
      const box = document.createElement('div'); box.innerHTML = pickerHtml();
      const list = document.getElementById('pickList'), fresh = box.querySelector('#pickList');
      if (list && fresh) list.innerHTML = fresh.innerHTML;
    });
    return dlg;
  }
  function openDlg(html, wide, onSubmit) {
    ensureDlg();
    document.getElementById('shDlgIn').innerHTML = html;
    dlg.classList.toggle('is-wide', !!wide);
    dlg.classList.remove('is-post');
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
    const src = p.image ? fileUrl(p.image) : '';
    openDlg(`<div class="sh-detail sh-detail--post sh-pd sh-pd--${fmtOf(p)}">
      ${src ? `<button type="button" class="sh-pd__media" data-post-zoom="${esc(src)}" aria-label="Voir l’image en grand"><img src="${esc(src)}" alt="${esc(p.title)}"><span class="sh-pd__zoom">${ic('expand')}Plein écran</span></button>` : ''}
      <div class="sh-detail__main">
        <div class="sh-detail__k"><span class="sh-st sh-st--${STATUS[stOf(p)][1]}">${STATUS[stOf(p)][0]}</span>${p.pinned ? `<span class="sh-badge">${ic('pin')}Épinglé</span>` : ''}${ROLE !== 'member' ? `<span class="sh-badge sh-badge--group">${esc(p.audienceLabel)}</span>` : ''}</div>
        <h2>${esc(p.title)}</h2>
        <p class="sh-detail__by">Par ${esc(p.author)} · ${esc(ideaWhen(p.createdAt))}</p>
        ${posHtml(p.idea, false)}
        ${p.body ? `<div class="sh-read">${textToHtml(p.body)}</div>` : ''}
        ${can ? `<div class="sh-stset"><span>Statut</span>${seg('ideaStatus', Object.entries(STATUS).map(([k, x]) => [k, x[0]]), stOf(p)).replace(/data-v="(\w+)"/g, `data-idea-status="$1" data-idea-id="${p.id}" data-v="$1"`)}</div>` : ''}
        <div class="sh-acts"><button type="button" class="chest-btn-2" data-share-post="${p.id}">${ic('share')}Partager</button>${src ? `<a class="chest-btn-2" href="${esc(src)}" target="_blank" rel="noopener" download>${ic('image')}Image</a>` : ''}
          ${can ? `<button type="button" class="chest-btn-2" data-edit-post="${p.id}">Modifier</button><button type="button" class="sh-link sh-link--red" data-del-post="${p.id}">Supprimer</button>` : ''}</div>
      </div></div>`, false);
    dlg.classList.add('is-post');
  }

  // Image d'une info en plein écran (au-dessus de la fenêtre : top layer d'un second <dialog>)
  function lightbox(src) {
    const lb = document.createElement('dialog');
    lb.className = 'sh-lb';
    lb.innerHTML = `<img src="${esc(src)}" alt=""><button type="button" class="sh-ib sh-lb__x" aria-label="Fermer"><svg class="sh-ic" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
    document.body.appendChild(lb);
    lb.addEventListener('click', () => lb.close());
    lb.addEventListener('close', () => lb.remove());
    lb.showModal();
  }
  // Partage : lien direct vers l'info (School l'ouvre à l'arrivée), feuille de partage du téléphone sinon copie
  async function sharePost(p) {
    if (!p) return;
    const url = `${location.origin}/school?post=${p.id}`;
    try {
      if (navigator.share && matchMedia('(hover:none)').matches) { await navigator.share({ title: p.title, text: `${p.title} — CHEST School`, url }); return; }
      await navigator.clipboard.writeText(url); toast('Lien de l’info copié : seuls les membres qui la voient pourront l’ouvrir.');
    } catch (e) { if (e && e.name !== 'AbortError') toast(url); }
  }

  async function setIdeaStatus(id, st) {
    try {
      const d = await postJson(`/school/posts/${id}/status`, { status: st });
      S.posts = d.posts;
      toast(st === 'inactive' ? 'Idea rangée dans les Inactives.' : st === 'encours' ? 'Idea passée en cours.' : 'Idea en zone d’action.');
      if (ROLE === 'member') renderMember(); else renderTab();
      const x = S.posts.find((p) => p.id === id); if (x) postDetail(x);
    } catch (e) { toast(e.message); }
  }

  function noteDetail(n) {
    openDlg(`<div class="sh-detail sh-detail--post"><div class="sh-detail__main"><span class="chest-step">Note · ${esc(n.author)}</span><h2>${esc(n.title || 'Note')}</h2>
      <p class="sh-detail__by">${fr(n.createdAt, { day: 'numeric', month: 'long', year: 'numeric' })}</p><div class="sh-read">${textToHtml(n.body)}</div></div></div>`);
  }

  // Composer (simplifié le 2026-11-08) : Appel / Mission / Idea, pour un groupe ou pour des personnes choisies une à une.
  //   Éducateur : tous ses élèves, ou certains d'entre eux.  Admin : tout le monde, les membres, l'équipe, ou des
  //   personnes choisies (éducateurs et membres mêlés). Un appel avec un seul membre = appel personnel (son suivi).
  const C = { kind: 'event', target: 'all', scope: [], picked: [], q: '', flyer: null, editing: null, format: 'landscape', side: 'buy', tps: 1 };
  // « Pour » (2026-11-08) : un groupe, et dans chaque groupe sa liste pour ne garder que certaines personnes
  // (rien de coché = tout le groupe). Admin : Tout le monde / Membres / Éducateurs ; éducateur : ses élèves.
  // « Tout le monde » (ou « Tous mes élèves ») vise le groupe entier ; « Membres », « Éducateurs », « Élèves » ouvrent la
  // liste pour cocher les personnes une à une (2026-11-08).
  function targetsFor(kind) {
    if (ROLE === 'educator') return [['students', 'Tous mes élèves'], ['pickm', 'Élèves']];
    if (kind === 'task') return [['members', 'Tous les membres'], ['pickm', 'Membres']];
    return [['all', 'Tout le monde'], ['pickm', 'Membres'], ['picke', 'Éducateurs']];
  }
  const isPick = () => C.target === 'pickm' || C.target === 'picke';
  function pickables(kind) {
    const members = (S.people || []).map((p) => ({ id: p.id, name: p.name, sub: ROLE === 'admin' && p.educator ? `avec ${p.educator}` : '' }));
    const edus = (S.educators || []).map((e) => ({ id: e.id, name: e.name, sub: 'Éducateur', staff: true }));
    return [['', C.target === 'picke' && kind !== 'share' ? edus : members]];
  }
  const seg = (name, opts, val) => `<div class="chest-seg sh-seg" data-seg="${name}" role="radiogroup">${opts.map(([v, l]) => `<button type="button" role="radio" data-v="${v}" aria-checked="${String(v) === String(val)}" class="${String(v) === String(val) ? 'is-active' : ''}">${l}</button>`).join('')}</div>`;
  const field = (label, inner, wide, hint) => `<label class="sh-f${wide ? ' sh-f--wide' : ''}"><span>${label}</span>${inner}${hint ? `<em>${hint}</em>` : ''}</label>`;
  function pickerHtml() {
    const q = norm(C.q);
    const groups = pickables(C.kind).map(([label, list]) => {
      const shown = list.filter((p) => !q || norm(p.name).includes(q));
      if (!shown.length) return '';
      return `${label ? `<span class="sh-pick__g">${label}</span>` : ''}${shown.map((p) => {
        const on = C.picked.includes(p.id);
        return `<button type="button" class="sh-pick__p${on ? ' is-on' : ''}" data-pick="${p.id}" role="checkbox" aria-checked="${on}" style="--c:${hashColor(p.id)}"><span class="sh-pick__av">${esc(initials(p.name))}</span><span class="sh-pick__n"><b>${esc(p.name)}</b>${p.sub ? `<small>${esc(p.sub)}</small>` : ''}</span><span class="sh-pick__ck">${ic('check')}</span></button>`;
      }).join('')}`;
    }).join('');
    return `<div class="sh-f sh-f--wide sh-pick"><span>${C.picked.length ? plural(C.picked.length, 'personne choisie', 'personnes choisies') : 'Coche une ou plusieurs personnes'}</span>
      <input type="search" id="pickQ" class="sh-pick__q" placeholder="Rechercher un nom…" value="${esc(C.q)}" autocomplete="off" aria-label="Rechercher un nom">
      <div class="sh-pick__list" id="pickList">${groups || '<em class="sh-hint">Personne à afficher.</em>'}</div></div>`;
  }
  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  // Date et heure (2026-11-08) : les mêmes sélecteurs que le Journal — calendrier du mois et roue des heures façon iPhone.
  // La valeur vit dans un champ caché (id cDate / cTime / cDue) relu par submitComposer et gardé par keepValues.
  const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  const dLabel = (iso) => (iso ? new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : 'Choisir une date…');
  const dateField = (id, label, val) => `<div class="sh-f"><span>${label}</span><div class="sh-dp"><input type="hidden" id="${id}" value="${esc(val)}"><button type="button" class="sh-dp__trig" data-dp-open="${id}">${ic('cal')}<span>${esc(dLabel(val))}</span></button><div class="sh-dp__panel" data-dp-panel="${id}" hidden></div></div></div>`;
  const timeField = (id, label, val) => `<div class="sh-f"><span>${label}</span><div class="sh-dp"><input type="hidden" id="${id}" value="${esc(val)}"><button type="button" class="sh-dp__trig" data-tp-open="${id}"><svg class="sh-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z"/></svg><span>${esc(val || '--:--')}</span></button><div class="sh-tp__panel" data-tp-panel="${id}" hidden></div></div></div>`;
  function closePickers(except) { document.querySelectorAll('#shDlgIn .sh-dp__panel, #shDlgIn .sh-tp__panel').forEach((p) => { if (p !== except) p.hidden = true; }); }
  function renderMonth(id) {
    const panel = document.querySelector(`[data-dp-panel="${id}"]`), cur = document.getElementById(id).value;
    const { y, m } = S.dpView;
    const startDow = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate(), prev = new Date(y, m, 0).getDate();
    const today = ymd(new Date());
    let cells = '';
    for (let i = 0; i < startDow; i++) cells += `<button type="button" class="sh-dp__c is-muted" disabled>${prev - startDow + 1 + i}</button>`;
    for (let d = 1; d <= days; d++) { const iso = `${y}-${pad(m + 1)}-${pad(d)}`; cells += `<button type="button" class="sh-dp__c${iso === today ? ' is-today' : ''}${iso === cur ? ' is-on' : ''}" data-dp-pick="${iso}" data-dp-for="${id}">${d}</button>`; }
    const trail = (7 - ((startDow + days) % 7)) % 7;
    for (let d = 1; d <= trail; d++) cells += `<button type="button" class="sh-dp__c is-muted" disabled>${d}</button>`;
    panel.innerHTML = `<div class="sh-dp__head"><button type="button" class="sh-dp__nav" data-dp-nav="-1" data-dp-for="${id}" aria-label="Mois précédent">‹</button><b>${MONTHS[m]} ${y}</b><button type="button" class="sh-dp__nav" data-dp-nav="1" data-dp-for="${id}" aria-label="Mois suivant">›</button></div>
      <div class="sh-dp__wd"><span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span><span>D</span></div><div class="sh-dp__grid">${cells}</div>`;
  }
  const WH = 36;
  function openTime(id) {
    const panel = document.querySelector(`[data-tp-panel="${id}"]`);
    const wheel = (n, k) => `<div class="sh-wheel" data-wheel="${k}"><div class="sh-wheel__pad"></div>${Array.from({ length: n }, (_, i) => `<div class="sh-wheel__it" data-wv="${i}">${pad(k === 'm' ? i * 5 : i)}</div>`).join('')}<div class="sh-wheel__pad"></div></div>`;
    panel.innerHTML = `<div class="sh-tp__wheels">${wheel(24, 'h')}<span class="sh-tp__colon">:</span>${wheel(12, 'm')}<div class="sh-tp__sep"></div></div><button type="button" class="chest-btn sh-tp__ok" data-tp-ok="${id}">OK</button>`;
    panel.hidden = false;
    const [h, mi] = (document.getElementById(id).value || '19:00').split(':').map(Number);
    const set = (k, i) => { const w = panel.querySelector(`[data-wheel="${k}"]`); w.scrollTop = i * WH; hl(w, i); };
    set('h', h || 0); set('m', Math.round((mi || 0) / 5) % 12);
    panel.querySelectorAll('.sh-wheel').forEach((w) => {
      let t; w.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(() => { const i = Math.round(w.scrollTop / WH); w.scrollTo({ top: i * WH, behavior: 'smooth' }); hl(w, i); }, 110); });
    });
  }
  const hl = (w, i) => w.querySelectorAll('.sh-wheel__it').forEach((el, k) => el.classList.toggle('is-on', k === i));
  function onPickerClick(t) {
    const o = t.closest('[data-dp-open]');
    if (o) { const id = o.dataset.dpOpen, panel = document.querySelector(`[data-dp-panel="${id}"]`); const open = panel.hidden; closePickers(); if (open) { const b = new Date((document.getElementById(id).value || ymd(new Date())) + 'T00:00:00'); S.dpView = { y: b.getFullYear(), m: b.getMonth() }; renderMonth(id); panel.hidden = false; } return true; }
    const nv = t.closest('[data-dp-nav]');
    if (nv) { let { y, m } = S.dpView; m += Number(nv.dataset.dpNav); if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; } S.dpView = { y, m }; renderMonth(nv.dataset.dpFor); return true; }
    const pk = t.closest('[data-dp-pick]');
    if (pk) { const id = pk.dataset.dpFor; document.getElementById(id).value = pk.dataset.dpPick; document.querySelector(`[data-dp-open="${id}"] span`).textContent = dLabel(pk.dataset.dpPick); closePickers(); return true; }
    const to = t.closest('[data-tp-open]');
    if (to) { const id = to.dataset.tpOpen, panel = document.querySelector(`[data-tp-panel="${id}"]`); const open = panel.hidden; closePickers(); if (open) openTime(id); return true; }
    const wi = t.closest('.sh-wheel__it');
    if (wi) { const w = wi.parentElement; w.scrollTo({ top: Number(wi.dataset.wv) * WH, behavior: 'smooth' }); return true; }
    const ok = t.closest('[data-tp-ok]');
    if (ok) { const id = ok.dataset.tpOk, panel = document.querySelector(`[data-tp-panel="${id}"]`); const i = (k) => Math.round(panel.querySelector(`[data-wheel="${k}"]`).scrollTop / WH); const val = `${pad(Math.min(23, i('h')))}:${pad(Math.min(11, i('m')) * 5)}`; document.getElementById(id).value = val; document.querySelector(`[data-tp-open="${id}"] span`).textContent = val; closePickers(); return true; }
    if (!t.closest('.sh-dp__panel, .sh-tp__panel')) closePickers();
    return false;
  }

  function composerHtml() {
    const k = C.kind, ed = C.editing;
    const T = targetsFor(k);
    if (!T.some(([v]) => v === C.target)) C.target = T[0][0];
    const base = ed ? new Date(ed.startsAt || Date.now()) : C.start ? new Date(C.start) : (() => { const d = new Date(Date.now() + DAY); d.setHours(19, 0, 0, 0); return d; })();
    const due = new Date(Date.now() + 7 * DAY);
    const flyerHtml = (label) => `<div class="sh-f sh-f--wide"><span>${label} <i>(facultatif)</i></span><div class="sh-drop${C.flyer || (ed && ed.image) ? ' has-img' : ''} sh-drop--${C.format}" id="cDrop">
        <input type="file" id="cFile" accept="image/*" aria-label="${label}">
        ${C.flyer ? `<img src="${esc(URL.createObjectURL(C.flyer))}" alt="">` : ed && ed.image ? `<img src="${esc(fileUrl(ed.image))}" alt="">` : ''}
        <span class="sh-drop__t">${ic('image')}<b>${C.flyer || (ed && ed.image) ? 'Changer l’image' : 'Choisir une image'}</b><small>Capture de graphique, analyse · JPG ou PNG</small></span></div></div>`;
    const title = ed ? (k === 'event' ? 'Modifier l’appel' : 'Modifier l’Idea') : k === 'event' ? 'Nouveau rendez-vous' : k === 'task' ? 'Nouvelle mission' : 'Nouvelle Idea';
    let body = '';
    if (k === 'event') {
      body = `${field('Titre', `<input type="text" id="cTitle" maxlength="140" value="${esc(ed ? ed.title : '')}" placeholder="${C.picked.length ? 'Point sur tes trades de la semaine' : 'Live : revue du marché'}">`, true)}
        ${dateField('cDate', 'Date', ymd(base))}${timeField('cTime', 'Heure', `${pad(base.getHours())}:${pad(base.getMinutes())}`)}
        ${(() => { const cur = ed ? ed.minutes : C.dur || 45; const opts = [15, 30, 45, 60, 90, 120, 180]; if (!opts.includes(cur)) opts.push(cur); return field('Durée', `<select id="cMin">${opts.sort((a, b) => a - b).map((m) => `<option value="${m}" ${m === cur ? 'selected' : ''}>${dur(m)}</option>`).join('')}</select>`); })()}
        ${field('Lien de l’appel <i>(facultatif)</i>', `<input type="url" id="cLink" maxlength="300" value="${esc(ed ? ed.link : '')}" placeholder="https://meet.google.com/…">`)}`;
    } else if (k === 'task') {
      body = `${field('Mission', `<input type="text" id="cTitle" maxlength="200" placeholder="Remplir ton journal chaque soir">`, true)}
        ${dateField('cDue', 'À faire pour le', ymd(due))}`;
    } else {
      const I = (ed && ed.idea) || {};
      const tpIn = Array.from({ length: C.tps }, (_, n) => field(`TP ${n + 1}${n ? ' <i>(facultatif)</i>' : ''}`, `<input type="text" inputmode="decimal" id="cTp${n + 1}" value="${I.tps && I.tps[n] != null ? esc(I.tps[n]) : ''}" placeholder="${n ? '' : '2 676'}">`)).join('');
      body = `${field('Titre', `<input type="text" id="cTitle" maxlength="140" value="${esc(ed ? ed.title : '')}" placeholder="Or : retest de la zone des 2 640">`, true)}
        <div class="sh-f sh-f--wide sh-posf"><span>Position <i>(facultatif)</i></span>
          <div class="sh-grid">${field('Paire', `<input type="text" id="cPair" list="cPairs" maxlength="16" autocapitalize="characters" value="${esc(I.pair || '')}" placeholder="XAUUSD"><datalist id="cPairs">${['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD', 'GBPJPY', 'EURJPY', 'NAS100', 'US30', 'SPX500', 'GER40', 'BTCUSD', 'ETHUSD'].map((x) => `<option value="${x}">`).join('')}</datalist>`)}
            <div class="sh-f"><span>Sens</span>${seg('side', [['buy', 'Achat'], ['sell', 'Vente']], C.side)}</div>
            ${field('PE', `<input type="text" inputmode="decimal" id="cPe" value="${I.pe != null ? esc(I.pe) : ''}" placeholder="2 640">`)}${field('SL', `<input type="text" inputmode="decimal" id="cSl" value="${I.sl != null ? esc(I.sl) : ''}" placeholder="2 628">`)}
            ${tpIn}
            <div class="sh-f sh-f--wide sh-tpacts"><button type="button" class="sh-link" data-add-tp ${C.tps >= 8 ? 'disabled' : ''}>+ Ajouter un TP</button>${C.tps > 1 ? '<button type="button" class="sh-link sh-link--red" data-del-tp>Retirer le dernier TP</button>' : ''}</div></div></div>
        ${field('Texte', `<textarea id="cBody" rows="4" maxlength="8000" placeholder="Le contexte, ce qui invalide l’idée, la gestion…">${esc(ed ? ed.body : '')}</textarea>`, true)}
        <div class="sh-f sh-f--wide"><span>Format de l’image</span>${seg('format', [['portrait', 'Vertical · 4:5'], ['landscape', 'Horizontal · 16:9']], C.format)}</div>
        ${flyerHtml('Image')}
        ${ROLE === 'admin' ? `<label class="sh-tick"><input type="checkbox" id="cPin" ${ed && ed.pinned ? 'checked' : ''}><span>Épingler en tête</span></label>` : ''}`;
    }
    const n = C.picked.length;
    const hint = n ? (k === 'post' ? `L’Idea apparaît dans School chez ${plural(n, 'personne', 'personnes')}.` : k === 'task' ? `Ajoutée aux missions de ${plural(n, 'membre', 'membres')} : chacun coche la sienne.` : `Posé dans le planning de ${plural(n, 'personne', 'personnes')}, déjà confirmé. Chacun est prévenu.`)
      : k === 'task' ? 'Copiée chez chaque membre visé ; chacun coche la sienne, tu vois l’avancement dans Missions.'
      : k === 'event' ? 'Un seul rendez-vous, visible dans le planning de tous ceux que tu vises. Chacun est prévenu, puis rappelé 15 min avant.' : 'L’Idea apparaît dans School chez tous ceux que tu vises. Tu la passes en cours ou inactive depuis sa fiche.';
    return `<div class="sh-comp">
      <header class="sh-comp__h"><span class="chest-step">${ROLE === 'admin' ? 'Admin' : 'Éducateur'}</span><h2>${title}</h2></header>
      ${ed ? '' : `<div class="sh-f sh-f--wide"><span>Quoi</span>${seg('kind', [['event', 'Appel'], ['task', 'Mission'], ['post', 'Idea']], k)}</div>`}
      ${ROLE === 'admin' ? `<div class="sh-f sh-f--wide"><span>Signer en tant que</span>${seg('as', [['chest', 'CHEST'], ['me', esc(U.firstName || 'Moi')]], C.as)}</div>` : ''}
      <div class="sh-f sh-f--wide"><span>Pour</span>${seg('target', T, C.target)}</div>
      ${isPick() ? pickerHtml() : ''}
      <div class="sh-grid">${body}</div>
      <p class="sh-hint">${hint}</p>
      <p class="sh-msg" id="shMsg" role="alert"></p>
      <footer class="sh-comp__f"><button type="button" class="chest-btn-2" data-close>Annuler</button><button type="submit" class="chest-btn">${ed ? 'Enregistrer' : k === 'post' ? 'Publier' : 'Ajouter'}</button></footer>
    </div>`;
  }

  function keepValues(fn) {
    const ids = [...document.querySelectorAll('#shDlgIn input[id^="c"], #shDlgIn select[id^="c"], #shDlgIn textarea[id^="c"]')].filter((el) => el.type !== 'file' && el.type !== 'checkbox' && el.id !== 'pickQ').map((el) => el.id);
    const kept = {};
    ids.forEach((id) => { const el = document.getElementById(id); if (el) kept[id] = el.value; });
    fn();
    ids.forEach((id) => { const el = document.getElementById(id); if (el && kept[id] != null && !(id === 'cTitle' && !kept[id])) el.value = kept[id]; });
  }
  const refreshComposer = () => {
    keepValues(() => { document.getElementById('shDlgIn').innerHTML = (S.dlgRender || composerHtml)(); });
    document.querySelectorAll('#shDlgIn [data-dp-open]').forEach((b) => { b.querySelector('span').textContent = dLabel(document.getElementById(b.dataset.dpOpen).value); });
    document.querySelectorAll('#shDlgIn [data-tp-open]').forEach((b) => { b.querySelector('span').textContent = document.getElementById(b.dataset.tpOpen).value || '--:--'; });
  };

  async function openComposer(kind, editing, preset, startAt, minutes) {
    C.start = startAt || null;
    C.dur = minutes || null;
    await ensurePeople();
    if (ROLE === 'admin' && !S.educators) await loadEducators().catch(() => {});
    const I0 = (editing && editing.idea) || null;
    let sign = 'chest'; try { sign = localStorage.getItem('chest_school_sign') === 'me' ? 'me' : 'chest'; } catch (e) { /* tant pis */ }
    if (editing && editing.signed) sign = editing.signed === 'me' ? 'me' : 'chest';
    Object.assign(C, { as: sign, kind: kind || 'event', editing: editing || null, flyer: null, q: '', format: editing && editing.format === 'portrait' ? 'portrait' : 'landscape', side: I0 && I0.side === 'sell' ? 'sell' : 'buy', tps: I0 ? Math.max(1, I0.tps.length) : 1 });
    if (editing) {
      const ppl = editing.audience === 'people' ? (editing.scope || []).slice() : [];
      const eds = new Set((S.educators || []).map((x) => x.id));
      C.target = editing.audience !== 'people' ? (ROLE === 'educator' ? 'students' : editing.audience) : ROLE === 'educator' ? 'pickm' : ppl.every((id) => eds.has(id)) ? 'picke' : 'pickm';
      C.picked = ppl;
      C.scope = editing.audience === 'students' ? (editing.scope || []).slice() : [];
    } else {
      C.target = ROLE === 'educator' ? 'students' : C.kind === 'task' ? 'members' : 'all';
      C.scope = [];
      C.picked = preset && preset.length ? preset.slice() : S.member ? [Number(S.member)] : [];
      if (C.picked.length) C.target = 'pickm';
    }
    S.dlgRender = composerHtml;
    openDlg(composerHtml(), false, submitComposer);
  }

  function onDlgChange(e) {
    if (e.target.id === 'cFile') {
      C.flyer = e.target.files[0] || null; refreshComposer();
      if (C.flyer && C.kind === 'post') { const im = new Image(); im.onload = () => { C.format = im.naturalHeight > im.naturalWidth ? 'portrait' : 'landscape'; refreshComposer(); }; im.src = URL.createObjectURL(C.flyer); }
    }
  }

  async function onDlgClick(e) {
    const t = e.target;
    if (onPickerClick(t)) return;
    const sg = t.closest('[data-seg] [data-v]');
    if (sg && t.closest('.sh-comp')) {
      const name = sg.parentElement.dataset.seg;
      if (name === 'kind') { C.kind = sg.dataset.v; return refreshComposer(); }
      if (name === 'target') { C.target = sg.dataset.v; C.picked = []; C.q = ''; return refreshComposer(); }
      if (name === 'format') { C.format = sg.dataset.v; return refreshComposer(); }
      if (name === 'side') C.side = sg.dataset.v;
      if (name === 'as') { C.as = sg.dataset.v; try { localStorage.setItem('chest_school_sign', C.as); } catch (err) { /* tant pis */ } }
      sg.parentElement.querySelectorAll('[data-v]').forEach((b) => { b.classList.toggle('is-active', b === sg); b.setAttribute('aria-checked', String(b === sg)); });
      return;
    }
    const zm = t.closest('[data-post-zoom]'); if (zm) return lightbox(zm.dataset.postZoom);
    const sh = t.closest('[data-share-post]'); if (sh) return sharePost(S.posts.find((p) => p.id === Number(sh.dataset.sharePost)));
    if (t.closest('[data-add-tp]')) { C.tps = Math.min(8, C.tps + 1); return refreshComposer(); }
    if (t.closest('[data-del-tp]')) { C.tps = Math.max(1, C.tps - 1); return refreshComposer(); }
    const ist = t.closest('[data-idea-status]');
    if (ist) return setIdeaStatus(Number(ist.dataset.ideaId), ist.dataset.ideaStatus);
    const pk = t.closest('[data-pick]');
    if (pk) { const id = Number(pk.dataset.pick); C.picked = C.picked.includes(id) ? C.picked.filter((x) => x !== id) : C.picked.concat(id); return refreshComposer(); }
    const eev = t.closest('[data-edit-ev]');
    if (eev) { const ev = findEvent(eev.dataset.editEv); const first = ev && Object.assign({}, ev, { startsAt: new Date(Date.parse(ev.startsAt) - ev.occurrence * 7 * DAY).toISOString() }); return openComposer('event', first); }
    const dev = t.closest('[data-del-ev]');
    if (dev) { dlg.close(); if (!(await ask('Supprimer cet appel du planning de tous ceux qui le voient ?', 'Supprimer'))) return; return act(() => postJson(`/school/events/${dev.dataset.delEv}/delete`, {}), 'Appel supprimé.'); }
    const ep = t.closest('[data-edit-post]');
    if (ep) return openComposer('post', S.posts.find((p) => p.id === Number(ep.dataset.editPost)));
    const dp = t.closest('[data-del-post]');
    if (dp) { dlg.close(); if (!(await ask('Supprimer cette info ?', 'Supprimer'))) return; return act(() => postJson(`/school/posts/${dp.dataset.delPost}/delete`, {}), 'Info supprimée.'); }
    const os = t.closest('[data-open-suivi]');
    if (os) { dlg.close(); return goSuivi(os.dataset.openSuivi); }
  }

  async function submitComposer() {
    const v = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
    const idea = C.kind === 'post' ? { pair: v('cPair'), side: C.side, pe: v('cPe'), sl: v('cSl'), tps: Array.from({ length: C.tps }, (_, n) => v(`cTp${n + 1}`)) } : null;
    const title = v('cTitle') || (idea && idea.pair ? `${idea.pair.toUpperCase()} · ${idea.side === 'sell' ? 'Vente' : 'Achat'}` : '');
    if (!title) throw new Error(C.kind === 'task' ? 'Décris la mission.' : 'Donne un titre.');
    const pick = isPick();
    if (pick && !C.picked.length) throw new Error('Coche au moins une personne.');
    const target = pick ? { audience: 'people', scope: C.picked, as: C.as } : { audience: C.target, scope: C.scope, as: C.as };
    const staff = new Set((S.educators || []).map((e) => e.id));
    // un seul membre choisi : appel personnel (dans son suivi) plutôt qu'un rendez-vous de groupe
    const solo = pick && C.picked.length === 1 && !staff.has(C.picked[0]) && !(C.editing && C.editing.type === 'collective');
    if (C.kind === 'event') {
      if (!v('cDate') || !v('cTime')) throw new Error('Choisis la date et l’heure.');
      const at = new Date(`${v('cDate')}T${v('cTime')}`);
      const ed = C.editing || {};
      const common = { startsAt: at.toISOString(), minutes: Number(v('cMin')), mode: ed.mode || 'visio', link: v('cLink'), body: ed.body || '' };
      if (solo) await postForm('/mentor/events', Object.assign(common, { member: C.picked[0], topic: title, confirmed: true, as: C.as }), {});
      else await postForm('/school/events', Object.assign(common, target, { id: ed.seriesId, title, weeks: ed.weeks || 1 }), {});
      S.week = mondayOf(at) < S.week || mondayOf(at) >= new Date(S.week.getTime() + SPAN * DAY) ? mondayOf(at) : S.week;
    } else if (C.kind === 'task') {
      const dueAt = v('cDue') ? new Date(`${v('cDue')}T23:59`).toISOString() : null;
      const r = await postJson('/school/missions', Object.assign({ title, dueAt }, target));
      toast(`Mission ajoutée chez ${plural(r.members, 'membre', 'membres')}.`);
    } else {
      const pin = document.getElementById('cPin');
      await postForm('/school/posts', Object.assign({ id: C.editing && C.editing.id, title, body: v('cBody'), pinned: !!(pin && pin.checked), format: C.format, idea }, target), { image: C.flyer });
    }
    if (C.kind !== 'task') toast(C.editing ? 'Enregistré.' : C.kind === 'post' ? 'Idea publiée.' : 'Ajouté au planning. Les personnes visées sont prévenues.');
    if (C.kind !== 'post' && ROLE !== 'member') S.tab = 'planning';
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
  function markSeen() {
    if (S.newIds) return;
    let seen = '';
    try { seen = localStorage.getItem('chest_idea_seen') || ''; } catch (e) {}
    if (!seen) seen = new Date(Date.now() - 3 * DAY).toISOString();
    S.newIds = new Set((S.posts || []).filter((p) => p.createdAt > seen && p.authorId !== U.id && stOf(p) !== 'inactive').map((p) => p.id));
    try { localStorage.setItem('chest_idea_seen', new Date().toISOString()); } catch (e) {}
  }
  // « Nouveau » et « +N » du planning : ce qui a été ajouté par quelqu'un d'autre depuis la dernière visite (chest_plan_seen,
  // clé d'appareil) ; la pastille de School dans la barre latérale (js/idea-badge.js) se remet à zéro.
  function markPlanSeen() {
    if (S.planSeenDone) return;
    S.planSeenDone = true;
    let seen = '';
    try { seen = localStorage.getItem('chest_plan_seen') || ''; } catch (e) {}
    if (!seen) seen = new Date(Date.now() - 3 * DAY).toISOString();
    const D = S.agenda || { events: [], tasks: [] };
    const fresh = (x) => x.createdAt && x.createdAt > seen && x.authorId !== U.id;
    S.planNew = new Set(D.events.filter(fresh).map((e) => e.id).concat(D.tasks.filter(fresh).map((t) => 't' + t.id)));
    try { localStorage.setItem('chest_plan_seen', new Date().toISOString()); } catch (e) {}
  }
  async function refresh() {
    if (S.notifSeen == null) { try { S.notifSeen = localStorage.getItem('chest_school_news_seen') || ''; localStorage.setItem('chest_school_news_seen', new Date().toISOString()); } catch (e) { S.notifSeen = ''; } }
    const jobs = [loadAgenda().then(markPlanSeen), api('/school/notifs').then((d) => { S.notifs = d.notifs; }).catch(() => { S.notifs = []; }), api('/school/posts').then((d) => { S.posts = d.posts; markSeen(); })];
    jobs.push(api('/school/scanner').then((d) => { S.ref = d; }).catch(() => { S.ref = null; }));
    if (ROLE === 'member') jobs.push(api('/mentor').then((d) => { S.mentor = d; }).catch(() => { S.mentor = null; }));
    else {
      jobs.push(ensurePeople(), api('/school/missions').then((d) => { S.missions = d.missions; }).catch(() => { S.missions = []; }));
      if (ROLE === 'admin') jobs.push(loadEducators().catch(() => { S.educators = []; }));
    }
    const res = await Promise.allSettled(jobs);
    const failed = res.find((r) => r.status === 'rejected');
    if (failed && !S.agenda) { root.innerHTML = `<p class="sh-empty">${esc(failed.reason.message)}</p>`; return; }
    if (ROLE === 'member') renderMember(); else renderStaff();
    const want = Number(new URLSearchParams(location.search).get('post'));
    if (want && !S.deep) { S.deep = true; const x = S.posts.find((p) => p.id === want); if (x) postDetail(x); }
  }
  async function reloadWeek() {
    try { await loadAgenda(); } catch (e) { return toast(e.message); }
    if (ROLE === 'member') renderMember();
    else { const box = document.getElementById('shPanel'); if (box && S.tab === 'planning') { box.innerHTML = weekHtml(); scrollCal(); } const f = root.querySelector('.sh-facts'); if (f) f.outerHTML = staffFacts(); }
  }

  root.addEventListener('click', async (e) => {
    const t = e.target;
    const vw = t.closest('[data-seg="view"] [data-v]');
    if (vw) { S.view = vw.dataset.v; try { localStorage.setItem('chest_school_view', S.view); } catch (err) { /* tant pis */ } const box = document.getElementById('shPanel'); if (box) { box.innerHTML = weekHtml(); scrollCal(); } return; }
    const wk2 = t.closest('[data-wk]');
    if (wk2) {
      // vue Complet : on avance d'une semaine (la donnée couvre deux semaines, on recharge quand on sort de la fenêtre)
      const d = Number(wk2.dataset.wk), box = document.getElementById('shPanel');
      if (d > 0 && !S.wk2) S.wk2 = true; else if (d < 0 && S.wk2) S.wk2 = false;
      else { S.week = new Date(S.week.getTime() + d * 7 * DAY); S.wk2 = false; await reloadWeek(); return; }
      if (box) { box.innerHTML = weekHtml(); scrollCal(); }
      return;
    }
    const cd = t.closest('[data-calday]');
    if (cd) { S.calDay = Number(cd.dataset.calday); const box = document.getElementById('shPanel'); if (box) { const sc = document.getElementById('shCalScroll'), top = sc ? sc.scrollTop : null; box.innerHTML = weekHtml(); const sc2 = document.getElementById('shCalScroll'); if (sc2 && top != null) sc2.scrollTop = top; } return; }
    const slot = t.closest('.sh-cal__col');
    if (slot && !t.closest('.sh-gev') && S.tapCreate) {
      S.tapCreate = false;
      const r = slot.getBoundingClientRect();
      const mins = Math.max(0, Math.floor(((e.clientY - r.top) / HH * 60) / 15) * 15) + Number(slot.dataset.h0) * 60;
      const at = new Date(`${slot.dataset.slot}T00:00`); at.setMinutes(mins);
      return openComposer('event', null, null, at, 60);
    }
    const wk = t.closest('[data-week]');
    if (wk) { const d = Number(wk.dataset.week); S.wk2 = false; S.week = d === 0 ? mondayOf(new Date()) : new Date(S.week.getTime() + d * 7 * DAY); return reloadWeek(); }
    const ev = t.closest('[data-ev]'); if (ev) { const x = findEvent(ev.dataset.ev); if (x) eventDetail(x); return; }
    const it = t.closest('[data-idea-tab]'); if (it) { S.ideaTab = it.dataset.ideaTab; if (ROLE === 'member') { const sec = document.getElementById('shIdeas'); if (sec) sec.outerHTML = feed2(); } else renderTab(); return; }
    const po = t.closest('[data-post]'); if (po) { const x = S.posts.find((p) => p.id === Number(po.dataset.post)); if (x) postDetail(x); return; }
    const nr = t.closest('[data-note-read]'); if (nr) { const x = S.mentor && S.mentor.notes.find((n) => n.id === Number(nr.dataset.noteRead)); if (x) noteDetail(x); return; }
    const cp = t.closest('[data-compose]'); if (cp) return openComposer(cp.dataset.compose);
    const tb = t.closest('[data-tab]'); if (tb) { S.tab = tb.dataset.tab; root.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b === tb))); return renderTab(); }
    const ed = t.closest('[data-edu]');
    if (ed) { S.member = null; S.tab = 'people'; renderStaff(); const box = document.getElementById('shPeople'); if (box && window.CHESTMentorHub) await CHESTMentorHub.render(box, { educator: Number(ed.dataset.edu), compact: true }); return; }
    const sv = t.closest('[data-suivi]'); if (sv) { e.preventDefault(); return goSuivi(''); }
    const tk = t.closest('[data-task]');
    if (tk) { try { S.mentor = await postJson(`/mentor/tasks/${tk.dataset.task}/toggle`, {}); await loadAgenda(); renderMember(); } catch (err) { toast(err.message); } return; }
    const ow = t.closest('[data-owner], [data-person]');
    if (ow && ROLE !== 'member') {
      if (ow.hasAttribute('data-owner') && ow.dataset.owner) { const id = Number(ow.dataset.owner); S.owner = S.owner === id ? null : id; }
      else if (ow.dataset.person) S.person = S.person === ow.dataset.person ? null : ow.dataset.person;
      else { S.owner = null; S.person = null; }
      const box = document.getElementById('shPanel'); if (box) box.innerHTML = weekHtml(); return;
    }
    const sw = t.closest('[data-color]');
    if (sw) return setColor(Number(sw.dataset.staff), sw.dataset.color);
    const rt = t.closest('[data-ref-tab]'); if (rt) { S.refTab = rt.dataset.refTab; return paintRef(); }
    const rc = t.closest('[data-ref-check]');
    if (rc) { const i = Number(rc.dataset.refCheck), d = checks(S.ref.scanner); setChecks(S.ref.scanner, d.includes(i) ? d.filter((x) => x !== i) : d.concat(i)); return paintRef(); }
    if (t.closest('[data-ref-reset]')) { setChecks(S.ref.scanner, []); return paintRef(); }
    if (t.closest('[data-ref-open]')) return openStrategies(`?scanner=${encodeURIComponent(S.ref.scanner)}`);
    if (t.closest('[data-ref-about]')) return openStrategies(`?scanner=${encodeURIComponent(S.ref.scanner)}&tab=about`);
    const tr = t.closest('[data-trade]');
    if (tr) { const [sym, tf] = tr.dataset.trade.split('|'); return openStrategies(`?scanner=${encodeURIComponent(S.ref.scanner)}&symbol=${encodeURIComponent(sym)}&tf=${encodeURIComponent(tf)}`); }
    const rp = t.closest('[data-ref-pick]');
    if (rp) { try { S.ref = await postJson('/school/scanner', { scanner: rp.dataset.refPick }); toast('Scanner de référence enregistré.'); renderTab(); } catch (err) { toast(err.message); } return; }
    if (t.closest('[data-scv-add]')) { if (window.CHESTSchool) CHESTSchool.addScannerVideo(); return; }
    const sv2 = t.closest('[data-scv-play]'); if (sv2) { if (window.CHESTSchool) CHESTSchool.play(sv2.dataset.scvPlay); return; }
    const sv3 = t.closest('[data-scv-edit]'); if (sv3) { if (window.CHESTSchool) CHESTSchool.editVideo(sv3.dataset.scvEdit); return; }
    const sv4 = t.closest('[data-scv-share]'); if (sv4) { if (window.CHESTSchool) CHESTSchool.share({ video: sv4.dataset.scvShare }); return; }
    const dm = t.closest('[data-del-mission]');
    if (dm) { if (!(await ask('Retirer cette mission chez tous les membres qui l’ont ?', 'Retirer'))) return; return act(() => postJson(`/mentor/common/${dm.dataset.delMission}/delete`, {}), 'Mission retirée.'); }
  });
  // Appuyer-glisser sur la grille (2026-11-10, retour patron) : une bulle d'une heure naît sous la souris et la SUIT
  // (heure et jour, au quart d'heure) sans changer de durée ; au relâchement, « Nouveau rendez-vous » s'ouvre à cet
  // endroit, durée 1 h par défaut, modifiable ensuite dans la fenêtre. Au doigt : un simple appui (1 h).
  root.addEventListener('pointerdown', (e) => {
    let col = e.target.closest('.sh-cal__col');
    if (!col || e.target.closest('.sh-gev') || e.button !== 0) return;
    if (e.pointerType === 'touch') { S.tapCreate = true; return; }
    e.preventDefault();
    const DUR = 60;
    const q = (c, y) => { const top = c.getBoundingClientRect().top; return Math.max(0, Math.min(24 * 60 - DUR, Math.floor(((y - top) / HH * 60 - 15) / 15) * 15)); };
    let start = q(col, e.clientY);
    const ghost = document.createElement('div');
    ghost.className = 'sh-ghost';
    col.appendChild(ghost);
    const tm = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
    const paint = () => { ghost.style.top = `${start / 60 * HH}px`; ghost.style.height = `${DUR / 60 * HH - 2}px`; ghost.innerHTML = `<b>Nouveau rendez-vous</b><span>${tm(start)} – ${tm(start + DUR)}</span>`; };
    paint();
    const move = (ev) => {
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      const c = under && under.closest && under.closest('.sh-cal__col');
      if (c && c !== col && root.contains(c)) { col = c; col.appendChild(ghost); }
      const m = q(col, ev.clientY);
      if (m !== start) { start = m; paint(); }
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      ghost.classList.add('is-set');
      const at = new Date(`${col.dataset.slot}T00:00`); at.setMinutes(start);
      openComposer('event', null, null, at, DUR).finally(() => setTimeout(() => ghost.remove(), 150));
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  });
  // passage ordinateur ↔ téléphone (rotation, fenêtre réduite) : la grille se redessine dans le bon format
  window.matchMedia('(max-width: 640px)').addEventListener('change', () => { const box = document.getElementById('shPanel'); if (box && box.querySelector('.sh-cal')) { box.innerHTML = weekHtml(); scrollCal(); } });
  root.addEventListener('change', (e) => {
    if (e.target.id === 'shWho') { S.member = e.target.value || null; reloadWeek(); }
    if (e.target.dataset.staffPick) setColor(Number(e.target.dataset.staffPick), e.target.value);
  });
  async function setColor(id, color) {
    try { await postJson(`/school/staff/${id}/color`, { color }); await loadAgenda(); renderTab(); }
    catch (err) { toast(err.message); }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.agenda && !(dlg && dlg.open)) refresh(); });

  if (ROLE !== 'member') {
    const home = document.getElementById('scHome');
    if (home) home.classList.add('is-staff');
  }
  root.hidden = false;
  root.innerHTML = '<p class="sh-empty sh-loading">Chargement de ta semaine…</p>';
  refresh();
  window.CHESTSchoolHub = { refresh, share, repaint: () => { if (ROLE !== 'member' && S.tab === 'content') renderTab(); } };
})();
