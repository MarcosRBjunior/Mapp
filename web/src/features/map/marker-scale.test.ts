import { describe, expect, it } from 'vitest';
import { legendSteps, markerRadius, maxTotal, niceValue } from './marker-scale';

describe('markerRadius', () => {
  it('draws no marker for null, zero, negative or an empty scale', () => {
    expect(markerRadius(null, 100)).toBe(0);
    expect(markerRadius(0, 100)).toBe(0);
    expect(markerRadius(-5, 100)).toBe(0);
    expect(markerRadius(10, 0)).toBe(0);
  });

  it('maps the maximum to 40 and keeps tiny values at least 3', () => {
    expect(markerRadius(100, 100)).toBe(40);
    expect(markerRadius(200, 100)).toBe(40);
    expect(markerRadius(1, 1_000_000)).toBe(3);
  });

  it('grows with the square root of the value', () => {
    expect(markerRadius(25, 100)).toBe(21.5);
  });
});

describe('maxTotal', () => {
  it('ignores nulls', () => {
    expect(maxTotal([{ total: null }, { total: 7 }, { total: 3 }])).toBe(7);
    expect(maxTotal([])).toBe(0);
  });
});

describe('niceValue', () => {
  it('rounds down to 1, 2 or 5 times a power of ten', () => {
    expect(niceValue(523_000)).toBe(500_000);
    expect(niceValue(48_000)).toBe(20_000);
    expect(niceValue(1_900)).toBe(1_000);
    expect(niceValue(0)).toBe(0);
  });
});

describe('legendSteps', () => {
  it('gives three sizes around max, max/10 and max/100', () => {
    expect(legendSteps(500_000)).toEqual([
      { value: 500_000, radius: 40 },
      { value: 50_000, radius: 14.7 },
      { value: 5_000, radius: 6.7 },
    ]);
  });

  it('drops values below one and repeated values', () => {
    expect(legendSteps(1)).toEqual([{ value: 1, radius: 40 }]);
    expect(legendSteps(0)).toEqual([]);
  });
});
