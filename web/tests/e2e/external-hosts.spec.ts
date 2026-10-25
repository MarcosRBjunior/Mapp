import { expect, test } from '@playwright/test';
import { mockApi } from './mock-api.js';

// Uses Playwright's own `test` (not the auto fixture) to check the guard itself.
test('the guard records and aborts calls to external hosts', async ({ page, baseURL }) => {
  if (!baseURL) throw new Error('baseURL is required');
  const external = await mockApi(page, new URL(baseURL).origin);
  await page.goto('/sobre');
  await page.evaluate(async () => {
    await fetch('https://example.com/').catch(() => undefined);
  });
  expect(external).toEqual(['https://example.com/']);
});
