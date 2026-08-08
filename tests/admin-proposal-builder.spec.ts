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

    // Step 1: type-first search (round 5), then pick the customer.
    await page.getByTestId('customer-search-input').fill('maria');
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

    // The bundle is a visible block (round 6): its name is an inline input,
    // its price is the members' sum, and both members are listed inside.
    await expect(page.locator('[data-testid^="builder-bundle-name-"]')).toHaveValue('Demo package');
    await expect(page.getByTestId('builder-cat-demolition').getByText('$4,800.00', { exact: true })).toBeVisible();
    await expect(page.getByTestId('builder-cat-demolition').getByText('Remove existing cabinets')).toBeVisible();
    await expect(page.getByTestId('builder-cat-demolition').getByText('Debris haul-away')).toBeVisible();

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

  test('round 6: Take out re-sums, and at one member the bundle dissolves', async ({ page }) => {
    await page.goto('/vaca-mgmt/proposals');
    await page.getByTestId('open-builder').click();
    await page.getByTestId('customer-search-input').fill('maria');
    await page.getByTestId('customer-row-7b39c2ba-58f5-4d68-9d5a-2f4f5f27a001').click();
    await page.locator('#pb-title').fill('T');
    await page.getByTestId('builder-to-lines').click();

    await page.getByTestId('builder-cat-pick-demolition').click();
    for (const [t, p] of [['Line A', '100'], ['Line B', '200'], ['Line C', '300']] as const) {
      await page.getByTestId('builder-line-title-demolition').fill(t);
      await page.getByTestId('builder-line-price-demolition').fill(p);
      await page.getByTestId('builder-add-line-demolition').click();
    }
    const checkboxes = page.getByTestId('builder-cat-demolition').getByRole('checkbox');
    await checkboxes.nth(0).check();
    await checkboxes.nth(1).check();
    await checkboxes.nth(2).check();
    await page.getByTestId('builder-bundle-button').click();

    // Three members, $600 total.
    const bundle = page.locator('[data-testid^="builder-bundle-"][data-testid$="9"], [data-testid^="builder-bundle-"]').first();
    await expect(bundle.getByText('$600.00', { exact: true })).toBeVisible();

    // Take out one member: the bundle re-sums to the remaining two.
    await page.locator('[data-testid^="builder-takeout-"]').first().click();
    await expect(page.locator('[data-testid^="builder-bundle-"]').first().getByText('$500.00', { exact: true })).toBeVisible();

    // Take out another: one member left means no bundle at all.
    await page.locator('[data-testid^="builder-takeout-"]').first().click();
    await expect(page.locator('[data-testid^="builder-bundle-name-"]')).toHaveCount(0);
    // All three lines are standalone again.
    await expect(page.getByTestId('builder-cat-demolition').getByText('Line A')).toBeVisible();
    await expect(page.getByTestId('builder-cat-demolition').getByText('Line B')).toBeVisible();
    await expect(page.getByTestId('builder-cat-demolition').getByText('Line C')).toBeVisible();
  });

  test('round 6: dragging a line onto another bundles them instantly, auto-named', async ({ page }) => {
    await page.goto('/vaca-mgmt/proposals');
    await page.getByTestId('open-builder').click();
    await page.getByTestId('customer-search-input').fill('maria');
    await page.getByTestId('customer-row-7b39c2ba-58f5-4d68-9d5a-2f4f5f27a001').click();
    await page.locator('#pb-title').fill('T');
    await page.getByTestId('builder-to-lines').click();

    await page.getByTestId('builder-cat-pick-demolition').click();
    for (const [t, p] of [['Drag me', '150'], ['Onto me', '250']] as const) {
      await page.getByTestId('builder-line-title-demolition').fill(t);
      await page.getByTestId('builder-line-price-demolition').fill(p);
      await page.getByTestId('builder-add-line-demolition').click();
    }

    // Native HTML5 DnD, dispatched the same way the importer's own drag spec
    // does it. The drop lands mid-row (below the 30% edge) = the 'onto' zone.
    await page.evaluate(() => {
      const rows = [...document.querySelectorAll('[data-testid="builder-cat-demolition"] [draggable="true"]')] as HTMLElement[];
      const source = rows.find((r) => r.textContent?.includes('Drag me'))!;
      const target = rows.find((r) => r.textContent?.includes('Onto me'))!;
      const dt = new DataTransfer();
      source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
      const rect = target.getBoundingClientRect();
      const mid = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height * 0.8 };
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt, ...mid }));
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt, ...mid }));
      source.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
    });

    // Instant auto-named package of the two, price summed.
    await expect(page.locator('[data-testid^="builder-bundle-name-"]')).toHaveValue('Bundle (2 items)');
    await expect(page.locator('[data-testid^="builder-bundle-"]').first().getByText('$400.00', { exact: true })).toBeVisible();
    await expect(page.locator('[data-testid^="builder-bundle-"]').first().getByText('Drag me')).toBeVisible();
    await expect(page.locator('[data-testid^="builder-bundle-"]').first().getByText('Onto me')).toBeVisible();
  });

  test('round 7: dropping one section on another combines them into a portion; Split apart restores', async ({ page }) => {
    await page.goto('/vaca-mgmt/proposals');
    await page.getByTestId('open-builder').click();
    await page.getByTestId('customer-search-input').fill('maria');
    await page.getByTestId('customer-row-7b39c2ba-58f5-4d68-9d5a-2f4f5f27a001').click();
    await page.locator('#pb-title').fill('T');
    await page.getByTestId('builder-to-lines').click();

    // Two trades, one line each.
    await page.getByTestId('builder-cat-pick-demolition').click();
    await page.getByTestId('builder-line-title-demolition').fill('Tear-out');
    await page.getByTestId('builder-line-price-demolition').fill('1000');
    await page.getByTestId('builder-add-line-demolition').click();
    await page.getByTestId('builder-cat-pick-permits-fees').click();
    await page.getByTestId('builder-line-title-permits-fees').fill('Township permits');
    await page.getByTestId('builder-line-price-permits-fees').fill('500');
    await page.getByTestId('builder-add-line-permits-fees').click();

    // Drag the Permits SECTION (by its header grip) onto the Demolition
    // section's body - the combine zone.
    await page.evaluate(() => {
      const handle = document.querySelector('[data-testid="builder-cat-permits-fees"] [draggable="true"]') as HTMLElement;
      const target = document.querySelector('[data-testid="builder-section-demolition"]') as HTMLElement;
      const dt = new DataTransfer();
      handle.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
      const rect = target.getBoundingClientRect();
      const mid = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height * 0.8 };
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt, ...mid }));
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt, ...mid }));
      handle.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
    });

    // The portion: auto-named from both trades, locked together, one total,
    // both sub-areas inside.
    const portionName = page.locator('[data-testid^="builder-portion-name-"]');
    await expect(portionName).toHaveValue('Demolition + Permits & Fees');
    const portion = page.locator('[data-testid^="builder-portion-"]').first();
    await expect(portion.getByText('locked together')).toBeVisible();
    await expect(portion.getByText('$1,500.00', { exact: true })).toBeVisible();
    await expect(portion.getByText('Tear-out')).toBeVisible();
    await expect(portion.getByText('Township permits')).toBeVisible();

    // Split apart: both trades return as their own sections.
    await page.locator('[data-testid^="builder-split-"]').click();
    await expect(page.locator('[data-testid^="builder-portion-"]')).toHaveCount(0);
    await expect(page.getByTestId('builder-cat-demolition').getByText('Tear-out')).toBeVisible();
    await expect(page.getByTestId('builder-cat-permits-fees').getByText('Township permits')).toBeVisible();
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
    await page.getByTestId('customer-search-input').fill('maria');
    await page.getByTestId('customer-row-7b39c2ba-58f5-4d68-9d5a-2f4f5f27a001').click();
    await page.locator('#pb-title').fill('T');
    await page.getByTestId('builder-to-lines').click();

    await page.getByTestId('builder-cat-query').fill('Solar Panels');
    await page.getByTestId('builder-cat-create').click();
    await expect(page.getByText('ask your admin', { exact: false }).first()).toBeVisible();
  });
});

