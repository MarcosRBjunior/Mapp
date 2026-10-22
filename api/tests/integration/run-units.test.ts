import pg from 'pg';
import type { Logger } from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  LOCK_LOST_NOTE,
  SOURCE_UNSTABLE_NOTE,
  runUnits,
  type RunPlan,
  type RunUnitsDeps,
  type UnitPlan,
} from '../../src/jobs/sync/run-units.js';
import { createLogger } from '../../src/lib/logger.js';
import { createPrisma } from '../../src/lib/prisma.js';
import { ProviderAuthError, ProviderHttpError } from '../../src/providers/provider-errors.js';
import { resetSyncState } from './sync-state.js';
import { loadTestDbUrls } from './test-db.js';

const urls = loadTestDbUrls();
const owner = new pg.Client({ connectionString: urls.syncUrl });
const prisma = createPrisma(urls.syncUrl);

function deps(signal?: AbortSignal): RunUnitsDeps {
  return {
    prisma,
    source: {
      sourceCode: 'api_ninjas',
      finalDate: '2023-03-09',
      create: () => ({
        fetchDay: () => Promise.reject(new Error('not used')),
        fetchSeries: () => Promise.reject(new Error('not used')),
      }),
    },
    fetch: () => Promise.reject(new Error('not used')),
    limits: { perHour: 90, perMonth: 3000 },
    logger: createLogger('silent'),
    signal,
  };
}

// Simulates losing the lock right after a unit was written, when it logs 'unit done'.
function abortAfterUnit(lost: AbortController): RunUnitsDeps {
  const base = deps(lost.signal);
  const logger = {
    child: () => logger,
    info: (_fields: unknown, message?: string) => {
      if (message === 'unit done') lost.abort();
    },
    warn: () => undefined,
    error: () => undefined,
  } as unknown as Logger;
  return { ...base, logger };
}

function writes(code: string): UnitPlan {
  return {
    unit: `test:cases:${code}`,
    load: () =>
      Promise.resolve({
        rows: {
          kind: 'day',
          metric: 'cases',
          statDate: '2023-03-09',
          values: [{ countryCode: code, total: 10, new: 1 }],
        },
        pendingNames: [],
        ignoredNames: [],
      }),
  };
}

function failsWith(error: Error): UnitPlan {
  return { unit: `test:cases:${error.name}`, load: () => Promise.reject(error) };
}

function plan(units: UnitPlan[]): RunPlan {
  return {
    mode: 'full',
    referenceDate: '2023-03-09',
    planUnits: () => Promise.resolve({ units, alreadyDone: 0 }),
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

describe('runUnits', () => {
  it('closes as success with nothing to do and makes no call', async () => {
    const result = await runUnits(deps(), plan([]));
    expect(result).toMatchObject({ status: 'success', callsUsed: 0, unitsRemaining: 0 });
  });

  it('stops after a rejected key once it wrote, closing as partial', async () => {
    const result = await runUnits(
      deps(),
      plan([writes('BRA'), failsWith(new ProviderAuthError(401)), writes('ARG')]),
    );

    expect(result).toMatchObject({ status: 'partial', unitsDone: 1, unitsRemaining: 2 });
    expect(await rows('SELECT country_code FROM daily_stat')).toEqual([{ country_code: 'BRA' }]);
  });

  it('refreshes the view and closes as partial when an unexpected error follows a write', async () => {
    await expect(
      runUnits(deps(), plan([writes('BRA'), failsWith(new Error('boom'))])),
    ).rejects.toThrow('boom');

    expect(await rows('SELECT status, error FROM sync_run')).toEqual([
      { status: 'partial', error: 'boom' },
    ]);
    expect(
      await rows("SELECT country_count FROM global_daily_stat WHERE stat_date = '2023-03-09'"),
    ).toEqual([{ country_count: 1 }]);
  });

  it('stops before the next unit when the lock is lost', async () => {
    const lost = new AbortController();
    const result = await runUnits(abortAfterUnit(lost), plan([writes('BRA'), writes('ARG')]));

    expect(result).toMatchObject({ status: 'partial', unitsDone: 1, unitsRemaining: 1 });
    expect(await rows('SELECT error FROM sync_run')).toEqual([{ error: LOCK_LOST_NOTE }]);
    expect(await rows('SELECT unit FROM sync_checkpoint')).toEqual([{ unit: 'test:cases:BRA' }]);
  });

  it('closes as partial when the lock is lost during the last unit', async () => {
    const lost = new AbortController();
    const result = await runUnits(abortAfterUnit(lost), plan([writes('BRA')]));

    expect(result).toMatchObject({ status: 'partial', unitsDone: 1, unitsRemaining: 0 });
    expect(await rows('SELECT error FROM sync_run')).toEqual([{ error: LOCK_LOST_NOTE }]);
  });

  it('stops after three consecutive source failures', async () => {
    const failing = (n: number): UnitPlan => ({
      unit: `test:cases:fail${n}`,
      load: () => Promise.reject(new ProviderHttpError(503)),
    });

    const result = await runUnits(
      deps(),
      plan([writes('BRA'), failing(1), failing(2), failing(3), failing(4)]),
    );

    expect(result).toMatchObject({ status: 'partial', unitsDone: 1, unitsRemaining: 4 });
    const notes = await rows<{ error: string }>('SELECT error FROM sync_run');
    expect(notes[0]?.error).toContain(SOURCE_UNSTABLE_NOTE);
    expect(await rows("SELECT unit FROM sync_checkpoint WHERE unit = 'test:cases:fail4'")).toEqual(
      [],
    );
  });

  it('does not write the rows of a unit whose lock was lost while loading', async () => {
    const lost = new AbortController();
    const unit: UnitPlan = {
      ...writes('BRA'),
      async load(context) {
        const output = await writes('BRA').load(context);
        lost.abort();
        return output;
      },
    };

    const result = await runUnits(deps(lost.signal), plan([unit, writes('ARG')]));

    expect(result).toMatchObject({ status: 'failed', unitsDone: 0, unitsRemaining: 2 });
    expect(await rows('SELECT error FROM sync_run')).toEqual([{ error: LOCK_LOST_NOTE }]);
    expect(await rows('SELECT country_code FROM daily_stat')).toEqual([]);
  });
});
