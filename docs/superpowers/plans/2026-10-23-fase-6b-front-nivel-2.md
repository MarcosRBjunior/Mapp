# Fase 6b — Front do Nível 2: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar o `web` para shadcn/ui + Tailwind v4 a partir do bloco `dashboard-01`, com período na URL, card Por tempo, ranking Top 10 e o E2E de saída da F6.

**Architecture:** O bloco `dashboard-01` entra pelo CLI do shadcn. As peças de demonstração saem e o casco do bloco vira o layout do app: `SidebarProvider` + `AppSidebar` + `SidebarInset` com `SiteHeader`. Os componentes de `src/components/ui` são código gerado e versionado. As features continuam em `src/features`, e as queries continuam em `src/shared/api/queries.ts`. O CSS da F4 sai; só ficam os ajustes do Leaflet.

**Tech Stack:** React 19, React Router 8, TanStack Query 5, shadcn CLI 4.22.1 (estilo `radix-nova`, base Radix, `lucide-react`, pacote `cn`), Tailwind CSS 4.3.3 com `@tailwindcss/vite`, React Leaflet 5, Vitest 5 + Testing Library + MSW 3, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-23-fase-6-nivel-2-design.md` (seção "F6b — Front" e "Testes da F6b").

## Global Constraints

- **Idioma e Git:**
  - conversa, documentação e textos da tela em pt-BR;
  - código, nomes e arquivos em inglês;
  - branch `feat/level-2-web` a partir de `main`, um commit por tarefa, Conventional Commits.
- **Segurança e escopo:**
  - nunca rode `npm run sync -w api`;
  - nunca leia, imprima ou commite `.env`;
  - não mexa em `api/`.
- **Testes:** só MSW e mocks do Playwright com números inventados. Zero chamadas à API real ou à fonte.
- **Verificação:**
  - antes de cada commit, `npm run lint`, `npm run typecheck` e `npm test` (raiz) verdes;
  - nas tarefas 1, 3, 4 e 7, também `npm run test:e2e -w web`.
- **Código:**
  - antes do lint, formate os arquivos tocados com `npx prettier --write <arquivos>` (o `npm run lint` roda `prettier --check`);
  - TypeScript `strict`, sem `any` e sem `as` além dos que este plano mostra;
  - arquivos `kebab-case`, componentes `PascalCase`, hooks `useAlgo`.
- **Imports:**
  - o alias `@/` (→ `web/src/`) serve só para a camada do shadcn: `@/components/ui/*`, `@/lib/utils`, `@/hooks/*`;
  - o resto continua com import relativo, como hoje.
- **Versões:**
  - CLI fixado: `npx shadcn@4.22.1`;
  - Tailwind: `tailwindcss@4.3.3` e `@tailwindcss/vite@4.3.3`, como devDependencies.
- **Visual:** só tema claro, o padrão do shadcn. Nada de `.dark` nem de alternância de tema.
- **Nomes acessíveis** (os testes e o E2E dependem deles):
  - regiões `Geral`, `Por país` (ou o nome do país), `Por tempo` e `Top 10 — {noun} em DD/MM/AAAA`;
  - combobox `Buscar país`;
  - grupos `Métrica` (rádios `Casos`, `Mortes`) e `Período` (rádios `7 dias`, `30 dias`, `90 dias`, `Tudo`);
  - navegação `Principal` com os links `Mapa` e `Sobre`;
  - `h1` `Mapp`.
- **URL:**
  - `?metric=` com padrão `cases`;
  - `?period=` com valores `7d`, `30d`, `90d` e `all`, padrão `30d`; valor inválido vale o padrão;
  - sem reescrever a URL ao ler o padrão.
- **Card Por tempo:**
  - `to` = `coverage.to` (a data de referência);
  - `from` = `to − (N − 1)` dias para `Nd`, ou `coverage.from` para `all`;
  - se `from` cair antes de `coverage.from`, usa `coverage.from` e mostra "Dados a partir de DD/MM/AAAA";
  - busca a série com `granularity=month` e soma `new`.
- **Ranking:**
  - `GET /api/v1/rankings?metric=&limit=10`;
  - link para `/paises/:code` mantendo a query;
  - o país selecionado leva `aria-current="page"` no link e `data-state="selected"` na linha.
- **Estados:** todo componente com dados tem skeleton, vazio e erro local com "Tentar de novo"; `DATA_NOT_READY` mostra "Dados ainda não carregados" e não oferece "Tentar de novo".

---

### Task 1: shadcn/ui + Tailwind v4 no `web`

**Files:**
- Modify: `web/package.json`, `package-lock.json`, `web/vite.config.ts`, `web/tsconfig.json`, `web/tsconfig.app.json`, `web/src/app/styles.css`, `web/src/test/setup.ts`, `eslint.config.js`
- Create (pelo CLI): `web/components.json`, `web/src/lib/utils.ts`, `web/src/hooks/use-mobile.ts`, `web/src/components/ui/{button,card,input,separator,sheet,sidebar,skeleton,table,toggle,toggle-group,tooltip}.tsx`

**Interfaces:**
- Produces:
  - alias `@/` para `web/src/`, nos testes, no build e no typecheck;
  - os componentes de `@/components/ui/*` listados acima;
  - `cn` em `@/lib/utils`;
  - stub de `window.matchMedia` nos testes.
  - `SidebarInset` renderiza `<div>` (não `<main>`), para o `<main>` da página ser o único landmark principal.

- [ ] **Step 1: Tailwind** (a branch `feat/level-2-web` já existe, com este plano)

```bash
npm install -w web -D tailwindcss@4.3.3 @tailwindcss/vite@4.3.3
```

- [ ] **Step 2: Alias e plugin do Tailwind**

`web/vite.config.ts` fica assim (o bloco `test` é o de hoje):

```ts
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    env: {
      VITE_API_URL: 'http://api.test',
      VITE_TILES_URL: 'https://tiles.test/{z}/{x}/{y}.png',
      VITE_TILES_ATTRIBUTION: '&copy; Tiles de teste',
    },
  },
});
```

- **`compilerOptions.paths`:** acrescente `"paths": { "@/*": ["./src/*"] }` em `web/tsconfig.app.json` e também em `web/tsconfig.json`, onde o CLI do shadcn valida o alias. No `tsconfig.json`, crie `"compilerOptions": { "paths": … }` ao lado de `files`/`references`.
- **Sem `baseUrl`:** o TS 6 marca `baseUrl` como obsoleto (erro TS5101), e `paths` funciona sem ele.

No topo de `web/src/app/styles.css`, acrescente `@import "tailwindcss";`. O resto do arquivo fica por enquanto; a Task 4 o remove.

- [ ] **Step 3: Rodar o CLI**

```bash
cd web
npx -y shadcn@4.22.1 init -d --base radix
npx -y shadcn@4.22.1 add dashboard-01 -y
cd ..
```

O que esperar:

- o `init` cria `components.json` (estilo `radix-nova`, `iconLibrary: lucide`), `src/lib/utils.ts` (reexporta `cn` do pacote `cn`, que é do próprio shadcn) e `src/components/ui/button.tsx`;
- ele também acrescenta ao `styles.css` os imports (`tw-animate-css`, `shadcn/tailwind.css`, `@fontsource-variable/geist`), os tokens de `:root`/`.dark` e a camada `base`;
- confira se as regras antigas do `styles.css` continuam no arquivo; se o CLI as apagou, restaure-as do `git diff`;
- o `add` instala o bloco inteiro.

- [ ] **Step 4: Tirar o que o Mapp não usa**

Apague as peças de demonstração do bloco e os componentes que nenhum código do Mapp vai importar:

```bash
cd web
rm -r src/app/dashboard
rm src/components/{app-sidebar,chart-area-interactive,data-table,nav-documents,nav-main,nav-secondary,nav-user,section-cards,site-header}.tsx
rm src/components/ui/{avatar,badge,breadcrumb,chart,checkbox,drawer,dropdown-menu,label,select,sonner,tabs}.tsx
cd ..
```

Ficam em `src/components/ui`: `button`, `card`, `input`, `separator`, `sheet`, `sidebar`, `skeleton`, `table`, `toggle`, `toggle-group` e `tooltip` (o `sidebar` importa `sheet`, `tooltip`, `input`, `separator` e `skeleton`). Se o CLI criou outro arquivo em `src/components/ui` que nenhum dos que ficam importa, apague também.

Remova as dependências que só o bloco usava e passe o `shadcn` (usado só no build, pelo `@import "shadcn/tailwind.css"`) para devDependency:

```bash
npm uninstall -w web @dnd-kit/core @dnd-kit/modifiers @dnd-kit/sortable @dnd-kit/utilities @tanstack/react-table @tabler/icons-react recharts sonner vaul zod next-themes shadcn
npm install -w web -D shadcn@4.22.1
```

Ignore os nomes que o `uninstall` disser que não estavam instalados.

Ao final, as `dependencies` do `web` são as de antes mais `@fontsource-variable/geist`, `class-variance-authority`, `cn`, `lucide-react`, `radix-ui` e `tw-animate-css`. As `devDependencies` ganham `@tailwindcss/vite`, `shadcn` e `tailwindcss`. Se o `tailwindcss` ou o `@tailwindcss/vite` tiverem ido para `dependencies`, mova-os para devDependencies.

- [ ] **Step 5: Ajustes nos arquivos gerados**

1. Em `src/components/ui/sidebar.tsx`, `SidebarInset` renderiza `<main …>`. Troque por `<div …>` e o tipo das props de `React.ComponentProps<"main">` para `React.ComponentProps<"div">`.
2. Textos em pt-BR:
   - em `sidebar.tsx`, `Toggle Sidebar` → `Alternar menu lateral` (as três ocorrências: `sr-only`, `aria-label` e `title`), o `SheetTitle` `Sidebar` → `Menu` e o `SheetDescription` `Displays the mobile sidebar.` → `Navegação do Mapp`;
   - em `sheet.tsx`, o `sr-only` `Close` → `Fechar`.
3. Formate os arquivos gerados com o Prettier do projeto:

```bash
npx prettier --write web/components.json web/src/components web/src/hooks web/src/lib
```

4. Em `eslint.config.js`, logo depois do bloco `files: ['web/src/**/*.{ts,tsx}']`, acrescente:

