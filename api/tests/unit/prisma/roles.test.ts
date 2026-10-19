import { describe, expect, it } from 'vitest';
import {
  assertSeparateRoles,
  buildReaderRoleSql,
  parseConnectionUrl,
} from '../../../prisma/roles-sql.js';

const base = { owner: 'mapp', reader: 'mapp_api', password: 'secret', database: 'mapp' };

describe('buildReaderRoleSql', () => {
  it('creates the reader role and grants read access', () => {
    expect(buildReaderRoleSql({ ...base, readerExists: false })).toEqual([
      `CREATE ROLE "mapp_api" WITH LOGIN PASSWORD 'secret'`,
      `GRANT CONNECT ON DATABASE "mapp" TO "mapp_api"`,
      `GRANT USAGE ON SCHEMA public TO "mapp_api"`,
      `GRANT SELECT ON ALL TABLES IN SCHEMA public TO "mapp_api"`,
      `ALTER DEFAULT PRIVILEGES FOR ROLE "mapp" IN SCHEMA public GRANT SELECT ON TABLES TO "mapp_api"`,
    ]);
  });

  it('updates the password when the role already exists', () => {
    expect(buildReaderRoleSql({ ...base, readerExists: true })[0]).toBe(
      `ALTER ROLE "mapp_api" WITH LOGIN PASSWORD 'secret'`,
    );
  });

  it('escapes identifiers and the password literal', () => {
    const [statement] = buildReaderRoleSql({
      ...base,
      reader: 'we"ird',
      password: "it's\\x",
      readerExists: false,
    });
    expect(statement).toBe(`CREATE ROLE "we""ird" WITH LOGIN PASSWORD  E'it''s\\\\x'`);
  });
});

describe('parseConnectionUrl', () => {
  it('extracts and decodes user, password and database', () => {
    expect(parseConnectionUrl('postgresql://mapp_api:p%40ss@127.0.0.1:5435/mapp')).toEqual({
      user: 'mapp_api',
      password: 'p@ss',
      database: 'mapp',
    });
  });

  it('rejects a URL without password', () => {
    expect(() => parseConnectionUrl('postgresql://mapp_api@127.0.0.1:5435/mapp')).toThrow(
      /user, password and database/,
    );
  });
});

describe('assertSeparateRoles', () => {
  const owner = { user: 'mapp', password: 'x', database: 'mapp' };

  it('accepts a distinct reader on the same database', () => {
    expect(() =>
      assertSeparateRoles({ user: 'mapp_api', password: 'y', database: 'mapp' }, owner),
    ).not.toThrow();
  });

  it('rejects a reader that uses the owner user', () => {
    expect(() =>
      assertSeparateRoles({ user: 'mapp', password: 'x', database: 'mapp' }, owner),
    ).toThrow(/different user/);
  });

  it('rejects URLs that point to different databases', () => {
    expect(() =>
      assertSeparateRoles({ user: 'mapp_api', password: 'y', database: 'other' }, owner),
    ).toThrow(/same database/);
  });
});
