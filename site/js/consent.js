// CHEST — Consentements (2026-10-30). Une fenêtre à cases à cocher, réutilisée pour :
//  · CHESTConsent.dialog(opts)   avant le paiement (offres.html) : CGV, accès immédiat + renonciation à la rétractation,
//                                risques. Le bouton reste grisé tant que toutes les cases ne sont pas cochées.
//  · CHESTConsent.ensureTerms()  nouvelle version des CGU (app.html) : bloquant tant que le membre n'a pas accepté.
//  · CHESTConsent.ensureEducator() règles du programme éducateur (educator.html), à la première ouverture.
// Chaque accord est enregistré côté serveur avec sa preuve (POST /me/consents, table user_consents).
(() => {
  'use strict';
  const A = window.CHESTAccounts;
  const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const doc = (slug, txt) => `<a href="/legal/${slug}" target="_blank" rel="noopener">${txt}</a>`;
  if (!document.getElementById('csCss')) {
    const st = document.createElement('style'); st.id = 'csCss';
    st.textContent = `
.cs{ position:fixed; inset:0; z-index:9000; display:grid; place-items:center; padding:16px; background:rgba(3,3,4,.78); backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px);
  font-family:"Instrument Sans", system-ui, sans-serif; color:#f6f6f7; animation:csFade .2s cubic-bezier(.16,1,.3,1); }
@keyframes csFade{ from{ opacity:0; } }
.cs-box{ width:min(520px,100%); max-height:calc(100dvh - 32px); overflow:auto; padding:26px; border-radius:24px; border:1px solid rgba(255,255,255,.1);
  background:linear-gradient(170deg, rgba(22,12,18,.96), rgba(8,8,10,.98)); box-shadow:0 40px 120px rgba(0,0,0,.7), 0 0 60px rgba(252,18,131,.08);
  animation:csIn .3s cubic-bezier(.16,1,.3,1); }
@keyframes csIn{ from{ opacity:0; transform:translateY(10px) scale(.985); } }
.cs-k{ font-size:10px; font-weight:600; letter-spacing:.22em; text-transform:uppercase; color:#5c5c63; }
.cs-box h2{ margin:10px 0 0; font-size:24px; font-weight:600; letter-spacing:-.035em; line-height:1.15; }
.cs-lead{ margin:10px 0 0; font-size:13.5px; line-height:1.6; color:#9b9ba1; }
.cs-checks{ display:grid; gap:8px; margin:20px 0 0; }
.cs-check{ position:relative; display:flex; gap:12px; align-items:flex-start; padding:12px 14px; border-radius:14px; cursor:pointer; text-align:left;
  border:1px solid rgba(255,255,255,.1); background:rgba(255,255,255,.025); font-size:13px; line-height:1.55; color:#c9c9ce; transition:border-color .2s, background .2s; }
.cs-check:hover{ border-color:rgba(255,255,255,.18); }
.cs-check input{ position:absolute; opacity:0; width:1px; height:1px; }
.cs-box__b{ flex-shrink:0; width:20px; height:20px; margin-top:1px; border-radius:6px; border:1.5px solid rgba(255,255,255,.28); display:grid; place-items:center; transition:background .18s, border-color .18s; }
.cs-box__b svg{ width:12px; height:12px; fill:none; stroke:#fff; stroke-width:3; stroke-linecap:round; stroke-linejoin:round; opacity:0; transform:scale(.6); transition:opacity .18s, transform .18s cubic-bezier(.16,1,.3,1); }
.cs-check input:checked + .cs-box__b{ background:linear-gradient(135deg,#fc1283,#f9a45e); border-color:transparent; }
.cs-check input:checked + .cs-box__b svg{ opacity:1; transform:none; }
.cs-check input:focus-visible + .cs-box__b{ outline:2px solid rgba(252,18,131,.6); outline-offset:2px; }
.cs-check:has(input:checked){ border-color:rgba(252,18,131,.35); background:rgba(252,18,131,.05); }
.cs-check a{ color:#f6f6f7; text-decoration:underline; text-decoration-color:rgba(252,18,131,.5); text-underline-offset:2px; }
.cs-check b{ color:#f6f6f7; font-weight:600; }
.cs-err{ min-height:1em; margin:12px 0 0; font-size:12.5px; color:#ff4d5e; }
.cs-err:empty{ display:none; }
.cs-foot{ display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-top:20px; }
.cs-cta{ font:inherit; flex:1; min-height:48px; padding:0 22px; border:none; border-radius:999px; cursor:pointer; font-size:14.5px; font-weight:600; color:#fff;
  background:linear-gradient(135deg,#fc1283,#f9a45e); box-shadow:0 14px 40px rgba(252,18,131,.3); transition:transform .16s cubic-bezier(.16,1,.3,1), opacity .2s, box-shadow .2s; }
.cs-cta:active{ transform:scale(.98); }
.cs-cta:disabled{ opacity:.35; cursor:not-allowed; box-shadow:none; transform:none; }
.cs-alt{ font:inherit; background:none; border:none; padding:10px 4px; font-size:13px; color:#9b9ba1; cursor:pointer; text-decoration:none; }
.cs-alt:hover{ color:#f6f6f7; }
.cs-note{ margin:14px 0 0; font-size:11.5px; line-height:1.5; color:#5c5c63; text-align:center; }
@media (prefers-reduced-motion:reduce){ .cs, .cs-box{ animation:none; } }`;
    document.head.appendChild(st);
  }

  // opts : { kicker, title, lead, checks: [html…], cta, alt (texte du bouton secondaire, null = aucun), altHref, note, onConfirm }
  // → Promise<boolean>. onConfirm(async) peut lever une erreur : elle s'affiche et la fenêtre reste ouverte.
  function dialog(o) {
    return new Promise((resolve) => {
      const prev = document.activeElement;
      const el = document.createElement('div');
      el.className = 'cs';
      el.innerHTML = `<div class="cs-box" role="dialog" aria-modal="true" aria-labelledby="csH">
        ${o.kicker ? `<span class="cs-k">${o.kicker}</span>` : ''}<h2 id="csH">${o.title}</h2>${o.lead ? `<p class="cs-lead">${o.lead}</p>` : ''}
        <div class="cs-checks">${o.checks.map((c, i) => `<label class="cs-check"><input type="checkbox" data-i="${i}"><span class="cs-box__b">${CHECK}</span><span>${c}</span></label>`).join('')}</div>
        <p class="cs-err" role="alert"></p>
        <div class="cs-foot">${o.alt === null ? '' : o.altHref ? `<a class="cs-alt" href="${o.altHref}">${o.alt}</a>` : `<button type="button" class="cs-alt" data-cs="no">${o.alt || 'Annuler'}</button>`}
          <button type="button" class="cs-cta" data-cs="yes" disabled>${o.cta}</button></div>
        ${o.note ? `<p class="cs-note">${o.note}</p>` : ''}</div>`;
      document.body.appendChild(el);
      const boxes = [...el.querySelectorAll('input[type="checkbox"]')], cta = el.querySelector('[data-cs="yes"]'), err = el.querySelector('.cs-err');
      const sync = () => { cta.disabled = !boxes.every((b) => b.checked); };
      boxes.forEach((b) => b.addEventListener('change', sync));
      setTimeout(() => boxes[0] && boxes[0].focus(), 50);
      const done = (v) => { el.remove(); document.removeEventListener('keydown', onKey); if (prev && prev.focus) prev.focus(); resolve(v); };
      const onKey = (e) => { if (e.key === 'Escape' && o.alt !== null) done(false); };
      document.addEventListener('keydown', onKey);
      el.addEventListener('click', async (e) => {
        if (e.target.closest('[data-cs="no"]')) { done(false); return; }
        if (!e.target.closest('[data-cs="yes"]') || cta.disabled) return;
        cta.disabled = true; err.textContent = '';
        try { if (o.onConfirm) await o.onConfirm(); done(true); }
        catch (x) { err.textContent = x.message || 'Enregistrement impossible, réessaie.'; cta.disabled = false; }
      });
    });
  }

  async function post(body) {
    const r = await fetch(A.apiBase() + '/me/consents', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + A.getToken() }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Enregistrement impossible, réessaie.');
    return d;
  }
  async function me() {
    const r = await fetch(A.apiBase() + '/me', { headers: { Authorization: 'Bearer ' + A.getToken() } });
    if (!r.ok) return null;
    const d = await r.json();
    return d.user || d;
  }

  // Avant le paiement d'une offre. Résout true quand l'accord est enregistré (on peut alors ouvrir Stripe).
  function purchase(offer) {
    const eur = (n) => Number(n).toLocaleString('fr-FR') + ' €';
    const dur = offer.months === 12 ? '1 an' : `${offer.months} mois`;
    return dialog({
      kicker: 'Avant le paiement', title: `${offer.name} · ${eur(offer.price)}`,
      lead: `${dur} d’accès, payé une fois, <b>sans renouvellement automatique</b>. Paiement sécurisé par Stripe : CHEST ne voit jamais ta carte.`,
      checks: [
        `J’ai lu et j’accepte les ${doc('cgv', 'conditions générales de vente')} et la ${doc('remboursement', 'politique de remboursement')}.`,
        `Je demande l’<b>accès immédiat</b> à CHEST et je reconnais <b>renoncer à mon droit de rétractation</b> de 14 jours dès l’ouverture de l’accès (article L221-28 du Code de la consommation).`,
        `J’ai compris que le trading comporte un <b>risque de perte en capital</b> et que CHEST ne donne pas de conseil en investissement (${doc('risques', 'avertissement')}).`,
      ],
      cta: `Payer ${eur(offer.price)} avec Stripe`, alt: 'Annuler',
      onConfirm: () => post({ kind: 'purchase', detail: { offer: offer.key, price: offer.price, months: offer.months, cgv: true, immediate: true, risks: true } }),
    });
  }

  // Nouvelle version des CGU : bloquant (seule sortie : se déconnecter).
  async function ensureTerms() {
    if (!A || !A.isLoggedIn()) return;
    const u = await me().catch(() => null);
    if (!u || !u.terms || u.terms.accepted === u.terms.current) return;
    const first = !u.terms.accepted;
    await dialog({
      kicker: first ? 'Documents légaux' : 'Mise à jour', title: first ? 'Nos règles, avant de continuer' : 'Nos conditions évoluent',
      lead: first ? 'CHEST se dote de conditions d’utilisation et d’une politique de confidentialité. Prends une minute pour les lire : ton accord est nécessaire pour continuer.'
        : 'Une nouvelle version de nos documents est en ligne. Ton accès et son prix ne changent pas.',
      checks: [`J’ai 18 ans ou plus et j’accepte les ${doc('cgu', 'conditions d’utilisation')}, la ${doc('confidentialite', 'politique de confidentialité')} et l’${doc('risques', 'avertissement sur les risques')}.`],
      cta: 'Accepter et continuer', alt: 'Me déconnecter', note: 'Tous les documents : <a href="/legal" target="_blank" rel="noopener">ch3st.app/legal</a>',
      onConfirm: async () => { await post({ kind: 'terms' }); if (A.refreshMe) await A.refreshMe().catch(() => {}); },
    }).then((ok) => { if (!ok) { A.logout(); location.href = '/connexion'; } });
  }

  // Règles du programme éducateur, à la première ouverture de l'espace éducateur (et à chaque nouvelle version).
  async function ensureEducator() {
    if (!A || !A.isLoggedIn() || new URLSearchParams(location.search).get('educator')) return;
    const u = await me().catch(() => null);
    if (!u || u.role !== 'educator' || !u.terms || u.terms.eduAccepted === u.terms.eduCurrent) return;
    await dialog({
      kicker: 'Programme éducateur', title: 'Avant de partager ton lien',
      lead: 'Tu vas parler de CHEST et accompagner des membres. Quelques règles protègent tes membres, CHEST et toi.',
      checks: [
        `J’accepte les ${doc('programme-educateur', 'règles du programme éducateur')} : pas de promesse de gains, pas de conseil personnalisé, et la mention <b>« Publicité »</b> sur mes publications qui font la promotion de CHEST.`,
        `J’ai lu la ${doc('revenus-educateurs', 'déclaration sur les revenus des éducateurs')} : <b>aucun revenu n’est garanti</b>, et mes commissions sont à déclarer.`,
      ],
      cta: 'J’accepte', alt: 'Retour au Dashboard',
      onConfirm: () => post({ kind: 'educator' }),
    }).then((ok) => {
      if (ok) return;
      const sh = window.parent !== window && window.parent.CHESTShell;
      if (sh && sh.go) sh.go('dashboard', ''); else location.href = '/dashboard';
    });
  }

  window.CHESTConsent = { dialog, purchase, ensureTerms, ensureEducator };
})();
