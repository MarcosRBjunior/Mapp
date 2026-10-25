import type { ReactNode } from 'react';
import { useMeta } from '../api/queries';
import { formatDate } from '../format/format';
import { ErrorState } from './error-state';
import { Skeleton } from './skeleton';

export function DataBanner() {
  const meta = useMeta();

  let content: ReactNode;
  if (meta.isPending) {
    content = <Skeleton label="Carregando data de referência" />;
  } else if (meta.isError) {
    content = (
      <ErrorState
        message="Não foi possível carregar a data de referência"
        onRetry={() => void meta.refetch()}
      />
    );
  } else {
    const { referenceDate, source } = meta.data;
    const period = referenceDate
      ? `Dados históricos até ${formatDate(referenceDate)}`
      : 'Dados ainda não carregados';
    content = <p>{`${period} · Fonte: ${source.name}`}</p>;
  }

  return (
    <section
      aria-label="Dados"
      className="sticky top-0 z-10 border-b bg-muted px-4 py-2 text-sm lg:px-6"
    >
      {content}
    </section>
  );
}
