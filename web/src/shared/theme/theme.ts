export type Theme = 'light' | 'dark';

// Same key and rule as the inline script in index.html, which applies the theme before the bundle.
export const THEME_KEY = 'mapp-theme';
export const DARK_QUERY = '(prefers-color-scheme: dark)';

// The saved choice, or null without one (or without storage: private windows can throw).
export function readStoredTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

export function storeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Without storage the choice lasts until the page closes.
  }
}

export function systemTheme(): Theme {
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

export function resolveTheme(stored: Theme | null, system: Theme): Theme {
  return stored ?? system;
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}
