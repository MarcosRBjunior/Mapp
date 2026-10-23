import { createDocument } from 'zod-openapi';
import { stringify } from 'yaml';
import type { z } from 'zod';
import {
  countriesListResponseSchema,
  countriesQuerySchema,
  countryDetailResponseSchema,
  countryTimeseriesResponseSchema,
  countryParamsSchema,
  dateQuerySchema,
  errorResponseSchema,
  globalResponseSchema,
  globalTimeseriesResponseSchema,
  healthResponseSchema,
  metaResponseSchema,
  rankingsQuerySchema,
  rankingsResponseSchema,
  readyResponseSchema,
  timeseriesQuerySchema,
} from '../routes/schemas.js';

export const OPENAPI_YAML_PATH = new URL('../../../docs/openapi.yaml', import.meta.url);

const json = (schema: z.ZodType, description: string) => ({
  description,
  content: { 'application/json': { schema } },
});

const commonErrors = {
  '429': json(errorResponseSchema, 'RATE_LIMITED: mais de 120 requisições por minuto'),
  '500': json(errorResponseSchema, 'INTERNAL_ERROR'),
};

const notModified = {
  '304': { description: 'Not Modified: o If-None-Match bate com o ETag atual (dataVersion)' },
};

const dataErrors = {
  ...notModified,
  '400': json(
    errorResponseSchema,
    'VALIDATION_ERROR: parâmetro inválido ou data fora da cobertura',
  ),
  ...commonErrors,
  '503': json(errorResponseSchema, 'DATA_NOT_READY: nenhum dado carregado ainda'),
};

export function createOpenApiDocument() {
  return createDocument({
    openapi: '3.1.0',
    info: {
      title: 'Mapp API',
      version: '1.0.0',
      description:
        'Dados históricos de COVID-19 por país (casos e mortes). Só leitura. Sempre exiba a data de referência e a fonte. Respostas de dados trazem Cache-Control: public, max-age=3600 e ETag com o dataVersion; If-None-Match igual → 304.',
    },
    paths: {
      '/health': {
        get: {
          summary: 'A API está no ar',
          responses: { '200': json(healthResponseSchema, 'API no ar') },
        },
      },
      '/ready': {
        get: {
          summary: 'A API tem dados carregados',
          responses: {
            '200': json(readyResponseSchema, 'Pronta para servir dados'),
            '503': json(errorResponseSchema, 'DATA_NOT_READY: sem dados ou banco indisponível'),
          },
        },
      },
      '/api/v1/meta': {
        get: {
          summary: 'Fonte, licença, cobertura, data de referência e último sync',
          responses: {
            '200': json(metaResponseSchema, 'Metadados'),
            ...notModified,
            ...commonErrors,
          },
        },
      },
      '/api/v1/global': {
        get: {
          summary: 'Totais globais (soma dos países) numa data',
          requestParams: { query: dateQuerySchema },
          responses: { '200': json(globalResponseSchema, 'Totais globais'), ...dataErrors },
        },
      },
      '/api/v1/countries': {
        get: {
          summary: 'Países para o mapa, com o valor da métrica na data',
          requestParams: { query: countriesQuerySchema },
          responses: {
            '200': json(countriesListResponseSchema, 'Lista de países'),
            ...dataErrors,
          },
        },
      },
      '/api/v1/countries/{code}': {
        get: {
          summary: 'Detalhe de um país, com participação % e posição no ranking',
          requestParams: { path: countryParamsSchema, query: dateQuerySchema },
          responses: {
            '200': json(countryDetailResponseSchema, 'Detalhe do país'),
            '404': json(errorResponseSchema, 'COUNTRY_NOT_FOUND'),
            ...dataErrors,
          },
        },
      },
      '/api/v1/rankings': {
        get: {
          summary: 'Ranking dos países pela métrica numa data (RN-05), com participação %',
          requestParams: { query: rankingsQuerySchema },
          responses: { '200': json(rankingsResponseSchema, 'Ranking'), ...dataErrors },
        },
      },
      '/api/v1/global/timeseries': {
        get: {
          summary: 'Série global da métrica por dia, semana ou mês (só datas completas)',
          requestParams: { query: timeseriesQuerySchema },
          responses: {
            '200': json(globalTimeseriesResponseSchema, 'Série global'),
            ...dataErrors,
          },
        },
      },
      '/api/v1/countries/{code}/timeseries': {
        get: {
          summary: 'Série de um país por dia, semana ou mês (só datas completas)',
          requestParams: { path: countryParamsSchema, query: timeseriesQuerySchema },
          responses: {
            '200': json(countryTimeseriesResponseSchema, 'Série do país'),
            '404': json(errorResponseSchema, 'COUNTRY_NOT_FOUND'),
            ...dataErrors,
          },
        },
      },
    },
  });
}

export function renderOpenApiYaml(): string {
  return `# Gerado por \`npm run openapi -w api\` a partir dos schemas zod. Não edite à mão.\n${stringify(createOpenApiDocument())}`;
}
