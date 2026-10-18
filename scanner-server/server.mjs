// Service de calcul des scanners (privé). Le code Pine ne sort jamais d'ici : seul le modèle calculé
// (et la liste des opportunités détectées) est renvoyé. Le calcul Pine tourne dans scan-worker.mjs,
// pour ne jamais bloquer les requêtes HTTP.
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname, normalize, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { createBoard } from "./board.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const SCRIPTS_DIR = process.env.SCRIPTS_DIR || "/data/scripts";
const SIGNALS_FILE = process.env.SIGNALS_FILE || join(dirname(SCRIPTS_DIR), "signals.json");
const WATCH_FILE = join(dirname(SIGNALS_FILE), "watch.json");
const CREDITS_FILE = join(dirname(SIGNALS_FILE), "credits.json");
const TD_KEY = process.env.TWELVE_DATA_API_KEY || "";
// Compte Twelve Data SÉPARÉ pour la boucle d'alarme (2026-10-13, demande utilisateur : "le système
// d'alarme pourrait être indépendant des scanners avec un autre compte") : ouvrir un scanner par
// simple curiosité partageait jusqu'ici le MÊME quota que la surveillance en fond qui détecte les
// vrais trades - un coup d'œil pouvait donc affamer l'alarme pour le reste de la journée. Avec une
// clé dédiée, la boucle setInterval (la vraie "alarme", tourne 24/7 qu'on regarde ou non) ne dépend
// plus jamais de la consultation ponctuelle des graphiques (/data, /signals), et vice-versa. Repli
// sur TD_KEY si la variable n'est pas encore définie, pour ne jamais casser l'alarme en attendant.
const TD_KEY_ALARM = process.env.TWELVE_DATA_API_KEY_ALARM || TD_KEY;
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || "";
const ACCOUNTS_URL = (process.env.ACCOUNTS_INTERNAL_URL || "http://localhost:8080").replace(/\/$/, "");
const MAX_BODY = 2 * 1024 * 1024;
const MAX_RESTORE_BYTES = 20 * 1024 * 1024;

const TF_INTERVAL = { "1": "1min", "5": "5min", "15": "15min", "30": "30min", "60": "1h", "240": "4h", "D": "1day" };
const TF_MS = { "1": 60e3, "5": 300e3, "15": 900e3, "30": 1800e3, "60": 3600e3, "240": 14400e3, "D": 86400e3 };
// BUG RÉEL (2026-10-13, retour utilisateur : "les scanners sont encore en attente" - budget Twelve
// Data épuisé en quelques heures, 3 jours de suite). Cause confirmée via /health en prod
// (twelveDataCredits: budget 700, used 700) : un TTL fixe de 5 min, identique pour TOUTES les unités
// de temps, force un refetch (1 crédit) toutes les 5 min pour CHAQUE combo surveillé/consulté -
// y compris H4/D1, dont une bougie ne change tout simplement pas assez vite pour justifier un
// refresh aussi fréquent. TTL maintenant proportionnel à la durée de la bougie elle-même (la moitié,
// plancher 5 min) : H1 -> 30 min, H4 -> 2h, D1 -> 12h au lieu de 5 min partout - réduit fortement la
// consommation sur les unités de temps lentes, sans toucher M1/M5/M15 (déjà au plancher, la
// fraîcheur y reste nécessaire pour détecter un signal à temps).
function candleTtl(tf) { return Math.max(5 * 60 * 1000, (TF_MS[tf] || 0) / 2); }
const SCAN_DELAY = 20 * 1000; // délai après la clôture d'une bougie avant de la lire
// BUG RÉEL (2026-10-13, retour utilisateur : "pourquoi ça se limite aussi vite alors que je l'ai
// même pas utilisé ?") : un simple coup d'œil à N'IMPORTE QUEL scanner/paire/unité de temps (même
// sans règle d'alerte) l'inscrit pour 24h de rafraîchissement en arrière-plan (voir /signals plus
// bas, `keep:false`) — réduit à 3h, largement assez pour une session de trading, sans laisser un
// simple coup d'œil continuer à consommer des crédits toute la journée suivante.
const WATCH_TTL = 3 * 60 * 60 * 1000;
const OPPORTUNITY_WINDOW = 48 * 60 * 60 * 1000;

