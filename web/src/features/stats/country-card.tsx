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
import { SectionCard } from '../../shared/ui/section-card';
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
    const date = (
      <p className="text-xs text-muted-foreground">{`Data: ${formatDate(country.data.date)}`}</p>
    );
    content =
      value === null ? (
        <>
          <EmptyState message="Sem dados para este país na data de referência" />
          {date}
        </>
      ) : (
        <>
          <dl className="grid gap-3">
            <div className="flex flex-col gap-1">
              <dt className="text-sm text-muted-foreground">{`Total de ${METRIC_LABELS[metric].noun}`}</dt>
              <dd className="text-xl font-semibold tabular-nums">{formatNumber(value.total)}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-sm text-muted-foreground">Participação no global</dt>
              <dd className="text-xl font-semibold tabular-nums">
                {formatPercent(comparison.share)}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-sm text-muted-foreground">Posição</dt>
              <dd className="text-xl font-semibold tabular-nums">
                {formatRank(comparison.rank, comparison.rankedCount)}
              </dd>
            </div>
          </dl>
          {date}
        </>
      );
  }

  const title = code !== null && country.data ? country.data.country.name : 'Por país';
  return (
    <SectionCard titleId="country-card-title" title={title}>
      {content}
    </SectionCard>
  );
}
