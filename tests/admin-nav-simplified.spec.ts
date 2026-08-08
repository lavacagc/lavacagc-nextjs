import { test, expect, type BrowserContext } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The 2026-08 admin simplification: 34 sidebar tabs became 24 across 5 groups,
 * Buy + Remodel retired site-wide, and the Feedback tab's create form folded
 * into Follow-Ups. These specs pin the new shape so tabs don't silently
 * reappear or vanish, plus browser checks for the seams the restructure
 * touched (stub backend; same sign-in shim as admin-follow-ups.spec.ts).
 */

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

// The complete post-simplification leaf inventory. Deliberately exhaustive:
// adding or removing a tab should be a conscious edit here too.
const EXPECTED_LEAF_IDS = [
  'dashboard',
  // Content (Compliance Docs moved here when Settings dissolved, 2026-08-08)
  'blog', 'pages', 'services', 'service-areas', 'projects', 'banners', 'compliance',
  // Marketing
  'seo', 'analytics', 'conversions', 'gmb', 'preferences',
  // Customers
  'leads', 'follow-ups', 'send-estimate', 'proposals', 'emails',
  // Home Care
  'home-records', 'home-care-shop', 'send-service-quote', 'crew', 'releases',
];

const REMOVED_IDS = [
  'diagnostics', 'ai', 'listings', 'subscribers', 'estimate-log', 'feedback',
  'reports', 'performance', 'uptime', 'non-negotiables', 'seo-suggestions',
  // Retired with the calculator product (2026-08-08)
  'estimates', 'pricing',
];

test.describe('sidebar + content registration (source checks)', () => {
  test('the sidebar exposes exactly the simplified tab inventory', () => {
    const sidebar = read('src/components/admin/AdminSidebar.tsx');
    for (const id of EXPECTED_LEAF_IDS) {
      expect(sidebar, `sidebar must have '${id}'`).toContain(`id: '${id}'`);
    }
    for (const id of REMOVED_IDS) {
      expect(sidebar, `sidebar must NOT have removed tab '${id}'`).not.toContain(`id: '${id}'`);
    }
  });

  test('AdminContent has a panel for every sidebar leaf and none for removed tabs', () => {
    const content = read('src/components/AdminContent.tsx');
    for (const id of EXPECTED_LEAF_IDS) {
      expect(content, `AdminContent must render value="${id}"`).toContain(`value="${id}"`);
    }
    for (const id of REMOVED_IDS) {
      expect(content, `AdminContent must NOT render removed value="${id}"`).not.toContain(`value="${id}"`);
    }
  });

  test('the dashboard SEO button targets the live seo tab (the old target blanked the pane)', () => {
    const dashboard = read('src/components/admin/AdminDashboard.tsx');
    expect(dashboard).toContain("onNavigateToTab('seo')");
    expect(dashboard).not.toContain("onNavigateToTab('sitemap')");
  });
});

test.describe('Buy + Remodel retirement', () => {
  test('public pages 301 to the homepage', async ({ request }) => {
    for (const path of ['/buy-and-remodel', '/buy-and-remodel/some-listing']) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect([301, 308], `${path} must permanent-redirect`).toContain(res.status());
      const location = res.headers()['location'] ?? '';
      expect(location.replace(/^https?:\/\/[^/]+/, '') || '/', `${path} must land on /`).toBe('/');
    }
  });

  test('the unsubscribe endpoint survives for links in already-sent emails', async ({ request }) => {
    const res = await request.get('/api/buy-and-remodel/unsubscribe');
    // Self-guarded: no token renders the "Invalid link" page - the route must
    // exist (not 404) because sent emails carry these links forever.
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain('Invalid link');
  });

  test('the homepage renders no Buy + Remodel links', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('a[href*="buy-and-remodel"]')).toHaveCount(0);
  });
});

test.describe('follow-ups absorbs the review-request form', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

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

  test('the Request a review card queues the day-0/3/7 sequence', async ({ page, context, baseURL }) => {
    await signInAsAdmin(context, baseURL!);

    await page.route('**/api/admin/follow-ups', async (route) => {
      await route.fulfill({ json: { rows: [] } });
    });
    const createBodies: Array<Record<string, unknown>> = [];
    await page.route('**/api/feedback/create', async (route) => {
      createBodies.push(route.request().postDataJSON());
      await route.fulfill({ json: { success: true } });
    });

    await page.goto('/vaca-mgmt/follow-ups');
    await expect(page.getByRole('heading', { name: 'Request a review' })).toBeVisible();

    await page.getByLabel('Customer name').fill('Jane Smith');
    await page.getByLabel('Email').fill('jane@example.com');
    await page.getByRole('button', { name: 'Queue review emails' }).click();

    await expect.poll(() => createBodies.length).toBe(1);
    expect(createBodies[0]).toEqual({ customerName: 'Jane Smith', email: 'jane@example.com' });
  });
});
