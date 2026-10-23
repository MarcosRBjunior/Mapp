import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { PERIODS, PERIOD_LABELS, type Period } from '../period/period';

interface PeriodToggleProps {
  period: Period;
  onChange: (period: Period) => void;
}

export function PeriodToggle({ period, onChange }: PeriodToggleProps) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      spacing={0}
      value={period}
      aria-label="Período"
      onValueChange={(value) => {
        const next = PERIODS.find((item) => item === value);
        if (next) onChange(next);
      }}
    >
      {PERIODS.map((item) => (
        <ToggleGroupItem key={item} value={item}>
          {PERIOD_LABELS[item]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
