# Fase 2 — Snapshot: design

- Data: 2026-10-19
- Fase: F2 do roteiro do `CLAUDE.md`
- Status: aprovado em conversa; aguardando revisão do arquivo
- Branch: `feat/snapshot`

## Objetivo

Criar o adaptador da API Ninjas, as fixtures, a soma de regiões (RN-02) e o modo snapshot do job de sincronização, com orçamento de chamadas, checkpoints e lock.

Critério de saída: `npm run sync -w api -- --mode=snapshot` faz 2 chamadas (casos e mortes de `2023-03-09`) e carrega a data de referência. No CI isso é provado pelo teste de integração com fixtures, sem chamadas reais. A execução contra a fonte real só acontece com autorização explícita.

## Descobertas da chamada real (2026-10-19, 3 chamadas autorizadas)

- **D-02 fechada:** a série da API Ninjas vai de `2020-01-22` a `2023-03-09` (1.143 dias).
- `GET /v1/covid19?date=2023-03-09` devolve `[{ "country", "region", "cases": { "total", "new" } }]`; com `type=deaths`, a chave é `deaths`. Foram 289 linhas, de 201 países, todas com inteiros, sem nulos e sem negativos.
- `GET /v1/covid19?country=Brazil` devolve `[{ "country", "region", "cases": { "YYYY-MM-DD": { "total", "new" } } }]`, com as datas em ordem.
- Os 201 nomes de país da fonte já batem com os aliases provisórios da F1. O único alias sem dados na fonte é `Western Sahara` (ESH).
- Oito países vêm divididos em regiões: Austrália (8), Canadá (16, inclusive os navios `Diamond Princess` e `Grand Princess`), China (34), Dinamarca (3: Faroe, Groenlândia e a linha do país), França (12), Países Baixos (5), Nova Zelândia (3) e Reino Unido (15). Os EUA vêm numa linha só.
- A resposta não traz cabeçalhos de cota.

## Decisões desta fase

| Tema | Decisão |
| --- | --- |
| Curadoria de aliases | Arquivo versionado `api/prisma/seed/aliases.json` (`sourceName`, `countryCode`, `status` `mapped`/`ignored`). O `db:seed` aplica só o arquivo e nunca altera nem apaga os aliases que não estão nele, como os `pending` que o sync cria. O `countries.json` deixa de ter `sourceName`. |
| Sync órfão | Advisory lock do Postgres numa conexão própria. Sem o lock, outro sync está rodando e este sai. Com o lock, um `sync_run` em `running` é de um processo morto: vira `failed` com `error = 'interrompido: o processo anterior terminou sem fechar o run'`. |
| Mês do orçamento | Mês calendário UTC: chamadas desde o dia 1, 00:00 UTC. |
| Status do run | `failed`: 401/403 ou nada gravado. `partial`: alguma unidade com erro ou algum alias `pending`. `success`: todas as unidades gravaram e nenhum alias ficou `pending`. |
| Retentativas | Até 3 tentativas em 429, 5xx, timeout e erro de rede, com espera de 1 s e 2 s. Cada tentativa conta no orçamento e vira uma linha em `provider_call`. |
| Soma de regiões (RN-02) | Todas as linhas com o mesmo `country` somam `total` e `new`, inclusive as regiões que são navios (Canadá) ou territórios (Dinamarca, França etc.). A soma é por ISO3 depois de resolver o alias. |
| Fixtures | O repositório é público e os termos da API Ninjas proíbem armazenar os dados, então só entram recortes pequenos e uma lista de nomes sem números. |

## Arquitetura

```text
cli.ts ─► run-sync.ts ─► sync-lock.repository (pg.Client + advisory lock)
                     └─► run-snapshot.ts ─► CovidProvider (api-ninjas) ─► CallGate.fetch
                                         ├─► aggregate.ts (puro: aliases + RN-02)
                                         └─► repositories (Prisma)
```

- O provider faz HTTP e zod, nada de banco. Recebe um `fetch` injetado.
- O `CallGate` é o `fetch` do job: orçamento, timeout, retentativas e gravação em `provider_call`.
- `aggregate.ts` é puro e testável sem banco.
- SQL e Prisma ficam só em `api/src/repositories`.

### Arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `api/src/config/sync-env.ts` | `loadSyncEnv()` com zod: `DATABASE_URL_SYNC`, `DATA_PROVIDER` (`api_ninjas` \| `jhu_csv` \| `apify`, padrão `api_ninjas`), `API_NINJAS_KEY` (obrigatória quando `api_ninjas`), `SYNC_CALLS_PER_HOUR` (padrão 90), `SYNC_CALLS_PER_MONTH` (padrão 3000), `LOG_LEVEL`. Valor vazio conta como ausente, como no `env.ts`. |
| `api/src/lib/logger.ts` | `createLogger` ganha `redact` para chaves (`apiKey`, `API_NINJAS_KEY`, header `x-api-key`). |
| `api/src/lib/prisma.ts` | `createPrisma(url)` com `PrismaPg`. |
| `api/src/providers/covid-provider.ts` | Tipos `Metric`, `SourceRow`, `CovidProvider`. |
| `api/src/providers/provider-errors.ts` | `ProviderAuthError`, `ProviderHttpError`, `ProviderPayloadError`, `ProviderNetworkError`. |
| `api/src/providers/api-ninjas/api-ninjas.schemas.ts` | Schema zod da resposta `date=` por métrica. |
| `api/src/providers/api-ninjas/api-ninjas.provider.ts` | `createApiNinjasProvider({ apiKey, fetch })`. |
| `api/src/providers/create-provider.ts` | Escolhe o provider por `DATA_PROVIDER`; `jhu_csv` e `apify` lançam "não implementado". |
| `api/src/jobs/sync/budget.ts` | `monthStartUtc(now)`, `isBudgetExhausted(counts, limits)`, `BudgetExhaustedError`. |
| `api/src/jobs/sync/call-gate.ts` | `createCallGate(...)` → `{ fetch, markLastInvalid }`. |
| `api/src/jobs/sync/aggregate.ts` | `aggregateDay(rows, aliases)`. |
| `api/src/jobs/sync/run-snapshot.ts` | Orquestra as 2 unidades e fecha o run. |
| `api/src/jobs/sync/run-sync.ts` | Lock, recuperação de órfão e despacho por modo. |
| `api/src/jobs/sync/cli-args.ts` | `parseSyncArgs(argv)` → `{ mode }`. |
| `api/src/jobs/sync/cli.ts` | Ponto de entrada do `npm run sync`. |
| `api/src/repositories/*.repository.ts` | `data-source`, `alias`, `daily-stat`, `sync-run`, `provider-call`, `global-stat`, `sync-lock`. |
| `api/prisma/seed/aliases.json` + `aliases.ts` | Curadoria versionada e o schema zod que a valida. |

## Interfaces

```ts
type Metric = 'cases' | 'deaths';
interface SourceRow { country: string; region: string; total: number; new: number }
interface CovidProvider {
  readonly sourceCode: 'api_ninjas';
  readonly finalDate: string;              // '2023-03-09' (D-02)
  fetchDay(date: string, metric: Metric): Promise<SourceRow[]>;
}
type FetchLike = (url: string, init: { headers: Record<string, string> }) => Promise<Response>;
```

- O provider chama `GET https://api.api-ninjas.com/v1/covid19?date=<date>&type=<metric>` com o header `X-Api-Key`, sempre com `type` explícito.
- **Resposta:** 2xx com JSON válido passa pelo zod e vira `SourceRow[]`.
  - 401/403 → `ProviderAuthError`.
  - Outro status não 2xx → `ProviderHttpError`.
  - JSON inválido, schema inválido ou lista vazia → `ProviderPayloadError`.
- **Schema zod:** array com pelo menos 1 item de `{ country: string não vazia, region: string, [metric]: { total: inteiro ≥ 0, new: inteiro } }`.
- **`CallGate.fetch`:**
  - **Antes de cada tentativa:** conta as linhas de `provider_call` da fonte na última hora e desde `monthStartUtc(now)`. Se uma delas atingir o limite, lança `BudgetExhaustedError` sem chamar.
  - **Cada tentativa:** tem `AbortSignal.timeout(10_000)` e grava `endpoint` (caminho + query, nunca a chave), `status_code`, `duration_ms` e `outcome` (`ok` \| `http_error` \| `timeout` \| `network_error`).
  - **Retentativas:** repete em 429, 5xx, timeout e erro de rede, até 3 tentativas, esperando 1 s e depois 2 s (`sleep` injetável). Esgotadas as tentativas, devolve a última resposta (429/5xx) ou lança `ProviderNetworkError`.
  - **`markLastInvalid()`:** muda o `outcome` da última chamada para `invalid_payload`.
