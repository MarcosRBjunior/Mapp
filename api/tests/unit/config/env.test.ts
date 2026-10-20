import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../../src/config/env.js';

const REQUIRED = {
  DATABASE_URL: 'postgresql://reader:secret@localhost:5435/mapp',
  WEB_ORIGIN: 'http://localhost:5173',
};

describe('loadEnv', () => {
  it('applies defaults when optional variables are missing', () => {
    expect(loadEnv(REQUIRED)).toEqual({
      ...REQUIRED,
      NODE_ENV: 'development',
      PORT: 3333,
      LOG_LEVEL: 'info',
      DATA_PROVIDER: 'api_ninjas',
    });
  });

  it('treats empty optional values as missing', () => {
    expect(
      loadEnv({ ...REQUIRED, NODE_ENV: '', PORT: '', LOG_LEVEL: '', DATA_PROVIDER: '' }),
    ).toEqual({
      ...REQUIRED,
      NODE_ENV: 'development',
      PORT: 3333,
      LOG_LEVEL: 'info',
      DATA_PROVIDER: 'api_ninjas',
    });
  });

  it('accepts explicit non-default values', () => {
    expect(
      loadEnv({
        ...REQUIRED,
        NODE_ENV: 'production',
        PORT: '8080',
        LOG_LEVEL: 'debug',
        DATA_PROVIDER: 'jhu_csv',
      }),
    ).toEqual({
      ...REQUIRED,
      NODE_ENV: 'production',
      PORT: 8080,
      LOG_LEVEL: 'debug',
      DATA_PROVIDER: 'jhu_csv',
    });
  });

  it('coerces PORT to a number', () => {
    expect(loadEnv({ ...REQUIRED, PORT: '4000' }).PORT).toBe(4000);
  });

  it.each(['abc', '0', '70000', '3.5', '0x1F', '1e3', ' 80'])('rejects PORT=%s', (port) => {
    expect(() => loadEnv({ ...REQUIRED, PORT: port })).toThrow(/PORT/);
  });

  it('rejects an unknown LOG_LEVEL', () => {
    expect(() => loadEnv({ ...REQUIRED, LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL/);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => loadEnv({ ...REQUIRED, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('rejects an unknown DATA_PROVIDER', () => {
    expect(() => loadEnv({ ...REQUIRED, DATA_PROVIDER: 'csv' })).toThrow(/DATA_PROVIDER/);
  });

  it.each([undefined, '', 'mysql://reader@localhost/mapp'])('rejects DATABASE_URL=%s', (url) => {
    expect(() => loadEnv({ ...REQUIRED, DATABASE_URL: url })).toThrow(/DATABASE_URL/);
  });

  it.each([undefined, '', 'localhost:5173', 'http://localhost:5173/', 'https://mapp.dev/app'])(
    'rejects WEB_ORIGIN=%s',
    (origin) => {
      expect(() => loadEnv({ ...REQUIRED, WEB_ORIGIN: origin })).toThrow(/WEB_ORIGIN/);
    },
  );

  it('accepts an https origin with a port', () => {
    expect(loadEnv({ ...REQUIRED, WEB_ORIGIN: 'https://mapp.dev:8443' }).WEB_ORIGIN).toBe(
      'https://mapp.dev:8443',
    );
  });
});
