import { test, expect } from '@playwright/test';

/**
 * Privacy policy accuracy.
 *
 * The policy is static markdown rendered at /privacy-policy, so this runs in CI
 * with no backend. It asserts the page now discloses the tracking the site
 * actually performs (the v2.1 additions) — a regression guard so the disclosures
 * don't silently drift from the code.
 */

test.describe('Privacy policy disclosures', () => {
  test('renders and discloses the live tracking + subscriber activity', async ({ page }) => {
    const res = await page.goto('/privacy-policy', { waitUntil: 'domcontentloaded' });
    expect(res?.status()).toBeLessThan(400);

    const body = (await page.locator('body').innerText()).toLowerCase();

    // Each of these must be disclosed because the code actually does it.
    for (const phrase of [
      'microsoft clarity',
      'session recording',
      'enhanced conversions',
      'openai',
      'recaptcha',
      'subscriber',
      'visitor identifier',
      'br_access',
    ]) {
      expect(body, `privacy policy should mention "${phrase}"`).toContain(phrase);
    }

    // Version bumped.
    expect(body).toContain('version: 2.2');
    // Home Care disclosure present.
    expect(body).toContain('home care');
  });
});
