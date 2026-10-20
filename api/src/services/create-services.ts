import type { DataProvider } from '../config/env.js';
import type { ReadRepositories } from '../repositories/read-repositories.js';
import { createCountriesService, type CountriesService } from './countries.service.js';
import { createDataStateService, type DataStateService } from './data-state.service.js';
import { createGlobalService, type GlobalService } from './global.service.js';
import { createMetaService, type MetaService } from './meta.service.js';

export interface Services {
  dataState: DataStateService;
  meta: MetaService;
  global: GlobalService;
  countries: CountriesService;
}

export function createServices(repos: ReadRepositories, sourceCode: DataProvider): Services {
  const dataState = createDataStateService(repos.dataState, sourceCode);
  return {
    dataState,
    meta: createMetaService(dataState, repos.meta),
    global: createGlobalService(dataState, repos.stats),
    countries: createCountriesService(dataState, repos.stats),
  };
}
