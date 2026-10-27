import { PERIODS, PERIOD_LABELS, type Period } from '../period/period';
import { ChoiceToggle } from './choice-toggle';

interface PeriodToggleProps {
  period: Period;
  onChange: (period: Period) => void;
}

export function PeriodToggle({ period, onChange }: PeriodToggleProps) {
  return (
    <ChoiceToggle
      label="Período"
      value={period}
      options={PERIODS}
      labels={PERIOD_LABELS}
      onChange={onChange}
    />
  );
}
