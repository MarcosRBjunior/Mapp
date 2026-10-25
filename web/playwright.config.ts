import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);
const PORT = 5180;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  // One retry in CI: a test that only passes on the second try shows up as flaky in the report.
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Own port and env so a dev server pointing to the real API is never reused.
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    env: {
      VITE_API_URL: 'http://api.test',
      VITE_TILES_URL: 'http://tiles.test/{z}/{x}/{y}.png',
      VITE_TILES_ATTRIBUTION: '&copy; Tiles de teste',
    },
  },
});
