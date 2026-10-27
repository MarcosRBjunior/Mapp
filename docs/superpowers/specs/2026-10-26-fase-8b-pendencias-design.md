# Fase 8b — Pendências de comportamento e testes: design

Data: 2026-10-26. Segunda parte da F8 Qualidade (a F8a, PR #11, pôs os portões no CI). Critério de saída: os itens do "Adiado" com fase-alvo F8 resolvidos ou registrados como decisão, e o CI verde.

## Decisões do usuário (2026-10-26)

- Triagem aprovada: grupo A corrige na F8b; grupo B fecha como decisão registrada, sem código.
- Esc no popup: **fecha só o popup; o país continua selecionado**. Buscar o país já selecionado reabre o popup.

## Grupo B — decisões registradas (sem código)

- A soma do card Por tempo cobre só as datas completas do período: é a RN-06.
- O `chart.tsx` gerado continua com o override do ESLint (código do CLI do shadcn, ADR 0007).
- `--chart-*` do tema escuro sem ajuste: só o tema claro é usado (ADR 0007).

## 1. API

- **Menos idas ao banco**: o `DataStateService` guarda, junto com o estado em memória (recarregado só quando o `dataVersion` muda), o conjunto de datas **incompletas** entre `from` e `referenceDate`. `resolveDate` passa a validar `?date=` por esse conjunto; `isCompleteDate` deixa de ser chamado por requisição. O repositório ganha `findIncompleteDates(sourceId)` (datas da view entre a primeira e a última data completa em que alguma métrica não atinge o próprio N) e o `isCompleteDate` sai se ficar sem uso.
- **Testes que faltam**:
  - Supertest: `to` depois da data de referência em `/global/timeseries` e `/countries/:code/timeseries` → 400 com `details: { from, to }`.
  - Integração (Postgres): rollback do alias `pending` (o sync que encontra nome sem mapeamento grava `pending` e não deixa linha parcial do país) e refresh da view na recuperação de run órfão que gravou.

## 2. Front — comportamento

- **Links para "/"**: o "Mapa" da sidebar, o "Mapp" do cabeçalho e o link da 404 mantêm só `?metric=` e `?period=` (helper único que monta a busca a partir da URL atual). O "Voltar à visão mundial" de `/paises/XYZ` continua mantendo a query como hoje.
- **`/paises/XYZ`**: enquanto a página ainda não sabe que o país não existe, cards e gráficos mostram o skeleton; `COUNTRY_NOT_FOUND` numa série vira estado de carregamento (a página logo troca para a visão mundial), não "Sem dados no período".
- **Nome do país nos resumos**: vem do detalhe do país ou, enquanto ele carrega, da lista de países (`useCountries`, já em cache); só se nenhum dos dois tiver o país aparece o código.
- **Troca de período, métrica ou país nos gráficos**: `keepPreviousData` nas séries; enquanto chega a resposta nova, o gráfico mostra o conteúdo anterior (gráfico e resumo) esmaecido e com `aria-busy="true"`, sem skeleton.
- **`useMemo`** nos gráficos: linhas, mapas por data e configuração só recalculam quando mudam os dados, a escala ou o nome.
- **"Tentar de novo"** dos gráficos e do card Por tempo: depois de atualizar o `/meta`, invalida as séries ativas (`invalidateQueries` com a chave `['timeseries']`) em vez de refazer as consultas capturadas no render.
- **Popup**:
  - o minigráfico só fica montado com o popup aberto (estado ligado a `popupopen`/`popupclose`);
  - buscar (ou clicar no ranking) o país já selecionado reabre o popup;
  - o aviso `width(0)/height(0)` do Recharts some (causa investigada na implementação; correção sem mudar o visual e sem editar o `chart.tsx` gerado; se exigir editar, registra a decisão).
- **Seletores** (métrica, período, escala): as setas selecionam ao mover o foco (padrão de botões de opção: a seleção segue o foco). Tab continua entrando no item selecionado.
- **Cookie `sidebar_state`**: a gravação sai do `sidebar.tsx` (que já tem ajustes locais desde a F6b).

## 3. Testes

- **E2E contra o build de produção**: o `webServer` do Playwright passa a ser `vite build` (com as variáveis inline, como no Lighthouse) seguido de `vite preview` na porta 5180. Hipótese: a instabilidade da primeira carga (Groenlândia, "trocar o período") vem da compilação sob demanda do servidor de desenvolvimento. Saída num diretório próprio (`dist-e2e`), ignorado como os outros.
- **axe** espera os contornos do mapa (`path[data-iso3]`) antes de analisar.
- **Checagens mais firmes**:
  - "zero buscas semanais antes do clique" só é conferido depois de a rede da página silenciar;
  - o seletor de escala é testado no E2E pela mudança dos rótulos do eixo Y ao trocar para Log;
  - os listeners do `server.events` no teste do minigráfico são removidos num `afterEach`.

## 4. Documentação

- CLAUDE.md: F8b concluída (e com ela a F8); itens do "Adiado" resolvidos saem; os do grupo B vão para "Decisões"; o que ficar de fora volta ao "Adiado" com fase-alvo.
- ADR 0008: o E2E roda contra o build de produção.

## Fora da F8b

- Itens com fase-alvo F9 continuam no "Adiado".
- D-07 (por 100 mil hab.) continua em aberto.
