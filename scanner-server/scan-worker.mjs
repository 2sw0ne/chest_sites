// Calcul d'UN scanner, en processus séparé (lancé par server.mjs, qui le termine ensuite).
// Pourquoi un processus et non un thread : le moteur Pine garde de la mémoire hors du tas Node,
// que les limites de thread ne contrôlent pas. Un processus qui se termine libère tout.
// Entrée (stdin, JSON) : { files: [chemins absolus], all: [bougies], bars: [bougies filtrées], wantModels }
// Sortie (stdout, JSON) : { ok, alerts, models? }. Le code Pine ne sort jamais de ce processus.
import { readFileSync } from "node:fs";
import { PineEngine } from "@luxalgo/vela-pinets";

function injectMa500Len(source) {
  return source.replace("__WOLFX_MA500_LEN__", String(Math.max(2, Math.round(500 * 3))));
}
function htfStates(allBars, minutes, emaLen, smaLen) {
  const close = new Map(), order = [];
  for (const c of allBars) {
    const b = Math.floor(c.time / (minutes * 60000));
    if (!close.has(b)) order.push(b);
    close.set(b, c.close);
  }
  const a = 2 / (emaLen + 1), out = new Map(), last = [];
  let e = null;
  for (const b of order) {
    const cl = close.get(b);
    e = e === null ? cl : a * cl + (1 - a) * e;
    last.push(cl);
    if (last.length > smaLen) last.shift();
    const sma = last.length >= smaLen ? last.reduce((s, x) => s + x, 0) / smaLen : null;
    out.set(b, sma === null ? 0 : (e > sma ? 1 : e < sma ? -1 : 0));
  }
  return out;
}
function injectHtfStates(source, allBars, barsOut) {
  if (!source.includes("__HTF_STATES__")) return source;
  const lenOf = (name, def) => { const m = source.match(new RegExp(name + "[ ]*=[ ]*input[.]int[(][ ]*([0-9]+)")); return m ? parseInt(m[1], 10) : def; };
  const emaLen = lenOf("lenEma", 4), smaLen = lenOf("lenSma", 10);
  const mins = [240, 60, 30, 15];
  const maps = mins.map((m) => htfStates(allBars, m, emaLen, smaLen));
  const st = barsOut.map((c) => maps.map((mp, i) => mp.get(Math.floor(c.time / (mins[i] * 60000))) ?? 0));
  const lines = ["hs4", "hs1", "hs30", "hs15"].map((n, i) => `var float[] ${n} = array.from(${st.map((r) => r[i]).join(", ")})`);
  return source.replace("__HTF_STATES__", lines.join("\n"));
}
// Ne jamais renvoyer les paramètres d'entrée ni les props du script
function sanitizeModel(m) {
  const { inputs, inputValues, props, propValues, ...rest } = m;
  return rest;
}

// Infos du symbole (tick, échelle) : le moteur Pine les lit pour syminfo.mintick (ex. tampons en ticks)
function symbolInfoFor(code) {
  const base = code.slice(0, 3), quote = code.slice(3);
  const isForex = /^[A-Z]{6}$/.test(code) && !["XAU", "XAG", "XPT", "BTC", "ETH"].includes(base);
  let mintick = 0.01;
  if (isForex) mintick = quote === "JPY" ? 0.001 : 0.00001;
  else if (base === "XAG") mintick = 0.001;
  return {
    ticker: code, tickerid: code, main_tickerid: code, description: code, prefix: "", root: code,
    type: isForex ? "forex" : "commodity", basecurrency: base, currency: quote, timezone: "UTC", session: "regular",
    mintick, minmove: 1, pointvalue: 1, pricescale: Math.round(1 / mintick),
  };
}

async function runOne(engine, path, isMain, all, bars, code, tf) {
  let src = readFileSync(path, "utf8");
  if (isMain) src = injectHtfStates(injectMa500Len(src), all, bars);
  const prepared = await engine.prepare(src, path);
  return new Promise((resolve, reject) => {
    const alerts = [];
    engine.execute({ prepared, market: { symbol: code, timeframe: tf, symbolInfo: symbolInfoFor(code) }, bars, mode: "static" }, {
      onAlert: (a) => {
        // Vela-pinets range titre et message dans `title` (objet { title, message }) : on les normalise
        const t = a.title && typeof a.title === "object" ? a.title : { title: a.title, message: a.message };
        alerts.push({ title: String(t.title || ""), message: String(t.message || ""), time: a.time });
      },
      onModel: (m) => resolve({ model: sanitizeModel(m), alerts }),
      onError: (e) => reject(e),
    });
  });
}

