import { useQueryClient, type InvalidateQueryFilters } from '@tanstack/react-query';
import { useMeta } from './queries';

// "Tentar de novo" of the series components: a stale coverage would ask for dates out of range, so
// refresh it first, then invalidate only the queries that match `filters` (never the other
// series on the page, such as the popup's sparkline).
export function useSeriesRetry(filters: InvalidateQueryFilters) {
  const meta = useMeta();
  const queryClient = useQueryClient();
  return () => {
    void meta.refetch().then(() => queryClient.invalidateQueries(filters));
  };
}
