import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrisma } from '../../src/lib/prisma.js';
import { insertPendingAliases, loadAliases } from '../../src/repositories/alias.repository.js';
import { upsertDailyStats, upsertSeries } from '../../src/repositories/daily-stat.repository.js';
import { findSourceId } from '../../src/repositories/data-source.repository.js';
import { refreshGlobalDailyStat } from '../../src/repositories/global-stat.repository.js';
import { createProviderCallStore } from '../../src/repositories/provider-call.repository.js';
import { SYNC_LOCK_KEY, tryAcquireSyncLock } from '../../src/repositories/sync-lock.repository.js';
import {
  INTERRUPTED_ERROR,
  completeCheckpoint,
  failCheckpoint,
  closeOrphanRuns,
  finishRun,
  startCheckpoint,
  findDoneUnits,
  startRun,
} from '../../src/repositories/sync-run.repository.js';
import { writeUnit } from '../../src/repositories/sync-unit.repository.js';
import { resetSyncState } from './sync-state.js';
import { loadTestDbUrls } from './test-db.js';

const urls = loadTestDbUrls();
const owner = new pg.Client({ connectionString: urls.syncUrl });
const prisma = createPrisma(urls.syncUrl);
const UNIT = 'snapshot:cases:2023-03-09';
let sourceId = 0;

beforeAll(async () => {
  await owner.connect();
  const id = await findSourceId(prisma, 'api_ninjas');
  if (id === null) {
    throw new Error('api_ninjas source missing: the global setup should have seeded it');
  }
  sourceId = id;
});

beforeEach(async () => {
  await resetSyncState(owner);
});

afterAll(async () => {
  await resetSyncState(owner);
  await owner.end();
  await prisma.$disconnect();
});

function openRun(): Promise<number> {
  return startRun(prisma, { sourceId, mode: 'snapshot', referenceDate: '2023-03-09' });
}

describe('data sources and aliases', () => {
  it('finds the seeded source and returns null for an unknown code', async () => {
    expect(sourceId).toBeGreaterThan(0);
    expect(await findSourceId(prisma, 'nope')).toBeNull();
  });

  it('loads the curated aliases', async () => {
    const aliases = await loadAliases(prisma, sourceId);
    expect(aliases.size).toBe(202);
    expect(aliases.get('Brazil')).toEqual({ status: 'mapped', countryCode: 'BRA' });
  });

  it('inserts pending aliases without touching existing ones', async () => {
    await insertPendingAliases(prisma, sourceId, ['Atlantis', 'Brazil']);
    await insertPendingAliases(prisma, sourceId, ['Atlantis']);
    await insertPendingAliases(prisma, sourceId, []);
    const aliases = await loadAliases(prisma, sourceId);
    expect(aliases.get('Atlantis')).toEqual({ status: 'pending', countryCode: null });
    expect(aliases.get('Brazil')).toEqual({ status: 'mapped', countryCode: 'BRA' });
    expect(aliases.size).toBe(203);
  });
});

