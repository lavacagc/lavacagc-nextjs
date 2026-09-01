import { test, expect, type BrowserContext } from '@playwright/test';

/**
 * The redesigned admin Dashboard (2026-08-08): four pulse tiles, an attention
 * banner, and the article list - all fed by ONE fetch to /api/admin/dashboard.
 * The route is mocked at the network layer (same approach as
 * admin-follow-ups.spec.ts) so these run against the stub backend.
 */

const DASHBOARD_PAYLOAD = {
  articles: [
    {
      id: 'post-1',
      title: 'Fall Home Renovation Guide for Northern NJ',
      slug: 'fall-home-renovation-guide',
      created_at: '2026-04-11T12:00:00Z',
      updated_at: '2026-04-11T12:00:00Z',
    },
    {
      id: 'post-2',
      title: 'Luxury Kitchen Remodels in Short Hills NJ',
      slug: 'luxury-kitchen-remodels-short-hills',
      created_at: '2026-04-08T12:00:00Z',
      updated_at: '2026-04-08T12:00:00Z',
    },
  ],
  drafts: 1,
  // Far in the past, so the >14-day staleness nudge always fires.
  lastPublishedAt: '2026-04-11T12:00:00Z',
  emails30d: { total: 130, failed: 1, bounced: 1, ok: 128 },
  leads7d: 1,
  pendingSuggestions: 14,
  pendingFollowUps: 2,
};

async function signInAsAdmin(context: BrowserContext, baseURL: string) {
  const session = {
    access_token: 'stub-access-token',
    refresh_token: 'stub-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: '00000000-0000-0000-0000-000000000001', aud: 'authenticated', role: 'authenticated' },
  };
  await context.addCookies([
    {
      name: 'sb-127-auth-token',
      value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'),
      url: baseURL,
    },
  ]);
}

test.describe('admin Dashboard', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test.beforeEach(async ({ page, context, baseURL }) => {
    await signInAsAdmin(context, baseURL!);
    await page.route('**/api/admin/dashboard', async (route) => {
      await route.fulfill({ json: DASHBOARD_PAYLOAD });
    });
  });

  test('renders the four pulse tiles from one fetch', async ({ page }) => {
    let dashboardCalls = 0;
    await page.route('**/api/admin/dashboard', async (route) => {
      dashboardCalls += 1;
      await route.fulfill({ json: DASHBOARD_PAYLOAD });
    });

    await page.goto('/vaca-mgmt');
    await expect(page.getByText('Emails delivered / problems (30d)')).toBeVisible();
    await expect(page.getByText('128 / 2')).toBeVisible();
    await expect(page.getByText('New leads (7 days)')).toBeVisible();
    await expect(page.getByText('Content updates waiting for review')).toBeVisible();
    await expect(page.getByText('Follow-up emails queued')).toBeVisible();
    expect(dashboardCalls).toBe(1);
  });

  test('the attention banner reports staleness and email problems', async ({ page }) => {
    await page.goto('/vaca-mgmt');
    await expect(page.getByText('Needs your attention')).toBeVisible();
    await expect(page.getByText(/No new article since/)).toBeVisible();
    await expect(page.getByText(/1 email failed and 1 bounced/)).toBeVisible();
  });

  test('articles list: Edit opens the blog editor for that post', async ({ page }) => {
    await page.goto('/vaca-mgmt');
    const row = page
      .locator('div')
      .filter({ hasText: 'Fall Home Renovation Guide for Northern NJ' })
      .getByRole('button', { name: 'Edit' })
      .first();
    await row.click();
    await expect(page.getByRole('heading', { name: 'Edit Blog Post' })).toBeVisible();
  });

  test('a pulse tile navigates to its tab', async ({ page }) => {
    // The Leads tab fetches on mount; keep it deterministic.
    await page.route('**/api/leads/list', async (route) => {
      await route.fulfill({ json: [] });
    });
    await page.goto('/vaca-mgmt');
    await page.getByRole('button', { name: /New leads \(7 days\)/ }).click();
    await expect(page.getByRole('heading', { name: 'Leads Management' })).toBeVisible();
  });

  test('no green banner theatre: healthy data shows no attention banner', async ({ page }) => {
    await page.route('**/api/admin/dashboard', async (route) => {
      await route.fulfill({
        json: {
          ...DASHBOARD_PAYLOAD,
          emails30d: { total: 130, failed: 0, bounced: 0, ok: 130 },
          lastPublishedAt: new Date().toISOString(),
        },
      });
    });
    await page.goto('/vaca-mgmt');
    await expect(page.getByText('Emails delivered / problems (30d)')).toBeVisible();
    await expect(page.getByText('Needs your attention')).toHaveCount(0);
  });
});
