import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { Metric } from '../api/types';
import { METRICS, METRIC_LABELS } from '../format/format';

interface MetricToggleProps {
  metric: Metric;
  onChange: (metric: Metric) => void;
}

export function MetricToggle({ metric, onChange }: MetricToggleProps) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      spacing={0}
      value={metric}
      aria-label="Métrica"
      // Radix sends '' when the active item is clicked again; keep the current metric.
      onValueChange={(value) => {
        const next = METRICS.find((item) => item === value);
        if (next) onChange(next);
      }}
    >
      {METRICS.map((item) => (
        <ToggleGroupItem key={item} value={item}>
          {METRIC_LABELS[item].title}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
