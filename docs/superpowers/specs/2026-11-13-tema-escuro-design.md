# Tema escuro — design

Data: 2026-11-13 · Muda a ADR 0007 (antes: só tema claro).

## Decisões do usuário

- Escolha: segue o sistema por padrão; um botão no cabeçalho alterna claro/escuro e a escolha fica salva no navegador.
- Tiles no escuro: os mesmos tiles do OpenStreetMap, escurecidos por filtro CSS só na camada de tiles. Sem host novo nem chave.

## 1. Aplicação do tema

- Script inline no `web/index.html`, antes do bundle, põe a classe `dark` em `<html>` quando `localStorage['mapp-theme'] === 'dark'`, ou quando não há valor salvo e `prefers-color-scheme: dark`. Evita o flash do tema errado. O site não manda CSP, então o script inline roda.
- `web/src/shared/theme/theme.ts`: funções puras `readStoredTheme()`, `storeTheme(theme)`, `systemTheme()`, `resolveTheme(stored, system)` e `applyTheme(theme)` (classe `dark` e `color-scheme` em `<html>`). Toda leitura e escrita no `localStorage` com `try/catch`: sem armazenamento, segue o sistema.
- `web/src/shared/theme/theme-provider.tsx` + `use-theme.ts`: contexto com `{ theme, toggle }`, lido por `useTheme()`. Sem escolha salva, acompanha a mudança do sistema (`matchMedia(...).addEventListener('change')`); depois de alternar, a escolha salva vence.
- Valores salvos: só `light` ou `dark`; qualquer outro valor é ignorado.

## 2. Botão

- `web/src/app/theme-toggle.tsx`: `Button` do shadcn (`variant="ghost"`, `size="icon"`), ícone `Moon` no claro e `Sun` no escuro (`lucide-react`), `aria-label` "Ativar tema escuro" / "Ativar tema claro".
- No canto direito do `SiteHeader` (`ml-auto`), em todas as rotas.

## 3. Cores

- Tokens `.dark` do shadcn ficam como vieram; `--chart-2` e `--chart-5` do escuro ganham valores claros o bastante para contraste AA (linhas e legenda dos gráficos sobre `--card`).
- Cores fixas do mapa viram variáveis CSS em `styles.css`, com valor no `:root` e no `.dark`:
  - `--map-country-fill`, `--map-country-stroke`, `--map-country-selected` (polígonos);
  - `--map-marker-outline`, `--map-marker-outline-selected` (contorno dos marcadores e da legenda).
  - Cores dos marcadores: `--map-cases` e `--map-deaths` (vermelho e roxo), com tom mais claro no escuro se o contraste pedir.
- O Leaflet recebe cor como string de estilo SVG: os componentes passam `var(--map-…)`, que o SVG resolve no navegador.
- Popup e tooltip do Leaflet: fundo e texto por `--popover` e `--popover-foreground`; controles de zoom e atribuição pelos tokens de card.

## 4. Tiles

- No escuro: `.dark .leaflet-tile-pane { filter: invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.9); }`. Marcadores, polígonos e popups ficam em outros panes e não são afetados.
- O crédito do OpenStreetMap continua visível (RN-10).

## 5. Testes

- Unitários de `theme.ts`/`use-theme.ts`: valor salvo, sistema claro e escuro, valor inválido ignorado, alternar salva e aplica, mudança do sistema seguida só sem escolha salva, `localStorage` que lança erro.
- Componente: o botão alterna o rótulo e a classe `dark`.
- E2E: liga o escuro, confere a classe `dark` e que ela continua depois de recarregar; abre com `colorScheme: 'dark'` sem escolha salva e confere o escuro.
- axe (WCAG 2.1 A/AA + `region`): as páginas do `a11y.spec.ts` também no tema escuro, popup aberto incluído.
- Lighthouse continua no tema claro (nota mínima da ADR 0008).

## 6. Documentação

- ADR 0007: seção do tema (claro e escuro, script inline, filtro dos tiles, variáveis do mapa).
- CLAUDE.md: decisão "tema claro" vira "tema claro e escuro (sistema + botão, ADR 0007)"; estado atual com a entrega.

## Fora do escopo

Terceira opção "Sistema" no botão (limpar os dados do site volta a seguir o sistema), tema por rota, provedor de tiles escuros.
