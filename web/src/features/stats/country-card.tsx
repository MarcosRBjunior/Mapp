import type { ReactNode } from 'react';
import { isApiError } from '../../shared/api/client';
import { useCountry } from '../../shared/api/queries';
import type { Metric } from '../../shared/api/types';
import {
  METRIC_LABELS,
  formatDate,
  formatNumber,
  formatPercent,
  formatRank,
} from '../../shared/format/format';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { Skeleton } from '../../shared/ui/skeleton';

const SELECT_MESSAGE = 'Selecione um país no mapa ou na busca';

interface CountryCardProps {
  code: string | null;
  metric: Metric;
}

export function CountryCard({ code, metric }: CountryCardProps) {
  const country = useCountry(code);

  let content: ReactNode;
  if (code === null || isApiError(country.error, 'COUNTRY_NOT_FOUND')) {
    content = <EmptyState message={SELECT_MESSAGE} />;
  } else if (country.isPending) {
    content = <Skeleton label="Carregando dados do país" height="6rem" />;
  } else if (country.isError) {
    content = isApiError(country.error, 'DATA_NOT_READY') ? (
      <EmptyState message="Dados ainda não carregados" />
    ) : (
      <ErrorState
        message="Não foi possível carregar os dados do país"
        onRetry={() => void country.refetch()}
      />
    );
  } else {
    const value = country.data[metric];
    const comparison = country.data.comparison[metric];
    const date = <p className="card-date">{`Data: ${formatDate(country.data.date)}`}</p>;
    content =
      value === null ? (
        <>
          <EmptyState message="Sem dados para este país na data de referência" />
          {date}
        </>
      ) : (
        <>
          <dl className="card-figures">
            <div>
              <dt>{`Total de ${METRIC_LABELS[metric].noun}`}</dt>
              <dd>{formatNumber(value.total)}</dd>
            </div>
            <div>
              <dt>Participação no global</dt>
              <dd>{formatPercent(comparison.share)}</dd>
            </div>
            <div>
              <dt>Posição</dt>
              <dd>{formatRank(comparison.rank, comparison.rankedCount)}</dd>
            </div>
          </dl>
          {date}
        </>
      );
  }

  const title = code !== null && country.data ? country.data.country.name : 'Por país';
  return (
    <section className="card" aria-labelledby="country-card-title">
      <h2 id="country-card-title">{title}</h2>
      {content}
    </section>
  );
}
