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

  it('lists no incomplete date inside a one-day coverage', async () => {
    // D2 misses ARG but lies after the last complete date (D1).
    expect(await repos.dataState.findIncompleteDates(fixture.sourceId)).toEqual([]);
  });
});

describe('meta repository (read-only user)', () => {
  it('returns the last finished run, whatever its status', async () => {
    expect(await repos.meta.findLastFinishedSync(fixture.sourceId)).toEqual({
      id: fixture.failedId,
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
    const names = values.map((value) => value.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'pt-BR')));
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

  it('ranks kind=country by total, ties in pt-BR alphabetical order (RN-05)', async () => {
    // D1 cases: ARG 100 and BRA 100 tie → Argentina first; XDP is not a country.
    expect(await repos.stats.listRanking(fixture.sourceId, 'cases', D1, 10)).toEqual([
      { rank: 1, code: 'ARG', name: 'Argentina', total: 100, newValue: 5, rankedCount: 2 },
      { rank: 2, code: 'BRA', name: 'Brasil', total: 100, newValue: 10, rankedCount: 2 },
    ]);
    expect(await repos.stats.listRanking(fixture.sourceId, 'deaths', D1, 1)).toEqual([
      { rank: 1, code: 'ARG', name: 'Argentina', total: 20, newValue: 2, rankedCount: 2 },
    ]);
  });

  it('finds the rank of one country per metric, null when it has no data', async () => {
    expect(await repos.stats.findCountryRanks(fixture.sourceId, D1, 'BRA')).toEqual([
      { metric: 'cases', total: 100, newValue: 10, rank: 2, rankedCount: 2 },
      { metric: 'deaths', total: 10, newValue: 1, rank: 2, rankedCount: 2 },
    ]);
    // ARG has no row on D2; BRA is the only ranked country there.
    expect(await repos.stats.findCountryRanks(fixture.sourceId, D2, 'ARG')).toEqual([
      { metric: 'cases', total: null, newValue: null, rank: null, rankedCount: 1 },
      { metric: 'deaths', total: null, newValue: null, rank: null, rankedCount: 1 },
    ]);
  });
});
