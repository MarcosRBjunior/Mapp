import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { createLogger } from '../../src/lib/logger.js';
import { createServices } from '../../src/services/create-services.js';
import { createFakeRepositories, type FakeOptions } from './fake-repositories.js';

export const TEST_WEB_ORIGIN = 'http://localhost:5173';

export function createTestApp(options: FakeOptions & { trustProxy?: number } = {}): Express {
  const { trustProxy = 0, ...fakeOptions } = options;
  return createApp({
    services: createServices(createFakeRepositories(fakeOptions), 'api_ninjas'),
    logger: createLogger('silent'),
    webOrigin: TEST_WEB_ORIGIN,
    trustProxy,
  });
}
