import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON } from './helpers/liveBackend';
import { SERVICE_QUESTIONS, SERVICE_SLUGS, COUNTIES, t } from '../src/lib/home-services/catalog';
import { SEED_NAMES, SEED_SERVICES, seedService } from './helpers/homeServicesSeed';
import { s } from '../src/lib/home-services/i18n';
import { brandedTitle } from '../src/lib/home-services/seo';
import { bannerRules } from '../src/lib/bannerRules';
import { countyForZip, isInServiceArea } from '../src/lib/home-services/serviceArea';
import { RequestBodySchema, leadFields, validateRequest } from '../src/lib/home-services/requests';
import { sanitizeLeadForInsert } from '../src/lib/leadSanitize';

/**
 * /home-services and /home-services/<slug> - slice A (acceptance-criteria.md LP1-LP10, SEC6, SEO1, SEO2).
 *
 * Expected names, prices and copy come from the migration's seed
 * (tests/helpers/homeServicesSeed.ts), not from catalog constants: since Phase 2
 * slice E the pages read the home_services table (CAT1, CAT6). The browser checks
 * therefore assume a seeded table; the Services & Prices spec restores any row it
 * edits.
 *
 * The source checks run everywhere (no server needed). The browser checks need a
 * server with the local Supabase stack behind it:
 *   TEST_URL=http://localhost:3101 E2E_LIVE_BACKEND=1 \
 *     node_modules/.bin/playwright test tests/home-services-landing.spec.ts --project=chromium
 */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** JSON-LD nodes in the server-rendered HTML of a path (what a crawler sees, before any hydration). */
async function jsonLdNodes(request: APIRequestContext, path: string): Promise<Array<Record<string, unknown>>> {
  const html = await (await request.get(path)).text();
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]) as Record<string, unknown>);
}

const decode = (v: string) => v.replace(/&amp;/g, '&');
function linkHref(html: string, rel: string): string | null {
  const m = html.match(new RegExp(`<link rel="${rel}" href="([^"]+)"`));
  return m ? decode(m[1]) : null;
}
function hreflang(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of html.matchAll(/<link rel="alternate" hrefLang="([^"]+)" href="([^"]+)"/g)) out[m[1]] = decode(m[2]);
  return out;
}

