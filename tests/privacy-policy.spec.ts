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
    expect(body).toContain('version: 2.4');
    // Home Care disclosure present.
    expect(body).toContain('home care');

    // Home Care "Home Details" sensitive-data disclosure (Slice 2): the policy
    // must describe collecting shut-off/panel locations + appliance details,
    // classify them as sensitive, and name the never-store guarantees, before
    // the capture UI ships.
    for (const phrase of [
      'sensitive home-security information',
      'location of your water, gas, and electrical shut-offs',
      'brand, model, and installation year of appliances',
      'never store alarm or lock codes',
      'home care home details', // 7.1 retention row
      'property and home-system details', // CCPA "Categories of Personal Information Collected"
    ]) {
      expect(body, `privacy policy should mention "${phrase}"`).toContain(phrase);
    }

    // Newly-shipped features must be disclosed now that they exist in the code.
    for (const phrase of [
      // 3.7 Monthly Newsletter (exit-intent, affirmative consent)
      'monthly newsletter',
      'affirmative consent',
      // 8.4 preference-center bullet
      'email preference center',
      // 5.1 Resend delivery/open/click tracking
      'opened, and whether links in them are clicked',
      // Corrected GPC section: real-time suppression of ad-tech partners
      'meta/facebook pixel',
      'immediately in your browser',
    ]) {
      expect(body, `privacy policy should mention "${phrase}"`).toContain(phrase);
    }
  });
});