- **`aggregateDay(rows, aliases)`:** `aliases` é um `Map<sourceName, { status, countryCode }>`. Devolve `{ stats: { countryCode, total, new }[], pendingNames: string[], ignoredNames: string[] }`.
  - `mapped` soma `total` e `new` por ISO3 (RN-02).
  - `ignored` vai para `ignoredNames`.
  - Nome sem alias ou com alias `pending` vai para `pendingNames`, uma vez por nome, em ordem alfabética.

## Fluxo do snapshot

1. **CLI:** `parseSyncArgs` aceita `--mode=snapshot` ou `--mode=full`. O `full` sai com código 2 e a mensagem de que chega na F5. Sem `--mode` ou com valor inválido, também sai com 2 e mostra o uso.
2. **Lock:** `run-sync` abre uma conexão `pg` com `DATABASE_URL_SYNC` e tenta `pg_try_advisory_lock(1835102320)` (`'mapp'` em hexadecimal).
   - Sem o lock, loga "outro sync em andamento" e sai com 1.
   - Com o lock, marca como `failed` (erro de interrompido) todo `sync_run` em `running`.
   - No fim, sempre libera o lock e fecha a conexão.
3. **Abertura do run:** busca o `data_source` pelo `sourceCode`; se não existir, lança erro pedindo `db:seed`. Cria o `sync_run` (`running`, `snapshot`, `reference_date = finalDate`).
4. **Unidades:** `snapshot:cases:2023-03-09` e depois `snapshot:deaths:2023-03-09`. Para cada uma:
   - cria o checkpoint `pending`, incrementa `attempts` e chama `provider.fetchDay`;
   - lê os aliases da fonte e roda `aggregateDay`;
   - numa transação:
     - insere os `pendingNames` como `pending` (`ON CONFLICT DO NOTHING`);
     - faz o upsert em lote de `daily_stat` (`INSERT … ON CONFLICT (country_code, metric, stat_date, source_id) DO UPDATE SET total, new_value, updated_at = now()`);
     - marca o checkpoint `done`.
5. **Erros por unidade:**

   | Erro | Efeito |
   | --- | --- |
   | `ProviderPayloadError` | `markLastInvalid()`; checkpoint `error` com a mensagem; nada gravado da unidade; segue para a próxima. |
   | `ProviderHttpError`, `ProviderNetworkError` | Checkpoint `error`; segue para a próxima. |
   | `BudgetExhaustedError` | Checkpoint `error`; não tenta as unidades restantes. |
   | `ProviderAuthError` | Checkpoint `error`; o run fecha como `failed` e nada mais é tentado. |

6. **View:** se alguma unidade gravou, roda `REFRESH MATERIALIZED VIEW CONCURRENTLY global_daily_stat`.
7. **Fechamento:** grava `status` conforme a tabela de decisões, `calls_used` (contagem de `provider_call` do run), `finished_at` e, quando houver, `error`.
8. **Saída:** o CLI loga o resumo (`runId`, `status`, `callsUsed`, `pendingNames`) e sai com 0 em `success`/`partial` e 1 em `failed`. Exceção inesperada no orquestrador: o run vira `failed` com a mensagem e o CLI sai com 1.

## Variáveis de ambiente

`api/.env.example` ganha valores falsos:

```dotenv
DATA_PROVIDER=api_ninjas
API_NINJAS_KEY=fake-api-ninjas-key
SYNC_CALLS_PER_HOUR=90
SYNC_CALLS_PER_MONTH=3000
```

O env da api HTTP (`loadEnv`) não ganha a chave: a api nunca chama a fonte.

## Scripts

- `npm run sync -w api` = `tsx --env-file-if-exists=.env src/jobs/sync/cli.ts`.

## Fixtures (`api/tests/fixtures/api-ninjas/`)

Recortes reais da chamada de 2026-10-19:

| Arquivo | Conteúdo |
| --- | --- |
| `date-2023-03-09-cases.json` e `date-2023-03-09-deaths.json` | 13 linhas: Austrália (8 regiões), Brasil, Dinamarca (3) e Diamond Princess. |
| `names-2023-03-09.json` | Os 289 pares `{ country, region }` da resposta, sem números. |
| `country-brazil-cases-tail.json` | Os últimos 14 dias da série do Brasil, para a F5. |

Valores esperados das somas (RN-02) em `2023-03-09`:

| País | Casos (total / new) | Mortes (total / new) |
| --- | --- | --- |
| AUS | 11.399.460 / 13.926 | 19.574 / 115 |
| BRA | 37.076.053 / 0 | 699.276 / 0 |
| DNK | 3.451.036 / 139 | 8.345 / 4 |
| XDP | 712 / 0 | 13 / 0 |
| Global | 51.927.261 / 14.065 | 727.208 / 119 |

