export interface WebEnv {
  apiUrl: string;
  tilesUrl: string;
  tilesAttribution: string;
}

export class InvalidEnvError extends Error {
  readonly names: string[];

  constructor(names: string[]) {
    super(`Invalid web environment: ${names.join(', ')}`);
    this.name = 'InvalidEnvError';
    this.names = names;
  }
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
    throw new InvalidEnvError(invalid);
  }

  return { apiUrl, tilesUrl, tilesAttribution };
}

let cached: WebEnv | undefined;

export function getEnv(): WebEnv {
  // Read each key on its own: passing `import.meta.env` whole makes Vite inline every VITE_* variable
  // of the build (on Vercel, VITE_VERCEL_* with commit and author data) into the bundle.
  cached ??= parseEnv({
    VITE_API_URL: import.meta.env.VITE_API_URL,
    VITE_TILES_URL: import.meta.env.VITE_TILES_URL,
    VITE_TILES_ATTRIBUTION: import.meta.env.VITE_TILES_ATTRIBUTION,
  });
  return cached;
}
