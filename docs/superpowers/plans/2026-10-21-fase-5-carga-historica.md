# Fase 5 — Carga histórica Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load the full historical series with a resumable `--mode=full` sync. The same plan computes coverage from the view per metric, adds the 429/Retry-After policy, applies the new `failed` rule, makes the lock-loss handling safe, and adds a manual `sync.yml` workflow.

**Architecture:**
- **Executor:** one unit executor (`run-units.ts`) runs a `RunPlan`. The snapshot plan has 2 day units; the full plan has 404 series units, minus those already `done`.
- **Provider:** a `ProviderFactory` gives the source code and final date before any call. That lets the run, the `CallGate` and the provider be built in order, without `gateRef`.
- **Repositories:** the unit write (aliases + upsert + checkpoint) is one repository transaction.
- **Coverage:** computed only from the materialized view.

**Tech Stack:** Node 24, TypeScript ~6.0.3 (NodeNext, `.js` imports), zod 4, Prisma 7.10 + `pg`, pino, Vitest 5 (unit + integration against local Postgres `mapp_test`), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-21-fase-5-carga-historica-design.md`

## Global Constraints

- **Language:** code, identifiers, error messages and log messages in English; docs and run notes (`sync_run.error`) in pt-BR, as already done ("aliases pendentes: …").
- **TypeScript:** `strict`, no `any`, `verbatimModuleSyntax` (`import type`), `erasableSyntaxOnly` (no parameter properties, no enums), `noUncheckedIndexedAccess`. Relative imports end in `.js`.
- **Lint:** ESLint `recommendedTypeChecked` (no floating promises, no unsafe any). Prettier `singleQuote`, `printWidth: 100`.
- **Layers:**
  - SQL/Prisma only in `api/src/repositories`.
  - `jobs/sync` orchestrates.
  - Providers never touch the database.
- **No external calls:**
  - tests never touch the network (`tests/setup/no-network.ts` blocks `fetch`), so inject a fake `fetch`;
  - fixtures are invented numbers (the repo is public and the source's terms forbid storing its data);
  - **never** run `npm run sync` against the real source, and never read, print or commit `.env`.
- **Database:** use only the local `mapp-db-1` container (127.0.0.1:5435); integration tests recreate `mapp_test` themselves. Never run `docker compose down -v`.
- **Business rules:**
  - RN-02: regions of a country are summed per date.
  - RN-07: a negative `new` is stored as it came.
  - RN-09: the upsert is idempotent by (country, metric, date, source).
  - RN-06: as redefined in the spec, the reference date is computed from the view, per metric.
- **Run status (spec):**
  - `failed` only when the run wrote no rows;
  - `partial` when a unit had an error, a name is `pending`, units were left, or the lock was lost;
  - `success` otherwise;
  - a run with zero units to do is `success`.
- **Commits:** one per task, Conventional Commits, on branch `feat/historical-sync`.
- **Exit criteria for every task:**
  - `npm run lint`, `npm run typecheck` and `npm test` are green;
  - when the task touches SQL or the job, `npm run test:integration -w api` is green too (Postgres `mapp-db-1` must be running: `docker compose up -d`).

## Rulings made while writing the plan

- **Executor tests run against the database.** Its behaviour (lock loss, unexpected error after a write, auth after a write) is tested in `tests/integration/run-units.test.ts`, against the database instead of with mocks. The spec listed `run-units.test.ts` as a unit test. Only the pure parts (`decideStatus`, `bestEffort`) have unit tests.
- **No test that `finishRun` fails.** Forcing that failure would need a Prisma proxy. The "original error is rethrown" rule is covered by `bestEffort`'s unit test plus the executor's integration test.
- **429 message in English.** The final 429 raises `BudgetExhaustedError` with the English message `Provider rate limit reached (HTTP 429)`, following the code-language rule. The spec quoted a pt-BR text.
- **Shape of `BudgetExhaustedError`.** It now takes a message, and a `budgetExhausted(counts, limits)` factory builds the budget message. `monthStartUtc` and `hourAgo` are removed: the database computes both windows.

---

### Task 1: Coverage from the view, per metric (RN-06)

**Files:**
- Modify: `api/src/repositories/data-state.repository.ts` (`findCoverage`)
- Create: `api/tests/integration/coverage.test.ts`

**Interfaces:**
- Produces: `findCoverage(sourceId): Promise<{ from: string | null; referenceDate: string | null; countries: number }>`. The signature is unchanged; only the calculation changes.

- [ ] **Step 1: Write the failing integration test**

`api/tests/integration/coverage.test.ts`:

```ts
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

  it('has no reference date while one metric has no data at all', async () => {
    await insert([['BRA', 'cases', D1]]);
    await refresh();

    expect(await repos.dataState.findCoverage(sourceId)).toEqual({
      from: D1,
      referenceDate: null,
      countries: 1,
    });
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
```

Run: `npm run test:integration -w api -- coverage`. Expected: FAIL in "closes a date when each metric has its own full count" (the old query counts 2 present countries and deaths has 1, so `referenceDate` is `null`) and in "ignores rows written after the last refresh".

- [ ] **Step 2: Rewrite `findCoverage`**

In `api/src/repositories/data-state.repository.ts`, replace the comment and body of `findCoverage` with:

```ts
    // RN-06 from the view only: N of a metric is its highest country_count; the reference date
    // is the last date where both metrics reach their own N. Rows not yet refreshed are ignored.
    async findCoverage(sourceId) {
      const [row] = await db.$queryRaw<CoverageRow[]>`
        WITH n AS (
          SELECT metric, max(country_count) AS n
          FROM global_daily_stat WHERE source_id = ${sourceId}
          GROUP BY metric
        ), complete AS (
          SELECT g.stat_date
          FROM global_daily_stat g JOIN n ON n.metric = g.metric
          WHERE g.source_id = ${sourceId} AND g.country_count = n.n
          GROUP BY g.stat_date
          HAVING count(*) = 2
        )
        SELECT
          (SELECT min(stat_date) FROM global_daily_stat WHERE source_id = ${sourceId}) AS "from",
          (SELECT max(stat_date) FROM complete) AS "referenceDate",
          coalesce((SELECT max(n) FROM n), 0)::int AS countries`;
      return {
        from: row?.from ? toIsoDate(row.from) : null,
        referenceDate: row?.referenceDate ? toIsoDate(row.referenceDate) : null,
        countries: row?.countries ?? 0,
      };
    },
```

Run: `npm run test:integration -w api`. Expected: PASS, including `coverage.test.ts`. The existing `read-repositories.test.ts` and `api.test.ts` keep their expectations: `{ from: D1, referenceDate: D1, countries: 3 }`, because in that fixture both metrics have N = 3 on D1.

- [ ] **Step 3: Commit**

```bash
npx prettier --write api/src/repositories/data-state.repository.ts api/tests/integration/coverage.test.ts
npm run lint && npm run typecheck && npm test
git add api/src/repositories/data-state.repository.ts api/tests/integration/coverage.test.ts
git commit -m "fix: compute the reference date from the view, per metric"
```

---

### Task 2: Budget counted by the database, Retry-After and final 429

**Files:**
- Modify: `api/src/jobs/sync/budget.ts`, `api/src/jobs/sync/call-gate.ts`, `api/src/repositories/provider-call.repository.ts`
- Modify tests: `api/tests/unit/jobs/sync/budget.test.ts`, `api/tests/unit/jobs/sync/call-gate.test.ts`, `api/tests/integration/repositories.test.ts`

**Interfaces:**
- Produces:
  - `budget.ts`: `BudgetExhaustedError(message: string)`, `budgetExhausted(counts: CallCounts, limits: BudgetLimits): BudgetExhaustedError`, `isBudgetExhausted`, `CallCounts`, `BudgetLimits`. `monthStartUtc` and `hourAgo` are removed.
  - `call-gate.ts`: `ProviderCallStore { countUsage(): Promise<CallCounts>; record(call): Promise<bigint>; markInvalidPayload(id): Promise<void> }`; `CallGateOptions` loses `now`; `parseRetryAfter(value: string | null): number | null` (ms); `RATE_LIMIT_MESSAGE = 'Provider rate limit reached (HTTP 429)'`.
  - `provider-call.repository.ts`: `createProviderCallStore(db, scope)` returns `{ countUsage, record, markInvalidPayload }`.

- [ ] **Step 1: Update the budget module and its test**

`api/src/jobs/sync/budget.ts` (replace the whole file):

```ts
export interface BudgetLimits {
  perHour: number;
  perMonth: number;
}

export interface CallCounts {
  lastHour: number;
  thisMonth: number;
}

export class BudgetExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetExhaustedError';
  }
}

export function budgetExhausted(counts: CallCounts, limits: BudgetLimits): BudgetExhaustedError {
  return new BudgetExhaustedError(
    `Call budget exhausted: ${counts.lastHour}/${limits.perHour} in the last hour, ` +
      `${counts.thisMonth}/${limits.perMonth} this month (UTC)`,
  );
}

