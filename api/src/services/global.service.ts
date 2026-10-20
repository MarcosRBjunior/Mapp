import type { StatsRepository } from '../repositories/stats.repository.js';
import type { DataStateService } from './data-state.service.js';

export interface MetricValue {
  total: number;
  new: number;
}

export interface GlobalResponse {
  date: string;
  cases: MetricValue;
  deaths: MetricValue;
  countryCount: number;
}

export interface GlobalService {
  getGlobal(date: string | undefined): Promise<GlobalResponse>;
}

export function createGlobalService(
  dataState: DataStateService,
  repo: StatsRepository,
): GlobalService {
  return {
    async getGlobal(date) {
      const resolved = await dataState.resolveDate(date);
      const rows = await repo.findGlobalDay(resolved.state.sourceId, resolved.date);
      const cases = rows.find((row) => row.metric === 'cases');
      const deaths = rows.find((row) => row.metric === 'deaths');
      if (!cases || !deaths) throw new Error(`global view has no rows for ${resolved.date}`);
      return {
        date: resolved.date,
        cases: { total: cases.total, new: cases.newValue },
        deaths: { total: deaths.total, new: deaths.newValue },
        countryCount: cases.countryCount,
      };
    },
  };
}
