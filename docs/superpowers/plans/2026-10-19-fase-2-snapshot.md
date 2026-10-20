# Fase 2 — Snapshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Carregar a data de referência (`2023-03-09`) da API Ninjas com 2 chamadas, via `npm run sync -w api -- --mode=snapshot`, com orçamento, checkpoints, lock e soma de regiões.

**Architecture:** Provider puro (HTTP + zod) recebe um `fetch` injetado. O job injeta o `CallGate` (orçamento, timeout, retentativas, `provider_call`), agrega com uma função pura (aliases + RN-02) e grava pelos repositórios (único lugar com SQL/Prisma). `run-sync` segura um advisory lock e recupera runs órfãos.

**Tech Stack:** Node 24, TypeScript ~6.0.3 (strict, NodeNext, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUncheckedIndexedAccess`), zod 4.6, pino 10, Prisma 7.10 + `@prisma/adapter-pg`, pg 8.23, Vitest 5.

**Spec:** `docs/superpowers/specs/2026-10-19-fase-2-snapshot-design.md`

## Global Constraints

- **NUNCA rode `npm run sync` com `--mode=snapshot` nem chame `api.api-ninjas.com`.** O `api/.env` local tem uma chave real e cada chamada gasta cota. Testes só usam `fetch` injetado e as fixtures de `api/tests/fixtures/api-ninjas`.
- Nunca leia, imprima ou commite `.env` (nem `api/.env`). Só o `.env.example` é editado, com valores falsos.
- Data final da série (D-02): `'2023-03-09'`. Unidades do snapshot: `snapshot:cases:2023-03-09` e `snapshot:deaths:2023-03-09`.
- Orçamento: `SYNC_CALLS_PER_HOUR` padrão `90`, `SYNC_CALLS_PER_MONTH` padrão `3000`, mês = calendário UTC; o valor igual ao limite já conta como esgotado.
- `CallGate`: timeout `10_000` ms; até `3` tentativas em 429, 5xx, timeout e erro de rede; esperas `1_000` e `2_000` ms.
- Lock: `pg_try_advisory_lock(1835102320)` (`0x6d617070`, `'mapp'`). Erro de run órfão: `'interrompido: o processo anterior terminou sem fechar o run'`.
- Status do run: `failed` = 401/403 ou nenhuma unidade gravada; `partial` = alguma unidade com erro ou algum alias `pending`; `success` = o resto.
- Código, nomes de arquivos, tabelas e rotas em inglês; documentação em pt-BR. Arquivos `kebab-case`.
- TS sem `any`; sem parameter properties nem `enum` (`erasableSyntaxOnly`); imports de tipo com `import type`; imports relativos com `.js`.
- Prettier: `singleQuote`, `printWidth: 100`. Antes de commitar: `./node_modules/.bin/prettier --write <arquivos>` (na raiz).
- Um commit por tarefa, Conventional Commits. Branch: `feat/snapshot` (já existe; as fixtures e o spec já estão commitados).
- Testes de integração: `docker compose up -d` (container `mapp-db-1`, porta 5435) e `npm run test:integration -w api`. Nunca `docker compose down -v`.
- Verificação de cada tarefa (na raiz): `npm run lint && npm run typecheck && npm test`. Se a saída vier resumida pelo RTK, use `rtk proxy <comando>`.

---

### Task 1: Bloqueio de rede nos testes, env do job e redact de chaves

**Files:**
- Create: `api/tests/setup/no-network.ts`
- Create: `api/tests/unit/setup/no-network.test.ts`
- Create: `api/src/config/sync-env.ts`
- Create: `api/tests/unit/config/sync-env.test.ts`
- Create: `api/tests/unit/lib/logger.test.ts`
- Modify: `api/src/config/env.ts` (exportar `logLevels` e `emptyAsUndefined`)
- Modify: `api/src/config/db-env.ts` (exportar `postgresUrl`)
- Modify: `api/src/lib/logger.ts`
- Modify: `api/vitest.config.ts`, `api/vitest.integration.config.ts`
- Modify: `api/.env.example`

**Interfaces:**
- Produces: `loadSyncEnv(source?: NodeJS.ProcessEnv): SyncEnv` com `{ DATABASE_URL_SYNC: string; DATA_PROVIDER: 'api_ninjas' | 'jhu_csv' | 'apify'; API_NINJAS_KEY: string | undefined; SYNC_CALLS_PER_HOUR: number; SYNC_CALLS_PER_MONTH: number; LOG_LEVEL: LogLevel }`; `createLogger(level: LogLevel, destination?: DestinationStream): Logger`.

- [ ] **Step 1: Write the failing tests**

`api/tests/unit/setup/no-network.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

describe('test network guard', () => {
  it('blocks the global fetch', async () => {
    await expect(fetch('https://example.com')).rejects.toThrow(/Network is blocked in tests/);
  });
});
```

`api/tests/unit/config/sync-env.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadSyncEnv } from '../../../src/config/sync-env.js';

const DATABASE_URL_SYNC = 'postgresql://mapp:mapp@127.0.0.1:5435/mapp';

describe('loadSyncEnv', () => {
  it('applies the defaults', () => {
    expect(loadSyncEnv({ DATABASE_URL_SYNC, API_NINJAS_KEY: 'test-key' })).toEqual({
      DATABASE_URL_SYNC,
      DATA_PROVIDER: 'api_ninjas',
      API_NINJAS_KEY: 'test-key',
      SYNC_CALLS_PER_HOUR: 90,
      SYNC_CALLS_PER_MONTH: 3000,
      LOG_LEVEL: 'info',
    });
  });

  it('requires API_NINJAS_KEY for the api_ninjas provider', () => {
    expect(() => loadSyncEnv({ DATABASE_URL_SYNC })).toThrow(/API_NINJAS_KEY/);
  });

  it('treats an empty key as missing', () => {
    expect(() => loadSyncEnv({ DATABASE_URL_SYNC, API_NINJAS_KEY: '' })).toThrow(/API_NINJAS_KEY/);
  });

  it('does not require the key for other providers', () => {
    expect(loadSyncEnv({ DATABASE_URL_SYNC, DATA_PROVIDER: 'jhu_csv' }).DATA_PROVIDER).toBe(
      'jhu_csv',
    );
  });

  it('rejects an unknown provider', () => {
    expect(() =>
      loadSyncEnv({ DATABASE_URL_SYNC, DATA_PROVIDER: 'csv', API_NINJAS_KEY: 'test-key' }),
    ).toThrow(/DATA_PROVIDER/);
  });

  it('parses custom call limits', () => {
    const env = loadSyncEnv({
      DATABASE_URL_SYNC,
      API_NINJAS_KEY: 'test-key',
      SYNC_CALLS_PER_HOUR: '10',
      SYNC_CALLS_PER_MONTH: '200',
    });
    expect([env.SYNC_CALLS_PER_HOUR, env.SYNC_CALLS_PER_MONTH]).toEqual([10, 200]);
  });

  it('rejects a zero or non-numeric limit', () => {
    const base = { DATABASE_URL_SYNC, API_NINJAS_KEY: 'test-key' };
    expect(() => loadSyncEnv({ ...base, SYNC_CALLS_PER_HOUR: '0' })).toThrow(
      /SYNC_CALLS_PER_HOUR/,
    );
    expect(() => loadSyncEnv({ ...base, SYNC_CALLS_PER_MONTH: 'many' })).toThrow(
      /SYNC_CALLS_PER_MONTH/,
    );
  });

  it('requires a postgres DATABASE_URL_SYNC', () => {
    expect(() => loadSyncEnv({ API_NINJAS_KEY: 'test-key' })).toThrow(/DATABASE_URL_SYNC/);
  });

  it('never echoes the key in validation errors', () => {
    let message = '';
    try {
      loadSyncEnv({ DATABASE_URL_SYNC: 'mysql://x', API_NINJAS_KEY: 'super-secret-key' });
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }
    expect(message).toMatch(/DATABASE_URL_SYNC/);
    expect(message).not.toContain('super-secret-key');
  });
});
```

`api/tests/unit/lib/logger.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createLogger } from '../../../src/lib/logger.js';

