// CHEST · Calculatrice de lots — bouton flottant disponible sur toutes les
// pages (widget auto-injecte, meme principe que showToast() dans nav.js).
// Choisir un compte du Journal prefile automatiquement la taille du compte
// et la regle de risque de ce compte (CHESTJournal.riskAmountFor) ; le reste
// (paire, stop-loss) reste a remplir a la main.
//
// Honnetete sur l'arrondi : un broker ne trade qu'au 0.01 lot pres. Quand le
// lot calcule est plus petit que ce minimum, on l'affiche quand meme mais on
// precise le VRAI risque (%) que le lot minimum represente reellement sur le
// compte, plutot que de laisser croire que le risque demande est respecte.
(() => {
  'use strict';

  const FOREX_PAIRS = [
    'AUDCHF', 'AUDUSD', 'AUDCAD', 'AUDNZD', 'AUDJPY', 'EURGBP', 'EURCHF', 'EURUSD', 'EURCAD', 'EURAUD', 'EURNZD', 'EURJPY',
    'GBPCHF', 'GBPUSD', 'GBPCAD', 'GBPAUD', 'GBPNZD', 'GBPJPY', 'USDCHF', 'USDCAD', 'USDJPY', 'NZDCHF', 'NZDUSD', 'NZDCAD',
    'NZDJPY', 'CADCHF', 'CADJPY', 'CHFJPY',
  ];
  // contractSize = unites par lot standard (1.00) ; conventions courantes du
  // marche (100 oz/lot pour l'or, 5000 oz/lot pour l'argent, 50 oz/lot pour
  // le platine) - a ajuster si ton broker utilise une taille de contrat
  // differente (certains proposent des "micro-lots" ou tailles maison).
  // pipSize=0.01 : les metaux se cotent a 2 decimales (ex. 3650.00), meme
  // convention que les paires JPY plus bas - 1 pip = 0,01$ de mouvement,
  // pas un "$ de mouvement" brut (sinon le stop-loss ne veut plus rien dire
  // compare a une paire forex, retour utilisateur direct).
  const METALS = {
    XAUUSD: { label: 'Or (XAU/USD)', contractSize: 100, pipSize: 0.01 },
    XAGUSD: { label: 'Argent (XAG/USD)', contractSize: 5000, pipSize: 0.01 },
    XPTUSD: { label: 'Platine (XPT/USD)', contractSize: 50, pipSize: 0.01 },
  };
  const CRYPTOS = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'TRXUSD', 'DOGEUSD', 'LINKUSD', 'ADAUSD', 'UNIUSD', 'AVAXUSD'];

  function pairKind(code) {
    if (METALS[code]) return 'metal';
    if (CRYPTOS.includes(code)) return 'crypto';
    return 'forex';
  }

  function buildPairOptions() {
    const groups = [
      ['Forex', FOREX_PAIRS.map((c) => [c, c])],
      ['Matières premières', Object.entries(METALS).map(([c, m]) => [c, m.label])],
      ['Crypto', CRYPTOS.map((c) => [c, c])],
    ];
    return groups.map(([label, pairs]) => `<optgroup label="${label}">${pairs.map(([c, l]) => `<option value="${c}">${l}</option>`).join('')}</optgroup>`).join('');
  }

  function ensureJournalStore() {
    return new Promise((resolve) => {
      if (window.CHESTJournal) { resolve(); return; }
      const s = document.createElement('script');
      s.src = 'js/journal-store.js';
      s.onload = () => resolve();
      s.onerror = () => resolve(); // degrade proprement : pas de select compte, le reste marche
      document.head.appendChild(s);
    });
  }

  const STYLE = `
    .lotcalc-fab{
      position:fixed; right:24px; bottom:24px; z-index:260; width:52px; height:52px; border-radius:50%;
      border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:22px;
      background:linear-gradient(135deg,var(--acc),var(--acc2)); color:#fff; box-shadow:0 14px 34px rgba(252,18,131,.4);
      transition:transform .2s var(--ease);
    }
    .lotcalc-fab:hover{ transform:scale(1.06); }
    .lotcalc-overlay{
      position:fixed; inset:0; z-index:280; background:rgba(0,0,0,.6); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px);
      display:flex; align-items:center; justify-content:center; padding:24px; opacity:0; pointer-events:none; transition:opacity .2s;
    }
    .lotcalc-overlay.is-open{ opacity:1; pointer-events:auto; }
    .lotcalc-modal{
      width:100%; max-width:440px; max-height:88vh; overflow-y:auto; background:var(--panel); border:1px solid var(--line2);
      border-radius:var(--radius); padding:22px 22px 24px; transform:translateY(12px); transition:transform .2s;
    }
    .lotcalc-overlay.is-open .lotcalc-modal{ transform:translateY(0); }
    .lotcalc-head{ display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
    .lotcalc-head h3{ font-size:16px; margin:0; }
    .lotcalc-close{ border:none; background:var(--bg); color:var(--muted); width:30px; height:30px; border-radius:50%; cursor:pointer; font-size:15px; }
    .lotcalc-row{ margin-bottom:12px; }
    .lotcalc-row label{ display:block; font-size:11.5px; color:var(--muted); font-weight:700; margin-bottom:6px; }
    .lotcalc-row select, .lotcalc-row input{
      width:100%; height:38px; border:1px solid var(--line2); border-radius:9px; background:var(--bg); color:var(--ink);
      font:inherit; font-size:13px; padding:0 11px;
    }
    .lotcalc-grid2{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .lotcalc-risk-toggle{ display:inline-flex; gap:3px; padding:3px; border:1px solid var(--line2); border-radius:999px; background:var(--bg); margin-bottom:8px; }
    .lotcalc-risk-toggle button{ border:none; cursor:pointer; font:inherit; font-size:11px; font-weight:700; padding:6px 12px; border-radius:999px; background:transparent; color:var(--muted); }
    .lotcalc-risk-toggle button.is-active{ background:var(--ink); color:var(--bg); }
    .lotcalc-actions{ display:flex; gap:10px; margin-top:6px; }
    .lotcalc-actions .btn{ flex:1; justify-content:center; }
    .lotcalc-result{ margin-top:18px; padding-top:16px; border-top:1px solid var(--line); display:none; }
    .lotcalc-result.is-visible{ display:block; }
    .lotcalc-result__row{ display:flex; align-items:center; justify-content:space-between; padding:7px 0; font-size:13px; }
    .lotcalc-result__row b{ font-variant-numeric:tabular-nums; }
    .lotcalc-result__lot{ font-size:26px; font-weight:800; color:var(--acc); }
    .lotcalc-warning{ margin-top:10px; padding:10px 12px; border-radius:10px; background:rgba(245,166,35,.12); border:1px solid rgba(245,166,35,.35); color:var(--amber); font-size:12px; line-height:1.5; }
    .lotcalc-error{ margin-top:10px; padding:10px 12px; border-radius:10px; background:rgba(255,77,94,.1); border:1px solid rgba(255,77,94,.3); color:var(--red); font-size:12px; line-height:1.5; }
    .lotcalc-hint{ font-size:11px; color:var(--faint); margin-top:4px; }
  `;

  function injectStyles() {
    if (document.getElementById('lotcalc-style')) return;
    const style = document.createElement('style');
    style.id = 'lotcalc-style';
    style.textContent = STYLE;
    document.head.appendChild(style);
  }

  function buildDom() {
    const fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'lotcalc-fab';
    fab.setAttribute('aria-label', 'Calculatrice de lots');
    fab.textContent = '🧮';
    document.body.appendChild(fab);

    const overlay = document.createElement('div');
    overlay.className = 'lotcalc-overlay';
    overlay.innerHTML = `
      <div class="lotcalc-modal">
        <div class="lotcalc-head">
          <h3>Calculatrice de lots</h3>
          <button type="button" class="lotcalc-close" aria-label="Fermer">✕</button>
        </div>

        <div class="lotcalc-row" id="lotcalcAccountRow">
          <label>Compte (optionnel)</label>
          <select id="lotcalcAccount"><option value="">— Saisie manuelle —</option></select>
        </div>

        <div class="lotcalc-row">
          <label>Paire</label>
          <select id="lotcalcPair">${buildPairOptions()}</select>
        </div>

        <div class="lotcalc-grid2">
          <div class="lotcalc-row">
            <label>Taille du compte ($)</label>
            <input type="number" id="lotcalcBalance" min="0" step="1" placeholder="1000">
          </div>
          <div class="lotcalc-row">
            <label id="lotcalcSlLabel">Stop-loss (pips)</label>
            <input type="number" id="lotcalcSl" min="0" step="0.1" placeholder="20">
          </div>
        </div>

        <div class="lotcalc-row">
          <label>Risque</label>
          <div class="lotcalc-risk-toggle" id="lotcalcRiskToggle">
            <button type="button" data-mode="pct" class="is-active">%</button>
            <button type="button" data-mode="usd">$</button>
          </div>
          <input type="number" id="lotcalcRisk" min="0" step="0.1" placeholder="1">
        </div>

        <div class="lotcalc-actions">
          <button type="button" class="btn btn-secondary" id="lotcalcReset">Réinitialiser</button>
          <button type="button" class="btn btn-primary" id="lotcalcCompute">Calculer</button>
        </div>

        <div class="lotcalc-result" id="lotcalcResult"></div>
      </div>`;
    document.body.appendChild(overlay);
    return { fab, overlay };
  }

  async function fetchUsdRate(currency) {
    if (currency === 'USD') return 1;
    const apiKey = window.CHEST_CONFIG && window.CHEST_CONFIG.twelveDataApiKey;
    if (!apiKey) return null;
    try {
      let r = await fetch(`https://api.twelvedata.com/price?symbol=${currency}/USD&apikey=${apiKey}`);
      let d = await r.json();
      if (d.price) return parseFloat(d.price);
      r = await fetch(`https://api.twelvedata.com/price?symbol=USD/${currency}&apikey=${apiKey}`);
      d = await r.json();
      if (d.price) return 1 / parseFloat(d.price);
    } catch (e) { /* pas de connexion / quota API - traite comme indisponible */ }
    return null;
  }

  function fmtUsd(v) {
    return '$' + v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  async function computeLot(refs) {
    const resultEl = refs.result;
    const pair = refs.pair.value;
    const balance = parseFloat(refs.balance.value);
    const slRaw = parseFloat(refs.sl.value);
    const riskInput = parseFloat(refs.risk.value);
    const riskMode = refs.riskToggle.querySelector('.is-active').dataset.mode;

    resultEl.classList.add('is-visible');
    if (!balance || balance <= 0 || !slRaw || slRaw <= 0 || !riskInput || riskInput <= 0) {
      resultEl.innerHTML = `<div class="lotcalc-error">Remplis taille du compte, stop-loss et risque (valeurs positives).</div>`;
      return;
    }

    const riskAmount = riskMode === 'pct' ? (balance * riskInput) / 100 : riskInput;
    const kind = pairKind(pair);

    let unitValueUsd = null; // valeur en $ d'1 pip (forex) ou d'1 unite de prix (metal/crypto), pour 1.00 lot
    let noteRate = '';

    if (kind === 'forex') {
      const quote = pair.slice(3);
      const pipSize = pair.endsWith('JPY') ? 0.01 : 0.0001;
      const contractSize = 100000;
      if (quote === 'USD') {
        unitValueUsd = contractSize * pipSize;
      } else {
        const rate = await fetchUsdRate(quote);
        if (rate === null) {
          resultEl.innerHTML = `<div class="lotcalc-error">Taux ${quote}/USD indisponible pour l'instant (API) — réessaie dans un instant.</div>`;
          return;
        }
        unitValueUsd = contractSize * pipSize * rate;
        noteRate = ` (taux ${quote}/USD ≈ ${rate.toFixed(4)})`;
      }
    } else if (kind === 'metal') {
      // Meme logique que le forex : 1 pip = pipSize $ de mouvement, valeur
      // du pip/lot = pipSize x taille du contrat (100 oz pour l'or -> 1 pip
      // = 0,01$ -> 1$ par pip pour 1.00 lot).
      const m = METALS[pair];
      unitValueUsd = m.pipSize * m.contractSize;
    } else {
      unitValueUsd = 1; // crypto coté directement en USD, 1 lot = 1 unité, SL en $ (pas de convention "pip" sensée vu l'écart de prix entre coins)
    }

    const rawLot = riskAmount / (slRaw * unitValueUsd);
    if (!isFinite(rawLot) || rawLot <= 0) {
      resultEl.innerHTML = `<div class="lotcalc-error">Calcul impossible avec ces valeurs.</div>`;
      return;
    }
    const flooredLot = Math.floor(rawLot * 100) / 100;
    const finalLot = Math.max(0.01, flooredLot);
    const realRiskUsd = finalLot * slRaw * unitValueUsd;
    const realRiskPct = (realRiskUsd / balance) * 100;

    const usesPips = kind === 'forex' || kind === 'metal';
    let html = `
      <div class="lotcalc-result__lot">${finalLot.toFixed(2)} lot</div>
      <div class="lotcalc-result__row"><span>Montant risqué demandé</span><b>${fmtUsd(riskAmount)}</b></div>
      <div class="lotcalc-result__row"><span>Valeur du ${usesPips ? 'pip' : 'point'} / lot</span><b>${fmtUsd(unitValueUsd)}${noteRate}</b></div>
      <div class="lotcalc-result__row"><span>Risque réel avec ce lot</span><b>${fmtUsd(realRiskUsd)} (${realRiskPct.toFixed(2)}%)</b></div>`;

    // N'avertir que quand le lot minimum tradable (0.01) force reellement a
    // depasser le risque demande - pas pour le simple arrondi au 0.01 le
    // plus proche (normal et attendu avec n'importe quel systeme en lots).
    if (rawLot < 0.01) {
      html += `<div class="lotcalc-warning">⚠️ Le lot minimum tradable (0,01) ne permet pas de descendre au risque demandé sur ce compte : avec ${finalLot.toFixed(2)} lot (le minimum possible), tu risques en réalité <b>${realRiskPct.toFixed(2)}%</b> (${fmtUsd(realRiskUsd)}) au lieu de ${riskMode === 'pct' ? riskInput.toFixed(2) + '%' : fmtUsd(riskInput)} demandé.</div>`;
    }

    resultEl.innerHTML = html;
  }

  async function init() {
    injectStyles();
    const { fab, overlay } = buildDom();
    await ensureJournalStore();

    const refs = {
      overlay,
      account: overlay.querySelector('#lotcalcAccount'),
      accountRow: overlay.querySelector('#lotcalcAccountRow'),
      pair: overlay.querySelector('#lotcalcPair'),
      balance: overlay.querySelector('#lotcalcBalance'),
      sl: overlay.querySelector('#lotcalcSl'),
      slLabel: overlay.querySelector('#lotcalcSlLabel'),
      risk: overlay.querySelector('#lotcalcRisk'),
      riskToggle: overlay.querySelector('#lotcalcRiskToggle'),
      result: overlay.querySelector('#lotcalcResult'),
    };

    // Compte du Journal (optionnel) : liste les comptes existants, applique
    // directement leur regle de risque (CHESTJournal.riskAmountFor) et leur
    // solde a la selection - il ne reste que la paire et le stop-loss a saisir.
    if (window.CHESTJournal) {
      const accounts = CHESTJournal.listAccounts();
      if (accounts.length) {
        refs.account.innerHTML += accounts.map((a) => `<option value="${a.id}">${a.name}${a.type === 'propfirm' ? ' (Propfirm)' : ''}</option>`).join('');
      } else {
        refs.accountRow.querySelector('label').textContent = 'Compte (aucun créé dans le Journal)';
      }
      refs.account.addEventListener('change', () => {
        const acc = accounts.find((a) => a.id === refs.account.value);
        if (!acc) return;
        refs.balance.value = acc.balance;
        const mode = acc.riskUnit === 'usd' ? 'usd' : 'pct';
        refs.riskToggle.querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b.dataset.mode === mode));
        refs.risk.value = acc.riskValue;
      });
    } else {
      refs.accountRow.hidden = true;
    }

    refs.pair.addEventListener('change', () => {
      const kind = pairKind(refs.pair.value);
      refs.slLabel.textContent = kind === 'crypto' ? 'Stop-loss ($ de mouvement)' : 'Stop-loss (pips)';
    });

    refs.riskToggle.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        refs.riskToggle.querySelectorAll('button').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
      });
    });

    function open() { overlay.classList.add('is-open'); }
    function close() { overlay.classList.remove('is-open'); }

    fab.addEventListener('click', open);
    overlay.querySelector('.lotcalc-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlay.classList.contains('is-open')) close(); });

    overlay.querySelector('#lotcalcCompute').addEventListener('click', () => computeLot(refs));
    overlay.querySelector('#lotcalcReset').addEventListener('click', () => {
      refs.account.value = '';
      refs.balance.value = '';
      refs.sl.value = '';
      refs.risk.value = '';
      refs.result.classList.remove('is-visible');
      refs.result.innerHTML = '';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
