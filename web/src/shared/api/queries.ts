import { useQuery } from '@tanstack/react-query';
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
