import { describe, expect, it } from 'vitest';
import { isIsoDate, toIsoDate } from '../../../src/lib/dates.js';

describe('isIsoDate', () => {
  it.each(['2023-03-09', '2020-01-22', '2024-02-29'])('accepts %s', (value) => {
    expect(isIsoDate(value)).toBe(true);
  });

  it.each(['2023-02-30', '2023-13-01', '2023-3-9', '20230309', '2023-03-09T00:00:00Z', ''])(
    'rejects %s',
    (value) => {
      expect(isIsoDate(value)).toBe(false);
    },
  );
});

describe('toIsoDate', () => {
  it('formats the UTC calendar date', () => {
    expect(toIsoDate(new Date('2023-03-09T00:00:00Z'))).toBe('2023-03-09');
    expect(toIsoDate(new Date('2023-03-09T23:59:59Z'))).toBe('2023-03-09');
  });
});
