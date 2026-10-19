# Fase 0 — Fundação: design

- Data: 2026-10-19
- Fase: F0 do roteiro do `CLAUDE.md`
- Status: aprovado em conversa; aguardando revisão do arquivo

## Objetivo

Criar o esqueleto do monorepo (`api` + `web`), o ferramental de qualidade, o PostgreSQL local e o CI, sem nenhuma regra de negócio.

Critério de saída:

1. `npm run dev` sobe a api (porta 3333) e o web (porta 5173) juntos.
2. `GET http://localhost:3333/health` responde 200.
3. `npm run lint`, `npm run typecheck` e `npm test` passam localmente.
4. O CI passa no PR da branch `chore/foundation`.

## Decisões desta fase

| Tema | Decisão |
| --- | --- |
| Ferramental | Compartilhado na raiz (ESLint, Prettier, `tsconfig.base.json`); cada workspace estende a base. Sem Turborepo/Nx. |
| Node | `.nvmrc` = `24` (LTS ativo); `engines.node >=24`. |
| TypeScript | `~6.0.3` em todo o repo: o `typescript-eslint` 8.72 exige `typescript <6.1.0` (o TS 7 nativo ainda não é suportado). |
| Módulos | ESM em todo o repositório (`"type": "module"`). |
| Scripts | Só os que já funcionam: `dev`, `lint`, `typecheck`, `test`, `build`, `format` e `test:e2e -w web`. `db:migrate`/`db:seed` entram na F1 e `sync` na F2, com os nomes do `CLAUDE.md`. |
| Git | Commit inicial na `main` (este spec, `CLAUDE.md`, `.gitignore`); trabalho na branch `chore/foundation`, um commit por tarefa; PR para a `main`; merge só com autorização. |

Fora do escopo da F0 (YAGNI): README (F9), helmet/CORS/pino-http/formato de erro (F3), Prisma e usuários de banco (F1), React Router/TanStack Query/Leaflet/MSW (F4), E2E no CI (F8).

## Raiz

- `package.json`: `private: true`, `workspaces: ["api", "web"]`, `engines.node: ">=24"`.
- Scripts:
  - `dev`: `concurrently` com `npm run dev -w api` e `npm run dev -w web`;
  - `lint`: `eslint . && prettier --check .`;
  - `format`: `prettier --write .`;
  - `typecheck`, `test`, `build`: `npm run <script> --workspaces`.
- `eslint.config.js` (flat config):
  - base: `typescript-eslint` com regras type-checked (`projectService`), `@typescript-eslint/no-explicit-any` como erro, `eslint-config-prettier` por último;
  - bloco `web/**`: `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, globals de browser;
  - bloco `api/**` e arquivos de config: globals de Node;
  - ignora `**/dist`, `**/coverage`, `web/playwright-report`, `web/test-results`.
- `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `isolatedModules`, `verbatimModuleSyntax`, `skipLibCheck`, `target ES2023`.
- `.editorconfig` (UTF-8, LF, 2 espaços), `.prettierrc.json` (`singleQuote`, `printWidth` 100).
- `.prettierignore`: `CLAUDE.md` (mantido à mão pelo dono do projeto), `docs/superpowers` (artefatos de processo), `package-lock.json`, `**/dist`, `**/coverage` e artefatos do Playwright.
- `.gitignore`: `node_modules`, `dist`, `coverage`, `.env`, `.env.*` com exceção `!.env.example`, artefatos do Playwright, logs.

## api

Express 5 + TypeScript, executado com `tsx` em desenvolvimento e compilado com `tsc`.

```text
api/
  src/config/env.ts           # schema zod + loadEnv()
  src/lib/logger.ts           # pino em JSON
  src/routes/health.routes.ts # GET /health
  src/app.ts                  # createApp(): monta o Express sem abrir porta
  src/server.ts               # loadEnv() → createApp() → listen(PORT)
  tests/unit/config/env.test.ts
  tests/api/health.test.ts
  .env.example
  tsconfig.json  tsconfig.build.json  vitest.config.ts  package.json
```