describe('createLogger', () => {
  it('redacts api keys wherever they appear', () => {
    const lines: string[] = [];
    const logger = createLogger('info', {
      write: (line: string) => {
        lines.push(line);
      },
    });
    logger.info(
      {
        apiKey: 'secret-1',
        provider: { apiKey: 'secret-2' },
        headers: { 'x-api-key': 'secret-3' },
        API_NINJAS_KEY: 'secret-4',
      },
      'call',
    );
    const output = lines.join('');
    expect(output).not.toMatch(/secret-/);
    expect(output).toContain('[Redacted]');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -w api`
Expected: FAIL. O `no-network` não está ativo (o `fetch` tenta a rede ou falha com outra mensagem), e `sync-env.js` não existe. O teste do logger falha porque `createLogger` ignora o destino.

- [ ] **Step 3: Implement**

`api/tests/setup/no-network.ts`:

```ts
// Tests never touch the network: code that needs HTTP receives a fake fetch.
globalThis.fetch = () => Promise.reject(new Error('Network is blocked in tests: inject a fake fetch'));
```

Em `api/vitest.config.ts` e `api/vitest.integration.config.ts`, acrescente dentro de `test`:

```ts
    setupFiles: ['tests/setup/no-network.ts'],
```

Em `api/src/config/env.ts`, troque as duas declarações por versões exportadas (o resto do arquivo fica igual):

```ts
export const logLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

export const emptyAsUndefined = (value: unknown): unknown => (value === '' ? undefined : value);
```

Em `api/src/config/db-env.ts`, troque `const postgresUrl = z` por `export const postgresUrl = z`.

`api/src/config/sync-env.ts`:

```ts
import { z } from 'zod';
import { postgresUrl } from './db-env.js';
import { emptyAsUndefined, logLevels } from './env.js';

const callLimit = (fallback: number) =>
  z.preprocess(
    emptyAsUndefined,
    z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.number().int().min(1))
      .default(fallback),
  );

const syncEnvSchema = z
  .object({
    DATABASE_URL_SYNC: postgresUrl,
    DATA_PROVIDER: z.preprocess(
      emptyAsUndefined,
      z.enum(['api_ninjas', 'jhu_csv', 'apify']).default('api_ninjas'),
    ),
    API_NINJAS_KEY: z.preprocess(emptyAsUndefined, z.string().optional()),
    SYNC_CALLS_PER_HOUR: callLimit(90),
    SYNC_CALLS_PER_MONTH: callLimit(3000),
    LOG_LEVEL: z.preprocess(emptyAsUndefined, z.enum(logLevels).default('info')),
  })
  .refine((env) => env.DATA_PROVIDER !== 'api_ninjas' || env.API_NINJAS_KEY !== undefined, {
    message: 'API_NINJAS_KEY is required when DATA_PROVIDER=api_ninjas',
    path: ['API_NINJAS_KEY'],
  });

export type SyncEnv = z.infer<typeof syncEnvSchema>;

export function loadSyncEnv(source: NodeJS.ProcessEnv = process.env): SyncEnv {
  const result = syncEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid sync environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
```

`api/src/lib/logger.ts`:

```ts
import { pino, type DestinationStream, type Logger } from 'pino';
import type { LogLevel } from '../config/env.js';

const REDACT_PATHS = [
  'apiKey',
  '*.apiKey',
  'API_NINJAS_KEY',
  '*.API_NINJAS_KEY',
  'headers["x-api-key"]',
  '*.headers["x-api-key"]',
];

export function createLogger(level: LogLevel, destination?: DestinationStream): Logger {
  const options = { level, redact: REDACT_PATHS };
  return destination ? pino(options, destination) : pino(options);
}
```

Em `api/.env.example`, acrescente no fim:

```dotenv

# Job de sincronização (npm run sync -w api). Chave falsa: a real fica só no api/.env.
DATA_PROVIDER=api_ninjas
API_NINJAS_KEY=fake-api-ninjas-key
SYNC_CALLS_PER_HOUR=90
SYNC_CALLS_PER_MONTH=3000
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w api`
Expected: PASS, todos os testes da api (os 46 anteriores mais os novos).

- [ ] **Step 5: Verify and commit**

Run (na raiz): `./node_modules/.bin/prettier --write api && npm run lint && npm run typecheck && npm test`
Expected: tudo verde.

```bash
git add api/tests/setup api/tests/unit/setup api/tests/unit/config/sync-env.test.ts api/tests/unit/lib api/src/config api/src/lib/logger.ts api/vitest.config.ts api/vitest.integration.config.ts api/.env.example
git commit -m "feat: add sync env, key redaction and a network guard for tests"
```

---

### Task 2: Curadoria de aliases em arquivo versionado

**Files:**
- Create: `api/prisma/seed/aliases.json` (gerado uma vez a partir do `countries.json` atual)
- Create: `api/prisma/seed/aliases.ts`
- Create: `api/tests/unit/seed/aliases-json.test.ts`
- Create: `api/tests/integration/seed-aliases.test.ts`
- Modify: `api/prisma/seed/reference.ts` (remover `sourceName` de `CountrySeed`)
- Modify: `api/prisma/seed/countries.json` (regerado, sem `sourceName`)
- Modify: `api/tests/unit/seed/reference.test.ts`
- Modify: `api/prisma/seed/seed.ts`
- Modify: `api/prisma/seed/README.md`

**Interfaces:**
- Produces: `AliasSeed = { sourceName: string; countryCode: string; status: 'mapped' } | { sourceName: string; countryCode: null; status: 'ignored' }`; `parseAliasSeeds(json: unknown): AliasSeed[]`; `loadAliasSeeds(): AliasSeed[]`. Banco: depois do `db:seed`, os 202 aliases do arquivo ficam `mapped`, e os aliases fora do arquivo não são alterados.

- [ ] **Step 1: Generate `aliases.json` from the current `countries.json`**

Run (na raiz, **antes** de mexer no `reference.ts`):

```bash
node -e '
const fs = require("fs");
const countries = JSON.parse(fs.readFileSync("api/prisma/seed/countries.json", "utf8"));
const aliases = countries
  .map((c) => ({ sourceName: c.sourceName, countryCode: c.code, status: "mapped" }))
  .sort((a, b) => (a.sourceName < b.sourceName ? -1 : a.sourceName > b.sourceName ? 1 : 0));
fs.writeFileSync("api/prisma/seed/aliases.json", JSON.stringify(aliases, null, 2) + "\n");
console.log(aliases.length);
'
```

Expected: imprime `202`. Confira `grep -c sourceName api/prisma/seed/aliases.json` → `202`.

- [ ] **Step 2: Write the failing unit test**

`api/tests/unit/seed/aliases-json.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadAliasSeeds, parseAliasSeeds } from '../../../prisma/seed/aliases.js';
import type { CountrySeed } from '../../../prisma/seed/reference.js';

const aliases = loadAliasSeeds();
const countries = JSON.parse(
  readFileSync(new URL('../../../prisma/seed/countries.json', import.meta.url), 'utf8'),
) as CountrySeed[];
const sourceNames = JSON.parse(
  readFileSync(
    new URL('../../fixtures/api-ninjas/names-2023-03-09.json', import.meta.url),
    'utf8',
  ),
) as { country: string; region: string }[];

describe('versioned aliases.json', () => {
  it('has 202 aliases with unique source names', () => {
    expect(aliases).toHaveLength(202);
    expect(new Set(aliases.map((alias) => alias.sourceName)).size).toBe(202);
  });

  it('points every mapped alias at a seeded country', () => {
    const codes = new Set(countries.map((country) => country.code));
    const dangling = aliases.filter(
      (alias) => alias.status === 'mapped' && !codes.has(alias.countryCode),
    );
    expect(dangling).toEqual([]);
  });

  it('maps every country name the source returned on 2023-03-09', () => {
    const mapped = new Set(
      aliases.filter((alias) => alias.status === 'mapped').map((alias) => alias.sourceName),
    );
    const missing = [...new Set(sourceNames.map((row) => row.country))].filter(
      (name) => !mapped.has(name),
    );
    expect(missing).toEqual([]);
  });
});

describe('parseAliasSeeds', () => {
  it('rejects duplicated source names', () => {
    const alias = { sourceName: 'Brazil', countryCode: 'BRA', status: 'mapped' };
    expect(() => parseAliasSeeds([alias, alias])).toThrow(/duplicate sourceName/);
  });

  it('rejects a mapped alias without a country code', () => {
    expect(() =>
      parseAliasSeeds([{ sourceName: 'Brazil', countryCode: null, status: 'mapped' }]),
    ).toThrow(/Invalid aliases.json/);
  });

  it('accepts an ignored alias without a country code', () => {
    expect(
      parseAliasSeeds([{ sourceName: 'Ghost Ship', countryCode: null, status: 'ignored' }]),
    ).toEqual([{ sourceName: 'Ghost Ship', countryCode: null, status: 'ignored' }]);
  });
});
```

Run: `npm test -w api -- aliases-json`
Expected: FAIL, `Cannot find module '../../../prisma/seed/aliases.js'`.

- [ ] **Step 3: Implement `aliases.ts`**

`api/prisma/seed/aliases.ts`:

```ts
import { readFileSync } from 'node:fs';
import { z } from 'zod';

const aliasSeedSchema = z.discriminatedUnion('status', [
  z.object({
    sourceName: z.string().min(1),
    countryCode: z.string().regex(/^[A-Z]{3}$/),
    status: z.literal('mapped'),
  }),
  z.object({
    sourceName: z.string().min(1),
    countryCode: z.null(),
    status: z.literal('ignored'),
  }),
]);

const aliasSeedsSchema = z
  .array(aliasSeedSchema)
  .refine((aliases) => new Set(aliases.map((alias) => alias.sourceName)).size === aliases.length, {
    message: 'duplicate sourceName',
  });

export type AliasSeed = z.infer<typeof aliasSeedSchema>;

export function parseAliasSeeds(json: unknown): AliasSeed[] {
  const result = aliasSeedsSchema.safeParse(json);
  if (!result.success) {
    throw new Error(`Invalid aliases.json:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export function loadAliasSeeds(): AliasSeed[] {
  const text = readFileSync(new URL('./aliases.json', import.meta.url), 'utf8');
  return parseAliasSeeds(JSON.parse(text));
}
```

Run: `npm test -w api -- aliases-json`
Expected: PASS (6 testes).

- [ ] **Step 4: Remove `sourceName` from `CountrySeed` and regenerate `countries.json`**

Em `api/prisma/seed/reference.ts`:
- tire a linha `sourceName: string;` da interface `CountrySeed`;
- nos dois `return` de `toSeed`, tire a linha `sourceName,` final. A variável local `sourceName` continua: ela alimenta as mensagens de erro e a busca em `NON_GEOGRAPHIC`.

Em `api/tests/unit/seed/reference.test.ts`:
- em `'maps a country-level row'`, tire `sourceName: 'Brazil',` do objeto esperado;
- troque o teste `'keeps quoted source names'` por:

```ts
  it('parses quoted source names', () => {
    const [korea] = buildCountrySeeds(csv(KOREA_SOUTH));
    expect(korea?.code).toBe('KOR');
    expect(korea?.name).toBe('Coreia do Sul');
  });
```

- em `'maps the four non-geographic entities...'`, tire as 4 linhas `sourceName: '...',` dos objetos esperados.

Regere o arquivo (o CSV da JHU já está baixado e conferido no scratchpad da sessão):

```bash
npm run seed:build -w api -- /tmp/claude-1000/-home-marcos-Downloads-Portifolio-Mapa/29792708-b0ba-4a01-9056-4f5188784d29/scratchpad/ref-jhu/UID_ISO_FIPS_LookUp_Table.csv
```

Expected: `wrote 202 entries`. Confira que o diff só remove `sourceName` e a vírgula da linha anterior:

```bash
git diff api/prisma/seed/countries.json | grep '^[-+] ' | grep -v '"sourceName"' | grep -v '"population"'
```

Expected: nenhuma linha. Se o CSV não existir mais, gere o mesmo resultado sem ele:

```bash
node -e '
const fs = require("fs");
const p = "api/prisma/seed/countries.json";
const countries = JSON.parse(fs.readFileSync(p, "utf8")).map(({ sourceName, ...rest }) => rest);
fs.writeFileSync(p, JSON.stringify(countries, null, 2) + "\n");
'
```

- [ ] **Step 5: Make the seed apply `aliases.json`**

`api/prisma/seed/seed.ts`, versão completa:

```ts
import { readFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadDbEnv } from '../../src/config/db-env.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { createLogger } from '../../src/lib/logger.js';
import { loadAliasSeeds } from './aliases.js';
import type { CountrySeed } from './reference.js';

const API_NINJAS_SOURCE = {
  code: 'api_ninjas',
  name: 'API Ninjas — COVID-19',
  url: 'https://api-ninjas.com/api/covid19',
  license:
    'Termos de uso da API Ninjas (plano gratuito: exige atribuição; não permite cache nem armazenamento)',
  attribution: 'Dados: API Ninjas (fonte original: JHU CSSE)',
};

const env = loadDbEnv();
const logger = createLogger('info');
const countries = JSON.parse(
  readFileSync(new URL('./countries.json', import.meta.url), 'utf8'),
) as CountrySeed[];
const aliases = loadAliasSeeds();

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL_SYNC }),
});

try {
  await prisma.$transaction(
    async (tx) => {
      const source = await tx.dataSource.upsert({
        where: { code: API_NINJAS_SOURCE.code },
        create: API_NINJAS_SOURCE,
        update: API_NINJAS_SOURCE,
      });

      for (const country of countries) {
        const data = {
          name: country.name,
          kind: country.kind,
          lat: country.lat,
          lng: country.lng,
          population: country.population === null ? null : BigInt(country.population),
        };
        await tx.country.upsert({
          where: { code: country.code },
          create: { code: country.code, ...data },
          update: data,
        });
      }

      // Only the curated file is applied; aliases outside it (e.g. pending ones) stay untouched.
      for (const alias of aliases) {
        await tx.countryAlias.upsert({
          where: { sourceId_sourceName: { sourceId: source.id, sourceName: alias.sourceName } },
          create: { sourceId: source.id, ...alias },
          update: { countryCode: alias.countryCode, status: alias.status },
        });
      }
    },
    { timeout: 60_000 },
  );
  logger.info(
    { countries: countries.length, aliases: aliases.length, source: API_NINJAS_SOURCE.code },
    'seed complete',
  );
} finally {
  await prisma.$disconnect();
}
```

Em `api/prisma/seed/README.md`, troque a frase `Os nomes \`sourceName\` são os da JHU e servem de aliases provisórios da \`api_ninjas\` até a F2 confirmar com fixtures.` por:

```markdown
Os aliases da `api_ninjas` (nome da fonte → ISO3) ficam em `aliases.json`, curado à mão (ADR 0004). Os 202 nomes vieram da JHU e foram confirmados com a chamada real de 2026-10-19. O `db:seed` aplica só o arquivo e não altera os aliases que não estão nele, como os `pending` criados pelo sync. Para curar um alias, edite o arquivo e rode `npm run db:seed -w api`.
```

- [ ] **Step 6: Write the integration test**

`api/tests/integration/seed-aliases.test.ts`:

```ts
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
```

- [ ] **Step 7: Run all tests**

Run: `npm test -w api` → PASS.
Run: `docker compose up -d --wait && npm run test:integration -w api` → PASS (os 9 anteriores mais os 2 novos).

- [ ] **Step 8: Verify and commit**

Run (na raiz): `./node_modules/.bin/prettier --write api/prisma api/tests && npm run lint && npm run typecheck && npm test`

```bash
git add api/prisma/seed api/tests/unit/seed api/tests/integration/seed-aliases.test.ts
git commit -m "feat: curate api ninjas aliases in a versioned file"
```

---

### Task 3: Provider da API Ninjas

**Files:**
- Create: `api/src/providers/covid-provider.ts`
- Create: `api/src/providers/provider-errors.ts`
- Create: `api/src/providers/api-ninjas/api-ninjas.schemas.ts`
- Create: `api/src/providers/api-ninjas/api-ninjas.provider.ts`
- Create: `api/src/providers/create-provider.ts`
- Create: `api/tests/helpers/api-ninjas-fixtures.ts`
- Create: `api/tests/unit/providers/api-ninjas.provider.test.ts`
- Create: `api/tests/unit/providers/create-provider.test.ts`

**Interfaces:**
- Consumes: `SyncEnv` (Task 1).
- Produces:
  - `type Metric = 'cases' | 'deaths'`
  - `interface SourceRow { country: string; region: string; total: number; new: number }`
  - `type FetchLike = (url: string, init: { headers: Record<string, string> }) => Promise<Response>`
  - `interface CovidProvider { readonly sourceCode: string; readonly finalDate: string; fetchDay(date: string, metric: Metric): Promise<SourceRow[]> }`
  - Erros: `ProviderAuthError` (`status`), `ProviderHttpError` (`status`), `ProviderPayloadError`, `ProviderNetworkError` (`kind: 'timeout' | 'network_error'`).
  - `daySchemas: Record<Metric, z.ZodType<SourceRow[]>>`
  - `API_NINJAS_FINAL_DATE = '2023-03-09'`; `createApiNinjasProvider({ apiKey, fetch }): CovidProvider`.
  - `createProvider(env: Pick<SyncEnv, 'DATA_PROVIDER' | 'API_NINJAS_KEY'>, fetch: FetchLike): CovidProvider`.
  - Helpers de teste: `fixtureText(name): string` e `fixtureDayRows(metric): SourceRow[]`.

- [ ] **Step 1: Write the types, errors and the fixture helper**

`api/src/providers/covid-provider.ts`:

```ts
export type Metric = 'cases' | 'deaths';

export interface SourceRow {
  country: string;
  region: string;
  total: number;
  new: number;
}

export type FetchLike = (
  url: string,
  init: { headers: Record<string, string> },
) => Promise<Response>;

export interface CovidProvider {
  readonly sourceCode: string;
  readonly finalDate: string;
  fetchDay(date: string, metric: Metric): Promise<SourceRow[]>;
}
```

`api/src/providers/provider-errors.ts`:

```ts
export class ProviderAuthError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Provider rejected the credentials (HTTP ${status})`);
    this.name = 'ProviderAuthError';
    this.status = status;
  }
}

export class ProviderHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Provider answered HTTP ${status}`);
    this.name = 'ProviderHttpError';
    this.status = status;
  }
}

export class ProviderPayloadError extends Error {
  constructor(detail: string) {
    super(`Unexpected provider payload: ${detail}`);
    this.name = 'ProviderPayloadError';
  }
}

export class ProviderNetworkError extends Error {
  readonly kind: 'timeout' | 'network_error';

  constructor(kind: 'timeout' | 'network_error', options?: ErrorOptions) {
    super(kind === 'timeout' ? 'Provider request timed out' : 'Provider request failed', options);
    this.name = 'ProviderNetworkError';
    this.kind = kind;
  }
}
```

`api/tests/helpers/api-ninjas-fixtures.ts`:

```ts
import { readFileSync } from 'node:fs';
import { daySchemas } from '../../src/providers/api-ninjas/api-ninjas.schemas.js';
import type { Metric, SourceRow } from '../../src/providers/covid-provider.js';

export function fixtureText(name: string): string {
  return readFileSync(new URL(`../fixtures/api-ninjas/${name}`, import.meta.url), 'utf8');
}

export function fixtureDayRows(metric: Metric): SourceRow[] {
  return daySchemas[metric].parse(JSON.parse(fixtureText(`date-2023-03-09-${metric}.json`)));
}
```

- [ ] **Step 2: Write the failing tests**

`api/tests/unit/providers/api-ninjas.provider.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  API_NINJAS_FINAL_DATE,
  createApiNinjasProvider,
} from '../../../src/providers/api-ninjas/api-ninjas.provider.js';
import type { FetchLike } from '../../../src/providers/covid-provider.js';
import {
  ProviderAuthError,
  ProviderHttpError,
  ProviderPayloadError,
} from '../../../src/providers/provider-errors.js';
import { fixtureText } from '../../helpers/api-ninjas-fixtures.js';

function fakeFetch(status: number, body: string) {
  const requests: { url: string; headers: Record<string, string> }[] = [];
  const fetch: FetchLike = (url, init) => {
    requests.push({ url, headers: init.headers });
    return Promise.resolve(new Response(body, { status }));
  };
  return { requests, fetch };
}

function provider(status: number, body: string) {
  const fake = fakeFetch(status, body);
  return { ...fake, provider: createApiNinjasProvider({ apiKey: 'test-key', fetch: fake.fetch }) };
}

describe('createApiNinjasProvider', () => {
  it('exposes the final date of the series (D-02)', () => {
    const { provider: source } = provider(200, '[]');
    expect(API_NINJAS_FINAL_DATE).toBe('2023-03-09');
    expect(source.finalDate).toBe('2023-03-09');
    expect(source.sourceCode).toBe('api_ninjas');
  });

  it('asks for one day of one metric with the key in the header', async () => {
    const { requests, provider: source } = provider(
      200,
      fixtureText('date-2023-03-09-deaths.json'),
    );
    await source.fetchDay('2023-03-09', 'deaths');
    expect(requests).toEqual([
      {
        url: 'https://api.api-ninjas.com/v1/covid19?date=2023-03-09&type=deaths',
        headers: { 'X-Api-Key': 'test-key' },
      },
    ]);
  });

  it('parses the cases fixture into source rows', async () => {
    const { provider: source } = provider(200, fixtureText('date-2023-03-09-cases.json'));
    const rows = await source.fetchDay('2023-03-09', 'cases');
    expect(rows).toHaveLength(13);
    expect(rows[0]).toEqual({
      country: 'Australia',
      region: 'Australian Capital Territory',
      total: 232974,
      new: 355,
    });
    expect(rows.find((row) => row.country === 'Brazil')).toEqual({
      country: 'Brazil',
      region: '',
      total: 37076053,
      new: 0,
    });
  });

  it('parses the deaths fixture into source rows', async () => {
    const { provider: source } = provider(200, fixtureText('date-2023-03-09-deaths.json'));
    const rows = await source.fetchDay('2023-03-09', 'deaths');
    expect(rows.find((row) => row.country === 'Brazil')).toEqual({
      country: 'Brazil',
      region: '',
      total: 699276,
      new: 0,
    });
  });

  it.each([401, 403])('throws ProviderAuthError on HTTP %i', async (status) => {
    const { provider: source } = provider(status, '{"error":"Invalid API Key."}');
    await expect(source.fetchDay('2023-03-09', 'cases')).rejects.toBeInstanceOf(
      ProviderAuthError,
    );
  });

  it.each([429, 500])('throws ProviderHttpError on HTTP %i', async (status) => {
    const { provider: source } = provider(status, '');
    await expect(source.fetchDay('2023-03-09', 'cases')).rejects.toMatchObject({
      name: 'ProviderHttpError',
      status,
    });
    await expect(source.fetchDay('2023-03-09', 'cases')).rejects.toBeInstanceOf(
      ProviderHttpError,
    );
  });

  it.each([
    ['invalid JSON', 'not json'],
    ['a negative total', '[{"country":"Brazil","region":"","cases":{"total":-1,"new":0}}]'],
    ['a non-integer value', '[{"country":"Brazil","region":"","cases":{"total":1.5,"new":0}}]'],
    ['an empty list', '[]'],
    ['the wrong metric key', '[{"country":"Brazil","region":"","deaths":{"total":1,"new":0}}]'],
  ])('throws ProviderPayloadError on %s', async (_label, body) => {
    const { provider: source } = provider(200, body);
    await expect(source.fetchDay('2023-03-09', 'cases')).rejects.toBeInstanceOf(
      ProviderPayloadError,
    );
  });
});
```

`api/tests/unit/providers/create-provider.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { FetchLike } from '../../../src/providers/covid-provider.js';
import { createProvider } from '../../../src/providers/create-provider.js';

const fetch: FetchLike = () => Promise.reject(new Error('not used'));

describe('createProvider', () => {
  it('builds the api_ninjas provider', () => {
    expect(
      createProvider({ DATA_PROVIDER: 'api_ninjas', API_NINJAS_KEY: 'test-key' }, fetch)
        .sourceCode,
    ).toBe('api_ninjas');
  });

  it('requires the key for api_ninjas', () => {
    expect(() =>
      createProvider({ DATA_PROVIDER: 'api_ninjas', API_NINJAS_KEY: undefined }, fetch),
    ).toThrow(/API_NINJAS_KEY/);
  });

  it.each(['jhu_csv', 'apify'] as const)('reports %s as not implemented', (provider) => {
    expect(() =>
      createProvider({ DATA_PROVIDER: provider, API_NINJAS_KEY: undefined }, fetch),
    ).toThrow(/not implemented/);
  });
});
```

Run: `npm test -w api -- providers`
Expected: FAIL, os módulos `api-ninjas.provider.js`, `api-ninjas.schemas.js` e `create-provider.js` não existem.

- [ ] **Step 3: Implement**

`api/src/providers/api-ninjas/api-ninjas.schemas.ts`:

```ts
import { z } from 'zod';
import type { Metric, SourceRow } from '../covid-provider.js';

const values = z.object({ total: z.int().min(0), new: z.int() });
const location = { country: z.string().min(1), region: z.string() };

export const daySchemas: Record<Metric, z.ZodType<SourceRow[]>> = {
  cases: z
    .array(
      z
        .object({ ...location, cases: values })
        .transform(({ country, region, cases }) => ({ country, region, ...cases })),
    )
    .min(1),
  deaths: z
    .array(
      z
        .object({ ...location, deaths: values })
        .transform(({ country, region, deaths }) => ({ country, region, ...deaths })),
    )
    .min(1),
};
```

`api/src/providers/api-ninjas/api-ninjas.provider.ts`:

```ts
import { z } from 'zod';
import type { CovidProvider, FetchLike } from '../covid-provider.js';
import { ProviderAuthError, ProviderHttpError, ProviderPayloadError } from '../provider-errors.js';
import { daySchemas } from './api-ninjas.schemas.js';

const BASE_URL = 'https://api.api-ninjas.com/v1/covid19';
const MAX_DETAIL_LENGTH = 500;

// D-02: the API Ninjas series ends on this date (confirmed by a real call on 2026-10-19).
export const API_NINJAS_FINAL_DATE = '2023-03-09';

export function createApiNinjasProvider(options: {
  apiKey: string;
  fetch: FetchLike;
}): CovidProvider {
  return {
    sourceCode: 'api_ninjas',
    finalDate: API_NINJAS_FINAL_DATE,
    async fetchDay(date, metric) {
      const query = new URLSearchParams({ date, type: metric });
      const response = await options.fetch(`${BASE_URL}?${query.toString()}`, {
        headers: { 'X-Api-Key': options.apiKey },
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
      } catch {
        throw new ProviderPayloadError('response is not valid JSON');
      }
      const result = daySchemas[metric].safeParse(body);
      if (!result.success) {
        throw new ProviderPayloadError(
          z.prettifyError(result.error).slice(0, MAX_DETAIL_LENGTH),
        );
      }
      return result.data;
    },
  };
}
```

`api/src/providers/create-provider.ts`:

```ts
import type { SyncEnv } from '../config/sync-env.js';
import { createApiNinjasProvider } from './api-ninjas/api-ninjas.provider.js';
import type { CovidProvider, FetchLike } from './covid-provider.js';

export function createProvider(
  env: Pick<SyncEnv, 'DATA_PROVIDER' | 'API_NINJAS_KEY'>,
  fetch: FetchLike,
): CovidProvider {
  switch (env.DATA_PROVIDER) {
    case 'api_ninjas':
      if (env.API_NINJAS_KEY === undefined) {
        throw new Error('API_NINJAS_KEY is required when DATA_PROVIDER=api_ninjas');
      }
      return createApiNinjasProvider({ apiKey: env.API_NINJAS_KEY, fetch });
    case 'jhu_csv':
    case 'apify':
      throw new Error(`DATA_PROVIDER=${env.DATA_PROVIDER} is not implemented yet`);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w api -- providers`
Expected: PASS.

- [ ] **Step 5: Verify and commit**

Run (na raiz): `./node_modules/.bin/prettier --write api/src/providers api/tests && npm run lint && npm run typecheck && npm test`

```bash
git add api/src/providers api/tests/helpers api/tests/unit/providers
git commit -m "feat: add the api ninjas covid provider"
```

---

### Task 4: Orçamento e CallGate

**Files:**
- Create: `api/src/jobs/sync/budget.ts`
- Create: `api/src/jobs/sync/call-gate.ts`
- Create: `api/tests/unit/jobs/sync/budget.test.ts`
- Create: `api/tests/unit/jobs/sync/call-gate.test.ts`

**Interfaces:**
- Consumes: `FetchLike`, `ProviderNetworkError` (Task 3).
- Produces:
  - `interface BudgetLimits { perHour: number; perMonth: number }`; `interface CallCounts { lastHour: number; thisMonth: number }`; `monthStartUtc(now: Date): Date`; `hourAgo(now: Date): Date`; `isBudgetExhausted(counts, limits): boolean`; `class BudgetExhaustedError`.
  - `type RawFetch = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<Response>` (o `fetch` global satisfaz esse tipo).
  - `interface CallRecord { endpoint: string; statusCode: number | null; durationMs: number; outcome: 'ok' | 'http_error' | 'timeout' | 'network_error' }`.
  - `interface ProviderCallStore { countSince(since: Date): Promise<number>; record(call: CallRecord): Promise<bigint>; markInvalidPayload(id: bigint): Promise<void> }`.
  - `interface CallGate { fetch: FetchLike; markLastInvalid(): Promise<void> }`; `createCallGate(options: CallGateOptions): CallGate` com `CallGateOptions = { store; limits; fetch: RawFetch; now?: () => Date; sleep?: (ms: number) => Promise<void>; timeoutMs?: number }`.

- [ ] **Step 1: Write the failing tests**

`api/tests/unit/jobs/sync/budget.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  BudgetExhaustedError,
  hourAgo,
  isBudgetExhausted,
  monthStartUtc,
} from '../../../../src/jobs/sync/budget.js';

const LIMITS = { perHour: 90, perMonth: 3000 };

describe('monthStartUtc', () => {
  it('returns the first instant of the UTC month', () => {
    expect(monthStartUtc(new Date('2026-10-19T15:30:00Z')).toISOString()).toBe(
      '2026-10-01T00:00:00.000Z',
    );
  });

  it('uses the UTC month, not the local one', () => {
    expect(monthStartUtc(new Date('2026-10-31T22:00:00-03:00')).toISOString()).toBe(
      '2026-11-01T00:00:00.000Z',
    );
  });

  it('handles the turn of the year', () => {
    expect(monthStartUtc(new Date('2026-12-31T23:59:59.999Z')).toISOString()).toBe(
      '2026-12-01T00:00:00.000Z',
    );
    expect(monthStartUtc(new Date('2027-01-01T00:00:00.000Z')).toISOString()).toBe(
      '2027-01-01T00:00:00.000Z',
    );
  });
});

describe('hourAgo', () => {
  it('goes back exactly one hour', () => {
    expect(hourAgo(new Date('2026-10-19T15:30:00Z')).toISOString()).toBe(
      '2026-10-19T14:30:00.000Z',
    );
  });
});

describe('isBudgetExhausted', () => {
  it('allows calls below both limits', () => {
    expect(isBudgetExhausted({ lastHour: 89, thisMonth: 2999 }, LIMITS)).toBe(false);
  });

  it('treats reaching the hourly limit as exhausted', () => {
    expect(isBudgetExhausted({ lastHour: 90, thisMonth: 0 }, LIMITS)).toBe(true);
  });

  it('treats reaching the monthly limit as exhausted', () => {
    expect(isBudgetExhausted({ lastHour: 0, thisMonth: 3000 }, LIMITS)).toBe(true);
  });
});

describe('BudgetExhaustedError', () => {
  it('explains both counters', () => {
    expect(new BudgetExhaustedError({ lastHour: 90, thisMonth: 120 }, LIMITS).message).toBe(
      'Call budget exhausted: 90/90 in the last hour, 120/3000 this month (UTC)',
    );
  });
});
```

`api/tests/unit/jobs/sync/call-gate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BudgetExhaustedError } from '../../../../src/jobs/sync/budget.js';
import {
  createCallGate,
  type CallRecord,
  type ProviderCallStore,
  type RawFetch,
} from '../../../../src/jobs/sync/call-gate.js';

const URL_CASES = 'https://api.api-ninjas.com/v1/covid19?date=2023-03-09&type=cases';
const HEADERS = { 'X-Api-Key': 'test-key' };
const LIMITS = { perHour: 90, perMonth: 3000 };

interface StoredCall extends CallRecord {
  id: bigint;
  invalid: boolean;
}

function memoryStore(alreadyUsed = 0) {
  const calls: StoredCall[] = [];
  const store: ProviderCallStore = {
    countSince: () => Promise.resolve(alreadyUsed + calls.length),
    record: (call) => {
      const id = BigInt(calls.length + 1);
      calls.push({ ...call, id, invalid: false });
      return Promise.resolve(id);
    },
    markInvalidPayload: (id) => {
      const call = calls.find((stored) => stored.id === id);
      if (call) {
        call.invalid = true;
      }
      return Promise.resolve();
    },
  };
  return { calls, store };
}

function scriptedFetch(...steps: (number | Error)[]) {
  const requests: { url: string; headers: Record<string, string>; signal: AbortSignal }[] = [];
  const fetch: RawFetch = (url, init) => {
    requests.push({ url, ...init });
    const step = steps[requests.length - 1];
    if (step === undefined) {
      return Promise.reject(new Error('unexpected extra request'));
    }
    if (step instanceof Error) {
      return Promise.reject(step);
    }
    return Promise.resolve(new Response('[]', { status: step }));
  };
  return { requests, fetch };
}

function recordingSleep() {
  const delays: number[] = [];
  const sleep = (ms: number): Promise<void> => {
    delays.push(ms);
    return Promise.resolve();
  };
  return { delays, sleep };
}

const timeoutError = (): Error =>
  new DOMException('The operation was aborted due to timeout', 'TimeoutError');

describe('createCallGate', () => {
  it('returns a successful response and records one call without the key', async () => {
    const { calls, store } = memoryStore();
    const { requests, fetch } = scriptedFetch(200);
    const gate = createCallGate({ store, limits: LIMITS, fetch, sleep: recordingSleep().sleep });

    const response = await gate.fetch(URL_CASES, { headers: HEADERS });

    expect(response.status).toBe(200);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.headers).toEqual(HEADERS);
    expect(requests[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(calls).toMatchObject([
      { endpoint: '/v1/covid19?date=2023-03-09&type=cases', statusCode: 200, outcome: 'ok' },
    ]);
    expect(calls[0]?.endpoint).not.toContain('test-key');
  });

  it('retries a 429 after 1 s and records both attempts', async () => {
    const { calls, store } = memoryStore();
    const { fetch } = scriptedFetch(429, 200);
    const { delays, sleep } = recordingSleep();

    const response = await createCallGate({ store, limits: LIMITS, fetch, sleep }).fetch(
      URL_CASES,
      { headers: HEADERS },
    );

    expect(response.status).toBe(200);
    expect(delays).toEqual([1_000]);
    expect(calls.map((call) => [call.statusCode, call.outcome])).toEqual([
      [429, 'http_error'],
      [200, 'ok'],
    ]);
  });

  it('gives up after 3 attempts on 5xx and returns the last response', async () => {
    const { calls, store } = memoryStore();
    const { fetch } = scriptedFetch(503, 502, 500);
    const { delays, sleep } = recordingSleep();

    const response = await createCallGate({ store, limits: LIMITS, fetch, sleep }).fetch(
      URL_CASES,
      { headers: HEADERS },
    );

    expect(response.status).toBe(500);
    expect(delays).toEqual([1_000, 2_000]);
    expect(calls).toHaveLength(3);
  });

  it('does not retry a 401', async () => {
    const { calls, store } = memoryStore();
    const { fetch } = scriptedFetch(401);
    const { delays, sleep } = recordingSleep();

    const response = await createCallGate({ store, limits: LIMITS, fetch, sleep }).fetch(
      URL_CASES,
      { headers: HEADERS },
    );

    expect(response.status).toBe(401);
    expect(delays).toEqual([]);
    expect(calls.map((call) => [call.statusCode, call.outcome])).toEqual([[401, 'http_error']]);
  });

  it('records timeouts and throws ProviderNetworkError after 3 attempts', async () => {
    const { calls, store } = memoryStore();
    const { fetch } = scriptedFetch(timeoutError(), timeoutError(), timeoutError());

    await expect(
      createCallGate({ store, limits: LIMITS, fetch, sleep: recordingSleep().sleep }).fetch(
        URL_CASES,
        { headers: HEADERS },
      ),
    ).rejects.toMatchObject({ name: 'ProviderNetworkError', kind: 'timeout' });
    expect(calls.map((call) => [call.statusCode, call.outcome])).toEqual([
      [null, 'timeout'],
      [null, 'timeout'],
      [null, 'timeout'],
    ]);
  });

  it('retries a network error', async () => {
    const { calls, store } = memoryStore();
    const { fetch } = scriptedFetch(new TypeError('fetch failed'), 200);

    const response = await createCallGate({
      store,
      limits: LIMITS,
      fetch,
      sleep: recordingSleep().sleep,
    }).fetch(URL_CASES, { headers: HEADERS });

    expect(response.status).toBe(200);
    expect(calls.map((call) => call.outcome)).toEqual(['network_error', 'ok']);
  });

  it('aborts a request that exceeds the timeout', async () => {
    const { calls, store } = memoryStore();
    const fetch: RawFetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          reject(new DOMException('timed out', 'TimeoutError'));
        });
      });

    await expect(
      createCallGate({
        store,
        limits: LIMITS,
        fetch,
        sleep: recordingSleep().sleep,
        timeoutMs: 5,
      }).fetch(URL_CASES, { headers: HEADERS }),
    ).rejects.toMatchObject({ kind: 'timeout' });
    expect(calls).toHaveLength(3);
  });

  it('refuses to call when the hourly budget is used up', async () => {
    const { calls, store } = memoryStore(90);
    const { requests, fetch } = scriptedFetch(200);

    await expect(
      createCallGate({ store, limits: LIMITS, fetch }).fetch(URL_CASES, { headers: HEADERS }),
    ).rejects.toBeInstanceOf(BudgetExhaustedError);
    expect(requests).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it('refuses to call when the monthly budget is used up', async () => {
    const { store } = memoryStore(5);
    const { requests, fetch } = scriptedFetch(200);

    await expect(
      createCallGate({ store, limits: { perHour: 1000, perMonth: 5 }, fetch }).fetch(URL_CASES, {
        headers: HEADERS,
      }),
    ).rejects.toBeInstanceOf(BudgetExhaustedError);
    expect(requests).toHaveLength(0);
  });

  it('checks the budget before every retry', async () => {
    const { calls, store } = memoryStore();
    const { fetch } = scriptedFetch(503, 503, 200);

    await expect(
      createCallGate({
        store,
        limits: { perHour: 2, perMonth: 3000 },
        fetch,
        sleep: recordingSleep().sleep,
      }).fetch(URL_CASES, { headers: HEADERS }),
    ).rejects.toBeInstanceOf(BudgetExhaustedError);
    expect(calls).toHaveLength(2);
  });

  it('marks the last call as an invalid payload', async () => {
    const { calls, store } = memoryStore();
    const { fetch } = scriptedFetch(200);
    const gate = createCallGate({ store, limits: LIMITS, fetch });

    await gate.fetch(URL_CASES, { headers: HEADERS });
    await gate.markLastInvalid();

    expect(calls[0]?.invalid).toBe(true);
  });
});
```

Run: `npm test -w api -- jobs/sync`
Expected: FAIL, `budget.js` e `call-gate.js` não existem.

- [ ] **Step 2: Implement**

`api/src/jobs/sync/budget.ts`:

```ts
export interface BudgetLimits {
  perHour: number;
  perMonth: number;
}

export interface CallCounts {
  lastHour: number;
  thisMonth: number;
}

const HOUR_MS = 3_600_000;

export class BudgetExhaustedError extends Error {
  constructor(counts: CallCounts, limits: BudgetLimits) {
    super(
      `Call budget exhausted: ${counts.lastHour}/${limits.perHour} in the last hour, ` +
        `${counts.thisMonth}/${limits.perMonth} this month (UTC)`,
    );
    this.name = 'BudgetExhaustedError';
  }
}

export function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function hourAgo(now: Date): Date {
  return new Date(now.getTime() - HOUR_MS);
}

export function isBudgetExhausted(counts: CallCounts, limits: BudgetLimits): boolean {
  return counts.lastHour >= limits.perHour || counts.thisMonth >= limits.perMonth;
}
```

`api/src/jobs/sync/call-gate.ts`:

```ts
import type { FetchLike } from '../../providers/covid-provider.js';
import { ProviderNetworkError } from '../../providers/provider-errors.js';
import {
  BudgetExhaustedError,
  hourAgo,
  isBudgetExhausted,
  monthStartUtc,
  type BudgetLimits,
} from './budget.js';

export type RawFetch = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<Response>;

export interface CallRecord {
  endpoint: string;
  statusCode: number | null;
  durationMs: number;
  outcome: 'ok' | 'http_error' | 'timeout' | 'network_error';
}

export interface ProviderCallStore {
  countSince(since: Date): Promise<number>;
  record(call: CallRecord): Promise<bigint>;
  markInvalidPayload(id: bigint): Promise<void>;
}

export interface CallGateOptions {
  store: ProviderCallStore;
  limits: BudgetLimits;
  fetch: RawFetch;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}

export interface CallGate {
  fetch: FetchLike;
  markLastInvalid(): Promise<void>;
}

type Attempt =
  | { kind: 'response'; response: Response }
  | { kind: 'failure'; error: ProviderNetworkError };

const TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1_000, 2_000] as const;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function isTimeout(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error.name === 'TimeoutError' || error.name === 'AbortError')
  );
}

function endpointOf(url: string): string {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}

export function createCallGate(options: CallGateOptions): CallGate {
  const now = options.now ?? (() => new Date());
  const sleep = options.sleep ?? defaultSleep;
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  let lastCallId: bigint | undefined;

  async function assertBudget(): Promise<void> {
    const current = now();
    const counts = {
      lastHour: await options.store.countSince(hourAgo(current)),
      thisMonth: await options.store.countSince(monthStartUtc(current)),
    };
    if (isBudgetExhausted(counts, options.limits)) {
      throw new BudgetExhaustedError(counts, options.limits);
    }
  }

  async function attemptOnce(url: string, headers: Record<string, string>): Promise<Attempt> {
    const started = performance.now();
    let attempt: Attempt;
    try {
      const response = await options.fetch(url, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
      attempt = { kind: 'response', response };
    } catch (error) {
      const kind = isTimeout(error) ? 'timeout' : 'network_error';
      attempt = { kind: 'failure', error: new ProviderNetworkError(kind, { cause: error }) };
    }
    lastCallId = await options.store.record({
      endpoint: endpointOf(url),
      statusCode: attempt.kind === 'response' ? attempt.response.status : null,
      durationMs: Math.round(performance.now() - started),
      outcome:
        attempt.kind === 'failure'
          ? attempt.error.kind
          : attempt.response.ok
            ? 'ok'
            : 'http_error',
    });
    return attempt;
  }

  const gatedFetch: FetchLike = async (url, init) => {
    for (let attemptNumber = 1; ; attemptNumber += 1) {
      await assertBudget();
      const attempt = await attemptOnce(url, init.headers);
      const retryable =
        attempt.kind === 'failure' || isRetryableStatus(attempt.response.status);
      if (!retryable || attemptNumber >= MAX_ATTEMPTS) {
        if (attempt.kind === 'failure') {
          throw attempt.error;
        }
        return attempt.response;
      }
      await sleep(RETRY_DELAYS_MS[attemptNumber - 1] ?? RETRY_DELAYS_MS[1]);
    }
  };

  return {
    fetch: gatedFetch,
    async markLastInvalid() {
      if (lastCallId !== undefined) {
        await options.store.markInvalidPayload(lastCallId);
      }
    },
  };
}
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `npm test -w api -- jobs/sync`
Expected: PASS.

- [ ] **Step 4: Verify and commit**

Run (na raiz): `./node_modules/.bin/prettier --write api/src/jobs api/tests/unit/jobs && npm run lint && npm run typecheck && npm test`

```bash
git add api/src/jobs/sync/budget.ts api/src/jobs/sync/call-gate.ts api/tests/unit/jobs
git commit -m "feat: add the call budget and the provider call gate"
```

---

### Task 5: Agregação do dia (aliases + RN-02)

**Files:**
- Create: `api/src/jobs/sync/aggregate.ts`
- Create: `api/tests/unit/jobs/sync/aggregate.test.ts`

**Interfaces:**
- Consumes: `SourceRow` (Task 3); `fixtureDayRows` (helper da Task 3).
- Produces: `type AliasStatus = 'mapped' | 'pending' | 'ignored'`; `interface AliasEntry { status: AliasStatus; countryCode: string | null }`; `interface CountryValues { countryCode: string; total: number; new: number }`; `interface DayAggregate { stats: CountryValues[]; pendingNames: string[]; ignoredNames: string[] }`; `aggregateDay(rows: readonly SourceRow[], aliases: ReadonlyMap<string, AliasEntry>): DayAggregate`. `stats` vem ordenado por `countryCode`; os nomes, em ordem alfabética e sem repetição.

- [ ] **Step 1: Write the failing test**

`api/tests/unit/jobs/sync/aggregate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { aggregateDay, type AliasEntry } from '../../../../src/jobs/sync/aggregate.js';
import { fixtureDayRows } from '../../../helpers/api-ninjas-fixtures.js';

const mapped = (countryCode: string): AliasEntry => ({ status: 'mapped', countryCode });

const ALIASES = new Map<string, AliasEntry>([
  ['Australia', mapped('AUS')],
  ['Brazil', mapped('BRA')],
  ['Denmark', mapped('DNK')],
  ['Diamond Princess', mapped('XDP')],
]);

describe('aggregateDay', () => {
  it('sums the regions of each country for cases (RN-02)', () => {
    expect(aggregateDay(fixtureDayRows('cases'), ALIASES)).toEqual({
      stats: [
        { countryCode: 'AUS', total: 11399460, new: 13926 },
        { countryCode: 'BRA', total: 37076053, new: 0 },
        { countryCode: 'DNK', total: 3451036, new: 139 },
        { countryCode: 'XDP', total: 712, new: 0 },
      ],
      pendingNames: [],
      ignoredNames: [],
    });
  });

  it('sums the regions of each country for deaths (RN-02)', () => {
    expect(aggregateDay(fixtureDayRows('deaths'), ALIASES).stats).toEqual([
      { countryCode: 'AUS', total: 19574, new: 115 },
      { countryCode: 'BRA', total: 699276, new: 0 },
      { countryCode: 'DNK', total: 8345, new: 4 },
      { countryCode: 'XDP', total: 13, new: 0 },
    ]);
  });

  it('lists an unknown name once and leaves it out of the stats', () => {
    const rows = [
      ...fixtureDayRows('cases'),
      { country: 'Atlantis', region: 'North', total: 5, new: 1 },
      { country: 'Atlantis', region: 'South', total: 3, new: 0 },
    ];
    const day = aggregateDay(rows, ALIASES);
    expect(day.pendingNames).toEqual(['Atlantis']);
    expect(day.stats.map((stat) => stat.countryCode)).toEqual(['AUS', 'BRA', 'DNK', 'XDP']);
  });

  it('treats a pending alias as unmapped', () => {
    const aliases = new Map(ALIASES).set('Brazil', { status: 'pending', countryCode: null });
    const day = aggregateDay(fixtureDayRows('cases'), aliases);
    expect(day.pendingNames).toEqual(['Brazil']);
    expect(day.stats.map((stat) => stat.countryCode)).toEqual(['AUS', 'DNK', 'XDP']);
  });

  it('skips ignored names', () => {
    const aliases = new Map(ALIASES).set('Diamond Princess', {
      status: 'ignored',
      countryCode: null,
    });
    const day = aggregateDay(fixtureDayRows('cases'), aliases);
    expect(day.ignoredNames).toEqual(['Diamond Princess']);
    expect(day.pendingNames).toEqual([]);
    expect(day.stats.map((stat) => stat.countryCode)).toEqual(['AUS', 'BRA', 'DNK']);
  });

  it('keeps negative new values when summing (RN-07)', () => {
    const day = aggregateDay(
      [
        { country: 'Brazil', region: 'A', total: 10, new: -5 },
        { country: 'Brazil', region: 'B', total: 4, new: 2 },
      ],
      ALIASES,
    );
    expect(day.stats).toEqual([{ countryCode: 'BRA', total: 14, new: -3 }]);
  });
});
```

Run: `npm test -w api -- aggregate`
Expected: FAIL, `aggregate.js` não existe.

- [ ] **Step 2: Implement**

`api/src/jobs/sync/aggregate.ts`:

```ts
import type { SourceRow } from '../../providers/covid-provider.js';

export type AliasStatus = 'mapped' | 'pending' | 'ignored';

export interface AliasEntry {
  status: AliasStatus;
  countryCode: string | null;
}

export interface CountryValues {
  countryCode: string;
  total: number;
  new: number;
}

export interface DayAggregate {
  stats: CountryValues[];
  pendingNames: string[];
  ignoredNames: string[];
}

// RN-02: every row of the same mapped country (regions, territories, ships) is summed.
export function aggregateDay(
  rows: readonly SourceRow[],
  aliases: ReadonlyMap<string, AliasEntry>,
): DayAggregate {
  const totals = new Map<string, CountryValues>();
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
    const current = totals.get(alias.countryCode) ?? {
      countryCode: alias.countryCode,
      total: 0,
      new: 0,
    };
    current.total += row.total;
    current.new += row.new;
    totals.set(alias.countryCode, current);
  }

  return {
    stats: [...totals.values()].sort((a, b) => a.countryCode.localeCompare(b.countryCode)),
    pendingNames: [...pending].sort(),
    ignoredNames: [...ignored].sort(),
  };
}
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `npm test -w api -- aggregate`
Expected: PASS (6 testes).

- [ ] **Step 4: Verify and commit**

Run (na raiz): `./node_modules/.bin/prettier --write api/src/jobs api/tests/unit/jobs && npm run lint && npm run typecheck && npm test`

```bash
git add api/src/jobs/sync/aggregate.ts api/tests/unit/jobs/sync/aggregate.test.ts
git commit -m "feat: aggregate source rows per country with region sums"
```

---

### Task 6: Repositórios do sync

**Files:**
- Create: `api/src/lib/prisma.ts`
- Create: `api/src/repositories/data-source.repository.ts`
- Create: `api/src/repositories/alias.repository.ts`
- Create: `api/src/repositories/daily-stat.repository.ts`
- Create: `api/src/repositories/global-stat.repository.ts`
- Create: `api/src/repositories/provider-call.repository.ts`
- Create: `api/src/repositories/sync-run.repository.ts`
- Create: `api/src/repositories/sync-lock.repository.ts`
- Create: `api/tests/integration/sync-state.ts`
- Create: `api/tests/integration/repositories.test.ts`

**Interfaces:**
- Produces:
  - `type Db = Prisma.TransactionClient` (o `PrismaClient` também serve) e `createPrisma(connectionString: string): PrismaClient`.
  - `findSourceId(db, code): Promise<number | null>`.
  - `loadAliases(db, sourceId): Promise<Map<string, { status: AliasStatus; countryCode: string | null }>>`; `insertPendingAliases(db, sourceId, names: readonly string[]): Promise<void>`.
  - `upsertDailyStats(db, { sourceId, metric: Metric, statDate: string, values: readonly { countryCode: string; total: number; new: number }[] }): Promise<number>`.
  - `refreshGlobalDailyStat(db): Promise<void>`.
  - `createProviderCallStore(db, { sourceId, syncRunId }): ProviderCallRepository`, com os mesmos métodos do `ProviderCallStore` da Task 4.
  - `INTERRUPTED_ERROR`; `startRun(db, { sourceId, mode, referenceDate }): Promise<number>`; `failOrphanRuns(db): Promise<number[]>`; `finishRun(db, runId, { status, error }): Promise<number>` (devolve `calls_used`); `startCheckpoint(db, runId, unit)`; `completeCheckpoint(db, runId, unit)`; `failCheckpoint(db, runId, unit, message)`.
  - `SYNC_LOCK_KEY = 1835102320`; `interface SyncLock { release(): Promise<void> }`; `tryAcquireSyncLock(connectionString): Promise<SyncLock | null>`.
  - Teste: `resetSyncState(client: pg.Client): Promise<void>`.

- [ ] **Step 1: Write the failing integration test**

`api/tests/integration/sync-state.ts`:

```ts
import type pg from 'pg';

// Leaves the database as db:migrate + db:seed left it, for the other test files.
export async function resetSyncState(client: pg.Client): Promise<void> {
  await client.query('DELETE FROM sync_checkpoint');
  await client.query('DELETE FROM provider_call');
  await client.query('DELETE FROM sync_run');
  await client.query('DELETE FROM daily_stat');
  await client.query("DELETE FROM country_alias WHERE status = 'pending'");
  await client.query('REFRESH MATERIALIZED VIEW global_daily_stat');
}
```

`api/tests/integration/repositories.test.ts`:

```ts
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrisma } from '../../src/lib/prisma.js';
import { insertPendingAliases, loadAliases } from '../../src/repositories/alias.repository.js';
import { upsertDailyStats } from '../../src/repositories/daily-stat.repository.js';
import { findSourceId } from '../../src/repositories/data-source.repository.js';
import { refreshGlobalDailyStat } from '../../src/repositories/global-stat.repository.js';
import { createProviderCallStore } from '../../src/repositories/provider-call.repository.js';
import {
  SYNC_LOCK_KEY,
  tryAcquireSyncLock,
} from '../../src/repositories/sync-lock.repository.js';
import {
  INTERRUPTED_ERROR,
  completeCheckpoint,
  failCheckpoint,
  failOrphanRuns,
  finishRun,
  startCheckpoint,
  startRun,
} from '../../src/repositories/sync-run.repository.js';
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

  it('fails orphan runs with the interrupted message', async () => {
    const runId = await openRun();
    expect(await failOrphanRuns(prisma)).toEqual([runId]);
    const run = await owner.query(
      'SELECT status, error, finished_at IS NOT NULL AS finished FROM sync_run WHERE id = $1',
      [runId],
    );
    expect(run.rows).toEqual([{ status: 'failed', error: INTERRUPTED_ERROR, finished: true }]);
    expect(await failOrphanRuns(prisma)).toEqual([]);
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
  it('counts calls since an instant and marks invalid payloads', async () => {
    const runId = await openRun();
    const store = createProviderCallStore(prisma, { sourceId, syncRunId: runId });
    const before = new Date(Date.now() - 60_000);
    const id = await store.record({
      endpoint: '/v1/covid19?date=2023-03-09&type=deaths',
      statusCode: 200,
      durationMs: 5,
      outcome: 'ok',
    });
    expect(typeof id).toBe('bigint');
    expect(await store.countSince(before)).toBe(1);
    expect(await store.countSince(new Date(Date.now() + 60_000))).toBe(0);

    await store.markInvalidPayload(id);

    const calls = await owner.query('SELECT outcome, sync_run_id FROM provider_call');
    expect(calls.rows).toEqual([{ outcome: 'invalid_payload', sync_run_id: runId }]);
  });
});

describe('sync lock', () => {
  it('uses the documented key', () => {
    expect(SYNC_LOCK_KEY).toBe(0x6d617070);
  });

  it('lets only one holder acquire the advisory lock', async () => {
    const first = await tryAcquireSyncLock(urls.syncUrl);
    expect(first).not.toBeNull();
    try {
      expect(await tryAcquireSyncLock(urls.syncUrl)).toBeNull();
    } finally {
      await first?.release();
    }
    const again = await tryAcquireSyncLock(urls.syncUrl);
    expect(again).not.toBeNull();
    await again?.release();
  });
});
```

Run: `docker compose up -d --wait && npm run test:integration -w api`
Expected: FAIL, `src/lib/prisma.js` e os repositórios não existem.

- [ ] **Step 2: Implement**

`api/src/lib/prisma.ts`:

```ts
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../generated/prisma/client.js';

// Accepts both the client and an interactive transaction.
export type Db = Prisma.TransactionClient;

export function createPrisma(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
```

`api/src/repositories/data-source.repository.ts`:

```ts
import type { Db } from '../lib/prisma.js';

export async function findSourceId(db: Db, code: string): Promise<number | null> {
  const source = await db.dataSource.findUnique({ where: { code }, select: { id: true } });
  return source?.id ?? null;
}
```

`api/src/repositories/alias.repository.ts`:

```ts
import type { AliasStatus } from '../generated/prisma/client.js';
import type { Db } from '../lib/prisma.js';

export interface AliasRecord {
  status: AliasStatus;
  countryCode: string | null;
}

export async function loadAliases(db: Db, sourceId: number): Promise<Map<string, AliasRecord>> {
  const rows = await db.countryAlias.findMany({
    where: { sourceId },
    select: { sourceName: true, status: true, countryCode: true },
  });
  return new Map(
    rows.map((row) => [row.sourceName, { status: row.status, countryCode: row.countryCode }]),
  );
}

// ON CONFLICT DO NOTHING: an existing alias (mapped, ignored or pending) is never changed here.
export async function insertPendingAliases(
  db: Db,
  sourceId: number,
  names: readonly string[],
): Promise<void> {
  if (names.length === 0) {
    return;
  }
  await db.countryAlias.createMany({
    data: names.map((sourceName) => ({ sourceId, sourceName, status: 'pending' as const })),
    skipDuplicates: true,
  });
}
```

`api/src/repositories/daily-stat.repository.ts`:

```ts
import type { Metric } from '../generated/prisma/client.js';
import type { Db } from '../lib/prisma.js';

export interface DailyStatValues {
  countryCode: string;
  total: number;
  new: number;
}

export interface DailyStatBatch {
  sourceId: number;
  metric: Metric;
  statDate: string;
  values: readonly DailyStatValues[];
}

// RN-09: idempotent upsert by (country, metric, date, source); updated_at is set by SQL.
export async function upsertDailyStats(db: Db, batch: DailyStatBatch): Promise<number> {
  if (batch.values.length === 0) {
    return 0;
  }
  const codes = batch.values.map((value) => value.countryCode);
  const totals = batch.values.map((value) => value.total);
  const news = batch.values.map((value) => value.new);
  return db.$executeRaw`
    INSERT INTO daily_stat (country_code, metric, stat_date, source_id, total, new_value, updated_at)
    SELECT v.code, ${batch.metric}::metric, ${batch.statDate}::date, ${batch.sourceId},
           v.total, v.new_value, now()
    FROM unnest(${codes}::text[], ${totals}::int[], ${news}::int[]) AS v(code, total, new_value)
    ON CONFLICT (country_code, metric, stat_date, source_id)
    DO UPDATE SET total = EXCLUDED.total, new_value = EXCLUDED.new_value, updated_at = now()`;
}
```

`api/src/repositories/global-stat.repository.ts`:

```ts
import type { Db } from '../lib/prisma.js';

export async function refreshGlobalDailyStat(db: Db): Promise<void> {
  await db.$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY global_daily_stat`;
}
```

`api/src/repositories/provider-call.repository.ts`:

```ts
import type { CallOutcome } from '../generated/prisma/client.js';
import type { Db } from '../lib/prisma.js';

export interface ProviderCallInput {
  endpoint: string;
  statusCode: number | null;
  durationMs: number;
  outcome: CallOutcome;
}

export interface ProviderCallRepository {
  countSince(since: Date): Promise<number>;
  record(call: ProviderCallInput): Promise<bigint>;
  markInvalidPayload(id: bigint): Promise<void>;
}

export function createProviderCallStore(
  db: Db,
  scope: { sourceId: number; syncRunId: number },
): ProviderCallRepository {
  return {
    countSince: (since) =>
      db.providerCall.count({ where: { sourceId: scope.sourceId, calledAt: { gte: since } } }),
    async record(call) {
      const row = await db.providerCall.create({
        data: { sourceId: scope.sourceId, syncRunId: scope.syncRunId, ...call },
        select: { id: true },
      });
      return row.id;
    },
    async markInvalidPayload(id) {
      await db.providerCall.update({ where: { id }, data: { outcome: 'invalid_payload' } });
    },
  };
}
```

`api/src/repositories/sync-run.repository.ts`:

```ts
import type { SyncMode, SyncStatus } from '../generated/prisma/client.js';
import type { Db } from '../lib/prisma.js';

export const INTERRUPTED_ERROR = 'interrompido: o processo anterior terminou sem fechar o run';

export async function startRun(
  db: Db,
  input: { sourceId: number; mode: SyncMode; referenceDate: string },
): Promise<number> {
  const run = await db.syncRun.create({
    data: {
      sourceId: input.sourceId,
      mode: input.mode,
      status: 'running',
      referenceDate: new Date(`${input.referenceDate}T00:00:00.000Z`),
    },
    select: { id: true },
  });
  return run.id;
}

// Only safe while holding the sync lock: no live process owns a 'running' row then.
export async function failOrphanRuns(db: Db): Promise<number[]> {
  const orphans = await db.syncRun.findMany({
    where: { status: 'running' },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  if (orphans.length === 0) {
    return [];
  }
  await db.syncRun.updateMany({
    where: { id: { in: orphans.map((orphan) => orphan.id) } },
    data: { status: 'failed', finishedAt: new Date(), error: INTERRUPTED_ERROR },
  });
  return orphans.map((orphan) => orphan.id);
}

export async function finishRun(
  db: Db,
  runId: number,
  result: { status: Exclude<SyncStatus, 'running'>; error: string | null },
): Promise<number> {
  const callsUsed = await db.providerCall.count({ where: { syncRunId: runId } });
  await db.syncRun.update({
    where: { id: runId },
    data: { status: result.status, error: result.error, finishedAt: new Date(), callsUsed },
  });
  return callsUsed;
}

export async function startCheckpoint(db: Db, runId: number, unit: string): Promise<void> {
  await db.syncCheckpoint.upsert({
    where: { syncRunId_unit: { syncRunId: runId, unit } },
    create: { syncRunId: runId, unit, status: 'pending', attempts: 1 },
    update: { status: 'pending', attempts: { increment: 1 }, errorMessage: null },
  });
}

export async function completeCheckpoint(db: Db, runId: number, unit: string): Promise<void> {
  await db.syncCheckpoint.update({
    where: { syncRunId_unit: { syncRunId: runId, unit } },
    data: { status: 'done', errorMessage: null },
  });
}

export async function failCheckpoint(
  db: Db,
  runId: number,
  unit: string,
  message: string,
): Promise<void> {
  await db.syncCheckpoint.update({
    where: { syncRunId_unit: { syncRunId: runId, unit } },
    data: { status: 'error', errorMessage: message },
  });
}
```

`api/src/repositories/sync-lock.repository.ts`:

```ts
import pg from 'pg';

// 'mapp' in hexadecimal (0x6d617070). Session-level lock: it dies with the connection.
export const SYNC_LOCK_KEY = 1_835_102_320;

export interface SyncLock {
  release(): Promise<void>;
}

export async function tryAcquireSyncLock(connectionString: string): Promise<SyncLock | null> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  let locked = false;
  try {
    const result = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock($1) AS locked',
      [SYNC_LOCK_KEY],
    );
    locked = result.rows[0]?.locked === true;
  } finally {
    if (!locked) {
      await client.end();
    }
  }
  if (!locked) {
    return null;
  }
  return {
    async release() {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [SYNC_LOCK_KEY]);
      } finally {
        await client.end();
      }
    },
  };
}
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `npm run test:integration -w api`
Expected: PASS (os arquivos anteriores mais os 12 testes de `repositories.test.ts`).