export function isBudgetExhausted(counts: CallCounts, limits: BudgetLimits): boolean {
  return counts.lastHour >= limits.perHour || counts.thisMonth >= limits.perMonth;
}
```

In `api/tests/unit/jobs/sync/budget.test.ts`:
- delete the `describe('monthStartUtc')` and `describe('hourAgo')` blocks and their imports;
- replace the `BudgetExhaustedError` block with:

```ts
describe('budgetExhausted', () => {
  it('explains both counters', () => {
    const error = budgetExhausted({ lastHour: 90, thisMonth: 120 }, LIMITS);
    expect(error).toBeInstanceOf(BudgetExhaustedError);
    expect(error.message).toBe(
      'Call budget exhausted: 90/90 in the last hour, 120/3000 this month (UTC)',
    );
  });
});
```

The import line becomes `import { BudgetExhaustedError, budgetExhausted, isBudgetExhausted } from '../../../../src/jobs/sync/budget.js';`.

- [ ] **Step 2: Write the failing CallGate tests**

In `api/tests/unit/jobs/sync/call-gate.test.ts`, change `memoryStore` so the store exposes `countUsage` instead of `countSince`:

```ts
    countUsage: () =>
      Promise.resolve({ lastHour: alreadyUsed + calls.length, thisMonth: alreadyUsed + calls.length }),
```

Add `parseRetryAfter` and `RATE_LIMIT_MESSAGE` to the import from `call-gate.js`. Then add these tests inside `describe('createCallGate')`:

```ts
  it('waits the Retry-After seconds on a 429', async () => {
    const { fetch } = scriptedFetch(
      new Response('[]', { status: 429, headers: { 'Retry-After': '5' } }),
      200,
    );
    const { delays, sleep } = recordingSleep();
    const { store } = memoryStore();

    const response = await createCallGate({ store, limits: LIMITS, fetch, sleep }).fetch(URL_CASES, {
      headers: HEADERS,
    });

    expect(response.status).toBe(200);
    expect(delays).toEqual([5_000]);
  });

  it('falls back to the default delay for an invalid or long Retry-After', async () => {
    const { fetch } = scriptedFetch(
      new Response('[]', { status: 429, headers: { 'Retry-After': '120' } }),
      new Response('[]', { status: 429, headers: { 'Retry-After': 'Wed, 21 Oct 2026 07:28:00 GMT' } }),
      200,
    );
    const { delays, sleep } = recordingSleep();
    const { store } = memoryStore();

    await createCallGate({ store, limits: LIMITS, fetch, sleep }).fetch(URL_CASES, {
      headers: HEADERS,
    });

    expect(delays).toEqual([1_000, 2_000]);
  });

  it('treats a 429 on the last attempt as an exhausted budget', async () => {
    const { calls, store } = memoryStore();
    const { fetch } = scriptedFetch(429, 429, 429);

    const failure = createCallGate({
      store,
      limits: LIMITS,
      fetch,
      sleep: recordingSleep().sleep,
    }).fetch(URL_CASES, { headers: HEADERS });

    await expect(failure).rejects.toBeInstanceOf(BudgetExhaustedError);
    await expect(failure).rejects.toThrow(RATE_LIMIT_MESSAGE);
    expect(calls).toHaveLength(3);
  });
```

And a pure test for the parser, after the `describe('createCallGate')` block:

```ts
describe('parseRetryAfter', () => {
  it('accepts whole seconds from 1 to 60', () => {
    expect(parseRetryAfter('1')).toBe(1_000);
    expect(parseRetryAfter('60')).toBe(60_000);
  });

  it('rejects anything else', () => {
    for (const value of [null, '', '0', '61', '1.5', '-3', 'soon', 'Wed, 21 Oct 2026 07:28:00 GMT']) {
      expect(parseRetryAfter(value)).toBeNull();
    }
  });
});
```

The existing test "gives up after 3 attempts on 5xx and returns the last response" stays unchanged; 5xx keeps the old behaviour. If an existing test asserted that a last 429 is returned as a response, change it to expect `BudgetExhaustedError`, and mention it in the report.

Run: `npm test -w api -- call-gate budget`. Expected: FAIL (missing exports / `countUsage`).

- [ ] **Step 3: Implement the gate changes**

In `api/src/jobs/sync/call-gate.ts`:
- Update the imports from `./budget.js`: `BudgetExhaustedError`, `budgetExhausted`, `isBudgetExhausted`, `type BudgetLimits`, `type CallCounts`.
- `ProviderCallStore` becomes:

```ts
export interface ProviderCallStore {
  countUsage(): Promise<CallCounts>;
  record(call: CallRecord): Promise<bigint>;
  markInvalidPayload(id: bigint): Promise<void>;
}
```

- Remove `now` from `CallGateOptions` and from `createCallGate`.
- Add, after `RETRY_DELAYS_MS`:

```ts
const MAX_RETRY_AFTER_SECONDS = 60;

export const RATE_LIMIT_MESSAGE = 'Provider rate limit reached (HTTP 429)';

// Only whole seconds from 1 to 60 are honoured; anything else falls back to the default delay.
export function parseRetryAfter(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const seconds = Number(value);
  return seconds >= 1 && seconds <= MAX_RETRY_AFTER_SECONDS ? seconds * 1_000 : null;
}

function retryDelay(attempt: Attempt, attemptNumber: number): number {
  const fallback = RETRY_DELAYS_MS[attemptNumber - 1] ?? RETRY_DELAYS_MS[1];
  if (attempt.kind === 'response' && attempt.response.status === 429) {
    return parseRetryAfter(attempt.response.headers.get('Retry-After')) ?? fallback;
  }
  return fallback;
}
```

- `assertBudget` becomes:

```ts
  async function assertBudget(): Promise<void> {
    const counts = await options.store.countUsage();
    if (isBudgetExhausted(counts, options.limits)) {
      throw budgetExhausted(counts, options.limits);
    }
  }
```

- In `gatedFetch`, replace the final-attempt branch and the sleep with:

```ts
      if (!retryable || attemptNumber >= MAX_ATTEMPTS) {
        if (attempt.kind === 'failure') {
          throw attempt.error;
        }
        if (attempt.response.status === 429) {
          // The source says its own quota is gone: stop the run instead of burning more calls.
          throw new BudgetExhaustedError(RATE_LIMIT_MESSAGE);
        }
        return attempt.response;
      }
      await sleep(retryDelay(attempt, attemptNumber));
```

- [ ] **Step 4: Count the budget in one query with the database clock**

In `api/src/repositories/provider-call.repository.ts`, replace `countSince` in the interface and the implementation:

```ts
export interface ProviderCallRepository {
  countUsage(): Promise<{ lastHour: number; thisMonth: number }>;
  record(call: ProviderCallInput): Promise<bigint>;
  markInvalidPayload(id: bigint): Promise<void>;
}
```

```ts
    // One query with the database clock: the last hour and the UTC calendar month.
    async countUsage() {
      const [row] = await db.$queryRaw<{ lastHour: number; thisMonth: number }[]>`
        SELECT
          count(*) FILTER (WHERE called_at >= now() - interval '1 hour')::int AS "lastHour",
          count(*) FILTER (
            WHERE called_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
          )::int AS "thisMonth"
        FROM provider_call
        WHERE source_id = ${scope.sourceId}
          AND called_at >= least(
            now() - interval '1 hour',
            date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
          )`;
      return { lastHour: row?.lastHour ?? 0, thisMonth: row?.thisMonth ?? 0 };
    },
```

- [ ] **Step 5: Update the repository integration test**

In `api/tests/integration/repositories.test.ts`, replace the test `'counts calls since an instant and marks invalid payloads'` with:

```ts
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
    const calls = await owner.query("SELECT outcome FROM provider_call WHERE endpoint LIKE '/v1/%'");
    expect(calls.rows).toEqual([{ outcome: 'invalid_payload' }]);
  });
