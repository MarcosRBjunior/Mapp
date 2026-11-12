# Fase 9 — Deploy: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o código e a documentação prontos para publicar o banco no Neon, a API como função na Vercel e o front na Vercel.

**Architecture:** A montagem do app sai do `server.ts` para `api/src/bootstrap.ts`, usado pelo servidor local e pela função `api/api/index.ts`. O banco ganha a checagem `db:check`, o leitor com verificador SCRAM e o seed em lote, aplicados pelo workflow manual `db.yml`. O front trata env faltando e mostra a fonte fixa no rodapé até o `/meta` chegar.

**Tech Stack:** Express 5, Prisma 7 + `@prisma/adapter-pg`, zod, Vitest + Supertest, React 19 + Vite, MSW, GitHub Actions, Vercel, Neon.

**Spec:** `docs/superpowers/specs/2026-11-11-fase-9-deploy-design.md` (seções 1, 2, 3 e 5; a seção 4, operação, roda depois do merge e fica fora deste plano).

## Global Constraints

- Prosa e documentação em pt-BR; código, nomes de arquivos e identificadores em inglês.
- TypeScript `strict`, sem `any`; ESLint + Prettier verdes.
- Nenhuma dependência nova.
- Nunca ler, imprimir ou commitar `.env`; `.env.example` só com valores falsos.
- Testes e CI só com fixtures; zero chamadas reais (o setup `tests/setup/no-network.ts` bloqueia rede).
- Um commit por tarefa, Conventional Commits.
- Node 24: `source ~/.nvm/nvm.sh && nvm use` antes de qualquer `npm`.
- Antes de terminar: `npm run lint && npm run typecheck && npm test`, `npm run test:integration -w api` e `npm run test:e2e -w web`.
- Actions fixadas por SHA: `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`, `actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0`.

---

### Task 1: Leitor com verificador SCRAM no `db:roles`

**Files:**
- Create: `api/prisma/scram.ts`
- Modify: `api/prisma/roles.ts`
- Test: `api/tests/unit/prisma/scram.test.ts`, `api/tests/integration/database.test.ts`

**Interfaces:**
- Produces: `scramSha256Verifier(password: string, salt?: Buffer, iterations?: number): string`.

- [ ] **Step 1: Teste unitário (falha)** — `api/tests/unit/prisma/scram.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { scramSha256Verifier } from '../../../prisma/scram.js';

describe('scramSha256Verifier', () => {
  it('matches an independently computed verifier', () => {
    // Computed with Python's hashlib (PBKDF2-HMAC-SHA256, 4096 iterations).
    const salt = Buffer.from('W22ZaJ0SNY7soEsUEjb6gQ==', 'base64');
    expect(scramSha256Verifier('pencil', salt, 4096)).toBe(
      'SCRAM-SHA-256$4096:W22ZaJ0SNY7soEsUEjb6gQ==$WG5d8oPm3OtcPnkdi4Uo7BkeZkBFzpcXkuLmtbsT4qY=:wfPLwcE6nTWhTAmQ7tl2KeoiWGPlZqQxSrmfPwDl2dU=',
    );
  });

  it('uses a random 16-byte salt and 4096 iterations by default', () => {
    const first = scramSha256Verifier('secret');
    const second = scramSha256Verifier('secret');
    expect(first).toMatch(/^SCRAM-SHA-256\$4096:[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{43}=:[A-Za-z0-9+/]{43}=$/);
    expect(first).not.toBe(second);
  });

  it('rejects passwords outside printable ASCII (SASLprep is not implemented)', () => {
    expect(() => scramSha256Verifier('senha-çã')).toThrow(/printable ASCII/);
  });
});
```

- [ ] **Step 2:** `npx vitest run --root api tests/unit/prisma/scram.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: Implementação** — `api/prisma/scram.ts`:

```ts
import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';

const PRINTABLE_ASCII = /^[\x20-\x7e]+$/;

