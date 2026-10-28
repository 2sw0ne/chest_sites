// CHEST — School × suivi (2026-10-28).
// Éducateur : l'accueil de School devient « Tes élèves » (js/mentor-hub.js) ; l'ancien accueil (titre, nouveautés,
// étagères) disparaît, le contenu de School reste accessible en ligne secondaire (les deux portes).
// Membre rattaché à un éducateur : bandeau « Ton espace avec … » en tête, vers suivi.html.
(() => {
  'use strict';
  const A = window.CHESTAccounts;
  const box = document.getElementById('scMentor');
  const hub = document.getElementById('scEdu');
  if (!A || !box) return;
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initials = (n) => String(n || '?').split(/\s+/).map((w) => w[0] || '').join('').slice(0, 2).toUpperCase();
  const get = (p) => fetch(A.apiBase() + p, { headers: { Authorization: 'Bearer ' + A.getToken() } }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const when = (iso) => {
    const d = new Date(iso), days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
    const t = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return (days === 0 ? "aujourd'hui" : days === 1 ? 'demain' : d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })) + ' à ' + t;
  };
  const goSuivi = () => {
    const sh = window.parent && window.parent !== window && window.parent.CHESTShell;
    if (sh && sh.go) sh.go('suivi', ''); else location.href = 'suivi.html';
  };

  (async () => {
    const u = A.getUser() || {};
    // Admin (2026-10-28) : chaque éducateur et le planning commun (js/school-admin.js).
    if (u.isAdmin && hub && window.CHESTSchoolAdmin) {
      document.getElementById('scHome').classList.add('is-edu');
      hub.hidden = false;
      await CHESTSchoolAdmin.render(hub);
      return;
    }
    if (u.role === 'educator' && hub && window.CHESTMentorHub) {
      document.getElementById('scHome').classList.add('is-edu');
      hub.hidden = false;
      await CHESTMentorHub.render(hub, { head: `<header class="mh-head"><div><div class="chest-step">School · Éducateur</div><h1>Tes élèves</h1>
        <p>Leurs appels, leurs missions et leurs notes. Ouvre un élève pour préparer votre prochain appel.</p></div></header>` });
      return;
    }
    const d = await get('/mentor');
    if (!d || !d.educator) return;
    const now = Date.now();
    const next = d.events.filter((e) => (e.status === 'proposed' || e.status === 'confirmed') && Date.parse(e.startsAt) + e.minutes * 60000 >= now)
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0];
    const ask = d.events.filter((e) => e.status === 'proposed' && e.authorId !== d.me.id && Date.parse(e.startsAt) >= now).length;
    const todo = (d.tasks || []).filter((t) => !t.doneAt).length;
    box.innerHTML = `<span class="sc-mentor__pair"><span class="sc-mentor__av">${esc(initials(d.member.name))}</span><i></i><span class="sc-mentor__av sc-mentor__av--edu">${esc(initials(d.educator.name))}</span></span>
      <span class="sc-mentor__main"><span class="chest-step">Ton espace</span><b>Avec ${esc(d.educator.first)}</b>
      <span>${ask ? `${esc(d.educator.first)} te propose un appel : à confirmer` : next ? `Prochain appel ${esc(when(next.startsAt))}${next.status === 'confirmed' ? '' : ' (à confirmer)'}` : 'Tes appels, tes missions et tes notes'}${todo ? ` · ${todo} mission${todo > 1 ? 's' : ''} à faire` : ''}</span></span>
      <span class="sc-mentor__go">Ouvrir <i>→</i></span>`;
    box.hidden = false;
    box.addEventListener('click', (e) => { e.preventDefault(); goSuivi(); });
  })();
})();
