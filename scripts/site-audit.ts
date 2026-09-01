#!/usr/bin/env npx ts-node
// `Page` must be a type-only import: this file is loaded as ESM, where a plain
// named import of a type resolves at runtime and fails with
// "does not provide an export named 'Page'" before any audit code runs.
import { chromium, devices } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
// Explicit `.ts` extension, and not optional: this file is executed by Node's
// own type-stripping ESM loader, which resolves specifiers literally and cannot
// find an extensionless one. `allowImportingTsExtensions` in tsconfig.json is
// what keeps `npm run typecheck` happy with it.
import { cityPathsFromSitemapXml } from './lib/sitemap-city-paths.ts';

interface AuditResult {
  category: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: string[];
}

const SITE_URL = process.env.SITE_URL || 'http://localhost:3000';

// Routes that exist as files. Safe to hardcode: adding one means editing
// src/app, so this list moves with it.
const STATIC_PAGES = [
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
];

// `/locations/*` is NOT hardcoded, deliberately. The town list lives in the
// database and in src/data/locationData.ts, and a copy pinned here drifts away
// from both without anything failing: this list carried '/locations/fairfield'
// for its whole life, which is not a service area anywhere in the site and
// answered 404 in production every single run. An audit that reports a 404 for
// a page we never published is noise, and noise is what stopped anyone reading
// the 33 failures this script prints.
//
// The sitemap is the right source because it is what we ASK search engines to
// crawl, so a URL in it that 404s is a genuine defect and belongs in the audit,
// while a town that has quietly disappeared from the sitemap stops being
// audited on the next run rather than a year later. Cost: two extra HTTP
// requests before the sweep starts.
//
// This does not check the sitemap against the DATABASE - `npm run test:links`
// owns that, and it is the check that catches an active service_areas row with
// no page behind it.
async function publishedLocationPaths(request: APIRequestContext): Promise<string[]> {
  const url = `${SITE_URL}/sitemap.xml`;
  const response = await request.get(url, { timeout: 30000 });
  if (!response.ok()) {
    throw new Error(
      `Could not read ${url} (HTTP ${response.status()}). The audit derives its ` +
        `/locations/* paths from the sitemap, so it cannot run without it.`
    );
  }

  const paths = cityPathsFromSitemapXml(await response.text());

  if (paths.length === 0) {
    throw new Error(
      `${url} published no /locations/<city> URLs. That is either a broken ` +
        `sitemap or a broken filter here - both are worth failing on, because ` +
        `auditing silently fewer pages reads exactly like a clean run.`
    );
  }

  return paths;
}