// The verifier Postgres stores for SCRAM-SHA-256 (same format as its own password hashing), so
// CREATE/ALTER ROLE never carries the password itself. SASLprep is skipped: ASCII-only passwords.
export function scramSha256Verifier(
  password: string,
  salt: Buffer = randomBytes(16),
  iterations = 4096,
): string {
  if (!PRINTABLE_ASCII.test(password)) {
    throw new Error('Reader password must be printable ASCII');
  }
  const salted = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  const clientKey = createHmac('sha256', salted).update('Client Key').digest();
  const storedKey = createHash('sha256').update(clientKey).digest();
  const serverKey = createHmac('sha256', salted).update('Server Key').digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`;
}
```

- [ ] **Step 4:** em `api/prisma/roles.ts`, importar `scramSha256Verifier` e trocar `password: reader.password,` por:

```ts
    // Only the SCRAM verifier reaches the server (and any statement log), never the password.
    password: scramSha256Verifier(reader.password),
```

- [ ] **Step 5: Integração** — em `api/tests/integration/database.test.ts`, dentro do `describe` principal, adicionar (ajustando o import de `pg` se preciso):

```ts
  it('creates the reader with a SCRAM verifier that accepts the original password', async () => {
    const stored = await owner.query<{ rolpassword: string }>(
      "SELECT rolpassword FROM pg_authid WHERE rolname = 'mapp_api'",
    );
    expect(stored.rows[0]?.rolpassword).toMatch(/^SCRAM-SHA-256\$4096:/);
    const reader = new pg.Client({ connectionString: urls.readerUrl });
    await reader.connect();
    try {
      expect((await reader.query('SELECT 1 AS ok')).rows).toEqual([{ ok: 1 }]);
    } finally {
      await reader.end();
    }
  });
```

(usar o client dono e as `urls` já definidos no arquivo; se o arquivo usar outros nomes, adaptar aos existentes.)

- [ ] **Step 6:** `npx vitest run --root api tests/unit/prisma` e `npm run test:integration -w api` → PASS.
- [ ] **Step 7:** `git commit -m "feat: create the reader role from a SCRAM verifier"`.

### Task 2: `db:check` e workflow `db.yml`

**Files:**
- Create: `api/prisma/db-check.ts`, `api/prisma/check.ts`, `.github/workflows/db.yml`
- Modify: `api/package.json` (script `db:check`)
- Test: `api/tests/unit/prisma/db-check.test.ts`, `api/tests/integration/database.test.ts`

**Interfaces:**
- Produces: `evaluateDatabase(facts: DatabaseFacts): CheckResult`, `REQUIRED_COLLATION = 'pt-BR-x-icu'`, script `npm run db:check -w api`.

- [ ] **Step 1: Teste unitário (falha)** — `api/tests/unit/prisma/db-check.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { evaluateDatabase } from '../../../prisma/db-check.js';

describe('evaluateDatabase', () => {
  it('passes Postgres 18 with the ICU collation', () => {
    expect(evaluateDatabase({ versionNum: 180001, hasIcuCollation: true })).toEqual({
      errors: [],
      warnings: [],
    });
  });

  it('fails without the pt-BR-x-icu collation', () => {
    expect(evaluateDatabase({ versionNum: 180001, hasIcuCollation: false }).errors).toEqual([
      'collation "pt-BR-x-icu" not found: rankings and country lists sort with it (the server needs ICU)',
    ]);
  });

  it('warns, without failing, before Postgres 18', () => {
    expect(evaluateDatabase({ versionNum: 170005, hasIcuCollation: true })).toEqual({
      errors: [],
      warnings: [
        'Postgres older than 18 (server_version_num 170005): measure /rankings and /countries again and consider an index on daily_stat (source_id, stat_date)',
      ],
    });
  });
});
```

- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** `api/prisma/db-check.ts`:

```ts
export const REQUIRED_COLLATION = 'pt-BR-x-icu';
// Postgres 18 skip scan keeps the ranking queries on the current daily_stat index.
export const SKIP_SCAN_VERSION_NUM = 180000;

export interface DatabaseFacts {
  versionNum: number;
  hasIcuCollation: boolean;
}

export interface CheckResult {
  errors: string[];
  warnings: string[];
}

export function evaluateDatabase(facts: DatabaseFacts): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!facts.hasIcuCollation) {
    errors.push(
      `collation "${REQUIRED_COLLATION}" not found: rankings and country lists sort with it (the server needs ICU)`,
    );
  }
  if (facts.versionNum < SKIP_SCAN_VERSION_NUM) {
    warnings.push(
      `Postgres older than 18 (server_version_num ${facts.versionNum}): measure /rankings and /countries again and consider an index on daily_stat (source_id, stat_date)`,
    );
  }
  return { errors, warnings };
}
```

- [ ] **Step 4:** `api/prisma/check.ts`:

```ts
import pg from 'pg';
import { postgresUrl } from '../src/config/db-env.js';
import { createLogger } from '../src/lib/logger.js';
import { evaluateDatabase, REQUIRED_COLLATION } from './db-check.js';

const logger = createLogger('info');
const url = postgresUrl.safeParse(process.env.DATABASE_URL_SYNC);
if (!url.success) {
  logger.fatal('DATABASE_URL_SYNC must be a postgres:// or postgresql:// URL');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url.data });
await client.connect();
try {
  const { rows } = await client.query<{ version_num: number; has_collation: boolean }>(
    `SELECT current_setting('server_version_num')::int AS version_num,
            EXISTS (SELECT 1 FROM pg_collation WHERE collname = $1) AS has_collation`,
    [REQUIRED_COLLATION],
  );
  const row = rows[0];
  if (!row) throw new Error('database check returned no row');
  const result = evaluateDatabase({ versionNum: row.version_num, hasIcuCollation: row.has_collation });
  for (const warning of result.warnings) logger.warn(warning);
  for (const error of result.errors) logger.error(error);
  if (result.errors.length > 0) process.exitCode = 1;
  else logger.info({ versionNum: row.version_num }, 'database check passed');
} finally {
  await client.end();
}
```

- [ ] **Step 5:** em `api/package.json`, depois de `db:generate`: `"db:check": "tsx --env-file-if-exists=.env prisma/check.ts",`.
- [ ] **Step 6: Integração** — em `database.test.ts`:

```ts
  it('passes db:check on the test database', () => {
    expect(() =>
      execFileSync('npm', ['run', 'db:check'], { env: scriptEnv(urls), stdio: 'pipe' }),
    ).not.toThrow();
  });
```

- [ ] **Step 7:** `.github/workflows/db.yml`:

```yaml
name: Database

# Manual only: checks the production database, then applies migrations, the reader role and the seed.
# All steps are idempotent. Needs the production environment secrets (F9, ADR 0010).
on:
  workflow_dispatch:

permissions:
  contents: read

env:
  # Turns off the telemetry of @scarf/scarf (a dependency of swagger-ui-express).
  SCARF_ANALYTICS: 'false'

concurrency:
  group: database
  cancel-in-progress: false

jobs:
  database:
    name: Check, migrate and seed
    runs-on: ubuntu-latest
    timeout-minutes: 15
    environment: production
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      # Secrets live only in the steps that use them, so install scripts never see them.
      - run: npm run db:check -w api
        env:
          DATABASE_URL_SYNC: ${{ secrets.DATABASE_URL_SYNC }}
      - run: npm run db:migrate -w api
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          DATABASE_URL_SYNC: ${{ secrets.DATABASE_URL_SYNC }}
      - run: npm run db:seed -w api
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          DATABASE_URL_SYNC: ${{ secrets.DATABASE_URL_SYNC }}
```

- [ ] **Step 8:** testes unitários e de integração → PASS; `npx prettier --check .github/workflows/db.yml`.
- [ ] **Step 9:** `git commit -m "feat: add the database check and the manual database workflow"`.

### Task 3: Seed em lote

**Files:**
- Modify: `api/prisma/seed/seed.ts`
- Test: os testes existentes `api/tests/integration/database.test.ts` e `seed-aliases.test.ts` (idempotência, aliases fora do arquivo mantidos, curados restaurados).

- [ ] **Step 1:** trocar o laço de `tx.country.upsert` por um comando:

```ts
      // One statement per table instead of one upsert per row: the seed also runs far from the database (db.yml).
      await tx.$executeRaw`
        INSERT INTO country (code, name, kind, lat, lng, population)
        SELECT * FROM unnest(
          ${countries.map((c) => c.code)}::text[],
          ${countries.map((c) => c.name)}::text[],
          ${countries.map((c) => c.kind)}::text[]::country_kind[],
          ${countries.map((c) => c.lat)}::float8[],
          ${countries.map((c) => c.lng)}::float8[],
          ${countries.map((c) => (c.population === null ? null : String(c.population)))}::bigint[]
        )
        ON CONFLICT (code) DO UPDATE SET
          name = EXCLUDED.name, kind = EXCLUDED.kind, lat = EXCLUDED.lat,
          lng = EXCLUDED.lng, population = EXCLUDED.population`;
```

- [ ] **Step 2:** trocar o laço de `tx.countryAlias.upsert` (por fonte) por:

```ts
        // Only the curated file is applied; aliases outside it (e.g. pending ones) stay untouched.
        await tx.$executeRaw`
          INSERT INTO country_alias (source_id, source_name, country_code, status)
          SELECT ${source.id}, t.name, t.code, t.status::alias_status
          FROM unnest(
            ${aliases.map((a) => a.sourceName)}::text[],
            ${aliases.map((a) => a.countryCode)}::text[],
            ${aliases.map((a) => a.status)}::text[]
          ) AS t(name, code, status)
          ON CONFLICT (source_id, source_name) DO UPDATE SET
            country_code = EXCLUDED.country_code, status = EXCLUDED.status`;
```

As fontes (2 linhas) continuam com `upsert`.

- [ ] **Step 3:** `npm run test:integration -w api` → PASS (88+ testes).
- [ ] **Step 4:** `git commit -m "perf: seed countries and aliases in batches"`.

### Task 4: Env da API — `TRUST_PROXY`, `WEB_ORIGIN` e pool

**Files:**
- Modify: `api/src/config/env.ts`, `api/src/app.ts`, `api/src/lib/prisma.ts`, `api/tests/helpers/test-app.ts`, `api/src/server.ts` (passar `trustProxy`)
- Test: `api/tests/unit/config/env.test.ts`, `api/tests/api/trust-proxy.test.ts`

**Interfaces:**
- Produces: `Env.TRUST_PROXY: number`; `AppDeps.trustProxy: number`; `createTestApp(options?: FakeOptions & { trustProxy?: number })`.

- [ ] **Step 1: Testes (falham)** — em `env.test.ts`, incluir `TRUST_PROXY: 0` nos objetos esperados dos testes de padrão e adicionar:

```ts
  it('reads TRUST_PROXY as a hop count', () => {
    expect(loadEnv({ ...REQUIRED, TRUST_PROXY: '1' }).TRUST_PROXY).toBe(1);
  });

  it.each(['-1', 'yes', '1.5'])('rejects TRUST_PROXY=%s', (value) => {
    expect(() => loadEnv({ ...REQUIRED, TRUST_PROXY: value })).toThrow(/TRUST_PROXY/);
  });

  it.each([
    'http://localhost:5173/',
    'https://mapp.vercel.app/app',
    'HTTPS://Mapp.vercel.app',
    'https://mapp.vercel.app:443',
    'http://localhost:99999',
  ])('rejects a non-normalized WEB_ORIGIN %s', (value) => {
    expect(() => loadEnv({ ...REQUIRED, WEB_ORIGIN: value })).toThrow(/WEB_ORIGIN/);
  });
```

`api/tests/api/trust-proxy.test.ts`:

```ts
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/test-app.js';

async function exhaust(app: ReturnType<typeof createTestApp>, ip: string): Promise<void> {
  for (let i = 0; i < 120; i += 1) {
    await request(app).get('/api/unknown').set('X-Forwarded-For', ip);
  }
}

describe('trust proxy', () => {
  it('counts the rate limit per X-Forwarded-For client behind one proxy', async () => {
    const app = createTestApp({ trustProxy: 1 });
    await exhaust(app, '203.0.113.1');

    expect((await request(app).get('/api/unknown').set('X-Forwarded-For', '203.0.113.1')).status).toBe(429);
    expect((await request(app).get('/api/unknown').set('X-Forwarded-For', '203.0.113.2')).status).toBe(404);
  });

  it('ignores X-Forwarded-For without a trusted proxy', async () => {
    const app = createTestApp();
    await exhaust(app, '203.0.113.1');

    expect((await request(app).get('/api/unknown').set('X-Forwarded-For', '203.0.113.2')).status).toBe(429);
  });
});
```

- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** `env.ts` — adicionar ao schema:

```ts
  // Proxies in front of the api (Vercel: 1), so req.ip and the rate limit see the client.
  TRUST_PROXY: z.preprocess(
    emptyAsUndefined,
    z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(0).max(10)).default(0),
  ),
```

e no `WEB_ORIGIN`, depois do `.regex(...)`:

```ts
    .refine((value) => {
      try {
        return new URL(value).origin === value;
      } catch {
        return false;
      }
    }, 'must be a normalized origin, exactly as browsers send it (lowercase, no default port)'),
```

- [ ] **Step 4:** `app.ts` — `AppDeps` ganha `trustProxy: number;` e, depois de `app.set('etag', false);`:

```ts
  app.set('trust proxy', deps.trustProxy);
```

`test-app.ts`:

```ts
export function createTestApp(options: FakeOptions & { trustProxy?: number } = {}): Express {
  const { trustProxy = 0, ...fakeOptions } = options;
  return createApp({
    services: createServices(createFakeRepositories(fakeOptions), 'api_ninjas'),
    logger: createLogger('silent'),
    webOrigin: TEST_WEB_ORIGIN,
    trustProxy,
  });
}
```

`server.ts`: passar `trustProxy: env.TRUST_PROXY` (será movido para o bootstrap na Task 5).

- [ ] **Step 5:** `lib/prisma.ts`:

```ts
// Short idle timeout: a paused serverless instance must not hold connections on the database pooler.
const IDLE_TIMEOUT_MS = 5_000;

export function createPrisma(connectionString: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString, idleTimeoutMillis: IDLE_TIMEOUT_MS }),
  });
}
```

- [ ] **Step 6:** `npm run typecheck -w api && npx vitest run --root api` → PASS.
- [ ] **Step 7:** `git commit -m "feat: configure trust proxy and validate the web origin strictly"`.

### Task 5: Bootstrap e função da Vercel

**Files:**
- Create: `api/src/bootstrap.ts`, `api/api/index.ts`, `api/vercel.json`
- Modify: `api/src/server.ts`, `api/tsconfig.json` (incluir `api`), `.gitignore` (`.vercel/`)
- Test: `api/tests/api/vercel-entry.test.ts`

**Interfaces:**
- Consumes: `Env.TRUST_PROXY`, `AppDeps.trustProxy` (Task 4).
- Produces: `createRuntime(env: Env): Runtime` com `Runtime = { app: Express; prisma: PrismaClient; logger: Logger }`; `api/api/index.ts` com `export default app`.

- [ ] **Step 1: Teste (falha)** — `api/tests/api/vercel-entry.test.ts`:

```ts
import type { Express } from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('Vercel function entry', () => {
  it('exports the app built from the environment', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://reader:secret@127.0.0.1:5435/mapp');
    vi.stubEnv('WEB_ORIGIN', 'https://mapp.example.app');
    vi.stubEnv('LOG_LEVEL', 'silent');

    const { default: app } = (await import('../../api/index.js')) as { default: Express };
    const response = await request(app).get('/health').set('Origin', 'https://mapp.example.app');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['access-control-allow-origin']).toBe('https://mapp.example.app');
  });

  it('fails to load with an invalid environment', async () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('WEB_ORIGIN', 'https://mapp.example.app');

    await expect(import('../../api/index.js')).rejects.toThrow(/Invalid environment variables/);
  });
});
```

- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** `api/src/bootstrap.ts`:

```ts
import type { Express } from 'express';
import type { Logger } from 'pino';
import { createApp } from './app.js';
import type { Env } from './config/env.js';
import type { PrismaClient } from './generated/prisma/client.js';
import { createLogger } from './lib/logger.js';
import { createPrisma } from './lib/prisma.js';
import { createReadRepositories } from './repositories/read-repositories.js';
import { createServices } from './services/create-services.js';

export interface Runtime {
  app: Express;
  prisma: PrismaClient;
  logger: Logger;
}

// Shared by the local server (server.ts) and the Vercel function (api/index.ts).
export function createRuntime(env: Env): Runtime {
  const logger = createLogger(env.LOG_LEVEL);
  const prisma = createPrisma(env.DATABASE_URL);
  const services = createServices(createReadRepositories(prisma), env.DATA_PROVIDER);
  const app = createApp({
    services,
    logger,
    webOrigin: env.WEB_ORIGIN,
    trustProxy: env.TRUST_PROXY,
  });
  return { app, prisma, logger };
}
```

- [ ] **Step 4:** `server.ts` — `main()` passa a:

```ts
function main(): void {
  const env = loadEnv();
  const { app, prisma, logger } = createRuntime(env);
  const server = app.listen(env.PORT);
```

(o resto — listeners, `shutdown` — igual; remover imports que ficarem sem uso.)

- [ ] **Step 5:** `api/api/index.ts`:

```ts
import { createRuntime } from '../src/bootstrap.js';
import { loadEnv } from '../src/config/env.js';

// Vercel function (api/ is Vercel's folder for functions; vercel.json sends every path here).
// Built once per instance; an invalid environment fails the instance at load, like the server.
const { app } = createRuntime(loadEnv());

export default app;
```

- [ ] **Step 6:** `api/vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": null,
  "regions": ["gru1"],
  "functions": {
    "api/index.ts": {
      "includeFiles": "../node_modules/swagger-ui-dist/**"
    }
  },
  "rewrites": [{ "source": "/(.*)", "destination": "/api" }],
  "ignoreCommand": "git diff --quiet HEAD^ HEAD -- . ../package-lock.json"
}
```

(O `includeFiles` e a compilação dos imports `.js` são conferidos com `vercel build` na operação, antes do primeiro deploy de produção; ajustar ali se o pacote não trouxer os estáticos do Swagger.)

- [ ] **Step 7:** `api/tsconfig.json`: adicionar `"api"` ao `include`. `.gitignore`: seção `# Vercel` com `.vercel/`.
- [ ] **Step 8:** `npm run lint && npm run typecheck && npx vitest run --root api` → PASS; `npm run dev -w api` sobe local e responde `/health` (parar em seguida).
- [ ] **Step 9:** `git commit -m "feat: run the api as a Vercel function"`.

### Task 6: Front — env faltando e `vercel.json`

**Files:**
- Create: `web/src/config/env-error.ts`, `web/vercel.json`
- Modify: `web/src/config/env.ts`, `web/src/main.tsx`
- Test: `web/src/config/env-error.test.ts`, `web/src/config/env.test.ts`

**Interfaces:**
- Produces: `class InvalidEnvError extends Error { readonly names: string[] }`; `showEnvError(root: HTMLElement, error: InvalidEnvError): void`.

- [ ] **Step 1: Testes (falham)** — `env-error.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { InvalidEnvError } from './env';
import { showEnvError } from './env-error';

describe('showEnvError', () => {
  it('writes the missing variable names as plain text', () => {
    const root = document.createElement('div');
    showEnvError(root, new InvalidEnvError(['VITE_API_URL', '<b>VITE_TILES_URL</b>']));

    const alert = root.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe(
      'Configuração incompleta: faltam VITE_API_URL, <b>VITE_TILES_URL</b>.',
    );
    expect(root.querySelector('b')).toBeNull();
  });
});
```

Em `env.test.ts`, no teste de variável faltando, verificar também `toThrow(InvalidEnvError)` e que `names` contém a variável.

- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** `env.ts` — adicionar e usar no `throw`:

```ts
export class InvalidEnvError extends Error {
  constructor(readonly names: string[]) {
    super(`Invalid web environment: ${names.join(', ')}`);
    this.name = 'InvalidEnvError';
  }
}
```

(`throw new InvalidEnvError(invalid);` no lugar do `throw new Error(...)`.)

- [ ] **Step 4:** `env-error.ts`:

```ts
import type { InvalidEnvError } from './env';

// Without React: a build missing VITE_* shows a message instead of a blank page.
export function showEnvError(root: HTMLElement, error: InvalidEnvError): void {
  const message = document.createElement('p');
  message.setAttribute('role', 'alert');
  message.style.padding = '1rem';
  message.textContent = `Configuração incompleta: faltam ${error.names.join(', ')}.`;
  root.replaceChildren(message);
}
```

- [ ] **Step 5:** `main.tsx` — trocar o `getEnv();` solto e o render por:

```tsx
const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element #root not found');
}

let envError: InvalidEnvError | null = null;
try {
  getEnv();
} catch (error) {
  if (!(error instanceof InvalidEnvError)) throw error;
  envError = error;
}

if (envError) {
  showEnvError(root, envError);
} else {
  createRoot(root).render(
    // (mesma árvore de hoje: StrictMode > QueryClientProvider > BrowserRouter > App)
  );
}
```

- [ ] **Step 6:** `web/vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
  "ignoreCommand": "git diff --quiet HEAD^ HEAD -- . ../package-lock.json"
}
```

(A Vercel serve os arquivos estáticos antes das rewrites; só rotas sem arquivo caem no `index.html`.)

- [ ] **Step 7:** `npx vitest run --root web --maxWorkers=2` → PASS; `npm run build -w web` sem variáveis `VITE_*` + `vite preview` mostra a mensagem (conferência manual rápida).
- [ ] **Step 8:** `git commit -m "feat: show a message when the web environment is incomplete"`.

### Task 7: Rodapé com a fonte fixa até o `/meta` (RN-10)

**Files:**
- Modify: `web/src/shared/ui/site-footer.tsx`
- Test: `web/src/shared/ui/site-footer.test.tsx`

- [ ] **Step 1: Testes (falham)** — acrescentar a `site-footer.test.tsx` (imports `http`, `HttpResponse`, `delay` de `msw`, `API` de `../../test/handlers`, `server` de `../../test/server`):

```tsx
const FALLBACK = 'Fonte: COVID-19 Data Repository by CSSE at Johns Hopkins University (CC BY 4.0)';

  it('shows the fixed JHU source while /meta loads', async () => {
    server.use(http.get(`${API}/api/v1/meta`, async () => { await delay('infinite'); }));
    renderWithProviders(<SiteFooter />);

    expect(screen.getByText(FALLBACK)).toBeInTheDocument();
  });

  it('keeps the fixed JHU source when /meta fails', async () => {
    server.use(http.get(`${API}/api/v1/meta`, () => new HttpResponse(null, { status: 500 })));
    renderWithProviders(<SiteFooter />);

    await waitFor(() => expect(screen.getByText(FALLBACK)).toBeInTheDocument());
  });
```

E no teste existente, depois do `findByText` do texto do `/meta`, `expect(screen.queryByText(FALLBACK)).not.toBeInTheDocument()`.

- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** `site-footer.tsx`:

```tsx
// RN-10: the source stays visible while /meta loads or fails (production reads JHU CSSE, ADR 0009).
const FALLBACK_SOURCE =
  'Fonte: COVID-19 Data Repository by CSSE at Johns Hopkins University (CC BY 4.0)';
```

e o primeiro `<p>`:

```tsx
      <p>
        {meta.data
          ? `Fonte: ${meta.data.source.name} (${meta.data.source.license}) · ${meta.data.source.attribution}`
          : FALLBACK_SOURCE}
      </p>
```

- [ ] **Step 4:** `npx vitest run --root web --maxWorkers=2`, `npm run build -w web && npm run check:bundle -w web` e `npm run test:e2e -w web` → PASS.
- [ ] **Step 5:** `git commit -m "feat: keep the source visible in the footer while /meta loads"`.

### Task 8: Documentação

**Files:**
- Create: `README.md`, `docs/adr/0010-hosting-neon-vercel.md`
- Modify: `docs/adr/0003-database-users.md`, `CLAUDE.md`, `api/.env.example`

- [ ] **Step 1: `api/.env.example`** — depois de `LOG_LEVEL`: comentário e `TRUST_PROXY=0` ("Proxies na frente da api; na Vercel, 1"); no bloco do banco, comentário: "Em produção (Neon): DATABASE_URL pelo host com pooler (-pooler); DATABASE_URL_SYNC pelo host direto (o lock advisory do sync precisa de sessão)."
- [ ] **Step 2: ADR 0010** (`docs/adr/0010-hosting-neon-vercel.md`, formato dos ADRs existentes: Status, Contexto, Decisão, Consequências) com: Neon `aws-sa-east-1` Postgres 18; API como função Vercel em `api/api/index.ts` com `framework: null` (motivo: precedência da detecção automática); `gru1`; front estático na Vercel com rewrite SPA; subdomínios `*.vercel.app` e previews sem API (CORS de uma origem); `DATABASE_URL` pooled × `DATABASE_URL_SYNC` direta; rate limit em memória aproximado por instância; `TRUST_PROXY=1`; `db.yml` manual; sync continua no GitHub Actions, nunca em função; leitor criado pelo `db:roles` porque roles do Neon entram em `neon_superuser`.
- [ ] **Step 3: ADR 0003** — seção "Atualização (2026-11-11, F9)": em produção o dono `mapp` é criado pelo Neon (membro de `neon_superuser`); o leitor continua criado pelo `db:roles`, agora com verificador SCRAM-SHA-256 calculado no cliente.
- [ ] **Step 4: README.md** (pt-BR), seções:
  1. **Mapp** — uma frase do que é + "Projeto 08 do Portfólio Boost Program"; links públicos (front, API, `/api/docs`) — preenchidos no PR final da operação; até lá, a linha "Links públicos: em breve".
  2. **Funcionalidades** — mapa clicável, cards Geral/Por país/Por tempo, gráficos, ranking, `/sobre`.
  3. **Stack e arquitetura** — monorepo `api` + `web`, camadas da api, sync por CLI/Actions, link para `docs/adr/`.
  4. **Rodar local** — `nvm use`, `docker compose up -d`, `npm install`, copiar `.env.example` de `api` e `web`, `db:migrate`, `db:seed`, `sync --mode=full` (JHU, 2 downloads), `npm run dev`.
  5. **Testes** — `lint`, `typecheck`, `test`, `test:integration`, `test:e2e`, `check:bundle`, `lighthouse`.
  6. **Deploy** — Neon (projeto `aws-sa-east-1`, dono `mapp`, banco `mapp`); GitHub environment `production` com `DATABASE_URL` (leitor, pooler) e `DATABASE_URL_SYNC` (dono, direto); `db.yml`; `sync.yml` (`full`); Vercel projeto `api` (raiz `api`, variáveis da spec seção 2) e projeto `web` (raiz `web`, variáveis da seção 3).
  7. **Dados e atribuição** — JHU CSSE CC BY 4.0, série até 09/03/2023, Natural Earth, tiles CARTO/OSM.
  8. **Limitações** — rate limit aproximado (por instância); previews de PR sem API; run que começa com o orçamento esgotado sai com código 1 (API Ninjas); `postinstall` roda `prisma generate`, que é devDependency (a Vercel e o `npm ci` instalam as devDependencies; `npm ci --omit=dev` quebra a instalação).
- [ ] **Step 5: CLAUDE.md**:
  - "Estado atual": linha "F9 Deploy — código pronto em 2026-11-11 (PR #N): …" (concluída só depois da operação; o PR final troca para "concluída" com as URLs).
  - "Adiado": remover os itens resolvidos (`NODE_ENV`/`trust proxy`; `postinstall`, seed em lote, `db:migrate`/`db:roles`, `ALTER ROLE`; `DATABASE_URL_SYNC` direta; collation ICU; scarf e `WEB_ORIGIN`; rodapé RN-10 e tela em branco; código de saída 1 no README; índice do ranking vira checagem no `db:check`) e renomear os itens "Da F8b (F9)" para "(F9b)".
  - "Arquitetura": "O job vive em `api/src/jobs/sync` … nunca dentro de função serverless." continua; acrescentar "Em produção a api HTTP roda como função na Vercel (`api/api/index.ts`, ADR 0010)."
  - "Comandos": `npm run db:check -w api` e `npm run lighthouse:mobile -w web`.
  - "Variáveis de ambiente": `TRUST_PROXY` na lista da api.
  - "Decisões": D-12 sai de "Em aberto" e entra nas adotadas: "D-12 hospedagem: Neon + Vercel, API em função, São Paulo (ADR 0010) · rate limit em memória aproximado por instância".
- [ ] **Step 6:** `npm run lint` (Prettier nos `.md`) → PASS.
- [ ] **Step 7:** `git commit -m "docs: document the deploy, hosting decision and phase 9 status"`.

---

## Depois do plano

Verificação completa (Global Constraints), push, PR, `gh pr checks --watch` e merge só com o OK do usuário. A operação (spec, seção 4) começa depois do merge, com o login do usuário nas CLIs; a primeira carga (`sync.yml` full) só com "pode" explícito.
