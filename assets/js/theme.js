const ThemeModule = (function () {
  const STORAGE_KEY = 'supply-app-theme';

  function resolveSystemTheme() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function apply(pref) {
    const resolved = pref === 'system' ? resolveSystemTheme() : pref;
    document.documentElement.setAttribute('data-theme', resolved);
  }

  function getPreference() {
    return localStorage.getItem(STORAGE_KEY) || 'system';
  }

  function setPreference(pref) {
    localStorage.setItem(STORAGE_KEY, pref);
    apply(pref);
  }

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getPreference() === 'system') apply('system');
  });

  return { getPreference, setPreference, apply };
})();
