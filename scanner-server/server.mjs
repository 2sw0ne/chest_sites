// Service de calcul des scanners (privé). Le code Pine ne sort jamais d'ici : seul le modèle calculé
// (et la liste des opportunités détectées) est renvoyé. Le calcul Pine tourne dans scan-worker.mjs,
// pour ne jamais bloquer les requêtes HTTP.
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname, normalize, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const SCRIPTS_DIR = process.env.SCRIPTS_DIR || "/data/scripts";
const SIGNALS_FILE = process.env.SIGNALS_FILE || join(dirname(SCRIPTS_DIR), "signals.json");
const WATCH_FILE = join(dirname(SIGNALS_FILE), "watch.json");
const TD_KEY = process.env.TWELVE_DATA_API_KEY || "";
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || "";
const ACCOUNTS_URL = (process.env.ACCOUNTS_INTERNAL_URL || "http://localhost:8080").replace(/\/$/, "");
const MAX_BODY = 2 * 1024 * 1024;
const MAX_RESTORE_BYTES = 20 * 1024 * 1024;

const TF_INTERVAL = { "1": "1min", "5": "5min", "15": "15min", "30": "30min", "60": "1h", "240": "4h", "D": "1day" };
const TF_MS = { "1": 60e3, "5": 300e3, "15": 900e3, "30": 1800e3, "60": 3600e3, "240": 14400e3, "D": 86400e3 };
const CANDLE_TTL = 5 * 60 * 1000;
const SCAN_DELAY = 20 * 1000; // délai après la clôture d'une bougie avant de la lire
const WATCH_TTL = 24 * 60 * 60 * 1000;
const OPPORTUNITY_WINDOW = 48 * 60 * 60 * 1000;

const toTdSymbol = (code) => (code.length === 6 ? code.slice(0, 3) + "/" + code.slice(3) : code);
const validCode = (c) => /^[A-Z]{6}$/.test(c);

// ---------------- Calcul Pine : un processus par calcul (mémoire rendue à chaque fois) ----------------
import { spawn } from "node:child_process";
let calculsCount = 0;
function runInChild(files, all, bars, wantModels, code, tf) {
  calculsCount++;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--max-old-space-size=384", join(here, "scan-worker.mjs")], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (c) => { out += c; });
    child.stderr.on("data", () => { /* journal du calcul : ignoré */ });
    const timer = setTimeout(() => child.kill("SIGKILL"), 120 * 1000);
    child.on("close", () => {
      clearTimeout(timer);
      try {
        const r = JSON.parse(out);
        if (r.ok) resolve(r); else reject(new Error(r.error || "calcul impossible"));
      } catch (e) {
        reject(new Error("calcul interrompu"));
      }
    });
    child.stdin.end(JSON.stringify({ files, all, bars, wantModels, code, tf }));
  });
}

// ---------------- Bougies (Twelve Data, même filtre que le site) ----------------
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
const candleCache = new Map(); // "CODE|TF" -> {at, all, bars}
async function getCandles(code, tf) {
  const key = code + "|" + tf;
  const hit = candleCache.get(key);
  if (hit && Date.now() - hit.at < CANDLE_TTL) return hit;
  if (!TD_KEY) throw new Error("clé de bougies non configurée");
  const qs = new URLSearchParams({ symbol: toTdSymbol(code), interval: TF_INTERVAL[tf], outputsize: "5000", timezone: "UTC", apikey: TD_KEY });
  const res = await fetch(`https://api.twelvedata.com/time_series?${qs}`);
  const json = await res.json();
  if (!res.ok || json.status === "error" || !Array.isArray(json.values)) throw new Error("bougies indisponibles");
  const now = Date.now();
  const all = json.values
    .map((v) => ({ time: Date.parse(v.datetime.replace(" ", "T") + "Z"), open: +v.open, high: +v.high, low: +v.low, close: +v.close, volume: 0 }))
    .filter((c) => c.time + TF_MS[tf] <= now) // bougie en cours exclue : une alerte ne vaut que sur bougie fermée
    .sort((a, b) => a.time - b.time);
  const out = { at: now, all, bars: all.filter(isTradableBar) };
  candleCache.set(key, out);
  return out;
}

