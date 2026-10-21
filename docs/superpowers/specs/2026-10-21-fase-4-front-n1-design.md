# Fase 4 — Front N1 (design)

Data: 2026-10-21 · Branch: `feat/front-n1`

## Objetivo

Entregar o primeiro front do Mapp:
- mapa-múndi com polígonos neutros clicáveis e marcadores proporcionais;
- clique e busca de país;
- rotas `/`, `/paises/:code`, `/sobre` e `*`;
- cards Geral e Por país;
- faixa fixa com a data de referência e a fonte.

Tudo é alimentado só pela API da F3.

**Critério de saída:** os E2E do Playwright passam localmente. Eles cobrem abrir o mapa, clicar num país (Brasil → `/paises/BRA`, card atualizado) e abrir o link direto. Lint, typecheck, `npm test` e build ficam verdes.

## Decisões fechadas

| Tema | Decisão |
| --- | --- |
| Card Geral | Casos **e** mortes: `total` e `new` na data de referência. Não depende da métrica ativa. |
| Card Por país | Só a métrica ativa: total, participação % (RN-04) e posição "nº X de Y" (RN-05). |
| Polígonos do GeoJSON | Camada neutra de contornos, sem cor por dado (o coroplético fica para depois). Clicáveis, com os marcadores por cima. |
| Polígono sem país na base | Herda o país soberano: `GRL→DNK`, `PRI→USA`, `FLK→GBR`, `NCL→FRA`, `ATF→FRA`, `SOL→SOM`, `CYN→CYP`. `TKM` é soberano, mas não está na base, então fica sem link e não é clicável. |
| Tiles | Configuráveis por `VITE_TILES_URL`/`VITE_TILES_ATTRIBUTION`. O padrão do `.env.example` é o CARTO Positron. |
| Métrica na URL | `?metric=cases\|deaths`. O padrão é `cases`, e um valor inválido também vira `cases`. A métrica se mantém ao navegar entre países. |
| Código inválido | `/paises/XYZ` (formato inválido, 404 `COUNTRY_NOT_FOUND` ou entidade não geográfica) mostra o aviso "País não encontrado" com a visão mundial. |
| Data | A F4 usa só a data de referência (sem `?date=`). Período e séries ficam para F6/F7. |
| Card Por tempo, gráficos, ranking | Ficam fora da F4 (F6/F7), sem placeholders. |

## Dependências (`web`)

| Pacote | Uso |
| --- | --- |
| `react-router` 8 | Rotas (modo declarativo `BrowserRouter`/`Routes`) |
| `@tanstack/react-query` 5 | Cache e estados das requisições |
| `leaflet` 1.9 + `react-leaflet` 5 (+ `@types/leaflet`) | Mapa |
| `openapi-fetch` | Cliente tipado pelos tipos gerados |
| `openapi-typescript` 7 (dev) | Gera `schema.d.ts` a partir de `docs/openapi.yaml` |
| `msw` 3 (dev) | Mock da API nos testes Vitest |

O `openapi-typescript` 7 declara a peer `typescript ^5.x`, o que dá ERESOLVE com o TS `~6.0.3` (ADR 0001). A solução é um `overrides` no `package.json` raiz:

```json
"overrides": { "openapi-typescript": { "typescript": "$typescript" } }
```

Isso foi verificado num probe: instala e gera os tipos sem erro. Fica registrado no ADR 0006.

Recharts entra na F7. O axe entra na F8.

## Estrutura

