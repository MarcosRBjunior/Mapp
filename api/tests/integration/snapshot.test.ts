import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { RawFetch } from '../../src/jobs/sync/call-gate.js';
import { SyncLockedError, runSync, type RunSyncDeps } from '../../src/jobs/sync/run-sync.js';
import { createLogger } from '../../src/lib/logger.js';
import { createPrisma } from '../../src/lib/prisma.js';
import { apiNinjasFactory } from '../../src/providers/api-ninjas/api-ninjas.provider.js';
import type { Metric } from '../../src/providers/covid-provider.js';
import { SYNC_LOCK_KEY } from '../../src/repositories/sync-lock.repository.js';
import { INTERRUPTED_ERROR } from '../../src/repositories/sync-run.repository.js';
import { fixtureText } from '../helpers/api-ninjas-fixtures.js';
import { resetSyncState } from './sync-state.js';
import { loadTestDbUrls } from './test-db.js';

const urls = loadTestDbUrls();
const owner = new pg.Client({ connectionString: urls.syncUrl });
const prisma = createPrisma(urls.syncUrl);
const SOURCE_ID = "(SELECT id FROM data_source WHERE code = 'api_ninjas')";
const FIXTURES: Record<Metric, string> = {
  cases: fixtureText('date-2023-03-09-cases.json'),
  deaths: fixtureText('date-2023-03-09-deaths.json'),
};

const DAILY_STATS =
  'SELECT country_code, metric, total, new_value FROM daily_stat ORDER BY metric, country_code';
const EXPECTED_STATS = [
  { country_code: 'AUS', metric: 'cases', total: 11399460, new_value: 13926 },
  { country_code: 'BRA', metric: 'cases', total: 37076053, new_value: 0 },
  { country_code: 'DNK', metric: 'cases', total: 3451036, new_value: 139 },
  { country_code: 'XDP', metric: 'cases', total: 712, new_value: 0 },
  { country_code: 'AUS', metric: 'deaths', total: 19574, new_value: 115 },
  { country_code: 'BRA', metric: 'deaths', total: 699276, new_value: 0 },
  { country_code: 'DNK', metric: 'deaths', total: 8345, new_value: 4 },
  { country_code: 'XDP', metric: 'deaths', total: 13, new_value: 0 },
];

type Reply = { status: number; body: string } | Error;

function fakeSource(
  reply: (metric: Metric) => Reply = (metric) => ({ status: 200, body: FIXTURES[metric] }),
) {
  const requested: Metric[] = [];
  const fetch: RawFetch = (url) => {
    const metric: Metric = new URL(url).searchParams.get('type') === 'deaths' ? 'deaths' : 'cases';
    requested.push(metric);
    const answer = reply(metric);
    return answer instanceof Error
      ? Promise.reject(answer)
      : Promise.resolve(new Response(answer.body, { status: answer.status }));
  };
  return { requested, fetch };
}

function deps(fetch: RawFetch): RunSyncDeps {
  return {
    prisma,
    lockUrl: urls.syncUrl,
    mode: 'snapshot',
    fetch,
    limits: { perHour: 90, perMonth: 3000 },
    logger: createLogger('silent'),
    sleep: () => Promise.resolve(),
    source: apiNinjasFactory('test-key'),
  };
}

async function rows<T extends pg.QueryResultRow>(sql: string): Promise<T[]> {
  return (await owner.query<T>(sql)).rows;
}

beforeAll(async () => {
  await owner.connect();
});

beforeEach(async () => {
  await resetSyncState(owner);
});

afterAll(async () => {
  await resetSyncState(owner);
  await owner.end();
  await prisma.$disconnect();
});

