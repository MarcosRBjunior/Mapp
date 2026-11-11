import { describe, expect, it } from 'vitest';
import { evaluateDatabase } from '../../../prisma/db-check.js';

describe('evaluateDatabase', () => {
  it('passes Postgres 18 with the ICU collation', () => {
    expect(evaluateDatabase({ versionNum: 180001, hasIcuCollation: true })).toEqual({
      errors: [],
      warnings: [],
    });
  });

  it('fails without the pt-BR-x-icu collation', () => {
    expect(evaluateDatabase({ versionNum: 180001, hasIcuCollation: false }).errors).toEqual([
      'collation "pt-BR-x-icu" not found: rankings and country lists sort with it (the server needs ICU)',
    ]);
  });

  it('warns, without failing, before Postgres 18', () => {
    expect(evaluateDatabase({ versionNum: 170005, hasIcuCollation: true })).toEqual({
      errors: [],
      warnings: [
        'Postgres older than 18 (server_version_num 170005): measure /rankings and /countries again and consider an index on daily_stat (source_id, stat_date)',
      ],
    });
  });
});
