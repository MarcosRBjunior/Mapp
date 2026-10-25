import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { Scale } from './series';

const SCALES: readonly Scale[] = ['linear', 'log'];
const SCALE_LABELS: Record<Scale, string> = { linear: 'Linear', log: 'Log' };

interface ScaleToggleProps {
  scale: Scale;
  onChange: (scale: Scale) => void;
}

export function ScaleToggle({ scale, onChange }: ScaleToggleProps) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      spacing={0}
      value={scale}
      aria-label="Escala"
      className="self-end"
      // Radix sends '' when the active item is clicked again; keep the current scale.
      onValueChange={(value) => {
        const next = SCALES.find((item) => item === value);
        if (next) onChange(next);
      }}
    >
      {SCALES.map((item) => (
        <ToggleGroupItem key={item} value={item}>
          {SCALE_LABELS[item]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
