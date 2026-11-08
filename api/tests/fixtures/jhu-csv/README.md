# Fixtures da JHU CSSE

Linhas reais recortadas das séries globais do COVID-19 Data Repository by the Center for Systems Science and Engineering (CSSE) at Johns Hopkins University, licença CC BY 4.0 (© Johns Hopkins University). Ao contrário da API Ninjas, a licença permite guardar os dados com atribuição.

| Arquivo                                           | Origem                                                                                                                                                 | Baixado em | sha256 do arquivo inteiro                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------ |
| `time_series_covid19_confirmed_global.sample.csv` | https://raw.githubusercontent.com/CSSEGISandData/COVID-19/master/csse_covid_19_data/csse_covid_19_time_series/time_series_covid19_confirmed_global.csv | 2026-11-07 | `e6234a59eec4359d2577358b5220e1a7e3da74c162913cdb7d882db1413f98c2` |
| `time_series_covid19_deaths_global.sample.csv`    | https://raw.githubusercontent.com/CSSEGISandData/COVID-19/master/csse_covid_19_data/csse_covid_19_time_series/time_series_covid19_deaths_global.csv    | 2026-11-07 | `4e87757a3e059c45650a1e1856614f8e339ee3c70653c378a7ba6f7b0ee8c72e` |

Recorte: o cabeçalho inteiro (2020-01-22 a 2023-03-09) e só as linhas de Brasil, Dinamarca (três linhas: Faroe Islands, Greenland e a linha sem região), Diamond Princess e "Korea, South" (nome com vírgula, entre aspas). As linhas não foram alteradas.

Os arquivos completos têm 289 linhas e 201 nomes de país, todos já curados em `api/prisma/seed/aliases.json`. Na data de referência, os valores dessas linhas são iguais aos da chamada real à API Ninjas gravada em `../api-ninjas` (o teste do provider confere).
