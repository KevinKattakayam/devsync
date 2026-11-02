import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.tsx'],
    restoreMocks: true,
    coverage: {
      enabled: process.env.QUALITY_COVERAGE === '1',
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      reporter: ['text', 'json-summary'],
      reportsDirectory:
        process.env.QUALITY_COVERAGE_DIRECTORY || '../docs/quality/frontend-coverage',
    },
  },
});
