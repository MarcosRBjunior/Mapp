import { useMemo, type ReactNode } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  type ChartConfig,
} from '@/components/ui/chart';
import { useCountryName, useChartSeries, useMeta } from '../../shared/api/queries';
import { useSeriesRetry } from '../../shared/api/use-series-retry';
import type { Metric } from '../../shared/api/types';
import { NEW_LABELS, formatCompact, formatDate, formatNumber } from '../../shared/format/format';
import type { Period } from '../../shared/period/period';
import { EmptyState } from '../../shared/ui/empty-state';
import { SectionCard } from '../../shared/ui/section-card';
import { ChartContent } from './chart-content';
import { chartRanges, dailyNewRows, dailyNewSummary } from './series';
import { NO_DATA, seriesFallback } from './series-fallback';
import { SeriesTooltip } from './series-tooltip';

const AVERAGE_LABEL = 'Média de 7 dias';

interface DailyNewChartProps {
  code: string | null;
  metric: Metric;
  period: Period;
}

export function DailyNewChart({ code, metric, period }: DailyNewChartProps) {
  const meta = useMeta();
  const coverage = meta.data?.coverage ?? null;
  const ranges = coverage ? chartRanges(period, coverage) : null;
  const series = useChartSeries(code, metric, ranges);
  const place = useCountryName(code) ?? 'Mundo';
  const retry = useSeriesRetry({ queryKey: ['chart-series'] });

  // All from the range that produced the data, which may be the previous period's.
  const data = series.data;
  const model = useMemo(() => {
    if (!data) return null;
    const rows = dailyNewRows(data.points, data.visible.from);
    return {
      rows,
      byDate: new Map(rows.map((row) => [row.date, row])),
      summary: dailyNewSummary(metric, place, data.visible, rows),
    };
  }, [data, metric, place]);
  const config = useMemo(
    () =>
      ({
        bar: { label: NEW_LABELS[metric], color: 'var(--chart-2)' },
        average: { label: AVERAGE_LABEL, color: 'var(--chart-5)' },
      }) satisfies ChartConfig,
    [metric],
  );

  let content: ReactNode = seriesFallback({
    meta,
    onRetry: retry,
    ready: ranges !== null,
    series: [series],
    loadingLabel: 'Carregando os novos por dia',
    errorMessage: 'Não foi possível carregar os novos por dia',
  });

  if (content === null && data && model) {
    const { visible } = data;
    const { rows, byDate } = model;
    if (rows.length === 0) {
      content = <EmptyState message={NO_DATA} />;
    } else {
      content = (
        <ChartContent busy={series.isPlaceholderData}>
          <ChartContainer config={config} className="aspect-auto h-60 w-full" aria-hidden="true">
            <ComposedChart
              accessibilityLayer={false}
              data={rows}
              margin={{ top: 8, left: 4, right: 12 }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                minTickGap={32}
                tickFormatter={(value: string) => formatDate(value)}
              />
              <YAxis
                domain={[0, 'auto']}
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={(value: number) => formatCompact(value)}
              />
              <ChartTooltip
                content={({ active, label }) => (
                  <SeriesTooltip
                    active={active}
                    label={label}
                    lines={(date) => {
                      const row = byDate.get(date);
                      return row
                        ? [
                            { name: NEW_LABELS[metric], value: formatNumber(row.value) },
                            { name: AVERAGE_LABEL, value: formatNumber(row.averageValue) },
                          ]
                        : null;
                    }}
                  />
                )}
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="bar" fill="var(--color-bar)" isAnimationActive={false} />
              <Line
                dataKey="average"
                type="monotone"
                stroke="var(--color-average)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ChartContainer>
          <p className="text-xs text-muted-foreground">{model.summary}</p>
          {visible.clamped && (
            <p className="text-xs text-muted-foreground">
              {`Dados a partir de ${formatDate(visible.from)}`}
            </p>
          )}
        </ChartContent>
      );
    }
  }

  return (
    <SectionCard titleId="daily-new-chart-title" title="Novos por dia" description={place}>
      {content}
    </SectionCard>
  );
}
