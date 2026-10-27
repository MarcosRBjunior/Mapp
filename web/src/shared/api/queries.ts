import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from './client';
import type { ChartRanges } from '../period/period';
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

// Daily series of the charts: it also returns the visible range of the request, so the chart can
// keep drawing the previous period (placeholder) with the range that produced it. The extra 6
// days before `visible` feed the 7-day average. The key has `visible.from` too: periods near the
// start of the coverage can share the same fetch range.
export function useChartSeries(code: string | null, metric: Metric, ranges: ChartRanges | null) {
  const place = code ?? 'world';
  return useQuery({
    queryKey: [
      'chart-series',
      place,
      metric,
      ranges?.fetch.from,
      ranges?.fetch.to,
      ranges?.visible.from,
    ],
    enabled: ranges !== null,
    // Only a period change keeps the old chart: another country or metric would be mislabelled.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === place && previousQuery.queryKey[2] === metric
        ? previous
        : undefined,
    queryFn: async () => {
      if (ranges === null) throw new Error('The chart series is disabled without ranges');
      const query = {
        metric,
        from: ranges.fetch.from,
        to: ranges.fetch.to,
        granularity: 'day' as const,
      };
      const response = await (code === null
        ? unwrap(apiClient().GET('/api/v1/global/timeseries', { params: { query } }))
        : unwrap(
            apiClient().GET('/api/v1/countries/{code}/timeseries', {
              params: { path: { code }, query },
            }),
          ));
      return { ...response, visible: ranges.visible };
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
