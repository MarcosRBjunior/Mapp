import type { Metric } from '../api/types';
import { METRIC_LABELS } from '../format/format';

const METRICS: readonly Metric[] = ['cases', 'deaths'];

interface MetricToggleProps {
  metric: Metric;
  onChange: (metric: Metric) => void;
}

export function MetricToggle({ metric, onChange }: MetricToggleProps) {
  return (
    <div className="metric-toggle" role="group" aria-label="Métrica">
      {METRICS.map((item) => (
        <button
          key={item}
          type="button"
          aria-pressed={metric === item}
          onClick={() => onChange(item)}
        >
          {METRIC_LABELS[item].title}
        </button>
      ))}
    </div>
  );
}