```js
  {
    // Generated by the shadcn CLI: variants live next to their component, and the
    // mobile hook syncs with matchMedia inside an effect.
    files: ['web/src/components/ui/**/*.tsx', 'web/src/hooks/use-mobile.ts'],
    rules: {
      'react-refresh/only-export-components': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
```

5. Rode `npx eslint web/src/components web/src/hooks web/src/lib`.
   - Se aparecer outro erro num arquivo gerado (por exemplo `no-unnecessary-type-assertion`), corrija no próprio arquivo com a menor mudança possível; `npx eslint --fix` resolve as asserções desnecessárias.
   - Não desligue regra para o projeto inteiro.

- [ ] **Step 6: Leaflet com o preflight do Tailwind e `matchMedia` nos testes**

O preflight do Tailwind põe `max-width: 100%` em `img` e quebra os tiles do Leaflet. Acrescente ao fim de `web/src/app/styles.css`:

```css
/* Tailwind's preflight caps img width, which breaks Leaflet tiles. */
.leaflet-container img {
  max-width: none;
}
```

O `jsdom` não tem `matchMedia`, e o `useIsMobile` da sidebar o usa. Acrescente ao fim de `web/src/test/setup.ts`:

```ts
// jsdom has no matchMedia; the shadcn sidebar reads it to detect phones.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }),
});
```

- [ ] **Step 7: Verificar**

Rode `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` e `npm run test:e2e -w web`.

- Esperado: tudo verde, com os mesmos 94 testes do `web`. A tela ainda é a da F4, porque nenhum componente do app usa o shadcn ainda.
- Se o E2E falhar só por causa do preflight (algo visual do Leaflet), corrija em `styles.css` com uma regra restrita a `.leaflet-container`.

- [ ] **Step 8: Commit**

```bash
git add -A web package-lock.json eslint.config.js
git commit -m "chore: set up shadcn/ui and Tailwind v4 in the web app"
```

---

### Task 2: Período na URL e intervalo de datas

**Files:**
- Create: `web/src/shared/period/period.ts`, `web/src/shared/period/period.test.ts`
- Create: `web/src/shared/url/use-period.ts`, `web/src/shared/url/use-period.test.tsx`

**Interfaces:**
- Produces:
  - `type Period = '7d' | '30d' | '90d' | 'all'`;
  - `PERIODS: readonly Period[]`;
  - `PERIOD_LABELS: Record<Period, string>`, com os rótulos dos rádios;
  - `PERIOD_PHRASES: Record<Period, string>`, para o texto do card;
  - `interface DateRange { from: string; to: string; clamped: boolean }`;
  - `periodRange(period: Period, coverage: { from: string; to: string }): DateRange`;
  - `parsePeriod(value: string | null): Period`;
  - `usePeriod(): [Period, (period: Period) => void]`.

- [ ] **Step 1: Testes (falham)**

`web/src/shared/period/period.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { periodRange } from './period';

const COVERAGE = { from: '2020-01-22', to: '2023-03-09' };

describe('periodRange', () => {
  it.each([
    ['7d', '2023-03-03'],
    ['30d', '2023-02-08'],
    ['90d', '2022-12-10'],
  ] as const)('ends %s at the reference date', (period, from) => {
    expect(periodRange(period, COVERAGE)).toEqual({ from, to: '2023-03-09', clamped: false });
  });

  it('uses the whole coverage for all', () => {
    expect(periodRange('all', COVERAGE)).toEqual({
      from: '2020-01-22',
      to: '2023-03-09',
      clamped: false,
    });
  });

  it('clamps the start to the coverage', () => {
    expect(periodRange('30d', { from: '2023-02-20', to: '2023-03-09' })).toEqual({
      from: '2023-02-20',
      to: '2023-03-09',
      clamped: true,
    });
  });

  it('does not clamp when the start is the first covered day', () => {
    expect(periodRange('7d', { from: '2023-03-03', to: '2023-03-09' })).toEqual({
      from: '2023-03-03',
      to: '2023-03-09',
      clamped: false,
    });
  });

  it('crosses a leap day', () => {
    expect(periodRange('7d', { from: '2020-01-22', to: '2020-03-02' }).from).toBe('2020-02-25');
  });
});
```

`web/src/shared/url/use-period.test.tsx`:

```tsx
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { parsePeriod, usePeriod } from './use-period';

function PeriodProbe() {
  const [period, setPeriod] = usePeriod();
  return (
    <button type="button" onClick={() => setPeriod('7d')}>
      {period}
    </button>
  );
}

describe('parsePeriod', () => {
  it('accepts the known periods and falls back to 30d', () => {
    expect(parsePeriod('7d')).toBe('7d');
    expect(parsePeriod('30d')).toBe('30d');
    expect(parsePeriod('90d')).toBe('90d');
    expect(parsePeriod('all')).toBe('all');
    expect(parsePeriod('15d')).toBe('30d');
    expect(parsePeriod(null)).toBe('30d');
  });
});

describe('usePeriod', () => {
  it('defaults to 30d without rewriting the URL', () => {
    renderWithProviders(<PeriodProbe />, { route: '/paises/BRA' });

    expect(screen.getByRole('button')).toHaveTextContent('30d');
    expect(screen.getByTestId('location')).toHaveTextContent('/paises/BRA');
  });

  it('reads the period from the URL', () => {
    renderWithProviders(<PeriodProbe />, { route: '/?period=all' });

    expect(screen.getByRole('button')).toHaveTextContent('all');
  });

  it('changes only the period and keeps the path and other params', () => {
    renderWithProviders(<PeriodProbe />, { route: '/paises/BRA?metric=deaths' });

    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByRole('button')).toHaveTextContent('7d');
    expect(screen.getByTestId('location')).toHaveTextContent('/paises/BRA?metric=deaths&period=7d');
  });
});
```

Rode `npx vitest run src/shared/period src/shared/url/use-period.test.tsx` dentro de `web/`. Esperado: falha com os módulos ainda inexistentes.

- [ ] **Step 2: Implementar**

`web/src/shared/period/period.ts`:

```ts
export type Period = '7d' | '30d' | '90d' | 'all';

export const PERIODS: readonly Period[] = ['7d', '30d', '90d', 'all'];

export const PERIOD_LABELS: Record<Period, string> = {
  '7d': '7 dias',
  '30d': '30 dias',
  '90d': '90 dias',
  all: 'Tudo',
};

export const PERIOD_PHRASES: Record<Period, string> = {
  '7d': 'nos últimos 7 dias',
  '30d': 'nos últimos 30 dias',
  '90d': 'nos últimos 90 dias',
  all: 'em todo o período',
};

const PERIOD_DAYS: Record<Period, number | null> = { '7d': 7, '30d': 30, '90d': 90, all: null };

export interface DateRange {
  from: string;
  to: string;
  clamped: boolean;
}

// UTC arithmetic on YYYY-MM-DD strings, so the day never shifts with the local time zone.
function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function periodRange(period: Period, coverage: { from: string; to: string }): DateRange {
  const days = PERIOD_DAYS[period];
  const start = days === null ? coverage.from : addDays(coverage.to, -(days - 1));
  return start < coverage.from
    ? { from: coverage.from, to: coverage.to, clamped: true }
    : { from: start, to: coverage.to, clamped: false };
}
```

`web/src/shared/url/use-period.ts`, igual ao `useMetric`:

```ts
import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { PERIODS, type Period } from '../period/period';

export function parsePeriod(value: string | null): Period {
  return PERIODS.find((period) => period === value) ?? '30d';
}

export function usePeriod(): [Period, (period: Period) => void] {
  const [params, setParams] = useSearchParams();
  const period = parsePeriod(params.get('period'));
  const setPeriod = useCallback(
    (next: Period) => {
      setParams((previous) => {
        const updated = new URLSearchParams(previous);
        updated.set('period', next);
        return updated;
      });
    },
    [setParams],
  );
  return [period, setPeriod];
}
```

- [ ] **Step 3: Verificar e commitar**

Rode os testes do Step 1 (passam) e depois `npm run lint`, `npm run typecheck` e `npm test`.

```bash
git add web/src/shared/period web/src/shared/url/use-period.ts web/src/shared/url/use-period.test.tsx
git commit -m "feat: keep the period in the URL"
```

---

### Task 3: Casco do dashboard-01 — sidebar, cabeçalho e controles

**Files:**
- Create: `web/src/app/app-sidebar.tsx`, `web/src/app/site-header.tsx`, `web/src/app/dashboard-controls.tsx`, `web/src/app/dashboard-controls.test.tsx`, `web/src/shared/ui/period-toggle.tsx`
- Modify: `web/src/app/layout.tsx`, `web/src/shared/ui/metric-toggle.tsx`, `web/src/pages/dashboard-page.tsx`, `web/src/app/app.test.tsx`, `web/src/pages/dashboard-page.test.tsx`, `web/tests/e2e/navigation.spec.ts`

**Interfaces:**
- Consumes:
  - `usePeriod`, `PERIODS` e `PERIOD_LABELS` (Task 2);
  - de `@/components/ui/*` (Task 1): `Sidebar*`, `SidebarTrigger`, `Separator` e `ToggleGroup`/`ToggleGroupItem`.
