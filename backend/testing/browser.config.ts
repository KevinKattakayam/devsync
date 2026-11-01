import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './browser',
  testMatch: process.env.E2E_SETTINGS
    ? 'settings.spec.ts'
    : process.env.E2E_DASHBOARD
      ? 'dashboard.spec.ts'
      : process.env.E2E_SHELL
        ? 'shell.spec.ts'
        : process.env.E2E_UI_CAPTURE
          ? 'capture.spec.ts'
          : ['journeys.spec.ts', 'contracts.spec.ts'],
  timeout: process.env.E2E_SHELL || process.env.E2E_SETTINGS ? 240000 : 90000,
  ...(process.env.E2E_SETTINGS && process.env.E2E_SETTINGS_FILTER
    ? { grep: new RegExp(process.env.E2E_SETTINGS_FILTER) }
    : process.env.E2E_DASHBOARD && process.env.E2E_DASHBOARD_FILTER
      ? { grep: new RegExp(process.env.E2E_DASHBOARD_FILTER) }
      : {}),
  ...(process.env.E2E_SHELL_UPDATE === '1' ? { updateSnapshots: 'all' as const } : {}),
  expect: { timeout: 15000 },
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3001',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    launchOptions: {
      executablePath: process.env.E2E_CHROMIUM_PATH,
    },
  },
});