- [ ] **Step 4: Verify and commit**

Run (na raiz): `./node_modules/.bin/prettier --write api/src api/tests && npm run lint && npm run typecheck && npm test`

```bash
git add api/src/lib/prisma.ts api/src/repositories api/tests/integration/sync-state.ts api/tests/integration/repositories.test.ts
git commit -m "feat: add sync repositories and the advisory lock"
```

---

### Task 7: Orquestração do snapshot e CLI

**Files:**
- Create: `api/src/jobs/sync/run-snapshot.ts`
- Create: `api/src/jobs/sync/run-sync.ts`
- Create: `api/src/jobs/sync/cli-args.ts`
- Create: `api/src/jobs/sync/cli.ts`
- Create: `api/tests/unit/jobs/sync/cli-args.test.ts`
- Create: `api/tests/integration/snapshot.test.ts`
- Modify: `api/package.json` (script `sync`)

**Interfaces:**
- Consumes: tudo das Tasks 1 a 6.
- Produces:
  - `type RunStatus = 'success' | 'partial' | 'failed'`; `interface SyncResult { runId: number; status: RunStatus; callsUsed: number; pendingNames: string[] }`.
  - `interface SnapshotDeps { prisma: PrismaClient; createProvider: (fetch: FetchLike) => CovidProvider; fetch: RawFetch; limits: BudgetLimits; logger: Logger; sleep?; now? }`; `runSnapshot(deps): Promise<SyncResult>`.
  - `class SyncLockedError`; `interface RunSyncDeps extends SnapshotDeps { lockUrl: string }`; `runSync(deps): Promise<SyncResult>`.
  - `type SyncMode = 'snapshot' | 'full'`; `USAGE`; `class UsageError`; `parseSyncArgs(argv: readonly string[]): { mode: SyncMode }`.
  - Códigos de saída do CLI: `0` em `success`/`partial`; `1` em `failed`, lock ocupado ou erro inesperado; `2` em uso inválido ou `--mode=full`.

