# Dados de referência do seed

O `countries.json` é gerado a partir da tabela de referência da JHU CSSE e versionado. O `db:seed` só lê esse JSON; não acessa a rede.

| Arquivo                         | Origem                                                                                                            | Licença                                     | Baixado em | sha256                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ---------- | ------------------------------------------------------------------ |
| `UID_ISO_FIPS_LookUp_Table.csv` | https://raw.githubusercontent.com/CSSEGISandData/COVID-19/master/csse_covid_19_data/UID_ISO_FIPS_LookUp_Table.csv | CC BY 4.0 — © Johns Hopkins University CSSE | 2026-10-19 | `80bbd734ae7547dac8915d0960d01f43975c817bcddebebd19c026718a1368db` |

O CSV não é versionado. Para regenerar:

1. Baixe o arquivo da URL acima e confira o sha256.
2. Rode `npm run seed:build -w api -- <caminho/do/csv>`.
3. Revise o diff do `countries.json`.

Regras do gerador (`reference.ts`): só linhas de nível país; nome pt-BR pelo `Intl.DisplayNames` com exceções para `CD` e `MM`; as quatro entidades sem ISO3 viram `non_geographic` com os códigos `XDP`, `XMZ`, `XSO` e `XWO`. Os nomes `sourceName` são os da JHU e servem de aliases provisórios da `api_ninjas` até a F2 confirmar com fixtures.
