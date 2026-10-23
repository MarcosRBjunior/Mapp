import type { StatMetric, StatsRepository } from '../repositories/stats.repository.js';
import { sharePercent } from './comparison.js';
import type { DataStateService } from './data-state.service.js';

export interface RankingItem {
  rank: number;
  code: string;
  name: string;
  total: number;
  new: number;
  share: number | null;
}

export interface RankingsResponse {
  date: string;
  metric: StatMetric;
  rankedCount: number;
  items: RankingItem[];
}

export interface RankingsService {
  getRankings(
    metric: StatMetric,
    limit: number,
    date: string | undefined,
  ): Promise<RankingsResponse>;
}

export function createRankingsService(
  dataState: DataStateService,
  repo: StatsRepository,
): RankingsService {
  return {
    async getRankings(metric, limit, date) {
      const resolved = await dataState.resolveDate(date);
      const { sourceId } = resolved.state;
      const [rows, globalRows] = await Promise.all([
        repo.listRanking(sourceId, metric, resolved.date, limit),
        repo.findGlobalDay(sourceId, resolved.date),
      ]);
      const globalTotal = globalRows.find((row) => row.metric === metric)?.total;
      return {
        date: resolved.date,
        metric,
        rankedCount: rows[0]?.rankedCount ?? 0,
        items: rows.map((row) => ({
          rank: row.rank,
          code: row.code,
          name: row.name,
          total: row.total,
          new: row.newValue,
          share: sharePercent(row.total, globalTotal),
        })),
      };
    },
  };
}
