# Fase 0 — Fundação: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Monorepo `api` + `web` com ferramental de qualidade, PostgreSQL local e CI verde, sem regra de negócio.

**Architecture:** npm workspaces com ferramental compartilhado na raiz (ESLint flat config, Prettier, `tsconfig.base.json`). A `api` é Express 5 em ESM (NodeNext, `tsx` em dev, `tsc` no build) e expõe só `GET /health`. O `web` é React 19 + Vite com um placeholder testado por Vitest e Playwright. O Postgres roda em Docker Compose e o CI em GitHub Actions.

**Tech Stack:** Node 24, TypeScript ~6.0.3, Express 5.3, zod 4, pino 10, tsx, Vitest 5, Supertest 7, React 19.3, Vite 8, Testing Library, Playwright 1.64, ESLint 10 + typescript-eslint 8.72, Prettier 3, concurrently 10, Postgres 18.

**Spec:** `docs/superpowers/specs/2026-10-19-fase-0-fundacao-design.md` (leia junto com o `CLAUDE.md`).

## Global Constraints

- Node `>=24`; `.nvmrc` = `24`.
- TypeScript `~6.0.3` em todo workspace que o use: o `typescript-eslint` 8.72 exige `typescript >=4.8.4 <6.1.0`. Nunca instale `typescript@latest` (é a 7.x).
- ESM em todo o repositório (`"type": "module"`). Na `api` (NodeNext), todo import relativo termina em `.js` (ex.: `./app.js`), mesmo apontando para `.ts`.
- TypeScript `strict`, sem `any` (`@typescript-eslint/no-explicit-any: error`).
- Arquivos em `kebab-case`; componentes em `PascalCase`; variáveis de ambiente em `UPPER_SNAKE`.
- Código, nomes de arquivo e rotas em inglês; documentação em pt-BR.
- Prettier: `singleQuote: true`, `printWidth: 100`. Rode `npm run format` antes de cada commit.
- Um commit por tarefa, Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`), na branch `chore/foundation`.
- Nunca leia, imprima ou commite `.env`; só `.env.example` com valores falsos.
- Zero chamadas à fonte externa de dados (não existe nesta fase).
- Antes de declarar uma tarefa pronta: `npm run lint`, `npm run typecheck` e `npm test` verdes (a partir da Tarefa 2; na Tarefa 1 só `lint`).

## Mapa de arquivos

| Arquivo | Responsabilidade | Tarefa |
| --- | --- | --- |
| `package.json` | workspaces, scripts da raiz, devDeps de lint/format | 1, 6 |
| `.nvmrc`, `.editorconfig`, `.prettierrc.json`, `.prettierignore` | versão do Node e formatação | 1 |
| `tsconfig.base.json` | opções TS comuns | 1 |
| `eslint.config.js` | lint de todo o repo | 1 |
| `docs/adr/0001-monorepo-npm-workspaces.md` | ADR da fundação | 1 |
| `api/package.json`, `api/tsconfig*.json`, `api/vitest.config.ts` | scaffold da api | 2 |
| `api/src/config/env.ts` | schema zod + `loadEnv()` | 2 |
| `api/.env.example` | variáveis da api com valores falsos | 2 |
| `api/src/lib/logger.ts` | `createLogger()` pino | 3 |
| `api/src/routes/health.routes.ts` | `GET /health` | 3 |
| `api/src/app.ts` | `createApp()` | 3 |
| `api/src/server.ts` | bootstrap HTTP | 3 |
| `web/package.json`, `web/tsconfig*.json`, `web/vite.config.ts`, `web/index.html` | scaffold do web | 4 |
| `web/src/main.tsx`, `web/src/app/app.tsx`, `web/src/test/setup.ts` | placeholder + setup de teste | 4 |
| `web/playwright.config.ts`, `web/tests/e2e/smoke.spec.ts` | E2E | 5 |
| `docker-compose.yml`, `.env.example` | Postgres local | 6 |
| `.github/workflows/ci.yml` | CI | 7 |
| `CLAUDE.md` | seção "Estado atual" | 8 |

---

### Task 1: Ferramental da raiz

**Files:**
- Create: `package.json`, `.nvmrc`, `.editorconfig`, `.prettierrc.json`, `.prettierignore`, `tsconfig.base.json`, `eslint.config.js`, `docs/adr/0001-monorepo-npm-workspaces.md`
- Modify: nenhum (o `.gitignore` já existe na `main`)

**Interfaces:**
- Consumes: nada.
- Produces: scripts da raiz `lint`, `format`, `typecheck`, `test`, `build`; `tsconfig.base.json` estendido por `api` e `web`; `eslint.config.js` que já cobre `api/**/*.ts`, `web/src/**/*.{ts,tsx}`, `web/*.config.ts` e `web/tests/**/*.ts`.

- [ ] **Step 1: Criar a branch e commitar o plano**

```bash
git checkout -b chore/foundation
git add docs/superpowers
git commit -m "docs: add phase 0 implementation plan"
```

- [ ] **Step 2: Criar `.nvmrc`**

```text
24
```

- [ ] **Step 3: Criar `package.json` da raiz**

```json
{
  "name": "mapp",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "workspaces": ["api", "web"],
  "engines": {
    "node": ">=24"
  },
  "scripts": {
    "lint": "eslint . && prettier --check .",
    "format": "prettier --write .",
    "typecheck": "npm run typecheck --workspaces",
    "test": "npm run test --workspaces",
    "build": "npm run build --workspaces"
  }
}
```

- [ ] **Step 4: Instalar as devDependencies da raiz**

```bash
npm install -D typescript@~6.0.3 eslint @eslint/js typescript-eslint eslint-config-prettier eslint-plugin-react-hooks eslint-plugin-react-refresh globals prettier
```

Expected: instala sem erro de peer dependency e cria `package-lock.json`. Confirme `npx tsc -v` → `Version 6.0.x`.

- [ ] **Step 5: Criar `.editorconfig`**

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 6: Criar `.prettierrc.json` e `.prettierignore`**

`.prettierrc.json`:

```json
{
  "singleQuote": true,
  "printWidth": 100
}
```

`.prettierignore`:

```text
CLAUDE.md
docs/superpowers
package-lock.json
**/dist
**/coverage
web/playwright-report
web/test-results
web/blob-report
```

- [ ] **Step 7: Criar `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "moduleDetection": "force",
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 8: Criar `eslint.config.js`**

