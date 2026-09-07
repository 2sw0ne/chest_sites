(() => {
  'use strict';
  const KEY = 'chesting_theme';

  function apply(theme) {
    if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
  }

  function current() {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  }

  function toggle() {
    const next = current() === 'light' ? 'dark' : 'light';
    localStorage.setItem(KEY, next);
    apply(next);
    document.dispatchEvent(new CustomEvent('chesting:theme', { detail: next }));
    return next;
  }

  // Applied immediately on script load (placed early in <head>) to avoid a flash.
  apply(current());

  window.ChestingTheme = { apply, current, toggle };
})();