```

If `clock.rows[0]!` breaks lint (`no-non-null-assertion` is not in the config, so it should not), use an explicit guard. Note that the recorded call happened "now", so it is counted in both windows.

Run: `npm test -w api` and `npm run test:integration -w api`. Expected: PASS. The snapshot integration test "fails without calling the source when the hourly budget is used up" must still pass, since its 90 rows use `called_at = now()`.

- [ ] **Step 6: Commit**

```bash
npx prettier --write api/src/jobs/sync api/src/repositories/provider-call.repository.ts api/tests/unit/jobs/sync api/tests/integration/repositories.test.ts
npm run lint && npm run typecheck && npm test
git add api/src api/tests
git commit -m "feat: count the call budget in the database and honour Retry-After"
```

---

### Task 3: Series from the provider and per-date region sums

**Files:**
- Modify: `api/src/providers/covid-provider.ts`, `api/src/providers/api-ninjas/api-ninjas.schemas.ts`, `api/src/providers/api-ninjas/api-ninjas.provider.ts`, `api/src/jobs/sync/aggregate.ts`
- Create fixtures: `api/tests/fixtures/api-ninjas/series/brazil-cases.json`, `australia-cases.json`, `diamond-princess-deaths.json`
- Modify: `api/tests/helpers/api-ninjas-fixtures.ts`
- Create tests: `api/tests/unit/providers/api-ninjas.series.test.ts`, `api/tests/unit/jobs/sync/aggregate-series.test.ts`

**Interfaces:**
- Produces:
  - `covid-provider.ts`:
    - `METRICS: readonly Metric[] = ['cases', 'deaths']`;
    - `interface SeriesPoint { date: string; total: number; new: number }`;
    - `interface SeriesRow { country: string; region: string; points: SeriesPoint[] }`;
    - `CovidProvider.fetchSeries(sourceName: string, metric: Metric): Promise<SeriesRow[]>`.
  - `api-ninjas.provider.ts`: `API_NINJAS_FIRST_DATE = '2020-01-22'`.
  - `aggregate.ts`: `interface CountrySeries { countryCode: string; points: SeriesPoint[] }`, `interface SeriesAggregate { series: CountrySeries[]; pendingNames: string[]; ignoredNames: string[] }`, `aggregateSeries(rows: readonly SeriesRow[], aliases: ReadonlyMap<string, AliasEntry>): SeriesAggregate`.
  - Test helper `fixtureText(name)` accepts subpaths (`series/brazil-cases.json`); it already does, through the URL join.

- [ ] **Step 1: Write the invented fixtures**

`api/tests/fixtures/api-ninjas/series/brazil-cases.json` (invented numbers; the first date is before the series start and must be dropped; one `new` is negative):

```json
[
  {
    "country": "Brazil",
    "region": "",
    "cases": {
      "2020-01-21": { "total": 0, "new": 0 },
      "2023-03-05": { "total": 1000, "new": 10 },
      "2023-03-06": { "total": 995, "new": -5 },
      "2023-03-07": { "total": 1010, "new": 15 },
      "2023-03-08": { "total": 1020, "new": 10 },
      "2023-03-09": { "total": 1030, "new": 10 }
    }
  }
]
```

`api/tests/fixtures/api-ninjas/series/australia-cases.json` (two regions; Victoria only has the last date):

```json
[
  {
    "country": "Australia",
    "region": "New South Wales",
    "cases": {
      "2023-03-08": { "total": 100, "new": 5 },
      "2023-03-09": { "total": 110, "new": 10 }
    }
  },
  {
    "country": "Australia",
    "region": "Victoria",
    "cases": {
      "2023-03-09": { "total": 50, "new": 2 }
    }
  }
]
```

`api/tests/fixtures/api-ninjas/series/diamond-princess-deaths.json` (the entity exists but has no points for this metric):

```json
[{ "country": "Diamond Princess", "region": "", "deaths": {} }]
```

- [ ] **Step 2: Write the failing provider tests**

`api/tests/unit/providers/api-ninjas.series.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createApiNinjasProvider } from '../../../src/providers/api-ninjas/api-ninjas.provider.js';
import type { FetchLike } from '../../../src/providers/covid-provider.js';
import {
  ProviderAuthError,
  ProviderHttpError,
  ProviderPayloadError,
} from '../../../src/providers/provider-errors.js';
import { fixtureText } from '../../helpers/api-ninjas-fixtures.js';

function provider(status: number, body: string) {
  const requests: { url: string; headers: Record<string, string> }[] = [];
  const fetch: FetchLike = (url, init) => {
    requests.push({ url, headers: init.headers });
    return Promise.resolve(new Response(body, { status }));
  };
  return { requests, source: createApiNinjasProvider({ apiKey: 'test-key', fetch }) };
}

describe('fetchSeries', () => {
  it('asks for one country and one metric, encoding the name', async () => {
    const { requests, source } = provider(
      200,
      '[{"country":"Korea, South","region":"","cases":{"2023-03-09":{"total":1,"new":0}}}]',
    );

    await source.fetchSeries('Korea, South', 'cases');

    expect(requests).toEqual([
      {
        url: 'https://api.api-ninjas.com/v1/covid19?country=Korea%2C+South&type=cases',
        headers: { 'X-Api-Key': 'test-key' },
      },
    ]);
  });

  it('parses the series in date order and drops dates outside the series', async () => {
    const { source } = provider(200, fixtureText('series/brazil-cases.json'));

    const rows = await source.fetchSeries('Brazil', 'cases');

    expect(rows).toEqual([
      {
        country: 'Brazil',
        region: '',
        points: [
          { date: '2023-03-05', total: 1000, new: 10 },
          { date: '2023-03-06', total: 995, new: -5 },
          { date: '2023-03-07', total: 1010, new: 15 },
          { date: '2023-03-08', total: 1020, new: 10 },
          { date: '2023-03-09', total: 1030, new: 10 },
        ],
      },
    ]);
  });

  it('keeps each region and accepts a metric without points', async () => {
    const regions = await provider(200, fixtureText('series/australia-cases.json')).source.fetchSeries(
      'Australia',
      'cases',
    );
    expect(regions.map((row) => [row.region, row.points.length])).toEqual([
      ['New South Wales', 2],
      ['Victoria', 1],
    ]);

    const empty = await provider(
      200,
      fixtureText('series/diamond-princess-deaths.json'),
    ).source.fetchSeries('Diamond Princess', 'deaths');
    expect(empty).toEqual([{ country: 'Diamond Princess', region: '', points: [] }]);
  });

  it.each([
    ['an invalid date key', '[{"country":"Brazil","region":"","cases":{"2023-02-30":{"total":1,"new":0}}}]'],
    ['a negative total', '[{"country":"Brazil","region":"","cases":{"2023-03-09":{"total":-1,"new":0}}}]'],
    ['an empty list', '[]'],
    ['the wrong metric', '[{"country":"Brazil","region":"","deaths":{}}]'],
    ['invalid JSON', 'not json'],
  ])('rejects %s as a payload error', async (_label, body) => {
    await expect(provider(200, body).source.fetchSeries('Brazil', 'cases')).rejects.toBeInstanceOf(
      ProviderPayloadError,
    );
  });

  it('maps HTTP errors like fetchDay', async () => {
    await expect(provider(401, '{}').source.fetchSeries('Brazil', 'cases')).rejects.toBeInstanceOf(
      ProviderAuthError,
    );
    await expect(provider(502, '').source.fetchSeries('Brazil', 'cases')).rejects.toBeInstanceOf(
      ProviderHttpError,
    );
  });
});
```

Run: `npm test -w api -- api-ninjas.series`. Expected: FAIL (`fetchSeries` is not a function).

- [ ] **Step 3: Implement the series schema and `fetchSeries`**

In `api/src/providers/covid-provider.ts`, add (keep everything already there):

```ts
export const METRICS: readonly Metric[] = ['cases', 'deaths'];

export interface SeriesPoint {
  date: string;
  total: number;
  new: number;
}

export interface SeriesRow {
  country: string;
  region: string;
  points: SeriesPoint[];
}
```

and add to the `CovidProvider` interface:

```ts
  fetchSeries(sourceName: string, metric: Metric): Promise<SeriesRow[]>;
```

In `api/src/providers/api-ninjas/api-ninjas.schemas.ts`, add after `daySchemas`:

```ts
const dateKey = z.string().refine(isIsoDate, { error: 'must be a YYYY-MM-DD date' });
const seriesValues = z.record(dateKey, values);

