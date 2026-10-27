import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from './client';
import { useMetric } from '../url/use-metric';
import type { Granularity, Metric } from './types';

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

// Detail name, or the list's while the detail loads (any cached metric works), else the code.
export function useCountryName(code: string | null): string | null {
  const [metric] = useMetric();
  const detail = useCountry(code);
  const list = useCountries(metric);
  if (code === null) return null;
  return (
    detail.data?.country.name ?? list.data?.countries.find((c) => c.code === code)?.name ?? code
  );
}

export interface SeriesRange {
  from: string;
  to: string;
}

// The API cuts the first and last blocks at the range and returns only complete dates (RN-06).
export function useTimeseries(
  code: string | null,
  metric: Metric,
  range: SeriesRange | null,
  granularity: Granularity,
) {
  return useQuery({
    queryKey: ['timeseries', code ?? 'world', metric, range?.from, range?.to, granularity],
    enabled: range !== null,
    queryFn: () => {
      const query = { metric, from: range?.from, to: range?.to, granularity };
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
