// Pastille « +N » sur School dans la barre latérale (et la barre du bas sur téléphone) : Idea publiées depuis la dernière
// visite de School sur cet appareil (chest_idea_seen) + nouveautés du planning (appels, missions) depuis chest_plan_seen,
// tous deux écrits par js/school-hub.js. Relue à l'ouverture, toutes les 2 minutes et dès que School marque tout comme vu.
// Notifications School (2026-11-08) : GET /school/notifs (qui a ajouté un appel, une mission, une Idea, un contenu ; rappel
// 15 min avant un appel) arrive dans la cloche du haut (js/notifications-store.js, type school_*, data.url = page à ouvrir).
(function () {
  const A = window.CHESTAccounts;
  if (!A) return;
  const DAY = 86400000;
  let busy = false;
  const get = (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
  const since3d = () => new Date(Date.now() - 3 * DAY).toISOString();
  function paint(n) {
    document.querySelectorAll('[data-page="school"]').forEach((a) => {
      let b = a.querySelector('.idea-badge');
      if (!n) { if (b) b.remove(); return; }
      if (!b) { b = document.createElement('em'); b.className = 'idea-badge'; a.appendChild(b); }
      b.textContent = '+' + (n > 99 ? '99' : n);
      b.setAttribute('aria-label', n + ' nouveauté' + (n > 1 ? 's' : '') + ' dans School');
    });
  }
  const hdr = () => ({ Authorization: 'Bearer ' + A.getToken() });
  // les notifications du serveur rejoignent la cloche (une seule fois chacune)
  function merge(list) {
    const N = window.CHESTNotifications;
    if (!N || !list.length) return;
    const have = new Set(N.list().map((x) => x.data && x.data.sid).filter(Boolean));
    list.slice().reverse().forEach((s) => {
      if (have.has(s.id)) return;
      const rec = N.add('school_' + s.kind, s.title, s.body, { sid: s.id, url: s.url });
      // la date est celle du serveur (sinon tout paraîtrait « à l'instant » après une absence)
      try {
        const all = N.list(); const i = all.findIndex((x) => x.id === rec.id);
        if (i >= 0) { all[i].createdAt = s.createdAt; localStorage.setItem('chest_notifications', JSON.stringify(all)); }
      } catch (e) { /* tant pis */ }
    });
    try { window.dispatchEvent(new StorageEvent('storage', { key: 'chest_notifications' })); } catch (e) { /* vieux navigateur */ }
  }
  async function check() {
    if (busy || !A.getToken || !A.getToken()) return;
    busy = true;
    try {
      const ideaSeen = get('chest_idea_seen') || since3d();
      const planSeen = get('chest_plan_seen') || since3d();
      const sync = get('chest_school_notif_sync') || since3d();
      const [r1, r2] = await Promise.all([
        fetch(A.apiBase() + '/school/posts/unread?since=' + encodeURIComponent(ideaSeen), { headers: hdr() }),
        fetch(A.apiBase() + '/school/notifs?since=' + encodeURIComponent(sync < planSeen ? sync : planSeen), { headers: hdr() }),
      ]);
      const ideas = r1.ok ? ((await r1.json()).n || 0) : 0;
      const notifs = r2.ok ? ((await r2.json()).notifs || []) : [];
      merge(notifs.filter((s) => s.createdAt > sync));
      if (notifs.length) { try { localStorage.setItem('chest_school_notif_sync', notifs[0].createdAt); } catch (e) {} }
      const plan = notifs.filter((s) => (s.kind === 'event' || s.kind === 'task') && s.createdAt > planSeen).length;
      paint(ideas + plan);
    } catch (e) { /* hors ligne : on garde l'état */ } finally { busy = false; }
  }
  window.addEventListener('storage', (e) => { if (e.key === 'chest_idea_seen' || e.key === 'chest_plan_seen') check(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  setInterval(check, 2 * 60 * 1000);
  setTimeout(check, 1500);
  window.CHESTIdeaBadge = { check };
})();