function toPoints(record: Record<string, { total: number; new: number }>): SeriesPoint[] {
  return Object.entries(record)
    .map(([date, point]) => ({ date, total: point.total, new: point.new }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export const seriesSchemas: Record<Metric, z.ZodType<SeriesRow[]>> = {
  cases: z
    .array(
      z
        .object({ ...location, cases: seriesValues })
        .transform(({ country, region, cases }) => ({ country, region, points: toPoints(cases) })),
    )
    .min(1),
  deaths: z
    .array(
      z
        .object({ ...location, deaths: seriesValues })
        .transform(({ country, region, deaths }) => ({
          country,
          region,
          points: toPoints(deaths),
        })),
    )
    .min(1),
};
```

Update its imports: `import { isIsoDate } from '../../lib/dates.js';` and `import type { Metric, SeriesPoint, SeriesRow, SourceRow } from '../covid-provider.js';`.

In `api/src/providers/api-ninjas/api-ninjas.provider.ts`:
- add `export const API_NINJAS_FIRST_DATE = '2020-01-22';` next to the final date;
- import `seriesSchemas`;
- extract the shared request into a local function, so `fetchDay` and `fetchSeries` both use it:

```ts
async function getJson<T>(
  fetch: FetchLike,
  apiKey: string,
  query: URLSearchParams,
  schema: z.ZodType<T>,
): Promise<T> {
  const response = await fetch(`${BASE_URL}?${query.toString()}`, {
    headers: { 'X-Api-Key': apiKey },
  });
  if (response.status === 401 || response.status === 403) {
    throw new ProviderAuthError(response.status);
  }
  if (!response.ok) {
    throw new ProviderHttpError(response.status);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ProviderPayloadError('response is not valid JSON');
    }
    throw new ProviderNetworkError(isTimeoutError(error) ? 'timeout' : 'network_error', {
      cause: error,
    });
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ProviderPayloadError(z.prettifyError(result.error).slice(0, MAX_DETAIL_LENGTH));
  }
  return result.data;
}
```

and the provider body becomes:

```ts
  return {
    sourceCode: 'api_ninjas',
    finalDate: API_NINJAS_FINAL_DATE,
    fetchDay: (date, metric) =>
      getJson(options.fetch, options.apiKey, new URLSearchParams({ date, type: metric }), daySchemas[metric]),
    async fetchSeries(sourceName, metric) {
      const rows = await getJson(
        options.fetch,
        options.apiKey,
        new URLSearchParams({ country: sourceName, type: metric }),
        seriesSchemas[metric],
      );
      return rows.map((row) => ({
        ...row,
        points: row.points.filter(
          (point) => point.date >= API_NINJAS_FIRST_DATE && point.date <= API_NINJAS_FINAL_DATE,
        ),
      }));
    },
  };
```

Run: `npm test -w api -- api-ninjas`. Expected: PASS, both the old `api-ninjas.provider.test.ts` and the new series test.

- [ ] **Step 4: Write the failing aggregation test**

`api/tests/unit/jobs/sync/aggregate-series.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { aggregateSeries, type AliasEntry } from '../../../../src/jobs/sync/aggregate.js';

const aliases = new Map<string, AliasEntry>([
  ['Australia', { status: 'mapped', countryCode: 'AUS' }],
  ['Brazil', { status: 'mapped', countryCode: 'BRA' }],
  ['Summer Olympics 2020', { status: 'ignored', countryCode: null }],
]);

describe('aggregateSeries', () => {
  it('sums the regions of a country per date (RN-02)', () => {
    const result = aggregateSeries(
      [
        {
          country: 'Australia',
          region: 'New South Wales',
          points: [
            { date: '2023-03-08', total: 100, new: 5 },
            { date: '2023-03-09', total: 110, new: 10 },
          ],
        },
        { country: 'Australia', region: 'Victoria', points: [{ date: '2023-03-09', total: 50, new: 2 }] },
      ],
      aliases,
    );

    expect(result).toEqual({
      series: [
        {
          countryCode: 'AUS',
          points: [
            { date: '2023-03-08', total: 100, new: 5 },
            { date: '2023-03-09', total: 160, new: 12 },
          ],
        },
      ],
      pendingNames: [],
      ignoredNames: [],
    });
  });

  it('keeps a negative new as it came (RN-07)', () => {
    const result = aggregateSeries(
      [{ country: 'Brazil', region: '', points: [{ date: '2023-03-06', total: 995, new: -5 }] }],
      aliases,
    );
    expect(result.series[0]?.points).toEqual([{ date: '2023-03-06', total: 995, new: -5 }]);
  });

  it('reports pending and ignored names without counting them', () => {
    const result = aggregateSeries(
      [
        { country: 'Atlantis', region: '', points: [{ date: '2023-03-09', total: 1, new: 0 }] },
        { country: 'Summer Olympics 2020', region: '', points: [] },
      ],
      aliases,
    );
    expect(result).toEqual({
      series: [],
      pendingNames: ['Atlantis'],
      ignoredNames: ['Summer Olympics 2020'],
    });
  });

  it('returns one entry per country code, ordered by code', () => {
    const result = aggregateSeries(
      [
        { country: 'Brazil', region: '', points: [{ date: '2023-03-09', total: 1, new: 0 }] },
        { country: 'Australia', region: '', points: [{ date: '2023-03-09', total: 2, new: 0 }] },
      ],
      aliases,
    );
    expect(result.series.map((entry) => entry.countryCode)).toEqual(['AUS', 'BRA']);
  });
});
```

Run: `npm test -w api -- aggregate-series`. Expected: FAIL (`aggregateSeries` missing).

- [ ] **Step 5: Implement `aggregateSeries`**

Append to `api/src/jobs/sync/aggregate.ts` (and add `import type { SeriesPoint, SeriesRow } from '../../providers/covid-provider.js';` to its imports):

```ts
export interface CountrySeries {
  countryCode: string;
  points: SeriesPoint[];
}

export interface SeriesAggregate {
  series: CountrySeries[];
  pendingNames: string[];
  ignoredNames: string[];
}

// RN-02 per date: every row of the same mapped country is summed date by date.
export function aggregateSeries(
  rows: readonly SeriesRow[],
  aliases: ReadonlyMap<string, AliasEntry>,
): SeriesAggregate {
  const byCode = new Map<string, Map<string, SeriesPoint>>();
  const pending = new Set<string>();
  const ignored = new Set<string>();

  for (const row of rows) {
    const alias = aliases.get(row.country);
    if (alias?.status === 'ignored') {
      ignored.add(row.country);
      continue;
    }
    if (alias?.status !== 'mapped' || alias.countryCode === null) {
      pending.add(row.country);
      continue;
    }
    const points = byCode.get(alias.countryCode) ?? new Map<string, SeriesPoint>();
    for (const point of row.points) {
      const current = points.get(point.date) ?? { date: point.date, total: 0, new: 0 };
      current.total += point.total;
      current.new += point.new;
      points.set(point.date, current);
    }
    byCode.set(alias.countryCode, points);
  }

  return {
    series: [...byCode.entries()]
      .map(([countryCode, points]) => ({
        countryCode,
        points: [...points.values()].sort((a, b) => a.date.localeCompare(b.date)),
      }))
      .sort((a, b) => a.countryCode.localeCompare(b.countryCode)),
    pendingNames: [...pending].sort(),
    ignoredNames: [...ignored].sort(),
  };
}
```

Run: `npm test -w api` and `npm run typecheck`. Expected: PASS. The integration test `snapshot.test.ts` has a crashing provider literal without `fetchSeries` and will fail typecheck. Add `fetchSeries: () => Promise.reject(new Error('boom')),` to that literal (Task 5 replaces it anyway).

- [ ] **Step 6: Commit**

```bash
npx prettier --write api/src/providers api/src/jobs/sync/aggregate.ts api/tests/unit api/tests/fixtures/api-ninjas/series api/tests/integration/snapshot.test.ts
npm run lint && npm run typecheck && npm test
git add api/src api/tests
git commit -m "feat: fetch a country series and sum its regions per date"
```

---

### Task 4: Repositories for series, done units, unit writes and the lock

**Files:**
- Modify: `api/src/repositories/daily-stat.repository.ts` (`upsertSeries`), `api/src/repositories/sync-run.repository.ts` (`findDoneUnits`), `api/src/repositories/sync-lock.repository.ts` (`lost` signal)
- Create: `api/src/repositories/sync-unit.repository.ts` (`writeUnit`, `UnitRows`)
- Modify test: `api/tests/integration/repositories.test.ts`

**Interfaces:**
- Consumes: `SeriesPoint` (Task 3), `upsertDailyStats`, `insertPendingAliases`, `completeCheckpoint`.
- Produces:
  - `upsertSeries(db: Db, batch: { sourceId: number; metric: Metric; countryCode: string; points: readonly SeriesPoint[] }): Promise<number>`;
  - `findDoneUnits(db: Db, sourceId: number, mode: SyncMode): Promise<Set<string>>`;
  - the type:

    ```ts
    type UnitRows =
      | { kind: 'day'; metric: Metric; statDate: string; values: readonly DailyStatValues[] }
      | { kind: 'series'; metric: Metric; series: readonly { countryCode: string; points: readonly SeriesPoint[] }[] }
    ```

  - `writeUnit(prisma: PrismaClient, input: { sourceId: number; runId: number; unit: string; pendingNames: readonly string[]; rows: UnitRows }): Promise<number>` (rows written);
  - `SyncLock { readonly lost: AbortSignal; release(): Promise<void> }`.

- [ ] **Step 1: Write the failing integration tests**

Add to `api/tests/integration/repositories.test.ts`. Reuse its existing helpers (`owner`, `prisma`, `sourceId`, `openRun`). Read the top of the file first, and add the imports for `upsertSeries`, `findDoneUnits`, `writeUnit` and `tryAcquireSyncLock` if they are missing.

```ts
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
      (await owner.query('SELECT unit, status FROM sync_checkpoint WHERE sync_run_id = $1', [runId]))
        .rows,
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
```

Inside the existing `describe('sync lock')`, add:

```ts
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
```

(Import `vi` from vitest and `SYNC_LOCK_KEY` if they are missing. The key 1835102320 is below 2³², so it is stored in `objid` with `classid = 0`.)

These tests write rows. Check that the file's `beforeEach` calls `resetSyncState(owner)`; if it does not, add `await resetSyncState(owner)` at the start of each new test.

Run: `npm run test:integration -w api -- repositories`. Expected: FAIL (missing exports, `lost` undefined).

- [ ] **Step 2: Implement the repositories**

Append to `api/src/repositories/daily-stat.repository.ts` (add `import type { SeriesPoint } from '../providers/covid-provider.js';`):

```ts
export interface SeriesBatch {
  sourceId: number;
  metric: Metric;
  countryCode: string;
  points: readonly SeriesPoint[];
}

// RN-09 for a whole country series in one statement.
export async function upsertSeries(db: Db, batch: SeriesBatch): Promise<number> {
  if (batch.points.length === 0) {
    return 0;
  }
  const dates = batch.points.map((point) => point.date);
  const totals = batch.points.map((point) => point.total);
  const news = batch.points.map((point) => point.new);
  return db.$executeRaw`
    INSERT INTO daily_stat (country_code, metric, stat_date, source_id, total, new_value, updated_at)
    SELECT ${batch.countryCode}, ${batch.metric}::metric, v.stat_date, ${batch.sourceId},
           v.total, v.new_value, now()
    FROM unnest(${dates}::date[], ${totals}::int[], ${news}::int[]) AS v(stat_date, total, new_value)
    ON CONFLICT (country_code, metric, stat_date, source_id)
    DO UPDATE SET total = EXCLUDED.total, new_value = EXCLUDED.new_value, updated_at = now()`;
}
```

Append to `api/src/repositories/sync-run.repository.ts`:

```ts
// Units already loaded by any run of this source and mode (the historical series never changes).
export async function findDoneUnits(db: Db, sourceId: number, mode: SyncMode): Promise<Set<string>> {
  const rows = await db.syncCheckpoint.findMany({
    where: { status: 'done', syncRun: { sourceId, mode } },
    select: { unit: true },
    distinct: ['unit'],
  });
  return new Set(rows.map((row) => row.unit));
}
```

Create `api/src/repositories/sync-unit.repository.ts`:

```ts
import type { Metric, PrismaClient } from '../generated/prisma/client.js';
import type { SeriesPoint } from '../providers/covid-provider.js';
import { insertPendingAliases } from './alias.repository.js';
import { upsertDailyStats, upsertSeries, type DailyStatValues } from './daily-stat.repository.js';
import { completeCheckpoint } from './sync-run.repository.js';

export type UnitRows =
  | { kind: 'day'; metric: Metric; statDate: string; values: readonly DailyStatValues[] }
  | {
      kind: 'series';
      metric: Metric;
      series: readonly { countryCode: string; points: readonly SeriesPoint[] }[];
    };

export interface UnitWrite {
  sourceId: number;
  runId: number;
  unit: string;
  pendingNames: readonly string[];
  rows: UnitRows;
}

// A unit is all or nothing: pending aliases, its rows and the done checkpoint.
export async function writeUnit(prisma: PrismaClient, input: UnitWrite): Promise<number> {
  return prisma.$transaction(async (tx) => {
    await insertPendingAliases(tx, input.sourceId, input.pendingNames);
    let written = 0;
    if (input.rows.kind === 'day') {
      written = await upsertDailyStats(tx, {
        sourceId: input.sourceId,
        metric: input.rows.metric,
        statDate: input.rows.statDate,
        values: input.rows.values,
      });
    } else {
      for (const entry of input.rows.series) {
        written += await upsertSeries(tx, {
          sourceId: input.sourceId,
          metric: input.rows.metric,
          countryCode: entry.countryCode,
          points: entry.points,
        });
      }
    }
    await completeCheckpoint(tx, input.runId, input.unit);
    return written;
  });
}
```

`completeCheckpoint` uses `update`, which throws when the checkpoint row does not exist. That gives the rollback test its failure.

In `api/src/repositories/sync-lock.repository.ts`, change `SyncLock` and the returned object:

```ts
export interface SyncLock {
  // Aborted when the lock connection dies: the run must stop writing.
  readonly lost: AbortSignal;
  release(): Promise<void>;
}
```

```ts
  const lost = new AbortController();
  client.on('error', (error) => {
    lost.abort(error);
  });
  return {
    lost: lost.signal,
    async release() {
      if (lost.signal.aborted) {
        // The session is gone and the lock died with it.
        await client.end().catch(() => undefined);
        return;
      }
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [SYNC_LOCK_KEY]);
      } finally {
        await client.end();
      }
    },
  };
