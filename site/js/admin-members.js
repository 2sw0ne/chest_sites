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
    { key: 'admin', name: 'Admin', group: 'team', rights: 'Tout CHEST et la gestion des membres.', c1: 'var(--a1, #fc1283)', c2: 'var(--a2, #f9a45e)', g: 'M6.5 15.5 5.6 9l3.6 2.6L12 7l2.8 4.6L18.4 9l-.9 6.5zM7 17.5h10' },
    { key: 'manager', name: 'Manageur', group: 'team', rights: 'Mêmes pouvoirs que l’admin, accès illimité, sans CHEST HQ.', c1: '#ffd23f', c2: '#ff8a1f', g: 'M12 5.5l5.5 2v4c0 3.2-2.3 5.6-5.5 6.8-3.2-1.2-5.5-3.6-5.5-6.8v-4zM9.6 12l1.7 1.7 3.3-3.4' },
    { key: 'educator', name: 'Éducateur', group: 'team', rights: 'Accès complet sans abonnement. Publiera bientôt dans School.', c1: '#b79bff', c2: '#6b4dff', g: 'M4 10.5 12 7l8 3.5-8 3.5zM7.5 12v3.2c0 1 2 2.3 4.5 2.3s4.5-1.3 4.5-2.3V12' },
    { key: 'privilege', name: 'Privilège', group: 'access', rights: 'Tout CHEST, offert par toi, avec ou sans date de fin.', c1: '#9dbcff', c2: '#3f7bff', g: 'M12 6.2l1.5 4.3 4.3 1.5-4.3 1.5L12 17.8l-1.5-4.3L6.2 12l4.3-1.5z' },
    { key: 'allstar', name: 'Allstar', group: 'access', rights: 'Tout CHEST et l’automatisation complète. Bientôt disponible.', c1: '#ffe39a', c2: '#d99a1e', g: 'M12 6.3l1.7 3.6 3.9.5-2.9 2.7.7 3.9L12 15.1 8.6 17l.7-3.9-2.9-2.7 3.9-.5z' },
    // Offres v2 (2026-10-28) : un rang par niveau (I = 3 mois, II = 6 mois, III = 1 an). Logo d'origine de la famille
    // (diamant Premium, coche Essentiel), couleur plus vive à mesure que le rang monte, chiffre romain dans le coin
    // (couleurs : js/rank-badge.js). « premium » / « essentiel » sans niveau = anciens abonnements (masqués si vides).
    { key: 'premium3', name: 'Premium III', roman: 'III', group: 'access', rights: '1 an de CHEST complet : School, BERICH, connexion BERICH clé en main, suivi.', c1: '#ffb36b', c2: '#ff3d1f', g: 'M8.6 7.5h6.8l2.6 3.4-6 6.6-6-6.6zM6 10.9h12M10.3 7.5 12 17.5l1.7-10' },
    { key: 'premium2', name: 'Premium II', roman: 'II', group: 'access', rights: '6 mois de CHEST complet : School, BERICH et suivi.', c1: '#e9a57d', c2: '#cc5a41', g: 'M8.6 7.5h6.8l2.6 3.4-6 6.6-6-6.6zM6 10.9h12M10.3 7.5 12 17.5l1.7-10' },
    { key: 'premium1', name: 'Premium I', roman: 'I', group: 'access', rights: '3 mois de CHEST complet : School, BERICH et suivi.', c1: '#c3a594', c2: '#8f5f50', g: 'M8.6 7.5h6.8l2.6 3.4-6 6.6-6-6.6zM6 10.9h12M10.3 7.5 12 17.5l1.7-10' },
    { key: 'premium', name: 'Premium', legacy: true, group: 'access', rights: 'Ancien abonnement Premium (mensuel ou annuel).', c1: '#ffab6b', c2: '#ff4f3a', g: 'M8.6 7.5h6.8l2.6 3.4-6 6.6-6-6.6zM6 10.9h12M10.3 7.5 12 17.5l1.7-10' },
    { key: 'essentiel3', name: 'Essentiel III', roman: 'III', group: 'access', rights: '1 an sur toute la plateforme, sauf School et BERICH.', c1: '#5cffc4', c2: '#00b377', g: 'M7.8 12.4l2.8 2.8 5.6-6' },
    { key: 'essentiel2', name: 'Essentiel II', roman: 'II', group: 'access', rights: '6 mois sur toute la plateforme, sauf School et BERICH.', c1: '#80d7b7', c2: '#2b9372', g: 'M7.8 12.4l2.8 2.8 5.6-6' },
    { key: 'essentiel1', name: 'Essentiel I', roman: 'I', group: 'access', rights: '3 mois sur toute la plateforme, sauf School et BERICH.', c1: '#a3c4b8', c2: '#557f70', g: 'M7.8 12.4l2.8 2.8 5.6-6' },
    { key: 'essentiel', name: 'Essentiel', legacy: true, group: 'access', rights: 'Ancien abonnement Essentiel (mensuel ou annuel).', c1: '#5ff0bd', c2: '#13a274', g: 'M7.8 12.4l2.8 2.8 5.6-6' },
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
    { key: 'subs', label: 'Abonnés', test: (m) => ['allstar', 'premium', 'essentiel'].includes(base(cat(m))) },
    { key: 'trial', label: 'Essai', test: (m) => cat(m) === 'trial' },
    { key: 'expired', label: 'Anciens', test: (m) => cat(m) === 'expired' },
    { key: 'none', label: 'Sans accès', test: (m) => cat(m) === 'none' },
    { key: 'blocked', label: 'Bloqués', test: (m) => m.status === 'blocked', hideEmpty: true },
    // Admin 2.0 : accès payé ou offert qui se termine dans 7 jours (hors essai et équipe).
    { key: 'soon', label: 'Expirent bientôt', test: (m) => soonLeft(m) != null },
  ];
  // Filtres affichés en pilule (maquette Admin 2.0) ; les autres restent accessibles depuis la Vue d'ensemble.
  const SEG = ['all', 'trial', 'soon', 'blocked'];
  function soonLeft(m) {
    const a = m.access || {};
    if (!a.active || !a.endsAt || ['admin', 'manager', 'educator', 'trial'].includes(cat(m))) return null;
    const l = daysUntil(a.endsAt);
    return l != null && l >= 0 && l <= 7 ? l : null;
  }

  function badge(key, size) {
    const t = TIER[key] || TIER.none;
    const svg = CHESTRank.hex(t.c1, t.c2, t.g, size, 'am-badge');
    return CHESTRank.corner(svg, t.roman, size, t.c1);
  }
  const base = (c) => String(c || '').replace(/[123]$/, '');
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
  // Premium / Essentiel avec niveau → rang « premium3 », « essentiel1 »… (base(c) redonne la famille).
  function cat(m) {
    const a = m.access || {};
    const withLevel = (c) => (['premium', 'essentiel'].includes(c) && [1, 2, 3].includes(a.level) ? c + a.level : c);
    if (m.category) return withLevel(m.category);
    if (m.isAdmin) return m.role === 'manager' ? 'manager' : 'admin';
    if (m.role === 'educator') return 'educator';
    if (a.active) return a.plan === 'offert' ? 'privilege' : withLevel(a.plan);
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
    const per = a.level ? '' : a.period === 'year' ? 'annuel' : a.period === 'month' ? 'mensuel' : '';
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
  { const v = read('chest_admin_view'); if (['overview', 'members', 'ranks', 'engagement', 'sales', 'educators', 'system', 'storage'].includes(v)) S.view = v; }
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
      return `<rect x="${(i * bw + bw * .2).toFixed(2)}" y="${(H - bh).toFixed(2)}" width="${(bw * .6).toFixed(2)}" height="${bh.toFixed(2)}" rx="1.5" fill="${v ? color : 'rgba(var(--fg-rgb, 255, 255, 255),.1)'}" ${v ? `opacity="${(.4 + .6 * v / max).toFixed(2)}"` : ''}/>`;
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
      if (['essentiel', 'premium', 'allstar'].includes(base(c))) per[c] = (per[c] || 0) + 1;
    });
    const tot = Object.values(per).reduce((a, b) => a + b, 0);
    const mix = TIERS.map((t) => t.key).filter((k) => per[k]);
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
        <div class="am-kpi__spark">${sparkArea(cumul(series('revenue')), 'var(--green, #33e6a6)')}</div>
      </div>
      <div class="am-kpi">
        <div class="am-kpi__k">Nouveaux membres ${delta(s.signups, s.signupsPrev)}</div>
        <div class="am-kpi__v"><b>${nf(s.signups)}</b></div>
        <div class="am-kpi__n">${periodWord()} · ${nf(s.signupsPrev)} avant</div>
        <div class="am-kpi__spark">${sparkBars(series('signups'), 'var(--a1, #fc1283)')}</div>
      </div>
      <div class="am-kpi">
        <div class="am-kpi__k">Actifs cette semaine</div>
        <div class="am-kpi__v"><b>${nf(s.active7)}</b></div>
        <div class="am-kpi__n">${nf(s.active1)} aujourd’hui · ${nf(s.active30)} sur 30 jours</div>
        <div class="am-kpi__spark">${sparkArea(series('users'), 'var(--a2, #f9a45e)')}</div>
      </div>`;
  }

  const METRICS = {
    revenue: { label: 'Encaissé', type: 'area', color: 'var(--green, #33e6a6)', cum: true, fmt: eur, axis: eurShort,
      head: (s) => ({ v: eur(s.collected), d: delta(s.collected, s.collectedPrev), sub: periodWord() }) },
    signups: { label: 'Nouveaux membres', type: 'bars', color: 'var(--a1, #fc1283)', fmt: nf, axis: nf,
      head: (s) => ({ v: nf(s.signups), d: delta(s.signups, s.signupsPrev), sub: periodWord() }) },
    users: { label: 'Membres actifs par jour', type: 'area', color: 'var(--a2, #f9a45e)', fmt: nf, axis: nf, max: true,
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
    { key: 'pastDue', c: 'var(--red, #ff4d5e)', ic: 'card', t: 'Paiements en retard', sub: 'le prélèvement a échoué', test: (m) => (m.access || {}).status === 'past_due' && (m.access || {}).active },
    { key: 'canceling', c: 'var(--a2, #f9a45e)', ic: 'door', t: 'Résiliations programmées', sub: 'accès gardé jusqu’à l’échéance', test: (m) => (m.access || {}).status === 'canceling' && (m.access || {}).active },
    { key: 'privEnd', c: '#9dbcff', ic: 'gift', t: 'Privilèges qui expirent', sub: 'dans 14 jours ou moins', test: (m) => cat(m) === 'privilege' && (daysUntil(m.access.endsAt) ?? 99) <= 14 },
    { key: 'nudge', c: 'var(--a1, #fc1283)', ic: 'bell', t: 'À relancer', sub: 'accès actif, aucune visite depuis 7 jours', test: (m) => !isTeam(m) && (m.access || {}).active && seenOf(m) && seenOf(m) < Date.now() - 7 * DAY },
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
    if (q) list = list.filter((m) => norm(`${m.firstName} ${m.lastName} ${m.email} ${m.lastName} ${m.firstName} ${(m.educator || {}).name || ''} ${(m.educator || {}).code || ''}`).includes(q));
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
    const count = (k) => S.members.filter((CHIPS.find((c) => c.key === k) || CHIPS[0]).test).length;
    $('amChips').innerHTML = SEG.map((k) => `<button type="button" data-chip="${k}" aria-pressed="${S.chip === k}">${CHIPS.find((c) => c.key === k).label}</button>`).join('');
    $('amTotal').textContent = nf(S.members.length);
    const COUNTS = [['trial', 'En essai', 'amber'], ['subs', 'Actifs', 'green'], ['soon', 'Expirent < 7 j', ''], ['blocked', 'Bloqués', 'red']];
    $('amCounts').innerHTML = COUNTS.map(([k, l, tone]) => `<button type="button" class="am2-cnt${tone ? ' is-' + tone : ''}" data-chip="${k}" aria-pressed="${S.chip === k}"><span class="am2-mono">${l}</span><b>${nf(count(k))}</b></button>`).join('');
    // Filtre venu d'ailleurs (rang, catégorie hors pilules) : rappelé ici avec sa croix.
    const extra = !SEG.includes(S.chip) ? CHIPS.find((x) => x.key === S.chip) : null;
    const f = $('amFilter');
    if (S.filter || extra) {
      const lab = S.filter ? S.filter.label : extra.label;
      f.hidden = false;
      f.innerHTML = `<span>Filtre</span><button type="button" class="am-chip ${S.filter && S.filter.tier ? '' : 'am-chip--plain'}" style="${S.filter ? S.filter.style : ''}" data-clear-filter aria-label="Retirer le filtre ${esc(lab)}">${S.filter && S.filter.tier ? badge(S.filter.tier, 16) : ''}${esc(lab)}${CROSS}</button>`;
    } else { f.hidden = true; f.innerHTML = ''; }
  }
  // État court d'un membre (pastille de la liste).
  function stateOf(m) {
    const c = cat(m), a = m.access || {}, left = daysUntil(a.endsAt);
    if (m.status === 'blocked') return ['Bloqué', 'red'];
    if (isTeam(m)) return [TIER[c].name, 'violet'];
    if (c === 'privilege') return ['Privilège', 'blue'];
    if (c === 'trial') return [left != null ? `Essai · ${Math.max(0, left)} j` : 'Essai', 'amber'];
    if (c === 'expired') return ['Terminé', 'grey'];
    if (c === 'none') return ['Sans accès', 'grey'];
    if (a.status === 'past_due') return ['Paiement en retard', 'red'];
    if (soonLeft(m) != null) return [`Expire dans ${soonLeft(m)} j`, 'amber'];
    return ['Actif', 'green'];
  }
  const rankName = (m) => (cat(m) === 'privilege' ? 'Offert' : (TIER[cat(m)] || TIER.none).name);
  const DOTS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M5 12h.01M12 12h.01M19 12h.01"/></svg>';
  function rowHtml(m) {
    const t = TIER[cat(m)] || TIER.none;
    const [st, tone] = stateOf(m);
    const isMe = me().id === m.id;
    // origine (2026-11-04) : « via Pierre » si le membre est arrivé par le lien d'un éducateur, sinon « Direct »
    const edu = m.educator ? `<span class="am2-origin" title="Arrivé par ${esc(m.educator.name)}${m.educator.code ? ` (code ${esc(m.educator.code)})` : ''}">via ${esc(m.educator.name.split(' ')[0])}</span>` : '<span class="am2-origin is-direct" title="Inscrit sans code de référent">Direct</span>';
    return `<div class="am2-row am-row${S.sel === m.id ? ' is-sel' : ''}" role="listitem" tabindex="0" data-id="${m.id}" aria-current="${S.sel === m.id}">
      <span class="am2-av" style="--c1:${t.c1};--c2:${t.c2}">${esc(initials(m)[0])}</span>
      <span class="am2-who"><b>${esc(fullName(m))}${isMe ? '<span class="am-tag">toi</span>' : ''}</b><small>${esc(m.email)}</small></span>
      <span class="am2-rank">${esc(rankName(m))}</span>
      <span class="am2-edu">${edu}</span>
      <span class="am2-st"><span class="am2-pill is-${tone}">${esc(st)}</span></span>
      <button type="button" class="am2-more" data-full="${m.id}" aria-label="Fiche complète de ${esc(fullName(m))}" title="Fiche complète">${DOTS}</button>
    </div>`;
  }
  function renderRows() {
    const list = filtered();
    S.list = list.map((m) => m.id);
    const zone = $('amRows');
    if (!list.length) {
      zone.innerHTML = `<div class="am-empty">${S.q ? `Personne ne correspond à « ${esc(S.q)} ».` : 'Aucun membre ici pour l’instant.'}</div>`;
      renderSheet();
      return;
    }
    if (!S.list.includes(S.sel)) S.sel = (list.find((m) => m.id !== me().id) || list[0]).id; // fiche : un autre membre que soi par défaut
    const shown = list.slice(0, S.limit);
    zone.innerHTML = shown.map(rowHtml).join('') + (list.length > shown.length ? `<div class="am-more"><button type="button" class="chest-btn-2" data-more>Afficher ${Math.min(50, list.length - shown.length)} de plus · ${list.length - shown.length} restants</button></div>` : '');
    renderSheet();
  }
  function selectMember(id, focusSheet) {
    S.sel = id;
    document.querySelectorAll('.am2-row').forEach((r) => { const on = Number(r.dataset.id) === id; r.classList.toggle('is-sel', on); r.setAttribute('aria-current', String(on)); });
    renderSheet();
    if (focusSheet && matchMedia('(max-width: 900px)').matches) $('amSheet').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }
  // Fiche latérale (maquette Admin 2.0) : l'essentiel du membre + actions rapides.
  // Le volet complet (rôle, activité, historique) s'ouvre par « Fiche complète » ou le bouton ⋯.
  function berichLine(m) {
    const br = m.berich || {}, c = cat(m);
    if (br.request === 'pending') return ['Clé en main à connecter', 'is-warn'];
    if (br.plan && !br.attached) return ['Plan à rattacher', 'is-warn'];
    if (br.attached) return ['Plan rattaché', 'is-ok'];
    const hasBerich = ['admin', 'manager', 'educator', 'privilege', 'allstar'].includes(c) || base(c) === 'premium';
    return hasBerich ? ['Pas encore de plan', ''] : ['Non inclus', 'is-mute'];
  }
  function renderSheet() {
    const box = $('amSheet');
    const m = S.members.find((x) => x.id === S.sel);
    if (!m) { box.innerHTML = '<p class="am-muted">Choisis un membre dans la liste.</p>'; return; }
    const c = cat(m), t = TIER[c] || TIER.none, a = m.access || {}, isMe = me().id === m.id, team = isTeam(m);
    const [br, brCls] = berichLine(m);
    const pay = (m.billing || []).find((b) => /paid|completed|succeeded/.test(b.type) && b.amount);
    const paid = pay ? `${eurCents(pay.amount)} · ${dt(pay.at)}` : m.amount ? `${eurCents(m.amount)} · ${dt(a.startedAt)}` : '—';
    const rows = [
      ['Rang', team ? t.name : c === 'privilege' ? 'Privilège' : `CHEST ${t.name}`, '', `color:${t.c1}`],
      ['Éducateur', m.educator ? `${m.educator.name}${m.educator.code ? ` (code ${m.educator.code})` : ''}` : '—', '', ''],
      ['Payé', paid, '', ''],
      ['BERICH', br, brCls, ''],
      ['Dernière connexion', isOnline(m) ? 'en ligne' : ago(m.lastLoginAt || m.lastSeenAt), isOnline(m) ? 'is-ok' : '', ''],
      ['Alertes', m.alerts ? `${m.alerts} sur 30 jours` : 'aucune', m.alerts ? 'is-bad' : 'is-ok', ''],
    ];
    const endIso = a.endsAt ? isoDay(new Date(ms(a.endsAt))) : '';
    const lockAccess = isMe || team;
    box.innerHTML = `<div class="am2-sheet__head">
        <span class="am2-av am2-av--lg" style="--c1:${t.c1};--c2:${t.c2}">${esc(initials(m)[0])}</span>
        <span><b>${esc(fullName(m))}</b><small>${esc(m.email)} · inscription le ${esc(dt(m.createdAt))}</small></span>
      </div>
      <dl class="am2-facts">${rows.map(([l, v, cls, st]) => `<div><dt>${l}</dt><dd class="${cls}" style="${st}">${esc(v)}</dd></div>`).join('')}</dl>
      <form class="am2-access" data-sheet-access>
        <label class="am2-mono" for="amSheetEnd">Accès jusqu’au</label>
        <div class="am2-access__row">
          <input type="date" id="amSheetEnd" value="${endIso}" min="${isoDay(new Date(Date.now() + DAY))}" ${lockAccess ? 'disabled' : ''} aria-describedby="amSheetMsg">
          <button type="submit" class="am2-btn" ${lockAccess ? 'disabled' : ''}>Enregistrer</button>
        </div>
        <p class="am-msg" id="amSheetMsg" role="status">${isMe ? 'C’est ton compte.' : team ? 'Son rôle lui donne déjà tout l’accès.' : ''}</p>
      </form>
      ${storeBlock(m)}
      <div class="am2-sheet__acts">
        <button type="button" class="am2-btn2" data-sheet-rank ${isMe ? 'disabled' : ''}>Changer le rang</button>
        <button type="button" class="am2-btn2" data-sheet-reset ${isMe ? 'disabled' : ''}>Réinitialiser le mot de passe</button>
        ${m.status === 'blocked' ? `<button type="button" class="am2-btn2" data-sheet-block="0" ${isMe ? 'disabled' : ''}>Débloquer</button>` : `<button type="button" class="am2-danger" data-sheet-block="1" ${isMe ? 'disabled' : ''}>Bloquer</button>`}
        <button type="button" class="am2-link" data-full="${m.id}">Fiche complète</button>
      </div>`;
  }
  // ------------------------------------------------------------ Stockage (2026-11-04)
  // Référence = capacité maximale : ce que coûterait le bucket si chaque compte remplissait tout son espace.
  // Comptés : l'équipe et les membres avec un accès en cours (les autres ne peuvent rien envoyer).
  let storeSrv = null;
  const STORE_TIERS = [['admin', 'Admin'], ['manager', 'Manageur'], ['educator', 'Éducateur'], ['premium', 'Premium'], ['essentiel', 'Essentiel']];
  const usd = (n) => n > 0 && n < 0.01 ? '< 0,01 $' : `${n.toFixed(2).replace('.', ',')} $`;
  const goTxt = (b) => { const f = (n, d) => { let t = n.toFixed(d); if (t.includes('.')) t = t.replace(/0+$/, '').replace(/\.$/, ''); return t.replace('.', ','); }; if (!b) return '0 Mo'; if (b < 1024 ** 2) return `${Math.max(1, Math.round(b / 1024))} Ko`; if (b < 1024 ** 3) return `${f(b / 1024 ** 2, b < 10 * 1024 ** 2 ? 1 : 0)} Mo`; return `${f(b / 1024 ** 3, 2)} Go`; };
  async function renderStorage(force) {
    const box = $('amStore');
    if (!storeSrv || force === true) {
      if (!storeSrv) box.innerHTML = '<p class="am-empty">Chargement…</p>';
      try { const r = await fetch(A.apiBase() + '/admin/storage', { headers: { Authorization: 'Bearer ' + A.getToken() } }); storeSrv = r.ok ? await r.json() : {}; } catch (e) { storeSrv = {}; }
      if (S.view !== 'storage') return;
    }
    const GB = 1024 ** 3, price = storeSrv.pricePerGb || 0.015;
    const pool = S.members.filter((m) => m.storage && m.status !== 'blocked' && (isTeam(m) || (m.access || {}).active));
    const left = S.members.length - pool.length;
    const cap = pool.reduce((t, m) => t + m.storage.quota, 0);
    const tracked = S.members.reduce((t, m) => t + ((m.storage || {}).used || 0), 0);
    const filesTracked = S.members.reduce((t, m) => t + ((m.storage || {}).files || 0), 0), dataAll = tracked - filesTracked;
    const total = (storeSrv.total != null ? Math.max(storeSrv.total, filesTracked) : filesTracked) + dataAll; // fichiers (bucket) + données synchronisées
    const fill = cap ? Math.min(100, (total / cap) * 100) : 0;
    const tiers = STORE_TIERS.map(([k, l]) => {
      const ms = pool.filter((m) => m.storage.tier === k);
      const c = ms.reduce((t, m) => t + m.storage.quota, 0);
      return { k, l, n: ms.length, def: ((storeSrv.quotasMb || {})[k] ?? null), cap: c, used: ms.reduce((t, m) => t + m.storage.used, 0), custom: ms.filter((m) => m.storage.custom).length };
    });
    const rows = pool.slice().sort((a, b) => b.storage.quota - a.storage.quota || b.storage.used - a.storage.used);
    box.innerHTML = `<div class="am-st">
      <div class="am-st__hero">
        <article class="am-st__ref">
          <span class="am-sub">Coût à capacité maximale</span>
          <b>${usd((cap / GB) * price)}<small>/ mois</small></b>
          <p>Si chaque compte remplissait tout son espace : ${goTxt(cap)} au total · ${usd((cap / GB) * price * 12)} par an.</p>
        </article>
        <div class="am-st__side">
          <div class="am-fact"><span>Coût réel aujourd’hui</span><b>${usd((total / GB) * price)} <small>/ mois</small></b></div>
          <div class="am-fact"><span>Stocké aujourd’hui</span><b>${goTxt(total)} <small>sur ${goTxt(cap)}</small></b></div>
          <div class="am-st__fill" role="progressbar" aria-label="Capacité utilisée" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(fill)}"><i style="--p:${total ? Math.max(fill / 100, .006) : 0}"></i><span>${fill < 1 && total ? '< 1' : Math.round(fill)} % de la capacité maximale</span></div>
        </div>
      </div>
      <article class="am-panel am-st__panel">
        <header class="am-panel__head"><h2 class="am-panel__t">Par rang</h2><span class="am-panel__meta">${String(price).replace('.', ',')} $ par Go et par mois · lecture gratuite</span></header>
        <div class="am-st__tiers" role="table" aria-label="Capacité par rang">
          <div class="am-st__th" role="row"><span role="columnheader">Rang</span><span role="columnheader">Comptes</span><span role="columnheader">Espace chacun</span><span role="columnheader">Capacité max</span><span role="columnheader">Coût max / mois</span><span role="columnheader">Utilisé</span></div>
          ${tiers.map((t) => `<div class="am-st__tr${t.n ? '' : ' is-zero'}" role="row"><span role="cell"><b>${t.l}</b></span><span role="cell">${t.n}</span><span role="cell">${t.def == null ? '—' : goTxt(t.def * 1024 ** 2)}${t.custom ? ` <em>· ${t.custom} réglé${t.custom > 1 ? 's' : ''} à la main</em>` : ''}</span><span role="cell">${goTxt(t.cap)}</span><span role="cell"><b>${usd((t.cap / GB) * price)}</b></span><span role="cell">${goTxt(t.used)}</span></div>`).join('')}
          <div class="am-st__tr is-total" role="row"><span role="cell"><b>Total</b></span><span role="cell">${pool.length}</span><span role="cell"></span><span role="cell">${goTxt(cap)}</span><span role="cell"><b>${usd((cap / GB) * price)}</b></span><span role="cell">${goTxt(tracked)}</span></div>
        </div>
        ${storeSrv.untracked ? `<p class="am-note">${goTxt(storeSrv.untracked)} de fichiers envoyés avant le 4 novembre n’ont pas d’auteur connu (surtout le contenu School) : ils comptent dans le coût réel, pas dans l’espace d’un membre.</p>` : ''}
        ${left ? `<p class="am-note">${left} compte${left > 1 ? 's' : ''} sans accès en cours ou bloqué${left > 1 ? 's' : ''} : pas comptés, ils ne peuvent rien envoyer.</p>` : ''}
      </article>
      <article class="am-panel am-st__panel">
        <header class="am-panel__head"><h2 class="am-panel__t">Chaque compte</h2><span class="am-panel__meta">clique un compte pour changer son espace</span></header>
        <div class="am-st__list">${rows.map((m) => { const st = m.storage, pc = st.quota ? Math.min(100, st.used / st.quota * 100) : 0; return `<button type="button" class="am-st__row${pc >= 90 ? ' is-full' : ''}" data-st-open="${m.id}">
            <span class="am-st__who"><b>${esc(fullName(m))}</b><small>${esc((STORE_TIERS.find(([k]) => k === st.tier) || [])[1] || '')}${st.custom ? ' · espace choisi' : ''}${st.used ? ` · données ${goTxt(st.data || 0)} · fichiers ${goTxt(st.files || 0)}` : ''}</small></span>
            <span class="am-st__bar"><i style="--p:${st.quota ? Math.max(pc / 100, st.used ? .01 : 0) : 0}"></i></span>
            <span class="am-st__num">${st.quota ? `${goTxt(st.used)} / ${goTxt(st.quota)}` : 'aucun espace'}</span>
            <span class="am-st__num"><b>${usd((st.quota / GB) * price)}</b></span>
          </button>`; }).join('') || '<p class="am-empty">Aucun compte pour l’instant.</p>'}</div>
      </article>
    </div>`;
  }
  $('amStore').addEventListener('click', (e) => { const b = e.target.closest('[data-st-open]'); if (b) openDrawer(Number(b.dataset.stOpen), 'access'); });

  // Stockage (2026-11-04) : jauge + espace choisi par l'admin (vide = celui de son offre).
  const gbTxt = (b) => goTxt(b);
  function storeBlock(m, inDrawer) {
    const st = m.storage; if (!st) return '';
    const pct = st.quota ? Math.min(100, (st.used / st.quota) * 100) : 0;
    const cur = String(Math.round((st.quota / 1024 ** 3) * 10) / 10).replace('.', ',');
    const hint = st.custom ? 'par défaut de son offre' : `offre : ${cur} Go`;
    return `<form class="am2-access am2-store${pct >= 90 ? ' is-full' : ''}" data-sheet-store>
        <span class="am2-store__top"><span class="am2-mono">${inDrawer ? 'Utilisé' : 'Stockage'}</span><b>${st.quota ? `${gbTxt(st.used)} sur ${gbTxt(st.quota)}` : 'aucun espace'}${st.custom ? ' · choisi' : ''}</b></span>
        <span class="am2-store__bar" role="progressbar" aria-label="Stockage utilisé" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><i style="--p:${st.quota ? Math.max(pct / 100, st.used ? .01 : 0) : 0}"></i></span>
        <div class="am2-access__row">
          <input type="text" inputmode="decimal" data-store-gb value="${st.custom ? cur : ''}" placeholder="${esc(hint)}" aria-label="Espace en Go (vide = celui de son offre)">
          <button type="submit" class="am2-btn">Enregistrer</button>
        </div>
        <p class="am-msg" data-store-msg role="status">Données ${goTxt(st.data || 0)} (backtests, journal, comptes) · fichiers ${goTxt(st.files || 0)}. En Go, vide = l’espace de son offre.</p>
      </form>`;
  }
  function renderMembers() { renderChips(); renderRows(); }

  // ------------------------------------------------------------ Rangs
  function renderRanks() {
    const c = counts(), total = S.members.length || 1;
    const present = TIERS.filter((t) => c[t.key]);
    $('amSpectrum').innerHTML = `<div class="am-spectrum__bar">${present.map((t, i) => `<button type="button" data-tier="${t.key}" style="${tierStyle(t.key)};--f:${c[t.key]};animation-delay:${i * 50}ms" title="${t.name} : ${c[t.key]}" aria-label="${t.name} : ${c[t.key]} membres">${c[t.key] / total >= .06 ? `<span>${c[t.key]}</span>` : ''}</button>`).join('')}</div>
      <div class="am-spectrum__legend"><span>Sommet de la hiérarchie</span><span>${plural(S.members.length, 'membre', 'membres')}</span><span>Base</span></div>`;
    const bySeen = (a, b) => (seenOf(b) || 0) - (seenOf(a) || 0);
    // Rangs 3 par 3 (2026-11-08) : Équipe, Premium III→I, Essentiel III→I, puis Inactif · Privilège · Essai ;
    // « Inactif » réunit les accès terminés et les inscrits sans offre. Anciens formats seulement s'ils ont des membres.
    const INACTIVE = { key: 'inactive', name: 'Inactif', rights: 'Accès terminé (abonnement, Privilège ou essai) ou inscrit sans offre.', of: ['expired', 'none'], look: 'expired' };
    const ROWS = [
      ['Équipe', 'Ceux qui font CHEST.', ['admin', 'manager', 'educator']],
      ['Premium', 'CHEST complet : School, BERICH, scanners. De la plus longue durée à la plus courte.', ['premium3', 'premium2', 'premium1']],
      ['Essentiel', 'Toute la plateforme, hors School et BERICH.', ['essentiel3', 'essentiel2', 'essentiel1']],
      ['Autres', 'Accès terminés, offerts ou à l’essai.', ['inactive', 'privilege', 'trial']],
    ];
    const legacy = ['allstar', 'premium', 'essentiel'].filter((k) => c[k]);
    if (legacy.length) ROWS.push(['Anciens formats', 'Abonnements d’avant les offres actuelles.', legacy]);
    const card = (key) => {
      const t = key === 'inactive' ? INACTIVE : TIER[key];
      const look = t.look || key;
      const people = S.members.filter((m) => (t.of || [key]).includes(cat(m))).sort(bySeen);
      const k = people.length;
      return `<article class="am-rank${k ? '' : ' is-zero'}" style="${tierStyle(look)}">
            <div class="am-rank__top">${badge(look, 46)}<div class="am-rank__name"><b>${t.name}</b><small>${pct(k, total)} % des membres</small></div><span class="am-rank__n">${k}</span></div>
            <p class="am-rank__rights">${t.rights}</p>
            <div class="am-faces">${people.slice(0, 6).map((m) => `<span class="am-av am-av--sm" style="${tierStyle(look)}" title="${esc(fullName(m))}">${esc(initials(m))}</span>`).join('')}${k > 6 ? `<em>+${k - 6}</em>` : k ? '' : '<em>Personne pour l’instant</em>'}</div>
            <div class="am-rank__foot">${k ? `<button type="button" class="am-rank__go" data-tier="${(t.of || [key])[0]}">Voir les membres</button>` : '<span></span>'}${key === 'privilege' ? '<button type="button" class="am-rank__gift" data-gift>＋ Offrir</button>' : ''}</div>
          </article>`;
    };
    $('amRanks').innerHTML = ROWS.map(([name, desc, keys]) => {
      const n = keys.reduce((a, k) => a + (k === 'inactive' ? (c.expired || 0) + (c.none || 0) : (c[k] || 0)), 0);
      return `<section class="am-group" aria-label="${name}">
        <div class="am-group__h"><h2>${name}</h2><span>${desc}</span><em>${plural(n, 'membre', 'membres')}</em></div>
        <div class="am-group__grid am-group__grid--3">${keys.map(card).join('')}</div>
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
  // ---------------- Système : mode Éco / Arrêt et pages en maintenance (GET/PUT /ops) ----------------
  const OPS_MODES = [
    ['normal', 'Normal', 'Tout tourne : calendrier toutes les 2 h et après chaque annonce, alarmes des scanners, Force du marché.'],
    ['eco', 'Éco', 'Calendrier mis à jour une fois par jour, sans relecture après les annonces. Le reste ne change pas.'],
    ['off', 'Arrêt', 'Plus aucune tâche de fond : calendrier, alarmes des scanners et Force du marché s’arrêtent.'],
  ];
  const OPS_PAGES = [['dashboard', 'Dashboard'], ['backtesting', 'Backtesting'], ['journal', 'Journal'], ['strategies', 'Stratégies'], ['calendar', 'Calendrier'], ['berich', 'BERICH'], ['school', 'School'], ['account', 'Compte']];
  const OPS_ALL = OPS_PAGES.map(([k]) => k);
  let opsSaved = null, opsDraft = null;
  const opsJson = (o) => JSON.stringify({ mode: o.mode, maintenance: [...o.maintenance].sort(), message: (o.message || '').trim() });
  async function loadOps() {
    const res = await fetch(A.apiBase() + '/ops', { cache: 'no-store' });
    const d = await res.json();
    opsSaved = { mode: d.mode || 'normal', maintenance: d.maintenance || [], message: d.message || '', updatedAt: d.updatedAt };
    opsDraft = JSON.parse(JSON.stringify(opsSaved));
    opsBadge();
  }
  function opsBadge() { $('amOpsBadge').textContent = opsSaved && opsSaved.mode !== 'normal' ? (opsSaved.mode === 'eco' ? 'Éco' : 'Arrêt') : ''; }
  async function renderSystem() {
    if (!opsDraft) {
      $('amOpsMode').innerHTML = '<p class="am-empty">Chargement…</p>';
      try { await loadOps(); } catch (e) { $('amOpsMode').innerHTML = '<p class="am-empty">Réglage illisible pour le moment, réessaie.</p>'; return; }
    }
    $('amOpsMeta').textContent = opsSaved.updatedAt ? 'modifié ' + ago(opsSaved.updatedAt) : 'jamais modifié';
    $('amOpsMode').innerHTML = OPS_MODES.map(([k, l, s]) => `<button type="button" data-ops-mode="${k}" aria-pressed="${opsDraft.mode === k}"><b><i class="am-sys__dot am-sys__dot--${k}" aria-hidden="true"></i>${l}</b><small>${esc(s)}</small></button>`).join('');
    $('amOpsPages').innerHTML = OPS_PAGES.map(([k, l]) => {
      const on = opsDraft.maintenance.includes(k);
      return `<li><span>${esc(l)}</span><label class="am-sw"><input type="checkbox" data-ops-page="${k}" ${on ? 'checked' : ''}><span aria-hidden="true"></span><em>${on ? 'Maintenance' : 'En service'}</em></label></li>`;
    }).join('');
    if (document.activeElement !== $('amOpsMsg')) $('amOpsMsg').value = opsDraft.message || '';
    const dirty = opsJson(opsDraft) !== opsJson(opsSaved);
    $('amOpsSave').disabled = !dirty;
    if (dirty) say($('amOpsState'), 'Modifications non enregistrées.', 'warn');
  }
  $('amOpsMode').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ops-mode]'); if (!b) return;
    const was = opsDraft.mode; opsDraft.mode = b.dataset.opsMode;
    // Arrêt : toutes les pages passent en maintenance par défaut (tu peux en rouvrir) ; en le quittant, on les rouvre.
    if (opsDraft.mode === 'off' && was !== 'off' && !opsDraft.maintenance.length) opsDraft.maintenance = OPS_ALL.slice();
    if (was === 'off' && opsDraft.mode !== 'off' && opsDraft.maintenance.length === OPS_ALL.length) opsDraft.maintenance = [];
    renderSystem();
  });
  $('amOpsPages').addEventListener('change', (e) => {
    const k = e.target.dataset.opsPage; if (!k) return;
    opsDraft.maintenance = e.target.checked ? [...new Set([...opsDraft.maintenance, k])] : opsDraft.maintenance.filter((x) => x !== k);
    renderSystem();
  });
  $('amOpsMsg').addEventListener('input', (e) => { opsDraft.message = e.target.value; renderSystem(); });
  $('amOpsSave').addEventListener('click', async () => {
    const btn = $('amOpsSave');
    if (opsDraft.mode === 'off' && !(await CHESTConfirm('Passer en mode Arrêt ? Le calendrier, les alarmes des scanners et la Force du marché s’arrêtent, et les pages cochées affichent la maintenance aux membres.'))) return;
    btn.disabled = true; say($('amOpsState'), 'Enregistrement…');
    try {
      const res = await fetch(A.apiBase() + '/ops', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + A.getToken() }, body: JSON.stringify({ mode: opsDraft.mode, maintenance: opsDraft.maintenance, message: (opsDraft.message || '').trim() }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Enregistrement impossible.');
      opsSaved = { mode: d.mode, maintenance: d.maintenance, message: d.message, updatedAt: d.updatedAt };
      opsDraft = JSON.parse(JSON.stringify(opsSaved));
      opsBadge(); renderSystem();
      say($('amOpsState'), 'Enregistré. Les services appliquent le changement sous 5 minutes.', 'ok');
    } catch (err) { say($('amOpsState'), err.message, 'err'); btn.disabled = false; }
  });

  // ---------------- Éducateurs : taux, lien d'invitation, demandes de retrait ----------------
  const euro = (c, d = 2) => ((c || 0) / 100).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' €';
  const pctOf = (r) => (Math.abs(r - Math.round(r)) < 0.05 ? String(Math.round(r)) : r.toFixed(2).replace('.', ','));
  async function eduApi(path, opts) {
    const res = await fetch(A.apiBase() + path, Object.assign({}, opts, { headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + A.getToken() } }));
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || 'Service indisponible.');
    return d;
  }
  let EDU = null, PAY = null;
  async function loadEdu() {
    [EDU, PAY] = await Promise.all([eduApi('/admin/educators'), eduApi('/admin/payouts')]);
    const pending = PAY.payouts.filter((p) => p.status === 'pending').length;
    $('amEduBadge').textContent = pending ? String(pending) : '';
  }
  async function renderEducators() {
    if (!EDU) {
      $('amEdu').innerHTML = '<p class="am-empty">Chargement…</p>';
      try { await loadEdu(); } catch (e) { $('amEdu').innerHTML = `<p class="am-empty">${esc(e.message)}</p>`; return; }
    }
    const origin = location.origin;
    $('amEdu').innerHTML = EDU.educators.length ? EDU.educators.map((e) => {
      const link = e.invite ? `${origin}/inscription?ref=${e.invite}` : '';
      return `<div class="am-edu" data-edu="${e.id}">
        <div class="am-edu__who"><b>${esc(e.name)}</b><small>${esc(e.email)}</small>${(() => { const sc = e.scanner && window.CHESTScanners && CHESTScanners.list().find((x) => x.id === e.scanner); return `<span class="am-edu__disc${sc ? '' : ' is-none'}">${sc ? `${sc.logo ? `<img src="${esc(sc.logo)}" alt="">` : ''}Discipline : ${esc(sc.name)}` : 'Discipline pas encore choisie'}</span>`; })()}</div>
        <div class="am-edu__link">${link ? `<span class="am-edu__code">${esc(e.invite)}</span><code>${esc(link)}</code><button type="button" class="am-mini" data-edu-copy="${esc(link)}">Copier</button>` : '<span class="am-edu__none">Code pas encore choisi par l’éducateur</span>'}</div>
        <label class="am-edu__rate">Taux<input type="text" inputmode="decimal" value="${pctOf(e.rate)}" data-edu-rate="${e.id}" aria-label="Taux de commission de ${esc(e.name)}"><em>%</em></label>
        <div class="am-edu__stats"><span><b>${e.totals.members}</b> membres</span><span><b>${esc(euro(e.totals.sales, 0))}</b> ventes</span><span><b>${esc(euro(e.wallet.earned))}</b> commissions</span><span><b>${esc(euro(e.wallet.available))}</b> dispo</span></div>
        <a class="am-mini" href="#/educator?educator=${e.id}" target="_top" data-edu-open="${e.id}">Voir son espace</a>
      </div>`;
    }).join('') : '<p class="am-empty">Aucun éducateur pour l’instant. Ouvre la fiche d’un membre, onglet Accès, et choisis le rôle « Éducateur ».</p>';
    const lbl = { pending: 'à traiter', paid: 'versé', refused: 'refusé' };
    const pend = PAY.payouts.filter((p) => p.status === 'pending');
    $('amPayMeta').textContent = pend.length ? `${pend.length} à traiter` : 'rien à traiter';
    $('amPayouts').innerHTML = PAY.payouts.length ? PAY.payouts.slice(0, 40).map((p) => {
      const d = p.details || {};
      const to = p.method === 'iban' ? `IBAN ${esc(d.iban || '')}${d.bic ? ' · BIC ' + esc(d.bic) : ''}` : `${esc(d.network || '')} · ${esc(d.address || '')}`;
      return `<div class="am-pay ${p.status === 'pending' ? 'is-pending' : ''}">
        <div class="am-pay__who"><b>${esc(p.educator)}</b><small>${esc(dt(p.createdAt, true))}${p.processedAt ? ' · traité ' + esc(dt(p.processedAt, true)) : ''}</small></div>
        <div class="am-pay__amt">${esc(euro(p.amount))}</div>
        <div class="am-pay__to"><span>${esc(d.holder || '')}</span><code>${to}</code></div>
        <div class="am-pay__act">${p.status === 'pending'
          ? `<button type="button" class="chest-btn am-mini-btn" data-pay-done="${p.id}">Marquer comme versé</button><button type="button" class="chest-btn-2 am-mini-btn" data-pay-refuse="${p.id}">Refuser</button>`
          : `<span class="am-pay__st is-${p.status}">${lbl[p.status]}</span>${p.note ? `<small>${esc(p.note)}</small>` : ''}`}</div>
      </div>`;
    }).join('') : '<p class="am-empty">Aucune demande de retrait.</p>';
  }
  $('amEdu').addEventListener('click', async (ev) => {
    const cp = ev.target.closest('[data-edu-copy]');
    if (cp) { try { await navigator.clipboard.writeText(cp.dataset.eduCopy); cp.textContent = 'Copié ✓'; setTimeout(() => { cp.textContent = 'Copier'; }, 1500); } catch (e) { /* tant pis */ } return; }
    const inv = ev.target.closest('[data-edu-invite]');
    if (inv) {
      const had = inv.textContent.includes('Nouveau');
      if (had && !(await CHESTConfirm('Créer un nouveau lien ? L’ancien ne fonctionnera plus pour les nouvelles inscriptions (les membres déjà inscrits restent rattachés).'))) return;
      inv.disabled = true;
      try { await eduApi(`/admin/educators/${inv.dataset.eduInvite}/invite`, { method: 'POST' }); EDU = null; renderEducators(); } catch (e) { inv.disabled = false; CHESTAlert(e.message); }
      return;
    }
    const open = ev.target.closest('[data-edu-open]');
    if (open && window.parent && window.parent.CHESTShell) { ev.preventDefault(); window.parent.CHESTShell.go('educator', '?educator=' + open.dataset.eduOpen); }
  });
  $('amEdu').addEventListener('change', async (ev) => {
    const inp = ev.target.closest('[data-edu-rate]'); if (!inp) return;
    const rate = Number(String(inp.value).replace(',', '.'));
    try { await eduApi(`/admin/educators/${inp.dataset.eduRate}/rate`, { method: 'POST', body: JSON.stringify({ rate }) }); inp.classList.add('is-saved'); setTimeout(() => inp.classList.remove('is-saved'), 1200); EDU = null; renderEducators(); }
    catch (e) { CHESTAlert(e.message); }
  });
  $('amPayouts').addEventListener('click', async (ev) => {
    const done = ev.target.closest('[data-pay-done]'), ref = ev.target.closest('[data-pay-refuse]');
    if (!done && !ref) return;
    const id = (done || ref).dataset.payDone || (done || ref).dataset.payRefuse;
    const note = await CHESTPrompt(done ? 'Virement effectué ? Ajoute une référence (facultatif), par exemple la date ou le numéro du virement.' : 'Refuser cette demande ? Indique la raison, elle sera visible par l’éducateur.', { confirmLabel: done ? 'Marquer comme versé' : 'Refuser' });
    if (note === null || note === undefined || note === false) return;
    try { await eduApi(`/admin/payouts/${id}`, { method: 'POST', body: JSON.stringify({ status: done ? 'paid' : 'refused', note: typeof note === 'string' ? note : '' }) }); EDU = null; renderEducators(); }
    catch (e) { CHESTAlert(e.message); }
  });

  // ------------------------------------------------------------ Ventes (2026-10-30)
  let SALES = null;
  const SALE_ST = { bloquee: 'Bloquée', retirable: 'Retirable', remboursee: 'Remboursée', encaissee: 'Encaissée' };
  async function renderSales() {
    if (!SALES || SALES.days !== S.days) {
      $('amSalesList').innerHTML = '<p class="am-empty">Chargement…</p>';
      try { SALES = await eduApi('/admin/sales?days=' + S.days); } catch (e) { $('amSalesList').innerHTML = `<p class="am-empty">${esc(e.message)}</p>`; return; }
    }
    const t = SALES.totals;
    const kpi = (k, v, n, hero) => `<div class="am-sales-kpi${hero ? ' is-hero' : ''}"><span>${k}</span><b>${esc(v)}</b><small>${n}</small></div>`;
    $('amSalesKpis').innerHTML = [
      kpi('Encaissé', euro(t.net, 0), `${t.count} vente${t.count > 1 ? 's' : ''} ${periodWord()}${t.refunded ? ` · ${esc(euro(t.refunded, 0))} remboursés` : ''}`, true),
      kpi('Aux éducateurs', euro(t.commission, 0), t.locked ? `dont ${esc(euro(t.locked, 0))} encore bloqués 14 j` : 'rien de bloqué'),
      kpi('Reste à CHEST', euro(t.chest, 0), t.net ? `${Math.round((t.chest / t.net) * 100)} % de l’encaissé` : '—'),
      kpi('Ventes directes', String(SALES.direct.sales), `${esc(euro(SALES.direct.net, 0))} sans éducateur`),
    ].join('');
    $('amSalesMode').innerHTML = SALES.checkout === 'auto'
      ? '<span class="am-sales-ok">Paiement Stripe automatique au prix affiché</span>'
      : '<span class="am-sales-warn">Paiement par liens Stripe : ajoute la clé STRIPE_SECRET_KEY sur Railway</span>';
    $('amSalesEdu').innerHTML = SALES.educators.length ? SALES.educators.map((e) => `<div class="am-sales-edu">
        <div class="am-sales-edu__who"><b>${esc(e.name)}</b><small>${pctOf(e.rate)} % · ${e.sales} vente${e.sales > 1 ? 's' : ''} ${periodWord()}</small></div>
        <div class="am-sales-edu__n"><span>Ventes</span><b>${esc(euro(e.net, 0))}</b></div>
        <div class="am-sales-edu__n"><span>Sa part</span><b>${esc(euro(e.commission))}</b></div>
        <div class="am-sales-edu__n"><span>Bloqué</span><b>${esc(euro(e.wallet.locked))}</b></div>
        <div class="am-sales-edu__n"><span>Retirable</span><b class="is-ok">${esc(euro(e.wallet.available))}</b></div>
        <div class="am-sales-edu__n"><span>Versé</span><b>${esc(euro(e.wallet.paid))}</b></div>
      </div>`).join('') : '<p class="am-empty">Aucun éducateur pour l’instant.</p>';
    $('amSalesMeta').textContent = `${t.count} ${periodWord()}`;
    $('amSalesList').innerHTML = SALES.sales.length ? `<div class="am-sale am-sale--head"><span>Date</span><span>Membre · offre</span><span>Montant</span><span>Éducateur</span><span>Sa part</span><span>CHEST</span><span>Statut</span></div>` + SALES.sales.map((s) => `<div class="am-sale">
        <span class="am-sale__at">${esc(dt(s.at, true))}</span>
        <span class="am-sale__who"><b>${esc(s.member.name)}</b><small>${esc(s.offer)}</small></span>
        <span class="am-sale__amt">${s.refunded ? `<s>${esc(euro(s.amount, 0))}</s> ` : ''}${esc(euro(s.net, 0))}</span>
        <span class="am-sale__edu">${s.educator ? `${esc(s.educator.name)}<small>${pctOf(s.rate)} %</small>` : '<em>Directe</em>'}</span>
        <span class="am-sale__num">${s.educator ? esc(euro(s.commission)) : '—'}</span>
        <span class="am-sale__num">${esc(euro(s.chest))}</span>
        <span class="am-sale__st is-${s.status}">${SALE_ST[s.status]}${s.status === 'bloquee' ? `<small>jusqu’au ${esc(dt(s.availableAt))}</small>` : ''}</span>
      </div>`).join('') : `<p class="am-empty">Aucune vente ${periodWord()}.</p>`;
  }

  const RENDER = { overview: renderOverview, members: renderMembers, ranks: renderRanks, engagement: renderEngagement, sales: renderSales, educators: renderEducators, system: renderSystem, storage: renderStorage };
  function placeIndicator() {
    const tabs = document.querySelector('.am-nav__tabs');
    let ind = tabs.querySelector('.am-nav__ind');
    if (!ind) { ind = document.createElement('span'); ind.className = 'am-nav__ind'; tabs.appendChild(ind); }
    const b = tabs.querySelector(`[data-view="${S.view}"]`);
    ind.style.width = (b.offsetWidth - 28) + 'px';
    ind.style.transform = `translateX(${b.offsetLeft + 14}px)`;
  }
  const VIEW_LABEL = { overview: 'Vue d’ensemble', members: 'Membres', ranks: 'Rangs', engagement: 'Engagement', sales: 'Ventes', educators: 'Éducateurs', system: 'Système', storage: 'Stockage' };
  function setView(v, opts) {
    S.view = v;
    $('amCrumb').textContent = VIEW_LABEL[v] || 'Membres';
    store('chest_admin_view', v);
    document.querySelectorAll('#amNav [data-view]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === v)));
    document.querySelectorAll('.am-view').forEach((p) => { p.hidden = !(p.dataset.panel === v || false); });
    const usesPeriod = v === 'overview' || v === 'engagement' || v === 'sales';
    if (usesPeriod) $('amPeriod').removeAttribute('data-off'); else $('amPeriod').setAttribute('data-off', '');
    document.querySelector('.am2-period-row').hidden = !usesPeriod;
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
    const planNow = c === 'privilege' ? 'offert' : ['premium', 'essentiel'].includes(base(c)) ? base(c) : (c === 'none' || c === 'expired' ? 'none' : 'offert');
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
        <dt>Période</dt><dd>${a.period === 'year' ? 'Annuelle' : a.period === 'month' ? 'Mensuelle' : /^\d+m$/.test(a.period || '') ? `${parseInt(a.period, 10)} mois${a.level ? ` · rang ${['', 'I', 'II', 'III'][a.level]}` : ''}` : '—'}</dd>
        <dt>Début</dt><dd>${esc(dt(a.startedAt))}</dd>
        <dt>Dernier montant</dt><dd>${eurCents(m.amount)}</dd>
      </dl></div>
    </div>`;
    const access = `<div class="am-dpane" data-dpane="access" ${S.dtab === 'access' ? '' : 'hidden'}>${isMe ? '<div class="am-block"><p class="am-muted">C’est ton compte : ton rôle et ton accès ne se modifient pas d’ici. Ton espace de stockage, si.</p></div>' : `
      <div class="am-block"><h3 class="am-sub">Rôle</h3>
        <div class="am-opt">${[['member', 'Membre', 'Droits selon son offre'], ['educator', 'Éducateur', 'Accès complet, School bientôt'], ['manager', 'Manageur', 'Pouvoirs admin, sans HQ'], ['admin', 'Admin', 'Tous les droits']].filter(([k]) => k !== 'admin' || me().role !== 'manager').map(([k, l, s]) => `<button type="button" data-role="${k}" aria-pressed="${role === k}"><b>${badge(k === 'member' ? (['admin', 'manager', 'educator'].includes(c) ? 'none' : c) : k, 18)}${l}</b><small>${s}</small></button>`).join('')}</div>
        <p class="am-msg" data-role-msg role="status" style="margin-top:10px"></p>
      </div>
      <form class="am-block" data-access-form><h3 class="am-sub">Accès</h3>
        <div class="am-opt am-opt--4">${[['offert', 'Privilège', 'Tout, offert'], ['premium', 'Premium', 'Tout CHEST'], ['essentiel', 'Essentiel', 'Sans School ni BERICH'], ['none', 'Aucun', 'Couper l’accès']].map(([k, l, s]) => `<button type="button" data-plan="${k}" aria-pressed="${planNow === k}"><b>${l}</b><small>${s}</small></button>`).join('')}</div>
        <div data-level-row ${['premium', 'essentiel'].includes(planNow) ? '' : 'hidden'} style="margin-top:14px">
          <div class="am-dur">${[[1, 'Rang I · 3 mois'], [2, 'Rang II · 6 mois'], [3, 'Rang III · 1 an']].map(([k, l]) => `<button type="button" data-level="${k}" class="${(m.access || {}).level === k ? 'is-active' : ''}">${l}</button>`).join('')}</div>
        </div>
        <div data-dur-row ${planNow === 'none' ? 'hidden' : ''} style="margin-top:14px">
          <div class="am-dur">${[['7', '7 jours'], ['30', '30 jours'], ['90', '3 mois'], ['180', '6 mois'], ['365', '1 an'], ['date', 'Jusqu’au…'], ['', 'Sans limite']].map(([k, l]) => `<button type="button" data-dur="${k}" class="${(planNow === 'offert' ? k === '' : k === '30') ? 'is-active' : ''}" ${k === '' && planNow !== 'offert' ? 'hidden' : ''}>${l}</button>`).join('')}</div>
          <input type="date" class="am-date" data-dur-date hidden aria-label="Date de fin" min="${isoDay(new Date(Date.now() + DAY))}">
        </div>
        <div class="am-row-ctl"><button type="submit" class="chest-btn">Appliquer</button><p class="am-msg" data-access-msg role="status"></p></div>
        ${role !== 'member' ? '<p class="am-hint">Son rôle lui donne déjà tout : l’accès ne comptera que s’il redevient Membre.</p>' : ''}
      </form>
      <div class="am-block"><h3 class="am-sub">Compte</h3>
        <div class="am-danger">${m.status === 'blocked' ? '<button type="button" data-unblock>Débloquer</button>' : '<button type="button" data-block>Bloquer</button>'}<button type="button" data-del>Supprimer définitivement</button></div>
        <p class="am-hint">Bloquer coupe l’accès tout de suite, sans rien effacer. Supprimer efface le compte et toutes ses données.</p>
      </div>`}
      <div class="am-block"><h3 class="am-sub">Stockage</h3>${storeBlock(m, true)}</div>
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
        <div class="am-dh__chips">${chip(c)}${isMe ? '<span class="am-tag">toi</span>' : ''}${m.status === 'blocked' ? '<span class="am-tag am-tag--red">bloqué</span>' : ''}${isOnline(m) ? '<span class="am-tag" style="color:var(--chest-green);background:rgba(var(--green-rgb, 51, 230, 166),.1)">en ligne</span>' : ''}</div>
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
  $('amCounts').addEventListener('click', (e) => { const b = e.target.closest('[data-chip]'); if (!b) return; S.filter = null; S.chip = S.chip === b.dataset.chip ? 'all' : b.dataset.chip; S.limit = 50; renderMembers(); });
  $('amFilter').addEventListener('click', (e) => { if (e.target.closest('[data-clear-filter]')) { S.filter = null; if (!SEG.includes(S.chip)) S.chip = 'all'; renderMembers(); } });
  let qTimer;
  $('amSearch').addEventListener('input', (e) => { clearTimeout(qTimer); qTimer = setTimeout(() => { S.q = e.target.value; S.limit = 50; renderRows(); }, 80); });
  $('amSearch').addEventListener('keydown', (e) => { if (e.key === 'Enter' && S.list.length) selectMember(S.list[0], true); });
  $('amSort').addEventListener('change', (e) => { S.sort = e.target.value; renderRows(); });
  $('amRows').addEventListener('click', (e) => {
    if (e.target.closest('[data-more]')) { S.limit += 50; renderRows(); return; }
    const full = e.target.closest('[data-full]'); if (full) { openDrawer(Number(full.dataset.full)); return; }
    const r = e.target.closest('.am-row'); if (r) { selectMember(Number(r.dataset.id)); openDrawer(Number(r.dataset.id)); } // CHEST 2.0 : la fiche s'ouvre en volet
  });
  $('amRows').addEventListener('keydown', (e) => {
    const r = e.target.closest('.am-row'); if (!r) return;
    if (e.target.closest('[data-full]')) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectMember(Number(r.dataset.id)); openDrawer(Number(r.dataset.id)); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = e.key === 'ArrowDown' ? r.nextElementSibling : r.previousElementSibling; if (n && n.classList.contains('am-row')) n.focus(); }
  });

  // Fiche latérale : accès jusqu'au, rang, mot de passe, blocage
  $('amSheet').addEventListener('click', async (e) => {
    const m = S.members.find((x) => x.id === S.sel); if (!m) return;
    if (e.target.closest('[data-full]')) { openDrawer(m.id); return; }
    if (e.target.closest('[data-sheet-rank]')) { openDrawer(m.id, 'access'); return; }
    if (e.target.closest('[data-sheet-reset]')) {
      if (!(await CHESTConfirm(`Générer un nouveau mot de passe pour ${fullName(m)} ? L’ancien ne fonctionnera plus.`))) return;
      try { const pw = await A.resetMemberPassword(m.id); await CHESTAlert(`Nouveau mot de passe de ${fullName(m)} : ${pw}. Transmets-le par un canal privé.`); } catch (err) { await CHESTAlert(err.message); }
      return;
    }
    const bl = e.target.closest('[data-sheet-block]');
    if (bl) {
      const blocking = bl.dataset.sheetBlock === '1';
      if (blocking && !(await CHESTConfirm(`Bloquer ${fullName(m)} ? Son accès est coupé tout de suite, rien n’est effacé.`))) return;
      bl.disabled = true;
      try { if (blocking) await A.blockMember(m.id); else await A.approveMember(m.id); await reload(); } catch (err) { await CHESTAlert(err.message); bl.disabled = false; }
    }
  });
  $('amSheet').addEventListener('submit', async (e) => {
    e.preventDefault();
    const m = S.members.find((x) => x.id === S.sel); if (!m) return;
    if (e.target.closest('[data-sheet-store]')) { saveStore(e.target.closest('[data-sheet-store]'), m, '#amSheet'); return; }
    const msg = $('amSheetMsg'), until = $('amSheetEnd').value;
    if (!until) { say(msg, 'Choisis une date de fin.', 'err'); return; }
    const c = cat(m), fam = base(c);
    const plan = ['premium', 'essentiel'].includes(fam) ? fam : 'offert';
    const level = ['premium', 'essentiel'].includes(fam) ? (m.access || {}).level || null : null;
    if (plan === 'offert' && c !== 'privilege' && !(await CHESTConfirm(`${fullName(m)} n’a pas d’offre payée en cours : lui offrir un Privilège jusqu’au ${new Date(until).toLocaleDateString('fr-FR')} ?`))) return;
    const btn = e.target.querySelector('[type="submit"]'); btn.disabled = true; say(msg, 'Enregistrement…');
    try { await A.setMemberAccess(m.id, plan, null, until, level); await reload(); say($('amSheetMsg'), 'Accès mis à jour.', 'ok'); } catch (err) { say(msg, err.message, 'err'); btn.disabled = false; }
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

    // Rang 1, 2 ou 3 (2026-10-28) : choisir le rang règle aussi la durée (3 mois, 6 mois, 1 an).
    const lvlBtn = e.target.closest('[data-level]');
    if (lvlBtn) {
      body.querySelectorAll('[data-level]').forEach((x) => x.classList.toggle('is-active', x === lvlBtn));
      wireDur(body, body.querySelector(`[data-dur="${{ 1: '90', 2: '180', 3: '365' }[lvlBtn.dataset.level]}"]`));
      return;
    }
    const planBtn = e.target.closest('[data-plan]');
    if (planBtn) {
      body.querySelectorAll('[data-plan]').forEach((x) => x.setAttribute('aria-pressed', String(x === planBtn)));
      const plan = planBtn.dataset.plan;
      body.querySelector('[data-dur-row]').hidden = plan === 'none';
      body.querySelector('[data-level-row]').hidden = !['premium', 'essentiel'].includes(plan);
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
  // Espace de stockage choisi par l'admin (fiche latérale ou volet du membre).
  async function saveStore(f, m, scope) {
    const smsg = f.querySelector('[data-store-msg]'), sb = f.querySelector('[type="submit"]');
    const v = f.querySelector('[data-store-gb]').value.trim();
    sb.disabled = true; say(smsg, 'Enregistrement…');
    try {
      const r = await fetch(A.apiBase() + `/members/${m.id}/storage`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + A.getToken() }, body: JSON.stringify({ gb: v || null }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Enregistrement impossible.');
      m.storage = d.storage;
      if (scope === '#amSheet') renderSheet(); else { renderSheet(); renderDrawer(); }
      if (S.view === 'storage') renderStorage();
      const nm = document.querySelector(`${scope} [data-store-msg]`); if (nm) say(nm, 'Espace mis à jour.', 'ok');
    } catch (err) { say(smsg, err.message, 'err'); sb.disabled = false; }
  }
  $('amDrawer').addEventListener('submit', async (e) => {
    const sf = e.target.closest('[data-sheet-store]');
    if (sf) { e.preventDefault(); const m = S.members.find((x) => x.id === S.current); if (m) saveStore(sf, m, '#amDrawer'); return; }
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
      const lv = form.querySelector('[data-level].is-active');
      await A.setMemberAccess(id, plan, dur.days, dur.until, ['premium', 'essentiel'].includes(plan) && lv ? Number(lv.dataset.level) : null);
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
  loadOps().catch(() => { /* pastille Système : au premier passage sur l'onglet */ });
  loadEdu().catch(() => { /* pastille Éducateurs : au premier passage sur l'onglet */ });
  reload().catch((err) => { $('amRows').innerHTML = `<div class="am-error">Impossible de charger les membres : ${esc(err.message)}</div>`; $('amKpis').innerHTML = `<div class="am-error">Impossible de charger : ${esc(err.message)}</div>`; });
})();
