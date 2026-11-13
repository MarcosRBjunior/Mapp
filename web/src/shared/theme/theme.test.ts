import indexHtml from '../../../index.html?raw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DARK_QUERY,
  THEME_KEY,
  applyTheme,
  readStoredTheme,
  resolveTheme,
  storeTheme,
} from './theme';

describe('theme', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('reads only light or dark from storage', () => {
    expect(readStoredTheme()).toBeNull();
    window.localStorage.setItem(THEME_KEY, 'dark');
    expect(readStoredTheme()).toBe('dark');
    window.localStorage.setItem(THEME_KEY, 'sepia');
    expect(readStoredTheme()).toBeNull();
  });

  it('falls back to no choice when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(readStoredTheme()).toBeNull();
    expect(() => storeTheme('dark')).not.toThrow();
  });

  it('prefers the saved choice over the system', () => {
    expect(resolveTheme('light', 'dark')).toBe('light');
    expect(resolveTheme(null, 'dark')).toBe('dark');
  });

  it('applies the dark class and the color scheme to the root', () => {
    applyTheme('dark');
    expect(document.documentElement).toHaveClass('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');

    applyTheme('light');
    expect(document.documentElement).not.toHaveClass('dark');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });
});

describe('the inline script in index.html', () => {
  it('uses the same key, values and system query as theme.ts', () => {
    expect(indexHtml).toContain(`localStorage.getItem('${THEME_KEY}')`);
    expect(indexHtml).toContain(`matchMedia('${DARK_QUERY}')`);
    expect(indexHtml).toContain("theme !== 'light' && theme !== 'dark'");
  });
});