- Produces:
  - `MetricToggle({ metric, onChange })`, agora um `ToggleGroup` com `role="group"` e rótulo `Métrica`, cujos itens têm `role="radio"` e `aria-checked`;
  - `PeriodToggle({ period, onChange })`, com o grupo `Período`;
  - `DashboardControls()`, com busca, métrica e período, só nas rotas `/` e `/paises/:code`.
  - O `DashboardPage` deixa de renderizar busca e métrica.

- [ ] **Step 1: Testes (falham)**

`web/src/app/dashboard-controls.test.tsx`:

```tsx
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test/render';
import { DashboardControls } from './dashboard-controls';

describe('DashboardControls', () => {
  it('defaults to cases and 30 days', () => {
    renderWithProviders(<DashboardControls />, { route: '/' });

    expect(screen.getByRole('group', { name: 'Métrica' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Casos' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '30 dias' })).toHaveAttribute('aria-checked', 'true');
  });

  it('marks the metric and the period from the URL', () => {
    renderWithProviders(<DashboardControls />, { route: '/paises/BRA?metric=deaths&period=7d' });

    expect(screen.getByRole('radio', { name: 'Mortes' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '7 dias' })).toHaveAttribute('aria-checked', 'true');
  });

  it('writes the metric to the URL', () => {
    renderWithProviders(<DashboardControls />, { route: '/paises/BRA' });

    fireEvent.click(screen.getByRole('radio', { name: 'Mortes' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/paises/BRA?metric=deaths');
    expect(screen.getByRole('radio', { name: 'Mortes' })).toHaveAttribute('aria-checked', 'true');
  });

  it('writes the period to the URL and keeps the metric', () => {
    renderWithProviders(<DashboardControls />, { route: '/?metric=deaths' });

    fireEvent.click(screen.getByRole('radio', { name: '90 dias' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/?metric=deaths&period=90d');
  });

  it('ignores a click on the active option', () => {
    renderWithProviders(<DashboardControls />, { route: '/' });

    fireEvent.click(screen.getByRole('radio', { name: 'Casos' }));
    fireEvent.click(screen.getByRole('radio', { name: '30 dias' }));

    expect(screen.getByRole('radio', { name: 'Casos' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '30 dias' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
  });

  it('searches and opens a country keeping the query', async () => {
    renderWithProviders(<DashboardControls />, { route: '/?period=7d' });
    const input = screen.getByRole('combobox', { name: 'Buscar país' });
    await waitFor(() => expect(input).toBeEnabled());

    fireEvent.change(input, { target: { value: 'dinamarca' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/paises/DNK?period=7d'),
    );
  });
});
```

Em `web/src/app/app.test.tsx`:

1. Troque o mock do mapa e os imports:

```tsx
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import type { WorldMapProps } from '../features/map/world-map';
import { countriesFixture } from '../test/fixtures';
import { API } from '../test/handlers';
import { renderWithProviders } from '../test/render';
import { server } from '../test/server';
import { App } from './app';

vi.mock('../features/map/world-map', () => ({
  WorldMap: ({ countries }: WorldMapProps) => (
    <div data-testid="world-map" data-count={countries?.length ?? 0} />
  ),
}));
```

2. Acrescente ao `describe('App')`:

```tsx
  it('shows the dashboard controls only on dashboard routes', async () => {
    renderWithProviders(<App />, { route: '/sobre' });

    await screen.findByRole('heading', { name: 'Sobre os dados' });
    expect(screen.queryByRole('group', { name: 'Métrica' })).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument();
  });

  it('switching the metric in the header updates the country card', async () => {
    renderWithProviders(<App />, { route: '/paises/BRA' });
    const card = await screen.findByRole('region', { name: 'Brasil' });
    await within(card).findByText('300.000');

    fireEvent.click(screen.getByRole('radio', { name: 'Mortes' }));

    expect(await within(card).findByText('6.000')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/paises/BRA?metric=deaths');
  });

  it('keeps the previous country list while the new metric loads', async () => {
    server.use(
      http.get(`${API}/api/v1/countries`, async ({ request }) => {
        const deaths = new URL(request.url).searchParams.get('metric') === 'deaths';
        if (deaths) await delay(200);
        return HttpResponse.json(countriesFixture(deaths ? 'deaths' : 'cases'));
      }),
    );
    renderWithProviders(<App />, { route: '/paises/BRA' });
    await waitFor(() => expect(screen.getByTestId('world-map')).toHaveAttribute('data-count', '5'));

    fireEvent.click(screen.getByRole('radio', { name: 'Mortes' }));

    expect(screen.getByTestId('world-map')).toHaveAttribute('data-count', '5');
    expect(screen.getByRole('combobox', { name: 'Buscar país' })).toBeEnabled();
  });
```

3. Em `web/src/pages/dashboard-page.test.tsx`, apague os testes que mudaram de lugar:
   - `switches the metric of the country card`;
   - `keeps the previous country list while the new metric loads`;
   - `searches and opens a country`.

   Tire também os imports que ficarem sem uso (`delay`, `countriesFixture`).

4. Em `web/tests/e2e/navigation.spec.ts`, no teste `a direct link opens the country with the metric from the URL`, troque a asserção do botão por:

```ts
  await expect(page.getByRole('radio', { name: 'Mortes' })).toHaveAttribute('aria-checked', 'true');
```

Rode `npx vitest run src/app` dentro de `web/`. Esperado: falha (`dashboard-controls` inexistente e rádios inexistentes).

- [ ] **Step 2: Toggles**

`web/src/shared/ui/metric-toggle.tsx`:

```tsx
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { Metric } from '../api/types';
import { METRICS, METRIC_LABELS } from '../format/format';

interface MetricToggleProps {
  metric: Metric;
  onChange: (metric: Metric) => void;
}

export function MetricToggle({ metric, onChange }: MetricToggleProps) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      spacing={0}
      value={metric}
      aria-label="Métrica"
      // Radix sends '' when the active item is clicked again; keep the current metric.
      onValueChange={(value) => {
        const next = METRICS.find((item) => item === value);
        if (next) onChange(next);
      }}
    >
      {METRICS.map((item) => (
        <ToggleGroupItem key={item} value={item}>
          {METRIC_LABELS[item].title}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
```

`web/src/shared/ui/period-toggle.tsx`:

```tsx
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { PERIODS, PERIOD_LABELS, type Period } from '../period/period';

interface PeriodToggleProps {
  period: Period;
  onChange: (period: Period) => void;
}

export function PeriodToggle({ period, onChange }: PeriodToggleProps) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      spacing={0}
      value={period}
      aria-label="Período"
      onValueChange={(value) => {
        const next = PERIODS.find((item) => item === value);
        if (next) onChange(next);
      }}
    >
      {PERIODS.map((item) => (
        <ToggleGroupItem key={item} value={item}>
          {PERIOD_LABELS[item]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
```

- [ ] **Step 3: Controles, sidebar, cabeçalho e layout**

`web/src/app/dashboard-controls.tsx`:

```tsx
import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { CountrySearch } from '../features/search/country-search';
import { useCountries } from '../shared/api/queries';
import { MetricToggle } from '../shared/ui/metric-toggle';
import { PeriodToggle } from '../shared/ui/period-toggle';
import { useMetric } from '../shared/url/use-metric';
import { usePeriod } from '../shared/url/use-period';

export function DashboardControls() {
  const navigate = useNavigate();
  const location = useLocation();
  const [metric, setMetric] = useMetric();
  const [period, setPeriod] = usePeriod();
  const countries = useCountries(metric);

  const onSelect = useCallback(
    (code: string) => {
      void navigate({ pathname: `/paises/${code}`, search: location.search });
    },
    [navigate, location.search],
  );

  return (
    <div className="ml-auto flex flex-wrap items-center gap-2 lg:gap-3">
      <CountrySearch
        countries={countries.data?.countries}
        isError={countries.isError}
        onSelect={onSelect}
      />
      <MetricToggle metric={metric} onChange={setMetric} />
      <PeriodToggle period={period} onChange={setPeriod} />
    </div>
  );
}
```

`web/src/app/app-sidebar.tsx`, a partir do `app-sidebar` do bloco, sem menu de usuário:

```tsx
import { InfoIcon, MapIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { NavLink, useLocation } from 'react-router';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

const NAV_ITEMS = [
  { title: 'Mapa', to: '/', icon: MapIcon, isActive: (path: string) => path === '/' || path.startsWith('/paises/') },
  { title: 'Sobre', to: '/sobre', icon: InfoIcon, isActive: (path: string) => path === '/sobre' },
];

export function AppSidebar(props: ComponentProps<typeof Sidebar>) {
  const { pathname } = useLocation();

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <div className="flex items-center gap-2 p-1.5">
          <MapIcon className="size-5" aria-hidden="true" />
          <span className="text-base font-semibold">Mapp</span>
          <span className="text-xs text-muted-foreground">COVID-19</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <nav aria-label="Principal">
              <SidebarMenu>
                {NAV_ITEMS.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={item.isActive(pathname)}>
                      <NavLink to={item.to} end>
                        <item.icon aria-hidden="true" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
```

`web/src/app/site-header.tsx`, a partir do `site-header` do bloco:

```tsx
import { Link, useMatch } from 'react-router';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { DashboardControls } from './dashboard-controls';

export function SiteHeader() {
  const onWorld = useMatch('/') !== null;
  const onCountry = useMatch('/paises/:code') !== null;

  return (
    <header className="flex min-h-(--header-height) shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2 lg:px-6">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
      <h1 className="text-base font-medium">
        <Link to="/">Mapp</Link>
      </h1>
      {(onWorld || onCountry) && <DashboardControls />}
    </header>
  );
}
```

`web/src/app/layout.tsx`:

