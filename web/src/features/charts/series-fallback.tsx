import type { ReactNode } from 'react';
import { isApiError } from '../../shared/api/client';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { Skeleton } from '../../shared/ui/skeleton';

export const NO_DATA = 'Sem dados no período';
const NOT_LOADED = 'Dados ainda não carregados';

interface QueryState {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
}

interface SeriesFallbackOptions {
  meta: QueryState;
  ready: boolean;
  // Only enabled queries: a disabled one stays pending forever.
  series: readonly QueryState[];
  loadingLabel: string;
  errorMessage: string;
  height?: string;
}

// Loading, empty and error states of the charts, with the time card's rules; null once every
// series has loaded.
export function seriesFallback({
  meta,
  ready,
  series,
  loadingLabel,
  errorMessage,
  height = '15rem',
}: SeriesFallbackOptions): ReactNode {
  const loading = <Skeleton label={loadingLabel} height={height} />;
  if (meta.isPending) return loading;
  if (meta.isError) {
    return <ErrorState message={errorMessage} onRetry={() => void meta.refetch()} />;
  }
  if (!ready) return <EmptyState message={NOT_LOADED} />;
  const failed = series.find((query) => query.isError);
  if (failed) {
    if (isApiError(failed.error, 'DATA_NOT_READY')) return <EmptyState message={NOT_LOADED} />;
    // The page drops an unknown country and the chart falls back to the world.
    if (isApiError(failed.error, 'COUNTRY_NOT_FOUND')) return <EmptyState message={NO_DATA} />;
    return (
      <ErrorState
        message={errorMessage}
        onRetry={() => {
          // A stale coverage would ask for dates out of range: refresh it first.
          void meta.refetch().then(() => Promise.all(series.map((query) => query.refetch())));
        }}
      />
    );
  }
  if (series.some((query) => query.isPending)) return loading;
  return null;
}
