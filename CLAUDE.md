# CLAUDE.md — Mapp

Mapa dashboard de COVID-19: mapa-múndi clicável, 3 cards de estatística e 2 gráficos, alimentados por uma API REST própria. Projeto 08 do Portfólio Boost Program (nível básico, full-stack).

- Repositório: https://github.com/MarcosRBjunior/Mapp
- Especificação completa: `docs/especificacao.md` (quando existir). Este arquivo traz só o que guia o trabalho; se os dois divergirem, pergunte.

## Estado atual

- F0 Fundação concluída em 2026-10-19 (PR #1): monorepo `api` + `web`, ESLint/Prettier, Vitest, Playwright, Postgres 18 no Docker (porta do host 5435), CI.
- F1 Banco concluída em 2026-10-19 (PR #2): schema Prisma 7.10 + SQL bruto (CHECKs, view `global_daily_stat`), índice parcial nativo, usuários `mapp` (dono/sync) e `mapp_api` (leitura), seed de 202 entidades (198 países + 4 não geográficas) com aliases provisórios da `api_ninjas`, GeoJSON 1:110m, testes de integração no CI.
- F2 Snapshot concluída em 2026-10-19 (PR #3): provider `CovidProvider` da API Ninjas, `CallGate` (orçamento 90/h e mês calendário UTC, timeout de 10 s, 3 tentativas), soma de regiões (RN-02), modo snapshot com lock advisory e recuperação de run órfão, curadoria de aliases em `api/prisma/seed/aliases.json` (ADR 0004). Fixtures recortadas da chamada real em `api/tests/fixtures/api-ninjas` (o repositório é público e os termos proíbem armazenar os dados).
- F3 API N1 concluída em 2026-10-20 (PR #5): middlewares (requestId, pino-http, helmet, CORS para `WEB_ORIGIN`, rate limit 120/min em `/api`, erro único sem stack), `/ready`, `/api/v1/meta`, `/global`, `/countries`, `/countries/:code` (participação RN-04 e posição RN-05 só entre `kind = country`), OpenAPI gerado dos schemas zod em `docs/openapi.yaml` e `/api/docs` (ADR 0005). Data fora da cobertura → 400; entidade não geográfica em `/countries/:code` → 404; país sem dados na lista → `null`.
- F4 Front N1 concluída em 2026-10-21 (PR #6): React Router 8 (país no caminho, métrica em `?metric=`), TanStack Query, tipos gerados de `docs/openapi.yaml` (`npm run api:types -w web`, com `overrides` de `typescript` no `package.json` raiz para o TS 6), mapa Leaflet com polígonos neutros clicáveis e marcadores ∝ √total acessíveis por teclado, busca com combobox, cards Geral e Por país, faixa de dados e rodapé com fonte e tiles em todas as rotas, `/sobre` com atribuições e entidades não geográficas, 404 e `/paises/XYZ` com aviso. Testes com MSW e fixtures inventadas; E2E com a API mockada (ADR 0006). As pendências da F3 no OpenAPI (âncoras YAML, `default` ao lado de `$ref`, formato das datas, `X-Request-Id`) foram conferidas na geração dos tipos e não afetam o front.
- F5 Carga histórica concluída em 2026-10-21 (PR #7): modo `full` retomável (404 unidades por métrica × alias `mapped`, `country=`, pula unidades `done`, para no orçamento e continua no próximo run), executor único de unidades com `ProviderFactory`, upsert da série em lote, status `failed` só sem gravação, 429 com `Retry-After` e parada, orçamento contado no banco, lock perdido para o run, refresh da view em todo run que gravou, cobertura (RN-06) calculada só pela view por métrica, workflow manual `sync.yml` (ADR 0004 atualizado). O full real contra a API Ninjas ainda não rodou: só com pedido explícito.
- F6a API do Nível 2 concluída em 2026-10-23 (PR #8): cobertura só com datas completas (as duas métricas no próprio N; `from` = primeira data completa; `?date=` só aceita datas completas e as séries só trazem datas completas), `/rankings` (limit 1..50, padrão 10) com a ordem no SQL (`row_number()` e collation `pt-BR-x-icu`, também em `/countries` e `/countries/:code`), `/global/timeseries` e `/countries/:code/timeseries` (dia, semana ISO e mês pela RN-11), cache por `dataVersion` (`ETag "v{n}"`, 304 antes de validar a query, `/meta` com `"v{n}.r{último run}"` e `no-store` sem dados, erros e `/health`/`/ready` com `no-store`, memo de 5 s do `dataVersion`), run órfão que gravou fecha `partial` e full sem unidades não cria run.
- F6b Front do Nível 2 concluída em 2026-10-23 (PR #9): shadcn/ui (estilo `radix-nova`, Radix) + Tailwind v4 a partir do bloco `dashboard-01` (sidebar Mapa/Sobre, cabeçalho com busca, métrica e período), período em `?period=7d|30d|90d|all` (padrão `30d`), card Por tempo (novos no período pela série mensal, cortado em `coverage.from` com aviso), ranking Top 10 com link para o país e destaque do selecionado, E2E de comparação e ranking com a API mockada (ADR 0007). Com isso a F6 está concluída. Pendências da F6b no item "Adiado".
- F7 Nível 3 concluída em 2026-10-25 (PR #10): gráficos com o `chart` do shadcn (Recharts) — crescimento acumulado país × mundo com escala linear/log e novos por dia com média de 7 dias (negativos nunca desenhados, RN-07) — seguindo o `?period=` (busca diária com 6 dias antes para a média), resumo textual em cada gráfico, minigráfico semanal da série inteira no popup do marcador (busca só ao abrir; Esc fecha e devolve o foco), E2E do histórico com a API mockada.
- TypeScript fixado em `~6.0.3` até o typescript-eslint suportar o TS 7 (ADR 0001).
- Adiado com fase-alvo: `NODE_ENV=production` garantido no deploy e `trust proxy` do Express para o rate limit atrás do proxy da hospedagem (F9); reporter/trace do Playwright e E2E no CI, actions fixadas por SHA + Dependabot (F8); `postinstall` depende do `prisma` (devDependency), seed em lote, `db:migrate` sem depender do `db:roles` em banco gerenciado e `ALTER ROLE ... PASSWORD` sem expor a senha em log (F9); `DATABASE_URL_SYNC` precisa ser conexão direta ou de sessão, pois o advisory lock de sessão não funciona atrás de pooler em modo transação (PgBouncer/Supavisor/Neon pooled) (F9); banco gerenciado precisa da collation ICU `pt-BR-x-icu` (F9); mais da revisão da F3: menos idas ao banco por requisição (data validada pelo estado em memória, F8); telemetria do `@scarf/scarf` (dependência do `swagger-ui-express`) desligada no CI e no deploy, e `WEB_ORIGIN` validado com `new URL(v).origin === v` (F8/F9). E2E do front no CI e axe nas páginas (F8); front: ordem de Tab dos marcadores por tamanho, `dt`/`dd` do card Geral, guarda no E2E que falhe se algum host externo for chamado (F8); rodapé sem a linha da fonte enquanto o `/meta` carrega ou falha (RN-10) e tela em branco quando falta `VITE_*` — mostrar uma mensagem (F9); da F5: run que começa com o orçamento esgotado sai com código 1 — explicar no README (F9); testes do limite superior de datas da série, do rollback do alias `pending` e do refresh na recuperação de órfão (F8). Da F6b (F8): landmarks para o axe (cabeçalho da sidebar e faixa de dados fora de landmark), E2E do menu no celular, links para "/" mantendo `?metric=`/`?period=`, aviso "Sem dados no período" piscando em `/paises/XYZ`, `aria-labelledby` repetido na tabela do ranking, foco por setas nos seletores sem selecionar, cookie `sidebar_state` gravado sem uso e o E2E da Groenlândia instável na primeira carga; a soma do card Por tempo cobre só as datas completas do período (RN-06). Da F7 (F8): o conteúdo do popup continua montado depois de fechar e busca a série de novo ao trocar a métrica; aviso `width(0)/height(0)` do Recharts e popup sem `update()` depois que o minigráfico carrega; resumos mostram o código do país enquanto o nome carrega; skeleton pisca nos gráficos a cada troca (sem `keepPreviousData`); checagens fracas (zero buscas semanais antes do clique, seletor de escala só por `aria-checked`); listeners do `server.events` no teste do minigráfico vazam se uma asserção falhar; override do ESLint no `chart.tsx` gerado; `--chart-*` do tema escuro sem contraste (só o tema claro é usado); E2E "trocar o período" instável na primeira carga fria; Esc fecha o popup mas o país continua selecionado, e buscar o mesmo país não reabre o popup; "Tentar de novo" dos gráficos refaz as consultas com as chaves antigas quando a cobertura muda; gráficos refazem mapas e linhas a cada render (sem `useMemo`) com ~1.100 pontos em "Tudo".
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
- `web`: React 19 + Vite + TypeScript, React Router, TanStack Query, shadcn/ui (Radix) + Tailwind CSS v4, React Leaflet 5 + Leaflet, Recharts.
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
web/src/{app,config,pages,features/{map,stats,charts,ranking,search},shared/{api,ui,format,url,period},test}
web/src/{components/ui,hooks,lib}       # gerados pelo CLI do shadcn (ADR 0007)
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
npm run api:types -w web                  # gera os tipos do front a partir de docs/openapi.yaml
npm run db:migrate -w api
npm run db:seed -w api
npm run db:roles -w api                   # cria/atualiza o usuário leitor (já roda no db:migrate)
npm run test:integration -w api           # recria o banco mapp_test e roda os testes com Postgres
npm run sync -w api -- --mode=snapshot    # 2 chamadas: só a data de referência
npm run sync -w api -- --mode=full        # série histórica, retomável (~404 chamadas no total; para no orçamento e continua)
```

## Dados e fonte externa

- Métricas: `cases` e `deaths`, cada uma com `total` (acumulado) e `new` (do dia). Granularidade: país.
- Fonte decidida: API Ninjas (D-01, ADR 0002). Implemente pela interface `CovidProvider` e selecione por `DATA_PROVIDER` (`api_ninjas` | `jhu_csv` | `apify`).
- API Ninjas: `GET https://api.api-ninjas.com/v1/covid19`, header `X-Api-Key`. `country=` devolve a série; `date=YYYY-MM-DD` devolve um dia de todos os países; `type=cases|deaths`. Plano gratuito: 3.000 chamadas/mês, 100/hora, exige atribuição e **não permite cache nem armazenamento**.
- Série da API Ninjas: de 2020-01-22 a 2023-03-09 (D-02, confirmada com chamada real em 2026-10-19). Oito países vêm divididos em regiões (Austrália, Canadá, China, Dinamarca, França, Países Baixos, Nova Zelândia e Reino Unido).
- Apify (agregador COVID): só 45 países, parado em 21/11/2022, mistura `null`, `"NA"` e `0`. Só como fonte secundária.
- JHU CSSE (CSV no GitHub): licença CC BY 4.0, coleta encerrada em 10/03/2023. Alternativa que permite armazenar.
- Orçamento do job: no máximo 90 chamadas/hora e o limite mensal, contados na tabela `provider_call`.
- Timeout de 10 s; até 3 tentativas com backoff em 429/5xx; 401/403 encerra a execução: `failed` se nada foi gravado, `partial` se já gravou (ADR 0004). Três unidades seguidas com falha de rede/5xx param o run; `Retry-After` acima de 60 s para na hora.
- Valide toda resposta da fonte com zod antes de gravar. Formato inesperado = checkpoint `error`, nada gravado.
- Testes e CI usam só fixtures gravadas em `api/tests/fixtures`. Zero chamadas reais.
- O produto é um dashboard histórico: sempre mostre a data de referência e a fonte.

## Regras de negócio

- RN-01 Global = soma dos países na mesma data, calculada no banco (view `global_daily_stat`).
- RN-02 País dividido em regiões na fonte → somar as regiões por data.
- RN-04 Participação % = país ÷ global na mesma data × 100, 1 casa decimal; global 0 ou ausente → `null` (UI mostra "—").
- RN-05 Ranking por valor absoluto na data de referência; empate → ordem alfabética.
- RN-06 Data de referência = última data com dados para todos os países presentes na fonte (países da base que a fonte nunca traz, como o Saara Ocidental, não contam); sempre exibida junto dos números. Cálculo: N de cada métrica = maior número de países numa data da view; a data de referência é a última em que as duas métricas atingem o próprio N. Data completa = as duas métricas atingem o próprio N; a cobertura vai da primeira à última data completa, e `?date=` só aceita datas completas e as séries só trazem datas completas.
- RN-07 `new` negativo (correção da fonte) é gravado como veio; o gráfico de novos usa média móvel de 7 dias e nunca desenha valor negativo.
- RN-08 Entidades não geográficas (navios etc.) não viram marcador, mas entram no global e são listadas em `/sobre`.
- RN-09 Upsert idempotente pela chave (país, métrica, data, fonte). Rodar duas vezes não duplica.
- RN-10 Fonte, licença e atribuição dos tiles visíveis em todas as rotas.
- RN-11 Semana/mês: `new` = soma do período; `total` = último valor do período.

## Banco (PostgreSQL)

- Tabelas: `data_source`; `country` (PK ISO3, `kind` = `country` | `non_geographic`, `lat`/`lng`); `country_alias` (nome da fonte → ISO3, status `mapped` | `pending` | `ignored`); `daily_stat` (PK `country_code + metric + stat_date + source_id`, `total` ≥ 0, `new_value` pode ser negativo); `sync_run` (no máximo 1 `running`, via índice único parcial); `sync_checkpoint`; `provider_call`.
- View materializada `global_daily_stat`, atualizada com `REFRESH MATERIALIZED VIEW CONCURRENTLY` ao fim de cada sync. O `id` do último `sync_run` com status `success` ou `partial` é o `dataVersion` (todo run que grava dados muda o ETag, inclusive um órfão recuperado que gravou; um full sem unidades restantes não cria run).
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
- `Cache-Control: public, max-age=3600` + `ETag` com `dataVersion` (304 quando igual, antes de validar a query); `/meta` usa `dataVersion` + id do último run e, sem dados, responde 200 com `no-store` e sem ETag; erros, `/health` e `/ready` com `no-store`.
- Rate limit de 120 req/min por IP.
- Erro sempre no formato `{ "error": { "code", "message", "details", "requestId" } }`. Códigos: `VALIDATION_ERROR` 400, `COUNTRY_NOT_FOUND` 404, `NOT_FOUND` 404 (rota inexistente), `RATE_LIMITED` 429, `DATA_NOT_READY` 503, `INTERNAL_ERROR` 500 (sem stack trace na resposta).
- `:code` = ISO3 (`^[A-Za-z]{3}$`, normalizado para maiúsculas).

## Frontend

- Rotas: `/`, `/paises/:code`, `/sobre`, `*` (404). Métrica e período ficam na URL.
- Layout: casco do `dashboard-01` (sidebar e cabeçalho com busca, métrica e período); mapa no topo; 3 cards (Geral, Por país, Por tempo); 2 gráficos de linha embaixo; ranking Top 10. No celular, tudo empilhado e a sidebar vira menu.
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
- D-01 fonte de dados: API Ninjas (ADR 0002) · dois usuários de banco, o do sync é dono do schema (ADR 0003) · D-02 a série termina em 2023-03-09 · job de sync: lock advisory, status, orçamento no mês UTC e aliases versionados (ADR 0004) · `dataVersion` conta runs `success` e `partial` · API: camadas com serviços injetados e OpenAPI gerado dos schemas zod (ADR 0005) · Front: dados, tipos e mapa (ADR 0006) · polígonos de territórios sem país na base herdam o soberano (GRL→DNK, PRI→USA, FLK→GBR, NCL→FRA, ATF→FRA, SOL→SOM, CYN→CYP); TKM sem link · D-03 card Por tempo: novos no período (7, 30 ou 90 dias ou tudo, padrão 30, terminando na data de referência) · Front: shadcn/ui + Tailwind v4 a partir do dashboard-01, tema claro (ADR 0007) · D-04 segundo gráfico: novos por dia com média de 7 dias · D-06 gráficos ao mapa: o clique seleciona o país e abre um popup com minigráfico

Em aberto — pergunte antes de implementar o que depende delas:

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
