import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Keeps the previous period on screen, dimmed, while the next one loads.
export function ChartContent({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <div
      aria-busy={busy ? true : undefined}
      className={cn(
        'flex flex-col gap-3 transition-opacity motion-reduce:transition-none',
        busy && 'opacity-60',
      )}
    >
      {children}
    </div>
  );
}
