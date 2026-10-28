// CHEST — Suivi élève–éducateur (2026-10-28, « comme Pronote »). Un membre et son éducateur partagent :
// des appels (l'un propose, l'autre confirme), des missions à faire avant le prochain appel (fixées par
// l'éducateur, cochées par l'élève), des notes et des ressources (textes, vidéos envoyées ou liens, fichiers). Données : GET /mentor (accounts-bridge).
// Le membre ouvre son propre suivi ; l'éducateur (ou l'admin) voit la liste de ses élèves puis suivi.html?member=ID.
(() => {
  'use strict';
  const A = window.CHESTAccounts;
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DAY = 86400000;
  const fr = (d, o) => new Date(d).toLocaleDateString('fr-FR', o);
  const hm = (d) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const dayKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`; };
  const initials = (n) => String(n || '?').split(/\s+/).map((w) => w[0] || '').join('').slice(0, 2).toUpperCase();
  const textToHtml = (t) => String(t || '').split(/\n{2,}/).map((p) => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
  const fileUrl = (f) => (f && f.key ? `${A.apiBase()}/school/files/${encodeURIComponent(f.key)}` : '');
  const fmtSize = (n) => (n >= 1048576 ? (n / 1048576).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' Mo' : Math.max(1, Math.round((n || 0) / 1024)) + ' Ko');
  const IC = {
    text: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5V5.5zM8 7h8M8 11h6',
    video: 'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM10.5 9.5v5l4.2-2.5z',
    link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5',
    cal: 'M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M9 3v4M15 3v4',
    note: 'M5 4h14v16H5zM9 8h6M9 12h6M9 16h3',
    trash: 'M5 7h14M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3',
    edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
    play: 'M8 5v14l11-7z',
  };
  const ic = (n) => `<svg class="sv-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="${IC[n]}"/></svg>`;
  const MODES = { visio: 'Visio', telephone: 'Téléphone', presentiel: 'Présentiel' };
  const KINDS = { text: 'Texte', video: 'Vidéo', link: 'Lien', file: 'Fichier' };

  const query = new URLSearchParams(location.search);
  const S = { member: query.get('member'), D: null, month: null, when: 'up', day: null, kind: '', dlg: null };

  async function api(path, opts) {
    const res = await fetch(A.apiBase() + path, Object.assign({}, opts, {
      headers: Object.assign({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + A.getToken() }, (opts && opts.headers) || {}),
    }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Service indisponible pour le moment.');
    return data;
  }
  const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(Object.assign({ member: S.D && S.D.member.id }, body || {})) });
  function upload(form, onProgress) {
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open('POST', A.apiBase() + '/mentor/library');
      x.setRequestHeader('Authorization', 'Bearer ' + A.getToken());
      x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
      x.onload = () => { let d = {}; try { d = JSON.parse(x.responseText); } catch (e) { /* vide */ } x.status < 300 ? resolve(d) : reject(new Error(d.error || `Erreur (${x.status})`)); };
      x.onerror = () => reject(new Error('Impossible de contacter le serveur.'));
      x.send(form);
    });
  }
  function parseVideo(url) {
    const u = String(url || '');
    let m = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/i);
    if (m) return { src: `https://www.youtube-nocookie.com/embed/${m[1]}?autoplay=1&rel=0`, thumb: `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` };
    m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
    if (m) return { src: `https://player.vimeo.com/video/${m[1]}?autoplay=1`, thumb: '' };
    return null;
  }
  const go = (search) => {
    const sh = window.parent && window.parent !== window && window.parent.CHESTShell;
    if (sh && sh.go) sh.go('suivi', search || ''); else location.href = 'suivi.html' + (search || '');
  };
  function showError(msg) { const e = $('svError'); e.textContent = msg || ''; e.hidden = !msg; }

  // ---------- modèle ----------
  const mine = (x) => S.D && x.authorId === S.D.me.id;
  const other = () => (S.D.me.role === 'member' ? S.D.educator : S.D.member);
  const live = (e) => e.status === 'proposed' || e.status === 'confirmed';
  const end = (e) => Date.parse(e.startsAt) + e.minutes * 60000;
  const upcoming = () => S.D.events.filter((e) => live(e) && end(e) >= Date.now()).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const past = () => S.D.events.filter((e) => end(e) < Date.now() || !live(e)).sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
  const held = () => S.D.events.filter((e) => (e.status === 'confirmed' || e.status === 'done') && end(e) < Date.now()).sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
  const eventById = (id) => S.D.events.find((e) => e.id === id);
  function statusOf(e) {
    if (e.status === 'cancelled') return ['Annulé', 'off'];
    if (e.status === 'declined') return ['Refusé', 'off'];
    if (end(e) < Date.now()) return e.status === 'proposed' ? ['Non confirmé', 'off'] : ['Fait', 'ok'];
    if (e.status === 'confirmed') return ['Confirmé', 'ok'];
    return mine(e) ? [`En attente de ${other() ? esc(other().first) : 'réponse'}`, 'wait'] : ['À confirmer', 'ask'];
  }
  const relDay = (d) => {
    const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / DAY);
    return days === 0 ? "Aujourd'hui" : days === 1 ? 'Demain' : days > 1 && days < 7 ? `Dans ${days} jours` : fr(d, { weekday: 'long', day: 'numeric', month: 'long' });
  };

  const dayHead = (d) => { const r = relDay(d); return /^(Aujourd|Demain|Dans)/.test(r) ? `${r} · ${fr(d, { weekday: 'short', day: 'numeric', month: 'short' })}` : r; };

  // ---------- chargement ----------
  async function load() {
    const u = A.getUser() || {};
    const staff = u.isAdmin || u.role === 'educator';
    try {
      if (!S.member && staff) return renderStudents(u);
      S.D = await api('/mentor' + (S.member ? `?member=${encodeURIComponent(S.member)}` : ''));
      showError('');
      render();
    } catch (e) { showError(e.message); }
  }

  // Éducateur / admin sans élève choisi : les cartes de ses élèves (js/mentor-hub.js, comme l'accueil de School).
  function renderStudents(u) {
    $('svTitle').textContent = 'Tes élèves';
    $('svSub').textContent = u.isAdmin && u.role !== 'educator' ? 'Tous les membres rattachés à un éducateur.' : 'Leurs appels, leurs missions et leurs notes.';
    const box = $('svStudents');
    box.hidden = false;
    if (window.CHESTMentorHub) CHESTMentorHub.render(box);
  }

  // ---------- rendu ----------
  function render() {
    const D = S.D, me = D.me.role;
    $('svSpace').hidden = false;
    if (me === 'member') {
      $('svTitle').textContent = D.educator ? `Ton espace avec ${D.educator.first}` : 'Ton espace';
      $('svSub').textContent = D.educator ? 'Tes appels, ce qu’il y a à faire avant le prochain, et ce que vous partagez.' : '';
    } else {
      $('svTitle').textContent = D.member.name;
      const chip = window.CHESTRank && D.member.planKey ? CHESTRank.chip(D.member.planKey, D.member.level, D.member.price) : esc(D.member.plan);
      $('svSub').innerHTML = `<span class="sv-subrow">${chip}${D.member.endsAt ? `<span>jusqu’au ${fr(D.member.endsAt, { day: 'numeric', month: 'long', year: 'numeric' })}</span>` : ''}<button type="button" class="am-link" id="svBack">Tous mes élèves</button></span>`;
      $('svBack').onclick = () => go('');
    }
    $('svPair').innerHTML = `<span class="sv-av" title="${esc(D.member.name)}">${esc(initials(D.member.name))}</span><i></i><span class="sv-av sv-av--edu" title="${esc(D.educator ? D.educator.name : 'Éducateur')}">${esc(D.educator ? initials(D.educator.name) : '?')}</span>`;
    if (me === 'member' && !D.educator) {
      $('svNav').hidden = true;
      document.querySelectorAll('#svSpace .am-view').forEach((p) => { p.hidden = true; });
      showError('');
      $('svStudents').hidden = false;
      $('svStudents').innerHTML = `<div class="sv-alone"><span class="sv-alone__ic">${ic('cal')}</span><h2>Pas encore d’éducateur</h2>
        <p>Cet espace relie un membre à son éducateur : appels, missions, notes et ressources partagées. Il s’ouvre quand tu t’inscris avec le code de référent de ton éducateur.</p></div>`;
      return;
    }
    const up = upcoming();
    $('svPlanCount').textContent = up.length ? String(up.length) : '';
    $('svNotesCount').textContent = D.notes.length ? String(D.notes.length) : '';
    $('svLibCount').textContent = D.library.length ? String(D.library.length) : '';
    renderHome(); renderPlan(); renderNotes(); renderLib();
  }

  function eventActions(e, compact) {
    const out = [];
    const future = end(e) >= Date.now();
    if (future && e.status === 'proposed' && !mine(e)) {
      out.push(`<button type="button" class="chest-btn sv-sm" data-act="confirm" data-id="${e.id}">Confirmer</button>`, `<button type="button" class="chest-btn-2 sv-sm" data-act="decline" data-id="${e.id}">Refuser</button>`);
      if (compact) return out.join('');
    }
    if (future && e.status === 'confirmed' && e.link) out.push(`<a class="chest-btn sv-sm" href="${esc(e.link)}" target="_blank" rel="noopener">Rejoindre</a>`);
    if (future && live(e)) out.push(`<button type="button" class="chest-btn-2 sv-sm" data-act="move" data-id="${e.id}">Déplacer</button>`, `<button type="button" class="sv-tl" data-act="cancel" data-id="${e.id}">Annuler</button>`);
    if (!future && (e.status === 'confirmed' || e.status === 'done') && !compact) out.push(`<button type="button" class="chest-btn-2 sv-sm" data-act="note" data-id="${e.id}">${ic('note')}Note de l’appel</button>`);
    return out.join('');
  }

  // Accueil (2026-10-28, « moins scolaire ») : les demandes à confirmer seulement s'il y en a, le prochain appel,
  // les missions à faire avant (fixées par l'éducateur avec une date de fin, cochées par l'élève), puis « Récemment ».
  function renderHome() {
    const D = S.D, up = upcoming(), n = up[0];
    const asks = up.filter((e) => e.status === 'proposed' && !mine(e) && e !== n);
    $('svAsk').hidden = !asks.length;
    $('svAsk').innerHTML = asks.map((e) => `<div class="sv-ask__i"><span class="sv-dot sv-dot--ask"></span><span><b>${esc(e.author)}</b> propose un appel ${esc(relDay(e.startsAt).toLowerCase())} à ${hm(e.startsAt)} · ${esc(e.topic)}</span><span class="sv-acts">${eventActions(e, true)}</span></div>`).join('');

    $('svNext').className = 'sv-next ed-span-7' + (n ? '' : ' is-empty');
    $('svNext').innerHTML = n ? (() => {
      const [lbl, tone] = statusOf(n);
      const d = new Date(n.startsAt);
      return `<div class="sv-next__date"><span>${fr(d, { weekday: 'short' })}</span><b>${d.getDate()}</b><span>${fr(d, { month: 'short' })}</span></div>
        <div class="sv-next__main">
          <span class="chest-step">Prochain appel</span>
          <h2>${esc(n.topic)}</h2>
          <p class="sv-next__when">${esc(relDay(d))} · ${hm(d)} – ${hm(end(n))} · ${MODES[n.mode] || 'Visio'}</p>
          <div class="sv-next__row"><span class="sv-chip sv-chip--${tone}">${lbl}</span><span class="sv-by">${n.common ? 'planning commun' : `proposé par ${mine(n) ? 'toi' : esc(n.author)}`}</span></div>
          <div class="sv-acts">${eventActions(n, true)}</div>
        </div>`;
    })() : `<div class="sv-next__main"><span class="chest-step">Prochain appel</span><h2>Rien de prévu pour l’instant</h2>
        <p class="sv-next__when">Propose un créneau à ${other() ? esc(other().first) : 'l’autre'} : il apparaît dans son espace pour qu’il le confirme.</p>
        <div class="sv-acts"><button type="button" class="chest-btn" data-new="event">Proposer un appel</button></div></div>`;

    renderTasks(n);

    const recent = D.notes.map((x) => ({ t: x.createdAt, html: `<li><button type="button" data-read-note="${x.id}"><span class="sv-mini__ic">${ic('note')}</span><b>${esc(x.title || 'Note')}</b><span>Note · ${esc(x.author)} · ${fr(x.createdAt, { day: 'numeric', month: 'short' })}</span></button></li>` }))
      .concat(D.library.map((x) => ({ t: x.createdAt, html: `<li><button type="button" data-open-lib="${x.id}"><span class="sv-mini__ic">${ic(x.kind)}</span><b>${esc(x.title)}</b><span>${KINDS[x.kind]} · ${esc(x.author)} · ${fr(x.createdAt, { day: 'numeric', month: 'short' })}</span></button></li>` })))
      .sort((a, b) => Date.parse(b.t) - Date.parse(a.t)).slice(0, 4);
    $('svRecent').innerHTML = recent.length ? `<ul class="sv-mini sv-mini--2">${recent.map((r) => r.html).join('')}</ul>` : '<p class="ed-empty">Les notes et les ressources partagées apparaîtront ici.</p>';
  }

  // Missions « avant le prochain appel » : date de fin par défaut = jour du prochain appel.
  function renderTasks(nextCall) {
    const T = S.D.tasks || [], staff = S.D.me.role !== 'member';
    const done = T.filter((t) => t.doneAt).length;
    $('svTaskMeta').textContent = T.length ? `${done} sur ${T.length} faite${done > 1 ? 's' : ''}` : '';
    const dueTxt = (t) => {
      if (!t.dueAt) return '';
      const days = Math.round((new Date(t.dueAt).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / DAY);
      const late = !t.doneAt && Date.parse(t.dueAt) < Date.now();
      const txt = late ? `en retard · ${fr(t.dueAt, { day: 'numeric', month: 'short' })}` : days === 0 ? "pour aujourd'hui" : days === 1 ? 'pour demain' : `pour le ${fr(t.dueAt, { weekday: 'short', day: 'numeric', month: 'short' })}`;
      return `<small class="${late ? 'is-late' : days <= 1 && !t.doneAt ? 'is-soon' : ''}">${txt}</small>`;
    };
    const list = T.length ? `${T.length ? `<div class="sv-tbar"><i style="transform:scaleX(${(done / T.length).toFixed(3)})"></i></div>` : ''}<ul class="sv-tasks">${T.map((t) => `<li class="sv-task${t.doneAt ? ' is-done' : ''}">
        <button type="button" class="sv-check" data-act="task-toggle" data-id="${t.id}" role="checkbox" aria-checked="${!!t.doneAt}" aria-label="${esc(t.title)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"/></svg></button>
        <span class="sv-task__t">${esc(t.title)}${dueTxt(t)}</span>
        ${staff ? `<button type="button" class="sv-ib sv-task__x" data-act="task-del" data-id="${t.id}" aria-label="Retirer la mission">${ic('trash')}</button>` : ''}
      </li>`).join('')}</ul>`
      : `<p class="ed-empty">${staff ? 'Fixe ce qu’il doit préparer avant votre prochain appel.' : `Rien à faire pour l’instant. ${other() ? esc(other().first) : 'Ton éducateur'} ajoutera ici ce qu’il faut préparer avant votre prochain appel.`}</p>`;
    const pad2 = (x) => String(x).padStart(2, '0');
    const def = nextCall ? new Date(nextCall.startsAt) : new Date(Date.now() + 7 * DAY);
    const add = staff ? `<form class="sv-tadd" id="svTaskAdd" novalidate>
        <input type="text" id="svTaskT" maxlength="200" placeholder="Nouvelle mission…" aria-label="Nouvelle mission">
        <input type="date" id="svTaskD" value="${def.getFullYear()}-${pad2(def.getMonth() + 1)}-${pad2(def.getDate())}" aria-label="Date de fin">
        <button type="submit" class="chest-btn sv-sm">Ajouter</button></form>` : '';
    $('svTasks').innerHTML = list + add;
    const f = $('svTaskAdd');
    if (f) f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = $('svTaskT').value.trim(), d = $('svTaskD').value;
      if (!title) return $('svTaskT').focus();
      try { S.D = await post('/mentor/tasks', { title, dueAt: d ? new Date(`${d}T23:59`).toISOString() : null }); render(); toast('Mission ajoutée.'); setTimeout(() => $('svTaskT') && $('svTaskT').focus(), 0); }
      catch (err) { toast(err.message); }
    });
  }

  function renderPlan() {
    if (!S.month) { const t = new Date(); S.month = new Date(t.getFullYear(), t.getMonth(), 1); }
    const m = S.month, first = (m.getDay() + 6) % 7, days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    $('svMonthT').textContent = fr(m, { month: 'long', year: 'numeric' });
    const byDay = new Map();
    S.D.events.filter((e) => e.status !== 'cancelled' && e.status !== 'declined').forEach((e) => { const k = dayKey(e.startsAt); byDay.set(k, (byDay.get(k) || []).concat(e)); });
    const today = dayKey(Date.now());
    let cells = ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d) => `<span class="sv-cal__h">${d}</span>`).join('');
    for (let i = 0; i < first; i++) cells += '<span></span>';
    for (let d = 1; d <= days; d++) {
      const date = new Date(m.getFullYear(), m.getMonth(), d), k = dayKey(date), evs = byDay.get(k) || [];
      const cls = ['sv-cal__d', k === today ? 'is-today' : '', S.day === k ? 'is-sel' : '', date < new Date(new Date().setHours(0, 0, 0, 0)) ? 'is-past' : ''].join(' ');
      cells += `<button type="button" class="${cls}" data-day="${date.getTime()}" aria-label="${fr(date, { weekday: 'long', day: 'numeric', month: 'long' })}${evs.length ? `, ${evs.length} appel${evs.length > 1 ? 's' : ''}` : ''}">${d}${evs.length ? `<i>${evs.slice(0, 3).map((e) => `<em class="sv-dot sv-dot--${statusOf(e)[1]}"></em>`).join('')}</i>` : ''}</button>`;
    }
    $('svCal').innerHTML = cells;

    let list = S.day ? S.D.events.filter((e) => dayKey(e.startsAt) === S.day).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)) : S.when === 'up' ? upcoming() : past();
    document.querySelectorAll('#svWhen [data-when]').forEach((b) => b.classList.toggle('is-active', !S.day && b.dataset.when === S.when));
    let html = S.day ? `<p class="sv-filter">${esc(fr(new Date(...S.day.split('-').map(Number)), { weekday: 'long', day: 'numeric', month: 'long' }))} <button type="button" class="am-link" id="svAllDays">Tout afficher</button></p>` : '';
    let last = '';
    html += list.length ? list.map((e) => {
      const [lbl, tone] = statusOf(e);
      const k = dayKey(e.startsAt), head = k !== last ? `<div class="sv-ag__day">${esc(dayHead(e.startsAt))}</div>` : '';
      last = k;
      const note = S.D.notes.find((x) => x.eventId === e.id);
      return `${head}<div class="sv-ag ${tone === 'off' ? 'is-off' : ''}">
        <div class="sv-ag__t"><b>${hm(e.startsAt)}</b><span>${e.minutes} min</span></div>
        <div class="sv-ag__m"><b>${esc(e.topic)}</b><span>${MODES[e.mode] || 'Visio'} · proposé par ${mine(e) ? 'toi' : esc(e.author)}${note ? ' · <button type="button" class="am-link" data-read-note="' + note.id + '">voir la note</button>' : ''}</span></div>
        <span class="sv-chip sv-chip--${tone}">${lbl}</span>
        <div class="sv-acts">${eventActions(e)}</div>
      </div>`;
    }).join('') : `<p class="ed-empty">${S.day ? 'Aucun appel ce jour-là.' : S.when === 'up' ? 'Aucun appel à venir.' : 'Aucun appel passé.'}</p>`;
    $('svAgenda').innerHTML = html;
    const all = $('svAllDays');
    if (all) all.onclick = () => { S.day = null; renderPlan(); };
  }

  function renderNotes() {
    const N = S.D.notes;
    $('svNotes').innerHTML = N.length ? N.map((x) => {
      const ev = x.eventId && eventById(x.eventId);
      return `<article class="sv-note" id="note-${x.id}">
        <header><div><h3>${esc(x.title || 'Note')}</h3><span>${esc(x.author)} · ${fr(x.createdAt, { day: 'numeric', month: 'long', year: 'numeric' })}${x.updatedAt !== x.createdAt ? ' · modifiée' : ''}</span></div>
          ${ev ? `<span class="sv-chip">${ic('cal')}Appel du ${fr(ev.startsAt, { day: 'numeric', month: 'short' })}</span>` : ''}</header>
        <div class="sv-note__body">${textToHtml(x.body)}</div>
        ${mine(x) || S.D.me.role === 'admin' ? `<footer><button type="button" class="sv-tl" data-act="edit-note" data-id="${x.id}">${ic('edit')}Modifier</button><button type="button" class="sv-tl sv-tl--red" data-act="del-note" data-id="${x.id}">${ic('trash')}Supprimer</button></footer>` : ''}
      </article>`;
    }).join('') : `<div class="sv-alone"><span class="sv-alone__ic">${ic('note')}</span><h2>Aucune note</h2><p>Après chaque appel, notez ce qui a été vu et la suite à donner. Les deux peuvent écrire.</p></div>`;
  }

  function renderLib() {
    document.querySelectorAll('#svKinds [data-kind]').forEach((b) => b.classList.toggle('is-active', b.dataset.kind === S.kind));
    const L = S.D.library.filter((x) => !S.kind || x.kind === S.kind);
    const canDel = (x) => mine(x) || S.D.me.role !== 'member';
    $('svLib').innerHTML = L.length ? L.map((x) => {
      const v = x.kind === 'video' && parseVideo(x.url);
      const isImg = x.file && /^image\//.test(x.file.mime || '');
      const cover = v && v.thumb ? `<img src="${esc(v.thumb)}" alt="" loading="lazy">` : isImg ? `<img src="${esc(fileUrl(x.file))}" alt="" loading="lazy">`
        : x.kind === 'text' ? `<p>${esc(x.body.slice(0, 180))}</p>` : `<span class="sv-card__big">${ic(x.kind)}</span>`;
      const meta = x.kind === 'link' ? (() => { try { return new URL(x.url).hostname.replace(/^www\./, ''); } catch (e) { return 'Lien'; } })()
        : x.file ? `${esc(x.file.name)} · ${fmtSize(x.file.size)}` : KINDS[x.kind];
      return `<article class="sv-card sv-card--${x.kind}">
        <button type="button" class="sv-card__open" data-open-lib="${x.id}" aria-label="Ouvrir ${esc(x.title)}">
          <span class="sv-card__cover">${cover}${x.kind === 'video' ? `<span class="sv-card__play">${ic('play')}</span>` : ''}</span>
          <span class="sv-card__kind">${ic(x.kind)}${KINDS[x.kind]}</span>
          <b class="sv-card__t">${esc(x.title)}</b>
          <span class="sv-card__m">${meta}</span>
          <span class="sv-card__by">${esc(x.author)} · ${fr(x.createdAt, { day: 'numeric', month: 'short' })}</span>
        </button>
        ${canDel(x) ? `<button type="button" class="sv-ib sv-card__del" data-act="del-lib" data-id="${x.id}" aria-label="Retirer ${esc(x.title)}">${ic('trash')}</button>` : ''}
      </article>`;
    }).join('') : `<div class="sv-alone"><span class="sv-alone__ic">${ic('video')}</span><h2>${S.kind ? 'Rien dans cette catégorie' : 'Aucune ressource'}</h2><p>Ajoutez un texte, une vidéo (fichier ou lien YouTube / Vimeo), un lien ou un document : il apparaît chez vous deux.</p></div>`;
  }

  // ---------- vues ----------
  function setView(v) {
    document.querySelectorAll('#svNav [data-view]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === v)));
    document.querySelectorAll('#svSpace .am-view').forEach((p) => { p.hidden = p.dataset.panel !== v; });
    try { localStorage.setItem('chest_suivi_view', v); } catch (e) { /* tant pis */ }
  }

  // ---------- fenêtre (proposer, noter, ajouter, lire) ----------
  const dlg = $('svDlg');
  function openDlg(step, title, body, foot, onSubmit) {
    $('svDlgStep').textContent = step;
    $('svDlgT').textContent = title;
    $('svDlgBody').innerHTML = body;
    $('svDlgFoot').innerHTML = foot || '';
    $('svDlgFoot').hidden = !foot;
    $('svDlgMsg').textContent = '';
    dlg.classList.toggle('is-wide', !onSubmit);
    S.dlg = onSubmit;
    if (!dlg.open) dlg.showModal();
    const f = $('svDlgBody').querySelector('input:not([type=hidden]):not([type=file]),textarea');
    if (f && onSubmit) f.focus();
  }
  function closeDlg() { if (dlg.open) dlg.close(); $('svDlgBody').innerHTML = ''; S.dlg = null; }
  dlg.addEventListener('close', () => { $('svDlgBody').innerHTML = ''; S.dlg = null; });
  dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-close]')) closeDlg(); });
  $('svForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!S.dlg) return;
    const btn = $('svDlgFoot').querySelector('[type=submit]');
    if (btn) btn.disabled = true;
    try { await S.dlg(); closeDlg(); } catch (err) { $('svDlgMsg').textContent = err.message; } finally { if (btn) btn.disabled = false; }
  });
  const foot = (label) => `<button type="button" class="chest-btn-2" data-close>Annuler</button><button type="submit" class="chest-btn">${label}</button>`;
  const seg = (name, opts, val) => `<div class="chest-seg sv-seg" data-seg="${name}" role="group">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${String(v) === String(val) ? 'is-active' : ''}">${l}</button>`).join('')}</div>`;
  const segVal = (name) => { const b = $('svDlgBody').querySelector(`[data-seg="${name}"] .is-active`); return b ? b.dataset.v : ''; };
  $('svDlgBody').addEventListener('click', (e) => {
    const b = e.target.closest('[data-seg] [data-v]');
    if (!b) return;
    b.parentElement.querySelectorAll('[data-v]').forEach((x) => x.classList.toggle('is-active', x === b));
    const sync = $('svDlgBody').dataset.sync;
    if (sync) syncKind();
  });
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  function eventForm(ev, day) {
    const d = ev ? new Date(ev.startsAt) : (() => { const x = day ? new Date(day) : new Date(Date.now() + DAY); x.setHours(18, 0, 0, 0); return x; })();
    openDlg(ev ? 'Déplacer' : 'Appels', ev ? 'Déplacer l’appel' : 'Proposer un appel', `
      <div class="sv-row2"><label class="ed-field"><span>Date</span><input type="date" id="fDate" value="${ymd(d)}" min="${ymd(new Date())}" required></label>
      <label class="ed-field"><span>Heure</span><input type="time" id="fTime" value="${pad(d.getHours())}:${pad(d.getMinutes())}" step="900" required></label></div>
      <div class="ed-field"><span>Durée</span>${seg('min', [[30, '30 min'], [45, '45 min'], [60, '1 h'], [90, '1 h 30']], ev ? ev.minutes : 45)}</div>
      <label class="ed-field"><span>Sujet</span><input type="text" id="fTopic" maxlength="140" value="${esc(ev ? ev.topic : '')}" placeholder="Ex. Revue de mes trades de la semaine"></label>
      <div class="ed-field"><span>Format</span>${seg('mode', Object.entries(MODES), ev ? ev.mode || 'visio' : 'visio')}</div>
      <label class="ed-field"><span>Lien de la visio <i>(facultatif)</i></span><input type="url" id="fLink" maxlength="300" value="${esc(ev ? ev.link : '')}" placeholder="https://meet.google.com/…"></label>
      <p class="ed-hint">${S.D.me.role !== 'member' ? `L’appel est posé directement dans le planning de ${esc(S.D.member.first)}, déjà confirmé (il le voit aussi dans School).` : `${ev ? 'L’appel déplacé redevient une proposition' : 'Ta proposition apparaît'} chez ${other() ? esc(other().first) : 'l’autre'}, qui la confirme ou la refuse.`}</p>`, foot(S.D.me.role !== 'member' ? (ev ? 'Enregistrer' : 'Ajouter au planning') : ev ? 'Proposer ce créneau' : 'Envoyer la proposition'), async () => {
      const date = $('fDate').value, time = $('fTime').value;
      if (!date || !time) throw new Error('Choisis une date et une heure.');
      const at = new Date(`${date}T${time}`);
      if (at.getTime() < Date.now()) throw new Error('Ce créneau est déjà passé.');
      S.D = await post('/mentor/events', { id: ev && ev.id, startsAt: at.toISOString(), minutes: +segVal('min'), topic: $('fTopic').value, mode: segVal('mode'), link: $('fLink').value.trim() });
      S.month = new Date(at.getFullYear(), at.getMonth(), 1);
      render();
      toast(S.D.me.role !== 'member' ? 'Ajouté à son planning.' : ev ? 'Nouveau créneau proposé.' : 'Proposition envoyée.');
    });
  }

  function noteForm(n, eventId) {
    const evs = S.D.events.filter((e) => e.status === 'confirmed' || e.status === 'done' || e.status === 'proposed').sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
    const sel = n ? n.eventId : eventId;
    const ev = sel && eventById(sel);
    openDlg('Notes', n ? 'Modifier la note' : 'Nouvelle note', `
      <label class="ed-field"><span>Appel lié</span><select id="fEv"><option value="">Aucun</option>${evs.map((e) => `<option value="${e.id}" ${e.id === sel ? 'selected' : ''}>${esc(fr(e.startsAt, { day: 'numeric', month: 'short' }))} · ${esc(e.topic)}</option>`).join('')}</select></label>
      <label class="ed-field"><span>Titre</span><input type="text" id="fTitle" maxlength="140" value="${esc(n ? n.title : ev ? `Appel du ${fr(ev.startsAt, { day: 'numeric', month: 'long' })}` : '')}" placeholder="Ex. Appel du 3 novembre"></label>
      <label class="ed-field"><span>Note</span><textarea id="fBody" rows="9" maxlength="20000" placeholder="Ce qui a été vu, ce qu’il reste à travailler, les objectifs d’ici la prochaine séance…">${esc(n ? n.body : '')}</textarea></label>`,
    foot(n ? 'Enregistrer' : 'Ajouter la note'), async () => {
      S.D = await post('/mentor/notes', { id: n && n.id, eventId: +$('fEv').value || null, title: $('fTitle').value, body: $('fBody').value });
      render();
      toast('Note enregistrée.');
    });
  }

  function syncKind() {
    const k = segVal('kind');
    $('svDlgBody').querySelectorAll('[data-for]').forEach((el) => { el.hidden = !el.dataset.for.split(' ').includes(k); });
    const f = $('fFile');
    if (f) f.accept = k === 'video' ? 'video/*' : '';
  }
  function libForm() {
    openDlg('Ressources', 'Ajouter une ressource', `
      <div class="ed-field"><span>Type</span>${seg('kind', Object.entries(KINDS), S.kind || 'text')}</div>
      <label class="ed-field"><span>Titre</span><input type="text" id="fTitle" maxlength="140" placeholder="Ex. Ma routine avant l’ouverture de Londres"></label>
      <label class="ed-field" data-for="text"><span>Texte</span><textarea id="fBody" rows="9" maxlength="20000"></textarea></label>
      <label class="ed-field" data-for="video link"><span id="fUrlL">Lien</span><input type="url" id="fUrl" maxlength="500" placeholder="https://"></label>
      <label class="ed-field sv-drop" data-for="video file"><span>Fichier</span><input type="file" id="fFile"><em class="ed-hint" data-for="video">Une vidéo envoyée ou un lien YouTube / Vimeo, au choix.</em></label>
      <label class="ed-field" data-for="link file video"><span>Description <i>(facultatif)</i></span><textarea id="fDesc" rows="3" maxlength="2000"></textarea></label>
      <div class="sv-prog" id="fProg" hidden><i></i></div>`,
    foot('Ajouter'), async () => {
      const kind = segVal('kind');
      const fd = new FormData();
      const file = $('fFile').files[0];
      fd.append('data', JSON.stringify({ member: S.D.member.id, kind, title: $('fTitle').value, body: kind === 'text' ? $('fBody').value : $('fDesc').value, url: kind === 'video' || kind === 'link' ? $('fUrl').value.trim() : '' }));
      if (file && (kind === 'video' || kind === 'file')) fd.append('file', file, file.name);
      const prog = $('fProg');
      if (file) prog.hidden = false;
      S.D = await upload(fd, (p) => { prog.firstElementChild.style.transform = `scaleX(${p})`; });
      render();
      toast('Ressource ajoutée.');
    });
    $('svDlgBody').dataset.sync = '1';
    syncKind();
  }

  function readNote(id) {
    const x = S.D.notes.find((n) => n.id === id);
    if (!x) return;
    const ev = x.eventId && eventById(x.eventId);
    openDlg(`${x.author} · ${fr(x.createdAt, { day: 'numeric', month: 'long' })}`, x.title || 'Note', `${ev ? `<p class="sv-chip">${ic('cal')}Appel du ${fr(ev.startsAt, { day: 'numeric', month: 'long' })} · ${esc(ev.topic)}</p>` : ''}<div class="sv-read">${textToHtml(x.body)}</div>`);
  }
  function openLib(id) {
    const x = S.D.library.find((l) => l.id === id);
    if (!x) return;
    const desc = x.body && x.kind !== 'text' ? `<div class="sv-read">${textToHtml(x.body)}</div>` : '';
    if (x.kind === 'text') return openDlg(`${x.author} · Texte`, x.title, `<div class="sv-read">${textToHtml(x.body)}</div>`);
    if (x.kind === 'video') {
      const v = parseVideo(x.url);
      if (x.file) return openDlg(`${x.author} · Vidéo`, x.title, `<video class="sv-player" src="${esc(fileUrl(x.file))}" controls autoplay playsinline></video>${desc}`);
      if (v) return openDlg(`${x.author} · Vidéo`, x.title, `<div class="sv-player"><iframe src="${esc(v.src)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen title="${esc(x.title)}"></iframe></div>${desc}`);
    }
    if (x.file && /^image\//.test(x.file.mime || '')) return openDlg(`${x.author} · Image`, x.title, `<img class="sv-player sv-player--img" src="${esc(fileUrl(x.file))}" alt="">${desc}`);
    window.open(x.file ? fileUrl(x.file) : x.url, '_blank', 'noopener');
  }

  // ---------- petites confirmations ----------
  let toastT;
  function toast(msg) {
    let t = $('svToast');
    if (!t) { t = document.createElement('div'); t.id = 'svToast'; t.className = 'sv-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('is-on');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('is-on'), 2600);
  }
  const ask = (msg, label) => (window.CHESTConfirm ? window.CHESTConfirm(msg, { confirmLabel: label }) : Promise.resolve(true));

  // ---------- clics ----------
  document.addEventListener('click', async (e) => {
    const t = e.target;
    const v = t.closest('#svNav [data-view]'); if (v) return setView(v.dataset.view);
    const g = t.closest('[data-goto]'); if (g) return setView(g.dataset.goto);
    const st = t.closest('[data-open]'); if (st) return go(`?member=${st.dataset.open}`);
    const nw = t.closest('[data-new]');
    if (nw) return nw.dataset.new === 'event' ? eventForm() : nw.dataset.new === 'note' ? noteForm() : libForm();
    const rn = t.closest('[data-read-note]'); if (rn) return readNote(+rn.dataset.readNote);
    const ol = t.closest('[data-open-lib]'); if (ol) return openLib(+ol.dataset.openLib);
    const w = t.closest('#svWhen [data-when]'); if (w) { S.when = w.dataset.when; S.day = null; return renderPlan(); }
    const k = t.closest('#svKinds [data-kind]'); if (k) { S.kind = k.dataset.kind; return renderLib(); }
    if (t.closest('#svPrev') || t.closest('#svNextM')) { S.month = new Date(S.month.getFullYear(), S.month.getMonth() + (t.closest('#svPrev') ? -1 : 1), 1); return renderPlan(); }
    const dd = t.closest('[data-day]');
    if (dd) {
      const day = new Date(+dd.dataset.day), key = dayKey(day);
      const has = S.D.events.some((x) => dayKey(x.startsAt) === key);
      if (!has && day >= new Date(new Date().setHours(0, 0, 0, 0))) return eventForm(null, day);
      S.day = S.day === key ? null : key;
      return renderPlan();
    }
    const act = t.closest('[data-act]');
    if (!act) return;
    const id = +act.dataset.id;
    try {
      switch (act.dataset.act) {
        case 'confirm': S.D = await api(`/mentor/events/${id}/status`, { method: 'POST', body: JSON.stringify({ status: 'confirmed' }) }); toast('Appel confirmé.'); break;
        case 'decline': if (!(await ask('Refuser ce créneau ? L’autre pourra en proposer un nouveau.', 'Refuser'))) return; S.D = await api(`/mentor/events/${id}/status`, { method: 'POST', body: JSON.stringify({ status: 'declined' }) }); break;
        case 'cancel': if (!(await ask('Annuler cet appel ?', 'Annuler l’appel'))) return; S.D = await api(`/mentor/events/${id}/status`, { method: 'POST', body: JSON.stringify({ status: 'cancelled' }) }); toast('Appel annulé.'); break;
        case 'task-toggle': S.D = await api(`/mentor/tasks/${id}/toggle`, { method: 'POST' }); break;
        case 'task-del': if (!(await ask('Retirer cette mission ?', 'Retirer'))) return; S.D = await api(`/mentor/tasks/${id}/delete`, { method: 'POST' }); break;
        case 'move': return eventForm(eventById(id));
        case 'note': { const n = S.D.notes.find((x) => x.eventId === id); return n && mine(n) ? noteForm(n) : noteForm(null, id); }
        case 'edit-note': return noteForm(S.D.notes.find((x) => x.id === id));
        case 'del-note': if (!(await ask('Supprimer cette note ?', 'Supprimer'))) return; S.D = await api(`/mentor/notes/${id}/delete`, { method: 'POST' }); break;
        case 'del-lib': if (!(await ask('Retirer cette ressource ?', 'Retirer'))) return; S.D = await api(`/mentor/library/${id}/delete`, { method: 'POST' }); break;
        default: return;
      }
      render();
    } catch (err) { toast(err.message); }
  });

  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.D) load(); });
  try { const v = localStorage.getItem('chest_suivi_view'); if (v) setView(v); } catch (e) { /* tant pis */ }
  if (query.get('view')) setView(query.get('view'));
  load();
})();
