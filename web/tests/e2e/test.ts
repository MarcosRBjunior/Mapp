import { expect, test as base } from '@playwright/test';
import { mockApi } from './mock-api.js';

// Every test runs against the mocked API and fails if the page tried to reach any other host.
export const test = base.extend<{ externalRequests: string[] }>({
  externalRequests: [
    async ({ page }, use) => {
      const external = await mockApi(page);
      await use(external);
      expect(external, 'requests to external hosts').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
