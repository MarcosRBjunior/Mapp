import type { Metric } from '../api/types';

export const EMPTY = '—';

const numberFormat = new Intl.NumberFormat('pt-BR');
const percentFormat = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export const METRIC_LABELS: Record<Metric, { title: string; noun: string }> = {
  cases: { title: 'Casos', noun: 'casos' },
  deaths: { title: 'Mortes', noun: 'mortes' },
};

export function formatNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? EMPTY : numberFormat.format(value);
}

export function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined ? EMPTY : `${percentFormat.format(value)}%`;
}

// Splits the string instead of using Date so the day never shifts with the local time zone.
export function formatDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

export function formatRank(rank: number | null, count: number): string {
  return rank === null ? EMPTY : `nº ${rank} de ${count}`;
}