// Niveaux du dernier trade, lus dans les étiquettes de CHAQUE script : chaque scanner a ses règles.
// Une étiquette donne son prix de deux façons : écrit dans son texte ("PE (4130.17)", "Exit 1: 4156.16",
// "Target Zone 1\n4111.30"), ou porté par son ancre quand le texte n'est qu'un nom ("BUY", "-3", "S0").
// Les plus récentes l'emportent. Renvoie { pe, sl, tps, tp } ou null si aucun trade n'est affiché.
const labelsOf = (models) => models.flatMap((m) => (m.labels || []).map((l) => ({ text: String(l.text || "").trim(), y: Number(l.y), style: l.style })));
// Dernière étiquette dont le texte vérifie re : { m (correspondance), y (ancre), style }
function lastMatch(L, re) {
  for (let i = L.length - 1; i >= 0; i--) {
    const m = L[i].text.match(re);
    if (m) return { m, y: L[i].y, style: L[i].style };
  }
  return null;
}
// Prix écrit dans le texte de la dernière étiquette correspondante (1er groupe de capture)
const textPrice = (L, re) => { const r = lastMatch(L, re); return r ? Number(r.m[1]) : null; };
// Ancre de la dernière étiquette dont le texte est exactement name
function anchorOf(L, name) {
  for (let i = L.length - 1; i >= 0; i--) if (L[i].text === name) return L[i].y;
  return null;
}
// Séries TP1, TP2… lues dans le texte, jusqu'à la première absente
function seriesOf(L, patron) {
  const out = [];
  for (let n = 1; n <= 9; n++) {
    const v = textPrice(L, patron(n));
    if (v == null) break;
    out.push(v);
  }
  return out;
}
// Étiquettes "NOM (prix)" : SWYPER, Wave, Stars, Pulse
const paren = (L, name) => textPrice(L, new RegExp(`^${name} \\((-?[0-9.]+)\\)$`));
const parenTps = (L) => seriesOf(L, (n) => new RegExp(`^TP${n} \\((-?[0-9.]+)\\)$`));
// Pivots : PE = étiquette BUY/SELL, posée à l'entrée. SL = 2e zone sous l'entrée (BUY) ou au-dessus (SELL).
// TP = S0 pour un BUY, R8 pour un SELL (version hebdomadaire en repli).
function pivotLevels(L) {
  const side = lastMatch(L, /^(BUY|SELL)$/);
  if (!side) return {};
  const pe = side.y;
  const ladder = new Map(); // dernière valeur de chaque niveau R7…S0, -1…-3
  for (const l of L) if (/^(R[0-9]|P[0-9]|S[0-9]|-[0-9])$/.test(l.text)) ladder.set(l.text, l.y);
  const buy = side.m[1] === "BUY";
  const ys = [...ladder.values()];
  const zones = buy ? ys.filter((y) => y < pe).sort((a, b) => b - a) : ys.filter((y) => y > pe).sort((a, b) => a - b);
  const tp = buy ? anchorOf(L, "S0") ?? anchorOf(L, "S0 (Weekly)") : anchorOf(L, "R8") ?? anchorOf(L, "R8 (Weekly)");
  return { pe, sl: zones[1] ?? null, tps: tp != null ? [tp] : [], side: buy ? "buy" : "sell" };
}
const RULES = {
  // "BUY" / "SELL" (et "BUY+" / "SELL+") : étiquette posée au prix d'entrée, aucun autre niveau
  algomni: (L) => {
    const r = lastMatch(L, /^(BUY|SELL)\+?$/);
    return { pe: r?.y ?? null, side: r ? (r.m[1] === "BUY" ? "buy" : "sell") : null };
  },
  "swyper-v6": (L) => ({ pe: paren(L, "PE"), sl: paren(L, "SL"), tps: parenTps(L) }),
  wave: (L) => ({ pe: paren(L, "PE"), sl: paren(L, "SL"), tps: parenTps(L) }),
  stars: (L) => ({ pe: paren(L, "PE"), sl: paren(L, "SL"), tps: parenTps(L) }),
  // Pulse n'affiche que le macro : entrée et sens (flèche haut/bas), pas de SL ni de TP
  pulse: (L) => {
    const r = lastMatch(L, /^[▲▼]?\s*PE \((-?[0-9.]+)\)$/);
    return { pe: r ? Number(r.m[1]) : null, side: r ? (r.style === "arrowup" ? "buy" : r.style === "arrowdown" ? "sell" : null) : null };
  },
  nexus: (L) => ({
    pe: textPrice(L, /^Opportunity Zone\s*\n\s*(-?[0-9.]+)$/),
    sl: textPrice(L, /^Invalidation Zone\s*\n\s*(-?[0-9.]+)$/),
    tps: [textPrice(L, /^Target Zone 1\s*\n\s*(-?[0-9.]+)$/), textPrice(L, /^Target Zone 2\s*\n\s*(-?[0-9.]+)$/)],
  }),
  harmonics: (L) => {
    const tps = [];
    for (let n = 1; n <= 9 && anchorOf(L, `Exit ${n}`) != null; n++) tps.push(anchorOf(L, `Exit ${n}`));
    return { pe: anchorOf(L, "Entry"), sl: anchorOf(L, "Invalidation"), tps };
  },
  blood: (L) => ({
    pe: textPrice(L, /^Entry:\s*(-?[0-9.]+)$/),
    sl: textPrice(L, /^Invalidation:\s*(-?[0-9.]+)$/),
    tps: seriesOf(L, (n) => new RegExp(`^Exit ${n}:\\s*(-?[0-9.]+)$`)),
  }),
  pivot: pivotLevels,
  // WOLF : étiquettes "Entry Zone: x", "Invalid Level: x", "TP1: x"… (dernier trade affiché)
  wolfx: (L) => ({
    pe: textPrice(L, /^Entry Zone:\s*(-?[0-9.]+)$/),
    sl: textPrice(L, /^Invalid Level:\s*(-?[0-9.]+)$/),
    tps: seriesOf(L, (n) => new RegExp(`^TP${n}:\\s*(-?[0-9.]+)$`)),
  }),
  // Supernova : PE, SL (dernier pivot ZigZag qui a armé le signal) et TP1 (3R) - étiquettes
  // ajoutées pour CHEST, l'original n'affiche que les labels Buy/Sell
  supernova: (L) => ({ pe: paren(L, "PE"), sl: paren(L, "SL"), tps: parenTps(L) }),
};
// Sens du trade : donné explicitement par la règle (étiquette BUY/SELL, flèche) quand elle le sait,
// sinon déduit de la position du stop ou du 1er TP par rapport à l'entrée (SL/TP sous l'entrée = vente).
function inferSide(r) {
  if (r.side) return r.side;
  if (r.pe != null && r.sl != null) return r.sl < r.pe ? "buy" : "sell";
  if (r.pe != null && r.tps && r.tps.length) return r.tps[0] < r.pe ? "sell" : "buy";
  return null;
}
function extractLevels(scanner, models) {
  const L = labelsOf(models);
  const r = (RULES[scanner] || (() => ({})))(L);
  const tps = (r.tps || []).filter((v) => v != null);
  const pe = r.pe ?? null;
  const sl = r.sl ?? null;
  if (pe == null && sl == null && !tps.length) return null;
  return { pe, sl, tps, tp: tps.length ? tps[tps.length - 1] : null, side: inferSide(r) };
}

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => { raw += c; });
process.stdin.on("end", async () => {
  try {
    const input = JSON.parse(raw);
    const engine = new PineEngine();
    const alerts = [], models = [];
    for (let i = 0; i < input.files.length; i++) {
      const r = await runOne(engine, input.files[i], i === 0, input.all, input.bars, input.code, input.tf);
      alerts.push(...r.alerts);
      models.push(r.model); // toujours lus (niveaux du trade), renvoyés seulement si demandé
    }
    // Sortie complète AVANT la fin du processus : sur un tuyau, process.exit() coupait les grosses réponses
    process.stdout.write(JSON.stringify({ ok: true, alerts, levels: extractLevels(input.scanner, models), models: input.wantModels ? models : undefined }), () => process.exit(0));
  } catch (e) {
    process.stdout.write(JSON.stringify({ ok: false, error: String((e && e.message) || e).slice(0, 300) }), () => process.exit(1));
  }
});
