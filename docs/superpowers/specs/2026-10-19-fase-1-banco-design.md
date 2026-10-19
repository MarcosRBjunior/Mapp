# Fase 1 — Banco: design

- Data: 2026-10-19
- Fase: F1 do roteiro do `CLAUDE.md`
- Status: aprovado em conversa; aguardando revisão do arquivo
- Branch: `feat/database`

## Objetivo

Criar o banco do Mapp: schema completo, view materializada, índice parcial, os dois usuários de banco, o seed de referência (fonte, países, aliases) e o GeoJSON do mapa.

Critério de saída: num banco vazio, `npm run db:migrate -w api && npm run db:seed -w api` cria 202 entidades em `country` — 198 com `kind = country` e coordenadas, 4 `non_geographic` — e o teste de integração que prova isso passa no CI.

## Decisões desta fase

| Tema | Decisão |
| --- | --- |
| D-01 Fonte de dados | **API Ninjas** (`DATA_PROVIDER=api_ninjas`). Risco registrado no ADR 0002: os termos do plano gratuito não permitem cache nem armazenamento, e o Mapp armazena. Rever antes da F9. |
| Referência de países | Tabela `UID_ISO_FIPS_LookUp_Table.csv` da JHU CSSE (CC BY 4.0): nome usado pela JHU → ISO3/ISO2, lat/lng, população. Os dados da API Ninjas vêm da JHU, então esses nomes são os aliases provisórios da `api_ninjas` até a F2 confirmar com fixtures (D-02). |
| GeoJSON | Natural Earth `ne_110m_admin_0_countries` (domínio público), reduzido às propriedades `iso3` e `name`. |
| Usuários de banco (ADR 0003) | Dois: `mapp` é dono do schema e roda migrações, seed e job (`DATABASE_URL_SYNC`); `mapp_api` só lê (`DATABASE_URL`). |
| Prisma | `~7.10.1` (o `latest` do npm aponta para um RC da 8). Generator `prisma-client` com saída em `api/src/generated/prisma`, adapter `@prisma/adapter-pg`, preview feature `partialIndexes`. |
| Seed | Gerado uma vez a partir dos arquivos de referência e versionado como JSON; `db:seed` não acessa a rede. |

Verificado num spike descartável (Prisma 7.10.1 + Postgres 18):

- `@@unique([status], where: raw("status = 'running'"))` com `previewFeatures = ["partialIndexes"]` gera `CREATE UNIQUE INDEX ... WHERE (status = 'running')`; um segundo `running` falha com `P2002`.
- CHECK e view materializada adicionados como SQL bruto na migração não geram drift: o `migrate dev` seguinte sai vazio.
- `prisma generate` funciona sem `DATABASE_URL_SYNC` definido; o client gerado compila com o `tsconfig.base.json` do projeto (`noUnusedLocals`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, NodeNext).
- `REFRESH MATERIALIZED VIEW CONCURRENTLY` funciona como dono da view, com o índice único.

Fora do escopo (YAGNI): adaptadores de provider, upsert de `daily_stat` com dados reais e refresh no fim do sync (F2/F5); validar `DATABASE_URL` na api HTTP (F3, quando ela passa a ler do banco); usar a população (depende da D-07).

## Schema

Banco em `snake_case`, client em `camelCase` (`@map`/`@@map`). Enums Postgres: `country_kind` (`country`, `non_geographic`), `alias_status` (`mapped`, `pending`, `ignored`), `metric` (`cases`, `deaths`), `sync_mode` (`snapshot`, `full`), `sync_status` (`running`, `success`, `partial`, `failed`), `checkpoint_status` (`pending`, `done`, `error`), `call_outcome` (`ok`, `http_error`, `timeout`, `network_error`, `invalid_payload`).