```text
web/.env.example
web/src/
  main.tsx                         # QueryClientProvider + BrowserRouter + App
  app/app.tsx                      # <Routes> dentro do layout
  app/layout.tsx                   # cabeçalho (nav Mapa/Sobre), faixa de dados, <Outlet>, rodapé
  app/query-client.ts              # createQueryClient(): sem retry em 4xx, 1 retry em 5xx/rede
  config/env.ts                    # lê e valida VITE_* (erro claro se faltar)
  pages/dashboard-page.tsx         # "/" e "/paises/:code"
  pages/about-page.tsx             # "/sobre"
  pages/not-found-page.tsx         # "*"
  features/map/world-map.tsx       # MapContainer + TileLayer + camadas
  features/map/country-polygons.tsx
  features/map/country-markers.tsx
  features/map/map-legend.tsx
  features/map/marker-scale.ts     # raio ∝ √total
  features/map/polygon-links.ts    # iso3 do polígono → código da base
  features/map/use-geo.ts          # fetch do GeoJSON
  features/stats/global-card.tsx
  features/stats/country-card.tsx
  features/search/country-search.tsx
  features/search/normalize.ts     # minúsculas sem acento
  shared/api/schema.d.ts           # gerado (não editar)
  shared/api/client.ts             # openapi-fetch + ApiError
  shared/api/queries.ts            # useMeta, useGlobal, useCountries, useCountry
  shared/format/format.ts          # formatNumber, formatPercent, formatDate, formatRank
  shared/ui/{skeleton,error-state,empty-state,data-banner,site-footer}.tsx
  shared/url/use-metric.ts         # lê/escreve ?metric
  test/{setup.ts,server.ts,handlers.ts,fixtures.ts,render.tsx}
web/scripts/api-types.ts           # gera schema.d.ts (usado pelo script e pelo teste)
web/tests/e2e/{fixtures.ts,mock-api.ts,map.spec.ts,navigation.spec.ts}
```

O `web` não importa nada de `api/`. Ele lê só `docs/openapi.yaml`, que é um artefato de contrato.

## Tipos e cliente

- `npm run api:types -w web` roda `scripts/api-types.ts`, que chama `openapiTS` + `astToString` sobre `../docs/openapi.yaml` e grava `src/shared/api/schema.d.ts`, formatado pelo Prettier.
- `scripts/api-types.test.ts` regenera o conteúdo em memória e o compara com o arquivo versionado. Se divergirem, o teste falha com a mensagem "rode npm run api:types -w web".
- **Conferência do OpenAPI** (pendência da F3):
  - âncoras YAML (`aliasDuplicateObjects: false`);
  - `default` ao lado de `$ref` em `metric`;
  - datas sem `pattern`/`format`;
  - `X-Request-Id`.

  Só se corrige na api (`api/src/openapi/document.ts` e schemas) o que **impedir ou distorcer** os tipos gerados. O resto fica registrado como está. A decisão vai para o ledger e o CLAUDE.md.
- `client.ts` exporta:
  - `api = createClient<paths>({ baseUrl: env.apiUrl })`;
  - a classe `ApiError extends Error { status, code, requestId }`;
  - `unwrap(result)`, que devolve `data` ou lança `ApiError`. Lê o envelope `{error}`; se o corpo não tiver o envelope, usa `code = 'INTERNAL_ERROR'`. Erro de rede vira `ApiError` com `status 0`, `code 'NETWORK_ERROR'`.
- `queries.ts` (chaves `['meta']`, `['global']`, `['countries', metric]`, `['country', code]`):
  - `useMeta()`, `useGlobal()`, `useCountries(metric)` e `useCountry(code | null)`, este último desligado quando `null`;
  - `staleTime` de 5 min, porque os dados são históricos.
- `query-client.ts`: `retry` desligado quando `ApiError.status` está entre 400 e 499; até 1 retry nos outros casos.

## Env do web

`config/env.ts` lê `import.meta.env`:

| Var | Regra | `.env.example` |
| --- | --- | --- |
| `VITE_API_URL` | obrigatória, `http(s)://…` sem barra final | `http://localhost:3333` |
| `VITE_TILES_URL` | obrigatória, contém `{z}`, `{x}`, `{y}` | `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png` |
| `VITE_TILES_ATTRIBUTION` | obrigatória, não vazia | `&copy; OpenStreetMap contributors &copy; CARTO` |

- `getEnv()` valida e lança `Error` listando as variáveis inválidas. O `main.tsx` chama `getEnv()` antes de renderizar.
- Nos testes Vitest os valores vêm de `vite.config.ts` (`test.env`). No E2E o Playwright sobe o Vite com essas variáveis no `webServer.env`, apontando a API para `http://api.test`, que é interceptada por `page.route`.
- A atribuição é texto do Leaflet (HTML controlado pelo próprio Leaflet a partir da env, que é um valor confiável).

