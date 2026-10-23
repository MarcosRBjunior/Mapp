import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from './client';
import type { Metric } from './types';

export function useMeta() {
  return useQuery({
    queryKey: ['meta'],
    queryFn: () => unwrap(apiClient().GET('/api/v1/meta')),
  });
}

export function useGlobal() {
  return useQuery({
    queryKey: ['global'],
    queryFn: () => unwrap(apiClient().GET('/api/v1/global')),
  });
}

export function useCountries(metric: Metric) {
  return useQuery({
    queryKey: ['countries', metric],
    placeholderData: keepPreviousData,
    queryFn: () => unwrap(apiClient().GET('/api/v1/countries', { params: { query: { metric } } })),
  });
}

export function useCountry(code: string | null) {
  return useQuery({
    queryKey: ['country', code],
    queryFn: () =>
      unwrap(
        apiClient().GET('/api/v1/countries/{code}', { params: { path: { code: code ?? '' } } }),
      ),
    enabled: code !== null,
  });
}

export interface SeriesRange {
  from: string;
  to: string;
}

// Monthly points keep the payload small (~38 points for the whole history); the API cuts the
// first and last blocks at the range and returns only complete dates (RN-06), so summing `new`
// gives the total of the complete days of the period (RN-11).
export function useMonthlySeries(code: string | null, metric: Metric, range: SeriesRange | null) {
  return useQuery({
    queryKey: ['timeseries', code ?? 'world', metric, range?.from, range?.to, 'month'],
    enabled: range !== null,
    queryFn: () => {
      const query = {
        metric,
        from: range?.from,
        to: range?.to,
        granularity: 'month' as const,
      };
      return code === null
        ? unwrap(apiClient().GET('/api/v1/global/timeseries', { params: { query } }))
        : unwrap(
            apiClient().GET('/api/v1/countries/{code}/timeseries', {
              params: { path: { code }, query },
            }),
          );
    },
  });
}

export function useRankings(metric: Metric, limit: number) {
  return useQuery({
    queryKey: ['rankings', metric, limit],
    queryFn: () =>
      unwrap(apiClient().GET('/api/v1/rankings', { params: { query: { metric, limit } } })),
  });
}
