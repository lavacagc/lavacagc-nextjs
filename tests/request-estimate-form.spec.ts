import { test, expect, type Route } from '@playwright/test';

/**
 * RequestEstimateForm — /request-estimate intake form.
 *
 * Regression test for the production failure where every submission was
 * rejected by Postgres with CHECK-constraint error 23514 ("services_intake",
 * "Commercial Services", "Soonest available opening" are not valid enum
 * values for the leads table). The lead was never saved.
 *
 * Acceptance criteria:
 *  AC1: Form POSTs to /api/leads/submit.
 *  AC2: Payload sends DB-conformant enum values — inquiry_type='estimate',
 *       project_type='other', project_timeline mapped to the leads enum
 *       (e.g. "This month" -> "1-3months"). NONE of the raw human-readable
 *       strings ("services_intake", "Home/Commercial Services", or the timing
 *       sentence) are sent in those columns.
 *  AC3: Full name is split into first_name / last_name; source and recaptcha
 *       fields are present; on server success the UI shows "Request received."
 *  AC4: Honeypot filled -> form short-circuits, NO call to /api/leads/submit.
 */

const ALLOWED_TIMELINE = ['asap', '1-3months', '3-6months', '6-12months', 'planning'];

test.describe('RequestEstimateForm — leads enum conformance', () => {
  test.beforeEach(async ({ page }) => {
    // Block the real reCAPTCHA script so our stub survives.
    await page.route(/recaptcha|gstatic\.com\/recaptcha/, (route) => route.abort());

    // Stub window.grecaptcha so v3 execute() and the v2 checkbox render()
    // resolve offline. render() immediately fires its callback with a fake v2
    // token, simulating a user clearing the checkbox.
    await page.addInitScript(() => {
      // @ts-expect-error - runtime stub
      window.grecaptcha = {
        enterprise: {
          ready: (cb: () => void) => cb(),
          execute: async () => 'test-recaptcha-token',
          render: (_container: HTMLElement, params: { callback?: (t: string) => void }) => {
            setTimeout(() => params.callback && params.callback('test-v2-token'), 0);
            return 1;
          },
          reset: () => {},
        },
      };
    });
  });

  async function fillValid(page: import('@playwright/test').Page) {
    await page.locator('#name').fill('Test User');
    await page.locator('#phone').fill('(201) 555-0123');
    await page.locator('#email').fill('test@example.com');
    await page.locator('#town').fill('Montclair, NJ');
    // propertyType defaults to "home" -> pick at least one home interest.
    await page.getByText('Home safety audit').click();
    // Choose a timing whose mapping is non-trivial to prove the fix.
    await page.locator('#when').selectOption({ label: 'This month' });
  }

  test('AC1+AC2+AC3: submits DB-conformant enum payload and shows success', async ({ page }) => {
    await page.goto('/request-estimate');

    let body: Record<string, unknown> | null = null;
    await page.route('**/api/leads/submit', async (route: Route) => {
      body = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, score: 90, tier: 'hot' }),
      });
    });

    await fillValid(page);
    await page.getByRole('button', { name: /request availability/i }).click();

    await expect(page.getByText('Request received.')).toBeVisible({ timeout: 15000 });

    expect(body).not.toBeNull();
    // AC2 — the columns that carried the 23514-violating values are now enums.
    expect(body!.inquiry_type).toBe('estimate');
    expect(body!.project_type).toBe('other');
    expect(body!.project_timeline).toBe('1-3months');
    expect(ALLOWED_TIMELINE).toContain(body!.project_timeline);
    // Guard: none of the old raw strings leak into the constrained columns.
    expect(body!.inquiry_type).not.toBe('services_intake');
    expect(body!.project_timeline).not.toBe('This month');
    // AC3 — name split + provenance preserved.
    expect(body!.first_name).toBe('Test');
    expect(body!.last_name).toBe('User');
    expect(body!.source).toBe('services_intake_form');
    expect(body!.recaptchaToken).toBeTruthy();
    // Detail is preserved in the free-text message, not lost.
    expect(String(body!.message)).toContain('This month');
  });

  test('AC5: low v3 score -> v2 checkbox challenge -> re-submit carries v2 token', async ({ page }) => {
    await page.goto('/request-estimate');

    const bodies: Array<Record<string, unknown>> = [];
    await page.route('**/api/leads/submit', async (route: Route) => {
      bodies.push(route.request().postDataJSON());
      if (bodies.length === 1) {
        // Server signals: v3 score too low, show the checkbox.
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ challenge: 'recaptcha_v2' }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      }
    });

    await fillValid(page);
    await page.getByRole('button', { name: /request availability/i }).click();

    await expect(page.getByText('Request received.')).toBeVisible({ timeout: 15000 });
    expect(bodies.length).toBe(2);
    expect(bodies[0].recaptchaV2Token).toBeUndefined();
    expect(bodies[1].recaptchaV2Token).toBe('test-v2-token');
    // The original lead data is preserved on the re-submit.
    expect(bodies[1].first_name).toBe('Test');
    expect(bodies[1].project_timeline).toBe('1-3months');
  });

  test('AC4: honeypot filled -> no submit call, success shown', async ({ page }) => {
    await page.goto('/request-estimate');

    let submitCalled = false;
    await page.route('**/api/leads/submit', async (route: Route) => {
      submitCalled = true;
      await route.fulfill({ status: 200, body: '{"success":true}' });
    });

    await fillValid(page);
    // Honeypot is visually hidden (off-screen) — bypass the visibility check
    // but still dispatch the input event so React state updates.
    await page.locator('input[name="website"]').fill('http://spam.example', { force: true });
    await page.getByRole('button', { name: /request availability/i }).click();

    await expect(page.getByText('Request received.')).toBeVisible({ timeout: 10000 });
    expect(submitCalled).toBe(false);
  });
});
