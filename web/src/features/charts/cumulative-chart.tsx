import { useState, type ReactNode } from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  type ChartConfig,
} from '@/components/ui/chart';
import { useCountryName, useMeta, useTimeseries } from '../../shared/api/queries';
import type { Metric } from '../../shared/api/types';
import { formatCompact, formatDate, formatNumber } from '../../shared/format/format';
import type { Period } from '../../shared/period/period';
import { EmptyState } from '../../shared/ui/empty-state';
import { SectionCard } from '../../shared/ui/section-card';
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
  const world = useTimeseries(null, metric, ranges?.fetch ?? null, 'day');
  const country = useTimeseries(
    code,
    metric,
    code === null ? null : (ranges?.fetch ?? null),
    'day',
  );
  const countryName = useCountryName(code);

  let content: ReactNode = seriesFallback({
    meta,
    ready: ranges !== null,
    series: code === null ? [world] : [world, country],
    loadingLabel: 'Carregando o crescimento acumulado',
    errorMessage: 'Não foi possível carregar o crescimento acumulado',
  });

  if (content === null && ranges && world.data) {
    const { visible } = ranges;
    const worldPoints = world.data.points.filter((point) => point.date >= visible.from);
    const countryPoints =
      code === null
        ? null
        : (country.data?.points ?? []).filter((point) => point.date >= visible.from);

    if (worldPoints.length === 0 || countryPoints?.length === 0) {
      content = <EmptyState message={NO_DATA} />;
    } else {
      const rows = cumulativeRows(worldPoints, countryPoints, scale);
      const worldByDate = new Map(worldPoints.map((point) => [point.date, point.total]));
      const countryByDate = new Map(
        (countryPoints ?? []).map((point) => [point.date, point.total]),
      );
      const ends = [
        countryName !== null && countryPoints !== null
          ? seriesEnds(countryName, countryPoints)
          : null,
        seriesEnds(WORLD, worldPoints),
      ].filter((item): item is SeriesEnds => item !== null);
      const config = {
        country: { label: countryName ?? 'País', color: 'var(--chart-5)' },
        world: { label: WORLD, color: 'var(--chart-2)' },
      } satisfies ChartConfig;

      content = (
        <>
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
              {countryPoints !== null && (
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
          <p className="text-xs text-muted-foreground">
            {cumulativeSummary(metric, visible, ends)}
          </p>
          {visible.clamped && (
            <p className="text-xs text-muted-foreground">
              {`Dados a partir de ${formatDate(visible.from)}`}
            </p>
          )}
        </>
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