// ---------------- Budget de crédits Twelve Data (2026-10-11, scindé en 2 comptes le 2026-10-13) ----------------
// Jusqu'ici une SEULE clé Twelve Data, partagée avec accounts-bridge (calendar.js, lot-calculator.js) :
// plafond réel 800 crédits/jour par clé (plan Basic gratuit, "8 API (800 a day)" = 8/min, plafonné
// 800/jour - jamais "8 clés"). Avant cette limite, le rescan systématique à chaque clôture de bougie
// pouvait consommer tout le quota à lui seul (retour utilisateur : calendrier "quota atteint").
// Retour utilisateur du 2026-10-13 : un simple coup d'œil à un scanner partageait encore CE MÊME
// quota avec la boucle d'alarme (le vrai système qui doit tourner 24/7 pour détecter les trades) -
// une consultation ponctuelle pouvait donc affamer l'alarme pour le reste de la journée. Deux
// comptes Twelve Data séparés maintenant (TD_KEY pour la consultation à la demande /data+/signals,
// TD_KEY_ALARM pour la boucle de fond setInterval) : chacun son propre budget de 800/jour, aucun des
// deux ne peut plus affamer l'autre. `credits` garde une entrée par source ('view'/'alarm').
// "view" reste conservateur (550/800) : cette clé reste partagée avec accounts-bridge (calendar.js,
// lot-calculator.js). "alarm" peut aller bien plus haut (780/800) : c'est un compte Twelve Data
// dédié, rien d'autre ne le partage.
const DEFAULT_BUDGET = { view: Number(process.env.SCANNER_DAILY_CREDIT_BUDGET || 550), alarm: Number(process.env.SCANNER_DAILY_CREDIT_BUDGET_ALARM || 780) };
function todayKeyUtc() { return new Date().toISOString().slice(0, 10); } // jour calendaire UTC
let credits = { day: todayKeyUtc(), used: { view: 0, alarm: 0 } };
try {
  if (existsSync(CREDITS_FILE)) {
    const saved = JSON.parse(readFileSync(CREDITS_FILE, "utf8"));
    // Ancien format (un seul compteur global, avant le scindage) : migré vers "view" (la source la
    // plus probable de la conso passée), "alarm" repart à 0 avec son propre compte tout neuf.
    if (saved && saved.day === todayKeyUtc()) {
      credits = typeof saved.used === "number"
        ? { day: saved.day, used: { view: saved.used, alarm: 0 } }
        : { day: saved.day, used: { view: saved.used?.view || 0, alarm: saved.used?.alarm || 0 } };
    }
  }
} catch (e) { /* fichier absent/corrompu au premier demarrage : on repart a 0, sans gravite */ }
function saveCredits() {
  try { writeFileSync(CREDITS_FILE, JSON.stringify(credits)); } catch (e) { /* volume absent en local */ }
}
// Remise a zero automatique au changement de jour UTC - verifiee a chaque appel, cout nul, pas
// besoin d'un cron separe.
function resetCreditsIfNewDay() {
  const today = todayKeyUtc();
  if (credits.day !== today) { credits = { day: today, used: { view: 0, alarm: 0 } }; saveCredits(); }
}
function creditsRemaining(source) { resetCreditsIfNewDay(); return DEFAULT_BUDGET[source] - credits.used[source]; }
// Incrementee AVANT l'appel reseau (jamais apres) : en cas d'erreur Twelve Data (reseau, 429...) on
// prefere compter un credit de trop plutot que risquer d'en compter un de moins et depasser le
// budget reserve - l'objectif est de ne JAMAIS le depasser, pas d'etre pile dessus a l'unite pres.
function spendCredit(source) { resetCreditsIfNewDay(); credits.used[source] += 1; saveCredits(); }

const toTdSymbol = (code) => (code.length === 6 ? code.slice(0, 3) + "/" + code.slice(3) : code);
const validCode = (c) => /^[A-Z]{6}$/.test(c);

