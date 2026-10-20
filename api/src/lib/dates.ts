export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// A real calendar date in YYYY-MM-DD (2023-02-30 is rejected).
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && toIsoDate(date) === value;
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
