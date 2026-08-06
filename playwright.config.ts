import { defineConfig, devices } from '@playwright/test';

/** Suites that run against a local stub rather than a browser - see the `node` project. */
const NODE_SUITES = /service-quotes-e2e\.spec\.ts/;

export default defineConfig({
  testDir: './tests',
  /**
   * One legible failure instead of dozens of confusing ones when the app under
   * test was built with the wrong baked env. See the helper for the whole
   * argument; `npm run test:e2e` is the path that cannot get it wrong.
   */
  globalSetup: './tests/helpers/assert-test-build.ts',
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
  /**
   * Two servers, and the GoTrue stub is started even against a TEST_URL.
   *
   * The admin specs need something answering on the port
   * NEXT_PUBLIC_SUPABASE_URL was baked to, because middleware's
   * `supabase.auth.getUser()` is a server call no `page.route` can intercept.
   * Each of those specs used to start the stub itself in `beforeAll`, on this
   * one fixed port, while Playwright runs spec files in parallel workers - so
   * whoever lost the race either failed to bind or had the port closed
   * underneath it by another file's `afterAll`. Once, here, for the whole run.
   */
  webServer: [
    {
      command: 'node tests/helpers/gotrue-stub.mjs',
      url: 'http://127.0.0.1:9099/auth/v1/user',
      reuseExistingServer: !process.env.CI,
      timeout: 30 * 1000,
    },
    ...(process.env.TEST_URL ? [] : [{
      command: 'npm run start',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    }]),
  ],
});
