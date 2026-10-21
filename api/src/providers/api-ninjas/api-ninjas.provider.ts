import { z } from 'zod';
import type { CovidProvider, FetchLike } from '../covid-provider.js';
import {
  ProviderAuthError,
  ProviderHttpError,
  ProviderNetworkError,
  ProviderPayloadError,
  isTimeoutError,
} from '../provider-errors.js';
import { daySchemas, seriesSchemas } from './api-ninjas.schemas.js';

const BASE_URL = 'https://api.api-ninjas.com/v1/covid19';
const MAX_DETAIL_LENGTH = 500;

// D-02: the API Ninjas series ends on this date (confirmed by a real call on 2026-10-19).
export const API_NINJAS_FINAL_DATE = '2023-03-09';
export const API_NINJAS_FIRST_DATE = '2020-01-22';

async function getJson<T>(
  fetch: FetchLike,
  apiKey: string,
  query: URLSearchParams,
  schema: z.ZodType<T>,
): Promise<T> {
  const response = await fetch(`${BASE_URL}?${query.toString()}`, {
    headers: { 'X-Api-Key': apiKey },
  });
  if (response.status === 401 || response.status === 403) {
    throw new ProviderAuthError(response.status);
  }
  if (!response.ok) {
    throw new ProviderHttpError(response.status);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ProviderPayloadError('response is not valid JSON');
    }
    throw new ProviderNetworkError(isTimeoutError(error) ? 'timeout' : 'network_error', {
      cause: error,
    });
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ProviderPayloadError(z.prettifyError(result.error).slice(0, MAX_DETAIL_LENGTH));
  }
  return result.data;
}

export function createApiNinjasProvider(options: {
  apiKey: string;
  fetch: FetchLike;
}): CovidProvider {
  return {
    sourceCode: 'api_ninjas',
    finalDate: API_NINJAS_FINAL_DATE,
    fetchDay: (date, metric) =>
      getJson(
        options.fetch,
        options.apiKey,
        new URLSearchParams({ date, type: metric }),
        daySchemas[metric],
      ),
    async fetchSeries(sourceName, metric) {
      const rows = await getJson(
        options.fetch,
        options.apiKey,
        new URLSearchParams({ country: sourceName, type: metric }),
        seriesSchemas[metric],
      );
      return rows.map((row) => ({
        ...row,
        points: row.points.filter(
          (point) => point.date >= API_NINJAS_FIRST_DATE && point.date <= API_NINJAS_FINAL_DATE,
        ),
      }));
    },
  };
}
