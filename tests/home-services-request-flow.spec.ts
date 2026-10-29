import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { createHash, randomBytes } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON } from './helpers/liveBackend';
import { bannerRules } from '../src/lib/bannerRules';

/**
 * Home services request flow - slice A (docs/home-services/acceptance-criteria.md, RF1-RF13).
 *
 * Runs against a real dev or production server with the LOCAL Supabase stack:
 *   TEST_URL=http://localhost:3101 E2E_LIVE_BACKEND=1 \
 *     node_modules/.bin/playwright test tests/home-services-request-flow.spec.ts --project=chromium
 *
 * The only thing faked in the browser is reCAPTCHA (no real token can be minted
 * for localhost): window.grecaptcha returns the repo's RECAPTCHA_E2E_BYPASS_TOKEN,
 * and the route itself runs for real. Rows are asserted through PostgREST with
 * the service key read from .env.local, every row is tagged ZZTEST-A, and the
 * suite deletes its own rows, photos, follow-ups and rate-limit buckets.
 *
 * Rate limits are real (5/min per IP, 3/h per phone). Each test sends its own
 * X-Forwarded-For and phone number so the tests never share a bucket; the
 * local server trusts the leftmost X-Forwarded-For only because no edge header
 * is present (see getClientIp).
 */

test.skip(SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON);
// One worker, in order, without skipping the rest on a failure: afterAll
// deletes rows by tag, so it must not run while another worker is mid-test.
test.describe.configure({ mode: 'default' });

function readEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  const file = join(process.cwd(), '.env.local');
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    }
  }
  return { ...out, ...(process.env as Record<string, string>) };
}
const ENV = readEnv();
const SUPA = ENV.NEXT_PUBLIC_SUPABASE_URL;
const KEY = ENV.SUPABASE_SECRET_KEY;
const BYPASS = ENV.RECAPTCHA_E2E_BYPASS_TOKEN;
const SALT = ENV.INTERNAL_WEBHOOK_SECRET;
const CRON = ENV.CRON_SECRET;
const IMAGE = join(process.cwd(), 'public/images/commercial-card-dispatch.png');

