import { createDocument } from 'zod-openapi';
import { stringify } from 'yaml';
import type { z } from 'zod';
import {
  countriesListResponseSchema,
  countriesQuerySchema,
  countryDetailResponseSchema,
  countryParamsSchema,
  dateQuerySchema,
  errorResponseSchema,
  globalResponseSchema,
  healthResponseSchema,
  metaResponseSchema,
  rankingsQuerySchema,
  rankingsResponseSchema,
  readyResponseSchema,
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

const dataErrors = {
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
        'Dados históricos de COVID-19 por país (casos e mortes). Só leitura. Sempre exiba a data de referência e a fonte.',
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
          responses: { '200': json(metaResponseSchema, 'Metadados'), ...commonErrors },
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
    },
  });
}

export function renderOpenApiYaml(): string {
  return `# Gerado por \`npm run openapi -w api\` a partir dos schemas zod. Não edite à mão.\n${stringify(createOpenApiDocument())}`;
}