```js
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import { reactRefresh } from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '**/dist',
    '**/coverage',
    'web/playwright-report',
    'web/test-results',
    'web/blob-report',
  ]),
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['api/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['web/src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite()],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['web/*.config.ts', 'web/tests/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  prettier,
]);
```

- [ ] **Step 9: Criar `docs/adr/0001-monorepo-npm-workspaces.md`**

```markdown
# ADR 0001 — Monorepo com npm workspaces e ferramental na raiz

- Status: aceito
- Data: 2026-10-19

## Contexto

O Mapp tem um front (`web`) e um back (`api`) em TypeScript, mantidos por uma pessoa. O `CLAUDE.md` fixa npm workspaces e proíbe um app importar código do outro. Precisamos decidir como compartilhar lint, formatação e opções do compilador.

## Decisão

- Monorepo com npm workspaces `api` e `web`.
- ESM em todo o repositório. A `api` usa `module: NodeNext` (imports relativos com `.js`); o `web` usa `moduleResolution: Bundler` (Vite).
- Ferramental compartilhado na raiz: um `eslint.config.js` (typescript-eslint type-checked), um Prettier e um `tsconfig.base.json` estendido por cada workspace. Só configuração é compartilhada, nunca código de aplicação.
- TypeScript fixado em `~6.0.3` enquanto o typescript-eslint não suportar o TypeScript 7.
- Sem Turborepo/Nx.

## Consequências

- Uma regra de lint muda num lugar só e vale para os dois apps.
- Os scripts da raiz (`lint`, `typecheck`, `test`, `build`) repassam para os workspaces.
- Atualizar para o TypeScript 7 exige um novo ADR quando o typescript-eslint aceitar a versão.
- Se surgir um terceiro app ou build lento, reavaliar uma ferramenta de orquestração.
```

