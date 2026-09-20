// CHEST · Force des devises — consomme DIRECTEMENT le flux public de FX Blue
// (widgets.fxbluelabs.com), pas une approximation maison : le premier essai
// (moyenne des % de variation sur les 28 paires croisées, normalisée en
// score-z) donnait des valeurs sans rapport avec fxblue.com/market-data/
// tools/currency-strength (retour direct utilisateur du 2026-09-15 : "ça n'a
// rien à voir"). En inspectant le réseau de leur page, leur widget appelle
// un endpoint JSON public (pas de clé, CORS ouvert - vérifié en direct
// depuis ce site) dont la réponse est "brouillée" (pas un vrai chiffrement) :
// on inverse les 4*floor(n/4-1) premiers caractères, on recolle le reste, et
// on décode en base64 -> JSON. Leur valeur affichée par défaut moyenne le
// score sur bars=50, timeframes=[30,240,1440] minutes (M30/H4/D1) - formule
// retrouvée en comparant nos calculs aux vraies valeurs affichées sur
// fxblue.com au même instant (identiques à 0.1 près, toutes les devises).
//
// Risque assumé : endpoint non documenté, appartenant à un tiers - peut
// changer de forme sans préavis. En cas d'échec (fetch, décodage), on
// affiche honnêtement "indisponible" plutôt qu'une valeur inventée.
(() => {
  'use strict';

  const ENDPOINT = 'https://widgets.fxbluelabs.com/webwidgets/_publish/currencystrengthretrieve.aspx';
  const BAR_LENGTH = 50;
  const TIMEFRAMES = [30, 240, 1440]; // minutes : M30, H4, D1 - reglage "par defaut" de fxblue
  const CACHE_KEY = 'chest_currency_strength_fxblue';
  const CACHE_MS = 5 * 60 * 1000;

  function loadCache() {
    try {
      const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (raw && Date.now() - raw.at < CACHE_MS) return raw.data;
    } catch (e) { /* tant pis */ }
    return null;
  }
  function saveCache(data) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data })); } catch (e) { /* tant pis */ }
  }

  // Reponse "brouillee" de fxblue : pas un chiffrement, une simple
  // permutation reversible (voir docstring en tete de fichier).
  function decodePayload(text) {
    const cut = (Math.floor(text.length / 4) - 1) * 4;
    const reversed = text.substr(0, cut).split('').reverse().join('');
    const tail = text.substr(cut);
    return JSON.parse(atob(reversed + tail));
  }

  function clamp(v) { return Math.min(9.9, Math.max(-9.9, v)); }

  async function fetchStrength() {
    const res = await fetch(ENDPOINT);
    if (!res.ok) throw new Error(String(res.status));
    const decoded = decodePayload(await res.text());
    return decoded.currencies.map((c) => {
      const perTf = decoded.data[c] && decoded.data[c][BAR_LENGTH];
      const vals = TIMEFRAMES.map((tf) => (perTf && perTf[tf] ? perTf[tf].value : 0));
      const avg = clamp(vals.reduce((s, v) => s + v, 0) / vals.length);
      return { code: c, index: Math.round(avg * 10) / 10 };
    }).sort((a, b) => b.index - a.index);
  }

  function rowHtml(item, maxAbs) {
    const pct = maxAbs ? Math.abs(item.index) / maxAbs * 100 : 0;
    const tone = item.index >= 0 ? 'pos' : 'neg';
    return `
      <div class="cstr-row">
        <span class="cstr-code">${item.code}</span>
        <div class="cstr-track"><div class="cstr-bar ${tone}" style="width:${pct}%"></div></div>
        <span class="cstr-val ${tone}">${item.index >= 0 ? '+' : ''}${item.index.toFixed(1)}</span>
      </div>`;
  }

  function paint(el, ranked) {
    const maxAbs = Math.max(...ranked.map((r) => Math.abs(r.index)), 0.1);
    el.innerHTML = ranked.map((r) => rowHtml(r, maxAbs)).join('')
      + '<p class="hint" style="margin:14px 0 0">Indice FX Blue (M30/H4/D1 moyennés, de -9.9 à +9.9) — même source que fxblue.com/market-data/tools/currency-strength, pas une variation en %. Actualisé toutes les 5 min.</p>';
  }

  async function render(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const cached = loadCache();
    if (cached) paint(el, cached);
    else el.innerHTML = '<p class="hint">Chargement…</p>';

    try {
      const ranked = await fetchStrength();
      saveCache(ranked);
      paint(el, ranked);
    } catch (e) {
      if (!cached) el.innerHTML = '<p class="hint">Données indisponibles pour le moment (widgets.fxbluelabs.com).</p>';
    }
  }

  window.CHESTCurrencyStrength = { render };
})();