describe('daily stats', () => {
  it('upserts by key and refreshes updated_at (RN-09)', async () => {
    const day = { sourceId, metric: 'cases' as const, statDate: '2023-03-09' };
    expect(
      await upsertDailyStats(prisma, {
        ...day,
        values: [
          { countryCode: 'BRA', total: 10, new: 1 },
          { countryCode: 'XDP', total: 7, new: -2 },
        ],
      }),
    ).toBe(2);
    const before = await owner.query<{ updated_at: Date }>(
      "SELECT updated_at FROM daily_stat WHERE country_code = 'BRA'",
    );

    await upsertDailyStats(prisma, { ...day, values: [{ countryCode: 'BRA', total: 11, new: 2 }] });

    const after = await owner.query<{
      country_code: string;
      total: number;
      new_value: number;
      updated_at: Date;
    }>('SELECT country_code, total, new_value, updated_at FROM daily_stat ORDER BY country_code');
    expect(
      after.rows.map(({ country_code, total, new_value }) => ({ country_code, total, new_value })),
    ).toEqual([
      { country_code: 'BRA', total: 11, new_value: 2 },
      { country_code: 'XDP', total: 7, new_value: -2 },
    ]);
    expect(after.rows[0]?.updated_at.getTime()).toBeGreaterThan(
      before.rows[0]?.updated_at.getTime() ?? Number.POSITIVE_INFINITY,
    );
  });

  it('ignores an empty batch', async () => {
    expect(
      await upsertDailyStats(prisma, {
        sourceId,
        metric: 'cases',
        statDate: '2023-03-09',
        values: [],
      }),
    ).toBe(0);
  });

  it('feeds the global view after a refresh', async () => {
    await upsertDailyStats(prisma, {
      sourceId,
      metric: 'deaths',
      statDate: '2023-03-09',
      values: [
        { countryCode: 'BRA', total: 5, new: 1 },
        { countryCode: 'ARG', total: 3, new: 0 },
      ],
    });
    await refreshGlobalDailyStat(prisma);
    const view = await owner.query(
      "SELECT total::text AS total, new_value::text AS new_value, country_count FROM global_daily_stat WHERE metric = 'deaths' AND stat_date = '2023-03-09'",
    );
    expect(view.rows).toEqual([{ total: '8', new_value: '1', country_count: 2 }]);
  });
});

describe('sync runs and checkpoints', () => {
  it('opens a running run with the reference date and allows only one', async () => {
    const runId = await openRun();
    const run = await owner.query(
      'SELECT status, mode, reference_date::text AS reference_date FROM sync_run WHERE id = $1',
      [runId],
    );
    expect(run.rows).toEqual([
      { status: 'running', mode: 'snapshot', reference_date: '2023-03-09' },
    ]);
    await expect(openRun()).rejects.toThrow();
  });

  it('fails an orphan run that finished no unit', async () => {
    const runId = await openRun();
    expect(await closeOrphanRuns(prisma, [runId])).toEqual([{ id: runId, status: 'failed' }]);
    const run = await owner.query(
      'SELECT status, error, finished_at IS NOT NULL AS finished FROM sync_run WHERE id = $1',
      [runId],
    );
    expect(run.rows).toEqual([{ status: 'failed', error: INTERRUPTED_ERROR, finished: true }]);
    expect(await closeOrphanRuns(prisma, [])).toEqual([]);
  });

  it('closes as partial an orphan run that finished a unit (it wrote data)', async () => {
    const runId = await openRun();
    await owner.query(
      "INSERT INTO sync_checkpoint (sync_run_id, unit, status) VALUES ($1, 'u1', 'done'), ($1, 'u2', 'pending')",
      [runId],
    );

    expect(await closeOrphanRuns(prisma, [runId])).toEqual([{ id: runId, status: 'partial' }]);
    const run = await owner.query('SELECT status, error FROM sync_run WHERE id = $1', [runId]);
    expect(run.rows).toEqual([{ status: 'partial', error: INTERRUPTED_ERROR }]);
  });

  it('records the calls an orphan run made when failing it', async () => {
    const runId = await openRun();
    const store = createProviderCallStore(prisma, { sourceId, syncRunId: runId });
    for (const outcome of ['ok', 'timeout'] as const) {
      await store.record({
        endpoint: '/v1/covid19?date=2023-03-09&type=cases',
        statusCode: null,
        durationMs: 5,
        outcome,
      });
    }
    await closeOrphanRuns(prisma, [runId]);
    const run = await owner.query('SELECT calls_used FROM sync_run WHERE id = $1', [runId]);
    expect(run.rows).toEqual([{ calls_used: 2 }]);
  });

  it('tracks checkpoint attempts and outcomes', async () => {
    const runId = await openRun();
    await startCheckpoint(prisma, runId, UNIT);
    await failCheckpoint(prisma, runId, UNIT, 'boom');
    await startCheckpoint(prisma, runId, UNIT);
    await completeCheckpoint(prisma, runId, UNIT);
    const checkpoints = await owner.query(
      'SELECT unit, status, attempts, error_message FROM sync_checkpoint WHERE sync_run_id = $1',
      [runId],
    );
    expect(checkpoints.rows).toEqual([
      { unit: UNIT, status: 'done', attempts: 2, error_message: null },
    ]);
  });

  it('closes a run with the number of calls it made', async () => {
    const runId = await openRun();
    const store = createProviderCallStore(prisma, { sourceId, syncRunId: runId });
    await store.record({
      endpoint: '/v1/covid19?date=2023-03-09&type=cases',
      statusCode: 200,
      durationMs: 12,
      outcome: 'ok',
    });
    await store.record({
      endpoint: '/v1/covid19?date=2023-03-09&type=deaths',
      statusCode: 503,
      durationMs: 8,
      outcome: 'http_error',
    });
    expect(await finishRun(prisma, runId, { status: 'partial', error: 'x' })).toBe(2);
    const run = await owner.query(
      'SELECT status, error, calls_used, finished_at IS NOT NULL AS finished FROM sync_run WHERE id = $1',
      [runId],
    );
    expect(run.rows).toEqual([{ status: 'partial', error: 'x', calls_used: 2, finished: true }]);
  });
});

