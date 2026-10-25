import {
  REFERENCE_DATE,
  SERIES_START,
  countryDetail,
  countryList,
  countrySeries,
  global,
  globalSeries,
  meta,
  rankings,
} from './fixtures.js';

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

// 1×1 transparent PNG served as every map tile.
export const BLANK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

export interface ApiResponse {
  status: number;
  body: unknown;
}

function error(status: number, code: string, message: string, details: unknown): ApiResponse {
  return { status, body: { error: { code, message, details, requestId: 'req-e2e' } } };
}

function countryNotFound(code: string): ApiResponse {
  return error(404, 'COUNTRY_NOT_FOUND', 'country not found', { code });
}

// Answers the API from the fixtures; shared by the Playwright mock and the Lighthouse server.
export function resolveApi(url: URL): ApiResponse {
  const path = url.pathname;
  if (path === '/api/v1/meta') return { status: 200, body: meta };
  if (path === '/api/v1/global') return { status: 200, body: global };
  const metric = url.searchParams.get('metric') === 'deaths' ? 'deaths' : 'cases';
  const from = url.searchParams.get('from') ?? SERIES_START;
  const to = url.searchParams.get('to') ?? REFERENCE_DATE;
  const rawGranularity = url.searchParams.get('granularity');
  const granularity =
    rawGranularity === 'week' || rawGranularity === 'month' ? rawGranularity : 'day';
  if (path === '/api/v1/countries') return { status: 200, body: countryList(metric) };
  if (path === '/api/v1/rankings') {
    return { status: 200, body: rankings(metric, Number(url.searchParams.get('limit') ?? '10')) };
  }
  if (path === '/api/v1/global/timeseries') {
    return { status: 200, body: globalSeries(metric, from, to, granularity) };
  }
  const series = /^\/api\/v1\/countries\/([^/]+)\/timeseries$/.exec(path);
  if (series?.[1]) {
    const code = decodeURIComponent(series[1]).toUpperCase();
    const body = countrySeries(code, metric, from, to, granularity);
    return body ? { status: 200, body } : countryNotFound(code);
  }
  const match = /^\/api\/v1\/countries\/([^/]+)$/.exec(path);
  if (match?.[1]) {
    const code = decodeURIComponent(match[1]).toUpperCase();
    const detail = countryDetail(code);
    return detail ? { status: 200, body: detail } : countryNotFound(code);
  }
  return error(404, 'NOT_FOUND', 'route not found', null);
}
