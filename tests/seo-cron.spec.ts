import { test, expect, request } from '@playwright/test';

/**
 * Smoke tests for the SEO autonomy Phase 1 cron endpoints.
 *
 * Skips automatically if SEO_INGEST_MODE !== 'fixture' or CRON_SECRET is unset
 * in the test runner's env, so CI without secrets stays green.
 *
 * The local run recipe lives in src/lib/seo/README.md ("Local testing"), which
 * owns it - including the TEST_URL that points the run at your dev server
 * rather than at a build the suite's global setup would reject.
 */
const CRON_SECRET = process.env.CRON_SECRET;
const FIXTURE = process.env.SEO_INGEST_MODE === 'fixture';
const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001';

test.describe('SEO autonomy Phase 1 cron routes', () => {
  test.skip(!CRON_SECRET || !FIXTURE, 'requires CRON_SECRET + SEO_INGEST_MODE=fixture');

  test('seo-ingest dry-run returns fixture rows', async () => {
    const ctx = await request.newContext();
    const res = await ctx.get(`${BASE}/api/cron/seo-ingest?days=30&dryRun=1`, {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.mode).toBe('fixture');
    expect(body.counts.gsc).toBeGreaterThan(0);
    expect(body.counts.ga4).toBeGreaterThan(0);
    expect(body.counts.upserted).toBe(0); // dryRun
  });

  test('seo-report rejects unauthenticated requests', async () => {
    const ctx = await request.newContext();
    const res = await ctx.get(`${BASE}/api/cron/seo-report`);
    expect([401, 403]).toContain(res.status());
  });
});
