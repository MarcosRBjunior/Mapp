import { describe, expect, it } from 'vitest';
import {
  BudgetExhaustedError,
  budgetExhausted,
  isBudgetExhausted,
} from '../../../../src/jobs/sync/budget.js';

const LIMITS = { perHour: 90, perMonth: 3000 };

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

describe('budgetExhausted', () => {
  it('explains both counters', () => {
    const error = budgetExhausted({ lastHour: 90, thisMonth: 120 }, LIMITS);
    expect(error).toBeInstanceOf(BudgetExhaustedError);
    expect(error.message).toBe(
      'Call budget exhausted: 90/90 in the last hour, 120/3000 this month (UTC)',
    );
  });
});
