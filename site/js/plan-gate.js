/* CHEST — verrou d'offre (2026-10-18). Pose une fenêtre en verre par-dessus une zone de page quand
   l'offre du membre ne l'inclut pas (BERICH, School complet → CHEST Premium). Le contenu reste visible
   flouté derrière, inaccessible au clavier (inert). Le vrai contrôle est côté serveur (accounts-bridge :
   /school renvoie une liste vide sans Premium) ; ici on explique et on mène vers les offres.
   API : CHESTPlan.lock(zone, { title, text, cta }) -> élément ; CHESTPlan.unlock(zone). */
(function () {
  const CSS = `
  .pg-zone{ position:relative; }
  .pg-zone > .pg-blur{ filter:blur(6px) saturate(.8); opacity:.45; pointer-events:none; user-select:none; }
  .pg-lock{ position:absolute; inset:0; z-index:30; display:flex; align-items:flex-start; justify-content:center; padding:min(14vh,140px) 16px 40px; }
  .pg-card{ position:sticky; top:90px; width:min(460px,100%); text-align:center; padding:34px 30px 30px; border-radius:22px; color:#f6f6f7;
    border:1px solid rgba(255,255,255,.14); background:linear-gradient(165deg, rgba(26,14,22,.86), rgba(9,9,11,.92));
    -webkit-backdrop-filter:blur(30px); backdrop-filter:blur(30px);
    box-shadow:inset 0 1.5px 0 rgba(255,255,255,.08), 0 40px 90px -40px rgba(0,0,0,.95), 0 0 0 1px rgba(252,18,131,.06); }
  .pg-ic{ width:66px; height:66px; margin:0 auto 16px; border-radius:20px; display:flex; align-items:center; justify-content:center; color:#fff;
    background:linear-gradient(135deg,#ffb36b,#ff3d1f); box-shadow:0 16px 44px rgba(255,92,40,.45), inset 0 1px 0 rgba(255,255,255,.35); }
  .pg-ic svg{ width:22px; height:22px; }
  .pg-k{ font-family:'JetBrains Mono', ui-monospace, monospace; font-size:10px; letter-spacing:.24em; text-transform:uppercase; color:#ffb36b; }
  .pg-card h2{ margin:10px 0 8px; font-size:24px; line-height:1.18; font-weight:700; letter-spacing:-.035em; }
  .pg-card p{ margin:0 auto 22px; max-width:360px; font-size:13.5px; line-height:1.65; color:#9b9ba1; }
  .pg-pts{ list-style:none; display:flex; flex-direction:column; gap:6px; margin:0 0 20px; padding:0; text-align:left; }
  .pg-pts li{ display:flex; align-items:center; gap:10px; padding:9px 12px; border-radius:10px; background:rgba(255,255,255,.035); font-size:12.5px; font-weight:600; }
  .pg-pts li::before{ content:''; width:10px; height:6px; margin-top:-3px; border-left:2px solid #33e6a6; border-bottom:2px solid #33e6a6; transform:rotate(-45deg); flex:0 0 auto; }
  .pg-foot{ display:block; margin-top:12px; font-size:11.5px; color:#7a7a82; }
  .pg-cta{ display:flex; justify-content:center; align-items:center; gap:8px; width:100%; box-sizing:border-box; min-height:46px; padding:12px 26px; border-radius:999px; text-decoration:none; font-weight:700; font-size:13.5px;
    color:#fff; background:linear-gradient(135deg,#ffb36b,#ff3d1f); box-shadow:0 12px 34px rgba(255,92,40,.35); transition:transform .2s cubic-bezier(.16,1,.3,1); }
  .pg-cta:hover{ transform:translateY(-1px); }
  .pg-cta:active{ transform:scale(.97); }
  .pg-cta:focus-visible{ outline:2px solid #f9a45e; outline-offset:3px; }
  html[data-theme="light"] .pg-ic, html[data-theme="light"] .pg-cta{ filter:invert(1) hue-rotate(180deg); }`;
  const LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>';
  let styled = false;
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // « Ton offre actuelle : Essentiel III · jusqu'au 9 août 2027 » (maquette T-Verrou.html)
  function current() {
    const u = window.CHESTAccounts && CHESTAccounts.getUser && CHESTAccounts.getUser();
    const a = u && u.access;
    if (!a || !a.label) return '';
    const end = a.endsAt ? new Date(a.endsAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    return `<span class="pg-foot">Ton offre actuelle : ${esc(a.label)}${end ? ' · jusqu’au ' + esc(end) : ''}</span>`;
  }
  function lock(zone, opts) {
    if (!zone) return null;
    if (!styled) { const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); styled = true; }
    unlock(zone);
    zone.classList.add('pg-zone');
    [...zone.children].forEach((ch) => { ch.classList.add('pg-blur'); ch.setAttribute('inert', ''); ch.setAttribute('aria-hidden', 'true'); });
    const el = document.createElement('div');
    el.className = 'pg-lock';
    el.innerHTML = `<div class="pg-card" role="dialog" aria-labelledby="pgTitle">
      <div class="pg-ic">${LOCK}</div>
      <span class="pg-k">${esc(opts.kicker || 'CHEST Premium')}</span>
      <h2 id="pgTitle">${esc(opts.title)}</h2>
      <p>${esc(opts.text)}</p>
      ${(opts.points || []).length ? `<ul class="pg-pts">${opts.points.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      <a class="pg-cta" href="/offres" target="_top">${esc(opts.cta || 'Voir les offres')}</a>
      ${current()}
    </div>`;
    zone.appendChild(el);
    return el;
  }
  function unlock(zone) {
    if (!zone) return;
    zone.querySelectorAll(':scope > .pg-lock').forEach((n) => n.remove());
    [...zone.children].forEach((ch) => { if (ch.classList.contains('pg-blur')) { ch.classList.remove('pg-blur'); ch.removeAttribute('inert'); ch.removeAttribute('aria-hidden'); } });
    zone.classList.remove('pg-zone');
  }
  function allowed(feature) {
    const A = window.CHESTAccounts;
    return !A || !A.hasFeature || A.hasFeature(feature);
  }
  window.CHESTPlan = { lock, unlock, allowed };
})();
