// Tableau de force Wolfx (2026-10-18, demande utilisateur) : pour chaque marché suivi par Wolfx,
// la TENDANCE (côté de l'EMA 500 sur M5, M15, M30, H1, H4, D1) et la FORCE (le score de tendance du
// scanner Pulse/QUANTUM : ±10 par EMA 3, 9, 21, 30, 45, 90, 135, 180, 360, 720 au-dessus/au-dessous
// du prix, donc -100..100). Calculé ici en JS pur, pas en Pine : la formule est publique (dix EMA)
// et un calcul Vela par marché et par unité de temps coûterait des minutes de processeur.
//
// Budget : un compte Twelve Data DÉDIÉ (TWELVE_DATA_API_KEY_BOARD, 800 crédits/jour, 8/min), jamais
// partagé avec la consultation ni l'alarme. Trois lectures par marché seulement - M5 (d'où M15 et
// M30), H1 (d'où H4) et D1 - à des rythmes différents ; forex et or ne sont pas relus quand le
// marché est fermé. 30 marchés ≈ 690 crédits par jour ouvré. Une requête toutes les 8 s au plus.
// Seuls les résultats sont gardés (quelques nombres par marché), jamais les bougies.
import { readFileSync, existsSync, writeFileSync } from "node:fs";

export const BOARD_MARKETS = [
  "XAUUSD", "BTCUSD",
  "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "USDCAD", "AUDUSD", "NZDUSD",
  "EURGBP", "EURJPY", "EURCHF", "EURCAD", "EURAUD", "EURNZD",
  "GBPJPY", "GBPCHF", "GBPCAD", "GBPAUD", "GBPNZD",
  "AUDJPY", "AUDCHF", "AUDCAD", "AUDNZD",
  "NZDJPY", "NZDCHF", "NZDCAD", "CADJPY", "CADCHF", "CHFJPY",
];
const CRYPTO = new Set(["BTCUSD"]);
export const BOARD_TFS = ["5", "15", "30", "60", "240", "D"];
const MIN = 60e3, H = 3600e3;
// Une lecture = une unité de temps Twelve Data, d'où on dérive les unités supérieures.
const GROUPS = {
  m5: { tf: "5", interval: "5min", ms: 5 * MIN, every: 90 * MIN, size: 5000, derive: { "5": 5 * MIN, "15": 15 * MIN, "30": 30 * MIN } },
  h1: { tf: "60", interval: "1h", ms: H, every: 4 * H, size: 5000, derive: { "60": H, "240": 4 * H } },
  d1: { tf: "D", interval: "1day", ms: 24 * H, every: 24 * H, size: 1500, derive: { "D": 24 * H } },
};
const PULSE_LENS = [3, 9, 21, 30, 45, 90, 135, 180, 360, 720];
const TICK_MS = 8000;

// ta.ema de Pine : na tant qu'il n'y a pas `len` valeurs, amorcée par la moyenne simple des `len`
// premières, puis alpha = 2/(len+1). Comparer le prix à na donne faux, donc -10 (comme le script).
function lastEma(closes, len) {
  if (closes.length < len) return null;
  let e = 0;
  for (let i = 0; i < len; i++) e += closes[i];
  e /= len;
  const a = 2 / (len + 1);
  for (let i = len; i < closes.length; i++) e = a * closes[i] + (1 - a) * e;
  return e;
}
export function pulseScore(closes) {
  const c = closes[closes.length - 1];
  let s = 0;
  for (const L of PULSE_LENS) { const e = lastEma(closes, L); s += e !== null && c >= e ? 10 : -10; }
  return s;
}
// Bougies regroupées par tranche UTC alignée ; la dernière tranche, pas encore close, est retirée.
function aggregate(bars, baseMs, ms, now) {
  if (ms === baseMs) return bars;
  const out = [];
  let cur = null;
  for (const b of bars) {
    const t = Math.floor(b.time / ms) * ms;
    if (!cur || cur.time !== t) { cur = { time: t, close: b.close }; out.push(cur); }
    else cur.close = b.close;
  }
  const tail = out[out.length - 1];
  if (tail && tail.time + ms > now) out.pop();
  return out;
}
function summarize(bars) {
  const closes = bars.map((b) => b.close);
  if (closes.length < 30) return null;
  const c = closes[closes.length - 1];
  const e500 = lastEma(closes, 500);
  return { trend: e500 === null ? 0 : c >= e500 ? 1 : -1, score: pulseScore(closes), close: c, bar: bars[bars.length - 1].time };
}
// Forex et or : fermés du vendredi 22 h au dimanche 22 h UTC.
function marketClosed(code, now) {
  if (CRYPTO.has(code)) return false;
  const d = new Date(now), day = d.getUTCDay(), h = d.getUTCHours();
  return day === 6 || (day === 0 && h < 22) || (day === 5 && h >= 22);
}

