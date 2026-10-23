import { AppError } from '../lib/app-error.js';
import type { StatMetric, StatsRepository } from '../repositories/stats.repository.js';
import { sharePercent, type Rank } from './comparison.js';
import type { DataStateService } from './data-state.service.js';
import type { MetricValue } from './global.service.js';

export interface CountryListItem {
  code: string;
  name: string;
  lat: number | null;
  lng: number | null;
  total: number | null;
  new: number | null;
}

export interface CountriesListResponse {
  date: string;
  metric: StatMetric;
  countries: CountryListItem[];
}

export interface MetricComparison extends Rank {
  share: number | null;
}

export interface CountryDetailResponse {
  date: string;
  country: {
    code: string;
    name: string;
    lat: number | null;
    lng: number | null;
    population: number | null;
  };
  cases: MetricValue | null;
  deaths: MetricValue | null;
  comparison: Record<StatMetric, MetricComparison>;
}

export interface CountriesService {
  listCountries(metric: StatMetric, date: string | undefined): Promise<CountriesListResponse>;
  getCountry(code: string, date: string | undefined): Promise<CountryDetailResponse>;
}

export function createCountriesService(
  dataState: DataStateService,
  repo: StatsRepository,
): CountriesService {
  return {
    async listCountries(metric, date) {
      const resolved = await dataState.resolveDate(date);
      const rows = await repo.listCountryValues(resolved.state.sourceId, metric, resolved.date);
      const countries = rows.map((row) => ({
        code: row.code,
        name: row.name,
        lat: row.lat,
        lng: row.lng,
        total: row.total,
        new: row.newValue,
      }));
      return { date: resolved.date, metric, countries };
    },

    async getCountry(code, date) {
      const country = await repo.findCountry(code);
      if (!country || country.kind !== 'country') {
        throw new AppError('COUNTRY_NOT_FOUND', 404, `country ${code} not found`, { code });
      }
      const resolved = await dataState.resolveDate(date);

      const { sourceId } = resolved.state;
      const [ranks, globalRows] = await Promise.all([
        repo.findCountryRanks(sourceId, resolved.date, code),
        repo.findGlobalDay(sourceId, resolved.date),
      ]);

      const byMetric = (metric: StatMetric) => {
        const row = ranks.find((entry) => entry.metric === metric);
        const globalTotal = globalRows.find((entry) => entry.metric === metric)?.total;
        const value =
          row && row.total !== null && row.newValue !== null
            ? { total: row.total, new: row.newValue }
            : null;
        return {
          value,
          comparison: {
            share: value ? sharePercent(value.total, globalTotal) : null,
            rank: row?.rank ?? null,
            rankedCount: row?.rankedCount ?? 0,
          },
        };
      };
      const cases = byMetric('cases');
      const deaths = byMetric('deaths');

      return {
        date: resolved.date,
        country: {
          code: country.code,
          name: country.name,
          lat: country.lat,
          lng: country.lng,
          population: country.population,
        },
        cases: cases.value,
        deaths: deaths.value,
        comparison: { cases: cases.comparison, deaths: deaths.comparison },
      };
    },
  };
}
