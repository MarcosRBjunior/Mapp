# Fase 3 — API N1: design

- Data: 2026-10-20
- Fase: F3 do roteiro do `CLAUDE.md`
- Status: aprovado em conversa; aguardando revisão do arquivo
- Branch: `feat/api-n1`

## Objetivo

Expor os dados carregados pelo sync numa API REST só de leitura: middlewares, `/ready`, `/api/v1/meta`, `/api/v1/global`, `/api/v1/countries`, `/api/v1/countries/:code` e o OpenAPI gerado dos schemas zod.

Critério de saída: testes de API (Supertest) verdes para cada endpoint (sucesso, 400, 404, 503), testes de integração verdes com o usuário só leitura e `docs/openapi.yaml` igual ao gerado.

## Decisões desta fase

| Tema | Decisão |
| --- | --- |
| `dataVersion` | `id` do último `sync_run` da fonte com status `success` ou `partial` (decidido em 2026-10-20, PR #4). Sem esse run, não há dados carregados. |
| Data de referência (RN-06) | Última data em que, nas duas métricas, o número de países com dados é igual ao número de países que já apareceram na fonte (decidido em 2026-10-20). Países da base que a fonte nunca traz, como o Saara Ocidental (ESH), não contam. |
| Fonte servida | A do `DATA_PROVIDER` (padrão `api_ninjas`), lida em `data_source.code`. |
| Posição no ranking (RN-05) | Só entidades `kind = country`. Navios e Olimpíadas entram no global (RN-01, RN-08), mas não recebem posição. Empate → nome em pt-BR em ordem alfabética (`localeCompare(…, 'pt-BR')`). País sem dados na data fica com `rank = null` e fora de `rankedCount`. |
| Data fora da cobertura | 400 `VALIDATION_ERROR`, com `details = { from, to }`. Faixa válida: da primeira data com dados até a data de referência, e a data precisa ter linha no global. |
| País sem dados na data | `/countries` inclui o país com `total` e `new` `null` (não vira marcador; a busca acha). |
| Entidade não geográfica em `/countries/:code` | 404 `COUNTRY_NOT_FOUND`. A lista dessas entidades para o `/sobre` vem no `/meta`. |
| Rota inexistente | 404 com o código `NOT_FOUND` (acrescentado à lista de códigos do `CLAUDE.md`). |
| Sem dados carregados | `/ready` e as rotas de dados → 503 `DATA_NOT_READY`. `/meta` → 200 com `coverage`, `referenceDate`, `lastSync` e `dataVersion` `null`. |
| Cache da data de referência | A data de referência e a cobertura são calculadas na view e guardadas em memória por `dataVersion`: só recalculam quando um sync grava dados novos. |
| Rate limit | 120 req/min por IP em `/api` (inclui `/api/docs`). `/health` e `/ready` ficam fora, para as sondas da hospedagem. `trust proxy` fica para a F9. |
| OpenAPI | `zod-openapi` 6 (usa o `.meta()` do zod 4). UI em `/api/docs` com `swagger-ui-express` (arquivos servidos localmente, sem CDN); JSON em `/api/docs/openapi.json`. |
| Fora desta fase | `Cache-Control` + `ETag` + 304 e `/rankings` (F6); séries temporais (F7). |

## Arquitetura

```text
server.ts ─► loadEnv ─► createPrisma(DATABASE_URL) ─► createApp(deps)
createApp: requestId ─► pino-http ─► helmet ─► cors(WEB_ORIGIN)
           ├─ /health, /ready
           ├─ /api (rate limit)
           │    ├─ /api/docs (swagger-ui-express + openapi.json)
           │    └─ /api/v1 ─► routes (zod) ─► controllers ─► services ─► repositories (Prisma, só leitura)
           ├─ 404 NOT_FOUND
           └─ error handler (AppError → { error: { code, message, details, requestId } })
```

- `createApp(deps)` recebe os serviços prontos. Os testes de API injetam serviços com repositórios falsos e rodam sem banco; o `server.ts` monta os reais.
- `services` são puros (regras: participação, posição, validação de data, montagem das respostas). `repositories` só fazem SQL/Prisma e convertem `bigint` e `Date` para `number` e `YYYY-MM-DD`.

### Arquivos

```text
api/src/config/env.ts                    # + DATABASE_URL, DATA_PROVIDER, WEB_ORIGIN
api/src/lib/app-error.ts                 # AppError, códigos de erro
api/src/lib/dates.ts                     # isoDate(Date) ↔ 'YYYY-MM-DD', parse estrito
api/src/middlewares/request-id.ts
api/src/middlewares/http-logger.ts       # pino-http com o requestId
api/src/middlewares/rate-limit.ts
api/src/middlewares/not-found.ts
api/src/middlewares/error-handler.ts
api/src/middlewares/validate.ts          # valida query/params com zod e guarda o resultado tipado
api/src/routes/health.routes.ts          # + /ready
api/src/routes/v1.routes.ts              # monta /meta, /global, /countries
api/src/routes/schemas.ts                # schemas zod de query, params e respostas (com .meta para o OpenAPI)
api/src/routes/docs.routes.ts            # /api/docs e /api/docs/openapi.json
api/src/openapi/document.ts              # createDocument do zod-openapi
api/src/openapi/write.ts                 # script: grava docs/openapi.yaml
api/src/controllers/{meta,global,countries}.controller.ts
api/src/services/data-state.service.ts   # dataVersion, cobertura e data de referência (memo por dataVersion)
api/src/services/{meta,global,countries}.service.ts
api/src/services/comparison.ts           # puro: participação (RN-04) e posição (RN-05)
api/src/repositories/read/{data-state,meta,global,countries}.read-repository.ts
api/src/app.ts                           # createApp(deps)
api/src/server.ts                        # monta deps, sobe o HTTP, graceful shutdown
docs/openapi.yaml                        # gerado; teste garante que está atualizado
```

Os nomes exatos dos arquivos podem ser ajustados no plano; as camadas e responsabilidades não.

## Respostas

(Os números dos exemplos são fictícios.)

Todas em camelCase; datas `YYYY-MM-DD`; timestamps ISO 8601 UTC; números como `number` (nunca `bigint` nem string). Sem `date`, as rotas usam a data de referência.

### `GET /health`

200 `{ "status": "ok" }` (sem banco, como hoje).

### `GET /ready`

- 200 `{ "status": "ready", "dataVersion": 12, "referenceDate": "2023-03-09" }` quando há `dataVersion` e data de referência.
- 503 `DATA_NOT_READY` quando não há dados ou o banco não responde (mensagens diferentes).

### `GET /api/v1/meta`

```json
{
  "source": { "code": "api_ninjas", "name": "…", "url": "…", "license": "…", "attribution": "…" },
  "coverage": { "from": "2023-03-09", "to": "2023-03-09", "countries": 201 },
  "referenceDate": "2023-03-09",
  "lastSync": { "status": "partial", "mode": "snapshot", "startedAt": "…Z", "finishedAt": "…Z" },
  "dataVersion": 12,
  "nonGeographic": [{ "code": "XDP", "name": "Navio Diamond Princess" }]
}
```

- `coverage.to` = data de referência; `coverage.countries` = países (de qualquer `kind`) que já apareceram na fonte.
- `lastSync` = último `sync_run` da fonte com `finishedAt`, qualquer status (inclusive `failed`); `null` se nunca houve.
- Sem dados: `coverage`, `referenceDate` e `dataVersion` `null`; `source` e `nonGeographic` sempre presentes.

### `GET /api/v1/global?date=`

```json
{
  "date": "2023-03-09",
  "cases": { "total": 1000000, "new": 500 },
  "deaths": { "total": 20000, "new": 10 },
  "countryCount": 201
}
```

`countryCount` = `country_count` da view para `cases` na data.

### `GET /api/v1/countries?metric=cases|deaths&date=`

```json
{
  "date": "2023-03-09",
  "metric": "cases",
  "countries": [
    { "code": "BRA", "name": "Brasil", "lat": -10, "lng": -55, "total": 50000, "new": 25 }
  ]
}
```

- `metric` padrão `cases`. Só `kind = country` (todos os 198, com ou sem dados). Sem dados na data → `total` e `new` `null`.
- Ordem: nome em pt-BR (`localeCompare(…, 'pt-BR')`).

### `GET /api/v1/countries/:code?date=`

```json
{
  "date": "2023-03-09",
  "country": { "code": "BRA", "name": "Brasil", "lat": -10, "lng": -55, "population": 214326223 },
  "cases": { "total": 50000, "new": 25 },
  "deaths": { "total": 2000, "new": 1 },
  "comparison": {
    "cases": { "share": 5, "rank": 3, "rankedCount": 197 },
    "deaths": { "share": 10, "rank": 2, "rankedCount": 197 }
  }
}
```

- `:code` passa por `^[A-Za-z]{3}$` (senão 400) e vira maiúsculo. Código inexistente ou `kind = non_geographic` → 404 `COUNTRY_NOT_FOUND`.
- Sem dados na data para a métrica: `cases`/`deaths` `null`, `share` e `rank` `null`.
- `share` (RN-04) = país ÷ global da mesma data × 100, arredondado a 1 casa (`Math.round(x * 10) / 10`); global 0 ou ausente → `null`.
- `rank` (RN-05) = posição pelo `total` da métrica entre os `kind = country` com dados na data; empate → nome pt-BR. `rankedCount` = quantos países entraram no ranking.

## Erros

Formato único: `{ "error": { "code", "message", "details", "requestId" } }`; `details` é `null` quando não há nada a detalhar.

| Situação | Status | `code` | `details` |
| --- | --- | --- | --- |
| Query/params inválidos | 400 | `VALIDATION_ERROR` | `[{ "path": "date", "message": "…" }]` |
| Data fora da cobertura | 400 | `VALIDATION_ERROR` | `{ "from": "…", "to": "…" }` |
| País inexistente ou não geográfico | 404 | `COUNTRY_NOT_FOUND` | `{ "code": "XYZ" }` |
| Rota inexistente | 404 | `NOT_FOUND` | `null` |
| Rate limit | 429 | `RATE_LIMITED` | `null` |
| Sem dados carregados | 503 | `DATA_NOT_READY` | `null` |
| Erro inesperado | 500 | `INTERNAL_ERROR` | `null` (sem stack; o stack vai só para o log) |

- `date` aceita só `YYYY-MM-DD` de calendário válido (`2023-02-30` → 400).
- Parâmetros de query desconhecidos são ignorados.

## Middlewares e servidor

- `requestId`: reaproveita `X-Request-Id` da requisição se casar com `^[A-Za-z0-9-]{1,64}$`; senão `crypto.randomUUID()`. Devolvido no cabeçalho `X-Request-Id` e em todo erro.
- `pino-http` com o logger do projeto (as regras de redact continuam) e o `requestId` como `req.id`. Erros 5xx são logados com o stack.
- `helmet` com a configuração padrão; a CSP padrão já aceita os arquivos do `swagger-ui-express` (um teste confere `/api/docs` com 200).
- `cors` só para `WEB_ORIGIN`, métodos `GET`, `HEAD` e `OPTIONS`.
- `express-rate-limit`: janela de 60 s, 120 requisições, cabeçalhos `RateLimit` padrão; o `handler` responde 429 no formato de erro.
- Graceful shutdown: em `SIGTERM`/`SIGINT`, `server.close()` e `prisma.$disconnect()`, com saída forçada após 10 s.
- `x-powered-by` desligado (o `helmet` já remove).

## Variáveis de ambiente (`api/src/config/env.ts`)

| Variável | Regra |
| --- | --- |
| `DATABASE_URL` | Obrigatória, `postgres://`/`postgresql://` (reusa `postgresUrl`). Usuário só leitura. |
| `DATA_PROVIDER` | `api_ninjas` \| `jhu_csv` \| `apify`, padrão `api_ninjas` (mesmo enum do `sync-env.ts`, extraído para um lugar só). |
| `WEB_ORIGIN` | Obrigatória, URL `http(s)://` sem barra final. `.env.example`: `http://localhost:5173`. |
| `NODE_ENV`, `PORT`, `LOG_LEVEL` | Como hoje. |

A api não sobe com env faltando ou inválido.

## Repositórios (só leitura)

- `data-state`: `sourceId` pelo `code`; `dataVersion` (`max(id)` com status `success`/`partial`); cobertura e data de referência:

  ```sql
  WITH present AS (
    SELECT count(DISTINCT country_code)::int AS n FROM daily_stat WHERE source_id = $1
  )
  SELECT
    (SELECT min(stat_date) FROM global_daily_stat WHERE source_id = $1) AS "from",
    (SELECT max(stat_date) FROM (
       SELECT stat_date FROM global_daily_stat WHERE source_id = $1
       GROUP BY stat_date
       HAVING count(*) = 2 AND min(country_count) = (SELECT n FROM present)
     ) d) AS "referenceDate",
    (SELECT n FROM present) AS countries
  ```

- `meta`: fonte, último `sync_run` finalizado, entidades `non_geographic`.
- `global`: linhas da view numa data (as duas métricas).
- `countries`: `kind = country` com `LEFT JOIN` em `daily_stat` (fonte, métrica, data); detalhe de um país com as duas métricas; valores das duas métricas de todos os `kind = country` na data (para a posição).
- Conversões na borda: `bigint` → `Number` (os totais cabem em 2^53) e `Date` → `YYYY-MM-DD` em UTC.

## OpenAPI

- Os schemas de query, params, respostas e erro vivem em `routes/schemas.ts` com `.meta({ id, description })`. O `zod-openapi` gera o documento OpenAPI 3.1 a partir deles.
- `npm run openapi -w api` grava `docs/openapi.yaml` (pacote `yaml`). Um teste unitário gera o documento e compara com o arquivo: desatualizado → falha com a dica do comando.
- As mesmas schemas de resposta validam as respostas nos testes de API (`schema.parse(body)`), para o documento não mentir.

## Testes

- **Unitários** (`api/tests/unit`):
  - `comparison`: participação com global 0 e ausente; arredondamento; posição com empate (ordem alfabética pt-BR, com acento); país sem dados fora do ranking.
  - `data-state.service`: memo por `dataVersion` (recalcula só quando muda); sem `dataVersion` → `DATA_NOT_READY`; validação de data (antes de `from`, depois de `to`, dia sem global).
  - `dates`: parse estrito e formatação UTC.
  - `env`: `DATABASE_URL`, `WEB_ORIGIN` e `DATA_PROVIDER`.
  - `error-handler`: `AppError`, `ZodError` e erro inesperado (sem stack, com `requestId`).
  - OpenAPI atualizado.
- **API** (`api/tests/api`, Supertest com serviços sobre repositórios falsos, sem banco):
  - cada endpoint: sucesso, 400 (parâmetro inválido e data fora da cobertura), 404 (`XYZ`, `XDP`, rota inexistente), 503 (sem dados); `/meta` sem dados → 200 com `null`; código em minúsculas (`bra`) → 200.
  - `X-Request-Id` gerado e reaproveitado; 429 depois de 120 requisições; CORS só para `WEB_ORIGIN`; `/api/docs` e `/api/docs/openapi.json` 200.
  - respostas validadas pelas schemas zod.
- **Integração** (`api/tests/integration`, `mapp_test`):
  - repositórios com o usuário só leitura, sobre dados gravados pelo snapshot com fixtures: data de referência, cobertura, `dataVersion` com run `partial`, global, lista com país sem dados (ESH com `null`), detalhe com comparação, `bigint` como `number`.
  - data de referência ignora país ausente da fonte e recua quando um país presente falta no último dia.
  - fumaça do app real (`createApp` com Prisma do leitor): `/ready` 200 e `/api/v1/countries/BRA` 200.

## Documentação

- `CLAUDE.md`: estado atual (F3 concluída e o que ficou), código `NOT_FOUND` na lista de erros, `WEB_ORIGIN` no `.env.example`.
- ADR 0005 curto: camadas da API, injeção de serviços no `createApp`, `zod-openapi` e o arquivo `docs/openapi.yaml` gerado.

## Fora do escopo

`Cache-Control`/`ETag`/304, `/rankings`, card "Por tempo" (F6); séries temporais (F7); `trust proxy`, `NODE_ENV=production` no deploy (F9); qualquer chamada à fonte externa (a API nunca chama a fonte).
