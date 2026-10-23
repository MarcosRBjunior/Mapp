import { AppError } from '../lib/app-error.js';
import type {
  Granularity,
  SeriesPointRow,
  StatMetric,
  StatsRepository,
} from '../repositories/stats.repository.js';
import type { DataStateService } from './data-state.service.js';

export interface TimeseriesQuery {
  metric: StatMetric;
  from?: string;
  to?: string;
  granularity: Granularity;
}

export interface TimeseriesPoint {
  date: string;
  total: number;
  new: number;
}

export interface GlobalTimeseriesResponse {
  metric: StatMetric;
  granularity: Granularity;
  from: string;
  to: string;
  points: TimeseriesPoint[];
}

export interface CountryTimeseriesResponse extends GlobalTimeseriesResponse {
  country: { code: string; name: string };
}

export interface TimeseriesService {
  getGlobalSeries(query: TimeseriesQuery): Promise<GlobalTimeseriesResponse>;
  getCountrySeries(code: string, query: TimeseriesQuery): Promise<CountryTimeseriesResponse>;
}

const toPoint = (row: SeriesPointRow): TimeseriesPoint => ({
  date: row.date,
  total: row.total,
  new: row.newValue,
});

export function createTimeseriesService(
  dataState: DataStateService,
  repo: StatsRepository,
): TimeseriesService {
  return {
    async getGlobalSeries(query) {
      const { state, from, to } = await dataState.resolveRange(query.from, query.to);
      const rows = await repo.listGlobalSeries(state.sourceId, query.metric, {
        from,
        to,
        granularity: query.granularity,
      });
      return {
        metric: query.metric,
        granularity: query.granularity,
        from,
        to,
        points: rows.map(toPoint),
      };
    },

    async getCountrySeries(code, query) {
      const country = await repo.findCountry(code);
      if (!country || country.kind !== 'country') {
        throw new AppError('COUNTRY_NOT_FOUND', 404, `country ${code} not found`, { code });
      }
      const { state, from, to } = await dataState.resolveRange(query.from, query.to);
      const rows = await repo.listCountrySeries(state.sourceId, code, query.metric, {
        from,
        to,
        granularity: query.granularity,
      });
      return {
        country: { code: country.code, name: country.name },
        metric: query.metric,
        granularity: query.granularity,
        from,
        to,
        points: rows.map(toPoint),
      };
    },
  };
}
