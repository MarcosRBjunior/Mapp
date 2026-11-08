import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { RawFetch } from '../../src/jobs/sync/call-gate.js';
import { runSync, type RunSyncDeps } from '../../src/jobs/sync/run-sync.js';
import { createLogger } from '../../src/lib/logger.js';
import { createPrisma } from '../../src/lib/prisma.js';
import { jhuCsvFactory } from '../../src/providers/jhu-csv/jhu-csv.provider.js';
import { fixtureDayRows } from '../helpers/api-ninjas-fixtures.js';
import { jhuFixtureText } from '../helpers/jhu-csv-fixtures.js';
import { resetSyncState } from './sync-state.js';
import { loadTestDbUrls } from './test-db.js';

const urls = loadTestDbUrls();
const owner = new pg.Client({ connectionString: urls.syncUrl });
const prisma = createPrisma(urls.syncUrl);
await owner.connect();

// The cropped files hold Brazil, Denmark (three rows), Diamond Princess and "Korea, South".
function jhuSource() {
  const requested: string[] = [];
  const fetch: RawFetch = (url) => {
    requested.push(url.slice(url.lastIndexOf('/') + 1));
    const body = jhuFixtureText(url.includes('deaths') ? 'deaths' : 'cases');
    return Promise.resolve(new Response(body, { status: 200 }));
  };
  return { requested, fetch };
}

function deps(fetch: RawFetch, mode: RunSyncDeps['mode']): RunSyncDeps {
  return {
    prisma,
    lockUrl: urls.syncUrl,
    mode,
    fetch,
    limits: { perHour: 90, perMonth: 3000 },
    logger: createLogger('silent'),
    sleep: () => Promise.resolve(),
    source: jhuCsvFactory(),
  };
}

async function rows<T extends pg.QueryResultRow>(sql: string): Promise<T[]> {
  return (await owner.query<T>(sql)).rows;
}

// The recorded API Ninjas call on the reference date, summed per country like RN-02.
function ninjasTotal(country: string): { total: number; new_value: number } {
  const match = fixtureDayRows('cases').filter((row) => row.country === country);
  return {
    total: match.reduce((sum, row) => sum + row.total, 0),
    new_value: match.reduce((sum, row) => sum + row.new, 0),
  };
}

beforeEach(async () => {
  await resetSyncState(owner);
});

afterAll(async () => {
  await resetSyncState(owner);
  await owner.end();
  await prisma.$disconnect();
});

describe('runSync with the JHU CSV source', () => {
  it('loads the whole series of every country in the files with two downloads', async () => {
    const source = jhuSource();

    const result = await runSync(deps(source.fetch, 'full'));

    expect(source.requested).toEqual([
      'time_series_covid19_confirmed_global.csv',
      'time_series_covid19_deaths_global.csv',
    ]);
    // 202 mapped names per metric; only the four names in the cropped files have rows.
    expect(result).toMatchObject({
      status: 'partial',
      callsUsed: 2,
      unitsPlanned: 404,
      unitsDone: 8,
    });
    expect(
      await rows(
        `SELECT country_code, count(*)::int AS days, min(stat_date)::text AS first,
                max(stat_date)::text AS last
         FROM daily_stat d JOIN data_source s ON s.id = d.source_id
         WHERE s.code = 'jhu_csv' AND d.metric = 'cases'
         GROUP BY country_code ORDER BY country_code`,
      ),
    ).toEqual(
      ['BRA', 'DNK', 'KOR', 'XDP'].map((country_code) => ({
        country_code,
        days: 1143,
        first: '2020-01-22',
        last: '2023-03-09',
      })),
    );
    expect(
      await rows(
        `SELECT country_code, total::float8 AS total, new_value::float8 AS new_value
         FROM daily_stat
         WHERE metric = 'cases' AND stat_date = '2023-03-09' AND country_code IN ('BRA', 'DNK')
         ORDER BY country_code`,
      ),
    ).toEqual([
      { country_code: 'BRA', ...ninjasTotal('Brazil') },
      { country_code: 'DNK', ...ninjasTotal('Denmark') },
    ]);
  });

  it('loads the reference date in snapshot mode with two downloads', async () => {
    const source = jhuSource();

    const result = await runSync(deps(source.fetch, 'snapshot'));

    expect(result).toMatchObject({ callsUsed: 2, unitsDone: 2 });
    expect(source.requested).toHaveLength(2);
    expect(
      await rows(
        `SELECT count(DISTINCT country_code)::int AS n FROM daily_stat
         WHERE stat_date = '2023-03-09'`,
      ),
    ).toEqual([{ n: 4 }]);
  });
});
