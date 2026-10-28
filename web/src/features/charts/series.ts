import type { Metric, TimeseriesPoint } from '../../shared/api/types';
import {
  CUMULATIVE_LABELS,
  NEW_LABELS,
  formatDate,
  formatNumber,
} from '../../shared/format/format';
import { addDays, periodRange, type ChartRanges, type Period } from '../../shared/period/period';

export const AVERAGE_WINDOW = 7;

export type Scale = 'linear' | 'log';

// The fetch starts 6 days earlier so the 7-day average is complete on the first visible day.
export function chartRanges(period: Period, coverage: { from: string; to: string }): ChartRanges {
  const visible = periodRange(period, coverage);
  const start = addDays(visible.from, -(AVERAGE_WINDOW - 1));
  return {
    visible,
    fetch: { from: start < coverage.from ? coverage.from : start, to: visible.to },
  };
}

export interface DailyNewRow {
  date: string;
  value: number;
  bar: number;
  // Drawn line: never negative.
  average: number | null;
  // The real rounded average, negative when the source corrections outweigh the day.
  averageValue: number | null;
}

// RN-07: `value` keeps what the source sent; `bar` and `average` (what is drawn) are never negative;
// `averageValue` keeps the real average for the tooltip and the summary.
export function dailyNewRows(
  points: readonly TimeseriesPoint[],
  visibleFrom: string,
): DailyNewRow[] {
  const byDate = new Map(points.map((point) => [point.date, point.new]));
  const averageAt = (date: string): number | null => {
    let sum = 0;
    for (let back = 0; back < AVERAGE_WINDOW; back += 1) {
      const value = byDate.get(addDays(date, -back));
      if (value === undefined) return null;
      sum += value;
    }
    return Math.round(sum / AVERAGE_WINDOW);
  };
  return points
    .filter((point) => point.date >= visibleFrom)
    .map((point) => {
      const averageValue = averageAt(point.date);
      return {
        date: point.date,
        value: point.new,
        bar: Math.max(0, point.new),
        average: averageValue === null ? null : Math.max(0, averageValue),
        averageValue,
      };
    });
}

// A log axis has no place for zero or negatives: those days become gaps.
export function scaled(value: number | null | undefined, scale: Scale): number | null {
  if (value === null || value === undefined) return null;
  return scale === 'log' && value <= 0 ? null : value;
}

export interface CumulativeRow {
  date: string;
  world: number | null;
  country: number | null;
}

export function cumulativeRows(
  world: readonly TimeseriesPoint[],
  country: readonly TimeseriesPoint[] | null,
  scale: Scale,
): CumulativeRow[] {
  const countryByDate = new Map((country ?? []).map((point) => [point.date, point.total]));
  return world.map((point) => ({
    date: point.date,
    world: scaled(point.total, scale),
    country: country === null ? null : scaled(countryByDate.get(point.date), scale),
  }));
}

export interface SeriesEnds {
  name: string;
  first: number;
  last: number;
}

export function seriesEnds(name: string, points: readonly TimeseriesPoint[]): SeriesEnds | null {
  const first = points[0];
  const last = points.at(-1);
  return first && last ? { name, first: first.total, last: last.total } : null;
}

function rangeText(range: { from: string; to: string }): string {
  return `de ${formatDate(range.from)} a ${formatDate(range.to)}`;
}

export function cumulativeSummary(
  metric: Metric,
  range: { from: string; to: string },
  series: readonly SeriesEnds[],
): string {
  const parts = series.map(
    (item) => `${item.name}: de ${formatNumber(item.first)} para ${formatNumber(item.last)}`,
  );
  return `${CUMULATIVE_LABELS[metric]} ${rangeText(range)} — ${parts.join('; ')}.`;
}

export function dailyNewSummary(
  metric: Metric,
  place: string,
  range: { from: string; to: string },
  rows: readonly DailyNewRow[],
): string {
  const [first, ...rest] = rows;
  if (!first) return '';
  // The first day wins a tie.
  const peak = rest.reduce((best, row) => (row.value > best.value ? row : best), first);
  const lastAverage = rows.at(-1)?.averageValue ?? null;
  return `${NEW_LABELS[metric]} (${place}) ${rangeText(range)}: pico de ${formatNumber(peak.value)} em ${formatDate(peak.date)}; média de 7 dias no último dia: ${formatNumber(lastAverage)}.`;
}
