import type { ReactNode } from 'react';
import { isApiError } from '../../shared/api/client';
import { useGlobal } from '../../shared/api/queries';
import { METRICS, METRIC_LABELS, formatDate, formatNumber } from '../../shared/format/format';
import { SectionCard } from '../../shared/ui/section-card';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { Skeleton } from '../../shared/ui/skeleton';

export function GlobalCard() {
  const global = useGlobal();

  let content: ReactNode;
  if (global.isPending) {
    content = <Skeleton label="Carregando números globais" height="6rem" />;
  } else if (global.isError) {
    content = isApiError(global.error, 'DATA_NOT_READY') ? (
      <EmptyState message="Dados ainda não carregados" />
    ) : (
      <ErrorState
        message="Não foi possível carregar os números globais"
        onRetry={() => void global.refetch()}
      />
    );
  } else {
    const data = global.data;
    content = (
      <>
        <dl className="grid grid-cols-2 gap-4">
          {METRICS.map((metric) => (
            <div key={metric} className="flex flex-col gap-1">
              <dt className="text-sm text-muted-foreground">{METRIC_LABELS[metric].title}</dt>
              <dd className="text-xl font-semibold tabular-nums">{`Total: ${formatNumber(data[metric].total)}`}</dd>
              <dd className="text-sm text-muted-foreground tabular-nums">{`Novos no dia: ${formatNumber(data[metric].new)}`}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">{`Data: ${formatDate(data.date)}`}</p>
      </>
    );
  }

  return (
    <SectionCard titleId="global-card-title" title="Geral">
      {content}
    </SectionCard>
  );
}