// ---------------- Calcul Pine : un processus par calcul (mémoire rendue à chaque fois) ----------------
import { spawn } from "node:child_process";
let calculsCount = 0;
function runInChild(files, all, bars, wantModels, code, tf, scanner) {
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
    child.stdin.end(JSON.stringify({ files, all, bars, wantModels, code, tf, scanner }));
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
// Un seul cache de bougies partagé par les deux sources : la DONNÉE est identique quelle que soit
// la clé qui l'a payée, donc une bougie déjà récupérée par l'alarme profite gratuitement à une
// consultation qui arrive juste après (et vice-versa) - seul le crédit dépensé pour l'obtenir est
// compté séparément selon qui l'a demandée.
const candleCache = new Map(); // "CODE|TF" -> {at, all, bars}
async function getCandles(code, tf, source) {
  const key = code + "|" + tf;
  const hit = candleCache.get(key);
  if (hit && Date.now() - hit.at < candleTtl(tf)) return hit;
  const tdKey = source === "alarm" ? TD_KEY_ALARM : TD_KEY;
  if (!tdKey) throw new Error("clé de bougies non configurée");
  if (creditsRemaining(source) <= 0) {
    // Budget du jour epuise : on sert la derniere donnee connue (perimee mais honnete, affichee
    // telle quelle) plutot que de risquer de depasser le budget reserve a ce service - jamais
    // d'appel Twelve Data au-dela. Sans donnee du tout, on echoue proprement (deja gere par
    // l'appelant : "bougies indisponibles").
    if (hit) return hit;
    throw new Error(`budget Twelve Data du jour atteint (${source === "alarm" ? "alarme" : "consultation"})`);
  }
  spendCredit(source);
  const qs = new URLSearchParams({ symbol: toTdSymbol(code), interval: TF_INTERVAL[tf], outputsize: "5000", timezone: "UTC", apikey: tdKey });
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

// ---------------- Tableau de force Wolfx (board.mjs) : 3e compte Twelve Data, budget à part ----------------
const BOARD = createBoard({
  file: join(dirname(SIGNALS_FILE), "board.json"),
  key: process.env.TWELVE_DATA_API_KEY_BOARD || "", // jamais de repli sur les autres clés : il ne doit rien leur prendre
  budget: Number(process.env.SCANNER_DAILY_CREDIT_BUDGET_BOARD || 780),
  isTradableBar,
});

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
// source : 'view' (consultation à la demande, /data+/signals) ou 'alarm' (boucle de fond) - decide
// quelle clé/quel budget Twelve Data est débité si une vraie requête est nécessaire.
async function runScanner(name, code, tf, wantModels, source) {
  const files = loadManifest()[name];
  if (!Array.isArray(files) || !files.length) throw new Error("scanner inconnu");
  const { all, bars } = await getCandles(code, tf, source);
  const r = await runInChild(files.map(safePath), all, bars, wantModels, code, tf, name);
  return { bars, models: r.models || [], alerts: r.alerts || [], levels: r.levels || null };
}
// Modèles pour l'affichage : cache court et borné
const modelCache = new Map(); // "scanner|CODE|TF" -> {at, out}
const MODEL_CACHE_MAX = 2;
async function scannerModels(name, code, tf, source) {
  const key = `${name}|${code}|${tf}`;
  const hit = modelCache.get(key);
  if (hit && Date.now() - hit.at < candleTtl(tf)) return hit.out;
  const out = await runScanner(name, code, tf, true, source);
  modelCache.set(key, { at: Date.now(), out });
  while (modelCache.size > MODEL_CACHE_MAX) modelCache.delete(modelCache.keys().next().value);
  return out;
}

// ---------------- Opportunités (achat / vente) ----------------
// L'alerte Pine (alertcondition) ne se déclenche que sur la TOUTE DERNIÈRE bougie calculée : si le
// serveur rate ce passage précis (redémarrage, ralentissement...), le signal est perdu pour toujours,
// même si l'étiquette reste bien visible sur le graphique. Détecté en vrai : Algomni/Wolf/Blood
// affichaient un signal plus récent sur le graphique que celui montré par la carte (2026-10-07).
// On détecte donc l'opportunité autrement : à chaque passage, `levels` (scan-worker.mjs) relit
// l'étiquette ACTUELLE du trade dans l'historique complet des étiquettes (pas seulement la dernière
// bougie) et calcule son sens. Dès que cette identité (sens + prix d'entrée) change par rapport à la
// dernière connue pour ce scanner/paire/unité de temps, c'est un nouveau trade.
let SIGNALS = [];
try { if (existsSync(SIGNALS_FILE)) SIGNALS = JSON.parse(readFileSync(SIGNALS_FILE, "utf8")); } catch (e) { SIGNALS = []; }
// Dernière identité connue ("sens|prix d'entrée") par scanner/paire/unité de temps, pour détecter un
// changement de trade sans jamais redéclencher sur le même trade déjà vu. Reconstruite au démarrage
// à partir des opportunités déjà enregistrées, pour ne pas les re-signaler comme "nouvelles" à froid.
const LAST_TRADE = new Map();
{
  const latestByKey = new Map();
  for (const s of SIGNALS) {
    if (!s.levels || s.side == null || s.levels.pe == null) continue;
    const k = `${s.scanner}|${s.symbol}|${s.tf}`;
    const prev = latestByKey.get(k);
    if (!prev || s.time > prev.time) latestByKey.set(k, s);
  }
  for (const [k, s] of latestByKey) LAST_TRADE.set(k, `${s.side}|${s.levels.pe}`);
}
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

// Finalité d'une opportunité, recalculée à partir des bougies fermées suivant son apparition :
// "active" tant que ni le stop ni un take profit ne sont touchés ; "tpN" dès que le niveau N est
// touché (ne redescend jamais vers un TP inférieur, seulement vers un TP plus loin) ; "sl" si le
// stop est touché avant tout TP. Un stop touché clôt définitivement le trade : il garde le dernier
// TP déjà atteint (ou "sl" si aucun), même si le prix retouche un TP plus loin après coup.
function tradeStatus(side, levels, bars, fromTime) {
  if (!levels) return null;
  const { sl, tps } = levels;
  if (sl == null && (!tps || !tps.length)) return null;
  let milestone = 0;
  for (const b of bars) {
    if (!(b.time > fromTime)) continue;
    if (tps && tps.length) {
      for (let i = tps.length - 1; i >= milestone; i--) {
        const touched = side === "buy" ? b.high >= tps[i] : b.low <= tps[i];
        if (touched) { milestone = i + 1; break; }
      }
    }
    const slHit = sl != null && (side === "buy" ? b.low <= sl : b.high >= sl);
    if (slHit) return milestone > 0 ? `tp${milestone}` : "sl";
  }
  return milestone > 0 ? `tp${milestone}` : "active";
}
async function scanCombo(code, tf, source) {
  const names = Object.keys(loadManifest());
  const now = Date.now();
  for (const name of names) {
    let res;
    try { res = await runScanner(name, code, tf, false, source); } catch (e) { continue; }
    const key = `${name}|${code}|${tf}`;
    const known = WATERMARK.has(key); // déjà vu au moins une fois : jamais de notification au tout premier calcul
    const lv = res.levels;
    if (lv && lv.side && lv.pe != null) {
      const identity = `${lv.side}|${lv.pe}`;
      if (LAST_TRADE.get(key) !== identity) {
        LAST_TRADE.set(key, identity);
        // Bougie la plus récente du calcul = horodatage du trade (pas "maintenant") : l'étiquette peut
        // être apparue plusieurs bougies avant d'être détectée (passage de service manqué, etc.)
        const barTime = res.bars.length ? res.bars[res.bars.length - 1].time : now;
        const id = `${name}|${code}|${tf}|${barTime}`;
        if (!SIGNALS.some((s) => s.id === id)) {
          const sig = { id, scanner: name, symbol: code, tf, side: lv.side, time: barTime, seenAt: now, levels: lv, status: "active" };
          SIGNALS.push(sig);
          saveSignals();
          if (known) dispatch(sig);
        }
      } else {
        // Même trade (identité inchangée) : si la façon de calculer ses niveaux a changé depuis
        // (script ajusté), on rafraîchit le signal déjà enregistré plutôt que de le laisser figé
        // avec d'anciens niveaux jusqu'à la prochaine opportunité.
        const cur = SIGNALS.find((s) => s.scanner === name && s.symbol === code && s.tf === tf && s.side === lv.side && s.levels && s.levels.pe === lv.pe);
        if (cur && JSON.stringify(cur.levels) !== JSON.stringify(lv)) { cur.levels = lv; saveSignals(); }
      }
    }
    // Finalité (actif / TPn / SL) : recalculée à chaque passage à partir des bougies fermées
    for (const s of SIGNALS) {
      if (s.scanner !== name || s.symbol !== code || s.tf !== tf || !s.levels) continue;
      const status = tradeStatus(s.side, s.levels, res.bars, s.time);
      if (status !== s.status) { s.status = status; saveSignals(); }
    }
    WATERMARK.set(key, now);
  }
  // On garde les opportunités récentes ET, pour chaque scanner et paire, la dernière (même ancienne)
  const newest = new Map();
  for (const s of SIGNALS) {
    const k = `${s.scanner}|${s.symbol}|${s.tf}`;
    if (!newest.has(k) || s.time > newest.get(k).time) newest.set(k, s);
  }
  SIGNALS = SIGNALS.filter((s) => s.time >= now - OPPORTUNITY_WINDOW || newest.get(`${s.scanner}|${s.symbol}|${s.tf}`) === s);
  saveSignals();
}

// Le moteur ne sort les alertes que pour la dernière bougie : on calcule une fois par bougie fermée
// BUG RÉEL (2026-10-13, retour utilisateur : "pourquoi ça se limite aussi vite alors que je l'ai
// même pas utilisé ?") : ce `candleCache.delete(k)` forçait un VRAI refetch Twelve Data (1 crédit)
// à chaque bougie fermée de chaque combo surveillé, quelle que soit sa durée — candleTtl(tf) (voir
// plus haut) n'avait donc jamais d'effet ici, seulement sur les requêtes ponctuelles hors suivi.
// Pour un seul combo M1 surveillé 24h/24, ça faisait jusqu'à 1440 crédits/jour (M5 : 288/jour) - un
// simple coup d'œil à un scanner (24h de suivi auto, même sans règle d'alerte) suffisait à vider le
// quota du service en quelques heures. Retiré : getCandles() applique maintenant son propre délai
// (candleTtl(tf), plancher 5 min) ici aussi - un combo M1 n'est donc plus rafraîchi qu'au maximum
// toutes les 5 min (au lieu de chaque minute), au prix d'un léger délai de détection sur les unités
// de temps rapides (jusqu'à ~5 min sur M1/M5, inchangé sur M15 et plus lent où le plancher ne
// change déjà rien) - un compromis assumé face à l'alternative (plus aucun scanner functional).
// BUG RÉEL (2026-10-13, retour utilisateur : "les graphiques et mes 800 crédits sont en fonction du
// nombre de fois où j'ouvre le graphique, sinon ils n'ont pas d'intérêt à tourner en fond") : cette
// boucle traitait TOUS les combos de WATCH, y compris ceux arrivés par simple consultation (/signals
// avec keep:false - voir plus bas) - et pire, /signals retouche `touched` à CHAQUE appel, donc un
// onglet Stratégies resté ouvert (loadOpportunities toutes les 60s) empêchait ce combo d'expirer et
// le faisait tourner dans l'alarme indéfiniment, même sans la moindre règle d'alerte dessus. Filtré
// désormais sur `w.keep` : seuls les VRAIS combos d'alerte (créés via /watch, une règle explicite)
// tournent ici avec la clé "alarm" - un combo juste consulté reste dans WATCH (pour que les
// prochaines secondes/minutes profitent du cache) mais n'est plus jamais rescanné tout seul ; il ne
// se rafraîchit qu'à la prochaine vraie requête /data ou /signals (clé "view").
setInterval(async () => {
  const now = Date.now();
  for (const [k, w] of WATCH) {
    if (!w.keep) { if (now - w.touched > WATCH_TTL) WATCH.delete(k); continue; }
    const [code, tf] = k.split("|");
    const closedStart = Math.floor(now / TF_MS[tf]) * TF_MS[tf] - TF_MS[tf];
    if (now - (closedStart + TF_MS[tf]) < SCAN_DELAY) continue;
    if (w.lastBar === closedStart) continue;
    w.lastBar = closedStart;
    try { await scanCombo(code, tf, "alarm"); } catch (e) { /* bougies indisponibles : on réessaiera au prochain tour */ }
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
      return send(200, {
        ok: true, rssMB: Math.round(process.memoryUsage().rss / 1048576), models: modelCache.size, watching: WATCH.size, calculs: calculsCount,
        twelveDataCredits: {
          day: credits.day,
          view: { budget: DEFAULT_BUDGET.view, used: credits.used.view, remaining: creditsRemaining("view") },
          alarm: { budget: DEFAULT_BUDGET.alarm, used: credits.used.alarm, remaining: creditsRemaining("alarm") },
        },
        board: BOARD.health(),
      });
    }

    // Tableau de force Wolfx : tendance EMA 500 et score Pulse par marché et unité de temps
    if (url.pathname === "/board" && req.method === "GET") {
      if (!isInternal(req)) return send(401, { error: "non autorisé" });
      return send(200, BOARD.snapshot());
    }

    if (url.pathname === "/data" && req.method === "GET") {
      const name = url.searchParams.get("script") || "";
      const code = (url.searchParams.get("symbol") || "XAUUSD").toUpperCase();
      const tf = url.searchParams.get("tf") || "5";
      if (!validCode(code) || !TF_INTERVAL[tf]) return send(400, { error: "paramètres invalides" });
      const r = await scannerModels(name, code, tf, "view");
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
      if (isNew) scanCombo(code, tf, "view").catch(() => {});
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