- [ ] **Step 10: Formatar e rodar o lint**

```bash
npm run format
npm run lint
```

Expected: `eslint .` sem erros (só há `eslint.config.js` para lintar) e `prettier --check .` com `All matched files use Prettier code style!`.

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json .nvmrc .editorconfig .prettierrc.json .prettierignore tsconfig.base.json eslint.config.js docs/adr
git commit -m "chore: add root workspace tooling"
```

---

### Task 2: Scaffold da api + validação de env

**Files:**
- Create: `api/package.json`, `api/tsconfig.json`, `api/tsconfig.build.json`, `api/vitest.config.ts`, `api/.env.example`, `api/src/config/env.ts`
- Test: `api/tests/unit/config/env.test.ts`

**Interfaces:**
- Consumes: `tsconfig.base.json` (Tarefa 1).
- Produces:
  - `export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent'`
  - `export type Env = { NODE_ENV: 'development' | 'test' | 'production'; PORT: number; LOG_LEVEL: LogLevel }`
  - `export function loadEnv(source?: NodeJS.ProcessEnv): Env` — lança `Error` cuja mensagem cita cada variável inválida.

- [ ] **Step 1: Criar `api/package.json`**

```json
{
  "name": "@mapp/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch --env-file-if-exists=.env src/server.ts",
    "build": "tsc -p tsconfig.build.json",
    "start": "node --env-file-if-exists=.env dist/server.js",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

- [ ] **Step 2: Instalar dependências da api**

```bash
npm install -w api express zod pino
npm install -w api -D typescript@~6.0.3 @types/node@^24 @types/express tsx vitest supertest @types/supertest
```

Expected: sem erros; dependências hoisted para `node_modules/` da raiz.

- [ ] **Step 3: Criar `api/tsconfig.json` e `api/tsconfig.build.json`**

`api/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node"],
    "noEmit": true
  },
  "include": ["src", "tests", "vitest.config.ts"]
}
```

`api/tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "rootDir": "src",
    "outDir": "dist",
    "sourceMap": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Criar `api/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 5: Escrever o teste que falha**

`api/tests/unit/config/env.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../../src/config/env.js';

