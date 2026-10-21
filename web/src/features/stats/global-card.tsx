import type { ReactNode } from 'react';
import { isApiError } from '../../shared/api/client';
import { useGlobal } from '../../shared/api/queries';
import type { Metric } from '../../shared/api/types';
import { METRIC_LABELS, formatDate, formatNumber } from '../../shared/format/format';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { Skeleton } from '../../shared/ui/skeleton';

const METRICS: readonly Metric[] = ['cases', 'deaths'];

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
        <dl className="card-figures">
          {METRICS.map((metric) => (
            <div key={metric}>
              <dt>{METRIC_LABELS[metric].title}</dt>
              <dd>{`Total: ${formatNumber(data[metric].total)}`}</dd>
              <dd>{`Novos no dia: ${formatNumber(data[metric].new)}`}</dd>
            </div>
          ))}
        </dl>
        <p className="card-date">{`Data: ${formatDate(data.date)}`}</p>
      </>
    );
  }

  return (
    <section className="card" aria-labelledby="global-card-title">
      <h2 id="global-card-title">Geral</h2>
      {content}
    </section>
  );
}
