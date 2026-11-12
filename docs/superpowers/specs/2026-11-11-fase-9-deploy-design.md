# Fase 9 — Deploy: design

Data: 2026-11-11. Última fase do roteiro. Critério de saída: **URL pública funcionando** — o front público mostra mapa, cards e gráficos com dados da API pública, `/ready` responde 200 e o último `sync.yml` terminou `success`.

## Decisões do usuário (2026-11-11)

- **D-12 hospedagem**: banco no **Neon**; API como **função na Vercel** (Express exportado); front na **Vercel**. Vira o ADR 0010.
- **Rate limit**: continua em memória (120/min por IP), documentado como aproximado — na Vercel cada instância tem a própria contagem.
- **Operação**: o Claude executa os passos nas contas pelas CLIs (`neonctl`, `vercel`, `gh`), depois do login do usuário. Connection strings e senhas passam de um comando para outro, nunca impressas.
- **Região**: São Paulo — Vercel `gru1` e Neon `aws-sa-east-1`.
- **Domínio**: subdomínios gratuitos `*.vercel.app` (um para o front, um para a API). Previews de PR do front não falam com a API (CORS aceita só a origem de produção).
- **Migração e seed em produção**: workflow manual `db.yml` no GitHub, environment `production`.
- **Escopo**: entram só as pendências do "Adiado" ligadas ao deploy (grupo 1). As pendências de acabamento da F8b viram a **F9b**, depois do site no ar.
- **API na Vercel**: função explícita em `api/api/index.ts` + `api/vercel.json` (`framework: null`), não a detecção automática do Express (o `src/app.ts` e o `src/server.ts` também são candidatos e a precedência não é documentada).
- **RN-10 no rodapé**: enquanto o `/meta` carrega ou se ele falhar, o rodapé mostra uma linha fixa com a fonte JHU CSSE; quando o `/meta` chega, vale o texto dele.

Fatos conferidos em 2026-11-11: o Neon oferece `aws-sa-east-1` no plano gratuito (1 GB por projeto; os dados locais ocupam 55 MB) e cria projetos novos em Postgres 18; a Vercel reconhece Express sem configuração em `app|index|server` (raiz ou `src/`) com `export default`.

## 1. Banco (Neon) e `db.yml`

- **Criação** (Claude, `neonctl`): projeto `mapp` em `aws-sa-east-1`, Postgres 18; role dono `mapp` (criada pelo Neon, membro de `neon_superuser`, pode criar roles); banco `mapp` de propriedade de `mapp`.
- **Leitor `mapp_api`**: criado pelo nosso `db:roles`, **não** pelo Neon — roles criadas pelo painel/CLI/API do Neon entram em `neon_superuser` e o `assertUnprivilegedReader` as recusa (de propósito). A senha é gerada aleatoriamente na sessão e vai direto para o secret.
- **Conexões**:
  - `DATABASE_URL` (API na Vercel): `mapp_api` pelo host com pooler (`-pooler`).
  - `DATABASE_URL_SYNC` (sync e `db.yml`): `mapp` pelo host direto (o lock advisory de sessão não funciona atrás de pooler em modo transação).
- **`db:check`** (script novo, `api/prisma/check.ts`, conexão `DATABASE_URL_SYNC`):
  - erro com mensagem clara se não existir a collation `pt-BR-x-icu`;
  - aviso (sem falhar) se `server_version_num < 180000`: o ranking e o `/countries` contam com o skip scan do Postgres 18 (item 17 da auditoria).
- **`db:roles`**: em vez da senha em texto no `CREATE/ALTER ROLE … PASSWORD`, manda o verificador **SCRAM-SHA-256** calculado no cliente (`SCRAM-SHA-256$<iter>:<salt>$<StoredKey>:<ServerKey>`, salt aleatório, 4096 iterações, como o Postgres gera). A senha nunca chega ao servidor nem a log. O resto (GRANTs, default privileges, checagens) não muda.
- **`db:seed` em lote**: países, fontes e aliases gravados com `INSERT … ON CONFLICT … DO UPDATE` de várias linhas por comando, na mesma transação. Comportamento igual ao de hoje (idempotente; restaura os aliases curados; mantém os que não estão no arquivo).
- **`.github/workflows/db.yml`** (manual, environment `production`, actions fixadas por SHA, `persist-credentials: false`, `SCARF_ANALYTICS: 'false'`, secrets só no passo que os usa): `npm ci` → `db:check` → `db:migrate` (migrações + `db:roles`) → `db:seed`. Secrets: `DATABASE_URL`, `DATABASE_URL_SYNC`.
- **Testes**:
  - unitário do verificador SCRAM contra um vetor conhecido (senha, salt e iterações fixos → verificador esperado) e do formato;
  - unitário da decisão do `db:check` (collation ausente → erro; versão 17 → aviso; 18 → ok);
  - integração (Docker): o leitor criado pelo `db:roles` conecta com a senha original; o seed em lote é idempotente e mantém os aliases fora do arquivo (os testes atuais de seed continuam valendo).

## 2. API na Vercel

