import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadTestDbUrls, scriptEnv } from './test-db.js';

const urls = loadTestDbUrls();
const owner = new pg.Client({ connectionString: urls.syncUrl });

beforeAll(async () => {
  await owner.connect();
});

afterAll(async () => {
  await owner.end();
});

async function count(sql: string): Promise<number> {
  const result = await owner.query<{ count: string }>(sql);
  return Number(result.rows[0]?.count);
}

const SOURCE_ID = "(SELECT id FROM data_source WHERE code = 'api_ninjas')";

describe('migrate + seed from an empty database', () => {
  it('creates 202 entities: 198 countries with coordinates and 4 non-geographic', async () => {
    expect(await count('SELECT count(*) FROM country')).toBe(202);
    expect(
      await count(
        "SELECT count(*) FROM country WHERE kind = 'country' AND lat IS NOT NULL AND lng IS NOT NULL",
      ),
    ).toBe(198);
    expect(await count("SELECT count(*) FROM country WHERE kind = 'non_geographic'")).toBe(4);
  });

  it('creates the api_ninjas source with 202 mapped aliases', async () => {
    expect(await count("SELECT count(*) FROM data_source WHERE code = 'api_ninjas'")).toBe(1);
    expect(await count("SELECT count(*) FROM country_alias WHERE status = 'mapped'")).toBe(202);
  });

  it('is idempotent when the seed runs again', async () => {
    execFileSync('npm', ['run', 'db:seed'], { env: scriptEnv(urls), stdio: 'pipe' });
    expect(await count('SELECT count(*) FROM country')).toBe(202);
    expect(await count('SELECT count(*) FROM country_alias')).toBe(202);
    expect(await count('SELECT count(*) FROM data_source')).toBe(1);
  });
});

describe('constraints', () => {
  it('refuses to delete a country that still has aliases', async () => {
    await expect(owner.query("DELETE FROM country WHERE code = 'ATA'")).rejects.toThrow(
      /country_alias_country_code_fkey/,
    );
  });

  it('rejects a negative total', async () => {
    await expect(
      owner.query(
        `INSERT INTO daily_stat (country_code, metric, stat_date, source_id, total, new_value)
         VALUES ('BRA', 'cases', '2020-01-01', ${SOURCE_ID}, -1, 0)`,
      ),
    ).rejects.toThrow(/daily_stat_total_non_negative/);
  });

  it('rejects a mapped alias without a country', async () => {
    await expect(
      owner.query(
        `INSERT INTO country_alias (source_id, source_name, country_code, status)
         VALUES (${SOURCE_ID}, 'Nowhere', NULL, 'mapped')`,
      ),
    ).rejects.toThrow(/country_alias_mapped_has_country/);
  });

  it('allows only one running sync run', async () => {
    await owner.query(
      `INSERT INTO sync_run (source_id, mode, status) VALUES (${SOURCE_ID}, 'snapshot', 'running')`,
    );
    try {
      await expect(
        owner.query(
          `INSERT INTO sync_run (source_id, mode, status) VALUES (${SOURCE_ID}, 'full', 'running')`,
        ),
      ).rejects.toThrow(/sync_run_single_running/);
    } finally {
      await owner.query('DELETE FROM sync_run');
    }
  });
});

describe('global_daily_stat', () => {
  it('sums every country, including non-geographic entities, after a concurrent refresh', async () => {
    await owner.query(
      `INSERT INTO daily_stat (country_code, metric, stat_date, source_id, total, new_value) VALUES
         ('BRA', 'cases', '2021-01-01', ${SOURCE_ID}, 100, 10),
         ('ARG', 'cases', '2021-01-01', ${SOURCE_ID}, 50, 5),
         ('XDP', 'cases', '2021-01-01', ${SOURCE_ID}, 7, -1)`,
    );
    try {
      await owner.query('REFRESH MATERIALIZED VIEW CONCURRENTLY global_daily_stat');
      const result = await owner.query(
        "SELECT total, new_value, country_count FROM global_daily_stat WHERE metric = 'cases' AND stat_date = '2021-01-01'",
      );
      expect(result.rows).toEqual([{ total: '157', new_value: '14', country_count: 3 }]);
    } finally {
      await owner.query('DELETE FROM daily_stat');
      await owner.query('REFRESH MATERIALIZED VIEW global_daily_stat');
    }
  });
});

describe('reader role', () => {
  it('can read tables and the view but cannot write', async () => {
    const reader = new pg.Client({ connectionString: urls.readerUrl });
    await reader.connect();
    try {
      const countries = await reader.query<{ count: string }>('SELECT count(*) FROM country');
      expect(Number(countries.rows[0]?.count)).toBe(202);
      await expect(reader.query('SELECT * FROM global_daily_stat')).resolves.toBeDefined();
      await expect(
        reader.query(
          "INSERT INTO data_source (code, name, url, license, attribution) VALUES ('x', 'x', 'x', 'x', 'x')",
        ),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await reader.end();
    }
  });
});
