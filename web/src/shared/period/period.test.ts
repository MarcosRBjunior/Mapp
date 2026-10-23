import { describe, expect, it } from 'vitest';
import { periodRange } from './period';

const COVERAGE = { from: '2020-01-22', to: '2023-03-09' };

describe('periodRange', () => {
  it.each([
    ['7d', '2023-03-03'],
    ['30d', '2023-02-08'],
    ['90d', '2022-12-10'],
  ] as const)('ends %s at the reference date', (period, from) => {
    expect(periodRange(period, COVERAGE)).toEqual({ from, to: '2023-03-09', clamped: false });
  });

  it('uses the whole coverage for all', () => {
    expect(periodRange('all', COVERAGE)).toEqual({
      from: '2020-01-22',
      to: '2023-03-09',
      clamped: false,
    });
  });

  it('clamps the start to the coverage', () => {
    expect(periodRange('30d', { from: '2023-02-20', to: '2023-03-09' })).toEqual({
      from: '2023-02-20',
      to: '2023-03-09',
      clamped: true,
    });
  });

  it('does not clamp when the start is the first covered day', () => {
    expect(periodRange('7d', { from: '2023-03-03', to: '2023-03-09' })).toEqual({
      from: '2023-03-03',
      to: '2023-03-09',
      clamped: false,
    });
  });

  it('crosses a leap day', () => {
    expect(periodRange('7d', { from: '2020-01-22', to: '2020-03-02' }).from).toBe('2020-02-25');
  });
});
