import { test, expect, type Browser } from '@playwright/test';

/**
 * Round 10, Phase A: geo signage without teeth.
 *
 * The middleware classifies every request into nj / us / intl / unknown from
 * the Cloudflare (preferred) or Vercel geo headers, sets the `geo_tier`
 * cookie the pages read client-side, and forwards its own `x-geo-tier`
 * request header to API routes - ALWAYS stripping the incoming one first.
 *
 * These specs drive the REAL path: a browser context whose extra HTTP headers
 * carry exactly what Vercel/Cloudflare would have added. No test-only
 * override exists in a production build, and the last spec pins that.
 *
 * Phase A's contract, pinned here: the notice renders for blocked tiers, and
 * the form underneath still WORKS - nothing is refused until a week of
 * tagged real traffic proves the classification (owner's rollout decision,
 * 2026-08-08).
 */

/** A browser context arriving from a given place, geo-header-wise. */
async function arriveFrom(browser: Browser, headers: Record<string, string>) {
  const context = await browser.newContext({ extraHTTPHeaders: headers });
  const page = await context.newPage();
  return { context, page };
}

const geoCookie = async (context: { cookies(): Promise<{ name: string; value: string }[]> }) =>
  (await context.cookies()).find((c) => c.name === 'geo_tier')?.value;

test.describe('geo tier classification (middleware cookie)', () => {
  test('NJ, other-US, international and headerless all classify - and Cloudflare outranks Vercel', async ({ browser }) => {
    const cases: Array<{ headers: Record<string, string>; tier: string; why: string }> = [
      { headers: { 'x-vercel-ip-country': 'US', 'x-vercel-ip-country-region': 'NJ' }, tier: 'nj', why: 'US + NJ region' },
      { headers: { 'x-vercel-ip-country': 'US', 'x-vercel-ip-country-region': 'TX' }, tier: 'us', why: 'US outside NJ' },
      { headers: { 'x-vercel-ip-country': 'CA' }, tier: 'intl', why: 'another country' },
      { headers: {}, tier: 'unknown', why: 'no geo headers at all' },
      // A US visitor whose REGION is unreadable must not be quietly demoted
      // to no-estimates - unknown is full access per the owner's decision.
      { headers: { 'x-vercel-ip-country': 'US' }, tier: 'unknown', why: 'US with unreadable region' },
      // Cloudflare's reading outranks Vercel's when both are present: the
      // site fronts through Cloudflare, so its headers describe the visitor
      // while Vercel's may describe the Cloudflare edge.
      {
        headers: {
          'cf-ipcountry': 'US', 'cf-region-code': 'NJ',
          'x-vercel-ip-country': 'DE',
        },
        tier: 'nj', why: 'Cloudflare NJ beats Vercel DE',
      },
      // Cloudflare's explicit unknowns read as unknown, not as a country.
      { headers: { 'cf-ipcountry': 'XX' }, tier: 'unknown', why: 'Cloudflare XX sentinel' },
    ];
    for (const { headers, tier, why } of cases) {
      const { context, page } = await arriveFrom(browser, headers);
      await page.goto('/');
      expect(await geoCookie(context), why).toBe(tier);
      await context.close();
    }
  });

  test('a client claiming x-geo-tier is ignored - the middleware strips it before setting its own', async ({ browser }) => {
    const { context, page } = await arriveFrom(browser, {
      'x-vercel-ip-country': 'CA',
      'x-geo-tier': 'nj',
    });
    await page.goto('/');
    expect(await geoCookie(context), 'the claim does not survive').toBe('intl');
    await context.close();
  });

  test('the ?geo override does not exist in a production build', async ({ browser }) => {
    // Locally (next dev) ?geo=us walks the whole site as a Texan; in the
    // production build the same URL must change nothing, or the override IS
    // a public geo bypass. The suite runs the production build, so this pin
    // is exactly the case that matters.
    const { context, page } = await arriveFrom(browser, {
      'x-vercel-ip-country': 'US', 'x-vercel-ip-country-region': 'NJ',
    });
    await page.goto('/?geo=intl');
    expect(await geoCookie(context)).toBe('nj');
    expect((await context.cookies()).find((c) => c.name === 'geo_override'),
      'no override cookie is ever set in production').toBeUndefined();
    await context.close();
  });
});

test.describe('geo notices (Phase A: signage above a still-working form)', () => {
  test('a US (non-NJ) visitor sees the estimate notice on /contact - and the form still works', async ({ browser }) => {
    const { context, page } = await arriveFrom(browser, {
      'x-vercel-ip-country': 'US', 'x-vercel-ip-country-region': 'TX',
    });
    await page.goto('/contact');
    const notice = page.getByTestId('geo-gate-notice').first();
    await expect(notice).toBeVisible();
    await expect(notice).toHaveAttribute('data-kind', 'estimate');
    await expect(notice).toHaveAttribute('data-tier', 'us');
    await expect(notice).toContainText('Estimates are for New Jersey homeowners');
    // Phase A pin: signage without teeth. The fields take input and, once
    // the form's own terms gate is satisfied, the submit button is live -
    // the GEO reading refuses nothing yet.
    const first = page.locator('#firstName, input[name="firstName"]').first();
    await first.fill('Test');
    await expect(first).toHaveValue('Test');
    await page.locator('#termsConsent').click();
    await expect(page.getByRole('button', { name: 'Send Message' })).toBeEnabled();
    await context.close();
  });

  test('an international visitor sees the notice on /contact and on the Home Care signup', async ({ browser }) => {
    const { context, page } = await arriveFrom(browser, { 'x-vercel-ip-country': 'FR' });
    await page.goto('/contact');
    const contactNotice = page.getByTestId('geo-gate-notice').first();
    await expect(contactNotice).toBeVisible();
    await expect(contactNotice).toHaveAttribute('data-tier', 'intl');

    await page.goto('/home-care');
    const hcNotice = page.locator('[data-testid="geo-gate-notice"][data-kind="homecare"]').first();
    await expect(hcNotice).toBeVisible();
    await expect(hcNotice).toContainText('available in the United States');
    await context.close();
  });

  test('NJ, unknown, and US-on-home-care see no notice at all', async ({ browser }) => {
    // NJ on the estimate form.
    {
      const { context, page } = await arriveFrom(browser, {
        'x-vercel-ip-country': 'US', 'x-vercel-ip-country-region': 'NJ',
      });
      await page.goto('/contact');
      await expect(page.getByRole('button', { name: 'Send Message' })).toBeVisible();
      await expect(page.getByTestId('geo-gate-notice')).toHaveCount(0);
      await context.close();
    }
    // Unknown is full access - the owner's fail-open call.
    {
      const { context, page } = await arriveFrom(browser, {});
      await page.goto('/contact');
      await expect(page.getByRole('button', { name: 'Send Message' })).toBeVisible();
      await expect(page.getByTestId('geo-gate-notice')).toHaveCount(0);
      await context.close();
    }
    // A Texan may join Home Care - only the estimate side is NJ-bound.
    {
      const { context, page } = await arriveFrom(browser, {
        'x-vercel-ip-country': 'US', 'x-vercel-ip-country-region': 'TX',
      });
      await page.goto('/home-care');
      await expect(page.locator('[data-testid="geo-gate-notice"][data-kind="homecare"]')).toHaveCount(0);
      await context.close();
    }
  });
});
