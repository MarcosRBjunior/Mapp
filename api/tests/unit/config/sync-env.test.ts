import { describe, expect, it } from 'vitest';
import { loadSyncEnv } from '../../../src/config/sync-env.js';

const DATABASE_URL_SYNC = 'postgresql://mapp:mapp@127.0.0.1:5435/mapp';

describe('loadSyncEnv', () => {
  it('applies the defaults', () => {
    expect(loadSyncEnv({ DATABASE_URL_SYNC, API_NINJAS_KEY: 'test-key' })).toEqual({
      DATABASE_URL_SYNC,
      DATA_PROVIDER: 'api_ninjas',
      API_NINJAS_KEY: 'test-key',
      SYNC_CALLS_PER_HOUR: 90,
      SYNC_CALLS_PER_MONTH: 3000,
      LOG_LEVEL: 'info',
    });
  });

  it('requires API_NINJAS_KEY for the api_ninjas provider', () => {
    expect(() => loadSyncEnv({ DATABASE_URL_SYNC })).toThrow(/API_NINJAS_KEY/);
  });

  it('treats an empty key as missing', () => {
    expect(() => loadSyncEnv({ DATABASE_URL_SYNC, API_NINJAS_KEY: '' })).toThrow(/API_NINJAS_KEY/);
  });

  it('does not require the key for other providers', () => {
    expect(loadSyncEnv({ DATABASE_URL_SYNC, DATA_PROVIDER: 'jhu_csv' }).DATA_PROVIDER).toBe(
      'jhu_csv',
    );
  });

  it('rejects an unknown provider', () => {
    expect(() =>
      loadSyncEnv({ DATABASE_URL_SYNC, DATA_PROVIDER: 'csv', API_NINJAS_KEY: 'test-key' }),
    ).toThrow(/DATA_PROVIDER/);
  });

  it('parses custom call limits', () => {
    const env = loadSyncEnv({
      DATABASE_URL_SYNC,
      API_NINJAS_KEY: 'test-key',
      SYNC_CALLS_PER_HOUR: '10',
      SYNC_CALLS_PER_MONTH: '200',
    });
    expect([env.SYNC_CALLS_PER_HOUR, env.SYNC_CALLS_PER_MONTH]).toEqual([10, 200]);
  });

  it('rejects a zero or non-numeric limit', () => {
    const base = { DATABASE_URL_SYNC, API_NINJAS_KEY: 'test-key' };
    expect(() => loadSyncEnv({ ...base, SYNC_CALLS_PER_HOUR: '0' })).toThrow(/SYNC_CALLS_PER_HOUR/);
    expect(() => loadSyncEnv({ ...base, SYNC_CALLS_PER_MONTH: 'many' })).toThrow(
      /SYNC_CALLS_PER_MONTH/,
    );
  });

  it('requires a postgres DATABASE_URL_SYNC', () => {
    expect(() => loadSyncEnv({ API_NINJAS_KEY: 'test-key' })).toThrow(/DATABASE_URL_SYNC/);
  });

  it('never echoes the key in validation errors', () => {
    let message = '';
    try {
      loadSyncEnv({ DATABASE_URL_SYNC: 'mysql://x', API_NINJAS_KEY: 'super-secret-key' });
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }
    expect(message).toMatch(/DATABASE_URL_SYNC/);
    expect(message).not.toContain('super-secret-key');
  });
});
