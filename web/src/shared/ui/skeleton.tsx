interface SkeletonProps {
  label: string;
  height?: string;
}

export function Skeleton({ label, height = '1.5rem' }: SkeletonProps) {
  return <div className="skeleton" role="status" aria-label={label} style={{ height }} />;
}
