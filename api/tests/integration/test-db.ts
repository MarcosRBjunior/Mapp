import { existsSync } from 'node:fs';
import { loadDbEnv } from '../../src/config/db-env.js';

export const TEST_DATABASE = 'mapp_test';

export interface TestDbUrls {
  adminUrl: string;
  syncUrl: string;
  readerUrl: string;
}

export function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

export function loadTestDbUrls(): TestDbUrls {
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }
  const env = loadDbEnv();
  return {
    adminUrl: env.DATABASE_URL_SYNC,
    syncUrl: withDatabase(env.DATABASE_URL_SYNC, TEST_DATABASE),
    readerUrl: withDatabase(env.DATABASE_URL, TEST_DATABASE),
  };
}

export function scriptEnv(urls: TestDbUrls): NodeJS.ProcessEnv {
  return { ...process.env, DATABASE_URL: urls.readerUrl, DATABASE_URL_SYNC: urls.syncUrl };
}
