# Fase 5 — Carga histórica (design)

Data: 2026-10-21 · Branch: `feat/historical-sync`

## Objetivo

Carregar a série histórica completa (2020-01-22 a 2023-03-09) com o modo `full` do job de sincronização:
- orçamento de chamadas, checkpoints e retomada entre execuções;
- upsert idempotente (RN-09) e refresh da view;
- CLI `--mode=full` e workflow manual `sync.yml`.

A fase também fecha as pendências da F2 e da F3 marcadas para a F5: consistência entre tabela, view e `dataVersion`, política de 429, e a limpeza do job.

**Critério de saída:** um sync `full` completo termina `success`. Isso é provado em integração com fixtures. O full real contra a API Ninjas, com cerca de 404 chamadas, só roda quando o usuário pedir.

## Decisões fechadas

| Tema | Decisão |
| --- | --- |
| RN-06 (cálculo) | A cobertura passa a ser calculada só pela view `global_daily_stat`. N da métrica = maior `country_count` da métrica. Data de referência = última data em que as duas métricas existem e cada uma tem `country_count = N` dela. `countries` = maior N entre as duas. O significado da RN-06 não muda ("todos os países presentes na fonte"). |
| Orçamento esgotado no meio do full | O run para, fecha como `partial` e o próximo `--mode=full` retoma. O run que concluir as últimas unidades fecha como `success`. Não há espera dentro do processo. |
| Workflow `sync.yml` | Só manual (`workflow_dispatch`), com o input `mode`. Não há agenda. |
| 429 | Com `Retry-After` entre 1 e 60 s (em segundos), espera esse tempo antes da próxima tentativa; sem ele, mantém 1 s e 2 s. Se o 429 persistir na última tentativa, vira `BudgetExhaustedError`: a unidade fica com erro, o run para e fecha `partial`. |
| Status `failed` | Só quando o run não gravou nenhuma unidade. Uma chave rejeitada (401/403) depois de gravar fecha como `partial`, com nota, e o job para. Antes ela fechava sempre como `failed`. Isso garante "todo run que grava dados muda o `dataVersion`". O ADR 0004 é atualizado. |
| Unidade do full | Uma por (métrica, alias `mapped` da fonte): `full:{metric}:{sourceName}`. Hoje são 202 × 2 = 404. Ordem: `cases` e depois `deaths`, com os nomes em ordem alfabética (`localeCompare('en')`). |
| Retomada | Antes de chamar, descarta as unidades que têm checkpoint `done` em qualquer run `full` anterior da mesma fonte, porque a série é histórica e não muda. Unidades com `error` ou `pending` são tentadas de novo. |

## Fonte: série por país

`GET https://api.api-ninjas.com/v1/covid19?country=<nome>&type=<cases|deaths>`. A resposta é uma lista de entradas `{ country, region, <metric>: { "YYYY-MM-DD": { total, new } } }`, uma por região; países sem divisão vêm com `region: ""`. O formato foi confirmado pela fixture `country-brazil-cases-tail.json` da F2.

`CovidProvider` ganha:

```ts
interface SeriesRow { country: string; region: string; points: { date: string; total: number; new: number }[] }
fetchSeries(sourceName: string, metric: Metric): Promise<SeriesRow[]>;
```

- **Validação:** zod sobre a série.
  - Chaves `YYYY-MM-DD` válidas, `total` ≥ 0 e `new` inteiro (pode ser negativo, RN-07).
  - A lista não pode ser vazia.
  - Datas fora de 2020-01-22 a `finalDate` são descartadas.
  - Formato inesperado lança `ProviderPayloadError`.
- **Erros HTTP:** os mesmos do `fetchDay`.

## Agregação

`aggregateSeries(rows, aliases)` aplica a RN-02 por data:
- soma todas as linhas cujo `country` mapeia para o mesmo código (regiões);
- devolve `{ countryCode, points[] }` ordenado por data, mais `pendingNames` e `ignoredNames`, como o `aggregateDay`.

A resposta de um nome deve resultar em no máximo um código. Se resultar em mais de um, a unidade falha com `ProviderPayloadError`.

O planejador de unidades rejeita a configuração (erro claro, o run nem começa) se dois aliases `mapped` apontarem para o mesmo código. Nesse caso, duas unidades sobrescreveriam a série uma da outra. Hoje são 202 aliases, todos 1:1.

## Executor de unidades (refatoração)

O novo `api/src/jobs/sync/run-units.ts` é o executor comum ao snapshot e ao full:

```ts
interface UnitPlan { unit: string; metric: Metric; load(ctx): Promise<UnitResult> }
interface UnitResult { rowsWritten: number; pendingNames: string[]; ignoredNames: string[] }
runUnits(deps, { mode, referenceDate, units }) → SyncResult
```

- **Montagem e loop:**
  - cria o run, o `CallGate` e só então o provider, o que elimina o `gateRef`;
  - carrega os aliases uma vez por run;
  - executa as unidades em ordem com checkpoint (`startCheckpoint` → `load` → `completeCheckpoint` na mesma transação da gravação).
