// STASH · BERICH — réglages de connexion broker/propfirm (localStorage) et
// lecture des signaux détectés par le scanner (webhook TradingView -> berich-bridge).
(() => {
  'use strict';

  const CONN_KEY = 'stash_berich_connection';
  const TAKEN_KEY = 'stash_berich_taken';
  const LAST_CHOICE_KEY = 'stash_berich_last_risk_choice';
  const LOCAL_SIGNAL_FILE = 'data/berich-signal.json';

  // Préréglages de risque par défaut — mêmes règles que le money management du
  // backtesting (cp.tiers: paliers de risque après N SL consécutifs).
  const DEFAULT_PRESETS = [
    { id: 'propfirm', name: 'Propfirm', risk: 1, tiers: [] },
    { id: 'perso', name: 'Perso', risk: 12, tiers: [{ afterSl: 3, newRisk: 6 }] },
  ];

  function loadConnection() {
    try {
      const raw = localStorage.getItem(CONN_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  // Vraie condition d'accès à BERICH : un compte relié (broker renseigné).
  function isConnected() {
    const conn = loadConnection();
    return !!(conn && conn.broker && conn.broker.trim());
  }

  function saveConnection(conn) {
    try { localStorage.setItem(CONN_KEY, JSON.stringify(conn)); } catch (e) { /* tant pis */ }
  }

  function clearConnection() {
    try { localStorage.removeItem(CONN_KEY); } catch (e) { /* tant pis */ }
  }

  function defaultPresets() {
    return JSON.parse(JSON.stringify(DEFAULT_PRESETS));
  }

  // Signaux marqués "pris" localement — l'exécution réelle sur MT5 n'est pas
  // encore branchée (voir berich-bridge/README.md), donc on ne fait que
  // mémoriser l'intention de l'utilisateur, honnêtement. On garde aussi le
  // risque réellement choisi à ce moment-là (pas juste l'id) pour que le
  // journal de trading puisse afficher un vrai P&L historique plutôt qu'une
  // estimation recalculée avec le risque/solde actuels.
  function loadTaken() {
    try { return JSON.parse(localStorage.getItem(TAKEN_KEY) || '[]'); } catch (e) { return []; }
  }

  function findTaken(signalId) {
    return loadTaken().find((t) => t.id === signalId) || null;
  }

  function markTaken(signalId, meta) {
    const taken = loadTaken();
    if (!taken.some((t) => t.id === signalId)) {
      taken.push(Object.assign({ id: signalId, takenAt: new Date().toISOString() }, meta || {}));
      try { localStorage.setItem(TAKEN_KEY, JSON.stringify(taken)); } catch (e) { /* tant pis */ }
    }
  }

  async function fetchSignals() {
    const url = (window.STASH_CONFIG && window.STASH_CONFIG.berichApiUrl) || '';
    const target = url || `${LOCAL_SIGNAL_FILE}?nocache=${Date.now()}`;
    const res = await fetch(target);
    if (!res.ok) throw new Error('signal fetch failed');
    return res.json();
  }

  // Nombre de SL consécutifs les plus récents (signaux triés du plus récent
  // au plus ancien, comme les renvoie berich-bridge) — s'arrête au premier
  // TP ou signal encore ouvert.
  function consecutiveLosses(signals) {
    let count = 0;
    for (const s of signals || []) {
      if (s.status === 'closed' && s.result === 'SL') count += 1;
      else if (s.status === 'closed' && s.result === 'TP') break;
      else if (s.status !== 'closed') continue; // signal ouvert, on regarde plus loin en arrière
      else break;
    }
    return count;
  }

  // Toutes les options de risque sélectionnables au moment de prendre une
  // position : "Manuel" + un par préréglage de la connexion.
  function riskChoices(connection) {
    if (!connection) return [];
    const presets = connection.presets && connection.presets.length ? connection.presets : defaultPresets();
    return [
      { mode: 'manual', label: `Manuel (${connection.riskPercent}%)` },
      ...presets.map((p) => ({
        mode: 'preset', presetId: p.id,
        label: p.tiers && p.tiers.length ? `${p.name} (${p.risk}%→${p.tiers[0].newRisk}%)` : `${p.name} (${p.risk}%)`,
      })),
    ];
  }

  function saveLastRiskChoice(choice) {
    try { localStorage.setItem(LAST_CHOICE_KEY, JSON.stringify(choice)); } catch (e) { /* tant pis */ }
  }

  function loadLastRiskChoice() {
    try { return JSON.parse(localStorage.getItem(LAST_CHOICE_KEY) || 'null'); } catch (e) { return null; }
  }

  // Risque effectif (%) pour un `choice` donné ({mode:'manual'} ou
  // {mode:'preset', presetId}) — choisi à côté du bouton au moment de prendre
  // la position, pas figé à l'avance sur la connexion.
  function effectiveRisk(connection, signals, choice) {
    if (!connection) return null;
    const useChoice = choice || { mode: connection.riskMode || 'manual', presetId: connection.activePresetId };

    if (useChoice.mode !== 'preset') {
      return { risk: connection.riskPercent, source: 'manuel' };
    }
    const presets = connection.presets && connection.presets.length ? connection.presets : defaultPresets();
    const active = presets.find((p) => p.id === useChoice.presetId) || presets[0];
    if (!active) return { risk: connection.riskPercent, source: 'manuel' };

    const losses = consecutiveLosses(signals);
    const tiers = (active.tiers || []).slice().sort((a, b) => b.afterSl - a.afterSl);
    const hitTier = tiers.find((t) => losses >= t.afterSl);
    return {
      risk: hitTier ? hitTier.newRisk : active.risk,
      source: `préréglage ${active.name}${hitTier ? ` · palier ${losses} SL` : ''}`,
    };
  }

  window.STASHBerich = {
    loadConnection, saveConnection, clearConnection, isConnected,
    loadTaken, findTaken, markTaken, fetchSignals,
    defaultPresets, consecutiveLosses, effectiveRisk,
    riskChoices, saveLastRiskChoice, loadLastRiskChoice,
  };
})();
