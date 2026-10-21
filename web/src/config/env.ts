export interface WebEnv {
  apiUrl: string;
  tilesUrl: string;
  tilesAttribution: string;
}

const API_URL_PATTERN = /^https?:\/\/[^/\s]+$/;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function parseEnv(source: Record<string, unknown>): WebEnv {
  const apiUrl = text(source.VITE_API_URL);
  const tilesUrl = text(source.VITE_TILES_URL);
  const tilesAttribution = text(source.VITE_TILES_ATTRIBUTION);

  const invalid: string[] = [];
  if (!API_URL_PATTERN.test(apiUrl)) invalid.push('VITE_API_URL');
  if (!['{z}', '{x}', '{y}'].every((part) => tilesUrl.includes(part))) {
    invalid.push('VITE_TILES_URL');
  }
  if (tilesAttribution === '') invalid.push('VITE_TILES_ATTRIBUTION');
  if (invalid.length > 0) {
    throw new Error(`Invalid web environment: ${invalid.join(', ')}`);
  }

  return { apiUrl, tilesUrl, tilesAttribution };
}

let cached: WebEnv | undefined;

export function getEnv(): WebEnv {
  cached ??= parseEnv(import.meta.env);
  return cached;
}
