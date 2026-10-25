import { formatDate } from '../../shared/format/format';

interface SeriesTooltipProps {
  active?: boolean;
  label?: unknown;
  lines: (date: string) => { name: string; value: string }[] | null;
}

// Recharts passes the X value (the date) as the label; the lines come from the raw data, so
// the tooltip shows what the source sent even where the chart draws something else (RN-07).
export function SeriesTooltip({ active, label, lines }: SeriesTooltipProps) {
  if (!active || typeof label !== 'string') return null;
  const items = lines(label);
  if (!items) return null;
  return (
    <div className="grid min-w-36 gap-1 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <p className="font-medium">{formatDate(label)}</p>
      {items.map((item) => (
        <p key={item.name} className="flex justify-between gap-4">
          <span className="text-muted-foreground">{item.name}</span>
          <span className="font-mono tabular-nums">{item.value}</span>
        </p>
      ))}
    </div>
  );
}
