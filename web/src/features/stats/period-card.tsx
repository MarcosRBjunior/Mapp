import { useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCountryName, useMeta, useTimeseries } from '../../shared/api/queries';
import type { Metric } from '../../shared/api/types';
import { NEW_LABELS, formatDate, formatNumber } from '../../shared/format/format';
import { PERIOD_PHRASES, periodRange, type Period } from '../../shared/period/period';
import { EmptyState } from '../../shared/ui/empty-state';
import { NO_DATA, seriesFallback } from '../charts/series-fallback';
import { SectionCard } from '../../shared/ui/section-card';

interface PeriodCardProps {
  code: string | null;
  metric: Metric;
  period: Period;
}

export function PeriodCard({ code, metric, period }: PeriodCardProps) {
  const meta = useMeta();
  const coverage = meta.data?.coverage ?? null;
  const range = coverage ? periodRange(period, coverage) : null;
  // Monthly points keep the payload small (~38 points for the whole history); summing `new`
  // gives the total of the complete days of the period (RN-11).
  const series = useTimeseries(code, metric, range, 'month');
  const countryName = useCountryName(code);
  const queryClient = useQueryClient();
  const retry = () => {
    // A stale coverage would ask for dates out of range: refresh it, then the active series.
    void meta.refetch().then(() => queryClient.invalidateQueries({ queryKey: ['timeseries'] }));
  };
  let content: ReactNode = seriesFallback({
    meta,
    onRetry: retry,
    ready: range !== null,
    series: [series],
    loadingLabel: 'Carregando novos no período',
    errorMessage: 'Não foi possível carregar os novos no período',
    height: '6rem',
  });

  if (content === null && range !== null && series.data) {
    if (series.data.points.length === 0) {
      content = <EmptyState message={NO_DATA} />;
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
  }

  const scope = countryName ?? 'Mundo';
  return (
    <SectionCard titleId="period-card-title" title="Por tempo" description={scope}>
      {content}
    </SectionCard>
  );
}
