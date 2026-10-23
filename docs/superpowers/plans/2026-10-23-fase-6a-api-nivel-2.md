# Fase 6a — API e sync do Nível 2: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cobertura só com datas completas, `/rankings` com a ordem no SQL, rotas de série, cache por `dataVersion` (ETag/304) e as duas mudanças do sync (órfão que gravou → `partial`; full sem unidades não cria run).

**Architecture:** Camadas atuais da `api` (routes → controllers → services → repositories). SQL só nos repositórios, com o fragmento de "datas completas" compartilhado. O cache é um middleware que responde 304 antes de validar a query; o `/meta` tem ETag próprio com o id do último run. O sync muda só em `sync-run.repository.ts`, `run-sync.ts` e `run-units.ts`.

**Tech Stack:** Express 5, zod 4 + zod-openapi, Prisma 7 (`$queryRaw` com `Prisma.sql`), PostgreSQL 18 (collation ICU `pt-BR-x-icu`), Vitest + Supertest.

**Spec:** `docs/superpowers/specs/2026-10-23-fase-6-nivel-2-design.md` (seções F6a 1–5 e "Testes da F6a").

## Global Constraints

- Conversa e documentação em pt-BR; código, nomes, tabelas e rotas em inglês. Um commit por tarefa, Conventional Commits.
- Nunca rode `npm run sync -w api` contra a fonte real; nunca leia, imprima ou commite `.env`. Testes só com fixtures e fakes.
- TypeScript `strict`, sem `any`. Antes de commitar: `npm run lint`, `npm run typecheck`, `npm test` (raiz) verdes; nas tarefas que mexem em SQL ou no sync, também `npm run test:integration -w api` (Postgres local `mapp-db-1` em 127.0.0.1:5435 já está de pé; nunca `docker compose down -v`).
- SQL só em `api/src/repositories`, sempre parametrizado por tagged template.
- Ordem alfabética no SQL: `COLLATE "pt-BR-x-icu"`.
- `Cache-Control` de sucesso: exatamente `public, max-age=3600`. ETag de dados: `"v{dataVersion}"`. ETag do `/meta`: `"v{dataVersion ?? 0}.r{id do último run finalizado ?? 0}"`. Erros, `/health` e `/ready`: `Cache-Control: no-store`.
- Memo do `dataVersion`: 5000 ms.
- `/rankings`: `limit` inteiro 1..50, padrão 10; `metric` padrão `cases`.
- Séries: `granularity` = `day` | `week` | `month`, padrão `day`; semana ISO (segunda); `new` = soma do bloco, `total` = último valor; data do ponto = início do bloco cortado em `from`.
- Depois de mudar schema ou documento OpenAPI: `npm run openapi -w api` e `npm run api:types -w web`, e commitar `docs/openapi.yaml` e `web/src/shared/api/schema.d.ts` junto (há testes de defasagem nos dois lados).
- Mensagens de erro da API em inglês, como as atuais.

---

### Task 1: Cobertura só com datas completas

**Files:**
- Create: `api/src/repositories/complete-dates.ts`
- Modify: `api/src/repositories/data-state.repository.ts`
- Modify: `api/src/services/data-state.service.ts`
- Modify: `api/tests/helpers/fake-repositories.ts`
- Test: `api/tests/unit/services/data-state.service.test.ts`, `api/tests/integration/coverage.test.ts`, `api/tests/integration/read-repositories.test.ts`

**Interfaces:**
- Produces: `completeDatesSql(sourceId: number): Prisma.Sql` (subquery com a coluna `stat_date`); `DataStateRepository.isCompleteDate(sourceId: number, date: string): Promise<boolean>` (substitui `hasGlobalDate`).

- [ ] **Step 1: Testes de integração da cobertura (falham)**

Em `api/tests/integration/coverage.test.ts`, troque o teste `has no reference date while one metric has no data at all` por esta versão (sem data completa, `from` também é nulo):

```ts
  it('has no coverage while one metric has no data at all', async () => {
    await insert([['BRA', 'cases', D1]]);
    await refresh();

    expect(await repos.dataState.findCoverage(sourceId)).toEqual({
      from: null,
      referenceDate: null,
      countries: 1,
    });
  });
```

E acrescente no mesmo `describe`:

```ts
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
    expect(await repos.dataState.isCompleteDate(sourceId, D0)).toBe(false);
    expect(await repos.dataState.isCompleteDate(sourceId, D1)).toBe(true);
    expect(await repos.dataState.isCompleteDate(sourceId, D2)).toBe(false);
    expect(await repos.dataState.isCompleteDate(sourceId, D3)).toBe(true);
  });
```

Em `api/tests/integration/read-repositories.test.ts`, troque o teste `checks whether the global view has a date` por:

```ts
  it('checks whether a date is complete', async () => {
    // D2 misses ARG, so only D1 is complete.
    expect(await repos.dataState.isCompleteDate(fixture.sourceId, D1)).toBe(true);
    expect(await repos.dataState.isCompleteDate(fixture.sourceId, D2)).toBe(false);
    expect(await repos.dataState.isCompleteDate(fixture.sourceId, '2023-03-10')).toBe(false);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test:integration -w api -- coverage read-repositories`
Expected: FAIL (`isCompleteDate is not a function` e `from` ≠ `null`).

- [ ] **Step 3: Fragmento de datas completas**

`api/src/repositories/complete-dates.ts`:

```ts
import { Prisma } from '../generated/prisma/client.js';

// RN-06: a date is complete when both metrics reach their own N, the highest country_count
// of that metric in the view. Coverage, date validation and series use only these dates.
export function completeDatesSql(sourceId: number): Prisma.Sql {
  return Prisma.sql`
    SELECT g.stat_date
    FROM global_daily_stat g
    JOIN (
      SELECT metric, max(country_count) AS n
      FROM global_daily_stat
      WHERE source_id = ${sourceId}
      GROUP BY metric
    ) n ON n.metric = g.metric
    WHERE g.source_id = ${sourceId} AND g.country_count = n.n
    GROUP BY g.stat_date
    HAVING count(*) = 2`;
}
```

- [ ] **Step 4: Repositório**

Em `api/src/repositories/data-state.repository.ts`:
- Na interface, troque `hasGlobalDate(sourceId: number, date: string): Promise<boolean>;` por `isCompleteDate(sourceId: number, date: string): Promise<boolean>;`.
- Substitua `findCoverage` e `hasGlobalDate` por:

```ts
    // RN-06 from the view only: coverage runs from the first to the last complete date.
    // Rows not yet refreshed are ignored.
    async findCoverage(sourceId) {
      const [row] = await db.$queryRaw<CoverageRow[]>`
        WITH complete AS (${completeDatesSql(sourceId)})
        SELECT
          (SELECT min(stat_date) FROM complete) AS "from",
          (SELECT max(stat_date) FROM complete) AS "referenceDate",
          coalesce(
            (SELECT max(country_count) FROM global_daily_stat WHERE source_id = ${sourceId}),
            0
          )::int AS countries`;
      return {
        from: row?.from ? toIsoDate(row.from) : null,
        referenceDate: row?.referenceDate ? toIsoDate(row.referenceDate) : null,
        countries: row?.countries ?? 0,
      };
    },

    async isCompleteDate(sourceId, date) {
      const [row] = await db.$queryRaw<{ complete: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM (${completeDatesSql(sourceId)}) complete
          WHERE complete.stat_date = ${date}::date
        ) AS complete`;
      return row?.complete === true;
    },
