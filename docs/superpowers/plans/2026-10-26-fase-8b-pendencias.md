# Fase 8b — Pendências de comportamento e testes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolver as pendências do "Adiado" com fase-alvo F8 (API, comportamento do front, testes instáveis ou fracos) e fechar a F8.

**Architecture:** Na API, o estado em memória do `DataStateService` passa a carregar as datas incompletas da cobertura. No front, os gráficos ganham um hook próprio (`useChartSeries`) que guarda o intervalo visível junto com os dados e mantém o resultado anterior enquanto o novo chega; os três seletores passam por um componente único (`ChoiceToggle`); o popup do marcador só monta o minigráfico aberto e reabre a cada nova navegação ao país selecionado. O E2E passa a rodar contra o build de produção.

**Tech Stack:** Express 5 + Prisma 7 (Postgres), Vitest + Supertest; React 19, TanStack Query 5, React Router 8, React Leaflet 5, Recharts 3.8, shadcn/ui (Radix); Playwright + axe.

**Spec:** `docs/superpowers/specs/2026-10-26-fase-8b-pendencias-design.md`

## Global Constraints

- Conversa e documentação em pt-BR; código, nomes de arquivo e identificadores em inglês; textos da interface em pt-BR.
- TypeScript `strict`, sem `any`; ESLint `recommendedTypeChecked` (inclui as regras do React Hooks 7: nada de ler/escrever `ref.current` durante o render, nada de `setState` síncrono em efeito).
- Camadas da API: SQL só em `repositories`; regra em `services`.
- Testes e CI só com fixtures inventadas; zero chamadas reais; nunca rodar `npm run sync`; nunca ler, imprimir ou commitar `.env`.
- Componentes gerados em `web/src/components/ui/`: não editar, exceto `sidebar.tsx`, que já tem ajustes locais (ADR 0007).
- Esc no popup fecha só o popup; o país continua selecionado (decisão do usuário).
- Portões da F8a continuam valendo: axe (WCAG 2.1 A/AA + `region`) sem violações, Lighthouse com as notas do ADR 0008, guarda de hosts externos, teste de bundle.
- Antes de cada commit: `npm run lint`, `npm run typecheck` e `npm test` verdes na raiz; nas tarefas que tocam a API com SQL, também `npm run test:integration -w api` (Postgres do `docker compose`, porta 5435; só o container `mapp-db-1`); nas que tocam o front, também `npm run test:e2e -w web`. Um commit por tarefa, Conventional Commits em inglês.

---

### Task 1: API — datas incompletas no estado em memória

**Files:**
- Modify: `api/src/repositories/data-state.repository.ts` (`findIncompleteDates`, tirar `isCompleteDate`)
- Modify: `api/src/services/data-state.service.ts`
- Modify: `api/tests/unit/services/data-state.service.test.ts`
- Modify: `api/tests/helpers/fake-repositories.ts`
- Test: o arquivo de integração que já cobre o repositório de leitura (`api/tests/integration/read-repositories.test.ts` ou `coverage.test.ts` — o que já testa `isCompleteDate`/`findCoverage`)

**Interfaces:**
- Produces: `DataStateRepository.findIncompleteDates(sourceId: number): Promise<string[]>` — datas (`YYYY-MM-DD`, ordenadas) da view `global_daily_stat` entre a primeira e a última data completa (inclusive) que **não** são completas (RN-06). `DataState` ganha `incompleteDates: ReadonlySet<string>`. `isCompleteDate` sai do repositório (e do fake) se ficar sem uso.

- [ ] **Step 1: Teste unitário que falha**

Em `api/tests/unit/services/data-state.service.test.ts`, troque o stub `isCompleteDate` por `findIncompleteDates: vi.fn<DataStateRepository['findIncompleteDates']>().mockResolvedValue([])` e ajuste os testes que dependiam de `isCompleteDate`:

