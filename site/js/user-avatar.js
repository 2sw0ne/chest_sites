// Photo de profil dans le menu (2026-11-08) : #sidebarUserAvatar montre la photo du membre (users.avatar, servie par
// /school/files/<clé>) à la place des initiales ; suit le changement fait sur la page Compte (stockage / message).
(function () {
  const A = window.CHESTAccounts;
  if (!A) return;
  function paint() {
    const u = A.getUser && A.getUser();
    const el = document.getElementById('sidebarUserAvatar');
    if (!el) return;
    const url = u && u.avatar ? `${A.apiBase()}/school/files/${encodeURIComponent(u.avatar)}` : '';
    el.classList.toggle('has-photo', !!url);
    el.style.backgroundImage = url ? `url("${url}")` : '';
    if (!url && u && !el.textContent.trim()) el.textContent = ((u.firstName || '?')[0] + ((u.lastName || '')[0] || '')).toUpperCase();
  }
  window.addEventListener('storage', (e) => { if (e.key === 'chest_account_user') paint(); });
  window.addEventListener('message', (e) => { if (e.origin === location.origin && e.data && e.data.type === 'chest:user') paint(); });
  setTimeout(paint, 300); setTimeout(paint, 2000);
  window.CHESTUserAvatar = { paint };
})();
