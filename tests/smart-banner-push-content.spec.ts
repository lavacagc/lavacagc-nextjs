import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'fs';
import { join } from 'path';

/**
 * Verifies the SmartBanner top-bar fix: the fixed desktop bar must RESERVE
 * layout space (body padding-top = --smart-banner-height) so it pushes the
 * sticky header + hero DOWN instead of covering them. On mobile the banner is a
 * bottom floating card, so it must NOT add any top offset.
 *
 * The banner data comes from /api/banners (DB-backed). We mock it with a
 * deterministic top-bar rule so the test does not depend on live Supabase data.
 */

const MESSAGE = 'Summer remodel event — 15% off all kitchen projects this month';

const TOP_BAR_BANNER = [
  {
    id: 'e2e-top-bar',
    name: 'E2E Top Bar',
    visitor_type: 'all',
    min_visits: 0,
    max_visits: null,
    min_days_since_first: 0,
    max_days_since_first: null,
    show_on_paths: [],
    exclude_paths: [],
    require_viewed_pages: [],
    require_not_viewed_pages: [],
    display_type: 'top-bar',
    icon: '🎉',
    title: null,
    message: MESSAGE,
    cta_text: 'Get a free estimate',
    cta_link: '/free-estimate',
    cta_phone: null,
    bg_color: 'bg-green-700',
    text_color: 'text-white',
    dismissable: true,
    dismiss_for_hours: 0,
    enabled: true,
    priority: 100,
    start_date: null,
    end_date: null,
  },
];

// Default to a repo-relative dir so the test is cross-platform: the hardcoded
// macOS temp fallback does not exist (and can't be created) on the Linux CI
// runner, which made every page.screenshot() call throw ENOENT.
const EVIDENCE_DIR =
  process.env.EVIDENCE_DIR || join(process.cwd(), 'test-results', 'smart-banner-push-content');

mkdirSync(EVIDENCE_DIR, { recursive: true });

// Desktop Chrome UA so the site's bad-bot middleware (which 403s HeadlessChrome)
// lets us through.
const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function mockBanner(page: Page) {
  await page.route('**/api/banners', (route) => route.fulfill({ json: TOP_BAR_BANNER }));
}

/** Read the layout metrics the fix depends on. */
async function readMetrics(page: Page) {
  return page.evaluate((message: string) => {
    const px = (v: string) => parseFloat(v || '0') || 0;
    const bodyPad = px(getComputedStyle(document.body).paddingTop);
    const varVal = px(
      getComputedStyle(document.documentElement).getPropertyValue('--smart-banner-height')
    );
    // The visible desktop bar is the fixed top:0 element that contains the message.
    const bars = Array.from(document.querySelectorAll<HTMLElement>('.fixed.top-0'));
    const bar = bars.find(
      (b) => b.textContent?.includes(message) && getComputedStyle(b).display !== 'none'
    );
    const barRect = bar?.getBoundingClientRect();
    const header = document.querySelector('header');
    const headerRect = header?.getBoundingClientRect();
    return {
      bodyPad,
      varVal,
      barTop: barRect ? barRect.top : null,
      barBottom: barRect ? barRect.bottom : null,
      barHeight: barRect ? barRect.height : 0,
      headerTop: headerRect ? headerRect.top : null,
    };
  }, MESSAGE);
}

