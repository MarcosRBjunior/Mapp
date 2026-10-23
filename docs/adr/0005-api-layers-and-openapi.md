# ADR 0005 — Camadas da API e OpenAPI gerado

- Status: aceito
- Data: 2026-10-20

## Contexto

A F3 abriu a API REST só de leitura (`/ready`, `/api/v1/meta`, `/global`, `/countries`, `/countries/:code`). Precisávamos testar cada endpoint sem depender do banco, manter o contrato do front em sincronia com o código e servir a documentação.

## Decisão

- **Camadas:** `routes` (schemas zod) → `controllers` (traduzem HTTP) → `services` (regras puras: data de referência, participação, posição) → `repositories` (Prisma só leitura, convertem `bigint`/`Date`).
- **Injeção:** `createApp(deps)` recebe os serviços prontos. Os testes de API usam repositórios falsos em memória; o `server.ts` monta os reais com `DATABASE_URL` (usuário `mapp_api`). Um teste de integração roda o app real contra o Postgres.
- **OpenAPI:** os schemas zod (com `.meta()`) geram o documento pelo `zod-openapi`. `npm run openapi -w api` grava `docs/openapi.yaml`; um teste falha se o arquivo estiver desatualizado. Os testes de API validam as respostas com os mesmos schemas. A UI fica em `/api/docs` (`swagger-ui-express`, sem CDN) e o JSON em `/api/docs/openapi.json`.
- **Estado dos dados:** `dataVersion` = último `sync_run` com `success` ou `partial`. A data de referência (RN-06) e a cobertura vêm da view e ficam em memória; são recalculadas quando o `dataVersion` muda.

## Consequências

- Mudar um schema exige rodar `npm run openapi -w api` e commitar o `docs/openapi.yaml`; o CI acusa o esquecimento.
- Os tipos do front (F4) saem do `docs/openapi.yaml`.
- O memo da cobertura evita recalcular a data de referência sobre toda a série; o custo é uma consulta barata (o id do último run) a cada 5 s por instância (ver a atualização da F6a).

## Atualização da F6a (2026-10-23)

- Cache por `dataVersion`: um middleware responde 304 antes de validar a query, porque a mesma URL na mesma versão sempre devolve o mesmo corpo. O ETag do Express (hash do corpo) foi desligado. O `/meta` tem ETag próprio (`dataVersion` + id do último run), porque o `lastSync` muda até num run `failed`. Erros nunca são cacheados (`no-store`).
- O `dataVersion` é lido no máximo a cada 5 s por instância; depois de um sync, a API pode servir a versão anterior por até 5 s.
- Ranking e ordem alfabética no SQL (`row_number()` + `COLLATE "pt-BR-x-icu"`), igual ao `localeCompare('pt-BR')` do front. O banco gerenciado precisa ter ICU.
- Datas completas (RN-06) num fragmento SQL único (`repositories/complete-dates.ts`), usado pela cobertura, pela validação de `?date=` e pelas séries.
