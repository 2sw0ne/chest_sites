/* Case HQ (admin) : aurore boreale orange/jaune en basse resolution, agrandie en pixels nets
   par CSS (image-rendering:pixelated). Cadence volontairement saccadee (~8 img/s) pour le cote
   jeu video. Ne dessine que si la case est visible ; une seule image si mouvement reduit. */
(function () {
  const btn = document.getElementById('chestHq');
  if (!btn) return;
  const cv = btn.querySelector('.chest-hq__sky');
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const img = ctx.createImageData(W, H);
  // Palette postérisée : nuit -> braise -> orange -> ambre -> jaune
  const PAL = [[20, 7, 2], [64, 16, 3], [138, 38, 4], [228, 92, 8], [255, 150, 30], [255, 205, 70], [255, 236, 140]];

  function draw(t) {
    let i = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const c = 4 + 2.2 * Math.sin(x * 0.28 + t * 0.55) + 0.8 * Math.sin(x * 0.7 - t * 0.9);
        const band = Math.exp(-((y - c) * (y - c)) / 4.2);
        const ripple = 0.55 + 0.45 * Math.sin(x * 0.52 + t * 1.1 + Math.sin(y * 0.9 + t * 0.7) * 1.5);
        const v = Math.min(0.999, band * ripple * 1.15 + 0.06);
        const p = PAL[Math.floor(v * PAL.length)];
        img.data[i++] = p[0]; img.data[i++] = p[1]; img.data[i++] = p[2]; img.data[i++] = 255;
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