```ts
  it('rejects a date inside the range that is not complete', async () => {
    const repo = stubRepo();
    repo.findIncompleteDates.mockResolvedValue(['2023-03-05']);
    const service = createDataStateService(repo, 'api_ninjas');

    await expect(service.resolveDate('2023-03-05')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { from: '2023-03-01', to: '2023-03-09' },
    });
  });

  it('validates dates from memory, without a query per request', async () => {
    const repo = stubRepo();
    const service = createDataStateService(repo, 'api_ninjas');

    await service.resolveDate('2023-03-05');
    await service.resolveDate('2023-03-06');

    expect(repo.findIncompleteDates).toHaveBeenCalledTimes(1);
  });

  it('reloads the incomplete dates when the data version changes', async () => {
    let clock = 0;
    const repo = stubRepo();
    const service = createDataStateService(repo, 'api_ninjas', { now: () => clock });

    await service.resolveDate('2023-03-05');
    repo.findDataVersion.mockResolvedValue(8);
    repo.findIncompleteDates.mockResolvedValue(['2023-03-05']);
    clock += 10_000;

    await expect(service.resolveDate('2023-03-05')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(repo.findIncompleteDates).toHaveBeenCalledTimes(2);
  });
```

Adapte ao formato real do `stubRepo` do arquivo (nome do mock de `findDataVersion`, valor inicial do `dataVersion`, como o relógio é injetado). No teste "rejects %s outside the coverage", troque `expect(repo.isCompleteDate).not.toHaveBeenCalled()` por nada (a validação fora do intervalo nunca consulta o banco de qualquer forma).

Run: `npm test -w api -- tests/unit/services/data-state.service.test.ts` → FAIL (método inexistente).

- [ ] **Step 2: Repositório**

Em `api/src/repositories/data-state.repository.ts`:

```ts
  findIncompleteDates(sourceId: number): Promise<string[]>;
```

```ts
    // RN-06: dates of the view inside the coverage where some metric misses its own N.
    async findIncompleteDates(sourceId) {
      const rows = await db.$queryRaw<{ statDate: Date }[]>`
        WITH complete AS (${completeDatesSql(sourceId)}),
        bounds AS (SELECT min(stat_date) AS first, max(stat_date) AS last FROM complete)
        SELECT DISTINCT g.stat_date AS "statDate"
        FROM global_daily_stat g, bounds
        WHERE g.source_id = ${sourceId}
          AND g.stat_date BETWEEN bounds.first AND bounds.last
          AND g.stat_date NOT IN (SELECT stat_date FROM complete)
        ORDER BY g.stat_date`;
      return rows.map((row) => toIsoDate(row.statDate));
    },
```

Remova `isCompleteDate` da interface e da implementação. Datas que não estão na view (nenhuma linha) entre `from` e `to` também são incompletas: se a view puder ter buracos de calendário dentro da cobertura, gere as datas com `generate_series(bounds.first, bounds.last, interval '1 day')` em vez de ler só a view — escolha a forma que o teste de integração do Step 4 provar correta, e diga no relatório.

- [ ] **Step 3: Serviço**

Em `api/src/services/data-state.service.ts`: `DataState` ganha `incompleteDates: ReadonlySet<string>`; `load()` busca `repo.findIncompleteDates(sourceId)` junto com `findCoverage` (só quando o `dataVersion` muda) e guarda `new Set(dates)`; `resolveDate` troca `!(await repo.isCompleteDate(state.sourceId, date))` por `state.incompleteDates.has(date)`. Atualize `api/tests/helpers/fake-repositories.ts`: `findIncompleteDates: () => Promise.resolve(<datas entre FAKE_FROM e FAKE_REFERENCE que não estão em GLOBAL>)` (calcule a partir das fixtures do arquivo, preservando o comportamento atual dos testes de API).

Run: `npm test -w api` → PASS.

- [ ] **Step 4: Integração**

No teste de integração que já cobria `isCompleteDate` (ou `findCoverage`), troque/acrescente um caso para `findIncompleteDates`: uma data no meio da cobertura com só uma métrica no N aparece na lista; datas completas e datas antes da primeira/depois da última completa não aparecem.

Run: `npm run test:integration -w api` → PASS.

- [ ] **Step 5: Verificar e commitar**

```bash
npx prettier --write api/src api/tests
npm run lint && npm run typecheck && npm test && npm run test:integration -w api
git add api
git commit -m "perf: validate dates against the in-memory coverage"
```

---

### Task 2: API — testes que faltam

