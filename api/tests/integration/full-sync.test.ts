import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import type { RawFetch } from '../../src/jobs/sync/call-gate.js';
import { runSync, type RunSyncDeps } from '../../src/jobs/sync/run-sync.js';
import { createLogger } from '../../src/lib/logger.js';
import { createPrisma } from '../../src/lib/prisma.js';
import { apiNinjasFactory } from '../../src/providers/api-ninjas/api-ninjas.provider.js';
import type { Metric } from '../../src/providers/covid-provider.js';
import { createReadRepositories } from '../../src/repositories/read-repositories.js';
import { createServices } from '../../src/services/create-services.js';
import { fixtureText } from '../helpers/api-ninjas-fixtures.js';
import { resetSyncState } from './sync-state.js';
import { loadTestDbUrls } from './test-db.js';

const urls = loadTestDbUrls();
const owner = new pg.Client({ connectionString: urls.syncUrl });
const prisma = createPrisma(urls.syncUrl);
const reader = createPrisma(urls.readerUrl);
const SOURCE_ID = "(SELECT id FROM data_source WHERE code = 'api_ninjas')";
const SERIES: Record<string, string> = {
  'cases:Brazil': fixtureText('series/brazil-cases.json'),
  'cases:Australia': fixtureText('series/australia-cases.json'),
  'deaths:Diamond Princess': fixtureText('series/diamond-princess-deaths.json'),
};
let mappedNames = 0;

type Reply = { status: number; body: string };

// Every other name answers with one point on the reference date.
function fullSource(override?: (call: number, name: string, metric: Metric) => Reply | undefined) {
  const requested: string[] = [];
  const fetch: RawFetch = (url) => {
    const params = new URL(url).searchParams;
    const name = params.get('country') ?? '';
    const metric: Metric = params.get('type') === 'deaths' ? 'deaths' : 'cases';
    requested.push(`${metric}:${name}`);
    const reply = override?.(requested.length, name, metric) ?? {
      status: 200,
      body:
        SERIES[`${metric}:${name}`] ??
        JSON.stringify([
          { country: name, region: '', [metric]: { '2023-03-09': { total: 1, new: 0 } } },
        ]),
    };
    return Promise.resolve(new Response(reply.body, { status: reply.status }));
  };
  return { requested, fetch };
}

function deps(fetch: RawFetch, perHour = 1000): RunSyncDeps {
  return {
    prisma,
    lockUrl: urls.syncUrl,
    mode: 'full',
    fetch,
    limits: { perHour, perMonth: 3000 },
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
  const mapped = await rows<{ n: number }>(
    `SELECT count(*)::int AS n FROM country_alias WHERE status = 'mapped' AND source_id = ${SOURCE_ID}`,
  );
  mappedNames = mapped[0]?.n ?? 0;
});

beforeEach(async () => {
  await resetSyncState(owner);
});

afterAll(async () => {
  await resetSyncState(owner);
  await owner.end();
  await prisma.$disconnect();
  await reader.$disconnect();
});

