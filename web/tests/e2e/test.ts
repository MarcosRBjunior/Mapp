import { expect, test as base } from '@playwright/test';
import { mockApi } from './mock-api.js';

// Every test runs against the mocked API and fails if the page tried to reach any other host.
export const test = base.extend<{ externalRequests: string[] }>({
  externalRequests: [
    async ({ page, baseURL }, use) => {
      if (!baseURL) throw new Error('baseURL is required to tell the app from external hosts');
      const external = await mockApi(page, new URL(baseURL).origin);
      await use(external);
      expect(external, 'requests to external hosts').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
