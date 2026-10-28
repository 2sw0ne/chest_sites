// CHEST — Élèves d'un éducateur (2026-10-28) : une carte par élève (rang + prix, prochain appel, missions, dernière
// note). Page principale de School pour un éducateur, et suivi.html sans ?member=. Données : GET /mentor/students
// (l'admin passe { educator: id } pour ne voir que les élèves d'un éducateur, js/school-admin.js).
(() => {
  'use strict';
  const A = window.CHESTAccounts;
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initials = (n) => String(n || '?').split(/\s+/).map((w) => w[0] || '').join('').slice(0, 2).toUpperCase();
  const DAY = 86400000;
  const rel = (iso) => {
    const d = new Date(iso), days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / DAY);
    const t = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return (days === 0 ? "Aujourd'hui" : days === 1 ? 'Demain' : d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })) + ' · ' + t;
  };
  const ago = (iso) => {
    const d = Math.floor((Date.now() - Date.parse(iso)) / DAY);
    return d <= 0 ? "aujourd'hui" : d === 1 ? 'hier' : `il y a ${d} jours`;
  };
  const CAL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M9 3v4M15 3v4"/></svg>';

  function open(id) {
    const sh = window.parent && window.parent !== window && window.parent.CHESTShell;
    if (sh && sh.go) sh.go('suivi', `?member=${id}`); else location.href = `suivi.html?member=${id}`;
  }

  function card(s) {
    const t = s.tasks || { total: 0, done: 0, late: 0 };
    const R = window.CHESTRank;
    const info = R ? R.info(s.planKey, s.level) : { c1: '#fc1283', c2: '#f9a45e' };
    const pending = s.pending ? `<span class="mh-tag mh-tag--ask">${s.pending} appel${s.pending > 1 ? 's' : ''} à confirmer</span>` : '';
    return `<button type="button" class="mh-card${s.active === false ? ' is-off' : ''}" data-mh-open="${s.id}" style="--c1:${info.c1};--c2:${info.c2}">
      <span class="mh-card__top"><span class="mh-av">${esc(initials(s.name))}</span>
        <span class="mh-card__who"><b>${esc(s.name)}</b><small>${s.educator !== undefined && (A.getUser() || {}).isAdmin ? (s.educator ? `Avec ${esc(s.educator)} · ` : 'Sans éducateur · ') : ''}${s.active === false ? 'Accès terminé' : s.endsAt ? `jusqu’au ${new Date(s.endsAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}` : esc(s.plan)}</small></span></span>
      <span class="mh-card__rank">${R ? R.chip(s.planKey, s.level, s.price, s.active !== false) : esc(s.plan)}</span>
      <span class="mh-card__next">${CAL}${s.next ? `<b>${esc(rel(s.next.starts_at))}</b>${s.next.status === 'proposed' ? '<span class="mh-tag mh-tag--ask">à confirmer</span>' : '<span class="mh-tag mh-tag--ok">confirmé</span>'}` : '<span class="mh-muted">Aucun appel prévu</span>'}</span>
      <span class="mh-card__tasks"><span class="mh-bar"><i style="transform:scaleX(${t.total ? (t.done / t.total).toFixed(3) : 0})"></i></span>
        <span>${t.total ? `${t.done}/${t.total} mission${t.total > 1 ? 's' : ''}` : 'Aucune mission'}${t.late ? ` · <em>${t.late} en retard</em>` : ''}</span></span>
      <span class="mh-card__foot"><span>${s.lastNoteAt ? `Dernière note ${ago(s.lastNoteAt)}` : 'Pas encore de note'}</span>${pending}<span class="mh-go">Ouvrir <i>→</i></span></span>
    </button>`;
  }

  async function render(box, opts) {
    const o = opts || {};
    let list;
    try {
      const r = await fetch(A.apiBase() + '/mentor/students' + (o.educator ? `?educator=${o.educator}` : ''), { headers: { Authorization: 'Bearer ' + A.getToken() } });
      if (!r.ok) throw new Error();
      list = (await r.json()).students;
    } catch (e) { box.innerHTML = '<p class="mh-empty">Impossible de charger tes élèves pour le moment.</p>'; return null; }
    const now = Date.now(), week = now + 7 * DAY;
    // l'élève qui attend une réponse d'abord, puis le prochain appel le plus proche
    list.sort((a, b) => (b.pending > 0) - (a.pending > 0) || (a.next ? Date.parse(a.next.starts_at) : Infinity) - (b.next ? Date.parse(b.next.starts_at) : Infinity));
    const calls = list.filter((s) => s.next && Date.parse(s.next.starts_at) <= week).length;
    const pend = list.reduce((n, s) => n + (s.pending || 0), 0);
    const late = list.reduce((n, s) => n + ((s.tasks && s.tasks.late) || 0), 0);
    const facts = [[list.length, list.length > 1 ? 'élèves' : 'élève'], [calls, calls > 1 ? 'appels cette semaine' : 'appel cette semaine'], [pend, pend > 1 ? 'demandes à confirmer' : 'demande à confirmer', pend ? 'ask' : ''], [late, late > 1 ? 'missions en retard' : 'mission en retard', late ? 'late' : '']];
    box.innerHTML = `${o.head || ''}
      ${o.compact ? '' : `<div class="mh-facts">${facts.map(([n, l, c]) => `<span class="${c ? 'is-' + c : ''}"><b>${n}</b>${l}</span>`).join('')}</div>`}
      ${list.length ? `<div class="mh-grid">${list.map(card).join('')}</div>`
        : '<div class="mh-empty"><b>Aucun élève pour le moment</b>Ils apparaissent ici dès qu’ils s’inscrivent avec ton code de référent (Espace éducateur).</div>'}`;
    if (!box.dataset.mhWired) {
      box.dataset.mhWired = '1';
      box.addEventListener('click', (e) => { const b = e.target.closest('[data-mh-open]'); if (b) open(b.dataset.mhOpen); });
    }
    return list;
  }

  window.CHESTMentorHub = { render };
})();
