// CHEST — page Membres (admin) : performance, hiérarchie, liste, nouveaux membres, activité des élèves.
// Données : GET /members (fiche de chaque membre, catégorie calculée côté serveur) + GET /admin/stats?days=.
(() => {
  'use strict';
  const A = window.CHESTAccounts;
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CHEV = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.5 6 7.5l3-3"/></svg>';
  const CHEV_R = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 3 7.5 6l-3 3"/></svg>';
  const CROSS = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 3l6 6M9 3 3 9"/></svg>';

  // ------------------------------------------------------------ Hiérarchie (du sommet à la base)
  // Badges provisoires : un hexagone aux couleurs du rang + un pictogramme. À remplacer par les vrais badges.
  const TIERS = [
    { key: 'admin', name: 'Admin', group: 'team', rights: 'Tout CHEST et la gestion des membres', c1: '#fc1283', c2: '#f9a45e', g: 'M6.5 15.5 5.6 9l3.6 2.6L12 7l2.8 4.6L18.4 9l-.9 6.5zM7 17.5h10' },
    { key: 'educator', name: 'Éducateur', group: 'team', rights: 'Accès complet · publiera bientôt dans School', c1: '#b79bff', c2: '#6b4dff', g: 'M4 10.5 12 7l8 3.5-8 3.5zM7.5 12v3.2c0 1 2 2.3 4.5 2.3s4.5-1.3 4.5-2.3V12' },
    { key: 'privilege', name: 'Privilège', group: 'access', rights: 'Accès complet offert par toi, avec ou sans date de fin', c1: '#9dbcff', c2: '#3f7bff', g: 'M12 6.2l1.5 4.3 4.3 1.5-4.3 1.5L12 17.8l-1.5-4.3L6.2 12l4.3-1.5z' },
    { key: 'allstar', name: 'Allstar', group: 'access', rights: 'Tout CHEST et l’automatisation complète (bientôt)', c1: '#ffe39a', c2: '#d99a1e', g: 'M12 6.3l1.7 3.6 3.9.5-2.9 2.7.7 3.9L12 15.1 8.6 17l.7-3.9-2.9-2.7 3.9-.5z' },
    { key: 'premium', name: 'Premium', group: 'access', rights: 'Tout CHEST, School, BERICH et accompagnement', c1: '#ffab6b', c2: '#ff4f3a', g: 'M8.6 7.5h6.8l2.6 3.4-6 6.6-6-6.6zM6 10.9h12M10.3 7.5 12 17.5l1.7-10' },
    { key: 'essentiel', name: 'Essentiel', group: 'access', rights: 'Toute la plateforme, sauf School et BERICH', c1: '#5ff0bd', c2: '#13a274', g: 'M7.8 12.4l2.8 2.8 5.6-6' },
    { key: 'trial', name: 'Essai', group: 'access', rights: '7 jours d’Essentiel, données sur l’appareil', c1: '#7ce3f5', c2: '#0f93ad', g: 'M8.6 6.5h6.8M8.6 17.5h6.8M9.3 6.5c0 3.4 5.4 3.6 5.4 5.5s-5.4 2.1-5.4 5.5M14.7 6.5c0 3.4-5.4 3.6-5.4 5.5s5.4 2.1 5.4 5.5' },
    { key: 'expired', name: 'Ancien', group: 'out', rights: 'Abonnement ou essai terminé', c1: '#ff8f9a', c2: '#a8253a', g: 'M12 7.4a4.6 4.6 0 1 0 0 9.2 4.6 4.6 0 0 0 0-9.2zM12 9.6V12l1.7 1.2' },
    { key: 'none', name: 'Sans accès', group: 'out', rights: 'Inscrit, aucune offre choisie', c1: '#a0a0a8', c2: '#4a4a52', g: 'M8.5 12h7' },
  ];
  const TIER = Object.fromEntries(TIERS.map((t, i) => [t.key, Object.assign(t, { rank: i })]));
  const GROUPS = { team: 'Équipe', access: 'Avec accès', out: 'Sans accès' };
  const TABS = [
    { key: 'all', label: 'Tous', test: () => true },
    { key: 'team', label: 'Équipe', test: (m) => ['admin', 'educator'].includes(cat(m)) },
    { key: 'privilege', label: 'Privilège', test: (m) => cat(m) === 'privilege' },
    { key: 'subs', label: 'Abonnés', test: (m) => ['allstar', 'premium', 'essentiel'].includes(cat(m)) },
    { key: 'trial', label: 'Essai', test: (m) => cat(m) === 'trial' },
    { key: 'expired', label: 'Anciens', test: (m) => cat(m) === 'expired' },
    { key: 'none', label: 'Sans accès', test: (m) => cat(m) === 'none' },
    { key: 'blocked', label: 'Bloqués', test: (m) => m.status === 'blocked', hideEmpty: true },
  ];

  function badge(key, size) {
    const t = TIER[key] || TIER.none;
    const id = 'amg-' + key;
    return `<svg class="am-badge" width="${size}" height="${size}" viewBox="0 0 24 24" style="--glow:${t.c1}66" aria-hidden="true">
      <defs><linearGradient id="${id}-${size}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.c1}"/><stop offset="1" stop-color="${t.c2}"/></linearGradient></defs>
      <path d="M12 1.6 20.9 6.8v10.4L12 22.4 3.1 17.2V6.8z" fill="url(#${id}-${size})" stroke="rgba(255,255,255,.35)" stroke-width=".8" stroke-linejoin="round"/>
      <path d="M12 2.6 20 7.2v3.2C15.5 8.6 8.5 8.6 4 10.4V7.2z" fill="rgba(255,255,255,.16)"/>
      <path d="${t.g}" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }
  const tierStyle = (key) => { const t = TIER[key] || TIER.none; return `--c1:${t.c1};--c2:${t.c2}`; };

  // ------------------------------------------------------------ Formats
  const PAGE_LABELS = { dashboard: 'Dashboard', backtesting: 'Backtesting', 'backtest-view': 'Rapports de backtest', 'backtest-add': 'Ajout de backtest', journal: 'Journal', strategies: 'Stratégies', calendar: 'Calendrier', berich: 'BERICH', school: 'School', account: 'Compte', connect: 'Connexion de compte', 'vps-guide': 'Guide VPS', 'admin-members': 'Admin', welcome: 'Welcome', offres: 'Offres' };
  const ANSWERS = {
    made: { yes: 'Oui', no: 'Non' },
    amount: { lt1k: 'Moins de 1 000 €', '1k-10k': '1 000 à 10 000 €', '10k-50k': '10 000 à 50 000 €', gt50k: 'Plus de 50 000 €' },
    goal: { learn: 'Apprendre de zéro', improve: 'S’améliorer', structure: 'Structurer', automate: 'Automatiser' },
    budget: { lt100: '< 100 €/mois', '100-300': '100 à 300 €/mois', '300-1000': '300 à 1 000 €/mois', gt1000: '> 1 000 €/mois' },
    reco: { essentiel: 'Essentiel', premium: 'Premium', allstar: 'Allstar' },
  };
  const STATUS = { active: 'Actif', trialing: 'Essai en cours', canceling: 'Résiliation programmée', past_due: 'Paiement en retard', canceled: 'Terminé', manual: 'Réglé à la main' };
  const DAY = 86400000;
  const initials = (m) => `${(m.firstName || '?')[0] || '?'}${(m.lastName || '?')[0] || ''}`.toUpperCase();
  const fullName = (m) => `${m.firstName || ''} ${m.lastName || ''}`.trim() || m.email;
  const dt = (iso, withTime) => { if (!iso) return '—'; const d = new Date(iso); if (isNaN(d)) return '—'; return d.toLocaleDateString('fr-FR', withTime ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' }); };
  const ms = (iso) => { const t = iso ? Date.parse(iso) : NaN; return isNaN(t) ? null : t; };
  const ago = (iso) => {
    const t = ms(iso); if (t == null) return 'jamais';
    const m = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (m < 2) return 'à l’instant';
    if (m < 60) return `il y a ${m} min`;
    const h = Math.round(m / 60); if (h < 24) return `il y a ${h} h`;
    const d = Math.round(h / 24); return d < 45 ? `il y a ${d} j` : dt(iso);
  };
  const daysUntil = (iso) => { const t = ms(iso); return t == null ? null : Math.ceil((t - Date.now()) / DAY); };
  const eur = (v, digits) => (Number(v) || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: digits == null ? 0 : digits, minimumFractionDigits: digits == null ? 0 : digits });
  const eurCents = (c) => c ? eur(c / 100, 2) : '—';
  const nf = (v) => (Number(v) || 0).toLocaleString('fr-FR');
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // Catégorie : calculée par le serveur (member_category) ; repli local identique si absente.
  function cat(m) {
    if (m.category) return m.category;
    if (m.isAdmin) return 'admin';
    if (m.role === 'educator') return 'educator';
    const a = m.access || {};
    if (a.active) return a.plan === 'offert' ? 'privilege' : a.plan;
    return a.trialUsed || (a.plan && a.plan !== 'none') ? 'expired' : 'none';
  }
  const isTeam = (m) => ['admin', 'educator'].includes(cat(m));
  const me = () => A.getUser() || {};

  // Offre affichée sur la ligne : libellé + phrase de date (renouvellement, fin, essai).
  function planLine(m) {
    const a = m.access || {};
    const c = cat(m);
    const t = TIER[c] || TIER.none;
    if (c === 'admin') return { label: 'Admin', sub: 'accès complet', cls: '' };
    if (c === 'educator') return { label: 'Éducateur', sub: 'accès complet par son rôle', cls: '' };
    const left = daysUntil(a.endsAt);
    const soon = left != null && left <= 7 ? 'is-warn' : '';
    if (c === 'privilege') return { label: 'Privilège', sub: a.endsAt ? `jusqu’au ${dt(a.endsAt)}` : 'sans limite', cls: soon };
    if (c === 'trial') return { label: 'Essai', sub: left != null ? `encore ${Math.max(0, left)} j · fin le ${dt(a.endsAt)}` : 'en cours', cls: soon };
    if (c === 'expired') return { label: a.plan === 'trial' ? 'Essai terminé' : `${(TIER[a.plan === 'offert' ? 'privilege' : a.plan] || { name: 'Offre' }).name} terminé`, sub: a.endsAt ? `depuis le ${dt(a.endsAt)}` : 'essai utilisé', cls: 'is-bad' };
    if (c === 'none') return { label: t.name, sub: `inscrit ${ago(m.createdAt)}`, cls: '' };
    const per = a.period === 'year' ? ' · annuel' : a.period === 'month' ? ' · mensuel' : '';
    const late = a.status === 'past_due' ? 'is-bad' : a.status === 'canceling' ? 'is-warn' : soon;
    const sub = a.status === 'past_due' ? 'paiement en retard'
      : a.status === 'canceling' ? `se termine le ${dt(a.endsAt)}`
        : (a.paid ? 'renouvellement le ' : 'jusqu’au ') + dt(a.endsAt);
    return { label: t.name + per, sub, cls: late };
  }

  // ------------------------------------------------------------ État
  const S = { members: [], stats: null, days: 30, tab: 'all', tier: null, q: '', sort: 'seen', open: null, limit: 40 };
  try { const d = Number(localStorage.getItem('chest_admin_days')); if ([7, 30, 90, 365].includes(d)) S.days = d; } catch (e) { /* tant pis */ }

  // ------------------------------------------------------------ 01 Performance
  function delta(cur, prev) {
    if (!prev && !cur) return '<span class="am-delta is-flat">=</span>';
    if (!prev) return '<span class="am-delta is-up">nouveau</span>';
    const d = Math.round((cur - prev) / prev * 100);
    if (d === 0) return '<span class="am-delta is-flat">= 0 %</span>';
    return `<span class="am-delta ${d > 0 ? 'is-up' : 'is-down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d)} %</span>`;
  }
  function renderKpis() {
    const s = S.stats;
    const zone = $('amKpis');
    if (!s) { zone.innerHTML = ''; return; }
    const per = periodWord();
    const conv = s.trial.started ? `${pct(s.trial.converted, s.trial.started)} %` : '—';
    const k = (key, val, note, cls) => `<div class="am-kpi"><div class="am-kpi__k">${key}</div><div class="am-kpi__v ${cls || ''}">${val}</div><div class="am-kpi__n">${note}</div></div>`;
    zone.innerHTML =
      k('Revenu mensuel', eur(s.mrr), `${s.paying} abonné${s.paying > 1 ? 's' : ''} payant${s.paying > 1 ? 's' : ''}`, 'is-acc') +
      k('Encaissé', eur(s.collected), `${delta(s.collected, s.collectedPrev)} ${per}`, s.collected > 0 ? 'is-pos' : '') +
      k('Nouveaux membres', nf(s.signups), `${delta(s.signups, s.signupsPrev)} ${per}`) +
      k('Actifs · 7 jours', nf(s.active7), `${s.active1} aujourd’hui · ${s.active30} sur 30 j`) +
      k('Essais convertis', conv, `${s.trial.converted} sur ${s.trial.started} essai${s.trial.started > 1 ? 's' : ''}`) +
      k('Résiliations', nf(s.churn), per, s.churn > 0 ? 'is-neg' : '');
    $('amPerfAside').textContent = `${periodLabel()} · comparé à la période précédente`;
  }
  const periodLabel = () => ({ 7: '7 derniers jours', 30: '30 derniers jours', 90: '90 derniers jours', 365: '12 derniers mois' }[S.days]);
  const periodWord = () => ({ 7: 'sur 7 j', 30: 'sur 30 j', 90: 'sur 90 j', 365: 'sur 1 an' }[S.days]);

  function niceMax(v) {
    if (v <= 4) return 4;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }
  // Barres = arrivées, courbe = membres actifs (même échelle : ce sont des personnes). Regroupé par semaine au-delà de 90 jours.
  function renderFlow() {
    const el = $('amFlow');
    const s = S.stats;
    if (!s) { el.innerHTML = ''; return; }
    let pts = s.series.map((p) => ({ day: p.day, to: p.day, signups: p.signups, users: p.users, views: p.views }));
    if (S.days > 90) {
      const w = [];
      for (let i = 0; i < pts.length; i += 7) {
        const g = pts.slice(i, i + 7);
        w.push({ day: g[0].day, to: g[g.length - 1].day, signups: g.reduce((a, b) => a + b.signups, 0), users: Math.max(...g.map((x) => x.users)), views: g.reduce((a, b) => a + b.views, 0) });
      }
      pts = w;
    }
    const W = Math.max(280, el.clientWidth || 600), H = el.clientHeight || 230;
    const L = 30, R = 6, T = 10, B = 24;
    const iw = W - L - R, ih = H - T - B;
    const max = niceMax(Math.max(1, ...pts.map((p) => Math.max(p.signups, p.users))));
    const n = pts.length;
    const step = iw / n;
    const bw = Math.max(2, Math.min(18, step * .56));
    const x = (i) => L + step * i + step / 2;
    const y = (v) => T + ih - v / max * ih;
    let g = '';
    for (let i = 0; i <= 4; i++) {
      const v = max / 4 * i, yy = y(v);
      g += `<line class="am-grid" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"/><text class="am-axis" x="${L - 8}" y="${yy + 3}" text-anchor="end">${Math.round(v)}</text>`;
    }
    const bars = pts.map((p, i) => p.signups ? `<rect x="${x(i) - bw / 2}" y="${y(p.signups)}" width="${bw}" height="${Math.max(1, ih - (y(p.signups) - T))}" rx="${Math.min(3, bw / 2)}" fill="url(#amBarG)"/>` : '').join('');
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.users).toFixed(1)}`).join('');
    const area = `${line}L${x(n - 1).toFixed(1)},${T + ih}L${x(0).toFixed(1)},${T + ih}Z`;
    const ticks = Math.min(6, n);
    let xl = '';
    for (let k = 0; k < ticks; k++) {
      const i = Math.round(k * (n - 1) / Math.max(1, ticks - 1));
      const d = new Date(pts[i].day + 'T12:00:00');
      xl += `<text class="am-axis" x="${x(i)}" y="${H - 6}" text-anchor="${k === 0 ? 'start' : k === ticks - 1 ? 'end' : 'middle'}">${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</text>`;
    }
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Arrivées et membres actifs, ${periodLabel()}">
      <defs>
        <linearGradient id="amBarG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fc1283"/><stop offset="1" stop-color="#fc1283" stop-opacity=".25"/></linearGradient>
        <linearGradient id="amAreaG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f9a45e" stop-opacity=".22"/><stop offset="1" stop-color="#f9a45e" stop-opacity="0"/></linearGradient>
      </defs>
      ${g}${bars}
      <path d="${area}" fill="url(#amAreaG)"/>
      <path d="${line}" fill="none" stroke="#f9a45e" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" style="filter:drop-shadow(0 0 6px rgba(249,164,94,.55))"/>
      <line id="amGuide" x1="0" x2="0" y1="${T}" y2="${T + ih}" stroke="rgba(255,255,255,.25)" stroke-dasharray="3 3" opacity="0"/>
      <circle id="amDot" r="4" fill="#f9a45e" stroke="#050505" stroke-width="2" opacity="0"/>
      ${xl}
      <rect x="${L}" y="${T}" width="${iw}" height="${ih}" fill="transparent" id="amHit"/>
    </svg><div class="am-tip" id="amTip"></div>`;
    const hit = $('amHit'), tip = $('amTip'), guide = $('amGuide'), dot = $('amDot');
    const show = (ev) => {
      const r = el.getBoundingClientRect();
      const px = (ev.clientX - r.left) * (W / r.width);
      const i = Math.max(0, Math.min(n - 1, Math.floor((px - L) / step)));
      const p = pts[i];
      guide.setAttribute('x1', x(i)); guide.setAttribute('x2', x(i)); guide.setAttribute('opacity', 1);
      dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(p.users)); dot.setAttribute('opacity', 1);
      const d1 = new Date(p.day + 'T12:00:00'), d2 = new Date(p.to + 'T12:00:00');
      const when = p.day === p.to ? d1.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) : `${d1.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} → ${d2.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
      tip.innerHTML = `<b>${when}</b><span>Nouveaux <em>${p.signups}</em></span><span>${p.day === p.to ? 'Actifs' : 'Actifs (max/jour)'} <em>${p.users}</em></span><span>Pages vues <em>${nf(p.views)}</em></span>`;
      const left = x(i) / W * r.width;
      tip.style.left = Math.min(r.width - tip.offsetWidth - 4, Math.max(0, left + 12 > r.width - tip.offsetWidth ? left - tip.offsetWidth - 12 : left + 12)) + 'px';
      tip.classList.add('is-on');
    };
    const hide = () => { tip.classList.remove('is-on'); guide.setAttribute('opacity', 0); dot.setAttribute('opacity', 0); };
    hit.addEventListener('pointermove', show);
    hit.addEventListener('pointerdown', show);
    hit.addEventListener('pointerleave', hide);
  }

  function renderDonut() {
    const el = $('amDonut');
    const counts = {};
    S.members.forEach((m) => { const c = cat(m); counts[c] = (counts[c] || 0) + 1; });
    const total = S.members.length || 1;
    const withAccess = S.members.filter((m) => !['expired', 'none'].includes(cat(m))).length;
    const R = 60, C = 2 * Math.PI * R;
    let off = 0;
    const segs = TIERS.filter((t) => counts[t.key]).map((t) => {
      const len = counts[t.key] / total * C;
      const gap = Math.min(3, len * .3);
      const s = `<circle class="seg" cx="75" cy="75" r="${R}" fill="none" stroke="${t.c1}" stroke-width="13" stroke-dasharray="${Math.max(.1, len - gap)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 75 75)" style="filter:drop-shadow(0 0 5px ${t.c1}88)"><title>${t.name} : ${counts[t.key]}</title></circle>`;
      off += len;
      return s;
    }).join('');
    el.innerHTML = `<svg viewBox="0 0 150 150" role="img" aria-label="Répartition des membres par rang">
        <circle cx="75" cy="75" r="${R}" fill="none" stroke="rgba(255,255,255,.05)" stroke-width="13"/>${segs}
        <g class="am-donut__mid"><text class="v" x="75" y="78" text-anchor="middle">${withAccess}</text><text class="k" x="75" y="94" text-anchor="middle">avec accès</text></g>
      </svg>
      <ul>${TIERS.filter((t) => counts[t.key]).map((t) => `<li style="${tierStyle(t.key)}"><i></i><span>${t.name}</span><b>${counts[t.key]}</b><small>${pct(counts[t.key], total)} %</small></li>`).join('') || '<li><span>Aucun membre</span></li>'}</ul>`;
  }

  function renderPages() {
    const el = $('amPages');
    const pages = (S.stats && S.stats.pages) || [];
    if (!pages.length) { el.innerHTML = '<li class="am-muted" style="grid-template-columns:1fr">Aucune page vue sur la période.</li>'; return; }
    const max = Math.max(1, ...pages.map((p) => p[1]));
    el.innerHTML = pages.map(([p, v]) => `<li><span>${esc(PAGE_LABELS[p] || p)}</span><b>${nf(v)}</b><i style="--w:${Math.round(v / max * 100)}%"></i></li>`).join('');
  }

  // ------------------------------------------------------------ 02 Hiérarchie
  function renderPyramid() {
    const el = $('amPyramid');
    const counts = {};
    S.members.forEach((m) => { const c = cat(m); counts[c] = (counts[c] || 0) + 1; });
    const total = S.members.length || 1;
    let html = '', group = null;
    TIERS.forEach((t, i) => {
      if (t.group !== group) { group = t.group; html += `<div class="am-pyr__group">${GROUPS[group]}</div>`; }
      const n = counts[t.key] || 0;
      const w = 44 + i * 7; // le sommet est étroit, la base pleine largeur
      html += `<button type="button" class="am-tier${S.tier === t.key ? ' is-on' : ''}${n ? '' : ' is-zero'}" data-tier="${t.key}" style="${tierStyle(t.key)};--w:${w}%;--share:${(n / total).toFixed(3)}" aria-pressed="${S.tier === t.key}">
        ${badge(t.key, 38)}
        <span><span class="am-tier__name">${t.name}</span><span class="am-tier__rights">${t.rights}</span></span>
        <span class="am-tier__n"><b>${n}</b><small>${pct(n, total)} %</small></span>
        ${CHEV_R}
      </button>`;
    });
    el.innerHTML = html;
  }

  // ------------------------------------------------------------ 03 Liste
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  function filtered() {
    const tab = TABS.find((t) => t.key === S.tab) || TABS[0];
    const q = norm(S.q).trim();
    let list = S.members.filter((m) => tab.test(m) && (!S.tier || cat(m) === S.tier));
    if (q) list = list.filter((m) => norm(`${m.firstName} ${m.lastName} ${m.email} ${m.lastName} ${m.firstName}`).includes(q));
    const seen = (m) => ms(m.lastSeenAt || m.lastLoginAt) || 0;
    const sorters = {
      seen: (a, b) => seen(b) - seen(a),
      new: (a, b) => (ms(b.createdAt) || 0) - (ms(a.createdAt) || 0),
      active: (a, b) => ((b.activity || {}).views30 || 0) - ((a.activity || {}).views30 || 0),
      ends: (a, b) => (ms((a.access || {}).endsAt) || Infinity) - (ms((b.access || {}).endsAt) || Infinity),
      rank: (a, b) => (TIER[cat(a)] || TIER.none).rank - (TIER[cat(b)] || TIER.none).rank || seen(b) - seen(a),
      name: (a, b) => fullName(a).localeCompare(fullName(b), 'fr'),
    };
    if (S.sort === 'ends') list = list.filter((m) => (m.access || {}).active && (m.access || {}).endsAt).concat(list.filter((m) => !((m.access || {}).active && (m.access || {}).endsAt)));
    return list.slice().sort(sorters[S.sort] || sorters.seen);
  }

  function renderTabs() {
    $('amTabs').innerHTML = TABS.map((t) => {
      const n = S.members.filter(t.test).length;
      if (t.hideEmpty && !n) return '';
      return `<button type="button" role="tab" class="am-tab${S.tab === t.key ? ' is-active' : ''}" aria-selected="${S.tab === t.key}" data-tab="${t.key}">${t.label}<small>${n}</small></button>`;
    }).join('');
    const f = $('amFilter');
    if (S.tier) {
      const t = TIER[S.tier];
      f.hidden = false;
      f.innerHTML = `<span>Rang</span><button type="button" class="am-chip" style="${tierStyle(t.key)}" data-clear-tier>${badge(t.key, 16)}${t.name} ${CROSS}</button>`;
    } else { f.hidden = true; f.innerHTML = ''; }
  }

  function spark(vals, c1, w, h) {
    const n = vals.length, max = Math.max(1, ...vals);
    const bw = w / n;
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">${vals.map((v, i) => {
      const bh = v ? Math.max(2, v / max * (h - 1)) : 1.2;
      return `<rect x="${(i * bw + bw * .18).toFixed(2)}" y="${(h - bh).toFixed(2)}" width="${(bw * .64).toFixed(2)}" height="${bh.toFixed(2)}" rx="1" fill="${v ? c1 : 'rgba(255,255,255,.14)'}" ${v ? `opacity="${(.45 + .55 * v / max).toFixed(2)}"` : ''}/>`;
    }).join('')}</svg>`;
  }

  function rowHtml(m) {
    const c = cat(m);
    const t = TIER[c] || TIER.none;
    const p = planLine(m);
    const act = m.activity || {};
    const last14 = act.last14 || new Array(14).fill(0);
    const seenT = ms(m.lastSeenAt || m.lastLoginAt);
    const fresh = seenT && Date.now() - seenT < 15 * 60000;
    const isMe = me().id === m.id;
    const open = S.open === m.id;
    return `<article class="am-row${open ? ' is-open' : ''}" data-id="${m.id}" style="${tierStyle(c)}">
      <div class="am-row__main">
        <span class="am-av">${esc(initials(m))}<span class="am-av__b">${badge(c, 18)}</span></span>
        <div class="am-who"><b>${esc(fullName(m))}${isMe ? '<span class="is-me">toi</span>' : ''}${m.status === 'blocked' ? '<span class="am-chip am-chip--blocked">Bloqué</span>' : ''}</b><small>${esc(m.email)}</small></div>
        <div class="am-plan"><span class="am-chip">${badge(c, 16)}${esc(p.label)}</span><small class="${p.cls}">${esc(p.sub)}</small></div>
        <div class="am-spark" title="Pages vues, 14 derniers jours">${spark(last14, t.c1, 84, 22)}<small>${act.days30 || 0} j actifs sur 30</small></div>
        <div class="am-seen${fresh ? ' is-fresh' : ''}">${fresh ? 'en ligne' : esc(ago(m.lastSeenAt || m.lastLoginAt))}<small>dernière activité</small></div>
        <div class="am-row__act"><button type="button" class="am-manage" data-manage aria-expanded="${open}" aria-controls="amc-${m.id}">Gérer ${CHEV}</button></div>
      </div>
      <div class="am-card" id="amc-${m.id}" ${open ? '' : 'hidden'}>${open ? cardHtml(m) : ''}</div>
    </article>`;
  }

  function cardHtml(m) {
    const a = m.access || {};
    const c = cat(m);
    const act = m.activity || { days30: 0, views30: 0, days7: 0, views7: 0, last14: [], top: [] };
    const maxV = Math.max(1, ...(act.top || []).map((x) => x[1]));
    const ob = m.onboarding;
    const isMe = me().id === m.id;
    const role = m.isAdmin ? 'admin' : (m.role === 'educator' ? 'educator' : 'member');
    const planNow = c === 'privilege' ? 'offert' : ['premium', 'essentiel'].includes(c) ? c : (c === 'none' || c === 'expired' ? 'none' : 'offert');
    const t = TIER[c] || TIER.none;
    return `<div class="am-card__grid">
        <div class="am-box"><div class="am-box__k">Abonnement</div><dl class="am-dl">
          <dt>Rang</dt><dd>${esc(t.name)}</dd>
          <dt>Offre</dt><dd>${esc(a.label || 'Aucune')}</dd>
          <dt>Période</dt><dd>${a.period === 'year' ? 'Annuelle' : a.period === 'month' ? 'Mensuelle' : '—'}</dd>
          <dt>Statut</dt><dd>${esc(STATUS[a.status] || (a.active ? 'Actif' : 'Sans accès'))}</dd>
          <dt>Début</dt><dd>${dt(a.startedAt)}</dd>
          <dt>Fin</dt><dd>${a.plan === 'offert' && !a.endsAt ? 'Sans limite' : dt(a.endsAt)}</dd>
          <dt>Dernier paiement</dt><dd>${eurCents(m.amount)}</dd>
        </dl></div>
        <div class="am-box"><div class="am-box__k">Activité</div>
          <div class="am-nums"><div><b>${act.days7}</b><span>jours · 7 j</span></div><div><b>${act.days30}</b><span>jours · 30 j</span></div><div><b>${nf(act.views30)}</b><span>pages · 30 j</span></div></div>
          <div class="am-bars14" title="Pages vues, 14 derniers jours">${spark(act.last14 || [], t.c1, 280, 38)}</div>
          ${(act.top || []).length ? `<ul class="am-toplist">${act.top.map(([p, v]) => `<li><span>${esc(PAGE_LABELS[p] || p)}</span><span>${v}</span><i style="--w:${Math.round(v / maxV * 100)}%"></i></li>`).join('')}</ul>` : '<p class="am-muted">Aucune activité sur 30 jours.</p>'}
        </div>
        <div class="am-box"><div class="am-box__k">Questionnaire</div>
          ${ob ? `<dl class="am-dl">
            <dt>Niveau</dt><dd>${esc(ob.level || '—')} / 10</dd>
            <dt>Déjà gagné</dt><dd>${esc(ANSWERS.made[ob.made] || '—')}${ob.amount ? ' · ' + esc(ANSWERS.amount[ob.amount] || '') : ''}</dd>
            <dt>Objectif</dt><dd>${esc(ANSWERS.goal[ob.goal] || '—')}</dd>
            <dt>Budget</dt><dd>${esc(ANSWERS.budget[ob.budget] || '—')}</dd>
            <dt>Conseillé</dt><dd>${esc(ANSWERS.reco[ob.recommended] || '—')}</dd>
          </dl>` : '<p class="am-muted">Pas encore répondu.</p>'}
          <dl class="am-dl" style="margin-top:14px"><dt>Inscrit le</dt><dd>${dt(m.createdAt)}</dd><dt>Connexion</dt><dd>${esc(ago(m.lastLoginAt))}</dd></dl>
        </div>
        <div class="am-box"><div class="am-box__k">Historique</div>
          ${(m.billing || []).length ? `<ul class="am-log">${m.billing.map((b) => `<li><span>${esc(b.summary)}</span><span>${b.amount ? eurCents(b.amount) : ''}</span><small>${dt(b.at, true)}</small></li>`).join('')}</ul>` : '<p class="am-muted">Aucun paiement ni changement pour l’instant.</p>'}
        </div>
      </div>
      ${isMe ? '<p class="am-ctl__hint" style="margin-top:20px">C’est ton compte : ton rôle et ton accès ne se modifient pas d’ici.</p>' : `<div class="am-ctl">
        <div data-role-zone>
          <div class="am-ctl__k">Rôle</div>
          <div class="chest-seg" role="group" aria-label="Rôle">
            ${[['member', 'Membre'], ['educator', 'Éducateur'], ['admin', 'Admin']].map(([k, l]) => `<button type="button" data-role="${k}" class="${role === k ? 'is-active' : ''}" aria-pressed="${role === k}">${l}</button>`).join('')}
          </div>
          <p class="am-ctl__hint">${role === 'educator' ? 'Accès complet, sans abonnement. Il pourra bientôt publier dans School.' : role === 'admin' ? 'Tous les droits, y compris gérer et supprimer des membres.' : 'Ses droits viennent de son offre.'}</p>
          <p class="am-msg" data-role-msg role="status"></p>
        </div>
        <form data-access-form>
          <div class="am-ctl__k">Accès</div>
          <div class="am-ctl__row">
            <div class="chest-seg" role="group" aria-label="Offre" data-plan-group>
              ${[['offert', 'Privilège'], ['premium', 'Premium'], ['essentiel', 'Essentiel'], ['none', 'Aucun']].map(([k, l]) => `<button type="button" data-plan="${k}" class="${planNow === k ? 'is-active' : ''}">${l}</button>`).join('')}
            </div>
          </div>
          <div class="am-ctl__row" data-dur-row ${planNow === 'none' ? 'hidden' : ''}>
            <div class="am-dur" data-dur-group>
              ${[['7', '7 j'], ['30', '30 j'], ['90', '3 mois'], ['365', '1 an'], ['date', 'Jusqu’au…'], ['', 'Sans limite']].map(([k, l]) => `<button type="button" data-dur="${k}" class="${(planNow === 'offert' ? k === '' : k === '30') ? 'is-active' : ''}" ${k === '' && planNow !== 'offert' ? 'hidden' : ''}>${l}</button>`).join('')}
            </div>
            <input type="date" class="am-date" data-dur-date hidden aria-label="Date de fin" min="${isoDay(new Date(Date.now() + DAY))}">
          </div>
          <div class="am-ctl__row"><button type="submit" class="chest-btn">Appliquer</button><p class="am-msg" data-access-msg role="status"></p></div>
          ${role !== 'member' ? '<p class="am-ctl__hint">Son rôle lui donne déjà tout : l’accès ne comptera que s’il redevient Membre.</p>' : ''}
        </form>
        <div class="am-danger">
          <div class="am-ctl__k">Compte</div>
          ${m.status === 'blocked' ? '<button type="button" data-unblock>Débloquer</button>' : '<button type="button" data-block>Bloquer</button>'}
          <button type="button" data-del>Supprimer</button>
        </div>
      </div>`}`;
  }

  function renderRows() {
    const list = filtered();
    const zone = $('amRows');
    $('amListAside').textContent = list.length === S.members.length ? `${list.length} membre${list.length > 1 ? 's' : ''}` : `${list.length} sur ${S.members.length}`;
    if (!list.length) {
      zone.innerHTML = `<div class="am-empty">${S.q ? `Personne ne correspond à « ${esc(S.q)} ».` : 'Aucun membre dans cette catégorie.'}</div>`;
      return;
    }
    const shown = list.slice(0, S.limit);
    zone.innerHTML = shown.map(rowHtml).join('') + (list.length > shown.length ? `<div class="am-more"><button type="button" class="chest-btn-2" data-more>Afficher ${Math.min(40, list.length - shown.length)} de plus</button></div>` : '');
  }
  function renderList() { renderTabs(); renderRows(); }

  // ------------------------------------------------------------ 04 Nouveaux membres
  function renderArrivals() {
    const since = Date.now() - S.days * DAY;
    const fresh = S.members.filter((m) => !isTeam(m) && (ms(m.createdAt) || 0) >= since).sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
    const steps = (m) => {
      const a = m.access || {};
      return [true, !!m.onboarding, !!a.trialUsed || a.trial, ['essentiel', 'premium', 'allstar'].includes(a.plan) && (a.paid || a.status === 'active' || a.status === 'canceling' || a.status === 'past_due')];
    };
    const N = fresh.length;
    const f = [0, 0, 0, 0];
    fresh.forEach((m) => steps(m).forEach((s, i) => { if (s) f[i] += 1; }));
    const lbl = ['Inscrits', 'Questionnaire', 'Essai', 'Abonnés'];
    $('amNewAside').textContent = periodLabel();
    $('amFunnel').innerHTML = lbl.map((l, i) => `<div class="am-fstep"><div class="am-fstep__k">${l}</div><div class="am-fstep__v"><b>${f[i]}</b>${i ? `<small>${pct(f[i], N)} %</small>` : ''}</div><i style="--w:${N ? pct(f[i], N) : 0}%"></i></div>`).join('');
    if (!N) { $('amArrivals').innerHTML = '<li class="am-empty">Aucune arrivée sur la période.</li>'; return; }
    $('amArrivals').innerHTML = fresh.slice(0, 10).map((m) => {
      const s = steps(m);
      const c = cat(m);
      return `<li class="am-arr" tabindex="0" data-go="${m.id}" style="${tierStyle(c)}">
        <span class="am-av am-av--sm">${esc(initials(m))}</span>
        <span style="min-width:0"><b>${esc(fullName(m))}</b><small>${esc(ago(m.createdAt))}</small></span>
        <span class="am-journey">${lbl.map((l, i) => `${i ? `<em class="${s[i] ? 'is-done' : ''}"></em>` : ''}<span class="${s[i] ? 'is-done' : ''}">${l === 'Inscrits' ? 'Inscrit' : l === 'Abonnés' ? 'Abonné' : l}</span>`).join('')}</span>
        <span class="am-chip">${badge(c, 16)}${esc((TIER[c] || TIER.none).name)}</span>
      </li>`;
    }).join('');
  }

  // ------------------------------------------------------------ 05 Activité des élèves
  function renderActivity() {
    const students = S.members.filter((m) => !isTeam(m) && m.status !== 'blocked');
    const person = (m, right, cls) => `<li class="am-pers" tabindex="0" data-go="${m.id}" style="${tierStyle(cat(m))}">
      <span class="am-av am-av--sm">${esc(initials(m))}</span>
      <span style="min-width:0"><b>${esc(fullName(m))}</b><small>${esc((TIER[cat(m)] || TIER.none).name)}</small></span>
      <span class="am-pers__v ${cls || ''}">${right}</span></li>`;
    const top = students.filter((m) => (m.activity || {}).views30 > 0).sort((a, b) => b.activity.views30 - a.activity.views30).slice(0, 6);
    $('amTop').innerHTML = top.length ? top.map((m) => person(m, `<b>${nf(m.activity.views30)}</b> pages<br>${m.activity.days30} j actifs`)).join('') : '<li class="am-empty">Pas encore d’activité.</li>';
    const weekAgo = Date.now() - 7 * DAY;
    const nudge = students.filter((m) => (m.access || {}).active && ms(m.lastSeenAt) && ms(m.lastSeenAt) < weekAgo).sort((a, b) => ms(a.lastSeenAt) - ms(b.lastSeenAt)).slice(0, 6);
    $('amNudge').innerHTML = nudge.length ? nudge.map((m) => person(m, esc(ago(m.lastSeenAt)), 'is-warn')).join('') : '<li class="am-empty">Personne : tous ceux qui ont un accès sont passés cette semaine.</li>';
    const ghost = students.filter((m) => !ms(m.lastSeenAt) && !((m.activity || {}).views30)).sort((a, b) => ms(b.createdAt) - ms(a.createdAt)).slice(0, 6);
    $('amGhost').innerHTML = ghost.length ? ghost.map((m) => person(m, 'inscrit<br>' + esc(ago(m.createdAt)))).join('') : '<li class="am-empty">Tout le monde est revenu au moins une fois.</li>';
  }

  // ------------------------------------------------------------ Rendu global et chargement
  function renderAll() {
    $('amTotal').textContent = nf(S.members.length);
    renderKpis(); renderFlow(); renderDonut(); renderPages(); renderPyramid(); renderList(); renderArrivals(); renderActivity();
  }
  async function loadStats() {
    try { S.stats = await A.fetchAdminStats(S.days); } catch (e) { S.stats = null; $('amKpis').innerHTML = `<div class="am-error">Statistiques indisponibles : ${esc(e.message)}</div>`; }
  }
  async function loadMembers() { S.members = await A.fetchMembers(); }
  async function reload(keepOpen) {
    const open = keepOpen ? S.open : null;
    await Promise.all([loadMembers(), loadStats()]);
    S.open = open;
    renderAll();
  }

  function setPeriod(days) {
    S.days = days;
    try { localStorage.setItem('chest_admin_days', String(days)); } catch (e) { /* tant pis */ }
    document.querySelectorAll('#amPeriod [data-days]').forEach((b) => b.classList.toggle('is-active', Number(b.dataset.days) === days));
    loadStats().then(() => { renderKpis(); renderFlow(); renderPages(); renderArrivals(); });
  }

  function toggleCard(id, force) {
    const row = document.querySelector(`.am-row[data-id="${id}"]`);
    if (!row) return;
    const open = force != null ? force : S.open !== id;
    if (S.open != null && S.open !== id) {
      const prev = document.querySelector(`.am-row[data-id="${S.open}"]`);
      if (prev) { prev.classList.remove('is-open'); prev.querySelector('.am-card').hidden = true; prev.querySelector('[data-manage]').setAttribute('aria-expanded', 'false'); }
    }
    const card = row.querySelector('.am-card');
    const m = S.members.find((x) => x.id === id);
    if (open && m) card.innerHTML = cardHtml(m);
    card.hidden = !open;
    row.classList.toggle('is-open', open);
    row.querySelector('[data-manage]').setAttribute('aria-expanded', String(open));
    S.open = open ? id : null;
  }

  // Ouvre un membre depuis les sections 04/05 : liste remise à zéro, fiche ouverte, défilement doux.
  function goTo(id) {
    S.tab = 'all'; S.tier = null; S.q = ''; $('amSearch').value = '';
    const list = filtered();
    const idx = list.findIndex((m) => m.id === id);
    if (idx >= S.limit) S.limit = idx + 1;
    S.open = id;
    renderPyramid(); renderList();
    const row = document.querySelector(`.am-row[data-id="${id}"]`);
    if (!row) return;
    row.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    row.classList.add('is-flash');
    setTimeout(() => row.classList.remove('is-flash'), 1700);
  }

  // ------------------------------------------------------------ Événements
  $('amPeriod').addEventListener('click', (e) => { const b = e.target.closest('[data-days]'); if (b) setPeriod(Number(b.dataset.days)); });

  $('amPyramid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tier]');
    if (!b) return;
    S.tier = S.tier === b.dataset.tier ? null : b.dataset.tier;
    S.tab = 'all'; S.limit = 40;
    renderPyramid(); renderList();
    if (S.tier) $('amList').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  });
  $('amTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (!b) return; S.tab = b.dataset.tab; S.tier = null; S.limit = 40; renderPyramid(); renderList(); });
  $('amFilter').addEventListener('click', (e) => { if (e.target.closest('[data-clear-tier]')) { S.tier = null; renderPyramid(); renderList(); } });
  let qTimer;
  $('amSearch').addEventListener('input', (e) => { clearTimeout(qTimer); qTimer = setTimeout(() => { S.q = e.target.value; S.limit = 40; renderRows(); }, 90); });
  $('amSort').addEventListener('change', (e) => { S.sort = e.target.value; renderRows(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) && $('amGift').hidden) { e.preventDefault(); $('amSearch').focus(); }
    if (e.key === 'Escape' && !$('amGift').hidden) closeGift();
  });
  const goHandler = (e) => { const g = e.target.closest('[data-go]'); if (g && (e.type === 'click' || e.key === 'Enter')) goTo(Number(g.dataset.go)); };
  ['amArrivals', 'amTop', 'amNudge', 'amGhost'].forEach((id) => { $(id).addEventListener('click', goHandler); $(id).addEventListener('keydown', goHandler); });

  // Sélecteurs de durée (fiche et fenêtre Privilège) : « Jusqu'au… » affiche le champ date.
  function wireDur(scope, e) {
    const b = e.target.closest('[data-dur]');
    if (!b) return false;
    scope.querySelectorAll('[data-dur]').forEach((x) => x.classList.toggle('is-active', x === b));
    const date = scope.querySelector('[data-dur-date]');
    date.hidden = b.dataset.dur !== 'date';
    if (!date.hidden) { if (!date.value) date.value = isoDay(new Date(Date.now() + 30 * DAY)); date.focus(); }
    return true;
  }
  function readDur(scope) {
    const b = scope.querySelector('[data-dur].is-active');
    const v = b ? b.dataset.dur : '';
    if (v === 'date') {
      const d = scope.querySelector('[data-dur-date]').value;
      if (!d) throw new Error('Choisis une date de fin.');
      if (Date.parse(d + 'T23:59:59') <= Date.now()) throw new Error('La date de fin doit être dans le futur.');
      return { days: null, until: d };
    }
    return { days: v ? Number(v) : null, until: '' };
  }
  const say = (el, text, kind) => { if (!el) return; el.textContent = text; el.className = 'am-msg' + (kind ? ' is-' + kind : ''); };

  $('amRows').addEventListener('click', async (e) => {
    if (e.target.closest('[data-more]')) { S.limit += 40; renderRows(); return; }
    const row = e.target.closest('.am-row');
    if (!row) return;
    const id = Number(row.dataset.id);
    const m = S.members.find((x) => x.id === id);
    if (e.target.closest('[data-manage]')) { toggleCard(id); return; }
    const card = row.querySelector('.am-card');
    if (wireDur(card, e)) return;

    const planBtn = e.target.closest('[data-plan]');
    if (planBtn) {
      card.querySelectorAll('[data-plan]').forEach((x) => x.classList.toggle('is-active', x === planBtn));
      const plan = planBtn.dataset.plan;
      card.querySelector('[data-dur-row]').hidden = plan === 'none';
      const unlimited = card.querySelector('[data-dur=""]');
      unlimited.hidden = plan !== 'offert';
      // Privilège : « Sans limite » par défaut ; une offre payante garde la durée choisie, sinon 30 jours.
      const cur = card.querySelector('[data-dur].is-active');
      const keep = plan !== 'offert' && cur && !cur.hidden && cur.dataset.dur !== '';
      if (!keep) wireDur(card, { target: card.querySelector(plan === 'offert' ? '[data-dur=""]' : '[data-dur="30"]') });
      return;
    }

    const roleBtn = e.target.closest('[data-role]');
    if (roleBtn && m) {
      const role = roleBtn.dataset.role;
      const cur = m.isAdmin ? 'admin' : (m.role === 'educator' ? 'educator' : 'member');
      if (role === cur) return;
      const msg = card.querySelector('[data-role-msg]');
      if (role === 'admin' && !(await CHESTConfirm(`Faire de ${fullName(m)} un administrateur ? Il aura tous les droits, y compris gérer, bloquer et supprimer des membres.`))) return;
      say(msg, 'Enregistrement…');
      try { await A.setMemberRole(id, role); await reload(true); say(document.querySelector(`.am-row[data-id="${id}"] [data-role-msg]`), 'Rôle mis à jour.', 'ok'); } catch (err) { say(msg, err.message, 'err'); }
      return;
    }

    const blockBtn = e.target.closest('[data-block],[data-unblock]');
    if (blockBtn) {
      if (blockBtn.hasAttribute('data-block') && !(await CHESTConfirm(`Bloquer ${fullName(m)} ? Son accès est coupé tout de suite (déconnexion forcée) ; tu pourras le débloquer plus tard.`))) return;
      blockBtn.disabled = true;
      try { if (blockBtn.hasAttribute('data-block')) await A.blockMember(id); else await A.approveMember(id); await reload(true); } catch (err) { await CHESTAlert(err.message); blockBtn.disabled = false; }
      return;
    }
    if (e.target.closest('[data-del]')) {
      const typed = await CHESTPrompt(`Supprimer définitivement ${fullName(m)} ? Son compte et TOUTES ses données (comptes de trading, Myfxbook, VPS, journal, backtests, alertes, notifications, activité, historique de paiement) seront effacés. C'est irréversible. Tape SUPPRIMER pour confirmer.`, { confirmLabel: 'Supprimer' });
      if (typed == null) return;
      if (typed.trim().toUpperCase() !== 'SUPPRIMER') { await CHESTAlert('Suppression annulée : il fallait taper SUPPRIMER.'); return; }
      try { await A.deleteMember(id); S.open = null; await reload(false); } catch (err) { await CHESTAlert(err.message); }
    }
  });

  $('amRows').addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-access-form]');
    if (!form) return;
    e.preventDefault();
    const row = form.closest('.am-row');
    const id = Number(row.dataset.id);
    const msg = form.querySelector('[data-access-msg]');
    const plan = (form.querySelector('[data-plan].is-active') || {}).dataset.plan;
    let dur = { days: null, until: '' };
    try { if (plan !== 'none') dur = readDur(form); } catch (err) { say(msg, err.message, 'err'); return; }
    if (plan !== 'offert' && plan !== 'none' && !dur.days && !dur.until) { say(msg, 'Choisis une durée pour cette offre.', 'err'); return; }
    say(msg, 'Enregistrement…');
    try {
      await A.setMemberAccess(id, plan, dur.days, dur.until);
      await reload(true);
      say(document.querySelector(`.am-row[data-id="${id}"] [data-access-msg]`), 'Accès mis à jour.', 'ok');
    } catch (err) { say(msg, err.message, 'err'); }
  });

  // ------------------------------------------------------------ Fenêtre « Offrir un Privilège »
  const gift = { id: null, lastFocus: null };
  function openGift(presetId) {
    gift.lastFocus = document.activeElement;
    gift.id = null;
    $('amGift').hidden = false;
    $('amGiftQ').value = '';
    $('amGiftPick').hidden = true;
    $('amGiftQ').parentElement.hidden = false;
    say($('amGift').querySelector('.am-msg'), '');
    const form = $('amGiftForm');
    wireDur(form, { target: form.querySelector('[data-dur=""]') });
    renderGiftList();
    if (presetId) pickGift(presetId); else setTimeout(() => $('amGiftQ').focus(), 30);
  }
  function closeGift() { $('amGift').hidden = true; if (gift.lastFocus && gift.lastFocus.focus) gift.lastFocus.focus(); }
  function renderGiftList() {
    const q = norm($('amGiftQ').value).trim();
    const cands = S.members.filter((m) => !m.isAdmin && m.id !== me().id && (!q || norm(`${m.firstName} ${m.lastName} ${m.email}`).includes(q)))
      .sort((a, b) => (ms(b.lastSeenAt) || 0) - (ms(a.lastSeenAt) || 0)).slice(0, q ? 8 : 5);
    $('amGiftList').innerHTML = gift.id ? '' : cands.map((m) => `<li role="option" data-pick="${m.id}" style="${tierStyle(cat(m))}"><span class="am-av am-av--sm">${esc(initials(m))}</span><span style="min-width:0"><b>${esc(fullName(m))}</b><small>${esc(m.email)}</small></span><span class="am-chip">${badge(cat(m), 16)}${esc((TIER[cat(m)] || TIER.none).name)}</span></li>`).join('') || (q ? '<li style="display:block;cursor:default"><small>Personne ne correspond.</small></li>' : '');
  }
  function pickGift(id) {
    const m = S.members.find((x) => x.id === id);
    if (!m) return;
    gift.id = id;
    const p = $('amGiftPick');
    p.hidden = false;
    p.setAttribute('style', tierStyle(cat(m)));
    p.innerHTML = `<span class="am-av am-av--sm">${esc(initials(m))}</span><span style="min-width:0"><b>${esc(fullName(m))}</b><small>${esc(planLine(m).label)} · ${esc(planLine(m).sub)}</small></span><button type="button" data-unpick>Changer</button>`;
    $('amGiftQ').parentElement.hidden = true;
    renderGiftList();
  }
  $('amGiftBtn').addEventListener('click', () => openGift(null));
  $('amGiftQ').addEventListener('input', renderGiftList);
  $('amGiftQ').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const f = $('amGiftList').querySelector('[data-pick]'); if (f) pickGift(Number(f.dataset.pick)); } });
  $('amGift').addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) { closeGift(); return; }
    const p = e.target.closest('[data-pick]');
    if (p) { pickGift(Number(p.dataset.pick)); return; }
    if (e.target.closest('[data-unpick]')) { gift.id = null; $('amGiftPick').hidden = true; $('amGiftQ').parentElement.hidden = false; renderGiftList(); $('amGiftQ').focus(); return; }
    wireDur($('amGiftForm'), e);
  });
  $('amGiftForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('amGift').querySelector('.am-msg');
    if (!gift.id) { say(msg, 'Choisis d’abord un membre.', 'err'); return; }
    let dur;
    try { dur = readDur($('amGiftForm')); } catch (err) { say(msg, err.message, 'err'); return; }
    const btn = e.target.querySelector('[type="submit"]');
    btn.disabled = true; say(msg, 'Enregistrement…');
    try {
      const id = gift.id;
      await A.setMemberAccess(id, 'offert', dur.days, dur.until);
      closeGift();
      await reload(false);
      goTo(id);
    } catch (err) { say(msg, err.message, 'err'); } finally { btn.disabled = false; }
  });

  // Redessin du graphique au redimensionnement (largeur réelle du conteneur).
  let rz;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(renderFlow, 150); });

  // ------------------------------------------------------------ Démarrage
  document.querySelectorAll('#amPeriod [data-days]').forEach((b) => b.classList.toggle('is-active', Number(b.dataset.days) === S.days));
  if (!A.isAdmin()) { $('amRows').innerHTML = '<div class="am-error">Cette page est réservée aux administrateurs.</div>'; return; }
  reload(false).catch((err) => { $('amRows').innerHTML = `<div class="am-error">Impossible de charger les membres : ${esc(err.message)}</div>`; });
})();
