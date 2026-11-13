import { describe, expect, it } from 'vitest';
import { selectionKeyOf, selectionState } from './selection';

describe('selectionKeyOf', () => {
  it('is empty for a non-object state', () => {
    expect(selectionKeyOf(null)).toBe('');
    expect(selectionKeyOf('x')).toBe('');
    expect(selectionKeyOf(undefined)).toBe('');
  });

  it('is empty for an object without selectedAt', () => {
    expect(selectionKeyOf({ other: 1 })).toBe('');
  });

  it('is the string of a numeric selectedAt', () => {
    expect(selectionKeyOf({ selectedAt: 123 })).toBe('123');
    expect(selectionKeyOf(selectionState())).toMatch(/^\d+$/);
  });
});

describe('selectionState', () => {
  it('gives a new key to each selection, even in the same millisecond', () => {
    const keys = Array.from({ length: 3 }, () => selectionKeyOf(selectionState()));

    expect(new Set(keys).size).toBe(3);
  });
});