- **`api/src/bootstrap.ts`**: recebe o `Env` validado e devolve `{ app, prisma, logger }` (logger, Prisma, repositórios, serviços, `createApp`). O `server.ts` passa a usá-lo e fica só com `listen` e o desligamento gracioso (uso local e `npm start`).
- **`api/api/index.ts`**: função da Vercel. Valida o env e monta o app uma vez por instância (escopo do módulo) e faz `export default app`. Env inválido → a instância falha ao iniciar com o erro do zod no log (sem valores).
- **`api/vercel.json`**: `framework: null`; `rewrites` de `/(.*)` para `/api`; `regions: ["gru1"]`; `functions["api/index.ts"].includeFiles` com os estáticos do `swagger-ui-dist` (o `/api/docs` os lê do disco); `ignoreCommand` que pula o build quando nada mudou em `api/` nem no `package-lock.json`.
- **`TRUST_PROXY`** (nova variável da api, inteiro ≥ 0, padrão `0`): `app.set('trust proxy', n)`. Na Vercel, `1`, para o `req.ip` (chave do rate limit) vir do `X-Forwarded-For`.
- **`WEB_ORIGIN`**: além do regex atual, `new URL(v).origin === v`.
- **Pool do `pg`**: `idleTimeoutMillis` curto (5 s) no `PrismaPg`, para instância parada não segurar conexões no Neon. Sem dependência nova.
- **Não muda**: rate limit em memória, compressão (a Vercel não recomprime o que já vem com `Content-Encoding`), `Cache-Control`/ETag (sem `s-maxage`, a CDN da Vercel não guarda; só o navegador).
- **Variáveis do projeto da API na Vercel**: `DATABASE_URL`, `DATA_PROVIDER=jhu_csv`, `WEB_ORIGIN=https://<front>.vercel.app`, `TRUST_PROXY=1`, `NODE_ENV=production`, `LOG_LEVEL=info`, `SCARF_ANALYTICS=false`.
- **Testes**:
  - a função exportada responde `GET /health` 200 com env de teste (sem banco);
  - com `TRUST_PROXY=1` o rate limit separa dois IPs do `X-Forwarded-For`; com `0` ignora o cabeçalho;
  - `WEB_ORIGIN` com caminho, barra final, porta inválida ou espaço → env inválido;
  - antes do deploy, `vercel build` local confirma o pacote e a presença dos estáticos do Swagger.

## 3. Front na Vercel

- **`web/vercel.json`**: preset Vite; `rewrites` de toda rota que não for arquivo para `/index.html` (links diretos `/paises/BRA`, `/sobre`); `ignoreCommand` que pula o build quando nada mudou em `web/` nem no `package-lock.json`.
- **Variáveis**: `VITE_API_URL=https://<api>.vercel.app`, `VITE_TILES_URL` e `VITE_TILES_ATTRIBUTION` (CARTO, como no `.env.example`), `SCARF_ANALYTICS=false`.
- **Env faltando**: o `main.tsx` captura o erro do `getEnv()` e escreve no `#root`, sem React, "Configuração incompleta: faltam <nomes>." (só os nomes das variáveis).
- **Rodapé (RN-10)**: enquanto o `/meta` carrega ou se ele falhar, mostra "Fonte: COVID-19 Data Repository by CSSE at Johns Hopkins University (CC BY 4.0)"; com o `/meta`, o texto vindo dele, como hoje. A linha fixa não tem URL (o teste de bundle continua sem host nem chave da fonte).
- **Testes**:
  - unitário do aviso de env faltando (nomes certos, nada renderizado pelo React);
  - `SiteFooter`: linha fixa no carregamento e no erro; texto do `/meta` quando chega.

## 4. Operação (depois do merge do PR de código)

1. Neon: projeto, roles e banco (seção 1). GitHub: environment `production` com `DATABASE_URL` e `DATABASE_URL_SYNC`.
2. `db.yml`: checagem, migração, leitor e seed.
3. **Primeira carga**: `sync.yml` com `mode=full` (2 downloads da JHU) — **só com "pode" explícito do usuário na hora** (regra do CLAUDE.md).
4. Vercel, projeto da API (raiz `api`): variáveis, deploy, `/ready` 200.
5. Vercel, projeto do front (raiz `web`): variáveis, deploy.
6. Verificação na URL pública: `curl` em `/health`, `/ready`, `/api/v1/meta`; `Access-Control-Allow-Origin` igual ao front; 304 com `If-None-Match`; `Content-Encoding` em resposta grande; `/api/docs` abre; links diretos `/paises/BRA` e `/sobre`; mapa com dados no navegador.

Os dois projetos ficam ligados ao repositório pela integração Git da Vercel: `main` → produção, PR → preview.

## 5. Documentação

- **`README.md`** (pt-BR): o que é, links públicos, stack e arquitetura, rodar local, testes, deploy passo a passo (Neon, `db.yml`, `sync.yml`, Vercel), dados e atribuição, limitações (rate limit aproximado; previews sem API; dados até 09/03/2023; run que começa com o orçamento esgotado sai com código 1; `postinstall` precisa das devDependencies, instaladas pela Vercel e pelo `npm ci`).
- **ADR 0010** — hospedagem: Neon + Vercel, API em função, região, rate limit aproximado, conexões pooled × direta. **ADR 0003**: nota sobre o dono vindo do Neon e o leitor com verificador SCRAM.
- **CLAUDE.md**: F9 concluída; D-12 decidida; Arquitetura: a API roda como função na Vercel (o job continua fora de função); variável `TRUST_PROXY`; comando `db:check`; "Adiado" sem os itens resolvidos e com o grupo da F8b como F9b.
- **`api/.env.example`**: `TRUST_PROXY=0` e comentário sobre pooled × direta.
- PR final pequeno com as URLs reais no README e no CLAUDE.md.

## Fora do escopo

- Pendências de acabamento da F8b (F9b).
- Cache na CDN (`s-maxage`), domínio próprio, rate limit compartilhado (Redis ou firewall), monitoramento externo.