// ---------------- Scripts ----------------
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
// Calcul d'un scanner pour une paire et une unité de temps (sans cache : la mémoire compte)
async function runScanner(name, code, tf, wantModels) {
  const files = loadManifest()[name];
  if (!Array.isArray(files) || !files.length) throw new Error("scanner inconnu");
  const { all, bars } = await getCandles(code, tf);
  const r = await runInChild(files.map(safePath), all, bars, wantModels, code, tf);
  return { bars, models: r.models || [], alerts: r.alerts || [], levels: r.levels || null };
}
// Modèles pour l'affichage : cache court et borné
const modelCache = new Map(); // "scanner|CODE|TF" -> {at, out}
const MODEL_CACHE_MAX = 2;
async function scannerModels(name, code, tf) {
  const key = `${name}|${code}|${tf}`;
  const hit = modelCache.get(key);
  if (hit && Date.now() - hit.at < CANDLE_TTL) return hit.out;
  const out = await runScanner(name, code, tf, true);
  modelCache.set(key, { at: Date.now(), out });
  while (modelCache.size > MODEL_CACHE_MAX) modelCache.delete(modelCache.keys().next().value);
  return out;
}

// ---------------- Opportunités (alertes BUY / SELL) ----------------
function sideOf(a) {
  const t = `${a.title} ${a.message}`;
  if (/pullback|r[ée]action|[ée]tape [23]/i.test(t)) return null;
  if (/\b(BUY|LONG)\b|UT Long|haussi/i.test(t)) return "buy";
  if (/\b(SELL|SHORT)\b|UT Short|baissi/i.test(t)) return "sell";
  return null;
}
let SIGNALS = [];
try { if (existsSync(SIGNALS_FILE)) SIGNALS = JSON.parse(readFileSync(SIGNALS_FILE, "utf8")); } catch (e) { SIGNALS = []; }
function saveSignals() {
  try { writeFileSync(SIGNALS_FILE, JSON.stringify(SIGNALS), "utf8"); } catch (e) { /* volume absent en local : sans gravité */ }
}
const WATCH = new Map(); // "CODE|TF" -> {touched, lastBar, keep}
try {
  if (existsSync(WATCH_FILE)) for (const [k, v] of Object.entries(JSON.parse(readFileSync(WATCH_FILE, "utf8")))) WATCH.set(k, { ...v, touched: Date.now() });
} catch (e) { /* rien à relancer */ }
function saveWatch() {
  try { writeFileSync(WATCH_FILE, JSON.stringify(Object.fromEntries([...WATCH].filter(([, w]) => w.keep)))); } catch (e) { /* volume absent en local */ }
}
const WATERMARK = new Map(); // "scanner|CODE|TF" -> dernière alerte déjà traitée (ms)

async function dispatch(sig) {
  if (!INTERNAL_SECRET) return;
  try {
    await fetch(ACCOUNTS_URL + "/alerts/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Secret": INTERNAL_SECRET },
      body: JSON.stringify(sig),
    });
  } catch (e) { /* accounts-bridge injoignable : l'opportunité reste visible dans le panneau */ }
}

async function scanCombo(code, tf) {
  const names = Object.keys(loadManifest());
  const now = Date.now();
  for (const name of names) {
    let res;
    try { res = await runScanner(name, code, tf, false); } catch (e) { continue; }
    const alerts = res.alerts;
    // Niveaux du dernier trade : rattachés à l'opportunité la plus récente de ce scanner
    const lastTime = Math.max(-Infinity, ...alerts.filter((a) => sideOf(a) && typeof a.time === "number").map((a) => a.time));
    const key = `${name}|${code}|${tf}`;
    const known = WATERMARK.has(key);
    let wm = WATERMARK.get(key) ?? -Infinity;
    for (const a of alerts) {
      const side = sideOf(a);
      if (!side || typeof a.time !== "number") continue;
      if (a.time < now - OPPORTUNITY_WINDOW) continue;
      const id = `${name}|${code}|${tf}|${a.time}`;
      if (!SIGNALS.some((s) => s.id === id)) {
        const sig = { id, scanner: name, symbol: code, tf, side, time: a.time, seenAt: now };
        if (a.time === lastTime && res.levels) sig.levels = res.levels;
        SIGNALS.push(sig);
        // Notification uniquement pour une alerte NOUVELLE, sur un combo déjà suivi (jamais au premier calcul)
        if (known && a.time > wm) dispatch(sig);
      }
      if (a.time > wm) wm = a.time;
    }
    WATERMARK.set(key, wm);
  }
  SIGNALS = SIGNALS.filter((s) => s.time >= now - OPPORTUNITY_WINDOW);
  saveSignals();
}

