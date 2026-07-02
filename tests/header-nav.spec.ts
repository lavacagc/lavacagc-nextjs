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
