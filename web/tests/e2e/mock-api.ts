import type { Page } from '@playwright/test';
import { BLANK_PNG, CORS_HEADERS, resolveApi } from './api-routes.js';

const API_ORIGIN = 'http://api.test';
const TILES_ORIGIN = 'http://tiles.test';

// Serves the API and the tiles from fixtures. Only the app's own origin passes through; every
// other origin (including other localhost ports, such as a real local API) is aborted and
// recorded. The returned list is live, so the test fixture can check it after the test.
export async function mockApi(page: Page, appOrigin: string): Promise<string[]> {
  const external: string[] = [];
  await page.route('**/*', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === appOrigin) return route.continue();
    if (url.origin === TILES_ORIGIN) {
      return route.fulfill({ status: 200, contentType: 'image/png', body: BLANK_PNG });
    }
    if (url.origin === API_ORIGIN) {
      if (request.method() === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: CORS_HEADERS });
      }
      const { status, body } = resolveApi(url);
      return route.fulfill({
        status,
        contentType: 'application/json',
        headers: CORS_HEADERS,
        body: JSON.stringify(body),
      });
    }
    external.push(url.href);
    return route.abort();
  });
  return external;
}
