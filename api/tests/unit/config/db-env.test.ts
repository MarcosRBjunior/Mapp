import { describe, expect, it } from 'vitest';
import { loadDbEnv } from '../../../src/config/db-env.js';

const valid = {
  DATABASE_URL: 'postgresql://mapp_api:secret@127.0.0.1:5435/mapp',
  DATABASE_URL_SYNC: 'postgres://mapp:secret@127.0.0.1:5435/mapp',
};

describe('loadDbEnv', () => {
  it('accepts postgres URLs', () => {
    expect(loadDbEnv(valid)).toEqual(valid);
  });

  it('requires DATABASE_URL', () => {
    expect(() => loadDbEnv({ DATABASE_URL_SYNC: valid.DATABASE_URL_SYNC })).toThrow(
      /at DATABASE_URL(?!_SYNC)/,
    );
  });

  it('requires DATABASE_URL_SYNC', () => {
    expect(() => loadDbEnv({ DATABASE_URL: valid.DATABASE_URL })).toThrow(/DATABASE_URL_SYNC/);
  });

  it('rejects a non-postgres URL', () => {
    expect(() => loadDbEnv({ ...valid, DATABASE_URL: 'mysql://user:pw@host/db' })).toThrow(
      /at DATABASE_URL(?!_SYNC)/,
    );
  });
});
