const COMBINING_MARKS = /[̀-ͯ]/g;

export function normalize(text: string): string {
  return text.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase().trim();
}

export function filterCountries<T extends { name: string }>(
  items: readonly T[],
  query: string,
  limit = 8,
): T[] {
  const needle = normalize(query);
  if (needle === '') return [];
  return items
    .filter((item) => normalize(item.name).includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    .slice(0, limit);
}
