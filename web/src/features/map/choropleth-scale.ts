import { formatCompact } from '../../shared/format/format';

export const CHOROPLETH_CLASSES = 5;

// Absolute totals span many orders of magnitude (D-07, no population data): five classes, one per
// decade, ending at the power of ten just above the maximum. The top never goes below 10 000, so
// the lowest limit is at least 1 and every label is a whole number.
const MIN_TOP = 10_000;

export function choroplethBreaks(max: number): number[] {
  const top = Math.max(max >= 1 ? 10 ** Math.ceil(Math.log10(max)) : 0, MIN_TOP);
  return [top / 10_000, top / 1_000, top / 100, top / 10];
}

// 0..4 (a total of 0 is data: it falls in the first class), or null without data.
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
