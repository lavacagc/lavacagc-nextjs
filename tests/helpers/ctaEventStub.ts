/**
 * Playwright `test` for specs that merely LOAD the homepage.
 *
 * The hero sends a view per CTA button to POST /api/cta/event on every load
 * (and experiment pages send theirs to POST /api/experiments/event), and
 * against a live backend those land in the shared `experiment_events` table as
 * untagged rows that skew the Experiments report. This fixture answers both
 * routes with 204 in every context the spec's `context` fixture creates, so
 * nothing is written. Specs that TEST the events (tests/cta-tests.spec.ts,
 * tests/experiments.spec.ts) use the plain test.
 *
 * Usage: import { test, expect } from './helpers/ctaEventStub';
 */
import { test as base } from '@playwright/test';

export const test = base.extend<{ stubCtaEvents: void }>({
  stubCtaEvents: [
    async ({ context }, use) => {
      await context.route('**/api/cta/event', (route) => route.fulfill({ status: 204 }));
      await context.route('**/api/experiments/event', (route) => route.fulfill({ status: 204 }));
      await use();
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