describe('loadEnv', () => {
  it('applies defaults when variables are missing', () => {
    expect(loadEnv({})).toEqual({ NODE_ENV: 'development', PORT: 3333, LOG_LEVEL: 'info' });
  });

  it('coerces PORT to a number', () => {
    expect(loadEnv({ PORT: '4000' }).PORT).toBe(4000);
  });

  it.each(['abc', '0', '70000', '3.5'])('rejects PORT=%s', (port) => {
    expect(() => loadEnv({ PORT: port })).toThrow(/PORT/);
  });

  it('rejects an unknown LOG_LEVEL', () => {
    expect(() => loadEnv({ LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL/);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => loadEnv({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });
});
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `npm test -w api`
Expected: FAIL — `Failed to load url ../../../src/config/env.js` (arquivo ainda não existe).

- [ ] **Step 7: Implementar `api/src/config/env.ts`**

```ts
import { z } from 'zod';

const logLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3333),
  LOG_LEVEL: z.enum(logLevels).default('info'),
});

export type LogLevel = (typeof logLevels)[number];
export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
```

- [ ] **Step 8: Rodar e ver passar**

Run: `npm test -w api`
Expected: PASS — 8 testes (`it.each` gera 4).

- [ ] **Step 9: Criar `api/.env.example`**

```dotenv
# Copie para api/.env (nunca commite o .env). Valores de exemplo.
NODE_ENV=development
PORT=3333
LOG_LEVEL=info
```

- [ ] **Step 10: Verificar typecheck, build e lint**

```bash
npm run typecheck -w api
npm run build -w api
npm run format
npm run lint
```

Expected: tudo sem erro; `api/dist/config/env.js` gerado (ignorado pelo git).

Prova de que o lint pega `any`: crie `api/src/tmp-any.ts` com `export const x: any = 1;`, rode `npx eslint api/src/tmp-any.ts` → erro `@typescript-eslint/no-explicit-any`. Apague o arquivo.

- [ ] **Step 11: Commit**

```bash
git add api package.json package-lock.json
git commit -m "feat: scaffold api with validated environment config"
```

---

### Task 3: `GET /health`, `createApp()` e servidor

**Files:**
- Create: `api/src/lib/logger.ts`, `api/src/routes/health.routes.ts`, `api/src/app.ts`, `api/src/server.ts`
- Test: `api/tests/api/health.test.ts`

**Interfaces:**
- Consumes: `loadEnv(): Env` e `type LogLevel` de `api/src/config/env.ts` (Tarefa 2).
- Produces:
  - `export function createLogger(level: LogLevel): Logger` (`Logger` do pino)
  - `export const healthRouter: Router` — responde `GET /health` com `200 { status: 'ok' }`
  - `export function createApp(): Express` — monta o app sem abrir porta (usado pelos testes Supertest de todas as fases)

- [ ] **Step 1: Escrever o teste que falha**

`api/tests/api/health.test.ts`:

```ts
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';

describe('GET /health', () => {
  it('responds 200 with status ok', async () => {
    const response = await request(createApp()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('responds 404 for an unknown route', async () => {
    const response = await request(createApp()).get('/does-not-exist');

    expect(response.status).toBe(404);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w api`
Expected: FAIL — `Failed to load url ../../src/app.js`.

- [ ] **Step 3: Implementar a rota e o app**

`api/src/routes/health.routes.ts`:

```ts
import express from 'express';

export const healthRouter = express.Router();

healthRouter.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});
```

`api/src/app.ts`:

```ts
import express, { type Express } from 'express';
import { healthRouter } from './routes/health.routes.js';

export function createApp(): Express {
  const app = express();
  app.use(healthRouter);
  return app;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -w api`
Expected: PASS — 10 testes (8 de env + 2 de health).

- [ ] **Step 5: Implementar logger e servidor**

`api/src/lib/logger.ts`:

```ts
import { pino, type Logger } from 'pino';
import type { LogLevel } from '../config/env.js';

export function createLogger(level: LogLevel): Logger {
  return pino({ level });
}
```

`api/src/server.ts`:

```ts
import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createLogger } from './lib/logger.js';

function main(): void {
  const env = loadEnv();
  const logger = createLogger(env.LOG_LEVEL);

  createApp().listen(env.PORT, (error) => {
    if (error) {
      logger.fatal({ err: error }, 'failed to start api');
      process.exit(1);
    }
    logger.info({ port: env.PORT }, 'api listening');
  });
}

try {
  main();
} catch (error) {
  createLogger('info').fatal({ err: error }, 'failed to start api');
  process.exit(1);
}
```

- [ ] **Step 6: Verificar o servidor de verdade**

```bash
npm run dev -w api > /tmp/mapp-api.log 2>&1 &
sleep 3
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3333/health
curl -s http://localhost:3333/health
kill %1
PORT=abc npx tsx api/src/server.ts; echo "exit=$?"
```

Expected: `200`, depois `{"status":"ok"}`. O log JSON tem `"msg":"api listening"` e `"port":3333`. Com `PORT=abc`, sai um log `fatal` citando `PORT` e `exit=1`. Confirme com `ss -ltn | grep ':3333\b'` que nada ficou escutando; se ficou, encerre o processo pelo PID.

- [ ] **Step 7: Verificar typecheck, build e lint**

```bash
npm run typecheck -w api
npm run build -w api
node -e "import('./api/dist/app.js').then(m => console.log(typeof m.createApp))"
npm run format
npm run lint
```

Expected: sem erros; o `node -e` imprime `function` (prova que os imports `.js` funcionam no build).

- [ ] **Step 8: Commit**

```bash
git add api
git commit -m "feat: add api health endpoint and http server"
```

---

### Task 4: Scaffold do web com placeholder testado

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/tsconfig.app.json`, `web/tsconfig.node.json`, `web/vite.config.ts`, `web/index.html`, `web/src/main.tsx`, `web/src/app/app.tsx`, `web/src/test/setup.ts`
- Test: `web/src/app/app.test.tsx`

**Interfaces:**
- Consumes: `tsconfig.base.json` e `eslint.config.js` (Tarefa 1).
- Produces: componente `export function App()` em `web/src/app/app.tsx`, que renderiza `<h1>Mapp</h1>` (a Tarefa 5 procura esse heading); Vite na porta 5173 com `strictPort`; setup do Vitest com jest-dom e `cleanup` após cada teste.

- [ ] **Step 1: Criar `web/package.json`**

```json
{
  "name": "@mapp/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc -b",
    "test": "vitest run"
  }
}
```

- [ ] **Step 2: Instalar dependências do web**

```bash
npm install -w web react react-dom
npm install -w web -D typescript@~6.0.3 @types/node@^24 @types/react @types/react-dom vite @vitejs/plugin-react vitest jsdom @testing-library/react @testing-library/dom @testing-library/jest-dom
```

- [ ] **Step 3: Criar os tsconfigs**

`web/tsconfig.json`:

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }]
}
```

`web/tsconfig.app.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "lib": ["ES2023", "DOM"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "types": ["vite/client"],
    "noEmit": true
  },
  "include": ["src"]
}
```

`web/tsconfig.node.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node"],
    "noEmit": true
  },
  "include": ["vite.config.ts", "playwright.config.ts", "tests"]
}
```

- [ ] **Step 4: Criar `web/vite.config.ts` e o setup de teste**

`web/vite.config.ts`:

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
```

`web/src/test/setup.ts` (sem `globals` no Vitest, o Testing Library não limpa o DOM sozinho):

```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
```

- [ ] **Step 5: Escrever o teste que falha**

`web/src/app/app.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './app';

describe('App', () => {
  it('renders the Mapp heading and subtitle', () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: 'Mapp' })).toBeInTheDocument();
    expect(screen.getByText('Dashboard histórico de COVID-19')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `npm test -w web`
Expected: FAIL — `Failed to resolve import "./app"`.

- [ ] **Step 7: Implementar o App, o entrypoint e o HTML**

`web/src/app/app.tsx`:

```tsx
export function App() {
  return (
    <main>
      <h1>Mapp</h1>
      <p>Dashboard histórico de COVID-19</p>
    </main>
  );
}
```

`web/src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/app';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element #root not found');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`web/index.html`:

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Mapp — COVID-19</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 8: Rodar e ver passar**

Run: `npm test -w web`
Expected: PASS — 1 teste.

- [ ] **Step 9: Verificar typecheck, build, dev e lint**

```bash
npm run typecheck -w web
npm run build -w web
npm run dev -w web > /tmp/mapp-web.log 2>&1 &
sleep 3
curl -s http://localhost:5173 | grep -o '<title>.*</title>'
kill %1
npm run format
npm run lint
npm run typecheck && npm test
```

Expected: build gera `web/dist/`; o curl imprime `<title>Mapp — COVID-19</title>`; lint, typecheck e test da raiz (agora com os dois workspaces) verdes.

- [ ] **Step 10: Commit**

```bash
git add web package.json package-lock.json
git commit -m "feat: scaffold web app with placeholder page"
```

---

### Task 5: E2E com Playwright

**Files:**
- Create: `web/playwright.config.ts`, `web/tests/e2e/smoke.spec.ts`
- Modify: `web/package.json` (script `test:e2e`)

**Interfaces:**
- Consumes: heading `<h1>Mapp</h1>` do `App` e Vite na porta 5173 (Tarefa 4).
- Produces: `npm run test:e2e -w web`, que a F4 e a F8 vão estender.

- [ ] **Step 1: Instalar o Playwright e o Chromium**

```bash
npm install -w web -D @playwright/test
npx playwright install chromium
```

Expected: download do Chromium concluído. Se faltar biblioteca do sistema, o Playwright lista os pacotes; pare e peça ao usuário para rodar `! sudo npx playwright install-deps chromium`.

- [ ] **Step 2: Adicionar o script `test:e2e` em `web/package.json`**

O bloco `scripts` fica:

```json
{
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "typecheck": "tsc -b",
  "test": "vitest run",
  "test:e2e": "playwright test"
}
```

- [ ] **Step 3: Criar `web/playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !isCI,
  },
});
```

- [ ] **Step 4: Escrever o teste E2E**

`web/tests/e2e/smoke.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('home page shows the Mapp heading', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: 'Mapp' })).toBeVisible();
  await expect(page).toHaveTitle('Mapp — COVID-19');
});
```

- [ ] **Step 5: Rodar o E2E**

Run: `npm run test:e2e -w web`
Expected: `1 passed`.

Sanidade: troque temporariamente `'Mapp'` por `'Nope'` no `name` do teste, rode de novo, veja `1 failed` e desfaça a troca.

- [ ] **Step 6: Garantir que o Vitest ignora o E2E e que o resto segue verde**

```bash
npm test -w web
npm run format
npm run lint
npm run typecheck
```

Expected: Vitest roda só `src/app/app.test.tsx` (1 teste); lint e typecheck verdes (o `tsconfig.node.json` cobre `playwright.config.ts` e `tests/`).

- [ ] **Step 7: Commit**

```bash
git add web package.json package-lock.json
git commit -m "test: add playwright smoke test for web"
```

---

### Task 6: `npm run dev` na raiz e Postgres local

**Files:**
- Create: `docker-compose.yml`, `.env.example`
- Modify: `package.json` (script `dev` + devDependency `concurrently`)

**Interfaces:**
- Consumes: scripts `dev` da api (Tarefa 2) e do web (Tarefa 4).
- Produces: `npm run dev` sobe os dois; serviço `db` (Postgres 18) na porta do host `${POSTGRES_PORT:-5435}`, usuário/senha/banco `mapp` por padrão (a F1 monta o `DATABASE_URL` com isso).

- [ ] **Step 1: Instalar `concurrently` e adicionar o script `dev`**

```bash
npm install -D concurrently
```

O bloco `scripts` do `package.json` da raiz fica:

```json
{
  "dev": "concurrently -n api,web -c blue,green \"npm run dev -w api\" \"npm run dev -w web\"",
  "lint": "eslint . && prettier --check .",
  "format": "prettier --write .",
  "typecheck": "npm run typecheck --workspaces",
  "test": "npm run test --workspaces",
  "build": "npm run build --workspaces"
}
```

- [ ] **Step 2: Verificar `npm run dev`**

```bash
npm run dev > /tmp/mapp-dev.log 2>&1 &
sleep 5
curl -s -o /dev/null -w 'api %{http_code}\n' http://localhost:3333/health
curl -s -o /dev/null -w 'web %{http_code}\n' http://localhost:5173
kill %1
```

Expected: `api 200` e `web 200`; o log mostra linhas prefixadas `[api]` e `[web]`. Confirme com `ss -ltn | grep -E ':(3333|5173)\b'` que nada ficou escutando depois do `kill`; se ficou, encerre o processo pelo PID.

- [ ] **Step 3: Criar `docker-compose.yml`**

```yaml
name: mapp

