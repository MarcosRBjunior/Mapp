import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import type { Metric } from '../api/types';

export function parseMetric(value: string | null): Metric {
  return value === 'deaths' ? 'deaths' : 'cases';
}

export function useMetric(): [Metric, (metric: Metric) => void] {
  const [params, setParams] = useSearchParams();
  const metric = parseMetric(params.get('metric'));
  const setMetric = useCallback(
    (next: Metric) => {
      setParams((previous) => {
        const updated = new URLSearchParams(previous);
        updated.set('metric', next);
        return updated;
      });
    },
    [setParams],
  );
  return [metric, setMetric];
}
