# ADR 0002 — Fonte de dados: API Ninjas (D-01)

- Status: aceito
- Data: 2026-10-19

## Contexto

O Mapp precisa de casos e mortes de COVID-19 por país e por data. As opções eram API Ninjas (`/v1/covid19`, chave, 3.000 chamadas/mês, 100/hora), o CSV da JHU CSSE (CC BY 4.0, encerrado em 10/03/2023) e o agregador da Apify (45 países, parado em 21/11/2022).

## Decisão

- A fonte é a **API Ninjas** (`DATA_PROVIDER=api_ninjas`). A interface `CovidProvider` continua, para não amarrar o job a um fornecedor.
- Os países e os aliases vêm da tabela de referência da JHU (`UID_ISO_FIPS_LookUp_Table.csv`, CC BY 4.0), porque os dados da API Ninjas têm origem na JHU CSSE. Os aliases da `api_ninjas` são **provisórios** até a F2 confirmar os nomes com uma chamada real autorizada (D-02) e gravar fixtures.
- O GeoJSON do mapa vem do Natural Earth 1:110m (domínio público).

## Consequências

- **Risco:** os termos do plano gratuito da API Ninjas exigem atribuição e **não permitem cache nem armazenamento**, e o Mapp grava os dados no Postgres. Antes de publicar (F9), confirmar os termos ou contratar um plano compatível.
- O orçamento de chamadas (90/hora, limite mensal) e a tabela `provider_call` passam a ser obrigatórios na F2 e na F5.
- Atribuições visíveis exigidas (RN-10): API Ninjas (dados), JHU CSSE (tabela de referência, CC BY 4.0) e Natural Earth (GeoJSON). A página `/sobre` da F4 deve mostrá-las.
- Nomes da fonte sem alias continuam caindo em `pending`, e o sync fecha como `partial`.

## Atualizações

- Atualização (F2): os nomes foram confirmados com a chamada real de 2026-10-19 e a curadoria passou para `api/prisma/seed/aliases.json` (ADR 0004).
