# Fase 6 — Nível 2: design

Data: 2026-10-23. Fase do roteiro: F6 Nível 2 (`/rankings`, cache + ETag, participação %, ranking, card Por tempo). Critério de saída: E2E de comparação e ranking.

A participação % e a posição já existem desde a F3 (`/countries/:code`) e a F4 (card Por país). A F6 entrega o resto em duas partes, cada uma com plano e PR próprios:

- **F6a — API e sync**: cache + ETag, `/rankings`, rotas de série, cobertura só com datas completas, pendências da F3 e da F5.
- **F6b — Front**: migração para shadcn/ui + Tailwind v4 sobre o bloco `dashboard-01`, período na URL, card Por tempo, ranking e o E2E de saída.

## Decisões do usuário (2026-10-22/23)

- D-03 card Por tempo: **novos no período** (soma de `new`, RN-11), do país selecionado ou, sem seleção, do mundo.
- Períodos: `7d`, `30d`, `90d`, `all`, terminando na data de referência; padrão `30d`; na URL como `?period=`.
- Ranking na tela: **Top 10 absoluto** da métrica ativa na data de referência (RN-05). D-07 (por 100 mil hab.) continua em aberto e fora da F6.
- Run órfão que já gravou dados fecha como **`partial`**; sem gravação continua `failed`.
- Opção A: as rotas de série (`/global/timeseries`, `/countries/:code/timeseries`) entram na F6a, porque o card Por tempo precisa da soma do período; a F7 fica com os gráficos e o minigráfico.
- Cobertura só com datas completas (seção 4).
- Front com **shadcn/ui** (base Radix) + **Tailwind v4**, partindo de `npx shadcn@latest add dashboard-01`; **tema claro**, o padrão do shadcn. O visual é decisão do usuário: se ele colocar um projeto do Figma na pasta, ele prevalece sobre o bloco.

## F6a — API e sync

### 1. Cache e ETag

- Rotas de dados de `/api/v1` (`/global`, `/global/timeseries`, `/countries`, `/countries/:code`, `/countries/:code/timeseries`, `/rankings`) com 200: `Cache-Control: public, max-age=3600` e `ETag: "v{dataVersion}"`.
- `If-None-Match` igual ao ETag atual (lista separada por vírgula, comparação fraca, `W/` ignorado; `*` também casa) → **304** sem corpo, com os mesmos `ETag` e `Cache-Control`, **antes** de validar a query e consultar os dados. Uma URL com a mesma versão sempre devolve o mesmo corpo, então o atalho é seguro.
- `/meta`: o `lastSync` muda até num run `failed`, que não muda o `dataVersion`. ETag `"v{dataVersion ?? 0}.r{id do último run finalizado ?? 0}"`, mesmo `Cache-Control`, 304 do mesmo jeito. Funciona sem dados carregados (o `/meta` responde 200 com nulos) (ajustado no /code-review: sem dados, `no-store` e sem ETag, logo sem 304).
- Sem dados (`dataVersion` nulo) as rotas de dados seguem com 503, sem ETag.
- Toda resposta de erro (400, 404, 429, 500, 503) leva `Cache-Control: no-store`. `/health` e `/ready` também `no-store`. `/api/docs` fica como está.
- O ETag automático do Express é desligado (`app.set('etag', false)`) para não haver dois mecanismos.
- Memo de 5 s do `dataVersion` no `DataStateService` (pendência da F3): uma consulta ao `sync_run` a cada 5 s por instância, no máximo. Custo: depois de um sync, a API pode servir a versão anterior por até 5 s.

### 2. `GET /api/v1/rankings`

- Query: `metric` (`cases` | `deaths`, padrão `cases`), `limit` inteiro 1..50 (padrão 10), `date` (padrão: data de referência). Fora disso → 400.
- Resposta:

```json
{
  "date": "2023-03-09",
  "metric": "cases",
  "rankedCount": 190,
  "items": [{ "rank": 1, "code": "USA", "name": "Estados Unidos", "total": 103802702, "new": 0, "share": 15.1 }]
}
```

- Só `kind = country` com dado na data (RN-08). `rankedCount` = quantos entraram no ranking. `share` pela RN-04 (global da view, que inclui as entidades não geográficas; global 0 → `null`).
- Ordem no SQL: `row_number() OVER (ORDER BY total DESC, name COLLATE "pt-BR-x-icu")` — posições distintas, empate em ordem alfabética (RN-05), a mesma ordem do `localeCompare('pt-BR')` usado hoje.
- `/countries/:code` passa a tirar a posição do mesmo SQL (pendência da F3) e a lista de `/countries` ordena só no SQL, por nome com a mesma collation.
- Risco: a collation ICU `pt-BR-x-icu` existe no Postgres 18 do Docker; o banco gerenciado da F9 precisa ter ICU (registrado para a F9).

### 3. Rotas de série

- `GET /api/v1/global/timeseries` e `GET /api/v1/countries/:code/timeseries`.
- Query: `metric` (padrão `cases`), `from`, `to` (padrão: a cobertura inteira), `granularity` = `day` | `week` | `month` (padrão `day`).
- Validação: datas `YYYY-MM-DD` válidas; `from > to` → 400; `from` antes do início da cobertura ou `to` depois da data de referência → 400 com `details: { from, to }` da cobertura, a mesma mensagem de hoje.
- Resposta:

```json
{
  "metric": "cases",
  "granularity": "month",
  "from": "2023-01-01",
  "to": "2023-03-09",
  "points": [{ "date": "2023-01-01", "total": 100, "new": 10 }]
}
```

  A série de país acrescenta `"country": { "code", "name" }`.
