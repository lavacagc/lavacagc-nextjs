import { test, expect } from '@playwright/test';

/**
 * The daily Google review sync (2026-08-08).
 *
 * What it replaces: a monthly pg_cron job that called the edge function's
 * sync endpoint WITHOUT refreshing the Google access token first - so every
 * scheduled run was refused with 401 UNAUTHENTICATED - and then marked its own
 * log row "success" regardless, because pg_net's http_post is fire-and-forget.
 * The integration looked healthy for months while syncing nothing.
 *
 * These specs pin the two properties that failure depended on: the route
 * refuses anyone without the cron secret, and the run REFRESHES BEFORE IT
 * SYNCS. The order is the whole fix.
 */

const CRON_PATH = '/api/cron/sync-reviews';

test.describe('GET /api/cron/sync-reviews', () => {
  test('refuses a caller with no cron secret', async ({ request }) => {
    const res = await request.get(CRON_PATH);
    // 401 from the route or the middleware; either way it is not doing work.
    expect([401, 500]).toContain(res.status());
    const body = await res.json().catch(() => null);
    expect(body?.error ?? '').not.toBe('');
  });

  test('refuses a wrong secret', async ({ request }) => {
    const res = await request.get(CRON_PATH, {
      headers: { authorization: 'Bearer not-the-secret' },
    });
    expect([401, 500]).toContain(res.status());
  });
});

/**
 * The order of operations, checked against the module rather than the network:
 * the sync talks to a live Google integration, so a browser test that actually
 * ran it would either need production credentials or prove nothing. What can
 * be checked here is the thing that was wrong - and it is structural.
 */
test.describe('the sync module refreshes before it syncs', () => {
  test('refresh-token is called first, and a failed refresh never reaches sync', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/lib/reviews/syncGoogleReviews.ts', 'utf8');

    const refreshAt = source.indexOf("'refresh-token'");
    const syncAt = source.indexOf("'sync-reviews'");
    expect(refreshAt, 'the refresh call exists').toBeGreaterThan(-1);
    expect(syncAt, 'the sync call exists').toBeGreaterThan(-1);
    expect(refreshAt, 'refresh is called BEFORE sync - the whole fix').toBeLessThan(syncAt);

    // A failed refresh must short-circuit: syncing on a token we already know
    // is bad is exactly the 401 loop this replaced.
    expect(source).toContain('if (!refresh.ok)');

    // And every outcome is written down, including the failures the old job
    // hid behind an unconditional "success".
    expect(source).toContain("'review_sync_log'");
    expect(source).toContain('status: result.status');
  });

  test('the route announces a failure instead of swallowing it', async () => {
    const { readFileSync } = await import('fs');
    const route = readFileSync('src/app/api/cron/sync-reviews/route.ts', 'utf8');
    expect(route).toContain("result.status === 'error'");
    expect(route).toContain('sendTelegramMessage');
    // A failed sync is still a completed run - a non-2xx would only earn a
    // Vercel retry that fails the same way.
    expect(route).toContain('return NextResponse.json(result)');
  });

  test('the daily schedule is wired in vercel.json', async () => {
    const { readFileSync } = await import('fs');
    const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
      crons: { path: string; schedule: string }[];
    };
    const entry = vercel.crons.find((c) => c.path === CRON_PATH);
    expect(entry, 'the cron is registered').toBeTruthy();
    // Daily, not monthly - the old job ran on the 1st of the month.
    expect(entry!.schedule.split(' ')[2], 'runs every day of the month').toBe('*');
    expect(entry!.schedule.split(' ')[3], 'in every month').toBe('*');
  });
});
