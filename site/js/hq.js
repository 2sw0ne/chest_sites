/* Case HQ (admin) : mini reproduction pixelisee de l'aurore de la page Welcome (js/welcome.js) :
   violet a gauche -> rose de la marque au centre -> orange/or a droite, rideaux qui ondulent.
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
  const ROSE = [[.15, .012, .085], [[.03, .28], [.37, .05, .225]], [[.3, .66], [.56, .09, .37]], [[.58, .92], [.75, .33, .55]], [[.84, 1.16], [.83, .53, .68]]];
  const VIO = [[.2, .04, .36], [[.04, .5], [.52, .16, .82]], [[.55, 1.1], [.84, .66, .99]]];
  const GOLD = [[.44, .2, .04], [[.06, .5], [.98, .68, .16]], [[.4, 1], [1, .9, .45]]];

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
        b = Math.round(b * 6) / 6;                       // postérisation : paliers nets
        const h = u + .14 * Math.sin(t * .18);           // le coucher de soleil glisse doucement
        let c = ramp(b, ROSE);
        c = mix(c, ramp(b, GOLD), ss(.5, .95, h) * ss(.02, .22, b) * .92);
        c = mix(c, ramp(b, VIO), (1 - ss(.06, .42, h)) * ss(.02, .22, b) * .92);
        const k = .25 + .75 * ss(0, .16, b);
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

  btn.addEventListener('click', () => {
    const url = btn.dataset.url;
    if (url) window.open(url, '_blank', 'noopener');
  });
})();
