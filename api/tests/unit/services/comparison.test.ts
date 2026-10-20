import { describe, expect, it } from 'vitest';
import { compareNames, rankOf, sharePercent } from '../../../src/services/comparison.js';

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

describe('rankOf (RN-05)', () => {
  const entries = [
    { code: 'BRA', name: 'Brasil', total: 100 },
    { code: 'ARG', name: 'Argentina', total: 100 },
    { code: 'USA', name: 'Estados Unidos', total: 500 },
  ];

  it('ranks by total and breaks ties alphabetically', () => {
    expect(rankOf('USA', entries)).toEqual({ rank: 1, rankedCount: 3 });
    expect(rankOf('ARG', entries)).toEqual({ rank: 2, rankedCount: 3 });
    expect(rankOf('BRA', entries)).toEqual({ rank: 3, rankedCount: 3 });
  });

  it('orders accented names as pt-BR does', () => {
    const tied = [
      { code: 'AZE', name: 'Azerbaijão', total: 7 },
      { code: 'AUT', name: 'Áustria', total: 7 },
    ];
    expect(rankOf('AUT', tied).rank).toBe(1);
    expect(compareNames('Áustria', 'Azerbaijão')).toBeLessThan(0);
  });

  it('returns a null rank for a country without data', () => {
    expect(rankOf('ESH', entries)).toEqual({ rank: null, rankedCount: 3 });
  });
});
