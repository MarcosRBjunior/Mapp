# Mapa coroplético — design

Data: 2026-11-25 · Muda a decisão "Marcadores (coroplético fica para depois)". O usuário delegou as escolhas ("pode seguir como achar melhor").

## Decisões

- **Convivência:** controle "Marcadores | Cores" no canto do mapa, em `?view=choropleth`. Sem o parâmetro, marcadores (padrão de hoje). Trocar a vista não cria passo no histórico (igual a métrica e período) e os links de volta ao mapa mantêm a vista.
- **Valor:** total absoluto da métrica ativa na data de referência (D-07, RN-05), o mesmo da lista `/countries` que os marcadores já usam. Sem dados de população.
- **Escala:** 5 faixas logarítmicas por décadas, a partir do topo `10^ceil(log10(max))`: limites `topo/10⁴`, `topo/10³`, `topo/10²`, `topo/10`. Valor `null` → "Sem dados" (cinza neutro). Total 0 cai na primeira faixa.
- **Cores:** rampa sequencial por métrica (vermelhos para casos, roxos para mortes), com versão clara e escura em `map-colors.ts` (no escuro, faixa alta = mais clara).
- **Polígonos:** territórios sem país na base herdam o soberano (regra existente em `polygon-links.ts`). `fillOpacity` 0,8 na vista Cores.
- **Marcadores na vista Cores:** viram pontos de raio fixo (4; 6 no selecionado), sem cor de métrica. Continuam focáveis por teclado, com tooltip, popup e minigráfico: nada de acessibilidade se perde e tamanho e cor não dizem a mesma coisa.
- **Legenda:** na vista Cores, faixas com amostra de cor e texto ("até 10 mil", "10 mil a 100 mil", …, "100 mi ou mais") e "Sem dados". Na vista Marcadores, a legenda de tamanhos de hoje.

## Arquivos

- `web/src/shared/url/use-map-view.ts` (+ teste); `dashboard-search.ts` mantém `view`.
- `web/src/features/map/choropleth-scale.ts` (+ teste): `choroplethBreaks(max)`, `choroplethClass(value, breaks)`, `choroplethLabels(breaks)`.
- `map-colors.ts`: `ramp: Record<Metric, string[]>`, `noData`, `dot`.
- `country-polygons.tsx`: recebe `fills: ReadonlyMap<string, string> | null`.
- `country-markers.tsx`: recebe `view` e usa ponto fixo na vista Cores.
- `map-legend.tsx`: legenda de faixas na vista Cores.
- `map-view-toggle.tsx`: `ChoiceToggle` "Vista do mapa".
- `world-map.tsx` e `dashboard-page.tsx`: ligam tudo.

## Testes

- Unitários: faixas (máximos variados, `null`, 0, valor acima do topo), rótulos, parser da vista.
- Componente: legenda de faixas; toggle muda a URL sem passo no histórico.
- E2E: alternar para Cores pinta os polígonos (`fill` diferente do neutro) e mantém o clique no país; recarregar mantém a vista.
- axe nas páginas com a vista Cores, nos dois temas.

## Fora do escopo

Por 100 mil habitantes (D-07), escala por quantis, animação no tempo.