describe('runSync in full mode', () => {
  it('loads every series and closes as success (exit criterion)', async () => {
    const source = fullSource();

    const result = await runSync(deps(source.fetch));

    const planned = mappedNames * 2;
    expect(result).toMatchObject({
      status: 'success',
      callsUsed: planned,
      unitsPlanned: planned,
      unitsDone: planned,
      unitsRemaining: 0,
    });
    expect(source.requested.slice(0, 2)).toEqual(['cases:Afghanistan', 'cases:Albania']);
    expect(
      await rows(
        `SELECT stat_date::text AS date, total, new_value FROM daily_stat
         WHERE country_code = 'BRA' AND metric = 'cases' ORDER BY stat_date`,
      ),
    ).toEqual([
      { date: '2023-03-05', total: 1000, new_value: 10 },
      { date: '2023-03-06', total: 995, new_value: -5 },
      { date: '2023-03-07', total: 1010, new_value: 15 },
      { date: '2023-03-08', total: 1020, new_value: 10 },
      { date: '2023-03-09', total: 1030, new_value: 10 },
    ]);
    expect(
      await rows(
        `SELECT stat_date::text AS date, total, new_value FROM daily_stat
         WHERE country_code = 'AUS' AND metric = 'cases' ORDER BY stat_date`,
      ),
    ).toEqual([
      { date: '2023-03-08', total: 100, new_value: 5 },
      { date: '2023-03-09', total: 160, new_value: 12 },
    ]);
    expect(
      await rows(
        "SELECT count(*)::int AS n FROM daily_stat WHERE country_code = 'XDP' AND metric = 'deaths'",
      ),
    ).toEqual([{ n: 0 }]);

    const coverage = await createReadRepositories(reader).dataState.findCoverage(
      (await rows<{ id: number }>("SELECT id FROM data_source WHERE code = 'api_ninjas'"))[0]!.id,
    );
    // XDP has no deaths: deaths closes with one country less and still dates the data. Earlier fixture dates are incomplete, so coverage starts at the reference date.
    expect(coverage).toEqual({
      from: '2023-03-09',
      referenceDate: '2023-03-09',
      countries: mappedNames,
    });
  });

  it('resumes after the hourly budget without repeating calls', async () => {
    const first = fullSource();
    const partial = await runSync(deps(first.fetch, 100));
    expect(partial).toMatchObject({ status: 'partial', callsUsed: 100, unitsDone: 100 });

    const second = fullSource();
    const done = await runSync(deps(second.fetch));

    expect(done).toMatchObject({
      status: 'success',
      unitsDone: mappedNames * 2,
      unitsRemaining: 0,
    });
    expect(second.requested.filter((call) => first.requested.includes(call))).toEqual([]);
    expect(await rows('SELECT count(*)::int AS n FROM provider_call')).toEqual([
      { n: mappedNames * 2 },
    ]);
  });

  it('is idempotent: a second full run calls nothing (RN-09)', async () => {
    await runSync(deps(fullSource().fetch));
    const before = await rows('SELECT count(*)::int AS n FROM daily_stat');

    const again = fullSource();
    const result = await runSync(deps(again.fetch));

    expect(result).toMatchObject({ status: 'success', callsUsed: 0, unitsRemaining: 0 });
    expect(again.requested).toEqual([]);
    expect(await rows('SELECT count(*)::int AS n FROM daily_stat')).toEqual(before);
  });

  it('stops on a rejected key after writing and closes as partial', async () => {
    const source = fullSource((call) =>
      call === 3 ? { status: 401, body: '{"error":"Invalid API Key."}' } : undefined,
    );

    const result = await runSync(deps(source.fetch));

    expect(result).toMatchObject({ status: 'partial', callsUsed: 3, unitsDone: 2 });
    expect(source.requested).toHaveLength(3);
  });

  it('stops the full run as partial when the source keeps answering 429', async () => {
    const source = fullSource((call) =>
      call >= 3 && call <= 5 ? { status: 429, body: '' } : undefined,
    );

    const result = await runSync(deps(source.fetch));

    expect(result).toMatchObject({ status: 'partial', unitsDone: 2, callsUsed: 5 });
    const runs = await rows<{ error: string | null }>('SELECT error FROM sync_run');
    expect(runs[0]?.error).toContain('Provider rate limit reached (HTTP 429)');
  });

  it('retries the units an interrupted run left pending, and only those', async () => {
    const orphan = await rows<{ id: number }>(
      `INSERT INTO sync_run (source_id, mode, status) VALUES (${SOURCE_ID}, 'full', 'running') RETURNING id`,
    );
    const earlier = await rows<{ id: number }>(
      `INSERT INTO sync_run (source_id, mode, status) VALUES (${SOURCE_ID}, 'full', 'partial') RETURNING id`,
    );
    await owner.query(
      `INSERT INTO sync_checkpoint (sync_run_id, unit, status) VALUES
         ($1, 'full:cases:Afghanistan', 'pending'), ($2, 'full:cases:Albania', 'done')`,
      [orphan[0]?.id, earlier[0]?.id],
    );
    const source = fullSource();

    const result = await runSync(deps(source.fetch));

    expect(result).toMatchObject({ status: 'success', unitsDone: mappedNames * 2 });
    expect(source.requested).toContain('cases:Afghanistan');
    expect(source.requested).not.toContain('cases:Albania');
    expect(await rows(`SELECT status FROM sync_run WHERE id = ${orphan[0]?.id ?? 0}`)).toEqual([
      { status: 'failed' },
    ]);
  });

  it('keeps /ready at 200 after a full run crashes having written rows', async () => {
    // Snapshot first: the reference date exists for both metrics.
    await runSync({
      ...deps((url) =>
        Promise.resolve(
          new Response(
            fixtureText(
              `date-2023-03-09-${new URL(url).searchParams.get('type') === 'deaths' ? 'deaths' : 'cases'}.json`,
            ),
            { status: 200 },
          ),
        ),
      ),
      mode: 'snapshot',
    });
    const real = apiNinjasFactory('test-key');
    let calls = 0;
    const crashing: RunSyncDeps = {
      ...deps(fullSource().fetch),
      source: {
        ...real,
        create: (fetch) => {
          const provider = real.create(fetch);
          return {
            fetchDay: (date, metric) => provider.fetchDay(date, metric),
            fetchSeries: (name, metric) => {
              calls += 1;
              return calls === 3
                ? Promise.reject(new Error('boom'))
                : provider.fetchSeries(name, metric);
            },
          };
        },
      },
    };

    await expect(runSync(crashing)).rejects.toThrow('boom');

    const app = createApp({
      services: createServices(createReadRepositories(reader), 'api_ninjas'),
      logger: createLogger('silent'),
      webOrigin: 'http://localhost:5173',
    });
    const ready = await request(app).get('/ready');
    expect(ready.status).toBe(200);
    expect(ready.body).toMatchObject({ status: 'ready', referenceDate: '2023-03-09' });
  });
});
