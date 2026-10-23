import { describe, expect, it } from 'vitest';
import { sharePercent } from '../../../src/services/comparison.js';

describe('sharePercent (RN-04)', () => {
  it('returns the percentage with one decimal', () => {
    expect(sharePercent(100, 250)).toBe(40);
    expect(sharePercent(10, 35)).toBe(28.6);
    expect(sharePercent(1, 3)).toBe(33.3);
  });

  it('returns null when the global is 0 or missing', () => {
    expect(sharePercent(0, 0)).toBeNull();
    expect(sharePercent(5, null)).toBeNull();
    expect(sharePercent(5, undefined)).toBeNull();
  });
});
