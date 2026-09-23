(() => {
  'use strict';

  const COLLAPSE_KEY = 'chest_nav_collapsed';

  // Bloc "Compte actif" en pied de sidebar - identite du COMPTE CHEST
  // connecte (celui qui a servi a se logger), pas le compte de trading
  // actif sur le Dashboard : cet element vit sur toutes les pages, pas
  // seulement celle-la, donc il montre ce qui a un sens partout.
  // Exposee (window.CHESTNav.refreshAccount) car sur app.html la connexion se
  // fait maintenant SANS rechargement de page (formulaire integre a
  // #authOverlay) : le DOMContentLoaded ci-dessous tourne AVANT la connexion
  // reelle (CHESTAccounts.getUser() renvoie encore rien) et ne se redeclenche
  // jamais tout seul - app.html doit rappeler cette fonction juste apres un
  // login reussi, sinon le bloc reste vide ("—") malgre une session valide.
  function refreshAccount() {
    if (!window.CHESTAccounts) return;
    const user = CHESTAccounts.getUser();
    const nameEl = document.getElementById('sidebarUserName');
    const emailEl = document.getElementById('sidebarUserEmail');
    const avatarEl = document.getElementById('sidebarUserAvatar');
    if (user && nameEl) {
      const first = user.firstName || '', last = user.lastName || '';
      nameEl.textContent = (first + ' ' + last).trim() || user.email || 'Compte';
      if (emailEl) emailEl.textContent = user.email || '';
      if (avatarEl) avatarEl.textContent = ((first[0] || '') + (last[0] || '')).toUpperCase() || '?';
    }
  }
  // Meme raison/meme piege que refreshAccount ci-dessus : sur app.html, verifie une seule fois
  // au DOMContentLoaded (avant la connexion), donc le bouton "Membres (admin)" de la topbar
  // restait cache pour toujours apres une connexion admin reussie sans rechargement de page.
  function refreshAdminVisibility() {
    if (window.CHESTAccounts && CHESTAccounts.isAdmin()) {
      document.querySelectorAll('[data-admin-only]').forEach((el) => { el.hidden = false; });
    }
  }
  window.CHESTNav = { refreshAccount, refreshAdminVisibility };

  document.addEventListener('DOMContentLoaded', () => {
    const page = document.body.dataset.page;
    if (page) {
      document.querySelectorAll('.chest-nav__item[data-page], .chest-topbar__btn[data-page]').forEach((a) => {
        if (a.dataset.page === page) a.classList.add('is-active');
      });
    }

    refreshAdminVisibility();

    refreshAccount();

    // ---------- Sidebar rétractable (remplace l'ancien tiroir/rail) ----------
    // Repliée/dépliée persistée par appareil (localStorage) - un choix qui
    // doit rester d'une page à l'autre, pas juste pour la session en cours.
    const shell = document.querySelector('.chest-shell');
    if (shell) {
      let collapsed = false;
      try { collapsed = localStorage.getItem(COLLAPSE_KEY) === '1'; } catch (e) { /* tant pis */ }
      shell.classList.toggle('is-collapsed', collapsed);

      const toggle = document.getElementById('sidebarToggle');
      if (toggle) {
        toggle.addEventListener('click', () => {
          const next = !shell.classList.contains('is-collapsed');
          shell.classList.toggle('is-collapsed', next);
          try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0'); } catch (e) { /* tant pis */ }
        });
      }

      // Sous 760px, la sidebar quitte la grille et devient un tiroir plein-hauteur
      // (voir chest-da.css) - piloté par .is-mobile-open, independant de .is-collapsed.
      const menuBtn = document.getElementById('topbarMenuBtn');
      const overlay = document.getElementById('sidebarOverlay');
      function closeMobile() { shell.classList.remove('is-mobile-open'); }
      if (menuBtn) menuBtn.addEventListener('click', () => shell.classList.toggle('is-mobile-open'));
      if (overlay) overlay.addEventListener('click', closeMobile);
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMobile(); });
      document.querySelectorAll('.chest-nav__item').forEach((a) => a.addEventListener('click', closeMobile));
    }

    // Theme toggle button(s) — there may be one in the topbar.
    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
      const setIcon = () => { btn.textContent = CHESTTheme.current() === 'light' ? '🌙' : '☀️'; };
      setIcon();
      btn.addEventListener('click', () => { CHESTTheme.toggle(); setIcon(); });
    });

    // Logout button(s) — deconnexion du vrai compte (CHESTAccounts), plus
    // l'ancien code d'accès partage (CHESTAuth) si jamais encore actif sur
    // cette page, pour ne rien laisser d'entrouvert.
    document.querySelectorAll('[data-logout]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (window.CHESTAccounts) CHESTAccounts.logout();
        if (window.CHESTAuth) CHESTAuth.lock();
        window.location.href = 'login.html';
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