```tsx
import type { CSSProperties } from 'react';
import { Outlet } from 'react-router';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { DataBanner } from '../shared/ui/data-banner';
import { SiteFooter } from '../shared/ui/site-footer';
import { AppSidebar } from './app-sidebar';
import { SiteHeader } from './site-header';

const SHELL_SIZES = {
  '--sidebar-width': 'calc(var(--spacing) * 60)',
  '--header-height': 'calc(var(--spacing) * 12)',
} as CSSProperties;

export function Layout() {
  return (
    <SidebarProvider style={SHELL_SIZES}>
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <DataBanner />
        <main className="flex flex-1 flex-col">
          <Outlet />
        </main>
        <SiteFooter />
      </SidebarInset>
    </SidebarProvider>
  );
}
```

Em `web/src/pages/dashboard-page.tsx`:
- remova o `<div className="dashboard-controls">…</div>` inteiro;
- remova os imports de `CountrySearch` e `MetricToggle`;
- `useMetric` continua, só a leitura: `const [metric] = useMetric();`;
- o `onSelect` continua, porque o mapa o usa.

- [ ] **Step 4: Verificar**

Rode `npx vitest run` dentro de `web/` e depois `npm run lint`, `npm run typecheck`, `npm test` e `npm run test:e2e -w web`. Esperado: tudo verde.

Se o clique num item do `ToggleGroup` não disparar `onValueChange` no jsdom, verifique primeiro se o rádio está habilitado. Não troque `fireEvent.click` por outra coisa sem entender a causa.

- [ ] **Step 5: Commit**

```bash
git add -A web
git commit -m "feat: move the web layout to the shadcn dashboard shell"
```

---

### Task 4: Cards, mapa e páginas com os componentes do shadcn; fim do CSS da F4

**Files:**
- Create: `web/src/shared/ui/section-card.tsx`
- Modify:
  - `web/src/shared/ui/{skeleton,error-state,empty-state,data-banner,site-footer}.tsx`;
  - `web/src/features/stats/{global-card,country-card}.tsx`;
  - `web/src/features/map/{world-map,map-legend}.tsx`;
  - `web/src/features/search/country-search.tsx`;
  - `web/src/pages/{dashboard-page,about-page,not-found-page}.tsx`;
  - `web/src/app/styles.css`.

**Interfaces:**
- Consumes: `Card`, `CardHeader`, `CardContent`, `CardDescription`, `Skeleton` (as `UiSkeleton`), `Button` and `Input` from `@/components/ui/*`, and `cn` from `@/lib/utils`.
- Produces:
  - `SectionCard({ titleId, title, description?, className?, children })`: a `Card` with `role="region"`, named by its `h2`;
  - `Skeleton({ label, height?, className? })`, with the same API plus `className`.
  - No accessible name changes.

- [ ] **Step 1: Estados e cartão compartilhados**

`web/src/shared/ui/section-card.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface SectionCardProps {
  titleId: string;
  title: string;
  description?: string;
  className?: string;
  children: ReactNode;
}

export function SectionCard({ titleId, title, description, className, children }: SectionCardProps) {
  return (
    <Card role="region" aria-labelledby={titleId} className={cn('@container/card', className)}>
      <CardHeader>
        <h2 id={titleId} className="font-heading text-base leading-snug font-medium">
          {title}
        </h2>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">{children}</CardContent>
    </Card>
  );
}
```

`web/src/shared/ui/skeleton.tsx`:

```tsx
import { Skeleton as UiSkeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface SkeletonProps {
  label: string;
  height?: string;
  className?: string;
}

export function Skeleton({ label, height = '1.5rem', className }: SkeletonProps) {
  return (
    <UiSkeleton
      role="status"
      aria-label={label}
      className={cn('w-full', className)}
      style={{ height }}
    />
  );
}
```

`web/src/shared/ui/error-state.tsx`:

```tsx
import { Button } from '@/components/ui/button';

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"
    >
      <p>{message}</p>
      {onRetry && (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Tentar de novo
        </Button>
      )}
    </div>
  );
}
```

`web/src/shared/ui/empty-state.tsx`:

```tsx
export function EmptyState({ message }: { message: string }) {
  return <p className="text-sm text-muted-foreground">{message}</p>;
}
```

- `data-banner.tsx`: troque `className="data-banner"` (nos três retornos) por `className="sticky top-0 z-10 border-b bg-muted px-4 py-2 text-sm lg:px-6"`.
- `site-footer.tsx`: `<footer className="mt-auto flex flex-col gap-1 border-t px-4 py-4 text-xs text-muted-foreground lg:px-6">`.

- [ ] **Step 2: Cards Geral e Por país**

`web/src/features/stats/global-card.tsx` keeps the logic and changes only the markup:

```tsx
  } else {
    const data = global.data;
    content = (
      <>
        <dl className="grid grid-cols-2 gap-4">
          {METRICS.map((metric) => (
            <div key={metric} className="flex flex-col gap-1">
              <dt className="text-sm text-muted-foreground">{METRIC_LABELS[metric].title}</dt>
              <dd className="text-xl font-semibold tabular-nums">{`Total: ${formatNumber(data[metric].total)}`}</dd>
              <dd className="text-sm text-muted-foreground tabular-nums">{`Novos no dia: ${formatNumber(data[metric].new)}`}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">{`Data: ${formatDate(data.date)}`}</p>
      </>
    );
  }

  return (
    <SectionCard titleId="global-card-title" title="Geral">
      {content}
    </SectionCard>
  );
```

`web/src/features/stats/country-card.tsx` keeps the logic as well. Its success branch and return become:

```tsx
    const date = (
      <p className="text-xs text-muted-foreground">{`Data: ${formatDate(country.data.date)}`}</p>
    );
    content =
      value === null ? (
        <>
          <EmptyState message="Sem dados para este país na data de referência" />
          {date}
        </>
      ) : (
        <>
          <dl className="grid gap-3">
            <div className="flex flex-col gap-1">
              <dt className="text-sm text-muted-foreground">{`Total de ${METRIC_LABELS[metric].noun}`}</dt>
              <dd className="text-xl font-semibold tabular-nums">{formatNumber(value.total)}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-sm text-muted-foreground">Participação no global</dt>
              <dd className="text-xl font-semibold tabular-nums">{formatPercent(comparison.share)}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-sm text-muted-foreground">Posição</dt>
              <dd className="text-xl font-semibold tabular-nums">
                {formatRank(comparison.rank, comparison.rankedCount)}
              </dd>
            </div>
          </dl>
          {date}
        </>
      );
  }

  const title = code !== null && country.data ? country.data.country.name : 'Por país';
  return (
    <SectionCard titleId="country-card-title" title={title}>
      {content}
    </SectionCard>
  );
```

- [ ] **Step 3: Mapa num Card e busca**

Em `web/src/features/map/world-map.tsx`:

- **Contêiner:** o `<div className="map-panel">` vira um `Card` de `@/components/ui/card`: `<Card className="relative isolate gap-0 overflow-hidden py-0">`. O `isolate` mantém os z-index do Leaflet (até 1000) dentro do card, abaixo do menu lateral e da faixa de dados.
- **`MapContainer`:** `className="h-[360px] w-full md:h-[480px]"`.
- **Os dois `.map-overlay`:** `className="absolute inset-0 z-[900] flex items-center justify-center bg-background/60 p-4"`. O skeleton de dentro recebe `className="pointer-events-none"`.
- **`.map-note`:** `className="absolute top-2 right-2 z-[900] m-0 rounded bg-background px-2 py-1 text-xs"`.

Em `web/src/features/map/map-legend.tsx`:

- **Contêiner:** `className="absolute bottom-6 left-2 z-[900] rounded-md bg-background/90 px-3 py-2 text-xs"`.
- **Título:** `className="mb-1 font-semibold"`.
- **`ul`:** `className="flex items-end gap-3"`.
- **`li`:** `className="flex flex-col items-center"`.

Em `web/src/features/search/country-search.tsx`, mude só as classes e o `input`; o comportamento continua igual:

- **Contêiner:** `className="relative flex min-w-[min(100%,280px)] flex-col"`.
- **`label`:** `className="sr-only"`. O nome acessível `Buscar país` continua.
- **`<input …>`:** vira `<Input …>` de `@/components/ui/input`, com as mesmas props.
- **`ul`:** `className="absolute top-full right-0 left-0 z-50 mt-1 rounded-md border bg-popover py-1 text-popover-foreground shadow-md"`, mantendo `hidden={…}`.
- **`li`:** `className="cursor-pointer px-3 py-1.5 text-sm hover:bg-accent aria-selected:bg-accent"`.
- **"Nenhum país encontrado":** `className="absolute top-full right-0 left-0 z-50 mt-1 rounded-md border bg-popover px-3 py-2 text-sm shadow-md"`.

- [ ] **Step 4: Páginas**

`web/src/pages/dashboard-page.tsx`, retorno no padrão do `page.tsx` do bloco:

```tsx
  return (
    <div className="@container/main flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
      {notFound && (
        <div className="px-4 lg:px-6">
          <div
            className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm"
            role="alert"
          >
            <p>{`País não encontrado: ${rawCode}`}</p>
            <Link
              className="font-medium underline underline-offset-4"
              to={{ pathname: '/', search: location.search }}
            >
              Voltar à visão mundial
            </Link>
          </div>
        </div>
      )}
      <div className="px-4 lg:px-6">
        <WorldMap
          metric={metric}
          countries={countries.data?.countries}
          countriesStatus={countries.status}
          onRetry={() => void countries.refetch()}
          referenceDate={countries.data?.date}
          selectedCode={selectedCode}
          onSelect={onSelect}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-3">
        <GlobalCard />
        <CountryCard code={selectedCode} metric={metric} />
      </div>
    </div>
  );
```

- **`about-page.tsx`:**
  - `<article className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 lg:px-6">`;
  - `h2` com `className="text-2xl font-semibold"`;
  - cada `h3` com `className="text-lg font-medium"`;
  - cada `section` com `className="flex flex-col gap-2 text-sm"`;
  - cada `ul` com `className="list-disc pl-5"`;
  - o link da fonte com `className="font-medium underline underline-offset-4"`.
