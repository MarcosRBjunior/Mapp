import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { isApiError } from '../../shared/api/client';
import { useRankings } from '../../shared/api/queries';
import type { Metric } from '../../shared/api/types';
import { METRIC_LABELS, formatDate, formatNumber, formatPercent } from '../../shared/format/format';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { SectionCard } from '../../shared/ui/section-card';
import { Skeleton } from '../../shared/ui/skeleton';

const RANKING_LIMIT = 10;
const TITLE_ID = 'ranking-title';

interface RankingTableProps {
  metric: Metric;
  selectedCode: string | null;
}

export function RankingTable({ metric, selectedCode }: RankingTableProps) {
  const ranking = useRankings(metric, RANKING_LIMIT);
  const location = useLocation();
  const noun = METRIC_LABELS[metric].noun;

  let content: ReactNode;
  if (ranking.isPending) {
    content = <Skeleton label="Carregando ranking" height="16rem" />;
  } else if (ranking.isError) {
    content = isApiError(ranking.error, 'DATA_NOT_READY') ? (
      <EmptyState message="Dados ainda não carregados" />
    ) : (
      <ErrorState
        message="Não foi possível carregar o ranking"
        onRetry={() => void ranking.refetch()}
      />
    );
  } else if (ranking.data.items.length === 0) {
    content = <EmptyState message="Sem dados na data de referência" />;
  } else {
    content = (
      <Table aria-labelledby={TITLE_ID}>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Posição</TableHead>
            <TableHead>País</TableHead>
            <TableHead className="text-right">{`Total de ${noun}`}</TableHead>
            <TableHead className="text-right">Participação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ranking.data.items.map((item) => {
            const selected = item.code === selectedCode;
            return (
              <TableRow key={item.code} data-state={selected ? 'selected' : undefined}>
                <TableCell className="tabular-nums">{item.rank}</TableCell>
                <TableCell>
                  <Link
                    to={{ pathname: `/paises/${item.code}`, search: location.search }}
                    aria-current={selected ? 'page' : undefined}
                    className="font-medium underline-offset-4 hover:underline aria-[current=page]:underline"
                  >
                    {item.name}
                  </Link>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(item.total)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatPercent(item.share)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  }

  const title = ranking.data
    ? `Top 10 — ${noun} em ${formatDate(ranking.data.date)}`
    : `Top 10 — ${noun}`;
  return (
    <SectionCard titleId={TITLE_ID} title={title}>
      {content}
    </SectionCard>
  );
}
