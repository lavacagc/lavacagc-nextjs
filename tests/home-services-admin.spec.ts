import { test, expect as baseExpect, type APIRequestContext, type Page, type BrowserContext } from '@playwright/test';
import { randomBytes, randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import path from 'path';
import { deflateSync, crc32 } from 'zlib';
import { SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON } from './helpers/liveBackend';
import { customerPriceForSubPay } from '../src/lib/home-services/pricing';

/**
 * Slice B - the admin screens with a REAL local session (no mocked routes):
 * Customers > Service Requests (AD1-AD4, AD7, BD1, the Sub Responses inbox for
 * BD5/BD7), Subs (AD5) and Pricing Report (AD6).
 *
 * Run: TEST_URL=http://localhost:3102 E2E_LIVE_BACKEND=1 \
 *        node_modules/.bin/playwright test tests/home-services-admin.spec.ts --project=chromium
 *
 * Signs in as the local GoTrue admin (password grant) and sets the session
 * cookie the app's middleware verifies. Each test seeds its own rows under a
 * unique `zztest-b-...` source tag and filters the screens down to them, so
 * the shared database (other builders write to it too) cannot move the
 * numbers under a test. Evidence screenshots land in EVIDENCE_DIR.
 */

// A dev server compiles each route on first hit, under several workers at once.
const expect = baseExpect.configure({ timeout: 15_000 });

const EVIDENCE_DIR = process.env.EVIDENCE_DIR || 'test-results/home-services-admin-evidence';
mkdirSync(EVIDENCE_DIR, { recursive: true });
const shot = (name: string) => path.join(EVIDENCE_DIR, name);

function readEnvFile(): Record<string, string> {
  const file = path.join(process.cwd(), '.env.local');
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
const ADMIN_EMAIL = ENV.E2E_ADMIN_EMAIL ?? 'admin-b@local.test';
const ADMIN_PASSWORD = ENV.E2E_ADMIN_PASSWORD ?? 'LocalAdmin!2026';

const RUN = `ZZTEST-B-${Date.now().toString(36)}${randomBytes(2).toString('hex')}`;
let seq = 0;
/** A source tag unique to one test, so filters isolate that test's rows. */
const newTag = () => `${RUN.toLowerCase()}-${(seq += 1)}`;

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

async function count(p: string): Promise<number> {
  const res = await fetch(`${SB_URL}/rest/v1/${p}`, {
    method: 'HEAD',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Prefer: 'count=exact' },
  });
  return Number(res.headers.get('content-range')?.split('/')[1] ?? 'NaN');
}

async function sessionCookie(): Promise<{ name: string; value: string; header: string }> {
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
  return { name, value, header: `${name}=${value}` };
}

/** A real, visible PNG (a warm gradient) so the gallery has something to load. */
function gradientPng(w = 160, h = 120): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y += 1) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x += 1) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = 200 + Math.round((x / w) * 50);
      raw[o + 1] = 120 + Math.round((y / h) * 60);
      raw[o + 2] = 60;
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

interface Req { id: string; status: string; admin_notes: string; customer_price_cents: number | null; won_at: string | null; lost_reason: string | null }

async function seedRequest(tag: string, label: string, over: Record<string, unknown> = {}): Promise<Req> {
  const [lead] = await rest<Array<{ id: string }>>('POST', 'leads', [{ source: `home_services:${tag}` }]);
  const [row] = await rest<Req[]>('POST', 'home_service_requests', [{
    lead_id: lead.id,
    status: 'new',
    services: ['cabinet-repainting', 'gutter-cleaning'],
    answers: { 'cabinet-repainting': { doors: '26_40', color_change: 'new' } },
    first_name: `${RUN} ${label}`,
    last_name: 'Lopez',
    phone: '(973) 555-0101',
    email: 'zztest-b-maria@local.test',
    address: '12 Elm St',
    town: 'Montclair',
    zip: '07042',
    timing: 'two_weeks',
    notes: 'Dog in the yard, use the side gate.',
    consent_sms: true,
    source: tag,
    listing_id: 'cl-7781',
    ...over,
  }]);
  return row;
}

