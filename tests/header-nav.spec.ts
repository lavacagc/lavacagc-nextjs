import { test, expect } from '@playwright/test';

// Consolidated top-nav (2026-07-02): programs + company grouped into dropdowns,
// and the Home Care / My Home Care links are mutually exclusive by membership.
// Assertions use href presence in the DOM so they hold on both the desktop and
// mobile Playwright projects (the desktop <nav> markup is present either way).

test.describe('header navigation', () => {
  test('non-member: Home Care lives in Programs, no My Home Care chip', async ({ page }) => {
    await page.goto('/');
    // grouped dropdown triggers exist (desktop nav only; mobile uses the hamburger menu)
    const isDesktop = (page.viewportSize()?.width ?? 0) >= 1024;
    if (isDesktop) {
      await expect(page.locator('header').getByRole('button', { name: 'Programs' })).toBeVisible();
      await expect(page.locator('header').getByRole('button', { name: 'Company' })).toBeVisible();
    }
    // public Home Care link present; portal chip absent
    await expect(page.locator('header a[href="/home-care"]')).toHaveCount(1);
    await expect(page.locator('header a[href="/home-care/checklist"]')).toHaveCount(0);
  });

  test('member (hc_known set): shows My Home Care, hides public Home Care', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => { document.cookie = 'hc_known=Alex; path=/'; });
    await page.reload();
    // portal chip present; no public Home Care link anywhere in the header
    await expect(page.locator('header a[href="/home-care/checklist"]')).toHaveCount(1);
    await expect(page.locator('header a[href="/home-care"]')).toHaveCount(0);
  });
});

/**
 * The open hamburger menu has to be reachable to its last entry (2026-08-06).
 *
 * Two separate faults put the bottom of it out of reach on a phone, and both
 * are pinned here because either one alone still hides the phone number:
 *
 *  1. The menu renders inside a `sticky` header that stays pinned at the top of
 *     the viewport, so anything past the fold is simply cut off - scrolling the
 *     PAGE does not move it. Measured on a 390x844 phone: the menu ran to
 *     y=1032 and the (201) 212-4917 entry sat at y=989, unchanged at every
 *     scroll position from 600 to 2715. The menu now caps itself to the space
 *     below the header and scrolls itself.
 *  2. Bottom-pinned chrome - the StickyCTA "Call Now / Free Estimate" bar and
 *     the SmartBanner mobile card - is fixed over the menu's last 80-100px.
 *     Both now stand down while the menu is open, via useMobileMenuState.
 *
 * The viewport is pinned rather than inherited: CI runs the chromium project
 * only, so a mobile-only assertion left to the project's device profile would
 * never actually run there.
 */
test.describe('open mobile menu', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  const menu = '#mobile-menu';
  const hamburger = 'button[aria-controls="mobile-menu"]';
  /** The StickyCTA bar - matched by its own two CTAs so it cannot alias a banner. */
  const stickyBar = 'div.fixed.bottom-0:has(a[href="tel:2016142814"]):has(a[href="/contact"])';

  /** StickyCTA only arms itself past 300px of scroll. */
  async function scrollPastCtaThreshold(page: import('@playwright/test').Page) {
    await page.evaluate(() => window.scrollTo(0, 600));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
  }

  test('the last entry can be brought on screen', async ({ page }) => {
    await page.goto('/portfolio');
    await page.click(hamburger);
    await expect(page.locator(menu)).toBeVisible();

    // The menu must not extend past the bottom of the viewport - anything that
    // does is unreachable, because the sticky header never scrolls away.
    const overflow = await page.locator(menu).evaluate(
      el => Math.round(el.getBoundingClientRect().bottom - window.innerHeight)
    );
    expect(overflow).toBeLessThanOrEqual(1);

    // And it has to carry its own scroll, or the entries below the cap are gone.
    const scrolls = await page.locator(menu).evaluate(el => el.scrollHeight > el.clientHeight);
    expect(scrolls).toBe(true);

    // The user-level assertion: the last entry can actually be reached.
    const phone = page.locator(`${menu} a[href^="tel:"]`);
    await phone.scrollIntoViewIfNeeded();
    await expect(phone).toBeInViewport({ ratio: 1 });
  });

  test('the sticky Call Now / Free Estimate bar steps aside, and comes back', async ({ page }) => {
    await page.goto('/portfolio');
    await scrollPastCtaThreshold(page);
    await expect(page.locator(stickyBar)).toBeVisible();

    await page.click(hamburger);
    await expect(page.locator(menu)).toBeVisible();
    await expect(page.locator(stickyBar)).toHaveCount(0);

    // Closing the menu restores it - the visitor is still scrolled past 300px,
    // so suppressing it permanently would be its own bug.
    await page.click(hamburger);
    await expect(page.locator(menu)).toHaveCount(0);
    await expect(page.locator(stickyBar)).toBeVisible();
  });

  test('the SmartBanner mobile card steps aside, and comes back', async ({ page }) => {
    // No banner rules exist in the stub backend, so serve one: on a phone every
    // banner type renders as the same fixed card at bottom-20, right over the
    // menu's last entries and at a z-index above the header.
    await page.route('**/api/banners', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: 'test-menu-overlap', name: 'test', visitor_type: 'all',
        min_visits: 0, max_visits: null, min_days_since_first: 0, max_days_since_first: null,
        show_on_paths: [], exclude_paths: [], require_viewed_pages: [], require_not_viewed_pages: [],
        display_type: 'slide-in', icon: null, title: 'Banner over the menu',
        message: 'This card sits where the menu ends', cta_text: null, cta_link: null,
        cta_phone: null, bg_color: 'bg-blue-600', text_color: 'text-white',
        dismissable: true, dismiss_for_hours: 0, enabled: true, priority: 1,
        start_date: null, end_date: null,
      }]),
    }));

    await page.goto('/portfolio');
    // Scoped to `.bottom-20` on purpose: the banner renders BOTH its phone card
    // and its (display:none here) desktop card, so the message alone is
    // ambiguous. `bottom-20` is the phone one - the card this test is about.
    const card = page.locator('div.fixed.bottom-20', { hasText: 'This card sits where the menu ends' });
    await expect(card).toBeVisible({ timeout: 15000 });

    await page.click(hamburger);
    await expect(page.locator(menu)).toBeVisible();
    await expect(card).toBeHidden();

    await page.click(hamburger);
    await expect(card).toBeVisible();
  });

  test('navigating away with the menu open does not strand the bar hidden', async ({ page }) => {
    // Every page renders its own <Header>, so a client-side navigation unmounts
    // the instance holding the menu open. The Services entries are plain
    // <Link>s that never run the close handler, so this is the path that leaves
    // the shared flag set unless the unmount publishes `false`.
    //
    // Unlike the three above, this one PASSES on the pre-fix build - there was
    // no shared flag to strand. It guards the mechanism this change introduces,
    // which is the more dangerous failure of the two: a bar stuck hidden with
    // no menu on screen to explain it.
    await page.goto('/portfolio');
    await page.click(hamburger);
    await page.click(`${menu} a[href="/services"]`);
    await expect(page).toHaveURL(/\/services$/);

    // Back to a page the bar is not suppressed on, still client-side.
    await page.click('header a[href="/"]');
    await expect(page).toHaveURL(/localhost:\d+\/$/);
    await scrollPastCtaThreshold(page);
    await expect(page.locator(stickyBar)).toBeVisible();
  });
});
