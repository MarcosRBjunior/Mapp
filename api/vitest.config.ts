import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['tests/setup/no-network.ts'],
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/integration/**', '**/node_modules/**'],
  },
});
