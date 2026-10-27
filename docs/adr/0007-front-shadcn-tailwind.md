# ADR 0007 — Front: shadcn/ui e Tailwind v4

Data: 2026-10-23 · Status: aceita

## Contexto

O usuário decide o visual do dashboard e escolheu o bloco `dashboard-01` do shadcn/ui, no tema claro padrão. A F6 acrescenta o card Por tempo e o ranking, e o CSS escrito à mão da F4 não escalava.

## Decisão

- **Base:**
  - shadcn/ui pelo CLI fixado (`npx shadcn@4.22.1`), estilo `radix-nova`, base Radix (pacote `radix-ui`), ícones `lucide-react`;
  - Tailwind CSS v4 com `@tailwindcss/vite`;
  - fonte Geist servida do próprio bundle (`@fontsource-variable/geist`), sem host externo.
  - o pacote `shadcn` fica em devDependencies porque só o `@import "shadcn/tailwind.css"` do build o usa.
- **Código gerado:** `web/src/components/ui`, `web/src/hooks/use-mobile.ts` e `web/src/lib/utils.ts` vêm do CLI e são versionados.
  - Ajustes locais:
    - textos em pt-BR;
    - `SidebarInset` como `<div>`, para o `<main>` da página ser o único landmark principal;
    - sem o atalho Ctrl/Cmd+B do `SidebarProvider`, que capturava a tecla até dentro da busca.
  - O ESLint desliga só ali `react-refresh/only-export-components` e `react-hooks/set-state-in-effect`.
  - O `cn` vem do pacote `cn`, do próprio shadcn.
- **Do bloco `dashboard-01`:**
  - fica o casco: `SidebarProvider`, a sidebar com Mapa e Sobre e o cabeçalho com busca, métrica e período (só nas rotas do mapa);
  - o grid de cards segue o `section-cards` do bloco;
  - saem a tabela com arrastar-e-soltar (`@dnd-kit`, `@tanstack/react-table`), o gráfico de área, os menus de documentos e de usuário e os dados de exemplo;
  - o ranking usa só o `Table` do shadcn. Os gráficos da F7 voltam com o `chart` do shadcn e o Recharts.
- **Alias:** `@/` aponta para `web/src` e serve só para a camada do shadcn; o resto do código continua com import relativo.
- **Leaflet:**
  - o preflight do Tailwind limita a largura de `img`, e uma regra em `.leaflet-container img` desfaz isso para os tiles;
  - o mapa fica num `Card` com `isolate`, para os z-index do Leaflet não passarem por cima do menu lateral nem da faixa de dados.
- **Controles:** métrica e período são `ToggleGroup` de seleção única com `role="radiogroup"` e itens `role="radio"`/`aria-checked`. Um segundo clique no item ativo é ignorado.
- **Gráficos:** componente `chart` do shadcn sobre o Recharts, com as cores `--chart-*` do tema; o SVG fica com `aria-hidden` e cada gráfico tem um resumo textual. O tooltip é próprio, para mostrar os valores em pt-BR e o `new` real da fonte. No `jsdom` o `ResizeObserver` é simulado e os gráficos ficam com tamanho 0: os testes de componente conferem o resumo; o desenho é conferido no E2E.
- **Testes:** o `jsdom` não tem `matchMedia`, e o setup dos testes o simula.

## Consequências

- Componente novo do shadcn: `npx shadcn@4.22.1 add <nome>` dentro de `web/`, depois `npx prettier --write`.
- Atualizar o CLI muda o código gerado. Faça isso numa tarefa própria e revise o diff.
- `web/src/components/ui/sidebar.tsx` tem edições locais (textos em pt-BR, sem o atalho Ctrl+B, `SidebarInset` como `div` e sem o cookie `sidebar_state`). Se o CLI regerar o arquivo, aplique-as de novo.
