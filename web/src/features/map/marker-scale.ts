import type { Metric } from '../../shared/api/types';

export const MIN_RADIUS = 3;
export const MAX_RADIUS = 40;

export const METRIC_COLORS: Record<Metric, string> = {
  cases: '#dc2626',
  deaths: '#7c3aed',
};

// Area grows with the value: the radius follows the square root.
export function markerRadius(value: number | null, max: number): number {
  if (value === null || value <= 0 || max <= 0) return 0;
  const ratio = Math.min(value / max, 1);
  return Math.round((MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * Math.sqrt(ratio)) * 10) / 10;
}

export function maxTotal(items: readonly { total: number | null }[]): number {
  return items.reduce((max, item) => Math.max(max, item.total ?? 0), 0);
}

export function niceValue(value: number): number {
  if (value <= 0) return 0;
  const base = 10 ** Math.floor(Math.log10(value));
  const fraction = value / base;
  const step = fraction >= 5 ? 5 : fraction >= 2 ? 2 : 1;
  return step * base;
}

export function legendSteps(max: number): { value: number; radius: number }[] {
  const values = [max, max / 10, max / 100].map(niceValue).filter((value) => value >= 1);
  return [...new Set(values)].map((value) => ({ value, radius: markerRadius(value, max) }));
}
