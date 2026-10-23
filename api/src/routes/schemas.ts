import { z } from 'zod';
import { ISO_DATE_PATTERN, isIsoDate } from '../lib/dates.js';

export const metricSchema = z
  .enum(['cases', 'deaths'])
  .meta({ id: 'Metric', description: 'cases = casos, deaths = mortes' });

const isoDateSchema = z
  .string()
  .regex(ISO_DATE_PATTERN, 'must be YYYY-MM-DD')
  .refine(isIsoDate, { error: 'must be a valid calendar date' })
  .meta({ description: 'Data no formato YYYY-MM-DD. Sem ela, vale a data de referência.' });

export const dateQuerySchema = z.object({ date: isoDateSchema.optional() });

export const countriesQuerySchema = z.object({
  metric: metricSchema.default('cases'),
  date: isoDateSchema.optional(),
});

export const countryParamsSchema = z.object({
  code: z
    .string()
    .regex(/^[A-Za-z]{3}$/, 'must be an ISO3 code')
    .transform((code) => code.toUpperCase())
    .meta({ description: 'Código ISO3 do país (maiúsculas ou minúsculas)' }),
});

export const errorResponseSchema = z
  .object({
    error: z.object({
      code: z.enum([
        'VALIDATION_ERROR',
        'COUNTRY_NOT_FOUND',
        'NOT_FOUND',
        'RATE_LIMITED',
        'DATA_NOT_READY',
        'INTERNAL_ERROR',
      ]),
      message: z.string(),
      details: z.unknown().nullable(),
      requestId: z.string(),
    }),
  })
  .meta({ id: 'ErrorResponse' });

export const healthResponseSchema = z
  .object({ status: z.literal('ok') })
  .meta({ id: 'HealthResponse' });

export const readyResponseSchema = z
  .object({
    status: z.literal('ready'),
    dataVersion: z.number().int(),
    referenceDate: z.string(),
  })
  .meta({ id: 'ReadyResponse' });

const metricValueSchema = z
  .object({ total: z.number().int(), new: z.number().int() })
  .meta({ id: 'MetricValue' });

export const metaResponseSchema = z
  .object({
    source: z.object({
      code: z.string(),
      name: z.string(),
      url: z.string(),
      license: z.string(),
      attribution: z.string(),
    }),
    coverage: z
      .object({ from: z.string(), to: z.string(), countries: z.number().int() })
      .nullable(),
    referenceDate: z.string().nullable(),
    lastSync: z
      .object({
        status: z.enum(['success', 'partial', 'failed']),
        mode: z.enum(['snapshot', 'full']),
        startedAt: z.string(),
        finishedAt: z.string(),
      })
      .nullable(),
    dataVersion: z.number().int().nullable(),
    nonGeographic: z.array(z.object({ code: z.string(), name: z.string() })),
  })
  .meta({ id: 'MetaResponse' });

export const globalResponseSchema = z
  .object({
    date: z.string(),
    cases: metricValueSchema,
    deaths: metricValueSchema,
    countryCount: z.number().int(),
  })
  .meta({ id: 'GlobalResponse' });

export const countriesListResponseSchema = z
  .object({
    date: z.string(),
    metric: metricSchema,
    countries: z.array(
      z.object({
        code: z.string(),
        name: z.string(),
        lat: z.number().nullable(),
        lng: z.number().nullable(),
        total: z.number().int().nullable(),
        new: z.number().int().nullable(),
      }),
    ),
  })
  .meta({ id: 'CountriesListResponse' });

const comparisonSchema = z
  .object({
    share: z.number().nullable(),
    rank: z.number().int().nullable(),
    rankedCount: z.number().int(),
  })
  .meta({ id: 'MetricComparison' });

export const countryDetailResponseSchema = z
  .object({
    date: z.string(),
    country: z.object({
      code: z.string(),
      name: z.string(),
      lat: z.number().nullable(),
      lng: z.number().nullable(),
      population: z.number().int().nullable(),
    }),
    cases: metricValueSchema.nullable(),
    deaths: metricValueSchema.nullable(),
    comparison: z.object({ cases: comparisonSchema, deaths: comparisonSchema }),
  })
  .meta({ id: 'CountryDetailResponse' });

export const rankingsQuerySchema = z.object({
  metric: metricSchema.default('cases'),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .meta({ description: 'Quantos países devolver (1 a 50)' }),
  date: isoDateSchema.optional(),
});

export const rankingsResponseSchema = z
  .object({
    date: z.string(),
    metric: metricSchema,
    rankedCount: z.number().int(),
    items: z.array(
      z.object({
        rank: z.number().int(),
        code: z.string(),
        name: z.string(),
        total: z.number().int(),
        new: z.number().int(),
        share: z.number().nullable(),
      }),
    ),
  })
  .meta({ id: 'RankingsResponse' });
