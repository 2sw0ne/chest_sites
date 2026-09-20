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

  // Style : DA CHEST (verre liquide, champs cerclés de rose au focus, boutons
  // de la DA). Les var(--chest-*, repli) gardent le widget correct même sur
  // une page qui ne charge pas chest-da.css.
  const STYLE = `
    .lotcalc-fab{
      position:fixed; right:24px; bottom:24px; z-index:260; width:52px; height:52px; border-radius:50%;
      border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; color:#fff;
      background:var(--chest-grad, linear-gradient(135deg,#fc1283,#f9a45e));
      box-shadow:0 14px 34px rgba(252,18,131,.4), inset 1px 1px 0 rgba(255,255,255,.35);
      transition:transform .2s var(--chest-ease, cubic-bezier(.16,1,.3,1)), box-shadow .2s;
    }
    .lotcalc-fab svg{ width:22px; height:22px; }
    .lotcalc-fab:hover{ transform:translateY(-2px) scale(1.04); box-shadow:0 18px 44px rgba(252,18,131,.55), inset 1px 1px 0 rgba(255,255,255,.35); }
    .lotcalc-fab:focus-visible{ outline:2px solid #fff; outline-offset:3px; }
    .lotcalc-overlay{
      position:fixed; inset:0; z-index:280; background:rgba(0,0,0,.55); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);
      display:flex; align-items:center; justify-content:center; padding:24px; opacity:0; pointer-events:none; transition:opacity .2s;
    }
    .lotcalc-overlay.is-open{ opacity:1; pointer-events:auto; }
    .lotcalc-modal{
      position:relative; width:100%; max-width:440px; max-height:88vh; overflow-y:auto;
      border:1px solid rgba(255,255,255,.14); border-radius:var(--chest-r-xl, 20px);
      background:linear-gradient(160deg, rgba(9,9,11,.82), rgba(9,9,11,.9));
      backdrop-filter:blur(34px) saturate(1.05); -webkit-backdrop-filter:blur(34px) saturate(1.05);
      box-shadow:0 30px 80px rgba(0,0,0,.6), inset 1.5px 1.5px 0 rgba(255,255,255,.2), inset -1.5px -1.5px 0 rgba(255,255,255,.06);
      padding:24px 24px 26px; color:var(--chest-ink, #f6f6f7);
      transform:translateY(12px) scale(.985); transition:transform .25s var(--chest-ease, cubic-bezier(.16,1,.3,1));
    }
    .lotcalc-modal::before{
      content:''; position:absolute; top:0; left:8%; right:8%; height:1px; pointer-events:none;
      background:linear-gradient(90deg, transparent, rgba(255,255,255,.55), transparent);
    }
    .lotcalc-overlay.is-open .lotcalc-modal{ transform:none; }
    .lotcalc-head{ display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:20px; }
    .lotcalc-step{ display:block; font-size:10px; letter-spacing:.24em; text-transform:uppercase; color:var(--chest-ink-3, #5c5c63); margin-bottom:8px; }
    .lotcalc-head h3{ font-size:22px; font-weight:700; letter-spacing:-.03em; line-height:1.1; margin:0; }
    .lotcalc-close{
      flex-shrink:0; width:32px; height:32px; border-radius:50%; cursor:pointer; font-size:13px;
      border:1px solid rgba(255,255,255,.14); background:transparent; color:var(--chest-ink-2, #9b9ba1);
      transition:border-color .18s, color .18s;
    }
    .lotcalc-close:hover{ border-color:rgba(249,164,94,.5); color:var(--chest-ink, #f6f6f7); }
    .lotcalc-row{ margin-bottom:14px; }
    .lotcalc-row label{
      display:block; font-size:10px; font-weight:600; letter-spacing:.16em; text-transform:uppercase;
      color:var(--chest-ink-3, #5c5c63); margin-bottom:7px;
    }
    .lotcalc-row select, .lotcalc-row input{
      width:100%; height:42px; box-sizing:border-box; border:1px solid rgba(255,255,255,.14); border-radius:12px;
      background:rgba(255,255,255,.03); color:var(--chest-ink, #f6f6f7);
      font:inherit; font-size:13.5px; padding:0 13px; transition:border-color .18s, box-shadow .18s, background .18s;
    }
    .lotcalc-row select option, .lotcalc-row select optgroup{ background:#0c0c0e; color:#f6f6f7; }
    .lotcalc-row select:focus, .lotcalc-row input:focus{
      outline:none; border-color:rgba(252,18,131,.6); box-shadow:0 0 0 3px rgba(252,18,131,.15); background:rgba(255,255,255,.05);
    }
    .lotcalc-row input::placeholder{ color:var(--chest-ink-3, #5c5c63); }
    .lotcalc-grid2{ display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    @media (max-width:420px){ .lotcalc-grid2{ grid-template-columns:1fr; gap:0; } }
    .lotcalc-risk-toggle{
      display:inline-flex; gap:2px; padding:3px; margin-bottom:8px;
      border:1px solid rgba(255,255,255,.12); border-radius:999px; background:rgba(255,255,255,.03);
    }
    .lotcalc-risk-toggle button{
      border:none; cursor:pointer; font:inherit; font-size:11.5px; font-weight:600; padding:6px 14px; border-radius:999px;
      background:transparent; color:var(--chest-ink-2, #9b9ba1); transition:color .18s, background .18s;
    }
    .lotcalc-risk-toggle button:hover{ color:var(--chest-ink, #f6f6f7); }
    .lotcalc-risk-toggle button.is-active{ background:var(--chest-ink, #f6f6f7); color:var(--chest-bg, #050505); font-weight:700; }
    .lotcalc-actions{ display:flex; gap:10px; margin-top:8px; }
    .lotcalc-actions button{ flex:1; justify-content:center; }
    .lotcalc-result{ margin-top:20px; padding-top:18px; border-top:1px solid var(--chest-rule, rgba(255,255,255,.08)); display:none; }
    .lotcalc-result.is-visible{ display:block; }
    .lotcalc-result__lot{
      font-size:38px; font-weight:700; letter-spacing:-.04em; line-height:1.1; margin-bottom:8px; padding-bottom:.06em;
      background:linear-gradient(120deg,#fff 20%,#f9a45e 95%); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent;
      font-variant-numeric:tabular-nums;
    }
    .lotcalc-result__row{ display:flex; align-items:center; justify-content:space-between; gap:12px; padding:9px 0; font-size:12.5px; border-bottom:1px solid var(--chest-rule-row, rgba(255,255,255,.055)); color:var(--chest-ink-2, #9b9ba1); }
    .lotcalc-result__row:last-of-type{ border-bottom:none; }
    .lotcalc-result__row b{ font-variant-numeric:tabular-nums; color:var(--chest-ink, #f6f6f7); font-weight:600; text-align:right; }
    .lotcalc-warning{ margin-top:12px; padding:11px 13px; border-radius:12px; background:rgba(232,179,57,.1); border:1px solid rgba(232,179,57,.32); color:var(--chest-amber, #e8b339); font-size:12px; line-height:1.5; }
    .lotcalc-error{ margin-top:12px; padding:11px 13px; border-radius:12px; background:rgba(255,77,94,.1); border:1px solid rgba(255,77,94,.3); color:var(--chest-red, #ff4d5e); font-size:12px; line-height:1.5; }
    .lotcalc-hint{ font-size:11px; color:var(--chest-ink-3, #5c5c63); margin-top:4px; }
    @media (prefers-reduced-motion:reduce){ .lotcalc-modal, .lotcalc-fab, .lotcalc-overlay{ transition:none; } }
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
    fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="3"/><path d="M8.5 7.5h7"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01" stroke-width="2.4"/></svg>';
    document.body.appendChild(fab);

    const overlay = document.createElement('div');
    overlay.className = 'lotcalc-overlay';
    overlay.innerHTML = `
      <div class="lotcalc-modal">
        <div class="lotcalc-head">
          <div><span class="lotcalc-step">Outil — Risque</span><h3>Calculatrice de lots</h3></div>
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
          <div class="lotcalc-risk-toggle chest-seg" id="lotcalcRiskToggle">
            <button type="button" data-mode="pct" class="is-active">%</button>
            <button type="button" data-mode="usd">$</button>
          </div>
          <input type="number" id="lotcalcRisk" min="0" step="0.1" placeholder="1">
        </div>

        <div class="lotcalc-actions">
          <button type="button" class="chest-btn-2" id="lotcalcReset">Réinitialiser</button>
          <button type="button" class="chest-btn" id="lotcalcCompute">Calculer</button>
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