```

Importe `completeDatesSql` de `./complete-dates.js`.

- [ ] **Step 5: Serviço e fake**

Em `api/src/services/data-state.service.ts`, no `resolveDate`, troque `repo.hasGlobalDate(` por `repo.isCompleteDate(` (o resto do teste de cobertura fica igual).

Em `api/tests/helpers/fake-repositories.ts`, troque a linha `hasGlobalDate: ...` por:

```ts
      isCompleteDate: (_sourceId, date) => Promise.resolve(date in GLOBAL),
```

Em `api/tests/unit/services/data-state.service.test.ts`: renomeie o mock `hasGlobalDate` para `isCompleteDate` (na `stubRepo` e nos dois testes que o usam) e o título `rejects a date inside the range without a global row` para `rejects a date inside the range that is not complete`.

- [ ] **Step 6: Rodar tudo**

Run: `npm run test:integration -w api && npm run lint && npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api/src/repositories/complete-dates.ts api/src/repositories/data-state.repository.ts api/src/services/data-state.service.ts api/tests
git commit -m "feat: limit the coverage to complete dates"
```

---

### Task 2: `/rankings` e a ordem no SQL

**Files:**
- Modify: `api/src/repositories/stats.repository.ts`
- Modify: `api/src/services/comparison.ts`, `api/src/services/countries.service.ts`, `api/src/services/create-services.ts`
- Create: `api/src/services/rankings.service.ts`, `api/src/controllers/rankings.controller.ts`
- Modify: `api/src/routes/schemas.ts`, `api/src/routes/v1.routes.ts`, `api/src/openapi/document.ts`
- Modify: `api/tests/helpers/fake-repositories.ts`
- Test: `api/tests/api/rankings.test.ts` (novo), `api/tests/integration/read-repositories.test.ts`, `api/tests/unit/services/comparison.test.ts`, `api/tests/unit/services/countries.service.test.ts`
- Regenerate: `docs/openapi.yaml`, `web/src/shared/api/schema.d.ts`

**Interfaces:**
- Consumes: nada da Task 1 além do que já existe.
- Produces:
  - `StatsRepository.listRanking(sourceId: number, metric: StatMetric, date: string, limit: number): Promise<RankingRow[]>`
  - `StatsRepository.findCountryRanks(sourceId: number, date: string, code: string): Promise<CountryRankRow[]>`
  - `RankingRow { rank: number; code: string; name: string; total: number; newValue: number; rankedCount: number }`
  - `CountryRankRow { metric: StatMetric; total: number | null; newValue: number | null; rank: number | null; rankedCount: number }`
  - `RankingsService.getRankings(metric: StatMetric, limit: number, date: string | undefined): Promise<RankingsResponse>`; `Services.rankings`.
  - Removidos: `StatsRepository.listCountryDayStats`, `DayStat`, `compareNames`, `rankOf`, `RankEntry`.

- [ ] **Step 1: Testes de integração (falham)**

Em `api/tests/integration/read-repositories.test.ts`, no `describe('stats repository ...')`, substitua o teste `lists the day stats of kind=country only` por:

```ts
  it('ranks kind=country by total, ties in pt-BR alphabetical order (RN-05)', async () => {
    // D1 cases: ARG 100 and BRA 100 tie → Argentina first; XDP is not a country.
    expect(await repos.stats.listRanking(fixture.sourceId, 'cases', D1, 10)).toEqual([
      { rank: 1, code: 'ARG', name: 'Argentina', total: 100, newValue: 5, rankedCount: 2 },
      { rank: 2, code: 'BRA', name: 'Brasil', total: 100, newValue: 10, rankedCount: 2 },
    ]);
    expect(await repos.stats.listRanking(fixture.sourceId, 'deaths', D1, 1)).toEqual([
      { rank: 1, code: 'ARG', name: 'Argentina', total: 20, newValue: 2, rankedCount: 2 },
    ]);
  });

  it('finds the rank of one country per metric, null when it has no data', async () => {
    expect(await repos.stats.findCountryRanks(fixture.sourceId, D1, 'BRA')).toEqual([
      { metric: 'cases', total: 100, newValue: 10, rank: 2, rankedCount: 2 },
      { metric: 'deaths', total: 10, newValue: 1, rank: 2, rankedCount: 2 },
    ]);
    // ARG has no row on D2; BRA is the only ranked country there.
    expect(await repos.stats.findCountryRanks(fixture.sourceId, D2, 'ARG')).toEqual([
      { metric: 'cases', total: null, newValue: null, rank: null, rankedCount: 1 },
      { metric: 'deaths', total: null, newValue: null, rank: null, rankedCount: 1 },
    ]);
  });
```

E no teste `lists every kind=country with nulls when there is no data`, acrescente no fim (a ordem do SQL tem de ser a mesma do `localeCompare('pt-BR')`, acentos incluídos):

```ts
    const names = values.map((value) => value.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'pt-BR')));
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test:integration -w api -- read-repositories`
Expected: FAIL (`listRanking is not a function`; nomes fora de ordem, porque hoje ordena por código).

- [ ] **Step 3: Repositório**

Em `api/src/repositories/stats.repository.ts`:
- Remova `DayStat` e `listCountryDayStats` (interface e implementação).
- Acrescente os tipos e métodos:

```ts
export interface RankingRow {
  rank: number;
  code: string;
  name: string;
  total: number;
  newValue: number;
  rankedCount: number;
}

export interface CountryRankRow {
  metric: StatMetric;
  total: number | null;
  newValue: number | null;
  rank: number | null;
  rankedCount: number;
}
```

Na interface `StatsRepository`:

```ts
  listRanking(sourceId: number, metric: StatMetric, date: string, limit: number): Promise<RankingRow[]>;
  findCountryRanks(sourceId: number, date: string, code: string): Promise<CountryRankRow[]>;
```

Fora de `createStatsRepository` (importe `Prisma` de `../generated/prisma/client.js`):

```ts
// RN-05: absolute value, ties in pt-BR alphabetical order; only kind = country (RN-08).
function rankedSql(sourceId: number, date: string): Prisma.Sql {
  return Prisma.sql`
    SELECT s.metric::text AS metric, s.country_code AS code, c.name, s.total,
           s.new_value AS "newValue",
           row_number() OVER (
             PARTITION BY s.metric ORDER BY s.total DESC, c.name COLLATE "pt-BR-x-icu"
           )::int AS rank,
           count(*) OVER (PARTITION BY s.metric)::int AS "rankedCount"
    FROM daily_stat s
    JOIN country c ON c.code = s.country_code
    WHERE s.source_id = ${sourceId} AND s.stat_date = ${date}::date AND c.kind = 'country'`;
}
```

Dentro do objeto retornado:

```ts
    listRanking: (sourceId, metric, date, limit) =>
      db.$queryRaw<RankingRow[]>`
        SELECT rank, code, name, total, "newValue", "rankedCount"
        FROM (${rankedSql(sourceId, date)}) ranked
        WHERE metric = ${metric}
        ORDER BY rank
        LIMIT ${limit}`,

    findCountryRanks: (sourceId, date, code) =>
      db.$queryRaw<CountryRankRow[]>`
        WITH ranked AS (${rankedSql(sourceId, date)}),
        counts AS (
          SELECT metric, max("rankedCount") AS "rankedCount" FROM ranked GROUP BY metric
        )
        SELECT counts.metric, r.total, r."newValue", r.rank, counts."rankedCount"
        FROM counts
        LEFT JOIN ranked r ON r.metric = counts.metric AND r.code = ${code}
        ORDER BY counts.metric`,
```

No `listCountryValues`, troque `ORDER BY c.code` por `ORDER BY c.name COLLATE "pt-BR-x-icu"`.

- [ ] **Step 4: `comparison.ts` e serviço de países**

`api/src/services/comparison.ts` fica só com:

```ts
// RN-04: country ÷ global × 100, one decimal; global 0 or missing → null.
export function sharePercent(value: number, globalTotal: number | null | undefined): number | null {
  if (globalTotal === null || globalTotal === undefined || globalTotal === 0) return null;
  return Math.round((value / globalTotal) * 1000) / 10;
}

export interface Rank {
  rank: number | null;
  rankedCount: number;
}
```

Em `api/tests/unit/services/comparison.test.ts`, remova os testes de `rankOf` e `compareNames` (a ordem agora é do SQL e está coberta na integração) e ajuste o import para só `sharePercent`.

Em `api/src/services/countries.service.ts`:
- Import: `import { sharePercent, type Rank } from './comparison.js';`
- `listCountries`: tire o `.sort(...)` (o SQL já ordena por nome).
- `getCountry`: troque o `Promise.all` e o `byMetric` por:

```ts
      const [ranks, globalRows] = await Promise.all([
        repo.findCountryRanks(sourceId, resolved.date, code),
        repo.findGlobalDay(sourceId, resolved.date),
      ]);

      const byMetric = (metric: StatMetric) => {
        const row = ranks.find((entry) => entry.metric === metric);
        const globalTotal = globalRows.find((entry) => entry.metric === metric)?.total;
        const value =
          row && row.total !== null && row.newValue !== null
            ? { total: row.total, new: row.newValue }
            : null;
        return {
          value,
          comparison: {
            share: value ? sharePercent(value.total, globalTotal) : null,
            rank: row?.rank ?? null,
            rankedCount: row?.rankedCount ?? 0,
          },
        };
      };
