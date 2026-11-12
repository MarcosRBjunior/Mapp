# Mapp

Dashboard histórico de COVID-19: mapa-múndi clicável, cards de estatística, gráficos e ranking, alimentados por uma API REST própria. Projeto 08 do Portfólio Boost Program.

Links públicos: em breve.

## Funcionalidades

- Mapa com um marcador por país (raio proporcional à raiz do total), acessível por teclado; clique ou busca abrem o país.
- Cards Geral, Por país (total, participação no global e posição no ranking) e Por tempo (novos no período).
- Gráficos de crescimento acumulado (país × mundo, escala linear ou log) e de novos por dia com média de 7 dias.
- Ranking Top 10, métrica (casos ou mortes) e período (7, 30, 90 dias ou tudo) na URL.
- Página Sobre com fonte, licenças e entidades não geográficas.

## Stack e arquitetura

- Monorepo com npm workspaces: `api/` e `web/`. Um app nunca importa código do outro.
- `api`: Node.js 24, Express 5, TypeScript, zod, Prisma 7 + PostgreSQL 18, pino. Camadas `routes → controllers → services → repositories`; OpenAPI gerado dos schemas zod (`/api/docs`).
- `web`: React 19, Vite, React Router, TanStack Query, shadcn/ui + Tailwind CSS v4, React Leaflet, Recharts.
- A api só lê do banco. Só o job de sincronização (`api/src/jobs/sync`, por CLI ou GitHub Actions) baixa os dados da fonte.
- Produção: banco no Neon, api como função na Vercel, front estático na Vercel, tudo em São Paulo.
- Decisões em [`docs/adr/`](docs/adr/).

## Rodar local

Pré-requisitos: nvm, Docker.

```bash
nvm use                                  # Node da .nvmrc
docker compose up -d                     # PostgreSQL 18 na porta 5435
npm install
cp api/.env.example api/.env             # valores do banco local
cp web/.env.example web/.env
npm run db:migrate -w api                # migrações + usuário leitor
npm run db:seed -w api                   # países, fontes e aliases
npm run sync -w api -- --mode=full       # série histórica da JHU (2 downloads)
npm run dev                              # api em :3333, web em :5173
```

## Testes

```bash
npm run lint && npm run typecheck && npm test
npm run test:integration -w api          # Postgres no Docker, banco mapp_test
npm run test:e2e -w web                  # Playwright contra o build, API mockada
npm run build -w web && npm run check:bundle -w web
npm run lighthouse -w web                # notas mínimas do ADR 0008
```

Testes e CI usam só fixtures: nenhuma chamada real à fonte.

## Deploy

1. **Neon**: projeto em `aws-sa-east-1` (Postgres 18), usuário dono `mapp` e banco `mapp`.
2. **GitHub**: environment `production` com os secrets:
   - `DATABASE_URL`: usuário `mapp_api` (leitor) pelo host com pooler (`-pooler`). A senha é escolhida por você; o `db:roles` cria o usuário.
   - `DATABASE_URL_SYNC`: usuário `mapp` pelo host direto (o lock do sync precisa de sessão).
3. **Workflow `Database`** (`db.yml`, manual): confere a collation `pt-BR-x-icu` e a versão, aplica as migrações, cria o leitor e roda o seed.
4. **Workflow `Sync`** (`sync.yml`, manual) com `mode=full`: carrega a série da JHU.
5. **Vercel, projeto da api** (Root Directory `api`): `DATABASE_URL`, `DATA_PROVIDER=jhu_csv`, `WEB_ORIGIN=https://<front>.vercel.app`, `TRUST_PROXY=1`, `NODE_ENV=production`, `LOG_LEVEL=info`, `SCARF_ANALYTICS=false`.
6. **Vercel, projeto do front** (Root Directory `web`): `VITE_API_URL=https://<api>.vercel.app`, `VITE_TILES_URL`, `VITE_TILES_ATTRIBUTION` (valores do `web/.env.example`), `SCARF_ANALYTICS=false`.

Com a integração Git da Vercel, o `main` vai para produção e cada PR gera preview. Cada projeto só faz build quando a pasta dele ou o `package-lock.json` mudam.

## Dados e atribuição

- Casos e mortes: [COVID-19 Data Repository by the Center for Systems Science and Engineering (CSSE) at Johns Hopkins University](https://github.com/CSSEGISandData/COVID-19), licença CC BY 4.0. Série de 22/01/2020 a 09/03/2023 (a coleta foi encerrada).
- Contornos dos países: Natural Earth (domínio público).
- Tiles: © OpenStreetMap contributors © CARTO.

## Limitações

- O rate limit (120 requisições por minuto por IP) conta por instância da função, então é aproximado.
- Os previews de PR do front não falam com a api de produção (o CORS aceita só a origem de produção).
- Com `DATA_PROVIDER=api_ninjas`, um run que começa com o orçamento de chamadas esgotado sai com código 1 sem gravar nada; o próximo continua de onde parou.
- O `postinstall` da api roda `prisma generate`, que é devDependency: a Vercel e o `npm ci` instalam as devDependencies, mas `npm ci --omit=dev` quebra a instalação.
