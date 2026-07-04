import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import path from 'path';
import { mkdirSync } from 'fs';

/**
 * Homepage Home Care promo placements (approved mockups A + B + D):
 *
 *  A. Utility-bar promo line (sitewide): visitors see a NEW-badged
 *     "Free seasonal home checklist" link to /home-care next to the license
 *     line (license hidden on mobile — it stays in the footer); known members
 *     get "open it →" into their checklist instead.
 *  B. Home Care band on the homepage, after testimonials: "Not remodeling
 *     yet?" pitch + mini checklist card. Member-aware CTA. No horizontal
 *     overflow on phones.
 *  D. Exit-intent popup now offers the free checklist instead of a second
 *     estimate ask: once per session, dismissible, members never see it,
 *     suppressed on /home-care pages.
 *
 * hc_known is a readable first-name hint cookie — setting it simulates a
 * returning member (real portal access stays server-enforced).
 */

const EVIDENCE_DIR = process.env.EVIDENCE_DIR || 'test-results/homepage-promo-evidence';
mkdirSync(EVIDENCE_DIR, { recursive: true });
const shot = (name: string) => path.join(EVIDENCE_DIR, name);

async function beMember(context: BrowserContext, baseURL: string) {
  await context.addCookies([{ name: 'hc_known', value: 'Alex', url: baseURL }]);
}

/** Fire the desktop exit-intent trigger (mouse leaving through the top edge). */
async function triggerExitIntent(page: Page) {
  await page.evaluate(() => {
    document.dispatchEvent(new MouseEvent('mouseleave', { clientY: 0, bubbles: false }));
  });
}

test.describe('A: utility-bar promo line', () => {
  test('visitor sees the NEW promo link to /home-care; license line stays on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    const promo = page.getByRole('link', { name: /Free seasonal home checklist/i });
    await expect(promo).toBeVisible();
    await expect(promo).toHaveAttribute('href', '/home-care');
    await expect(promo.locator('text=NEW')).toBeVisible();
    // Scoped to the trust bar — the license string also appears in the footer.
    await expect(
      page.locator('div.bg-secondary').first().getByText('Licensed, Bonded, & Insured'),
    ).toBeVisible();
    await page.screenshot({ path: shot('01-utility-bar-desktop.png') });
  });

  test('mobile: promo takes the bar, license line hides (kept in footer)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('link', { name: /Free seasonal home checklist/i })).toBeVisible();
    await expect(
      page.locator('div.bg-secondary').first().getByText('Licensed, Bonded, & Insured'),
    ).toBeHidden();
    await page.screenshot({ path: shot('02-utility-bar-mobile.png') });
  });

  test('member sees their portal link instead of the opt-in pitch', async ({ page, context, baseURL }) => {
    await beMember(context, baseURL!);
    await page.goto('/');
    const promo = page.getByRole('link', { name: /Your seasonal checklist is waiting/i });
    await expect(promo).toBeVisible();
    await expect(promo).toHaveAttribute('href', '/home-care/checklist');
    await expect(page.getByRole('link', { name: /Free seasonal home checklist/i })).toHaveCount(0);
  });
});

test.describe('B: homepage Home Care band', () => {
  test('band renders after testimonials with pitch, CTA, trust line and season card', async ({ page }) => {
    await page.goto('/');
    const band = page.locator('section[data-section="home-care-banner"]');
    await band.scrollIntoViewIfNeeded();
    await expect(band.getByRole('heading', { name: /Not remodeling yet\? Your house still has a/i })).toBeVisible();

    const cta = band.getByRole('link', { name: 'Get my free seasonal plan' });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', '/home-care');
    await expect(band.getByRole('link', { name: 'See how it works' })).toHaveAttribute('href', '/home-care');
    await expect(band.getByText('20-second setup')).toBeVisible();

    // Season-aware card: current season label + the sample progress copy.
    await expect(band.getByText(/· 7 of 12 done/)).toBeVisible();
    // Band sits between testimonials and services in the document.
    const order = await page.evaluate(() => {
      const ids = ['testimonials-section', 'home-care-banner', 'services-section'];
      const ys = ids.map((id) => document.querySelector(`[data-section="${id}"]`)?.getBoundingClientRect().top ?? NaN);
      return ys[0] < ys[1] && ys[1] < ys[2];
    });
    expect(order, 'band must sit between testimonials and services').toBe(true);
    await band.screenshot({ path: shot('03-band-desktop.png') });
  });

  test('mobile: band stacks without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const band = page.locator('section[data-section="home-care-banner"]');
    await band.scrollIntoViewIfNeeded();
    await expect(band.getByRole('link', { name: 'Get my free seasonal plan' })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'no horizontal page overflow with the band rendered').toBeLessThanOrEqual(0);
    await band.screenshot({ path: shot('04-band-mobile.png') });
  });

  test('member CTA goes to the portal and the how-it-works link hides', async ({ page, context, baseURL }) => {
    await beMember(context, baseURL!);
    await page.goto('/');
    const band = page.locator('section[data-section="home-care-banner"]');
    await band.scrollIntoViewIfNeeded();
    const cta = band.getByRole('link', { name: 'Open my checklist' });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', '/home-care/checklist');
    await expect(band.getByRole('link', { name: 'See how it works' })).toHaveCount(0);
  });
});

test.describe('D: exit-intent checklist offer', () => {
  test('leaving through the top opens the checklist offer once per session', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await triggerExitIntent(page);

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Not ready to remodel? Take the checklist instead.')).toBeVisible();
    const cta = dialog.getByRole('link', { name: 'Get my free seasonal plan' });
    await expect(cta).toHaveAttribute('href', '/home-care');
    await page.screenshot({ path: shot('05-exit-intent-open.png') });

    // Session-capped: dismiss, retrigger, stays closed.
    await dialog.getByRole('button', { name: /No thanks/i }).click();
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => sessionStorage.getItem('exit_intent_shown'))).toBe('true');
    await triggerExitIntent(page);
    await page.waitForTimeout(400);
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('known members never see the popup', async ({ page, context, baseURL }) => {
    await beMember(context, baseURL!);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await triggerExitIntent(page);
    await page.waitForTimeout(400);
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('suppressed on /home-care itself', async ({ page }) => {
    await page.goto('/home-care');
    await page.waitForLoadState('networkidle');
    await triggerExitIntent(page);
    await page.waitForTimeout(400);
    await expect(page.getByRole('dialog')).toBeHidden();
  });
});
