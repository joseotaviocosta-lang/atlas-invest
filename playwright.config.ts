import { defineConfig, devices } from '@playwright/test';

const isFreshServer = Boolean(
  process.env.CI ||
  process.env.PLAYWRIGHT_FRESH_SERVER === 'true' ||
  process.env.PLAYWRIGHT_CLOSURE_MODE === 'true',
);

const port = process.env.PLAYWRIGHT_PORT || '3000';

if (isFreshServer) {
  console.info(
    `[playwright:webServer] Fresh server mode active: reuseExistingServer=false, port=${port}, timestamp=${new Date().toISOString()}`,
  );
}

export default defineConfig({
  testDir: './tests/web/e2e',
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || `http://localhost:${port}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'Desktop Chrome',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'Tablet Chrome',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: 'Mobile Chrome',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: {
    command: `pnpm --filter @atlas/web start -p ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !isFreshServer,
    timeout: 120000,
  },
});
