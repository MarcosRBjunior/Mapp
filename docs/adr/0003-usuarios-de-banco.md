# ADR 0003 — Dois usuários de banco; o do sync é dono do schema

- Status: aceito
- Data: 2026-10-19

## Contexto

O `CLAUDE.md` exige que a api HTTP só leia (`DATABASE_URL`) e que o job escreva (`DATABASE_URL_SYNC`). Faltava definir quem roda as migrações e é dono das tabelas e da view materializada (o `REFRESH` exige ser dono ou ter `MAINTAIN`).

## Decisão

- `mapp` (o `DATABASE_URL_SYNC`) é dono do schema: aplica migrações, roda o seed e o job.
- `mapp_api` (o `DATABASE_URL`) só tem `CONNECT`, `USAGE` no schema `public` e `SELECT` em todas as tabelas e views, inclusive as futuras (`ALTER DEFAULT PRIVILEGES`).
- O script `npm run db:roles -w api` cria ou atualiza o `mapp_api` lendo usuário e senha do próprio `DATABASE_URL`; nenhuma senha vai para o git. O `db:migrate` roda `prisma migrate deploy` e depois o `db:roles`.

## Consequências

- Só duas variáveis de banco, como no `CLAUDE.md`.
- O job tem poder de DDL. Aceito para um projeto de portfólio; se precisar de menor privilégio, separar um dono (`DATABASE_URL_MIGRATE`) e dar ao sync só DML + `MAINTAIN` na view.
- Em hospedagem (F9), o usuário do `DATABASE_URL_SYNC` precisa de `CREATEROLE` para o `db:roles`, ou o leitor é criado pelo painel do provedor.
