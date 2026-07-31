import { defineConfig, devices } from '@playwright/test';

/** Suites that run against a local stub rather than a browser - see the `node` project. */
const NODE_SUITES = /service-quotes-e2e\.spec\.ts/;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list']
  ],
  use: {
    baseURL: process.env.TEST_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      // Node-level integration suites: they drive real library code against a
      // local stub server instead of a browser. Their own project because they
      // are stateful and order-dependent (fullyParallel off) and because there
      // is nothing to gain from running them once per device profile.
      name: 'node',
      testMatch: NODE_SUITES,
      fullyParallel: false,
    },
    {
      name: 'chromium',
      testIgnore: NODE_SUITES,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      testIgnore: NODE_SUITES,
      use: {
        ...devices['Pixel 5'],
        // Use Chromium for mobile instead of WebKit for better compatibility
      },
    },
  ],
  webServer: process.env.TEST_URL ? undefined : {
    command: 'npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
