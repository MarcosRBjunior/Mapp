import { useRef } from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

const ARROW_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);

interface ChoiceToggleProps<T extends string> {
  label: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (value: T) => void;
  size?: 'default' | 'sm';
  className?: string;
}

export function ChoiceToggle<T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
  size,
  className,
}: ChoiceToggleProps<T>) {
  // :focus-visible is not reliable in jsdom, so arrow keys raise a flag the next focus consumes.
  const arrowKey = useRef(false);
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size={size}
      spacing={0}
      value={value}
      aria-label={label}
      className={className}
      // Capture phase: the flag must be set before Radix RovingFocus handles the key and moves focus.
      onKeyDownCapture={(event) => {
        // Tab leaves the group: never let it count as a keyboard selection.
        arrowKey.current = event.key !== 'Tab' && ARROW_KEYS.has(event.key);
      }}
      // Leaving the group drops a flag that no focus consumed (e.g. Home on the first item).
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) arrowKey.current = false;
      }}
      onPointerDown={() => {
        arrowKey.current = false;
      }}
      // Radix sends '' when the active item is clicked again; keep the current value.
      onValueChange={(next) => {
        const option = options.find((item) => item === next);
        if (option) onChange(option);
      }}
    >
      {options.map((item) => (
        <ToggleGroupItem
          key={item}
          value={item}
          // Arrow-key focus selects (radio-button pattern); a click already selects via onValueChange.
          onFocus={() => {
            const byArrow = arrowKey.current;
            arrowKey.current = false;
            if (byArrow && item !== value) onChange(item);
          }}
        >
          {labels[item]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