- `env.ts`: `NODE_ENV` (`development` | `test` | `production`, padrão `development`), `PORT` (inteiro 1–65535, padrão `3333`), `LOG_LEVEL` (níveis do pino, padrão `info`). `loadEnv(source = process.env)` devolve o objeto tipado ou lança `Error` listando cada variável inválida. As variáveis de banco, provider e `WEB_ORIGIN` são adicionadas nas fases que as usam.
- `GET /health` responde `200` com `{ "status": "ok" }`. Fica fora do prefixo `/api/v1`.
- `server.ts` registra no log a porta em que subiu. Se o env for inválido, registra o erro e encerra com código 1.
- Scripts: `dev` (`tsx watch` carregando `.env` se existir), `build` (`tsc -p tsconfig.build.json`), `start` (`node dist/server.js`), `typecheck` (`tsc --noEmit`), `test` (`vitest run`).

## web

React 19 + Vite + TypeScript, scaffold enxuto.

```text
web/
  index.html
  src/main.tsx
  src/app/app.tsx             # componente App: título "Mapp" + subtítulo
  src/app/app.test.tsx
  src/test/setup.ts           # jest-dom
  tests/e2e/smoke.spec.ts
  vite.config.ts  playwright.config.ts  tsconfig*.json  package.json
```

- `App` mostra o título "Mapp" e o subtítulo "Dashboard histórico de COVID-19". Nada de mapa nem de chamada à api nesta fase.
- Vite na porta 5173 com `strictPort`. A configuração do Vitest fica em `vite.config.ts`, com ambiente `jsdom`, e exclui `tests/e2e`.
- Playwright usa só Chromium. O `webServer` sobe o Vite, e o teste smoke verifica o título.
- Scripts: `dev`, `build`, `preview`, `typecheck`, `test`, `test:e2e`.

## PostgreSQL local

`docker-compose.yml` com um serviço `db`:

- imagem `postgres:18-alpine`, porta do host `${POSTGRES_PORT:-5435}` → 5432 do container (a 5432 do host já é usada por outro projeto nesta máquina);
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` com padrão `mapp`, sobrescrevíveis pelo `.env` da raiz (documentado em `.env.example`; valores só locais);
- volume nomeado montado em `/var/lib/postgresql` (caminho novo do Postgres 18);
- healthcheck com `pg_isready`.

Os dois usuários de banco (leitura e sync) ficam para a F1.

## CI

`.github/workflows/ci.yml`:

- gatilhos: `pull_request` e `push` na `main`;
- `permissions: contents: read`; `concurrency` por ref com `cancel-in-progress`;
- um job `quality` em `ubuntu-latest`: `actions/checkout`, `actions/setup-node` com `node-version-file: .nvmrc` e cache de npm, `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

## Testes

| Onde | Caso |
| --- | --- |
| api unit | `loadEnv({})` aplica os padrões (`PORT` 3333, `LOG_LEVEL` info, `NODE_ENV` development) |
| api unit | `PORT` não numérica ou fora de 1–65535 lança erro citando `PORT` |
| api unit | `LOG_LEVEL` desconhecido lança erro citando `LOG_LEVEL` |
| api Supertest | `GET /health` → 200 e `{ "status": "ok" }` |
| api Supertest | rota inexistente → 404 |
| web Vitest | `App` renderiza o heading "Mapp" |
| web E2E | a página `/` abre e mostra o heading "Mapp" |

## Documentação

- `docs/adr/0001-monorepo-npm-workspaces.md`: contexto, decisão (npm workspaces, ESM, ferramental compartilhado na raiz, sem Turborepo/Nx) e consequências. Serve de modelo para os próximos ADRs.
- `CLAUDE.md`: no fim da fase, atualizar "Estado atual" com F0 concluída e o que ficou pendente.
