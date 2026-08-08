import { test, expect, type BrowserContext } from '@playwright/test';

/**
 * Round 4 (2026-08-08): the by-hand proposal builder (customer -> details ->
 * category-grouped lines with bundling -> review/create), the hybrid
 * admin-only category creation, and the Send Service Quote progressive steps
 * (a fresh page shows only step 1; the first lookup expands 2 and 3).
 *
 * Backend surfaces mocked at the network layer, as the other /vaca-mgmt specs do.
 */

const CUSTOMER_HITS = {
  leads: [
    {
      id: '7b39c2ba-58f5-4d68-9d5a-2f4f5f27a001',
      name: 'Maria Delgado',
      email: 'maria.delgado@example.com',
      phone: '9735550142',
      project_type: 'Kitchen Remodeling',
      city: 'Montclair',
      source: null,
      created_at: '2026-08-01T12:00:00Z',
    },
  ],
};

const CATEGORY_LIBRARY = {
  categories: [
    { key: 'demolition', label: 'Demolition', optional: false },
    { key: 'cabinets', label: 'Cabinets', optional: true },
    { key: 'permits-fees', label: 'Permits & Fees', optional: false },
  ],
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

test.describe('proposal builder', () => {
  test.use({ viewport: { width: 1280, height: 1000 } });

  test.beforeEach(async ({ page, context, baseURL }) => {
    await signInAsAdmin(context, baseURL!);
    // Roster + counts, both empty - the builder is the subject here.
    await page.route('**/api/admin/proposals?*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: { proposals: [], total: 0, truncated: false, counts_available: false } });
        return;
      }
      await route.fallback();
    });
    await page.route('**/api/admin/estimate-email/leads*', async (route) => {
      await route.fulfill({ json: CUSTOMER_HITS });
    });
    await page.route('**/api/admin/proposal-categories', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: CATEGORY_LIBRARY });
        return;
      }
      await route.fallback();
    });
  });

  test('builds a bundled proposal end to end and posts the importer-shaped payload', async ({ page }) => {
    const creates: Array<Record<string, unknown>> = [];
    await page.route('**/api/admin/proposals', async (route) => {
      if (route.request().method() === 'POST') {
        creates.push(route.request().postDataJSON());
        await route.fulfill({ json: { proposal: { id: 'p-1', client_name: 'Maria Delgado', status: 'draft' } } });
        return;
      }
      await route.fulfill({ json: { proposals: [], total: 0, truncated: false, counts_available: false } });
    });

    await page.goto('/vaca-mgmt/proposals');
    await page.getByTestId('open-builder').click();
    await expect(page.getByTestId('proposal-builder')).toBeVisible();

    // Step 1: pick the customer - name/email carry into step 2.
    await page.getByTestId('customer-row-7b39c2ba-58f5-4d68-9d5a-2f4f5f27a001').click();
    await expect(page.locator('#pb-client-name')).toHaveValue('Maria Delgado');
    await page.locator('#pb-title').fill('Kitchen remodel - 12 Maple Ave');
    await page.getByTestId('builder-to-lines').click();

    // Step 3: one locked category, two lines, bundled into one package.
    await page.getByTestId('builder-cat-pick-demolition').click();
    await page.getByTestId('builder-line-title-demolition').fill('Remove existing cabinets');
    await page.getByTestId('builder-line-price-demolition').fill('3200');
    await page.getByTestId('builder-add-line-demolition').click();
    await page.getByTestId('builder-line-title-demolition').fill('Debris haul-away');
    await page.getByTestId('builder-line-price-demolition').fill('$1,600');
    await page.getByTestId('builder-add-line-demolition').click();

    const checkboxes = page.getByTestId('builder-cat-demolition').getByRole('checkbox');
    await checkboxes.nth(0).check();
    await checkboxes.nth(1).check();
    await page.getByTestId('builder-bundle-name').fill('Demo package');
    await page.getByTestId('builder-bundle-button').click();

    // The bundle shows one price - the members' sum.
    await expect(page.getByTestId('builder-cat-demolition').getByText('Demo package')).toBeVisible();
    await expect(page.getByTestId('builder-cat-demolition').getByText('$4,800.00', { exact: true })).toBeVisible();

    await page.getByTestId('builder-to-review').click();
    await expect(page.getByText('Kitchen remodel - 12 Maple Ave')).toBeVisible();
    await page.getByTestId('builder-create').click();

    await expect.poll(() => creates.length).toBe(1);
    const body = creates[0] as {
      client_name: string; lead_id: string; title: string;
      lines: Array<{ title: string; category: string; price_cents: number; optional: boolean; bundle_members?: Array<{ title: string; price_cents: number }> }>;
    };
    expect(body.client_name).toBe('Maria Delgado');
    expect(body.lead_id).toBe('7b39c2ba-58f5-4d68-9d5a-2f4f5f27a001');
    expect(body.lines).toHaveLength(1);
    expect(body.lines[0].title).toBe('Demo package');
    expect(body.lines[0].category).toBe('demolition');
    expect(body.lines[0].price_cents).toBe(480000);
    // Locked member locks the bundle (the pure module's fail-safe).
    expect(body.lines[0].optional).toBe(false);
    expect(body.lines[0].bundle_members).toEqual([
      { title: 'Remove existing cabinets', price_cents: 320000 },
      { title: 'Debris haul-away', price_cents: 160000 },
    ]);
  });

  test('category creation is admin-only: a collaborator is told to ask their admin', async ({ page }) => {
    await page.route('**/api/admin/proposal-categories', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 403,
          json: { error: 'Only an admin can create categories - ask your admin to add it.' },
        });
        return;
      }
      await route.fulfill({ json: CATEGORY_LIBRARY });
    });

    await page.goto('/vaca-mgmt/proposals');
    await page.getByTestId('open-builder').click();
    await page.getByTestId('customer-row-7b39c2ba-58f5-4d68-9d5a-2f4f5f27a001').click();
    await page.locator('#pb-title').fill('T');
    await page.getByTestId('builder-to-lines').click();

    await page.getByTestId('builder-cat-query').fill('Solar Panels');
    await page.getByTestId('builder-cat-create').click();
    await expect(page.getByText('ask your admin', { exact: false })).toBeVisible();
  });
});

