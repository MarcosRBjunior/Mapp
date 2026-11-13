import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DARK_MAP_COLORS, LIGHT_MAP_COLORS, useMapColors } from './map-colors';

describe('useMapColors', () => {
  afterEach(() => document.documentElement.classList.remove('dark'));

  it('follows the dark class on the root, live', async () => {
    const { result } = renderHook(() => useMapColors());
    expect(result.current).toBe(LIGHT_MAP_COLORS);

    // The MutationObserver reports on a microtask.
    await act(async () => {
      document.documentElement.classList.add('dark');
      await Promise.resolve();
    });
    expect(result.current).toBe(DARK_MAP_COLORS);

    await act(async () => {
      document.documentElement.classList.remove('dark');
      await Promise.resolve();
    });
    expect(result.current).toBe(LIGHT_MAP_COLORS);
  });
});
