import type { ReactNode } from 'react';
import { isApiError } from '../../shared/api/client';
import { useMeta, useMonthlySeries } from '../../shared/api/queries';
import type {
  CountryTimeseriesResponse,
  GlobalTimeseriesResponse,
  Metric,
} from '../../shared/api/types';
import { formatDate, formatNumber } from '../../shared/format/format';
import { PERIOD_PHRASES, periodRange, type Period } from '../../shared/period/period';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { SectionCard } from '../../shared/ui/section-card';
import { Skeleton } from '../../shared/ui/skeleton';

const NOT_LOADED = 'Dados ainda não carregados';

const NEW_LABELS: Record<Metric, string> = { cases: 'Novos casos', deaths: 'Novas mortes' };

function isCountrySeries(
  data: GlobalTimeseriesResponse | CountryTimeseriesResponse,
): data is CountryTimeseriesResponse {
  return 'country' in data;
}

interface PeriodCardProps {
  code: string | null;
  metric: Metric;
  period: Period;
}

export function PeriodCard({ code, metric, period }: PeriodCardProps) {
  const meta = useMeta();
  const coverage = meta.data?.coverage ?? null;
  const range = coverage ? periodRange(period, coverage) : null;
  const series = useMonthlySeries(code, metric, range);
  const loading = <Skeleton label="Carregando novos no período" height="6rem" />;

  let content: ReactNode;
  if (meta.isPending) {
    content = loading;
  } else if (meta.isError) {
    content = (
      <ErrorState
        message="Não foi possível carregar o período"
        onRetry={() => void meta.refetch()}
      />
    );
  } else if (range === null) {
    content = <EmptyState message={NOT_LOADED} />;
  } else if (series.isPending) {
    content = loading;
  } else if (series.isError) {
    if (isApiError(series.error, 'DATA_NOT_READY')) {
      content = <EmptyState message={NOT_LOADED} />;
    } else if (isApiError(series.error, 'COUNTRY_NOT_FOUND')) {
      // Brief: the page drops an unknown country and the card falls back to the world.
      content = <EmptyState message="Sem dados no período" />;
    } else {
      content = (
        <ErrorState
          message="Não foi possível carregar os novos no período"
          onRetry={() => void series.refetch()}
        />
      );
    }
  } else if (series.data.points.length === 0) {
    content = <EmptyState message="Sem dados no período" />;
  } else {
    const total = series.data.points.reduce((sum, point) => sum + point.new, 0);
    content = (
      <>
        <dl className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">
            {`${NEW_LABELS[metric]} ${PERIOD_PHRASES[period]}`}
          </dt>
          <dd className="text-xl font-semibold tabular-nums">{formatNumber(total)}</dd>
        </dl>
        <p className="text-xs text-muted-foreground">
          {`De ${formatDate(range.from)} a ${formatDate(range.to)}`}
        </p>
        {range.clamped && (
          <p className="text-xs text-muted-foreground">
            {`Dados a partir de ${formatDate(range.from)}`}
          </p>
        )}
      </>
    );
  }

  const scope =
    code === null
      ? 'Mundo'
      : series.data && isCountrySeries(series.data)
        ? series.data.country.name
        : undefined;
  return (
    <SectionCard titleId="period-card-title" title="Por tempo" description={scope}>
      {content}
    </SectionCard>
  );
}
