import { test, expect as baseExpect, type APIRequestContext, type Page } from '@playwright/test';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON } from './helpers/liveBackend';
import { SEED_ROWS, SEED_SERVICES, seedService } from './helpers/homeServicesSeed';
import { SERVICE_SLUGS, SERVICE_TRADE, t } from '../src/lib/home-services/catalog';
import { HOME_SERVICES_SEED } from '../src/lib/home-services/catalogSeed';
import { contentToRow, rowToService, type HomeServiceRow } from '../src/lib/home-services/catalogRow';
import { fieldErrors, ServicePatchSchema } from '../src/lib/home-services/catalogSchema';
import { brandedTitle } from '../src/lib/home-services/seo';
import { seedSql } from '../scripts/seed-home-services';

/**
 * Phase 2 slice E - the seven home services in the `home_services` table and
 * the Services & Prices editor (docs/phase-2/acceptance-criteria.md, CAT1 to
 * CAT8).
 *
 * The unit and source checks run everywhere. CAT8's HTTP checks run against
 * any server. The browser checks need the local Supabase rig behind a dev
 * server and edit real rows, so they run one at a time and put every row they
 * touched back to the seed through the admin route (which also expires the
 * page cache):
 *   TEST_URL=http://localhost:3111 E2E_LIVE_BACKEND=1 \
 *     node_modules/.bin/playwright test tests/home-services-catalog.spec.ts --project=chromium --workers=1
 * Do not run it beside tests/home-services-landing.spec.ts: that spec expects
 * the seeded prices this one changes for a few seconds at a time.
 *
 * Edits carry a `slice-e-` marker so a row left behind by a killed run is
 * recognisable.
 */

const expect = baseExpect.configure({ timeout: 15_000 });
const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const MIGRATION = 'supabase/migrations/20261030000000_phase_2.sql';
/** A Spanish description that must never reach a browser bundle (CAT7). */
const SPANISH_MARKER = seedService('hvac-cleaning').description.es;

/** A copy of `obj` without `keys`. */
function omit<T extends object>(obj: T, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));
}

/** The fields PATCH accepts, from a row: what "put it back to the seed" sends. */
const patchBodyOf = (row: HomeServiceRow) => omit(row, ['slug', 'sort', 'trade', 'icon', 'image', 'updated_at', 'updated_by']);

// ---------------------------------------------------------------------------
// Unit and source checks: no server needed.

