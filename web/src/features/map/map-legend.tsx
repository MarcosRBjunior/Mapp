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
    <div
      className="absolute bottom-6 left-2 z-[900] rounded-md bg-background/90 px-3 py-2 text-xs"
      role="group"
      aria-label={`Legenda: ${title}`}
    >
      <p className="mb-1 font-semibold">{title}</p>
      <ul className="flex items-end gap-3">
        {steps.map((step) => (
          <li key={step.value} className="flex flex-col items-center">
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