**Files:**
- Test: `api/tests/api/timeseries.test.ts`
- Test: os arquivos de integração do sync (`api/tests/integration/snapshot.test.ts`, `full-sync.test.ts`)

**Interfaces:** nenhuma nova.

Antes de escrever, procure se o caso já existe (`grep -n` pelos nomes e pelas condições). Se já existir, não duplique: cite no relatório o arquivo e a linha que o cobrem.

- [ ] **Step 1: Limite superior das séries (Supertest)**

Em `api/tests/api/timeseries.test.ts`, para `/api/v1/global/timeseries` e `/api/v1/countries/BRA/timeseries`: `to` um dia depois da data de referência das fixtures (`FAKE_REFERENCE` de `api/tests/helpers/fake-repositories.ts`) → 400, `error.code` `VALIDATION_ERROR`, `details` `{ from: FAKE_FROM, to: FAKE_REFERENCE }`, `Cache-Control: no-store`.

- [ ] **Step 2: Rollback do alias `pending` (integração)**

No teste de integração do sync que cobre "alias sem mapeamento" (procure `pending`): quando a resposta da fonte traz um nome sem mapeamento, o alias é gravado `pending`, **nenhuma** linha de `daily_stat` desse nome/país é gravada e o run fecha `partial`. Se o código grava o alias e as linhas numa transação, o teste prova que a falha no meio não deixa linha parcial (siga como o código realmente faz; não mude o código do sync nesta tarefa — se o comportamento divergir do CLAUDE.md, pare e reporte DONE_WITH_CONCERNS).

- [ ] **Step 3: Refresh na recuperação de órfão (integração)**

Confirme que `full-sync.test.ts` já tem "refreshes the view before closing a data-writing orphan" (F6a). Se o modo snapshot também recupera órfãos, garanta o mesmo caso no `snapshot.test.ts` (a view reflete as linhas do órfão depois da recuperação). Se ambos já existirem, só registre no relatório.

- [ ] **Step 4: Verificar e commitar**

```bash
npx prettier --write api/tests
npm run lint && npm run typecheck && npm test && npm run test:integration -w api
git add api/tests
git commit -m "test: cover the series upper bound, pending aliases and orphan refresh"
```

(Se nada novo precisou ser escrito, não commite e reporte DONE com as referências.)

---

### Task 3: Front — links, `/paises/XYZ` e nome do país

**Files:**
- Create: `web/src/shared/url/dashboard-search.ts` (+ teste)
- Modify: `web/src/app/app-sidebar.tsx`, `web/src/app/site-header.tsx`, `web/src/pages/not-found-page.tsx`
- Modify: `web/src/features/charts/series-fallback.tsx`
- Modify: `web/src/features/charts/cumulative-chart.tsx`, `web/src/features/charts/daily-new-chart.tsx`, `web/src/features/stats/period-card.tsx`
- Tests: os testes de componente desses arquivos e `web/src/app/app-sidebar.test.tsx`

**Interfaces:**
- Produces: `dashboardSearch(search: string): string` — devolve `?metric=…&period=…` só com esses dois parâmetros, na ordem `metric`, `period`, omitindo os ausentes (`''` se nenhum); `useCountryName(code: string | null): string | null` (em `web/src/shared/api/queries.ts` ou num arquivo próprio em `shared/api`) — nome do detalhe do país ou, enquanto carrega, da lista `useCountries` (qualquer métrica em cache serve; use a métrica ativa da URL via `useMetric`), senão o código; `null` sem país.

- [ ] **Step 1: Helper da busca, com teste**

```ts
// web/src/shared/url/dashboard-search.ts
// Links back to the map keep only the dashboard state, never unrelated query params.
export function dashboardSearch(search: string): string {
  const current = new URLSearchParams(search);
  const next = new URLSearchParams();
  for (const key of ['metric', 'period']) {
    const value = current.get(key);
    if (value !== null) next.set(key, value);
  }
  const text = next.toString();
  return text === '' ? '' : `?${text}`;
}
```

Teste (`dashboard-search.test.ts`): `'?period=7d&metric=deaths&x=1'` → `'?metric=deaths&period=7d'`; `'?x=1'` → `''`; `''` → `''`.

- [ ] **Step 2: Links**

