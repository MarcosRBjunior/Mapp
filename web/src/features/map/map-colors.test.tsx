import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ThemeProvider } from '../../shared/theme/theme-provider';
import { useTheme } from '../../shared/theme/use-theme';
import { DARK_MAP_COLORS, LIGHT_MAP_COLORS, useMapColors } from './map-colors';

const wrapper = ({ children }: { children: ReactNode }) => (
  <ThemeProvider>{children}</ThemeProvider>
);

describe('useMapColors', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = '';
  });

  it('is light without the provider', () => {
    expect(renderHook(() => useMapColors()).result.current).toBe(LIGHT_MAP_COLORS);
  });

  it('follows the theme of the provider', () => {
    const { result } = renderHook(() => ({ colors: useMapColors(), theme: useTheme() }), {
      wrapper,
    });
    expect(result.current.colors).toBe(LIGHT_MAP_COLORS);

    act(() => result.current.theme.toggle());
    expect(result.current.colors).toBe(DARK_MAP_COLORS);
  });
});
