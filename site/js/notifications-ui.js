// CHEST · Cloche de notifications + badge sidebar "Journal" (2026-09-29) — app.html uniquement
// (seule page qui porte la vraie sidebar/topbar du shell, voir js/shell.js). Lit
// window.CHESTNotifications (js/notifications-store.js, stockage local). Clic sur une notification
// = marque lue + navigue vers le journal concerné (data.journalAccountId).
(() => {
  'use strict';

  function timeAgoFr(iso) {
    const d = new Date(iso);
    const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
    if (diffMin < 1) return "à l'instant";
    if (diffMin < 60) return `il y a ${diffMin} min`;
    const diffH = Math.round(diffMin / 60);
    if (diffH < 24) return `il y a ${diffH} h`;
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }

  function refreshBadges() {
    if (!window.CHESTNotifications) return;
    const bellBadge = document.getElementById('notifBellBadge');
    const count = CHESTNotifications.unreadCount();
    if (bellBadge) {
      bellBadge.hidden = count === 0;
      bellBadge.textContent = count > 9 ? '9+' : String(count);
    }
    const navBadge = document.getElementById('navJournalBadge');
    if (navBadge) {
      const journalCount = CHESTNotifications.list().filter((n) => !n.read && n.data && n.data.journalAccountId).length;
      navBadge.hidden = journalCount === 0;
      navBadge.textContent = journalCount > 9 ? '9+' : String(journalCount);
    }
  }

  function renderList() {
    const list = document.getElementById('notifList');
    if (!list || !window.CHESTNotifications) return;
    const items = CHESTNotifications.list();
    list.innerHTML = items.length ? items.slice(0, 30).map((n) => `
      <button type="button" class="chest-notif__row ${n.read ? '' : 'is-unread'}" data-notif-id="${n.id}" data-journal-id="${(n.data && n.data.journalAccountId) || ''}">
        <b>${n.title}</b>
        <span>${n.body}</span>
        <time>${timeAgoFr(n.createdAt)}</time>
      </button>`).join('') : '<div class="chest-notif__empty">Aucune notification pour l\'instant.</div>';
    list.querySelectorAll('[data-notif-id]').forEach((row) => {
      row.addEventListener('click', () => {
        CHESTNotifications.markRead(row.dataset.notifId);
        refreshBadges();
        renderList();
        if (row.dataset.journalId) {
          window.location.hash = `#/journal?acc=${encodeURIComponent(row.dataset.journalId)}`;
          document.getElementById('notifPanel').hidden = true;
        }
      });
    });
  }

  function init() {
    const btn = document.getElementById('notifBellBtn');
    const panel = document.getElementById('notifPanel');
    if (!btn || !panel) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.hidden = !panel.hidden;
      if (!panel.hidden) renderList();
    });
    document.addEventListener('click', (e) => {
      if (!panel.hidden && !panel.contains(e.target) && e.target !== btn) panel.hidden = true;
    });
    panel.addEventListener('click', (e) => e.stopPropagation());
    const markAllBtn = document.getElementById('notifMarkAllRead');
    if (markAllBtn) markAllBtn.addEventListener('click', () => { CHESTNotifications.markAllRead(); refreshBadges(); renderList(); });
    refreshBadges();
    // Rafraîchit périodiquement (une notification peut apparaître pendant que l'app reste ouverte,
    // ex. une connexion Live faite dans un autre onglet) - léger, purement local (pas de réseau).
    setInterval(refreshBadges, 15000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.CHESTNotificationsUI = { refreshBadges, renderList };
})();
