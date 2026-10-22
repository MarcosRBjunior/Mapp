import type { SyncEnv } from '../config/sync-env.js';
import { apiNinjasFactory } from './api-ninjas/api-ninjas.provider.js';
import type { ProviderFactory } from './covid-provider.js';

export function createProviderFactory(
  env: Pick<SyncEnv, 'DATA_PROVIDER' | 'API_NINJAS_KEY'>,
): ProviderFactory {
  switch (env.DATA_PROVIDER) {
    case 'api_ninjas':
      if (env.API_NINJAS_KEY === undefined) {
        throw new Error('API_NINJAS_KEY is required when DATA_PROVIDER=api_ninjas');
      }
      return apiNinjasFactory(env.API_NINJAS_KEY);
    case 'jhu_csv':
    case 'apify':
      throw new Error(`DATA_PROVIDER=${env.DATA_PROVIDER} is not implemented yet`);
  }
}
