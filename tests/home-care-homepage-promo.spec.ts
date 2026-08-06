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
 *  D. Exit-intent popup now offers a one-field monthly-newsletter signup
 *     instead of a second estimate ask, with the personalized checklist kept as
 *     a secondary /home-care link: once per session, dismissible, members never
 *     see it, suppressed on /home-care pages.
 *
 * This file owns `ExitIntentPopup`, so it also pins the one contract of that
 * component that is not about the promo at all: the history entry it adds for
 * mobile Back detection must carry no URL, because one that does can overwrite
 * an in-flight navigation and strand the visitor on the page they tried to
 * leave. The last three tests are that guard - the entry names no URL, and a
 * navigation still commits at each layout - and their comments carry the
 * reasoning.
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

test.describe('D: exit-intent newsletter capture', () => {
  test('leaving through the top opens the newsletter capture with consent + Home Care upsell', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await triggerExitIntent(page);

    const dialog = page.getByRole('dialog');
    // Redesigned popup: one-field monthly-newsletter capture (not the old checklist CTA).
    await expect(dialog.getByText('Get seasonal home-care tips in your inbox')).toBeVisible();
    await expect(dialog.getByTestId('newsletter-email')).toBeVisible();
    await expect(dialog.getByTestId('newsletter-submit')).toBeVisible();
    // Affirmative-consent statement is present at the point of signup (CAN-SPAM).
    await expect(
      dialog.getByText(/By subscribing you agree to receive the La Vaca monthly newsletter/i),
    ).toBeVisible();
    await expect(dialog.getByRole('link', { name: /Privacy Policy/i })).toHaveAttribute(
      'href',
      '/privacy-policy',
    );
    // Secondary Home Care upsell link still routes people who want the full plan.
    await expect(
      dialog.getByRole('link', { name: /get a plan personalized to your home/i }),
    ).toHaveAttribute('href', '/home-care');
    await page.waitForTimeout(350); // let the dialog open animation settle for a clean screenshot
    await page.screenshot({ path: shot('05-exit-intent-newsletter-open.png') });

    // Session-capped: dismiss (X), retrigger, stays closed.
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => sessionStorage.getItem('exit_intent_shown'))).toBe('true');
    await triggerExitIntent(page);
    await page.waitForTimeout(400);
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('submitting an email signs up for the newsletter and shows the Home Care upsell', async ({ page }) => {
    // Stub the backend so the end-to-end front-end flow is exercised without a live DB.
    // The request body is asserted so we prove the popup sends the right stream/source.
    let captured: { email?: string; source?: string } | null = null;
    await page.route('**/api/newsletter/subscribe', async (route) => {
      captured = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await triggerExitIntent(page);

    const dialog = page.getByRole('dialog');
    await dialog.getByTestId('newsletter-email').fill('exit-intent-signup@example.com');
    await dialog.getByTestId('newsletter-submit').click();

    // Success state confirms the signup and upsells the personalized Home Care plan.
    const done = dialog.getByTestId('newsletter-done');
    await expect(done).toBeVisible();
    await expect(done.getByText("You're on the list!")).toBeVisible();
    await expect(done.getByText('exit-intent-signup@example.com')).toBeVisible();
    await expect(
      done.getByRole('link', { name: /Get my personalized Home Care plan/i }),
    ).toHaveAttribute('href', '/home-care');
    await page.screenshot({ path: shot('06-exit-intent-newsletter-success.png') });

    // The popup posts the newsletter stream from the exit_intent placement.
    expect(captured).toEqual({ email: 'exit-intent-signup@example.com', source: 'exit_intent' });
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

  /**
   * The back-button history entry must never carry a URL.
   *
   * It used to: `pushState(null, '', window.location.href)` read the current
   * URL and wrote it back, from an effect that re-runs on `pathname` - which
   * changes DURING a navigation. A push landing mid-flight replaced the
   * incoming URL with the outgoing one and the navigation was lost: the address
   * bar snapped back and the page the visitor asked for never arrived. It
   * needed load to show up, so it surfaced as a nav test failing about one run
   * in six while CI hid it behind workers=1 and two retries.
   *
   * `pushState(state, '')` adds the same entry at the current URL and cannot
   * overwrite anything, which is what makes the race unlosable rather than
   * merely unlikely. These two assertions are the contract: the entry exists
   * (Back detection still works, covered by the tests above) and it names no
   * URL.
   */
  test('the back-button history entry carries no URL, so it cannot eat a navigation', async ({ page }) => {
    const pushedUrls: string[] = [];
    await page.exposeFunction('__recordPush', (url: string) => { pushedUrls.push(url); });
    await page.addInitScript(() => {
      const original = history.pushState.bind(history);
      history.pushState = (...args: Parameters<History['pushState']>) => {
        // `url` is args[2]; undefined is the shape this test exists to pin.
        (window as unknown as { __recordPush?: (u: string) => void }).__recordPush?.(String(args[2]));
        return original(...args);
      };
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(600);

    // The entry is still being added - Back detection depends on it - and not
    // one push names a URL, which is what makes it unable to eat a navigation.
    // The property holds however many times the effect re-runs; it is the url
    // argument that was the bug, never the count.
    expect(pushedUrls, 'the popup must still add its back-button history entry').toContain('undefined');
    const urlBearing = pushedUrls.filter((u) => u !== 'undefined' && u !== 'null');
    expect(urlBearing, 'no app push may carry a URL').toEqual([]);
    // And the address bar is where it started.
    expect(new URL(page.url()).pathname).toBe('/');
  });

  /**
   * The user-visible half of the same bug, once per layout: the navigation has
   * to actually land. Each half drives the nav that exists at its own width -
   * the desktop bar is `hidden lg:flex` and the hamburger is `lg:hidden`, so
   * neither can be reached from the other project. Widening the viewport inside
   * the `mobile` project would only make it test a desktop layout.
   */
  test('a header navigation still commits with the popup mounted', async ({ page, isMobile }) => {
    test.skip(Boolean(isMobile), 'desktop nav is `hidden lg:flex` - the mobile-menu test below makes this claim on phones');
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const nav = page.locator('header nav').first();
    await page.click('button[aria-haspopup="true"]:has-text("Company")');
    await nav.locator('a[href="/about"]').first().click();
    await page.waitForURL('**/about');
    expect(new URL(page.url()).pathname).toBe('/about');
  });

  test('a mobile-menu navigation still commits with the popup mounted', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'hamburger menu is `lg:hidden` - the desktop test above makes this claim on wide viewports');
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.click('[aria-label="Open menu"]');
    await page.locator('#mobile-menu').getByRole('button', { name: 'Go to about us page' }).click();
    await page.waitForURL('**/about');
    expect(new URL(page.url()).pathname).toBe('/about');
  });
});