test.describe('CAT6 seed equals catalog (unit)', () => {
  test('CAT6: the migration seeds exactly what scripts/seed-home-services.ts prints from catalogSeed.ts', () => {
    const migration = read(MIGRATION);
    expect(migration).toContain(seedSql());
  });

  test('CAT6: the seed covers the seven slugs in landing order, with the trades and questions code routes on', () => {
    expect(HOME_SERVICES_SEED.map((s) => s.slug)).toEqual([...SERVICE_SLUGS]);
    for (const s of HOME_SERVICES_SEED) expect(s.trade, s.slug).toBe(SERVICE_TRADE[s.slug as keyof typeof SERVICE_TRADE]);
    for (const service of SEED_SERVICES) expect(service.questions, service.slug).toHaveLength(3);
  });

  test('CAT6: a seed row read back from the table renders the same service it was written from', () => {
    for (const [i, content] of HOME_SERVICES_SEED.entries()) {
      const service = rowToService(contentToRow(content, i + 1));
      expect(service.active).toBe(true);
      expect(omit(service, ['sort', 'active', 'questions'])).toEqual(content);
    }
  });

  test('CAT6: no spec or source reads prices from catalog constants any more', () => {
    const landing = read('tests/home-services-landing.spec.ts');
    expect(landing).toContain("from './helpers/homeServicesSeed'");
    expect(landing).not.toMatch(/HOME_SERVICES_CATALOG|getService\(/);
    const catalog = read('src/lib/home-services/catalog.ts');
    expect(catalog).not.toMatch(/startingPriceCents: \d|priceDisplay: \{ en:|HOME_SERVICES_CATALOG/);
  });
});

test.describe('CAT5 validation (unit)', () => {
  const valid = patchBodyOf(SEED_ROWS[1]);

  test('CAT5: a full seed row is a valid save', () => {
    expect(ServicePatchSchema.safeParse(valid).success).toBe(true);
  });

  test('CAT5: zero price, empty Spanish name and a 61-character SEO title each get a field-level message', () => {
    const parsed = ServicePatchSchema.safeParse({ ...valid, starting_price_cents: 0, name_es: '  ', seo_title_en: 'x'.repeat(61) });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const errors = fieldErrors(parsed.error);
    expect(errors.starting_price_cents).toBe('Starting price must be at least 1 cent');
    expect(errors.name_es).toBe('Spanish name is required');
    expect(errors.seo_title_en).toBe('English SEO title is at most 60 characters');
  });

  test('CAT5: the rest of the contract - price bounds, description 160, keywords 10, paired lists, no unknown keys', () => {
    const bad = (body: Record<string, unknown>) => {
      const parsed = ServicePatchSchema.safeParse(body);
      return parsed.success ? {} : fieldErrors(parsed.error);
    };
    expect(bad({ starting_price_cents: 10_000_001 }).starting_price_cents).toMatch(/at most/);
    expect(bad({ starting_price_cents: 12.5 }).starting_price_cents).toMatch(/whole cents/);
    expect(bad({ starting_price_cents: 10_000_000 })).toEqual({});
    expect(bad({ seo_title_es: 'x'.repeat(60) })).toEqual({});
    expect(bad({ seo_description_en: 'x'.repeat(161) }).seo_description_en).toMatch(/160/);
    expect(bad({ seo_keywords: Array.from({ length: 11 }, (_, i) => `k${i}`) }).seo_keywords).toMatch(/10/);
    expect(bad({ name_en: '' }).name_en).toBe('English name is required');
    expect(bad({ included_en: ['a', 'b'], included_es: ['a'] }).included_es).toMatch(/one line per English line/);
    expect(bad({ included_en: ['a'] }).included_es).toMatch(/together/);
    expect(bad({ slug: 'hvac-cleaning' })._form).toBeTruthy();
    expect(bad({ updated_by: '00000000-0000-0000-0000-000000000001' })._form).toBeTruthy();
    expect(bad({})._form).toBe('Nothing to save');
  });
});

test.describe('CAT7 and CAT8 (source)', () => {
  test('CAT7: no client component imports the seed or the server read; the pages pass services as props', () => {
    const dirs = ['src/components', 'src/app', 'src/hooks'];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(join(ROOT, dir))) {
        const rel = join(dir, name);
        if (statSync(join(ROOT, rel)).isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(name)) {
          const src = read(rel);
          if (/^['"]use client['"]/m.test(src) && /catalogSeed|catalogData/.test(src)) offenders.push(rel);
        }
      }
    };
    dirs.forEach(walk);
    expect(offenders).toEqual([]);
    expect(read('src/app/home-services/page.tsx')).toContain('<ServiceCatalog lang={lang} services={catalog} />');
    expect(read('src/components/home-services/RequestFlow.tsx')).toContain('catalog: HomeService[];');
  });

  test('CAT7: the built client chunks do not contain the catalog copy (needs a production build in .next)', () => {
    const dir = join(ROOT, '.next/static/chunks');
    let scanned = 0;
    // BUILD_ID marks a production build; `next dev` keeps its own output under .next/dev.
    test.skip(!existsSync(join(ROOT, '.next/BUILD_ID')), 'no production build in .next (the live run checks the chunks the browser loads instead)');
    const hits: string[] = [];
    const walk = (d: string) => {
      for (const name of readdirSync(d)) {
        const p = join(d, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (name.endsWith('.js')) {
          scanned += 1;
          if (readFileSync(p, 'utf8').includes(SPANISH_MARKER)) hits.push(p);
        }
      }
    };
    walk(dir);
    expect(scanned).toBeGreaterThan(20);
    expect(hits).toEqual([]);
  });

  test('CAT8: /api/admin/* and /vaca-mgmt are behind the middleware session check', () => {
    const mw = read('src/middleware.ts');
    expect(mw).toContain("'/api/admin/',");
    expect(mw).toContain("'/vaca-mgmt',");
    expect(read('src/components/admin/AdminSidebar.tsx')).toContain("{ id: 'home-services-catalog', icon: Tags, label: 'Services & Prices' }");
  });
});

// ---------------------------------------------------------------------------
// CAT8 over HTTP: no session.

test.describe('CAT8 signed out (any server)', () => {
  test('CAT8: signed out, the editor redirects to sign-in and both routes answer 401 without writing', async ({ request }) => {
    const page = await request.get('/vaca-mgmt?tab=home-services-catalog', { maxRedirects: 0 });
    expect([302, 307]).toContain(page.status());
    expect(page.headers()['location']).toContain('/auth?next=%2Fvaca-mgmt%3Ftab%3Dhome-services-catalog');

    const list = await request.get('/api/admin/home-services');
    expect(list.status()).toBe(401);
    const save = await request.patch('/api/admin/home-services/hvac-cleaning', { data: { starting_price_cents: 100 } });
    expect(save.status()).toBe(401);
    expect(await save.json()).toEqual({ error: 'Unauthorized' });
  });
});

// ---------------------------------------------------------------------------
// The rig: real rows, a real admin session, a dev server.

function readEnvFile(): Record<string, string> {
  const file = join(ROOT, '.env.local');
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const ENV: Record<string, string | undefined> = { ...readEnvFile(), ...process.env };
const SB_URL = ENV.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:55421';
const SB_KEY = ENV.SUPABASE_SECRET_KEY ?? '';
const SB_ANON = ENV.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const ADMIN_EMAIL = ENV.E2E_ADMIN_EMAIL ?? 'slice-e-admin@local.test';
const ADMIN_PASSWORD = ENV.E2E_ADMIN_PASSWORD ?? 'LocalAdmin!2026';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

async function dbRow(slug: string): Promise<HomeServiceRow> {
  const res = await fetch(`${SB_URL}/rest/v1/home_services?slug=eq.${slug}&select=*`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!res.ok) throw new Error(`read ${slug}: ${res.status} ${await res.text()}`);
  const [row] = (await res.json()) as HomeServiceRow[];
  return row;
}

async function rest<T = unknown>(method: string, p: string, body?: unknown, prefer = 'return=representation'): Promise<T> {
  const res = await fetch(`${SB_URL}/rest/v1/${p}`, {
    method,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: prefer },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${p} -> ${res.status} ${await res.text()}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

async function sessionCookie(): Promise<{ name: string; value: string; header: string; userId: string }> {
  await fetch(`${SB_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, email_confirm: true }),
  });
  const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SB_ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const session = await res.json();
  if (!session.access_token) throw new Error(`admin sign-in failed: ${JSON.stringify(session)}`);
  const name = `sb-${new URL(SB_URL).hostname.split('.')[0]}-auth-token`;
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
  return { name, value, header: `${name}=${value}`, userId: session.user.id };
}

const jsonLd = (html: string) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]) as Record<string, unknown>);
const decode = (v: string) => v.replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const titleOf = (html: string) => decode(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '');
const metaDescriptionOf = (html: string) => decode(html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '');

test.describe('Services & Prices on the rig (live backend)', () => {
  test.skip(SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON);
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180_000);
  test.use({ viewport: { width: 1366, height: 900 }, userAgent: UA });

  let cookie: Awaited<ReturnType<typeof sessionCookie>>;
  let admin: APIRequestContext;

  /** Put a row back to its seed through the admin route, so the page cache is expired too. */
  async function restore(slug: string) {
    const seed = SEED_ROWS.find((r) => r.slug === slug)!;
    const res = await admin.patch(`/api/admin/home-services/${slug}`, { data: patchBodyOf(seed) });
    expect(res.status(), await res.text()).toBe(200);
  }

  test.beforeAll(async ({ playwright, baseURL }) => {
    cookie = await sessionCookie();
    admin = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Cookie: cookie.header, 'User-Agent': UA } });
    // Start from the seed: CAT1 compares the pages to it.
    for (const slug of SERVICE_SLUGS) await restore(slug);
  });

  test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([{ name: cookie.name, value: cookie.value, url: baseURL! }]);
  });

  test.afterAll(async () => {
    if (!admin) return;
    for (const slug of SERVICE_SLUGS) await restore(slug);
    await admin.dispose();
  });

  async function openEditor(page: Page) {
    await page.goto('/vaca-mgmt?tab=home-services-catalog', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('catalog-list')).toBeVisible({ timeout: 60_000 });
    await page.mouse.move(1000, 450);
  }

  async function editRow(page: Page, slug: string) {
    await openEditor(page);
    const row = page.locator(`[data-testid=catalog-row][data-slug="${slug}"]`);
    await row.getByRole('button', { name: /^Edit / }).click();
    await expect(page.getByTestId('catalog-form')).toHaveAttribute('data-slug', slug);
  }

  test('CAT1: the landing page and every service page render the seeded table rows, identical to the seed', async ({ page, request }) => {
    // The table holds the seed (beforeAll put it there through the editor's route).
    for (const seed of SEED_ROWS) {
      const stamps = ['updated_at', 'updated_by'];
      expect(omit(await dbRow(seed.slug), stamps), seed.slug).toEqual(omit(seed, stamps));
    }

    await page.goto('/home-services');
    const cards = page.locator('[data-testid=service-cards] > li');
    await expect(cards).toHaveCount(7);
    for (const [i, service] of SEED_SERVICES.entries()) {
      const card = cards.nth(i);
      await expect(card).toHaveAttribute('data-testid', `card-${service.slug}`);
      for (const text of [service.name.en, service.priceDisplay.en, service.priceUnit.en, service.description.en]) await expect(card).toContainText(text);
    }

    for (const service of SEED_SERVICES) {
      for (const lang of ['en', 'es'] as const) {
        const path = `/home-services/${service.slug}${lang === 'es' ? '?lang=es' : ''}`;
        const html = await (await request.get(path)).text();
        expect(titleOf(html), path).toBe(brandedTitle(t(service.seo.title, lang)));
        expect(metaDescriptionOf(html), path).toBe(t(service.seo.description, lang));
        const svc = jsonLd(html).find((n) => n['@type'] === 'Service')!;
        expect(svc.name, path).toBe(t(service.name, lang));
        expect(svc.description, path).toBe(t(service.description, lang));
        const text = decode(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
        for (const item of [...service.included, ...service.raisesPrice]) expect(text, `${path}: ${item.en}`).toContain(t(item, lang));
        for (const item of service.faq) expect(text, path).toContain(t(item.q, lang));
        expect(text, path).toContain(t(service.priceDisplay, lang));
      }
    }
  });

  test('CAT2: a price saved in the editor shows on /home-services, the service page and the request flow price line on the next request', async ({ page }) => {
    const slug = 'home-cleaning';
    const before = seedService(slug);
    expect(before.priceDisplay.en).toBe('$259');
    await editRow(page, slug);
    await page.getByLabel('Starting price (USD)').fill('271');
    // The display lines follow the price; prose that still quotes $259 is listed.
    await expect(page.locator('#price_display_en')).toHaveValue('$271');
    await expect(page.locator('#price_display_es')).toHaveValue('$271');
    await expect(page.getByTestId('catalog-stale-price')).toContainText('The old price $259 still appears in');
    await expect(page.getByTestId('catalog-stale-price')).toContainText('English SEO title');
    await page.getByTestId('catalog-save').click();
    await expect(page.getByTestId('catalog-saved')).toBeVisible();

    const row = await dbRow(slug);
    expect(row.starting_price_cents).toBe(27100);
    expect(row.price_display_en).toBe('$271');
    expect(row.updated_by).toBe(cookie.userId);

    await page.goto('/home-services');
    await expect(page.getByTestId(`price-${slug}`)).toContainText('$271');
    await page.goto(`/home-services/${slug}`);
    await expect(page.getByTestId('service-price')).toHaveText('$271');
    await page.getByTestId('request-this').click();
    await expect(page.getByTestId(`flow-price-${slug}`)).toContainText('$271');
    await expect(page.getByTestId(`flow-price-${slug}`)).toContainText(before.priceUnit.en);
    await page.screenshot({ path: test.info().outputPath('cat2-flow-price.png') });

    await restore(slug);
    await page.goto(`/home-services/${slug}`);
    await expect(page.getByTestId('service-price')).toHaveText('$259');
  });

  test('CAT3: a saved SEO title, description and name change the <title>, meta description and JSON-LD name on the next request', async ({ page, request }) => {
    const slug = 'drywall-patching';
    await editRow(page, slug);
    const title = 'slice-e Drywall Repair in Essex, Morris & Bergen NJ';
    const description = 'slice-e drywall repair from $349 in Essex, Morris and Bergen NJ: patched, primed and painted to blend.';
    await page.locator('#seo_title_en').fill(title);
    await page.locator('#seo_description_en').fill(description);
    await page.locator('#name_en').fill('slice-e Drywall patching');
    await page.getByTestId('catalog-save').click();
    await expect(page.getByTestId('catalog-saved')).toBeVisible();

    const html = await (await request.get(`/home-services/${slug}`)).text();
    expect(titleOf(html)).toBe(brandedTitle(title));
    expect(metaDescriptionOf(html)).toBe(description);
    const svc = jsonLd(html).find((n) => n['@type'] === 'Service')!;
    expect(svc.name).toBe('slice-e Drywall patching');
    // The landing page's Service graph carries the new name too.
    const landing = await (await request.get('/home-services')).text();
    const graph = jsonLd(landing).flatMap((n) => (n['@graph'] as Array<Record<string, unknown>> | undefined) ?? [n]);
    expect(graph.find((n) => n['@id'] === `https://www.lavacagc.com/home-services/${slug}#service`)?.name).toBe('slice-e Drywall patching');
    // Spanish is untouched.
    const es = await (await request.get(`/home-services/${slug}?lang=es`)).text();
    expect(titleOf(es)).toBe(brandedTitle(seedService(slug).seo.title.es));

    await restore(slug);
    expect(titleOf(await (await request.get(`/home-services/${slug}`)).text())).toBe(brandedTitle(seedService(slug).seo.title.en));
  });

  test('CAT4: switching a service off removes its card, sitemap entries and page; switching it on restores all three', async ({ page, request }) => {
    const slug = 'gutter-cleaning';
    const entries = (xml: string) => [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]).filter((u) => u.includes(`/home-services/${slug}`));
    expect(entries(await (await request.get('/sitemap.xml')).text())).toHaveLength(2);

    await openEditor(page);
    const row = page.locator(`[data-testid=catalog-row][data-slug="${slug}"]`);
    await row.getByTestId('catalog-active').click();
    await expect(row.getByTestId('catalog-active')).toHaveAttribute('aria-checked', 'false');
    await expect.poll(async () => (await dbRow(slug)).active).toBe(false);

    await page.goto('/home-services');
    await expect(page.locator('[data-testid=service-cards] > li')).toHaveCount(6);
    await expect(page.getByTestId(`card-${slug}`)).toHaveCount(0);
    expect(entries(await (await request.get('/sitemap.xml')).text())).toEqual([]);
    expect((await request.get(`/home-services/${slug}`)).status()).toBe(404);
    expect((await request.get(`/home-services/${slug}?lang=es`)).status()).toBe(404);
    // Another service page no longer links to it.
    await page.goto('/home-services/hvac-cleaning');
    await expect(page.getByTestId('sibling-services').locator(`a[href="/home-services/${slug}"]`)).toHaveCount(0);

    await openEditor(page);
    await page.locator(`[data-testid=catalog-row][data-slug="${slug}"]`).getByTestId('catalog-active').click();
    await expect.poll(async () => (await dbRow(slug)).active).toBe(true);
    await page.goto('/home-services');
    await expect(page.locator('[data-testid=service-cards] > li')).toHaveCount(7);
    await expect(page.getByTestId(`card-${slug}`)).toBeVisible();
    expect(entries(await (await request.get('/sitemap.xml')).text())).toHaveLength(2);
    expect((await request.get(`/home-services/${slug}`)).status()).toBe(200);
  });

  test('CAT4: an existing request keeps its service names in the admin (list, detail, bid form) while the service is off', async ({ page }) => {
    const slug = 'hvac-cleaning';
    const tag = `slice-e-${Date.now().toString(36)}`;
    const [lead] = await rest<Array<{ id: string }>>('POST', 'leads', [{ source: `home_services:${tag}` }]);
    const [req] = await rest<Array<{ id: string }>>('POST', 'home_service_requests', [{
      lead_id: lead.id, status: 'new', services: [slug, 'drywall-patching'], answers: { [slug]: { systems: '2' } },
      first_name: `${tag} Ana`, last_name: 'Ruiz', phone: '(973) 555-0142', email: `${tag}@local.test`,
      address: '4 Oak St', town: 'Montclair', zip: '07042', timing: 'flexible', notes: '', consent_sms: true, source: tag,
    }]);
    try {
      const off = await admin.patch(`/api/admin/home-services/${slug}`, { data: { active: false } });
      expect(off.status()).toBe(200);
      // The public page is gone...
      expect((await page.request.get(`/home-services/${slug}`)).status()).toBe(404);
      // ...but the request still reads "HVAC cleaning", in the API and on screen.
      const detail = await (await admin.get(`/api/admin/service-requests/${req.id}`)).json();
      expect(detail.request.answer_lines).toEqual(['HVAC cleaning - Systems: 2', 'Drywall patching']);
      await page.goto('/vaca-mgmt?tab=service-requests', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('#sr-filter-source option', { hasText: tag })).toHaveCount(1, { timeout: 60_000 });
      await page.locator('#sr-filter-source').selectOption(tag);
      const row = page.locator(`[data-testid=sr-row][data-request-id="${req.id}"]`);
      await expect(row).toContainText('HVAC cleaning, Drywall patching');
      // The detail and the bid form read names and the starting price from the table too.
      await row.click();
      await expect(page.getByText('HVAC cleaning - Systems: 2', { exact: true })).toBeVisible();
      await page.getByTestId('sr-send-bid').click();
      const form = page.getByTestId('bid-form');
      await expect(form.locator('[data-trade="hvac"]')).toContainText('Catalog starting price $299');
      await expect(form.locator('[data-trade="drywall"]')).toContainText('Catalog starting price $349');
      await page.screenshot({ path: test.info().outputPath('cat4-inactive-names-bid-form.png') });
    } finally {
      await restore(slug);
      await rest('DELETE', `home_service_requests?id=eq.${req.id}`, undefined, 'return=minimal');
      await rest('DELETE', `leads?id=eq.${lead.id}`, undefined, 'return=minimal');
    }
  });

  test('CAT5: zero price, empty Spanish name and a 61-character SEO title show field messages and write nothing', async ({ page }) => {
    const slug = 'cabinet-repainting';
    const before = await dbRow(slug);
    await editRow(page, slug);
    await page.getByLabel('Starting price (USD)').fill('0');
    await page.locator('#name_es').fill('');
    await page.locator('#seo_title_en').fill('x'.repeat(61));
    await expect(page.getByText('61/60')).toBeVisible();
    await page.getByTestId('catalog-save').click();

    await expect(page.getByTestId('catalog-form-error')).toHaveText('Fix the highlighted fields');
    await expect(page.getByTestId('error-starting_price_cents')).toHaveText('Starting price must be at least 1 cent');
    await expect(page.getByTestId('error-name_es')).toHaveText('Spanish name is required');
    await expect(page.getByTestId('error-seo_title_en')).toHaveText('English SEO title is at most 60 characters');
    await expect(page.locator('#name_es')).toHaveAttribute('aria-invalid', 'true');
    // Focus goes to the first field in error, not left by the Save button.
    await expect(page.getByLabel('Starting price (USD)')).toBeFocused();
    await expect(page.getByLabel('Starting price (USD)')).toBeInViewport();
    await page.screenshot({ path: test.info().outputPath('cat5-field-errors.png'), fullPage: false });

    const after = await dbRow(slug);
    expect(after).toEqual(before);
  });

  test('CAT7: the JavaScript the browser loads for /home-services carries no catalog copy', async ({ page }) => {
    const scripts: Array<{ url: string; body: string }> = [];
    page.on('response', async (res) => {
      if (res.request().resourceType() === 'script') scripts.push({ url: res.url(), body: await res.text().catch(() => '') });
    });
    /** Where a string turns up: the script URL and the text around it, so a failure says which chunk. */
    const found = (needle: string) =>
      scripts.filter((js) => js.body.includes(needle)).map((js) => {
        const i = js.body.indexOf(needle);
        return `${js.url}: ...${js.body.slice(Math.max(0, i - 160), i + 80)}...`;
      });
    await page.goto('/home-services');
    await expect(page.locator('[data-testid=service-cards] > li')).toHaveCount(7);
    // Open the request flow too: its chunk loads on demand.
    await page.getByTestId('card-hvac-cleaning').getByRole('button', { pressed: false }).first().click();
    await page.getByTestId('request-bar').getByRole('button').click();
    await expect(page.getByTestId('request-flow')).toBeVisible();
    expect(scripts.length).toBeGreaterThan(5);
    expect(found(SPANISH_MARKER)).toEqual([]);
    // More of the seed's copy: an English description and a Spanish FAQ answer of other services.
    // (Not the identifier HOME_SERVICES_SEED: a dev bundle keeps catalog.ts's comments, which name it.)
    expect(found(seedService('drywall-patching').description.en)).toEqual([]);
    expect(found(seedService('gutter-cleaning').faq[0].a.es)).toEqual([]);
  });

  test('CAT8: a signed-in admin reaches the editor and the list route', async ({ page }) => {
    await openEditor(page);
    await expect(page.getByTestId('catalog-row')).toHaveCount(7);
    await expect(page.locator('[data-testid=catalog-row][data-slug="exterior-painting"]').getByTestId('catalog-price')).toHaveText('$2.95 / sq ft');
    await page.screenshot({ path: test.info().outputPath('cat8-editor-list.png') });
    const res = await admin.get('/api/admin/home-services');
    expect(res.status()).toBe(200);
  });
});
