import path from 'path';
import { defineConfig, devices } from '@playwright/test';

/**
 * Config for the PERFORMANCE actions (perf/actions.spec.ts), kept separate
 * from playwright.config.ts on purpose:
 *  - these are measurements, not pass/fail correctness tests, so they must
 *    never run as part of `npm run test:e2e` (testDir there is ./tests);
 *  - they run against the perf build (scripts/perf-build.sh, local Supabase),
 *    which the main suite's assert-test-build globalSetup would reject;
 *  - one worker, serially: pg_stat_statements windows are per-action, and
 *    parallel actions would pollute each other's query counts.
 *
 * Run via `npm run perf` (scripts/perf-run.mjs owns build + server + env).
 */
export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    // A real-browser UA: src/middleware.ts answers 403 to /headlesschrome/i
    // on every path, so a default headless UA would measure the bot filter.
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'npm run start',
    cwd: path.join(__dirname, '..'),
    url: 'http://localhost:3000',
    // scripts/perf-run.mjs starts the server itself (Lighthouse needs it too);
    // reuse it instead of racing for the port.
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
});