describe('provider call store', () => {
  it('counts the last hour and the UTC month with the database clock', async () => {
    const runId = await openRun();
    const store = createProviderCallStore(prisma, { sourceId, syncRunId: runId });
    const id = await store.record({
      endpoint: '/v1/covid19?date=2023-03-09&type=deaths',
      statusCode: 200,
      durationMs: 5,
      outcome: 'ok',
    });
    expect(typeof id).toBe('bigint');
    await owner.query(
      `INSERT INTO provider_call (source_id, endpoint, outcome, called_at) VALUES
         ($1, '/a', 'ok', now() - interval '30 minutes'),
         ($1, '/b', 'ok', now() - interval '2 hours'),
         ($1, '/c', 'ok', now() - interval '40 days')`,
      [sourceId],
    );
    const clock = await owner.query<{ now: Date; month_start: Date }>(
      `SELECT now() AS now,
              date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS month_start`,
    );
    const { now, month_start: monthStart } = clock.rows[0]!;
    const inMonth = [0, 30 * 60_000, 2 * 3_600_000].filter(
      (ago) => now.getTime() - ago >= monthStart.getTime(),
    ).length;

    expect(await store.countUsage()).toEqual({ lastHour: 2, thisMonth: inMonth });

    await store.markInvalidPayload(id);
    const calls = await owner.query(
      "SELECT outcome FROM provider_call WHERE endpoint LIKE '/v1/%'",
    );
    expect(calls.rows).toEqual([{ outcome: 'invalid_payload' }]);
  });
});

describe('sync lock', () => {
  it('uses the documented key', () => {
    expect(SYNC_LOCK_KEY).toBe(0x6d617070);
  });

  it('lets only one holder acquire the advisory lock', async () => {
    const first = await tryAcquireSyncLock(urls.syncUrl);
    try {
      expect(first).not.toBeNull();
      expect(await tryAcquireSyncLock(urls.syncUrl)).toBeNull();
    } finally {
      await first?.release();
    }
    const again = await tryAcquireSyncLock(urls.syncUrl);
    try {
      expect(again).not.toBeNull();
    } finally {
      await again?.release();
    }
  });

  it('signals when the lock connection is lost', async () => {
    const lock = await tryAcquireSyncLock(urls.syncUrl);
    if (lock === null) throw new Error('lock not acquired');
    expect(lock.lost.aborted).toBe(false);

    await owner.query(
      `SELECT pg_terminate_backend(pid) FROM pg_locks
       WHERE locktype = 'advisory' AND objid = $1 AND granted`,
      [SYNC_LOCK_KEY],
    );

    await vi.waitFor(() => {
      expect(lock.lost.aborted).toBe(true);
    });
    await expect(lock.release()).resolves.toBeUndefined();
  });
});

