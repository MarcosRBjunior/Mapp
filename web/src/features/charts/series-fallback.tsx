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
}

interface SeriesFallbackOptions {
  meta: QueryState;
  // Refreshes the coverage and then the series; also used by the error of the meta itself.
  onRetry: () => void;
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
  onRetry,
  ready,
  series,
  loadingLabel,
  errorMessage,
  height = '15rem',
}: SeriesFallbackOptions): ReactNode {
  const loading = <Skeleton label={loadingLabel} height={height} />;
  if (meta.isPending) return loading;
  if (meta.isError) return <ErrorState message={errorMessage} onRetry={onRetry} />;
  if (!ready) return <EmptyState message={NOT_LOADED} />;
  const failed = series.find((query) => query.isError);
  if (failed) {
    if (isApiError(failed.error, 'DATA_NOT_READY')) return <EmptyState message={NOT_LOADED} />;
    // The page swaps an unknown country for the world view right after, so keep the skeleton.
    if (isApiError(failed.error, 'COUNTRY_NOT_FOUND')) return loading;
    return <ErrorState message={errorMessage} onRetry={onRetry} />;
  }
  if (series.some((query) => query.isPending)) return loading;
  return null;
}
