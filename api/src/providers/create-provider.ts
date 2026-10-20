import type { SyncEnv } from '../config/sync-env.js';
import { createApiNinjasProvider } from './api-ninjas/api-ninjas.provider.js';
import type { CovidProvider, FetchLike } from './covid-provider.js';

export function createProvider(
  env: Pick<SyncEnv, 'DATA_PROVIDER' | 'API_NINJAS_KEY'>,
  fetch: FetchLike,
): CovidProvider {
  switch (env.DATA_PROVIDER) {
    case 'api_ninjas':
      if (env.API_NINJAS_KEY === undefined) {
        throw new Error('API_NINJAS_KEY is required when DATA_PROVIDER=api_ninjas');
      }
      return createApiNinjasProvider({ apiKey: env.API_NINJAS_KEY, fetch });
    case 'jhu_csv':
    case 'apify':
      throw new Error(`DATA_PROVIDER=${env.DATA_PROVIDER} is not implemented yet`);
  }
}