"Mapa" (sidebar), "Mapp" (cabeçalho) e o link da 404 usam `{ pathname: '/', search: dashboardSearch(location.search) }`. "Sobre" na sidebar também mantém `dashboardSearch` (volta com o estado). Teste em `app-sidebar.test.tsx`: em `/paises/BRA?metric=deaths&period=7d&x=1`, o link "Mapa" aponta para `/?metric=deaths&period=7d`.

- [ ] **Step 3: `COUNTRY_NOT_FOUND` vira carregamento**

Em `series-fallback.tsx`, `COUNTRY_NOT_FOUND` devolve o skeleton (`loading`) em vez de `NO_DATA`, com o comentário: a página troca um país desconhecido pela visão mundial logo em seguida. Ajuste os testes que esperavam "Sem dados no período" nesse caso.

- [ ] **Step 4: Nome do país**

Implemente `useCountryName` e use-o no `CumulativeChart` (no lugar de `detail.data?.country.name ?? code`), no `DailyNewChart` (`place`) e no `PeriodCard` (`scope`; hoje fica `undefined` enquanto carrega). Teste: com o detalhe do país atrasado (`delay('infinite')` no MSW de `/countries/BRA`), o resumo do gráfico já mostra "Brasil", não "BRA".

- [ ] **Step 5: Verificar e commitar**

```bash
npx prettier --write web/src
npm run lint && npm run typecheck && npm test
npm run test:e2e -w web
git add web/src
git commit -m "fix: keep the dashboard state in links and the country name while loading"
```

---

### Task 4: Front — gráficos sem piscar, `useMemo` e "Tentar de novo"

**Files:**
- Modify: `web/src/shared/api/queries.ts` (`useChartSeries`)
- Modify: `web/src/features/charts/cumulative-chart.tsx`, `daily-new-chart.tsx`, `series-fallback.tsx`
- Tests: `cumulative-chart.test.tsx`, `daily-new-chart.test.tsx`, `queries.test.tsx`

**Interfaces:**
- Consumes: `ChartRanges` de `web/src/features/charts/series.ts` (mova o tipo para `shared` se o lint de camadas reclamar de `shared` importando `features`; o mais simples é o hook receber `{ fetch: { from; to }; visible: DateRange }` com o tipo declarado em `shared/period/period.ts`).
- Produces: `useChartSeries(code: string | null, metric: Metric, ranges: ChartRanges | null)` — `useQuery` com chave `['chart-series', code ?? 'world', metric, ranges?.fetch.from, ranges?.fetch.to]`, `granularity: 'day'`, `placeholderData: keepPreviousData`, desligado sem `ranges`; o `data` é a resposta da API **mais** `visible: DateRange` (o intervalo visível usado na requisição). `seriesFallback` deixa de receber objetos de consulta para o retry e passa a usar `useQueryClient().invalidateQueries({ queryKey: … })` — ver Step 3.

- [ ] **Step 1: Testes que falham**

- `queries.test.tsx`: `useChartSeries` devolve `visible` junto com os pontos; ao trocar o período, enquanto a nova resposta não chega, `isPlaceholderData` é `true` e os dados são os anteriores.
- `cumulative-chart.test.tsx`: ao trocar de `30d` para `7d` com a nova resposta atrasada (`delay` no MSW), o resumo anterior ("… de 08/02/2023 a 09/03/2023 …") continua na tela, dentro de um elemento com `aria-busy="true"`, e nenhum skeleton aparece; quando a resposta chega, o resumo novo aparece e `aria-busy` some.
- `daily-new-chart.test.tsx`: o mesmo para o resumo dos novos.

- [ ] **Step 2: Hook e gráficos**

- `useChartSeries` como descrito. Os dois gráficos passam a usá-lo (a série do mundo continua compartilhada: mesma chave).
- Os gráficos calculam tudo a partir de `data.visible` (não do `ranges` atual): filtro dos pontos, resumo, aviso "Dados a partir de…".
- `useMemo` para as linhas (`cumulativeRows`/`dailyNewRows`), os mapas por data, o resumo e o `config` do gráfico, com dependências nos dados, na escala e no nome. Os hooks ficam antes de qualquer retorno condicional.
- Com `isPlaceholderData`, o conteúdo (gráfico + resumo) fica num wrapper com `aria-busy="true"` e `opacity-60` (`transition-opacity`, respeitando `motion-reduce`).

