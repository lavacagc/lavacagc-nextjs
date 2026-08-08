import { test, expect, type BrowserContext, type Page } from '@playwright/test';

/**
 * Round 3 (2026-08-08): the shared customer typeahead on Send Estimate and
 * Send Service Quote (find anyone by name/email/phone, or save a new customer
 * as a manual lead), and the Email Log in-tab detail drawer that replaced the
 * SPA-exiting row links (the vanishing-sidebar bug).
 *
 * All backend surfaces are mocked at the network layer, same as the other
 * /vaca-mgmt specs.
 */

const HITS = {
  leads: [
    {
      id: 'lead-1',
      name: 'Maria Delgado',
      email: 'maria.delgado@example.com',
      phone: '9735550142',
      project_type: 'Kitchen Remodeling',
      city: 'Montclair',
      source: null,
      created_at: '2026-08-01T12:00:00Z',
    },
    {
      id: 'lead-2',
      name: 'Mark Osei',
      email: 'mosei@example.com',
      phone: '2015550177',
      project_type: null,
      city: null,
      source: 'manual',
      created_at: '2026-08-02T12:00:00Z',
    },
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

async function mockCustomerSearch(page: Page) {
  await page.route('**/api/admin/estimate-email/leads*', async (route) => {
    await route.fulfill({ json: HITS });
  });
}

test.describe('customer typeahead - Send Estimate', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test.beforeEach(async ({ context, baseURL }) => {
    await signInAsAdmin(context, baseURL!);
  });

  test('selecting a hit prefills the estimate form', async ({ page }) => {
    await mockCustomerSearch(page);
    await page.goto('/vaca-mgmt/send-estimate');

    await expect(page.getByTestId('customer-row-lead-1')).toBeVisible();
    // The manual entry carries its badge.
    await expect(page.getByTestId('customer-row-lead-2').getByText('saved by you')).toBeVisible();

    await page.getByTestId('customer-row-lead-1').click();
    await expect(page.locator('#recipientName')).toHaveValue('Maria Delgado');
    await expect(page.locator('#recipientEmail')).toHaveValue('maria.delgado@example.com');
  });

  test('save a new customer inserts a manual lead and selects it', async ({ page }) => {
    await mockCustomerSearch(page);
    const inserts: Array<Record<string, unknown>> = [];
    await page.route('**/api/admin/customers', async (route) => {
      const body = route.request().postDataJSON();
      inserts.push(body);
      await route.fulfill({
        json: {
          customer: {
            id: 'lead-new',
            name: `${body.firstName} ${body.lastName}`.trim(),
            email: body.email,
            phone: body.phone,
            project_type: null,
            city: body.city || null,
            source: 'manual',
            created_at: '2026-08-08T12:00:00Z',
          },
        },
      });
    });

    await page.goto('/vaca-mgmt/send-estimate');
    await page.getByTestId('customer-add-button').click();
    await page.locator('#cs-first').fill('Jane');
    await page.locator('#cs-last').fill('Smith');
    await page.locator('#cs-email').fill('jane.smith@example.com');
    await page.locator('#cs-phone').fill('9085550111');
    await page.getByTestId('customer-save-button').click();

    await expect.poll(() => inserts.length).toBe(1);
    expect(inserts[0].email).toBe('jane.smith@example.com');
    expect(inserts[0].firstName).toBe('Jane');
    // Saved AND selected: the estimate form is prefilled with the new person.
    await expect(page.locator('#recipientName')).toHaveValue('Jane Smith');
    await expect(page.locator('#recipientEmail')).toHaveValue('jane.smith@example.com');
  });
});

test.describe('customer typeahead - Send Service Quote', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('selecting a hit fills the email and runs the lookup', async ({ page, context, baseURL }) => {
    await signInAsAdmin(context, baseURL!);
    await mockCustomerSearch(page);
    await page.route('**/api/admin/crew', async (route) => {
      await route.fulfill({ json: { recipients: [] } });
    });
    const intakeEmails: string[] = [];
    await page.route('**/api/admin/service-quote/intake*', async (route) => {
      const url = new URL(route.request().url());
      intakeEmails.push(url.searchParams.get('email') ?? '');
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
    await expect(page.getByTestId('customer-row-lead-1')).toBeVisible();
    await page.getByTestId('customer-row-lead-1').click();

    await expect(page.getByTestId('sq-email')).toHaveValue('maria.delgado@example.com');
    await expect.poll(() => intakeEmails.length).toBeGreaterThan(0);
    expect(intakeEmails[0]).toBe('maria.delgado@example.com');
  });
});

test.describe('email log drawer', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  const ROW = {
    id: 'em-1',
    category: 'service_quote',
    to_email: 'mosei@example.com',
    to_name: 'Mark Osei',
    from_email: 'alex@email.lavaca.link',
    subject: 'Home Care visit confirmed for Thursday',
    status: 'delivered',
    resend_message_id: 'rs-1',
    sent_by: 'admin',
    delivered_at: '2026-08-07T13:14:00Z',
    first_opened_at: null,
    open_count: 0,
    first_clicked_at: null,
    click_count: 0,
    bounced_at: null,
    created_at: '2026-08-07T13:13:00Z',
    sent_at: '2026-08-07T13:13:30Z',
  };

  test('a row opens the in-tab drawer - no navigation, sidebar-safe', async ({ page, context, baseURL }) => {
    await signInAsAdmin(context, baseURL!);
    await page.route('**/api/admin/emails?*', async (route) => {
      await route.fulfill({ json: { rows: [ROW] } });
    });
    await page.route('**/api/admin/emails/em-1', async (route) => {
      await route.fulfill({ json: { row: { ...ROW, html: '<p>Hi Mark, your visit is confirmed.</p>' } } });
    });

    await page.goto('/vaca-mgmt/emails');
    await page.getByTestId('email-row-em-1').click();

    const drawer = page.getByTestId('email-detail-drawer');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText('Home Care visit confirmed for Thursday')).toBeVisible();
    await expect(drawer.getByTestId('drawer-html-iframe')).toBeVisible();
    // The fix under test: the URL never left the list page.
    await expect(page).toHaveURL(/\/vaca-mgmt\/emails$/);

    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    await expect(page.getByTestId('email-row-em-1')).toBeVisible();
  });
});
