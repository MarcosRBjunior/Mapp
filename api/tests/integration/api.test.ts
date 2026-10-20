import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createLogger } from '../../src/lib/logger.js';
import { createPrisma } from '../../src/lib/prisma.js';
import { createReadRepositories } from '../../src/repositories/read-repositories.js';
import { createServices } from '../../src/services/create-services.js';
import { D1, seedReadFixture, type ReadFixture } from './read-fixtures.js';
import { resetSyncState } from './sync-state.js';
import { loadTestDbUrls } from './test-db.js';

const urls = loadTestDbUrls();
const owner = new pg.Client({ connectionString: urls.syncUrl });
const reader = createPrisma(urls.readerUrl);
const app = createApp({
  services: createServices(createReadRepositories(reader), 'api_ninjas'),
  logger: createLogger('silent'),
  webOrigin: 'http://localhost:5173',
});
let fixture: ReadFixture;

beforeAll(async () => {
  await owner.connect();
  fixture = await seedReadFixture(owner);
});

afterAll(async () => {
  await resetSyncState(owner);
  await owner.end();
  await reader.$disconnect();
});

describe('api over the read-only database user', () => {
  it('is ready with the partial run as dataVersion', async () => {
    const response = await request(app).get('/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ready',
      dataVersion: fixture.partialId,
      referenceDate: D1,
    });
  });

  it('serves a country detail with share and rank', async () => {
    const response = await request(app).get('/api/v1/countries/BRA');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      date: D1,
      country: { code: 'BRA', name: 'Brasil', population: 212559409 },
      cases: { total: 100, new: 10 },
      comparison: {
        cases: { share: 40, rank: 2, rankedCount: 2 },
        deaths: { share: 28.6, rank: 2, rankedCount: 2 },
      },
    });
  });

  it('serves the global totals, including non-geographic entities', async () => {
    const response = await request(app).get('/api/v1/global');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      date: D1,
      cases: { total: 250, new: 15 },
      deaths: { total: 35, new: 3 },
      countryCount: 3,
    });
  });
});
