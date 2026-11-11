# ADR 0010 — Hospedagem: Neon + Vercel, API em função (D-12)

Data: 2026-11-11 · Status: aceita

## Contexto

A F9 publica o Mapp. O front já tinha destino (Vercel); faltava decidir onde ficam a api e o banco (D-12). Requisitos que vêm das fases anteriores:

- Postgres com a collation ICU `pt-BR-x-icu` (ordem do ranking e das listas).
- Permissão de criar usuários: a api lê com um usuário próprio, sem privilégios (ADR 0003).
- Conexão de sessão para o sync: o lock advisory não funciona atrás de pooler em modo transação.
- O job de sync roda por CLI ou GitHub Actions, nunca dentro de função serverless.
- Custo zero para um projeto de portfólio. Os dados ocupam 55 MB.

Conferido em 2026-11-11: o Neon oferece `aws-sa-east-1` (São Paulo) no plano gratuito (1 GB por projeto) e cria projetos novos em Postgres 18; a Vercel roda Express sem configuração quando encontra `app|index|server` (raiz ou `src/`) com `export default`.

## Decisão

- **Banco**: Neon, projeto em `aws-sa-east-1`, Postgres 18. O dono `mapp` é criado pelo Neon; o leitor `mapp_api` é criado pelo nosso `db:roles`, porque usuários criados pelo painel, CLI ou API do Neon entram em `neon_superuser` e não servem como leitor.
- **Conexões**: a api usa `DATABASE_URL` pelo host com pooler (`-pooler`), porque funções abrem muitas conexões curtas; o sync e o `db.yml` usam `DATABASE_URL_SYNC` pelo host direto.
- **API**: função da Vercel em `api/api/index.ts`, que monta o app pelo `src/bootstrap.ts` (o mesmo do `server.ts` local) e o exporta. O `api/vercel.json` usa `framework: null` e reescreve todas as rotas para a função. A detecção automática do Express ficou de fora porque `src/app.ts` e `src/server.ts` também são candidatos e a documentação não define a precedência.
- **Região**: funções em `gru1` (São Paulo), junto do banco: cada requisição faz consultas, então a distância função–banco pesa mais que a distância visitante–função.
- **Front**: projeto estático na Vercel, com rewrite de toda rota sem arquivo para `/index.html` (links diretos do React Router).
- **Domínios**: subdomínios `*.vercel.app`. O CORS aceita uma origem (`WEB_ORIGIN`), então os previews de PR do front não falam com a api de produção.
- **Rate limit**: continua em memória (120/min por IP). Na Vercel cada instância conta separado, então o limite é aproximado. `TRUST_PROXY=1` faz o `req.ip` vir do `X-Forwarded-For`.
- **Migração e seed em produção**: workflow manual `db.yml` (`db:check`, `db:migrate`, `db:seed`), com os secrets do environment `production`. O sync continua no `sync.yml`.

## Consequências

- Nada dorme do jeito de um servidor contínuo gratuito; a primeira requisição de uma instância nova paga a inicialização da função e, se o banco estiver suspenso, o despertar do Neon.
- Um visitante pode passar um pouco de 120 req/min quando cai em instâncias diferentes. Aceito: a api só lê dados históricos com cache de 1 h.
- Previews de PR mostram o front com erro de conexão; só a produção funciona de ponta a ponta.
- Os builds dos dois projetos só rodam quando a pasta deles ou o `package-lock.json` mudam (`ignoreCommand`).
- Trocar a api para um servidor contínuo depois não muda o código: o `server.ts` continua funcionando.
