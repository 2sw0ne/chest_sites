(() => {
  'use strict';

  const ACCOUNTS_KEY = 'chesting_accounts';
  const ACTIVE_KEY = 'chesting_active_account';

  // Exemple de données — partagées par les comptes de démonstration.
  const SAMPLE_PERIODS = {
    day: {
      profit: '+1.2%', profitSub: '+$154 aujourd\'hui', rr: '1.8', winrate: '58%', winrateSub: '7/12 trades',
      dd: '-2.1%', ddSub: 'pic → creux du jour',
      equity: [12480, 12510, 12470, 12550, 12600, 12580, 12660, 12630, 12700, 12680, 12750, 12813]
    },
    week: {
      profit: '+4.6%', profitSub: '+$560 cette semaine', rr: '2.0', winrate: '61%', winrateSub: '28/46 trades',
      dd: '-4.8%', ddSub: 'pic → creux de la semaine',
      equity: [12250, 12310, 12280, 12400, 12470, 12420, 12550, 12610, 12580, 12700, 12760, 12813]
    },
    month: {
      profit: '+12.4%', profitSub: '+$1 412 ce mois', rr: '2.1', winrate: '61%', winrateSub: '112/184 trades',
      dd: '-8.3%', ddSub: 'pic → creux du mois',
      equity: [11400, 11550, 11480, 11700, 11650, 11900, 11820, 12100, 12050, 12300, 12500, 12420, 12650, 12750, 12813]
    },
    all: {
      profit: '+28.1%', profitSub: '+$2 812 depuis $10 000', rr: '2.0', winrate: '59%', winrateSub: '640/1085 trades',
      dd: '-14.6%', ddSub: 'pire drawdown enregistré',
      equity: [10000, 10250, 10100, 10500, 10350, 10800, 10650, 11100, 10950, 11400, 11250, 11700, 11550, 12000, 12813]
    }
  };

  const SAMPLE_OBJECTIVES = [
    { label: 'Minimum Trading Days', target: '5 jours', current: '12 jours', ok: true },
    { label: 'Max Daily Loss', target: '-$1 000.00 (4%)', current: '-$210.40 (-0.84%)', ok: true },
    { label: 'Max Loss', target: '-$2 000.00 (8%)', current: '-$680.20 (-2.72%)', ok: true },
    { label: 'Profit Target', target: '$2 500.00 (10%)', current: '+$2 812.00 (+11.2%)', ok: true }
  ];
  const SAMPLE_CAL_14 = [12, -34, 210, 0, 87, -55, 143, 0, -22, 198, 61, -40, 176, 154.2];

  const DEFAULT_ACCOUNTS = [
    { id: 'acc-vantage', name: 'Compte Démo Vantage', number: '10045782', type: 'Démo', broker: 'Vantage · MT5',
      balance: 12480.30, equity: 12812.90, pnl: 332.60, today: 154.20, example: true },
    { id: 'acc-ftmo', name: 'Challenge FTMO', number: '88213045', type: '2-Step', broker: 'FTMO · MT5',
      balance: 22340.50, equity: 22812.90, pnl: 472.40, today: -68.10, example: true }
  ];

  let chart, unit = 'dollar';
  let liveAccount = null; // rempli si data/data.json existe (pont export_mt5.py)

  function loadAccounts() {
    let list;
    try {
      const raw = localStorage.getItem(ACCOUNTS_KEY);
      list = raw ? JSON.parse(raw) : null;
    } catch (e) { list = null; }
    if (!list) {
      list = DEFAULT_ACCOUNTS;
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
    }
    return liveAccount ? [liveAccount, ...list] : list;
  }
  function saveAccounts(list) {
    // Le compte live (MT5) n'est jamais persisté — il est reconstruit à chaque chargement depuis data.json.
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list.filter((a) => a.id !== 'mt5-live')));
  }
  function activeId(accounts) { return localStorage.getItem(ACTIVE_KEY) || accounts[0].id; }
  function initials(name) { return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase(); }
  function money(n) { return (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  async function tryLoadLiveData() {
    try {
      const res = await fetch('data/data.json', { cache: 'no-store' });
      if (!res.ok) return null;
      const d = await res.json();
      return {
        id: 'mt5-live', name: '🔴 ' + (d.account.name || 'MT5 (connecté)'), number: d.account.number,
        type: d.account.type, broker: d.account.broker,
        balance: d.account.balance, equity: d.account.equity, pnl: d.account.pnl, today: d.account.today,
        example: false, live: true, syncedAt: d.generated_at,
        periods: { day: d.day, week: d.week, month: d.month, all: d.all },
        objectives: d.objectives, calendar14: d.calendar14
      };
    } catch (e) { return null; }
  }

  function renderAccountMenu(accounts, active) {
    const list = document.getElementById('accMenuList');
    list.innerHTML = accounts.map((a) => `
      <button class="acc-menu__item ${a.id === active.id ? 'is-active' : ''}" data-id="${a.id}">
        <span class="avatar">${a.live ? '🔴' : initials(a.name)}</span>
        <span><strong>${a.name}</strong><span>#${a.number} · ${a.type}</span></span>
      </button>
    `).join('');
    list.querySelectorAll('.acc-menu__item').forEach((btn) => {
      btn.addEventListener('click', () => {
        localStorage.setItem(ACTIVE_KEY, btn.dataset.id);
        closeMenu();
        renderAll();
      });
    });
  }

  function renderAccountHeader(a) {
    document.getElementById('accAvatar').textContent = a.live ? '🔴' : initials(a.name);
    document.getElementById('accName').textContent = a.name;
    document.getElementById('accSub').textContent = `#${a.number} · ${a.type}`;
    document.getElementById('accSync').innerHTML = a.live
      ? `Synchronisé via <code>export_mt5.py</code> · ${new Date(a.syncedAt).toLocaleString('fr-FR')}`
      : `Dernière synchro il y a 2 min · ${a.broker} · pont local <code>export_mt5.py</code>`;
    document.getElementById('resBalance').textContent = money(a.balance);
    document.getElementById('resEquity').textContent = money(a.equity);
    const pnlEl = document.getElementById('resPnl');
    pnlEl.textContent = (a.pnl >= 0 ? '+' : '') + money(a.pnl);
    pnlEl.className = a.pnl >= 0 ? 'pos' : 'neg';
    const todayEl = document.getElementById('resToday');
    todayEl.textContent = (a.today >= 0 ? '+' : '') + money(a.today);
    todayEl.className = a.today >= 0 ? 'pos' : 'neg';

    const badge = document.getElementById('accExampleBadge');
    if (badge) badge.style.display = a.example ? '' : 'none';
  }

  function renderObjectives(a) {
    const list = (a && a.objectives) || SAMPLE_OBJECTIVES;
    document.getElementById('objectivesList').innerHTML = list.map((o) => `
      <div class="objective-row">
        <div class="label"><b>${o.label}</b>Limite : ${o.target}</div>
        <div class="objective-row__wrap">
          <div class="value ${o.ok ? 'pos' : 'neg'}">${o.current}</div>
          <span class="check ${o.ok ? 'ok' : 'ko'}">${o.ok ? '✓' : '✕'}</span>
        </div>
      </div>
    `).join('');
  }

  function renderMiniCalendar(a) {
    const series = (a && a.calendar14) || SAMPLE_CAL_14;
    const today = new Date();
    const cells = series.map((pnl, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (series.length - 1 - i));
      const cls = pnl > 0 ? 'pos' : pnl < 0 ? 'neg' : '';
      const pnlLabel = pnl === 0 ? '—' : (pnl > 0 ? '+' : '') + '$' + Math.abs(pnl).toFixed(0);
      return `<div class="mini-cal__cell ${cls}"><span class="d">${d.getDate()}/${d.getMonth() + 1}</span><span class="p">${pnlLabel}</span></div>`;
    }).join('');
    document.getElementById('miniCalGrid').innerHTML = cells;
    const total = series.reduce((s, v) => s + v, 0);
    document.getElementById('calTotal').textContent = (total >= 0 ? '+' : '') + money(total);
  }

  function currentAccount() {
    const accounts = loadAccounts();
    return accounts.find((a) => a.id === activeId(accounts)) || accounts[0];
  }

  function render(period) {
    const a = currentAccount();
    const d = (a.periods || SAMPLE_PERIODS)[period];
    document.getElementById('kpiProfit').textContent = d.profit;
    document.getElementById('kpiProfitSub').textContent = d.profitSub;
    document.getElementById('kpiRR').textContent = d.rr;
    document.getElementById('kpiWinrate').textContent = d.winrate;
    document.getElementById('kpiWinrateSub').textContent = d.winrateSub;
    document.getElementById('kpiDD').textContent = d.dd;
    document.getElementById('kpiDDSub').textContent = d.ddSub;
    drawChart(d);
  }

  function drawChart(d) {
    const isDark = !document.documentElement.hasAttribute('data-theme') || document.documentElement.getAttribute('data-theme') !== 'light';
    const grid = isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.07)';
    const tick = isDark ? '#9b9ba1' : '#65656b';

    const base = d.equity[0] || 1;
    const series = unit === 'percent' ? d.equity.map((v) => ((v - base) / base * 100)) : d.equity;

    const ctx = document.getElementById('equityChart');
    if (!ctx || !window.Chart) return;
    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: series.map((_, i) => i + 1),
        datasets: [{
          data: series, borderColor: '#ff3d7f', borderWidth: 2, pointRadius: 0, tension: .3,
          fill: true, backgroundColor: 'rgba(255,61,127,.08)'
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { grid: { color: grid }, ticks: { color: tick, callback: (v) => unit === 'percent' ? v.toFixed(1) + '%' : '$' + v } },
          x: { grid: { display: false }, ticks: { color: tick, maxTicksLimit: 8 } }
        }
      }
    });
  }

  function closeMenu() { document.getElementById('accMenu').classList.remove('is-open'); }

  function renderAll() {
    const a = currentAccount();
    renderAccountMenu(loadAccounts(), a);
    renderAccountHeader(a);
    renderObjectives(a);
    renderMiniCalendar(a);
    const activePeriod = document.querySelector('#periodPills .is-active')?.dataset.period || 'month';
    render(activePeriod);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    liveAccount = await tryLoadLiveData();
    if (liveAccount && !localStorage.getItem(ACTIVE_KEY)) {
      localStorage.setItem(ACTIVE_KEY, 'mt5-live'); // priorité aux vraies données dès qu'elles existent
    }
    renderAll();

    const pills = document.querySelectorAll('#periodPills button');
    pills.forEach((btn) => {
      btn.addEventListener('click', () => {
        pills.forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        render(btn.dataset.period);
      });
    });

    document.getElementById('accSwitcherBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('accMenu').classList.toggle('is-open');
    });
    document.addEventListener('click', (e) => {
      if (!document.getElementById('accSwitcher').contains(e.target)) closeMenu();
    });

    document.getElementById('accAddBtn').addEventListener('click', () => {
      const name = prompt('Nom du nouveau compte :');
      if (!name || !name.trim()) return;
      const accounts = loadAccounts().filter((a) => a.id !== 'mt5-live');
      const id = 'acc-' + Date.now();
      const seed = 8000 + Math.floor(Math.random() * 90000);
      accounts.push({
        id, name: name.trim(), number: String(seed), type: 'Démo', broker: 'À connecter',
        balance: 10000, equity: 10000, pnl: 0, today: 0, example: true
      });
      saveAccounts(accounts);
      localStorage.setItem(ACTIVE_KEY, id);
      closeMenu();
      renderAll();
      showToast('Compte ajouté ✓');
    });

    const unitButtons = document.querySelectorAll('#unitToggle button');
    unitButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        unitButtons.forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        unit = btn.dataset.unit;
        render(document.querySelector('#periodPills .is-active').dataset.period);
      });
    });

    const moreToggle = document.getElementById('moreToggle');
    const morePanel = document.getElementById('morePanel');
    moreToggle.addEventListener('click', () => {
      const isOpen = moreToggle.classList.toggle('is-open');
      morePanel.style.maxHeight = isOpen ? morePanel.scrollHeight + 'px' : '0px';
    });

    document.addEventListener('chesting:theme', () => render(document.querySelector('#periodPills .is-active').dataset.period));
  });
})();