## Rotas e layout

| Rota | Conteúdo |
| --- | --- |
| `/` | Dashboard sem país selecionado |
| `/paises/:code` | Dashboard com o país selecionado. `code` em maiúsculas: `/paises/bra` redireciona para `/paises/BRA` preservando a query. |
| `/sobre` | Fonte, cobertura, atribuições e entidades não geográficas |
| `*` | 404: "Página não encontrada" + link para o mapa |

O layout é o mesmo em todas as rotas (RN-10):

- **Cabeçalho:** "Mapp" (h1) e uma nav com `Mapa` e `Sobre`.
- **Faixa** `DataBanner`, lida do `/meta`:
  - "Dados históricos até DD/MM/AAAA · Fonte: {source.name}";
  - enquanto carrega, mostra um skeleton;
  - se `referenceDate` for `null`, "Dados ainda não carregados · Fonte: …";
  - em erro, "Não foi possível carregar a data de referência" + "Tentar de novo".
- **Rodapé:** "Fonte: {source.name} ({source.license}) · {source.attribution}", seguido de "Mapa: Natural Earth (domínio público) · Tiles: {VITE_TILES_ATTRIBUTION}" (o Leaflet também mostra a atribuição dos tiles no controle do mapa). Enquanto o `/meta` não chega, o rodapé mostra só a linha do mapa. Assim, a fonte, a licença e os tiles ficam visíveis em todas as rotas.

O dashboard, de cima para baixo:

1. busca de país + seletor de métrica (dois botões `aria-pressed`: Casos/Mortes);
2. aviso de país não encontrado (quando houver);
3. mapa;
4. cards Geral e Por país (lado a lado no desktop, empilhados abaixo de 768 px).

O título do documento é "Mapp — COVID-19" na home, "{nome} — Mapp" com país e "Sobre — Mapp" no `/sobre`.

## Mapa

`WorldMap` recebe `metric`, `selectedCode` e `onSelect(code)`.

- **`MapContainer`:**
  - `center [20, 0]`, `zoom 2`, `minZoom 2`, `worldCopyJump`;
  - altura de 480 px no desktop e 360 px no celular;
  - `TileLayer` com a URL e a atribuição da env.
- **Ao selecionar um país:**
  - o mapa centraliza (`flyTo` com zoom mínimo 3) nas coordenadas do país, vindas da lista `/countries`, e abre o popup;
  - sem coordenadas, não move o mapa.
- **`CountryPolygons`:**
  - `GeoJSON` com estilo neutro: borda `#9ca3af` de 0.5 px e preenchimento `#e5e7eb` com opacidade 0.3;
  - o polígono do país selecionado ganha borda `#1f2937` de 1.5 px.
  - **Resolução do código** (`polygon-links.ts`): `resolvePolygonCode(iso3, knownCodes)` devolve o próprio `iso3` se estiver em `knownCodes`. Senão, devolve `SOVEREIGN[iso3]` se ele existir e estiver em `knownCodes`; senão, `null`.
  - `knownCodes` vem da lista `/countries`, que já traz só `kind = country`.
  - Polígono com código `null`: sem cursor de clique e sem handler.
  - O clique chama `onSelect(code)`.
  - Os polígonos não recebem foco de teclado, porque os marcadores já cobrem a navegação.
