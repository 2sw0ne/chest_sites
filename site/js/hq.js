/* Case HQ (admin) : mini aurore pixelisee aux couleurs CHEST (rose var(--a1, #fc1283) -> orange var(--a2, #f9a45e) sur
   noir), rideaux qui ondulent comme sur la page Welcome. Clic : ouvre CHEST HQ (data-url).
   Canvas tres basse resolution agrandi en pixels nets (image-rendering:pixelated), cadence
   volontairement saccadee (~8 img/s, cote jeu video). Ne dessine que si la case est visible ;
   une seule image si mouvement reduit. */
(function () {
  const btn = document.getElementById('chestHq');
  if (!btn) return;
  const cv = btn.querySelector('.chest-hq__sky');
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const img = ctx.createImageData(W, H);
  const ss = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  // memes teintes que le shader de welcome.js
  const ramp = (b, stops) => { let c = stops[0]; for (let i = 1; i < stops.length; i++) c = mix(c, stops[i][1], ss(stops[i][0][0], stops[i][0][1], b)); return c; };
  // vraies couleurs CHEST : noir var(--bg-0, #050505), rose var(--a1, #fc1283) -> orange var(--a2, #f9a45e) (degrade de marque)
  const C = (r, g, b) => [r / 255, g / 255, b / 255];
  const PINK = [C(5, 5, 5), [[.04, .3], C(58, 4, 30)], [[.28, .62], C(168, 10, 86)], [[.55, .9], C(252, 18, 131)], [[.95, 1.3], C(255, 128, 184)]];
  const ORNG = [C(5, 5, 5), [[.04, .3], C(64, 22, 10)], [[.28, .62], C(186, 82, 40)], [[.55, .9], C(249, 164, 94)], [[.95, 1.3], C(255, 214, 170)]];

  function draw(t) {
    let i = 0;
    for (let y = 0; y < H; y++) {
      const v = y / (H - 1);
      for (let x = 0; x < W; x++) {
        const u = x / (W - 1);
        const wav = Math.sin(u * 3.1 + t * .35) * 1.2 + Math.sin(u * 7.3 - t * .5) * .5;
        const rib = .55 + .45 * Math.sin(u * 9 + wav + t * .25);
        const top = .32 + .12 * Math.sin(u * 4 + t * .4);
        const curtain = Math.exp(-((v - top) * (v - top)) / .09) + .35 * Math.exp(-((v - .75) * (v - .75)) / .05) * (.5 + .5 * Math.sin(u * 5 - t * .6));
        let b = curtain * (.35 + .65 * rib) * 1.35 + .1;
        b = Math.round(b * 7) / 7;                       // postérisation : paliers nets
        const h = u + .14 * Math.sin(t * .18);           // le coucher de soleil glisse doucement
        const c = mix(ramp(b, PINK), ramp(b, ORNG), ss(.25, .9, h));
        const k = .3 + .7 * ss(0, .16, b);
        img.data[i++] = c[0] * k * 255; img.data[i++] = c[1] * k * 255; img.data[i++] = c[2] * k * 255; img.data[i++] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let t = 0;
  draw(t);
  if (!still) {
    setInterval(() => {
      if (btn.hidden || document.hidden) return;
      t += 0.12;
      draw(t);
    }, 125);
  }

  // Ouverture (2026-10-25, retour : « à chaque fois que j'ouvre HQ il ne trouve pas mon Claude ») : la page en ligne
  // (chest-hq.vercel.app) ne peut pas joindre le QG du PC, le navigateur bloque une page internet qui parle à
  // l'ordinateur (127.0.0.1) ; elle tombait en démo, « Claude introuvable ». On ouvre donc le QG LOCAL par le lien
  // chesthq://ouvrir (installé par « Installer le lien CHEST HQ ») : il lance le QG si besoin et ouvre sa page sur
  // le PC. Si rien ne se passe (lien pas installé sur cet appareil), une bulle propose la marche à suivre.
  let hintTimer = null;
  function hint() {
    let el = document.getElementById('chestHqHint');
    if (!el) {
      el = document.createElement('div');
      el.id = 'chestHqHint';
      el.className = 'chest-hq-hint';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    const online = btn.dataset.url;
    el.innerHTML = '<b>Le QG ne s’est pas ouvert ?</b><span>Sur ce PC, lance une fois « Installer le lien CHEST HQ » (dossier chest-hq), puis réessaie.</span>'
      + (online ? `<a href="${online}" target="_blank" rel="noopener">Ouvrir la version en ligne</a>` : '');
    const r = btn.getBoundingClientRect();
    el.style.top = (r.bottom + 10) + 'px';
    el.style.right = Math.max(12, window.innerWidth - r.right) + 'px';
    el.hidden = false;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { el.hidden = true; }, 9000);
  }
  btn.addEventListener('click', () => {
    let left = false;
    const onLeave = () => { left = true; };
    window.addEventListener('blur', onLeave, { once: true });
    document.addEventListener('visibilitychange', onLeave, { once: true });
    window.location.href = 'chesthq://ouvrir';
    setTimeout(() => { if (!left && document.hasFocus()) hint(); }, 2500);
  });
  document.addEventListener('click', (e) => {
    const el = document.getElementById('chestHqHint');
    if (el && !el.hidden && !el.contains(e.target) && !btn.contains(e.target)) el.hidden = true;
  });
})();
