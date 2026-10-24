# Fase 7 — Nível 3: design

Data: 2026-10-24. Fase do roteiro: F7 Nível 3 (2 gráficos e minigráfico no popup; os endpoints de série já entraram na F6a). Critério de saída: E2E do histórico.

Esta spec cobre só **comportamento, dados, estados, acessibilidade e testes**. O visual (posição, tamanhos, cores, tipo de marca, controles, aparência do popup) vem do modelo do Figma do usuário e entra na seção "Visual" quando ele chegar. Nada visual é implementado antes disso.

## Decisões do usuário (2026-10-24)

- D-04 segundo gráfico: **novos por dia com média de 7 dias**.
- D-06 gráficos ao mapa: **o clique seleciona e abre um popup**: navega para `/paises/:code` como hoje e abre no marcador um popup com um minigráfico.
- Os dois gráficos **seguem o período** do cabeçalho (`?period=`), como o card Por tempo.
- O visual é do Figma do usuário (ADR 0007).

## Dados

- Fonte: `/global/timeseries` e `/countries/:code/timeseries` (F6a), `granularity=day`, métrica ativa (`?metric=`).
- Intervalo: o mesmo do card Por tempo (`periodRange`): `to` = data de referência; `from` = `to − (N − 1)` ou `coverage.from` para `all`; cortado em `coverage.from`, com o aviso "Dados a partir de DD/MM/AAAA".
- Sem dados novos na API.

## Gráfico 1 — Crescimento acumulado

- Série `total` por dia.
- Sem país selecionado: só o mundo. Com país: país e mundo no mesmo gráfico.
- Escala linear ou log (CLAUDE.md); padrão linear; a escolha é estado local, fora da URL (a URL só guarda métrica e período). Na escala log, valor ≤ 0 vira lacuna.
- País sem dados no período (`points: []`): estado vazio do gráfico; a linha do mundo não aparece sozinha nesse caso.

## Gráfico 2 — Novos por dia com média de 7 dias

- Série `new` por dia do país selecionado ou, sem seleção, do mundo, e a média móvel de 7 dias (dia atual e os 6 anteriores).
- Para a média valer no primeiro dia do período, a busca começa 6 dias antes de `from`, sem passar de `coverage.from`; esses dias não aparecem. Enquanto não houver 7 dias anteriores dentro da cobertura, a média fica vazia nesse dia.
- RN-07: nada negativo é desenhado. O valor diário negativo aparece como 0, e a média, se negativa, também; o detalhe do ponto (tooltip) mostra o valor real da fonte.

## Minigráfico no popup

- Clique (ou Enter no marcador focado) → navega para `/paises/:code`, como hoje, e abre o popup do marcador.
- Conteúdo: nome do país, total da métrica ativa na data de referência e a série `total` da cobertura inteira com `granularity=week`, sem depender do período.
- A série só é buscada quando o popup abre (cache do TanStack Query).
- Fecha com Esc e com o botão de fechar; o foco volta ao marcador.
- Estados dentro do popup: carregando, vazio, erro com "Tentar de novo".

## Estados e acessibilidade (os dois gráficos)

- Skeleton, vazio ("Sem dados no período"), erro com "Tentar de novo", `DATA_NOT_READY` → "Dados ainda não carregados". Um erro não derruba os outros componentes.
- Resumo textual em cada gráfico (e no minigráfico):
  - acumulado: "Casos acumulados em {lugar} de DD/MM/AAAA a DD/MM/AAAA: de X para Y" (com país, a mesma frase para o mundo);
  - novos: "Novos casos em {lugar} de DD/MM/AAAA a DD/MM/AAAA: pico de X em DD/MM/AAAA; média de 7 dias no último dia: Y".
  - {lugar} = nome do país ou "no mundo"; métrica no texto conforme `?metric=` (casos/mortes).
- Números e datas em pt-BR.

## Visual (pendente do Figma)

Fica para o modelo do usuário:

- posição dos gráficos na página e no celular;
- tipo de marca de cada série (linha, área, barras), cores e legenda;
- controle de escala linear/log;
- aparência e tamanho do popup e do minigráfico;
- biblioteca de componente: componente `chart` do shadcn (sobre Recharts) ou Recharts puro. O Recharts está na arquitetura de qualquer forma.

O plano de implementação só é escrito com o modelo em mãos, ou com o usuário liberando começar pela parte não visual (funções puras e hooks).

## Testes

- Vitest, funções puras: média de 7 dias (início da cobertura sem 7 dias, negativo → 0), intervalo com os 6 dias extras e corte em `coverage.from`, valores ≤ 0 na escala log, textos do resumo.
- Componentes com MSW (fixtures inventadas): estados, resumo textual, país × mundo, troca de escala. No jsdom o Recharts não mede o tamanho; os testes conferem o resumo e a estrutura, não o SVG.
- E2E do histórico (critério de saída), com a API mockada:
  - abrir `/paises/BRA` → os dois gráficos com o resumo do Brasil;
  - trocar o período → o resumo e a URL mudam;
  - clicar num marcador → popup com o minigráfico; Esc fecha.

## Riscos

- Com `all`, a série diária tem ~1.100 pontos: o Recharts aguenta, mas o bundle cresce (~100 KB gzip). Divisão do bundle fica para a F8, se o Lighthouse pedir.
- Na escala log, o começo da curva de um país pequeno fica achatado. Esperado.

## Fora da F7

- D-07 (por 100 mil hab.), axe e E2E no CI (F8).
