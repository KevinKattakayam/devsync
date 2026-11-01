import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './browser',
  timeout: 90000,
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
