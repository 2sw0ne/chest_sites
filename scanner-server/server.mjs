// Service de calcul des scanners (privé). Le code Pine ne sort jamais d'ici : seul le modèle calculé est renvoyé.
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname, normalize, isAbsolute } from "node:path";
import { PineEngine } from "@luxalgo/vela-pinets";

const PORT = Number(process.env.PORT || 8787);
const SCRIPTS_DIR = process.env.SCRIPTS_DIR || "/data/scripts";
const TD_KEY = process.env.TWELVE_DATA_API_KEY || "";
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || "";
const MAX_RESTORE_BYTES = 20 * 1024 * 1024;

// ---- Bougies : Twelve Data (même filtre que site/js/scanner-chart.js) ----
async function fetchCandles() {
  if (!TD_KEY) throw new Error("clé de bougies non configurée");
  const qs = new URLSearchParams({ symbol: "XAU/USD", interval: "5min", outputsize: "5000", timezone: "UTC", apikey: TD_KEY });
  const res = await fetch(`https://api.twelvedata.com/time_series?${qs}`);
  const json = await res.json();
  if (!res.ok || json.status === "error" || !Array.isArray(json.values)) throw new Error("bougies indisponibles");
  return json.values
    .map((v) => ({ time: Date.parse(v.datetime.replace(" ", "T") + "Z"), open: +v.open, high: +v.high, low: +v.low, close: +v.close, volume: 0 }))
    .sort((a, b) => a.time - b.time);
}
function isTradableBar(c) {
  if (c.open === c.high && c.high === c.low && c.low === c.close) return false;
  const d = new Date(c.time);
  const day = d.getUTCDay(), h = d.getUTCHours();
  if (day === 6) return false;
  if (day === 0 && h < 22) return false;
  if (day === 5 && h >= 22) return false;
  if (h === 21) return false;
  return true;
}
let candleSet = null;
let candleSetAt = 0;
const cache = new Map();
async function loadCandles() {
  // Cache 5 min : évite de consommer le quota Twelve Data à chaque clic
  if (!candleSet || Date.now() - candleSetAt > 5 * 60 * 1000) {
    const all = await fetchCandles();
    candleSet = { all, bars: all.filter(isTradableBar) };
    candleSetAt = Date.now();
    cache.clear();
  }
  return candleSet;
}

// ---- Préparation des sources (ports fidèles de scanner-chart.js) ----
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

// ---- Exécution ----
const engine = new PineEngine();
function safePath(rel) {
  const p = normalize(join(SCRIPTS_DIR, rel));
  if (isAbsolute(rel) || !p.startsWith(normalize(SCRIPTS_DIR))) throw new Error("chemin refusé");
  return p;
}
function loadManifest() {
  const f = join(SCRIPTS_DIR, "manifest.json");
  if (!existsSync(f)) throw new Error("manifeste absent");
  return JSON.parse(readFileSync(f, "utf8"));
}
// Le navigateur ne reçoit ni paramètres d'entrée ni props du script (menu des réglages désactivé)
function sanitizeModel(m) {
  const { inputs, inputValues, props, propValues, ...rest } = m;
  return rest;
}
async function runOne(path, isMain, all, bars) {
  let src = readFileSync(path, "utf8");
  if (isMain) src = injectHtfStates(injectMa500Len(src), all, bars);
  const prepared = await engine.prepare(src, path);
  return new Promise((resolve, reject) => {
    engine.execute({ prepared, market: { symbol: "XAUUSD", timeframe: "5" }, bars, mode: "static" }, {
      onModel: (m) => resolve(sanitizeModel(m)),
      onError: (e) => reject(e),
    });
  });
}
async function compute(name) {
  if (cache.has(name)) return cache.get(name);
  const files = loadManifest()[name];
  if (!Array.isArray(files) || !files.length) throw new Error("scanner inconnu");
  const { all, bars } = await loadCandles();
  const models = [];
  for (const f of files) models.push(await runOne(safePath(f), f === files[0], all, bars));
  const out = { bars, models };
  cache.set(name, out);
  return out;
}

// ---- Restauration (appelée par accounts-bridge, admin) ----
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_RESTORE_BYTES) { reject(new Error("trop volumineux")); req.destroy(); }
      else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); };
  try {
    if (url.pathname === "/health") return send(200, { ok: true });
    if (url.pathname === "/data" && req.method === "GET") {
      return send(200, await compute(url.searchParams.get("script") || ""));
    }
    if (url.pathname === "/restore" && req.method === "POST") {
      if (!INTERNAL_SECRET || req.headers["x-internal-secret"] !== INTERNAL_SECRET) return send(401, { error: "non autorisé" });
      const body = JSON.parse(await readBody(req));
      if (!body || typeof body.files !== "object" || typeof body.manifest !== "object") return send(400, { error: "format invalide" });
      mkdirSync(SCRIPTS_DIR, { recursive: true });
      for (const [rel, text] of Object.entries(body.files)) {
        const p = safePath(rel);
        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, String(text), "utf8");
      }
      writeFileSync(join(SCRIPTS_DIR, "manifest.json"), JSON.stringify(body.manifest), "utf8");
      cache.clear();
      candleSet = null;
      return send(200, { ok: true, files: Object.keys(body.files).length, scanners: Object.keys(body.manifest) });
    }
    return send(404, { error: "introuvable" });
  } catch (e) {
    return send(500, { error: "scanner en attente" });
  }
}).listen(PORT, () => console.log(`scanner-server sur le port ${PORT}`));
