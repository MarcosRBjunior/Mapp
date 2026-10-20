# ADR 0005 — Camadas da API e OpenAPI gerado

- Status: aceito
- Data: 2026-10-20

## Contexto

A F3 abriu a API REST só de leitura (`/ready`, `/api/v1/meta`, `/global`, `/countries`, `/countries/:code`). Precisávamos testar cada endpoint sem depender do banco, manter o contrato do front em sincronia com o código e servir a documentação.

## Decisão

- **Camadas:** `routes` (schemas zod) → `controllers` (traduzem HTTP) → `services` (regras puras: data de referência, participação, posição) → `repositories` (Prisma só leitura, convertem `bigint`/`Date`).
- **Injeção:** `createApp(deps)` recebe os serviços prontos. Os testes de API usam repositórios falsos em memória; o `server.ts` monta os reais com `DATABASE_URL` (usuário `mapp_api`). Um teste de integração roda o app real contra o Postgres.
- **OpenAPI:** os schemas zod (com `.meta()`) geram o documento pelo `zod-openapi`. `npm run openapi -w api` grava `docs/openapi.yaml`; um teste falha se o arquivo estiver desatualizado. Os testes de API validam as respostas com os mesmos schemas. A UI fica em `/api/docs` (`swagger-ui-express`, sem CDN) e o JSON em `/api/docs/openapi.json`.
- **Estado dos dados:** `dataVersion` = último `sync_run` com `success` ou `partial`. A data de referência (RN-06) e a cobertura vêm da view e ficam em memória por `dataVersion`.

## Consequências

- Mudar um schema exige rodar `npm run openapi -w api` e commitar o `docs/openapi.yaml`; o CI acusa o esquecimento.
- Os tipos do front (F4) saem do `docs/openapi.yaml`.
- O memo por `dataVersion` custa uma consulta barata por requisição (o id do último run) e evita recalcular a data de referência sobre toda a série.
