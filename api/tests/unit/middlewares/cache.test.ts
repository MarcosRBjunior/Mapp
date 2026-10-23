import { describe, expect, it } from 'vitest';
import { etagMatches } from '../../../src/middlewares/cache.js';

describe('etagMatches (weak comparison)', () => {
  it.each([
    ['"v7"', true],
    ['W/"v7"', true],
    ['"v6", "v7"', true],
    ['*', true],
    ['"v6"', false],
    ['"v70"', false],
  ])('If-None-Match %s → %s', (header, expected) => {
    expect(etagMatches(header, '"v7"')).toBe(expected);
  });

  it('is false without the header', () => {
    expect(etagMatches(undefined, '"v7"')).toBe(false);
  });
});
