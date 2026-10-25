# Fase 8a — Portões de qualidade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pôr no CI os portões de qualidade da F8 — teste de bundle, E2E com guarda de hosts externos, axe, Lighthouse, Dependabot e actions por SHA — e corrigir o que eles apontarem.

**Architecture:** As rotas da API mockada saem do `mockApi` do Playwright para um módulo compartilhado (`web/tests/e2e/api-routes.ts`), usado também por um servidor Node que o Lighthouse consulta. Uma fixture automática do Playwright liga o mock em todo teste e falha se a página tocar outro host. O CI ganha um job `e2e` (Playwright + axe + Lighthouse) e o job `quality` ganha o teste de bundle.

**Tech Stack:** Playwright 1.64, `@axe-core/playwright`, `@lhci/cli`, Vite 8 (`vite preview`), tsx, Node `http`, Vitest, GitHub Actions, Dependabot.

**Spec:** `docs/superpowers/specs/2026-10-25-fase-8a-portoes-de-qualidade-design.md`

## Global Constraints

- Conversa e documentação em pt-BR; código, nomes de arquivo e identificadores em inglês; textos da interface em pt-BR.
- TypeScript `strict`, sem `any`. Arquivos `kebab-case`.
- Testes e CI usam só fixtures inventadas; zero chamadas reais; nunca rodar `npm run sync`; nunca ler, imprimir ou commitar `.env` (o build do Lighthouse recebe as variáveis inline no script, não por arquivo `.env`).
- Lighthouse (mediana de 3 execuções, preset desktop, páginas `/` e `/paises/BRA`): Acessibilidade = 1, Boas práticas ≥ 0,9, SEO ≥ 0,9, Performance ≥ 0,8. Não baixar as notas para passar.
- axe: tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`; zero violações. Uma regra só pode ser desligada para um seletor específico, com o motivo num comentário e registro no "Adiado" do CLAUDE.md.
- Teste de bundle: falha se `web/dist/` contiver `api-ninjas.com`, `API_NINJAS_KEY` ou `X-Api-Key` (sem diferenciar maiúsculas).
- Actions fixadas por SHA com a versão em comentário; `SCARF_ANALYTICS: 'false'` no `env` dos workflows.
- Ordem de Tab dos marcadores continua por tamanho (decisão da spec).
- Antes de cada commit: `npm run lint`, `npm run typecheck` e `npm test` verdes na raiz; nas tarefas que mexem no E2E, também `npm run test:e2e -w web`. Um commit por tarefa, Conventional Commits em inglês.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `web/scripts/check-bundle.ts` (+ teste) | procura textos proibidos no build |
| `web/tests/e2e/api-routes.ts` | resposta da API mockada a partir das fixtures (Playwright e servidor) |
| `web/tests/e2e/mock-api.ts` (mod.) | `page.route` usando `api-routes`; tiles com PNG vazia; lista de hosts externos |
| `web/tests/e2e/test.ts` | `test`/`expect` com a fixture automática da guarda |
| `web/tests/e2e/*.spec.ts` (mod.) | passam a importar de `./test.js` |
| `web/tests/e2e/external-hosts.spec.ts` | prova que a guarda falha |
| `web/tests/e2e/a11y.spec.ts` | axe por página |
| `web/scripts/mock-api-server.ts` | servidor Node da API mockada para o Lighthouse |
| `web/lighthouserc.json` | coleta e notas mínimas do Lighthouse |
| `web/public/robots.txt`, `web/index.html` (mod.) | SEO |
| `.github/workflows/{ci,sync}.yml` (mod.), `.github/dependabot.yml` | CI e cadeia de suprimentos |
| `docs/adr/0008-quality-gates.md`, `CLAUDE.md` (mod.) | documentação |

---

### Task 1: Teste de bundle

**Files:**
- Create: `web/scripts/check-bundle.ts`
- Test: `web/scripts/check-bundle.test.ts`
- Modify: `web/package.json` (script `check:bundle`)
- Modify: `.github/workflows/ci.yml` (passo no job `quality`)

**Interfaces:**
- Produces: `FORBIDDEN: readonly string[]`; `findForbidden(dir: string): Promise<{ file: string; text: string }[]>` (arquivos relativos a `dir`); script `npm run check:bundle -w web` (lê `web/dist`, sai com 1 e lista os achados se houver algum).

- [ ] **Step 1: Escrever o teste que falha**

Crie `web/scripts/check-bundle.test.ts`:

```ts
// @vitest-environment node
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findForbidden } from './check-bundle';

describe('findForbidden', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'bundle-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('passes a clean build', async () => {
    await writeFile(path.join(dir, 'index.html'), '<script src="/assets/app.js"></script>');
    await mkdir(path.join(dir, 'assets'));
    await writeFile(path.join(dir, 'assets', 'app.js'), 'fetch("http://localhost:3333/api/v1/meta")');

    expect(await findForbidden(dir)).toEqual([]);
  });

  it('finds the source host, the key name and the key header in any file', async () => {
    await mkdir(path.join(dir, 'assets'));
    await writeFile(
      path.join(dir, 'assets', 'app.js'),
      'fetch("https://api.api-ninjas.com/v1/covid19",{headers:{"x-api-key":k}})',
    );
    await writeFile(path.join(dir, 'env.txt'), 'API_NINJAS_KEY=fake');

    expect(await findForbidden(dir)).toEqual([
      { file: path.join('assets', 'app.js'), text: 'api-ninjas.com' },
      { file: path.join('assets', 'app.js'), text: 'X-Api-Key' },
      { file: 'env.txt', text: 'API_NINJAS_KEY' },
    ]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w web -- scripts/check-bundle.test.ts`
Expected: FAIL (módulo `./check-bundle` inexistente).

- [ ] **Step 3: Implementar o script**

Crie `web/scripts/check-bundle.ts`:

```ts
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// The web bundle must never carry the data source's host or key (CLAUDE.md: only the sync job talks to the source).
export const FORBIDDEN: readonly string[] = ['api-ninjas.com', 'API_NINJAS_KEY', 'X-Api-Key'];

export async function findForbidden(dir: string): Promise<{ file: string; text: string }[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)))
    .sort();
  const found: { file: string; text: string }[] = [];
  for (const file of files) {
    const content = (await readFile(path.join(dir, file), 'utf8')).toLowerCase();
    for (const text of FORBIDDEN) {
      if (content.includes(text.toLowerCase())) found.push({ file, text });
    }
  }
  return found;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = path.resolve(process.argv[2] ?? 'dist');
  const found = await findForbidden(dir);
  if (found.length > 0) {
    for (const { file, text } of found) console.error(`${file}: contains "${text}"`);
    process.exit(1);
  }
  console.log(`Bundle check passed (${dir})`);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -w web -- scripts/check-bundle.test.ts`
Expected: PASS.

- [ ] **Step 5: Script e passo no CI**

Em `web/package.json`, nos `scripts`, depois de `"build"`: `"check:bundle": "tsx scripts/check-bundle.ts dist",`.

Em `.github/workflows/ci.yml`, no job `quality`, depois de `- run: npm run build`:

```yaml
      - run: npm run check:bundle -w web
```

Confira localmente: `npm run build -w web && npm run check:bundle -w web` → "Bundle check passed". Se falhar com um achado vindo de uma dependência legítima (não do código do Mapp), pare e reporte DONE_WITH_CONCERNS com o arquivo e o trecho, sem afrouxar a lista.

- [ ] **Step 6: Verificar e commitar**

```bash
npx prettier --write web/scripts/check-bundle.ts web/scripts/check-bundle.test.ts web/package.json .github/workflows/ci.yml
npm run lint && npm run typecheck && npm test
git add web/scripts/check-bundle.ts web/scripts/check-bundle.test.ts web/package.json .github/workflows/ci.yml
git commit -m "test: check that the web bundle has no source host or key"
```

---

### Task 2: E2E com guarda de hosts externos

**Files:**
- Create: `web/tests/e2e/api-routes.ts`
- Modify: `web/tests/e2e/mock-api.ts`
- Create: `web/tests/e2e/test.ts`
- Modify: `web/tests/e2e/{map,navigation,comparison,history}.spec.ts` (e qualquer outro `*.spec.ts` que use `mockApi`)
- Create: `web/tests/e2e/external-hosts.spec.ts`
- Modify: `web/playwright.config.ts`

**Interfaces:**
- Produces:
  - `api-routes.ts`: `CORS_HEADERS`, `BLANK_PNG: Buffer`, `interface ApiResponse { status: number; body: unknown }`, `resolveApi(url: URL): ApiResponse` (mesmas respostas do `handleApi` de hoje, sem o OPTIONS).
  - `mock-api.ts`: `mockApi(page: Page): Promise<string[]>` — atende `http://api.test` e `http://tiles.test` (PNG vazia), deixa passar `localhost`, aborta o resto e devolve a lista (viva) das URLs externas.
  - `test.ts`: `test` e `expect`; fixture automática `externalRequests` que liga o mock e falha no fim se a lista não estiver vazia.

- [ ] **Step 1: Módulo de rotas compartilhado**

Crie `web/tests/e2e/api-routes.ts` com a lógica de `handleApi` de `mock-api.ts`, devolvendo objetos em vez de chamar `route.fulfill`:

```ts
import {
  REFERENCE_DATE,
  SERIES_START,
  countryDetail,
  countryList,
  countrySeries,
  global,
  globalSeries,
  meta,
  rankings,
} from './fixtures.js';

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

// 1×1 transparent PNG served as every map tile.
export const BLANK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

export interface ApiResponse {
  status: number;
  body: unknown;
}

function error(status: number, code: string, message: string, details: unknown): ApiResponse {
  return { status, body: { error: { code, message, details, requestId: 'req-e2e' } } };
}

function countryNotFound(code: string): ApiResponse {
  return error(404, 'COUNTRY_NOT_FOUND', 'country not found', { code });
}

// Answers the API from the fixtures; shared by the Playwright mock and the Lighthouse server.
export function resolveApi(url: URL): ApiResponse {
  const path = url.pathname;
  if (path === '/api/v1/meta') return { status: 200, body: meta };
  if (path === '/api/v1/global') return { status: 200, body: global };
  const metric = url.searchParams.get('metric') === 'deaths' ? 'deaths' : 'cases';
  const from = url.searchParams.get('from') ?? SERIES_START;
  const to = url.searchParams.get('to') ?? REFERENCE_DATE;
  const rawGranularity = url.searchParams.get('granularity');
  const granularity =
    rawGranularity === 'week' || rawGranularity === 'month' ? rawGranularity : 'day';
  if (path === '/api/v1/countries') return { status: 200, body: countryList(metric) };
  if (path === '/api/v1/rankings') {
    return { status: 200, body: rankings(metric, Number(url.searchParams.get('limit') ?? '10')) };
  }
  if (path === '/api/v1/global/timeseries') {
    return { status: 200, body: globalSeries(metric, from, to, granularity) };
  }
  const series = /^\/api\/v1\/countries\/([^/]+)\/timeseries$/.exec(path);
  if (series?.[1]) {
    const code = decodeURIComponent(series[1]).toUpperCase();
    const body = countrySeries(code, metric, from, to, granularity);
    return body ? { status: 200, body } : countryNotFound(code);
  }
  const match = /^\/api\/v1\/countries\/([^/]+)$/.exec(path);
  if (match?.[1]) {
    const code = decodeURIComponent(match[1]).toUpperCase();
    const detail = countryDetail(code);
    return detail ? { status: 200, body: detail } : countryNotFound(code);
  }
  return error(404, 'NOT_FOUND', 'route not found', null);
}
```

Se o `mock-api.ts` atual tiver alguma rota ou detalhe que não aparece acima, preserve-o aqui — o comportamento do mock não muda.

- [ ] **Step 2: `mockApi` com tiles e lista de hosts externos**

Substitua `web/tests/e2e/mock-api.ts` inteiro por:

```ts
import type { Page } from '@playwright/test';
import { BLANK_PNG, CORS_HEADERS, resolveApi } from './api-routes.js';

const API_ORIGIN = 'http://api.test';
const TILES_ORIGIN = 'http://tiles.test';

// Serves the API and the tiles from fixtures. Every other host is aborted and recorded: the
// returned list is live, so the test fixture can check it after the test.
export async function mockApi(page: Page): Promise<string[]> {
  const external: string[] = [];
  await page.route('**/*', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === 'localhost') return route.continue();
    if (url.origin === TILES_ORIGIN) {
      return route.fulfill({ status: 200, contentType: 'image/png', body: BLANK_PNG });
    }
    if (url.origin === API_ORIGIN) {
      if (request.method() === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: CORS_HEADERS });
      }
      const { status, body } = resolveApi(url);
      return route.fulfill({
        status,
        contentType: 'application/json',
        headers: CORS_HEADERS,
        body: JSON.stringify(body),
      });
    }
    external.push(url.href);
    return route.abort();
  });
  return external;
}
```

- [ ] **Step 3: Fixture automática**

Crie `web/tests/e2e/test.ts`:

```ts
import { expect, test as base } from '@playwright/test';
import { mockApi } from './mock-api.js';

