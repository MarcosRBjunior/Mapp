# ADR 0001 — Monorepo com npm workspaces e ferramental na raiz

- Status: aceito
- Data: 2026-10-19

## Contexto

O Mapp tem um front (`web`) e um back (`api`) em TypeScript, mantidos por uma pessoa. O `CLAUDE.md` fixa npm workspaces e proíbe um app importar código do outro. Precisamos decidir como compartilhar lint, formatação e opções do compilador.

## Decisão

- Monorepo com npm workspaces `api` e `web`.
- ESM em todo o repositório. A `api` usa `module: NodeNext` (imports relativos com `.js`); o `web` usa `moduleResolution: Bundler` (Vite).
- Ferramental compartilhado na raiz: um `eslint.config.js` (typescript-eslint type-checked), um Prettier e um `tsconfig.base.json` estendido por cada workspace. Só configuração é compartilhada, nunca código de aplicação.
- TypeScript fixado em `~6.0.3` enquanto o typescript-eslint não suportar o TypeScript 7.
- Sem Turborepo/Nx.

## Consequências

- Uma regra de lint muda num lugar só e vale para os dois apps.
- Os scripts da raiz (`lint`, `typecheck`, `test`, `build`) repassam para os workspaces.
- Atualizar para o TypeScript 7 exige um novo ADR quando o typescript-eslint aceitar a versão.
- Se surgir um terceiro app ou build lento, reavaliar uma ferramenta de orquestração.
