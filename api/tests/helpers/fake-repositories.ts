import type { SourceRecord } from '../../src/repositories/data-state.repository.js';
import type { LastSyncRecord } from '../../src/repositories/meta.repository.js';
import type { ReadRepositories } from '../../src/repositories/read-repositories.js';
import type {
  CountryRecord,
  DayStat,
  GlobalDayRow,
} from '../../src/repositories/stats.repository.js';

export const FAKE_FROM = '2023-03-08';
export const FAKE_REFERENCE = '2023-03-09';
export const FAKE_DATA_VERSION = 7;

export const FAKE_SOURCE: SourceRecord = {
  id: 1,
  code: 'api_ninjas',
  name: 'Fonte de teste',
  url: 'https://example.test/covid',
  license: 'Licença de teste',
  attribution: 'Dados: fonte de teste',
};

export const FAKE_LAST_SYNC: LastSyncRecord = {
  status: 'partial',
  mode: 'snapshot',
  startedAt: new Date('2026-10-20T10:00:00Z'),
  finishedAt: new Date('2026-10-20T10:00:05Z'),
};

const COUNTRIES: CountryRecord[] = [
  { code: 'BRA', name: 'Brasil', kind: 'country', lat: -14.2, lng: -51.9, population: 212000000 },
  { code: 'ARG', name: 'Argentina', kind: 'country', lat: -38.4, lng: -63.6, population: 45000000 },
  {
    code: 'ESH',
    name: 'Saara Ocidental',
    kind: 'country',
    lat: 24.2,
    lng: -12.9,
    population: null,
  },
  {
    code: 'XDP',
    name: 'Navio Diamond Princess',
    kind: 'non_geographic',
    lat: null,
    lng: null,
    population: null,
  },
];

const DAY_STATS: Record<string, DayStat[]> = {
  [FAKE_FROM]: [
    { code: 'BRA', name: 'Brasil', metric: 'cases', total: 90, newValue: 9 },
    { code: 'BRA', name: 'Brasil', metric: 'deaths', total: 0, newValue: 0 },
  ],
  [FAKE_REFERENCE]: [
    { code: 'ARG', name: 'Argentina', metric: 'cases', total: 100, newValue: 5 },
    { code: 'BRA', name: 'Brasil', metric: 'cases', total: 100, newValue: 10 },
    { code: 'ARG', name: 'Argentina', metric: 'deaths', total: 20, newValue: 2 },
    { code: 'BRA', name: 'Brasil', metric: 'deaths', total: 10, newValue: 1 },
  ],
};

const GLOBAL: Record<string, GlobalDayRow[]> = {
  [FAKE_FROM]: [
    { metric: 'cases', total: 90, newValue: 9, countryCount: 1 },
    { metric: 'deaths', total: 0, newValue: 0, countryCount: 1 },
  ],
  [FAKE_REFERENCE]: [
    { metric: 'cases', total: 250, newValue: 15, countryCount: 3 },
    { metric: 'deaths', total: 35, newValue: 3, countryCount: 3 },
  ],
};

export interface FakeOptions {
  ready?: boolean;
  failing?: boolean;
}

export function createFakeRepositories(options: FakeOptions = {}): ReadRepositories {
  const ready = options.ready ?? true;
  return {
    dataState: {
      findSource: (code) => Promise.resolve(code === FAKE_SOURCE.code ? FAKE_SOURCE : null),
      findDataVersion: () =>
        options.failing
          ? Promise.reject(new Error('connection refused'))
          : Promise.resolve(ready ? FAKE_DATA_VERSION : null),
      findCoverage: () =>
        Promise.resolve({ from: FAKE_FROM, referenceDate: FAKE_REFERENCE, countries: 3 }),
      isCompleteDate: (_sourceId, date) => Promise.resolve(date in GLOBAL),
    },
    meta: {
      findLastFinishedSync: () => Promise.resolve(ready ? FAKE_LAST_SYNC : null),
      listNonGeographic: () =>
        Promise.resolve(
          COUNTRIES.filter((country) => country.kind === 'non_geographic').map(
            ({ code, name }) => ({ code, name }),
          ),
        ),
    },
    stats: {
      findGlobalDay: (_sourceId, date) => Promise.resolve(GLOBAL[date] ?? []),
      listCountryValues: (_sourceId, metric, date) =>
        Promise.resolve(
          COUNTRIES.filter((country) => country.kind === 'country').map((country) => {
            const stat = (DAY_STATS[date] ?? []).find(
              (entry) => entry.code === country.code && entry.metric === metric,
            );
            return {
              code: country.code,
              name: country.name,
              lat: country.lat,
              lng: country.lng,
              total: stat?.total ?? null,
              newValue: stat?.newValue ?? null,
            };
          }),
        ),
      findCountry: (code) =>
        Promise.resolve(COUNTRIES.find((country) => country.code === code) ?? null),
      listCountryDayStats: (_sourceId, date) => Promise.resolve(DAY_STATS[date] ?? []),
    },
  };
}
