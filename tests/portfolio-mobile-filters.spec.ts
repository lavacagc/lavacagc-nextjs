import { test, expect, devices } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON } from './helpers/liveBackend';

/**
 * The portfolio filter bar is sticky under the header. On a phone the old
 * wrapped chip grid was 267 px tall on a 664 px viewport and sat on top of
 * every project photo (Alex, 2026-10-29). On phones it is now one row: the
 * icon and a horizontally scrolling chip strip, under 80 px (65 px measured on an iPhone 13).
 */
const source = readFileSync(join(process.cwd(), 'src/components/PortfolioContent.tsx'), 'utf8');

test.describe('portfolio filter bar (source)', () => {
  test('phones get one scrolling chip row; sm and up keep the wrap', () => {
    expect(source).toContain('flex-nowrap sm:flex-wrap');
    expect(source).toContain('overflow-x-auto sm:overflow-visible');
    expect(source).toContain('hidden sm:inline font-medium');
    expect(source).toContain('data-testid="portfolio-filter-bar"');
  });
});

test.describe('portfolio filter bar (live backend)', () => {
  test.skip(SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON);
  test.use({ ...devices['iPhone 13'] });

  test('the sticky bar stays under 80 px on a phone and the chips scroll sideways', async ({ page }) => {
    await page.goto('/portfolio', { waitUntil: 'networkidle' });
    const bar = page.getByTestId('portfolio-filter-bar');
    test.skip((await bar.count()) === 0, 'no published projects in this database, the filter bar does not render');
    const box = (await bar.boundingBox())!;
    expect(box.height).toBeLessThan(80);
    const row = bar.locator('div.overflow-x-auto');
    const overflow = await row.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(overflow, 'six chips cannot fit a 390 px row, so the strip must scroll').toBe(true);
    await expect(bar.getByText('Filter by Type:')).toBeHidden();
  });
});
