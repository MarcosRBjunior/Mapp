import { ChoiceToggle } from '../../shared/ui/choice-toggle';
import type { Scale } from './series';

const SCALES: readonly Scale[] = ['linear', 'log'];
const SCALE_LABELS: Record<Scale, string> = { linear: 'Linear', log: 'Log' };

interface ScaleToggleProps {
  scale: Scale;
  onChange: (scale: Scale) => void;
}

export function ScaleToggle({ scale, onChange }: ScaleToggleProps) {
  return (
    <ChoiceToggle
      label="Escala"
      value={scale}
      options={SCALES}
      labels={SCALE_LABELS}
      onChange={onChange}
      size="sm"
      className="self-end"
    />
  );
}
