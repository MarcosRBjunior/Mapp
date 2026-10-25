import { http, HttpResponse } from 'msw';
import type { ApiErrorCode, Granularity, Metric } from '../shared/api/types';
import {
  REFERENCE_DATE,
  SERIES_START,
  countriesFixture,
  countryDetailFixture,
  countrySeriesFixture,
  globalFixture,
  globalSeriesFixture,
  metaFixture,
  rankingsFixture,
} from './fixtures';

export const API = 'http://api.test';

export function errorBody(code: ApiErrorCode, message: string, details: unknown = null) {
  return { error: { code, message, details, requestId: 'req-test' } };
}

function seriesQuery(request: Request): {
  metric: Metric;
  from: string;
  to: string;
  granularity: Granularity;
} {
  const params = new URL(request.url).searchParams;
  const granularity = params.get('granularity');
  return {
    metric: params.get('metric') === 'deaths' ? 'deaths' : 'cases',
    from: params.get('from') ?? SERIES_START,
    to: params.get('to') ?? REFERENCE_DATE,
    // Same default as the API.
    granularity: granularity === 'week' || granularity === 'month' ? granularity : 'day',
  };
}

export const handlers = [
  http.get(`${API}/api/v1/rankings`, ({ request }) => {
    const params = new URL(request.url).searchParams;
    const metric = params.get('metric') === 'deaths' ? 'deaths' : 'cases';
    return HttpResponse.json(rankingsFixture(metric, Number(params.get('limit') ?? '10')));
  }),
  http.get(`${API}/api/v1/meta`, () => HttpResponse.json(metaFixture)),
  http.get(`${API}/api/v1/global`, () => HttpResponse.json(globalFixture)),
  http.get(`${API}/api/v1/countries`, ({ request }) => {
    const metric =
      new URL(request.url).searchParams.get('metric') === 'deaths' ? 'deaths' : 'cases';
    return HttpResponse.json(countriesFixture(metric));
  }),
  http.get(`${API}/api/v1/countries/:code`, ({ params }) => {
    const code = (typeof params.code === 'string' ? params.code : '').toUpperCase();
    const detail = countryDetailFixture(code);
    return detail
      ? HttpResponse.json(detail)
      : HttpResponse.json(errorBody('COUNTRY_NOT_FOUND', 'country not found', { code }), {
          status: 404,
        });
  }),
  http.get(`${API}/api/v1/global/timeseries`, ({ request }) => {
    const { metric, from, to, granularity } = seriesQuery(request);
    return HttpResponse.json(globalSeriesFixture(metric, from, to, granularity));
  }),
  http.get(`${API}/api/v1/countries/:code/timeseries`, ({ params, request }) => {
    const code = (typeof params.code === 'string' ? params.code : '').toUpperCase();
    const { metric, from, to, granularity } = seriesQuery(request);
    const series = countrySeriesFixture(code, metric, from, to, granularity);
    return series
      ? HttpResponse.json(series)
      : HttpResponse.json(errorBody('COUNTRY_NOT_FOUND', 'country not found', { code }), {
          status: 404,
        });
  }),
];