```

- [ ] **Step 5: Serviço, controller, schemas e rota de rankings**

`api/src/services/rankings.service.ts`:

```ts
import type { StatMetric, StatsRepository } from '../repositories/stats.repository.js';
import { sharePercent } from './comparison.js';
import type { DataStateService } from './data-state.service.js';

export interface RankingItem {
  rank: number;
  code: string;
  name: string;
  total: number;
  new: number;
  share: number | null;
}

export interface RankingsResponse {
  date: string;
  metric: StatMetric;
  rankedCount: number;
  items: RankingItem[];
}

export interface RankingsService {
  getRankings(metric: StatMetric, limit: number, date: string | undefined): Promise<RankingsResponse>;
}

export function createRankingsService(
  dataState: DataStateService,
  repo: StatsRepository,
): RankingsService {
  return {
    async getRankings(metric, limit, date) {
      const resolved = await dataState.resolveDate(date);
      const { sourceId } = resolved.state;
      const [rows, globalRows] = await Promise.all([
        repo.listRanking(sourceId, metric, resolved.date, limit),
        repo.findGlobalDay(sourceId, resolved.date),
      ]);
      const globalTotal = globalRows.find((row) => row.metric === metric)?.total;
      return {
        date: resolved.date,
        metric,
        rankedCount: rows[0]?.rankedCount ?? 0,
        items: rows.map((row) => ({
          rank: row.rank,
          code: row.code,
          name: row.name,
          total: row.total,
          new: row.newValue,
          share: sharePercent(row.total, globalTotal),
        })),
      };
    },
  };
}
```

Em `create-services.ts`: acrescente `rankings: RankingsService` em `Services` e `rankings: createRankingsService(dataState, repos.stats)`.

Em `api/src/routes/schemas.ts`, acrescente:

```ts
export const rankingsQuerySchema = z.object({
  metric: metricSchema.default('cases'),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .meta({ description: 'Quantos países devolver (1 a 50)' }),
  date: isoDateSchema.optional(),
});

export const rankingsResponseSchema = z
  .object({
    date: z.string(),
    metric: metricSchema,
    rankedCount: z.number().int(),
    items: z.array(
      z.object({
        rank: z.number().int(),
        code: z.string(),
        name: z.string(),
        total: z.number().int(),
        new: z.number().int(),
        share: z.number().nullable(),
      }),
    ),
  })
  .meta({ id: 'RankingsResponse' });
```

`api/src/controllers/rankings.controller.ts`:

```ts
import type { RequestHandler } from 'express';
import { rankingsQuerySchema } from '../routes/schemas.js';
import type { RankingsService } from '../services/rankings.service.js';

export function createRankingsController(service: RankingsService): { list: RequestHandler } {
  return {
    list: async (req, res) => {
      const { metric, limit, date } = rankingsQuerySchema.parse(req.query);
      res.json(await service.getRankings(metric, limit, date));
    },
  };
}
```

Em `v1.routes.ts`: `const rankings = createRankingsController(services.rankings);` e `router.get('/rankings', rankings.list);`.

Em `api/src/openapi/document.ts`, importe os dois schemas e acrescente em `paths`:

```ts
      '/api/v1/rankings': {
        get: {
          summary: 'Ranking dos países pela métrica numa data (RN-05), com participação %',
          requestParams: { query: rankingsQuerySchema },
          responses: { '200': json(rankingsResponseSchema, 'Ranking'), ...dataErrors },
        },
      },
```

- [ ] **Step 6: Fake e testes de API (falham antes do Step 5, passam depois)**

Em `api/tests/helpers/fake-repositories.ts`:
- Troque o import de `DayStat` por uma interface local:

```ts
interface FakeDayStat {
  code: string;
  name: string;
  metric: StatMetric;
  total: number;
  newValue: number;
}
```

  (importe `StatMetric` de `stats.repository.js`) e use `Record<string, FakeDayStat[]>` em `DAY_STATS`.
- Acrescente, antes de `createFakeRepositories`:

```ts
// Mirrors the SQL order: total desc, ties by pt-BR name; only kind = country rows are in DAY_STATS.
function rankedStats(date: string, metric: StatMetric) {
  const entries = (DAY_STATS[date] ?? [])
    .filter((stat) => stat.metric === metric)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'pt-BR'));
  return entries.map((stat, index) => ({
    rank: index + 1,
    code: stat.code,
    name: stat.name,
    total: stat.total,
    newValue: stat.newValue,
    rankedCount: entries.length,
  }));
}
```

- Em `stats`: remova `listCountryDayStats`; no `listCountryValues`, ordene o resultado com `.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))`; acrescente:

```ts
      listRanking: (_sourceId, metric, date, limit) =>
        Promise.resolve(rankedStats(date, metric).slice(0, limit)),
      findCountryRanks: (_sourceId, date, code) =>
        Promise.resolve(
          (['cases', 'deaths'] as const)
            .filter((metric) => rankedStats(date, metric).length > 0)
            .map((metric) => {
              const ranked = rankedStats(date, metric);
              const own = ranked.find((entry) => entry.code === code);
              return {
                metric,
                total: own?.total ?? null,
                newValue: own?.newValue ?? null,
                rank: own?.rank ?? null,
                rankedCount: ranked.length,
              };
            }),
        ),
```

`api/tests/api/rankings.test.ts`:

```ts
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorResponseSchema, rankingsResponseSchema } from '../../src/routes/schemas.js';
import { createTestApp } from '../helpers/test-app.js';

