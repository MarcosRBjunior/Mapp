// Links back to the map keep only the dashboard state, never unrelated query params.
export function dashboardSearch(search: string): string {
  const current = new URLSearchParams(search);
  const next = new URLSearchParams();
  for (const key of ['metric', 'period']) {
    const value = current.get(key);
    if (value !== null) next.set(key, value);
  }
  const text = next.toString();
  return text === '' ? '' : `?${text}`;
}