```

Run: `npm run test:integration -w api` and `npm test -w api`. Expected: PASS.

- [ ] **Step 3: Commit**

```bash
npx prettier --write api/src/repositories api/tests/integration/repositories.test.ts
npm run lint && npm run typecheck && npm test
git add api/src/repositories api/tests/integration/repositories.test.ts
git commit -m "feat: add series upsert, unit writes, done units and lock loss signal"
```

---

### Task 5: Unit executor, provider factory and snapshot on top of it

**Files:**
- Create: `api/src/jobs/sync/run-units.ts`, `api/src/jobs/sync/best-effort.ts`, `api/src/jobs/sync/snapshot-plan.ts`
- Delete: `api/src/jobs/sync/run-snapshot.ts`
- Modify: `api/src/jobs/sync/run-sync.ts`, `api/src/jobs/sync/cli.ts`, `api/src/providers/covid-provider.ts`, `api/src/providers/create-provider.ts`, `api/src/providers/api-ninjas/api-ninjas.provider.ts`
- Tests:
  - create `api/tests/unit/jobs/sync/run-units.test.ts` and `api/tests/integration/run-units.test.ts`;
  - modify `api/tests/integration/snapshot.test.ts`, `api/tests/unit/providers/create-provider.test.ts` and `api/tests/unit/providers/api-ninjas.provider.test.ts`.

**Interfaces:**
- Consumes:
  - `writeUnit`, `UnitRows` (Task 4);
  - `aggregateDay`, `AliasEntry`;
  - `createCallGate` (Task 2);
  - `METRICS`, `SeriesRow` (Task 3).
- Produces:
  - In `covid-provider.ts`:
    - `CovidProvider` is now only `{ fetchDay; fetchSeries }`;
    - `ProviderFactory { readonly sourceCode: string; readonly finalDate: string; create(fetch: FetchLike): CovidProvider }`.
  - In `create-provider.ts`: `createProviderFactory(env): ProviderFactory`, which replaces `createProvider`.
  - In `api-ninjas.provider.ts`: `apiNinjasFactory(apiKey: string): ProviderFactory`; `createApiNinjasProvider({ apiKey, fetch })` stays and returns a `CovidProvider`.
  - In `run-units.ts`:
    - the types `RunStatus`, `UnitContext`, `UnitOutput`, `UnitPlan`, `PlanContext`, `RunPlan`, `RunUnitsDeps`, `SyncResult` and the constant `LOCK_LOST_NOTE`, all shown in the code of Step 3;
    - `decideStatus(input: { planned: number; completed: number; wroteRows: boolean; hasNotes: boolean }): RunStatus`;
    - `runUnits(deps: RunUnitsDeps, plan: RunPlan): Promise<SyncResult>`.
  - In `best-effort.ts`: `bestEffort(logger: Logger, action: string, step: () => Promise<unknown>): Promise<void>`.
  - In `snapshot-plan.ts`: `snapshotPlan(source: ProviderFactory): RunPlan`.
  - In `run-sync.ts`: `RunSyncDeps extends RunUnitsDeps { lockUrl: string }`, and `runSync(deps): Promise<SyncResult>` runs the snapshot plan. Task 6 adds the mode.

- [ ] **Step 1: Write the failing unit tests for the pure parts**

`api/tests/unit/jobs/sync/run-units.test.ts`:

```ts
import type { Logger } from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { bestEffort } from '../../../../src/jobs/sync/best-effort.js';
import { decideStatus } from '../../../../src/jobs/sync/run-units.js';

describe('decideStatus', () => {
  it('is success when there was nothing left to do', () => {
    expect(decideStatus({ planned: 0, completed: 0, wroteRows: false, hasNotes: false })).toBe(
      'success',
    );
  });

  it('is failed only when nothing was written', () => {
    expect(decideStatus({ planned: 2, completed: 2, wroteRows: false, hasNotes: false })).toBe(
      'failed',
    );
    expect(decideStatus({ planned: 2, completed: 0, wroteRows: false, hasNotes: true })).toBe(
      'failed',
    );
  });

  it('is partial when it wrote but left units or notes', () => {
    expect(decideStatus({ planned: 3, completed: 2, wroteRows: true, hasNotes: false })).toBe(
      'partial',
    );
    expect(decideStatus({ planned: 2, completed: 2, wroteRows: true, hasNotes: true })).toBe(
      'partial',
    );
  });

  it('is success when every planned unit is done without notes', () => {
    expect(decideStatus({ planned: 2, completed: 2, wroteRows: true, hasNotes: false })).toBe(
      'success',
    );
  });
});

describe('bestEffort', () => {
  it('logs a failing cleanup step instead of throwing', async () => {
    const warn = vi.fn();
    const logger = { warn } as unknown as Logger;

    await expect(
      bestEffort(logger, 'finish run', () => Promise.reject(new Error('db down'))),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'finish run' }),
      'cleanup step failed',
    );
  });

  it('runs the step', async () => {
    const step = vi.fn(() => Promise.resolve());
    await bestEffort({ warn: vi.fn() } as unknown as Logger, 'x', step);
    expect(step).toHaveBeenCalledOnce();
  });
});
```

Run: `npm test -w api -- run-units`. Expected: FAIL (modules missing).

- [ ] **Step 2: Introduce the provider factory**

`api/src/providers/covid-provider.ts`: remove `sourceCode` and `finalDate` from `CovidProvider`, and add:

```ts
// Knows the source before any call, so the run and its call gate exist before the provider.
export interface ProviderFactory {
  readonly sourceCode: string;
  readonly finalDate: string;
  create(fetch: FetchLike): CovidProvider;
}
```

In `api/src/providers/api-ninjas/api-ninjas.provider.ts`:
- drop `sourceCode` and `finalDate` from the object returned by `createApiNinjasProvider`;
- add:

```ts
export function apiNinjasFactory(apiKey: string): ProviderFactory {
  return {
    sourceCode: 'api_ninjas',
    finalDate: API_NINJAS_FINAL_DATE,
    create: (fetch) => createApiNinjasProvider({ apiKey, fetch }),
  };
}
```

`api/src/providers/create-provider.ts` becomes:

```ts
import type { SyncEnv } from '../config/sync-env.js';
import { apiNinjasFactory } from './api-ninjas/api-ninjas.provider.js';
import type { ProviderFactory } from './covid-provider.js';

export function createProviderFactory(
  env: Pick<SyncEnv, 'DATA_PROVIDER' | 'API_NINJAS_KEY'>,
): ProviderFactory {
  switch (env.DATA_PROVIDER) {
    case 'api_ninjas':
      if (env.API_NINJAS_KEY === undefined) {
        throw new Error('API_NINJAS_KEY is required when DATA_PROVIDER=api_ninjas');
      }
      return apiNinjasFactory(env.API_NINJAS_KEY);
    case 'jhu_csv':
    case 'apify':
      throw new Error(`DATA_PROVIDER=${env.DATA_PROVIDER} is not implemented yet`);
  }
}
```

Update `api/tests/unit/providers/create-provider.test.ts`:
- call `createProviderFactory({ … })` with no `fetch`;
- the first test asserts `.sourceCode === 'api_ninjas'` and `.finalDate === '2023-03-09'`;
- remove the now unused `fetch` constant.

Update the first test of `api/tests/unit/providers/api-ninjas.provider.test.ts`: assert `API_NINJAS_FINAL_DATE === '2023-03-09'` and `apiNinjasFactory('k').sourceCode === 'api_ninjas'` (import `apiNinjasFactory`), and no longer read `sourceCode`/`finalDate` from the provider.

- [ ] **Step 3: Implement the executor**

`api/src/jobs/sync/best-effort.ts`:

```ts
import type { Logger } from 'pino';

