import { test, expect, type Route } from '@playwright/test';

/**
 * HomeEstimateForm — post-migration tests
 *
 * Acceptance criteria for the /api/leads/submit migration:
 *  AC1: Form POSTs to /api/leads/submit (not direct to Supabase)
 *  AC2: Payload contains sanitized form fields, recaptchaToken,
 *       recaptchaAction='estimate_request', source='home_estimate_form', honeypot
 *  AC3: On server success, UI shows "Thank You!" success state
 *  AC4: Honeypot short-circuits submission — no network call to /api/leads/submit
 */

test.describe('HomeEstimateForm — /api/leads/submit migration', () => {
  test.beforeEach(async ({ page }) => {
    // Block the external reCAPTCHA script so our stub survives
    await page.route(/recaptcha|gstatic\.com\/recaptcha/, (route) => route.abort());

    // Stub window.grecaptcha so the form can execute() without the real script
    await page.addInitScript(() => {
      // @ts-expect-error - runtime stub
      window.grecaptcha = {
        enterprise: {
          ready: (cb: () => void) => cb(),
          execute: async () => 'test-recaptcha-token',
        },
      };
    });

    // Absorb Supabase edge function calls (log-consent, send-lead-notification)
    // so they don't hit the real Supabase during tests
    await page.route('**/functions/v1/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    );
  });

  // Fills steps 1 + 2 of the form using valid data. Does NOT submit.
  async function fillForm(page: import('@playwright/test').Page) {
    // Step 1 (collapsed): firstName + lastName, then click Get Started
    await page.locator('#firstName').fill('Test');
    await page.locator('#lastName').fill('User');
    await page.getByRole('button', { name: /get started/i }).click();

    // Step 1 (expanded): email + phone, then Next
    await page.locator('#email').fill('test@example.com');
    await page.locator('#phone').fill('(201) 555-1234');
    await page.getByRole('button', { name: /next: project details/i }).click();

    // Step 2: selects + zip + consent
    await page.getByText('Select project type').click();
    await page.getByRole('option', { name: 'Kitchen Remodel' }).click();

    await page.getByText('Select budget range').click();
    await page.getByRole('option', { name: '$50,000 - $100,000' }).click();

    await page.locator('#zipCode').fill('07620');
    await page.locator('#termsConsent').click();
  }

  test('AC1 + AC2 + AC3: happy path submits to /api/leads/submit with correct payload', async ({ page }) => {
    let capturedBody: Record<string, unknown> | null = null;

    await page.route('**/api/leads/submit', async (route: Route) => {
      capturedBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, score: 85, tier: 'A' }),
      });
    });

    await page.goto('/');
    await fillForm(page);
    await page.getByRole('button', { name: /get my estimate/i }).click();

    // AC3: success UI
    await expect(page.getByText('Thank You!')).toBeVisible({ timeout: 15000 });

    // AC1 + AC2: payload
    expect(capturedBody).toMatchObject({
      first_name: 'Test',
      last_name: 'User',
      email: 'test@example.com',
      phone: '(201) 555-1234',
      zip_code: '07620',
      inquiry_type: 'estimate',
      project_type: 'kitchen',
      budget_range: '50k-100k',
      project_timeline: 'asap',
      preferred_contact_method: 'phone',
      source: 'home_estimate_form',
      recaptchaAction: 'estimate_request',
      recaptchaToken: 'test-recaptcha-token',
    });
  });

  test('AC4: honeypot filled -> form short-circuits, no /api/leads/submit call', async ({ page }) => {
    let submitCalled = false;

    await page.route('**/api/leads/submit', async (route: Route) => {
      submitCalled = true;
      await route.fulfill({ status: 200, body: '{"success":true}' });
    });

    await page.goto('/');
    await fillForm(page);

    // Simulate a bot filling the honeypot (hidden from real users)
    await page.evaluate(() => {
      const hp = document.getElementById('he-website') as HTMLInputElement | null;
      if (!hp) throw new Error('honeypot field not found');
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      setter?.call(hp, 'bot-fill');
      hp.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await page.getByRole('button', { name: /get my estimate/i }).click();

    // Honeypot branch renders the same "Thank You!" success state (fake-success)
    await expect(page.getByText('Thank You!')).toBeVisible({ timeout: 10000 });

    // But the API was never called
    expect(submitCalled).toBe(false);
  });
});
