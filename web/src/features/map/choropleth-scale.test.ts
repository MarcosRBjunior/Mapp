import { describe, expect, it } from 'vitest';
import {
  CHOROPLETH_CLASSES,
  choroplethBreaks,
  choroplethClass,
  choroplethLabels,
} from './choropleth-scale';

describe('choroplethBreaks', () => {
  it('ends at the power of ten just above the maximum, one class per decade', () => {
    expect(choroplethBreaks(103_802_702)).toEqual([100_000, 1_000_000, 10_000_000, 100_000_000]);
    expect(choroplethBreaks(1_123_836)).toEqual([1_000, 10_000, 100_000, 1_000_000]);
  });

  it('keeps an exact power of ten in the last class', () => {
    const breaks = choroplethBreaks(1_000_000);
    expect(breaks).toEqual([100, 1_000, 10_000, 100_000]);
    expect(choroplethClass(1_000_000, breaks)).toBe(CHOROPLETH_CLASSES - 1);
  });

  it('still gives a scale when every value is zero', () => {
    expect(choroplethBreaks(0)).toEqual([0.001, 0.01, 0.1, 1]);
  });
});

describe('choroplethClass', () => {
  const breaks = [1_000, 10_000, 100_000, 1_000_000];

  it('puts each value in its decade, the limit going to the class above', () => {
    expect(choroplethClass(0, breaks)).toBe(0);
    expect(choroplethClass(999, breaks)).toBe(0);
    expect(choroplethClass(1_000, breaks)).toBe(1);
    expect(choroplethClass(99_999, breaks)).toBe(2);
    expect(choroplethClass(5_000_000, breaks)).toBe(4);
  });

  it('has no class without data', () => {
    expect(choroplethClass(null, breaks)).toBeNull();
  });
});

describe('choroplethLabels', () => {
  it('describes the five classes in pt-BR', () => {
    // Intl puts a no-break space between the number and the unit.
    const labels = choroplethLabels([1_000, 10_000, 100_000, 1_000_000]);
    expect(labels.map((label) => label.replaceAll('\u00a0', ' '))).toEqual([
      'menos de 1 mil',
      '1 mil a 10 mil',
      '10 mil a 100 mil',
      '100 mil a 1 mi',
      '1 mi ou mais',
    ]);
  });
});