Os casos sintéticos (429, 401, 5xx, JSON inválido, `total` negativo, nome desconhecido) são escritos dentro dos próprios testes.

## Testes

Zero chamadas reais. Um setup do Vitest, carregado na config unitária e na de integração, troca o `globalThis.fetch` por uma função que lança erro. Todo teste injeta um `fetch` falso, e nenhum teste lê `API_NINJAS_KEY` do ambiente.

**Unitários:**

- `sync-env`:
  - padrões 90 e 3000;
  - chave obrigatória com `api_ninjas`;
  - provider inválido;
  - valor vazio tratado como ausente.
- `cli-args`:
  - `snapshot` e `full` são aceitos;
  - sem `--mode` ou com modo inválido, gera erro de uso.
- `budget`:
  - `monthStartUtc` na virada do mês e do ano;
  - os limites de hora e de mês, com o valor exato do limite contando como esgotado.
- `api-ninjas.provider`:
  - monta a URL e o header;
  - 200 com a fixture vira `SourceRow[]`;
  - 401 e 403 lançam `ProviderAuthError`; 500 lança `ProviderHttpError`;
  - JSON inválido, `total` negativo e lista vazia lançam `ProviderPayloadError`.
- `call-gate`, com um repositório falso em memória:
  - 429 e depois 200 fazem 2 tentativas, 2 linhas e um `sleep(1000)`;
  - 3 × 503 devolvem 503, gravam 3 linhas e chamam `sleep` com 1000 e 2000;
  - timeout grava `outcome = 'timeout'`;
  - orçamento esgotado lança erro antes de chamar o `fetch`;
  - a chave não aparece no `endpoint`.
- `aggregate`:
  - soma das regiões da Austrália e da Dinamarca, com os valores da tabela acima;
  - nome desconhecido e alias `pending` vão para `pendingNames`;
  - `ignored` é pulado;
  - não geográfico mapeado entra normalmente.
- `aliases.json`:
  - passa no schema e tem 202 nomes únicos;
  - todo `countryCode` existe no `countries.json`;
  - todo `country` de `names-2023-03-09.json` tem alias `mapped`.

**Integração (`mapp_test`).** Cada teste limpa `daily_stat`, `sync_checkpoint`, `provider_call`, `sync_run` e os aliases fora do arquivo, e atualiza a view, para não afetar `database.test.ts`.

- Snapshot com as fixtures:
  - fecha com `success` e `reference_date = 2023-03-09`;
  - grava 2 linhas em `provider_call` e 2 checkpoints `done`;
  - deixa 8 linhas em `daily_stat` com os valores da tabela;
  - a view `global_daily_stat` traz o global da tabela.
- Rodar duas vezes deixa as mesmas 8 linhas e os mesmos valores (RN-09).
- Um nome desconhecido na resposta cria o alias `pending` e fecha como `partial`, com o resto gravado.
- Mortes com payload inválido fecham como `partial`: casos gravados, mortes não, checkpoint `error` e `provider_call` com `invalid_payload`.
- Um 401 fecha como `failed`, sem nada em `daily_stat` e sem a segunda chamada.
- Com o orçamento cheio (90 linhas na última hora), fecha como `failed` com zero chamadas ao `fetch`.
- Recuperação de órfão: um `sync_run` em `running` sem dono vira `failed` (interrompido) e o novo run fecha com `success`.
- Com o lock segurado por outra conexão, o `run-sync` recusa e não cria run.
- O seed aplica o `aliases.json` e preserva um alias `pending` que não está no arquivo.

## Documentação

- ADR `docs/adr/0004-sync-job.md`: lock e recuperação de órfão, status do run, mês UTC, retentativas e curadoria de aliases.
- `CLAUDE.md`, seção "Estado atual":
  - registrar a F2 concluída;
  - mover a D-02 para as decisões adotadas (`2023-03-09`);
  - registrar a pergunta aberta da F3 (abaixo).

## Pergunta aberta registrada para a F3

A RN-06 define a data de referência como a "última data com dados para todos os países". A fonte nunca traz o Saara Ocidental (ESH). Essa regra deve considerar só os países presentes na fonte?

## Fora do escopo

- O modo `full`, a retomada entre execuções e o workflow `sync.yml` (F5).
- Os endpoints da api (F3).
- Executar o sync contra a fonte real; isso só acontece com autorização.
