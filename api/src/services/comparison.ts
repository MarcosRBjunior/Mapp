// RN-04: country ÷ global × 100, one decimal; global 0 or missing → null.
export function sharePercent(value: number, globalTotal: number | null | undefined): number | null {
  if (globalTotal === null || globalTotal === undefined || globalTotal === 0) return null;
  return Math.round((value / globalTotal) * 1000) / 10;
}

export interface Rank {
  rank: number | null;
  rankedCount: number;
}