- **Gravação:** a transação da unidade fica num repositório, `writeUnit` em `api/src/repositories/sync-unit.repository.ts`. Ela recebe aliases pendentes, linhas e checkpoint, e chama `upsertDailyStats` (snapshot) ou `upsertSeries` (full).
- **Erros por unidade:**

  | Erro | Efeito |
  | --- | --- |
  | `ProviderPayloadError` | Marca a chamada como `invalid_payload`; a unidade fica com erro e o run segue. |
  | `ProviderHttpError`, `ProviderNetworkError` | A unidade fica com erro e o run segue. |
  | `BudgetExhaustedError` (incluindo o 429 final) | A unidade fica com erro e o run para. |
  | `ProviderAuthError` | A unidade fica com erro e o run para. |
  | Qualquer outro erro | Aborta o run, que fecha `failed` se nada foi gravado ou `partial` se algo foi. A exceção original é relançada. |

- **Status:**
  - `failed` se nenhuma unidade gravou;
  - `partial` se houve erro em alguma unidade, nome `pending`, unidade não tentada (parada por orçamento ou auth) ou parada por auth depois de gravar;
  - `success` no resto. No full, `success` também exige que todas as unidades planejadas estejam `done` (nesta execução ou em uma anterior).
- **Refresh:** `REFRESH MATERIALIZED VIEW CONCURRENTLY` sempre que alguma unidade gravou, inclusive no caminho de erro inesperado, antes de fechar o run.
- **Catch:** `finishRun` e `failCheckpoint` no `catch` são best-effort. Se falharem, o erro vai para o log com `err` e a exceção original é a que sobe.
- **Snapshot:** vira um plano de 2 unidades (`snapshot:{metric}:{finalDate}`) sobre o mesmo executor. O comportamento é o da F2, com a nova regra de status.

## Lock e orçamento

- **Lock:**
  - a conexão do lock ganha um listener de `'error'`. Se ela cair, um `AbortSignal` do run é acionado, o executor para antes da próxima unidade e o run fecha (`partial` se gravou, `failed` se não), com a nota "lock perdido";
  - o `release()` é best-effort: se falhar, só avisa no log e não mascara o resultado.
- **Orçamento:** `countSince` vira uma query única que devolve `lastHour` e `thisMonth`, com `now()` do banco: `count(*) FILTER (WHERE called_at >= now() - interval '1 hour')` e `>= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`. O `now` injetado sai do cálculo do orçamento; os testes controlam o tempo pelas linhas de `provider_call`.
- **Retry-After:** o `CallGate` lê `Retry-After` (segundos inteiros, de 1 a 60) na resposta 429 e espera esse tempo antes da próxima tentativa. Se vier outro formato ou fora da faixa, usa o atraso padrão. No 429 da última tentativa, lança `BudgetExhaustedError` com a mensagem "a fonte respondeu 429 (limite da fonte)".
- **Run órfão:** a recuperação, com o lock obtido, marca os órfãos como `failed` e faz o refresh da view. Os checkpoints `pending` desses runs não contam como `done`, então essas unidades voltam a ser tentadas.

## Banco e consistência (RN-06)

`findCoverage(sourceId)` vira:

```sql
WITH n AS (
  SELECT metric, max(country_count) AS n FROM global_daily_stat WHERE source_id = $1 GROUP BY metric
), complete AS (
  SELECT g.stat_date FROM global_daily_stat g JOIN n USING (metric)
  WHERE g.source_id = $1 AND g.country_count = n.n
  GROUP BY g.stat_date HAVING count(*) = 2
)
SELECT (SELECT min(stat_date) FROM global_daily_stat WHERE source_id = $1) AS "from",
       (SELECT max(stat_date) FROM complete) AS "referenceDate",
       coalesce((SELECT max(n) FROM n), 0)::int AS countries
```

- **Consequência:** a tabela ao vivo nunca desalinha a cobertura. Um run que grava e cai antes do refresh deixa a API servindo a última versão consistente da view, e uma entidade presente em uma só métrica não trava a outra.
- **Métrica ausente:** se uma métrica inteira nunca tiver dados, continua sem data de referência (503). Isso é correto, porque não há dados daquela métrica.
- **`upsertSeries(db, { sourceId, metric, countryCode, points })`:** um `INSERT … SELECT FROM unnest(dates, totals, news) ON CONFLICT … DO UPDATE`, com o mesmo padrão do `upsertDailyStats`, para até cerca de 1.150 linhas por unidade.
- **`findDoneUnits(sourceId, mode)`:** devolve o conjunto de unidades com checkpoint `done` em runs daquela fonte e modo.

## CLI e workflow

- **CLI:** `npm run sync -w api -- --mode=full` passa a funcionar. Os códigos de saída continuam:
  - 0 em `success`/`partial`;
  - 1 em `failed`, lock ocupado ou crash;
  - 2 em uso inválido.

  O log final traz `unitsPlanned`, `unitsDone`, `unitsRemaining` e `callsUsed`.