test.describe('SmartBanner top-bar reserves layout space (desktop)', () => {
  test.use({ userAgent: DESKTOP_UA, viewport: { width: 1280, height: 900 } });

  test('pushes header/hero down, sticks below on scroll, and releases on dismiss', async ({
    page,
  }) => {
    // Ignore console noise that comes purely from the local build lacking real
    // backend env (Supabase reads to the `placeholder.supabase.co` host are
    // blocked by the site CSP). These are unrelated to the banner change and do
    // not occur in production, which has real Supabase env configured.
    const isEnvNoise = (t: string) =>
      t.includes('placeholder.supabase.co') ||
      t.includes('Content Security Policy') ||
      t.includes('Failed to load resource');
    const consoleErrors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && !isEnvNoise(m.text())) consoleErrors.push(m.text());
    });

    await mockBanner(page);
    await page.goto('/');

    // Banner appears after a 1.5s reveal delay in normal mode.
    await expect(page.getByText(MESSAGE).first()).toBeVisible({ timeout: 8000 });
    await page.waitForTimeout(600); // let padding transition settle

    const before = await readMetrics(page);

    // The fixed bar sits at the very top of the viewport.
    expect(before.barTop).toBeLessThanOrEqual(1);
    expect(before.barHeight).toBeGreaterThan(20);

    // The body reserves exactly the bar's height, and the CSS var matches it.
    expect(before.bodyPad).toBeGreaterThan(20);
    expect(Math.abs(before.bodyPad - before.barHeight)).toBeLessThanOrEqual(1);
    expect(Math.abs(before.varVal - before.barHeight)).toBeLessThanOrEqual(1);

    // The header is pushed DOWN to just below the bar — no overlap.
    expect(before.headerTop).not.toBeNull();
    expect(before.headerTop!).toBeGreaterThanOrEqual(before.barBottom! - 1);

    await page.screenshot({
      path: `${EVIDENCE_DIR}/desktop-01-banner-pushes-header-down.png`,
    });

    // Scroll down: sticky header should PARK just below the fixed bar, still no overlap.
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(400);
    const scrolled = await readMetrics(page);
    expect(scrolled.barTop).toBeLessThanOrEqual(1); // bar stays pinned at top
    expect(scrolled.headerTop!).toBeGreaterThanOrEqual(scrolled.barBottom! - 1);
    expect(Math.abs(scrolled.headerTop! - scrolled.barHeight)).toBeLessThanOrEqual(2);

    await page.screenshot({
      path: `${EVIDENCE_DIR}/desktop-02-header-parks-below-bar-on-scroll.png`,
    });

    // Dismiss: the reserved space must be released (padding back to 0).
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Dismiss banner' }).click();
    await page.waitForTimeout(600);
    const after = await readMetrics(page);
    expect(after.bodyPad).toBeLessThanOrEqual(1);
    expect(after.varVal).toBeLessThanOrEqual(1);
    // The reserved space is released: the header moves back UP by the full
    // banner height (returns to its no-banner baseline position).
    expect(before.headerTop! - after.headerTop!).toBeGreaterThanOrEqual(before.barHeight - 2);

    await page.screenshot({
      path: `${EVIDENCE_DIR}/desktop-03-after-dismiss-space-released.png`,
    });

    expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  });
});

test.describe('SmartBanner on mobile adds no top offset (bottom card)', () => {
  test.use({
    userAgent: DESKTOP_UA,
    viewport: { width: 390, height: 844 },
    isMobile: true,
  });

  test('body reserves no top space; banner renders as a bottom card', async ({ page }) => {
    await mockBanner(page);
    await page.goto('/');

    // The message lives in both the (hidden) desktop bar and the visible mobile
    // bottom card. Target the bottom card's paragraph specifically.
    await expect(page.locator('p.font-bold', { hasText: MESSAGE })).toBeVisible({ timeout: 8000 });
    await page.waitForTimeout(600);

    const metrics = await page.evaluate(() => {
      const px = (v: string) => parseFloat(v || '0') || 0;
      return {
        bodyPad: px(getComputedStyle(document.body).paddingTop),
        varVal: px(
          getComputedStyle(document.documentElement).getPropertyValue('--smart-banner-height')
        ),
      };
    });

    // On mobile the desktop bar is display:none, so no space is reserved.
    expect(metrics.bodyPad).toBeLessThanOrEqual(1);
    expect(metrics.varVal).toBeLessThanOrEqual(1);

    await page.screenshot({
      path: `${EVIDENCE_DIR}/mobile-01-bottom-card-no-top-offset.png`,
      fullPage: false,
    });
  });
});