- [ ] **Step 3: "Tentar de novo"**

`seriesFallback` recebe um `onRetry: () => void` em vez de chamar `refetch` das consultas capturadas. Cada componente passa:

```ts
const queryClient = useQueryClient();
const retry = () => {
  // A stale coverage would ask for dates out of range: refresh it, then the active series.
  void meta.refetch().then(() => queryClient.invalidateQueries({ queryKey: ['chart-series'] }));
};
```

(o card Por tempo usa `['timeseries']`, o minigráfico também). Os testes de retry existentes continuam passando.

- [ ] **Step 4: Verificar e commitar**

```bash
npx prettier --write web/src
npm run lint && npm run typecheck && npm test
npm run test:e2e -w web
git add web/src
git commit -m "fix: keep the previous chart while the next period loads"
```

---

### Task 5: Front — popup do marcador

**Files:**
- Modify: `web/src/features/map/country-markers.tsx`, `web/src/features/map/world-map.tsx`, `web/src/pages/dashboard-page.tsx`
- Modify (se a causa estiver nele): `web/src/features/charts/country-sparkline.tsx`
- Test: `web/tests/e2e/history.spec.ts` (o mapa não tem teste de componente)

**Interfaces:**
- Produces: `WorldMapProps.selectionKey: string` (o `location.key` da navegação atual), repassado a `CountryMarkers` e ao marcador.

- [ ] **Step 1: E2E que falha**

Em `history.spec.ts`, acrescente:

```ts
test('selecting the open country again reopens its popup', async ({ page }) => {
  await page.goto('/');
  const marker = page.getByRole('button', { name: /^Brasil:/ });
  await marker.click();
  const popup = page.locator('.leaflet-popup');
  await expect(popup).toContainText('Brasil');

  await marker.focus();
  await page.keyboard.press('Escape');
  await expect(popup).toHaveCount(0);

  const search = page.getByRole('combobox', { name: 'Buscar país' });
  await search.fill('brasil');
  await search.press('Enter');

  await expect(popup).toContainText('Casos acumulados de 22/01/2020');
});

test('a closed popup does not fetch its series again', async ({ page }) => {
  const weekly: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('granularity=week')) weekly.push(request.url());
  });
  await page.goto('/');
  const marker = page.getByRole('button', { name: /^Brasil:/ });
  await marker.click();
  await expect(page.locator('.leaflet-popup')).toContainText('Casos acumulados de 22/01/2020');
  await marker.focus();
  await page.keyboard.press('Escape');
  const before = weekly.length;

  await page.getByRole('radio', { name: 'Mortes' }).click();
  await page.waitForLoadState('networkidle');

  expect(weekly).toHaveLength(before);
});
```

Run: `npm run test:e2e -w web -- history.spec.ts` → os dois novos falham.

- [ ] **Step 2: Minigráfico só com o popup aberto**

No `CountryMarker`, um estado `popupOpen` ligado em `popupopen`/`popupclose` (pelos `eventHandlers` do `CircleMarker` ou no efeito que já escuta esses eventos — sem `setState` síncrono dentro do corpo do efeito; dentro do handler do evento é permitido). O `<CountrySparkline />` só renderiza com `popupOpen`.

- [ ] **Step 3: Reabrir a cada nova seleção**

`DashboardPage` passa `selectionKey={location.key}` ao `WorldMap`, que repassa ao marcador. O efeito que abre/fecha o popup passa a depender de `[selected, selectionKey]`: selecionado → `openPopup()`. Confirme no E2E que a busca pelo país já aberto gera uma navegação com `key` nova; se o React Router reaproveitar a mesma entrada sem mudar o `key`, faça a busca/ranking navegarem com `state: { selectedAt: Date.now() }` e use `location.key` mesmo assim (o `state` força uma entrada nova). Explique no relatório o que foi necessário.

- [ ] **Step 4: Aviso `width(0)/height(0)` do Recharts**

