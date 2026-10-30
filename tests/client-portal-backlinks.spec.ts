import { test, expect } from '@playwright/test';

/**
 * SpecNook backlinks (Alex, 2026-10-29): one followed footer link on every
 * page, plus the /client-portal page with three in-content links. The
 * direction is La Vaca to SpecNook only. Static pages, so stub-backed is fine.
 */

const FOOTER_HREF =
  'https://www.specnook.app/contractor-client-portal?utm_source=lavacagc&utm_medium=website&utm_campaign=client_portal&utm_content=footer';
const PAGE_UTM = 'utm_source=lavacagc&utm_medium=website&utm_campaign=client_portal&utm_content=client_portal_page';
const PAGE_HREFS = [
  `https://www.specnook.app/contractor-client-portal?${PAGE_UTM}`,
  `https://www.specnook.app/construction-selections-software?${PAGE_UTM}`,
  `https://www.specnook.app/construction-daily-log-software?${PAGE_UTM}`,
];

test.describe('SpecNook footer link', () => {
  for (const path of ['/client-portal', '/process', '/about']) {
    test(`is followed and exact on ${path}`, async ({ page }) => {
      await page.goto(path);
      const link = page.locator('footer').getByRole('link', { name: /Client portal by SpecNook/ });
      await expect(link).toHaveCount(1);
      await expect(link).toHaveAttribute('href', FOOTER_HREF);
      await expect(link).toHaveAttribute('rel', 'noopener');
      await expect(link).toHaveAttribute('target', '_blank');
    });
  }

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('is a 44px row', async ({ page }) => {
      await page.goto('/client-portal');
      const box = await page.locator(`footer a[href="${FOOTER_HREF}"]`).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    });
  });
});

test.describe('/client-portal', () => {
  test('has its metadata and breadcrumb JSON-LD', async ({ page }) => {
    const response = await page.goto('/client-portal');
    expect(response?.status()).toBe(200);
    const title = await page.title();
    expect(title).toBe('Your Client Portal | La Vaca GC');
    expect(title.length).toBeLessThan(60);
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(description?.length ?? 0).toBeGreaterThan(50);
    expect(description?.length ?? 999).toBeLessThan(155);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://www.lavacagc.com/client-portal');

    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://www.lavacagc.com/logo.png');
    await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute('content', 'https://www.lavacagc.com/logo.png');

    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const crumbs = blocks.map((b) => JSON.parse(b)).find((j) => j['@type'] === 'BreadcrumbList');
    expect(crumbs?.itemListElement.at(-1).item).toBe('https://www.lavacagc.com/client-portal');
  });

  test('links to SpecNook in content and back into the site', async ({ page }) => {
    await page.goto('/client-portal');
    const main = page.locator('main');
    for (const href of PAGE_HREFS) {
      const link = main.locator(`a[href="${href}"]`);
      await expect(link).toHaveCount(1);
      await expect(link).toHaveAttribute('rel', 'noopener');
    }
    await expect(main.locator('a[href="/process"]')).toHaveCount(1);
    await expect(main.locator('a[href="/free-estimate"]')).toHaveCount(1);
    const EM_DASH = String.fromCharCode(0x2014);
    expect(await main.innerText()).not.toContain(EM_DASH);
  });

  // og-process.jpg and the other og-*.jpg files were never in public/ and 404ed
  // on production. Fetch the advertised path from the server under test, so a
  // card image that is not shipped with the build fails here.
  for (const path of ['/process', '/client-portal']) {
    test(`${path} advertises an og:image this build serves`, async ({ page, request }) => {
      await page.goto(path);
      const content = await page.locator('meta[property="og:image"]').getAttribute('content');
      expect(content).toBeTruthy();
      const image = await request.get(new URL(content!).pathname);
      expect(image.status()).toBe(200);
      expect(image.headers()['content-type']).toMatch(/^image\//);
    });
  }

  test('is linked from the SpecNook box on /process', async ({ page }) => {
    await page.goto('/process');
    await expect(page.locator('main').getByRole('link', { name: 'See what your portal includes' })).toHaveAttribute(
      'href',
      '/client-portal',
    );
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('does not overflow sideways', async ({ page }) => {
      await page.goto('/client-portal');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });
});
