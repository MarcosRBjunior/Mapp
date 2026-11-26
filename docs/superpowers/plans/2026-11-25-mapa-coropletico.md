# Mapa coroplético — plano

**Spec:** `docs/superpowers/specs/2026-11-25-mapa-coropletico-design.md`

**Restrições:** sem dependência nova; textos em pt-BR, código em inglês; `npm run lint`, `npm run typecheck`, `npm test` e E2E verdes; um commit por tarefa.

1. **Vista na URL:** `use-map-view.ts` + teste; `dashboard-search` mantém `view`. Commit `feat: keep the map view in the URL`.
2. **Escala:** `choropleth-scale.ts` + teste; rampas, `noData` e `dot` em `map-colors.ts`. Commit `feat: add the log scale and colors of the choropleth`.
3. **Mapa:** polígonos pintados, pontos fixos, legenda de faixas, toggle no mapa, ligação no `world-map`/`dashboard-page`; testes de componente. Commit `feat: switch the map between markers and a choropleth`.
4. **E2E e axe:** `choropleth.spec.ts`; axe com `?view=choropleth`. Commit `test: cover the choropleth end to end and with axe`.
5. **Docs:** ADR 0006 (mapa) e CLAUDE.md. Commit `docs: record the choropleth view`.

Depois: `/code-review` e `/security-review`, PR e merge só com OK.
