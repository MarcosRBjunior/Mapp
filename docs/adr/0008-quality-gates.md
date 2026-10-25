# ADR 0008 — Portões de qualidade no CI

Data: 2026-10-25 · Status: aceita

## Contexto

A F8 do roteiro pede "metas verdes no CI". Até a F7 o E2E só rodava localmente e nada media acessibilidade nem desempenho.

## Decisão

- **Job `quality`:** inclui o teste de bundle (`npm run check:bundle -w web`), que procura `api-ninjas.com`, `API_NINJAS_KEY` e `X-Api-Key` no build do `web`.
- **Job `e2e`:**
  - Playwright com 1 retry no CI, reporter `github` + `html`, trace no retry e o relatório como artefato sempre que o job não é cancelado (traces de testes que passam no retry);
  - axe com as regras WCAG 2.1 A/AA e a regra `region` (landmarks), sem violações em todas as páginas, com o popup aberto e com o menu do celular;
  - guarda de hosts externos, como fixture automática em `web/tests/e2e/test.ts`.
- **Lighthouse (`@lhci/cli`):**
  - roda no build de produção servido pelo `vite preview`, com a API e os tiles vindos de um mock Node que lê as fixtures do E2E (`web/tests/e2e/api-routes.ts`);
  - mediana de 3 execuções, preset desktop, nas rotas `/` e `/paises/BRA`;
  - notas mínimas: Acessibilidade 1, Boas práticas ≥ 0,9, SEO ≥ 0,9, Performance ≥ 0,8.
- **Dependências:** Dependabot semanal (npm e actions, minor e patch agrupados, major e minor do TypeScript ignorados, pelo `~6.0.3` do ADR 0001) e actions fixadas por SHA.
- **Telemetria:** a do `@scarf/scarf` fica desligada nos workflows.

## Consequências

- O CI demora mais: o job `e2e` instala o Chromium e faz 6 execuções do Lighthouse.
- Uma regra do axe só se desliga por seletor e com motivo registrado.
- A nota de Performance varia por máquina. Se oscilar, a divisão do bundle entra na F8b.
- O mock do Lighthouse e o do Playwright compartilham as rotas.
