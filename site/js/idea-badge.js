// Pastille « +N » sur School dans la barre latérale (et la barre du bas sur téléphone) : nombre d'IDEA publiées depuis
// la dernière visite de School sur cet appareil (chest_idea_seen, écrit par js/school-hub.js). Relue à l'ouverture,
// toutes les 5 minutes et dès que School marque les IDEA comme vues.
(function () {
  const A = window.CHESTAccounts;
  if (!A) return;
  let busy = false;
  function paint(n) {
    document.querySelectorAll('[data-page="school"]').forEach((a) => {
      let b = a.querySelector('.idea-badge');
      if (!n) { if (b) b.remove(); return; }
      if (!b) { b = document.createElement('em'); b.className = 'idea-badge'; a.appendChild(b); }
      b.textContent = '+' + (n > 99 ? '99' : n);
      b.setAttribute('aria-label', n + ' nouvelle' + (n > 1 ? 's' : '') + ' IDEA');
    });
  }
  async function check() {
    if (busy || !A.getToken || !A.getToken()) return;
    busy = true;
    try {
      let seen = '';
      try { seen = localStorage.getItem('chest_idea_seen') || ''; } catch (e) {}
      if (!seen) seen = new Date(Date.now() - 3 * 86400000).toISOString();
      const r = await fetch(A.apiBase() + '/school/posts/unread?since=' + encodeURIComponent(seen), { headers: { Authorization: 'Bearer ' + A.getToken() } });
      if (r.ok) paint((await r.json()).n || 0);
    } catch (e) { /* hors ligne : on garde l'état */ } finally { busy = false; }
  }
  window.addEventListener('storage', (e) => { if (e.key === 'chest_idea_seen') paint(0); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  setInterval(check, 5 * 60 * 1000);
  setTimeout(check, 1500);
  window.CHESTIdeaBadge = { check };
})();
