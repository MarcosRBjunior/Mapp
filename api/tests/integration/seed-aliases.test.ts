import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadTestDbUrls, scriptEnv } from './test-db.js';

const urls = loadTestDbUrls();
const owner = new pg.Client({ connectionString: urls.syncUrl });
const SOURCE_ID = "(SELECT id FROM data_source WHERE code = 'api_ninjas')";

function seed(): void {
  execFileSync('npm', ['run', 'db:seed'], { env: scriptEnv(urls), stdio: 'pipe' });
}

beforeAll(async () => {
  await owner.connect();
});

afterAll(async () => {
  await owner.query("DELETE FROM country_alias WHERE source_name = 'Atlantis'");
  await owner.end();
});

describe('db:seed with aliases.json', () => {
  it('keeps aliases that are not in the file', async () => {
    await owner.query(
      `INSERT INTO country_alias (source_id, source_name, country_code, status)
       VALUES (${SOURCE_ID}, 'Atlantis', NULL, 'pending')`,
    );
    seed();
    const atlantis = await owner.query(
      "SELECT status, country_code FROM country_alias WHERE source_name = 'Atlantis'",
    );
    expect(atlantis.rows).toEqual([{ status: 'pending', country_code: null }]);
    const mapped = await owner.query<{ count: string }>(
      "SELECT count(*) FROM country_alias WHERE status = 'mapped'",
    );
    expect(Number(mapped.rows[0]?.count)).toBe(202);
  });

  it('restores a curated alias changed directly in the database', async () => {
    await owner.query(
      "UPDATE country_alias SET status = 'ignored', country_code = NULL WHERE source_name = 'Brazil'",
    );
    seed();
    const brazil = await owner.query(
      "SELECT status, country_code FROM country_alias WHERE source_name = 'Brazil'",
    );
    expect(brazil.rows).toEqual([{ status: 'mapped', country_code: 'BRA' }]);
  });
});
