/* ============================================================
   CHEST Runner (2026-11-10) — le jeu d'attente des longs calculs, sur le principe du dinosaure de Chrome :
   le coffre CHEST court sur l'axe du temps, saute les bougies (Espace, ↑, clic ou toucher), ↓ pour retomber
   plus vite ; la vitesse monte avec le score ; meilleur score gardé sur l'appareil.
   CHESTRunner.mount(conteneur, { label }) → { setLabel(txt), ready(txt, onOpen), destroy() }
   ready() : le calcul est fini → bouton « Voir le résultat » (on ne coupe jamais une partie en cours ;
   si personne ne joue, onOpen est appelé tout de suite).
   ============================================================ */
(() => {
  'use strict';
  const HI_KEY = 'chest_runner_hi';
  const css = `
.cr{ position:relative; display:flex; flex-direction:column; gap:12px; padding:18px; border-radius:18px; background:rgba(255,255,255,.025); box-shadow:inset 0 0 0 1px rgba(255,255,255,.08); user-select:none; -webkit-user-select:none; }
.cr canvas{ display:block; width:100%; height:190px; border-radius:12px; cursor:pointer; touch-action:manipulation; outline:none; }
.cr canvas:focus-visible{ box-shadow:0 0 0 2px rgba(252,18,131,.7); }
.cr__bar{ display:flex; align-items:center; justify-content:space-between; gap:12px; font-size:12.5px; color:#9b9ba1; }
.cr__lbl{ display:flex; align-items:center; gap:9px; }
.cr__dot{ width:7px; height:7px; border-radius:50%; background:#f9a45e; box-shadow:0 0 10px rgba(249,164,94,.7); animation:crPulse 1.2s ease-in-out infinite; }
.cr.is-ready .cr__dot{ background:#33e6a6; box-shadow:0 0 10px rgba(51,230,166,.7); animation:none; }
@keyframes crPulse{ 50%{ opacity:.35; } }
.cr__go{ height:34px; padding:0 14px; border:0; border-radius:10px; font:inherit; font-size:12.5px; font-weight:700; color:#fff; background:linear-gradient(90deg,#fc1283,#f9a45e); cursor:pointer; transition:transform .16s cubic-bezier(.16,1,.3,1); }
.cr__go:active{ transform:scale(.97); }
.cr__go[hidden]{ display:none; }
.cr__keys{ font-size:11px; color:#5c5c63; }
@media (prefers-reduced-motion: reduce){ .cr__dot{ animation:none; } }`;
  function injectCss() {
    if (document.getElementById('crCss')) return;
    const s = document.createElement('style'); s.id = 'crCss'; s.textContent = css; document.head.appendChild(s);
  }
  let hi = 0;
  try { hi = Number(localStorage.getItem(HI_KEY)) || 0; } catch (e) { /* stockage bloqué */ }

  function mount(host, opts) {
    injectCss();
    const o = opts || {};
    const box = document.createElement('div');
    box.className = 'cr';
    box.innerHTML = `<canvas tabindex="0" aria-label="Mini-jeu CHEST : appuie sur Espace ou touche l'écran pour sauter les bougies"></canvas>
      <div class="cr__bar"><span class="cr__lbl"><i class="cr__dot" aria-hidden="true"></i><span class="cr__txt"></span></span>
      <span class="cr__keys">Espace / ↑ / toucher : sauter · ↓ : retomber</span><button type="button" class="cr__go" hidden>Voir le résultat</button></div>`;
    host.appendChild(box);
    const cv = box.querySelector('canvas'), ctx = cv.getContext('2d'), txt = box.querySelector('.cr__txt'), go = box.querySelector('.cr__go');
    txt.textContent = o.label || 'Calcul en cours…';
    let W = 0, H = 190, dpr = 1;
    function size() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = cv.clientWidth || 600;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();
    const ro = window.ResizeObserver ? new ResizeObserver(size) : null;
    if (ro) ro.observe(cv);

    const GROUND = H - 34, P = { x: 46, w: 30, h: 24 };
    let state = 'idle', y = 0, vy = 0, speed = 6, score = 0, obs = [], nextIn = 60, t = 0, raf = 0, played = false, readyCb = null, dead = 0;
    const reset = () => { y = 0; vy = 0; speed = 6; score = 0; obs = []; nextIn = 50; t = 0; };
    function jump() {
      if (state === 'idle' || state === 'over') { if (state === 'over' && Date.now() - dead < 350) return; reset(); state = 'run'; played = true; return; }
      if (y === 0) vy = 11.5;
    }
    function drop() { if (state === 'run' && y > 0) vy = Math.min(vy, -10); }
    function spawn() {
      const n = Math.random() < 0.22 + Math.min(0.25, score / 4000) ? 2 : 1;
      let x = W + 10;
      for (let i = 0; i < n; i++) {
        const h = 22 + Math.random() * 30, up = Math.random() < 0.5;
        obs.push({ x, w: 11, h, up, wick: 6 + Math.random() * 8 });
        x += 17;
      }
      nextIn = Math.max(34, 70 + Math.random() * 60 - speed * 2.2);
    }
    function chest(x, top) {
      const g = ctx.createLinearGradient(x, top, x + P.w, top + P.h);
      g.addColorStop(0, '#fc1283'); g.addColorStop(1, '#f9a45e');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, top + 7, P.w, P.h - 7, 4) : ctx.rect(x, top + 7, P.w, P.h - 7); ctx.fill();
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - 1, top, P.w + 2, 9, [6, 6, 2, 2]) : ctx.rect(x - 1, top, P.w + 2, 9); ctx.fill();
      ctx.fillStyle = 'rgba(5,5,5,.55)'; ctx.fillRect(x - 1, top + 8, P.w + 2, 2);
      ctx.fillStyle = '#fff'; ctx.fillRect(x + P.w / 2 - 2, top + 11, 4, 5);
      // pattes (alternent en courant)
      ctx.fillStyle = '#f6f6f7';
      const k = state === 'run' && y === 0 ? Math.floor(t / 5) % 2 : 0;
      ctx.fillRect(x + 6, top + P.h, 4, k ? 3 : 5); ctx.fillRect(x + P.w - 10, top + P.h, 4, k ? 5 : 3);
    }
    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,.035)';
      for (let gx = (-(t * speed * 0.3) % 40 + 40) % 40; gx < W; gx += 40) for (let gy = 18; gy < GROUND; gy += 30) ctx.fillRect(gx, gy, 1.5, 1.5);
      ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, GROUND + 5.5); ctx.lineTo(W, GROUND + 5.5); ctx.stroke();
      obs.forEach((b) => {
        const c = b.up ? '#33e6a6' : '#ff4d5e';
        ctx.fillStyle = c; ctx.globalAlpha = 0.75;
        ctx.fillRect(b.x + b.w / 2 - 1, GROUND + 5 - b.h - b.wick, 2, b.h + b.wick);
        ctx.globalAlpha = 1;
        ctx.fillRect(b.x, GROUND + 5 - b.h, b.w, b.h - 4);
      });
      chest(P.x, GROUND - P.h + 5 - y);
      ctx.font = '600 12px "Fragment Mono", ui-monospace, monospace'; ctx.textAlign = 'right'; ctx.fillStyle = '#9b9ba1';
      ctx.fillText(`HI ${String(Math.floor(hi)).padStart(5, '0')}   ${String(Math.floor(score)).padStart(5, '0')}`, W - 14, 24);
      ctx.textAlign = 'center';
      if (state === 'idle') { ctx.fillStyle = '#f6f6f7'; ctx.font = '600 14px "Instrument Sans", system-ui, sans-serif'; ctx.fillText('Appuie sur Espace ou touche l’écran pour jouer', W / 2, 74); }
      if (state === 'over') {
        ctx.fillStyle = '#f6f6f7'; ctx.font = '700 16px "Instrument Sans", system-ui, sans-serif'; ctx.fillText('Stop touché', W / 2, 66);
        ctx.fillStyle = '#9b9ba1'; ctx.font = '500 12.5px "Instrument Sans", system-ui, sans-serif'; ctx.fillText('Espace ou toucher pour rejouer', W / 2, 88);
      }
    }
    function step() {
      if (!box.isConnected) { api.destroy(); return; } // conteneur remplacé : on s'arrête
      raf = requestAnimationFrame(step);
      if (state === 'run') {
        t++;
        speed = Math.min(15, 6 + score / 260);
        score += speed * 0.06;
        vy -= 0.62; y = Math.max(0, y + vy); if (y === 0) vy = 0;
        obs.forEach((b) => { b.x -= speed; });
        obs = obs.filter((b) => b.x + b.w > -10);
        if (--nextIn <= 0) spawn();
        const px = P.x + 4, pw = P.w - 8, pb = GROUND + 5 - y, pt = pb - P.h + 4;
        if (obs.some((b) => px < b.x + b.w && px + pw > b.x && pb > GROUND + 5 - b.h + 2 && pt < GROUND + 5)) {
          state = 'over'; dead = Date.now();
          if (score > hi) { hi = score; try { localStorage.setItem(HI_KEY, String(Math.floor(hi))); } catch (e) { /* tant pis */ } }
          if (readyCb) go.focus();
        }
      } else t += 0.5;
      draw();
    }
    raf = requestAnimationFrame(step);
    const onKey = (e) => {
      if (!document.body.contains(box)) return;
      const r = box.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) return; // jeu hors écran : la page garde ses touches
      if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); jump(); }
      else if (e.code === 'ArrowDown' && state === 'run') { e.preventDefault(); drop(); }
    };
    window.addEventListener('keydown', onKey);
    cv.addEventListener('pointerdown', (e) => { e.preventDefault(); cv.focus({ preventScroll: true }); jump(); });
    go.addEventListener('click', () => { const cb = readyCb; api.destroy(); if (cb) cb(); });
    const api = {
      setLabel(s) { txt.textContent = s; },
      ready(s, onOpen) {
        box.classList.add('is-ready');
        txt.textContent = s || 'C’est prêt.';
        readyCb = onOpen || null;
        if (state !== 'run' && !played) { api.destroy(); if (onOpen) onOpen(); return; }
        go.hidden = false;
      },
      destroy() { cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey); if (ro) ro.disconnect(); box.remove(); },
    };
    return api;
  }
  window.CHESTRunner = { mount };
})();