- **`CountryMarkers`**, um `CircleMarker` por país da lista com `lat`/`lng` e `total > 0`:
  - raio de `markerRadius(total, maxTotal)`;
  - cor `#dc2626` em casos e `#7c3aed` em mortes, com borda branca e opacidade 0.6; o selecionado fica com opacidade 0.9 e borda escura;
  - ordem de desenho do maior para o menor, para que os pequenos fiquem por cima e clicáveis.
  - **Tooltip:** "{nome}: {total formatado} {casos|mortes}", no hover e no foco.
  - **Clique ou Enter/Espaço no foco:** `onSelect(code)`.
  - **Popup do selecionado:**
    - nome;
    - total e novos do dia da métrica ativa;
    - a data de referência.
  - **Acessibilidade:** no `add` do marcador, o elemento SVG (`getElement()`) recebe:
    - `tabindex="0"`;
    - `role="button"`;
    - `aria-label` "{nome}: {total} {casos|mortes}";
    - um listener de `keydown` (Enter/Espaço) e outros de `focus`/`blur` que abrem e fecham o tooltip.
  - **Estados:**
    - a camada fica vazia enquanto a lista carrega e um skeleton cobre o mapa;
    - em erro na lista, um erro local sobre o mapa com "Tentar de novo";
    - os tiles e polígonos continuam.
- **`marker-scale.ts`:**
  - `markerRadius(value, max)`: `value` ≤ 0, `null` ou `max` ≤ 0 → 0 (sem marcador).
  - Nos demais casos, o raio é `3 + 37 × √(value / max)`, arredondado para 1 casa. O mínimo é 3 e o máximo 40.
  - `legendSteps(max)` → 3 valores "bonitos" (1, 2 ou 5 × 10ⁿ) em torno de `max`, `max/10` e `max/100`, cada um com seu raio. Valores ≤ 0 saem da lista.
- **`MapLegend`:** um controle no canto inferior esquerdo com os 3 círculos e seus valores formatados, sob o título "Total de casos" ou "Total de mortes".
- **`use-geo.ts`:** `useQuery(['geo'])` com `fetch('/geo/countries-110m.geojson')`, `staleTime: Infinity`. Se falhar, o mapa fica sem polígonos, com um aviso discreto "Contornos indisponíveis"; os marcadores continuam.
- **CSS:** `leaflet/dist/leaflet.css` importado no `world-map.tsx`. Os testes Vitest não renderizam o Leaflet de verdade: os componentes do mapa ficam fora dos testes de página e são cobertos pelos E2E e pelos testes das funções puras.

## Cards

Cada card tem `<section aria-labelledby>`, título h2, skeleton, erro local com "Tentar de novo" (que chama `refetch`) e o rodapé "Data: DD/MM/AAAA".

- **`GlobalCard`** (`useGlobal`):
  - duas linhas, Casos e Mortes, cada uma com "Total" e "Novos no dia";
  - **503 `DATA_NOT_READY`:** mostra o estado vazio "Dados ainda não carregados" (sem botão de retry).
- **`CountryCard`** (`useCountry(code)`, `metric`):
  - **Sem `code`:** estado vazio "Selecione um país no mapa ou na busca".
  - **Com país:**
    - título com o nome do país;
    - total da métrica ativa;
    - "Participação no global: X,Y%" (com `share` `null`, "—");
    - "Posição: nº X de Y" (com `rank` `null`, "—").
  - **País sem dados na métrica** (`cases`/`deaths` `null`): "Sem dados para este país na data de referência".
  - **404:** não mostra erro no card; o dashboard mostra o aviso de país não encontrado e o card volta ao estado sem país.
  - **Outros erros:** erro local.
- **Formatação** (`format.ts`):
  - `formatNumber(n | null)` → `Intl.NumberFormat('pt-BR')` ou "—";
  - `formatPercent(n | null)` → "12,3%" com 1 casa ou "—";
  - `formatDate('YYYY-MM-DD')` → "DD/MM/AAAA" (sem passar por `Date` local, para não haver deslocamento de fuso);
  - `formatRank(rank, count)` → "nº 3 de 196" ou "—".

## Busca

`CountrySearch` é um combobox ARIA (padrão "combobox com listbox"):

- input com `role="combobox"`, `aria-expanded`, `aria-controls` e `aria-activedescendant`;
- label visível "Buscar país".
- **Opções:** nomes da lista `/countries`, todos `kind = country` e com dados ou não, filtrados por `normalize(nome).includes(normalize(texto))`, em que `normalize` passa para minúsculas e remove acentos (NFD sem marcas). A ordem é alfabética pt-BR (`localeCompare`) e a lista mostra no máximo 8 opções.
- **Teclado e mouse:**
  - setas movem a opção ativa;
  - Enter seleciona a opção ativa ou, sem opção ativa, a primeira;
  - Esc fecha;
  - clique seleciona.
