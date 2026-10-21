import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

const valid = {
  VITE_API_URL: 'http://localhost:3333',
  VITE_TILES_URL: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  VITE_TILES_ATTRIBUTION: '&copy; OpenStreetMap contributors &copy; CARTO',
};

describe('parseEnv', () => {
  it('reads a valid environment', () => {
    expect(parseEnv(valid)).toEqual({
      apiUrl: 'http://localhost:3333',
      tilesUrl: valid.VITE_TILES_URL,
      tilesAttribution: valid.VITE_TILES_ATTRIBUTION,
    });
  });

  it.each(['VITE_API_URL', 'VITE_TILES_URL', 'VITE_TILES_ATTRIBUTION'])(
    'rejects a missing %s',
    (name) => {
      expect(() => parseEnv({ ...valid, [name]: undefined })).toThrow(name);
    },
  );

  it('rejects an API URL with a trailing slash or a path', () => {
    expect(() => parseEnv({ ...valid, VITE_API_URL: 'http://localhost:3333/' })).toThrow(
      'VITE_API_URL',
    );
  });

  it('rejects a tiles URL without {z}, {x} and {y}', () => {
    expect(() => parseEnv({ ...valid, VITE_TILES_URL: 'https://tiles.test/map.png' })).toThrow(
      'VITE_TILES_URL',
    );
  });

  it('lists every invalid variable in one error', () => {
    expect(() => parseEnv({})).toThrow(
      'Invalid web environment: VITE_API_URL, VITE_TILES_URL, VITE_TILES_ATTRIBUTION',
    );
  });
});
