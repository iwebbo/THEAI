import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'app-theme';
const THEME_EVENT = 'app-theme-change';

const normalize = (value) => (value === 'light' ? 'light' : 'dark');

const getTheme = () => normalize(document.documentElement.getAttribute('data-theme'));

const subscribe = (callback) => {
  window.addEventListener(THEME_EVENT, callback);
  return () => window.removeEventListener(THEME_EVENT, callback);
};

/** À appeler une fois avant le premier rendu (index.js). */
export const initTheme = () => {
  let stored = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    /* stockage indisponible : thème par défaut */
  }
  document.documentElement.setAttribute('data-theme', normalize(stored));
};

export const applyTheme = (theme) => {
  const next = normalize(theme);
  document.documentElement.setAttribute('data-theme', next);
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch (e) {
    /* ignoré */
  }
  window.dispatchEvent(new Event(THEME_EVENT));
};

const useTheme = () => {
  const theme = useSyncExternalStore(subscribe, getTheme, () => 'dark');
  const toggle = useCallback(() => applyTheme(getTheme() === 'dark' ? 'light' : 'dark'), []);
  return { theme, toggle, setTheme: applyTheme };
};

export default useTheme;
