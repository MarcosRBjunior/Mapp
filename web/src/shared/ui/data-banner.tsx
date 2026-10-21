import { useMeta } from '../api/queries';
import { formatDate } from '../format/format';
import { ErrorState } from './error-state';
import { Skeleton } from './skeleton';

export function DataBanner() {
  const meta = useMeta();

  if (meta.isPending) {
    return (
      <div className="data-banner">
        <Skeleton label="Carregando data de referência" />
      </div>
    );
  }
  if (meta.isError) {
    return (
      <div className="data-banner">
        <ErrorState
          message="Não foi possível carregar a data de referência"
          onRetry={() => void meta.refetch()}
        />
      </div>
    );
  }

  const { referenceDate, source } = meta.data;
  const period = referenceDate
    ? `Dados históricos até ${formatDate(referenceDate)}`
    : 'Dados ainda não carregados';
  return <p className="data-banner">{`${period} · Fonte: ${source.name}`}</p>;
}
