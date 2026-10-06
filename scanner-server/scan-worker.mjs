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

// Niveaux du dernier trade (SL, PE, TP final) lus dans les étiquettes du script, ex. "SL (4114.45)".
// Le TP final = TP3, sinon TP2, sinon TP1. Rien n'est renvoyé si le script n'affiche pas de trade.
function extractLevels(models) {
  const found = {};
  for (const m of models) {
    for (const l of m.labels || []) {
      const mm = String(l.text || "").match(/^(SL|PE|TP[123])\s*\((-?[0-9.]+)\)$/);
      if (mm) found[mm[1]] = Number(mm[2]);
    }
  }
  if (found.SL === undefined) return null;
  const tp = found.TP3 ?? found.TP2 ?? found.TP1 ?? null;
  return { sl: found.SL, pe: found.PE ?? null, tp };
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
    process.stdout.write(JSON.stringify({ ok: true, alerts, levels: extractLevels(models), models: input.wantModels ? models : undefined }));
    process.exit(0);
  } catch (e) {
    process.stdout.write(JSON.stringify({ ok: false, error: String((e && e.message) || e).slice(0, 300) }));
    process.exit(1);
  }
});
