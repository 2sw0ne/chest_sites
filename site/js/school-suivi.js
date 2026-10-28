// CHEST — Bandeau « Ton suivi » en tête de School (2026-10-28). Membre rattaché à un éducateur : son prochain
// rendez-vous et l'accès à son espace de suivi (suivi.html). Éducateur / admin : ses élèves et les demandes en attente.
(() => {
  'use strict';
  const A = window.CHESTAccounts;
  const box = document.getElementById('scMentor');
  if (!A || !box) return;
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initials = (n) => String(n || '?').split(/\s+/).map((w) => w[0] || '').join('').slice(0, 2).toUpperCase();
  const get = (p) => fetch(A.apiBase() + p, { headers: { Authorization: 'Bearer ' + A.getToken() } }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const when = (iso) => {
    const d = new Date(iso), days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
    const t = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return (days === 0 ? "aujourd'hui" : days === 1 ? 'demain' : d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })) + ' à ' + t;
  };
  function show(html) {
    box.innerHTML = html;
    box.hidden = false;
    box.addEventListener('click', (e) => {
      e.preventDefault();
      const sh = window.parent && window.parent !== window && window.parent.CHESTShell;
      if (sh && sh.go) sh.go('suivi', ''); else location.href = 'suivi.html';
    });
  }
  const arrow = '<span class="sc-mentor__go">Ouvrir <i>→</i></span>';

  (async () => {
    const u = A.getUser() || {};
    if (u.isAdmin || u.role === 'educator') {
      const d = await get('/mentor/students');
      if (!d || !d.students.length) return;
      const pend = d.students.reduce((n, s) => n + (s.pending || 0), 0);
      return show(`<span class="sc-mentor__pair"><span class="sc-mentor__av sc-mentor__av--edu">${esc(initials(u.firstName ? u.firstName + ' ' + (u.lastName || '') : 'É'))}</span></span>
        <span class="sc-mentor__main"><span class="chest-step">Suivi de tes élèves</span><b>${d.students.length} élève${d.students.length > 1 ? 's' : ''} rattaché${d.students.length > 1 ? 's' : ''}</b>
        <span>${pend ? `${pend} demande${pend > 1 ? 's' : ''} de rendez-vous à confirmer` : 'Planning, notes et bibliothèque de chacun'}</span></span>${arrow}`);
    }
    const d = await get('/mentor');
    if (!d || !d.educator) return;
    const now = Date.now();
    const next = d.events.filter((e) => (e.status === 'proposed' || e.status === 'confirmed') && Date.parse(e.startsAt) + e.minutes * 60000 >= now)
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0];
    const ask = d.events.filter((e) => e.status === 'proposed' && e.authorId !== d.me.id && Date.parse(e.startsAt) >= now).length;
    show(`<span class="sc-mentor__pair"><span class="sc-mentor__av">${esc(initials(d.member.name))}</span><i></i><span class="sc-mentor__av sc-mentor__av--edu">${esc(initials(d.educator.name))}</span></span>
      <span class="sc-mentor__main"><span class="chest-step">Ton suivi</span><b>Avec ${esc(d.educator.first)}</b>
      <span>${ask ? `${esc(d.educator.first)} te propose un rendez-vous : à confirmer` : next ? `Prochain rendez-vous ${esc(when(next.startsAt))}${next.status === 'confirmed' ? '' : ' (à confirmer)'}` : 'Rendez-vous, notes de séance et ressources partagées'}</span></span>${arrow}`);
  })();
})();
