import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrisma } from '../../src/lib/prisma.js';
import { createReadRepositories } from '../../src/repositories/read-repositories.js';
import { resetSyncState } from './sync-state.js';
import { loadTestDbUrls } from './test-db.js';

const urls = loadTestDbUrls();
const owner = new pg.Client({ connectionString: urls.syncUrl });
const reader = createPrisma(urls.readerUrl);
const repos = createReadRepositories(reader);
let sourceId: number;

// Sun 02-26, Mon 02-27, Tue 02-28 (incomplete: ARG deaths missing), Wed 03-01.
const DAYS = ['2023-02-26', '2023-02-27', '2023-02-28', '2023-03-01'] as const;

async function seed() {
  for (const [index, day] of DAYS.entries()) {
    const step = index + 1;
    const rows: [string, 'cases' | 'deaths', number, number][] = [
      ['BRA', 'cases', 10 * step, 10],
      ['ARG', 'cases', step, 1],
      ['BRA', 'deaths', step, 1],
    ];
    if (day !== '2023-02-28') rows.push(['ARG', 'deaths', step, 1]);
    for (const [code, metric, total, newValue] of rows) {
      await owner.query(
        `INSERT INTO daily_stat (country_code, metric, stat_date, source_id, total, new_value)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [code, metric, day, sourceId, total, newValue],
      );
    }
  }
  await owner.query('REFRESH MATERIALIZED VIEW global_daily_stat');
}

const range = (granularity: 'day' | 'week' | 'month', from = '2023-02-26', to = '2023-03-01') => ({
  from,
  to,
  granularity,
});

beforeAll(async () => {
  await owner.connect();
  const source = await owner.query<{ id: number }>(
    "SELECT id FROM data_source WHERE code = 'api_ninjas'",
  );
  const id = source.rows[0]?.id;
  if (id === undefined) throw new Error('api_ninjas source is not seeded');
  sourceId = id;
});

beforeEach(async () => {
  await resetSyncState(owner);
  await seed();
});

afterAll(async () => {
  await resetSyncState(owner);
  await owner.end();
  await reader.$disconnect();
});

describe('global series', () => {
  it('lists complete days only', async () => {
    expect(await repos.stats.listGlobalSeries(sourceId, 'cases', range('day'))).toEqual([
      { date: '2023-02-26', total: 11, newValue: 11 },
      { date: '2023-02-27', total: 22, newValue: 11 },
      { date: '2023-03-01', total: 44, newValue: 11 },
    ]);
  });

  it('groups ISO weeks: sum of new, last total, first bucket cut at from (RN-11)', async () => {
    expect(await repos.stats.listGlobalSeries(sourceId, 'cases', range('week'))).toEqual([
      { date: '2023-02-26', total: 11, newValue: 11 },
      { date: '2023-02-27', total: 44, newValue: 22 },
    ]);
  });

  it('groups months', async () => {
    expect(await repos.stats.listGlobalSeries(sourceId, 'cases', range('month'))).toEqual([
      { date: '2023-02-26', total: 22, newValue: 22 },
      { date: '2023-03-01', total: 44, newValue: 11 },
    ]);
    expect(
      await repos.stats.listGlobalSeries(sourceId, 'cases', range('month', '2023-02-27')),
    ).toEqual([
      { date: '2023-02-27', total: 22, newValue: 11 },
      { date: '2023-03-01', total: 44, newValue: 11 },
    ]);
  });
});

describe('country series', () => {
  it('lists the complete days where the country has data', async () => {
    expect(await repos.stats.listCountrySeries(sourceId, 'BRA', 'cases', range('day'))).toEqual([
      { date: '2023-02-26', total: 10, newValue: 10 },
      { date: '2023-02-27', total: 20, newValue: 10 },
      { date: '2023-03-01', total: 40, newValue: 10 },
    ]);
  });

  it('is empty for a country without data', async () => {
    expect(await repos.stats.listCountrySeries(sourceId, 'CHL', 'cases', range('day'))).toEqual([]);
  });
});