| Tabela | Colunas | Chaves e restrições |
| --- | --- | --- |
| `data_source` | `id` serial, `code` text, `name` text, `url` text, `license` text, `attribution` text | PK `id`; `code` único |
| `country` | `code` char(3), `name` text (pt-BR), `kind` `country_kind`, `lat` double, `lng` double, `population` bigint | PK `code`; CHECK `kind <> 'country' OR (lat IS NOT NULL AND lng IS NOT NULL)`; CHECK `lat BETWEEN -90 AND 90`; CHECK `lng BETWEEN -180 AND 180` |
| `country_alias` | `source_id` int, `source_name` text, `country_code` char(3) null, `status` `alias_status` | PK (`source_id`, `source_name`); FKs para `data_source` e `country`; CHECK `(status = 'mapped') = (country_code IS NOT NULL)` |
| `daily_stat` | `country_code` char(3), `metric` `metric`, `stat_date` date, `source_id` int, `total` int, `new_value` int, `updated_at` timestamptz default now() | PK (`country_code`, `metric`, `stat_date`, `source_id`); FKs; CHECK `total >= 0`; índice (`source_id`, `metric`, `stat_date`) |
| `sync_run` | `id` serial, `source_id` int, `mode` `sync_mode`, `status` `sync_status`, `started_at` timestamptz default now(), `finished_at` timestamptz null, `reference_date` date null, `calls_used` int default 0, `error` text null | PK `id`; FK; índice único parcial `sync_run_single_running` em (`status`) `WHERE status = 'running'` |
| `sync_checkpoint` | `id` serial, `sync_run_id` int, `unit` text, `status` `checkpoint_status`, `attempts` int default 0, `error_message` text null, `updated_at` timestamptz default now() | PK `id`; FK; único (`sync_run_id`, `unit`) |
| `provider_call` | `id` bigserial, `source_id` int, `sync_run_id` int null, `called_at` timestamptz default now(), `endpoint` text (caminho + query, nunca a chave), `status_code` int null, `duration_ms` int null, `outcome` `call_outcome` | PK `id`; FKs; índice (`source_id`, `called_at`) |

`int` basta para `total`/`new_value` (o maior total por país fica na casa de 10⁸); as somas da view são `bigint`.

View materializada (SQL bruto na migração inicial), RN-01 e RN-08 (não geográficas entram no global):

```sql
CREATE MATERIALIZED VIEW global_daily_stat AS
SELECT source_id, metric, stat_date,
       sum(total)::bigint     AS total,
       sum(new_value)::bigint AS new_value,
       count(*)::int          AS country_count
FROM daily_stat
GROUP BY source_id, metric, stat_date;

CREATE UNIQUE INDEX global_daily_stat_key ON global_daily_stat (source_id, metric, stat_date);
```

A view fica fora do `schema.prisma`; a F3 decide como consultá-la.

## Usuários de banco

- `mapp` (o `POSTGRES_USER` do compose) é dono de tudo: aplica migrações, roda seed e, a partir da F2, o job.
- `mapp_api` é criado pelo script `npm run db:roles -w api` (`api/prisma/roles.ts`), executado como dono. Usuário e senha vêm do próprio `DATABASE_URL` — nenhuma senha no git. O script é idempotente:
  - `CREATE ROLE ... LOGIN PASSWORD ...` se não existir, senão `ALTER ROLE ... PASSWORD ...`;
  - `GRANT CONNECT ON DATABASE`, `GRANT USAGE ON SCHEMA public`, `GRANT SELECT ON ALL TABLES IN SCHEMA public`;
  - `ALTER DEFAULT PRIVILEGES FOR ROLE <dono> IN SCHEMA public GRANT SELECT ON TABLES TO <leitor>`.
- Nome e senha entram no SQL só por escape seguro (`escapeIdentifier`/`escapeLiteral` do `pg`).

## Variáveis de ambiente

`api/.env.example` ganha (valores falsos, banco local na porta 5435):

```dotenv
DATABASE_URL=postgresql://mapp_api:mapp_api@127.0.0.1:5435/mapp
DATABASE_URL_SYNC=postgresql://mapp:mapp@127.0.0.1:5435/mapp
```

- `api/src/config/db-env.ts` valida com zod as duas URLs para os scripts de banco (`roles`, `seed`, testes de integração). A api HTTP não muda nesta fase.
- `api/prisma.config.ts` carrega `api/.env` com `process.loadEnvFile` quando o arquivo existe e usa `DATABASE_URL_SYNC` como URL (string vazia se ausente, para o `prisma generate` funcionar sem banco).

## Dados de referência e seed