- **`not-found-page.tsx`:**
  - `<section className="flex flex-col gap-2 px-4 py-6 lg:px-6">`;
  - `h2` com `className="text-2xl font-semibold"`;
  - o link com `className="font-medium underline underline-offset-4"`.

- [ ] **Step 5: CSS da F4 sai**

Em `web/src/app/styles.css`, apague tudo o que veio da F4: o `:root` com `font-family`/`color`/`background`, `*`, `body`, `a`, `button`, `.app`, `.site-header…`, `.data-banner`, `.content`, `.site-footer…`, `.skeleton` e o `@keyframes`, `.error-state…`, `.empty-state`, `.dashboard…`, `.metric-toggle…`, `.country-search…`, `.search-*`, `.notice…`, `.map-*`, `.world-map`, `.cards`, `.card…`, `.about…` e as duas `@media`.

Ficam só os imports, os tokens e a camada `base` do shadcn, mais estas regras do Leaflet:

```css
/* Tailwind's preflight caps img width, which breaks Leaflet tiles. */
.leaflet-container img {
  max-width: none;
}

.leaflet-interactive.country-polygon:not(.is-clickable) {
  cursor: inherit;
}

.leaflet-container :focus-visible {
  outline: 3px solid #1d4ed8;
  outline-offset: 2px;
}
```

Confira com `grep -rn 'className="' web/src --include=*.tsx | grep -E '"(app|card|cards|dashboard|map-panel|world-map|notice|skeleton|error-state|empty-state|data-banner|site-footer|about|not-found)"'`. Esperado: nenhuma linha. As classes `country-polygon` e `is-clickable` do Leaflet ficam.

- [ ] **Step 6: Verificar e commitar**

Rode `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` e `npm run test:e2e -w web`. Esperado: verde sem mudar nenhum teste, porque os nomes acessíveis e os textos são os mesmos.

```bash
git add -A web
git commit -m "feat: restyle cards, map and pages with shadcn components"
```

---

### Task 5: Card Por tempo

**Files:**
- Create: `web/src/features/stats/period-card.tsx`, `web/src/features/stats/period-card.test.tsx`
- Modify:
  - `web/src/shared/api/types.ts`, `web/src/shared/api/queries.ts`;
  - `web/src/test/fixtures.ts`, `web/src/test/handlers.ts`;
  - `web/src/pages/dashboard-page.tsx`, `web/src/pages/dashboard-page.test.tsx`.

**Interfaces:**
- Consumes:
  - `periodRange`, `PERIOD_PHRASES` and `Period` (Task 2);
  - `usePeriod` (Task 2);
  - `SectionCard` and `Skeleton` (Task 4).
- Produces:
  - types `GlobalTimeseriesResponse`, `CountryTimeseriesResponse` and `TimeseriesPoint`;
  - `useMonthlySeries(code: string | null, metric: Metric, range: { from: string; to: string } | null)`;
  - `PeriodCard({ code, metric, period })`;
  - the fixtures `seriesPoints`, `globalSeriesFixture` and `countrySeriesFixture`.
  - Fixture rule: each day adds that fixture's `new` to the series. World: cases 1.200/day, deaths 20/day. Brasil: cases 120/day, deaths 3/day.

- [ ] **Step 1: Tipos, fixtures e handlers**

`web/src/shared/api/types.ts`, acrescente:

```ts
export type GlobalTimeseriesResponse = Schemas['GlobalTimeseriesResponse'];
export type CountryTimeseriesResponse = Schemas['CountryTimeseriesResponse'];
export type TimeseriesPoint = Schemas['TimeseriesPoint'];
```

`web/src/test/fixtures.ts`: acrescente `CountryTimeseriesResponse`, `GlobalTimeseriesResponse` e `TimeseriesPoint` ao import de tipos e, no fim do arquivo:

```ts
export const SERIES_START = '2020-01-22';

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function nextMonthStart(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
}

// One point per calendar month, the first cut at `from`; every day adds `perDay` new.
export function seriesPoints(perDay: number, from: string, to: string): TimeseriesPoint[] {
  const points: TimeseriesPoint[] = [];
  for (let start = from; start <= to; start = nextMonthStart(start)) {
    const next = nextMonthStart(start);
    const end = next > to ? to : addDays(next, -1);
    points.push({
      date: start,
      total: perDay * daysBetween(SERIES_START, end),
      new: perDay * daysBetween(start, end),
    });
  }
  return points;
}

export function globalSeriesFixture(
  metric: Metric,
  from: string,
  to: string,
): GlobalTimeseriesResponse {
  return {
    metric,
    granularity: 'month',
    from,
    to,
    points: seriesPoints(globalFixture[metric].new, from, to),
  };
}

export function countrySeriesFixture(
  code: string,
  metric: Metric,
  from: string,
  to: string,
): CountryTimeseriesResponse | null {
  const country = fixtureCountries.find((item) => item.code === code);
  if (!country) return null;
  const value = country[metric];
  return {
    metric,
    granularity: 'month',
    from,
    to,
    country: { code: country.code, name: country.name },
    points: value === null ? [] : seriesPoints(value.new, from, to),
  };
}
```

`web/src/test/handlers.ts`:
- import também `REFERENCE_DATE`, `SERIES_START`, `countrySeriesFixture` e `globalSeriesFixture`, e o tipo `Metric`;
- acrescente antes do array `handlers`:

```ts
function seriesQuery(request: Request): { metric: Metric; from: string; to: string } {
  const params = new URL(request.url).searchParams;
  return {
    metric: params.get('metric') === 'deaths' ? 'deaths' : 'cases',
    from: params.get('from') ?? SERIES_START,
    to: params.get('to') ?? REFERENCE_DATE,
  };
}
```

E, dentro do array:

```ts
  http.get(`${API}/api/v1/global/timeseries`, ({ request }) => {
    const { metric, from, to } = seriesQuery(request);
    return HttpResponse.json(globalSeriesFixture(metric, from, to));
  }),
  http.get(`${API}/api/v1/countries/:code/timeseries`, ({ params, request }) => {
    const code = (typeof params.code === 'string' ? params.code : '').toUpperCase();
    const { metric, from, to } = seriesQuery(request);
    const series = countrySeriesFixture(code, metric, from, to);
    return series
      ? HttpResponse.json(series)
      : HttpResponse.json(errorBody('COUNTRY_NOT_FOUND', 'country not found', { code }), {
          status: 404,
        });
  }),
```

- [ ] **Step 2: Testes (falham)**

`web/src/features/stats/period-card.test.tsx`:

```tsx
import { fireEvent, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { metaFixture } from '../../test/fixtures';
import { API, errorBody } from '../../test/handlers';
import { renderWithProviders } from '../../test/render';
import { server } from '../../test/server';
import { PeriodCard } from './period-card';

function card() {
  return screen.getByRole('region', { name: 'Por tempo' });
}

describe('PeriodCard', () => {
  it('sums the world new cases of the last 30 days', async () => {
    renderWithProviders(<PeriodCard code={null} metric="cases" period="30d" />);

    expect(await within(card()).findByText('36.000')).toBeInTheDocument();
    expect(within(card()).getByText('Mundo')).toBeInTheDocument();
    expect(within(card()).getByText('Novos casos nos últimos 30 dias')).toBeInTheDocument();
    expect(within(card()).getByText('De 08/02/2023 a 09/03/2023')).toBeInTheDocument();
    expect(within(card()).queryByText(/Dados a partir de/)).not.toBeInTheDocument();
  });

  it('asks the API for monthly points in the period', async () => {
    let requested: URL | undefined;
    server.use(
      http.get(`${API}/api/v1/global/timeseries`, ({ request }) => {
        requested = new URL(request.url);
        return HttpResponse.json({
          metric: 'cases',
          granularity: 'month',
          from: '2023-02-08',
          to: '2023-03-09',
          points: [{ date: '2023-02-08', total: 1, new: 1 }],
        });
      }),
    );
    renderWithProviders(<PeriodCard code={null} metric="cases" period="30d" />);

    await within(card()).findByText('Novos casos nos últimos 30 dias');
    expect(requested?.searchParams.get('granularity')).toBe('month');
    expect(requested?.searchParams.get('metric')).toBe('cases');
    expect(requested?.searchParams.get('from')).toBe('2023-02-08');
    expect(requested?.searchParams.get('to')).toBe('2023-03-09');
  });

  it('shows the selected country and the active metric', async () => {
    renderWithProviders(<PeriodCard code="BRA" metric="deaths" period="7d" />);

    expect(await within(card()).findByText('21')).toBeInTheDocument();
    expect(within(card()).getByText('Brasil')).toBeInTheDocument();
    expect(within(card()).getByText('Novas mortes nos últimos 7 dias')).toBeInTheDocument();
    expect(within(card()).getByText('De 03/03/2023 a 09/03/2023')).toBeInTheDocument();
  });

  it('covers the whole history for all', async () => {
    renderWithProviders(<PeriodCard code={null} metric="cases" period="all" />);

    expect(await within(card()).findByText('1.371.600')).toBeInTheDocument();
    expect(within(card()).getByText('Novos casos em todo o período')).toBeInTheDocument();
    expect(within(card()).getByText('De 22/01/2020 a 09/03/2023')).toBeInTheDocument();
  });

  it('starts at the coverage and says so when the period goes before it', async () => {
    server.use(
      http.get(`${API}/api/v1/meta`, () =>
        HttpResponse.json({
          ...metaFixture,
          coverage: { from: '2023-02-20', to: '2023-03-09', countries: 4 },
        }),
      ),
    );
    renderWithProviders(<PeriodCard code={null} metric="cases" period="30d" />);

    expect(await within(card()).findByText('21.600')).toBeInTheDocument();
    expect(within(card()).getByText('De 20/02/2023 a 09/03/2023')).toBeInTheDocument();
    expect(within(card()).getByText('Dados a partir de 20/02/2023')).toBeInTheDocument();
  });

  it('says when the country has no data in the period', async () => {
    renderWithProviders(<PeriodCard code="ZWE" metric="cases" period="30d" />);

    expect(await within(card()).findByText('Sem dados no período')).toBeInTheDocument();
  });

  it('says when no data was loaded yet', async () => {
    server.use(
      http.get(`${API}/api/v1/meta`, () =>
        HttpResponse.json({ ...metaFixture, referenceDate: null, coverage: null, dataVersion: null }),
      ),
    );
    renderWithProviders(<PeriodCard code={null} metric="cases" period="30d" />);

    expect(await within(card()).findByText('Dados ainda não carregados')).toBeInTheDocument();
  });

  it('treats DATA_NOT_READY from the series as not loaded', async () => {
    server.use(
      http.get(`${API}/api/v1/global/timeseries`, () =>
        HttpResponse.json(errorBody('DATA_NOT_READY', 'no data'), { status: 503 }),
      ),
    );
    renderWithProviders(<PeriodCard code={null} metric="cases" period="30d" />);

    expect(await within(card()).findByText('Dados ainda não carregados')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument();
  });

  it('shows a skeleton while loading', () => {
    renderWithProviders(<PeriodCard code={null} metric="cases" period="30d" />);

    expect(
      screen.getByRole('status', { name: 'Carregando novos no período' }),
    ).toBeInTheDocument();
  });

  it('shows a local error and retries', async () => {
    server.use(
      http.get(`${API}/api/v1/global/timeseries`, () =>
        HttpResponse.json(errorBody('INTERNAL_ERROR', 'boom'), { status: 500 }),
      ),
    );
    renderWithProviders(<PeriodCard code={null} metric="cases" period="30d" />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar os novos no período',
    );
    server.resetHandlers();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await within(card()).findByText('36.000')).toBeInTheDocument();
  });
});
```