async function addPhoto(requestId: string): Promise<void> {
  const storagePath = `requests/${requestId}/${randomUUID()}.png`;
  const bytes = gradientPng();
  const up = await fetch(`${SB_URL}/storage/v1/object/service-request-photos/${storagePath}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'image/png' },
    body: new Uint8Array(bytes),
  });
  if (!up.ok) throw new Error(`photo upload failed: ${up.status} ${await up.text()}`);
  await rest('POST', 'lead_photos', [{ request_id: requestId, storage_path: storagePath, content_type: 'image/png', bytes: bytes.length, width: 160, height: 120 }]);
}

interface Sub { id: string; business_name: string }

async function createSub(api: APIRequestContext, name: string, over: Record<string, unknown> = {}): Promise<Sub> {
  const res = await api.post('/api/admin/subs', {
    data: {
      business_name: `${RUN} ${name}`, contact_name: name, phone: '(973) 555-0177', email: '',
      trades: ['cabinet_painting'], counties: ['Essex'], language: 'en', status: 'approved',
      insurance_expires_at: '2030-01-01', hic_expires_at: '2030-01-01', notes: '', ...over,
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).sub;
}

async function openTab(page: Page, label: 'Service Requests' | 'Subs' | 'Pricing Report') {
  await page.goto('/vaca-mgmt', { waitUntil: 'domcontentloaded' });
  // The admin renders client-side; wait for it before asking what is on screen.
  await expect(page.getByRole('heading', { name: 'Content Management', level: 1 })).toBeVisible({ timeout: 60_000 });
  const phone = (page.viewportSize()?.width ?? 1366) < 768;
  if (phone) await page.getByRole('button', { name: 'Open menu' }).click();
  const leaf = page.getByRole('button', { name: label, exact: true });
  // The sidebar remembers its open group; open Customers only when it is closed.
  if (!(await leaf.isVisible())) {
    await page.getByRole('button', { name: 'Customers', exact: true }).click();
  }
  await leaf.click();
  // The desktop sidebar expands on hover and would sit over the content.
  if (!phone) await page.mouse.move(1000, 450);
}

async function filterSource(page: Page, tag: string) {
  await expect(page.locator('#sr-filter-source option', { hasText: tag })).toHaveCount(1);
  await page.locator('#sr-filter-source').selectOption(tag);
  // Wait for the filtered answer, not the list that was on screen before it.
  await expect(page.getByTestId('sr-list')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByTestId('sr-row').first()).toContainText(tag);
}

test.describe('home services admin (live backend)', () => {
  test.skip(SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON);
  test.setTimeout(150_000);
  test.use({ viewport: { width: 1366, height: 900 } });

  let cookie: { name: string; value: string; header: string };
  let api: APIRequestContext;

  test.beforeAll(async ({ playwright, baseURL }) => {
    cookie = await sessionCookie();
    api = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { Cookie: cookie.header, 'User-Agent': 'Mozilla/5.0 (Macintosh) Chrome/120 Safari/537.36' },
    });
  });

  test.beforeEach(async ({ context, baseURL }: { context: BrowserContext; baseURL?: string }) => {
    await context.addCookies([{ name: cookie.name, value: cookie.value, url: baseURL! }]);
  });

  test.afterAll(async () => {
    const reqs = await rest<Array<{ id: string; lead_id: string }>>('GET', `home_service_requests?select=id,lead_id&first_name=like.${encodeURIComponent(RUN)}*`);
    const ids = reqs.map((r) => r.id);
    if (ids.length) {
      const photos = await rest<Array<{ storage_path: string }>>('GET', `lead_photos?select=storage_path&request_id=in.(${ids.join(',')})`);
      if (photos.length) {
        await fetch(`${SB_URL}/storage/v1/object/service-request-photos`, {
          method: 'DELETE',
          headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefixes: photos.map((p) => p.storage_path) }),
        });
      }
      await rest('DELETE', `job_offers?request_id=in.(${ids.join(',')})`);
      await rest('DELETE', `home_service_requests?id=in.(${ids.join(',')})`);
      const leadIds = reqs.map((r) => r.lead_id).filter(Boolean);
      if (leadIds.length) await rest('DELETE', `leads?id=in.(${leadIds.join(',')})`);
    }
    await rest('DELETE', `subs?business_name=like.${encodeURIComponent(RUN)}*`);
    await rest('DELETE', `rate_limits?ip_address=like.offer-ip:10.250.*`);
    await api.dispose();
  });

  test('AD1: the list is newest first with status, services, town, source, verified and age; filters and the Held view work', async ({ page }) => {
    const tag = newTag();
    const hour = 3_600_000;
    const a = await seedRequest(tag, 'Newest', { created_at: new Date(Date.now() - hour).toISOString(), phone_verified: true });
    const held = await seedRequest(tag, 'Held one', { status: 'held', services: ['drywall-patching'], answers: {}, town: 'Alpine', zip: '07620', created_at: new Date(Date.now() - 50 * hour).toISOString() });
    const morris = await seedRequest(tag, 'Morris one', { services: ['hvac-cleaning'], answers: {}, town: 'Morristown', zip: '07960', created_at: new Date(Date.now() - 120 * hour).toISOString() });

    await openTab(page, 'Service Requests');
    await filterSource(page, tag);
    const rows = page.getByTestId('sr-row');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toHaveAttribute('data-request-id', a.id);
    await expect(rows.nth(1)).toHaveAttribute('data-request-id', held.id);
    await expect(rows.nth(2)).toHaveAttribute('data-request-id', morris.id);
    await expect(rows.nth(0)).toContainText('New');
    await expect(rows.nth(0)).toContainText('Cabinet repainting, Gutter cleaning');
    await expect(rows.nth(0)).toContainText('Montclair · Essex');
    await expect(rows.nth(0)).toContainText(tag);
    await expect(rows.nth(0)).toContainText('phone verified');
    await expect(rows.nth(0)).toContainText(/^.*1h/);
    await expect(rows.nth(1)).toContainText('Held');
    await expect(rows.nth(1)).toContainText('unverified');
    await expect(rows.nth(1)).toContainText('2d');
    await expect(rows.nth(2)).toContainText('5d');
    await page.screenshot({ path: shot('ad1-list-desktop.png'), fullPage: true });

    await page.locator('#sr-filter-status').selectOption('held');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute('data-request-id', held.id);
    await page.getByTestId('sr-tab-all').click();
    await expect(rows).toHaveCount(3);
    await page.getByTestId('sr-tab-held').click();
    await expect(rows).toHaveCount(1);
    await expect(page.getByTestId('sr-tab-held')).toContainText(/Held \(\d+\)/);
    await page.getByTestId('sr-tab-all').click();

    await page.locator('#sr-filter-service').selectOption('hvac-cleaning');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute('data-request-id', morris.id);
    await page.locator('#sr-filter-service').selectOption('');
    await page.locator('#sr-filter-county').selectOption('Bergen');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute('data-request-id', held.id);
    await page.locator('#sr-filter-county').selectOption('Morris');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute('data-request-id', morris.id);
  });

  test('AD2: the detail panel shows every field, answers as lines, signed photos, map, call and text links', async ({ page }) => {
    const tag = newTag();
    const req = await seedRequest(tag, 'Detail', { utm: { utm_campaign: 'fall' }, cta_variant_primary: 'B', captcha_score: 0.9 });
    await addPhoto(req.id);
    await openTab(page, 'Service Requests');
    await filterSource(page, tag);
    await page.getByTestId('sr-row').first().click();
    const detail = page.getByTestId('sr-detail');
    await expect(detail).toBeVisible();
    await expect(page.getByTestId('sr-detail-name')).toHaveText(`${RUN} Detail Lopez`);
    const fields = page.getByTestId('sr-fields');
    for (const text of ['12 Elm St, Montclair, 07042', 'Essex', '(973) 555-0101', 'zztest-b-maria@local.test', 'Next two weeks', 'English', `${tag} · listing cl-7781`, 'utm_campaign=fall', 'primary B', '0.9']) {
      await expect(fields).toContainText(text);
    }
    await expect(page.getByTestId('sr-answers')).toContainText('Cabinet repainting - Doors and drawers: 26 to 40');
    await expect(page.getByTestId('sr-answers')).toContainText('Gutter cleaning');
    await expect(detail).toContainText('Dog in the yard, use the side gate.');
    await expect(page.getByTestId('sr-call')).toHaveAttribute('href', 'tel:+19735550101');
    await expect(page.getByTestId('sr-text')).toHaveAttribute('href', 'sms:+19735550101');
    const map = await page.getByTestId('sr-map').getAttribute('href');
    expect(map).toBe(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('12 Elm St, Montclair, NJ 07042')}`);

    const img = page.getByTestId('sr-photos').locator('img').first();
    await expect(img).toBeVisible();
    const src = await img.getAttribute('src');
    expect(src).toContain('/storage/v1/object/sign/service-request-photos/requests/');
    // The signed link really loads under the real CSP (not just renders a tag).
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBe(160);
    await page.screenshot({ path: shot('ad2-detail-desktop.png'), fullPage: false });
  });

  test('AD3/AD4: status change persists and is logged; Won stores price and time; Lost stores the reason', async ({ page }) => {
    const tag = newTag();
    const one = await seedRequest(tag, 'Status');
    const two = await seedRequest(tag, 'Lost', { created_at: new Date(Date.now() - 3_600_000).toISOString() });
    await openTab(page, 'Service Requests');
    await filterSource(page, tag);
    await page.locator(`[data-request-id="${one.id}"]`).click();
    await page.locator('#sr-status-select').selectOption('contacted');
    await page.getByTestId('sr-status-save').click();
    await expect(page.getByTestId('sr-admin-notes')).toContainText('Status: New -> Contacted.');
    await page.locator('#sr-note').fill('Called, left a voicemail.');
    await page.getByTestId('sr-note-save').click();
    await expect(page.getByTestId('sr-admin-notes')).toContainText('Note: Called, left a voicemail.');
    await page.getByTestId('sr-won').click();
    await page.locator('#sr-won-price').fill('2,000');
    await page.getByTestId('sr-won-save').click();
    await expect(page.getByTestId('sr-detail').getByTestId('request-status')).toHaveText('Won');

    const [after] = await rest<Req[]>('GET', `home_service_requests?select=*&id=eq.${one.id}`);
    expect(after.status).toBe('won');
    expect(after.customer_price_cents).toBe(200000);
    expect(after.won_at).not.toBeNull();
    const lines = after.admin_notes.split('\n');
    expect(lines).toHaveLength(3);
    const stamp = /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC\] \(admin-b@local\.test\) /;
    expect(lines[0]).toMatch(new RegExp(`${stamp.source}Status: New -> Contacted\\.$`));
    expect(lines[1]).toMatch(new RegExp(`${stamp.source}Note: Called, left a voicemail\\.$`));
    expect(lines[2]).toMatch(new RegExp(`${stamp.source}Status: Contacted -> Won at \\$2,000\\.$`));

    await page.keyboard.press('Escape');
    await page.locator(`[data-request-id="${two.id}"]`).click();
    await page.getByTestId('sr-lost').click();
    await page.locator('#sr-lost-reason').fill('Went with a cheaper handyman');
    await page.getByTestId('sr-lost-save').click();
    await expect(page.getByTestId('sr-detail').getByTestId('request-status')).toHaveText('Lost');
    const [lost] = await rest<Req[]>('GET', `home_service_requests?select=*&id=eq.${two.id}`);
    expect(lost.status).toBe('lost');
    expect(lost.lost_reason).toBe('Went with a cheaper handyman');
    expect(lost.admin_notes).toContain('Status: New -> Lost. Reason: Went with a cheaper handyman');
  });

  test('AD5: add, edit, approve and suspend subs; an expired date is flagged and blocks offers', async ({ page }) => {
    const name = `${RUN} Lapsed Painters`;
    await openTab(page, 'Subs');
    await page.getByTestId('subs-add').click();
    const form = page.getByTestId('sub-form');
    await form.getByLabel('Business name').fill(name);
    await form.getByLabel('Contact name').fill('Ed');
    await form.getByLabel('Mobile phone').fill('(973) 555-0203');
    await form.getByLabel('Cabinet painting').check();
    await form.getByLabel('Essex').check();
    await form.locator('#sub-language').selectOption('es');
    await form.locator('#sub-status').selectOption('approved');
    await form.getByLabel('Insurance expires').fill('2026-01-15');
    await form.getByLabel('HIC expires').fill('2027-12-31');
    await page.getByTestId('sub-save').click();

    const card = page.locator(`[data-sub-name="${name}"]`);
    await expect(card).toBeVisible();
    await expect(card.getByTestId('sub-status')).toHaveText('approved');
    await expect(card).toContainText('Cabinet painting');
    await expect(card).toContainText('Essex · Spanish');
    await expect(card.getByTestId('sub-expired-flag')).toHaveText('Insurance expired - gets no offers until renewed');
    await card.screenshot({ path: shot('ad5-sub-expired-flag.png') });

    // The flag blocks offers: the bid preview names the reason.
    const tag = newTag();
    const req = await seedRequest(tag, 'Sub preview', { services: ['cabinet-repainting'] });
    const detail = await (await api.get(`/api/admin/service-requests/${req.id}`)).json();
    const excluded = detail.bid.trades[0].preview.excluded.find((x: { business_name: string }) => x.business_name === name);
    expect(excluded.reason).toBe('Insurance expired');

    // Edit: renew the insurance, and the flag goes.
    await card.getByTestId('sub-edit').click();
    await page.getByTestId('sub-form').getByLabel('Insurance expires').fill('2027-06-30');
    await page.getByTestId('sub-save').click();
    await expect(card.getByTestId('sub-expired-flag')).toHaveCount(0);
    await expect(card).toContainText('Insurance: 2027-06-30');

    await card.getByTestId('sub-suspend').click();
    await expect(card.getByTestId('sub-status')).toHaveText('suspended');
    await card.getByTestId('sub-approve').click();
    await expect(card.getByTestId('sub-status')).toHaveText('approved');
    const [row] = await rest<Array<{ status: string; language: string; trades: string[]; counties: string[] }>>('GET', `subs?select=*&business_name=eq.${encodeURIComponent(name)}`);
    expect(row).toMatchObject({ status: 'approved', language: 'es', trades: ['cabinet_painting'], counties: ['Essex'] });
  });

  test('BD1: Send bid request computes 1.43x, shows margin, blocks over 70%, and reports who got what', async ({ page }) => {
    const tag = newTag();
    const req = await seedRequest(tag, 'Bid form');
    await addPhoto(req.id);
    const painter = await createSub(api, 'Form Painter');
    const gutters = await createSub(api, 'Form Gutters', { trades: ['gutter_cleaning'], counties: [] });
    await createSub(api, 'Form Lapsed', { insurance_expires_at: '2026-01-01' });

    await openTab(page, 'Service Requests');
    await filterSource(page, tag);
    await page.getByTestId('sr-row').first().click();
    await page.getByTestId('sr-send-bid').click();
    const form = page.getByTestId('bid-form');
    await expect(form.getByTestId('bid-trade')).toHaveCount(2);
    const paint = form.locator('[data-trade="cabinet_painting"]');
    const gutter = form.locator('[data-trade="gutter_cleaning"]');
    await expect(paint.getByTestId('bid-eligible')).toContainText(painter.business_name);
    await expect(paint.getByTestId('bid-excluded')).toContainText(`Not sent to ${RUN} Form Lapsed: Insurance expired`);
    await expect(paint.getByLabel('Scope summary (subs see this)')).toHaveValue(/Cabinet repainting - Doors and drawers: 26 to 40/);
    await expect(paint.getByLabel('Town (no street address)')).toHaveValue('Montclair');

    await paint.getByTestId('bid-sub-pay').fill('1400');
    await expect(paint.getByTestId('bid-customer')).toHaveValue('2002');
    await expect(paint.getByTestId('bid-margin')).toContainText('Margin $602 (30.1%)');
    // Edit the customer price down: the 70% rule blocks the send, with the reason.
    await paint.getByTestId('bid-customer').fill('1900');
    await expect(paint.getByTestId('bid-violation')).toHaveText('Sub pay $1,400 is above 70% of the $1,900 customer price (max $1,330).');
    await expect(form.getByTestId('bid-send')).toBeDisabled();
    await paint.getByRole('button', { name: 'Back to 1.43x' }).click();
    await expect(paint.getByTestId('bid-violation')).toHaveCount(0);
    await paint.getByLabel('Target start').fill('2026-11-09');
    await paint.getByLabel('Target end').fill('2026-11-13');
    await gutter.getByTestId('bid-sub-pay').fill('150');
    await expect(gutter.getByTestId('bid-customer')).toHaveValue('215');
    await page.screenshot({ path: shot('bd1-bid-form-desktop.png'), fullPage: false });
    await form.getByTestId('bid-send').click();

    const results = page.getByTestId('bid-results');
    await expect(results).toBeVisible();
    await expect(results).toContainText('Email is not configured');
    await expect(results.locator('[data-trade="cabinet_painting"][data-status="sent"]')).toContainText(painter.business_name);
    await expect(results.locator('[data-trade="gutter_cleaning"][data-status="sent"]')).toContainText(gutters.business_name);
    const painterRow = results.getByTestId('bid-recipient').filter({ hasText: painter.business_name });
    await expect(painterRow).toContainText('not configured');
    await page.screenshot({ path: shot('bd1-bid-results-desktop.png'), fullPage: false });

    const offers = await rest<Array<{ trade: string; sub_pay_cents: number; customer_price_cents: number; target_start: string; photo_ids: string[] }>>(
      'GET', `job_offers?select=*&request_id=eq.${req.id}&order=trade.asc`);
    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({ trade: 'cabinet_painting', sub_pay_cents: 140000, customer_price_cents: 200200, target_start: '2026-11-09' });
    expect(offers[0].photo_ids).toHaveLength(1);
    expect(offers[1]).toMatchObject({ trade: 'gutter_cleaning', sub_pay_cents: 15000, customer_price_cents: 21500 });
    const [after] = await rest<Req[]>('GET', `home_service_requests?select=status&id=eq.${req.id}`);
    expect(after.status).toBe('bid_sent');
  });

  test('BD5/BD7: the Sub Responses inbox accepts a counter and logs a decline call', async ({ page }) => {
    const tag = newTag();
    const req = await seedRequest(tag, 'Inbox', { services: ['cabinet-repainting'] });
    const counterSub = await createSub(api, 'Inbox Counter');
    const declineSub = await createSub(api, 'Inbox Decline');
    const sent = await api.post('/api/admin/offers', {
      data: { request_id: req.id, offers: [{ trade: 'cabinet_painting', sub_pay_cents: 140000, customer_price_cents: 220000, scope_summary: 'x', town: 'Montclair' }] },
    });
    expect(sent.status(), await sent.text()).toBe(200);
    const offerId = (await sent.json()).results[0].offer_id;
    const rcpts = await rest<Array<{ sub_id: string; token: string }>>('GET', `offer_recipients?select=sub_id,token&offer_id=eq.${offerId}`);
    const tok = (id: string) => rcpts.find((r) => r.sub_id === id)!.token;
    const ip = { 'x-real-ip': `10.250.${randomBytes(1)[0]}.${randomBytes(1)[0]}` };
    expect((await api.post(`/api/offers/${tok(counterSub.id)}`, { headers: ip, data: { action: 'counter', price: '1450', note: 'Doors need degreasing' } })).status()).toBe(200);
    expect((await api.post(`/api/offers/${tok(declineSub.id)}`, { headers: ip, data: { action: 'decline', reason: 'schedule' } })).status()).toBe(200);

    await openTab(page, 'Service Requests');
    await page.getByTestId('sr-view-responses').click();
    const counter = page.getByTestId('inbox-counter').filter({ hasText: counterSub.business_name });
    await expect(counter).toContainText('Counter: $1,450');
    await expect(counter).toContainText('“Doors need degreasing”');
    const call = page.getByTestId('inbox-decline-call').filter({ hasText: declineSub.business_name });
    await expect(call).toContainText('Reason: Schedule');
    await expect(call.getByRole('link', { name: /Call \(973\) 555-0177/ })).toHaveAttribute('href', 'tel:+19735550177');
    await page.screenshot({ path: shot('bd5-inbox-desktop.png'), fullPage: true });

    await counter.getByTestId('inbox-accept').click();
    await expect(page.getByTestId('inbox-counter').filter({ hasText: counterSub.business_name })).toHaveCount(0);
    const [resp] = await rest<Array<{ status: string }>>('GET', `offer_responses?select=status&offer_id=eq.${offerId}&sub_id=eq.${counterSub.id}&type=eq.counter`);
    expect(resp.status).toBe('accepted');

    await call.getByLabel('Their price (USD)').fill('1,700');
    await call.getByLabel('Will take it at that?').selectOption('yes');
    await call.getByLabel('Reason in their words').fill('Booked until the 20th');
    await call.getByTestId('inbox-call-log').click();
    await expect(page.getByTestId('inbox-decline-call').filter({ hasText: declineSub.business_name })).toHaveCount(0);
    const [done] = await rest<Array<{ status: string; counter_cents: number; will_take: boolean; reason_text: string }>>('GET', `decline_calls?select=*&sub_id=eq.${declineSub.id}`);
    expect(done).toMatchObject({ status: 'done', counter_cents: 170000, will_take: true, reason_text: 'Booked until the 20th' });
  });

  test('AD6: the pricing report shows decline rate, top reasons, average counter and averages per service and county', async ({ page }) => {
    // Duct cleaning in Passaic (Clifton) is a group only this test writes to.
    const before = await (await api.get('/api/admin/pricing-report')).json();
    const existing = before.rows.find((r: { trade: string; county: string }) => r.trade === 'duct_cleaning' && r.county === 'Passaic');
    test.skip(!!existing, 'duct_cleaning / Passaic already has offers in this database; the exact-number check needs an empty group.');

    const tag = newTag();
    const one = await seedRequest(tag, 'Report one', { services: ['duct-and-vent-cleaning'], answers: {}, town: 'Clifton', zip: '07011' });
    const two = await seedRequest(tag, 'Report two', { services: ['duct-and-vent-cleaning'], answers: {}, town: 'Clifton', zip: '07011' });
    const s1 = await createSub(api, 'Report Ducts One', { trades: ['duct_cleaning'], counties: [] });
    const s2 = await createSub(api, 'Report Ducts Two', { trades: ['duct_cleaning'], counties: [] });
    const send = async (requestId: string, pay: number) => {
      const res = await api.post('/api/admin/offers', { data: { request_id: requestId, offers: [{ trade: 'duct_cleaning', sub_pay_cents: pay, customer_price_cents: customerPriceForSubPay(pay), scope_summary: 'x', town: 'Clifton' }] } });
      expect(res.status(), await res.text()).toBe(200);
      return (await res.json()).results[0].offer_id as string;
    };
    const o1 = await send(one.id, 30000);
    const o2 = await send(two.id, 40000);
    const recips = await rest<Array<{ offer_id: string; sub_id: string; token: string }>>('GET', `offer_recipients?select=offer_id,sub_id,token&offer_id=in.(${o1},${o2})`);
    const tok = (o: string, s: string) => recips.find((r) => r.offer_id === o && r.sub_id === s)!.token;
    const ip = { 'x-real-ip': `10.250.${randomBytes(1)[0]}.${randomBytes(1)[0]}` };
    const post = (t: string, data: Record<string, unknown>) => api.post(`/api/offers/${t}`, { headers: ip, data });
    expect((await post(tok(o1, s1.id), { action: 'decline', reason: 'pay_too_low' })).status()).toBe(200);
    expect((await post(tok(o1, s2.id), { action: 'counter', price: 350 })).status()).toBe(200);
    expect((await post(tok(o2, s1.id), { action: 'decline', reason: 'too_far' })).status()).toBe(200);
    const [call] = await rest<Array<{ id: string }>>('GET', `decline_calls?select=id&request_id=eq.${one.id}`);
    expect((await api.patch(`/api/admin/offers/decline-calls/${call.id}`, { data: { counter_cents: 38000, will_take: true, reason_text: '' } })).status()).toBe(200);

    await openTab(page, 'Pricing Report');
    const row = page.locator('[data-testid="pricing-row"][data-trade="duct_cleaning"][data-county="Passaic"]');
    await expect(row).toBeVisible();
    await expect(row.locator('th')).toHaveText('Duct cleaning');
    await expect(row.locator('[data-col="offers"]')).toHaveText('2');
    await expect(row.locator('[data-col="recipients"]')).toHaveText(String(recips.length));
    await expect(row.locator('[data-col="declines"]')).toHaveText('2');
    await expect(row.locator('[data-col="decline-rate"]')).toHaveText(`${Math.round((2 / recips.length) * 100)}%`);
    await expect(row.locator('[data-col="reasons"]')).toContainText('Pay too low (1)');
    await expect(row.locator('[data-col="reasons"]')).toContainText('Too far (1)');
    await expect(row.locator('[data-col="avg-counter"]')).toContainText('$365');
    await expect(row.locator('[data-col="avg-counter"]')).toContainText('2 counters');
    await expect(row.locator('[data-col="avg-pay"]')).toHaveText('$350');
    await expect(row.locator('[data-col="avg-customer"]')).toHaveText('$500.50');
    await page.screenshot({ path: shot('ad6-pricing-report-desktop.png'), fullPage: false });
  });

  test('AD7: the summary card shows counts by source and service for 30 days and the close rate', async ({ page }) => {
    const tag = newTag();
    await seedRequest(tag, 'Sum a', { status: 'won', services: ['hvac-cleaning'], answers: {} });
    await seedRequest(tag, 'Sum b', { status: 'new', services: ['hvac-cleaning', 'drywall-patching'], answers: {} });
    await seedRequest(tag, 'Sum c', { status: 'held', services: ['drywall-patching'], answers: {} });
    // Older than the window: must not count.
    await seedRequest(tag, 'Sum old', { status: 'won', created_at: new Date(Date.now() - 40 * 86_400_000).toISOString() });

    // Counted by source over 30 days: three, not four (the old one is outside the window).
    const summary = (await (await api.get('/api/admin/service-requests')).json()).summary;
    expect(summary.bySource).toContainEqual({ key: tag, count: 3 });
    await openTab(page, 'Service Requests');
    const bySource = page.getByTestId('sr-by-source');
    // The card shows the top six; the rest fold into one "N more" line.
    await expect(bySource.locator('li')).toHaveCount(Math.min(summary.bySource.length, 6) + (summary.bySource.length > 6 ? 1 : 0));

    // The close rate is over the whole database, which other builders write to:
    // read the truth right after the card and retry if a write landed between.
    const since = encodeURIComponent(new Date(Date.now() - 30 * 86_400_000).toISOString());
    let matched = false;
    for (let attempt = 0; attempt < 3 && !matched; attempt += 1) {
      if (attempt > 0) await page.getByRole('button', { name: 'Refresh' }).click();
      const shown = (await page.getByTestId('sr-close-detail').textContent()) ?? '';
      const won = await count(`home_service_requests?select=id&status=eq.won&created_at=gte.${since}`);
      const qualified = await count(`home_service_requests?select=id&status=neq.held&created_at=gte.${since}`);
      const rate = `${Math.round((won / qualified) * 100)}%`;
      if (shown.startsWith(`${won} won of ${qualified}`) && (await page.getByTestId('sr-close-rate').textContent()) === rate) matched = true;
    }
    expect(matched, 'the card must equal won / (status new or later) over the last 30 days').toBe(true);
    await expect(page.getByTestId('sr-by-service')).toContainText('HVAC cleaning');
    await page.getByTestId('sr-summary').screenshot({ path: shot('ad7-summary-card.png') });
  });

  test('phone (390x844): list, detail and bid form fit the screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const tag = newTag();
    const req = await seedRequest(tag, 'Phone');
    await addPhoto(req.id);
    await openTab(page, 'Service Requests');
    await filterSource(page, tag);
    await expect(page.getByTestId('sr-row')).toHaveCount(1);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.screenshot({ path: shot('phone-list.png'), fullPage: true });
    await page.getByTestId('sr-row').first().click();
    await expect(page.getByTestId('sr-detail')).toBeVisible();
    // The panel slides in; once settled it must fill the phone exactly.
    const dialog = page.getByRole('dialog');
    await expect.poll(async () => (await dialog.boundingBox())?.x ?? 999).toBeLessThan(1);
    const box = (await dialog.boundingBox())!;
    expect(Math.round(box.width)).toBe(390);
    await page.screenshot({ path: shot('phone-detail.png') });
    await page.getByTestId('sr-send-bid').click();
    await expect(page.getByTestId('bid-form')).toBeVisible();
    await page.screenshot({ path: shot('phone-bid-form.png') });
  });
});
