# ADR 0009 — Fonte de dados: CSV da JHU CSSE (D-01 revista)

Data: 2026-11-07 · Status: aceita · Substitui a decisão da ADR 0002 (a API Ninjas continua implementada como alternativa)

## Contexto

A ADR 0002 escolheu a API Ninjas e registrou um risco: o plano gratuito não permite cache nem armazenamento, e o Mapp grava os dados no Postgres. Isso bloqueava a publicação (F9). Os números da API Ninjas vêm da própria JHU CSSE, cujo repositório (COVID-19 Data Repository) publica as séries em CSV com licença CC BY 4.0, que permite armazenar com atribuição.

Conferido em 2026-11-07 com os arquivos baixados do GitHub:

- `time_series_covid19_confirmed_global.csv` e `time_series_covid19_deaths_global.csv`: 289 linhas, uma coluna por dia de 2020-01-22 a 2023-03-09 (D-02 continua valendo), totais acumulados inteiros, sem células vazias.
- 201 nomes de país, todos já curados em `aliases.json` (os nomes são os mesmos da API Ninjas). Os mesmos oito países vêm divididos em regiões (RN-02). O Saara Ocidental também não aparece.
- Na data de referência, total e `new` são iguais aos da chamada real à API Ninjas gravada nas fixtures (13 linhas por métrica), e o `new` da API Ninjas é a diferença entre os totais de dias seguidos.

## Decisão

- A fonte padrão é o **CSV da JHU CSSE** (`DATA_PROVIDER=jhu_csv`, sem chave), no provider `api/src/providers/jhu-csv`. A API Ninjas continua disponível com `DATA_PROVIDER=api_ninjas`.
- `new` = total do dia − total do dia anterior, como na API Ninjas; quedas de total viram `new` negativo e são gravadas como vieram (RN-07). O primeiro dia (2020-01-22) não tem dia anterior: o `new` dele é o próprio total.
- O provider baixa cada arquivo uma vez por run: um snapshot ou um full custam **dois downloads**, contados no orçamento da `provider_call` como qualquer chamada. As unidades e os checkpoints do full não mudam (uma unidade por métrica × alias). Um download que falha é refeito pela unidade seguinte; um arquivo inválido não é baixado de novo no mesmo run.
- O CSV é validado com zod antes de gravar: cabeçalho `Province/State,Country/Region,Lat,Long`, datas M/D/YY consecutivas desde 2020-01-22 até pelo menos 2023-03-09, totais inteiros não negativos, uma linha por país e região. As colunas depois de 2023-03-09 são descartadas.
- O seed cria as duas fontes em `data_source` com os mesmos aliases curados. A api lê a fonte do `DATA_PROVIDER`, agora com padrão `jhu_csv`.
- Atribuição (RN-10): "Dados: COVID-19 Data Repository by the Center for Systems Science and Engineering (CSSE) at Johns Hopkins University", licença CC BY 4.0, vinda do `/meta`.
- As fixtures de teste (`api/tests/fixtures/jhu-csv`) são linhas reais recortadas, permitidas pela licença.

## Consequências

- O risco de armazenamento da ADR 0002 deixa de bloquear a F9 com a fonte padrão.
- O full deixa de levar várias horas em vários runs: com a JHU, roda num só.
- A coleta da JHU terminou em 2023-03-10 e o repositório está arquivado: a URL `raw.githubusercontent.com` pode mudar ou sair do ar. Se isso acontecer, o sync falha sem gravar e os dados já carregados continuam servidos.
- Como na API Ninjas, o alias `Western Sahara` (ESH) está `mapped` mas não tem linhas: no full, as duas unidades dele falham com "no rows for that name" e o run fecha `partial`; os runs seguintes só têm essas unidades e fecham `failed`. Precisa de decisão antes do full real (ver "Adiado" no CLAUDE.md).
- Com a JHU, essa falha marca como payload inválido o download do arquivo inteiro na `provider_call`, embora o arquivo esteja certo: só a estatística fica imprecisa.
- Para trocar de fonte num banco existente, mude o `DATA_PROVIDER` da api e do job e rode o sync: os dados ficam separados por `source_id`.
