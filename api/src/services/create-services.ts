import type { DataProvider } from '../config/env.js';
import type { ReadRepositories } from '../repositories/read-repositories.js';
import { createCountriesService, type CountriesService } from './countries.service.js';
import { createDataStateService, type DataStateService } from './data-state.service.js';
import { createGlobalService, type GlobalService } from './global.service.js';
import { createRankingsService, type RankingsService } from './rankings.service.js';
import { createTimeseriesService, type TimeseriesService } from './timeseries.service.js';
import { createMetaService, type MetaService } from './meta.service.js';

export interface Services {
  dataState: DataStateService;
  meta: MetaService;
  global: GlobalService;
  countries: CountriesService;
  rankings: RankingsService;
  timeseries: TimeseriesService;
}

export function createServices(repos: ReadRepositories, sourceCode: DataProvider): Services {
  const dataState = createDataStateService(repos.dataState, sourceCode);
  return {
    dataState,
    meta: createMetaService(dataState, repos.meta),
    global: createGlobalService(dataState, repos.stats),
    countries: createCountriesService(dataState, repos.stats),
    rankings: createRankingsService(dataState, repos.stats),
    timeseries: createTimeseriesService(dataState, repos.stats),
  };
}