> **Lembrete:** não rode `npm run sync -w api -- --mode=snapshot`. Ele carrega a chave real do `api/.env` e chama a API. O teste de integração cobre o fluxo com `fetch` falso.

- [ ] **Step 1: Write the failing tests**

`api/tests/unit/jobs/sync/cli-args.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { UsageError, parseSyncArgs } from '../../../../src/jobs/sync/cli-args.js';

describe('parseSyncArgs', () => {
  it('accepts --mode=snapshot', () => {
    expect(parseSyncArgs(['--mode=snapshot'])).toEqual({ mode: 'snapshot' });
  });

  it('accepts --mode full', () => {
    expect(parseSyncArgs(['--mode', 'full'])).toEqual({ mode: 'full' });
  });

  it('requires --mode', () => {
    expect(() => parseSyncArgs([])).toThrow(UsageError);
    expect(() => parseSyncArgs([])).toThrow(/missing --mode/);
  });

  it('rejects an unknown mode', () => {
    expect(() => parseSyncArgs(['--mode=weekly'])).toThrow(/invalid --mode: weekly/);
  });

  it('rejects unknown options and positionals', () => {
    expect(() => parseSyncArgs(['--mode=snapshot', '--force'])).toThrow(UsageError);
    expect(() => parseSyncArgs(['--mode=snapshot', 'extra'])).toThrow(UsageError);
  });

  it('shows the usage line in the error', () => {
    expect(() => parseSyncArgs([])).toThrow(/npm run sync -w api -- --mode=snapshot\|full/);
  });
});
```