```text
api/prisma/seed/
  README.md            # origem, licença, data de download e sha256 dos arquivos de referência
  reference.ts         # funções puras: linhas do CSV da JHU → CountrySeed[]
  build-countries.ts   # CLI: lê o CSV (caminho por argumento) e grava countries.json
  countries.json       # gerado e versionado
  seed.ts              # upsert de data_source, country, country_alias
web/scripts/
  geo.ts               # função pura: FeatureCollection do Natural Earth → só iso3 + name
  build-geo.ts         # CLI: lê o GeoJSON (caminho por argumento) e grava public/geo/countries-110m.geojson
web/public/geo/countries-110m.geojson   # gerado e versionado
```

Arquivos de referência (baixados uma vez com autorização; não versionados):

| Arquivo | Origem | sha256 |
| --- | --- | --- |
| `UID_ISO_FIPS_LookUp_Table.csv` | `https://raw.githubusercontent.com/CSSEGISandData/COVID-19/master/csse_covid_19_data/UID_ISO_FIPS_LookUp_Table.csv` | `80bbd734ae7547dac8915d0960d01f43975c817bcddebebd19c026718a1368db` |
| `ne_110m_admin_0_countries.geojson` | `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson` | `6866c877d39cba9c357620878839b336d569f8c662d3cfab4cb1dbe2d39c977f` |

Regras do gerador de países (`reference.ts`):

- Só linhas de nível país (`Province_State` e `Admin2` vazios): 202 linhas.
- Linhas com `iso3` → `kind = country`, `code = iso3`, `lat`/`lng` = `Lat`/`Long_`, `population` = `Population` (ou `null` se vazio), `name` = `Intl.DisplayNames(['pt-BR'], { type: 'region' }).of(iso2)` com exceções: `CD` → "República Democrática do Congo", `MM` → "Mianmar". (`PS` fica com o nome do `Intl`, "Territórios palestinos", sem escolha política além da fonte.)
- Linhas sem `iso3` → `kind = non_geographic`, `lat`/`lng`/`population` = `null`, código e nome fixos:

  | Nome na JHU | `code` | `name` |
  | --- | --- | --- |
  | Diamond Princess | `XDP` | Navio Diamond Princess |
  | MS Zaandam | `XMZ` | Navio MS Zaandam |
  | Summer Olympics 2020 | `XSO` | Jogos Olímpicos de Verão 2020 |
  | Winter Olympics 2022 | `XWO` | Jogos Olímpicos de Inverno 2022 |

- Linha sem `iso3` fora dessa tabela, `iso3` duplicado ou coordenada fora da faixa → erro (o gerador não grava nada).
- Saída ordenada por `code`; cada item tem `code`, `name`, `kind`, `lat`, `lng`, `population` e `sourceName` (o `Country_Region` da JHU).

Seed (`seed.ts`, idempotente, em uma transação):

1. Upsert de `data_source` `api_ninjas`: nome "API Ninjas — COVID-19", url `https://api-ninjas.com/api/covid19`, licença "Termos de uso da API Ninjas (plano gratuito: exige atribuição; não permite cache nem armazenamento)", atribuição "Dados: API Ninjas (fonte original: JHU CSSE)".
2. Upsert dos 202 países de `countries.json`.
3. Upsert dos 202 aliases `(api_ninjas, sourceName) → code` com `status = mapped`.

GeoJSON (`geo.ts`): cada feature mantém só `{ iso3, name }`; `iso3` = `ISO_A3_EH`, ou `ADM0_A3` quando `ISO_A3_EH` for `-99`; `KOS` → `XKS` (código usado pela JHU). Geometria intacta.

Atribuições exigidas: JHU CSSE (CC BY 4.0) pela tabela de referência e Natural Earth (domínio público) pelo GeoJSON. A página `/sobre` da F4 deve mostrá-las (RN-10); fica registrado no "Estado atual" do `CLAUDE.md`.

## Scripts

`api/package.json`:

| Script | Comando |
| --- | --- |
| `postinstall` | `prisma generate` |
| `db:generate` | `prisma generate` |
| `db:roles` | `tsx --env-file-if-exists=.env prisma/roles.ts` |
| `db:migrate` | `prisma migrate deploy && npm run db:roles` |
| `db:seed` | `tsx --env-file-if-exists=.env prisma/seed/seed.ts` |
| `seed:build` | `tsx prisma/seed/build-countries.ts` |
| `test:integration` | `vitest run --config vitest.integration.config.ts` |

