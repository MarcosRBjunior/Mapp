export function compareNames(a: string, b: string): number {
  return a.localeCompare(b, 'pt-BR');
}

// RN-04: country ÷ global × 100, one decimal; global 0 or missing → null.
export function sharePercent(value: number, globalTotal: number | null | undefined): number | null {
  if (globalTotal === null || globalTotal === undefined || globalTotal === 0) return null;
  return Math.round((value / globalTotal) * 1000) / 10;
}

export interface RankEntry {
  code: string;
  name: string;
  total: number;
}

export interface Rank {
  rank: number | null;
  rankedCount: number;
}

// RN-05: absolute value, ties in alphabetical (pt-BR) order.
export function rankOf(code: string, entries: readonly RankEntry[]): Rank {
  const sorted = [...entries].sort((a, b) => b.total - a.total || compareNames(a.name, b.name));
  const index = sorted.findIndex((entry) => entry.code === code);
  return { rank: index === -1 ? null : index + 1, rankedCount: sorted.length };
}