`api/tests/integration/snapshot.test.ts`:

```ts
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { RawFetch } from '../../src/jobs/sync/call-gate.js';
import { SyncLockedError, runSync, type RunSyncDeps } from '../../src/jobs/sync/run-sync.js';
import { createLogger } from '../../src/lib/logger.js';
import { createPrisma } from '../../src/lib/prisma.js';
import { createApiNinjasProvider } from '../../src/providers/api-ninjas/api-ninjas.provider.js';
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
    const metric: Metric =
      new URL(url).searchParams.get('type') === 'deaths' ? 'deaths' : 'cases';
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
    fetch,
    limits: { perHour: 90, perMonth: 3000 },
    logger: createLogger('silent'),
    sleep: () => Promise.resolve(),
    createProvider: (gatedFetch) =>
      createApiNinjasProvider({ apiKey: 'test-key', fetch: gatedFetch }),
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
    expect(await rows('SELECT endpoint, status_code, outcome FROM provider_call ORDER BY id')).toEqual(
      [
        { endpoint: '/v1/covid19?date=2023-03-09&type=cases', status_code: 200, outcome: 'ok' },
        { endpoint: '/v1/covid19?date=2023-03-09&type=deaths', status_code: 200, outcome: 'ok' },
      ],
    );
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

  it('keeps the cases when the deaths payload is invalid', async () => {
    const source = fakeSource((metric) => ({
      status: 200,
      body: metric === 'cases' ? FIXTURES.cases : '{"unexpected":true}',
    }));

    const result = await runSync(deps(source.fetch));

    expect(result.status).toBe('partial');
    expect(await rows(DAILY_STATS)).toEqual(
      EXPECTED_STATS.filter((row) => row.metric === 'cases'),
    );
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
```

