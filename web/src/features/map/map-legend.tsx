import type { CountryListItem, Metric } from '../../shared/api/types';
import { METRIC_LABELS, formatNumber } from '../../shared/format/format';
import { METRIC_COLORS, legendSteps, maxTotal } from './marker-scale';

interface MapLegendProps {
  countries: readonly CountryListItem[];
  metric: Metric;
}

export function MapLegend({ countries, metric }: MapLegendProps) {
  const steps = legendSteps(maxTotal(countries));
  if (steps.length === 0) return null;
  const title = `Total de ${METRIC_LABELS[metric].noun}`;

  return (
    <div className="map-legend" role="group" aria-label={`Legenda: ${title}`}>
      <p className="map-legend-title">{title}</p>
      <ul>
        {steps.map((step) => (
          <li key={step.value}>
            <svg width={step.radius * 2 + 2} height={step.radius * 2 + 2} aria-hidden="true">
              <circle
                cx={step.radius + 1}
                cy={step.radius + 1}
                r={step.radius}
                fill={METRIC_COLORS[metric]}
                fillOpacity={0.6}
                stroke="#ffffff"
              />
            </svg>
            <span>{formatNumber(step.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