const rest = async <T = unknown>(path: string, init: RequestInit = {}): Promise<T> => {
  const res = await fetch(`${SUPA}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
};

const run = randomBytes(3).toString('hex');
let ipCounter = 0;
// Every IP, phone and request id this suite hands the server, so cleanup can
// remove exactly the rate-limit buckets it created and nothing another run or
// another builder is using (review note on the shared rate_limits table).
const usedIps = new Set<string>();
const usedPhones = new Set<string>();
const usedIds = new Set<string>();
const freshIp = () => {
  const ip = `10.${(parseInt(run, 16) % 200) + 20}.${Math.floor(Math.random() * 250)}.${++ipCounter}`;
  usedIps.add(ip);
  return ip;
};
const freshPhone = () => {
  const phone = `973555${String(Math.floor(1000 + Math.random() * 8999))}`;
  usedPhones.add(phone);
  return phone;
};
// One token: the flow splits its single Name field on whitespace into first and last name.
const tag = (label: string) => `ZZTEST-A-${label}-${run}`;

interface RequestRow {
  id: string;
  lead_id: string | null;
  status: string;
  services: string[];
  answers: Record<string, Record<string, string>>;
  language: string;
  source: string;
  listing_id: string | null;
  cta_variant_primary: string | null;
  cta_variant_secondary: string | null;
  timing: string;
  phone_verified: boolean;
  merged_count: number;
  first_name: string;
  zip: string;
}
const requestsFor = (firstName: string) =>
  rest<RequestRow[]>(`home_service_requests?select=*&first_name=eq.${encodeURIComponent(firstName)}&limit=5`);


function apiBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    services: ['gutter-cleaning'],
    answers: { 'gutter-cleaning': { stories: '2' } },
    address: `${run} Api Way`,
    zip: '07042',
    town: '',
    photo_ids: [],
    first_name: tag('Api'),
    phone: freshPhone(),
    email: '',
    timing: 'flexible',
    notes: '',
    consent_sms: true,
    lang: 'en',
    started_at: Date.now() - 30_000,
    recaptchaToken: BYPASS,
    recaptchaAction: 'home_services_request',
    ...overrides,
  };
}

const postRequest = (request: APIRequestContext, body: Record<string, unknown>, ip: string) =>
  request.post('/api/home-services/request', { data: body, headers: { 'x-forwarded-for': ip } });

async function preparePage(page: Page) {
  const ip = freshIp();
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': ip });
  // The real enterprise.js would replace the stub.
  await page.route(/recaptcha|gstatic\.com\/recaptcha/, (route) => route.abort());
  await page.addInitScript(
    ({ token, ids }) => {
      (window as unknown as { grecaptcha: unknown }).grecaptcha = {
        enterprise: { ready: (cb: () => void) => cb(), execute: async () => token },
      };
      // Site-wide promo banners are not under test; pre-dismiss them so they cannot cover the flow.
      const now = Date.now();
      localStorage.setItem('lavaca_banner_dismiss', JSON.stringify(Object.fromEntries(ids.map((id: string) => [id, now]))));
      for (const id of ids) sessionStorage.setItem(`banner_dismissed_${id}`, '1');
    },
    { token: BYPASS, ids: bannerRules.map((r) => r.id) },
  );
  return ip;
}

/** Select cards on the landing page and open the flow. */
async function openFlowWith(page: Page, slugs: string[]) {
  for (const slug of slugs) await page.locator(`[data-testid=card-${slug}] button[aria-pressed]`).click();
  await page.getByTestId('request-bar').getByRole('button').click();
  const flow = page.getByTestId('request-flow');
  await expect(flow).toBeVisible();
  return flow;
}

async function fillDetails(page: Page, address: string, zip = '07042') {
  const flow = page.getByTestId('request-flow');
  await flow.locator('#hs-address').fill(address);
  await flow.locator('#hs-zip').fill(zip);
  await flow.locator('#hs-zip').blur();
}

async function cleanup() {
  const rows = await rest<Array<{ id: string }>>(`home_service_requests?select=id&first_name=like.ZZTEST-A*&limit=200`);
  const ids = rows.map((r) => r.id);
  if (ids.length) {
    const photos = await rest<Array<{ storage_path: string }>>(`lead_photos?select=storage_path&request_id=in.(${ids.join(',')})&limit=500`);
    if (photos.length) {
      await fetch(`${SUPA}/storage/v1/object/service-request-photos`, {
        method: 'DELETE',
        headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: photos.map((p) => p.storage_path) }),
      });
    }
    await rest(`home_service_requests?id=in.(${ids.join(',')})`, { method: 'DELETE' });
  }
  await rest(`leads?first_name=like.ZZTEST-A*`, { method: 'DELETE' });
  await rest(`follow_up_queue?lead_email=like.zztest-a*`, { method: 'DELETE' });
  const buckets = [
    ...[...usedIps].flatMap((ip) => ['hs-request', 'hs-photo', 'hs-photo-day', 'hs-verify', 'hs-resend'].map((p) => `${p}:${ip}`)),
    ...[...usedPhones].map((phone) => `hs-request-phone:${phone}`),
    ...[...usedIds].flatMap((id) => [`hs-verify-req:${id}`, `hs-resend-req:${id}`]),
  ];
  for (let i = 0; i < buckets.length; i += 40) {
    const list = buckets.slice(i, i + 40).map((b) => `"${b}"`).join(',');
    await rest(`rate_limits?ip_address=in.(${encodeURIComponent(list)})`, { method: 'DELETE' });
  }
}

test.beforeAll(async () => {
  expect(SUPA, 'NEXT_PUBLIC_SUPABASE_URL').toBeTruthy();
  expect(KEY, 'SUPABASE_SECRET_KEY').toBeTruthy();
  expect(BYPASS, 'RECAPTCHA_E2E_BYPASS_TOKEN').toBeTruthy();
  await cleanup();
});
test.afterAll(cleanup);

for (const lang of ['en', 'es'] as const) {
  const L = (en: string, es: string) => (lang === 'es' ? es : en);

  test(`RF1 RF4 RF5${lang === 'es' ? ' RF13' : ''}: tap groups, out-of-area decline and contact validation (${lang})`, async ({ page }) => {
    await preparePage(page);
    await page.goto(`/home-services${lang === 'es' ? '?lang=es' : ''}`);
    const flow = await openFlowWith(page, ['cabinet-repainting', 'gutter-cleaning']);

    // RF1: three tap groups per selected service, none preselected.
    for (const slug of ['cabinet-repainting', 'gutter-cleaning']) {
      const section = flow.getByTestId(`details-${slug}`);
      await expect(section.locator('fieldset')).toHaveCount(3);
      await expect(section.locator('button[aria-pressed=true]')).toHaveCount(0);
    }
    // Tapping again clears an answer: nothing is required.
    const one = flow.locator('[data-testid="q-gutter-cleaning-stories"] button').first();
    await one.click();
    await expect(one).toHaveAttribute('aria-pressed', 'true');
    await one.click();
    await expect(one).toHaveAttribute('aria-pressed', 'false');

    // RF3/RF4: address required; an out-of-area ZIP declines politely and does not proceed.
    await flow.getByRole('button', { name: L('Continue', 'Continuar') }).click();
    await expect(flow.locator('#hs-address-error')).toHaveText(L('Please enter the property address.', 'Escriba la dirección de la propiedad.'));
    await fillDetails(page, `${run} Out Of Area Rd`, '08540');
    await expect(flow.getByTestId('zip-error')).toContainText(L("We don't serve that ZIP yet", 'Aún no atendemos ese código postal'));
    await flow.getByRole('button', { name: L('Continue', 'Continuar') }).click();
    await expect(flow.getByTestId('step-details')).toBeVisible();
    await expect(flow.locator('#hs-zip')).toBeEditable();

    // An in-area ZIP clears the decline and proceeds.
    await flow.locator('#hs-zip').fill('07042');
    await flow.locator('#hs-zip').blur();
    await expect(flow.getByTestId('zip-error')).toHaveCount(0);
    await flow.getByRole('button', { name: L('Continue', 'Continuar') }).click();

    // RF5: name, phone, consent required; email optional; timing defaults to flexible.
    const contact = flow.getByTestId('step-contact');
    await expect(contact).toBeVisible();
    await expect(contact.locator('[data-testid=q-timing] button[aria-pressed=true]')).toHaveText('Flexible');
    await flow.getByRole('button', { name: L('Send my request', 'Enviar mi solicitud') }).click();
    await expect(flow.locator('#hs-name-error')).toHaveText(L('Please enter your name.', 'Escriba su nombre.'));
    await expect(flow.locator('#hs-phone-error')).toHaveText(L('Please enter a mobile number.', 'Escriba un número de celular.'));
    await expect(flow.locator('#hs-consent-error')).toBeVisible();
    await expect(flow.locator('#hs-email-error')).toHaveCount(0);
    await flow.locator('#hs-phone').fill('12345');
    await flow.locator('#hs-email').fill('not-an-email');
    await flow.getByRole('button', { name: L('Send my request', 'Enviar mi solicitud') }).click();
    await expect(flow.locator('#hs-phone-error')).toHaveText(L('Enter a 10-digit US mobile number.', 'Escriba un celular de EE. UU. de 10 dígitos.'));
    await expect(flow.locator('#hs-email-error')).toBeVisible();

    // SEC6: every visible input in the flow has an accessible name.
    const unnamed = await flow.locator('input:visible, textarea:visible').evaluateAll((els) =>
      els.filter((el) => !(el as HTMLInputElement).labels?.length && !el.getAttribute('aria-label')).map((el) => el.id),
    );
    expect(unnamed).toEqual([]);
  });

  test(`RF2 RF7 RF9 LP9${lang === 'es' ? ' RF13' : ''}: a full submit stores the request with photos and attribution (${lang})`, async ({ page, context }) => {
    await preparePage(page);
    const listing = `lid${run}${lang}`;
    // The homepage Hero (another slice) writes this; absent is fine, present must be carried.
    await context.addCookies([{ name: 'cta_v', value: encodeURIComponent('P=B;S=A'), url: process.env.TEST_URL || 'http://localhost:3000' }]);
    await page.goto(`/home-services?src=craigslist&lid=${listing}${lang === 'es' ? '&lang=es' : ''}`);
    const name = tag(`Full${lang}`);
    const flow = await openFlowWith(page, ['gutter-cleaning']);
    await flow.locator('[data-testid="q-gutter-cleaning-stories"] button', { hasText: '2' }).click();
    await flow.locator('[data-testid="q-gutter-cleaning-guards"] button').first().click();

    // RF2: compressed in the browser, uploaded immediately, thumbnail shows it.
    const upload = page.waitForResponse('**/api/home-services/photos');
    await flow.getByTestId('photo-input').setInputFiles(IMAGE);
    const uploadRes = await upload;
    expect(uploadRes.status()).toBe(200);
    await expect(flow.locator('[data-testid=photo-thumb][data-status=done]')).toHaveCount(1, { timeout: 20_000 });
    const { id: photoId } = await uploadRes.json();
    const [draft] = await rest<Array<{ content_type: string; bytes: number }>>(`lead_photos?select=content_type,bytes&id=eq.${photoId}`);
    expect(draft.content_type).toBe('image/jpeg');
    expect(draft.bytes).toBeLessThan(1_000_000); // the source PNG is ~2 MB

    await fillDetails(page, `${run} ${lang} Full St`);
    await flow.getByRole('button', { name: L('Continue', 'Continuar') }).click();
    await flow.locator('#hs-name').fill(name);
    const phone = freshPhone();
    await flow.locator('#hs-phone').fill(phone);
    await flow.locator('[data-testid=q-timing] button').first().click();
    await flow.locator('#hs-consent').check();
    // The server drops anything under five seconds from open (RF6); a person is slower than that.
    await page.waitForTimeout(5_200);
    const submitted = page.waitForResponse('**/api/home-services/request');
    await flow.getByRole('button', { name: L('Send my request', 'Enviar mi solicitud') }).click();
    const body = await (await submitted).json();
    expect(body).toMatchObject({ ok: true, status: 'new', verification: 'skipped', merged: false });

    await expect(flow.getByTestId('flow-done')).toContainText(L('Got it.', 'Recibido.'));
    // RF9: SMS unconfigured -> no code field.
    await expect(flow.getByTestId('verify-panel')).toHaveCount(0);

    const [row] = await requestsFor(name);
    expect(row).toMatchObject({
      id: body.request_id,
      status: 'new',
      phone_verified: false,
      services: ['gutter-cleaning'],
      language: lang,
      source: 'craigslist',
      listing_id: listing,
      cta_variant_primary: 'B',
      cta_variant_secondary: 'A',
      timing: 'this_week',
    });
    expect(row.answers['gutter-cleaning']).toMatchObject({ stories: '2' });
    expect(Object.keys(row.answers['gutter-cleaning'])).toHaveLength(2);

    // Photos claimed: bound to the request, moved out of drafts/, token cleared.
    const photos = await rest<Array<{ request_id: string; draft_token: string | null; storage_path: string }>>(
      `lead_photos?select=request_id,draft_token,storage_path&request_id=eq.${row.id}`,
    );
    expect(photos).toHaveLength(1);
    expect(photos[0].draft_token).toBeNull();
    expect(photos[0].storage_path.startsWith(`requests/${row.id}/`)).toBe(true);

    // The leads row: one row, through the sanitizer and the scorer, linked by lead_id.
    expect(row.lead_id, 'leads insert failed - is the leads table complete?').toBeTruthy();
    const leads = await rest<Array<Record<string, unknown>>>(
      `leads?select=first_name,last_name,phone,email,address,zip_code,inquiry_type,project_type,project_timeline,preferred_contact_method,source,message,score,tier&id=eq.${row.lead_id}`,
    );
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({
      first_name: name,
      last_name: name,
      phone: `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`,
      email: '',
      address: `${run} ${lang} Full St`,
      zip_code: '07042',
      inquiry_type: 'estimate',
      project_type: 'home_services',
      project_timeline: 'asap',
      preferred_contact_method: 'text',
      source: 'home_services:craigslist',
    });
    expect(leads[0].message).toContain('Gutter cleaning - How many stories?: 2');
    expect(leads[0].message).toContain('Timing: This week');
    expect(['hot', 'warm', 'cold']).toContain(leads[0].tier);
    expect(typeof leads[0].score).toBe('number');
    expect(await rest(`leads?select=id&first_name=eq.${encodeURIComponent(name)}`)).toHaveLength(1);

    // Closing returns to the page with the selection cleared.
    await flow.getByRole('button', { name: L('Back to the page', 'Volver a la página') }).click();
    await expect(page.getByTestId('request-flow')).toHaveCount(0);
    await expect(page).not.toHaveURL(/#request/);
    await expect(page.locator('[data-testid^=card-] button[aria-pressed=true]')).toHaveCount(0);
  });

  test(`RF10${lang === 'es' ? ' RF13' : ''}: the same address and services within 24 h merge, and the UI says so (${lang})`, async ({ page, request }) => {
    const address = `${run} ${lang} Merge Ln`;
    const name = tag(`Merge${lang}`);
    // Same person: the dedupe key includes the phone (review D3), so the repeat uses the same number.
    const phone = freshPhone();
    const first = await postRequest(request, apiBody({ address, phone, first_name: name, answers: { 'gutter-cleaning': { stories: '1' } } }), freshIp());
    expect(first.status()).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.merged).toBe(false);

    await preparePage(page);
    await page.goto(`/home-services${lang === 'es' ? '?lang=es' : ''}`);
    const flow = await openFlowWith(page, ['gutter-cleaning']);
    await flow.locator('[data-testid="q-gutter-cleaning-last_cleaned"] button').first().click();
    // Same address, different punctuation and case: still the same property.
    await fillDetails(page, `${address.toUpperCase()}.`);
    await flow.getByRole('button', { name: L('Continue', 'Continuar') }).click();
    await flow.locator('#hs-name').fill(name);
    await flow.locator('#hs-phone').fill(`(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`);
    await flow.locator('#hs-consent').check();
    await page.waitForTimeout(5_200);
    const submitted = page.waitForResponse('**/api/home-services/request');
    await flow.getByRole('button', { name: L('Send my request', 'Enviar mi solicitud') }).click();
    const body = await (await submitted).json();
    expect(body).toMatchObject({ ok: true, merged: true, status: 'new', verification: 'skipped' });
    expect(body.request_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.request_id).not.toBe(firstBody.request_id);
    await expect(flow.getByTestId('done-merged')).toHaveText(
      L(
        'We already had a request for this address and service from today, so we added this to it.',
        'Ya teníamos una solicitud para esta dirección y servicio de hoy, así que la agregamos a esa.',
      ),
    );

    const rows = await requestsFor(name);
    expect(rows).toHaveLength(1);
    expect(rows[0].merged_count).toBe(1);
    // Union of answers: the first submit's stories and the second's last_cleaned.
    expect(rows[0].answers['gutter-cleaning'].stories).toBe('1');
    expect(rows[0].answers['gutter-cleaning'].last_cleaned).toBeTruthy();
  });
}

test('D1: photos survive closing and reopening the sheet, and are submitted', async ({ page }) => {
  await preparePage(page);
  await page.goto('/home-services');
  const name = tag('Reopen');
  let flow = await openFlowWith(page, ['gutter-cleaning']);
  await flow.getByTestId('photo-input').setInputFiles([IMAGE, join(process.cwd(), 'public/images/commercial-card-make-ready.png')]);
  await expect(flow.locator('[data-testid=photo-thumb][data-status=done]')).toHaveCount(2, { timeout: 30_000 });
  await fillDetails(page, `${run} Reopen Rd`);

  // Close with the X, look around, reopen from the bar.
  await flow.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('request-flow')).toHaveCount(0);
  await page.getByTestId('request-bar').getByRole('button').click();
  flow = page.getByTestId('request-flow');
  await expect(flow.locator('[data-testid=photo-thumb][data-status=done]')).toHaveCount(2);
  await expect(flow.locator('#hs-address')).toHaveValue(`${run} Reopen Rd`);

  // Close with Back this time, and reopen again.
  await page.goBack();
  await expect(page.getByTestId('request-flow')).toHaveCount(0);
  await page.getByTestId('request-bar').getByRole('button').click();
  flow = page.getByTestId('request-flow');
  await expect(flow.locator('[data-testid=photo-thumb][data-status=done]')).toHaveCount(2);

  await flow.getByRole('button', { name: 'Continue' }).click();
  await flow.locator('#hs-name').fill(name);
  await flow.locator('#hs-phone').fill(freshPhone());
  await flow.locator('#hs-consent').check();
  await page.waitForTimeout(5_200);
  const submitted = page.waitForResponse('**/api/home-services/request');
  await flow.getByRole('button', { name: 'Send my request' }).click();
  expect((await (await submitted).json()).ok).toBe(true);

  const [row] = await requestsFor(name);
  const photos = await rest<Array<{ storage_path: string; draft_token: string | null }>>(`lead_photos?select=storage_path,draft_token&request_id=eq.${row.id}`);
  expect(photos).toHaveLength(2);
  for (const p of photos) {
    expect(p.draft_token).toBeNull();
    expect(p.storage_path.startsWith(`requests/${row.id}/`)).toBe(true);
  }
});

test('RF6: honeypot and a sub-five-second submit both answer 200 and save nothing', async ({ request }) => {
  const honeyName = tag('Honey');
  const fastName = tag('Fast');
  // D10: the silent answer has exactly the shape of a success, with a fresh random id.
  const silentShape = {
    ok: true,
    request_id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
    status: 'new',
    verification: 'skipped',
    merged: false,
  };
  const honey = await postRequest(request, apiBody({ first_name: honeyName, honeypot: 'https://spam.example' }), freshIp());
  expect(honey.status()).toBe(200);
  const honeyBody = await honey.json();
  expect(honeyBody).toEqual(silentShape);
  const fast = await postRequest(request, apiBody({ first_name: fastName, started_at: Date.now() - 1_000 }), freshIp());
  expect(fast.status()).toBe(200);
  const fastBody = await fast.json();
  expect(fastBody).toEqual(silentShape);
  expect(fastBody.request_id).not.toBe(honeyBody.request_id);
  expect(await requestsFor(honeyName)).toHaveLength(0);
  expect(await requestsFor(fastName)).toHaveLength(0);
  expect(await rest(`home_service_requests?select=id&id=in.(${honeyBody.request_id},${fastBody.request_id})`)).toHaveLength(0);
});

test('D3: the same address and services from two phones are two requests, each with its own lead', async ({ request }) => {
  const address = `${run} Two Phones Ave`;
  const nameA = tag('PhoneA');
  const nameB = tag('PhoneB');
  const a = await postRequest(request, apiBody({ address, first_name: nameA, phone: freshPhone() }), freshIp());
  const b = await postRequest(request, apiBody({ address, first_name: nameB, phone: freshPhone() }), freshIp());
  expect(a.status()).toBe(200);
  expect(b.status()).toBe(200);
  const bodyA = await a.json();
  const bodyB = await b.json();
  expect(bodyA.merged).toBe(false);
  expect(bodyB.merged).toBe(false);
  expect(bodyB.request_id).not.toBe(bodyA.request_id);
  const [rowA] = await requestsFor(nameA);
  const [rowB] = await requestsFor(nameB);
  expect(rowA.merged_count).toBe(0);
  expect(rowB.merged_count).toBe(0);
  expect(rowA.lead_id).toBeTruthy();
  expect(rowB.lead_id).toBeTruthy();
  expect(rowB.lead_id).not.toBe(rowA.lead_id);
});

test('D11: a five-digit ZIP decides by itself; Montclair with ZIP 07920 is declined', async ({ request }) => {
  const res = await postRequest(request, apiBody({ zip: '07920', town: 'Montclair', first_name: tag('TownRescue') }), freshIp());
  expect(res.status()).toBe(403);
  expect(await res.json()).toEqual({ error: 'out_of_area' });
  expect(await requestsFor(tag('TownRescue'))).toHaveLength(0);
});

test('D8: photo uploads are capped at 60 per IP per day as well as 30 per 10 minutes', async ({ request }) => {
  const ip = freshIp();
  const jpeg = { name: 'p.jpg', mimeType: 'image/jpeg', buffer: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]) };
  // A bucket already at the daily cap (as 60 uploads earlier today would leave it).
  await rest('rate_limits', { method: 'POST', body: JSON.stringify([{ ip_address: `hs-photo-day:${ip}`, count: 60, last_reset: new Date().toISOString() }]) });
  const blocked = await request.post('/api/home-services/photos', { multipart: { photo: jpeg }, headers: { 'x-forwarded-for': ip } });
  expect(blocked.status()).toBe(429);
  // Under the cap the same upload goes through (and is removed again).
  const other = freshIp();
  const ok = await request.post('/api/home-services/photos', { multipart: { photo: jpeg }, headers: { 'x-forwarded-for': other } });
  expect(ok.status()).toBe(200);
  const { id, draft_token: token } = await ok.json();
  const [row] = await rest<Array<{ storage_path: string }>>(`lead_photos?select=storage_path&id=eq.${id}`);
  await rest(`lead_photos?draft_token=eq.${token}`, { method: 'DELETE' });
  await fetch(`${SUPA}/storage/v1/object/service-request-photos`, {
    method: 'DELETE',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: [row.storage_path] }),
  });
});

test('RF4 county gate at the API: 07601 Hackensack is accepted, 07920 Basking Ridge is out of area', async ({ request }) => {
  const declined = await postRequest(request, apiBody({ zip: '07920', first_name: tag('Basking') }), freshIp());
  expect(declined.status()).toBe(403);
  expect(await declined.json()).toEqual({ error: 'out_of_area' });
  expect(await requestsFor(tag('Basking'))).toHaveLength(0);

  const name = tag('Hackensack');
  const accepted = await postRequest(request, apiBody({ zip: '07601', address: `${run} Main St`, first_name: name }), freshIp());
  expect(accepted.status()).toBe(200);
  const rows = await requestsFor(name);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ zip: '07601', status: 'new' });
});

test('RF11: the sixth submit from one IP in a minute and the fourth for one phone in an hour get 429', async ({ request }) => {
  // Out-of-area ZIPs: the rate limit runs before the area check, so these count
  // against the limit without creating rows.
  const ip = freshIp();
  const statuses: number[] = [];
  for (let i = 0; i < 6; i++) {
    const res = await postRequest(request, apiBody({ zip: '08540', first_name: tag('RateIp') }), ip);
    statuses.push(res.status());
  }
  expect(statuses).toEqual([403, 403, 403, 403, 403, 429]);

  const phone = freshPhone();
  const byPhone: number[] = [];
  for (let i = 0; i < 4; i++) {
    const res = await postRequest(request, apiBody({ zip: '08540', phone, first_name: tag('RatePhone') }), freshIp());
    byPhone.push(res.status());
  }
  expect(byPhone).toEqual([403, 403, 403, 429]);
});

test('RF8 (partial): the code field verifies a held request and flips it to new', async ({ page }) => {
  // SMS is not configured locally, so the server never sends a code. Seed a held
  // request with a known code hash, and have the flow told verification was sent.
  test.skip(!SALT, 'INTERNAL_WEBHOOK_SECRET not set');
  const name = tag('Held');
  const code = '4821';
  const [held] = await rest<Array<{ id: string }>>('home_service_requests', {
    method: 'POST',
    body: JSON.stringify([{
      status: 'held',
      services: ['drywall-patching'],
      first_name: name,
      phone: '(973) 555-0100',
      address: `${run} Held Ct`,
      zip: '07042',
      consent_sms: true,
      verify_code_hash: createHash('sha256').update(`${code}${SALT}`).digest('hex'),
      verify_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      verify_sends: 1,
    }]),
  });
  usedIds.add(held.id);

  await preparePage(page);
  await page.route('**/api/home-services/request', (route) =>
    route.fulfill({ json: { ok: true, request_id: held.id, status: 'held', verification: 'sent', merged: false } }),
  );
  await page.goto('/home-services/drywall-patching');
  await page.getByTestId('request-this').click();
  const flow = page.getByTestId('request-flow');
  await fillDetails(page, `${run} Held Ct`);
  await flow.getByRole('button', { name: 'Continue' }).click();
  await flow.locator('#hs-name').fill(name);
  await flow.locator('#hs-phone').fill('973-555-0100');
  await flow.locator('#hs-consent').check();
  await flow.getByRole('button', { name: 'Send my request' }).click();

  const panel = flow.getByTestId('verify-panel');
  await expect(panel).toContainText('We texted you a 4-digit code');
  await panel.locator('#hs-code').fill('0000');
  await panel.getByRole('button', { name: 'Confirm' }).click();
  await expect(panel).toContainText("That code didn't match. Try again.");
  await panel.locator('#hs-code').fill(code);
  await panel.getByRole('button', { name: 'Confirm' }).click();
  await expect(panel).toContainText('Number confirmed. Thanks.');

  const [row] = await rest<Array<{ status: string; phone_verified: boolean; verify_attempts: number }>>(
    `home_service_requests?select=status,phone_verified,verify_attempts&id=eq.${held.id}`,
  );
  expect(row).toMatchObject({ status: 'new', phone_verified: true, verify_attempts: 2 });
});

test('SEC3: verify answers the same for an unknown request and a wrong code', async ({ request }) => {
  usedIds.add('00000000-0000-4000-8000-000000000000');
  const unknown = await request.post('/api/home-services/verify', {
    data: { request_id: '00000000-0000-4000-8000-000000000000', code: '1234' },
    headers: { 'x-forwarded-for': freshIp() },
  });
  expect(unknown.status()).toBe(400);
  expect(await unknown.json()).toEqual({ ok: false, error: 'invalid_code' });
  const resend = await request.post('/api/home-services/verify/resend', {
    data: { request_id: '00000000-0000-4000-8000-000000000000' },
    headers: { 'x-forwarded-for': freshIp() },
  });
  expect(resend.status()).toBe(200);
  expect(await resend.json()).toEqual({ ok: true });
});

test('SEC1 SEC2: photo route sniffs magic bytes, caps size, and the request route caps its body', async ({ request }) => {
  const ip = freshIp();
  const html = await request.post('/api/home-services/photos', {
    multipart: { photo: { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('<html><script>alert(1)</script></html>') } },
    headers: { 'x-forwarded-for': ip },
  });
  expect(html.status()).toBe(415);

  const big = await request.post('/api/home-services/photos', {
    multipart: { photo: { name: 'big.jpg', mimeType: 'image/jpeg', buffer: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(6 * 1024 * 1024 + 10)]) } },
    headers: { 'x-forwarded-for': ip },
  });
  expect(big.status()).toBe(413);

  const huge = await request.post('/api/home-services/request', {
    data: apiBody({ notes: 'x'.repeat(40 * 1024) }),
    headers: { 'x-forwarded-for': freshIp() },
  });
  expect(huge.status()).toBe(413);

  const bad = await request.post('/api/home-services/request', { data: { services: 'all' }, headers: { 'x-forwarded-for': freshIp() } });
  expect(bad.status()).toBe(400);
  expect(await bad.json()).toEqual({ error: 'invalid_request' });
});

test('purge cron deletes unclaimed photos older than 48 h and keeps fresh ones', async ({ request }) => {
  test.skip(!CRON, 'CRON_SECRET not set in .env.local');
  const token = randomBytes(32).toString('base64url');
  const oldPath = `drafts/${token}/old-${run}.jpg`;
  const newPath = `drafts/${token}/new-${run}.jpg`;
  try {
    for (const path of [oldPath, newPath]) {
      const up = await fetch(`${SUPA}/storage/v1/object/service-request-photos/${path}`, {
        method: 'POST',
        headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'image/jpeg' },
        body: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]),
      });
      expect(up.ok).toBe(true);
    }
    const [oldRow, newRow] = await rest<Array<{ id: string }>>('lead_photos', {
      method: 'POST',
      body: JSON.stringify([
        { draft_token: token, storage_path: oldPath, content_type: 'image/jpeg', bytes: 6, created_at: new Date(Date.now() - 49 * 3600_000).toISOString() },
        { draft_token: token, storage_path: newPath, content_type: 'image/jpeg', bytes: 6, created_at: new Date().toISOString() },
      ]),
    });

    const unauth = await request.get('/api/cron/purge-draft-photos');
    expect(unauth.status()).toBe(401);
    const res = await request.get('/api/cron/purge-draft-photos', { headers: { Authorization: `Bearer ${CRON}` } });
    expect(res.status()).toBe(200);
    expect((await res.json()).ok).toBe(true);

    expect(await rest(`lead_photos?select=id&id=eq.${oldRow.id}`)).toHaveLength(0);
    expect(await rest(`lead_photos?select=id&id=eq.${newRow.id}`)).toHaveLength(1);
    const oldObject = await fetch(`${SUPA}/storage/v1/object/service-request-photos/${oldPath}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
    expect(oldObject.status).not.toBe(200);
  } finally {
    // Untagged draft rows and objects: the suite cleanup cannot find these, so remove them here whatever happened.
    await rest(`lead_photos?draft_token=eq.${token}`, { method: 'DELETE' });
    await fetch(`${SUPA}/storage/v1/object/service-request-photos`, {
      method: 'DELETE',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: [oldPath, newPath] }),
    });
  }
});
