import { http, HttpResponse } from 'msw';
import type { ApiErrorCode } from '../shared/api/types';
import { countriesFixture, countryDetailFixture, globalFixture, metaFixture } from './fixtures';

export const API = 'http://api.test';

export function errorBody(code: ApiErrorCode, message: string, details: unknown = null) {
  return { error: { code, message, details, requestId: 'req-test' } };
}

export const handlers = [
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
];