- **`.github/workflows/sync.yml`:**

```yaml
name: Sync
on:
  workflow_dispatch:
    inputs:
      mode:
        description: snapshot (2 chamadas) ou full (retomável, ~404 chamadas no total)
        type: choice
        options: [snapshot, full]
        default: snapshot
permissions:
  contents: read
concurrency:
  group: sync
  cancel-in-progress: false
jobs:
  sync:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    environment: production
    env:
      DATABASE_URL_SYNC: ${{ secrets.DATABASE_URL_SYNC }}
      API_NINJAS_KEY: ${{ secrets.API_NINJAS_KEY }}
      DATA_PROVIDER: ${{ vars.DATA_PROVIDER || 'api_ninjas' }}
      SYNC_MODE: ${{ inputs.mode }}
    steps:
      - uses: actions/checkout@v7
        with: { persist-credentials: false }
      - uses: actions/setup-node@v7
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - run: npm run sync -w api -- "--mode=$SYNC_MODE"
```

  - O input chega ao shell só por variável de ambiente, nunca interpolado no comando.
  - O `environment: production` permite exigir aprovação manual no GitHub.
  - Ele só funciona depois da D-12/F9, quando houver banco publicado e os secrets.
  - O `postinstall` gera o Prisma client no `npm ci`.

## Testes

Unitários (Vitest, sem banco):

| Arquivo | Casos |
| --- | --- |
| `providers/api-ninjas.series.test.ts` | série válida → `SeriesRow[]`; regiões preservadas; data inválida, `total` negativo, lista vazia, JSON inválido → `ProviderPayloadError`; datas fora da faixa descartadas; 401/403/5xx como no `fetchDay`; URL com `country` codificado (`Korea, South`) |
| `jobs/sync/aggregate-series.test.ts` | soma de regiões por data (datas desencontradas entre regiões somam o que existe); `pending`/`ignored`; resposta com dois códigos → erro; `new` negativo preservado (RN-07) |
| `jobs/sync/full-plan.test.ts` | 2 × nomes `mapped` em ordem; pula `done`; mantém `error`/`pending`; alias duplicado por código → erro |
| `jobs/sync/run-units.test.ts` | status (`failed` só sem gravação; auth depois de gravar → `partial`; orçamento parado → `partial`; `success` exige tudo `done`); refresh chamado só se gravou, inclusive em erro inesperado; erro original relançado mesmo se o `finishRun` falhar; lock perdido para antes da próxima unidade |
| `jobs/sync/call-gate.test.ts` (ampliado) | `Retry-After: 5` → espera 5 s; `Retry-After` inválido ou > 60 → padrão; 429 na última tentativa → `BudgetExhaustedError`; 5xx continua como antes |
| `jobs/sync/cli-args.test.ts`, `cli` | `--mode=full` aceito e despachado |

Integração (`mapp_test`, fetch injetado, fixtures inventadas em `api/tests/fixtures/api-ninjas/series/`):
- **Fixtures:** Brasil, Austrália com 2 regiões, e "Diamond Princess" (não geográfica) só em casos. São 5 datas cada, com `new` negativo numa delas. O resto dos 404 nomes responde com um handler genérico de 1 ponto.
- **Casos:**
  - **Full completo:** termina `success`, grava as séries, o refresh roda e o `dataVersion` muda.
  - **Retomada:** com orçamento curto (linhas de `provider_call` pré-inseridas), o run 1 fecha `partial` e o run 2 retoma sem repetir chamadas das unidades `done` e fecha `success`.
  - **Idempotência:** rodar o full de novo depois de `success` não faz nenhuma chamada nem duplica linhas.
  - **Auth depois de gravar:** fecha `partial` e para.
  - **Erro inesperado depois de gravar** (falha injetada no repositório): a view é atualizada, o run fecha `partial`, e a cobertura e o `/ready` continuam consistentes.
  - **Run órfão com checkpoint `pending`:** o próximo run marca como `failed`, faz o refresh e tenta a unidade de novo.
  - **Cobertura nova:** uma entidade só em casos não trava a data de referência, e uma métrica inteira ausente → `referenceDate` `null`.
  - **API:** `/ready` 200 depois de um run com erro que gravou linhas.
- Os testes de cobertura da F3 (`read-repositories.test.ts`, `api.test.ts`) são atualizados para o cálculo novo.

## Documentação

- ADR 0004 ganha uma atualização com a nova regra de `failed`, a política de 429/Retry-After, a retomada do full e o lock perdido.
- `CLAUDE.md`:
  - F5 concluída;
  - a RN-06 ganha uma nota do cálculo pela view, por métrica;
  - as pendências da F2/F3 resolvidas saem de "Adiado";
  - o comando do full é anotado como retomável.

## Fora do escopo

`/rankings`, cache e ETag (F6); séries no front (F7); E2E no CI (F8); banco publicado, secrets e execução real do workflow (F9). O full real contra a fonte só roda com pedido explícito.