Em `web/src/pages/dashboard-page.test.tsx`, acrescente:

```tsx
  it('shows the new values of the selected country in the period from the URL', async () => {
    renderWithProviders(<DashboardPage />, { route: '/paises/BRA?period=7d', path: PATHS });

    const card = screen.getByRole('region', { name: 'Por tempo' });
    expect(await within(card).findByText('840')).toBeInTheDocument();
    expect(within(card).getByText('Brasil')).toBeInTheDocument();
  });
```

Rode `npx vitest run src/features/stats/period-card.test.tsx src/pages` dentro de `web/`. Esperado: falha.

- [ ] **Step 3: Query e componente**

`web/src/shared/api/queries.ts`, acrescente:

```ts
export interface SeriesRange {
  from: string;
  to: string;
}

// Monthly points keep the payload small (~38 points for the whole history); the API cuts the
// first and last blocks at the range, so summing `new` gives the period total (RN-11).
export function useMonthlySeries(code: string | null, metric: Metric, range: SeriesRange | null) {
  return useQuery({
    queryKey: ['timeseries', code ?? 'world', metric, range?.from, range?.to, 'month'],
    enabled: range !== null,
    queryFn: () => {
      const query = {
        metric,
        from: range?.from,
        to: range?.to,
        granularity: 'month' as const,
      };
      return code === null
        ? unwrap(apiClient().GET('/api/v1/global/timeseries', { params: { query } }))
        : unwrap(
            apiClient().GET('/api/v1/countries/{code}/timeseries', {
              params: { path: { code }, query },
            }),
          );
    },
  });
}
```

`web/src/features/stats/period-card.tsx`:

```tsx
import type { ReactNode } from 'react';
import { isApiError } from '../../shared/api/client';
import { useMeta, useMonthlySeries } from '../../shared/api/queries';
import type { Metric } from '../../shared/api/types';
import { formatDate, formatNumber } from '../../shared/format/format';
import { PERIOD_PHRASES, periodRange, type Period } from '../../shared/period/period';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { SectionCard } from '../../shared/ui/section-card';
import { Skeleton } from '../../shared/ui/skeleton';

const NOT_LOADED = 'Dados ainda não carregados';

const NEW_LABELS: Record<Metric, string> = { cases: 'Novos casos', deaths: 'Novas mortes' };

interface PeriodCardProps {
  code: string | null;
  metric: Metric;
  period: Period;
}

export function PeriodCard({ code, metric, period }: PeriodCardProps) {
  const meta = useMeta();
  const coverage = meta.data?.coverage ?? null;
  const range = coverage ? periodRange(period, coverage) : null;
  const series = useMonthlySeries(code, metric, range);
  const loading = <Skeleton label="Carregando novos no período" height="6rem" />;

  let content: ReactNode;
  if (meta.isPending) {
    content = loading;
  } else if (meta.isError) {
    content = (
      <ErrorState
        message="Não foi possível carregar o período"
        onRetry={() => void meta.refetch()}
      />
    );
  } else if (range === null) {
    content = <EmptyState message={NOT_LOADED} />;
  } else if (series.isPending) {
    content = loading;
  } else if (series.isError) {
    if (isApiError(series.error, 'DATA_NOT_READY')) {
      content = <EmptyState message={NOT_LOADED} />;
    } else if (isApiError(series.error, 'COUNTRY_NOT_FOUND')) {
      // Brief: the page drops an unknown country and the card falls back to the world.
      content = <EmptyState message="Sem dados no período" />;
    } else {
      content = (
        <ErrorState
          message="Não foi possível carregar os novos no período"
          onRetry={() => void series.refetch()}
        />
      );
    }
  } else if (series.data.points.length === 0) {
    content = <EmptyState message="Sem dados no período" />;
  } else {
    const total = series.data.points.reduce((sum, point) => sum + point.new, 0);
    content = (
      <>
        <dl className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">
            {`${NEW_LABELS[metric]} ${PERIOD_PHRASES[period]}`}
          </dt>
          <dd className="text-xl font-semibold tabular-nums">{formatNumber(total)}</dd>
        </dl>
        <p className="text-xs text-muted-foreground">
          {`De ${formatDate(range.from)} a ${formatDate(range.to)}`}
        </p>
        {range.clamped && (
          <p className="text-xs text-muted-foreground">
            {`Dados a partir de ${formatDate(range.from)}`}
          </p>
        )}
      </>
    );
  }

  const scope =
    code === null
      ? 'Mundo'
      : series.data && 'country' in series.data
        ? series.data.country.name
        : undefined;
  return (
    <SectionCard titleId="period-card-title" title="Por tempo" description={scope}>
      {content}
    </SectionCard>
  );
}
```

Em `web/src/pages/dashboard-page.tsx`:
- import `PeriodCard` and `usePeriod`;
- add `const [period] = usePeriod();`;
- in the cards grid, after `CountryCard`, add `<PeriodCard code={selectedCode} metric={metric} period={period} />`.

- [ ] **Step 4: Verificar e commitar**

Rode os testes do Step 2 (passam) e depois `npm run lint`, `npm run typecheck` e `npm test`.

```bash
git add -A web
git commit -m "feat: add the time card with new values in the period"
```

---

### Task 6: Ranking Top 10

**Files:**
- Create: `web/src/features/ranking/ranking-table.tsx`, `web/src/features/ranking/ranking-table.test.tsx`
- Modify:
  - `web/src/shared/api/types.ts`, `web/src/shared/api/queries.ts`;
  - `web/src/test/fixtures.ts`, `web/src/test/handlers.ts`;
  - `web/src/pages/dashboard-page.tsx`, `web/src/pages/dashboard-page.test.tsx`.

**Interfaces:**
- Consumes: `SectionCard` and `Skeleton` (Task 4); `Table*` from `@/components/ui/table`.
- Produces:
  - types `RankingsResponse` and `RankingItem`;
  - `useRankings(metric: Metric, limit: number)`;
  - `rankingsFixture(metric: Metric, limit: number)`;
  - `RankingTable({ metric, selectedCode })`.

- [ ] **Step 1: Tipos, fixture e handler**

`web/src/shared/api/types.ts`, acrescente:

```ts
export type RankingsResponse = Schemas['RankingsResponse'];
export type RankingItem = RankingsResponse['items'][number];
```

`web/src/test/fixtures.ts`: acrescente `RankingsResponse` ao import de tipos e, no fim:

```ts
export function rankingsFixture(metric: Metric, limit: number): RankingsResponse {
  const ranked = fixtureCountries
    .flatMap((country) => {
      const value = country[metric];
      return value === null ? [] : [{ country, value }];
    })
    .sort(
      (a, b) =>
        b.value.total - a.value.total || a.country.name.localeCompare(b.country.name, 'pt-BR'),
    );
  return {
    date: REFERENCE_DATE,
    metric,
    rankedCount: ranked.length,
    items: ranked.slice(0, limit).map(({ country, value }, index) => ({
      rank: index + 1,
      code: country.code,
      name: country.name,
      total: value.total,
      new: value.new,
      share: Math.round((value.total / globalFixture[metric].total) * 1000) / 10,
    })),
  };
}
```

`web/src/test/handlers.ts`: import `rankingsFixture` and add to the array:

```ts
  http.get(`${API}/api/v1/rankings`, ({ request }) => {
    const params = new URL(request.url).searchParams;
    const metric = params.get('metric') === 'deaths' ? 'deaths' : 'cases';
    return HttpResponse.json(rankingsFixture(metric, Number(params.get('limit') ?? '10')));
  }),
```

- [ ] **Step 2: Testes (falham)**

`web/src/features/ranking/ranking-table.test.tsx`:

```tsx
import { fireEvent, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { rankingsFixture } from '../../test/fixtures';
import { API, errorBody } from '../../test/handlers';
import { renderWithProviders } from '../../test/render';
import { server } from '../../test/server';
import { RankingTable } from './ranking-table';

describe('RankingTable', () => {
  it('lists the top countries by total with their share', async () => {
    renderWithProviders(<RankingTable metric="cases" selectedCode={null} />);

    const region = await screen.findByRole('region', { name: 'Top 10 — casos em 09/03/2023' });
    const rows = within(region).getAllByRole('row');
    expect(rows).toHaveLength(5);
    const first = rows[1];
    if (!first) throw new Error('row missing');
    expect(within(first).getByText('1')).toBeInTheDocument();
    expect(within(first).getByRole('link', { name: 'Estados Unidos' })).toHaveAttribute(
      'href',
      '/paises/USA',
    );
    expect(within(first).getByText('500.000')).toBeInTheDocument();
    expect(within(first).getByText('50,0%')).toBeInTheDocument();
    expect(within(region).getByRole('columnheader', { name: 'Total de casos' })).toBeInTheDocument();
  });

  it('asks for ten countries of the active metric', async () => {
    let requested: URL | undefined;
    server.use(
      http.get(`${API}/api/v1/rankings`, ({ request }) => {
        requested = new URL(request.url);
        return HttpResponse.json(rankingsFixture('deaths', 10));
      }),
    );
    renderWithProviders(<RankingTable metric="deaths" selectedCode={null} />);

    await screen.findByRole('region', { name: 'Top 10 — mortes em 09/03/2023' });
    expect(requested?.searchParams.get('limit')).toBe('10');
    expect(requested?.searchParams.get('metric')).toBe('deaths');
  });

  it('keeps the query in the country links', async () => {
    renderWithProviders(<RankingTable metric="deaths" selectedCode={null} />, {
      route: '/?metric=deaths&period=7d',
    });

    expect(await screen.findByRole('link', { name: 'Brasil' })).toHaveAttribute(
      'href',
      '/paises/BRA?metric=deaths&period=7d',
    );
  });

  it('highlights the selected country', async () => {
    renderWithProviders(<RankingTable metric="cases" selectedCode="BRA" />);

    const link = await screen.findByRole('link', { name: 'Brasil' });
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(link.closest('tr')).toHaveAttribute('data-state', 'selected');
    expect(screen.getByRole('link', { name: 'Índia' })).not.toHaveAttribute('aria-current');
  });

  it('shows a dash for a null share', async () => {
    const ranking = rankingsFixture('cases', 10);
    server.use(
      http.get(`${API}/api/v1/rankings`, () =>
        HttpResponse.json({
          ...ranking,
          items: ranking.items.map((item) => ({ ...item, share: null })),
        }),
      ),
    );
    renderWithProviders(<RankingTable metric="cases" selectedCode={null} />);

    await screen.findByRole('link', { name: 'Brasil' });
    expect(screen.getAllByText('—')).toHaveLength(4);
  });

  it('says when there is no country to rank', async () => {
    server.use(
      http.get(`${API}/api/v1/rankings`, () =>
        HttpResponse.json({ ...rankingsFixture('cases', 10), rankedCount: 0, items: [] }),
      ),
    );
    renderWithProviders(<RankingTable metric="cases" selectedCode={null} />);

    expect(await screen.findByText('Sem dados na data de referência')).toBeInTheDocument();
  });

  it('says when no data was loaded yet', async () => {
    server.use(
      http.get(`${API}/api/v1/rankings`, () =>
        HttpResponse.json(errorBody('DATA_NOT_READY', 'no data'), { status: 503 }),
      ),
    );
    renderWithProviders(<RankingTable metric="cases" selectedCode={null} />);

    expect(await screen.findByText('Dados ainda não carregados')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument();
  });

  it('shows a skeleton while loading', () => {
    renderWithProviders(<RankingTable metric="cases" selectedCode={null} />);

    expect(screen.getByRole('status', { name: 'Carregando ranking' })).toBeInTheDocument();
  });

  it('shows a local error and retries', async () => {
    server.use(
      http.get(`${API}/api/v1/rankings`, () =>
        HttpResponse.json(errorBody('INTERNAL_ERROR', 'boom'), { status: 500 }),
      ),
    );
    renderWithProviders(<RankingTable metric="cases" selectedCode={null} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar o ranking',
    );
    server.resetHandlers();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByRole('link', { name: 'Brasil' })).toBeInTheDocument();
  });
});
```

Em `web/src/pages/dashboard-page.test.tsx`:

1. Acrescente:

```tsx
  it('shows the ranking and highlights the selected country', async () => {
    renderWithProviders(<DashboardPage />, { route: '/paises/BRA', path: PATHS });

    const ranking = await screen.findByRole('region', { name: 'Top 10 — casos em 09/03/2023' });
    expect(within(ranking).getByRole('link', { name: 'Brasil' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
```

2. O ranking também mostra `300.000`. No teste `keeps the country card working when the global card fails`, troque `expect(await screen.findByText('300.000')).toBeInTheDocument();` por:

```tsx
    const card = await screen.findByRole('region', { name: 'Brasil' });
    expect(await within(card).findByText('300.000')).toBeInTheDocument();
```

Rode `npx vitest run src/features/ranking src/pages` dentro de `web/`. Esperado: falha.

- [ ] **Step 3: Query e componente**

`web/src/shared/api/queries.ts`:

```ts
export function useRankings(metric: Metric, limit: number) {
  return useQuery({
    queryKey: ['rankings', metric, limit],
    queryFn: () =>
      unwrap(apiClient().GET('/api/v1/rankings', { params: { query: { metric, limit } } })),
  });
}
```

`web/src/features/ranking/ranking-table.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { isApiError } from '../../shared/api/client';
import { useRankings } from '../../shared/api/queries';
import type { Metric } from '../../shared/api/types';
import {
  METRIC_LABELS,
  formatDate,
  formatNumber,
  formatPercent,
} from '../../shared/format/format';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { SectionCard } from '../../shared/ui/section-card';
import { Skeleton } from '../../shared/ui/skeleton';

const RANKING_LIMIT = 10;
const TITLE_ID = 'ranking-title';

interface RankingTableProps {
  metric: Metric;
  selectedCode: string | null;
}

export function RankingTable({ metric, selectedCode }: RankingTableProps) {
  const ranking = useRankings(metric, RANKING_LIMIT);
  const location = useLocation();
  const noun = METRIC_LABELS[metric].noun;

  let content: ReactNode;
  if (ranking.isPending) {
    content = <Skeleton label="Carregando ranking" height="16rem" />;
  } else if (ranking.isError) {
    content = isApiError(ranking.error, 'DATA_NOT_READY') ? (
      <EmptyState message="Dados ainda não carregados" />
    ) : (
      <ErrorState
        message="Não foi possível carregar o ranking"
        onRetry={() => void ranking.refetch()}
      />
    );
  } else if (ranking.data.items.length === 0) {
    content = <EmptyState message="Sem dados na data de referência" />;
  } else {
    content = (
      <Table aria-labelledby={TITLE_ID}>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Posição</TableHead>
            <TableHead>País</TableHead>
            <TableHead className="text-right">{`Total de ${noun}`}</TableHead>
            <TableHead className="text-right">Participação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ranking.data.items.map((item) => {
            const selected = item.code === selectedCode;
            return (
              <TableRow key={item.code} data-state={selected ? 'selected' : undefined}>
                <TableCell className="tabular-nums">{item.rank}</TableCell>
                <TableCell>
                  <Link
                    to={{ pathname: `/paises/${item.code}`, search: location.search }}
                    aria-current={selected ? 'page' : undefined}
                    className="font-medium underline-offset-4 hover:underline aria-[current=page]:underline"
                  >
                    {item.name}
                  </Link>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(item.total)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatPercent(item.share)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  }

  const title = ranking.data
    ? `Top 10 — ${noun} em ${formatDate(ranking.data.date)}`
    : `Top 10 — ${noun}`;
  return (
    <SectionCard titleId={TITLE_ID} title={title}>
      {content}
    </SectionCard>
  );
}
```

Em `web/src/pages/dashboard-page.tsx`, import `RankingTable` and add after the cards grid:

```tsx
      <div className="px-4 lg:px-6">
        <RankingTable metric={metric} selectedCode={selectedCode} />
      </div>
```

- [ ] **Step 4: Verificar e commitar**

Rode os testes do Step 2 (passam) e depois `npm run lint`, `npm run typecheck` e `npm test`.

```bash
git add -A web
git commit -m "feat: add the top 10 ranking with links to the countries"
```

---

### Task 7: E2E de comparação e ranking, ADR 0007 e CLAUDE.md

**Files:**
- Create: `web/tests/e2e/comparison.spec.ts`, `docs/adr/0007-front-shadcn-tailwind.md`
- Modify: `web/tests/e2e/fixtures.ts`, `web/tests/e2e/mock-api.ts`, `CLAUDE.md`

**Interfaces:**
- Consumes: the regions, radios and links from Tasks 3–6. The E2E fixtures follow the vitest fixtures: the same per-day `new` rule and the same ranking order.

- [ ] **Step 1: Fixtures e mock do E2E**

`web/tests/e2e/fixtures.ts` vive noutro projeto TS e já duplica as fixtures do vitest. Acrescente no fim:

```ts
export const SERIES_START = '2020-01-22';

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function nextMonthStart(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
}

// One point per calendar month, the first cut at `from`; every day adds `perDay` new.
function seriesPoints(perDay: number, from: string, to: string) {
  const points: { date: string; total: number; new: number }[] = [];
  for (let start = from; start <= to; start = nextMonthStart(start)) {
    const next = nextMonthStart(start);
    const end = next > to ? to : addDays(next, -1);
    points.push({
      date: start,
      total: perDay * daysBetween(SERIES_START, end),
      new: perDay * daysBetween(start, end),
    });
  }
  return points;
}

export function globalSeries(metric: Metric, from: string, to: string) {
  return { metric, granularity: 'month', from, to, points: seriesPoints(global[metric].new, from, to) };
}

export function countrySeries(code: string, metric: Metric, from: string, to: string) {
  const country = countries.find((c) => c.code === code);
  if (!country) return null;
  const value = country[metric];
  return {
    metric,
    granularity: 'month',
    from,
    to,
    country: { code: country.code, name: country.name },
    points: value === null ? [] : seriesPoints(value.new, from, to),
  };
}

export function rankings(metric: Metric, limit: number) {
  const ranked = countries
    .flatMap((country) => {
      const value = country[metric];
      return value === null ? [] : [{ country, value }];
    })
    .sort(
      (a, b) =>
        b.value.total - a.value.total || a.country.name.localeCompare(b.country.name, 'pt-BR'),
    );
  return {
    date: REFERENCE_DATE,
    metric,
    rankedCount: ranked.length,
    items: ranked.slice(0, limit).map(({ country, value }, index) => ({
      rank: index + 1,
      code: country.code,
      name: country.name,
      total: value.total,
      new: value.new,
      share: Math.round((value.total / global[metric].total) * 1000) / 10,
    })),
  };
}
```

Em `web/tests/e2e/mock-api.ts`:

1. Mude o import para:

```ts
import {
  SERIES_START,
  REFERENCE_DATE,
  countryDetail,
  countryList,
  countrySeries,
  global,
  globalSeries,
  meta,
  rankings,
} from './fixtures.js';
```

2. Em `handleApi`, depois do `if (path === '/api/v1/countries') {…}` e antes do `const match = …`, acrescente:

```ts
  const metric = url.searchParams.get('metric') === 'deaths' ? 'deaths' : 'cases';
  const from = url.searchParams.get('from') ?? SERIES_START;
  const to = url.searchParams.get('to') ?? REFERENCE_DATE;
  if (path === '/api/v1/rankings') {
    return json(route, 200, rankings(metric, Number(url.searchParams.get('limit') ?? '10')));
  }
  if (path === '/api/v1/global/timeseries') return json(route, 200, globalSeries(metric, from, to));
  const series = /^\/api\/v1\/countries\/([^/]+)\/timeseries$/.exec(path);
  if (series?.[1]) {
    const code = decodeURIComponent(series[1]).toUpperCase();
    const body = countrySeries(code, metric, from, to);
    return body ? json(route, 200, body) : notFound(route, code);
  }
```

O `if (path === '/api/v1/countries')` que já existe pode reaproveitar `metric` em vez de recalcular. Faça isso só se o resultado ficar mais simples.

- [ ] **Step 2: Specs de saída**

`web/tests/e2e/comparison.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { mockApi } from './mock-api.js';

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test('clicking a ranking item opens the country with its rank and share', async ({ page }) => {
  await page.goto('/');
  const ranking = page.getByRole('region', { name: 'Top 10 — casos em 09/03/2023' });

  await ranking.getByRole('link', { name: 'Brasil' }).click();

  await expect(page).toHaveURL(/\/paises\/BRA$/);
  const card = page.getByRole('region', { name: 'Brasil' });
  await expect(card).toContainText('nº 2 de 4');
  await expect(card).toContainText('30,0%');
  await expect(ranking.getByRole('link', { name: 'Brasil' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('changing the period updates the time card and the URL', async ({ page }) => {
  await page.goto('/paises/BRA');
  const card = page.getByRole('region', { name: 'Por tempo' });
  await expect(card).toContainText('3.600');

  await page.getByRole('radio', { name: '7 dias' }).click();

  await expect(page).toHaveURL(/\/paises\/BRA\?period=7d$/);
  await expect(card).toContainText('840');
  await expect(card).toContainText('De 03/03/2023 a 09/03/2023');
});
```

Rode `npm run test:e2e -w web`. Esperado: todos os specs verdes, os antigos e os novos.

- [ ] **Step 3: ADR 0007**

`docs/adr/0007-front-shadcn-tailwind.md`:

```markdown
# ADR 0007 — Front: shadcn/ui e Tailwind v4

Data: 2026-10-23 · Status: aceita

## Contexto

O usuário decide o visual do dashboard e escolheu o bloco `dashboard-01` do shadcn/ui, no tema claro padrão. Se um projeto do Figma chegar, ele prevalece. A F6 acrescenta o card Por tempo e o ranking, e o CSS escrito à mão da F4 não escalava.

## Decisão

- **Base:**
  - shadcn/ui pelo CLI fixado (`npx shadcn@4.22.1`), estilo `radix-nova`, base Radix (pacote `radix-ui`), ícones `lucide-react`;
  - Tailwind CSS v4 com `@tailwindcss/vite`;
  - fonte Geist servida do próprio bundle (`@fontsource-variable/geist`), sem host externo.
- **Código gerado:** `web/src/components/ui`, `web/src/hooks/use-mobile.ts` e `web/src/lib/utils.ts` vêm do CLI e são versionados.
  - Ajustes locais:
    - textos em pt-BR;
    - `SidebarInset` como `<div>`, para o `<main>` da página ser o único landmark principal.
  - O ESLint desliga só ali `react-refresh/only-export-components` e `react-hooks/set-state-in-effect`.
  - O `cn` vem do pacote `cn`, do próprio shadcn.
- **Do bloco `dashboard-01`:**
  - fica o casco: `SidebarProvider`, a sidebar com Mapa e Sobre e o cabeçalho com busca, métrica e período (só nas rotas do mapa);
  - o grid de cards segue o `section-cards` do bloco;
  - saem a tabela com arrastar-e-soltar (`@dnd-kit`, `@tanstack/react-table`), o gráfico de área, os menus de documentos e de usuário e os dados de exemplo;
  - o ranking usa só o `Table` do shadcn. Os gráficos da F7 voltam com o `chart` do shadcn e o Recharts.
- **Alias:** `@/` aponta para `web/src` e serve só para a camada do shadcn; o resto do código continua com import relativo.
- **Leaflet:**
  - o preflight do Tailwind limita a largura de `img`, e uma regra em `.leaflet-container img` desfaz isso para os tiles;
  - o mapa fica num `Card` com `isolate`, para os z-index do Leaflet não passarem por cima do menu lateral nem da faixa de dados.
- **Controles:** métrica e período são `ToggleGroup` de seleção única, com `role="radio"` e `aria-checked`. Um segundo clique no item ativo é ignorado.
- **Testes:** o `jsdom` não tem `matchMedia`, e o setup dos testes o simula.

## Consequências

- Componente novo do shadcn: `npx shadcn@4.22.1 add <nome>` dentro de `web/`, depois `npx prettier --write`.
- Um projeto do Figma troca tokens e classes; a estrutura de componentes e os nomes acessíveis continuam.
- Atualizar o CLI muda o código gerado. Faça isso numa tarefa própria e revise o diff.
```

- [ ] **Step 4: CLAUDE.md**

1. Em "Estado atual", troque a frase final da linha da F6a (`A F6b (front com shadcn/ui) vem a seguir.`) por nada e acrescente, logo abaixo dela:

```markdown
- F6b Front do Nível 2 concluída em 2026-10-23 (PR #9): shadcn/ui (estilo `radix-nova`, Radix) + Tailwind v4 a partir do bloco `dashboard-01` (sidebar Mapa/Sobre, cabeçalho com busca, métrica e período), período em `?period=7d|30d|90d|all` (padrão `30d`), card Por tempo (novos no período pela série mensal, cortado em `coverage.from` com aviso), ranking Top 10 com link para o país e destaque do selecionado, E2E de comparação e ranking com a API mockada (ADR 0007). Com isso a F6 está concluída.
```

   Se o PR não for o #9, corrija o número ao abrir o PR.

2. Em "Arquitetura", troque a linha do `web` por:

```markdown
- `web`: React 19 + Vite + TypeScript, React Router, TanStack Query, shadcn/ui (Radix) + Tailwind CSS v4, React Leaflet 5 + Leaflet, Recharts.
```

3. Em "Estrutura", troque a linha `web/src/{app,config,pages,features/{map,stats,charts,ranking,search},shared/{api,ui,format,url},test}` por:

```text
web/src/{app,config,pages,features/{map,stats,charts,ranking,search},shared/{api,ui,format,url,period},test}
web/src/{components/ui,hooks,lib}       # gerados pelo CLI do shadcn (ADR 0007)
```

4. Em "Decisões":
   - **Adotadas:** acrescente `· D-03 card Por tempo: novos no período (7, 30 ou 90 dias ou tudo, padrão 30, terminando na data de referência) · Front: shadcn/ui + Tailwind v4 a partir do dashboard-01, tema claro; um projeto do Figma do usuário prevalece (ADR 0007)`.
   - **Em aberto:** remova a linha `D-03 Card "Por tempo" (sugestão: novos no período escolhido).`

5. Em "Frontend", troque `- Layout do wireframe: mapa no topo; 3 cards (Geral, Por país, Por tempo); 2 gráficos de linha embaixo; ranking. No celular, tudo empilhado.` por:

```markdown
- Layout: casco do `dashboard-01` (sidebar e cabeçalho com busca, métrica e período); mapa no topo; 3 cards (Geral, Por país, Por tempo); 2 gráficos de linha embaixo; ranking Top 10. No celular, tudo empilhado e a sidebar vira menu.
```

- [ ] **Step 5: Verificar e commitar**

Rode `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` e `npm run test:e2e -w web`. Esperado: tudo verde.

```bash
git add -A web docs/adr/0007-front-shadcn-tailwind.md CLAUDE.md
git commit -m "test: cover comparison and ranking end to end; docs for phase 6b"
```
