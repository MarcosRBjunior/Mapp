import type {
  CountriesListResponse,
  CountryDetailResponse,
  GlobalResponse,
  MetaResponse,
  Metric,
} from '../shared/api/types';

// Invented numbers: the source's terms forbid storing its data and this repository is public.
export const REFERENCE_DATE = '2023-03-09';

interface FixtureValue {
  total: number;
  new: number;
}

interface FixtureCountry {
  code: string;
  name: string;
  lat: number;
  lng: number;
  population: number;
  cases: FixtureValue | null;
  deaths: FixtureValue | null;
}

export const fixtureCountries: FixtureCountry[] = [
  {
    code: 'BRA',
    name: 'Brasil',
    lat: -14.235,
    lng: -51.9253,
    population: 212559409,
    cases: { total: 300000, new: 120 },
    deaths: { total: 6000, new: 3 },
  },
  {
    code: 'DNK',
    name: 'Dinamarca',
    lat: 56.2639,
    lng: 9.5018,
    population: 5837213,
    cases: { total: 50000, new: 40 },
    deaths: { total: 500, new: 1 },
  },
  {
    code: 'USA',
    name: 'Estados Unidos',
    lat: 40,
    lng: -100,
    population: 329466283,
    cases: { total: 500000, new: 800 },
    deaths: { total: 9000, new: 12 },
  },
  {
    code: 'IND',
    name: 'Índia',
    lat: 20.593684,
    lng: 78.96288,
    population: 1380004385,
    cases: { total: 150000, new: 240 },
    deaths: { total: 3000, new: 4 },
  },
  {
    code: 'ZWE',
    name: 'Zimbábue',
    lat: -19.015438,
    lng: 29.154857,
    population: 14862927,
    cases: null,
    deaths: null,
  },
];

function sum(metric: Metric): FixtureValue {
  return fixtureCountries.reduce(
    (acc, country) => ({
      total: acc.total + (country[metric]?.total ?? 0),
      new: acc.new + (country[metric]?.new ?? 0),
    }),
    { total: 0, new: 0 },
  );
}

export const metaFixture: MetaResponse = {
  source: {
    code: 'api_ninjas',
    name: 'API Ninjas',
    url: 'https://api-ninjas.com/api/covid19',
    license: 'Termos de uso da API Ninjas',
    attribution: 'Dados: API Ninjas (fonte original: JHU CSSE)',
  },
  coverage: { from: '2020-01-22', to: REFERENCE_DATE, countries: 4 },
  referenceDate: REFERENCE_DATE,
  lastSync: {
    status: 'success',
    mode: 'snapshot',
    startedAt: '2026-10-19T12:00:00.000Z',
    finishedAt: '2026-10-19T12:00:05.000Z',
  },
  dataVersion: 7,
  nonGeographic: [{ code: 'XDP', name: 'Navio Diamond Princess' }],
};

export const globalFixture: GlobalResponse = {
  date: REFERENCE_DATE,
  cases: sum('cases'),
  deaths: sum('deaths'),
  countryCount: 4,
};

export function countriesFixture(metric: Metric): CountriesListResponse {
  return {
    date: REFERENCE_DATE,
    metric,
    countries: fixtureCountries.map((country) => ({
      code: country.code,
      name: country.name,
      lat: country.lat,
      lng: country.lng,
      total: country[metric]?.total ?? null,
      new: country[metric]?.new ?? null,
    })),
  };
}

function compare(country: FixtureCountry, metric: Metric) {
  const ranked = fixtureCountries
    .filter((item) => item[metric] !== null)
    .sort(
      (a, b) =>
        (b[metric]?.total ?? 0) - (a[metric]?.total ?? 0) || a.name.localeCompare(b.name, 'pt-BR'),
    );
  const value = country[metric]?.total ?? null;
  return {
    share: value === null ? null : Math.round((value / globalFixture[metric].total) * 1000) / 10,
    rank: value === null ? null : ranked.findIndex((item) => item.code === country.code) + 1,
    rankedCount: ranked.length,
  };
}

export function countryDetailFixture(code: string): CountryDetailResponse | null {
  const country = fixtureCountries.find((item) => item.code === code);
  if (!country) return null;
  return {
    date: REFERENCE_DATE,
    country: {
      code: country.code,
      name: country.name,
      lat: country.lat,
      lng: country.lng,
      population: country.population,
    },
    cases: country.cases,
    deaths: country.deaths,
    comparison: { cases: compare(country, 'cases'), deaths: compare(country, 'deaths') },
  };
}
