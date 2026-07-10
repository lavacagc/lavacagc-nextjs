import { test, expect } from '@playwright/test';

/**
 * GPC real-time suppression — served-HTML guard.
 *
 * The Microsoft Clarity and Meta/Facebook Pixel loader scripts in layout.tsx are
 * gated on BOTH the production hostname AND `!navigator.globalPrivacyControl`.
 * The ad-tech only actually loads on www.lavacagc.com, so the "does it load"
 * behavior is prod-gated; what we can verify anywhere is that the shipped inline
 * loaders carry the GPC guard so they never load when the browser sends GPC.
 */
test.describe('GPC loader guard', () => {
  test('both ad-tech loader scripts carry the GPC guard in the served page', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const html = await page.content();

    // The exact guard both loaders must carry, alongside the existing hostname gate.
    const guardCount = (html.match(/!navigator\.globalPrivacyControl/g) || []).length;
    expect(guardCount, 'both Clarity + Facebook Pixel loaders should carry the GPC guard').toBeGreaterThanOrEqual(2);

    // The gated ad-tech loaders are actually present in the page (so the guard matters).
    expect(html).toContain('clarity.ms');
    expect(html).toContain('fbq');

    // The hostname gate is still there alongside the GPC gate (defense in depth).
    expect(html).toContain("www.lavacagc.com");
  });
});
