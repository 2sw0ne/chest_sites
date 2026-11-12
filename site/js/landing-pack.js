// Landing · « Fais ton audit » (2026-11-12, v3) : les deux cartes de prix sont remplacées par une carte pack façon
// OMNI (js/pack-card.js, mode teaser : prix et avantages floutés, éventail au survol). Clic → code du référent
// (GET /ref/<code>) → QR code vers /audit/<CODE> : la personne répond depuis son téléphone (ou continue ici).
(function () {
  const sec = document.getElementById('offres');
  const duo = sec && sec.querySelector('.duo');
  if (!duo || !window.CHESTPack) return;
  const API = (window.CHEST_CONFIG && window.CHEST_CONFIG.accountsApiUrl) || 'https://accounts-bridge-production.up.railway.app';
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let CODE = '';

  const host = document.createElement('div');
  host.className = 'lp-pack';
  duo.replaceWith(host);
  const lead = sec.querySelector('.lead');
  if (lead) lead.textContent = 'Réservé aux invités. Fais ton audit avec le code de ton référent : il débloque les prix et te montre le pack qui te correspond.';
  const fine = sec.querySelector('.o-fine');
  if (fine) fine.textContent = 'Essentiel et Premium, sur 1, 3, 6 ou 12 mois. Abonnements renouvelés automatiquement, résiliables à tout moment. Le trading comporte un risque de perte en capital ; CHEST n’est pas un conseiller en investissement et ne garantit aucun gain.';
  CHESTPack.mount(host, { mode: 'teaser', cta: { label: 'Faire mon audit', onClick: (e) => { if (e) e.preventDefault(); open(); } } });
  document.addEventListener('click', (e) => { const b = e.target.closest('a[href="/inscription"]'); if (b && sec.contains(b)) { e.preventDefault(); open(); } });

  const css = `
.lp-pack{ margin-top:24px; }
.lp{ position:fixed; inset:0; z-index:9000; display:grid; place-items:center; padding:16px; background:rgba(0,0,0,.72); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); }
.lp[hidden]{ display:none; }
.lp__win{ position:relative; width:min(460px,100%); max-height:calc(100dvh - 32px); overflow:auto; padding:32px 28px 26px; border-radius:26px; text-align:center; color:#f6f6f7; font-family:'Instrument Sans', system-ui, sans-serif;
  background:radial-gradient(110% 55% at 50% 0%, rgba(252,18,131,.16), rgba(249,164,94,.05) 45%, transparent 70%), #0c0c0f; box-shadow:inset 0 0 0 1px rgba(255,255,255,.12), 0 40px 120px rgba(0,0,0,.6); animation:lpIn .26s cubic-bezier(.16,1,.3,1); }
@keyframes lpIn{ from{ opacity:0; transform:translateY(12px) scale(.98); } }
.lp__x{ position:absolute; top:14px; right:14px; width:34px; height:34px; border:0; border-radius:10px; background:rgba(255,255,255,.06); color:#9b9ba1; font-size:18px; cursor:pointer; }
.lp__k{ font-family:'Fragment Mono', ui-monospace, monospace; font-size:10px; letter-spacing:.24em; text-transform:uppercase; color:#f9a45e; }
.lp h3{ margin:10px 0 6px; font-size:28px; letter-spacing:-.035em; line-height:1.1; }
.lp p{ margin:0 auto; max-width:36ch; color:#9b9ba1; font-size:14px; line-height:1.55; }
.lp__code{ display:grid; gap:10px; margin-top:22px; }
.lp__code input{ height:58px; padding:0 16px; border:0; border-radius:16px; font:inherit; font-size:22px; font-weight:700; letter-spacing:.22em; text-align:center; text-transform:uppercase; color:#f6f6f7; background:rgba(255,255,255,.04); box-shadow:inset 0 0 0 1px rgba(255,255,255,.14); outline:none; }
.lp__code input:focus{ box-shadow:inset 0 0 0 1.5px rgba(252,18,131,.8), 0 0 0 4px rgba(252,18,131,.16); }
.lp__go{ display:flex; align-items:center; justify-content:center; height:54px; border:0; border-radius:16px; font:inherit; font-size:15px; font-weight:700; color:#fff; text-decoration:none; background:linear-gradient(90deg,#fc1283,#f9a45e); box-shadow:0 12px 30px rgba(252,18,131,.3); cursor:pointer; transition:transform .16s ease-out; }
.lp__go:active{ transform:scale(.98); }
.lp__go:disabled{ opacity:.5; }
.lp__err{ min-height:18px; margin-top:8px !important; font-size:13px !important; color:#ff94a0 !important; }
.lp__qr{ width:236px; height:236px; margin:22px auto 0; padding:3px; border-radius:28px; background:linear-gradient(135deg,#fc1283,#f9a45e); box-shadow:0 18px 50px rgba(252,18,131,.28); animation:lpQr .6s cubic-bezier(.16,1,.3,1) both .08s; }
@keyframes lpQr{ from{ opacity:0; transform:scale(.92) rotate(-3deg); } }
.lp__qr > div{ width:100%; height:100%; display:grid; place-items:center; border-radius:25px; background:#fff; }
.lp__qr img{ display:block; width:200px; height:200px; image-rendering:pixelated; }
.lp__url{ display:inline-block; margin-top:14px; padding:6px 12px; border-radius:999px; font-family:'Fragment Mono', ui-monospace, monospace; font-size:12px; color:#9b9ba1; background:rgba(255,255,255,.05); }
.lp__wait{ display:flex; align-items:center; justify-content:center; gap:8px; margin-top:16px; font-size:12.5px; color:#9b9ba1; }
.lp__wait i{ width:7px; height:7px; border-radius:50%; background:#33e6a6; animation:lpPing 1.6s ease-out infinite; }
@keyframes lpPing{ 0%{ box-shadow:0 0 0 0 rgba(51,230,166,.5); } 100%{ box-shadow:0 0 0 10px rgba(51,230,166,0); } }
.lp__here{ display:inline-block; margin-top:18px; font-size:13.5px; color:#f6f6f7; text-decoration:underline; text-underline-offset:3px; text-decoration-color:rgba(255,255,255,.3); }
@media (prefers-reduced-motion: reduce){ .lp__win, .lp__qr{ animation:none; } }`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const box = document.createElement('div'); box.className = 'lp'; box.hidden = true;
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Faire mon audit CHEST');
  document.body.appendChild(box);
  box.addEventListener('click', (e) => { if (e.target === box || e.target.closest('[data-lp-x]')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !box.hidden) close(); });
  function close() { box.hidden = true; document.documentElement.style.overflow = ''; }
  function show(html) { box.innerHTML = `<div class="lp__win"><button type="button" class="lp__x" data-lp-x aria-label="Fermer">×</button>${html}</div>`; box.hidden = false; document.documentElement.style.overflow = 'hidden'; }
  const loadQr = () => window.qrcode ? Promise.resolve() : new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });

  function open() {
    if (CODE) return qr();
    show(`<span class="lp__k">01 — Accès invité</span><h3>Le code de ton référent</h3>
      <p>CHEST est réservé aux personnes invitées. Entre le code que t’a donné ton référent pour débloquer ton audit et les prix.</p>
      <form class="lp__code" id="lpCode"><input type="text" name="c" maxlength="12" autocomplete="off" spellcheck="false" aria-label="Code du référent" placeholder="CODE"><button class="lp__go" type="submit">Débloquer mon audit</button></form>
      <p class="lp__err" id="lpErr" role="alert"></p>`);
    const f = document.getElementById('lpCode');
    f.c.focus();
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const c = f.c.value.trim().toUpperCase(), btn = f.querySelector('button');
      if (!c) return;
      btn.disabled = true;
      try {
        const r = await fetch(API + '/ref/' + encodeURIComponent(c));
        if (!r.ok) throw new Error(r.status === 429 ? 'Trop d’essais, réessaie dans quelques minutes.' : 'Ce code ne correspond à aucun référent.');
        CODE = c;
        qr();
      } catch (err) { document.getElementById('lpErr').textContent = err.message; btn.disabled = false; }
    });
  }
  async function qr() {
    const url = `${location.origin}/audit/${encodeURIComponent(CODE)}`;
    show(`<span class="lp__k">02 — Ton audit</span><h3>Scanne avec ton téléphone</h3>
      <p>L’audit s’ouvre directement sur ton téléphone : 7 questions, 2 minutes, puis ton pack et son prix.</p>
      <div class="lp__qr"><div id="lpQr"></div></div>
      <span class="lp__url">${esc(url.replace(/^https?:\/\//, ''))}</span>
      <div class="lp__wait"><i></i>Code ${esc(CODE)} validé</div>
      <a class="lp__here" href="${esc(url)}">Continuer sur cet appareil</a>`);
    try { await loadQr(); const q = window.qrcode(0, 'M'); q.addData(url); q.make(); document.getElementById('lpQr').innerHTML = q.createImgTag(6, 0); }
    catch (e) { document.getElementById('lpQr').innerHTML = '<small style="color:#5c5c63;padding:20px">QR indisponible : continue sur cet appareil.</small>'; }
  }
})();
