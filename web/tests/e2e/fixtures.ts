// Invented numbers (same as web/src/test/fixtures.ts, which lives in another TS project).
export const REFERENCE_DATE = '2023-03-09';

type Metric = 'cases' | 'deaths';

interface E2ECountry {
  code: string;
  name: string;
  lat: number;
  lng: number;
  population: number;
  cases: { total: number; new: number } | null;
  deaths: { total: number; new: number } | null;
}

const countries: E2ECountry[] = [
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

function sum(metric: Metric) {
  return countries.reduce(
    (acc, c) => ({
      total: acc.total + (c[metric]?.total ?? 0),
      new: acc.new + (c[metric]?.new ?? 0),
    }),
    { total: 0, new: 0 },
  );
}

export const meta = {
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

export const global = {
  date: REFERENCE_DATE,
  cases: sum('cases'),
  deaths: sum('deaths'),
  countryCount: 4,
};

export function countryList(metric: Metric) {
  return {
    date: REFERENCE_DATE,
    metric,
    countries: countries.map((c) => ({
      code: c.code,
      name: c.name,
      lat: c.lat,
      lng: c.lng,
      total: c[metric]?.total ?? null,
      new: c[metric]?.new ?? null,
    })),
  };
}

function compare(country: E2ECountry, metric: Metric) {
  const ranked = countries
    .filter((c) => c[metric] !== null)
    .sort(
      (a, b) =>
        (b[metric]?.total ?? 0) - (a[metric]?.total ?? 0) || a.name.localeCompare(b.name, 'pt-BR'),
    );
  const value = country[metric]?.total ?? null;
  return {
    share: value === null ? null : Math.round((value / global[metric].total) * 1000) / 10,
    rank: value === null ? null : ranked.findIndex((c) => c.code === country.code) + 1,
    rankedCount: ranked.length,
  };
}

export function countryDetail(code: string) {
  const country = countries.find((c) => c.code === code);
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