describe('series upsert', () => {
  it('upserts a country series by key (RN-09)', async () => {
    const points = [
      { date: '2023-03-08', total: 100, new: 5 },
      { date: '2023-03-09', total: 110, new: -2 },
    ];
    expect(
      await upsertSeries(prisma, { sourceId, metric: 'cases', countryCode: 'BRA', points }),
    ).toBe(2);
    await upsertSeries(prisma, {
      sourceId,
      metric: 'cases',
      countryCode: 'BRA',
      points: [{ date: '2023-03-09', total: 111, new: -1 }],
    });

    const result = await owner.query(
      `SELECT stat_date::text AS date, total, new_value FROM daily_stat
       WHERE country_code = 'BRA' AND metric = 'cases' ORDER BY stat_date`,
    );
    expect(result.rows).toEqual([
      { date: '2023-03-08', total: 100, new_value: 5 },
      { date: '2023-03-09', total: 111, new_value: -1 },
    ]);
  });

  it('ignores an empty series', async () => {
    expect(
      await upsertSeries(prisma, { sourceId, metric: 'deaths', countryCode: 'XDP', points: [] }),
    ).toBe(0);
  });
});

describe('unit write', () => {
  it('writes pending aliases, the rows and the done checkpoint in one transaction', async () => {
    const runId = await openRun();
    await startCheckpoint(prisma, runId, 'full:cases:Brazil');

    const written = await writeUnit(prisma, {
      sourceId,
      runId,
      unit: 'full:cases:Brazil',
      pendingNames: ['Atlantis'],
      rows: {
        kind: 'series',
        metric: 'cases',
        series: [{ countryCode: 'BRA', points: [{ date: '2023-03-09', total: 1, new: 1 }] }],
      },
    });

    expect(written).toBe(1);
    expect(
      (
        await owner.query('SELECT unit, status FROM sync_checkpoint WHERE sync_run_id = $1', [
          runId,
        ])
      ).rows,
    ).toEqual([{ unit: 'full:cases:Brazil', status: 'done' }]);
    expect(
      (await owner.query("SELECT status FROM country_alias WHERE source_name = 'Atlantis'")).rows,
    ).toEqual([{ status: 'pending' }]);
  });

  it('rolls everything back when the checkpoint does not exist', async () => {
    const runId = await openRun();

    await expect(
      writeUnit(prisma, {
        sourceId,
        runId,
        unit: 'full:cases:Nowhere',
        pendingNames: [],
        rows: {
          kind: 'day',
          metric: 'cases',
          statDate: '2023-03-09',
          values: [{ countryCode: 'ARG', total: 7, new: 0 }],
        },
      }),
    ).rejects.toThrow();
    expect(
      (await owner.query("SELECT count(*)::int AS n FROM daily_stat WHERE country_code = 'ARG'"))
        .rows,
    ).toEqual([{ n: 0 }]);
  });
});

describe('done units', () => {
  it('lists units done in runs of the same source and mode', async () => {
    const fullRun = await owner.query<{ id: number }>(
      `INSERT INTO sync_run (source_id, mode, status) VALUES ($1, 'full', 'partial') RETURNING id`,
      [sourceId],
    );
    const snapshotRun = await owner.query<{ id: number }>(
      `INSERT INTO sync_run (source_id, mode, status) VALUES ($1, 'snapshot', 'success') RETURNING id`,
      [sourceId],
    );
    await owner.query(
      `INSERT INTO sync_checkpoint (sync_run_id, unit, status) VALUES
         ($1, 'full:cases:Brazil', 'done'), ($1, 'full:cases:Chile', 'error'),
         ($1, 'full:deaths:Brazil', 'pending'), ($2, 'snapshot:cases:2023-03-09', 'done')`,
      [fullRun.rows[0]?.id, snapshotRun.rows[0]?.id],
    );

    expect(await findDoneUnits(prisma, sourceId, 'full')).toEqual(new Set(['full:cases:Brazil']));
  });
});
