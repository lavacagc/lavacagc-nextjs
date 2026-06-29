import { test, expect } from '@playwright/test';
import { SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON } from './helpers/liveBackend';

const PAGES_TO_CHECK = [
  '/',
  '/about',
  '/process',
  '/blog',
  '/portfolio',
  '/contact',
  '/project-calculator',
  '/services',
  '/services/kitchen-remodeling',
  '/services/bathroom-renovation',
  '/services/basement-finishing',
  '/services/home-additions',
  '/privacy-policy',
  '/terms-and-conditions',
  '/warranty',
  '/data-rights',
  '/do-not-sell',
  '/locations/alpine',
  '/locations/caldwell',
  '/locations/essex-fells',
  '/locations/livingston',
  '/locations/millburn',
  '/locations/montclair',
  '/locations/saddle-river',
  '/locations/short-hills',
  '/locations/verona',
  '/locations/west-caldwell',
  '/locations/west-orange',
];

test.describe('Link Validation', () => {
  test('all internal pages load without 404 errors', async ({ page }) => {
    // Location/service pages are DB-driven; without a live Supabase they 404.
    test.skip(SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON);
    const results: { url: string; status: number; error?: string }[] = [];

    for (const path of PAGES_TO_CHECK) {
      const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
      const status = response?.status() || 0;

      results.push({
        url: path,
        status,
        error: status >= 400 ? `HTTP ${status}` : undefined
      });

      expect(status, `Page ${path} should load successfully`).toBeLessThan(400);
    }

    console.log('\\n📊 Page Load Results:');
    results.forEach(r => {
      const icon = r.status < 400 ? '✅' : '❌';
      console.log(`${icon} ${r.url} - ${r.status}`);
    });
  });

  test('check all links on homepage for broken links', async ({ page }) => {
    // The homepage links out to DB-driven location/project pages; without a
    // live Supabase those targets 404 and this reports false-positive breakage.
    test.skip(SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON);
    await page.goto('/', { waitUntil: 'networkidle' });

    const links = await page.$$eval('a[href]', (anchors) =>
      anchors
        .map((a) => ({
          href: (a as HTMLAnchorElement).href,
          text: (a as HTMLAnchorElement).textContent?.trim() || '',
        }))
        .filter((link) =>
          link.href &&
          !link.href.startsWith('javascript:') &&
          !link.href.startsWith('mailto:') &&
          !link.href.startsWith('tel:')
        )
    );

    const internalLinks = links.filter(l =>
      l.href.includes('localhost') || l.href.startsWith('/')
    );

    console.log(`\\n🔗 Found ${internalLinks.length} internal links on homepage`);

    const brokenLinks: string[] = [];

    for (const link of internalLinks.slice(0, 50)) { // Limit to first 50 to avoid timeout
      try {
        const response = await page.request.get(link.href);
        if (response.status() >= 400) {
          brokenLinks.push(`${link.href} (${link.text}) - ${response.status()}`);
        }
      } catch (error) {
        brokenLinks.push(`${link.href} (${link.text}) - Error: ${error}`);
      }
    }

    if (brokenLinks.length > 0) {
      console.log('\\n❌ Broken Links Found:');
      brokenLinks.forEach(link => console.log(`  - ${link}`));
    } else {
      console.log('\\n✅ No broken internal links found');
    }

    expect(brokenLinks.length, 'No broken links should be found').toBe(0);
  });

  test('external links have correct attributes', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const externalLinks = await page.$$eval('a[href^="http"]', (anchors) =>
      anchors
        .filter((a) => {
          const href = (a as HTMLAnchorElement).href;
          return !href.includes('localhost') && !href.includes('lavacagc.com');
        })
        .map((a) => ({
          href: (a as HTMLAnchorElement).href,
          target: (a as HTMLAnchorElement).target,
          rel: (a as HTMLAnchorElement).rel,
          text: (a as HTMLAnchorElement).textContent?.trim() || '',
        }))
    );

    console.log(`\\n🌐 Found ${externalLinks.length} external links`);

    const insecureLinks = externalLinks.filter(
      (link) => !link.rel.includes('noopener') || !link.rel.includes('noreferrer')
    );

    if (insecureLinks.length > 0) {
      console.log('\\n⚠️ External links missing security attributes:');
      insecureLinks.forEach((link) =>
        console.log(`  - ${link.href} (rel="${link.rel}")`)
      );
    }

    expect(
      insecureLinks.length,
      'All external links should have rel="noopener noreferrer"'
    ).toBe(0);
  });

  test('images have proper alt text', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const images = await page.$$eval('img', (imgs) =>
      imgs.map((img) => ({
        src: (img as HTMLImageElement).src,
        alt: (img as HTMLImageElement).alt,
        hasAlt: (img as HTMLImageElement).hasAttribute('alt'),
      }))
    );

    const missingAlt = images.filter((img) => !img.hasAlt || img.alt === '');

    console.log(`\\n🖼️ Found ${images.length} images`);

    if (missingAlt.length > 0) {
      console.log('\\n⚠️ Images missing alt text:');
      missingAlt.forEach((img) => console.log(`  - ${img.src}`));
    } else {
      console.log('✅ All images have alt text');
    }

    expect(
      missingAlt.length,
      'All images should have alt text for accessibility'
    ).toBe(0);
  });
});
