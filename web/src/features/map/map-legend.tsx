import type { CountryListItem, Metric } from '../../shared/api/types';
import { METRIC_LABELS, formatNumber } from '../../shared/format/format';
import type { MapView } from '../../shared/url/use-map-view';
import { choroplethBreaks, choroplethLabels } from './choropleth-scale';
import { useMapColors } from './map-colors';
import { legendSteps, maxTotal } from './marker-scale';

interface MapLegendProps {
  countries: readonly CountryListItem[];
  metric: Metric;
  view: MapView;
}

const BOX = 'absolute bottom-6 left-2 z-[900] rounded-md bg-background/90 px-3 py-2 text-xs';

export function MapLegend({ countries, metric, view }: MapLegendProps) {
  const colors = useMapColors();
  const max = maxTotal(countries);
  const title = `Total de ${METRIC_LABELS[metric].noun}`;

  if (view === 'choropleth') {
    const labels = choroplethLabels(choroplethBreaks(max));
    const items = [
      ...labels.map((label, index) => ({ label, color: colors.ramp[metric][index] })),
      { label: 'Sem dados', color: colors.noData },
    ];
    return (
      <div className={BOX} role="group" aria-label={`Legenda: ${title}`}>
        <p className="mb-1 font-semibold">{title}</p>
        <ul className="flex flex-col gap-0.5">
          {items.map((item, index) => (
            <li key={index} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block size-3 rounded-sm border border-border"
                style={{ backgroundColor: item.color }}
              />
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const steps = legendSteps(max);
  if (steps.length === 0) return null;

  return (
    <div className={BOX} role="group" aria-label={`Legenda: ${title}`}>
      <p className="mb-1 font-semibold">{title}</p>
      <ul className="flex items-end gap-3">
        {steps.map((step) => (
          <li key={step.value} className="flex flex-col items-center">
            <svg width={step.radius * 2 + 2} height={step.radius * 2 + 2} aria-hidden="true">
              <circle
                cx={step.radius + 1}
                cy={step.radius + 1}
                r={step.radius}
                fill={colors.metric[metric]}
                fillOpacity={0.6}
                stroke={colors.markerOutline}
              />
            </svg>
            <span>{formatNumber(step.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