services:
  db:
    image: postgres:18-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-mapp}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-mapp}
      POSTGRES_DB: ${POSTGRES_DB:-mapp}
    ports:
      - '${POSTGRES_PORT:-5435}:5432'
    volumes:
      - pgdata:/var/lib/postgresql
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U "$${POSTGRES_USER}" -d "$${POSTGRES_DB}"']
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  pgdata:
```

- [ ] **Step 4: Criar `.env.example` da raiz**

```dotenv
# Lido pelo docker compose. Copie para .env para mudar os padrões (nunca commite o .env).
# Valores de exemplo, só para o banco local.
POSTGRES_USER=mapp
POSTGRES_PASSWORD=mapp
POSTGRES_DB=mapp
POSTGRES_PORT=5435
```

- [ ] **Step 5: Subir e verificar o Postgres**

```bash
docker compose up -d
docker compose ps
docker compose exec db psql -U mapp -d mapp -c 'select version();'
docker compose stop
```

Expected: `docker compose ps` mostra `mapp-db-1` como `healthy` (repita até 30 s); o `psql` imprime `PostgreSQL 18.x`. O `stop` mantém o volume para a F1.

- [ ] **Step 6: Formatar, lint e commit**

```bash
npm run format
npm run lint
git add package.json package-lock.json docker-compose.yml .env.example
git commit -m "chore: add root dev script and local postgres"
```

---

### Task 7: CI no GitHub Actions + PR

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: scripts da raiz `lint`, `typecheck`, `test`, `build` e o `.nvmrc`.
- Produces: check `CI / Lint, typecheck, test, build` nos PRs e na `main`.

- [ ] **Step 1: Criar `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    name: Lint, typecheck, test, build
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

