import { Skeleton as UiSkeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface SkeletonProps {
  label: string;
  height?: string;
  className?: string;
}

export function Skeleton({ label, height = '1.5rem', className }: SkeletonProps) {
  return (
    <UiSkeleton
      role="status"
      aria-label={label}
      className={cn('w-full motion-reduce:animate-none', className)}
      style={{ height }}
    />
  );
}
