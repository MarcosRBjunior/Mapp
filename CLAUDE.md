# CLAUDE.md — Mapp

Mapa dashboard de COVID-19: mapa-múndi clicável, 3 cards de estatística e 2 gráficos, alimentados por uma API REST própria. Projeto 08 do Portfólio Boost Program (nível básico, full-stack).

- Repositório: https://github.com/MarcosRBjunior/Mapp
- Especificação completa: `docs/especificacao.md` (quando existir). Este arquivo traz só o que guia o trabalho; se os dois divergirem, pergunte.

## Estado atual

- F0 Fundação concluída em 2026-10-19 (PR #1): monorepo `api` + `web`, ESLint/Prettier, Vitest, Playwright, Postgres 18 no Docker (porta do host 5435), CI.
- F1 Banco concluída em 2026-10-19 (PR #2): schema Prisma 7.10 + SQL bruto (CHECKs, view `global_daily_stat`), índice parcial nativo, usuários `mapp` (dono/sync) e `mapp_api` (leitura), seed de 202 entidades (198 países + 4 não geográficas) com aliases provisórios da `api_ninjas`, GeoJSON 1:110m, testes de integração no CI.
- F2 Snapshot concluída em 2026-10-19 (PR #3): provider `CovidProvider` da API Ninjas, `CallGate` (orçamento 90/h e mês calendário UTC, timeout de 10 s, 3 tentativas), soma de regiões (RN-02), modo snapshot com lock advisory e recuperação de run órfão, curadoria de aliases em `api/prisma/seed/aliases.json` (ADR 0004). Fixtures recortadas da chamada real em `api/tests/fixtures/api-ninjas` (o repositório é público e os termos proíbem armazenar os dados).
- Pergunta aberta para a F3 (regra de negócio, perguntar): a RN-06 define a data de referência como a "última data com dados para todos os países", mas a fonte nunca traz o Saara Ocidental (ESH). Considerar só os países presentes na fonte?
- Pendência para a F4: mostrar no `/sobre` as atribuições da API Ninjas, da JHU CSSE (CC BY 4.0) e do Natural Earth (domínio público). Pergunta aberta: os polígonos do GeoJSON sem país na base (GRL, PRI, FLK, NCL, ATF, SOL, CYN, TKM) herdam o país soberano ou ficam sem link?
- TypeScript fixado em `~6.0.3` até o typescript-eslint suportar o TS 7 (ADR 0001).
- Adiado com fase-alvo: validar `DATABASE_URL` no env da api HTTP, converter `bigint` (`population`, somas da view) para número na API e graceful shutdown no SIGTERM (F3); handler final de erro sem stack trace e `NODE_ENV=production` garantido no deploy (F3/F9); reporter/trace do Playwright e E2E no CI, actions fixadas por SHA + Dependabot (F8); `postinstall` depende do `prisma` (devDependency), seed em lote, `db:migrate` sem depender do `db:roles` em banco gerenciado e `ALTER ROLE ... PASSWORD` sem expor a senha em log (F9); mais da revisão da F2: política de 429 (hoje repete após 1 s e 2 s; avaliar respeitar `Retry-After` e tratar o 429 final como orçamento esgotado, o que muda regra, então perguntar), listener de `'error'` na conexão do lock que aborte o run (sem o lock o job não pode seguir gravando), `finishRun`/`failCheckpoint` no catch sem mascarar a causa original, `lock.release()` best-effort com aviso no log, mover a transação da unidade (`prisma.$transaction` em `run-snapshot.ts`) para um repositório, contar o orçamento numa query só com o `now()` do banco (hoje usa o relógio do processo), carregar os aliases uma vez por run, montar o `CallGate` antes do provider para remover o `gateRef` e retomada que considere checkpoints `pending` de runs órfãos (F5); `DATABASE_URL_SYNC` precisa ser conexão direta ou de sessão, pois o advisory lock de sessão não funciona atrás de pooler em modo transação (PgBouncer/Supavisor/Neon pooled) (F9).
- Ao terminar cada fase, atualize esta seção com a fase concluída e o que ficou pendente.

## Como trabalhar

- Converse e documente em pt-BR. Código, nomes de arquivos, tabelas e rotas em inglês.
- Uma fase por vez. Só avance quando o critério de saída da fase atual passar.
- Antes de dizer que terminou: `npm run lint`, `npm run typecheck` e `npm test` verdes.
- Não invente regra de negócio. Se algo não está aqui nem na especificação, pergunte.
- Mudanças pequenas, um commit por tarefa, Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`).
- Branches curtas a partir de `main`: `feat/…`, `fix/…`, `chore/…`.
- Nunca rode a sincronização contra a fonte real sem eu pedir: ela gasta cota limitada.
- Nunca leia, imprima ou commite `.env`; mantenha `.env.example` atualizado com valores falsos.

## Arquitetura (não mudar sem perguntar)

- Monorepo com npm workspaces: `web/` (front) e `api/` (back). Um app nunca importa código do outro.
- `web`: React 19 + Vite + TypeScript, React Router, TanStack Query, React Leaflet 5 + Leaflet, Recharts.
- `api`: Node.js LTS + Express + TypeScript, zod, Prisma + PostgreSQL, pino, helmet, express-rate-limit.
- O `web` só fala com a `api`. A `api` só lê do banco e nunca chama a fonte externa. Só o job de sincronização chama a fonte.
- O job vive em `api/src/jobs/sync` e roda por CLI (`npm run sync -w api`) ou GitHub Actions — nunca dentro de função serverless.
- Fora do escopo: Next.js, Redis, filas, microsserviços, login de usuários, dados em tempo real.

Camadas da `api`:

- `routes` → rotas + schemas zod
- `controllers` → traduz HTTP ↔ serviço
- `services` → regras de negócio, sem HTTP nem SQL
- `repositories` → único lugar com SQL/Prisma
- `providers` → adaptadores da fonte de dados (interface `CovidProvider`)
- `jobs/sync` → ingestão com orçamento de chamadas e checkpoints

## Estrutura

```text
api/src/{config,routes,controllers,services,repositories,providers,jobs/sync,middlewares,lib}
api/src/app.ts          # monta o Express (testável sem subir porta)
api/src/server.ts       # sobe o HTTP
api/prisma/{schema.prisma,migrations,seed}
api/tests/{unit,integration,api,fixtures}
web/public/geo/countries-110m.geojson   # Natural Earth 1:110m
web/src/{app,pages,features/{map,stats,charts,ranking},shared/{api,ui,format}}
web/tests/e2e
docs/{adr,openapi.yaml}
scripts/
.github/workflows/{ci.yml,sync.yml}
docker-compose.yml      # PostgreSQL local
.nvmrc  .editorconfig  package.json (workspaces ["api","web"])
```

## Comandos (criar na Fase 0 com estes nomes)

```bash
nvm use                                   # versão fixada em .nvmrc
docker compose up -d                      # PostgreSQL
npm install
npm run dev -w api                        # http://localhost:3333
npm run dev -w web                        # http://localhost:5173
npm run lint && npm run typecheck && npm test
npm run test:e2e -w web
npm run db:migrate -w api
npm run db:seed -w api
npm run db:roles -w api                   # cria/atualiza o usuário leitor (já roda no db:migrate)
npm run test:integration -w api           # recria o banco mapp_test e roda os testes com Postgres
npm run sync -w api -- --mode=snapshot    # 2 chamadas: só a data de referência
npm run sync -w api -- --mode=full        # série histórica, retomável
```

## Dados e fonte externa

- Métricas: `cases` e `deaths`, cada uma com `total` (acumulado) e `new` (do dia). Granularidade: país.
- Fonte decidida: API Ninjas (D-01, ADR 0002). Implemente pela interface `CovidProvider` e selecione por `DATA_PROVIDER` (`api_ninjas` | `jhu_csv` | `apify`).
- API Ninjas: `GET https://api.api-ninjas.com/v1/covid19`, header `X-Api-Key`. `country=` devolve a série; `date=YYYY-MM-DD` devolve um dia de todos os países; `type=cases|deaths`. Plano gratuito: 3.000 chamadas/mês, 100/hora, exige atribuição e **não permite cache nem armazenamento**.
- Série da API Ninjas: de 2020-01-22 a 2023-03-09 (D-02, confirmada com chamada real em 2026-10-19). Oito países vêm divididos em regiões (Austrália, Canadá, China, Dinamarca, França, Países Baixos, Nova Zelândia e Reino Unido).
- Apify (agregador COVID): só 45 países, parado em 21/11/2022, mistura `null`, `"NA"` e `0`. Só como fonte secundária.
- JHU CSSE (CSV no GitHub): licença CC BY 4.0, coleta encerrada em 10/03/2023. Alternativa que permite armazenar.
- Orçamento do job: no máximo 90 chamadas/hora e o limite mensal, contados na tabela `provider_call`.
- Timeout de 10 s; até 3 tentativas com backoff em 429/5xx; 401/403 encerra a execução como `failed`.
- Valide toda resposta da fonte com zod antes de gravar. Formato inesperado = checkpoint `error`, nada gravado.
- Testes e CI usam só fixtures gravadas em `api/tests/fixtures`. Zero chamadas reais.
- O produto é um dashboard histórico: sempre mostre a data de referência e a fonte.

## Regras de negócio

- RN-01 Global = soma dos países na mesma data, calculada no banco (view `global_daily_stat`).
- RN-02 País dividido em regiões na fonte → somar as regiões por data.
- RN-04 Participação % = país ÷ global na mesma data × 100, 1 casa decimal; global 0 ou ausente → `null` (UI mostra "—").
- RN-05 Ranking por valor absoluto na data de referência; empate → ordem alfabética.
- RN-06 Data de referência = última data com dados para todos os países; sempre exibida junto dos números.
- RN-07 `new` negativo (correção da fonte) é gravado como veio; o gráfico de novos usa média móvel de 7 dias e nunca desenha valor negativo.
- RN-08 Entidades não geográficas (navios etc.) não viram marcador, mas entram no global e são listadas em `/sobre`.
- RN-09 Upsert idempotente pela chave (país, métrica, data, fonte). Rodar duas vezes não duplica.
- RN-10 Fonte, licença e atribuição dos tiles visíveis em todas as rotas.
- RN-11 Semana/mês: `new` = soma do período; `total` = último valor do período.

## Banco (PostgreSQL)

- Tabelas: `data_source`; `country` (PK ISO3, `kind` = `country` | `non_geographic`, `lat`/`lng`); `country_alias` (nome da fonte → ISO3, status `mapped` | `pending` | `ignored`); `daily_stat` (PK `country_code + metric + stat_date + source_id`, `total` ≥ 0, `new_value` pode ser negativo); `sync_run` (no máximo 1 `running`, via índice único parcial); `sync_checkpoint`; `provider_call`.
- View materializada `global_daily_stat`, atualizada com `REFRESH MATERIALIZED VIEW CONCURRENTLY` ao fim de cada sync. O `id` do último `sync_run` com status `success` ou `partial` é o `dataVersion` (todo run que grava dados muda o ETag).
- View e índice parcial entram como SQL bruto na migração do Prisma.
- Dois usuários de banco: a api HTTP só lê (`DATABASE_URL`); o job escreve (`DATABASE_URL_SYNC`).
- Nome da fonte sem mapeamento → grava `pending`, pula o país e fecha o sync como `partial`.

## API REST

Saúde (fora do prefixo): `GET /health` · `GET /ready` (503 sem dados carregados).

Prefixo `/api/v1`:

- `GET /meta` → fonte, licença, cobertura, `referenceDate`, `lastSync`, `dataVersion`
- `GET /global?date=`
- `GET /global/timeseries?metric=&from=&to=&granularity=day|week|month`
- `GET /countries?metric=&date=` → lista para o mapa (só `kind = country`)
- `GET /countries/:code?date=` → detalhe + `comparison` (participação % e posição)
- `GET /countries/:code/timeseries?metric=&from=&to=&granularity=`
- `GET /rankings?metric=&limit=1..50&date=`

Documentação: `GET /api/docs` (OpenAPI gerado dos schemas zod).

Convenções:

- JSON em camelCase; datas `YYYY-MM-DD`; timestamps ISO 8601 em UTC.
- `Cache-Control: public, max-age=3600` + `ETag` com `dataVersion` (304 quando igual).
- Rate limit de 120 req/min por IP.
- Erro sempre no formato `{ "error": { "code", "message", "details", "requestId" } }`. Códigos: `VALIDATION_ERROR` 400, `COUNTRY_NOT_FOUND` 404, `RATE_LIMITED` 429, `DATA_NOT_READY` 503, `INTERNAL_ERROR` 500 (sem stack trace na resposta).
- `:code` = ISO3 (`^[A-Za-z]{3}$`, normalizado para maiúsculas).

## Frontend

- Rotas: `/`, `/paises/:code`, `/sobre`, `*` (404). Métrica e período ficam na URL.
- Layout do wireframe: mapa no topo; 3 cards (Geral, Por país, Por tempo); 2 gráficos de linha embaixo; ranking. No celular, tudo empilhado.
- Mapa: um `CircleMarker` por país, raio ∝ √total da métrica ativa; tooltip no hover/foco; popup e seleção no clique; legenda de tamanhos.
- Clicar ou buscar um país → navega para `/paises/:code` e atualiza card e gráficos.
- Card Por país: total, participação % no global e posição no ranking.
- Gráficos: crescimento acumulado (país × mundo, escala linear/log) e novos por dia com média de 7 dias.
- Todo componente tem loading (skeleton), vazio e erro local com "Tentar de novo"; um erro não derruba os outros.
- Faixa fixa "Dados históricos até DD/MM/AAAA · Fonte: …", lida de `/meta`.
- Números e datas em pt-BR (`Intl.NumberFormat('pt-BR')`, `Intl.DateTimeFormat('pt-BR')`).
- Acessibilidade: marcadores focáveis por teclado, resumo textual em cada gráfico, contraste AA.

## Padrões de código

- TypeScript `strict`, ESLint + Prettier, sem `any`.
- Arquivos `kebab-case`; componentes `PascalCase`; hooks `useAlgo`; banco `snake_case`; variáveis de ambiente `UPPER_SNAKE`.
- zod valida query e body, respostas da fonte e as variáveis de ambiente (a api não sobe com env faltando).
- Erros via `AppError(code, httpStatus, message, details)` + um único middleware final.
- Logs em JSON (pino) com `requestId`; nunca logar chaves ou tokens.
- Tipos do front gerados a partir de `docs/openapi.yaml`.
- Cada decisão de arquitetura vira um ADR curto em `docs/adr/`.

## Testes (obrigatórios em cada fase)

- api: Vitest (unitários em `services/` e `jobs/sync`), integração com Postgres em Docker, Supertest em todo endpoint (sucesso, 400, 404, 503, 304).
- web: Vitest + Testing Library + MSW; E2E com Playwright; axe nas páginas.
- Casos que não podem faltar: soma de regiões; global = soma dos países; participação com global 0; ranking com empate; `new` negativo; agregação semanal; sync idempotente; retomada após interrupção; orçamento de chamadas respeitado; 429, 401 e JSON inválido da fonte; alias sem mapeamento; banco vazio → 503; clique no Brasil → `/paises/BRA`; `/paises/XYZ` → aviso e visão mundial; bundle do `web` sem a chave nem o host da fonte.

## Variáveis de ambiente

- api: `DATABASE_URL`, `DATABASE_URL_SYNC`, `DATA_PROVIDER`, `API_NINJAS_KEY`, `SYNC_CALLS_PER_HOUR=90`, `SYNC_CALLS_PER_MONTH=3000`, `WEB_ORIGIN`, `PORT=3333`, `LOG_LEVEL`
- web: `VITE_API_URL`, `VITE_TILES_URL`, `VITE_TILES_ATTRIBUTION`

## Decisões

Adotadas (mudo se pedir):

- Express + Vite separados, não Next.js · PostgreSQL · React Leaflet com tiles OSM ou CARTO configuráveis · Recharts · TypeScript
- Marcadores (coroplético fica para depois) · só pt-BR · só nível país · sync por CLI + workflow, sem endpoints admin
- D-01 fonte de dados: API Ninjas (ADR 0002) · dois usuários de banco, o do sync é dono do schema (ADR 0003) · D-02 a série termina em 2023-03-09 · job de sync: lock advisory, status, orçamento no mês UTC e aliases versionados (ADR 0004) · `dataVersion` conta runs `success` e `partial`

Em aberto — pergunte antes de implementar o que depende delas:

- D-03 Card "Por tempo" (sugestão: novos no período escolhido).
- D-04 Segundo gráfico (sugestão: novos por dia com média de 7 dias).
- D-06 "Gráficos ao mapa" (sugestão: minigráfico no popup).
- D-07 Critério de "mais afetados": absoluto ou por 100 mil habitantes.
- D-12 Hospedagem da api e do banco (web na Vercel).

## Roteiro

| Fase | Entrega | Critério de saída |
| --- | --- | --- |
| F0 Fundação | Monorepo, scaffolds `api` e `web`, ESLint/Prettier, `docker-compose.yml`, CI | `npm run dev` sobe os dois; `/health` 200; CI verde |
| F1 Banco | Schema, view, índice parcial, GeoJSON, seed de países, fontes e aliases | `db:migrate` + `db:seed` do zero criam ~200 países com coordenadas |
| F2 Snapshot | Adaptador da fonte, fixtures, soma de regiões, modo snapshot | 2 chamadas carregam a data de referência |
| F3 API N1 | Middlewares, `/meta`, `/global`, `/countries`, `/countries/:code`, OpenAPI, `/ready` | Testes de API verdes |
| F4 Front N1 | Mapa, marcadores, clique, busca, rotas, cards Geral e Por país, `/sobre`, 404 | E2E: abrir mapa, clicar país, link direto |
| F5 Carga histórica | Orçamento, checkpoints, retomada, upsert, refresh, CLI, workflow `sync.yml` | Sync completo termina `success` |
| F6 Nível 2 | `/rankings`, cache + ETag, participação %, ranking, card Por tempo | E2E de comparação e ranking |
| F7 Nível 3 | Endpoints de série, 2 gráficos, minigráfico no popup | E2E do histórico |
| F8 Qualidade | E2E no CI, axe, Lighthouse, teste de bundle, Dependabot | Metas verdes no CI |
| F9 Deploy | Banco, api e web publicados, README, ADRs | URL pública funcionando |
