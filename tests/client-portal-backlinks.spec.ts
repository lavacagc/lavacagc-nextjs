import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON } from './helpers/liveBackend';

/**
 * SpecNook backlinks (Alex, 2026-10-29): one followed footer link on every
 * page, plus the /client-portal page with three in-content links. The
 * direction is La Vaca to SpecNook only. Static pages, so stub-backed is fine.
 */

const FOOTER_HREF =
  'https://www.specnook.app/contractor-client-portal?utm_source=lavacagc&utm_medium=website&utm_campaign=client_portal&utm_content=footer';
const OG_CARD_URL = 'https://www.lavacagc.com/og-card.png';
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

    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', OG_CARD_URL);
    await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute('content', OG_CARD_URL);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');

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
  // on production. A card image on our own host is fetched from the server
  // under test, so one that is not shipped with the build fails here; one on
  // another host (a blog post's featured image in storage) is fetched as is.
  // The shared card's declared size must also be the file's real size: the
  // old /logo.png entries claimed 800x800 for a 120x120 file.
  for (const route of ['/', '/process', '/client-portal', '/about', '/blog', '/warranty']) {
    test(`${route} advertises an og:image that loads at its declared size`, async ({ page, request }) => {
      await page.goto(route);
      await expectOgImageLoads(page, request);
      await expect(page.locator('meta[property="og:image"]').first()).toHaveAttribute('content', OG_CARD_URL);
      const card = pngSize(path.join(process.cwd(), 'public/og-card.png'));
      expect(card).toEqual({ width: 1200, height: 630 });
      await expect(page.locator('meta[property="og:image:width"]').first()).toHaveAttribute('content', String(card.width));
      await expect(page.locator('meta[property="og:image:height"]').first()).toHaveAttribute('content', String(card.height));
      await expect(page.locator('meta[property="og:image:type"]').first()).toHaveAttribute('content', 'image/png');
    });
  }

  test('a blog post advertises an og:image that loads', async ({ page, request }) => {
    test.skip(SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON);
    await page.goto('/blog');
    const href = await page.locator('main a[href^="/blog/"]').first().getAttribute('href');
    expect(href).toBeTruthy();
    await page.goto(href!);
    await expectOgImageLoads(page, request);
  });

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

async function expectOgImageLoads(page: Page, request: APIRequestContext) {
  const content = await page.locator('meta[property="og:image"]').first().getAttribute('content');
  expect(content).toBeTruthy();
  const url = new URL(content!);
  const image = await request.get(url.hostname === 'www.lavacagc.com' ? url.pathname : url.href);
  expect(image.status()).toBe(200);
  expect(image.headers()['content-type']).toMatch(/^image\//);
}

function pngSize(file: string) {
  const png = readFileSync(file);
  expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}