async function auditPage(page: Page, path: string): Promise<AuditResult[]> {
  const results: AuditResult[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];

  // Set up listeners
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  page.on('requestfailed', (request) => {
    const failure = request.failure();
    if (failure) {
      failedRequests.push(`${request.url()} - ${failure.errorText}`);
    }
  });

  try {
    // Navigate to page
    const response = await page.goto(`${SITE_URL}${path}`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Check HTTP status
    const status = response?.status() || 0;
    if (status >= 400) {
      results.push({
        category: 'HTTP Status',
        status: 'fail',
        message: `Page returned ${status}`,
      });
    } else {
      results.push({
        category: 'HTTP Status',
        status: 'pass',
        message: `Page loaded successfully (${status})`,
      });
    }

    // Check console errors
    const criticalErrors = consoleErrors.filter(
      (e) => !e.includes('favicon') && !e.includes('Third-party cookie')
    );
    if (criticalErrors.length > 0) {
      results.push({
        category: 'Console Errors',
        status: 'fail',
        message: `${criticalErrors.length} console errors found`,
        details: criticalErrors.slice(0, 5),
      });
    } else {
      results.push({
        category: 'Console Errors',
        status: 'pass',
        message: 'No console errors',
      });
    }

    // Check page errors
    if (pageErrors.length > 0) {
      results.push({
        category: 'JavaScript Errors',
        status: 'fail',
        message: `${pageErrors.length} JavaScript errors`,
        details: pageErrors.slice(0, 5),
      });
    } else {
      results.push({
        category: 'JavaScript Errors',
        status: 'pass',
        message: 'No JavaScript errors',
      });
    }

    // Check failed requests
    if (failedRequests.length > 0) {
      results.push({
        category: 'Failed Requests',
        status: 'fail',
        message: `${failedRequests.length} failed requests`,
        details: failedRequests.slice(0, 5),
      });
    } else {
      results.push({
        category: 'Failed Requests',
        status: 'pass',
        message: 'All resources loaded',
      });
    }

    // Check meta tags
    const title = await page.title();
    if (!title || title.length < 10) {
      results.push({
        category: 'SEO',
        status: 'warning',
        message: 'Title is missing or too short',
      });
    } else {
      results.push({
        category: 'SEO',
        status: 'pass',
        message: `Title: "${title.substring(0, 60)}..."`,
      });
    }

    // Check images
    const imagesWithoutAlt = await page.$$eval('img', (imgs) =>
      imgs
        .filter((img) => !(img as HTMLImageElement).alt)
        .map((img) => (img as HTMLImageElement).src)
    );

    if (imagesWithoutAlt.length > 0) {
      results.push({
        category: 'Accessibility',
        status: 'warning',
        message: `${imagesWithoutAlt.length} images missing alt text`,
        details: imagesWithoutAlt.slice(0, 3),
      });
    } else {
      results.push({
        category: 'Accessibility',
        status: 'pass',
        message: 'All images have alt text',
      });
    }

    // Check internal links
    const brokenInternalLinks: string[] = [];
    const internalLinks = await page.$$eval('a[href^="/"]', (anchors) =>
      anchors.map((a) => (a as HTMLAnchorElement).getAttribute('href'))
    );

    for (const link of internalLinks.slice(0, 10)) {
      if (link) {
        try {
          const linkResponse = await page.request.get(`${SITE_URL}${link}`);
          if (linkResponse.status() >= 400) {
            brokenInternalLinks.push(link);
          }
        } catch {
          brokenInternalLinks.push(link);
        }
      }
    }

    if (brokenInternalLinks.length > 0) {
      results.push({
        category: 'Broken Links',
        status: 'fail',
        message: `${brokenInternalLinks.length} broken internal links`,
        details: brokenInternalLinks,
      });
    } else {
      results.push({
        category: 'Broken Links',
        status: 'pass',
        message: 'No broken internal links (checked first 10)',
      });
    }
  } catch (error) {
    results.push({
      category: 'Page Load',
      status: 'fail',
      message: `Failed to load page: ${error}`,
    });
  }

  return results;
}

async function runFullAudit() {
  console.log('🔍 Starting Full Site Audit');
  console.log(`📍 Target: ${SITE_URL}`);
  console.log('━'.repeat(60));

  const browser = await chromium.launch();
  // Audit as a real desktop Chrome - the same device profile playwright.config.ts
  // gives the suite. A bare newPage() sends a `HeadlessChrome/...` UA, which the
  // bad-bot filter in src/middleware.ts answers with 403 on every path, so the
  // audit measured that filter instead of the site.
  const context = await browser.newContext({ ...devices['Desktop Chrome'] });
  const page = await context.newPage();

  // Fetched through the browser context so the sitemap request carries the same
  // real-Chrome UA as the sweep; a bare fetch() is answered 403 by our own
  // bad-bot filter.
  const locationPages = await publishedLocationPaths(context.request);
  const ALL_PAGES = [...STATIC_PAGES, ...locationPages];
  console.log(
    `📄 Pages to audit: ${ALL_PAGES.length} (${STATIC_PAGES.length} static + ` +
      `${locationPages.length} from ${SITE_URL}/sitemap.xml)`
  );

  const allResults: { path: string; results: AuditResult[] }[] = [];
  let totalPass = 0;
  let totalFail = 0;
  let totalWarning = 0;

  for (const path of ALL_PAGES) {
    console.log(`\\n🔎 Auditing: ${path}`);
    const results = await auditPage(page, path);
    allResults.push({ path, results });

    results.forEach((r) => {
      const icon =
        r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : '⚠️';
      console.log(`  ${icon} ${r.category}: ${r.message}`);
      if (r.details) {
        r.details.forEach((d) => console.log(`    → ${d}`));
      }

      if (r.status === 'pass') totalPass++;
      else if (r.status === 'fail') totalFail++;
      else totalWarning++;
    });
  }

  await browser.close();

  // Summary
  console.log('\\n' + '═'.repeat(60));
  console.log('📊 AUDIT SUMMARY');
  console.log('═'.repeat(60));
  console.log(`✅ Passed: ${totalPass}`);
  console.log(`❌ Failed: ${totalFail}`);
  console.log(`⚠️  Warnings: ${totalWarning}`);
  console.log('═'.repeat(60));

  // List failures
  if (totalFail > 0) {
    console.log('\\n❌ FAILURES:');
    allResults.forEach(({ path, results }) => {
      const failures = results.filter((r) => r.status === 'fail');
      if (failures.length > 0) {
        console.log(`\\n  ${path}:`);
        failures.forEach((f) => {
          console.log(`    - ${f.category}: ${f.message}`);
          if (f.details) {
            f.details.forEach((d) => console.log(`      • ${d}`));
          }
        });
      }
    });
  }

  // Exit with error code if failures found
  if (totalFail > 0) {
    process.exit(1);
  }
}

runFullAudit().catch((error) => {
  console.error('Audit failed:', error);
  process.exit(1);
});
