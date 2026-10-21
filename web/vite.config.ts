import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    env: {
      VITE_API_URL: 'http://api.test',
      VITE_TILES_URL: 'https://tiles.test/{z}/{x}/{y}.png',
      VITE_TILES_ATTRIBUTION: '&copy; Tiles de teste',
    },
  },
});