// Cleanup that must never hide the error that brought us here.
export async function bestEffort(
  logger: Logger,
  action: string,
  step: () => Promise<unknown>,
): Promise<void> {
  try {
    await step();
  } catch (err) {
    logger.warn({ err, action }, 'cleanup step failed');
  }
}
```

`api/src/jobs/sync/run-units.ts`:

```ts
import type { Logger } from 'pino';
import type { PrismaClient, SyncMode } from '../../generated/prisma/client.js';
import type { CovidProvider, ProviderFactory } from '../../providers/covid-provider.js';
import {
  ProviderAuthError,
  ProviderHttpError,
  ProviderNetworkError,
  ProviderPayloadError,
} from '../../providers/provider-errors.js';
import { loadAliases } from '../../repositories/alias.repository.js';
import { findSourceId } from '../../repositories/data-source.repository.js';
import { refreshGlobalDailyStat } from '../../repositories/global-stat.repository.js';
import { createProviderCallStore } from '../../repositories/provider-call.repository.js';
import {
  failCheckpoint,
  finishRun,
  startCheckpoint,
  startRun,
} from '../../repositories/sync-run.repository.js';
import { writeUnit, type UnitRows } from '../../repositories/sync-unit.repository.js';
import type { AliasEntry } from './aggregate.js';
import { bestEffort } from './best-effort.js';
import { BudgetExhaustedError, type BudgetLimits } from './budget.js';
import { createCallGate, type RawFetch } from './call-gate.js';

export type RunStatus = 'success' | 'partial' | 'failed';

export const LOCK_LOST_NOTE = 'lock perdido: a conexão do lock caiu, o run parou';

export interface UnitContext {
  provider: CovidProvider;
  aliases: ReadonlyMap<string, AliasEntry>;
}

export interface UnitOutput {
  rows: UnitRows;
  pendingNames: string[];
  ignoredNames: string[];
}

export interface UnitPlan {
  unit: string;
  load(context: UnitContext): Promise<UnitOutput>;
}

export interface PlanContext {
  prisma: PrismaClient;
  sourceId: number;
  aliases: ReadonlyMap<string, AliasEntry>;
}

export interface RunPlan {
  mode: SyncMode;
  referenceDate: string;
  planUnits(context: PlanContext): Promise<{ units: UnitPlan[]; alreadyDone: number }>;
}

export interface RunUnitsDeps {
  prisma: PrismaClient;
  source: ProviderFactory;
  fetch: RawFetch;
  limits: BudgetLimits;
  logger: Logger;
  sleep?: (ms: number) => Promise<void>;
  // Aborted when the sync lock is lost: no new unit may start.
  signal?: AbortSignal;
}

export interface SyncResult {
  runId: number;
  status: RunStatus;
  callsUsed: number;
  pendingNames: string[];
  unitsPlanned: number;
  unitsDone: number;
  unitsRemaining: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

// Errors that close one unit; anything else aborts the run.
function isUnitError(error: unknown): boolean {
  return (
    error instanceof ProviderAuthError ||
    error instanceof ProviderHttpError ||
    error instanceof ProviderNetworkError ||
    error instanceof ProviderPayloadError ||
    error instanceof BudgetExhaustedError
  );
}

// failed only when nothing was written, so every run that writes data changes the dataVersion.
export function decideStatus(input: {
  planned: number;
  completed: number;
  wroteRows: boolean;
  hasNotes: boolean;
}): RunStatus {
  if (input.planned === 0) return 'success';
  if (!input.wroteRows) return 'failed';
  return input.hasNotes || input.completed < input.planned ? 'partial' : 'success';
}

export async function runUnits(deps: RunUnitsDeps, plan: RunPlan): Promise<SyncResult> {
  const { prisma, source } = deps;
  const sourceId = await findSourceId(prisma, source.sourceCode);
  if (sourceId === null) {
    throw new Error(`Data source "${source.sourceCode}" not found: run npm run db:seed -w api`);
  }
  const aliases = await loadAliases(prisma, sourceId);
  const { units, alreadyDone } = await plan.planUnits({ prisma, sourceId, aliases });

  const runId = await startRun(prisma, {
    sourceId,
    mode: plan.mode,
    referenceDate: plan.referenceDate,
  });
  const gate = createCallGate({
    store: createProviderCallStore(prisma, { sourceId, syncRunId: runId }),
    limits: deps.limits,
    fetch: deps.fetch,
    sleep: deps.sleep,
  });
  const provider = source.create(gate.fetch);
  const logger = deps.logger.child({ runId, mode: plan.mode });

  const pending = new Set<string>();
  const notes: string[] = [];
  let completed = 0;
  let wroteRows = false;
  const result = (status: RunStatus, callsUsed: number): SyncResult => ({
    runId,
    status,
    callsUsed,
    pendingNames: [...pending].sort(),
    unitsPlanned: alreadyDone + units.length,
    unitsDone: alreadyDone + completed,
    unitsRemaining: units.length - completed,
  });

  try {
    for (const unit of units) {
      if (deps.signal?.aborted) {
        notes.push(LOCK_LOST_NOTE);
        logger.error('sync lock lost, stopping');
        break;
      }
      await startCheckpoint(prisma, runId, unit.unit);
      try {
        const output = await unit.load({ provider, aliases });
        const written = await writeUnit(prisma, {
          sourceId,
          runId,
          unit: unit.unit,
          pendingNames: output.pendingNames,
          rows: output.rows,
        });
        completed += 1;
        wroteRows ||= written > 0;
        for (const name of output.pendingNames) {
          pending.add(name);
        }
        logger.info(
          {
            unit: unit.unit,
            rows: written,
            pendingNames: output.pendingNames,
            ignoredNames: output.ignoredNames,
          },
          'unit done',
        );
      } catch (error) {
        const message = errorMessage(error);
        if (error instanceof ProviderPayloadError) {
          await bestEffort(logger, 'mark invalid payload', () => gate.markLastInvalid());
        }
        await bestEffort(logger, 'fail checkpoint', () =>
          failCheckpoint(prisma, runId, unit.unit, message),
        );
        if (!isUnitError(error)) {
          throw error;
        }
        notes.push(`${unit.unit}: ${message}`);
        logger.error({ unit: unit.unit, error: message }, 'unit failed');
        if (error instanceof ProviderAuthError || error instanceof BudgetExhaustedError) {
          break;
        }
      }
    }

    if (wroteRows) {
      await refreshGlobalDailyStat(prisma);
    }
    if (pending.size > 0) {
      notes.push(`aliases pendentes: ${[...pending].sort().join(', ')}`);
    }
    const status = decideStatus({
      planned: units.length,
      completed,
      wroteRows,
      hasNotes: notes.length > 0,
    });
    const callsUsed = await finishRun(prisma, runId, {
      status,
      error: notes.length > 0 ? notes.join('; ') : null,
    });
    const summary = result(status, callsUsed);
    logger.info(summary, 'run finished');
    return summary;
  } catch (error) {
    // Unexpected failure: keep the view in step with what was written, close the run, rethrow.
    if (wroteRows) {
      await bestEffort(logger, 'refresh global view', () => refreshGlobalDailyStat(prisma));
    }
    await bestEffort(logger, 'finish run', () =>
      finishRun(prisma, runId, {
        status: wroteRows ? 'partial' : 'failed',
        error: errorMessage(error),
      }),
    );
    throw error;
  }
}
```

`api/src/jobs/sync/snapshot-plan.ts`:

```ts
import { METRICS, type ProviderFactory } from '../../providers/covid-provider.js';
import { aggregateDay } from './aggregate.js';
import type { RunPlan, UnitPlan } from './run-units.js';

// The reference date only: one unit per metric for the source's final date.
export function snapshotPlan(source: ProviderFactory): RunPlan {
  const date = source.finalDate;
  const units: UnitPlan[] = METRICS.map((metric) => ({
    unit: `snapshot:${metric}:${date}`,
    async load({ provider, aliases }) {
      const day = aggregateDay(await provider.fetchDay(date, metric), aliases);
      return {
        rows: { kind: 'day', metric, statDate: date, values: day.stats },
        pendingNames: day.pendingNames,
        ignoredNames: day.ignoredNames,
      };
    },
  }));
  return {
    mode: 'snapshot',
    referenceDate: date,
    planUnits: () => Promise.resolve({ units, alreadyDone: 0 }),
  };
}
```

`api/src/jobs/sync/run-sync.ts` (replace the whole file):

```ts
import { refreshGlobalDailyStat } from '../../repositories/global-stat.repository.js';
import { tryAcquireSyncLock } from '../../repositories/sync-lock.repository.js';
import { failOrphanRuns } from '../../repositories/sync-run.repository.js';
import { bestEffort } from './best-effort.js';
import { runUnits, type RunUnitsDeps, type SyncResult } from './run-units.js';
import { snapshotPlan } from './snapshot-plan.js';

export class SyncLockedError extends Error {
  constructor() {
    super('Another sync is running (advisory lock held)');
    this.name = 'SyncLockedError';
  }
}

export interface RunSyncDeps extends RunUnitsDeps {
  lockUrl: string;
}

export async function runSync(deps: RunSyncDeps): Promise<SyncResult> {
  const lock = await tryAcquireSyncLock(deps.lockUrl);
  if (lock === null) {
    throw new SyncLockedError();
  }
  try {
    const interrupted = await failOrphanRuns(deps.prisma);
    if (interrupted.length > 0) {
      deps.logger.warn({ runIds: interrupted }, 'marked interrupted runs as failed');
      // A dead run may have written rows without refreshing the view.
      await refreshGlobalDailyStat(deps.prisma);
    }
    return await runUnits({ ...deps, signal: lock.lost }, snapshotPlan(deps.source));
  } finally {
    await bestEffort(deps.logger, 'release sync lock', () => lock.release());
  }
}
```

Delete `api/src/jobs/sync/run-snapshot.ts`.

In `api/src/jobs/sync/cli.ts`:
- replace the `createProvider` import with `import { createProviderFactory } from '../../providers/create-provider.js';`;
- in the `runSync` call, replace `createProvider: (fetch) => createProvider(env, fetch),` with `source: createProviderFactory(env),`;
- keep the `mode === 'full'` guard for now (Task 6 removes it).

- [ ] **Step 4: Move the snapshot integration test to the factory**

In `api/tests/integration/snapshot.test.ts`:
- **Imports:** replace `createApiNinjasProvider` with `apiNinjasFactory`. In `deps()`, replace `createProvider: (gatedFetch) => createApiNinjasProvider(...)` with `source: apiNinjasFactory('test-key'),`.
- **Crash test:** in "closes the run as failed and frees the lock when the snapshot crashes", replace the `createProvider: () => ({...})` override with:

```ts
      source: {
        sourceCode: 'api_ninjas',
        finalDate: '2023-03-09',
        create: () => ({
          fetchDay: () => Promise.reject(new Error('boom')),
          fetchSeries: () => Promise.reject(new Error('boom')),
        }),
      },
```

All existing assertions stay as they are. The F2 behaviours still hold: success; idempotent; pending → `partial`; no mapping → `failed`; crash before writing → `failed`; invalid deaths → `partial`; 503 three times → `partial`; key rejected before writing → `failed`; budget used up → `failed`; orphan → `failed`; lock held → `SyncLockedError`.

- [ ] **Step 5: Write the executor integration tests**

`api/tests/integration/run-units.test.ts`:

```ts
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  LOCK_LOST_NOTE,
  runUnits,
  type RunPlan,
  type RunUnitsDeps,
  type UnitPlan,
} from '../../src/jobs/sync/run-units.js';
import { createLogger } from '../../src/lib/logger.js';
import { createPrisma } from '../../src/lib/prisma.js';
import { ProviderAuthError } from '../../src/providers/provider-errors.js';
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
    const first: UnitPlan = {
      ...writes('BRA'),
      async load(context) {
        const output = await writes('BRA').load(context);
        lost.abort();
        return output;
      },
    };

    const result = await runUnits(deps(lost.signal), plan([first, writes('ARG')]));

    expect(result).toMatchObject({ status: 'partial', unitsDone: 1, unitsRemaining: 1 });
    expect(await rows('SELECT error FROM sync_run')).toEqual([{ error: LOCK_LOST_NOTE }]);
    expect(await rows('SELECT unit FROM sync_checkpoint')).toEqual([{ unit: 'test:cases:BRA' }]);
  });
});
```

`ProviderAuthError` sets `name` to `ProviderAuthError`, so its unit is `test:cases:ProviderAuthError`; the `Error('boom')` unit is `test:cases:Error`.

Run: `npm test -w api` and `npm run test:integration -w api`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npx prettier --write api/src api/tests
npm run lint && npm run typecheck && npm test
git add -A api/src api/tests
git commit -m "refactor: run sync units through one executor with a provider factory"
```

