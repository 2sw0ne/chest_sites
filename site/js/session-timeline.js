// CHEST · Timeline des sessions de trading (façon babypips.com/tools/forex-
// market-hours) — purement calculée côté client (heures fixes UTC), aucune
// donnée externe nécessaire. Ne gère pas les changements d'heure d'été de
// chaque place (Sydney/Londres/New York ne basculent pas aux mêmes dates) :
// les horaires ci-dessous sont ceux, standards, en UTC toute l'année — un
// léger décalage (±1h) est possible autour des changements d'heure, comme
// sur la plupart des outils grand public équivalents.
//
// REFONTE (2026-09-16, retour direct utilisateur) :
// - Fuseau horaire choisi dans les réglages (account.html, clé localStorage
//   `chest_timezone` — "auto" ou un identifiant IANA style "Europe/Paris"),
//   pas seulement celui de l'appareil. Le décalage est recalculé en direct
//   via Intl.DateTimeFormat (gère le changement d'heure d'été tout seul,
//   contrairement à un offset fixe codé en dur).
// - Un seul curseur "maintenant" traverse les 4 pistes (grid-row en span
//   dans le CSS) au lieu d'un trait par session. Déplaçable à la souris/au
//   doigt (façon babypips) : le ciel/titre suivent l'heure visée et une
//   ligne en bas affiche la volatilité estimée à cet instant.
//
// REFONTE 2 (2026-09-16, 2e retour direct - "trop de texte qu'on ne va pas
// lire") :
// - Le ciel jour/nuit occupe TOUT le haut de la card, bord à bord (plus de
//   pavé encadré) - voir dashboard.html (.sesstl-sky, .sesstl-body).
// - Vrai lever/coucher de soleil : la couleur du ciel est interpolée en
//   continu heure par heure (nuit -> aube orangée -> jour -> crépuscule
//   orangé -> nuit), pas un simple bascule jour/nuit à 6h/18h.
// - Les gros pavés de texte (volatilité détaillée, prochain chevauchement,
//   note de fuseau) sont remplacés par UNE ligne : un point de couleur +
//   niveau + 3 mots de contexte ("Ouverture Wall Street", etc.).
// - Le titre de la session en cours est agrandi, même traitement typo que
//   "BERICH" (gras 800, très serré).
// - Plus de bouton "revenir à maintenant" : au relâchement du curseur, retour
//   instantané au direct (pas de délai, pas d'animation).
// - Pendant le glisser, les transitions CSS du ciel/soleil/lune sont coupées
//   (classe .is-scrubbing) pour qu'ils suivent le pointeur au pixel près, au
//   lieu de "rattraper" en retard avec l'easing .8s prévu pour les mises à
//   jour au repos (retour direct utilisateur du 2026-09-16 : fluidité
//   catastrophique sinon).
(() => {
  'use strict';

  const TZ_KEY = 'chest_timezone';

  // [debut, fin] en heures UTC (0-24) - Sydney/Tokyo passent minuit, geres a
  // part. "flag" est un code ISO pour flag-icons (site/css), PAS un emoji
  // drapeau - un emoji regional s'affiche en texte brut ("AU", "JP"...) sur
  // Windows, piege deja documente sur ce projet.
  const SESSIONS = [
    { name: 'Sydney', flag: 'au', start: 22, end: 7, color: '#f9a45e' },
    { name: 'Tokyo', flag: 'jp', start: 0, end: 9, color: '#5470c2' },
    { name: 'Londres', flag: 'gb', start: 8, end: 17, color: '#33e6a6' },
    { name: 'New York', flag: 'us', start: 13, end: 22, color: '#fc1283' },
  ];

  // Meme liste que le selecteur de account.html (etiquettes courtes ici,
  // juste pour l'affichage interne du fuseau choisi).
  const TZ_LABELS = {
    'Europe/Paris': 'Paris', 'Europe/London': 'Londres', 'Europe/Zurich': 'Zurich',
    'Europe/Moscow': 'Moscou', 'America/New_York': 'New York', 'America/Chicago': 'Chicago',
    'America/Los_Angeles': 'Los Angeles', 'America/Toronto': 'Toronto', 'America/Sao_Paulo': 'São Paulo',
    'Asia/Tokyo': 'Tokyo', 'Asia/Hong_Kong': 'Hong Kong', 'Asia/Singapore': 'Singapour',
    'Asia/Dubai': 'Dubaï', 'Asia/Kolkata': 'Mumbai', 'Australia/Sydney': 'Sydney',
    'Pacific/Auckland': 'Auckland', 'Africa/Johannesburg': 'Johannesburg',
  };

  // Description courte ("3 mots") de la combinaison de sessions ouvertes -
  // volontairement editorial plutot qu'une simple liste de noms, ex.
  // "Ouverture Wall Street" pour Londres+New York (retour direct utilisateur
  // du 2026-09-16, exemple donne tel quel).
  const VIBE_LABELS = {
    '': 'Marché calme',
    'Sydney': 'Séance Sydney calme',
    'Tokyo': 'Séance asiatique active',
    'Sydney+Tokyo': 'Chevauchement Asie-Pacifique',
    'Londres': 'Séance européenne active',
    'Londres+Tokyo': 'Transition Asie-Europe',
    'Londres+New York': 'Ouverture Wall Street',
    'New York': 'Séance new-yorkaise active',
    'New York+Sydney': 'Transition Amérique-Océanie',
  };

  function getTz() {
    try { return localStorage.getItem(TZ_KEY) || 'auto'; } catch (e) { return 'auto'; }
  }

  // Heure locale (0-24, fractionnaire) + decalage vs UTC (heures, fractionnaire
  // - gere les fuseaux a demi-heure) pour le fuseau choisi. "auto" = fuseau de
  // l'appareil (Date natif) ; sinon Intl.DateTimeFormat avec ce fuseau, qui
  // applique automatiquement l'heure d'ete en vigueur a CET instant.
  function tzInfo(tzValue) {
    const now = new Date();
    const utcHour = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;

    if (!tzValue || tzValue === 'auto') {
      const localHour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
      const offsetMin = -now.getTimezoneOffset();
      const offsetHours = offsetMin / 60;
      return {
        localHour, offsetHours,
        label: `ton fuseau (UTC${offsetHours >= 0 ? '+' : ''}${offsetHours.toFixed(offsetHours % 1 ? 1 : 0)})`,
      };
    }
    try {
      const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: tzValue, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      const parts = fmt.formatToParts(now).reduce((o, p) => { o[p.type] = p.value; return o; }, {});
      let hh = parseInt(parts.hour, 10); if (Number.isNaN(hh) || hh === 24) hh = 0;
      const mm = parseInt(parts.minute, 10) || 0;
      const ss = parseInt(parts.second, 10) || 0;
      const localHour = hh + mm / 60 + ss / 3600;
      let offsetHours = localHour - utcHour;
      if (offsetHours > 14) offsetHours -= 24;
      if (offsetHours < -14) offsetHours += 24;
      const cityLabel = TZ_LABELS[tzValue] || tzValue.split('/').pop().replace(/_/g, ' ');
      return {
        localHour, offsetHours,
        label: `${cityLabel} (UTC${offsetHours >= 0 ? '+' : ''}${offsetHours.toFixed(offsetHours % 1 ? 1 : 0)})`,
      };
    } catch (e) {
      // fuseau invalide/non supporte par le navigateur -> retombe sur l'appareil
      return tzInfo('auto');
    }
  }

  function shiftToLocal(hourUtc, offsetHours) {
    return ((hourUtc + offsetHours) % 24 + 24) % 24;
  }

  // Segments d'une session sur l'axe 0-24 (une session qui passe minuit,
  // comme Sydney 22->7, se decoupe en deux segments pour l'affichage).
  // Generique : fonctionne pour n'importe quelle paire start/end dans le meme
  // referentiel (UTC ou heure locale decalee), pas seulement UTC.
  function segments(start, end) {
    if (start < end) return [[start, end]];
    return [[start, 24], [0, end]];
  }

  function isOpen(start, end, hour) {
    if (start < end) return hour >= start && hour < end;
    return hour >= start || hour < end;
  }

  // Prochaine heure (0-24, peut depasser 24 pour rester dans le futur) a
  // laquelle cette session change d'etat (ouvre ou ferme).
  function nextChangeHour(start, end, hour) {
    const open = isOpen(start, end, hour);
    const boundary = open ? end : start;
    let delta = boundary - hour;
    if (delta <= 0) delta += 24;
    return delta;
  }

  function fmtCountdown(hours) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    if (h <= 0) return `${m}min`;
    return `${h}h${m ? String(m).padStart(2, '0') : ''}`;
  }

  function fmtHM(hourFloat) {
    let h = Math.floor(((hourFloat % 24) + 24) % 24);
    let m = Math.round((hourFloat - Math.floor(hourFloat)) * 60);
    if (m === 60) { m = 0; h = (h + 1) % 24; }
    return `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}`;
  }

  // Sessions ouvertes a une heure locale donnee (memes bornes shiftees que
  // celles utilisees pour dessiner les barres, pour rester coherent avec ce
  // que l'oeil voit sur le graphique).
  function sessionsOpenAtLocal(hourLocal, offsetHours) {
    return SESSIONS.filter((s) => isOpen(shiftToLocal(s.start, offsetHours), shiftToLocal(s.end, offsetHours), hourLocal));
  }

  function vibeLabel(openNames) {
    const key = openNames.slice().sort().join('+');
    return VIBE_LABELS[key] || (openNames.length ? openNames.join(' + ') : 'Marché calme');
  }

  // Position du soleil/lune sur son demi-arc (t: 0->1) - decoupage stylise
  // 6h-18h = jour / 18h-6h = nuit, PAS un vrai calcul de lever/coucher par
  // ville (assume, pas presente comme une donnee astro reelle).
  function skyBodyPos(hourLocal) {
    const DAY_START = 6, DAY_END = 18;
    let isDay, t;
    if (hourLocal >= DAY_START && hourLocal < DAY_END) {
      isDay = true;
      t = (hourLocal - DAY_START) / (DAY_END - DAY_START);
    } else {
      isDay = false;
      const h = hourLocal < DAY_START ? hourLocal + 24 : hourLocal;
      t = (h - DAY_END) / (24 - (DAY_END - DAY_START));
    }
    return { isDay, t: Math.min(1, Math.max(0, t)) };
  }

  // ----- Degrade continu du ciel (vrai lever/coucher de soleil) -----
  // 4 "heures cles" (nuit / aube / plein jour / crepuscule), chacune un trio
  // de couleurs [haut, milieu, bas]. La couleur affichee a une heure donnee
  // est interpolee lineairement entre les deux heures cles encadrantes -
  // c'est ce qui fait passer le ciel du bleu nuit a l'orange puis au bleu
  // jour de façon continue, au lieu d'un bascule net (retour direct
  // utilisateur du 2026-09-16).
  const SKY_KEYFRAMES = [
    { h: 0, top: [8, 12, 34], mid: [16, 24, 56], bot: [27, 38, 80] },       // nuit profonde
    { h: 5, top: [10, 14, 38], mid: [20, 28, 64], bot: [34, 44, 92] },      // fin de nuit
    { h: 6.5, top: [45, 70, 120], mid: [214, 130, 96], bot: [255, 205, 160] }, // aube
    { h: 8, top: [28, 79, 143], mid: [79, 137, 201], bot: [207, 232, 243] },   // matin
    { h: 16, top: [28, 79, 143], mid: [79, 137, 201], bot: [207, 232, 243] },  // apres-midi
    { h: 17.5, top: [40, 58, 104], mid: [212, 110, 78], bot: [255, 175, 120] }, // crepuscule
    { h: 19, top: [12, 17, 44], mid: [24, 32, 68], bot: [38, 50, 96] },     // debut de nuit
    { h: 24, top: [8, 12, 34], mid: [16, 24, 56], bot: [27, 38, 80] },      // boucle sur minuit
  ];
  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerpRgb(c1, c2, t) { return [0, 1, 2].map((i) => Math.round(lerp(c1[i], c2[i], t))); }
  function skyColorsAt(hourLocal) {
    const h = ((hourLocal % 24) + 24) % 24;
    let a = SKY_KEYFRAMES[0], b = SKY_KEYFRAMES[SKY_KEYFRAMES.length - 1];
    for (let i = 0; i < SKY_KEYFRAMES.length - 1; i++) {
      if (h >= SKY_KEYFRAMES[i].h && h <= SKY_KEYFRAMES[i + 1].h) { a = SKY_KEYFRAMES[i]; b = SKY_KEYFRAMES[i + 1]; break; }
    }
    const span = b.h - a.h;
    const t = span ? (h - a.h) / span : 0;
    return { top: lerpRgb(a.top, b.top, t), mid: lerpRgb(a.mid, b.mid, t), bot: lerpRgb(a.bot, b.bot, t) };
  }
  // Opacite des etoiles - pleine la nuit, s'efface pendant l'aube/le
  // crepuscule, nulle en plein jour (memes bornes que le degrade du ciel).
  function starsOpacityAt(hourLocal) {
    const h = ((hourLocal % 24) + 24) % 24;
    if (h <= 5) return 1;
    if (h <= 8) return 1 - (h - 5) / 3;
    if (h <= 16) return 0;
    if (h <= 19) return (h - 16) / 3;
    return 1;
  }

  function render(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;

    let dragging = false;
    let pinnedHour = null; // null = suit l'heure reelle ; sinon heure locale "epinglee" pendant le glisser
    let currentOffset = 0;

    function wrapEl() { return el.querySelector('.sesstl-nowline-wrap'); }
    function hourFromClientX(clientX) {
      const w = wrapEl();
      if (!w) return 0;
      const rect = w.getBoundingClientRect();
      const frac = rect.width ? (clientX - rect.left) / rect.width : 0;
      return Math.min(1, Math.max(0, frac)) * 24;
    }

    function setScrubbing(on) {
      const sky = el.querySelector('.sesstl-sky');
      if (sky) sky.classList.toggle('is-scrubbing', on);
    }

    // Met a jour uniquement les elements dependants de "l'heure affichee"
    // (ciel, curseur, ligne de volatilite) sans reconstruire tout le DOM -
    // utilise pendant le glisser pour rester fluide.
    function updateDynamic(hour, offsetHours, pinned) {
      const sky = el.querySelector('.sesstl-sky');
      const stars = el.querySelector('.sesstl-sky__stars');
      const body = el.querySelector('.sesstl-sky__body');
      const titleEl = el.querySelector('.sesstl-sky__title');
      const timeEl = el.querySelector('.sesstl-sky__time');
      const line = el.querySelector('.sesstl-nowline');
      const vibeDot = el.querySelector('.sesstl-vibe__dot');
      const vibeLevel = el.querySelector('.sesstl-vibe__level');
      const vibeLabelEl = el.querySelector('.sesstl-vibe__label');
      if (!sky || !body || !line) return;

      line.style.left = `${(hour / 24) * 100}%`;
      line.classList.toggle('is-pinned', pinned);

      const { isDay, t } = skyBodyPos(hour);
      const c = skyColorsAt(hour);
      sky.style.background = `linear-gradient(180deg, rgb(${c.top}) 0%, rgb(${c.mid}) 55%, rgb(${c.bot}) 100%)`;
      if (stars) stars.style.opacity = String(starsOpacityAt(hour));
      body.classList.toggle('is-sun', isDay);
      body.classList.toggle('is-moon', !isDay);
      const ARC_HEIGHT = 78; // px - hauteur utile de l'arc au-dessus de l'horizon (voir .sesstl-sky__horizon)
      body.style.left = `${t * 100}%`;
      body.style.bottom = `${18 + Math.sin(t * Math.PI) * ARC_HEIGHT}px`;

      const openNow = sessionsOpenAtLocal(hour, offsetHours);
      const title = openNow.length ? openNow.map((s) => s.name).join(' + ') : 'Marché calme';
      if (titleEl) { titleEl.textContent = title; titleEl.classList.toggle('is-preview', pinned); }
      if (timeEl) timeEl.textContent = fmtHM(hour);

      const level = openNow.length >= 2 ? 'high' : openNow.length === 1 ? 'medium' : 'low';
      const levelLabel = level === 'high' ? 'Élevée' : level === 'medium' ? 'Moyenne' : 'Faible';
      if (vibeDot) vibeDot.className = `sesstl-vibe__dot level-${level}`;
      if (vibeLevel) vibeLevel.textContent = levelLabel;
      if (vibeLabelEl) vibeLabelEl.textContent = vibeLabel(openNow.map((s) => s.name));
    }

    function paintFull() {
      const info = tzInfo(getTz());
      currentOffset = info.offsetHours;
      const liveLocalHour = info.localHour;
      const displayHour = pinnedHour !== null ? pinnedHour : liveLocalHour;

      // Les pistes/compte a rebours restent sur l'heure REELLE (semantique
      // "maintenant") meme si le curseur est epingle ailleurs pour explorer.
      const rows = SESSIONS.map((s, i) => {
        const gridRow = i + 1;
        const ls = shiftToLocal(s.start, currentOffset);
        const le = shiftToLocal(s.end, currentOffset);
        const open = isOpen(ls, le, liveLocalHour);
        const segs = segments(ls, le).map(([a, b]) =>
          `<div class="sesstl-seg" style="left:${(a / 24) * 100}%;width:${((b - a) / 24) * 100}%;background:linear-gradient(90deg,${s.color},${s.color}cc)"></div>`
        ).join('');
        const delta = nextChangeHour(ls, le, liveLocalHour);
        const statusText = open ? `Ferme dans ${fmtCountdown(delta)}` : `Ouvre dans ${fmtCountdown(delta)}`;
        return `
          <div class="sesstl-label" style="grid-row:${gridRow}"><span class="fi fi-${s.flag} sesstl-flag"></span>${s.name}<span class="sesstl-dot ${open ? 'is-open' : ''}" style="${open ? `background:${s.color};box-shadow:0 0 0 3px ${s.color}29` : ''}"></span></div>
          <div class="sesstl-track" style="grid-row:${gridRow}">${segs}</div>
          <div class="sesstl-status ${open ? 'is-open' : ''}" style="grid-row:${gridRow}">${statusText}</div>`;
      }).join('');

      const ticks = [0, 4, 8, 12, 16, 20, 24].map((h) =>
        `<span style="left:${(h / 24) * 100}%">${String(h % 24).padStart(2, '0')}h</span>`
      ).join('');

      el.innerHTML = `
        <div class="sesstl-sky">
          <div class="sesstl-sky__stars"></div>
          <svg class="sesstl-sky__arc" viewBox="0 0 100 40" preserveAspectRatio="none"><path d="M0,38 Q50,-6 100,38"></path></svg>
          <div class="sesstl-sky__horizon"></div>
          <div class="sesstl-sky__body"></div>
          <div class="sesstl-sky__content">
            <div class="sesstl-sky__title"></div>
            <div class="sesstl-sky__time"></div>
          </div>
        </div>
        <div class="sesstl-body">
          <div class="sesstl">
            ${rows}
            <div class="sesstl-nowline-wrap" style="grid-row:1 / span ${SESSIONS.length}"><div class="sesstl-nowline"><span class="sesstl-nowline__tick"></span><span class="sesstl-nowline__handle"></span></div></div>
            <div style="grid-row:${SESSIONS.length + 1}"></div><div class="sesstl-axis" style="grid-row:${SESSIONS.length + 1}">${ticks}</div><div style="grid-row:${SESSIONS.length + 1}"></div>
          </div>
          <div class="sesstl-vibe">
            <span class="sesstl-vibe__dot"></span>
            <span class="sesstl-vibe__level"></span>
            <span class="sesstl-vibe__sep">–</span>
            <span class="sesstl-vibe__label"></span>
          </div>
        </div>`;

      updateDynamic(displayHour, currentOffset, pinnedHour !== null);
    }

    el.addEventListener('pointerdown', (e) => {
      const wrap = e.target.closest('.sesstl-nowline-wrap');
      if (!wrap) return;
      e.preventDefault();
      dragging = true;
      setScrubbing(true); // coupe les transitions CSS : le soleil/la lune doivent suivre le pointeur au pixel pres, pas avec un retard de .8s
      try { wrap.setPointerCapture(e.pointerId); } catch (err) { /* tant pis */ }
      pinnedHour = hourFromClientX(e.clientX);
      updateDynamic(pinnedHour, currentOffset, true);
    });
    el.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      pinnedHour = hourFromClientX(e.clientX);
      updateDynamic(pinnedHour, currentOffset, true);
    });
    // Au relachement : retour INSTANTANE au direct (pas de delai, pas
    // d'animation - retour direct utilisateur du 2026-09-16). La classe
    // "is-scrubbing" (donc transition:none) reste active pour ce saut, puis
    // est retiree juste apres pour que les prochaines mises a jour "au repos"
    // (tick de 60s) redeviennent animees normalement.
    function endDrag() {
      if (!dragging) return;
      dragging = false;
      pinnedHour = null;
      const info = tzInfo(getTz());
      currentOffset = info.offsetHours;
      updateDynamic(info.localHour, currentOffset, false);
      setScrubbing(false);
    }
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);

    paintFull();
    setInterval(() => { if (pinnedHour === null) paintFull(); }, 60000);
  }

  window.CHESTSessionTimeline = { render };
})();