Run: `npm test -w api -- cli-args` e `npm run test:integration -w api`
Expected: FAIL, `cli-args.js` e `run-sync.js` não existem.

- [ ] **Step 2: Implement**

`api/src/jobs/sync/cli-args.ts`:

```ts
import { parseArgs } from 'node:util';

export type SyncMode = 'snapshot' | 'full';

export const USAGE = 'usage: npm run sync -w api -- --mode=snapshot|full';

export class UsageError extends Error {
  constructor(detail: string) {
    super(`${detail}\n${USAGE}`);
    this.name = 'UsageError';
  }
}

function readMode(argv: readonly string[]): string | undefined {
  try {
    return parseArgs({ args: [...argv], options: { mode: { type: 'string' } }, strict: true })
      .values.mode;
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : 'invalid arguments');
  }
}

export function parseSyncArgs(argv: readonly string[]): { mode: SyncMode } {
  const mode = readMode(argv);
  if (mode === undefined) {
    throw new UsageError('missing --mode');
  }
  if (mode !== 'snapshot' && mode !== 'full') {
    throw new UsageError(`invalid --mode: ${mode}`);
  }
  return { mode };
}
```

`api/src/jobs/sync/run-snapshot.ts`:

```ts
import type { Logger } from 'pino';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { CovidProvider, FetchLike, Metric } from '../../providers/covid-provider.js';
import {
  ProviderAuthError,
  ProviderHttpError,
  ProviderNetworkError,
  ProviderPayloadError,
} from '../../providers/provider-errors.js';
import { insertPendingAliases, loadAliases } from '../../repositories/alias.repository.js';
import { upsertDailyStats } from '../../repositories/daily-stat.repository.js';
import { findSourceId } from '../../repositories/data-source.repository.js';
import { refreshGlobalDailyStat } from '../../repositories/global-stat.repository.js';
import { createProviderCallStore } from '../../repositories/provider-call.repository.js';
import {
  completeCheckpoint,
  failCheckpoint,
  finishRun,
  startCheckpoint,
  startRun,
} from '../../repositories/sync-run.repository.js';
import { aggregateDay } from './aggregate.js';
import { BudgetExhaustedError, type BudgetLimits } from './budget.js';
import { createCallGate, type CallGate, type RawFetch } from './call-gate.js';

const METRICS: readonly Metric[] = ['cases', 'deaths'];

export type RunStatus = 'success' | 'partial' | 'failed';

export interface SyncResult {
  runId: number;
  status: RunStatus;
  callsUsed: number;
  pendingNames: string[];
}

export interface SnapshotDeps {
  prisma: PrismaClient;
  createProvider: (fetch: FetchLike) => CovidProvider;
  fetch: RawFetch;
  limits: BudgetLimits;
  logger: Logger;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
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

export async function runSnapshot(deps: SnapshotDeps): Promise<SyncResult> {
  const { prisma } = deps;
  let gate: CallGate | undefined;
  const provider = deps.createProvider((url, init) =>
    gate === undefined ? Promise.reject(new Error('call gate is not ready')) : gate.fetch(url, init),
  );
  const sourceId = await findSourceId(prisma, provider.sourceCode);
  if (sourceId === null) {
    throw new Error(`Data source "${provider.sourceCode}" not found: run npm run db:seed -w api`);
  }

  const date = provider.finalDate;
  const runId = await startRun(prisma, { sourceId, mode: 'snapshot', referenceDate: date });
  const activeGate = createCallGate({
    store: createProviderCallStore(prisma, { sourceId, syncRunId: runId }),
    limits: deps.limits,
    fetch: deps.fetch,
    sleep: deps.sleep,
    now: deps.now,
  });
  gate = activeGate;
  const logger = deps.logger.child({ runId, mode: 'snapshot', referenceDate: date });

  try {
    const pending = new Set<string>();
    const unitErrors: string[] = [];
    let unitsWritten = 0;
    let authFailed = false;

    for (const metric of METRICS) {
      const unit = `snapshot:${metric}:${date}`;
      await startCheckpoint(prisma, runId, unit);
      try {
        const rows = await provider.fetchDay(date, metric);
        const day = aggregateDay(rows, await loadAliases(prisma, sourceId));
        await prisma.$transaction(async (tx) => {
          await insertPendingAliases(tx, sourceId, day.pendingNames);
          await upsertDailyStats(tx, { sourceId, metric, statDate: date, values: day.stats });
          await completeCheckpoint(tx, runId, unit);
        });
        for (const name of day.pendingNames) {
          pending.add(name);
        }
        unitsWritten += 1;
        logger.info(
          {
            unit,
            countries: day.stats.length,
            pendingNames: day.pendingNames,
            ignoredNames: day.ignoredNames,
          },
          'unit done',
        );
      } catch (error) {
        const message = errorMessage(error);
        if (error instanceof ProviderPayloadError) {
          await activeGate.markLastInvalid();
        }
        await failCheckpoint(prisma, runId, unit, message);
        if (!isUnitError(error)) {
          throw error;
        }
        unitErrors.push(`${unit}: ${message}`);
        logger.error({ unit, error: message }, 'unit failed');
        if (error instanceof ProviderAuthError) {
          authFailed = true;
          break;
        }
        if (error instanceof BudgetExhaustedError) {
          break;
        }
      }
    }

    if (unitsWritten > 0) {
      await refreshGlobalDailyStat(prisma);
    }

    const pendingNames = [...pending].sort();
    const notes = [...unitErrors];
    if (pendingNames.length > 0) {
      notes.push(`aliases pendentes: ${pendingNames.join(', ')}`);
    }
    const status: RunStatus =
      authFailed || unitsWritten === 0 ? 'failed' : notes.length > 0 ? 'partial' : 'success';
    const callsUsed = await finishRun(prisma, runId, {
      status,
      error: notes.length > 0 ? notes.join('; ') : null,
    });
    logger.info({ status, callsUsed, pendingNames }, 'snapshot finished');
    return { runId, status, callsUsed, pendingNames };
  } catch (error) {
    await finishRun(prisma, runId, { status: 'failed', error: errorMessage(error) });
    throw error;
  }
}
```

