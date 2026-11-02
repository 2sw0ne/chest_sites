// Dashboard v3 (2026-11-02) : bulles ajoutées autour des chiffres écrits par dashboard.js.
// Écoute 'chest:dash-render' (émis à chaque rendu de période) et dessine :
// l'anneau du winrate, la jauge du drawdown, la courbe miniature de l'equity,
// le capital glissant 24 h / 7 j / 30 j et « Ce qui demande ton attention ».
// Ne modifie aucune donnée : lecture seule du compte actif et du calendrier.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => { const m = String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.').replace('−', '-').match(/[-+]?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };
  const fmtPct = (v, d = 2) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d).replace('.', ',')} %`;
  const fmtUsd = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v)).toLocaleString('fr-FR')} $`;
  const DAY = 86400000;
  const PERIOD_FR = { day: "aujourd'hui", week: 'cette semaine', month: 'ce mois', all: 'cette année', full: 'depuis le début' };

  // ---------- En-tête ----------
  function paintHead() {
    const d = new Date();
    const date = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    $('v3Date').textContent = date.charAt(0).toUpperCase() + date.slice(1);
    const h = d.getHours();
    const hello = h < 5 ? 'Bonsoir' : h < 18 ? 'Bonjour' : 'Bonsoir';
    let first = '';
    try { const u = window.CHESTAccounts && CHESTAccounts.getUser(); first = (u && (u.firstName || u.first_name)) || ''; } catch (e) {}
    $('v3Hello').innerHTML = first ? `${hello}, <em>${esc(first)}</em>` : hello;
  }

  // ---------- Objectifs du compte (libellés anglais de dashboard.js) ----------
  // Valeur en % : « -$210.40 (-0.84%) » → -0.84 ; « -4% » → -4. Une cible de perte reste négative.
  const pctOf = (v) => { const m = String(v == null ? '' : v).replace(/\s/g, '').replace('−', '-').match(/\(([-+]?\d+(?:[.,]\d+)?)%\)/); return m ? parseFloat(m[1].replace(',', '.')) : num(v); };
  let objectives = null;
  function objective(a, label) {
    const o = Array.isArray(objectives) ? objectives.find((x) => x.label === label) : null;
    if (!o) return null;
    let tgt = pctOf(o.target);
    if (/Loss/.test(label) && tgt > 0) tgt = -tgt;
    return { cur: pctOf(o.current), tgt, ok: o.ok };
  }

  // ---------- Historique jour par jour ----------
  function days(a) {
    const list = (a && Array.isArray(a.dailyHistory)) ? a.dailyHistory : [];
    return list.map((x) => ({ t: new Date(x.date).getTime(), pnl: +x.pnl || 0, pct: +x.pct || 0 }))
      .filter((x) => isFinite(x.t)).sort((p, q) => p.t - q.t);
  }

  function paintRing(d) {
    const w = Math.max(0, Math.min(100, num(d && d.winrate) || 0));
    $('v3WinArc').setAttribute('stroke-dasharray', `${w} 100`);
  }

  function paintDD(a, d) {
    const dd = Math.abs(num(d && d.dd) || 0);
    const lim = objective(a, 'Max Loss');
    const meter = $('v3DDMeter'), card = $('v3DDCard');
    if (lim && lim.tgt) {
      const max = Math.abs(lim.tgt), used = Math.min(1, dd / max);
      meter.hidden = false;
      $('v3DDFill').style.width = `${(used * 100).toFixed(1)}%`;
      card.dataset.tone = used >= .7 ? 'neg' : used >= .4 ? 'amber' : 'pos';
      $('v3DDLimit').innerHTML = `Limite ${esc(fmtPct(-max, 0))} · marge <b>${esc(Math.max(0, max - dd).toFixed(2).replace('.', ','))} %</b>`;
    } else {
      meter.hidden = true;
      card.dataset.tone = 'amber';
      $('v3DDLimit').textContent = '';
    }
  }

  function paintSpark(a) {
    const svg = $('v3Spark');
    const list = days(a).slice(-40);
    if (list.length < 2) { svg.innerHTML = ''; return; }
    let cum = 0;
    const pts = list.map((x) => (cum += x.pnl));
    const lo = Math.min(0, ...pts), hi = Math.max(0, ...pts), span = hi - lo || 1;
    const W = 200, H = 48, pad = 6;
    const xy = pts.map((v, i) => [i / (pts.length - 1) * W, pad + (1 - (v - lo) / span) * (H - pad * 2)]);
    const line = xy.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    svg.innerHTML = `<defs><linearGradient id="v3SparkFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgb(77,141,255)" stop-opacity=".35"/><stop offset="1" stop-color="rgb(77,141,255)" stop-opacity="0"/></linearGradient></defs>`
      + `<path class="area" fill="url(#v3SparkFill)" d="${line} L${W} ${H} L0 ${H} Z"/><path class="line" d="${line}"/>`;
  }

  function paintRoll(a) {
    const list = days(a);
    const bal = +(a && (a.equity || a.balance)) || 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const rows = [['24 h', 1], ['7 j', 7], ['30 j', 30]].map(([k, n]) => {
      const from = today.getTime() - (n - 1) * DAY;
      let pnl = list.filter((x) => x.t >= from).reduce((s, x) => s + x.pnl, 0);
      if (n === 1 && a && isFinite(+a.today)) pnl = +a.today;
      const base = bal - pnl;
      return { k, pnl, pct: base > 0 ? pnl / base * 100 : 0 };
    });
    const scale = Math.max(.5, ...rows.map((r) => Math.abs(r.pct)));
    $('v3Roll').innerHTML = rows.map((r) => {
      const cls = r.pnl > 0 ? 'pos' : r.pnl < 0 ? 'neg' : '';
      const w = Math.min(50, Math.abs(r.pct) / scale * 50);
      return `<div class="v3-roll__row"><span class="v3-roll__k">${r.k}</span>`
        + `<span class="v3-roll__bar"><i class="${cls}" style="width:${w.toFixed(1)}%"></i></span>`
        + `<span class="v3-roll__v ${cls}">${esc(fmtPct(r.pct))}<small>${esc(fmtUsd(r.pnl))}</small></span></div>`;
    }).join('');
    const lim = objective(a, 'Max Loss');
    const box = $('v3RollLimit');
    if (lim && lim.tgt) {
      const max = Math.abs(lim.tgt), used = Math.abs(Math.min(0, lim.cur || 0));
      box.hidden = false;
      box.dataset.tone = used / max >= .7 ? 'neg' : used / max >= .4 ? 'amber' : 'pos';
      $('v3RollLimitTxt').textContent = `${used.toFixed(2).replace('.', ',')} % / ${max} %`;
      $('v3RollLimitFill').style.width = `${Math.min(100, used / max * 100).toFixed(1)}%`;
    } else box.hidden = true;
  }

  // ---------- Priorités ----------
  let nextNews = undefined; // undefined = pas encore lu, null = rien à venir
  async function loadNews() {
    const url = (window.CHEST_CONFIG && window.CHEST_CONFIG.calendarApiUrl) || 'data/calendar.json';
    try {
      const data = await fetch(url, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null));
      const now = Date.now();
      const up = ((data && data.events) || []).filter((e) => e.importance === 'high' && !e.released && e.date && e.time)
        .map((e) => ({ e, t: new Date(`${e.date}T${e.time}:00`).getTime() }))
        .filter((x) => isFinite(x.t) && x.t > now - 5 * 60000)
        .sort((p, q) => p.t - q.t);
      nextNews = up[0] || null;
    } catch (e) { nextNews = null; }
    paintAttn(lastAccount);
  }

  function inWords(ms) {
    const m = Math.max(0, Math.round(ms / 60000));
    if (m < 60) return `dans ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `dans ${h} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}`;
    const d = Math.round(h / 24);
    return d === 1 ? 'demain' : `dans ${d} jours`;
  }

  const ICONS = {
    news: '<svg viewBox="0 0 24 24"><path d="M12 3v2M5.6 5.6l1.4 1.4M3 12h2M18.4 5.6 17 7M21 12h-2"/><path d="M8 16a4 4 0 1 1 8 0"/><path d="M4 20h16"/></svg>',
    shield: '<svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg>',
    alert: '<svg viewBox="0 0 24 24"><path d="M12 4 3 20h18z"/><path d="M12 10v4M12 17v.5"/></svg>',
    target: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".6"/></svg>',
    pulse: '<svg viewBox="0 0 24 24"><path d="M3 12h4l3-7 4 14 3-7h4"/></svg>',
    flask: '<svg viewBox="0 0 24 24"><path d="M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3"/><path d="M7.5 15h9"/></svg>',
  };

  function card({ tone, icon, t, s, tag, href }) {
    const inner = `<span class="v3-ic">${ICONS[icon]}</span><span><span class="v3-pri__t">${esc(t)}</span><span class="v3-pri__s">${esc(s)}</span></span>${tag ? `<span class="v3-pri__tag">${esc(tag)}</span>` : '<span></span>'}`;
    return href ? `<a class="v3-pri" data-tone="${tone}" href="${href}">${inner}</a>` : `<div class="v3-pri" data-tone="${tone}">${inner}</div>`;
  }

  function paintAttn(a) {
    if (!a) return;
    const out = [];
    let urgent = 0;

    // 1. Perte du jour vs limite du challenge
    const daily = objective(a, 'Max Daily Loss');
    if (daily && daily.tgt) {
      const max = Math.abs(daily.tgt), used = Math.abs(Math.min(0, daily.cur || 0)), r = used / max;
      if (r >= .5) { urgent++; out.push(card({ tone: 'neg', icon: 'alert', t: 'Perte du jour proche de la limite', s: `${used.toFixed(2).replace('.', ',')} % sur ${max} % autorisés aujourd'hui.`, tag: 'Urgent' })); }
      else out.push(card({ tone: 'pos', icon: 'shield', t: 'Risque du jour sous contrôle', s: `Il te reste ${(max - used).toFixed(2).replace('.', ',')} % avant la limite journalière.`, tag: 'OK' }));
    }

    // 2. Prochaine annonce forte
    if (nextNews) {
      const ms = nextNews.t - Date.now(), soon = ms < 60 * 60000;
      if (soon) urgent++;
      out.push(card({ tone: soon ? 'amber' : 'orange', icon: 'news', t: `${nextNews.e.country} · ${nextNews.e.event}`, s: `Annonce forte ${inWords(ms)} (${nextNews.e.time}).`, tag: soon ? 'Bientôt' : 'À venir', href: 'calendar.html' }));
    } else if (nextNews === null) {
      out.push(card({ tone: 'blue', icon: 'news', t: 'Aucune annonce forte en vue', s: 'Le calendrier ne prévoit rien de majeur pour l\'instant.', href: 'calendar.html' }));
    }

    // 3. Positions ouvertes
    const rows = document.querySelectorAll('#openPosList .openpos__row:not(.is-head)').length;
    if (!$('openPosSection').hidden && rows) {
      const fl = num($('resPnl').textContent);
      out.push(card({ tone: 'blue', icon: 'pulse', t: `${rows} position${rows > 1 ? 's' : ''} ouverte${rows > 1 ? 's' : ''}`, s: fl != null ? `Latent ${$('resPnl').textContent.trim()}.` : 'Suivies en direct.', tag: 'Live', href: '#openPosSection' }));
    }

    // 4. Objectif de profit
    const goal = objective(a, 'Profit Target');
    if (goal && goal.tgt && !goal.ok) {
      const left = Math.max(0, goal.tgt - (goal.cur || 0));
      out.push(card({ tone: 'pink', icon: 'target', t: `Objectif ${fmtPct(goal.tgt, 0)}`, s: `Encore ${left.toFixed(1).replace('.', ',')} % pour valider la phase.` }));
    }

    // 5. Rappel de backtest
    let last = 0;
    try { last = Math.max(0, ...JSON.parse(localStorage.getItem('chest_backtests') || '[]').map((b) => new Date(b.createdAt).getTime() || 0)); } catch (e) {}
    const age = last ? Math.floor((Date.now() - last) / DAY) : null;
    if (age == null || age >= 7) {
      out.push(card({ tone: 'orange', icon: 'flask', t: age == null ? 'Aucun backtest enregistré' : `Dernier backtest il y a ${age} jours`, s: 'Une session de backtest garde ta lecture du marché affûtée.', href: 'backtesting.html' }));
    }

    $('v3Attn').innerHTML = out.length ? out.slice(0, 4).join('') : '<p class="v3-attn__empty">Rien d\'urgent. Ton compte est en ordre.</p>';
    const c = $('v3AttnCount');
    c.textContent = urgent;
    c.classList.toggle('is-zero', !urgent);
    c.title = urgent ? `${urgent} point${urgent > 1 ? 's' : ''} urgent${urgent > 1 ? 's' : ''}` : 'Rien d\'urgent';
  }

  // ---------- Branchement ----------
  let lastAccount = null;
  document.addEventListener('chest:dash-render', (ev) => {
    const { account, period, data } = ev.detail || {};
    lastAccount = account;
    objectives = ev.detail.objectives;
    $('v3PeriodName').textContent = PERIOD_FR[period] || 'ce mois';
    paintRing(data);
    paintDD(account, data);
    paintSpark(account);
    paintRoll(account);
    paintAttn(account);
  });

  // ancre interne (#openPosSection) : défilement doux dans la page
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a.v3-pri[href^="#"]');
    if (!a) return;
    e.preventDefault();
    const el = document.querySelector(a.getAttribute('href'));
    if (el) el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  });

  paintHead();
  loadNews();
  setInterval(() => { paintHead(); if (lastAccount) paintAttn(lastAccount); }, 60000);
})();
