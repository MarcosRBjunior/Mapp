# ADR 0006 — Front: dados, tipos e mapa

Data: 2026-10-21 · Status: aceita

## Contexto

A F4 cria o primeiro front do Mapp. Ele precisa falar com a API da F3 com tipos confiáveis, guardar a seleção na URL e desenhar o mapa com polígonos e marcadores acessíveis, sem chamar nada externo nos testes.

## Decisão

- **Estado do servidor:** TanStack Query.
  - `staleTime` de 5 minutos, porque os dados são históricos;
  - sem retry em 4xx e 1 retry em 5xx ou erro de rede;
  - cada componente tem a sua query, com loading, vazio e erro locais.
- **Tipos:**
  - `openapi-typescript` gera `web/src/shared/api/schema.d.ts` a partir de `docs/openapi.yaml` (`npm run api:types -w web`), e um teste falha se o arquivo estiver desatualizado;
  - o cliente é o `openapi-fetch`, e `unwrap` converte o envelope de erro em `ApiError`.
  - O `openapi-typescript` 7 declara a peer `typescript ^5.x`; o `overrides` de nível raiz `"typescript": "$typescript"` no `package.json` (a forma aninhada sob `openapi-typescript` ainda dava ERESOLVE) força uma única versão do TS para toda a árvore, a mesma já fixada no workspace (ADR 0001).
- **URL:** o país fica no caminho (`/paises/:code`) e a métrica em `?metric=` (padrão `cases`).
- **Mapa:**
  - polígonos do Natural Earth numa camada neutra e clicável, num pane próprio do Leaflet abaixo dos marcadores (zIndex 350), para o empilhamento não depender da ordem de carga;
  - territórios sem país na base herdam o soberano (GRL→DNK, PRI→USA, FLK→GBR, NCL→FRA, ATF→FRA, SOL→SOM, CYN→CYP), e TKM fica sem link;
  - `CircleMarker` com raio ∝ √total, entre 3 e 40 px;
  - o `path` SVG de cada marcador recebe `tabindex`, `role="button"` e `aria-label`, e abre com Enter/Espaço.
- **Testes:**
  - Vitest + Testing Library + MSW, com fixtures inventadas, porque os termos da fonte proíbem armazenar os dados;
  - nas páginas, o mapa é trocado por um stub;
  - o Leaflet é coberto por E2E do Playwright, com a API mockada por `page.route` e todo host externo bloqueado.

## Consequências

- Mudou um schema da API? Rode `npm run openapi -w api` e `npm run api:types -w web`; os dois testes de atualização apontam o esquecimento.
- O coroplético pode reaproveitar a camada de polígonos e a regra do soberano.
- O `overrides` sai quando o `openapi-typescript` aceitar o TS 6.