Reproduza (o aviso aparece no log do `webServer` do E2E). Identifique qual gráfico o emite e por quê (provavelmente o `ResponsiveContainer` medindo um contêiner ainda sem tamanho: popup antes do layout, ou gráfico dentro de um card ainda oculto). Corrija sem mudar o visual e sem editar `web/src/components/ui/chart.tsx` — por exemplo, só montar o gráfico depois que o contêiner tem tamanho, ou dar ao contêiner do minigráfico dimensões fixas em pixels. Se a única correção for editar o `chart.tsx` gerado, não edite: registre no relatório para a decisão.

- [ ] **Step 5: Verificar e commitar**

```bash
npx prettier --write web/src web/tests
npm run lint && npm run typecheck && npm test
npm run test:e2e -w web
git add web/src web/tests
git commit -m "fix: reopen the popup on a new selection and mount its chart only while open"
```

---

### Task 6: Front — setas que selecionam e cookie da sidebar

**Files:**
- Create: `web/src/shared/ui/choice-toggle.tsx` (+ teste)
- Modify: `web/src/shared/ui/metric-toggle.tsx`, `web/src/shared/ui/period-toggle.tsx`, `web/src/features/charts/scale-toggle.tsx`
- Modify: `web/src/components/ui/sidebar.tsx` (só a gravação do cookie)
- Tests: `web/src/app/dashboard-controls.test.tsx`

**Interfaces:**
- Produces: `ChoiceToggle<T extends string>(props: { label: string; value: T; options: readonly T[]; labels: Record<T, string>; onChange: (value: T) => void; size?: 'default' | 'sm'; className?: string })`.

- [ ] **Step 1: Teste que falha**

`choice-toggle.test.tsx`: com `options = ['a', 'b', 'c']` e `value = 'a'`, focar o item "A" e pressionar `ArrowRight` chama `onChange('b')` (e o foco vai para "B"); clicar em "C" chama `onChange('c')`; clicar no item ativo não chama `onChange`. Use `@testing-library/user-event` se já estiver instalado; senão `fireEvent.keyDown` + verificação do foco.

- [ ] **Step 2: Componente**

Um `ToggleGroup` `type="single"` como os atuais (mesmas classes e props) cujo `ToggleGroupItem` tem `onFocus={(event) => { if (event.currentTarget.matches(':focus-visible') && item !== value) onChange(item); }}` — a seleção segue o foco do teclado (padrão de botões de opção); foco por clique não dispara (o clique já seleciona pelo `onValueChange`). Mantém o tratamento do `''` que o Radix manda ao clicar no item ativo. Se o `:focus-visible` não for confiável no jsdom, use um sinal de teclado (flag ligada em `onKeyDown` do grupo) e explique.

Refatore `MetricToggle`, `PeriodToggle` e `ScaleToggle` para usar o `ChoiceToggle` (mesmos rótulos, mesmo `aria-label`, mesma aparência). Os testes existentes dos três continuam passando.

- [ ] **Step 3: Cookie**

Em `web/src/components/ui/sidebar.tsx`, remova a gravação de `document.cookie` (e as constantes `SIDEBAR_COOKIE_NAME`/`SIDEBAR_COOKIE_MAX_AGE` se ficarem sem uso), com um comentário curto no lugar: o estado não é lido de volta, então não é persistido.

- [ ] **Step 4: Verificar e commitar**

```bash
npx prettier --write web/src
npm run lint && npm run typecheck && npm test
npm run test:e2e -w web
git add web/src
git commit -m "fix: arrow keys select in the toggles; drop the unused sidebar cookie"
```

---

### Task 7: Testes mais firmes, E2E no build de produção e documentação

**Files:**
- Modify: `web/playwright.config.ts`, `web/package.json` (script `build:e2e`)
- Modify: `.gitignore`, `.prettierignore`, `eslint.config.js` (`dist-e2e`)
- Modify: `web/tests/e2e/a11y.spec.ts`, `web/tests/e2e/history.spec.ts`
- Modify: `web/src/features/charts/country-sparkline.test.tsx`
- Modify: `docs/adr/0008-quality-gates.md`, `CLAUDE.md`

- [ ] **Step 1: E2E contra o build**

`web/package.json`:

```json
    "build:e2e": "VITE_API_URL=http://api.test VITE_TILES_URL='http://tiles.test/{z}/{x}/{y}.png' VITE_TILES_ATTRIBUTION='&copy; Tiles de teste' vite build --outDir dist-e2e",
```

