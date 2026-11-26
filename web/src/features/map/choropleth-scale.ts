import { formatCompact } from '../../shared/format/format';

export const CHOROPLETH_CLASSES = 5;

// Absolute totals span many orders of magnitude (D-07, no population data): five classes, one per
// decade, ending at the power of ten just above the maximum.
export function choroplethBreaks(max: number): number[] {
  const top = max >= 1 ? 10 ** Math.ceil(Math.log10(max)) : 10;
  return [top / 10_000, top / 1_000, top / 100, top / 10];
}

// 0..4, or null without data (the polygon keeps the neutral fill).
export function choroplethClass(value: number | null, breaks: readonly number[]): number | null {
  if (value === null) return null;
  const index = breaks.findIndex((limit) => value < limit);
  return index === -1 ? breaks.length : index;
}

export function choroplethLabels(breaks: readonly number[]): string[] {
  const text = breaks.map(formatCompact);
  return [
    `menos de ${text[0]}`,
    ...text.slice(1).map((limit, index) => `${text[index]} a ${limit}`),
    `${text[text.length - 1]} ou mais`,
  ];
}