- Só datas completas (seção 4) entram. País: só as datas completas em que ele tem dado; sem nenhuma → `points: []` com 200.
- Semana (ISO, segunda a domingo) e mês, RN-11: `new` = soma do bloco; `total` = valor da última data do bloco. O `date` do ponto é o início do bloco cortado em `from` (o primeiro bloco pode começar no meio da semana/mês).
- `:code` inexistente ou não geográfico → 404 `COUNTRY_NOT_FOUND`, como em `/countries/:code`.

### 4. Cobertura só com datas completas

- **Data completa**: as duas métricas atingem o próprio N na view (o N da RN-06).
- `coverage.from` passa de "primeira data da view" para **primeira data completa**. A data de referência continua a última data completa.
- `?date=` (em `/global`, `/countries`, `/countries/:code`, `/rankings`) só aceita data completa; data incompleta → o mesmo 400 de data fora da cobertura.
- Séries só trazem datas completas.
- Efeito: com o full pela metade nenhum número histórico mostra um global com só parte dos países (resolve a pendência da F5 marcada para a F7). Com só o snapshot carregado, a cobertura é de um dia.
- Risco aceito: se a série real de algum país começar depois de 2020-01-22, o `from` começa mais tarde. Só se confirma depois do full real.
- O CLAUDE.md (RN-06) ganha a definição de data completa e de `from`.

### 5. Sync

- Recuperação de órfão: run `running` com pelo menos um checkpoint `done` (a unidade grava linhas e o checkpoint na mesma transação) → `partial`; sem nenhum → `failed`. A mensagem de erro continua a mesma. O refresh da view após a recuperação já existe.
- `--mode=full` sem unidades restantes: não cria `sync_run`; registra "nada a fazer" no log e sai com 0. O ETag não muda. `decideStatus` perde o caso `planned = 0`.

### Testes da F6a

- Supertest em cada rota nova ou alterada: sucesso, 400, 404 (séries de país), 503 e 304 com `If-None-Match`; `no-store` nos erros; ETag do `/meta` com o id do run.
- Unitários: comparação de `If-None-Match`, memo de 5 s, serviços novos.
- Integração (Postgres): ranking com empate em ordem alfabética, `share`, agregação semanal e mensal (RN-11, bloco cortado), cobertura com data incompleta no meio e no início, órfão `partial`/`failed`, full sem unidades sem run.
- OpenAPI regenerado (`npm run openapi -w api`) com as rotas novas e o teste de defasagem verde.

## F6b — Front

### Base visual

- `npx shadcn@latest init` (Vite, base Radix, Tailwind v4, tema claro) e `npx shadcn@latest add dashboard-01`.
- Mapeamento do bloco:

| Peça do bloco | Uso no Mapp |
| --- | --- |
| `app-sidebar` | Navegação: Mapa e Sobre; sem menu de usuário |
| `site-header` | Busca de país, seletor de métrica, seletor de período |
| `section-cards` | Cards Geral, Por país, Por tempo |
| `chart-area-interactive` | Reservado para os gráficos da F7 |
| `data-table` | Ranking Top 10, sem arrastar-e-soltar (sem `@dnd-kit`) |
| (novo) | Mapa Leaflet dentro de um `Card` |

- Tudo da F4 continua valendo: loading/vazio/erro com "Tentar de novo" em cada componente, marcadores focáveis por teclado, contraste AA, pt-BR, faixa "Dados históricos até…" e rodapé com fonte e tiles em todas as rotas, `/sobre`, 404, `/paises/XYZ` com aviso.
- O CSS próprio da F4 sai; os testes de componente e o E2E são ajustados à nova marcação (por papel e nome acessível).
- ADR 0007 (shadcn/ui + Tailwind v4) e o CLAUDE.md (seção Arquitetura) atualizados.

### Período

- `usePeriod`, como o `useMetric`: `?period=7d|30d|90d|all`, padrão `30d`, valor inválido → padrão.
- Seletor no cabeçalho, ao lado da métrica.

### Card Por tempo

- Título "Por tempo"; mostra os novos da métrica ativa no período, do país selecionado ou do mundo.
- Intervalo: `to` = data de referência; `from` = `to − (N − 1)` dias para `Nd`, ou `coverage.from` para `all`; se `from` cair antes de `coverage.from`, usa `coverage.from` e avisa "Dados a partir de DD/MM/AAAA".
- Busca a série com `granularity=month` (no máximo ~38 pontos) e soma `new` (RN-11); a soma é a mesma em qualquer granularidade porque os blocos são cortados no intervalo.
- Texto "de DD/MM/AAAA a DD/MM/AAAA"; número em pt-BR (pode ser negativo pela RN-07).
- Estados: skeleton, vazio ("Sem dados no período"), erro com "Tentar de novo"; `DATA_NOT_READY` → "Dados ainda não carregados".

### Ranking

- `/rankings?metric=&limit=10` na data de referência; colunas posição, país, total, participação %.
- Nome do país é link para `/paises/:code`, mantendo a query; o país selecionado aparece destacado (`aria-current`).
- Título com a métrica e a data: "Top 10 — casos em DD/MM/AAAA".
- Estados: skeleton, vazio, erro com "Tentar de novo".

### Testes da F6b

- Vitest + Testing Library + MSW (fixtures inventadas) para `usePeriod`, card Por tempo (soma, corte em `coverage.from`, estados) e ranking (link, destaque, estados).
- E2E com a API mockada (critério de saída): clicar num item do ranking abre `/paises/X` e o card Por país mostra posição e participação; trocar o período atualiza o card Por tempo e a URL.

## Fora da F6

- D-07 (por 100 mil hab.), gráficos e minigráfico (F7), axe e E2E no CI (F8).