// Le moteur ne sort les alertes que pour la dernière bougie : on calcule une fois par bougie fermée
setInterval(async () => {
  const now = Date.now();
  for (const [k, w] of WATCH) {
    if (!w.keep && now - w.touched > WATCH_TTL) { WATCH.delete(k); continue; }
    const [code, tf] = k.split("|");
    const closedStart = Math.floor(now / TF_MS[tf]) * TF_MS[tf] - TF_MS[tf];
    if (now - (closedStart + TF_MS[tf]) < SCAN_DELAY) continue;
    if (w.lastBar === closedStart) continue;
    w.lastBar = closedStart;
    candleCache.delete(k);
    try { await scanCombo(code, tf); } catch (e) { /* bougies indisponibles : on réessaiera au prochain tour */ }
  }
}, 15 * 1000);

// ---------------- HTTP ----------------
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(new Error("trop volumineux")); req.destroy(); }
      else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
const isInternal = (req) => INTERNAL_SECRET && req.headers["x-internal-secret"] === INTERNAL_SECRET;

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); };
  try {
    if (url.pathname === "/health") {
      return send(200, { ok: true, rssMB: Math.round(process.memoryUsage().rss / 1048576), models: modelCache.size, watching: WATCH.size, calculs: calculsCount });
    }

    if (url.pathname === "/data" && req.method === "GET") {
      const name = url.searchParams.get("script") || "";
      const code = (url.searchParams.get("symbol") || "XAUUSD").toUpperCase();
      const tf = url.searchParams.get("tf") || "5";
      if (!validCode(code) || !TF_INTERVAL[tf]) return send(400, { error: "paramètres invalides" });
      const r = await scannerModels(name, code, tf);
      return send(200, { bars: r.bars, models: r.models });
    }

    // Opportunités d'une paire et d'une unité de temps : dernière apparition par scanner
    if (url.pathname === "/signals" && req.method === "GET") {
      const code = (url.searchParams.get("symbol") || "").toUpperCase();
      const tf = url.searchParams.get("tf") || "";
      if (!validCode(code) || !TF_INTERVAL[tf]) return send(400, { error: "paramètres invalides" });
      const key = `${code}|${tf}`;
      const isNew = !WATCH.has(key);
      const curBar = Math.floor(Date.now() / TF_MS[tf]) * TF_MS[tf] - TF_MS[tf];
      WATCH.set(key, { touched: Date.now(), lastBar: isNew ? curBar : WATCH.get(key).lastBar, keep: WATCH.get(key)?.keep || false });
      if (isNew) scanCombo(code, tf).catch(() => {});
      const latest = new Map();
      for (const s of SIGNALS) {
        if (s.symbol !== code || s.tf !== tf) continue;
        const prev = latest.get(s.scanner);
        if (!prev || s.time > prev.time) latest.set(s.scanner, s);
      }
      const opportunities = [...latest.values()].sort((a, b) => b.time - a.time).map(({ id, seenAt, ...rest }) => rest);
      return send(200, { opportunities });
    }

    // Combos à suivre en permanence (paires et unités de temps des règles de notification)
    if (url.pathname === "/watch" && req.method === "POST") {
      if (!isInternal(req)) return send(401, { error: "non autorisé" });
      const body = JSON.parse(await readBody(req, MAX_BODY));
      for (const c of body.combos || []) {
        if (!validCode(c.symbol) || !TF_INTERVAL[c.tf]) continue;
        const k = `${c.symbol}|${c.tf}`;
        WATCH.set(k, { touched: Date.now(), lastBar: WATCH.get(k)?.lastBar, keep: true });
      }
      saveWatch();
      return send(200, { ok: true, watching: WATCH.size });
    }

    if (url.pathname === "/restore" && req.method === "POST") {
      if (!isInternal(req)) return send(401, { error: "non autorisé" });
      const body = JSON.parse(await readBody(req, MAX_RESTORE_BYTES));
      if (!body || typeof body.files !== "object" || typeof body.manifest !== "object") return send(400, { error: "format invalide" });
      mkdirSync(SCRIPTS_DIR, { recursive: true });
      for (const [rel, text] of Object.entries(body.files)) {
        const p = safePath(rel);
        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, String(text), "utf8");
      }
      writeFileSync(join(SCRIPTS_DIR, "manifest.json"), JSON.stringify(body.manifest), "utf8");
      modelCache.clear();
      candleCache.clear();
      return send(200, { ok: true, files: Object.keys(body.files).length, scanners: Object.keys(body.manifest) });
    }
    return send(404, { error: "introuvable" });
  } catch (e) {
    console.error("erreur:", String((e && e.message) || e).slice(0, 300));
    return send(500, { error: "scanner en attente" });
  }
}).listen(PORT, () => console.log(`scanner-server sur le port ${PORT}`));