test.describe('round 9: customer-first proposals page', () => {
  test.use({ viewport: { width: 1280, height: 1000 } });

  const MARIA_PROPOSAL = {
    id: '55555555-5555-4555-8555-555555555555',
    client_name: 'Maria Delgado',
    client_email: 'maria.delgado@example.com',
    title: 'Kitchen remodel - 12 Maple Ave',
    status: 'draft',
    token: 'e'.repeat(43),
    line_count: 2,
    submission_count: 0,
    latest_total_cents: null,
    updated_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  };

  /** The stored lines the GET answers with - one plain line, one bundle. */
  const STORED_LINES = [
    {
      id: 'aaaaaaa1-0000-4000-8000-000000000001',
      proposal_id: MARIA_PROPOSAL.id,
      position: 0,
      title: 'Tear-out and prep',
      description: 'Strip to studs',
      price_cents: 480000,
      optional: false,
      category: 'demolition',
      bundle_members: null,
    },
    {
      id: 'aaaaaaa2-0000-4000-8000-000000000002',
      proposal_id: MARIA_PROPOSAL.id,
      position: 1,
      title: 'Cabinet package',
      description: '',
      price_cents: 630050,
      optional: true,
      category: 'cabinets',
      bundle_members: [
        { title: 'Base cabinets', price_cents: 400000 },
        { title: 'Crown and trim', price_cents: 230050 },
      ],
    },
  ];

  const rosterJson = (rows: unknown[]) => ({
    proposals: rows, counts_available: true, total: rows.length, truncated: false,
  });

  test.beforeEach(async ({ page, context, baseURL }) => {
    await signInAsAdmin(context, baseURL!);
    await page.route('**/api/admin/estimate-email/leads*', async (route) => {
      await route.fulfill({ json: CUSTOMER_HITS });
    });
    await page.route('**/api/admin/proposal-categories', async (route) => {
      await route.fulfill({ json: CATEGORY_LIBRARY });
    });
  });

  test('one search bar: picking the customer scopes the page, and Open & modify round-trips the stored lines', async ({ page }) => {
    const reimports: Array<Record<string, unknown>> = [];
    let reads = 0;
    // The [id] route is its own pattern: a glob's `*` stops at `/`, so the
    // roster pattern below never reaches it.
    await page.route(`**/api/admin/proposals/${MARIA_PROPOSAL.id}`, async (route) => {
      if (route.request().method() === 'GET') {
        reads += 1;
        await route.fulfill({ json: { proposal: MARIA_PROPOSAL, lines: STORED_LINES } });
        return;
      }
      reimports.push(route.request().postDataJSON());
      await route.fulfill({ json: { ok: true } });
    });
    await page.route('**/api/admin/proposals*', async (route) => {
      await route.fulfill({ json: rosterJson([MARIA_PROPOSAL]) });
    });

    await page.goto('/vaca-mgmt/proposals');
    // Fresh page: the recent list, with the importer folded behind its link.
    await expect(page.getByTestId('roster-heading')).toHaveText('Recent proposals');
    await expect(page.getByTestId('csv-importer-card')).toHaveCount(0);
    await expect(page.getByTestId('open-importer')).toBeVisible();

    // The one search bar finds the PERSON - lead and proposals merged into a
    // single row that carries the proposal count.
    await page.getByTestId('roster-search').fill('maria');
    const hit = page.getByTestId('client-search-popover').getByTestId('client-hit');
    await expect(hit).toContainText('Maria Delgado');
    await expect(hit).toContainText('1 proposal');
    await hit.click();
    await expect(page.getByTestId('client-header')).toContainText('Maria Delgado');
    await expect(page.getByTestId('roster-heading')).toContainText('Maria Delgado');

    // Click into the proposal: the builder opens in edit mode holding the
    // stored lines - the plain line in its category, and the bundle with its
    // members and ONE summed price.
    await page.getByTestId('roster-identity').click();
    await expect(page.getByTestId('proposal-builder')).toBeVisible();
    expect(reads).toBe(1);
    await expect(page.getByText(`Edit: ${MARIA_PROPOSAL.title}`)).toBeVisible();
    await expect(page.getByTestId('builder-edit-client')).toContainText('Maria Delgado');
    await expect(page.getByTestId('builder-cat-demolition').getByText('Tear-out and prep')).toBeVisible();
    const cabinets = page.getByTestId('builder-cat-cabinets');
    await expect(cabinets.getByText('$6,300.50', { exact: true })).toBeVisible();
    await expect(cabinets.getByText('Base cabinets')).toBeVisible();
    await expect(cabinets.getByText('Crown and trim')).toBeVisible();
    await expect(page.locator('[data-testid^="builder-bundle-name-"]')).toHaveValue('Cabinet package');

    // Save replaces the lines on the SAME proposal - the re-import action.
    await page.getByTestId('builder-to-review').click();
    const save = page.getByTestId('builder-create');
    await expect(save).toHaveText('Save changes');
    await save.click();
    await expect.poll(() => reimports.length).toBe(1);
    const body = reimports[0] as {
      action: string;
      lines: Array<{ title: string; category: string; price_cents: number; optional: boolean; bundle_members?: Array<{ title: string; price_cents: number }> }>;
    };
    expect(body.action).toBe('reimport');
    expect(body.lines).toHaveLength(2);
    expect(body.lines[0]).toMatchObject({
      title: 'Tear-out and prep', category: 'demolition', price_cents: 480000, optional: false,
    });
    expect(body.lines[1]).toMatchObject({
      title: 'Cabinet package', category: 'cabinets', price_cents: 630050, optional: true,
      bundle_members: [
        { title: 'Base cabinets', price_cents: 400000 },
        { title: 'Crown and trim', price_cents: 230050 },
      ],
    });
    await expect(page.getByText('Proposal updated', { exact: true }).first()).toBeVisible();
  });

  test('a revoked row refuses Open & modify, and names the way back', async ({ page }) => {
    let reads = 0;
    await page.route(`**/api/admin/proposals/${MARIA_PROPOSAL.id}`, async (route) => {
      reads += 1;
      await route.fulfill({ json: { proposal: MARIA_PROPOSAL, lines: [] } });
    });
    await page.route('**/api/admin/proposals*', async (route) => {
      await route.fulfill({ json: rosterJson([{ ...MARIA_PROPOSAL, status: 'revoked' }]) });
    });

    await page.goto('/vaca-mgmt/proposals');
    const row = page.getByTestId(`proposal-${MARIA_PROPOSAL.id}`);
    await expect(row.getByTestId('edit-hint')).toContainText('Restore to draft to edit');
    await row.getByTestId('roster-identity').click();
    await expect(page.getByText('This proposal is revoked', { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId('proposal-builder')).toHaveCount(0);
    expect(reads, 'a refused edit never even reads the lines').toBe(0);
  });

  test('New proposal for the selected customer starts on details with the customer answered', async ({ page }) => {
    await page.route('**/api/admin/proposals*', async (route) => {
      await route.fulfill({ json: rosterJson([MARIA_PROPOSAL]) });
    });

    await page.goto('/vaca-mgmt/proposals');
    await page.getByTestId('roster-search').fill('maria');
    await page.getByTestId('client-search-popover').getByTestId('client-hit').click();
    await page.getByTestId('new-for-client').click();

    await expect(page.getByTestId('proposal-builder')).toBeVisible();
    // Step 1 is already answered: the chip names the customer, and the page
    // opens on details rather than making the admin re-find who they had.
    await expect(page.getByTestId('builder-step-0')).toContainText('Customer: Maria Delgado');
    await expect(page.locator('#pb-client-name')).toHaveValue('Maria Delgado');
    await expect(page.locator('#pb-client-email')).toHaveValue('maria.delgado@example.com');
  });

  test('the importer is one click away, and Hide folds it back', async ({ page }) => {
    await page.route('**/api/admin/proposals*', async (route) => {
      await route.fulfill({ json: rosterJson([]) });
    });

    await page.goto('/vaca-mgmt/proposals');
    await expect(page.getByTestId('csv-importer-card')).toHaveCount(0);
    await page.getByTestId('open-importer').click();
    await expect(page.getByTestId('csv-importer-card')).toBeVisible();
    await page.getByTestId('close-importer').click();
    await expect(page.getByTestId('csv-importer-card')).toHaveCount(0);
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

    // Picking a customer (type-first) runs the lookup and opens the rest.
    await page.getByTestId('customer-search-input').fill('maria');
    await page.getByTestId('customer-row-7b39c2ba-58f5-4d68-9d5a-2f4f5f27a001').click();
    await expect(page.getByTestId('sq-scope')).toBeVisible();
    await expect(page.getByTestId('sq-step2-waiting')).toHaveCount(0);
    await expect(page.getByTestId('sq-address')).toBeVisible();
  });
});
