import type { Metric } from '../api/types';
import { METRICS, METRIC_LABELS } from '../format/format';
import { ChoiceToggle } from './choice-toggle';

interface MetricToggleProps {
  metric: Metric;
  onChange: (metric: Metric) => void;
}

const TITLES: Record<Metric, string> = {
  cases: METRIC_LABELS.cases.title,
  deaths: METRIC_LABELS.deaths.title,
};

export function MetricToggle({ metric, onChange }: MetricToggleProps) {
  return (
    <ChoiceToggle
      label="Métrica"
      value={metric}
      options={METRICS}
      labels={TITLES}
      onChange={onChange}
    />
  );
}