- **Ao selecionar:** `onSelect(code)` é chamado e o input é limpo.
- **Estados:** o input fica desabilitado com o placeholder "Carregando países…" enquanto a lista carrega. Em erro, "Busca indisponível".
- Sem resultado: a listbox mostra "Nenhum país encontrado".

## Navegação e URL

- `onSelect(code)` faz `navigate('/paises/' + code + '?' + params)`, preservando a `metric`.
- O seletor de métrica troca só o `?metric` (`replace: false`), mantendo o caminho.
- `useMetric()` devolve `[metric, setMetric]`. Um valor ausente ou inválido vale `cases` e não reescreve a URL.
- **`/paises/:code`:**
  - `code` fora de `^[A-Za-z]{3}$`: o país não é buscado e aparece o aviso "País não encontrado: {code}" (texto escapado pelo React);
  - formato válido: segue para `useCountry(code)`; o 404 também mostra o aviso;
  - em ambos os casos o mapa e o card Geral funcionam normalmente, e o aviso tem um link "Voltar à visão mundial" (`/` + query).

## `/sobre`

- **Fonte** (do `/meta`):
  - nome com link para `source.url` (`rel="noopener noreferrer"`), licença e atribuição;
  - cobertura "De DD/MM/AAAA a DD/MM/AAAA, N países", ou "Dados ainda não carregados";
  - último sync: data e status;
  - skeleton e erro local.
- **Atribuições fixas:**
  - API Ninjas (fonte dos dados);
  - JHU CSSE, pela tabela de referência de países e coordenadas (CC BY 4.0);
  - Natural Earth, pelos contornos dos países (domínio público);
  - tiles, com `VITE_TILES_ATTRIBUTION`.
- **Entidades não geográficas** (RN-08): uma lista de `meta.nonGeographic` com o texto "Entram no total global, mas não aparecem no mapa".
- **Territórios no mapa:** um parágrafo explicando que polígonos de territórios sem dados próprios (Groenlândia, Porto Rico etc.) abrem o país soberano.

## Testes

Vitest (jsdom) + Testing Library + MSW:

- **`test/fixtures.ts`:**
  - dados inventados e coerentes, porque o repositório é público e os termos da fonte proíbem armazenar os dados;
  - 5 países: BRA, USA, IND, DNK e ZWE, este com `total` `null`;
  - `meta`, `global` e o detalhe de BRA.
- **`test/handlers.ts`:** handlers MSW para `http://api.test/api/v1/*`, com variações por teste via `server.use(...)`.
- **`test/render.tsx`:** `renderWithProviders(ui, { route })` com um `QueryClient` novo (sem retry) e `MemoryRouter`.

| Arquivo | Casos |
| --- | --- |
| `shared/format/format.test.ts` | números e percentuais pt-BR; `null` → "—"; data sem deslocamento de fuso; rank |
| `config/env.test.ts` | válido; falta de cada var; URL com barra final; tiles sem `{z}` |
| `shared/api/client.test.ts` | `unwrap` devolve `data`; envelope de erro → `ApiError` com code/requestId; corpo sem envelope → `INTERNAL_ERROR`; erro de rede → `NETWORK_ERROR` |
| `app/query-client.test.ts` | sem retry em 404; retry em 500 |
| `features/map/marker-scale.test.ts` | 0/`null`/negativo → 0; max → 40; valor mínimo positivo ≥ 3; √ proporcional; `legendSteps` |
| `features/map/polygon-links.test.ts` | código conhecido → ele mesmo; os 7 territórios → soberano; TKM → `null`; soberano fora de `knownCodes` → `null` |
| `features/search/normalize.test.ts` | acentos e caixa |
| `features/search/country-search.test.tsx` | "bra" acha Brasil; "india" acha Índia; setas + Enter; Esc; sem resultado; estado carregando |
| `features/stats/global-card.test.tsx` | valores; skeleton; erro + "Tentar de novo" refaz a chamada; 503 → vazio |
| `features/stats/country-card.test.tsx` | sem país; com país (total, %, rank); troca de métrica; `share`/`rank` `null` → "—"; país sem dados; erro local |
| `shared/url/use-metric.test.tsx` | padrão `cases`; inválido → `cases`; troca preserva o caminho |
| `shared/ui/data-banner.test.tsx` | data formatada + fonte; `referenceDate` `null`; erro |
| `pages/dashboard-page.test.tsx` | (mapa trocado por stub via `vi.mock`) `/paises/BRA` mostra o card do Brasil; `/paises/XYZ` (404) → aviso + card vazio; `/paises/12` → aviso sem chamada; `/paises/bra` → redireciona para `BRA`; um erro no Geral não derruba o Por país |
| `pages/about-page.test.tsx` | atribuições; lista de não geográficas; cobertura |
| `app/app.test.tsx` | rota inexistente → 404; nav Mapa/Sobre; rodapé com fonte e tiles em todas as rotas |
| `scripts/api-types.test.ts` | `schema.d.ts` atualizado |

