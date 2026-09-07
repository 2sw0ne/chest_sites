// Widget "top/flop crypto" du dashboard : les 3 meilleures et 3 moins
// bonnes performances sur 24h, parmi les 100 plus grandes capitalisations
// (hors stablecoins, dont la variation est structurellement proche de 0 et
// n'a aucun interet ici). Donnees CoinGecko en direct, independant des
// comptes de trading affiches par ailleurs sur cette page.
(() => {
  'use strict';

  const STABLES = new Set(['usdt', 'usdc', 'dai', 'busd', 'tusd', 'usde', 'fdusd', 'usds', 'pyusd', 'usdd', 'frax', 'gusd', 'lusd']);

  function fmtPrice(v) {
    if (v >= 1000) return '$' + Math.round(v).toLocaleString('fr-FR');
    if (v >= 1) return '$' + v.toFixed(2).replace('.', ',');
    return '$' + v.toPrecision(3).replace('.', ',');
  }
  function fmtPct(v) { return (v >= 0 ? '+' : '') + v.toFixed(1).replace('.', ',') + '%'; }

  function rowHtml(c) {
    const tone = c.price_change_percentage_24h >= 0 ? 'pos' : 'neg';
    return `
      <div class="mover-row">
        <img src="${c.image}" alt="" loading="lazy">
        <div class="name"><b>${c.name}</b><span>${c.symbol}</span></div>
        <div class="price">${fmtPrice(c.current_price)}</div>
        <div class="chg ${tone}">${fmtPct(c.price_change_percentage_24h)}</div>
      </div>`;
  }

  async function load() {
    const topEl = document.getElementById('moversTop');
    const botEl = document.getElementById('moversBottom');
    if (!topEl || !botEl) return;
    try {
      const res = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&price_change_percentage=24h');
      if (!res.ok) throw new Error(String(res.status));
      const list = await res.json();
      const filtered = (Array.isArray(list) ? list : []).filter((c) =>
        !STABLES.has(String(c.symbol).toLowerCase()) && typeof c.price_change_percentage_24h === 'number');
      const sorted = filtered.slice().sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h);
      const top3 = sorted.slice(0, 3);
      const bottom3 = sorted.slice(-3).reverse();
      topEl.innerHTML = top3.length ? top3.map(rowHtml).join('') : '<p class="hint">Indisponible.</p>';
      botEl.innerHTML = bottom3.length ? bottom3.map(rowHtml).join('') : '<p class="hint">Indisponible.</p>';
    } catch (e) {
      const msg = '<p class="hint">Données crypto indisponibles pour le moment (api.coingecko.com).</p>';
      topEl.innerHTML = msg;
      botEl.innerHTML = msg;
    }
  }

  document.addEventListener('DOMContentLoaded', load);
})();
