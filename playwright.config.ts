import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:8082',
    trace: 'retain-on-failure',
    ...devices['Pixel 7'],
    // The app speaks the device language; the specs read its Russian texts.
    locale: 'ru-RU',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  },
  webServer: [
    {
      command: 'pnpm exec tsx scripts/e2e-api.ts',
      url: 'http://127.0.0.1:3002/health',
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: 'pnpm --filter @lingvohero/mobile exec expo start --web --localhost --port 8082',
      url: 'http://localhost:8082',
      reuseExistingServer: false,
      timeout: 120000,
      env: { BROWSER: 'none', EXPO_PUBLIC_API_URL: 'http://localhost:3002' },
    },
  ],
});
