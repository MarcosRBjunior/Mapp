import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { THEME_KEY } from './theme';
import { useTheme } from './use-theme';

// A matchMedia whose dark preference the test can flip, notifying the listeners.
function mockSystem(dark: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const original = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  let matches = dark;
  window.matchMedia = (query: string) =>
    ({
      get matches() {
        return matches;
      },
      media: query,
      addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) =>
        listeners.add(listener),
      removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) =>
        listeners.delete(listener),
    }) as unknown as MediaQueryList;
  return {
    set(next: boolean) {
      matches = next;
      for (const listener of listeners) listener({ matches: next } as MediaQueryListEvent);
    },
    restore() {
      if (original) Object.defineProperty(window, 'matchMedia', original);
    },
  };
}

describe('useTheme', () => {
  let system: ReturnType<typeof mockSystem>;

  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    system.restore();
    document.documentElement.classList.remove('dark');
  });

  it('follows the system without a saved choice, live', () => {
    system = mockSystem(true);
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
    expect(document.documentElement).toHaveClass('dark');

    act(() => system.set(false));
    expect(result.current.theme).toBe('light');
    expect(document.documentElement).not.toHaveClass('dark');
  });

  it('uses the saved choice over the system', () => {
    system = mockSystem(true);
    window.localStorage.setItem(THEME_KEY, 'light');
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('light');
  });

  it('saves the toggled theme and stops following the system', () => {
    system = mockSystem(false);
    const { result } = renderHook(() => useTheme());

    act(() => result.current.toggle());
    expect(result.current.theme).toBe('dark');
    expect(window.localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(document.documentElement).toHaveClass('dark');

    act(() => system.set(false));
    expect(result.current.theme).toBe('dark');
  });
});
