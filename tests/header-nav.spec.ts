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

/**
 * The 768-1023px band: the menu still exists, the chrome is already DESKTOP.
 *
 * The hamburger toggle and the menu are both `lg:hidden`, so the menu is
 * open-able all the way to 1023px, while ReviewToast (which stands down only
 * below 768px) and the SmartBanner slide-in's desktop card (`hidden md:block`)
 * switch at `md`. Gates scoped to `md` therefore left this entire band - a real
 * iPad in portrait, or an 800px-wide desktop window - with exactly the defect
 * the phone block above pins. Every gate now keys off the shared menu flag,
 * which can only be true while the menu is rendered.
 *
 * The last test covers the other half of keying off the menu rather than a
 * width: the menu has to actually close when the viewport crosses to a layout
 * where it no longer has a toggle, or the chrome stays hidden on a desktop
 * screen with nothing on it to explain why.
 *
 * Viewport pinned in the spec for the same reason as the block above: CI runs
 * the chromium project only, so a band-specific assertion left to the project's
 * device profile would never run there.
 */
test.describe('open mobile menu on a tablet (768-1023px)', () => {
  test.use({ viewport: { width: 820, height: 1024 } });

  const menu = '#mobile-menu';
  const hamburger = 'button[aria-controls="mobile-menu"]';
  /** At this width every banner type renders its DESKTOP presentation. */
  const cardText = 'Banner over the menu';

  type Page = import('@playwright/test').Page;

  /** Same shape the phone block serves, so both drive one real banner rule. */
  async function stubBanners(page: Page, rules: unknown[]) {
    await page.route('**/api/banners', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(rules),
    }));
  }

  const SLIDE_IN_RULE = {
    id: 'test-menu-overlap-tablet', name: 'test', visitor_type: 'all',
    min_visits: 0, max_visits: null, min_days_since_first: 0, max_days_since_first: null,
    show_on_paths: [], exclude_paths: [], require_viewed_pages: [], require_not_viewed_pages: [],
    display_type: 'slide-in', icon: null, title: cardText,
    message: 'This card sits where the menu ends', cta_text: null, cta_link: null,
    cta_phone: null, bg_color: 'bg-blue-600', text_color: 'text-white',
    dismissable: true, dismiss_for_hours: 0, enabled: true, priority: 1,
    start_date: null, end_date: null,
  };

  /**
   * ReviewToast reads its copy straight from Supabase and the stub backend has
   * no `google_reviews` to answer with, so without this it renders nothing at
   * all and "the toast is not over the menu" would pass having never had a
   * toast. Patch `fetch` before any page script runs - which is also before the
   * Supabase client module captures it - and answer that one table.
   */
  async function stubReviews(page: Page) {
    await page.addInitScript(() => {
      const original = window.fetch.bind(window);
      window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url.includes('/rest/v1/google_reviews')) {
          return Promise.resolve(new Response(JSON.stringify([{
            reviewer_name: 'Dana Whitfield',
            comment: 'They finished our kitchen on schedule and the trim work is flawless.',
            star_rating: 5,
          }]), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        return original(input, init);
      }) as typeof window.fetch;
    });
  }

  test('the review toast steps aside, and comes back', async ({ page }) => {
    // No banner: ReviewToast already suppresses itself whenever one is showing,
    // so a stray rule would hide it for a reason this test is not about.
    await stubBanners(page, []);
    await stubReviews(page);
    await page.goto('/portfolio');

    // Matched by its dismiss button - the toast root carries no test id, and
    // this exists only while the component renders.
    const reviewToast = page.locator('button[aria-label="Dismiss review"]');
    await expect(reviewToast).toHaveCount(1);

    await page.click(hamburger);
    await expect(page.locator(menu)).toBeVisible();
    await expect(reviewToast).toHaveCount(0);

    await page.click(hamburger);
    await expect(page.locator(menu)).toHaveCount(0);
    await expect(reviewToast).toHaveCount(1);
  });

  test('the SmartBanner desktop card steps aside, and comes back', async ({ page }) => {
    await stubBanners(page, [SLIDE_IN_RULE]);
    await page.goto('/portfolio');

    // Scoped to `.bottom-4`: the slide-in renders both cards and only this one
    // is on screen at this width (the phone card is `md:hidden`, at bottom-20).
    const card = page.locator('div.fixed.bottom-4', { hasText: cardText });
    await expect(card).toBeVisible({ timeout: 15000 });

    await page.click(hamburger);
    await expect(page.locator(menu)).toBeVisible();
    await expect(card).toBeHidden();

    await page.click(hamburger);
    await expect(card).toBeVisible();
  });

  test('widening past the lg breakpoint closes the menu and restores the chrome', async ({ page }) => {
    await stubBanners(page, [SLIDE_IN_RULE]);
    await page.goto('/portfolio');

    const card = page.locator('div.fixed.bottom-4', { hasText: cardText });
    await expect(card).toBeVisible({ timeout: 15000 });

    // Deliberately does NOT assert the card is hidden here - that is the test
    // above, and asserting it first would fail this one before it reaches the
    // closing behaviour it exists for.
    await page.click(hamburger);
    await expect(page.locator(menu)).toBeVisible();

    // Past 1024px both the menu and its toggle are `lg:hidden`, so there is no
    // X button left to close it with - the header has to close it itself, or
    // the flag stays set and the chrome stays hidden with no menu on screen.
    await page.setViewportSize({ width: 1280, height: 1024 });
    await expect(page.locator(menu)).toHaveCount(0);
    await expect(card).toBeVisible();
  });
});
