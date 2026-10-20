import { describe, expect, it } from 'vitest';
import {
  BudgetExhaustedError,
  hourAgo,
  isBudgetExhausted,
  monthStartUtc,
} from '../../../../src/jobs/sync/budget.js';

const LIMITS = { perHour: 90, perMonth: 3000 };

describe('monthStartUtc', () => {
  it('returns the first instant of the UTC month', () => {
    expect(monthStartUtc(new Date('2026-10-19T15:30:00Z')).toISOString()).toBe(
      '2026-10-01T00:00:00.000Z',
    );
  });

  it('uses the UTC month, not the local one', () => {
    expect(monthStartUtc(new Date('2026-10-31T22:00:00-03:00')).toISOString()).toBe(
      '2026-11-01T00:00:00.000Z',
    );
  });

  it('handles the turn of the year', () => {
    expect(monthStartUtc(new Date('2026-12-31T23:59:59.999Z')).toISOString()).toBe(
      '2026-12-01T00:00:00.000Z',
    );
    expect(monthStartUtc(new Date('2027-01-01T00:00:00.000Z')).toISOString()).toBe(
      '2027-01-01T00:00:00.000Z',
    );
  });
});

describe('hourAgo', () => {
  it('goes back exactly one hour', () => {
    expect(hourAgo(new Date('2026-10-19T15:30:00Z')).toISOString()).toBe(
      '2026-10-19T14:30:00.000Z',
    );
  });
});

describe('isBudgetExhausted', () => {
  it('allows calls below both limits', () => {
    expect(isBudgetExhausted({ lastHour: 89, thisMonth: 2999 }, LIMITS)).toBe(false);
  });

  it('treats reaching the hourly limit as exhausted', () => {
    expect(isBudgetExhausted({ lastHour: 90, thisMonth: 0 }, LIMITS)).toBe(true);
  });

  it('treats reaching the monthly limit as exhausted', () => {
    expect(isBudgetExhausted({ lastHour: 0, thisMonth: 3000 }, LIMITS)).toBe(true);
  });
});

describe('BudgetExhaustedError', () => {
  it('explains both counters', () => {
    expect(new BudgetExhaustedError({ lastHour: 90, thisMonth: 120 }, LIMITS).message).toBe(
      'Call budget exhausted: 90/90 in the last hour, 120/3000 this month (UTC)',
    );
  });
});
