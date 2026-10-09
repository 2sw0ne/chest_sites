// CHEST · Compte MT5 en direct (2026-10-09). Lit l'instantané que l'Expert Advisor CHESTLive pousse
// depuis le terminal MT5 vers accounts-bridge (GET /mt5/live, admin) : solde, equity, P&L flottant et
// positions ouvertes EXACTS, quelques secondes de retard au plus — contrairement à Myfxbook, qui ne se
// resynchronise qu'à ses propres moments. Sans instantané récent (terminal éteint, EA détaché), le
// callback reçoit null et le Dashboard retombe sur Myfxbook + suivi estimé (live-sim.js).
window.CHESTMt5Live = (() => {
  'use strict';

  const POLL_MS = 5000;
  let timer = null;
  let onUpdate = null;
  let last = null;

  async function fetchLive() {
    const base = (window.CHEST_CONFIG && window.CHEST_CONFIG.accountsApiUrl) || 'http://localhost:8080';
    const token = window.CHESTAccounts && CHESTAccounts.getToken && CHESTAccounts.getToken();
    if (!token) return null;
    const res = await fetch(`${base}/mt5/live`, { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) return null;
    const j = await res.json();
    return j && j.connected && j.fresh ? j : null;
  }

  async function tick() {
    let snap = null;
    try { snap = await fetchLive(); } catch (e) { snap = null; }
    last = snap;
    if (onUpdate) onUpdate(snap);
  }

  function start(cb) {
    if (timer) { onUpdate = cb; return; }
    onUpdate = cb;
    tick();
    timer = setInterval(() => { if (!document.hidden) tick(); }, POLL_MS);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    onUpdate = null;
    last = null;
  }

  return { start, stop, latest: () => last };
})();