describe('GET /api/v1/rankings', () => {
  it('ranks cases on the reference date, ties in alphabetical order', async () => {
    const response = await request(createTestApp()).get('/api/v1/rankings');

    expect(response.status).toBe(200);
    expect(rankingsResponseSchema.parse(response.body)).toEqual({
      date: '2023-03-09',
      metric: 'cases',
      rankedCount: 2,
      items: [
        { rank: 1, code: 'ARG', name: 'Argentina', total: 100, new: 5, share: 40 },
        { rank: 2, code: 'BRA', name: 'Brasil', total: 100, new: 10, share: 40 },
      ],
    });
  });

  it('uses the metric and the limit', async () => {
    const response = await request(createTestApp()).get('/api/v1/rankings?metric=deaths&limit=1');

    expect(response.status).toBe(200);
    expect(rankingsResponseSchema.parse(response.body)).toMatchObject({
      metric: 'deaths',
      rankedCount: 2,
      items: [{ rank: 1, code: 'ARG', total: 20, share: 57.1 }],
    });
  });

  it.each(['0', '51', '1.5', 'abc'])('rejects limit=%s', async (limit) => {
    const response = await request(createTestApp()).get(`/api/v1/rankings?limit=${limit}`);

    expect(response.status).toBe(400);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a date outside the coverage', async () => {
    const response = await request(createTestApp()).get('/api/v1/rankings?date=2023-03-10');

    expect(response.status).toBe(400);
  });

  it('responds 503 without data', async () => {
    const response = await request(createTestApp({ ready: false })).get('/api/v1/rankings');

    expect(response.status).toBe(503);
  });
});
```

Em `api/tests/unit/services/countries.service.test.ts`, os testes devem continuar passando com o fake novo; se algum dependia de `listCountryDayStats`, ajuste-o para o mesmo resultado esperado (posição e participação não mudam).

- [ ] **Step 7: OpenAPI, tipos e verificação**

Run: `npm run openapi -w api && npm run api:types -w web && npm run test:integration -w api && npm run lint && npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add api docs/openapi.yaml web/src/shared/api/schema.d.ts
git commit -m "feat: add the rankings endpoint with the order computed in SQL"
```

---

### Task 3: Rotas de série

**Files:**
- Modify: `api/src/services/data-state.service.ts` (`resolveRange`)
- Modify: `api/src/repositories/stats.repository.ts` (séries)
- Create: `api/src/services/timeseries.service.ts`, `api/src/controllers/timeseries.controller.ts`
- Modify: `api/src/services/create-services.ts`, `api/src/routes/schemas.ts`, `api/src/routes/v1.routes.ts`, `api/src/openapi/document.ts`
- Modify: `api/tests/helpers/fake-repositories.ts`
- Test: `api/tests/api/timeseries.test.ts` (novo), `api/tests/integration/series.test.ts` (novo), `api/tests/unit/services/data-state.service.test.ts`
- Regenerate: `docs/openapi.yaml`, `web/src/shared/api/schema.d.ts`

**Interfaces:**
- Consumes: `completeDatesSql(sourceId)` (Task 1); `StatsRepository.findCountry` (existente).
- Produces:
  - `DataStateService.resolveRange(from: string | undefined, to: string | undefined): Promise<ResolvedRange>`; `ResolvedRange { state: DataState; from: string; to: string }`.
  - `Granularity = 'day' | 'week' | 'month'`; `SeriesRange { from: string; to: string; granularity: Granularity }`; `SeriesPointRow { date: string; total: number; newValue: number }` (em `stats.repository.ts`).
  - `StatsRepository.listGlobalSeries(sourceId: number, metric: StatMetric, range: SeriesRange): Promise<SeriesPointRow[]>`
  - `StatsRepository.listCountrySeries(sourceId: number, code: string, metric: StatMetric, range: SeriesRange): Promise<SeriesPointRow[]>`
  - `TimeseriesService.getGlobalSeries(query: TimeseriesQuery)` e `getCountrySeries(code: string, query: TimeseriesQuery)`; `Services.timeseries`.

- [ ] **Step 1: Testes do `resolveRange` (falham)**

Em `api/tests/unit/services/data-state.service.test.ts` (cobertura do stub: `2023-03-01` a `2023-03-09`):

```ts
describe('data state service: resolveRange', () => {
  it('defaults to the whole coverage', async () => {
    const service = createDataStateService(stubRepo(), 'api_ninjas');

    expect(await service.resolveRange(undefined, undefined)).toMatchObject({
      from: '2023-03-01',
      to: '2023-03-09',
    });
  });

  it('keeps a range inside the coverage', async () => {
    const service = createDataStateService(stubRepo(), 'api_ninjas');

    expect(await service.resolveRange('2023-03-02', '2023-03-05')).toMatchObject({
      from: '2023-03-02',
      to: '2023-03-05',
    });
  });

  it('rejects from after to', async () => {
    const service = createDataStateService(stubRepo(), 'api_ninjas');

    await expect(service.resolveRange('2023-03-05', '2023-03-02')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'from must not be after to',
      details: { from: '2023-03-05', to: '2023-03-02' },
    });
  });

  it.each([
    ['2023-02-28', undefined],
    [undefined, '2023-03-10'],
  ])('rejects from=%s to=%s outside the coverage', async (from, to) => {
    const service = createDataStateService(stubRepo(), 'api_ninjas');

    await expect(service.resolveRange(from, to)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'date is outside the data coverage',
      details: { from: '2023-03-01', to: '2023-03-09' },
    });
  });

  it('is not ready without data', async () => {
    const repo = stubRepo();
    repo.findDataVersion.mockResolvedValue(null);
    const service = createDataStateService(repo, 'api_ninjas');

    await expect(service.resolveRange(undefined, undefined)).rejects.toMatchObject({
      code: 'DATA_NOT_READY',
    });
  });
});
```

Run: `npx vitest run -w api tests/unit/services/data-state.service.test.ts` — Expected: FAIL (`resolveRange is not a function`). (Se o `-w` não for aceito pelo vitest, rode de dentro de `api/`: `npx vitest run tests/unit/services/data-state.service.test.ts`.)

- [ ] **Step 2: `resolveRange`**

Em `api/src/services/data-state.service.ts`:

```ts
export interface ResolvedRange {
  state: DataState;
  from: string;
  to: string;
}
```

Acrescente `resolveRange(from: string | undefined, to: string | undefined): Promise<ResolvedRange>;` em `DataStateService` e, dentro de `createDataStateService`:

```ts
  async function resolveRange(
    from: string | undefined,
    to: string | undefined,
  ): Promise<ResolvedRange> {
    const state = await current();
    if (!state) throw new AppError('DATA_NOT_READY', 503, 'no data has been loaded yet');
    const range = { from: from ?? state.from, to: to ?? state.referenceDate };
    if (range.from > range.to) {
      throw new AppError('VALIDATION_ERROR', 400, 'from must not be after to', range);
    }
    if (range.from < state.from || range.to > state.referenceDate) {
      throw new AppError('VALIDATION_ERROR', 400, 'date is outside the data coverage', {
        from: state.from,
        to: state.referenceDate,
      });
    }
    return { state, ...range };
  }
```

e devolva `{ source, current, resolveDate, resolveRange }`.

- [ ] **Step 3: Testes de integração das séries (falham)**

`api/tests/integration/series.test.ts`:

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
    expect(await repos.stats.listCountrySeries(sourceId, 'CHL', 'cases', range('day'))).toEqual(
      [],
    );
  });
});
```

Run: `npm run test:integration -w api -- series` — Expected: FAIL (`listGlobalSeries is not a function`).

- [ ] **Step 4: Repositório das séries**

Em `api/src/repositories/stats.repository.ts` (importe `toIsoDate` de `../lib/dates.js` e `completeDatesSql` de `./complete-dates.js`):

```ts
export type Granularity = 'day' | 'week' | 'month';

export interface SeriesRange {
  from: string;
  to: string;
  granularity: Granularity;
}

export interface SeriesPointRow {
  date: string;
  total: number;
  newValue: number;
}

interface RawSeriesPoint {
  date: Date;
  total: bigint;
  newValue: bigint;
}

// RN-11: a week (ISO, from Monday) or month sums `new` and keeps the last `total`; the first
// bucket starts at `from`. `days` must yield stat_date, total and new_value.
function bucketSql(days: Prisma.Sql, range: SeriesRange): Prisma.Sql {
  return Prisma.sql`
    SELECT greatest(
             date_trunc(${range.granularity}::text, d.stat_date::timestamp)::date,
             ${range.from}::date
           ) AS date,
           (array_agg(d.total ORDER BY d.stat_date DESC))[1]::bigint AS total,
           sum(d.new_value)::bigint AS "newValue"
    FROM (${days}) d
    GROUP BY 1
    ORDER BY 1`;
}

function toPoints(rows: RawSeriesPoint[]): SeriesPointRow[] {
  // Sums stay far below 2^53.
  return rows.map((row) => ({
    date: toIsoDate(row.date),
    total: Number(row.total),
    newValue: Number(row.newValue),
  }));
}
```

Na interface `StatsRepository`:

```ts
  listGlobalSeries(sourceId: number, metric: StatMetric, range: SeriesRange): Promise<SeriesPointRow[]>;
  listCountrySeries(
    sourceId: number,
    code: string,
    metric: StatMetric,
    range: SeriesRange,
  ): Promise<SeriesPointRow[]>;
```

Implementação (só datas completas, RN-06):

```ts
    async listGlobalSeries(sourceId, metric, range) {
      const days = Prisma.sql`
        SELECT g.stat_date, g.total, g.new_value
        FROM global_daily_stat g
        JOIN (${completeDatesSql(sourceId)}) complete ON complete.stat_date = g.stat_date
        WHERE g.source_id = ${sourceId} AND g.metric = ${metric}::metric
          AND g.stat_date BETWEEN ${range.from}::date AND ${range.to}::date`;
      return toPoints(await db.$queryRaw<RawSeriesPoint[]>(bucketSql(days, range)));
    },

    async listCountrySeries(sourceId, code, metric, range) {
      const days = Prisma.sql`
        SELECT s.stat_date, s.total, s.new_value
        FROM daily_stat s
        JOIN (${completeDatesSql(sourceId)}) complete ON complete.stat_date = s.stat_date
        WHERE s.source_id = ${sourceId} AND s.country_code = ${code}
          AND s.metric = ${metric}::metric
          AND s.stat_date BETWEEN ${range.from}::date AND ${range.to}::date`;
      return toPoints(await db.$queryRaw<RawSeriesPoint[]>(bucketSql(days, range)));
    },
```

Run: `npm run test:integration -w api -- series` — Expected: PASS.

- [ ] **Step 5: Serviço, schemas, controller e rotas**

`api/src/services/timeseries.service.ts`:

