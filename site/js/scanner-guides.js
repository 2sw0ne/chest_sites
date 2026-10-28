/* ============================================================
   CHEST — onglet « À propos » de chaque scanner (Stratégies)
   - Titre fantôme en arrière-plan (nom du scanner), vidéo explicative cliquable, puis un rappel
     écrit ET dessiné des éléments à retenir, dans l'ordre de la vidéo (2026-10-15, demande
     utilisateur, modèle : fiche « Cloudtrap » — étapes numérotées, schémas achat / vente).
   - Le texte reprend le script exact de chaque vidéo (projects/chest-motion/scanners/<id>/lines.json).
   - Schémas : SVG générés ici (moteur `chart()`), aux couleurs de chaque vidéo. Exemples
     illustratifs : prix et chiffres inventés, jamais des données réelles.
   ============================================================ */
(() => {
  'use strict';

  // ───────────────────────── Couleurs (DA CHEST + teintes des vidéos)
  const C = {
    green: '#33e6a6', red: '#ff4d5e', amber: '#e8b339', gold: '#f5c451', pink: '#fc1283', orange: '#f9a45e',
    blue: '#3b82f6', sky: '#38bdf8', navy: '#2948c9', violet: '#a855f7', purple: '#8b5cf6',
    ink: '#f6f6f7', ink2: '#9b9ba1', ink3: '#5c5c63', white: '#e8e8ee', grey: '#6b6b74', teal: '#2dd4bf',
  };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const r1 = (v) => Math.round(v * 10) / 10;

  // ───────────────────────── Séries de prix (déterministes)
  function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  // keys : [[t (0..1), valeur], …] — interpolation douce entre les points clés + bruit
  function path(keys, n, nz, seed) {
    const r = rng(seed || 7), out = [];
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1);
      let k = 0;
      while (k < keys.length - 2 && t > keys[k + 1][0]) k++;
      const [t0, v0] = keys[k], [t1, v1] = keys[k + 1];
      const u = Math.min(1, Math.max(0, (t - t0) / ((t1 - t0) || 1)));
      const e = (1 - Math.cos(Math.PI * u)) / 2;
      out.push(v0 + (v1 - v0) * e + (r() - 0.5) * 2 * (nz == null ? 1 : nz));
    }
    return out;
  }
  function sma(v, p) { return v.map((_, i) => { const a = v.slice(Math.max(0, i - p + 1), i + 1); return a.reduce((s, x) => s + x, 0) / a.length; }); }
  function ema(v, p) { const k = 2 / (p + 1); let e = v[0]; return v.map((x) => (e = x * k + e * (1 - k))); }
  function shift(v, d) { return v.map((x) => x + d); }

  // ───────────────────────── Moteur de schéma
  // spec : { closes, seed, w, h, range, right, color(i,up), wick, body,
  //          bands[{v1,v2,from,to,color,op,label}], cols[{i1,i2,color,op,label}], cloud{a,b,color,op},
  //          over[{vals,color,w,dash,op}], segs[{i1,v1,i2,v2,color,w,dash,label}], polys[{pts,color,fill,w}],
  //          hl[{v,color,dash,w,label,pill,from,to,op,left}], marks[{i,v|at,kind,color,text,off}], notes[{i,v,text,dx,dy}],
  //          panel{h,range,label,series,bands,hl,bars,marks} }
  function chart(s) {
    const n = s.closes.length;
    const W = s.w || 560, H = s.h || 250;
    // gouttière droite seulement si des niveaux portent une étiquette (sinon le schéma prend toute la largeur)
    const right = s.right != null ? s.right : ((s.hl || []).some((x) => x.label) || (s.bands || []).some((x) => x.lx === 'right') || (s.panel && ((s.panel.bands || []).some((b) => b.label) || (s.panel.hl || []).some((b) => b.label))) ? 104 : 14);
    const pad = { l: 10, r: right, t: 16, b: 12 };
    const panelH = s.panel ? (s.panel.h || 70) : 0;
    const mainB = H - pad.b - (panelH ? panelH + 16 : 0);
    const r = rng(s.seed || 3);
    const wick = s.wick == null ? 1.4 : s.wick;
    const jit = s.jit == null ? 1 : s.jit; // écart ouverture / clôture précédente : des corps de bougie visibles
    const o = [], h = [], l = [], c = s.closes;
    for (let i = 0; i < n; i++) {
      o[i] = i ? c[i - 1] + (r() - 0.5) * 2 * jit : c[0] - (r() - 0.5) * 2 * jit;
      h[i] = Math.max(o[i], c[i]) + r() * wick;
      l[i] = Math.min(o[i], c[i]) - r() * wick;
    }
    let lo = Infinity, hi = -Infinity;
    if (s.range) { [lo, hi] = s.range; } else {
      for (let i = 0; i < n; i++) { lo = Math.min(lo, l[i]); hi = Math.max(hi, h[i]); }
      (s.hl || []).forEach((x) => { lo = Math.min(lo, x.v); hi = Math.max(hi, x.v); });
      (s.bands || []).forEach((x) => { lo = Math.min(lo, x.v1, x.v2); hi = Math.max(hi, x.v1, x.v2); });
      const m = (hi - lo) * 0.1; lo -= m; hi += m;
    }
    const step = (W - pad.l - pad.r) / n;
    const X = (i) => pad.l + (i + 0.5) * step;
    const Y = (v) => pad.t + (hi - v) / (hi - lo) * (mainB - pad.t);
    const valAt = (m) => (m.v != null ? m.v : m.at === 'high' ? h[m.i] : m.at === 'low' ? l[m.i] : c[m.i]);
    const out = [];
    const pills = [];

    // fonds : colonnes (sessions, fenêtres) et zones horizontales
    (s.cols || []).forEach((z) => {
      const x1 = X(z.i1) - step / 2, x2 = X(z.i2) + step / 2;
      out.push(`<rect x="${r1(x1)}" y="${pad.t - 6}" width="${r1(x2 - x1)}" height="${r1(mainB - pad.t + 10)}" rx="6" fill="${z.color}" fill-opacity="${z.op || 0.1}"/>`);
      if (z.label) out.push(`<text x="${r1(x1 + 8)}" y="${pad.t + 8}" class="sg-t sg-t--s" fill="${z.tcolor || z.color}">${esc(z.label)}</text>`);
    });
    (s.bands || []).forEach((z) => {
      const x1 = z.from != null ? X(z.from) - step / 2 : pad.l, x2 = z.to != null ? X(z.to) + step / 2 : W - pad.r;
      const y1 = Y(Math.max(z.v1, z.v2)), y2 = Y(Math.min(z.v1, z.v2));
      out.push(`<rect x="${r1(x1)}" y="${r1(y1)}" width="${r1(x2 - x1)}" height="${r1(Math.max(2, y2 - y1))}" rx="${z.rx == null ? 3 : z.rx}" fill="${z.color}" fill-opacity="${z.op || 0.16}"${z.stroke ? ` stroke="${z.color}" stroke-opacity=".7" stroke-width="1"` : ''}/>`);
      if (z.label) out.push(`<text x="${r1(z.lx === 'right' ? x2 - 6 : x1 + 6)}" y="${r1(y1 + 11)}" class="sg-t sg-t--s" text-anchor="${z.lx === 'right' ? 'end' : 'start'}" fill="${z.tcolor || z.color}">${esc(z.label)}</text>`);
    });
    // nuage entre deux séries
    if (s.cloud) {
      const a = s.cloud.a, b = s.cloud.b;
      const top = a.map((v, i) => `${r1(X(i))},${r1(Y(v))}`).join(' ');
      const bot = b.map((v, i) => `${r1(X(i))},${r1(Y(v))}`).reverse().join(' ');
      out.push(`<polygon points="${top} ${bot}" fill="${s.cloud.color}" fill-opacity="${s.cloud.op || 0.18}"/>`);
    }
    (s.clouds || []).forEach((cl) => {
      // from / to : nuage limité à une plage de bougies
      const f = cl.from || 0, t = cl.to == null ? cl.a.length - 1 : cl.to;
      const idx = cl.a.map((_, i) => i).filter((i) => i >= f && i <= t);
      const top = idx.map((i) => `${r1(X(i))},${r1(Y(cl.a[i]))}`).join(' ');
      const bot = idx.map((i) => `${r1(X(i))},${r1(Y(cl.b[i]))}`).reverse().join(' ');
      out.push(`<polygon points="${top} ${bot}" fill="${cl.color}" fill-opacity="${cl.op || 0.2}"/>`);
    });
    // lignes horizontales (niveaux)
    (s.hl || []).forEach((x) => {
      const x1 = x.from != null ? X(x.from) - step / 2 : pad.l, x2 = x.to != null ? X(x.to) + step / 2 : W - pad.r;
      out.push(`<line x1="${r1(x1)}" y1="${r1(Y(x.v))}" x2="${r1(x2)}" y2="${r1(Y(x.v))}" stroke="${x.color || C.ink3}" stroke-width="${x.w || 1}" stroke-opacity="${x.op || 0.9}"${x.dash ? ` stroke-dasharray="${x.dash === true ? '4 4' : x.dash}"` : ''}/>`);
      if (x.label) pills.push({ y: Y(x.v), text: x.label, color: x.color || C.ink2, solid: x.pill, x: x.left ? null : W - pad.r + 6 });
    });
    // séries superposées (moyennes mobiles, lignes de tendance de fond)
    (s.over || []).forEach((x) => {
      const pts = x.vals.map((v, i) => (v == null ? null : `${r1(X(i))},${r1(Y(v))}`)).filter(Boolean).join(' ');
      out.push(`<polyline points="${pts}" fill="none" stroke="${x.color}" stroke-width="${x.w || 1.6}" stroke-opacity="${x.op || 1}" stroke-linejoin="round" stroke-linecap="round"${x.dash ? ` stroke-dasharray="${x.dash === true ? '4 4' : x.dash}"` : ''}/>`);
    });
    (s.polys || []).forEach((p) => {
      const pts = p.pts.map(([i, v]) => `${r1(X(i))},${r1(Y(v))}`).join(' ');
      out.push(p.fill
        ? `<polygon points="${pts}" fill="${p.color}" fill-opacity="${p.op || 0.14}" stroke="${p.color}" stroke-opacity=".8" stroke-width="${p.w || 1.4}" stroke-linejoin="round"/>`
        : `<polyline points="${pts}" fill="none" stroke="${p.color}" stroke-width="${p.w || 1.6}" stroke-linejoin="round"${p.dash ? ` stroke-dasharray="${p.dash === true ? '4 4' : p.dash}"` : ''}/>`);
    });
    // bougies
    if (s.candles !== false) {
      const bw = Math.max(2, Math.min(9, step * (s.body || 0.62)));
      for (let i = 0; i < n; i++) {
        if (s.hide && s.hide(i)) continue;
        const up = c[i] >= o[i];
        const col = s.color ? s.color(i, up, c[i]) : (up ? C.green : C.red);
        if (!col) continue;
        const x = X(i), yo = Y(o[i]), yc = Y(c[i]);
        const op = s.alpha ? s.alpha(i, up) : 1;
        out.push(`<g opacity="${op}"><line x1="${r1(x)}" y1="${r1(Y(h[i]))}" x2="${r1(x)}" y2="${r1(Y(l[i]))}" stroke="${col}" stroke-width="1"/><rect x="${r1(x - bw / 2)}" y="${r1(Math.min(yo, yc))}" width="${r1(bw)}" height="${r1(Math.max(2.4, Math.abs(yc - yo)))}" rx="1" fill="${col}"/></g>`);
      }
    }
    // segments (lignes de tendance, Fibonacci, liens)
    (s.segs || []).forEach((g) => {
      out.push(`<line x1="${r1(X(g.i1))}" y1="${r1(Y(g.v1))}" x2="${r1(X(g.i2))}" y2="${r1(Y(g.v2))}" stroke="${g.color}" stroke-width="${g.w || 1.5}" stroke-linecap="round"${g.dash ? ` stroke-dasharray="${g.dash === true ? '4 4' : g.dash}"` : ''}/>`);
      if (g.label) out.push(`<text x="${r1(X(g.i2) + 6)}" y="${r1(Y(g.v2) + 4)}" class="sg-t sg-t--s" fill="${g.color}">${esc(g.label)}</text>`);
    });
    // repères
    (s.marks || []).forEach((m) => {
      const off = m.off == null ? (m.at === 'low' ? 11 : m.at === 'high' ? -11 : 0) : m.off;
      out.push(mark(m.kind, X(m.i), Y(valAt(m)) + off, m.color || C.ink, m.text, m.size));
    });
    // bulles d'annotation (style des vidéos : point + texte sur fond sombre)
    (s.notes || []).forEach((t) => {
      const x = X(t.i) + (t.dx || 0), y = Y(t.v) + (t.dy || 0);
      const w = t.text.length * 5.7 + 24;
      // jamais hors du cadre
      const ax = Math.max(4, Math.min(W - 4 - w, t.anchor === 'end' ? x - w : t.anchor === 'middle' ? x - w / 2 : x));
      out.push(`<g class="sg-note"><rect x="${r1(ax)}" y="${r1(y - 10)}" width="${r1(w)}" height="20" rx="10" fill="#111115" fill-opacity=".92" stroke="rgba(255,255,255,.14)"/><circle cx="${r1(ax + 10)}" cy="${r1(y)}" r="2.6" fill="${t.color || C.ink}"/><text x="${r1(ax + 17)}" y="${r1(y + 3.8)}" class="sg-t sg-t--s" fill="${C.ink}">${esc(t.text)}</text></g>`);
    });
    // étiquettes de droite (niveaux) — écartées pour ne jamais se chevaucher
    pills.sort((a, b) => a.y - b.y);
    for (let k = 1; k < pills.length; k++) if (pills[k].y - pills[k - 1].y < 15) pills[k].y = pills[k - 1].y + 15;
    pills.forEach((p) => {
      // une étiquette trop longue pour la gouttière se décale vers la gauche plutôt que d'être coupée
      const w = p.text.length * 5.6 + 12, x = p.x == null ? pad.l + 2 : Math.min(p.x, W - w - 3);
      out.push(p.solid
        ? `<g><rect x="${r1(x)}" y="${r1(p.y - 8)}" width="${r1(w)}" height="16" rx="4" fill="${p.color}"/><text x="${r1(x + 6)}" y="${r1(p.y + 3.6)}" class="sg-t sg-t--s sg-t--b" fill="#0b0b0e">${esc(p.text)}</text></g>`
        : `<text x="${r1(x)}" y="${r1(p.y + 3.6)}" class="sg-t sg-t--s" fill="${p.color}">${esc(p.text)}</text>`);
    });

    // panneau du bas (oscillateur, histogramme)
    if (s.panel) {
      const P = s.panel, py0 = mainB + 16, py1 = H - pad.b;
      const [plo, phi] = P.range || [0, 100];
      const PY = (v) => py0 + (phi - v) / (phi - plo) * (py1 - py0);
      out.push(`<line x1="${pad.l}" y1="${r1(py0 - 8)}" x2="${W - pad.r}" y2="${r1(py0 - 8)}" stroke="rgba(255,255,255,.07)"/>`);
      (P.bands || []).forEach((z) => {
        const x1 = z.from != null ? X(z.from) - step / 2 : pad.l, x2 = z.to != null ? X(z.to) + step / 2 : W - pad.r;
        out.push(`<rect x="${r1(x1)}" y="${r1(PY(Math.max(z.v1, z.v2)))}" width="${r1(x2 - x1)}" height="${r1(Math.abs(PY(z.v1) - PY(z.v2)))}" fill="${z.color}" fill-opacity="${z.op || 0.18}"/>`);
        if (z.label) out.push(`<text x="${W - pad.r + 6}" y="${r1((PY(z.v1) + PY(z.v2)) / 2 + 3.6)}" class="sg-t sg-t--s" fill="${z.tcolor || z.color}">${esc(z.label)}</text>`);
      });
      (P.hl || []).forEach((x) => {
        out.push(`<line x1="${pad.l}" y1="${r1(PY(x.v))}" x2="${W - pad.r}" y2="${r1(PY(x.v))}" stroke="${x.color || C.ink3}" stroke-width="1"${x.dash ? ' stroke-dasharray="3 4"' : ''}/>`);
        if (x.label) out.push(`<text x="${W - pad.r + 6}" y="${r1(PY(x.v) + 3.6)}" class="sg-t sg-t--s" fill="${x.color || C.ink2}">${esc(x.label)}</text>`);
      });
      (P.bars || []).forEach((b) => {
        const bw = Math.max(1.5, step * 0.62), z = PY(b.base == null ? 0 : b.base);
        b.vals.forEach((v, i) => {
          if (v == null) return;
          const y = PY(v);
          out.push(`<rect x="${r1(X(i) - bw / 2)}" y="${r1(Math.min(y, z))}" width="${r1(bw)}" height="${r1(Math.max(1, Math.abs(z - y)))}" fill="${b.color(i, v)}" fill-opacity="${b.op || 0.9}"/>`);
        });
      });
      (P.series || []).forEach((x) => {
        const pts = x.vals.map((v, i) => (v == null ? null : `${r1(X(i))},${r1(PY(v))}`)).filter(Boolean).join(' ');
        out.push(`<polyline points="${pts}" fill="none" stroke="${x.color}" stroke-width="${x.w || 1.3}" stroke-linejoin="round"${x.dash ? ' stroke-dasharray="3 3"' : ''}/>`);
      });
      (P.segs || []).forEach((g) => out.push(`<line x1="${r1(X(g.i1))}" y1="${r1(PY(g.v1))}" x2="${r1(X(g.i2))}" y2="${r1(PY(g.v2))}" stroke="${g.color}" stroke-width="${g.w || 1.5}"/>`));
      (P.marks || []).forEach((m) => out.push(mark(m.kind, X(m.i), PY(m.v), m.color || C.ink, m.text, m.size)));
      if (P.label) out.push(`<text x="${pad.l + 2}" y="${r1(py0 - 12)}" class="sg-t sg-t--xs" fill="${C.ink3}">${esc(P.label)}</text>`);
    }
    return `<svg viewBox="0 0 ${W} ${H}" class="sg-svg" role="img" aria-label="${esc(s.alt || 'Schéma')}">${out.join('')}</svg>`;
  }

  // Formes des repères
  function mark(kind, x, y, col, text, size) {
    const k = size || 1;
    switch (kind) {
      case 'star': { const a = 7 * k, b = 2.1 * k;
        return `<path d="M${r1(x)} ${r1(y - a)}L${r1(x + b)} ${r1(y - b)}L${r1(x + a)} ${r1(y)}L${r1(x + b)} ${r1(y + b)}L${r1(x)} ${r1(y + a)}L${r1(x - b)} ${r1(y + b)}L${r1(x - a)} ${r1(y)}L${r1(x - b)} ${r1(y - b)}Z" fill="${col}" class="sg-glow"/>`; }
      case 'star5': { const R = 7.5 * k, ri = 3.2 * k; let d = '';
        for (let j = 0; j < 10; j++) { const rr = j % 2 ? ri : R, a = -Math.PI / 2 + j * Math.PI / 5; d += `${j ? 'L' : 'M'}${r1(x + rr * Math.cos(a))} ${r1(y + rr * Math.sin(a))}`; }
        return `<path d="${d}Z" fill="${col}" class="sg-glow"/>`; }
      case 'tri-up': return `<path d="M${r1(x)} ${r1(y - 6 * k)}L${r1(x + 6 * k)} ${r1(y + 5 * k)}L${r1(x - 6 * k)} ${r1(y + 5 * k)}Z" fill="${col}"/>`;
      case 'tri-down': return `<path d="M${r1(x)} ${r1(y + 6 * k)}L${r1(x + 6 * k)} ${r1(y - 5 * k)}L${r1(x - 6 * k)} ${r1(y - 5 * k)}Z" fill="${col}"/>`;
      case 'tri-up-o': return `<path d="M${r1(x)} ${r1(y - 6)}L${r1(x + 6)} ${r1(y + 5)}L${r1(x - 6)} ${r1(y + 5)}Z" fill="none" stroke="${col}" stroke-width="1.4"/>`;
      case 'tri-down-o': return `<path d="M${r1(x)} ${r1(y + 6)}L${r1(x + 6)} ${r1(y - 5)}L${r1(x - 6)} ${r1(y - 5)}Z" fill="none" stroke="${col}" stroke-width="1.4"/>`;
      case 'arrow-up': return `<path d="M${r1(x)} ${r1(y - 4)}L${r1(x)} ${r1(y + 4)}M${r1(x - 2.6)} ${r1(y - 1.4)}L${r1(x)} ${r1(y - 4)}L${r1(x + 2.6)} ${r1(y - 1.4)}" stroke="${col}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
      case 'arrow-down': return `<path d="M${r1(x)} ${r1(y + 4)}L${r1(x)} ${r1(y - 4)}M${r1(x - 2.6)} ${r1(y + 1.4)}L${r1(x)} ${r1(y + 4)}L${r1(x + 2.6)} ${r1(y + 1.4)}" stroke="${col}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
      case 'dot': return `<circle cx="${r1(x)}" cy="${r1(y)}" r="${3.4 * k}" fill="${col}"/>`;
      case 'ring': return `<circle cx="${r1(x)}" cy="${r1(y)}" r="${11 * k}" fill="none" stroke="${col}" stroke-width="1.8" class="sg-glow"/>`;
      case 'diamond': return `<path d="M${r1(x)} ${r1(y - 6)}L${r1(x + 5)} ${r1(y)}L${r1(x)} ${r1(y + 6)}L${r1(x - 5)} ${r1(y)}Z" fill="${col}"/>`;
      case 'drop': return `<path d="M${r1(x)} ${r1(y - 7)}C${r1(x + 3)} ${r1(y - 3)} ${r1(x + 5)} ${r1(y)} ${r1(x + 5)} ${r1(y + 2)}A5 5 0 0 1 ${r1(x - 5)} ${r1(y + 2)}C${r1(x - 5)} ${r1(y)} ${r1(x - 3)} ${r1(y - 3)} ${r1(x)} ${r1(y - 7)}Z" fill="${col}"/>`;
      case 'bolt': return `<path d="M${r1(x + 1.5)} ${r1(y - 7)}L${r1(x - 4)} ${r1(y + 1)}L${r1(x - 0.5)} ${r1(y + 1)}L${r1(x - 1.5)} ${r1(y + 7)}L${r1(x + 4)} ${r1(y - 1)}L${r1(x + 0.5)} ${r1(y - 1)}Z" fill="${col}"/>`;
      case 'check': return `<path d="M${r1(x - 4 * k)} ${r1(y)}L${r1(x - 1 * k)} ${r1(y + 3 * k)}L${r1(x + 4.5 * k)} ${r1(y - 3.5 * k)}" stroke="${col}" stroke-width="${2 * k}" fill="none" stroke-linecap="round" stroke-linejoin="round" class="sg-glow"/>`;
      case 'num': return `<g><circle cx="${r1(x)}" cy="${r1(y)}" r="7.5" fill="${col}"/><text x="${r1(x)}" y="${r1(y + 3.6)}" text-anchor="middle" class="sg-t sg-t--s sg-t--b" fill="#0b0b0e">${esc(text)}</text></g>`;
      case 'letter': return `<text x="${r1(x)}" y="${r1(y + 4)}" text-anchor="middle" class="sg-t sg-t--b" fill="${col}">${esc(text)}</text>`;
      case 'tag': {
        const w = String(text).length * 6.2 + 14;
        return `<g><rect x="${r1(x - w / 2)}" y="${r1(y - 8.5)}" width="${r1(w)}" height="17" rx="4" fill="${col}"/><text x="${r1(x)}" y="${r1(y + 3.6)}" text-anchor="middle" class="sg-t sg-t--s sg-t--b" fill="${tagInk(col)}">${esc(text)}</text></g>`;
      }
      case 'text': return `<text x="${r1(x)}" y="${r1(y + 4)}" text-anchor="middle" class="sg-t sg-t--s" fill="${col}">${esc(text)}</text>`;
      default: return '';
    }
  }
  function tagInk(col) { return [C.red, C.navy, C.violet, C.purple, C.pink, C.blue].includes(col) ? '#fff' : '#0b0b0e'; }

  // Niveaux de Fibonacci entre a (niveau 0) et b (niveau 1)
  function fibLv(a, b, r) { return a + (b - a) * r; }

  // ───────────────────────── Figures HTML (panneaux, cartes, listes)
  const win = (svg, cap) => `<figure class="sg-win"><div class="sg-win__bar"><i></i><i></i><i></i>${cap ? `<span>${esc(cap)}</span>` : ''}</div>${svg}</figure>`;
  function pair(buy, sell, opts) {
    const o = opts || {};
    return `<div class="sg-pair">
      <div class="sg-pair__col"><div class="sg-side sg-side--buy">${esc(o.buyLabel || 'Achat')}</div>${buy}</div>
      <div class="sg-pair__col"><div class="sg-side sg-side--sell">${esc(o.sellLabel || 'Vente')}</div>${sell}</div>
    </div>`;
  }
  const cards = (items) => `<div class="sg-cards">${items.map((c) => `<div class="sg-card"${c.color ? ` style="--c:${c.color}"` : ''}>${c.k ? `<span class="sg-card__k">${esc(c.k)}</span>` : ''}<b>${c.t}</b>${c.d ? `<p>${c.d}</p>` : ''}${c.extra || ''}</div>`).join('')}</div>`;

  // ───────────────────────── Contenu par scanner
  // Chaque guide : intro, chips (marché / UT / style), steps [{t, txt, pts?, fig?}], recap[]
  const G = {};

  // ═════════ PULSE ═════════
  G.pulse = (() => {
    const B = '#3b82f6', R = '#e5484d';
    const v1 = path([[0, 72], [0.42, 30], [0.5, 31], [1, 74]], 60, 1.1, 11);
    const phaseCol = (i) => (i < 26 ? R : B);
    const main = v1.map((_, i) => (i < 30 ? 80 - i * 0.55 : 63 - (i - 30) * 0.05));
    const fig1 = chart({ closes: v1, seed: 4, color: phaseCol, alt: 'Bougies rouges puis bleues', notes: [{ i: 30, v: 45, text: 'Bougies bleues = acheteur', color: B }, { i: 3, v: 50, text: 'Bougies rouges = vendeur', color: R }] });
    const cloudA = ema(v1, 6).map((x) => x + 6), cloudB = ema(v1, 6).map((x) => x - 6);
    const fig2 = chart({ closes: v1, seed: 4, color: phaseCol, cloud: { a: cloudA, b: cloudB, color: '#9ca3af', op: 0.16 },
      over: [{ vals: ema(v1, 9).map((x, i) => (i <= 28 ? x + 9 : null)), color: R, w: 2.2 }, { vals: ema(v1, 9).map((x, i) => (i >= 26 ? x - 7 : null)), color: B, w: 2.2 }],
      notes: [{ i: 34, v: 40, text: 'Ligne principale : la direction', color: B }, { i: 6, v: 46, text: 'Nuage gris', color: '#9ca3af' }] });
    const fig3 = chart({ closes: v1, seed: 4, color: phaseCol,
      marks: [{ i: 26, at: 'low', kind: 'tri-up', color: B, off: 12 }].concat([30, 33, 36, 39, 42, 45, 48, 51, 54].map((i) => ({ i, at: 'high', kind: 'arrow-up', color: B, off: -10 }))).concat([4, 8, 12, 16, 20].map((i) => ({ i, at: 'low', kind: 'arrow-down', color: R, off: 10 }))),
      notes: [{ i: 27, v: 24, text: 'MacroTrend : changement de tendance', color: B }, { i: 40, v: 79, text: 'Micro-flèches', color: B, anchor: 'end' }] });
    const fig4 = chart({ closes: v1, seed: 4, color: phaseCol,
      segs: [{ i1: 1, v1: 76, i2: 31, v2: 37, color: R, w: 1.6 }, { i1: 34, v1: 48, i2: 58, v2: 62, color: B, w: 1.3, dash: '3 3' }],
      marks: [{ i: 30, v: 38, kind: 'ring', color: C.violet }],
      notes: [{ i: 31, v: 30, text: 'Cassure de la ligne de vente', color: C.violet }, { i: 46, v: 47, text: 'Micro-ligne de tendance', color: B }] });
    const osc = v1.map((_, i) => 50 + 38 * Math.sin(i / 3.1) * (i > 22 && i < 30 ? 0.3 : 1));
    const fig5 = chart({ closes: v1, seed: 4, color: phaseCol, h: 300, cloud: { a: cloudA, b: cloudB, color: '#9ca3af', op: 0.14 },
      marks: [{ i: 34, v: cloudB[34] + 1, kind: 'dot', color: B }, { i: 44, v: cloudB[44] + 1, kind: 'dot', color: B }, { i: 49, at: 'low', kind: 'tri-up-o', color: B, off: 12 }],
      notes: [{ i: 35, v: 30, text: 'Touche du nuage', color: B }, { i: 49, v: 44, text: 'Alerte de pullback', color: B, anchor: 'end' }],
      panel: { h: 70, label: 'OSCILLATEUR QUANTIQUE', range: [0, 100], series: [{ vals: osc, color: '#d4d4d8' }],
        bands: [{ v1: 82, v2: 100, color: R, op: 0.35, label: 'Vente' }, { v1: 0, v2: 18, color: B, op: 0.38, label: 'Achat' }],
        marks: [{ i: 33, v: osc[33], kind: 'ring', color: C.violet, size: 0.7 }] } });
    const force = `<div class="sg-force">
      <div class="sg-force__gauge"><div class="sg-force__bar"><i style="left:0;width:40%;background:${R}"></i><i style="left:40%;width:20%;background:#52525b"></i><i style="left:60%;width:40%;background:${B}"></i><b style="left:72%"></b></div>
        <div class="sg-force__scale"><span>0</span><span style="left:40%">40</span><span style="left:60%">60</span><span style="left:100%">100</span></div>
        <div class="sg-force__legend"><span style="color:${R}">Sous 40 : grosse force vendeuse</span><span>40 – 60 : le marché se repose</span><span style="color:${B}">Au-dessus de 60 : grosse force acheteuse</span></div></div>
      <div class="sg-tfrow">${['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'].map((t, k) => `<span class="sg-tf ${[0, 1, 2, 4, 5].includes(k) ? 'is-up' : 'is-down'}">${t}<i></i></span>`).join('')}</div>
    </div>`;
    const v6 = path([[0, 74], [0.45, 30], [1, 66]], 54, 1, 21);
    const fig7 = chart({ closes: v6, seed: 9, color: (i) => (i < 30 ? R : B),
      cols: [{ i1: 19, i2: 29, color: B, op: 0.1, label: 'Zone de transition', tcolor: '#9db7ff' }],
      marks: [20, 23, 26, 29].map((i) => ({ i, at: 'high', kind: 'arrow-up', color: B, off: -10 })),
      notes: [{ i: 30, v: 70, text: 'Phase rouge + flèches bleues', color: B }] });
    // Stratégie recommandée
    const opp = (dir) => `<div class="sg-opp">${(dir === 'buy'
      ? [['AUDJPY', 30, 1], ['GBPNZD', 48, 1], ['EURNZD', 39, 1]] : [['NZDUSD', 42, 0], ['USDCAD', 33, 0], ['EURGBP', 28, 0]])
      .map(([p, s, up]) => `<div class="sg-opp__row ${up ? 'is-up' : 'is-down'}"><b>${p}</b><span>${up ? '↑' : '↓'} Trend</span><span>${up ? '↑' : '↓'} Strength <em>${s}</em></span></div>`).join('')}</div>`;
    const fibBuy = path([[0, 20], [0.55, 88], [0.8, 60], [1, 70]], 40, 0.8, 31);
    const fbuy = chart({ closes: fibBuy, seed: 2, color: (i, up) => (up ? B : R), w: 300, h: 230, right: 44,
      hl: [{ v: 88, label: '0', color: C.ink2 }, { v: fibLv(88, 20, 0.382), label: '0,382', color: '#7aa2ff', dash: true }, { v: fibLv(88, 20, 0.5), label: '0,5', color: '#7aa2ff', dash: true }, { v: fibLv(88, 20, 0.618), label: '0,618', color: '#7aa2ff', dash: true }, { v: fibLv(88, 20, 0.786), label: '0,786', color: R, dash: true }, { v: 20, label: '1', color: C.ink2 }],
      bands: [{ v1: fibLv(88, 20, 0.382), v2: fibLv(88, 20, 0.618), color: B, op: 0.12 }] });
    const fibSell = fibBuy.map((v) => 108 - v);
    const fsell = chart({ closes: fibSell, seed: 2, color: (i, up) => (up ? B : R), w: 300, h: 230, right: 44,
      hl: [{ v: 20, label: '0', color: C.ink2 }, { v: fibLv(20, 88, 0.382), label: '0,382', color: '#7aa2ff', dash: true }, { v: fibLv(20, 88, 0.5), label: '0,5', color: '#7aa2ff', dash: true }, { v: fibLv(20, 88, 0.618), label: '0,618', color: '#7aa2ff', dash: true }, { v: fibLv(20, 88, 0.786), label: '0,786', color: R, dash: true }, { v: 88, label: '1', color: C.ink2 }],
      bands: [{ v1: fibLv(20, 88, 0.382), v2: fibLv(20, 88, 0.618), color: R, op: 0.12 }] });
    const mom = path([[0, 30], [0.5, 62], [0.7, 54], [1, 80]], 44, 1, 41);
    const ma200 = mom.map((_, i) => 26 + i * 0.5);
    const mom1 = chart({ closes: mom, seed: 3, color: (i, up) => (up ? B : R), w: 300, h: 220, right: 10,
      clouds: [{ a: mom.map((_, i) => 34 + i * 0.75), b: mom.map((_, i) => 24 + i * 0.7), color: C.green, op: 0.16 }],
      over: [{ vals: ma200, color: C.gold, w: 1.8 }, { vals: shift(ema(mom, 8), 5), color: '#93c5fd', w: 1.1 }, { vals: shift(ema(mom, 8), -5), color: '#93c5fd', w: 1.1 }] });
    const momS = mom.map((v) => 110 - v);
    const mom2 = chart({ closes: momS, seed: 3, color: (i, up) => (up ? B : R), w: 300, h: 220, right: 10,
      clouds: [{ a: momS.map((_, i) => 86 - i * 0.7), b: momS.map((_, i) => 76 - i * 0.75), color: R, op: 0.14 }],
      over: [{ vals: momS.map((_, i) => 84 - i * 0.5), color: C.gold, w: 1.8 }, { vals: shift(ema(momS, 8), 5), color: '#fca5a5', w: 1.1 }, { vals: shift(ema(momS, 8), -5), color: '#fca5a5', w: 1.1 }] });
    const rsi = (up) => {
      const vals = path(up ? [[0, 48], [0.35, 38], [0.6, 46], [1, 74]] : [[0, 52], [0.35, 62], [0.6, 54], [1, 26]], 30, 1.2, up ? 5 : 6);
      return chart({ closes: vals.map(() => 50), candles: false, w: 150, h: 130, right: 6, range: [0, 100], alt: 'RSI',
        bands: [{ v1: 50, v2: 70, color: B, op: 0.22 }, { v1: 30, v2: 50, color: R, op: 0.18 }],
        over: [{ vals, color: '#e4e4e7', w: 1.5 }], marks: [{ i: up ? 21 : 21, v: vals[21], kind: 'ring', color: C.violet, size: 0.8 }] });
    };
    const stoch = (up) => {
      const a = path(up ? [[0, 70], [0.45, 14], [1, 88]] : [[0, 30], [0.45, 86], [1, 12]], 30, 1, up ? 8 : 9);
      const b = path(up ? [[0, 62], [0.5, 22], [1, 72]] : [[0, 38], [0.5, 78], [1, 26]], 30, 1, up ? 10 : 12);
      return chart({ closes: a.map(() => 50), candles: false, w: 150, h: 130, right: 6, range: [0, 100], alt: 'Stochastique',
        hl: [{ v: 80, color: C.ink3, dash: '3 3' }, { v: 20, color: C.ink3, dash: '3 3' }],
        over: [{ vals: a, color: '#7dd3fc', w: 1.4 }, { vals: b, color: C.orange, w: 1.4 }], marks: [{ i: 14, v: (a[14] + b[14]) / 2, kind: 'ring', color: C.violet, size: 0.8 }] });
    };
    const struct = pair(`<div class="sg-mini2">${win(rsi(true), 'RSI')}${win(stoch(true), 'Stoch.')}</div>`, `<div class="sg-mini2">${win(rsi(false), 'RSI')}${win(stoch(false), 'Stoch.')}</div>`);
    // Entrée / stop / objectif
    const ex = path([[0, 22], [0.4, 80], [0.62, 55], [0.75, 58], [1, 92]], 52, 0.9, 51);
    const f0 = 80, f1 = 22, l382 = fibLv(f0, f1, 0.382), l618 = fibLv(f0, f1, 0.618);
    const ext618 = 56 + (80 - 22) * 0.618;
    const figTP = chart({ closes: ex, seed: 6, color: (i, up) => (up ? B : R), h: 270,
      hl: [{ v: 80, color: C.ink3, dash: true }, { v: l382, color: '#7aa2ff', dash: true, label: 'Entrée > 0,382', pill: true }, { v: l618, color: R, dash: true, label: 'Stop 0,618', pill: true }, { v: ext618, color: C.green, dash: true, label: 'TP 61,8 ext.', pill: true }],
      segs: [{ i1: 1, v1: 22, i2: 20, v2: 80, color: C.gold, w: 1.4, dash: '4 3' }, { i1: 20, v1: 80, i2: 32, v2: 56, color: C.gold, w: 1.4, dash: '4 3' }],
      marks: [{ i: 1, v: 22, kind: 'num', text: '1', color: C.gold }, { i: 20, v: 80, kind: 'num', text: '2', color: C.gold }, { i: 32, v: 56, kind: 'num', text: '3', color: C.gold }, { i: 35, v: l382, kind: 'ring', color: C.violet, size: 0.7 }] });
    return {
      tagline: 'Le scanner qui lit la phase du marché, sur toutes les unités de temps.',
      intro: 'Pulse te dit dans quelle phase est le marché, dans quelle direction il va, et où entrer. Il fonctionne sur toutes les unités de temps.',
      chips: ['Toutes les unités de temps', 'Phase · tendance · force', 'Stratégie en 4 étapes'],
      steps: [
        { t: 'La phase', txt: 'Bougies <b class="c-blue">bleues</b> : le marché est acheteur. Bougies <b class="c-red">rouges</b> : il est vendeur.', fig: win(fig1, 'Lire la phase') },
        { t: 'La direction de fond', txt: 'La <b>ligne de tendance principale</b> donne la direction de fond. Le <b>nuage gris</b> encadre le prix.', fig: win(fig2, 'Ligne principale et nuage') },
        { t: 'Les signaux', txt: 'Le signal <b>MacroTrend</b>, un triangle, annonce le changement de tendance. Les <b>micro-flèches</b> suivent ensuite le mouvement, bougie après bougie.', fig: win(fig3, 'MacroTrend et micro-flèches') },
        { t: 'Les cassures', txt: 'Les lignes de tendance d\'achat et de vente, et les micro-lignes de tendance, n\'attendent qu\'une chose : <b>leur cassure</b>.', fig: win(fig4, 'Lignes de tendance') },
        { t: 'Les repères d\'entrée', txt: 'Trois repères : les <b>points de touche du nuage</b>, l\'<b>alerte de pullback</b>, et en bas, l\'<b>oscillateur quantique</b> dans sa zone d\'achat ou de vente.', fig: win(fig5, 'Entrées') },
        { t: 'Le panneau des forces', txt: 'Un score et la tendance de chaque unité de temps.', pts: ['Au-dessus de 60 : grosse force acheteuse', 'Sous 40 : grosse force vendeuse', 'Entre les deux : le marché se repose'], fig: force },
        { t: 'Le setup idéal', txt: 'À l\'achat : tout est aligné en bleu. Pour la vente, c\'est l\'inverse.', pts: ['Phase bleue', 'Ligne principale haussière', 'Score au-dessus de 60', 'Une ligne de tendance cassée', 'Entrée sur le nuage ou le pullback'] },
        { t: 'Attention : la zone de transition', txt: 'Une <b class="c-red">phase rouge</b> avec des <b class="c-blue">flèches bleues</b> annonce souvent un retournement.', fig: win(fig7, 'Zone de transition') },
        { group: 'Stratégie recommandée · 4 étapes' },
        { t: 'Choisis ton opportunité', txt: 'Deux flèches <b class="c-blue">bleues</b> pour un achat, deux <b class="c-red">rouges</b> pour une vente, avec une force (TREND & STRENGTH) au-dessus de <b>25 à 30</b>.', fig: pair(opp('buy'), opp('sell')) },
        { t: 'Où se trouve le prix ?', txt: 'Trace un <b>Fibonacci</b> sur le dernier mouvement, et laisse le prix revenir dedans. Trois zones d\'entrée : <b>0,382 · 0,5 · 0,618</b>.', fig: pair(win(fbuy, 'Fibonacci · achat'), win(fsell, 'Fibonacci · vente')) },
        { t: 'Ton momentum', txt: 'Le prix doit être du bon côté de la <b class="c-gold">moyenne mobile 200</b>, du <b>nuage Ichimoku</b> et des <b>deux moyennes 20</b>.', fig: pair(win(mom1, 'Au-dessus = achat'), win(mom2, 'En dessous = vente')) },
        { t: 'Ta structure', txt: 'Le <b>RSI</b> doit être dans sa bande bleue, et les deux lignes du <b>stochastique</b> doivent se croiser.', fig: struct },
        { t: 'Entrée, stop, objectif', txt: 'Entrée : la bougie qui clôture au-dessus du <b>0,382</b>. Stop : au <b>0,618</b>. Objectif : le <b>61,8 d\'une extension de Fibonacci</b>, tracée du bas (1) au haut (2) du Fibonacci, puis jusqu\'au rebond (3).', fig: win(figTP, 'Exemple d\'achat') },
      ],
      recap: ['Phase bleue = achat, rouge = vente', 'Ligne principale + score > 60 (< 40 en vente)', 'Une ligne de tendance cassée', 'Prix revenu dans le Fibonacci (0,382 → 0,618)', 'RSI dans la bande, stochastique qui croise', 'Stop au 0,618 · objectif au 61,8 de l\'extension'],
    };
  })();

  // ═════════ ALGOMNI ═════════
  G.algomni = (() => {
    const GOLD = '#f5b942';
    const v = path([[0, 40], [0.12, 44], [0.38, 86], [0.45, 84], [0.85, 22], [1, 30]], 50, 1.6, 61);
    const vol = v.map((_, i) => (i >= 38 && i <= 43 ? 85 + (i % 3) * 5 : i >= 15 && i <= 19 ? 55 : 18 + ((i * 37) % 23)));
    const goldCol = (i, up) => { const k = vol[i] > 70 ? 1 : vol[i] > 40 ? 0.7 : 0.38; return i >= 30 ? `rgba(245,185,66,${k})` : `rgba(235,235,240,${k + 0.2})`; };
    const volPanel = { h: 46, range: [0, 100], bars: [{ vals: vol, color: (i, x) => (x > 70 ? GOLD : 'rgba(170,170,180,.5)') }] };
    const f1 = chart({ closes: v, seed: 5, color: goldCol, h: 270, panel: volPanel, notes: [{ i: 37, v: 26, text: 'Bougie vive = gros volume', color: GOLD, anchor: 'end' }] });
    const f2 = chart({ closes: v, seed: 5, color: goldCol, marks: [{ i: 5, at: 'low', kind: 'star', color: GOLD }, { i: 20, at: 'high', kind: 'star', color: GOLD }, { i: 43, at: 'low', kind: 'star', color: GOLD }],
      notes: [{ i: 22, v: 95, text: 'Plus haut', color: GOLD }, { i: 40, v: 12, text: 'Plus bas', color: GOLD, anchor: 'end' }] });
    const f3 = chart({ closes: v, seed: 5, color: goldCol, bands: [{ v1: 36, v2: 47, from: 0, to: 9, color: '#3b82f6', op: 0.22, stroke: true }, { v1: 78, v2: 91, from: 15, to: 24, color: '#f97316', op: 0.2, stroke: true }],
      marks: [{ i: 5, at: 'low', kind: 'star', color: GOLD }, { i: 20, at: 'high', kind: 'star', color: GOLD }],
      notes: [{ i: 1, v: 54, text: 'Liquidité de session', color: '#60a5fa' }, { i: 16, v: 97, text: 'Liquidité de session', color: C.orange }] });
    const lv = [];
    for (let p = 0; p <= 100; p += 5) lv.push(p);
    const lvl = lv.map((p) => (p % 25 === 0 ? { v: p, color: GOLD, w: 6, op: 0.32, label: `${(4100 + p).toLocaleString('fr-FR')} · zone dorée` } : p % 10 === 0 ? { v: p, color: '#e5e7eb', w: 4, op: 0.22 } : { v: p, color: '#9ca3af', w: 1, op: 0.35 }));
    const f4 = chart({ closes: v, seed: 5, color: goldCol, range: [0, 100], hl: lvl,
      notes: [{ i: 6, v: 66, text: 'Tous les 5 $ : une ligne', color: '#9ca3af' }, { i: 6, v: 59, text: 'Tous les 10 $ : zone blanche', color: '#e5e7eb' }, { i: 6, v: 52, text: 'Tous les 25 $ : zone dorée', color: GOLD }] });
    const s = path([[0, 82], [0.55, 22], [0.62, 25], [0.75, 30], [0.85, 28.5], [1, 46]], 46, 1.3, 71);
    const f5 = chart({ closes: s, seed: 8, color: goldCol, range: [10, 100],
      hl: [{ v: 25, color: GOLD, w: 6, op: 0.3 }, { v: 30, color: '#e5e7eb', w: 4, op: 0.25, label: 'Entrée · zone blanche', pill: true }, { v: 50, color: GOLD, w: 6, op: 0.3 }, { v: 75, color: GOLD, w: 6, op: 0.3 }],
      marks: [{ i: 25, at: 'low', kind: 'tag', text: 'BUY', color: C.green, off: 14 }, { i: 34, v: 30, kind: 'ring', color: C.ink, size: 0.7 }],
      notes: [{ i: 27, v: 42, text: 'On attend la prochaine zone', color: C.ink }] });
    const f6 = chart({ closes: s, seed: 8, color: goldCol, range: [10, 100],
      hl: [{ v: 25, color: GOLD, w: 6, op: 0.3, label: 'Stop · derrière la zone', pill: true }, { v: 23, color: C.red, dash: true }, { v: 30, color: '#e5e7eb', w: 4, op: 0.25, label: 'Entrée', pill: true }, { v: 50, color: GOLD, w: 6, op: 0.3, label: 'TP1 · zone dorée', pill: true }, { v: 75, color: GOLD, w: 6, op: 0.3, label: 'TP2 · zone dorée', pill: true }, { v: 98, color: GOLD, w: 6, op: 0.3, label: 'TP3', pill: true }],
      marks: [{ i: 25, at: 'low', kind: 'tag', text: 'BUY', color: C.green, off: 14 }] });
    const f8 = chart({ closes: v, seed: 5, color: goldCol, h: 270, panel: volPanel,
      hl: [{ v: 25, color: GOLD, w: 6, op: 0.3 }], marks: [{ i: 43, at: 'low', kind: 'star', color: GOLD }, { i: 43, v: 25, kind: 'ring', color: C.ink, size: 1.5 }],
      notes: [{ i: 38, v: 52, text: 'Zone + étoile + volume', color: GOLD, anchor: 'end' }] });
    return {
      tagline: 'Le scanner de l\'or, pensé pour le M5.',
      intro: 'Son objectif : repérer les retournements du marché, là où le prix a le plus de chances de repartir.',
      chips: ['XAUUSD', 'M5', 'Retournements'],
      steps: [
        { t: 'Les bougies', txt: 'Plus une bougie est <b class="c-gold">vive</b>, plus il y a de volume derrière elle : c\'est de la conviction.', fig: win(f1, 'Volume = conviction') },
        { t: 'Les étoiles', txt: 'Les étoiles marquent les <b>plus hauts</b> et les <b>plus bas</b>. Elles te montrent où la structure se retourne.', fig: win(f2, 'Hauts et bas') },
        { t: 'Les zones de liquidité', txt: 'Les zones <b class="c-blue">bleues</b> et <b class="c-orange">orange</b>, c\'est la liquidité laissée par les sessions. Elles se placent souvent sur ces plus hauts et ces plus bas.', fig: win(f3, 'Liquidité de session') },
        { t: 'Les niveaux', txt: 'Tous les <b>5 $</b>, une ligne discrète. Tous les <b>10 $</b>, une zone blanche. Tous les <b>25 $</b>, une <b class="c-gold">zone dorée</b> : les points stratégiques de l\'or, les plus importants.', fig: win(f4, 'Tous les 5, 10 et 25 dollars') },
        { t: 'Le signal', txt: 'Quand une étiquette <b>BUY</b> ou <b>SELL</b> apparaît, tu n\'entres pas tout de suite. Tu attends que le prix touche la <b>prochaine zone</b>, au-dessus ou en dessous, blanche ou dorée.', fig: win(f5, 'Étiquette, zone, entrée') },
        { t: 'Stop et objectifs', txt: 'Le stop se place juste <b>derrière la dernière zone</b>. Les objectifs sont toujours sur les <b class="c-gold">zones dorées</b> : TP1 sur la prochaine, TP2 sur la suivante, TP3 encore après.', fig: win(f6, 'Plan du trade') },
        { t: 'La gestion', txt: 'Deux options au choix :', fig: cards([{ k: 'Option 1', t: 'Clôtures partielles', d: 'Fermer un tiers de la position à chaque objectif : ⅓ au TP1, ⅓ au TP2, ⅓ au TP3.', color: C.gold }, { k: 'Option 2', t: 'Stop au point d\'entrée', d: 'Dès le TP1, remonter le stop au point d\'entrée et laisser courir.', color: C.green }]) },
        { t: 'Les meilleurs trades', txt: 'Cumule les confirmations au même endroit : une <b class="c-gold">zone stratégique</b>, une <b>étoile</b> et une <b>bougie de volume</b>.', fig: win(f8, 'Confluence') },
      ],
      recap: ['Étiquette BUY / SELL = alerte, pas une entrée', 'Entrée au contact de la prochaine zone (blanche ou dorée)', 'Stop derrière la dernière zone', 'Objectifs sur les zones dorées (TP1, TP2, TP3)', 'Gestion : ⅓ par objectif, ou stop à l\'entrée dès TP1', 'Meilleurs trades : zone + étoile + volume'],
    };
  })();

  // ═════════ SWYPER ═════════
  G['swyper-v6'] = (() => {
    const P = '#8b5cf6', Y = '#facc15';
    const v = path([[0, 88], [0.62, 30], [0.68, 28], [0.72, 34], [1, 40]], 56, 1.2, 81);
    const ma = ema(v, 7).map((x, i) => x + (i < 36 ? 3 : -1.5));
    const iy = 38; // bougie jaune
    const col = (i) => (i === iy ? Y : i < 36 ? P : '#e9e7f5');
    v[iy] = 46; v[iy - 1] = 32;
    const RES = [-1, -1, 4.6, -1, -1, -1, 6.2, -1, -1, 3.8];
    const wl = `<div class="sg-wlbox"><svg viewBox="0 0 320 168" class="sg-svg" role="img" aria-label="Petites pertes, gros gains"><line x1="10" y1="112" x2="310" y2="112" stroke="rgba(255,255,255,.18)"/>${RES.map((r, k) => { const x = 22 + k * 29, hgt = Math.abs(r) * 14; return r > 0 ? `<rect x="${x}" y="${112 - hgt}" width="18" height="${hgt}" rx="3" fill="${C.green}"/><text x="${x + 9}" y="${106 - hgt}" text-anchor="middle" class="sg-t sg-t--s sg-t--b" fill="${C.green}">+${String(r).replace('.', ',')} R</text>` : `<rect x="${x}" y="112" width="18" height="${hgt}" rx="3" fill="${C.red}" fill-opacity=".85"/>`; }).join('')}<text x="310" y="150" text-anchor="end" class="sg-t sg-t--s" fill="${C.ink2}">Pertes de 1 R</text></svg></div><p class="sg-cap">Exemple illustratif : beaucoup de petites pertes, quelques gros gains qui compensent largement.</p>`;
    const f1 = chart({ closes: v, seed: 3, color: col, hide: (i) => i > 37, over: [{ vals: ma.map((x, i) => (i <= 37 ? x : null)), color: '#e5e7eb', w: 1.3, op: 0.8 }], marks: [{ i: 35, at: 'low', kind: 'star', color: '#fff', off: 13 }], notes: [{ i: 14, v: 46, text: 'Le mouvement s\'essouffle', color: '#fff' }] });
    const f2 = chart({ closes: v, seed: 3, color: col, hide: (i) => i > iy, over: [{ vals: ma.map((x, i) => (i <= iy ? x : null)), color: '#e5e7eb', w: 1.3, op: 0.8 }], marks: [{ i: 35, at: 'low', kind: 'star', color: '#fff', off: 13 }], notes: [{ i: iy, v: 54, text: 'Bougie jaune : cassure de la moyenne', color: Y, anchor: 'end' }] });
    const zTop = 46, zBot = 38;
    const f3 = chart({ closes: v, seed: 3, color: col, hide: (i) => i > iy, bands: [{ v1: zTop, v2: zBot, from: iy, to: 52, color: '#9ca3af', op: 0.22, stroke: true }], over: [{ vals: ma.map((x, i) => (i <= iy ? x : null)), color: '#e5e7eb', w: 1.3, op: 0.8 }], marks: [{ i: 35, at: 'low', kind: 'star', color: '#fff', off: 13 }],
      notes: [{ i: 53, v: zTop + 4, text: 'Clôture de la bougie jaune', color: '#e5e7eb', anchor: 'end' }, { i: 53, v: zBot - 4, text: 'Point de pullback', color: '#e5e7eb', anchor: 'end' }] });
    const v4 = v.slice(); for (let i = iy + 1; i < 56; i++) v4[i] = 46 + Math.sin((i - iy) / 2) * 3 - (i > 44 && i < 49 ? 5 : 0) + (i > 50 ? (i - 50) * 0.8 : 0);
    const f4 = chart({ closes: v4, seed: 3, color: col, bands: [{ v1: zTop, v2: zBot, from: iy, to: 55, color: Y, op: 0.28, stroke: true }], over: [{ vals: ema(v4, 7), color: '#e5e7eb', w: 1.3, op: 0.7 }],
      hl: [{ v: zTop, from: iy, color: Y, label: 'PE', pill: true, op: 0 }], marks: [{ i: 35, at: 'low', kind: 'star', color: '#fff', off: 13 }], notes: [{ i: 41, v: 30, text: 'Trade actif dans la zone', color: Y }] });
    const f5 = chart({ closes: v4, seed: 3, color: col, range: [20, 110], bands: [{ v1: zTop, v2: zBot, from: iy, to: 55, color: Y, op: 0.24 }],
      hl: [{ v: zTop, from: iy, color: Y, label: 'PE', pill: true, dash: true }, { v: zBot - 1, from: iy, color: C.red, dash: true, label: 'SL', pill: true }, { v: zTop + 9, from: iy, color: C.green, dash: true, label: 'TP1 · RR 1', pill: true }, { v: zTop + 34, from: iy, color: C.green, dash: true, label: 'TP2', pill: true }, { v: zTop + 58, from: iy, color: C.green, dash: true, label: 'TP3', pill: true }],
      marks: [{ i: 35, at: 'low', kind: 'star', color: '#fff', off: 13 }] });
    const f6 = chart({ closes: v4, seed: 3, color: col, range: [20, 110], bands: [{ v1: zTop + 31, v2: zTop + 37, from: 0, to: 18, color: '#9ca3af', op: 0.2, label: 'Zone du passé', tcolor: '#d4d4d8' }],
      hl: [{ v: zTop, from: iy, color: Y, label: 'PE', pill: true, dash: true }, { v: zTop + 9, from: iy, color: C.green, dash: true, label: 'TP1 → stop à l\'entrée', pill: true }, { v: zTop + 34, from: 0, color: C.green, dash: true, label: 'TP2 sur la zone : on le prend', pill: true }, { v: zTop + 58, from: iy, color: C.green, dash: true, label: 'TP3 visé', pill: true, op: 0.5 }] });
    return {
      tagline: 'Le scanner sniper de l\'or, sur le M5.',
      intro: 'De très gros RR, mais plus de pertes : peu de trades gagnants, mais ils compensent largement tous les autres. Avec Swyper, tout se joue dans l\'ordre des confirmations.',
      chips: ['XAUUSD', 'M5', 'Gros RR'],
      steps: [
        { t: 'Le style', txt: 'Peu de trades gagnants, mais très gros : ils compensent largement les pertes.', fig: wl },
        { t: 'L\'étoile', txt: 'D\'abord, une <b>étoile</b> apparaît : le mouvement s\'essouffle.', fig: win(f1, 'Confirmation 1 · étoile') },
        { t: 'La bougie jaune', txt: 'Ensuite, une <b class="c-yellow">bougie jaune</b> casse la moyenne mobile : la cassure est confirmée.', fig: win(f2, 'Confirmation 2 · bougie jaune') },
        { t: 'La zone grise', txt: 'À partir de cette bougie, une <b>zone grise</b> apparaît, de sa <b>clôture</b> jusqu\'au <b>point de pullback</b>. C\'est là que le trade peut être pris.', fig: win(f3, 'Confirmation 3 · zone grise') },
        { t: 'La zone dorée', txt: 'Quand le prix revient dans la zone, elle devient <b class="c-gold">dorée</b>. Le trade est actif tant que le prix reste dedans, jusqu\'en bas de la zone.', fig: win(f4, 'Confirmation 4 · zone dorée') },
        { t: 'Les objectifs', txt: 'Le <b>TP1</b> se place à un RR de 1, puis le <b>TP2</b> et le <b>TP3</b>, beaucoup plus loin.', fig: win(f5, 'Plan du trade') },
        { t: 'La gestion', txt: 'Vise le <b>TP3</b>. Mais si le <b>TP2</b> tombe sur une zone que le prix revient chercher dans le passé, prends plutôt le TP2. Dès que le prix touche le <b>TP1</b>, remonte ton stop au point d\'entrée : tu ne risques plus rien.', fig: win(f6, 'Le bon TP, puis zéro risque') },
      ],
      recap: ['Étoile → bougie jaune → zone grise → zone dorée', 'Le trade n\'existe que dans la zone dorée', 'TP1 = RR 1, puis stop à l\'entrée', 'Vise le TP3, ou le TP2 s\'il tombe sur une zone du passé'],
    };
  })();

  // ═════════ WOLFX ═════════
  G.wolfx = (() => {
    const LB = '#38bdf8', DB = '#2563eb';
    const v = path([[0, 84], [0.6, 30], [0.66, 28], [1, 60]], 54, 0.7, 91);
    const turn = 34;
    const col = (i) => (i < turn ? DB : LB);
    const emaV = ema(v, 9);
    const cloudA = emaV.map((x) => x + 8), cloudB = emaV.map((x) => x + 2), cloudC = emaV.map((x) => x - 3), cloudD = emaV.map((x) => x - 9);
    const frame = `<div class="sg-frame">
      <div class="sg-frame__mk">${[['Au', 'Or', 'XAUUSD'], ['₿', 'BTC · ETH', 'Crypto'], ['30', 'US30', 'Indice'], ['€$', 'Forex', 'Toutes les paires']].map(([i, t, d]) => `<div><i>${i}</i><b>${t}</b><span>${d}</span></div>`).join('')}</div>
      <div class="sg-hours"><div class="sg-hours__bar"><i style="left:${8 / 24 * 100}%;width:${3 / 24 * 100}%">8h – 11h</i><i style="left:${15 / 24 * 100}%;width:${3 / 24 * 100}%">15h – 18h</i></div><div class="sg-hours__scale"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>24h</span></div></div>
    </div>`;
    const fT = (buy) => chart({ closes: buy ? v : v.map((x) => 112 - x), seed: 4, w: 300, h: 210, right: 10, color: (i) => (buy ? col(i) : (i < turn ? LB : DB)), marks: [{ i: turn, at: buy ? 'low' : 'high', kind: buy ? 'tri-up' : 'tri-down', color: buy ? LB : DB, size: 1.3 }] });
    const tfs = `<div class="sg-tfgrid">
      <div class="sg-tfgrid__row"><span class="sg-chip is-lb">M1</span><span class="sg-chip is-db">M5</span><span class="sg-chip is-off">M15</span><em>M1 ≠ M5</em><b class="is-bad">Mauvais trade</b></div>
      <div class="sg-tfgrid__row"><span class="sg-chip is-lb">M1</span><span class="sg-chip is-lb">M5</span><span class="sg-chip is-off">M15</span><em>M1 = M5</em><b class="is-ok">Bon trade</b></div>
      <div class="sg-tfgrid__row"><span class="sg-chip is-lb">M1</span><span class="sg-chip is-lb">M5</span><span class="sg-chip is-lb">M15</span><em>+ M15</em><b class="is-top">Excellent</b></div>
    </div>`;
    const base = { closes: v, seed: 4, color: col };
    const fEma = chart(Object.assign({}, base, { over: [{ vals: emaV, color: DB, w: 1.8 }, { vals: emaV.map((x, i) => (i >= turn ? x : null)), color: LB, w: 2 }], notes: [{ i: turn + 4, v: 22, text: 'Prix au-dessus de l\'EMA : bleu clair', color: LB }] }));
    const fCloud = chart(Object.assign({}, base, { clouds: [{ a: cloudA, b: cloudB, color: DB, op: 0.32, to: turn + 2 }, { a: cloudC, b: cloudD, color: LB, op: 0.3, from: turn + 2 }], marks: [{ i: turn, at: 'low', kind: 'tri-up', color: LB, size: 1.2 }], notes: [{ i: turn + 4, v: 20, text: 'Prix au-dessus du nuage', color: LB }] }));
    const hist = v.map((_, i) => (i < turn ? -40 - Math.sin(i / 3) * 10 : 15 + (i - turn) * 2.2));
    const fMacd = chart(Object.assign({}, base, { h: 280, marks: [{ i: turn, at: 'low', kind: 'tri-up', color: LB, size: 1.2 }], panel: { h: 60, range: [-60, 60], label: 'INDICATEUR DU BAS', bars: [{ vals: hist, color: (i, x) => (x > 0 ? LB : DB) }] } }));
    const fSL = chart(Object.assign({}, base, { hl: [{ v: 25, color: C.red, dash: true, label: 'Niveau d\'invalidation', pill: true }], marks: [{ i: turn, at: 'low', kind: 'tri-up', color: LB, size: 1.2 }, { i: 35, at: 'low', kind: 'ring', color: C.ink, size: 0.8 }], notes: [{ i: 4, v: 38, text: 'ou sous le dernier plus bas', color: C.ink }] }));
    return {
      tagline: 'Le scanner qui suit la tendance.',
      intro: 'Tu cherches tes entrées en M1 et en M5, pour des trades qui tiennent dans la journée. Pour un achat, tout doit être bleu clair. Pour une vente, bleu foncé.',
      chips: ['M1 · M5', 'Intraday', 'Or · BTC · US30 · Forex'],
      steps: [
        { t: 'Le cadre', txt: 'Sur l\'or, le bitcoin, l\'US30 et tout le forex. Entre <b>8 h et 11 h</b>, puis entre <b>15 h et 18 h</b>.', fig: frame },
        { t: 'Le triangle', txt: '<b class="c-sky">Bleu clair</b>, c\'est un achat. <b class="c-navy">Bleu foncé</b>, c\'est une vente.', fig: pair(win(fT(true), 'Triangle bleu clair'), win(fT(false), 'Triangle bleu foncé')) },
        { t: 'Les unités de temps', txt: 'Si le M1 et le M5 ne sont pas pareils, c\'est un mauvais trade. Pareils, c\'est un bon trade. Et si le M15 suit aussi, il est excellent.', fig: tfs },
        { t: 'L\'EMA', txt: 'Le prix passe au-dessus de l\'EMA, et elle devient <b class="c-sky">bleu clair</b>.', fig: win(fEma, 'EMA') },
        { t: 'Le nuage', txt: 'Le prix est au-dessus du nuage, lui aussi <b class="c-sky">bleu clair</b>.', fig: win(fCloud, 'Nuage') },
        { t: 'L\'indicateur du bas', txt: 'Le MACD, l\'indicateur du bas, est <b class="c-sky">bleu clair</b>. Tout est aligné : tu peux entrer.', fig: win(fMacd, 'Tout est aligné') },
        { t: 'Le stop', txt: 'Au <b>niveau d\'invalidation</b> donné par Wolfx, ou sous le <b>dernier plus bas</b>.', fig: win(fSL, 'Invalidation ou dernier bas') },
        { t: 'La gestion', txt: 'Deux façons de gérer :', fig: cards([{ k: 'Option 1', t: 'RR 1 : 3', d: 'Tu risques 5 % pour viser 15 %. Dès 1 : 1, ton stop passe au point d\'entrée.', color: LB }, { k: 'Option 2', t: 'TP3 de Wolfx', d: 'Tu vises le TP3 donné par le scanner, et ton stop suit le prix.', color: DB }]) },
      ],
      recap: ['Triangle bleu clair (achat) ou bleu foncé (vente)', 'M1 = M5, idéalement M15 aussi', 'Prix au-dessus de l\'EMA et du nuage', 'Indicateur du bas de la même couleur', 'Stop : invalidation ou dernier plus bas', 'RR 1 : 3 avec stop à l\'entrée à 1 : 1, ou TP3'],
    };
  })();

  // ═════════ NEXUS ═════════
  G.nexus = (() => {
    const O = '#f97316';
    const v = path([[0, 80], [0.4, 30], [0.55, 32], [1, 70]], 56, 0.8, 101);
    const col = (i, up) => (up ? '#f3f4f6' : O);
    const tfs = `<div class="sg-tfrow sg-tfrow--c">${['M1', 'M5', 'M15', 'H1', 'H4'].map((t) => `<span class="sg-tf is-up">${t}<i></i></span>`).join('')}</div>`;
    const fA = chart({ closes: v, seed: 6, color: col, cols: [{ i1: 0, i2: 18, color: C.red, op: 0.1 }, { i1: 26, i2: 55, color: C.green, op: 0.12, label: 'Fenêtre ouverte', tcolor: C.green }] });
    const sig = 40;
    const pe = v[sig], risk = 9, vs = v.slice(18), ss = sig - 18;
    const fB = chart({ closes: vs, seed: 6, color: col, range: [pe - 20, pe + 22], cols: [{ i1: 26 - 18, i2: vs.length - 1, color: C.green, op: 0.1, label: 'Fenêtre ouverte', tcolor: C.green }],
      hl: [{ v: pe, from: ss, color: C.amber, dash: true, label: 'PE', pill: true }, { v: pe - risk, from: ss, color: C.red, dash: true, label: 'SL', pill: true }, { v: pe + risk / 2, from: ss, color: C.green, dash: true, label: 'TP1 · RR 0,5', pill: true }, { v: pe + risk, from: ss, color: C.green, dash: true, label: 'TP2 · RR 1', pill: true }],
      marks: [{ i: ss, at: 'low', kind: 'star', color: '#fde68a', off: 12 }] });
    return {
      tagline: 'Le scanner d\'ultra scalping, sur le M5.',
      intro: 'Des trades très courts : tu entres, tu prends, tu sors.',
      chips: ['M5', 'Ultra scalping', 'Deux objectifs courts'],
      steps: [
        { t: 'L\'alignement', txt: 'Tout part d\'un alignement. Quand chaque unité de temps va dans la même tendance, une zone <b class="c-green">verte</b>, ou <b class="c-red">rouge</b>, s\'allume sur tout le graphique.', fig: tfs + win(fA, 'Toutes les UT, même sens') },
        { t: 'La fenêtre', txt: 'C\'est ta fenêtre : tant qu\'elle est ouverte, une position peut apparaître.' },
        { t: 'Le signal', txt: 'Le signal, c\'est l\'<b>étoile</b>. Ensuite, deux objectifs très proches : le <b>TP1</b> à un RR de 0,5, et le <b>TP2</b> à un RR de 1.', fig: win(fB, 'Une étoile, deux TP') },
      ],
      recap: ['Toutes les unités de temps dans le même sens', 'Zone verte (achat) ou rouge (vente) ouverte', 'Signal = l\'étoile', 'TP1 à RR 0,5 · TP2 à RR 1'],
    };
  })();

  // ═════════ PIVOT ═════════
  G.pivot = (() => {
    const TEAL = '#2dd4bf';
    const names = ['-3', '-2', '-1', 'S0', 'S1', 'S2', 'S3', 'S4', 'R4', 'R5', 'R6', 'R7', 'R8'];
    const lvls = names.map((n, k) => ({ v: 8 + k * 7, n }));
    const ladder = lvls.map((x) => ({ v: x.v, color: x.n === 'S0' || x.n === 'R8' ? TEAL : 'rgba(255,255,255,.18)', w: x.n === 'S0' || x.n === 'R8' ? 3 : 1, label: x.n, pill: x.n === 'S0' || x.n === 'R8' }));
    const S0 = lvls[3].v, R8 = lvls[12].v;
    const v = path([[0, 62], [0.55, S0 - 2], [0.7, S0 + 6], [0.8, S0 - 3], [1, S0 + 12]], 56, 0.6, 111);
    const col = (i, up) => (up ? C.green : C.red);
    const base = { closes: v, seed: 2, color: col, range: [4, 96], hl: ladder };
    const f1 = chart({ closes: v, seed: 2, candles: false, range: [4, 96], hl: ladder, notes: [{ i: 6, v: S0 + 4, text: 'S0 : retournement à la hausse', color: TEAL }, { i: 6, v: R8 - 4, text: 'R8 : retournement à la baisse', color: TEAL }] });
    const f2 = chart(Object.assign({}, base, { marks: [{ i: 30, at: 'low', kind: 'tag', text: 'BUY', color: C.green, off: 14 }], notes: [{ i: 33, v: S0 - 10, text: 'Achat en S0', color: C.green }] }));
    const rsiV = v.map((_, i) => 40 + Math.sin(i / 4) * 8 + (i > 30 ? (i - 30) * 0.6 : 0));
    const f3 = chart(Object.assign({}, base, { h: 290, segs: [{ i1: 30, v1: S0 - 3, i2: 44, v2: S0 - 5, color: C.green, w: 1.6 }],
      marks: [{ i: 30, at: 'low', kind: 'tag', text: 'BUY', color: C.green, off: 14 }],
      notes: [{ i: 44, v: S0 - 12, text: 'Prix : plus bas plus bas', color: C.green, anchor: 'end' }],
      panel: { h: 60, range: [20, 80], label: 'RSI', series: [{ vals: rsiV, color: C.violet }], segs: [{ i1: 30, v1: rsiV[30] - 2, i2: 44, v2: rsiV[44] - 2, color: C.green }], marks: [{ i: 46, v: 60, kind: 'text', text: 'RSI : il remonte', color: C.green }] } }));
    const f4 = chart(Object.assign({}, base, { segs: [{ i1: 18, v1: 50, i2: 52, v2: S0 + 4, color: C.orange, w: 1.5 }], marks: [{ i: 30, at: 'low', kind: 'tag', text: 'BUY', color: C.green, off: 14 }, { i: 48, v: S0 + 6, kind: 'ring', color: C.ink, size: 0.8 }], notes: [{ i: 46, v: S0 + 20, text: 'Cassure : position validée', color: C.orange, anchor: 'end' }] }));
    const f5 = chart(Object.assign({}, base, { hl: ladder.concat([{ v: lvls[2].v - 1, color: C.red, dash: true, label: 'Stop · deux zones sous l\'entrée', pill: true }, { v: R8, color: C.green, dash: true, label: 'Objectif · R8', pill: true }]), marks: [{ i: 30, at: 'low', kind: 'tag', text: 'BUY', color: C.green, off: 14 }] }));
    return {
      tagline: 'Le scanner des zones de retournement.',
      intro: 'Pivot trace une échelle de niveaux. Tout en bas, la zone S0. Tout en haut, la zone R8. C\'est là que le prix a le plus de chances de se retourner. Pour prendre position : trois confirmations, dans l\'ordre.',
      chips: ['Zones S0 → R8', '3 confirmations', 'Retournements'],
      steps: [
        { t: 'L\'échelle', txt: '<b>S0</b> tout en bas, <b>R8</b> tout en haut : les deux zones de retournement.', fig: win(f1, 'De S0 à R8') },
        { t: 'L\'étiquette', txt: 'D\'abord, une étiquette apparaît dans la zone : un <b class="c-green">achat en S0</b>, une <b class="c-red">vente en R8</b>.', fig: win(f2, 'Confirmation 1') },
        { t: 'La divergence RSI', txt: 'Ensuite, une divergence : le prix fait un <b>plus bas</b>, mais le <b>RSI</b>, lui, remonte.', fig: win(f3, 'Confirmation 2') },
        { t: 'La cassure', txt: 'Enfin, la cassure de la <b>ligne de tendance</b>. Là, la position est validée.', fig: win(f4, 'Confirmation 3') },
        { t: 'Stop et objectif', txt: 'Ton stop se place <b>deux zones plus bas</b>. Ton objectif final, c\'est la <b>zone opposée</b> : R8 pour un achat, S0 pour une vente.', fig: win(f5, 'Stop dessous, objectif en face') },
      ],
      recap: ['Achat en S0, vente en R8', 'Étiquette → divergence RSI → cassure de la ligne', 'Stop deux zones plus loin', 'Objectif : la zone opposée'],
    };
  })();

  // ═════════ HARMONICS ═════════
  G.harmonics = (() => {
    const GR = '#34d399';
    const shapes = [['Gartley', [[0, 90], [1, 20], [2, 60], [3, 40], [4, 88]]], ['Papillon', [[0, 70], [1, 20], [2, 56], [3, 32], [4, 92]]], ['Chauve-souris', [[0, 88], [1, 18], [2, 54], [3, 30], [4, 84]]], ['Crabe', [[0, 66], [1, 18], [2, 54], [3, 30], [4, 96]]], ['Requin', [[0, 80], [1, 30], [2, 50], [3, 14], [4, 90]]]];
    const mini = (pts) => {
      const P = pts.map(([x, y]) => [8 + x * 21, 8 + (100 - y) * 0.84]);
      const d = P.map(([x, y], k) => `${k ? 'L' : 'M'}${x} ${y}`).join('');
      return `<svg viewBox="0 0 100 100" class="sg-svg"><path d="M${P[0][0]} ${P[0][1]}L${P[1][0]} ${P[1][1]}L${P[2][0]} ${P[2][1]}Z" fill="${GR}" fill-opacity=".16"/><path d="M${P[2][0]} ${P[2][1]}L${P[3][0]} ${P[3][1]}L${P[4][0]} ${P[4][1]}Z" fill="${GR}" fill-opacity=".16"/><path d="${d}" fill="none" stroke="${GR}" stroke-width="1.6" stroke-linejoin="round"/>${P.map(([x, y], k) => `<text x="${x}" y="${y + (pts[k][1] > 50 ? -4 : 11)}" text-anchor="middle" class="sg-t sg-t--xs" fill="#d1fae5">${'XABCD'[k]}</text>`).join('')}</svg>`;
    };
    const forms = `<div class="sg-forms">${shapes.map(([n, p]) => `<div>${mini(p)}<b>${n}</b></div>`).join('')}</div>`;
    const dirFig = (up) => { const p = up ? [[0, 20], [1, 92], [2, 40], [3, 70], [4, 12]] : [[0, 80], [1, 8], [2, 60], [3, 30], [4, 88]];
      const P = p.map(([x, y]) => [20 + x * 52, 10 + (100 - y) * 1.2]);
      return `<svg viewBox="0 0 260 140" class="sg-svg"><path d="M${P.map((q) => q.join(' ')).join('L')}" fill="none" stroke="${GR}" stroke-width="1.8" stroke-linejoin="round"/><path d="M${P[0].join(' ')}L${P[1].join(' ')}L${P[2].join(' ')}Z M${P[2].join(' ')}L${P[3].join(' ')}L${P[4].join(' ')}Z" fill="${GR}" fill-opacity=".14"/>${P.map(([x, y], k) => `<text x="${x}" y="${y + (p[k][1] > 50 ? -6 : 14)}" text-anchor="middle" class="sg-t sg-t--s sg-t--b" fill="#d1fae5">${'XABCD'[k]}</text>`).join('')}<path d="${up ? `M${P[4][0] + 18} ${P[4][1]}l0 -34m-5 6l5 -6l5 6` : `M${P[4][0] + 18} ${P[4][1]}l0 34m-5 -6l5 6l5 -6`}" stroke="${up ? C.green : C.red}" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`; };
    const v = path([[0, 40], [0.15, 30], [0.3, 12], [0.48, 52], [0.62, 30], [1, 92]], 60, 0.7, 121);
    const col = (i, up) => (up ? C.green : C.red);
    const D = 59, Dv = 92;
    const XP = [[2, 42], [17, 12], [29, 52], [37, 30], [D, Dv]];
    const pats = [{ pts: XP.slice(0, 3), color: C.red, fill: true, op: 0.1 }, { pts: XP.slice(2), color: C.red, fill: true, op: 0.1 }];
    const letters = [{ i: 2, v: 48, kind: 'letter', text: 'X', color: C.ink }, { i: 17, v: 6, kind: 'letter', text: 'A', color: C.ink }, { i: 29, v: 58, kind: 'letter', text: 'B', color: C.ink }, { i: 37, v: 24, kind: 'letter', text: 'C', color: C.ink }, { i: D, v: Dv + 9, kind: 'letter', text: 'D', color: C.ink }];
    const fZone = chart({ closes: v, seed: 4, color: col, bands: [{ v1: Dv - 4, v2: Dv + 6, from: 50, to: 59, color: C.red, op: 0.22, stroke: true }], polys: pats,
      marks: letters,
      notes: [{ i: 49, v: Dv + 3, text: 'Zone de retournement', color: C.red, anchor: 'end' }] });
    const fLine = chart({ closes: v, seed: 4, color: col, polys: pats, segs: [{ i1: 38, v1: 30, i2: 59, v2: 88, color: '#60a5fa', w: 1.6 }], marks: letters, notes: [{ i: 50, v: 50, text: 'Ligne de tendance : attendre la cassure', color: '#60a5fa', anchor: 'end' }] });
    const v2 = v.concat(path([[0, 92], [0.4, 95], [1, 82]], 14, 0.6, 9));
    const lo = 30, hi = 96;
    const fFib = chart({ closes: v2, seed: 4, color: col, range: [4, 106], polys: [{ pts: [[37, 30], [D, Dv]], color: C.red, w: 1.4 }],
      hl: [{ v: hi, label: '1', color: C.ink2, from: 36 }, { v: fibLv(lo, hi, 0.886), label: '0,886', color: C.gold, w: 1.6, from: 36 }, { v: fibLv(lo, hi, 0.786), label: '0,786', color: C.ink3, dash: true, from: 36 }, { v: fibLv(lo, hi, 0.618), label: '0,618', color: C.ink3, dash: true, from: 36 }, { v: fibLv(lo, hi, 0.5), label: '0,5', color: C.ink3, dash: true, from: 36 }, { v: lo, label: '0', color: C.ink2, from: 36 }],
      marks: [{ i: 61, v: hi + 5, kind: 'text', text: 'Dernier plus haut', color: C.ink2 }, { i: 66, v: fibLv(lo, hi, 0.886), kind: 'ring', color: C.gold, size: 0.8 }, { i: 68, v: fibLv(lo, hi, 0.886) - 10, kind: 'tag', text: 'SELL', color: C.red }] });
    return {
      tagline: 'Le scanner des figures harmoniques.',
      intro: 'Il trace tout seul toutes sortes de formes harmoniques, et te donne déjà une zone de retournement autour du point D.',
      chips: ['Figures XABCD', 'Zone de retournement', 'Fibonacci 0,886'],
      steps: [
        { t: 'Toutes les formes', txt: 'Le <b>Gartley</b>, le <b>papillon</b>, la <b>chauve-souris</b>, le <b>crabe</b>, le <b>requin</b> : Harmonics les trace tout seul.', fig: forms },
        { t: 'Où est le point D ?', txt: 'La règle est simple : si le point <b>D est en bas</b>, tu cherches une <b class="c-green">hausse</b>. S\'il est <b>en haut</b>, tu cherches une <b class="c-red">baisse</b>.', fig: pair(win(dirFig(true), 'D en bas'), win(dirFig(false), 'D en haut'), { buyLabel: 'Hausse', sellLabel: 'Baisse' }) },
        { t: 'La zone de retournement', txt: 'Harmonics te donne déjà une zone de retournement, autour du point D.', fig: win(fZone, 'Le retournement, autour de D') },
        { t: 'La ligne de tendance', txt: 'Pour plus de confirmations, trace d\'abord la <b>ligne de tendance</b>, et attends sa cassure.', fig: win(fLine, 'Confirmation 1') },
        { t: 'Le Fibonacci', txt: 'Trace un Fibonacci du <b>dernier plus haut</b> du mouvement jusqu\'au <b>dernier plus bas</b>. Quand le prix casse le niveau <b class="c-gold">0,886</b>, tu peux prendre ta position.', fig: win(fFib, 'Confirmation 2 · cassure du 0,886') },
      ],
      recap: ['D en bas = hausse · D en haut = baisse', 'Zone de retournement autour de D', 'Cassure de la ligne de tendance', 'Fibonacci dernier haut → dernier bas', 'Entrée à la cassure du 0,886'],
    };
  })();

  // ═════════ BLOOD ═════════
  G.blood = (() => {
    const v = path([[0, 70], [0.38, 26], [0.5, 34], [0.6, 30], [1, 84]], 64, 0.8, 131);
    const col = (i, up) => (up ? C.green : C.red);
    const emaV = ema(v, 6), smaV = sma(v, 14);
    const turn = 26;
    const styles = cards([{ k: 'Spot', t: 'Investissement', d: 'Journalier et hebdomadaire. Plusieurs semaines.', color: C.green }, { k: 'Swing', t: 'Swing', d: 'Sur le journalier.', color: C.amber }, { k: 'Scalping', t: 'Scalping', d: 'Du 4 heures au 15 minutes.', color: C.red }]);
    const fLS = chart({ closes: v, seed: 7, color: col, marks: [{ i: 4, at: 'high', kind: 'tag', text: 'SHORT', color: C.red, off: -14 }, { i: turn, at: 'low', kind: 'tag', text: 'LONG', color: C.green, off: 14 }], notes: [{ i: turn + 4, v: 58, text: 'Idée de trade sur cassure de tendance', color: C.green }] });
    const fMA = chart({ closes: v, seed: 7, color: col, clouds: [{ a: emaV, b: smaV, color: C.red, op: 0.24, to: turn + 4 }, { a: emaV, b: smaV, color: C.green, op: 0.24, from: turn + 4 }],
      over: [{ vals: emaV, color: '#86efac', w: 1.4 }, { vals: smaV, color: '#f9a8d4', w: 1.4 }],
      notes: [{ i: 40, v: 40, text: 'Ruban vert : tendance haussière', color: C.green }, { i: 2, v: 46, text: 'EMA et SMA', color: C.ink }] });
    const legend = `<div class="sg-legend">${[['diamond', '#60a5fa', 'Diamant : achat'], ['drop', C.red, 'Goutte de sang : vente'], ['bolt', C.amber, 'Éclair : formation d\'un creux']].map(([k, c, t]) => `<span><svg viewBox="-10 -10 20 20" width="18" height="18">${mark(k, 0, 0, c)}</svg>${t}</span>`).join('')}</div>`;
    const fIcons = chart({ closes: v, seed: 7, color: col, marks: [{ i: 25, at: 'low', kind: 'bolt', color: C.amber, off: 14 }, { i: 31, at: 'low', kind: 'diamond', color: '#60a5fa', off: 13 }, { i: 50, at: 'low', kind: 'diamond', color: '#60a5fa', off: 13 }, { i: 9, at: 'high', kind: 'drop', color: C.red, off: -13 }] });
    const poc = 50;
    const fPoc = chart({ closes: v, seed: 7, color: col, hl: [{ v: poc, color: C.gold, w: 1.6, label: 'POC', pill: true }, { v: 37, color: '#e5e7eb', w: 1, op: 0.6, label: 'Changement de tendance' }],
      bands: [{ v1: 27, v2: 37, from: 28, to: 38, color: '#e5e7eb', op: 0.08, stroke: true, label: 'Consolidation', tcolor: '#d4d4d8' }],
      marks: [{ i: 44, v: poc - 4, kind: 'tri-up', color: C.gold }, { i: 54, v: poc + 18, kind: 'tri-up', color: C.gold }] });
    const st = v.map((_, i) => 50 + 40 * Math.sin(i / 2.6 + 1));
    const fSto = chart({ closes: v, seed: 7, color: col, h: 300, panel: { h: 76, range: [0, 100], label: 'STOCHASTIQUE', series: [{ vals: st, color: '#e5e7eb' }, { vals: sma(st, 3), color: C.red, w: 1 }], bands: [{ v1: 80, v2: 100, color: C.red, op: 0.25, label: 'Surachat' }, { v1: 0, v2: 20, color: C.green, op: 0.25, label: 'Survente' }], marks: [10, 26, 42, 58].map((i) => ({ i, v: 6, kind: 'dot', color: C.green })), segs: [{ i1: 10, v1: st[10] + 2, i2: 26, v2: st[26] + 8, color: C.amber }] } });
    const qq = v.map((_, i) => (i < 22 ? -30 - (i % 4) * 5 : i < 30 ? ((i % 2) ? 4 : -4) : 20 + ((i * 7) % 15)));
    const fQQ = chart({ closes: v, seed: 7, color: col, h: 290, panel: { h: 64, range: [-50, 50], label: 'QQMOD', bars: [{ vals: qq, color: (i, x) => (Math.abs(x) < 6 ? '#71717a' : x > 0 ? C.green : C.red) }] } });
    const fM = chart({ closes: v, seed: 7, color: col, h: 300, hl: [{ v: 37, color: '#e5e7eb', label: 'Retour sur le niveau', op: 0.7 }],
      marks: [{ i: turn, at: 'low', kind: 'tag', text: 'LONG', color: C.green, off: 14 }, { i: 35, v: 37, kind: 'ring', color: C.ink, size: 0.8 }, { i: 37, at: 'low', kind: 'diamond', color: '#60a5fa', off: 13 }],
      panel: { h: 60, range: [0, 100], label: 'STOCHASTIQUE', series: [{ vals: st, color: '#e5e7eb' }], bands: [{ v1: 80, v2: 100, color: C.red, op: 0.2 }, { v1: 0, v2: 20, color: C.green, op: 0.2 }], marks: [{ i: 35, v: st[35], kind: 'ring', color: C.violet, size: 0.7 }] } });
    const entry = 40;
    const fG = chart({ closes: v, seed: 7, color: col, range: [15, 100], hl: [{ v: entry, from: 35, color: C.ink, dash: true, label: 'Entrée', pill: true }, { v: 30, from: 35, color: C.red, dash: true, label: 'SL du scanner', pill: true }, { v: 58, from: 35, color: C.green, dash: true, label: 'TP1 ou +10 % : sécurise', pill: true }, { v: 74, from: 35, color: C.green, dash: true, label: 'TP2', pill: true }, { v: 90, from: 35, color: C.green, dash: true, label: 'TP3 · suis la tendance', pill: true }],
      marks: [{ i: turn, at: 'low', kind: 'tag', text: 'LONG', color: C.green, off: 14 }] });
    return {
      tagline: 'Le scanner pensé pour la crypto.',
      intro: 'Il s\'adapte à trois styles de trading. Sur le graphique, chaque élément a un rôle ; en bas, deux panneaux confirment le timing.',
      chips: ['Crypto', 'Spot · Swing · Scalping', 'Stop et objectifs du scanner'],
      steps: [
        { t: 'Trois façons de trader', txt: 'L\'investissement en <b>spot</b>, sur le journalier et l\'hebdo. Le <b>swing</b>, sur le journalier. Et le <b>scalping</b>, du 4 heures au 15 minutes.', fig: styles },
        { t: 'Les étiquettes LONG et SHORT', txt: 'Des idées de trade, sur une <b>cassure de tendance</b>.', fig: win(fLS, 'Signaux') },
        { t: 'Les moyennes et le ruban', txt: 'Deux moyennes mobiles, l\'<b>EMA</b> et la <b>SMA</b>, donnent la tendance globale et locale. Le <b>ruban</b> se colore en <b class="c-green">vert</b> ou en <b class="c-red">rouge</b>, selon la tendance.', fig: win(fMA, 'Tendance') },
        { t: 'Les symboles', txt: 'Le <b>diamant</b> signale un achat, la <b>goutte de sang</b> une vente. L\'<b>éclair</b> repère la formation d\'un creux.', fig: legend + win(fIcons, 'Diamant, goutte, éclair') },
        { t: 'Les niveaux', txt: 'La <b class="c-gold">ligne jaune</b>, c\'est le niveau de volume <b>POC</b>. Les <b>triangles</b> montrent la réaction du prix sur ce niveau. La <b>ligne fine</b> marque le changement de tendance. Le <b>rectangle</b>, une consolidation.', fig: win(fPoc, 'POC, réactions, consolidation') },
        { t: 'Le stochastique', txt: 'Sa zone de <b class="c-red">surachat</b> en rouge, sa zone de <b class="c-green">survente</b> en vert, ses <b>points d\'achat</b>, et ses <b>lignes de divergence</b>.', fig: win(fSto, 'Panneau 1') },
        { t: 'Le QQMOD', txt: '<b class="c-green">Vert</b>, les acheteurs. <b class="c-red">Rouge</b>, les vendeurs. <b>Gris</b>, aucun intérêt.', fig: win(fQQ, 'Panneau 2') },
        { t: 'La méthode', txt: 'Après un signal, attends le <b>retour sur le niveau de changement de tendance</b>, que le <b>stochastique se retourne</b>, et une ou deux confirmations, comme un diamant, un ruban vert ou le QQMOD vert.', fig: win(fM, 'Signal, retour, confirmation') },
        { t: 'Stop, objectifs et gestion', txt: 'À chaque signal LONG ou SHORT, le scanner place aussi son <b>stop</b> et ses <b>objectifs</b>. Au premier objectif, ou à <b>10 %</b>, sécurise une partie, monte ton stop au point d\'entrée, puis suis la tendance.', fig: win(fG, 'Sécurise, puis suis la tendance') },
      ],
      recap: ['Signal LONG / SHORT sur cassure de tendance', 'Retour sur le niveau de changement de tendance', 'Stochastique qui se retourne', '1 ou 2 confirmations : diamant, ruban vert, QQMOD vert', 'Au TP1 ou à +10 % : sécurise, stop à l\'entrée'],
    };
  })();

  // ═════════ WAVE ═════════
  G.wave = (() => {
    const B = '#3b82f6', R = '#ef4444';
    const v = path([[0, 30], [0.25, 34], [0.4, 68], [0.55, 58], [0.75, 66], [0.85, 60], [1, 80]], 70, 1, 141);
    const col = (i, up) => (i > 30 && i < 36 ? '#71717a' : up ? B : R);
    const dash = `<div class="sg-wdash"><div class="sg-wdash__h">Bullish</div><div class="sg-wdash__r"><b class="on">Trending</b><b>Consolidating</b><b>Pulling back</b></div><div class="sg-wdash__r"><b class="on">Very strong</b><b>Strong</b><b>Neutral</b><b>Weak</b><b>Very weak</b></div></div>
      <ul class="sg-dl"><li><b>Tendance</b> haussière ou baissière</li><li><b>État</b> : en tendance, en consolidation ou en retracement</li><li><b>Force</b> du mouvement, de très forte à très faible</li></ul>`;
    const fC = chart({ closes: v, seed: 5, color: col, notes: [{ i: 33, v: 80, text: 'Gris : le marché hésite', color: '#a1a1aa' }] });
    const fast = ema(v, 3), st = ema(v, 10).map((x) => x - 6);
    const fL = chart({ closes: v, seed: 5, color: col, over: [{ vals: fast, color: '#e5e7eb', w: 1.1, op: 0.8 }, { vals: st, color: B, w: 1.3, dash: '2 3' }], notes: [{ i: 46, v: 40, text: 'Super-trend sous le prix : soutient la hausse', color: B }, { i: 20, v: 74, text: 'Ligne de tendance rapide', color: '#e5e7eb' }] });
    const fD = chart({ closes: v, seed: 5, color: col, over: [{ vals: sma(v, 18).map((x) => x - 3), color: '#a1a1aa', w: 1.3, dash: '3 3' }, { vals: v.map((_, i) => 26 + i * 0.6), color: C.orange, w: 1.4 }, { vals: v.map((_, i) => 20 + i * 0.55), color: C.violet, w: 1.4 }], notes: [{ i: 2, v: 76, text: 'Pointillés gris : direction de fond', color: '#a1a1aa' }, { i: 69, v: 22, text: 'Orange et violette : tendance longue', color: C.orange, anchor: 'end' }] });
    const fR = chart({ closes: v, seed: 5, color: col, range: [0, 100], clouds: [{ a: v.map((_, i) => 92 - Math.sin(i / 14) * 8), b: v.map((_, i) => 84 - Math.sin(i / 14) * 8), color: R, op: 0.35 }, { a: v.map((_, i) => 20 + i * 0.35 + Math.sin(i / 10) * 4), b: v.map((_, i) => 10 + i * 0.35 + Math.sin(i / 10) * 4), color: B, op: 0.35 }],
      notes: [{ i: 6, v: 96, text: 'Rouge : résistance', color: R }, { i: 50, v: 22, text: 'Bleu : support', color: B }] });
    const fK = chart({ closes: v, seed: 5, color: col, hl: [{ v: 68, color: R, dash: '3 4', op: 0.8 }, { v: 58, color: R, dash: '3 4', op: 0.8 }, { v: 34, color: R, dash: '3 4', op: 0.8 }], notes: [{ i: 10, v: 64, text: 'Niveaux clés', color: R }] });
    const e = 32, vw = v.slice(28);
    const fS = chart({ closes: vw, seed: 5, color: col, range: [50, 110], hl: [{ v: vw[e], from: e, color: C.amber, dash: true, label: 'Entrée', pill: true }, { v: vw[e] - 7, from: e, color: R, dash: true, label: 'Stop', pill: true }, { v: vw[e] + 7, from: e, color: C.green, dash: true, label: 'TP1', pill: true }, { v: vw[e] + 14, from: e, color: C.green, dash: true, label: 'TP2', pill: true }, { v: vw[e] + 21, from: e, color: C.green, dash: true, label: 'TP3', pill: true }, { v: vw[e] + 28, from: e, color: C.green, dash: true, label: 'TP4', pill: true }],
      marks: [{ i: e, at: 'low', kind: 'tag', text: '+5', color: B, off: 14 }], notes: [{ i: e - 3, v: 54, text: 'Badge bleu : score du signal', color: B, anchor: 'end' }] });
    const rs = v.map((_, i) => 50 + 26 * Math.sin(i / 3.4) + (i > 40 ? 6 : 0));
    const fA = chart({ closes: v.map(() => 50), candles: false, h: 220, right: 130, range: [0, 100], alt: 'Assistant RSI',
      over: [{ vals: rs, color: B, w: 1.4 }],
      hl: [{ v: 90, color: R, dash: '3 4', label: 'Retournement baissier' }, { v: 72, color: '#fca5a5', dash: '3 4', label: 'Retest baissier' }, { v: 50, color: '#e5e7eb', label: 'Direction de la tendance' }, { v: 28, color: '#93c5fd', dash: '3 4', label: 'Retest haussier' }, { v: 10, color: B, dash: '3 4', label: 'Retournement haussier' }],
      marks: [{ i: 16, v: rs[16], kind: 'ring', color: C.gold, size: 0.6 }, { i: 16, v: rs[16], kind: 'letter', text: 'D', color: C.gold }, { i: 48, v: rs[48], kind: 'ring', color: C.gold, size: 0.6 }, { i: 48, v: rs[48], kind: 'letter', text: 'D', color: C.gold }] });
    return {
      tagline: 'Le scanner le plus complet de CHEST.',
      intro: 'Chaque élément te raconte une partie du marché : le contexte, la tendance, le plan de trade et le bon timing.',
      chips: ['Tableau de bord', 'Plan de trade complet', 'Assistant RSI'],
      steps: [
        { t: 'Le tableau de bord', txt: 'En haut, il résume tout : la tendance, l\'état du marché et la force du mouvement.', fig: dash },
        { t: 'Les bougies', txt: '<b class="c-blue">Bleues</b> quand les acheteurs dominent, <b class="c-red">rouges</b> quand ce sont les vendeurs, <b>grises</b> quand le marché hésite.', fig: win(fC, 'Couleur = tendance') },
        { t: 'La ligne rapide et le super-trend', txt: 'Collée au prix, la <b>ligne de tendance rapide</b> suit chaque mouvement. Les pointillés, c\'est le <b>super-trend</b> : sous le prix, il soutient la hausse ; au-dessus, il pèse sur la baisse.', fig: win(fL, 'Lignes') },
        { t: 'La direction de fond', txt: 'La <b>courbe grise en pointillés</b> donne la direction de fond. Les lignes <b class="c-orange">orange</b> et <b class="c-violet">violette</b> marquent la tendance longue.', fig: win(fD, 'Tendance longue') },
        { t: 'Les rubans', txt: 'Les bandes <b>VIDYA</b> et le <b>nuage Kalman</b>. Le <b class="c-red">rouge</b> agit comme une résistance, le <b class="c-blue">bleu</b> comme un support. Quand le prix les traverse, la tendance change de camp.', fig: win(fR, 'VIDYA et Kalman') },
        { t: 'Les niveaux clés', txt: 'Les lignes horizontales en <b class="c-red">pointillés rouges</b> : là où le prix réagit souvent.', fig: win(fK, 'Niveaux clés') },
        { t: 'Le signal', txt: 'Le scanner place tout pour toi : le point d\'<b>entrée</b>, le <b>stop</b>, et quatre objectifs, du <b>TP1 au TP4</b>. Le <b class="c-blue">badge bleu</b>, c\'est le score du signal : plus il est haut, plus le signal est solide.', fig: win(fS, 'Ton plan, déjà posé') },
        { t: 'L\'assistant RSI', txt: 'En bas, il lit le rythme du marché. Au centre, la direction de la tendance. Au-dessus, la zone de retest baissier, puis le retournement baissier. En dessous, le retest haussier, puis le retournement haussier. Les <b class="c-gold">ronds jaunes marqués D</b> signalent une divergence : souvent le premier signe que le mouvement s\'essouffle.', fig: win(fA, 'Le rythme du marché') },
        { t: 'En résumé', txt: 'Quatre lectures, un plan.', fig: cards([{ k: 'Tableau de bord', t: 'Le contexte', color: B }, { k: 'Rubans et lignes', t: 'La tendance', color: C.violet }, { k: 'Signal', t: 'Le plan de trade', color: C.green }, { k: 'Assistant', t: 'Le timing', color: C.gold }]) },
      ],
      recap: ['Tableau de bord = contexte', 'Bougies, lignes et rubans = tendance', 'Signal = entrée, stop, TP1 à TP4 + score', 'Assistant RSI = timing (retests, retournements, divergences D)'],
    };
  })();

  // ═════════ STARS ═════════
  G.stars = (() => {
    const BL = '#3b5bff';
    const v = path([[0, 32], [0.3, 72], [0.45, 60], [0.55, 54], [0.8, 56], [1, 70]], 60, 0.7, 151);
    const grid = []; for (let p = 20; p <= 90; p += 10) grid.push({ v: p, color: 'rgba(255,255,255,.4)', w: 1, label: (4100 + p).toLocaleString('fr-FR'), op: 0.6 });
    const white = () => '#e8e8ee';
    const f1 = chart({ closes: v, seed: 6, color: white, range: [20, 90], hl: [{ v: 70, color: C.gold, dash: true, label: '4 170', op: 0.9 }, { v: 60, color: C.gold, dash: true, label: '4 160', op: 0.9 }], notes: [{ i: 20, v: 78, text: 'Le prix réagit sur les chiffres ronds', color: C.gold }] });
    const f2 = chart({ closes: v, seed: 6, color: white, range: [20, 90], hl: grid });
    const f3 = chart({ closes: v, seed: 6, color: white, range: [20, 90], hl: grid.concat([{ v: 60, color: BL, w: 3 }, { v: 50, color: BL, w: 3 }]), notes: [{ i: 6, v: 55, text: 'Niveaux d\'intérêt : juste au-dessus et juste en dessous', color: '#8da2ff' }] });
    const s = 49;
    const f4 = chart({ closes: v, seed: 6, color: white, range: [20, 90], hl: grid.concat([{ v: 60, color: BL, w: 3 }, { v: 50, color: BL, w: 3 }]), marks: [{ i: s, at: 'high', kind: 'star5', color: C.gold, off: -30, size: 1.3 }, { i: s, at: 'high', kind: 'check', color: C.gold, off: -12, size: 1.5 }] });
    const f5 = chart({ closes: v, seed: 6, color: white, range: [30, 90], hl: [{ v: 60, color: BL, w: 3 }, { v: 50, color: BL, w: 3 }, { v: v[s], from: s, color: C.gold, w: 2, label: 'Entrée', pill: true }, { v: v[s] - 6, from: s, color: '#f472b6', w: 2, label: 'Stop', pill: true }, { v: v[s] + 6, from: s, color: C.green, w: 2, label: 'TP1', pill: true }, { v: v[s] + 12, from: s, color: C.green, w: 2, label: 'TP2', pill: true }], marks: [{ i: s, at: 'high', kind: 'star5', color: C.gold, off: -22, size: 1.2 }] });
    return {
      tagline: 'Le scanner des niveaux ronds.',
      intro: 'Le prix adore les chiffres ronds, comme 4 150 ou 4 160. Ce sont des niveaux que tous les traders regardent, alors le prix y réagit souvent.',
      chips: ['Niveaux ronds', 'Étoile + coche', 'Plan posé'],
      steps: [
        { t: 'Le principe', txt: 'Le prix réagit souvent sur les <b>chiffres ronds</b> : tout le monde les regarde.', fig: win(f1, 'Le prix aime les chiffres ronds') },
        { t: 'La grille', txt: 'Le scanner trace automatiquement une grille de ces niveaux autour du prix, en <b>lignes blanches</b>.', fig: win(f2, 'Grille automatique') },
        { t: 'Les niveaux d\'intérêt', txt: 'Les deux <b class="c-blue">lignes bleues</b> sont les niveaux les plus proches : celui juste au-dessus du prix, et celui juste en dessous. C\'est là que tout se joue.', fig: win(f3, 'Lignes bleues') },
        { t: 'Le signal', txt: 'Quand le prix réagit sur un de ces niveaux, une <b class="c-gold">étoile</b> apparaît. La <b class="c-gold">coche jaune</b> confirme le signal.', fig: win(f4, 'Une étoile') },
        { t: 'Le plan', txt: 'Le scanner pose son plan : l\'<b class="c-gold">entrée en jaune</b>, le <b class="c-pink">stop en rose</b>, et <b class="c-green">deux objectifs en vert</b>. Tu n\'as plus qu\'à suivre : un niveau, une étoile, un plan.', fig: win(f5, 'Un plan') },
      ],
      recap: ['Lignes blanches : la grille des chiffres ronds', 'Lignes bleues : les deux niveaux d\'intérêt', 'Étoile + coche jaune = signal confirmé', 'Entrée jaune · stop rose · deux TP verts'],
    };
  })();

  // ═════════ SUPERNOVA ═════════
  G.supernova = (() => {
    const v = path([[0, 66], [0.12, 70], [0.42, 22], [0.62, 52], [0.75, 44], [1, 58]], 64, 1.1, 161);
    const col = (i, up) => (up ? C.green : C.red);
    const fast = ema(v, 4), slow = ema(v, 9);
    const trendV = path([[0, 24], [0.35, 52], [0.5, 44], [0.75, 70], [0.85, 64], [1, 84]], 44, 1.1, 163);
    const fTrend = (up) => {
      const vv = up ? trendV : trendV.map((x) => 108 - x);
      const a = ema(vv, 4), b = ema(vv, 9);
      return chart({ closes: vv, seed: 4, color: col, w: 300, h: 210, right: 8, over: [{ vals: b, color: up ? '#60a5fa' : C.red, w: 1.6 }, { vals: a, color: up ? C.red : '#60a5fa', w: 1.6 }] });
    };
    const ma200 = v.map((_, i) => 36 + i * 0.12);
    const f2 = chart({ closes: v, seed: 4, color: col, over: [{ vals: slow, color: '#60a5fa', w: 1.4 }, { vals: fast, color: C.red, w: 1.4 }, { vals: ma200, color: C.orange, w: 2 }], notes: [{ i: 52, v: 30, text: 'MA 200 : tendance de fond', color: C.orange }] });
    const stars = [{ i: 2, at: 'high', kind: 'star5', color: C.red, off: -12 }, { i: 12, at: 'high', kind: 'star5', color: C.red, off: -12 }, { i: 27, at: 'low', kind: 'star5', color: C.green, off: 12 }, { i: 47, at: 'low', kind: 'star5', color: C.green, off: 12 }];
    const f3 = chart({ closes: v, seed: 4, color: col, over: [{ vals: slow, color: '#60a5fa', w: 1.2 }, { vals: fast, color: C.red, w: 1.2 }, { vals: ma200, color: C.orange, w: 1.6 }], marks: stars });
    const f4 = chart({ closes: v, seed: 4, color: col, cols: [{ i1: 6, i2: 18, color: '#60a5fa', op: 0.08, label: 'Londres', tcolor: '#93c5fd' }, { i1: 38, i2: 54, color: '#60a5fa', op: 0.08, label: 'New York', tcolor: '#93c5fd' }], over: [{ vals: ma200, color: C.orange, w: 1.6 }], marks: stars.concat([{ i: 50, at: 'high', kind: 'tag', text: 'BUY CONFIRMÉ', color: C.green, off: -16 }]) });
    // Zoom sur la fin du mouvement : entrée, stop sur la dernière étoile, RR 1 puis RR 3
    const o0 = 30, vz = v.slice(o0), ez = 50 - o0, starI = 47 - o0;
    const pe = vz[ez], sl = Math.min(vz[starI], vz[starI - 1]) - 2, rk = pe - sl;
    const f5 = chart({ closes: vz, seed: 4, color: col, range: [sl - 6, pe + 3 * rk + 5],
      over: [{ vals: ema(vz, 9), color: '#60a5fa', w: 1.2 }, { vals: ema(vz, 4), color: C.red, w: 1.2 }, { vals: ma200.slice(o0), color: C.orange, w: 1.6 }],
      marks: [{ i: starI, at: 'low', kind: 'star5', color: C.green, off: 12 }, { i: ez, at: 'high', kind: 'tag', text: 'BUY CONFIRMÉ', color: C.green, off: -16 }],
      hl: [{ v: pe, from: ez, color: C.ink, dash: true, label: 'Entrée', pill: true }, { v: sl, from: starI, color: C.red, dash: true, label: 'SL · dernière étoile', pill: true }, { v: pe + rk, from: ez, color: '#60a5fa', dash: true, label: 'RR 1 · stop à l\u2019entrée', pill: true }, { v: pe + 3 * rk, from: ez, color: C.green, dash: true, label: 'TP · RR 3', pill: true }] });
    return {
      tagline: 'Le scanner qui suit la tendance.',
      intro: 'Deux moyennes mobiles courtes donnent la direction, la moyenne 200 la tendance de fond, et les étoiles les structures importantes. Le signal n\'apparaît que pendant les heures de fort volume.',
      chips: ['Suiveur de tendance', 'Heures de fort volume', 'RR 3 · BE à RR 1'],
      steps: [
        { t: 'La direction', txt: 'Deux moyennes mobiles courtes. Ligne <b class="c-red">rouge</b> au-dessus de la <b class="c-blue">bleue</b> : tendance haussière. Bleue au-dessus de la rouge : tendance baissière.', fig: pair(win(fTrend(true), 'Rouge au-dessus'), win(fTrend(false), 'Bleue au-dessus'), { buyLabel: 'Hausse', sellLabel: 'Baisse' }) },
        { t: 'La tendance de fond', txt: 'La moyenne mobile <b>200</b>, en <b class="c-orange">orange</b>, donne la tendance de fond.', fig: win(f2, 'MA 200') },
        { t: 'Les étoiles', txt: 'Elles repèrent les structures importantes : une étoile <b class="c-green">verte</b> pour la hausse, une étoile <b class="c-red">rouge</b> pour la baisse.', fig: win(f3, 'Structures') },
        { t: 'Le signal confirmé', txt: 'Le scanner ne garde que les signaux pris pendant les <b>heures de fort volume</b>. Quand tous les critères sont alignés, l\'étiquette <b>BUY</b> ou <b>SELL confirmé</b> apparaît.', fig: win(f4, 'Heures de fort volume') },
        { t: 'Entrée, stop, objectif', txt: 'Attends la clôture des moyennes mobiles, puis entre à la <b>clôture du signal</b>. Ton stop se place sur la <b>dernière étoile</b>. Ton objectif : un <b>RR de 3</b>. Dès que le trade atteint un RR de 1, ton stop passe au point d\'entrée.', fig: win(f5, 'Confirmé, puis géré') },
      ],
      recap: ['Rouge au-dessus de la bleue = hausse (et inversement)', 'MA 200 orange = tendance de fond', 'Signal « confirmé » seulement aux heures de fort volume', 'Entrée à la clôture du signal', 'Stop sur la dernière étoile · TP RR 3 · stop à l\'entrée à RR 1'],
    };
  })();

  // ───────────────────────── Rendu de l'onglet
  const VIDEOS = {
    algomni: 'algomni', 'swyper-v6': 'swyper-v6', wolfx: 'wolfx', nexus: 'nexus', pivot: 'pivot', harmonics: 'harmonics',
    blood: 'blood', pulse: 'pulse', wave: 'wave', stars: 'stars', supernova: 'supernova',
  };
  const VID_V = 1;
  const fmtDur = (s) => (s ? `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, '0')}` : '');

  function render(root, scanner) {
    if (!root) return;
    stopVideo(root);
    const g = scanner && G[scanner.id];
    const name = (scanner && scanner.name) || '';
    if (!g) {
      root.innerHTML = `<div class="sg"><div class="sg__ghost" aria-hidden="true">${esc(name)}</div><p class="sg-empty">${esc((scanner && scanner.description) || 'Explication à venir.')}</p></div>`;
      return;
    }
    const vid = VIDEOS[scanner.id];
    let n = 0;
    const steps = g.steps.map((s) => {
      if (s.group) { n = 0; return `<div class="sg-group"><span>${esc(s.group)}</span></div>`; } // la stratégie repart à 01
      n++;
      return `<section class="sg-step">
        <div class="sg-step__head"><span class="sg-step__n">${String(n).padStart(2, '0')}</span><h4>${esc(s.t)}</h4></div>
        <div class="sg-step__body">${s.txt ? `<p>${s.txt}</p>` : ''}${s.pts ? `<ul class="sg-pts">${s.pts.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}</div>
        ${s.fig ? `<div class="sg-step__fig">${s.fig}</div>` : ''}
      </section>`;
    }).join('');
    root.innerHTML = `<div class="sg" data-scanner="${esc(scanner.id)}">
      <div class="sg__ghost" aria-hidden="true">${esc(name)}</div>
      <div class="sg__top">
        <span class="sg__k">À propos</span>
        <h3 class="sg__title">${esc(g.tagline)}</h3>
      </div>
      ${vid ? `<div class="sg-video" data-src="assets/scanners/videos/${vid}.mp4?v=${VID_V}">
        <video preload="metadata" playsinline poster="assets/scanners/videos/${vid}.jpg?v=${VID_V}" aria-label="Vidéo : ${esc(name)} expliqué"></video>
        <button type="button" class="sg-video__play" aria-label="Lire la vidéo de ${esc(name)}">
          <span class="sg-video__pill"><span class="sg-video__btn"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg></span>
          <span class="sg-video__txt"><b>${esc(name)} en vidéo</b><small>Lancer l'explication</small></span></span>
        </button>
      </div>` : ''}
      <div class="sg-intro"><p>${esc(g.intro)}</p><div class="sg-chips">${g.chips.map((c) => `<span>${esc(c)}</span>`).join('')}</div></div>
      <div class="sg-steps">${steps}</div>
      <aside class="sg-recap"><span class="sg__k">À retenir</span><ol>${g.recap.map((r) => `<li>${esc(r)}</li>`).join('')}</ol></aside>
      <p class="sg-foot">Schémas illustratifs : prix et chiffres inventés. Les signaux ne sont pas des conseils en investissement.</p>
    </div>`;
    const box = root.querySelector('.sg-video');
    if (box) {
      const video = box.querySelector('video');
      video.addEventListener('loadedmetadata', () => { const sm = box.querySelector('.sg-video__txt small'); if (sm && !box.classList.contains('is-on')) sm.textContent = fmtDur(video.duration); });
      box.querySelector('.sg-video__play').addEventListener('click', () => {
        if (!video.src) video.src = box.dataset.src;
        video.controls = true;
        box.classList.add('is-on');
        video.play().catch(() => {});
      });
      video.addEventListener('ended', () => { box.classList.remove('is-on'); video.controls = false; video.currentTime = 0; const sm = box.querySelector('.sg-video__txt small'); if (sm) sm.textContent = 'Revoir'; });
    }
  }
  function stopVideo(root) { const v = root && root.querySelector('.sg-video video'); if (v) { try { v.pause(); } catch (e) { /* rien */ } } }

  // data(id) : le texte du guide (intro, étapes, à retenir), aussi lu par le volet scanner de School (js/school-hub.js).
  window.CHESTScannerGuide = { render, pause: stopVideo, has: (id) => !!G[id], data: (id) => G[id] || null };
})();