`api/src/jobs/sync/run-sync.ts`:

```ts
import { tryAcquireSyncLock } from '../../repositories/sync-lock.repository.js';
import { failOrphanRuns } from '../../repositories/sync-run.repository.js';
import { runSnapshot, type SnapshotDeps, type SyncResult } from './run-snapshot.js';

export class SyncLockedError extends Error {
  constructor() {
    super('Another sync is running (advisory lock held)');
    this.name = 'SyncLockedError';
  }
}

export interface RunSyncDeps extends SnapshotDeps {
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
    }
    return await runSnapshot(deps);
  } finally {
    await lock.release();
  }
}
```

`api/src/jobs/sync/cli.ts`:

```ts
import { loadSyncEnv } from '../../config/sync-env.js';
import { createLogger } from '../../lib/logger.js';
import { createPrisma } from '../../lib/prisma.js';
import { createProvider } from '../../providers/create-provider.js';
import { UsageError, parseSyncArgs, type SyncMode } from './cli-args.js';
import { SyncLockedError, runSync } from './run-sync.js';

async function main(): Promise<number> {
  let mode: SyncMode;
  try {
    ({ mode } = parseSyncArgs(process.argv.slice(2)));
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(error.message);
      return 2;
    }
    throw error;
  }

  const env = loadSyncEnv();
  const logger = createLogger(env.LOG_LEVEL);
  if (mode === 'full') {
    logger.error('mode=full is not available yet (phase F5)');
    return 2;
  }

  const prisma = createPrisma(env.DATABASE_URL_SYNC);
  try {
    const result = await runSync({
      prisma,
      lockUrl: env.DATABASE_URL_SYNC,
      createProvider: (fetch) => createProvider(env, fetch),
      fetch,
      limits: { perHour: env.SYNC_CALLS_PER_HOUR, perMonth: env.SYNC_CALLS_PER_MONTH },
      logger,
    });
    logger.info(result, 'sync finished');
    return result.status === 'failed' ? 1 : 0;
  } catch (error) {
    if (error instanceof SyncLockedError) {
      logger.error(error.message);
      return 1;
    }
    logger.fatal({ err: error }, 'sync crashed');
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'sync failed');
  process.exitCode = 1;
}
```

