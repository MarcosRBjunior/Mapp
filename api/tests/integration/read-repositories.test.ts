import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrisma } from '../../src/lib/prisma.js';
import { createReadRepositories } from '../../src/repositories/read-repositories.js';
import { D1, D2, seedReadFixture, type ReadFixture } from './read-fixtures.js';
import { resetSyncState } from './sync-state.js';
import { loadTestDbUrls } from './test-db.js';

const urls = loadTestDbUrls();
const owner = new pg.Client({ connectionString: urls.syncUrl });
const reader = createPrisma(urls.readerUrl);
const repos = createReadRepositories(reader);
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

describe('data state repository (read-only user)', () => {
  it('finds the source by code', async () => {
    expect(await repos.dataState.findSource('api_ninjas')).toMatchObject({
      id: fixture.sourceId,
      code: 'api_ninjas',
      name: 'API Ninjas — COVID-19',
    });
    expect(await repos.dataState.findSource('nope')).toBeNull();
  });

  it('uses the latest success or partial run as dataVersion', async () => {
    expect(await repos.dataState.findDataVersion(fixture.sourceId)).toBe(fixture.partialId);
    expect(await repos.dataState.findDataVersion(fixture.sourceId + 999)).toBeNull();
  });

  it('computes coverage with the RN-06 reference date', async () => {
    // ESH never appears (3 countries present); ARG is missing on D2, so the reference falls back to D1.
    expect(await repos.dataState.findCoverage(fixture.sourceId)).toEqual({
      from: D1,
      referenceDate: D1,
      countries: 3,
    });
  });

  it('checks whether the global view has a date', async () => {
    expect(await repos.dataState.hasGlobalDate(fixture.sourceId, D1)).toBe(true);
    expect(await repos.dataState.hasGlobalDate(fixture.sourceId, '2023-03-10')).toBe(false);
  });
});

describe('meta repository (read-only user)', () => {
  it('returns the last finished run, whatever its status', async () => {
    expect(await repos.meta.findLastFinishedSync(fixture.sourceId)).toEqual({
      status: 'failed',
      mode: 'snapshot',
      startedAt: new Date('2026-10-03T00:00:00Z'),
      finishedAt: new Date('2026-10-03T00:01:00Z'),
    });
  });

  it('lists the non-geographic entities by code', async () => {
    const entities = await repos.meta.listNonGeographic();
    expect(entities.map((entity) => entity.code)).toEqual(['XDP', 'XMZ', 'XSO', 'XWO']);
    expect(entities[0]).toEqual({ code: 'XDP', name: 'Navio Diamond Princess' });
  });
});

describe('stats repository (read-only user)', () => {
  it('reads the global day as numbers', async () => {
    expect(await repos.stats.findGlobalDay(fixture.sourceId, D1)).toEqual([
      { metric: 'cases', total: 250, newValue: 15, countryCount: 3 },
      { metric: 'deaths', total: 35, newValue: 3, countryCount: 3 },
    ]);
    expect(await repos.stats.findGlobalDay(fixture.sourceId, '2023-03-10')).toEqual([]);
  });

  it('lists every kind=country with nulls when there is no data', async () => {
    const values = await repos.stats.listCountryValues(fixture.sourceId, 'cases', D1);
    expect(values).toHaveLength(198);
    expect(values.find((value) => value.code === 'BRA')).toEqual({
      code: 'BRA',
      name: 'Brasil',
      lat: -14.235,
      lng: -51.9253,
      total: 100,
      newValue: 10,
    });
    expect(values.find((value) => value.code === 'ESH')).toMatchObject({
      total: null,
      newValue: null,
    });
    expect(values.some((value) => value.code === 'XDP')).toBe(false);
  });

  it('finds a country with population as a number', async () => {
    expect(await repos.stats.findCountry('BRA')).toEqual({
      code: 'BRA',
      name: 'Brasil',
      kind: 'country',
      lat: -14.235,
      lng: -51.9253,
      population: 212559409,
    });
    expect((await repos.stats.findCountry('XDP'))?.kind).toBe('non_geographic');
    expect(await repos.stats.findCountry('XYZ')).toBeNull();
  });

  it('lists the day stats of kind=country only', async () => {
    expect(await repos.stats.listCountryDayStats(fixture.sourceId, D1)).toEqual([
      { code: 'ARG', name: 'Argentina', metric: 'cases', total: 100, newValue: 5 },
      { code: 'BRA', name: 'Brasil', metric: 'cases', total: 100, newValue: 10 },
      { code: 'ARG', name: 'Argentina', metric: 'deaths', total: 20, newValue: 2 },
      { code: 'BRA', name: 'Brasil', metric: 'deaths', total: 10, newValue: 1 },
    ]);
    expect(await repos.stats.listCountryDayStats(fixture.sourceId, D2)).toHaveLength(2);
  });
});
