import { describe, expect, it } from 'vitest';
import { createProviderFactory } from '../../../src/providers/create-provider.js';

describe('createProviderFactory', () => {
  it('builds the api_ninjas factory', () => {
    const factory = createProviderFactory({
      DATA_PROVIDER: 'api_ninjas',
      API_NINJAS_KEY: 'test-key',
    });
    expect(factory.sourceCode).toBe('api_ninjas');
    expect(factory.finalDate).toBe('2023-03-09');
  });

  it('requires the key for api_ninjas', () => {
    expect(() =>
      createProviderFactory({ DATA_PROVIDER: 'api_ninjas', API_NINJAS_KEY: undefined }),
    ).toThrow(/API_NINJAS_KEY/);
  });

  it('builds the jhu_csv factory without a key', () => {
    const factory = createProviderFactory({ DATA_PROVIDER: 'jhu_csv', API_NINJAS_KEY: undefined });
    expect(factory.sourceCode).toBe('jhu_csv');
    expect(factory.finalDate).toBe('2023-03-09');
  });

  it('reports apify as not implemented', () => {
    expect(() =>
      createProviderFactory({ DATA_PROVIDER: 'apify', API_NINJAS_KEY: undefined }),
    ).toThrow(/not implemented/);
  });
});
