# ADR 0004 — Job de sincronização: lock, status, orçamento e aliases

- Status: aceito
- Data: 2026-10-19

## Contexto

A F2 criou o modo snapshot do job (`npm run sync -w api -- --mode=snapshot`). Ele chama a API Ninjas, que tem cota limitada (3.000 chamadas/mês, 100/hora). Precisávamos decidir como evitar dois syncs ao mesmo tempo, como recuperar um run que ficou em `running` depois de um crash, como contar o orçamento, como fechar o status do run e onde fica a curadoria dos nomes da fonte.

Uma chamada real autorizada (2026-10-19) confirmou que a série termina em `2023-03-09` (D-02) e que os 201 nomes de país da fonte batem com os aliases tirados da tabela da JHU.

## Decisão

- **Lock:** o job segura `pg_try_advisory_lock(1835102320)` numa conexão `pg` própria durante todo o run. Sem o lock, outro sync está rodando e o novo sai com código 1. Com o lock, qualquer `sync_run` em `running` é de um processo morto e vira `failed` com o erro "interrompido: o processo anterior terminou sem fechar o run". O lock de sessão morre com a conexão, então um crash não deixa trava.
- **Status do run:** `failed` quando a fonte rejeita a chave (401/403) ou quando nenhuma unidade gravou; `partial` quando alguma unidade teve erro (payload inválido, 5xx/timeout depois de 3 tentativas, orçamento esgotado) ou algum nome ficou `pending`; `success` no resto. O CLI sai com 0 em `success`/`partial` e com 1 em `failed`.
- **Orçamento:** antes de cada tentativa, o `CallGate` conta as linhas de `provider_call` da fonte na última hora (limite `SYNC_CALLS_PER_HOUR=90`) e desde o dia 1 do mês calendário UTC (limite `SYNC_CALLS_PER_MONTH=3000`). Cada tentativa, inclusive retentativa, conta e vira uma linha.
- **Retentativas:** timeout de 10 s; até 3 tentativas em 429, 5xx, timeout e erro de rede, com espera de 1 s e 2 s. 401/403 não repetem.
- **Aliases:** a curadoria fica em `api/prisma/seed/aliases.json`, versionado e revisado por PR. O `db:seed` aplica só o arquivo e não altera aliases fora dele. Nomes novos que o sync encontra entram como `pending` no banco e fecham o run como `partial` até alguém curar o arquivo.

## Consequências

- Um sync morto não bloqueia o próximo nem exige intervenção manual.
- Curar um alias exige um PR no `aliases.json` e um `db:seed`; o histórico fica no git.
- Se a API Ninjas contar o mês por outro ciclo (por exemplo, a partir da data de cadastro), o limite mensal pode ser ultrapassado perto da virada. O risco é baixo: o modo full deve gastar cerca de 400 chamadas.
- Os testes nunca chamam a fonte: o `fetch` global é bloqueado no Vitest e o job recebe um `fetch` injetado.
- O lock é de sessão: `DATABASE_URL_SYNC` precisa ser uma conexão direta ou de sessão, não um pooler em modo transação.

## Atualização (F5, 2026-10-21)

- **Modo full:**
  - uma unidade por (métrica, alias `mapped`), `full:{metric}:{nome}`, hoje 404, nas mesmas chamadas `country=`;
  - unidades `done` de runs `full` anteriores são puladas, porque a série é histórica, e as `error` ou `pending` são tentadas de novo;
  - orçamento esgotado fecha o run como `partial`, e o próximo `--mode=full` continua de onde parou;
  - o job recusa começar se dois aliases `mapped` apontarem para o mesmo país.
- **Status:**
  - `failed` só quando o run não gravou nada;
  - a chave rejeitada (401/403) depois de gravar vira `partial` e o job para.
  - Assim, todo run que grava dados muda o `dataVersion`.
- **429:**
  - `Retry-After` de 1 a 60 s é respeitado;
  - um 429 na última tentativa vira orçamento esgotado e para o run.
- **Orçamento:** é contado numa query só, com o relógio do banco (última hora e mês calendário UTC).
- **Lock:**
  - se a conexão do lock cair, o run para antes da próxima unidade e fecha com a nota "lock perdido";
  - liberar o lock é best-effort.
- **Consistência:**
  - todo run que gravou atualiza a view, mesmo quando cai por erro inesperado;
  - a recuperação de run órfão também atualiza a view;
  - a cobertura (RN-06) é calculada só pela view, por métrica.
- **Disjuntor:** três unidades seguidas com falha de rede/5xx (`ProviderNetworkError`/`ProviderHttpError`) param o run com a nota `fonte instável`; um sucesso ou outro tipo de erro zera a contagem.
- **Perda do lock:** o sinal do lock chega ao `CallGate`, que não inicia tentativa e cancela a que está em voo (`LockLostError`); o run também não grava a unidade carregada depois da perda e fecha com a nota de lock perdido.
- **`Retry-After`:** um 429 com mais de 60 s (segundos inteiros) encerra na hora como orçamento esgotado; data HTTP ou outro formato mantém o atraso padrão.
- **Workflow:** `.github/workflows/sync.yml` é só manual (`workflow_dispatch`), com `concurrency` e `environment: production`; os segredos (`DATABASE_URL_SYNC`, `API_NINJAS_KEY`) ficam só no `env` do passo `npm run sync`, para que os scripts do `npm ci` não os vejam.
- **Refazer uma série:** unidades `done` nunca rodam de novo; para recarregar um país (por exemplo, depois de remapear um alias), apague os checkpoints `full:cases:<nome>` e `full:deaths:<nome>` e rode o full.

## Atualização da F6a (2026-10-23)

- Run órfão com algum checkpoint `done` fecha `partial` (gravou dados, então conta no `dataVersion`); sem nenhum, `failed`.
- `--mode=full` sem unidades restantes não abre run: registra "nothing to do" e sai com 0, sem trocar o ETag.