**E2E** (Playwright, Chromium, local):

- `tests/e2e/mock-api.ts` instala o `page.route('http://api.test/**')`, que responde com as fixtures de `tests/e2e/fixtures.ts`, e bloqueia (`abort`) qualquer outra origem externa, inclusive os tiles. Nenhuma chamada sai da máquina.
- O `webServer.env` passa `VITE_API_URL=http://api.test` e uma URL de tiles fictícia.
- **`map.spec.ts`:**
  1. abrir `/` mostra o mapa, os marcadores, a faixa com a data e o card Geral;
  2. clicar no marcador do Brasil leva a `/paises/BRA`, o card Por país mostra "Brasil" e o popup abre;
  3. clicar no polígono da Groenlândia leva a `/paises/DNK`;
  4. Tab até um marcador + Enter seleciona o país.
- **`navigation.spec.ts`:**
  1. link direto `/paises/BRA?metric=deaths` mostra o card do Brasil em mortes;
  2. `/paises/XYZ` mostra o aviso e a visão mundial;
  3. buscar "india" + Enter leva a `/paises/IND`;
  4. `/sobre` mostra as atribuições;
  5. rota inexistente mostra o 404.
- O `smoke.spec.ts` atual é substituído por esses testes.
- **Como o E2E localiza os alvos:**
  - marcadores, pelo `aria-label` (`getByRole('button', { name: /^Brasil:/ })`);
  - polígonos, pelo `path` SVG: no `onEachFeature` → `layer.on('add')`, o elemento recebe `class="country-polygon"`, `data-iso3` (o código do GeoJSON) e, quando é clicável, `data-code` (o código resolvido). O E2E clica em `path[data-iso3="GRL"]` e espera `/paises/DNK`. Não há coordenadas nem instância do mapa exposta.

O E2E no CI continua para a F8. O CI da F4 roda lint, typecheck, test e build do web, como hoje.

## Documentação

- **ADR 0006 "Front: dados, tipos e mapa":**
  - TanStack Query com `staleTime` de 5 min e sem retry em 4xx;
  - tipos gerados por `openapi-typescript` e cliente `openapi-fetch`, com o `overrides` do TS 6;
  - métrica na URL;
  - polígonos neutros com herança do soberano;
  - marcadores acessíveis via SVG com `tabindex`;
  - testes de página com o mapa trocado por stub e E2E com a API mockada.
- **`CLAUDE.md`:**
  - F4 concluída;
  - a regra dos territórios (herdam o soberano, TKM sem link) entra em "Decisões";
  - a pendência das atribuições no `/sobre` sai da lista;
  - o comando `npm run api:types -w web` entra em "Comandos";
  - as pendências que sobrarem entram em "Adiado com fase-alvo".
- **`web/.env.example`** novo.

## Fora do escopo

Card Por tempo e `/rankings` (F6), séries e gráficos (F7), axe, Lighthouse, teste de bundle e E2E no CI (F8), deploy (F9), coroplético, `?date=` no front.