describe('runSync in snapshot mode', () => {
  it('loads the reference date with 2 calls and refreshes the global view', async () => {
    const source = fakeSource();

    const result = await runSync(deps(source.fetch));

    expect(result).toMatchObject({ status: 'success', callsUsed: 2, pendingNames: [] });
    expect(source.requested).toEqual(['cases', 'deaths']);
    expect(await rows(DAILY_STATS)).toEqual(EXPECTED_STATS);
    expect(
      await rows(
        'SELECT status, mode, reference_date::text AS reference_date, calls_used, error FROM sync_run',
      ),
    ).toEqual([
      {
        status: 'success',
        mode: 'snapshot',
        reference_date: '2023-03-09',
        calls_used: 2,
        error: null,
      },
    ]);
    expect(await rows('SELECT unit, status FROM sync_checkpoint ORDER BY unit')).toEqual([
      { unit: 'snapshot:cases:2023-03-09', status: 'done' },
      { unit: 'snapshot:deaths:2023-03-09', status: 'done' },
    ]);
    expect(
      await rows('SELECT endpoint, status_code, outcome FROM provider_call ORDER BY id'),
    ).toEqual([
      { endpoint: '/v1/covid19?date=2023-03-09&type=cases', status_code: 200, outcome: 'ok' },
      { endpoint: '/v1/covid19?date=2023-03-09&type=deaths', status_code: 200, outcome: 'ok' },
    ]);
    expect(
      await rows(
        "SELECT metric, total::text AS total, new_value::text AS new_value, country_count FROM global_daily_stat WHERE stat_date = '2023-03-09' ORDER BY metric",
      ),
    ).toEqual([
      { metric: 'cases', total: '51927261', new_value: '14065', country_count: 4 },
      { metric: 'deaths', total: '727208', new_value: '119', country_count: 4 },
    ]);
  });

  it('is idempotent: a second run keeps the same 8 rows (RN-09)', async () => {
    await runSync(deps(fakeSource().fetch));
    const second = await runSync(deps(fakeSource().fetch));

    expect(second.status).toBe('success');
    expect(await rows(DAILY_STATS)).toEqual(EXPECTED_STATS);
    expect(await rows('SELECT status FROM sync_run ORDER BY id')).toEqual([
      { status: 'success' },
      { status: 'success' },
    ]);
  });

  it('records an unknown source name as pending and closes as partial', async () => {
    const withAtlantis = JSON.stringify([
      ...(JSON.parse(FIXTURES.cases) as unknown[]),
      { country: 'Atlantis', region: '', cases: { total: 5, new: 1 } },
    ]);
    const source = fakeSource((metric) => ({
      status: 200,
      body: metric === 'cases' ? withAtlantis : FIXTURES.deaths,
    }));

    const result = await runSync(deps(source.fetch));

    expect(result).toMatchObject({ status: 'partial', pendingNames: ['Atlantis'] });
    expect(
      await rows("SELECT status, country_code FROM country_alias WHERE source_name = 'Atlantis'"),
    ).toEqual([{ status: 'pending', country_code: null }]);
    expect(await rows(DAILY_STATS)).toEqual(EXPECTED_STATS);
    expect(await rows('SELECT error FROM sync_run')).toEqual([
      { error: 'aliases pendentes: Atlantis' },
    ]);
  });

  it('fails when no source name maps to a country', async () => {
    const source = fakeSource((metric) => ({
      status: 200,
      body: JSON.stringify([{ country: 'Atlantis', region: '', [metric]: { total: 5, new: 1 } }]),
    }));

    const result = await runSync(deps(source.fetch));

    expect(result).toMatchObject({ status: 'failed', pendingNames: ['Atlantis'] });
    expect(await rows('SELECT 1 FROM daily_stat')).toEqual([]);
    expect(await rows("SELECT status FROM country_alias WHERE source_name = 'Atlantis'")).toEqual([
      { status: 'pending' },
    ]);
  });

  it('closes the run as failed and frees the lock when the snapshot crashes', async () => {
    const crashing: RunSyncDeps = {
      ...deps(fakeSource().fetch),
      source: {
        sourceCode: 'api_ninjas',
        finalDate: '2023-03-09',
        create: () => ({
          fetchDay: () => Promise.reject(new Error('boom')),
          fetchSeries: () => Promise.reject(new Error('boom')),
        }),
      },
    };

    await expect(runSync(crashing)).rejects.toThrow('boom');
    expect(await rows('SELECT status, error FROM sync_run')).toEqual([
      { status: 'failed', error: 'boom' },
    ]);

    const next = await runSync(deps(fakeSource().fetch));
    expect(next.status).toBe('success');
  });

  it('keeps the cases when the deaths payload is invalid', async () => {
    const source = fakeSource((metric) => ({
      status: 200,
      body: metric === 'cases' ? FIXTURES.cases : '{"unexpected":true}',
    }));

    const result = await runSync(deps(source.fetch));

    expect(result.status).toBe('partial');
    expect(await rows(DAILY_STATS)).toEqual(EXPECTED_STATS.filter((row) => row.metric === 'cases'));
    expect(await rows('SELECT unit, status FROM sync_checkpoint ORDER BY unit')).toEqual([
      { unit: 'snapshot:cases:2023-03-09', status: 'done' },
      { unit: 'snapshot:deaths:2023-03-09', status: 'error' },
    ]);
    expect(await rows('SELECT outcome FROM provider_call ORDER BY id')).toEqual([
      { outcome: 'ok' },
      { outcome: 'invalid_payload' },
    ]);
    expect(
      await rows(
        "SELECT count(*)::int AS count FROM global_daily_stat WHERE stat_date = '2023-03-09'",
      ),
    ).toEqual([{ count: 1 }]);
  });

  it('closes as partial after 3 failed attempts on deaths', async () => {
    const source = fakeSource((metric) =>
      metric === 'cases' ? { status: 200, body: FIXTURES.cases } : { status: 503, body: '' },
    );

    const result = await runSync(deps(source.fetch));

    expect(result).toMatchObject({ status: 'partial', callsUsed: 4 });
    expect(source.requested).toEqual(['cases', 'deaths', 'deaths', 'deaths']);
  });

  it('fails without writing when the key is rejected', async () => {
    const source = fakeSource(() => ({ status: 401, body: '{"error":"Invalid API Key."}' }));

    const result = await runSync(deps(source.fetch));

    expect(result.status).toBe('failed');
    expect(source.requested).toEqual(['cases']);
    expect(await rows('SELECT count(*)::int AS count FROM daily_stat')).toEqual([{ count: 0 }]);
    expect(await rows('SELECT unit, status FROM sync_checkpoint')).toEqual([
      { unit: 'snapshot:cases:2023-03-09', status: 'error' },
    ]);
  });

  it('fails without calling the source when the hourly budget is used up', async () => {
    await owner.query(
      `INSERT INTO provider_call (source_id, endpoint, outcome)
       SELECT ${SOURCE_ID}, '/v1/covid19', 'ok' FROM generate_series(1, 90)`,
    );
    const source = fakeSource();

    const result = await runSync(deps(source.fetch));

    expect(result).toMatchObject({ status: 'failed', callsUsed: 0 });
    expect(source.requested).toEqual([]);
    const checkpoints = await rows<{ error_message: string }>(
      'SELECT error_message FROM sync_checkpoint',
    );
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0]?.error_message).toMatch(/Call budget exhausted/);
  });

  it('fails orphan running runs before starting', async () => {
    await owner.query(
      `INSERT INTO sync_run (source_id, mode, status) VALUES (${SOURCE_ID}, 'snapshot', 'running')`,
    );

    const result = await runSync(deps(fakeSource().fetch));

    expect(result.status).toBe('success');
    expect(await rows('SELECT status, error FROM sync_run ORDER BY id')).toEqual([
      { status: 'failed', error: INTERRUPTED_ERROR },
      { status: 'success', error: null },
    ]);
  });

  it('refreshes the view before closing a data-writing orphan', async () => {
    const orphan = await rows<{ id: number }>(
      `INSERT INTO sync_run (source_id, mode, status) VALUES (${SOURCE_ID}, 'snapshot', 'running') RETURNING id`,
    );
    const orphanId = orphan[0]?.id ?? 0;
    await owner.query(
      `INSERT INTO sync_checkpoint (sync_run_id, unit, status) VALUES ($1, 'snapshot:cases:2020-01-01', 'done')`,
      [orphanId],
    );
    await owner.query(
      `INSERT INTO daily_stat (country_code, metric, stat_date, source_id, total, new_value)
       VALUES ('BRA', 'cases', '2020-01-01', ${SOURCE_ID}, 7, 7)`,
    );
    expect(
      await rows("SELECT 1 FROM global_daily_stat WHERE stat_date = '2020-01-01'"),
    ).toHaveLength(0);

    // The source rejects the key: the recovering run writes nothing, so only the orphan-time
    // refresh can put the orphan's row in the view.
    await runSync(deps(fakeSource(() => ({ status: 401, body: '{}' })).fetch));

    expect(await rows(`SELECT status FROM sync_run WHERE id = ${orphanId}`)).toEqual([
      { status: 'partial' },
    ]);
    expect(
      await rows(
        "SELECT total::int AS total FROM global_daily_stat WHERE stat_date = '2020-01-01' AND metric = 'cases'",
      ),
    ).toEqual([{ total: 7 }]);
  });

  it('refuses to start while another process holds the lock', async () => {
    const holder = new pg.Client({ connectionString: urls.syncUrl });
    await holder.connect();
    try {
      await holder.query('SELECT pg_advisory_lock($1)', [SYNC_LOCK_KEY]);
      const source = fakeSource();

      await expect(runSync(deps(source.fetch))).rejects.toBeInstanceOf(SyncLockedError);
      expect(source.requested).toEqual([]);
      expect(await rows('SELECT count(*)::int AS count FROM sync_run')).toEqual([{ count: 0 }]);
    } finally {
      await holder.end();
    }
  });
});
