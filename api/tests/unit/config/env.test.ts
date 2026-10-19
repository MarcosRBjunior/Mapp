import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../../src/config/env.js';

describe('loadEnv', () => {
  it('applies defaults when variables are missing', () => {
    expect(loadEnv({})).toEqual({ NODE_ENV: 'development', PORT: 3333, LOG_LEVEL: 'info' });
  });

  it('coerces PORT to a number', () => {
    expect(loadEnv({ PORT: '4000' }).PORT).toBe(4000);
  });

  it.each(['abc', '0', '70000', '3.5'])('rejects PORT=%s', (port) => {
    expect(() => loadEnv({ PORT: port })).toThrow(/PORT/);
  });

  it('rejects an unknown LOG_LEVEL', () => {
    expect(() => loadEnv({ LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL/);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => loadEnv({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });
});
