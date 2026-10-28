// CHEST — School côté admin (2026-10-28). L'admin voit chaque éducateur (élèves, appels de la semaine, notes du mois,
// retards, demandes en attente), ouvre ses élèves (js/mentor-hub.js filtré), et pose un planning commun : un appel
// collectif (répété chaque semaine si besoin, déjà confirmé) ou une mission, chez tous les élèves ou ceux de certains
// éducateurs. Données : GET /mentor/educators, POST /mentor/common, POST /mentor/common/<id>/delete.
(() => {
  'use strict';
  const A = window.CHESTAccounts;
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initials = (n) => String(n || '?').split(/\s+/).map((w) => w[0] || '').join('').slice(0, 2).toUpperCase();
  const pad = (x) => String(x).padStart(2, '0');
  const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
  const when = (iso, withTime) => new Date(iso).toLocaleString('fr-FR', withTime ? { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { weekday: 'short', day: 'numeric', month: 'short' });
  const PALETTE = [['#b79bff', '#6b4dff'], ['#ff8fc4', '#fc1283'], ['#ffc59a', '#f9a45e'], ['#7ce3f5', '#0f93ad'], ['#5ff0bd', '#13a274']];
  const CAL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M9 3v4M15 3v4"/></svg>';
  const TRASH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>';
  const S = { box: null, data: null, kind: 'event', scope: [] };

  async function call(path, body) {
    const r = await fetch(A.apiBase() + path, { method: body ? 'POST' : 'GET', headers: Object.assign({ Authorization: 'Bearer ' + A.getToken() }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Le serveur ne répond pas pour le moment.');
    return d;
  }

  function eduCard(e, i) {
    const [c1, c2] = PALETTE[i % PALETTE.length];
    return `<button type="button" class="mh-card sa-card" data-edu="${e.id}" style="--c1:${c1};--c2:${c2}">
      <span class="mh-card__top"><span class="mh-av">${esc(initials(e.name))}</span>
        <span class="mh-card__who"><b>${esc(e.name)}</b><small>${e.code ? `Code ${esc(e.code)}` : 'Code pas encore choisi'}</small></span></span>
      <span class="sa-stats"><span><b>${e.students}</b>${e.students > 1 ? 'élèves' : 'élève'}${e.students !== e.active ? ` · ${e.active} actif${e.active > 1 ? 's' : ''}` : ''}</span><span><b>${e.calls}</b>appel${e.calls > 1 ? 's' : ''} sur 7 j</span><span><b>${e.held30}</b>tenu${e.held30 > 1 ? 's' : ''} sur 30 j</span><span><b>${e.notes30}</b>note${e.notes30 > 1 ? 's' : ''} sur 30 j</span></span>
      <span class="mh-card__next">${CAL}${e.next ? `<b>${esc(when(e.next, true))}</b>` : '<span class="mh-muted">Aucun appel prévu</span>'}</span>
      <span class="mh-card__foot"><span>${e.late ? `<em class="sa-late">${plural(e.late, 'mission en retard', 'missions en retard')}</em>` : 'Rien en retard'}</span>${e.pending ? `<span class="mh-tag mh-tag--ask">${e.pending} à confirmer</span>` : ''}<span class="mh-go">Ses élèves <i>→</i></span></span>
    </button>`;
  }

  function commonRow(c) {
    const eds = (c.educators || []).map((id) => (S.data.educators.find((e) => e.id === id) || {}).first).filter(Boolean);
    const date = c.kind === 'event' ? `${when(c.startsAt, true)}${c.weeks > 1 ? ` · chaque semaine, ${c.weeks} fois` : ''} · ${c.minutes} min` : c.dueAt ? `pour le ${when(c.dueAt)}` : 'sans date de fin';
    return `<li class="sa-row"><span class="sa-row__k sa-row__k--${c.kind}">${c.kind === 'event' ? 'Appel' : 'Mission'}</span>
      <span class="sa-row__main"><b>${esc(c.title)}</b><small>${esc(date)} · ${eds.length ? 'élèves de ' + esc(eds.join(', ')) : 'tous les élèves'}</small></span>
      <span class="sa-row__n">${c.kind === 'task' ? `<b>${c.done}/${c.members}</b>faites` : `<b>${c.members}</b>élève${c.members > 1 ? 's' : ''}`}</span>
      <button type="button" class="sa-ib" data-del-common="${c.id}" aria-label="Retirer « ${esc(c.title)} » du planning de tous">${TRASH}</button></li>`;
  }

  function form() {
    const d = new Date(Date.now() + 2 * 86400000), ev = S.kind === 'event';
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const reach = S.scope.length ? S.data.educators.filter((e) => S.scope.includes(e.id)).reduce((n, e) => n + e.students, 0) : S.data.students;
    return `<form class="sa-form" id="saForm" novalidate>
      <div class="sa-seg" role="radiogroup" aria-label="Type">${[['event', 'Appel collectif'], ['task', 'Mission']].map(([k, l]) => `<button type="button" role="radio" aria-checked="${S.kind === k}" data-kind="${k}">${l}</button>`).join('')}</div>
      <label class="sa-f sa-f--wide"><span>${ev ? 'Sujet de l’appel' : 'Mission'}</span><input type="text" id="saTitle" maxlength="${ev ? 140 : 200}" placeholder="${ev ? 'Live collectif : revue de la semaine' : 'Remplir son journal chaque soir'}" autocomplete="off"></label>
      ${ev ? `<label class="sa-f"><span>Date</span><input type="date" id="saDate" value="${date}"></label>
        <label class="sa-f"><span>Heure</span><input type="time" id="saTime" value="19:00"></label>
        <label class="sa-f"><span>Durée</span><select id="saMin">${[30, 45, 60, 90, 120].map((m) => `<option value="${m}" ${m === 60 ? 'selected' : ''}>${m} min</option>`).join('')}</select></label>
        <label class="sa-f"><span>Répéter</span><select id="saWeeks">${[[1, 'Une fois'], [2, '2 semaines'], [4, '4 semaines'], [8, '8 semaines'], [12, '12 semaines']].map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
        <label class="sa-f sa-f--wide"><span>Lien de visio (facultatif)</span><input type="url" id="saLink" placeholder="https://meet.google.com/…" autocomplete="off"></label>`
      : `<label class="sa-f"><span>À faire pour le</span><input type="date" id="saDue" value="${date}"></label>`}
      <div class="sa-f sa-f--wide"><span>Pour</span><div class="sa-scope">
        <button type="button" class="sa-pill${S.scope.length ? '' : ' is-on'}" data-scope="all" aria-pressed="${!S.scope.length}">Tous les éducateurs</button>
        ${S.data.educators.map((e) => `<button type="button" class="sa-pill${S.scope.includes(e.id) ? ' is-on' : ''}" data-scope="${e.id}" aria-pressed="${S.scope.includes(e.id)}">${esc(e.first)} <small>${e.students}</small></button>`).join('')}</div></div>
      <p class="sa-err" id="saErr" role="alert"></p>
      <div class="sa-form__foot"><span>${ev ? 'Déjà confirmé chez chaque élève, dans son espace et son planning.' : 'Ajoutée aux missions de chaque élève, cochable par lui.'}</span>
        <button type="submit" class="chest-btn" ${reach ? '' : 'disabled'}>Ajouter chez ${plural(reach, 'élève', 'élèves')}</button></div>
    </form>`;
  }

  function renderHome() {
    const D = S.data, E = D.educators;
    const sum = (k) => E.reduce((n, e) => n + (e[k] || 0), 0);
    const facts = [[E.length, E.length > 1 ? 'éducateurs' : 'éducateur'], [D.students, D.students > 1 ? 'élèves suivis' : 'élève suivi'], [sum('calls'), 'appels sur 7 j'],
      [sum('pending'), 'à confirmer', sum('pending') ? 'ask' : ''], [sum('late'), sum('late') > 1 ? 'missions en retard' : 'mission en retard', sum('late') ? 'late' : '']];
    S.box.innerHTML = `<header class="mh-head"><div><div class="chest-step">School · Admin</div><h1>Tes éducateurs</h1>
        <p>Comment chacun suit ses élèves, et le planning commun que tu poses chez tous.</p></div></header>
      <div class="mh-facts">${facts.map(([n, l, c]) => `<span class="${c ? 'is-' + c : ''}"><b>${n}</b>${l}</span>`).join('')}</div>
      ${E.length ? `<div class="mh-grid">${E.map(eduCard).join('')}</div>` : '<div class="mh-empty"><b>Aucun éducateur pour le moment</b>Donne le rôle Éducateur à un membre depuis Membres.</div>'}
      <section class="sa-common" aria-labelledby="saH">
        <div class="sa-common__head"><div><div class="chest-step">Planning commun</div><h2 id="saH">Le même rendez-vous chez tous</h2>
          <p>Un live collectif chaque semaine, une mission pour tout le monde : posé une fois, copié dans l’espace de chaque élève. Le retirer l’enlève partout.</p></div></div>
        <div class="sa-common__grid">${form()}
          <div class="sa-list"><div class="sa-list__h">${D.common.length ? plural(D.common.length, 'élément posé', 'éléments posés') : 'Rien de posé pour l’instant'}</div>
            ${D.common.length ? `<ul>${D.common.map(commonRow).join('')}</ul>` : '<p class="sa-empty">Les appels et missions communs apparaîtront ici.</p>'}</div></div>
      </section>`;
  }

  async function openEducator(id) {
    const e = S.data.educators.find((x) => x.id === id);
    if (!e || !window.CHESTMentorHub) return;
    await CHESTMentorHub.render(S.box, { educator: id, head: `<header class="mh-head"><div><button type="button" class="sa-back" data-sa-back>← Tous les éducateurs</button>
      <div class="chest-step">School · Admin · ${esc(e.first)}</div><h1>Élèves de ${esc(e.name)}</h1><p>Ouvre un élève pour voir ses appels, ses missions et ses notes.</p></div></header>` });
    S.box.scrollIntoView({ block: 'start' });
  }

  async function load() {
    S.data = await call('/mentor/educators');
    renderHome();
  }

  async function render(box) {
    S.box = box;
    try { await load(); } catch (e) { box.innerHTML = `<p class="mh-empty">${esc(e.message)}</p>`; return; }
    if (box.dataset.saWired) return;
    box.dataset.saWired = '1';
    box.addEventListener('click', async (ev) => {
      const t = ev.target;
      const edu = t.closest('[data-edu]');
      if (edu) return openEducator(Number(edu.dataset.edu));
      if (t.closest('[data-sa-back]')) return renderHome();
      const k = t.closest('[data-kind]');
      if (k) { S.kind = k.dataset.kind; renderHome(); document.getElementById('saTitle').focus(); return; }
      const sc = t.closest('[data-scope]');
      if (sc) {
        const v = sc.dataset.scope;
        if (v === 'all') S.scope = []; else { const id = Number(v); S.scope = S.scope.includes(id) ? S.scope.filter((x) => x !== id) : S.scope.concat(id); }
        const title = document.getElementById('saTitle').value;
        renderHome(); document.getElementById('saTitle').value = title;
        return;
      }
      const del = t.closest('[data-del-common]');
      if (del) {
        const c = S.data.common.find((x) => x.id === Number(del.dataset.delCommon));
        if (!c || !confirm(`Retirer « ${c.title} » du planning de ${plural(c.members, 'élève', 'élèves')} ?`)) return;
        try { S.data = await call(`/mentor/common/${c.id}/delete`, {}); renderHome(); } catch (e) { alert(e.message); }
      }
    });
    box.addEventListener('submit', async (ev) => {
      if (ev.target.id !== 'saForm') return;
      ev.preventDefault();
      const v = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
      const err = document.getElementById('saErr'); err.textContent = '';
      const title = v('saTitle');
      if (!title) { err.textContent = 'Donne un titre.'; document.getElementById('saTitle').focus(); return; }
      const body = { kind: S.kind, title, educators: S.scope };
      if (S.kind === 'event') {
        if (!v('saDate') || !v('saTime')) { err.textContent = 'Choisis la date et l’heure.'; return; }
        Object.assign(body, { startsAt: new Date(`${v('saDate')}T${v('saTime')}`).toISOString(), minutes: Number(v('saMin')), weeks: Number(v('saWeeks')), mode: 'visio', link: v('saLink') });
      } else if (v('saDue')) body.dueAt = new Date(`${v('saDue')}T23:59`).toISOString();
      const btn = ev.target.querySelector('[type="submit"]'); btn.disabled = true;
      try { S.data = await call('/mentor/common', body); renderHome(); if (window.showToast) showToast('Ajouté au planning des élèves'); else if (window.parent && window.parent.showToast) window.parent.showToast('Ajouté au planning des élèves'); }
      catch (e) { err.textContent = e.message; btn.disabled = false; }
    });
  }

  window.CHESTSchoolAdmin = { render };
})();
