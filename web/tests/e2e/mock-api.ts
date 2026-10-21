import type { Page, Route } from '@playwright/test';
import { countryDetail, countryList, global, meta } from './fixtures.js';

const API_ORIGIN = 'http://api.test';
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  });
}

function notFound(route: Route, code: string) {
  return json(route, 404, {
    error: {
      code: 'COUNTRY_NOT_FOUND',
      message: 'country not found',
      details: { code },
      requestId: 'req-e2e',
    },
  });
}

function handleApi(route: Route, url: URL) {
  if (route.request().method() === 'OPTIONS') {
    return route.fulfill({ status: 204, headers: CORS_HEADERS });
  }
  const path = url.pathname;
  if (path === '/api/v1/meta') return json(route, 200, meta);
  if (path === '/api/v1/global') return json(route, 200, global);
  if (path === '/api/v1/countries') {
    return json(
      route,
      200,
      countryList(url.searchParams.get('metric') === 'deaths' ? 'deaths' : 'cases'),
    );
  }
  const match = /^\/api\/v1\/countries\/([^/]+)$/.exec(path);
  if (match?.[1]) {
    const code = decodeURIComponent(match[1]).toUpperCase();
    const detail = countryDetail(code);
    return detail ? json(route, 200, detail) : notFound(route, code);
  }
  return json(route, 404, {
    error: { code: 'NOT_FOUND', message: 'route not found', details: null, requestId: 'req-e2e' },
  });
}

// Serves the API from fixtures and blocks every other external host (tiles included).
export async function mockApi(page: Page): Promise<void> {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'localhost') return route.continue();
    if (url.origin === API_ORIGIN) return handleApi(route, url);
    return route.abort();
  });
}