test.describe('send service quote - progressive steps', () => {
  test.use({ viewport: { width: 1280, height: 1000 } });

  test('a fresh page shows only step 1; the first lookup expands 2 and 3', async ({ page, context, baseURL }) => {
    await signInAsAdmin(context, baseURL!);
    await page.route('**/api/admin/crew', async (route) => {
      await route.fulfill({ json: { recipients: [] } });
    });
    await page.route('**/api/admin/estimate-email/leads*', async (route) => {
      await route.fulfill({ json: CUSTOMER_HITS });
    });
    await page.route('**/api/admin/service-quote/intake*', async (route) => {
      await route.fulfill({
        json: {
          catalog: [], catalogRead: 'ok',
          requests: [], requestsRead: 'ok',
          homeowner: null, homeownerRead: 'ok',
          completions: [], completionsRead: 'ok',
          bookings: [], bookingsRead: 'ok',
        },
      });
    });

    await page.goto('/vaca-mgmt/send-service-quote');

    // Fresh: steps 2 and 3 are placeholders, their fields hidden.
    await expect(page.getByTestId('sq-step2-waiting')).toBeVisible();
    await expect(page.getByTestId('sq-step3-waiting')).toBeVisible();
    await expect(page.getByTestId('sq-scope')).toBeHidden();

    // Picking a customer runs the lookup and opens the rest.
    await page.getByTestId('customer-row-7b39c2ba-58f5-4d68-9d5a-2f4f5f27a001').click();
    await expect(page.getByTestId('sq-scope')).toBeVisible();
    await expect(page.getByTestId('sq-step2-waiting')).toHaveCount(0);
    await expect(page.getByTestId('sq-address')).toBeVisible();
  });
});