---

### Task 6: Full plan, resumable full mode and its integration tests

**Files:**
- Create: `api/src/jobs/sync/full-plan.ts`
- Modify: `api/src/jobs/sync/run-sync.ts`, `api/src/jobs/sync/cli.ts`
- Tests: create `api/tests/unit/jobs/sync/full-plan.test.ts` and `api/tests/integration/full-sync.test.ts`; modify `api/tests/integration/snapshot.test.ts` (add `mode: 'snapshot'` to its deps).

**Interfaces:**
- Consumes:
  - `runUnits`, `RunPlan`, `UnitPlan` (Task 5);
  - `aggregateSeries` (Task 3);
  - `findDoneUnits` (Task 4);
  - `METRICS`, `ProviderPayloadError`.
- Produces:
  - `interface FullUnit { unit: string; metric: Metric; sourceName: string }`;
  - `class DuplicateAliasError extends Error`;
  - `planFullUnits(aliases: ReadonlyMap<string, AliasEntry>, done: ReadonlySet<string>): { units: FullUnit[]; planned: number }`;
  - `fullPlan(source: ProviderFactory): RunPlan`;
  - `RunSyncDeps` gains `mode: SyncMode` (from `cli-args.ts`).

- [ ] **Step 1: Write the failing plan test**

`api/tests/unit/jobs/sync/full-plan.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { AliasEntry } from '../../../../src/jobs/sync/aggregate.js';
import { DuplicateAliasError, planFullUnits } from '../../../../src/jobs/sync/full-plan.js';

const aliases = new Map<string, AliasEntry>([
  ['Brazil', { status: 'mapped', countryCode: 'BRA' }],
  ['Afghanistan', { status: 'mapped', countryCode: 'AFG' }],
  ['Summer Olympics 2020', { status: 'ignored', countryCode: null }],
  ['Atlantis', { status: 'pending', countryCode: null }],
]);

describe('planFullUnits', () => {
  it('plans cases then deaths over the mapped names in alphabetical order', () => {
    expect(planFullUnits(aliases, new Set())).toEqual({
      planned: 4,
      units: [
        { unit: 'full:cases:Afghanistan', metric: 'cases', sourceName: 'Afghanistan' },
        { unit: 'full:cases:Brazil', metric: 'cases', sourceName: 'Brazil' },
        { unit: 'full:deaths:Afghanistan', metric: 'deaths', sourceName: 'Afghanistan' },
        { unit: 'full:deaths:Brazil', metric: 'deaths', sourceName: 'Brazil' },
      ],
    });
  });

  it('skips units already done', () => {
    const plan = planFullUnits(aliases, new Set(['full:cases:Brazil', 'full:other:unit']));
    expect(plan.planned).toBe(4);
    expect(plan.units.map((unit) => unit.unit)).toEqual([
      'full:cases:Afghanistan',
      'full:deaths:Afghanistan',
      'full:deaths:Brazil',
    ]);
  });

  it('refuses two mapped names for the same country', () => {
    const duplicated = new Map(aliases).set('Brasil', { status: 'mapped', countryCode: 'BRA' });
    expect(() => planFullUnits(duplicated, new Set())).toThrow(DuplicateAliasError);
    expect(() => planFullUnits(duplicated, new Set())).toThrow('BRA: Brasil, Brazil');
  });
});
```

Run: `npm test -w api -- full-plan`. Expected: FAIL.

- [ ] **Step 2: Implement the full plan**

`api/src/jobs/sync/full-plan.ts`:

```ts
import {
  METRICS,
  type Metric,
  type ProviderFactory,
} from '../../providers/covid-provider.js';
import { ProviderPayloadError } from '../../providers/provider-errors.js';
import { findDoneUnits } from '../../repositories/sync-run.repository.js';
import { aggregateSeries, type AliasEntry } from './aggregate.js';
import type { RunPlan, UnitPlan } from './run-units.js';

export interface FullUnit {
  unit: string;
  metric: Metric;
  sourceName: string;
}

export class DuplicateAliasError extends Error {
  constructor(duplicates: string[]) {
    super(`Mapped aliases share a country (each series would overwrite the other): ${duplicates.join('; ')}`);
    this.name = 'DuplicateAliasError';
  }
}

// One unit per (metric, mapped source name); the historical series never changes, so done units are skipped.
export function planFullUnits(
  aliases: ReadonlyMap<string, AliasEntry>,
  done: ReadonlySet<string>,
): { units: FullUnit[]; planned: number } {
  const namesByCode = new Map<string, string[]>();
  for (const [name, alias] of aliases) {
    if (alias.status === 'mapped' && alias.countryCode !== null) {
      namesByCode.set(alias.countryCode, [...(namesByCode.get(alias.countryCode) ?? []), name]);
    }
  }
  const duplicates = [...namesByCode.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([code, names]) => `${code}: ${[...names].sort().join(', ')}`)
    .sort();
  if (duplicates.length > 0) {
    throw new DuplicateAliasError(duplicates);
  }

  const names = [...namesByCode.values()].flat().sort((a, b) => a.localeCompare(b, 'en'));
  const all = METRICS.flatMap((metric) =>
    names.map((sourceName) => ({ unit: `full:${metric}:${sourceName}`, metric, sourceName })),
  );
  return { units: all.filter((unit) => !done.has(unit.unit)), planned: all.length };
}

export function fullPlan(source: ProviderFactory): RunPlan {
  return {
    mode: 'full',
    referenceDate: source.finalDate,
    async planUnits({ prisma, sourceId, aliases }) {
      const { units, planned } = planFullUnits(
        aliases,
        await findDoneUnits(prisma, sourceId, 'full'),
      );
      return {
        alreadyDone: planned - units.length,
        units: units.map(
          (unit): UnitPlan => ({
            unit: unit.unit,
            async load({ provider, aliases: known }) {
              const result = aggregateSeries(
                await provider.fetchSeries(unit.sourceName, unit.metric),
                known,
              );
              if (result.series.length > 1) {
                throw new ProviderPayloadError(
                  `series for ${unit.sourceName} maps to several countries: ${result.series
                    .map((entry) => entry.countryCode)
                    .join(', ')}`,
                );
              }
              return {
                rows: { kind: 'series', metric: unit.metric, series: result.series },
                pendingNames: result.pendingNames,
                ignoredNames: result.ignoredNames,
              };
            },
          }),
        ),
      };
    },
  };
}
```