- [ ] **Step 2: Simular o CI localmente**

```bash
rm -rf node_modules api/node_modules web/node_modules
npm ci
npm run lint && npm run typecheck && npm test && npm run build
```

Expected: tudo verde a partir de uma instalação limpa.

- [ ] **Step 3: Formatar, commit e push**

```bash
npm run format
npm run lint
git add .github/workflows/ci.yml
git commit -m "chore: add ci workflow"
git push -u origin chore/foundation
```

- [ ] **Step 4: Abrir o PR**

```bash
gh pr create --base main --head chore/foundation \
  --title "chore: fase 0 — fundação do monorepo" \
  --body "$(cat <<'EOF'
## Resumo

Fase 0 do roteiro do `CLAUDE.md`: monorepo `api` + `web`, ferramental de qualidade, Postgres local e CI.

- Spec: `docs/superpowers/specs/2026-10-19-fase-0-fundacao-design.md`
- Plano: `docs/superpowers/plans/2026-10-19-fase-0-fundacao.md`
- ADR: `docs/adr/0001-monorepo-npm-workspaces.md`

## Critério de saída

- [x] `npm run dev` sobe api (3333) e web (5173)
- [x] `GET /health` → 200
- [x] `lint`, `typecheck`, `test` verdes localmente
- [ ] CI verde neste PR
EOF
)"
```

