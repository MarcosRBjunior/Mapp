import { existsSync } from 'node:fs';
import { loadDbEnv } from '../../src/config/db-env.js';

export const TEST_DATABASE = 'mapp_test';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

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
    delete process.env.API_NINJAS_KEY;
  }
  const env = loadDbEnv();
  const host = new URL(env.DATABASE_URL_SYNC).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Integration tests only run against a local Postgres (DATABASE_URL_SYNC host: ${host})`,
    );
  }
  return {
    adminUrl: env.DATABASE_URL_SYNC,
    syncUrl: withDatabase(env.DATABASE_URL_SYNC, TEST_DATABASE),
    readerUrl: withDatabase(env.DATABASE_URL, TEST_DATABASE),
  };
}

export function scriptEnv(urls: TestDbUrls): NodeJS.ProcessEnv {
  return { ...process.env, DATABASE_URL: urls.readerUrl, DATABASE_URL_SYNC: urls.syncUrl };
}