Em `api/package.json`, acrescente depois de `"db:seed"`:

```json
    "sync": "tsx --env-file-if-exists=.env src/jobs/sync/cli.ts"
```

(lembre da vírgula no fim da linha do `db:seed`).

- [ ] **Step 3: Run the tests to verify they pass**

Run: `npm test -w api -- cli-args` → PASS.
Run: `npm run test:integration -w api` → PASS (inclusive os 9 testes de `snapshot.test.ts`).

Sem tocar na rede, só o caminho de uso:

```bash
npm run sync -w api; echo "exit=$?"
```

Expected: imprime `missing --mode` e o uso, `exit=2`. **Não rode com `--mode=snapshot`.**

- [ ] **Step 4: Verify and commit**

Run (na raiz): `./node_modules/.bin/prettier --write api && npm run lint && npm run typecheck && npm test && npm run build`

```bash
git add api/src/jobs/sync api/tests/unit/jobs/sync/cli-args.test.ts api/tests/integration/snapshot.test.ts api/package.json
git commit -m "feat: run the snapshot sync from the cli"
```

---

### Task 8: ADR 0004 e CLAUDE.md

**Files:**
- Create: `docs/adr/0004-sync-job.md`
- Modify: `CLAUDE.md` (editado à mão; está no `.prettierignore`)

- [ ] **Step 1: Write the ADR**

`docs/adr/0004-sync-job.md`:

```markdown
# ADR 0004 — Job de sincronização: lock, status, orçamento e aliases

- Status: aceito
- Data: 2026-10-19

## Contexto

A F2 criou o modo snapshot do job (`npm run sync -w api -- --mode=snapshot`). Ele chama a API Ninjas, que tem cota limitada (3.000 chamadas/mês, 100/hora). Precisávamos decidir como evitar dois syncs ao mesmo tempo, como recuperar um run que ficou em `running` depois de um crash, como contar o orçamento, como fechar o status do run e onde fica a curadoria dos nomes da fonte.

Uma chamada real autorizada (2026-10-19) confirmou que a série termina em `2023-03-09` (D-02) e que os 201 nomes de país da fonte batem com os aliases tirados da tabela da JHU.

## Decisão

- **Lock:** o job segura `pg_try_advisory_lock(1835102320)` numa conexão `pg` própria durante todo o run. Sem o lock, outro sync está rodando e o novo sai com código 1. Com o lock, qualquer `sync_run` em `running` é de um processo morto e vira `failed` com o erro "interrompido: o processo anterior terminou sem fechar o run". O lock de sessão morre com a conexão, então um crash não deixa trava.
- **Status do run:** `failed` quando a fonte rejeita a chave (401/403) ou quando nenhuma unidade gravou; `partial` quando alguma unidade teve erro (payload inválido, 5xx/timeout depois de 3 tentativas, orçamento esgotado) ou algum nome ficou `pending`; `success` no resto. O CLI sai com 0 em `success`/`partial` e com 1 em `failed`.
- **Orçamento:** antes de cada tentativa, o `CallGate` conta as linhas de `provider_call` da fonte na última hora (limite `SYNC_CALLS_PER_HOUR=90`) e desde o dia 1 do mês calendário UTC (limite `SYNC_CALLS_PER_MONTH=3000`). Cada tentativa, inclusive retentativa, conta e vira uma linha.
- **Retentativas:** timeout de 10 s; até 3 tentativas em 429, 5xx, timeout e erro de rede, com espera de 1 s e 2 s. 401/403 não repetem.
- **Aliases:** a curadoria fica em `api/prisma/seed/aliases.json`, versionado e revisado por PR. O `db:seed` aplica só o arquivo e não altera aliases fora dele. Nomes novos que o sync encontra entram como `pending` no banco e fecham o run como `partial` até alguém curar o arquivo.

## Consequências

- Um sync morto não bloqueia o próximo nem exige intervenção manual.
- Curar um alias exige um PR no `aliases.json` e um `db:seed`; o histórico fica no git.
- Se a API Ninjas contar o mês por outro ciclo (por exemplo, a partir da data de cadastro), o limite mensal pode ser ultrapassado perto da virada. O risco é baixo: o modo full deve gastar cerca de 400 chamadas.
- Os testes nunca chamam a fonte: o `fetch` global é bloqueado no Vitest e o job recebe um `fetch` injetado.
```

- [ ] **Step 2: Update `CLAUDE.md`**

Na seção "Estado atual":
- troque o bullet que começa com `- Pendências para a F2:` por estes dois:

```markdown
- F2 Snapshot concluída em 2026-10-19 (PR #3): provider `CovidProvider` da API Ninjas, `CallGate` (orçamento 90/h e mês calendário UTC, timeout de 10 s, 3 tentativas), soma de regiões (RN-02), modo snapshot com lock advisory e recuperação de run órfão, curadoria de aliases em `api/prisma/seed/aliases.json` (ADR 0004). Fixtures recortadas da chamada real em `api/tests/fixtures/api-ninjas` (o repositório é público e os termos proíbem armazenar os dados).
- Pergunta aberta para a F3 (regra de negócio, perguntar): a RN-06 define a data de referência como a "última data com dados para todos os países", mas a fonte nunca traz o Saara Ocidental (ESH). Considerar só os países presentes na fonte?
```

- no bullet `- Adiado com fase-alvo:`, apague o trecho `upsert em lote de \`daily_stat\` com \`updated_at = now()\` (o \`@updatedAt\` só vale pelo client) (F5); `. Ele foi feito na F2 (`upsertDailyStats`).

Na seção "Dados e fonte externa", logo depois do bullet `- API Ninjas: \`GET https://api.api-ninjas.com/v1/covid19\`...`, acrescente:

```markdown
- Série da API Ninjas: de 2020-01-22 a 2023-03-09 (D-02, confirmada com chamada real em 2026-10-19). Oito países vêm divididos em regiões (Austrália, Canadá, China, Dinamarca, França, Países Baixos, Nova Zelândia e Reino Unido).
```

Na seção "Decisões":
- em "Adotadas", troque a linha `- D-01 fonte de dados: API Ninjas (ADR 0002) · dois usuários de banco, o do sync é dono do schema (ADR 0003)` por:

```markdown
- D-01 fonte de dados: API Ninjas (ADR 0002) · dois usuários de banco, o do sync é dono do schema (ADR 0003) · D-02 a série termina em 2023-03-09 · job de sync: lock advisory, status, orçamento no mês UTC e aliases versionados (ADR 0004)
```

- em "Em aberto", apague a linha `- D-02 Data final da série: confirmar com uma chamada real na Fase 2, só com minha autorização.`

- [ ] **Step 3: Verify and commit**

Run (na raiz): `npm run lint && npm run typecheck && npm test`

```bash
git add docs/adr/0004-sync-job.md CLAUDE.md
git commit -m "docs: record the sync job decisions and close d-02"
```
