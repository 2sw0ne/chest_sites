// CHEST · Journal de trading — CRUD des entrées manuelles + agrégation des
// trades venus de BERICH (live), dans un format commun, et gestion des
// comptes de journal (propre ou propfirm, avec leurs règles). Le Backtesting
// est volontairement exclu de cette agrégation — voir allEntries() plus bas.
//
// Entrée commune : { id, date, pair, side:'buy'|'sell', entry, sl, tp,
//   rrTarget, rrActual, result:'TP'|'SL'|'BE'|null (null = encore ouvert),
//   pnl (montant $, null si inconnu/ouvert), tags:[], chartLink, notes,
//   accountId (compte de journal concerné, entrées manuelles uniquement),
//   source:'manual'|'berich' }
//
// Compte de journal : { id, name, type:'own'|'propfirm', propfirmId, modelId (challenge, ex. 'ftmo-2step'), stage ('p1'|'p2'|'funded'),
//   balance, riskUnit:'usd'|'pct', riskValue,
//   rules:{ dailyLossPct, maxLossPct, profitTargetPct, minDays } | null,
//   rulesVerified: bool (true seulement pour un préréglage vérifié en direct),
//   connectionMode:'manual'|'mt5' }
//
// Honnêteté : le P&L des entrées 'berich' est celui réellement choisi au
// moment de la prise de position (mémorisé par berich-store.js), pas
// recalculé après coup. Les règles propfirm viennent de js/propfirm-rules.js
// (pages officielles, datées) et se choisissent par firme, challenge et étape ;
// une firme absente de cette base reste en saisie manuelle.
(() => {
  'use strict';

  const KEY = 'chest_journal';
  const TAGS_KEY = 'chest_journal_tags';
  const FAV_PAIRS_KEY = 'chest_journal_fav_pairs';
  const ACCOUNTS_KEY = 'chest_journal_accounts';
  const ACTIVE_ACCOUNT_KEY = 'chest_journal_active_account';
  const EXT_KEY = 'chest_journal_ext'; // trades venus de sources automatiques (Myfxbook…), par compte

  // ---------- Firmes sélectionnables : TOUTE la liste BERICH (propfirms puis brokers) + les firmes vérifiées en plus ----------
  // Source : js/berich-brokers.js (`window.CHEST_BROKERS`). Les firmes de js/propfirm-rules.js qui n'y sont pas
  // (FundedNext, The5ers, Funding Pips, Blueberry Funded) sont ajoutées. Les brokers ont un id préfixé `br_` (Blueberry
  // existe des deux côtés : propfirm `blueberry`, broker `br_blueberry`).
  const EXTRA_PROPFIRMS = [
    { id: 'fundednext', name: 'FundedNext', domain: 'fundednext.com', kind: 'propfirm' },
    { id: 'the5ers', name: 'The5ers', domain: 'the5ers.com', kind: 'propfirm' },
    { id: 'fundingpips', name: 'Funding Pips', domain: 'fundingpips.com', kind: 'propfirm' },
    { id: 'blueberry', name: 'Blueberry Funded', domain: 'blueberryfunded.com', kind: 'propfirm' },
  ];
  function buildFirms() {
    const berich = Array.isArray(window.CHEST_BROKERS) ? window.CHEST_BROKERS : [];
    const props = berich.filter((b) => b.kind === 'propfirm').map((b) => ({ id: b.id, name: b.name, domain: b.domain, kind: 'propfirm' }));
    EXTRA_PROPFIRMS.forEach((e) => { if (!props.some((p) => p.id === e.id)) props.push(e); });
    const brokers = berich.filter((b) => b.kind !== 'propfirm').map((b) => ({ id: 'br_' + b.id, name: b.name, domain: b.domain, kind: 'broker' }));
    return props.concat(brokers);
  }
  const PROPFIRMS = buildFirms();

  // Nom de la firme dans js/propfirm-rules.js (règles lues sur les pages officielles, datées).
  const RULES_FIRM = { ftmo: 'FTMO', alphacapital: 'Alpha Capital', topstep: 'Topstep', fundednext: 'FundedNext', the5ers: 'The5ers', fundingpips: 'Funding Pips', blueberry: 'Blueberry Funded' };

  // Challenges disponibles pour une firme (1 étape, 2 étapes, Swing…) et règles d'une étape : elles viennent de
  // js/propfirm-rules.js (règles vérifiées sur les pages officielles) — jamais devinées. Smart Fund Trader n'y est
  // pas : saisie manuelle.
  function challengeModels(propfirmId) {
    const firm = RULES_FIRM[propfirmId];
    return firm && window.CHESTPropRules ? window.CHESTPropRules.models.filter((m) => m.firm === firm) : [];
  }
  // stage : 'p1' | 'p2' | 'funded'
  function stageList(m) {
    const out = m.phases.length > 1 ? [{ id: 'p1', label: 'Phase 1' }, { id: 'p2', label: 'Phase 2' }] : [{ id: 'p1', label: 'Challenge' }];
    out.push({ id: 'funded', label: 'Compte financé' });
    return out;
  }
  function stageRules(m, stage) {
    if (!m) return null;
    if (stage === 'funded') return { dailyLossPct: m.funded.dailyLossPct, maxLossPct: m.funded.maxLossPct, maxLossType: m.funded.maxLossType, profitTargetPct: 0, minDays: 0 };
    const i = stage === 'p2' ? 1 : 0;
    return { dailyLossPct: m.dailyLossPct, maxLossPct: m.maxLossPct, maxLossType: m.maxLossType, profitTargetPct: m.phases[i] != null ? m.phases[i] : 0, minDays: m.minDays ? m.minDays.count : 0 };
  }

  function propfirms() { return PROPFIRMS.slice(); }
  function propfirmLogo(domain) { return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}`; }

  // ---------- Comptes du journal (propre ou propfirm) ----------
  function listAccounts() {
    try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]'); } catch (e) { return []; }
  }
  function persistAccounts(items) {
    try { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(items)); } catch (e) { /* tant pis */ }
  }
  function addAccount(acc) {
    const items = listAccounts();
    const id = 'acc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const record = Object.assign({ id }, acc);
    items.push(record);
    persistAccounts(items);
    setActiveAccountId(id);
    return record;
  }
  function updateAccount(id, patch) {
    const items = listAccounts();
    const idx = items.findIndex((a) => a.id === id);
    if (idx === -1) return null;
    items[idx] = Object.assign({}, items[idx], patch);
    persistAccounts(items);
    return items[idx];
  }
  function removeAccount(id) {
    persistAccounts(listAccounts().filter((a) => a.id !== id));
    if (activeAccountId() === id) {
      const remaining = listAccounts();
      setActiveAccountId(remaining.length ? remaining[0].id : null);
    }
  }

  // ---------- Historique de comptes / transitions de phase (2026-09-29, demande utilisateur : "je
  // veux qu'il comprenne le trader" — le journal doit reconnaître automatiquement qu'un nouveau
  // compte rattaché représente une phase validée, un compte cramé, ou un nouveau compte après
  // payout). `stageChain` = liste ordonnée de segments, un par compte réellement connecté (live
  // Myfxbook ou Live MT5) : { id, connType:'myfxbook'|'mt5', connRef, stage, label, startBalance,
  // lastBalance, status:'active'|'validated'|'blown', payout:null|{gross,splitPct,net,date},
  // startedAt, endedAt }. `payoutSplitPct` (part gardée par le trader, ex. 80) est demandé une seule
  // fois, à la première transition vers "funded", puis réutilisé pour tout calcul de retrait.
  const moneyFmt = (n) => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // Date locale AAAA-MM-JJ (jamais toISOString(), qui repasse en UTC et peut décaler le jour -
  // piège déjà documenté sur ce projet, voir CLAUDE.md).
  const isoDateLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  function stageModelFor(acc) {
    if (!acc || acc.type !== 'propfirm' || !acc.modelId) return null;
    return challengeModels(acc.propfirmId).find((m) => m.id === acc.modelId) || null;
  }
  function stageLabelText(stages, stageId) {
    return (stages && stages.find((s) => s.id === stageId) || {}).label || stageId;
  }
  function activeStageSegment(acc) {
    return (acc.stageChain || []).find((s) => s.status === 'active') || null;
  }
  // Met à jour le solde connu du segment ACTIF (appelé à chaque synchro Myfxbook / connexion MT5)
  // pour que la détection de compte cramé / le calcul du retrait s'appuient sur une donnée fraîche.
  function updateActiveStageBalance(accountId, balance, connRef) {
    if (balance == null) return;
    const accounts = listAccounts();
    const acc = accounts.find((a) => a.id === accountId);
    if (!acc) return;
    const seg = activeStageSegment(acc);
    if (!seg) return;
    if (connRef != null && seg.connRef !== connRef) return; // pas le compte live qui vient de synchroniser
    seg.lastBalance = balance;
    persistAccounts(accounts);
  }
  // Rattache un nouveau compte (live Myfxbook ou connexion Live MT5) à une étape du challenge,
  // ferme le segment précédent en déduisant ce qui s'est passé (validé / cramé / payout probable),
  // et notifie l'utilisateur (voir js/notifications-store.js). Renvoie { segment, needsSplitPct } —
  // needsSplitPct=true signifie qu'un retrait a été détecté mais qu'aucun % de partage n'est encore
  // connu : l'appelant doit demander le % puis rappeler setPayoutSplitPct().
  function attachStageAccount(accountId, opts) {
    const accounts = listAccounts();
    const acc = accounts.find((a) => a.id === accountId);
    if (!acc) return null;
    if (!acc.stageChain) acc.stageChain = [];
    const chain = acc.stageChain;
    const prev = activeStageSegment(acc);
    const model = stageModelFor(acc);
    const stages = model ? stageList(model) : null;
    let needsSplitPct = false;
    let notif = null;

    if (prev) {
      prev.endedAt = new Date().toISOString();
      const prevIdx = stages ? stages.findIndex((s) => s.id === prev.stage) : -1;
      const newIdx = stages ? stages.findIndex((s) => s.id === opts.stage) : -1;
      const prevRules = model ? stageRules(model, prev.stage) : null;
      const blown = prevRules && prevRules.maxLossPct != null && prev.lastBalance != null
        && prev.lastBalance <= prev.startBalance * (1 - prevRules.maxLossPct / 100);

      if (blown) {
        prev.status = 'blown';
        notif = {
          type: 'account_blown', title: 'Compte cramé détecté',
          body: `"${acc.name}" — le solde suggère que le compte a dépassé la perte max autorisée en ${stageLabelText(stages, prev.stage)}.`,
        };
      } else if (newIdx > prevIdx && prevIdx !== -1) {
        // Progression logique (p1 -> p2, ou -> funded) : l'étape précédente est considérée validée.
        prev.status = 'validated';
        notif = {
          type: 'phase_validated', title: 'Étape validée 🎉',
          body: `"${acc.name}" — ${stageLabelText(stages, prev.stage)} validée, direction ${stageLabelText(stages, opts.stage)}.`,
        };
        if (opts.stage === 'funded' && acc.payoutSplitPct == null) needsSplitPct = true;
      } else if (opts.stage === prev.stage && prev.stage === 'funded') {
        // Même étape "financé" répétée : probablement un nouveau compte donné après un retrait.
        prev.status = 'validated';
        const gross = (prev.lastBalance != null && prev.lastBalance > prev.startBalance && opts.startBalance < prev.lastBalance)
          ? Math.round((prev.lastBalance - opts.startBalance) * 100) / 100 : null;
        if (gross && gross > 0) {
          if (acc.payoutSplitPct == null) {
            needsSplitPct = true;
            prev._pendingPayoutGross = gross;
          } else {
            prev.payout = { gross, splitPct: acc.payoutSplitPct, net: Math.round(gross * acc.payoutSplitPct) / 100, date: isoDateLocal(new Date()) };
            notif = {
              type: 'payout_detected', title: 'Retrait détecté 💸',
              body: `"${acc.name}" — retrait estimé de ${moneyFmt(prev.payout.net)} (net, ${acc.payoutSplitPct}% gardés) sur un brut de ${moneyFmt(gross)}.`,
            };
          }
        }
      } else {
        prev.status = 'validated';
      }
    }

    const seg = {
      id: 'stg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      connType: opts.connType, connRef: opts.connRef || null,
      stage: opts.stage, label: stages ? stageLabelText(stages, opts.stage) : opts.stage,
      startBalance: opts.startBalance != null ? opts.startBalance : 0,
      lastBalance: opts.startBalance != null ? opts.startBalance : 0,
      status: 'active', payout: null, startedAt: new Date().toISOString(), endedAt: null,
    };
    chain.push(seg);
    acc.stage = opts.stage; // garde le champ existant à jour (lu ailleurs pour le libellé/les règles courantes)
    persistAccounts(accounts);

    if (notif && window.CHESTNotifications) window.CHESTNotifications.add(notif.type, notif.title, notif.body, { journalAccountId: accountId });
    return { segment: seg, needsSplitPct };
  }
  // Fixe le % de partage (part gardée par le trader) et résout un éventuel retrait resté en
  // attente (voir needsSplitPct ci-dessus) sur le dernier segment qui l'a détecté.
  function setPayoutSplitPct(accountId, pct) {
    const accounts = listAccounts();
    const acc = accounts.find((a) => a.id === accountId);
    if (!acc) return;
    acc.payoutSplitPct = pct;
    const pending = (acc.stageChain || []).slice().reverse().find((s) => s._pendingPayoutGross != null);
    if (pending) {
      const gross = pending._pendingPayoutGross;
      pending.payout = { gross, splitPct: pct, net: Math.round(gross * pct) / 100, date: isoDateLocal(new Date()) };
      delete pending._pendingPayoutGross;
      if (window.CHESTNotifications) {
        window.CHESTNotifications.add('payout_detected', 'Retrait détecté 💸',
          `"${acc.name}" — retrait estimé de ${moneyFmt(pending.payout.net)} (net, ${pct}% gardés) sur un brut de ${moneyFmt(gross)}.`,
          { journalAccountId: accountId });
      }
    }
    persistAccounts(accounts);
  }
  // Corrige/efface à la main un retrait détecté automatiquement (transgression, montant réel
  // différent…) — payout = {gross,splitPct,net,date} ou null pour l'effacer.
  function updateStagePayout(accountId, stageSegId, payout) {
    const accounts = listAccounts();
    const acc = accounts.find((a) => a.id === accountId);
    if (!acc) return;
    const seg = (acc.stageChain || []).find((s) => s.id === stageSegId);
    if (!seg) return;
    seg.payout = payout;
    persistAccounts(accounts);
  }
  // Tous les retraits confirmés d'un journal (pour l'affichage agrégé côté Dashboard).
  function stagePayouts(accountId) {
    const acc = listAccounts().find((a) => a.id === accountId);
    if (!acc) return [];
    return (acc.stageChain || []).filter((s) => s.payout).map((s) => Object.assign({ stageId: s.id, stage: s.stage, label: s.label }, s.payout));
  }

  function activeAccountId() {
    try { return localStorage.getItem(ACTIVE_ACCOUNT_KEY); } catch (e) { return null; }
  }
  function setActiveAccountId(id) {
    try { id ? localStorage.setItem(ACTIVE_ACCOUNT_KEY, id) : localStorage.removeItem(ACTIVE_ACCOUNT_KEY); } catch (e) { /* tant pis */ }
  }
  function getActiveAccount() {
    const id = activeAccountId();
    const accounts = listAccounts();
    return accounts.find((a) => a.id === id) || accounts[0] || null;
  }

  // Montant $ à risquer pour un compte donné, selon son unité (fixe ou %).
  function riskAmountFor(account) {
    if (!account) return null;
    return account.riskUnit === 'pct' ? Math.round(account.balance * account.riskValue) / 100 : account.riskValue;
  }

  // ---------- Confirmations réutilisables (façon multi-select Notion) ----------
  function knownTags() {
    try { return JSON.parse(localStorage.getItem(TAGS_KEY) || '[]'); } catch (e) { return []; }
  }
  function rememberTag(tag) {
    const t = tag.trim();
    if (!t) return;
    const tags = knownTags();
    if (!tags.some((x) => x.toLowerCase() === t.toLowerCase())) {
      tags.push(t);
      try { localStorage.setItem(TAGS_KEY, JSON.stringify(tags)); } catch (e) { /* tant pis */ }
    }
  }

  // ---------- Paires favorites (remontent en haut de la liste) ----------
  function favoritePairs() {
    try { return JSON.parse(localStorage.getItem(FAV_PAIRS_KEY) || '[]'); } catch (e) { return []; }
  }
  function toggleFavoritePair(code) {
    const favs = favoritePairs();
    const next = favs.includes(code) ? favs.filter((c) => c !== code) : [...favs, code];
    try { localStorage.setItem(FAV_PAIRS_KEY, JSON.stringify(next)); } catch (e) { /* tant pis */ }
    return next;
  }

  function list() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
  }
  function persist(items) {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) { /* tant pis */ }
  }
  function add(entry) {
    const items = list();
    const id = 'jr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const record = Object.assign({ id, source: 'manual', tags: [] }, entry);
    items.push(record);
    persist(items);
    return record;
  }
  function update(id, patch) {
    const items = list();
    const idx = items.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    items[idx] = Object.assign({}, items[idx], patch);
    persist(items);
    return items[idx];
  }
  function remove(id) {
    persist(list().filter((e) => e.id !== id));
  }

  // ---------- Import depuis BERICH (positions prises via le bouton) ----------
  function rrFromLevels(side, entry, sl, tp) {
    const risk = Math.abs(entry - sl);
    if (!risk) return null;
    const reward = side === 'sell' ? entry - tp : tp - entry;
    return Math.round((reward / risk) * 100) / 100;
  }

  async function berichEntries() {
    if (!window.CHESTBerich) return [];
    let data;
    try { data = await CHESTBerich.fetchSignals(); } catch (e) { return []; }
    if (data.example) return []; // pas de vrai signal encore reçu
    const taken = CHESTBerich.loadTaken();
    return (data.signals || [])
      .map((s) => {
        const meta = taken.find((t) => t.id === s.id);
        if (!meta) return null; // seules les positions confirmées entrent dans le journal
        const closed = s.status === 'closed';
        const rrTarget = rrFromLevels(s.side, s.entry, s.sl, s.tp);
        const rrActual = closed ? (s.result === 'TP' ? rrTarget : s.result === 'SL' ? -1 : 0) : null;
        const pnl = closed && meta.riskAmount != null && rrActual != null ? Math.round(meta.riskAmount * rrActual * 100) / 100 : null;
        return {
          id: 'berich-' + s.id,
          date: s.time,
          pair: s.symbol,
          side: s.side,
          entry: s.entry, sl: s.sl, tp: s.tp,
          rrTarget, rrActual,
          result: closed ? s.result : null,
          pnl,
          tags: [],
          chartLink: null,
          notes: '',
          accountId: null,
          source: 'berich',
          sourceLabel: `Risque ${meta.riskPercent}% (${meta.riskSource})`,
        };
      })
      .filter(Boolean);
  }

  // Le Backtesting reste volontairement à part : ses trades sont une
  // simulation de capital (voir backtest-engine.js), pas des positions
  // réelles rattachées à un compte de journal — les mélanger ici rendait le
  // journal illisible (des lignes "ETHAN"/"SWYPER" sans rapport avec une
  // vraie paire, un vrai risque ou un vrai compte). Chaque backtest garde
  // son propre historique dans backtest-view.html?id=... (accessible depuis
  // le menu ⋮ de sa carte sur backtesting.html).
  async function allEntries() {
    const [manual, live] = await Promise.all([
      Promise.resolve(list()),
      berichEntries(),
    ]);
    return [...manual, ...live].sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  // ---------- Un journal = une famille : journal principal (manuel) + comptes live Myfxbook ----------
  // mode 'manual' : journal principal saisi à la main, auquel on peut ajouter des comptes live ;
  // mode 'auto'   : journal alimenté uniquement par des comptes live.
  // Compte live : { id, name, email, password, accountId (Myfxbook), demo, currency, info, lastSync, lastError,
  //   lastLimitReached, possibleGap, firstBatch } — l'e-mail et le mot de passe MYFXBOOK (pas ceux du broker) sont gardés
  // dans ce navigateur, comme pour les comptes du Dashboard.
  function liveAccounts(acc) { return (acc && acc.live) || []; }
  function extAll() {
    try { return JSON.parse(localStorage.getItem(EXT_KEY) || '{}'); } catch (e) { return {}; }
  }
  function extEntries(liveId) { return (extAll()[liveId] || []).slice(); }
  function clearExt(liveId) {
    const all = extAll();
    delete all[liveId];
    try { localStorage.setItem(EXT_KEY, JSON.stringify(all)); } catch (e) { /* tant pis */ }
  }

  // Ajoute un lot de trades d'une source automatique aux données DÉJÀ importées (doublons ignorés par id).
  // L'API Myfxbook ne renvoie que les 50 dernières transactions : si un lot arrive plein (≥ limit), des trades ont pu
  // passer entre deux synchronisations — le résultat le dit pour que l'interface prévienne l'utilisateur.
  function mergeExternal(key, incoming, opts) {
    const limit = (opts && opts.limit) || 50;
    const all = extAll();
    const cur = all[key] || [];
    const before = cur.length;
    const ids = new Set(cur.map((e) => e.id));
    let added = 0;
    // `refresh` : une position deja connue est remise a jour (montant net, notes) - corrige les anciennes
    // entrees Myfxbook calculees avec la commission comptee deux fois. Des notes modifiees a la main
    // (differentes des notes automatiques precedentes) sont gardees.
    const idx = new Map(cur.map((e, i) => [e.id, i]));
    incoming.forEach((e) => {
      if (!ids.has(e.id)) { cur.push(e); ids.add(e.id); added++; return; }
      if (!(opts && opts.refresh)) return;
      const i = idx.get(e.id), old = cur[i];
      // Anciennes entrees (sans `mfx`) : leurs notes automatiques etaient le commentaire Myfxbook brut.
      const keepNotes = old.mfx ? old.notes !== old.mfx.autoNotes : !!old.notes && old.notes !== e.mfx.comment;
      cur[i] = Object.assign({}, old, {
        pnl: e.pnl, result: e.result, rrActual: e.rrActual, rrTarget: e.rrTarget, sl: e.sl, tp: e.tp,
        mfx: e.mfx, notes: keepNotes ? old.notes : e.notes,
      });
    });
    all[key] = cur;
    try { localStorage.setItem(EXT_KEY, JSON.stringify(all)); } catch (e) { /* tant pis */ }
    const limitReached = incoming.length >= limit;
    return { added, total: cur.length, limitReached, firstBatch: before === 0, possibleGap: limitReached && before > 0 && added === incoming.length };
  }

  function addLiveAccount(accountId, live) {
    const acc = listAccounts().find((a) => a.id === accountId);
    if (!acc) return null;
    const rec = Object.assign({ id: 'live_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), addedAt: new Date().toISOString() }, live);
    updateAccount(accountId, { live: [...liveAccounts(acc), rec] });
    return rec;
  }
  function updateLiveAccount(accountId, liveId, patch) {
    const acc = listAccounts().find((a) => a.id === accountId);
    if (!acc) return null;
    return updateAccount(accountId, { live: liveAccounts(acc).map((l) => (l.id === liveId ? Object.assign({}, l, patch) : l)) });
  }
  function removeLiveAccount(accountId, liveId) {
    const acc = listAccounts().find((a) => a.id === accountId);
    if (!acc) return;
    updateAccount(accountId, { live: liveAccounts(acc).filter((l) => l.id !== liveId) });
    clearExt(liveId);
  }

  // ---------- Backtest -> entrées de journal, en RAW (2026-09-29, demande utilisateur : "rattacher
  // un journal, vierge ou non, à un backtesting, il mettra toute les position du backtesting dans
  // le journal en format brut") ----------
  // Le Backtesting simule un capital (voir backtest-engine.js) : ses trades n'ont ni vraie paire, ni
  // niveaux d'entrée/stop/take, ni P&L en $ réel — seulement date/résultat/RR. On les importe donc
  // tels quels (pas de valeur inventée pour remplir les colonnes du journal), taggés "backtest" et
  // notés avec le nom du backtest d'origine pour qu'on sache toujours d'où ils viennent.
  function importBacktestTrades(accountId, backtest) {
    const trades = (backtest && backtest.trades) || [];
    let added = 0;
    trades.forEach((t) => {
      add({
        date: t.date,
        pair: (t.source && String(t.source)) || backtest.title || 'Backtest',
        side: null,
        entry: t.open != null ? t.open : null,
        sl: null, tp: null,
        rrTarget: null,
        rrActual: typeof t.rr === 'number' ? t.rr : null,
        result: t.result || null,
        pnl: null,
        tags: ['backtest'],
        chartLink: null,
        notes: `Importé (brut) depuis le backtest "${backtest.title}"${t.confirmation ? ' · ' + t.confirmation : ''}`,
        accountId,
      });
      added++;
    });
    return added;
  }

  // ---------- Myfxbook -> entrées de journal ----------
  const numOf = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isNaN(n) ? null : n; };
  const pickOf = (o, ...keys) => { for (const k of keys) if (o[k] != null && o[k] !== '') return o[k]; return null; };
  // « 03/01/2010 14:13 » (MM/JJ/AAAA, heure du courtier lue comme heure locale)
  function parseMfxDate(str) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/.exec(String(str || ''));
    return m ? new Date(+m[3], +m[1] - 1, +m[2], +(m[4] || 0), +(m[5] || 0)) : null;
  }
  // `profit` de get-history.json est DEJA le resultat net (commission et swap deduits) : c'est la colonne
  // « Net Profit » de l'historique Myfxbook (2026-10-02, retour utilisateur avec capture : -509,54 $ sur
  // Myfxbook, -513,19 $ ici quand on y re-soustrayait la commission de 3,65 $). Les notes reprennent la
  // ligne du tableau Myfxbook (pips, lots, prix, SL/TP, duree, gain).
  function fmtNum(n, d) { return n == null ? '—' : Number(n).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function fmtDuration(ms) {
    if (!(ms >= 0)) return null;
    const m = Math.round(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
    return d ? `${d}j ${h}h` : h ? `${h}h ${mm}m` : `${mm}m`;
  }
  function mfxNotes(tx, x) {
    const sign = (n) => (n > 0 ? '+' : '');
    const parts = [
      x.pips != null ? `Pips ${sign(x.pips)}${fmtNum(x.pips, 1)}` : null,
      x.lots != null ? `Lots ${fmtNum(x.lots, 2)}` : null,
      `Ouverture ${fmtNum(x.open, 2)} → Clôture ${fmtNum(x.close, 2)}`,
      `SL ${fmtNum(x.sl, 2)} · TP ${fmtNum(x.tp, 2)}`,
      `Net ${sign(x.pnl)}${fmtNum(x.pnl, 2)} $`,
      x.gain != null ? `Gain ${sign(x.gain)}${fmtNum(x.gain, 2)} %` : null,
      x.duration ? `Durée ${x.duration}` : null,
      tx.comment ? String(tx.comment) : null,
    ];
    return parts.filter(Boolean).join(' · ');
  }
  function mfxToEntry(tx, live, balanceBefore) {
    const openS = pickOf(tx, 'openTime', 'openDate'), closeS = pickOf(tx, 'closeTime', 'closeDate');
    const openAt = parseMfxDate(openS), closeAt = parseMfxDate(closeS);
    const symbol = String(tx.symbol || '').toUpperCase();
    const pair = symbol.replace(/[^A-Z0-9].*$/, ''); // XAUUSD.m -> XAUUSD
    const side = String(tx.action || '').toLowerCase().indexOf('sell') === 0 ? 'sell' : 'buy';
    const open = numOf(tx.openPrice), close = numOf(tx.closePrice);
    const sl = numOf(tx.sl) || null, tp = numOf(tx.tp) || null;
    const pnl = Math.round((numOf(tx.profit) || 0) * 100) / 100;
    const risk = open != null && sl != null ? Math.abs(open - sl) : 0;
    const rrActual = risk > 0 && close != null ? Math.round((pnl >= 0 ? 1 : -1) * Math.abs(close - open) / risk * 100) / 100 : null;
    const rrTarget = risk > 0 && tp != null ? Math.round(Math.abs(tp - open) / risk * 100) / 100 : null;
    const lots = numOf(tx.sizing && typeof tx.sizing === 'object' ? tx.sizing.value : null) ?? numOf(tx.lots);
    const pips = numOf(tx.pips);
    const gain = balanceBefore ? Math.round(pnl / balanceBefore * 10000) / 100 : null;
    const duration = openAt && closeAt ? fmtDuration(closeAt - openAt) : null;
    const mfx = { pips, lots, open, close, sl, tp, pnl, gain, duration,
      commission: numOf(tx.commission), swap: numOf(tx.interest), comment: tx.comment || '' };
    mfx.autoNotes = mfxNotes(tx, mfx);
    return {
      id: `mfx-${live.id}-${openS}-${symbol}-${open}`,
      date: (closeAt || openAt || new Date()).toISOString(),
      openAt: openAt ? openAt.toISOString() : null, closeAt: closeAt ? closeAt.toISOString() : null,
      pair, side, entry: open, sl, tp, rrTarget, rrActual,
      result: pnl > 0 ? 'TP' : pnl < 0 ? 'SL' : 'BE', pnl,
      tags: [], chartLink: null, notes: mfx.autoNotes, mfx,
      source: 'myfxbook', sourceLabel: live.name,
    };
  }
  // Solde juste avant chaque cloture, en remontant depuis le solde actuel (depots/retraits compris),
  // pour le « Gain » % de chaque position comme Myfxbook.
  function balancesBefore(history, balance) {
    const out = new Map();
    if (balance == null) return out;
    let bal = balance;
    history.map((tx, i) => ({ tx, i, at: parseMfxDate(pickOf(tx, 'closeTime', 'closeDate')) || parseMfxDate(pickOf(tx, 'openTime', 'openDate')) }))
      .sort((a, b) => (b.at || 0) - (a.at || 0))
      .forEach(({ tx, i }) => { bal -= numOf(tx.profit) || 0; out.set(i, bal); });
    return out;
  }

  // Lit Myfxbook (e-mail + mot de passe Myfxbook) : infos du compte + 50 dernières transactions, ajoutées à l'existant.
  async function syncLiveAccount(accountId, liveId) {
    const acc = listAccounts().find((a) => a.id === accountId);
    const live = liveAccounts(acc).find((l) => l.id === liveId);
    if (!live) throw new Error('Compte live introuvable.');
    if (!window.CHESTMyfxbook) throw new Error('Client Myfxbook non chargé.');
    const session = await window.CHESTMyfxbook.login(live.email, live.password);
    try {
      const accounts = await window.CHESTMyfxbook.getMyAccounts(session);
      const info = accounts.find((a) => String(a.id) === String(live.accountId));
      if (!info) throw new Error("Ce compte n'existe plus sur ton profil Myfxbook.");
      const history = (await window.CHESTMyfxbook.getHistory(session, live.accountId)).map((h) => (Array.isArray(h) ? h[0] : h)).filter(Boolean);
      const before = balancesBefore(history, numOf(info.balance));
      const isTrade = (tx) => /^(buy|sell)/i.test(String(tx.action || '')); // jamais un depot/retrait
      const res = mergeExternal(live.id, history.map((tx, i) => (isTrade(tx) ? mfxToEntry(tx, live, before.get(i)) : null)).filter((e) => e && e.pair), { limit: 50, refresh: true });
      updateLiveAccount(accountId, liveId, {
        lastSync: new Date().toISOString(), lastError: null, lastLimitReached: res.limitReached, possibleGap: res.possibleGap, firstBatch: res.firstBatch,
        info: { balance: numOf(info.balance), equity: numOf(info.equity), profit: numOf(info.profit), gain: numOf(info.gain), drawdown: numOf(info.drawdown), deposits: numOf(info.deposits), currency: info.currency || null, demo: info.demo === true || info.demo === 'true' },
      });
      updateActiveStageBalance(accountId, numOf(info.balance), liveId);
      return res;
    } finally {
      window.CHESTMyfxbook.logout(session);
    }
  }

  // Entrées d'UN journal, pour tout ou partie de sa famille : member = 'all' | 'main' | id d'un compte live.
  // Journal principal = saisie manuelle du compte (les anciennes entrées sans compte vont au plus ancien) + positions BERICH
  // (rattachées au premier journal manuel, comme avant). En vue agrégée, une saisie manuelle qui double une position d'un
  // compte live (même paire et même sens, à moins d'une heure) est masquée : le live prend le dessus.
  async function entriesFor(account, member) {
    const m = member || 'all';
    const accounts = listAccounts();
    const isAuto = account.mode === 'auto';
    let main = [];
    if (!isAuto && (m === 'all' || m === 'main')) {
      const manual = list().filter((e) => e.accountId === account.id || (!e.accountId && accounts[0] && accounts[0].id === account.id));
      const owner = accounts.find((a) => a.mode !== 'auto');
      const live = owner && owner.id === account.id ? await berichEntries() : [];
      main = [...manual, ...live];
    }
    let liveRows = [];
    liveAccounts(account).forEach((l) => {
      if (m === 'all' || m === l.id) liveRows = liveRows.concat(extEntries(l.id).map((e) => Object.assign({}, e, { liveId: l.id, sourceLabel: l.name })));
    });
    let hidden = 0;
    if (m === 'all' && liveRows.length && main.length) {
      main = main.filter((e) => {
        const t = new Date(e.date).getTime();
        const dup = e.source === 'manual' && liveRows.some((x) => x.pair === e.pair && x.side === e.side && Math.abs(new Date(x.date).getTime() - t) <= 3600000);
        if (dup) hidden++;
        return !dup;
      });
    }
    const rows = [...main, ...liveRows].map((e) => Object.assign({}, e, { accountId: account.id })).sort((a, b) => new Date(b.date) - new Date(a.date));
    rows.hiddenDuplicates = hidden;
    return rows;
  }

  // ---------- Stats — arithmétique directe (pas de simulation de capital,
  // pas de forfait sur le moteur de backtesting qui répond à un besoin
  // différent : projeter un capital, pas totaliser un P&L réel). BE est
  // compté à part (ni gagnant ni perdant), contrairement au moteur de
  // backtest qui le traite comme un gain — plus honnête pour un vrai journal.
  function computeStats(rows) {
    const closed = rows.filter((r) => r.result);
    const tp = closed.filter((r) => r.result === 'TP').length;
    const sl = closed.filter((r) => r.result === 'SL').length;
    const be = closed.filter((r) => r.result === 'BE').length;
    const decisive = tp + sl;
    const rrValues = closed.filter((r) => r.rrActual != null).map((r) => r.rrActual);
    const avgRR = rrValues.length ? Math.round((rrValues.reduce((s, v) => s + v, 0) / rrValues.length) * 100) / 100 : null;
    const pnlValues = closed.filter((r) => r.pnl != null).map((r) => r.pnl);
    const totalPnl = pnlValues.length ? Math.round(pnlValues.reduce((s, v) => s + v, 0) * 100) / 100 : null;
    return {
      total: rows.length, closed: closed.length, open: rows.length - closed.length,
      tp, sl, be,
      winRatePct: decisive ? Math.round((tp / decisive) * 1000) / 10 : null,
      avgRR, totalPnl,
    };
  }

  // ---------- Conditions propfirm/compte (façon "Trading Objectives" du Dashboard) ----------
  // Calculées uniquement sur les entrées manuelles rattachées à ce compte
  // (accountId) — les positions BERICH/backtest ne sont pas liées à un
  // compte de journal précis pour l'instant.
  function accountConditions(account, allRows) {
    if (!account || !account.rules) return null;
    const rows = allRows.filter((r) => r.accountId === account.id && r.result);
    const today = new Date().toDateString();
    const todayPnl = rows.filter((r) => new Date(r.date).toDateString() === today && r.pnl != null)
      .reduce((s, r) => s + r.pnl, 0);
    const totalPnl = rows.filter((r) => r.pnl != null).reduce((s, r) => s + r.pnl, 0);
    const tradingDays = new Set(rows.map((r) => new Date(r.date).toDateString())).size;
    const r = account.rules;

    const items = [];
    items.push({
      label: 'Perte journalière max', limit: `-${r.dailyLossPct}% (${(account.balance * r.dailyLossPct / 100).toFixed(0)}$)`,
      value: todayPnl, ok: todayPnl >= -(account.balance * r.dailyLossPct / 100),
    });
    items.push({
      label: 'Perte totale max', limit: `-${r.maxLossPct}% (${(account.balance * r.maxLossPct / 100).toFixed(0)}$)`,
      value: totalPnl, ok: totalPnl >= -(account.balance * r.maxLossPct / 100),
    });
    items.push({
      label: 'Objectif de profit', limit: `+${r.profitTargetPct}% (${(account.balance * r.profitTargetPct / 100).toFixed(0)}$)`,
      value: totalPnl, ok: totalPnl >= (account.balance * r.profitTargetPct / 100),
    });
    if (r.minDays) {
      items.push({ label: 'Jours de trading min.', limit: `${r.minDays} jours`, value: tradingDays, ok: tradingDays >= r.minDays, isCount: true });
    }
    return items;
  }

  window.CHESTJournal = {
    list, add, update, remove, berichEntries, allEntries, entriesFor, liveAccounts, addLiveAccount, updateLiveAccount, removeLiveAccount, syncLiveAccount, extEntries, mergeExternal, mfxToEntry, computeStats, importBacktestTrades,
    knownTags, rememberTag, favoritePairs, toggleFavoritePair,
    propfirms, challengeModels, stageList, stageRules, propfirmLogo,
    listAccounts, addAccount, updateAccount, removeAccount,
    activeAccountId, setActiveAccountId, getActiveAccount, riskAmountFor, accountConditions,
    attachStageAccount, setPayoutSplitPct, updateStagePayout, updateActiveStageBalance, stagePayouts, activeStageSegment, stageModelFor,
  };
})();
