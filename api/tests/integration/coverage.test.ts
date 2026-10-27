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

const D1 = '2023-03-08';
const D2 = '2023-03-09';

async function insert(rows: ReadonlyArray<readonly [string, 'cases' | 'deaths', string]>) {
  for (const [code, metric, date] of rows) {
    await owner.query(
      `INSERT INTO daily_stat (country_code, metric, stat_date, source_id, total, new_value)
       VALUES ($1, $2, $3, $4, 1, 0)`,
      [code, metric, date, sourceId],
    );
  }
}

async function refresh() {
  await owner.query('REFRESH MATERIALIZED VIEW global_daily_stat');
}

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
});

afterAll(async () => {
  await resetSyncState(owner);
  await owner.end();
  await reader.$disconnect();
});

describe('findCoverage (RN-06 from the view, per metric)', () => {
  it('is empty without data', async () => {
    expect(await repos.dataState.findCoverage(sourceId)).toEqual({
      from: null,
      referenceDate: null,
      countries: 0,
    });
  });

  it('closes a date when each metric has its own full count', async () => {
    // XDP only ever appears in cases: it must not block the deaths side.
    await insert([
      ['BRA', 'cases', D1],
      ['XDP', 'cases', D1],
      ['BRA', 'deaths', D1],
      ['BRA', 'cases', D2],
      ['BRA', 'deaths', D2],
    ]);
    await refresh();

    expect(await repos.dataState.findCoverage(sourceId)).toEqual({
      from: D1,
      referenceDate: D1,
      countries: 2,
    });
  });

  it('has no coverage while one metric has no data at all', async () => {
    await insert([['BRA', 'cases', D1]]);
    await refresh();

    expect(await repos.dataState.findCoverage(sourceId)).toEqual({
      from: null,
      referenceDate: null,
      countries: 1,
    });
  });

  it('starts at the first complete date and skips incomplete ones', async () => {
    const D0 = '2023-03-07';
    const D3 = '2023-03-10';
    await insert([
      // D0: only BRA → incomplete
      ['BRA', 'cases', D0],
      ['BRA', 'deaths', D0],
      // D1: complete
      ['BRA', 'cases', D1],
      ['ARG', 'cases', D1],
      ['BRA', 'deaths', D1],
      ['ARG', 'deaths', D1],
      // D2: ARG deaths missing → incomplete
      ['BRA', 'cases', D2],
      ['ARG', 'cases', D2],
      ['BRA', 'deaths', D2],
      // D3: complete
      ['BRA', 'cases', D3],
      ['ARG', 'cases', D3],
      ['BRA', 'deaths', D3],
      ['ARG', 'deaths', D3],
    ]);
    await refresh();

    expect(await repos.dataState.findCoverage(sourceId)).toEqual({
      from: D1,
      referenceDate: D3,
      countries: 2,
    });
    // Only D2 is inside the coverage and incomplete; D0 lies before it.
    expect(await repos.dataState.findIncompleteDates(sourceId)).toEqual([D2]);
  });

  it('lists a calendar date the view has no row for as incomplete', async () => {
    const D3 = '2023-03-10';
    await insert([
      ['BRA', 'cases', D1],
      ['BRA', 'deaths', D1],
      ['BRA', 'cases', D3],
      ['BRA', 'deaths', D3],
    ]);
    await refresh();

    expect(await repos.dataState.findIncompleteDates(sourceId)).toEqual([D2]);
  });

  it('ignores rows written after the last refresh', async () => {
    await insert([
      ['BRA', 'cases', D1],
      ['BRA', 'deaths', D1],
    ]);
    await refresh();
    // A run that wrote a new country and died before refreshing the view.
    await insert([['CHL', 'cases', D1]]);

    expect(await repos.dataState.findCoverage(sourceId)).toEqual({
      from: D1,
      referenceDate: D1,
      countries: 1,
    });
  });
});
