import { test, expect } from '@playwright/test';

/**
 * CM-11 (S3) - /api/health/forms guarded itself with `if (diagKey) {...}`, so
 * an unset DIAGNOSTICS_KEY skipped the check and served the full environment
 * inventory to anyone. Confirmed live during the chaos run: a plain curl to
 * production returned 200 with every env var name, its role, and whether it
 * was configured.
 *
 * No secret VALUES leaked, so this is reconnaissance rather than a breach -
 * but it told an attacker exactly which protections were missing.
 *
 * The stub build sets no DIAGNOSTICS_KEY, so this suite exercises the
 * fail-closed path, which is the one that was broken.
 *
 * @smoke CM-11
 */

const PATH = '/api/health/forms';

test.describe('@smoke CM-11 diagnostics endpoint fails closed', () => {
  test('with no key configured the endpoint is unavailable and leaks nothing', async ({ request, baseURL }) => {
    test.skip(Boolean(process.env.DIAGNOSTICS_KEY), 'a key is configured in this environment');

    const res = await request.get(`${baseURL}${PATH}`, { failOnStatusCode: false });
    expect(res.status(), 'a missing guard secret must mean unavailable, not unguarded').toBe(404);

    const text = await res.text();
    // The specific things that used to leak.
    expect(text).not.toContain('SUPABASE_SECRET_KEY');
    expect(text).not.toContain('missingCritical');
    expect(text).not.toContain('formsWillWork');
    expect(text).not.toContain('"env"');
  });

  test('a wrong key is refused', async ({ request, baseURL }) => {
    const res = await request.get(`${PATH}?key=definitely-wrong`.startsWith('http')
      ? `${PATH}?key=definitely-wrong`
      : `${baseURL}${PATH}?key=definitely-wrong`, { failOnStatusCode: false });
    // 404 when no key is configured, 401 when one is - either way, not 200.
    expect([401, 404]).toContain(res.status());
    expect(await res.text()).not.toContain('SUPABASE_SECRET_KEY');
  });

  test('with the key configured and supplied, the report still renders', async ({ request, baseURL }) => {
    const key = process.env.DIAGNOSTICS_KEY;
    test.skip(!key, 'no DIAGNOSTICS_KEY in this environment - positive path covered where one is set');

    const res = await request.get(`${baseURL}${PATH}?key=${key}`, { failOnStatusCode: false });
    expect(res.status(), 'the legitimate diagnostic path must keep working').toBe(200);
    expect(await res.text()).toContain('env');
  });
});
