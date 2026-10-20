import { AppError } from '../lib/app-error.js';
import type { StatMetric, StatsRepository } from '../repositories/stats.repository.js';
import { compareNames, rankOf, sharePercent, type Rank } from './comparison.js';
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
      const countries = rows
        .map((row) => ({
          code: row.code,
          name: row.name,
          lat: row.lat,
          lng: row.lng,
          total: row.total,
          new: row.newValue,
        }))
        .sort((a, b) => compareNames(a.name, b.name));
      return { date: resolved.date, metric, countries };
    },

    async getCountry(code, date) {
      const resolved = await dataState.resolveDate(date);
      const country = await repo.findCountry(code);
      if (!country || country.kind !== 'country') {
        throw new AppError('COUNTRY_NOT_FOUND', 404, `country ${code} not found`, { code });
      }

      const { sourceId } = resolved.state;
      const [dayStats, globalRows] = await Promise.all([
        repo.listCountryDayStats(sourceId, resolved.date),
        repo.findGlobalDay(sourceId, resolved.date),
      ]);

      const byMetric = (metric: StatMetric) => {
        const entries = dayStats.filter((stat) => stat.metric === metric);
        const own = entries.find((stat) => stat.code === code);
        const globalTotal = globalRows.find((row) => row.metric === metric)?.total;
        return {
          value: own ? { total: own.total, new: own.newValue } : null,
          comparison: {
            share: own ? sharePercent(own.total, globalTotal) : null,
            ...rankOf(code, entries),
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
