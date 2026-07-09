import { test, expect } from '@playwright/test';

/**
 * /unsub in follow-ups mode — the opt-out for lead follow-up + review-request
 * emails. These are commercial in purpose (so CAN-SPAM requires a working
 * unsubscribe) but TRANSACTIONAL in policy: a general marketing unsubscribe must
 * NOT silence them, and unsubscribing here must NOT touch marketing streams.
 *
 * The POST is mocked at the network layer for the UI assertions; the real
 * backend cross-stream invariant (follow_ups off, marketing untouched) is
 * exercised end-to-end by scripts/validate-suppression.mjs against a live server.
 */

test.describe('/unsub?stream=follow_ups', () => {
  test('renders follow-ups-specific copy, not the marketing copy', async ({ page }) => {
    await page.goto('/unsub?stream=follow_ups&email=lead%40example.com');
    await expect(page.getByRole('heading', { name: /Stop follow-up emails/i })).toBeVisible();
    // Must make clear other emails are unaffected.
    await expect(page.getByText(/won.t affect any newsletters/i)).toBeVisible();
    await expect(page.getByTestId('unsub-email')).toHaveValue('lead@example.com');
  });

  test('submits with stream=follow_ups and confirms follow-ups stopped', async ({ page }) => {
    let posted: { email?: string; stream?: string } | null = null;
    await page.route('**/api/preferences/unsubscribe-by-email', async (route) => {
      posted = route.request().postDataJSON();
      await route.fulfill({ json: { ok: true } });
    });

    await page.goto('/unsub?stream=follow_ups&email=lead%40example.com');
    await page.getByTestId('unsub-submit').click();

    await expect(page.getByTestId('unsub-done')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Follow-ups stopped/i })).toBeVisible();
    // The critical wire assertion: the request carried the follow_ups stream, so
    // the backend turns off ONLY follow_ups, never the marketing streams.
    expect(posted).toEqual({ email: 'lead@example.com', stream: 'follow_ups' });
  });

  test('default /unsub (no stream) still targets marketing, not follow_ups', async ({ page }) => {
    let posted: { email?: string; stream?: string } | null = null;
    await page.route('**/api/preferences/unsubscribe-by-email', async (route) => {
      posted = route.request().postDataJSON();
      await route.fulfill({ json: { ok: true } });
    });

    await page.goto('/unsub?email=member%40example.com');
    await expect(page.getByRole('heading', { name: /Unsubscribe from marketing emails/i })).toBeVisible();
    await page.getByTestId('unsub-submit').click();
    await expect(page.getByTestId('unsub-done')).toBeVisible();
    // No stream key → the marketing cascade, follow_ups untouched.
    expect(posted).toEqual({ email: 'member@example.com' });
  });
});

test.describe('unsubscribe-by-email API — follow_ups validation', () => {
  test('still rejects an invalid email even with stream=follow_ups', async ({ request }) => {
    const bad = await request.post('/api/preferences/unsubscribe-by-email', {
      data: { email: 'not-an-email', stream: 'follow_ups' },
    });
    expect(bad.status()).toBe(400);
  });
});
