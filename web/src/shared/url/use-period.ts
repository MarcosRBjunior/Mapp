import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { PERIODS, type Period } from '../period/period';

export function parsePeriod(value: string | null): Period {
  return PERIODS.find((period) => period === value) ?? '30d';
}

export function usePeriod(): [Period, (period: Period) => void] {
  const [params, setParams] = useSearchParams();
  const period = parsePeriod(params.get('period'));
  const setPeriod = useCallback(
    (next: Period) => {
      setParams((previous) => {
        const updated = new URLSearchParams(previous);
        updated.set('period', next);
        return updated;
      });
    },
    [setParams],
  );
  return [period, setPeriod];
}