```ts
import { AppError } from '../lib/app-error.js';
import type {
  Granularity,
  SeriesPointRow,
  StatMetric,
  StatsRepository,
} from '../repositories/stats.repository.js';
import type { DataStateService } from './data-state.service.js';

export interface TimeseriesQuery {
  metric: StatMetric;
  from: string | undefined;
  to: string | undefined;
  granularity: Granularity;
}

export interface TimeseriesPoint {
  date: string;
  total: number;
  new: number;
}

export interface GlobalTimeseriesResponse {
  metric: StatMetric;
  granularity: Granularity;
  from: string;
  to: string;
  points: TimeseriesPoint[];
}

export interface CountryTimeseriesResponse extends GlobalTimeseriesResponse {
  country: { code: string; name: string };
}

export interface TimeseriesService {
  getGlobalSeries(query: TimeseriesQuery): Promise<GlobalTimeseriesResponse>;
  getCountrySeries(code: string, query: TimeseriesQuery): Promise<CountryTimeseriesResponse>;
}

const toPoint = (row: SeriesPointRow): TimeseriesPoint => ({
  date: row.date,
  total: row.total,
  new: row.newValue,
});

export function createTimeseriesService(
  dataState: DataStateService,
  repo: StatsRepository,
): TimeseriesService {
  return {
    async getGlobalSeries(query) {
      const { state, from, to } = await dataState.resolveRange(query.from, query.to);
      const rows = await repo.listGlobalSeries(state.sourceId, query.metric, {
        from,
        to,
        granularity: query.granularity,
      });
      return {
        metric: query.metric,
        granularity: query.granularity,
        from,
        to,
        points: rows.map(toPoint),
      };
    },

    async getCountrySeries(code, query) {
      const country = await repo.findCountry(code);
      if (!country || country.kind !== 'country') {
        throw new AppError('COUNTRY_NOT_FOUND', 404, `country ${code} not found`, { code });
      }
      const { state, from, to } = await dataState.resolveRange(query.from, query.to);
      const rows = await repo.listCountrySeries(state.sourceId, code, query.metric, {
        from,
        to,
        granularity: query.granularity,
      });
      return {
        country: { code: country.code, name: country.name },
        metric: query.metric,
        granularity: query.granularity,
        from,
        to,
        points: rows.map(toPoint),
      };
    },
  };
}
```

Em `create-services.ts`: `timeseries: TimeseriesService` e `timeseries: createTimeseriesService(dataState, repos.stats)`.

Em `api/src/routes/schemas.ts`:

```ts
export const granularitySchema = z
  .enum(['day', 'week', 'month'])
  .meta({
    id: 'Granularity',
    description: 'day = dia, week = semana ISO (segunda a domingo), month = mês',
  });

export const timeseriesQuerySchema = z.object({
  metric: metricSchema.default('cases'),
  from: isoDateSchema
    .meta({ description: 'Início (YYYY-MM-DD). Sem ele, o início da cobertura.' })
    .optional(),
  to: isoDateSchema
    .meta({ description: 'Fim (YYYY-MM-DD). Sem ele, a data de referência.' })
    .optional(),
  granularity: granularitySchema.default('day'),
});

const timeseriesShape = {
  metric: metricSchema,
  granularity: granularitySchema,
  from: z.string(),
  to: z.string(),
  points: z.array(
    z
      .object({ date: z.string(), total: z.number().int(), new: z.number().int() })
      .meta({ id: 'TimeseriesPoint' }),
  ),
};

export const globalTimeseriesResponseSchema = z
  .object(timeseriesShape)
  .meta({ id: 'GlobalTimeseriesResponse' });

export const countryTimeseriesResponseSchema = z
  .object({ ...timeseriesShape, country: z.object({ code: z.string(), name: z.string() }) })
  .meta({ id: 'CountryTimeseriesResponse' });
```

`api/src/controllers/timeseries.controller.ts`:

```ts
import type { RequestHandler } from 'express';
import { countryParamsSchema, timeseriesQuerySchema } from '../routes/schemas.js';
import type { TimeseriesService } from '../services/timeseries.service.js';

export function createTimeseriesController(service: TimeseriesService): {
  global: RequestHandler;
  country: RequestHandler;
} {
  return {
    global: async (req, res) => {
      const query = timeseriesQuerySchema.parse(req.query);
      res.json(await service.getGlobalSeries(query));
    },
    country: async (req, res) => {
      const { code } = countryParamsSchema.parse(req.params);
      const query = timeseriesQuerySchema.parse(req.query);
      res.json(await service.getCountrySeries(code, query));
    },
  };
}
```

Em `v1.routes.ts`: `const timeseries = createTimeseriesController(services.timeseries);`, `router.get('/global/timeseries', timeseries.global);` e `router.get('/countries/:code/timeseries', timeseries.country);`.

Em `document.ts` (importe os schemas):

```ts
      '/api/v1/global/timeseries': {
        get: {
          summary: 'Série global da métrica por dia, semana ou mês (só datas completas)',
          requestParams: { query: timeseriesQuerySchema },
          responses: {
            '200': json(globalTimeseriesResponseSchema, 'Série global'),
            ...dataErrors,
          },
        },
      },
      '/api/v1/countries/{code}/timeseries': {
        get: {
          summary: 'Série de um país por dia, semana ou mês (só datas completas)',
          requestParams: { path: countryParamsSchema, query: timeseriesQuerySchema },
          responses: {
            '200': json(countryTimeseriesResponseSchema, 'Série do país'),
            '404': json(errorResponseSchema, 'COUNTRY_NOT_FOUND'),
            ...dataErrors,
          },
        },
      },
```

- [ ] **Step 6: Fake e testes de API**

Em `api/tests/helpers/fake-repositories.ts`, acrescente em `stats` (o fake ignora a granularidade; o agrupamento é testado no Postgres):

```ts
      listGlobalSeries: (_sourceId, metric, range) =>
        Promise.resolve(
          Object.entries(GLOBAL)
            .filter(([date]) => date >= range.from && date <= range.to)
            .sort(([a], [b]) => a.localeCompare(b))
            .flatMap(([date, rows]) =>
              rows
                .filter((row) => row.metric === metric)
                .map((row) => ({ date, total: row.total, newValue: row.newValue })),
            ),
        ),
      listCountrySeries: (_sourceId, code, metric, range) =>
        Promise.resolve(
          Object.entries(DAY_STATS)
            .filter(([date]) => date >= range.from && date <= range.to)
            .sort(([a], [b]) => a.localeCompare(b))
            .flatMap(([date, stats]) =>
              stats
                .filter((stat) => stat.code === code && stat.metric === metric)
                .map((stat) => ({ date, total: stat.total, newValue: stat.newValue })),
            ),
        ),
```

`api/tests/api/timeseries.test.ts`:

