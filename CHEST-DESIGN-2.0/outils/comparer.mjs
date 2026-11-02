#!/usr/bin/env node
// CHEST 2.0 — compare une page du site à sa maquette, au pixel près.
//
// Usage :
//   node outils/comparer.mjs <url-de-la-page> <capture-de-reference.png> [options]
//
// Exemples :
//   (cd site && python3 _dev_server.py)   # site en local sur le port 8934
//   node "CHEST-DESIGN-2.0/outils/comparer.mjs" http://localhost:8934/dashboard "CHEST-DESIGN-2.0/captures/Main.png" --connecte
//   node "CHEST-DESIGN-2.0/outils/comparer.mjs" http://localhost:8934/calendar "CHEST-DESIGN-2.0/captures/Calendrier.png" --connecte
//
// Options :
//   --largeur N     largeur de la fenêtre (défaut : celle de la capture de référence)
//   --attente MS    temps laissé à la page pour se dessiner (défaut 3000)
//   --connecte      simule une session connectée (jeton factice dans localStorage, comme
//                   pour les vérifications visuelles ; ne touche jamais la vraie base)
//   --local JSON    autres clés localStorage à poser avant le chargement, ex. '{"chest_theme":"dark"}'
//   --sortie DIR    dossier des résultats (défaut : ./comparaison)
//
// L'URL propre (/dashboard, /calendar…) charge le shell app.html avec la page dans
// l'iframe : la capture contient donc le menu, comme les maquettes.
//
// Résultat (dans --sortie) :
//   site.png          la page du site telle qu'elle s'affiche
//   cote-a-cote.png   maquette à gauche, site à droite
//   ecart.png         les pixels différents en rouge sur la maquette assombrie
//   et dans la console : le pourcentage de pixels différents.
//
// Objectif : moins de 3 % d'écart sur chaque page (les données réelles et les polices
// expliquent le reste). Au-delà, ouvrir ecart.png, corriger les zones rouges, recommencer.
//
// Dépendance unique : playwright (`npm i -D playwright && npx playwright install chromium`).

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage : node comparer.mjs <url> <reference.png> [--largeur N] [--attente MS] [--connecte] [--local JSON] [--sortie DIR]');
  process.exit(1);
}
const [url, refPath] = args;
const opt = (name, def) => { const i = args.indexOf(name); return i > -1 ? args[i + 1] : def; };
const has = (name) => args.includes(name);
const outDir = opt('--sortie', 'comparaison');
const wait = Number(opt('--attente', 3000));
fs.mkdirSync(outDir, { recursive: true });

const refB64 = fs.readFileSync(refPath).toString('base64');
const browser = await chromium.launch();
const tool = await browser.newPage();

// Taille de la référence
await tool.setContent('<img id="r">');
const refSize = await tool.evaluate(async (b64) => {
  const img = document.getElementById('r'); img.src = 'data:image/png;base64,' + b64; await img.decode();
  return { w: img.naturalWidth, h: img.naturalHeight };
}, refB64);
const width = Number(opt('--largeur', refSize.w));

// Capture du site
const ctx = await browser.newContext({ viewport: { width, height: 900 } });
const local = {};
if (has('--connecte')) {
  local.chest_account_token = 'comparaison-visuelle';
  local.chest_account_user = JSON.stringify({ firstName: 'Morgan', email: 'morgan@exemple.fr', isAdmin: true, plan: 'premium', access: { active: true } });
}
Object.assign(local, JSON.parse(opt('--local', '{}')));
await ctx.addInitScript((kv) => { try { for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v); } catch (e) {} }, local);
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(wait);
const h = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
await page.setViewportSize({ width, height: Math.min(Math.max(h, refSize.h), 8000) });
await page.waitForTimeout(600);
const sitePath = path.join(outDir, 'site.png');
await page.screenshot({ path: sitePath, animations: 'disabled' });
const siteB64 = fs.readFileSync(sitePath).toString('base64');

// Comparaison pixel par pixel dans le navigateur (aucune autre dépendance)
await tool.setContent('<canvas id="c"></canvas>');
const res = await tool.evaluate(async ({ refB64, siteB64 }) => {
  const load = async (b64) => { const i = new Image(); i.src = 'data:image/png;base64,' + b64; await i.decode(); return i; };
  const [a, b] = await Promise.all([load(refB64), load(siteB64)]);
  const W = Math.max(a.naturalWidth, b.naturalWidth), H = Math.max(a.naturalHeight, b.naturalHeight);
  const px = (img) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, W, H); x.drawImage(img, 0, 0); return x.getImageData(0, 0, W, H); };
  const A = px(a), B = px(b);
  const out = new ImageData(W, H);
  let diff = 0;
  for (let i = 0; i < A.data.length; i += 4) {
    const d = Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]);
    if (d > 48) { diff++; out.data[i] = 255; out.data[i + 1] = 40; out.data[i + 2] = 60; out.data[i + 3] = 255; }
    else { const g = (A.data[i] + A.data[i + 1] + A.data[i + 2]) / 9; out.data[i] = g; out.data[i + 1] = g; out.data[i + 2] = g; out.data[i + 3] = 255; }
  }
  const c1 = document.createElement('canvas'); c1.width = W; c1.height = H; c1.getContext('2d').putImageData(out, 0, 0);
  const c2 = document.createElement('canvas'); c2.width = W * 2 + 20; c2.height = H; const x2 = c2.getContext('2d');
  x2.fillStyle = '#222'; x2.fillRect(0, 0, c2.width, H); x2.drawImage(a, 0, 0); x2.drawImage(b, W + 20, 0);
  return { pct: diff / (W * H) * 100, W, H, ecart: c1.toDataURL('image/png'), cote: c2.toDataURL('image/png') };
}, { refB64, siteB64 });
fs.writeFileSync(path.join(outDir, 'ecart.png'), Buffer.from(res.ecart.split(',')[1], 'base64'));
fs.writeFileSync(path.join(outDir, 'cote-a-cote.png'), Buffer.from(res.cote.split(',')[1], 'base64'));
await browser.close();

console.log(`Écart : ${res.pct.toFixed(2)} % des pixels (${res.W}×${res.H})`);
console.log(res.pct < 3 ? 'OK — la page suit la maquette.' : 'À corriger — ouvrir ' + path.join(outDir, 'ecart.png') + ' (zones rouges).');
