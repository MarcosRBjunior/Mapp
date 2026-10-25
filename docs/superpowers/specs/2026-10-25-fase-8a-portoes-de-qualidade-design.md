# Fase 8a — Portões de qualidade: design

Data: 2026-10-25. Fase do roteiro: F8 Qualidade (E2E no CI, axe, Lighthouse, teste de bundle, Dependabot). Critério de saída: metas verdes no CI.

A F8 tem duas partes, cada uma com plano e PR próprios:

- **F8a — portões de qualidade no CI** (esta spec): E2E no CI, axe, Lighthouse, teste de bundle, Dependabot, actions por SHA, telemetria do scarf, e as correções de acessibilidade que esses portões exigem.
- **F8b — pendências de comportamento e testes** (outra spec): API (menos idas ao banco, testes que faltam) e o resto das pendências do front da F6b e da F7.

## Decisões do usuário (2026-10-25)

- F8 dividida em F8a e F8b.
- Lighthouse no CI: **Acessibilidade 100, Boas práticas ≥ 90, SEO ≥ 90, Performance ≥ 80**.

## 1. E2E no CI

- Job novo `e2e` no `ci.yml`: `npm ci`, `npx playwright install --with-deps chromium`, `npm run test:e2e -w web`.
- Playwright (`web/playwright.config.ts`): no CI, reporter `github` + `html` (fora do CI continua `list`), `retries: 1` (hoje 2) e trace `on-first-retry`. Um teste que só passa na segunda tentativa aparece como "flaky" no relatório.
- Falha → o `playwright-report/` e os traces sobem como artefato (`actions/upload-artifact`, 7 dias).
- Guarda de hosts externos: o `mockApi` registra toda requisição a um host que não é `localhost` nem a API mockada (hoje só aborta) e o teste falha no fim (fixture do Playwright com verificação no `afterEach`). Tiles continuam abortados, mas o host dos tiles de teste (`tiles.test`) passa a ser atendido com uma PNG vazia, para não contar como externo.

## 2. axe

- `@axe-core/playwright`, tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`; zero violações (qualquer impacto).
- Páginas: `/`, `/paises/BRA`, `/paises/BRA` com o popup do marcador aberto, `/sobre`, a 404, `/paises/XYZ` e o menu do celular aberto (viewport de celular).
- Cada página espera os dados carregarem (os resumos dos gráficos visíveis) antes da análise.
- O que o axe apontar é corrigido na F8a. Esperado, pelo "Adiado":
  - landmarks: cabeçalho da sidebar e faixa de dados fora de landmark;
  - `aria-labelledby` repetido na tabela do ranking;
  - `dt`/`dd` do card Geral;
  - botão de fechar do popup (já com "Fechar" na F7).
- Também entra, por ser de acessibilidade: E2E do menu no celular (abrir, navegar, fechar).
- Ordem de Tab dos marcadores: **continua por tamanho** (o maior primeiro). No SVG do Leaflet a ordem no DOM é a mesma do desenho, e os maiores precisam vir antes para os pequenos ficarem por cima e clicáveis; separar as duas ordens exigiria um pane por marcador. A busca já dá acesso por nome pelo teclado. A pendência sai do "Adiado" e vira decisão registrada.
- Se o axe apontar algo que não dá para corrigir sem mudar o visual ou um componente gerado, a regra pode ser desligada só para aquele seletor, com o motivo num comentário e registro no "Adiado".

## 3. Lighthouse

- `@lhci/cli` no job `e2e`, depois dos testes.
- Mock da API em Node (`web/scripts/mock-api-server.ts`), servindo as mesmas fixtures do E2E (`web/tests/e2e/fixtures.ts`) e os tiles como PNG vazia, numa porta local. Mesma resposta do `mockApi` do Playwright, com CORS.
- O `web` é buildado com `VITE_API_URL` e `VITE_TILES_URL` apontando para esse mock e servido com `vite preview`.
- Páginas: `/` e `/paises/BRA`, 3 execuções cada, preset desktop.
- Asserções (mediana): `categories:accessibility` = 1, `categories:best-practices` ≥ 0,9, `categories:seo` ≥ 0,9, `categories:performance` ≥ 0,8.
- Relatórios sobem como artefato (sem upload público).
- Se SEO ou Boas práticas pedirem algo simples (meta description, `lang`, robots), corrige na F8a.

## 4. Teste de bundle

- Script `web/scripts/check-bundle.ts` (Node, sem dependência nova) roda depois do `npm run build` no job `quality`, como `npm run check:bundle -w web`.
- Falha se qualquer arquivo de `web/dist/` contiver `api-ninjas.com`, `API_NINJAS_KEY` ou `X-Api-Key`.
- Teste do script com Vitest (pasta temporária com um arquivo "limpo" e um "sujo").

## 5. Cadeia de suprimentos

- `.github/dependabot.yml`: `npm` na raiz (cobre os workspaces) e `github-actions`, semanal; grupos para atualizações `minor` e `patch`; majors em PR separado.
- Actions fixadas por SHA com a versão em comentário (`uses: actions/checkout@<sha> # v7.x.y`) no `ci.yml` e no `sync.yml`, inclusive as novas (`upload-artifact`).
- `SCARF_ANALYTICS: false` no `env` dos workflows (desliga a telemetria do `@scarf/scarf`, dependência do `swagger-ui-express`).

## 6. Documentação

- ADR 0008 "Portões de qualidade no CI": o que cada portão cobre, as notas mínimas, o mock da API para o Lighthouse e a política de desligar regra do axe só com motivo.
- CLAUDE.md: linha da F8a no "Estado atual", itens resolvidos saem do "Adiado", comando novo (`npm run check:bundle -w web`).

## Testes

- O próprio CI é o teste: os três jobs (`quality`, `integration`, `e2e`) verdes no PR.
- Unitário do `check-bundle`.
- E2E novos: axe por página e menu no celular.
- A guarda de hosts externos é conferida com um teste que tenta acessar um host externo e espera a falha (`test.fail()`).

## Riscos

- A nota de Performance varia entre máquinas do CI; a mediana de 3 execuções e o mínimo de 0,8 dão folga. Se oscilar demais, a divisão do bundle (Leaflet e Recharts sob demanda) entra na F8b.
- Um mock próprio para o Lighthouse duplica o roteamento do `mockApi`; os dois leem as mesmas fixtures, e a lógica de rota fica num módulo compartilhado (`web/tests/e2e/api-routes.ts`) usado pelos dois.

## Fora da F8a

- F8b: menos idas ao banco por requisição, testes da API que faltam (limite superior das séries, rollback do alias `pending`, refresh na recuperação de órfão), `WEB_ORIGIN` validado (F8/F9), e as pendências de comportamento do front (F6b e F7) que não são de acessibilidade.
