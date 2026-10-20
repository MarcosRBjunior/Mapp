export interface BudgetLimits {
  perHour: number;
  perMonth: number;
}

export interface CallCounts {
  lastHour: number;
  thisMonth: number;
}

const HOUR_MS = 3_600_000;

export class BudgetExhaustedError extends Error {
  constructor(counts: CallCounts, limits: BudgetLimits) {
    super(
      `Call budget exhausted: ${counts.lastHour}/${limits.perHour} in the last hour, ` +
        `${counts.thisMonth}/${limits.perMonth} this month (UTC)`,
    );
    this.name = 'BudgetExhaustedError';
  }
}

export function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function hourAgo(now: Date): Date {
  return new Date(now.getTime() - HOUR_MS);
}

export function isBudgetExhausted(counts: CallCounts, limits: BudgetLimits): boolean {
  return counts.lastHour >= limits.perHour || counts.thisMonth >= limits.perMonth;
}
