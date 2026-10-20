import { describe, expect, it } from 'vitest';
import type { FetchLike } from '../../../src/providers/covid-provider.js';
import { createProvider } from '../../../src/providers/create-provider.js';

const fetch: FetchLike = () => Promise.reject(new Error('not used'));

describe('createProvider', () => {
  it('builds the api_ninjas provider', () => {
    expect(
      createProvider({ DATA_PROVIDER: 'api_ninjas', API_NINJAS_KEY: 'test-key' }, fetch).sourceCode,
    ).toBe('api_ninjas');
  });

  it('requires the key for api_ninjas', () => {
    expect(() =>
      createProvider({ DATA_PROVIDER: 'api_ninjas', API_NINJAS_KEY: undefined }, fetch),
    ).toThrow(/API_NINJAS_KEY/);
  });

  it.each(['jhu_csv', 'apify'] as const)('reports %s as not implemented', (provider) => {
    expect(() =>
      createProvider({ DATA_PROVIDER: provider, API_NINJAS_KEY: undefined }, fetch),
    ).toThrow(/not implemented/);
  });
});