// Every test runs against the mocked API and fails if the page tried to reach any other host.
export const test = base.extend<{ externalRequests: string[] }>({
  externalRequests: [
    async ({ page }, use) => {
      const external = await mockApi(page);
      await use(external);
      expect(external, 'requests to external hosts').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
```

- [ ] **Step 4: Specs usam a fixture**

Em cada `web/tests/e2e/*.spec.ts` que hoje faz

```ts
import { expect, test } from '@playwright/test';
import { mockApi } from './mock-api.js';

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});
```

troque esse bloco por `import { expect, test } from './test.js';` (mantenha outros imports, como `type Page`). Confirme com `grep -rn "mockApi\|@playwright/test" web/tests/e2e/*.spec.ts` que nenhum spec chama `mockApi` nem importa `test` direto do `@playwright/test`.

- [ ] **Step 5: Prova da guarda**

Crie `web/tests/e2e/external-hosts.spec.ts`:

```ts
import { test } from './test.js';

test('fails when the page calls an external host', async ({ page }) => {
  // The fixture's check runs after the body; this test passes only if that check fails.
  test.fail();
  await page.goto('/sobre');
  await page.evaluate(async () => {
    await fetch('https://example.com/').catch(() => undefined);
  });
});
```

- [ ] **Step 6: Reporter e retries no CI**

Em `web/playwright.config.ts`, troque `retries: isCI ? 2 : 0,` e `reporter: 'list',` por:

```ts
  // One retry in CI: a test that only passes on the second try shows up as flaky in the report.
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
```

(o `trace: 'on-first-retry'` e o `VITE_TILES_URL: 'http://tiles.test/…'` já existem.)

- [ ] **Step 7: Rodar o E2E**

Run: `npm run test:e2e -w web`
Expected: todos passam (14: os 13 de antes + a prova da guarda, que conta como passou por ser `test.fail()`). Se algum teste antigo falhar por um host externo de verdade, investigue de onde vem a requisição e reporte — não acrescente o host à lista de permitidos sem motivo. A instabilidade conhecida ("trocar o período" e a Groenlândia na primeira carga fria) pode aparecer uma vez; rode de novo e registre no relatório.

- [ ] **Step 8: Verificar e commitar**

```bash
npx prettier --write web/tests/e2e web/playwright.config.ts
npm run lint && npm run typecheck && npm test
npm run test:e2e -w web
git add web/tests/e2e web/playwright.config.ts
git commit -m "test: fail the E2E suite when the page calls an external host"
```

---

### Task 3: axe nas páginas e menu no celular

**Files:**
- Modify: `web/package.json`, `package-lock.json` (`@axe-core/playwright` em devDependencies)
- Create: `web/tests/e2e/a11y.spec.ts`
- Modify: `web/tests/e2e/navigation.spec.ts` (menu no celular)
- Modify: `web/src/features/ranking/ranking-table.tsx` e o que mais o axe apontar

**Interfaces:**
- Consumes: `test`/`expect` de `web/tests/e2e/test.ts` (Task 2).

- [ ] **Step 1: Instalar o axe**

```bash
npm install -D -w web @axe-core/playwright
```

- [ ] **Step 2: Escrever os testes de acessibilidade**

Crie `web/tests/e2e/a11y.spec.ts`:

```ts
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './test.js';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const violations = results.violations.map((violation) => ({
    rule: violation.id,
    targets: violation.nodes.map((node) => node.target.join(' ')),
  }));
  expect(violations).toEqual([]);
}

test('the world view', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Crescimento acumulado' })).toContainText(
    'Casos acumulados de',
  );
  await expect(page.getByRole('button', { name: /^Brasil:/ })).toBeVisible();
  await expectNoViolations(page);
});

test('a country', async ({ page }) => {
  await page.goto('/paises/BRA');
  await expect(page.getByRole('region', { name: 'Novos por dia' })).toContainText(
    'Novos casos (Brasil)',
  );
  await expect(page.getByRole('region', { name: 'Brasil' })).toContainText('300.000');
  await expectNoViolations(page);
});

test('a country with the marker popup open', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Brasil:/ }).click();
  await expect(page.locator('.leaflet-popup')).toContainText('Casos acumulados de 22/01/2020');
  await expectNoViolations(page);
});

test('the about page', async ({ page }) => {
  await page.goto('/sobre');
  await expect(page.getByText(/Natural Earth — contornos/)).toBeVisible();
  await expectNoViolations(page);
});

test('the 404 page', async ({ page }) => {
  await page.goto('/nada-aqui');
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
  await expectNoViolations(page);
});

test('an unknown country', async ({ page }) => {
  await page.goto('/paises/XYZ');
  await expect(page.getByText('País não encontrado: XYZ')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Crescimento acumulado' })).toContainText(
    'Casos acumulados de',
  );
  await expectNoViolations(page);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the open menu', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Alternar menu lateral' }).click();
    await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible();
    await expectNoViolations(page);
  });
});
```

Acrescente ao fim de `web/tests/e2e/navigation.spec.ts`:

```ts
test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the menu opens, navigates and closes', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Alternar menu lateral' }).click();
    const menu = page.getByRole('dialog', { name: 'Menu' });

    await menu.getByRole('link', { name: 'Sobre' }).click();

    await expect(page).toHaveURL(/\/sobre$/);
    await expect(menu).toBeHidden();
  });
});
```

- [ ] **Step 3: Rodar e ver o que o axe aponta**

Run: `npm run test:e2e -w web -- a11y.spec.ts navigation.spec.ts`
Expected: os testes do axe falham listando `rule` e `targets`. Guarde a saída completa no relatório (é a evidência RED).

- [ ] **Step 4: Corrigir o `aria-labelledby` repetido do ranking**

Em `web/src/features/ranking/ranking-table.tsx`, a região (`SectionCard`) e a tabela usam o mesmo `aria-labelledby={TITLE_ID}`. Tire o `aria-labelledby` do `<Table>` (a região já dá o nome). Ajuste os testes que buscarem a tabela pelo nome (`grep -rn "getByRole('table'" web/src web/tests`), se houver, para buscar dentro da região.

- [ ] **Step 5: Corrigir o restante que o axe apontar**

Para cada violação restante, corrija na origem, com a menor mudança possível, preferindo marcação semântica a ARIA. Casos prováveis e a correção esperada:

- `color-contrast` em texto: troque a classe de cor por um token com contraste AA no tema claro (por exemplo `text-muted-foreground` → `text-foreground/80` só onde o axe apontar), sem mudar o resto do visual.
- `aria-hidden-focus`, `button-name`, `link-name`: dê nome acessível ou tire do Tab o que não deve estar.
- `definition-list`/`dlitem` no card Geral (`web/src/features/stats/global-card.tsx`): mantenha `dt`/`dd` agrupados em `div` direto dentro do `dl`.
- `landmark-*`/`region` só aparecem se a tag `best-practice` for usada; com as tags WCAG acima, não entram.

Elementos de terceiros que você não controla (Leaflet, componentes gerados do shadcn): se a correção exigir editar o componente gerado ou mudar o visual, desligue a regra **só para aquele seletor** com `new AxeBuilder({ page }).withTags(WCAG_TAGS).exclude('<seletor>')` dentro de `expectNoViolations` (ou `.disableRules([...])` se for uma regra inteira num único lugar), com um comentário dizendo por quê, e anote o item para o "Adiado" no relatório (a Task 5 o leva para o CLAUDE.md).

Rode de novo até o `a11y.spec.ts` e o `navigation.spec.ts` passarem.

- [ ] **Step 6: Verificar e commitar**

```bash
npx prettier --write web/tests/e2e web/src
npm run lint && npm run typecheck && npm test
npm run test:e2e -w web
git add web/package.json package-lock.json web/tests/e2e web/src
git commit -m "test: run axe on every page and fix what it found"
```

---

### Task 4: Lighthouse

**Files:**
- Modify: `web/package.json`, `package-lock.json` (`@lhci/cli` em devDependencies; scripts)
- Create: `web/scripts/mock-api-server.ts`
- Create: `web/lighthouserc.json`
- Create: `web/public/robots.txt`
- Modify: `web/index.html`
- Modify: `.gitignore`, `.prettierignore`, `eslint.config.js` (ignorar `web/.lighthouseci` e `web/dist-lighthouse`)

**Interfaces:**
- Consumes: `resolveApi`, `CORS_HEADERS`, `BLANK_PNG` de `web/tests/e2e/api-routes.ts` (Task 2).
- Produces: `npm run lighthouse -w web` (build com o mock + `lhci autorun`); relatórios em `web/.lighthouseci/`.

- [ ] **Step 1: Instalar**

```bash
npm install -D -w web @lhci/cli
```

- [ ] **Step 2: Servidor da API mockada**

Crie `web/scripts/mock-api-server.ts`:

```ts
import { createServer } from 'node:http';
import { BLANK_PNG, CORS_HEADERS, resolveApi } from '../tests/e2e/api-routes.js';

const PORT = 5181;

// Serves the E2E fixtures as the API and blank map tiles, so Lighthouse measures the
// production build without the real API or any external host.
createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://localhost:${PORT}`);
  if (request.method === 'OPTIONS') {
    response.writeHead(204, CORS_HEADERS).end();
    return;
  }
  if (url.pathname.startsWith('/tiles/')) {
    response.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'image/png' }).end(BLANK_PNG);
    return;
  }
  const { status, body } = resolveApi(url);
  response
    .writeHead(status, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    .end(JSON.stringify(body));
}).listen(PORT, () => {
  console.log(`Mock API on http://localhost:${PORT}`);
});
```

- [ ] **Step 3: Scripts**

Em `web/package.json`, nos `scripts`:

```json
    "build:lighthouse": "VITE_API_URL=http://localhost:5181 VITE_TILES_URL='http://localhost:5181/tiles/{z}/{x}/{y}.png' VITE_TILES_ATTRIBUTION='&copy; Tiles de teste' vite build --outDir dist-lighthouse",
    "serve:lighthouse": "concurrently -k -n mock,web \"tsx scripts/mock-api-server.ts\" \"vite preview --outDir dist-lighthouse --port 4173 --strictPort\"",
    "lighthouse": "npm run build:lighthouse && lhci autorun",
```

(`concurrently` já está nas devDependencies da raiz.)

- [ ] **Step 4: Configuração do Lighthouse CI**

Crie `web/lighthouserc.json`:

```json
{
  "ci": {
    "collect": {
      "startServerCommand": "npm run serve:lighthouse",
      "startServerReadyPattern": "Local",
      "url": ["http://localhost:4173/", "http://localhost:4173/paises/BRA"],
      "numberOfRuns": 3,
      "settings": {
        "preset": "desktop",
        "chromeFlags": "--no-sandbox --headless=new"
      }
    },
    "assert": {
      "aggregationMethod": "median-run",
      "assertions": {
        "categories:accessibility": ["error", { "minScore": 1 }],
        "categories:best-practices": ["error", { "minScore": 0.9 }],
        "categories:seo": ["error", { "minScore": 0.9 }],
        "categories:performance": ["error", { "minScore": 0.8 }]
      }
    },
    "upload": {
      "target": "filesystem",
      "outputDir": ".lighthouseci"
    }
  }
}
```

- [ ] **Step 5: SEO básico**

Crie `web/public/robots.txt` (o `vite preview` responde `index.html` para caminhos desconhecidos, e o Lighthouse reprova um robots.txt que é HTML):

```text
User-agent: *
Allow: /
```

Em `web/index.html`, depois da meta `viewport`:

```html
    <meta
      name="description"
      content="Dashboard histórico de COVID-19: mapa-múndi, casos e mortes por país e no mundo, ranking e gráficos."
    />
```

- [ ] **Step 6: Ignorar os artefatos**

- `.gitignore`, na seção "Build e cobertura": `dist-lighthouse/` e `web/.lighthouseci/`.
- `.prettierignore`: `**/dist-lighthouse` e `web/.lighthouseci`.
- `eslint.config.js`, no `globalIgnores`: `'**/dist-lighthouse'` e `'web/.lighthouseci'`.

- [ ] **Step 7: Rodar o Lighthouse**

Run: `npm run lighthouse -w web`
Se não houver Chrome instalado na máquina, use o Chromium do Playwright:
`CHROME_PATH=$(node -e "import('@playwright/test').then((m) => console.log(m.chromium.executablePath()))") npm run lighthouse -w web`.

Expected: as asserções passam nas duas páginas. Anote no relatório as notas medianas de cada categoria nas duas páginas.

- Se Acessibilidade, Boas práticas ou SEO ficarem abaixo, corrija o que o relatório (`web/.lighthouseci/*.html` ou a saída do `lhci`) apontar, com a menor mudança, e rode de novo.
- Se só a Performance ficar abaixo de 0,8 e a causa for o tamanho do JavaScript (Leaflet/Recharts), **não** baixe a nota e não divida o bundle aqui: pare e reporte DONE_WITH_CONCERNS com as notas e os principais itens de "Opportunities".

- [ ] **Step 8: Verificar e commitar**

```bash
npx prettier --write web/scripts/mock-api-server.ts web/lighthouserc.json web/package.json web/index.html .gitignore .prettierignore eslint.config.js
npm run lint && npm run typecheck && npm test
npm run test:e2e -w web
git add web/scripts/mock-api-server.ts web/lighthouserc.json web/package.json package-lock.json web/public/robots.txt web/index.html .gitignore .prettierignore eslint.config.js
git commit -m "test: measure the production build with Lighthouse"
```

(Inclua no `git add` os arquivos que a correção de alguma nota tiver tocado.)

---

### Task 5: CI, Dependabot e documentação

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/sync.yml`
- Create: `.github/dependabot.yml`
- Create: `docs/adr/0008-quality-gates.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `npm run test:e2e -w web` (Tasks 2–3), `npm run lighthouse -w web` (Task 4), `npm run check:bundle -w web` (Task 1).

- [ ] **Step 1: Descobrir os SHAs das actions**

Rode e guarde o SHA de cada tag:

```bash
gh api repos/actions/checkout/commits/v7.0.1 --jq .sha
gh api repos/actions/setup-node/commits/v7.1.0 --jq .sha
gh api repos/actions/upload-artifact/commits/v7.0.2 --jq .sha
```

(São as versões mais recentes de cada major na data deste plano. Se `gh api repos/<repo>/releases/latest --jq .tag_name` mostrar outra versão do mesmo major, use a mais recente e ajuste o comentário.)

- [ ] **Step 2: `ci.yml`**

Em `.github/workflows/ci.yml`:

1. Depois do bloco `concurrency`, acrescente:

```yaml
env:
  # Turns off the telemetry of @scarf/scarf (a dependency of swagger-ui-express).
  SCARF_ANALYTICS: 'false'
```

2. Troque todo `uses: actions/checkout@v7` por `uses: actions/checkout@<SHA do checkout> # v7.0.1` e todo `uses: actions/setup-node@v7` por `uses: actions/setup-node@<SHA do setup-node> # v7.1.0`.
3. Acrescente o job (depois de `integration`):

```yaml
  e2e:
    name: E2E, axe e Lighthouse
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@<SHA do checkout> # v7.0.1
        with:
          persist-credentials: false
      - uses: actions/setup-node@<SHA do setup-node> # v7.1.0
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
        working-directory: web
      - run: npm run test:e2e -w web
      - run: npm run lighthouse -w web
      - if: failure()
        uses: actions/upload-artifact@<SHA do upload-artifact> # v7.0.2
        with:
          name: playwright-report
          path: web/playwright-report/
          retention-days: 7
      - if: ${{ !cancelled() }}
        uses: actions/upload-artifact@<SHA do upload-artifact> # v7.0.2
        with:
          name: lighthouse
          path: web/.lighthouseci/
          retention-days: 7
```

(substitua `<SHA do …>` pelos SHAs completos do Step 1.)

- [ ] **Step 3: `sync.yml`**

Em `.github/workflows/sync.yml`, fixe `actions/checkout` e `actions/setup-node` pelos mesmos SHAs (com o comentário da versão) e acrescente o mesmo `env: SCARF_ANALYTICS: 'false'` no nível do workflow (se já houver um `env:` no topo, só acrescente a chave).

- [ ] **Step 4: Dependabot**

Crie `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    groups:
      minor-and-patch:
        update-types: [minor, patch]
    ignore:
      # TypeScript stays on 6.x until typescript-eslint supports 7 (ADR 0001).
      - dependency-name: typescript
        update-types: ['version-update:semver-major']
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
    groups:
      actions-minor-and-patch:
        update-types: [minor, patch]
```

- [ ] **Step 5: ADR 0008**

Crie `docs/adr/0008-quality-gates.md` no formato dos ADRs existentes (leia `docs/adr/0007-front-shadcn-tailwind.md` para o formato: título, Status, Contexto, Decisão, Consequências), em pt-BR, com:

- **Contexto:** F8 do roteiro ("metas verdes no CI"); até a F7 o E2E só rodava localmente e nada media acessibilidade nem desempenho.
- **Decisão:**
  - job `quality` com o teste de bundle (`npm run check:bundle -w web`: `api-ninjas.com`, `API_NINJAS_KEY`, `X-Api-Key`);
  - job `e2e`: Playwright (1 retry no CI, reporter `github` + `html`, trace no retry, relatório como artefato na falha), axe com as tags WCAG 2.1 A/AA e zero violações em todas as páginas, popup aberto e menu do celular, e a guarda de hosts externos (fixture automática em `web/tests/e2e/test.ts`);
  - Lighthouse (`@lhci/cli`) no build de produção servido pelo `vite preview`, com a API e os tiles de um mock Node que lê as fixtures do E2E (`web/tests/e2e/api-routes.ts`), mediana de 3 execuções, preset desktop, `/` e `/paises/BRA`: Acessibilidade 1, Boas práticas ≥ 0,9, SEO ≥ 0,9, Performance ≥ 0,8;
  - Dependabot semanal (npm e actions, minor/patch agrupados, major do TypeScript ignorado) e actions fixadas por SHA;
  - telemetria do scarf desligada nos workflows.
- **Consequências:** o CI demora mais (job `e2e` com Chromium e 6 execuções do Lighthouse); regra do axe só se desliga por seletor e com motivo; a nota de Performance varia por máquina e, se oscilar, a divisão do bundle entra na F8b; o mock do Lighthouse e o do Playwright compartilham as rotas.

- [ ] **Step 6: CLAUDE.md**

1. Em "Estado atual", depois da linha da F7, acrescente (troque `#11` pelo número real se `gh pr list --state all --limit 1 --json number --jq '.[0].number'` não devolver 10):

```markdown
- F8a Portões de qualidade concluída em 2026-10-25 (PR #11): teste de bundle no CI (sem host nem chave da fonte), E2E no CI com guarda de hosts externos (1 retry, relatório e trace como artefato), axe WCAG 2.1 A/AA sem violações em todas as páginas (popup aberto e menu do celular incluídos), Lighthouse no build de produção com API mockada (Acessibilidade 100, Boas práticas e SEO ≥ 90, Performance ≥ 80), Dependabot, actions fixadas por SHA e telemetria do scarf desligada no CI (ADR 0008). A F8b (pendências de comportamento e testes) vem a seguir.
```

2. No item "Adiado com fase-alvo", tire o que a F8a resolveu:
   - `reporter/trace do Playwright e E2E no CI, actions fixadas por SHA + Dependabot (F8)` — remova;
   - `telemetria do @scarf/scarf (dependência do swagger-ui-express) desligada no CI e no deploy, e WEB_ORIGIN validado com new URL(v).origin === v (F8/F9)` — reescreva como `telemetria do @scarf/scarf desligada no deploy e WEB_ORIGIN validado com new URL(v).origin === v (F9)` (mantendo as crases do original);
   - `E2E do front no CI e axe nas páginas (F8)` — remova;
   - em "front:", remova `ordem de Tab dos marcadores por tamanho`, `dt`/`dd` do card Geral e `guarda no E2E que falhe se algum host externo for chamado`;
   - em "Da F6b (F8):", remova `landmarks para o axe (cabeçalho da sidebar e faixa de dados fora de landmark)`, `E2E do menu no celular` e `aria-labelledby repetido na tabela do ranking`;
   - acrescente, se a Task 3 desligou alguma regra do axe, o item correspondente (seletor, regra e motivo) com fase-alvo F8b.
   Ajuste a pontuação para a frase continuar bem formada.
3. Em "Comandos", depois de `npm run test:e2e -w web`, acrescente:

```bash
npm run check:bundle -w web               # depois do build: o bundle não pode ter host nem chave da fonte
npm run lighthouse -w web                 # build com API mockada + Lighthouse CI (notas mínimas do ADR 0008)
```

4. Em "Decisões" → "Adotadas", no fim da última linha, acrescente: ` · marcadores na ordem de Tab por tamanho, igual ao desenho; a busca dá acesso por nome (F8a) · portões de qualidade no CI (ADR 0008)`.

- [ ] **Step 7: Verificar e commitar**

```bash
npx prettier --write .github CLAUDE.md docs/adr/0008-quality-gates.md
npm run lint && npm run typecheck && npm test
git add .github CLAUDE.md docs/adr/0008-quality-gates.md
git commit -m "ci: run E2E, axe and Lighthouse; pin actions; add Dependabot"
```

O CI só roda de verdade no push; a verificação dos três jobs verdes fica para o PR.
