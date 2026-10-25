export type Period = '7d' | '30d' | '90d' | 'all';

export const PERIODS: readonly Period[] = ['7d', '30d', '90d', 'all'];

export const PERIOD_LABELS: Record<Period, string> = {
  '7d': '7 dias',
  '30d': '30 dias',
  '90d': '90 dias',
  all: 'Tudo',
};

export const PERIOD_PHRASES: Record<Period, string> = {
  '7d': 'nos últimos 7 dias',
  '30d': 'nos últimos 30 dias',
  '90d': 'nos últimos 90 dias',
  all: 'em todo o período',
};

const PERIOD_DAYS: Record<Period, number | null> = { '7d': 7, '30d': 30, '90d': 90, all: null };

export interface DateRange {
  from: string;
  to: string;
  clamped: boolean;
}

// UTC arithmetic on YYYY-MM-DD strings, so the day never shifts with the local time zone.
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function periodRange(period: Period, coverage: { from: string; to: string }): DateRange {
  const days = PERIOD_DAYS[period];
  const start = days === null ? coverage.from : addDays(coverage.to, -(days - 1));
  return start < coverage.from
    ? { from: coverage.from, to: coverage.to, clamped: true }
    : { from: start, to: coverage.to, clamped: false };
}
