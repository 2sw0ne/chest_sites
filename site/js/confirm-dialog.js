// CHEST · Confirm/Alert — remplace window.confirm()/window.alert() natifs,
// qui ne fonctionnent pas dans ce panneau d'apercu integre (bouton sans
// aucun effet visible pour l'utilisateur, constate en direct le 2026-09-15
// sur la fonction "Nouvelle famille" du Dashboard, qui utilisait
// window.prompt() — meme defaillance pour confirm()/alert()). Meme principe
// d'auto-injection que js/lot-calculator.js : a inclure sur n'importe quelle
// page qui a besoin de confirmer/alerter, aucun HTML a ajouter cote page.
(() => {
  'use strict';

  const STYLE = `
    .chestconfirm-overlay{
      position:fixed; inset:0; z-index:400; background:rgba(0,0,0,.6); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px);
      display:flex; align-items:center; justify-content:center; padding:24px; opacity:0; pointer-events:none; transition:opacity .2s;
    }
    .chestconfirm-overlay.is-open{ opacity:1; pointer-events:auto; }
    .chestconfirm-modal{
      width:100%; max-width:400px; background:var(--panel); border:1px solid var(--line2);
      border-radius:var(--radius); padding:24px; transform:translateY(12px); transition:transform .2s;
    }
    .chestconfirm-overlay.is-open .chestconfirm-modal{ transform:translateY(0); }
    .chestconfirm-modal p{ font-size:13.5px; color:var(--ink); line-height:1.55; margin:0 0 20px; white-space:pre-line; }
    .chestconfirm-actions{ display:flex; gap:10px; justify-content:flex-end; }
    .chestconfirm-modal input{
      width:100%; box-sizing:border-box; background:var(--bg); border:1px solid var(--line2); border-radius:var(--radius-sm);
      color:var(--ink); font:inherit; font-size:13.5px; padding:10px 12px; margin:-8px 0 20px;
    }
  `;

  function injectStyles() {
    if (document.getElementById('chestconfirm-style')) return;
    const style = document.createElement('style');
    style.id = 'chestconfirm-style';
    style.textContent = STYLE;
    document.head.appendChild(style);
  }

  let overlay, msgEl, actionsEl;
  function ensure() {
    if (overlay) return;
    injectStyles();
    overlay = document.createElement('div');
    overlay.className = 'chestconfirm-overlay';
    overlay.innerHTML = `
      <div class="chestconfirm-modal">
        <p id="chestconfirmMsg"></p>
        <div class="chestconfirm-actions" id="chestconfirmActions"></div>
      </div>`;
    document.body.appendChild(overlay);
    msgEl = overlay.querySelector('#chestconfirmMsg');
    actionsEl = overlay.querySelector('#chestconfirmActions');
  }

  // Remplace window.confirm(message) - resout true/false selon le bouton choisi.
  function chestConfirm(message, opts) {
    ensure();
    opts = opts || {};
    msgEl.textContent = message;
    return new Promise((resolve) => {
      actionsEl.innerHTML = '';
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button'; cancelBtn.className = 'btn btn-ghost'; cancelBtn.textContent = opts.cancelLabel || 'Annuler';
      const okBtn = document.createElement('button');
      okBtn.type = 'button'; okBtn.className = 'btn btn-primary'; okBtn.textContent = opts.confirmLabel || 'Confirmer';
      const close = (val) => { overlay.classList.remove('is-open'); resolve(val); };
      cancelBtn.addEventListener('click', () => close(false));
      okBtn.addEventListener('click', () => close(true));
      actionsEl.append(cancelBtn, okBtn);
      overlay.classList.add('is-open');
      okBtn.focus();
    });
  }

  // Remplace window.prompt(message) - resout la valeur tapee, ou null si annule. opts.value
  // prereplit le champ (ex. renommer un compte).
  function chestPrompt(message, opts) {
    ensure();
    opts = opts || {};
    msgEl.textContent = message;
    return new Promise((resolve) => {
      actionsEl.innerHTML = '';
      const input = document.createElement('input');
      input.type = 'text';
      input.value = opts.value || '';
      msgEl.insertAdjacentElement('afterend', input);
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button'; cancelBtn.className = 'btn btn-ghost'; cancelBtn.textContent = opts.cancelLabel || 'Annuler';
      const okBtn = document.createElement('button');
      okBtn.type = 'button'; okBtn.className = 'btn btn-primary'; okBtn.textContent = opts.confirmLabel || 'Valider';
      const close = (val) => { overlay.classList.remove('is-open'); input.remove(); resolve(val); };
      cancelBtn.addEventListener('click', () => close(null));
      okBtn.addEventListener('click', () => close(input.value));
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') close(input.value); });
      actionsEl.append(cancelBtn, okBtn);
      overlay.classList.add('is-open');
      input.focus();
      input.select();
    });
  }

  // Remplace window.alert(message) - resout une fois "OK" clique.
  function chestAlert(message) {
    ensure();
    msgEl.textContent = message;
    return new Promise((resolve) => {
      actionsEl.innerHTML = '';
      const okBtn = document.createElement('button');
      okBtn.type = 'button'; okBtn.className = 'btn btn-primary'; okBtn.textContent = 'OK';
      okBtn.addEventListener('click', () => { overlay.classList.remove('is-open'); resolve(); });
      actionsEl.append(okBtn);
      overlay.classList.add('is-open');
      okBtn.focus();
    });
  }

  window.CHESTConfirm = chestConfirm;
  window.CHESTPrompt = chestPrompt;
  window.CHESTAlert = chestAlert;
})();
