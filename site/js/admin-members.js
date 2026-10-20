// CHEST — espace admin « Membres » : Vue d'ensemble, Membres, Rangs, Engagement + volet latéral par membre.
// Données : GET /members (fiche de chaque membre, catégorie calculée côté serveur) + GET /admin/stats?days=.
(() => {
  'use strict';
  const A = window.CHESTAccounts;
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const CHEV_R = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 3 7.5 6l-3 3"/></svg>';
  const CROSS = '<svg class="x" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 3l6 6M9 3 3 9"/></svg>';
  const IC = {
    clock: '<path d="M12 7v5l3 2"/><circle cx="12" cy="12" r="8"/>',
    card: '<rect x="3.5" y="6" width="17" height="12" rx="2.5"/><path d="M3.5 10h17M7 14.5h4"/>',
    door: '<path d="M14 4h4a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 18 20h-4M10 16l4-4-4-4M14 12H4"/>',
    gift: '<rect x="4" y="9" width="16" height="4" rx="1"/><path d="M5.5 13v7h13v-7M12 9v11M12 9c-1.5 0-4-.6-4-2.4 0-1.3 1.1-1.9 2.1-1.5C11.4 5.6 12 7.2 12 9zM12 9c1.5 0 4-.6 4-2.4 0-1.3-1.1-1.9-2.1-1.5C12.6 5.6 12 7.2 12 9z"/>',
    bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0"/>',
    ghost: '<path d="M6 20V11a6 6 0 1 1 12 0v9l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5z"/><circle cx="10" cy="11" r=".8" fill="currentColor"/><circle cx="14" cy="11" r=".8" fill="currentColor"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m8 12.3 2.7 2.7L16 9.7"/>',
  };
  const ic = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k]}</svg>`;

  // ------------------------------------------------------------ Rangs (du sommet à la base)
  // Badges provisoires : hexagone aux couleurs du rang + pictogramme. Les vrais badges remplaceront `badge()`.
  const TIERS = [
    { key: 'admin', name: 'Admin', group: 'team', rights: 'Tout CHEST et la gestion des membres.', c1: '#fc1283', c2: '#f9a45e', g: 'M6.5 15.5 5.6 9l3.6 2.6L12 7l2.8 4.6L18.4 9l-.9 6.5zM7 17.5h10' },
    { key: 'manager', name: 'Manageur', group: 'team', rights: 'Mêmes pouvoirs que l’admin, accès illimité, sans CHEST HQ.', c1: '#ffd23f', c2: '#ff8a1f', g: 'M12 5.5l5.5 2v4c0 3.2-2.3 5.6-5.5 6.8-3.2-1.2-5.5-3.6-5.5-6.8v-4zM9.6 12l1.7 1.7 3.3-3.4' },
    { key: 'educator', name: 'Éducateur', group: 'team', rights: 'Accès complet sans abonnement. Publiera bientôt dans School.', c1: '#b79bff', c2: '#6b4dff', g: 'M4 10.5 12 7l8 3.5-8 3.5zM7.5 12v3.2c0 1 2 2.3 4.5 2.3s4.5-1.3 4.5-2.3V12' },
    { key: 'privilege', name: 'Privilège', group: 'access', rights: 'Tout CHEST, offert par toi, avec ou sans date de fin.', c1: '#9dbcff', c2: '#3f7bff', g: 'M12 6.2l1.5 4.3 4.3 1.5-4.3 1.5L12 17.8l-1.5-4.3L6.2 12l4.3-1.5z' },
    { key: 'allstar', name: 'Allstar', group: 'access', rights: 'Tout CHEST et l’automatisation complète. Bientôt disponible.', c1: '#ffe39a', c2: '#d99a1e', g: 'M12 6.3l1.7 3.6 3.9.5-2.9 2.7.7 3.9L12 15.1 8.6 17l.7-3.9-2.9-2.7 3.9-.5z' },
    { key: 'premium', name: 'Premium', group: 'access', rights: 'Tout CHEST, School, BERICH et l’accompagnement.', c1: '#ffab6b', c2: '#ff4f3a', g: 'M8.6 7.5h6.8l2.6 3.4-6 6.6-6-6.6zM6 10.9h12M10.3 7.5 12 17.5l1.7-10' },
    { key: 'essentiel', name: 'Essentiel', group: 'access', rights: 'Toute la plateforme, sauf School et BERICH. Deux cours offerts.', c1: '#5ff0bd', c2: '#13a274', g: 'M7.8 12.4l2.8 2.8 5.6-6' },
    { key: 'trial', name: 'Essai', group: 'access', rights: '7 jours d’Essentiel, données gardées sur l’appareil.', c1: '#7ce3f5', c2: '#0f93ad', g: 'M8.6 6.5h6.8M8.6 17.5h6.8M9.3 6.5c0 3.4 5.4 3.6 5.4 5.5s-5.4 2.1-5.4 5.5M14.7 6.5c0 3.4-5.4 3.6-5.4 5.5s5.4 2.1 5.4 5.5' },
    { key: 'expired', name: 'Ancien', group: 'out', rights: 'Abonnement, Privilège ou essai terminé.', c1: '#ff8f9a', c2: '#a8253a', g: 'M12 7.4a4.6 4.6 0 1 0 0 9.2 4.6 4.6 0 0 0 0-9.2zM12 9.6V12l1.7 1.2' },
    { key: 'none', name: 'Sans accès', group: 'out', rights: 'Inscrit, aucune offre choisie pour l’instant.', c1: '#a0a0a8', c2: '#4a4a52', g: 'M8.5 12h7' },
  ];
  const TIER = Object.fromEntries(TIERS.map((t, i) => [t.key, Object.assign(t, { rank: i })]));
  const GROUPS = [
    { key: 'team', name: 'Équipe', desc: 'Ceux qui font CHEST.' },
    { key: 'access', name: 'Avec accès', desc: 'Ceux qui utilisent la plateforme aujourd’hui.' },
    { key: 'out', name: 'Sans accès', desc: 'Inscrits sans accès en cours.' },
  ];
  const CHIPS = [
    { key: 'all', label: 'Tous', test: () => true },
    { key: 'team', label: 'Équipe', test: (m) => ['admin', 'manager', 'educator'].includes(cat(m)) },
    { key: 'privilege', label: 'Privilège', test: (m) => cat(m) === 'privilege' },
    { key: 'subs', label: 'Abonnés', test: (m) => ['allstar', 'premium', 'essentiel'].includes(cat(m)) },
    { key: 'trial', label: 'Essai', test: (m) => cat(m) === 'trial' },
    { key: 'expired', label: 'Anciens', test: (m) => cat(m) === 'expired' },
    { key: 'none', label: 'Sans accès', test: (m) => cat(m) === 'none' },
    { key: 'blocked', label: 'Bloqués', test: (m) => m.status === 'blocked', hideEmpty: true },
  ];

  let badgeSeq = 0;
  function badge(key, size) {
    const t = TIER[key] || TIER.none;
    const id = 'amg' + (++badgeSeq);
    return `<svg class="am-badge" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.c1}"/><stop offset="1" stop-color="${t.c2}"/></linearGradient></defs>
      <path d="M12 1.6 20.9 6.8v10.4L12 22.4 3.1 17.2V6.8z" fill="url(#${id})" stroke="rgba(255,255,255,.35)" stroke-width=".8" stroke-linejoin="round"/>
      <path d="M12 2.6 20 7.2v3.2C15.5 8.6 8.5 8.6 4 10.4V7.2z" fill="rgba(255,255,255,.16)"/>
      <path d="${t.g}" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }
  const tierStyle = (key) => { const t = TIER[key] || TIER.none; return `--c1:${t.c1};--c2:${t.c2}`; };
  const chip = (key) => `<span class="am-chip" style="${tierStyle(key)}">${badge(key, 16)}${esc((TIER[key] || TIER.none).name)}</span>`;

  // ------------------------------------------------------------ Formats
  const PAGE_LABELS = { dashboard: 'Dashboard', backtesting: 'Backtesting', 'backtest-view': 'Rapports de backtest', 'backtest-add': 'Ajout de backtest', journal: 'Journal', strategies: 'Stratégies', calendar: 'Calendrier', berich: 'BERICH', school: 'School', account: 'Compte', connect: 'Connexion de compte', 'vps-guide': 'Guide VPS', 'admin-members': 'Admin', welcome: 'Welcome', offres: 'Offres' };
  const ANSWERS = {
    made: { yes: 'Oui', no: 'Non' },
    amount: { lt1k: 'moins de 1 000 €', '1k-10k': '1 000 à 10 000 €', '10k-50k': '10 000 à 50 000 €', gt50k: 'plus de 50 000 €' },
    goal: { learn: 'Apprendre de zéro', improve: 'S’améliorer', structure: 'Structurer', automate: 'Automatiser' },
    budget: { lt100: 'moins de 100 €/mois', '100-300': '100 à 300 €/mois', '300-1000': '300 à 1 000 €/mois', gt1000: 'plus de 1 000 €/mois' },
    reco: { essentiel: 'Essentiel', premium: 'Premium', allstar: 'Allstar' },
  };
  const STATUS = { active: 'Actif', trialing: 'Essai en cours', canceling: 'Résiliation programmée', past_due: 'Paiement en retard', canceled: 'Terminé', manual: 'Réglé à la main' };
  const DAY = 86400000;
  const initials = (m) => `${(m.firstName || '?')[0] || '?'}${(m.lastName || '')[0] || ''}`.toUpperCase();
  const fullName = (m) => `${m.firstName || ''} ${m.lastName || ''}`.trim() || m.email;
  const ms = (iso) => { const t = iso ? Date.parse(iso) : NaN; return isNaN(t) ? null : t; };
  const dt = (iso, withTime) => { const t = ms(iso); if (t == null) return '—'; return new Date(t).toLocaleDateString('fr-FR', withTime ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' }); };
  const ago = (iso) => {
    const t = ms(iso); if (t == null) return 'jamais';
    const m = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (m < 2) return 'à l’instant';
    if (m < 60) return `il y a ${m} min`;
    const h = Math.round(m / 60); if (h < 24) return `il y a ${h} h`;
    const d = Math.round(h / 24); return d < 45 ? `il y a ${d} j` : dt(iso);
  };
  const daysUntil = (iso) => { const t = ms(iso); return t == null ? null : Math.ceil((t - Date.now()) / DAY); };
  const eur = (v, dec) => (Number(v) || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 });
  const eurShort = (v) => v >= 10000 ? `${(v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k€` : eur(v);
  const eurCents = (c) => c ? eur(c / 100, 2) : '—';
  const nf = (v) => (Number(v) || 0).toLocaleString('fr-FR');
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const plural = (n, one, many) => `${nf(n)} ${n > 1 ? many : one}`;

  // Catégorie : calculée par le serveur (member_category) ; repli local identique si absente.
  function cat(m) {
    if (m.category) return m.category;
    if (m.isAdmin) return m.role === 'manager' ? 'manager' : 'admin';
    if (m.role === 'educator') return 'educator';
    const a = m.access || {};
    if (a.active) return a.plan === 'offert' ? 'privilege' : a.plan;
    return a.trialUsed || (a.plan && a.plan !== 'none') ? 'expired' : 'none';
  }
  const isTeam = (m) => ['admin', 'manager', 'educator'].includes(cat(m));
  const roleOf = (m) => (m.isAdmin ? (m.role === 'manager' ? 'manager' : 'admin') : (m.role === 'educator' ? 'educator' : 'member'));
  const me = () => A.getUser() || {};
  const seenOf = (m) => ms(m.lastSeenAt || m.lastLoginAt);
  const isOnline = (m) => { const t = seenOf(m); return t && Date.now() - t < 15 * 60000; };

  // Offre + phrase d'échéance (renouvellement, fin, essai).
  function planLine(m) {
    const a = m.access || {};
    const c = cat(m);
    if (c === 'admin') return { label: 'Accès complet', sub: 'administrateur', cls: '' };
    if (c === 'manager') return { label: 'Accès complet', sub: 'manageur, sans limite', cls: '' };
    if (c === 'educator') return { label: 'Accès complet', sub: 'par son rôle', cls: '' };
    const left = daysUntil(a.endsAt);
    const soon = left != null && left <= 7 ? 'is-warn' : '';
    if (c === 'privilege') return { label: 'Privilège', sub: a.endsAt ? `jusqu’au ${dt(a.endsAt)}` : 'sans limite', cls: soon };
    if (c === 'trial') return { label: 'Essai gratuit', sub: left != null ? `encore ${plural(Math.max(0, left), 'jour', 'jours')}` : 'en cours', cls: soon };
    if (c === 'expired') return { label: a.plan === 'trial' ? 'Essai terminé' : `${(TIER[a.plan === 'offert' ? 'privilege' : a.plan] || { name: 'Offre' }).name} terminé`, sub: a.endsAt ? `depuis le ${dt(a.endsAt)}` : 'essai utilisé', cls: 'is-bad' };
    if (c === 'none') return { label: 'Aucune offre', sub: `inscrit ${ago(m.createdAt)}`, cls: '' };
    const per = a.period === 'year' ? 'annuel' : a.period === 'month' ? 'mensuel' : '';
    const label = `${TIER[c].name}${per ? ' ' + per : ''}`;
    if (a.status === 'past_due') return { label, sub: 'paiement en retard', cls: 'is-bad' };
    if (a.status === 'canceling') return { label, sub: `se termine le ${dt(a.endsAt)}`, cls: 'is-warn' };
    return { label, sub: (a.paid ? 'renouvellement le ' : 'jusqu’au ') + dt(a.endsAt), cls: soon };
  }

  // ------------------------------------------------------------ État
  const S = { members: [], stats: null, days: 30, view: 'overview', metric: 'revenue', chip: 'all', filter: null, q: '', sort: 'seen', limit: 50, current: null, dtab: 'overview', list: [] };
  const store = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* tant pis */ } };
  const read = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  { const d = Number(read('chest_admin_days')); if ([7, 30, 90, 365].includes(d)) S.days = d; }
  { const v = read('chest_admin_view'); if (['overview', 'members', 'ranks', 'engagement'].includes(v)) S.view = v; }
  { const m = read('chest_admin_metric'); if (['revenue', 'signups', 'users', 'views'].includes(m)) S.metric = m; }
  const periodWord = () => ({ 7: 'sur 7 jours', 30: 'sur 30 jours', 90: 'sur 90 jours', 365: 'sur 12 mois' }[S.days]);

  function delta(cur, prev) {
    if (!prev && !cur) return '<span class="am-delta is-flat">=</span>';
    if (!prev) return '<span class="am-delta is-up">nouveau</span>';
    const d = Math.round((cur - prev) / prev * 100);
    if (d === 0) return '<span class="am-delta is-flat">0 %</span>';
    return `<span class="am-delta ${d > 0 ? 'is-up' : 'is-down'}">${d > 0 ? '+' : '−'}${Math.abs(d)} %</span>`;
  }

  // ------------------------------------------------------------ Petits graphiques
  let gradSeq = 0;
  function sparkArea(vals, color, h) {
    const W = 300, H = h || 58, n = vals.length;
    if (!n) return '';
    const max = Math.max(1, ...vals);
    const x = (i) => n === 1 ? W / 2 : i / (n - 1) * W;
    const y = (v) => H - 4 - v / max * (H - 10);
    const line = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    const id = 'ams' + (++gradSeq);
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".32"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
      <path d="${line}L${W},${H}L0,${H}Z" fill="url(#${id})"/>
      <path d="${line}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
    </svg>`;
  }
  function sparkBars(vals, color, h) {
    const W = 300, H = h || 58, n = vals.length;
    if (!n) return '';
    const max = Math.max(1, ...vals), bw = W / n;
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${vals.map((v, i) => {
      const bh = v ? Math.max(3, v / max * (H - 8)) : 1.5;
      return `<rect x="${(i * bw + bw * .2).toFixed(2)}" y="${(H - bh).toFixed(2)}" width="${(bw * .6).toFixed(2)}" height="${bh.toFixed(2)}" rx="1.5" fill="${v ? color : 'rgba(255,255,255,.1)'}" ${v ? `opacity="${(.4 + .6 * v / max).toFixed(2)}"` : ''}/>`;
    }).join('')}</svg>`;
  }
  const series = (key) => ((S.stats && S.stats.series) || []).map((p) => p[key] || 0);
  const cumul = (vals) => { let s = 0; return vals.map((v) => (s += v)); };

  // ------------------------------------------------------------ Vue d'ensemble
  function renderKpis() {
    const s = S.stats;
    const zone = $('amKpis');
    if (!s) { zone.innerHTML = '<div class="am-error">Statistiques indisponibles pour le moment.</div>'; return; }
    // Revenu mensuel par offre (abonnés payants actifs)
    const per = {};
    S.members.forEach((m) => {
      const c = cat(m);
      if (['essentiel', 'premium', 'allstar'].includes(c)) per[c] = (per[c] || 0) + 1;
    });
    const tot = Object.values(per).reduce((a, b) => a + b, 0);
    const mix = ['allstar', 'premium', 'essentiel'].filter((k) => per[k]);
    zone.innerHTML = `
      <div class="am-kpi am-kpi--hero">
        <div class="am-kpi__k">Revenu mensuel récurrent</div>
        <div class="am-kpi__v"><b>${eur(s.mrr)}</b></div>
        <div class="am-kpi__n">${plural(s.paying, 'abonné payant', 'abonnés payants')} · ${eur(s.mrr * 12)} sur un an</div>
        <div class="am-kpi__mix">${tot ? `<div class="am-mixbar">${mix.map((k) => `<i style="${tierStyle(k)};width:${per[k] / tot * 100}%"></i>`).join('')}</div>
          <div class="am-mixlegend">${mix.map((k) => `<span style="${tierStyle(k)}">${TIER[k].name} <b>${per[k]}</b></span>`).join('')}</div>` : '<div class="am-mixlegend">Aucun abonné payant pour l’instant.</div>'}</div>
      </div>
      <div class="am-kpi">
        <div class="am-kpi__k">Encaissé ${delta(s.collected, s.collectedPrev)}</div>
        <div class="am-kpi__v"><b>${eur(s.collected)}</b></div>
        <div class="am-kpi__n">${periodWord()} · ${eur(s.collectedPrev)} avant</div>
        <div class="am-kpi__spark">${sparkArea(cumul(series('revenue')), '#33e6a6')}</div>
      </div>
      <div class="am-kpi">
        <div class="am-kpi__k">Nouveaux membres ${delta(s.signups, s.signupsPrev)}</div>
        <div class="am-kpi__v"><b>${nf(s.signups)}</b></div>
        <div class="am-kpi__n">${periodWord()} · ${nf(s.signupsPrev)} avant</div>
        <div class="am-kpi__spark">${sparkBars(series('signups'), '#fc1283')}</div>
      </div>
      <div class="am-kpi">
        <div class="am-kpi__k">Actifs cette semaine</div>
        <div class="am-kpi__v"><b>${nf(s.active7)}</b></div>
        <div class="am-kpi__n">${nf(s.active1)} aujourd’hui · ${nf(s.active30)} sur 30 jours</div>
        <div class="am-kpi__spark">${sparkArea(series('users'), '#f9a45e')}</div>
      </div>`;
  }

  const METRICS = {
    revenue: { label: 'Encaissé', type: 'area', color: '#33e6a6', cum: true, fmt: eur, axis: eurShort,
      head: (s) => ({ v: eur(s.collected), d: delta(s.collected, s.collectedPrev), sub: periodWord() }) },
    signups: { label: 'Nouveaux membres', type: 'bars', color: '#fc1283', fmt: nf, axis: nf,
      head: (s) => ({ v: nf(s.signups), d: delta(s.signups, s.signupsPrev), sub: periodWord() }) },
    users: { label: 'Membres actifs par jour', type: 'area', color: '#f9a45e', fmt: nf, axis: nf, max: true,
      head: (s) => { const v = series('users'); const avg = v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; return { v: avg.toLocaleString('fr-FR', { maximumFractionDigits: 1 }), d: '', sub: `en moyenne par jour, ${periodWord()}` }; } },
    views: { label: 'Pages vues', type: 'area', color: '#9dbcff', fmt: nf, axis: nf,
      head: () => { const v = series('views'); return { v: nf(v.reduce((a, b) => a + b, 0)), d: '', sub: periodWord() }; } },
  };
  function niceMax(v) {
    if (v <= 4) return 4;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }
  function renderChart() {
    const el = $('amChart');
    const s = S.stats;
    const M = METRICS[S.metric];
    document.querySelectorAll('#amMetrics [data-metric]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.metric === S.metric)));
    if (!s) { el.innerHTML = ''; $('amMetricHead').innerHTML = ''; return; }
    const h = M.head(s);
    $('amMetricHead').innerHTML = `<div class="am-metric__k">${M.label}</div><div class="am-metric__v"><b>${h.v}</b>${h.d}<small>${h.sub}</small></div>`;
    let pts = s.series.map((p) => ({ day: p.day, to: p.day, v: p[S.metric] || 0 }));
    if (S.days > 90) {
      const w = [];
      for (let i = 0; i < pts.length; i += 7) {
        const g = pts.slice(i, i + 7);
        w.push({ day: g[0].day, to: g[g.length - 1].day, v: M.max ? Math.max(...g.map((x) => x.v)) : g.reduce((a, b) => a + b.v, 0) });
      }
      pts = w;
    }
    const raw = pts.map((p) => p.v);
    const vals = M.cum ? cumul(raw) : raw;
    const W = Math.max(280, el.clientWidth || 600), H = el.clientHeight || 250;
    const L = M.cum ? 48 : 34, R = 4, T = 12, B = 26;
    const iw = W - L - R, ih = H - T - B, n = vals.length;
    const max = niceMax(Math.max(1, ...vals));
    const step = iw / n;
    const x = (i) => M.type === 'bars' ? L + step * i + step / 2 : L + (n === 1 ? iw / 2 : i / (n - 1) * iw);
    const y = (v) => T + ih - v / max * ih;
    let grid = '';
    for (let i = 0; i <= 4; i++) {
      const v = max / 4 * i, yy = y(v);
      grid += `<line class="am-gridline" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"/><text class="am-axis" x="${L - 10}" y="${yy + 3.5}" text-anchor="end">${M.axis(Math.round(v * 100) / 100)}</text>`;
    }
    const id = 'amc' + (++gradSeq);
    let body = '';
    if (M.type === 'bars') {
      const bw = Math.max(2, Math.min(20, step * .58));
      body = vals.map((v, i) => v ? `<rect class="grow" style="animation-delay:${reduce ? 0 : Math.min(400, i * 8)}ms" x="${(x(i) - bw / 2).toFixed(1)}" y="${y(v).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1.5, T + ih - y(v)).toFixed(1)}" rx="${Math.min(4, bw / 2)}" fill="url(#${id})"/>` : '').join('');
      body = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${M.color}"/><stop offset="1" stop-color="${M.color}" stop-opacity=".25"/></linearGradient></defs>${body}`;
    } else {
      const line = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
      body = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${M.color}" stop-opacity=".28"/><stop offset="1" stop-color="${M.color}" stop-opacity="0"/></linearGradient></defs>
        <path class="fade" d="${line}L${x(n - 1).toFixed(1)},${T + ih}L${x(0).toFixed(1)},${T + ih}Z" fill="url(#${id})"/>
        <path class="draw" d="${line}" fill="none" stroke="${M.color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" style="filter:drop-shadow(0 0 8px ${M.color}88)"/>`;
    }
    const ticks = Math.min(6, n);
    let xl = '';
    for (let k = 0; k < ticks; k++) {
      const i = Math.round(k * (n - 1) / Math.max(1, ticks - 1));
      const d = new Date(pts[i].day + 'T12:00:00');
      xl += `<text class="am-axis" x="${x(i)}" y="${H - 6}" text-anchor="${k === 0 ? 'start' : k === ticks - 1 ? 'end' : 'middle'}">${d.toLocaleDateString('fr-FR', S.days > 90 ? { month: 'short' } : { day: 'numeric', month: 'short' })}</text>`;
    }
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${M.label}, ${periodWord()}">
      ${grid}${body}
      <line id="amGuide" x1="0" x2="0" y1="${T}" y2="${T + ih}" stroke="rgba(255,255,255,.25)" stroke-dasharray="3 3" opacity="0"/>
      <circle id="amDot" r="4.5" fill="${M.color}" stroke="#0b0b0d" stroke-width="2.5" opacity="0"/>
      ${xl}
      <rect id="amHit" x="${L}" y="${T}" width="${iw}" height="${ih}" fill="transparent"/>
    </svg><div class="am-tip" id="amTip"></div>`;
    const draw = el.querySelector('.draw');
    if (draw) draw.style.setProperty('--len', Math.ceil(draw.getTotalLength()) + 1);
    const hit = $('amHit'), tip = $('amTip'), guide = $('amGuide'), dot = $('amDot');
    const show = (ev) => {
      const r = el.getBoundingClientRect();
      const px = (ev.clientX - r.left) * (W / r.width);
      const i = M.type === 'bars' ? Math.max(0, Math.min(n - 1, Math.floor((px - L) / step))) : Math.max(0, Math.min(n - 1, Math.round((px - L) / iw * (n - 1))));
      const p = pts[i];
      guide.setAttribute('x1', x(i)); guide.setAttribute('x2', x(i)); guide.setAttribute('opacity', 1);
      dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(vals[i])); dot.setAttribute('opacity', 1);
      const d1 = new Date(p.day + 'T12:00:00'), d2 = new Date(p.to + 'T12:00:00');
      const when = p.day === p.to ? d1.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : `semaine du ${d1.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} au ${d2.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
      tip.innerHTML = `<small>${when}</small><b>${M.fmt(raw[i])}</b>${M.cum ? `<small style="margin:4px 0 0">cumul ${M.fmt(vals[i])}</small>` : ''}`;
      const left = x(i) / W * r.width;
      const tw = tip.offsetWidth || 150;
      tip.style.left = (left + 14 + tw > r.width ? left - tw - 14 : left + 14) + 'px';
      tip.classList.add('is-on');
    };
    const hide = () => { tip.classList.remove('is-on'); guide.setAttribute('opacity', 0); dot.setAttribute('opacity', 0); };
    hit.addEventListener('pointermove', show);
    hit.addEventListener('pointerdown', show);
    hit.addEventListener('pointerleave', hide);
  }

  // Ce qui demande une action : chaque ligne ouvre la liste déjà filtrée.
  const WATCH = [
    { key: 'trialEnd', c: '#7ce3f5', ic: 'clock', t: 'Essais qui se terminent', sub: 'dans 3 jours ou moins', test: (m) => cat(m) === 'trial' && (daysUntil(m.access.endsAt) ?? 99) <= 3 },
    { key: 'pastDue', c: '#ff4d5e', ic: 'card', t: 'Paiements en retard', sub: 'le prélèvement a échoué', test: (m) => (m.access || {}).status === 'past_due' && (m.access || {}).active },
    { key: 'canceling', c: '#f9a45e', ic: 'door', t: 'Résiliations programmées', sub: 'accès gardé jusqu’à l’échéance', test: (m) => (m.access || {}).status === 'canceling' && (m.access || {}).active },
    { key: 'privEnd', c: '#9dbcff', ic: 'gift', t: 'Privilèges qui expirent', sub: 'dans 14 jours ou moins', test: (m) => cat(m) === 'privilege' && (daysUntil(m.access.endsAt) ?? 99) <= 14 },
    { key: 'nudge', c: '#fc1283', ic: 'bell', t: 'À relancer', sub: 'accès actif, aucune visite depuis 7 jours', test: (m) => !isTeam(m) && (m.access || {}).active && seenOf(m) && seenOf(m) < Date.now() - 7 * DAY },
    { key: 'ghost', c: '#a0a0a8', ic: 'ghost', t: 'Jamais revenus', sub: 'inscrits, aucune visite', test: (m) => !isTeam(m) && m.status !== 'blocked' && !ms(m.lastSeenAt) && !((m.activity || {}).views30) },
  ];
  const WATCH_BY = Object.fromEntries(WATCH.map((w) => [w.key, w]));
  function renderWatch() {
    if (!S.loaded) return;
    const rows = WATCH.map((w) => ({ w, n: S.members.filter(w.test).length })).filter((r) => r.n);
    const ul = $('amWatch');
    if (!rows.length) { ul.outerHTML = `<div class="am-calm" id="amWatch">${ic('check')}<span>Rien à signaler. Tout le monde est à jour.</span></div>`; return; }
    if (ul.tagName !== 'UL') { const n = document.createElement('ul'); n.className = 'am-watch'; n.id = 'amWatch'; ul.replaceWith(n); }
    $('amWatch').innerHTML = rows.map(({ w, n }) => `<li><button type="button" data-watch="${w.key}" style="--c:${w.c}">
      <span class="am-watch__ic">${ic(w.ic)}</span><span class="am-watch__t">${w.t}<small>${w.sub}</small></span><span class="am-watch__n">${n}</span></button></li>`).join('');
  }

  function counts() {
    const c = {};
    S.members.forEach((m) => { const k = cat(m); c[k] = (c[k] || 0) + 1; });
    return c;
  }
  function renderMix() {
    const c = counts(), total = S.members.length || 1;
    const present = TIERS.filter((t) => c[t.key]);
    $('amMix').innerHTML = `<div class="am-mix__bar">${present.map((t, i) => `<i style="${tierStyle(t.key)};flex:${c[t.key]} 1 0;animation-delay:${i * 50}ms" title="${t.name} : ${c[t.key]}"></i>`).join('')}</div>
      <ul class="am-mix__list">${present.map((t) => `<li><button type="button" data-tier="${t.key}" style="${tierStyle(t.key)}">${badge(t.key, 20)}<span>${t.name}</span><span><b>${c[t.key]}</b><small>${pct(c[t.key], total)} %</small></span></button></li>`).join('')}</ul>`;
  }

  // Arrivées de la période (hors équipe) et leurs étapes.
  function arrivals() {
    const since = Date.now() - S.days * DAY;
    return S.members.filter((m) => !isTeam(m) && (ms(m.createdAt) || 0) >= since).sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
  }
  function steps(m) {
    const a = m.access || {};
    return [true, !!m.onboarding, !!a.trialUsed || !!a.trial, ['essentiel', 'premium', 'allstar'].includes(a.plan) && ['active', 'canceling', 'past_due'].includes(a.status)];
  }
  const STEP_LABELS = ['Inscrits', 'Questionnaire', 'Essai', 'Abonnés'];
  function funnel() {
    const list = arrivals();
    const f = [0, 0, 0, 0];
    list.forEach((m) => steps(m).forEach((s, i) => { if (s) f[i] += 1; }));
    return { n: list.length, f, list };
  }
  function renderFunnel() {
    const { n, f } = funnel();
    const s = S.stats;
    $('amFunnelMeta').textContent = periodWord();
    const conv = s && s.trial.started ? `${pct(s.trial.converted, s.trial.started)} %` : '—';
    $('amFunnel').innerHTML = `<ol class="am-fun">${STEP_LABELS.map((l, i) => `<li><span>${l}</span><b>${f[i]}${i && n ? `<small>${pct(f[i], n)} %</small>` : ''}</b><i style="--w:${n ? Math.max(f[i] ? 3 : 0, pct(f[i], n)) : 0}%;--o:${1 - i * .15};animation-delay:${i * 70}ms"></i></li>`).join('')}</ol>
      <div class="am-fun__foot"><span><b>${conv}</b>essais convertis (total)</span><span><b class="${s && s.churn ? 'is-neg' : ''}">${s ? s.churn : '—'}</b>résiliations ${periodWord()}</span></div>`;
  }
  function renderPages() {
    const pages = ((S.stats && S.stats.pages) || []).slice(0, 6);
    if (!pages.length) { $('amPages').innerHTML = '<li class="am-muted" style="display:block">Aucune page vue sur la période.</li>'; return; }
    const max = Math.max(1, ...pages.map((p) => p[1]));
    $('amPages').innerHTML = pages.map(([p, v], i) => `<li><span>${esc(PAGE_LABELS[p] || p)}</span><b>${nf(v)}</b><i style="--w:${Math.round(v / max * 100)}%;animation-delay:${i * 60}ms"></i></li>`).join('');
  }
  function renderLive() {
    const on = S.members.filter(isOnline).length;
    $('amLive').innerHTML = on ? `<i></i><b>${on}</b> en ligne maintenant` : '';
    $('amNavCount').textContent = S.members.length ? nf(S.members.length) : '';
  }
  function renderOverview() { renderKpis(); renderChart(); renderWatch(); renderMix(); renderFunnel(); renderPages(); }

  // ------------------------------------------------------------ Membres
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  function filtered() {
    const c = CHIPS.find((x) => x.key === S.chip) || CHIPS[0];
    const q = norm(S.q).trim();
    let list = S.members.filter((m) => c.test(m) && (!S.filter || S.filter.test(m)));
    if (q) list = list.filter((m) => norm(`${m.firstName} ${m.lastName} ${m.email} ${m.lastName} ${m.firstName}`).includes(q));
    const seen = (m) => seenOf(m) || 0;
    const end = (m) => ((m.access || {}).active && ms((m.access || {}).endsAt)) || Infinity;
    const sorters = {
      seen: (a, b) => seen(b) - seen(a),
      new: (a, b) => (ms(b.createdAt) || 0) - (ms(a.createdAt) || 0),
      active: (a, b) => ((b.activity || {}).views30 || 0) - ((a.activity || {}).views30 || 0),
      ends: (a, b) => end(a) - end(b),
      rank: (a, b) => (TIER[cat(a)] || TIER.none).rank - (TIER[cat(b)] || TIER.none).rank || seen(b) - seen(a),
      name: (a, b) => fullName(a).localeCompare(fullName(b), 'fr'),
    };
    return list.slice().sort(sorters[S.sort] || sorters.seen);
  }
  function renderChips() {
    $('amChips').innerHTML = CHIPS.map((c) => {
      const n = S.members.filter(c.test).length;
      if (c.hideEmpty && !n) return '';
      return `<button type="button" role="tab" data-chip="${c.key}" aria-selected="${S.chip === c.key}">${c.label}<small>${n}</small></button>`;
    }).join('');
    const f = $('amFilter');
    if (S.filter) {
      f.hidden = false;
      f.innerHTML = `<span>Filtre</span><button type="button" class="am-chip ${S.filter.tier ? '' : 'am-chip--plain'}" style="${S.filter.style}" data-clear-filter aria-label="Retirer le filtre ${esc(S.filter.label)}">${S.filter.tier ? badge(S.filter.tier, 16) : ''}${esc(S.filter.label)}${CROSS}</button>`;
    } else { f.hidden = true; f.innerHTML = ''; }
  }
  function rowHtml(m) {
    const c = cat(m);
    const t = TIER[c] || TIER.none;
    const p = planLine(m);
    const act = m.activity || {};
    const last30 = act.last30 || act.last14 || [];
    const isMe = me().id === m.id;
    return `<div class="am-tr am-row${S.current === m.id ? ' is-current' : ''}" role="row" tabindex="0" data-id="${m.id}" style="${tierStyle(c)}">
      <span class="am-who" role="cell"><span class="am-av">${esc(initials(m))}<span class="am-av__b">${badge(c, 16)}</span></span>
        <span><b>${esc(fullName(m))}${isMe ? '<span class="am-tag">toi</span>' : ''}${m.status === 'blocked' ? '<span class="am-tag am-tag--red">bloqué</span>' : ''}</b><small>${esc(m.email)}</small></span></span>
      <span role="cell">${chip(c)}</span>
      <span class="am-plan" role="cell"><b>${esc(p.label)}</b><small class="${p.cls}">${esc(p.sub)}</small></span>
      <span class="am-actcell" role="cell" title="Pages vues par jour, 30 derniers jours">${sparkBars(last30, t.c1, 24)}<small>${plural(act.days30 || 0, 'jour actif', 'jours actifs')}</small></span>
      <span class="am-seen${isOnline(m) ? ' is-on' : ''}" role="cell">${isOnline(m) ? 'en ligne' : esc(ago(m.lastSeenAt || m.lastLoginAt))}</span>
      ${CHEV_R}
    </div>`;
  }
  function renderRows() {
    const list = filtered();
    S.list = list.map((m) => m.id);
    const zone = $('amRows');
    if (!list.length) {
      zone.innerHTML = `<div class="am-empty">${S.q ? `Personne ne correspond à « ${esc(S.q)} ».` : 'Aucun membre ici pour l’instant.'}</div>`;
      return;
    }
    const shown = list.slice(0, S.limit);
    zone.innerHTML = shown.map(rowHtml).join('') + (list.length > shown.length ? `<div class="am-more"><button type="button" class="chest-btn-2" data-more>Afficher ${Math.min(50, list.length - shown.length)} de plus · ${list.length - shown.length} restants</button></div>` : '');
  }
  function renderMembers() { renderChips(); renderRows(); }

  // ------------------------------------------------------------ Rangs
  function renderRanks() {
    const c = counts(), total = S.members.length || 1;
    const present = TIERS.filter((t) => c[t.key]);
    $('amSpectrum').innerHTML = `<div class="am-spectrum__bar">${present.map((t, i) => `<button type="button" data-tier="${t.key}" style="${tierStyle(t.key)};--f:${c[t.key]};animation-delay:${i * 50}ms" title="${t.name} : ${c[t.key]}" aria-label="${t.name} : ${c[t.key]} membres">${c[t.key] / total >= .06 ? `<span>${c[t.key]}</span>` : ''}</button>`).join('')}</div>
      <div class="am-spectrum__legend"><span>Sommet de la hiérarchie</span><span>${plural(S.members.length, 'membre', 'membres')}</span><span>Base</span></div>`;
    const bySeen = (a, b) => (seenOf(b) || 0) - (seenOf(a) || 0);
    $('amRanks').innerHTML = GROUPS.map((g) => {
      const tiers = TIERS.filter((t) => t.group === g.key);
      const n = tiers.reduce((a, t) => a + (c[t.key] || 0), 0);
      return `<section class="am-group" aria-label="${g.name}">
        <div class="am-group__h"><h2>${g.name}</h2><span>${g.desc}</span><em>${plural(n, 'membre', 'membres')}</em></div>
        <div class="am-group__grid">${tiers.map((t) => {
          const people = S.members.filter((m) => cat(m) === t.key).sort(bySeen);
          const k = people.length;
          return `<article class="am-rank${k ? '' : ' is-zero'}" style="${tierStyle(t.key)}">
            <div class="am-rank__top">${badge(t.key, 46)}<div class="am-rank__name"><b>${t.name}</b><small>${pct(k, total)} % des membres</small></div><span class="am-rank__n">${k}</span></div>
            <p class="am-rank__rights">${t.rights}</p>
            <div class="am-faces">${people.slice(0, 6).map((m) => `<span class="am-av am-av--sm" style="${tierStyle(t.key)}" title="${esc(fullName(m))}">${esc(initials(m))}</span>`).join('')}${k > 6 ? `<em>+${k - 6}</em>` : k ? '' : '<em>Personne pour l’instant</em>'}</div>
            <div class="am-rank__foot">${k ? `<button type="button" class="am-rank__go" data-tier="${t.key}">Voir les membres</button>` : '<span></span>'}${t.key === 'privilege' ? '<button type="button" class="am-rank__gift" data-gift>＋ Offrir</button>' : ''}</div>
          </article>`;
        }).join('')}</div>
      </section>`;
    }).join('');
  }

  // ------------------------------------------------------------ Engagement
  function person(m, right, cls) {
    const c = cat(m);
    return `<li class="am-pers" tabindex="0" data-open="${m.id}" style="${tierStyle(c)}">
      <span class="am-av am-av--sm">${esc(initials(m))}</span>
      <span style="min-width:0"><b>${esc(fullName(m))}</b><small>${esc((TIER[c] || TIER.none).name)}</small></span>
      <span class="am-pers__v ${cls || ''}">${right}</span></li>`;
  }
  function renderEngagement() {
    const { n, f, list } = funnel();
    $('amArrMeta').textContent = `${plural(n, 'arrivée', 'arrivées')} ${periodWord()}`;
    $('amSteps').innerHTML = STEP_LABELS.map((l, i) => `<div class="am-step${f[i] ? '' : ' is-zero'}"><span>${l}</span><b>${f[i]}</b><small>${i ? `${pct(f[i], n)} % des inscrits` : periodWord()}</small></div>`).join('');
    const stepName = ['Inscrit', 'A répondu', 'En essai', 'Abonné'];
    $('amArrivals').innerHTML = n ? list.slice(0, 12).map((m) => {
      const s = steps(m);
      const last = s.lastIndexOf(true);
      return `<li class="am-arr" tabindex="0" data-open="${m.id}" style="${tierStyle(cat(m))}">
        <span class="am-av am-av--sm">${esc(initials(m))}</span>
        <span style="min-width:0"><b>${esc(fullName(m))}</b><small>${esc(ago(m.createdAt))}</small></span>
        <span class="am-journey" title="${STEP_LABELS.map((l, i) => `${l} : ${s[i] ? 'oui' : 'non'}`).join(' · ')}">${s.map((x) => `<i class="${x ? 'is-done' : ''}"></i>`).join('')}<span>${stepName[last]}</span></span>
      </li>`;
    }).join('') : '<li class="am-empty">Aucune arrivée sur la période.</li>';
    const students = S.members.filter((m) => !isTeam(m) && m.status !== 'blocked');
    const top = students.filter((m) => (m.activity || {}).views30 > 0).sort((a, b) => b.activity.views30 - a.activity.views30).slice(0, 5);
    $('amTop').innerHTML = top.length ? top.map((m) => person(m, `<b>${nf(m.activity.views30)}</b> pages · ${m.activity.days30} j`)).join('') : '<li class="am-empty">Pas encore d’activité.</li>';
    const nudge = students.filter(WATCH_BY.nudge.test).sort((a, b) => seenOf(a) - seenOf(b)).slice(0, 5);
    $('amNudge').innerHTML = nudge.length ? nudge.map((m) => person(m, esc(ago(m.lastSeenAt)), 'is-warn')).join('') : '<li class="am-empty">Personne : tous ceux qui ont un accès sont passés cette semaine.</li>';
    const ghost = students.filter(WATCH_BY.ghost.test).sort((a, b) => ms(b.createdAt) - ms(a.createdAt)).slice(0, 5);
    $('amGhost').innerHTML = ghost.length ? ghost.map((m) => person(m, 'inscrit ' + esc(ago(m.createdAt)))).join('') : '<li class="am-empty">Tout le monde est revenu au moins une fois.</li>';
  }

  // ------------------------------------------------------------ Vues
  const RENDER = { overview: renderOverview, members: renderMembers, ranks: renderRanks, engagement: renderEngagement };
  function placeIndicator() {
    const tabs = document.querySelector('.am-nav__tabs');
    let ind = tabs.querySelector('.am-nav__ind');
    if (!ind) { ind = document.createElement('span'); ind.className = 'am-nav__ind'; tabs.appendChild(ind); }
    const b = tabs.querySelector(`[data-view="${S.view}"]`);
    ind.style.width = (b.offsetWidth - 28) + 'px';
    ind.style.transform = `translateX(${b.offsetLeft + 14}px)`;
  }
  function setView(v, opts) {
    S.view = v;
    store('chest_admin_view', v);
    document.querySelectorAll('#amNav [data-view]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === v)));
    document.querySelectorAll('.am-view').forEach((p) => { p.hidden = p.dataset.panel !== v; });
    const usesPeriod = v === 'overview' || v === 'engagement';
    if (usesPeriod) $('amPeriod').removeAttribute('data-off'); else $('amPeriod').setAttribute('data-off', '');
    RENDER[v]();
    placeIndicator();
    if (!(opts && opts.keepScroll)) {
      const nav = $('amNav');
      if (nav.getBoundingClientRect().top <= 1) window.scrollTo({ top: window.scrollY + nav.parentElement.getBoundingClientRect().top + nav.offsetTop - 0, behavior: 'auto' });
    }
  }
  function goMembers(filter, chipKey) {
    S.filter = filter || null;
    S.chip = chipKey || 'all';
    S.q = ''; $('amSearch').value = ''; S.limit = 50;
    setView('members');
  }
  const tierFilter = (key) => ({ tier: key, label: TIER[key].name, style: tierStyle(key), test: (m) => cat(m) === key });
  const watchFilter = (key) => { const w = WATCH_BY[key]; return { label: w.t, style: `--c1:${w.c};--c2:${w.c}`, test: w.test }; };

  // ------------------------------------------------------------ Volet latéral
  let lastFocus = null;
  function openDrawer(id, tab) {
    const m = S.members.find((x) => x.id === id);
    if (!m) return;
    if (!S.list.includes(id)) S.list = filtered().map((x) => x.id).includes(id) ? filtered().map((x) => x.id) : [id];
    if (!S.current) lastFocus = document.activeElement;
    S.current = id;
    if (tab) S.dtab = tab;
    const d = $('amDrawer');
    renderDrawer();
    if (d.hidden) {
      d.hidden = false;
      void d.offsetWidth; // reflow : la transition part de l'état fermé, sans dépendre d'une image peinte
      d.classList.add('is-open');
      setTimeout(() => d.querySelector('.am-drawer__win').focus({ preventScroll: true }), 40);
    }
    document.querySelectorAll('.am-row').forEach((r) => r.classList.toggle('is-current', Number(r.dataset.id) === id));
  }
  function closeDrawer() {
    const d = $('amDrawer');
    if (d.hidden) return;
    d.classList.remove('is-open');
    S.current = null;
    document.querySelectorAll('.am-row.is-current').forEach((r) => r.classList.remove('is-current'));
    setTimeout(() => { if (!S.current) d.hidden = true; }, reduce ? 0 : 340);
    if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }
  function stepDrawer(dir) {
    const i = S.list.indexOf(S.current);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= S.list.length) return;
    openDrawer(S.list[j]);
    const row = document.querySelector(`.am-row[data-id="${S.list[j]}"]`);
    if (row) row.scrollIntoView({ block: 'nearest' });
  }
  function renderDrawer() {
    const m = S.members.find((x) => x.id === S.current);
    if (!m) { closeDrawer(); return; }
    const c = cat(m);
    const a = m.access || {};
    const act = m.activity || { days7: 0, days30: 0, views30: 0, top: [], last30: [] };
    const isMe = me().id === m.id;
    const p = planLine(m);
    const i = S.list.indexOf(m.id);
    $('amDrawerPos').textContent = S.list.length > 1 && i >= 0 ? `${i + 1} sur ${S.list.length}` : '';
    document.querySelectorAll('#amDrawer [data-step]').forEach((b) => { const j = i + Number(b.dataset.step); b.disabled = i < 0 || j < 0 || j >= S.list.length; });
    const tabs = [['overview', 'Aperçu'], ['access', 'Rôle et accès'], ['activity', 'Activité'], ['history', 'Historique']];
    if (!tabs.some((t) => t[0] === S.dtab)) S.dtab = 'overview';
    const left = daysUntil(a.endsAt);
    const ob = m.onboarding;
    const role = roleOf(m);
    const planNow = c === 'privilege' ? 'offert' : ['premium', 'essentiel'].includes(c) ? c : (c === 'none' || c === 'expired' ? 'none' : 'offert');
    const t = TIER[c] || TIER.none;
    const maxV = Math.max(1, ...(act.top || []).map((x) => x[1]));
    const last30 = act.last30 || act.last14 || [];
    const log = m.billing || [];
    const tabsHtml = `<div class="am-dtabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" data-dtab="${k}" aria-selected="${S.dtab === k}">${l}</button>`).join('')}</div>`;
    const overview = `<div class="am-dpane" data-dpane="overview" ${S.dtab === 'overview' ? '' : 'hidden'}>
      <div class="am-block"><div class="am-facts">
        <div class="am-fact"><span>Offre</span><b>${esc(p.label)}</b></div>
        <div class="am-fact"><span>Échéance</span><b class="${p.cls}">${a.plan === 'offert' && !a.endsAt && c === 'privilege' ? 'Sans limite' : isTeam(m) ? '—' : esc(dt(a.endsAt))}</b></div>
        <div class="am-fact"><span>Dernière visite</span><b class="${isOnline(m) ? 'is-ok' : ''}">${isOnline(m) ? 'En ligne' : esc(ago(m.lastSeenAt || m.lastLoginAt))}</b></div>
        <div class="am-fact"><span>Membre depuis</span><b>${esc(dt(m.createdAt))}</b></div>
        <div class="am-fact"><span>Jours actifs · 30 j</span><b>${act.days30}</b></div>
        <div class="am-fact"><span>Statut</span><b class="${a.status === 'past_due' ? 'is-bad' : a.status === 'canceling' ? 'is-warn' : ''}">${esc(isTeam(m) ? 'Équipe' : STATUS[a.status] || (a.active ? 'Actif' : 'Sans accès'))}</b></div>
      </div>${left != null && left >= 0 && left <= 7 && !isTeam(m) ? `<p class="am-hint">Échéance dans ${plural(left, 'jour', 'jours')}.</p>` : ''}</div>
      <div class="am-block"><h3 class="am-sub">Questionnaire</h3>${ob ? `<dl class="am-dl">
        <dt>Niveau</dt><dd>${esc(ob.level || '—')} / 10</dd>
        <dt>Déjà gagné en trading</dt><dd>${esc(ANSWERS.made[ob.made] || '—')}${ob.amount ? ', ' + esc(ANSWERS.amount[ob.amount] || '') : ''}</dd>
        <dt>Objectif</dt><dd>${esc(ANSWERS.goal[ob.goal] || '—')}</dd>
        <dt>Budget</dt><dd>${esc(ANSWERS.budget[ob.budget] || '—')}</dd>
        <dt>Offre conseillée</dt><dd>${esc(ANSWERS.reco[ob.recommended] || '—')}</dd>
      </dl>` : '<p class="am-muted">Pas encore répondu.</p>'}</div>
      <div class="am-block"><h3 class="am-sub">Abonnement</h3><dl class="am-dl">
        <dt>Offre</dt><dd>${esc(a.label || 'Aucune')}</dd>
        <dt>Période</dt><dd>${a.period === 'year' ? 'Annuelle' : a.period === 'month' ? 'Mensuelle' : '—'}</dd>
        <dt>Début</dt><dd>${esc(dt(a.startedAt))}</dd>
        <dt>Dernier montant</dt><dd>${eurCents(m.amount)}</dd>
      </dl></div>
    </div>`;
    const access = `<div class="am-dpane" data-dpane="access" ${S.dtab === 'access' ? '' : 'hidden'}>${isMe ? '<p class="am-muted">C’est ton compte : ton rôle et ton accès ne se modifient pas d’ici.</p>' : `
      <div class="am-block"><h3 class="am-sub">Rôle</h3>
        <div class="am-opt">${[['member', 'Membre', 'Droits selon son offre'], ['educator', 'Éducateur', 'Accès complet, School bientôt'], ['manager', 'Manageur', 'Pouvoirs admin, sans HQ'], ['admin', 'Admin', 'Tous les droits']].filter(([k]) => k !== 'admin' || me().role !== 'manager').map(([k, l, s]) => `<button type="button" data-role="${k}" aria-pressed="${role === k}"><b>${badge(k === 'member' ? (['admin', 'manager', 'educator'].includes(c) ? 'none' : c) : k, 18)}${l}</b><small>${s}</small></button>`).join('')}</div>
        <p class="am-msg" data-role-msg role="status" style="margin-top:10px"></p>
      </div>
      <form class="am-block" data-access-form><h3 class="am-sub">Accès</h3>
        <div class="am-opt am-opt--4">${[['offert', 'Privilège', 'Tout, offert'], ['premium', 'Premium', 'Tout CHEST'], ['essentiel', 'Essentiel', 'Sans School ni BERICH'], ['none', 'Aucun', 'Couper l’accès']].map(([k, l, s]) => `<button type="button" data-plan="${k}" aria-pressed="${planNow === k}"><b>${l}</b><small>${s}</small></button>`).join('')}</div>
        <div data-dur-row ${planNow === 'none' ? 'hidden' : ''} style="margin-top:14px">
          <div class="am-dur">${[['7', '7 jours'], ['30', '30 jours'], ['90', '3 mois'], ['365', '1 an'], ['date', 'Jusqu’au…'], ['', 'Sans limite']].map(([k, l]) => `<button type="button" data-dur="${k}" class="${(planNow === 'offert' ? k === '' : k === '30') ? 'is-active' : ''}" ${k === '' && planNow !== 'offert' ? 'hidden' : ''}>${l}</button>`).join('')}</div>
          <input type="date" class="am-date" data-dur-date hidden aria-label="Date de fin" min="${isoDay(new Date(Date.now() + DAY))}">
        </div>
        <div class="am-row-ctl"><button type="submit" class="chest-btn">Appliquer</button><p class="am-msg" data-access-msg role="status"></p></div>
        ${role !== 'member' ? '<p class="am-hint">Son rôle lui donne déjà tout : l’accès ne comptera que s’il redevient Membre.</p>' : ''}
      </form>
      <div class="am-block"><h3 class="am-sub">Compte</h3>
        <div class="am-danger">${m.status === 'blocked' ? '<button type="button" data-unblock>Débloquer</button>' : '<button type="button" data-block>Bloquer</button>'}<button type="button" data-del>Supprimer définitivement</button></div>
        <p class="am-hint">Bloquer coupe l’accès tout de suite, sans rien effacer. Supprimer efface le compte et toutes ses données.</p>
      </div>`}
    </div>`;
    const activity = `<div class="am-dpane" data-dpane="activity" ${S.dtab === 'activity' ? '' : 'hidden'}>
      <div class="am-block"><div class="am-facts" style="grid-template-columns:repeat(3,minmax(0,1fr))">
        <div class="am-fact"><span>Jours · 7 j</span><b>${act.days7 || 0}</b></div>
        <div class="am-fact"><span>Jours · 30 j</span><b>${act.days30 || 0}</b></div>
        <div class="am-fact"><span>Pages · 30 j</span><b>${nf(act.views30 || 0)}</b></div>
      </div></div>
      <div class="am-block"><h3 class="am-sub">Pages vues par jour</h3>
        <div class="am-bars30">${sparkBars(last30, t.c1, 90)}</div><div class="am-bars30__ax"><span>il y a 30 jours</span><span>aujourd’hui</span></div>
      </div>
      <div class="am-block"><h3 class="am-sub">Ce qu’il utilise</h3>
        ${(act.top || []).length ? `<ul class="am-toplist">${act.top.map(([pg, v]) => `<li><span>${esc(PAGE_LABELS[pg] || pg)}</span><b>${v}</b><i style="--w:${Math.round(v / maxV * 100)}%"></i></li>`).join('')}</ul>` : '<p class="am-muted">Aucune activité sur 30 jours.</p>'}
      </div>
      <p class="am-muted">Page ouverte, jour et nombre de vues seulement. Jamais le contenu.</p>
    </div>`;
    const history = `<div class="am-dpane" data-dpane="history" ${S.dtab === 'history' ? '' : 'hidden'}>
      ${log.length ? `<ul class="am-log">${log.map((b) => `<li class="${/paid|completed|succeeded/.test(b.type) ? 'is-pay' : /failed|deleted/.test(b.type) ? 'is-bad' : ''}"><span>${esc(b.summary)}</span><span>${b.amount ? eurCents(b.amount) : ''}</span><small>${esc(dt(b.at, true))}</small></li>`).join('')}</ul>` : '<p class="am-muted">Aucun paiement ni changement pour l’instant.</p>'}
    </div>`;
    $('amDrawerBody').innerHTML = `<div class="am-dh" style="${tierStyle(c)}">
        <div class="am-dh__row"><span class="am-av am-av--lg">${esc(initials(m))}<span class="am-av__b">${badge(c, 26)}</span></span>
          <div><h2 id="amDrawerName">${esc(fullName(m))}</h2><p>${esc(m.email)}</p></div></div>
        <div class="am-dh__chips">${chip(c)}${isMe ? '<span class="am-tag">toi</span>' : ''}${m.status === 'blocked' ? '<span class="am-tag am-tag--red">bloqué</span>' : ''}${isOnline(m) ? '<span class="am-tag" style="color:var(--chest-green);background:rgba(51,230,166,.1)">en ligne</span>' : ''}</div>
      </div>${tabsHtml}${overview}${access}${activity}${history}`;
  }

  // ------------------------------------------------------------ Chargement
  async function loadStats() { try { S.stats = await A.fetchAdminStats(S.days); } catch (e) { S.stats = null; } }
  async function loadMembers() { S.members = await A.fetchMembers(); S.loaded = true; }
  async function reload() {
    await Promise.all([loadMembers(), loadStats()]);
    renderLive();
    RENDER[S.view]();
    if (S.current) renderDrawer();
  }
  function setPeriod(days) {
    S.days = days;
    store('chest_admin_days', String(days));
    document.querySelectorAll('#amPeriod [data-days]').forEach((b) => b.classList.toggle('is-active', Number(b.dataset.days) === days));
    loadStats().then(() => RENDER[S.view]());
  }

  // ------------------------------------------------------------ Événements
  // Voile de la barre des vues seulement quand elle colle en haut (voir .am-nav.is-stuck).
  const stuckNav = $('amNav');
  const syncStuck = () => stuckNav.classList.toggle('is-stuck', stuckNav.getBoundingClientRect().top <= 1 && window.scrollY > 0);
  window.addEventListener('scroll', syncStuck, { passive: true });
  syncStuck();
  $('amNav').addEventListener('click', (e) => { const b = e.target.closest('[data-view]'); if (b) setView(b.dataset.view); });
  $('amPeriod').addEventListener('click', (e) => { const b = e.target.closest('[data-days]'); if (b) setPeriod(Number(b.dataset.days)); });
  $('amMetrics').addEventListener('click', (e) => { const b = e.target.closest('[data-metric]'); if (!b) return; S.metric = b.dataset.metric; store('chest_admin_metric', S.metric); renderChart(); });
  $('amQuick').addEventListener('click', () => { if (S.view !== 'members') setView('members'); $('amSearch').focus(); });

  // Vue d'ensemble / Rangs : ouvrir la liste filtrée
  document.querySelector('[data-panel="overview"]').addEventListener('click', (e) => {
    const w = e.target.closest('[data-watch]'); if (w) { goMembers(watchFilter(w.dataset.watch)); return; }
    const t = e.target.closest('[data-tier]'); if (t) { goMembers(tierFilter(t.dataset.tier)); return; }
    const g = e.target.closest('[data-goto]'); if (g) setView(g.dataset.goto);
  });
  document.querySelector('[data-panel="ranks"]').addEventListener('click', (e) => {
    if (e.target.closest('[data-gift]')) { openGift(); return; }
    const t = e.target.closest('[data-tier]'); if (t) goMembers(tierFilter(t.dataset.tier));
  });
  const openHandler = (e) => { const g = e.target.closest('[data-open]'); if (g && (e.type === 'click' || e.key === 'Enter')) { e.preventDefault(); openDrawer(Number(g.dataset.open)); } };
  ['amArrivals', 'amTop', 'amNudge', 'amGhost'].forEach((id) => { $(id).addEventListener('click', openHandler); $(id).addEventListener('keydown', openHandler); });

  // Membres
  $('amChips').addEventListener('click', (e) => { const b = e.target.closest('[data-chip]'); if (!b) return; S.chip = b.dataset.chip; S.limit = 50; renderMembers(); });
  $('amFilter').addEventListener('click', (e) => { if (e.target.closest('[data-clear-filter]')) { S.filter = null; renderMembers(); } });
  let qTimer;
  $('amSearch').addEventListener('input', (e) => { clearTimeout(qTimer); qTimer = setTimeout(() => { S.q = e.target.value; S.limit = 50; renderRows(); }, 80); });
  $('amSearch').addEventListener('keydown', (e) => { if (e.key === 'Enter' && S.list.length) openDrawer(S.list[0]); });
  $('amSort').addEventListener('change', (e) => { S.sort = e.target.value; renderRows(); });
  $('amRows').addEventListener('click', (e) => {
    if (e.target.closest('[data-more]')) { S.limit += 50; renderRows(); return; }
    const r = e.target.closest('.am-row'); if (r) openDrawer(Number(r.dataset.id));
  });
  $('amRows').addEventListener('keydown', (e) => {
    const r = e.target.closest('.am-row'); if (!r) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDrawer(Number(r.dataset.id)); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = e.key === 'ArrowDown' ? r.nextElementSibling : r.previousElementSibling; if (n && n.classList.contains('am-row')) n.focus(); }
  });

  // Raccourcis clavier
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (!$('amGift').hidden) { if (e.key === 'Escape') closeGift(); return; }
    if (S.current) {
      if (e.key === 'Escape') { closeDrawer(); return; }
      if (!typing && (e.key === 'ArrowDown' || e.key === 'j')) { e.preventDefault(); stepDrawer(1); return; }
      if (!typing && (e.key === 'ArrowUp' || e.key === 'k')) { e.preventDefault(); stepDrawer(-1); return; }
      return;
    }
    if (e.key === '/' && !typing) { e.preventDefault(); if (S.view !== 'members') setView('members'); $('amSearch').focus(); }
  });

  // Volet : onglets, navigation, actions
  const wireDur = (scope, target) => {
    const b = target.closest('[data-dur]'); if (!b) return false;
    scope.querySelectorAll('[data-dur]').forEach((x) => x.classList.toggle('is-active', x === b));
    const date = scope.querySelector('[data-dur-date]');
    date.hidden = b.dataset.dur !== 'date';
    if (!date.hidden) { if (!date.value) date.value = isoDay(new Date(Date.now() + 30 * DAY)); date.focus(); }
    return true;
  };
  function readDur(scope) {
    const b = scope.querySelector('[data-dur].is-active');
    const v = b ? b.dataset.dur : '';
    if (v === 'date') {
      const d = scope.querySelector('[data-dur-date]').value;
      if (!d) throw new Error('Choisis une date de fin.');
      if (Date.parse(d + 'T21:59:59Z') <= Date.now()) throw new Error('La date de fin doit être dans le futur.');
      return { days: null, until: d };
    }
    return { days: v ? Number(v) : null, until: '' };
  }
  const say = (el, text, kind) => { if (!el) return; el.textContent = text; el.className = 'am-msg' + (kind ? ' is-' + kind : ''); };

  $('amDrawer').addEventListener('click', async (e) => {
    if (e.target.closest('[data-close-drawer]')) { closeDrawer(); return; }
    const st = e.target.closest('[data-step]'); if (st) { stepDrawer(Number(st.dataset.step)); return; }
    const tb = e.target.closest('[data-dtab]');
    if (tb) {
      S.dtab = tb.dataset.dtab;
      document.querySelectorAll('#amDrawer [data-dtab]').forEach((x) => x.setAttribute('aria-selected', String(x === tb)));
      document.querySelectorAll('#amDrawer [data-dpane]').forEach((p) => { p.hidden = p.dataset.dpane !== S.dtab; });
      return;
    }
    const body = $('amDrawerBody');
    if (wireDur(body, e.target)) return;
    const id = S.current;
    const m = S.members.find((x) => x.id === id);
    if (!m) return;

    const planBtn = e.target.closest('[data-plan]');
    if (planBtn) {
      body.querySelectorAll('[data-plan]').forEach((x) => x.setAttribute('aria-pressed', String(x === planBtn)));
      const plan = planBtn.dataset.plan;
      body.querySelector('[data-dur-row]').hidden = plan === 'none';
      body.querySelector('[data-dur=""]').hidden = plan !== 'offert';
      // Privilège : « Sans limite » par défaut ; une offre payante garde la durée choisie, sinon 30 jours.
      const cur = body.querySelector('[data-dur].is-active');
      const keep = plan !== 'offert' && cur && !cur.hidden && cur.dataset.dur !== '';
      if (!keep) wireDur(body, body.querySelector(plan === 'offert' ? '[data-dur=""]' : '[data-dur="30"]'));
      return;
    }

    const roleBtn = e.target.closest('[data-role]');
    if (roleBtn) {
      const role = roleBtn.dataset.role;
      const cur = roleOf(m);
      if (role === cur) return;
      if (role === 'manager' && !(await CHESTConfirm(`Faire de ${fullName(m)} un manageur ? Il aura les pouvoirs d’un admin (membres, Privilèges, prix) et un accès illimité, mais pas CHEST HQ.`))) return;
      if (role === 'admin' && !(await CHESTConfirm(`Faire de ${fullName(m)} un administrateur ? Il aura tous les droits, y compris gérer, bloquer et supprimer des membres.`))) return;
      const msg = body.querySelector('[data-role-msg]');
      say(msg, 'Enregistrement…');
      try { await A.setMemberRole(id, role); await reload(); say($('amDrawerBody').querySelector('[data-role-msg]'), 'Rôle mis à jour.', 'ok'); } catch (err) { say(msg, err.message, 'err'); }
      return;
    }

    const blockBtn = e.target.closest('[data-block],[data-unblock]');
    if (blockBtn) {
      const blocking = blockBtn.hasAttribute('data-block');
      if (blocking && !(await CHESTConfirm(`Bloquer ${fullName(m)} ? Son accès est coupé tout de suite (déconnexion forcée). Tu pourras le débloquer plus tard.`))) return;
      blockBtn.disabled = true;
      try { if (blocking) await A.blockMember(id); else await A.approveMember(id); await reload(); } catch (err) { await CHESTAlert(err.message); blockBtn.disabled = false; }
      return;
    }
    if (e.target.closest('[data-del]')) {
      const typed = await CHESTPrompt(`Supprimer définitivement ${fullName(m)} ? Son compte et TOUTES ses données (comptes de trading, Myfxbook, VPS, journal, backtests, alertes, notifications, activité, historique de paiement) seront effacés. C'est irréversible. Tape SUPPRIMER pour confirmer.`, { confirmLabel: 'Supprimer' });
      if (typed == null) return;
      if (typed.trim().toUpperCase() !== 'SUPPRIMER') { await CHESTAlert('Suppression annulée : il fallait taper SUPPRIMER.'); return; }
      try { await A.deleteMember(id); closeDrawer(); await reload(); } catch (err) { await CHESTAlert(err.message); }
    }
  });
  $('amDrawer').addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-access-form]');
    if (!form) return;
    e.preventDefault();
    const id = S.current;
    const msg = form.querySelector('[data-access-msg]');
    const plan = (form.querySelector('[data-plan][aria-pressed="true"]') || {}).dataset.plan;
    let dur = { days: null, until: '' };
    try { if (plan !== 'none') dur = readDur(form); } catch (err) { say(msg, err.message, 'err'); return; }
    if (plan !== 'offert' && plan !== 'none' && !dur.days && !dur.until) { say(msg, 'Choisis une durée pour cette offre.', 'err'); return; }
    say(msg, 'Enregistrement…');
    try {
      await A.setMemberAccess(id, plan, dur.days, dur.until);
      await reload();
      say($('amDrawerBody').querySelector('[data-access-msg]'), 'Accès mis à jour.', 'ok');
    } catch (err) { say(msg, err.message, 'err'); }
  });

  // ------------------------------------------------------------ Fenêtre « Offrir un Privilège »
  const gift = { id: null, lastFocus: null };
  function openGift(presetId) {
    gift.lastFocus = document.activeElement;
    gift.id = null;
    $('amGiftBadge').innerHTML = badge('privilege', 52);
    $('amGift').hidden = false;
    $('amGiftQ').value = '';
    $('amGiftPick').hidden = true;
    $('amGiftQ').parentElement.hidden = false;
    say($('amGift').querySelector('.am-msg'), '');
    const form = $('amGiftForm');
    wireDur(form, form.querySelector('[data-dur=""]'));
    renderGiftList();
    if (presetId) pickGift(presetId); else setTimeout(() => $('amGiftQ').focus(), 30);
  }
  function closeGift() { $('amGift').hidden = true; if (gift.lastFocus && gift.lastFocus.focus) gift.lastFocus.focus(); }
  function renderGiftList() {
    const q = norm($('amGiftQ').value).trim();
    const cands = S.members.filter((m) => !m.isAdmin && m.id !== me().id && (!q || norm(`${m.firstName} ${m.lastName} ${m.email}`).includes(q)))
      .sort((a, b) => (seenOf(b) || 0) - (seenOf(a) || 0)).slice(0, q ? 8 : 5);
    $('amGiftList').innerHTML = gift.id ? '' : cands.map((m) => `<li role="option" data-pick="${m.id}" style="${tierStyle(cat(m))}"><span class="am-av am-av--sm">${esc(initials(m))}</span><span style="min-width:0"><b>${esc(fullName(m))}</b><small>${esc(m.email)}</small></span>${chip(cat(m))}</li>`).join('') || (q ? '<li style="display:block;cursor:default"><small>Personne ne correspond.</small></li>' : '');
  }
  function pickGift(id) {
    const m = S.members.find((x) => x.id === id);
    if (!m) return;
    gift.id = id;
    const p = $('amGiftPick');
    p.hidden = false;
    p.setAttribute('style', tierStyle(cat(m)));
    const pl = planLine(m);
    p.innerHTML = `<span class="am-av am-av--sm">${esc(initials(m))}</span><span style="min-width:0"><b>${esc(fullName(m))}</b><small>${esc(pl.label)} · ${esc(pl.sub)}</small></span><button type="button" data-unpick>Changer</button>`;
    $('amGiftQ').parentElement.hidden = true;
    renderGiftList();
  }
  $('amGiftBtn').addEventListener('click', () => openGift(null));
  $('amGiftQ').addEventListener('input', renderGiftList);
  $('amGiftQ').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const f = $('amGiftList').querySelector('[data-pick]'); if (f) pickGift(Number(f.dataset.pick)); } });
  $('amGift').addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) { closeGift(); return; }
    const p = e.target.closest('[data-pick]'); if (p) { pickGift(Number(p.dataset.pick)); return; }
    if (e.target.closest('[data-unpick]')) { gift.id = null; $('amGiftPick').hidden = true; $('amGiftQ').parentElement.hidden = false; renderGiftList(); $('amGiftQ').focus(); return; }
    wireDur($('amGiftForm'), e.target);
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
      await reload();
      openDrawer(id, 'overview');
    } catch (err) { say(msg, err.message, 'err'); } finally { btn.disabled = false; }
  });

  // Redessin au redimensionnement (largeur réelle du graphique, position du soulignement).
  let rz;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (S.view === 'overview') renderChart(); placeIndicator(); }, 150); });
  // « En ligne » se met à jour toutes les minutes sans recharger.
  setInterval(() => { if (!document.hidden) renderLive(); }, 60000);

  // ------------------------------------------------------------ Démarrage
  document.querySelectorAll('#amPeriod [data-days]').forEach((b) => b.classList.toggle('is-active', Number(b.dataset.days) === S.days));
  if (!A.isAdmin()) { document.querySelector('.am').innerHTML = '<div class="am-error" style="padding:40px 0">Cette page est réservée aux administrateurs.</div>'; return; }
  setView(S.view, { keepScroll: true });
  reload().catch((err) => { $('amRows').innerHTML = `<div class="am-error">Impossible de charger les membres : ${esc(err.message)}</div>`; $('amKpis').innerHTML = `<div class="am-error">Impossible de charger : ${esc(err.message)}</div>`; });
})();
