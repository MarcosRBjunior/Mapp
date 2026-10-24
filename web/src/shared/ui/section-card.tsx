import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface SectionCardProps {
  titleId: string;
  title: string;
  description?: string;
  className?: string;
  children: ReactNode;
}

export function SectionCard({
  titleId,
  title,
  description,
  className,
  children,
}: SectionCardProps) {
  return (
    <Card role="region" aria-labelledby={titleId} className={cn('@container/card', className)}>
      <CardHeader>
        <h2 id={titleId} className="font-heading text-base leading-snug font-medium">
          {title}
        </h2>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">{children}</CardContent>
    </Card>
  );
}