`web/playwright.config.ts`: o `webServer.command` passa a `npm run build:e2e && npx vite preview --outDir dist-e2e --port ${PORT} --strictPort`, sem o bloco `env` (as variáveis vão no build), `timeout: 120_000`. Atualize o comentário. Ignore `dist-e2e` no `.gitignore` (`dist-e2e/`), `.prettierignore` (`**/dist-e2e`) e `eslint.config.js` (`'**/dist-e2e'`).

Rode `npm run test:e2e -w web` **três vezes seguidas** e anote o resultado de cada uma (nome de qualquer teste que falhar). Se o "trocar o período" ou a Groenlândia ainda falharem, investigue a causa (trace com `--trace on`) e corrija o teste ou o código; não acrescente `waitForTimeout`.

- [ ] **Step 2: axe espera os contornos**

Em `a11y.spec.ts`, nos testes das páginas com mapa (mundo, país, popup, `/paises/XYZ`), antes de analisar: `await expect(page.locator('path[data-iso3]').first()).toBeAttached();`.

- [ ] **Step 3: Checagens fracas**

- `history.spec.ts`, teste do popup: antes de conferir que não houve busca semanal, `await page.waitForLoadState('networkidle');`.
- `history.spec.ts`, novo teste: em `/paises/BRA`, guarde os textos dos rótulos do eixo Y do gráfico acumulado (`.recharts-yAxis .recharts-cartesian-axis-tick-value`), clique em "Log" e espere os rótulos mudarem (`expect.poll` sobre o array de textos `.not.toEqual(antes)`).
- `country-sparkline.test.tsx`: o listener do `server.events` é removido num `afterEach(() => server.events.removeAllListeners())`, não no fim do corpo do teste.

- [ ] **Step 4: ADR 0008**

Acrescente que o E2E roda contra o build de produção (`build:e2e` + `vite preview`) e por quê (compilação sob demanda do servidor de desenvolvimento deixava a primeira carga instável).

- [ ] **Step 5: CLAUDE.md**

1. Em "Estado atual", depois da linha da F8a, acrescente (troque `#12` pelo número real de `gh pr list --state all --limit 1 --json number --jq '.[0].number'` + 1):

```markdown
- F8b Pendências concluída em 2026-10-26 (PR #12): datas incompletas da cobertura validadas em memória (sem consulta por requisição), testes do limite superior das séries, links para "/" mantendo `?metric=`/`?period=`, gráficos mantendo o resultado anterior esmaecido enquanto o novo carrega (`keepPreviousData`, `useMemo`), "Tentar de novo" invalidando as séries ativas, popup que só monta o minigráfico aberto e reabre a cada nova seleção, setas que selecionam nos seletores, E2E contra o build de produção. Com isso a F8 está concluída.
```

2. No "Adiado", remova os itens resolvidos: `mais da revisão da F3: menos idas ao banco por requisição (data validada pelo estado em memória, F8)`; `testes do limite superior de datas da série, do rollback do alias pending e do refresh na recuperação de órfão (F8)`; o bloco "Da F6b (F8): …" inteiro exceto o que não foi resolvido; o bloco "Da F7 (F8): …" inteiro exceto o que não foi resolvido; "Da F8a (F8b): …". Itens que a execução não conseguiu resolver (por exemplo, o aviso do Recharts se exigiu editar o `chart.tsx`) ficam, com fase-alvo F9.
3. Em "Decisões" → "Adotadas", no fim da última linha: ` · a soma do card Por tempo cobre só as datas completas (RN-06) · o \`chart.tsx\` gerado mantém o override do ESLint e os \`--chart-*\` do tema escuro ficam sem ajuste (só tema claro, ADR 0007) · Esc no popup fecha só o popup; o país continua selecionado`.

- [ ] **Step 6: Verificar e commitar**

```bash
npx prettier --write web docs/adr/0008-quality-gates.md CLAUDE.md
npm run lint && npm run typecheck && npm test
npm run test:e2e -w web
npm run lighthouse -w web
git add web .gitignore .prettierignore eslint.config.js docs/adr/0008-quality-gates.md CLAUDE.md
git commit -m "test: run E2E on the production build and firm up weak checks; docs for phase 8b"
```
