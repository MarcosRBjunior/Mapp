import { createContext, useContext } from 'react';
import type { Theme } from './theme';

export interface ThemeValue {
  theme: Theme;
  toggle: () => void;
}

// Without the provider (component tests) the page is light and the toggle does nothing.
export const ThemeContext = createContext<ThemeValue>({ theme: 'light', toggle: () => undefined });

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}