export function createBoard({ file, key, budget, isTradableBar }) {
  let state = { day: "", used: 0, markets: {} };
  try { if (existsSync(file)) state = Object.assign(state, JSON.parse(readFileSync(file, "utf8"))); } catch (e) { /* repart de zéro */ }
  const save = () => { try { writeFileSync(file, JSON.stringify(state)); } catch (e) { /* volume absent en local */ } };
  const today = () => new Date().toISOString().slice(0, 10);
  const remaining = () => { if (state.day !== today()) { state.day = today(); state.used = 0; } return budget - state.used; };
  let lastError = null, busy = false;

  function entry(code) {
    return state.markets[code] || (state.markets[code] = { tfs: {}, due: { m5: 0, h1: 0, d1: 0 } });
  }
  // Prochaine lecture : la plus en retard parmi celles qui sont dues. Un marché fermé n'est relu
  // que s'il n'a encore jamais été lu (pour que le tableau soit rempli même un week-end).
  function nextJob(now) {
    let best = null;
    for (const code of BOARD_MARKETS) {
      const m = entry(code);
      for (const g of Object.keys(GROUPS)) {
        if (m.due[g] > now) continue;
        if (marketClosed(code, now) && m.due[g] > 0) continue;
        if (!best || m.due[g] < best.due) best = { code, g, due: m.due[g] };
      }
    }
    return best;
  }
  async function run(job, now) {
    const G = GROUPS[job.g], m = entry(job.code);
    state.used += 1; save(); // compté AVANT l'appel : ne jamais dépasser le budget
    const sym = job.code.slice(0, 3) + "/" + job.code.slice(3);
    const qs = new URLSearchParams({ symbol: sym, interval: G.interval, outputsize: String(G.size), timezone: "UTC", apikey: key });
    const res = await fetch(`https://api.twelvedata.com/time_series?${qs}`);
    const json = await res.json();
    if (!res.ok || json.status === "error" || !Array.isArray(json.values)) throw new Error(json.message || "bougies indisponibles");
    let bars = json.values
      .map((v) => ({ time: Date.parse(v.datetime.replace(" ", "T") + "Z"), open: +v.open, high: +v.high, low: +v.low, close: +v.close }))
      .filter((c) => c.time + G.ms <= now)
      .sort((a, b) => a.time - b.time);
    if (!CRYPTO.has(job.code) && G.tf !== "D") bars = bars.filter(isTradableBar);
    for (const [tf, ms] of Object.entries(G.derive)) {
      const s = summarize(aggregate(bars, G.ms, ms, now));
      if (s) m.tfs[tf] = { ...s, at: now };
    }
    m.due[job.g] = now + G.every;
    save();
  }
  async function tick() {
    if (busy || !key) return;
    const now = Date.now();
    if (remaining() <= 0) return;
    const job = nextJob(now);
    if (!job) return;
    busy = true;
    try { await run(job, now); lastError = null; }
    catch (e) {
      lastError = String((e && e.message) || e).slice(0, 160);
      // Symbole refusé ou panne : on réessaie ce marché plus tard, sans bloquer les autres.
      entry(job.code).due[job.g] = now + 30 * MIN; save();
    } finally { busy = false; }
  }
  if (key) setInterval(tick, TICK_MS);

  return {
    snapshot() {
      remaining();
      const markets = {};
      for (const code of BOARD_MARKETS) { const m = state.markets[code]; if (m) markets[code] = m.tfs; }
      return { enabled: !!key, tfs: BOARD_TFS, markets, credits: { used: state.used, budget }, lastError };
    },
    health() { remaining(); return { enabled: !!key, used: state.used, budget, lastError }; },
  };
}