The error text in the test (`'BRA: Brasil, Brazil'`) is matched as a substring of the message.

- [ ] **Step 3: Wire the mode through `runSync` and the CLI**

In `api/src/jobs/sync/run-sync.ts`:
- import `fullPlan` from `./full-plan.js` and `type SyncMode` from `./cli-args.js`;
- add `mode: SyncMode;` to `RunSyncDeps`;
- replace `snapshotPlan(deps.source)` with:

```ts
    const plan = deps.mode === 'full' ? fullPlan(deps.source) : snapshotPlan(deps.source);
    return await runUnits({ ...deps, signal: lock.lost }, plan);
```

In `api/src/jobs/sync/cli.ts`:
- delete the `if (mode === 'full') { … return 2; }` guard;
- add `mode,` to the `runSync({ … })` deps;
- keep the `logger.info(result, 'sync finished')` line. The result already carries `unitsPlanned`, `unitsDone`, `unitsRemaining` and `callsUsed`.

In `api/tests/integration/snapshot.test.ts`, add `mode: 'snapshot',` to the object returned by `deps()`.

- [ ] **Step 4: Write the full-mode integration tests**

`api/tests/integration/full-sync.test.ts`:

```ts
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
        JSON.stringify([{ country: name, region: '', [metric]: { '2023-03-09': { total: 1, new: 0 } } }]),
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
      await rows("SELECT count(*)::int AS n FROM daily_stat WHERE country_code = 'XDP' AND metric = 'deaths'"),
    ).toEqual([{ n: 0 }]);

    const coverage = await createReadRepositories(reader).dataState.findCoverage(
      (await rows<{ id: number }>("SELECT id FROM data_source WHERE code = 'api_ninjas'"))[0]!.id,
    );
    // XDP has no deaths: deaths closes with one country less and still dates the data.
    expect(coverage).toEqual({ from: '2023-03-05', referenceDate: '2023-03-09', countries: mappedNames });
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
    expect(
      await rows(`SELECT status FROM sync_run WHERE id = ${orphan[0]?.id ?? 0}`),
    ).toEqual([{ status: 'failed' }]);
  });

  it('keeps /ready at 200 after a full run crashes having written rows', async () => {
    // Snapshot first: the reference date exists for both metrics.
    await runSync({
      ...deps(
        ((url) =>
          Promise.resolve(
            new Response(
              fixtureText(
                `date-2023-03-09-${new URL(url).searchParams.get('type') === 'deaths' ? 'deaths' : 'cases'}.json`,
              ),
              { status: 200 },
            ),
          )) as RawFetch,
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
            fetchDay: provider.fetchDay,
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
```

Notes for the implementer:
- **Two-unit case:** the 2 units written before the crash (Afghanistan and Albania cases) add 2 countries to cases on 2023-03-09. Cases then has N = 6 and deaths N = 4, and the date still closes. That is the per-metric RN-06.
- **Fixture order:** if the alphabetical order of mapped names does not start with `Afghanistan`, `Albania`, check `api/prisma/seed/aliases.json` and adjust the two literal names in the first test and in the orphan test. Keep the meaning: the first and second planned units.
- **Lint:** `(await rows(...))[0]!.id` and the `as RawFetch` cast are acceptable in tests. If lint objects, extract a typed helper.

Run: `npm test -w api` and `npm run test:integration -w api`. Expected: PASS, including the unchanged snapshot suite.

- [ ] **Step 5: Commit**

```bash
npx prettier --write api/src/jobs/sync api/tests
npm run lint && npm run typecheck && npm test
git add api/src api/tests
git commit -m "feat: add the resumable full sync mode"
```

---

### Task 7: Manual sync workflow and documentation

**Files:**
- Create: `.github/workflows/sync.yml`
- Modify: `docs/adr/0004-sync-job.md`, `CLAUDE.md`

- [ ] **Step 1: Create the workflow**

`.github/workflows/sync.yml`:

```yaml
name: Sync

# Manual only: each run spends API Ninjas quota. Needs the production database and secrets (F9).
on:
  workflow_dispatch:
    inputs:
      mode:
        description: snapshot (2 chamadas) ou full (retomável, ~404 chamadas no total)
        type: choice
        options: [snapshot, full]
        default: snapshot

permissions:
  contents: read

concurrency:
  group: sync
  cancel-in-progress: false

jobs:
  sync:
    name: Sync (${{ inputs.mode }})
    runs-on: ubuntu-latest
    timeout-minutes: 30
    environment: production
    env:
      DATABASE_URL_SYNC: ${{ secrets.DATABASE_URL_SYNC }}
      API_NINJAS_KEY: ${{ secrets.API_NINJAS_KEY }}
      DATA_PROVIDER: ${{ vars.DATA_PROVIDER || 'api_ninjas' }}
      SYNC_MODE: ${{ inputs.mode }}
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      # The mode reaches the shell only through an environment variable, never interpolated.
      - run: npm run sync -w api -- "--mode=$SYNC_MODE"
```

Run `npx prettier --check .github/workflows/sync.yml` (format it if needed). Do **not** trigger the workflow.

- [ ] **Step 2: Update ADR 0004**

Append to `docs/adr/0004-sync-job.md` a section:

```markdown
## Atualização (F5, 2026-10-21)

- **Modo full:**
  - uma unidade por (métrica, alias `mapped`), `full:{metric}:{nome}`, hoje 404, nas mesmas chamadas `country=`;
  - unidades `done` de runs `full` anteriores são puladas, porque a série é histórica, e as `error` ou `pending` são tentadas de novo;
  - orçamento esgotado fecha o run como `partial`, e o próximo `--mode=full` continua de onde parou;
  - o job recusa começar se dois aliases `mapped` apontarem para o mesmo país.
- **Status:**
  - `failed` só quando o run não gravou nada;
  - a chave rejeitada (401/403) depois de gravar vira `partial` e o job para.
  - Assim, todo run que grava dados muda o `dataVersion`.
- **429:**
  - `Retry-After` de 1 a 60 s é respeitado;
  - um 429 na última tentativa vira orçamento esgotado e para o run.
- **Orçamento:** é contado numa query só, com o relógio do banco (última hora e mês calendário UTC).
- **Lock:**
  - se a conexão do lock cair, o run para antes da próxima unidade e fecha com a nota "lock perdido";
  - liberar o lock é best-effort.
- **Consistência:**
  - todo run que gravou atualiza a view, mesmo quando cai por erro inesperado;
  - a recuperação de run órfão também atualiza a view;
  - a cobertura (RN-06) é calculada só pela view, por métrica.
- **Workflow:** `.github/workflows/sync.yml` é só manual (`workflow_dispatch`), com `concurrency` e `environment: production`.
```

- [ ] **Step 3: Update CLAUDE.md**

1. In "Estado atual", after the F4 bullet, add:

```markdown
- F5 Carga histórica concluída em 2026-10-21 (PR #7): modo `full` retomável (404 unidades por métrica × alias `mapped`, `country=`, pula unidades `done`, para no orçamento e continua no próximo run), executor único de unidades com `ProviderFactory`, upsert da série em lote, status `failed` só sem gravação, 429 com `Retry-After` e parada, orçamento contado no banco, lock perdido para o run, refresh da view em todo run que gravou, cobertura (RN-06) calculada só pela view por métrica, workflow manual `sync.yml` (ADR 0004 atualizado). O full real contra a API Ninjas ainda não rodou: só com pedido explícito.
```

2. In "Regras de negócio", append to RN-06: ` Cálculo: N de cada métrica = maior número de países numa data da view; a data de referência é a última em que as duas métricas atingem o próprio N.`

3. In "Comandos", change the comment of the full line to `# série histórica, retomável (~404 chamadas no total; para no orçamento e continua)`.

4. In the "Adiado com fase-alvo" bullet, remove the sentences resolved in this phase, and keep everything else verbatim:
   - from "mais da revisão da F2: política de 429 …" up to "… retomada que considere checkpoints `pending` de runs órfãos (F5);";
   - from "mais da revisão da F3: consistência entre `daily_stat`, a view e o `dataVersion` …" up to "… contar países por métrica também mexe na RN-06 (F5);".

   Read the bullet carefully before cutting. Keep the F9 items (`DATABASE_URL_SYNC` direct connection, etc.), the F6, F8 and F9 items, and the front items.

- [ ] **Step 4: Verify and commit**

```bash
npx prettier --write docs/adr/0004-sync-job.md .github/workflows/sync.yml
npm run lint && npm run typecheck && npm test
git add .github/workflows/sync.yml docs/adr/0004-sync-job.md CLAUDE.md
git commit -m "docs: add the manual sync workflow and close phase 5"
```