```ts
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  countryTimeseriesResponseSchema,
  errorResponseSchema,
  globalTimeseriesResponseSchema,
} from '../../src/routes/schemas.js';
import { createTestApp } from '../helpers/test-app.js';

describe('GET /api/v1/global/timeseries', () => {
  it('returns the whole coverage by day by default', async () => {
    const response = await request(createTestApp()).get('/api/v1/global/timeseries');

    expect(response.status).toBe(200);
    expect(globalTimeseriesResponseSchema.parse(response.body)).toEqual({
      metric: 'cases',
      granularity: 'day',
      from: '2023-03-08',
      to: '2023-03-09',
      points: [
        { date: '2023-03-08', total: 90, new: 9 },
        { date: '2023-03-09', total: 250, new: 15 },
      ],
    });
  });

  it('rejects from after to', async () => {
    const response = await request(createTestApp()).get(
      '/api/v1/global/timeseries?from=2023-03-09&to=2023-03-08',
    );

    expect(response.status).toBe(400);
    expect(errorResponseSchema.parse(response.body).error.message).toBe(
      'from must not be after to',
    );
  });

  it('rejects a range outside the coverage', async () => {
    const response = await request(createTestApp()).get(
      '/api/v1/global/timeseries?to=2023-03-10',
    );

    expect(response.status).toBe(400);
    expect(errorResponseSchema.parse(response.body).error.details).toEqual({
      from: '2023-03-08',
      to: '2023-03-09',
    });
  });

  it('rejects an unknown granularity', async () => {
    const response = await request(createTestApp()).get(
      '/api/v1/global/timeseries?granularity=year',
    );

    expect(response.status).toBe(400);
  });

  it('responds 503 without data', async () => {
    const response = await request(createTestApp({ ready: false })).get(
      '/api/v1/global/timeseries',
    );

    expect(response.status).toBe(503);
  });
});

describe('GET /api/v1/countries/:code/timeseries', () => {
  it('returns the country series, normalizing the code', async () => {
    const response = await request(createTestApp()).get(
      '/api/v1/countries/bra/timeseries?metric=deaths&granularity=week',
    );

    expect(response.status).toBe(200);
    expect(countryTimeseriesResponseSchema.parse(response.body)).toEqual({
      country: { code: 'BRA', name: 'Brasil' },
      metric: 'deaths',
      granularity: 'week',
      from: '2023-03-08',
      to: '2023-03-09',
      points: [
        { date: '2023-03-08', total: 0, new: 0 },
        { date: '2023-03-09', total: 10, new: 1 },
      ],
    });
  });

  it('returns no points for a country without data', async () => {
    const response = await request(createTestApp()).get('/api/v1/countries/ESH/timeseries');

    expect(response.status).toBe(200);
    expect(countryTimeseriesResponseSchema.parse(response.body).points).toEqual([]);
  });

  it.each(['XYZ', 'XDP'])('responds 404 for %s', async (code) => {
    const response = await request(createTestApp()).get(`/api/v1/countries/${code}/timeseries`);

    expect(response.status).toBe(404);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('COUNTRY_NOT_FOUND');
  });

  it('rejects a malformed code', async () => {
    const response = await request(createTestApp()).get('/api/v1/countries/BR/timeseries');

    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 7: OpenAPI, tipos e verificação**

Run: `npm run openapi -w api && npm run api:types -w web && npm run test:integration -w api && npm run lint && npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add api docs/openapi.yaml web/src/shared/api/schema.d.ts
git commit -m "feat: add the global and country time series"
```

---

### Task 4: Cache por `dataVersion` (ETag/304) e memo de 5 s

**Files:**
- Create: `api/src/middlewares/cache.ts`
- Modify: `api/src/app.ts`, `api/src/routes/v1.routes.ts`, `api/src/routes/health.routes.ts`, `api/src/middlewares/error-handler.ts`
- Modify: `api/src/repositories/meta.repository.ts`, `api/src/services/meta.service.ts`, `api/src/controllers/meta.controller.ts`
- Modify: `api/src/services/data-state.service.ts`, `api/src/openapi/document.ts`
- Modify: `api/tests/helpers/fake-repositories.ts`
- Test: `api/tests/unit/middlewares/cache.test.ts` (novo), `api/tests/api/cache.test.ts` (novo), `api/tests/unit/services/data-state.service.test.ts`, `api/tests/unit/services/meta.service.test.ts`, `api/tests/integration/read-repositories.test.ts`
- Regenerate: `docs/openapi.yaml`, `web/src/shared/api/schema.d.ts`

**Interfaces:**
- Consumes: as rotas das Tasks 2 e 3.
- Produces:
  - `CACHE_CONTROL = 'public, max-age=3600'`; `etagMatches(ifNoneMatch: string | undefined, etag: string): boolean`; `sendIfFresh(req, res, etag: string): boolean`; `cacheByDataVersion(dataState: DataStateService): RequestHandler`.
  - `LastSyncRecord` ganha `id: number`.
  - `MetaService.getMeta(): Promise<{ meta: MetaResponse; version: string }>` com `version = v{dataVersion ?? 0}.r{lastSync?.id ?? 0}`.
  - `DATA_VERSION_TTL_MS = 5000`; `createDataStateService(repo, sourceCode, options?: { now?: () => number })`.

- [ ] **Step 1: Teste unitário do `etagMatches` (falha)**

`api/tests/unit/middlewares/cache.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { etagMatches } from '../../../src/middlewares/cache.js';

describe('etagMatches (weak comparison)', () => {
  it.each([
    ['"v7"', true],
    ['W/"v7"', true],
    ['"v6", "v7"', true],
    ['*', true],
    ['"v6"', false],
    ['"v70"', false],
  ])('If-None-Match %s → %s', (header, expected) => {
    expect(etagMatches(header, '"v7"')).toBe(expected);
  });

  it('is false without the header', () => {
    expect(etagMatches(undefined, '"v7"')).toBe(false);
  });
});
```

- [ ] **Step 2: Middleware**

`api/src/middlewares/cache.ts`:

```ts
import type { Request, RequestHandler, Response } from 'express';
import type { DataStateService } from '../services/data-state.service.js';

export const CACHE_CONTROL = 'public, max-age=3600';