- [ ] **Step 5: Acompanhar o CI**

Run: `gh pr checks --watch`
Expected: `Lint, typecheck, test, build` → `pass`. Se falhar: `gh run view --log-failed`, corrija na branch com um commit `fix:` e repita. Não faça merge.

---

### Task 8: Fechar a fase

**Files:**
- Modify: `CLAUDE.md` (seção "Estado atual", bullets das linhas 10–11)

**Interfaces:**
- Consumes: tudo das Tarefas 1–7.
- Produces: estado do projeto documentado para a F1.

- [ ] **Step 1: Atualizar "Estado atual" no `CLAUDE.md`**

Substitua as duas linhas de tópico da seção por:

```markdown
- F0 Fundação concluída em 2026-10-19 (PR `chore/foundation`): monorepo `api` + `web`, ESLint/Prettier, Vitest, Playwright, Postgres 18 no Docker (porta do host 5435), CI.
- Pendências para a F1: `db:migrate`/`db:seed` (Prisma), usuários de banco de leitura e de sync, `DATABASE_URL`/`DATABASE_URL_SYNC` no env da api.
- TypeScript fixado em `~6.0.3` até o typescript-eslint suportar o TS 7 (ADR 0001).
- Ao terminar cada fase, atualize esta seção com a fase concluída e o que ficou pendente.
```

- [ ] **Step 2: Verificação final completa**

```bash
npm run lint && npm run typecheck && npm test && npm run build
npm run test:e2e -w web
git status --short
```

Expected: tudo verde; `git status` só mostra `CLAUDE.md` modificado.

- [ ] **Step 3: Commit, push e CI**

```bash
git add CLAUDE.md
git commit -m "docs: record phase 0 status in project guide"
git push
gh pr checks --watch
```

Expected: CI verde. Pare aqui e peça autorização ao usuário para o merge.
