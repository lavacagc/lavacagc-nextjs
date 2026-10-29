import { test, expect as baseExpect, type APIRequestContext, type Page } from '@playwright/test';
import { createHash, randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import path from 'path';
import { SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON } from './helpers/liveBackend';

// Offer pages render slowly on a loaded shared machine (review: 3 of 13 runs
// failed on page waits at load average 36); the admin spec already waits 15 s.
const expect = baseExpect.configure({ timeout: 15_000 });
import {
  customerPriceForSubPay, maxSubPayForCustomerPrice, parseDollarsToCents, subPayViolation,
} from '../src/lib/home-services/pricing';
import {
  confirmablePrice, extendedExpiry, offerExclusion, recipientView,
} from '../src/lib/home-services/offerRules';
import { describeAnswers } from '../src/lib/home-services/catalog';
import { answerLinesFor, countyForRequest, countyForTown, summarizeRequests, tradesForServices } from '../src/lib/home-services/requestsAdmin';
import { buildNotice, buildOfferEmail, buildOfferSms } from '../src/lib/home-services/offerEmail';
import { retrySpecNookPushes } from '../src/lib/home-services/offers';
import { createServer, type Server } from 'http';
import { deflateSync, crc32 } from 'zlib';

/**
 * Slice B - the bid request system and the sub offer page.
 *
 * Two halves:
 *  - PURE: pricing.ts and the offer rules (no server needed, always run).
 *  - LIVE: the offer state machine through the real routes against the local
 *    Supabase - sending (BD2-BD4), the sub's responses and the page (OF1-OF6),
 *    Alex's inbox (BD5-BD7), the expiry cron (BD8) and the race for the job
 *    (BD9). Gated on a live backend.
 *
 * Run: TEST_URL=http://localhost:3102 E2E_LIVE_BACKEND=1 \
 *        node_modules/.bin/playwright test tests/home-services-offers.spec.ts --project=chromium
 *
 * The local database is shared with other builders, so every row this file
 * makes carries a per-worker `ZZTEST-B-...` tag and only those rows are
 * deleted afterwards. Every test sends its own x-real-ip so the per-IP limit
 * on /api/offers is not a budget the tests share, and only the rate-limit
 * buckets this run used are cleared.
 */

// ---------------------------------------------------------------------------
// PURE
// ---------------------------------------------------------------------------

test.describe('pricing and offer rules (pure)', () => {
  test('BD2: customer price is sub pay x 1.43 to the dollar, and over 70% is blocked with a reason', () => {
    expect(customerPriceForSubPay(140000)).toBe(200200);
    expect(customerPriceForSubPay(15000)).toBe(21500);
    expect(maxSubPayForCustomerPrice(200000)).toBe(140000);
    expect(subPayViolation(200000, 140000)).toBeNull();
    expect(subPayViolation(200000, 140001)).toMatch(/above 70% of the \$2,000 customer price \(max \$1,400\)/);
    expect(subPayViolation(0, 100)).toMatch(/Customer price/);
    expect(parseDollarsToCents('$1,400.50')).toBe(140050);
    expect(parseDollarsToCents('abc')).toBeNull();
  });

  test('answer lines read as statements in both languages, without question marks', () => {
    const answers = { 'gutter-cleaning': { stories: '2' } };
    expect(describeAnswers(['gutter-cleaning'], answers, 'en')).toEqual(['Gutter cleaning - How many stories: 2']);
    const [es] = describeAnswers(['gutter-cleaning'], answers, 'es');
    expect(es).toContain('Cuántos pisos: 2');
    expect(es).not.toMatch(/[?¿]/);
  });

  test('BD3: eligibility is approved + trade + county (or none) + nothing expired', () => {
    const today = '2026-10-29';
    const base = { status: 'approved' as const, trades: ['cabinet_painting'], counties: ['Essex'], insurance_expires_at: '2027-01-01', hic_expires_at: null };
    expect(offerExclusion(base, 'cabinet_painting', 'Essex', today)).toBeNull();
    expect(offerExclusion({ ...base, counties: [] }, 'cabinet_painting', 'Bergen', today)).toBeNull();
    expect(offerExclusion({ ...base, counties: [] }, 'cabinet_painting', null, today)).toBeNull();
    expect(offerExclusion(base, 'cabinet_painting', null, today)).toMatch(/county unknown/);
    expect(offerExclusion(base, 'cabinet_painting', 'Morris', today)).toBe('Does not serve Morris');
    expect(offerExclusion(base, 'drywall', 'Essex', today)).toBe('Does not do this trade');
    expect(offerExclusion({ ...base, status: 'pending' }, 'cabinet_painting', 'Essex', today)).toBe('Status is pending');
    expect(offerExclusion({ ...base, insurance_expires_at: '2026-10-28' }, 'cabinet_painting', 'Essex', today)).toBe('Insurance expired');
    expect(offerExclusion({ ...base, insurance_expires_at: today }, 'cabinet_painting', 'Essex', today)).toBeNull();
    expect(offerExclusion({ ...base, hic_expires_at: '2025-01-01' }, 'cabinet_painting', 'Essex', today)).toBe('HIC registration expired');
  });

  test('BD4/AD1: services map to one trade each; towns map to counties', () => {
    expect(tradesForServices(['cabinet-repainting', 'gutter-cleaning', 'cabinet-repainting'])).toEqual(['cabinet_painting', 'gutter_cleaning']);
    expect(countyForTown('West Orange')).toBe('Essex');
    expect(countyForTown(' ho-ho-kus ')).toBe('Bergen');
    expect(countyForTown('Summit, NJ')).toBe('Union');
    expect(countyForTown('Nowhere')).toBeNull();
  });

  test('D9: county comes from the ZIP first, then the town map', () => {
    // A town outside the map, placed by its ZIP.
    expect(countyForRequest({ town: 'Upper Montclair', address: '', zip: '07043' })).toBe('Essex');
    // ZIP wins over a mistyped town.
    expect(countyForRequest({ town: 'Montclair', address: '', zip: '07960' })).toBe('Morris');
    // No usable ZIP: the town map still answers.
    expect(countyForRequest({ town: 'Summit', address: '', zip: '' })).toBe('Union');
    expect(countyForRequest({ town: 'Nowhere', address: '', zip: '99999' })).toBeNull();
  });

  test('AD7: close rate is won over requests at new or later', () => {
    const s = summarizeRequests([
      { status: 'held', services: ['drywall'], source: 'direct' },
      { status: 'new', services: ['drywall'], source: 'craigslist' },
      { status: 'won', services: ['hvac-cleaning'], source: 'craigslist' },
      { status: 'lost', services: ['drywall'], source: '' },
    ]);
    expect(s.qualified).toBe(3);
    expect(s.won).toBe(1);
    expect(s.closeRate).toBeCloseTo(1 / 3);
    expect(s.bySource[0]).toEqual({ key: 'craigslist', count: 2 });
    expect(s.byService[0]).toEqual({ key: 'drywall', count: 3 });
  });

  test('OF2/BD8/BD6: page state, confirmable price and the paused-clock extension', () => {
    const now = new Date('2026-10-29T12:00:00Z');
    const rcpt = { sub_id: 'a', paused_at: null, expires_at: '2026-10-29T13:00:00Z', closed_reason: null };
    expect(recipientView({ status: 'open', assigned_sub_id: null }, rcpt, now).kind).toBe('live');
    expect(recipientView({ status: 'open', assigned_sub_id: null }, { ...rcpt, expires_at: '2026-10-29T11:00:00Z' }, now).kind).toBe('expired');
    expect(recipientView({ status: 'open', assigned_sub_id: null }, { ...rcpt, expires_at: '2026-10-29T11:00:00Z', paused_at: '2026-10-29T10:00:00Z' }, now).kind).toBe('live');
    expect(recipientView({ status: 'assigned', assigned_sub_id: 'a' }, rcpt, now).kind).toBe('won');
    expect(recipientView({ status: 'assigned', assigned_sub_id: 'b' }, rcpt, now).kind).toBe('taken');
    expect(recipientView({ status: 'cancelled', assigned_sub_id: null }, rcpt, now).kind).toBe('cancelled');

    const base = { id: 'r1', type: 'counter' as const, counter_cents: 150000, admin_price_cents: null, created_at: '2026-10-29T10:00:00Z' };
    expect(confirmablePrice([{ ...base, status: 'pending' }])).toBeNull();
    expect(confirmablePrice([{ ...base, status: 'accepted' }])).toEqual({ responseId: 'r1', cents: 150000, source: 'accepted_counter' });
    expect(confirmablePrice([{ ...base, status: 'replied', admin_price_cents: 145000 }])).toEqual({ responseId: 'r1', cents: 145000, source: 'admin_price' });

    expect(extendedExpiry('2026-10-30T12:00:00.000Z', '2026-10-29T10:00:00.000Z', now)).toBe('2026-10-30T14:00:00.000Z');
  });
});

test.describe('offer email and text (rendered)', () => {
  test('BD3/OF6: the email shows trade, town only, start window, pay, expiry, Accept and Respond to the offer page, and the tagged SpecNook link, in the sub language', async ({ page }) => {
    const token = 'T'.repeat(43);
    const signupUrl = 'https://specnook.com/signup?trade=cabinet_painting&ref=offer-123';
    const base = {
      subName: 'Luis', trade: 'cabinet_painting', town: 'Montclair', payCents: 140000, scope: '30 doors, same color',
      targetStart: '2026-11-09', targetEnd: '2026-11-13', expiresAt: '2026-10-30T18:00:00Z', token, signupUrl,
    };
    mkdirSync('test-results/home-services-offer-email', { recursive: true });
    const request = { services: ['cabinet-repainting'], answers: { 'cabinet-repainting': { doors: '26_40' } } };
    for (const lang of ['en', 'es'] as const) {
      const answerLines = answerLinesFor(request, 'cabinet_painting', lang);
      const email = buildOfferEmail({ ...base, lang, answerLines });
      // D6: the homeowner's answers in the sub's own language.
      expect(email.text).toContain(lang === 'en' ? '26 to 40' : '26 a 40');
      expect(email.text).toContain(answerLines[0]);
      expect(email.subject).toBe(lang === 'en' ? 'Job offer: Cabinet painting in Montclair, pay $1,400' : 'Oferta de trabajo: Pintura de gabinetes en Montclair, pago $1,400');
      await page.setContent(email.html);
      const accept = page.getByRole('link', { name: lang === 'en' ? 'Accept this job' : 'Aceptar este trabajo' });
      const respond = page.getByRole('link', { name: lang === 'en' ? 'Respond' : 'Responder', exact: true });
      await expect(accept).toHaveAttribute('href', `http://localhost:3102/offer/${token}`.replace('http://localhost:3102', process.env.NEXT_PUBLIC_SITE_URL || 'https://www.lavacagc.com'));
      expect(await respond.getAttribute('href')).toBe(await accept.getAttribute('href'));
      await expect(page.locator('body')).toContainText('$1,400');
      await expect(page.locator('body')).toContainText('Montclair');
      await expect(page.locator('body')).toContainText(lang === 'en' ? 'Nov 9 - Nov 13' : '9 nov - 13 nov');
      await expect(page.locator('body')).toContainText(lang === 'en' ? 'This offer expires Fri, Oct 30' : 'Esta oferta vence vie, 30 de oct');
      const signup = page.getByRole('link', { name: lang === 'en' ? /Sign up on SpecNook/ : /Regístrese en SpecNook/ });
      await expect(signup).toHaveAttribute('href', signupUrl);
      expect(email.html).not.toContain('..<');
      expect(email.text).not.toMatch(/\.\.$/m);
      // Town only: no street address anywhere in the message.
      expect(email.html).not.toMatch(/Elm|Street/);
      expect(email.text).toContain(`/offer/${token}`);
      await page.setViewportSize({ width: 640, height: 900 });
      await page.screenshot({ path: `test-results/home-services-offer-email/offer-email-${lang}.png`, fullPage: true });

      const sms = buildOfferSms({ ...base, lang, answerLines });
      expect(sms).toContain(`/offer/${token}`);
      expect(sms).toContain(lang === 'en' ? 'Cabinet painting in Montclair, pay $1,400' : 'Pintura de gabinetes en Montclair, pago $1,400');
      expect(sms.length).toBeLessThan(320);
    }
    const taken = buildNotice('taken', { lang: 'es', subName: 'Luis', trade: 'cabinet_painting', town: 'Montclair', token });
    expect(taken.sms).toBe('La Vaca: el trabajo de Pintura de gabinetes en Montclair ya fue tomado. Gracias por revisarlo.');
    expect(taken.html).not.toContain(`/offer/${token}`);
  });
});

// ---------------------------------------------------------------------------
// LIVE harness
// ---------------------------------------------------------------------------

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
const CRON_SECRET = ENV.CRON_SECRET ?? '';
const ADMIN_EMAIL = ENV.E2E_ADMIN_EMAIL ?? 'admin-b@local.test';
const ADMIN_PASSWORD = ENV.E2E_ADMIN_PASSWORD ?? 'LocalAdmin!2026';

const RUN = `ZZTEST-B-${Date.now().toString(36)}${randomBytes(2).toString('hex')}`;
const usedIps = new Set<string>();
const usedTokens = new Set<string>();

function ipFor(label: string): string {
  const ip = `10.${randomBytes(1)[0]}.${randomBytes(1)[0]}.${label.length % 250}`;
  usedIps.add(ip);
  return ip;
}

async function rest<T = unknown>(method: string, p: string, body?: unknown): Promise<T> {
  const res = await fetch(`${SB_URL}/rest/v1/${p}`, {
    method,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${p} -> ${res.status} ${await res.text()}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

async function adminCookie(): Promise<string> {
  // Make sure the local admin exists (idempotent: 422 when it already does).
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
  const ref = new URL(SB_URL).hostname.split('.')[0];
  return `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
}

interface RequestRow { id: string; status: string; admin_notes: string; services: string[]; town: string; address: string }

async function seedRequest(label: string, over: Record<string, unknown> = {}): Promise<RequestRow> {
  const [lead] = await rest<Array<{ id: string }>>('POST', 'leads', [{ source: `home_services:${RUN}` }]);
  const [row] = await rest<RequestRow[]>('POST', 'home_service_requests', [{
    lead_id: lead.id,
    status: 'new',
    services: ['cabinet-repainting'],
    answers: { 'cabinet-repainting': { doors: '26_40' } },
    first_name: `${RUN} ${label}`,
    last_name: 'Tester',
    phone: '(973) 555-0199',
    email: 'zztest-b-homeowner@local.test',
    address: '12 Hidden Street',
    town: 'Montclair',
    zip: '07042',
    source: RUN.toLowerCase(),
    ...over,
  }]);
  return row;
}

interface SubIn { name: string; status?: string; trades?: string[]; counties?: string[]; language?: 'en' | 'es'; insurance_expires_at?: string | null; hic_expires_at?: string | null }
interface Sub { id: string; business_name: string; status: string }

async function createSub(api: APIRequestContext, s: SubIn): Promise<Sub> {
  const res = await api.post('/api/admin/subs', {
    data: {
      business_name: `${RUN} ${s.name}`,
      contact_name: s.name,
      phone: '(973) 555-0177',
      email: `zztest-b-${s.name.toLowerCase().replace(/\W+/g, '')}@local.test`,
      trades: s.trades ?? ['cabinet_painting'],
      counties: s.counties ?? ['Essex'],
      language: s.language ?? 'en',
      status: s.status ?? 'approved',
      insurance_expires_at: s.insurance_expires_at ?? '2030-01-01',
      hic_expires_at: s.hic_expires_at ?? '2030-01-01',
      notes: '',
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).sub;
}

interface OfferIn { trade: string; sub_pay_cents: number; customer_price_cents?: number; town?: string; scope_summary?: string; photo_ids?: string[]; target_start?: string | null; target_end?: string | null }

async function sendOffers(api: APIRequestContext, requestId: string, offers: OfferIn[]) {
  return api.post('/api/admin/offers', {
    data: {
      request_id: requestId,
      offers: offers.map((o) => ({
        town: 'Montclair', scope_summary: '30 doors, same color', photo_ids: [], target_start: null, target_end: null,
        customer_price_cents: customerPriceForSubPay(o.sub_pay_cents), ...o,
      })),
    },
  });
}

interface Recipient { id: string; offer_id: string; sub_id: string; token: string; email_status: string; sms_status: string; paused_at: string | null; opened_at: string | null; expires_at: string; closed_reason: string | null }

async function recipientsOf(offerId: string): Promise<Recipient[]> {
  const rows = await rest<Recipient[]>('GET', `offer_recipients?select=*&offer_id=eq.${offerId}`);
  rows.forEach((r) => usedTokens.add(r.token));
  return rows;
}

async function recipientOf(offerId: string, subId: string): Promise<Recipient> {
  // By sub, never by position: other approved subs in the shared database may be on the same offer.
  const r = (await recipientsOf(offerId)).find((x) => x.sub_id === subId);
  if (!r) throw new Error("no recipient for that sub");
  return r;
}

async function tokenFor(offerId: string, subId: string): Promise<string> {
  return (await recipientOf(offerId, subId)).token;
}

/** One live offer for one fresh approved sub. */
async function oneOffer(api: APIRequestContext, label: string, sub: Partial<SubIn> = {}, req: Record<string, unknown> = {}) {
  const request = await seedRequest(label, req);
  const created = await createSub(api, { name: `${label} sub`, ...sub });
  const res = await sendOffers(api, request.id, [{ trade: (sub.trades ?? ['cabinet_painting'])[0], sub_pay_cents: 140000 }]);
  expect(res.status(), await res.text()).toBe(200);
  const body = await res.json();
  const offerId = body.results[0].offer_id as string;
  return { request, sub: created, offerId, token: await tokenFor(offerId, created.id) };
}

async function act(api: APIRequestContext, token: string, data: Record<string, unknown>, ip: string) {
  return api.post(`/api/offers/${token}`, { data, headers: { 'x-real-ip': ip } });
}

async function openPage(page: Page, token: string, ip: string) {
  await page.setExtraHTTPHeaders({ 'x-real-ip': ip });
  await page.goto(`/offer/${token}`, { waitUntil: 'domcontentloaded' });
}

/** A real gradient PNG of any size (for the browser compression check). */
function gradientPng(w: number, h: number): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = (x * 7 + y * 3) & 0xff;
      raw[o + 1] = (x * 13) & 0xff;
      raw[o + 2] = (y * 11) & 0xff;
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** Width and height from a JPEG's start-of-frame marker. */
function jpegSize(b: Buffer): { width: number; height: number } | null {
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    const len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}

/** A small, valid PNG so attachments pass the magic-byte check. */
function tinyPng(): Buffer {
  return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
}

// ---------------------------------------------------------------------------
// LIVE tests
// ---------------------------------------------------------------------------

test.describe('bid requests and the offer page (live backend)', () => {
  test.skip(SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON);
  test.setTimeout(120_000);

  let api: APIRequestContext;

  test.beforeAll(async ({ playwright, baseURL }) => {
    api = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { Cookie: await adminCookie(), 'User-Agent': 'Mozilla/5.0 (Macintosh) Chrome/120 Safari/537.36' },
    });
  });

  test.afterAll(async () => {
    const reqs = await rest<Array<{ id: string; lead_id: string }>>('GET', `home_service_requests?select=id,lead_id&first_name=like.${encodeURIComponent(RUN)}*`);
    const ids = reqs.map((r) => r.id);
    if (ids.length) {
      const offers = await rest<Array<{ id: string }>>('GET', `job_offers?select=id&request_id=in.(${ids.join(',')})`);
      if (offers.length) {
        const prefixes = offers.map((o) => `offers/${o.id}`);
        for (const prefix of prefixes) {
          const list = await fetch(`${SB_URL}/storage/v1/object/list/service-request-photos`, {
            method: 'POST',
            headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ prefix, limit: 100 }),
          }).then((r) => r.json()).catch(() => []);
          for (const folder of Array.isArray(list) ? list : []) {
            const inner = await fetch(`${SB_URL}/storage/v1/object/list/service-request-photos`, {
              method: 'POST',
              headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ prefix: `${prefix}/${folder.name}`, limit: 100 }),
            }).then((r) => r.json()).catch(() => []);
            const names = (Array.isArray(inner) ? inner : []).map((f: { name: string }) => `${prefix}/${folder.name}/${f.name}`);
            if (names.length) {
              await fetch(`${SB_URL}/storage/v1/object/service-request-photos`, {
                method: 'DELETE',
                headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ prefixes: names }),
              });
            }
          }
        }
      }
      await rest('DELETE', `job_offers?request_id=in.(${ids.join(',')})`);
      await rest('DELETE', `home_service_requests?id=in.(${ids.join(',')})`);
      const leadIds = reqs.map((r) => r.lead_id).filter(Boolean);
      if (leadIds.length) await rest('DELETE', `leads?id=in.(${leadIds.join(',')})`);
    }
    await rest('DELETE', `subs?business_name=like.${encodeURIComponent(RUN)}*`);
    const buckets = [
      ...[...usedIps].map((ip) => `offer-ip:${ip}`),
      ...[...usedTokens].map((t) => `offer-token:${createHash('sha256').update(t).digest('hex').slice(0, 32)}`),
    ];
    for (let i = 0; i < buckets.length; i += 50) {
      await rest('DELETE', `rate_limits?ip_address=in.(${buckets.slice(i, i + 50).map((b) => `"${b}"`).join(',')})`);
    }
    await api.dispose();
  });

  test('BD2: an offer over 70% of the customer price is refused with the reason and creates nothing', async () => {
    const request = await seedRequest('bd2');
    await createSub(api, { name: 'bd2 sub' });
    const res = await sendOffers(api, request.id, [{ trade: 'cabinet_painting', sub_pay_cents: 150000, customer_price_cents: 200000 }]);
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('above 70% of the $2,000 customer price');
    expect(await rest<unknown[]>('GET', `job_offers?select=id&request_id=eq.${request.id}`)).toHaveLength(0);
  });

  test('BD3: the offer goes to every eligible sub and to nobody else; channels record not_configured', async () => {
    const request = await seedRequest('bd3');
    const ok = await createSub(api, { name: 'bd3 essex' });
    const anyCounty = await createSub(api, { name: 'bd3 any county', counties: [] , language: 'es' });
    const excluded = await Promise.all([
      createSub(api, { name: 'bd3 morris only', counties: ['Morris'] }),
      createSub(api, { name: 'bd3 pending', status: 'pending' }),
      createSub(api, { name: 'bd3 suspended', status: 'suspended' }),
      createSub(api, { name: 'bd3 insurance lapsed', insurance_expires_at: '2026-01-01' }),
      createSub(api, { name: 'bd3 hic lapsed', hic_expires_at: '2025-06-30' }),
      createSub(api, { name: 'bd3 other trade', trades: ['drywall'] }),
    ]);

    const res = await sendOffers(api, request.id, [{ trade: 'cabinet_painting', sub_pay_cents: 140000 }]);
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    const result = body.results[0];
    expect(result.status).toBe('sent');

    const offer = (await rest<Array<{ expires_at: string; created_at: string; status: string }>>('GET', `job_offers?select=*&id=eq.${result.offer_id}`))[0];
    expect(offer.status).toBe('open');
    const ttlHours = (new Date(offer.expires_at).getTime() - new Date(offer.created_at).getTime()) / 3_600_000;
    expect(ttlHours).toBeGreaterThan(23.9);
    expect(ttlHours).toBeLessThan(24.1);

    const mine = new Set([ok.id, anyCounty.id, ...excluded.map((e) => e.id)]);
    const recipients = (await recipientsOf(result.offer_id)).filter((r) => mine.has(r.sub_id));
    expect(recipients.map((r) => r.sub_id).sort()).toEqual([ok.id, anyCounty.id].sort());
    for (const r of recipients) {
      expect(r.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(r.email_status).toBe('not_configured');
      expect(r.sms_status).toBe('not_configured');
    }
    // The admin was told exactly who got what, in which language.
    const told = result.recipients.filter((r: { sub_id: string }) => mine.has(r.sub_id));
    expect(told).toHaveLength(2);
    expect(told.find((r: { sub_id: string }) => r.sub_id === anyCounty.id).language).toBe('es');

    const after = (await rest<RequestRow[]>('GET', `home_service_requests?select=*&id=eq.${request.id}`))[0];
    expect(after.status).toBe('bid_sent');
    expect(after.admin_notes).toMatch(/Bid request sent: Cabinet painting at \$1,400 to \d+ subs?\./);

    // The detail preview names each exclusion and why.
    const detail = await (await api.get(`/api/admin/service-requests/${request.id}`)).json();
    const reasons = Object.fromEntries(detail.bid.trades[0].preview.excluded.map((x: { id: string; reason: string }) => [x.id, x.reason]));
    expect(reasons[excluded[0].id]).toBe('Does not serve Essex');
    expect(reasons[excluded[1].id]).toBe('Status is pending');
    expect(reasons[excluded[2].id]).toBe('Status is suspended');
    expect(reasons[excluded[3].id]).toBe('Insurance expired');
    expect(reasons[excluded[4].id]).toBe('HIC registration expired');
    // The admin detail never carries a sub's token.
    expect(JSON.stringify(detail)).not.toContain(recipients[0].token);

    // A second send for the same trade while one is open creates nothing.
    const again = await sendOffers(api, request.id, [{ trade: 'cabinet_painting', sub_pay_cents: 130000 }]);
    expect(again.status()).toBe(409);
    expect((await again.json()).results[0].status).toBe('already_open');
  });

  test('BD4: a multi-service request creates one offer per trade', async () => {
    const request = await seedRequest('bd4', { services: ['cabinet-repainting', 'gutter-cleaning'] });
    await createSub(api, { name: 'bd4 painter' });
    await createSub(api, { name: 'bd4 gutters', trades: ['gutter_cleaning'] });
    const res = await sendOffers(api, request.id, [
      { trade: 'cabinet_painting', sub_pay_cents: 140000 },
      { trade: 'gutter_cleaning', sub_pay_cents: 15000 },
    ]);
    expect(res.status(), await res.text()).toBe(200);
    const offers = await rest<Array<{ trade: string; customer_price_cents: number }>>('GET', `job_offers?select=trade,customer_price_cents&request_id=eq.${request.id}&order=trade.asc`);
    expect(offers.map((o) => o.trade)).toEqual(['cabinet_painting', 'gutter_cleaning']);
    expect(offers[1].customer_price_cents).toBe(21500);
    // A trade that is not on the request is refused outright.
    const wrong = await sendOffers(api, request.id, [{ trade: 'drywall', sub_pay_cents: 10000 }]);
    expect(wrong.status()).toBe(400);
  });

  test('OF1: GET is read-only and noindex, shows town only, pay, start window, countdown and the responses', async ({ page }) => {
    const note = 'Side gate code 4411, key under the mat';
    const { token, request, offerId, sub } = await oneOffer(api, "of1", {}, { notes: note });
    await rest('PATCH', `job_offers?id=eq.${offerId}`, { target_start: '2026-11-09', target_end: '2026-11-13' });
    const before = await rest<unknown[]>('GET', `offer_responses?select=id&offer_id=eq.${offerId}`);
    const ip = ipFor('of1');
    await openPage(page, token, ip);
    await openPage(page, token, ip);

    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.getByTestId('offer-pay')).toHaveText('$1,400');
    await expect(page.getByTestId('offer-town')).toHaveText('Montclair');
    await expect(page.getByText('Nov 9 - Nov 13')).toBeVisible();
    await expect(page.getByTestId('offer-countdown')).toContainText(/\d+h \d+m left/);
    await expect(page.locator('body')).not.toContainText(request.address);
    // D2: the homeowner's free-text notes never reach a sub; the answers do.
    // Checked on the raw HTML, which includes the framework's serialized payload,
    // not just the visible text: nothing server-only may ride along either.
    const html = await page.content();
    expect(html).not.toContain('4411');
    expect(html).not.toContain('customer_price_cents');
    expect(html).not.toContain('admin_notes');
    await expect(page.getByTestId('offer-scope')).toContainText('Cabinet repainting - Doors and drawers: 26 to 40');
    await expect(page.getByTestId('offer-scope')).toContainText('30 doors, same color');
    // D5: the root layout's skip link has its target.
    await expect(page.locator('main#main-content')).toHaveCount(1);
    await expect(page).toHaveTitle(/^Job offer from La Vaca/);
    await expect(page.getByTestId('offer-accept')).toBeVisible();
    await page.getByTestId('offer-respond').click();
    for (const f of ['counter', 'details', 'decline']) await expect(page.getByTestId(`offer-open-${f}`)).toBeVisible();

    // Two loads wrote nothing.
    expect(await rest<unknown[]>('GET', `offer_responses?select=id&offer_id=eq.${offerId}`)).toEqual(before);
    const r = await recipientOf(offerId, sub.id);
    expect(r.opened_at).toBeNull();
  });

  test('OF2/SEC3: unknown and malformed tokens get one generic answer; expired and taken say so with no buttons', async ({ page }) => {
    const ip = ipFor('of2');
    await page.setExtraHTTPHeaders({ 'x-real-ip': ip });
    for (const t of [randomBytes(32).toString('base64url'), 'short', '%27%20or%201=1']) {
      await page.goto(`/offer/${t}`);
      await expect(page.getByTestId('offer-invalid')).toHaveText('This link is not valid');
      await expect(page.getByTestId('offer-accept')).toHaveCount(0);
      await expect(page.getByTestId('offer-respond')).toHaveCount(0);
    }
    const unknown = await act(api, randomBytes(32).toString('base64url'), { action: 'accept' }, ip);
    expect(unknown.status()).toBe(404);
    expect(await unknown.json()).toEqual({ error: 'invalid_link' });

    const { token, offerId } = await oneOffer(api, 'of2 expired');
    await rest('PATCH', `offer_recipients?offer_id=eq.${offerId}`, { expires_at: new Date(Date.now() - 60_000).toISOString() });
    await page.goto(`/offer/${token}`);
    await expect(page.getByTestId('offer-expired')).toBeVisible();
    await expect(page.getByText('This offer expired.')).toBeVisible();
    await expect(page.getByTestId('offer-accept')).toHaveCount(0);
    const late = await act(api, token, { action: 'accept' }, ip);
    expect(late.status()).toBe(409);
    expect((await late.json()).error).toBe('expired');
  });

  test('OF3: a sub who is not approved sees only the SpecNook signup link with trade and ref, and cannot accept', async ({ page }) => {
    const { token, sub, offerId } = await oneOffer(api, 'of3');
    await rest('PATCH', `subs?id=eq.${sub.id}`, { status: 'pending' });
    const ip = ipFor('of3');
    await openPage(page, token, ip);
    const link = page.getByTestId('offer-signup-link');
    await expect(link).toHaveText('Sign up on SpecNook to accept jobs');
    const href = new URL((await link.getAttribute('href'))!);
    expect(href.searchParams.get('trade')).toBe('cabinet_painting');
    expect(href.searchParams.get('ref')).toBe(offerId);
    await expect(page.getByTestId('offer-accept')).toHaveCount(0);
    await expect(page.getByTestId('offer-respond')).toHaveCount(0);
    const res = await act(api, token, { action: 'accept' }, ip);
    expect(res.status()).toBe(403);
    expect((await res.json()).error).toBe('not_eligible');
  });

  test('OF4: counter needs a price, details needs text and takes files, decline takes an optional reason', async ({ page }) => {
    const { token, offerId, sub } = await oneOffer(api, "of4");
    const ip = ipFor('of4');
    await openPage(page, token, ip);
    await page.getByTestId('offer-respond').click();

    await page.getByTestId('offer-open-counter').click();
    await page.getByTestId('offer-counter-submit').click();
    await expect(page.getByTestId('offer-error')).toHaveText('Enter your price in dollars, for example 1500.');
    await page.getByLabel('Your price (USD)').fill('1,650');
    await page.getByTestId('offer-counter-form').getByLabel('Note (optional)').fill('Degrease first');
    await page.getByTestId('offer-counter-submit').click();
    await expect(page.getByTestId('offer-notices')).toContainText('Your price of $1,650 is with Alex.');

    await page.getByTestId('offer-respond').click();
    await page.getByTestId('offer-open-details').click();
    await page.getByTestId('offer-details-submit').click();
    await expect(page.getByTestId('offer-error')).toHaveText('Tell Alex what you need.');
    await page.getByLabel('What do you need to know?').fill('How tall are the upper cabinets?');
    await page.locator('#offer-details-files').setInputFiles([{ name: 'kitchen.png', mimeType: 'image/png', buffer: tinyPng() }]);
    await page.getByTestId('offer-details-submit').click();
    await expect(page.getByTestId('offer-notices')).toContainText('Your question is with Alex.');
    await expect(page.getByText('Your clock is paused while Alex answers your question.')).toBeVisible();

    await page.getByTestId('offer-respond').click();
    await page.getByTestId('offer-open-decline').click();
    await page.getByLabel('Too far').check();
    await page.getByTestId('offer-decline-submit').click();
    await expect(page.getByTestId('offer-notices')).toContainText('Thanks for letting us know.');

    const rows = await rest<Array<{ type: string; counter_cents: number | null; note: string; decline_reason: string | null; attachments: Array<{ storage_path: string; content_type: string }>; status: string }>>(
      'GET', `offer_responses?select=*&offer_id=eq.${offerId}&order=created_at.asc`);
    expect(rows.map((r) => r.type)).toEqual(['counter', 'details', 'decline']);
    expect(rows[0].counter_cents).toBe(165000);
    expect(rows[0].status).toBe('pending');
    expect(rows[1].attachments).toHaveLength(1);
    // Photos are re-encoded as JPEG in the browser (D4).
    expect(rows[1].attachments[0].content_type).toBe('image/jpeg');
    expect(rows[1].attachments[0].storage_path).toMatch(new RegExp(`^offers/${offerId}/[0-9a-f-]+/sub-[0-9a-f-]+\\.jpg$`));
    expect(rows[2].decline_reason).toBe('too_far');
    expect((await recipientOf(offerId, sub.id)).paused_at).not.toBeNull();

    // API side: a non-image file is refused by its bytes, whatever it claims to be.
    const bad = await api.post(`/api/offers/${token}`, {
      headers: { 'x-real-ip': ip },
      multipart: { action: 'details', text: 'see file', files: { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('MZ not really a jpeg') } },
    });
    expect(bad.status()).toBe(400);
    expect((await bad.json()).error).toBe('bad_file_type');
  });

  test('BD5/OF5: Alex accepts a counter, the sub confirms on the page, and the job is assigned at that price', async ({ page }) => {
    const { token, offerId, request, sub } = await oneOffer(api, 'of5');
    const ip = ipFor('of5');
    // Customer price $2,200, so the most a sub can be paid is $1,540.
    await rest('PATCH', `job_offers?id=eq.${offerId}`, { customer_price_cents: 220000 });
    // Over 70%: cannot be accepted.
    expect((await act(api, token, { action: 'counter', price: '1,600', note: '' }, ip)).status()).toBe(200);
    const [high] = await rest<Array<{ id: string }>>('GET', `offer_responses?select=id&offer_id=eq.${offerId}&type=eq.counter`);
    const blocked = await api.post(`/api/admin/offers/responses/${high.id}`, { data: { action: 'accept' } });
    expect(blocked.status()).toBe(400);
    expect((await blocked.json()).error).toContain('above 70% of the $2,200 customer price (max $1,540)');
    // Reply with a price above 70% is blocked too; a fair one goes out.
    expect((await api.post(`/api/admin/offers/responses/${high.id}`, { data: { action: 'reply_price', price_cents: 155000 } })).status()).toBe(400);
    const reply = await api.post(`/api/admin/offers/responses/${high.id}`, { data: { action: 'reply_price', price_cents: 150000, text: 'Best I can do' } });
    expect(reply.status(), await reply.text()).toBe(200);
    expect(await reply.json()).toMatchObject({ status: 'replied', email_status: 'not_configured', sms_status: 'not_configured' });

    // The sub counters again at a price Alex can accept.
    expect((await act(api, token, { action: 'counter', price: 1450 }, ip)).status()).toBe(200);
    const counters = await rest<Array<{ id: string; status: string; counter_cents: number }>>('GET', `offer_responses?select=id,status,counter_cents&offer_id=eq.${offerId}&type=eq.counter&order=created_at.desc`);
    expect(counters[0].counter_cents).toBe(145000);
    // Never auto-approved.
    expect(counters[0].status).toBe('pending');
    const acc = await api.post(`/api/admin/offers/responses/${counters[0].id}`, { data: { action: 'accept' } });
    expect(acc.status(), await acc.text()).toBe(200);
    // Handled once: a second click is refused.
    expect((await api.post(`/api/admin/offers/responses/${counters[0].id}`, { data: { action: 'accept' } })).status()).toBe(409);

    await openPage(page, token, ip);
    await expect(page.getByTestId('offer-confirm-step')).toContainText('Alex accepted your price');
    await expect(page.getByTestId('offer-confirm-step')).toContainText('$1,450');
    await page.getByTestId('offer-confirm').click();
    await expect(page.getByTestId('offer-won')).toBeVisible();
    await expect(page.getByTestId('offer-full-address')).toHaveText('12 Hidden Street, Montclair, 07042');

    const offer = (await rest<Array<{ status: string; assigned_sub_id: string; sub_pay_cents: number; specnook_push_status: string }>>('GET', `job_offers?select=*&id=eq.${offerId}`))[0];
    expect(offer).toMatchObject({ status: 'assigned', assigned_sub_id: sub.id, sub_pay_cents: 145000, specnook_push_status: 'pending' });
    const confirmed = await rest<Array<{ status: string }>>('GET', `offer_responses?select=status&id=eq.${counters[0].id}`);
    expect(confirmed[0].status).toBe('confirmed');
    const req = (await rest<RequestRow[]>('GET', `home_service_requests?select=*&id=eq.${request.id}`))[0];
    expect(req.status).toBe('assigned');
    expect(req.admin_notes).toContain('Assigned Cabinet painting to');
    expect(req.admin_notes).toContain('at $1,450. SpecNook push: pending.');
  });

  test('BD6: answering a detail request restarts the paused clock with the paused time added back', async () => {
    const { token, offerId, sub } = await oneOffer(api, "bd6");
    const ip = ipFor('bd6');
    const res = await api.post(`/api/offers/${token}`, { headers: { 'x-real-ip': ip }, multipart: { action: 'details', text: 'Is the dog friendly?' } });
    expect(res.status(), await res.text()).toBe(200);
    const r0 = await recipientOf(offerId, sub.id);
    expect(r0.paused_at).not.toBeNull();
    // Pretend the question sat for two hours.
    const pausedAt = new Date(Date.now() - 2 * 3_600_000).toISOString();
    await rest('PATCH', `offer_recipients?id=eq.${r0.id}`, { paused_at: pausedAt });

    const [question] = await rest<Array<{ id: string }>>('GET', `offer_responses?select=id&offer_id=eq.${offerId}&type=eq.details`);
    const reply = await api.post(`/api/admin/offers/responses/${question.id}`, {
      multipart: { action: 'reply_details', text: 'Yes, very.', files: { name: 'plan.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%test\n') } },
    });
    expect(reply.status(), await reply.text()).toBe(200);
    const r1 = await recipientOf(offerId, sub.id);
    expect(r1.paused_at).toBeNull();
    const added = new Date(r1.expires_at).getTime() - new Date(r0.expires_at).getTime();
    expect(Math.abs(added - 2 * 3_600_000)).toBeLessThan(60_000);
    const answered = await rest<Array<{ status: string; admin_reply: string; admin_reply_attachments: unknown[] }>>('GET', `offer_responses?select=*&id=eq.${question.id}`);
    expect(answered[0]).toMatchObject({ status: 'replied', admin_reply: 'Yes, very.' });
    expect(answered[0].admin_reply_attachments).toHaveLength(1);
  });

  test('BD7: a decline opens a call task in the inbox; logging the call closes it', async () => {
    const { token, offerId, sub } = await oneOffer(api, 'bd7');
    const ip = ipFor('bd7');
    expect((await act(api, token, { action: 'decline', reason: 'pay_too_low', note: 'Need more' }, ip)).status()).toBe(200);
    const [call] = await rest<Array<{ id: string; status: string }>>('GET', `decline_calls?select=*&sub_id=eq.${sub.id}`);
    expect(call.status).toBe('open');

    const inbox = await (await api.get('/api/admin/offers/responses')).json();
    const task = inbox.declineCalls.find((c: { id: string }) => c.id === call.id);
    expect(task.sub.business_name).toBe(sub.business_name);
    expect(task.sub.phone).toBe('(973) 555-0177');
    expect(task.reason).toBe('pay_too_low');
    expect(task.offer.id).toBe(offerId);

    const logged = await api.patch(`/api/admin/offers/decline-calls/${call.id}`, { data: { counter_cents: 175000, will_take: true, reason_text: 'Doors are bigger than usual' } });
    expect(logged.status(), await logged.text()).toBe(200);
    const [done] = await rest<Array<{ status: string; counter_cents: number; will_take: boolean; called_at: string }>>('GET', `decline_calls?select=*&id=eq.${call.id}`);
    expect(done).toMatchObject({ status: 'done', counter_cents: 175000, will_take: true });
    expect(done.called_at).not.toBeNull();
    // Logged once.
    expect((await api.patch(`/api/admin/offers/decline-calls/${call.id}`, { data: { will_take: false } })).status()).toBe(409);
  });

  test('BD8: the cron expires offers nobody accepted, flags the request, and never expires a paused sub', async () => {
    const stale = await oneOffer(api, 'bd8 stale');
    const paused = await oneOffer(api, 'bd8 paused');
    const past = new Date(Date.now() - 60_000).toISOString();
    for (const o of [stale, paused]) {
      await rest('PATCH', `job_offers?id=eq.${o.offerId}`, { expires_at: past });
      await rest('PATCH', `offer_recipients?offer_id=eq.${o.offerId}`, { expires_at: past });
    }
    await rest('PATCH', `offer_recipients?offer_id=eq.${paused.offerId}`, { paused_at: past });
    // A counter still waiting when the offer dies (D3).
    const [staleRcpt] = await rest<Array<{ id: string }>>('GET', `offer_recipients?select=id&offer_id=eq.${stale.offerId}&sub_id=eq.${stale.sub.id}`);
    await rest('POST', 'offer_responses', [{ offer_id: stale.offerId, recipient_id: staleRcpt.id, sub_id: stale.sub.id, type: 'counter', counter_cents: 150000, status: 'pending' }]);

    expect((await api.get('/api/cron/offers-expire', { headers: { Authorization: 'Bearer wrong' } })).status()).toBe(401);
    const run = await api.get('/api/cron/offers-expire', { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
    expect(run.status(), await run.text()).toBe(200);
    const body = await run.json();
    expect(body.expiredOffers).toContain(stale.offerId);
    // D1: the push retry step runs every time and does nothing while SpecNook is not connected.
    expect(body.pushes).toEqual({ configured: false, attempted: 0, sent: 0, failed: 0 });
    const [counter] = await rest<Array<{ status: string }>>('GET', `offer_responses?select=status&offer_id=eq.${stale.offerId}&type=eq.counter`);
    expect(counter.status).toBe('closed');

    const offers = await rest<Array<{ id: string; status: string }>>('GET', `job_offers?select=id,status&id=in.(${stale.offerId},${paused.offerId})`);
    expect(offers.find((o) => o.id === stale.offerId)!.status).toBe('expired');
    expect(offers.find((o) => o.id === paused.offerId)!.status).toBe('open');
    expect((await recipientOf(stale.offerId, stale.sub.id)).closed_reason).toBe('expired');
    expect((await recipientOf(paused.offerId, paused.sub.id)).closed_reason).toBeNull();
    const req = (await rest<RequestRow[]>('GET', `home_service_requests?select=*&id=eq.${stale.request.id}`))[0];
    expect(req.admin_notes).toContain('Offer expired with no acceptance - adjust pay and resend');
  });

  test('BD9: two subs accepting at once - exactly one wins, the other is closed as taken', async ({ page }) => {
    const request = await seedRequest('bd9');
    const a = await createSub(api, { name: 'bd9 alpha' });
    const b = await createSub(api, { name: 'bd9 bravo', language: 'es' });
    const res = await sendOffers(api, request.id, [{ trade: 'cabinet_painting', sub_pay_cents: 140000 }]);
    const offerId = (await res.json()).results[0].offer_id;
    const [ta, tb] = await Promise.all([tokenFor(offerId, a.id), tokenFor(offerId, b.id)]);

    const [ra, rb] = await Promise.all([
      act(api, ta, { action: 'accept' }, ipFor('bd9a')),
      act(api, tb, { action: 'accept' }, ipFor('bd9b')),
    ]);
    const statuses = [ra.status(), rb.status()].sort();
    expect(statuses).toEqual([200, 409]);
    const loserRes = ra.status() === 409 ? ra : rb;
    expect((await loserRes.json()).error).toBe('taken');
    const winner = ra.status() === 200 ? a : b;
    const loser = winner === a ? b : a;

    const offer = (await rest<Array<{ status: string; assigned_sub_id: string; assigned_at: string; specnook_push_status: string }>>('GET', `job_offers?select=*&id=eq.${offerId}`))[0];
    expect(offer).toMatchObject({ status: 'assigned', assigned_sub_id: winner.id, specnook_push_status: 'pending' });
    const rcpts = await recipientsOf(offerId);
    expect(rcpts.find((r) => r.sub_id === loser.id)!.closed_reason).toBe('taken');
    expect(rcpts.find((r) => r.sub_id === winner.id)!.closed_reason).toBeNull();
    const accepts = await rest<unknown[]>('GET', `offer_responses?select=id&offer_id=eq.${offerId}&type=eq.accept`);
    expect(accepts).toHaveLength(1);
    expect((await rest<RequestRow[]>('GET', `home_service_requests?select=status&id=eq.${request.id}`))[0].status).toBe('assigned');

    // The loser's page says taken (in their language when Spanish) with no buttons; the winner sees the address.
    await openPage(page, loser === b ? tb : ta, ipFor('bd9 page'));
    await expect(page.getByTestId('offer-taken')).toBeVisible();
    await expect(page.getByTestId('offer-accept')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('12 Hidden Street');
    await openPage(page, winner === a ? ta : tb, ipFor('bd9 page2'));
    await expect(page.getByTestId('offer-full-address')).toContainText('12 Hidden Street');
  });

  test('D1: an unconnected push stays pending; Retry says so; the retry path sends it once SpecNook answers', async () => {
    const { token, offerId, request } = await oneOffer(api, 'd1', {}, { notes: 'Gate code 4411' });
    expect((await act(api, token, { action: 'accept' }, ipFor('d1'))).status()).toBe(200);
    const pushOf = async () => (await rest<Array<{ specnook_push_status: string }>>('GET', `job_offers?select=specnook_push_status&id=eq.${offerId}`))[0].specnook_push_status;
    expect(await pushOf()).toBe('pending');

    // The dev server has no SpecNook keys: the admin Retry refuses and says why.
    const retry = await api.post(`/api/admin/offers/${offerId}`, { data: { action: 'retry_push' } });
    expect(retry.status()).toBe(409);
    expect((await retry.json()).error).toContain('SpecNook is not connected');

    // The same retry code, run here against a mock SpecNook.
    const received: Array<{ path: string; body: Record<string, unknown>; auth: string }> = [];
    let answer = 503;
    const server: Server = createServer((req, res) => {
      let data = '';
      req.on('data', (c) => { data += c; });
      req.on('end', () => {
        received.push({ path: req.url ?? '', body: data ? JSON.parse(data) : {}, auth: req.headers.authorization ?? '' });
        res.writeHead(answer, { 'Content-Type': 'application/json' }).end('{}');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    const saved = { ...process.env };
    Object.assign(process.env, {
      NEXT_PUBLIC_SUPABASE_URL: SB_URL, SUPABASE_SECRET_KEY: SB_KEY,
      SPECNOOK_API_URL: `http://127.0.0.1:${port}`, SPECNOOK_API_KEY: 'mock-key',
    });
    try {
      expect(await retrySpecNookPushes({ offerIds: [offerId] })).toEqual({ configured: true, attempted: 1, sent: 0, failed: 1 });
      expect(await pushOf()).toBe('failed');
      answer = 201;
      expect(await retrySpecNookPushes({ offerIds: [offerId] })).toEqual({ configured: true, attempted: 1, sent: 1, failed: 0 });
      expect(await pushOf()).toBe('sent');
      // Sent once: a sent push is not retried.
      expect(await retrySpecNookPushes({ offerIds: [offerId] })).toMatchObject({ attempted: 0 });
    } finally {
      process.env = saved;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    expect(received).toHaveLength(2);
    expect(received[1].path).toBe('/jobs');
    expect(received[1].auth).toBe('Bearer mock-key');
    expect(received[1].body).toMatchObject({ offerId, address: { street: '12 Hidden Street', town: 'Montclair', zip: '07042' }, subPayCents: 140000 });
    expect(JSON.stringify(received[1].body)).not.toContain('4411');
    const [after] = await rest<RequestRow[]>('GET', `home_service_requests?select=admin_notes&id=eq.${request.id}`);
    expect(after.admin_notes).toContain('SpecNook push sent for Cabinet painting (retry).');
  });

  test('D3: when an offer is assigned or withdrawn its pending counters and questions close and leave the inbox', async () => {
    const request = await seedRequest('d3');
    const counterSub = await createSub(api, { name: 'd3 counter' });
    const askSub = await createSub(api, { name: 'd3 asker' });
    const winSub = await createSub(api, { name: 'd3 winner' });
    const sent = await sendOffers(api, request.id, [{ trade: 'cabinet_painting', sub_pay_cents: 140000 }]);
    const offerId = (await sent.json()).results[0].offer_id;
    const ip = ipFor('d3');
    expect((await act(api, await tokenFor(offerId, counterSub.id), { action: 'counter', price: 1500 }, ip)).status()).toBe(200);
    expect((await api.post(`/api/offers/${await tokenFor(offerId, askSub.id)}`, { headers: { 'x-real-ip': ip }, multipart: { action: 'details', text: 'Paint brand?' } })).status()).toBe(200);
    const mine = await rest<Array<{ id: string; status: string }>>('GET', `offer_responses?select=id,status&offer_id=eq.${offerId}`);
    let inbox = await (await api.get('/api/admin/offers/responses')).json();
    const ids = (list: Array<{ id: string }>) => list.map((x) => x.id);
    for (const r of mine) expect([...ids(inbox.counters), ...ids(inbox.details)]).toContain(r.id);

    expect((await act(api, await tokenFor(offerId, winSub.id), { action: 'accept' }, ip)).status()).toBe(200);
    const after = await rest<Array<{ id: string; type: string; status: string }>>('GET', `offer_responses?select=id,type,status&offer_id=eq.${offerId}&type=in.(counter,details)`);
    expect(after.map((r) => r.status)).toEqual(['closed', 'closed']);
    inbox = await (await api.get('/api/admin/offers/responses')).json();
    for (const r of after) {
      expect([...ids(inbox.counters), ...ids(inbox.details)]).not.toContain(r.id);
      expect(ids(inbox.closed)).toContain(r.id);
    }

    // Withdrawn: the same.
    const second = await seedRequest('d3 withdraw');
    const s2 = await createSub(api, { name: 'd3 second' });
    const sent2 = await sendOffers(api, second.id, [{ trade: 'cabinet_painting', sub_pay_cents: 140000 }]);
    const offer2 = (await sent2.json()).results[0].offer_id;
    expect((await act(api, await tokenFor(offer2, s2.id), { action: 'counter', price: 1450 }, ip)).status()).toBe(200);
    expect((await api.post(`/api/admin/offers/${offer2}`, { data: { action: 'cancel' } })).status()).toBe(200);
    const [c2] = await rest<Array<{ status: string }>>('GET', `offer_responses?select=status&offer_id=eq.${offer2}&type=eq.counter`);
    expect(c2.status).toBe('closed');
  });

  test('D4: attachments are capped at 3.5 MB a file and 4 MB a body with a 413, and photos are shrunk in the browser', async ({ page }) => {
    const { token, offerId, sub } = await oneOffer(api, 'd4');
    const ip = ipFor('d4');
    const pdf = (bytes: number) => Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(bytes - 9, 0x20)]);
    const oneBig = await api.post(`/api/offers/${token}`, { headers: { 'x-real-ip': ip }, multipart: { action: 'details', text: 'plan', files: { name: 'plan.pdf', mimeType: 'application/pdf', buffer: pdf(3.6 * 1024 * 1024) } } });
    expect(oneBig.status()).toBe(413);
    expect(await oneBig.json()).toMatchObject({ error: 'file_too_big', message: expect.stringContaining('3.5 MB') });
    const tooMuch = await api.post(`/api/offers/${token}`, { headers: { 'x-real-ip': ip }, multipart: { action: 'details', text: 'plans', files: { name: 'plans.pdf', mimeType: 'application/pdf', buffer: pdf(4.2 * 1024 * 1024) } } });
    expect(tooMuch.status()).toBe(413);
    expect(await tooMuch.json()).toMatchObject({ error: 'body_too_big', message: expect.stringContaining('4 MB') });
    // Nothing was stored by either.
    expect(await rest<unknown[]>('GET', `offer_responses?select=id&offer_id=eq.${offerId}`)).toHaveLength(0);

    // Through the page, a 2400 x 1800 PNG arrives as a JPEG no wider than 1600 px.
    await openPage(page, token, ip);
    await page.getByTestId('offer-respond').click();
    await page.getByTestId('offer-open-details').click();
    await page.getByLabel('What do you need to know?').fill('Here is the kitchen');
    const png = gradientPng(2400, 1800);
    await page.locator('#offer-details-files').setInputFiles([{ name: 'kitchen.png', mimeType: 'image/png', buffer: png }]);
    await page.getByTestId('offer-details-submit').click();
    await expect(page.getByTestId('offer-notices')).toContainText('Your question is with Alex.');
    const [row] = await rest<Array<{ attachments: Array<{ storage_path: string; content_type: string; bytes: number; name: string }> }>>(
      'GET', `offer_responses?select=attachments&offer_id=eq.${offerId}&sub_id=eq.${sub.id}&type=eq.details`);
    const att = row.attachments[0];
    expect(att.content_type).toBe('image/jpeg');
    expect(att.name).toBe('kitchen.jpg');
    expect(att.bytes).toBeLessThan(png.length);
    const stored = Buffer.from(await (await fetch(`${SB_URL}/storage/v1/object/service-request-photos/${att.storage_path}`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    })).arrayBuffer());
    expect(jpegSize(stored)).toEqual({ width: 1600, height: 1200 });
  });

  test('D7: a two-trade request stays bid_sent until both trades are assigned', async () => {
    const request = await seedRequest('d7', { services: ['cabinet-repainting', 'gutter-cleaning'] });
    const painter = await createSub(api, { name: 'd7 painter' });
    const gutters = await createSub(api, { name: 'd7 gutters', trades: ['gutter_cleaning'] });
    const sent = await sendOffers(api, request.id, [
      { trade: 'cabinet_painting', sub_pay_cents: 140000 },
      { trade: 'gutter_cleaning', sub_pay_cents: 15000 },
    ]);
    const results = (await sent.json()).results as Array<{ trade: string; offer_id: string }>;
    const paintOffer = results.find((r) => r.trade === 'cabinet_painting')!.offer_id;
    const gutterOffer = results.find((r) => r.trade === 'gutter_cleaning')!.offer_id;
    const ip = ipFor('d7');

    expect((await act(api, await tokenFor(paintOffer, painter.id), { action: 'accept' }, ip)).status()).toBe(200);
    let [row] = await rest<RequestRow[]>('GET', `home_service_requests?select=status,admin_notes&id=eq.${request.id}`);
    expect(row.status).toBe('bid_sent');
    expect(row.admin_notes).toContain('Still out: Gutter cleaning.');
    const detail = await (await api.get(`/api/admin/service-requests/${request.id}`)).json();
    expect(detail.trade_state).toEqual(expect.arrayContaining([
      { trade: 'cabinet_painting', status: 'assigned' },
      { trade: 'gutter_cleaning', status: 'open' },
    ]));

    expect((await act(api, await tokenFor(gutterOffer, gutters.id), { action: 'accept' }, ip)).status()).toBe(200);
    [row] = await rest<RequestRow[]>('GET', `home_service_requests?select=status,admin_notes&id=eq.${request.id}`);
    expect(row.status).toBe('assigned');
  });

  test('OF6: a Spanish-speaking sub gets the whole page in Spanish', async ({ page }) => {
    const { token } = await oneOffer(api, 'of6', { language: 'es' });
    await openPage(page, token, ipFor('of6'));
    await expect(page.locator('h1')).toHaveText('Oferta de trabajo de La Vaca');
    // D6: the browser title and the job lines in the sub's language too.
    await expect(page).toHaveTitle(/^Oferta de trabajo de La Vaca/);
    await expect(page.getByTestId('offer-scope')).toContainText('26 a 40');
    await expect(page.getByTestId('offer-scope')).not.toContainText('26 to 40');
    await expect(page.getByText('Su pago')).toBeVisible();
    await expect(page.getByText('Pintura de gabinetes').first()).toBeVisible();
    await expect(page.getByTestId('offer-countdown')).toContainText(/Quedan \d+h \d+m/);
    await expect(page.getByTestId('offer-accept')).toHaveText('Aceptar este trabajo');
    await page.getByTestId('offer-respond').click();
    await expect(page.getByTestId('offer-open-counter')).toHaveText('Dar mi precio');
    await expect(page.getByTestId('offer-open-details')).toHaveText('Necesito más detalles');
    await expect(page.getByTestId('offer-open-decline')).toHaveText('Rechazar');
    await page.getByTestId('offer-open-decline').click();
    await expect(page.getByText('Pago muy bajo')).toBeVisible();
    await expect(page.locator('main')).toHaveAttribute('lang', 'es');
  });

  test('SEC1: the offer route caps bodies, validates, limits by token, and never echoes server detail', async () => {
    const { token } = await oneOffer(api, 'sec1');
    const ip = ipFor('sec1');
    const big = await api.post(`/api/offers/${token}`, { headers: { 'x-real-ip': ip, 'Content-Type': 'application/json' }, data: JSON.stringify({ action: 'counter', price: 1, note: 'x'.repeat(20_000) }) });
    expect(big.status()).toBe(413);
    const junk = await api.post(`/api/offers/${token}`, { headers: { 'x-real-ip': ip, 'Content-Type': 'application/json' }, data: '{not json' });
    expect(junk.status()).toBe(400);
    const unknownAction = await act(api, token, { action: 'delete_everything' }, ip);
    expect(unknownAction.status()).toBe(400);
    expect(JSON.stringify(await unknownAction.json())).not.toMatch(/supabase|postgres|stack/i);
    const noPrice = await act(api, token, { action: 'counter', price: 'lots' }, ip);
    expect((await noPrice.json()).error).toBe('price_required');

    // 20 per token per 10 minutes. Spread over fresh IPs so only the token limit can trip.
    let last = 200;
    for (let i = 0; i < 20 && last !== 429; i += 1) {
      last = (await act(api, token, { action: 'nope' }, ipFor(`sec1-${i}`))).status();
    }
    expect(last).toBe(429);
    expect(await (await act(api, token, { action: 'accept' }, ipFor('sec1-after'))).json()).toEqual({ error: 'rate_limited' });
  });
});
