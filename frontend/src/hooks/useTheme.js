import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'app-theme';
const THEME_EVENT = 'app-theme-change';

/** Valeurs de data-theme supportées. L'ordre définit le cycle de toggle(). */
export const THEMES = ['dark', 'light', 'glass', 'glass-dark'];

export const THEME_LABELS = {
  dark: 'Sombre',
  light: 'Clair',
  glass: 'Glass clair',
  'glass-dark': 'Glass sombre',
};

const DEFAULT_THEME = 'dark';

// Toute valeur inconnue (ancienne valeur stockée, attribut absent) retombe sur dark.
const normalize = (value) => (THEMES.includes(value) ? value : DEFAULT_THEME);

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
  const theme = useSyncExternalStore(subscribe, getTheme, () => DEFAULT_THEME);

  // Passe au thème suivant dans THEMES (dark → light → glass → glass-dark → dark…)
  const toggle = useCallback(() => {
    const current = getTheme();
    applyTheme(THEMES[(THEMES.indexOf(current) + 1) % THEMES.length]);
  }, []);

  return {
    theme,
    label: THEME_LABELS[theme],
    themes: THEMES,
    toggle,
    setTheme: applyTheme,
  };
};

export default useTheme;