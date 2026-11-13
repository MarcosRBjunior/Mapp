# Tema escuro — plano

**Spec:** `docs/superpowers/specs/2026-11-13-tema-escuro-design.md`

**Restrições:** sem dependência nova; sem host externo novo; textos em pt-BR, código em inglês; `npm run lint`, `npm run typecheck`, `npm test` e E2E verdes; um commit por tarefa.

## Tarefa 1 — tema: funções, hook e script inline

- Criar `web/src/shared/theme/theme.ts` e `use-theme.ts` (spec §1) com testes em `theme.test.ts` e `use-theme.test.tsx`: valor salvo, sistema, valor inválido, alternar, mudança do sistema só sem escolha salva, `localStorage` que lança.
- Script inline em `web/index.html` com a mesma regra (chave `mapp-theme`).
- Commit: `feat: apply the dark theme from the saved choice or the system`.

## Tarefa 2 — botão no cabeçalho

- `web/src/app/theme-toggle.tsx` + teste; montar no `SiteHeader` com `ml-auto`.
- Commit: `feat: add the theme toggle to the header`.

## Tarefa 3 — cores dos gráficos e do mapa

- `styles.css`: `--chart-2`/`--chart-5` do escuro; variáveis `--map-*` no `:root` e `.dark`; popup/tooltip/controles do Leaflet pelos tokens; filtro da camada de tiles no escuro.
- `country-polygons.tsx`, `country-markers.tsx`, `map-legend.tsx`, `marker-scale.ts`: trocar hex por `var(--map-…)`; ajustar testes que conferem cores.
- Commit: `feat: theme the charts, the map and the tiles for dark mode`.

## Tarefa 4 — E2E e axe no escuro

- `web/tests/e2e/theme.spec.ts`: botão liga o escuro e persiste após recarregar; `colorScheme: 'dark'` sem escolha salva abre escuro.
- `a11y.spec.ts`: repetir as páginas no escuro. Corrigir o contraste que o axe apontar.
- Commit: `test: check the dark theme end to end and with axe`.

## Tarefa 5 — documentação

- ADR 0007 e CLAUDE.md (spec §6).
- Commit: `docs: record the dark theme`.

Depois: revisão final, `/code-review` e `/security-review`, PR e merge só com OK.
