import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  type ChartConfig,
} from '@/components/ui/chart';
import { useChartSeries, useCountryName, useMeta } from '../../shared/api/queries';
import type { Metric } from '../../shared/api/types';
import { formatCompact, formatDate, formatNumber } from '../../shared/format/format';
import type { Period } from '../../shared/period/period';
import { EmptyState } from '../../shared/ui/empty-state';
import { SectionCard } from '../../shared/ui/section-card';
import { Skeleton } from '../../shared/ui/skeleton';
import { ChartContent } from './chart-content';
import { ScaleToggle } from './scale-toggle';
import {
  chartRanges,
  cumulativeRows,
  cumulativeSummary,
  seriesEnds,
  type Scale,
  type SeriesEnds,
} from './series';
import { NO_DATA, seriesFallback } from './series-fallback';
import { SeriesTooltip } from './series-tooltip';

const WORLD = 'Mundo';

interface CumulativeChartProps {
  code: string | null;
  metric: Metric;
  period: Period;
}

export function CumulativeChart({ code, metric, period }: CumulativeChartProps) {
  const [scale, setScale] = useState<Scale>('linear');
  const meta = useMeta();
  const coverage = meta.data?.coverage ?? null;
  const ranges = coverage ? chartRanges(period, coverage) : null;
  // The daily chart uses the same range, so the world series is fetched once for both.
  const world = useChartSeries(null, metric, ranges);
  const country = useChartSeries(code, metric, code === null ? null : ranges);
  const countryName = useCountryName(code);
  const queryClient = useQueryClient();
  const retry = () => {
    // A stale coverage would ask for dates out of range: refresh it, then the active series.
    void meta.refetch().then(() => queryClient.invalidateQueries({ queryKey: ['chart-series'] }));
  };

  // All from the range that produced the data, which may be the previous period's.
  const worldData = world.data;
  const countryData = code === null ? undefined : country.data;
  const model = useMemo(() => {
    if (!worldData) return null;
    const { visible } = worldData;
    const worldPoints = worldData.points.filter((point) => point.date >= visible.from);
    const countryPoints =
      code === null
        ? null
        : (countryData?.points ?? []).filter((point) => point.date >= visible.from);
    if (worldPoints.length === 0 || countryPoints?.length === 0) return { empty: true as const };
    const ends = [
      countryName !== null && countryPoints !== null
        ? seriesEnds(countryName, countryPoints)
        : null,
      seriesEnds(WORLD, worldPoints),
    ].filter((item): item is SeriesEnds => item !== null);
    return {
      empty: false as const,
      hasCountry: countryPoints !== null,
      rows: cumulativeRows(worldPoints, countryPoints, scale),
      worldByDate: new Map(worldPoints.map((point) => [point.date, point.total])),
      countryByDate: new Map((countryPoints ?? []).map((point) => [point.date, point.total])),
      summary: cumulativeSummary(metric, visible, ends),
    };
  }, [worldData, countryData, code, scale, countryName, metric]);
  const config = useMemo(
    () =>
      ({
        country: { label: countryName ?? 'País', color: 'var(--chart-5)' },
        world: { label: WORLD, color: 'var(--chart-2)' },
      }) satisfies ChartConfig,
    [countryName],
  );

  let content: ReactNode = seriesFallback({
    meta,
    onRetry: retry,
    ready: ranges !== null,
    series: code === null ? [world] : [world, country],
    loadingLabel: 'Carregando o crescimento acumulado',
    errorMessage: 'Não foi possível carregar o crescimento acumulado',
  });

  // World and country have their own placeholder state: never draw one period with the other's.
  const mixed =
    worldData !== undefined &&
    countryData !== undefined &&
    (countryData.visible.from !== worldData.visible.from ||
      countryData.visible.to !== worldData.visible.to);
  if (content === null && mixed) {
    content = <Skeleton label="Carregando o crescimento acumulado" height="15rem" />;
  }

  if (content === null && worldData && model) {
    const { visible } = worldData;
    if (model.empty) {
      content = <EmptyState message={NO_DATA} />;
    } else {
      const { rows, worldByDate, countryByDate, hasCountry } = model;
      content = (
        <ChartContent
          busy={world.isPlaceholderData || (code !== null && country.isPlaceholderData)}
        >
          <ScaleToggle scale={scale} onChange={setScale} />
          <ChartContainer config={config} className="aspect-auto h-60 w-full" aria-hidden="true">
            <LineChart
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
                scale={scale}
                domain={scale === 'log' ? ['auto', 'auto'] : [0, 'auto']}
                allowDataOverflow
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
                    lines={(date) => [
                      ...(countryName === null
                        ? []
                        : [{ name: countryName, value: formatNumber(countryByDate.get(date)) }]),
                      { name: WORLD, value: formatNumber(worldByDate.get(date)) },
                    ]}
                  />
                )}
              />
              <ChartLegend content={<ChartLegendContent />} />
              {hasCountry && (
                <Line
                  dataKey="country"
                  type="monotone"
                  stroke="var(--color-country)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              )}
              <Line
                dataKey="world"
                type="monotone"
                stroke="var(--color-world)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
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
    <SectionCard
      titleId="cumulative-chart-title"
      title="Crescimento acumulado"
      description={countryName === null ? WORLD : `${countryName} × ${WORLD}`}
    >
      {content}
    </SectionCard>
  );
}