test.describe('source checks', () => {
  test('LP6: the landing page no longer renders the old nine-tile catalog, image grid or /request-estimate CTAs', () => {
    const src = read('src/app/home-services/page.tsx');
    expect(src).not.toMatch(/\bHOME_SERVICES\b/);
    expect(src).not.toMatch(/ServiceTile/);
    expect(src).not.toMatch(/ServiceImageGrid/);
    expect(src).not.toMatch(/\/request-estimate/);
    expect(src).not.toMatch(/Walk-Through/i);
  });

  test('LP10: the sitemap lists /home-services and every catalog service page', () => {
    const src = read('src/app/sitemap.ts');
    expect(src).toContain('`${baseUrl}/home-services`');
    // Active services only, from the table (CAT4); the fixed slugs stand in when the read fails.
    expect(src).toContain('await getCatalog()');
    expect(src).toMatch(/homeServiceSlugs\.map\(\(slug\) => \(\{\s*url: `\$\{baseUrl\}\/home-services\/\$\{slug\}`/);
    expect(src).toContain('url: `${baseUrl}/home-services${suffix}?lang=es`');
  });

  test('catalog: seven services, each with exactly three tap groups of two to four options', () => {
    expect(SERVICE_SLUGS).toHaveLength(7);
    for (const slug of SERVICE_SLUGS) {
      expect(SERVICE_QUESTIONS[slug], slug).toHaveLength(3);
      for (const q of SERVICE_QUESTIONS[slug]) {
        expect(q.options.length, `${slug}.${q.key}`).toBeGreaterThanOrEqual(2);
        expect(q.options.length, `${slug}.${q.key}`).toBeLessThanOrEqual(4);
      }
    }
  });

  test('SEO1: the landing title is under 60 characters and the description under 160 with every county', () => {
    for (const lang of ['en', 'es'] as const) {
      expect(brandedTitle(s('metaTitle', lang)).length, lang).toBeLessThan(60);
      const description = s('metaDescription', lang);
      expect(description.length, lang).toBeLessThan(160);
      for (const county of COUNTIES) expect(description, lang).toContain(county);
    }
  });

  test('SEO1: catalog service titles at most 60 and descriptions at most 160, naming the counties', () => {
    // Limits as the planner set them for the catalog copy ("to 60", "to 160").
    // The rendered title is the catalog title plus " | La Vaca" only when that
    // still fits, so checking the rendered string covers both.
    const problems: string[] = [];
    for (const service of SEED_SERVICES) {
      for (const lang of ['en', 'es'] as const) {
        const title = brandedTitle(t(service.seo.title, lang));
        const description = t(service.seo.description, lang);
        if (title.length > 60) problems.push(`${service.slug} ${lang} title ${title.length}`);
        if (description.length > 160) problems.push(`${service.slug} ${lang} description ${description.length}`);
        if (!COUNTIES.every((c) => description.includes(c))) problems.push(`${service.slug} ${lang} description lacks a county name`);
      }
    }
    expect(problems).toEqual([]);
  });

  test('RF4 service area: county ZIPs are in (07601 Hackensack), others out (07920 Basking Ridge), scorer ZIPs still count, towns only without a ZIP', () => {
    expect(isInServiceArea({ zip: '07601' })).toBe(true);
    expect(countyForZip('07601')).toBe('Bergen');
    expect(isInServiceArea({ zip: '07920' })).toBe(false);
    expect(countyForZip('07920')).toBeNull();
    expect(isInServiceArea({ zip: '07042-1234' })).toBe(true); // ZIP+4 typed
    expect(isInServiceArea({ zip: '07065' })).toBe(true); // Rahway: scorer list, Union County
    // D11: a five-digit ZIP decides alone; the town only counts when the ZIP is missing or malformed.
    expect(isInServiceArea({ zip: '07920', town: 'Montclair' })).toBe(false);
    expect(isInServiceArea({ zip: '99999', town: 'Montclair' })).toBe(false);
    expect(isInServiceArea({ zip: '', town: 'Montclair' })).toBe(true);
    expect(isInServiceArea({ zip: '070', town: 'Montclair' })).toBe(true);
    expect(isInServiceArea({ zip: '08540' })).toBe(false);
  });

  test('Q21: Union County is served - its ZIPs map to Union and pass the gate; a Somerset neighbour still does not', () => {
    for (const zip of ['07090', '07201', '07083', '07901', '07922', '07974', '07016', '07060']) {
      expect(countyForZip(zip), zip).toBe('Union');
      expect(isInServiceArea({ zip }), zip).toBe(true);
    }
    expect(countyForZip('07065')).toBe('Union'); // Rahway: now by county, not only the scorer list
    expect(countyForZip('07069')).toBeNull(); // Watchung, Somerset County
    expect(isInServiceArea({ zip: '07069' })).toBe(false);
    expect(isInServiceArea({ zip: '07920' })).toBe(false); // Basking Ridge, Somerset
    expect(COUNTIES).toEqual(['Essex', 'Morris', 'Bergen', 'Union']);
  });

  test('RF7 sanitizer: a well-formed request becomes a leads row with no sanitizer adjustments', () => {
    const parsed = RequestBodySchema.parse({
      services: ['gutter-cleaning', 'drywall-patching'],
      answers: { 'gutter-cleaning': { stories: '2' } },
      address: '12 Valley Rd',
      zip: '07042',
      first_name: 'Maria del Carmen',
      phone: '(973) 555-0100',
      email: 'maria@example.com',
      timing: 'this_week',
      notes: 'Side door is easiest',
      consent_sms: true,
      lang: 'es',
      started_at: Date.now() - 60_000,
    });
    const validated = validateRequest(parsed);
    expect('value' in validated).toBe(true);
    if (!('value' in validated)) return;
    const { lead, adjustments } = sanitizeLeadForInsert(leadFields(validated.value, 'craigslist', SEED_NAMES));
    expect(adjustments).toEqual([]);
    expect(lead).toMatchObject({
      first_name: 'Maria',
      last_name: 'del Carmen',
      inquiry_type: 'estimate',
      project_type: 'home_services',
      project_timeline: 'asap',
      preferred_contact_method: 'text',
      source: 'home_services:craigslist',
      zip_code: '07042',
    });
    // One name word: last_name repeats it (NOT NULL column) without an adjustment.
    const solo = validateRequest({ ...parsed, first_name: 'Cher' });
    if (!('value' in solo)) throw new Error('solo request rejected');
    expect(sanitizeLeadForInsert(leadFields(solo.value, 'direct', SEED_NAMES)).adjustments).toEqual([]);
  });
});

test.describe('browser', () => {
  test.skip(SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON);

  async function quiet(page: Page) {
    // Site-wide promo banners are not under test; pre-dismiss them so they cannot cover the cards.
    await page.addInitScript((ids: string[]) => {
      const now = Date.now();
      localStorage.setItem('lavaca_banner_dismiss', JSON.stringify(Object.fromEntries(ids.map((id) => [id, now]))));
      for (const id of ids) sessionStorage.setItem(`banner_dismissed_${id}`, '1');
    }, bannerRules.map((r) => r.id));
  }

  test('LP1 LP5 SEC6: seven cards in catalog order with name, price, unit and description; home care section; one h1', async ({ page }) => {
    await quiet(page);
    await page.goto('/home-services');
    const cards = page.locator('[data-testid=service-cards] > li');
    await expect(cards).toHaveCount(7);
    for (const [i, service] of SEED_SERVICES.entries()) {
      const card = cards.nth(i);
      await expect(card).toHaveAttribute('data-testid', `card-${service.slug}`);
      await expect(card).toContainText(t(service.name, 'en'));
      await expect(card).toContainText(t(service.priceDisplay, 'en'));
      await expect(card).toContainText(t(service.priceUnit, 'en'));
      await expect(card).toContainText(t(service.description, 'en'));
    }
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('main')).toContainText('Free seasonal plan');
    await expect(page.getByRole('link', { name: 'Get my free plan' })).toHaveAttribute('href', '/home-care');
    // LP6 in the rendered page: no link from main to the old form.
    await expect(page.locator('main a[href="/request-estimate"]')).toHaveCount(0);
  });

  test('LP2: a card toggles by click and keyboard, shows its state, and the sticky bar counts', async ({ page }) => {
    await quiet(page);
    await page.goto('/home-services');
    await expect(page.getByTestId('request-bar')).toHaveCount(0);
    const gutter = page.locator('[data-testid=card-gutter-cleaning] button[aria-pressed]');
    await gutter.click();
    await expect(gutter).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('card-gutter-cleaning')).toContainText('Selected');
    await expect(page.getByTestId('request-bar')).toContainText('Request these (1)');

    const hvac = page.locator('[data-testid=card-hvac-cleaning] button[aria-pressed]');
    await hvac.focus();
    await page.keyboard.press('Space');
    await expect(hvac).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('request-bar')).toContainText('Request these (2)');

    await gutter.click();
    await expect(page.getByTestId('request-bar')).toContainText('Request these (1)');
    await hvac.click();
    await expect(page.getByTestId('request-bar')).toHaveCount(0);
  });

  test('D2: Back with the price sheet open closes the sheet and stays on the page; the X leaves no #price behind', async ({ page }) => {
    await quiet(page);
    await page.goto('/home-services');
    const before = page.url();
    await page.getByTestId('price-gutter-cleaning').click();
    await expect(page.getByTestId('price-sheet')).toBeVisible();
    await expect(page).toHaveURL(`${before}#price`);
    await page.goBack();
    await expect(page.getByTestId('price-sheet')).toHaveCount(0);
    await expect(page).toHaveURL(before);
    await expect(page.locator('h1')).toBeVisible();

    await page.getByTestId('price-drywall-patching').click();
    await expect(page.getByTestId('price-sheet')).toBeVisible();
    await page.getByTestId('price-sheet').getByRole('button', { name: 'Close' }).click();
    await expect(page.getByTestId('price-sheet')).toHaveCount(0);
    await expect(page).toHaveURL(before);
    await expect(page.locator('[data-testid=card-drywall-patching] button[aria-pressed]')).toHaveAttribute('aria-pressed', 'false');
  });

  test('D5: on a 390x844 phone the out-of-area message shows under the ZIP, above the footer, and a refused Continue focuses the ZIP', async ({ page }) => {
    await quiet(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/home-services?lang=es');
    await page.locator('[data-testid=card-cabinet-repainting] button[aria-pressed]').click();
    await page.locator('[data-testid=card-gutter-cleaning] button[aria-pressed]').click();
    await page.getByTestId('request-bar').getByRole('button').click();
    const flow = page.getByTestId('request-flow');
    await flow.locator('#hs-address').fill('12 Valley Rd');
    await flow.locator('#hs-zip').fill('07920');
    await flow.locator('#hs-zip').blur();

    const placement = () =>
      page.evaluate(() => {
        const err = document.getElementById('hs-zip-error')!.getBoundingClientRect();
        const zip = document.getElementById('hs-zip')!.getBoundingClientRect();
        const footer = document.querySelector('[data-testid=request-flow] footer')!.getBoundingClientRect();
        return { underZip: err.top >= zip.bottom && err.top - zip.bottom <= 24, visible: err.top >= 0 && err.bottom <= footer.top, focus: document.activeElement?.id };
      });
    await expect(flow.getByTestId('zip-error')).toContainText('Aún no atendemos ese código postal');
    await expect.poll(placement).toMatchObject({ underZip: true, visible: true });

    // Scrolled away, a refused Continue brings it back with focus on the ZIP.
    await flow.locator('.overflow-y-auto').evaluate((el) => el.scrollTo({ top: 0 }));
    await flow.getByRole('button', { name: 'Continuar' }).click();
    await expect(flow.getByTestId('step-details')).toBeVisible();
    await expect.poll(placement).toEqual({ underZip: true, visible: true, focus: 'hs-zip' });
  });

  test('LP3: the price opens what is included and what raises it, without toggling the card', async ({ page }) => {
    await quiet(page);
    await page.goto('/home-services');
    const service = seedService('drywall-patching');
    await page.getByTestId('price-drywall-patching').click();
    const sheet = page.getByTestId('price-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText("What's included");
    await expect(sheet).toContainText('What raises the price');
    for (const item of [...service.included, ...service.raisesPrice]) await expect(sheet).toContainText(t(item, 'en'));
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(page.locator('[data-testid=card-drywall-patching] button[aria-pressed]')).toHaveAttribute('aria-pressed', 'false');
  });

  test('LP4: Request these opens the flow in-page with #request, and Back closes it', async ({ page }) => {
    await quiet(page);
    await page.goto('/home-services');
    await page.locator('[data-testid=card-home-cleaning] button[aria-pressed]').click();
    const before = page.url();
    await page.getByTestId('request-bar').getByRole('button').click();
    await expect(page.getByTestId('request-flow')).toBeVisible();
    await expect(page).toHaveURL(`${before}#request`);
    await expect(page.getByTestId('details-home-cleaning')).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId('request-flow')).toHaveCount(0);
    await expect(page).toHaveURL(before);
    // The selection survives closing the sheet.
    await expect(page.getByTestId('request-bar')).toContainText('(1)');
  });

  test('LP2 LP4 on a first visit: no promo banner over the bar, and Back closes the sheet with every site-wide widget active', async ({ page }) => {
    // No pre-dismissed banners here: this is what a Craigslist visitor gets.
    await page.goto('/home-services');
    // No promo banner over the request bar: the site banner shows after 1.5 s
    // when it shows at all, so wait past that before asserting it never came.
    await page.waitForTimeout(3_000);
    await expect(page.locator('button[aria-label="Dismiss banner"]:visible')).toHaveCount(0);
    await page.locator('[data-testid=card-home-cleaning] button[aria-pressed]').click();
    await page.getByTestId('request-bar').getByRole('button').click();
    await expect(page.getByTestId('request-flow')).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId('request-flow')).toHaveCount(0);
    await expect(page).not.toHaveURL(/#request/);
    await expect(page.locator('[role=dialog]')).toHaveCount(0);
  });

  test('LP6: the bottom Quote tab stays on the page (landing scrolls to the cards, a service page opens the flow)', async ({ page }) => {
    await quiet(page);
    await page.setViewportSize({ width: 390, height: 844 });
    const quote = () => page.getByRole('navigation', { name: 'Services navigation' }).getByRole('link', { name: 'Quote' });

    await page.goto('/home-services');
    await expect(quote()).toHaveAttribute('href', '#services');
    await quote().click();
    await expect(page).toHaveURL(/\/home-services#services$/);
    await expect(page.locator('#services')).toBeInViewport();

    await page.goto('/home-services/drywall-patching');
    await expect(quote()).toHaveAttribute('href', '#request');
    await quote().click();
    await expect(page.getByTestId('request-flow')).toBeVisible();
    await expect(page.locator('[data-testid^=details-]')).toHaveCount(1);
    await expect(page.getByTestId('details-drywall-patching')).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId('request-flow')).toHaveCount(0);
    await expect(page).toHaveURL(/\/home-services\/drywall-patching$/);

    // Loaded with #request (a direct link, a reload, or a tap before hydration):
    // the flow opens, and closing strips the hash without leaving the page.
    await page.goto('/home-services/drywall-patching#request');
    await expect(page.getByTestId('request-flow')).toBeVisible();
    await expect(page.getByTestId('details-drywall-patching')).toBeVisible();
    await page.getByTestId('request-flow').getByRole('button', { name: 'Close' }).click();
    await expect(page.getByTestId('request-flow')).toHaveCount(0);
    await expect(page).toHaveURL(/\/home-services\/drywall-patching$/);

    // The commercial page keeps the older form.
    await page.goto('/commercial-services');
    await expect(quote()).toHaveAttribute('href', '/request-estimate');
  });

  test('LP7: ?lang=es renders the page in Spanish, the toggle switches back, and the choice persists', async ({ page }) => {
    await quiet(page);
    await page.goto('/home-services?lang=es');
    const main = page.locator('main');
    await expect(page.locator('h1')).toHaveText(s('heroTitle', 'es'));
    for (const key of ['servicesTitle', 'howItWorks', 'trustTitle', 'faqTitle', 'homeCarePrice', 'closerTitle'] as const) {
      await expect(main).toContainText(s(key, 'es'));
    }
    for (const service of SEED_SERVICES) await expect(main).toContainText(t(service.name, 'es'));
    // None of the page's own English copy leaks through.
    const text = await main.innerText();
    for (const english of ['Starting at', 'How it works', 'Free seasonal plan', "What's included", 'Select', 'Call (201)']) {
      expect(text, english).not.toContain(english);
    }
    await expect(page.locator('main')).toHaveAttribute('lang', 'es');

    // Persisted: a plain visit is still Spanish.
    await page.goto('/home-services');
    await expect(page.locator('h1')).toHaveText(s('heroTitle', 'es'));

    // The toggle switches back, and that sticks too.
    await page.getByTestId('lang-toggle').click();
    await expect(page.locator('h1')).toHaveText(s('heroTitle', 'en'));
    await expect(page).toHaveURL(/lang=en/);
    await page.goto('/home-services');
    await expect(page.locator('h1')).toHaveText(s('heroTitle', 'en'));
    const cookie = (await page.context().cookies()).find((c) => c.name === 'lv_lang');
    expect(cookie?.value).toBe('en');
  });

  test('LP8 SEO1 SEO2: a service page carries its SEO, card, lists, FAQ and Service JSON-LD, and preselects the flow', async ({ page, request }) => {
    await quiet(page);
    const service = seedService('gutter-cleaning');
    await page.goto(`/home-services/${service.slug}`);
    await expect(page).toHaveTitle(brandedTitle(t(service.seo.title, 'en')));
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', t(service.seo.description, 'en'));
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://www.lavacagc.com/home-services/${service.slug}`);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText(t(service.name, 'en'));
    await expect(page.getByTestId('service-price')).toHaveText(t(service.priceDisplay, 'en'));
    await expect(page.getByTestId('included-list').locator('li')).toHaveCount(service.included.length);
    await expect(page.getByTestId('raises-list').locator('li')).toHaveCount(service.raisesPrice.length);
    await expect(page.getByTestId('service-faq-list').locator('details')).toHaveCount(service.faq.length);

    // Structured data is read from the SERVER HTML, which is what crawlers get
    // (review D4): on a dev server a site-wide footer hydration mismatch can
    // make React re-render the layout and leave a second copy in the DOM.
    const nodes = await jsonLdNodes(request, `/home-services/${service.slug}`);
    const svc = nodes.find((n) => n['@type'] === 'Service') as { offers: unknown; provider: unknown; areaServed: Array<{ name: string }>; aggregateRating?: unknown };
    expect(svc).toBeTruthy();
    expect(svc.offers).toMatchObject({ price: (service.startingPriceCents / 100).toFixed(2), priceCurrency: 'USD' });
    expect(svc.provider).toEqual({ '@id': 'https://www.lavacagc.com/#organization' });
    expect(svc.areaServed.map((a) => a.name)).toEqual(COUNTIES.map((c) => `${c} County, NJ`));
    expect(svc.aggregateRating).toBeUndefined();
    // Exactly one organization node: the layout's.
    const orgs = nodes.filter((n) => n['@id'] === 'https://www.lavacagc.com/#organization' && n['@type'] !== undefined);
    expect(orgs).toHaveLength(1);

    await page.getByTestId('request-this').click();
    await expect(page.getByTestId('request-flow')).toBeVisible();
    await expect(page).toHaveURL(/#request$/);
    await expect(page.getByTestId(`details-${service.slug}`)).toBeVisible();
    await expect(page.locator('[data-testid^=details-]')).toHaveCount(1);
  });

  test('LP8: every catalog slug resolves and an unknown slug is a 404', async ({ request }) => {
    for (const slug of SERVICE_SLUGS) {
      const res = await request.get(`/home-services/${slug}`);
      expect(res.status(), slug).toBe(200);
    }
    const missing = await request.get('/home-services/not-a-service');
    expect(missing.status()).toBe(404);
  });

  test('LP9: ?src and ?lid on either page are stored in 30-day cookies', async ({ page }) => {
    await quiet(page);
    await page.goto('/home-services/drywall-patching?src=Craigslist&lid=7712abc&utm_source=cl&utm_campaign=fall');
    await expect.poll(async () => (await page.context().cookies()).find((c) => c.name === 'lv_src')?.value).toBe('craigslist');
    const cookies = await page.context().cookies();
    const lid = cookies.find((c) => c.name === 'lv_lid');
    expect(lid?.value).toBe('7712abc');
    const src = cookies.find((c) => c.name === 'lv_src')!;
    const days = (src.expires * 1000 - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThanOrEqual(30);
    expect(decodeURIComponent(cookies.find((c) => c.name === 'lv_utm')?.value ?? '')).toContain('"utm_source":"cl"');
  });

  test('LP10 D6: /sitemap.xml lists the landing page and the seven service pages, in English and Spanish', async ({ request }) => {
    const xml = await (await request.get('/sitemap.xml')).text();
    for (const path of ['', ...SERVICE_SLUGS.map((slug) => `/${slug}`)]) {
      expect(xml).toContain(`<loc>https://www.lavacagc.com/home-services${path}</loc>`);
      expect(xml).toContain(`<loc>https://www.lavacagc.com/home-services${path}?lang=es</loc>`);
    }
  });

  test('D6: ?lang=es pages are self-canonical and every version carries hreflang en, es and x-default', async ({ request }) => {
    for (const path of ['/home-services', '/home-services/gutter-cleaning']) {
      const en = `https://www.lavacagc.com${path}`;
      const es = `${en}?lang=es`;
      for (const [query, canonical] of [['', en], ['?lang=es', es]] as const) {
        const html = await (await request.get(`${path}${query}`)).text();
        expect(linkHref(html, 'canonical'), `${path}${query}`).toBe(canonical);
        expect(hreflang(html), `${path}${query}`).toEqual({ en, es, 'x-default': en });
      }
    }
  });

  test('D12: exterior painting offers a unit price per square foot with the minimum; flat prices keep price', async ({ request }) => {
    const exterior = seedService('exterior-painting');
    const svc = (await jsonLdNodes(request, '/home-services/exterior-painting')).find((n) => n['@type'] === 'Service') as { offers: Record<string, unknown> };
    expect(svc.offers.price).toBeUndefined();
    expect(svc.offers).toMatchObject({
      priceCurrency: 'USD',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: (exterior.startingPriceCents / 100).toFixed(2),
        priceCurrency: 'USD',
        unitCode: 'FTK',
        unitText: 'per square foot',
        referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'FTK' },
        // The job minimum, not a floor on the unit price (SEO review).
        eligibleTransactionVolume: { '@type': 'PriceSpecification', minPrice: (exterior.minimumCents! / 100).toFixed(2), priceCurrency: 'USD' },
      },
    });
    expect((svc.offers.priceSpecification as Record<string, unknown>).minPrice).toBeUndefined();
    const drywall = (await jsonLdNodes(request, '/home-services/drywall-patching')).find((n) => n['@type'] === 'Service') as { offers: Record<string, unknown> };
    expect(drywall.offers.price).toBe((seedService('drywall-patching').startingPriceCents / 100).toFixed(2));
    expect(drywall.offers.priceSpecification).toBeUndefined();
  });

  test('SEO review: Spanish service pages link, breadcrumb and mark up FAQs in Spanish; siblings are linked', async ({ request }) => {
    const service = seedService('gutter-cleaning');
    const html = await (await request.get(`/home-services/${service.slug}?lang=es`)).text();
    for (const other of SERVICE_SLUGS.filter((slug) => slug !== service.slug)) {
      expect(html, other).toContain(`href="/home-services/${other}?lang=es"`);
    }
    expect(html).toContain('href="/home-services?lang=es"');
    const nodes = await jsonLdNodes(request, `/home-services/${service.slug}?lang=es`);
    const crumbs = nodes.find((n) => n['@type'] === 'BreadcrumbList') as { itemListElement: Array<{ item: string }> };
    expect(crumbs.itemListElement.map((c) => c.item)).toEqual([
      'https://www.lavacagc.com',
      'https://www.lavacagc.com/home-services?lang=es',
      `https://www.lavacagc.com/home-services/${service.slug}?lang=es`,
    ]);
    const faq = nodes.find((n) => n['@type'] === 'FAQPage') as { mainEntity: Array<{ name: string }> };
    expect(faq.mainEntity.map((q) => q.name)).toEqual(service.faq.map((item) => t(item.q, 'es')));
  });

  test('SEO review: the landing page marks up the seven services under the organization @id, without ratings', async ({ request }) => {
    const [graph] = (await jsonLdNodes(request, '/home-services')).filter((n) => Array.isArray(n['@graph']));
    const nodes = graph['@graph'] as Array<Record<string, unknown>>;
    const services = nodes.filter((n) => n['@type'] === 'Service');
    expect(services.map((n) => n['@id'])).toEqual(SERVICE_SLUGS.map((slug) => `https://www.lavacagc.com/home-services/${slug}#service`));
    for (const svc of services) {
      expect(svc.provider).toEqual({ '@id': 'https://www.lavacagc.com/#organization' });
      expect(svc.aggregateRating).toBeUndefined();
    }
    expect(nodes.some((n) => n['@type'] === 'FAQPage')).toBe(true);
  });
});
