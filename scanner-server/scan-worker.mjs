// Thread de calcul : exécute les scripts Pine (calcul synchrone, lourd). Isolé du serveur HTTP
// pour qu'un calcul ne bloque jamais les requêtes des membres. Le code Pine ne quitte jamais ce
// processus : seuls les modèles et les alertes repartent, vers le serveur (jamais vers le navigateur
// tant qu'ils n'ont pas été nettoyés, voir sanitizeModel).
import { parentPort } from "node:worker_threads";
import { readFileSync } from "node:fs";
import { PineEngine } from "@luxalgo/vela-pinets";

const engine = new PineEngine();

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

async function runOne(path, isMain, all, bars) {
  let src = readFileSync(path, "utf8");
  if (isMain) src = injectHtfStates(injectMa500Len(src), all, bars);
  const prepared = await engine.prepare(src, path);
  return new Promise((resolve, reject) => {
    const alerts = [];
    engine.execute({ prepared, market: { symbol: "XAUUSD", timeframe: "5" }, bars, mode: "static" }, {
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

let runs = 0;
parentPort.on("message", async (msg) => {
  try {
    const alerts = [], models = [];
    for (let i = 0; i < msg.files.length; i++) {
      const r = await runOne(msg.files[i], i === 0, msg.all, msg.bars);
      alerts.push(...r.alerts);
      if (msg.wantModels) models.push(r.model);
    }
    parentPort.postMessage({ id: msg.id, ok: true, alerts, models: msg.wantModels ? models : undefined });
  } catch (e) {
    parentPort.postMessage({ id: msg.id, ok: false, error: String((e && e.message) || e).slice(0, 300) });
  }
  // Le moteur garde de la mémoire entre les calculs : on recycle la session régulièrement (voir server.mjs)
  runs++;
});