`web/package.json`: `geo:build` → `tsx scripts/build-geo.ts`.

O client gerado (`api/src/generated/`) fica no `.gitignore`, no `globalIgnores` do ESLint e no `.prettierignore`. O `api/tsconfig.json` passa a incluir `prisma` e `prisma.config.ts`; o `web/tsconfig.node.json` passa a incluir `scripts`; o bloco do ESLint com globals de Node passa a cobrir `web/scripts/**/*.ts`; o Vitest do web passa a incluir `scripts/**/*.test.ts`.

## Testes

Unitários (`npm test`, sem banco):

| Arquivo | Casos |
| --- | --- |
| `api/tests/unit/seed/reference.test.ts` | linha com iso3 vira `country` com nome pt-BR, números e população; exceções de nome (`CD`, `MM`) e `PS` sem exceção; as 4 não geográficas recebem `XDP`/`XMZ`/`XSO`/`XWO` e coordenadas `null`; linhas de província são ignoradas; linha sem iso3 desconhecida, iso3 duplicado e latitude fora da faixa lançam erro |
| `api/tests/unit/seed/countries-json.test.ts` | o `countries.json` versionado tem 202 itens, 198 `country` com lat/lng, 4 `non_geographic`, códigos únicos de 3 letras maiúsculas |
| `api/tests/unit/prisma/roles.test.ts` | o SQL gerado escapa nome e senha (aspas e caracteres especiais) e contém CREATE/ALTER ROLE, GRANTs e ALTER DEFAULT PRIVILEGES |
| `web/scripts/geo.test.ts` | mantém só `iso3`/`name`; `-99` cai para `ADM0_A3`; `KOS` vira `XKS`; geometria preservada |

Integração (`npm run test:integration -w api`, Postgres real): banco `mapp_test` no mesmo servidor, URLs derivadas de `DATABASE_URL`/`DATABASE_URL_SYNC` trocando o nome do banco. O `globalSetup` recria `mapp_test` do zero e roda `prisma migrate deploy`, `roles.ts` e `seed.ts`. Casos:

- 202 países (198 `country` com coordenadas, 4 `non_geographic`), 1 `data_source`, 202 aliases `mapped`;
- rodar o seed de novo não muda as contagens;
- `total < 0` e alias `mapped` sem país são recusados pelos CHECKs;
- um segundo `sync_run` `running` é recusado (P2002);
- dados de `daily_stat` para dois países e uma não geográfica, `REFRESH MATERIALIZED VIEW CONCURRENTLY` → `global_daily_stat` com a soma dos três e `country_count = 3`;
- `mapp_api` consegue `SELECT` em `country` e recebe erro de permissão em `INSERT`.

`api/vitest.config.ts` (unitários) passa a incluir só `tests/unit/**` e `tests/api/**`; `api/vitest.integration.config.ts` inclui `tests/integration/**`.

## CI

- Job `quality`: sem mudança nos passos; o `postinstall` gera o client.
- Job novo `integration` (`ubuntu-latest`, timeout 15 min): `services.postgres` com `postgres:18-alpine`, `POSTGRES_USER/PASSWORD/DB = mapp`, porta `5432:5432`, healthcheck `pg_isready`; env `DATABASE_URL=postgresql://mapp_api:mapp_api@127.0.0.1:5432/mapp` e `DATABASE_URL_SYNC=postgresql://mapp:mapp@127.0.0.1:5432/mapp`; passos checkout (sem credenciais), setup-node, `npm ci`, `npm run test:integration -w api`.

## Documentação

- `docs/adr/0002-fonte-de-dados-api-ninjas.md`: D-01, alternativas, risco dos termos, aliases provisórios, referência JHU + Natural Earth e atribuições.
- `docs/adr/0003-usuarios-de-banco.md`: dois usuários, dono = sync, `db:roles` lendo a senha da URL.
- `CLAUDE.md`: D-01 sai de "Em aberto" e entra em "Adotadas"; "Estado atual" atualizado no fim da fase (F1 concluída; pendências: confirmar aliases e D-02 na F2, atribuições no `/sobre` na F4).
