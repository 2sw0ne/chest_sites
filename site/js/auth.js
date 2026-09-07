(() => {
  'use strict';
  const HASH_KEY = 'chesting_code_hash';
  const SESSION_KEY = 'chesting_unlocked';

  async function sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function hasCode() { return !!localStorage.getItem(HASH_KEY); }
  function isUnlocked() { return sessionStorage.getItem(SESSION_KEY) === '1'; }

  async function setCode(code) {
    localStorage.setItem(HASH_KEY, await sha256(code));
  }

  async function checkCode(code) {
    const hash = await sha256(code);
    return hash === localStorage.getItem(HASH_KEY);
  }

  function unlock() { sessionStorage.setItem(SESSION_KEY, '1'); }
  function lock() { sessionStorage.removeItem(SESSION_KEY); }

  /** Call at the top of every protected page. Redirects to the gate if not unlocked. */
  function guard() {
    if (!hasCode() || !isUnlocked()) {
      window.location.replace('index.html');
    }
  }

  window.ChestingAuth = { hasCode, isUnlocked, setCode, checkCode, unlock, lock, guard };
})();
