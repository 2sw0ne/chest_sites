(() => {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    // Highlight the active sidebar link based on data-page on <body>.
    const page = document.body.dataset.page;
    if (page) {
      document.querySelectorAll('.sidebar__nav a[data-page]').forEach((a) => {
        if (a.dataset.page === page) a.classList.add('is-active');
      });
    }

    // Sidebar open/close.
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const openBtn = document.getElementById('sidebarOpen');
    const closeBtn = document.getElementById('sidebarClose');

    function openSidebar() { sidebar.classList.add('is-open'); overlay.classList.add('is-open'); }
    function closeSidebar() { sidebar.classList.remove('is-open'); overlay.classList.remove('is-open'); }

    if (openBtn) openBtn.addEventListener('click', openSidebar);
    if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
    if (overlay) overlay.addEventListener('click', closeSidebar);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSidebar(); });
    document.querySelectorAll('.sidebar__nav a').forEach((a) => a.addEventListener('click', closeSidebar));

    // Theme toggle button(s) — there may be one in the topbar.
    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
      const setIcon = () => { btn.textContent = STASHTheme.current() === 'light' ? '🌙' : '☀️'; };
      setIcon();
      btn.addEventListener('click', () => { STASHTheme.toggle(); setIcon(); });
    });

    // Lock / logout button(s).
    document.querySelectorAll('[data-logout]').forEach((btn) => {
      btn.addEventListener('click', () => {
        STASHAuth.lock();
        window.location.href = 'index.html';
      });
    });
  });

  window.showToast = function showToast(message) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = message;
    requestAnimationFrame(() => el.classList.add('is-visible'));
    clearTimeout(window.__toastT);
    window.__toastT = setTimeout(() => el.classList.remove('is-visible'), 2600);
  };
})();