// Weak comparison (RFC 9110): W/ is ignored and `*` matches any current representation.
export function etagMatches(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false;
  const opaque = (tag: string) => tag.trim().replace(/^W\//, '');
  return ifNoneMatch.split(',').some((tag) => tag.trim() === '*' || opaque(tag) === opaque(etag));
}

// Sets the cache headers; answers 304 and returns true when the client already has this version.
export function sendIfFresh(req: Request, res: Response, etag: string): boolean {
  res.set({ 'Cache-Control': CACHE_CONTROL, ETag: etag });
  if (!etagMatches(req.get('If-None-Match'), etag)) return false;
  res.status(304).end();
  return true;
}

// Same URL and same dataVersion give the same body, so a match answers 304 before validating
// the query or reading data. Without data the route itself answers 503.
export function cacheByDataVersion(dataState: DataStateService): RequestHandler {
  return async (req, res, next) => {
    const state = await dataState.current();
    if (state && sendIfFresh(req, res, `"v${state.dataVersion}"`)) return;
    next();
  };
}
```

- [ ] **Step 3: Ligar o middleware, `no-store` e ETag do Express**

- `api/src/app.ts`: logo após `app.disable('x-powered-by');`, acrescente `app.set('etag', false);` com o comentário `// ETags come from dataVersion (middlewares/cache.ts), not from a body hash.`
- `api/src/routes/v1.routes.ts`: `const fresh = cacheByDataVersion(services.dataState);` e use `fresh` antes do handler em `/global`, `/global/timeseries`, `/countries`, `/countries/:code`, `/countries/:code/timeseries` e `/rankings` (ex.: `router.get('/global', fresh, global.get);`). O `/meta` fica sem `fresh`.
- `api/src/middlewares/error-handler.ts`: antes de `res.status(appError.httpStatus).json(...)`, acrescente:

```ts
  // An error is never cached, even when the cache middleware already set the headers.
  res.removeHeader('ETag');
  res.set('Cache-Control', 'no-store');
```

- `api/src/routes/health.routes.ts`: `res.set('Cache-Control', 'no-store');` antes do `res.status(200).json(...)` do `/health` e do `res.json(...)` do `/ready`.

- [ ] **Step 4: ETag do `/meta`**

- `meta.repository.ts`: `LastSyncRecord` ganha `id: number`; o `select` ganha `id: true` e o retorno `id: run.id`.
- `meta.service.ts`: `getMeta(): Promise<{ meta: MetaResponse; version: string }>`; monte o mesmo objeto de hoje em `const meta: MetaResponse = { ... }` e devolva `{ meta, version: \`v${state?.dataVersion ?? 0}.r${lastSync?.id ?? 0}\` }`, com o comentário `// lastSync changes even on a failed run, which keeps the dataVersion: the version covers both.`
- `meta.controller.ts`:

```ts
    get: async (req, res) => {
      const { meta, version } = await service.getMeta();
      if (sendIfFresh(req, res, `"${version}"`)) return;
      res.json(meta);
    },
```

- `fake-repositories.ts`: `FAKE_LAST_SYNC` ganha `id: 9`.
- `api/tests/unit/services/meta.service.test.ts`: ajuste para `(await service.getMeta()).meta` e acrescente a asserção `version` = `'v7.r9'` com dados e `'v0.r0'` com `ready: false`.
- `api/tests/integration/read-repositories.test.ts`: no teste `returns the last finished run, whatever its status`, acrescente `id: fixture.failedId` no objeto esperado.

- [ ] **Step 5: Memo de 5 s**

Em `api/src/services/data-state.service.ts`:

```ts
// Reads the dataVersion at most once per 5 s per instance; a sync shows up within 5 s.
export const DATA_VERSION_TTL_MS = 5000;

export interface DataStateOptions {
  now?: () => number;
}
```

Assinatura: `createDataStateService(repo, sourceCode, options: DataStateOptions = {})`. Renomeie a função `current` atual para `load` (sem outra mudança) e acrescente:

```ts
  const now = options.now ?? Date.now;
  let recent: { at: number; state: DataState | null } | undefined;

  async function current(): Promise<DataState | null> {
    const at = now();
    if (recent && at - recent.at < DATA_VERSION_TTL_MS) return recent.state;
    const state = await load();
    recent = { at, state };
    return state;
  }
```

Em `api/tests/unit/services/data-state.service.test.ts`, mude o teste `recomputes the coverage only when dataVersion changes` para avançar um relógio injetado:

```ts
  it('recomputes the coverage only when dataVersion changes', async () => {
    const repo = stubRepo();
    let clock = 0;
    const service = createDataStateService(repo, 'api_ninjas', { now: () => clock });

    await service.current();
    clock += DATA_VERSION_TTL_MS;
    await service.current();
    expect(repo.findCoverage).toHaveBeenCalledTimes(1);

    repo.findDataVersion.mockResolvedValue(8);
    clock += DATA_VERSION_TTL_MS;
    await service.current();
    expect(repo.findCoverage).toHaveBeenCalledTimes(2);
    expect(repo.findSource).toHaveBeenCalledTimes(1);
  });

  it('reads the dataVersion at most once per 5 s', async () => {
    const repo = stubRepo();
    let clock = 0;
    const service = createDataStateService(repo, 'api_ninjas', { now: () => clock });

    await service.current();
    clock += DATA_VERSION_TTL_MS - 1;
    await service.current();
    expect(repo.findDataVersion).toHaveBeenCalledTimes(1);

    clock += 1;
    await service.current();
    expect(repo.findDataVersion).toHaveBeenCalledTimes(2);
  });
```

Importe `DATA_VERSION_TTL_MS`. Se algum teste de integração (`api/tests/integration/api.test.ts` ou outro) muda dados depois de criar o app e espera ver a mudança, crie o app depois da mudança ou injete `now`; não aumente esperas.

- [ ] **Step 6: Testes de API do cache**

`api/tests/api/cache.test.ts`:

```ts
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/test-app.js';

const DATA_ROUTES = [
  '/api/v1/global',
  '/api/v1/global/timeseries',
  '/api/v1/countries',
  '/api/v1/countries/BRA',
  '/api/v1/countries/BRA/timeseries',
  '/api/v1/rankings',
];

describe('cache by dataVersion', () => {
  it.each(DATA_ROUTES)('%s sends Cache-Control and the dataVersion ETag', async (route) => {
    const response = await request(createTestApp()).get(route);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=3600');
    expect(response.headers.etag).toBe('"v7"');
  });

  it.each(DATA_ROUTES)('%s answers 304 when If-None-Match matches', async (route) => {
    const response = await request(createTestApp()).get(route).set('If-None-Match', '"v7"');

    expect(response.status).toBe(304);
    expect(response.text).toBe('');
    expect(response.headers.etag).toBe('"v7"');
    expect(response.headers['cache-control']).toBe('public, max-age=3600');
  });

  it('answers 200 for an older version', async () => {
    const response = await request(createTestApp())
      .get('/api/v1/global')
      .set('If-None-Match', '"v6"');

    expect(response.status).toBe(200);
  });

  it('answers 304 before validating the query', async () => {
    const response = await request(createTestApp())
      .get('/api/v1/global?date=yesterday')
      .set('If-None-Match', '"v7"');

    expect(response.status).toBe(304);
  });

  it.each([
    ['400', '/api/v1/global?date=2023-03-10'],
    ['404 country', '/api/v1/countries/XYZ'],
    ['404 route', '/api/v1/nope'],
  ])('a %s is no-store without ETag', async (_label, route) => {
    const response = await request(createTestApp()).get(route);

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.etag).toBeUndefined();
  });

  it('a 503 is no-store without ETag', async () => {
    const response = await request(createTestApp({ ready: false })).get('/api/v1/global');

    expect(response.status).toBe(503);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.etag).toBeUndefined();
  });

  it.each(['/health', '/ready'])('%s is no-store', async (route) => {
    const response = await request(createTestApp()).get(route);

    expect(response.headers['cache-control']).toBe('no-store');
  });
});

describe('/meta ETag', () => {
  it('includes the last finished run', async () => {
    const response = await request(createTestApp()).get('/api/v1/meta');

    expect(response.status).toBe(200);
    expect(response.headers.etag).toBe('"v7.r9"');
    expect(response.headers['cache-control']).toBe('public, max-age=3600');
  });

  it('answers 304 when it matches', async () => {
    const response = await request(createTestApp())
      .get('/api/v1/meta')
      .set('If-None-Match', '"v7.r9"');

    expect(response.status).toBe(304);
  });

  it('works without data', async () => {
    const response = await request(createTestApp({ ready: false })).get('/api/v1/meta');

    expect(response.status).toBe(200);
    expect(response.headers.etag).toBe('"v0.r0"');
  });
});
```

- [ ] **Step 7: OpenAPI**

Em `document.ts`, acrescente:

```ts
const notModified = {
  '304': { description: 'Not Modified: o If-None-Match bate com o ETag atual (dataVersion)' },
};
```

e espalhe `...notModified` nas respostas de `/api/v1/meta` e de todas as rotas de dados. Na `description` do `info`, acrescente ao fim: ` Respostas de dados trazem Cache-Control: public, max-age=3600 e ETag com o dataVersion; If-None-Match igual → 304.`

- [ ] **Step 8: Verificação e commit**

Run: `npm run openapi -w api && npm run api:types -w web && npm run test:integration -w api && npm run lint && npm run typecheck && npm test`
Expected: PASS.

```bash
git add api docs/openapi.yaml web/src/shared/api/schema.d.ts
git commit -m "feat: cache data responses by dataVersion with ETag and 304"
```

---

### Task 5: Sync — órfão que gravou fecha `partial`; full sem unidades não cria run

**Files:**
- Modify: `api/src/repositories/sync-run.repository.ts`, `api/src/jobs/sync/run-sync.ts`, `api/src/jobs/sync/run-units.ts`
- Test: `api/tests/integration/repositories.test.ts`, `api/tests/integration/run-units.test.ts`, `api/tests/integration/full-sync.test.ts`, `api/tests/unit/jobs/sync/run-units.test.ts`

**Interfaces:**
- Produces: `closeOrphanRuns(db: Db): Promise<ClosedOrphan[]>` (substitui `failOrphanRuns`), `ClosedOrphan { id: number; status: 'partial' | 'failed' }`; `SyncResult.runId: number | null`.

- [ ] **Step 1: Testes (falham)**

Em `api/tests/integration/repositories.test.ts` (troque o import `failOrphanRuns` por `closeOrphanRuns`):

```ts
  it('fails an orphan run that finished no unit', async () => {
    const runId = await openRun();
    expect(await closeOrphanRuns(prisma)).toEqual([{ id: runId, status: 'failed' }]);
    const run = await owner.query(
      'SELECT status, error, finished_at IS NOT NULL AS finished FROM sync_run WHERE id = $1',
      [runId],
    );
    expect(run.rows).toEqual([{ status: 'failed', error: INTERRUPTED_ERROR, finished: true }]);
    expect(await closeOrphanRuns(prisma)).toEqual([]);
  });

  it('closes as partial an orphan run that finished a unit (it wrote data)', async () => {
    const runId = await openRun();
    await owner.query(
      "INSERT INTO sync_checkpoint (sync_run_id, unit, status) VALUES ($1, 'u1', 'done'), ($1, 'u2', 'pending')",
      [runId],
    );

    expect(await closeOrphanRuns(prisma)).toEqual([{ id: runId, status: 'partial' }]);
    const run = await owner.query('SELECT status, error FROM sync_run WHERE id = $1', [runId]);
    expect(run.rows).toEqual([{ status: 'partial', error: INTERRUPTED_ERROR }]);
  });
```

(substitui o teste `fails orphan runs with the interrupted message`; no teste `records the calls an orphan run made when failing it`, troque a chamada por `closeOrphanRuns`).

Em `api/tests/integration/run-units.test.ts`, troque o teste `closes as success with nothing to do and makes no call` por:

```ts
  it('opens no run when there is nothing to do', async () => {
    const result = await runUnits(deps(), plan([]));

    expect(result).toMatchObject({ runId: null, status: 'success', callsUsed: 0, unitsRemaining: 0 });
    expect(await rows('SELECT id FROM sync_run')).toEqual([]);
  });
```

Em `api/tests/integration/full-sync.test.ts`, no teste `is idempotent: a second full run calls nothing (RN-09)`, acrescente `runId: null` no `toMatchObject` e, no fim, `expect(await rows('SELECT count(*)::int AS n FROM sync_run')).toEqual([{ n: 1 }]);`.

Em `api/tests/unit/jobs/sync/run-units.test.ts`, remova o teste `is success when there was nothing left to do`.

Run: `npm run test:integration -w api -- repositories run-units full-sync` — Expected: FAIL.

- [ ] **Step 2: `closeOrphanRuns`**

Em `api/src/repositories/sync-run.repository.ts`, substitua `failOrphanRuns` por:

```ts
export interface ClosedOrphan {
  id: number;
  status: 'partial' | 'failed';
}

// Only safe while holding the sync lock: no live process owns a 'running' row then.
// A done checkpoint means the run wrote data (rows and checkpoint share a transaction), so it
// closes as partial and counts for the dataVersion; otherwise it failed.
export async function closeOrphanRuns(db: Db): Promise<ClosedOrphan[]> {
  const orphans = await db.syncRun.findMany({
    where: { status: 'running' },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  const closed: ClosedOrphan[] = [];
  for (const orphan of orphans) {
    const [callsUsed, doneUnits] = await Promise.all([
      db.providerCall.count({ where: { syncRunId: orphan.id } }),
      db.syncCheckpoint.count({ where: { syncRunId: orphan.id, status: 'done' } }),
    ]);
    const status = doneUnits > 0 ? 'partial' : 'failed';
    await db.syncRun.update({
      where: { id: orphan.id },
      data: { status, finishedAt: new Date(), error: INTERRUPTED_ERROR, callsUsed },
    });
    closed.push({ id: orphan.id, status });
  }
  return closed;
}
```

Em `api/src/jobs/sync/run-sync.ts`:

```ts
    const closed = await closeOrphanRuns(deps.prisma);
    if (closed.length > 0) {
      deps.logger.warn({ runs: closed }, 'closed interrupted runs');
```

(o restante do bloco, com o refresh best-effort, fica igual; ajuste o import).

- [ ] **Step 3: Full sem unidades não abre run**

Em `api/src/jobs/sync/run-units.ts`:
- `SyncResult.runId: number | null;`
- Logo depois de `const { units, alreadyDone } = await plan.planUnits(...)`:

```ts
  // Nothing left (a finished full load): no run, so the dataVersion and the ETag stay.
  if (units.length === 0) {
    deps.logger.info({ mode: plan.mode, unitsDone: alreadyDone }, 'nothing to do');
    return {
      runId: null,
      status: 'success',
      callsUsed: 0,
      pendingNames: [],
      unitsPlanned: alreadyDone,
      unitsDone: alreadyDone,
      unitsRemaining: 0,
    };
  }
```

- Em `decideStatus`, remova a linha `if (input.planned === 0) return 'success';` (o `planned` nunca é 0 agora).

- [ ] **Step 4: Verificação e commit**

Run: `npm run test:integration -w api && npm run lint && npm run typecheck && npm test`
Expected: PASS. Se outro teste ainda referir `failOrphanRuns` ou esperar `status: 'failed'` para um órfão com checkpoint `done`, ajuste-o à regra nova (órfão sem `done` continua `failed`).

```bash
git add api
git commit -m "feat: close data-writing orphans as partial and skip empty full runs"
```

---

### Task 6: Documentação da F6a

**Files:**
- Modify: `CLAUDE.md`, `docs/adr/0005-api-layers-and-openapi.md`, `docs/adr/0004-sync-job.md`

- [ ] **Step 1: CLAUDE.md**

- Em "Estado atual", depois da linha da F5, acrescente:

```markdown
- F6a API do Nível 2 concluída em 2026-10-23 (PR #8): cobertura só com datas completas (as duas métricas no próprio N; `from` = primeira data completa; `?date=` e séries só aceitam datas completas), `/rankings` (limit 1..50, padrão 10) com a ordem no SQL (`row_number()` e collation `pt-BR-x-icu`, também em `/countries` e `/countries/:code`), `/global/timeseries` e `/countries/:code/timeseries` (dia, semana ISO e mês pela RN-11), cache por `dataVersion` (`ETag "v{n}"`, 304 antes de validar a query, `/meta` com `"v{n}.r{último run}"`, erros e `/health`/`/ready` com `no-store`, memo de 5 s do `dataVersion`), run órfão que gravou fecha `partial` e full sem unidades não cria run. A F6b (front com shadcn/ui) vem a seguir.
```

- No item "Adiado com fase-alvo": remova os trechos já resolvidos — "posição via `rank()` no SQL em vez de ordenar ~200 linhas em memória", "memo curto do `dataVersion`", "um só `ORDER BY` na lista de países", "run órfão que gravou fecha como `failed` … (F6, junto com o ETag)", "full sem unidades restantes ainda cria um run `success` e troca o ETag (F6)" e "enquanto o full não termina, datas históricas mostram um global com só parte dos países … (F7)". Mantenha "data validada pelo estado em memória" (ainda é uma consulta por requisição) com fase-alvo F8. Acrescente: "banco gerenciado precisa da collation ICU `pt-BR-x-icu` (F9)".
- RN-06: acrescente ao fim "Data completa = as duas métricas atingem o próprio N; a cobertura vai da primeira à última data completa, e `?date=` e as séries só aceitam datas completas."
- Em "API REST → Convenções", troque a linha do cache por: "`Cache-Control: public, max-age=3600` + `ETag` com `dataVersion` (304 quando igual, antes de validar a query); `/meta` usa `dataVersion` + id do último run; erros, `/health` e `/ready` com `no-store`."
- Em "Banco (PostgreSQL)", troque "O `id` do último `sync_run` com status `success` ou `partial` é o `dataVersion` (todo run que grava dados muda o ETag)." por "O `id` do último `sync_run` com status `success` ou `partial` é o `dataVersion` (todo run que grava dados muda o ETag, inclusive um órfão recuperado que gravou; um full sem unidades restantes não cria run)."

- [ ] **Step 2: ADRs**

Acrescente ao fim de `docs/adr/0005-api-layers-and-openapi.md`:

```markdown
## Atualização da F6a (2026-10-23)

- Cache por `dataVersion`: um middleware responde 304 antes de validar a query, porque a mesma URL na mesma versão sempre devolve o mesmo corpo. O ETag do Express (hash do corpo) foi desligado. O `/meta` tem ETag próprio (`dataVersion` + id do último run), porque o `lastSync` muda até num run `failed`. Erros nunca são cacheados (`no-store`).
- O `dataVersion` é lido no máximo a cada 5 s por instância; depois de um sync, a API pode servir a versão anterior por até 5 s.
- Ranking e ordem alfabética no SQL (`row_number()` + `COLLATE "pt-BR-x-icu"`), igual ao `localeCompare('pt-BR')` do front. O banco gerenciado precisa ter ICU.
- Datas completas (RN-06) num fragmento SQL único (`repositories/complete-dates.ts`), usado pela cobertura, pela validação de `?date=` e pelas séries.
```

Acrescente ao fim de `docs/adr/0004-sync-job.md`:

```markdown
## Atualização da F6a (2026-10-23)

- Run órfão com algum checkpoint `done` fecha `partial` (gravou dados, então conta no `dataVersion`); sem nenhum, `failed`.
- `--mode=full` sem unidades restantes não abre run: registra "nothing to do" e sai com 0, sem trocar o ETag.
```

- [ ] **Step 3: Verificação e commit**

Run: `npm run lint && npm run typecheck && npm test`
Expected: PASS.

```bash
git add CLAUDE.md docs/adr/0004-sync-job.md docs/adr/0005-api-layers-and-openapi.md
git commit -m "docs: record phase 6a in CLAUDE.md and the ADRs"
```
