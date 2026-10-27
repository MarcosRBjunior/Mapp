import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Area, AreaChart } from 'recharts';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import { useMeta, useTimeseries } from '../../shared/api/queries';
import type { Metric } from '../../shared/api/types';
import { CUMULATIVE_LABELS } from '../../shared/format/format';
import { EmptyState } from '../../shared/ui/empty-state';
import { cumulativeSummary, seriesEnds } from './series';
import { NO_DATA, seriesFallback } from './series-fallback';

interface CountrySparklineProps {
  code: string;
  name: string;
  metric: Metric;
  // Called when the rendered content changes size, so the popup around it can re-fit.
  onLayoutChange?: () => void;
}

// The whole history by week (~165 points), whatever the period of the page.
export function CountrySparkline({ code, name, metric, onLayoutChange }: CountrySparklineProps) {
  const meta = useMeta();
  const coverage = meta.data?.coverage ?? null;
  const range = coverage ? { from: coverage.from, to: coverage.to } : null;
  const series = useTimeseries(code, metric, range, 'week');
  const queryClient = useQueryClient();
  const retry = () => {
    // A stale coverage would ask for dates out of range: refresh it, then the active series.
    void meta.refetch().then(() => queryClient.invalidateQueries({ queryKey: ['timeseries'] }));
  };

  const pointCount = series.data?.points.length ?? 0;
  useEffect(() => {
    onLayoutChange?.();
  }, [onLayoutChange, series.status, pointCount]);

  const fallback = seriesFallback({
    meta,
    onRetry: retry,
    ready: range !== null,
    series: [series],
    loadingLabel: 'Carregando a série do país',
    errorMessage: 'Não foi possível carregar a série',
    height: '4rem',
  });
  if (fallback !== null) return <div className="w-56">{fallback}</div>;

  const points = series.data?.points ?? [];
  const ends = seriesEnds(name, points);
  if (range === null || ends === null) {
    return (
      <div className="w-56">
        <EmptyState message={NO_DATA} />
      </div>
    );
  }
  const config = {
    total: { label: CUMULATIVE_LABELS[metric], color: 'var(--chart-5)' },
  } satisfies ChartConfig;

  return (
    <figure className="m-0 flex w-56 flex-col gap-1">
      <ChartContainer config={config} className="aspect-auto h-16 w-full" aria-hidden="true">
        <AreaChart
          accessibilityLayer={false}
          data={points}
          margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
        >
          <Area
            dataKey="total"
            type="monotone"
            stroke="var(--color-total)"
            fill="var(--color-total)"
            fillOpacity={0.15}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartContainer>
      <figcaption className="text-xs text-muted-foreground">
        {cumulativeSummary(metric, range, [ends])}
      </figcaption>
    </figure>
  );
}
