export interface BudgetLimits {
  perHour: number;
  perMonth: number;
}

export interface CallCounts {
  lastHour: number;
  thisMonth: number;
}

export class BudgetExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetExhaustedError';
  }
}

export function budgetExhausted(counts: CallCounts, limits: BudgetLimits): BudgetExhaustedError {
  return new BudgetExhaustedError(
    `Call budget exhausted: ${counts.lastHour}/${limits.perHour} in the last hour, ` +
      `${counts.thisMonth}/${limits.perMonth} this month (UTC)`,
  );
}

export function isBudgetExhausted(counts: CallCounts, limits: BudgetLimits): boolean {
  return counts.lastHour >= limits.perHour || counts.thisMonth >= limits.perMonth;
}
